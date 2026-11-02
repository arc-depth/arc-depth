/* ===========================================================================
 * designs/js/sosyal.js — profiles, follows, likes (ProfilKaydi) and the
 *                         encrypted message box (MesajKutusu) on Arc
 *
 * Contracts: contracts/urun/designs/ProfilKaydi.sol and MesajKutusu.sol
 * (deploy record dagitim-sosyal.json). Until they are deployed the
 * addresses below stay empty and the pages say "open soon"; likes and
 * follows then fall back to the device-only signed records of
 * docs/js/designs/yerel.js, exactly as the main app does.
 *
 * Everything here is a read through the public Arc RPCs (YedekliOkur via
 * sozlesme.js) or the calldata of a transaction the visitor's own wallet
 * sends. The platform stores nothing.
 * =========================================================================== */
import { Interface, Contract, zeroPadValue } from "../../vendor/ethers.min.js";
import * as S from "../../js/designs/sozlesme.js";

/* ---- the switch: empty until dagitim-sosyal.json exists ---- */
export const SOSYAL = {
  /* LIVE 1 Nov 2026 (dagitim-sosyal.json) */
  profil: "0x1a311e8266EFbbD72f9258af5fEcCfb8586498Fc",   // ProfilKaydi, block 29043552
  mesaj: "0x98D6240c9204B33FdF393f9CCd1254799628a6aB",    // MesajKutusu, block 29043562
  baslangicBloku: 29043552,  // the earlier of the two deploy blocks (event scans start here)
  /* the private box (MesajKutusu2: recipient hidden). Empty until scripts/mesaj2-dagit.js
     --uygula has written dagitim-mesaj2.json; then set both from it. While empty, sending
     stays on MesajKutusu above exactly as before. */
  mesaj2: "0xfb3415daD37107c69Cfc91249FE8be7F6C5143b8",   // MesajKutusu2 (deployed 2 Nov 2026)
  mesaj2Blok: 29118694
};
const adresMi = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || "");
export const PROFIL_VAR = adresMi(SOSYAL.profil) && SOSYAL.baslangicBloku > 0;
export const MESAJ_VAR = adresMi(SOSYAL.mesaj) && SOSYAL.baslangicBloku > 0;
export const MESAJ2_VAR = adresMi(SOSYAL.mesaj2) && SOSYAL.mesaj2Blok > 0;

/* ProfilKaydi (build/ProfilKaydi.json, admin-only functions left out) */
export const PROFIL_ABI = [
  "error YetkiYok()", "error SifirAdres()", "error CokUzun(uint8 alan)", "error KullaniciAdiGecersiz()", "error KullaniciAdiAlinmis()",
  "error KullaniciAdiYok()", "error KendiniTakipEdemez()", "error ZatenTakipte()", "error TakipteDegil()", "error ZatenBegenildi()", "error Begenilmemis()",
  "event ProfilGuncellendi(address indexed cuzdan, string ad, string bio, string avatarUri, string baglantilarJson)",
  "event KullaniciAdiAlindi(address indexed cuzdan, bytes32 indexed adHash, string kullaniciAdi)",
  "event Takip(address indexed takipci, address indexed hedef, bool takipte)",
  "event Begeni(address indexed cuzdan, address indexed nft, uint256 indexed id, bool begendi)",
  "event Gizlendi(address indexed cuzdan, bool gizli)",
  "function AD_AZAMI() view returns (uint256)", "function BIO_AZAMI() view returns (uint256)",
  "function AVATAR_AZAMI() view returns (uint256)", "function BAGLANTI_AZAMI() view returns (uint256)",
  "function profilYaz(string ad, string bio, string avatarUri, string baglantilarJson)",
  "function profilSil()",
  "function kullaniciAdiAl(string kullaniciAdi)",
  "function kullaniciAdiBirak()",
  "function takipEt(address hedef)",
  "function takiptenCik(address hedef)",
  "function begen(address nft, uint256 id)",
  "function begeniGeriAl(address nft, uint256 id)",
  "function profilOf(address cuzdan) view returns (string ad, string bio, string avatarUri, string baglantilarJson, string kullaniciAdi, uint64 guncellendi, bool gizli_, uint256 takipci, uint256 takip)",
  "function sahibiOf(string kullaniciAdi) view returns (address)",
  "function isFollowing(address takipci, address hedef) view returns (bool)",
  "function begeniSayisi(address nft, uint256 id) view returns (uint256)",
  "function hasLiked(address cuzdan, address nft, uint256 id) view returns (bool)",
  "function gizli(address) view returns (bool)",
  "function kullaniciAdiOf(address) view returns (string)",
  "function takipciSayisi(address) view returns (uint256)",
  "function takipSayisi(address) view returns (uint256)"
];
export const LIMIT = { ad: 48, bio: 300, avatar: 200, baglanti: 600, kullaniciAdi: [3, 20] };

/* MesajKutusu (build/MesajKutusu.json, admin-only functions left out) */
export const MESAJ_ABI = [
  "error YetkiYok()", "error SifirAdres()", "error KendineOlmaz()", "error BosMesaj()", "error MesajCokUzun(uint256 uzunluk, uint256 azami)",
  "error AliciAnahtariYok(address alici)", "error Engellendi()", "error Susturuldu()", "error HizSiniri(uint64 tekrarZamani)", "error KotuDeger()",
  "event Mesaj(address indexed gonderen, address indexed alici, uint256 indexed konusma, bytes sifreli, uint64 zaman)",
  "event Engel(address indexed alici, address indexed gonderen, bool engelli)",
  "function SIFRELI_AZAMI() view returns (uint256)",
  "function konusmaOf(address a, address b) pure returns (uint256)",
  "function gonder(address alici, bytes sifreli) returns (uint256 konusma)",
  "function engelle(address gonderen, bool engelle_)",
  "function anahtariVar(address alici) view returns (bool)",
  "function gonderilebilir(address gonderen, address alici) view returns (uint8)",
  "function engelli(address alici, address gonderen) view returns (bool)",
  "function susturuldu(address) view returns (bool)",
  "function mesajSayisi(uint256) view returns (uint256)"
];

/* MesajKutusu2 (build/MesajKutusu2.json, admin-only functions left out) */
export const MESAJ2_ABI = [
  "error YetkiYok()", "error SifirAdres()", "error BosMesaj()", "error MesajCokUzun(uint256 uzunluk, uint256 azami)",
  "error Susturuldu()", "error HizSiniri(uint64 tekrarZamani)", "error KotuDeger()", "error MesajYok()", "error ZatenSilindi()",
  "event Mesaj(address indexed gonderen, bytes32 indexed id, bytes sifreli, uint64 zaman)",
  "event Sil(address indexed gonderen, bytes32 indexed id)",
  "function SIFRELI_AZAMI() view returns (uint256)",
  "function idOf(address gonderen, uint64 nonce) pure returns (bytes32)",
  "function gonder(bytes sifreli) returns (bytes32 id)",
  "function sil(uint64 nonce)",
  "function gonderilebilir(address gonderen) view returns (uint8)",
  "function gonderilenSayisi(address) view returns (uint64)",
  "function silindi(bytes32) view returns (bool)",
  "function susturuldu(address) view returns (bool)",
  "function toplamMesaj() view returns (uint256)"
];

export const ifcP = new Interface(PROFIL_ABI);
export const ifcM = MESAJ_ABI.length ? new Interface(MESAJ_ABI) : null;
export const ifcM2 = new Interface(MESAJ2_ABI);

const konu = (a) => zeroPadValue(a, 32);
const esit = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

async function pk() { return new Contract(SOSYAL.profil, PROFIL_ABI, await S.arc()); }

/* ---- profiles ---- */
const BOS = (adres) => ({ adres, ad: "", bio: "", avatar: "", baglantilar: [], kullaniciAdi: "", guncellendi: 0, gizli: false, takipci: null, takip: null, yok: true });
const _profil = new Map();

/** A wallet's profile (cached per page load; `yenile` drops the cache). Without ProfilKaydi: an empty profile. */
export function profilOku(adres, yenile) {
  const k = String(adres || "").toLowerCase();
  if (!PROFIL_VAR || !adresMi(adres)) return Promise.resolve(BOS(adres));
  if (yenile) _profil.delete(k);
  if (!_profil.has(k)) {
    const p = pk().then((c) => c.profilOf(adres)).then((r) => ({
      adres, ad: r.ad, bio: r.bio, avatar: r.avatarUri, baglantilar: baglantiCoz(r.baglantilarJson), kullaniciAdi: r.kullaniciAdi,
      guncellendi: Number(r.guncellendi) * 1000, gizli: !!r.gizli_, takipci: Number(r.takipci), takip: Number(r.takip),
      yok: !r.ad && !r.bio && !r.avatarUri && !r.kullaniciAdi
    }));
    p.catch(() => _profil.delete(k));
    _profil.set(k, p);
  }
  return _profil.get(k);
}
export function profilUnut(adres) { _profil.delete(String(adres || "").toLowerCase()); }

/** Links JSON: [{t, u}] (what this site writes) or {label: url}; only https:// links are kept. */
export function baglantiCoz(json) {
  let j;
  try { j = JSON.parse(json || "[]"); } catch (e) { return []; }
  const l = Array.isArray(j) ? j.map((x) => ({ t: x && (x.t || x.label || x.name), u: x && (x.u || x.url) }))
    : j && typeof j === "object" ? Object.entries(j).map(([t, u]) => ({ t, u })) : [];
  return l.filter((x) => typeof x.u === "string" && /^https:\/\/[^\s"'<>]{3,}$/i.test(x.u)).slice(0, 8)
    .map((x) => ({ t: String(x.t || "").slice(0, 32) || new URL(x.u).hostname.replace(/^www\./, ""), u: x.u }));
}
export const baglantiYaz = (l) => JSON.stringify(l.filter((x) => x.u).map((x) => ({ t: x.t || "", u: x.u })));

/** Wallet of a handle (zero address when free), or null without ProfilKaydi. */
export async function sahibi(kullaniciAdi) {
  if (!PROFIL_VAR) return null;
  const a = await (await pk()).sahibiOf(String(kullaniciAdi || "").toLowerCase().replace(/^@/, ""));
  return /^0x0{40}$/i.test(a) ? null : a;
}

/* ---- follow graph and likes, from the events (newest state per pair wins) ---- */
async function loglar(topics) {
  const p = await S.arc();
  return p.getLogs({ address: SOSYAL.profil, topics, fromBlock: SOSYAL.baslangicBloku, toBlock: "latest" });
}
function sonDurum(l, anahtar, deger) {
  const m = new Map();
  for (const x of l.sort((a, b) => a.blockNumber - b.blockNumber || (a.index ?? 0) - (b.index ?? 0))) {
    const e = ifcP.parseLog(x).args;
    m.set(anahtar(e).toLowerCase(), { a: anahtar(e), v: deger(e) });
  }
  return [...m.values()].filter((x) => x.v).map((x) => x.a);
}
/** Wallets `adres` follows now. */
export async function takipEdilenler(adres) {
  if (!PROFIL_VAR || !adres) return [];
  return sonDurum(await loglar([ifcP.getEvent("Takip").topicHash, konu(adres)]), (e) => e.hedef, (e) => e.takipte);
}
/** Wallets following `adres` now. */
export async function takipciler(adres) {
  if (!PROFIL_VAR || !adres) return [];
  return sonDurum(await loglar([ifcP.getEvent("Takip").topicHash, null, konu(adres)]), (e) => e.takipci, (e) => e.takipte);
}
export async function takipMi(ben, hedef) {
  if (!PROFIL_VAR || !ben || !hedef) return false;
  return (await pk()).isFollowing(ben, hedef);
}
/** Like counts of every design (id → count), from Begeni events on TasarimNFT2. */
let _begeniler = null, _begeniZaman = 0;
export async function begeniSayilari() {
  if (!PROFIL_VAR) return new Map();
  if (_begeniler && Date.now() - _begeniZaman < 20_000) return _begeniler;
  const l = await loglar([ifcP.getEvent("Begeni").topicHash, null, konu(S.TASARIM.adres)]);
  const m = new Map();
  for (const x of l) { const e = ifcP.parseLog(x).args; const id = Number(e.id); m.set(id, (m.get(id) || 0) + (e.begendi ? 1 : -1)); }
  _begeniler = m; _begeniZaman = Date.now();
  return m;
}
export async function begeniSayisi(id) {
  if (!PROFIL_VAR) return null;
  return Number(await (await pk()).begeniSayisi(S.TASARIM.adres, id));
}
export async function begendiMi(ben, id) {
  if (!PROFIL_VAR || !ben) return false;
  return (await pk()).hasLiked(ben, S.TASARIM.adres, id);
}
/** Hidden wallets (admin gizle), newest flag per wallet. */
let _gizli = null;
export async function gizliler() {
  if (!PROFIL_VAR) return new Set();
  _gizli ||= loglar([ifcP.getEvent("Gizlendi").topicHash]).then((l) => new Set(sonDurum(l, (e) => e.cuzdan, (e) => e.gizli).map((a) => a.toLowerCase())))
    .catch(() => { _gizli = null; return new Set(); });
  return _gizli;
}

/* ---- calldata ---- */
export const veriP = {
  profilYaz: (ad, bio, avatar, baglantilar) => ifcP.encodeFunctionData("profilYaz", [ad, bio, avatar, baglantilar]),
  kullaniciAdiAl: (h) => ifcP.encodeFunctionData("kullaniciAdiAl", [h]),
  takipEt: (h) => ifcP.encodeFunctionData("takipEt", [h]),
  takiptenCik: (h) => ifcP.encodeFunctionData("takiptenCik", [h]),
  begen: (id) => ifcP.encodeFunctionData("begen", [S.TASARIM.adres, id]),
  begeniGeriAl: (id) => ifcP.encodeFunctionData("begeniGeriAl", [S.TASARIM.adres, id])
};

/** A revert of the social contracts in plain English (falls back to TasarimNFT's). */
export function hataAcikla(e) {
  const d = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data));
  const ham = typeof d === "string" ? d : d && typeof d.data === "string" ? d.data : null;
  let ad = null, args = [];
  for (const i of [ifcP, ifcM, ifcM2].filter(Boolean)) {
    if (ad || !ham || ham.length < 10) break;
    try { const p = i.parseError(ham); if (p) { ad = p.name; args = p.args; } } catch (x) { /* not this contract */ }
  }
  const M = {
    CokUzun: "Too long: " + ["name (48 bytes)", "bio (300 bytes)", "avatar link (200 bytes)", "links (600 bytes)"][Number(args[0])] + " at most.",
    KullaniciAdiGecersiz: "A handle is 3–20 characters: lowercase letters, digits and _.",
    KullaniciAdiAlinmis: "That handle is taken.",
    KullaniciAdiYok: "No handle to release.",
    KendiniTakipEdemez: "You cannot follow yourself.",
    KendineOlmaz: "You cannot message yourself.",
    BosMesaj: "Write a message first.",
    MesajCokUzun: "The message is too long (" + args[0] + " bytes encrypted; at most " + args[1] + "). Shorten it.",
    AliciAnahtariYok: "This wallet has not registered an unlock key yet, so it cannot receive encrypted messages.",
    Engellendi: "This wallet has blocked you.",
    Susturuldu: "Your wallet is muted by the moderator.",
    HizSiniri: "Too many messages in a minute. Wait a moment and send again.",
    ZatenTakipte: "Already following.",
    TakipteDegil: "Not following.",
    ZatenBegenildi: "Already liked.",
    Begenilmemis: "Not liked yet.",
    MesajYok: "That message was not sent by this wallet.",
    ZatenSilindi: "Already deleted.",
    YetkiYok: "This wallet is not allowed to do that."
  };
  if (ad && M[ad]) return M[ad];
  if (ad) return ad;
  return S.hataAcikla(e);
}

/** Send calldata to a social contract from the visitor's wallet on Arc (simulated first). */
export async function gonder({ cuzdan, to, data, durum, aciklama }) {
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  try { await S.onceDene(ben, to, data); } catch (e) { throw new Error(hataAcikla(e)); }
  durum && durum((aciklama || "Confirm in your wallet") + " (on Arc, a fraction of a cent of gas)…");
  let h;
  try { h = await cuzdan.agdaGonder(await S.arcAg(), { to, data, value: "0x0" }); }
  catch (e) { throw new Error(hataAcikla(e)); }
  durum && durum("Sent. Waiting for Arc to confirm…");
  const m = await S.makbuz(h, durum);
  _begeniler = null;
  return { h, m };
}
export const profilGonder = (o) => gonder({ ...o, to: SOSYAL.profil });
export const mesajGonder = (o) => gonder({ ...o, to: SOSYAL.mesaj });
export const mesaj2Gonder = (o) => gonder({ ...o, to: SOSYAL.mesaj2 });
export { esit };

/* ---- messages (MesajKutusu): the ciphertext lives in Mesaj events ---- */
async function mk() { return new Contract(SOSYAL.mesaj, MESAJ_ABI, await S.arc()); }
const mesajOlayi = (x) => { const e = ifcM.parseLog(x).args; return { gonderen: e.gonderen, alici: e.alici, konusma: e.konusma, sifreli: e.sifreli, zaman: Number(e.zaman) * 1000, blok: x.blockNumber, tx: x.transactionHash, sira: x.index ?? 0 }; };
/** Every message to or from `ben`, oldest first; with `sonra`, only those after that block (the live inbox). */
export async function mesajlar(ben, sonra) {
  if (!MESAJ_VAR || !ben) return [];
  const p = await S.arc();
  const t = ifcM.getEvent("Mesaj").topicHash;
  const bas = Number.isInteger(sonra) ? Math.max(SOSYAL.baslangicBloku, sonra + 1) : SOSYAL.baslangicBloku;
  const q = (topics) => p.getLogs({ address: SOSYAL.mesaj, topics, fromBlock: bas, toBlock: "latest" });
  const [gelen, giden] = await Promise.all([q([t, null, konu(ben)]), q([t, konu(ben)])]);
  const gor = new Set();
  return [...gelen, ...giden].filter((x) => { const k = x.transactionHash + ":" + (x.index ?? 0); if (gor.has(k)) return false; gor.add(k); return true; })
    .map(mesajOlayi).sort((a, b) => a.blok - b.blok || a.sira - b.sira);
}
/** 0 ok, 1 muted, 2 blocked, 3 recipient has no key, 4 rate limited, 5 bad address. */
export async function gonderilebilir(ben, alici) { return Number(await (await mk()).gonderilebilir(ben, alici)); }
export async function engelliMi(alici, gonderen) { return MESAJ_VAR ? (await mk()).engelli(alici, gonderen) : false; }
export const veriM = {
  gonder: (alici, sifreli) => ifcM.encodeFunctionData("gonder", [alici, sifreli]),
  engelle: (kim, evet) => ifcM.encodeFunctionData("engelle", [kim, !!evet])
};

/* ---- the private box (MesajKutusu2): ONE shared stream, no recipient on chain ----
   Every message of every wallet is read (the published archive + new blocks);
   mesaj2.js finds the reader's own by view tag and decryption, in the browser. */
async function mk2() { return new Contract(SOSYAL.mesaj2, MESAJ2_ABI, await S.arc()); }
const mesaj2Olayi = (x) => { const e = ifcM2.parseLog(x).args; return { surum: 2, gonderen: e.gonderen, id: e.id, sifreli: e.sifreli, zaman: Number(e.zaman) * 1000, blok: x.blockNumber, tx: x.transactionHash, sira: x.index ?? 0 }; };
const bas2 = (sonra) => (Number.isInteger(sonra) ? Math.max(SOSYAL.mesaj2Blok, sonra + 1) : SOSYAL.mesaj2Blok);
/** Every MesajKutusu2 message (all wallets), oldest first; with `sonra`/`kadar`, only blocks (sonra, kadar]. */
export async function mesajlar2(sonra, kadar) {
  if (!MESAJ2_VAR) return [];
  const p = await S.arc();
  const l = await p.getLogs({ address: SOSYAL.mesaj2, topics: [ifcM2.getEvent("Mesaj").topicHash], fromBlock: bas2(sonra), toBlock: Number.isInteger(kadar) ? kadar : "latest" });
  return l.map(mesaj2Olayi).sort((a, b) => a.blok - b.blok || a.sira - b.sira);
}
/** Ids (lowercase) of messages deleted by their senders (Sil events). */
export async function silinenler2() {
  if (!MESAJ2_VAR) return new Set();
  const p = await S.arc();
  const l = await p.getLogs({ address: SOSYAL.mesaj2, topics: [ifcM2.getEvent("Sil").topicHash], fromBlock: SOSYAL.mesaj2Blok, toBlock: "latest" });
  return new Set(l.map((x) => String(ifcM2.parseLog(x).args.id).toLowerCase()));
}
/** 0 ok, 1 muted, 4 rate limited. */
export async function gonderilebilir2(ben) { return Number(await (await mk2()).gonderilebilir(ben)); }
/** The nonce of `ben`'s message `id` (for sil), or -1. */
export async function nonceBul2(ben, id) {
  const c = await mk2();
  const n = Number(await c.gonderilenSayisi(ben));
  const { solidityPackedKeccak256 } = await import("../../vendor/ethers.min.js");
  for (let i = n - 1; i >= 0; i--) if (solidityPackedKeccak256(["address", "uint64"], [ben, i]).toLowerCase() === String(id).toLowerCase()) return i;
  return -1;
}
export const veriM2 = {
  gonder: (sifreli) => ifcM2.encodeFunctionData("gonder", [sifreli]),
  sil: (nonce) => ifcM2.encodeFunctionData("sil", [nonce])
};
