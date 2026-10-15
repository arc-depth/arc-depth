"use strict";
/* ===========================================================================
 * denetim-fthm-kopru.js — the FTHM bridge, Arc <-> Robinhood, measured
 *
 *   node scripts/denetim-fthm-kopru.js
 *
 * Runs contracts/test/TestFTHMKopru.sol in one eth_call on Arc mainnet state:
 * the real FTHMOFTAdapter and FTHMOFT bytecode, wired to two queued
 * endpoints standing in for LayerZero (Arc eid 30417, Robinhood eid 30416).
 *
 * The invariant is the whole point: Robinhood supply equals what is locked
 * on Arc, after every trip, so the two chains together never hold more than
 * the 1,000,000,000 FTHM that exist. Also checked: dust below the 6 shared
 * decimals stays with the sender, a message from anyone but the peer is
 * refused, and once ownership is burned the wiring cannot change.
 *
 * What this does NOT cover: the real endpoint's fees, DVN verification and
 * executor. That is the testnet round trip (hafta-plani A3).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestFTHMKopru.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000F7";
const E18 = 10n ** 18n;

function rpc(m, p) {
  return new Promise((r, j) => {
    const b = JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p });
    const q = https.request({ hostname: "rpc.mainnet.arc.io", path: "/", method: "POST",
      headers: { "content-type": "application/json" } }, (s) => {
      let d = ""; s.on("data", (c) => (d += c));
      s.on("end", () => { const x = JSON.parse(d); x.error ? j(new Error(JSON.stringify(x.error))) : r(x.result); });
    });
    q.on("error", j); q.write(b); q.end();
  });
}
async function ısrarla(m, p) {
  for (let i = 1; ; i++) {
    try { return await rpc(m, p); }
    catch (e) { if (!/rate limit/.test(e.message) || i > 6) throw e; await new Promise((r) => setTimeout(r, i * 10000)); }
  }
}

let gecti = 0, kaldi = 0;
function ok(kosul, ad, deger) {
  if (kosul) gecti++; else kaldi++;
  console.log((kosul ? "  ok   " : "  HATA ") + ad + (deger !== undefined ? "  (" + deger + ")" : ""));
}

(async () => {
  const out = await ısrarla("eth_call", [{ to: H, data: I.encodeFunctionData("run", []), gas: "0x8000000" },
    "latest", { [H]: { code: T.deployedBytecode } }]);
  const [s] = I.decodeFunctionResult("run", out);
  const b = (x) => BigInt(x);

  console.log("FTHM KOPRU  Arc (30417) <-> Robinhood (30416)");
  ok(b(s.kilitli1) === 400n * E18, "gidis: Arc'ta 400 kilitlendi", b(s.kilitli1) / E18);
  ok(b(s.rhArz1) === b(s.kilitli1), "Robinhood arzi == Arc'ta kilitli", b(s.rhArz1) / E18);
  ok(b(s.rhAlici1) === 400n * E18, "Robinhood alicisi 400 aldi");
  ok(b(s.kilitli2) === 450n * E18, "+200 gidis, 150 donus: Arc'ta 450 kilitli", b(s.kilitli2) / E18);
  ok(b(s.rhArz2) === b(s.kilitli2), "donusten sonra da Robinhood arzi == kilitli", b(s.rhArz2) / E18);
  ok(b(s.arcAlici2) === 150n * E18, "Arc alicisi 150 geri aldi");
  ok(b(s.tozGonderilen) === E18 && b(s.tozKalan) === 123n, "6 ondaligin altindaki toz gonderende kaldi", s.tozKalan.toString() + " wei");
  ok(s.sahteReddedildi, "peer olmayan gonderenin mesaji reddedildi");
  ok(s.sahipYok, "sahiplik yakildi: iki tarafta da owner == 0");
  ok(s.setPeerReddedildi, "yakildiktan sonra peer degistirilemiyor");
  ok(Number(s.rhOndalik) === 18, "Robinhood FTHM 18 ondalik, Arc ile ayni");

  for (const [ad, sinir] of [["FTHMOFTAdapter", 24576], ["FTHMOFT", 24576]]) {
    const art = JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
    const boy = (art.deployedBytecode.length - 2) / 2;
    ok(boy < sinir, ad + " dagitilabilir boyutta", boy + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
