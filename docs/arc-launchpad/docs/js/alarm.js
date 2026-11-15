/* ===========================================================================
 * alarm.js — Pulse alerts: watched in this browser, stored in this browser only
 *
 * 15 Nov 2026 (owner approved, step 3 after the Time Machine and the legal pages).
 * The visitor sets alerts on #/perps/alerts (gorunum/hl-alarm.js); this module keeps them in
 * localStorage and checks them every 30 s while ARC PULSE is open in any tab (a background tab is
 * fine; browsers may slow it to once a minute). There is no server: nothing about the alerts, the
 * wallet or the visitor leaves the browser, and alerts do not fire while the site is closed.
 * Kinds:
 *   fiyat   a Hyperliquid market's price goes above / below a level
 *   fon     a market's hourly funding goes above / below a rate
 *   hedef   Target Radar lists a new market (optionally of one condition type)
 *   olay    a high-impact US economic event is N minutes away
 *   likit   one of your open Hyperliquid positions gets within N% of its liquidation price
 * A fired alert shows a browser notification (when allowed) and an on-page banner; price, funding and
 * liquidation alerts then switch off (one-shot) unless set to repeat (at most once an hour).
 * =========================================================================== */

const ANAHTAR = "arcpulse-alarm-v1";
const API = "https://api.hyperliquid.xyz/info";
const DINLEYICI = new Set();

export function alarmlar() { try { return JSON.parse(localStorage.getItem(ANAHTAR) || "[]"); } catch (e) { return []; } }
function yaz(l) { try { localStorage.setItem(ANAHTAR, JSON.stringify(l)); } catch (e) { /* storage blocked */ } DINLEYICI.forEach((f) => f(l)); }
export function ekle(a) { const l = alarmlar(); l.push({ ...a, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), olustu: Date.now(), aktif: true }); yaz(l); kur(); }
export function sil(id) { yaz(alarmlar().filter((x) => x.id !== id)); }
export function degistir(id, d) { yaz(alarmlar().map((x) => (x.id === id ? { ...x, ...d } : x))); kur(); }
export function dinle(f) { DINLEYICI.add(f); return () => DINLEYICI.delete(f); }

const bilgi = (govde) => fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde), signal: AbortSignal.timeout(15000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const dosya = (ad) => fetch(new URL("../veri/" + ad, import.meta.url).href + "?t=" + Math.floor(Date.now() / 300000)).then((r) => (r.ok ? r.json() : null)).catch(() => null);

export async function bildirimIzni() {
  if (!("Notification" in window)) return "yok";
  if (Notification.permission === "default") { try { return await Notification.requestPermission(); } catch (e) { return Notification.permission; } }
  return Notification.permission;
}

function afis(baslik, metin, link) {
  let kap = document.getElementById("alarm-afis");
  if (!kap) {
    kap = document.createElement("div"); kap.id = "alarm-afis";
    kap.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9999;display:grid;gap:8px;max-width:min(360px,calc(100vw - 32px))";
    document.body.append(kap);
  }
  const k = document.createElement("div");
  k.setAttribute("role", "alert");
  k.style.cssText = "background:var(--yuzey-2,#1a1d29);border:1px solid var(--marka,#7c5cff);border-radius:14px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.45);font-size:14px;line-height:1.45;color:var(--yazi-1,#fff)";
  const b = document.createElement("b"); b.textContent = "🔔 " + baslik;
  const m = document.createElement("div"); m.textContent = metin; m.style.cssText = "color:var(--yazi-2,#cfd3e6);margin-top:2px";
  const sat = document.createElement("div"); sat.style.cssText = "display:flex;gap:10px;margin-top:8px;font-size:13px";
  if (link) { const a = document.createElement("a"); a.href = link; a.textContent = "Open"; a.style.color = "var(--marka,#9b87ff)"; sat.append(a); }
  const kapat = document.createElement("button"); kapat.type = "button"; kapat.textContent = "Dismiss"; kapat.style.cssText = "background:none;border:0;color:var(--yazi-3,#9aa);cursor:pointer;padding:0";
  kapat.addEventListener("click", () => k.remove()); sat.append(kapat);
  k.append(b, m, sat); kap.append(k);
  setTimeout(() => k.remove(), 60000);
}

function ates(a, baslik, metin, link) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      const n = new Notification("ARC PULSE · " + baslik, { body: metin, tag: "arcpulse-" + a.id, icon: new URL("../ikon/app-180.png", import.meta.url).href });
      n.onclick = () => { window.focus(); if (link) location.hash = link.replace(/^.*#/, "#"); n.close(); };
    }
  } catch (e) { /* notifications blocked: the banner still shows */ }
  afis(baslik, metin, link);
  const tekrarli = a.tekrar || a.tur === "hedef" || a.tur === "olay";
  degistir(a.id, { son: Date.now(), tetik: (a.tetik || 0) + 1, ...(tekrarli ? {} : { aktif: false }) });
}

const fmt = (p) => (p >= 1000 ? "$" + Math.round(p).toLocaleString("en-US") : "$" + Number(p.toPrecision(5)));
let _seen = null, _cuzdan = null, zaman = null, calisiyor = false;

async function kontrol() {
  if (calisiyor) return; calisiyor = true;
  try {
    const l = alarmlar().filter((a) => a.aktif && !(a.son && (a.tekrar || a.tur === "hedef") && Date.now() - a.son < 3600e3));
    if (!l.length) return;
    const turler = new Set(l.map((a) => a.tur));
    const [mids, ctx, hedef, takvim] = await Promise.all([
      turler.has("fiyat") ? bilgi({ type: "allMids" }) : null,
      turler.has("fon") ? bilgi({ type: "metaAndAssetCtxs" }) : null,
      turler.has("hedef") ? dosya("perps-hedef.json") : null,
      turler.has("olay") ? dosya("takvim.json") : null]);
    const fon = ctx ? new Map(ctx[0].universe.map((u, i) => [u.name, Number((ctx[1][i] || {}).funding)])) : null;
    for (const a of l) {
      const link = a.coin ? "app.html#/perps/trade?coin=" + encodeURIComponent(a.coin) : "app.html#/perps/alerts";
      if (a.tur === "fiyat" && mids && mids[a.coin] != null) {
        const p = Number(mids[a.coin]);
        if (a.yon === "ust" ? p >= a.deger : p <= a.deger) ates(a, a.coin + " " + (a.yon === "ust" ? "above " : "below ") + fmt(a.deger), a.coin + " is at " + fmt(p) + " on Hyperliquid.", link);
      } else if (a.tur === "fon" && fon && fon.has(a.coin)) {
        const f = fon.get(a.coin) * 100;
        if (a.yon === "ust" ? f >= a.deger : f <= a.deger) ates(a, a.coin + " funding " + (a.yon === "ust" ? "above " : "below ") + a.deger + "%/h", "Hourly funding is " + f.toFixed(4) + "% (" + (f >= 0 ? "longs pay shorts" : "shorts pay longs") + ").", link);
      } else if (a.tur === "hedef" && hedef && Array.isArray(hedef.hedefler)) {
        const simdi = new Set(hedef.hedefler.filter((h) => !a.kosul || h.kosul.some((k) => k.tur === a.kosul)).map((h) => h.c));
        const once = new Set(a.gorulen || []);
        const yeni = [...simdi].filter((c) => !once.has(c));
        if (a.gorulen && yeni.length) ates(a, "Target Radar: " + yeni.slice(0, 3).join(", ") + (yeni.length > 3 ? " +" + (yeni.length - 3) : ""), "New on the radar" + (a.kosul ? " (" + a.kosul + ")" : "") + ". Conditions, not calls.", "app.html#/perps/targets");
        degistir(a.id, { gorulen: [...simdi] });
      } else if (a.tur === "olay" && takvim && Array.isArray(takvim.olaylar)) {
        const yakin = takvim.olaylar.filter((o) => { const z = Date.parse(o.t) - Date.now(); return z > 0 && z <= a.deger * 60000; });
        const bildirilen = new Set(a.gorulen || []);
        for (const o of yakin) if (!bildirilen.has(o.t + o.ad)) { ates(a, "US " + o.ad + " in " + Math.round((Date.parse(o.t) - Date.now()) / 60000) + " min", "High-impact release: prices often move fast around it, and stops and liquidations get hit more.", "app.html#/perps/trade"); bildirilen.add(o.t + o.ad); }
        if (yakin.length) degistir(a.id, { gorulen: [...bildirilen].slice(-20) });
      } else if (a.tur === "likit") {
        const kim = (_cuzdan && _cuzdan.hesap && _cuzdan.hesap()) || a.adres;
        if (!kim) continue;
        const ch = await bilgi({ type: "clearinghouseState", user: String(kim).toLowerCase() });
        const mid2 = mids || (await bilgi({ type: "allMids" }));
        for (const x of (ch && ch.assetPositions) || []) {
          const p = x.position, liq = Number(p.liquidationPx), m = Number(mid2 && mid2[p.coin]);
          if (!(liq > 0) || !(m > 0)) continue;
          const uzak = Math.abs(m / liq - 1) * 100;
          if (uzak <= a.deger) { ates(a, p.coin + " position " + uzak.toFixed(1) + "% from liquidation", "Price " + fmt(m) + ", liquidation ≈ " + fmt(liq) + ". Add margin, reduce or close if you want to avoid it.", "app.html#/perps/trade?coin=" + encodeURIComponent(p.coin)); break; }
        }
      }
    }
  } finally { calisiyor = false; }
}

function kur() {
  const var_ = alarmlar().some((a) => a.aktif);
  if (var_ && !zaman) { zaman = setInterval(kontrol, 30000); setTimeout(kontrol, 2000); }
  if (!var_ && zaman) { clearInterval(zaman); zaman = null; }
}

/** Called once by the app shell. Cheap when there are no alerts: nothing runs. */
export function baslat(cuzdan) { _cuzdan = cuzdan; kur(); window.addEventListener("storage", (e) => { if (e.key === ANAHTAR) kur(); }); }
export const simdiKontrol = () => kontrol();
