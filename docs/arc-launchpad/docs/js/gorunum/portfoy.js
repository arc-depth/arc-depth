/* ===========================================================================
 * gorunum/portfoy.js — what the connected wallet holds
 *
 * Balances and, for each one, the collateral claim behind it. Both are
 * single reads, so both are real.
 *
 * What is NOT here: cost basis, realised and unrealised P&L. Those need the
 * wallet's trade history, which needs the indexer — and a cost basis that
 * is guessed produces a profit figure that is wrong. The route for it
 * exists and says so.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres } from "../ui.js";
import { ikon } from "../ikon.js";
import { launchListesi, jetonBilgileri, oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { DIS } from "../adresler.js";
import { para, jetonMiktar, tamSayidanSayi } from "../bicim.js";
import { zincirLaunchPaneli } from "./tum-zincirler.js";

/* the newest `kac` launches of each one-pool registry (v8, v9) that `hesap` holds on Arc, priced */
async function tekHavuzTutulan(hesap, kac = 200) {
  const { sepetV2, sepetV9, SEPET } = await import("../teminat-izle.js");
  const { YedekliOkur } = await import("../yedekli-okur.js");
  const { Contract } = await import("../../vendor/ethers.min.js");
  const arc = new YedekliOkur();
  const [v8, v9] = await Promise.all([sepetV2(), sepetV9()]);
  const LP = ["function launchCount() view returns (uint256)",
    "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))"];
  const T = ["function balanceOf(address) view returns (uint256)", "function name() view returns (string)", "function symbol() view returns (string)"];
  const sonuc = [];
  for (const [cfg, v9mu] of [[v8 || SEPET, false], [v9, true]]) {
    if (!cfg) continue;
    const lp = new Contract(cfg.lp5, LP, arc);
    const n = Number(await lp.launchCount());
    const sira = [];
    for (let i = n - 1; i >= Math.max(0, n - kac); i--) sira.push(i);
    for (let i = 0; i < sira.length; i += 10) {   // ten at a time: kind to the public RPCs
      const parca = await Promise.all(sira.slice(i, i + 10).map(async (j) => {
        const t = (await lp.launchAt(j)).token;
        const b = await new Contract(t, T, arc).balanceOf(hesap).catch(() => 0n);
        return b > 0n ? { token: t, ham: b, lp: cfg.lp5, v9: v9mu } : null;
      }));
      sonuc.push(...parca.filter(Boolean));
    }
  }
  const { havuzFiyati } = await import("./merkez.js");
  return Promise.all(sonuc.map(async (x) => {
    const c = new Contract(x.token, T, arc);
    const [ad, sembol, fiyat] = await Promise.all([c.name().catch(() => null), c.symbol().catch(() => null), havuzFiyati(x.token, x.lp).catch(() => null)]);
    const miktar = Number(x.ham) / 1e18;
    const f = Number.isFinite(fiyat) && fiyat > 0 ? fiyat : null;
    return { ...x, ad, sembol, miktar, fiyat: f, deger: f == null ? null : miktar * f };
  }));
}

const usdK = (x) => x == null || !isFinite(x) ? "—" : (Math.abs(x) >= 0.01 || x === 0 ? para(x) : "$" + x.toPrecision(3));
const fiyatK = (x) => x == null || !isFinite(x) ? "—" : x >= 1000 ? "$" + x.toLocaleString("en-US", { maximumFractionDigits: 1 }) : x >= 1 ? "$" + String(Number(x.toFixed(4))) : "$" + x.toPrecision(4);
const isaretli = (x, t) => (x > 0 ? "+" : "") + t;

/* Hyperliquid: positions and spot coins of hesap (read-only here; trading is on the Trade perps page) */
/* 16 Nov 2026 (owner: portfolio as a home): close a main-list position at market from here. Uses this device's
   trading key when Hyperliquid still lists it, otherwise the wallet signs. The ARC PULSE fee approval is needed
   (the order carries the builder fee); without it the visitor is sent to Trade perps to enable trading once. */
async function hlKapat(hesap, p) {
  const hl = await import("../hl.js");
  const [onay, liste, mids] = await Promise.all([hl.bilgi({ type: "maxBuilderFee", user: hesap.toLowerCase(), builder: hl.BUILDER }).catch(() => 0), hl.piyasalar(), hl.ortaFiyatlar()]);
  if (!(Number(onay) >= hl.BUILDER_F)) throw Object.assign(new Error("Trading is not enabled on ARC PULSE for this wallet yet. Enable it once on Trade perps, then close from here."), { git: true });
  const m = liste.find((x) => x.ad === p.coin);
  if (!m) throw new Error("This market is not on Hyperliquid's main list; close it on Hyperliquid.");
  let ajan = hl.ajanOku(hesap);
  if (ajan && !(await hl.ajanGecerliMi(hesap, ajan).catch(() => false))) ajan = null;
  const szi = Number(p.szi), uzun = szi > 0, mid = Number(mids[p.coin]) || p.mark;
  const px = mid * (uzun ? 1 - hl.KAYMA : 1 + hl.KAYMA);
  const y = await hl.l1Gonder(hl.emirEylemi({ a: m.i, alis: !uzun, px: hl.fiyatYaz(px, m.szDec), sz: hl.boyutYaz(Math.abs(szi), m.szDec), azalt: true, tif: "Ioc" }), ajan);
  return hl.emirSonucu(y, p.coin);
}

function hlPaneli(hesap) {
  const govde = el("div", { sinif: "yigin" }, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading your Hyperliquid account…" })]);
  const kutu = panel("Hyperliquid: positions and coins", govde);
  let ilk = true, bekleyen = false;
  const kapatDugmesi = (p) => {
    const d = el("button", { sinif: "dugme dugme--satis dugme--kucuk", attr: { type: "button" }, yazi: "Close" });
    d.addEventListener("click", () => {
      const satir = d.closest("tr");
      if (!satir || satir.nextElementSibling && satir.nextElementSibling.classList.contains("pf-onay")) return;
      const szi = Number(p.szi), uzun = szi > 0;
      const yazi = el("div", { yazi: "Close " + Math.abs(szi) + " " + p.coin + " " + (uzun ? "long" : "short") + " at market (at most 1% from " + fiyatK(p.mark) + "). Fees: Hyperliquid's taker fee + ARC PULSE 0.05%." });
      const durum = el("div", { sinif: "ikincil", attr: { role: "status" } });
      const evet = el("button", { sinif: "dugme dugme--satis dugme--kucuk", attr: { type: "button" }, yazi: "Confirm close" });
      const hayir = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Keep" });
      const td = el("td", { attr: { colspan: "8", style: "grid-column:1/-1" } }, [el("div", { sinif: "yigin yigin--sik" }, [yazi, el("span", { attr: { style: "display:inline-flex;gap:8px" } }, [hayir, evet]), durum])]);
      const tr = el("tr", { sinif: "pf-onay" }, [td]);
      satir.after(tr); bekleyen = true;
      hayir.addEventListener("click", () => { tr.remove(); bekleyen = false; });
      evet.addEventListener("click", async () => {
        evet.disabled = true; hayir.disabled = true; durum.textContent = "Sending… (your wallet may ask you to sign)";
        try { durum.textContent = await hlKapat(hesap, p); durum.style.color = "var(--alis, #2ecc71)"; setTimeout(() => { bekleyen = false; yenile(); }, 2500); }
        catch (e) {
          durum.replaceChildren((e && e.message) || String(e)); durum.style.color = "var(--satis, #ff5c5c)";
          if (e && e.git) durum.append(" ", el("a", { attr: { href: "#/perps/trade?coin=" + encodeURIComponent(p.coin) }, yazi: "Open Trade perps →" }));
          hayir.disabled = false; hayir.textContent = "OK";
        }
      });
    });
    return d;
  };
  const yenile = async () => {
    if (!ilk && !kutu.isConnected) return;   // the page was left: stop refreshing
    if (bekleyen) { setTimeout(yenile, 5000); return; }   // a close confirm is open: do not redraw under it
    ilk = false;
    try {
      const hl = await import("../hl.js");
      const V = await hl.tumVarliklar(hesap);
      const parca = [el("div", { sinif: "izgara izgara--olcum" }, [
        olcum("Total on Hyperliquid", usdK(V.perpDeger + V.spotDeger), "perps " + usdK(V.perpDeger) + " · spot " + usdK(V.spotDeger)),
        ...[["day", "P&L 24 h"], ["week", "P&L 7 days"], ["month", "P&L 30 days"]].map(([k, ad]) => {
          const x = V.kz[k];
          const e = olcum(ad, x == null ? "—" : isaretli(x, usdK(x)), "Hyperliquid's own figure");
          if (x) { const b = e.querySelector("b, strong, .olcum__deger"); if (b) b.style.color = x > 0 ? "var(--alis, #2ecc71)" : "var(--satis, #ff5c5c)"; }
          return e;
        }),
      ])];
      parca.push(el("h3", { sinif: "panel__baslik", attr: { style: "margin:6px 0 0;font-size:14px" }, yazi: "Open positions" }));
      if (!V.pozisyonlar.length) parca.push(el("div", { sinif: "ikincil", yazi: "No open perp positions at this address." }));
      else {
        const t = el("table", { sinif: "tablo tablo--kart" });
        t.append(el("thead", {}, [el("tr", {}, ["Market", "Size", "Entry", "Mark", "Unrealized P&L", "Liq. price", "TP / SL", ""].map((b) => el("th", { yazi: b })))]));
        t.append(el("tbody", {}, V.pozisyonlar.map((p) => {
          const szi = Number(p.szi), uzun = szi > 0, pnl = Number(p.unrealizedPnl), roe = Number(p.returnOnEquity) * 100;
          return el("tr", {}, [
            el("td", { attr: { "data-et": "Market" } }, [el("strong", { yazi: p.coin }), " ", el("span", { sinif: "etiket " + (uzun ? "etiket--alis" : "etiket--satis"), yazi: (uzun ? "Long " : "Short ") + (p.leverage ? p.leverage.value + "×" : "") })]),
            el("td", { sinif: "sayi", attr: { "data-et": "Size" }, yazi: Math.abs(szi) + " (" + usdK(Math.abs(Number(p.positionValue))) + ")" }),
            el("td", { sinif: "sayi", attr: { "data-et": "Entry" }, yazi: fiyatK(Number(p.entryPx)) }),
            el("td", { sinif: "sayi", attr: { "data-et": "Mark" }, yazi: fiyatK(p.mark) }),
            el("td", { sinif: "sayi", attr: { "data-et": "Unrealized P&L", style: "color:" + (pnl > 0 ? "var(--alis, #2ecc71)" : pnl < 0 ? "var(--satis, #ff5c5c)" : "inherit") }, yazi: isaretli(pnl, usdK(pnl)) + " (" + isaretli(roe, roe.toFixed(1)) + "%)" }),
            el("td", { sinif: "sayi", attr: { "data-et": "Liq. price" }, yazi: p.liquidationPx ? fiyatK(Number(p.liquidationPx)) : "–" }),
            (() => { const tet = V.emirler.filter((o) => o.coin === p.coin && o.isTrigger && o.reduceOnly);
              const tp = tet.filter((o) => /Take Profit/i.test(o.orderType)).map((o) => fiyatK(Number(o.triggerPx))).join(", ") || "–";
              const sl = tet.filter((o) => /Stop/i.test(o.orderType)).map((o) => fiyatK(Number(o.triggerPx))).join(", ") || "–";
              return el("td", { sinif: "sayi", attr: { "data-et": "TP / SL" }, yazi: tp + " / " + sl }); })(),
            el("td", { attr: { "data-et": "" } }, p.dex ? [el("span", { sinif: "ikincil", yazi: "on " + p.dex })] : [el("span", { attr: { style: "display:inline-flex;gap:6px;flex-wrap:wrap" } }, [
              el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: "#/perps/trade?coin=" + encodeURIComponent(p.coin) }, yazi: "Manage" }),
              kapatDugmesi(p)])]),
          ]);
        })));
        parca.push(el("div", { sinif: "tablo-sarmal" }, [t]));
      }
      parca.push(el("h3", { sinif: "panel__baslik", attr: { style: "margin:6px 0 0;font-size:14px" }, yazi: "Spot coins" }));
      if (!V.spotlar.length) parca.push(el("div", { sinif: "ikincil", yazi: "No spot coins on Hyperliquid at this address." }));
      else {
        const t = el("table", { sinif: "tablo tablo--kart" });
        t.append(el("thead", {}, [el("tr", {}, ["Coin", "Balance", "Price", "Value", "P&L vs cost"].map((b) => el("th", { yazi: b })))]));
        t.append(el("tbody", {}, V.spotlar.map((x) => {
          const kz = x.coin !== "USDC" && x.maliyet > 0 && x.deger != null ? x.deger - x.maliyet : null;
          return el("tr", {}, [
            el("td", { attr: { "data-et": "Coin" } }, [el("strong", { yazi: x.coin })]),
            el("td", { sinif: "sayi", attr: { "data-et": "Balance" }, yazi: jetonMiktar(x.miktar) + (x.kilitli > 0 ? " (" + jetonMiktar(x.kilitli) + " in orders)" : "") }),
            el("td", { sinif: "sayi", attr: { "data-et": "Price" }, yazi: fiyatK(x.fiyat) }),
            el("td", { sinif: "sayi", attr: { "data-et": "Value" }, yazi: usdK(x.deger) }),
            el("td", { sinif: "sayi", attr: { "data-et": "P&L vs cost", style: "color:" + (kz > 0 ? "var(--alis, #2ecc71)" : kz < 0 ? "var(--satis, #ff5c5c)" : "inherit") }, yazi: kz == null ? "—" : isaretli(kz, usdK(kz)) + " (" + isaretli(kz, (kz / x.maliyet * 100).toFixed(1)) + "%)" }),
          ]);
        })));
        parca.push(el("div", { sinif: "tablo-sarmal" }, [t]));
      }
      parca.push(el("div", { sinif: "satir", attr: { style: "gap:8px;flex-wrap:wrap" } }, [
        el("a", { sinif: "dugme dugme--marka dugme--kucuk", attr: { href: "#/perps/trade" }, yazi: "Trade perps" }),
        el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href: "https://app.hyperliquid.xyz/portfolio", target: "_blank", rel: "noopener" }, yazi: "Open on Hyperliquid ↗" })]),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Read live from Hyperliquid for the connected address and refreshed every 15 s. Spot P&L is against Hyperliquid's own cost figure for the balance. Your Hyperliquid account is the same address as your wallet." }));
      govde.replaceChildren(...parca);
    } catch (e) {
      govde.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Could not read Hyperliquid: " + ((e && e.message) || e) }));
    }
    if (kutu.isConnected) setTimeout(yenile, 15000);
  };
  setTimeout(yenile, 0);
  return kutu;
}

export async function ciz({ cuzdan }) {
  /* 16 Nov 2026 (owner: "platform hala çok acemi"): a slim title, no cover and no "On this page" chips; the money first */
  const kap = el("div", { sinif: "yigin", veri: { icindekilerYok: "1" } });
  const hesap = cuzdan.hesap();

  kap.append(el("div", { attr: { style: "display:flex;align-items:baseline;gap:12px;flex-wrap:wrap" } }, [
    el("h1", { attr: { style: "font-size:22px;margin:0" }, yazi: "Portfolio" }),
    hesap ? el("span", { sinif: "mono", attr: { style: "font-size:13px;color:var(--yazi-3)" }, yazi: hesap.slice(0, 6) + "…" + hesap.slice(-4) }) : null]));

  /* 16 Nov 2026 (owner): none of the wallet sections shows before a wallet is connected */
  if (!hesap) {
    kap.append(bos(
      "Connect your wallet",
      "Your coins, your Hyperliquid positions and your launch tokens show here once a wallet is connected. The page only reads; nothing is stored.",
      el("button", {
        sinif: "dugme dugme--marka",
        yazi: "Connect wallet",
        attr: { type: "button" },
        on: { click: () => document.getElementById("cuzdan-dugme").click() }
      })
    ));
    return kap;
  }

  /* 16 Nov 2026 (owner: "coinler nerde nasıl takip etcem ... açtığım pozisyonlar nerde"): Hyperliquid first:
     perp positions (main list and every HIP-3 DEX) and every spot coin, refreshed every 15 s while the page is open */
  kap.append(hlPaneli(hesap));

  /* 13 Nov 2026: Pulse Points, opened at this wallet */
  kap.append(el("a", { sinif: "jeton-kart", attr: { href: "#/points" } }, [
    el("div", { sinif: "satir" }, [el("span", { sinif: "ucuncul", html: ikon("kupa", "yol-oge__ikon") }), el("strong", { yazi: "Pulse Points" })]),
    el("div", { sinif: "ikincil", yazi: "See this wallet's points for creating tokens and backing new launches." })
  ]));

  /* Launch tokens on every chain are read from each chain directly, so
     this part does not care which network the wallet is on. */
  kap.append(await zincirLaunchPaneli("Launch tokens on every chain", hesap));

  /* 1 Nov 2026: tokens this wallet founded (TurKaydi.kurucuOf), with "Set product type"
     for each one. Read from Arc directly, whatever network the wallet is on. */
  const kurucuKap = el("div", { sinif: "yigin" }, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading the launch registry on Arc…" })]);
  kap.append(panel("Tokens you founded", kurucuKap));
  import("../urun.js").then(async (urun) => {
    const liste = await urun.kurucuTokenlari(hesap);
    if (!liste.length) {
      kurucuKap.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "No token launched through the one-pool gate has this wallet as its founder." }));
      return;
    }
    kurucuKap.replaceChildren(...liste.map((t) => el("div", { sinif: "yigin" }, [
      el("a", { sinif: "jeton", attr: { href: "#/merkez?t=" + t.token } }, [
        el("div", { sinif: "jeton__logo jeton__logo--bos", yazi: (t.sembol || "?").slice(0, 3).toUpperCase() }),
        el("div", { sinif: "jeton__yazi" }, [el("div", { sinif: "jeton__sembol", yazi: t.sembol || "?" }), el("div", { sinif: "jeton__ad", yazi: t.ad || "" })])
      ]),
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz mono", yazi: t.token }),
      urun.turAyarKutusu({ token: t.token, cuzdan })
    ])));
  }).catch((e) => {
    kurucuKap.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Could not read the registry: " + ((e && e.message) || e) }));
  });

  /* one-pool tokens this wallet holds on Arc, from both registries: v8 (PulseHook5) and v9 (PulseHook6,
     designer tokens). Each is priced from its own launchpad's pool key, so the right hook's pool. */
  const tutKap = el("div", { sinif: "yigin" }, [el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading the v8 and v9 registries on Arc…" })]);
  kap.append(panel("One-pool tokens you hold on Arc", tutKap));
  tekHavuzTutulan(hesap).then((liste) => {
    if (!liste.length) {
      tutKap.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "This wallet holds none of the newest one-pool launches on Arc (v8 and v9 sets). Tokens held on another chain are its twins there." }));
      return;
    }
    const top = liste.reduce((t, x) => t + (x.deger || 0), 0);
    const tablo = el("table", { sinif: "tablo tablo--kart" });
    tablo.append(el("thead", {}, [el("tr", {}, ["Token", "Balance", "Price", "Value", ""].map((b) => el("th", { yazi: b })))]));
    tablo.append(el("tbody", {}, liste.map((x) => el("tr", {}, [
      el("td", { attr: { "data-et": "Token" } }, [el("a", { sinif: "jeton", attr: { href: "#/merkez?t=" + x.token } }, [
        el("div", { sinif: "jeton__logo jeton__logo--bos", yazi: (x.sembol || "?").slice(0, 3).toUpperCase() }),
        el("div", { sinif: "jeton__yazi" }, [el("div", { sinif: "jeton__sembol", yazi: x.sembol || "?" }), el("div", { sinif: "jeton__ad", yazi: (x.ad || "") + (x.v9 ? " · v9" : "") })])])]),
      el("td", { sinif: "sayi", attr: { "data-et": "Balance" }, yazi: jetonMiktar(x.miktar) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Price" }, yazi: x.fiyat == null ? "—" : (x.fiyat >= 0.01 ? para(x.fiyat) : "$" + x.fiyat.toPrecision(3)) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Value" }, yazi: x.deger == null ? "—" : para(x.deger) }),
      el("td", { attr: { "data-et": "" } }, [el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/merkez?t=" + x.token }, yazi: "Trade" })]),
    ]))));
    tutKap.replaceChildren(
      el("div", { sinif: "izgara izgara--olcum" }, [olcum("Value at pool price", para(top), liste.length + " token" + (liste.length === 1 ? "" : "s") + " on Arc")]),
      el("div", { sinif: "tablo-sarmal" }, [tablo]),
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Price is the token's Arc pool price now (the same pool every chain trades through); value is balance × price, before fees." }));
  }).catch((e) => {
    tutKap.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Could not read the registries: " + ((e && e.message) || e) }));
  });

  if (!cuzdan.zincirdeMi()) {
    kap.append(bos(
      "Wallet is not on the Arc network",
      "Balances are read from Arc. You have to switch networks.",
      el("button", {
        sinif: "dugme dugme--marka",
        yazi: "Switch to Arc",
        attr: { type: "button" },
        on: { click: () => cuzdan.arcaGec().catch(() => {}) }
      })
    ));
    return kap;
  }

  /* USDC balance — Arc's gas token and the quote asset at once. */
  const usdcHam = await oku(DIS.usdc, ABI.erc20, "balanceOf", [hesap]);
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("USDC", usdcHam == null ? "—" : para(tamSayidanSayi(usdcHam, 6)),
      "Arc'ta hem bakiye hem gas"),
    olcum("Wallet", hesap.slice(0, 6) + "…" + hesap.slice(-4), "connected")
  ]));

  const { dagitildiMi, liste } = await launchListesi();
  if (!dagitildiMi || !liste.length) {
    kap.append(panel("Tokenler", bos(
      "Okunacak token yok",
      dagitildiMi
        ? "Nothing has been launched yet."
        : "With the launchpad not deployed there is no token record to read."
    )));
    return kap;
  }

  /* Balances for every launch token, in one batch. */
  const bakiyeler = await cokluCagri(liste.map((l) => ({
    method: "eth_call",
    params: [{ to: l.token, data: cagriVerisi(ABI.erc20, "balanceOf", [hesap]) }, "latest"]
  })));

  const tutulan = [];
  for (let i = 0; i < liste.length; i++) {
    const c = sonucCoz(ABI.erc20, "balanceOf", bakiyeler[i]);
    const m = c ? c[0] : 0n;
    if (m && BigInt(m) > 0n) tutulan.push({ ...liste[i], ham: BigInt(m) });
  }

  if (!tutulan.length) {
    kap.append(panel("Tokenler", bos(
      "This wallet holds no launch tokens",
      "You can buy one from the Discover page."
    )));
    return kap;
  }

  const bilgiler = await jetonBilgileri(tutulan.map((t) => t.token));
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Token" }), el("th", { yazi: "Bakiye" }),
    el("th", { yazi: "Collateral claim" }), el("th", { yazi: "" })
  ])]));
  const govde = el("tbody");

  for (let i = 0; i < tutulan.length; i++) {
    const t = tutulan[i], b = bilgiler[i] || {};
    const ondalik = b.ondalik == null ? 18 : b.ondalik;
    const miktar = tamSayidanSayi(t.ham, ondalik);
    const hak = await oku(t.kasa, ABI.kasa, "hak", [DIS.usdc]);
    /* The claim is quote-per-token scaled by 1e36, so the holding's
       redeemable value is balance × claim. Both sides are real reads. */
    const deger = hak == null ? null : miktar * (Number(hak) / 1e36);

    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Token" } }, [
        el("a", { sinif: "jeton", attr: { href: "#/terminal?t=" + t.token } }, [
          el("div", { sinif: "jeton__logo jeton__logo--bos",
            yazi: (b.sembol || "?").slice(0, 3).toUpperCase() }),
          el("div", { sinif: "jeton__yazi" }, [
            el("div", { sinif: "jeton__sembol", yazi: b.sembol || "?" }),
            el("div", { sinif: "jeton__ad", yazi: b.ad || "" })
          ])
        ])
      ]),
      el("td", { sinif: "sayi", attr: { "data-et": "Bakiye" }, yazi: jetonMiktar(miktar) }),
      el("td", { sinif: "sayi", attr: { "data-et": "Collateral claim" },
        yazi: deger == null ? "—" : para(deger) }),
      el("td", { attr: { "data-et": "" } }, [
        el("a", { sinif: "dugme dugme--kucuk",
          attr: { href: "#/terminal?t=" + t.token }, yazi: "Trade" })
      ])
    ]));
  }
  tablo.append(govde);

  kap.append(panel([
    el("span", { html: ikon("cuzdan", "yol-oge__ikon") }),
    el("span", { yazi: "Tokenler" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo])));

  kap.append(not(
    "The collateral claim is what burning that token would take out of " +
    "the vault — the floor, not the market price. Profit and loss is not " +
    "here: cost basis has to be derived from the wallet's past trades " +
    "and that indexer does not exist yet. An estimated cost means a " +
    "wrong profit.",
    "bilgi"
  ));

  return kap;
}
