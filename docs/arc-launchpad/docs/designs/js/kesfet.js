/* ===========================================================================
 * designs/js/kesfet.js — the feed and Explore
 *
 * Feed: designs from the profiles the connected wallet follows (the follow
 * graph read from ProfilKaydi events; before it is deployed, the follows
 * signed on this device), newest first, then everything else. With no
 * wallet the feed is Explore.
 * Explore: every design on TasarimNFT2 as a square grid; newest, popular
 * (likes on ProfilKaydi), for sale, price low/high; category chips (the
 * metadata's `category`; designs without one are Other); search by @handle,
 * designer name or address and by the design's name, description and
 * category (client-side, over the metadata already loaded for the tiles);
 * the designers as a row of avatars on top.
 * =========================================================================== */
import { el, temizle, S, SO, usd, kisa, esit, adresMi, avatar, isim, karo, resimKutusu, adYaz, begeniDugmesi, takipDugmesi, bosKutu, gorunurler, yukleniyor } from "./ortak.js";
import { metaOku, KATEGORILER, kategoriOf, kategoriAdi } from "../../js/designs/meta.js";

async function veri() {
  const liste = await gorunurler(await S.yayinlar());
  const [durumlar, begeniler] = await Promise.all([
    S.durumlar(liste.slice(0, 300).map((t) => t.id)).then((l) => new Map(l.map((d) => [d.id, d]))),
    SO.begeniSayilari().catch(() => new Map())
  ]);
  return { liste: liste.filter((t) => durumlar.has(t.id) && durumlar.get(t.id).sahip), durumlar, begeniler };
}

function baslik(yazi, alt) {
  return el("div", { sinif: "dz-sayfa-ust" }, [el("h1", { yazi }), alt ? el("p", { yazi: alt }) : null]);
}

function ilkTasarim() {
  return bosKutu("No designs yet — be the first designer",
    "Launch your own token on ARC PULSE, save its type as Designer, then publish your first design as a 1-of-1 NFT priced in USDC.",
    el("div", { sinif: "ds-dugmeler", attr: { style: "justify-content:center" } }, [
      el("a", { sinif: "dugme dugme--marka", attr: { href: "#/publish" }, yazi: "Publish a design" }),
      el("a", { sinif: "dugme", attr: { href: "#/license" }, yazi: "Read the license" })]));
}

/* =================================================================== feed */
export async function akis(ctx) {
  const { cuzdan } = ctx;
  const ben = cuzdan.hesap();
  if (!ben) return kesfet(ctx, { akistan: true });
  const kap = el("div", { sinif: "dz-akis-sayfa" });
  const [{ liste, durumlar, begeniler }, takip] = await Promise.all([veri(), takipListesi(cuzdan)]);
  const set = new Set(takip.map((a) => a.toLowerCase()));
  const takipten = liste.filter((t) => set.has(t.tasarimci.toLowerCase()));
  kap.append(hikayeler(liste, takip));
  if (!liste.length) { kap.append(ilkTasarim()); return kap; }
  if (!takipten.length) {
    kap.append(el("div", { sinif: "not not--bilgi" }, [el("div", { yazi: set.size
      ? "The profiles you follow have not published yet. Here is everything new."
      : "Follow designers to fill your feed. Here is everything new." + (SO.PROFIL_VAR ? "" : " (Follows are saved on this device until on-chain profiles open.)") })]));
  }
  const geri = liste.filter((t) => !set.has(t.tasarimci.toLowerCase()));
  const sirali = [...takipten, ...geri].slice(0, 40);
  kap.append(el("div", { sinif: "dz-akis" }, sirali.map((t) => gonderi(t, durumlar.get(t.id), begeniler.get(t.id), cuzdan))));
  return kap;
}

async function takipListesi(cuzdan) {
  if (SO.PROFIL_VAR) return SO.takipEdilenler(cuzdan.hesap()).catch(() => []);
  const Y = await import("../../js/designs/yerel.js");
  return Y.takipEdilenler(cuzdan);
}

/* the designers as a row of avatars, followed ones first */
function hikayeler(liste, takip = []) {
  const g = new Map();
  for (const t of liste) { const k = t.tasarimci.toLowerCase(); if (!g.has(k)) g.set(k, { kim: t.tasarimci, n: 0 }); g.get(k).n++; }
  const set = new Set(takip.map((a) => a.toLowerCase()));
  const l = [...g.values()].sort((a, b) => (set.has(b.kim.toLowerCase()) - set.has(a.kim.toLowerCase())) || b.n - a.n).slice(0, 30);
  if (!l.length) return el("span");
  return el("div", { sinif: "dz-hikayeler", attr: { "aria-label": "Designers" } }, l.map((x) =>
    el("a", { sinif: "dz-hikaye", attr: { href: "#/u/" + x.kim } }, [el("span", { sinif: "dz-hikaye__halka" }, [avatar(x.kim, 58)]), isim(x.kim, "dz-hikaye__ad")])));
}

function gonderi(t, d, begeni, cuzdan) {
  const ad = el("a", { sinif: "dz-gonderi__ad", attr: { href: "#/d/" + t.id } });
  adYaz(t.uri, ad, "Design #" + t.id);
  return el("article", { sinif: "dz-gonderi" }, [
    el("header", { sinif: "dz-gonderi__ust" }, [
      el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + t.tasarimci } }, [avatar(t.tasarimci, 32), isim(t.tasarimci)]),
      el("span", { attr: { style: "margin-left:auto" } }, [takipDugmesi(cuzdan, t.tasarimci)])]),
    el("a", { attr: { href: "#/d/" + t.id, style: "display:block" } }, [resimKutusu(t.uri, "dz-gonderi__resim", "Design #" + t.id)]),
    el("div", { sinif: "dz-gonderi__alt" }, [
      el("div", { sinif: "dz-gonderi__eylem" }, [begeniDugmesi(cuzdan, t.id, { sayi: SO.PROFIL_VAR ? (begeni || 0) : undefined }),
        el("span", { sinif: "dz-fiyat-rozet" + (d && d.fiyat ? "" : " dz-fiyat-rozet--yok"), yazi: d && d.fiyat ? usd(d.fiyat) + " USDC" : "not listed" }),
        el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/d/" + t.id, style: "margin-left:auto" }, yazi: d && d.fiyat ? "Buy" : "View" })]),
      ad])
  ]);
}

/* ================================================================ explore */
export async function kesfet({ cuzdan, param }, { akistan } = {}) {
  const kap = el("div", { sinif: "dz-kesfet" });
  const { liste, durumlar, begeniler } = await veri();
  if (akistan) {
    kap.append(el("div", { sinif: "dz-karsilama" }, [
      el("h1", { yazi: "Designs on Arc" }),
      el("p", { yazi: "1-of-1 design files and images by the designers of ARC PULSE. Whoever holds the NFT holds all usage rights, commercial use included. Browse freely; a wallet is asked for only when you buy, publish, like, follow or message." })]));
  }
  kap.append(hikayeler(liste));
  if (!liste.length) { kap.append(ilkTasarim()); return kap; }

  const ara = el("input", { sinif: "girdi dz-ara", attr: { type: "search", placeholder: "Search designs, categories, @handle or 0x address", "aria-label": "Search designs and designers", value: param.get("q") || "" } });
  const SIRALAR = [["yeni", "Newest"], ["populer", "Popular"], ["satista", "For sale"], ["ucuz", "Price ↑"], ["pahali", "Price ↓"]];
  let sira = SIRALAR.some(([k]) => k === param.get("s")) ? param.get("s") : "yeni";
  const cipler = el("div", { sinif: "dz-cipler", attr: { role: "tablist", "aria-label": "Sort" } });
  const ipucu = el("div", { sinif: "ds-cihaz" });
  let kat = KATEGORILER.some(([k]) => k === param.get("k")) ? param.get("k") : "";
  const katCipler = el("div", { sinif: "dz-cipler dz-kat-cipler", attr: { role: "group", "aria-label": "Category" } });
  /* the metadata of every design (the tiles fetch the same, cached in meta.js), for categories and search */
  const metalar = new Map();
  let _metaHazir = null;
  const metaHazir = () => (_metaHazir ||= Promise.all(liste.map((t) => metaOku(t.uri).then((m) => metalar.set(t.id, m)).catch(() => {}))));
  /* a slow gateway must not hold the grid: wait at most 6 s, then filter with what has arrived */
  const metaBekle = () => Promise.race([metaHazir(), new Promise((r) => setTimeout(r, 6000))]);
  const metaUyar = (t, q) => {
    const m = metalar.get(t.id);
    if (!m) return false;
    return String(m.name || "").toLowerCase().includes(q) || String(m.description || "").toLowerCase().includes(q) || kategoriAdi(kategoriOf(m)).toLowerCase().includes(q);
  };
  const izgara = el("div");
  const sonuclar = el("div");

  /* profiles of the designers, for the search (one read each, cached) */
  const tasarimcilar = [...new Map(liste.map((t) => [t.tasarimci.toLowerCase(), t.tasarimci])).values()];
  const profiller = new Map();
  const profilHazir = SO.PROFIL_VAR ? Promise.all(tasarimcilar.map((a) => SO.profilOku(a).then((p) => profiller.set(a.toLowerCase(), p)).catch(() => {}))) : Promise.resolve();

  const ciz = async () => {
    temizle(cipler);
    for (const [k, y] of SIRALAR) cipler.append(el("button", { sinif: "dz-cip", attr: { type: "button", role: "tab", "aria-selected": String(k === sira) }, yazi: y,
      on: { click: () => { sira = k; ciz(); } } }));
    temizle(katCipler);
    for (const [k, y] of [["", "All"], ...KATEGORILER]) katCipler.append(el("button", { sinif: "dz-cip dz-cip--kat", attr: { type: "button", "aria-pressed": String(k === kat), "data-kat": k }, yazi: y,
      on: { click: () => { kat = k; ciz(); } } }));
    const ham = ara.value.trim().toLowerCase();
    const q = ham.replace(/^@/, "");
    temizle(sonuclar);
    let l = liste;
    if (kat) { await metaBekle(); l = l.filter((t) => kategoriOf(metalar.get(t.id)) === kat); }
    if (q) {
      await Promise.all([profilHazir, ham.startsWith("@") ? null : metaBekle()]);
      const uyan = (a) => {
        const p = profiller.get(a.toLowerCase());
        return a.toLowerCase().includes(q) || (p && !p.gizli && ((p.kullaniciAdi || "").includes(q) || (p.ad || "").toLowerCase().includes(q)));
      };
      /* "@x" searches people only; anything else also searches the designs' own words */
      l = l.filter((t) => uyan(t.tasarimci) || (!ham.startsWith("@") && metaUyar(t, ham)));
      /* an exact handle or address that is not a designer is still a profile to open */
      const kisiler = tasarimcilar.filter(uyan).slice(0, 8);
      if (adresMi(q) && !kisiler.some((a) => esit(a, q))) kisiler.unshift(ara.value.trim());
      else if (SO.PROFIL_VAR && /^[a-z0-9_]{3,20}$/.test(q)) {
        const a = await SO.sahibi(q).catch(() => null);
        if (a && !kisiler.some((x) => esit(x, a))) kisiler.unshift(a);
      }
      if (kisiler.length) sonuclar.append(el("div", { sinif: "dz-kisi-sonuc" }, kisiler.map((a) => el("a", { sinif: "dz-kisi dz-kisi--kart", attr: { href: "#/u/" + a } }, [avatar(a, 40), el("span", {}, [isim(a), el("span", { sinif: "ds-cihaz", yazi: " " + kisa(a) })])]))));
    }
    const f = (t) => durumlar.get(t.id).fiyat;
    if (sira === "satista" || sira === "ucuz" || sira === "pahali") l = l.filter(f);
    if (sira === "ucuz") l = [...l].sort((a, b) => (f(a) < f(b) ? -1 : f(a) > f(b) ? 1 : 0));
    if (sira === "pahali") l = [...l].sort((a, b) => (f(a) > f(b) ? -1 : f(a) < f(b) ? 1 : 0));
    if (sira === "populer") l = [...l].sort((a, b) => (begeniler.get(b.id) || 0) - (begeniler.get(a.id) || 0) || b.id - a.id);
    ipucu.textContent = sira === "populer" && !SO.PROFIL_VAR ? "Popular sorts by public likes on Arc, which open with on-chain profiles soon; until then this is the newest first." : "";
    temizle(izgara);
    izgara.append(l.length ? el("div", { sinif: "dz-izgara" }, l.map((t) => karo(t, durumlar.get(t.id), SO.PROFIL_VAR ? (begeniler.get(t.id) || 0) : null)))
      : bosKutu("Nothing matches", q ? "No design or designer matches “" + ara.value.trim() + "”" + (kat ? " in " + kategoriAdi(kat) : "") + "." : kat ? "No design in " + kategoriAdi(kat) + (sira === "yeni" || sira === "populer" ? "" : " is listed for sale") + " yet." : "No design is listed for sale right now."));
    /* the URL keeps the view (shareable), without a new history entry */
    const p = new URLSearchParams();
    if (sira !== "yeni") p.set("s", sira);
    if (kat) p.set("k", kat);
    if (q) p.set("q", ara.value.trim());
    if (!akistan) history.replaceState(null, "", "#/explore" + (p.toString() ? "?" + p : ""));
  };
  let zam = null;
  ara.addEventListener("input", () => { clearTimeout(zam); zam = setTimeout(ciz, 250); });
  kap.append(el("div", { sinif: "dz-filtre" }, [ara, cipler]), katCipler, ipucu, sonuclar, izgara);
  await ciz();
  return kap;
}
