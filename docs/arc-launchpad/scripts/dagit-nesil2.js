"use strict";
/* ===========================================================================
 * dagit-nesil2.js — second-generation launch stack + cross-chain collateral
 *
 *   node scripts/dagit-nesil2.js [ev|uzak|hepsi] [zincir,...] [--uygula]
 *
 * WHAT IT DEPLOYS
 *   HOME chains (a launch can happen here and send collateral to a remote):
 *     arc, robinhood, base, arbitrum, avalanche, monad, hyperevm
 *     YoneticiFabrika2  CrossChainAssetRegistry2  KasaFabrika2  PulseFabrika
 *     PulseLikiditeKasasi  PulseLaunchpad2  PulseHook (CREATE2, 0xACC bits)
 *     The developer fund is the chain's existing DevPool (Arc DAO governed),
 *     so revenue keeps one route.
 *   REMOTE chains (where collateral is converted): base, arbitrum
 *     RemoteVaultFactory2 per home chain, through the Arachnid CREATE2
 *     factory, salt keccak256("arc-pulse/nesil2/<home domain>") — so each
 *     home registry can name its remotes before they exist.
 *     HavuzFiyat on Arbitrum (Base has one); TakasYurutucu (the swap
 *     borrower, Uniswap v3 SwapRouter02) on both.
 *   Not here: Ethereum as a home (~$60 of gas for the stack today) and BNB
 *   (CCTP mints no USDC there).
 *
 * WHY THIS ORDER
 *   A remote factory's constructor names the home KasaFabrika2. Homes are
 *   deployed first, so the remote side is built against real addresses,
 *   never a prediction that a stray transaction could invalidate.
 *
 * Tested before any of this: nesil2-test (Circle's CCTP V2 compiled from
 * source, 7/7) and a Base -> Arbitrum mainnet-fork round trip with Circle's
 * live contracts, a real Uniswap v4 launch and real swaps (119.76 of 120
 * USDC home). Record: dagitim-nesil2.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, AbiCoder, keccak256, getCreateAddress, getCreate2Address, getAddress, toUtf8Bytes, Contract } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-nesil2.json");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const AG = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const P2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8"));
const RH = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood;
const coder = AbiCoder.defaultAbiCoder();
const A = (x) => getAddress(String(x).toLowerCase());
const ic = (n, t, d) => B(n).bytecode + (t.length ? coder.encode(t, d).slice(2) : "");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const UYGULA = process.argv.includes("--uygula");
const MOD = (process.argv[2] && !process.argv[2].startsWith("--")) ? process.argv[2] : "hepsi";
const SECIM = (process.argv[3] && !process.argv[3].startsWith("--")) ? process.argv[3].split(",") : null;

const DOMAIN = { arc: 26, robinhood: 35, base: 6, arbitrum: 3, avalanche: 1, monad: 15, hyperevm: 19, ethereum: 0 };
const EVLER = ["arc", "robinhood", "base", "arbitrum", "avalanche", "monad", "hyperevm"];
const UZAKLAR = {
  base: { usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", router: "0x2626664c2603336E57B271c5C0b26F421741e481", havuzFiyat: "0x5928768E5f9339c24Ca1723B24c7F1e2bBf73473",
    besleyiciler: [["0x4200000000000000000000000000000000000006", "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", 18, 8, 7200]] },
  arbitrum: { usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", v3Fabrika: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    besleyiciler: [["0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", 18, 8, 90000]] },
};
const HOOK_BITLERI = 0xACC, MASKE = (1 << 14) - 1;
const BES = "tuple(address,address,uint8,uint8,uint32)[]";

function evDolari(ad) {
  if (ad === "arc") return A(P2.arc.quote);
  if (ad === "robinhood") return A("0x3884564BA51B349e7661c7e28Ad947DEE327FeDF");   // Circle USDC, CCTP-minted
  return A(EVM[ad].dolar.adres);
}
function devPool(ad) {
  if (ad === "arc") return A(P2.arc.devPool);
  if (ad === "robinhood") return A(RH.devPool);
  return A(AG[ad].DevPool);
}
const uzakTuz = (evDomain) => keccak256(toUtf8Bytes("arc-pulse/nesil2/" + evDomain));
const kasaInitHash = () => keccak256(B("KopruKasasi2").bytecode);
const uzakKasaInitHash = () => keccak256(B("RemoteCollateralVault2").bytecode);
function uzakFabrikaInit(evAd, kfAdr, uzakAd, havuzFiyat) {
  const u = UZAKLAR[uzakAd];
  return ic("RemoteVaultFactory2", ["uint32", "address", "bytes32", "address", "address", "address", "address", BES],
    [DOMAIN[evAd], kfAdr, kasaInitHash(), TM, MT, u.usdc, havuzFiyat, u.besleyiciler]);
}
const havuzFiyatInit = () => ic("HavuzFiyat", ["address", "address"], [UZAKLAR.arbitrum.v3Fabrika, UZAKLAR.arbitrum.usdc]);
const havuzFiyatAdr = (uzakAd) => uzakAd === "base" ? A(UZAKLAR.base.havuzFiyat)
  : getCreate2Address(C2, "0x" + "00".repeat(32), keccak256(havuzFiyatInit()));

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) { const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {}); if (d > 7 || !/rate|limit|timeout|503|502|429|ECONNRESET|fetch failed|coalesce/i.test(m)) throw e; await bekle(2500 * (d + 1)); }
  }
}

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : { ev: {}, uzak: {} };
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1)); };
  console.log("NESIL 2  " + (UYGULA ? "UYGULA" : "KURU") + "  mod " + MOD);

  const ag = (ad) => {
    const z = EVM[ad];
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    const w = new Wallet(pk, p);
    const kod = async (a) => !!a && (await israr(() => p.getCode(a))).length > 2;
    const gonder = async (etiket, tx) => {
      if (!UYGULA) {
        let g; try { g = "gaz " + (await israr(() => p.estimateGas({ from: w.address, ...tx }))); } catch (e) { g = "olculemedi (" + (e.shortMessage || e.message).slice(0, 50) + ")"; }
        console.log("   (kuru) " + etiket.padEnd(22) + g); return null;
      }
      if (z.chainId === 999) {
        tx.gasPrice = BigInt(await israr(() => p.send("eth_bigBlockGasPrice", []))) * 12n / 10n; tx.type = 0;
        try { tx.gasLimit = (await israr(() => p.estimateGas({ from: w.address, ...tx }))) * 13n / 10n; } catch (e) { tx.gasLimit = 8_000_000n; }
      }
      const t = await israr(() => w.sendTransaction(tx));
      let m = null; while (!m) { await bekle(1500); m = await israr(() => p.getTransactionReceipt(t.hash)); }
      if (m.status !== 1) throw new Error(etiket + " basarisiz " + t.hash);
      console.log("   " + etiket.padEnd(22) + t.hash + "  gaz " + m.gasUsed);
      return m;
    };
    return { z, p, w, kod, gonder };
  };

  /* ---------------- homes ---------------- */
  if (MOD === "ev" || MOD === "hepsi") {
    for (const ad of (SECIM || EVLER).filter((x) => EVLER.includes(x))) {
      const { z, p, w, kod, gonder } = ag(ad);
      const r = (k.ev[ad] = k.ev[ad] || {});
      console.log("\n" + z.ad + " (domain " + DOMAIN[ad] + ")  dolar " + evDolari(ad) + "  DevPool " + devPool(ad));
      const n0 = r.nonce != null ? r.nonce : await israr(() => p.getTransactionCount(w.address, "pending"));
      if (r.nonce == null) { r.nonce = n0; yaz(); }
      const sira = ["YoneticiFabrika2", "CrossChainAssetRegistry2", "KasaFabrika2", "PulseFabrika", "PulseLikiditeKasasi", "PulseLaunchpad2"];
      const T = {}; sira.forEach((n, i) => { T[n] = getCreateAddress({ from: w.address, nonce: n0 + i }); });
      const quote = evDolari(ad), PM = A(z.poolManager), DP = devPool(ad);
      const zincirler = Object.keys(UZAKLAR).filter((u) => u !== ad).map((u) => [DOMAIN[u], EVM[u].chainId,
        getCreate2Address(C2, uzakTuz(DOMAIN[ad]), keccak256(uzakFabrikaInit(ad, T.KasaFabrika2, u, havuzFiyatAdr(u)))),
        uzakKasaInitHash(), UZAKLAR[u].usdc, u]);
      r.uzaklar = Object.fromEntries(zincirler.map((x) => [x[5], x[2]]));
      const hookInit = ic("PulseHook", ["address", "address", "address", "address", "address", "address"], [PM, T.PulseLaunchpad2, quote, DP, T.PulseLikiditeKasasi, ISLETME]);
      const hh = keccak256(hookInit);
      if (!r.hookSalt || r.hookInitHash !== hh) {
        for (let i = 0; ; i++) {
          const s = "0x" + i.toString(16).padStart(64, "0");
          const a = getCreate2Address(C2, s, hh);
          if ((parseInt(a.slice(-4), 16) & MASKE) === HOOK_BITLERI) { r.hookSalt = s; r.PulseHook = a; break; }
        }
        r.hookInitHash = hh; yaz();
      }
      const init = {
        YoneticiFabrika2: () => ic("YoneticiFabrika2", [], []),
        CrossChainAssetRegistry2: () => ic("CrossChainAssetRegistry2", ["uint32", "tuple(uint32,uint64,address,bytes32,address,string)[]"], [DOMAIN[ad], zincirler]),
        KasaFabrika2: () => ic("KasaFabrika2", ["address", "address"], [T.YoneticiFabrika2, T.PulseLaunchpad2]),
        PulseFabrika: () => ic("PulseFabrika", [], []),
        PulseLikiditeKasasi: () => ic("PulseLikiditeKasasi", ["address", "address"], [quote, T.PulseLaunchpad2]),
        PulseLaunchpad2: () => ic("PulseLaunchpad2",
          ["address", "address", "address", "address", "address", "address", "address", "address", "address", "address", "address"],
          [quote, PM, r.PulseHook, T.PulseFabrika, T.KasaFabrika2, DP, T.PulseLikiditeKasasi, ISLETME, T.CrossChainAssetRegistry2, TM, MT]),
      };
      for (const [i, n] of sira.entries()) {
        if (await kod(T[n])) { console.log("   " + n.padEnd(22) + T[n] + "  (zincirde)"); r[n] = T[n]; continue; }
        const tx = { data: init[n]() };
        if (UYGULA) {
          const simdi = await israr(() => p.getTransactionCount(w.address, "pending"));
          if (simdi !== n0 + i) throw new Error(ad + " " + n + ": nonce " + simdi + ", beklenen " + (n0 + i));
          tx.nonce = n0 + i;
        }
        const m = await gonder(n, tx);
        if (m) { if (m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(n + " sapti"); r[n] = T[n]; yaz(); }
        else if (!UYGULA && i === 0) { console.log("   (kuru: kalan adimlar sirali nonce ister, ilk adim olculdu)"); break; }
      }
      if (UYGULA) {
        if (await kod(r.PulseHook)) console.log("   PulseHook".padEnd(25) + r.PulseHook + "  (zincirde)");
        else { await gonder("PulseHook", { to: C2, data: r.hookSalt + hookInit.slice(2) }); }
        Object.assign(r, { quote, poolManager: PM, DevPool: DP, domain: DOMAIN[ad], zaman: new Date().toISOString() });
        yaz();
      }
    }
  }

  /* ---------------- remotes ---------------- */
  if (MOD === "uzak" || MOD === "hepsi") {
    for (const u of (SECIM || Object.keys(UZAKLAR)).filter((x) => UZAKLAR[x])) {
      const { z, kod, gonder } = ag(u);
      const r = (k.uzak[u] = k.uzak[u] || { fabrikalar: {} });
      console.log("\n" + z.ad + " (uzak, domain " + DOMAIN[u] + ")");
      const hf = havuzFiyatAdr(u);
      if (!(await kod(hf))) { if (u !== "arbitrum") throw new Error("HavuzFiyat yok: " + hf); await gonder("HavuzFiyat", { to: C2, data: "0x" + "00".repeat(32) + havuzFiyatInit().slice(2) }); }
      else console.log("   HavuzFiyat".padEnd(25) + hf + "  (zincirde)");
      r.havuzFiyat = hf;
      /* the swap borrower (TakasYurutucu): no owner, holds nothing */
      const yInit = ic("TakasYurutucu", ["address"], [UZAKLAR[u].router]);
      const yAdr = getCreate2Address(C2, "0x" + "00".repeat(32), keccak256(yInit));
      if (await kod(yAdr)) console.log("   TakasYurutucu".padEnd(25) + yAdr + "  (zincirde)");
      else await gonder("TakasYurutucu", { to: C2, data: "0x" + "00".repeat(32) + yInit.slice(2) });
      r.yurutucu = yAdr;
      for (const ev of EVLER.filter((e) => e !== u)) {
        const kf = k.ev[ev] && k.ev[ev].KasaFabrika2;
        if (!kf) { console.log("   " + ev.padEnd(22) + "ev yigini yok, atlandi"); continue; }
        const init = uzakFabrikaInit(ev, kf, u, hf);
        const adr = getCreate2Address(C2, uzakTuz(DOMAIN[ev]), keccak256(init));
        if (k.ev[ev].uzaklar && k.ev[ev].uzaklar[u] && k.ev[ev].uzaklar[u].toLowerCase() !== adr.toLowerCase()) throw new Error(ev + " kaydi bu fabrikayi baska adreste bekliyor");
        if (await kod(adr)) { console.log("   fabrika(" + ev + ")".padEnd(14) + adr + "  (zincirde)"); r.fabrikalar[ev] = adr; continue; }
        const m = await gonder("fabrika(" + ev + ")", { to: C2, data: uzakTuz(DOMAIN[ev]) + init.slice(2) });
        if (m) { r.fabrikalar[ev] = adr; yaz(); }
      }
      yaz();
    }
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
