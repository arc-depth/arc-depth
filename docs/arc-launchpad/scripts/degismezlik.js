"use strict";
/* Can this contract's behaviour ever change?
   
   An ABI with no withdraw() proves only what was compiled today. It says
   nothing about tomorrow, and "we will not add one" is a promise rather
   than a property. What CAN be proved from the bytes is that the code is
   unable to change at all:
   
     DELEGATECALL  runs somebody else's code against this contract's own
                   storage, which is how every proxy upgrade works
     CALLCODE      the older form of the same thing
     SELFDESTRUCT  since Cancun it no longer wipes code in general, but a
                   CREATE2 contract that destroys itself inside its own
                   construction transaction can be replaced at the same
                   address, so its absence is still worth stating
     CREATE/CREATE2 deploying is a job some contracts have and the vault
                   does not
   
   A contract holding none of these cannot be upgraded, re-pointed or
   replaced by anyone, us included. There is no instruction in it that
   could carry out such a change.
   
   ---------------------------------------------------------------------
   THREE WAYS THIS SCAN CAN LIE, AND WHAT IS DONE ABOUT EACH
   
   1. PUSH operands are data. PUSH1..PUSH32 carry their operand inline, so
      a byte search finds 0xf4 inside a constant and reports a
      DELEGATECALL that does not exist. Fixed by walking instructions.
   
   2. The metadata tail is data. Solidity appends a CBOR blob holding the
      IPFS hash of the sources. The first run of this scan reported
      CREATE@18670 and DELEGATECALL@18675 in Launchpad; both were bytes of
      an IPFS hash. Fixed by stripping the blob using its own length
      suffix.
   
   3. Embedded contracts are data. A contract that deploys another with
      `new` carries that contract's creation code inside its own bytecode.
      The same run reported CALLCODE and two CREATE2s in Launchpad; all
      three were inside the embedded LaunchToken. There is no general way
      to skip such a region while walking linearly, so instead the regions
      are located and every finding is classified against them — and a
      finding that lands in neither metadata nor a known embedded region
      is reported as REAL.
   
   4. Metadata is not only at the end. Every embedded contract carries its
      OWN metadata blob, so the blobs sit in the MIDDLE of the bytecode
      too. Stripping just the tail left DELEGATECALL@18675 in Launchpad
      reported as real code; it was a byte of an inner IPFS hash. So the
      blobs are found wherever they are, by their marker and by the length
      field that follows them, and a marker whose length field does not
      agree is not treated as metadata — a guess there would delete real
      instructions and turn this scan into the thing it is checking for.
   
   Each of those would have produced a confident, false answer. Two of
   them would have been false alarms; the first could just as easily hide
   a real DELEGATECALL, which is the direction that actually matters. */

const OPCODES = {
  0xf0: "CREATE",
  0xf2: "CALLCODE",
  0xf4: "DELEGATECALL",
  0xf5: "CREATE2",
  0xff: "SELFDESTRUCT"
};

/// The opcodes that let code change. CREATE is deliberately not here: the
/// launchpad's whole job is deploying, and a vault that deploys nothing is
/// checked for CREATE separately.
const DEGISTIRENLER = { 0xf2: "CALLCODE", 0xf4: "DELEGATECALL", 0xff: "SELFDESTRUCT" };

const onEkSiz = (k) => String(k).replace(/^0x/, "").toLowerCase();

/// Splits the executable part from the trailing CBOR metadata blob.
///
/// The last two bytes are the blob's length, big-endian, not counting
/// themselves. A length that does not land on a CBOR map header (0xa1-0xbf)
/// means the tail is not metadata, and then nothing is stripped — guessing
/// would remove real code.
function metadataAyir(kod) {
  const h = onEkSiz(kod);
  if (h.length < 8) return { kod: h, meta: "" };
  const uzunluk = parseInt(h.slice(-4), 16);
  const basla = h.length - 4 - uzunluk * 2;
  if (!(uzunluk > 0) || basla < 0) return { kod: h, meta: "" };
  const ilk = parseInt(h.slice(basla, basla + 2), 16);
  if (ilk < 0xa1 || ilk > 0xbf) return { kod: h, meta: "" };
  return { kod: h.slice(0, basla), meta: h.slice(basla) };
}

/// Walks `kod` one instruction at a time and reports which of `aranan`
/// actually execute, with the byte offset of each.
function tara(kod, aranan = OPCODES, metadataAt = true) {
  const { kod: govde, meta } = metadataAt ? metadataAyir(kod) : { kod: onEkSiz(kod), meta: "" };
  if (govde.length % 2 !== 0) throw new Error("bytecode tek sayida karakter");
  const b = Buffer.from(govde, "hex");
  const bulunan = [];
  let i = 0, komut = 0;
  while (i < b.length) {
    const op = b[i];
    komut++;
    if (aranan[op]) bulunan.push({ op, ad: aranan[op], ofset: i });
    /* PUSH1..PUSH32 are 0x60..0x7f and carry n operand bytes that are data,
       not instructions. PUSH0 (0x5f) carries none. */
    i += (op >= 0x60 && op <= 0x7f) ? 1 + (op - 0x5f) : 1;
  }
  return { bulunan, komut, bayt: b.length, metaBayt: meta.length / 2 };
}

/* The CBOR map header solc writes before the IPFS hash: a2 64 "ipfs" 58 22 */
const META_IM = "a264697066735822";

/// Every metadata blob in `kod`, wherever it sits.
///
/// A blob is followed by its own length as two big-endian bytes, so a
/// marker at p is confirmed only when some q ahead of it carries a length
/// equal to q - p. That is what tells a real blob from the same byte
/// sequence appearing by chance, and it is why nothing is stripped on the
/// strength of the marker alone.
function metadataBolgeleri(kod) {
    const h = onEkSiz(kod);
    const bolgeler = [];
    let ara = 0;
    for (;;) {
        const y = h.indexOf(META_IM, ara);
        if (y < 0) break;
        ara = y + 2;
        if (y % 2 !== 0) continue;               // not on a byte boundary
        const bas = y / 2;
        let bulundu = false;
        for (let uz = 20; uz <= 300; uz++) {     // solc blobs are ~50-120 bytes
            const q = (bas + uz) * 2;
            if (q + 4 > h.length) break;
            if (parseInt(h.slice(q, q + 4), 16) === uz) {
                bolgeler.push({ ad: "metadata", bas, bit: bas + uz + 2 });
                bulundu = true;
                break;
            }
        }
        if (!bulundu) bolgeler.push({ ad: "metadata?", bas, bit: bas, dogrulanmadi: true });
    }
    return bolgeler;
}

/* The one template this project's compiler emits, as bytes. Anything that
   does not match it exactly is not something this code understands, and
   an unrecognised metadata block gets no mask. */
const SOLC_IPFS_SABLON = [
  { ofset: 0,  bayt: [0xa2] },                               // map(2)
  { ofset: 1,  bayt: [0x64, 0x69, 0x70, 0x66, 0x73] },       // text(4) "ipfs"
  { ofset: 6,  bayt: [0x58, 0x22, 0x12, 0x20] },             // bytes(34), sha2-256
  // 10..42  -> the digest, the only window that may differ
  { ofset: 42, bayt: [0x64, 0x73, 0x6f, 0x6c, 0x63] },       // text(4) "solc"
  { ofset: 47, bayt: [0x43] }                                // bytes(3) version
];
const OZET_BAS = 10, OZET_UZUNLUK = 32, SABLON_UZUNLUK = 53;

/// The byte ranges inside `kod` that may legitimately differ between two
/// builds of the same contract: the source digest, and nothing else.
///
/// Masking the whole metadata block was too generous — it hid the
/// compiler version and the CBOR structure along with the hash. A
/// different compiler is a real difference. This returns only the digest
/// windows, and returns NONE for any block whose shape it does not
/// recognise, so an unfamiliar format fails closed rather than open.
function metadataOzetPencereleri(kod) {
  const b = Buffer.from(onEkSiz(kod), "hex");
  const out = [];
  for (const r of metadataBolgeleri(kod)) {
    if (r.dogrulanmadi) continue;
    if (r.bit - r.bas !== SABLON_UZUNLUK) continue;      // not this template
    let uyuyor = true;
    for (const p of SOLC_IPFS_SABLON) {
      for (let i = 0; i < p.bayt.length; i++) {
        if (b[r.bas + p.ofset + i] !== p.bayt[i]) { uyuyor = false; break; }
      }
      if (!uyuyor) break;
    }
    if (!uyuyor) continue;
    out.push({ bas: r.bas + OZET_BAS, bit: r.bas + OZET_BAS + OZET_UZUNLUK });
  }
  return out;
}

/// Where `ic`'s creation code sits inside `dis`, if it is embedded at all.
/// Matched by the longest prefix that is actually present, because
/// constructor arguments are appended at run time and are not in the
/// stored copy.
function gomuluBolge(disKod, icKod) {
  const d = metadataAyir(disKod).kod;
  const c = onEkSiz(icKod);
  for (const n of [c.length, 6000, 4000, 3000, 2000, 1200, 800]) {
    const p = c.slice(0, Math.min(n, c.length));
    if (p.length < 400) break;
    const y = d.indexOf(p);
    if (y >= 0) return { bas: y / 2, bit: (y + p.length) / 2, eslesen: p.length / 2 };
  }
  return null;
}

/// Full verdict for one contract: findings classified as real code or as
/// bytes of something embedded in it.
function denetle(kod, gomulular = [], aranan = OPCODES) {
  const r = tara(kod, aranan);
  /* Inner metadata blobs first: they are data no matter whose they are,
     and unlike an embedded contract they can be found without being told
     what to look for. */
  const bolgeler = metadataBolgeleri(kod).filter((b) => !b.dogrulanmadi);
  for (const g of gomulular) {
    const b = gomuluBolge(kod, g.kod);
    if (b) bolgeler.push({ ad: g.ad, ...b });
  }
  const gercek = [], veri = [];
  for (const f of r.bulunan) {
    const ic = bolgeler.find((b) => f.ofset >= b.bas && f.ofset < b.bit);
    (ic ? veri : gercek).push(ic ? { ...f, icinde: ic.ad } : f);
  }
  return { ...r, bolgeler, gercek, veri };
}

/* Byte windows that hold immutable values, from solc's own report. Without
   these the comparison cannot tell an immutable from a changed
   instruction. */
function degismezPencereler(yapit) {
  const out = [];
  const ref = yapit.immutableReferences || {};
  for (const anahtar of Object.keys(ref)) {
    for (const r of ref[anahtar]) out.push({ bas: r.start, uzunluk: r.length, id: anahtar });
  }
  return out.sort((a, b) => a.bas - b.bas);
}

/// Canonical, even-length, non-empty hex. Anything else is refused by
/// name rather than coerced.
///
/// This exists because of the worst of the three defects Codex found.
/// Buffer.from("zz", "hex") returns an EMPTY buffer rather than throwing,
/// and so does Buffer.from("", "hex"). So a corrupt artifact compared
/// against an empty chain response gave two zero-length buffers, the
/// lengths "matched", there were no differing bytes, and the audit
/// announced "deployed code == compiled code". A false green on the one
/// question the script exists to answer.
function hexAyikla(x, ad) {
  const h = String(x == null ? "" : x).replace(/^0x/i, "");
  if (h.length === 0) throw new Error(ad + ": bos hex");
  if (h.length % 2 !== 0) throw new Error(ad + ": tek uzunlukta hex (" + h.length + ")");
  if (!/^[0-9a-fA-F]+$/.test(h)) throw new Error(ad + ": hex olmayan karakter");
  return Buffer.from(h, "hex");
}

function karsilastir(derlenen, zincirdeki, pencereler) {
  const a = hexAyikla(derlenen, "derlenen");
  const b = hexAyikla(zincirdeki, "zincirdeki");
  if (a.length !== b.length) return { uzunlukFarki: [a.length, b.length] };
  /* A window that runs past the end of the code would silently excuse
     every byte after it, because the containment test is a range check. */
  for (const p of pencereler) {
    /* Integral, because a fractional start slips through a pure bounds
       check and then widens the containment test: {bas: 0.5, uzunluk: 1}
       satisfies 0.5 >= 0 and 1.5 <= length, and then i >= 0.5 && i < 1.5
       is true for i = 1 — so a real differing byte is counted as an
       immutable. Found by Codex reading this function. */
    if (!Number.isSafeInteger(p.bas) || !Number.isSafeInteger(p.uzunluk))
      throw new Error("degismez penceresi tam sayi degil: bas " + p.bas +
        ", uzunluk " + p.uzunluk);
    if (!(p.bas >= 0 && p.uzunluk > 0 && p.bas + p.uzunluk <= a.length))
      throw new Error("degismez penceresi kodun disinda: bas " + p.bas +
        ", uzunluk " + p.uzunluk + ", kod " + a.length);
  }
  const icinde = (i) => pencereler.some((p) => i >= p.bas && i < p.bas + p.uzunluk);
  /* The metadata CBOR holds the IPFS hash of the SOURCES, so editing a
     comment changes it while the executable code stays identical. That is
     a real and reportable difference — the deployed contract was built
     from another revision — but it is not a code mismatch, and calling it
     one would mean a corrected comment looks like a tampered contract.

     BOTH SIDES ARE PARSED. Taking the regions from the compiled artifact
     alone made the mask one-sided: flip the compiled CBOR header a2 to ff
     on the chain side and the difference lands "inside metadata" and is
     excused, although the deployed contract has no metadata there. A mask
     that only inspects the side it trusts is a blind spot shaped like a
     mask.

     So the regions must AGREE on both sides — same count, same offsets,
     same lengths — and each must still begin with the CBOR map header.
     Only a difference in the hash VALUE is classed as a source-revision
     difference; a difference in the header, the length field or the
     structure is never masked and counts as real. */
  /* ONLY THE SOURCE DIGEST. Masking the whole metadata block excused the
     CBOR structure and the COMPILER VERSION along with the hash, and a
     different compiler is a real difference. metadataOzetPencereleri
     parses the block against the exact template solc emits and returns
     only the 32-byte sha2-256 window; an unrecognised block returns
     nothing, so it fails closed. */
  const metaD = metadataOzetPencereleri(derlenen);
  const metaZ = metadataOzetPencereleri(zincirdeki);
  const bolgelerUyusuyor =
    metaD.length > 0 &&
    metaD.length === metaZ.length &&
    metaD.every((m, k) => m.bas === metaZ[k].bas && m.bit === metaZ[k].bit);
  /* The header byte must be a CBOR map on BOTH sides at the same offset.
     This is the specific byte Codex's counter-example changed. */
  /* The template check inside metadataOzetPencereleri already validated
     every structural byte on each side, including the map header, both
     key names and the compiler-version prefix. What is left to require
     is that the two sides produced the SAME windows. */
  const basliklarSaglam = bolgelerUyusuyor;
  const meta = basliklarSaglam ? metaD : [];
  const metaIcinde = (i) => meta.some((m) => i >= m.bas && i < m.bit);
  const hesapli = [], metaFark = [], hesapsiz = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (icinde(i)) hesapli.push(i);
    else if (metaIcinde(i)) metaFark.push(i);
    else hesapsiz.push(i);
  }
  return {
    uzunluk: a.length, hesapli, metaFark, hesapsiz,
    pencereSayisi: pencereler.length,
    metaBolgeDerlenen: metaD.length, metaBolgeZincir: metaZ.length,
    metaMaskeUygulandi: basliklarSaglam,
    metaMaskeNedeni: basliklarSaglam ? null
      : (!bolgelerUyusuyor ? "iki tarafin metadata bolgeleri AYNI DEGIL"
                           : "CBOR basligi iki tarafta da saglam degil")
  };
}


module.exports = {
  karsilastir,
  degismezPencereler,
  hexAyikla,
  OPCODES, DEGISTIRENLER, tara, denetle, metadataAyir, gomuluBolge,
  metadataBolgeleri, metadataOzetPencereleri
};

if (require.main === module) {
  const fs = require("fs"), path = require("path");
  const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
  /* The vault, the token, the hook, the grader and the lock deploy nothing
     and must be clean of all five. The launchpad deploys four contracts, so
     CREATE is its job; it is still held to no DELEGATECALL, CALLCODE or
     SELFDESTRUCT, and the contracts it embeds are named so their bytes are
     not mistaken for its instructions. */
  const PLAN = [
    { ad: "CollateralVault", aranan: OPCODES, gomulu: [] },
    { ad: "LaunchToken", aranan: OPCODES, gomulu: [] },
    { ad: "ArcLaunchHook", aranan: OPCODES, gomulu: [] },
    { ad: "TeminatKarnesi", aranan: OPCODES, gomulu: [] },
    { ad: "Vesting", aranan: OPCODES, gomulu: [] },
    {
      ad: "Launchpad", aranan: OPCODES, izinli: ["CREATE"],
      gomulu: ["LaunchToken", "CollateralVault", "Vesting", "TeminatKarnesi"]
    },
    /* The curve path. These three deploy nothing at all, so they are held
       to the same clean standard as the vault and the token. */
    { ad: "Egri", aranan: OPCODES, gomulu: [] },
    { ad: "HavuzAcici", aranan: OPCODES, gomulu: [] },
    { ad: "HolderRewards", aranan: OPCODES, gomulu: [] },
    /* EgriLaunch is the fork of Egri that carries the launchpad's fee
       table. Same standard as the original it was copied from. */
    { ad: "EgriLaunch", aranan: OPCODES, gomulu: [] },
    /* EgriLaunchpad used to deploy nothing. It deploys ONE thing now —
       each launch its own TeminatKasasi — because the vault takes the
       creator's basket as an array and plumbing that through a third
       factory buys nothing. So CREATE is allowed here, deliberately, and
       the embedded vault is named so its bytes are not read as
       instructions. A contract that quietly started deploying would be a
       finding; one that says so is a decision. */
    {
      ad: "EgriLaunchpad", aranan: OPCODES, izinli: ["CREATE"],
      gomulu: ["TeminatKasasi"]
    },
    /* The factories are the ones that create, so CREATE is their job. They
       are split because HavuzAcici's 8,557 bytes of creation code took the
       single factory to 24,146 against a 24,576 limit. */
    {
      ad: "EgriFabrika", aranan: OPCODES, izinli: ["CREATE"],
      gomulu: ["LaunchToken", "HolderRewards", "EgriLaunch"]
    },
    /* The ladder, which is the launchpad's market from the first second.
       It deploys nothing, so it is held to the strict standard. */
    { ad: "TekYonluAcici", aranan: OPCODES, gomulu: [] },
    /* The hook. It pays out during the swap rather than into a bucket, so
       it transfers to five addresses and a ladder — and still creates
       nothing and delegates to nothing. */
    { ad: "EgriHook", aranan: OPCODES, gomulu: [] },
    /* The two fee destinations that are contracts rather than wallets.
       Both hold money, so both are held to the strict standard: neither
       creates, delegates, or can be destroyed out from under the balance
       it is keeping. */
    { ad: "LikiditeKasasi", aranan: OPCODES, gomulu: [] },
    { ad: "GelistiriciFonu", aranan: OPCODES, gomulu: [] },
    /* The collateral vault. It lends to strangers and burns what comes
       back, so it is the one holding money during an untrusted callback —
       held to the strict standard. */
    { ad: "TeminatKasasi", aranan: OPCODES, gomulu: [] },
    /* The value adapter and the registry. Both read-only as far as the
       chain is concerned: they hold nothing, deploy nothing, and the
       strongest thing either can do is refuse. */
    { ad: "ChainlinkOracle", aranan: OPCODES, gomulu: [] },
    { ad: "VarlikKayit", aranan: OPCODES, gomulu: [] },
    {
      ad: "AciciFabrika", aranan: OPCODES, izinli: ["CREATE"],
      gomulu: ["TekYonluAcici"]
    },
    /* The two contracts that handle somebody else's money in flight. The
       router moves a trader's funds pool-ward and back; the buyback robot
       holds a vault's borrowed asset for the length of one call and
       forwards the reward to whoever paid the gas. Neither has an owner,
       a pause or a sweep, so "cannot be changed and cannot delegate" is
       the whole of their security argument — worth proving rather than
       asserting in a comment. */
    { ad: "SwapRouter", aranan: OPCODES, gomulu: [] },
    { ad: "GeriAlimRobotu", aranan: OPCODES, gomulu: [] },
    /* The cross-chain ledger. It holds no tokens and makes no transfers —
       it is pure accounting a vault writes through — so it has no business
       containing a CALL of any kind, let alone a DELEGATECALL. */
    { ad: "CrossChainAccounting", aranan: OPCODES, gomulu: [] },
    /* The registry derives addresses and stores none; the manager holds no
       tokens and only ever calls the vault and the ledger. Neither has any
       business containing a DELEGATECALL. */
    { ad: "CrossChainAssetRegistry", aranan: OPCODES, gomulu: [] },
    { ad: "CrossChainCollateralManager", aranan: OPCODES, gomulu: [] },
    /* The remote side. The factory deploys with CREATE2, which is why it
       has CREATE in its allowed set and names what it embeds; the vault and
       the executor deploy nothing and must not. */
    {
      /* CREATE2 only. The factory deploys with a salt, so the runtime
         contains CREATE2 and not CREATE — measured, the scan finds only
         CREATE2. An unused permission grants nothing now and hides the
         opcode it names later. */
      ad: "RemoteVaultFactory", aranan: OPCODES, izinli: ["CREATE2"],
      gomulu: ["RemoteCollateralVault"]
    },
    { ad: "RemoteCollateralVault", aranan: OPCODES, gomulu: [] },
    { ad: "RemoteSwapExecutor", aranan: OPCODES, gomulu: [] },
    /* The Arc-side bridge vault creates its own ledger in its
       constructor, so that the ledger's owner cannot be anything but
       this vault. Hence CREATE, with what it embeds named. */
    {
      /* No CREATE permission, deliberately. This vault does deploy its
         own ledger — but in its CONSTRUCTOR, so the opcode lives in the
         creation code and never in the runtime this scanner reads.
         Measured: the scan reports a bare DEGISTIREMEZ with no permitted
         list at all. Leaving the permission in would grant nothing today
         and stand ready to hide a CREATE added to a runtime function
         tomorrow. */
      ad: "KopruKasasi", aranan: OPCODES, izinli: [],
      gomulu: ["CrossChainAccounting"]
    }
  ];
  let kotu = 0;
  for (const p of PLAN) {
    const j = B(p.ad);
    const d = denetle(j.deployedBytecode, p.gomulu.map((g) => ({ ad: g, kod: B(g).bytecode })), p.aranan);
    const izin = new Set(p.izinli || []);
    const sorun = d.gercek.filter((f) => !izin.has(f.ad));
    if (sorun.length) kotu++;
    console.log(
      p.ad.padEnd(16) + String(d.bayt).padStart(7) + " bayt " +
      String(d.komut).padStart(6) + " komut  meta " + String(d.metaBayt).padStart(3) + "b  " +
      (sorun.length ? "KOTU: " + sorun.map((f) => f.ad + "@" + f.ofset).join(", ")
        : "DEGISTIREMEZ" + (d.gercek.length ? " (izinli: " + d.gercek.map((f) => f.ad).join(",") + ")" : ""))
    );
    for (const v of d.veri) console.log("".padEnd(18) + "veri: " + v.ad + "@" + v.ofset + " -> " + v.icinde + " icinde");
  }

  /* One PASS line per contract, so the master runner can count what this
     audit actually verified. It used to print none, which made a real
     scan of every production contract contribute zero to the headline
     number — and left a reader free to assume it was a no-op. */
  console.log("");
  for (const p2 of PLAN) {
    const j = B(p2.ad);
    const d = denetle(j.deployedBytecode, p2.gomulu.map((g) => ({ ad: g, kod: B(g).bytecode })), p2.aranan);
    const izin = new Set(p2.izinli || []);
    const sorun = d.gercek.filter((f) => !izin.has(f.ad));
    console.log("  " + (sorun.length ? "KOTU" : "PASS") + "  " + p2.ad +
      " DEGISTIREMEZ" +
      (sorun.length ? "   " + sorun.map((f) => f.ad + "@" + f.ofset).join(", ")
        : "   " + d.komut.toLocaleString("en") + " komut tarandi" +
          (izin.size ? ", izinli: " + [...izin].join(",") : "")));
  }
  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu ? 1 : 0);
}
