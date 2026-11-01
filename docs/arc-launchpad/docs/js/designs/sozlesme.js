/* ===========================================================================
 * designs/sozlesme.js — TasarimNFT on Arc: addresses, ABI, reads, calldata
 *
 * Contract: contracts/urun/designs/TasarimNFT.sol (deploy record
 * dagitim-designs.json). Everything here is a read (public Arc RPCs through
 * YedekliOkur) or the calldata of a transaction the visitor's own wallet
 * sends. Nothing is stored anywhere by the platform.
 *
 * v2 (TasarimNFT2, contracts/urun/designs/TasarimNFT2.sol): delivering the
 * file key is the condition of payment (buyer keys on chain, every sale in
 * escrow, teslimEt / teslimAldim / anahtarItiraz / iadeEt / serbestBirak).
 * It is behind DESIGNS_V2 below (on since its deployment, 1 Nov 2026);
 * acik: false goes back to v1 and every page follows (SURUM).
 *
 * The calldata builders (`veri.*`) are pure functions so that
 * scripts/designs-site-sim.mjs can run exactly what the page would send
 * through eth_simulateV1 on Arc state without sending anything.
 * =========================================================================== */
import { Interface, Contract, AbiCoder, keccak256, hexlify } from "../../vendor/ethers.min.js";

/* ---- the switch: Designs v2 (TasarimNFT2). OFF until deployed; the coordinator turns it on. ---- */
/* LIVE 1 Nov 2026: TasarimNFT2 deployed (dagitim-designs2.json, block 29038512); v1 had no designs. */
export const DESIGNS_V2 = { acik: true, adres: "0xFbE8F98e76bfbD2Acfe80c36d4c475041Fd8FEaa", baslangicBloku: 29038512 };
export const SURUM = DESIGNS_V2.acik && /^0x[0-9a-fA-F]{40}$/.test(DESIGNS_V2.adres || "") && DESIGNS_V2.baslangicBloku > 0 ? 2 : 1;

export const TASARIM = {
  adres: SURUM === 2 ? DESIGNS_V2.adres : "0x2D6b99205Dd31A780A5Fe0f7e258aF857a12C728",
  baslangicBloku: SURUM === 2 ? DESIGNS_V2.baslangicBloku : 29031971,
  /* v1, named for the record after the switch */
  v1: "0x2D6b99205Dd31A780A5Fe0f7e258aF857a12C728",
  zincirId: 5042,
  usdc: "0x3600000000000000000000000000000000000000",
  /* TurKaydi2 (v8 + v9 gates): TasarimNFT reads it since 1 Nov 2026 (turKaydiAyarla) */
  turKaydi: "0xbC0639f73e6485e479aCeE3bd5a427154CDe7402",
  /* PulseHook6 (v9): the price source (30-min TWAP) and the hook allowed for
     alUsdc (dagitim-designs.json fiyatKaynagi / kanca6). A designer token
     whose pool is on an older hook has no TWAP there, so it cannot be priced
     and the page says so per token. PulseHook5 was allowed at deployment. */
  kanca: "0x84144495479E6Ba4aEED060C07C818e572C8AECC",
  kanca5: "0x7CBF813E4B1A45B03911E6af27Cc58a308f36ecc",
  /* the v9 launchpad (dagitim-v9.json PulseLaunchpad5), whose pools use PulseHook6 */
  launchpad9: "0x87045C17BD5fCf3495abC30898803E39E25Be0dD",
  kasif: "https://explorer.arc.io"
};

export const TASARIM_ABI = [
  "error AzCikti(uint256 gelen, uint256 asgari)", "error Durduruldu()", "error EmanetYok()", "error FazlaYok(uint256 serbest)",
  "error FiyatYok()", "error IlanYok()", "error ItirazAcik()", "error ItirazYok()", "error KancaIzinsiz()",
  "error KaymaAsildi(uint256 gereken, uint256 azami)", "error KopyaAlgi(uint256 mevcutId)", "error KopyaDosya(uint256 mevcutId)",
  "error KotuDeger()", "error SifirAdres()", "error SureBitmedi()", "error SureBitti()", "error TasarimciDegil()", "error YetkiYok()", "error Yok()",
  "error ERC721NonexistentToken(uint256 tokenId)", "error SafeERC20FailedOperation(address token)",
  "error BilinmeyenHavuz()",   // PulseHook6 (the price source): no TWAP for this token's pool
  "event Yayinlandi(uint256 indexed id, address indexed tasarimci, address indexed token, bytes32 dosyaHash, bytes32 algiHash, string uri, uint256 ucret, uint256 teminat)",
  "event IlanVerildi(uint256 indexed id, address indexed satici, uint256 fiyat)",
  "event IlanKalkti(uint256 indexed id)",
  "event Satildi(uint256 indexed id, address indexed satici, address indexed alici, uint256 fiyat, address token, uint256 tokenMiktari, uint256 telif, bool usdcIle)",
  "event ItirazEdildi(uint256 indexed id, address indexed itirazci, uint256 oncekiId, string kanitUri, uint256 teminat)",
  "event ItirazCozuldu(uint256 indexed id, bool kabul, address itirazci, uint256 odenen, address alan)",
  "event Kaldirildi(uint256 indexed id, string sebep)",
  "event TeminatIade(uint256 indexed id, address kime, uint256 miktar)",
  "event Emanete(uint256 indexed id, uint256 sira, address alici, address satici, uint256 miktar, uint256 telif)",
  "event EmanetOdendi(uint256 indexed id, uint256 sira, address kime, uint256 miktar, bool iade)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function LISANS() view returns (string)",
  "function LISANS_URI() view returns (string)",
  "function URI_AZAMI() view returns (uint256)",
  "function al(uint256 id, uint256 maxToken) returns (uint256 miktar)",
  "function alUsdc(uint256 id, address kanca, uint256 minToken) returns (uint256 miktar)",
  "function alUsdcToleransBps() view returns (uint16)",
  "function algiKaydi(bytes32) view returns (uint256)",
  "function dosyaKaydi(bytes32) view returns (uint256)",
  "function durduruldu() view returns (bool)",
  "function elleBagliToken(address) view returns (address)",
  "function emanet(uint256 id, uint256 sira) view returns (uint256 sayi, uint256 islenen, (address alici, address satici, uint256 miktar, uint256 telif) e)",
  "function emanetAcik() view returns (bool)",
  "function emanetIsle(uint256 id, uint256 adet) returns (uint256 son)",
  "function fiyatKaynagi() view returns (address)",
  "function ilanKaldir(uint256 id)",
  "function ilanOf(uint256) view returns (address satici, uint256 fiyat)",
  "function ilanVer(uint256 id, uint256 fiyat)",
  "function iptalOf(uint256) view returns (bool)",
  "function itirazEt(uint256 id, uint256 oncekiId, string kanitUri)",
  "function itirazSuresi() view returns (uint64)",
  "function itirazTeminati() view returns (uint256)",
  "function kancaAyar(address) view returns (bool izinli, uint24 fee, int24 tickSpacing)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function sonId() view returns (uint256)",
  "function tasarim(uint256 id) view returns ((address token, address tasarimci, uint64 itirazBitis, bytes32 dosyaHash, bytes32 algiHash, uint256 teminat) t, string uri, (address satici, uint256 fiyat) ilan, (address itirazci, uint256 teminat, uint256 oncekiId) itiraz)",
  "function tasarimciTeminati() view returns (uint256)",
  "function telifBps() view returns (uint16)",
  "function teminatGeriAl(uint256 id)",
  "function tokenKarsiligi(address token, uint256 fiyat) view returns (uint256)",
  "function tokenURI(uint256 id) view returns (string)",
  "function ucret1() view returns (uint256)",
  "function ucret2() view returns (uint256)",
  "function yayinla(address token, bytes32 dosyaHash, bytes32 algiHash, string uri, uint256 fiyat) returns (uint256 id)",
  "function yayinlayabilir(address tasarimci, address token) view returns (bool)"
];

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

/* TasarimNFT2's ABI (build/TasarimNFT2.json, admin functions left out) */
export const TASARIM_ABI2 = [
  "error AnahtarYok()",
  "error AzCikti(uint256 gelen, uint256 asgari)",
  "error Durduruldu()",
  "error ERC721NonexistentToken(uint256 tokenId)",
  "error FazlaYok(uint256 serbest)",
  "error FiyatYok()",
  "error IlanYok()",
  "error ItirazAcik()",
  "error ItirazYok()",
  "error KancaIzinsiz()",
  "error KaymaAsildi(uint256 gereken, uint256 azami)",
  "error Kilitli()",
  "error KopyaAlgi(uint256 mevcutId)",
  "error KopyaDosya(uint256 mevcutId)",
  "error KotuDeger()",
  "error KotuDurum(uint8 durum)",
  "error SafeERC20FailedOperation(address token)",
  "error SifirAdres()",
  "error SureBitmedi()",
  "error SureBitti()",
  "error TaahhutYok()",
  "error TasarimciDegil()",
  "error YetkiYok()",
  "event AnahtarItirazi(uint256 indexed id, address alici)",
  "event AnahtarKaydedildi(address indexed cuzdan, bytes anahtar)",
  "event IlanKalkti(uint256 indexed id)",
  "event IlanVerildi(uint256 indexed id, address indexed satici, uint256 fiyat)",
  "event ItirazCozuldu(uint256 indexed id, bool kabul, address itirazci, uint256 odenen, address alan)",
  "event ItirazEdildi(uint256 indexed id, address indexed itirazci, uint256 oncekiId, string kanitUri, uint256 teminat)",
  "event Kaldirildi(uint256 indexed id, string sebep)",
  "event OnuAlindi(uint256 indexed yeniId, uint256 indexed eskiId)",
  "event Satildi(uint256 indexed id, address indexed satici, address indexed alici, uint256 fiyat, address token, uint256 tokenMiktari, uint256 telif, bool usdcIle)",
  "event SatisKapandi(uint256 indexed id, bool saticiyaOdendi, address kime, uint256 miktar)",
  "event Taahhut(address indexed kim, bytes32 taahhut, uint256 blok)",
  "event TeminatIade(uint256 indexed id, address kime, uint256 miktar)",
  "event TeslimAlindi(uint256 indexed id)",
  "event TeslimEdildi(uint256 indexed id, address indexed alici, bytes zarf)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Yayinlandi(uint256 indexed id, address indexed tasarimci, address indexed token, bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, string uri, uint256 ucret, uint256 teminat)",
  "function ANAHTAR_AZAMI() view returns (uint256)",
  "function LISANS() view returns (string)",
  "function LISANS_URI() view returns (string)",
  "function URI_AZAMI() view returns (uint256)",
  "function ZARF_AZAMI() view returns (uint256)",
  "function al(uint256 id, uint256 maxToken, bytes anahtar) returns (uint256 miktar)",
  "function alUsdc(uint256 id, address kanca, uint256 minToken, bytes anahtar) returns (uint256 miktar)",
  "function alUsdcToleransBps() view returns (uint16)",
  "function algiKaydi(bytes32) view returns (uint256)",
  "function anahtarItiraz(uint256 id)",
  "function anahtarItirazSuresi() view returns (uint64)",
  "function anahtarKaydet(bytes anahtar)",
  "function anahtarOf(address) view returns (bytes)",
  "function dosyaKaydi(bytes32) view returns (uint256)",
  "function durduruldu() view returns (bool)",
  "function elleBagliToken(address) view returns (address)",
  "function fiyatBirimi() view returns (uint256)",
  "function fiyatKaynagi() view returns (address)",
  "function iadeEt(uint256 id)",
  "function ilanKaldir(uint256 id)",
  "function ilanOf(uint256) view returns (address satici, uint256 fiyat)",
  "function ilanVer(uint256 id, uint256 fiyat)",
  "function itirazEt(uint256 id, uint256 oncekiId, string kanitUri)",
  "function itirazOf(uint256) view returns (address itirazci, uint256 teminat, uint256 oncekiId)",
  "function itirazSuresi() view returns (uint64)",
  "function itirazTeminati() view returns (uint256)",
  "function kancaAyar(address) view returns (bool izinli, uint24 fee, int24 tickSpacing)",
  "function kopyaPenceresiBekle() view returns (bool)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function satisOf(uint256) view returns (address alici, uint8 durum, address satici, uint64 teslimSonu, uint64 itirazSonu, uint64 itirazPenceresi, uint256 miktar, uint256 telif, bytes32 aliciAnahtarHash, bytes32 zarfHash)",
  "function serbestBirak(uint256 id)",
  "function sonId() view returns (uint256)",
  "function taahhutBlok() view returns (uint64)",
  "function taahhutEt(bytes32 taahhut)",
  "function taahhutOf(address, bytes32) view returns (uint256)",
  "function tasarimOf(uint256) view returns (address token, address tasarimci, uint64 itirazBitis, uint64 yayinBlok, bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, uint256 teminat)",
  "function tasarimciTeminati() view returns (uint256)",
  "function telifBps() view returns (uint16)",
  "function teminatGeriAl(uint256 id)",
  "function teslimAldim(uint256 id)",
  "function teslimEt(uint256 id, bytes zarf)",
  "function teslimSuresi() view returns (uint64)",
  "function tokenKarsiligi(address token, uint256 fiyat) view returns (uint256)",
  "function tokenURI(uint256 id) view returns (string)",
  "function turKaydi() view returns (address)",
  "function twapSaniye() view returns (uint32)",
  "function ucret1() view returns (uint256)",
  "function ucret2() view returns (uint256)",
  "function yayinla(address token, bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, string uri, uint256 fiyat) returns (uint256)",
  "function yayinlaAcik(address token, bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, string uri, uint256 fiyat, bytes32 tuz) returns (uint256 id)",
  "function yayinlayabilir(address tasarimci, address token) view returns (bool)"
];

export const ABI_AKTIF = SURUM === 2 ? TASARIM_ABI2 : TASARIM_ABI;
export const ifc = new Interface(ABI_AKTIF);
export const ifc20 = new Interface(ERC20_ABI);

/* The on-chain license, word for word (TasarimNFT.LISANS). The page reads the
   contract and shows this only if the read fails. */
export const LISANS_YEDEK =
  "The holder of this NFT holds all usage rights to the design, including commercial use. " +
  "On transfer all rights pass to the new holder; the previous holder keeps none.";

/* ---- calldata: what the page asks the wallet to send ---- */
export const veri = {
  onay: (harcayan, miktar) => ifc20.encodeFunctionData("approve", [harcayan, miktar]),
  /* v2 adds anahtarTaahhut (keccak256 of the file key) to yayinla and the buyer's key (bytes, "0x" = the registered one) to al / alUsdc */
  yayinla: (token, dosyaHash, algiHash, uri, fiyat, anahtarTaahhut) => SURUM === 2
    ? ifc.encodeFunctionData("yayinla", [token, dosyaHash, algiHash, anahtarTaahhut, uri, fiyat])
    : ifc.encodeFunctionData("yayinla", [token, dosyaHash, algiHash, uri, fiyat]),
  al: (id, maxToken, anahtar = "0x") => SURUM === 2 ? ifc.encodeFunctionData("al", [id, maxToken, anahtar]) : ifc.encodeFunctionData("al", [id, maxToken]),
  alUsdc: (id, kanca, minToken, anahtar = "0x") => SURUM === 2 ? ifc.encodeFunctionData("alUsdc", [id, kanca, minToken, anahtar]) : ifc.encodeFunctionData("alUsdc", [id, kanca, minToken]),
  /* v2 only */
  anahtarKaydet: (anahtar) => ifc.encodeFunctionData("anahtarKaydet", [anahtar]),
  teslimEt: (id, zarf) => ifc.encodeFunctionData("teslimEt", [id, zarf]),
  teslimAldim: (id) => ifc.encodeFunctionData("teslimAldim", [id]),
  anahtarItiraz: (id) => ifc.encodeFunctionData("anahtarItiraz", [id]),
  serbestBirak: (id) => ifc.encodeFunctionData("serbestBirak", [id]),
  iadeEt: (id) => ifc.encodeFunctionData("iadeEt", [id]),
  ilanVer: (id, fiyat) => ifc.encodeFunctionData("ilanVer", [id, fiyat]),
  ilanKaldir: (id) => ifc.encodeFunctionData("ilanKaldir", [id]),
  itirazEt: (id, oncekiId, kanitUri) => ifc.encodeFunctionData("itirazEt", [id, oncekiId, kanitUri]),
  emanetIsle: (id, adet) => ifc.encodeFunctionData("emanetIsle", [id, adet]),
  teminatGeriAl: (id) => ifc.encodeFunctionData("teminatGeriAl", [id]),
  /* v2 commit-reveal: taahhutEt(keccak256(abi.encode(sender, dosyaHash, algiHash, tuz))) first, then
     yayinlaAcik in a later block (within taahhutBlok blocks) shows the hashes and publishes */
  taahhutEt: (taahhut) => ifc.encodeFunctionData("taahhutEt", [taahhut]),
  yayinlaAcik: (token, dosyaHash, algiHash, uri, fiyat, anahtarTaahhut, tuz) =>
    ifc.encodeFunctionData("yayinlaAcik", [token, dosyaHash, algiHash, anahtarTaahhut, uri, fiyat, tuz])
};

/** The commitment TasarimNFT2 checks in yayinlaAcik: keccak256(abi.encode(sender, dosyaHash, algiHash, tuz)). */
export const taahhutHesapla = (gonderen, dosyaHash, algiHash, tuz) =>
  keccak256(AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes32", "bytes32"], [gonderen, dosyaHash, algiHash, tuz]));
/** A fresh random 32-byte salt (crypto.getRandomValues). */
export const tuzUret = () => hexlify(globalThis.crypto.getRandomValues(new Uint8Array(32)));
/** Commit-reveal is on TasarimNFT2 only. */
export const TAAHHUT_VAR = SURUM === 2;

/** A revert in plain English (custom errors of TasarimNFT). */
export function hataAcikla(e) {
  const d = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data));
  const ham = typeof d === "string" ? d : d && typeof d.data === "string" ? d.data : null;
  let ad = null, args = [];
  if (ham && ham.length >= 10) { try { const p = ifc.parseError(ham); if (p) { ad = p.name; args = p.args; } } catch (x) { /* not ours */ } }
  if (!ad && e && e.revert && e.revert.name) { ad = e.revert.name; args = e.revert.args || []; }
  const M = {
    TasarimciDegil: "This wallet cannot publish with that token: its type in TurKaydi must be Designer (8) and its founder must be this wallet.",
    KopyaDosya: "This exact file is already published (design #" + args[0] + ").",
    KopyaAlgi: "A design with the same fingerprint is already published (design #" + args[0] + ").",
    KotuDeger: "A value was refused by the contract (empty hash or URI, URI over 512 bytes, zero price, or buying your own listing).",
    Durduruldu: "Designs is paused by the admin right now.",
    FiyatYok: "Buying opens when the price feed is live: the designer-token price source is not set yet.",
    BilinmeyenHavuz: "Buying opens when the price feed is live for this token: its pool has no time-weighted price on PulseHook6 (tokens launched before v9 trade in an older pool).",
    IlanYok: "This design is not listed for sale.",
    ItirazAcik: "A challenge is open on this design; sales and settlement wait for it to be resolved.",
    ItirazYok: "No challenge is open.",
    SureBitti: "The challenge window for this design is over.",
    SureBitmedi: "The challenge window is still open; this can be done after it ends.",
    KaymaAsildi: "The price moved: it now needs more designer tokens than your limit. Try again.",
    KancaIzinsiz: "This pool's hook is not allowed for USDC purchases.",
    AzCikti: "The pool would return too few designer tokens for the seller (the pool price is far from the time-weighted price).",
    EmanetYok: "Nothing is waiting in escrow for this design.",
    YetkiYok: "Only the holder (or the designer, for the stake) can do this.",
    ERC721NonexistentToken: "This design does not exist (or was taken down).",
    AnahtarYok: "Register your unlock key first (My profile), or buy from this page: it registers it in the same transaction.",
    KotuDurum: "The sale is not in the state this needs (it may have moved on: reload the page).",
    Kilitli: "This design is in an open sale (waiting for the key or the buyer's confirmation) and cannot be moved now.",
    TaahhutYok: "No matching publish commitment from an earlier block."
  };
  if (ad && M[ad]) return M[ad];
  const m = (e && (e.shortMessage || e.message)) || String(e);
  if (e && (e.code === 4001 || e.code === "ACTION_REJECTED" || /user rejected|denied/i.test(m))) return "Cancelled in the wallet.";
  return m;
}

/* ---- reads ---- */
let _arc = null;
export async function arc() {
  if (!_arc) { const { YedekliOkur } = await import("../yedekli-okur.js"); _arc = new YedekliOkur(); }
  return _arc;
}
export async function nft() { return new Contract(TASARIM.adres, ABI_AKTIF, await arc()); }
export async function erc20(adres) { return new Contract(adres, ERC20_ABI, await arc()); }

/** The contract's settings the pages show. */
export async function ayarlar() {
  const c = await nft();
  const [u1, u2, teminat, itirazTeminati, itirazSuresi, fiyatKaynagi, durduruldu, emanetAcik, telifBps, sonId, lisans, teslimSuresi, anahtarItirazSuresi] = await Promise.all([
    c.ucret1(), c.ucret2(), c.tasarimciTeminati(), c.itirazTeminati(), c.itirazSuresi(), c.fiyatKaynagi(), c.durduruldu(),
    /* v2 escrows every sale until the key is delivered (no switch) */
    SURUM === 2 ? true : c.emanetAcik(), c.telifBps(), c.sonId(), c.LISANS().catch(() => LISANS_YEDEK),
    SURUM === 2 ? c.teslimSuresi() : 0n, SURUM === 2 ? c.anahtarItirazSuresi() : 0n]);
  return {
    ucret: u1 + u2, ucret1: u1, ucret2: u2, teminat, itirazTeminati, itirazSuresi: Number(itirazSuresi),
    fiyatKaynagi, fiyatCanli: !/^0x0{40}$/i.test(fiyatKaynagi), durduruldu, emanetAcik, telifBps: Number(telifBps),
    sonId: Number(sonId), lisans, teslimSuresi: Number(teslimSuresi), anahtarItirazSuresi: Number(anahtarItirazSuresi)
  };
}

/* Every Yayinlandi since deployment. One getLogs over the range (YedekliOkur
   moves to the next RPC when one refuses); if all refuse, sonId is walked. */
let _yayinlar = null, _yayinZaman = 0;
export async function yayinlar() {
  if (_yayinlar && Date.now() - _yayinZaman < 20_000) return _yayinlar;
  const p = await arc();
  let liste;
  try {
    const loglar = await p.getLogs({ address: TASARIM.adres, topics: [ifc.getEvent("Yayinlandi").topicHash], fromBlock: TASARIM.baslangicBloku, toBlock: "latest" });
    liste = loglar.map((l) => {
      const a = ifc.parseLog(l).args;
      return { id: Number(a.id), tasarimci: a.tasarimci, token: a.token, dosyaHash: a.dosyaHash, algiHash: a.algiHash, uri: a.uri, blok: l.blockNumber, tx: l.transactionHash };
    });
  } catch (e) {
    const c = await nft();
    const n = Number(await c.sonId());
    liste = [];
    for (let id = Math.max(1, n - 200); id <= n; id++) {
      const [t, uri] = SURUM === 2 ? [await c.tasarimOf(id), await c.tokenURI(id).catch(() => "")] : await c.tasarim(id);
      liste.push({ id, tasarimci: t.tasarimci, token: t.token, dosyaHash: t.dosyaHash, algiHash: t.algiHash, uri, blok: null, tx: null });
    }
  }
  _yayinlar = liste.sort((a, b) => b.id - a.id);   // newest first
  _yayinZaman = Date.now();
  return _yayinlar;
}
export function yayinlariUnut() { _yayinlar = null; }

/** One design with its live state: owner (null when burned), listing, challenge. */
export async function tasarimOku(id) {
  const c = await nft();
  const [[t, uri, ilan, itiraz], sahip, iptal] = await Promise.all([
    SURUM === 2 ? Promise.all([c.tasarimOf(id), c.tokenURI(id).catch(() => yayinUri(id)), c.ilanOf(id), c.itirazOf(id)]) : c.tasarim(id),
    c.ownerOf(id).catch(() => null), SURUM === 2 ? false : c.iptalOf(id).catch(() => false)]);
  if (/^0x0{40}$/i.test(t.tasarimci)) return null;
  return {
    id: Number(id), token: t.token, tasarimci: t.tasarimci, itirazBitis: Number(t.itirazBitis) * 1000,
    dosyaHash: t.dosyaHash, algiHash: t.algiHash, teminat: t.teminat, uri,
    ilan: ilan.fiyat > 0n ? { satici: ilan.satici, fiyat: ilan.fiyat } : null,
    itiraz: /^0x0{40}$/i.test(itiraz.itirazci) ? null : { itirazci: itiraz.itirazci, teminat: itiraz.teminat, oncekiId: Number(itiraz.oncekiId) },
    sahip, iptal: !!iptal || (SURUM === 2 && !sahip),
    anahtarTaahhut: t.anahtarTaahhut || null,
    satis: SURUM === 2 ? await satisOku(id) : null
  };
}

/* v2: tokenURI reverts once a design is burned; the URI is still in its Yayinlandi event */
async function yayinUri(id) {
  const l = (await yayinlar()).find((x) => x.id === Number(id));
  return l ? l.uri : "";
}
const konu = (a) => "0x" + String(a).slice(2).toLowerCase().padStart(64, "0");
const idKonusu = (id) => "0x" + BigInt(id).toString(16).padStart(64, "0");

/** v2: the open sale of a design (null when none). durum 1 awaiting delivery, 2 delivered, 3 key disputed, 4 confirmed. */
export async function satisOku(id) {
  if (SURUM !== 2) return null;
  const s = await (await nft()).satisOf(id);
  if (Number(s.durum) === 0) return null;
  return { alici: s.alici, durum: Number(s.durum), satici: s.satici, teslimSonu: Number(s.teslimSonu) * 1000, itirazSonu: Number(s.itirazSonu) * 1000,
    miktar: s.miktar, telif: s.telif, aliciAnahtarHash: s.aliciAnahtarHash, zarfHash: s.zarfHash };
}

/** v2: a wallet's registered encryption key (hex bytes, "0x" when none). */
export async function anahtarOku(adres) {
  if (SURUM !== 2) return "0x";
  return (await nft()).anahtarOf(adres);
}

/** v2: every key a wallet has registered (AnahtarKaydedildi), newest first: a sale is bound to the key it was made with. */
export async function anahtarGecmisi(adres) {
  const p = await arc();
  const l = await p.getLogs({ address: TASARIM.adres, topics: [ifc.getEvent("AnahtarKaydedildi").topicHash, konu(adres)], fromBlock: TASARIM.baslangicBloku, toBlock: "latest" });
  return l.map((x) => ifc.parseLog(x).args.anahtar).reverse();
}

/** v2: the newest key envelope posted for design `id` (TeslimEdildi), or null. */
export async function sonZarf(id) {
  const p = await arc();
  const l = await p.getLogs({ address: TASARIM.adres, topics: [ifc.getEvent("TeslimEdildi").topicHash, idKonusu(id)], fromBlock: TASARIM.baslangicBloku, toBlock: "latest" });
  if (!l.length) return null;
  const a = ifc.parseLog(l[l.length - 1]).args;
  return { alici: a.alici, zarf: a.zarf, tx: l[l.length - 1].transactionHash };
}

/** v2: every key envelope posted for design `id`, oldest first ({alici, zarf, tx}). */
export async function zarflar(id) {
  if (SURUM !== 2) return [];
  const p = await arc();
  const l = await p.getLogs({ address: TASARIM.adres, topics: [ifc.getEvent("TeslimEdildi").topicHash, idKonusu(id)], fromBlock: TASARIM.baslangicBloku, toBlock: "latest" });
  return l.map((x) => { const a = ifc.parseLog(x).args; return { alici: a.alici, zarf: a.zarf, tx: x.transactionHash }; });
}

/** v2: designs this wallet sold that still wait for its key delivery (durum 1). */
export async function bekleyenTeslimler(satici) {
  if (SURUM !== 2 || !satici) return [];
  const p = await arc();
  const l = await p.getLogs({ address: TASARIM.adres, topics: [ifc.getEvent("Satildi").topicHash, null, konu(satici)], fromBlock: TASARIM.baslangicBloku, toBlock: "latest" });
  const idler = [...new Set(l.map((x) => Number(ifc.parseLog(x).args.id)))];
  const out = [];
  for (const id of idler) {
    const s = await satisOku(id).catch(() => null);
    if (s && s.durum === 1 && s.satici.toLowerCase() === satici.toLowerCase()) out.push({ id, ...s });
  }
  return out;
}

/** Many designs' listing + owner at once (for grids). */
export async function durumlar(idler) {
  const c = await nft();
  return Promise.all(idler.map(async (id) => {
    const [ilan, sahip] = await Promise.all([c.ilanOf(id).catch(() => null), c.ownerOf(id).catch(() => null)]);
    return { id, fiyat: ilan && ilan.fiyat > 0n ? ilan.fiyat : null, sahip };
  }));
}

/** The design's history from its events, oldest first. */
export async function gecmis(id) {
  const p = await arc();
  const idKonu = "0x" + BigInt(id).toString(16).padStart(64, "0");
  const olaylar = ["Yayinlandi", "IlanVerildi", "IlanKalkti", "Satildi", "ItirazEdildi", "ItirazCozuldu", "Kaldirildi", "Emanete", "EmanetOdendi", "TeminatIade",
    "TeslimEdildi", "TeslimAlindi", "AnahtarItirazi", "SatisKapandi", "OnuAlindi"];
  const konular = olaylar.filter((o) => { try { return !!ifc.getEvent(o); } catch (e) { return false; } }).map((o) => ifc.getEvent(o).topicHash);
  const transfer = ifc.getEvent("Transfer").topicHash;
  const [a, b] = await Promise.all([
    p.getLogs({ address: TASARIM.adres, topics: [konular, idKonu], fromBlock: TASARIM.baslangicBloku, toBlock: "latest" }),
    p.getLogs({ address: TASARIM.adres, topics: [transfer, null, null, idKonu], fromBlock: TASARIM.baslangicBloku, toBlock: "latest" })
  ]);
  return [...a, ...b].sort((x, y) => x.blockNumber - y.blockNumber || x.index - y.index).map((l) => {
    const e = ifc.parseLog(l);
    return { ad: e.name, args: e.args, blok: l.blockNumber, tx: l.transactionHash };
  });
}

/** Is a fingerprint already on chain? Returns the design id or 0. */
export async function kayitliMi(dosyaHash, algiHash) {
  const c = await nft();
  const [d, a] = await Promise.all([c.dosyaKaydi(dosyaHash), c.algiKaydi(algiHash)]);
  return { dosya: Number(d), algi: Number(a) };
}

/** Designer tokens worth `fiyat` USDC at the TWAP, or null while there is no price feed. */
export async function tokenKarsiligi(token, fiyat) {
  try { return await (await nft()).tokenKarsiligi(token, fiyat); } catch (e) { return null; }
}

/** Token name/symbol/decimals, cached per page load. */
const _jeton = new Map();
export function jetonBilgi(adres) {
  const k = String(adres).toLowerCase();
  if (!_jeton.has(k)) {
    const p = erc20(adres).then(async (c) => {
      const [ad, sembol, ondalik] = await Promise.all([c.name().catch(() => null), c.symbol().catch(() => null), c.decimals().catch(() => 18)]);
      return { adres, ad, sembol, ondalik: Number(ondalik) };
    });
    p.catch(() => _jeton.delete(k));
    _jeton.set(k, p);
  }
  return _jeton.get(k);
}

/** The Uniswap v4 hook of a designer token's launch pool (havuzAnahtari on the v9
    launchpad, then on the launchpad the site's basket config names). */
export async function havuzKancasi(token) {
  const ABI_LP = ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))"];
  const adaylar = [TASARIM.launchpad9];
  try { const { sepetV2, SEPET } = await import("../teminat-izle.js"); const cfg = (await sepetV2()) || SEPET; if (cfg && cfg.lp5) adaylar.push(cfg.lp5); } catch (e) { /* config unreadable */ }
  for (const a of adaylar) {
    try {
      const k = await new Contract(a, ABI_LP, await arc()).havuzAnahtari(token);
      if (k && !/^0x0{40}$/i.test(k[4])) return k[4];
    } catch (e) { /* not this launchpad's token */ }
  }
  return TASARIM.kanca;
}

/* ---- sending (the visitor's wallet, on Arc) ---- */
export async function arcAg() {
  const { AGLAR } = await import("../aglar.js");
  return AGLAR.find((a) => a.anahtar === "arc");
}

/** Wait for a receipt on Arc; throws on revert. */
export async function makbuz(h, durum) {
  const p = await arc();
  for (let i = 0; i < 60; i++) {
    const m = await p.getTransactionReceipt(h).catch(() => null);
    if (m) { if (m.status !== 1) throw new Error("The transaction reverted on Arc: " + h); return m; }
    if (durum && i === 4) durum("Still waiting for Arc to confirm " + h.slice(0, 12) + "…");
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("No receipt yet for " + h + ". It may still go through: check it in the explorer before sending again.");
}

/** Approve `miktar` of `token` to TasarimNFT when the allowance is short. */
export async function onayGerekirse({ cuzdan, token, miktar, durum, etiket }) {
  const ben = cuzdan.hesap();
  const c = await erc20(token);
  const izin = await c.allowance(ben, TASARIM.adres).catch(() => 0n);
  if (izin >= miktar) return null;
  durum("Approve " + (etiket || "the token") + " for Designs in your wallet…");
  const h = await cuzdan.agdaGonder(await arcAg(), { to: token, data: veri.onay(TASARIM.adres, miktar), value: "0x0" });
  durum("Approval sent. Waiting for Arc…");
  await makbuz(h, durum);
  return h;
}

/** Simulate first (eth_call from the wallet's address) so a revert is explained before the wallet opens. */
export async function onceDene(ben, to, data) {
  const p = await arc();
  await p.call({ from: ben, to, data });
}

export async function gonder({ cuzdan, data, durum, aciklama }) {
  const ben = cuzdan.hesap();
  try { await onceDene(ben, TASARIM.adres, data); } catch (e) { throw new Error(hataAcikla(e)); }
  durum((aciklama || "Confirm in your wallet") + " (on Arc, a few cents of gas)…");
  let h;
  try { h = await cuzdan.agdaGonder(await arcAg(), { to: TASARIM.adres, data, value: "0x0" }); }
  catch (e) { throw new Error(hataAcikla(e)); }
  durum("Sent. Waiting for Arc to confirm…");
  const m = await makbuz(h, durum);
  yayinlariUnut();
  return { h, m };
}
