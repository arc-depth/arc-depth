"use strict";
/* ===========================================================================
 * olc-cikis.js — where the founder's DEPTH sits, and what a holder who
 *                wants out can actually get.
 *
 *   node scripts/olc-cikis.js
 *
 * The second question is the one that matters and the one a price site
 * cannot answer. DexScreener will show a market cap; what a seller
 * receives depends on how much money is in the pool, which is a different
 * number entirely. This prints both, and what a sale of each size
 * actually returns, so the gap between them is a figure rather than a
 * feeling.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const coder = AbiCoder.defaultAbiCoder();
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const H = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), "utf8"));
const KURUCU = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const sel = (s) => id(s).slice(0, 10);
const Q96 = 2n ** 96n;

function hamIstek(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(30000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await hamIstek(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 2) => "$" + nf(x, d);

(async function main() {
  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const bal = async (t, w) => BigInt(await oku(t,
    sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2)));

  /* ---- 1. the founder's share, every piece of it ----------------- */
  console.log("1) KURUCU PAYI NEREDE");
  console.log("");
  const cuzdanTok = await bal(D.token, KURUCU);
  const cuzdanUsdc = await bal(D.usdc, KURUCU);
  const vestTok = await bal(D.token, D.vesting);
  const egri2Tok = await bal(D.token, H.egri2);

  console.log("  cuzdanda DEPTH      " + nf(Number(cuzdanTok) / 1e18).padStart(14) +
    "   serbest, her an satilabilir");
  console.log("  vesting'de DEPTH    " + nf(Number(vestTok) / 1e18).padStart(14) +
    "   12 ayda ayni cuzdana akar");
  console.log("  cuzdanda USDC       " + usd(Number(cuzdanUsdc) / 1e6, 6).padStart(14));
  console.log("  " + "-".repeat(52));
  console.log("  elinde toplam       " + nf((Number(cuzdanTok) + Number(vestTok)) / 1e18).padStart(14) +
    " DEPTH");
  console.log("");
  console.log("  havuza kalici giden " + nf(Number(BigInt(H.havuzToken)) / 1e18).padStart(14) +
    "   kilitli, kimse cekemez");
  console.log("  yakilan             " + nf(Number(BigInt(H.yakilan)) / 1e18).padStart(14) +
    "   arzdan kalici dustu");
  console.log("  (ikinci egride      " + nf(Number(egri2Tok) / 1e18).padStart(14) +
    "   mezun oldu, satilamaz)");

  /* Fees the founder has actually received, from the logs. */
  const TRANSFER = id("Transfer(address,address,uint256)");
  const pad = (a) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
  let ucretToplam = 0n;
  for (const kaynak of [D.egri, H.egri2, H.hook2]) {
    const ls = await rpc("eth_getLogs", [{ address: D.usdc,
      topics: [TRANSFER, pad(kaynak), pad(KURUCU)],
      fromBlock: "0x" + (24729000).toString(16), toBlock: "latest" }]);
    for (const l of ls) ucretToplam += BigInt(l.data);
  }
  console.log("");
  console.log("  simdiye kadar gelen ucret payi  " + usd(Number(ucretToplam) / 1e6, 6));
  console.log("    (egri alim/satimlarindan; satis bedelleri bunun disinda)");

  /* ---- 2. what a seller gets ------------------------------------- */
  const s0 = keccak256(coder.encode(["bytes32", "uint256"], [H.havuzId, 6]));
  const ham = BigInt(await oku(PM, "0x1e2eaeaf" + s0.slice(2)));
  const sq = ham & ((1n << 160n) - 1n);
  const p = (Number(sq) / Number(Q96)) ** 2;
  const depthSifirinci = D.token.toLowerCase() < D.usdc.toLowerCase();
  const fiyat = depthSifirinci ? p / 1e12 : (1 / p) * 1e12;
  const arz = BigInt(await oku(D.token, sel("totalSupply()")));

  /* Reserves: the opener's position is all the liquidity there is. */
  const U = Number(BigInt(H.esik)) / 1e6;
  const T = Number(BigInt(H.havuzToken)) / 1e18;
  /* The other exit: curve #1 buys tokens back, bounded by what it holds. */
  const egri1Toplanan = Number(BigInt(await oku(D.egri, sel("toplanan()")))) / 1e6;

  console.log("");
  console.log("2) ALAN BIR MUSTERI SATMAK ISTEDIGINDE");
  console.log("");
  console.log("  Iki cikisi var ve ikisi de SINIRLI:");
  console.log("    havuzdaki para       " + usd(U, 2) + "   (Uniswap)");
  console.log("    egri #1'in tuttugu   " + usd(egri1Toplanan, 2) + "   (egriye geri satis)");
  console.log("    " + "-".repeat(40));
  console.log("    TUM CIKIS LIKIDITESI " + usd(U + egri1Toplanan, 2));
  console.log("");
  console.log("  Havuz ne kadar oderse o kadar — icinde olmayan parayi odeyemez.");
  console.log("  Sabit carpim, simdiki rezervlerle:");
  console.log("");
  console.log("    satilan DEPTH   fiyata gore deger   GERCEKTE ALINAN   kayip");
  for (const n0 of [10_000, 57_726, 100_000, 404_082, 1_000_000, 10_000_000]) {
    const deger = n0 * fiyat;
    const cikan = (U * n0) / (T + n0);
    const net = cikan * 0.995;          // the hook takes 0.50% on the way out
    const kayip = (1 - net / deger) * 100;
    console.log("    " + nf(n0).padStart(13) + "   " + usd(deger, 2).padStart(17) +
      "   " + usd(net, 4).padStart(15) + "   %" + nf(kayip, 1).padStart(5));
  }

  console.log("");
  console.log("  OKUMA");
  console.log("    Kucuk satis calisir. Buyuk satis calismaz — havuzda " + usd(U, 2) +
    " var,");
  console.log("    ne satilirsa satilsin odenebilecek en fazla o.");
  console.log("");
  console.log("    DexScreener " + usd(fiyat * (Number(arz) / 1e18), 0) + " piyasa degeri gosterecek.");
  console.log("    Cikarilabilecek para " + usd(U + egri1Toplanan, 2) + ". Aradaki fark " +
    nf((fiyat * (Number(arz) / 1e18)) / (U + egri1Toplanan)) + " kat.");
  console.log("    Bu fark kapanmasi icin havuza para girmesi gerekiyor — her");
  console.log("    alim havuza kaliyor ve ucretin %0,20'si geri yatiyor, ama");
  console.log("    bugun itibariyla rakam bu.");
  console.log("");
  console.log("    KURUCU PAYI ICIN DE AYNISI GECERLI: elindeki " +
    nf(Number(cuzdanTok) / 1e18) + " DEPTH");
  console.log("    bugun " + usd(U, 2) + "'dan fazlaya satilamaz.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
