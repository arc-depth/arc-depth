"use strict";
/* ===========================================================================
 * denetim-defter-v2.js — the basket ledger's $50 rule, on Arc mainnet state
 *
 *   node scripts/denetim-defter-v2.js
 *
 * Runs contracts/test/TestDefterV2.sol in one eth_call (Arc's real LayerZero
 * endpoint and Circle's TokenMessengerV2). Nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const H = "0x00000000000000000000000000000000000c0de3";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestDefterV2.json"), "utf8"));
const I = new Interface(T.abi);
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const d6 = (x) => (Number(x) / 1e6).toFixed(2);

(async () => {
  const r = await fetch("https://arc-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: H, to: H, data: I.encodeFunctionData("run", []), gas: "0x20000000" }, "latest",
      { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 22n).toString(16) } }] }) }).then((x) => x.json());
  if (r.error) { console.log("HATA eth_call: " + JSON.stringify(r.error).slice(0, 400)); process.exit(1); }
  const [s] = I.decodeFunctionResult("run", r.result);
  console.log("DEFTER V2  her teminat tokeni $50'lik USDC ile alinir (Arc ana ag durumu)");
  ok(s.kayitArc === 8_000_000n && s.kayitBase === 8_000_000n && s.kayitAvax === 4_000_000n, "launch: kurucunun dolari her satirin hesabinda USDC olarak bekliyor", d6(s.kayitArc) + " / " + d6(s.kayitBase) + " / " + d6(s.kayitAvax));
  ok(s.ihaleKayit === 0n && s.hicGitmedi, "$50'in altinda hicbir satir alinmadi, dolar Defter'de");
  ok(s.vergi1Arc === 28_000_000n && s.vergi1Base === 28_000_000n && s.ihaleVergi1 === 0n, "50 $ vergi agirliga gore bolundu (20/20/10), yine $50 alti", d6(s.vergi1Arc) + " / " + d6(s.vergi1Base));
  ok(s.vergiDonmedi, "60 $ daha: vergi islemi geri donmedi");
  ok(s.ihaleVergi2 === 1n && s.arcGitti > 0n, "Arc satiri $50'yi gecti, ayni cagrida kasaya gitti, ihale acildi", d6(s.arcGitti) + " USDC");
  ok(s.baseGitti, "Base satiri $50'yi gecti, LayerZero emri + Circle otomatik teslimli dolar ayni cagrida gitti");
  ok(s.haberciKalan === 0n, "haberci'de dolar kalmadi (LayerZero ucreti emrin dolarindan)");
  ok(s.avaxBekliyor >= 50_000_000n, "ulasilamayan zincirin satiri $50'yi gecse de dolar bekliyor, kaybolmadi", d6(s.avaxBekliyor) + " USDC");
  ok(s.itfaPay === 2_000_000n && s.beklemedeSonra === 2_000_000n, "arzin %10'u itfa: bekleyen USDC'nin %10'u odendi", d6(s.itfaPay) + " USDC");
  ok(s.adaSolanaRed, "BNB satirli launch Solana adresine itfa edilmek istenince hemen reddedildi (ada yalniz EVM adresine oder)");
  ok(s.adaEvmGitti, "ayni launch EVM adresine itfa edildi, BNB emri gitti");
  const boy = (JSON.parse(fs.readFileSync(path.join(KOK, "build", "SepetDefteri.json"), "utf8")).deployedBytecode.length - 2) / 2;
  ok(boy < 24576, "SepetDefteri dagitilabilir boyutta", boy + " bayt");
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
