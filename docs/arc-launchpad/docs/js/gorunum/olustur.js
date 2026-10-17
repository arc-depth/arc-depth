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
import { tokenOku, rotalar, asgariCikti } from "../teminat-bul.js";
import { AGLAR, AG, IKIZ_SECENEK, agBul } from "../aglar.js";
import { rpcPost } from "../ag-okur.js";
import { Interface } from "../../vendor/ethers.min.js";
/* Aptos is ON: the launchpad account owns every vault and pool object, so
   its key could have withdrawn them; on 17 Oct its authentication key was
   set to 32 zero bytes (aptos-anahtar-kapat.js, tx 0xcc8a…2ad1), and the
   account can never sign again. */
const APTOS_ACIK = true;
/* Pasting a token as collateral: open on every chain. What a pasted token
   is worth is the market's call, not the platform's. */
const YAPISTIR_ACIK = true;
import { SUI, suiCuzdan, launchEt as suiLaunchEt, teminatHavuzu as suiTeminatHavuzu, acilisTokeni as suiAcilis } from "../sui.js";
import { APTOS, aptosCuzdan, teminatHavuzu, acilisTokeni, islemBekle, launchTokeni, launchDolar, launchTokenle, usdcBakiye } from "../aptos.js";

/* ---- reads on whichever chain the launch is on ----------------------- */
/* through rpcPost: a rate-limited RPC falls over to the chain's backups, so
   waiting for a launch's receipt never reads a 429 as "no receipt" */
async function agCagri(ag, method, params) {
  const r = await rpcPost(ag, { jsonrpc: "2.0", id: 1, method, params });
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
    teminatToken: null,   // the pasted collateral token, read from the chain
    rota: null,           // its best route, from teminat-bul.js
    /* Which chain the launch happens on. Any of the nine; the token can
       then be spread to all the others. */
    ag: (param && param.get && param.get("zincir") === "sui" ? SUI : APTOS_ACIK && param && param.get && param.get("zincir") === "aptos" ? APTOS : agBul(param && param.get && param.get("zincir"))) || SUI
  };

  /* LOCAL COLLATERAL (nesil 3, dagitim-nesil3.json). On Arc, Robinhood,
     Base, Arbitrum, Avalanche and Monad the founder pastes the contract
     address of any token on that chain; teminat-bul.js finds where it
     trades against the chain's dollar and quotes it; the launch converts
     the collateral deposit into it in the same transaction. Leaving the
     field empty keeps the collateral in dollars. Ethereum and BNB launch
     in dollars (first-generation launchpads); HyperEVM cannot hold a
     launch at all. */
  /* Chains where a launch cannot fit in a block an ordinary wallet can use.
     HyperEVM: small blocks are capped at 3,000,000 gas (read from the chain,
     14 Oct 2026) and a launch costs 7-11M (measured on forks); the 30M big
     blocks are only for addresses that switched to them on HyperCore.
     Tokens launched elsewhere still reach HyperEVM: the spread is delivered
     by LayerZero's executor, which uses big blocks. */
  const LAUNCH_YOK = { hyperevm: "HyperEVM blocks hold 3M gas and a launch needs about 7M, so launches cannot run there. Launch on any other chain and spread the token to HyperEVM in the next step.", ethereum: "Launches are not open on Ethereum yet: its launchpad has not been tested end to end. Launch on any other chain and spread the token to Ethereum in the next step." };
  /* SECURITY HOLD, 16 Oct 2026 (arastirma/7saat/guvenlik-evm.md, C-1): the
     EVM collateral vaults' buyback check can be passed by moving tokens in
     and out of the v4 PoolManager inside one transaction. No EVM launch
     exists yet, so nothing is exposed; new EVM launches stay closed until
     the fixed vault generation is deployed. Aptos and Sui use other code
     and stay open. */
  const EVM_DURAKLATILDI = true;
  const DURAKLATILAN = new Set();
  if (EVM_DURAKLATILDI) for (const a of AGLAR) if (!LAUNCH_YOK[a.anahtar]) {
    DURAKLATILAN.add(a.anahtar);
    LAUNCH_YOK[a.anahtar] = "Launches on " + a.ad + " are paused while the collateral vault gets a security upgrade. Launch on Sui or Aptos now.";
  }

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
        attr: { type: "button" }, yazi: DURAKLATILAN.has(a.anahtar) ? a.ad + " (paused)" : LAUNCH_YOK[a.anahtar] ? a.ad + " (spread only)" : a.ad,
        on: { click: () => { durum.ag = a; durum.teminatToken = null; durum.rota = null; agiCiz(); teminatiCiz(); } }
      }));
    }
    /* Aptos: the dispatch-aware launchpad + PulseSwap (v2, 0xe1dd…). The first
       packages moved USDC with plain fungible_asset::deposit, which Aptos
       refuses for Circle's USDC (deposit/withdraw hooks), so the button was
       off until v2 was published and a real USDC deposit went through it. */
    if (APTOS_ACIK) agDugmeleri.append(el("button", {
      sinif: "dugme " + (durum.ag.anahtar === "aptos" ? "dugme--marka" : "dugme--sessiz"),
      attr: { type: "button" }, yazi: "Aptos",
      on: { click: () => { durum.ag = APTOS; durum.teminatToken = null; durum.rota = null; agiCiz(); teminatiCiz(); } }
    }));
    /* Sui: launchpad + PulseSwap, immutable since 16 Oct; a launch is two
       wallet prompts (the coin's own package, then the launch) */
    agDugmeleri.append(el("button", {
      sinif: "dugme " + (durum.ag.anahtar === "sui" ? "dugme--marka" : "dugme--sessiz"),
      attr: { type: "button" }, yazi: "Sui",
      on: { click: () => { durum.ag = SUI; durum.teminatToken = null; durum.rota = null; agiCiz(); teminatiCiz(); } }
    }));
    if (durum.ag.anahtar === "sui") {
      temizle(agNotu).append(not("Sui: pay in native USDC with a Sui wallet (Slush, Suiet, Phantom…). Two approvals: first your coin is created (its own package, made immutable at once), then the launch. Back the token with any coin that has a PulseSwap pool on Sui at least 24 hours old, or leave the field empty to keep dollars.", "bilgi"));
      return;
    }
    if (durum.ag.anahtar === "aptos") {
      temizle(agNotu).append(not("Aptos: pay in native USDC with an Aptos wallet (Petra, Nightly, OKX…). Back the token with any token that has a PulseSwap pool on Aptos at least 24 hours old, or leave the field empty to keep dollars. The token lives on Aptos.", "bilgi"));
      return;
    }
    temizle(agNotu).append(LAUNCH_YOK[durum.ag.anahtar] ? not(LAUNCH_YOK[durum.ag.anahtar], "uyari")
      : not(durum.ag.ad + ": pay in " + durum.ag.dolarSembol +
          (durum.ag.sarmal ? " (wrapped 1:1 into 6-decimal pUSDC first, automatically)" : "") +
          (durum.ag.nesil === 3 ? ". Back the token with any token on " + durum.ag.ad + ": paste its address below." :
            ". The collateral stays in " + durum.ag.dolarSembol + " on " + durum.ag.ad + "."), "bilgi"));
  };
  agiCiz();
  kap.append(panel("Chain", el("div", { sinif: "yigin" }, [
    agDugmeleri, agNotu,
    el("div", { sinif: "alan__ipucu", yazi: "On the EVM chains, one more transaction after the launch makes the token appear on the other chains at the same address." })
  ])));

  /* ---- 1. identity -------------------------------------------------- */
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

  /* ---- 2. collateral: paste a contract address ---------------------- */
  const teminatKap = el("div", { sinif: "yigin yigin--sik" });
  const caGirdi = el("input", { sinif: "girdi mono", attr: { type: "text", placeholder: "Token address on any chain: 0x… (EVM, Aptos) or 0x…::module::NAME (Sui)", spellcheck: "false" } });
  const bulDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });

  /* PASTE ANY CA, FROM ANY CHAIN
     The vault holds the pasted token on the launch's own chain, so the
     launch has to happen where the token trades. The visitor should not
     have to know which chain that is: the address's shape says the family
     (EVM 0x+40, Aptos 0x+64, Sui 0x…::module::NAME, Solana base58), and an
     EVM address that is not on the selected chain, or has no pool there, is
     looked up on every chain that takes a pasted token. Each place it can
     back a launch becomes a button that switches the launch there. */
  const CA_ZINCIRLERI = () => AGLAR.filter((a) => a.nesil === 3 && !LAUNCH_YOK[a.anahtar]);
  const oner = (ca, mesaj, secenekler) => {
    temizle(bulDurum).append(el("div", { sinif: "yigin yigin--sik" }, [
      el("div", { yazi: mesaj }),
      el("div", { sinif: "satir", attr: { style: "flex-wrap:wrap;gap:8px" } }, secenekler.map((o) =>
        el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: o.etiket,
          on: { click: () => { durum.ag = o.ag; agiCiz(); teminatiCiz(); caGirdi.value = ca; teminatBul(); } } })))
    ]));
  };
  const evmAra = async (ca, haric) => {
    const dolar = BigInt(Math.round(durum.teminat * 1e6));
    const sonuc = await Promise.allSettled(CA_ZINCIRLERI().filter((a) => a.id !== (haric && haric.id)).map(async (a) => {
      const t = await tokenOku(a, ca);
      if (!t || t.adres.toLowerCase() === a.quote.toLowerCase()) return null;
      const r = await rotalar(a, t.adres, dolar).catch(() => []);
      return r.length ? { ag: a, t } : null;
    }));
    return sonuc.filter((x) => x.status === "fulfilled" && x.value).map((x) => x.value);
  };
  const baskaZincirOner = async (ca, neden) => {
    if (!CA_ZINCIRLERI().length) { bulDurum.textContent = neden + " Launches on the EVM chains are paused for a security upgrade, so an EVM token cannot back a launch right now; a Sui or Aptos token can."; return; }
    bulDurum.textContent = neden + " Looking on the other chains…";
    const bulunan = await evmAra(ca, durum.ag);
    if (!bulunan.length) { bulDurum.textContent = neden + " It has no pool the launch can buy through on any chain that takes a pasted token (" + CA_ZINCIRLERI().map((a) => a.ad).join(", ") + ")."; return; }
    oner(ca, neden + " " + bulunan[0].t.simge + " can back a launch on " + bulunan.map((b) => b.ag.ad).join(", ") + ": the launch happens where the token trades.",
      bulunan.map((b) => ({ ag: b.ag, etiket: "Launch on " + b.ag.ad + " with " + b.t.simge })));
  };

  const teminatBul = async () => {
    const ca = (caGirdi.value || "").trim();
    durum.teminatToken = null; durum.rota = null;
    if (!ca) { teminatiCiz(); return; }
    const tur = /^0x[0-9a-fA-F]{40}$/.test(ca) ? "evm"
      : /^0x[0-9a-fA-F]{1,64}::[A-Za-z_][A-Za-z0-9_]*::[A-Za-z_][A-Za-z0-9_]*$/.test(ca) ? "sui"
      : /^0x[0-9a-fA-F]{41,64}$/.test(ca) ? "aptos"
      : /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(ca) ? "solana" : null;
    if (!tur) { bulDurum.textContent = "Paste a token address: 0x… (an EVM chain or Aptos) or 0x…::module::NAME (Sui)."; return; }
    if (tur === "solana") { bulDurum.textContent = "That is a Solana token. Launches on Solana open soon; until then pick a token on the chains above."; return; }
    if (tur === "sui" && durum.ag.anahtar !== "sui") { oner(ca, "That is a Sui coin: the launch happens on Sui.", [{ ag: SUI, etiket: "Launch on Sui with it" }]); return; }
    if (tur === "aptos" && durum.ag.anahtar !== "aptos") {
      if (!APTOS_ACIK) { bulDurum.textContent = "That is an Aptos token; Aptos launches are not open right now."; return; }
      oner(ca, "That is an Aptos token: the launch happens on Aptos.", [{ ag: APTOS, etiket: "Launch on Aptos with it" }]); return;
    }
    if (tur === "evm" && (durum.ag.nesil === "move" || durum.ag.nesil !== 3)) { await baskaZincirOner(ca, "That is an EVM token."); return; }
    if (durum.ag.anahtar === "sui") {
      bulDurum.textContent = "Looking for " + ca.split("::").slice(1).join("::") + " on Sui…";
      const h = await suiTeminatHavuzu(ca, BigInt(Math.round(durum.teminat * 1e6))).catch((e) => ({ hata: e.message }));
      if (h.hata) { bulDurum.textContent = h.hata; return; }
      durum.teminatToken = { ...h, adres: h.tip };
      durum.rota = { cikti: h.cikti, aciklama: "PulseSwap pool on Sui" };
      bulDurum.textContent = "";
      teminatiCiz(); ozetiCiz();
      return;
    }
    if (durum.ag.anahtar === "aptos") {
      bulDurum.textContent = "Looking for " + ca.slice(0, 10) + "… on Aptos…";
      const h = await teminatHavuzu(ca, BigInt(Math.round(durum.teminat * 1e6))).catch((e) => ({ hata: e.message }));
      if (h.hata) { bulDurum.textContent = h.hata; return; }
      durum.teminatToken = h;
      durum.rota = { cikti: h.cikti, aciklama: "PulseSwap pool on Aptos" };
      bulDurum.textContent = "";
      teminatiCiz(); ozetiCiz();
      return;
    }
    bulDurum.textContent = "Looking for " + ca.slice(0, 10) + "… on " + durum.ag.ad + "…";
    const t = await tokenOku(durum.ag, ca);
    if (!t) { await baskaZincirOner(ca, "No token at that address on " + durum.ag.ad + "."); return; }
    if (t.adres.toLowerCase() === durum.ag.quote.toLowerCase()) { bulDurum.textContent = ""; teminatiCiz(); return; }
    const r = await rotalar(durum.ag, t.adres, BigInt(Math.round(durum.teminat * 1e6)));
    if (!r.length) { await baskaZincirOner(ca, t.simge + " has no pool against " + durum.ag.dolarSembol + " on " + durum.ag.ad + " that the launch can buy through."); return; }
    durum.teminatToken = t; durum.rota = r[0];
    bulDurum.textContent = "";
    teminatiCiz(); ozetiCiz();
  };
  caGirdi.addEventListener("change", teminatBul);

  const teminatiCiz = () => {
    temizle(teminatKap);
    if (!YAPISTIR_ACIK) {
      teminatKap.append(not("Collateral: " + durum.ag.dolarSembol + " on " + durum.ag.ad + ". Backing a launch with another token is paused for a security fix; it returns with the next launchpad generation.", "bilgi"));
      return;
    }
    if (durum.ag.nesil !== 3 && durum.ag.nesil !== "move") {
      teminatKap.append(not("Collateral: " + durum.ag.dolarSembol + " on " + durum.ag.ad + ". To back the token with another token, paste its address: the launch moves to a chain where it trades.", "bilgi"));
      teminatKap.append(el("div", { sinif: "satir", attr: { style: "gap:8px" } }, [caGirdi,
        el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Find", on: { click: teminatBul } })]));
      teminatKap.append(bulDurum);
      return;
    }
    teminatKap.append(el("div", { sinif: "satir", attr: { style: "gap:8px" } }, [
      caGirdi,
      el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Find", on: { click: teminatBul } })
    ]));
    teminatKap.append(bulDurum);
    const t = durum.teminatToken;
    if (!t) {
      teminatKap.append(not("Empty: the collateral stays in " + durum.ag.dolarSembol + ". Paste a token's address to back the launch with that token instead.", "bilgi"));
      return;
    }
    const tutar = Number(durum.rota.cikti) / 10 ** t.ondalik;
    teminatKap.append(el("div", { sinif: "jeton" }, [
      el("div", { sinif: "jeton__logo jeton__logo--bos", yazi: t.simge.slice(0, 3).toUpperCase() }),
      el("div", { sinif: "jeton__yazi" }, [
        el("div", { sinif: "jeton__sembol", yazi: t.simge }),
        el("div", { sinif: "jeton__ad", yazi: t.ad + " · " + t.adres }),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
          yazi: para(durum.teminat) + " buys about " + tutar.toPrecision(6) + " " + t.simge + " now · " + durum.rota.aciklama })
      ])
    ]));
    teminatKap.append(not("The vault holds " + t.simge + " from the start. Every trade's tax arrives in " + durum.ag.dolarSembol +
      " and stays " + durum.ag.dolarSembol + ". Redeeming pays a share of both. The launch refuses if the conversion would give more than 3% less than quoted here.", "bilgi"));
  };
  teminatiCiz();

  kap.append(panel("Collateral", [
    el("div", { sinif: "ikincil", attr: { style: "margin-bottom:12px" }, yazi:
      "Paste the contract address of the token that should back this launch. Your collateral deposit (at least " +
      para(PULSE_KURAL.asgariTeminat) + ") is converted into it when the launch happens." }),
    teminatKap
  ]));

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
      /* Everything the contract will refuse, refused here first — with
         the reason, rather than letting the chain answer with a selector
         nobody can read. */
      if (!ad || !sembol) {
        durumSatiri.textContent = "Name and symbol cannot be empty.";
        return;
      }
      const ag = durum.ag;
      if (ag.anahtar === "aptos") return aptosLaunch({ ad, sembol, durum, durumSatiri, yayKap });
      if (ag.anahtar === "sui") return suiLaunch({ ad, sembol, durum, durumSatiri, yayKap });
      if (LAUNCH_YOK[ag.anahtar]) { durumSatiri.textContent = LAUNCH_YOK[ag.anahtar]; return; }
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

      /* Six decimals, because the quote has six. Rounded rather than
         truncated so a form showing 100 does not send 99,999999. */
      const alim = BigInt(Math.round(durum.alim * 1e6));
      const teminat = BigInt(Math.round(durum.teminat * 1e6));

      /* The collateral route, quoted again for the amount actually sent: the
         one shown was quoted for whatever the field said at the time. */
      let tm = [ag.quote, 0, "0x", 0n];
      if (ag.nesil === 3 && durum.teminatToken) {
        durumSatiri.textContent = "Quoting " + durum.teminatToken.simge + " for " + para(durum.teminat) + "…";
        const r = await rotalar(ag, durum.teminatToken.adres, teminat).catch(() => []);
        if (!r.length) { durumSatiri.textContent = "No route to " + durum.teminatToken.simge + " right now; try again or clear the field to keep dollars."; return; }
        tm = [durum.teminatToken.adres, r[0].tur, r[0].rota, asgariCikti(r[0].cikti)];
      }

      try {
        durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
        durumSatiri.textContent = "Asking for the " + ag.dolarSembol + " allowance…";
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
          data: ag.nesil === 3
            ? cagriVerisi(ABI.launchpad3Yaz, "launch", [ad, sembol, tm, BigInt(durum.vergiPpm), alim, teminat])
            : cagriVerisi(ABI.launchpadYaz, "launch", [ad, sembol, ag.quote, BigInt(durum.vergiPpm), alim, teminat])
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
 * A launch on Sui: two prompts from the founder's Sui wallet (sui.js
 * launchEt): the coin's own package from the template, then the launch.
 */
async function suiLaunch({ ad, sembol, durum, durumSatiri, yayKap }) {
  if (ad.length > 32 || sembol.length > 10) { durumSatiri.textContent = "Name up to 32 characters, symbol up to 10."; return; }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(sembol)) { durumSatiri.textContent = "On Sui the symbol starts with a letter and uses only letters and digits."; return; }
  if (durum.alim < PULSE_KURAL.asgariAlim || durum.alim > PULSE_KURAL.azamiAlim) {
    durumSatiri.textContent = "The buy has to be between " + PULSE_KURAL.asgariAlim + " and " + PULSE_KURAL.azamiAlim + " USDC."; return;
  }
  if (durum.teminat < PULSE_KURAL.asgariTeminat) { durumSatiri.textContent = "Collateral has to be at least " + PULSE_KURAL.asgariTeminat + " USDC."; return; }
  const ilkAlim = BigInt(Math.round(durum.alim * 1e6));
  const teminat = BigInt(Math.round(durum.teminat * 1e6));
  try {
    durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
    if (!suiCuzdan.varMi()) throw new Error("No Sui wallet found. Install Slush (or any Sui wallet) and reload.");
    let yapistir = null;
    if (durum.teminatToken) {
      /* the pool's age and depth checked again, quoted for the amount sent */
      const h = await suiTeminatHavuzu(durum.teminatToken.tip, teminat);
      if (h.hata) throw new Error(h.hata);
      yapistir = h;
    }
    const r = await suiLaunchEt({ ad, sembol, teminat, ilkAlim, vergiPpm: durum.vergiPpm, yapistir, durum: (m) => { durumSatiri.textContent = m; } });
    durumSatiri.className = "yazi yazi--kucuk";
    durumSatiri.textContent = "Live on Sui: " + r.tip + " — you hold about " + (Number(suiAcilis(ilkAlim)) / 1e6).toLocaleString("en-US") + " " + sembol + ".";
    if (r.kasa) yayKap.append(el("a", { sinif: "dugme dugme--marka", attr: { href: "#/move-token?zincir=sui&kasa=" + r.kasa }, yazi: "Open the token page" }));
    yayKap.append(el("a", { sinif: "dugme dugme--sessiz", attr: { href: SUI.gezgin + "/coin/" + r.tip, target: "_blank", rel: "noopener" }, yazi: "Open on Suiscan" }));
  } catch (e) {
    durumSatiri.className = "yazi yazi--kucuk yazi--hata";
    durumSatiri.textContent = (e && e.message) || "The transaction could not be sent.";
  }
}

/**
 * A launch on Aptos: the founder's Aptos wallet calls the Move launchpad
 * (dollars) or PulseSwap's launch_with_token (a pasted token) directly; the
 * token's address is read from the launchpad's Launched event.
 */
async function aptosLaunch({ ad, sembol, durum, durumSatiri, yayKap }) {
  if (ad.length > 32 || sembol.length > 10) { durumSatiri.textContent = "Name up to 32 characters, symbol up to 10."; return; }
  if (durum.alim < PULSE_KURAL.asgariAlim || durum.alim > PULSE_KURAL.azamiAlim) {
    durumSatiri.textContent = "The buy has to be between " + PULSE_KURAL.asgariAlim + " and " + PULSE_KURAL.azamiAlim + " USDC."; return;
  }
  if (durum.teminat < PULSE_KURAL.asgariTeminat) { durumSatiri.textContent = "Collateral has to be at least " + PULSE_KURAL.asgariTeminat + " USDC."; return; }
  const ilkAlim = BigInt(Math.round(durum.alim * 1e6));
  const teminat = BigInt(Math.round(durum.teminat * 1e6));
  try {
    durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
    if (!aptosCuzdan.varMi()) throw new Error("No Aptos wallet found. Install Petra (or any Aptos wallet) and reload.");
    durumSatiri.textContent = "Connecting " + aptosCuzdan.ad() + "…";
    const hesap = await aptosCuzdan.baglan();
    const bakiye = await usdcBakiye(hesap);
    if (bakiye < ilkAlim + teminat) throw new Error("This wallet holds " + (Number(bakiye) / 1e6).toFixed(2) + " USDC on Aptos; the launch needs " + (Number(ilkAlim + teminat) / 1e6).toFixed(2) + ".");
    let hash;
    if (durum.teminatToken) {
      /* quoted again for the amount actually sent, and the pool's age and depth checked again */
      const h = await teminatHavuzu(durum.teminatToken.adres, teminat);
      if (h.hata) throw new Error(h.hata);
      durumSatiri.textContent = "Approve the launch in your wallet (" + h.simge + " collateral)…";
      hash = await launchTokenle({ ad, sembol, teminat, ilkAlim, vergiPpm: durum.vergiPpm, token: h.adres, beklenen: h.cikti });
    } else {
      durumSatiri.textContent = "Approve the launch in your wallet…";
      hash = await launchDolar({ ad, sembol, teminat, ilkAlim, vergiPpm: durum.vergiPpm });
    }
    durumSatiri.className = "yazi yazi--kucuk";
    durumSatiri.textContent = "Sent: " + hash + " — waiting for Aptos…";
    const tx = await islemBekle(hash);
    if (!tx.success) throw new Error("The launch failed on chain: " + tx.vm_status);
    const token = launchTokeni(tx);
    if (!token) throw new Error("Launched, but the token address could not be read from " + hash);
    durumSatiri.textContent = "Live on Aptos: " + token + " — you hold about " + (Number(acilisTokeni(ilkAlim)) / 1e6).toLocaleString("en-US") + " " + sembol + ".";
    yayKap.append(el("a", { sinif: "dugme dugme--marka", attr: { href: "#/move-token?zincir=aptos&token=" + token }, yazi: "Open the token page" }));
    yayKap.append(el("a", { sinif: "dugme dugme--sessiz", attr: { href: APTOS.gezgin + "/fungible_asset/" + token + "?network=mainnet", target: "_blank", rel: "noopener" }, yazi: "Open on the Aptos explorer" }));
  } catch (e) {
    durumSatiri.className = "yazi yazi--kucuk yazi--hata";
    durumSatiri.textContent = (e && e.message) || "The transaction could not be sent.";
  }
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
    && d.teminat >= PULSE_KURAL.asgariTeminat;

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
