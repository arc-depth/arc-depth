"use strict";
/* ===========================================================================
 * denetim-canli-kopru.js — is any of the OLD bridge code live and holding
 *                          something?
 *
 *   node scripts/denetim-canli-kopru.js
 *
 * The fix assumed the bridge had never been deployed: no manifest named a
 * StockVault or a WrappedStock, so the vulnerable mint and release were
 * treated as source-only and corrected in place. Then son-launch.json
 * turned out to carry a collateral token address and isletici-durum.json
 * to carry transactions called kopruTx, and an assumption about what is
 * live is exactly the kind that should not be left standing.
 *
 * So this asks the chain directly: does the old vulnerable selector exist
 * at that address, who is its relayer, how much has it minted, and is
 * anything backed by it. A yes anywhere turns a tidy source fix into a
 * live exposure that has to be handled differently.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const KOK = path.join(__dirname, "..");
const coder = AbiCoder.defaultAbiCoder();
const sel = (s) => id(s).slice(0, 10);
const oku = (p) => { try { return JSON.parse(fs.readFileSync(path.join(KOK, p), "utf8")); } catch (e) { return null; } };
const D = oku("dagitim.json") || {};
const S = oku("son-launch.json") || {};
const I = oku("isletici-durum.json") || {};

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 25000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const dene = async (to, imza) => {
  try {
    const r = await rpc("eth_call", [{ to, data: sel(imza) }, "latest"]);
    return r && r !== "0x" ? r : null;
  } catch (e) { return null; }
};

/* The old, vulnerable shapes. Their presence in deployed code is the
   question; the new ones take a bytes[] and hash differently. */
const ESKI_MINT = "mint(bytes32,address,uint256)";
const ESKI_RELEASE = "release(bytes32,address,uint256)";
const YENI_MINT = "mint(bytes32,address,uint256,bytes[])";
const YENI_RELEASE = "release(bytes32,address,uint256,bytes[])";

(async function main() {
  console.log("CANLI KOPRU DENETIMI — eski acikli kod zincirde var mi");
  console.log("");

  const adaylar = [];
  if (S.teminat) adaylar.push(["son launch teminati", S.teminat]);
  if (S.vault) adaylar.push(["son launch kasasi", S.vault]);
  for (const [k, v] of Object.entries(I))
    if (v && typeof v === "object")
      for (const [kk, vv] of Object.entries(v))
        if (typeof vv === "string" && /^0x[0-9a-fA-F]{40}$/.test(vv))
          adaylar.push(["isletici " + k + "." + kk, vv]);

  if (!adaylar.length) console.log("  manifestlerde aday adres yok");

  let acikli = 0;
  for (const [etiket, adres] of adaylar) {
    const kod = await rpc("eth_getCode", [adres, "latest"]).catch(() => "0x");
    if (kod.length <= 2) { console.log("  " + etiket.padEnd(26) + "kod yok   " + adres); continue; }
    const k = kod.toLowerCase();
    const eskiM = k.includes(id(ESKI_MINT).slice(2, 10));
    const eskiR = k.includes(id(ESKI_RELEASE).slice(2, 10));
    const yeniM = k.includes(id(YENI_MINT).slice(2, 10));
    const yeniR = k.includes(id(YENI_RELEASE).slice(2, 10));

    const sembol = await dene(adres, "symbol()");
    let ad = "";
    try { ad = sembol ? coder.decode(["string"], sembol)[0] : ""; } catch (e) { ad = ""; }
    const arz = await dene(adres, "totalSupply()");
    const basilan = await dene(adres, "mintedTotal()");
    const relayer = await dene(adres, "relayer()");

    const durum = (eskiM || eskiR) ? "ESKI ACIKLI KOD" : (yeniM || yeniR) ? "yeni kanitli kod" : "kopru degil";
    if (eskiM || eskiR) acikli++;
    console.log("  " + etiket.padEnd(26) + durum);
    console.log("    " + adres + (ad ? "   " + ad : "") +
      "   " + nf((kod.length - 2) / 2) + " bayt");
    if (arz) console.log("    arz          " + nf(Number(BigInt(arz)) / 1e18, 6));
    if (basilan) console.log("    mintedTotal  " + nf(Number(BigInt(basilan)) / 1e18, 6) +
      "   <- kopruyle basilmis");
    if (relayer) console.log("    relayer      0x" + relayer.slice(26));
  }

  console.log("");
  if (acikli) {
    console.log("  " + acikli + " ADRESTE ESKI ACIKLI KOD CANLI.");
    console.log("  Kaynak duzeltmesi bunu degistirmez: dagitilmis kodun setter'i yok.");
    console.log("  Yapilabilecek olan, yenisini dagitip eskisini kullanimdan kaldirmak");
    console.log("  ve o arada relayer anahtarini korumak.");
  } else {
    console.log("  Eski acikli kod hicbir canli adreste BULUNAMADI.");
    console.log("  Kopru hala yalnizca kaynakta; duzeltme dagitimdan ONCE yetisti.");
  }

  /* The bridge transactions the operator recorded: what did they touch? */
  const txler = [];
  for (const [k, v] of Object.entries(I))
    if (v && v.kopruTx) txler.push([k, v.kopruTx]);
  if (txler.length) {
    console.log("");
    console.log("  ISLETICININ KAYDETTIGI KOPRU ISLEMLERI");
    for (const [k, tx] of txler.slice(0, 6)) {
      const rc = await rpc("eth_getTransactionReceipt", [tx]).catch(() => null);
      if (!rc) { console.log("    " + k.padEnd(10) + "makbuz yok   " + tx.slice(0, 18) + "…"); continue; }
      const t = await rpc("eth_getTransactionByHash", [tx]).catch(() => null);
      console.log("    " + k.padEnd(10) + "blok " + parseInt(rc.blockNumber, 16) +
        "   durum " + (rc.status === "0x1" ? "basarili" : "BASARISIZ") +
        "   hedef " + (t && t.to ? t.to : "yaratim") +
        "   " + rc.logs.length + " log");
    }
    console.log("    (hedef adresler yukaridaki listede yoksa bunlar kopru degil,");
    console.log("     baska bir zincirdeki ya da baska bir sozlesmeye giden islemler)");
  }
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
