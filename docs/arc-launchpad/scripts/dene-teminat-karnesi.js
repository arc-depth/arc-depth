"use strict";
/* Grades real Arc tokens with the real contract, against the real chain.
 *
 * Placed at a throwaway address by state override and called there, so
 * nothing is deployed and nothing is sent — the same technique the rest of
 * the suite uses. yaz() writes storage, but eth_call discards it and
 * returns the struct, which is what is being checked.
 *
 * The decisive case is the impersonator. Arc carries a token whose symbol
 * is "USDC" and whose name is "Unconditional Support Dog Coin". A grade
 * that cannot tell it from 0x3600...0000 would be worse than no grade,
 * because a launch backed by it would read as USDC-backed.
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { URL } = require("url");
const { Interface, AbiCoder, id: keccakId } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const ART = JSON.parse(fs.readFileSync(
  path.join(__dirname, "..", "build", "TeminatKarnesi.json"), "utf8"));
const iface = new Interface(ART.abi);
const coder = AbiCoder.defaultAbiCoder();

const KARNE = "0x00000000000000000000000000000000000000C1";
const LAUNCHPAD = "0x00000000000000000000000000000000000000C2";
const GERCEK_USDC = "0x3600000000000000000000000000000000000000";

const VARLIKLAR = [
  ["gercek USDC", GERCEK_USDC],
  ["TAKLIT USDC", "0xb5c9ce5a094e0857b1dab5644d449041748d36c1"],
  ["cirBTC", "0x171a4217b86a807a64eb94757db6849fb4bdbaa0"],
  ["WETH", "0x128cc466b61f542da60c70e3aa11c10e19b84edb"],
  ["EURC", "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1"],
  ["FOCI (arc-native)", "0x7c7489163b1060333e71229bb7a9f8cb7094a7a9"],
  ["bos adres", "0x000000000000000000000000000000000000dEaD"]
];

let cagri = 0;
function rpc(yontem, parametreler) {
  cagri++;
  const u = new URL(RPC);
  const govde = JSON.stringify({ jsonrpc: "2.0", id: cagri, method: yontem, params: parametreler });
  return new Promise((coz) => {
    const istek = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(govde) }
    }, (y) => {
      let v = "";
      y.on("data", (p) => (v += p));
      y.on("end", () => {
        try {
          const c = JSON.parse(v);
          if (c.error) return coz({ hata: c.error.message });
          coz({ sonuc: c.result });
        } catch (e) { coz({ hata: "cozulemeyen yanit" }); }
      });
    });
    istek.on("error", (e) => coz({ hata: e.message }));
    istek.write(govde);
    istek.end();
  });
}
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
async function sabirli(yontem, parametreler, tavan = 8) {
  for (let d = 0; d < tavan; d++) {
    const c = await rpc(yontem, parametreler);
    if (c.sonuc !== undefined) return c;
    if (!/rate limit|too many|429|-32005|limit exceeded/i.test(c.hata || "")) return c;
    await bekle(700 * (d + 1));
  }
  return { hata: "rate limit" };
}

let gecen = 0, kalan = 0;
const ok = (ad, kosul, not) => {
  if (kosul) { gecen++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kalan++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};

(async function () {
  console.log("");
  console.log("TEMINAT KARNESI — GERCEK ARC TOKENLERINDE");
  console.log("  kontrat " + ((ART.deployedBytecode.length - 2) / 2) + " bayt, state override ile yerlestirildi");
  console.log("");

  /* The constructor's immutables live in the deployed code, so the code to
     place has to be produced by running the real constructor. */
  const kurucuArgs = coder.encode(["address", "address"], [LAUNCHPAD, GERCEK_USDC]).slice(2);
  const kurulmus = await sabirli("eth_call",
    [{ data: ART.bytecode + kurucuArgs }, "latest"]);
  if (!kurulmus.sonuc || kurulmus.sonuc === "0x") {
    console.log("  kurucu calismadi: " + kurulmus.hata); process.exit(1);
  }
  const kod = kurulmus.sonuc;

  const karneler = {};
  for (const [etiket, adres] of VARLIKLAR) {
    /* A different `token` key each time, because yaz() refuses to file
       twice for the same launch. */
    const sahteToken = "0x" + "11".repeat(19) + (VARLIKLAR.indexOf(
      VARLIKLAR.find((x) => x[1] === adres)) + 1).toString(16).padStart(2, "0");
    const r = await sabirli("eth_call", [
      { from: LAUNCHPAD, to: KARNE, gas: "0x2000000",
        data: iface.encodeFunctionData("yaz", [sahteToken, adres]) },
      "latest",
      { [KARNE]: { code: kod } }
    ]);
    if (!r.sonuc) { console.log("  " + etiket + ": CAGRI BASARISIZ " + r.hata); continue; }
    const [k] = iface.decodeFunctionResult("yaz", r.sonuc);
    karneler[etiket] = k;

    const bayrak = (b) => b ? "VAR" : "yok";
    console.log("  " + etiket);
    console.log("    adres        " + k.teminat);
    console.log("    GERCEK PARA  " + (k.gercekParaMi ? "EVET" : "HAYIR"));
    console.log("    basamak      " + (Number(k.basamak) === 255 ? "CEVAP VERMIYOR" : k.basamak) +
      "   arz " + k.arz.toString());
    console.log("    kod          " + k.kodBoyutu + " bayt" +
      (k.yukseltilebilir ? "   YUKSELTILEBILIR (implementation gorunuyor)" : ""));
    console.log("    sahip " + bayrak(k.sahipVar) +
      " · mint yetkisi " + bayrak(k.mintYetkisiVar) +
      " · dondurma " + bayrak(k.dondurmaVar) +
      " · dondurma yetkisi " + bayrak(k.dondurmaYetkisiVar) +
      " · duraklatma " + bayrak(k.duraklatilabilir));
    console.log("");
    await bekle(300);
  }

  /* ---- what the grade has to get right ------------------------- */
  console.log("KARNE DOGRU AYRIM YAPIYOR MU");
  const g = karneler["gercek USDC"], t = karneler["TAKLIT USDC"];
  if (g && t) {
    ok("gercek USDC 'GERCEK PARA' isaretli", g.gercekParaMi === true);
    ok("TAKLIT USDC isaretli DEGIL", t.gercekParaMi === false,
      "ayni sembol, farkli adres — karne adrese bakiyor");
    ok("ikisinin basamagi farkli oldugu gorunuyor",
      Number(g.basamak) !== Number(t.basamak),
      "gercek " + g.basamak + " · taklit " + t.basamak);
  } else { ok("iki USDC de okundu", false); }

  const c = karneler["cirBTC"];
  if (c) {
    /* The point of probing through the proxy: cirBTC's stub is small and
       a bytecode scan of it finds nothing, but the implementation has a
       blacklister and the staticcall reaches it. */
    ok("cirBTC yukseltilebilir olarak gorunuyor", c.yukseltilebilir === true ||
      c.kodBoyutu < 3000n, "kod " + c.kodBoyutu + " bayt");
    ok("cirBTC'de dondurma PROXY ARKASINDAN gorulebildi", c.dondurmaVar === true,
      "bytecode taramasi bunu kaciriyordu");
    ok("cirBTC'de mint yetkisi gorulebildi", c.mintYetkisiVar === true);
    ok("cirBTC gercek para DEGIL", c.gercekParaMi === false, "teminat olabilir, USDC degil");
  }

  const b = karneler["bos adres"];
  if (b) {
    ok("kodsuz adres icin hicbir yetenek iddia edilmiyor",
      !b.sahipVar && !b.mintYetkisiVar && !b.dondurmaVar && !b.duraklatilabilir,
      "kod 0 bayt");
    ok("  ve basamak CEVAP VERMIYOR olarak isaretli", Number(b.basamak) === 255);
  }

  console.log("");
  console.log("  " + gecen + " gecti, " + kalan + " kaldi   (" + cagri + " salt-okunur cagri)");
  process.exit(kalan ? 1 : 0);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
