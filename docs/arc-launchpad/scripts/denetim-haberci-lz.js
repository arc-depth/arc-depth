"use strict";
/* ===========================================================================
 * denetim-haberci-lz.js — the basket messenger with nothing to relay by hand
 *
 *   node scripts/denetim-haberci-lz.js
 *
 * Runs contracts/test/TestHaberciLZ.sol in one eth_call on Arc mainnet state
 * (Arc's real LayerZero endpoint and DVNs, Circle's real TokenMessengerV2).
 * Nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const H = "0x00000000000000000000000000000000000c0de2";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestHaberciLZ.json"), "utf8"));
const I = new Interface(T.abi);
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const d6 = (x) => (Number(x) / 1e6).toFixed(4);

(async () => {
  const r = await fetch("https://arc-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: H, to: H, data: I.encodeFunctionData("run", []), gas: "0x20000000" }, "latest",
      { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 22n).toString(16) } }] }) }).then((x) => x.json());
  if (r.error) { console.log("HATA eth_call: " + JSON.stringify(r.error).slice(0, 400)); process.exit(1); }
  const [s] = I.decodeFunctionResult("run", r.result);
  console.log("HABERCI LZ  Arc ana ag durumu, gercek LayerZero uc noktasi ve Circle TokenMessengerV2");
  console.log("GONDERIM (Arc)");
  ok(s.baseGitti, "Base'e 4 $'lik emir: LayerZero ucreti 4 $'dan kesildi, kalan Circle'a otomatik teslimli yakim");
  ok(s.baseKalan === 0n, "haberci'de dolar kalmadi", d6(s.baseKalan));
  ok(s.relayGitti && s.relayAldi > 0n && s.relayAldi < 4_000_000n, "BNB'ye emir: dolar relay yatirma adresine duz transfer", d6(s.relayAldi) + " USDC");
  ok(s.duzGitti, "otomatik teslim olmayan zincire emir: duz CCTP yakimi");
  ok(s.ucretsizRed, "dolarsiz emir (itfa) ucret bakiyesi yokken reddedildi");
  ok(s.ucretliGitti, "ucret bakiyesi yatirilinca dolarsiz emir gitti");
  ok(s.odemeBase, "Base'e odeme: dogrudan aliciya otomatik teslimli yakim, ucret bakiyesine dokunulmadi");
  ok(s.odemeBnbArcta === 3_000_000n, "BNB'deki aliciya odeme: Arc'ta ayni adrese", d6(s.odemeBnbArcta));
  ok(s.suiGitti, "Sui'ye emir: CCTP ayrik mod (duz yakim kasaya + paket kimligine mesaj), v1 bicimi");
  ok(s.aptosGitti, "Aptos'a emir: CCTP hook'lu yakim Haberci'ye, v1 bicimi");
  ok(s.aptosDolarsiz, "Aptos'a dolarsiz emir (itfa): CCTP mesaji, LayerZero ucreti yok");
  console.log("ALIM (uzak zincir, LayerZero'nun teslimatcisi gibi)");
  ok(s.emirBekledi, "dolari gelmemis emir bekledi");
  ok(s.isleTeslim, "dolar gelince isle() emri teslim etti", d6(s.aliciAldi1) + " USDC");
  ok(s.once_dolar, "dolar onceden gelmisse emir lzReceive icinde hemen islendi", d6(s.aliciAldi2) + " USDC");
  ok(s.erkenBekler, "asgarinin altinda dolar varken emir beklemeye devam etti");
  ok(s.eksikUcretle, "yol ucreti dusulmus dolarla emir islendi", d6(s.aliciAldi3) + " USDC");
  ok(s.yabanciRed, "dogru zincirden yabanci gonderen reddedildi");
  ok(s.eidRed, "kayitsiz eid (Ethereum'un 0 numarasina karisma) reddedildi");
  ok(s.sadeceUcNokta, "uc nokta disindan lzReceive reddedildi");
  ok(s.kasaIhale === 1n, "gercek SepetKasasi kodu emri alip alim ihalesini acti");
  ok(s.kasaDolar > 0n, "kasada launch'in dolari", d6(s.kasaDolar) + " USDC");
  console.log("OLCUM (LayerZero ucretinin neye bagli oldugu)");
  ok(s.gazAl > 0n && s.gazAl < 600_000n, "teminat emri hedefte 600k gaz secenegine sigiyor", String(s.gazAl) + " gaz");
  ok(s.gazSat > 0n, "itfa emri hedefte", String(s.gazSat) + " gaz");
  const u = (x) => (Number(x) / 1e18).toFixed(4);
  ok(s.ucret600 > s.ucret150, "Arc->Base emir ucreti gaz secenegiyle pek degismiyor (sabit DVN + yurutucu)", "600k " + u(s.ucret600) + " / 250k " + u(s.ucret250) + " / 150k " + u(s.ucret150) + " USDC");
  ok(s.ucretOzel === s.ucret150 && s.ozelIkinciRed, "zincire ozel secenek (Solana icin): o zincirin teklifi onu izliyor, bir kez yazilir");
  ok(s.sarmaBekledi && s.sarmaTeslim && s.sarmaAlinan === 9_920_000n && s.sarmaArtik === 123n, "BNB: relay'in getirdigi 18 ondalikli USDC Dolar6'ya sarildi, bekleyen emir yurudu", (Number(s.sarmaAlinan) / 1e6) + " D6, artik " + s.sarmaArtik + " wei");
  const boy = (JSON.parse(fs.readFileSync(path.join(KOK, "build", "HaberciLZ.json"), "utf8")).deployedBytecode.length - 2) / 2;
  ok(boy < 24576, "HaberciLZ dagitilabilir boyutta", boy + " bayt");
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
