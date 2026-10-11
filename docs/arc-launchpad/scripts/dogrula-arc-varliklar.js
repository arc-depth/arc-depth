"use strict";
/* Re-derives the asset catalogue's conclusions from its own files, with no
 * network.
 *
 * Review's objection was exact: the manifest carried the conclusions —
 * which proxy, which implementation, which selectors — and the archive did
 * not carry the evidence, because the proxy resolution was fetched with
 * sabirli() and never written. A resolution nobody can re-derive is an
 * assertion with a hash on it.
 *
 * So this reads the archived proxy slot response, resolves the
 * implementation address from it, reads the archived implementation
 * bytecode, re-runs the selector scan, and checks the answer against what
 * the manifest claims. If the two disagree, the manifest is wrong.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { id: keccakId, getAddress } = require("ethers");

const DIZIN = path.join(__dirname, "..", "kanit-arc-varliklar");
const sel = (imza) => keccakId(imza).slice(0, 10);

let gecen = 0, kalan = 0;
const ok = (ad, kosul, not) => {
  if (kosul) { gecen++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kalan++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};
const oku = (dosya) => JSON.parse(fs.readFileSync(path.join(DIZIN, dosya), "utf8"));

console.log("");
console.log("ARC VARLIK KATALOGU DOGRULAMASI   (ag yok)");
console.log("  " + DIZIN);

const ozet = oku("ozet.json");

/* ---- 1. the manifest still describes these files ---------------- */
console.log("");
console.log("MANIFEST");
let bozuk = 0;
for (const k of ozet.kayitlar) {
  const yol = path.join(DIZIN, k.dosya);
  if (!fs.existsSync(yol)) { bozuk++; console.log("     EKSIK " + k.dosya); continue; }
  const h = crypto.createHash("sha256").update(fs.readFileSync(yol)).digest("hex");
  if (h !== k.sha256) { bozuk++; console.log("     HASH DEGISMIS " + k.dosya); }
}
ok("butun kayitlarin sha256'si tutuyor", bozuk === 0, ozet.kayitlar.length + " kayit");
ok("basarisiz kayit yok", ozet.kayitlar.every((k) => k.basarili));

/* ---- 2. every read is pinned to one block ---------------------- */
console.log("");
console.log("OKUMALAR BLOGA SABIT MI");
const latestOlanlar = ozet.kayitlar.filter((k) =>
  Array.isArray(k.parametreler) && k.parametreler.some((p) => p === "latest"));
/* chainId and blockNumber take no block tag; everything else must be pinned. */
const muaf = new Set(["nokta/zincir.json", "nokta/son-blok.json"]);
const kacak = latestOlanlar.filter((k) => !muaf.has(k.dosya));
ok("hicbir varlik okumasi 'latest' degil", kacak.length === 0,
   kacak.length ? kacak.map((k) => k.dosya).join(", ") : "");
const bloklar = new Set(ozet.kayitlar
  .filter((k) => Array.isArray(k.parametreler))
  .map((k) => k.parametreler.find((p) => typeof p === "string" && /^0x[0-9a-f]+$/i.test(p) && p.length < 12))
  .filter(Boolean));
ok("tek bir blok yuksekligi kullanilmis", bloklar.size <= 1,
   [...bloklar].map((b) => String(BigInt(b))).join(", ") || "-");

/* ---- 3. the proxy resolution is re-derivable ------------------- */
console.log("");
console.log("PROXY COZUMU DOSYADAN YENIDEN TURETILIYOR MU");
for (const v of ozet.varliklar) {
  if (!v.implementasyon) { ok(v.sembol + ": proxy yok, atlandi", true); continue; }

  /* The first slot that is NON-ZERO, not the first that exists. Both slot
     reads are archived for every asset — the empty one is evidence too,
     that the path was tried — so picking the first existing file found
     USDC's empty EIP-1967 slot and reported the evidence missing when it
     was sitting right there under oz-legacy. */
  const slotDosya = ["eip-1967", "oz-legacy"]
    .map((t) => "nokta/proxy-slot-" + v.ad + "-" + t + ".json")
    .filter((f) => fs.existsSync(path.join(DIZIN, f)))
    .find((f) => { try { return BigInt(oku(f)) !== 0n; } catch (e) { return false; } });
  const cagriDosya = "nokta/impl-cagri-" + v.ad + ".json";
  const kaynak = slotDosya
    || (fs.existsSync(path.join(DIZIN, cagriDosya)) ? cagriDosya : null);
  ok(v.sembol + ": implementasyon kaniti arsivde", !!kaynak, kaynak || "YOK");
  if (!kaynak) continue;

  const ham = oku(kaynak);
  const turetilen = getAddress("0x" + String(ham).slice(26));
  ok("  " + v.sembol + ": adres kanittan turetiliyor",
     turetilen.toLowerCase() === v.implementasyon.toLowerCase(), turetilen);

  const kodDosya = "nokta/impl-kod-" + v.ad + ".json";
  ok("  " + v.sembol + ": implementasyon bytecode'u arsivde",
     fs.existsSync(path.join(DIZIN, kodDosya)));
  if (!fs.existsSync(path.join(DIZIN, kodDosya))) continue;
  const kod = oku(kodDosya);
  ok("  " + v.sembol + ": bytecode boyutu manifestle ayni",
     (kod.length - 2) / 2 === v.implementasyonBoyutu,
     ((kod.length - 2) / 2) + "b");

  /* the scan, re-run here rather than trusted */
  const yeniden = (v.kisitSecicileri || []).filter((x) => kod.includes(sel(x).slice(2)));
  ok("  " + v.sembol + ": kisit secicileri bytecode'da gercekten var",
     yeniden.length === (v.kisitSecicileri || []).length,
     (v.kisitSecicileri || []).length ? (v.kisitSecicileri || []).join(", ") : "liste bos");
  const yetkiYeniden = (v.yetkiSecicileri || []).filter((x) => kod.includes(sel(x).slice(2)));
  ok("  " + v.sembol + ": yetki secicileri bytecode'da gercekten var",
     yetkiYeniden.length === (v.yetkiSecicileri || []).length,
     (v.yetkiSecicileri || []).join(", "));
}

/* ---- 4. the conclusion is stated as a measurement ------------- */
console.log("");
console.log("SONUC FAZLA KESIN YAZILMIS MI");
ok("manifest yetenek uyarisini tasiyor",
   typeof ozet.yetenekNotu === "string" && /kanitlamaz/.test(ozet.yetenekNotu));
ok("hicbir varlik 'dondurulamaz' diye isaretlenmemis",
   ozet.varliklar.every((v) => v.hedefliDondurmaYetenegi !== "YOK" &&
     !/kapali/i.test(String(v.hedefliDondurmaYetenegi))));
ok("dordu de yukseltilebilir proxy olarak kayitli",
   ozet.varliklar.every((v) => v.yukseltilebilirProxy === true),
   ozet.varliklar.filter((v) => v.yukseltilebilirProxy).length + "/" + ozet.varliklar.length);
for (const v of ozet.varliklar)
  console.log("    " + String(v.sembol).padEnd(8) + v.hedefliDondurmaYetenegi);

console.log("");
console.log("  " + gecen + " gecti, " + kalan + " kaldi");
console.log("  Hicbir ag cagrisi yapilmadi.");
process.exit(kalan ? 1 : 0);
