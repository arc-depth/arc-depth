/* ===========================================================================
 * gorunum/perp-radar.js — Perp Radar (#/perp-radar). 23 Nov 2026, owner: "perp radar nerde … trade sekmesine koy".
 *
 * For visitors: every Hyperliquid perp run through four published rules — Turtle breakouts (Faith), Connors RSI(2),
 * Carver trend strength, and the crowded-side funding + open-interest check — each shown with its source and its
 * known weakness. A lens switch re-arranges the radar by the chosen rule. It states which rule a market meets now;
 * it is not a buy / sell call and never shows ARC PULSE's own trading. Data: veri/perp-radar.json
 * (scripts/perp-radar.js, every 2 h); prices refreshed live from Hyperliquid's public API. Nothing about the
 * visitor is sent anywhere or stored. Not advice.
 * =========================================================================== */
import { el } from "../ui.js";

const LENS = [["turtle", "Turtle breakouts"], ["rsi2", "RSI(2) pullbacks"], ["trend", "Trend strength"], ["kalabalik", "Crowded side"]];
const STIL = `
.pr{display:flex;flex-direction:column;gap:14px;min-width:0;max-width:1100px;margin:0 auto}
.pr-ust h1{margin:0;font-size:26px}.pr-ust p{margin:4px 0 0;color:var(--yazi-3);font-size:13.5px;line-height:1.5;max-width:780px}
.pr-canli{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--alis);font-weight:600}.pr-canli::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--alis);box-shadow:0 0 8px var(--alis);animation:prN 1.4s infinite}
@keyframes prN{50%{opacity:.3}}
.pr-lens{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}.pr-lens::-webkit-scrollbar{display:none}
.pr-lens button{flex:none;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--cizgi-guclu);background:none;color:var(--yazi-2);font:600 13.5px var(--yazi-tipi);cursor:pointer}
.pr-lens button[aria-pressed=true]{border-color:var(--marka);background:rgba(124,92,255,.16);color:var(--yazi-1)}
.pr-izgara{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px}
.pr-kutu{background:var(--yuzey-1);border:1px solid var(--cizgi);border-radius:16px;padding:14px;min-width:0}
.pr-kutu h2{margin:0 0 10px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--yazi-3);font-weight:700;display:flex;justify-content:space-between;gap:8px}
.pr-kutu h2 span:last-child{text-transform:none;letter-spacing:0;font-weight:500}
.pr-radar{position:relative;background:radial-gradient(circle at 50% 50%,#0f1a2a 0,#06090f 70%);border-radius:12px;overflow:hidden}
.pr-radar canvas{display:block;width:100%;height:440px;cursor:crosshair}
.pr-ipucu{position:absolute;pointer-events:none;background:rgba(10,12,20,.94);border:1px solid var(--cizgi-guclu);border-radius:10px;padding:8px 10px;font-size:12px;max-width:230px;display:none}
.pr-kimlik{background:var(--yuzey-0);border:1px solid var(--cizgi);border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.55;color:var(--yazi-2);margin-bottom:10px}
.pr-kimlik b{color:var(--yazi-1)}.pr-kimlik .z{color:#f5c26b}
.pr-akis{display:flex;flex-direction:column;gap:6px;max-height:380px;overflow:auto}
.pr-olay{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:var(--yuzey-0);border:1px solid var(--cizgi);color:inherit;text-decoration:none}
.pr-olay:hover{border-color:var(--marka)}.pr-olay b{font-size:14px}.pr-olay small{display:block;color:var(--yazi-3);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pr-ok{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;font-weight:800}
.pr-ok--y{background:rgba(46,209,138,.14);color:var(--alis)}.pr-ok--a{background:rgba(255,107,122,.14);color:var(--satis)}
.pr-tablo-kap{background:var(--yuzey-1);border:1px solid var(--cizgi);border-radius:16px;overflow:auto}
.pr-tablo{width:100%;border-collapse:collapse;font-size:13px;min-width:760px}
.pr-tablo th{text-align:left;color:var(--yazi-3);font-weight:600;font-size:11.5px;padding:9px 10px;border-bottom:1px solid var(--cizgi);cursor:pointer;white-space:nowrap;position:sticky;top:0;background:var(--yuzey-1)}
.pr-tablo td{padding:9px 10px;border-bottom:1px solid var(--cizgi);font-variant-numeric:tabular-nums;white-space:nowrap}
.pr-tablo tr:hover td{background:var(--yuzey-2)}.pr-tablo a{color:var(--yazi-1);font-weight:700;text-decoration:none}
.pr-art{color:var(--alis)}.pr-eks{color:var(--satis)}.pr-sar{color:#f5c26b}.pr-gri{color:var(--yazi-3)}
.pr-bar{display:inline-block;width:70px;height:6px;background:var(--yuzey-2);border-radius:3px;position:relative;vertical-align:middle;margin-right:6px}.pr-bar i{position:absolute;top:0;bottom:0;border-radius:3px}
.pr-ara{height:38px;border-radius:12px;border:1px solid var(--cizgi-guclu);background:var(--yuzey-0);color:var(--yazi-1);padding:0 12px;font:14px var(--yazi-tipi);min-width:200px;flex:1}
.pr-alt{font-size:12px;color:var(--yazi-3);line-height:1.6}
@media (max-width:860px){.pr-izgara{grid-template-columns:1fr}.pr-radar canvas{height:360px}}
`;
const yuzde = (x, d = 1) => x == null || !Number.isFinite(x) ? "—" : (x > 0 ? "+" : "") + (x * 100).toFixed(d) + "%";
const fiyat = (x) => !(x > 0) ? "—" : x >= 1000 ? x.toLocaleString("en-US", { maximumFractionDigits: 0 }) : x >= 1 ? x.toFixed(3) : x.toPrecision(4);
const kisa = (x) => !(x > 0) ? "—" : "$" + (x >= 1e9 ? (x / 1e9).toFixed(2) + "B" : x >= 1e6 ? (x / 1e6).toFixed(1) + "M" : (x / 1e3).toFixed(0) + "K");
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

/* per lens: radius 0 (centre = the rule fires) … 1 (far), and direction (+1 long side, −1 short side, 0 none) */
function konum(k, lens) {
  if (lens === "turtle") { if (k.turtle.kirdi) return { r: 0.04, yon: /long/.test(k.turtle.kirdi.sinyal) ? 1 : -1, ates: true }; const y = k.turtle.yakin; return y ? { r: 0.1 + 0.9 * Math.sqrt(Math.min(y.uzaklik, 0.4) / 0.4), yon: /long/.test(y.sinyal) ? 1 : -1 } : null; }
  if (lens === "rsi2") { if (k.rsi == null) return null; const yon = k.trend200 || 0, uc = yon >= 0 ? k.rsi / 100 : (100 - k.rsi) / 100; return { r: k.rsiKur ? 0.04 : 0.1 + 0.9 * Math.min(1, uc), yon, ates: !!k.rsiKur }; }
  if (lens === "trend") { if (k.carver == null) return null; const a = Math.abs(k.carver); return { r: 0.06 + 0.94 * (1 - a / 20), yon: Math.sign(k.carver), ates: a >= 15 }; }
  if (k.oi24 == null || k.fon24 == null) return null;
  return { r: k.kalabalik ? 0.05 : 0.15 + 0.85 * (1 - Math.min(1, Math.max(0, k.oi24) / 0.05)), yon: k.fon24 < 0 ? -1 : 1, ates: !!k.kalabalik };
}

export async function ciz() {
  if (!document.getElementById("pr-stil")) document.head.append(el("style", { attr: { id: "pr-stil" }, yazi: STIL }));
  const kok = el("div", { sinif: "pr" }); kok.dataset.icindekilerYok = "1";
  const guncel = el("span", { sinif: "pr-canli", yazi: "Live" });
  kok.append(el("div", { sinif: "pr-ust" }, [el("h1", { yazi: "Perp Radar" }),
    el("p", {}, ["Every Hyperliquid perp run through four published trading rules — Turtle breakouts, Connors RSI(2), Carver trend strength and the crowded-side check. Pick a lens: markets where the rule fires move to the centre. ", guncel])]));
  let veri = null, lens = "turtle", sira = "v", ters = false, vurgu = null;
  const lensBar = el("div", { sinif: "pr-lens", attr: { role: "tablist", "aria-label": "Rule" } });
  const tuval = el("canvas", { attr: { "aria-label": "Radar of Hyperliquid perps by the chosen rule" } }), ipucu = el("div", { sinif: "pr-ipucu" });
  const kimlik = el("div", { sinif: "pr-kimlik" }), akis = el("div", { sinif: "pr-akis" });
  const radarBaslik = el("span");
  kok.append(lensBar, el("div", { sinif: "pr-izgara" }, [
    el("div", { sinif: "pr-kutu" }, [el("h2", {}, [el("span", { yazi: "The radar" }), radarBaslik]), el("div", { sinif: "pr-radar" }, [tuval, ipucu])]),
    el("div", { sinif: "pr-kutu" }, [el("h2", {}, [el("span", { yazi: "The rule" }), el("span", { yazi: "source and weak spot" })]), kimlik, el("h2", { attr: { style: "margin-top:4px" } }, [el("span", { yazi: "On the radar now" }), el("span", { yazi: "tap to trade" })]), akis])]));
  const ara = el("input", { sinif: "pr-ara", attr: { type: "search", placeholder: "Search market (BTC, SOL…)", "aria-label": "Search markets" } });
  const tablo = el("table", { sinif: "pr-tablo" });
  const alt = el("p", { sinif: "pr-alt" });
  kok.append(el("div", { attr: { style: "display:flex;gap:8px" } }, [ara]), el("div", { sinif: "pr-tablo-kap", attr: { style: "max-height:620px" } }, [tablo]), alt);

  const isle = (yon) => yon > 0 ? "pr-art" : yon < 0 ? "pr-eks" : "pr-gri";
  function ciz_() {
    if (!veri) return;
    lensBar.replaceChildren(...LENS.map(([k, a]) => el("button", { attr: { type: "button", role: "tab", "aria-pressed": String(lens === k) }, yazi: a, on: { click: () => { lens = k; ciz_(); } } })));
    const kr = (veri.kurallar || {})[lens] || {};
    kimlik.replaceChildren(el("div", {}, [el("b", { yazi: kr.ad || "" })]), el("div", { attr: { style: "color:var(--yazi-3);font-size:11.5px;margin:2px 0 6px" }, yazi: "Source: " + (kr.kaynak || "") }),
      el("div", { yazi: kr.nedir || "" }), el("div", { sinif: "z", attr: { style: "margin-top:6px" } }, ["Weak spot: ", kr.zayif || ""]));
    const ol = (veri.olay || []).filter((o) => o.kural === lens);
    radarBaslik.textContent = ol.length + " firing · size = volume · green long side, red short side";
    akis.replaceChildren(...(ol.length ? ol.slice(0, 30).map((o) => el("a", { sinif: "pr-olay", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(o.c) } }, [
      el("span", { sinif: "pr-ok " + (o.yon > 0 ? "pr-ok--y" : "pr-ok--a"), yazi: o.yon > 0 ? "▲" : "▼" }), el("span", {}, [el("b", { yazi: o.c }), el("small", { yazi: o.metin + " · vol " + kisa(o.v) })])]))
      : [el("div", { sinif: "pr-alt", yazi: "No market meets this rule right now. The scan runs every 2 hours." })]));
    /* table */
    const q = ara.value.trim().toUpperCase();
    const deger = { c: (k) => k.c, px: (k) => k.px, d1: (k) => k.d1 ?? -9, v: (k) => k.v, turtle: (k) => k.turtle.kirdi ? -1 : (k.turtle.yakin ? k.turtle.yakin.uzaklik : 9), rsi: (k) => k.rsi ?? 50, carver: (k) => k.carver ?? 0, fon24: (k) => k.fon24 ?? 0, oi24: (k) => k.oi24 ?? -9 };
    let l = veri.coins.filter((k) => !q || k.c.toUpperCase().includes(q));
    l.sort((a, b) => { const x = deger[sira](a), y = deger[sira](b); return (typeof x === "string" ? x.localeCompare(y) : y - x) * (ters ? -1 : 1); });
    const bas = [["c", "Market"], ["px", "Price"], ["d1", "24h"], ["v", "Volume"], ["turtle", "Turtle"], ["rsi", "RSI(2)"], ["carver", "Trend −20…+20"], ["fon24", "Funding 24h"], ["oi24", "OI 24h"]];
    tablo.replaceChildren(el("thead", {}, [el("tr", {}, bas.map(([k, a]) => el("th", { yazi: a + (sira === k ? (ters ? " ▲" : " ▼") : ""), on: { click: () => { if (sira === k) ters = !ters; else { sira = k; ters = k === "turtle" || k === "c"; } ciz_(); } } })))]),
      el("tbody", {}, l.slice(0, 250).map((k) => {
        const t = k.turtle.kirdi ? el("span", { sinif: /long/.test(k.turtle.kirdi.sinyal) ? "pr-art" : "pr-eks", yazi: "✓ " + k.turtle.kirdi.sinyal.replace("long", "up").replace("short", "down") }) : k.turtle.yakin ? el("span", { sinif: k.turtle.yakin.uzaklik < 0.03 ? "pr-sar" : "pr-gri", yazi: k.turtle.yakin.sinyal.replace("long", "up").replace("short", "down") + " " + (k.turtle.yakin.uzaklik * 100).toFixed(1) + "% away" }) : "—";
        const F = k.carver, bar = F == null ? "—" : el("span", {}, [el("span", { sinif: "pr-bar" }, [el("i", { attr: { style: (F >= 0 ? "left:50%;" : "right:50%;") + "width:" + (Math.abs(F) / 20 * 50) + "%;background:" + (F >= 0 ? "var(--alis)" : "var(--satis)") } })]), el("span", { sinif: isle(F), yazi: (F > 0 ? "+" : "") + F.toFixed(1) })]);
        return el("tr", { attr: { style: vurgu === k.c ? "background:rgba(124,92,255,.14)" : "" } }, [
          el("td", {}, [el("a", { attr: { href: "#/perps/trade?coin=" + encodeURIComponent(k.c) }, yazi: k.c })]), el("td", { yazi: fiyat(k.px) }), el("td", { sinif: isle(k.d1), yazi: yuzde(k.d1) }), el("td", { yazi: kisa(k.v) }), el("td", {}, [t]),
          el("td", { sinif: k.rsiKur ? (k.rsiKur === "long" ? "pr-art" : "pr-eks") : "", yazi: k.rsi == null ? "—" : k.rsi.toFixed(1) + (k.rsiKur ? " ✓ " + k.rsiKur : "") }), el("td", {}, [bar]),
          el("td", { sinif: k.fon24 == null ? "pr-gri" : isle(-k.fon24), yazi: k.fon24 == null ? "—" : (k.fon24 * 100).toFixed(3) + "%" }), el("td", { sinif: k.kalabalik ? "pr-sar" : isle(k.oi24), yazi: k.oi24 == null ? "—" : yuzde(k.oi24) + (k.kalabalik ? " crowded " + k.kalabalik + "s" : "") })]);
      })));
  }
  ara.addEventListener("input", ciz_);

  /* radar */
  const ctx = tuval.getContext("2d"); let noktalar = [], sw = 0, baglandi = false; const parla = new Map();
  const aktif = () => { if (kok.isConnected) baglandi = true; return kok.isConnected; };
  const boyut = () => { const r = devicePixelRatio || 1; tuval.width = Math.round(tuval.clientWidth * r); tuval.height = Math.round(tuval.clientHeight * r); ctx.setTransform(r, 0, 0, r, 0, 0); };
  function radar() {
    if (!aktif()) { if (!baglandi) requestAnimationFrame(radar); return; }
    if (tuval.clientWidth && tuval.width !== Math.round(tuval.clientWidth * (devicePixelRatio || 1))) boyut();
    const W = tuval.clientWidth, H = tuval.clientHeight; if (!W) { requestAnimationFrame(radar); return; }
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * (W < 500 ? 0.4 : 0.45);
    ctx.fillStyle = "rgba(6,9,15,.3)"; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1; ctx.font = "10px Inter, sans-serif";
    for (const f of [0.1, 0.4, 0.7, 1]) { ctx.strokeStyle = f === 0.1 ? "rgba(245,194,107,.45)" : "rgba(80,120,170,.28)"; ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, 7); ctx.stroke(); }
    ctx.fillStyle = "rgba(245,194,107,.75)"; ctx.fillText("rule fires", cx + 4, cy - R * 0.1 - 3);
    ctx.strokeStyle = "rgba(80,120,170,.2)"; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    ctx.fillStyle = "rgba(46,209,138,.6)"; ctx.fillText("long side ▶", cx + R - 66, cy - 6); ctx.fillStyle = "rgba(255,107,122,.6)"; ctx.fillText("◀ short side", cx - R + 2, cy - 6);
    sw = (sw + 0.014) % (Math.PI * 2);
    const g = ctx.createConicGradient ? ctx.createConicGradient(sw - 0.7, cx, cy) : null;
    if (g) { g.addColorStop(0, "rgba(51,225,255,0)"); g.addColorStop(0.11, "rgba(51,225,255,.18)"); g.addColorStop(0.111, "rgba(51,225,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill(); }
    ctx.strokeStyle = "rgba(51,225,255,.85)"; ctx.lineWidth = 1.5; ctx.shadowColor = "#33e1ff"; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(sw) * R, cy + Math.sin(sw) * R); ctx.stroke(); ctx.shadowBlur = 0;
    noktalar = [];
    if (veri) {
      const vmax = Math.max(1, ...veri.coins.map((k) => k.v));
      for (const k of veri.coins) {
        const p = konum(k, lens); if (!p) continue;
        /* long side on the right half, short side on the left, none spread on both */
        const h = hash(k.c), a = p.yon > 0 ? -Math.PI / 2 + Math.PI * h : p.yon < 0 ? Math.PI / 2 + Math.PI * h : Math.PI * 2 * h;
        const x = cx + Math.cos(a) * p.r * R, y = cy + Math.sin(a) * p.r * R;
        let fk = ((sw - a) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2); if (fk < 0.05) parla.set(k.c, 1);
        const pl = parla.get(k.c) || 0; parla.set(k.c, pl * 0.965);
        const renk = p.yon > 0 ? "46,209,138" : p.yon < 0 ? "255,107,122" : "150,160,190", boy = 2 + Math.sqrt(k.v / vmax) * 12;
        ctx.fillStyle = "rgba(" + renk + "," + (p.ates ? 0.95 : 0.35 + 0.6 * pl) + ")";
        if (p.ates || pl > 0.2 || vurgu === k.c) { ctx.shadowColor = "rgb(" + renk + ")"; ctx.shadowBlur = p.ates ? 14 + 6 * Math.sin(Date.now() / 250) : 10 * pl; }
        ctx.beginPath(); ctx.arc(x, y, boy * (1 + 0.35 * pl), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        if (vurgu === k.c) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, boy + 6, 0, 7); ctx.stroke(); }
        if (p.ates || boy > 8 || pl > 0.6 || vurgu === k.c) { ctx.fillStyle = "#e6eefc"; ctx.font = "10.5px Inter, sans-serif"; ctx.fillText(k.c, x + boy + 4, y + 3); }
        noktalar.push({ x, y, r: boy + 4, k });
      }
    }
    requestAnimationFrame(radar);
  }
  const bul = (e) => { const b = tuval.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top; let en = null, d = 1e9; for (const n of noktalar) { const dd = Math.hypot(n.x - x, n.y - y); if (dd < Math.max(10, n.r) && dd < d) { d = dd; en = n; } } return { en, x, y }; };
  tuval.addEventListener("mousemove", (e) => { const { en, x, y } = bul(e); if (!en) { ipucu.style.display = "none"; return; } const k = en.k;
    ipucu.replaceChildren(el("b", { yazi: k.c + " · " + fiyat(k.px) }), el("div", { attr: { style: "color:var(--yazi-3)" }, yazi: "24h " + yuzde(k.d1) + " · vol " + kisa(k.v) }),
      el("div", { yazi: (k.turtle.kirdi ? "Turtle: " + k.turtle.kirdi.sinyal + " ✓" : k.turtle.yakin ? "Turtle: " + k.turtle.yakin.sinyal + " " + (k.turtle.yakin.uzaklik * 100).toFixed(1) + "% away" : "") + " · RSI(2) " + (k.rsi ?? "—") + " · trend " + (k.carver ?? "—") }));
    ipucu.style.display = "block"; ipucu.style.left = Math.min(x + 12, tuval.clientWidth - 240) + "px"; ipucu.style.top = (y + 12) + "px"; });
  tuval.addEventListener("mouseleave", () => { ipucu.style.display = "none"; });
  tuval.addEventListener("click", (e) => { const { en } = bul(e); if (!en) return; vurgu = en.k.c; ara.value = ""; sira = "c"; ters = true; ciz_(); const tr = [...tablo.querySelectorAll("tbody tr")].find((r) => r.textContent.startsWith(en.k.c)); if (tr) tr.scrollIntoView({ behavior: "smooth", block: "center" }); });
  requestAnimationFrame(radar);

  try {
    veri = await fetch("veri/perp-radar.json?t=" + Math.floor(Date.now() / 300000)).then((r) => r.json());
    const dk = Math.round((Date.now() - Date.parse(veri.guncel)) / 60000);
    guncel.textContent = "Live prices · rule scan " + (dk < 60 ? dk + " min" : Math.round(dk / 60) + " h") + " ago (every 2 h)";
    alt.textContent = "How it works: daily candles of every Hyperliquid perp, read from Hyperliquid's public API every 2 hours; funding and open interest from hourly snapshots. Turtle levels use the days before the last close, so “✓” means the last daily close went through the level. Each rule is shown as its book or note describes it, with its weak spot; a rule firing is a fact about the market now, not a forecast and not advice. Perps use leverage: you can lose more than you put in, quickly.";
    ciz_();
  } catch (e) { tablo.replaceChildren(el("tbody", {}, [el("tr", {}, [el("td", { yazi: "The radar could not be loaded. Try again in a minute." })])])); return kok; }
  /* live prices */
  const canli = async () => {
    if (!aktif()) { if (!baglandi) setTimeout(canli, 1000); return; }
    try { const m = await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "allMids" }) }).then((r) => r.json());
      for (const k of veri.coins) { const p = Number(m[k.c]); if (p > 0) { if (k.turtle.yakin) { const s = k.turtle.yakin; s.uzaklik = /long/.test(s.sinyal) ? s.seviye / p - 1 : 1 - s.seviye / p; } k.px = p; } } ciz_(); } catch (e) { /* keep */ }
    setTimeout(canli, 15000);
  };
  setTimeout(canli, 1500);
  return kok;
}
