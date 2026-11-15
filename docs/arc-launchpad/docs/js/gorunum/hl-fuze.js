/* ===========================================================================
 * gorunum/hl-fuze.js — Aim assist (the "missile") at the top of the #/perps/trade order form
 *
 * 15 Nov 2026 (owner approved). From a Target Radar card ("Aim long / Aim short") or by hand: the visitor
 * says how much they are willing to lose and how wide the stop should be; this works out a complete
 * bracket in one go and loads it into the order form:
 *   stop loss   outside normal noise, from the last 7 days of 1 h moves (hl-kask.js oynaklik):
 *               tight = 1.5 typical hours, normal = half a typical day, wide = one typical day
 *   size        so that a filled stop loses about the chosen amount, fees in and out included
 *   leverage    isolated, the lowest that fits the free margin, and only if the estimated
 *               liquidation is well beyond the stop (otherwise it says so and loads nothing risky)
 *   take profit 2× or 3× the stop distance (2R / 3R), or none
 * It only fills the form. The visitor still presses Review (Pulse HUD shows every check) and signs:
 * the same tested path as any order (normalTpsl, every line with the builder fee).
 * =========================================================================== */

import { el } from "../ui.js";
import { oynaklik } from "./hl-kask.js";
import { zamanMakinesi } from "./hl-zaman.js";

const STIL =
  ".fz{border:1px solid var(--marka);border-radius:12px;padding:10px 12px;display:grid;gap:8px;font-size:13px}" +
  ".fz__bas{display:flex;justify-content:space-between;align-items:center;font-weight:700}.fz__bas small{font-weight:500;color:var(--yazi-3)}" +
  ".fz__sec{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.fz__sec button{min-height:36px}" +
  ".fz__sec button[aria-pressed=true]{border-color:var(--marka);color:var(--yazi-1);background:var(--marka-zemin,rgba(124,92,255,.12))}" +
  ".fz__iki{display:grid;grid-template-columns:1fr 1fr;gap:6px}.fz__iki button[aria-pressed=false]{background:transparent;color:var(--yazi-2);border-color:var(--cizgi)}" +
  ".fz label{font-size:12px;color:var(--yazi-3)}.fz .girdi{height:40px;font-size:15px}" +
  ".fz__plan{display:grid;gap:3px;border-top:1px solid var(--cizgi);padding-top:8px}.fz__plan div{display:flex;justify-content:space-between;gap:10px}.fz__plan span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}" +
  ".fz__n{font-size:11.5px;color:var(--yazi-3);line-height:1.4}.fz__h{color:var(--satis);font-weight:600}";

const GENISLIK = { dar: { ad: "Tight", k: (o) => o.saat * 1.5, aciklama: "1.5 typical hours" }, normal: { ad: "Normal", k: (o) => o.gun * 0.5, aciklama: "half a typical day" }, genis: { ad: "Wide", k: (o) => o.gun, aciklama: "one typical day" } };

/** `ortam` = { hl, usd, fiyat, P(), H(), yukle(plan) }, `yon` = "alis" | "satis" | null (from ?aim=) */
export function fuzePaneli(ortam, yon0) {
  const { hl, usd, fiyat } = ortam;
  if (!document.getElementById("fz-stil")) document.head.append(el("style", { attr: { id: "fz-stil" }, yazi: STIL }));
  let yon = yon0 || "alis", gen = "normal", r = 2;
  const riskG = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", value: "10", "aria-label": "Most you are willing to lose in USD" } });
  const yonK = el("div", { sinif: "fz__iki" }), genK = el("div", { sinif: "fz__sec" }), rK = el("div", { sinif: "fz__sec" });
  const plan = el("div", { sinif: "fz__plan" });
  const yukleDug = el("button", { sinif: "dugme dugme--marka dugme--tam", attr: { type: "button" }, yazi: "Load into the order form" });
  let son = null, sonPlan = null;
  const zm = zamanMakinesi({ plan: () => sonPlan, fiyat });
  const kutu = el("div", { sinif: "fz", attr: { "aria-label": "Aim assist" } }, [
    el("div", { sinif: "fz__bas" }, [el("span", { yazi: "🎯 Aim assist" }), el("small", { yazi: "fills the form, you still review and sign" })]),
    yonK,
    el("div", {}, [el("label", { yazi: "Most you are willing to lose if the stop fills (USD)" }), riskG]),
    el("div", {}, [el("label", { yazi: "Stop distance" }), genK]),
    el("div", {}, [el("label", { yazi: "Take profit" }), rK]),
    plan, yukleDug, zm.kutu,
    el("div", { sinif: "fz__n", yazi: "Stop distances come from the market's own moves over the last 7 days, so the stop sits outside normal noise. Isolated margin, so a loss is limited to this position's margin. Not advice: you choose the side." }),
  ]);
  const secDug = (k, ad, aktif, f, sinif = "dugme dugme--sade dugme--kucuk") => el("button", { sinif, attr: { type: "button", "aria-pressed": String(aktif) }, yazi: ad, on: { click: f } });
  const dugmeler = () => {
    yonK.replaceChildren(secDug("alis", "Long", yon === "alis", () => { yon = "alis"; dugmeler(); hesapla(); }, "dugme dugme--alis"), secDug("satis", "Short", yon === "satis", () => { yon = "satis"; dugmeler(); hesapla(); }, "dugme dugme--satis"));
    genK.replaceChildren(...Object.entries(GENISLIK).map(([k, x]) => secDug(k, x.ad, gen === k, () => { gen = k; dugmeler(); hesapla(); })));
    rK.replaceChildren(...[[2, "2R"], [3, "3R"], [0, "None"]].map(([k, ad]) => secDug(k, ad, r === k, () => { r = k; dugmeler(); hesapla(); })));
  };
  riskG.addEventListener("input", () => hesapla());

  async function hesapla() {
    const P = ortam.P(), H = ortam.H();
    const o = await oynaklik(hl, P.ad);
    son = null; sonPlan = null; yukleDug.disabled = true;
    const satir = (a, b, s = "") => el("div", {}, [el("span", { yazi: a }), el("span", { sinif: s, yazi: b })]);
    if (!o) { plan.replaceChildren(el("div", { sinif: "fz__n", yazi: "Not enough price history for this market to place a stop outside its noise." })); return; }
    const risk = Number(String(riskG.value).replace(/[$,\s]/g, ""));
    if (!(risk > 0)) { plan.replaceChildren(el("div", { sinif: "fz__n", yazi: "Enter the most you are willing to lose." })); return; }
    const alis = yon === "alis";
    const ref = P.mid || P.mark;
    const d = GENISLIK[gen].k(o);
    const alici = H ? H.alici : 0.00045;
    const ucret = 3 * alici + 2 * hl.BUILDER_ORAN;            // in + stop out (market) + a taker fee's worth of stop slippage
    let boyut = Math.floor((risk / (d + ucret)) * 100) / 100;
    const sl = Number(hl.fiyatYaz(ref * (alis ? 1 - d : 1 + d), P.szDec));
    const tp = r ? Number(hl.fiyatYaz(ref * (alis ? 1 + d * r : 1 - d * r), P.szDec)) : null;
    /* lowest isolated leverage that fits the free margin; the liquidation must be at least 1.5 stop distances away */
    const serbest = H ? H.cekilebilir * 0.95 : null;
    let kal = serbest ? Math.max(1, Math.ceil(boyut / Math.max(serbest, 1e-9))) : 1;
    if (!H) kal = Math.max(1, Math.min(P.maxKal, Math.floor(1 / (2 * d + 1 / (2 * P.maxKal)))));   // no account read: the most leverage that keeps the liquidation 2 stops away
    const liqUzak = (k) => { const l = hl.liqTahmin({ px: ref, boyut: boyut / ref, alis, kal: k, capraz: false, hesapDegeri: boyut / k, maxKal: P.maxKal }); return l > 0 ? Math.abs(l - ref) / ref : Infinity; };
    const sorunlar = [];
    if (kal > P.maxKal) sorunlar.push("Your free margin (" + usd(H.cekilebilir) + ") is too small for this risk even at " + P.maxKal + "×. Lower the amount or use a wider stop.");
    kal = Math.min(kal, P.maxKal);
    if (liqUzak(kal) < d * 1.5) sorunlar.push("At " + kal + "× the liquidation would come before or near the stop. Lower the amount, add margin, or use a tighter stop.");
    if (boyut < hl.EN_AZ_USD) sorunlar.push("That is below Hyperliquid's $" + hl.EN_AZ_USD + " minimum order. Raise the amount or use a tighter stop.");
    sonPlan = { coin: P.ad, giris: ref, tp, sl, alis };
    /* the chart draws the plan (entry, stop, target) */
    try { window.dispatchEvent(new CustomEvent("hl-plan", { detail: sonPlan })); } catch (e) { /* old browser */ }
    const liq = hl.liqTahmin({ px: ref, boyut: boyut / ref, alis, kal, capraz: false, hesapDegeri: boyut / kal, maxKal: P.maxKal });
    plan.replaceChildren(
      satir((alis ? "Long " : "Short ") + P.ad + " at market", "≈ " + fiyat(ref)),
      satir("Stop loss (" + GENISLIK[gen].aciklama + ", " + (d * 100).toFixed(2) + "%)", fiyat(sl)),
      tp ? satir("Take profit (" + r + "R)", fiyat(tp)) : null,
      satir("Size", usd(boyut) + " · " + kal + "× isolated · margin " + usd(boyut / kal)),
      satir("Liquidation ≈", liq > 0 ? fiyat(liq) : "–"),
      satir("If the stop fills", "≈ -" + usd(risk) + " incl. fees", "hl-eks"),
      tp ? satir("If the take profit fills", "≈ +" + usd(boyut * (d * r - (2 * alici + 2 * hl.BUILDER_ORAN))) + " after fees", "hl-art") : null,
      ...sorunlar.map((x) => el("div", { sinif: "fz__h", yazi: x })),
    );
    if (!sorunlar.length) { son = { yon, boyut, kal, sl, tp }; yukleDug.disabled = false; }
  }
  yukleDug.addEventListener("click", () => { if (son) ortam.yukle(son); });
  dugmeler();
  return { kutu, hesapla };
}
