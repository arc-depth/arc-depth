/* ===========================================================================
 * gorunum/olustur.js — token creation
 *
 * One column, consistent spacing, five sections in the order the brief
 * sets: identity, collateral, tax, optional first buy, payment summary.
 * No technical explanations in the flow — the contract details live in
 * /dokuman and /guvenlik.
 *
 * THE SUBMIT BUTTON IS NOT RENDERED UNTIL THE LAUNCHPAD EXISTS
 *   The form itself is real: every field validates, and the payment
 *   breakdown is computed from the contract's own constants, so a creator
 *   can see exactly what $100 buys before anything is deployed. What is
 *   NOT offered is a button that would fail — "çalışmayan özellikleri
 *   aktif buton olarak sunma", taken literally.
 * =========================================================================== */

import { el, sayfaUst, panel, not, dagitimBekliyor, temizle } from "../ui.js";
import { EKONOMI, PULSE, PULSE_KURAL, launchpadCanli, canli } from "../adresler.js";
import { ABI, cagriVerisi } from "../zincir.js";
import { cuzdan } from "../cuzdan.js";
import { para, ppmYuzde } from "../bicim.js";
import { ONERILEN } from "../teminat-listesi.js";
import { oneriTablosu, caAlani, zincirEtiketi, tutarYaz } from "./teminat-sec.js";

export async function ciz({ kayit, param }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Token oluştur", "Teminatlı, sabit arzlı, kurucu payı olmayan"));

  /* State for the live payment summary.
     TWO AMOUNTS, AND THEY ARE NOT THE OLD ONES
       The previous rule had ONE payment that was split into fee,
       collateral and pool liquidity, and the founder received no tokens.
       Now the founder's BUY and the COLLATERAL are separate numbers: the
       buy is capped, becomes tokens in the founder's wallet, and its net
       is what funds the pool's bid. The collateral has no ceiling and
       belongs to the holders.

       Carrying the old field names forward would have been worse than
       renaming them: "odeme" meant something the contract no longer
       accepts. */
  const durum = {
    alim: PULSE_KURAL.asgariAlim,
    teminat: PULSE_KURAL.asgariTeminat,
    vergiPpm: PULSE_KURAL.vergiVarsayilanPpm,
    /* ONE asset, at full weight.
       Bir agirlikli sepet degil: EgriLaunchpad tam bir kalem istiyor
       (`sepet.length != 1` reddediliyor) ve agirligi 10.000 bps olmak
       zorunda. Form bes varlikli yuzdelik bir sepet sunuyordu ve o form
       hicbir zaman kabul edilemeyecek bir launch uretiyordu — gonderilmeden
       once degil, zincirde reddedilerek. */
    teminatVarlik: null
  };

  const ozetKap = el("div");
  const ozetiCiz = () => { temizle(ozetKap).append(odemeOzeti(durum)); };

  /* ---- 1. identity -------------------------------------------------- */
  /* Held by reference. The submit used to have no handler at all; now
     that it does, it needs these values, and reading them back out of
     the DOM by selector would find the wrong input the day a second
     text field is added. */
  const adGirdi = el("input", {
    sinif: "girdi", attr: { type: "text", placeholder: "Örnek Coin", maxlength: "32" }
  });
  const sembolGirdi = el("input", {
    sinif: "girdi mono", attr: { type: "text", placeholder: "ORNEK", maxlength: "8" }
  });

  kap.append(panel("Kimlik", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan" }, [
      el("label", { sinif: "alan__etiket", yazi: "Logo" }),
      el("input", { sinif: "girdi", attr: { type: "file", accept: "image/*" } }),
      el("div", { sinif: "alan__ipucu", yazi: "Kare, en az 256×256. Zincire yazılmaz." })
    ]),
    el("div", { sinif: "izgara izgara--genis" }, [
      alan("Token adı", adGirdi),
      alan("Sembol", sembolGirdi)
    ]),
    alan("Açıklama", el("textarea", {
      sinif: "girdi", attr: { placeholder: "Bu token ne?", maxlength: "500" }
    })),
    el("div", { sinif: "izgara izgara--genis" }, [
      alan("X (Twitter)", el("input", { sinif: "girdi", attr: { type: "url", placeholder: "https://x.com/…" } })),
      alan("Telegram", el("input", { sinif: "girdi", attr: { type: "url", placeholder: "https://t.me/…" } })),
      alan("Web sitesi", el("input", { sinif: "girdi", attr: { type: "url", placeholder: "https://…" } }))
    ])
  ])));

  /* ---- 2. collateral: ONE asset, chosen or pasted ------------------- */
  const teminatKap = el("div", { sinif: "yigin yigin--sik" });

  const teminatiCiz = () => {
    temizle(teminatKap);
    const v = durum.teminatVarlik;

    if (!v) {
      teminatKap.append(not(
        "Henüz teminat seçilmedi. Aşağıdaki " + ONERILEN.length +
        " öneriden birini seç ya da kendi kontrat adresini yapıştır.",
        "uyari"
      ));
    } else {
      const zincirler = Object.keys(v.zincirler);
      teminatKap.append(el("div", { sinif: "satir satir--arasi" }, [
        el("div", { sinif: "jeton" }, [
          el("div", { sinif: "jeton__logo jeton__logo--bos",
            yazi: v.simge.slice(0, 3).toUpperCase() }),
          el("div", { sinif: "jeton__yazi" }, [
            el("div", { sinif: "jeton__sembol", yazi: v.simge }),
            el("div", { sinif: "jeton__ad",
              yazi: v.ad + " · " + v.ondalik + " ondalık · " +
                zincirler.map(zincirEtiketi).join(", ") }),
            el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
              yazi: "ölçülen en büyük dönüşüm " + tutarYaz(v.azamiTutar) })
          ])
        ]),
        el("button", {
          sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Değiştir",
          on: { click: () => { durum.teminatVarlik = null; teminatiCiz(); ozetiCiz(); } }
        })
      ]));
      teminatKap.append(el("div", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Kontrat: " + Object.values(v.zincirler)[0].token
      }));
      if (v.caIle) {
        teminatKap.append(not(
          "Önerilen listeden değil — kontrat adresiyle seçildi ve aynı " +
          "kontrolü geçti: en derin USDC havuzu bulundu, likiditesi ve " +
          "gözlem geçmişi okundu.", "bilgi"));
      }
    }
  };

  const teminatSecildi = (v) => {
    durum.teminatVarlik = v;
    teminatiCiz();
    ozetiCiz();
  };

  /* A collateral address handed over by the selection screen
     (#/olustur?teminat=0x…). Matched against the recommended list so the
     symbol and decimals come from the measurement rather than from the
     query string — a URL is not a source of truth about a token. */
  const gelen = param && param.get && param.get("teminat");
  if (gelen) {
    const esles = ONERILEN.find((v) =>
      Object.values(v.zincirler).some((d) =>
        d.token.toLowerCase() === String(gelen).toLowerCase()));
    if (esles) durum.teminatVarlik = esles;
  }
  teminatiCiz();

  kap.append(panel("Teminat", [
    el("div", { sinif: "ikincil", attr: { style: "margin-bottom:12px" }, yazi:
      "Tokenin arkasında hangi varlığın birikeceğini seç. Her işlemin " +
      "vergisi bu varlığa akar ve fiyat teminatın token başına değerinin " +
      "altına düştüğünde geri alım devreye girer." }),
    teminatKap
  ]));

  kap.append(panel("Kendi tokenini kullan", caAlani(teminatSecildi)));

  kap.append(panel(
    "Önerilen " + ONERILEN.length,
    oneriTablosu(teminatSecildi),
    el("span", { sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "liste bir kapı değil — kısayol" }),
    true
  ));

  /* ---- 3. tax -------------------------------------------------------- */
  const vergiEtiket = el("span", { sinif: "mono", yazi: ppmYuzde(durum.vergiPpm) });
  kap.append(panel("Teminat vergisi", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "satir satir--arasi" }, [
      el("span", { sinif: "ikincil", yazi: "Her işlemden kasaya gidecek pay" }),
      vergiEtiket
    ]),
    el("input", {
      sinif: "girdi",
      attr: {
        type: "range",
        min: String(EKONOMI.vergiAsgariPpm),
        max: String(EKONOMI.vergiAzamiPpm),
        step: "5000",
        value: String(durum.vergiPpm),
        style: "padding:0;height:36px;background:transparent;border:0"
      },
      on: {
        input: (ev) => {
          durum.vergiPpm = Number(ev.target.value);
          vergiEtiket.textContent = ppmYuzde(durum.vergiPpm);
          ozetiCiz();
        }
      }
    }),
    el("div", { sinif: "alan__ipucu", yazi:
      ppmYuzde(EKONOMI.vergiAsgariPpm) + " ile " + ppmYuzde(EKONOMI.vergiAzamiPpm) +
      " arası. Bir kez seçilir, sonra kimse değiştiremez — sen de değil." })
  ])));

  /* ---- 4. payment and optional first buy ----------------------------- */
  kap.append(panel("Ödeme", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "izgara izgara--genis" }, [
      alan("Toplam ödeme", el("div", { sinif: "girdi-grup" }, [
        el("input", {
          sinif: "girdi girdi--sayi",
          attr: { type: "number", min: String(EKONOMI.asgariOdeme), step: "10", value: String(durum.odeme) },
          on: { input: (ev) => { durum.odeme = Number(ev.target.value) || 0; ozetiCiz(); } }
        }),
        el("span", { sinif: "girdi-grup__son", yazi: "USDC" })
      ]), "En az " + para(EKONOMI.asgariOdeme)),
      alan("Kasaya ayrılan", el("div", { sinif: "girdi-grup" }, [
        el("input", {
          sinif: "girdi girdi--sayi",
          attr: { type: "number", min: String(EKONOMI.asgariTeminat), step: "5", value: String(durum.teminat) },
          on: { input: (ev) => { durum.teminat = Number(ev.target.value) || 0; ozetiCiz(); } }
        }),
        el("span", { sinif: "girdi-grup__son", yazi: "USDC" })
      ]), "En az " + para(EKONOMI.asgariTeminat)),
      alan("İsteğe bağlı ilk alım", el("div", { sinif: "girdi-grup" }, [
        el("input", {
          sinif: "girdi girdi--sayi",
          attr: { type: "number", min: "0", step: "10", value: String(durum.ilkAlim) },
          on: { input: (ev) => { durum.ilkAlim = Number(ev.target.value) || 0; ozetiCiz(); } }
        }),
        el("span", { sinif: "girdi-grup__son", yazi: "USDC" })
      ]), "Boş bırakabilirsin")
    ])
  ])));

  /* ---- 5. summary ---------------------------------------------------- */
  ozetiCiz();
  kap.append(panel("Özet", ozetKap));

  /* ---- the submit ---------------------------------------------------- */
  /* A BUTTON WITH NO HANDLER IS THE RULE THIS BREAKS
       This rendered a large brand button the moment launchpadCanli()
       became true — and the button did nothing. The page audit passed
       because it checks that the view CONSULTS canli(), not that the
       control acts. "Çalışmayan özellikleri aktif buton olarak sunma"
       was broken by the check that exists to enforce it.

       An assertion for exactly this now lives in denetim-sayfa.js: a
       large brand button must carry a click handler. */
  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });

  if (launchpadCanli()) {
    const dugme = el("button", {
      sinif: "dugme dugme--marka dugme--buyuk dugme--tam",
      yazi: "TOKEN OLUŞTUR",
      attr: { type: "button" }
    });

    dugme.addEventListener("click", async () => {
      const ad = (adGirdi.value || "").trim();
      const sembol = (sembolGirdi.value || "").trim();
      const v = durum.teminatVarlik;

      /* Everything the contract will refuse, refused here first — with
         the reason, rather than letting the chain answer with a selector
         nobody can read. */
      if (!ad || !sembol) {
        durumSatiri.textContent = "Ad ve sembol boş olamaz.";
        return;
      }
      if (!v) {
        durumSatiri.textContent = "Teminat varlığı seçilmedi.";
        return;
      }
      if (durum.alim < PULSE_KURAL.asgariAlim || durum.alim > PULSE_KURAL.azamiAlim) {
        durumSatiri.textContent = "Alım " + PULSE_KURAL.asgariAlim + "–" +
          PULSE_KURAL.azamiAlim + " USDC arası olmalı.";
        return;
      }
      if (durum.teminat < PULSE_KURAL.asgariTeminat) {
        durumSatiri.textContent = "Teminat en az " + PULSE_KURAL.asgariTeminat +
          " USDC olmalı.";
        return;
      }

      const hedef = Object.values(v.zincirler)[0].token;
      /* Six decimals, because the quote has six. Rounded rather than
         truncated so a form showing 100 does not send 99,999999. */
      const alim = BigInt(Math.round(durum.alim * 1e6));
      const teminat = BigInt(Math.round(durum.teminat * 1e6));

      try {
        durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
        durumSatiri.textContent = "USDC izni isteniyor…";
        /* Exactly what this launch needs, not an unlimited allowance: a
           standing allowance on a contract that moves money is a liability
           for no benefit. */
        await cuzdan.gonder({
          to: EKONOMI.quote,
          data: cagriVerisi(ABI.erc20Yaz, "approve", [PULSE.launchpad, alim + teminat])
        });

        durumSatiri.textContent = "Launch gönderiliyor…";
        const hash = await cuzdan.gonder({
          to: PULSE.launchpad,
          data: cagriVerisi(ABI.launchpadYaz, "launch",
            [ad, sembol, hedef, BigInt(durum.vergiPpm), alim, teminat])
        });
        durumSatiri.className = "yazi yazi--kucuk";
        /* The hash and nothing else. Saying "your token is live" here
           would be claiming something only the chain can say, and it says
           it on the next read. */
        durumSatiri.textContent = "Gönderildi: " + hash;
      } catch (e) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = (e && e.message) || "İşlem gönderilemedi.";
      }
    });

    kap.append(dugme);
    kap.append(durumSatiri);
  } else {
    kap.append(dagitimBekliyor(kayit));
  }

  return kap;
}

function alan(etiket, girdi, ipucu) {
  return el("div", { sinif: "alan" }, [
    el("label", { sinif: "alan__etiket", yazi: etiket }),
    girdi,
    ipucu ? el("div", { sinif: "alan__ipucu", yazi: ipucu }) : null
  ]);
}

/**
 * The payment breakdown, from the contract's own constants.
 * 2% fee, then the collateral, then whatever is left becomes permanent
 * liquidity paired with tokens at the opening price.
 */
/* What the launch actually does with the money, from the deployed
   contract's own constants.

   EVERY LINE HERE WAS WRONG FOR THE NEW RULE
     The previous summary showed a fee/collateral/liquidity split, "tokens
     left on the curve", "the curve deepens the pool at $6.000" and "free
     tokens for you: 0". There is no curve, no graduation, and the founder
     now receives tokens — paid for, at the opening price.

     A summary that describes a different product than the one the button
     sends is worse than no summary: it is a promise the chain will not
     keep. */
function odemeOzeti(d) {
  const ucret = (d.alim * PULSE_KURAL.launchUcretPpm) / 1e6;
  const net = d.alim - ucret;
  /* net * arz / acilisMcap — the contract's own formula, not a second
     one. A second formula is a second price that can drift from the
     first. */
  const kurucuToken = (net * PULSE_KURAL.arz) / PULSE_KURAL.acilisMcap;
  const merdiven = PULSE_KURAL.arz - kurucuToken;
  const pay = PULSE_KURAL.arz > 0 ? (kurucuToken / PULSE_KURAL.arz) * 100 : 0;

  const gecerli = d.alim >= PULSE_KURAL.asgariAlim
    && d.alim <= PULSE_KURAL.azamiAlim
    && d.teminat >= PULSE_KURAL.asgariTeminat
    && !!d.teminatVarlik;

  const bin = (x) => Math.round(x).toLocaleString("tr-TR");

  const satirlar = [
    ["Alım", para(d.alim)],
    ["— protokol ücreti (%2)", "−" + para(ucret)],
    ["— sana token olarak", para(net)],
    ["Alacağın token", bin(kurucuToken) + "  (%" + pay.toFixed(2) + " arz)"],
    ["Havuza gerçek teklif", para(net)],
    ["Havuza token merdiveni", bin(merdiven)],
    ["Teminat kasasına", para(d.teminat)],
    ["Bedava token", "0 — payını açılış fiyatından satın alıyorsun"]
  ];

  const t = el("table", { sinif: "tablo tablo--kart" });
  const g = el("tbody");
  for (const [x, y] of satirlar) {
    g.append(el("tr", {}, [
      el("td", { attr: { "data-et": "" }, yazi: x }),
      el("td", { sinif: "sayi", attr: { "data-et": x }, yazi: y })
    ]));
  }
  t.append(g);

  return el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "tablo-sarmal" }, [t]),
    gecerli
      ? not("Açılış piyasa değeri " + para(PULSE_KURAL.acilisMcap) + " ve " +
            "arzın tamamı " + bin(PULSE_KURAL.arz) + ". Ne kadar ödersen " +
            "aynı fiyattan açıyor — fazlası daha yüksek fiyat değil, daha " +
            "derin bir teklif satın alıyor. Havuza giden " + para(net) +
            " KİLİTLİ ve kimse çekemez; kasadaki " + para(d.teminat) +
            " token sahiplerinin ve token yakılarak geri alınabilir.")
      : not("Alım " + para(PULSE_KURAL.asgariAlim) + "–" +
            para(PULSE_KURAL.azamiAlim) + " arası, teminat en az " +
            para(PULSE_KURAL.asgariTeminat) + " olmalı ve bir teminat " +
            "varlığı seçilmeli.", "uyari")
  ]);
}
