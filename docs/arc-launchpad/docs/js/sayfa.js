/* ===========================================================================
 * sayfa.js — the little script the static pages share (halo, squad, warp,
 * launch-memecoin; 13 Nov 2026). No data leaves the page and nothing is stored.
 *
 *   - the phone menu (a <details>, opens without script) closes after a link
 *     is chosen, on Escape, or when a tap lands outside it — as on index.html;
 *   - Escape moves focus out of the desktop "More" panel so it closes;
 *   - a button with data-kopya="<text>" copies that text (a contract address).
 * =========================================================================== */
const menu = document.querySelector("details.mmenu");
if (menu) {
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) menu.open = false; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } });
  document.addEventListener("click", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const d = document.activeElement && document.activeElement.closest(".drop");
  if (d) document.activeElement.blur();
});

async function kopyala(metin) {
  try { await navigator.clipboard.writeText(metin); return true; } catch { /* older browsers: a hidden field */ }
  const t = document.createElement("textarea");
  t.value = metin; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
  document.body.append(t); t.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; }
  t.remove(); return ok;
}
for (const b of document.querySelectorAll("button[data-kopya]")) {
  const ilk = b.textContent;
  b.addEventListener("click", async () => {
    const ok = await kopyala(b.dataset.kopya);
    b.textContent = ok ? "Copied" : "Select and copy";
    b.classList.toggle("tamam", ok);
    setTimeout(() => { b.textContent = ilk; b.classList.remove("tamam"); }, 1800);
  });
}
