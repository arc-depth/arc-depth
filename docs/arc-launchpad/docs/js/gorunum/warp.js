/* ===========================================================================
 * gorunum/warp.js — Warp: launch on the hottest launchpad of thirteen chains
 *
 * The radar ranks every launchpad DefiLlama tracks on our thirteen chains by
 * its 24 h volume (Elysium's own launchpads measured here as well, see
 * radar.js), and names the hottest one per chain. A launchpad whose contracts
 * ARC PULSE has connected and tested with a real launch is marked "Warp": the
 * launch is signed from this page in the creator's own wallet. Every other one
 * is linked, so a creator can still go there today.
 *
 * Fees on a Warp launch, shown before anything is signed: 0.5% of the opening
 * buy — 0.3% to ARC PULSE, 0.2% to ARCP (kept in USDC until the ARCP pool
 * opens, then used to buy ARCP and burn it) — and, where the launchpad lets
 * creator fees be shared, a share of them stated on screen.
 *
 * Nothing here is a launch button until its connection is live: no launchpad
 * is connected yet, so the form says so instead of pretending.
 * =========================================================================== */
import { el, temizle, sayfaUst, panel, adimlar, ayrinti, not } from "../ui.js";
import { lpVeri, topla, elysiumLaunchpadlari } from "../radar.js";

/* our thirteen chains, by DefiLlama's chain key */
const ZINCIRLER = [
  { k: "elysium", ad: "Elysium", renk: "#c6f86b" }, { k: "solana", ad: "Solana", renk: "#14f195" },
  { k: "robinhood", ad: "Robinhood", renk: "#c3f53c" }, { k: "bsc", ad: "BNB Chain", renk: "#f0b90b" },
  { k: "base", ad: "Base", renk: "#3d7bff" }, { k: "monad", ad: "Monad", renk: "#a08cff" },
  { k: "arc", ad: "Arc", renk: "#8b6cff" }, { k: "hyperliquid", ad: "HyperEVM", renk: "#50e3c2" },
  { k: "sui", ad: "Sui", renk: "#4da2ff" }, { k: "avax", ad: "Avalanche", renk: "#e84142" },
  { k: "aptos", ad: "Aptos", renk: "#2ed8a7" }, { k: "arbitrum", ad: "Arbitrum", renk: "#28a0f0" },
  { k: "ethereum", ad: "Ethereum", renk: "#8c9eff" },
];
const ZAD = Object.fromEntries(ZINCIRLER.map((z) => [z.k, z]));

/* Warp connections: "live" once tested with a real launch; "next" while being built */
/* the Montra connection opens on the page once a real launch through it has worked (Halo, Pulse Squad #1) */
const ACIK = { montra: true, pump: false, raydium: false, meteora: false, flap: false, pons: false, clanker: false };
const WARP = { "Montra": ACIK.montra ? "live" : "next", "Flap sh": ACIK.flap ? "live" : "next", "Pons V2": ACIK.pons ? "live" : "next", "pump.fun": ACIK.pump ? "live" : "next", "Meteora Dynamic Bonding Curve": ACIK.meteora ? "live" : "next", "LaunchLab": ACIK.raydium ? "live" : "next" };
/* where a launchpad lives when we know it for sure; otherwise its DefiLlama page, which links to it */
const ADRES = { "pump.fun": "https://pump.fun", "Montra": "https://montramarkets.xyz", "Ascend Launchpad": "https://app.ascendlaunch.xyz", "Ascend": "https://app.ascendlaunch.xyz", "Volta": "https://www.volta.family" };

/* the Pulse Squad: our own launches, one mascot per chain, five days apart at the earliest */
const SQUAD = [
  ["halo", "Halo", "Elysium", "Montra", "13 Nov"], ["zappy", "Zappy", "Solana", "pump.fun", "18 Nov"], ["blu", "Blu", "Base", "Clanker", "23 Nov"],
  ["feather", "Feather", "Robinhood", "Pons", "28 Nov"], ["goldie", "Goldie", "BNB Chain", "Flap", "3 Dec"], ["vio", "Vio", "Monad", "nad.fun", "8 Dec"],
  ["pulsy", "Pulsy", "Arc", "ARC PULSE", "13 Dec"], ["turbo", "Turbo", "HyperEVM", "Alt Fun", "18 Dec"], ["drip", "Drip", "Sui", "Turbos", "23 Dec"],
  ["yeti", "Yeti", "Avalanche", "Arena", "28 Dec"], ["pebble", "Pebble", "Aptos", "Emojicoin", "2 Jan"], ["bolt", "Bolt", "Arbitrum", "ARC PULSE", "7 Jan"],
];

const para = (v) => { v = Number(v || 0); return v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(1) + "K" : "$" + v.toFixed(0); };
const adresi = (p) => ADRES[p.ad] || (p.slug ? "https://defillama.com/protocol/" + p.slug : null);

const STIL = `
.wp-hero{position:relative;overflow:hidden;border-radius:22px;padding:30px 28px;margin-bottom:18px;background:radial-gradient(120% 140% at 0% 0%,#3b2a8a 0%,#151233 55%,#0b0a18 100%);border:1px solid #2c2560}
.wp-hero h2{font-size:clamp(26px,4vw,40px);line-height:1.05;font-weight:900;margin:0 0 10px;letter-spacing:-.02em}
.wp-hero h2 span{background:linear-gradient(90deg,#c6f86b,#14f195,#4da2ff,#a08cff);-webkit-background-clip:text;background-clip:text;color:transparent}
.wp-hero p{max-width:620px;opacity:.85;margin:0}
.wp-hero .wp-isin{position:absolute;right:-60px;top:-60px;width:260px;height:260px;border-radius:50%;background:conic-gradient(from 0deg,#c6f86b,#14f195,#4da2ff,#a08cff,#f0b90b,#c6f86b);filter:blur(60px);opacity:.35;animation:wp-don 14s linear infinite}
@keyframes wp-don{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.wp-hero .wp-isin{animation:none}}
.wp-radar{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
.wp-z{border:1px solid var(--cizgi,#2a2f3a);border-radius:14px;padding:12px 14px;background:var(--yuzey-1,#12141b);border-top:3px solid var(--zr)}
.wp-z .ad{font-size:12px;opacity:.7;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.wp-z .lp{font-weight:800;font-size:16px;margin:4px 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-z .v{font-size:13px;opacity:.8}.wp-z.bos .lp{opacity:.5;font-weight:600}
.wp-cipler{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
.wp-cip{border:1px solid var(--cizgi,#2a2f3a);background:transparent;color:inherit;border-radius:999px;padding:7px 14px;font-weight:600;font-size:13px;line-height:1;cursor:pointer}
.wp-cip[aria-pressed="true"]{background:var(--marka,#7c5cff);border-color:var(--marka,#7c5cff);color:#fff}
.wp-tablo{display:grid;gap:2px}
.wp-sat{display:grid;grid-template-columns:28px 30px minmax(0,1.6fr) minmax(0,1.4fr) 92px 92px 118px;gap:10px;align-items:center;padding:9px 10px;border-radius:10px}
.wp-sat:not(.bas):hover{background:var(--yuzey-2,#1a1d27)}
.wp-sat.bas{font-size:11px;text-transform:uppercase;letter-spacing:.06em;opacity:.6}
.wp-sat img{width:26px;height:26px;border-radius:8px}.wp-sat .r{text-align:right}
.wp-sat .ad{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-zc{display:flex;gap:4px;flex-wrap:wrap}.wp-zc span{font-size:11px;border:1px solid var(--cizgi,#2a2f3a);border-radius:999px;padding:2px 7px}
.wp-git{justify-self:end;font-size:12px;font-weight:700;border-radius:999px;padding:6px 11px;text-decoration:none;color:inherit;border:1px solid var(--cizgi,#2a2f3a);white-space:nowrap}
.wp-git.warp{background:linear-gradient(90deg,#7c5cff,#14b8a6);border:0;color:#fff}
.wp-yakinda{margin-left:8px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;padding:2px 7px;border-radius:999px;background:linear-gradient(90deg,#7c5cff,#14b8a6);color:#fff;vertical-align:2px}
@media (max-width:820px){.wp-sat{grid-template-columns:24px 26px minmax(0,1fr) 84px 96px}.wp-sat .gz{display:none}}
.wp-ucret{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.wp-u{border-radius:14px;padding:16px;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a)}
.wp-u b{display:block;font-size:30px;font-weight:900;line-height:1;margin-bottom:6px}.wp-u span{font-size:13px;opacity:.8}
.wp-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}
.wp-form label{display:grid;gap:5px;font-size:12px;font-weight:700;opacity:.8}
.wp-form input,.wp-form select,.wp-form textarea{border:1px solid var(--cizgi,#2a2f3a);background:var(--yuzey-0,#0d0f14);color:inherit;border-radius:10px;padding:10px}
.wp-squad{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.wp-m{border-radius:16px;padding:12px;text-align:center;background:var(--yuzey-1,#12141b);border:1px solid var(--cizgi,#2a2f3a)}
.wp-m img{width:100%;max-width:150px;aspect-ratio:6/5;object-fit:contain}
.wp-m .ad{font-weight:900;font-size:17px}.wp-m .z{font-size:12px;font-weight:700}.wp-m .t{font-size:12px;opacity:.65;margin-top:3px}
.wp-m.ilk{border-color:#c6f86b;box-shadow:0 0 0 1px #c6f86b55,0 10px 30px -12px #c6f86b88}
`;

/* the launch form: one launchpad at a time; each opens only once a real launch through it has worked */
const LAUNCHPADLER = {
  montra: { ad: "Montra", zincirler: ["elysium"], kalkan: true, acik: () => ACIK.montra, link: (t) => "https://montramarkets.xyz/token/" + t, bekliyor: "opens with Halo's launch" },
  pump: { ad: "pump.fun", zincirler: ["solana"], kalkan: false, acik: () => ACIK.pump, link: null, bekliyor: "opens with Zappy's launch on Solana" },
  raydium: { ad: "Raydium LaunchLab", zincirler: ["solana"], kalkan: false, acik: () => ACIK.raydium, link: null, bekliyor: "opens with the first Solana launch through it" },
  meteora: { ad: "Meteora", zincirler: ["solana"], kalkan: false, acik: () => ACIK.meteora, link: null, bekliyor: "opens with the first Solana launch through it" },
  flap: { ad: "Flap", zincirler: ["bsc", "robinhood", "monad"], kalkan: false, acik: () => ACIK.flap, link: null, bekliyor: "opens with the Pulse Squad's first Flap launch" },
  pons: { ad: "Pons", zincirler: ["robinhood"], kalkan: false, acik: () => ACIK.pons, link: null, bekliyor: "opens with Feather's launch on Robinhood" },
  /* clanker: connected (warp-clanker.js) but off: its volume is too low to be worth offering (user, 11 Nov 2026) */
};
const ZINCIR_AD = { solana: ["Solana", "SOL"], elysium: ["Elysium", "HYPE"], base: ["Base", "ETH"], bsc: ["BNB Chain", "BNB"], monad: ["Monad", "MON"], robinhood: ["Robinhood", "ETH"], arc: ["Arc", "USDC"] };

function warpFormu() {
  const gir = (ph, ek = {}) => el("input", { attr: { placeholder: ph, ...ek } });
  const lp = el("select", {}, Object.entries(LAUNCHPADLER).map(([k, v]) => el("option", { attr: { value: k }, yazi: v.ad + " · " + v.zincirler.map((z) => ZINCIR_AD[z][0]).join(", ") })));
  const zincir = el("select");
  const ad = gir("e.g. Halo", { maxlength: "32" }), sembol = gir("HALO", { maxlength: "12" }), aciklama = el("textarea", { attr: { placeholder: "What it is, in a sentence or two", maxlength: "280", rows: "2" } });
  const dosya = el("input", { attr: { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" } });
  const gorsel = gir("…or paste an https:// or ipfs:// address");
  const onizle = el("img", { attr: { alt: "", style: "width:56px;height:56px;border-radius:12px;object-fit:cover;display:none;margin-top:6px" } });
  dosya.addEventListener("change", () => { const f = dosya.files[0]; if (f) { gorsel.value = ""; onizle.style.display = "block"; onizle.src = URL.createObjectURL(f); } });
  gorsel.addEventListener("change", () => { const u = gorsel.value.trim().replace(/^ipfs:\/\//i, "https://ipfs.filebase.io/ipfs/"); onizle.style.display = u ? "block" : "none"; onizle.src = u; });
  const ucret = el("select", {}, [1, 2, 3, 5, 10].map((u) => el("option", { attr: { value: String(u), selected: u === 2 ? "" : null }, yazi: u + "% per trade" })));
  const kalkan = el("select", {}, [[0, "None"], [5, "5 seconds"], [10, "10 seconds"], [30, "30 seconds"], [60, "1 minute"], [300, "5 minutes"], [900, "15 minutes"], [1800, "30 minutes"]].map(([v, t]) => el("option", { attr: { value: String(v), selected: v === 60 ? "" : null }, yazi: t })));
  const kalkanEt = el("label", {}, ["Anti-snipe", kalkan]);
  const ilk = gir("0.5", { type: "number", min: "0", step: "0.000001" });
  const ilkEt = el("span", { yazi: "First buy" });
  const site = gir("https:// (optional)"), x = gir("https://x.com/… (optional)");
  const ozet = el("div", { sinif: "vt-alt", attr: { style: "margin:10px 0 0" } });
  const notKutusu = el("div");
  const durum = el("div", { attr: { style: "margin-top:10px;font-weight:600" } });
  const dugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" } });
  const secim = () => LAUNCHPADLER[lp.value];
  const yaz = () => {
    const L = secim(), [zad, birim] = ZINCIR_AD[zincir.value] || ["", ""], h = Number(ilk.value || 0);
    ilkEt.textContent = "First buy (" + birim + ")";
    kalkanEt.style.display = L.kalkan ? "" : "none";
    dugme.disabled = !L.acik(); dugme.textContent = L.acik() ? "Warp to " + L.ad + " ⚡" : L.ad + " " + L.bekliyor;
    temizle(notKutusu).append(not(L.acik() ? "Live: " + L.ad + " on " + zad + ". Signed in your own wallet; ARC PULSE never holds your token or your coins." : L.ad + " is connected and " + L.bekliyor + ": a connection opens only after a real launch through it has worked.", L.acik() ? "" : "uyari"));
    ozet.textContent = L.ad + " on " + zad + " · " + ucret.value + "% fee per trade" + (lp.value === "montra" ? ": you keep 90% of the creator side, ARC PULSE 10%." : lp.value === "raydium" ? ": Raydium's fee plus 0.5% to you and 0.5% to ARC PULSE on every trade (the fee box above is not used); when it graduates, most of the pool's liquidity is burned for good. Signed in your Solana wallet." : lp.value === "meteora" ? ": 1% fee per trade (the fee box above is not used); after Meteora's share, half to you and half to ARC PULSE; at ~400 SOL market cap it moves to a locked Meteora pool. Signed in your Solana wallet." : lp.value === "pump" ? ": pump.fun's own fees; your first buy is made in the launch itself. Signed in your Solana wallet (Phantom or any Solana wallet)." : lp.value === "pons" ? " creator tax to you (Pons caps it); your opening buy is made in the launch itself, so no one buys before you. Pons adds its own launch fee." : lp.value === "flap" ? " buy and sell tax to you; Flap pays ARC PULSE a commission its protocol sets on every taxed trade." : ": ARC PULSE takes Clanker's integrator share, 10% of the tax after Clanker's own; the rest is yours. Clanker adds its own 20-second anti-snipe.") +
      (h > 0 ? " Warp fee " + (h * 0.005).toFixed(6) + " " + birim + " (0.5% of your first buy)." : " No first buy, no Warp fee.");
  };
  const zincirleriDoldur = () => { temizle(zincir).append(...secim().zincirler.map((z) => el("option", { attr: { value: z }, yazi: ZINCIR_AD[z][0] }))); yaz(); };
  lp.addEventListener("change", zincirleriDoldur); [ilk, ucret].forEach((e) => e.addEventListener("input", yaz)); zincir.addEventListener("change", yaz);
  zincirleriDoldur();
  dugme.addEventListener("click", async () => {
    dugme.disabled = true;
    const L = secim();
    try {
      const mm = await import("../warp-montra.js");
      if (!ad.value.trim() || !sembol.value.trim()) throw new Error("A name and a ticker are needed.");
      const ortak = { ad: ad.value.trim(), sembol: sembol.value.trim().toUpperCase(), aciklama: aciklama.value.trim(), ilkAlim: Number(ilk.value || 0), website: site.value.trim(), twitter: x.value.trim() };
      const adim = (t) => { durum.textContent = t; };
      let sonuc;
      if (lp.value === "flap") {
        /* Flap pins the image itself, so it needs the file: the one chosen, or the one at the pasted address */
        let gorselDosya = dosya.files[0];
        if (!gorselDosya) {
          const r = await fetch(mm.gorselAdresi(gorsel.value).replace(/^ipfs:\/\//i, "https://ipfs.filebase.io/ipfs/")).catch(() => null);
          if (!r || !r.ok) throw new Error("Choose the image file for a Flap launch (that address could not be read here).");
          const b = await r.blob(); gorselDosya = new File([b], "image." + ((b.type.split("/")[1] || "png").replace("jpeg", "jpg")), { type: b.type || "image/png" });
        }
        if (!/^image\/(png|jpeg|webp|gif)$/.test(gorselDosya.type) || gorselDosya.size > 2e6) throw new Error("The image must be PNG, JPG, WebP or GIF, under 2 MB.");
        const mf = await import("../warp-flap.js");
        sonuc = await mf.launch({ ...ortak, gorsel: gorselDosya, zincir: zincir.value, ucret: Number(ucret.value) }, adim);
        temizle(durum).append("Launched ⚡ ", el("a", { attr: { href: sonuc.link, target: "_blank", rel: "noopener noreferrer" }, yazi: "Open your token on " + L.ad + " ↗" }));
        return;
      }
      if (lp.value === "pump" || lp.value === "meteora" || lp.value === "raydium") {
        const mpf = await import(lp.value === "pump" ? "../warp-pump.js" : lp.value === "meteora" ? "../warp-meteora.js" : "../warp-raydium.js");
        const g = { ...ortak };
        if (dosya.files[0] && !gorsel.value.trim()) g.gorsel = dosya.files[0]; else g.logo = mm.gorselAdresi(gorsel.value);
        sonuc = await mpf.launch(g, adim);
        temizle(durum).append("Launched ⚡ ", el("a", { attr: { href: sonuc.link, target: "_blank", rel: "noopener noreferrer" }, yazi: "Open your token on " + L.ad + " ↗" }));
        return;
      }
      let logo;
      if (dosya.files[0] && !gorsel.value.trim()) { durum.textContent = "Uploading your image (free, to nostr.build)…"; logo = await mm.gorselYukle(dosya.files[0]); gorsel.value = logo; }
      else logo = mm.gorselAdresi(gorsel.value);
      const yuklendi = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(true); i.onerror = () => ok(false); i.src = logo.replace(/^ipfs:\/\//i, "https://ipfs.filebase.io/ipfs/"); });
      if (!yuklendi) throw new Error("That image address does not load. Check it opens in a new tab.");
      ortak.logo = logo;
      if (lp.value === "montra") {
        durum.textContent = "Reading Montra's launch menu…";
        const satir = await mm.satirBul(Number(ucret.value), Number(kalkan.value));
        if (satir == null) throw new Error("Montra does not offer that fee with that anti-snipe window right now.");
        sonuc = await mm.launch({ ...ortak, configId: satir }, adim);
        sonuc.link = L.link(sonuc.token);
      } else if (lp.value === "pons") {
        const mp = await import("../warp-pons.js");
        sonuc = await mp.launch({ ...ortak, ucret: Number(ucret.value) }, adim);
      } else {
        const mc = await import("../warp-clanker.js");
        sonuc = await mc.launch({ ...ortak, zincir: zincir.value, ucret: Number(ucret.value) }, adim);
      }
      temizle(durum).append("Launched ⚡ ", el("a", { attr: { href: sonuc.link, target: "_blank", rel: "noopener noreferrer" }, yazi: "Open your token on " + L.ad + " ↗" }));
    } catch (e) { durum.textContent = e.shortMessage || e.message; }
    finally { dugme.disabled = !L.acik(); }
  });
  return [
    notKutusu,
    el("div", { sinif: "wp-form wp-form--acik" }, [
      el("label", {}, ["Launchpad", lp]), el("label", {}, ["Chain", zincir]),
      el("label", {}, ["Token name", ad]), el("label", {}, ["Ticker", sembol]), el("label", {}, ["Image", dosya, gorsel, onizle]),
      el("label", {}, ["Fee per trade", ucret]), kalkanEt, el("label", {}, [ilkEt, ilk]),
      el("label", { attr: { style: "grid-column:1/-1" } }, ["Description", aciklama]), el("label", {}, ["Website", site]), el("label", {}, ["X", x]),
    ]),
    ozet, el("div", { attr: { style: "margin-top:12px" } }, [dugme]), durum,
  ];
}

export async function ciz() {
  if (!document.getElementById("wp-stil")) document.head.append(el("style", { attr: { id: "wp-stil" }, yazi: STIL }));
  const kap = el("div", {});
  kap.append(sayfaUst("Warp", "Launch your token on the hottest launchpad of thirteen chains, from one page"));
  kap.append(el("div", { sinif: "wp-hero" }, [el("div", { sinif: "wp-isin" }),
    el("h2", {}, ["Warp your launch to ", el("span", { yazi: "wherever the volume is." })]),
    el("p", { yazi: "Warp watches every memecoin launchpad on thirteen chains and shows you, live, where the traders are today. Pick one, or take the hottest, and launch there from here with your own wallet." })]));

  /* ---- the launchpads Warp launches on ---- */
  const BAGLI = [
    ["pump", "pump.fun", "Solana", "#14f195", "pump.fun's fees; 0.5% of your first buy to Warp"],
    ["raydium", "Raydium LaunchLab", "Solana", "#14f195", "ARC PULSE's own LaunchLab platform: 0.5% to you and 0.5% to ARC PULSE on every curve trade"],
    ["meteora", "Meteora", "Solana", "#14f195", "ARC PULSE's own Meteora config: 1% fee, half of it (after Meteora's share) to you"],
    ["montra", "Montra", "Elysium", "#c6f86b", "Montra's fee tiers: you keep 90% of the creator side"],
    ["flap", "Flap", "BNB · Robinhood · Monad", "#f0b90b", "your buy and sell tax; Flap pays ARC PULSE a commission"],
    ["pons", "Pons", "Robinhood", "#c3f53c", "your creator tax; the opening buy is made in the launch itself"],
  ];
  kap.append(panel("Connected to Warp · " + BAGLI.length + " launchpads", [
    el("div", { sinif: "wp-radar" }, BAGLI.map(([k, ad, z, r, ne]) => el("div", { sinif: "wp-z", attr: { style: "--zr:" + r } }, [
      el("div", { sinif: "ad", yazi: z }), el("div", { sinif: "lp", yazi: ad }), el("div", { sinif: "v", yazi: ne }),
      el("div", { sinif: "v", attr: { style: "margin-top:6px;font-weight:700;opacity:1" }, yazi: ACIK[k] ? "⚡ Live" : "Ready · " + LAUNCHPADLER[k].bekliyor }),
    ]))),
    el("p", { sinif: "vt-alt", attr: { style: "margin-top:10px" }, yazi: "Bags and letsbonk.fun run on Meteora and Raydium LaunchLab; ARC PULSE has its own platform on both, so a Warp launch there sits on the same engines." }),
  ]));

  /* ---- every launch made through Warp (and the Pulse Squad's own) ---- */
  const wlYer = el("div");
  kap.append(wlYer);
  import("../warp-liste.js").then(async (m) => wlYer.replaceWith(m.warpPaneli(await m.warpLaunchlari()))).catch(() => wlYer.remove());

  /* ---- the radar ---- */
  const radar = el("div", { sinif: "wp-radar" }, [el("div", { sinif: "vt-alt", yazi: "Reading launchpad volumes…" })]);
  const cipler = el("div", { sinif: "wp-cipler", attr: { role: "tablist" } });
  const tablo = el("div", { sinif: "wp-tablo" });
  kap.append(panel("Radar · the hottest launchpad on each chain, last 24 h", radar));
  kap.append(panel("Every launchpad on our thirteen chains", [cipler, tablo]));

  /* ---- fees ---- */
  kap.append(panel("What a Warp launch costs", [
    el("div", { sinif: "wp-ucret" }, [
      el("div", { sinif: "wp-u" }, [el("b", { yazi: "0.3%" }), el("span", { yazi: "of the opening buy, to ARC PULSE — it keeps Warp running." })]),
      el("div", { sinif: "wp-u" }, [el("b", { yazi: "0.2%" }), el("span", { yazi: "of the opening buy, to ARCP: kept in USDC until the ARCP pool opens, then it buys ARCP and burns it." })]),
      el("div", { sinif: "wp-u" }, [el("b", { yazi: "The rest" }), el("span", { yazi: "is yours. Where a launchpad lets creator fees be shared, ARC PULSE's share is printed on screen before you sign." })]),
    ]),
    not("The launchpad's own fees are its own and unchanged. Nothing is taken that is not shown before you sign."),
  ]));

  /* ---- the launch form, honest about its state ---- */
  kap.append(panel("Warp a launch", warpFormu()));

  kap.append(panel("How Warp works", adimlar([
    { ikon: "grafik", baslik: "See where the volume is", yazi: "The radar ranks every launchpad on thirteen chains by what traded there in the last 24 hours." },
    { ikon: "pusula", baslik: "Pick a launchpad", yazi: "Take the hottest on your chain, or any other. Name, ticker, image and your opening buy are set once." },
    { ikon: "cuzdan", baslik: "Sign in your own wallet", yazi: "The launch goes straight to that launchpad's contracts. ARC PULSE never holds your token or your money." },
    { ikon: "hediye", baslik: "Every launch feeds ARCP", yazi: "0.2% of every opening buy goes to ARCP and, once its pool is open, buys ARCP and burns it." },
  ])));

  /* ---- the Pulse Squad ---- */
  kap.append(panel("The Pulse Squad · our own launches, one friend on every chain", [
    el("p", { sinif: "vt-alt", attr: { style: "opacity:.8" }, yazi: "ARC PULSE launches a mascot memecoin on each chain, five days apart at the earliest, each one paid for by the fees of the ones before. They are not ARCP and promise nothing: their trading fees fund the platform, and every address, fee and payout is published here as it happens." }),
    el("div", { sinif: "wp-squad" }, SQUAD.map(([k, ad, z, lp, t], i) => el("div", { sinif: "wp-m" + (i === 0 ? " ilk" : "") }, [
      el("img", { attr: { src: "img/squad/" + k + ".svg", alt: ad + ", the Pulse Squad's " + z + " mascot", loading: "lazy" } }),
      el("div", { sinif: "ad", yazi: ad }), el("div", { sinif: "z", attr: { style: "color:" + ((ZINCIRLER.find((x) => x.ad === z) || {}).renk || "#fff") }, yazi: z + " · " + lp }),
      el("div", { sinif: "t", yazi: (i === 0 ? "First up · " : "Not before ") + t }),
    ]))),
  ]));

  kap.append(ayrinti("Where do these volumes come from?", "DefiLlama's Launchpad category, broken down by chain, for every launchpad it tracks on Arc, Base, Solana, BNB Chain, Ethereum, Arbitrum, Avalanche, Monad, HyperEVM, Robinhood Chain, Sui, Aptos and Elysium. Elysium launchpads DefiLlama does not list yet are measured by ARC PULSE from Elysium's own chain records (pools with real activity only). The page reads them again every ten minutes."));

  /* ---- fill the radar and the table ---- */
  let secili = null, satirlar = [];
  const cipCiz = () => {
    temizle(cipler);
    for (const z of [null, ...ZINCIRLER]) cipler.append(el("button", { sinif: "wp-cip", attr: { type: "button", "aria-pressed": String(secili === (z && z.k)) }, yazi: z ? z.ad : "All chains",
      on: { click: () => { secili = z && z.k; cipCiz(); tabloCiz(); } } }));
  };
  const tabloCiz = () => {
    const gor = satirlar.map((p) => ({ ...p, v: secili ? p.z24[secili] || 0 : p.v24 })).filter((p) => p.v > 0).sort((a, b) => b.v - a.v).slice(0, 80);
    temizle(tablo).append(el("div", { sinif: "wp-sat bas" }, [el("span", { yazi: "#" }), el("span"), el("span", { yazi: "Launchpad" }), el("span", { sinif: "gz", yazi: "Chains" }), el("span", { sinif: "r", yazi: "24h" }), el("span", { sinif: "r gz", yazi: "30d" }), el("span")]),
      ...(gor.length ? gor.map((p, i) => {
        const w = WARP[p.ad], url = adresi(p);
        return el("div", { sinif: "wp-sat" }, [
          el("span", { sinif: "vt-k", yazi: String(i + 1) }),
          p.logo ? el("img", { attr: { src: p.logo, alt: "", loading: "lazy", referrerpolicy: "no-referrer" } }) : el("span"),
          el("span", { sinif: "ad" }, [p.ad, w === "next" ? el("span", { sinif: "wp-yakinda", yazi: "Warp soon" }) : null]),
          el("div", { sinif: "wp-zc gz" }, Object.keys(p.z24).filter((k) => p.z24[k] > 0).map((k) => el("span", { yazi: ZAD[k].ad }))),
          el("b", { sinif: "r", yazi: para(p.v) }),
          el("span", { sinif: "r gz", yazi: p.v30 == null ? "—" : para(secili ? p.z30[secili] || 0 : p.v30) }),
          w === "live" ? el("a", { sinif: "wp-git warp", attr: { href: "#/warp" }, yazi: "Warp ⚡" })
            : url ? el("a", { sinif: "wp-git" + (w === "next" ? " sirada" : ""), attr: { href: url, target: "_blank", rel: "noopener noreferrer" }, yazi: "Open ↗" }) : el("span"),
        ]);
      }) : [el("div", { sinif: "vt-alt", attr: { style: "padding:12px" }, yazi: "No launchpad volume on this chain in the last 24 h." })]));
  };
  const radarCiz = () => {
    temizle(radar).append(...ZINCIRLER.map((z) => {
      const en = satirlar.filter((p) => (p.z24[z.k] || 0) > 0).sort((a, b) => b.z24[z.k] - a.z24[z.k])[0];
      return el("div", { sinif: "wp-z" + (en ? "" : " bos"), attr: { style: "--zr:" + z.renk } }, [
        el("div", { sinif: "ad", yazi: z.ad }), el("div", { sinif: "lp", yazi: en ? en.ad : "No launchpad volume" }), el("div", { sinif: "v", yazi: en ? para(en.z24[z.k]) + " in 24 h" : "nothing traded in 24 h" })]);
    }));
  };
  const yukle = async () => {
    const anahtar = ZINCIRLER.map((z) => z.k);
    let lp;
    try { lp = await lpVeri(); } catch (e) { temizle(radar).append(el("div", { sinif: "vt-alt", yazi: e.message })); return; }
    satirlar = lp.map((p) => ({ ad: p.ad, logo: p.logo, slug: p.slug,
      z24: Object.fromEntries(anahtar.map((k) => [k, topla(p.g24, [k])])), z30: Object.fromEntries(anahtar.map((k) => [k, topla(p.g30, [k])])),
      v24: topla(p.g24, anahtar), v30: topla(p.g30, anahtar) })).filter((p) => p.v24 > 0 || p.v30 > 0);
    /* Elysium launchpads DefiLlama does not list yet, from our own measurement (24 h only) */
    const ely = await elysiumLaunchpadlari().catch(() => null);
    if (ely) for (const x of ely.satirlar) {
      const ilk = x.ad.toLowerCase().split(" ")[0];
      if (x.hacim > 0 && !satirlar.some((p) => (p.z24.elysium || 0) > 0 && p.ad.toLowerCase().startsWith(ilk)))
        satirlar.push({ ad: x.ad, z24: { elysium: x.hacim }, z30: {}, v24: x.hacim, v30: null });
    }
    radarCiz(); tabloCiz();
  };
  cipCiz(); yukle();
  return kap;
}
