"use strict";
/* ===========================================================================
 * dexscreener-fathom.js — is Fathom visible where people look?
 *
 *   node scripts/dexscreener-fathom.js
 *
 * The pool can be perfect and still be invisible. This asks DexScreener's
 * free, keyless endpoint whether it has indexed the token yet and prints
 * what it says — liquidity, price, volume — next to what the chain says,
 * so a disagreement between the two is visible instead of assumed away.
 *
 * Nothing here is paid for. DexScreener's "Enhanced Token Info" (logo,
 * socials, description) is a paid listing and is deliberately not used.
 *
 * Indexing is not instant and not ours to control. A blank answer this
 * minute means "not yet", not "broken"; the script says which it is
 * rather than leaving it to be guessed.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, keccak256, id } = require("ethers");

const KOK = path.join(__dirname, "..");
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const D = (() => { try { return JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-depth.json"), "utf8")); } catch (e) { return null; } })();
const coder = AbiCoder.defaultAbiCoder();
const sel = (s) => id(s).slice(0, 10);
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });

function al(url) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: "GET",
      headers: { accept: "application/json", "user-agent": "arc-depth/1.0" } }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        if (s.statusCode !== 200) return rej(new Error("HTTP " + s.statusCode + ": " + b.slice(0, 200)));
        try { res(JSON.parse(b)); } catch (e) { rej(new Error("JSON degil: " + b.slice(0, 200))); }
      });
    });
    r.on("error", rej);
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.end();
  });
}
function rpc(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(process.env.ARC_RPC || "https://rpc.mainnet.arc.io");
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

(async function main() {
  console.log("FATHOM — DEXSCREENER GORUNURLUGU");
  console.log("");
  console.log("  token   " + A.token);
  console.log("  havuz   " + A.havuzId);
  console.log("");

  /* What the chain says, so the two can be compared. */
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [A.havuzId, 6]));
  const raw = BigInt(await rpc("eth_call", [{ to: A.poolManager,
    data: sel("extsload(bytes32)") + slot.slice(2) }, "latest"]));
  const sqrtP = Number(raw & ((1n << 160n) - 1n)) / 2 ** 96;
  const zincirFiyat = (1 / (sqrtP * sqrtP)) * 1e12;
  console.log("  ZINCIRDE");
  console.log("    fiyat   $" + zincirFiyat.toExponential(4) + "   FDV $" + nf(zincirFiyat * 1e9));
  console.log("");

  const sorgular = [
    ["FTHM (yeni)", A.token],
    D ? ["DEPTH (eski, kiyas icin)", D.token] : null
  ].filter(Boolean);

  for (const [etiket, adres] of sorgular) {
    console.log("  " + etiket);
    let j;
    try { j = await al("https://api.dexscreener.com/latest/dex/tokens/" + adres); }
    catch (e) { console.log("    sorgu basarisiz: " + e.message); console.log(""); continue; }

    const p = (j && j.pairs) || [];
    if (!p.length) {
      console.log("    HENUZ INDEKSLENMEMIS — bu 'bozuk' demek degil, 'daha yok' demek.");
      console.log("    DexScreener yeni havuzlari islem gordukce aliyor; tek alim yapildi.");
      console.log("");
      continue;
    }
    for (const x of p.slice(0, 5)) {
      console.log("    " + (x.dexId || "?") + " " + (x.labels || []).join(",") +
        "   " + (x.baseToken && x.baseToken.symbol) + "/" + (x.quoteToken && x.quoteToken.symbol));
      console.log("      fiyat      $" + (x.priceUsd || "?"));
      console.log("      likidite   $" + nf((x.liquidity && x.liquidity.usd) || 0, 2));
      console.log("      24s hacim  $" + nf((x.volume && x.volume.h24) || 0, 2));
      console.log("      FDV        $" + nf(x.fdv || 0));
      console.log("      url        " + (x.url || "?"));
      if (x.priceUsd) {
        const fark = (Number(x.priceUsd) / zincirFiyat - 1) * 100;
        console.log("      zincirle farki  %" + nf(fark, 2) +
          (Math.abs(fark) < 2 ? "   tutuyor" : "   SAPMA VAR"));
      }
    }
    console.log("");
  }

  console.log("  NOT");
  console.log("    Indeksleme bizim elimizde degil ve aninda olmuyor. Havuz zincirde,");
  console.log("    islem gordu, ve derinlik gercek — gorunurluk gecikirse sorun");
  console.log("    havuzda degil indekste olur. Birkac saat sonra tekrar calistir.");
  console.log("    Logo/sosyal alanlari DexScreener'da UCRETLI; kullanilmadi.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
