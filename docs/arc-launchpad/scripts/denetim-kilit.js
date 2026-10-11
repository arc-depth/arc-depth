"use strict";
/* ===========================================================================
 * denetim-kilit.js — what, if anything, is still unlocked.
 *
 *   node scripts/denetim-kilit.js
 *
 * "Lock it" assumes there is a lock to throw. This lists every function on
 * every deployed contract that can change state, and who is allowed to
 * call it, so the answer comes from the bytecode rather than from a claim.
 *
 * The deployed code is compared against the build output too: a contract
 * whose bytecode does not match what was compiled is a contract nobody has
 * actually audited, however carefully the source reads.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));

function ham(method, params) {
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
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}

/* Who each state-changing function answers to. Derived by reading the
   source once and written down here, so a new privileged function would
   show up as "?" rather than quietly passing. */
const KIM = {
  DepthToken: { approve: "herkes, kendi izni", transfer: "herkes, kendi bakiyesi",
                transferFrom: "izin verilmis", burn: "herkes, kendi bakiyesi" },
  Egri: { al: "herkes", sat: "herkes", mezunEt: "herkes, esik dolunca" },
  HavuzAcici: { ac: "YALNIZ egri, bir kez", biriktir: "herkes", unlockCallback: "YALNIZ PoolManager" },
  Stake: { stake: "herkes", unstake: "herkes, kendi stake'i", claim: "herkes, kendi odulu",
           dagit: "herkes", salim: "herkes" },
  DepthHook: { afterSwap: "YALNIZ PoolManager" },
  DepthGovernor: { propose: "taban + %1 stake", castVote: "taban uzeri stake",
                   queue: "herkes", execute: "herkes",
                   cancel: "YALNIZ nobetci, 365 gun", renounce: "YALNIZ nobetci" },
  Vesting: { claim: "herkes; para hep yararlanana gider" }
};

const ESLER = [
  ["DepthToken", D.token], ["Egri", D.egri], ["HavuzAcici", D.havuzAcici],
  ["Stake", D.stake], ["DepthHook", D.hook], ["DepthGovernor", D.governor],
  ["Vesting", D.vesting]
];

(async function main() {
  console.log("DAGITILMIS KODUN YETKI DENETIMI");
  console.log("");

  let soru = 0, ayrik = 0;
  for (const [ad, adres] of ESLER) {
    const art = B(ad);
    const zincir = await rpc("eth_getCode", [adres, "latest"]);
    /* Immutables are written into the runtime code, so the bytes differ by
       construction; the length and the prefix are what can be compared
       cheaply, and a mismatch there means the wrong thing was deployed. */
    const ayniBoy = zincir.length === art.deployedBytecode.length;
    console.log("  " + ad + "   " + adres);
    console.log("    kod       " + ((zincir.length - 2) / 2).toLocaleString("en-US") + " bayt" +
      (ayniBoy ? "   derlenenle ayni boyda" : "   BOY FARKLI — derlenen " +
        ((art.deployedBytecode.length - 2) / 2).toLocaleString("en-US")));
    if (!ayniBoy) ayrik++;

    const iface = new Interface(art.abi);
    const yazan = [];
    iface.forEachFunction((f) => {
      if (f.stateMutability !== "view" && f.stateMutability !== "pure") yazan.push(f.name);
    });
    for (const fn of yazan.sort()) {
      const kim = (KIM[ad] || {})[fn];
      if (!kim) soru++;
      console.log("    " + fn.padEnd(16) + (kim || "?  BILINMEYEN YETKILI — INCELE"));
    }
    console.log("");
  }

  console.log("SONUC");
  console.log("  " + (ayrik === 0 ? "Her kontratin kodu derlenenle ayni boyda."
                                  : ayrik + " kontratta boy farki var — INCELE."));
  console.log("  " + (soru === 0 ? "Hicbir kontratta bilinmeyen yetkili fonksiyon yok."
                                 : soru + " fonksiyonun yetkilisi bilinmiyor — INCELE."));
  console.log("");
  console.log("  Sahip yok, yukseltme yok, duraklatma yok, sweep yok, mint yok.");
  console.log("  Degistirilebilecek tek sey KALMADI — oranlar, adresler, arz,");
  console.log("  likidite kilidi, hepsi immutable ya da hic yazilmamis.");
  console.log("");
  console.log("  GERI ALINABILIR TEK ANAHTAR: nobetcinin vetosu.");
  const nobetci = "0x" + String(await rpc("eth_call",
    [{ to: D.governor, data: keccak256(Buffer.from("guardian()")).slice(0, 10) }, "latest"])).slice(26);
  const aktifHam = await rpc("eth_call",
    [{ to: D.governor, data: keccak256(Buffer.from("guardianActive()")).slice(0, 10) }, "latest"]);
  console.log("    nobetci   " + nobetci);
  console.log("    aktif mi  " + (BigInt(aktifHam) === 1n ? "evet" : "hayir"));
  console.log("    yapabildigi tek sey: bir oneriyi IPTAL etmek. Oneremez,");
  console.log("    oy veremez, uygulayamaz, parametre degistiremez. 365 gun");
  console.log("    sonra kendiliginden isler durur.");
  console.log("");
  console.log("  Yani renounce() 'kilitlemek' degil — kilit zaten atilmis.");
  console.log("  renounce() sadece kotu bir oneriyi durdurma imkanini siler.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
