"use strict";
/* ===========================================================================
 * denetim-sepet-v3.js — redemption without auctions (v3 exits), one eth_call
 *
 *   node scripts/denetim-sepet-v3.js
 *
 * Runs contracts/test/TestSepetV3.sol on Arc mainnet state: an in-memory
 * five-chain network with the real Defter / Kasa / Ucu code, then the real
 * HaberciLZ with Arc's USDC and LayerZero endpoint. Nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const H = "0x00000000000000000000000000000000000c0de4";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestSepetV3.json"), "utf8"));
const I = new Interface(T.abi);
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const u = (x) => (Number(x) / 1e18).toString();

(async () => {
  const r = await fetch(process.env.ARC_RPC || "https://arc-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ from: H, to: H, data: I.encodeFunctionData("run", []), gas: "0x20000000" }, "latest",
      { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 22n).toString(16) } }] }) }).then((x) => x.json());
  if (r.error) { console.log("HATA eth_call: " + JSON.stringify(r.error).slice(0, 600)); process.exit(1); }
  const [s] = I.decodeFunctionResult("run", r.result);
  console.log("SEPET V3  itfada ihalesiz cikis: her satirin birimi sahibin adresine ya da relay yatirma adresine (Arc ana ag durumu)");
  ok(s.alimlarDoldu, "iki launch, bes satir (Arc, Base x2, BNB adasi, Solana): EVM alimlari dolduruldu");
  ok(s.arcCikis === s.arcBeklenen && s.arcIhaleSonra === s.arcIhaleOnce, "Arc satiri: %10'luk pay relay yatirma adresine gitti, ihale acilmadi", u(s.arcCikis) + " birim");
  ok(s.relayOdedi === 20_000_000n, "relay benzetimi o birimleri sahibin zincirinde dolara cevirdi", (Number(s.relayOdedi) / 1e6).toFixed(2) + " $");
  ok(s.baseTur === 7n && s.baseIhaleSonra === s.baseIhaleOnce + 1n, "Base: v3 emri (SAT_CIKIS) gitti; cikis verilmeyen satir ihaleye cikti (tek ihale)");
  ok(s.aynisi === s.aynisiBeklenen, "Base ikinci satir: varligin kendisi sahibin adresine (ayni EVM adresi)", u(s.aynisi) + " birim");
  ok(s.bnbTur === 7n && s.bnbCikis === 10n ** 19n, "BNB adasi: birimler yatirma adresine, ihale yok", u(s.bnbCikis) + " birim");
  ok(s.solTur === 3n, "Solana kasasi eski emri (SAT) aldi: EVM disi kasa cikis okumaz, ihale ile satar", "tur " + s.solTur);
  ok(s.evmDisiIhale, "EVM bicimi olmayan cikis: geri cevrilmedi, o satir ihaleye");
  ok(s.karaIhaleyeDondu, "tokenin gondermeyi reddettigi cikis (kara liste): islem donmedi, satir ihaleye", s.karaIhale + " ihale");
  ok(s.yanlisSayiEski, "satir sayisini tutmayan cikislar yok sayildi: her kasaya v2 emri");
  ok(s.eskiItfaEski, "v2 girisi (itfa) aynen calisiyor: her satir ihaleye");
  ok(s.kasaUyumlu, "kasa defteri = kasadaki birim (bakiye + acik satis ihaleleri), hicbir birim kaybolmadi");
  ok(s.baskaLaunchSaglam, "ayni varligi tutan baska launch'in birimleri yerinde");
  ok(s.defterUyumlu, "Defter arzi dort itfa kadar dustu");
  ok(s.ucuBosRed && s.ucuFazlaRed, "Ucu bos ya da 5'ten fazla cikisi yakmadan reddediyor");
  console.log("  gaz (bes zincirli benzetim, tek cagri): v2 itfa " + s.gazEski + ", v3 itfaCikis " + s.gazCikisli);
  ok(s.bArcCikis === s.bArcBeklenen && s.bBaseGitti && s.bIhale === 1n, "Arc gercek HaberciLZ: Arc payi yatirma adresine, Base v3 emri LayerZero ile cikti", u(s.bArcCikis) + " birim");
  const boy = (n) => (JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8")).deployedBytecode.length - 2) / 2;
  ok(boy("SepetDefteri") < 24576 && boy("SepetKasasi") < 24576 && boy("SepetUcu") < 24576, "Defter, Kasa, Ucu dagitilabilir boyutta",
    boy("SepetDefteri") + " / " + boy("SepetKasasi") + " / " + boy("SepetUcu") + " bayt");
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
