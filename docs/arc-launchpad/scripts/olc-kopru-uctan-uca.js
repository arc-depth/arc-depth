"use strict";
/* ===========================================================================
 * olc-kopru-uctan-uca.js — AŞAMA 4: giden bacağın tamamı, hiçbiri taklit
 *                          olmadan
 *
 *   node scripts/olc-kopru-uctan-uca.js
 *
 * WHAT THE EARLIER TWO LEFT OPEN
 *   olc-gercek-cctp.js    — Arc's real TokenMessenger accepts the call.
 *   olc-zincir-yonetici.js — the manager's checks and state machine, but
 *                            against a mock vault.
 *
 *   Neither proved the part in between: that the manager's derived
 *   recipient, the vault's independent re-derivation and the real
 *   contract's expectations all line up in one transaction. This runs that
 *   chain once, with nothing mocked on the CCTP side.
 *
 * THE ASSERTION THAT MATTERS
 *   Not "it did not revert" and not even "the balance fell". Both of those
 *   are true of the OLD design, which is the one that short-changed a
 *   redeemer by 60%. What has to be true is that the balance fell AND the
 *   economic reserve did not — because the claim is computed from the
 *   second, and a burn that moved it would reintroduce the whole bug.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000F5";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const { kisaIsim: hataAdi, yaz: revertYaz } = require("./revert-coz");

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

const T = B("TestKopruUctanUca");
const iface = new Interface(T.abi);

async function cagir(ad, args) {
  await bekle(300);
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x8000000", data: iface.encodeFunctionData(ad, args) },
    "latest",
    { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 22n).toString(16) } }
  ]);
  return iface.decodeFunctionResult(ad, r);
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());

const DURUM = ["YOK", "OLUSTURULDU", "GONDERILDI", "ULASTI", "TAKAS_EDILDI",
               "DONUYOR", "TAMAMLANDI", "IADE_BEKLIYOR", "IADE_EDILDI",
               "KURTARILABILIR_HATA"];

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ASAMA 4 — GIDEN BACAK UCTAN UCA (gercek CCTP, taklit yok)");
  console.log("");

  /* ---- 1. the sweep ----------------------------------------------- */
  console.log("1) SUPURME — davetsiz gelen parayi deftere yazmak");
  {
    const FON = 2_500_000_000n;      // $2.500
    const [s] = await cagir("supurTesti", [FON]);
    console.log("     kasa bakiyesi " + U(s.bakiye));
    console.log("     ilk supurme   " + U(s.ilkKredi) + "   ikinci " + U(s.ikinciKredi));
    console.log("     musait        " + U(s.musait));
    ok(V(s.ilkKredi) === FON, "ilk supurme tam gelen kadar kredi yazdi", U(s.ilkKredi));
    ok(s.ikinciBosDondu === true,
      "IKINCI SUPURME HICBIR SEY YAZMADI",
      "fark bakiye ile defter arasinda, yani ayni dolar iki kez yazilamaz");
    ok(V(s.musait) === FON, "musait tutar gelen kadar", U(s.musait));
  }

  /* ---- 2. the vault refuses a destination it did not derive -------- */
  console.log("");
  console.log("2) KASA TURETMEDIGI HEDEFI REDDEDIYOR");
  {
    const [reddedildi] = await cagir("yanlisAliciTesti", [1_000_000_000n]);
    ok(reddedildi === true,
      "YONETICI ROLUNDEKI CAGIRAN SAHTE ALICI VEREMEDI",
      "parayi tutan sozlesme hedefi kendisi turetiyor");
  }

  /* ---- 3. the whole chain ----------------------------------------- */
  console.log("");
  console.log("3) YONETICI -> KASA -> GERCEK TokenMessengerV2");
  {
    const FON = 5_000_000_000n;       // $5.000
    const TRANSFER = 1_000_000_000n;  // $1.000 — tam islem tavani (%20)
    const [s] = await cagir("run", [FON, TRANSFER, false]);

    console.log("     kasa     " + s.kasaAdresi);
    console.log("     yonetici " + s.yoneticiAdresi);
    console.log("     turetilen alici " + s.turetilenAlici);
    console.log("");
    console.log("     kasa bakiyesi  " + U(s.kasaBakiyeOnce) + "  ->  " + U(s.kasaBakiyeSonra));
    console.log("     musait         " + U(s.musaitOnce) + "  ->  " + U(s.musaitSonra));
    console.log("     yolda          " + U(s.yoldaOnce) + "  ->  " + U(s.yoldaSonra));
    console.log("     EKONOMIK       " + U(s.ekonomikOnce) + "  ->  " + U(s.ekonomikSonra));

    if (!s.gecti) {
      console.log("     revert:");
      revertYaz(s.sebep, 3);
    }
    ok(s.gecti === true, "transferBaslat GECTI", s.gecti ? DURUM[Number(s.durum)] : hataAdi(s.sebep));
    ok(Number(s.durum) === 2, "durum GONDERILDI", DURUM[Number(s.durum)]);

    const yakildi = V(s.kasaBakiyeOnce) - V(s.kasaBakiyeSonra);
    ok(yakildi === TRANSFER,
      "GERCEK CCTP TAM TRANSFER KADAR YAKTI",
      U(yakildi) + " — basarili gorunup hicbir sey tasimayan bir cagri degil");

    ok(V(s.yoldaSonra) === TRANSFER, "defter YOLDA'ya tam o kadar yazdi", U(s.yoldaSonra));
    ok(V(s.musaitSonra) === V(s.musaitOnce) - TRANSFER, "musait tam o kadar dustu");

    /* The assertion the whole phase exists for. */
    ok(V(s.ekonomikSonra) === V(s.ekonomikOnce),
      "EKONOMIK REZERV DEGISMEDI — HAK OYNAMADI",
      "eski kasada bu anda hak, kopru payi oraninda duserdi");
  }

  console.log("");
  console.log("  GIDEN BACAK TAMAM: gercek yakma oldu, defter dogru yazdi, hak");
  console.log("  oynamadi. Varistaki mint Circle'in zincir disi attestation'ini");
  console.log("  bekliyor ve simule edilmis bir yakma icin uretilemez — o yarim");
  console.log("  Ethereum forkunun isi.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) revertYaz(String(e.data), 1);
  process.exit(1);
});
