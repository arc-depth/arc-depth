/* ===========================================================================
 * v2-analitik.js — the second generation's numbers, read live from Arc
 *
 * No file written by a machine of ours: the page reads the chain itself.
 *   launches   PulseLaunchpad5.launchCount / launchAt (the v2 registry)
 *   each pool  its price and its real dollars (docs/js/egri.js), market cap
 *   basket     dollars waiting in the Defter per launch (beklemede)
 *   founders   the launch's KurucuVekili: founder (bytes32) and their chain
 *   24 hours   PulseHook5 `Ucret` events: the 2% split (founder, developers,
 *              liquidity, operations, depth) and the collateral tax; volume
 *              is that 2% divided back (the ARCP 0.2% is outside the event)
 * Windows of 5,000 blocks (the Arc RPC refuses wider); Arc runs ~2 blocks a
 * second, so a day is ~35 requests.
 * =========================================================================== */
import { JsonRpcProvider, Contract, Interface, AbiCoder, keccak256, zeroPadValue } from "../vendor/ethers.min.js";
import * as egri from "./egri.js";

const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const LP_ABI = ["function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token,address acici,address kasa,uint256 teminat,address kurucu,uint256 kurucuToken,uint256 teklif,uint256 vergiPpm,uint64 zaman))"];
const UCRET = new Interface(["event Ucret(bytes32 indexed id, bool alim, bool exactInput, uint256 kurucu, uint256 gelistirici, uint256 likidite, uint256 isletme, uint256 vergi, uint256 derinlik, uint256 snipe, uint256 kalkan)"]);

let _arc = null, _tarih = null;
/* one request per call: the public Arc RPC refuses batched getLogs */
const arc = () => (_arc ||= new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true, batchMaxCount: 1 }));
const tekrar = async (f, n = 3) => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= n - 1) throw e; await new Promise((ok) => setTimeout(ok, 800 * (i + 1))); } } };

export async function v2Ayar() {
  return fetch("veri/sepet-v2.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
}

/// Every v2 launch with its pool's numbers now.
export async function launchlar(V2) {
  const lp = new Contract(V2.launchpad, LP_ABI, arc());
  const n = Number(await lp.launchCount());
  const kayit = await Promise.all([...Array(n).keys()].map((i) => lp.launchAt(i)));
  const defter = new Contract(V2.defter, ["function idOf(uint32,bytes32) view returns (uint64)", "function beklemede(uint64) view returns (uint256)"], arc());
  const VEKIL = ["function kurucu() view returns (bytes32)", "function kurucuZincir() view returns (uint32)"];
  return Promise.all(kayit.map(async (k, i) => {
    const t = new Contract(k.token, ["function name() view returns (string)", "function symbol() view returns (string)"], arc());
    const [ad, sembol, st, id, kurucu, kz] = await Promise.all([t.name().catch(() => "?"), t.symbol().catch(() => "?"),
      egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc(), V2.launchpad, PM, k.token).catch(() => null),
      defter.idOf(26, zeroPadValue(k.token, 32)).catch(() => 0n),
      new Contract(k.kurucu, VEKIL, arc()).kurucu().catch(() => null),
      new Contract(k.kurucu, VEKIL, arc()).kurucuZincir().catch(() => null)]);
    const o = st ? egri.ozet(st) : null;
    const bekleyen = id ? Number(await defter.beklemede(id).catch(() => 0n)) / 1e6 : 0;
    return { no: i + 1, token: k.token, ad, sembol, zaman: Number(k.zaman), vekil: k.kurucu, kurucu, kurucuZincir: kz == null ? null : Number(kz),
      teminat: Number(k.teminat) / 1e6, fiyat: o ? o.fiyat : null, piyasaDegeri: o ? o.piyasaDegeri : null,
      gercekDolar: o ? o.gercekDolar : null, bekleyen };
  }));
}

/// The last `saat` hours of the hook's fee events, summed per pool and in total.
export async function sonSaatler(V2, saat = 24, ilerleme = () => {}) {
  /* history: the official Arc RPC (publicnode treats older blocks as archive and refuses them); it allows this site by CORS */
  const p = (_tarih ||= new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true, batchMaxCount: 1 }));
  const son = await p.getBlockNumber();
  const ilk = Math.max(0, son - Math.round(saat * 3600 * 2.05));
  const PENCERE = 5000;
  const parcalar = [];
  for (let a = ilk; a <= son; a += PENCERE) parcalar.push([a, Math.min(son, a + PENCERE - 1)]);
  const loglar = [];
  for (let i = 0; i < parcalar.length; i += 5) {
    const grup = await Promise.all(parcalar.slice(i, i + 5).map(([a, b]) =>
      tekrar(() => p.getLogs({ address: V2.hook, topics: [UCRET.getEvent("Ucret").topicHash], fromBlock: a, toBlock: b })).catch(() => null)));
    if (grup.some((g) => g === null)) throw new Error("The Arc RPC refused a window; try again.");
    grup.forEach((g) => loglar.push(...g));
    ilerleme(Math.min(1, (i + 5) / parcalar.length));
  }
  const toplam = { islem: 0, hacim: 0, kurucu: 0, gelistirici: 0, likidite: 0, isletme: 0, derinlik: 0, vergi: 0 };
  const havuz = {};
  for (const l of loglar) {
    const e = UCRET.parseLog(l).args;
    const d = (x) => Number(x) / 1e6;
    /* depth carries the snipe tax too: take it out, it is not part of the 2% */
    const iki = d(e.kurucu) + d(e.gelistirici) + d(e.likidite) + d(e.isletme) + d(e.derinlik) - d(e.snipe);
    const h = (havuz[e.id] ||= { islem: 0, hacim: 0 });
    h.islem++; h.hacim += iki / 0.02;
    toplam.islem++; toplam.hacim += iki / 0.02;
    for (const k of ["kurucu", "gelistirici", "likidite", "isletme", "derinlik", "vergi"]) toplam[k] += d(e[k]);
  }
  return { toplam, havuz, bloklar: [ilk, son] };
}

/// The pool id of a launch token (as the hook's events carry it).
export async function havuzKimligi(V2, token) {
  const lp = new Contract(V2.launchpad, ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))"], arc());
  const k = await lp.havuzAnahtari(token);
  return keccak256(AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k[0], k[1], k[2], k[3], k[4]]));
}
