"use strict";
/* ===========================================================================
 * dene-kopru-kanit.js — can a bridge notice still be forged?
 *
 *   node scripts/dene-kopru-kanit.js
 *
 * WHAT WAS BROKEN
 *   StockVault.release and WrappedStock.mint took the event id, the
 *   recipient and the amount as parameters from one relayer and checked
 *   none of them against anything. One key could empty the vault or mint
 *   without limit. StockVault's own comment claimed the recipient "travels
 *   with the notice" — it did not; it was a parameter.
 *
 * WHAT IS BEING TESTED
 *   Not that the happy path works — that is the easy half and a mock would
 *   pass it. The cases that matter are the forgeries, and each one here is
 *   a REAL signature over the wrong thing:
 *
 *     amount changed after signing   the defect itself, directly
 *     fewer than the threshold       one key is no longer enough
 *     signatures from outside the set
 *     the same signer counted twice
 *     the same notice replayed
 *     over the per-transaction cap
 *     over the window cap
 *
 *   Keys are real and fixed, so the run is reproducible. The digest binds
 *   the verifying contract's address, so the runner first asks the harness
 *   where its deployment lands and signs for that.
 *
 * Runs against the real Arc PoolManager's chain through eth_call. Nothing
 * is sent, nothing is deployed, no gas is paid.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, Interface, AbiCoder, keccak256, getBytes, getAddress } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const KOK = path.join(__dirname, "..");
const B = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestBridge.json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const KOSUM = "0x0000000000000000000000000000000000000E11";

/* Fixed keys: a reproducible run beats a fresh-random one that passes for
   a reason nobody can re-create. */
const ANAHTARLAR = [
  "0x1111111111111111111111111111111111111111111111111111111111111111",
  "0x2222222222222222222222222222222222222222222222222222222222222222",
  "0x3333333333333333333333333333333333333333333333333333333333333333"
];
const YABANCI_ANAHTAR = "0x9999999999999999999999999999999999999999999999999999999999999999";
const ALAN = keccak256(Buffer.from("ArcDepth.KopruKanit.v1"));

const ESIK = 2;
const KAYNAK_ZINCIR = 5042;
const E = 10n ** 18n;
const ISLEM_TAVANI = 100n * E;
const PENCERE = 3600n;
const PENCERE_TAVANI = 150n * E;

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(90000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}

const iface = new Interface(B.abi);
const cagir = async (fn, args) => {
  const r = await rpc("eth_call", [
    { from: "0x000000000000000000000000000000000000dEaD", to: KOSUM,
      data: iface.encodeFunctionData(fn, args), gas: "0x8000000" },
    "latest", { [KOSUM]: { code: B.deployedBytecode } }
  ]);
  return iface.decodeFunctionResult(fn, r);
};

/* The digest the contract computes, recomputed here independently. If this
   were derived from the contract the test would only prove it agrees with
   itself. */
function ozet(dogrulayan, olayId, to, miktar) {
  const h = keccak256(coder.encode(
    ["bytes32", "uint256", "address", "uint256", "bytes32", "address", "uint256"],
    [ALAN, CHAIN_ID, dogrulayan, KAYNAK_ZINCIR, olayId, to, miktar]));
  return getBytes(h);
}

/* Signatures must arrive ordered by signer address, strictly increasing —
   that is how the contract refuses a duplicate without a second mapping. */
async function imzala(cuzdanlar, dogrulayan, olayId, to, miktar) {
  const d = ozet(dogrulayan, olayId, to, miktar);
  const ciftler = [];
  for (const c of cuzdanlar) ciftler.push([c.address.toLowerCase(), await c.signMessage(d)]);
  ciftler.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return ciftler.map((x) => x[1]);
}

(async function main() {
  const cuzdanlar = ANAHTARLAR.map((k) => new Wallet(k));
  const yabanci = new Wallet(YABANCI_ANAHTAR);
  const imzacilar = cuzdanlar.map((c) => c.address);
  const KUR = { imzacilar, esik: ESIK, kaynakZincir: KAYNAK_ZINCIR,
                islemTavani: ISLEM_TAVANI, pencere: PENCERE, pencereTavani: PENCERE_TAVANI };
  const kur = [imzacilar, ESIK, KAYNAK_ZINCIR, ISLEM_TAVANI, PENCERE, PENCERE_TAVANI];

  let gecti = 0, kaldi = 0;
  const ok = (k, ad, not) => {
    if (k) gecti++; else kaldi++;
    console.log("  " + (k ? "PASS" : "FAIL") + " " + ad + (not ? "   " + not : ""));
  };

  console.log("KOPRU KANITI — gercek imzalarla, zincire hicbir sey gitmiyor");
  console.log("");
  console.log("  imzacilar  " + imzacilar.length + ", esik " + ESIK);
  console.log("  tavanlar   islem " + (ISLEM_TAVANI / E) + "  pencere " +
    (PENCERE_TAVANI / E) + " / " + PENCERE + "s");
  console.log("");

  /* Where the harness's deployment lands, so the digest can bind it. */
  const [stokA, kasaA, sarmalA] = await cagir("adresler", [kur]);
  console.log("  kasa    " + kasaA);
  console.log("  sarmal  " + sarmalA);
  console.log("");

  const BOB = "0x0000000000000000000000000000000000000B0B";
  /* address(0xA11CE) in the harness: five hex digits, left-padded to
     forty. Slicing a hand-typed string lost one and produced an invalid
     address — let the library pad and checksum it. */
  const ALICE = getAddress("0x" + "A11CE".padStart(40, "0"));
  const idDogru = keccak256(Buffer.from("burn-dogru"));
  const idTavan = keccak256(Buffer.from("burn-tavan"));
  const idBurn1 = keccak256(Buffer.from("burn-1"));

  /* ---- 1. the split, ending in a signed release -------------------- */
  const MIK = 100n * E;
  const PAY = MIK / 2n;
  const imzaBolunme = await imzala(cuzdanlar.slice(0, 2), kasaA, idBurn1, BOB, PAY);
  const [b] = await cagir("runBolunme", [kur, MIK, PAY, imzaBolunme]);
  ok(BigInt(b.payOnce) === MIK, "ilk kilit 1:1 pay veriyor", BigInt(b.payOnce).toString());
  ok(BigInt(b.paySonra) === BigInt(b.payOnce), "hisse bolunmesi pay sayisini DEGISTIRMIYOR");
  ok(BigInt(b.fiyatSonra) === BigInt(b.fiyatOnce) * 2n, "bolunme pay fiyatini ikiye katladi");
  ok(BigInt(b.cekilen) === MIK, "IMZALI cekim bolunme sonrasi iki kat hisse getirdi",
     (Number(BigInt(b.cekilen)) / 1e18).toFixed(0));

  /* ---- 2. every way a notice can be wrong -------------------------- */
  const PAY2 = 10n * E;
  const TAVAN_USTU = ISLEM_TAVANI + 1n;
  const dogru = await imzala(cuzdanlar.slice(0, 2), kasaA, idDogru, BOB, PAY2);
  const az = await imzala(cuzdanlar.slice(0, 1), kasaA, idDogru, BOB, PAY2);
  const yab = await imzala([yabanci, cuzdanlar[0]], kasaA, idDogru, BOB, PAY2);
  const cift = await (async () => {
    const d = ozet(kasaA, idDogru, BOB, PAY2);
    const s = await cuzdanlar[0].signMessage(d);
    return [s, s];
  })();
  const tavanUstu = await imzala(cuzdanlar.slice(0, 2), kasaA, idTavan, BOB, TAVAN_USTU);

  const [r] = await cagir("runKotuYollar",
    [kur, PAY2, TAVAN_USTU, dogru, az, yab, cift, tavanUstu]);
  ok(r.miktarDegisikReddedildi, "IMZADAN SONRA MIKTAR DEGISTIRILEMIYOR", "asil kusur buydu");
  ok(r.azImzaReddedildi, "esigin altinda imza REDDEDILDI", "tek anahtar artik yetmiyor");
  ok(r.yabanciReddedildi, "kumenin disindaki imzaci REDDEDILDI");
  ok(r.ciftImzaReddedildi, "ayni imzaci iki kez sayilamiyor");
  ok(r.tavanReddedildi, "islem tavani ustu REDDEDILDI");
  ok(r.dogruGecti, "dogru imzali bildirim GECTI");
  ok(r.tekrarReddedildi, "ayni bildirim ikinci kez REDDEDILDI");

  /* ---- 3. the window cap ------------------------------------------- */
  const P = 90n * E;                      // under the per-tx cap, two over the window
  const p1 = await imzala(cuzdanlar.slice(0, 2), kasaA, keccak256(Buffer.from("p1")), BOB, P);
  const p2 = await imzala(cuzdanlar.slice(0, 2), kasaA, keccak256(Buffer.from("p2")), BOB, P);
  const [g1, red2] = await cagir("runPencere", [kur, P, p1, p2]);
  ok(g1, "pencere icinde ilk cekim gecti", (P / E) + " pay");
  ok(red2, "pencere tavanini asan ikinci cekim REDDEDILDI",
     "2x" + (P / E) + " > " + (PENCERE_TAVANI / E));

  /* ---- 4. the wrapped side ----------------------------------------- */
  const MINT = 50n * E;
  const mintImza = await imzala(cuzdanlar.slice(0, 2), sarmalA,
    keccak256(Buffer.from("ayni-lock")), ALICE, MINT);
  const [ilk, ikiRed, arz] = await cagir("runMint", [kur, MINT, mintImza]);
  ok(ilk, "imzali mint GECTI");
  ok(ikiRed, "ayni kilit ikinci kez mint EDILEMEDI");
  ok(BigInt(arz) === MINT, "arz yalnizca bir kez artti", (Number(BigInt(arz)) / 1e18) + "");

  console.log("");
  console.log("  " + gecti + " gecti, " + kaldi + " kaldi");
  if (kaldi) process.exit(1);
  console.log("");
  console.log("  Hala dogru olan ve soylenmesi gereken: M imzaci birden ele gecerse");
  console.log("  bu kontroller gecilir. Kazanilan sey, tek anahtarin yetmemesi ve");
  console.log("  calinabilecek miktarin islem ve pencere basina zincirde sinirli");
  console.log("  olmasi. Arc'ta genel mesaj koprusu olmadigi icin guvensiz hale");
  console.log("  getirmek mumkun degil; azaltmak ve sinirlamak mumkun, o yapildi.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
