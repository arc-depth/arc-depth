"use strict";
/* ===========================================================================
 * denetim-ikiz-ag.js — the twin generation, on all nine EVM chains' real state
 *
 *   node scripts/denetim-ikiz-ag.js            # every chain
 *   node scripts/denetim-ikiz-ag.js base bsc   # some
 *
 * Runs contracts/test/TestIkizAg.sol with eth_call on each chain, against
 * that chain's REAL LayerZero endpoint, DVNs and executor. Per chain:
 * the adapter and a twin write two required DVNs on all 8 pathways both
 * ways (read back from the endpoint), peer every other chain, end with no
 * owner and a dead delegate — and the real endpoint prices a send from each
 * to every other chain, which needs both DVNs and the executor to serve it.
 * Nothing is sent; no gas is spent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestIkizAg.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000F9";
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
      [s] = I.decodeFunctionResult("run", out);
    } catch (e) { ok(false, "calistirilamadi", e.message.slice(0, 160)); continue; }
    ok(Number(s.eid) === z.eid, "tablo bu zinciri tanidi", "eid " + s.eid);
    ok(s.adapterSahipsiz && s.adapterDelegeOlu, "adaptor sahipsiz, delege 0xdead");
    ok(s.ikizSahipsiz && s.ikizDelegeOlu, "ikiz sahipsiz, delege 0xdead");
    ok(s.ikiz && s.beklenenIkiz, "ikiz adresi onceden hesaplandi");
    const h = s.hatlar;
    ok(h.every((x) => x.adapterAyar && x.ikizAyar), "8 hattin hepsinde iki zorunlu DVN, iki yonde",
      h.filter((x) => !(x.adapterAyar && x.ikizAyar)).map((x) => AD[x.eid]).join(",") || "8/8");
    ok(h.every((x) => x.adapterPeer && x.ikizPeer), "8 hattin hepsinde peer dogru",
      h.filter((x) => !(x.adapterPeer && x.ikizPeer)).map((x) => AD[x.eid]).join(",") || "8/8");
    const fiyatsiz = h.filter((x) => !(x.adapterUcret > 0n && x.ikizUcret > 0n));
    ok(fiyatsiz.length === 0, "gercek uc nokta 8 hedefin hepsini fiyatliyor",
      fiyatsiz.length ? fiyatsiz.map((x) => AD[x.eid] + ": " + x.hata).join("; ") :
        "en ucuz " + (Number(h.reduce((m, x) => (x.adapterUcret < m ? x.adapterUcret : m), h[0].adapterUcret)) / 1e18).toPrecision(3) + " " + z.gaz);
  }
  for (const n of ["IkizAdapterAg", "IkizOFTAg", "IkizFabrikaAg", "IkizOFTFabrikaAg"]) {
    const a = JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
    ok((a.deployedBytecode.length - 2) / 2 < 24576, n + " dagitilabilir", (a.deployedBytecode.length - 2) / 2 + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})();
