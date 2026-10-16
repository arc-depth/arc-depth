"use strict";
/* ===========================================================================
 * atlas-indeks.js — GENESIS ATLAS: the map's data, read straight from the
 *                   chains, no paid API
 *
 *   node scripts/atlas-indeks.js [--pencere <saniye>] [--hafiza]
 *
 * WHAT IT READS, PER CHAIN (public RPCs only)
 *   head block, block time, gas price, native USDC supply
 *   capital flow   Circle CCTP V2 DepositForBurn on TokenMessengerV2
 *                  (0x28b5…cf5d, same on every EVM chain): every dollar that
 *                  left this chain for another, by destination domain
 *   messages       LayerZero EndpointV2 PacketSent, by destination eid
 *                  (read from the packet header, offset 45)
 *   new markets    Uniswap v4 PoolManager Initialize: pools born in the window
 *   non-EVM nodes  Solana slot, Sui checkpoint, Aptos ledger version (free
 *                  public RPCs) — present on the map, flows only via the
 *                  EVM side's view of them (CCTP domain / LayerZero eid)
 * DISCOVERY (open data, free)
 *   chainid.network/chains.json   every registered EVM chain; new ids since
 *                                 the last run are recorded as discoveries
 *   LayerZero metadata API        which chains the messaging mesh reaches
 *   unknown CCTP domains / LZ eids seen in real traffic become nodes
 * ANALYSIS
 *   each flow edge's next-window volume is forecast by three methods (last,
 *   mean of 5, EMA 0.3); their errors over the stored history are scored and
 *   the best is named — methods are tested, not assumed. Spikes (> 3× an
 *   edge's median, ≥ 5 points of history), new edges and new-pool bursts are
 *   recorded as discoveries.
 * OUTPUT
 *   docs/veri/atlas.json          the latest snapshot the map draws
 *   docs/veri/atlas-gecmis.json   compact history (last 288 windows) for the
 *                                 map's time slider and the analysis
 *   --hafiza: discoveries written to GENESIS memory (category 8) when the
 *   core is on chain, through scripts/genesis-ajan.js's agent key.
 * Everything here is a count or a sum of on-chain events in a stated block
 * window. Nothing is estimated, and a chain that did not answer is listed
 * as such, never as zero.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Interface, id, keccak256, toUtf8Bytes, Contract, Wallet } = require("ethers");
const { EVM, DIGER, saglayici } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const CIKTI = path.join(KOK, "docs", "veri", "atlas.json");
const GECMIS = path.join(KOK, "docs", "veri", "atlas-gecmis.json");
const ONBELLEK = path.join(KOK, "genesis", "atlas");
const arg = (ad, varsay) => { const i = process.argv.indexOf(ad); return i > 0 ? process.argv[i + 1] : varsay; };
const PENCERE = Number(arg("--pencere", "900"));     // seconds of history per run
const HAFIZA = process.argv.includes("--hafiza");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
/* a chain that hangs is reported as not answering; it must not stall the map */
const sinirli = (p, ms, etiket) => Promise.race([p, new Promise((_, h) => setTimeout(() => h(new Error(etiket + ": " + ms / 1000 + " sn icinde cevap yok")), ms))]);

const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const T_CCTP = id("DepositForBurn(address,uint256,address,bytes32,uint32,bytes32,bytes32,uint256,uint32,bytes)");
const T_LZ = id("PacketSent(bytes,bytes,address)");
const T_V4 = id("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)");
const CCTP_IF = new Interface(["event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)"]);
const LZ_IF = new Interface(["event PacketSent(bytes encodedPayload, bytes options, address sendLibrary)"]);
/* CCTP domain names (Circle's published list); domains seen in traffic but
   not here are shown as "CCTP domain n" — never guessed */
const CCTP_ADI = { 0: "Ethereum", 1: "Avalanche", 2: "OP Mainnet", 3: "Arbitrum", 5: "Solana", 6: "Base", 7: "Polygon PoS",
  8: "Sui", 9: "Aptos", 10: "Unichain", 11: "Linea", 12: "Codex", 13: "Sonic", 14: "World Chain", 15: "Monad", 16: "Sei",
  17: "BNB Chain", 18: "XDC", 19: "HyperEVM", 21: "Ink", 22: "Plume", 26: "Arc" };

async function israr(f, deneme = 6) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) {
      const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {});
      if (d >= deneme || !/rate|limit|timeout|503|502|429|ECONNRESET|fetch failed|coalesce|too many|exceed/i.test(m)) throw e;
      await bekle(1500 * (d + 1));
    }
  }
}

async function loglar(p, filtre, ilk, son, parca) {
  const out = [];
  for (let a = ilk; a <= son; a += parca) {
    const b = Math.min(son, a + parca - 1);
    out.push(...(await israr(() => p.getLogs({ ...filtre, fromBlock: a, toBlock: b }))));
  }
  return out;
}

/* free RPCs that serve log queries for this job (measured 15 Oct 2026),
   and each one's block-range limit for eth_getLogs */
const ATLAS_RPC = { base: "https://base-rpc.publicnode.com", bsc: "https://bsc-rpc.publicnode.com" };
const PARCA = { monad: 100, bsc: 1000, avalanche: 1000 };

async function evmZincir(anahtar, z) {
  /* the log-capable override when there is one, otherwise the backup-aware provider */
  const p = ATLAS_RPC[anahtar] ? new JsonRpcProvider(ATLAS_RPC[anahtar], z.chainId, { staticNetwork: true }) : saglayici(anahtar);
  const son = await israr(() => p.getBlockNumber());
  const [b1, b0] = await Promise.all([israr(() => p.getBlock(son)), israr(() => p.getBlock(Math.max(0, son - 1000)))]);
  const blokSuresi = (b1.timestamp - b0.timestamp) / Math.max(1, son - Math.max(0, son - 1000));
  const blokSayisi = Math.min(Math.ceil(PENCERE / Math.max(blokSuresi, 0.05)), 20000);
  const ilk = Math.max(0, son - blokSayisi + 1);
  const parca = PARCA[anahtar] || 2000;
  const fd = await israr(() => p.getFeeData());
  const gaz = fd.gasPrice != null ? Number(fd.gasPrice) / 1e9 : null;
  let usdcArz = null;
  if (z.dolar && z.dolar.sembol === "USDC" && z.cctp != null) {
    try { usdcArz = Number(await new Contract(z.dolar.adres, ["function totalSupply() view returns (uint256)"], p).totalSupply()) / 1e6; }
    catch (e) { usdcArz = null; }
  }
  const sonuc = { anahtar, ad: z.ad, tur: "evm", chainId: z.chainId, eid: z.eid, cctp: z.cctp, blok: son, blokSuresi: +blokSuresi.toFixed(3),
    gazGwei: gaz == null ? null : +gaz.toFixed(4), usdcArz, pencere: { ilk, son, saniye: b1.timestamp - (b1.timestamp - Math.round(blokSayisi * blokSuresi)) },
    cctpCikis: {}, lzCikis: {}, yeniHavuz: 0, hatalar: [] };

  try {
    const l = await loglar(p, { address: TM, topics: [T_CCTP] }, ilk, son, parca);
    for (const x of l) {
      const e = CCTP_IF.parseLog(x);
      const d = Number(e.args.destinationDomain);
      const m = Number(e.args.amount) / 1e6;
      const k = (sonuc.cctpCikis[d] = sonuc.cctpCikis[d] || { adet: 0, miktar: 0 });
      k.adet++; k.miktar += m;
    }
  } catch (e) { sonuc.hatalar.push("cctp: " + (e.shortMessage || e.message).slice(0, 80)); }

  try {
    const l = await loglar(p, { address: z.endpoint, topics: [T_LZ] }, ilk, son, parca);
    for (const x of l) {
      const pkt = LZ_IF.parseLog(x).args.encodedPayload;
      const dst = parseInt(pkt.slice(2 + 45 * 2, 2 + 49 * 2), 16);
      sonuc.lzCikis[dst] = (sonuc.lzCikis[dst] || 0) + 1;
    }
  } catch (e) { sonuc.hatalar.push("layerzero: " + (e.shortMessage || e.message).slice(0, 80)); }

  if (z.poolManager) {
    try { sonuc.yeniHavuz = (await loglar(p, { address: z.poolManager, topics: [T_V4] }, ilk, son, parca)).length; }
    catch (e) { sonuc.hatalar.push("v4: " + (e.shortMessage || e.message).slice(0, 80)); }
  }
  sonuc.pencere.saniye = Math.round(blokSayisi * blokSuresi);
  return sonuc;
}

async function jsonRpc(url, method, params) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function digerZincir(anahtar, z) {
  const s = { anahtar, ad: z.ad, tur: z.calisma, eid: z.eid, cctp: z.cctp, blok: null, hatalar: [] };
  try {
    if (anahtar === "solana") s.blok = await jsonRpc("https://api.mainnet-beta.solana.com", "getSlot", []);
    if (anahtar === "sui") s.blok = Number(await jsonRpc("https://sui-rpc.publicnode.com", "sui_getLatestCheckpointSequenceNumber", []));
    if (anahtar === "aptos") s.blok = Number((await fetch("https://api.mainnet.aptoslabs.com/v1").then((r) => r.json())).ledger_version);
  } catch (e) { s.hatalar.push((e.message || "").slice(0, 80)); }
  return s;
}

async function kesifKaynaklari() {
  fs.mkdirSync(ONBELLEK, { recursive: true });
  const out = { evmKayit: null, lz: null };
  try {
    const liste = await fetch("https://chainid.network/chains.json", { signal: AbortSignal.timeout(40000) }).then((r) => r.json());
    out.evmKayit = liste.map((c) => ({ chainId: c.chainId, ad: c.name }));
  } catch (e) { out.hata = "chainid.network: " + e.message; }
  try {
    const m = await fetch("https://metadata.layerzero-api.com/v1/metadata", { signal: AbortSignal.timeout(40000) }).then((r) => r.json());
    out.lz = {};
    for (const [k, v] of Object.entries(m)) {
      for (const d of v.deployments || []) if (d.version === 2 && d.eid && String(d.eid).startsWith("30")) out.lz[d.eid] = (v.chainDetails && v.chainDetails.name) || k;
    }
  } catch (e) { out.hataLz = "layerzero metadata: " + e.message; }
  return out;
}

/* ---- analysis: forecast methods tested against history -------------- */
function yontemler(seri) {
  const m = {
    son: (h) => h[h.length - 1],
    ortalama5: (h) => { const s = h.slice(-5); return s.reduce((a, b) => a + b, 0) / s.length; },
    ema03: (h) => h.reduce((e, x, i) => (i === 0 ? x : 0.3 * x + 0.7 * e), 0)
  };
  const hata = {};
  for (const [ad, f] of Object.entries(m)) {
    let t = 0, n = 0;
    for (let i = 3; i < seri.length; i++) { t += Math.abs(f(seri.slice(0, i)) - seri[i]); n++; }
    hata[ad] = n ? t / n : null;
  }
  return hata;
}

(async () => {
  const basla = Date.now();
  const anahtarlar = Object.keys(EVM);
  const evm = await Promise.all(anahtarlar.map((k) => sinirli(evmZincir(k, EVM[k]), 150000, k).then((z) => { console.log("  okundu " + k); return z; }).catch((e) => ({ anahtar: k, ad: EVM[k].ad, tur: "evm", hatalar: ["okunamadi: " + (e.shortMessage || e.message).slice(0, 80)] }))));
  const diger = await Promise.all(Object.entries(DIGER).map(([k, z]) => sinirli(digerZincir(k, z), 30000, k).catch((e) => ({ anahtar: k, ad: z.ad, tur: z.calisma, eid: z.eid, cctp: z.cctp, blok: null, hatalar: [e.message] }))));
  const kaynak = await sinirli(kesifKaynaklari(), 60000, "acik veri").catch((e) => ({ hata: e.message }));

  /* nodes: our chains, then every CCTP domain / LZ eid seen in traffic */
  const dugum = {};
  for (const z of [...evm, ...diger]) dugum["z:" + z.anahtar] = { id: "z:" + z.anahtar, ad: z.ad, tur: z.tur, eid: z.eid, cctp: z.cctp, blok: z.blok, blokSuresi: z.blokSuresi, gazGwei: z.gazGwei, usdcArz: z.usdcArz, yeniHavuz: z.yeniHavuz, hatalar: z.hatalar, bizim: true };
  const cctpId = (d) => { const z = Object.values(dugum).find((x) => x.cctp === d); return z ? z.id : "cctp:" + d; };
  const lzId = (e) => { const z = Object.values(dugum).find((x) => x.eid === e); return z ? z.id : "lz:" + e; };
  const kenar = [];
  for (const z of evm) {
    if (!z.cctpCikis) continue;
    for (const [d, v] of Object.entries(z.cctpCikis)) {
      const hedef = cctpId(Number(d));
      if (!dugum[hedef]) dugum[hedef] = { id: hedef, ad: CCTP_ADI[d] || "CCTP domain " + d, tur: "dis", cctp: Number(d) };
      kenar.push({ kaynak: "z:" + z.anahtar, hedef, tur: "cctp", adet: v.adet, miktar: +v.miktar.toFixed(2) });
    }
    for (const [e, n] of Object.entries(z.lzCikis || {})) {
      const hedef = lzId(Number(e));
      if (!dugum[hedef]) dugum[hedef] = { id: hedef, ad: (kaynak.lz && kaynak.lz[e]) || "LayerZero eid " + e, tur: "dis", eid: Number(e) };
      kenar.push({ kaynak: "z:" + z.anahtar, hedef, tur: "lz", adet: n });
    }
  }

  /* history, discoveries, methods */
  const gecmis = fs.existsSync(GECMIS) ? JSON.parse(fs.readFileSync(GECMIS, "utf8")) : [];
  const anahtarK = (k) => k.tur + ":" + k.kaynak + ">" + k.hedef;
  const kesifler = [];
  const oncekiKenar = new Set(gecmis.flatMap((g) => g.kenar.map((k) => k[0])));
  for (const k of kenar) {
    const a = anahtarK(k);
    const seri = gecmis.map((g) => { const x = g.kenar.find((y) => y[0] === a); return x ? x[1] : 0; });
    if (gecmis.length >= 3 && !oncekiKenar.has(a)) kesifler.push({ tur: "yeni-baglanti", kenar: a, deger: k.miktar != null ? k.miktar : k.adet });
    if (seri.length >= 5) {
      const sirali = [...seri].sort((x, y) => x - y);
      const medyan = sirali[Math.floor(sirali.length / 2)];
      const deger = k.miktar != null ? k.miktar : k.adet;
      if (medyan > 0 && deger > 3 * medyan) kesifler.push({ tur: "akis-sicramasi", kenar: a, deger, medyan });
    }
  }
  const oncekiKayit = gecmis.length ? new Set(gecmis[gecmis.length - 1].kayitIdleri || []) : null;
  const kayitIdleri = kaynak.evmKayit ? kaynak.evmKayit.map((c) => c.chainId) : null;
  if (oncekiKayit && kayitIdleri) for (const c of kaynak.evmKayit) if (!oncekiKayit.has(c.chainId)) kesifler.push({ tur: "yeni-ag", chainId: c.chainId, ad: c.ad });

  const kenarSerileri = {};
  for (const g of [...gecmis, { kenar: kenar.map((k) => [anahtarK(k), k.miktar != null ? k.miktar : k.adet]) }])
    for (const [a, v] of g.kenar) (kenarSerileri[a] = kenarSerileri[a] || []);
  const toplamHata = { son: 0, ortalama5: 0, ema03: 0 };
  let sinanan = 0;
  for (const a of Object.keys(kenarSerileri)) {
    const seri = [...gecmis, { kenar: kenar.map((k) => [anahtarK(k), k.miktar != null ? k.miktar : k.adet]) }].map((g) => { const x = g.kenar.find((y) => y[0] === a); return x ? x[1] : 0; });
    if (seri.length < 5) continue;
    const h = yontemler(seri);
    for (const m of Object.keys(toplamHata)) toplamHata[m] += h[m] || 0;
    sinanan++;
  }
  const enIyi = sinanan ? Object.entries(toplamHata).sort((a, b) => a[1] - b[1])[0][0] : null;

  const zaman = new Date().toISOString();
  const atlas = {
    zaman, pencereSaniye: PENCERE, sure_ms: Date.now() - basla,
    dugumler: Object.values(dugum), kenarlar: kenar, kesifler,
    analiz: { sinananKenar: sinanan, ortalamaMutlakHata: sinanan ? Object.fromEntries(Object.entries(toplamHata).map(([k, v]) => [k, +(v / sinanan).toFixed(4)])) : null, enIyiYontem: enIyi },
    acikVeri: { evmKayitSayisi: kayitIdleri ? kayitIdleri.length : null, layerzeroZincir: kaynak.lz ? Object.keys(kaynak.lz).length : null, hatalar: [kaynak.hata, kaynak.hataLz].filter(Boolean) },
    kaynak: "public RPCs + chainid.network + LayerZero metadata; scripts/atlas-indeks.js"
  };
  fs.writeFileSync(CIKTI, JSON.stringify(atlas, null, 1));
  gecmis.push({ zaman, kenar: kenar.map((k) => [anahtarK(k), k.miktar != null ? k.miktar : k.adet]), kayitIdleri });
  /* the registry list is only needed for the last point (new-chain diff) */
  for (let i = 0; i < gecmis.length - 1; i++) delete gecmis[i].kayitIdleri;
  fs.writeFileSync(GECMIS, JSON.stringify(gecmis.slice(-288)));

  const okunan = evm.filter((z) => z.blok).length;
  console.log("atlas: " + okunan + "/" + evm.length + " EVM, " + diger.filter((z) => z.blok).length + "/" + diger.length + " diger zincir; " +
    Object.keys(dugum).length + " dugum, " + kenar.length + " kenar, " + kesifler.length + " kesif; " + Math.round(atlas.sure_ms / 1000) + " sn");
  for (const z of evm) {
    const cc = Object.values(z.cctpCikis || {}).reduce((t, v) => t + v.miktar, 0);
    console.log("  " + (z.ad || z.anahtar).padEnd(10) + " blok " + z.blok + "  " + (z.pencere ? z.pencere.saniye + " sn" : "") + "  CCTP cikis $" + cc.toFixed(0) +
      "  LZ " + Object.values(z.lzCikis || {}).reduce((t, v) => t + v, 0) + "  yeni v4 havuz " + (z.yeniHavuz || 0) + (z.hatalar && z.hatalar.length ? "  ! " + z.hatalar.join("; ") : ""));
  }

  if (HAFIZA && kesifler.length) {
    const s = fs.readFileSync(path.join(KOK, "docs", "js", "genesis-adres.js"), "utf8");
    const g = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
    const p = saglayici("arc");
    if ((await p.getCode(g.cekirdek)).length <= 2) { console.log("hafiza: GENESIS cekirdegi Arc'ta yok, keşifler yalnız atlas.json'da"); return; }
    const k = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^GENESIS_AJAN_KEY\s*=\s*(.+)$/m)[1].trim();
    const c = new Contract(g.cekirdek, ["function yaz(uint8,uint8,bytes32,bytes) returns (uint64)"], new Wallet(k, p));
    const v = toUtf8Bytes(JSON.stringify({ atlas: zaman, kesifler: kesifler.slice(0, 20) }));
    const t = await c.yaz(8, 0, keccak256(v), v);
    console.log("hafiza: kategori 8 kaydi " + t.hash);
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
