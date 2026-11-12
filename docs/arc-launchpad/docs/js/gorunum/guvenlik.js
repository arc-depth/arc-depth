/* ===========================================================================
 * gorunum/guvenlik.js — contract addresses, deployment state, and the
 *                       properties that are actually proven
 *
 * The page a sceptical reader opens first. So it leads with what is NOT
 * deployed, because a security page that buries that is marketing.
 *
 * Everything claimed here is produced by a script in this repository that
 * anybody can run, and each claim says which one. A property asserted
 * without a way to check it does not belong on this page.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, ayrinti } from "../ui.js";
import { stil, arsiv } from "./squad.js";
import { PULSE, DIS, ESKI, HEDEFLER, EKONOMI, canli } from "../adresler.js";
import { sonBlok } from "../zincir.js";
import { bloktanSure } from "../bicim.js";

/* The live set's claims (v7), each with the script that establishes it on mainnet state (eth_simulateV1, nothing sent). */
const V7_KANITLAR = [
  { baslik: "A whole launch works end to end on the live contracts", betik: "CANLI_KAYIT=dagitim-v7.json node scripts/denetim-v4-canli.js",
    yazi: "Launch, snipe tax, a $40,000 buy, a whale-shield sale, redemption with its fee, a queued order sent by a stranger for the tip, the Base vault buying WETH from Uniswap v3 and selling a holder's share, a founder on Arc paid inside the trade and a founder on Base paid by a cross-chain transfer: 40 checks." },
  { baslik: "Nothing waits for anyone: every slice reaches its place inside trades", betik: "CANLI_KAYIT=dagitim-v7.json node scripts/denetim-v7-bakim.js",
    yazi: "On the live gate: the depth slice and the liquidity vault became locked pool liquidity (the pool's real bid grew from $98 to $1,277 in the run), the burn slice was swapped in the platform token's pool and burned, the Arc founder was paid, and a wallet's least-gas estimate cannot skip the upkeep: 14 checks." },
  { baslik: "The basket never jams", betik: "node scripts/denetim-v5-kova.js",
    yazi: "Five lines crossing $50 in one trade, on every mix of chains: at most two go per trade, the rest with the next trades; the tax never stays in the bucket." },
  { baslik: "Any launch can be diagnosed from the chain and fixed by anyone", betik: "CANLI_KAYIT=dagitim-v7.json node scripts/denetim-teshis.js",
    yazi: "The diagnostics contract reports waiting lines, queued orders, the bucket and founder income; a stranger runs each fix and the report comes back clean: 16 checks." },
  { baslik: "Every contract's source is verified", betik: "node scripts/dogrula-kaynak.js",
    yazi: "All 49 live contracts on 9 chains compile to the exact bytes on chain (Sourcify exact match)." },
];

/* First-generation claims, each with the script that establishes it. */
const KANITLAR = [
  {
    baslik: "Every transfer out of the vault goes to msg.sender",
    yazi: "There are exactly four ways an asset leaves the collateral " +
          "vault — redemption, the buyback loan, the buyback reward and " +
          "the conversion loan — and none of them takes a destination " +
          "argument. The reserve cannot be routed to a bridge, to an " +
          "owner, or to any address at all.",
    betik: "scripts/denetim-kasa-cikislari.js"
  },
  {
    baslik: "The contracts cannot be changed",
    yazi: "The bytecode of 15 contracts was scanned: no DELEGATECALL, no " +
          "SELFDESTRUCT, and no other opcode that could change code. The " +
          "factories' CREATE is permitted and which contract each one " +
          "embeds is recorded by name.",
    betik: "scripts/degismezlik.js"
  },
  {
    baslik: "The curve's arithmetic was not forked",
    yazi: "EgriLaunch is a fork of Egri. Nine of the price and quota " +
          "functions are identical line for line; every line that does " +
          "differ has to match a named fork point, or the audit fails.",
    betik: "scripts/egri-catal-denetimi.js"
  },
  {
    baslik: "The fee table matches in both contracts",
    yazi: "The table is written in both the launchpad and the hook. The " +
          "script compares the two and checks that the total divides into " +
          "the slices.",
    betik: "scripts/egri-ucret-denetimi.js"
  },
  {
    baslik: "On a real sale the fee reached seven addresses correctly",
    yazi: "A real sale was made on Arc mainnet and what the seven targets " +
          "received matched the table to within 1 ppm. Before this, the " +
          "hook's money side reverted on every sale with an overflow — " +
          "this measurement is what found it.",
    baglam: "Past issue, first generation: this measurement found it, and the contract was fixed.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "The floor caught a real collapse",
    yazi: "With nothing added to the reserve and only the price pushed " +
          "down: the buyback triggered at −94.9%, 2.5 million tokens were " +
          "burned, and the claim per token went up. Along the way the " +
          "sell tax grew the reserve by itself.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "No more than 10% of the reserve can leave in one window",
    yazi: "Back-to-back buybacks were tried. The window cap stopped the " +
          "sequence and the total that left stayed under the limit. That " +
          "limit counts the reward too — until it did, the 10% promise " +
          "was being kept at 17.07%.",
    baglam: "Past issue, first generation: this measurement found the cap letting 17.07% out where 10% was promised, and it was fixed to count the reward.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "No money becomes unreachable at graduation",
    yazi: "When the curve fills, its money deepens the same pool; the " +
          "excess the tokens cannot match goes to the collateral vault. " +
          "The accounting closes to the cent. Before the fix, 698,671 " +
          "USDC was stuck in the opener forever.",
    baglam: "Past issue, first generation: this measurement found it, and the contract was fixed.",
    betik: "scripts/olc-mezuniyet.js"
  },
  {
    baslik: "The Chainlink feeds can be read from a contract",
    yazi: "All 34 feed proxies on Arc were read from inside a contract and " +
          "34/34 answered. The aggregator addresses found by scanning " +
          "logs did not manage this: one of them read fine from a wallet " +
          "and refused a contract with 'No access'.",
    betik: "scripts/olc-besleyiciler.js"
  }
];

/* plain-English names for the contracts in veri/kaynak-dogrulama.json; the code name stays beside it */
const AD = {
  HaberciLZ: "Cross-chain messenger (LayerZero)", AktarmaLZ: "Cross-chain relay (LayerZero)", PulseFabrika4: "Token factory",
  FthmYakici: "ARCP buy-and-burn", SepetDefteri: "Collateral ledger", SepetKasasiArc: "Collateral vault", SepetKasasi: "Collateral vault",
  SepetUcu: "Collateral basket endpoint", PulseLikiditeKasasi5: "Locked liquidity vault", PulseLaunchpad5: "Launchpad", IkizHub: "Twin-token hub",
  MerkezKapi: "Launch and trade gate", LaunchEmaneti: "Launch escrow", PulseHook5: "Pool hook (fees, whale shield)", PulseHook6: "Pool hook (fees, whale shield, price average)",
  LaunchpadTeshis: "Launch diagnostics (read-only)", IkizYayici: "Twin-token deployer", Jeton: "Token template", LaunchToken: "Launch token template",
  IkizAdapterAg: "Twin adapter on Arc", IkizOFTAg: "Twin token (LayerZero OFT)", TurKaydi2: "Product type record", TurKaydi: "Product type record (first)",
  KilitFabrikasi: "Founder lock factory", TokenDAOFabrikasi: "Token DAO factory", ProfilKaydi: "Profile record", MesajKutusu: "Message box",
  TasarimNFT2: "Design NFTs", TasarimPazar3: "Designs market", SiparisKaydi: "Design commission orders", KoleksiyonKaydi: "Design collections",
  DevPool: "Developer pool", LimitEmir: "Limit orders", DavetKaydi: "Referral links", DavetOdemesi: "Referral payouts",
};
/* which product a contract belongs to, when it is not part of a launchpad set */
const URUN = {
  HaberciLZ: "twin", AktarmaLZ: "twin", IkizYayici: "twin", IkizAdapterAg: "twin", IkizOFTAg: "twin", Jeton: "twin", LaunchToken: "twin",
  TurKaydi2: "urun", TurKaydi: "urun", KilitFabrikasi: "urun", TokenDAOFabrikasi: "urun", ProfilKaydi: "urun", MesajKutusu: "urun",
  TasarimNFT2: "tasarim", TasarimPazar3: "tasarim", SiparisKaydi: "tasarim", KoleksiyonKaydi: "tasarim",
  DavetKaydi: "davet", DavetOdemesi: "davet", LimitEmir: "limit", DevPool: "arcp", FthmYakici: "arcp",
};
const GRUP = [
  ["v8", "Main launchpad", "the gate, launchpad, hook, ledger and the collateral vault on each chain for every launch"],
  ["v9", "Designer-token launchpad", "the same parts, for designer tokens"],
  ["twin", "Cross-chain twins and messaging", "the twin tokens on other chains and the LayerZero messengers"],
  ["urun", "Products", "product types, founder locks, token DAOs, profiles and messages"],
  ["tasarim", "Designs", "design NFTs, the market, commissions and collections"],
  ["davet", "Referrals", "invite links and USDC payouts"],
  ["limit", "Limit orders", ""],
  ["arcp", "ARCP and the developer pool", ""],
  ["eski", "Earlier launchpad sets (still on chain)", "replaced by the sets above; kept so a reader can check them"],
];
const ZAD = { 5042: "Arc", 8453: "Base", 42161: "Arbitrum", 1: "Ethereum", 43114: "Avalanche", 143: "Monad", 999: "HyperEVM", 56: "BNB Chain", 4663: "Robinhood" };

/* every 0x address anywhere in a config file */
const adresleri = (j) => new Set((JSON.stringify(j || {}).match(/0x[0-9a-fA-F]{40}/g) || []).map((a) => a.toLowerCase()));

/* the earlier floor-and-buyback model's address keys, in plain words */
const ESKI_AD = { launchpad: "Launchpad", hook: "Pool hook", fabrika: "Token factory", likiditeKasasi: "Liquidity vault", devPool: "Developer fund",
  kasaFabrika: "Vault factory", yoneticiFabrika: "Vault manager factory", kayit: "Registry", oracle: "Price oracle", varlikKayit: "Asset registry",
  router: "Router", geriAlimRobotu: "Buyback bot", teminatKarnesi: "Collateral scorecard" };

function sozlesmeSatiri(x) {
  const tam = x.eslesme === "exact_match" || x.eslesme === "match";
  const kopya = el("button", { sinif: "dugme dugme--sade dugme--kucuk", yazi: "Copy", attr: { type: "button", "aria-label": "Copy address" }, on: { click: async (ev) => {
    try { await navigator.clipboard.writeText(x.adres); ev.target.textContent = "Copied"; } catch (_) { ev.target.textContent = "Select and copy"; }
    setTimeout(() => { ev.target.textContent = "Copy"; }, 1200);
  } } });
  return el("div", { sinif: "gv-satir", veri: { ara: ((AD[x.ad] || "") + " " + x.ad + " " + (ZAD[x.chainId] || "") + " " + x.adres).toLowerCase() } }, [
    el("div", { sinif: "gv-satir__ust" }, [
      el("strong", { yazi: AD[x.ad] || x.ad }),
      el("span", { sinif: "tk__zincir", yazi: ZAD[x.chainId] || String(x.chainId) }),
      tam ? el("a", { sinif: "etiket etiket--alis", attr: { href: "https://repo.sourcify.dev/" + x.chainId + "/" + x.adres, target: "_blank", rel: "noopener" }, yazi: x.eslesme === "exact_match" ? "verified (exact)" : "verified" })
        : el("span", { sinif: "etiket etiket--uyari", yazi: "not verified" }),
    ]),
    el("div", { sinif: "gv-satir__alt" }, [el("span", { sinif: "gv-kod", yazi: x.ad }), el("span", { sinif: "gv-adres", yazi: x.adres }), kopya]),
  ]);
}

const GV_CSS = `.gv-satir{padding:10px 0;border-bottom:1px solid var(--cizgi);min-width:0}
.gv-satir__ust{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
.gv-satir__ust strong{font-size:14px;color:var(--yazi-1)}
.gv-satir__alt{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;margin-top:4px;font-size:12.5px}
.gv-kod{font-family:var(--yazi-tipi-mono);color:var(--yazi-3)}
.gv-adres{font-family:var(--yazi-tipi-mono);color:var(--yazi-2);word-break:break-all;min-width:0}
.gv-ara{width:100%;max-width:420px}`;

export async function ciz() {
  stil();
  if (!document.getElementById("gv-stil")) document.head.append(el("style", { attr: { id: "gv-stil" }, yazi: GV_CSS }));
  const kap = el("div", { sinif: "yigin" });
  const blok = await sonBlok();

  kap.append(sayfaUst("Security and verification",
    "Every live contract with its verified source, and what was measured" + (blok ? " · Arc block " + blok.toLocaleString("en-US") : "")));

  /* ---- the live contracts, grouped by product, searchable ---- */
  const [dogrulama, v8, v9] = await Promise.all(["veri/kaynak-dogrulama.json", "veri/sepet-v2.json", "veri/sepet-v9.json"].map((y) =>
    fetch(y, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (dogrulama) {
    const s8 = adresleri(v8), s9 = adresleri(v9);
    const gruplar = {};
    for (const x of dogrulama.sozlesmeler) {
      const a = x.adres.toLowerCase();
      const g = URUN[x.ad] || (s9.has(a) ? "v9" : s8.has(a) ? "v8" : "eski");
      (gruplar[g] ||= []).push(x);
    }
    const dogru = dogrulama.sozlesmeler.filter((x) => x.eslesme === "exact_match" || x.eslesme === "match").length;
    const zincirSay = new Set(dogrulama.sozlesmeler.map((x) => x.chainId)).size;
    kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Source verified", dogru + " of " + dogrulama.sozlesmeler.length, "Sourcify exact match"),
      olcum("Chains", String(zincirSay), "with contracts the app calls"),
      olcum("Your wallet is asked for", "Transactions only", "exact-amount approvals; no message or permit signatures"),
      olcum("Independent audit", "None yet", "the measurements below are our own, and repeatable"),
    ]));

    const ara = el("input", { sinif: "girdi gv-ara", attr: { type: "search", placeholder: "Search a contract, chain or address", "aria-label": "Search contracts" } });
    const sayac = el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", attr: { role: "status" } });
    const bloklar = [];
    const liste = el("div", { sinif: "yigin yigin--sik" });
    GRUP.forEach(([k, ad, alt], i) => {
      const xs = gruplar[k];
      if (!xs || !xs.length) return;
      xs.sort((p, q) => (p.chainId === 5042 ? 0 : 1) - (q.chainId === 5042 ? 0 : 1) || String(AD[p.ad] || p.ad).localeCompare(String(AD[q.ad] || q.ad)));
      const govde = el("div", {}, xs.map(sozlesmeSatiri));
      const d = arsiv(ad + " · " + xs.length, govde, alt || null, i === 0 && innerWidth > 700);
      bloklar.push(d);
      liste.append(d);
    });
    ara.addEventListener("input", () => {
      const q = ara.value.trim().toLowerCase();
      let n = 0;
      for (const d of bloklar) {
        let var_ = 0;
        for (const r of d.querySelectorAll(".gv-satir")) { const ok = !q || r.dataset.ara.includes(q); r.hidden = !ok; if (ok) var_++; }
        d.hidden = !var_; n += var_;
        if (q) d.open = var_ > 0;
      }
      sayac.textContent = q ? n + " match" + (n === 1 ? "" : "es") : "";
    });
    kap.append(panel("Live contracts and their verified source", el("div", { sinif: "yigin" }, [
      el("div", { sinif: "ikincil", yazi: "Every contract the app sends a transaction to, on every chain, grouped by what it does. Each source is published on Sourcify and compiles to the exact bytes on chain. The app only asks your wallet to send transactions: approvals are for the exact amount of the action, never unlimited, and it never asks you to sign a message or a permit." }),
      el("div", { sinif: "satir", attr: { style: "flex-wrap:wrap;gap:10px;align-items:center" } }, [ara, sayac]),
      liste,
      el("div", { sinif: "ucuncul", yazi: "Source: github.com/arc-depth/arc-depth (folder arc-launchpad). Security contact: .well-known/security.txt. Verification last checked " + dogrulama.zaman + "." }),
    ])));
  }

  /* ---- what was measured on the live design ---- */
  const v7k = el("div", { sinif: "yigin yigin--sik" });
  for (const k of V7_KANITLAR) {
    v7k.append(el("div", { sinif: "jeton-kart" }, [
      el("div", { sinif: "satir satir--arasi", attr: { style: "flex-wrap:wrap;gap:6px" } }, [el("strong", { yazi: k.baslik }), el("span", { sinif: "etiket etiket--alis", yazi: "measured" })]),
      el("div", { sinif: "ikincil", yazi: k.yazi }),
      ayrinti("How to check it yourself", el("code", { sinif: "mono ucuncul", attr: { style: "word-break:break-all" }, yazi: k.betik }))
    ]));
  }
  kap.append(panel("What was measured on mainnet, and how to check it", el("div", { sinif: "yigin yigin--sik" }, [
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Run against real Arc mainnet state with simulated transactions (nothing sent), on the launchpad set these live sets were built from. The scripts are in the project's public repository." }), v7k])));

  /* ---- first generation (archive): its deployment state, addresses and measurements ---- */
  const dagitildi = Object.entries(PULSE).filter(([, v]) => canli(v));
  const bekleyen = Object.entries(PULSE).filter(([, v]) => !canli(v));
  const arsivGovde = [];
  arsivGovde.push(not(
    "This is the earlier floor-and-buyback model. It is not used by any live launch. " + dagitildi.length + " of its contracts are on chain; " +
    (bekleyen.length ? bekleyen.length + " were never deployed (" + bekleyen.map(([k]) => (ESKI_AD[k] || k).toLowerCase()).join(", ") + "), so nothing in the app points at them. " : "") +
    "Everything above this section is deployed and verified.", "bilgi"));
  arsivGovde.push(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Deployed", String(dagitildi.length), "from this model"),
    olcum("Never deployed", String(bekleyen.length), "not needed by anything live"),
    olcum("Per call", EKONOMI.islemTavaniBps / 100 + "%", "spendable in one buyback"),
    olcum("Per window", EKONOMI.donemTavaniBps / 100 + "%", "able to leave within " + bloktanSure(EKONOMI.donemBlok)),
  ]));
  const adresSatiri = (ad, deger, kaynak) => el("div", { sinif: "gv-satir" }, [
    el("div", { sinif: "gv-satir__ust" }, [el("strong", { yazi: ESKI_AD[ad] || ad }),
      canli(deger) ? el("span", { sinif: "etiket etiket--alis", yazi: "on chain" }) : el("span", { sinif: "etiket", yazi: "never deployed" }),
      kaynak ? el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: kaynak }) : null]),
    el("div", { sinif: "gv-satir__alt" }, [el("span", { sinif: "gv-kod", yazi: ad }), canli(deger) ? el("span", { sinif: "gv-adres", yazi: deger }) : null]),
  ]);
  const adresler = el("div", {});
  for (const [ad, v] of Object.entries(PULSE)) adresler.append(adresSatiri(ad, v, null));
  adresler.append(adresSatiri("Operations (fee target)", HEDEFLER.isletme, "a plain address"));
  adresler.append(adresSatiri("PoolManager", DIS.poolManager, "Uniswap v4, not ours"));
  adresler.append(adresSatiri("USDC", DIS.usdc, "native on Arc: both collateral and gas"));
  for (const [ad, v] of Object.entries(ESKI)) adresler.append(adresSatiri(ad, v, "previous generation"));
  arsivGovde.push(el("h4", { yazi: "Addresses" }), adresler);

  const kanitlar = el("div", { sinif: "yigin yigin--sik" });
  for (const k of KANITLAR) {
    kanitlar.append(el("div", { sinif: "jeton-kart" }, [
      el("div", { sinif: "satir satir--arasi", attr: { style: "flex-wrap:wrap;gap:6px" } }, [el("strong", { yazi: k.baslik }), el("span", { sinif: "etiket etiket--alis", yazi: "measured" })]),
      k.baglam ? el("div", { sinif: "yazi yazi--kucuk", attr: { style: "color:var(--yazi-1)" }, yazi: k.baglam }) : null,
      el("div", { sinif: "ikincil", yazi: k.yazi }),
      ayrinti("How to check it yourself", el("code", { sinif: "mono ucuncul", attr: { style: "word-break:break-all" }, yazi: "node " + k.betik }))
    ]));
  }
  arsivGovde.push(el("h4", { yazi: "What was measured" }), kanitlar);
  kap.append(arsiv("First generation: the earlier floor-and-buyback model (archive)", arsivGovde, dagitildi.length + " contracts on chain, " + bekleyen.length + " never deployed"));
  return kap;
}
