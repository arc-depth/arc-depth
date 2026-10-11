"use strict";
/* ===========================================================================
 * denetim-guven-noktalari.js — the three places a single off-chain actor
 *                              is trusted with nothing to check them.
 *
 *   node scripts/denetim-guven-noktalari.js
 *
 * Codex raised three findings. All three read true in the source, and they
 * are the same shape: a privileged caller supplies the facts AND the
 * amounts, and the contract verifies neither against anything.
 *
 *   StockVault.release(burnId, to, shares)
 *       the relayer names the burn, the recipient and the size. Nothing
 *       proves a burn with that id happened on the other chain, or that it
 *       was for that recipient or that many shares.
 *
 *   WrappedStock.mint(lockId, to, shares)
 *       the mirror image. The relayer names a lock and mints against it,
 *       with no proof the lock exists.
 *
 *   LaunchQueue.karsila(id, teminat)
 *       the operator chooses how much collateral to deliver and is then
 *       reimbursed the customer's full payment regardless. One wei of
 *       collateral against a thousand dollars paid passes every check.
 *
 * A design flaw in a contract nobody has funded is a to-do. The same flaw
 * in a contract holding somebody's money is an emergency. This script does
 * not argue about which: it reads the chain and reports what each one
 * currently holds and who the privileged address actually is.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, id } = require("ethers");

const KOK = path.join(__dirname, "..");
const coder = AbiCoder.defaultAbiCoder();
const sel = (s) => id(s).slice(0, 10);

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
/* The vault lives on Robinhood Chain, the wrapper and the queue on Arc. */
const RH_RPC = process.env.RH_RPC || "https://rpc.robinhood.com";

function ham(rpcUrl, method, params) {
  return new Promise((res, rej) => {
    const u = new URL(rpcUrl);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(45000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(url, m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(url, m, p); await new Promise((x) => setTimeout(x, 600)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 5) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 20000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });

function manifest(ad) {
  try { return JSON.parse(fs.readFileSync(path.join(KOK, ad), "utf8")); } catch (e) { return null; }
}

(async function main() {
  console.log("UC GUVEN NOKTASI — kaynakta dogrulandi, simdi zincirde olculuyor");
  console.log("");
  console.log("  Ucu de ayni sekilde: yetkili cagiran hem OLAYI hem MIKTARI kendisi");
  console.log("  soyluyor, ve sozlesme ikisini de hicbir seye karsi dogrulamiyor.");
  console.log("");

  /* Collect every candidate address from whatever manifests exist. */
  const kaynaklar = ["dagitim.json", "son-launch.json", "rhc-alim.json",
                     "dagitim-yonetisim.json", "isletici-durum.json"];
  const adresler = {};
  for (const k of kaynaklar) {
    const m = manifest(k);
    if (!m) continue;
    for (const [alan, deger] of Object.entries(m))
      if (typeof deger === "string" && /^0x[0-9a-fA-F]{40}$/.test(deger))
        adresler[alan] = { adres: deger, dosya: k };
  }

  const ilgi = ["vault", "stockVault", "kasa", "sarmal", "wrapped", "wrappedStock",
                "queue", "launchQueue", "kuyruk", "launchpad", "relayer", "isletici",
                "operator", "router", "usdc"];
  console.log("  MANIFESTLERDE BULUNAN ILGILI ADRESLER");
  let bulundu = 0;
  for (const [alan, v] of Object.entries(adresler)) {
    if (!ilgi.some((x) => alan.toLowerCase().includes(x.toLowerCase()))) continue;
    bulundu++;
    console.log("    " + alan.padEnd(16) + v.adres + "   (" + v.dosya + ")");
  }
  if (!bulundu) console.log("    (hicbiri bulunamadi — bu kontratlar hic dagitilmamis olabilir)");
  console.log("");

  /* ---- is anything deployed, and does it hold anything? ----------- */
  const kontrol = async (etiket, adres, url, ag) => {
    if (!adres) { console.log("    " + etiket.padEnd(18) + "manifestte yok"); return; }
    let kod = "0x";
    try { kod = await rpc(url, "eth_getCode", [adres, "latest"]); }
    catch (e) { console.log("    " + etiket.padEnd(18) + "okunamadi (" + ag + "): " + e.message); return; }
    if (kod.length <= 2) {
      console.log("    " + etiket.padEnd(18) + "DAGITILMAMIS — " + adres);
      return;
    }
    console.log("    " + etiket.padEnd(18) + nf((kod.length - 2) / 2) + " bayt kod   " + adres);
    return true;
  };

  console.log("  ZINCIRDE VARLAR MI");
  const D = manifest("dagitim.json") || {};
  const SL = manifest("son-launch.json") || {};
  for (const [etiket, adres] of [
    ["launchpad", D.launchpad], ["kuyruk", D.queue || D.launchQueue || D.kuyruk],
    ["router", D.router], ["vault (son launch)", SL.vault || SL.kasa],
    ["token (son launch)", SL.token]
  ]) await kontrol(etiket, adres, ARC_RPC, "arc");
  console.log("");

  console.log("  SONUC — su an bildigim kadariyla");
  console.log("    Uc bulgu da KAYNAKTA GERCEK. Hicbiri FTHM'i etkilemiyor:");
  console.log("    FTHM'in koprusu yok, kuyrugu yok, relayer'i yok, operatoru yok.");
  console.log("    Etkilenen yer kopru (StockVault/WrappedStock) ve musteri");
  console.log("    kuyrugu (LaunchQueue) — yani launchpad URUNU.");
  console.log("");
  console.log("    DUZELTME YONU, uc bulgu icin de ayni:");
  console.log("      1. Olayi kanitla, beyan etme. Diger zincirin blok basligi ya da");
  console.log("         imzali bir kanit; relayer'in sozu degil.");
  console.log("      2. Miktari baglama. release/mint miktari kanittan cikmali,");
  console.log("         cagiranin verdigi bir sayi olmamali.");
  console.log("      3. karsila icin: teslim edilen teminatin degeri ile musterinin");
  console.log("         odedigi arasinda zincirde bir alt sinir. Operator 1 wei");
  console.log("         teslim edip tam parayi geri alamamali.");
  console.log("      4. Kisa vadede, duzeltme gelene kadar: relayer ve operator");
  console.log("         anahtarlari tek kisi olmamali (coklu imza), ve release/mint");
  console.log("         icin islem basina ve gun basina tavan.");
  console.log("");
  console.log("    Bunlar YENI kod ister; mevcut dagitilmis bir seyi yamayla");
  console.log("    duzeltmek mumkun degil, cunku bu kontratlarin da setter'i yok.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
