"use strict";
/* ===========================================================================
 * imzaci.js — one bridge signer, which checks before it signs.
 *
 *   node kopru/imzaci.js --yapilandirma kopru/ornek-yapilandirma.json
 *   node kopru/imzaci.js --yapilandirma ... --surekli
 *
 * WHAT THIS IS FOR
 *   KopruKanit accepts a notice when M of N signers have put their names
 *   to (eventId, recipient, amount). The contract can verify the
 *   signatures; it cannot verify that the event happened, because Arc has
 *   no general message bridge and there is no light client to ask. That
 *   check lives here, and it is the entire value of a signer. A signer
 *   that signs whatever a relayer hands it is a rubber stamp with extra
 *   steps, and M of N rubber stamps is no better than one.
 *
 * WHAT IT CHECKS BEFORE SIGNING, EVERY TIME
 *   1. the log came from the counterpart contract named in the config,
 *      not from any contract that emits a similarly shaped event
 *   2. its topic0 is the expected event signature
 *   3. the recipient and the amount are DECODED FROM THE LOG — never
 *      taken from an argument, which is the hole this whole mechanism
 *      exists to close
 *   4. the block is buried under at least `onay` confirmations — which is
 *      depth on the source chain and NOT L1 finality on a rollup; see
 *      finalitePolitikasi in yapilandirmaOku()
 *   5. the event id has not been signed by this signer before
 *   6. the amount is within the destination contract's own caps, read
 *      from the destination contract rather than from the config
 *
 *   Any one of them failing means no signature, and the reason is
 *   printed. Nothing here can move a token; the worst a compromised
 *   signer can do is refuse to sign, or sign something another M-1
 *   signers also agreed to.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   It does not hold the destination transaction, submit anything, or
 *   talk to the other signers. Signatures go to a directory; whoever
 *   wants to submit collects them. Submission is permissionless in the
 *   contract on purpose, so the signer needs no gas, no nonce and no
 *   network write path — which is a smaller thing to compromise.
 *
 *   It also never generates a key. The key comes from the environment,
 *   is used to sign, and is never printed, logged or written anywhere.
 *
 * RUNNING TWO OF THESE ON ONE MACHINE BUYS ALMOST NOTHING
 *   The point of M of N is that compromising one signer is not enough.
 *   Two processes under one operating system with one RPC provider share
 *   their fate. Separate hosts and separate providers, or the threshold
 *   is decoration — this is said here because the config file cannot
 *   enforce it.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { Wallet, AbiCoder, keccak256, getBytes, id, getAddress } = require("ethers");

const coder = AbiCoder.defaultAbiCoder();
const OZET = require("./ozet.js");
const val = (a, d) => { const i = process.argv.indexOf(a); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SUREKLI = process.argv.includes("--surekli");
const YAPILANDIRMA = val("--yapilandirma", path.join(__dirname, "yapilandirma.json"));

function istek(url, method, params) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = mod.request({ hostname: u.hostname, port: u.port || undefined,
      path: (u.pathname || "/") + (u.search || ""), method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(url, m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { return await istek(url, m, p); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout|ECONN/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}
const sel = (s) => id(s).slice(0, 10);
const nf = (x) => Number(x).toLocaleString("tr-TR");

/* A BigInt cannot be handed to JSON.stringify — it throws, which is what
   the first version did at the end of every round. The signer crashed
   before writing a cursor, so a restart rescanned from the start and
   nothing said why.

   Through a temp file and a rename, because a crash in the middle of a
   write would otherwise leave a truncated cursor that parses as garbage
   or as zero. */
function imleciYaz(y, durum) {
  const gecici = y.durumDosyasi + ".yazim";
  fs.writeFileSync(gecici, JSON.stringify({
    sonBlok: durum.sonBlok.toString(),
    /* Persisted so a restart does not reset the count and hide a stall
       that has already been going on for hours. */
    tutulanBlok: (durum.tutulanBlok === undefined || durum.tutulanBlok === null)
      ? null : durum.tutulanBlok.toString(),
    tutulanTur: durum.tutulanTur || 0
  }, null, 1) + "\n");
  fs.renameSync(gecici, y.durumDosyasi);
}


/* Is this receipt a receipt FOR THIS LOG, or merely for a transaction
   that shares its hash? The first version only read the receipt's status,
   which answers neither question. A transaction can be re-included in
   another block, and then a receipt reading 'succeeded' belongs to a
   different history than the log about to be signed.

   Returns null when the log is bound to the receipt, or the reason it is
   not. A named function because this is the part worth testing, and
   testing a copy of it would prove nothing. */
function makbuzBagli(makbuz, log) {
  if (makbuz.transactionHash !== log.transactionHash)
    return 'makbuz baska islemden';
  if (makbuz.blockHash !== log.blockHash)
    return 'makbuz baska bloktan (log ' + log.blockHash + ' makbuz ' + makbuz.blockHash + ')';

  /* Numerically, not as text: logIndex is an RPC quantity and providers
     disagree on '0x3' versus '0x03'. A text comparison is fail-closed, so
     nothing would be signed wrongly — but the signer would refuse every
     valid event on such a provider and the bridge would stop dead over a
     formatting difference. Case on the address and topics, same reason. */
  const dus = (v) => (v || '').toLowerCase();
  const esi = (makbuz.logs || []).find((x) =>
    BigInt(x.logIndex) === BigInt(log.logIndex) &&
    dus(x.address) === dus(log.address) &&
    dus(x.data) === dus(log.data) &&
    (x.topics || []).length === (log.topics || []).length &&
    (x.topics || []).every((t, j) => dus(t) === dus(log.topics[j])));
  if (!esi) return 'log makbuzun icinde bulunamadi';
  return null;
}

/* How far the cursor may advance. If any log in the window could not be
   established as canonical, it must not pass that block: the first
   version advanced regardless, so an event in a replaced block was
   skipped forever and somebody's withdrawal silently never happened.
   Re-reading a block costs one call.

   Held quietly, though, this is a bridge that has stopped and says
   nothing. A reorg clears in a round or two; anything longer is an
   operator's problem and has to read like one. */
function imlecKarari(durum, supheliBlok, bitis) {
  if (supheliBlok === null || supheliBlok - 1n >= bitis) {
    durum.tutulanBlok = null;
    durum.tutulanTur = 0;
    return bitis;
  }
  const ayniBlok = durum.tutulanBlok !== null && durum.tutulanBlok !== undefined &&
    BigInt(durum.tutulanBlok) === supheliBlok;
  durum.tutulanTur = ayniBlok ? (durum.tutulanTur || 0) + 1 : 1;
  durum.tutulanBlok = supheliBlok;

  const yeni = supheliBlok - 1n;
  console.log('  IMLEC TUTULDU  ' + yeni + ' (blok ' + supheliBlok +
    ' dogrulanamadi, tekrar taranacak)   tur ' + durum.tutulanTur);
  if (durum.tutulanTur >= 10)
    console.log('  !! ' + durum.tutulanTur + ' turdur ayni blokta tutuluyor. Bu artik ' +
      'yeniden duzenlenme degil; kaynak RPC ya da olay tutarsiz. KOPRU DURMUS ' +
      'DURUMDA, hicbir olay atlanmadi. Elle bakilmasi gerekiyor.');
  /* Never backwards: the cursor only ever stalls, it does not rewind into
     ground already covered. */
  return yeni < durum.sonBlok ? durum.sonBlok : yeni;
}

/* A notice the signer saw, could not sign, and let the cursor move past.
   Written down so "we moved on" never means "it is gone": the record
   carries the event id, the source transaction and everything needed to
   replay it once whatever blocked it has changed. */
function atlananiYaz(y, log, c, sebep) {
  const dizin = path.join(y.imzaDizini, "atlanan");
  try {
    fs.mkdirSync(dizin, { recursive: true });
    const dosya = path.join(dizin, c.olayId.slice(2, 18) + "." + y.ad + ".json");
    fs.writeFileSync(dosya, JSON.stringify({
      olayId: c.olayId, alici: c.alici, miktar: c.miktar.toString(),
      sebep, kaynakZincir: y.kaynakZincir, kaynakTx: log.transactionHash,
      kaynakBlok: parseInt(log.blockNumber, 16), kaynakBlokHash: log.blockHash,
      logIndex: parseInt(log.logIndex, 16), zaman: new Date().toISOString()
    }, null, 1) + "\n");
    console.log("     kaydedildi " + path.relative(y.imzaDizini, dosya).replace(/\\/g, "/"));
  } catch (e) {
    /* If it cannot be written down, it must not be passed over. */
    throw new Error("atlanan bildirim kaydedilemedi, imlec ILERLETILMIYOR: " + e.message);
  }
}

/* `yol` so the gate below can be tested as itself. Defaults to the real
   config path, which is what main() uses. */
function yapilandirmaOku(yol) {
  const y = JSON.parse(fs.readFileSync(yol || YAPILANDIRMA, "utf8"));
  const gerekli = ["ad", "kaynakRpc", "hedefRpc", "kaynakKontrat", "hedefKontrat",
                   "olayImzasi", "kaynakZincir", "hedefZincir", "onay", "imzaDizini",
                   "finalitePolitikasi"];
  for (const k of gerekli) if (y[k] === undefined) throw new Error("yapilandirmada eksik: " + k);

  /* "onay" counts blocks on the source chain, and on a rollup that is
     sequencer depth. It is not L1 finality. Robinhood's own documentation
     separates three things: the sequencer receipt, the batch being posted
     to L1, and that L1 block reaching finality — plus a seven day
     canonical withdrawal period on top. A notice buried under sixty-four
     sequencer blocks can still belong to a batch that is never posted, or
     posted differently.
   
     The signer cannot check an L1 batch binding today: that is not built.
     What it can refuse to do is pretend the question was answered. The
     operator has to write down which policy they are running under, and
     an unset or unimplemented one stops the program rather than quietly
     defaulting to the weaker reading.
   
       "sadece-derinlik" — depth only. The risk above is accepted
                           deliberately and in writing.
       "l1-parti"        — the source transaction is bound to a posted,
                           finalized L1 batch. NOT IMPLEMENTED; refuses.

     A Map, and the value is fetched before anything is decided. With an
     object and `in`, the check reached the prototype: "toString",
     "constructor" and "__proto__" all passed it, and the second check
     then found a function rather than null and waved them through. A gate
     whose only job is to fail closed was failing open on three words. A
     Map has no prototype keys to walk into. */
  const POLITIKALAR = new Map([
    ["sadece-derinlik", "kaynak zincirin derinligi, L1 finality DEGIL — risk yazili olarak kabul edilmis"],
    ["l1-parti", null]
  ]);
  if (typeof y.finalitePolitikasi !== "string" || !POLITIKALAR.has(y.finalitePolitikasi))
    throw new Error("finalitePolitikasi taninmiyor: " + y.finalitePolitikasi +
      " (sadece-derinlik | l1-parti)");
  const not = POLITIKALAR.get(y.finalitePolitikasi);
  if (not === null)
    throw new Error("finalitePolitikasi '" + y.finalitePolitikasi + "' henuz UYGULANMADI. " +
      "Kaynak islemi L1'e gonderilmis ve finalize olmus bir partiye baglamak gerekiyor; " +
      "bu kod yok. Derinligi finality saymak istiyorsan 'sadece-derinlik' yaz — " +
      "o zaman riski acikca sen kabul etmis olursun.");
  y.finaliteNotu = not;
  y.kaynakKontrat = getAddress(y.kaynakKontrat);
  y.hedefKontrat = getAddress(y.hedefKontrat);

  /* THE ZERO ADDRESS IS A VALID ADDRESS, which is the problem.
     getAddress("0x00...0") checksums fine, so a config copied from the
     example and only half filled in passes this function and is
     discovered later — by a cap read against an address with no code,
     which returns empty data rather than an error. A signer that gets
     that far has already decided it is configured.

     ornek-yapilandirma.json ships with both of these as zero ON PURPOSE,
     so there is no version of this where the placeholder is mistaken for
     a setting. It has to be refused here, by name, not noticed later. */
  const SIFIR = "0x0000000000000000000000000000000000000000";
  for (const k of ["kaynakKontrat", "hedefKontrat"]) {
    if (y[k] === SIFIR)
      throw new Error(k + " sifir adres — yapilandirma doldurulmamis. " +
        "ornek-yapilandirma.json bu alanlari bilerek sifir birakiyor; " +
        "gercek kontrat adresini yaz.");
  }
  return y;
}

/* The digest the destination contract will compute. Rebuilt from the same
   pieces rather than asked for, so a submitter cannot present a different
   one and collect a signature over it. Built in ozet.js, which is checked
   against the contract itself by dene-ozet.js — two copies of this
   arithmetic agreeing with each other would prove nothing. */
function ozet(y, olayId, alici, miktar) {
  return OZET.imzalanacak(y.hedefZincir, y.hedefKontrat, y.kaynakZincir,
                          olayId, alici, miktar);
}

/* The caps come from the destination contract, not the config: a config a
   signer can edit is a cap a signer can raise. */
async function hedefSinirlar(y) {
  const oku = async (fn) => BigInt(await rpc(y.hedefRpc, "eth_call",
    [{ to: y.hedefKontrat, data: sel(fn) }, "latest"]));
  return {
    islemTavani: await oku("islemTavani()"),
    pencereTavani: await oku("pencereTavani()"),
    esik: await oku("esik()"),
    kaynakZincir: await oku("kaynakZincir()")
  };
}

async function kullanildiMi(y, olayId) {
  const r = await rpc(y.hedefRpc, "eth_call", [{ to: y.hedefKontrat,
    data: sel("kullanildi(bytes32)") + olayId.slice(2) }, "latest"]);
  return BigInt(r) !== 0n;
}

/* ---- the check that matters ------------------------------------- */
/* Everything is read out of the log. `alici` and `miktar` are decoded
   from its topics and data; if they came from anywhere else this whole
   contraption would be the old relayer with more ceremony. */
function olayCoz(y, log) {
  const sorun = [];
  if (log.address.toLowerCase() !== y.kaynakKontrat.toLowerCase())
    sorun.push("baska kontrattan: " + log.address);
  if (log.topics[0] !== id(y.olayImzasi))
    sorun.push("beklenen olay degil");
  if (sorun.length) return { sorun };

  /* Lock(address indexed from, address indexed arcRecipient, uint256
     amount, uint256 shares) — the recipient is the second indexed topic
     and the share count the second word of data. The layout is named in
     the config so a different counterpart can be described without
     editing this file. */
  const alici = getAddress("0x" + log.topics[y.aliciTopic || 2].slice(26));
  const kelimeler = (log.data.slice(2).match(/.{64}/g) || []);
  const i = y.miktarKelime === undefined ? 1 : y.miktarKelime;
  if (kelimeler.length <= i) return { sorun: ["veri alani kisa"] };
  const miktar = BigInt("0x" + kelimeler[i]);

  /* Where the id comes from depends on the direction, and getting this
     wrong is not visible until somebody tries to reconcile the chains.

     Burn -> release: WrappedStock.burn generates a burnId on chain and
     emits it. That is the burn's canonical identity. Deriving a different
     one here would make the vault record a release against a number that
     appears nowhere in the burn, and the two sides would no longer be
     comparable — which is the only thing holding this bridge honest.

     Lock -> mint: Locked carries no id, so one is derived from the source
     transaction and the log's index inside it. Unique, and it does not
     collapse two locks in one transaction into a single notice the way a
     bare transaction hash does. */
  let olayId;
  if (y.olayIdKelime !== undefined) {
    if (kelimeler.length <= y.olayIdKelime) return { sorun: ["olayId alani yok"] };
    olayId = "0x" + kelimeler[y.olayIdKelime];
  } else if (y.olayIdTopic !== undefined) {
    if (!log.topics[y.olayIdTopic]) return { sorun: ["olayId konusu yok"] };
    olayId = log.topics[y.olayIdTopic];
  } else {
    olayId = keccak256(coder.encode(["uint256", "bytes32", "uint256"],
      [y.kaynakZincir, log.transactionHash, BigInt(log.logIndex)]));
  }
  return { alici, miktar, olayId };
}

async function tur(y, cuzdan, durum) {
  const basSonuc = await rpc(y.kaynakRpc, "eth_blockNumber", []);
  const bas = BigInt(basSonuc);
  const guvenli = bas - BigInt(y.onay);
  if (guvenli <= durum.sonBlok) return 0;

  /* A bounded window, so a long outage does not turn the first run back
     into an unbounded scan of the chain. */
  const pencere = BigInt(y.blokPenceresi || 2000);
  let bitis = (guvenli - durum.sonBlok > pencere) ? durum.sonBlok + pencere : guvenli;

  const loglar = await rpc(y.kaynakRpc, "eth_getLogs", [{
    address: y.kaynakKontrat,
    topics: [id(y.olayImzasi)],
    fromBlock: "0x" + (durum.sonBlok + 1n).toString(16),
    toBlock: "0x" + bitis.toString(16)
  }]);

  const sinir = await hedefSinirlar(y);
  if (sinir.kaynakZincir !== BigInt(y.kaynakZincir))
    throw new Error("hedef kontratin kaynak zinciri " + sinir.kaynakZincir +
      ", yapilandirmada " + y.kaynakZincir + " — biri yanlis, imzalamiyorum");

  let imzalanan = 0;
  /* The lowest block whose canonicality could not be established. The
     cursor will not pass it, so the window is retried instead of the
     event being skipped forever. */
  let supheliBlok = null;
  const suphelen = (log) => {
    const b = BigInt(log.blockNumber);
    if (supheliBlok === null || b < supheliBlok) supheliBlok = b;
  };

  for (const log of loglar) {
    const c = olayCoz(y, log);
    if (c.sorun) {
      /* This used to print and move on. But getLogs already filtered by
         address and topic, so every reason olayCoz can fail — short data,
         a missing id word, a missing topic — means the config does not
         describe the event the chain is actually emitting. Skipping those
         one at a time advances the cursor over all of them, and the
         result is a bridge that quietly processes nothing while looking
         like it is running. No retry fixes a wrong layout, so it stops. */
      throw new Error("OLAY COZULEMEDI, yapilandirma zincirdeki olayi tanimlamiyor: " +
        c.sorun.join(", ") + "   tx " + log.transactionHash +
        " logIndex " + log.logIndex + "   imlec ILERLETILMEDI");
    }

    const dosya = path.join(y.imzaDizini, c.olayId.slice(2, 18) + "." + y.ad + ".json");
    if (fs.existsSync(dosya)) continue;

    if (c.miktar === 0n) { console.log("  ATLANDI  sifir miktar " + c.olayId.slice(0, 12)); continue; }
    if (c.miktar > sinir.islemTavani) {
      /* Over the contract's own per-transaction cap, so it cannot be
         signed now — but the cap is contract state and can be raised, and
         this is somebody's deposit. Holding the cursor here would block
         every other withdrawal behind one oversized one, so the cursor
         moves and the notice is written down instead, with everything
         needed to replay it. Lost quietly is the one outcome ruled out. */
      console.log("  IMZALAMADIM  islem tavani asiliyor: " + nf(c.miktar) +
        " > " + nf(sinir.islemTavani) + "   " + c.olayId.slice(0, 12));
      atlananiYaz(y, log, c, "islem tavani asildi: " + c.miktar + " > " + sinir.islemTavani);
      continue;
    }
    if (await kullanildiMi(y, c.olayId)) {
      console.log("  ATLANDI  hedefte zaten kullanilmis " + c.olayId.slice(0, 12));
      continue;
    }

    /* Depth is not canonicality. A log can be flagged removed, its
       transaction can have reverted, and the block it came from can have
       been replaced by another at the same height while still being
       buried. Each is cheap to check and each has been a real bridge
       failure somewhere. */
    if (log.removed === true) {
      /* And hold the cursor. This branch was the one place that skipped a
         log without marking its block suspect, so a window whose only
         logs were removed ones advanced the cursor straight past them —
         the exact defect fixed everywhere else, left behind in one
         branch. "removed" means a replacement may exist at that height,
         which is precisely when the window has to be read again. */
      console.log("  IMZALAMADIM  log removed isaretli " + c.olayId.slice(0, 12));
      suphelen(log);
      continue;
    }
    const makbuz = await rpc(y.kaynakRpc, "eth_getTransactionReceipt", [log.transactionHash]);
    if (!makbuz || makbuz.status !== "0x1") {
      console.log("  IMZALAMADIM  kaynak islem basarisiz ya da yok " + c.olayId.slice(0, 12));
      suphelen(log);
      continue;
    }
    const bagSorun = makbuzBagli(makbuz, log);
    if (bagSorun) {
      console.log("  IMZALAMADIM  " + bagSorun + "  " + c.olayId.slice(0, 12));
      suphelen(log);
      continue;
    }
    const blok = await rpc(y.kaynakRpc, "eth_getBlockByNumber", [log.blockNumber, false]);
    if (!blok || blok.hash !== log.blockHash) {
      console.log("  IMZALAMADIM  blok artik kanonik degil " + c.olayId.slice(0, 12) +
        "   log " + log.blockHash + " zincir " + (blok && blok.hash));
      suphelen(log);
      continue;
    }

    const imza = await cuzdan.signMessage(ozet(y, c.olayId, c.alici, c.miktar));
    fs.writeFileSync(dosya, JSON.stringify({
      olayId: c.olayId, alici: c.alici, miktar: c.miktar.toString(),
      hedefKontrat: y.hedefKontrat, hedefZincir: y.hedefZincir,
      kaynakZincir: y.kaynakZincir, kaynakTx: log.transactionHash,
      kaynakBlok: parseInt(log.blockNumber, 16), logIndex: parseInt(log.logIndex, 16),
      /* Recorded so the canonicality claim can be re-examined later
         rather than taken on the signer's word. */
      kaynakBlokHash: log.blockHash,
      imzaci: cuzdan.address, imza, zaman: new Date().toISOString()
    }, null, 1) + "\n");
    imzalanan++;
    console.log("  IMZALANDI  " + c.olayId.slice(0, 12) + "  ->  " + c.alici +
      "  " + nf(c.miktar) + "   blok " + parseInt(log.blockNumber, 16));
  }

  /* Do not step over a block whose history could not be established. The
     first version advanced regardless, so an event in a replaced block
     was skipped forever and the withdrawal silently never happened.
     Re-reading a block costs one call; skipping an event costs somebody
     their money. */
  bitis = imlecKarari(durum, supheliBlok, bitis);
  durum.sonBlok = bitis;
  imleciYaz(y, durum);
  return imzalanan;
}

(async function main() {
  const y = yapilandirmaOku();
  const anahtar = process.env[y.anahtarDegiskeni || "KOPRU_IMZACI_ANAHTARI"];
  if (!anahtar) {
    console.log("Anahtar yok. " + (y.anahtarDegiskeni || "KOPRU_IMZACI_ANAHTARI") +
      " ortam degiskenine koy.");
    console.log("Bu program anahtar URETMEZ ve hicbir yere YAZMAZ — sadece imzalar.");
    process.exit(1);
  }
  const cuzdan = new Wallet(anahtar.trim());

  fs.mkdirSync(y.imzaDizini, { recursive: true });
  y.durumDosyasi = y.durumDosyasi || path.join(y.imzaDizini, "durum." + y.ad + ".json");
  let durum = { sonBlok: BigInt(y.baslangicBlok || 0), tutulanBlok: null, tutulanTur: 0 };
  try {
    const d = JSON.parse(fs.readFileSync(y.durumDosyasi, "utf8"));
    durum = {
      sonBlok: BigInt(d.sonBlok),
      tutulanBlok: (d.tutulanBlok === undefined || d.tutulanBlok === null)
        ? null : BigInt(d.tutulanBlok),
      tutulanTur: d.tutulanTur || 0
    };
  } catch (e) { /* first run */ }

  console.log("KOPRU IMZACISI  " + y.ad);
  console.log("  imzaci adresi " + cuzdan.address);
  console.log("  kaynak        " + y.kaynakKontrat + "  zincir " + y.kaynakZincir);
  console.log("  hedef         " + y.hedefKontrat + "  zincir " + y.hedefZincir);
  console.log("  olay          " + y.olayImzasi);
  console.log("  onay derinligi " + y.onay + " blok");
  console.log("  finalite      " + y.finalitePolitikasi + " — " + y.finaliteNotu);
  console.log("  son islenen   " + durum.sonBlok);
  console.log("");

  /* Both endpoints have to be the chains the config names. Pointing the
     source at the wrong chain produces signatures over events that never
     happened on the chain the contract is told about, and nothing
     downstream would notice. */
  for (const [ad, url, beklenen] of [["kaynak", y.kaynakRpc, y.kaynakZincir],
                                     ["hedef", y.hedefRpc, y.hedefZincir]]) {
    const z = Number(BigInt(await rpc(url, "eth_chainId", [])));
    if (z !== Number(beklenen)) {
      console.log("  " + ad.toUpperCase() + " RPC YANLIS ZINCIR: " + z +
        ", yapilandirmada " + beklenen + ". Imzalamiyorum.");
      process.exit(1);
    }
    console.log("  " + ad.padEnd(7) + "zincir " + z + " dogrulandi");
  }
  console.log("");

  const sinir = await hedefSinirlar(y);
  console.log("  hedefin kendi sinirlari (kontrattan okundu, yapilandirmadan degil)");
  console.log("    esik         " + sinir.esik + " imza");
  console.log("    islem tavani " + nf(sinir.islemTavani));
  console.log("");

  /* The signer set has to include this key, or every signature it
     produces is wasted work and the operator should hear that now. */
  const uye = await rpc(y.hedefRpc, "eth_call", [{ to: y.hedefKontrat,
    data: sel("imzaciMi(address)") + coder.encode(["address"], [cuzdan.address]).slice(2) }, "latest"]);
  if (BigInt(uye) === 0n) {
    console.log("  BU ADRES HEDEFTE IMZACI DEGIL. Imzalar kabul edilmeyecek.");
    process.exit(1);
  }
  console.log("  bu adres hedefte imzaci olarak kayitli.");
  console.log("");

  do {
    try {
      const k = await tur(y, cuzdan, durum);
      if (k) console.log("  " + k + " yeni imza  (son blok " + durum.sonBlok + ")");
    } catch (e) {
      console.log("  TUR HATASI: " + e.message);
    }
    if (SUREKLI) await new Promise((r) => setTimeout(r, (y.araSaniye || 20) * 1000));
  } while (SUREKLI);
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
