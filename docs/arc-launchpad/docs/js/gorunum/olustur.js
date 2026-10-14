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
 *   NOT offered is a button that would fail — "do not offer features that
 *   do not work as active buttons", taken literally.
 * =========================================================================== */

import { el, sayfaUst, panel, not, dagitimBekliyor, temizle } from "../ui.js";
import { EKONOMI, PULSE, PULSE_KURAL, launchpadCanli, canli } from "../adresler.js";
import { ABI, cagriVerisi } from "../zincir.js";
import { cuzdan } from "../cuzdan.js";
import { para, ppmYuzde } from "../bicim.js";
import { ONERILEN } from "../teminat-listesi.js";
import { oneriTablosu, caAlani, zincirEtiketi, tutarYaz } from "./teminat-sec.js";
import { AGLAR, AG, IKIZ_SECENEK, agBul } from "../aglar.js";
import { Interface } from "../../vendor/ethers.min.js";

/* ---- reads on whichever chain the launch is on ----------------------- */
async function agCagri(ag, method, params) {
  const r = await fetch(ag.rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message || "RPC error");
  return r.result;
}
async function makbuzBekle(ag, hash) {
  for (let i = 0; i < 120; i++) {
    const m = await agCagri(ag, "eth_getTransactionReceipt", [hash]).catch(() => null);
    if (m) return m;
    await new Promise((ok) => setTimeout(ok, 2500));
  }
  throw new Error("No receipt yet for " + hash);
}
const gazBirim = (wei, ag) => (Number(BigInt(wei)) / 1e18).toPrecision(3) + " " + ag.gaz;

export async function ciz({ kayit, param }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Create a token", "Collateral-backed, fixed supply, no free founder share"));

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
    teminatVarlik: null,
    /* Which chain the launch happens on. Any of the nine; the token can
       then be spread to all the others. */
    ag: agBul(param && param.get && param.get("zincir")) || agBul("base")
  };

  /* SECOND GENERATION (dagitim-nesil2.json). On chains with nesil 2 the
     founder chooses where the collateral may be converted: an asset on one
     of the chain's remotes (Base, Arbitrum), carried there by Circle's CCTP
     and bought against a price floor, or no conversion at all. The choice
     is written into the vault as immutables at launch. The first-generation
     Arc launchpad (0xB6AC…2300) is no longer offered: its cross-chain path
     could not complete (found and measured 14 Oct 2026). */
  const ZINCIR_ADI = { base: "Base", arbitrum: "Arbitrum" };
  /* Chains where a launch cannot fit in a block an ordinary wallet can use.
     HyperEVM: small blocks are capped at 3,000,000 gas (read from the chain,
     14 Oct 2026) and a launch costs ~11,000,000 (measured on forks of six
     chains); the 30M big blocks are only for addresses that switched to
     them on HyperCore. So the launch would always revert there. Tokens
     launched elsewhere still reach HyperEVM: the spread is delivered by
     LayerZero's executor, which uses big blocks. */
  const LAUNCH_YOK = { hyperevm: "HyperEVM blocks hold 3M gas and a launch needs about 11M, so launches cannot run there. Launch on any other chain and spread the token to HyperEVM in the next step." };
  const DOMAINI = { base: 6, arbitrum: 3 };
  /* the remote chain the chosen asset will live on, for this home chain */
  const uzakSec = (ag, v) => {
    if (!v || ag.nesil !== 2) return null;
    return (ag.uzaklar || []).find((u) => v.zincirler && v.zincirler[u]) || null;
  };

  const ozetKap = el("div");
  const ozetiCiz = () => { temizle(ozetKap).append(odemeOzeti(durum)); };

  /* ---- 0. chain ------------------------------------------------------ */
  const agNotu = el("div");
  const agDugmeleri = el("div", { sinif: "satir", attr: { style: "flex-wrap:wrap;gap:8px" } });
  const agiCiz = () => {
    temizle(agDugmeleri);
    for (const a of AGLAR) {
      agDugmeleri.append(el("button", {
        sinif: "dugme " + (a.id === durum.ag.id ? "dugme--marka" : "dugme--sessiz"),
        attr: { type: "button" }, yazi: LAUNCH_YOK[a.anahtar] ? a.ad + " (spread only)" : a.ad,
        on: { click: () => { durum.ag = a; agiCiz(); teminatiCiz(); } }
      }));
    }
    temizle(agNotu).append(LAUNCH_YOK[durum.ag.anahtar] ? not(LAUNCH_YOK[durum.ag.anahtar], "uyari") : durum.ag.nesil === 2
      ? not(durum.ag.ad + ": pay in USDC. The collateral can stay in dollars here, or be converted into an asset on " +
          durum.ag.uzaklar.map((u) => ZINCIR_ADI[u]).join(" or ") + " — you choose below.", "bilgi")
      : not(durum.ag.ad + ": pay in " + durum.ag.dolarSembol +
          (durum.ag.sarmal ? " (wrapped 1:1 into 6-decimal pUSDC first, automatically)" : "") +
          ". The collateral stays in " + durum.ag.dolarSembol + " on " + durum.ag.ad + ".", "bilgi"));
  };
  agiCiz();
  kap.append(panel("Chain", el("div", { sinif: "yigin" }, [
    agDugmeleri, agNotu,
    el("div", { sinif: "alan__ipucu", yazi: "After the launch, one more transaction makes the token appear on the other eight chains at the same address." })
  ])));

  /* ---- 1. identity -------------------------------------------------- */
  /* Held by reference. The submit used to have no handler at all; now
     that it does, it needs these values, and reading them back out of
     the DOM by selector would find the wrong input the day a second
     text field is added. */
  const adGirdi = el("input", {
    sinif: "girdi", attr: { type: "text", placeholder: "Example Coin", maxlength: "32" }
  });
  const sembolGirdi = el("input", {
    sinif: "girdi mono", attr: { type: "text", placeholder: "EXMPL", maxlength: "8" }
  });

  kap.append(panel("Identity", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan" }, [
      el("label", { sinif: "alan__etiket", yazi: "Logo" }),
      el("input", { sinif: "girdi", attr: { type: "file", accept: "image/*" } }),
      el("div", { sinif: "alan__ipucu", yazi: "Square, at least 256x256. Not written to the chain." })
    ]),
    el("div", { sinif: "izgara izgara--genis" }, [
      alan("Token name", adGirdi),
      alan("Symbol", sembolGirdi)
    ]),
    alan("Description", el("textarea", {
      sinif: "girdi", attr: { placeholder: "What is this token?", maxlength: "500" }
    })),
    el("div", { sinif: "izgara izgara--genis" }, [
      alan("X (Twitter)", el("input", { sinif: "girdi", attr: { type: "url", placeholder: "https://x.com/…" } })),
      alan("Telegram", el("input", { sinif: "girdi", attr: { type: "url", placeholder: "https://t.me/…" } })),
      alan("Website", el("input", { sinif: "girdi", attr: { type: "url", placeholder: "https://…" } }))
    ])
  ])));

  /* ---- 2. collateral: ONE asset, chosen or pasted ------------------- */
  const teminatKap = el("div", { sinif: "yigin yigin--sik" });

  const teminatiCiz = () => {
    temizle(teminatKap);
    if (durum.ag.nesil !== 2) {
      teminatKap.append(not("Collateral: " + durum.ag.dolarSembol + " on " + durum.ag.ad + ".", "bilgi"));
      return;
    }
    const v = durum.teminatVarlik;
    const uzak = uzakSec(durum.ag, v);

    if (!v) {
      teminatKap.append(not(
        "Collateral stays in USDC on " + durum.ag.ad + ". To convert it, pick an asset on " +
        durum.ag.uzaklar.map((u) => ZINCIR_ADI[u]).join(" or ") + " from the suggestions below, or paste a contract address.",
        "bilgi"
      ));
    } else if (!uzak) {
      teminatKap.append(not(v.simge + " is not on " + durum.ag.uzaklar.map((u) => ZINCIR_ADI[u]).join(" or ") +
        ", where collateral from " + durum.ag.ad + " can be converted. Pick another, or keep dollars.", "uyari"));
      teminatKap.append(el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Keep dollars",
        on: { click: () => { durum.teminatVarlik = null; teminatiCiz(); ozetiCiz(); } } }));
    } else {
      const zincirler = Object.keys(v.zincirler);
      teminatKap.append(el("div", { sinif: "satir satir--arasi" }, [
        el("div", { sinif: "jeton" }, [
          el("div", { sinif: "jeton__logo jeton__logo--bos",
            yazi: v.simge.slice(0, 3).toUpperCase() }),
          el("div", { sinif: "jeton__yazi" }, [
            el("div", { sinif: "jeton__sembol", yazi: v.simge }),
            el("div", { sinif: "jeton__ad",
              yazi: v.ad + " · " + v.ondalik + " decimals · " +
                zincirler.map(zincirEtiketi).join(", ") }),
            el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
              yazi: "largest measured conversion " + tutarYaz(v.azamiTutar) })
          ])
        ]),
        el("button", {
          sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Change",
          on: { click: () => { durum.teminatVarlik = null; teminatiCiz(); ozetiCiz(); } }
        })
      ]));
      teminatKap.append(el("div", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Converted on " + ZINCIR_ADI[uzak] + " · contract " + v.zincirler[uzak].token
      }));
      teminatKap.append(not("The dollars stay the guarantee: what is converted is upside for holders and is not counted in the redemption floor. It comes back as dollars when redemptions or the buyback need it.", "bilgi"));
      if (v.caIle) {
        teminatKap.append(not(
          "Not from the suggested list — chosen by contract address " +
          "and passed the same check: the deepest USDC pool was found " +
          "and its liquidity and observation history were read.", "bilgi"));
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

  kap.append(panel("Collateral", [
    el("div", { sinif: "ikincil", attr: { style: "margin-bottom:12px" }, yazi:
      "Choose which asset accumulates behind the token. The tax on " +
      "every trade flows into it, and when the price falls below the " +
      "collateral's value per token the buyback engages." }),
    teminatKap
  ]));

  kap.append(panel("Use your own token", caAlani(teminatSecildi)));

  kap.append(panel(
    ONERILEN.length + " suggested",
    oneriTablosu(teminatSecildi),
    el("span", { sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "the list is a shortcut, not a gate" }),
    true
  ));

  /* ---- 3. tax -------------------------------------------------------- */
  const vergiEtiket = el("span", { sinif: "mono", yazi: ppmYuzde(durum.vergiPpm) });
  kap.append(panel("Collateral tax", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "satir satir--arasi" }, [
      el("span", { sinif: "ikincil", yazi: "The share of every trade that goes to the vault" }),
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
      "Between " + ppmYuzde(EKONOMI.vergiAsgariPpm) + " and " +
      ppmYuzde(EKONOMI.vergiAzamiPpm) + ". Chosen once, and after that " +
      "nobody can change it — not even you." })
  ])));

  /* ---- 4. payment and optional first buy ----------------------------- */
  kap.append(panel("Payment", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "izgara izgara--genis" }, [
      alan("Total payment", el("div", { sinif: "girdi-grup" }, [
        el("input", {
          sinif: "girdi girdi--sayi",
          attr: { type: "number", min: String(EKONOMI.asgariOdeme), step: "10", value: String(durum.odeme) },
          on: { input: (ev) => { durum.odeme = Number(ev.target.value) || 0; ozetiCiz(); } }
        }),
        el("span", { sinif: "girdi-grup__son", yazi: "USDC" })
      ]), "At least " + para(EKONOMI.asgariOdeme)),
      alan("Set aside for the vault", el("div", { sinif: "girdi-grup" }, [
        el("input", {
          sinif: "girdi girdi--sayi",
          attr: { type: "number", min: String(EKONOMI.asgariTeminat), step: "5", value: String(durum.teminat) },
          on: { input: (ev) => { durum.teminat = Number(ev.target.value) || 0; ozetiCiz(); } }
        }),
        el("span", { sinif: "girdi-grup__son", yazi: "USDC" })
      ]), "At least " + para(EKONOMI.asgariTeminat)),
      alan("Optional first buy", el("div", { sinif: "girdi-grup" }, [
        el("input", {
          sinif: "girdi girdi--sayi",
          attr: { type: "number", min: "0", step: "10", value: String(durum.ilkAlim) },
          on: { input: (ev) => { durum.ilkAlim = Number(ev.target.value) || 0; ozetiCiz(); } }
        }),
        el("span", { sinif: "girdi-grup__son", yazi: "USDC" })
      ]), "You can leave this empty")
    ])
  ])));

  /* ---- 5. summary ---------------------------------------------------- */
  ozetiCiz();
  kap.append(panel("Summary", ozetKap));

  /* ---- the submit ---------------------------------------------------- */
  /* A BUTTON WITH NO HANDLER IS THE RULE THIS BREAKS
       This rendered a large brand button the moment launchpadCanli()
       became true — and the button did nothing. The page audit passed
       because it checks that the view CONSULTS canli(), not that the
       control acts. "Do not offer features that do not work as active
       buttons" was broken by the very check that exists to enforce it.

       An assertion for exactly this now lives in denetim-sayfa.js: a
       large brand button must carry a click handler. */
  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const yayKap = el("div", { sinif: "yigin" });

  if (launchpadCanli() || durum.ag.anahtar !== "arc") {
    const dugme = el("button", {
      sinif: "dugme dugme--marka dugme--buyuk dugme--tam",
      yazi: "CREATE TOKEN",
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
        durumSatiri.textContent = "Name and symbol cannot be empty.";
        return;
      }
      const ag = durum.ag;
      if (LAUNCH_YOK[ag.anahtar]) { durumSatiri.textContent = LAUNCH_YOK[ag.anahtar]; return; }
      const uzak = uzakSec(ag, v);
      if (v && ag.nesil === 2 && !uzak) {
        durumSatiri.textContent = v.simge + " cannot be the converted collateral for a launch on " + ag.ad + ".";
        return;
      }
      if (durum.alim < PULSE_KURAL.asgariAlim || durum.alim > PULSE_KURAL.azamiAlim) {
        durumSatiri.textContent = "The buy has to be between " +
          PULSE_KURAL.asgariAlim + " and " + PULSE_KURAL.azamiAlim + " USDC.";
        return;
      }
      if (durum.teminat < PULSE_KURAL.asgariTeminat) {
        durumSatiri.textContent = "Collateral has to be at least " +
          PULSE_KURAL.asgariTeminat + " USDC.";
        return;
      }

      /* Second generation: (domain, asset) of the chosen remote, or (0, the
         dollar) to keep dollars. First generation: the dollar. */
      const hedefDomain = uzak ? DOMAINI[uzak] : 0;
      const hedef = uzak ? v.zincirler[uzak].token : ag.quote;
      /* Six decimals, because the quote has six. Rounded rather than
         truncated so a form showing 100 does not send 99,999999. */
      const alim = BigInt(Math.round(durum.alim * 1e6));
      const teminat = BigInt(Math.round(durum.teminat * 1e6));

      try {
        durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
        durumSatiri.textContent = "Asking for the USDC allowance…";
        /* Exactly what this launch needs, not an unlimited allowance: a
           standing allowance on a contract that moves money is a liability
           for no benefit. */
        if (ag.sarmal) {
          /* BNB: 18-decimal USDC in, the same dollars as 6-decimal pUSDC
             out, 1:1 and redeemable any time (Dolar6.coz). */
          const olcek = 10n ** 12n;
          await makbuzBekle(ag, await cuzdan.agdaGonder(ag, { to: ag.dolar,
            data: cagriVerisi(ABI.erc20Yaz, "approve", [ag.sarmal, (alim + teminat) * olcek]) }));
          durumSatiri.textContent = "Wrapping USDC 1:1 into pUSDC…";
          await makbuzBekle(ag, await cuzdan.agdaGonder(ag, { to: ag.sarmal,
            data: cagriVerisi(ABI.sarmalYaz, "sar", [alim + teminat]) }));
        }
        await makbuzBekle(ag, await cuzdan.agdaGonder(ag, {
          to: ag.quote,
          data: cagriVerisi(ABI.erc20Yaz, "approve", [ag.launchpad, alim + teminat])
        }));

        durumSatiri.textContent = "Sending the launch on " + ag.ad + "…";
        const hash = await cuzdan.agdaGonder(ag, {
          to: ag.launchpad,
          data: ag.nesil === 2
            ? cagriVerisi(ABI.launchpad2Yaz, "launch", [ad, sembol, hedefDomain, hedef, BigInt(durum.vergiPpm), alim, teminat])
            : cagriVerisi(ABI.launchpadYaz, "launch", [ad, sembol, hedef, BigInt(durum.vergiPpm), alim, teminat])
        });
        durumSatiri.className = "yazi yazi--kucuk";
        durumSatiri.textContent = "Sent: " + hash + " — waiting for the receipt…";

        /* The token's address from the launchpad's own event, not assumed:
           "live" is said only after the chain says it. */
        const m = await makbuzBekle(ag, hash);
        if (m.status !== "0x1") throw new Error("The launch reverted on chain: " + hash);
        const olay = new Interface(ABI.launchedOlay);
        let token = null;
        for (const l of m.logs) {
          if (l.address.toLowerCase() !== ag.launchpad.toLowerCase()) continue;
          try { const e = olay.parseLog(l); if (e && e.name === "Launched") token = e.args.token; } catch (x) { /* another event */ }
        }
        if (!token) throw new Error("Launched, but the token address could not be read from " + hash);
        durumSatiri.textContent = "Live on " + ag.ad + ": " + token;
        yayKap.append(yayPaneli(ag, token));
      } catch (e) {
        durumSatiri.className = "yazi yazi--kucuk yazi--hata";
        durumSatiri.textContent = (e && e.message) || "The transaction could not be sent.";
      }
    });

    kap.append(dugme);
    kap.append(durumSatiri);
    kap.append(yayKap);
  } else {
    kap.append(dagitimBekliyor(kayit));
  }

  return kap;
}

/**
 * After a launch: put the token on the other eight chains. One transaction
 * on the home chain (IkizYayici, the same address everywhere); its fee is
 * the real LayerZero price, read from the chain, for a twin deployment on
 * each target (6M gas — see aglar.js).
 */
function yayPaneli(ag, token) {
  const hedefler = AGLAR.filter((a) => a.id !== ag.id);
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading the fee…" });
  const dugme = el("button", { sinif: "dugme dugme--marka dugme--tam", attr: { type: "button", disabled: "" },
    yazi: "MAKE IT LIVE ON ALL " + hedefler.length + " OTHER CHAINS" });
  const eids = hedefler.map((a) => a.eid);
  let ucret = null;
  (async () => {
    try {
      ucret = BigInt(await agCagri(ag, "eth_call",
        [{ to: AG.yayici, data: cagriVerisi(ABI.yayici, "ucret", [token, eids, IKIZ_SECENEK]) }, "latest"]));
      const ikiz = await agCagri(ag, "eth_call",
        [{ to: AG.yayici, data: cagriVerisi(ABI.yayici, "ikizAdresi", [token]) }, "latest"]);
      durum.textContent = "Fee " + gazBirim(ucret, ag) + " (LayerZero, paid once). Address on every other chain: 0x" + ikiz.slice(26);
      dugme.removeAttribute("disabled");
    } catch (e) {
      durum.textContent = "The fee could not be read: " + e.message;
    }
  })();
  dugme.addEventListener("click", async () => {
    try {
      dugme.setAttribute("disabled", "");
      durum.textContent = "Sending…";
      const hash = await cuzdan.agdaGonder(ag, { to: AG.yayici, value: "0x" + ucret.toString(16),
        data: cagriVerisi(ABI.yayiciYaz, "yay", [token, eids, IKIZ_SECENEK]) });
      durum.textContent = "Sent: " + hash + ". Each chain shows the token once LayerZero delivers (minutes) — layerzeroscan.com/tx/" + hash;
    } catch (e) {
      dugme.removeAttribute("disabled");
      durum.textContent = (e && e.message) || "Could not send.";
    }
  });
  return panel("Every chain", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "ikincil", yazi: hedefler.map((a) => a.ad).join(" · ") }), dugme, durum
  ]));
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
    ["Buy", para(d.alim)],
    ["— protocol fee (2%)", "−" + para(ucret)],
    ["— to you as tokens", para(net)],
    ["Tokens you receive", bin(kurucuToken) + "  (" + pay.toFixed(2) + "% of supply)"],
    ["Real bid in the pool", para(net)],
    ["Token ladder in the pool", bin(merdiven)],
    ["To the collateral vault", para(d.teminat)],
    ["Free tokens", "0 — you buy your share at the opening price"]
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
      ? not("The opening market cap is " + para(PULSE_KURAL.acilisMcap) +
            " and the whole supply is " + bin(PULSE_KURAL.arz) + ". " +
            "Whatever you pay, it opens at the same price — paying more " +
            "does not buy a higher price, it buys a deeper bid. The " +
            para(net) + " that goes into the pool is LOCKED and nobody " +
            "can withdraw it; the " + para(d.teminat) + " in the vault " +
            "belongs to the holders and can be redeemed by burning.")
      : not("The buy has to be between " + para(PULSE_KURAL.asgariAlim) +
            " and " + para(PULSE_KURAL.azamiAlim) + ", the collateral at " +
            "least " + para(PULSE_KURAL.asgariTeminat) + ", and a " +
            "collateral asset has to be chosen.", "uyari")
  ]);
}
