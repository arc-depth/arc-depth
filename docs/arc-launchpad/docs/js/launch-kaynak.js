/* ===========================================================================
 * launch-kaynak.js — every launch made from ARC PULSE, paged, with no upper limit (Trade, All launches)
 *
 * The list lives in veri/launches/ (written hourly by scripts/launch-indeks.js): index.json and files of 5,000
 * launches each, oldest first. The newest file is read first and older ones only when the visitor scrolls,
 * filters or searches past what is loaded, so the page costs the same at 10 launches or 10 million.
 * Launches newer than the index are read live: each Arc registry from the count the index stopped at, and Warp
 * launches from veri/warp-launches.json. If the index is not there yet, everything is read live (the old way).
 *
 * A row: { tur warp|biz, token, ad, sembol, zaman (unix s), lp, zk chain key, zincir chain name, nereden,
 *          link (#/terminal?t=), git (own trade page), dis (launchpad page), gorsel, cfg (Arc set) }
 * =========================================================================== */
import { YedekliOkur } from "./yedekli-okur.js";
import { Contract } from "../vendor/ethers.min.js";
import { sepetV2, sepetV9, SEPET } from "./teminat-izle.js";

const ZINCIR = { solana: "Solana", elysium: "Elysium", bsc: "BNB Chain", robinhood: "Robinhood", monad: "Monad", base: "Base", arc: "Arc", sui: "Sui", aptos: "Aptos" };
const NESIL = { v2: "", g1: " · first generation", v9: " · designer set" };
const LP_ABI = ["function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))"];
const CANLI_AZAMI = 500;   // live launches read past the index per registry (the index catches up within the hour)
const arc = new YedekliOkur();
const yol = (f) => new URL("../veri/launches/" + f, import.meta.url).href;
const taze = () => "?t=" + Math.floor(Date.now() / 300000);

/* index row -> page row */
function satir(r, cfg) {
  const zincir = ZINCIR[r.zk] || r.zk;
  const tok = String(r.t);
  const git = r.zk === "arc" ? "#/merkez?t=" + tok : r.zk === "sui" ? "#/move-token?zincir=sui&kasa=" + (r.x || "") : r.zk === "aptos" ? "#/move-token?zincir=aptos&token=" + tok : null;
  return { tur: r.k === "warp" ? "warp" : "biz", kaynak: r.k, token: tok, ad: r.a, sembol: r.s, zaman: r.z || 0, lp: r.lp, zk: r.zk, zincir,
    nereden: r.zk === "arc" ? null : zincir, link: "#/terminal?t=" + encodeURIComponent(tok), git, dis: r.d || null, gorsel: r.g || null, biz: !!r.b, cfg: cfg[r.k] || null };
}

async function arcCanli(k, lp, n0, cfg) {
  const c = new Contract(lp, LP_ABI, arc);
  const n = Number(await c.launchCount());
  const out = [];
  for (let i = n - 1; i >= Math.max(n0, n - CANLI_AZAMI); i--) {
    const l = await c.launchAt(i);
    const t = new Contract(l.token, ["function name() view returns (string)", "function symbol() view returns (string)"], arc);
    const [a, s] = await Promise.all([t.name().catch(() => null), t.symbol().catch(() => null)]);
    out.push(satir({ t: l.token, a, s, z: Number(l.zaman), k, lp: "ARC PULSE one pool" + NESIL[k], zk: "arc" }, cfg));
  }
  return out;
}

/* the first `adet` loaded rows that pass `uyar`, loading older files until there are enough or none are left */
async function sec(uyar, adet) {
  for (;;) {
    const liste = this.satirlar.filter(uyar);
    if (liste.length >= adet || this.hepsiYuklendi) return { liste, tam: this.hepsiYuklendi };
    await this.dahaYukle();
  }
}

/** The launch source. `satirlar` holds what is loaded, newest first; `dahaYukle()` brings in the next older file. */
export async function launchKaynagi() {
  const [v2, v9] = await Promise.all([sepetV2(), sepetV9()]);
  const cfg = { v2, g1: SEPET, v9 };
  const hatalar = [];
  const indeks = await fetch(yol("index.json") + taze(), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

  const K = { satirlar: [], toplam: 0, hatalar, hepsiYuklendi: false, _sira: [] };
  const gorulen = new Set();
  const koy = (rows) => { for (const r of rows) { const key = r.kaynak + ":" + r.token.toLowerCase(); if (gorulen.has(key)) continue; gorulen.add(key); K.satirlar.push(r); } };
  const sirala = () => K.satirlar.sort((a, b) => b.zaman - a.zaman);

  if (!indeks) {
    /* no index published yet: read every source live */
    const { canliTum } = await import("./gorunum/launchlar.js");
    const c = await canliTum();
    koy(c.satirlar); hatalar.push(...c.hatalar); sirala();
    K.toplam = K.satirlar.length; K.hepsiYuklendi = true;
    K.dahaYukle = async () => false; K.hepsiniYukle = async () => {}; K.bul = async (t) => K.satirlar.find((x) => x.token.toLowerCase() === String(t).toLowerCase()) || null;
    K.sec = sec;
    return K;
  }

  /* newer than the index: Arc registries past their indexed count, Warp launches not in it yet */
  const sonDosya = indeks.parcalar[indeks.parcalar.length - 1];
  const [canli, sonParca, warp] = await Promise.all([
    Promise.allSettled(Object.entries(indeks.kayit || {}).map(([k, v]) => arcCanli(k, v.lp, v.n, cfg))),
    fetch(yol(sonDosya.dosya) + taze(), { cache: "no-cache" }).then((r) => r.json()),
    fetch(new URL("../veri/warp-launches.json", import.meta.url).href + taze(), { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  for (const c of canli) if (c.status === "fulfilled") koy(c.value); else hatalar.push("a live Arc registry");
  koy(sonParca.map((r) => satir(r, cfg)));
  if (warp) koy((warp.launchlar || []).map((x) => satir({ t: x.token, a: x.ad, s: x.sembol, z: Math.floor(Date.parse(x.zaman) / 1000), k: "warp", lp: x.lp, zk: x.zincir, g: x.gorsel, d: x.link, b: x.biz }, cfg)));
  sirala();
  const ekstra = K.satirlar.length - sonParca.length;
  K.toplam = indeks.toplam + Math.max(0, ekstra);
  K._sira = indeks.parcalar.slice(0, -1).reverse();   // the older files, newest first
  K.hepsiYuklendi = !K._sira.length;

  K.dahaYukle = async () => {
    const p = K._sira.shift();
    if (!p) { K.hepsiYuklendi = true; return false; }
    const rows = await fetch(yol(p.dosya)).then((r) => r.json());
    koy(rows.map((r) => satir(r, cfg)));
    sirala();
    K.hepsiYuklendi = !K._sira.length;
    return true;
  };
  K.hepsiniYukle = async () => { while (!K.hepsiYuklendi) await K.dahaYukle(); };
  K.bul = async (t) => {
    const q = String(t).toLowerCase();
    for (;;) {
      const s = K.satirlar.find((x) => x.token.toLowerCase() === q);
      if (s || K.hepsiYuklendi) return s || null;
      await K.dahaYukle();
    }
  };
  K.sec = sec;
  return K;
}
