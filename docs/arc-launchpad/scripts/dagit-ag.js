"use strict";
/* ===========================================================================
 * dagit-ag.js — ARC PULSE on every EVM chain: network core + launchpad stack
 *
 *   node scripts/dagit-ag.js <zincir|hepsi>            # dry run, sends nothing
 *   node scripts/dagit-ag.js <zincir|hepsi> --uygula
 *
 * NETWORK CORE (all nine chains, one address each: Arachnid CREATE2, salt 0,
 * identical init code everywhere):
 *   IkizOFTFabrikaAg, IkizFabrikaAg, FiyatAgi, KapiAg, IkizYayici, UzakYurutucuAg (not on Arc)
 * Arc only: DaoElcisiAg, placed by CREATE at a recorded nonce — the
 * executor's address depends on the messenger's and the messenger's on the
 * executor's; the nonce breaks the circle.
 *
 * LAUNCHPAD STACK (chains other than Arc and Robinhood, which have theirs):
 *   [Dolar6 where the dollar is not 6 decimals]  YoneticiFabrika  KasaFabrika
 *   KapaliKayit  PulseFabrika  DevPool(governor = UzakYurutucuAg)
 *   PulseLikiditeKasasi  PulseLaunchpad  PulseHook (CREATE2, 0xACC bits)
 * Same bytecode measured 21/21 on each chain's state by
 * `node scripts/olc-pulse-launch.js --zincir <ad>`.
 *
 * Every step reads the chain first; a stopped run resumes. Record: dagitim-ag.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const {
  JsonRpcProvider, Wallet, AbiCoder, keccak256, getCreateAddress, getCreate2Address, getAddress, Contract,
} = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-ag.json");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const A = (x) => getAddress(String(x).toLowerCase());

const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT0 = "0x" + "00".repeat(32);
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const ARC_GOVERNOR = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8")).governor;
const RH_ESKI_YURUTUCU = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood.uzakYurutucu;
const HOOK_BITLERI = 0xACC, MASKE = (1 << 14) - 1;

const UYGULA = process.argv.includes("--uygula");
const HEDEF = process.argv[2];

function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
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

const ic = (n, tipler, degerler) => B(n).bytecode + (tipler.length ? coder.encode(tipler, degerler).slice(2) : "");
const c2Adres = (init) => getCreate2Address(C2, SALT0, keccak256(init));

function cekirdek(D) {
  const ofabInit = ic("IkizOFTFabrikaAg", [], []);
  const ofab = c2Adres(ofabInit);
  const fabInit = ic("IkizFabrikaAg", ["address"], [ofab]);
  const fab = c2Adres(fabInit);
  const fiyatInit = ic("FiyatAgi", ["address", "address"], [D, fab]);
  const kapiInit = ic("KapiAg", ["address"], [D]);
  const yayiciInit = ic("IkizYayici", ["address"], [fab]);
  return { ofabInit, ofab, fabInit, fab, fiyatInit, fiyat: c2Adres(fiyatInit), kapiInit, kapi: c2Adres(kapiInit),
    yayiciInit, yayici: c2Adres(yayiciInit) };
}

(async () => {
  if (!HEDEF) { console.log("kullanim: node scripts/dagit-ag.js <zincir|hepsi> [--uygula]"); process.exit(1); }
  const pk = ozelAnahtar();
  const kayit = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
  const D = new Wallet(pk).address;
  const K = cekirdek(D);

  const arc = EVM.arc;
  const arcP = new JsonRpcProvider(arc.rpc, arc.chainId, { staticNetwork: true });
  kayit.arc = kayit.arc || {};
  if (!kayit.arc.DaoElcisiAg && kayit.arc.daoElcisiNonce == null) {
    const n = await israr(() => arcP.getTransactionCount(D, "pending"));
    kayit.arc.daoElcisiTahmin = getCreateAddress({ from: D, nonce: n });
    kayit.arc.daoElcisiNonce = n;
    yaz();
  }
  const arcElci = kayit.arc.DaoElcisiAg || kayit.arc.daoElcisiTahmin;
  K.yurutucuInit = ic("UzakYurutucuAg", ["address"], [arcElci]);
  K.yurutucu = c2Adres(K.yurutucuInit);

  console.log("AG DAGITIMI  " + (UYGULA ? "UYGULA — GERCEK ISLEM" : "KURU") + "   dagitici " + D);
  console.log("  IkizOFTFabrikaAg " + K.ofab + "   IkizFabrikaAg " + K.fab);
  console.log("  FiyatAgi " + K.fiyat + "   KapiAg " + K.kapi + "   UzakYurutucuAg " + K.yurutucu + "   IkizYayici " + K.yayici);
  console.log("  Arc DaoElcisiAg " + arcElci + (kayit.arc.DaoElcisiAg ? "" : "  (nonce " + kayit.arc.daoElcisiNonce + ")"));

  const zincirler = HEDEF === "hepsi" ? Object.keys(EVM) : HEDEF.split(",");
  for (const ad of zincirler) {
    const z = EVM[ad];
    if (!z) { console.log("bilinmeyen zincir " + ad); continue; }
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    const w = new Wallet(pk, p);
    const r = (kayit[ad] = kayit[ad] || {});
    const kod = async (a) => !!a && (await israr(() => p.getCode(a))).length > 2;
    /* Public RPCs sit behind load balancers: the node that served the
       receipt can be ahead of the one asked for the code. After a send,
       "no code yet" is retried for a while before it is believed. */
    const kodBekle = async (a) => { for (let i = 0; i < 20; i++) { if (await kod(a)) return true; await bekle(3000); } return false; };
    const once = await israr(() => p.getBalance(D));
    console.log("\n" + z.ad.toUpperCase() + "  bakiye " + (Number(once) / 1e18).toPrecision(4) + " " + z.gaz);

    const gonder = async (etiket, tx) => {
      if (!UYGULA) {
        let g;
        try { g = "gaz " + (await israr(() => p.estimateGas({ from: D, ...tx }))); }
        catch (e) { g = "gaz olculemedi (" + (e.shortMessage || e.message).slice(0, 60) + ")"; }
        console.log("     (kuru) " + etiket.padEnd(22) + g);
        return null;
      }
      /* HyperEVM: this deployer is switched to big blocks (scripts/
         hyperevm-buyuk-blok.js); big blocks have their own price, read with
         eth_bigBlockGasPrice, and a contract above the small-block limit
         needs its gas limit stated rather than estimated against 2M. */
      if (z.chainId === 999) {
        tx.gasPrice = BigInt(await israr(() => p.send("eth_bigBlockGasPrice", []))) * 12n / 10n;
        tx.type = 0;
        try { tx.gasLimit = (await israr(() => p.estimateGas({ from: D, ...tx }))) * 13n / 10n; } catch (e) { tx.gasLimit = 6_000_000n; }
      }
      const t = await israr(() => w.sendTransaction(tx));
      let m = null;
      while (!m) { await bekle(1500); m = await israr(() => p.getTransactionReceipt(t.hash)); }
      if (m.status !== 1) throw new Error(etiket + " basarisiz " + t.hash);
      console.log("     " + etiket.padEnd(22) + t.hash + "  gaz " + m.gasUsed);
      return m;
    };
    const c2Kur = async (etiket, init, adres) => {
      if (await kod(adres)) { console.log("     " + etiket.padEnd(22) + adres + "  (zincirde)"); r[etiket] = adres; return; }
      await gonder(etiket, { to: C2, data: SALT0 + init.slice(2) });
      if (UYGULA) {
        if (!(await kodBekle(adres))) throw new Error(etiket + " beklenen adreste yok " + adres);
        r[etiket] = adres; yaz();
        console.log("     " + "".padEnd(22) + "-> " + adres);
      }
    };

    /* Arc: the DAO messenger first — its address was taken from the nonce
       read at the start, and any earlier transaction would move it. */
    if (ad === "arc") {
      if (await kod(kayit.arc.DaoElcisiAg)) {
        console.log("     " + "DaoElcisiAg".padEnd(22) + kayit.arc.DaoElcisiAg + "  (zincirde)");
      } else {
        const n = await israr(() => p.getTransactionCount(D, "pending"));
        if (UYGULA && n !== kayit.arc.daoElcisiNonce) throw new Error("Arc nonce kaydi tutmuyor: " + n + " / " + kayit.arc.daoElcisiNonce);
        const tx = { data: ic("DaoElcisiAg", ["address", "address", "uint32", "address"],
          [ARC_GOVERNOR, K.yurutucu, EVM.robinhood.eid, RH_ESKI_YURUTUCU]) };
        if (UYGULA) tx.nonce = n;
        const m = await gonder("DaoElcisiAg", tx);
        if (m) {
          if (m.contractAddress.toLowerCase() !== kayit.arc.daoElcisiTahmin.toLowerCase()) throw new Error("DaoElcisiAg sapti");
          kayit.arc.DaoElcisiAg = m.contractAddress; yaz();
        }
      }
    }
    await c2Kur("IkizOFTFabrikaAg", K.ofabInit, K.ofab);
    await c2Kur("IkizFabrikaAg", K.fabInit, K.fab);
    await c2Kur("FiyatAgi", K.fiyatInit, K.fiyat);
    await c2Kur("KapiAg", K.kapiInit, K.kapi);
    await c2Kur("IkizYayici", K.yayiciInit, K.yayici);
    if (ad !== "arc") await c2Kur("UzakYurutucuAg", K.yurutucuInit, K.yurutucu);

    if (ad === "arc" || ad === "robinhood") continue;

    let quote = A(z.dolar.adres);
    const ondalik = Number(await israr(() => new Contract(quote, ["function decimals() view returns (uint8)"], p).decimals()));
    const n0 = r.yiginNonce != null ? r.yiginNonce : await israr(() => p.getTransactionCount(D, "pending"));
    if (r.yiginNonce == null) { r.yiginNonce = n0; yaz(); }
    const sira = [];
    if (ondalik !== 6) sira.push("Dolar6");
    sira.push("YoneticiFabrika", "KasaFabrika", "KapaliKayit", "PulseFabrika", "DevPool", "PulseLikiditeKasasi", "PulseLaunchpad");
    const T = {};
    sira.forEach((n, i) => { T[n] = getCreateAddress({ from: D, nonce: n0 + i }); });
    if (T.Dolar6) quote = T.Dolar6;
    const PM = A(z.poolManager);
    const hookInit = ic("PulseHook", ["address", "address", "address", "address", "address", "address"],
      [PM, T.PulseLaunchpad, quote, T.DevPool, T.PulseLikiditeKasasi, ISLETME]);
    const hh = keccak256(hookInit);
    if (!r.hookSalt || r.hookInitHash !== hh) {
      for (let i = 0; ; i++) {
        const s = "0x" + i.toString(16).padStart(64, "0");
        const a = getCreate2Address(C2, s, hh);
        if ((parseInt(a.slice(-4), 16) & MASKE) === HOOK_BITLERI) { r.hookSalt = s; r.PulseHookTahmin = a; break; }
      }
      r.hookInitHash = hh; yaz();
    }
    const hook = r.PulseHookTahmin;
    const init = {
      Dolar6: () => ic("Dolar6", ["address", "string", "string"], [A(z.dolar.adres), "ARC PULSE USDC (6dp)", "pUSDC"]),
      YoneticiFabrika: () => ic("YoneticiFabrika", [], []),
      KasaFabrika: () => ic("KasaFabrika", ["address"], [T.YoneticiFabrika]),
      KapaliKayit: () => ic("KapaliKayit", [], []),
      PulseFabrika: () => ic("PulseFabrika", [], []),
      DevPool: () => ic("DevPool", ["address"], [K.yurutucu]),
      PulseLikiditeKasasi: () => ic("PulseLikiditeKasasi", ["address", "address"], [quote, T.PulseLaunchpad]),
      PulseLaunchpad: () => ic("PulseLaunchpad",
        ["address", "address", "address", "address", "address", "address", "address", "address", "address", "address", "address"],
        [quote, PM, hook, T.PulseFabrika, T.KasaFabrika, T.DevPool, T.PulseLikiditeKasasi, ISLETME, T.KapaliKayit, DEAD, DEAD]),
    };
    for (const [i, n] of sira.entries()) {
      if (await kod(T[n])) { console.log("     " + n.padEnd(22) + T[n] + "  (zincirde)"); r[n] = T[n]; continue; }
      const tx = { data: init[n]() };
      if (UYGULA) {
        const simdi = await israr(() => p.getTransactionCount(D, "pending"));
        if (simdi !== n0 + i) throw new Error(n + ": nonce " + simdi + ", beklenen " + (n0 + i) + " — baska islem araya girdi");
        tx.nonce = n0 + i;
      }
      const m = await gonder(n, tx);
      if (m) {
        if (m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(n + " sapti " + m.contractAddress);
        r[n] = T[n]; yaz();
        console.log("     " + "".padEnd(22) + "-> " + T[n]);
      }
    }
    if (await kod(hook)) { console.log("     " + "PulseHook".padEnd(22) + hook + "  (zincirde)"); r.PulseHook = hook; }
    else {
      await gonder("PulseHook", { to: C2, data: r.hookSalt + hookInit.slice(2) });
      if (UYGULA) { if (!(await kodBekle(hook))) throw new Error("hook yok"); r.PulseHook = hook; yaz(); console.log("     " + "".padEnd(22) + "-> " + hook); }
    }
    r.quote = quote; r.poolManager = PM;
    const son = await israr(() => p.getBalance(D));
    if (UYGULA) { console.log("     harcanan " + (Number(once - son) / 1e18).toPrecision(4) + " " + z.gaz); r.zaman = new Date().toISOString(); yaz(); }
  }
  yaz();
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
