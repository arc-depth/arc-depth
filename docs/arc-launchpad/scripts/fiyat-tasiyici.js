"use strict";
/* ===========================================================================
 * fiyat-tasiyici.js — carry home prices to the chains where a twin trades
 *
 *   node scripts/fiyat-tasiyici.js            # report only
 *   node scripts/fiyat-tasiyici.js --uygula   # send the stale ones
 *
 * FiyatAgi (one address on nine chains) moves a token's home-pool price to
 * another chain, where the twin pool's hook and opener read it. Nothing
 * sends it by itself. This does, and only where it matters:
 *   - a line is (token, home chain, target chain) where a twin pool exists
 *     on the target (IkizHavuzFabrika.aciciOf(twin) != 0) — a price nobody
 *     reads is a fee for nothing
 *   - it is sent when the home price differs from the price filed on the
 *     target by more than ESIK_PPM (1%), or the filed one is missing
 * Every send pays the real LayerZero quote from the deployer's gas on the
 * home chain. Log: rapor/fiyat-tasiyici.log.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, solidityPacked } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const AG = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const HAVUZ = fs.existsSync(path.join(KOK, "dagitim-ikiz-havuz-ag.json")) ? JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ikiz-havuz-ag.json"), "utf8")) : {};
const ANALITIK = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "analitik.json"), "utf8"));
const LOG = path.join(KOK, "rapor", "fiyat-tasiyici.log");
const UYGULA = process.argv.includes("--uygula");
const ESIK_PPM = 10_000n;
const SEC = "0x0003" + solidityPacked(["uint8", "uint16", "uint8", "uint128"], [1, 17, 1, 150_000]).slice(2);
const FIYAT = AG.arc.FiyatAgi, YAYICI = AG.arc.IkizYayici;
const yaz = (o) => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ zaman: new Date().toISOString(), ...o }) + "\n"); };

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const prov = Object.fromEntries(Object.entries(EVM).map(([ad, z]) => [ad, new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true })]));
  const fiyatAbi = ["function kaynak(address) view returns (uint160,address)", "function evFiyati(address) view returns (uint160,uint64)",
    "function ucret(address,uint32,bytes) view returns ((uint256,uint256))", "function gonder(address,uint32,bytes) payable"];
  /* tokens by home chain: launches from the snapshot */
  const hatlar = [];
  for (const z of ANALITIK.zincirler || []) for (const t of z.tokenler || []) hatlar.push({ token: t.token, ev: z.ad, sembol: t.sembol });
  let gonderilen = 0, bakilan = 0;
  for (const h of hatlar) {
    const evF = new Contract(FIYAT, fiyatAbi, prov[h.ev]);
    let evS;
    try { [evS] = await evF.kaynak(h.token); } catch (e) { continue; }
    const ikiz = await new Contract(YAYICI, ["function ikizAdresi(address) view returns (address)"], prov[h.ev]).ikizAdresi(h.token);
    for (const [ad, z] of Object.entries(EVM)) {
      if (ad === h.ev || !HAVUZ[ad] || !HAVUZ[ad].fabrika) continue;
      const acici = await new Contract(HAVUZ[ad].fabrika, ["function aciciOf(address) view returns (address)"], prov[ad]).aciciOf(ikiz).catch(() => "0x0000000000000000000000000000000000000000");
      if (/^0x0+$/.test(acici)) continue;
      bakilan++;
      const [hedefS] = await new Contract(FIYAT, fiyatAbi, prov[ad]).evFiyati(ikiz);
      const fark = hedefS === 0n ? 10n ** 6n : (BigInt(evS) > hedefS ? BigInt(evS) - hedefS : hedefS - BigInt(evS)) * 2n * 1_000_000n / hedefS;
      if (fark <= ESIK_PPM) continue;
      const [ucret] = await evF.ucret(h.token, z.eid, SEC);
      console.log("  " + h.sembol + " " + h.ev + " -> " + ad + "  sapma " + (Number(fark) / 1e4).toFixed(2) + "%  ucret " + Number(ucret) / 1e18);
      if (!UYGULA) { yaz({ token: h.token, ev: h.ev, hedef: ad, fark: fark.toString(), eylem: "kuru" }); continue; }
      const w = new Wallet(pk, prov[h.ev]);
      const t = await new Contract(FIYAT, fiyatAbi, w).gonder(h.token, z.eid, SEC, { value: ucret });
      await t.wait();
      gonderilen++;
      yaz({ token: h.token, ev: h.ev, hedef: ad, fark: fark.toString(), eylem: "gonderildi", tx: t.hash });
    }
  }
  console.log("FIYAT TASIYICI  token " + hatlar.length + ", ikiz havuzlu hat " + bakilan + ", gonderilen " + gonderilen + (UYGULA ? "" : " (kuru)"));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
