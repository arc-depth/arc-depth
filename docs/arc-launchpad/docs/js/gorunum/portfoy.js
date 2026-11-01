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

export async function ciz({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  const hesap = cuzdan.hesap();

  kap.append(sayfaUst("Portfolio", hesap ? null : "No wallet connected"));

  if (!hesap) {
    kap.append(bos(
      "No wallet connected",
      "Connect a wallet to read balances. The page sends nothing; it only " +
      "reads.",
      el("button", {
        sinif: "dugme dugme--marka",
        yazi: "Connect wallet",
        attr: { type: "button" },
        on: { click: () => document.getElementById("cuzdan-dugme").click() }
      })
    ));
    return kap;
  }

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
