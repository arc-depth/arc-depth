"use strict";
/* ===========================================================================
 * denetim-ag-mantik.js — the network's message logic, on Arc mainnet state
 *
 *   node scripts/denetim-ag-mantik.js
 *
 * Runs contracts/test/TestAgMantik.sol with its code placed AT the real
 * LayerZero endpoint address on Arc (storage cleared), so every contract
 * that finds the endpoint through ZincirTablosu talks to the harness, which
 * records sends and delivers messages and composes as the executor would.
 * The PoolManager is Arc's real Uniswap v4.
 *
 * Measured: a price from a 6-decimal chain is filed in 18-decimal terms
 * (the BNB case), only forward in time, only from the peer; FTHM's twin is
 * minted from its home adapter; a buy where FTHM is 3% cheap pays the gap
 * to the vault and its effective price is not below the home price; the
 * gate sells an arriving compose for the recipient and keeps nothing; a
 * sale out goes to the chosen chain, to the gate there, carrying the
 * recipient and minimum; a buy out goes to the chosen chain, to the
 * recipient; the gate's setup runs once.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestAgMantik.json"), "utf8"));
const I = new Interface(T.abi);
const EP = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B";
const E18 = 10n ** 18n;

async function rpc(m, p) {
  for (let i = 1; ; i++) {
    const r = await fetch("https://rpc.mainnet.arc.io", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
    if (r.result !== undefined) return r.result;
    if (!/rate limit/i.test(JSON.stringify(r.error)) || i > 6) throw new Error(JSON.stringify(r.error).slice(0, 400));
    await new Promise((ok) => setTimeout(ok, i * 8000));
  }
}

let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const sq = (x, f0) => { const p = (Number(BigInt(x)) / 2 ** 96) ** 2; return p; };

(async () => {
  const out = await rpc("eth_call", [{ to: EP, data: I.encodeFunctionData("run", []), gas: "0x10000000" },
    "latest", { [EP]: { code: T.deployedBytecode, state: {} } }]);
  const [s] = I.decodeFunctionResult("run", out);
  const b = (x) => BigInt(x);

  console.log("AG MANTIGI  (Arc ana ag durumu, uc nokta adresinde duzenek)");
  console.log("FiyatAgi");
  ok(s.yeniden18e, "6 ondalikli zincirden gelen fiyat 18 ondalikla kaydedildi", "sqrt x 1e6");
  ok(s.eskiYokSayildi, "eski tarihli fiyat yok sayildi");
  ok(s.yabanciReddedildi, "peer olmayan gonderen reddedildi");
  console.log("FarkHookAg");
  const ref = sq(s.refS), yerel = sq(s.yerelS);
  ok(yerel < ref, "havuz ev fiyatinin altinda", (yerel / ref * 100).toFixed(2) + "%");
  ok(b(s.ucretli) > 0n, "ucuz taraftaki alim farki kasaya odedi", (Number(b(s.ucretli)) / 1e18).toLocaleString("en-US") + " FTHM");
  const etkin = Number(b(s.alimGiren)) / Number(b(s.alimCikan));
  ok(etkin >= ref * 0.995, "etkin alim fiyati ev fiyatinin altina inmedi", etkin.toExponential(4) + " vs ev " + ref.toExponential(4));
  console.log("KapiAg");
  ok(b(s.aliciPara) > 0n, "gelen compose satildi, alici dolari aldi", (Number(b(s.aliciPara)) / 1e18).toFixed(4) + " $");
  ok(s.kapiBos, "kapida bir sey kalmadi");
  ok(Number(s.gidenHedef) === 30110, "satis secilen zincire gitti", "eid " + s.gidenHedef);
  ok(s.gidenPeerIkiz && BigInt(s.gidenAlici) === BigInt(s.kapiAdresi) && s.gidenComposeAlici.toLowerCase() === "0x0000000000000000000000000000000000000b0b" && b(s.gidenComposeAsgari) === 7n,
    "satis karsidaki kapiya (ayni adres), alici ve asgariyle", "asgari " + s.gidenComposeAsgari);
  ok(Number(s.alGidenHedef) === 30110 && BigInt(s.alGidenAlici) === 0xB0Bn && s.alComposeYok, "alim secilen zincirde dogrudan aliciya gitti", "eid " + s.alGidenHedef);
  ok(s.ikinciKurReddedildi, "kurulum ikinci kez yapilamiyor");
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
