/* ===========================================================================
 * gorunum/terminal.js — Trade (#/terminal)
 *
 * Every launch made from ARC PULSE (no upper limit: the paged index of launch-kaynak.js) (through Warp onto another launchpad, or on our own launchpad on Arc, Sui and
 * Aptos) as a grid of cards, built to stay usable at thousands of launches:
 *   - search, route filter (All / Warp / ARC PULSE) and chain filter; newest first
 *   - 24 cards a page with "Load more"; market figures are read only for the cards on screen, in batches
 *     (DexScreener takes up to 30 tokens a call; Arc pools from GeckoTerminal's multi-token call)
 * A card opens the token's own page, #/terminal?t=<token>: its chart, market facts and a way to trade it
 * (gorunum/warp-token.js tokenDetay), with a way back to the grid.
 * #/terminal?ag=&t= (a token on a named chain) still opens the chain-aware view in terminal-ag.js.
 * =========================================================================== */
import { el, sayfaUst, bos, not, temizle } from "../ui.js";
import { squadOf, squadResim } from "../squad.js";

const SAYFA = 24;
const DS = { bsc: "bsc", elysium: "elysium", solana: "solana", base: "base", monad: "monad", robinhood: "robinhood" };
const RENK = { Arc: "#7c5cff", Base: "#0052ff", Arbitrum: "#28a0f0", Ethereum: "#627eea", "BNB Chain": "#f0b90b", Avalanche: "#e84142",
  Monad: "#836ef9", HyperEVM: "#50e3c2", Robinhood: "#ccff00", Elysium: "#c6f86b", Solana: "#14f195", Sui: "#4da2ff", Aptos: "#2ed8a7" };

const STIL = `
.tr-arac{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.tr-ara{flex:1 1 260px;max-width:420px}
.tr-seg{display:inline-flex;border:1px solid var(--cizgi,#2a2f3a);border-radius:12px;overflow:hidden}
.tr-seg button{background:none;border:0;color:inherit;padding:9px 14px;font-weight:700;font-size:13px;cursor:pointer;opacity:.7}
.tr-seg button[aria-pressed="true"]{background:var(--marka,#7c5cff);opacity:1;color:#fff}
.tr-zc{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.tr-zc button{border:1px solid var(--cizgi,#2a2f3a);background:none;color:inherit;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:700;cursor:pointer;opacity:.75}
.tr-zc button[aria-pressed="true"]{opacity:1;border-color:var(--z,#7c5cff);background:color-mix(in srgb,var(--z,#7c5cff) 16%,transparent)}
.tr-say{font-size:13px;opacity:.7;margin:14px 0 8px}
.tr-izgara{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.tr-kart{position:relative;display:flex;flex-direction:column;border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a);transition:transform .15s ease,border-color .15s ease,box-shadow .15s ease}
.tr-kart:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--z,#7c5cff) 70%,transparent);box-shadow:0 10px 30px rgba(0,0,0,.35)}
.tr-gorsel{position:relative;aspect-ratio:16/10;display:grid;place-items:center;background:radial-gradient(120% 120% at 30% 20%,color-mix(in srgb,var(--z,#7c5cff) 35%,transparent),transparent 65%),#0d0f15}
.tr-gorsel img{width:62%;height:78%;object-fit:contain;filter:drop-shadow(0 8px 20px rgba(0,0,0,.45))}
.tr-gorsel img.tam{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:none}
.tr-gorsel .h{font-size:34px;font-weight:900;letter-spacing:.02em;color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.4)}
.tr-rozet{position:absolute;top:10px;left:10px;z-index:1;font-size:10.5px;font-weight:800;text-transform:uppercase;padding:3px 8px;border-radius:999px}
.tr-rozet.warp{background:linear-gradient(90deg,#7c5cff,#14b8a6);color:#fff}.tr-rozet.biz{background:rgba(10,10,20,.7);color:#cbbcff;border:1px solid rgba(124,92,255,.6)}
.tr-z{position:absolute;top:10px;right:10px;z-index:1;font-size:11px;font-weight:800;padding:3px 8px;border-radius:999px;background:rgba(10,10,20,.7);border:1px solid color-mix(in srgb,var(--z) 60%,transparent);color:var(--z)}
.tr-sq{position:absolute;bottom:10px;left:10px;z-index:1;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:#c6f86b;color:#10140a}
.tr-govde{padding:12px 14px 14px;display:flex;flex-direction:column;gap:6px}
.tr-ad{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.tr-ad b{font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tr-ad span{font-size:12px;opacity:.6;flex:none}
.tr-alt{font-size:12.5px;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-sayi{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:4px;padding-top:10px;border-top:1px solid var(--cizgi,#2a2f3a)}
.tr-sayi small{display:block;font-size:10.5px;opacity:.6;text-transform:uppercase;letter-spacing:.04em}.tr-sayi b{font-size:13.5px}
.tr-up{color:#22c55e}.tr-dn{color:#ef4444}
.tr-daha{display:flex;justify-content:center;margin-top:16px}
.tr-geri{align-self:flex-start}
@media (max-width:520px){.tr-izgara{grid-template-columns:1fr 1fr;gap:10px}.tr-gorsel .h{font-size:22px}.tr-sayi{grid-template-columns:1fr 1fr}.tr-sayi>div:last-child{display:none}.tr-rozet{font-size:9px}.tr-lp{display:none}}
`;

const para = (x) => {
  const n = Number(x);
  if (!isFinite(n) || n <= 0) return "—";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  if (n >= 1) return "$" + n.toFixed(2);
  if (n >= 0.0001) return "$" + n.toPrecision(3);
  const sifir = Math.floor(-Math.log10(n));
  return "$0.0" + String(sifir).split("").map((c) => "₀₁₂₃₄₅₆₇₈₉"[c]).join("") + Math.round(n * 10 ** (sifir + 3)).toString().slice(0, 3);
};
const yas = (sn) => {
  if (!sn) return "";
  const d = (Date.now() / 1000 - sn) / 60;
  return d < 60 ? Math.max(1, Math.round(d)) + "m ago" : d < 1440 ? Math.round(d / 60) + "h ago" : Math.round(d / 1440) + "d ago";
};
const ton = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/* market figures for a batch of cards: { token(lowercase): { fiyat, mcap, deg, resim } } */
async function piyasaToplu(satirlar) {
  const out = {};
  const grup = {};
  for (const s of satirlar) (grup[s.zk] = grup[s.zk] || []).push(s.token);
  await Promise.all(Object.entries(grup).map(async ([zk, tokenlar]) => {
    for (let i = 0; i < tokenlar.length; i += 30) {
      const parca = tokenlar.slice(i, i + 30);
      if (DS[zk]) {
        const r = await fetch("https://api.dexscreener.com/tokens/v1/" + DS[zk] + "/" + parca.join(",")).then((x) => x.json()).catch(() => []);
        for (const c of Array.isArray(r) ? r : []) {
          const k = String(c.baseToken && c.baseToken.address).toLowerCase();
          if (out[k] && Number(out[k].lik || 0) >= Number((c.liquidity || {}).usd || 0)) continue;
          out[k] = { fiyat: c.priceUsd, mcap: c.marketCap || c.fdv, deg: (c.priceChange || {}).h24, lik: (c.liquidity || {}).usd, resim: c.info && c.info.imageUrl };
        }
      } else if (zk === "arc") {
        /* our own pools: the price straight from the pool on Arc, market cap from the fixed supply */
        const [{ havuzFiyati }, { YedekliOkur }, { Contract }] = await Promise.all([import("./merkez.js"), import("../yedekli-okur.js"), import("../../vendor/ethers.min.js")]);
        const okur = new YedekliOkur();
        const satirBul = (t) => satirlar.find((x) => x.token === t);
        await Promise.all(parca.map(async (t) => {
          const sr = satirBul(t);
          const [f, arz] = await Promise.all([havuzFiyati(t, sr && sr.cfg ? sr.cfg.lp5 : undefined).catch(() => null),
            new Contract(t, ["function totalSupply() view returns (uint256)"], okur).totalSupply().catch(() => null)]);
          if (f && isFinite(f) && f > 0) out[t.toLowerCase()] = { fiyat: f, mcap: arz ? f * Number(arz) / 1e18 : null, deg: null };
        }));
      }
    }
  }));
  return out;
}

function kart(s) {
  const m = squadOf(s.token);
  const z = RENK[s.zincir] || "#7c5cff";
  const res = s.gorsel || (m ? squadResim(m) : null);
  const gorsel = el("div", { sinif: "tr-gorsel", attr: { style: res ? "" : "background:linear-gradient(135deg,hsl(" + ton(s.token) + " 65% 42%),hsl(" + ((ton(s.token) + 80) % 360) + " 65% 22%))" } }, [
    res ? el("img", { attr: { src: res, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span", { sinif: "h", yazi: "$" + String(s.sembol || "?").slice(0, 6).toUpperCase() }),
    el("span", { sinif: "tr-rozet " + s.tur }, s.tur === "warp" ? ["Warp ⚡", el("span", { sinif: "tr-lp", yazi: " " + s.lp })] : ["ARC PULSE"]),
    el("span", { sinif: "tr-z", attr: { style: "--z:" + z }, yazi: s.zincir }),
    m ? el("span", { sinif: "tr-sq", yazi: "PULSE SQUAD" }) : null,
  ]);
  const fiyat = el("b", { yazi: "…" }), mcap = el("b", { yazi: "…" }), deg = el("b", { yazi: "…" });
  const a = el("a", { sinif: "tr-kart", attr: { href: "#/terminal?t=" + encodeURIComponent(s.token), style: "--z:" + z } }, [
    gorsel,
    el("div", { sinif: "tr-govde" }, [
      el("div", { sinif: "tr-ad" }, [el("b", { yazi: s.ad || s.sembol || "?" }), el("span", { yazi: yas(s.zaman) })]),
      el("div", { sinif: "tr-alt", yazi: (s.sembol ? "$" + s.sembol + " · " : "") + s.lp }),
      el("div", { sinif: "tr-sayi" }, [el("div", {}, [el("small", { yazi: "Price" }), fiyat]), el("div", {}, [el("small", { yazi: "Mcap" }), mcap]), el("div", {}, [el("small", { yazi: "24h" }), deg])]),
    ]),
  ]);
  a._doldur = (v) => {
    if (!v) { fiyat.textContent = "—"; mcap.textContent = "—"; deg.textContent = "—"; return; }
    fiyat.textContent = para(v.fiyat); mcap.textContent = para(v.mcap);
    const d = v.deg == null || isNaN(v.deg) ? null : Math.abs(v.deg) < 0.05 ? 0 : Number(v.deg);
    deg.textContent = d == null ? "—" : (d > 0 ? "+" : "") + d.toFixed(1) + "%";
    deg.className = d > 0 ? "tr-up" : d < 0 ? "tr-dn" : "";
    /* a token with no picture of ours: the one its market page shows, over the ticker */
    if (!res && v.resim) gorsel.prepend(el("img", { sinif: "tam", attr: { src: v.resim, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }, on: { error: (e) => e.target.remove() } }));
  };
  return a;
}

async function detay(K, istenen) {
  const { tokenDetay } = await import("./warp-token.js");
  const kap = el("div", { sinif: "yigin" });
  const s = await K.bul(istenen);
  kap.append(el("a", { sinif: "dugme dugme--sade dugme--kucuk tr-geri", attr: { href: "#/terminal" }, yazi: "← Back to Trade" }));
  if (!s) { kap.append(bos("Not an ARC PULSE launch", "This token was not launched from ARC PULSE. Every other token is in Market.", el("a", { sinif: "dugme dugme--marka", attr: { href: "#/vitrin" }, yazi: "Open Market" }))); return kap; }
  kap.append(tokenDetay(s));
  return kap;
}

export async function ciz({ param } = {}) {
  if (param && param.get("ag")) return (await import("./terminal-ag.js")).ciz({ param });
  if (!document.getElementById("tr-stil")) document.head.append(el("style", { attr: { id: "tr-stil" }, yazi: STIL }));
  const K = await (await import("../launch-kaynak.js")).launchKaynagi();
  const satirlar = K.satirlar, hatalar = K.hatalar;
  const istenen = decodeURIComponent((param && param.get("t")) || "").trim().toLowerCase();
  if (istenen) return detay(K, istenen);

  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Trade", "Every token launched from ARC PULSE, through Warp or on our own launchpad. Tap one for its chart and to trade it."));
  if (hatalar.length) kap.append(not("Could not read every launch source right now (" + hatalar.join(", ") + "); the rest is shown.", "uyari"));
  if (!satirlar.length) {
    kap.append(bos("No launches yet", "The first token launched from ARC PULSE appears here.", el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" }, yazi: "Create a token" })));
    return kap;
  }

  let tur = "hepsi", zincir = null, gosterilen = SAYFA;
  const ara = el("input", { sinif: "girdi tr-ara", attr: { placeholder: "Search name, ticker, launchpad or contract address", autocomplete: "off", type: "search" } });
  const seg = el("div", { sinif: "tr-seg", attr: { role: "tablist" } });
  const zc = el("div", { sinif: "tr-zc" });
  const sayac = el("div", { sinif: "tr-say" });
  const izgara = el("div", { sinif: "tr-izgara" });
  const daha = el("div", { sinif: "tr-daha" });
  const segCiz = () => temizle(seg).append(...[["hepsi", "All"], ["warp", "Warp"], ["biz", "ARC PULSE"]].map(([k, ad]) => el("button", { attr: { type: "button", "aria-pressed": String(tur === k) }, yazi: ad + (k === "hepsi" ? " · " + K.toplam : ""),
    on: { click: () => { tur = k; gosterilen = SAYFA; segCiz(); ciz2(); } } })));
  const zcCiz = () => temizle(zc).append(...[null, ...new Set(satirlar.map((s) => s.zincir))].map((z) => el("button", { attr: { type: "button", "aria-pressed": String(z === zincir), style: "--z:" + (RENK[z] || "#7c5cff") }, yazi: z || "All chains",
    on: { click: () => { zincir = z; gosterilen = SAYFA; zcCiz(); ciz2(); } } })));

  /* market figures for cards as they come on screen, a batch at a time */
  const bekleyen = new Set();
  let zaman = null;
  const gozcu = new IntersectionObserver((girdiler) => {
    for (const g of girdiler) if (g.isIntersecting) { bekleyen.add(g.target); gozcu.unobserve(g.target); }
    clearTimeout(zaman);
    zaman = setTimeout(async () => {
      const kartlar = [...bekleyen]; bekleyen.clear();
      if (!kartlar.length) return;
      const v = await piyasaToplu(kartlar.map((k) => k._satir)).catch(() => ({}));
      for (const k of kartlar) k._doldur(v[String(k._satir.token).toLowerCase()]);
    }, 150);
  }, { rootMargin: "200px" });

  let sira = 0;
  const ciz2 = async () => {
    const bu = ++sira;
    const q = ara.value.trim().toLowerCase();
    const uyar = (s) => (tur === "hepsi" || s.tur === tur) && (!zincir || s.zincir === zincir) &&
      (!q || [s.ad, s.sembol, s.lp, s.zincir].some((v) => String(v || "").toLowerCase().includes(q)) || String(s.token).toLowerCase() === q);
    /* older index files are loaded only as far as this page of matches needs */
    const { liste, tam } = await K.sec(uyar, gosterilen + 1);
    if (bu !== sira) return;
    const toplamYazi = tam ? String(liste.length) : liste.length + "+";
    sayac.textContent = liste.length ? "Showing " + Math.min(gosterilen, liste.length) + " of " + (tur === "hepsi" && !zincir && !q ? K.toplam : toplamYazi) + " · newest first" : "";
    temizle(izgara); temizle(daha);
    if (!liste.length) { izgara.append(bos("No launches match", "Try another name, chain or route.")); return; }
    for (const s of liste.slice(0, gosterilen)) { const k = kart(s); k._satir = s; izgara.append(k); gozcu.observe(k); }
    if (liste.length > gosterilen || !tam) daha.append(el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Load more",
      on: { click: () => { gosterilen += SAYFA; ciz2().then(zcCiz); } } }));
  };
  let araZaman = null;
  ara.addEventListener("input", () => { clearTimeout(araZaman); araZaman = setTimeout(() => { gosterilen = SAYFA; ciz2(); }, 200); });

  kap.append(el("div", {}, [el("div", { sinif: "tr-arac" }, [ara, seg]), zc]));
  kap.append(el("div", {}, [sayac, izgara, daha]));
  kap.append(el("div", { sinif: "satir", attr: { style: "gap:10px;flex-wrap:wrap" } }, [
    el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: "#/launches" }, yazi: "All launches as a table →" }),
    el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: "#/vitrin" }, yazi: "Any other token: Market →" })]));
  segCiz(); zcCiz(); ciz2();
  return kap;
}
