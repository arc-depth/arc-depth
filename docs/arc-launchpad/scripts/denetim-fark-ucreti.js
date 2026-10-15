"use strict";
/* ===========================================================================
 * denetim-fark-ucreti.js — the cross-chain gap fee, measured case by case
 *
 *   node scripts/denetim-fark-ucreti.js
 *
 * contracts/lz/FarkUcreti.sol decides how much extra a swap pays when the
 * Arc and Robinhood FTHM pools disagree. The rule is that a swap capturing
 * the gap pays the gap, and a swap closing it pays nothing. This runs the
 * library through an eth_call on Arc and checks every branch: both token
 * orders, both directions, the cap, a stale or future reference, and no
 * reference at all.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface } = require("ethers");

const T = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestFarkUcreti.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000F8";

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
async function cagir(fn, args) {
  for (let i = 1; ; i++) {
    try {
      const out = await rpc("eth_call", [{ to: H, data: I.encodeFunctionData(fn, args) }, "latest", { [H]: { code: T.deployedBytecode } }]);
      return I.decodeFunctionResult(fn, out)[0];
    } catch (e) { if (!/rate limit/.test(e.message) || i > 6) throw e; await new Promise((r) => setTimeout(r, i * 8000)); }
  }
}

let gecti = 0, kaldi = 0;
function ok(k, ad, v) { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (v !== undefined ? "  (" + v + ")" : "")); }
const yakin = (a, b, tol) => Math.abs(Number(a) - b) <= tol;

(async () => {
  const sq = (n, d) => cagir("sqrtFiyat", [n, d]);
  const p100 = await sq(100, 100), p98 = await sq(98, 100), p103 = await sq(103, 100), p50 = await sq(50, 100);
  const tInv98 = await sq(100, 98), tInv100 = p100;
  const SIMDI = 1_800_000_000n, YAS = 600n, TAVAN = 100000;
  const f = (y, r, t0, al, rz = SIMDI - 10n) => cagir("hesapla", [y, r, t0, al, rz, SIMDI, YAS, TAVAN]);

  console.log("FARK UCRETI");
  ok(Number(await f(p100, p100, true, true)) === 0, "fiyatlar esit: alim ekstra odemez");
  ok(Number(await f(p100, p100, true, false)) === 0, "fiyatlar esit: satim ekstra odemez");

  const al98 = await f(p98, p100, true, true);
  ok(yakin(al98, 20000, 2), "FTHM burada %2 ucuz, ALIM farki oder", al98 + " ppm");
  ok(Number(await f(p98, p100, true, false)) === 0, "FTHM burada ucuz, SATIM fiyatlari yaklastirir, ekstra yok");

  const sat103 = await f(p103, p100, true, false);
  ok(yakin(sat103, 29126, 2), "FTHM burada %3 pahali, SATIM farki oder (0.03/1.03)", sat103 + " ppm");
  ok(Number(await f(p103, p100, true, true)) === 0, "FTHM burada pahali, ALIM fiyatlari yaklastirir, ekstra yok");

  const t1 = await f(tInv98, tInv100, false, true);
  ok(yakin(t1, 20000, 2), "FTHM token1 iken de ayni: %2 ucuz, alim farki oder", t1 + " ppm");
  ok(Number(await f(tInv98, tInv100, false, false)) === 0, "FTHM token1, ucuz tarafta satim ekstra odemez");

  ok(Number(await f(p50, p100, true, true)) === TAVAN, "%50 fark tavanda kesilir", TAVAN + " ppm");
  ok(Number(await f(p98, p100, true, true, SIMDI - 601n)) === 0, "bayat referans (601 sn): ekstra yok");
  ok(Number(await f(p98, p100, true, true, SIMDI + 5n)) === 0, "gelecek tarihli referans: ekstra yok");
  ok(Number(await f(p98, 0, true, true)) === 0, "referans yok: ekstra yok");

  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
