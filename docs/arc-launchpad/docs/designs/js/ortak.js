/* ===========================================================================
 * designs/js/ortak.js — shared pieces of the ARC PULSE Designs site
 *
 * Formatting, the avatar, the design tile and preview image, action buttons
 * with a status line, the wallet dialog (a wallet is asked for only when the
 * visitor acts), and the like / follow buttons: on chain through ProfilKaydi
 * once it is deployed, else the main app's device-only signed records
 * (docs/js/designs/yerel.js).
 * =========================================================================== */
import { el, temizle } from "../../js/ui.js";
import { formatUnits } from "../../vendor/ethers.min.js";
import { cuzdan, cuzdanUygulamalari, mobilMi, tarayiciCuzdani, WC_ACIK } from "../../js/cuzdan.js";
import * as S from "../../js/designs/sozlesme.js";
import { metaOku, cozUrl } from "../../js/designs/meta.js";
import * as SO from "./sosyal.js";

export { el, temizle, cuzdan, S, SO };
export const ANA = "../app.html";
export const usd = (m) => m == null ? "—" : "$" + Number(formatUnits(m, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
export const kisa = (a) => a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
export const esit = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const tarih = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const jetonYaz = (m, ondalik) => Number(formatUnits(m, ondalik)).toLocaleString("en-US", { maximumFractionDigits: 4 });
export const adresMi = (a) => /^0x[0-9a-fA-F]{40}$/.test(String(a || "").trim());

/* ---- icons (constant SVG, never user text) ---- */
const IKON = {
  ev: '<path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  kesfet: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  mesaj: '<path d="M21 4 3 11l7 2.5L12.5 21z"/><path d="M10 13.5 21 4"/>',
  arti: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  kisi: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  kalp: '<path d="M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z"/>',
  geri: '<path d="M15 5 8 12l7 7"/>',
  kilit: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
};
export function ikon(ad, boy = 24) {
  return el("span", { sinif: "dz-ikon", attr: { "aria-hidden": "true" },
    html: '<svg viewBox="0 0 24 24" width="' + boy + '" height="' + boy + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + IKON[ad] + "</svg>" });
}

/* ---- avatar: the profile image if it is on storage the CSP allows, else a gradient from the address ---- */
export function gorselUrl(uri) {
  const u = String(uri || "").trim();
  const url = cozUrl(u);
  return url && /^https:\/\/(gateway\.irys\.xyz|[a-z0-9-]+\.datasprite-cdn\.com|ipfs\.io|arweave\.net|[a-z0-9-]+\.arweave\.net)\//i.test(url) ? url : null;
}
export function avatar(adres, boy = 34, uri) {
  const h = parseInt(String(adres || "0x0").slice(2, 8), 16) || 0;
  const a = h % 360, b = (h >> 9) % 360;
  const k = el("span", { sinif: "dz-avatar", attr: { "aria-hidden": "true", style: "width:" + boy + "px;height:" + boy + "px;background:linear-gradient(135deg,hsl(" + a + " 70% 55%),hsl(" + b + " 70% 40%))" } });
  const koy = (u) => { const src = gorselUrl(u); if (!src) return; temizle(k); k.append(el("img", { attr: { src, alt: "", referrerpolicy: "no-referrer", loading: "lazy" }, on: { error: (e) => e.target.remove() } })); };
  if (uri !== undefined) koy(uri);
  else if (SO.PROFIL_VAR && adresMi(adres)) SO.profilOku(adres).then((p) => { if (!p.gizli) koy(p.avatar); }).catch(() => {});
  return k;
}
/** "@handle" / name / short address for a wallet, filled in when the profile arrives. */
export function isim(adres, sinif = "dz-isim") {
  const s = el("span", { sinif, yazi: kisa(adres) });
  if (SO.PROFIL_VAR && adresMi(adres)) SO.profilOku(adres).then((p) => {
    if (p.gizli) return;
    if (p.kullaniciAdi) s.textContent = "@" + p.kullaniciAdi;
    else if (p.ad) s.textContent = p.ad.slice(0, 48);
  }).catch(() => {});
  return s;
}
export function kisiBaglanti(adres, boy = 28) {
  return el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + adres } }, [avatar(adres, boy), isim(adres)]);
}

/* ---- status line and action buttons ---- */
export function durumSatiri() { return el("div", { sinif: "ds-durum", attr: { role: "status", "aria-live": "polite" } }); }
export function durumYaz(d, yazi, tur) { d.textContent = yazi || ""; d.className = "ds-durum" + (tur ? " ds-durum--" + tur : ""); }
export function eylem(yazi, f, sinif = "dugme dugme--marka", durum, cevir = SO.hataAcikla) {
  const d = durum || durumSatiri();
  const b = el("button", { sinif, yazi, attr: { type: "button" } });
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    b.disabled = true;
    try { await f((m, t) => durumYaz(d, m, t), b); }
    catch (x) { durumYaz(d, cevir(x), "hata"); }
    finally { b.disabled = false; }
  });
  b._durum = d;
  return b;
}

/* ---- the wallet: asked for only when the visitor acts ---- */
let _acik = null;
/** The connected address, opening the wallet dialog first when there is none. */
export async function hesapIste() {
  if (cuzdan.hesap()) return cuzdan.hesap();
  await cuzdanSec();
  if (!cuzdan.hesap()) throw new Error("Connect a wallet to continue.");
  return cuzdan.hesap();
}
export function cuzdanSec() {
  if (_acik) return _acik;
  _acik = new Promise((bitti) => {
    const durum = el("div", { sinif: "ds-durum" });
    let kapat;
    const secenek = (ad, alt, f) => el("button", { sinif: "dz-secenek", attr: { type: "button" }, on: { click: async () => {
      durumYaz(durum, "Waiting for the wallet…");
      try { await f(); kapat(); }
      catch (e) { durumYaz(durum, e && (e.code === 4001 || /reject|closed|cancel/i.test(e.message || "")) ? "Connection cancelled." : "Could not connect: " + ((e && e.message) || e), "hata"); }
    } } }, [el("b", { yazi: ad }), el("span", { yazi: alt })]);
    const liste = [];
    const t = tarayiciCuzdani();
    if (t) liste.push(secenek(t.ad, "Connect the wallet in this browser", () => cuzdan.bagla()));
    if (WC_ACIK) liste.push(secenek("WalletConnect", mobilMi() ? "Any wallet app on this phone" : "Scan a QR code with any wallet app", async () => {
      perde.style.display = "none";
      try { await cuzdan.walletConnect(); } finally { perde.style.display = ""; }
    }));
    if (mobilMi()) for (const u of cuzdanUygulamalari()) liste.push(el("a", { sinif: "dz-secenek", attr: { href: u.url, rel: "noopener" } }, [el("b", { yazi: u.ad }), el("span", { yazi: "Open this page in the " + u.ad + " app" })]));
    if (!t && !mobilMi()) liste.push(el("a", { sinif: "dz-secenek", attr: { href: "https://metamask.io/download/", target: "_blank", rel: "noopener" } }, [el("b", { yazi: "MetaMask" }), el("span", { yazi: "Install a browser wallet" })]));
    const kutu = el("div", { sinif: "dz-pencere", attr: { role: "dialog", "aria-modal": "true", "aria-label": "Connect a wallet" } }, [
      el("div", { sinif: "dz-pencere__ust" }, [el("h2", { yazi: "Connect a wallet" }), el("button", { sinif: "dugme dugme--sade", attr: { type: "button", "aria-label": "Close" }, yazi: "✕", on: { click: () => kapat() } })]),
      el("div", { sinif: "dz-secenekler" }, liste), durum,
      el("p", { sinif: "ds-cihaz", yazi: "Browsing needs no wallet. A wallet is asked for only to buy, publish, list, like, follow, edit your profile or message. ARC PULSE never asks for a seed phrase, keeps no accounts and stores nothing about you." })
    ]);
    const perde = el("div", { sinif: "dz-perde", on: { click: (e) => { if (e.target === perde) kapat(); } } }, [kutu]);
    const esc = (e) => { if (e.key === "Escape") kapat(); };
    kapat = () => { document.removeEventListener("keydown", esc); perde.remove(); _acik = null; bitti(cuzdan.hesap()); };
    document.addEventListener("keydown", esc);
    document.body.append(perde);
    const ilk = kutu.querySelector(".dz-secenek"); if (ilk) ilk.focus();
  });
  return _acik;
}

/* ---- design preview and tiles ---- */
export function resimKutusu(uri, sinif, ad) {
  const kap = el("div", { sinif }, [el("div", { sinif: "ds-kart__yer", yazi: "Loading preview…" })]);
  metaOku(uri).then((m) => {
    const src = m && (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(String(m.image || "")) ? m.image : cozUrl(m.image));
    temizle(kap);
    if (src) kap.append(el("img", { attr: { src, alt: (m.name || ad || "Design") + " (preview)", loading: "lazy", referrerpolicy: "no-referrer" }, on: { error: (e) => { e.target.replaceWith(el("div", { sinif: "ds-kart__yer", yazi: "Preview not reachable" })); } } }));
    else kap.append(el("div", { sinif: "ds-kart__yer", yazi: "No preview image" }));
  }).catch(() => { temizle(kap); kap.append(el("div", { sinif: "ds-kart__yer", yazi: "Metadata not reachable" })); });
  return kap;
}
export function adYaz(uri, hedef, yedek) {
  hedef.textContent = yedek;
  metaOku(uri).then((m) => { if (m && m.name) hedef.textContent = String(m.name).slice(0, 80); }).catch(() => {});
  return hedef;
}
/** Square grid tile (Instagram style): preview, and on hover the price and likes. */
export function karo(t, durum, begeni) {
  const ad = el("span", { sinif: "dz-karo__ad" });
  adYaz(t.uri, ad, "Design #" + t.id);
  return el("a", { sinif: "dz-karo", attr: { href: "#/d/" + t.id, "aria-label": "Design #" + t.id } }, [
    resimKutusu(t.uri, "dz-karo__resim", "Design #" + t.id),
    el("span", { sinif: "dz-karo__ust" }, [ad,
      el("span", { sinif: "dz-karo__bilgi" }, [
        el("span", { yazi: durum && durum.fiyat ? usd(durum.fiyat) : durum && !durum.sahip ? "taken down" : "not listed" }),
        begeni != null ? el("span", { yazi: "♥ " + begeni }) : null])]),
    durum && durum.fiyat ? el("span", { sinif: "dz-karo__etiket", yazi: usd(durum.fiyat) }) : null
  ]);
}

/* ---- like and follow ---- */
export function begeniDugmesi(cuzdanO, id, { sayi } = {}) {
  const b = el("button", { sinif: "dz-begeni", attr: { type: "button", "aria-pressed": "false", title: SO.PROFIL_VAR ? "Like on Arc (public)" : "Wallet-signed, saved on this device only" } });
  const sayac = el("span", { sinif: "dz-begeni__sayi" });
  let n = sayi;
  const ciz = (basili) => {
    b.setAttribute("aria-pressed", String(!!basili));
    temizle(b); b.append(ikon("kalp", 22), sayac);
    sayac.textContent = n != null ? String(n) : "";
  };
  const durum = durumSatiri();
  ciz(false);
  const ben = cuzdanO.hesap();
  if (SO.PROFIL_VAR) {
    if (n == null) SO.begeniSayisi(id).then((x) => { n = x; ciz(b.getAttribute("aria-pressed") === "true"); }).catch(() => {});
    if (ben) SO.begendiMi(ben, id).then((x) => ciz(x)).catch(() => {});
  } else {
    import("../../js/designs/yerel.js").then((Y) => ciz(Y.begendiMi(cuzdanO, id))).catch(() => {});
  }
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    b.disabled = true;
    try {
      await hesapIste();
      const basili = b.getAttribute("aria-pressed") === "true";
      if (SO.PROFIL_VAR) {
        await SO.profilGonder({ cuzdan: cuzdanO, data: basili ? SO.veriP.begeniGeriAl(id) : SO.veriP.begen(id), durum: (m, t) => durumYaz(durum, m, t), aciklama: basili ? "Confirm removing your like" : "Confirm your like" });
        if (n != null) n += basili ? -1 : 1;
        ciz(!basili); durumYaz(durum, "");
      } else {
        const Y = await import("../../js/designs/yerel.js");
        ciz(await Y.begeniDegistir(cuzdanO, id));
      }
    } catch (x) { durumYaz(durum, SO.hataAcikla(x), "hata"); }
    finally { b.disabled = false; }
  });
  return el("span", { sinif: "dz-begeni-kap" }, [b, durum]);
}

export function takipDugmesi(cuzdanO, kim, { degisti } = {}) {
  const b = el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" } });
  const durum = durumSatiri();
  let takipte = false;
  const ciz = () => { b.textContent = takipte ? "Following" : "Follow"; b.className = "dugme dugme--kucuk" + (takipte ? "" : " dugme--marka"); };
  ciz();
  const ben = cuzdanO.hesap();
  if (esit(ben, kim)) return el("span");
  if (SO.PROFIL_VAR) { if (ben) SO.takipMi(ben, kim).then((x) => { takipte = !!x; ciz(); }).catch(() => {}); }
  else import("../../js/designs/yerel.js").then((Y) => { takipte = Y.takipMi(cuzdanO, kim); ciz(); }).catch(() => {});
  b.title = SO.PROFIL_VAR ? "Follow on Arc (public)" : "Wallet-signed, saved on this device only";
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    b.disabled = true;
    try {
      const ben2 = await hesapIste();
      if (esit(ben2, kim)) throw new Error("You cannot follow yourself.");
      if (SO.PROFIL_VAR) {
        await SO.profilGonder({ cuzdan: cuzdanO, data: takipte ? SO.veriP.takiptenCik(kim) : SO.veriP.takipEt(kim), durum: (m, t) => durumYaz(durum, m, t), aciklama: takipte ? "Confirm unfollowing" : "Confirm following" });
        takipte = !takipte; SO.profilUnut(kim); durumYaz(durum, "");
      } else {
        const Y = await import("../../js/designs/yerel.js");
        await Y.takipDegistir(cuzdanO, kim);
        takipte = Y.takipMi(cuzdanO, kim);
      }
      ciz();
      degisti && degisti(takipte);
    } catch (x) { durumYaz(durum, SO.hataAcikla(x), "hata"); }
    finally { b.disabled = false; }
  });
  return el("span", { sinif: "dz-takip-kap" }, [b, durum]);
}

/** The designs of hidden profiles (ProfilKaydi.gizle) are left out everywhere. */
export async function gorunurler(liste) {
  const g = await SO.gizliler().catch(() => new Set());
  return g.size ? liste.filter((t) => !g.has(t.tasarimci.toLowerCase())) : liste;
}

/** Type-8 tokens whose founder in TurKaydi2 is `adres` (plus the admin's manual link on TasarimNFT2). */
export async function tasarimciJetonlari(adres) {
  const { turTokenlari, kurucuOku } = await import("../../js/urun.js");
  const liste = await turTokenlari(8);
  const benim = [];
  for (const x of liste) { const k = await kurucuOku(x.token).catch(() => null); if (esit(k, adres)) benim.push(x); }
  try {
    const elle = await (await S.nft()).elleBagliToken(adres);
    if (!/^0x0{40}$/i.test(elle) && !benim.some((x) => esit(x.token, elle))) { const j = await S.jetonBilgi(elle); benim.push({ token: elle, ad: j.ad, sembol: j.sembol }); }
  } catch (e) { /* the manual link is optional */ }
  return benim;
}

export function bosKutu(baslik, yazi, eylemler) {
  return el("div", { sinif: "bos" }, [el("div", { sinif: "bos__baslik", yazi: baslik }), yazi ? el("div", { sinif: "bos__yazi", yazi }) : null, eylemler || null]);
}
export function yukleniyor(yazi = "Reading Arc…") {
  return el("div", { sinif: "dz-yukleniyor", attr: { role: "status" } }, [el("span", { sinif: "dz-donen", attr: { "aria-hidden": "true" } }), yazi]);
}
