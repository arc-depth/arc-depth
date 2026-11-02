/* ===========================================================================
 * gorunum/designs.js — "Designs": designer NFTs on Arc (TasarimNFT)
 *
 * Routes (ana.js turns #/designs/<alt> into param "alt"):
 *   #/designs            feed: designers you follow first, then the newest
 *   #/designs/explore    every design: newest / oldest / price, for sale only,
 *                        and the designers list
 *   #/designs/d/<id>     one design: preview, price in USDC and in the
 *                        designer token, owner, history, license, Buy, List
 *                        for resale, Challenge, escrow, unlock the file
 *   #/designs/u/<addr>   a profile: wallet, designer token(s) with their
 *                        trade page, designs created and held
 *   #/designs/publish    the publish flow for designers
 *   #/designs/license    the license every design carries (TasarimNFT.LISANS_URI)
 *
 * Everything shown is read from Arc or from the design's own metadata on
 * permanent storage. Likes and follows are wallet-signed and saved on this
 * device only (designs/yerel.js). Nothing about the visitor goes anywhere.
 * =========================================================================== */
import { el, temizle, bos, not, hata, iskelet } from "../ui.js";
import { formatUnits, parseUnits, zeroPadValue } from "../../vendor/ethers.min.js";
import * as S from "../designs/sozlesme.js";
import { metaOku, cozUrl, baytAl, uriGecerli, metaYap, KATEGORILER, EK_GORSEL_AZAMI } from "../designs/meta.js";
import * as Y from "../designs/yerel.js";

/* ---- page plumbing ---- */
function stilYukle() {
  if (document.getElementById("ds-stil")) return;
  document.head.append(el("link", { attr: { id: "ds-stil", rel: "stylesheet", href: "css/designs.css" } }));
}
const usd = (m) => m == null ? "—" : "$" + Number(formatUnits(m, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const kisa = (a) => a ? a.slice(0, 6) + "…" + a.slice(-4) : "—";
const esit = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const tarih = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const jetonYaz = (m, ondalik) => Number(formatUnits(m, ondalik)).toLocaleString("en-US", { maximumFractionDigits: 4 });

function avatar(adres, buyuk) {
  const h = parseInt(String(adres || "0x0").slice(2, 8), 16) || 0;
  const a = h % 360, b = (h >> 9) % 360;
  return el("span", { sinif: "ds-avatar" + (buyuk ? " ds-avatar--buyuk" : ""), attr: { "aria-hidden": "true", style: "background:linear-gradient(135deg,hsl(" + a + " 70% 55%),hsl(" + b + " 70% 40%))" } });
}
function durumSatiri() { return el("div", { sinif: "ds-durum", attr: { role: "status", "aria-live": "polite" } }); }
function durumYaz(d, yazi, tur) { d.textContent = yazi || ""; d.className = "ds-durum" + (tur ? " ds-durum--" + tur : ""); }
function dugme(yazi, f, sinif = "dugme", ozel = {}) {
  return el("button", { sinif, yazi, attr: { type: "button", ...ozel }, on: { click: f } });
}
/** a button that runs an async action with its own status line */
function eylem(yazi, f, sinif = "dugme dugme--marka", durum) {
  const d = durum || durumSatiri();
  const b = dugme(yazi, async () => {
    b.disabled = true;
    try { await f((m, t) => durumYaz(d, m, t)); }
    catch (e) { durumYaz(d, S.hataAcikla(e), "hata"); }
    finally { b.disabled = false; }
  }, sinif);
  b._durum = d;
  return b;
}
async function bagliHesap(cuzdan) { return cuzdan.hesap() || (await cuzdan.bagla()); }

function ust(baslik, alt, aktif) {
  const sek = [["", "Feed"], ["explore", "Explore"], ["publish", "Publish"], ["me", "My profile"]];
  return el("div", {}, [
    el("div", { sinif: "ds-ust" }, [
      el("div", {}, [el("h1", { yazi: baslik }), alt ? el("div", { sinif: "ds-ust__alt", yazi: alt }) : null]),
      el("a", { sinif: "dugme dugme--marka", attr: { href: "#/designs/publish" }, yazi: "Publish a design" })
    ]),
    el("nav", { sinif: "ds-sekmeler", attr: { "aria-label": "Designs" } }, sek.map(([k, ad]) =>
      el("a", { attr: { href: "#/designs" + (k ? "/" + k : ""), "aria-current": aktif === k ? "page" : null }, yazi: ad })))
  ]);
}

/* ---- metadata preview image for a design ---- */
function resimKutusu(uri, sinif, ad) {
  const kap = el("div", { sinif }, [el("div", { sinif: "ds-kart__yer", yazi: "Loading preview…" })]);
  metaOku(uri).then((m) => {
    /* a small inline image (data:image/…) is shown as is: img-src allows data:, and an <img> runs no script */
    const src = m && (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(String(m.image || "")) ? m.image : cozUrl(m.image));
    temizle(kap);
    if (src) kap.append(el("img", { attr: { src, alt: (m.name || ad || "Design") + " (preview)", loading: "lazy", referrerpolicy: "no-referrer" }, on: { error: (e) => { e.target.replaceWith(el("div", { sinif: "ds-kart__yer", yazi: "Preview not reachable" })); } } }));
    else kap.append(el("div", { sinif: "ds-kart__yer", yazi: "No preview image" }));
  }).catch(() => { temizle(kap); kap.append(el("div", { sinif: "ds-kart__yer", yazi: "Metadata not reachable" })); });
  return kap;
}
function adYaz(uri, hedef, yedek) {
  hedef.textContent = yedek;
  metaOku(uri).then((m) => { if (m && m.name) hedef.textContent = String(m.name).slice(0, 80); }).catch(() => {});
  return hedef;
}

function kart(t, durum) {
  const ad = el("div", { sinif: "ds-kart__ad" });
  adYaz(t.uri, ad, "Design #" + t.id);
  return el("a", { sinif: "ds-kart", attr: { href: "#/designs/d/" + t.id } }, [
    resimKutusu(t.uri, "ds-kart__resim", "Design #" + t.id),
    el("div", { sinif: "ds-kart__alt" }, [
      el("div", { attr: { style: "min-width:0" } }, [ad, el("div", { sinif: "ds-kart__kim", yazi: "by " + kisa(t.tasarimci) })]),
      el("div", { sinif: "ds-fiyat" + (durum && durum.fiyat ? "" : " ds-fiyat--yok"), yazi: durum && durum.fiyat ? usd(durum.fiyat) : durum && !durum.sahip ? "taken down" : "not listed" })
    ])
  ]);
}

function fiyatBandi(ay) {
  if (!ay) return null;
  return ay.fiyatCanli ? null : not("Buying opens when the price feed is live. Designs are priced in USDC and paid in the designer's own token at a time-weighted price; that price source comes with PulseHook6 and is not set on TasarimNFT yet. Publishing works now.", "uyari");
}

function bosDurum() {
  return bos("No designs yet — be the first designer",
    "Launch your own token, save its type as Designer, then publish your first design as a 1-of-1 NFT priced in USDC.",
    el("div", { sinif: "ds-dugmeler", attr: { style: "justify-content:center" } }, [
      el("a", { sinif: "dugme dugme--marka", attr: { href: "#/designs/publish" }, yazi: "Publish a design" }),
      el("a", { sinif: "dugme", attr: { href: "#/designs/license" }, yazi: "Read the license" })]));
}

/* =================================================================== feed */
async function akis({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(ust("Designs", "Designer NFTs on Arc: 1-of-1 files and images, full usage rights to whoever holds them", ""));
  const [ay, liste] = await Promise.all([S.ayarlar().catch(() => null), S.yayinlar()]);
  const b = fiyatBandi(ay); if (b) kap.append(b);
  if (!liste.length) { kap.append(bosDurum()); return kap; }
  const takip = new Set(Y.takipEdilenler(cuzdan));
  const sirali = [...liste.filter((t) => takip.has(t.tasarimci.toLowerCase())), ...liste.filter((t) => !takip.has(t.tasarimci.toLowerCase()))].slice(0, 60);
  if (takip.size) kap.append(el("div", { sinif: "ds-cihaz", yazi: "Designers you follow come first (follows are saved on this device)." }));
  const durumlar = new Map((await S.durumlar(sirali.map((t) => t.id))).map((d) => [d.id, d]));
  kap.append(el("div", { sinif: "ds-akis" }, sirali.map((t) => gonderi(t, durumlar.get(t.id), cuzdan))));
  return kap;
}

function begeniDugmesi(cuzdan, id) {
  const b = el("button", { sinif: "dugme dugme--sade dugme--kucuk ds-begeni", attr: { type: "button", "aria-pressed": String(Y.begendiMi(cuzdan, id)), title: "Wallet-signed, saved on this device only" } });
  const yaz = () => { b.textContent = b.getAttribute("aria-pressed") === "true" ? "♥ Liked" : "♡ Like"; };
  yaz();
  b.addEventListener("click", async (e) => {
    e.preventDefault(); e.stopPropagation();
    b.disabled = true;
    try { b.setAttribute("aria-pressed", String(await Y.begeniDegistir(cuzdan, id))); } catch (x) { b.title = S.hataAcikla(x); }
    finally { b.disabled = false; yaz(); }
  });
  return b;
}
function takipDugmesi(cuzdan, kim) {
  const b = el("button", { sinif: "dugme dugme--kucuk", attr: { type: "button", title: "Wallet-signed, saved on this device only" } });
  const yaz = () => { b.textContent = Y.takipMi(cuzdan, kim) ? "Following" : "Follow"; };
  yaz();
  b.addEventListener("click", async () => {
    b.disabled = true;
    try { await Y.takipDegistir(cuzdan, kim); } catch (x) { b.title = S.hataAcikla(x); }
    finally { b.disabled = false; yaz(); }
  });
  return b;
}

function gonderi(t, d, cuzdan) {
  const ad = el("a", { attr: { href: "#/designs/d/" + t.id } });
  adYaz(t.uri, ad, "Design #" + t.id);
  return el("article", { sinif: "ds-gonderi" }, [
    el("div", { sinif: "ds-gonderi__ust" }, [avatar(t.tasarimci), el("a", { attr: { href: "#/designs/u/" + t.tasarimci }, yazi: kisa(t.tasarimci) }),
      el("span", { attr: { style: "margin-left:auto" } }, [takipDugmesi(cuzdan, t.tasarimci)])]),
    el("a", { attr: { href: "#/designs/d/" + t.id, style: "display:block" } }, [resimKutusu(t.uri, "ds-kart__resim", "Design #" + t.id)]),
    el("div", { sinif: "ds-gonderi__alt" }, [
      el("div", { sinif: "ds-gonderi__eylem" }, [begeniDugmesi(cuzdan, t.id), el("span", { sinif: "ds-cihaz", yazi: "saved on this device" }),
        el("span", { sinif: "ds-fiyat", attr: { style: "margin-left:auto" }, yazi: d && d.fiyat ? usd(d.fiyat) : "not listed" })]),
      ad
    ])
  ]);
}

/* ================================================================ explore */
async function kesfet({ param }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(ust("Explore designs", "Every design published on Arc", "explore"));
  const [ay, liste] = await Promise.all([S.ayarlar().catch(() => null), S.yayinlar()]);
  const b = fiyatBandi(ay); if (b) kap.append(b);
  if (!liste.length) { kap.append(bosDurum()); return kap; }
  const durumlar = new Map((await S.durumlar(liste.slice(0, 300).map((t) => t.id))).map((d) => [d.id, d]));
  const sec = el("select", { sinif: "girdi", attr: { "aria-label": "Sort", style: "max-width:220px" } },
    [["yeni", "Newest"], ["eski", "Oldest"], ["ucuz", "Price: low to high"], ["pahali", "Price: high to low"], ["tasarimci", "By designer"]]
      .map(([v, y]) => el("option", { attr: { value: v, selected: param.get("s") === v ? "" : null }, yazi: y })));
  const satista = el("input", { attr: { type: "checkbox", id: "ds-satista" } });
  const izgara = el("div");
  const ciz = () => {
    temizle(izgara);
    let l = liste.filter((t) => durumlar.has(t.id));
    if (satista.checked) l = l.filter((t) => durumlar.get(t.id).fiyat);
    if (sec.value === "tasarimci") {
      const g = new Map();
      for (const t of l) { const k = t.tasarimci.toLowerCase(); if (!g.has(k)) g.set(k, { kim: t.tasarimci, n: 0, son: t }); g.get(k).n++; }
      izgara.append(el("div", { sinif: "ds-izgara" }, [...g.values()].sort((a, b) => b.n - a.n).map((x) =>
        el("a", { sinif: "ds-kart", attr: { href: "#/designs/u/" + x.kim } }, [resimKutusu(x.son.uri, "ds-kart__resim"),
          el("div", { sinif: "ds-kart__alt" }, [el("div", { sinif: "ds-kart__ad ds-mono", yazi: kisa(x.kim) }), el("div", { sinif: "ds-kart__kim", yazi: x.n + " design" + (x.n > 1 ? "s" : "") })])]))));
      return;
    }
    const f = (t) => durumlar.get(t.id).fiyat;
    if (sec.value === "eski") l = [...l].reverse();
    if (sec.value === "ucuz" || sec.value === "pahali") {
      l = [...l].sort((a, b) => {
        const x = f(a), y = f(b);
        if (!x && !y) return 0; if (!x) return 1; if (!y) return -1;
        return sec.value === "ucuz" ? (x < y ? -1 : x > y ? 1 : 0) : (x > y ? -1 : x < y ? 1 : 0);
      });
    }
    izgara.append(l.length ? el("div", { sinif: "ds-izgara" }, l.map((t) => kart(t, durumlar.get(t.id)))) : bos("Nothing matches", "No design is listed for sale right now."));
  };
  sec.addEventListener("change", ciz);
  satista.addEventListener("change", ciz);
  kap.append(el("div", { sinif: "ds-dugmeler", attr: { style: "align-items:center" } }, [sec, el("label", { attr: { for: "ds-satista", style: "display:flex;gap:6px;align-items:center" } }, [satista, "For sale only"])]));
  kap.append(izgara);
  ciz();
  return kap;
}

/* ================================================================ profile */
async function profil({ cuzdan }, adres) {
  const kap = el("div", { sinif: "yigin" });
  const ben = cuzdan.hesap();
  kap.append(ust(esit(adres, ben) ? "My profile" : "Designer", null, esit(adres, ben) ? "me" : null));
  const liste = await S.yayinlar();
  const yaptigi = liste.filter((t) => esit(t.tasarimci, adres));
  const durumlar = new Map((await S.durumlar(liste.slice(0, 300).map((t) => t.id))).map((d) => [d.id, d]));
  const tuttugu = liste.filter((t) => durumlar.get(t.id) && esit(durumlar.get(t.id).sahip, adres));

  const jetonlar = el("div", { sinif: "ds-dugmeler" }, [el("span", { sinif: "ds-cihaz", yazi: "Reading designer tokens…" })]);
  tasarimciJetonlari(adres).then((js) => {
    temizle(jetonlar);
    if (!js.length) { jetonlar.append(el("span", { sinif: "ds-cihaz", yazi: "No designer token (TurKaydi type 8) founded by this wallet." })); return; }
    for (const j of js) jetonlar.append(el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/merkez?t=" + j.token, title: "Trade " + (j.sembol || "") }, yazi: "$" + (j.sembol || kisa(j.token)) + " · Trade" }));
  }).catch(() => { temizle(jetonlar); jetonlar.append(el("span", { sinif: "ds-cihaz", yazi: "Could not read the type record." })); });

  kap.append(el("div", { sinif: "ds-profil" }, [avatar(adres, true), el("div", { sinif: "ds-profil__bilgi" }, [
    el("div", { sinif: "ds-profil__ad", yazi: adres }),
    el("div", { sinif: "ds-sayilar" }, [el("span", {}, [el("b", { yazi: String(yaptigi.length) }), " created"]), el("span", {}, [el("b", { yazi: String(tuttugu.length) }), " held"])]),
    jetonlar,
    el("div", { sinif: "ds-dugmeler" }, [
      esit(adres, ben) ? null : takipDugmesi(cuzdan, adres),
      el("a", { sinif: "dugme dugme--kucuk dugme--sade", attr: { href: S.TASARIM.kasif + "/address/" + adres, target: "_blank", rel: "noopener" }, yazi: "Explorer ↗" })]),
    esit(adres, ben) ? null : el("div", { sinif: "ds-cihaz", yazi: "Follows are wallet-signed and saved on this device only." })
  ])]));

  if (esit(adres, ben)) kap.append(S.SURUM === 2 ? (await import("../designs/teslim.js")).anahtarKutusu(cuzdan) : acmaKartiKutusu(cuzdan));

  const sekme = el("div");
  const goster = (hangi) => {
    temizle(sekme);
    const l = hangi === "tut" ? tuttugu : yaptigi;
    sekme.append(l.length ? el("div", { sinif: "ds-izgara" }, l.map((t) => kart(t, durumlar.get(t.id))))
      : bos(hangi === "tut" ? "Holds no designs" : "No designs published yet", hangi === "tut" ? "" : esit(adres, ben) ? "Publish your first design." : ""));
  };
  const s1 = el("a", { attr: { href: "#/designs/u/" + adres, role: "button", "aria-current": "page" }, yazi: "Created" });
  const s2 = el("a", { attr: { href: "#/designs/u/" + adres, role: "button" }, yazi: "Held" });
  s1.addEventListener("click", (e) => { e.preventDefault(); s1.setAttribute("aria-current", "page"); s2.removeAttribute("aria-current"); goster("yap"); });
  s2.addEventListener("click", (e) => { e.preventDefault(); s2.setAttribute("aria-current", "page"); s1.removeAttribute("aria-current"); goster("tut"); });
  kap.append(el("nav", { sinif: "ds-sekmeler" }, [s1, s2]), sekme);
  goster("yap");
  return kap;
}

/** Type-8 tokens whose founder in TurKaydi is `adres` (plus the admin's manual link). */
async function tasarimciJetonlari(adres) {
  const { turTokenlari, kurucuOku } = await import("../urun.js");
  const liste = await turTokenlari(8);
  const benim = [];
  for (const x of liste) { const k = await kurucuOku(x.token).catch(() => null); if (esit(k, adres)) benim.push(x); }
  try {
    const elle = await (await S.nft()).elleBagliToken(adres);
    if (!/^0x0{40}$/i.test(elle) && !benim.some((x) => esit(x.token, elle))) { const j = await S.jetonBilgi(elle); benim.push({ token: elle, ad: j.ad, sembol: j.sembol }); }
  } catch (e) { /* the manual link is optional */ }
  return benim;
}

/* The viewer's unlock key card: what a seller needs to hand over a file key. */
function acmaKartiKutusu(cuzdan) {
  const cikti = el("textarea", { sinif: "girdi ds-mono", attr: { readonly: "", rows: "3", style: "display:none", "aria-label": "Your key card" } });
  const d = durumSatiri();
  return el("div", { sinif: "ds-kutu" }, [
    el("h3", { yazi: "Your unlock key (to receive design files)" }),
    el("p", { sinif: "ds-lisans", yazi: "Design files are encrypted. When you buy one, the seller's browser wraps the file key to your unlock public key. Your unlock key is derived from a signature of your wallet (nothing is stored); its public half plus your signature form a key card that nobody can forge. Publish it once on Irys so sellers find it, or copy it and send it to the seller yourself." }),
    el("div", { sinif: "ds-dugmeler" }, [
      eylem("Copy my key card", async (yaz) => {
        await bagliHesap(cuzdan);
        const { kartYap, kartMetni } = await import("../designs/sifre.js");
        yaz("Sign twice in your wallet: once to derive your unlock key, once to sign its public half…");
        const k = kartMetni(await kartYap(cuzdan));
        cikti.value = k; cikti.style.display = "";
        try { await navigator.clipboard.writeText(k); yaz("Key card copied. Send it to the seller.", "ok"); } catch (e) { yaz("Key card below; copy it.", "ok"); }
      }, "dugme", d),
      eylem("Publish my key card on Irys", async (yaz) => {
        await bagliHesap(cuzdan);
        const { kartYap } = await import("../designs/sifre.js");
        yaz("Sign to derive your unlock key and to sign its public half…");
        const kartJ = await kartYap(cuzdan);
        const veri = new TextEncoder().encode(JSON.stringify(kartJ));
        await irysYukle(cuzdan, veri, [{ name: "Content-Type", value: "application/json" }, { name: "Type", value: "unlock-key" }, { name: "Wallet", value: kartJ.w }], yaz);
        yaz("Published. Sellers can now deliver file keys to you.", "ok");
      }, "dugme", d)
    ]), d, cikti
  ]);
}

/* ---- Irys from a view: price, fund if needed, upload ---- */
async function irysYukle(cuzdan, veri, etiketler, yaz) {
  const I = await import("../designs/irys.js");
  const { imzala } = await import("../designs/imza.js");
  const imzaci = await I.cuzdanImzacisi(cuzdan, (m) => imzala(cuzdan, m));
  await irysFonla(cuzdan, veri.length + 2048, yaz);
  yaz("Sign the upload in your wallet…");
  return I.yukle(veri, etiketler, imzaci);
}
/** What storing `bayt` on Irys needs now: {gereken, var_, yatir} in wei (yatir 0 when the balance covers it). */
async function irysIhtiyac(ben, bayt) {
  const I = await import("../designs/irys.js");
  const [gereken, var_] = await Promise.all([I.fiyat(bayt), I.bakiye(ben)]);
  return { gereken, var_, yatir: var_ >= gereken ? 0n : (gereken - var_) * 12n / 10n + 1n };   // 20% headroom: the price moves with ETH
}
/* odeme: "usdc" (default: Arc USDC through relay.link, no ETH needed) or "eth" (ETH the wallet has on Base) */
async function irysFonla(cuzdan, bayt, yaz, odeme = "usdc", beklenenUsdc) {
  const I = await import("../designs/irys.js");
  const ben = cuzdan.hesap();
  const { gereken, var_, yatir } = await irysIhtiyac(ben, bayt);
  if (!yatir) return;
  yaz("Irys storage costs " + formatUnits(gereken, 18) + " ETH for " + Math.ceil(bayt / 1024) + " KB; your Irys balance is " + formatUnits(var_, 18) + " ETH.");
  if (odeme === "eth") await I.fonla(cuzdan, yatir, yaz);
  else await I.fonlaArcUsdc(cuzdan, yatir, yaz, beklenenUsdc);
  for (let i = 0; i < 40; i++) {
    if ((await I.bakiye(ben).catch(() => 0n)) >= gereken) return;
    yaz("Waiting for Irys to credit the deposit…");
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new Error("Irys has not credited the deposit yet. Try again in a minute; the ETH is on your Irys balance, not lost.");
}

/* ================================================================= detail */
async function detay({ cuzdan }, id) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(ust("Design #" + id, null, null));
  const [t, ay] = await Promise.all([S.tasarimOku(id), S.ayarlar().catch(() => null)]);
  if (!t) { kap.append(bos("No such design", "Design #" + id + " has not been published.", el("a", { sinif: "dugme", attr: { href: "#/designs/explore" }, yazi: "Explore designs" }))); return kap; }
  const b = fiyatBandi(ay); if (b) kap.append(b);
  const ben = cuzdan.hesap();
  const j = await S.jetonBilgi(t.token).catch(() => ({ sembol: null, ondalik: 18 }));
  const sym = j.sembol || "designer token";
  const meta = await metaOku(t.uri).catch(() => null);
  const simdi = Date.now();
  const pencereAcik = simdi <= t.itirazBitis;

  /* left: the preview */
  const sol = el("div", { sinif: "yigin" }, [resimKutusu(t.uri, "ds-detay__resim", "Design #" + id)]);
  if (meta && meta.description) sol.append(el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "About" }), el("p", { sinif: "ds-lisans", attr: { style: "white-space:pre-wrap" }, yazi: String(meta.description).slice(0, 4000) })]));

  /* right: name, people, price, actions */
  const yan = el("div", { sinif: "ds-detay__yan" });
  const ad = (meta && meta.name) ? String(meta.name).slice(0, 120) : "Design #" + id;
  yan.append(el("div", {}, [
    el("h2", { attr: { style: "margin:0 0 6px" }, yazi: ad }),
    el("div", { sinif: "ds-dugmeler", attr: { style: "align-items:center" } }, [
      t.sahip ? null : el("span", { sinif: "ds-rozet ds-rozet--uyari", yazi: "Taken down" }),
      pencereAcik ? el("span", { sinif: "ds-rozet ds-rozet--uyari", title: "Anyone may challenge a copy until then", yazi: "Challenge window until " + tarih(t.itirazBitis) }) : el("span", { sinif: "ds-rozet ds-rozet--ok", yazi: "Challenge window closed" }),
      t.itiraz ? el("span", { sinif: "ds-rozet ds-rozet--uyari", yazi: "Challenge open" }) : null,
      begeniDugmesi(cuzdan, id), el("span", { sinif: "ds-cihaz", yazi: "saved on this device" })])
  ]));
  yan.append(el("div", { sinif: "ds-kutu" }, [
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Designer" }), el("a", { attr: { href: "#/designs/u/" + t.tasarimci }, yazi: kisa(t.tasarimci) })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Owner" }), t.sahip ? el("a", { attr: { href: "#/designs/u/" + t.sahip }, yazi: esit(t.sahip, ben) ? "you" : kisa(t.sahip) }) : el("span", { yazi: "none (burned)" })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Designer token" }), el("a", { attr: { href: "#/merkez?t=" + t.token }, yazi: "$" + sym + " · Trade" })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Exact file hash" }), el("span", { sinif: "ds-mono", attr: { title: t.dosyaHash }, yazi: t.dosyaHash.slice(0, 18) + "…" })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Fingerprint" }), el("span", { sinif: "ds-mono", attr: { title: t.algiHash }, yazi: t.algiHash.slice(0, 18) + "…" })]),
    meta && meta.arcpulse && meta.arcpulse.file ? el("div", { sinif: "ds-satir" }, [el("span", { yazi: "File" }), el("span", { yazi: (meta.arcpulse.file.name || "file") + (meta.arcpulse.file.size ? " · " + Math.ceil(meta.arcpulse.file.size / 1024) + " KB" : "") + " · encrypted" })]) : null,
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Contract" }), el("a", { attr: { href: S.TASARIM.kasif + "/token/" + S.TASARIM.adres + "?a=" + id, target: "_blank", rel: "noopener" }, yazi: kisa(S.TASARIM.adres) + " ↗" })])
  ]));

  if (t.sahip) yan.append(await satisKutusu({ cuzdan, t, ay, j, sym }));
  /* v2: a design in an open sale is frozen (Kilitli) until the key is confirmed or refunded */
  if (t.sahip && esit(t.sahip, ben) && !(S.SURUM === 2 && t.satis)) yan.append(ilanKutusu({ cuzdan, t, ay }));
  if (S.SURUM === 2) yan.append(await (await import("../designs/teslim.js")).satisDurumu({ cuzdan, t, meta, ay }));
  else yan.append(await emanetKutusu({ cuzdan, t, j, sym }));
  if (t.sahip && pencereAcik && !t.itiraz) yan.append(itirazKutusu({ cuzdan, t, ay }));
  if (esit(t.tasarimci, ben) && t.teminat > 0n && !pencereAcik && !t.itiraz) {
    const d = durumSatiri();
    yan.append(el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Your stake" }), el("div", { yazi: usd(t.teminat) + " USDC held since publishing; the window is over." }),
      eylem("Take the stake back", async (yaz) => { await S.gonder({ cuzdan, data: S.veri.teminatGeriAl(id), durum: yaz }); yaz("Stake returned.", "ok"); }, "dugme", d), d]));
  }
  if (t.sahip && meta && !(S.SURUM === 2 && t.satis)) yan.append(dosyaKutusu({ cuzdan, t, meta }));

  /* license */
  yan.append(el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "License" }), el("p", { sinif: "ds-lisans", yazi: (ay && ay.lisans) || S.LISANS_YEDEK }),
    el("a", { attr: { href: "#/designs/license" }, yazi: "Full license page" })]));

  kap.append(el("div", { sinif: "ds-detay" }, [sol, yan]));

  /* history */
  const gecmisKutu = el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "History" }), iskelet(3)]);
  kap.append(gecmisKutu);
  S.gecmis(id).then((olaylar) => {
    gecmisKutu.lastChild.replaceWith(el("div", { sinif: "ds-gecmis" }, olaylar.length ? olaylar.map((o) => gecmisSatiri(o, j)) : [el("div", { yazi: "No events found." })]));
  }).catch((e) => { gecmisKutu.lastChild.replaceWith(el("div", { sinif: "ds-durum ds-durum--hata", yazi: "Could not read the history: " + ((e && e.message) || e) })); });
  return kap;
}

function gecmisSatiri(o, j) {
  const a = o.args;
  const Z = "0x0000000000000000000000000000000000000000";
  const y = {
    Yayinlandi: () => "Published by " + kisa(a.tasarimci) + " (fee " + usd(a.ucret) + ")",
    IlanVerildi: () => "Listed by " + kisa(a.satici) + " for " + usd(a.fiyat),
    IlanKalkti: () => "Listing ended",
    Satildi: () => "Sold by " + kisa(a.satici) + " to " + kisa(a.alici) + " for " + usd(a.fiyat) + " (" + jetonYaz(a.tokenMiktari, j.ondalik || 18) + " " + (j.sembol || "tokens") + (a.usdcIle ? ", paid in USDC" : "") + ")",
    ItirazEdildi: () => "Challenged by " + kisa(a.itirazci) + (Number(a.oncekiId) ? " as a copy of #" + a.oncekiId : "") + " (bond " + usd(a.teminat) + ")",
    ItirazCozuldu: () => "Challenge " + (a.kabul ? "upheld: design burned" : "rejected: bond to the designer"),
    Kaldirildi: () => "Taken down: " + String(a.sebep).slice(0, 140),
    Emanete: () => "Payment held in escrow (" + jetonYaz(a.miktar, j.ondalik || 18) + " " + (j.sembol || "") + ")",
    EmanetOdendi: () => (a.iade ? "Escrow refunded to " : "Escrow paid to ") + kisa(a.kime),
    TeminatIade: () => "Stake returned to " + kisa(a.kime),
    TeslimEdildi: () => "File key delivered to " + kisa(a.alici),
    TeslimAlindi: () => "Buyer confirmed the file",
    AnahtarItirazi: () => "Buyer said the key does not work",
    SatisKapandi: () => (a.saticiyaOdendi ? "Payment released to " : "Refunded to ") + kisa(a.kime),
    OnuAlindi: () => "Front-run: design #" + a.eskiId + " burned for #" + a.yeniId,
    Transfer: () => a.from === Z ? "Minted to " + kisa(a.to) : a.to === Z ? "Burned" : "Transferred " + kisa(a.from) + " → " + kisa(a.to)
  }[o.ad];
  return el("div", { sinif: "ds-gecmis__oge" }, [el("span", { yazi: y ? y() : o.ad }),
    el("a", { attr: { href: S.TASARIM.kasif + "/tx/" + o.tx, target: "_blank", rel: "noopener" }, yazi: "block " + o.blok + " ↗" })]);
}

async function satisKutusu({ cuzdan, t, ay, j, sym }) {
  const ben = cuzdan.hesap();
  const kutu = el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Price" })]);
  if (!t.ilan) { kutu.append(el("div", { sinif: "ds-fiyat--yok", yazi: "Not listed for sale." })); return kutu; }
  const q = ay && ay.fiyatCanli ? await S.tokenKarsiligi(t.token, t.ilan.fiyat) : null;
  kutu.append(el("div", { sinif: "ds-buyuk-fiyat", yazi: usd(t.ilan.fiyat) + " USDC" }));
  kutu.append(el("div", { sinif: "ds-satir" }, [el("span", { yazi: "In " + sym }), el("span", { sinif: "ds-fiyat", yazi: q != null ? "≈ " + jetonYaz(q, j.ondalik) + " " + sym + " (time-weighted price)" : ay && ay.fiyatCanli ? "— (no feed price for this token yet)" : "— (price feed not live yet)" })]));
  kutu.append(el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Seller" }), el("span", { yazi: esit(t.ilan.satici, ben) ? "you" : kisa(t.ilan.satici) })]));
  if (!ay || !ay.fiyatCanli || q == null) {
    kutu.append(el("div", { sinif: "ds-dugmeler" }, [dugme("Buy with $" + sym, null, "dugme dugme--marka", { disabled: "" }), dugme("Buy with USDC", null, "dugme", { disabled: "" })]));
    kutu.append(not(!ay || !ay.fiyatCanli
      ? "Buying opens when the price feed is live (PulseHook6). The listing is real and stays; nothing can be bought below or above its USDC price."
      : "Buying opens when the price feed is live for $" + sym + ": the time-weighted price comes from PulseHook6 pools, and this token's pool has no price there yet (tokens launched before v9 trade in an older pool). The listing is real and stays.", "uyari"));
    return kutu;
  }
  if (esit(t.ilan.satici, ben)) { kutu.append(el("div", { sinif: "ds-cihaz", yazi: "This is your listing." })); return kutu; }
  if (t.itiraz) { kutu.append(not("A challenge is open on this design; buying waits for it to be resolved.", "uyari")); return kutu; }
  const d = durumSatiri();
  /* the Arc purchase with USDC; also the last step of a payment from another chain (uzak-alim.js) */
  const usdcIleAl = async (yaz) => {
    await bagliHesap(cuzdan);
    const kanca = await S.havuzKancasi(t.token);
    const ka = await (await S.nft()).kancaAyar(kanca);
    if (!ka.izinli) throw new Error("This designer token's pool hook is not allowed for USDC purchases yet; buy with $" + sym + ".");
    const miktar = await S.tokenKarsiligi(t.token, t.ilan.fiyat);
    if (miktar == null) throw new Error("Buying opens when the price feed is live.");
    const asgari = await S.alUsdcAsgari(miktar);   // the contract's floor: the pool's fee and the collateral tax come off first
    await S.onayGerekirse({ cuzdan, token: S.TASARIM.usdc, miktar: t.ilan.fiyat, durum: yaz, etiket: "USDC" });
    const anahtarU = S.SURUM === 2 ? await (await import("../designs/teslim.js")).alimAnahtari(cuzdan, yaz) : undefined;
    await S.gonder({ cuzdan, data: S.veri.alUsdc(t.id, kanca, asgari, anahtarU), durum: yaz, aciklama: "Confirm the purchase (" + usd(t.ilan.fiyat) + " USDC swapped into $" + sym + " for the seller)" });
    yaz("Bought. The NFT and its usage rights are yours.", "ok");
  };
  kutu.append(el("div", { sinif: "ds-dugmeler" }, [
    eylem("Buy with $" + sym, async (yaz) => {
      await bagliHesap(cuzdan);
      const miktar = await S.tokenKarsiligi(t.token, t.ilan.fiyat);
      if (miktar == null) throw new Error("Buying opens when the price feed is live.");
      const azami = miktar * 10200n / 10000n;   // 2% room for the TWAP to move before it lands
      await S.onayGerekirse({ cuzdan, token: t.token, miktar: azami, durum: yaz, etiket: "$" + sym });
      const anahtar = S.SURUM === 2 ? await (await import("../designs/teslim.js")).alimAnahtari(cuzdan, yaz) : undefined;
      await S.gonder({ cuzdan, data: S.veri.al(t.id, azami, anahtar), durum: yaz, aciklama: "Confirm the purchase (at most " + jetonYaz(azami, j.ondalik) + " " + sym + ")" });
      yaz(S.SURUM === 2 ? "Bought. Your payment waits until the seller delivers the file key to you; this page then opens the file." : "Bought. The NFT and its usage rights are yours. Ask the seller to deliver the file key (your profile → key card).", "ok");
    }, "dugme dugme--marka", d),
    eylem("Buy with USDC", usdcIleAl, "dugme", d)
  ]), d);
  /* the same purchase paid with USDC from any of the other 11 chains (dollars to the buyer's Arc address first) */
  const U = await import("../designs/uzak-alim.js");
  kutu.append(U.uzakAlimKutusu({ cuzdan, fiyat6: t.ilan.fiyat, arcAlim: usdcIleAl, hesapIste: () => bagliHesap(cuzdan), eylem, durumSatiri,
    onKontrol: async () => { if (!(await (await S.nft()).kancaAyar(await S.havuzKancasi(t.token))).izinli) throw new Error("This designer token's pool hook is not allowed for USDC purchases yet, so paying from another chain is not open for it; buy with $" + sym + " on Arc."); } }));
  if (S.SURUM === 2) kutu.append(el("div", { sinif: "ds-cihaz", yazi: "Buyer protection: your payment is held by the contract until the seller delivers the file key to you" + (ay.teslimSuresi ? " (within " + Math.round(ay.teslimSuresi / 86400) + " days, or you are refunded)" : "") + "; you can say the key does not work before it is released." }));
  else if (ay.emanetAcik && Date.now() <= t.itirazBitis) kutu.append(el("div", { sinif: "ds-cihaz", yazi: "Buyer protection: during the challenge window your payment is held by the contract and goes back to you if the design is burned." }));
  return kutu;
}

function ilanKutusu({ cuzdan, t, ay }) {
  const fiyat = el("input", { sinif: "girdi", attr: { type: "number", min: "0.01", step: "0.01", placeholder: "Price in USDC", "aria-label": "Price in USDC" } });
  const d = durumSatiri();
  return el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: t.ilan ? "Your listing" : "List for resale" }), fiyat,
    el("div", { sinif: "ds-dugmeler" }, [
      eylem(t.ilan ? "Change price" : "List for sale", async (yaz) => {
        const v = String(fiyat.value || "").trim();
        if (!(Number(v) > 0)) throw new Error("Enter a price in USDC.");
        await S.gonder({ cuzdan, data: S.veri.ilanVer(t.id, parseUnits(v, 6)), durum: yaz, aciklama: "Confirm the listing at $" + v });
        yaz("Listed at $" + v + ".", "ok");
      }, "dugme dugme--marka", d),
      t.ilan ? eylem("Remove listing", async (yaz) => { await S.gonder({ cuzdan, data: S.veri.ilanKaldir(t.id), durum: yaz }); yaz("Listing removed.", "ok"); }, "dugme", d) : null
    ]), d,
    el("div", { sinif: "ds-cihaz", yazi: "Buyers pay the USDC price in the designer's token. On a resale, a royalty of " + (ay ? (ay.telifBps / 100) + "%" : "the admin-set share") + " goes to the designer." })]);
}

async function emanetKutusu({ cuzdan, t, j, sym }) {
  let e;
  try { e = await (await S.nft()).emanet(t.id, 0); } catch (x) { return el("div"); }
  const sayi = Number(e.sayi), islenen = Number(e.islenen);
  if (sayi === 0) return el("div");
  const bekleyen = sayi - islenen;
  const hazir = t.iptal || (Date.now() > t.itirazBitis && !t.itiraz);
  const d = durumSatiri();
  return el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Escrow" }),
    el("div", { yazi: bekleyen ? bekleyen + " payment" + (bekleyen > 1 ? "s" : "") + " held (" + sym + "). " + (t.iptal ? "The design was burned: they go back to the buyers." : hazir ? "The window is over: anyone can release them to the seller." : "Released after the challenge window, if no challenge is open.") : "All escrowed payments are settled." }),
    bekleyen && hazir ? eylem("Settle escrow", async (yaz) => { await bagliHesap(cuzdan); await S.gonder({ cuzdan, data: S.veri.emanetIsle(t.id, bekleyen), durum: yaz }); yaz("Settled.", "ok"); }, "dugme", d) : null, d]);
}

function itirazKutusu({ cuzdan, t, ay }) {
  const onceki = el("input", { sinif: "girdi", attr: { type: "number", min: "1", step: "1", placeholder: "Earlier design # (optional)", "aria-label": "Earlier design number" } });
  const kanit = el("input", { sinif: "girdi", attr: { type: "url", placeholder: "Evidence link (needed without an earlier design #)", "aria-label": "Evidence link" } });
  const d = durumSatiri();
  const bond = ay ? ay.itirazTeminati : 5_000_000n;
  return el("details", { sinif: "ds-kutu" }, [el("summary", { yazi: "Challenge this design as a copy" }),
    el("p", { sinif: "ds-lisans", yazi: "Post a " + usd(bond) + " USDC bond and point at the earlier design (or evidence). The admin (later the DAO) resolves it: upheld, this design is burned and you get the bond back plus its stake; rejected, the bond goes to the designer." }),
    onceki, kanit,
    eylem("Post bond and challenge", async (yaz) => {
      await bagliHesap(cuzdan);
      const o = Number(onceki.value || 0);
      const k = String(kanit.value || "").trim();
      if (!o && !k) throw new Error("Give an earlier design # or an evidence link.");
      if (o && o >= t.id) throw new Error("The earlier design must have a smaller number than #" + t.id + ".");
      await S.onayGerekirse({ cuzdan, token: S.TASARIM.usdc, miktar: bond, durum: yaz, etiket: "USDC (bond)" });
      await S.gonder({ cuzdan, data: S.veri.itirazEt(t.id, o, k), durum: yaz, aciklama: "Confirm the challenge" });
      yaz("Challenge posted.", "ok");
    }, "dugme", d), d]);
}

/* ---- the encrypted file: unlock (holder) and deliver (designer / seller) ---- */
function dosyaKutusu({ cuzdan, t, meta }) {
  const ap = meta.arcpulse || {};
  const ben = cuzdan.hesap();
  const d = durumSatiri();
  const zarfGir = el("textarea", { sinif: "girdi ds-mono", attr: { rows: "2", placeholder: "Paste a key envelope (apd-envelope:…) if the seller sent you one", "aria-label": "Key envelope" } });
  const kartGir = el("textarea", { sinif: "girdi ds-mono", attr: { rows: "2", placeholder: "Holder's key card (apd-key:…) — or leave empty to look it up on Irys", "aria-label": "Holder key card" } });
  const zarfCikti = el("textarea", { sinif: "girdi ds-mono", attr: { rows: "2", readonly: "", style: "display:none", "aria-label": "Envelope for the holder" } });
  if (!ap.file || !ap.file.uri) return el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "File" }), el("div", { sinif: "ds-cihaz", yazi: "This design's metadata names no encrypted file." })]);

  /** the file key, from the metadata (designer), Irys envelopes, or a pasted envelope */
  async function dosyaAnahtari(yaz) {
    if (S.SURUM === 2) return (await import("../designs/teslim.js")).dosyaAnahtariBul(cuzdan, t, meta, yaz);
    const Sf = await import("../designs/sifre.js");
    yaz("Sign to derive your unlock key (nothing is sent)…");
    const sk = await Sf.acmaAnahtari(cuzdan);
    const adaylar = [];
    if (zarfGir.value.trim()) adaylar.push(Sf.zarfCoz(zarfGir.value));
    for (const z of ap.keys || []) adaylar.push(z);
    const me = cuzdan.hesap().toLowerCase();
    try {
      const I = await import("../designs/irys.js");
      const bul = await I.ara([{ name: "Type", value: "key-envelope" }, { name: "File-Hash", value: t.dosyaHash.toLowerCase() }, { name: "To", value: me }]);
      for (const n of bul.slice(0, 5)) adaylar.push(await fetch(I.irysUrl(n.id)).then((r) => r.json()).catch(() => null));
    } catch (e) { /* Irys unreachable: the pasted envelope or metadata may still work */ }
    for (const z of adaylar.filter((z) => z && String(z.to).toLowerCase() === me)) {
      try { return await Sf.ac(z, sk, t.dosyaHash); } catch (e) { /* not for this key */ }
    }
    throw new Error("No key envelope for this wallet yet. Share your key card (My profile) with the seller and ask them to deliver the file key.");
  }

  return el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "File" }),
    el("p", { sinif: "ds-lisans", yazi: "The full file is encrypted; only the holder can open it, after the designer (or the seller on a resale) delivers the file key to the holder's unlock key. The opened file is checked against the exact hash on chain." }),
    esit(t.sahip, ben) && S.SURUM !== 2 ? zarfGir : null,
    el("div", { sinif: "ds-dugmeler" }, [
      esit(t.sahip, ben) ? eylem("Unlock and download", async (yaz) => {
        const Sf = await import("../designs/sifre.js");
        const { sha256Hex } = await import("../designs/parmakizi.js");
        const k = await dosyaAnahtari(yaz);
        yaz("Downloading the encrypted file…");
        const sifreli = await baytAl(ap.file.uri);
        const acik = await Sf.dosyaCoz(sifreli, k);
        if ((await sha256Hex(acik)).toLowerCase() !== t.dosyaHash.toLowerCase()) throw new Error("The decrypted file does not match the hash on chain; it is not this design.");
        const url = URL.createObjectURL(new Blob([acik], { type: ap.file.mime || "application/octet-stream" }));
        const a = el("a", { attr: { href: url, download: ap.file.name || ("design-" + t.id) } });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        yaz("Opened and verified against the on-chain hash.", "ok");
      }, "dugme dugme--marka", d) : null
    ]),
    esit(t.sahip, ben) || S.SURUM === 2 ? null : el("details", {}, [el("summary", { yazi: "Deliver the file key to the holder (designer or previous holder)" }),
      el("div", { sinif: "ds-form" }, [kartGir,
        el("div", { sinif: "ds-dugmeler" }, [
          eylem("Make envelope", async (yaz) => { zarfCikti.value = await teslimZarfi(yaz, false); zarfCikti.style.display = ""; yaz("Envelope ready below: send it to the holder, or publish it.", "ok"); }, "dugme", d),
          eylem("Publish envelope on Irys", async (yaz) => { await teslimZarfi(yaz, true); yaz("Delivered: the holder can now unlock the file.", "ok"); }, "dugme dugme--marka", d)]),
        zarfCikti])]),
    d]);

  async function teslimZarfi(yaz, yayinla) {
    await bagliHesap(cuzdan);
    const Sf = await import("../designs/sifre.js");
    const I = await import("../designs/irys.js");
    let kart = null;
    if (kartGir.value.trim()) kart = Sf.kartCoz(kartGir.value);
    else {
      yaz("Looking up the holder's key card on Irys…");
      const bul = await I.ara([{ name: "Type", value: "unlock-key" }, { name: "Wallet", value: t.sahip.toLowerCase() }]);
      for (const n of bul) { try { kart = Sf.kartDogrula(await fetch(I.irysUrl(n.id)).then((r) => r.json()), t.sahip); break; } catch (e) { /* skip forged or broken */ } }
      if (!kart) throw new Error("The holder has not published a key card. Ask them for it (My profile → Copy my key card) and paste it here.");
    }
    Sf.kartDogrula(kart, t.sahip);
    const k = await dosyaAnahtari(yaz);
    const zarf = await Sf.sar(k, kart.k, t.sahip, t.dosyaHash);
    if (!yayinla) return Sf.zarfMetni(zarf);
    await irysYukle(cuzdan, new TextEncoder().encode(JSON.stringify(zarf)), [{ name: "Content-Type", value: "application/json" }, { name: "Type", value: "key-envelope" },
      { name: "File-Hash", value: t.dosyaHash.toLowerCase() }, { name: "To", value: t.sahip.toLowerCase() }, { name: "Design-Id", value: String(t.id) }], yaz);
    return Sf.zarfMetni(zarf);
  }
}

/* ================================================================ publish */
/* Commit-reveal (TasarimNFT2): the pending commitment's salt lives only in this module and in this tab's
   sessionStorage (so a reload in the same tab can still reveal it), keyed by wallet + file hash. Nothing
   else is kept, and it is removed as soon as the reveal lands or the commitment expires. */
const TAAHHUT_ANAHTAR = "arcpulse-designs-taahhut:";
const _taahhutler = new Map();
const taahhutKey = (ben, dosyaHash) => String(ben).toLowerCase() + ":" + String(dosyaHash).toLowerCase();
function taahhutAl(ben, dosyaHash) {
  const k = taahhutKey(ben, dosyaHash);
  if (_taahhutler.has(k)) return _taahhutler.get(k);
  try { const j = sessionStorage.getItem(TAAHHUT_ANAHTAR + k); if (j) { const o = JSON.parse(j); _taahhutler.set(k, o); return o; } } catch (e) { /* storage may be blocked */ }
  return null;
}
function taahhutKoy(ben, dosyaHash, o) {
  const k = taahhutKey(ben, dosyaHash);
  if (o) _taahhutler.set(k, o); else _taahhutler.delete(k);
  try { if (o) sessionStorage.setItem(TAAHHUT_ANAHTAR + k, JSON.stringify(o)); else sessionStorage.removeItem(TAAHHUT_ANAHTAR + k); } catch (e) { /* storage may be blocked: memory only */ }
}
/** The pending commitment for this wallet + file if Arc still holds it and it can still be revealed: {tuz, taahhut, blok, son}. */
async function gecerliTaahhut(ben, parmak) {
  const o = taahhutAl(ben, parmak.dosyaHash);
  if (!o || !o.tuz) return null;
  try {
    const c = await S.nft();
    const taahhut = S.taahhutHesapla(ben, parmak.dosyaHash, parmak.algiHash, o.tuz);
    const [blok, pencere, simdi] = await Promise.all([c.taahhutOf(ben, taahhut), c.taahhutBlok(), (await S.arc()).getBlockNumber()]);
    if (blok === 0n || BigInt(simdi) > blok + pencere) { taahhutKoy(ben, parmak.dosyaHash, null); return null; }
    return { tuz: o.tuz, taahhut, blok: Number(blok), son: Number(blok + pencere) };
  } catch (e) { return null; }
}

async function yayinlaSayfasi({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(ust("Publish a design", "One file, one NFT: a 1-of-1 with full usage rights for whoever holds it", "publish"));
  const ay = await S.ayarlar().catch(() => null);
  if (ay && ay.durduruldu) { kap.append(not("Designs is paused by the admin right now; publishing is closed.", "uyari")); return kap; }
  kap.append(not("Cost: " + (ay ? usd(ay.ucret) : "$0.20") + " USDC publishing fee" + (ay && ay.teminat > 0n ? " + " + usd(ay.teminat) + " refundable stake" : "") + " on Arc, plus storage on Irys paid from your own wallet in Arc USDC (shown before you pay) unless you upload the files yourself. ARC PULSE keeps no cut and stores nothing.", "bilgi"));

  const ben = cuzdan.hesap();
  if (!ben) {
    const bd = eylem("Connect wallet", async () => { await cuzdan.bagla(); }, "dugme dugme--marka");
    kap.append(bos("Connect the designer's wallet", "Publishing needs the wallet that founded your designer token.", el("div", {}, [bd, bd._durum])));
    return kap;
  }

  /* step 1: the designer token */
  const jetonSec = el("select", { sinif: "girdi", attr: { "aria-label": "Designer token" } }, [el("option", { yazi: "Reading your designer tokens…" })]);
  const adim1 = el("div", { sinif: "ds-adim ds-adim--etkin" }, [el("h3", { yazi: "1. Your designer token" }), jetonSec]);
  kap.append(adim1);
  let jetonlar = [];
  try { jetonlar = await tasarimciJetonlari(ben); } catch (e) { /* shown below */ }
  temizle(jetonSec);
  if (!jetonlar.length) {
    const { turSec } = await import("../urun.js");
    adim1.append(bos("No designer token for this wallet",
      "Launch your own token (same rules as every launch) and save its type as Designer (8) in the type record; or, if you already launched one, set its type from the token's page. Then come back here.",
      el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" }, on: { click: () => turSec(8) }, yazi: "Create a designer token" })));
    jetonSec.remove();
    return kap;
  }
  for (const x of jetonlar) jetonSec.append(el("option", { attr: { value: x.token }, yazi: "$" + (x.sembol || "?") + " — " + (x.ad || "") + " (" + kisa(x.token) + ")" }));
  const fiyatNotu = el("div", { sinif: "ds-durum" });
  adim1.append(fiyatNotu);
  const fiyatBak = async () => {
    durumYaz(fiyatNotu, "Checking the price feed for this token…");
    const q = await S.tokenKarsiligi(jetonSec.value, 1_000_000n);
    durumYaz(fiyatNotu, q != null ? "Buyers can pay in this token now ($1 ≈ " + jetonYaz(q, 18) + " at the time-weighted price)."
      : "You can publish and list now. Buying opens when the price feed is live for this token (its pool needs a time-weighted price on PulseHook6; tokens launched before v9 trade in an older pool).", q != null ? "ok" : null);
  };
  jetonSec.addEventListener("change", fiyatBak);
  fiyatBak();

  /* step 2: the file and its fingerprints */
  const dosyaGir = el("input", { sinif: "girdi", attr: { type: "file", "aria-label": "Design file", accept: "image/*,.svg,.stl,.obj,.3mf,.pdf,.zip,.ai,.psd,.eps" } });
  const onizGir = el("input", { sinif: "girdi", attr: { type: "file", accept: "image/*", "aria-label": "Preview image" } });
  const onizEtiket = el("label", { attr: { style: "display:none" } }, ["Preview image (a render or photo; shown publicly, watermarked)", onizGir]);
  const parmakYazi = el("div", { sinif: "ds-durum" });
  const benzerYazi = el("div", { sinif: "ds-benzer", attr: { role: "status", "aria-live": "polite" } });
  const onizResim = el("div", { sinif: "ds-detay__resim", attr: { style: "max-width:320px;display:none" } });
  kap.append(el("div", { sinif: "ds-adim" }, [el("h3", { yazi: "2. The file" }),
    el("label", {}, ["Design file (image, SVG, STL/OBJ/3MF, PDF, …). It is encrypted in your browser before upload; only the holder can open it.", dosyaGir]),
    onizEtiket, onizResim, parmakYazi, benzerYazi]));

  /* step 3: details */
  const adGir = el("input", { sinif: "girdi", attr: { type: "text", maxlength: "120", placeholder: "Title", "aria-label": "Title" } });
  const acikGir = el("textarea", { sinif: "girdi", attr: { maxlength: "4000", placeholder: "Description (public)", "aria-label": "Description" } });
  const fiyatGir = el("input", { sinif: "girdi", attr: { type: "number", min: "0", step: "0.01", placeholder: "Price in USDC (0 = not for sale yet)", "aria-label": "Price in USDC" } });
  const katSec = el("select", { sinif: "girdi", attr: { "aria-label": "Category" } }, KATEGORILER.map(([k, ad]) => el("option", { attr: { value: k, ...(k === "diger" ? { selected: "" } : {}) }, yazi: ad })));
  const ekGir = el("input", { sinif: "girdi", attr: { type: "file", accept: "image/*", multiple: "", "aria-label": "More preview images (up to " + EK_GORSEL_AZAMI + ")" } });
  const ekOniz = el("div", { sinif: "ds-ek-oniz", attr: { style: "display:flex;gap:8px;flex-wrap:wrap" } });
  const ekYazi = el("div", { sinif: "ds-durum" });
  let ekBloblar = [];   // watermarked extra previews, in the order chosen
  ekGir.addEventListener("change", async () => {
    const fl = [...(ekGir.files || [])];
    ekBloblar = []; temizle(ekOniz);
    if (fl.length > EK_GORSEL_AZAMI) durumYaz(ekYazi, "At most " + EK_GORSEL_AZAMI + " more images; the first " + EK_GORSEL_AZAMI + " are used.");
    else durumYaz(ekYazi, "");
    const P = await import("../designs/parmakizi.js");
    try {
      for (const f of fl.slice(0, EK_GORSEL_AZAMI)) {
        const b = await P.onizlemeYap(await P.gorselYukle(f));
        ekBloblar.push(b);
        ekOniz.append(el("img", { attr: { src: URL.createObjectURL(b), alt: "Extra preview " + ekBloblar.length + " (watermarked)", style: "width:88px;height:88px;object-fit:cover;border-radius:10px" } }));
      }
      if (ekBloblar.length) durumYaz(ekYazi, ekBloblar.length + " more preview" + (ekBloblar.length > 1 ? "s" : "") + " ready (watermarked like the main one, shown publicly).", "ok");
      depoTahmin();
    } catch (e) { ekBloblar = []; temizle(ekOniz); durumYaz(ekYazi, "Could not read an image: " + ((e && e.message) || e), "hata"); }
  });
  kap.append(el("div", { sinif: "ds-adim" }, [el("h3", { yazi: "3. Details" }), el("div", { sinif: "ds-form" }, [adGir, acikGir, fiyatGir,
    el("label", {}, ["Category", katSec]),
    el("label", {}, ["More preview images (optional, up to " + EK_GORSEL_AZAMI + ": other views, mock-ups). Public and watermarked; the file itself stays encrypted.", ekGir]),
    ekOniz, ekYazi])]));

  /* step 4: storage */
  const yolIrys = el("input", { attr: { type: "radio", name: "ds-depo", value: "irys", checked: "" } });
  const yolEth = el("input", { attr: { type: "radio", name: "ds-depo", value: "irys-eth" } });
  const depoMaliyet = el("div", { sinif: "ds-durum" });
  let depoUsdc = null;   // the storage cost shown, in USDC
  const yolKendi = el("input", { attr: { type: "radio", name: "ds-depo", value: "kendi" } });
  const uriGir = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "Metadata URI (ipfs://…, ar://… or https://gateway.irys.xyz/…)", "aria-label": "Metadata URI" } });
  const kendiKutu = el("div", { sinif: "ds-form", attr: { style: "display:none" } });
  const sifreliIndir = el("div", { sinif: "ds-dugmeler" });
  const dosyaUriGir = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "URI of the ENCRYPTED file you uploaded", "aria-label": "Encrypted file URI" } });
  const onizUriGir = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "URI of the preview image you uploaded", "aria-label": "Preview URI" } });
  const ekUriGir = el("textarea", { sinif: "girdi", attr: { rows: "2", placeholder: "URIs of the extra previews you uploaded (optional, one per line, up to " + EK_GORSEL_AZAMI + ")", "aria-label": "Extra preview URIs" } });
  const metaIndir = el("div", { sinif: "ds-dugmeler" });
  kendiKutu.append(el("p", { sinif: "ds-lisans", yazi: "Upload with any permanent storage you use (IPFS pinning, Arweave). 1) Download the encrypted file and the preview and upload both. 2) Paste their URIs and download the metadata JSON. 3) Upload it and paste its URI. The full file is never uploaded unencrypted." }),
    sifreliIndir, dosyaUriGir, onizUriGir, ekUriGir, metaIndir, uriGir);
  const depoDegisti = () => { kendiKutu.style.display = yolKendi.checked ? "" : "none"; };
  yolIrys.addEventListener("change", depoDegisti); yolKendi.addEventListener("change", depoDegisti); yolEth.addEventListener("change", depoDegisti);
  kap.append(el("div", { sinif: "ds-adim" }, [el("h3", { yazi: "4. Storage" }),
    el("label", { attr: { style: "display:flex;gap:8px;align-items:flex-start" } }, [yolIrys, el("span", { yazi: "Upload to Irys from this page, paid from your Arc USDC (relay.link turns it into the storage fee; no ETH, no account, no API key)." })]),
    depoMaliyet,
    el("label", { attr: { style: "display:flex;gap:8px;align-items:flex-start" } }, [yolEth, el("span", { yazi: "Upload to Irys, paid with ETH I already have on Base." })]),
    el("label", { attr: { style: "display:flex;gap:8px;align-items:flex-start" } }, [yolKendi, el("span", { yazi: "I upload the files myself and paste the URIs." })]),
    kendiKutu]));

  /* step 5: publish */
  const d = durumSatiri();
  const durum = (m, tur) => durumYaz(d, m, tur);
  let hazir = null;   // {dosya, parmak, onizBlob, sifreli, anahtar, zarf}

  async function hazirla() {
    const f = dosyaGir.files && dosyaGir.files[0];
    if (!f) return;
    hazir = null;
    temizle(sifreliIndir); temizle(metaIndir); temizle(benzerYazi);
    const P = await import("../designs/parmakizi.js");
    durumYaz(parmakYazi, "Computing fingerprints in your browser…");
    try {
      const parmak = await P.parmakIzi(f);
      durumYaz(parmakYazi, "Exact hash " + parmak.dosyaHash.slice(0, 18) + "… · " + parmak.aciklama + ". Checking Arc…");
      const k = await S.kayitliMi(parmak.dosyaHash, parmak.algiHash);
      /* a commitment made from this tab for this file: say so (a design published after it is a copier's and is burned on reveal) */
      const bekleyenT = S.TAAHHUT_VAR && cuzdan.hesap() ? await gecerliTaahhut(cuzdan.hesap(), parmak) : null;
      if (bekleyenT) durumYaz(d, "Step 1 of 2 is already done for this file (commitment in Arc block " + bekleyenT.blok + ", valid until block " + bekleyenT.son + "). Press Publish to finish with step 2.", "ok");
      else if (S.TAAHHUT_VAR && cuzdan.hesap()) kayipTaahhutBak(cuzdan.hesap(), parmak.dosyaHash);
      if ((k.dosya || k.algi) && !bekleyenT) { durumYaz(parmakYazi, "This design is already published (design #" + (k.dosya || k.algi) + (k.dosya ? ", the same file" : ", the same fingerprint") + ").", "hata"); return; }
      benzerUyar(parmak.algiHash);
      let onizBlob = null;
      if (parmak.img) onizBlob = await P.onizlemeYap(parmak.img);
      onizEtiket.style.display = parmak.img ? "none" : "";
      if (!parmak.img && onizGir.files && onizGir.files[0]) onizBlob = await P.onizlemeYap(await P.gorselYukle(onizGir.files[0]));
      temizle(onizResim);
      if (onizBlob) { onizResim.style.display = ""; onizResim.append(el("img", { attr: { src: URL.createObjectURL(onizBlob), alt: "Public preview (watermarked)" } })); } else onizResim.style.display = "none";
      if (!adGir.value) adGir.value = f.name.replace(/\.[^.]+$/, "").slice(0, 120);
      const Sf = await import("../designs/sifre.js");
      const { blob: sifreli, anahtar } = await Sf.dosyaSifrele(await f.arrayBuffer());
      hazir = { dosya: f, parmak, onizBlob, sifreli, anahtar };
      depoTahmin();
      durumYaz(parmakYazi, "Exact hash " + parmak.dosyaHash.slice(0, 18) + "… · " + parmak.aciklama + " · not published yet ✓ · encrypted in your browser (" + Math.ceil(sifreli.size / 1024) + " KB).", "ok");
      const indir = (blob, ad) => { const a = el("a", { attr: { href: URL.createObjectURL(blob), download: ad } }); document.body.append(a); a.click(); a.remove(); };
      sifreliIndir.append(dugme("Download encrypted file", () => indir(sifreli, f.name + ".apd")), onizBlob ? dugme("Download preview", () => indir(onizBlob, "preview.jpg")) : null,
        dugme("Download extra previews", () => { ekBloblar.forEach((b, i) => indir(b, "preview-" + (i + 2) + ".jpg")); }));
      const metaDugme = eylem("Download metadata JSON", async (yaz) => {
        const ekUriler = ekUriGir.value.split(/\s+/).map((x) => x.trim()).filter(Boolean);
        for (const u of ekUriler) if (!uriGecerli(u)) throw new Error("Not a storage URI: " + u.slice(0, 60));
        const m = await metaHazirla({ dosyaUri: dosyaUriGir.value.trim(), onizUri: onizUriGir.value.trim(), ekUriler, yaz });
        indir(new Blob([JSON.stringify(m, null, 2)], { type: "application/json" }), "metadata.json");
        yaz("Upload metadata.json and paste its URI below.", "ok");
      }, "dugme");
      metaIndir.append(metaDugme, metaDugme._durum);
    } catch (e) { durumYaz(parmakYazi, "Could not read the file: " + ((e && e.message) || e), "hata"); }
  }
  /* near copies: a published image whose fingerprint is a few bits away (a warning; publishing stays allowed) */
  async function benzerUyar(algiHash) {
    try {
      const B = await import("../designs/benzer.js");
      const l = B.benzerler(algiHash, await S.yayinlar());
      temizle(benzerYazi);
      if (!l.length) return;
      benzerYazi.append(el("div", { sinif: "not not--uyari" }, [el("div", { sinif: "yigin" }, [
        el("div", { yazi: "This image looks very similar to " + (l.length === 1 ? "a published design" : l.length + " published designs") + ". If it is not your own earlier work, it may be challenged as a copy and taken down. You can still publish." }),
        el("div", { sinif: "ds-dugmeler" }, l.slice(0, 6).map((x) => el("a", { attr: { href: "#/designs/d/" + x.id, target: "_blank", rel: "noopener" }, yazi: "Design #" + x.id + " (" + (x.mesafe === 0 ? "same fingerprint" : x.mesafe + " of 64 bits differ") + ") ↗" })))])]));
    } catch (e) { /* a hint only */ }
  }
  const ekBoyut = () => ekBloblar.reduce((a, b) => a + b.size, 0);
  async function depoTahmin() {
    depoUsdc = null;
    if (!hazir) return;
    const bayt = hazir.sifreli.size + (hazir.onizBlob ? hazir.onizBlob.size : 0) + ekBoyut() + 16384;
    durumYaz(depoMaliyet, "Pricing the storage…");
    try {
      const I = await import("../designs/irys.js");
      const { yatir } = await irysIhtiyac(ben, bayt);
      if (!yatir) { depoUsdc = 0; durumYaz(depoMaliyet, "Storage: your Irys balance already covers these " + Math.ceil(bayt / 1024) + " KB.", "ok"); return; }
      const t = await I.usdcTeklifi(ben, yatir);
      depoUsdc = t ? t.usdc : 0;
      durumYaz(depoMaliyet, t ? "Storage for " + Math.ceil(bayt / 1024) + " KB: ≈ " + t.usdc.toFixed(4) + " USDC from your Arc balance (relay.link fee included), then one small transfer on Base that this pays for."
        : "Storage: the ETH already on your Base address covers it; one transfer on Base.", "ok");
    } catch (e) { durumYaz(depoMaliyet, "Could not price the storage now: " + ((e && e.message) || e), "hata"); }
  }
  dosyaGir.addEventListener("change", hazirla);
  onizGir.addEventListener("change", hazirla);

  async function metaHazirla({ dosyaUri, onizUri, ekUriler = [], yaz }) {
    if (!hazir) throw new Error("Choose the design file first.");
    if (!uriGecerli(dosyaUri)) throw new Error("Paste the encrypted file's URI (ipfs://, ar:// or https://).");
    if (!hazir.zarf) {
      const Sf = await import("../designs/sifre.js");
      yaz("Sign to derive your unlock key, so you can always open your own file (nothing is sent)…");
      const sk = await Sf.acmaAnahtari(cuzdan);
      hazir.zarf = await Sf.sar(hazir.anahtar, sk.compressedPublicKey, cuzdan.hesap(), hazir.parmak.dosyaHash);
    }
    const P = await import("../designs/parmakizi.js");
    return metaYap({
      ad: adGir.value.trim() || hazir.dosya.name, aciklama: acikGir.value.trim(), onizleme: onizUri || undefined,
      lisans: (ay && ay.lisans) || S.LISANS_YEDEK, lisansUri: "https://arcpulse.app/arc-launchpad/docs/designs/#/license",
      tasarimci: cuzdan.hesap().toLowerCase(), token: jetonSec.value,
      dosya: { uri: dosyaUri, name: hazir.dosya.name, mime: hazir.dosya.type || "application/octet-stream", size: hazir.dosya.size, sha256: hazir.parmak.dosyaHash, encryption: "AES-256-GCM, APD1 header; key wrapped per holder (ECIES secp256k1)" },
      parmak: { algiHash: hazir.parmak.algiHash, method: hazir.parmak.aciklama },
      anahtarlar: [hazir.zarf],
      tur: hazir.parmak.tur === P.TUR.GORSEL ? "Image" : hazir.parmak.tur === P.TUR.UCBOYUT ? "3D model" : "File",
      kategori: katSec.value, ekGorseller: ekUriler.slice(0, EK_GORSEL_AZAMI)
    });
  }

  /* a commitment this wallet made recently whose salt is gone (the page was closed between the steps): say what happens */
  async function kayipTaahhutBak(adres, dosyaHash) {
    try {
      const c = await S.nft(), p = await S.arc();
      const [son, pencere] = await Promise.all([p.getBlockNumber(), c.taahhutBlok()]);
      const loglar = await p.getLogs({ address: S.TASARIM.adres, topics: [S.ifc.getEvent("Taahhut").topicHash, zeroPadValue(adres, 32)],
        fromBlock: Math.max(0, son - Number(pencere)), toBlock: son });
      /* still on chain (a revealed commitment is deleted), and not one this tab can finish */
      const acik = await Promise.all(loglar.map((l) => c.taahhutOf(adres, S.ifc.parseLog(l).args.taahhut).then((b) => b !== 0n).catch(() => false)));
      if (acik.some(Boolean) && !taahhutAl(adres, dosyaHash))
        durumYaz(d, "An earlier step 1 from this wallet was not finished, and its secret was kept only in the page that was closed. Nothing is lost: pressing Publish simply does step 1 again (a few cents of gas), then step 2.");
    } catch (e) { /* a hint only */ }
  }

  /* how to publish: two steps (default) or one */
  const ikiAdim = el("input", { attr: { type: "radio", name: "ds-yayin", value: "iki", checked: "" } });
  const hizli = el("input", { attr: { type: "radio", name: "ds-yayin", value: "hizli" } });
  const yolSecim = S.TAAHHUT_VAR ? el("div", { sinif: "yigin" }, [
    el("label", { attr: { style: "display:flex;gap:8px;align-items:flex-start" } }, [ikiAdim, el("span", { yazi: "Protected publish (two transactions): the first commits to your file without showing its fingerprints, the second, a few seconds later, publishes it. This keeps the design from being copied while the transaction is pending." })]),
    el("label", { attr: { style: "display:flex;gap:8px;align-items:flex-start" } }, [hizli, el("span", { yazi: "Fast publish (one transaction): the file's fingerprints are visible in the pending transaction until it confirms." })]),
  ]) : el("span");

  const gonderDugme = eylem("Publish", async (yaz) => {
    if (!hazir) throw new Error("Choose the design file first (and wait for the fingerprint check).");
    if (!hazir.onizBlob && !yolKendi.checked) throw new Error("Choose a preview image for this file type.");
    const fiyatStr = String(fiyatGir.value || "0").trim();
    if (!(Number(fiyatStr) >= 0)) throw new Error("The price must be a number of USDC (0 = not listed).");
    const fiyat = parseUnits(fiyatStr || "0", 6);
    const token = jetonSec.value;
    const ben2 = await bagliHesap(cuzdan);
    const c = await S.nft();
    if (!(await c.yayinlayabilir(ben2, token))) throw new Error(S.hataAcikla({ revert: { name: "TasarimciDegil" } }));
    const korumali = S.TAAHHUT_VAR && ikiAdim.checked;
    let t = korumali ? await gecerliTaahhut(ben2, hazir.parmak) : null;
    const k = await S.kayitliMi(hazir.parmak.dosyaHash, hazir.parmak.algiHash);
    /* with a commitment pending, a copy published after it is burned on reveal: the contract decides (simulated before sending) */
    if ((k.dosya || k.algi) && !t) throw new Error("This design is already published (design #" + (k.dosya || k.algi) + ").");

    /* step 1 of 2: commit before anything is uploaded (the uploads then fill the wait for a later block) */
    if (korumali && !t) {
      const tuz = S.tuzUret();
      const taahhut = S.taahhutHesapla(ben2, hazir.parmak.dosyaHash, hazir.parmak.algiHash, tuz);
      taahhutKoy(ben2, hazir.parmak.dosyaHash, { tuz });
      const { m: mt } = await S.gonder({ cuzdan, data: S.veri.taahhutEt(taahhut), durum: yaz, aciklama: "Step 1 of 2: confirm the commitment (it hides the file's fingerprints; no fee)" });
      const pencere = await c.taahhutBlok();
      t = { tuz, taahhut, blok: Number(mt.blockNumber), son: Number(BigInt(mt.blockNumber) + pencere) };
      yaz("Step 1 of 2 done (Arc block " + t.blok + "). Step 2 must follow by block " + t.son + "; if this page closes before it, step 1 is simply done again.", "ok");
    }

    let uri;
    if (yolKendi.checked) {
      uri = uriGir.value.trim();
      if (!uriGecerli(uri)) throw new Error("Paste the metadata URI (ipfs://, ar:// or https://, at most 512 bytes).");
    } else {
      const I = await import("../designs/irys.js");
      const { imzala } = await import("../designs/imza.js");
      const toplam = hazir.sifreli.size + hazir.onizBlob.size + ekBoyut() + 16384;
      yaz("Sign once so Irys can read your wallet's public key (sends nothing)…");
      const imzaci = await I.cuzdanImzacisi(cuzdan, (m) => imzala(cuzdan, m));
      await irysFonla(cuzdan, toplam, yaz, yolEth.checked ? "eth" : "usdc", depoUsdc || undefined);
      yaz("Uploading the preview (sign in your wallet)…");
      const on = await I.yukle(new Uint8Array(await hazir.onizBlob.arrayBuffer()), [{ name: "Content-Type", value: "image/jpeg" }, { name: "Type", value: "preview" }, { name: "File-Hash", value: hazir.parmak.dosyaHash }], imzaci);
      yaz("Uploading the encrypted file (sign in your wallet)…");
      const df = await I.yukle(new Uint8Array(await hazir.sifreli.arrayBuffer()), [{ name: "Content-Type", value: "application/octet-stream" }, { name: "Type", value: "file" }, { name: "File-Hash", value: hazir.parmak.dosyaHash }], imzaci);
      const ekUriler = [];
      for (const [i, b] of ekBloblar.entries()) {
        yaz("Uploading extra preview " + (i + 1) + " of " + ekBloblar.length + " (sign in your wallet)…");
        ekUriler.push((await I.yukle(new Uint8Array(await b.arrayBuffer()), [{ name: "Content-Type", value: "image/jpeg" }, { name: "Type", value: "preview" }, { name: "File-Hash", value: hazir.parmak.dosyaHash }], imzaci)).url);
      }
      const m = await metaHazirla({ dosyaUri: df.url, onizUri: on.url, ekUriler, yaz });
      yaz("Uploading the metadata (sign in your wallet)…");
      const mu = await I.yukle(new TextEncoder().encode(JSON.stringify(m)), [{ name: "Content-Type", value: "application/json" }, { name: "Type", value: "metadata" }, { name: "File-Hash", value: hazir.parmak.dosyaHash }], imzaci);
      uri = mu.url;
    }
    const gerek = ay ? ay.ucret + ay.teminat : 200_000n;
    await S.onayGerekirse({ cuzdan, token: S.TASARIM.usdc, miktar: gerek, durum: yaz, etiket: usd(gerek) + " USDC (publishing fee)" });
    const anahtarT = (await import("../designs/sifre.js")).anahtarTaahhudu(hazir.anahtar);
    let m;
    if (korumali) {
      /* step 2 of 2: in a block after the commitment and within taahhutBlok blocks of it */
      const p = await S.arc();
      for (let i = 0; i < 40 && (await p.getBlockNumber()) <= t.blok; i++) { yaz("Waiting for the next Arc block before step 2…"); await new Promise((r) => setTimeout(r, 1000)); }
      if ((await p.getBlockNumber()) > t.son) {
        taahhutKoy(ben2, hazir.parmak.dosyaHash, null);
        throw new Error("The step 1 commitment expired (step 2 must follow within " + (t.son - t.blok) + " blocks). Press Publish again: step 1 is redone, then step 2.");
      }
      ({ m } = await S.gonder({ cuzdan, data: S.veri.yayinlaAcik(token, hazir.parmak.dosyaHash, hazir.parmak.algiHash, uri, fiyat, anahtarT, t.tuz), durum: yaz, aciklama: "Step 2 of 2: confirm publishing (" + usd(gerek) + " USDC fee)" }));
      taahhutKoy(ben2, hazir.parmak.dosyaHash, null);
    } else {
      ({ m } = await S.gonder({ cuzdan, data: S.veri.yayinla(token, hazir.parmak.dosyaHash, hazir.parmak.algiHash, uri, fiyat, anahtarT), durum: yaz, aciklama: "Confirm publishing (" + usd(gerek) + " USDC fee)" }));
    }
    let id = null;
    for (const l of m.logs || []) { try { const p = S.ifc.parseLog(l); if (p && p.name === "Yayinlandi") id = Number(p.args.id); } catch (e) { /* other contract */ } }
    yaz("Published" + (id ? " as design #" + id : "") + ".", "ok");
    if (id) setTimeout(() => { location.hash = "#/designs/d/" + id; }, 1200);
  }, "dugme dugme--marka", d);

  kap.append(el("div", { sinif: "ds-adim" }, [el("h3", { yazi: "5. Publish" }),
    el("p", { sinif: "ds-lisans", yazi: "Your wallet will ask you to: sign to read your public key and sign each upload (Irys), sign once to derive your unlock key, approve the USDC fee, and send the publish transaction on Arc. You can check every step in the wallet before approving." }),
    yolSecim,
    S.TAAHHUT_VAR ? el("p", { sinif: "ds-lisans", yazi: "The two-step publish protects the design from being copied while the transaction is pending: anyone who copies it after step 1 loses the copy to you." }) : el("span"),
    gonderDugme, d,
    el("div", { sinif: "ds-cihaz", yazi: "By publishing you confirm you own this design. Copies can be challenged for " + (ay ? Math.round(ay.itirazSuresi / 86400) : 3) + " days and taken down." })]));
  return kap;
}

/* ================================================================ license */
async function lisans() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(ust("Designs license", "The terms every ARC PULSE design carries, on chain", null));
  const ay = await S.ayarlar().catch(() => null);
  kap.append(el("div", { sinif: "ds-kutu" }, [
    el("h3", { yazi: "License (TasarimNFT.LISANS)" }),
    el("p", { attr: { style: "font-size:var(--boy-l);line-height:1.6" }, yazi: (ay && ay.lisans) || S.LISANS_YEDEK }),
    el("p", { sinif: "ds-lisans", yazi: "This text is a constant in the TasarimNFT contract on Arc (" + S.TASARIM.adres + ") and cannot be changed. Each design's metadata carries it as license_text with license pointing to this page. Usage rights follow the NFT: whoever holds it holds all rights, commercial use included; after a transfer the previous holder keeps none." }),
    el("p", { sinif: "ds-lisans", yazi: "Copies: the same exact file or the same perceptual fingerprint cannot be published twice. Near copies can be challenged with a USDC bond during the challenge window; the admin (later the DAO) resolves challenges and can take a design down for a legal notice. Escrow protects buyers during the window." }),
    el("a", { attr: { href: S.TASARIM.kasif + "/address/" + S.TASARIM.adres, target: "_blank", rel: "noopener" }, yazi: "The contract on the Arc explorer ↗" })
  ]));
  return kap;
}

/* ================================================================ router */
export async function ciz(ctx) {
  stilYukle();
  const alt = (ctx.param.get("alt") || "").replace(/\/+$/, "");
  if (S.SURUM === 2 && ctx.cuzdan.hesap()) {
    const sayfa = await sayfaCiz(ctx, alt);
    const bant = await (await import("../designs/teslim.js")).teslimBandi(ctx.cuzdan).catch(() => null);
    if (bant) sayfa.prepend(bant);
    return sayfa;
  }
  return sayfaCiz(ctx, alt);
}

async function sayfaCiz(ctx, alt) {
  try {
    if (alt === "" || alt === "feed") return await akis(ctx);
    if (alt === "explore") return await kesfet(ctx);
    if (alt === "publish") return await yayinlaSayfasi(ctx);
    if (alt === "license") return await lisans();
    if (alt === "me") {
      const ben = ctx.cuzdan.hesap();
      if (!ben) { const k = el("div", { sinif: "yigin" }); const bd = eylem("Connect wallet", async () => { await ctx.cuzdan.bagla(); }); k.append(ust("My profile", null, "me"), bos("Connect your wallet", "Your profile is your wallet: designs you created and hold.", el("div", {}, [bd, bd._durum]))); return k; }
      return await profil(ctx, ben);
    }
    let m = alt.match(/^d\/(\d+)$/);
    if (m) return await detay(ctx, Number(m[1]));
    m = alt.match(/^u\/(0x[0-9a-fA-F]{40})$/);
    if (m) return await profil(ctx, m[1]);
    return hata("No such page", "#/designs/" + alt);
  } catch (e) {
    const k = el("div", { sinif: "yigin" });
    k.append(ust("Designs", null, alt), hata("Could not read Designs from Arc", (e && e.message) || String(e)));
    return k;
  }
}
