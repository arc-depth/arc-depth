/* ===========================================================================
 * gorunum/zaman-ciz.js — the shared Time Machine chart and plain-language reading
 *
 * 18 Nov 2026: one drawing for every Time Machine (perps 1, 2, 3 in hl-zaman.js and the Hot tokens spot one in
 * spot-zaman.js): real candles, the futures fanning out of now, the middle path in gold, p10 / p90, TP / stop.
 * =========================================================================== */

import { el } from "../ui.js";

/* 18 Nov 2026 (owner: "make the AI model showier, on a chart, the same size as the others"): real candles on the
   left, the model's futures fanning out of a glowing "now" point on the right, the middle path in gold, the
   middle-80% end range and the plan's TP / stop marked on a price axis. Same box as Time Machine 1 and 2. */
export function kronosCiz({ tuval, mum, yollar, medyan, H, giris, xTp, xSl, p10, p90, fiyat, ilerleme, an, rozet = "KRONOS AI" }) {
  const k = tuval.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  tuval.width = Math.max(1, Math.round(k.width * dpr)); tuval.height = Math.max(1, Math.round(k.height * dpr));
  const c = tuval.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = k.width, h = k.height, ust = 30, alt = 12, eksen = 58, sol = 6;
  const css = getComputedStyle(document.documentElement);
  const yesil = css.getPropertyValue("--alis").trim() || "#2bd38b", kirmizi = css.getPropertyValue("--satis").trim() || "#ff6b5a";
  const camgobegi = "#38e1ff", altin = "#ffc94a";
  const lm = mum.map((m) => ({ o: Math.log(m.o / giris), h: Math.log(m.h / giris), l: Math.log(m.l / giris), c: Math.log(m.c / giris) }));
  /* the scale follows the paths, candles and plan lines; p10 / p90 can sit beyond them (memecoins: -55% / +96%), their
     labels then stay pinned to the edge so the paths are not squeezed into a thin band */
  let lo = 0, hi = 0;
  for (const v of [xTp, xSl]) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (const m of lm) { lo = Math.min(lo, m.l); hi = Math.max(hi, m.h); }
  for (const y of yollar) for (const v of y.y) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const pad = (hi - lo) * 0.07 || 0.01; lo -= pad; hi += pad;
  const Y = (v) => ust + (1 - (v - lo) / (hi - lo)) * (h - ust - alt);
  const genis = w - sol - eksen;
  /* candles get 42% of the width, the futures 58% (with 36 candles next to 24 hours the fan was squeezed) */
  const xSimdi = sol + (lm.length ? genis * 0.42 : genis * 0.08);
  const adim = lm.length ? (xSimdi - sol) / lm.length : 0;
  const adimG = (sol + genis - xSimdi) / H;
  const X = (t) => xSimdi + t * adimG;              // t hours after now
  /* background and a light grid */
  const zemin = c.createLinearGradient(0, 0, 0, h); zemin.addColorStop(0, "#0a1226"); zemin.addColorStop(1, "#050914");
  c.fillStyle = zemin; c.fillRect(0, 0, w, h);
  const isik = c.createRadialGradient(xSimdi, Y(0), 0, xSimdi, Y(0), w * 0.6); isik.addColorStop(0, "rgba(56,225,255,.10)"); isik.addColorStop(1, "rgba(56,225,255,0)");
  c.fillStyle = isik; c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(255,255,255,.06)"; c.lineWidth = 1; c.font = "600 10px system-ui,sans-serif"; c.fillStyle = "rgba(255,255,255,.45)";
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4, y = Y(v);
    c.beginPath(); c.moveTo(sol, y); c.lineTo(w - eksen, y); c.stroke();
    c.fillText(fiyat(giris * Math.exp(v)), w - eksen + 4, y + 3);
  }
  /* real candles */
  lm.forEach((m, i) => {
    const x = sol + (i + 0.5) * adim, renk = m.c >= m.o ? yesil : kirmizi;
    c.strokeStyle = renk; c.fillStyle = renk; c.globalAlpha = 0.9;
    c.beginPath(); c.moveTo(x, Y(m.h)); c.lineTo(x, Y(m.l)); c.stroke();
    const y1 = Y(Math.max(m.o, m.c)), y2 = Y(Math.min(m.o, m.c));
    c.fillRect(x - adim * 0.32, y1, adim * 0.64, Math.max(1, y2 - y1));
  });
  c.globalAlpha = 1;
  /* the futures, drawn outward from now as the animation runs */
  const sinir = ilerleme * H;
  c.save(); c.globalCompositeOperation = "lighter"; c.lineWidth = 1.1;
  /* many paths (Time Machine 1 and 2 draw 180): fainter lines, no glow per line (it would slow phones down) */
  const cok = yollar.length > 60, saydam = Math.max(0.12, Math.min(0.55, 10 / yollar.length));
  for (const y of yollar) {
    const renk = y.s === "tp" ? yesil : y.s === "sl" ? kirmizi : camgobegi;
    c.strokeStyle = renk; c.shadowColor = renk; c.shadowBlur = cok ? 0 : 6; c.globalAlpha = saydam;
    c.beginPath();
    for (let t = 0; t < y.y.length && t <= sinir + 1; t++) {
      const tt = Math.min(t, sinir), px = X(tt);
      const py = t <= sinir ? Y(y.y[t]) : Y(y.y[t - 1] + (y.y[t] - y.y[t - 1]) * (sinir - (t - 1)));
      if (t) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.stroke();
  }
  /* the middle path */
  c.globalAlpha = 1; c.strokeStyle = altin; c.shadowColor = altin; c.shadowBlur = 14; c.lineWidth = 2.4;
  c.beginPath();
  for (let t = 0; t < medyan.length && t <= sinir; t++) { const px = X(t), py = Y(medyan[t]); if (t) c.lineTo(px, py); else c.moveTo(px, py); }
  c.stroke(); c.restore();
  /* now: a line and a glowing point */
  c.strokeStyle = "rgba(56,225,255,.5)"; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(xSimdi, ust - 6); c.lineTo(xSimdi, h - alt); c.stroke(); c.setLineDash([]);
  const nabiz = 6 + 2 * Math.sin((an || 0) / 220);
  const kure = c.createRadialGradient(xSimdi, Y(0), 0, xSimdi, Y(0), nabiz * 2.6);
  kure.addColorStop(0, "#ffffff"); kure.addColorStop(0.25, camgobegi); kure.addColorStop(1, "rgba(56,225,255,0)");
  c.fillStyle = kure; c.beginPath(); c.arc(xSimdi, Y(0), nabiz * 2.6, 0, Math.PI * 2); c.fill();
  c.fillStyle = "rgba(56,225,255,.9)"; c.font = "700 10px system-ui,sans-serif"; c.fillText("NOW", xSimdi + 5, ust - 10);
  /* plan lines on the forecast side */
  c.setLineDash([6, 5]); c.lineWidth = 1.3;
  const cizgi = (v, renk, ad) => { if (v == null) return; c.strokeStyle = renk; c.beginPath(); c.moveTo(xSimdi, Y(v)); c.lineTo(w - eksen, Y(v)); c.stroke(); c.fillStyle = renk; c.fillText(ad, xSimdi + 6, Y(v) + (v > 0 ? -4 : 11)); };
  cizgi(xTp, yesil, "TP"); cizgi(xSl, kirmizi, "STOP");
  c.setLineDash([]);
  /* end labels once the fan is drawn: middle path, top and bottom of the middle 80% */
  if (ilerleme >= 1) {
    const etiket = (v, renk, yazi) => {
      const y = Math.min(h - alt - 6, Math.max(ust, Y(v))), m = c.measureText(yazi).width + 8;
      c.fillStyle = "rgba(5,9,20,.85)"; c.strokeStyle = renk; c.lineWidth = 1;
      c.fillRect(w - eksen - m - 4, y - 8, m, 15); c.strokeRect(w - eksen - m - 4, y - 8, m, 15);
      c.fillStyle = renk; c.fillText(yazi, w - eksen - m, y + 3);
    };
    c.font = "700 10px system-ui,sans-serif";
    etiket(p90, yesil, "p90 " + fiyat(giris * Math.exp(p90)));
    etiket(p10, kirmizi, "p10 " + fiyat(giris * Math.exp(p10)));
    etiket(medyan[medyan.length - 1], altin, "median " + fiyat(giris * Math.exp(medyan[medyan.length - 1])));
  }
  c.fillStyle = "rgba(255,255,255,.55)"; c.font = "600 10px system-ui,sans-serif";
  c.textAlign = "right"; c.fillText(rozet, w - eksen - 4, 14); c.textAlign = "left";
}

/* 18 Nov 2026 (owner: "write under the Time Machine, in small text, what it means"): a plain-language reading of
   the three numbers for the visitor's own plan. Break-even uses the plan's reward:risk (a 2R target needs TP-first
   in more than 1 of 3 to break even, before fees). */
export function yorum({ tp, sl, hic, n, ufuk, pl, kaynak, sinif = "tm__n" }) {
  const pTp = tp / n, pSl = sl / n, pHic = hic / n;
  const yuz = (p) => Math.round(p * 100);
  const yon = pl.alis ? "long" : "short";
  const c = [];
  c.push("📝 What this means: in " + yuz(pTp) + " of 100 " + kaynak + " the price reached your take profit before your stop, in " + yuz(pSl) + " the stop came first, and in " + yuz(pHic) + " neither was reached within " + ufuk + " h.");
  if (pl.tp != null && pl.sl != null) {
    const R = Math.abs(Math.log(pl.tp / pl.giris)) / Math.abs(Math.log(pl.sl / pl.giris));
    const esik = 1 / (1 + R);
    const karar = pTp + pSl > 0 ? pTp / (pTp + pSl) : 0;
    c.push("Your target is " + R.toFixed(1) + "× your stop distance, so this " + yon + " breaks even (before fees) if take profit comes first in more than " + yuz(esik) + " of every 100 trades that finish.");
    c.push(karar > esik + 0.1 ? "Of the futures that finished, " + yuz(karar) + "% hit take profit first: above that line, so the odds lean in favour of this plan."
      : karar < esik - 0.1 ? "Of the futures that finished, only " + yuz(karar) + "% hit take profit first: below that line, so the odds lean against this plan as set up."
      : "Of the futures that finished, " + yuz(karar) + "% hit take profit first: close to that line, so this plan is roughly a coin flip.");
  }
  if (pHic >= 0.4) c.push("Often nothing happens within " + ufuk + " h: the price may not move far enough. A closer target or a longer horizon changes the picture.");
  c.push("Odds, not a promise: one trade can still go either way.");
  return el("div", { sinif, attr: { style: "border-left:2px solid var(--marka);padding-left:8px" }, yazi: c.join(" ") });
}

