/* ===========================================================================
 * bicim.js — formatting, in one place
 *
 * WHY THIS IS NOT A ONE-LINER PER VIEW
 *   A memecoin's price is $0.0000035 and its market cap is $3,500. The same
 *   formatter cannot serve both: four decimals hides the price entirely and
 *   nine decimals makes the cap unreadable. So significant digits are
 *   chosen from the magnitude, and every view uses the same choice — which
 *   is what stops the same number appearing two ways on two screens.
 *
 * SUBSCRIPT ZEROS
 *   $0.0000035 is hard to compare at a glance and harder on a phone, so a
 *   price with a run of leading zeros renders as $0.0₅35, the convention
 *   every exchange uses. It is shorter AND easier to compare, because the
 *   count is a digit instead of something to squint at.
 *
 * BIGINT IN, STRING OUT
 *   Amounts arrive from the chain as integers with decimals. They are
 *   divided here and nowhere else: a view that does `Number(x)/1e18` early
 *   has already lost precision before it formats.
 * =========================================================================== */

const ALTSIMGE = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];

function altSimge(n) {
  return String(n).split("").map((d) => ALTSIMGE[Number(d)] || d).join("");
}

/** Integer with `ondalik` decimals -> Number. Precision is lost here, on
 *  purpose and at the last possible moment. */
export function tamSayidanSayi(deger, ondalik) {
  const b = typeof deger === "bigint" ? deger : BigInt(deger ?? 0);
  const bol = 10n ** BigInt(ondalik);
  const tam = b / bol;
  const kalan = b % bol;
  return Number(tam) + Number(kalan) / Number(bol);
}

/**
 * Money. Significant digits follow magnitude so a price and a market cap
 * can both be read.
 */
export function para(n, { simge = "$", kisalt = false } = {}) {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);

  if (kisalt && a >= 1000) return simge + kisaBuyuk(n);

  if (a === 0) return simge + "0.00";

  /* Below a cent, a run of zeros becomes a subscript count. */
  if (a < 0.01) {
    const s = a.toFixed(20);
    const kesir = s.split(".")[1] || "";
    let sifir = 0;
    while (sifir < kesir.length && kesir[sifir] === "0") sifir++;
    const anlamli = kesir.slice(sifir, sifir + 4).replace(/0+$/, "") || "0";
    const isaret = n < 0 ? "-" : "";
    if (sifir >= 3) return isaret + simge + "0.0" + altSimge(sifir) + anlamli;
    return isaret + simge + a.toFixed(Math.min(8, sifir + 4));
  }

  const basamak = a < 1 ? 4 : a < 100 ? 2 : 2;
  return (n < 0 ? "-" : "") + simge +
    a.toLocaleString("en-US", { minimumFractionDigits: basamak, maximumFractionDigits: basamak });
}

/** 1.23M / 4.5K. For axis labels and compact cards only. */
export function kisaBuyuk(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  const i = n < 0 ? "-" : "";
  if (a >= 1e12) return i + (a / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return i + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return i + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return i + (a / 1e3).toFixed(2) + "K";
  return i + a.toFixed(2);
}

/** Token amounts. Never to 18 decimals — nobody reads that. */
export function jetonMiktar(n) {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return kisaBuyuk(n);
  if (a >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (a === 0) return "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/** A signed percentage, with the sign always shown. */
export function yuzde(n, basamak = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(basamak) + "%";
}

/** ppm as a percentage: 3_000 -> "0.30%". */
export function ppmYuzde(ppm) {
  return (ppm / 10_000).toFixed(2) + "%";
}

/** Relative time, short. */
export function gecenSure(ms) {
  if (!ms) return "—";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return s + "s";
  const d = Math.floor(s / 60);
  if (d < 60) return d + "m";
  const h = Math.floor(d / 60);
  if (h < 24) return h + "h";
  const g = Math.floor(h / 24);
  if (g < 30) return g + "d";
  return Math.floor(g / 30) + "mo";
}

export function tarih(ms) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

/** Blocks -> a readable duration, at Arc's measured 0.507 s/block. */
export function bloktanSure(blok) {
  const sn = blok * 0.507;
  if (sn < 90) return Math.round(sn) + " s";
  if (sn < 5400) return (sn / 60).toFixed(0) + " min";
  return (sn / 3600).toFixed(2) + " h";
}
