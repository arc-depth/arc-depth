"use strict";
/* ===========================================================================
 * denetim-v4-canli.js — the DEPLOYED v4 basket set, end to end, nothing sent
 *
 *   node scripts/denetim-v4-canli.js
 *
 * Every call goes to the live contracts in dagitim-v4.json, in eth_simulateV1
 * blocks on Arc mainnet state (one call per block where it matters, 30M gas
 * each); the three test addresses get their dollars only inside the
 * simulation (stateOverrides). Then the LayerZero messages the simulated Arc
 * calls emit toward Base are taken byte for byte and delivered, again in a
 * simulation, to the live Base HaberciLZ from the endpoint's address, with
 * the dollars Circle's forwarding would have minted placed by a storage
 * override (Base USDC keeps balances at slot 9).
 *
 *   1  launch: FTHM/Arc $4, WETH/Base $50 (reaches its vault at once), SOL,
 *      SUI, APT $4; no twins. Variants: tax 5%, EVM twins at 6.3M gas.
 *   2  a buy inside the first 5 seconds (snipe tax), a $40,000 buy, a large
 *      sale (whale shield); the tax reaches the Defter in the same trade.
 *   3  lines crossing $50 through that tax go to their vaults in the trade.
 *   4  the founder's income (KurucuVekili.ilet).
 *   5  redemption with the quoted fee (Defter.itfaUcreti, SepetUcu.itfaUcretli):
 *      waiting dollars paid at once, the Base order sent, the margin back;
 *      a redemption without fee is queued; a third address sends it and
 *      takes the tip.
 *   6  Base: the AL order bought WETH from Uniswap v3 within its bound, with
 *      the gas the executor is given (1.6M); the SAT order paid the holder.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface, AbiCoder, keccak256, zeroPadValue, solidityPacked, toUtf8Bytes, toBeHex, decodeBase58, getAddress } = require("ethers");

const KOK = path.join(__dirname, "..");
/* CANLI_KAYIT: the record of the live set to test (default v4) */
const V4 = JSON.parse(fs.readFileSync(process.env.CANLI_KAYIT || path.join(KOK, "dagitim-v4.json"), "utf8"));
const S = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "sepet-v2.json"), "utf8"));
const A4 = V4.zincir.arc, B4 = V4.zincir.base;
const art = (n) => new Interface(JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8")).abi);
const IK = art("MerkezKapi"), ID = art("SepetDefteri"), IU = art("SepetUcu"), IV = art("KurucuVekili"), IH = art("PulseHook5"),
  IKS = art("SepetKasasi"), IHL = art("HaberciLZ");
const IEP = new Interface(["event PacketSent(bytes encodedPayload, bytes options, address sendLibrary)"]);
const IE = new Interface(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const c = AbiCoder.defaultAbiCoder();
const USDC = "0x3600000000000000000000000000000000000000";
const FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const ARC_EP = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B";
const BASE_EP = "0x1a44076050125825900e736c501f859c50fE728c";
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BASE_WETH = "0x4200000000000000000000000000000000000006";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const K = "0x00000000000000000000000000000000000f00d1";   // founder
const A = "0x00000000000000000000000000000000000a11ce";   // trader / holder
const C3 = "0x0000000000000000000000000000000000c0ffee";  // third party
const SUI_TIP = "0".repeat(63) + "2::sui::SUI";
const BOL = "0x" + (10n ** 24n).toString(16);
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const b32 = (a) => zeroPadValue(a, 32);
const d6 = (x) => (Number(BigInt(x)) / 1e6).toFixed(4);
const tk = (x) => Math.round(Number(BigInt(x) / 10n ** 18n)).toLocaleString("en-US");

const rpcOf = (url) => async (m, p) => {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
      if (r.error) throw new Error(m + ": " + JSON.stringify(r.error).slice(0, 600));
      return r.result;
    } catch (e) { if (i >= 2 || /execution|revert/i.test(e.message)) throw e; await new Promise((ok) => setTimeout(ok, 1500)); }
  }
};
const arc = rpcOf(process.env.ARC_RPC || "https://arc-rpc.publicnode.com");
const base = rpcOf(process.env.BASE_RPC || "https://mainnet.base.org");
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { if (k) gecti++; else kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); return k; };
/* the block holds 30M gas: small calls get 300k, quotes 3M, the heavy one 27M (cagriA) */
const cagri = (from, to, data, deger, gaz = 300_000) => ({ from, to, data, gas: "0x" + gaz.toString(16), ...(deger ? { value: "0x" + BigInt(deger).toString(16) } : {}) });
const cagriA = (from, to, data, deger) => cagri(from, to, data, deger, 27_000_000);
/* `dt`: seconds after the chain's latest block, fixed when the simulation runs (the chain moves on between runs) */
const blok = (dt, calls, ez) => ({ dt, ...(ez ? { stateOverrides: ez } : {}), calls });
const sim = async (rpc, bloklar) => {
  const t = Number(BigInt((await rpc("eth_getBlockByNumber", ["latest", false])).timestamp)) + 5;
  const b = bloklar.map(({ dt, ...x }) => ({ ...x, blockOverrides: { time: "0x" + (t + dt).toString(16) } }));
  return rpc("eth_simulateV1", [{ blockStateCalls: b, validation: false }, "latest"]);
};
/* logs of one call, decoded with every interface that knows them */
const coz = (logs) => logs.map((l) => {
  for (const [ad, I] of [["kapi", IK], ["defter", ID], ["ucu", IU], ["vekil", IV], ["hook", IH], ["kasa", IKS], ["haberci", IHL], ["ep", IEP]]) {
    try { const p = I.parseLog(l); if (p) return { ad, isim: p.name, args: p.args, adres: l.address }; } catch (e) { /* not this one */ }
  }
  return { ad: "?", isim: "?", adres: l.address, topics: l.topics };
});
const bul = (logs, isim, ad) => coz(logs).filter((x) => x.isim === isim && (!ad || x.ad === ad));

(async () => {
  console.log("V4 CANLI  zincirdeki v4 seti, uctan uca (eth_simulateV1, gonderim yok)");
  console.log("  Arc: kapi " + A4.MerkezKapi + "  Defter " + A4.SepetDefteri + "  Ucu " + A4.SepetUcu + "  Base kasa " + B4.SepetKasasi);
  ok(S.surum === 4 && S.defter === A4.SepetDefteri && S.kapi === A4.MerkezKapi, "site yapilandirmasi v4 setini gosteriyor", "surum " + S.surum);

  /* starting quotes (they only seed auctions): FTHM from the Arc pool, the rest from CoinGecko */
  const cg = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana,sui,aptos&vs_currencies=usd").then((x) => x.json()).catch(() => null);
  const fiyat = { ethereum: cg ? cg.ethereum.usd : 3000, solana: cg ? cg.solana.usd : 150, sui: cg ? cg.sui.usd : 1, aptos: cg ? cg.aptos.usd : 1 };
  const SEPET = [
    { ad: "FTHM Arc", z: 26, v: b32(FTHM), dolar: 4_000_000n, birim: 266_000n * 10n ** 18n },
    { ad: "WETH Base", z: 6, v: b32(BASE_WETH), dolar: 50_000_000n, birim: BigInt(Math.floor((50 / fiyat.ethereum) * 1e18)) },
    { ad: "SOL Solana", z: 5, v: toBeHex(decodeBase58("So11111111111111111111111111111111111111112"), 32), dolar: 4_000_000n, birim: BigInt(Math.floor((4 / fiyat.solana) * 1e9)) },
    { ad: "SUI Sui", z: 8, v: keccak256(toUtf8Bytes(SUI_TIP)), dolar: 4_000_000n, birim: BigInt(Math.floor((4 / fiyat.sui) * 1e9)), tip: SUI_TIP },
    { ad: "APT Aptos", z: 9, v: b32("0x0a"), dolar: 4_000_000n, birim: BigInt(Math.floor((4 / fiyat.aptos) * 1e8)) },
  ];
  const ALIM = 100_000_000n, teminat = SEPET.reduce((n, s) => n + s.dolar, 0n), toplam = ALIM + teminat;
  const istek = (vergiPpm, ikizler, ikizUcret) => ["V4 Canli Prova", "V4CP", SEPET.map((s) => [s.z, s.v, s.dolar]), SEPET.map((s) => s.birim), vergiPpm, ALIM,
    b32(K), 26, 0, ikizler, sec(6_300_000n), ikizUcret, sec(100_000n), K, SEPET.map((s) => s.tip || ""), [], 0n];
  const ez = { [K]: { balance: BOL }, [A]: { balance: BOL }, [C3]: { balance: BOL } };
  const launchBlok = (vergiPpm = 20_000n, ikizler = [], ikizUcret = 0n) => blok(0, [
    cagri(K, USDC, IE.encodeFunctionData("approve", [A4.MerkezKapi, toplam])),
    cagriA(K, A4.MerkezKapi, IK.encodeFunctionData("launch", [istek(vergiPpm, ikizler, ikizUcret)]), ikizUcret)], ez);

  /* ---- 1 launch, and its variants ---- */
  console.log("\n1) launch");
  const r0 = await sim(arc, [launchBlok()]);
  const L = r0[0].calls[1];
  if (!ok(L.status === "0x1", "launch (vergi %2, ikiz yok) gecti", "gaz " + BigInt(L.gasUsed))) { console.log("  " + JSON.stringify(L.error || L.returnData).slice(0, 400)); process.exit(1); }
  const token = getAddress(c.decode(["address"], L.returnData)[0]);
  console.log("  token " + token);
  const kayit = bul(L.logs, "Kayit", "defter")[0];
  ok(!!kayit, "Defter launch'i kaydetti", kayit ? "id " + kayit.args.id + ", " + kayit.args.kalem + " satir, $" + d6(kayit.args.dolar) : "");
  const gidenLaunch = bul(L.logs, "Gonderildi", "defter");
  ok(gidenLaunch.some((g) => Number(g.args.zincir) === 6), "WETH/Base satiri ($50) launch'ta kasasina gitti", gidenLaunch.map((g) => g.args.zincir + ":$" + d6(g.args.dolar)).join(" "));
  const pkLaunch = bul(L.logs, "PacketSent");
  ok(pkLaunch.length >= 1, "launch'ta LayerZero paketi cikti (Base emri)", pkLaunch.length + " paket");
  const id = kayit ? kayit.args.id : 0n;
  const r5 = await sim(arc, [launchBlok(50_000n)]);
  ok(r5[0].calls[1].status === "0x1", "varyant: vergi %5", "gaz " + BigInt(r5[0].calls[1].gasUsed));
  const EVM = [30416, 30184, 30110, 30102, 30106, 30390, 30367];
  const ikizUcretRes = await arc("eth_call", [{ to: YAYICI, data: new Interface(["function ucret(address,uint32[],bytes) view returns (uint256)"]).encodeFunctionData("ucret", [FTHM, EVM, sec(6_300_000n)]) }, "latest"]);
  const ikizUcret = (BigInt(ikizUcretRes) * 11n) / 10n;
  const rT = await sim(arc, [launchBlok(20_000n, EVM, ikizUcret)]);
  ok(rT[0].calls[1].status === "0x1", "varyant: 7 EVM ikizi, 6,3M gaz secenegi", "LZ $" + (Number(ikizUcret) / 1e18).toFixed(2) + ", " + bul(rT[0].calls[1].logs, "PacketSent").length + " paket");

  /* ---- 2-4 trades, tax, founder income ---- */
  const ml = bul(L.logs, "MerkezLaunch", "kapi")[0];
  const vekil = ml ? getAddress(ml.args.vekil) : null;
  /* the launch's tax bucket (VergiKovasi): the hook pays the tax there and asks it to pass it on */
  const lpI = new Interface(["function launchCount() view returns (uint256)", "function launchAt(uint256) view returns ((address token,address acici,address kasa,uint256 teminat,address kurucu,uint256 kurucuToken,uint256 teklif,uint256 vergiPpm,uint64 zaman))"]);
  const islemler = [
    launchBlok(),
    blok(1, [cagri(A, USDC, IE.encodeFunctionData("approve", [A4.MerkezKapi, 10n ** 15n])),
      cagriA(A, A4.MerkezKapi, IK.encodeFunctionData("al", [token, 10_000_000n, 0n, 0, b32(A), "0x", A]))]),
    blok(30, [cagriA(A, A4.MerkezKapi, IK.encodeFunctionData("al", [token, 40_000_000_000n, 0n, 0, b32(A), "0x", A]))]),
    blok(31, [cagri(A, token, IE.encodeFunctionData("balanceOf", [A]))]),
  ];
  console.log("\n2-3) alim, satis, vergi");
  let r = await sim(arc, islemler);
  const snipe = r[1].calls[1];
  ok(snipe.status === "0x1" && bul(snipe.logs, "SnipeKesildi").length === 1, "ilk 5 saniyede alim: snipe vergisi kesildi",
    bul(snipe.logs, "SnipeKesildi").map((x) => "oran " + (Number(x.args[2] ?? x.args.oran) / 1e4).toFixed(2) + "%").join(""));
  ok(bul(snipe.logs, "Vergi").length >= 1, "snipe'li alimda vergi ayni islemde Defter'e ulasti", bul(snipe.logs, "Vergi").map((v) => "$" + d6(v.args.dolar)).join(" "));
  const buyuk = r[2].calls[0];
  ok(buyuk.status === "0x1", "$40.000 alim gecti", "gaz " + BigInt(buyuk.gasUsed));
  const vB = bul(buyuk.logs, "Vergi");
  ok(vB.length >= 1 && vB.some((v) => BigInt(v.args.dolar) >= 700_000_000n), "$40.000 alimin vergisi ayni islemde Defter'de", vB.map((v) => "$" + d6(v.args.dolar)).join(" "));
  const gB = bul(buyuk.logs, "Gonderildi", "defter");
  ok(gB.length >= 4, "vergiyle $50'yi gecen satirlar ayni islemde kasalarina gitti", gB.map((g) => g.args.zincir + ":$" + d6(g.args.dolar)).join(" "));
  ok(bul(buyuk.logs, "Bekletildi", "defter").length === 0, "hicbir satir gonderilemeyip beklemedi", bul(buyuk.logs, "Bekletildi", "defter").map((b) => b.args.zincir).join(","));
  const pkB = bul(buyuk.logs, "PacketSent").length;
  console.log("       (bu islemde " + pkB + " LayerZero paketi, " + buyuk.logs.filter((l) => l.address.toLowerCase() === "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d").length + " Circle yakimi)");
  const bakiyeA = BigInt(r[3].calls[0].returnData);
  /* the bucket: what the hook could not pass on inside the trade (KOVA_GAZ 1.5M), pushed by anyone */
  const n0 = BigInt(await arc("eth_call", [{ to: A4.PulseLaunchpad5, data: lpI.encodeFunctionData("launchCount", []) }, "latest"]));
  islemler.push(blok(33, [cagri(A, A4.PulseLaunchpad5, lpI.encodeFunctionData("launchAt", [n0]), 0, 1_000_000)]));
  r = await sim(arc, islemler);
  islemler.pop();
  const kova = getAddress(lpI.decodeFunctionResult("launchAt", r[4].calls[0].returnData)[0].kasa);
  /* the page finds the bucket from the token alone: havuzAnahtari -> pool id -> launchIdOfPool -> launchAt.kasa */
  const lpK = new Interface(["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))", "function launchIdOfPool(bytes32) view returns (uint256)"]);
  islemler.push(blok(33, [cagri(A, A4.PulseLaunchpad5, lpK.encodeFunctionData("havuzAnahtari", [token]), 0, 1_000_000)]));
  r = await sim(arc, islemler);
  islemler.pop();
  const hk = lpK.decodeFunctionResult("havuzAnahtari", r[4].calls[0].returnData)[0];
  const pid = keccak256(c.encode(["address", "address", "uint24", "int24", "address"], [hk[0], hk[1], hk[2], hk[3], hk[4]]));
  islemler.push(blok(33, [cagri(A, A4.PulseLaunchpad5, lpK.encodeFunctionData("launchIdOfPool", [pid]), 0, 1_000_000)]));
  r = await sim(arc, islemler);
  islemler.pop();
  /* launchIdOfPool counts from 1, launchAt from 0 */
  ok(BigInt(r[4].calls[0].returnData) === n0 + 1n, "sayfanin kova aramasi dogru launch'i buluyor (havuz kimliginden, 1'den sayar)", "launchIdOfPool " + BigInt(r[4].calls[0].returnData) + " -> launchAt(" + n0 + "), kova " + kova);
  islemler.push(blok(34, [cagri(A, USDC, IE.encodeFunctionData("balanceOf", [kova])),
    cagriA(C3, kova, new Interface(["function gonder()"]).encodeFunctionData("gonder", [])),
    cagri(A, USDC, IE.encodeFunctionData("balanceOf", [kova]))]));
  r = await sim(arc, islemler);
  const kb = r[4].calls, kovaOnce = BigInt(kb[0].returnData), kovaSonra = BigInt(kb[2].returnData);
  ok(kovaOnce === 0n, "kovada vergi kalmadi (hook ayni islemde Defter'e gecirdi)", "kovada $" + d6(kovaOnce) + " bekliyor");
  ok(kb[1].status === "0x1" && kovaSonra === 0n, "kovayi herkes elle bosaltabiliyor", "VergiKovasi.gonder gaz " + BigInt(kb[1].gasUsed) +
    ", $50'yi gecen satir gonderimi " + bul(kb[1].logs, "Gonderildi", "defter").map((g) => g.args.zincir + ":$" + d6(g.args.dolar)).join(" "));
  console.log("  A'nin tokeni " + tk(bakiyeA));

  /* whale-shield sale, founder income, then the redemption quote */
  const satis = (bakiyeA * 3n) / 10n;
  islemler.push(
    blok(40, [cagri(A, token, IE.encodeFunctionData("approve", [A4.MerkezKapi, satis])),
      cagriA(A, A4.MerkezKapi, IK.encodeFunctionData("satArc", [token, satis, 0n, 26, b32(A), 0n]))]),
    blok(41, [cagri(A, token, IE.encodeFunctionData("balanceOf", [A])), cagri(A, USDC, IE.encodeFunctionData("balanceOf", [vekil || A]))]));
  r = await sim(arc, islemler);
  const sat = r[5].calls[1];
  ok(sat.status === "0x1", "buyuk satis (" + tk(satis) + " token) gecti", "gaz " + BigInt(sat.gasUsed));
  const vS = bul(sat.logs, "Vergi"), uS = bul(sat.logs, "Ucret");
  ok(vS.length >= 1, "satisin vergisi (kalkan dahil) ayni islemde Defter'de", vS.map((v) => "$" + d6(v.args.dolar)).join(" "));
  if (uS.length) {
    const u = uS[0].args, iki = ["kurucu", "gelistirici", "likidite", "isletme", "derinlik"].reduce((n, k) => n + Number(u[k]), 0);
    ok(Number(u.vergi) / iki > 1.5, "balina kalkani: satisin vergisi %2'nin uzerinde", "vergi/ucret orani " + (Number(u.vergi) / iki).toFixed(2) + " (%2 vergide ~0,91)");
  }
  const kalanA = BigInt(r[6].calls[0].returnData), vekilBak = BigInt(r[6].calls[1].returnData);
  ok(vekil && vekilBak > 0n, "kurucu vekilinde islem payi birikti", "$" + d6(vekilBak));
  if (vekil) {
    islemler.push(blok(45, [cagriA(C3, vekil, IV.encodeFunctionData("ilet", [0n])), cagri(C3, USDC, IE.encodeFunctionData("balanceOf", [K]))]));
  }
  /* views on the state after the trades */
  const R1 = kalanA / 10n, R2 = 1_000n * 10n ** 18n;   /* R2: a share too small to pay the fee -> queued */
  islemler.push(blok(50, [
    cagri(A, A4.SepetDefteri, ID.encodeFunctionData("itfaUcreti", [id, R1, 26, b32(A)]), 0, 3_000_000),
    cagri(A, A4.SepetDefteri, ID.encodeFunctionData("beklemede", [id])),
    cagri(A, A4.SepetDefteri, ID.encodeFunctionData("emirSayisi", [])),
    ...[26, 6, 5, 8, 9].map((z) => cagri(A, A4.SepetDefteri, ID.encodeFunctionData("kasaDolu", [id, z]))),
    cagri(A, USDC, IE.encodeFunctionData("balanceOf", [A]))]));
  r = await sim(arc, islemler);
  if (vekil) {
    const il = r[7].calls[0];
    ok(il.status === "0x1" && bul(il.logs, "Iletildi").length === 1, "kurucu geliri (KurucuVekili.ilet) kurucuya gitti", bul(il.logs, "Iletildi").map((x) => "$" + d6(x.args[2] ?? x.args.miktar)).join(""));
  }
  const g = r[r.length - 1].calls;
  const ucret = BigInt(g[0].returnData), bekleyenOnce = BigInt(g[1].returnData), emirOnce = BigInt(g[2].returnData);
  const dolu = g.slice(3, 8).map((x, i) => [26, 6, 5, 8, 9][i] + ":" + (BigInt(x.returnData) ? "dolu" : "bos"));
  const usdcA0 = BigInt(g[8].returnData);
  console.log("  kasalar " + dolu.join(" ") + "   Defter'de bekleyen $" + d6(bekleyenOnce) + "   kuyruk " + emirOnce);
  ok(ucret > 0n, "itfa ucreti teklif edildi (Defter.itfaUcreti)", "$" + d6(ucret) + " — " + tk(R1) + " token icin");

  /* ---- 5 redemption: with the quoted fee (+10%), then without fee, then a third party sends the queue ---- */
  console.log("\n5) itfa");
  const marj = (ucret * 11n) / 10n;
  islemler.push(
    blok(60, [cagri(A, token, IE.encodeFunctionData("approve", [A4.SepetUcu, R1 + R2])), cagri(A, USDC, IE.encodeFunctionData("approve", [A4.SepetUcu, marj])),
      cagri(A, USDC, IE.encodeFunctionData("balanceOf", [A4.SepetUcu])), cagri(A, USDC, IE.encodeFunctionData("balanceOf", [A4.HaberciLZ])),
      cagriA(A, A4.SepetUcu, IU.encodeFunctionData("itfaUcretli", [token, R1, 26, b32(A), marj, A])),
      cagri(A, USDC, IE.encodeFunctionData("balanceOf", [A])),
      cagri(A, USDC, IE.encodeFunctionData("balanceOf", [A4.SepetUcu])), cagri(A, USDC, IE.encodeFunctionData("balanceOf", [A4.HaberciLZ]))]),
    blok(70, [cagriA(A, A4.SepetUcu, IU.encodeFunctionData("itfa", [token, R2, 26, b32(A)])),
      cagri(A, A4.SepetDefteri, ID.encodeFunctionData("emirSayisi", []))]));
  r = await sim(arc, islemler);
  const b6 = r[r.length - 2].calls, i1 = b6[4], i2 = r[r.length - 1].calls[0];
  ok(i1.status === "0x1", "ucretli itfa gecti", i1.status === "0x1" ? "gaz " + BigInt(i1.gasUsed) : JSON.stringify(i1.error).slice(0, 300));
  const it1 = bul(i1.logs, "Itfa", "defter")[0];
  const usdcA1 = BigInt(b6[5].returnData);
  const pay = it1 ? BigInt(it1.args.vergiPayi) : 0n;
  ok(!!it1 && (pay > 0n || bekleyenOnce === 0n), "Defter'de bekleyen dolardan pay aninda odendi", "$" + d6(pay) + " (Defter'de bekleyen $" + d6(bekleyenOnce) + ")");
  const giden = bul(i1.logs, "EmirGitti"), bekleyen1 = bul(i1.logs, "EmirBekliyor");
  const harcanan = giden.reduce((n, e) => n + BigInt(e.args.ucret), 0n);
  ok(giden.length >= 1 && bekleyen1.length === 0, "dolu kasalara emir gitti, kuyruga bir sey dusmedi", giden.map((e) => e.args.zincir + ":$" + d6(e.args.ucret)).join(" "));
  const pk1 = bul(i1.logs, "PacketSent");
  ok(pk1.length >= 1, "itfa emri LayerZero paketiyle cikti", pk1.length + " paket");
  const ucuFark = BigInt(b6[6].returnData) - BigInt(b6[2].returnData), habFark = BigInt(b6[7].returnData) - BigInt(b6[3].returnData);
  /* the fee is rounded up to the 6-decimal dollar: at most one unit per order stays with the Haberci */
  ok(harcanan <= marj && ucuFark === 0n && habFark >= 0n && habFark <= BigInt(giden.length), "ucret itfa edenden alindi, artani iade edildi (Ucu ve Haberci'de para kalmadi)",
    "Ucu farki " + ucuFark + ", Haberci yuvarlama tozu " + habFark + " birim" + ", verilen $" + d6(marj) + ", harcanan $" + d6(harcanan) + ", A'nin net degisimi $" + d6(usdcA1 - usdcA0) + " (Arc kasasinin odemesi dahil)");
  ok(i2.status === "0x1", "ucretsiz itfa geri donmedi", i2.status === "0x1" ? "gaz " + BigInt(i2.gasUsed) : JSON.stringify(i2.error).slice(0, 300));
  const kuyruk = bul(i2.logs, "EmirBekliyor");
  ok(kuyruk.length >= 1, "ucretsiz itfanin emirleri kuyruga girdi", kuyruk.map((e) => "#" + e.args.emir + " " + e.args.zincir + " bahsis $" + d6(e.args.bahsis)).join(" "));
  const emirSay = BigInt(r[r.length - 1].calls[1].returnData);
  if (kuyruk.length) {
    const e0 = BigInt(kuyruk[0].args.emir);
    islemler.push(blok(80, [cagri(C3, A4.SepetDefteri, ID.encodeFunctionData("emirUcreti", [e0]), 0, 3_000_000)]));
    r = await sim(arc, islemler);
    const eu = BigInt(r[r.length - 1].calls[0].returnData);
    islemler.pop();
    islemler.push(blok(80, [cagri(C3, USDC, IE.encodeFunctionData("balanceOf", [C3])),
      cagri(C3, USDC, IE.encodeFunctionData("approve", [A4.SepetDefteri, eu])),
      cagriA(C3, A4.SepetDefteri, ID.encodeFunctionData("emirGonder", [e0])),
      cagri(C3, USDC, IE.encodeFunctionData("balanceOf", [C3]))]));
    r = await sim(arc, islemler);
    const son = r[r.length - 1].calls, eg = son[2];
    const gon = bul(eg.logs, "EmirGonderildi")[0];
    ok(eg.status === "0x1" && !!gon, "ucuncu kisi kuyruktaki emri gonderdi", gon ? "ucret $" + d6(gon.args.ucret) + ", bahsis $" + d6(gon.args.bahsis) : JSON.stringify(eg.error).slice(0, 300));
    const fark = BigInt(son[3].returnData) - BigInt(son[0].returnData);
    ok(gon && fark === BigInt(gon.args.bahsis) - BigInt(gon.args.ucret), "gonderen ucreti odedi, bahsisi aldi", "net $" + d6(fark));
  }
  console.log("  kuyruk " + emirOnce + " -> " + emirSay);

  /* ---- 6 Base: the AL order and the SAT order, delivered from the endpoint ---- */
  console.log("\n6) Base: emirlerin teslimi (canli Base HaberciLZ ve v4 kasasi)");
  const paket = (enc) => {
    const h = enc.slice(2);
    return { nonce: BigInt("0x" + h.slice(2, 18)), srcEid: parseInt(h.slice(18, 26), 16), sender: "0x" + h.slice(26, 90), dstEid: parseInt(h.slice(90, 98), 16),
      receiver: "0x" + h.slice(122, 162), guid: "0x" + h.slice(162, 226), message: "0x" + h.slice(226) };
  };
  const baseyaAL = pkLaunch.map((x) => paket(x.args.encodedPayload)).filter((p) => p.dstEid === 30184);
  const baseyaSAT = pk1.map((x) => paket(x.args.encodedPayload)).filter((p) => p.dstEid === 30184);
  ok(baseyaAL.length === 1 && baseyaSAT.length === 1, "Arc'tan Base'e giden AL ve SAT paketleri bulundu", baseyaAL.length + " AL, " + baseyaSAT.length + " SAT");
  if (baseyaAL.length && baseyaSAT.length) {
    const HB = getAddress(baseyaAL[0].receiver);
    ok(HB.toLowerCase() === B4.HaberciLZ.toLowerCase(), "paketin alicisi Base HaberciLZ", HB);
    const [, , , miktar, beklenen] = c.decode(["bytes32", "bytes32", "bytes", "uint256", "uint256"], baseyaAL[0].message);
    console.log("  AL emri: $" + d6(miktar) + " gonderildi, Base'e varmasi beklenen $" + d6(beklenen));
    const slot = keccak256(c.encode(["address", "uint256"], [HB, 9]));
    const bOnce = BigInt(await base("eth_getStorageAt", [BASE_USDC, slot, "latest"]));
    const ezB = { [BASE_USDC]: { stateDiff: { [slot]: "0x" + (bOnce + BigInt(beklenen)).toString(16).padStart(64, "0") } } };
    const lz = (p) => IHL.encodeFunctionData("lzReceive", [[p.srcEid, p.sender, p.nonce], p.guid, p.message, BASE_EP, "0x"]);
    const kasaWeth = (adres) => cagri(A, BASE_WETH, IE.encodeFunctionData("balanceOf", [adres]));
    const rb = await sim(base, [
      blok(0, [kasaWeth(B4.SepetKasasi), { ...cagri(BASE_EP, HB, lz(baseyaAL[0])), gas: "0x186a00" }, kasaWeth(B4.SepetKasasi)], ezB),
      blok(2, [{ ...cagri(BASE_EP, HB, lz(baseyaSAT[0])), gas: "0x186a00" }, kasaWeth(B4.SepetKasasi)])]);
    const al = rb[0].calls[1];
    ok(al.status === "0x1", "AL emri Base'de 1,6M gazla teslim edildi", al.status === "0x1" ? "gaz " + BigInt(al.gasUsed) : JSON.stringify(al.error).slice(0, 300));
    const alindi = bul(al.logs, "Alindi", "kasa"), bek = bul(al.logs, "Bekliyor", "kasa");
    const wethArt = BigInt(rb[0].calls[2].returnData) - BigInt(rb[0].calls[0].returnData);
    if (alindi.length) {
      const birim = Number(BigInt(alindi[0].args.birim)) / 1e18, dolar = Number(BigInt(alindi[0].args.dolar)) / 1e6;
      ok(wethArt > 0n, "kasa WETH'i Uniswap v3'ten aldi", "$" + dolar.toFixed(2) + " -> " + birim.toFixed(6) + " WETH = $" + (dolar / birim).toFixed(2) + "/ETH (CoinGecko $" + fiyat.ethereum + ")");
      ok(Math.abs(dolar / birim / fiyat.ethereum - 1) < 0.03, "alim fiyati piyasanin %3 icinde", ((dolar / birim / fiyat.ethereum - 1) * 100).toFixed(2) + "%");
    } else ok(false, "kasa WETH aldi", bek.length ? "BEKLIYOR (fiyat sinirinda): $" + d6(bek[0].args.dolar) : JSON.stringify(coz(al.logs).map((x) => x.isim)));
    const satB = rb[1].calls[0];
    ok(satB.status === "0x1", "SAT (itfa) emri Base'de 1,6M gazla teslim edildi", satB.status === "0x1" ? "gaz " + BigInt(satB.gasUsed) : JSON.stringify(satB.error).slice(0, 300));
    const sl = bul(satB.logs, "Satildi", "kasa"), vr = bul(satB.logs, "Verildi", "kasa");
    const cctp = satB.logs.filter((l) => l.address.toLowerCase() === "0x28b5a0e9c621a5badaa536219b3a228c8168cf5d").length;
    ok(sl.length + vr.length >= 1, "itfa edenin payi Base'de odendi",
      sl.map((x) => "satildi " + (Number(BigInt(x.args.birim)) / 1e18).toFixed(6) + " WETH -> $" + d6(x.args.dolar)).join(" ") +
      vr.map((x) => " verildi " + (Number(BigInt(x.args.birim)) / 1e18).toFixed(6) + " WETH").join("") + (cctp ? ", Circle yakimi (Arc'a odeme)" : ""));
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exitCode = kaldi ? 1 : 0;
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
