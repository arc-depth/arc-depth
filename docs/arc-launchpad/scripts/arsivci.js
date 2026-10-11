"use strict";
/* Keeping raw evidence, in one place.
 *
 * Both archives — the bridge collateral one and the Fathom launch one —
 * need the same thing: fetch a read-only call, keep the result exactly as
 * the node returned it, and record beside it the method and params that
 * produced it plus a hash of what was written. Two copies of that would
 * drift, and the one place drift is least affordable is the code whose
 * job is to let somebody check my claims without trusting me.
 *
 * What an archive built with this is and is not: it makes a claim
 * checkable, not honest. I fetched it, so it cannot prove I fetched it
 * faithfully. What it gives is a manifest whose hashes must match the
 * files, receipts carrying blockHash against blocks carrying hash and
 * parentHash, and coverage recorded window by window — so internal
 * inconsistency is visible offline, and any single item can be re-fetched
 * in one call when an endpoint is not throttling.
 */
const https = require("https");
const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function Arsivci(dizin) {
  const nokta = path.join(dizin, "nokta");
  fs.mkdirSync(nokta, { recursive: true });
  const kayitlar = [];
  let cagri = 0, yeniden = 0;

  /* Whatever a previous run already got, verbatim and intact, is not
     fetched again. Throttling means a run can come back partial, and an
     archive that has to be rebuilt from nothing to repair two files is an
     archive nobody repairs. A record is reused only if it succeeded and
     its file still hashes to what the manifest recorded. */
  let onceki = new Map();
  try {
    const o = JSON.parse(fs.readFileSync(path.join(dizin, "ozet.json"), "utf8"));
    for (const k of o.kayitlar || []) if (k.basarili) onceki.set(k.dosya, k);
  } catch (e) { /* no earlier archive, or an unreadable one: start fresh */ }

  function saglamMi(kayit) {
    const yol = path.join(dizin, kayit.dosya);
    if (!fs.existsSync(yol)) return false;
    return crypto.createHash("sha256").update(fs.readFileSync(yol)).digest("hex") === kayit.sha256;
  }

  function ham(url, yontem, parametreler) {
    cagri++;
    const u = new URL(url);
    const tasiyici = u.protocol === "http:" ? http : https;
    const govde = JSON.stringify({ jsonrpc: "2.0", id: cagri, method: yontem, params: parametreler });
    return new Promise((coz) => {
      const istek = tasiyici.request({
        hostname: u.hostname, port: u.port || undefined, path: u.pathname || "/", method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(govde) }
      }, (y) => {
        let v = "";
        y.on("data", (p) => (v += p));
        y.on("end", () => {
          try {
            const c = JSON.parse(v);
            if (c.error) return coz({ hata: c.error.message, kod: c.error.code, http: y.statusCode });
            coz({ sonuc: c.result, http: y.statusCode });
          } catch (e) { coz({ hata: "cozulemeyen yanit", http: y.statusCode }); }
        });
      });
      istek.on("error", (e) => coz({ hata: e.message }));
      istek.write(govde);
      istek.end();
    });
  }

  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Throttling is the normal state of these endpoints, so a 429 is
     retried with growing gaps. Recording it as an answer would turn "I
     was rate limited" into a claim about the chain, which is the mistake
     that made the first version of the collateral scan print "no logs"
     after every call had failed. */
  async function sabirli(url, yontem, parametreler, denemeTavani = 6) {
    for (let d = 0; d < denemeTavani; d++) {
      const c = await ham(url, yontem, parametreler);
      if (c.sonuc !== undefined) return c;
      const iz = (c.hata || "") + " " + (c.kod || "") + " " + (c.http || "");
      if (!/rate limit|too many|429|-32005|limit exceeded/i.test(iz)) return c;
      await bekle(700 * (d + 1));
    }
    return { hata: "rate limit (" + denemeTavani + " denemeden sonra)" };
  }

  /* The result verbatim: nothing reformatted, nothing selected out. */
  function yaz(ad, url, yontem, parametreler, cevap, ek) {
    const dosya = path.join(nokta, ad + ".json");
    const govde = JSON.stringify(
      cevap.sonuc === undefined ? { hata: cevap.hata } : cevap.sonuc, null, 1) + "\n";
    fs.writeFileSync(dosya, govde);
    kayitlar.push(Object.assign({
      dosya: path.relative(dizin, dosya).replace(/\\/g, "/"),
      uc: url, yontem, parametreler,
      alindi: new Date().toISOString(),
      sha256: crypto.createHash("sha256").update(govde).digest("hex"),
      basarili: cevap.sonuc !== undefined
    }, ek || {}));
    return cevap.sonuc;
  }

  /* Fetch and archive in one step, which is what nearly every call site
     wants and what keeps a fetched-but-unarchived result from existing.
     With `degismez`, a record a previous run already holds intact is
     reused instead of re-fetched.

     Reuse is off unless the caller says the answer cannot change. A
     receipt or a block at a fixed height is settled history and reusing
     it is free. A balance, a totalSupply, extsload at "latest" or
     eth_blockNumber are current state, and serving yesterday's copy of
     those as though it were current is a worse failure than re-fetching:
     it would hand back a stale number with a fresh timestamp beside it. */
  async function al(ad, url, yontem, parametreler, ek, degismez) {
    const dosya = path.join("nokta", ad + ".json").replace(/\\/g, "/");
    const eski = degismez ? onceki.get(dosya) : undefined;
    if (eski && saglamMi(eski)) {
      kayitlar.push(Object.assign({}, eski, { yenidenKullanildi: true }));
      yeniden++;
      return { sonuc: JSON.parse(fs.readFileSync(path.join(dizin, dosya), "utf8")) };
    }
    const c = await sabirli(url, yontem, parametreler);
    return { sonuc: yaz(ad, url, yontem, parametreler, c, ek), hata: c.hata };
  }

  function ozetYaz(alanlar) {
    /* A manifest must not quietly shrink. ozetYaz writes only what THIS
       run collected, so using the archiver for a couple of ad-hoc reads
       overwrites a full manifest with two lines — the files survive but
       the index forgets them, and the archive silently stops covering
       what it covered yesterday. That happened once, to kanit-yonetisim.
       It is not fixed by merging, because a merged entry would claim
       coverage this run did not verify; it is fixed by refusing to be
       silent about it. */
    if (onceki.size > kayitlar.length) {
      console.log("  !! MANIFEST KUCULUYOR: onceki " + onceki.size + " kayit, bu kosu " +
        kayitlar.length + ". Kismi bir kosuysa ozetYaz CAGIRMA — yoksa arsiv " +
        "dunku kapsamini kaybeder. Eksilen: " +
        [...onceki.keys()].filter((d) => !kayitlar.some((k) => k.dosya === d))
          .slice(0, 6).join(", "));
    }
    const basarisiz = kayitlar.filter((k) => !k.basarili);
    const ozet = Object.assign({
      uretildi: new Date().toISOString(),
      uyari: "Benim cektigim bir arsiv, durust cektigimin kaniti DEGILDIR. " +
             "Yaptigi sey iddiayi kontrol edilebilir kilmak: manifest ozetleri " +
             "dosyalarla tutmak zorunda, makbuzlar blockHash tasiyor ve bloklar " +
             "kendi hash/parentHash'ini tasiyor, kapsam pencere pencere kayitli. " +
             "Her kalem, uc throttle etmedigi bir anda tek cagriyla yeniden " +
             "dogrulanabilir."
    }, alanlar, { kayitlar });
    fs.writeFileSync(path.join(dizin, "ozet.json"), JSON.stringify(ozet, null, 1) + "\n");
    return { kayit: kayitlar.length, basarisiz: basarisiz.length, basarisizlar: basarisiz };
  }

  return {
    al, yaz, sabirli, bekle, ozetYaz, kayitlar,
    get cagri() { return cagri; },
    get yenidenKullanilan() { return yeniden; },
    dizin, nokta
  };
}

module.exports = { Arsivci };
