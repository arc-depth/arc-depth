/* ===========================================================================
 * designs/js/profil.js — a profile, Instagram style
 *
 * Avatar, @handle and name, bio, links, follower / following counts (from
 * ProfilKaydi), Follow and Message, the designer token(s) with their trade
 * page in the main app, and the grid of works below with tabs Works /
 * Collected (designs the wallet holds now). The owner gets "Edit profile"
 * (ProfilKaydi.profilYaz + kullaniciAdiAl; the avatar uploaded to Irys
 * paid from Arc USDC through the main app's irys.js flow, or a pasted
 * link) and the unlock-key box (teslim.js) needed to receive files and
 * messages, and for other wallets a Report button (yorumlar.js). A
 * profile the admin hid (gizle) shows nothing.
 * =========================================================================== */
import { formatUnits } from "../../vendor/ethers.min.js";
import { el, temizle, S, SO, ANA, kisa, esit, adresMi, avatar, isim, karo, takipDugmesi, eylem, durumSatiri, durumYaz, bosKutu, hesapIste, tasarimciJetonlari, gorselUrl, yukleniyor } from "./ortak.js";
import { bildirDugmesi } from "./yorumlar.js";
import { PROFIL } from "./yorum.js";

export function benimBos({ cuzdan }) {
  const b = eylem("Connect wallet", async () => { await hesapIste(); }, "dugme dugme--marka");
  return bosKutu("Your profile is your wallet", "Connect to see the designs you created and collected, edit your profile and register your unlock key.", el("div", {}, [b, b._durum]));
}

export async function profilSayfasi({ cuzdan }, adres) {
  if (!adresMi(adres)) return bosKutu("Not a wallet address", adres);
  const ben = cuzdan.hesap();
  const benim = esit(adres, ben);
  const kap = el("div", { sinif: "dz-profil-sayfa" });
  const [p, liste, begeniler] = await Promise.all([SO.profilOku(adres, true).catch(() => SO.profilOku(adres)), S.yayinlar(), SO.begeniSayilari().catch(() => new Map())]);
  if (p.gizli && !benim) {
    kap.append(bosKutu("This profile is hidden", "The profile and its works were hidden by the moderator after a report. The records stay on Arc."));
    return kap;
  }
  const yaptigi = liste.filter((t) => esit(t.tasarimci, adres));
  const durumlar = new Map((await S.durumlar(liste.slice(0, 300).map((t) => t.id))).map((d) => [d.id, d]));
  const tuttugu = liste.filter((t) => durumlar.get(t.id) && esit(durumlar.get(t.id).sahip, adres));

  /* ---- header ---- */
  const sayi = (n, ad, f) => el(f ? "button" : "span", { sinif: "dz-sayi", attr: f ? { type: "button" } : {}, on: f ? { click: f } : {} }, [el("b", { yazi: n == null ? "—" : String(n) }), " " + ad]);
  const basliklar = el("div", { sinif: "dz-profil__isimler" }, [
    el("h1", { sinif: "dz-profil__tutamac", yazi: p.kullaniciAdi ? "@" + p.kullaniciAdi : kisa(adres) }),
    el("div", { sinif: "ds-dugmeler" }, [
      benim ? el("button", { sinif: "dugme dugme--kucuk", attr: { type: "button" }, yazi: "Edit profile", on: { click: () => duzenle() } }) : takipDugmesi(cuzdan, adres, { degisti: () => setTimeout(yenileSayilar, 500) }),
      benim ? el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/publish" }, yazi: "Publish" }) : el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/messages/" + adres }, yazi: "Message" }),
      el("a", { sinif: "dugme dugme--kucuk dugme--sade", attr: { href: S.TASARIM.kasif + "/address/" + adres, target: "_blank", rel: "noopener" }, yazi: "Explorer ↗" }),
      benim ? null : bildirDugmesi({ cuzdan }, { nft: adres, id: PROFIL, ad: "profile " + (p.kullaniciAdi ? "@" + p.kullaniciAdi : kisa(adres)) })])
  ]);
  const sayilar = el("div", { sinif: "dz-sayilar" });
  const yenileSayilar = async () => {
    const q = SO.PROFIL_VAR ? await SO.profilOku(adres, true).catch(() => p) : p;
    temizle(sayilar);
    sayilar.append(sayi(yaptigi.length, yaptigi.length === 1 ? "work" : "works"),
      sayi(SO.PROFIL_VAR ? q.takipci : null, "followers", SO.PROFIL_VAR ? () => kisiListesi("Followers", SO.takipciler(adres)) : null),
      sayi(SO.PROFIL_VAR ? q.takip : null, "following", SO.PROFIL_VAR ? () => kisiListesi("Following", SO.takipEdilenler(adres)) : null));
  };
  await yenileSayilar();
  const jetonlar = el("div", { sinif: "ds-dugmeler" }, [el("span", { sinif: "ds-cihaz", yazi: "Reading designer tokens…" })]);
  tasarimciJetonlari(adres).then((js) => {
    temizle(jetonlar);
    for (const j of js) jetonlar.append(el("a", { sinif: "dz-jeton", attr: { href: ANA + "#/merkez?t=" + j.token, title: "Trade $" + (j.sembol || "") + " in the ARC PULSE app" } }, [el("b", { yazi: "$" + (j.sembol || kisa(j.token)) }), el("span", { yazi: "designer token · Trade ↗" })]));
    if (!js.length && benim) jetonlar.append(el("span", { sinif: "ds-cihaz", yazi: "No designer token yet. To publish, launch a token in the ARC PULSE app and save its type as Designer." }));
  }).catch(() => { temizle(jetonlar); });
  const bio = el("div", { sinif: "dz-profil__bio" }, [
    p.ad ? el("div", { sinif: "dz-profil__ad", yazi: p.ad }) : null,
    p.bio ? el("div", { sinif: "dz-profil__metin", yazi: p.bio }) : null,
    p.baglantilar.length ? el("div", { sinif: "dz-baglantilar" }, p.baglantilar.map((b) => el("a", { attr: { href: b.u, target: "_blank", rel: "noopener nofollow ugc" }, yazi: b.t + " ↗" }))) : null,
    !p.kullaniciAdi && !p.ad ? el("div", { sinif: "ds-mono ds-cihaz", yazi: adres }) : null
  ]);
  kap.append(el("header", { sinif: "dz-profil" }, [
    el("div", { sinif: "dz-profil__avatar" }, [avatar(adres, 150, p.avatar || "")]),
    el("div", { sinif: "dz-profil__bilgi" }, [basliklar, sayilar, bio, jetonlar])
  ]));
  if (benim && p.gizli) kap.append(el("div", { sinif: "not not--uyari" }, [el("div", { yazi: "Your profile is hidden by the moderator: other visitors do not see it or your works on this site." })]));
  if (!SO.PROFIL_VAR) kap.append(el("div", { sinif: "ds-cihaz dz-yakinda", yazi: "Profiles open soon: handles, bios, avatars and public followers come with the on-chain profile registry. Works and collected designs are live now." }));

  const duzenKutu = el("div");
  kap.append(duzenKutu);
  if (benim && S.SURUM === 2) kap.append(el("details", { sinif: "dz-acilir" }, [el("summary", { yazi: "Unlock key (to receive design files and messages)" }), (await import("../../js/designs/teslim.js")).anahtarKutusu(cuzdan)]));

  /* ---- works / collected ---- */
  const sekme = el("div");
  const s1 = el("button", { sinif: "dz-sekme", attr: { type: "button", "aria-selected": "true", role: "tab" }, yazi: "Works" });
  const s2 = el("button", { sinif: "dz-sekme", attr: { type: "button", "aria-selected": "false", role: "tab" }, yazi: "Collected" });
  const goster = (hangi) => {
    s1.setAttribute("aria-selected", String(hangi === "yap")); s2.setAttribute("aria-selected", String(hangi === "tut"));
    temizle(sekme);
    const l = hangi === "tut" ? tuttugu : yaptigi.filter((t) => durumlar.get(t.id) ? durumlar.get(t.id).sahip : true);
    sekme.append(l.length ? el("div", { sinif: "dz-izgara" }, l.map((t) => karo(t, durumlar.get(t.id), SO.PROFIL_VAR ? (begeniler.get(t.id) || 0) : null)))
      : bosKutu(hangi === "tut" ? "No designs collected yet" : "No works yet", hangi === "yap" && benim ? "Publish your first design." : ""));
  };
  s1.addEventListener("click", () => goster("yap")); s2.addEventListener("click", () => goster("tut"));
  kap.append(el("div", { sinif: "dz-sekmeler", attr: { role: "tablist" } }, [s1, s2]), sekme);
  goster("yap");
  return kap;

  /* ---- edit profile ---- */
  function duzenle() {
    temizle(duzenKutu);
    if (!SO.PROFIL_VAR) { duzenKutu.append(el("div", { sinif: "not not--bilgi" }, [el("div", { yazi: "Profiles open soon: editing writes to the on-chain profile registry, which is being deployed." })])); return; }
    duzenKutu.append(duzenFormu(cuzdan, p, () => { location.reload(); }));
    duzenKutu.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function kisiListesi(baslik, soz) {
  const govde = el("div", { sinif: "dz-kisi-liste" }, [yukleniyor()]);
  let kapat;
  const kutu = el("div", { sinif: "dz-pencere", attr: { role: "dialog", "aria-modal": "true", "aria-label": baslik } }, [
    el("div", { sinif: "dz-pencere__ust" }, [el("h2", { yazi: baslik }), el("button", { sinif: "dugme dugme--sade", attr: { type: "button", "aria-label": "Close" }, yazi: "✕", on: { click: () => kapat() } })]), govde]);
  const perde = el("div", { sinif: "dz-perde", on: { click: (e) => { if (e.target === perde || e.target.closest("a")) kapat(); } } }, [kutu]);
  kapat = () => perde.remove();
  document.body.append(perde);
  soz.then((l) => { temizle(govde); govde.append(...(l.length ? l.map((a) => el("a", { sinif: "dz-kisi dz-kisi--satir", attr: { href: "#/u/" + a } }, [avatar(a, 36), isim(a)])) : [el("div", { sinif: "ds-cihaz", yazi: "Nobody yet." })])); })
    .catch((e) => { temizle(govde); govde.append(el("div", { sinif: "ds-durum ds-durum--hata", yazi: "Could not read the list: " + ((e && e.message) || e) })); });
}

const bayt = (s) => new TextEncoder().encode(s || "").length;

function duzenFormu(cuzdan, p, bitti) {
  const d = durumSatiri();
  const ad = el("input", { sinif: "girdi", attr: { type: "text", maxlength: "48", value: p.ad || "", placeholder: "Name", "aria-label": "Name" } });
  const tut = el("input", { sinif: "girdi", attr: { type: "text", maxlength: "20", value: p.kullaniciAdi || "", placeholder: "handle (a-z, 0-9, _)", "aria-label": "Handle", autocapitalize: "none", spellcheck: "false" } });
  const bio = el("textarea", { sinif: "girdi", attr: { maxlength: "300", placeholder: "Bio", "aria-label": "Bio", rows: "3" } });
  bio.value = p.bio || "";
  const av = el("input", { sinif: "girdi", attr: { type: "text", value: p.avatar || "", placeholder: "Avatar link: https://gateway.irys.xyz/…, ar://… or ipfs://…", "aria-label": "Avatar link" } });
  const dosya = el("input", { sinif: "girdi", attr: { type: "file", accept: "image/*", "aria-label": "Avatar image" } });
  const onizleme = el("div", { sinif: "dz-onizleme" }, [avatar(p.adres, 72, p.avatar || "")]);
  av.addEventListener("change", () => { temizle(onizleme); onizleme.append(avatar(p.adres, 72, av.value)); });
  const satirlar = el("div", { sinif: "ds-form" });
  const baglantiSatiri = (b = {}) => el("div", { sinif: "dz-baglanti-satir" }, [
    el("input", { sinif: "girdi", attr: { type: "text", maxlength: "32", value: b.t || "", placeholder: "Label (X, Website…)", "aria-label": "Link label" } }),
    el("input", { sinif: "girdi", attr: { type: "url", value: b.u || "", placeholder: "https://…", "aria-label": "Link URL" } })]);
  for (const b of [...p.baglantilar, {}, {}].slice(0, Math.max(2, p.baglantilar.length + 1))) satirlar.append(baglantiSatiri(b));
  const ekle = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "+ Add link", on: { click: () => { if (satirlar.children.length < 6) satirlar.append(baglantiSatiri()); } } });
  let yuklenecek = null;   // the resized avatar image, uploaded on save

  dosya.addEventListener("change", async () => {
    const f = dosya.files && dosya.files[0];
    if (!f) return;
    try {
      yuklenecek = await kucult(f, 400);
      temizle(onizleme);
      onizleme.append(el("img", { sinif: "dz-avatar", attr: { src: URL.createObjectURL(yuklenecek), alt: "New avatar", style: "width:72px;height:72px" } }));
      durumYaz(d, "The image (" + Math.ceil(yuklenecek.size / 1024) + " KB) is uploaded to Irys when you save, paid from your Arc USDC (a fraction of a cent; shown before you pay).");
    } catch (e) { durumYaz(d, "Could not read the image: " + ((e && e.message) || e), "hata"); }
  });

  const kaydet = eylem("Save profile", async (yaz) => {
    const ben = await hesapIste();
    if (!esit(ben, p.adres)) throw new Error("Connect " + kisa(p.adres) + " to edit this profile.");
    const h = tut.value.trim().toLowerCase().replace(/^@/, "");
    if (h && !/^[a-z0-9_]{3,20}$/.test(h)) throw new Error("A handle is 3–20 characters: lowercase letters, digits and _.");
    const baglantilar = [...satirlar.children].map((r) => ({ t: r.children[0].value.trim(), u: r.children[1].value.trim() })).filter((x) => x.u);
    for (const b of baglantilar) if (!/^https:\/\/[^\s"'<>]{3,}$/i.test(b.u)) throw new Error("Links must start with https:// (" + b.u.slice(0, 40) + ").");
    let avatarUri = av.value.trim();
    if (yuklenecek) {
      avatarUri = (await irysYukle(cuzdan, new Uint8Array(await yuklenecek.arrayBuffer()), [{ name: "Content-Type", value: "image/jpeg" }, { name: "Type", value: "avatar" }, { name: "Wallet", value: ben.toLowerCase() }], yaz)).url;
      av.value = avatarUri; yuklenecek = null;
    }
    if (avatarUri && !gorselUrl(avatarUri)) throw new Error("The avatar link must be on Irys, Arweave or IPFS (other hosts are blocked by this site's privacy policy, so visitors' browsers never call them).");
    const j = SO.baglantiYaz(baglantilar);
    const alanlar = [[ad.value.trim(), 48, "Name"], [bio.value.trim(), 300, "Bio"], [avatarUri, 200, "Avatar link"], [j, 600, "Links"]];
    for (const [v, m, n] of alanlar) if (bayt(v) > m) throw new Error(n + " is " + bayt(v) + " bytes; at most " + m + ".");
    const degisti = ad.value.trim() !== p.ad || bio.value.trim() !== p.bio || avatarUri !== p.avatar || j !== SO.baglantiYaz(p.baglantilar);
    if (h && h !== p.kullaniciAdi) {
      const sahip = await SO.sahibi(h);
      if (sahip && !esit(sahip, ben)) throw new Error("@" + h + " is taken.");
      await SO.profilGonder({ cuzdan, data: SO.veriP.kullaniciAdiAl(h), durum: yaz, aciklama: "Confirm taking @" + h + (degisti ? " (1 of 2)" : "") });
    }
    if (degisti) await SO.profilGonder({ cuzdan, data: SO.veriP.profilYaz(ad.value.trim(), bio.value.trim(), avatarUri, j), durum: yaz, aciklama: "Confirm saving your profile" });
    if (!degisti && !(h && h !== p.kullaniciAdi)) return yaz("Nothing changed.", "ok");
    SO.profilUnut(p.adres);
    yaz("Saved on Arc. Everyone sees it now.", "ok");
    setTimeout(bitti, 1200);
  }, "dugme dugme--marka", d);

  return el("section", { sinif: "ds-kutu dz-duzen" }, [el("h3", { yazi: "Edit profile" }),
    el("p", { sinif: "ds-lisans", yazi: "Your profile is public and lives on Arc (ProfilKaydi): you pay a fraction of a cent of gas, ARC PULSE keeps nothing. Do not put anything private here." }),
    el("div", { sinif: "dz-duzen__avatar" }, [onizleme, el("div", { sinif: "ds-form" }, [el("label", {}, ["Upload an image (stored on Irys)", dosya]), el("label", {}, ["or paste a link", av])])]),
    el("div", { sinif: "ds-form" }, [el("label", {}, ["Name", ad]), el("label", {}, ["Handle", tut]), el("label", {}, ["Bio", bio]), el("div", {}, [el("div", { sinif: "ds-cihaz", yazi: "Links (https only)" }), satirlar, ekle])]),
    el("div", { sinif: "ds-dugmeler" }, [kaydet, el("button", { sinif: "dugme", attr: { type: "button" }, yazi: "Cancel", on: { click: (e) => e.target.closest("section").remove() } })]), d]);
}

/* an image, center-cropped to a square and resized, as JPEG */
async function kucult(f, kenar) {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise((ok, red) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => red(new Error("not an image")); i.src = url; });
    const k = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement("canvas");
    c.width = c.height = Math.min(kenar, k);
    c.getContext("2d").drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, 0, 0, c.width, c.height);
    return await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.86));
  } finally { URL.revokeObjectURL(url); }
}

/* ---- Irys: price, fund from Arc USDC if needed, upload (the main app's designs/irys.js) ---- */
export async function irysYukle(cuzdan, veri, etiketler, yaz) {
  const I = await import("../../js/designs/irys.js");
  const { imzala } = await import("../../js/designs/imza.js");
  const ben = cuzdan.hesap();
  yaz("Sign once so Irys can read your wallet's public key (sends nothing)…");
  const imzaci = await I.cuzdanImzacisi(cuzdan, (m) => imzala(cuzdan, m));
  const boy = veri.length + 2048;
  const [gereken, var_] = await Promise.all([I.fiyat(boy), I.bakiye(ben)]);
  if (var_ < gereken) {
    const yatir = (gereken - var_) * 12n / 10n + 1n;
    yaz("Irys storage for " + Math.ceil(boy / 1024) + " KB costs " + formatUnits(gereken, 18) + " ETH; funding it from your Arc USDC through relay.link…");
    await I.fonlaArcUsdc(cuzdan, yatir, yaz);
    for (let i = 0; ; i++) {
      if ((await I.bakiye(ben).catch(() => 0n)) >= gereken) break;
      if (i === 40) throw new Error("Irys has not credited the deposit yet. Try again in a minute; it is on your Irys balance, not lost.");
      yaz("Waiting for Irys to credit the deposit…");
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
  yaz("Sign the upload in your wallet…");
  return I.yukle(veri, etiketler, imzaci);
}
