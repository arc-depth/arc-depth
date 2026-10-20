/* denetim-egri.mjs: docs/js/egri.js (the pre-trade estimate) against the forge
   measurement of the ladder without end (nesil2-test/test/SonsuzEgri.t.sol),
   and its reading of a live pool on Arc. */
const m = await import("file:///C:/arc-launchpad/docs/js/egri.js");
let g = 0, k = 0;
const ok = (c, ad, d) => { c ? g++ : k++; console.log((c ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const yak = (a, b, tol) => Math.abs(a / b - 1) <= tol;

console.log("EGRI  islem oncesi tahmin (tukenmeyen merdiven)");
/* the forge launch: founder 100 $, 28M tokens, 98 $ band, 2% tax */
const s0 = m.durum({ fiyat: m.ACILIS, kurucuToken: 28e6, teklif: 98, vergi: 0.02 });
const o0 = m.ozet(s0);
ok(yak(o0.gercekDolar, 98, 1e-9) && yak(o0.token, 972e6, 1e-9), "acilista havuz: 98 $ bant + 972M token", o0.gercekDolar.toFixed(2) + " $");
/* forge: 2.874 $ that stayed in the pool -> x3.403 */
const a = m.alim(s0, 2874 / (1 - m.UCRET - 0.02));
ok(yak(a.fiyatSonra / m.ACILIS, 3.403, 0.002), "2.874 $ net alim fiyati x3,40 yapar (forge x3,403)", (a.fiyatSonra / m.ACILIS).toFixed(4));
/* forge: ~191.600 $ net in -> 16.99M tokens left */
const b = m.alim(s0, 191_600 / (1 - m.UCRET - 0.02));
const s1 = m.durum({ fiyat: b.fiyatSonra, kurucuToken: 28e6, teklif: 98, vergi: 0.02 });
ok(yak(m.ozet(s1).token, 16.96e6, 0.01), "191.600 $ net sonra havuzda ~16,96M token (forge 16,99M)", (m.ozet(s1).token / 1e6).toFixed(2) + "M");
/* round trip: price returns to the open, dollars back < dollars in */
const c = m.alim(s0, 1000);
const s2 = m.durum({ fiyat: c.fiyatSonra, kurucuToken: 28e6, teklif: 98, vergi: 0.02 });
const d = m.satim(s2, c.token);
ok(yak(d.fiyatSonra, m.ACILIS, 1e-9) && d.dolar < 1000, "1.000 $ al, hepsini sat: fiyat acilisa doner, geri gelen < giden", d.dolar.toFixed(2) + " $");
/* selling past the band: stops, the rest finds no buyer */
const e = m.satim(s0, 100e6);
ok(e.bitti && e.satilamayan > 0 && e.dolar < 98, "acilista 100M token satisi: bant (98 $) biter, kalan satilamaz", e.dolar.toFixed(2) + " $, satilamayan " + (e.satilamayan / 1e6).toFixed(1) + "M");
/* the impact formula (fees off): (1 + d/V)^2 - 1 */
const s3 = m.durum({ fiyat: m.ACILIS, kurucuToken: 28e6, teklif: 98, vergi: -m.UCRET });
ok(yak(m.alim(s3, 1000).etki, (1 + 1000 / 3402) ** 2 - 1, 1e-6), "ucretsiz 1.000 $ alim etkisi (1+d/V)^2-1", (m.alim(s3, 1000).etki * 100).toFixed(1) + "%");

/* reading a live pool (PTEST1, the first-generation launchpad: its ladder is the old 2x one, so only the reading is checked) */
const e2 = await import("ethers");
const arc = new e2.JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
const z = await m.zincirdenDurum(e2, arc, "0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d", "0x8366a39CC670B4001A1121B8F6A443A643e40951", "0x44DDc45C7a3a8f2A4C2433c19e31b05261778A23");
ok(z.fiyat > 0 && Math.abs(z.merdiven - 972e6) < 1 && Math.abs(z.teklif - 98) < 1e-6 && Math.abs(z.vergi - 0.02) < 1e-9,
  "zincirden okuma (PTEST1): fiyat, kurucu payi, bant, vergi", "$" + z.fiyat.toPrecision(4) + "/token");
console.log("\n" + g + " gecti, " + k + " kaldi");
process.exit(k ? 1 : 0);
