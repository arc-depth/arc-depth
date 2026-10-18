/* ===========================================================================
 * denetim-teminat-izle.mjs — the Discover collateral reader, run in Node
 *
 *   node scripts/denetim-teminat-izle.mjs
 *
 * Runs docs/js/teminat-izle.js against the mainnet rehearsal basket
 * (dagitim-sepet-prova.json: its own Defter and vaults on Arc and Base,
 * a real launch made on 18 Oct) and against the live one-pool Defter.
 * Reads only; nothing is sent.
 * =========================================================================== */
import fs from "fs";
import { teminatDurumu, islemZincirleri, SEPET } from "../docs/js/teminat-izle.js";

const P = JSON.parse(fs.readFileSync(new URL("../dagitim-sepet-prova.json", import.meta.url), "utf8")).adres;
const prova = { ...SEPET, defter: P["Arc SepetDefteri"], kasa: { 26: P["Arc SepetKasasi"], 6: P["Base SepetKasasi"] } };
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };

console.log("TEMINAT IZLE  prova sepeti (Arc + Base), ana ag, yalniz okuma");
const t = await teminatDurumu(P["Arc token"], prova);
ok(t !== null, "Defter'de launch bulundu", t && "id " + t.id);
ok(t.kalemler.length === 2, "iki kalem okundu", t.kalemler.map((k) => k.zincirAd + " $" + k.ilk).join(", "));
ok(t.hatalar.length === 0, "her zincir okundu", t.hatalar.join("; ") || "hata yok");
ok(t.eksik === 0, "her kalemin degeri var", t.kalemler.map((k) => k.zincirAd + " " + k.miktar + " birim = $" + (k.deger ?? "?") + " (" + k.kaynak + ")").join(", "));
ok(Number.isFinite(t.simdi) && t.ilk > 0, "baslangic ve simdi hesaplandi", "$" + t.ilk.toFixed(4) + " -> $" + t.simdi.toFixed(4) + "  " + (t.degisim * 100).toFixed(2) + "%  bekleyen $" + t.bekleyen.toFixed(4));
const z = await islemZincirleri(P["Arc token"], prova);
ok(z.zincirler[0] === "Arc", "islem zincirleri okundu", z.zincirler.join(", ") + (z.adapter ? "" : " (ikiz yayilmamis)"));
const yok = await teminatDurumu("0x000000000000000000000000000000000000dEaD");
ok(yok === null, "canli Defter'de olmayan token null doner");
console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
process.exit(kaldi ? 1 : 0);
