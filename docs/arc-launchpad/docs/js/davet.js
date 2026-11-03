/* ===========================================================================
 * davet.js — invite links: catch ?ref=, offer the one-time on-chain link
 *
 * A link like app.html?ref=0xABC… or ?ref=alice (a code taken on
 * DavetKaydi) opens the app normally. The invite is remembered in THIS
 * browser only (localStorage, first link wins, the visitor can dismiss it)
 * until the visitor connects a wallet; then a small bar offers to write the
 * link on Arc (DavetKaydi.bagla / koduylaBagla: one transaction, gas only,
 * once per wallet, forever). Nothing is sent anywhere else and nothing about
 * the visitor is stored by ARC PULSE: the link is public chain data the
 * visitor's own wallet writes, or nothing.
 *
 *   davetYakala()            call once at boot (ana.js, Designs)
 *   bekleyenDavet()          { ref } remembered in this browser, or null
 *   baglantiDurumu(ben)      { davetci, blok, davetli, kod } from DavetKaydi
 *   baglaGonder(cuzdan, ref, durum)
 *   arcOkur()                the shared read-only Arc provider
 * =========================================================================== */
import { el } from "./ui.js";
import { DAVET, KAYIT_ABI, veri, kodGecerli, kodMetni } from "./davet-hesap.js";
import { YedekliOkur } from "./yedekli-okur.js";
import { Contract } from "../vendor/ethers.min.js";

const ANAHTAR = "arcpulse-davet";
const KAPATILDI = "arcpulse-davet-kapali";
const ADRES = /^0x[0-9a-fA-F]{40}$/;
const depo = {
  al(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  yaz(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* storage blocked: the invite lives only for this page */ } },
  sil(k) { try { localStorage.removeItem(k); } catch (_) { /* */ } }
};
let _bellek = null;
let _okur = null;
export const arcOkur = () => (_okur ||= new YedekliOkur());
export const davetCanli = () => ADRES.test(DAVET.kayit || "");

/** The ?ref= value in the address (search or hash query), lower-cased, if valid. */
function refOku() {
  const q = new URLSearchParams(location.search);
  let r = q.get("ref");
  if (!r) {
    const h = (location.hash || "").split("?")[1];
    if (h) r = new URLSearchParams(h).get("ref");
  }
  if (!r) return null;
  r = r.trim();
  if (ADRES.test(r)) return r.toLowerCase();
  r = r.toLowerCase();
  return kodGecerli(r) ? r : null;
}

export function bekleyenDavet() {
  const v = _bellek || depo.al(ANAHTAR);
  return v ? { ref: v } : null;
}
export function davetiUnut() { _bellek = null; depo.sil(ANAHTAR); }

/** Catch an invite in the URL (first touch: an invite already remembered stays). */
export function davetYakala({ cuzdan } = {}) {
  const r = refOku();
  if (r && !bekleyenDavet()) { _bellek = r; depo.yaz(ANAHTAR, r); depo.sil(KAPATILDI); }
  if (cuzdan && davetCanli()) {
    const dene = () => { cubukGoster(cuzdan).catch(() => { /* a read failed: no bar, nothing lost */ }); };
    if (typeof cuzdan.dinle === "function") cuzdan.dinle(dene);
    setTimeout(dene, 1500);
  }
}

/** DavetKaydi.bilgi(ben) */
export async function baglantiDurumu(ben) {
  const c = new Contract(DAVET.kayit, KAYIT_ABI, arcOkur());
  const [davetci, blok, davetli, kod] = await c.bilgi(ben);
  return { davetci: /^0x0{40}$/i.test(davetci) ? null : davetci, blok: Number(blok), davetli: Number(davetli), kod: /^0x0{64}$/i.test(kod) ? "" : kodMetni(kod) };
}

/** An address or code -> the referrer's address (null when a code is free). */
export async function refCoz(ref) {
  if (ADRES.test(ref)) return ref;
  const a = await new Contract(DAVET.kayit, KAYIT_ABI, arcOkur()).kodCoz(ref);
  return /^0x0{40}$/i.test(a) ? null : a;
}

async function arcAg() {
  const { AGLAR } = await import("./aglar.js");
  return AGLAR.find((a) => a.anahtar === "arc");
}

/** Send one Arc transaction from the visitor's wallet and wait for it. */
export async function arcGonder(cuzdan, to, data, durum = () => {}) {
  durum("Confirm in your wallet (on Arc, a fraction of a cent of gas)…");
  const h = await cuzdan.agdaGonder(await arcAg(), { to, data, value: "0x0" });
  durum("Sent. Waiting for Arc to confirm…");
  const p = arcOkur();
  for (let i = 0; i < 60; i++) {
    const r = await p.getTransactionReceipt(h).catch(() => null);
    if (r) { if (r.status !== 1) throw new Error("The transaction reverted on Arc."); _veri = null; return h; }
    await new Promise((x) => setTimeout(x, 1500));
  }
  return h;
}

/** Write the invite on Arc: bagla(address) or koduylaBagla(code). Refuses self-referral before the wallet opens. */
export async function baglaGonder(cuzdan, ref, durum = () => {}) {
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  const davetci = await refCoz(ref);
  if (!davetci) throw new Error("The invite code '" + ref + "' is not registered (any more).");
  if (davetci.toLowerCase() === ben.toLowerCase()) throw new Error("This is your own invite link: a wallet cannot invite itself.");
  const d = await baglantiDurumu(ben);
  if (d.davetci) throw new Error("This wallet is already linked to " + d.davetci.slice(0, 8) + "…" + d.davetci.slice(-6) + ". A link is set once and cannot change.");
  const h = await arcGonder(cuzdan, DAVET.kayit, ADRES.test(ref) ? veri.bagla(ref) : veri.koduylaBagla(ref), durum);
  davetiUnut();
  return h;
}

/* ---- the bar ---- */
async function cubukGoster(cuzdan) {
  const eski = document.querySelector(".davet-cubuk");
  const b = bekleyenDavet();
  const ben = cuzdan.hesap();
  if (!b || !ben || depo.al(KAPATILDI) === b.ref) { if (eski) eski.remove(); return; }
  const davetci = await refCoz(b.ref).catch(() => null);
  if (!davetci || davetci.toLowerCase() === ben.toLowerCase()) { if (eski) eski.remove(); return; }
  const d = await baglantiDurumu(ben);
  if (d.davetci) { davetiUnut(); if (eski) eski.remove(); return; }
  if (eski) return;
  const durum = el("span", { sinif: "yazi--kucuk yazi--sessiz" });
  const kim = ADRES.test(b.ref) ? b.ref.slice(0, 6) + "…" + b.ref.slice(-4) : "'" + b.ref + "' (" + davetci.slice(0, 6) + "…" + davetci.slice(-4) + ")";
  const cubuk = el("div", { sinif: "davet-cubuk kart", attr: { role: "status" } }, [
    el("span", { yazi: "You were invited by " + kim + ". Link your wallet to them on Arc: one transaction, gas only, set once. It costs you nothing more on any trade." }),
    el("button", { sinif: "dugme dugme--marka dugme--kucuk", yazi: "Link invite", attr: { type: "button" }, on: { click: async (ev) => {
      ev.currentTarget.disabled = true;
      try { await baglaGonder(cuzdan, b.ref, (s) => { durum.textContent = s; }); durum.textContent = "Linked."; setTimeout(() => cubuk.remove(), 2500); }
      catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || String(e); ev.currentTarget.disabled = false; }
    } } }),
    el("button", { sinif: "dugme dugme--sade dugme--kucuk", yazi: "Not now", attr: { type: "button" }, on: { click: () => { depo.yaz(KAPATILDI, b.ref); cubuk.remove(); } } }),
    durum
  ]);
  document.body.append(cubuk);
}

/* ---- the chain data both pages use (read once per minute per page load) ---- */
let _veri = null, _veriZaman = 0;
/** { sonBlok, sonZaman, loglar, ...hepsiniHesapla } up to the head, archive first (yedekli-okur.js). */
export async function zincirVerisi() {
  if (_veri && Date.now() - _veriZaman < 60_000) return _veri;
  _veriZaman = Date.now();
  _veri = (async () => {
    const H = await import("./davet-hesap.js");
    const p = arcOkur();
    const b = await p.getBlock("latest");
    const loglar = await H.loglariTopla((f) => p.getLogs(f), b.number);
    return { sonBlok: b.number, sonZaman: b.timestamp, loglar, ...H.hepsiniHesapla(loglar, b.number) };
  })();
  _veri.catch(() => { _veri = null; });
  return _veri;
}

/** The first block at or after `saniye` seconds ago (Arc's average block time, refined once). */
export async function blokEsigi(saniye, sonBlok, sonZaman) {
  const p = arcOkur();
  const ornek = Math.max(0, sonBlok - 200_000);
  const o = await p.getBlock(ornek);
  const ort = (sonZaman - o.timestamp) / Math.max(1, sonBlok - ornek);
  let tahmin = Math.max(0, Math.round(sonBlok - saniye / ort));
  const t = await p.getBlock(tahmin);
  tahmin = Math.max(0, Math.round(tahmin + ((sonZaman - saniye) - t.timestamp) / ort));
  return tahmin;
}
