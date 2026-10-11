"use strict";
/* ===========================================================================
 * olc-zincir-engeli.js — STAGE 1: the blocker, on the chain, in numbers
 *
 *   node scripts/olc-zincir-engeli.js
 *
 * WHAT WAS WRONG WITH MY EARLIER ANSWER
 *   I said any function taking a destination is a withdraw. That is false,
 *   and the correction is the whole basis of the new design: a destination
 *   drawn from an IMMUTABLE VERIFIED REGISTRY — not from the caller — with
 *   bounded amounts and rate limits is a controlled transfer, not a
 *   withdraw. The caller chooses WHETHER, never WHERE.
 *
 * SO WHAT IS THE REAL BLOCKER
 *   TeminatKasasi has no way to represent value it owns but does not hold.
 *   `hak()` is balanceOf over circulating and nothing else, and `iade()`
 *   pays synchronously from whatever is present. Together those mean a
 *   redeemer who arrives while funds are in flight is not delayed — they
 *   are paid SHORT, permanently.
 *
 *   This script measures that loss so the new vault has a number to beat.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Ed";
const CAGIRAN = "0x2222222222222222222222222222222222222222";
const USDC = "0x3600000000000000000000000000000000000000";
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const BTC_FEED = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const { kisaIsim: hataAdi } = require("./revert-coz");

async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p })
    });
    const j = await r.json();
    if (!j.error) return j.result;
    if (k < 6 && /rate|limit|429/i.test(j.error.message)) { await bekle(b); b *= 2; continue; }
    const e = new Error(j.error.message); e.data = j.error.data; throw e;
  }
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const HAK = (v) => (Number(v) / 1e36).toExponential(4);
const V = (v) => BigInt(v.toString());

/* ---- static half: what the source permits --------------------------- */

function kaynakIncele() {
  const yol = path.join(__dirname, "..", "contracts", "TeminatKasasi.sol");
  const ham = fs.readFileSync(yol, "utf8");
  const s = ham.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  /* Outbound transfers and their recipients. */
  const alicilar = [...s.matchAll(/\.transfer\(\s*([^,]+?)\s*,/g)].map((m) => m[1].trim());

  /* Does any external function take an address the caller supplies that is
     then used as a transfer recipient? The question the new design has to
     answer differently. */
  /* An earlier version of this asked whether any function takes a
     parameter NAMED like a destination, and it failed — because cevir()
     takes `address hedef`, which is the ASSET to convert into, validated
     against the basket, and never a transfer recipient. Matching on a
     parameter name conflated two different things.

     The precise question is whether a caller-supplied address can become
     a transfer recipient. Every recipient is the literal msg.sender, so
     the answer is structural rather than a matter of naming. */
  const cevirHedefiVarlikMi = s.indexOf("if (!sepette[hedef]") >= 0;
  const aliciParametreDegil = alicilar.every((a) => a === "msg.sender");

  /* What `hak` is actually computed from. */
  const hakGovde = (() => {
    const i = s.indexOf("function hak(");
    if (i < 0) return "";
    const a = s.indexOf("{", i), b = s.indexOf("}", a);
    return s.slice(a, b + 1);
  })();

  /* And whether any state variable records value held elsewhere. */
  const uzakKayit = /(uzak|remote|transit|yolda|bekleyenTransfer)/i.test(s);

  return { alicilar, cevirHedefiVarlikMi, aliciParametreDegil, hakGovde, uzakKayit };
}

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ASAMA 1 — MEVCUT KASA COK ZINCIRLI TEMINATI NEDEN ENGELLIYOR");
  console.log("");

  /* ---- 1. the source ------------------------------------------------ */
  console.log("1) KAYNAK NE IZIN VERIYOR");
  const k = kaynakIncele();
  console.log("     dis transferlerin alicilari: " + k.alicilar.join(", "));
  ok(k.alicilar.every((a) => a === "msg.sender"),
    "her dis transfer msg.sender'a", k.alicilar.length + " transfer");
  ok(k.aliciParametreDegil === true,
    "hicbir alici cagiranin verdigi bir adres DEGIL",
    "hepsi literal msg.sender — bugun bir kopruye yonlendirilemez");
  /* And the one parameter that LOOKS like a destination is not one. */
  ok(k.cevirHedefiVarlikMi === true,
    "cevir()in `hedef` parametresi bir VARLIK, alici degil",
    "sepete karsi dogrulaniyor — ikisini karistirmak bu denetimin ilk halinin hatasiydi");

  console.log("     hak() govdesi:");
  for (const satir of k.hakGovde.split("\n").map((x) => x.trim()).filter(Boolean)) {
    console.log("       " + satir);
  }
  ok(/balanceOf\(address\(this\)\)/.test(k.hakGovde),
    "hak() YALNIZCA balanceOf'tan hesaplaniyor",
    "elinde olmayan degeri temsil edemiyor");
  ok(k.uzakKayit === false,
    "baska zincirdeki degeri kaydeden hicbir durum degiskeni yok",
    "ASIL ENGEL BU — hedef parametresi degil");

  /* ---- 2. the harm, measured --------------------------------------- */
  console.log("");
  console.log("2) ZARAR — iade, fonlar yoldayken ne kadar eksik odiyor");

  const T = B("TestZincirlerArasiEngel");
  const iface = new Interface(T.abi);

  const REZERV = 100_000_000n;      // $100 in the vault
  const KOPRU = 60_000_000n;        // $60 would move cross-chain
  const YAKILACAK = 50_000_000n * 10n ** 18n;   // 50M tokens redeemed

  let s;
  try {
    const r = await rpc("eth_call", [
      { from: CAGIRAN, to: H, gas: "0x8000000",
        data: iface.encodeFunctionData("run",
          [USDC, CIRBTC, BTC_FEED, REZERV, KOPRU, YAKILACAK]) },
      "latest",
      { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) } }
    ]);
    [s] = iface.decodeFunctionResult("run", r);
  } catch (e) {
    ok(false, "olcum kosturulabildi", hataAdi(e.data) + "  " + e.message);
    console.log("");
    console.log(kotu + " KOTU");
    process.exit(1);
  }

  console.log("     rezerv " + U(REZERV) + ", kopruye gidecek pay " + U(KOPRU) +
    ", iade edilen 50.000.000 token");
  console.log("");
  console.log("     A) hepsi Arc'ta       hak " + HAK(s.tamHak) +
    "   iade odemesi " + U(s.tamIadeOdemesi));
  console.log("     B) pay yolda          hak " + HAK(s.eksikHak) +
    "   iade odemesi " + U(s.eksikIadeOdemesi));
  console.log("");
  console.log("     IADE EDENIN KAYBI     " + U(s.kayip) +
    "   = %" + (Number(s.kayipBps) / 100).toFixed(2));

  ok(V(s.eksikHak) < V(s.tamHak),
    "fonlar yoldayken hak DUSUYOR",
    HAK(s.tamHak) + " -> " + HAK(s.eksikHak));
  ok(V(s.kayip) > 0n,
    "O ANDA IADE EDEN EKSIK ALIYOR — gecikmiyor, EKSIK aliyor",
    U(s.kayip) + " kalici kayip");
  /* The loss tracks the bridged fraction exactly, which is what makes it a
     pure accounting failure rather than a market effect. */
  const beklenenBps = Number((KOPRU * 10_000n) / REZERV);
  ok(Math.abs(Number(s.kayipBps) - beklenenBps) <= 1,
    "kayip, kopruye giden oranla BIREBIR ayni",
    "%" + (Number(s.kayipBps) / 100).toFixed(2) + " kayip / %" +
    (beklenenBps / 100).toFixed(2) + " kopru payi — yani piyasa etkisi degil, muhasebe acigi");

  /* ---- 3. what the new vault has to add ---------------------------- */
  console.log("");
  console.log("3) YENI KASANIN EKLEMESI GEREKENLER");
  const gerekenler = [
    "Uc durumlu muhasebe: AVAILABLE / IN_TRANSIT / REMOTE. Ayni varlik iki yerde sayilmayacak.",
    "Odenebilir bakiye ile ekonomik rezervin AYRI hesaplanmasi — iade, yoldaki paya karsi eksik odememeli.",
    "Hedefin degistirilemez dogrulanmis kayittan okunmasi; cagiran YALNIZCA tetikler, nereye sorusuna karismaz.",
    "Benzersiz transfer kimligi ve tekrar oynatma korumasi (CREATED..COMPLETED durum makinesi).",
    "Asenkron iade: talep aninda hakkin kaydi, tokenin kilitlenmesi, uzak payin ayri kapatilmasi.",
    "Bekleyen iade yukumluluklerinin geri alim icin harcanamamasi.",
    "Kopru basarisizliginda fonlarin yalnizca dogrulanmis kaynak kasaya ya da ilgili rezerv hesabina donmesi."
  ];
  for (const g of gerekenler) console.log("     - " + g);

  ok(gerekenler.length === 7, "yedi gereklilik kayda gecti");

  console.log("");
  console.log("  NOT: Engel, hedef parametresinin yoklugu DEGIL. Hedefi");
  console.log("  degistirilemez bir kayittan okuyan, miktar ve hiz sinirli bir");
  console.log("  fonksiyon withdraw degildir — bu daha onceki iddiam yanlisti.");
  console.log("  Gercek engel, kasanin SAHIP OLDUGU ama ELINDE TUTMADIGI degeri");
  console.log("  temsil edememesi; yukaridaki " + U(s.kayip) + " tam olarak bunun bedeli.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
