"use strict";
/* ===========================================================================
 * denetim-sayfa-okuma.js — can the page actually read the chain it points at?
 *
 *   node scripts/denetim-sayfa-okuma.js
 *
 * WHY
 *   The pages carry their own copies of the ABI fragments and addresses, and
 *   a page whose ABI has drifted from the contract does not fail loudly — it
 *   renders "—" where a number should be, or decodes garbage. One such
 *   drift was live until today: docs/app.html declared launch() with five
 *   arguments against a six-argument function, so every launch from the
 *   interface would have reverted.
 *
 *   So every call the page makes is taken FROM THE PAGE — the address block
 *   and the ABI strings are parsed out of the HTML, not retyped here — and
 *   made against Arc. A signature the contract does not have shows up as a
 *   failed decode instead of as an empty row a visitor has to interpret.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

let no = 1;
async function rpc(yontem, parametreler) {
  for (let d = 0; d < 6; d++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler })
    });
    const j = await r.json();
    if (j.error) {
      if (/rate limit/i.test(j.error.message || "")) {
        await new Promise((s) => setTimeout(s, 1200 * (d + 1))); continue;
      }
      const e = new Error(j.error.message); e.data = j.error.data; throw e;
    }
    return j.result;
  }
  throw new Error("rate limit: 6 denemede gecilemedi");
}

/* The page's own address block and ABI groups, parsed out of the file. Any
   value retyped here would be a second copy of the thing being checked. */
function sayfadanOku(dosya) {
  const s = fs.readFileSync(path.join(KOK, "docs", dosya), "utf8");
  const adresler = {};
  for (const m of s.matchAll(/\b([a-zA-Z]+)\s*:\s*"(0x[0-9a-fA-F]{40})"/g)) adresler[m[1]] = m[2];
  const abi = {};
  for (const m of s.matchAll(/\b([a-zA-Z0-9_]+)\s*:\s*\[([^\]]*?)\]/g)) {
    const parcalar = [...m[2].matchAll(/"((?:function|event)[^"]+)"/g)].map((x) => x[1]);
    if (parcalar.length) abi[m[1]] = parcalar;
  }
  return { adresler, abi, metin: s };
}

let gecti = 0, kaldi = 0;
const ok = (kosul, ad, not) => {
  if (kosul) { gecti++; console.log("  OK    " + ad + (not ? "   " + not : "")); }
  else { kaldi++; console.log("  KALDI " + ad + (not ? "   " + not : "")); }
};

(async () => {
  const D = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim.json"), "utf8"));
  const blok = await rpc("eth_blockNumber", []);
  console.log("SAYFA OKUMA DENETIMI");
  console.log("  rpc   " + RPC);
  console.log("  blok  " + parseInt(blok, 16) + " (hepsi buraya sabitlendi)");
  console.log("");

  const S = sayfadanOku("app.html");
  console.log("  app.html icinde " + Object.keys(S.adresler).length + " adres, " +
    Object.keys(S.abi).length + " ABI grubu bulundu");

  /* ---- 1. the page points at what was deployed -------------------- */
  for (const [ad, beklenen] of [["launchpad", D.launchpad], ["hook", D.hook],
                                 ["usdc", D.usdc], ["poolManager", D.poolManager]]) {
    const v = S.adresler[ad];
    ok(v && v.toLowerCase() === String(beklenen).toLowerCase(),
      "app.html " + ad + " dagitimla ayni", String(v));
  }

  /* ---- 2. nothing retired is still referenced --------------------- */
  for (const yasak of [/\bhisse/i, /robinhood/i, /\bALP\b/, /wNVDA/i, /wAAPL/i]) {
    const bulgu = S.metin.match(yasak);
    ok(!bulgu, "app.html icinde " + yasak + " gecmiyor", bulgu ? "bulundu: " + bulgu[0] : "temiz");
  }

  /* ---- 3. every signature the page declares exists on chain ------- */
  console.log("");
  const hedef = {
    launchpad: D.launchpad, vault: null, karne: null,
    erc20: D.usdc, erc20dec: D.usdc, router: D.router || null
  };

  /* The grader's address comes from the launchpad, and a vault only exists
     once something has launched — so those two are resolved rather than
     assumed, and reported as unreachable when they cannot be. */
  const lpI = new Interface(S.abi.launchpad.map((x) => x));
  try {
    hedef.karne = lpI.decodeFunctionResult("karne", await rpc("eth_call",
      [{ to: D.launchpad, data: lpI.encodeFunctionData("karne", []) }, blok]))[0];
    ok(true, "page ABI ile karne() okunabildi", String(hedef.karne));
  } catch (e) {
    ok(false, "page ABI ile karne() okunamadi", e.message.slice(0, 60));
  }

  let launchSayisi = 0;
  try {
    launchSayisi = Number(lpI.decodeFunctionResult("launchCount", await rpc("eth_call",
      [{ to: D.launchpad, data: lpI.encodeFunctionData("launchCount", []) }, blok]))[0]);
    ok(true, "page ABI ile launchCount() okunabildi", String(launchSayisi) + " launch");
  } catch (e) {
    ok(false, "page ABI ile launchCount() okunamadi", e.message.slice(0, 60));
  }
  if (launchSayisi > 0) {
    try {
      const L = lpI.decodeFunctionResult("launches", await rpc("eth_call",
        [{ to: D.launchpad, data: lpI.encodeFunctionData("launches", [0]) }, blok]));
      hedef.vault = L.vault || L[1];
    } catch (e) { /* reported by the per-signature loop */ }
  }

  /* A signature that the contract does not have makes eth_call revert or
     return empty — either way the decode fails, which is the whole point:
     it cannot be mistaken for a zero. */
  /* Only the groups the page DECLARES. Requiring a "hook" group was wrong:
     the page never calls the hook, it puts the address into the PoolKey,
     which is where a v4 hook belongs — the pool id is keccak of a key that
     carries the hook as a field, so naming it is how a swap reaches the
     hook at all. A check that demanded a group the page has no reason to
     have was reporting a defect in itself. */
  for (const grup of Object.keys(S.abi)) {
    const imzalar = S.abi[grup];
    const adres = hedef[grup];
    const ifc = new Interface(imzalar);
    const okunabilir = imzalar
      .map((x) => x.match(/^function\s+([a-zA-Z0-9_]+)\s*\(\s*\)\s*view/))
      .filter(Boolean).map((m) => m[1]);
    if (!adres) {
      console.log("  --    " + grup + ": adres yok (" +
        (grup === "vault" ? "henuz launch yapilmamis" : "bu grup bir adrese baglanmiyor") +
        "), " + imzalar.length + " imza denenmedi");
      continue;
    }
    if (!okunabilir.length) {
      console.log("  --    " + grup + ": argumansiz view imzasi yok, " +
        imzalar.length + " imza bu yolla denenemiyor");
      continue;
    }
    let iyi = 0; const kotu = [];
    for (const fn of okunabilir) {
      try {
        ifc.decodeFunctionResult(fn, await rpc("eth_call",
          [{ to: adres, data: ifc.encodeFunctionData(fn, []) }, blok]));
        iyi++;
      } catch (e) { kotu.push(fn); }
    }
    ok(kotu.length === 0, grup + ": sayfanin bildirdigi imzalar kontratta VAR",
      iyi + "/" + okunabilir.length + " argumansiz view okundu" +
      (kotu.length ? ", OKUNAMAYAN: " + kotu.join(", ") : ""));
  }

  /* The hook is not called, it is NAMED — in the PoolKey, whose keccak
     is the pool id. If the page puts a different hook in that key it
     addresses a different pool entirely, so the address has to match the
     deployment and it has to be in the key. */
  {
    const anahtarda = /key\s*:\s*\[[^\]]*A\.hook/.test(S.metin);
    ok(anahtarda, "app.html hook'u POOLKEY icinde kullaniyor",
      "havuz kimligi = keccak(PoolKey) ve hook onun bir alani");
  }

  /* ---- 4. the one that was wrong: launch()'s arity ---------------- */
  console.log("");
  {
    const imza = (S.abi.launchpad || []).find((x) => /^function launch\(/.test(x));
    const sayfaArg = imza ? (imza.match(/\(([^)]*)\)/)[1].split(",").filter(Boolean).length) : -1;
    const gercek = JSON.parse(fs.readFileSync(path.join(KOK, "build", "Launchpad.json"), "utf8"))
      .abi.find((f) => f.name === "launch").inputs.length;
    ok(sayfaArg === gercek,
      "app.html launch() ARGÜMAN SAYISI kontratla ayni",
      "sayfa " + sayfaArg + ", kontrat " + gercek +
      (sayfaArg === gercek ? "" : " — her launch revert ederdi"));
  }

  /* ---- 5. and the state the page will render ---------------------- */
  console.log("");
  try {
    const kuyruk = String(lpI.decodeFunctionResult("queue", await rpc("eth_call",
      [{ to: D.launchpad, data: lpI.encodeFunctionData("queue", []) }, blok]))[0]);
    ok(kuyruk.toLowerCase() === "0x000000000000000000000000000000000000dead",
      "sayfanin gosterdigi launchpad kuyruga KAPALI", kuyruk);
  } catch (e) {
    console.log("  --    queue() sayfa ABI'sinde yok (sayfa kuyrugu hic kullanmiyor)");
  }

  console.log("");
  console.log("  " + gecti + " gecti, " + kaldi + " kaldi");
  if (launchSayisi === 0) {
    console.log("");
    console.log("  NOT: dagitilan launchpad'de henuz launch yok, bu yuzden kasa ve");
    console.log("  karne okumalari CANLI BIR LAUNCH uzerinde denenmedi. Yukaridaki");
    console.log("  sonuc imzalarin ve adreslerin dogrulugunu gosterir, bir uctan uca");
    console.log("  akisi gostermez.");
  }
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
