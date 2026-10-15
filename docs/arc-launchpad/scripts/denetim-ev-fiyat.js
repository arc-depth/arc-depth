"use strict";
/* ===========================================================================
 * denetim-ev-fiyat.js — a launch pool's price, Arc to the twin on Robinhood
 *
 *   node scripts/denetim-ev-fiyat.js
 *
 * contracts/lz/EvFiyatKoprusu.sol: HavuzFiyatElcisi reads the CANONICAL
 * launch pool of a token (the launchpad's own key, and only if registered)
 * and sends its price; EvFiyatAlici stores it under the twin's address,
 * derived through the twin factories, and serves it to IkizHavuzFabrika.
 *
 * Checked in one eth_call: a token without a registered launch pool cannot
 * be sent; the price arrives under exactly the address the twin factory
 * deploys to; it is in token-as-currency0 order; an older message cannot
 * roll it back; a stranger is refused; and the twin-pool factory turns it
 * into its own pool's order. Run at two very different prices. The token
 * address is the same in both runs, so only one home-side ordering is
 * crossed here; the inversion branch is exercised on the twin side (the
 * twin sorts after USDG) and both branches of the same arithmetic are
 * covered in denetim-fthm-fark.js.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestEvFiyat.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000FD";

async function rpc(m, p) {
  for (let i = 1; ; i++) {
    const r = await fetch("https://rpc.mainnet.arc.io", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
    if (r.result !== undefined) return r.result;
    const msg = JSON.stringify(r.error);
    if (!/rate limit/i.test(msg) || i > 6) throw new Error(msg);
    await new Promise((s) => setTimeout(s, i * 8000));
  }
}
let gecti = 0, kaldi = 0;
function ok(k, ad, v) { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (v !== undefined ? "  (" + v + ")" : "")); }
const esit = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

(async () => {
  console.log("EV FIYATI  Arc launch havuzu -> LayerZero -> Robinhood ikiz");
  for (const sqrtP of [148_222_000_000_000_000_000n, 79228162514264337593543950336n * 1000n]) {
    const out = await rpc("eth_call", [{ to: H, gas: "0x10000000", data: I.encodeFunctionData("run", [sqrtP]) }, "latest", { [H]: { code: T.deployedBytecode } }]);
    const [s] = I.decodeFunctionResult("run", out);
    console.log(" sqrtP " + sqrtP);
    ok(s.kayitsizReddedildi, "kayitli launch havuzu olmayan token gonderilemedi");
    ok(esit(s.ikizHesaplanan, s.ikizGercek), "fiyat, ikiz fabrikasinin kurdugu adresin altinda", s.ikizGercek);
    ok(BigInt(s.alinan) === BigInt(s.beklenen) && BigInt(s.alinan) > 0n, "fiyat token-currency0 sirasinda dogru geldi");
    ok(s.eskiYokSayildi, "daha eski mesaj fiyati geri saramadi");
    ok(s.sahteReddedildi, "elci disindan gelen mesaj reddedildi");
    ok(BigInt(s.havuzHedefi) === BigInt(s.havuzHedefiBeklenen), "ikiz havuz fabrikasi fiyati kendi havuz sirasina cevirdi");
  }
  for (const ad of ["HavuzFiyatElcisi", "EvFiyatAlici"]) {
    const boy = (JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8")).deployedBytecode.length - 2) / 2;
    ok(boy < 24576, ad + " dagitilabilir boyutta", boy + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message.slice(0, 500)); process.exit(1); });
