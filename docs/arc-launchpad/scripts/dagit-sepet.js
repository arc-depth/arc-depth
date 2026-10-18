"use strict";
/* ===========================================================================
 * dagit-sepet.js — the basket product set on the EVM chains
 *
 *   node scripts/dagit-sepet.js yerel                 forks: Arbitrum as the centre, Base, BNB;
 *                                                     deploy + wire + a real launch, checked
 *   node scripts/dagit-sepet.js ana [zincir...]       mainnet, dry: plan and cost
 *   node scripts/dagit-sepet.js ana [zincir...] --uygula
 *
 * PER CHAIN, by CREATE at recorded nonces (addresses known before deploying):
 *   HaberciCctp   CCTP V2 messenger; on an island (BNB, Robinhood) the same
 *                 contract with no CCTP, every other chain reached through
 *   AdaKapisi     LayerZero gate to and from the islands (dollars never cross)
 *   SepetDefteri  the centre only (Arc on mainnet)
 *   SepetKasasi, SepetUcu (its launchpad = the PulseLaunchpad5 below)
 *   PulseFabrika4, PulseLikiditeKasasi, FthmYakici (FTHM of that chain, the
 *                 starting price read from the Arc FTHM pool), PulseLaunchpad5
 *   PulseHook5    by CREATE2 (Arachnid) at an address whose low 14 bits are 0x2ECC
 * WIRING (bagla): CCTP twins pairwise; the island gate on every chain, its
 *   twins island <-> everyone, with LayerZero libraries and ULN configs written
 *   explicitly (LayerZero Labs + Nethermind, each chain's own confirmations,
 *   from contracts/lz/ZincirTablosu.sol); Defter.bagla for every chain.
 *   Bindings are write-once (9e07f00); nothing is locked here: Sui, Aptos,
 *   Ethereum and Solana are added later, then everything is locked.
 * DevPool and the operating address are the ones the live launchpads use.
 * Record: dagitim-sepet.json (ana only). A stopped run resumes.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { JsonRpcProvider, FeeData, Wallet, NonceManager, Contract, Interface, AbiCoder, zeroPadValue, getBytes, hexlify,
  keccak256, Signature, getCreateAddress, getCreate2Address, toBeHex, solidityPacked } = require("ethers");

const KOK = path.join(__dirname, "..");
const KIP = process.argv[2];
const UYGULA = process.argv.includes("--uygula");
const SECILEN = process.argv.slice(3).filter((a) => !a.startsWith("--"));
const KAYIT = path.join(KOK, "dagitim-sepet.json");
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const SIFIR = "0x0000000000000000000000000000000000000000";
const HOOK_BIT = 0x2ECC, HOOK_MASKE = (1 << 14) - 1;
const ARC_FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE", IKIZ_FTHM = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const ARC_PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const ARC_FTHM_HAVUZ = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8")).havuzId;
const AG = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const b32 = (a) => zeroPadValue(a, 32);
const art = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();

/* chains: CCTP domain, dollar, LayerZero row (ZincirTablosu), live DevPool */
const Z = {
  arc: { ad: "Arc", id: 5042, domain: 26, rpc: "https://arc-rpc.publicnode.com", usdc: "0x3600000000000000000000000000000000000000",
    pm: ARC_PM, devPool: "0xA110b71c3f0748536f10C9e71A6E9F96999F6CD0", fthm: ARC_FTHM, port: 8641 },
  base: { ad: "Base", id: 8453, domain: 6, rpc: "https://mainnet.base.org", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    pm: "0x498581fF718922c3f8e6A244956aF099B2652b2b", devPool: AG.base && AG.base.DevPool, fthm: IKIZ_FTHM, port: 8642 },
  arbitrum: { ad: "Arbitrum", id: 42161, domain: 3, rpc: "https://arb1.arbitrum.io/rpc", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    pm: "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32", devPool: AG.arbitrum && AG.arbitrum.DevPool, fthm: IKIZ_FTHM, port: 8643 },
  avalanche: { ad: "Avalanche", id: 43114, domain: 1, rpc: "https://api.avax.network/ext/bc/C/rpc", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    pm: null, devPool: AG.avalanche && AG.avalanche.DevPool, fthm: IKIZ_FTHM, port: 8644 },
  monad: { ad: "Monad", id: 143, domain: 15, rpc: "https://rpc.monad.xyz", usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
    pm: null, devPool: AG.monad && AG.monad.DevPool, fthm: IKIZ_FTHM, port: 8645 },
  hyperevm: { ad: "HyperEVM", id: 999, domain: 19, rpc: "https://rpc.hyperliquid.xyz/evm", usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f",
    pm: null, devPool: AG.hyperevm && AG.hyperevm.DevPool, fthm: IKIZ_FTHM, port: 8646 },
  bsc: { ad: "BNB", id: 56, domain: 17, ada: true, rpc: "https://bsc-dataseed.bnbchain.org", catal: "https://bsc-mainnet.public.blastapi.io", usdc: "0xb233F129F7255F86d67BDAEA4e8c4f8274Fa70d9",
    pm: null, devPool: AG.bsc && AG.bsc.DevPool, fthm: IKIZ_FTHM, port: 8647 },
  /* added 18 Oct so a sale is paid on the seller's own chain and a basket line can sit there (F15) */
  ethereum: { ad: "Ethereum", id: 1, domain: 0, rpc: "https://ethereum-rpc.publicnode.com", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    pm: null, devPool: AG.ethereum && AG.ethereum.DevPool, fthm: IKIZ_FTHM, port: 8648 },
  robinhood: { ad: "Robinhood", id: 4663, domain: 35, rpc: "https://rpc.mainnet.chain.robinhood.com", usdc: "0x3884564BA51B349e7661c7e28Ad947DEE327FeDF",
    pm: null, devPool: "0x683D39831EF60b57E29BE4C55f1903f10Df857Bf", fthm: IKIZ_FTHM, port: 8649 },
};
/* PoolManagers from the chain registry where not written above */
{ const { EVM } = require("./zincirler"); for (const [k, z] of Object.entries(Z)) if (!z.pm) z.pm = EVM[k].poolManager; }
/* LayerZero rows, read from the contract that already wires the network */
const LZ = (() => {
  const s = fs.readFileSync(path.join(KOK, "contracts", "lz", "ZincirTablosu.sol"), "utf8");
  const r = {};
  for (const m of s.matchAll(/Zincir\((\d+), (\d+), (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), (\d+)\)/g))
    r[Number(m[1])] = { eid: Number(m[2]), ep: m[3], send: m[4], recv: m[5], dvn: [m[6], m[7]].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)), onay: Number(m[8]) };
  return r;
})();

if (!["yerel", "ana"].includes(KIP)) { console.error("kullanim: dagit-sepet.js <yerel|ana> [zincir...] [--uygula]"); process.exit(1); }
const MERKEZ = KIP === "yerel" ? "arbitrum" : "arc";
const ZINCIRLER = KIP === "yerel" ? ["arbitrum", "base", "bsc"] : (SECILEN.length ? SECILEN : Object.keys(Z));
if (!ZINCIRLER.includes(MERKEZ)) ZINCIRLER.unshift(MERKEZ);
const GERCEK = KIP === "ana" && UYGULA;
const evmAnahtar = () => fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();

/* ---- forks ------------------------------------------------------------- */
const anviller = [];
const yerelRpc = (url, m, p) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
async function catal(z) {
  anviller.push(cp.spawn("C:/Users/omen/araclar/foundry/anvil.exe", ["--fork-url", z.catal || z.rpc, "--port", String(z.port), "--chain-id", String(z.id), "--silent"], { stdio: "ignore" }));
  z.url = "http://127.0.0.1:" + z.port;
  for (let i = 0; i < 120; i++) { try { const r = await yerelRpc(z.url, "eth_blockNumber", []); if (r.result) return; } catch (e) {} await bekle(1000); }
  throw new Error("anvil acilmadi " + z.ad);
}

/* ---- per-chain stack ---------------------------------------------------- */
function sira(ad) {
  const s = ["HaberciCctp", "AdaKapisi"];
  if (ad === MERKEZ) s.push("SepetDefteri");
  s.push("SepetKasasi", "SepetUcu", "PulseFabrika4", "PulseLikiditeKasasi", "FthmYakici", "PulseLaunchpad5");
  return s;
}

async function fthmFiyati() {
  /* the Arc FTHM/USDC pool, read from Arc mainnet: slot0 of pools[id] (StateLibrary, POOLS_SLOT 6) */
  const p = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
  const yuva = keccak256(coder.encode(["bytes32", "uint256"], [ARC_FTHM_HAVUZ, 6]));
  const [kelime] = await new Contract(ARC_PM, ["function extsload(bytes32) view returns (bytes32)"], p).extsload.staticCall(yuva).then((x) => [x]);
  const sqrt = BigInt(kelime) & ((1n << 160n) - 1n);
  /* currency0 = USDC (0x36…) < FTHM (0x8c…): price = FTHM raw per USDC raw */
  return (sqrt * sqrt * 1_000_000n) >> 192n;   // FTHM raw per $1
}

(async () => {
  /* the dry run reads the record too, so it plans only what is missing (it never writes) */
  const kayit = KIP === "ana" && fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : { zincir: {} };
  const yaz = () => { if (GERCEK) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
  const pk = evmAnahtar();
  console.log("SEPET URUN SETI  " + KIP.toUpperCase() + (KIP === "ana" ? (UYGULA ? " UYGULA" : " KURU") : "") + "  merkez " + Z[MERKEZ].ad + "  zincirler " + ZINCIRLER.join(", "));
  for (const ad of ZINCIRLER) {
    const z = Z[ad];
    if (KIP === "yerel") await catal(z); else z.url = z.rpc;
    z.p = new JsonRpcProvider(z.url, z.id, { staticNetwork: true });
    const p = z.p;
    p.getFeeData = async () => {
      const blok = await p.getBlock("latest");
      /* chains without a base fee (BNB): the node's own gas price, not a guess */
      if (!blok.baseFeePerGas) { const g = BigInt(await p.send("eth_gasPrice", [])); return new FeeData(g, null, null); }
      const b = blok.baseFeePerGas, o = ad === "base" ? 1_000_000n : b / 10n + 1n;
      return new FeeData(null, b * 2n + o, o);
    };
    z.w = new NonceManager(new Wallet(pk, p));
    z.ben = await z.w.getAddress();
    if (KIP === "yerel") await yerelRpc(z.url, "anvil_setBalance", [z.ben, "0x8AC7230489E80000"]);
    kayit.zincir[ad] ||= {};
  }
  const ben = Z[MERKEZ].ben;
  const fiyat = await fthmFiyati();
  console.log("  FTHM fiyati (Arc havuzu): 1 $ = " + (Number(fiyat) / 1e18).toFixed(2) + " FTHM");

  /* 1 kur: predict every address from the nonce, then deploy in order */
  for (const ad of [MERKEZ, ...ZINCIRLER.filter((x) => x !== MERKEZ)]) {
    const z = Z[ad], r = kayit.zincir[ad];
    const n0 = r.n0 != null ? r.n0 : await z.p.getTransactionCount(z.ben, "pending");
    if (r.n0 == null) { r.n0 = n0; yaz(); }
    const s = sira(ad);
    const T = {};
    s.forEach((n, i) => { T[n] = getCreateAddress({ from: z.ben, nonce: n0 + i }); });
    if (ad === MERKEZ) kayit.defter = T.SepetDefteri;
    const D = b32(kayit.defter);
    const merkezDomain = Z[MERKEZ].domain;
    const hookInit = art("PulseHook5").bytecode + coder.encode(["address", "address", "address", "address", "address", "address", "address"],
      [z.pm, T.PulseLaunchpad5, z.usdc, z.devPool, T.PulseLikiditeKasasi, ISLETME, T.FthmYakici]).slice(2);
    const hh = keccak256(hookInit);
    if (!r.hookTuz || r.hookInitHash !== hh) {
      for (let i = 0; ; i++) {
        const t = "0x" + i.toString(16).padStart(64, "0");
        const a = getCreate2Address(C2, t, hh);
        if ((parseInt(a.slice(-4), 16) & HOOK_MASKE) === HOOK_BIT) { r.hookTuz = t; r.hookTahmin = a; break; }
      }
      r.hookInitHash = hh; yaz();
    }
    const ep = LZ[z.id].ep;
    const args = {
      HaberciCctp: [z.usdc, z.ada ? SIFIR : MT, z.ada ? SIFIR : TM, z.domain],
      AdaKapisi: [ep, T.HaberciCctp, z.usdc],
      SepetDefteri: [T.HaberciCctp, z.usdc],
      SepetKasasi: [T.HaberciCctp, z.usdc, merkezDomain, D],
      SepetUcu: [T.HaberciCctp, z.usdc, merkezDomain, D, T.PulseLaunchpad5],
      PulseFabrika4: [],
      PulseLikiditeKasasi: [z.usdc, T.PulseLaunchpad5],
      FthmYakici: [z.usdc, z.fthm, 1_000_000n, fiyat],
      PulseLaunchpad5: [z.usdc, z.pm, r.hookTahmin, T.PulseFabrika4, T.SepetUcu, z.devPool, T.PulseLikiditeKasasi, ISLETME],
    };
    console.log("  " + z.ad + "  (nonce " + n0 + ")");
    for (const [i, n] of s.entries()) {
      if (r[n] && (await z.p.getCode(r[n])).length > 2) { console.log("    " + n.padEnd(20) + r[n] + "  (zincirde)"); continue; }
      const a = art(n);
      const data = a.bytecode + coder.encode(a.abi.find((x) => x.type === "constructor")?.inputs.map((x) => x.type) || [], args[n]).slice(2);
      if (KIP === "ana" && !UYGULA) {
        const g = await z.p.estimateGas({ from: z.ben, data }).catch((e) => null);
        z.kuruGaz = (z.kuruGaz || 0n) + (g || 3_000_000n);
        console.log("    (kuru) " + n.padEnd(20) + T[n] + "  gaz " + (g || "? (3M sayildi)")); continue;
      }
      /* the node may lag a moment behind its own last receipt: wait for it, but never accept a nonce past ours */
      let simdi = await z.p.getTransactionCount(z.ben, "pending");
      for (let d = 0; simdi < n0 + i && d < 20; d++) { await bekle(1500); simdi = await z.p.getTransactionCount(z.ben, "pending"); }
      if (simdi !== n0 + i) throw new Error(z.ad + " " + n + ": nonce " + simdi + ", beklenen " + (n0 + i) + " (araya baska islem girdi)");
      const t = await z.w.sendTransaction({ data });
      const m = await t.wait();
      if (m.status !== 1 || m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(z.ad + " " + n + " sapti");
      r[n] = T[n]; yaz();
      console.log("    " + n.padEnd(20) + T[n]);
      if (ad === "base" && KIP === "ana") await bekle(6000);
    }
    if (KIP === "ana" && !UYGULA) { console.log("    (kuru) PulseHook5".padEnd(28) + r.hookTahmin + "  (CREATE2, tuz " + BigInt(r.hookTuz) + ")"); continue; }
    if ((await z.p.getCode(r.hookTahmin)).length > 2) console.log("    PulseHook5".padEnd(24) + r.hookTahmin + "  (zincirde)");
    else {
      const m = await (await z.w.sendTransaction({ to: C2, data: r.hookTuz + hookInit.slice(2) })).wait();
      let kod = await z.p.getCode(r.hookTahmin);
      for (let d = 0; kod.length <= 2 && d < 20; d++) { await bekle(1500); kod = await z.p.getCode(r.hookTahmin); }
      if (m.status !== 1 || kod.length <= 2) throw new Error(z.ad + " hook yok");
      console.log("    PulseHook5".padEnd(24) + r.hookTahmin);
    }
    r.PulseHook5 = r.hookTahmin; yaz();
  }
  if (KIP === "ana" && !UYGULA) return kuruMaliyet(kayit);

  /* 2 bagla */
  const k = (ad, n, abiAd) => new Contract(kayit.zincir[ad][n], art(abiAd || n).abi, Z[ad].w);
  const is = async (ad, etiket, f) => {
    const t = await f(); const m = await t.wait();
    if (m.status !== 1) throw new Error(etiket);
    console.log("    " + Z[ad].ad.padEnd(9) + etiket);
    if (ad === "base" && KIP === "ana") await bekle(6000);
  };
  console.log("  BAGLA");
  const adalar = ZINCIRLER.filter((a) => Z[a].ada), cctp = ZINCIRLER.filter((a) => !Z[a].ada);
  for (const a of ZINCIRLER) {
    const h = k(a, "HaberciCctp");
    if ((await h.adaKapisi()) === SIFIR) await is(a, "adaKapisiKur", () => h.adaKapisiKur(kayit.zincir[a].AdaKapisi));
    for (const b of ZINCIRLER) {
      if (a === b) continue;
      if (!Z[a].ada && !Z[b].ada) {
        if ((await h.ikiz(Z[b].domain)) === b32(SIFIR)) await is(a, "ikizEkle " + Z[b].ad, () => h.ikizEkle(Z[b].domain, b32(kayit.zincir[b].HaberciCctp)));
      } else if (!(await h.ada(Z[b].domain))) await is(a, "adaYap " + Z[b].ad, () => h.adaYap(Z[b].domain));
    }
  }
  /* the island gates: twins and LayerZero paths, island <-> everyone */
  const epAbi = ["function setSendLibrary(address,uint32,address)", "function setReceiveLibrary(address,uint32,address,uint256)",
    "function setConfig(address,address,(uint32,uint32,bytes)[])", "function getSendLibrary(address,uint32) view returns (address)"];
  const uln = (onay, dvn) => coder.encode(["tuple(uint64,uint8,uint8,uint8,address[],address[])"], [[onay, 2, 0, 0, dvn, []]]);
  for (const a of ZINCIRLER) for (const b of ZINCIRLER) {
    if (a === b || (!Z[a].ada && !Z[b].ada)) continue;
    const g = k(a, "AdaKapisi");
    if ((await g.ikiz(Z[b].domain)) !== b32(SIFIR)) continue;
    const la = LZ[Z[a].id], lb = LZ[Z[b].id];
    const e = new Contract(la.ep, epAbi, Z[a].w);
    const kapi = kayit.zincir[a].AdaKapisi;
    await is(a, "LZ gonderim kutuphanesi -> " + Z[b].ad, () => e.setSendLibrary(kapi, lb.eid, la.send));
    await is(a, "LZ alim kutuphanesi <- " + Z[b].ad, () => e.setReceiveLibrary(kapi, lb.eid, la.recv, 0));
    await is(a, "ULN gonderim -> " + Z[b].ad + " (" + la.onay + " onay)", () => e.setConfig(kapi, la.send, [[lb.eid, 2, uln(la.onay, la.dvn)]]));
    await is(a, "ULN alim <- " + Z[b].ad + " (" + lb.onay + " onay)", () => e.setConfig(kapi, la.recv, [[lb.eid, 2, uln(lb.onay, la.dvn)]]));
    await is(a, "AdaKapisi ikiz " + Z[b].ad, () => g.ikizEkle(Z[b].domain, lb.eid, b32(kayit.zincir[b].AdaKapisi)));
  }
  const defter = k(MERKEZ, "SepetDefteri");
  for (const a of ZINCIRLER) {
    if ((await defter.kasa(Z[a].domain)) !== b32(SIFIR)) continue;
    await is(MERKEZ, "Defter bagla " + Z[a].ad, () => defter.bagla(Z[a].domain, b32(kayit.zincir[a].SepetUcu), b32(kayit.zincir[a].SepetKasasi)));
  }
  kayit.zaman = new Date().toISOString(); yaz();
  if (KIP === "yerel") await dene(kayit, k);
  console.log("TAMAM");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); if (process.env.AYRINTI) console.error(e.stack); process.exitCode = 1; })
  .finally(() => { for (const a of anviller) a.kill(); });

async function kuruMaliyet() {
  /* deployment as estimated, plus the hook (~3M) and the wiring (~120k per call: twins, gates, LayerZero paths, Defter) */
  const ada = ZINCIRLER.filter((a) => Z[a].ada).length, n = ZINCIRLER.length;
  console.log("  MALIYET (kuru, simdiki gaz fiyatiyla)");
  for (const ad of ZINCIRLER) {
    const z = Z[ad];
    const baglaCagri = 1 + (n - 1) + (Z[ad].ada ? (n - 1) * 5 : ada * 5) + (ad === MERKEZ ? n : 0);
    const gaz = (z.kuruGaz || 0n) + 3_000_000n + BigInt(baglaCagri) * 120_000n;
    const f = await z.p.getFeeData();
    const ucret = gaz * (f.maxFeePerGas || f.gasPrice);
    const bakiye = await z.p.getBalance(z.ben);
    console.log("    " + z.ad.padEnd(9) + (Number(gaz) / 1e6).toFixed(1) + "M gaz  ~" + (Number(ucret) / 1e18).toPrecision(3) + "  bakiye " + (Number(bakiye) / 1e18).toPrecision(4) + "  " + (bakiye >= ucret ? "YETER" : "EKSIK"));
  }
  console.log("  (kuru) once 'yerel' ayni adimlari catallarda calistirir; sonra --uygula");
}

/* ---- yerel only: one real launch through everything --------------------- */
async function dene(kayit, k) {
  const A = Z[MERKEZ], B = Z.base, N = Z.bsc;
  console.log("  DENE (yerel): merkezden launch, sepet merkez + Base (CCTP) + BNB (ada)");
  /* our own attester on the forks */
  const att = new Wallet("0x" + "a7".repeat(32));
  for (const z of [A, B]) {
    const mt = new Contract(MT, ["function attesterManager() view returns (address)", "function enableAttester(address)", "function setSignatureThreshold(uint256)"], z.p);
    const yon = await mt.attesterManager();
    await yerelRpc(z.url, "anvil_impersonateAccount", [yon]);
    await yerelRpc(z.url, "anvil_setBalance", [yon, "0x56BC75E2D63100000"]);
    const s = await z.p.getSigner(yon);
    await (await mt.connect(s).enableAttester(att.address)).wait();
    await (await mt.connect(s).setSignatureThreshold(1)).wait();
  }
  /* dollars on the forks (FiatToken balances slot 9; Dolar6 is ours: wrap after funding the peg) */
  const ver = async (z, tok, slot, miktar) => {
    await yerelRpc(z.url, "anvil_setStorageAt", [tok, keccak256(coder.encode(["address", "uint256"], [z.ben, slot])), toBeHex(miktar, 32)]);
  };
  await ver(A, A.usdc, 9, 1_000_000_000n);
  await ver(B, B.usdc, 9, 1_000_000_000n);
  const peg = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
  const pegSlot = await bulYuva(N, peg);
  await ver(N, peg, pegSlot, 1_000n * 10n ** 18n);
  const d6 = new Contract(N.usdc, ["function sar(uint256) returns (uint256)", "function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], N.w);
  await (await new Contract(peg, ["function approve(address,uint256) returns (bool)"], N.w).approve(N.usdc, 1_000n * 10n ** 18n)).wait();
  await (await d6.sar(500_000_000n)).wait();
  /* basket assets: real tokens of each chain (WETH on Arbitrum and Base, WBNB on BNB) */
  const WETH = { arbitrum: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", base: "0x4200000000000000000000000000000000000006" };
  const WBNB = "0xbb4CdB9CBd36B01bD8cBaEBF46B375b0F0dC4b9F";
  /* the basket must total at least $20 (ASGARI_TEMINAT) */
  const kalem = [[A.domain, b32(WETH.arbitrum), 8_000_000n], [B.domain, b32(WETH.base), 8_000_000n], [N.domain, b32(WBNB), 4_000_000n]];
  const ref = [34n * 10n ** 14n, 34n * 10n ** 14n, 56n * 10n ** 14n];   // ~ $8 of ETH, $4 of BNB
  const lp = k(MERKEZ, "PulseLaunchpad5");
  const usdcA = new Contract(A.usdc, ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"], A.w);
  await (await usdcA.approve(await lp.getAddress(), 10n ** 12n)).wait();
  const once = await usdcA.balanceOf(A.ben);
  const t = await lp.launch("Sepet Prova", "SPROVA", kalem, ref, 20_000, 100_000_000n);
  const m = await t.wait();
  console.log("    launch: " + m.hash + "  harcanan " + Number(once - (await usdcA.balanceOf(A.ben))) / 1e6 + " $");
  /* relay: CCTP to Base, LayerZero to BNB (delivered by impersonating the endpoint, as the executor would) */
  const MESAJ = keccak256(Buffer.from("MessageSent(bytes)"));
  let nonce = 1n;
  const tumKayitlar = [...m.logs];
  for (const l of tumKayitlar) {
    if (l.address.toLowerCase() !== MT.toLowerCase() || l.topics[0] !== MESAJ) continue;
    const ham = getBytes(coder.decode(["bytes"], l.data)[0]);
    ham.set(getBytes(toBeHex(nonce++, 32)), 12);
    ham.set(getBytes("0x000007d0"), 144);
    const imza = Signature.from(att.signingKey.sign(keccak256(ham))).serialized;
    const hedef = Number(BigInt(hexlify(ham.slice(8, 12))));
    const z = Object.values(Z).find((x) => x.domain === hedef && x.p);
    await (await k(z === A ? MERKEZ : "base", "HaberciCctp").teslim(hexlify(ham), imza)).wait();
    console.log("    CCTP teslim -> " + z.ad);
  }
  const kuyruk = new Interface(art("AdaKapisi").abi);
  for (const l of tumKayitlar) {
    let e; try { e = kuyruk.parseLog(l); } catch (x) { continue; }
    if (!e || e.name !== "Kuyruk") continue;
    const g = k(MERKEZ, "AdaKapisi");
    const lz = LZ[A.id];
    const ucret = await g.ucret(e.args.hedefZincir, coder.encode(["uint8", "bytes[]"], [1, [e.args.mesaj]]), "0x00030100110100000000000000000000000000061a80").catch(() => 0n);
    console.log("    ada kuyrugu #" + e.args.id + " -> " + Z.bsc.ad + " " + Number(e.args.miktar) / 1e6 + " $  (LZ ucreti teklifi " + ucret + ")");
    /* deliver on BNB as LayerZero's endpoint would */
    const epN = LZ[N.id].ep;
    await yerelRpc(N.url, "anvil_impersonateAccount", [epN]);
    await yerelRpc(N.url, "anvil_setBalance", [epN, "0x56BC75E2D63100000"]);
    const gN = new Contract(kayit.zincir.bsc.AdaKapisi, art("AdaKapisi").abi, await N.p.getSigner(epN));
    const msg = coder.encode(["uint8", "bytes[]"], [1, [e.args.mesaj]]);
    await (await gN.lzReceive([lz.eid, b32(kayit.zincir[MERKEZ].AdaKapisi), 1], b32(SIFIR), msg, epN, "0x")).wait();
    /* the filler pays it on BNB from its own Dolar6 */
    const gF = k("bsc", "AdaKapisi");
    await (await d6.approve(kayit.zincir.bsc.AdaKapisi, e.args.miktar)).wait();
    await (await gF.doldur(A.domain, e.args.mesaj, b32(N.ben))).wait();
    console.log("    BNB doldurdu: " + Number(e.args.miktar) / 1e6 + " $ Dolar6 ile");
  }
  for (const [ad, n] of [[MERKEZ, A], ["base", B], ["bsc", N]]) {
    const ks = k(ad, "SepetKasasi");
    console.log("    " + n.ad.padEnd(9) + "kasa ihale " + (await ks.ihaleSayisi()) + "  launch 1 dolari " + Number(await ks.usdcBakiye(1)) / 1e6 + " $");
  }
}

/// The balance slot of an ERC-20 on a fork: try the usual ones.
async function bulYuva(z, tok) {
  const c = new Contract(tok, ["function balanceOf(address) view returns (uint256)"], z.p);
  for (const s of [0, 1, 2, 3, 4, 5, 6, 9, 51]) {
    const y = keccak256(coder.encode(["address", "uint256"], [z.ben, s]));
    const eski = await yerelRpc(z.url, "eth_getStorageAt", [tok, y, "latest"]);
    await yerelRpc(z.url, "anvil_setStorageAt", [tok, y, toBeHex(12345n, 32)]);
    const b = await c.balanceOf(z.ben);
    await yerelRpc(z.url, "anvil_setStorageAt", [tok, y, eski.result]);
    if (b === 12345n) return s;
  }
  throw new Error("bakiye yuvasi bulunamadi " + tok);
}
