"use strict";
/* ===========================================================================
 * denetim-v2-arc.js — the second generation on Arc, as deployed, in one eth_call
 *
 *   node scripts/denetim-v2-arc.js
 *
 * Runs contracts/test/TestV2Arc.sol against Arc mainnet (nothing is sent):
 * the real MerkezKapi, PulseLaunchpad5 (ladder without end), PulseHook5,
 * SepetUcu, Defter v2 and HaberciLZ from dagitim-v2.json. The Defter's Arc
 * binding, which `dagit-v2.js bagla` writes, is given by state override at
 * its storage slots (launchpad: slot 1, kasa: slot 2; the layout is checked
 * first by reading kurucu at slot 3).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, zeroPadValue, getAddress } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://arc-rpc.publicnode.com";
const H = "0x00000000000000000000000000000000000c0de2";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestV2Arc.json"), "utf8"));
const I = new Interface(T.abi);
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v2.json"), "utf8")).zincir.arc;
const c = AbiCoder.defaultAbiCoder();
const rpc = async (m, p) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
  if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 600));
  return r.result;
};
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { if (k) gecti++; else kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const tk = (x) => Math.round(Number(BigInt(x) / 10n ** 18n)).toLocaleString("en-US");
const dl = (x) => (Number(BigInt(x)) / 1e6).toFixed(2);

(async () => {
  console.log("V2 ARC  kurulu kontratlar, tukenmeyen merdiven (Arc ana ag durumu, iki blok simulasyonu, gonderim yok)");
  /* the layout: kurucu sits at slot 3 */
  const kurucu = await rpc("eth_getStorageAt", [A.SepetDefteri, "0x3", "latest"]);
  const ben = "0x" + kurucu.slice(26);
  ok(/^0x[0-9a-f]{40}$/.test(ben) && BigInt(ben) !== 0n, "Defter depolama duzeni dogrulandi (kurucu yuva 3)", getAddress(ben));
  const yuva = (anahtar, s) => keccak256(c.encode(["uint32", "uint256"], [anahtar, s]));
  const ezme = { [A.SepetDefteri]: { stateDiff: { [yuva(26, 1)]: zeroPadValue(A.SepetUcu, 32), [yuva(26, 2)]: zeroPadValue(A.SepetKasasi, 32) } },
    [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 23n).toString(16) } };
  /* two blocks (eth_simulateV1): the launch, then 70 seconds later the trades, past the 5-second snipe window */
  const simdi = Math.floor(Date.now() / 1000);
  const blok = (zaman, data, ez) => ({ ...(ez ? { stateOverrides: ez } : {}), blockOverrides: { time: "0x" + zaman.toString(16) },
    calls: [{ from: H, to: H, data, gas: "0x1c9c380" }] });
  const sim = await rpc("eth_simulateV1", [{ blockStateCalls: [
    blok(simdi + 5, I.encodeFunctionData("kur", [A.MerkezKapi, PM]), ezme),
    blok(simdi + 75, I.encodeFunctionData("isle", [A.MerkezKapi, A.SepetDefteri, A.SepetUcu, PM])),
  ] }, "latest"]);
  for (const [i, x] of sim.entries()) if (x.calls[0].status !== "0x1") throw new Error("blok " + (i + 1) + " basarisiz: " + JSON.stringify(x.calls[0].error || x.calls[0]).slice(0, 300));
  const [s] = I.decodeFunctionResult("isle", sim[1].calls[0].returnData);
  const b = (x) => BigInt(x);
  ok(s.token !== "0x0000000000000000000000000000000000000000", "launch kapidan yapildi, havuz Arc'ta acildi", s.token);
  ok(b(s.kurucuToken) === 28n * 10n ** 24n, "kurucu acilis fiyatindan aldi: 100 $ -> 28M token", tk(s.kurucuToken));
  ok(b(s.havuzToken0) >= 972n * 10n ** 24n - 10n ** 20n, "merdiven havuzda: ~972M token", tk(s.havuzToken0));
  ok(b(s.alim1) > 0n && b(s.alim2) > 0n, "iki ayri 10.000 $ alim token aldi (eski 2x merdiven ~4.800 $ alimda tukeniyordu)", tk(s.alim1) + " + " + tk(s.alim2));
  ok(b(s.alim2) < b(s.alim1), "ikinci alim daha pahali (fiyat yukseldi)");
  ok(b(s.havuzToken2) > 0n, "havuzda hala token var", tk(s.havuzToken2));
  ok(b(s.satisDolar) < b(s.konan) && b(s.satisDolar) > 0n, "hepsi geri satildi: gelen < konan (ucret ve vergi)", dl(s.satisDolar) + " / " + dl(s.konan) + " $");
  ok(b(s.itfaDolar) > 0n && b(s.itfaDolar) <= b(s.bekleyenOnce), "itfa: Defter'de bekleyen sepet dolarindan payini aldi", dl(s.itfaDolar) + " / " + dl(s.bekleyenOnce) + " $");
  ok(b(s.arzSonra) === 10n ** 27n - b(s.kurucuToken) / 2n, "itfa edilen yakildi, sepet arzi o kadar dustu", tk(s.arzSonra));
  ok(b(s.kapiDolar) === 0n, "kapida dolar kalmadi");
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
