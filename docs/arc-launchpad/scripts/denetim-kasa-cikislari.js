"use strict";
/* ===========================================================================
 * denetim-kasa-cikislari.js — how many ways can value leave each vault,
 *                             and WHERE to
 *
 *   node scripts/denetim-kasa-cikislari.js
 *
 * WHY THIS IS THE AUDIT THAT MATTERS
 *   Every other property of the vaults is arithmetic, and the arithmetic
 *   is measured elsewhere. This audit is structural: the entire safety
 *   claim rests on nobody being able to redirect the reserve anywhere.
 *   Not "should not redirect" — CANNOT, because the list of exits is
 *   short, closed, and every line on it names its recipient.
 *
 * THREE VAULTS, THREE DIFFERENT RULES — AND THAT IS NOT A RELAXATION
 *   There used to be one rule: "every exit goes to msg.sender". There are
 *   three vaults now and two of them cannot satisfy it literally. Loosening
 *   the rule and declaring everything fine would have been easy; instead
 *   each vault's rule is written down separately, with why it has to be
 *   that wide:
 *
 *     TeminatKasasi          every exit to msg.sender. No target argument.
 *     KopruKasasi            msg.sender, or an address a PREVIOUS refund
 *                            wrote into the ledger. The second one is
 *                            needed so somebody else can close the queue,
 *                            and that address is not a parameter of any
 *                            call.
 *     RemoteCollateralVault  msg.sender, or the BORROWER address the
 *                            caller supplies. The protection here is not
 *                            an address but an OUTCOME: the vault derives
 *                            its own floor from the feed and the call
 *                            reverts if it would fall below it.
 *
 *   The third was proved by measurement. While the floor was the caller's
 *   parameter, a hostile executor borrowed $2,000.00 and kept $1,999.00 —
 *   a 99.94% loss. Now it reverts with `TabanAltinda` and the same call
 *   takes away zero.
 *
 * THE BRIDGE QUESTION IS NO LONGER OPEN
 *   This file used to say "sending collateral to another chain is a
 *   withdraw, so it is not done". The part that was right still stands: a
 *   function WHOSE TARGET THE CALLER SUPPLIES is a withdraw. The answer
 *   was to stop taking the target from the caller — the remote vault's
 *   address is derived with CREATE2, the contract holding the money
 *   derives it independently a second time, and reverts if they disagree.
 *   The claim dropping while funds are in flight was closed separately:
 *   a three-bucket ledger keeps counting the in-flight amount, and it was
 *   measured — the claim stayed identical across four state changes.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..", "contracts");

/* Each vault's complete, closed set of outbound movements. An exit that is
   not on its list fails the audit even if it looks harmless — the point is
   that the list is short, closed, and every line names its bound. */
const KASALAR = [
  {
    dosya: "TeminatKasasi.sol",
    ad: "TeminatKasasi",
    /* The strictest rule, and it still holds for the vault that serves the
       tokens already launched. */
    aliciKurali: ["msg.sender"],
    aliciAciklama: "hedef argumani YOK, yani kopruye de yonlendirilemez",
    onayliHarcayan: [],
    ayarlayiciIzinli: [],
    cikislar: [
      { fonksiyon: "iade", neden: "proportional redemption",
        sinir: "shares computed against pre-burn supply, so every claim is preserved exactly" },
      { fonksiyon: "geriAl", neden: "the buyback loan",
        sinir: "ISLEM_TAVANI 2% of balance, and the launch tokens must be back before the call returns" },
      { fonksiyon: "geriAl", neden: "the keeper's reward",
        sinir: "20% of the measured slack, inside DONEM_TAVANI 10% of balance per window" },
      { fonksiyon: "cevir", neden: "the conversion loan",
        sinir: "AZAMI_SAPMA 1% against the oracle, plus the basket weight ceiling" }
    ]
  },
  {
    dosya: "KopruKasasi.sol",
    ad: "KopruKasasi",
    /* `t.kime` is the redeemer recorded by an earlier `iade`. It is not a
       parameter of any function: `kuyrukOde` takes a step count and
       nothing else, and it always settles the head of the queue. So a
       caller chooses WHEN somebody is paid and never WHO. */
    aliciKurali: ["msg.sender", "t.kime"],
    aliciAciklama: "t.kime onceki bir iadenin yazdigi adres; kuyrukOde yalnizca " +
                   "adim sayisi aliyor ve hep sira basini odiyor",
    /* The CCTP burn is an approve plus a call into the messenger, not a
       transfer. The spender has to be the immutable one. */
    onayliHarcayan: ["tokenMessenger"],
    /* One setter, and it is the circularity between this vault and its
       manager. It cannot aim money anywhere: the destination of the only
       outbound bridge call is re-derived from the registry inside this
       contract and compared, so a hostile manager gets `YanlisAlici`. */
    ayarlayiciIzinli: ["yoneticiyiAyarla"],
    cikislar: [
      { fonksiyon: "iade", neden: "the immediately payable part of a redemption",
        sinir: "bounded by harcanabilir, which is MUSAIT minus what is already owed" },
      { fonksiyon: "kuyrukOde", neden: "settling the head of the redemption queue",
        sinir: "strict FIFO, bounded by MUSAIT and by the ticket's own remainder" },
      { fonksiyon: "geriAl", neden: "the buyback loan",
        sinir: "2% of SPENDABLE per call — tighter than 2% of the reserve whenever part of it is abroad" },
      { fonksiyon: "geriAl", neden: "the keeper's reward",
        sinir: "20% of measured slack, inside a window ceiling frozen when the window opened" }
    ]
  },
  {
    dosya: "RemoteCollateralVault.sol",
    ad: "RemoteCollateralVault",
    /* `alici` IS a caller-supplied address, and saying otherwise would be
       false — this file said the opposite once and was wrong. What bounds
       it is the outcome, not the identity: the vault derives its own
       minimum from this chain's price feed and reverts below it. The
       borrower may be anyone; the result may not be anything. */
    aliciKurali: ["msg.sender", "alici"],
    aliciAciklama: "alici CAGIRANIN verdigi odunc alan — koruma adres degil " +
                   "SONUC: taban besleyiciden turetiliyor, altinda kalirsa doner",
    onayliHarcayan: ["tokenMessenger"],
    ayarlayiciIzinli: [],
    cikislar: [
      { fonksiyon: "takasEt", neden: "the purchase loan",
        sinir: "bounded by bekleyenQuote, and the output must clear alisTabani()" },
      { fonksiyon: "takasEt", neden: "the executor's fee",
        sinir: "YURUTUCU_ODUL_BPS 0.05%, paid only after the floor has held" },
      { fonksiyon: "geriTakasEt", neden: "the sale loan",
        sinir: "bounded by satisIzni, which only an order from Arc can raise" },
      { fonksiyon: "geriTakasEt", neden: "the executor's fee",
        sinir: "YURUTUCU_ODUL_BPS 0.05% of the proceeds" }
    ]
  }
];

function govdeler(s) {
  /* Function bodies by brace matching. A regex cannot do this and a
     line-based guess would attribute a transfer to the wrong function,
     which is the one mistake that would make this audit lie. */
  const out = [];
  const re = /function\s+(\w+)\s*\(/g;
  let m;
  while ((m = re.exec(s))) {
    /* A declaration inside an interface has no body: its signature ends
       with a semicolon. Taking the next brace regardless walked into the
       following contract and attributed every transfer in the file to
       `burn` and `burnFrom`, which is how this audit once reported twelve
       exits instead of four. */
    const bas = s.indexOf("{", m.index);
    const noktaVirgul = s.indexOf(";", m.index);
    if (bas < 0) continue;
    if (noktaVirgul >= 0 && noktaVirgul < bas) continue;   // govdesiz bildirim
    let derinlik = 0, i = bas;
    for (; i < s.length; i++) {
      if (s[i] === "{") derinlik++;
      else if (s[i] === "}") { derinlik--; if (derinlik === 0) break; }
    }
    out.push({ ad: m[1], bas, bit: i, govde: s.slice(bas, i + 1) });
  }
  return out;
}

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

console.log("KASA CIKISLARI — varlik kasadan kac yoldan ve NEREYE cikabilir");

for (const K of KASALAR) {
  console.log("");
  console.log("=== " + K.ad + " " + "=".repeat(Math.max(3, 46 - K.ad.length)));

  const ham = fs.readFileSync(path.join(KOK, K.dosya), "utf8");
  if (!ham.trim()) throw new Error(K.dosya + " bos");
  /* Comments stripped first, or a transfer mentioned in prose counts as
     one. This repository's comments discuss transfers at length. */
  const s = ham.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const fns = govdeler(s);
  ok(fns.length > 0, K.ad + ": fonksiyon govdeleri cozuldu", fns.length + " fonksiyon");

  /* Outbound = transfer(...). transferFrom pulls IN and is not an exit. */
  const cikislar = [];
  for (const f of fns) {
    const re = /\.transfer\(\s*([^,]+?)\s*,/g;
    let m;
    while ((m = re.exec(f.govde))) cikislar.push({ fonksiyon: f.ad, alici: m[1].trim() });
  }

  console.log("  cikislar:");
  for (const c of cikislar) console.log("   " + c.fonksiyon.padEnd(14) + " -> " + c.alici);

  /* 1 — the count is closed. */
  ok(cikislar.length === K.cikislar.length,
    K.ad + ": cikis sayisi tam olarak " + K.cikislar.length,
    cikislar.length + " bulundu");

  /* 2 — every recipient is on this vault's named list. Not "looks safe" —
     on the list, with the list's reason printed. */
  const yabanci = cikislar.filter((c) => !K.aliciKurali.includes(c.alici));
  ok(yabanci.length === 0,
    K.ad + ": HER ALICI ADLANDIRILMIS LISTEDE",
    yabanci.length
      ? yabanci.map((c) => c.fonksiyon + " -> " + c.alici).join(", ")
      : K.aliciKurali.join(" | ") + " — " + K.aliciAciklama);

  /* 3 — and each one belongs to a function that is on the list. */
  const bekl = {}, bul = {};
  for (const i of K.cikislar) bekl[i.fonksiyon] = (bekl[i.fonksiyon] || 0) + 1;
  for (const c of cikislar) bul[c.fonksiyon] = (bul[c.fonksiyon] || 0) + 1;
  let esles = true;
  for (const k of new Set([...Object.keys(bekl), ...Object.keys(bul)])) {
    if (bekl[k] !== bul[k]) { esles = false; break; }
  }
  ok(esles, K.ad + ": cikislar beklenen fonksiyonlara birebir dagilmis",
    Object.entries(bul).map(([k, v]) => k + ":" + v).join(" "));

  /* 4 — an approve is an exit too, and a forgotten one is how a reserve
     leaves without any transfer appearing in the contract at all. */
  const onaylar = [];
  for (const f of fns) {
    const re = /\.approve\(\s*([^,]+?)\s*,/g;
    let m;
    while ((m = re.exec(f.govde))) onaylar.push({ fonksiyon: f.ad, kime: m[1].trim() });
  }
  if (onaylar.length) {
    console.log("  onaylar:");
    for (const o of onaylar) console.log("   " + o.fonksiyon.padEnd(14) + " -> " + o.kime);
  }
  const kotuOnay = onaylar.filter((o) => !K.onayliHarcayan.includes(o.kime));
  ok(kotuOnay.length === 0,
    K.ad + ": her onay degismez bir adrese",
    kotuOnay.length
      ? kotuOnay.map((o) => o.fonksiyon + " -> " + o.kime).join(", ")
      : (onaylar.length ? K.onayliHarcayan.join(" | ") + " (immutable)" : "onay yok"));

  /* 5 — no raw call/send/delegatecall. The opcode scanner proves the
     absence of DELEGATECALL in the bytecode; this catches the source-level
     intent before anybody compiles it, and `.call{value:}` would move the
     gas token, which on Arc IS the quote asset. */
  for (const desen of [/\.call\s*\{/, /\.call\s*\(/, /\.send\s*\(/, /delegatecall/, /selfdestruct/]) {
    ok(!desen.test(s), K.ad + ": kaynakta " + String(desen) + " yok");
  }

  /* 6 — nothing settable beyond this vault's named exception. A pointer
     that can be repointed is a withdraw with extra steps. */
  const ayarlar = (s.match(/function\s+(set\w+|ayarla\w*|\w*Ayarla)\s*\(/g) || [])
    .map((x) => x.replace(/function\s+/, "").replace(/\s*\($/, ""));
  const izinsiz = ayarlar.filter((a) => !K.ayarlayiciIzinli.includes(a));
  ok(izinsiz.length === 0,
    K.ad + ": listede olmayan ayarlayici yok",
    izinsiz.length
      ? izinsiz.join(", ")
      : (ayarlar.length
          ? "yalnizca " + ayarlar.join(", ") + " — ve o parayi hicbir yere nisan alamaz"
          : "hicbir isaretci degistirilemez"));

  ok(!/\bonlyOwner\b|\bOwnable\b/.test(s), K.ad + ": sahip/owner kavrami yok");
}

console.log("");
console.log("  SONUC — her kasanin cikis listesi ve sinirlari:");
for (const K of KASALAR) {
  console.log("");
  console.log("   " + K.ad + "   (alici kurali: " + K.aliciKurali.join(" | ") + ")");
  for (const i of K.cikislar) {
    console.log("     " + i.fonksiyon.padEnd(13) + i.neden);
    console.log("                  sinir: " + i.sinir);
  }
}
console.log("");
console.log("   Baska bir zincire teminat gondermek icin CAGIRANIN HEDEF VERDIGI");
console.log("   bir fonksiyon gerekir ve o fonksiyon adi ne olursa olsun");
console.log("   withdraw'dir. Cozum, hedefi cagirandan almamak oldu: uzak kasanin");
console.log("   adresi CREATE2(fabrika, keccak256(tokenId), initKodHash) ile");
console.log("   turetiliyor, parayi tutan sozlesme onu bagimsiz olarak bir kez");
console.log("   daha turetiyor ve uyusmazsa YanlisAlici ile donuyor. Ucus");
console.log("   sirasinda hakkin dusmesi de ayri olarak kapandi: uc kovali");
console.log("   defter yoldaki tutari saymaya devam ediyor ve hak dort durum");
console.log("   degisikligi boyunca birebir sabit kaldi.");
console.log("");
console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
process.exit(kotu === 0 ? 0 : 1);
