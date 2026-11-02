/* ===========================================================================
 * designs/js/yorumlar.js — the comments section and the Report dialog
 *
 * Comments under a design (YorumKaydi, js/yorum.js): newest first, write,
 * reply, delete your own, and for the design's holder or designer hide /
 * restore comments under it. A Report button (design pages, profiles,
 * single comments) sends YorumKaydi.bildir: a public event with a reason
 * code and a short note. Before the contract is deployed the section says
 * "Comments open soon" (as profiles and messages did).
 * Everything is public on Arc; hiding only stops pages from showing a
 * comment, the chain's history keeps its text. The texts are shown with
 * textContent only (never as HTML).
 * =========================================================================== */
import { el, temizle, S, SO, esit, tarih, kisa, avatar, isim, durumSatiri, durumYaz, hesapIste } from "./ortak.js";
import * as Y from "./yorum.js";

const bayt = (s) => new TextEncoder().encode(s || "").length;

/** Send YorumKaydi calldata from the visitor's wallet (simulated first, its reverts explained). */
async function yorumGonder({ cuzdan, data, durum, aciklama }) {
  const ben = await hesapIste();
  try { await S.onceDene(ben, Y.YORUM.adres, data); }
  catch (e) { throw new Error(Y.yorumHatasi(e) || SO.hataAcikla(e)); }
  return SO.gonder({ cuzdan, to: Y.YORUM.adres, data, durum, aciklama });
}

/* ================================================================ comments */
export function yorumBolumu({ cuzdan }, t) {
  const kap = el("section", { sinif: "dz-yorumlar", attr: { "aria-labelledby": "dz-yorum-baslik" } });
  const baslik = el("h2", { attr: { id: "dz-yorum-baslik" }, yazi: "Comments" });
  kap.append(baslik);
  if (!Y.YORUM_VAR) {
    kap.append(el("div", { sinif: "dz-yorum-yakinda" }, [
      el("b", { yazi: "Comments open soon" }),
      el("span", { yazi: "Public comments on Arc open when the comment registry is deployed. Each wallet pays its own gas; ARC PULSE stores nothing." })]));
    return kap;
  }
  const ben = cuzdan.hesap();
  const liste = el("div", { sinif: "dz-yorum-liste", attr: { "aria-live": "polite" } }, [el("div", { sinif: "ds-cihaz", yazi: "Reading comments from Arc…" })]);
  let yanit = 0;
  const yanitSatiri = el("div", { sinif: "dz-yorum-yanit", attr: { hidden: "" } });
  const yazi = el("textarea", { sinif: "girdi dz-yorum-yaz", attr: { rows: "2", placeholder: "Add a public comment…", "aria-label": "Comment", maxlength: String(Y.METIN_AZAMI) } });
  const sayac = el("span", { sinif: "ds-cihaz dz-yorum-sayac", yazi: "0 / " + Y.METIN_AZAMI });
  yazi.addEventListener("input", () => { const n = bayt(yazi.value); sayac.textContent = n + " / " + Y.METIN_AZAMI; sayac.classList.toggle("dz-yorum-sayac--asim", n > Y.METIN_AZAMI); });
  const yanitAyarla = (y) => {
    yanit = y ? y.yorumId : 0;
    temizle(yanitSatiri);
    yanitSatiri.hidden = !y;
    if (y) {
      yanitSatiri.append(el("span", {}, ["Replying to ", isim(y.yazar)]),
        el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-label": "Cancel reply" }, yazi: "✕", on: { click: () => yanitAyarla(null) } }));
      yazi.focus();
    }
  };
  const d = durumSatiri();
  const gonder = el("button", { sinif: "dugme dugme--marka dugme--kucuk", attr: { type: "button" }, yazi: "Post" });
  gonder.addEventListener("click", async () => {
    gonder.disabled = true;
    try {
      const m = yazi.value.trim();
      if (!m) throw new Error("Write a comment first.");
      if (bayt(m) > Y.METIN_AZAMI) throw new Error("Too long: " + bayt(m) + " bytes; at most " + Y.METIN_AZAMI + ".");
      const kim = await hesapIste();
      const n = await Y.yazabilir(kim).catch(() => 0);
      if (n === 1) throw new Error("Your wallet is muted by the moderator.");
      if (n === 2) throw new Error("Too many comments or reports in a minute. Wait a moment and try again.");
      await yorumGonder({ cuzdan, data: Y.veriY.yaz(t.id, m, yanit), durum: (x, tur) => durumYaz(d, x, tur), aciklama: "Confirm your public comment" });
      yazi.value = ""; sayac.textContent = "0 / " + Y.METIN_AZAMI; yanitAyarla(null);
      durumYaz(d, "Posted on Arc.", "ok");
      yukle();
    } catch (e) { durumYaz(d, (e && e.message) || String(e), "hata"); }
    finally { gonder.disabled = false; }
  });
  yazi.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) gonder.click(); });
  kap.append(liste, el("div", { sinif: "dz-yorum-form" }, [yanitSatiri, yazi, el("div", { sinif: "dz-yorum-alt" }, [sayac, gonder])]), d,
    el("p", { sinif: "ds-cihaz", yazi: "Comments are public and permanent on Arc. Deleting or hiding one stops this site from showing it, but its text stays in the chain's history." }));

  let yetkili = false;   // holder or designer of this design
  async function yukle() {
    try {
      const [l, gizli, yt] = await Promise.all([Y.yorumlar(t.id), SO.gizliler().catch(() => new Set()), ben ? Y.sahipVeyaTasarimci(ben, t.id).catch(() => false) : false]);
      yetkili = !!yt;
      const goster = l.filter((x) => !gizli.has(x.yazar.toLowerCase()) && (x.durum === Y.DURUM.GORUNUR || (yetkili && x.durum === Y.DURUM.SAHIP_GIZLEDI)));
      const gorunur = goster.filter((x) => x.durum === Y.DURUM.GORUNUR).length;
      baslik.textContent = "Comments" + (gorunur ? " (" + gorunur + ")" : "");
      temizle(liste);
      if (!goster.length) { liste.append(el("div", { sinif: "ds-cihaz dz-yorum-bos", yazi: "No comments yet. Be the first." })); return; }
      const byId = new Map(l.map((x) => [x.yorumId, x]));
      for (const y of goster) liste.append(yorumSatiri(y, byId.get(y.yanit)));
    } catch (e) {
      temizle(liste);
      liste.append(el("div", { sinif: "ds-durum ds-durum--hata", yazi: "Could not read the comments: " + ((e && e.message) || e) }));
    }
  }
  function yorumSatiri(y, ana) {
    const sd = durumSatiri();
    const benim = esit(y.yazar, ben);
    const gizlendi = y.durum === Y.DURUM.SAHIP_GIZLEDI;
    const eylemler = el("div", { sinif: "dz-yorum__eylem" });
    const dugme = (yazi, f, baslik) => el("button", { sinif: "dz-yorum__dugme", attr: { type: "button", title: baslik || yazi }, yazi, on: { click: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { await f((m, tur) => durumYaz(sd, m, tur)); } catch (x) { durumYaz(sd, (x && x.message) || String(x), "hata"); } finally { b.disabled = false; }
    } } });
    if (!gizlendi) eylemler.append(dugme("Reply", async () => yanitAyarla(y)));
    if (benim) eylemler.append(dugme("Delete", async (yaz) => {
      await yorumGonder({ cuzdan, data: Y.veriY.sil(y.yorumId, t.id), durum: yaz, aciklama: "Confirm deleting your comment" });
      yaz("Deleted. Pages no longer show it; the text stays in Arc's history.", "ok"); yukle();
    }, "Hide your own comment on every page (the chain's history keeps the text)"));
    if (yetkili && !benim) eylemler.append(dugme(gizlendi ? "Restore" : "Hide", async (yaz) => {
      await yorumGonder({ cuzdan, data: Y.veriY.gizle(y.yorumId, y.yazar, t.id, !gizlendi), durum: yaz, aciklama: gizlendi ? "Confirm restoring the comment" : "Confirm hiding the comment under your design" });
      yaz(gizlendi ? "Restored." : "Hidden under your design.", "ok"); yukle();
    }, gizlendi ? "Show this comment again" : "As the holder or designer, hide this comment under your design"));
    if (!benim) eylemler.append(el("span", {}, [bildirDugmesi({ cuzdan }, { nft: S.TASARIM.adres, id: t.id, ad: "comment #" + y.yorumId + " on design #" + t.id, not: "comment #" + y.yorumId, sinif: "dz-yorum__dugme", yazi: "Report" })]));
    return el("article", { sinif: "dz-yorum" + (gizlendi ? " dz-yorum--gizli" : ""), attr: { "data-yorum": String(y.yorumId) } }, [
      el("a", { attr: { href: "#/u/" + y.yazar, "aria-label": "Profile of " + kisa(y.yazar) } }, [avatar(y.yazar, 32)]),
      el("div", { sinif: "dz-yorum__govde" }, [
        el("div", { sinif: "dz-yorum__ust" }, [el("a", { sinif: "dz-yorum__kim", attr: { href: "#/u/" + y.yazar } }, [isim(y.yazar)]),
          el("a", { sinif: "ds-cihaz", attr: { href: S.TASARIM.kasif + "/tx/" + y.tx, target: "_blank", rel: "noopener" }, yazi: tarih(y.zaman) }),
          gizlendi ? el("span", { sinif: "ds-rozet ds-rozet--uyari", yazi: "Hidden by holder / designer" }) : null]),
        ana ? el("div", { sinif: "dz-yorum__yanitla ds-cihaz" }, ["↪ reply to ", isim(ana.yazar)]) : null,
        el("p", { sinif: "dz-yorum__metin", yazi: y.metin }),
        eylemler, sd])]);
  }
  yukle();
  return kap;
}

/* ================================================================ reports */
/**
 * A "Report" button. Design: {nft: TasarimNFT2, id}; profile: {nft: wallet, id: PROFIL}.
 * `not` pre-fills the note (e.g. "comment #12").
 */
export function bildirDugmesi({ cuzdan }, { nft, id, ad, not, sinif = "dugme dugme--sade dugme--kucuk", yazi = "Report" }) {
  return el("button", { sinif, attr: { type: "button", title: "Report " + ad + " to the moderator (public on Arc)", "data-bildir": "" }, yazi,
    on: { click: (e) => { e.preventDefault(); e.stopPropagation(); bildirPenceresi({ cuzdan, nft, id, ad, not }); } } });
}

export function bildirPenceresi({ cuzdan, nft, id, ad, not }) {
  let kapat;
  const govde = el("div", { sinif: "ds-form" });
  const kutu = el("div", { sinif: "dz-pencere dz-bildir", attr: { role: "dialog", "aria-modal": "true", "aria-label": "Report " + ad } }, [
    el("div", { sinif: "dz-pencere__ust" }, [el("h2", { yazi: "Report " + ad }), el("button", { sinif: "dugme dugme--sade", attr: { type: "button", "aria-label": "Close" }, yazi: "✕", on: { click: () => kapat() } })]),
    govde]);
  const perde = el("div", { sinif: "dz-perde", on: { click: (e) => { if (e.target === perde) kapat(); } } }, [kutu]);
  const esc = (e) => { if (e.key === "Escape") kapat(); };
  kapat = () => { document.removeEventListener("keydown", esc); perde.remove(); };
  document.addEventListener("keydown", esc);
  if (!Y.YORUM_VAR) {
    govde.append(el("p", { yazi: "Reports on Arc open soon, together with comments. Until then the moderator can be reached through ARC PULSE's public channels." }));
    document.body.append(perde);
    kutu.querySelector("button").focus();
    return;
  }
  const neden = el("select", { sinif: "girdi", attr: { "aria-label": "Reason" } }, [el("option", { attr: { value: "" }, yazi: "Choose a reason…" }),
    ...Y.NEDENLER.map(([k, y]) => el("option", { attr: { value: String(k) }, yazi: y }))]);
  const notGir = el("textarea", { sinif: "girdi", attr: { rows: "3", maxlength: String(Y.NOT_AZAMI), placeholder: "What is wrong? A link to the original helps (optional, " + Y.NOT_AZAMI + " bytes)", "aria-label": "Note" } });
  notGir.value = not ? not + ": " : "";
  const d = durumSatiri();
  const gonder = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Send report" });
  gonder.addEventListener("click", async () => {
    gonder.disabled = true;
    try {
      const n = Number(neden.value);
      if (!n) throw new Error("Choose a reason.");
      const metin = notGir.value.trim();
      if (bayt(metin) > Y.NOT_AZAMI) throw new Error("The note is " + bayt(metin) + " bytes; at most " + Y.NOT_AZAMI + ".");
      await yorumGonder({ cuzdan, data: Y.veriY.bildir(nft, id, n, metin), durum: (m, t) => durumYaz(d, m, t), aciklama: "Confirm the public report" });
      durumYaz(d, "Reported on Arc. The moderator reads reports from the chain; thank you.", "ok");
      setTimeout(kapat, 1800);
    } catch (e) { durumYaz(d, (e && e.message) || String(e), "hata"); }
    finally { gonder.disabled = false; }
  });
  govde.append(el("label", {}, ["Reason", neden]), el("label", {}, ["Note", notGir]), gonder, d,
    el("p", { sinif: "ds-cihaz", yazi: "A report is a public event on Arc: your wallet and the note are visible to everyone. Do not include private details. A report alone changes nothing on the page; the moderator decides." }));
  document.body.append(perde);
  neden.focus();
}
