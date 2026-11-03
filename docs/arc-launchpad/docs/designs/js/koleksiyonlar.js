/* ===========================================================================
 * designs/js/koleksiyonlar.js — Collections and drops (KoleksiyonKaydi on Arc)
 *
 *   #/collections        every collection: cover, name, designer, count,
 *                        the drop countdown when it has not started
 *   #/collections/new    a designer groups their own designs into a series
 *                        (name, description, cover link, optional drop start)
 *   #/c/<id>             one collection: cover, description, designer (with
 *                        the Verified badge), countdown, its designs; the
 *                        designer edits it (text, drop time until it starts,
 *                        add / remove designs, delete)
 *
 * Drops are a page rule: before the start the design pages show the
 * countdown instead of Buy. TasarimNFT2 is unchanged, so a design listed
 * early could still be bought by calling the contract directly; the page
 * says so and asks designers to list at the start.
 * =========================================================================== */
import { el, temizle, S, SO, esit, tarih, avatar, isim, karo, eylem, durumSatiri, bosKutu, hesapIste, gorselUrl, resimKutusu, gorunurler } from "./ortak.js";
import * as K from "./koleksiyon.js";
import { rozet } from "./rozet.js";

const cevir = (e) => K.koleksiyonHatasi(e) || SO.hataAcikla(e);
const yakinda = () => bosKutu("Collections open soon", "Designers group their designs into named series and schedule drops. The collections registry is being deployed.");
const bayt = (s) => new TextEncoder().encode(s || "").length;
const yenile = (ms = 1500) => setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), ms);

async function gonder({ cuzdan, data, durum, aciklama }) {
  const ben = await hesapIste();
  try { await S.onceDene(ben, K.KOLEKSIYON.adres, data); } catch (e) { throw new Error(cevir(e)); }
  durum && durum((aciklama || "Confirm in your wallet") + " (on Arc, a fraction of a cent of gas)…");
  let h;
  try { h = await cuzdan.agdaGonder(await S.arcAg(), { to: K.KOLEKSIYON.adres, data, value: "0x0" }); } catch (e) { throw new Error(cevir(e)); }
  durum && durum("Sent. Waiting for Arc to confirm…");
  const m = await S.makbuz(h, durum);
  K.dropUnut();
  return m;
}

/** A live countdown element ("Drop in 1d 2h 03m 04s"), or null when there is no future drop. */
export function geriSayimEl(baslangic, onek = "Drop in ") {
  if (!baslangic || baslangic <= Date.now()) return null;
  const s = el("span", { sinif: "dz-geri-sayim", attr: { role: "timer", "aria-live": "off", title: "Starts " + tarih(baslangic) } });
  const ciz = () => {
    /* stop once the page that showed it is gone */
    if (s.isConnected) s._bagli = true; else if (s._bagli) { clearInterval(z); return; }
    if (baslangic <= Date.now()) { s.textContent = "Drop open"; s.classList.add("dz-geri-sayim--acik"); clearInterval(z); return; }
    s.textContent = onek + K.geriSayim(baslangic);
  };
  const z = setInterval(ciz, 1000);
  ciz();
  return s;
}

function kapak(k, ilkTasarim) {
  const src = gorselUrl(k.kapakUri);
  if (src) return el("div", { sinif: "dz-kol-kapak" }, [el("img", { attr: { src, alt: k.ad + " (cover)", loading: "lazy", referrerpolicy: "no-referrer" }, on: { error: (e) => e.target.remove() } })]);
  if (ilkTasarim) return resimKutusu(ilkTasarim.uri, "dz-kol-kapak", k.ad);
  return el("div", { sinif: "dz-kol-kapak dz-kol-kapak--bos", attr: { "aria-hidden": "true" } });
}

/* ======================================================================
 * LIST
 * ====================================================================== */
export async function koleksiyonListesi({ cuzdan }) {
  const kap = el("div", { sinif: "dz-koleksiyonlar" });
  kap.append(el("div", { sinif: "dz-sayfa-ust dz-is-ust" }, [el("div", {}, [el("h1", { yazi: "Collections" }), el("p", { yazi: "Series of designs by ARC PULSE designers, some with a scheduled drop." })]),
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/collections/new" }, yazi: "New collection" })]));
  if (!K.KOLEKSIYON_VAR) { kap.append(yakinda()); return kap; }
  const [liste, yayinlar, gizli] = await Promise.all([K.koleksiyonlar(), S.yayinlar(), SO.gizliler().catch(() => new Set())]);
  const l = liste.filter((k) => !gizli.has(k.tasarimci.toLowerCase()));
  if (!l.length) { kap.append(bosKutu("No collections yet", "Designers: group your designs into a series.", el("a", { sinif: "dugme", attr: { href: "#/collections/new" }, yazi: "New collection" }))); return kap; }
  const ilk = new Map();
  await Promise.all(l.map(async (k) => { const d = await K.koleksiyonOku(k.id).catch(() => null); if (d && d.tasarimlar.length) ilk.set(k.id, yayinlar.find((t) => t.id === d.tasarimlar[0])); }));
  kap.append(el("div", { sinif: "dz-kol-izgara" }, l.map((k) => koleksiyonKarti(k, ilk.get(k.id)))));
  return kap;
}

export function koleksiyonKarti(k, ilkTasarim) {
  return el("a", { sinif: "dz-kol-kart", attr: { href: "#/c/" + k.id, "data-koleksiyon": String(k.id) } }, [
    kapak(k, ilkTasarim),
    el("div", { sinif: "dz-kol-kart__alt" }, [
      el("b", { sinif: "dz-kol-kart__ad", yazi: k.ad }),
      el("span", { sinif: "dz-kol-kart__kim" }, [isim(k.tasarimci), rozet(k.tasarimci, 14)]),
      el("span", { sinif: "ds-cihaz", yazi: k.adet + (k.adet === 1 ? " design" : " designs") }),
      geriSayimEl(k.baslangic)])]);
}

/* ======================================================================
 * ONE COLLECTION
 * ====================================================================== */
export async function koleksiyonSayfasi({ cuzdan }, id) {
  const kap = el("div", { sinif: "dz-koleksiyon-sayfa" });
  if (!K.KOLEKSIYON_VAR) { kap.append(yakinda()); return kap; }
  const k = await K.koleksiyonOku(id);
  if (!k) { kap.append(bosKutu("No such collection", "Collection #" + id + " does not exist or was deleted.", el("a", { sinif: "dugme", attr: { href: "#/collections" }, yazi: "All collections" }))); return kap; }
  const ben = cuzdan.hesap();
  const benim = esit(k.tasarimci, ben);
  if (k.gizli && !benim) { kap.append(bosKutu("This collection is hidden", "The moderator hid it after a report. The record stays on Arc.")); return kap; }
  const yayinlar = await S.yayinlar();
  const tasarimlar = await gorunurler(k.tasarimlar.map((i) => yayinlar.find((t) => t.id === i)).filter(Boolean));
  const durumlar = new Map((await S.durumlar(tasarimlar.map((t) => t.id)).catch(() => [])).map((d) => [d.id, d]));
  document.title = k.ad + " · Collections · ARC PULSE Designs";
  const bekliyor = k.baslangic > Date.now();
  kap.append(el("header", { sinif: "dz-kol-baslik" }, [kapak(k, tasarimlar[0]),
    el("div", { sinif: "dz-kol-baslik__bilgi" }, [
      el("h1", { yazi: k.ad }),
      el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + k.tasarimci } }, [avatar(k.tasarimci, 28), isim(k.tasarimci), rozet(k.tasarimci)]),
      k.aciklama ? el("p", { sinif: "dz-kol-aciklama", yazi: k.aciklama }) : null,
      el("div", { sinif: "dz-is-meta" }, [el("span", { yazi: k.adet + (k.adet === 1 ? " design" : " designs") }), el("span", { yazi: "Collection #" + k.id })]),
      bekliyor ? el("div", { sinif: "dz-kol-drop" }, [geriSayimEl(k.baslangic), el("span", { sinif: "ds-cihaz", yazi: "Starts " + tarih(k.baslangic) + ". Until then these designs show the countdown instead of Buy." })])
        : k.baslangic ? el("div", { sinif: "dz-kol-drop" }, [el("span", { sinif: "dz-geri-sayim dz-geri-sayim--acik", yazi: "Drop open since " + tarih(k.baslangic) })]) : null])]));
  if (bekliyor) kap.append(el("p", { sinif: "ds-cihaz", yazi: "The drop time is enforced by these pages. The NFT contract itself takes a purchase whenever a design is listed, so designers list at the start." }));
  kap.append(tasarimlar.length ? el("div", { sinif: "dz-izgara" }, tasarimlar.map((t) => karo(t, durumlar.get(t.id), null))) : bosKutu("No designs in this collection yet"));
  if (benim) kap.append(duzenKutusu({ cuzdan, k, yayinlar }));
  return kap;
}

/* ======================================================================
 * NEW / EDIT
 * ====================================================================== */
const yerel = (ms) => new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function alanlar(k = {}) {
  const ad = el("input", { sinif: "girdi", attr: { type: "text", maxlength: "64", placeholder: "Collection name", "aria-label": "Collection name", value: k.ad || "" } });
  const aciklama = el("textarea", { sinif: "girdi", attr: { rows: "3", maxlength: "500", placeholder: "Description (public)", "aria-label": "Description" } });
  aciklama.value = k.aciklama || "";
  const kapakU = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "Cover image link (https://gateway.irys.xyz/…, ipfs://…) — empty uses the first design", "aria-label": "Cover link", value: k.kapakUri || "" } });
  const dropVar = el("input", { attr: { type: "checkbox", "aria-label": "Schedule a drop" } });
  dropVar.checked = !!k.baslangic;
  const drop = el("input", { sinif: "girdi", attr: { type: "datetime-local", "aria-label": "Drop start", value: yerel(k.baslangic || Date.now() + 86400_000) } });
  const kontrol = () => {
    const a = ad.value.trim();
    if (!a) throw new Error("Give the collection a name.");
    if (bayt(a) > K.LIMIT_K.ad) throw new Error("The name is at most 64 bytes.");
    if (bayt(aciklama.value) > K.LIMIT_K.aciklama) throw new Error("The description is at most 500 bytes.");
    const c = kapakU.value.trim();
    if (c && !/^(https:\/\/|ipfs:\/\/|ar:\/\/)\S+$/i.test(c)) throw new Error("The cover link must start with https://, ipfs:// or ar://.");
    let b = 0;
    if (dropVar.checked) {
      const t = new Date(drop.value).getTime();
      if (!(t > Date.now() + 60_000)) throw new Error("The drop start must be in the future.");
      if (t > Date.now() + 365 * 86400_000) throw new Error("The drop start must be within a year.");
      b = Math.floor(t / 1000);
    }
    return { ad: a, aciklama: aciklama.value.trim(), kapak: c, baslangic: b };
  };
  const govde = el("div", { sinif: "ds-form" }, [el("label", {}, ["Name", ad]), el("label", {}, ["Description", aciklama]), el("label", {}, ["Cover", kapakU]),
    el("label", { sinif: "dz-kol-drop-sec" }, [el("span", {}, [dropVar, " Schedule a drop (designs show a countdown until the start)"]), drop])]);
  return { govde, kontrol, dropVar, drop };
}
function secimListesi(adaylar) {
  const kutu = el("div", { sinif: "dz-kol-secim" });
  const secilen = new Set();
  for (const t of adaylar) {
    const c = el("input", { attr: { type: "checkbox", value: String(t.id), "aria-label": "Design #" + t.id } });
    c.addEventListener("change", () => { if (c.checked) secilen.add(t.id); else secilen.delete(t.id); });
    kutu.append(el("label", { sinif: "dz-kol-secim__oge" }, [c, resimKutusu(t.uri, "dz-kol-secim__resim", "Design #" + t.id), el("span", { yazi: "#" + t.id })]));
  }
  return { kutu, secilen };
}

export async function koleksiyonYeni({ cuzdan }) {
  const kap = el("div", { sinif: "dz-koleksiyonlar" });
  kap.append(el("div", { sinif: "dz-sayfa-ust" }, [el("h1", { yazi: "New collection" }), el("p", { yazi: "Group your designs into a named series, optionally with a drop start." })]));
  if (!K.KOLEKSIYON_VAR) { kap.append(yakinda()); return kap; }
  const ben = cuzdan.hesap();
  if (!ben) { const b = eylem("Connect wallet", async () => { await hesapIste(); yenile(100); }); kap.append(bosKutu("Connect your designer wallet", "Only your own designs can go into your collections.", el("div", {}, [b, b._durum]))); return kap; }
  const yayinlar = (await S.yayinlar()).filter((t) => esit(t.tasarimci, ben));
  const bilgi = await K.dropBilgisi(yayinlar.map((t) => t.id)).catch(() => new Map());
  const serbest = yayinlar.filter((t) => !(bilgi.get(t.id) || {}).koleksiyon);
  const f = alanlar();
  const s = secimListesi(serbest);
  const d = durumSatiri();
  kap.append(el("div", { sinif: "ds-kutu dz-is-form" }, [f.govde,
    el("h3", { yazi: "Designs (" + serbest.length + " of yours not in a collection)" }), serbest.length ? s.kutu : el("p", { sinif: "ds-cihaz", yazi: "No free designs: publish one first, or create the collection empty and add designs later." }),
    el("div", { sinif: "ds-dugmeler" }, [eylem("Create the collection", async (yaz) => {
      const v = f.kontrol();
      const ids = [...s.secilen];
      if (ids.length > K.LIMIT_K.toplu) throw new Error("At most 50 designs at once; add the rest after.");
      const m = await gonder({ cuzdan, data: K.veriK.olustur(v.ad, v.aciklama, v.kapak, v.baslangic, ids), durum: yaz, aciklama: "Confirm creating the collection" });
      const log = m.logs.map((l) => { try { return K.ifcK.parseLog(l); } catch (e) { return null; } }).find((e) => e && e.name === "KoleksiyonYazildi");
      yaz("Created.", "ok");
      setTimeout(() => { location.hash = log ? "#/c/" + log.args.id : "#/collections"; }, 900);
    }, "dugme dugme--marka", d, cevir)]), d]));
  return kap;
}

function duzenKutusu({ cuzdan, k, yayinlar }) {
  const f = alanlar(k);
  const basladi = k.baslangic && k.baslangic <= Date.now();
  if (basladi) { f.dropVar.disabled = true; f.drop.disabled = true; }
  const d = durumSatiri();
  const icinde = yayinlar.filter((t) => k.tasarimlar.includes(t.id));
  const cik = secimListesi(icinde);
  const ekleKutu = el("div", { yazi: "Reading your designs…", sinif: "ds-cihaz" });
  let ekleSec = { secilen: new Set() };
  const benim = yayinlar.filter((t) => esit(t.tasarimci, k.tasarimci) && !k.tasarimlar.includes(t.id));
  K.dropBilgisi(benim.map((t) => t.id)).then((b) => {
    const serbest = benim.filter((t) => !(b.get(t.id) || {}).koleksiyon);
    ekleSec = secimListesi(serbest);
    temizle(ekleKutu); ekleKutu.className = "";
    ekleKutu.append(serbest.length ? ekleSec.kutu : el("p", { sinif: "ds-cihaz", yazi: "No free designs to add." }));
  }).catch(() => { ekleKutu.textContent = "Could not read your designs."; });
  return el("details", { sinif: "ds-kutu dz-kol-duzen" }, [el("summary", { yazi: "Edit this collection" }), f.govde,
    basladi ? el("p", { sinif: "ds-cihaz", yazi: "The drop has started: its time can no longer change." }) : null,
    el("div", { sinif: "ds-dugmeler" }, [eylem("Save", async (yaz) => {
      const v = f.kontrol();
      const b = basladi ? Math.floor(k.baslangic / 1000) : v.baslangic;
      await gonder({ cuzdan, data: K.veriK.guncelle(k.id, v.ad, v.aciklama, v.kapak, b), durum: yaz, aciklama: "Confirm saving the collection" });
      yaz("Saved.", "ok"); yenile();
    }, "dugme dugme--marka", d, cevir)]),
    el("h3", { yazi: "Add designs" }), ekleKutu,
    el("div", { sinif: "ds-dugmeler" }, [eylem("Add selected", async (yaz) => {
      const ids = [...ekleSec.secilen];
      if (!ids.length) throw new Error("Select designs to add.");
      await gonder({ cuzdan, data: K.veriK.ekle(k.id, ids.slice(0, K.LIMIT_K.toplu)), durum: yaz, aciklama: "Confirm adding " + ids.length + " design(s)" });
      yaz("Added.", "ok"); yenile();
    }, "dugme", d, cevir)]),
    icinde.length ? el("h3", { yazi: "Remove designs" }) : null, icinde.length ? cik.kutu : null,
    icinde.length ? el("div", { sinif: "ds-dugmeler" }, [eylem("Remove selected", async (yaz) => {
      const ids = [...cik.secilen];
      if (!ids.length) throw new Error("Select designs to remove.");
      await gonder({ cuzdan, data: K.veriK.cikar(k.id, ids.slice(0, K.LIMIT_K.toplu)), durum: yaz, aciklama: "Confirm removing " + ids.length + " design(s)" });
      yaz("Removed.", "ok"); yenile();
    }, "dugme", d, cevir)]) : null,
    el("div", { sinif: "ds-dugmeler" }, [eylem("Delete the collection", async (yaz) => {
      if (!confirm("Delete this collection? Its designs stay yours and become free to add elsewhere.")) return;
      await gonder({ cuzdan, data: K.veriK.sil(k.id), durum: yaz, aciklama: "Confirm deleting the collection" });
      yaz("Deleted.", "ok"); setTimeout(() => { location.hash = "#/collections"; }, 900);
    }, "dugme dugme--sade", d, cevir)]), d]);
}

/** A profile's collections strip (empty element when none). */
export async function profilKoleksiyonlari(adres) {
  if (!K.KOLEKSIYON_VAR) return el("span");
  const l = (await K.tasarimcininKoleksiyonlari(adres).catch(() => [])).filter((k) => !k.gizli);
  if (!l.length) return el("span");
  const yayinlar = await S.yayinlar().catch(() => []);
  const ilk = new Map();
  await Promise.all(l.map(async (k) => { const d = await K.koleksiyonOku(k.id).catch(() => null); if (d && d.tasarimlar.length) ilk.set(k.id, yayinlar.find((t) => t.id === d.tasarimlar[0])); }));
  return el("section", { sinif: "dz-profil-kol" }, [el("h2", { yazi: "Collections" }), el("div", { sinif: "dz-kol-izgara dz-kol-izgara--serit" }, l.map((k) => koleksiyonKarti(k, ilk.get(k.id))))]);
}

/** Design page: the collection line and, before its drop, the countdown that replaces Buy. */
export async function tasarimDropu(id) {
  if (!K.KOLEKSIYON_VAR) return null;
  const b = (await K.dropBilgisi([id]).catch(() => new Map())).get(Number(id));
  if (!b || !b.koleksiyon) return null;
  const k = await K.koleksiyonOku(b.koleksiyon).catch(() => null);
  if (!k || k.gizli) return null;
  return { k, bekliyor: k.baslangic > Date.now() };
}

/** Design page, before the drop: the box that replaces Buy. */
export function dropKutusu(k) {
  return el("div", { sinif: "ds-kutu dz-fiyat-kutu dz-drop-kutu" }, [
    el("div", { sinif: "ds-buyuk-fiyat" }, [geriSayimEl(k.baslangic) || "Drop open"]),
    el("div", { yazi: "Part of the drop of “" + k.ad + "”: buying opens " + tarih(k.baslangic) + "." }),
    el("a", { attr: { href: "#/c/" + k.id }, yazi: "See the collection" })]);
}
