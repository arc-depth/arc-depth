/* ===========================================================================
 * gorunum/gelistirici.js — the developer portal
 *
 * There are TWO ways an outside developer earns here, and they are
 * independent of each other:
 *
 *   1. THE MARKETPLACE — they sell their own product. 80% of the revenue
 *      goes straight to them, in the same transaction, with no balance
 *      held in between.
 *   2. THE DEVELOPER POOL — 0.30% of every trade accumulates in the
 *      DevPool, and money leaves it only through a proposal the FTHM DAO
 *      has passed.
 *
 * WHY THEY ARE DESCRIBED SEPARATELY
 *   The first runs by itself: sell the product, take the money. The
 *   second depends on a vote, and that vote CANNOT BE CAST TODAY —
 *   staked FTHM is zero, so nobody has voting power. The pool keeps
 *   filling and nobody can draw on it.
 *
 *   Putting both under one "developer earnings" heading would present an
 *   unfunded reward as guaranteed income, which is precisely what the
 *   user forbade.
 *
 * WHAT IS NOT ON CHAIN
 *   Product details sit behind a URI. An API key, a private endpoint or
 *   customer data is NOT written to the chain; the chain is public and
 *   cannot be undone. Licence checks use the buyer's address, so the
 *   developer shares no secret with anyone.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, dagitimBekliyor } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { PAZAR, PAZAR_KURAL, PULSE, YONETISIM, EKONOMI, canli } from "../adresler.js";
import { para, jetonMiktar, tamSayidanSayi, ppmYuzde } from "../bicim.js";

const PLATFORM_PPM = 200_000;
/* NOT A SECOND COPY
     This was written here as 3_000. The fee table already lives in
     EKONOMI.dilimler and denetim-sayfa.js asserts every entry of it
     against the deployed hook — a hand-written duplicate here would sit
     outside that check and could drift from the contract without
     anything noticing. */
const GELISTIRICI_PPM = EKONOMI.dilimler.gelistirici;

export async function ciz({ kayit, cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  /* hesap() BIR FONKSIYON, OZELLIK DEGIL
       Bu satir once "cuzdan.hesap ? cuzdan.hesap : null" diye yazilmisti:
       fonksiyonun KENDISI atanmis oluyordu ve bir fonksiyon her zaman
       truthy. Sonuc, cuzdan bagli olmasa bile ekranin bagliymis gibi
       davranmasiydi — gonderemeyecegi bir formu basar ve "kazancini"
       okumaya calisirdi. Diger gorunumlerin hepsi cuzdan.hesap() diye
       cagiriyor. */
  const hesap = cuzdan ? cuzdan.hesap() : null;

  kap.append(sayfaUst(
    "Developer portal",
    "Sell a product or contribute — two routes, two separate sources"
  ));

  /* ---- 1. the two routes, side by side ---------------------------- */
  kap.append(panel("Two ways to earn", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Marketplace sale", ppmYuzde(1_000_000 - PLATFORM_PPM),
        "per sale, to you in the same transaction"),
      olcum("Developer pool", ppmYuzde(GELISTIRICI_PPM),
        "from every trade, paid out by a DAO vote")
    ]),
    not(
      "A marketplace sale runs by itself: you sell, the money reaches your " +
      "wallet in the same transaction, nobody holds it in between. The " +
      "developer pool depends on a vote instead. Why that matters is " +
      "below.",
      "bilgi"
    )
  ])));

  /* ---- 2. the dev pool, with its real state ----------------------- */
  const havuzGovde = el("div", { sinif: "yigin yigin--sik" });

  if (!canli(PULSE.devPool)) {
    havuzGovde.append(not("The developer pool is not on chain yet.", "uyari"));
  } else {
    /* The balance and the voting power that would be needed to spend it. */
    let tutulan = null, stakeli = null, taban = null;
    try {
      const ham = await cokluCagri([
        { method: "eth_call", params: [{ to: EKONOMI.quote,
          data: cagriVerisi(ABI.erc20, "balanceOf", [PULSE.devPool]) }, "latest"] },
        { method: "eth_call", params: [{ to: YONETISIM.staking,
          data: cagriVerisi(ABI.staking, "totalStaked") }, "latest"] },
        { method: "eth_call", params: [{ to: YONETISIM.staking,
          data: cagriVerisi(ABI.staking, "MIN_OY_GUCU") }, "latest"] }
      ]);
      const tek = (tablo, ad, r) => {
        if (r == null) return null;
        const c = sonucCoz(tablo, ad, r);
        return c && c.length === 1 ? c[0] : c;
      };
      tutulan = tek(ABI.erc20, "balanceOf", ham[0]);
      stakeli = tek(ABI.staking, "totalStaked", ham[1]);
      taban = tek(ABI.staking, "MIN_OY_GUCU", ham[2]);
    } catch (e) { /* reported below */ }

    havuzGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Havuzda biriken",
        tutulan == null ? "unreadable" : para(tamSayidanSayi(tutulan, 6)),
        "0.30% of every trade"),
      olcum("FTHM staked",
        stakeli == null ? "unreadable" : jetonMiktar(tamSayidanSayi(stakeli, 18)),
        "all of the voting power"),
      olcum("Proposal floor",
        taban == null ? "unreadable" : jetonMiktar(tamSayidanSayi(taban, 18)) + " FTHM",
        "the minimum needed to propose")
    ]));

    /* THE HONEST PART, AND IT IS THE WHOLE POINT
         A portal that lists a pool balance and a "claim" button would be
         promising money that cannot move. The pool can only pay through a
         passed proposal, and with nothing staked no proposal can even be
         opened. */
    const bos0 = stakeli != null && BigInt(stakeli) === 0n;
    havuzGovde.append(not(
      bos0
        ? "Money leaves this pool only through a proposal the FTHM DAO has " +
          "passed, and RIGHT NOW no FTHM is staked — so nobody has voting " +
          "power and nobody can propose. The pool keeps filling and " +
          "neither the DAO nor we can take anything out of it. There is no " +
          "claim button here because there is nothing to press."
        : "Money leaves this pool only through a proposal the FTHM DAO has " +
          "passed: a 1% proposal threshold, 10% quorum, five days of " +
          "voting, two days of timelock. You can record your contribution, " +
          "but payment depends on a vote.",
      bos0 ? "uyari" : "bilgi"
    ));

    havuzGovde.append(not(
      "The pool answers to the FTHM governor, and that address cannot be " +
      "changed. The previous developer fund answered to the operations " +
      "wallet, and that could not be changed either — so the DAO could " +
      "never reach it. That is exactly why the pool was replaced.",
      "bilgi"
    ));
  }
  /* ---- 2b. THE ONE THING THAT ACTUALLY WORKS TODAY ----------------
       register() is permissionless and the DevPool is deployed, so a
       developer can put a contribution on chain right now. That is a
       RECORD, not a payment, and the wording has to keep those apart:
       recording work does not fund it, and pretending otherwise would be
       exactly the "unfunded reward shown as guaranteed earnings" the
       brief forbids.

       It is still worth having. When the DAO can vote, the proposal that
       pays somebody references a contribution id, and that id has to
       exist first. */
  if (canli(PULSE.devPool)) {
    const katkiGovde = el("div", { sinif: "yigin yigin--sik" });
    let sayi = null;
    try {
      sayi = await oku(PULSE.devPool, ABI.devPool, "contributionCount");
    } catch (e) { sayi = null; }

    katkiGovde.append(el("p", {
      sinif: "yazi yazi--sessiz",
      yazi: "You can put your work on chain: give a link (a PR, a repo, a " +
        "report), the record is public and gets an id. This is NOT A " +
        "PAYMENT — payment happens only through a proposal the DAO " +
        "passes, and that proposal refers to this id."
    }));
    katkiGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Contributions recorded", sayi == null ? "unreadable" : String(Number(sayi)),
        "to date"),
      olcum("Who may record", "anyone", "permissionless: the judgement happens in the vote")
    ]));

    const uriGirdi = el("input", {
      sinif: "girdi",
      attr: { type: "text", placeholder: "https://github.com/... or ipfs://...",
        maxlength: "300" }
    });
    const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const dugme = el("button", {
      sinif: "dugme dugme--marka",
      yazi: "KATKIYI KAYDET",
      attr: { type: "button" }
    });

    dugme.addEventListener("click", async () => {
      const uri = (uriGirdi.value || "").trim();
      if (!uri) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = "Enter a link.";
        return;
      }
      if (!hesap) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = "Wallet is not connected.";
        return;
      }
      try {
        durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
        durumSatiri.textContent = "Sending…";
        const hash = await cuzdan.gonder({
          to: PULSE.devPool,
          data: cagriVerisi(ABI.devPoolYaz, "register", [uri])
        });
        durumSatiri.className = "yazi yazi--kucuk";
        /* The hash and nothing else: whether it landed is the chain's to
           say, and it says so on the next read. */
        durumSatiri.textContent = "Sent: " + hash;
      } catch (e) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = (e && e.message) || "The transaction could not be sent.";
      }
    });

    katkiGovde.append(el("div", { sinif: "alan" }, [
      el("label", { sinif: "alan__etiket", yazi: "Link to the contribution" }),
      uriGirdi
    ]));
    if (hesap) {
      katkiGovde.append(dugme);
    } else {
      katkiGovde.append(not(
        "Connect a wallet to record something. The page sends nothing on " +
        "its own.", "bilgi"));
    }
    katkiGovde.append(durumSatiri);
    katkiGovde.append(not(
      "What you record is public and cannot be taken back. DO NOT write a " +
      "private repo address, a key, or customer data.", "uyari"));

    kap.append(panel("Record a contribution", katkiGovde));
  }

  kap.append(panel("Developer pool", havuzGovde));

  /* ---- 3. the marketplace side ------------------------------------
   *
   * DEPLOYED, SO THE FORMS ARE REAL NOW
   *   This section used to say "awaiting deployment", and that was true.
   *   The marketplace is on Arc mainnet now, so the registration and
   *   publishing forms send real transactions.
   *
   *   Registration is permissionless: an approval gate would need
   *   somebody to do the approving. The quality gate is not registration
   *   but sales count and ratings only paying customers can give.   */
  if (!canli(PAZAR.pazar)) {
    kap.append(panel("Publish a product", dagitimBekliyor(kayit)));
  } else {
    /* Is this wallet registered? Everything else depends on it, and the
       contract refuses urunEkle() without it. */
    let kayitli = null;
    if (hesap) {
      try {
        const r = await cokluCagri([{
          method: "eth_call",
          params: [{ to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazar, "gelistirici", [hesap]) }, "latest"]
        }]);
        const d = r[0] == null
          ? null : sonucCoz(ABI.pazar, "gelistirici", r[0]);
        kayitli = d ? d[0] === true : null;
      } catch (e) { kayitli = null; }
    }

    const durum1 = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const kayitGovde = el("div", { sinif: "yigin yigin--sik" });

    if (!hesap) {
      kayitGovde.append(bos(
        "Wallet not connected",
        "Connect a wallet to register. The page sends nothing on its own."
      ));
    } else if (kayitli === null) {
      kayitGovde.append(not(
        "Registration status could not be read. Rendering a form without " +
        "knowing what the chain says would be an invitation to send a " +
        "transaction that reverts.", "uyari"));
    } else if (kayitli === true) {
      kayitGovde.append(not("This wallet is registered. You can publish a product.",
        "bilgi"));
    } else {
      const profilGirdi = el("input", {
        sinif: "girdi",
        attr: { type: "text", maxlength: "300",
          placeholder: "https://… or ipfs://… — who you are, what you build" }
      });
      const kayitDugme = el("button", {
        sinif: "dugme dugme--marka", yazi: "KAYDOL", attr: { type: "button" }
      });
      kayitDugme.addEventListener("click", async () => {
        const uri = (profilGirdi.value || "").trim();
        /* The contract reverts on an empty uri; saying so here is clearer
           than letting the chain answer with a selector. */
        if (!uri) {
          durum1.className = "yazi yazi--kucuk yazi--hata";
          durum1.textContent = "The profile link cannot be empty.";
          return;
        }
        try {
          durum1.className = "yazi yazi--kucuk yazi--sessiz";
          durum1.textContent = "Sending…";
          const h = await cuzdan.gonder({
            to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazarYaz, "kaydol", [uri])
          });
          durum1.className = "yazi yazi--kucuk";
          durum1.textContent = "Sent: " + h;
        } catch (e) {
          durum1.className = "yazi yazi--kucuk yazi--hata";
          durum1.textContent = (e && e.message) || "The transaction could not be sent.";
        }
      });
      kayitGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "Profile link" }),
        profilGirdi
      ]));
      kayitGovde.append(kayitDugme);
      kayitGovde.append(not(
        "What you write is public and cannot be taken back. DO NOT write an " +
        "API key, a private endpoint, or customer data — the chain is " +
        "open to everyone.",
        "uyari"));
    }
    kayitGovde.append(durum1);
    kap.append(panel("Developer registration", kayitGovde));

    /* ---- publishing, only when it can succeed --------------------- */
    const yayinGovde = el("div", { sinif: "yigin yigin--sik" });
    if (kayitli !== true) {
      yayinGovde.append(not(
        hesap
          ? "You have to register before publishing: the contract does " +
            "not accept urunEkle() from an unregistered address. A form " +
            "that cannot work is not rendered."
          : "Connect a wallet and register to publish a product.",
        "bilgi"));
    } else {
      const adGirdi = el("input", {
        sinif: "girdi",
        attr: { type: "text", maxlength: "300",
          placeholder: "https://… or ipfs://… — product details" }
      });
      const fiyatGirdi = el("input", {
        sinif: "girdi",
        attr: { type: "number", min: "0", step: "0.01", placeholder: "25.00" }
      });
      const periyotGirdi = el("select", { sinif: "girdi" });
      for (const [etiket, sn] of [
        ["One-off — a licence that never expires", "0"],
        ["Monthly subscription (30 days)", String(30 * 86400)],
        ["Yearly subscription (365 days)", String(365 * 86400)]
      ]) {
        periyotGirdi.append(el("option", { yazi: etiket, attr: { value: sn } }));
      }
      const durum2 = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
      const yayinDugme = el("button", {
        sinif: "dugme dugme--marka", yazi: "PUBLISH PRODUCT",
        attr: { type: "button" }
      });
      yayinDugme.addEventListener("click", async () => {
        const uri = (adGirdi.value || "").trim();
        const f = Number(fiyatGirdi.value);
        if (!uri) {
          durum2.className = "yazi yazi--kucuk yazi--hata";
          durum2.textContent = "The product link cannot be empty.";
          return;
        }
        if (!Number.isFinite(f) || f < 0) {
          durum2.className = "yazi yazi--kucuk yazi--hata";
          durum2.textContent = "The price has to be zero or a positive number.";
          return;
        }
        try {
          durum2.className = "yazi yazi--kucuk yazi--sessiz";
          durum2.textContent = "Sending…";
          /* Six decimals, because the quote has six. Rounded rather than
             truncated so a form showing 25 does not send 24,999999. */
          const fiyat = BigInt(Math.round(f * 1e6));
          const periyot = BigInt(periyotGirdi.value || "0");
          const h = await cuzdan.gonder({
            to: PAZAR.pazar,
            data: cagriVerisi(ABI.pazarYaz, "urunEkle", [fiyat, periyot, uri])
          });
          durum2.className = "yazi yazi--kucuk";
          durum2.textContent = "Sent: " + h;
        } catch (e) {
          durum2.className = "yazi yazi--kucuk yazi--hata";
          durum2.textContent = (e && e.message) || "The transaction could not be sent.";
        }
      });

      yayinGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "Product link" }),
        adGirdi
      ]));
      yayinGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "Fiyat (USDC)" }),
        fiyatGirdi
      ]));
      yayinGovde.append(el("div", { sinif: "alan" }, [
        el("label", { sinif: "alan__etiket", yazi: "How it sells" }),
        periyotGirdi
      ]));
      yayinGovde.append(yayinDugme);
      yayinGovde.append(durum2);
      yayinGovde.append(not(
        "How it sells CANNOT be changed later. Turning a subscription that " +
        "was bought as monthly into a yearly one would change what the " +
        "customer already holds; a different period means a new product. " +
        "Price and description can change.", "bilgi"));
      yayinGovde.append(not(
        "You can take a product off sale, but you CANNOT revoke a licence " +
        "already sold — that would be taking back something somebody " +
        "paid for.", "bilgi"));
    }
    kap.append(panel("Publish a product", yayinGovde));
  }

  /* ---- 4. earnings, from the contract's own ledger ----------------- */
  const kazancGovde = el("div", { sinif: "yigin yigin--sik" });
  if (!hesap) {
    kazancGovde.append(bos(
      "Wallet not connected",
      "Earnings are read per wallet address."
    ));
  } else if (!canli(PAZAR.pazar)) {
    kazancGovde.append(not("The marketplace is not deployed, so there is no " +
      "ledger to read.", "bilgi"));
  } else {
    let kazanc = null;
    try {
      kazanc = await oku(PAZAR.pazar, ABI.pazar, "gelistiriciKazanci", [hesap]);
    } catch (e) { kazanc = null; }
    kazancGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Earned on the marketplace",
        kazanc == null ? "unreadable" : para(tamSayidanSayi(kazanc, 6)),
        (PAZAR_KURAL.gelistiriciPpm / 10_000) + "% of your sales")
    ]));
    /* The distinction the brief insists on: this number is money that
       ALREADY moved, not a promise. */
    kazancGovde.append(not(
      kazanc != null && BigInt(kazanc) === 0n
        ? "No sales yet. This zero is real — the marketplace was just deployed."
        : "This is the total that has ALREADY reached your wallet, not a " +
          "balance waiting to be claimed. A marketplace sale pays out in " +
          "the same transaction; nobody holds it in between.",
      "bilgi"));
    kazancGovde.append(not(
      "The developer pool is SEPARATE from this, and its figure is above. " +
      "Money in that pool depends on a vote; adding the two under one " +
      "heading would present an unfunded reward as earnings.", "uyari"));
  }
  kap.append(panel("My earnings", kazancGovde));

  return kap;
}
