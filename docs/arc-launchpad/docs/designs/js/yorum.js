/* ===========================================================================
 * designs/js/yorum.js — comments and reports on Arc (YorumKaydi)
 *
 * Contract: contracts/urun/designs/YorumKaydi.sol (deploy record
 * dagitim-yorum.json, scripts/yorum-dagit.js). Until it is deployed the
 * address below stays empty and the pages say "Comments open soon".
 *
 * A comment's text lives only in its Yorum event; the contract keeps a
 * fingerprint and a status byte per comment (0 shown, 1 deleted by its
 * author, 2 hidden by the design's holder or designer, 3 hidden by the
 * admin). Hidden comments are left out here, but the chain's history keeps
 * every text: the pages say so. Reports (Bildirim) are public events too.
 * Reads go through the public Arc RPCs (YedekliOkur via sozlesme.js); writes
 * are transactions the visitor's own wallet sends (sosyal.js gonder). No DOM
 * here, so the audit scripts can import it.
 * =========================================================================== */
import { Interface, Contract, zeroPadValue, toBeHex } from "../../vendor/ethers.min.js";
import * as S from "../../js/designs/sozlesme.js";

/* ---- the switch: set after scripts/yorum-dagit.js (dagitim-yorum.json) ---- */
export const YORUM = {
  adres: "0x37C9a5Ed8d1b2ebb212924430233BaC9Cc82bD0d",   // YorumKaydi (deployed 2 Nov 2026)
  baslangicBloku: 29107916   // its deploy block (event scans start here)
};
export const YORUM_VAR = /^0x[0-9a-fA-F]{40}$/.test(YORUM.adres || "") && YORUM.baslangicBloku > 0;

export const YORUM_ABI = [
  "error YetkiYok()", "error SifirAdres()", "error BosMetin()", "error MetinCokUzun(uint256 uzunluk, uint256 azami)", "error NftDegil()",
  "error YorumYok()", "error YanlisYorum()", "error KotuNeden()", "error Susturuldu()", "error HizSiniri(uint64 tekrarZamani)", "error KotuDeger()", "error Kesin()",
  "event Yorum(uint256 indexed yorumId, address indexed nft, uint256 indexed id, address yazar, uint256 yanit, string metin, uint64 zaman)",
  "event YorumDurumu(uint256 indexed yorumId, address indexed nft, uint256 indexed id, address kim, uint8 durum)",
  "event Bildirim(address indexed nft, uint256 indexed id, address indexed bildiren, uint8 neden, string not_, uint64 zaman)",
  "function METIN_AZAMI() view returns (uint256)", "function NOT_AZAMI() view returns (uint256)", "function PROFIL() view returns (uint256)",
  "function yorumYaz(address nft, uint256 id, string metin, uint256 yanit) returns (uint256 yorumId)",
  "function sil(uint256 yorumId, address nft, uint256 id)",
  "function gizle(uint256 yorumId, address yazar, address nft, uint256 id, bool gizli)",
  "function bildir(address nft, uint256 id, uint8 neden, string not_)",
  "function sahipVeyaTasarimci(address kim, address nft, uint256 id) view returns (bool)",
  "function durumlar(uint256[] idler) view returns (uint8[] out)",
  "function durumOf(uint256) view returns (uint8)",
  "function yazabilir(address kim) view returns (uint8)",
  "function yorumSayisi(address, uint256) view returns (uint256)",
  "function bildirimSayisi(address, uint256) view returns (uint256)"
];
export const ifcY = new Interface(YORUM_ABI);

export const METIN_AZAMI = 500;
export const NOT_AZAMI = 280;
/** id of a report about a profile (nft = the wallet). */
export const PROFIL = (1n << 256n) - 1n;
/** Report reasons (YorumKaydi.bildir neden). */
export const NEDENLER = [[1, "Stolen or a copy of someone's work"], [2, "Illegal content"], [3, "Abusive or hateful"], [4, "Other"]];
export const DURUM = { GORUNUR: 0, YAZAR_SILDI: 1, SAHIP_GIZLEDI: 2, YONETICI_GIZLEDI: 3 };

const konu = (a) => zeroPadValue(a, 32);
const idKonu = (id) => zeroPadValue(toBeHex(BigInt(id)), 32);
async function yk() { return new Contract(YORUM.adres, YORUM_ABI, await S.arc()); }

/** Comments on design `id` of TasarimNFT2, newest first, each with its status: [{yorumId, yazar, yanit, metin, zaman, durum, blok, tx}]. */
export async function yorumlar(id, nft = S.TASARIM.adres) {
  if (!YORUM_VAR) return [];
  const p = await S.arc();
  const l = await p.getLogs({ address: YORUM.adres, topics: [ifcY.getEvent("Yorum").topicHash, null, konu(nft), idKonu(id)], fromBlock: YORUM.baslangicBloku, toBlock: "latest" });
  const liste = l.map((x) => {
    const e = ifcY.parseLog(x).args;
    return { yorumId: Number(e.yorumId), yazar: e.yazar, yanit: Number(e.yanit), metin: e.metin, zaman: Number(e.zaman) * 1000, blok: x.blockNumber, tx: x.transactionHash, durum: 0 };
  });
  if (liste.length) {
    /* the status of each comment: one view call (newest truth, whatever events the archive has) */
    const d = await (await yk()).durumlar(liste.map((x) => x.yorumId)).catch(() => null);
    if (d) liste.forEach((x, i) => { x.durum = Number(d[i]); });
  }
  return liste.sort((a, b) => b.yorumId - a.yorumId);
}

/** Comments on any of `idler` (TasarimNFT2) after block `sonra` (notifications): [{yorumId, id, yazar, metin, blok}]. */
export async function yeniYorumlar(idler, sonra, nft = S.TASARIM.adres) {
  if (!YORUM_VAR || !idler.length) return [];
  const p = await S.arc();
  const set = new Set(idler.map(Number));
  const l = await p.getLogs({ address: YORUM.adres, topics: [ifcY.getEvent("Yorum").topicHash, null, konu(nft)], fromBlock: Math.max(YORUM.baslangicBloku, sonra + 1), toBlock: "latest" });
  return l.map((x) => { const e = ifcY.parseLog(x).args; return { yorumId: Number(e.yorumId), id: Number(e.id), yazar: e.yazar, metin: e.metin, blok: x.blockNumber, tx: x.transactionHash }; })
    .filter((x) => set.has(x.id));
}

export async function sahipVeyaTasarimci(kim, id, nft = S.TASARIM.adres) {
  if (!YORUM_VAR || !kim) return false;
  return (await yk()).sahipVeyaTasarimci(kim, nft, id);
}
/** 0 can write, 1 muted, 2 rate limited. */
export async function yazabilir(kim) { return YORUM_VAR && kim ? Number(await (await yk()).yazabilir(kim)) : 0; }

/* ---- calldata ---- */
export const veriY = {
  yaz: (id, metin, yanit = 0, nft = S.TASARIM.adres) => ifcY.encodeFunctionData("yorumYaz", [nft, id, metin, yanit]),
  sil: (yorumId, id, nft = S.TASARIM.adres) => ifcY.encodeFunctionData("sil", [yorumId, nft, id]),
  gizle: (yorumId, yazar, id, gizli, nft = S.TASARIM.adres) => ifcY.encodeFunctionData("gizle", [yorumId, yazar, nft, id, !!gizli]),
  /* a design: (TasarimNFT2, id); a profile: (wallet, PROFIL) */
  bildir: (nft, id, neden, not_) => ifcY.encodeFunctionData("bildir", [nft, id, neden, not_ || ""])
};

/** A YorumKaydi revert in plain English, or null when it is not one. */
export function yorumHatasi(e) {
  const d = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data));
  const ham = typeof d === "string" ? d : d && typeof d.data === "string" ? d.data : null;
  if (!ham || ham.length < 10) return null;
  let p = null;
  try { p = ifcY.parseError(ham); } catch (x) { return null; }
  if (!p) return null;
  return {
    YetkiYok: "This wallet is not allowed to do that.",
    BosMetin: "Write something first.",
    MetinCokUzun: "Too long: " + p.args[0] + " bytes; at most " + p.args[1] + ".",
    NftDegil: "Not a design contract.",
    YorumYok: "That comment does not exist.",
    YanlisYorum: "That comment is not under this design.",
    KotuNeden: "Choose a reason.",
    Susturuldu: "Your wallet is muted by the moderator.",
    HizSiniri: "Too many comments or reports in a minute. Wait a moment and try again.",
    Kesin: "That comment was already removed and cannot be changed."
  }[p.name] || p.name;
}
