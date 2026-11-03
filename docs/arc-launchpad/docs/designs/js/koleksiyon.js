/* ===========================================================================
 * designs/js/koleksiyon.js — collections and drops on Arc (KoleksiyonKaydi)
 *
 * Contract: contracts/urun/designs/KoleksiyonKaydi.sol (deploy record
 * dagitim-siparis.json, scripts/siparis-dagit.js). Until it is deployed the
 * address stays empty and the pages say "Collections open soon".
 *
 * A collection is a designer's named series of their own TasarimNFT2
 * designs, with a cover link, a description and an optional drop start.
 * Before the start the pages show a countdown instead of Buy (satistaMi);
 * TasarimNFT2 itself is unchanged, so a design listed early can still be
 * bought by calling it directly. The pages say so. No DOM here.
 * =========================================================================== */
import { Interface, Contract } from "../../vendor/ethers.min.js";
import * as S from "../../js/designs/sozlesme.js";

/* ---- the switch: set after scripts/siparis-dagit.js (dagitim-siparis.json) ---- */
export const KOLEKSIYON = {
  adres: "0x27F2f84E0d9D7139aB12EC769bF8eb1b6F263bc1",   // KoleksiyonKaydi (deployed 2 Nov 2026)
  baslangicBloku: 29168597   // its deploy block (event scans start here)
};
export const KOLEKSIYON_VAR = /^0x[0-9a-fA-F]{40}$/.test(KOLEKSIYON.adres || "") && KOLEKSIYON.baslangicBloku > 0;

const K_TIP = "(address tasarimci, uint64 baslangic, uint64 olusturma, uint32 adet, bool silindi, bool gizli, string ad, string aciklama, string kapakUri)";
export const KOLEKSIYON_ABI = [
  "error YetkiYok()", "error SifirAdres()", "error KotuDeger()", "error CokUzun(uint8 alan)", "error KoleksiyonYok()", "error TasarimciDegil(uint256 tasarim)",
  "error BaskaKoleksiyonda(uint256 tasarim, uint256 koleksiyon)", "error BuKoleksiyondaDegil(uint256 tasarim)", "error CokFazla()", "error DropBasladi()",
  "event KoleksiyonYazildi(uint256 indexed id, address indexed tasarimci, string ad, string aciklama, string kapakUri, uint64 baslangic, bool yeni)",
  "event TasarimEklendi(uint256 indexed koleksiyon, uint256 indexed tasarim)",
  "event TasarimCikarildi(uint256 indexed koleksiyon, uint256 indexed tasarim)",
  "event KoleksiyonSilindi(uint256 indexed id)",
  "event Gizlendi(uint256 indexed id, bool gizli)",
  "function olustur(string ad, string aciklama, string kapakUri, uint64 baslangic, uint256[] tasarimlar) returns (uint256 id)",
  "function guncelle(uint256 id, string ad, string aciklama, string kapakUri, uint64 baslangic)",
  "function ekle(uint256 id, uint256[] tasarimlar)",
  "function cikar(uint256 id, uint256[] tasarimlar)",
  "function sil(uint256 id)",
  "function sonKoleksiyon() view returns (uint256)",
  "function koleksiyon(uint256 id) view returns (" + K_TIP + " k, uint256[] tasarimlar)",
  "function koleksiyonlar(uint256[] idler) view returns (" + K_TIP + "[] out)",
  "function tasarimcininKoleksiyonlari(address tasarimci) view returns (uint256[])",
  "function koleksiyonOf(uint256) view returns (uint256)",
  "function satistaMi(uint256 t) view returns (bool)",
  "function dropBilgisi(uint256[] tasarimlar) view returns (uint256[] koleksiyonlar_, uint64[] baslangiclar)"
];
export const ifcK = new Interface(KOLEKSIYON_ABI);
export const LIMIT_K = { ad: 64, aciklama: 500, kapak: 512, toplu: 50, tasarim: 200 };

async function kk() { return new Contract(KOLEKSIYON.adres, KOLEKSIYON_ABI, await S.arc()); }
const kCoz = (id, k) => ({ id: Number(id), tasarimci: k.tasarimci, baslangic: Number(k.baslangic) * 1000, olusturma: Number(k.olusturma) * 1000, adet: Number(k.adet),
  silindi: k.silindi, gizli: k.gizli, ad: k.ad, aciklama: k.aciklama, kapakUri: k.kapakUri });

/** Every live collection (not deleted, not hidden), newest first. */
export async function koleksiyonlar() {
  if (!KOLEKSIYON_VAR) return [];
  const c = await kk();
  const n = Number(await c.sonKoleksiyon());
  if (!n) return [];
  const idler = Array.from({ length: n }, (_, i) => n - i);
  const l = await c.koleksiyonlar(idler);
  return idler.map((id, i) => kCoz(id, l[i])).filter((k) => !k.silindi && !k.gizli && !/^0x0{40}$/i.test(k.tasarimci));
}

/** One collection with its design ids (null when it does not exist or was deleted). */
export async function koleksiyonOku(id) {
  if (!KOLEKSIYON_VAR) return null;
  const [k, t] = await (await kk()).koleksiyon(id);
  if (/^0x0{40}$/i.test(k.tasarimci) || k.silindi) return null;
  return { ...kCoz(id, k), tasarimlar: t.map(Number) };
}

/** A designer's live collections. */
export async function tasarimcininKoleksiyonlari(adres) {
  if (!KOLEKSIYON_VAR || !adres) return [];
  const c = await kk();
  const idler = (await c.tasarimcininKoleksiyonlari(adres)).map(Number);
  if (!idler.length) return [];
  const l = await c.koleksiyonlar(idler);
  return idler.map((id, i) => kCoz(id, l[i])).filter((k) => !k.silindi).reverse();
}

/** For design ids: Map id -> {koleksiyon, baslangic (ms, 0 = none)}. */
const _drop = new Map();
export async function dropBilgisi(idler) {
  const out = new Map();
  if (!KOLEKSIYON_VAR || !idler.length) return out;
  const eksik = idler.filter((i) => !_drop.has(Number(i)));
  if (eksik.length) {
    const [ks, bs] = await (await kk()).dropBilgisi(eksik);
    eksik.forEach((id, i) => _drop.set(Number(id), { koleksiyon: Number(ks[i]), baslangic: Number(bs[i]) * 1000 }));
  }
  for (const i of idler) out.set(Number(i), _drop.get(Number(i)));
  return out;
}
export function dropUnut() { _drop.clear(); }

/** Whether the drop of design `id` has not started yet: {koleksiyon, baslangic} or null. */
export async function dropBekliyor(id, simdi = Date.now()) {
  const d = (await dropBilgisi([id]).catch(() => new Map())).get(Number(id));
  return d && d.koleksiyon && d.baslangic > simdi ? d : null;
}

/** "2d 4h 10m 05s" until `ms`. */
export function geriSayim(ms, simdi = Date.now()) {
  let s = Math.max(0, Math.floor((ms - simdi) / 1000));
  const g = Math.floor(s / 86400); s -= g * 86400;
  const sa = Math.floor(s / 3600); s -= sa * 3600;
  const dk = Math.floor(s / 60); s -= dk * 60;
  const iki = (n) => String(n).padStart(2, "0");
  return (g ? g + "d " : "") + (g || sa ? sa + "h " : "") + iki(dk) + "m " + iki(s) + "s";
}

/* ---- calldata ---- */
export const veriK = {
  olustur: (ad, aciklama, kapak, baslangicSaniye, tasarimlar) => ifcK.encodeFunctionData("olustur", [ad, aciklama || "", kapak || "", baslangicSaniye || 0, tasarimlar || []]),
  guncelle: (id, ad, aciklama, kapak, baslangicSaniye) => ifcK.encodeFunctionData("guncelle", [id, ad, aciklama || "", kapak || "", baslangicSaniye || 0]),
  ekle: (id, tasarimlar) => ifcK.encodeFunctionData("ekle", [id, tasarimlar]),
  cikar: (id, tasarimlar) => ifcK.encodeFunctionData("cikar", [id, tasarimlar]),
  sil: (id) => ifcK.encodeFunctionData("sil", [id])
};

/** A KoleksiyonKaydi revert in plain English, or null. */
export function koleksiyonHatasi(e) {
  const d = e && (e.data || (e.info && e.info.error && e.info.error.data) || (e.error && e.error.data));
  const ham = typeof d === "string" ? d : d && typeof d.data === "string" ? d.data : null;
  if (!ham || ham.length < 10) return null;
  let p = null;
  try { p = ifcK.parseError(ham); } catch (x) { return null; }
  if (!p) return null;
  return {
    YetkiYok: "Only the collection's designer can change it.",
    KotuDeger: "The drop start must be in the future and within a year.",
    CokUzun: "Too long: " + ["the name (64 bytes)", "the description (500 bytes)", "the cover link (512 bytes)"][Number(p.args[0])] + " at most; a name is required.",
    KoleksiyonYok: "That collection does not exist or was deleted.",
    TasarimciDegil: "Design #" + p.args[0] + " is not yours: only your own designs can go into your collection.",
    BaskaKoleksiyonda: "Design #" + p.args[0] + " is already in collection #" + p.args[1] + ".",
    BuKoleksiyondaDegil: "Design #" + p.args[0] + " is not in this collection.",
    CokFazla: "At most 50 designs per change and 200 per collection.",
    DropBasladi: "The drop has started; its start time can no longer change."
  }[p.name] || p.name;
}
