/* ===========================================================================
 * davet-hesap.js — referral rewards and leaderboards from public Arc logs
 *
 * One file, two readers: the site (Referrals and Leaderboards pages) and
 * scripts/davet-kok.js, which publishes the reward root on DavetOdemesi.
 * Because both run THIS code over the same chain logs, anyone can recompute
 * the root the admin published and see whether it matches; the Referrals
 * page does that before it offers a claim. No DOM, no network of its own:
 * callers hand it a getLogs function.
 *
 * What counts (everything is an event of a deployed ARC PULSE contract):
 *   buy      MerkezKapi v8/v9 Alindi       wallet = alici, volume = girdi
 *   sell     MerkezKapi v8/v9 Satildi      wallet = alici, volume = cikan
 *   launch   MerkezKapi v8/v9 MerkezLaunch wallet = kurucu, fee from the
 *            same transaction's PulseLaunchpad5 IlkAlim (ucret)
 *   publish  TasarimNFT2 Yayinlandi        wallet = tasarimci, fee = ucret
 *   design   TasarimNFT2 Satildi           wallet = alici (buyer), volume = fiyat
 * Only wallets that are EVM addresses count (a 32-byte recipient whose top
 * 12 bytes are zero); referral links are EVM addresses.
 *
 * THE PLATFORM'S CUT (what a referral share is a share of), in USDC:
 *   trades and USDC design buys: 0.50% of the amount (development fund
 *     0.30% + operations 0.20% of PulseHook5/6's 2.20%); a sale's amount is
 *     what the seller received (slightly under the traded amount, so the
 *     figure errs low);
 *   launches: half of the 2% launch fee (development 30% + operations 20%);
 *   design publishes: the whole publish fee (it goes to the two platform
 *     wallets).
 * A referrer's reward for one activity of a wallet it invited is
 *   floor(platform cut x oranBps / 10,000), oranBps being DavetOdemesi's
 *   rate in force at that block (its OranDegisti events), counted only for
 *   activity in a block AFTER the wallet's binding block.
 * The reward root: leaves (referrer, cumulative amount) in OpenZeppelin's
 * StandardMerkleTree leaf format, pairs hashed sorted (commutative).
 * =========================================================================== */
import { Interface, AbiCoder, keccak256, toUtf8Bytes, getAddress, concat } from "../vendor/ethers.min.js";

/* ---- the switch: set after scripts/davet-dagit.js (dagitim-davet.json) ---- */
export const DAVET = {
  kayit: "0x998de4D2553F4d8Ad7b4D4D5DC2073d240790aEd",   // DavetKaydi (2 Nov 2026)
  odeme: "0x8366B24873f95B6a9e984eA3742fAAeB5eA2AADa",   // DavetOdemesi (15%, 1-day wait)
  kayitBlok: 29167756,
  odemeBlok: 29167765
};

/* the deployed contracts whose events count (deploy blocks found by eth_getCode) */
export const KAYNAKLAR = {
  kapiV8: { adres: "0x1f042E18E1C7899E87cec5CAC5C07c487163BBbF", blok: 28828693 },
  kapiV9: { adres: "0xA64AC16a5469561080bd8657fD852E346Bf8bF49", blok: 29032987 },
  lpV8: { adres: "0x2D3a0DaBD48207528800bDA6aDbC1b84E8d1f98B", blok: 28828687 },
  lpV9: { adres: "0x87045C17BD5fCf3495abC30898803E39E25Be0dD", blok: 29032981 },
  tasarim: { adres: "0xFbE8F98e76bfbD2Acfe80c36d4c475041Fd8FEaa", blok: 29038512 }
};

/* contracts that buy or sell on someone else's behalf (the recipient in their trades is the contract,
   not a person): left out of the trader ranking. LimitEmir: limit orders (dagitim-limit.json). */
export const ARACILAR = new Set(["0x1fef84bd1dd626e0f3e8fcd6a48521d5c6f839dc"]);

export const PLATFORM_PPM = 5_000n;           // 0.50% of a trade
export const LAUNCH_PLATFORM_BPS = 5_000n;    // half of the launch fee
export const VARSAYILAN_ORAN_BPS = 1_500;     // the deploy rate: 15% of the platform's cut
export const ORAN_TAVAN_BPS = 3_000;

export const KAYIT_ABI = [
  "function bagla(address davetci)",
  "function koduylaBagla(string kod)",
  "function kodAl(string kod)",
  "function kodBirak()",
  "function kodCoz(string kod) view returns (address)",
  "function bilgi(address kim) view returns (address davetci, uint64 blok, uint256 davetli, bytes32 kod)",
  "function baglanabilir(address kim, address davetci) view returns (uint8)",
  "function davetciOf(address) view returns (address)",
  "function toplamBaglanti() view returns (uint256)",
  "event Baglandi(address indexed davetli, address indexed davetci, uint64 blok)",
  "event KodAlindi(address indexed sahip, bytes32 indexed kod, string metin)",
  "event KodBirakildi(address indexed sahip, bytes32 indexed kod)"
];
export const ODEME_ABI = [
  "function fonla(uint256 miktar)",
  "function talep(address hesap, uint256 toplamHak, bytes32[] kanit) returns (uint256)",
  "function talepEdilebilir(address hesap, uint256 toplamHak, bytes32[] kanit) view returns (uint256)",
  "function etkinKok() view returns ((bytes32 kok, uint64 sonBlok, uint64 gecerli, uint128 toplam))",
  "function guncel() view returns (bytes32 kok, uint64 sonBlok, uint64 gecerli, uint128 toplam)",
  "function onceki() view returns (bytes32 kok, uint64 sonBlok, uint64 gecerli, uint128 toplam)",
  "function odenen(address) view returns (uint256)",
  "function toplamOdenen() view returns (uint256)",
  "function oranBps() view returns (uint16)",
  "function beklemeSaniye() view returns (uint32)",
  "function borc() view returns (uint256)",
  "function kokSayisi() view returns (uint256)",
  "function yonetici() view returns (address)",
  "function kokYayinla(bytes32 kok, uint64 sonBlok, uint128 toplam, bytes32 veriHash)",
  "event Fonlandi(address indexed kim, uint256 miktar)",
  "event KokYayinlandi(uint256 indexed no, bytes32 kok, uint64 sonBlok, uint128 toplam, uint64 gecerli, bytes32 veriHash)",
  "event KokIptal(uint256 indexed no, bytes32 kok)",
  "event Odendi(address indexed hesap, uint256 miktar, uint256 toplamHak)",
  "event OranDegisti(uint16 eski, uint16 yeni, uint64 blok)"
];
const KAPI_OLAY = new Interface([
  "event MerkezLaunch(address indexed token, address vekil, bytes32 kurucu, uint32 kurucuZincir, uint256 kurucuToken)",
  "event Alindi(address indexed token, uint256 girdi, uint256 alinan, uint32 hedefEid, bytes32 alici)",
  "event Satildi(address indexed token, uint256 miktar, uint256 cikan, uint32 odemeZincir, bytes32 alici)"
]);
const LP_OLAY = new Interface(["event IlkAlim(uint256 indexed id, address kurucu, uint256 odenen, uint256 ucret, uint256 net, uint256 alinanToken)"]);
const TAS_OLAY = new Interface([
  "event Yayinlandi(uint256 indexed id, address indexed tasarimci, address indexed token, bytes32 dosyaHash, bytes32 algiHash, bytes32 anahtarTaahhut, string uri, uint256 ucret, uint256 teminat)",
  "event Satildi(uint256 indexed id, address indexed satici, address indexed alici, uint256 fiyat, address token, uint256 tokenMiktari, uint256 telif, bool usdcIle)"
]);
export const KAYIT_OLAY = new Interface(KAYIT_ABI);
export const ODEME_OLAY = new Interface(ODEME_ABI);

const k = (a) => String(a).toLowerCase();
const sayi = (x) => (typeof x === "number" ? x : x && x.startsWith && x.startsWith("0x") ? parseInt(x, 16) : Number(x));
const blokOf = (l) => sayi(l.blockNumber);
const sirasiOf = (l) => sayi(l.index != null ? l.index : l.logIndex);
const txOf = (l) => k(l.transactionHash);

/** A 32-byte recipient as an EVM address, or null (Solana, Sui, ... keys). */
export function evmAdres(b32) {
  const h = k(b32).replace(/^0x/, "").padStart(64, "0");
  if (!/^0{24}/.test(h)) return null;
  const a = "0x" + h.slice(24);
  return /^0x0{40}$/.test(a) ? null : a;
}

function coz(iface, l) {
  try { return iface.parseLog({ topics: l.topics, data: l.data }); } catch (_) { return null; }
}

/**
 * Every countable activity in `loglar` (raw logs of the KAYNAKLAR contracts, any order).
 * Returns [{ tur, cuzdan, blok, sira, tx, hacim, platform, token?, satici?, tasarimci?, id? }],
 * amounts as BigInt USDC (6 decimals), sorted by block then log index.
 */
export function etkinlikCikar(loglar) {
  const kapi = new Set([k(KAYNAKLAR.kapiV8.adres), k(KAYNAKLAR.kapiV9.adres)]);
  const lp = new Set([k(KAYNAKLAR.lpV8.adres), k(KAYNAKLAR.lpV9.adres)]);
  const tas = k(KAYNAKLAR.tasarim.adres);
  const ucretOfTx = new Map();      // launch tx -> IlkAlim.ucret
  const tasarimciOf = new Map();    // design id -> designer
  for (const l of loglar) {
    const a = k(l.address);
    if (lp.has(a)) { const o = coz(LP_OLAY, l); if (o) ucretOfTx.set(txOf(l), (ucretOfTx.get(txOf(l)) || 0n) + o.args.ucret); }
    else if (a === tas) { const o = coz(TAS_OLAY, l); if (o && o.name === "Yayinlandi") tasarimciOf.set(String(o.args.id), k(o.args.tasarimci)); }
  }
  const out = [];
  for (const l of loglar) {
    const a = k(l.address);
    const taban = { blok: blokOf(l), sira: sirasiOf(l), tx: txOf(l) };
    if (kapi.has(a)) {
      const o = coz(KAPI_OLAY, l);
      if (!o) continue;
      if (o.name === "Alindi") {
        const c = evmAdres(o.args.alici);
        if (c) out.push({ ...taban, tur: "al", cuzdan: c, token: k(o.args.token), hacim: o.args.girdi, platform: (o.args.girdi * PLATFORM_PPM) / 1_000_000n });
      } else if (o.name === "Satildi") {
        const c = evmAdres(o.args.alici);
        if (c) out.push({ ...taban, tur: "sat", cuzdan: c, token: k(o.args.token), hacim: o.args.cikan, platform: (o.args.cikan * PLATFORM_PPM) / 1_000_000n });
      } else if (o.name === "MerkezLaunch") {
        const c = evmAdres(o.args.kurucu);
        const ucret = ucretOfTx.get(taban.tx) || 0n;
        if (c) out.push({ ...taban, tur: "launch", cuzdan: c, token: k(o.args.token), hacim: ucret * 50n, platform: (ucret * LAUNCH_PLATFORM_BPS) / 10_000n });
      }
    } else if (a === tas) {
      const o = coz(TAS_OLAY, l);
      if (!o) continue;
      if (o.name === "Yayinlandi") {
        out.push({ ...taban, tur: "yayin", cuzdan: k(o.args.tasarimci), id: String(o.args.id), hacim: 0n, platform: o.args.ucret });
      } else if (o.name === "Satildi") {
        const id = String(o.args.id);
        out.push({ ...taban, tur: "tasarim", cuzdan: k(o.args.alici), satici: k(o.args.satici), tasarimci: tasarimciOf.get(id) || k(o.args.satici), id,
          hacim: o.args.fiyat, platform: o.args.usdcIle ? (o.args.fiyat * PLATFORM_PPM) / 1_000_000n : 0n });
      }
    }
  }
  return out.sort((x, y) => x.blok - y.blok || x.sira - y.sira);
}

/** DavetKaydi Baglandi logs -> Map(davetli -> { davetci, blok }). First binding wins (the contract allows one). */
export function baglarCikar(loglar) {
  const m = new Map();
  const s = [...loglar].sort((x, y) => blokOf(x) - blokOf(y) || sirasiOf(x) - sirasiOf(y));
  for (const l of s) {
    const o = coz(KAYIT_OLAY, l);
    if (!o || o.name !== "Baglandi") continue;
    const d = k(o.args.davetli);
    if (!m.has(d)) m.set(d, { davetci: k(o.args.davetci), blok: Number(o.args.blok) });
  }
  return m;
}

/** DavetOdemesi OranDegisti logs -> [{ blok, bps }] ascending. */
export function oranlarCikar(loglar) {
  const r = [];
  for (const l of loglar) {
    const o = coz(ODEME_OLAY, l);
    if (o && o.name === "OranDegisti") r.push({ blok: Number(o.args.blok), bps: Number(o.args.yeni), sira: sirasiOf(l) });
  }
  return r.sort((x, y) => x.blok - y.blok || x.sira - y.sira).map(({ blok, bps }) => ({ blok, bps }));
}

function oranAt(oranlar, blok) {
  let b = 0;
  for (const o of oranlar) { if (o.blok <= blok) b = o.bps; else break; }
  return BigInt(b);
}

/**
 * Each referrer's cumulative reward for activity up to `sonBlok`.
 * Returns Map(davetci -> { odul, hacim, platform, davetli: Set, aktif: Set, adet }).
 */
export function odulHesapla({ etkinlikler, baglar, oranlar, sonBlok }) {
  const m = new Map();
  for (const [d, b] of baglar) {
    if (b.blok > sonBlok) continue;
    if (!m.has(b.davetci)) m.set(b.davetci, { odul: 0n, hacim: 0n, platform: 0n, davetli: new Set(), aktif: new Set(), adet: 0 });
    m.get(b.davetci).davetli.add(d);
  }
  for (const e of etkinlikler) {
    if (e.blok > sonBlok) continue;
    const b = baglar.get(e.cuzdan);
    if (!b || e.blok <= b.blok) continue;
    const r = m.get(b.davetci);
    const oran = oranAt(oranlar, e.blok);
    r.odul += (e.platform * oran) / 10_000n;
    r.hacim += e.hacim;
    r.platform += e.platform;
    r.aktif.add(e.cuzdan);
    r.adet++;
  }
  return m;
}

/* ---- the Merkle tree (OpenZeppelin leaf format, sorted-pair hashing) ---- */
const kodla = AbiCoder.defaultAbiCoder();
export function yaprak(hesap, miktar) {
  return keccak256(keccak256(kodla.encode(["address", "uint256"], [hesap, miktar])));
}
const cift = (a, b) => (k(a) < k(b) ? keccak256(concat([a, b])) : keccak256(concat([b, a])));

/**
 * The reward tree from odulHesapla's map (referrers with a zero reward are left out).
 * Returns { kok, toplam, yapraklar: [[adres, miktar(string)]], veriHash, kanit(adres) -> { miktar, kanit } | null }.
 */
export function agacKur(oduller) {
  const yapraklar = [...oduller].filter(([, r]) => r.odul > 0n).map(([a, r]) => [getAddress(a), r.odul])
    .sort((x, y) => (k(x[0]) < k(y[0]) ? -1 : 1));
  const toplam = yapraklar.reduce((s, [, m]) => s + m, 0n);
  const veriHash = keccak256(toUtf8Bytes(JSON.stringify(yapraklar.map(([a, m]) => [k(a), m.toString()]))));
  if (!yapraklar.length) return { kok: null, toplam, yapraklar: [], veriHash, kanit: () => null };
  const hashler = yapraklar.map(([a, m]) => yaprak(a, m));
  const seviyeler = [[...hashler].sort((x, y) => (k(x) < k(y) ? -1 : 1))];
  while (seviyeler[seviyeler.length - 1].length > 1) {
    const s = seviyeler[seviyeler.length - 1], u = [];
    for (let i = 0; i < s.length; i += 2) u.push(i + 1 < s.length ? cift(s[i], s[i + 1]) : s[i]);
    seviyeler.push(u);
  }
  const kok = seviyeler[seviyeler.length - 1][0];
  const kanit = (adres) => {
    const y = yapraklar.find(([a]) => k(a) === k(adres));
    if (!y) return null;
    let h = yaprak(y[0], y[1]);
    const p = [];
    for (let sv = 0; sv < seviyeler.length - 1; sv++) {
      const i = seviyeler[sv].indexOf(h);
      const es = i ^ 1;
      if (es < seviyeler[sv].length) { p.push(seviyeler[sv][es]); h = cift(h, seviyeler[sv][es]); }
    }
    return { miktar: y[1], kanit: p };
  };
  return { kok, toplam, yapraklar: yapraklar.map(([a, m]) => [a, m.toString()]), veriHash, kanit };
}

/** Recompute a root from a proof (the same check the contract makes). */
export function kanitKok(hesap, miktar, kanit) {
  return kanit.reduce((h, s) => cift(h, s), yaprak(hesap, miktar));
}

/* ---- reading ---- */

/** The addresses and first blocks to read: activity sources plus the two referral contracts when set. */
export function okunacaklar(davet = DAVET) {
  const r = Object.values(KAYNAKLAR).map((x) => ({ ...x, tur: "kaynak" }));
  if (/^0x[0-9a-fA-F]{40}$/.test(davet.kayit || "")) r.push({ adres: davet.kayit, blok: davet.kayitBlok, tur: "kayit" });
  if (/^0x[0-9a-fA-F]{40}$/.test(davet.odeme || "")) r.push({ adres: davet.odeme, blok: davet.odemeBlok, tur: "odeme" });
  return r;
}

/**
 * Read every log the computation needs up to `sonBlok` with `getLogs({ address, fromBlock, toBlock })`
 * (YedekliOkur.getLogs in the page; archive + RPC pieces in the script).
 * Returns { kaynak: [...], kayit: [...], odeme: [...] }.
 */
export async function loglariTopla(getLogs, sonBlok, davet = DAVET) {
  const out = { kaynak: [], kayit: [], odeme: [] };
  const liste = okunacaklar(davet);
  const sonuc = await Promise.all(liste.map((x) => (x.blok > sonBlok ? [] : getLogs({ address: x.adres, fromBlock: x.blok, toBlock: sonBlok }))));
  liste.forEach((x, i) => out[x.tur].push(...sonuc[i]));
  return out;
}

/** Everything at once: activities, bindings, rates, rewards and the tree, up to `sonBlok`. */
export function hepsiniHesapla(loglar, sonBlok) {
  const etkinlikler = etkinlikCikar(loglar.kaynak);
  const baglar = baglarCikar(loglar.kayit);
  const oranlar = oranlarCikar(loglar.odeme);
  const oduller = odulHesapla({ etkinlikler, baglar, oranlar, sonBlok });
  return { etkinlikler, baglar, oranlar, oduller, agac: agacKur(oduller) };
}

/* ---- leaderboards (display only) ---- */

/** Points are a display score, not a balance: $1 traded = 1, a launch = 25, a design sold = 10 + $1 of its price,
    a design published = 5, an invited wallet that became active = 15. */
export const PUAN = { dolar: 1, launch: 25, satis: 10, yayin: 5, davet: 15 };
const dolar = (x) => Number(x) / 1e6;

/**
 * Rankings over activities with block >= `enAzBlok` (0 = all time).
 * Returns { tuccar, kurucu, tasarimci, davetci, puan } arrays, each sorted best first.
 */
export function siralamalar(etkinlikler, baglar, enAzBlok = 0) {
  const T = new Map(), K = new Map(), D = new Map(), R = new Map(), P = new Map();
  const al = (m, a, bos) => { if (!m.has(a)) m.set(a, { adres: a, ...bos }); return m.get(a); };
  const puan = (a, p) => { al(P, a, { puan: 0 }).puan += p; };
  for (const e of etkinlikler) {
    if (e.blok < enAzBlok) continue;
    if (e.tur === "al" || e.tur === "sat") {
      const t = al(T, e.cuzdan, { hacim: 0, islem: 0, alim: 0, satim: 0 });
      t.hacim += dolar(e.hacim); t.islem++; e.tur === "al" ? t.alim++ : t.satim++;
      puan(e.cuzdan, dolar(e.hacim) * PUAN.dolar);
    } else if (e.tur === "launch") {
      const x = al(K, e.cuzdan, { launch: 0, ucret: 0 });
      x.launch++; x.ucret += dolar(e.platform) * 2;
      puan(e.cuzdan, PUAN.launch);
    } else if (e.tur === "tasarim") {
      const x = al(D, e.tasarimci, { satis: 0, hacim: 0, yayin: 0 });
      x.satis++; x.hacim += dolar(e.hacim);
      puan(e.tasarimci, PUAN.satis + dolar(e.hacim) * PUAN.dolar);
    } else if (e.tur === "yayin") {
      al(D, e.cuzdan, { satis: 0, hacim: 0, yayin: 0 }).yayin++;
      puan(e.cuzdan, PUAN.yayin);
    }
    const b = baglar.get(e.cuzdan);
    if (b && e.blok > b.blok) {
      const r = al(R, b.davetci, { davetli: new Set(), aktif: new Set(), hacim: 0 });
      if (!r.aktif.has(e.cuzdan)) puan(b.davetci, PUAN.davet);
      r.aktif.add(e.cuzdan); r.hacim += dolar(e.hacim);
    }
  }
  for (const [d, b] of baglar) if (b.blok >= enAzBlok) al(R, b.davetci, { davetli: new Set(), aktif: new Set(), hacim: 0 }).davetli.add(d);
  const r = [...R.values()].map((x) => ({ adres: x.adres, davetli: x.davetli.size, aktif: x.aktif.size, hacim: x.hacim }));
  return {
    tuccar: [...T.values()].filter((x) => !ARACILAR.has(x.adres)).sort((a, b) => b.hacim - a.hacim || b.islem - a.islem),
    kurucu: [...K.values()].sort((a, b) => b.launch - a.launch || b.ucret - a.ucret),
    tasarimci: [...D.values()].filter((x) => x.satis > 0).sort((a, b) => b.hacim - a.hacim || b.satis - a.satis),
    davetci: r.sort((a, b) => b.aktif - a.aktif || b.davetli - a.davetli || b.hacim - a.hacim),
    puan: [...P.values()].filter((x) => !ARACILAR.has(x.adres)).sort((a, b) => b.puan - a.puan)
  };
}

/* ---- invite links ---- */

export const SITE_URL = "https://arcpulse.app/arc-launchpad/docs/app.html";
export const KOD_DESENI = /^[a-z0-9](?:[a-z0-9-]{1,14})[a-z0-9]$/;
export function kodGecerli(kod) { return typeof kod === "string" && KOD_DESENI.test(kod); }
export function davetLinki(adresVeyaKod, sayfa = "") { return SITE_URL + "?ref=" + encodeURIComponent(adresVeyaKod) + (sayfa ? "#/" + sayfa : ""); }
/** bytes32 code (left-aligned) -> text */
export function kodMetni(b32) {
  const h = k(b32).replace(/^0x/, "");
  let s = "";
  for (let i = 0; i < 64; i += 2) { const c = parseInt(h.slice(i, i + 2), 16); if (!c) break; s += String.fromCharCode(c); }
  return s;
}

/* ---- calldata the pages send (the audit script sends exactly these) ---- */
const IK = new Interface(KAYIT_ABI), IO = new Interface(ODEME_ABI);
export const veri = {
  bagla: (davetci) => IK.encodeFunctionData("bagla", [davetci]),
  koduylaBagla: (kod) => IK.encodeFunctionData("koduylaBagla", [kod]),
  kodAl: (kod) => IK.encodeFunctionData("kodAl", [kod]),
  kodBirak: () => IK.encodeFunctionData("kodBirak", []),
  talep: (hesap, toplamHak, kanit) => IO.encodeFunctionData("talep", [hesap, toplamHak, kanit]),
  fonla: (miktar) => IO.encodeFunctionData("fonla", [miktar])
};
