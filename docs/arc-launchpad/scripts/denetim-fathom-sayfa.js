"use strict";
/* ===========================================================================
 * denetim-fathom-sayfa.js — does the page's code parse, and does every
 *                           call it makes exist on chain?
 *
 *   node scripts/denetim-fathom-sayfa.js
 *
 * A page can be perfectly formed HTML and still call a function that is
 * not there. Browsers report that as a blank panel at the moment somebody
 * is trying to buy, which is the worst place to find out. So the module is
 * extracted and parsed, and every function in every ABI fragment is looked
 * up by selector inside the deployed bytecode of the contract the page
 * points it at.
 *
 * Selector presence is a necessary condition, not a sufficient one: a
 * selector can appear in bytecode by coincidence and this does not check
 * return types. What it does catch is the whole class of "renamed the
 * function, forgot the page".
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, id } = require("ethers");

const KOK = path.join(__dirname, "..");
const SAYFA = path.join(KOK, "docs", "fathom.html");
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const html = fs.readFileSync(SAYFA, "utf8");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

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
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}

(async function main() {
  let hata = 0;
  const de = (ok, ad, not) => {
    if (!ok) hata++;
    console.log("  " + (ok ? "TAMAM" : "HATA ") + "  " + ad + (not ? "   " + not : ""));
  };

  console.log("FATHOM SAYFA DENETIMI");
  console.log("");

  /* ---- 1. does the module parse? ---------------------------------- */
  const bas = html.indexOf('<script type="module">');
  const son = html.lastIndexOf("</scr" + "ipt>");
  const kod = html.slice(bas + '<script type="module">'.length, son);
  const gecici = path.join(require("os").tmpdir(), "fathom-modul-denetim.mjs");
  /* The import spans two lines (the specifier list, then "from ..."), so a
     single-line strip leaves a dangling "from" and reports the PAGE as
     broken when the stripper was. Cut the whole statement. */
  fs.writeFileSync(gecici, kod.replace(/^import[sS]*?;s*$/m, "// import cikarildi"));
  try {
    /* Both paths quoted: node lives under "C:\\Program Files" here and an
       unquoted spawn fails in a way that reads like a syntax error in the
       page. */
    require("child_process").execSync(
      '"' + process.execPath + '" --check "' + gecici + '"', { stdio: "pipe" });
    de(true, "gomulu modul ayrisiyor", kod.length.toLocaleString("tr-TR") + " bayt");
  } catch (e) {
    de(false, "gomulu modul AYRISMIYOR", String(e.stderr || e).slice(0, 300));
  }
  try { fs.unlinkSync(gecici); } catch (e) { /* ignore */ }

  /* ---- 2. no leftovers from the curve page ------------------------ */
  de(!/egriR\(|alimKotasi|satisKotasi|mezunEt|ilerlemeYazi|neredeAlOku/.test(html),
     "egri kalintisi yok");
  de(!html.includes("DEPTH</h1>") && html.includes("FTHM</h1>"), "baslik FTHM");
  de(html.includes(A.token), "yeni token adresi var");
  de(html.includes("0xF67Eea3A140305dBC243e611CFa421c76F3C608B"),
     "eski token sadece uyari olarak geciyor", "iptal uyarisi icin");

  /* ---- 3. every ABI call exists in the deployed bytecode ---------- */
  console.log("");
  console.log("  SAYFANIN CAGIRDIGI HER FONKSIYON, DAGITILMIS KODDA VAR MI");
  const parcalar = [
    ["token", A.token, ["balanceOf(address)", "allowance(address,address)",
                        "approve(address,uint256)", "totalSupply()", "decimals()"]],
    ["usdc", A.usdc, ["balanceOf(address)", "approve(address,uint256)", "decimals()"]],
    ["stake", A.stake, ["stake(uint256)", "unstake(uint256)", "claim()",
                        "stakedOf(address)", "totalStaked()", "pending(address)",
                        "pendingToken(address)", "oyGucu(address)", "MIN_OY_GUCU()",
                        "emisyonKalan()", "emisyonDagitilan()"]],
    ["poolManager", A.poolManager, ["extsload(bytes32)"]],
    ["router", "0x7550058C3F4D8839eBc8AcCB96959Fe69C109581",
      ["swap((address,address,uint24,int24,address),bool,uint256,uint256)"]]
  ];
  /* A selector does not have to appear in a proxy's bytecode, and Arc's
     USDC is a system contract that answers calls its code does not spell
     out. So anything callable is CALLED; only the rest falls back to the
     scan, and the fallback is reported as what it is. */
  const cagrilabilir = {
    "balanceOf(address)": "0x" + "0".repeat(24) + A.kurucu.slice(2),
    "totalSupply()": "", "decimals()": "",
    "totalStaked()": "", "MIN_OY_GUCU()": "", "emisyonKalan()": "",
    "emisyonDagitilan()": "",
    "stakedOf(address)": "0x" + "0".repeat(24) + A.kurucu.slice(2),
    "pending(address)": "0x" + "0".repeat(24) + A.kurucu.slice(2),
    "pendingToken(address)": "0x" + "0".repeat(24) + A.kurucu.slice(2),
    "oyGucu(address)": "0x" + "0".repeat(24) + A.kurucu.slice(2),
    "allowance(address,address)": "0x" + "0".repeat(24) + A.kurucu.slice(2) +
      "0".repeat(24) + A.kurucu.slice(2),
    /* approve changes state, but eth_call runs it without committing, so
       it can be tested for real instead of scanned for. That matters here:
       Arc USDC is a system contract and its deployed code does not contain
       the selectors it answers, so the scan called a working approve
       missing. */
    "approve(address,uint256)": "0x" + "0".repeat(24) +
      "7550058C3F4D8839eBc8AcCB96959Fe69C109581" + "0".repeat(64)
  };
  for (const [ad, adres, imzalar] of parcalar) {
    const kodu = (await rpc("eth_getCode", [adres, "latest"])).toLowerCase();
    if (kodu.length <= 2) { de(false, ad + " adresinde kod yok", adres); continue; }
    const eksik = [], cagrildi = [], tarandi = [];
    for (const sg of imzalar) {
      if (sg in cagrilabilir) {
        const arg = cagrilabilir[sg];
        try {
          const r = await rpc("eth_call", [{ from: A.kurucu, to: adres,
            data: id(sg).slice(0, 10) + (arg ? arg.replace("0x", "") : "") }, "latest"]);
          if (r && r !== "0x") cagrildi.push(sg); else eksik.push(sg + " (bos dondu)");
        } catch (e) { eksik.push(sg + " (cagri hatasi)"); }
      } else if (kodu.includes(id(sg).slice(2, 10))) tarandi.push(sg);
      else eksik.push(sg + " (bytecode'da yok)");
    }
    de(eksik.length === 0, ad.padEnd(12) + imzalar.length + " fonksiyon",
       eksik.length ? "EKSIK: " + eksik.join(", ")
         : cagrildi.length + " cagrildi, " + tarandi.length + " tarandi");
  }

  /* ---- 4. the pool key the page builds must be the live pool ------ */
  const { AbiCoder, keccak256 } = require("ethers");
  const tokenSifirinci = A.token.toLowerCase() < A.usdc.toLowerCase();
  const key = [tokenSifirinci ? A.token : A.usdc, tokenSifirinci ? A.usdc : A.token,
               A.fee, A.spacing, A.hook];
  const hesaplanan = keccak256(AbiCoder.defaultAbiCoder().encode(
    ["tuple(address,address,uint24,int24,address)"], [key]));
  console.log("");
  de(hesaplanan.toLowerCase() === A.havuzId.toLowerCase(),
     "sayfanin kurdugu havuz anahtari canli havuza esit",
     hesaplanan.slice(0, 18) + "… vs " + A.havuzId.slice(0, 18) + "…");
  console.log("    (alis yonu zeroForOne=" + (!tokenSifirinci) +
    " — FTHM currency" + (tokenSifirinci ? "0" : "1") + ")");

  console.log("");
  console.log(hata === 0 ? "  Hepsi gecti." : "  " + hata + " KONTROL GECMEDI.");
  if (hata) process.exit(1);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
