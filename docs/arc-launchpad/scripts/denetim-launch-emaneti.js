"use strict";
/* ===========================================================================
 * denetim-launch-emaneti.js — LaunchEmaneti measured on Arc mainnet state
 *
 *   node scripts/denetim-launch-emaneti.js
 *
 * Runs contracts/test/TestLaunchEmaneti.sol in one eth_call on Arc mainnet
 * (nothing is sent): the live MerkezKapi (v2), PulseLaunchpad5, Defter and
 * Circle's TokenMessengerV2. Only Circle's MessageTransmitterV2 is played by
 * the test (SahteIletici: same destination-caller and nonce checks, then the
 * mint), because an attestation cannot be made for a burn that did not happen.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://arc-rpc.publicnode.com";
const H = "0x00000000000000000000000000000000000e0a01";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestLaunchEmaneti.json"), "utf8"));
const I = new Interface(T.abi);
const rpc = async (m, p) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
  if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 600));
  return r.result;
};
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { if (k) gecti++; else kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const d = (x) => (Number(BigInt(x)) / 1e6).toFixed(4);
const SIFIR = "0x0000000000000000000000000000000000000000";

(async () => {
  const out = await rpc("eth_call", [{ from: H, to: H, data: I.encodeFunctionData("run", []), gas: "0x20000000" }, "latest",
    { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 22n).toString(16) } }]);
  const [s] = I.decodeFunctionResult("run", out);
  const b = (x) => BigInt(x);
  console.log("LAUNCH EMANETI  Sui/Aptos'ta yakilan dolarla launch, gercek Arc ana ag durumu");
  console.log("A) Sui'den gelen yakim + kanca = launch");
  ok(s.token !== SIFIR, "token ve havuz Arc'ta kuruldu (canli MerkezKapi)", s.token);
  ok(s.vekil !== SIFIR, "kurucu vekili acildi", s.vekil);
  ok(b(s.kurucuToken) > 0n, "kurucunun tokenleri kurucuya teslim (Arc)", (Number(b(s.kurucuToken) / 10n ** 12n) / 1e6).toLocaleString("en-US") + " token");
  ok(b(s.iadeA) >= 940_000n && b(s.iadeA) <= 950_000n, "kullanilmayan LayerZero payi iade adresine dondu (0,05 $ bahsis dusuldu)", d(s.iadeA) + " USDC");
  ok(b(s.emanetSonA) === 0n, "emanette dolar kalmadi");
  console.log("B) yetmeyen tutar");
  ok(s.launchYokB && b(s.iadeB) === 49_950_000n, "launch yapilmadi, tamami iade adresine (0,05 $ bahsis dusuldu)", d(s.iadeB) + " USDC");
  console.log("C) launch olmayan kanca");
  ok(b(s.emanetSonC) === 0n, "dolar emanette kalmadi");
  ok(b(s.arzOnceC) === 0n || b(s.arzOnceC) - b(s.arzSonraC) === 7_000_000n, "Circle TokenMessengerV2 ile gonderene, Sui'ye geri yakildi",
    b(s.arzOnceC) ? "arz " + d(b(s.arzOnceC) - b(s.arzSonraC)) + " azaldi" : "arz okunamadi");
  console.log("D) yetki");
  ok(s.yanlisCagiranRed, "hedef cagiran baskasi olan mesaj reddedildi");
  ok(s.yanlisAliciRed, "alicisi emanet olmayan mesaj reddedildi");
  ok(s.tekrarRed, "ayni mesaj ikinci kez islenemedi");
  ok(s.cozDisaridanRed, "coz() disaridan cagrilamiyor");
  console.log("F) kapinin reddettigi launch");
  ok(s.tokenF === SIFIR && b(s.iadeF) === 129_950_000n, "tamami iade adresine dondu (0,05 $ bahsis dusuldu)", d(s.iadeF) + " USDC");
  ok(b(s.bahsis) === 150_000n, "v4: isle'yi cagiran (kurucu degil) her launch icin 0,05 $ bahsis aldi", d(s.bahsis) + " USDC");
  ok(b(s.iadeTopluluk) === 0n, "emanet bos");
  console.log("\n" + gecti + "/" + (gecti + kaldi) + " gecti");
  if (kaldi) process.exitCode = 1;
})().catch((e) => { console.error("HATA " + e.message); process.exitCode = 1; });
