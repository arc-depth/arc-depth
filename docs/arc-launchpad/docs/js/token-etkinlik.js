/* ===========================================================================
 * token-etkinlik.js — a token's price chart, top holders and recent trades,
 *                     read from Arc in the browser (the #/merkez?t= page)
 *
 * WHERE EACH NUMBER COMES FROM
 *   - The launchpad that holds the token (v9 set, v8 set or the first
 *     PulseLaunchpad5) gives the pool key, hence the pool id, and the launch
 *     record's time, which bounds where the history starts.
 *   - Trades: the Uniswap v4 PoolManager's Swap events for that pool id.
 *     amount0/amount1 are the swapper's deltas (positive = received), so a
 *     buy is the token amount > 0. The chart plots the pool price after each
 *     swap (sqrtPriceX96), the real price the next trade met; nothing is
 *     interpolated or invented between trades.
 *   - Holders: the token's own Transfer events, summed per address, the top
 *     ones checked with balanceOf. Contracts (the pool, the gate, a vault)
 *     are labelled as such: a holder list that hides that most supply sits
 *     in the locked pool would mislead.
 *
 * HOW MUCH HISTORY
 *   Logs are read through YedekliOkur (9,000-block pieces; the public Arc
 *   RPCs refuse more than 10,000 per call). A published archive of a pool's
 *   Swap events (veri/olaylar/havuz-<poolId>.json, scripts/olay-arsivi.js)
 *   or of the token's logs (veri/olaylar/<token>.json) is used when present,
 *   so the whole life is read at once; without one, at most PENCERE blocks
 *   back are read and the panel says which window it shows.
 *
 * Read-only: no transaction, no server, nothing about the visitor stored.
 * =========================================================================== */
import { el, panel, bos, temizle } from "./ui.js";
import { YedekliOkur } from "./yedekli-okur.js";
import { Contract, AbiCoder, keccak256, id as olayId } from "../vendor/ethers.min.js";

const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";            // Uniswap v4 PoolManager on Arc
const LP_ILK = "0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d";         // the first PulseLaunchpad5
const SWAP = olayId("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const TRANSFER = olayId("Transfer(address,address,uint256)");
const SIFIR = "0x0000000000000000000000000000000000000000";
export const PENCERE = 250_000;   // blocks read back without an archive (~35 h at Arc's ~0.5 s)
const LP_ABI = ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))",
  "function launchIdOfPool(bytes32) view returns (uint256)",
  "function launchAt(uint256) view returns ((address token,address acici,address kasa,uint256 teminat,address kurucu,uint256 kurucuToken,uint256 teklif,uint256 vergiPpm,uint64 zaman))"];
const E20 = ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)"];
const kod = AbiCoder.defaultAbiCoder();
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const kasif = (yol) => "https://explorer.arc.io/" + yol;

let _arc = null;
const arc = () => (_arc ||= new YedekliOkur());

/* ---- reading ------------------------------------------------------------ */

async function ayarlar() {
  const al = (f) => fetch("veri/" + f, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [v9, v8] = await Promise.all([al("sepet-v9.json"), al("sepet-v2.json")]);
  return [v9, v8].filter(Boolean);
}

/** The launch behind a token: pool key, pool id, launch record, the set's addresses. */
export async function launchBul(token) {
  const setler = await ayarlar();
  const adaylar = [...setler.map((s) => ({ lp: s.launchpad, set: s })), { lp: LP_ILK, set: null }];
  for (const a of adaylar) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a.lp || "")) continue;
    try {
      const lp = new Contract(a.lp, LP_ABI, arc());
      const k = await lp.havuzAnahtari(token);
      if (!k || k[4] === SIFIR) continue;
      const havuzId = keccak256(kod.encode(["address", "address", "uint24", "int24", "address"], [k[0], k[1], k[2], k[3], k[4]]));
      const no = await lp.launchIdOfPool(havuzId);
      if (!no) continue;
      const kayit = await lp.launchAt(no - 1n);
      if (String(kayit.token).toLowerCase() !== token.toLowerCase()) continue;
      return { lp: a.lp, set: a.set, anahtar: k, havuzId, tokenSifir: k[0].toLowerCase() === token.toLowerCase(),
        zaman: Number(kayit.zaman), kasa: kayit.kasa, kurucu: kayit.kurucu };
    } catch (e) { /* not this launchpad */ }
  }
  return null;
}

/** The first block at or after a unix time, by a few interpolation steps (Arc's block time is near-constant). */
async function zamandanBlok(zaman, son) {
  let b = son.number - Math.round((son.timestamp - zaman) / 0.5);
  for (let i = 0; i < 4; i++) {
    b = Math.max(0, Math.min(son.number, b));
    const x = await arc().getBlock(b);
    if (!x) break;
    const fark = x.timestamp - zaman;
    if (Math.abs(fark) < 30) break;
    b -= Math.round(fark / 0.5);
  }
  return Math.max(0, b - 600);   // a margin: the launch block itself must be inside
}

async function havuzArsivi(havuzId) {
  try {
    const r = await fetch("veri/olaylar/havuz-" + havuzId.toLowerCase() + ".json", { cache: "no-cache" });
    if (!r.ok) return null;
    const j = await r.json();
    return j && Number.isInteger(j.sonBlok) && Array.isArray(j.loglar) ? j : null;
  } catch (e) { return null; }
}

/** Swap logs of the pool from block `a`: the pool archive first, then the RPCs. */
async function swaplar(havuzId, a, z) {
  const ar = await havuzArsivi(havuzId);
  let eldeki = [];
  if (ar && ar.sonBlok >= a) {
    eldeki = ar.loglar.filter((l) => { const b = parseInt(l.blockNumber, 16); return b >= a && b <= z; })
      .map((l) => ({ blockNumber: parseInt(l.blockNumber, 16), index: parseInt(l.logIndex, 16), data: l.data, topics: l.topics, transactionHash: l.transactionHash }));
    a = Math.max(a, ar.sonBlok + 1);
  }
  if (a > z) return { loglar: eldeki, arsiv: !!ar };
  const yeni = await arc().getLogs({ address: PM, topics: [SWAP, havuzId], fromBlock: a, toBlock: z });
  return { loglar: eldeki.concat(yeni.map((l) => ({ blockNumber: l.blockNumber, index: l.index, data: l.data, topics: l.topics, transactionHash: l.transactionHash }))), arsiv: !!ar };
}

/** Decode Swap logs into trades (dollars per token from the pool price, 6 / 18 decimals). */
export function islemleriCoz(loglar, tokenSifir) {
  const out = [];
  for (const l of loglar) {
    let d;
    try { d = kod.decode(["int128", "int128", "uint160", "uint128", "int24", "uint24"], l.data); } catch (e) { continue; }
    const [a0, a1, sqrt] = d;
    const tok = tokenSifir ? a0 : a1, usd = tokenSifir ? a1 : a0;
    const ham = Number(sqrt) ** 2 / 2 ** 192;
    const fiyat = tokenSifir ? ham * 1e12 : (ham > 0 ? 1e12 / ham : 0);
    const tokenMiktar = Math.abs(Number(tok)) / 1e18, dolar = Math.abs(Number(usd)) / 1e6;
    out.push({ blok: Number(l.blockNumber), index: Number(l.index || 0), tx: l.transactionHash, alis: tok > 0n,
      tokenMiktar, dolar, fiyat, ortalama: tokenMiktar > 0 ? dolar / tokenMiktar : fiyat });
  }
  return out.sort((x, y) => x.blok - y.blok || x.index - y.index);
}

/** Balances from Transfer logs. */
export function bakiyeleriTopla(loglar) {
  const m = new Map();
  for (const l of loglar) {
    if (!l.topics || l.topics[0] !== TRANSFER || l.topics.length < 3) continue;
    const from = "0x" + l.topics[1].slice(26), to = "0x" + l.topics[2].slice(26);
    let v;
    try { v = BigInt(l.data); } catch (e) { continue; }
    if (from !== SIFIR) m.set(from, (m.get(from) || 0n) - v);
    if (to !== SIFIR) m.set(to, (m.get(to) || 0n) + v);
  }
  return m;
}

/* ---- drawing ------------------------------------------------------------ */

const SVG = "http://www.w3.org/2000/svg";
const svgEl = (ad, a = {}) => { const e = document.createElementNS(SVG, ad); for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v)); return e; };
/* "$0.0₅351" for tiny prices: the zeros after the point counted in a subscript, as DEX screens show them */
const ALT = "₀₁₂₃₄₅₆₇₈₉";
export const fiyatYaz = (x, n = 3) => {
  if (!Number.isFinite(x)) return "—";
  if (x >= 1) return "$" + x.toLocaleString("en-US", { maximumFractionDigits: Math.max(2, n) });
  if (x >= 0.001 || x === 0) return "$" + x.toPrecision(n);
  const sifir = Math.floor(-Math.log10(x));                                   // 0.000003 -> 5 zeros after "0."
  const anlamli = String(Math.min(Math.round(x * 10 ** (sifir + n)), 10 ** n - 1));   // n significant digits
  return "$0.0" + String(sifir).split("").map((d) => ALT[d]).join("") + anlamli;
};
const dolarYaz = (x) => "$" + (x >= 1000 ? Math.round(x).toLocaleString("en-US") : x.toFixed(2));
const miktarYaz = (x) => x > 0 && x < 0.01 ? "<0.01" : x >= 1e6 ? (x / 1e6).toFixed(2) + "M" : x >= 1e3 ? (x / 1e3).toFixed(1) + "K" : x.toFixed(2);
const saatYaz = (t) => new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ");

/** An inline SVG line of the pool price after each trade, with a crosshair tooltip (mouse and touch). */
export function fiyatGrafigi(noktalar) {
  const G = 420, Y = 210, sol = 6, sag = 86, ust = 12, alt = 24;
  const kap = el("div", { sinif: "etkinlik-grafik", attr: { style: "position:relative;width:100%" } });
  const svg = svgEl("svg", { viewBox: "0 0 " + G + " " + Y, width: "100%", role: "img", "aria-label": "Price after each trade", style: "display:block;height:auto;max-height:300px;touch-action:pan-y" });
  if (noktalar.length < 1) return kap;
  const t0 = noktalar[0].t, t1 = noktalar[noktalar.length - 1].t;
  let lo = Math.min(...noktalar.map((n) => n.p)), hi = Math.max(...noktalar.map((n) => n.p));
  if (hi === lo) { hi *= 1.05; lo *= 0.95; }
  const pay = (hi - lo) * 0.08; hi += pay; lo = Math.max(0, lo - pay);
  /* enough digits that the three axis labels differ */
  const basamak = Math.max(3, Math.min(7, Math.ceil(-Math.log10((hi - lo) / hi)) + 2));
  const x = (t) => sol + (t1 === t0 ? (G - sol - sag) / 2 : ((t - t0) / (t1 - t0)) * (G - sol - sag));
  const y = (p) => ust + (1 - (p - lo) / (hi - lo)) * (Y - ust - alt);
  /* recessive grid: three horizontal rules with their prices at the right */
  for (const f of [0, 0.5, 1]) {
    const p = lo + (hi - lo) * f, yy = y(p);
    svg.append(svgEl("line", { x1: sol, x2: G - sag, y1: yy, y2: yy, stroke: "var(--cizgi)", "stroke-width": 1 }));
    const tx = svgEl("text", { x: G - sag + 6, y: yy + 4, fill: "var(--yazi-3)", "font-size": 10, "font-family": "var(--yazi-tipi-mono)" }); tx.textContent = fiyatYaz(p, basamak); svg.append(tx);
  }
  for (const [t, anchor] of [[t0, "start"], [t1, "end"]]) {
    const tx = svgEl("text", { x: anchor === "start" ? sol : G - sag, y: Y - 8, fill: "var(--yazi-3)", "font-size": 11, "text-anchor": anchor }); tx.textContent = saatYaz(t) + " UTC"; svg.append(tx);
  }
  /* a step line: the price holds until the next trade moves it */
  let d = "";
  noktalar.forEach((n, i) => { d += (i ? "H" + x(n.t).toFixed(1) + "V" : "M" + x(n.t).toFixed(1) + " ") + y(n.p).toFixed(1); });
  const alan = d + "V" + (Y - alt) + "H" + x(t0).toFixed(1) + "Z";
  svg.append(svgEl("path", { d: alan, fill: "var(--marka-zemin)", stroke: "none" }));
  svg.append(svgEl("path", { d, fill: "none", stroke: "var(--marka)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  const son = noktalar[noktalar.length - 1];
  svg.append(svgEl("circle", { cx: x(son.t), cy: y(son.p), r: 4, fill: "var(--marka)", stroke: "var(--yuzey-1)", "stroke-width": 2 }));
  /* hover layer */
  const dikey = svgEl("line", { y1: ust, y2: Y - alt, stroke: "var(--yazi-3)", "stroke-width": 1, "stroke-dasharray": "3 3", visibility: "hidden" });
  const nokta = svgEl("circle", { r: 4, fill: "var(--marka)", stroke: "var(--yuzey-1)", "stroke-width": 2, visibility: "hidden" });
  svg.append(dikey, nokta);
  const ipucu = el("div", { sinif: "mono yazi--kucuk", attr: { role: "status", style: "position:absolute;top:4px;left:8px;pointer-events:none;background:var(--yuzey-ust);border:1px solid var(--cizgi);border-radius:6px;padding:4px 8px;visibility:hidden;white-space:nowrap" } });
  const goster = (cx) => {
    const r = svg.getBoundingClientRect();
    const vx = ((cx - r.left) / r.width) * G;
    let en = noktalar[0];
    for (const n of noktalar) if (Math.abs(x(n.t) - vx) < Math.abs(x(en.t) - vx)) en = n;
    dikey.setAttribute("x1", x(en.t)); dikey.setAttribute("x2", x(en.t)); dikey.setAttribute("visibility", "visible");
    nokta.setAttribute("cx", x(en.t)); nokta.setAttribute("cy", y(en.p)); nokta.setAttribute("visibility", "visible");
    ipucu.textContent = fiyatYaz(en.p) + " · " + saatYaz(en.t) + " UTC";
    ipucu.style.visibility = "visible";
    const px = (x(en.t) / G) * r.width;
    ipucu.style.left = Math.max(0, Math.min(r.width - ipucu.offsetWidth, px - ipucu.offsetWidth / 2)) + "px";
  };
  const gizle = () => { dikey.setAttribute("visibility", "hidden"); nokta.setAttribute("visibility", "hidden"); ipucu.style.visibility = "hidden"; };
  svg.addEventListener("pointermove", (e) => goster(e.clientX));
  svg.addEventListener("pointerdown", (e) => goster(e.clientX));
  svg.addEventListener("pointerleave", gizle);
  kap.append(svg, ipucu);
  return kap;
}

/* ---- the panel ---------------------------------------------------------- */

function tablo(basliklar, satirlar) {
  return el("div", { sinif: "tablo-sarmal" }, [el("table", { sinif: "tablo" }, [
    el("thead", {}, [el("tr", {}, basliklar.map((b) => el("th", { yazi: b })))]),
    el("tbody", {}, satirlar)
  ])]);
}

async function doldur(kap, token, gecerli = () => true) {
  temizle(kap).append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading trades and holders from Arc…" }));
  const L = await launchBul(token);
  if (!L) { temizle(kap).append(bos("No pool found", "This address is not a launch of the ARC PULSE launchpads on Arc.")); return; }
  const son = await arc().getBlock("latest");
  const baslangic = await zamandanBlok(L.zaman, son);
  const z = son.number;
  /* without an archive, read at most PENCERE blocks back */
  const ar = await havuzArsivi(L.havuzId);
  const pencereBas = ar ? baslangic : Math.max(baslangic, z - PENCERE);
  const tam = pencereBas === baslangic;
  const tk = new Contract(token, E20, arc());
  const [sw, tr, arz, sembol] = await Promise.all([
    swaplar(L.havuzId, pencereBas, z),
    arc().getLogs({ address: token, topics: [TRANSFER], fromBlock: pencereBas, toBlock: z }).catch(() => null),
    tk.totalSupply().catch(() => null),
    tk.symbol().catch(() => "")
  ]);
  if (!gecerli()) return;
  const islemler = islemleriCoz(sw.loglar, L.tokenSifir);
  /* block -> time, interpolated between the launch block and the head (Arc's blocks are evenly spaced) */
  const b0 = baslangic, ts0 = L.zaman - 300;
  const zamanOf = (b) => Math.round(ts0 + ((b - b0) * (son.timestamp - ts0)) / Math.max(1, z - b0));

  temizle(kap);
  const pencereYazi = tam
    ? "Since launch (" + saatYaz(L.zaman) + " UTC), block " + baslangic.toLocaleString("en-US") + " to " + z.toLocaleString("en-US") + "."
    : "Last " + PENCERE.toLocaleString("en-US") + " blocks (about " + Math.round(PENCERE * 0.5 / 3600) + " hours); older trades are not read without the published archive.";

  /* chart */
  const noktalar = islemler.map((i) => ({ t: zamanOf(i.blok), p: i.fiyat }));
  if (noktalar.length) noktalar.push({ t: son.timestamp, p: noktalar[noktalar.length - 1].p });
  const alis = islemler.filter((i) => i.alis), satis = islemler.filter((i) => !i.alis);
  const hacim = islemler.reduce((s, i) => s + i.dolar, 0);
  kap.append(panel("Price chart", islemler.length
    ? el("div", { sinif: "yigin" }, [
        fiyatGrafigi(noktalar),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Pool price after each trade, from the PoolManager's Swap events. " + pencereYazi }),
        el("div", { sinif: "satir", attr: { style: "flex-wrap:wrap;gap:16px" } }, [
          el("span", { sinif: "yazi yazi--kucuk" }, [el("span", { sinif: "yazi--sessiz", yazi: "Trades " }), el("b", { sinif: "mono", veri: { islemSayisi: islemler.length }, yazi: String(islemler.length) })]),
          el("span", { sinif: "yazi yazi--kucuk" }, [el("span", { sinif: "yazi--sessiz", yazi: "Buys " }), el("b", { sinif: "mono", yazi: String(alis.length) })]),
          el("span", { sinif: "yazi yazi--kucuk" }, [el("span", { sinif: "yazi--sessiz", yazi: "Sells " }), el("b", { sinif: "mono", yazi: String(satis.length) })]),
          el("span", { sinif: "yazi yazi--kucuk" }, [el("span", { sinif: "yazi--sessiz", yazi: "Volume " }), el("b", { sinif: "mono", yazi: dolarYaz(hacim) })])
        ])
      ])
    : bos("No trades yet", "This pool has no Swap events in the range read. " + pencereYazi)));

  /* recent trades */
  const sonlar = islemler.slice(-20).reverse();
  kap.append(panel("Recent trades", sonlar.length
    ? tablo(["Time (UTC)", "Side", "USDC", sembol || "Tokens", "Price", "Tx"], sonlar.map((i) => el("tr", { veri: { islem: i.alis ? "al" : "sat" } }, [
        el("td", { sinif: "mono", yazi: saatYaz(zamanOf(i.blok)) }),
        el("td", { yazi: i.alis ? "Buy" : "Sell", attr: { style: "color:var(" + (i.alis ? "--alis" : "--satis") + ")" } }),
        el("td", { sinif: "mono", yazi: dolarYaz(i.dolar) }),
        el("td", { sinif: "mono", yazi: miktarYaz(i.tokenMiktar) }),
        el("td", { sinif: "mono", yazi: fiyatYaz(i.ortalama) }),
        el("td", {}, [el("a", { sinif: "mono", attr: { href: kasif("tx/" + i.tx), target: "_blank", rel: "noopener" }, yazi: kisa(i.tx) })])
      ])))
    : bos("No trades yet", pencereYazi)));

  /* holders */
  if (!tr) { kap.append(panel("Top holders", bos("Holders could not be read", "The token's Transfer events did not load. Reload to try again."))); return; }
  const bakiye = bakiyeleriTopla(tr);
  const adaylar = [...bakiye.entries()].filter(([, v]) => v > 0n).sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).slice(0, 15);
  /* checked against the chain: exact even when the window missed older transfers */
  const kontrol = await Promise.all(adaylar.map(async ([a, v]) => {
    const [b, c] = await Promise.all([tk.balanceOf(a).catch(() => v), arc().getCode(a).catch(() => "0x")]);
    return { adres: a, bakiye: b, sozlesme: c && c !== "0x" };
  }));
  if (!gecerli()) return;
  const ETIKET = new Map([[PM.toLowerCase(), "Uniswap v4 pool (locked)"], [String(L.kasa).toLowerCase(), "Collateral vault"], [String(L.lp).toLowerCase(), "Launchpad"]]);
  if (L.set) for (const [k, ad] of [["kapi", "Launch gate"], ["ucu", "Redemption gate"], ["hub", "Twin hub (tokens on other chains)"], ["emanet", "Launch escrow"], ["hook", "Pool hook"]]) if (L.set[k]) ETIKET.set(String(L.set[k]).toLowerCase(), ad);
  if (L.kurucu) ETIKET.set(String(L.kurucu).toLowerCase(), "Founder");
  const ilk = kontrol.filter((x) => x.bakiye > 0n).sort((a, b) => (b.bakiye > a.bakiye ? 1 : b.bakiye < a.bakiye ? -1 : 0)).slice(0, 10);
  const toplam = arz ? Number(arz) / 1e18 : null;
  kap.append(panel("Top holders", ilk.length
    ? el("div", { sinif: "yigin" }, [
        tablo(["#", "Address", "Tokens", "Share"], ilk.map((h, i) => {
          const m = Number(h.bakiye) / 1e18;
          const etiket = ETIKET.get(h.adres.toLowerCase()) || (h.sozlesme ? "Contract" : "");
          return el("tr", { veri: { sahip: h.adres } }, [
            el("td", { sinif: "mono", yazi: String(i + 1) }),
            el("td", {}, [el("a", { sinif: "mono", attr: { href: kasif("address/" + h.adres), target: "_blank", rel: "noopener" }, yazi: kisa(h.adres) }),
              etiket ? el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: etiket }) : null]),
            el("td", { sinif: "mono", yazi: miktarYaz(m) }),
            el("td", { sinif: "mono", yazi: toplam ? (m / toplam * 100).toFixed(2) + "%" : "—" })
          ]);
        })),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Balances on Arc, from the token's Transfer events and checked with balanceOf. Tokens moved to other chains show as held by the twin hub." +
          (tam ? "" : " Only addresses active in the window are listed.") })
      ])
    : bos("No holders found", pencereYazi)));
}

/**
 * The panel for a token page. `girdi` is the page's token address input: the
 * panel follows it (change event) and reads again when the address changes.
 */
export function etkinlikPaneli(girdi) {
  const kap = el("div", { sinif: "yigin", attr: { id: "token-etkinlik" } });
  let sira = 0;
  const yukle = async () => {
    const t = (girdi.value || "").trim();
    const bu = ++sira;
    if (!/^0x[0-9a-fA-F]{40}$/.test(t)) { temizle(kap); return; }
    try { await doldur(kap, t, () => bu === sira); }
    catch (e) { if (bu === sira) temizle(kap).append(panel("Token activity", bos("Could not read the token's activity", (e && e.message) || String(e)))); }
  };
  girdi.addEventListener("change", yukle);
  yukle();
  return kap;
}
