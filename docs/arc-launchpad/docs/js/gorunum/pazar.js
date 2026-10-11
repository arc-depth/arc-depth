/* ===========================================================================
 * gorunum/pazar.js — the developer marketplace: listing, buying, the
 *                    revenue panel
 *
 * Developers publish products, customers buy with USDC, revenue goes 80% to
 * the developer and 20% to the platform, and the licence lives on chain.
 *
 * DEPLOYED, AND THIS SCREEN NOW READS IT
 *   The Pazar contract is on Arc mainnet. The fee rate, the revenue ledger
 *   and the product list are read straight from that contract; the page
 *   keeps no copy.
 *
 * THE ZEROS ARE NOT FAKE, THEY ARE REAL
 *   Today there are no products, no sales, and the ledger is zero. The
 *   screen shows exactly that — it does not print a sample product, sample
 *   revenue or a "coming soon" catalogue. Showing an empty marketplace as
 *   full is the one thing this project keeps avoiding.
 *
 * HELD = 0 IS NOT AN ORNAMENT BUT AN AUDITABLE CLAIM
 *   The contract holds no money at all: the payment and the split happen in
 *   the same transaction. That is why there is no `withdraw`/`sweep`/
 *   `rescue` function, and because there is none nobody can use one. The
 *   panel shows `tutulan()` so that the claim does not stay a promise —
 *   anyone can check it at any time.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, hata } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { PAZAR, PAZAR_KURAL, EKONOMI, canli } from "../adresler.js";
import { para, ppmYuzde, tamSayidanSayi, gecenSure } from "../bicim.js";

const SIFIR_ADRES = "0x0000000000000000000000000000000000000000";

/* sonucCoz hands back the whole decode Result; a one-value Result is not a
   number, so Number() on it is NaN. */
function tek(tablo, ad, r) {
  if (r == null) return null;
  const c = sonucCoz(tablo, ad, r);
  return c && c.length === 1 ? c[0] : c;
}

export async function ciz({ kayit, cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  const hesap = cuzdan ? cuzdan.hesap() : null;

  kap.append(sayfaUst(
    "Developer marketplace",
    "Products from outside developers. Paid in USDC, " +
    (PAZAR_KURAL.gelistiriciPpm / 10_000) + "% of revenue to the developer"
  ));

  if (!canli(PAZAR.pazar)) {
    kap.append(hata(
      "No marketplace address",
      "This screen shows nothing without a deployed marketplace contract. " +
      "It stops here rather than printing an invented catalogue."
    ));
    return kap;
  }

  /* ---- 1. the split, read from the contract ----------------------- */
  const adlar = ["PLATFORM_PPM", "urunSayisi", "platformKazanci",
    "toplamHasilat", "tutulan"];
  const ham = await cokluCagri(adlar.map((ad) => ({
    method: "eth_call",
    params: [{ to: PAZAR.pazar, data: cagriVerisi(ABI.pazar, ad) }, "latest"]
  })));
  const v = {};
  adlar.forEach((ad, i) => { v[ad] = tek(ABI.pazar, ad, ham[i]); });

  if (v.urunSayisi == null) {
    kap.append(hata(
      "The marketplace could not be read",
      "The contract is at " + PAZAR.pazar + " but `urunSayisi()` did not " +
      "answer. The screen is not inventing a state."
    ));
    return kap;
  }

  const zincirPpm = v.PLATFORM_PPM == null ? null : Number(v.PLATFORM_PPM);
  kap.append(panel("How it works", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Developer share",
        zincirPpm == null ? "unreadable" : ppmYuzde(1_000_000 - zincirPpm),
        "of every sale, in the same transaction"),
      olcum("Platform share",
        zincirPpm == null ? "unreadable" : ppmYuzde(zincirPpm), "ARC PULSE"),
      olcum("Paid in", "USDC", "on Arc"),
      olcum("Licence", "on chain", "anyone can verify it")
    ]),
    /* The page's own copy of the rate is compared against the contract's,
       here and in the audit. Two numbers that should agree are worth
       showing disagreeing. */
    zincirPpm != null && zincirPpm !== PAZAR_KURAL.platformPpm
      ? not("The rate on this page (" + ppmYuzde(PAZAR_KURAL.platformPpm) +
            ") and the contract's rate (" + ppmYuzde(zincirPpm) +
            ") DO NOT MATCH. The contract's rate is the one that applies.", "uyari")
      : not(
        "This rate is not a copy kept on the page — it was read from " +
        PAZAR.pazar + ". It is a constant in the contract: no setter, and " +
        "it cannot be changed.", "bilgi"),
    not(
      "Payment and the split happen in one transaction: the contract " +
      "HOLDS NOTHING in between. With no balance to withdraw there is no " +
      "withdraw, sweep or rescue function — and because there is none, " +
      "nobody can use one. The remainder of an uneven division goes to " +
      "the DEVELOPER, not the platform.", "bilgi")
  ])));

  /* ---- 2. the revenue book, including the zero that matters ------- */
  kap.append(panel("Revenue", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Total revenue",
        v.toplamHasilat == null ? "unreadable"
          : para(tamSayidanSayi(v.toplamHasilat, 6)), "to date"),
      olcum("Platform share (ARC PULSE)",
        v.platformKazanci == null ? "unreadable"
          : para(tamSayidanSayi(v.platformKazanci, 6)),
        (zincirPpm == null ? "?" : zincirPpm / 10_000) + "% slice, summed"),
      olcum("Paid to developers",
        v.toplamHasilat == null || v.platformKazanci == null ? "unreadable"
          : para(tamSayidanSayi(v.toplamHasilat, 6) -
                 tamSayidanSayi(v.platformKazanci, 6)),
        "revenue minus the platform share"),
      olcum("Held by the contract",
        v.tutulan == null ? "unreadable" : para(tamSayidanSayi(v.tutulan, 6)),
        "zero by design, always")
    ]),
    v.tutulan != null && BigInt(v.tutulan) !== 0n
      ? not("THE CONTRACT IS HOLDING MONEY. This should not happen: " +
            "payment and the split occur in one transaction and there is " +
            "no withdraw function. A token may have been sent here by " +
            "mistake.", "uyari")
      : not("The contract's balance is zero — \"it holds nothing\" is not " +
            "a promise but a number anyone can check.", "bilgi"),
    v.toplamHasilat != null && BigInt(v.toplamHasilat) === 0n
      ? not("No sales yet. These zeros are real: the marketplace was " +
            "just deployed and nobody has published a product.", "bilgi")
      : null
  ].filter(Boolean))));

  /* ---- 3. the listing -------------------------------------------- */
  const sayi = Number(v.urunSayisi);
  if (sayi === 0) {
    kap.append(panel("Products", bos(
      "No products yet",
      "The contract is deployed and answering; nobody has published a " +
      "product. Publishing happens from the developer portal, with no " +
      "permission needed.",
      el("a", {
        sinif: "dugme dugme--marka", yazi: "Developer portal",
        attr: { href: "#/gelistirici" }
      })
    )));
    return kap;
  }

  /* Newest first, capped: a listing that grows without bound turns one
     screen into hundreds of calls. */
  const idler = [];
  for (let i = sayi - 1; i >= Math.max(0, sayi - 20); i--) idler.push(i);

  const adim = hesap ? 3 : 2;
  const istekler = idler.flatMap((id) => {
    const temel = [
      { method: "eth_call", params: [{ to: PAZAR.pazar,
        data: cagriVerisi(ABI.pazar, "urunler", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: PAZAR.pazar,
        data: cagriVerisi(ABI.pazar, "ortalamaPuan", [id]) }, "latest"] }
    ];
    if (hesap) {
      temel.push({ method: "eth_call", params: [{ to: PAZAR.pazar,
        data: cagriVerisi(ABI.pazar, "lisans", [id, hesap]) }, "latest"] });
    }
    return temel;
  });
  const satirlar = await cokluCagri(istekler);

  const liste = el("div", { sinif: "yigin" });
  idler.forEach((id, k) => {
    const u = satirlar[k * adim] == null
      ? null : sonucCoz(ABI.pazar, "urunler", satirlar[k * adim]);
    const puan = satirlar[k * adim + 1] == null
      ? null : sonucCoz(ABI.pazar, "ortalamaPuan", satirlar[k * adim + 1]);
    const lis = hesap && satirlar[k * adim + 2] != null
      ? sonucCoz(ABI.pazar, "lisans", satirlar[k * adim + 2]) : null;

    if (!u) {
      liste.append(panel("Product #" + id, not(
        "This product could not be read. Left empty rather than showing " +
        "invented content.", "uyari")));
      return;
    }

    const gelistirici = u[0];
    const fiyat = tamSayidanSayi(u[1], 6);
    const periyot = Number(u[2]);
    const acik = u[3];
    const uri = u[4] || "";
    const satis = Number(u[5]);
    const hasilat = tamSayidanSayi(u[6], 6);

    const govde = el("div", { sinif: "yigin yigin--sik" });
    govde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Price", fiyat === 0 ? "free" : para(fiyat),
        periyot === 0 ? "one-off, a licence that never expires"
          : "every " + gecenSure(periyot * 1000)),
      olcum("Sales", String(satis), "to date"),
      olcum("Revenue", para(hasilat), "gross"),
      olcum("Rating",
        puan && Number(puan[1]) > 0
          ? (Number(puan[0]) / 100).toFixed(2) + " / 5"
          : "no ratings",
        puan ? Number(puan[1]) + " ratings" : null)
    ]));

    /* The URI is shown as text, never as a clickable link: this string is
       written by anyone who registers, and turning a stranger's string
       into a link the page invites you to click is how a marketplace
       becomes a phishing surface. */
    govde.append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [
      el("span", { yazi: "Details: " }),
      el("code", { yazi: uri.slice(0, 160) || "(empty)" })
    ]));
    govde.append(not(
      "This link is text the developer wrote. The page does not make it " +
      "clickable and does not verify it. Check it yourself before " +
      "opening it.", "uyari"));

    if (!acik) {
      govde.append(not("This product is closed for sale. Licences already " +
        "bought stay valid — closing does not revoke a sold licence.", "bilgi"));
    }

    if (lis && lis[0] === true) {
      govde.append(not(
        lis[2] === true
          ? "You hold a licence to this product that never expires."
          : "You hold a licence, ending " + new Date(Number(lis[1]) * 1000)
              .toLocaleString("en-GB") + ".",
        "bilgi"));
    }

    const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });

    if (acik && hesap) {
      const dugme = el("button", {
        sinif: "dugme dugme--marka",
        yazi: fiyat === 0 ? "GET IT FREE" : "BUY — " + para(fiyat),
        attr: { type: "button" }
      });
      dugme.addEventListener("click", async () => {
        try {
          const miktar = BigInt(u[1]);
          if (miktar > 0n) {
            durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
            durumSatiri.textContent = "Asking for the USDC allowance…";
            /* Exactly this purchase, not an unlimited allowance: a
               standing allowance on a contract that moves money is a
               liability for no benefit. */
            await cuzdan.gonder({
              to: EKONOMI.quote,
              data: cagriVerisi(ABI.erc20Yaz, "approve", [PAZAR.pazar, miktar])
            });
          }
          durumSatiri.textContent = "Sending the purchase…";
          const h = await cuzdan.gonder({
            to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazarYaz, "satinAl", [id])
          });
          durumSatiri.className = "yazi yazi--kucuk";
          /* The hash and nothing else: whether it landed is the chain's
             to say, and it says so on the next read. */
          durumSatiri.textContent = "Sent: " + h;
        } catch (e) {
          durumSatiri.className = "yazi yazi--kucuk yazi--hata";
          durumSatiri.textContent = (e && e.message) || "The transaction could not be sent.";
        }
      });
      govde.append(dugme);
    } else if (acik && !hesap) {
      govde.append(not("Connect a wallet to buy. The page sends nothing on " +
        "its own.", "bilgi"));
    }
    govde.append(durumSatiri);

    govde.append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "Developer: " + gelistirici }));

    liste.append(panel("Product #" + id, govde));
  });

  kap.append(panel("Products", liste));
  if (sayi > 20) {
    kap.append(not("Showing the newest 20 of " + sayi + " products. " +
      "Listing them all would mean hundreds of calls.", "bilgi"));
  }
  return kap;
}
