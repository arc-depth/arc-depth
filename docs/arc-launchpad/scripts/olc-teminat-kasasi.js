"use strict";
/* The vault's claim arithmetic, run against a real EVM rather than a
 * spreadsheet. eth_call with a state override: the harness code is injected
 * at an address and everything happens inside one simulated transaction.
 *
 * Two assertions carry the whole design:
 *   a redemption must move every claim by EXACTLY zero
 *   a buyback must raise the spent claim or revert
 * The second is driven from both sides on purpose — a test that only tried
 * the passing side would also pass against a contract with the check
 * deleted.
 */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Ea";
const CAGIRAN = "0x2222222222222222222222222222222222222222";
const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } catch (e) {
      if (k >= 6 || !/rate|limit|429|timeout|ECONN|fetch/i.test(String(e.message))) throw e;
      await bekle(b); b = Math.min(b * 2, 20000);
    }
  }
}

const T = B("TestTeminatKasasi");
const iface = new Interface(T.abi);
const E = 10n ** 18n;
const OLCEK = 10n ** 36n;

async function cagir(ad, args) {
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x4000000", data: iface.encodeFunctionData(ad, args) },
    "latest", { [H]: { code: T.deployedBytecode } }
  ]);
  return iface.decodeFunctionResult(ad, r);
}

const tok = (v) => (Number(v) / 1e18).toLocaleString("en", { maximumFractionDigits: 4 });
const hak = (v) => (Number(v) / 1e36).toExponential(6);

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("TEMINAT KASASI — gercek EVM, tek islem icinde");
  console.log("");

  /* 1 — redemption */
  console.log("1) IADE her varligin hakkini TAM OLARAK korumali");
  {
    const yakilacak = 40_000_000n * E;
    const [once, sonra, odenen, hepsiAyni] = await cagir("iadeTesti", [yakilacak]);
    console.log("     dolasim " + tok(once.dolasim) + " -> " + tok(sonra.dolasim));
    for (let i = 0; i < 3; i++) {
      console.log("     varlik" + i + "  bakiye " + tok(once.bakiyeler[i]) + " -> " + tok(sonra.bakiyeler[i]) +
        "   hak " + hak(once.haklar[i]) + " -> " + hak(sonra.haklar[i]) +
        "   odenen " + tok(odenen[i]));
    }
    ok(hepsiAyni === true, "UC VARLIGIN HAKKI DA BIREBIR AYNI", "yuvarlama bile yok");
    ok(BigInt(sonra.dolasim) === BigInt(once.dolasim) - yakilacak, "dolasim tam yakilan kadar dustu");
    let toplamOdendi = 0n;
    for (const o of odenen) toplamOdendi += BigInt(o);
    ok(toplamOdendi > 0n, "her varliktan odeme yapildi", tok(toplamOdendi) + " toplam birim");
  }

  /* 2 — buyback, both directions */
  console.log("");
  console.log("2) GERI ALIM — tabanin altindan GECER, ustunden REVERT");
  const harcama = 10n * E;                       // 10 units, under the 2% cap of 600
  /* The exact boundary is excluded on purpose.

     At kat = 10_000 the borrower pays precisely what the burned tokens
     were worth, so in real arithmetic the claim lands exactly where it
     started. In integer arithmetic the division truncates and it can land
     one wei lower, and the contract then refuses — correctly: it will not
     pass a call it cannot prove was not dilutive.

     That costs nothing. At the boundary the slack is zero, so the reward
     is zero and there is no reason to make the call. A caller wanting the
     reward aims below the claim anyway, which 9_900 checks is usable.

     The first version of this test asserted 10_000 must pass and reported
     a correct contract as broken. */
  for (const [katBps, bekleniyor] of [[9000n, "gecmeli"], [9900n, "gecmeli"], [12000n, "revert"]]) {
    await bekle(1200);
    let sonuc;
    try {
      const [once, sonra, yakilan, odul, bos] = await cagir("geriAlimTesti", [harcama, katBps]);
      const h0 = BigInt(once.haklar[0]), h1 = BigInt(sonra.haklar[0]);
      sonuc = { gecti: true, h0, h1, yakilan: BigInt(yakilan), odul: BigInt(odul), bos: BigInt(bos),
                diger: [BigInt(once.haklar[1]), BigInt(sonra.haklar[1])] };
    } catch (e) { sonuc = { gecti: false, hata: String(e.message).slice(0, 40) }; }

    const etiket = "kat %" + (Number(katBps) / 100).toFixed(0);
    if (bekleniyor === "revert") {
      ok(!sonuc.gecti, etiket + " (tabanin USTUNDE) REVERT etti", sonuc.gecti ? "GECTI — KONTROL YOK!" : "HakDustu");
    } else {
      if (!sonuc.gecti) { ok(false, etiket + " gecmeliydi", sonuc.hata); continue; }
      ok(sonuc.h1 >= sonuc.h0, etiket + " hak korundu/yukseldi",
        hak(sonuc.h0) + " -> " + hak(sonuc.h1));
      ok(sonuc.diger[1] > sonuc.diger[0], etiket + " HARCANMAYAN varligin hakki BEDAVA yukseldi",
        hak(sonuc.diger[0]) + " -> " + hak(sonuc.diger[1]));
      ok(sonuc.yakilan > 0n, etiket + " token yakildi", tok(sonuc.yakilan));
      ok(sonuc.odul > 0n, etiket + " odul boslugundan odendi", tok(sonuc.odul) + " birim");
      ok(sonuc.odul <= sonuc.bos, etiket + " odul boslugu ASMIYOR",
        tok(sonuc.odul) + " <= " + tok(sonuc.bos));
    }
  }

  /* 3 — a borrower that returns nothing */
  console.log("");
  console.log("3) VARLIGI ALIP HICBIR SEY DONDURMEYEN borclu");
  {
    await bekle(1200);
    const [revertEtti] = await cagir("kacanBorclu", [harcama]);
    ok(revertEtti === true, "KACAN BORCLU REVERT EDIYOR", "kasa zarara ugramiyor");
  }

  console.log("");
  console.log(kotu === 0 ? "  GECTI — iade hakki bozmuyor, geri alim sulandirmiyor, kacan borclu revert."
                         : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.log("HATA: " + e.message); if (e.data) console.log("data: " + String(e.data).slice(0, 200)); process.exit(1); });
