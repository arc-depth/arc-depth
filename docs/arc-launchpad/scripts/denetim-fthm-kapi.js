"use strict";
/* ===========================================================================
 * denetim-fthm-kapi.js — one FTHM market across two chains, measured
 *
 *   node scripts/denetim-fthm-kapi.js
 *
 * Runs contracts/test/TestFTHMKapi.sol in one eth_call on Arc mainnet state.
 * Both FTHM pools sit on the live Uniswap v4 PoolManager, opened by the
 * unchanged TekYonluAcici; the Robinhood pool carries the real FTHMFarkHook
 * fed by the real FiyatElcisi; LayerZero is two queued endpoints that also
 * deliver OFT composes.
 *
 * Measured: buy on one chain and receive on the other; sell FTHM held on one
 * chain into the other chain's pool and receive that chain's dollar; a
 * minimum the pool cannot meet hands the FTHM over instead of stranding it;
 * a malformed payload returns the FTHM to its sender; nobody but the
 * endpoint relaying the OFT's compose can trigger a sale; the gates never
 * keep a balance; Robinhood supply equals what is locked on Arc after every
 * trip; and after the Arc price moves, a buy on the cheaper Robinhood pool
 * pays the gap to the vault, so its effective price is not below Arc's.
 *
 * Not covered: the real endpoint's fees, DVNs and executor (testnet, A3).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestFTHMKapi.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000F8";
const E18 = 10n ** 18n;

async function rpc(m, p) {
  for (let i = 1; ; i++) {
    const r = await fetch("https://rpc.mainnet.arc.io", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());
    if (r.result !== undefined) return r.result;
    if (!/rate limit/i.test(JSON.stringify(r.error)) || i > 6) throw new Error(JSON.stringify(r.error).slice(0, 400));
    await new Promise((ok) => setTimeout(ok, i * 10000));
  }
}

let gecti = 0, kaldi = 0;
function ok(kosul, ad, deger) {
  if (kosul) gecti++; else kaldi++;
  console.log((kosul ? "  ok   " : "  HATA ") + ad + (deger !== undefined ? "  (" + deger + ")" : ""));
}
const f = (x) => (Number(BigInt(x) * 1000n / E18) / 1000).toLocaleString("en-US");

/* dollars per FTHM from a sqrt price, given which side FTHM is on */
function fiyat(sqrtP, fthm0) {
  const p = (Number(BigInt(sqrtP)) / 2 ** 96) ** 2;
  return fthm0 ? p : 1 / p;
}

(async () => {
  const out = await rpc("eth_call", [{ to: H, data: I.encodeFunctionData("run", []), gas: "0x10000000" },
    "latest", { [H]: { code: T.deployedBytecode } }]);
  const [s] = I.decodeFunctionResult("run", out);
  const b = (x) => BigInt(x);

  console.log("FTHM KAPI  Arc (30417) <-> Robinhood (30416), gercek PoolManager");
  console.log("A) Arc'ta USDC ile al, Robinhood'da teslim al");
  ok(b(s.aAlinan) > 0n && b(s.aAliceRh) === b(s.aAlinan), "alici Robinhood'da aldigi kadar FTHM tutuyor", f(s.aAliceRh) + " FTHM");
  ok(s.aKapiBos, "kapilarda bakiye kalmadi");
  ok(s.aArzEsit, "Robinhood arzi == Arc'ta kilitli");

  console.log("B) Arc'taki FTHM'yi Robinhood havuzunda sat, USDG al");
  ok(b(s.bBobUsdg) > 0n, "alici Robinhood'da USDG aldi", f(s.bBobUsdg) + " USDG");
  ok(s.bKapiBos, "kapilarda bakiye kalmadi");
  ok(s.bArzEsit, "Robinhood arzi == Arc'ta kilitli");

  console.log("C) karsilanamayan asgari");
  ok(b(s.cDaveFthm) === 1_000_000n * E18 && b(s.cDaveUsdg) === 0n, "satis yerine FTHM aliciya teslim edildi", f(s.cDaveFthm) + " FTHM");
  ok(s.cKapiBos, "Robinhood kapisinda bir sey kalmadi");

  console.log("D) Robinhood'daki FTHM'yi Arc havuzunda sat, USDC al");
  ok(b(s.dCarolUsdc) > 0n, "alici Arc'ta USDC aldi", f(s.dCarolUsdc) + " USDC");
  ok(s.dKapiBos, "kapilarda bakiye kalmadi");
  ok(s.dArzEsit, "Robinhood arzi == Arc'ta kilitli");

  console.log("E) yetki");
  ok(s.eSahteFrom, "OFT'den gelmeyen compose reddedildi");
  ok(s.eSahteUcNokta, "uc nokta disindan lzCompose reddedildi");
  ok(s.eSatDisaridan, "sat() disaridan cagrilamiyor");
  ok(s.eIkinciBag, "karsi kapi ikinci kez baglanamiyor");

  console.log("F) bozuk yuk");
  ok(b(s.fGeriDonen) === 500n * E18, "FTHM gonderene geri dondu", f(s.fGeriDonen) + " FTHM");
  ok(s.fKapiBos, "kapida bir sey kalmadi");

  console.log("G) tek fiyat");
  const arc = fiyat(s.gArcSqrtP, s.gArcFthm0);
  const rhOnce = fiyat(s.gRhSqrtP, s.gRhFthm0);
  const etkin = Number(b(s.gRhGiren)) / Number(b(s.gRhCikan));
  ok(b(s.gUcretOnce) === 0n && b(s.gKasa) > 0n, "ucuz taraftaki alim farki kasaya odedi", f(s.gKasa) + " FTHM");
  ok(rhOnce < arc, "Robinhood havuzu Arc'tan ucuzdu", rhOnce.toExponential(4) + " < " + arc.toExponential(4));
  ok(etkin >= arc * 0.995, "Robinhood'daki etkin alim fiyati Arc fiyatinin altina inmedi",
    etkin.toExponential(4) + " vs Arc " + arc.toExponential(4));
  ok(b(s.arzSon) === b(s.kilitliSon), "son durumda da Robinhood arzi == Arc'ta kilitli", f(s.arzSon) + " FTHM");

  const art = JSON.parse(fs.readFileSync(path.join(KOK, "build", "FTHMKapi.json"), "utf8"));
  const boy = (art.deployedBytecode.length - 2) / 2;
  ok(boy < 24576, "FTHMKapi dagitilabilir boyutta", boy + " bayt");

  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
