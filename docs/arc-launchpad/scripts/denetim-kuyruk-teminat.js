"use strict";
/* Can the unbacked collateral actually be delisted, or only wished away?
 *
 * wNVDA and wAAPL are still listed as acceptable collateral in the live
 * queue, and the chain says 0.0127 wNVDA shares exist with nothing behind
 * them. Delisting goes through the queue's governor, which is a contract
 * and not a wallet — so the question is not whether anyone is willing but
 * whether anyone is able.
 *
 * Governor.propose demands the proposer hold at least MIN_OY_GUCU of
 * staked votes and at least PROPOSAL_THRESHOLD_BPS of the total staked,
 * and it reverts outright when total staked is zero. If nothing is
 * staked, nobody can propose anything and the collateral list is frozen
 * exactly as it stands. That is a much harder fact than "needs a
 * proposal", so it gets measured from the chain and archived rather than
 * repeated from memory.
 *
 * Read-only. Nothing is sent, nothing is signed.
 */
const fs = require("fs");
const path = require("path");
const { id: keccakId, AbiCoder, getAddress } = require("ethers");
const { Arsivci } = require("./arsivci.js");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim.json"), "utf8"));
const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-yonetisim.json"), "utf8"));
const DIZIN = path.join(__dirname, "..", "kanit-yonetisim");

const coder = AbiCoder.defaultAbiCoder();
const sel = (imza) => keccakId(imza).slice(0, 10);
const ars = Arsivci(DIZIN);

const KURUCU = getAddress(D.operator);
const GOV = getAddress(G.governor);
const STAKE = getAddress(G.staking);
const JETON = getAddress(G.govToken);
const KUYRUK = getAddress(D.queue);
const TEMINATLAR = {
  wNVDA: "0xA3cd6fD4316DB70C06931A233FDddC48c2879DC4",
  wAAPL: "0xCfDbc078E513930bF6A4B4DDB7eD6123E8A7d342"
};

const ond = (x, b) => {
  if (x === null) return "OKUNAMADI";
  const d = 10n ** BigInt(b);
  return (x / d) + "." + (x % d).toString().padStart(b, "0");
};
let gecen = 0, kalan = 0;
const ok = (ad, kosul, not) => {
  if (kosul) { gecen++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kalan++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};

async function oku(ad, to, imza, arg, ek) {
  const data = sel(imza) + (arg ? coder.encode(["address"], [arg]).slice(2) : "");
  const r = await ars.al(ad, ARC_RPC, "eth_call", [{ to, data }, "latest"], ek);
  if (!r.sonuc || r.sonuc === "0x") return null;
  return BigInt(r.sonuc);
}
const adresten = (w) => w === null ? null
  : getAddress("0x" + w.toString(16).padStart(64, "0").slice(24));

(async function () {
  console.log("");
  console.log("CANLI KUYRUKTA TEMINAT DELIST EDILEBILIR MI");
  console.log("  kuyruk   " + KUYRUK);
  console.log("  governor " + GOV);
  console.log("  staking  " + STAKE);
  console.log("  kurucu  " + KURUCU);
  console.log("");

  const z = await ars.al("zincir-arc", ARC_RPC, "eth_chainId", []);
  if (!z.sonuc) { console.log("  RPC yanit vermiyor: " + z.hata); return; }

  /* ---- is the queue governed by the contract we think? ----------- */
  const kuyrukGov = adresten(await oku("kuyruk-governor", KUYRUK, "governor()"));
  console.log("  kuyrugun governor'u " + kuyrukGov);
  ok("kuyrugun governor'u beklenen kontrat",
     !!kuyrukGov && kuyrukGov.toLowerCase() === GOV.toLowerCase());
  ok("governor kurucu cuzdani DEGIL — tek imzayla delist yok",
     !!kuyrukGov && kuyrukGov.toLowerCase() !== KURUCU.toLowerCase());

  /* ---- what the list says today --------------------------------- */
  console.log("");
  console.log("CANLI TEMINAT LISTESI");
  /* The queue keys collateral by a share symbol hash, not by token
     address: sarmalOf[hisse] -> wrapped token. My first version looked it
     up by address, every read came back unreadable, and the check then
     reported "the unbacked collateral is NOT listed" — an unreadable
     answer counted as a clean one. Enumerated properly here, and an
     unreadable list is reported as unreadable rather than as empty. */
  /* Has the queue ever been used at all? If talepSayisi is zero then
     TalepAcildi has never fired, and anything built on that event has no
     data behind it. Worth knowing before anybody writes an analyser. */
  const talepSayisi = await oku("kuyruk-talep-sayisi", KUYRUK, "talepSayisi()");
  const ucret = await oku("kuyruk-ucret-ppm", KUYRUK, "ucretPpm()");
  console.log("  toplam talep " + (talepSayisi === null ? "OKUNAMADI" : talepSayisi) +
    (talepSayisi === 0n ? "   (kuyruk hic kullanilmamis — TalepAcildi hic tetiklenmemis)" : "") +
    "   ucret " + (ucret === null ? "?" : Number(ucret) / 10000 + "%"));

  const sayi = await oku("kuyruk-hisse-sayisi", KUYRUK, "hisseSayisi()");
  const ters = {};
  for (const [ad, adres] of Object.entries(TEMINATLAR)) ters[adres.toLowerCase()] = ad;

  if (sayi === null) {
    console.log("  LISTE OKUNAMADI — bu 'liste bos' DEMEK DEGIL, hicbir sey bilmiyorum.");
    kalan++;
  } else {
    console.log("  listedeki hisse sayisi " + sayi);
    const listeliOlanlar = [];
    let okunamayan = 0;
    for (let i = 0; i < Number(sayi); i++) {
      const anahtar = await ars.al("kuyruk-hisse-" + i, ARC_RPC, "eth_call",
        [{ to: KUYRUK, data: sel("hisseler(uint256)") +
            coder.encode(["uint256"], [i]).slice(2) }, "latest"], { indeks: i });
      if (!anahtar.sonuc) { okunamayan++; console.log("  [" + i + "] OKUNAMADI"); continue; }
      const key = anahtar.sonuc;
      /* sarmalOf takes bytes32, so it is encoded directly rather than as
         an address. */
      const s = await ars.al("kuyruk-sarmalof-" + i, ARC_RPC, "eth_call",
        [{ to: KUYRUK, data: sel("sarmalOf(bytes32)") + key.slice(2) }, "latest"], { indeks: i });
      if (!s.sonuc) { okunamayan++; console.log("  [" + i + "] " + key.slice(0, 18) + " sarmal OKUNAMADI"); continue; }
      const sarmal = getAddress("0x" + s.sonuc.slice(26));
      const etiket = ters[sarmal.toLowerCase()];
      /* The key is a symbol hash; the symbol is recoverable only by
         guessing, so candidates are tried rather than claimed. */
      let sembol = "";
      for (const c of ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "GOOGL", "META", "SPY"])
        if (keccakId(c) === key) sembol = c;
      console.log("  [" + i + "] " + (sembol || key.slice(0, 18)).padEnd(10) + sarmal +
        (etiket ? "   <-- " + etiket + " KARSILIKSIZ" : ""));
      if (etiket) listeliOlanlar.push(etiket);
    }
    ok("liste tamamen okunabildi", okunamayan === 0,
       okunamayan ? okunamayan + " giris okunamadi" : "");
    ok("karsiliksiz teminatlar listede DEGIL",
       okunamayan === 0 && listeliOlanlar.length === 0,
       listeliOlanlar.length ? listeliOlanlar.join(", ") + " HALA LISTELI" : "");
  }

  /* ---- and whether anybody can change it ------------------------ */
  console.log("");
  console.log("TEKLIF VERILEBILIR MI");
  const minGuc = await oku("gov-min-oy-gucu", GOV, "MIN_OY_GUCU()");
  const esikBps = await oku("gov-esik-bps", GOV, "PROPOSAL_THRESHOLD_BPS()");
  const kuorumBps = await oku("gov-kuorum-bps", GOV, "QUORUM_BPS()");
  const oyPeriyodu = await oku("gov-oy-periyodu", GOV, "VOTING_PERIOD()");
  const timelock = await oku("gov-timelock", GOV, "TIMELOCK()");
  const govStaking = adresten(await oku("gov-staking", GOV, "staking()"));
  console.log("  governor'un staking'i " + govStaking);
  console.log("  MIN_OY_GUCU           " + ond(minGuc, 18));
  console.log("  teklif esigi          " + (esikBps === null ? "?" : Number(esikBps) / 100 + "%"));
  console.log("  kuorum                " + (kuorumBps === null ? "?" : Number(kuorumBps) / 100 + "%"));
  console.log("  oy periyodu           " + (oyPeriyodu === null ? "?" : Number(oyPeriyodu) / 86400 + " gun"));
  console.log("  timelock              " + (timelock === null ? "?" : Number(timelock) / 86400 + " gun"));
  ok("governor dagitimdaki staking'i kullaniyor",
     !!govStaking && govStaking.toLowerCase() === STAKE.toLowerCase());

  let toplam = await oku("stake-toplam", STAKE, "totalStaked()");
  if (toplam === null) toplam = await oku("stake-toplam-2", STAKE, "toplamStake()");
  if (toplam === null) toplam = await oku("stake-arz", STAKE, "totalSupply()");
  /* votingPower is the name Governor.propose actually calls — read out of
     Governor.sol rather than guessed. The first version tried votesOf,
     oyGucu and balanceOf, all three missed, and the report said the
     the founder's voting power was unreadable when it was simply being asked
     the wrong question. */
  let kurucuGuc = await oku("stake-kurucu-oy", STAKE, "votingPower(address)", KURUCU, { adres: KURUCU });
  if (kurucuGuc === null) kurucuGuc = await oku("stake-kurucu-stake", STAKE, "stakedOf(address)", KURUCU, { adres: KURUCU });
  const kurucuJeton = await oku("jeton-kurucu-bakiye", JETON, "balanceOf(address)", KURUCU, { adres: KURUCU });

  console.log("");
  console.log("  TOPLAM STAKE     " + ond(toplam, 18));
  console.log("  KURUCUNUN OY GUCU    " + ond(kurucuGuc, 18));
  console.log("  kurucunun stake EDILMEMIS jetonu " + ond(kurucuJeton, 18));

  if (toplam === 0n) {
    console.log("");
    console.log("  TOPLAM STAKE SIFIR.");
    console.log("  Governor.propose, total == 0 iken dogrudan reddediyor. Yani bu");
    console.log("  kuyrugun teminat listesini SU AN HIC KIMSE degistiremez — ne ben,");
    console.log("  ne kullanici, ne baskasi. 'Delist bir teklif gerektiriyor' demek");
    console.log("  eksikti; dogrusu: once stake edilmesi gerekiyor, sonra teklif.");
    if (kurucuJeton !== null && minGuc !== null && kurucuJeton >= minGuc) {
      console.log("");
      console.log("  AMA YOL KAPALI DEGIL: kurucunun elinde stake edilmemis " + ond(kurucuJeton, 18));
      console.log("  jeton var ve MIN_OY_GUCU " + ond(minGuc, 18) + ". Stake edilirse");
      console.log("  toplamin %100'u olur, yani esik ve kuorum da karsilanir.");
      const sure = (Number(oyPeriyodu || 0n) + Number(timelock || 0n)) / 86400;
      console.log("  Delist zinciri: stake -> propose -> " + (Number(oyPeriyodu || 0n) / 86400) +
        " gun oy -> queue -> " + (Number(timelock || 0n) / 86400) + " gun timelock -> execute");
      console.log("  En erken bitis: yaklasik " + sure + " gun.");
    }
    kalan++;
  } else if (toplam !== null && kurucuGuc !== null && minGuc !== null) {
    const esik = esikBps === null ? 100n : esikBps;
    const verebilir = kurucuGuc >= minGuc && kurucuGuc * 10000n >= toplam * esik;
    ok("kurucu teklif verebilir", verebilir);
    if (kuorumBps !== null) {
      const gereken = (toplam * kuorumBps) / 10000n;
      ok("kurucu tek basina kuorumu karsilar", kurucuGuc >= gereken, "gereken " + ond(gereken, 18));
    }
  }

  const ozet = ars.ozetYaz({
    amac: "Canli kuyrugun teminat listesinin gercekten degistirilebilir olup olmadiginin " +
          "zincirden olculmesi. wNVDA karsiliksiz oldugu zincirden dogrulandi; soru " +
          "listeden cikarmanin MUMKUN olup olmadigi.",
    arcRpc: ARC_RPC, kuyruk: KUYRUK, governor: GOV, staking: STAKE, govToken: JETON,
    kurucu: KURUCU, teminatlar: TEMINATLAR
  });
  console.log("");
  console.log("  " + gecen + " gecti, " + kalan + " kaldi");
  console.log("  " + ozet.kayit + " kayit, " + ozet.basarisiz + " basarisiz, " +
    ars.cagri + " cagri");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
