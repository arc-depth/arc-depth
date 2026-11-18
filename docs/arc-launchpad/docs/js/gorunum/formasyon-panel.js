/* ===========================================================================
 * gorunum/formasyon-panel.js — Pattern Hunter on one Hot tokens token page
 *
 * 18 Nov 2026 (owner: Pattern Hunter "do all of it"). Scans the token's own hourly history (the same one the
 * Time Machine reads, up to ~41 days) on 1 h, and on 4 h and daily bars built from it, with the shared detector
 * (../formasyon.js). Shows breakouts on the last 3 bars and patterns still forming, drawn like the Pattern Hunter
 * page. The record shown is from large coins (memecoins were not in the backtest), and the panel says so.
 * =========================================================================== */

import { el } from "../ui.js";
import { tara } from "../formasyon.js";
import { cizim, karneYazi } from "./formasyon.js";

const STIL = ".fp{display:grid;gap:10px}.fp .fh-kart{border:1px solid var(--cizgi);border-radius:12px;padding:8px 10px;display:grid;gap:6px}" +
  ".fp .fh-tuval{height:150px;border-radius:10px;overflow:hidden;background:#0a1226}.fp .fh-tuval canvas{width:100%;height:100%;display:block}" +
  ".fp-ust{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px}.fp-n{font-size:11.5px;color:var(--yazi-3);line-height:1.45}" +
  ".fp-cip{font-size:11.5px;padding:1px 8px;border-radius:999px;border:1px solid var(--cizgi)}.fp-al{color:var(--alis);border-color:var(--alis)}.fp-sat{color:var(--satis);border-color:var(--satis)}.fp-bek{color:#e0a100;border-color:#e0a100}";

/* hourly -> N-hour bars aligned to UTC */
function birlestir(m, saat) {
  const o = [];
  for (const x of m) {
    const t = Math.floor(x.t / (saat * 3600e3)) * saat * 3600e3, s = o[o.length - 1];
    if (s && s.t === t) { s.h = Math.max(s.h, x.h); s.l = Math.min(s.l, x.l); s.c = x.c; s.v += x.v; }
    else o.push({ t, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v });
  }
  return o.slice(0, -1);   // the last bar is still open
}

const fiyat = (v) => (v == null ? "–" : "$" + (v >= 1 ? Number(v).toFixed(4) : Number(v).toPrecision(4)));

/** `mumGetir()` -> hourly [{t,o,h,l,c,v}] or null; `ad()` -> symbol. */
export function formasyonPaneli({ mumGetir, ad }) {
  if (!document.getElementById("fp-stil")) document.head.append(el("style", { attr: { id: "fp-stil" }, yazi: STIL }));
  const govde = el("div", { sinif: "fp" }, [el("div", { sinif: "fp-n", yazi: "Open to scan this token's chart for patterns." })]);
  let bitti = false;
  async function calistir() {
    if (bitti) return; bitti = true;
    govde.replaceChildren(el("div", { sinif: "fp-n", yazi: "Scanning " + ad() + " on 1 h, 4 h and daily charts…" }));
    let karne = {};
    try { const r = await fetch(new URL("../../veri/formasyon.json", import.meta.url).href + "?t=" + Math.floor(Date.now() / 3600e3)); if (r.ok) karne = (await r.json()).karne || {}; } catch (e) { /* no record */ }
    const m = await mumGetir().catch(() => null);
    if (!m || !m.length) { bitti = false; govde.replaceChildren(el("div", { sinif: "fp-n", yazi: "The price history could not be read right now. Close and open this again in a minute." })); return; }
    const kartlar = [];
    for (const [zd, seri, W] of [["1d", birlestir(m, 24), 3], ["4h", birlestir(m, 4), 5], ["1h", m.slice(0, -1), 5]]) {
      if (seri.length < 30) continue;
      const bulunan = tara(seri, { W, canli: true });
      const sonI = seri.length - 1;
      const tek = new Map();
      for (const f of bulunan) {
        const taze = f.kirilim != null && f.kirilim >= sonI - 2, olusuyor = f.kirilim == null && sonI - f.son <= Math.max(10, 2 * (f.son - f.bas));
        if (!taze && !olusuyor) continue;
        const k = f.tur, o = tek.get(k);
        if (!o || (taze && o.kirilim == null) || f.son > o.son) tek.set(k, { ...f, taze });
      }
      for (const f of tek.values()) {
        const v = {
          coin: ad(), zd, tur: f.tur, ad: f.ad, yon: f.yon, durum: f.taze ? "kirildi" : "olusuyor", giris: f.giris, hedef: f.hedef, stop: f.stop,
          seviyeler: f.seviyeler, fiyat: seri[sonI].c, noktalar: (f.noktalar || []).map((p) => [seri[p.i].t, p.f, p.t]),
          mum: seri.slice(Math.max(0, Math.min(f.bas - 5, seri.length - 60))).slice(-80).map((x) => [x.t, x.o, x.h, x.l, x.c]), karne: (karne[zd] || {})[f.tur] || null,
        };
        const tuval = el("canvas", { attr: { role: "img", "aria-label": v.ad + " " + zd } });
        const kn = karneYazi(v);
        kartlar.push(el("div", { sinif: "fh-kart" }, [
          el("div", { sinif: "fp-ust" }, [el("b", { yazi: v.ad + " · " + zd }), v.durum === "kirildi" ? el("span", { sinif: "fp-cip " + (v.yon > 0 ? "fp-al" : "fp-sat"), yazi: "Breakout " + (v.yon > 0 ? "▲ up" : "▼ down") }) : el("span", { sinif: "fp-cip fp-bek", yazi: "Forming" })]),
          el("div", { sinif: "fh-tuval" }, [tuval]),
          el("div", { sinif: "fp-n", yazi: v.durum === "kirildi" ? "Entry " + fiyat(v.giris) + " · target " + fiyat(v.hedef) + " · stop " + fiyat(v.stop) : v.seviyeler && v.seviyeler.boyun != null ? "Neckline " + fiyat(v.seviyeler.boyun) + " · price " + fiyat(v.fiyat) : "Upper line " + fiyat(v.seviyeler && v.seviyeler.ust) + " · lower line " + fiyat(v.seviyeler && v.seviyeler.alt) + " · price " + fiyat(v.fiyat) }),
          el("div", { sinif: "fp-n", yazi: kn.yazi }),
        ]));
        requestAnimationFrame(() => cizim(tuval, v));
      }
    }
    govde.replaceChildren(...[
      kartlar.length ? null : el("div", { sinif: "fp-n", yazi: "No classic pattern on " + ad() + "'s 1 h, 4 h or daily chart right now." }),
      ...kartlar,
      el("div", { sinif: "fp-n", yazi: "The record shown comes from large coins since 2017; memecoins were not in that test and move far more wildly, so a pattern here is weaker evidence. Daily and 4 h bars are built from the token's last ~41 days of hourly history. Not advice." }),
    ].filter(Boolean));
  }
  const kutu = el("details", { sinif: "ayrinti" }, [el("summary", { yazi: "📐 Pattern Hunter · classic chart patterns on this token (1 h, 4 h, daily)" }), el("div", { sinif: "ayrinti__govde" }, [govde])]);
  kutu.addEventListener("toggle", () => { if (kutu.open) calistir(); });
  return { kutu };
}
