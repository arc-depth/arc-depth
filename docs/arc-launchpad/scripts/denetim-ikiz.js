"use strict";
/* ===========================================================================
 * denetim-ikiz.js — a launch token gets a twin on the other chain
 *
 *   node scripts/denetim-ikiz.js
 *
 * contracts/lz/IkizFabrika.sol: IkizFabrika (home chain) creates a lock
 * adapter for any launch token, IkizOFTFabrika (other chain) creates its
 * twin. Both factories sit at the same address on Arc and Robinhood, so the
 * adapter knows the twin's address before the twin exists and both ends
 * are wired at birth with no owner left. The deployed launchpad is not
 * touched.
 *
 * Checked through one eth_call: the twin lands where the adapter expects,
 * both peers point at each other, no owner survives and the peer cannot be
 * changed, the twin carries the home name/symbol/decimals, a round trip
 * keeps twin supply == locked on the home chain, a twin deployed under
 * another name lands elsewhere and the adapter refuses its messages, and a
 * second setup for the same token is refused.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestIkiz.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000FA";
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
let gecti = 0, kaldi = 0;
function ok(k, ad, v) { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (v !== undefined ? "  (" + v + ")" : "")); }

(async () => {
  let out;
  for (let i = 1; ; i++) {
    try { out = await rpc("eth_call", [{ to: H, data: I.encodeFunctionData("run", []), gas: "0x8000000" }, "latest", { [H]: { code: T.deployedBytecode } }]); break; }
    catch (e) { if (!/rate limit/.test(e.message) || i > 6) throw e; await new Promise((r) => setTimeout(r, i * 8000)); }
  }
  const [s] = I.decodeFunctionResult("run", out);
  const n = (x) => BigInt(x) / E18;

  console.log("IKIZ TOKEN  ev (Arc 30417) <-> karsi (Robinhood 30416)");
  ok(s.ikizBeklenenAdreste, "ikiz, adapterin onceden hesapladigi adrese dustu");
  ok(s.adapterIkizeBagli && s.ikizAdapteraBagli, "iki uc birbirine bagli, kurulumda");
  ok(s.sahipYok, "iki ucta da owner == 0");
  ok(s.setPeerReddedildi, "baglanti sonradan degistirilemiyor");
  ok(s.ikizAd === "Fathom (test)" && s.ikizSembol === "FTHM" && Number(s.ikizOndalik) === 18, "ikiz evdeki ad/sembol/ondalikla ayni", s.ikizAd + " / " + s.ikizSembol);
  ok(n(s.kilitli1) === 1500n && BigInt(s.ikizArz1) === BigInt(s.kilitli1), "gidis: ikiz arzi == evde kilitli", n(s.kilitli1));
  ok(n(s.rhAlici1) === 1000n, "karsi zincirdeki alici 1000 aldi");
  ok(n(s.kilitli2) === 1100n && BigInt(s.ikizArz2) === BigInt(s.kilitli2), "400 donus: ikiz arzi == evde kilitli", n(s.kilitli2));
  ok(n(s.arcAlici2) === 400n, "evdeki alici 400 geri aldi");
  ok(s.sahteIkizFarkliAdreste, "baska adla kurulan ikiz baska adrese dustu");
  ok(s.sahteIkizMesajiReddedildi, "sahte ikizin mesajini adapter reddetti");
  ok(s.ikinciKurulumReddedildi, "ayni token icin ikinci kurulum reddedildi");
  for (const ad of ["IkizFabrika", "IkizOFTFabrika", "IkizAdapter", "IkizOFT"]) {
    const boy = (JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8")).deployedBytecode.length - 2) / 2;
    ok(boy < 24576, ad + " dagitilabilir boyutta", boy + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
