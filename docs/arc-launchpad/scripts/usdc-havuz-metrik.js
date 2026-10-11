"use strict";
/* The six things a USDC pool has to expose, taken from real events.
 *
 * ARC PULSE requirement 6 asks for price, trades, unique traders, LP
 * activity, impact and fees, "from real events" — and its Capital GPS
 * work has been waiting on exactly this data. Nothing here is modelled or
 * estimated: every number comes out of a log the chain emitted.
 *
 * Where the honest answer is awkward, it is said rather than smoothed:
 *
 *   UNIQUE TRADERS. A v4 Swap names its `sender`, and that is the router,
 *   not the person. Counting senders would report one trader for a whole
 *   day of a busy router. The payer is the transaction's `from`, which
 *   costs one receipt per trade to learn, so both are reported and
 *   labelled for what they are.
 *
 *   IMPACT. Needs the price before the trade, and the pool's price after
 *   the previous trade is not it when blocks sit in between — nothing
 *   moves it, but nothing proves that either. Arc's RPC keeps archive
 *   state, so slot0 is read at the block before each trade. When that
 *   read fails the impact is left unset instead of filled in from the
 *   nearest guess.
 *
 *   FEES. A hook takes its cut in afterSwap, which is a token transfer
 *   and not part of the Swap event. It is read from the transfers in the
 *   same transaction, PoolManager to hook. For a hook whose shape is
 *   unknown this can only report what is observable, and it says so
 *   rather than implying the fee is zero.
 *
 * Read-only, archived, and offline-verifiable.
 *
 *   node scripts/usdc-havuz-metrik.js fathom
 *   node scripts/usdc-havuz-metrik.js <havuzId> <token> [baslangicBlok]
 */
const fs = require("fs");
const path = require("path");
const { id: keccakId, AbiCoder, getAddress } = require("ethers");
const { Arsivci } = require("./arsivci.js");

const KOK = path.join(__dirname, "..");
const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const USDC = "0x3600000000000000000000000000000000000000";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";

const coder = AbiCoder.defaultAbiCoder();
const sel = (imza) => keccakId(imza).slice(0, 10);

const SWAP = keccakId("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
const MODIFY = keccakId("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)");
const TRANSFER = keccakId("Transfer(address,address,uint256)");
const Q96 = 2n ** 96n;

/* ---- what to measure ------------------------------------------- */
const arg = process.argv.slice(2);
let HEDEF;
if (!arg[0] || arg[0] === "fathom") {
  const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
  HEDEF = { ad: "FTHM", havuzId: A.havuzId, token: A.token, hook: A.hook,
            baslangic: BigInt(A.merdivenIslemleri[0].blok), tokenOnd: 18 };
} else {
  HEDEF = { ad: arg[3] || "havuz", havuzId: arg[0], token: getAddress(arg[1]),
            hook: null, baslangic: BigInt(arg[2] || 0), tokenOnd: 18 };
}
const DIZIN = path.join(KOK, "kanit-metrik", HEDEF.havuzId.slice(2, 14));
const ars = Arsivci(DIZIN);

const PENCERE = 2000n;
const ond = (x, b) => {
  const neg = x < 0n; if (neg) x = -x;
  const d = 10n ** BigInt(b);
  return (neg ? "-" : "") + (x / d) + "." + (x % d).toString().padStart(b, "0");
};

/* USDC is currency0, so (sqrt/2^96)^2 is token per USDC and the
   reciprocal is the USDC price of one token. Integer arithmetic throughout, and derived rather than guessed: price in USDC
   (6 decimals) of one whole token (tokenOnd decimals). */
function fiyatMikro(sqrt, tokenOnd) {
  if (sqrt === 0n) return null;
  return ((Q96 * Q96 * 10n ** BigInt(tokenOnd)) * 1000000n) / (sqrt * sqrt) / 1000000n;
}

(async function () {
  console.log("");
  console.log("USDC HAVUZ METRIKLERI — GERCEK OLAYLARDAN");
  console.log("  havuz  " + HEDEF.havuzId);
  console.log("  token  " + HEDEF.token);
  console.log("  arsiv  " + DIZIN);
  console.log("");

  const z = await ars.al("zincir", ARC_RPC, "eth_chainId", []);
  if (!z.sonuc) { console.log("  RPC yanit vermiyor: " + z.hata); return; }
  const sn = await ars.al("son-blok", ARC_RPC, "eth_blockNumber", []);
  const son = BigInt(sn.sonuc);
  console.log("  zincir " + Number(BigInt(z.sonuc)) + "   son blok " + son);

  /* ---- sweep the pool's own events ----------------------------- */
  /* Resumable, and self-healing. My first version resumed from the last
     archived window's end, so a window that had failed in the middle was
     never looked at again — the same defect as a cursor stepping over an
     unverified block, and it cost three ladder events on the first run.
     Every window is keyed, a failed one is retried, and only then does
     the range extend. */
  const jsonl = path.join(DIZIN, "olaylar.jsonl");
  const mevcut = new Map();
  if (fs.existsSync(jsonl))
    for (const s of fs.readFileSync(jsonl, "utf8").trim().split(/\r?\n/).filter(Boolean)) {
      const p = JSON.parse(s);
      mevcut.set(p.tur + ":" + p.fromBlock, p);
    }

  const kayitlar = [];
  let yeniCekim = 0, tekrarDenenen = 0;
  for (let a = HEDEF.baslangic; a <= son; ) {
    const u = (a + PENCERE > son) ? son : a + PENCERE;
    for (const [etiket, konu] of [["swap", SWAP], ["lp", MODIFY]]) {
      const anahtar = etiket + ":" + a.toString();
      const eski = mevcut.get(anahtar);
      if (eski && eski.sonuc !== null && BigInt(eski.toBlock) === u) { kayitlar.push(eski); continue; }
      if (eski) tekrarDenenen++;
      const c = await ars.sabirli(ARC_RPC, "eth_getLogs", [{
        address: POOL_MANAGER, topics: [konu, HEDEF.havuzId],
        fromBlock: "0x" + a.toString(16), toBlock: "0x" + u.toString(16)
      }], 8);
      yeniCekim++;
      kayitlar.push({ tur: etiket, fromBlock: a.toString(), toBlock: u.toString(),
        sonuc: c.sonuc === undefined ? null : c.sonuc,
        hata: c.sonuc === undefined ? c.hata : undefined });
    }
    a = u + 1n;
  }
  /* Rewritten in order rather than appended, so the file is the window
     list and not a history of attempts. */
  fs.writeFileSync(jsonl, kayitlar.map((k) => JSON.stringify(k)).join("\n") + "\n");

  const swaplar = [], lpler = [];
  let eksikToplam = 0;
  const eksikler = [];
  /* Contiguity, per topic, so a hole cannot hide inside the count. */
  const bek = { swap: HEDEF.baslangic, lp: HEDEF.baslangic };
  let bosluk = 0;
  for (const p of kayitlar) {
    if (BigInt(p.fromBlock) !== bek[p.tur]) bosluk++;
    bek[p.tur] = BigInt(p.toBlock) + 1n;
    if (p.sonuc === null) { eksikToplam++; eksikler.push(p.tur + " " + p.fromBlock + "-" + p.toBlock); continue; }
    if (p.tur === "swap") for (const l of p.sonuc) swaplar.push(l);
    else for (const l of p.sonuc) lpler.push(l);
  }
  swaplar.sort((a, b) => {
    const d = BigInt(a.blockNumber) - BigInt(b.blockNumber);
    if (d !== 0n) return d > 0n ? 1 : -1;
    return BigInt(a.logIndex) > BigInt(b.logIndex) ? 1 : -1;
  });
  console.log("  pencere " + kayitlar.length + " kayit (" + yeniCekim + " cekildi, " +
    tekrarDenenen + " basarisiz olan tekrar denendi), bosluk " + bosluk);
  if (eksikToplam) {
    console.log("  " + eksikToplam + " PENCERE OKUNAMADI — sayimlar ALT SINIR, tam DEGIL:");
    for (const e of eksikler.slice(0, 6)) console.log("     " + e);
  } else if (bosluk === 0) {
    console.log("  kapsam eksiksiz: " + HEDEF.baslangic + " -> " + son + ", bosluk yok");
  }

  /* ---- 2. trades, and 3. who actually traded ------------------- */
  console.log("");
  console.log("ISLEMLER");
  const gonderenler = new Set();   // Swap.sender — the router
  const odeyenler = new Set();     // tx.from — the person
  let alim = 0, satim = 0;
  const detay = [];
  for (const l of swaplar) {
    const d = coder.decode(["int128", "int128", "uint160", "uint128", "int24", "uint24"], l.data);
    /* Straight from decode: ethers returns int128 as a signed BigInt
       already. Re-encoding and re-reading it sign-extended to 256 bits,
       the 128-bit mask then produced a huge positive, and the first run
       reported the opening BUY as a sell. */
    const a0 = d[0], a1 = d[1];
    const sender = getAddress("0x" + l.topics[2].slice(26));
    gonderenler.add(sender.toLowerCase());
    /* a0 is the USDC side. Negative means the swapper paid USDC, which is
       a buy of the token. */
    if (a0 < 0n) alim++; else satim++;
      detay.push({ log: l, a0, a1, sqrt: BigInt(d[2]), lik: BigInt(d[3]),
                 tick: Number(d[4]), sender,
                 altTick: Number(d[4]) });
  }
  console.log("  toplam islem " + swaplar.length + "   alim " + alim + "   satim " + satim);

  /* The payer, one receipt per trade. */
  const ucretler = [];
  for (const t of detay) {
    const mk = await ars.al("makbuz-" + t.log.transactionHash.slice(2, 14), ARC_RPC,
      "eth_getTransactionReceipt", [t.log.transactionHash], undefined, true);
    if (!mk.sonuc) { t.odeyen = null; continue; }
    t.odeyen = getAddress(mk.sonuc.from);
    odeyenler.add(t.odeyen.toLowerCase());
    /* 6. fees: PoolManager -> hook, in the same transaction. */
    let hookaGiden = 0n, hookAdres = null;
    for (const l of mk.sonuc.logs || []) {
      if (l.topics[0] !== TRANSFER) continue;
      const from = getAddress("0x" + l.topics[1].slice(26));
      const to = getAddress("0x" + l.topics[2].slice(26));
      if (from.toLowerCase() !== POOL_MANAGER.toLowerCase()) continue;
      if (HEDEF.hook && to.toLowerCase() !== HEDEF.hook.toLowerCase()) continue;
      if (!HEDEF.hook && to.toLowerCase() === (t.odeyen || "").toLowerCase()) continue;
      if (l.address.toLowerCase() === HEDEF.token.toLowerCase() ||
          l.address.toLowerCase() === USDC.toLowerCase()) {
        if (HEDEF.hook) { hookaGiden += BigInt(l.data); hookAdres = to; }
      }
    }
    t.ucret = hookaGiden;
    t.ucretAdres = hookAdres;
    if (hookaGiden > 0n) ucretler.push({ tx: t.log.transactionHash, miktar: hookaGiden, to: hookAdres });
  }
  console.log("  farkli Swap.sender  " + gonderenler.size + "   (router/kontrat — kisi DEGIL)");
  console.log("  farkli tx.from      " + odeyenler.size + "   (ucreti odeyen gercek adres)");

  /* ---- 1. price ------------------------------------------------- */
  console.log("");
  console.log("FIYAT");
  if (!detay.length) console.log("  hic islem yok, fiyat olayindan turetilemez");
  else {
    const fiyatlar = detay.map((t) => fiyatMikro(t.sqrt, HEDEF.tokenOnd)).filter((x) => x !== null);
    const ilk = fiyatlar[0], sonF = fiyatlar[fiyatlar.length - 1];
    let enYuksek = fiyatlar[0], enDusuk = fiyatlar[0];
    for (const f of fiyatlar) { if (f > enYuksek) enYuksek = f; if (f < enDusuk) enDusuk = f; }
    const g = (x) => "$" + ond(x, 6);
    console.log("  ilk islem sonrasi " + g(ilk));
    console.log("  son islem sonrasi " + g(sonF));
    console.log("  en dusuk / yuksek " + g(enDusuk) + " / " + g(enYuksek));
    console.log("  son tick          " + detay[detay.length - 1].tick);
  }

  /* ---- 4. LP activity ------------------------------------------ */
  console.log("");
  console.log("LIKIDITE HAREKETI");
  let eklenen = 0n, cikarilan = 0n;
  const lpAdresler = new Set();
  for (const l of lpler) {
    const d = coder.decode(["int24", "int24", "int256", "bytes32"], l.data);
    const delta = d[2];
    lpAdresler.add(getAddress("0x" + l.topics[2].slice(26)).toLowerCase());
    if (delta >= 0n) eklenen += delta; else cikarilan += -delta;
  }
  console.log("  ModifyLiquidity olayi " + lpler.length + "   farkli adres " + lpAdresler.size);
  console.log("  eklenen likidite      " + eklenen);
  console.log("  CIKARILAN likidite    " + cikarilan +
    (cikarilan === 0n ? "   (hic cikis olmamis)" : "   <-- CIKIS VAR"));

  /* ---- 5. impact, against the price before each trade ---------- */
  console.log("");
  console.log("FIYAT ETKISI (islem oncesi duruma karsi)");
  for (const t of detay) {
    const blok = BigInt(t.log.blockNumber);
    const havuzSlot = require("ethers").keccak256(
      coder.encode(["bytes32", "uint256"], [HEDEF.havuzId, 6]));
    const r = await ars.al("slot0-" + (blok - 1n), ARC_RPC, "eth_call",
      [{ to: POOL_MANAGER, data: sel("extsload(bytes32)") + havuzSlot.slice(2) },
       "0x" + (blok - 1n).toString(16)],
      { not: "islem oncesi durum, blok " + (blok - 1n) }, true);
    if (!r.sonuc) {
      console.log("  blok " + blok + "  ONCESI OKUNAMADI — etki BELIRSIZ birakildi");
      t.etkiPpm = null;
      continue;
    }
    const onceSqrt = BigInt(r.sonuc) & ((1n << 160n) - 1n);
    if (onceSqrt === 0n) { t.etkiPpm = null; console.log("  blok " + blok + "  oncesi fiyat yok"); continue; }
    /* zero-impact expectation for what was paid */
    const odenen = t.a0 < 0n ? -t.a0 : t.a0;
    const alinan = t.a1 > 0n ? t.a1 : -t.a1;
    const kaymasiz = t.a0 < 0n
      ? (odenen * onceSqrt * onceSqrt) / (Q96 * Q96)       // USDC in -> token out
      : (odenen * Q96 * Q96) / (onceSqrt * onceSqrt);      // token in -> USDC out
    const SC = 10n ** 18n;
    t.etkiPpm = kaymasiz === 0n ? null : SC - (alinan * SC) / kaymasiz;
    const yuz = (x) => (Number(x) / 1e16).toFixed(4) + "%";
    console.log("  blok " + blok + "  " + (t.a0 < 0n ? "ALIM " : "SATIM") +
      "  odenen " + ond(odenen, t.a0 < 0n ? 6 : HEDEF.tokenOnd) +
      "  alinan " + ond(alinan, t.a0 < 0n ? HEDEF.tokenOnd : 6) +
      "  havuz etkisi -" + yuz(t.etkiPpm));
    if (t.ucret && t.ucret > 0n) {
      const net = alinan - t.ucret;
      const aliciEtki = SC - (net * SC) / kaymasiz;
      console.log("       hook ucreti " + ond(t.ucret, HEDEF.tokenOnd) +
        " -> " + (t.ucretAdres || "?") + "   alicinin gordugu -" + yuz(aliciEtki));
    }
  }

  /* ---- 6. fees ------------------------------------------------- */
  console.log("");
  console.log("UCRETLER");
  if (!HEDEF.hook) {
    console.log("  Bu havuzun hook'u verilmedi, o yuzden ucretin nereye gittigini");
    console.log("  IDDIA ETMIYORUM. Ucret sifir demek degil — gozlemlenmedi demek.");
  } else {
    const toplam = ucretler.reduce((a, u) => a + u.miktar, 0n);
    console.log("  ucretli islem " + ucretler.length + " / " + detay.length);
    console.log("  toplam ucret  " + ond(toplam, HEDEF.tokenOnd) + " token");
    const varis = new Set(ucretler.map((u) => (u.to || "").toLowerCase()));
    console.log("  varis adresi  " + [...varis].join(", "));
  }

  const ozet = ars.ozetYaz({
    amac: "ARC PULSE gereksinim 6: bir USDC havuzunun fiyat, islem, farkli islemci, " +
          "likidite hareketi, fiyat etkisi ve ucret metriklerinin GERCEK olaylardan " +
          "cikarilmasi. Hicbiri modellenmedi.",
    arcRpc: ARC_RPC, poolManager: POOL_MANAGER, havuzId: HEDEF.havuzId,
    token: HEDEF.token, hook: HEDEF.hook, usdc: USDC,
    kapsamBaslangic: HEDEF.baslangic.toString(), kapsamSonBlok: son.toString(),
    metrikler: {
      islem: swaplar.length, alim, satim,
      farkliSender: gonderenler.size, farkliOdeyen: odeyenler.size,
      lpOlayi: lpler.length, likiditeEklenen: eklenen.toString(),
      likiditeCikarilan: cikarilan.toString(),
      okunamayanPencere: eksikToplam
    }
  });
  console.log("");
  console.log("  " + ozet.kayit + " kayit, " + ozet.basarisiz + " basarisiz, " +
    ars.cagri + " cagri, " + ars.yenidenKullanilan + " yeniden kullanildi");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
