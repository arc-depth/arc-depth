"use strict";
/* Does a v4 position above the price really cost no collateral?
 * Run against the real PoolManager on Arc, through eth_call. */
const fs = require("fs");
const https = require("https");
const { Interface, AbiCoder } = require("ethers");

const RPC = "https://rpc.mainnet.arc.io";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const H = "0x00000000000000000000000000000000000000F2";

const path = require("path");
const T = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", "TestTekYonlu.json"), "utf8"));
const I = new Interface(T.abi);

function rpc(method, params) {
  return new Promise((res, rej) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: "rpc.mainnet.arc.io", path: "/", method: "POST",
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
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

async function R(fn) {
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (!/rate limit|429|503|timeout/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 15000);
    }
  }
}

/* Opening price 1.5e-6 collateral per token — the plan's 1500 market cap
 * against a supply of 1e9. sqrt in Q96. */
function sqrtX96(p) {
  const Q = 2n ** 96n;
  const x = BigInt(Math.round(p * 1e18)) * 10n ** 18n;
  let z = (x + 1n) / 2n, y = x;
  while (z < y) { y = z; z = (x / z + z) / 2n; }
  return (y * Q) / 10n ** 18n;
}

(async function () {
  const ARZ = 10n ** 9n * 10n ** 18n;
  console.log("TEK YONLU LIKIDITE — GERCEK Arc PoolManager");
  console.log("");

  for (const tokenIlk of [true, false]) {
    /* If the token is currency0 the pool price is collateral-per-token
       (1.5e-6). If it is currency1 the price is the inverse. */
    const fiyat = tokenIlk ? 1.5e-6 : 1 / 1.5e-6;
    const sp = sqrtX96(fiyat);

    const data = I.encodeFunctionData("run", [PM, tokenIlk, ARZ, sp]);
    let out;
    try {
      out = await R(() => rpc("eth_call", [
        { from: "0x0000000000000000000000000000000000000001", to: H, data, gas: "0x8000000" },
        "latest",
        { [H]: { code: T.deployedBytecode } }
      ]));
    } catch (e) {
      console.log("  token " + (tokenIlk ? "currency0" : "currency1") + ": HATA " + e.message.slice(0, 120));
      continue;
    }
    const [s] = I.decodeFunctionResult("run", out);
    const tt = BigInt(s.tokenTalep), td = BigInt(s.teminatTalep);
    console.log("  token " + (tokenIlk ? "currency0" : "currency1") +
      "   acilis tick " + s.acilisTick + "   bant [" + s.altTick + ", " + s.ustTick + "]");
    console.log("    havuzun istedigi TOKEN    " + (-tt).toString() +
      "   (" + (Number(-tt) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 0 }) + ")");
    console.log("    havuzun istedigi TEMINAT  " + (-td).toString() +
      (td === 0n ? "   <<< SIFIR, tek yonlu CALISIYOR" : "   <<< SIFIR DEGIL"));
    console.log("");
    await new Promise((r) => setTimeout(r, 1500));
  }
})().catch((e) => console.log("HATA: " + e.message));
