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

export async function ciz({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  const hesap = cuzdan.hesap();

  kap.append(sayfaUst("Portföy", hesap ? null : "Cüzdan bağlı değil"));

  if (!hesap) {
    kap.append(bos(
      "Cüzdan bağlı değil",
      "Bakiyeleri okumak için cüzdanı bağla. Sayfa hiçbir şey göndermez; " +
      "yalnızca okur.",
      el("button", {
        sinif: "dugme dugme--marka",
        yazi: "Cüzdan bağla",
        attr: { type: "button" },
        on: { click: () => document.getElementById("cuzdan-dugme").click() }
      })
    ));
    return kap;
  }

  if (!cuzdan.zincirdeMi()) {
    kap.append(bos(
      "Cüzdan Arc ağında değil",
      "Bakiyeler Arc'tan okunuyor. Ağı değiştirmen gerekiyor.",
      el("button", {
        sinif: "dugme dugme--marka",
        yazi: "Arc ağına geç",
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
    olcum("Cüzdan", hesap.slice(0, 6) + "…" + hesap.slice(-4), "bağlı")
  ]));

  const { dagitildiMi, liste } = await launchListesi();
  if (!dagitildiMi || !liste.length) {
    kap.append(panel("Tokenler", bos(
      "Okunacak token yok",
      dagitildiMi
        ? "Henüz hiç token çıkarılmamış."
        : "Launchpad dağıtılmadığı için bakılacak bir token kaydı yok."
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
      "Bu cüzdanda launch tokeni yok",
      "Keşfet sayfasından bir token alabilirsin."
    )));
    return kap;
  }

  const bilgiler = await jetonBilgileri(tutulan.map((t) => t.token));
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Token" }), el("th", { yazi: "Bakiye" }),
    el("th", { yazi: "Teminat hakkı" }), el("th", { yazi: "" })
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
      el("td", { sinif: "sayi", attr: { "data-et": "Teminat hakkı" },
        yazi: deger == null ? "—" : para(deger) }),
      el("td", { attr: { "data-et": "" } }, [
        el("a", { sinif: "dugme dugme--kucuk",
          attr: { href: "#/terminal?t=" + t.token }, yazi: "İşlem" })
      ])
    ]));
  }
  tablo.append(govde);

  kap.append(panel([
    el("span", { html: ikon("cuzdan", "yol-oge__ikon") }),
    el("span", { yazi: "Tokenler" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo])));

  kap.append(not(
    "Teminat hakkı, o tokeni yakarak kasadan alabileceğin tutar — piyasa " +
    "fiyatı değil, tabandır. Kâr/zarar burada yok: maliyet esası cüzdanın " +
    "geçmiş işlemlerinden çıkarılmak zorunda ve o indeksleyici henüz yok. " +
    "Tahmini bir maliyet, yanlış bir kâr demektir.",
    "bilgi"
  ));

  return kap;
}
