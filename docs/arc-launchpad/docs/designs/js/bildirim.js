/* ===========================================================================
 * designs/js/bildirim.js — the notifications bell (no server)
 *
 * For the connected wallet, computed in this browser from public Arc events
 * since the last visit: a new follower and a like on one of my designs
 * (ProfilKaydi), a comment on my design (YorumKaydi, once deployed), my
 * design sold and its file key still to deliver / a key delivered to me
 * (TasarimNFT2), an offer on my design or a bid in my auction (TasarimPazar3),
 * and new messages (MesajKutusu; and the private box MesajKutusu2 once it is
 * set). "My designs" are the ones the wallet designed, holds now, or has
 * listed or put up for auction on the market (the market holds those).
 * Private box: no recipient is on chain, so the bell can only find the
 * wallet's private messages with its unlock key (view tag + decryption,
 * mesaj2.js). It does that once the key is in memory (after "Unlock" in the
 * inbox, one signature per page load), from the block it started at.
 * Deleted, disappeared and locally blocked/hidden messages are not counted.
 * The last block seen is kept in this browser's localStorage per wallet
 * (okundu.js, convenience only); without it the bell shows the last few
 * hours. Nothing is sent anywhere: these are the same public reads every
 * page makes. While the tab is open it looks again every minute (only while
 * visible) and, if the visitor switched it on (the browser asks for
 * permission on that click only), shows a browser notification.
 * =========================================================================== */
import { el, temizle, S, SO, usd, esit, isim } from "./ortak.js";
import { zeroPadValue } from "../../vendor/ethers.min.js";
import * as O from "./okundu.js";
import * as Y from "./yorum.js";
import * as P3 from "../../js/designs/pazar3.js";

export const ILK_GERI = 20_000;     // blocks shown on a first visit (~3 hours of Arc)
export const AZAMI_GERI = 100_000;  // never scan further back than this (~15 hours)
export const YOKLAMA = 60_000;      // look again every minute while visible

const konu = (a) => zeroPadValue(a, 32);
const ad = (n) => n.toLowerCase();

/* the designs `ben` designed or holds (owners read once per 5 minutes: the per-minute look stays light) */
let _benim = null;
async function benimkiler(ben) {
  if (_benim && esit(_benim.ben, ben) && Date.now() - _benim.zaman < 300_000) return _benim.set;
  const liste = await S.yayinlar().catch(() => []);
  const tasarladigim = liste.filter((t) => esit(t.tasarimci, ben)).map((t) => t.id);
  const tuttugum = (await S.durumlar(liste.slice(0, 300).map((t) => t.id)).catch(() => [])).filter((d) => esit(d.sahip, ben)).map((d) => d.id);
  /* listed or in auction: the market holds the NFT, the seller is still the one to tell */
  const acik = P3.PAZAR3_VAR ? await P3.acikIlanlar().catch(() => ({ ilanlar: [], muzayedeler: [] })) : { ilanlar: [], muzayedeler: [] };
  const pazarda = [...acik.ilanlar, ...acik.muzayedeler].filter((x) => esit(x.satici, ben)).map((x) => x.id);
  _benim = { ben, zaman: Date.now(), set: new Set([...tasarladigim, ...tuttugum, ...pazarda]), pazarda: new Set(pazarda) };
  return _benim.set;
}

/** Notifications for `ben` in blocks (bas, son]; each {anahtar, tur, blok, parcalar, href}.
 *  `ozel`: { bas, sk } to also look for private-box messages in (ozel.bas, son] with unlock key sk. */
export async function tara(ben, bas, son, ozel) {
  const p = await S.arc();
  const out = [];
  const ekle = (o) => out.push(o);
  const benim = await benimkiler(ben);
  const isler = [];

  /* follows and likes: one query (Takip to me, Begeni on TasarimNFT2) */
  if (SO.PROFIL_VAR) isler.push((async () => {
    const T = SO.ifcP.getEvent("Takip").topicHash, B = SO.ifcP.getEvent("Begeni").topicHash;
    const l = await p.getLogs({ address: SO.SOSYAL.profil, topics: [[T, B], null, [konu(ben), konu(S.TASARIM.adres)]], fromBlock: Math.max(bas + 1, SO.SOSYAL.baslangicBloku), toBlock: son });
    for (const x of l) {
      const e = SO.ifcP.parseLog(x);
      if (e.name === "Takip" && e.args.takipte && esit(e.args.hedef, ben) && !esit(e.args.takipci, ben))
        ekle({ anahtar: "takip:" + ad(e.args.takipci) + ":" + x.blockNumber, tur: "takip", blok: x.blockNumber, kim: e.args.takipci, parcalar: [isim(e.args.takipci), " followed you"], href: "#/u/" + e.args.takipci });
      if (e.name === "Begeni" && e.args.begendi && benim.has(Number(e.args.id)) && !esit(e.args.cuzdan, ben))
        ekle({ anahtar: "begeni:" + ad(e.args.cuzdan) + ":" + e.args.id, tur: "begeni", blok: x.blockNumber, kim: e.args.cuzdan, parcalar: [isim(e.args.cuzdan), " liked design #" + e.args.id], href: "#/d/" + e.args.id });
    }
  })());

  /* comments on my designs */
  if (Y.YORUM_VAR && benim.size) isler.push((async () => {
    for (const c of await Y.yeniYorumlar([...benim], bas)) {
      if (c.blok > son || esit(c.yazar, ben)) continue;
      ekle({ anahtar: "yorum:" + c.yorumId, tur: "yorum", blok: c.blok, kim: c.yazar, parcalar: [isim(c.yazar), " commented on design #" + c.id + ": “" + c.metin.slice(0, 80) + (c.metin.length > 80 ? "…" : "") + "”"], href: "#/d/" + c.id });
    }
  })());

  /* sales (me the seller) and key deliveries (me the buyer): one query */
  if (S.SURUM === 2) isler.push((async () => {
    const SA = S.ifc.getEvent("Satildi").topicHash, TE = S.ifc.getEvent("TeslimEdildi").topicHash;
    const l = await p.getLogs({ address: S.TASARIM.adres, topics: [[SA, TE], null, konu(ben)], fromBlock: Math.max(bas + 1, S.TASARIM.baslangicBloku), toBlock: son });
    for (const x of l) {
      const e = S.ifc.parseLog(x);
      const id = Number(e.args.id);
      if (e.name === "Satildi" && esit(e.args.satici, ben)) {
        ekle({ anahtar: "satis:" + id + ":" + x.blockNumber, tur: "satis", blok: x.blockNumber, kim: e.args.alici, parcalar: ["Design #" + id + " sold to ", isim(e.args.alici), " for " + usd(e.args.fiyat)], href: "#/d/" + id });
        const s = await S.satisOku(id).catch(() => null);
        if (s && s.durum === 1 && esit(s.satici, ben))
          ekle({ anahtar: "teslim:" + id + ":" + x.blockNumber, tur: "teslim", blok: x.blockNumber, onemli: true, parcalar: ["Deliver the file key for design #" + id + " (the buyer's payment waits for it)"], href: "#/d/" + id });
      }
      if (e.name === "TeslimEdildi" && esit(e.args.alici, ben))
        ekle({ anahtar: "teslimedildi:" + id + ":" + x.blockNumber, tur: "teslimedildi", blok: x.blockNumber, parcalar: ["The file key for design #" + id + " was delivered to you: open the file"], href: "#/d/" + id });
    }
  })());

  /* offers on my designs and bids in my auctions (TasarimPazar3) */
  if (P3.PAZAR3_VAR && benim.size) isler.push((async () => {
    const TV = P3.ifc.getEvent("TeklifVerildi").topicHash, PE = P3.ifc.getEvent("Pey").topicHash;
    const l = await p.getLogs({ address: P3.PAZAR3.adres, topics: [[TV, PE]], fromBlock: Math.max(bas + 1, P3.PAZAR3.baslangicBloku), toBlock: son });
    for (const x of l) {
      const e = P3.ifc.parseLog(x);
      const id = Number(e.args.id);
      if (!benim.has(id) || esit(e.args.alici, ben)) continue;
      if (e.name === "TeklifVerildi")
        ekle({ anahtar: "teklif:" + e.args.teklifId, tur: "teklif", blok: x.blockNumber, kim: e.args.alici, parcalar: [isim(e.args.alici), " offered " + usd(e.args.miktar) + " for design #" + id], href: "#/d/" + id });
      else if (_benim && _benim.pazarda.has(id))
        ekle({ anahtar: "pey:" + id + ":" + x.blockNumber + ":" + ad(e.args.alici), tur: "pey", blok: x.blockNumber, kim: e.args.alici, parcalar: [isim(e.args.alici), " bid " + usd(e.args.miktar) + " in your auction for design #" + id], href: "#/d/" + id });
    }
  })());

  /* messages to me, one line per sender (a wallet blocked in this browser is left out once the private box is on) */
  if (SO.MESAJ_VAR) isler.push((async () => {
    const engel = SO.MESAJ2_VAR ? O.engelliler(ben) : new Set();
    const gelen = (await SO.mesajlar(ben, bas)).filter((m) => m.blok <= son && !esit(m.gonderen, ben) && !engel.has(ad(m.gonderen)));
    const g = new Map();
    for (const m of gelen) { const k = ad(m.gonderen); if (!g.has(k)) g.set(k, { kim: m.gonderen, n: 0, blok: 0 }); const o = g.get(k); o.n++; o.blok = Math.max(o.blok, m.blok); }
    for (const o of g.values()) ekle({ anahtar: "mesaj:" + ad(o.kim) + ":" + o.blok, tur: "mesaj", blok: o.blok, kim: o.kim, parcalar: [o.n > 1 ? o.n + " new messages from " : "New message from ", isim(o.kim)], href: "#/messages/" + o.kim });
  })());

  /* private box: every message in the range, mine found by view tag (needs the unlock key) */
  if (SO.MESAJ2_VAR && ozel && ozel.sk) isler.push((async () => {
    const M2 = await import("./mesaj2.js");
    const [olaylar, silinen] = await Promise.all([SO.mesajlar2(ozel.bas, son), SO.silinenler2().catch(() => new Set())]);
    const F = { ben, silinen, gizli: O.gizlenenler(ben), engel: O.engelliler(ben) };
    const gelen = (await M2.tara(olaylar, { sk: ozel.sk, ben })).filter((m) => !esit(m.gonderen, ben) && M2.gorunurMu(m, F));
    const g = new Map();
    for (const m of gelen) { const k = ad(m.gonderen); if (!g.has(k)) g.set(k, { kim: m.gonderen, n: 0, blok: 0 }); const o = g.get(k); o.n++; o.blok = Math.max(o.blok, m.blok); }
    for (const o of g.values()) ekle({ anahtar: "mesaj2:" + ad(o.kim) + ":" + o.blok, tur: "mesaj", blok: o.blok, kim: o.kim, parcalar: [o.n > 1 ? o.n + " new private messages from " : "New private message from ", isim(o.kim)], href: "#/messages/" + o.kim });
  })());

  const sonuc = await Promise.allSettled(isler);
  const hata = sonuc.filter((r) => r.status === "rejected").length;
  return { ogeler: out.sort((a, b) => b.blok - a.blok), hata };
}

/* ================================================================== bell */
const IKON_ZIL = '<path d="M12 3a6 6 0 0 1 6 6v3.5l1.6 3a1 1 0 0 1-.9 1.5H5.3a1 1 0 0 1-.9-1.5l1.6-3V9a6 6 0 0 1 6-6z"/><path d="M9.8 20a2.4 2.4 0 0 0 4.4 0"/>';

let _zil = null;
/** Mounts (or re-mounts for another wallet) the bell before the top bar's wallet button. */
export function zilKur(cuzdan) {
  if (_zil) { _zil.dur(); _zil.kap.remove(); _zil = null; }
  const ben = cuzdan.hesap();
  const yer = document.getElementById("dz-cuzdan");
  if (!ben || !yer) return null;
  const sayi = el("span", { sinif: "dz-zil__sayi", attr: { hidden: "" } });
  const dugme = el("button", { sinif: "dz-zil", attr: { type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-label": "Notifications" } }, [
    el("span", { sinif: "dz-ikon", attr: { "aria-hidden": "true" }, html: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + IKON_ZIL + "</svg>" }), sayi]);
  const liste = el("div", { sinif: "dz-zil__liste" });
  const izin = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" } });
  const panel = el("div", { sinif: "dz-zil__panel", attr: { role: "dialog", "aria-label": "Notifications", hidden: "" } }, [
    el("div", { sinif: "dz-zil__ust" }, [el("b", { yazi: "Notifications" }), izin]),
    liste,
    el("p", { sinif: "ds-cihaz dz-zil__not", yazi: "Read from public Arc events in this browser; nothing is sent or stored by ARC PULSE. The last one seen is remembered on this device only." + (SO.MESAJ2_VAR ? " Private messages show here after you unlock your inbox on this page." : "") })]);
  const kap = el("div", { sinif: "dz-zil-kap" }, [dugme, panel]);
  yer.parentNode.insertBefore(kap, yer);

  let ogeler = [], gorulen = O.bildirimGoruldu(ben), taranan = null, ilk = true, calisiyor = false;
  let ozelTaranan = null;   // private box: the block it has been scanned up to with the unlock key
  const izinYaz = () => {
    const destek = typeof Notification !== "undefined";
    const acik = destek && Notification.permission === "granted" && O.bildirimIzni(ben);
    izin.hidden = !destek;
    izin.textContent = acik ? "Browser alerts: on" : "Browser alerts: off";
    izin.setAttribute("aria-pressed", String(!!acik));
  };
  izin.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (typeof Notification === "undefined") return;
    if (O.bildirimIzni(ben) && Notification.permission === "granted") { O.bildirimIzniYaz(ben, false); izinYaz(); return; }
    const r = Notification.permission === "granted" ? "granted" : await Notification.requestPermission().catch(() => "denied");
    O.bildirimIzniYaz(ben, r === "granted");
    izinYaz();
  });
  const rozet = () => {
    const yeni = ogeler.filter((o) => gorulen == null || o.blok > gorulen).length;
    sayi.hidden = !yeni;
    sayi.textContent = yeni > 99 ? "99+" : String(yeni);
    dugme.setAttribute("aria-label", yeni ? "Notifications, " + yeni + " new" : "Notifications");
  };
  const ciz = () => {
    rozet();
    temizle(liste);
    if (!ogeler.length) { liste.append(el("div", { sinif: "ds-cihaz dz-zil__bos", yazi: taranan == null ? "Reading Arc…" : "Nothing new since your last visit." })); return; }
    for (const o of ogeler.slice(0, 60)) liste.append(el("a", { sinif: "dz-zil__oge dz-zil__oge--" + o.tur + (gorulen == null || o.blok > gorulen ? " dz-zil__oge--yeni" : ""), attr: { href: o.href, "data-tur": o.tur } }, [
      el("span", { sinif: "dz-zil__metin" }, o.parcalar),
      el("span", { sinif: "ds-cihaz", yazi: "block " + o.blok })]));
  };
  const ac = (acik) => {
    panel.hidden = !acik;
    dugme.setAttribute("aria-expanded", String(acik));
    /* opening marks everything scanned so far as seen (the list keeps showing what was new until it closes) */
    if (acik && taranan != null) { gorulen = taranan; O.bildirimGorulduYaz(ben, taranan); rozet(); }
    if (!acik) ciz();
  };
  dugme.addEventListener("click", (e) => { e.stopPropagation(); const acilacak = panel.hidden; if (acilacak) ciz(); ac(acilacak); });
  panel.addEventListener("click", (e) => { if (e.target.closest("a")) ac(false); else e.stopPropagation(); });
  const disari = () => { if (!panel.hidden) ac(false); };
  document.addEventListener("click", disari);
  const esc = (e) => { if (e.key === "Escape" && !panel.hidden) { ac(false); dugme.focus(); } };
  document.addEventListener("keydown", esc);

  let tekrar = false;   // asked again while a look was running (e.g. the key just arrived)
  const tur = async () => {
    if (calisiyor) { tekrar = true; return; }
    if (!ilk && document.visibilityState !== "visible") return;
    calisiyor = true;
    try {
      const son = await (await S.arc()).getBlockNumber();
      let bas = taranan != null ? taranan : gorulen != null ? gorulen : son - ILK_GERI;
      bas = Math.max(bas, son - AZAMI_GERI);
      /* the private box from where the bell started, as soon as the unlock key is in memory */
      const sk = SO.MESAJ2_VAR ? (await import("../../js/designs/sifre.js")).bellektekiAnahtar(ben) : null;
      if (_ilkBas == null) _ilkBas = bas;
      const ozel = sk ? { sk, bas: Math.max(ozelTaranan != null ? ozelTaranan : _ilkBas, son - AZAMI_GERI) } : null;
      if (son <= bas && !(ozel && son > ozel.bas)) return;
      const { ogeler: y } = await tara(ben, Math.min(bas, son), son, ozel);
      if (ozel) ozelTaranan = son;
      const var_ = new Set(ogeler.map((o) => o.anahtar));
      const taze = y.filter((o) => !var_.has(o.anahtar));
      ogeler = [...taze, ...ogeler].sort((a, b) => b.blok - a.blok).slice(0, 200);
      taranan = son;
      if (!ilk && taze.length) tarayiciBildirimi(ben, taze);
      ciz();
    } catch (e) { /* the next round tries again */ }
    finally { calisiyor = false; ilk = false; if (tekrar) { tekrar = false; setTimeout(tur, 0); } }
  };
  let _ilkBas = null;
  izinYaz(); ciz();
  tur();
  /* the inbox derived the unlock key: look for private messages now */
  const anahtarda = () => tur();
  window.addEventListener("dz-anahtar", anahtarda);
  const z = setInterval(tur, YOKLAMA);
  const gorunur = () => { if (document.visibilityState === "visible") tur(); };
  document.addEventListener("visibilitychange", gorunur);
  _zil = { kap, tur, dur: () => { clearInterval(z); document.removeEventListener("visibilitychange", gorunur); document.removeEventListener("click", disari); document.removeEventListener("keydown", esc); window.removeEventListener("dz-anahtar", anahtarda); } };
  return _zil;
}

function tarayiciBildirimi(ben, taze) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted" || !O.bildirimIzni(ben)) return;
    const metin = (o) => o.parcalar.map((x) => (typeof x === "string" ? x : x.textContent || "")).join("");
    const n = new Notification("ARC PULSE Designs", { body: taze.length === 1 ? metin(taze[0]) : taze.length + " new: " + metin(taze[0]), tag: "dz-bildirim", silent: false });
    n.onclick = () => { window.focus(); location.hash = taze[0].href; n.close(); };
  } catch (e) { /* notifications are optional */ }
}
