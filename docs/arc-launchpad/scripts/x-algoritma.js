"use strict";
/* ===========================================================================
 * x-algoritma.js — what X's ranking actually rewards, read from X's own code
 *
 *   node scripts/x-algoritma.js
 *
 * X publishes the For You ranking at github.com/xai-org/x-algorithm. The
 * weights that turn predicted engagement into a score live in
 * home-mixer/params/param.rs, and the arithmetic in
 * xai-value-model/scoring.rs. This pulls that file and prints the weights
 * sorted by magnitude, so the question "what should we post" is answered
 * from the production constants rather than from a growth blog.
 *
 * It exists because the blogs disagree with the code. One widely repeated
 * claim is that a link in the post body costs 50-90% of reach; the file
 * has OpenLinkWeight at +0.2, a positive term. Another is that hashtags
 * drive discovery; the word does not appear in the weights at all.
 *
 * The numbers change. That is the point of making this repeatable instead
 * of writing them into a document once: run it again and diff.
 *
 * No key, no cost, no account needed.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");

const KAYNAK = "https://raw.githubusercontent.com/xai-org/x-algorithm/main/home-mixer/params/param.rs";
const CIKTI = path.join(__dirname, "..", "rapor", "x-algoritma.json");

function al(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { "user-agent": "arc-pulse/1.0" } }, (s) => {
      if (s.statusCode >= 300 && s.statusCode < 400 && s.headers.location) {
        s.resume();
        return res(al(s.headers.location));
      }
      if (s.statusCode !== 200) { s.resume(); return rej(new Error("HTTP " + s.statusCode)); }
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => res(b));
    }).on("error", rej);
  });
}

/* The weights are declared with a macro, sometimes on one line and
 * sometimes wrapped over five:
 *
 *   param!(ReplyWeight, f64, "rust_home_mixer_reply_weight", 5.0);
 *
 * The value is the last argument. Anchoring on the macro matters: a
 * looser "name then first number" pattern reported every weight as 64,
 * because it was reading the 64 out of the type name f64. */
function agirliklar(kod) {
  const bulunan = new Map();
  const re = /param!\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*f64\s*,\s*"[^"]*"\s*,\s*(-?\d+(?:\.\d+)?)\s*,?\s*\)/g;
  let m;
  while ((m = re.exec(kod)) !== null) {
    if (!/Weight|Boost/.test(m[1])) continue;
    if (!bulunan.has(m[1])) bulunan.set(m[1], Number(m[2]));
  }
  return bulunan;
}

async function main() {
  const kod = await al(KAYNAK);
  const a = agirliklar(kod);
  if (a.size === 0) {
    console.error("param.rs okundu ama hicbir agirlik cikarilamadi — dosyanin bicimi degismis olabilir.");
    console.error("Kaynak: " + KAYNAK + "  (" + kod.length + " bayt)");
    process.exit(1);
  }

  const satir = [...a.entries()].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const like = a.get("FavoriteWeight");

  console.log("X For You siralama agirliklari — " + new Date().toISOString().slice(0, 10));
  console.log("kaynak: " + KAYNAK);
  console.log("");
  const en = Math.max(...satir.map(([ad]) => ad.length));
  for (const [ad, deg] of satir) {
    const kat = like ? (deg / like) : null;
    console.log(
      ad.padEnd(en) + "  " + String(deg).padStart(8) +
      (kat !== null && ad !== "FavoriteWeight" ? "   (" + (kat >= 0 ? "" : "") + kat.toFixed(1) + "x begeni)" : "")
    );
  }

  console.log("");
  console.log("Okuma notlari:");
  if (a.has("ReplyWeight") && a.has("BidirectionalFollowReplyWeightBoost")) {
    const r = a.get("ReplyWeight"), b = a.get("BidirectionalFollowReplyWeightBoost");
    console.log("- Karsilikli takipte cevap " + r + " degil " + (r + b) + " sayiliyor. Dogru hesaplari");
    console.log("  takip edip geri takip almak, her cevabimizi " + ((r + b) / r).toFixed(0) + " kat agirlastiriyor.");
  }
  if (a.has("ShareViaCopyLinkWeight")) {
    console.log("- En agir olumlu eylem baglantiyi kopyalayip paylasmak (" + a.get("ShareViaCopyLinkWeight") + ").");
    console.log("  Yani hedef begeni degil, birinin gonderiyi alip arkadasina yollamasi.");
  }
  if (a.has("OpenLinkWeight")) {
    console.log("- Baglanti cezasi yok: OpenLinkWeight " + a.get("OpenLinkWeight") + ", yani artida.");
  }
  if (a.has("ProfileClickWeight")) {
    console.log("- Profil tiklamasi siralamada " + a.get("ProfileClickWeight") + " ediyor; takip (" +
                (a.get("FollowAuthorWeight") ?? "?") + ") ediyor.");
  }
  const kotu = satir.filter(([, d]) => d < 0);
  if (kotu.length && like) {
    const [ad, d] = kotu[0];
    console.log("- En pahali hata " + ad + " (" + d + "): tek bir tanesi " +
                Math.round(Math.abs(d) / like) + " begenilik zarar.");
  }
  console.log("- 'Hashtag' agirliklarda hic gecmiyor: " +
              (/hashtag/i.test(kod) ? "dosyada adi geciyor ama agirlik olarak degil." : "dosyada adi dahi gecmiyor."));

  fs.mkdirSync(path.dirname(CIKTI), { recursive: true });
  fs.writeFileSync(CIKTI, JSON.stringify({
    okundu: new Date().toISOString(),
    kaynak: KAYNAK,
    agirliklar: Object.fromEntries(satir),
  }, null, 2));
  console.log("");
  console.log(CIKTI);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
