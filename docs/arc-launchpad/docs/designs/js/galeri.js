/* ===========================================================================
 * designs/js/galeri.js — the image carousel of a design page
 *
 * A design's metadata may carry up to 4 more watermarked previews
 * (`images`, meta.js gorseller); with one image this is the plain preview
 * box. Accessible: a labelled region (aria-roledescription "carousel"),
 * one slide shown at a time ("2 of 4"), Previous / Next buttons, a dot per
 * image, the arrow keys / Home / End while it has focus, and a swipe on
 * touch screens. Images come only from the storage the page's CSP allows.
 * =========================================================================== */
import { el, temizle, resimKutusu } from "./ortak.js";
import { cozUrl, gorseller } from "../../js/designs/meta.js";

const kaynak = (u) => (/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/.test(String(u || "")) ? u : cozUrl(u));

export function galeri(meta, uri, ad, sinif = "dz-tasarim__resim") {
  const l = gorseller(meta).map(kaynak).filter(Boolean);
  if (l.length <= 1) return resimKutusu(uri, sinif, ad);
  let i = 0;
  const n = l.length;
  const slaytlar = l.map((src, k) => el("div", { sinif: "dz-galeri__slayt", attr: { role: "group", "aria-roledescription": "slide", "aria-label": (k + 1) + " of " + n, ...(k ? { hidden: "" } : {}) } }, [
    el("img", { attr: { src, alt: ad + " — image " + (k + 1) + " of " + n + " (preview)", loading: k ? "lazy" : "eager", referrerpolicy: "no-referrer", draggable: "false" },
      on: { error: (e) => { e.target.replaceWith(el("div", { sinif: "ds-kart__yer", yazi: "Preview not reachable" })); } } })]));
  const noktalar = el("div", { sinif: "dz-galeri__noktalar" });
  const sayac = el("div", { sinif: "dz-galeri__sayac", attr: { "aria-hidden": "true" } });
  const canli = el("div", { sinif: "dz-gizli-yazi", attr: { "aria-live": "polite" } });
  const git = (k, duyur = true) => {
    i = (k + n) % n;
    slaytlar.forEach((s, j) => { s.hidden = j !== i; });
    temizle(noktalar);
    for (let j = 0; j < n; j++) noktalar.append(el("button", { sinif: "dz-galeri__nokta", attr: { type: "button", "aria-label": "Show image " + (j + 1), ...(j === i ? { "aria-current": "true" } : {}) }, on: { click: () => git(j) } }));
    sayac.textContent = (i + 1) + " / " + n;
    if (duyur) canli.textContent = "Image " + (i + 1) + " of " + n;
  };
  const ok = (yon, etiket, isaret) => el("button", { sinif: "dz-galeri__ok dz-galeri__ok--" + yon, attr: { type: "button", "aria-label": etiket }, yazi: isaret, on: { click: () => git(i + (yon === "sol" ? -1 : 1)) } });
  const sahne = el("div", { sinif: "dz-galeri__sahne" }, slaytlar);
  const kap = el("section", { sinif: sinif + " dz-galeri", attr: { "aria-roledescription": "carousel", "aria-label": ad + " — " + n + " images", tabindex: "0" } }, [
    sahne, ok("sol", "Previous image", "‹"), ok("sag", "Next image", "›"), sayac, noktalar, canli]);
  kap.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { git(i - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { git(i + 1); e.preventDefault(); }
    else if (e.key === "Home") { git(0); e.preventDefault(); }
    else if (e.key === "End") { git(n - 1); e.preventDefault(); }
  });
  /* swipe */
  let x0 = null;
  sahne.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  sahne.addEventListener("pointerup", (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) git(i + (dx < 0 ? 1 : -1)); });
  sahne.addEventListener("pointercancel", () => { x0 = null; });
  git(0, false);
  return kap;
}
