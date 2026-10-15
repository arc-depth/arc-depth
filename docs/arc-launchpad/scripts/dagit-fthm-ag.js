"use strict";
/* ===========================================================================
 * dagit-fthm-ag.js — FTHM on all nine chains, and the price network set up
 *
 *   node scripts/dagit-fthm-ag.js            # dry: reads and prices, sends nothing
 *   node scripts/dagit-fthm-ag.js --uygula
 *
 * 1. FTHM's twin on the eight chains other than Arc, through the network's
 *    IkizOFTFabrikaAg: karsidaKur(FTHM, Arc, FTHMOFTAdapter, "Fathom", "FTHM").
 *    One address everywhere; peers (Arc adapter + the other seven twins) and
 *    two required DVNs are fixed in its constructor, no owner. The first
 *    Robinhood FTHMOFT (0x19c9…, zero supply, never used) is superseded.
 * 2. The Arc FTHMOFTAdapter (still owned by the deployer — kept owned until
 *    Solana, Aptos and Sui are wired, then burned) is pointed at the twin on
 *    all eight eids, with the same two-DVN config the network uses
 *    (ZincirTablosu numbers) and enforced gas: 100k for a transfer, 150k +
 *    500k compose for a transfer that sells on arrival.
 * 3. FiyatAgi.kur on each chain, once: PoolManager, the local launchpad,
 *    dollar decimals 6 (BNB's launchpad dollar is Dolar6), and on Arc the
 *    FTHM pool so the Arc price can be sent.
 * Everything is read first and skipped when already done. Record:
 * dagitim-fthm-ag.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, AbiCoder, zeroPadValue, solidityPacked, getAddress } = require("ethers");
const { EVM, dvnDoldur } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-fthm-ag.json");
const AG = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const FATHOM = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const P2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8")).arc;
const RHD = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood;
dvnDoldur(JSON.parse(fs.readFileSync(path.join(KOK, "rapor", "lz-dvns.json"), "utf8")));
const coder = AbiCoder.defaultAbiCoder();
const A = (x) => getAddress(String(x).toLowerCase());
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const UYGULA = process.argv.includes("--uygula");

const FTHM = FATHOM.token;
const ADAPTER = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const OFAB = AG.arc.IkizOFTFabrikaAg;
const FIYAT = AG.arc.FiyatAgi;
const ONAY = { 5042: 5, 4663: 20, 8453: 10, 42161: 20, 1: 15, 56: 20, 43114: 12, 143: 10, 999: 10 };
const ULN = "tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)";

function ozelAnahtar() {
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try { const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m); if (m) return m[1].trim(); } catch (e) { /* next */ }
  }
  return null;
}
async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) {
      const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {});
      if (d > 7 || !/rate|limit|timeout|503|502|429|ECONNRESET|fetch failed|could not coalesce|missing response/i.test(m)) throw e;
      await bekle(2500 * (d + 1));
    }
  }
}
const sec = {
  alim: (g) => solidityPacked(["uint8", "uint16", "uint8", "uint128"], [1, 17, 1, g]),
  bileske: (g) => solidityPacked(["uint8", "uint16", "uint8", "uint16", "uint128"], [1, 19, 3, 0, g]),
};
const tip3 = (...p) => "0x0003" + p.map((x) => x.slice(2)).join("");

(async () => {
  const pk = ozelAnahtar();
  const D = new Wallet(pk).address;
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1)); };
  const ag = (z) => { const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true }); return { p, w: new Wallet(pk, p) }; };

  const arc = ag(EVM.arc);
  const ofab = new Contract(OFAB, ["function ikizAdresi(address,uint32,address,string,string) view returns (address)",
    "function karsidaKur(address,uint32,address,string,string) returns (address)"], arc.p);
  const IKIZ = await israr(() => ofab.ikizAdresi(FTHM, 30417, ADAPTER, "Fathom", "FTHM"));
  k.fthmIkiz = IKIZ;
  console.log("FTHM AG  " + (UYGULA ? "UYGULA" : "KURU") + "   ikiz (8 zincir) " + IKIZ);

  async function gonder(z, a, etiket, tx) {
    if (!UYGULA) {
      let g; try { g = "gaz " + (await israr(() => a.p.estimateGas({ from: D, ...tx }))); } catch (e) { g = "olculemedi: " + (e.shortMessage || e.message).slice(0, 70); }
      console.log("     (kuru) " + etiket.padEnd(30) + g); return null;
    }
    if (z.chainId === 999) {
      tx.gasPrice = BigInt(await israr(() => a.p.send("eth_bigBlockGasPrice", []))) * 12n / 10n; tx.type = 0;
      try { tx.gasLimit = (await israr(() => a.p.estimateGas({ from: D, ...tx }))) * 13n / 10n; } catch (e) { tx.gasLimit = 6_000_000n; }
    }
    const t = await israr(() => a.w.sendTransaction(tx));
    let m = null; while (!m) { await bekle(1500); m = await israr(() => a.p.getTransactionReceipt(t.hash)); }
    if (m.status !== 1) throw new Error(etiket + " basarisiz " + t.hash);
    console.log("     " + etiket.padEnd(30) + t.hash + "  gaz " + m.gasUsed);
    return m;
  }

  /* 1. twins */
  for (const [ad, z] of Object.entries(EVM)) {
    if (ad === "arc") continue;
    const a = ag(z);
    const kod = await israr(() => a.p.getCode(IKIZ));
    if (kod.length > 2) { console.log("  " + z.ad.padEnd(10) + "FTHM ikizi zincirde"); continue; }
    console.log("  " + z.ad);
    const of = new Contract(OFAB, ["function karsidaKur(address,uint32,address,string,string) returns (address)"], a.w);
    await gonder(z, a, "FTHM ikizi", await of.karsidaKur.populateTransaction(FTHM, 30417, ADAPTER, "Fathom", "FTHM"));
    if (UYGULA) {
      for (let i = 0; i < 20 && (await israr(() => a.p.getCode(IKIZ))).length <= 2; i++) await bekle(3000);
      k[ad] = { ...(k[ad] || {}), fthm: IKIZ }; yaz();
    }
  }

  /* 2. Arc adapter wiring */
  console.log("  Arc FTHMOFTAdapter " + ADAPTER);
  const adp = new Contract(ADAPTER, ["function peers(uint32) view returns (bytes32)", "function setPeer(uint32,bytes32)",
    "function enforcedOptions(uint32,uint16) view returns (bytes)", "function setEnforcedOptions((uint32,uint16,bytes)[])"], arc.w);
  const ep = new Contract(A(EVM.arc.endpoint), ["function getConfig(address,address,uint32,uint32) view returns (bytes)",
    "function setConfig(address,address,(uint32,uint32,bytes)[])"], arc.w);
  const d0d1 = [EVM.arc.dvn.lzLabs, EVM.arc.dvn.nethermind].map(A).sort((x, y) => (BigInt(x) < BigInt(y) ? -1 : 1));
  const uln = (n) => coder.encode([ULN], [[n, 2, 0, 0, d0d1, []]]);
  const gid = [], gel = [], zorunlu = [];
  for (const [ad, z] of Object.entries(EVM)) {
    if (ad === "arc") continue;
    if ((await israr(() => adp.peers(z.eid))).toLowerCase() !== zeroPadValue(IKIZ, 32).toLowerCase())
      await gonder(EVM.arc, arc, "setPeer " + z.ad, await adp.setPeer.populateTransaction(z.eid, zeroPadValue(IKIZ, 32)));
    if ((await israr(() => ep.getConfig(ADAPTER, A(EVM.arc.sendLib), z.eid, 2))).toLowerCase() !== uln(ONAY[5042]).toLowerCase())
      gid.push([z.eid, 2, uln(ONAY[5042])]);
    if ((await israr(() => ep.getConfig(ADAPTER, A(EVM.arc.recvLib), z.eid, 2))).toLowerCase() !== uln(ONAY[z.chainId]).toLowerCase())
      gel.push([z.eid, 2, uln(ONAY[z.chainId])]);
    const e1 = tip3(sec.alim(100_000)), e2 = tip3(sec.alim(150_000), sec.bileske(500_000));
    if ((await israr(() => adp.enforcedOptions(z.eid, 1))).toLowerCase() !== e1 || (await israr(() => adp.enforcedOptions(z.eid, 2))).toLowerCase() !== e2)
      zorunlu.push([z.eid, 1, e1], [z.eid, 2, e2]);
  }
  if (gid.length) await gonder(EVM.arc, arc, "DVN gonderim (" + gid.length + " hat)", await ep.setConfig.populateTransaction(ADAPTER, A(EVM.arc.sendLib), gid));
  if (gel.length) await gonder(EVM.arc, arc, "DVN alim (" + gel.length + " hat)", await ep.setConfig.populateTransaction(ADAPTER, A(EVM.arc.recvLib), gel));
  if (zorunlu.length) await gonder(EVM.arc, arc, "zorunlu gaz (" + zorunlu.length / 2 + " hat)", await adp.setEnforcedOptions.populateTransaction(zorunlu));
  if (!gid.length && !gel.length && !zorunlu.length) console.log("     DVN + zorunlu gaz tamam");

  /* 3. FiyatAgi.kur */
  const bosAnahtar = ["0x0000000000000000000000000000000000000000", "0x0000000000000000000000000000000000000000", 0, 0, "0x0000000000000000000000000000000000000000"];
  for (const [ad, z] of Object.entries(EVM)) {
    const a = ag(z);
    const f = new Contract(FIYAT, ["function kuruldu() view returns (bool)",
      "function kur(address,address,uint8,address,address,(address,address,uint24,int24,address))"], a.w);
    if (await israr(() => f.kuruldu())) { console.log("  " + z.ad.padEnd(10) + "FiyatAgi kurulu"); continue; }
    const lp = ad === "arc" ? P2.launchpad : ad === "robinhood" ? RHD.launchpad : AG[ad].PulseLaunchpad;
    const pm = A(z.poolManager);
    const arcAnahtar = [A(FATHOM.usdc), A(FTHM), 0, 60, A(FATHOM.hook)];
    console.log("  " + z.ad + "  FiyatAgi.kur launchpad " + lp);
    await gonder(z, a, "FiyatAgi.kur", await f.kur.populateTransaction(pm, lp, 6,
      ad === "arc" ? FTHM : "0x0000000000000000000000000000000000000000",
      ad === "arc" ? ADAPTER : "0x0000000000000000000000000000000000000000",
      ad === "arc" ? arcAnahtar : bosAnahtar));
  }
  k.zaman = new Date().toISOString(); yaz();
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
