"use strict";
/* ===========================================================================
 * denetim-ikiz-yayici.js — "a token appears on every chain", measured
 *
 *   node scripts/denetim-ikiz-yayici.js [zincir ...]
 *
 * Sending side, on each chain's REAL state: IkizYayici creates the home
 * adapter and sends the spread message to all eight other chains through
 * the real endpoint, paying the real DVNs and executor; the excess comes
 * back. Receiving side, on Arc with the harness at the endpoint address: a
 * spread message places the twin at the precomputed address, a second one
 * is harmless, a message from anyone but the peer is refused.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const art = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
const G = art("TestIkizYayici"), R = art("TestIkizYayiciAlim");
const H = "0x00000000000000000000000000000000000000FB";

async function rpc(url, m, p) {
  for (let i = 1; ; i++) {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    const msg = JSON.stringify(r.error);
    if (/gas limit too high|exceeds/i.test(msg) && p[0].gas !== "0x5F5E100") { p[0].gas = "0x5F5E100"; continue; }
    if (!/rate|limit|timeout|fetch failed|429|503/i.test(msg) || i > 6) throw new Error(msg.slice(0, 300));
    await new Promise((ok) => setTimeout(ok, i * 4000));
  }
}
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };

(async () => {
  const secili = process.argv.slice(2);
  const IG = new Interface(G.abi);
  for (const [ad, z] of Object.entries(EVM)) {
    if (secili.length && !secili.includes(ad)) continue;
    console.log(z.ad);
    try {
      const out = await rpc(z.rpc, "eth_call", [{ to: H, data: IG.encodeFunctionData("run", []), gas: "0x10000000" }, "latest",
        { [H]: { code: G.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) } }]);
      const [s] = IG.decodeFunctionResult("run", out);
      ok(s.sahipsiz, "yayici sahipsiz");
      ok(Number(s.hedef) === 8 && BigInt(s.ucret) > 0n, "8 zincire yayinin gercek ucreti", (Number(s.ucret) / 1e18).toPrecision(3) + " " + z.gaz);
      ok(BigInt(s.harcanan) === BigInt(s.ucret), "yalniz ucret harcandi, fazlasi geri dondu");
      ok(s.adapterVar, "ev adaptoru kuruldu, ikiz adresi " + s.ikiz.slice(0, 10) + "…");
    } catch (e) { ok(false, "calistirilamadi", e.message.slice(0, 160)); }
  }
  if (!secili.length || secili.includes("arc")) {
    console.log("Alim (Arc, uc nokta duzenegi)");
    const IR = new Interface(R.abi);
    const EP = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B";
    const out = await rpc(EVM.arc.rpc, "eth_call", [{ to: EP, data: IR.encodeFunctionData("run", []), gas: "0x10000000" }, "latest",
      { [EP]: { code: R.deployedBytecode, state: {} } }]);
    const [s] = IR.decodeFunctionResult("run", out);
    ok(s.kuruldu && s.ikizAd === "Pulse Cat" && BigInt(s.ikizArz) === 0n, "mesaj ikizi onceden hesaplanan adreste kurdu", s.beklenen);
    ok(s.ikinciZararsiz, "ikinci mesaj zararsiz");
    ok(s.yabanciReddedildi, "peer olmayan gonderen reddedildi");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})();
