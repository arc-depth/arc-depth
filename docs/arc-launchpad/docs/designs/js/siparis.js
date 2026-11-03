/* ===========================================================================
 * designs/js/siparis.js — commissions ("hire a designer") on Arc (SiparisKaydi)
 *
 * Contract: contracts/urun/designs/SiparisKaydi.sol (deploy record
 * dagitim-siparis.json, scripts/siparis-dagit.js). Until it is deployed the
 * address below stays empty and the Jobs pages say "Jobs open soon".
 *
 * A job's brief lives only in its IsAcildi event, applications in Basvuru
 * events, deliveries in Teslim events; the contract keeps each job's state
 * (isOf / isler). The budget is USDC held by the contract until the client
 * approves, the review window passes, a refund or the arbiter's split.
 * Reads go through the public Arc RPCs (YedekliOkur via sozlesme.js, the
 * event archive first); writes are transactions the visitor's own wallet
 * sends. No DOM here, so the audit scripts can import it.
 * =========================================================================== */
import { Interface, Contract, zeroPadValue, toBeHex } from "../../vendor/ethers.min.js";
import * as S from "../../js/designs/sozlesme.js";

/* ---- the switch: set after scripts/siparis-dagit.js (dagitim-siparis.json) ---- */
export const SIPARIS = {
  adres: "0x22111796D4d6E5A7598612517952083E4cc23C00",   // SiparisKaydi (deployed 2 Nov 2026)
  baslangicBloku: 29168588   // its deploy block (event scans start here)
};
export const SIPARIS_VAR = /^0x[0-9a-fA-F]{40}$/.test(SIPARIS.adres || "") && SIPARIS.baslangicBloku > 0;

export const SIPARIS_ABI = [
  "error YetkiYok()", "error SifirAdres()", "error KotuDeger()", "error KotuDurum(uint8 durum)", "error Durduruldu()", "error ButceAz(uint256 asgari)",
  "error CokUzun()", "error SureBitti()", "error SureBitmedi()", "error BasvuruYok()", "error ZatenBasvurdu()", "error HedefliIs()", "error TasarimciDegil()",
  "error RevizyonHakkiBitti()", "error AzCikti(uint256 cikan, uint256 asgari)",
  "error ERC721InsufficientApproval(address operator, uint256 tokenId)", "error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)", "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "event IsAcildi(uint256 indexed id, address indexed musteri, address indexed hedef, uint256 butce, uint64 son, uint16 ucretBps, uint64 incelemeSuresi, string brief)",
  "event Basvuru(uint256 indexed id, address indexed tasarimci, string not_)",
  "event Atandi(uint256 indexed id, address indexed tasarimci)",
  "event Birakti(uint256 indexed id, address indexed tasarimci)",
  "event SureUzatildi(uint256 indexed id, uint64 son)",
  "event Teslim(uint256 indexed id, address indexed tasarimci, uint256 indexed nftId, string uri, bytes32 dosyaHash, bytes zarf, uint8 revizyon)",
  "event AnahtarGonderildi(uint256 indexed id, address indexed musteri, bytes zarf)",
  "event RevizyonIstendi(uint256 indexed id, uint8 revizyon, uint64 son, string not_)",
  "event ItirazAcildi(uint256 indexed id, address indexed kim, string not_)",
  "event Odendi(uint256 indexed id, address indexed tasarimci, uint256 tasarimciya, uint256 ucret, bool otomatik)",
  "event Iptal(uint256 indexed id, address indexed musteri, uint256 iade, uint8 sebep)",
  "event ItirazCozuldu(uint256 indexed id, uint16 tasarimciBps, uint256 tasarimciya, uint256 musteriye, uint256 ucret, bool nftMusteriye)",
  "event UcretDagitildi(uint256 indexed id, uint256 yakim, uint256 gelistirici, uint256 pazarlama, uint256 sahip)",
  "event NftDevredildi(uint256 indexed id, uint256 indexed nftId, address kime, bool basarili)",
  "function isAc(string brief, uint256 butce, uint64 son, address hedef) returns (uint256 id)",
  "function sec(uint256 id, address tasarimci)",
  "function sureUzat(uint256 id, uint64 yeniSon)",
  "function iptalEt(uint256 id)",
  "function iadeAl(uint256 id)",
  "function basvur(uint256 id, string not_)",
  "function kabulEt(uint256 id)",
  "function birak(uint256 id)",
  "function teslimEt(uint256 id, string uri, bytes32 dosyaHash, uint256 nftId, bytes zarf)",
  "function anahtarGonder(uint256 id, bytes zarf)",
  "function onayla(uint256 id)",
  "function talepEt(uint256 id)",
  "function revizyonIste(uint256 id, string not_)",
  "function itirazEt(uint256 id, string not_)",
  "function sonIs() view returns (uint256)",
  "function isler(uint256[] idler) view returns ((address musteri, uint64 son, uint8 durum, uint8 revizyon, uint8 revizyonHakki, uint16 ucretBps, address hedef, uint64 incelemeSuresi, address tasarimci, uint64 teslimZamani, uint32 basvuruSayisi, uint256 butce, uint256 nftId, bytes32 teslimHash)[] out)",
  "function basvurdu(uint256, address) view returns (bool)",
  "function ucretBps() view returns (uint16)", "function yakimPay() view returns (uint16)", "function gelistiriciPay() view returns (uint16)",
  "function pazarlamaPay() view returns (uint16)", "function sahipPay() view returns (uint16)", "function incelemeSuresi() view returns (uint64)",
  "function revizyonHakki() view returns (uint8)", "function asgariButce() view returns (uint256)", "function durduruldu() view returns (bool)",
  "function hakem() view returns (address)", "function emanetToplam() view returns (uint256)", "function yakimBakiye() view returns (uint256)",
  "function UCRET_AZAMI_BPS() view returns (uint16)", "function BRIEF_AZAMI() view returns (uint256)", "function NOT_AZAMI() view returns (uint256)"
];
export const ifcS = new Interface(SIPARIS_ABI);
/* the TasarimNFT2 calls a delivery needs (approving this contract for the design NFT) */
const NFT_ONAY_ABI = ["function setApprovalForAll(address operator, bool approved)", "function isApprovedForAll(address owner, address operator) view returns (bool)"];
const ifcNO = new Interface(NFT_ONAY_ABI);

export const BRIEF_AZAMI = 2000;
export const NOT_AZAMI = 500;
export const URI_AZAMI = 512;
export const DURUM = { ACIK: 1, ATANDI: 2, TESLIM: 3, ITIRAZ: 4, ODENDI: 5, IPTAL: 6, BOLUNDU: 7 };
export const DURUM_ADI = { 1: "Open", 2: "In progress", 3: "Delivered · in review", 4: "Disputed", 5: "Paid", 6: "Refunded", 7: "Settled by arbiter" };

const konu = (a) => zeroPadValue(a, 32);
const idKonu = (id) => zeroPadValue(toBeHex(BigInt(id)), 32);
async function sk() { return new Contract(SIPARIS.adres, SIPARIS_ABI, await S.arc()); }
const bayt = (s) => new TextEncoder().encode(s || "").length;
export { bayt };

/** The brief's first line as a title (the rest is the body). */
export function baslikOf(brief) {
  const s = String(brief || "").trim();
  const ilk = s.split(/\r?\n/)[0].trim();
  return (ilk || "Untitled job").slice(0, 90);
}

/** Settings the pages show. */
export async function ayarlar() {
  if (!SIPARIS_VAR) return null;
  const c = await sk();
  const [ucretBps, yakim, gel, paz, sah, inceleme, revizyon, asgari, durduruldu, hakem] = await Promise.all([
    c.ucretBps(), c.yakimPay(), c.gelistiriciPay(), c.pazarlamaPay(), c.sahipPay(), c.incelemeSuresi(), c.revizyonHakki(), c.asgariButce(), c.durduruldu(), c.hakem()]);
  return { ucretBps: Number(ucretBps), paylar: { yakim: Number(yakim), gelistirici: Number(gel), pazarlama: Number(paz), sahip: Number(sah) },
    inceleme: Number(inceleme), revizyonHakki: Number(revizyon), asgariButce: asgari, durduruldu, hakem };
}

const isCoz = (id, x) => ({
  id: Number(id), musteri: x.musteri, son: Number(x.son) * 1000, durum: Number(x.durum), revizyon: Number(x.revizyon), revizyonHakki: Number(x.revizyonHakki),
  ucretBps: Number(x.ucretBps), hedef: /^0x0{40}$/i.test(x.hedef) ? null : x.hedef, inceleme: Number(x.incelemeSuresi),
  tasarimci: /^0x0{40}$/i.test(x.tasarimci) ? null : x.tasarimci, teslimZamani: Number(x.teslimZamani) * 1000, basvuruSayisi: Number(x.basvuruSayisi),
  butce: x.butce, nftId: Number(x.nftId), teslimHash: x.teslimHash
});
/** When the review window of a delivered job ends (ms), or 0. */
export const incelemeSonu = (j) => (j.durum === DURUM.TESLIM && j.teslimZamani ? j.teslimZamani + j.inceleme * 1000 : 0);

/** Every job with its brief, newest first. */
export async function isler() {
  if (!SIPARIS_VAR) return [];
  const c = await sk();
  const n = Number(await c.sonIs());
  if (!n) return [];
  const idler = Array.from({ length: n }, (_, i) => n - i);
  const [durumlar, loglar] = await Promise.all([
    c.isler(idler),
    (await S.arc()).getLogs({ address: SIPARIS.adres, topics: [ifcS.getEvent("IsAcildi").topicHash], fromBlock: SIPARIS.baslangicBloku, toBlock: "latest" }).catch(() => [])
  ]);
  const brief = new Map();
  for (const l of loglar) { const e = ifcS.parseLog(l).args; brief.set(Number(e.id), { brief: e.brief, blok: l.blockNumber, tx: l.transactionHash }); }
  return idler.map((id, i) => ({ ...isCoz(id, durumlar[i]), ...(brief.get(id) || { brief: "" }) }));
}

/** One job, its brief and its history: applications, deliveries, envelopes, changes asked, disputes, payouts. */
export async function isOku(id) {
  if (!SIPARIS_VAR) return null;
  const c = await sk();
  const [x] = await c.isler([id]);
  if (/^0x0{40}$/i.test(x.musteri)) return null;
  const l = await (await S.arc()).getLogs({ address: SIPARIS.adres, topics: [null, idKonu(id)], fromBlock: SIPARIS.baslangicBloku, toBlock: "latest" });
  const olaylar = [];
  for (const g of l) { try { const e = ifcS.parseLog(g); if (e) olaylar.push({ ad: e.name, args: e.args, blok: g.blockNumber, tx: g.transactionHash }); } catch (e) { /* not ours */ } }
  const j = isCoz(id, x);
  const acilis = olaylar.find((o) => o.ad === "IsAcildi");
  j.brief = acilis ? acilis.args.brief : "";
  j.olaylar = olaylar;
  /* applicants still standing (one who stepped back after being picked may apply again) */
  const bas = new Map();
  for (const o of olaylar) {
    if (o.ad === "Basvuru") bas.set(o.args.tasarimci.toLowerCase(), { tasarimci: o.args.tasarimci, not: o.args.not_, blok: o.blok, tx: o.tx });
    if (o.ad === "Birakti") bas.delete(o.args.tasarimci.toLowerCase());
  }
  j.basvurular = [...bas.values()];
  j.teslimler = olaylar.filter((o) => o.ad === "Teslim").map((o) => ({ tasarimci: o.args.tasarimci, nftId: Number(o.args.nftId), uri: o.args.uri, dosyaHash: o.args.dosyaHash, zarf: o.args.zarf, revizyon: Number(o.args.revizyon), blok: o.blok, tx: o.tx }));
  j.zarflar = olaylar.filter((o) => (o.ad === "Teslim" && o.args.zarf && o.args.zarf !== "0x") || o.ad === "AnahtarGonderildi").map((o) => ({ zarf: o.args.zarf, nftId: o.ad === "Teslim" ? Number(o.args.nftId) : 0, blok: o.blok }));
  return j;
}

/** Envelopes (file keys encrypted to the client) posted for jobs that delivered design `nftId` (teslim.js reads them too). */
export async function nftZarflari(nftId) {
  if (!SIPARIS_VAR || !nftId) return [];
  const p = await S.arc();
  const l = await p.getLogs({ address: SIPARIS.adres, topics: [ifcS.getEvent("Teslim").topicHash, null, null, idKonu(nftId)], fromBlock: SIPARIS.baslangicBloku, toBlock: "latest" });
  const out = [];
  for (const g of l) {
    const e = ifcS.parseLog(g).args;
    const id = Number(e.id);
    const [x] = await (await sk()).isler([id]);
    if (e.zarf && e.zarf !== "0x") out.push({ isId: id, alici: x.musteri, zarf: e.zarf });
    const sonra = await p.getLogs({ address: SIPARIS.adres, topics: [ifcS.getEvent("AnahtarGonderildi").topicHash, idKonu(id)], fromBlock: SIPARIS.baslangicBloku, toBlock: "latest" });
    for (const s of sonra) { const a = ifcS.parseLog(s).args; out.push({ isId: id, alici: a.musteri, zarf: a.zarf }); }
  }
  return out;
}

/** Jobs a wallet paid as a designer (Odendi) and splits in its favour: the verified badge counts them as sales. */
export async function odenenIsler() {
  if (!SIPARIS_VAR) return [];
  const p = await S.arc();
  const l = await p.getLogs({ address: SIPARIS.adres, topics: [ifcS.getEvent("Odendi").topicHash], fromBlock: SIPARIS.baslangicBloku, toBlock: "latest" }).catch(() => []);
  return l.map((g) => { const e = ifcS.parseLog(g).args; return { id: Number(e.id), tasarimci: e.tasarimci, tasarimciya: e.tasarimciya }; });
}

export async function basvurduMu(id, kim) { return SIPARIS_VAR && kim ? (await sk()).basvurdu(id, kim) : false; }
export async function nftOnayliMi(sahip) {
  if (!SIPARIS_VAR || !sahip) return false;
  return new Contract(S.TASARIM.adres, NFT_ONAY_ABI, await S.arc()).isApprovedForAll(sahip, SIPARIS.adres);
}
export async function usdcIzni(sahip) { return (await S.erc20(S.TASARIM.usdc)).allowance(sahip, SIPARIS.adres); }

/** The designer's net and the fee for a budget (6-decimal USDC) at a fee rate. */
export function netHesapla(butce, ucretBps) {
  const ucret = (BigInt(butce) * BigInt(ucretBps)) / 10_000n;
  return { ucret, net: BigInt(butce) - ucret };
}

/* ---- calldata ---- */
const SIFIR = "0x0000000000000000000000000000000000000000";
export const veriS = {
  isAc: (brief, butce, sonSaniye, hedef) => ifcS.encodeFunctionData("isAc", [brief, butce, sonSaniye, hedef || SIFIR]),
  sec: (id, tasarimci) => ifcS.encodeFunctionData("sec", [id, tasarimci]),
  sureUzat: (id, sonSaniye) => ifcS.encodeFunctionData("sureUzat", [id, sonSaniye]),
  iptalEt: (id) => ifcS.encodeFunctionData("iptalEt", [id]),
  iadeAl: (id) => ifcS.encodeFunctionData("iadeAl", [id]),
  basvur: (id, not_) => ifcS.encodeFunctionData("basvur", [id, not_ || ""]),
  kabulEt: (id) => ifcS.encodeFunctionData("kabulEt", [id]),
  birak: (id) => ifcS.encodeFunctionData("birak", [id]),
  teslimEt: (id, uri, dosyaHash, nftId, zarf) => ifcS.encodeFunctionData("teslimEt", [id, uri || "", dosyaHash || "0x" + "00".repeat(32), nftId || 0, zarf || "0x"]),
  anahtarGonder: (id, zarf) => ifcS.encodeFunctionData("anahtarGonder", [id, zarf]),
  onayla: (id) => ifcS.encodeFunctionData("onayla", [id]),
  talepEt: (id) => ifcS.encodeFunctionData("talepEt", [id]),
  revizyonIste: (id, not_) => ifcS.encodeFunctionData("revizyonIste", [id, not_ || ""]),
  itirazEt: (id, not_) => ifcS.encodeFunctionData("itirazEt", [id, not_ || ""]),
  /* TasarimNFT2: let this contract hold a delivered design until payment */
  nftOnay: (operator = SIPARIS.adres) => ifcNO.encodeFunctionData("setApprovalForAll", [operator, true])
};

/** A SiparisKaydi revert in plain English, or null when it is not one. */
export function siparisHatasi(e) {
  const d = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data));
  const ham = typeof d === "string" ? d : d && typeof d.data === "string" ? d.data : null;
  if (!ham || ham.length < 10) return null;
  let p = null;
  try { p = ifcS.parseError(ham); } catch (x) { return null; }
  if (!p) return null;
  const usd = (m) => "$" + (Number(m) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
  return {
    YetkiYok: "This wallet is not allowed to do that on this job.",
    KotuDeger: "One of the values is not accepted (check the deadline: at least 1 hour and at most a year ahead).",
    KotuDurum: "The job is not in a state that allows this (it is " + (DURUM_ADI[Number(p.args[0])] || "closed").toLowerCase() + ").",
    Durduruldu: "New jobs and applications are paused for now. Payments and refunds still work.",
    ButceAz: "The budget is below the minimum of " + usd(p.args[0]) + ".",
    CokUzun: "Too long: the brief is at most 2,000 bytes, a note 500, a link 512.",
    SureBitti: "Too late: the deadline or the review window has passed.",
    SureBitmedi: "Not yet: wait for the deadline or the end of the review window.",
    BasvuruYok: "That wallet has not applied to this job.",
    ZatenBasvurdu: "You already applied to this job.",
    HedefliIs: "This job is addressed to one designer; others cannot apply.",
    TasarimciDegil: "That design NFT was not published by you.",
    RevizyonHakkiBitti: "No more change requests on this job: approve the delivery or open a dispute.",
    ERC721InsufficientApproval: "Allow the commissions contract to hold your design NFT first.",
    ERC721IncorrectOwner: "You do not hold that design NFT.",
    ERC20InsufficientAllowance: "Approve the USDC budget first.",
    ERC20InsufficientBalance: "Not enough USDC on Arc for this budget."
  }[p.name] || p.name;
}
