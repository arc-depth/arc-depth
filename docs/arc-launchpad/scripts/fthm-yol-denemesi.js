"use strict";
/* ===========================================================================
 * fthm-yol-denemesi.js — a real FTHM round trip on every EVM path not yet
 *                        proven, before the Arc adapter's owner is burned
 *
 *   node scripts/fthm-yol-denemesi.js [zincir,...] [--miktar 1000] [--uygula]
 *
 * Paths: Robinhood, Arbitrum, Ethereum, BNB, Avalanche, Monad, HyperEVM
 * (Base and Solana were proven on 2026-10-14/15, rapor/fthm-tur.json and
 * scripts/sol-tur.js). For each chain: Arc adapter -> twin on that chain,
 * wait for LayerZero DELIVERED, then twin -> Arc with the same amount, wait
 * again. The return leg is paid in that chain's gas token; a chain whose
 * wallet cannot pay it is reported, not skipped silently.
 *
 * Without --uygula nothing is signed and no key is read: only fees, wallet
 * balances and what would be sent. The FTHM moved is the operations FTHM
 * already on the Arc wallet (bought with ops money), never the founder's
 * share. Record: rapor/fthm-yol-denemesi.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, zeroPadValue, parseUnits, formatUnits, solidityPacked } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "rapor", "fthm-yol-denemesi.json");
const UYGULA = process.argv.includes("--uygula");
const ARGS = process.argv.slice(2);
const MI = ARGS.indexOf("--miktar");
const MIKTAR = parseUnits(MI >= 0 ? ARGS[MI + 1] : "1000", 18);
const SECIM = (ARGS.find((a, i) => !a.startsWith("--") && ARGS[i - 1] !== "--miktar") || "").split(",").filter(Boolean);
const YOLLAR = ["robinhood", "arbitrum", "ethereum", "bsc", "avalanche", "monad", "hyperevm"];
const F = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const ADAPTOR = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const IKIZ = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const BEN = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const ERC = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"];
const OFT = ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
  "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable returns ((bytes32,uint64,(uint256,uint256)),(uint256,uint256))"];
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const saglayici = (z) => new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
/* The twins are ownerless and carry no enforced options toward Arc, so the
 * return leg brings its own executor gas (Arc's adapter credit is a plain
 * transfer; 200k is twice what the outbound leg enforces). */
const DONUS_SECENEK = solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, 200000]);   // type 3, executor lzReceive gas
const parametre = (eid) => [eid, zeroPadValue(BEN, 32), MIKTAR, MIKTAR * 99n / 100n, eid === EVM.arc.eid ? DONUS_SECENEK : "0x", "0x", "0x"];

const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1)); };
const anahtar = () => fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();

async function gonder(w, etiket, tx) {
  const t = await w.sendTransaction(tx);
  let m = null; while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(t.hash).catch(() => null); }
  console.log("  " + etiket.padEnd(28) + t.hash + " durum " + m.status);
  if (m.status !== 1) throw new Error(etiket);
  return m;
}

async function lzBekle(hash, etiket) {
  for (let i = 0; i < 180; i++) {
    const r = await fetch("https://scan.layerzero-api.com/v1/messages/tx/" + hash).then((x) => x.json()).catch(() => null);
    const m = r && r.data && r.data[0];
    const d = m && m.status && m.status.name;
    if (i % 6 === 0) console.log("  " + etiket + " LZ durum " + d);
    if (d === "DELIVERED") return;
    if (d === "FAILED" || d === "BLOCKED") throw new Error(etiket + " " + d);
    await bekle(10000);
  }
  throw new Error(etiket + " zaman asimi");
}

(async () => {
  const arcP = saglayici(EVM.arc);
  const fthm = new Contract(F.token, ERC, arcP);
  const adaptor = new Contract(ADAPTOR, OFT, arcP);
  const yollar = SECIM.length ? SECIM : YOLLAR;
  const arcFthm = await fthm.balanceOf(BEN);
  const arcUsdc = await arcP.getBalance(BEN);
  console.log("Arc cuzdan  FTHM " + formatUnits(arcFthm, 18) + "  USDC(gaz) " + formatUnits(arcUsdc, 18) +
    "\nyol basina " + formatUnits(MIKTAR, 18) + " FTHM, " + yollar.length + " yol" + (UYGULA ? "" : "  (kuru)"));
  if (arcFthm < MIKTAR * BigInt(yollar.length)) throw new Error("Arc cuzdaninda yeterli FTHM yok");

  const plan = [];
  let toplamUsdc = 0n;
  for (const ad of yollar) {
    const z = EVM[ad];
    if (!z) throw new Error("bilinmeyen zincir " + ad);
    const p = saglayici(z);
    const satir = { ad, gaz: z.gaz };
    try {
      [satir.gidis] = await adaptor.quoteSend(parametre(z.eid), false);
      toplamUsdc += satir.gidis;
      satir.yerel = await p.getBalance(BEN);
      [satir.donus] = await new Contract(IKIZ, OFT, p).quoteSend(parametre(EVM.arc.eid), false);
      const fd = await p.getFeeData();
      /* an OFT send has used 200-300k gas on these chains; 400k leaves room */
      satir.donusGaz = satir.donus + 400_000n * (fd.maxFeePerGas || fd.gasPrice);
      satir.donebilir = satir.yerel >= satir.donusGaz;
    } catch (e) { satir.hata = (e.shortMessage || e.message).slice(0, 120); }
    plan.push(satir);
    console.log(("\n" + z.ad).padEnd(12) + (satir.hata ? "  HATA " + satir.hata :
      "  gidis " + formatUnits(satir.gidis, 18) + " USDC" +
      "  | donus " + Number(formatUnits(satir.donusGaz, 18)).toPrecision(3) + " " + z.gaz +
      "  cuzdan " + Number(formatUnits(satir.yerel, 18)).toPrecision(3) + " " + z.gaz +
      (satir.donebilir ? "  OK" : "  DONUS ICIN GAZ YOK")));
  }
  console.log("\ntoplam gidis ucreti " + formatUnits(toplamUsdc, 18) + " USDC (Arc cuzdaninda " + formatUnits(arcUsdc, 18) + ")");
  if (!UYGULA) return;
  if (arcUsdc < toplamUsdc + parseUnits("0.5", 18)) throw new Error("Arc'ta gidis ucretleri icin USDC yetmiyor");

  const pk = anahtar();
  const arcW = new Wallet(pk, arcP);
  const f = fthm.connect(arcW);
  const a = adaptor.connect(arcW);
  const gerek = MIKTAR * BigInt(plan.filter((s) => !s.hata).length);
  if ((await fthm.allowance(BEN, ADAPTOR)) < gerek) await gonder(arcW, "FTHM adaptor onay", await f.approve.populateTransaction(ADAPTOR, gerek));

  for (const s of plan) {
    if (s.hata) continue;
    const z = EVM[s.ad];
    const r = (k[s.ad] = k[s.ad] || {});
    try {
      /* a run cut off after sending: wait on that message, never send twice */
      if (!r.gidisTeslim && r.gidisTx) {
        await lzBekle(r.gidisTx, "Arc->" + z.ad + " (onceki)");
        r.gidisTeslim = new Date().toISOString(); yaz();
      }
      if (!r.gidisTeslim) {
        const m = await gonder(arcW, "Arc->" + z.ad, { ...(await a.send.populateTransaction(parametre(z.eid), [s.gidis, 0], BEN)), value: s.gidis });
        r.gidisTx = m.hash; yaz();
        await lzBekle(m.hash, "Arc->" + z.ad);
        r.gidisTeslim = new Date().toISOString(); yaz();
      }
      if (!s.donebilir) { r.donus = "gaz yok"; yaz(); console.log("  " + z.ad + " -> Arc atlandi: cuzdanda donus gazi yok"); continue; }
      if (!r.donusTeslim && r.donusTx) {
        await lzBekle(r.donusTx, z.ad + "->Arc (onceki)");
        r.donusTeslim = new Date().toISOString(); r.donus = "TESLIM"; yaz();
      }
      if (!r.donusTeslim) {
        const w = new Wallet(pk, saglayici(z));
        const ikiz = new Contract(IKIZ, OFT, w);
        const [ucret] = await ikiz.quoteSend(parametre(EVM.arc.eid), false);
        const m = await gonder(w, z.ad + "->Arc", { ...(await ikiz.send.populateTransaction(parametre(EVM.arc.eid), [ucret, 0], BEN)), value: ucret });
        r.donusTx = m.hash; yaz();
        await lzBekle(m.hash, z.ad + "->Arc");
        r.donusTeslim = new Date().toISOString(); r.donus = "TESLIM"; yaz();
      }
    } catch (e) { r.hata = (e.shortMessage || e.message).slice(0, 200); yaz(); console.log("  " + z.ad + " HATA " + r.hata); }
  }
  console.log("\nozet:");
  for (const ad of Object.keys(k)) console.log("  " + ad.padEnd(10) + " gidis " + (k[ad].gidisTeslim ? "TESLIM" : "-") + "  donus " + (k[ad].donus || "-") + (k[ad].hata ? "  hata " + k[ad].hata : ""));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
