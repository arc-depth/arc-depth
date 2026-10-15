"use strict";
/* ===========================================================================
 * denetim-ag-cekirdek.js — FiyatAgi, DaoElcisiAg, UzakYurutucuAg on all nine chains' real state
 *
 *   node scripts/denetim-ag-cekirdek.js            # every chain
 *   node scripts/denetim-ag-cekirdek.js base bsc   # some
 *
 * eth_call against each chain's REAL LayerZero endpoint: two required DVNs
 * on all 8 pathways both ways (read back), peers, dead delegate, no owner,
 * and a real quote from the price network and the DAO messenger to every
 * other chain. Nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestAgCekirdek.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000FA";
const AD = Object.fromEntries(Object.values(EVM).map((z) => [z.eid, z.ad]));

async function rpc(url, m, p) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    if (!/rate|limit|timeout|fetch failed|429|503/i.test(JSON.stringify(r.error)) || i > 6) throw new Error(JSON.stringify(r.error).slice(0, 300));
    await new Promise((ok) => setTimeout(ok, i * 4000));
  }
}

let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };

(async () => {
  const secili = process.argv.slice(2);
  for (const [ad, z] of Object.entries(EVM)) {
    if (secili.length && !secili.includes(ad)) continue;
    console.log("\n" + z.ad + " (" + z.chainId + ")");
    let s;
    try {
      const out = await rpc(z.rpc, "eth_call", [{ to: H, data: I.encodeFunctionData("run", []), gas: "0x5F5E100" },
        "latest", { [H]: { code: T.deployedBytecode } }]);
      s = I.decodeFunctionResult("run", out);
    } catch (e) { ok(false, "calistirilamadi", e.message.slice(0, 160)); continue; }
    const [fa, de, uy] = s;
    for (const [ad2, x, peer] of [["FiyatAgi", fa, 8], ["DaoElcisiAg", de, 8], ["UzakYurutucuAg", uy, 8]]) {
      ok(Number(x.eid) === z.eid && x.sahipsiz && x.delegeOlu, ad2 + " sahipsiz, delege 0xdead");
      ok(Number(x.ayarli) === 8, ad2 + " 8 hatta iki zorunlu DVN, iki yonde", x.ayarli + "/8");
      ok(Number(x.peerli) === peer, ad2 + " peer'ler dogru", x.peerli + "/8");
    }
    ok(Number(fa.fiyatli) === 8, "FiyatAgi mesaji 8 hedefe fiyatlandi", fa.fiyatli + "/8" + (fa.hata ? " " + fa.hata : ""));
    ok(Number(de.fiyatli) === 8, "DAO karari 8 hedefe fiyatlandi", de.fiyatli + "/8" + (de.hata ? " " + de.hata : ""));
  }
  for (const n of ["FiyatAgi", "DaoElcisiAg", "UzakYurutucuAg", "KapiAg", "FarkHookAg"]) {
    const a = JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
    ok((a.deployedBytecode.length - 2) / 2 < 24576, n + " dagitilabilir", (a.deployedBytecode.length - 2) / 2 + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})();
