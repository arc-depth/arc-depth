"use strict";
/* ===========================================================================
 * denetim-v4-arc.js — the v4 basket set on Arc, end to end (nothing is sent)
 *
 *   node scripts/denetim-v4-arc.js
 *
 * Runs contracts/test/TestV4Arc.sol in eth_simulateV1 blocks on Arc mainnet
 * state. The new contracts are deployed in the simulation exactly as
 * `dagit-v2.js v4` deploys them (the hook by CREATE2 with a mined salt); the
 * kept ones are live: HaberciLZ, IkizYayici, PulseFabrika4, FthmYakici, the
 * LayerZero endpoint, Circle's TokenMessengerV2, Uniswap v4's PoolManager.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, getCreateAddress, getCreate2Address, zeroPadValue, solidityPacked } = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = process.env.ARC_RPC || "https://arc-rpc.publicnode.com";
const H = "0x00000000000000000000000000000000000c0de4";
const Y = "0x00000000000000000000000000000000000c0de5";
const YEDEK = "0x000000000000000000000000000000000000bEEF";
/* the transactions' sender: not H, whose nonce must move only by its own CREATEs */
const GONDEREN = "0x00000000000000000000000000000000000F00d1";
const art = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
const T = art("TestV4Arc"), YA = art("Yabanci4"), KAPI = art("MerkezKapi");
const I = new Interface(T.abi), IY = new Interface(YA.abi), IK = new Interface(KAPI.abi);
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v2.json"), "utf8")).zincir.arc;
const c = AbiCoder.defaultAbiCoder();
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const EP = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B";
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const DEVPOOL = "0xA110b71c3f0748536f10C9e71A6E9F96999F6CD0";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const USDC = "0x3600000000000000000000000000000000000000";
const HOOK_BIT = 0x2ECC, HOOK_MASKE = (1 << 14) - 1;
const rpc = async (m, p) => {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
  if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 600));
  return r.result;
};
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { if (k) gecti++; else kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
const d6 = (x) => (Number(BigInt(x)) / 1e6).toFixed(4);
const tk = (x) => Math.round(Number(BigInt(x) / 10n ** 18n)).toLocaleString("en-US");

(async () => {
  console.log("V4 ARC  yeni sepet seti Arc ana ag durumunda, uctan uca (eth_simulateV1, gonderim yok)");
  const adr = { haberci: A.HaberciLZ, yayici: YAYICI, fabrika4: A.PulseFabrika4, fthmYakici: A.FthmYakici, pm: PM, tm: TM, ep: EP,
    devpool: DEVPOOL, isletme: ISLETME, kasaBase: "0x000000000000000000000000000000000000Ba5e" };
  /* this contract's nonces: kur1 creates at 1..5, kur2 the launchpad at 6 and the gate at 7 */
  const n = (i) => getCreateAddress({ from: H, nonce: i });
  const LP = n(6), LIKIDITE = n(4);
  const hookInit = art("PulseHook5").bytecode + c.encode(["address", "address", "address", "address", "address", "address", "address"],
    [PM, LP, USDC, DEVPOOL, LIKIDITE, ISLETME, A.FthmYakici]).slice(2);
  const hh = keccak256(hookInit);
  let tuz, hook;
  for (let i = 0; ; i++) {
    const t = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(C2, t, hh);
    if ((parseInt(a.slice(-4), 16) & HOOK_MASKE) === HOOK_BIT) { tuz = t; hook = a; break; }
  }
  /* each simulation starts its blocks after the chain's latest one */
  let simdi = 0;
  const zamanTazele = async () => { simdi = Number(BigInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp)) + 2; };
  await zamanTazele();
  const cagri = (from, to, data, deger) => ({ from, to, data, gas: "0x1c9c380", ...(deger ? { value: "0x" + deger.toString(16) } : {}) });
  const blok = (zaman, calls, ez) => ({ ...(ez ? { stateOverrides: ez } : {}), blockOverrides: { time: "0x" + zaman.toString(16) }, calls });
  const BOL = "0x" + (10n ** 24n).toString(16);
  const uzakMiktar = 1_000_000n * 10n ** 18n;
  /* the twin holder's redemption order as the token's adapter composes it: nonce, srcEid, amount, from, Istek */
  const istek = c.encode(["uint8", "uint32", "bytes32", "uint256", "address", "uint256"], [1, 26, zeroPadValue(YEDEK, 32), 0, YEDEK, 0]);
  const ilkBloklar = () => [
    blok(simdi + 2, [cagri(GONDEREN, H, I.encodeFunctionData("kur1", [adr]))],
      { [H]: { code: T.deployedBytecode, balance: BOL, nonce: "0x1" }, [Y]: { code: YA.deployedBytecode, balance: BOL }, [EP]: { balance: BOL } }),
    blok(simdi + 3, [cagri(GONDEREN, H, I.encodeFunctionData("kur2", [adr, hookInit, tuz]))]),
    blok(simdi + 5, [cagri(GONDEREN, H, I.encodeFunctionData("launch", []))]),
    blok(simdi + 80, [cagri(GONDEREN, H, I.encodeFunctionData("isle", []))]),
    blok(simdi + 90, [cagri(GONDEREN, H, I.encodeFunctionData("itfa", []))]),
  ];
  const sim1 = await rpc("eth_simulateV1", [{ blockStateCalls: ilkBloklar(), validation: false }, "latest"]);
  for (const [i, x] of sim1.entries()) if (x.calls[0].status !== "0x1") throw new Error("blok " + (i + 1) + " basarisiz: " + JSON.stringify(x.calls[0].error || x.calls[0]).slice(0, 400));
  const [hookAdr] = I.decodeFunctionResult("kur2", sim1[1].calls[0].returnData);
  const [token, kurucuToken] = I.decodeFunctionResult("launch", sim1[2].calls[0].returnData);
  const [s] = I.decodeFunctionResult("isle", sim1[3].calls[0].returnData);
  const [f] = I.decodeFunctionResult("itfa", sim1[4].calls[0].returnData);
  const b = (x) => BigInt(x);
  console.log("KURULUM");
  ok(hookAdr.toLowerCase() === hook.toLowerCase(), "hook CREATE2 ile cikarilan tuzla, bayraklari dogru adreste", hook);
  ok(token !== "0x0000000000000000000000000000000000000000" && b(kurucuToken) === 28n * 10n ** 24n, "launch yeni kapidan: 100 $ -> 28M token", tk(kurucuToken));
  console.log("VERGI ISLEMDE DEFTER'E (kova esigi yok)");
  ok(b(s.alinan) > 0n && b(s.satisDolar) > 0n, "2.000 $ alim ve hepsinin satisi", tk(s.alinan) + " token / " + d6(s.satisDolar) + " $");
  ok(b(s.kova) === 0n, "kovada dolar kalmadi: her islemin vergisi ayni islemde Defter'e gitti", d6(s.kova));
  ok(s.arcDolu && s.baseDolu, "iki satir da $50'yi gecti ve kasalarina gitti (Arc yerel, Base LayerZero + Circle)");
  ok(b(s.kasaUsdc) >= 50_000_000n && b(s.kasaIhale) === 1n, "Arc kasasi (Uniswap v3 yok): satirin dolari ihaleye", d6(s.kasaUsdc) + " $");
  ok(b(s.bekleyenSonra) < 50_000_000n, "Defter'de bekleyen dolar $50 altinda", d6(s.bekleyenSonra) + " $");
  console.log("ITFA (ucretli, kuyruk, bahsis)");
  ok(b(f.teklif) > 0n && b(f.emirSonra1) === b(f.emirOnce), "itfa eden Defter'in teklif ettigi ucreti gonderdi, Base emri ayni cagrida LayerZero ile gitti", d6(f.teklif) + " $");
  ok(b(f.iade) > 0n && b(f.iade) <= b(f.teklif) / 10n + 1n, "ucretin kullanilmayan marji iade adresine dondu", d6(f.iade) + " $");
  ok(b(f.arcPay) > 0n, "Arc payi (bekleyen dolar + Arc kasasinin dolari) aninda odendi", d6(f.arcPay) + " $");
  ok(b(f.emirSonra2) === b(f.emirSonra1) + 1n && b(f.bahsis) === 50_000n, "ucretsiz itfa geri donmedi; Base emri 0,05 $ bahsisle kuyrukta", d6(f.bahsis) + " $");
  ok(b(f.arzSonra) < b(f.arzOnce), "iki itfa da arzi dusurdu");

  /* blocks 6-7: a stranger sends the queued order; a twin holder redeems from another chain */
  const kapiAdr = getCreateAddress({ from: H, nonce: 7 });
  const defterAdr = getCreateAddress({ from: H, nonce: 1 });
  const sira = Number(b(f.emirSonra2) - 1n);
  const ikinciBloklar = () => [...ilkBloklar(),
    blok(simdi + 100, [cagri(GONDEREN, Y, IY.encodeFunctionData("gonder", [defterAdr, sira]))]),
    blok(simdi + 110, [cagri(GONDEREN, H, I.encodeFunctionData("uzakHazirla", [uzakMiktar]))]),
  ];
  await zamanTazele();
  const sim2 = await rpc("eth_simulateV1", [{ blockStateCalls: ikinciBloklar(), validation: false }, "latest"]);
  for (const [i, x] of sim2.entries()) if (x.calls[0].status !== "0x1") throw new Error("blok " + (i + 1) + " basarisiz: " + JSON.stringify(x.calls[0].error || x.calls[0]).slice(0, 400));
  const [net] = IY.decodeFunctionResult("gonder", sim2[5].calls[0].returnData);
  ok(b(net) === 50_000n - b(f.kuyrukUcret), "yabanci kuyruktaki emri ucretini odeyip gonderdi, bahsisi aldi", "bahsis 0,05 $ - ucret " + d6(f.kuyrukUcret) + " $");
  const [adapter] = I.decodeFunctionResult("uzakHazirla", sim2[6].calls[0].returnData);
  const mesaj = solidityPacked(["uint64", "uint32", "uint256", "bytes32", "bytes"], [1, 30184, uzakMiktar, zeroPadValue(YEDEK, 32), istek]);
  const deger = 10n ** 18n;   // $1 of Arc's native dollar: the fee budget, the rest comes back
  await zamanTazele();
  const blocks3 = [...ikinciBloklar(),
    blok(simdi + 120, [{ ...cagri(EP, kapiAdr, IK.encodeFunctionData("lzCompose", [adapter, "0x" + "11".repeat(32), mesaj, EP, "0x"]), deger), gas: "0x1a00000" },
      { ...cagri(GONDEREN, H, I.encodeFunctionData("uzakSonuc", [YEDEK])), gas: "0x200000" }]),
  ];
  const sim3 = await rpc("eth_simulateV1", [{ blockStateCalls: blocks3, validation: false }, "latest"]);
  const son = sim3[7];
  if (son.calls[0].status !== "0x1") throw new Error("uzak itfa basarisiz: " + JSON.stringify(son.calls[0].error || son.calls[0]).slice(0, 400));
  const [emir, yedekUsdc, arz, kapiToken] = I.decodeFunctionResult("uzakSonuc", son.calls[1].returnData);
  const once = I.decodeFunctionResult("itfa", sim1[4].calls[0].returnData)[0];
  ok(b(emir) === b(once.emirSonra2) && b(kapiToken) === 0n, "uzak ikiz sahibinin itfasi: compose degeri ucreti odedi, Base emri kuyruga girmeden gitti");
  ok(b(yedekUsdc) >= 1_000_000n - (b(once.teklif) * 12n) / 10n, "1 $ compose degerinden ucret dustu, artani + Arc payi yedek adrese (Arc)", d6(yedekUsdc) + " $");
  ok(b(arz) < b(once.arzSonra), "uzak itfa arzi dusurdu");
  const boy = (x) => (art(x).deployedBytecode.length - 2) / 2;
  const boylar = ["SepetDefteri", "SepetKasasi", "SepetUcu", "PulseLaunchpad5", "PulseHook5", "MerkezKapi", "LaunchEmaneti"].map((x) => [x, boy(x)]);
  ok(boylar.every(([, v]) => v < 24576), "hepsi dagitilabilir boyutta", boylar.map(([k, v]) => k + " " + v).join(", "));
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
