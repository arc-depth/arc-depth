/* ===========================================================================
 * launch-basari.js — the card shown after a launch is confirmed
 *
 * Used by the ARC PULSE launch (gorunum/merkez.js), the Sui / Aptos launch
 * (gorunum/olustur.js) and Warp (gorunum/warp.js). It is only called once
 * the calling code has confirmed the launch and read the token's address:
 * it reads nothing, signs nothing and sends nothing. It celebrates the act
 * of creating a token; it never mentions a price.
 *
 * The "Promote this launch" link at the bottom goes to #/advertise, ARC
 * PULSE's own sponsored-slot page, and is set apart and labelled.
 * =========================================================================== */
import { el } from "./ui.js";

const STIL = `
.lb{position:relative;display:grid;gap:16px;border:1px solid var(--marka-cizgi);border-radius:20px;padding:22px;
  background:radial-gradient(120% 120% at 0% 0%,rgba(155,232,189,.10),transparent 55%),var(--yuzey-1);overflow:hidden}
.lb:focus{outline:none}
.lb__ust{display:flex;gap:16px;align-items:center;min-width:0}
.lb__halka{position:relative;flex:none;width:60px;height:60px;border-radius:50%;display:grid;place-items:center;
  background:rgba(155,232,189,.12);color:var(--mint,#9be8bd);box-shadow:inset 0 0 0 2px var(--mint,#9be8bd)}
.lb__halka svg{width:28px;height:28px}
.lb__halka::before,.lb__halka::after{content:"";position:absolute;inset:0;border-radius:50%;border:2px solid var(--mint,#9be8bd);
  opacity:0;animation:lb-halka 1.1s cubic-bezier(.2,.7,.3,1) 3 both}
.lb__halka::after{animation-delay:.35s}
@keyframes lb-halka{0%{transform:scale(1);opacity:.85}100%{transform:scale(2.2);opacity:0}}
@media (prefers-reduced-motion:reduce){.lb__halka::before,.lb__halka::after{animation:none;opacity:.3;transform:scale(1.28)}.lb__halka::after{display:none}}
.lb__ust h2{margin:0;font-size:clamp(20px,3.2vw,26px);line-height:1.15;font-weight:800;letter-spacing:-.01em}
.lb__ust p{margin:4px 0 0;color:var(--yazi-2);font-size:14px}
.lb__ca{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--yuzey-2);border:1px solid var(--cizgi-guclu);border-radius:14px;padding:10px 12px}
.lb__ca span{font-size:12px;color:var(--yazi-3);text-transform:uppercase;letter-spacing:.08em;font-weight:700}
.lb__ca code{flex:1 1 220px;min-width:0;font-family:var(--yazi-tipi-mono);font-size:13px;word-break:break-all;color:var(--yazi-1)}
.lb__eylem{display:flex;gap:8px;flex-wrap:wrap}
.lb__eylem .dugme{text-decoration:none}
.lb__alt{font-size:14px;color:var(--yazi-2);margin:0}
.lb__liste{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.lb__liste li{display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--yazi-1)}
.lb__liste input{margin-top:3px;accent-color:var(--marka);flex:none}
.lb__liste a{color:var(--marka-parlak)}
.lb__baslik{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--yazi-3)}
.lb__sponsor{border-top:1px dashed var(--cizgi-guclu);padding-top:14px;display:grid;gap:6px}
.lb__sponsor a{color:var(--marka-parlak);font-weight:700;text-decoration:none}
.lb__sponsor a:hover{text-decoration:underline}
.lb__sponsor b{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;border:1px solid var(--cizgi-guclu);border-radius:999px;padding:2px 8px;color:var(--yazi-2);margin-right:6px}
`;

const ONAY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';

function stilEkle() {
  if (!document.getElementById("lb-stil")) document.head.append(el("style", { attr: { id: "lb-stil" }, yazi: STIL }));
}

/** An absolute link to a page of this app (for sharing). */
export function uygulamaLinki(hash) {
  return location.origin + location.pathname + hash;
}

/**
 * @param {object} o
 * @param {string} o.ad        token name
 * @param {string} o.sembol    ticker
 * @param {string} o.token     token address (or coin type)
 * @param {string} o.nerede    where it was launched, e.g. "ARC PULSE · one pool on Arc" or "Montra on Elysium"
 * @param {string} [o.sayfa]   the token page inside the app (default #/terminal?t=<token>)
 * @param {{ad:string, link:string}} [o.dis]  the token on an external launchpad / explorer
 * @param {string} [o.paylasYazi]  the X post's text (neutral: what was launched; no price talk)
 * @param {string} [o.alt]     one extra plain line (e.g. "You hold about …")
 * @param {{yazi:string, href?:string, dis?:boolean}[]} [o.adimlar]  next steps
 */
export function basariKarti(o) {
  stilEkle();
  const sembol = String(o.sembol || "").toUpperCase();
  const sayfa = o.sayfa || "#/terminal?t=" + o.token;
  const sayfaTam = uygulamaLinki(sayfa);
  const paylas = o.paylasYazi || ("I just launched $" + sembol + (o.ad ? " (" + o.ad + ")" : "") + " on ARC PULSE.");
  const xLink = "https://x.com/intent/post?text=" + encodeURIComponent(paylas) + "&url=" + encodeURIComponent(sayfaTam);

  const kopyala = (dugme) => async () => {
    try { await navigator.clipboard.writeText(o.token); dugme.textContent = "Copied"; }
    catch (e) { dugme.textContent = "Select and copy above"; }
    setTimeout(() => { dugme.textContent = dugme._yazi; }, 1800);
  };
  const kDugme = (sinif, yazi) => { const b = el("button", { sinif: "dugme " + sinif, attr: { type: "button" }, yazi }); b._yazi = yazi; b.addEventListener("click", kopyala(b)); return b; };

  const adimlar = o.adimlar || [
    { yazi: "Share the launch on X (button above)" },
    { yazi: "Open your token page and check its details", href: sayfa },
    { yazi: "Post the token page link in your community (Telegram, Discord)" },
    { yazi: "See it listed in All launches", href: "#/launches" },
  ];

  const kart = el("section", { sinif: "lb", attr: { role: "status", "aria-live": "polite", tabindex: "-1" } }, [
    el("div", { sinif: "lb__ust" }, [
      el("div", { sinif: "lb__halka", html: ONAY }),
      el("div", { attr: { style: "min-width:0" } }, [
        el("h2", { yazi: "You launched $" + sembol }),
        el("p", { yazi: (o.ad ? o.ad + " · " : "") + (o.nerede || "ARC PULSE") }),
      ]),
    ]),
    el("div", { sinif: "lb__ca" }, [el("span", { yazi: "Token address" }), el("code", { yazi: o.token }), kDugme("dugme--sessiz dugme--kucuk", "Copy")]),
    o.alt ? el("p", { sinif: "lb__alt", yazi: o.alt }) : null,
    el("div", { sinif: "lb__eylem" }, [
      el("a", { sinif: "dugme dugme--marka", attr: { href: sayfa }, yazi: "Open token page" }),
      kDugme("dugme--sessiz", "Copy address"),
      el("a", { sinif: "dugme dugme--sessiz", attr: { href: xLink, target: "_blank", rel: "noopener noreferrer" }, yazi: "Share on X ↗" }),
      o.dis && o.dis.link ? el("a", { sinif: "dugme dugme--sessiz", attr: { href: o.dis.link, target: "_blank", rel: "noopener noreferrer" }, yazi: "Open on " + o.dis.ad + " ↗" }) : null,
    ]),
    el("div", { sinif: "yigin yigin--sik" }, [
      el("div", { sinif: "lb__baslik", yazi: "Next steps" }),
      el("ul", { sinif: "lb__liste" }, adimlar.map((a, i) => {
        const id = "lb-adim-" + Math.random().toString(36).slice(2, 8) + i;
        return el("li", {}, [el("input", { attr: { type: "checkbox", id } }),
          el("label", { attr: { for: id } }, [a.href ? el("a", { attr: { href: a.href, ...(a.dis ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, yazi: a.yazi }) : a.yazi])]);
      })),
    ]),
    el("div", { sinif: "lb__sponsor" }, [
      el("div", {}, [el("b", { yazi: "Sponsored" }), el("a", { attr: { href: "#/advertise" }, yazi: "Promote this launch — Sponsored slots →" })]),
      el("div", { sinif: "alan__ipucu", yazi: "Optional and separate from your launch: paid placements on ARC PULSE, always shown with a visible \"Sponsored\" label." }),
    ]),
  ]);
  /* bring it into view once it is in the page */
  requestAnimationFrame(() => { try { kart.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); kart.focus({ preventScroll: true }); } catch (e) { /* detached */ } });
  return kart;
}
