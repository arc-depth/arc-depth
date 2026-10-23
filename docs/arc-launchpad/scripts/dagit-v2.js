"use strict";
/* ===========================================================================
 * dagit-v2.js — the second basket generation on the EVM chains: nothing on
 * our machines (arastirma/sepet-v2-tasarim.md)
 *
 *   node scripts/dagit-v2.js kur  [zincir...]            dry: addresses, gas, cost
 *   node scripts/dagit-v2.js kur  [zincir...] --uygula   deploy (user command only)
 *   node scripts/dagit-v2.js bagla                       dry: the wiring still missing
 *   node scripts/dagit-v2.js bagla --uygula              wire (user command only)
 *   node scripts/dagit-v2.js v3 [zincir...]              dry: the v3 redeploy (auction-free
 *                                                        redemption exits), list and cost
 *   node scripts/dagit-v2.js v3 [zincir...] --uygula     deploy it (user command only); then
 *                                                        V2_KAYIT=dagitim-v3.json ... bagla
 *
 * WHAT GOES WHERE (CREATE at recorded nonces, addresses known before deploying)
 *   Arc        HaberciLZ, SepetDefteri, SepetKasasi, SepetUcu, PulseFabrika4,
 *              PulseLikiditeKasasi, FthmYakici, PulseLaunchpad5, IkizHub,
 *              MerkezKapi; PulseHook5 by CREATE2 (low 14 bits 0x2ECC)
 *   Base       HaberciLZ, SepetKasasi, AktarmaLZ (the hop to Sui and Aptos)
 *   Arbitrum, Ethereum, Avalanche, Monad, HyperEVM, BNB, Robinhood
 *              HaberciLZ, SepetKasasi
 * One pool, on Arc: launches, buys, sells and redemptions from every chain go
 * through MerkezKapi; the other chains hold basket vaults only. Their dollar:
 * Circle USDC; BNB Dolar6 over Binance-Peg USDC (relay delivers the latter,
 * HaberciLZ wraps it); Robinhood USDG (the only dollar relay delivers there).
 *
 * WIRING (bagla), write-once, nothing locked here; Sui, Aptos and Solana
 * addresses come from their own deploy scripts into the same record:
 *   HaberciLZ  Arc <-> every chain (twins, routes for dollars, options),
 *              LayerZero libraries and ULN configs written explicitly (LayerZero
 *              Labs + Nethermind, each chain's confirmations, ZincirTablosu.sol)
 *   Defter     bagla per chain (only Arc has an entry; elsewhere a marker
 *              that can never send)
 *   IkizHub    merkez, the Base hop, the Solana / Sui / Aptos twin gates
 *   AktarmaLZ  the hub on Arc, the Sui / Aptos twin gates
 * Record: dagitim-v2.json. A stopped run resumes.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { JsonRpcProvider, FeeData, Wallet, NonceManager, Contract, AbiCoder, zeroPadValue, keccak256, getCreateAddress,
  getCreate2Address } = require("ethers");

const KOK = path.join(__dirname, "..");
const ADIM = process.argv[2];
const UYGULA = process.argv.includes("--uygula");
const SECILEN = process.argv.slice(3).filter((a) => !a.startsWith("--"));
const KAYIT = process.env.V2_KAYIT || path.join(KOK, ADIM === "v4" ? "dagitim-v4.json" : "dagitim-v2.json");   // V2_KAYIT: a dry run against predicted addresses
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const SIFIR = "0x0000000000000000000000000000000000000000";
const HOOK_BIT = 0x2ECC, HOOK_MASKE = (1 << 14) - 1;
const ARC_FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const ARC_PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const IKIZ_YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const ARC_DEVPOOL = "0xA110b71c3f0748536f10C9e71A6E9F96999F6CD0";
const BNB_PEG = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const ARC_FTHM_HAVUZ = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8")).havuzId;
/* Defter.bagla wants an entry for every chain; only Arc has one, the others get a marker no contract can be */
const GIRISSIZ = "0x" + "00".repeat(31) + "01";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const b32 = (a) => zeroPadValue(a, 32);
const art = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();

/* chains: CCTP domain, dollar, how dollars reach it from Arc */
const Z = {
  arc: { ad: "Arc", id: 5042, domain: 26, rpc: "https://arc-rpc.publicnode.com", usdc: "0x3600000000000000000000000000000000000000", yol: "yerel" },
  base: { ad: "Base", id: 8453, domain: 6, rpc: "https://mainnet.base.org", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", yol: "cctp" },
  arbitrum: { ad: "Arbitrum", id: 42161, domain: 3, rpc: "https://arb1.arbitrum.io/rpc", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", yol: "cctp" },
  ethereum: { ad: "Ethereum", id: 1, domain: 0, rpc: "https://ethereum-rpc.publicnode.com", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", yol: "cctp" },
  avalanche: { ad: "Avalanche", id: 43114, domain: 1, rpc: "https://api.avax.network/ext/bc/C/rpc", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", yol: "cctp" },
  monad: { ad: "Monad", id: 143, domain: 15, rpc: "https://rpc.monad.xyz", usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", yol: "cctp" },
  hyperevm: { ad: "HyperEVM", id: 999, domain: 19, rpc: "https://rpc.hyperliquid.xyz/evm", usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", yol: "cctp" },
  bsc: { ad: "BNB", id: 56, domain: 17, rpc: "https://bsc-dataseed.bnbchain.org", usdc: "0xb233F129F7255F86d67BDAEA4e8c4f8274Fa70d9", ham: BNB_PEG,
    yol: "relay", relayHedef: BNB_PEG },
  robinhood: { ad: "Robinhood", id: 4663, domain: 35, rpc: "https://rpc.mainnet.chain.robinhood.com", usdc: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    yol: "relay", relayHedef: "0x5fc5360d0400a0fd4f2af552add042d716f1d168" },
};
/* LayerZero rows, read from the contract that already wires the network */
const LZ = (() => {
  const s = fs.readFileSync(path.join(KOK, "contracts", "lz", "ZincirTablosu.sol"), "utf8");
  const r = {};
  for (const m of s.matchAll(/Zincir\((\d+), (\d+), (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), (\d+)\)/g))
    r[Number(m[1])] = { eid: Number(m[2]), ep: m[3], send: m[4], recv: m[5], dvn: [m[6], m[7]].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)), onay: Number(m[8]) };
  return r;
})();
/* Solana, Sui, Aptos: LayerZero eid, CCTP domain, the confirmations they send with
   (LayerZero's defaults, read from Base's ReceiveUln302 on 18 Oct: 32, 5, 260) */
/* the Sui twin's second hop (Base -> Sui), native value carried by the hub's option: 0.000525 ETH
   measured on 20 Oct, with margin (v2 had 0.0008); written only where a new IkizHub is wired (v3) */
const IKINCI_ADIM_SUI_V3 = 600_000_000_000_000n;
const UZAK = { solana: { eid: 30168, domain: 5, onay: 32 }, sui: { eid: 30378, domain: 8, onay: 5 }, aptos: { eid: 30108, domain: 9, onay: 260 } };

if (!["kur", "bagla", "arc-yenile", "v4"].includes(ADIM)) { console.error("kullanim: dagit-v2.js <kur|bagla|arc-yenile|v4> [zincir...] [--uygula]"); process.exit(1); }
const ZINCIRLER = SECILEN.length ? SECILEN : Object.keys(Z);
if (!ZINCIRLER.includes("arc")) ZINCIRLER.unshift("arc");
const evmAnahtar = () => fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();

function sira(ad) {
  const s = ["HaberciLZ"];
  if (ad === "arc") s.push("SepetDefteri");
  s.push("SepetKasasi");
  if (ad === "arc") s.push("SepetUcu", "PulseFabrika4", "PulseLikiditeKasasi", "FthmYakici", "PulseLaunchpad5", "IkizHub", "MerkezKapi");
  if (ad === "base") s.push("AktarmaLZ");
  return s;
}

async function fthmFiyati() {
  /* the Arc FTHM/USDC pool, read from Arc mainnet: slot0 of pools[id] (StateLibrary, POOLS_SLOT 6) */
  const p = new JsonRpcProvider(Z.arc.rpc, 5042, { staticNetwork: true });
  const yuva = keccak256(coder.encode(["bytes32", "uint256"], [ARC_FTHM_HAVUZ, 6]));
  const kelime = await new Contract(ARC_PM, ["function extsload(bytes32) view returns (bytes32)"], p).extsload.staticCall(yuva);
  const sqrt = BigInt(kelime) & ((1n << 160n) - 1n);
  return (sqrt * sqrt * 1_000_000n) >> 192n;   // FTHM raw per $1
}

function saglayici(ad) {
  const z = Z[ad];
  z.p = new JsonRpcProvider(z.rpc, z.id, { staticNetwork: true });
  const p = z.p;
  p.getFeeData = async () => {
    /* HyperEVM big blocks: their own legacy price */
    if (z.id === 999) return new FeeData(BigInt(await p.send("eth_bigBlockGasPrice", [])) * 12n / 10n, null, null);
    const blok = await p.getBlock("latest");
    if (!blok.baseFeePerGas) { const g = BigInt(await p.send("eth_gasPrice", [])); return new FeeData(g, null, null); }
    const b = blok.baseFeePerGas, o = ad === "base" ? 1_000_000n : b / 10n + 1n;
    return new FeeData(null, b * 2n + o, o);
  };
  z.w = new NonceManager(new Wallet(evmAnahtar(), p));
  /* HyperEVM: this deployer is on big blocks (scripts/hyperevm-buyuk-blok.js); they have their own
     price (eth_bigBlockGasPrice), and a contract above the 2M small-block limit needs its gas stated */
  if (z.id === 999) {
    const gonder = z.w.sendTransaction.bind(z.w);
    z.w.sendTransaction = async (tx) => {
      const t = { ...tx, type: 0, gasPrice: BigInt(await p.send("eth_bigBlockGasPrice", [])) * 12n / 10n };
      delete t.maxFeePerGas; delete t.maxPriorityFeePerGas;
      if (!t.gasLimit) t.gasLimit = (await p.estimateGas({ ...t, from: z.ben })) * 13n / 10n;
      return gonder(t);
    };
  }
}

(async () => {
  const kayit = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : { zincir: {}, uzak: {} };
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
  console.log("SEPET V2  " + ADIM.toUpperCase() + (UYGULA ? " UYGULA" : " KURU") + "  zincirler " + ZINCIRLER.join(", "));
  /* the artifacts are built from the sources as they are now */
  for (const k of ["sepet/HaberciLZ", "sepet/SepetDefteri", "sepet/SepetKasasi", "sepet/SepetUcu", "sepet/PulseLaunchpad5", "sepet/PulseHook5",
    "sepet/FthmYakici", "lz/IkizHub", "lz/AktarmaLZ", "merkez/MerkezKapi"]) cp.execFileSync("node", [path.join(KOK, "scripts", "derle.js"), k], { cwd: KOK, stdio: "ignore" });
  for (const ad of ZINCIRLER) { saglayici(ad); Z[ad].ben = await Z[ad].w.getAddress(); kayit.zincir[ad] ||= {}; }
  if (ADIM === "kur") await kur(kayit, yaz);
  else if (ADIM === "arc-yenile") await arcYenile(kayit, yaz);
  else if (ADIM === "v4") await v4(kayit, yaz);
  else await bagla(kayit, yaz);
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); if (process.env.AYRINTI) console.error(e.stack); process.exitCode = 1; });

/* ---- 1 kur ---------------------------------------------------------------- */
/* ---- 1b arc-yenile (19 Oct 2026) -------------------------------------------
   The launchpad's ladder now runs to the last usable tick (the token never
   runs out; contracts/sepet/PulseLaunchpad5.sol). Nothing on Arc was wired
   yet, so only what is bound to the launchpad's address is deployed again:
     SepetUcu, PulseLikiditeKasasi, PulseLaunchpad5, MerkezKapi (CREATE at
     a new recorded nonce) and PulseHook5 (CREATE2).
   Kept: HaberciLZ, SepetDefteri (its Arc entry is bound later, by bagla),
   SepetKasasi, PulseFabrika4 (no arguments), FthmYakici, IkizHub (its
   merkez is set later, by bagla). The replaced addresses go to arc.eski. */
async function arcYenile(kayit, yaz) {
  const z = Z.arc, r = kayit.zincir.arc;
  if (!r.HaberciLZ || !r.SepetDefteri || !r.PulseFabrika4 || !r.FthmYakici || !r.IkizHub) throw new Error("Arc seti eksik: once kur");
  const d = new Contract(r.SepetDefteri, art("SepetDefteri").abi, z.p);
  if ((await d.kasa(26)) !== b32(SIFIR)) throw new Error("Defter'in Arc bagi yazilmis: yenileme artik guvenli degil");
  const hub = new Contract(r.IkizHub, art("IkizHub").abi, z.p);
  if ((await hub.merkez()) !== SIFIR) throw new Error("IkizHub merkezi yazilmis: yenileme artik guvenli degil");
  const y = (r.yenileme ||= {});
  /* the launchpad must be the new code: its ladder edge constant exists only there */
  const lpAbi = art("PulseLaunchpad5").abi;
  if (!lpAbi.some((x) => x.name === "MERDIVEN_UC_TICK")) throw new Error("build/PulseLaunchpad5.json eski kod");
  if (!r.eski) {
    r.eski = { SepetUcu: r.SepetUcu, PulseLikiditeKasasi: r.PulseLikiditeKasasi, PulseLaunchpad5: r.PulseLaunchpad5, MerkezKapi: r.MerkezKapi,
      PulseHook5: r.PulseHook5, sebep: "2x merdiven: ~4.800 $ alimdan sonra token kalmiyordu (19 Eki)" };
    yaz();
  }
  const n1 = y.n1 != null ? y.n1 : await z.p.getTransactionCount(z.ben, "pending");
  if (y.n1 == null) { y.n1 = n1; yaz(); }
  const s = ["SepetUcu", "PulseLikiditeKasasi", "PulseLaunchpad5", "MerkezKapi"];
  const T = {};
  s.forEach((n, i) => { T[n] = getCreateAddress({ from: z.ben, nonce: n1 + i }); });
  const hookInit = art("PulseHook5").bytecode + coder.encode(["address", "address", "address", "address", "address", "address", "address"],
    [ARC_PM, T.PulseLaunchpad5, z.usdc, ARC_DEVPOOL, T.PulseLikiditeKasasi, ISLETME, r.FthmYakici]).slice(2);
  const hh = keccak256(hookInit);
  if (!y.hookTuz || y.hookInitHash !== hh) {
    for (let i = 0; ; i++) {
      const t = "0x" + i.toString(16).padStart(64, "0");
      const a = getCreate2Address(C2, t, hh);
      if ((parseInt(a.slice(-4), 16) & HOOK_MASKE) === HOOK_BIT) { y.hookTuz = t; y.hookTahmin = a; break; }
    }
    y.hookInitHash = hh; yaz();
  }
  const D = b32(r.SepetDefteri);
  const args = {
    SepetUcu: [r.HaberciLZ, z.usdc, 26, D, T.PulseLaunchpad5],
    PulseLikiditeKasasi: [z.usdc, T.PulseLaunchpad5],
    PulseLaunchpad5: [z.usdc, ARC_PM, y.hookTahmin, r.PulseFabrika4, T.SepetUcu, ARC_DEVPOOL, T.PulseLikiditeKasasi, ISLETME],
    MerkezKapi: [T.PulseLaunchpad5, ARC_PM, IKIZ_YAYICI, TM, 26, T.SepetUcu, z.usdc, LZ[5042].ep, r.IkizHub],
  };
  console.log("  Arc yenileme (nonce " + n1 + "); kalanlar: HaberciLZ, Defter, Kasa, Fabrika, FthmYakici, IkizHub");
  let gaz = 0n;
  for (const [i, n] of s.entries()) {
    if (y[n] && (await z.p.getCode(y[n])).length > 2) { console.log("    " + n.padEnd(20) + y[n] + "  (zincirde)"); continue; }
    const a = art(n);
    const data = a.bytecode + coder.encode(a.abi.find((x) => x.type === "constructor")?.inputs.map((x) => x.type) || [], args[n]).slice(2);
    if (!UYGULA) {
      const g = await z.p.estimateGas({ from: z.ben, data }).catch(() => null);
      gaz += g || 3_000_000n;
      console.log("    (kuru) " + n.padEnd(20) + T[n] + "  gaz " + (g || "?"));
      continue;
    }
    let simdi = await z.p.getTransactionCount(z.ben, "pending");
    for (let k = 0; simdi < n1 + i && k < 20; k++) { await bekle(1500); simdi = await z.p.getTransactionCount(z.ben, "pending"); }
    if (simdi !== n1 + i) throw new Error(n + ": nonce " + simdi + ", beklenen " + (n1 + i));
    const m = await (await z.w.sendTransaction({ data })).wait();
    if (m.status !== 1 || m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(n + " sapti");
    y[n] = T[n]; yaz();
    console.log("    " + n.padEnd(20) + T[n]);
  }
  if (!UYGULA) {
    gaz += 3_500_000n;
    const f = await z.p.getFeeData();
    console.log("    (kuru) PulseHook5".padEnd(28) + y.hookTahmin + "  (CREATE2, tuz " + BigInt(y.hookTuz) + ")");
    console.log("  MALIYET ~" + (Number(gaz * (f.maxFeePerGas || f.gasPrice)) / 1e18).toFixed(3) + " USDC  bakiye " + (Number(await z.p.getBalance(z.ben)) / 1e18).toFixed(2));
    return;
  }
  if ((await z.p.getCode(y.hookTahmin)).length <= 2) {
    const m = await (await z.w.sendTransaction({ to: C2, data: y.hookTuz + hookInit.slice(2) })).wait();
    let kod = await z.p.getCode(y.hookTahmin);
    for (let k = 0; kod.length <= 2 && k < 20; k++) { await bekle(1500); kod = await z.p.getCode(y.hookTahmin); }
    if (m.status !== 1 || kod.length <= 2) throw new Error("Arc hook yok");
  }
  console.log("    PulseHook5".padEnd(24) + y.hookTahmin);
  /* the record now names the new set; bagla binds these */
  for (const n of s) r[n] = y[n];
  r.PulseHook5 = r.hookTahmin = y.hookTahmin;
  yaz();
  console.log("  Arc kaydi yeni sete gecti; eski adresler arc.eski altinda");
}

/* ---- 1c v4 (23 Oct 2026) ---------------------------------------------------
   arastirma/v4-tasarim.md. The joint test launch (PTEST2) found every
   redemption reverting (the Defter paid its vault orders' LayerZero fees from
   the messenger's own, empty balance) and nobody filling the vaults' auctions.
   v4: the redeemer pays those fees in the same call and only vaults that hold
   something get an order (queue + tip otherwise); the tax reaches the Defter
   inside each trade; EVM vaults buy and sell in Uniswap v3 within ~3% of the
   pool's 30-minute average (auctions stay as the fallback); tips for whoever
   carries out an arrived order, retries a buy or finishes a Sui/Aptos launch.
   New, with everything bound to them by constructor:
     Arc    SepetDefteri, SepetKasasi (no Uniswap v3 on Arc: auctions),
            SepetUcu, PulseLikiditeKasasi, PulseLaunchpad5, IkizHub (its merkez
            is set once), MerkezKapi, LaunchEmaneti; PulseHook5 by CREATE2
     Base   SepetKasasi, AktarmaLZ (its hub is set once)
     the other seven EVM chains   SepetKasasi
   Kept, with all their wiring: HaberciLZ on all nine chains, PulseFabrika4,
   FthmYakici, IkizYayici and the EVM twins.
   On Arc's kept HaberciLZ, while it is not locked: orders to chains whose
   vault swaps get 1.6M lzReceive gas (ozelSecenek, once per chain; with the
   600k default a redemption's sale has no room and goes in kind).
   Record: dagitim-v4.json (dagitim-v2.json untouched). */
const V4_DEX = {
  /* Uniswap v3 factories and wrapped native coins, read from the chains on 23 Oct
     (feeAmountTickSpacing(500) = 10, USDC pools at 500 and 3000). HyperEVM: HyperSwap V3, a
     Uniswap v3 fork (its callback is hyperswapV3SwapCallback; nesil2-test Kasa4Dex 8/8).
     None found on Monad and Robinhood; BNB's vault dollar is the Dolar6 wrap while the pools
     hold Binance-Peg USDC: auctions there. */
  base: ["0x33128a8fC17869897dcE68Ed026d694621f6FDfD", "0x4200000000000000000000000000000000000006"],
  arbitrum: ["0x1F98431c8aD98523631AE4a59f267346ea31F984", "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"],
  ethereum: ["0x1F98431c8aD98523631AE4a59f267346ea31F984", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
  avalanche: ["0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD", "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"],
  hyperevm: ["0xB1c0fa0B789320044A6F623cFe5eBda9562602E3", "0x5555555555555555555555555555555555555555"],
};
/* chains whose orders from Arc get 1.6M lzReceive gas (Ethereum keeps 600k: gas there is dear) */
const V4_GAZ_ZINCIR = ["base", "arbitrum", "avalanche", "hyperevm"];
const V4_GAZ = 1_600_000;
const MT_ARC = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";

async function v4(kayit, yaz) {
  if (path.resolve(KAYIT) === path.resolve(path.join(KOK, "dagitim-v2.json"))) throw new Error("v4 kendi kaydina yazar (dagitim-v4.json); V2_KAYIT ile v2 kaydi verilemez");
  if (!art("SepetDefteri").abi.some((x) => x.name === "itfaUcreti")) throw new Error("build/SepetDefteri.json eski kod (itfaUcreti yok)");
  if (!art("SepetKasasi").abi.some((x) => x.name === "havuzVar")) throw new Error("build/SepetKasasi.json eski kod (havuzVar yok)");
  cp.execFileSync("node", [path.join(KOK, "scripts", "derle.js"), "merkez/LaunchEmaneti"], { cwd: KOK, stdio: "ignore" });
  const eski = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v2.json"), "utf8"));
  for (const ad of Object.keys(Z)) {
    const e = eski.zincir[ad] || {}, r = (kayit.zincir[ad] ||= {});
    if (!e.HaberciLZ) continue;
    r.HaberciLZ ||= e.HaberciLZ;
    if (e.relayAdresi) r.relayAdresi ||= e.relayAdresi;
    if (ad === "arc") { r.PulseFabrika4 ||= e.PulseFabrika4; r.FthmYakici ||= e.FthmYakici; }
  }
  kayit.uzak ||= {};
  for (const [ad, u] of Object.entries(eski.uzak || {})) {
    const t = (kayit.uzak[ad] ||= {});
    for (const f of ["karsi", "ikizKapi", "secenek", "ikizPaket", "kapiNesne", "oapp", "ikizHesap", "paket", "hesap", "sepetProgram", "kapiProgram",
      "ikizSecenek", "yaratSecenek", "gonderSecenek"]) if (u[f] && !t[f]) t[f] = u[f];
    if (ad === "sui") t.ikinciAdim = IKINCI_ADIM_SUI_V3.toString();
    else if (u.ikinciAdim && !t.ikinciAdim) t.ikinciAdim = u.ikinciAdim;
  }
  kayit.v4 ||= { kaynak: "dagitim-v2.json", tasarim: "arastirma/v4-tasarim.md",
    sebep: "itfa ucreti itfa edende, dolu kasaya emir; vergi islemde Defter'e; EVM kasalari Uniswap v3 TWAP sinirli; bahsisler" };
  yaz();

  for (const ad of ZINCIRLER) {
    const z = Z[ad], r = kayit.zincir[ad];
    if (!r.HaberciLZ) throw new Error(z.ad + ": v2 HaberciLZ yok");
    /* the factory must still answer as a Uniswap v3 factory before a vault is bound to it */
    const [fab, weth] = V4_DEX[ad] || [SIFIR, SIFIR];
    if (fab !== SIFIR) {
      const f = new Contract(fab, ["function feeAmountTickSpacing(uint24) view returns (int24)"], z.p);
      if (Number(await f.feeAmountTickSpacing(500)) !== 10) throw new Error(z.ad + ": " + fab + " Uniswap v3 fabrikasi gibi cevap vermiyor");
    }
    const n4 = r.n4 != null ? r.n4 : await z.p.getTransactionCount(z.ben, "pending");
    if (r.n4 == null) { r.n4 = n4; yaz(); }
    const s = ad === "arc" ? ["SepetDefteri", "SepetKasasi", "SepetUcu", "PulseLikiditeKasasi", "PulseLaunchpad5", "IkizHub", "MerkezKapi", "LaunchEmaneti"]
      : ad === "base" ? ["SepetKasasi", "AktarmaLZ"] : ["SepetKasasi"];
    const T = {};
    s.forEach((n, i) => { T[n] = getCreateAddress({ from: z.ben, nonce: n4 + i }); });
    if (ad === "arc") kayit.defter = T.SepetDefteri;
    const D = b32(kayit.defter);
    const lz = LZ[z.id];
    let hookInit;
    if (ad === "arc") {
      hookInit = art("PulseHook5").bytecode + coder.encode(["address", "address", "address", "address", "address", "address", "address"],
        [ARC_PM, T.PulseLaunchpad5, z.usdc, ARC_DEVPOOL, T.PulseLikiditeKasasi, ISLETME, r.FthmYakici]).slice(2);
      const hh = keccak256(hookInit);
      if (!r.hookTuz || r.hookInitHash !== hh) {
        for (let i = 0; ; i++) {
          const t = "0x" + i.toString(16).padStart(64, "0");
          const a = getCreate2Address(C2, t, hh);
          if ((parseInt(a.slice(-4), 16) & HOOK_MASKE) === HOOK_BIT) { r.hookTuz = t; r.hookTahmin = a; break; }
        }
        r.hookInitHash = hh; yaz();
      }
    }
    const args = {
      SepetDefteri: [r.HaberciLZ, z.usdc],
      SepetKasasi: [r.HaberciLZ, z.usdc, 26, D, fab, weth],
      SepetUcu: [r.HaberciLZ, z.usdc, 26, D, T.PulseLaunchpad5],
      PulseLikiditeKasasi: [z.usdc, T.PulseLaunchpad5],
      PulseLaunchpad5: [z.usdc, ARC_PM, r.hookTahmin, r.PulseFabrika4, T.SepetUcu, ARC_DEVPOOL, T.PulseLikiditeKasasi, ISLETME],
      IkizHub: [lz.ep],
      MerkezKapi: [T.PulseLaunchpad5, ARC_PM, IKIZ_YAYICI, TM, 26, T.SepetUcu, z.usdc, lz.ep, T.IkizHub],
      LaunchEmaneti: [MT_ARC, TM, T.MerkezKapi, z.usdc, 26],
      AktarmaLZ: [lz.ep],
    };
    console.log("  " + z.ad + "  (nonce " + n4 + ")  kalan: HaberciLZ " + r.HaberciLZ + (ad === "arc" ? ", PulseFabrika4, FthmYakici" : "") +
      (s.includes("SepetKasasi") ? "  kasa DEX: " + (fab === SIFIR ? "yok (ihale)" : fab) : ""));
    for (const [i, n] of s.entries()) {
      if (r[n] && (await z.p.getCode(r[n])).length > 2) { console.log("    " + n.padEnd(20) + r[n] + "  (zincirde)"); continue; }
      const a = art(n);
      const data = a.bytecode + coder.encode(a.abi.find((x) => x.type === "constructor")?.inputs.map((x) => x.type) || [], args[n]).slice(2);
      if (!UYGULA) {
        const g = await z.p.estimateGas({ from: z.ben, data }).catch(() => null);
        z.kuruGaz = (z.kuruGaz || 0n) + (g || BigInt(Math.ceil((data.length - 2) / 2 * 220 + 300_000)));
        console.log("    (kuru) " + n.padEnd(20) + T[n] + "  gaz " + (g || "? (boydan tahmin)"));
        continue;
      }
      let simdi = await z.p.getTransactionCount(z.ben, "pending");
      for (let d = 0; simdi < n4 + i && d < 20; d++) { await bekle(1500); simdi = await z.p.getTransactionCount(z.ben, "pending"); }
      if (simdi !== n4 + i) throw new Error(z.ad + " " + n + ": nonce " + simdi + ", beklenen " + (n4 + i) + " (araya baska islem girdi)");
      const m = await (await z.w.sendTransaction({ data })).wait();
      if (m.status !== 1 || m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(z.ad + " " + n + " sapti");
      r[n] = T[n]; yaz();
      console.log("    " + n.padEnd(20) + T[n]);
      if (ad === "base") await bekle(6000);
    }
    if (ad !== "arc") continue;
    if (!UYGULA) { console.log("    (kuru) PulseHook5".padEnd(28) + r.hookTahmin + "  (CREATE2, tuz " + BigInt(r.hookTuz) + ")"); z.kuruGaz = (z.kuruGaz || 0n) + 3_500_000n; }
    else if ((await z.p.getCode(r.hookTahmin)).length > 2) console.log("    PulseHook5".padEnd(24) + r.hookTahmin + "  (zincirde)");
    else {
      const m = await (await z.w.sendTransaction({ to: C2, data: r.hookTuz + hookInit.slice(2) })).wait();
      let kod = await z.p.getCode(r.hookTahmin);
      for (let d = 0; kod.length <= 2 && d < 20; d++) { await bekle(1500); kod = await z.p.getCode(r.hookTahmin); }
      if (m.status !== 1 || kod.length <= 2) throw new Error("Arc hook yok");
      console.log("    PulseHook5".padEnd(24) + r.hookTahmin);
    }
    if (UYGULA) { r.PulseHook5 = r.hookTahmin; yaz(); }
    /* Arc's kept messenger: more lzReceive gas toward the chains whose vaults swap */
    const hOku = new Contract(r.HaberciLZ, art("HaberciLZ").abi, z.p);
    const hA = sim(new Contract(r.HaberciLZ, art("HaberciLZ").abi, z.w));
    if ((await hOku.kurucu()) === SIFIR) console.log("    HaberciLZ kilitli: ozel secenek yazilamaz (600k kalir; itfa satisi ayni birimle gider)");
    else for (const k of V4_GAZ_ZINCIR) {
      const d = Z[k].domain;
      if ((await hOku.ozelSecenek(d)) !== "0x") { console.log("    ozel secenek " + Z[k].ad + " (yazili)"); continue; }
      const m = await (await hA.ozelSecenekKur(d, secenek(V4_GAZ))).wait();
      if (!UYGULA) z.kuruGaz = (z.kuruGaz || 0n) + (m.gaz || 60_000n);
      console.log("    " + (UYGULA ? "" : "(kuru) ") + "HaberciLZ ozelSecenek " + Z[k].ad + " -> lzReceive " + V4_GAZ.toLocaleString("en-US") + " gaz");
    }
  }
  if (!UYGULA) await maliyet();
  console.log("  SONRA  V2_KAYIT=dagitim-v4.json node scripts/dagit-v2.js bagla   (kuru once; Defter'in EVM baglari, IkizHub merkez + Base aktarma,");
  console.log("         AktarmaLZ hub, Sui/Aptos aktarmali kapilar; HaberciLZ baglari zaten yazili)");
  console.log("  EVM DISI (mesaj bicimi ayni; yalniz Defter ve IkizHub adresi degisti; arastirma/v4-tasarim.md bolum 5):");
  console.log("    Sui     sepet::haberci::kur<USDC>(8, 26, v4 Defter) -> yeni Haberci + Kasa; ikiz_ekle(26, Arc HaberciLZ); ikiz kapisi set_peer(Base, v4 AktarmaLZ)");
  console.log("    Aptos   pulse_sepet yukseltmesi (Haberci.defter bir kez yenilenir); ikiz kapisi set_peer(Base, v4 AktarmaLZ)");
  console.log("    Solana  pulse-sepet yukseltmesi (config.defter bir kez), pulse-kapi yukseltmesi (store.hub -> v4 IkizHub)");
}

async function kur(kayit, yaz) {
  const fiyat = await fthmFiyati();
  console.log("  FTHM fiyati (Arc havuzu): 1 $ = " + (Number(fiyat) / 1e18).toFixed(2) + " FTHM");
  for (const ad of ZINCIRLER) {
    const z = Z[ad], r = kayit.zincir[ad];
    const n0 = r.n0 != null ? r.n0 : await z.p.getTransactionCount(z.ben, "pending");
    if (r.n0 == null) { r.n0 = n0; yaz(); }
    const s = sira(ad);
    const T = {};
    s.forEach((n, i) => { T[n] = getCreateAddress({ from: z.ben, nonce: n0 + i }); });
    if (ad === "arc") kayit.defter = T.SepetDefteri;
    const D = b32(kayit.defter || getCreateAddress({ from: z.ben, nonce: (kayit.zincir.arc.n0 ?? 0) + 1 }));
    const lz = LZ[z.id];
    let hookInit;
    if (ad === "arc") {
      hookInit = art("PulseHook5").bytecode + coder.encode(["address", "address", "address", "address", "address", "address", "address"],
        [ARC_PM, T.PulseLaunchpad5, z.usdc, ARC_DEVPOOL, T.PulseLikiditeKasasi, ISLETME, T.FthmYakici]).slice(2);
      const hh = keccak256(hookInit);
      if (!r.hookTuz || r.hookInitHash !== hh) {
        for (let i = 0; ; i++) {
          const t = "0x" + i.toString(16).padStart(64, "0");
          const a = getCreate2Address(C2, t, hh);
          if ((parseInt(a.slice(-4), 16) & HOOK_MASKE) === HOOK_BIT) { r.hookTuz = t; r.hookTahmin = a; break; }
        }
        r.hookInitHash = hh; yaz();
      }
    }
    const cctp = z.yol !== "relay";
    const args = {
      HaberciLZ: [z.usdc, lz.ep, cctp ? TM : SIFIR, cctp ? MT : SIFIR, z.domain, 26, ad === "arc", z.ham || SIFIR],
      SepetDefteri: [T.HaberciLZ, z.usdc],
      SepetKasasi: [T.HaberciLZ, z.usdc, 26, D],
      SepetUcu: [T.HaberciLZ, z.usdc, 26, D, T.PulseLaunchpad5],
      PulseFabrika4: [],
      PulseLikiditeKasasi: [z.usdc, T.PulseLaunchpad5],
      FthmYakici: [z.usdc, ARC_FTHM, 1_000_000n, fiyat],
      PulseLaunchpad5: [z.usdc, ARC_PM, r.hookTahmin, T.PulseFabrika4, T.SepetUcu, ARC_DEVPOOL, T.PulseLikiditeKasasi, ISLETME],
      IkizHub: [lz.ep],
      MerkezKapi: [T.PulseLaunchpad5, ARC_PM, IKIZ_YAYICI, TM, 26, T.SepetUcu, z.usdc, lz.ep, T.IkizHub],
      AktarmaLZ: [lz.ep],
    };
    console.log("  " + z.ad + "  (nonce " + n0 + ")");
    for (const [i, n] of s.entries()) {
      if (r[n] && (await z.p.getCode(r[n])).length > 2) { console.log("    " + n.padEnd(20) + r[n] + "  (zincirde)"); continue; }
      const a = art(n);
      const data = a.bytecode + coder.encode(a.abi.find((x) => x.type === "constructor")?.inputs.map((x) => x.type) || [], args[n]).slice(2);
      if (!UYGULA) {
        /* constructors that call other contracts (the LayerZero endpoint) run against the live chain here */
        const g = await z.p.estimateGas({ from: z.ben, data }).catch((e) => null);
        z.kuruGaz = (z.kuruGaz || 0n) + (g || BigInt(Math.ceil((data.length - 2) / 2 * 220 + 300_000)));
        console.log("    (kuru) " + n.padEnd(20) + T[n] + "  gaz " + (g || "? (boydan tahmin)"));
        continue;
      }
      let simdi = await z.p.getTransactionCount(z.ben, "pending");
      for (let d = 0; simdi < n0 + i && d < 20; d++) { await bekle(1500); simdi = await z.p.getTransactionCount(z.ben, "pending"); }
      if (simdi !== n0 + i) throw new Error(z.ad + " " + n + ": nonce " + simdi + ", beklenen " + (n0 + i) + " (araya baska islem girdi)");
      const t = await z.w.sendTransaction({ data });
      const m = await t.wait();
      if (m.status !== 1 || m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(z.ad + " " + n + " sapti");
      r[n] = T[n]; yaz();
      console.log("    " + n.padEnd(20) + T[n]);
      if (ad === "base") await bekle(6000);
    }
    if (ad !== "arc") continue;
    if (!UYGULA) { console.log("    (kuru) PulseHook5".padEnd(28) + r.hookTahmin + "  (CREATE2, tuz " + BigInt(r.hookTuz) + ")"); z.kuruGaz = (z.kuruGaz || 0n) + 3_500_000n; continue; }
    if ((await z.p.getCode(r.hookTahmin)).length > 2) console.log("    PulseHook5".padEnd(24) + r.hookTahmin + "  (zincirde)");
    else {
      const m = await (await z.w.sendTransaction({ to: C2, data: r.hookTuz + hookInit.slice(2) })).wait();
      let kod = await z.p.getCode(r.hookTahmin);
      for (let d = 0; kod.length <= 2 && d < 20; d++) { await bekle(1500); kod = await z.p.getCode(r.hookTahmin); }
      if (m.status !== 1 || kod.length <= 2) throw new Error("Arc hook yok");
      console.log("    PulseHook5".padEnd(24) + r.hookTahmin);
    }
    r.PulseHook5 = r.hookTahmin; yaz();
  }
  if (!UYGULA) await maliyet();
}

async function maliyet() {
  console.log("  MALIYET (kuru, simdiki gaz fiyatiyla; baglama ayri)");
  for (const ad of ZINCIRLER) {
    const z = Z[ad];
    const f = await z.p.getFeeData();
    const ucret = (z.kuruGaz || 0n) * (f.maxFeePerGas || f.gasPrice);
    const bakiye = await z.p.getBalance(z.ben);
    console.log("    " + z.ad.padEnd(9) + (Number(z.kuruGaz || 0n) / 1e6).toFixed(1) + "M gaz  ~" + (Number(ucret) / 1e18).toPrecision(3) +
      "  bakiye " + (Number(bakiye) / 1e18).toPrecision(4) + "  " + (bakiye >= ucret ? "YETER" : "EKSIK"));
  }
}

/* ---- 2 bagla -------------------------------------------------------------- */
const EP_ABI = ["function setSendLibrary(address,uint32,address)", "function setReceiveLibrary(address,uint32,address,uint256)",
  "function setConfig(address,address,(uint32,uint32,bytes)[])", "function getSendLibrary(address,uint32) view returns (address)",
  "function getConfig(address,address,uint32,uint32) view returns (bytes)"];
const uln = (onay, dvn) => coder.encode(["tuple(uint64,uint8,uint8,uint8,address[],address[])"], [[onay, 2, 0, 0, dvn, []]]);
/* LayerZero type 3 options: executor lzReceive (gas[, value]) */
const secenek = (gaz, deger) => deger
  ? "0x0003010021" + "01" + BigInt(gaz).toString(16).padStart(32, "0") + BigInt(deger).toString(16).padStart(32, "0")
  : "0x0003010011" + "01" + BigInt(gaz).toString(16).padStart(32, "0");

async function irisUcreti(kaynak, hedef) {
  const j = await fetch("https://iris-api.circle.com/v2/burn/USDC/fees/" + kaynak + "/" + hedef + "?forward=true").then((x) => x.json());
  const s = (Array.isArray(j) ? j : j.data || []).find((x) => x.finalityThreshold === 2000) || {};
  const ileri = s.forwardFee ? BigInt(s.forwardFee.high ?? s.forwardFee.med ?? s.forwardFee) : 0n;
  return ileri;
}

async function relayAdresi(hedefZincir, hedefToken, alici) {
  const g = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    user: alici, recipient: alici, originChainId: 5042, destinationChainId: hedefZincir, originCurrency: Z.arc.usdc,
    destinationCurrency: hedefToken, amount: "20000000", tradeType: "EXACT_INPUT", useDepositAddress: true, refundTo: alici }) }).then((x) => x.json());
  const a = g.steps && g.steps[0] && g.steps[0].depositAddress;
  if (!a) throw new Error("relay yatirma adresi yok: " + JSON.stringify(g).slice(0, 200));
  return a;
}

/* Dry run: every state-changing call is estimated against the chain as it is now instead of sent */
function sim(c) {
  if (UYGULA) return c;
  return new Proxy(c, { get(t, p) {
    const v = t[p];
    if (typeof p !== "string" || !t.interface) return v;
    let fr = null;
    try { fr = t.interface.getFunction(p); } catch (e) { return v; }
    if (!fr || fr.constant) return v;
    return (...a) => t[p].estimateGas(...a).then((g) => ({ wait: async () => ({ status: 1, gaz: g }) }));
  } });
}

async function bagla(kayit, yaz) {
  const K = (ad) => kayit.zincir[ad];
  for (const ad of ZINCIRLER) if (!K(ad).HaberciLZ) throw new Error(Z[ad].ad + " kurulu degil: once kur");
  const U = kayit.uzak || {};
  const kuyruk = [];
  const is = (ad, etiket, f) => kuyruk.push({ ad, etiket, f });
  const k = (ad, n) => sim(new Contract(K(ad)[n], art(n).abi, Z[ad].w));
  const arcEid = LZ[5042].eid;

  /* LayerZero paths for an OApp on chain `ad` toward eid `e` (receiving with `onayKarsi` confirmations) */
  const yolYaz = async (ad, oapp, e, onayKarsi, etiket) => {
    const la = LZ[Z[ad].id];
    const ep = sim(new Contract(la.ep, EP_ABI, Z[ad].w));
    const simdi = await ep.getConfig(oapp, la.send, e, 2).catch(() => "0x");
    if (simdi !== "0x" && simdi.toLowerCase() === uln(la.onay, la.dvn).toLowerCase()) return;
    is(ad, "LZ yol -> " + etiket, () => ep.setSendLibrary(oapp, e, la.send));
    is(ad, "LZ yol <- " + etiket, () => ep.setReceiveLibrary(oapp, e, la.recv, 0));
    is(ad, "ULN gonderim -> " + etiket + " (" + la.onay + ")", () => ep.setConfig(oapp, la.send, [[e, 2, uln(la.onay, la.dvn)]]));
    is(ad, "ULN alim <- " + etiket + " (" + onayKarsi + ")", () => ep.setConfig(oapp, la.recv, [[e, 2, uln(onayKarsi, la.dvn)]]));
  };

  /* A. Arc HaberciLZ: twins, routes, options */
  const hA = k("arc", "HaberciLZ");
  if ((await hA.secenek()) === "0x") is("arc", "secenek (600k)", () => hA.secenekKur(secenek(600_000)));
  for (const ad of ZINCIRLER) {
    if (ad === "arc") continue;
    const z = Z[ad], e = LZ[z.id].eid;
    if ((await hA.ikiz(z.domain)) === b32(SIFIR)) is("arc", "ikiz " + z.ad, () => hA.ikizEkle(z.domain, e, b32(K(ad).HaberciLZ)));
    if (Number(await hA.yol(z.domain)) === 0) {
      if (z.yol === "relay") {
        const r = K(ad).relayAdresi || (K(ad).relayAdresi = await relayAdresi(z.id, z.relayHedef, K(ad).HaberciLZ));
        is("arc", "yol " + z.ad + " RELAY " + r, () => hA.yolKur(z.domain, 2, r, 0, b32(SIFIR)));
      } else {
        const u = await irisUcreti(26, z.domain);
        const sinir = u * 2n + 50_000n;
        is("arc", "yol " + z.ad + " YONLENDIR (ust ucret " + Number(sinir) / 1e6 + " $)", () => hA.yolKur(z.domain, 1, SIFIR, sinir, b32(SIFIR)));
      }
    }
    await yolYaz("arc", K("arc").HaberciLZ, e, LZ[z.id].onay, z.ad + " HaberciLZ");
    await yolYaz(ad, K(ad).HaberciLZ, arcEid, LZ[5042].onay, "Arc HaberciLZ");
    /* the other side: its twin on Arc, and routes for payouts from it */
    const h = k(ad, "HaberciLZ");
    if ((await h.ikiz(26)) === b32(SIFIR)) is(ad, "ikiz Arc", () => h.ikizEkle(26, arcEid, b32(K("arc").HaberciLZ)));
    if (z.yol === "cctp") {
      for (const [hd, dom] of [["arc", 26], ...ZINCIRLER.filter((x) => x !== ad && Z[x].yol === "cctp").map((x) => [x, Z[x].domain]), ["solana", 5]]) {
        if (Number(await h.yol(dom)) !== 0) continue;
        const u = await irisUcreti(z.domain, dom);
        is(ad, "yol " + hd + " YONLENDIR", () => h.yolKur(dom, 1, SIFIR, u * 2n + 50_000n, b32(SIFIR)));
      }
      for (const dom of [8, 9]) if (Number(await h.yol(dom)) === 0) is(ad, "yol " + (dom === 8 ? "Sui" : "Aptos") + " DUZ", () => h.yolKur(dom, 3, SIFIR, 0, b32(SIFIR)));
    }
  }
  /* Arc: Solana, Sui, Aptos (their addresses from the Move / Solana deploy scripts) */
  if (U.solana && U.solana.kapi) {
    if ((await hA.ikiz(5)) === b32(SIFIR)) is("arc", "ikiz Solana", () => hA.ikizEkle(5, UZAK.solana.eid, U.solana.kapi));
    if (Number(await hA.yol(5)) === 0) {
      const u = await irisUcreti(26, 5);
      is("arc", "yol Solana YONLENDIR -> depo", () => hA.yolKur(5, 1, SIFIR, u * 2n + 50_000n, U.solana.dolarDepo));
    }
    if ((await hA.ozelSecenek(5)) === "0x") is("arc", "Solana secenegi", () => hA.ozelSecenekKur(5, U.solana.secenek));
    await yolYaz("arc", K("arc").HaberciLZ, UZAK.solana.eid, UZAK.solana.onay, "Solana kapisi");
  } else console.log("    (bekliyor) Solana kapisi kurulmadi: Arc HaberciLZ <-> Solana sonra");
  for (const [ad, dom, tip] of [["sui", 8, 4], ["aptos", 9, 5]]) {
    /* the CCTP identity orders go to: Sui the package's auth identity, Aptos its Haberci object (dagit-v2-move.js) */
    if (!(U[ad] && U[ad].karsi)) { console.log("    (bekliyor) " + ad + " paketi kurulmadi"); continue; }
    if ((await hA.ikiz(dom)) === b32(SIFIR)) is("arc", "ikiz " + ad + " (CCTP)", () => hA.ikizEkle(dom, UZAK[ad].eid, U[ad].karsi));
    if (Number(await hA.yol(dom)) === 0) is("arc", "yol " + ad + " CCTP emri", () => hA.yolKur(dom, tip, SIFIR, 0, b32(SIFIR)));
  }

  /* B. Defter */
  const d = k("arc", "SepetDefteri");
  for (const ad of ZINCIRLER) {
    const z = Z[ad];
    if ((await d.kasa(z.domain)) !== b32(SIFIR)) continue;
    is("arc", "Defter bagla " + z.ad, () => d.bagla(z.domain, ad === "arc" ? b32(K("arc").SepetUcu) : GIRISSIZ, b32(K(ad).SepetKasasi)));
  }
  for (const [ad, dom] of [["solana", 5], ["sui", 8], ["aptos", 9]]) {
    if (!(U[ad] && U[ad].kasa)) continue;
    if ((await d.kasa(dom)) === b32(SIFIR)) is("arc", "Defter bagla " + ad, () => d.bagla(dom, GIRISSIZ, U[ad].kasa));
  }

  /* C. the twin hub and the Base hop */
  const hub = k("arc", "IkizHub");
  if ((await hub.merkez()) === SIFIR) is("arc", "IkizHub merkez", () => hub.merkezKur(K("arc").MerkezKapi));
  if ((await hub.aktarma()) === b32(SIFIR)) is("arc", "IkizHub aktarma (Base)", () => hub.aktarmaKur(LZ[8453].eid, b32(K("base").AktarmaLZ)));
  await yolYaz("arc", K("arc").IkizHub, LZ[8453].eid, LZ[8453].onay, "Base AktarmaLZ");
  const ak = k("base", "AktarmaLZ");
  if ((await ak.hub()) === b32(SIFIR)) is("base", "AktarmaLZ hub", () => ak.hubKur(arcEid, b32(K("arc").IkizHub), secenek(800_000)));
  await yolYaz("base", K("base").AktarmaLZ, arcEid, LZ[5042].onay, "Arc IkizHub");
  if (U.solana && U.solana.kapi) {
    if ((await hub.kapi(UZAK.solana.eid)) === b32(SIFIR)) is("arc", "IkizHub Solana", () => hub.kapiEkle(UZAK.solana.eid, U.solana.kapi, U.solana.ikizSecenek));
    /* a twin's mint and metadata cost more lamports there than a transfer's token account */
    if ((await hub.yaratSecenek(UZAK.solana.eid)) === "0x") is("arc", "IkizHub Solana yaratma secenegi", () => hub.yaratSecenekKur(UZAK.solana.eid, U.solana.yaratSecenek));
    await yolYaz("arc", K("arc").IkizHub, UZAK.solana.eid, UZAK.solana.onay, "Solana kapisi");
  }
  for (const ad of ["sui", "aptos"]) {
    const u = U[ad];
    if (!(u && u.ikizKapi)) { console.log("    (bekliyor) " + ad + " ikiz kapisi kurulmadi"); continue; }
    const e = UZAK[ad].eid;
    /* toward the hop: gas for the hop's lzReceive and the native value its second hop costs */
    if ((await hub.kapi(e)) === b32(SIFIR)) is("arc", "IkizHub " + ad + " (aktarmali)", () => hub.aktarmaliKapiEkle(e, u.ikizKapi, secenek(250_000, u.ikinciAdim)));
    if ((await ak.kapi(e)) === b32(SIFIR)) is("base", "AktarmaLZ " + ad, () => ak.kapiEkle(e, u.ikizKapi, u.secenek));
    await yolYaz("base", K("base").AktarmaLZ, e, UZAK[ad].onay, ad + " ikiz kapisi");
  }

  /* Solana: LayerZero's executor default toward Solana caps a message at 200 bytes (read on Arc, 19 Oct);
     a YARAT is 256, a basket order up to 608. Both senders get 1.000; the Solana side fits them in one
     transaction through its address lookup table (pulse-kapi lz_receive_types_v2). */
  if (U.solana && U.solana.kapi) {
    const la = LZ[5042], ep = new Contract(la.ep, EP_ABI, Z.arc.w);
    for (const [ad, o] of [["IkizHub", K("arc").IkizHub], ["HaberciLZ", K("arc").HaberciLZ]]) {
      const lib = await ep.getSendLibrary(o, UZAK.solana.eid);
      const [m, yurutucu] = coder.decode(["tuple(uint32,address)"], await ep.getConfig(o, lib, UZAK.solana.eid, 1))[0];
      if (Number(m) >= 1000) continue;
      const yeni = coder.encode(["tuple(uint32,address)"], [[1000, yurutucu]]);
      is("arc", ad + " Solana yurutucu mesaj siniri " + m + " -> 1000", () => sim(ep).setConfig(o, lib, [[UZAK.solana.eid, 1, yeni]]));
    }
  }

  /* run */
  console.log("  " + kuyruk.length + " islem" + (UYGULA ? "" : " (kuru, gonderilmedi)"));
  let hata = 0;
  for (const x of kuyruk) {
    if (!UYGULA) {
      try { const m = await (await x.f()).wait(); console.log("    (kuru) " + Z[x.ad].ad.padEnd(10) + x.etiket.padEnd(52) + "gaz " + m.gaz); }
      catch (e) { hata++; console.log("    (kuru) HATA " + Z[x.ad].ad.padEnd(10) + x.etiket + ": " + (e.shortMessage || e.message).slice(0, 120)); }
      continue;
    }
    const t = await x.f(); const m = await t.wait();
    if (m.status !== 1) throw new Error(x.etiket);
    console.log("    " + Z[x.ad].ad.padEnd(9) + x.etiket);
    if (x.ad === "base") await bekle(4000);
  }
  if (!UYGULA) { console.log("  simulasyon: " + (kuyruk.length - hata) + " gecti, " + hata + " HATA"); return; }
  kayit.baglandi = new Date().toISOString(); yaz();
  /* what the site reads: written only once everything is wired, so the site never offers an unwired road */
  if (UYGULA) {
    const site = { zaman: kayit.baglandi, kapi: K("arc").MerkezKapi, launchpad: K("arc").PulseLaunchpad5, ucu: K("arc").SepetUcu,
      defter: K("arc").SepetDefteri, hub: K("arc").IkizHub, aktarma: K("base").AktarmaLZ, hook: K("arc").PulseHook5,
      /* the Sui / Aptos launch escrow: v4 deploys it with the set; v2 had it added later (dagit-launch-emaneti.js) */
      emanet: K("arc").LaunchEmaneti || (() => { try { return JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "sepet-v2.json"), "utf8")).emanet; } catch (e) { return undefined; } })(),
      surum: kayit.v4 ? 4 : 2,
      zincir: Object.fromEntries(ZINCIRLER.map((ad) => [ad, { domain: Z[ad].domain, haberci: K(ad).HaberciLZ, kasa: K(ad).SepetKasasi, dolar: Z[ad].usdc }])),
      uzak: Object.fromEntries(Object.entries(U).map(([ad, u]) => [ad, { kasa: u.kasa, ikizKapi: u.ikizKapi, karsi: u.karsi, paket: u.paket, ikizPaket: u.ikizPaket,
        kapiNesne: u.kapiNesne, oapp: u.oapp, hesap: u.hesap, ikizHesap: u.ikizHesap }])) };
    fs.writeFileSync(path.join(KOK, "docs", "veri", "sepet-v2.json"), JSON.stringify(site, null, 1));
    console.log("  site: docs/veri/sepet-v2.json yazildi");
  }
  console.log("TAMAM");
}
