"use strict";
/* ===========================================================================
 * denetim-merkez-kapi.js — the one-pool model measured on Arc mainnet state
 *
 *   node scripts/denetim-merkez-kapi.js
 *
 * Runs contracts/test/TestMerkezKapi.sol in one eth_call on Arc mainnet
 * (nothing is sent): the real PulseLaunchpad5, PoolManager, Defter, Haberci,
 * IkizYayici and LayerZero endpoint. The test contract plays relay.link's
 * executor (it holds the dollars, by state override) and, for sales only,
 * the endpoint delivering a compose.
 *
 * Measured: a launch made through the gate (founder of record = a vekil,
 * the basket sent through the Defter, the twins placed on Base and
 * Arbitrum, the founder's tokens sent to Base); buys delivered on Arc and
 * on Base; a sale arriving from another chain paid on Arc and on Base; a
 * minimum that cannot be met handing the tokens to the fallback; a
 * redemption from another chain burning through the chain entry; only the
 * endpoint and only a launch token's adapter can trigger a sale; the
 * founder's trading income passed on; the gate keeps nothing.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://arc-rpc.publicnode.com";
const H = "0x00000000000000000000000000000000000c0de1";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestMerkezKapi.json"), "utf8"));
const I = new Interface(T.abi);
const rpc = async (m, p) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
  if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 600));
  return r.result;
};
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { if (k) gecti++; else kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const t = (x) => (Number(BigInt(x) / 10n ** 12n) / 1e6).toLocaleString("en-US");
const d = (x) => (Number(BigInt(x)) / 1e6).toFixed(4);

(async () => {
  const out = await rpc("eth_call", [{ from: H, to: H, data: I.encodeFunctionData("run", []), gas: "0x20000000" }, "latest",
    { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 22n).toString(16) } }]);
  const [s] = I.decodeFunctionResult("run", out);
  const b = (x) => BigInt(x);
  console.log("MERKEZ KAPI  tek havuz Arc'ta, gercek Arc ana ag durumu");
  console.log("A) her zincirden launch (relay'in yapacagi gibi)");
  ok(s.token !== "0x0000000000000000000000000000000000000000", "token ve havuz Arc'ta kuruldu", s.token);
  ok(s.vekil !== "0x0000000000000000000000000000000000000000", "kurucu vekili acildi", s.vekil);
  ok(s.adapterKodu && s.adapterKayitli, "ikiz yayildi: Arc adaptoru kuruldu ve kapiya kayitli", s.adapter);
  ok(b(s.adapterKilitli) > 0n, "kurucunun tokenleri Base'e yollandi (adaptorde kilitli)", t(s.adapterKilitli) + " token");
  ok(b(s.kapiUsdcLaunch) === 0n, "launch sonrasi kapida dolar kalmadi");
  console.log("B) alim");
  ok(b(s.bobToken) > 0n, "50 $ alim Arc'ta teslim", t(s.bobToken) + " token");
  ok(b(s.baseAlinan) > 0n, "20 $ alim Base'e yollandi", t(s.baseAlinan) + " token");
  console.log("C) baska zincirden gelen satis");
  ok(b(s.aliceUsdc) > 0n, "Arc havuzunda satildi, Arc'ta odendi", d(s.aliceUsdc) + " USDC");
  ok(s.baseOdemeGitti, "Base'de odenecek satis: dolar Haberci ile cikti, kapida kalmadi");
  console.log("D) karsilanamayan asgari");
  ok(b(s.yedekToken) > 0n, "token yedek adrese verildi, takilmadi", t(s.yedekToken) + " token");
  console.log("E) baska zincirden itfa");
  ok(b(s.arzItfa) > 0n, "token zincir girisinden yakildi, sepet emri gitti", t(s.arzItfa) + " token");
  console.log("F) yetki");
  ok(s.satDisaridan, "sat() disaridan cagrilamiyor");
  ok(s.sahteUcNokta, "uc nokta disindan compose reddedildi");
  ok(s.sahteAdapter, "launch tokeni adaptoru olmayan kaynak reddedildi");
  console.log("H) Arc'ta tutulan token (kapinin sonraki surumu: satArc) ve dogrudan itfa");
  ok(b(s.arcSatAlice) > 0n, "Arc'taki sahip satArc ile satti, Arc'ta odendi", d(s.arcSatAlice) + " USDC");
  ok(s.arcSatBaseBos, "Base'te odenecek satis: dolar Haberci ile cikti, kapida token ve dolar kalmadi");
  ok(s.satArcYabanci, "launch tokeni olmayan bir token satArc'ta reddedildi");
  ok(b(s.arcItfa) > 0n, "Arc'taki sahip kapisiz itfa etti (SepetUcu.itfa, bugunku kontratlarla)", t(s.arcItfa) + " token");
  console.log("G) kurucunun islem geliri");
  ok(b(s.vekilGelir) > 0n && b(s.kurucuAldi) === b(s.vekilGelir), "vekil kurucu payini kurucuya iletti", d(s.kurucuAldi) + " USDC");
  ok(b(s.kapiNativeSon) === 0n, "kapida yerel bakiye kalmadi");
  for (const n of ["MerkezKapi", "KurucuVekili"]) {
    const boy = (JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8")).deployedBytecode.length - 2) / 2;
    ok(boy < 24576, n + " dagitilabilir boyutta", boy + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
