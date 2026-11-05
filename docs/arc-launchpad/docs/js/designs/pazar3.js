/* ===========================================================================
 * designs/pazar3.js — the Designs market v3 on Arc (TasarimPazar3)
 *
 * Contract: contracts/urun/designs/TasarimPazar3.sol (deploy record
 * dagitim-pazar3.json). It sits next to TasarimNFT2 and moves NFTs only with
 * the holder's ERC-721 approval. A listed design waits in the market's custody
 * (the seller changes the price, accepts an offer, starts an auction or takes
 * it back without a new approval), so a listing cannot outlive the seller's
 * hold on the NFT. Offers (USDC escrowed by the buyer), timed
 * auctions (reserve, minimum step, anti-snipe, outbid refunds to pull),
 * fixed-price USDC resale, the designer's royalty and co-designer splits.
 * Every sale waits in escrow until the seller delivers the file key to the
 * buyer's key registered in TasarimNFT2 (same rule as TasarimNFT2's own
 * sales). Payouts are balances the payee withdraws (cek).
 *
 * Everything here is a read through YedekliOkur (archive + chunked getLogs)
 * or the calldata of a transaction the visitor's own wallet sends. The
 * calldata builders are pure so scripts/pazar3-denetim.js and
 * scripts/designs-pazar3-sim.mjs run exactly what the page would send.
 * Until PAZAR3.adres is set, PAZAR3_VAR is false and the pages say "opens soon".
 * =========================================================================== */
import { Interface, Contract } from "../../vendor/ethers.min.js";
import * as S from "./sozlesme.js";

/* LIVE on Arc (dagitim-pazar3.json). 5 Nov 2026: redeployed with listings held in custody; the first
   market 0x20b3fB80e77aBeB635c53639625702AB26E3Bb2B (block 29167576) never held a listing, sale or balance */
export const PAZAR3 = { adres: "0xd35225C49D272CFeb528E6677EAa9E653FC56771", baslangicBloku: 29671408 };
export const PAZAR3_ESKI = { adres: "0x20b3fB80e77aBeB635c53639625702AB26E3Bb2B", baslangicBloku: 29167576 };
export const PAZAR3_VAR = /^0x[0-9a-fA-F]{40}$/.test(PAZAR3.adres || "") && PAZAR3.baslangicBloku > 0;

/* build/TasarimPazar3.json, admin setters left out */
export const PAZAR3_ABI = [
  "error AnahtarYok()", "error AzCikti(uint256 gelen, uint256 asgari)", "error AzTeklif(uint256 gereken)", "error Durduruldu()",
  "error FazlaYok(uint256 serbest)", "error FiyatDegisti(uint256 fiyat)", "error IlanYok()", "error ItirazAcik()", "error Kilitli()",
  "error KotuDeger()", "error KotuDurum(uint8 durum)", "error MuzayedeYok()", "error OnayYok()", "error SifirAdres()",
  "error SureBitmedi()", "error SureBitti()", "error TeklifYok()", "error YetkiYok()", "error Yakildi()",
  "error ReentrancyGuardReentrantCall()", "error SafeERC20FailedOperation(address token)",
  "event IlanVerildi(uint256 indexed id, address indexed satici, uint256 fiyat)",
  "event IlanKalkti(uint256 indexed id)",
  "event TeklifVerildi(uint256 indexed teklifId, uint256 indexed id, address indexed alici, uint256 miktar, uint64 bitis)",
  "event TeklifKalkti(uint256 indexed teklifId, uint256 indexed id, address indexed alici, uint256 iade)",
  "event TeklifKabul(uint256 indexed teklifId, uint256 indexed id, address indexed satici, address alici, uint256 miktar)",
  "event MuzayedeBasladi(uint256 indexed id, address indexed satici, uint256 rezerv, uint64 bitis, uint16 adimBps)",
  "event Pey(uint256 indexed id, address indexed alici, uint256 miktar, uint64 bitis)",
  "event MuzayedeBitti(uint256 indexed id, address indexed kazanan, uint256 miktar)",
  "event MuzayedeIptal(uint256 indexed id)",
  "event Emanete(uint256 indexed id, address indexed satici, address indexed alici, uint256 fiyat, uint8 tur, uint64 teslimSonu)",
  "event TeslimEdildi(uint256 indexed id, address indexed alici, bytes zarf)",
  "event TeslimAlindi(uint256 indexed id)",
  "event AnahtarItirazi(uint256 indexed id, address alici)",
  "event SatisKapandi(uint256 indexed id, bool saticiyaOdendi, address kime, uint256 fiyat)",
  "event Dagitildi(uint256 indexed id, address indexed satici, uint256 net, uint256 telif, uint256 yakim, uint256 gelistirme, uint256 pazarlama, uint256 sahip)",
  "event Alacak(address indexed kime, uint256 indexed id, uint256 miktar)",
  "event Cekildi(address indexed kime, uint256 miktar)",
  "event BolusAyarlandi(uint256 indexed id, address[] alicilar, uint16[] bpsler)",
  "event BolusKilitlendi(uint256 indexed id)",
  "event YakimYapildi(uint256 usdcMiktari, uint256 arcpMiktari)",
  "function UCRET_AZAMI_BPS() view returns (uint256)",
  "function TELIF_AZAMI_BPS() view returns (uint256)",
  "function ADIM_AZAMI_BPS() view returns (uint256)",
  "function BOLUS_AZAMI() view returns (uint256)",
  "function ZARF_AZAMI() view returns (uint256)",
  "function nft() view returns (address)",
  "function usdc() view returns (address)",
  "function yonetici() view returns (address)",
  "function gelistirmeFonu() view returns (address)",
  "function pazarlama() view returns (address)",
  "function sahip() view returns (address)",
  "function yakimBps() view returns (uint16)",
  "function gelistirmeBps() view returns (uint16)",
  "function pazarlamaBps() view returns (uint16)",
  "function sahipBps() view returns (uint16)",
  "function telifBps() view returns (uint16)",
  "function asgariAdimBps() view returns (uint16)",
  "function uzatmaPenceresi() view returns (uint64)",
  "function uzatmaSuresi() view returns (uint64)",
  "function muzayedeAsgari() view returns (uint64)",
  "function muzayedeAzami() view returns (uint64)",
  "function teklifAzamiSure() view returns (uint64)",
  "function teslimSuresi() view returns (uint64)",
  "function anahtarItirazSuresi() view returns (uint64)",
  "function asgariFiyat() view returns (uint256)",
  "function durduruldu() view returns (bool)",
  "function yakimBirikimi() view returns (uint256)",
  "function toplamBorc() view returns (uint256)",
  "function alacakOf(address) view returns (uint256)",
  "function sonTeklif() view returns (uint256)",
  "function ilanOf(uint256) view returns (address satici, uint256 fiyat)",
  "function teklifOf(uint256) view returns (address alici, uint64 bitis, uint256 tasarimId, uint256 miktar)",
  "function muzayedeOf(uint256) view returns (address satici, uint64 bitis, uint16 adimBps, uint256 rezerv, address enYuksek, uint256 teklif)",
  "function satisOf(uint256) view returns (address alici, uint8 durum, uint8 tur, address satici, uint64 teslimSonu, uint64 itirazSonu, uint64 itirazPenceresi, uint16 yBps, uint16 gBps, uint16 pBps, uint16 sBps, uint16 tBps, uint256 fiyat, bytes32 aliciAnahtarHash, bytes32 zarfHash)",
  "function bolus(uint256 id) view returns (address[] alicilar, uint16[] bpsler)",
  "function bolusKilitli(uint256) view returns (bool)",
  "function tasarimciOf(uint256 id) view returns (address t)",
  "function asgariPey(uint256 id) view returns (uint256)",
  "function payHesapla(uint256 id, address satici, uint256 fiyat) view returns (uint256 net, uint256 telif, uint256 yakim, uint256 gelistirme, uint256 pazarlama_, uint256 sahip_)",
  "function ilanVer(uint256 id, uint256 fiyat)",
  "function ilanKaldir(uint256 id)",
  "function satinAl(uint256 id, uint256 azamiFiyat)",
  "function teklifVer(uint256 id, uint256 miktar, uint64 sure) returns (uint256 tid)",
  "function teklifGeriCek(uint256 tid)",
  "function teklifKabul(uint256 tid, uint256 asgariMiktar)",
  "function muzayedeBaslat(uint256 id, uint256 rezerv, uint64 sure, uint16 adimBps)",
  "function pey(uint256 id, uint256 miktar)",
  "function muzayedeIptal(uint256 id)",
  "function muzayedeKapat(uint256 id)",
  "function teslimEt(uint256 id, bytes zarf)",
  "function teslimAldim(uint256 id)",
  "function anahtarItiraz(uint256 id)",
  "function serbestBirak(uint256 id)",
  "function iadeEt(uint256 id)",
  "function yanmisIade(uint256 id)",
  "function cek() returns (uint256)",
  "function cekFor(address kime) returns (uint256)",
  "function bolusAyarla(uint256 id, address[] alicilar, uint16[] bpsler)",
  "function bolusKilitle(uint256 id)"
];
/* the TasarimNFT2 approval this market needs (standard ERC-721) */
export const NFT_ONAY_ABI = [
  "function approve(address to, uint256 tokenId)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)"
];

export const ifc = new Interface(PAZAR3_ABI);
const ifcNft = new Interface(NFT_ONAY_ABI);
const ifc20 = new Interface(["function approve(address spender, uint256 amount) returns (bool)", "function allowance(address owner, address spender) view returns (uint256)"]);

/* ---- calldata ---- */
export const veri = {
  usdcOnay: (miktar, harcayan = PAZAR3.adres) => ifc20.encodeFunctionData("approve", [harcayan, miktar]),
  nftOnay: (id, harcayan = PAZAR3.adres) => ifcNft.encodeFunctionData("approve", [harcayan, id]),
  ilanVer: (id, fiyat) => ifc.encodeFunctionData("ilanVer", [id, fiyat]),
  ilanKaldir: (id) => ifc.encodeFunctionData("ilanKaldir", [id]),
  satinAl: (id, azamiFiyat) => ifc.encodeFunctionData("satinAl", [id, azamiFiyat]),
  teklifVer: (id, miktar, sure) => ifc.encodeFunctionData("teklifVer", [id, miktar, sure]),
  teklifGeriCek: (tid) => ifc.encodeFunctionData("teklifGeriCek", [tid]),
  teklifKabul: (tid, asgari) => ifc.encodeFunctionData("teklifKabul", [tid, asgari]),
  muzayedeBaslat: (id, rezerv, sure, adimBps) => ifc.encodeFunctionData("muzayedeBaslat", [id, rezerv, sure, adimBps]),
  pey: (id, miktar) => ifc.encodeFunctionData("pey", [id, miktar]),
  muzayedeIptal: (id) => ifc.encodeFunctionData("muzayedeIptal", [id]),
  muzayedeKapat: (id) => ifc.encodeFunctionData("muzayedeKapat", [id]),
  teslimEt: (id, zarf) => ifc.encodeFunctionData("teslimEt", [id, zarf]),
  teslimAldim: (id) => ifc.encodeFunctionData("teslimAldim", [id]),
  anahtarItiraz: (id) => ifc.encodeFunctionData("anahtarItiraz", [id]),
  serbestBirak: (id) => ifc.encodeFunctionData("serbestBirak", [id]),
  iadeEt: (id) => ifc.encodeFunctionData("iadeEt", [id]),
  yanmisIade: (id) => ifc.encodeFunctionData("yanmisIade", [id]),
  cek: () => ifc.encodeFunctionData("cek", []),
  cekFor: (kime) => ifc.encodeFunctionData("cekFor", [kime]),
  bolusAyarla: (id, alicilar, bpsler) => ifc.encodeFunctionData("bolusAyarla", [id, alicilar, bpsler]),
  bolusKilitle: (id) => ifc.encodeFunctionData("bolusKilitle", [id])
};

/**
 * The price split exactly as the contract computes it (TasarimPazar3._paylar):
 * each slice rounds down, the seller (or the designer's payees on a primary
 * sale) gets the rest. `ay` holds the bps (yakim, gelistirme, pazarlama, sahip, telif).
 */
export function paylar(fiyat, ilkSatis, ay) {
  const f = BigInt(fiyat);
  const p = (b) => (f * BigInt(b)) / 10_000n;
  const yakim = p(ay.yakimBps), gelistirme = p(ay.gelistirmeBps), pazarlama = p(ay.pazarlamaBps), sahip = p(ay.sahipBps);
  const telif = ilkSatis ? 0n : p(ay.telifBps);
  return { net: f - yakim - gelistirme - pazarlama - sahip - telif, telif, yakim, gelistirme, pazarlama, sahip };
}

/** A payout split over the payees (TasarimPazar3._dagit): dust to the first. */
export function bolusDagit(toplam, alicilar, bpsler) {
  const t = BigInt(toplam);
  if (!alicilar.length) return [];
  const out = alicilar.map((a, i) => ({ alici: a, miktar: i === 0 ? 0n : (t * BigInt(bpsler[i])) / 10_000n }));
  out[0].miktar = t - out.slice(1).reduce((s, x) => s + x.miktar, 0n);
  return out;
}

/** Checks a split before sending: up to 5 distinct non-zero payees, bps > 0, total 10,000 (or empty). */
export function bolusDenetle(alicilar, bpsler) {
  if (alicilar.length !== bpsler.length) return "Each payee needs a share.";
  if (alicilar.length > 5) return "At most 5 payees.";
  if (!alicilar.length) return null;
  const gorulen = new Set();
  let top = 0;
  for (let i = 0; i < alicilar.length; i++) {
    const a = String(alicilar[i] || "").trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a) || /^0x0{40}$/i.test(a)) return "Payee " + (i + 1) + " is not a wallet address.";
    if (gorulen.has(a.toLowerCase())) return "Payee " + (i + 1) + " is listed twice.";
    gorulen.add(a.toLowerCase());
    const b = Number(bpsler[i]);
    if (!Number.isInteger(b) || b <= 0) return "Payee " + (i + 1) + " needs a share above 0.";
    top += b;
  }
  return top === 10_000 ? null : "The shares add up to " + (top / 100) + "%, they must add up to 100%.";
}

/** A revert in plain English. */
export function hataAcikla(e) {
  const d = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data));
  const ham = typeof d === "string" ? d : d && typeof d.data === "string" ? d.data : null;
  let ad = null, args = [];
  if (ham && ham.length >= 10) { try { const p = ifc.parseError(ham); if (p) { ad = p.name; args = p.args; } } catch (x) { /* not ours */ } }
  const M = {
    AnahtarYok: "Register your unlock key first (your profile, or Buy on a fixed-price listing registers it): the seller delivers the file key to it.",
    AzTeklif: "The bid is too low: at least " + (args[0] != null ? "$" + (Number(args[0]) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "the minimum step") + " now.",
    Durduruldu: "The market is paused by the admin right now (withdrawals, refunds and settlement still work).",
    FiyatDegisti: "The price changed: it is now $" + (args[0] != null ? (Number(args[0]) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "?") + ". Reload and try again.",
    IlanYok: "This design is not listed on the market (or it was taken down while listed).",
    ItirazAcik: "A copy challenge is open on this design; the payment waits for it to be resolved.",
    Kilitli: "This split is locked for good.",
    KotuDeger: "A value was refused (price under the minimum, duration out of range, your own design, or a bad split).",
    KotuDurum: "The sale is not in the state this needs (it may have moved on: reload the page).",
    MuzayedeYok: "No auction is running for this design.",
    OnayYok: "Approve the market for this design first (one transaction in TasarimNFT2).",
    SureBitmedi: "Not yet: the time for this has not come (auction end, delivery deadline, dispute window or the design's challenge window).",
    SureBitti: "Too late: the time for this has passed.",
    TeklifYok: "This offer no longer exists (accepted, withdrawn or returned).",
    YetkiYok: "Only the holder, the buyer, the seller or the designer (as the case may be) can do this.",
    Yakildi: "This design was taken down while held by the market; use Refund.",
    ERC721NonexistentToken: "This design does not exist (or was taken down)."
  };
  if (ad && M[ad]) return M[ad];
  return S.hataAcikla(e);
}

/* ---- reads ---- */
export async function pazar() { return new Contract(PAZAR3.adres, PAZAR3_ABI, await S.arc()); }

/** Rates, windows and caps the pages show. */
export async function ayarlar() {
  const c = await pazar();
  const ad = ["yakimBps", "gelistirmeBps", "pazarlamaBps", "sahipBps", "telifBps", "asgariAdimBps", "uzatmaPenceresi", "uzatmaSuresi",
    "muzayedeAsgari", "muzayedeAzami", "teklifAzamiSure", "teslimSuresi", "anahtarItirazSuresi", "asgariFiyat", "durduruldu"];
  const v = await Promise.all(ad.map((k) => c[k]()));
  const o = {};
  ad.forEach((k, i) => { o[k] = typeof v[i] === "boolean" ? v[i] : k === "asgariFiyat" ? v[i] : Number(v[i]); });
  o.ucretBps = o.yakimBps + o.gelistirmeBps + o.pazarlamaBps + o.sahipBps;
  return o;
}

const idKonusu = (id) => "0x" + BigInt(id).toString(16).padStart(64, "0");
const konu = (a) => "0x" + String(a).slice(2).toLowerCase().padStart(64, "0");
const sifirMi = (a) => /^0x0{40}$/i.test(a);

async function loglar(topics) {
  const p = await S.arc();
  const l = await p.getLogs({ address: PAZAR3.adres, topics, fromBlock: PAZAR3.baslangicBloku, toBlock: "latest" });
  return l.map((x) => ({ ...ifc.parseLog(x), blok: x.blockNumber, tx: x.transactionHash, index: x.index }));
}

/** One design on the market: listing, auction, open sale, live offers, split. */
export async function durum(id) {
  const c = await pazar();
  const [ilan, m, s, b, kilit, tl] = await Promise.all([c.ilanOf(id), c.muzayedeOf(id), c.satisOf(id), c.bolus(id), c.bolusKilitli(id),
    loglar([ifc.getEvent("TeklifVerildi").topicHash, null, idKonusu(id)]).catch(() => [])]);
  const teklifler = [];
  for (const l of tl) {
    const tid = l.args.teklifId;
    const t = await c.teklifOf(tid).catch(() => null);
    if (t && t.miktar > 0n) teklifler.push({ tid: Number(tid), alici: t.alici, miktar: t.miktar, bitis: Number(t.bitis) * 1000 });
  }
  teklifler.sort((x, y) => (y.miktar > x.miktar ? 1 : y.miktar < x.miktar ? -1 : 0));
  return {
    ilan: ilan.fiyat > 0n ? { satici: ilan.satici, fiyat: ilan.fiyat } : null,
    muzayede: sifirMi(m.satici) ? null : { satici: m.satici, bitis: Number(m.bitis) * 1000, adimBps: Number(m.adimBps), rezerv: m.rezerv, enYuksek: sifirMi(m.enYuksek) ? null : m.enYuksek, teklif: m.teklif },
    satis: Number(s.durum) === 0 ? null : { alici: s.alici, durum: Number(s.durum), tur: Number(s.tur), satici: s.satici, teslimSonu: Number(s.teslimSonu) * 1000,
      itirazSonu: Number(s.itirazSonu) * 1000, fiyat: s.fiyat, aliciAnahtarHash: s.aliciAnahtarHash, zarfHash: s.zarfHash },
    bolus: { alicilar: [...b.alicilar], bpsler: [...b.bpsler].map(Number), kilitli: kilit },
    teklifler
  };
}

export async function asgariPey(id) { return (await pazar()).asgariPey(id); }
export async function alacak(adres) { return (await pazar()).alacakOf(adres); }

/** Key envelopes posted on the market for design `id`, oldest first ({alici, zarf, tx}). */
export async function zarflar(id) {
  if (!PAZAR3_VAR) return [];
  return (await loglar([ifc.getEvent("TeslimEdildi").topicHash, idKonusu(id)])).map((l) => ({ alici: l.args.alici, zarf: l.args.zarf, tx: l.tx }));
}

/** Market sales by this seller still waiting for the file key (durum 1). */
export async function bekleyenTeslimler(satici) {
  if (!PAZAR3_VAR || !satici) return [];
  const c = await pazar();
  const idler = [...new Set((await loglar([ifc.getEvent("Emanete").topicHash, null, konu(satici)])).map((l) => Number(l.args.id)))];
  const out = [];
  for (const id of idler) {
    const s = await c.satisOf(id).catch(() => null);
    if (s && Number(s.durum) === 1 && s.satici.toLowerCase() === satici.toLowerCase()) out.push({ id, alici: s.alici, teslimSonu: Number(s.teslimSonu) * 1000, aliciAnahtarHash: s.aliciAnahtarHash });
  }
  return out;
}

/** Everything open on the market now: auctions and fixed-price listings (from events, checked live). */
export async function acikIlanlar() {
  const c = await pazar();
  const [mb, iv] = await Promise.all([loglar([ifc.getEvent("MuzayedeBasladi").topicHash]), loglar([ifc.getEvent("IlanVerildi").topicHash])]);
  const muzayedeler = [], ilanlar = [];
  for (const id of [...new Set(mb.map((l) => Number(l.args.id)))]) {
    const m = await c.muzayedeOf(id).catch(() => null);
    if (m && !sifirMi(m.satici)) muzayedeler.push({ id, satici: m.satici, bitis: Number(m.bitis) * 1000, rezerv: m.rezerv, enYuksek: sifirMi(m.enYuksek) ? null : m.enYuksek, teklif: m.teklif });
  }
  for (const id of [...new Set(iv.map((l) => Number(l.args.id)))]) {
    const i = await c.ilanOf(id).catch(() => null);
    if (i && i.fiyat > 0n) ilanlar.push({ id, satici: i.satici, fiyat: i.fiyat });
  }
  return { muzayedeler: muzayedeler.sort((a, b) => a.bitis - b.bitis), ilanlar };
}

/** This wallet's live offers (made by it), newest first. */
export async function tekliflerim(adres) {
  const c = await pazar();
  const l = await loglar([ifc.getEvent("TeklifVerildi").topicHash, null, null, konu(adres)]);
  const out = [];
  for (const x of l.reverse()) {
    const t = await c.teklifOf(x.args.teklifId).catch(() => null);
    if (t && t.miktar > 0n) out.push({ tid: Number(x.args.teklifId), id: Number(t.tasarimId), miktar: t.miktar, bitis: Number(t.bitis) * 1000 });
  }
  return out;
}

/** The design's market history, oldest first. */
export async function gecmis(id) {
  if (!PAZAR3_VAR) return [];
  const adlar = ["IlanVerildi", "IlanKalkti", "TeklifVerildi", "TeklifKalkti", "TeklifKabul", "MuzayedeBasladi", "Pey", "MuzayedeBitti", "MuzayedeIptal",
    "Emanete", "TeslimEdildi", "TeslimAlindi", "AnahtarItirazi", "SatisKapandi", "Dagitildi"];
  const ilk = adlar.map((a) => ifc.getEvent(a).topicHash);
  /* TeklifVerildi / TeklifKalkti / TeklifKabul carry the design id as the 2nd indexed topic */
  const [a, b] = await Promise.all([loglar([ilk, idKonusu(id)]), loglar([[ifc.getEvent("TeklifVerildi").topicHash, ifc.getEvent("TeklifKalkti").topicHash, ifc.getEvent("TeklifKabul").topicHash], null, idKonusu(id)])]);
  const gor = new Set();
  return [...a, ...b].filter((x) => { const k = x.tx + ":" + x.index; if (gor.has(k)) return false; gor.add(k); return true; })
    .filter((x) => !["TeklifVerildi", "TeklifKalkti", "TeklifKabul"].includes(x.name) || Number(x.args.id) === Number(id))
    .sort((x, y) => x.blok - y.blok || x.index - y.index)
    .map((x) => ({ ad: x.name, args: x.args, blok: x.blok, tx: x.tx }));
}

/* ---- sending ---- */

/** Approve `miktar` USDC to the market when the allowance is short. */
export async function usdcOnayGerekirse({ cuzdan, miktar, durum }) {
  const ben = cuzdan.hesap();
  const c = new Contract(S.TASARIM.usdc, ifc20.fragments, await S.arc());
  const izin = await c.allowance(ben, PAZAR3.adres).catch(() => 0n);
  if (izin >= miktar) return null;
  durum("Approve $" + (Number(miktar) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 }) + " USDC for the Designs market in your wallet…");
  const h = await cuzdan.agdaGonder(await S.arcAg(), { to: S.TASARIM.usdc, data: veri.usdcOnay(miktar), value: "0x0" });
  durum("Approval sent. Waiting for Arc…");
  await S.makbuz(h, durum);
  return h;
}

/** Approve the market for design `id` in TasarimNFT2 when it is not yet. */
export async function nftOnayGerekirse({ cuzdan, id, durum }) {
  const ben = cuzdan.hesap();
  const c = new Contract(S.TASARIM.adres, NFT_ONAY_ABI, await S.arc());
  const [a, t] = await Promise.all([c.getApproved(id).catch(() => null), c.isApprovedForAll(ben, PAZAR3.adres).catch(() => false)]);
  if (t || (a && a.toLowerCase() === PAZAR3.adres.toLowerCase())) return null;
  durum("Approve the market for design #" + id + " in your wallet (only this design)…");
  const h = await cuzdan.agdaGonder(await S.arcAg(), { to: S.TASARIM.adres, data: veri.nftOnay(id), value: "0x0" });
  durum("Approval sent. Waiting for Arc…");
  await S.makbuz(h, durum);
  return h;
}

export async function gonder({ cuzdan, data, durum, aciklama }) {
  const ben = cuzdan.hesap();
  try { await S.onceDene(ben, PAZAR3.adres, data); } catch (e) { throw new Error(hataAcikla(e)); }
  durum((aciklama || "Confirm in your wallet") + " (on Arc, a few cents of gas)…");
  let h;
  try { h = await cuzdan.agdaGonder(await S.arcAg(), { to: PAZAR3.adres, data, value: "0x0" }); }
  catch (e) { throw new Error(hataAcikla(e)); }
  durum("Sent. Waiting for Arc to confirm…");
  const m = await S.makbuz(h, durum);
  return { h, m };
}
