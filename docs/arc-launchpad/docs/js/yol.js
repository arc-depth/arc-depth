/* ===========================================================================
 * yol.js — the module registry: what exists, where it lives, and what is
 *          actually behind it
 *
 * Every module in the platform is declared here once, with a `durum` that
 * the router enforces:
 *
 *   "canli"   — there is a contract or a public data source behind this and
 *               the view reads it. Real numbers or an honest empty state.
 *   "dagitim" — the code exists and is tested, but the contract is not
 *               deployed yet. The view explains that and offers no button
 *               that cannot act.
 *   "yapim"   — not built. The route exists so the architecture is visible,
 *               and the view says plainly what is missing and what has to
 *               be true before it can work.
 *
 * WHY DECLARE THE UNBUILT ONES AT ALL
 *   Because the shape of the product is a decision, and hiding the modules
 *   that are not finished makes the finished ones look like the whole plan.
 *   What is NOT acceptable is a route that looks finished and is not — so
 *   `durum` is not decoration: ana.js refuses to render a "yapim" module's
 *   controls, and the rail marks it before anybody clicks.
 *
 *   The brief's rule, kept literally: no fake price, chart, volume or
 *   holder data; nothing that does not work offered as an active button.
 * =========================================================================== */

export const GRUPLAR = [
  { anahtar: "piyasa", ad: "Market" },
  { anahtar: "varlik", ad: "My assets" },
  { anahtar: "yonetisim", ad: "Governance" },
  { anahtar: "guven", ad: "Trust" }
];

export const YOLLAR = [
  /* ---- market ----------------------------------------------------- */
  {
    yol: "kesfet",
    ad: "Discover",
    kisa: "Discover",
    grup: "piyasa",
    ikon: "pusula",
    durum: "canli",
    ozet: "Trending, newly launched, highest volume, biggest gainers and freshly graduated tokens.",
    /* Reads the launchpad registry for the token list and the PoolManager
       for prices. With no launchpad deployed the list is genuinely empty,
       and that is what it shows. */
    kaynak: "launchpad record + Uniswap v4 pools",
    sekme: true
  },
  {
    yol: "olustur",
    ad: "Create token",
    kisa: "Create",
    grup: "piyasa",
    ikon: "arti",
    /* LIVE, AND THIS WAS MEASURED TOO
         This said "dagitim" — deployment pending — while PulseLaunchpad
         was live, the form had a working submit and the page audit
         confirmed the address against the on-chain record. A working
         feature marked as not-yet-deployed is the same defect as a dead
         one marked live, pointed the other way: it tells a founder the
         thing they came for does not exist yet.

         kaynak also still named EgriLaunchpad, which is retired. */
    durum: "canli",
    ozet: "Name, symbol, collateral asset, tax rate and the founder's first buy.",
    kaynak: "PulseLaunchpad.launch()",
    /* The form is real and the payment breakdown is computed from the
       contract's own constants, so it can be filled in and checked. It
       cannot be SUBMITTED until the launchpad exists. */
    gerekli: "EgriLaunchpad and EgriHook must be deployed, with the hook address mined to end in 0xa44",
    sekme: true
  },
  {
    yol: "fthm",
    ad: "FTHM on any chain",
    kisa: "FTHM",
    grup: "piyasa",
    ikon: "pusula",
    durum: "canli",
    ozet: "Buy FTHM with your chain's USDC or sell it, from any chain, through the one pool on Arc.",
    kaynak: "relay.link + KapiAg + FTHM OFT",
    sekme: true
  },
  {
    yol: "terminal",
    ad: "Trading terminal",
    kisa: "Trade",
    grup: "piyasa",
    ikon: "mum",
    durum: "canli",
    ozet: "Candles, trade history, buy/sell panel, holder distribution, collateral reserve and buyback history.",
    kaynak: "v4 Swap events + KopruKasasi + PulseHook events",
    sekme: true,
    gizliRay: true          /* reached from a token, not from the rail */
  },
  {
    yol: "teminat",
    ad: "Collateral picker",
    grup: "piyasa",
    ikon: "kasa",
    /* LIVE. The suggested 50 were generated from measurement; the CA field
       searches seven chains live for the deepest USDC pool. Neither is
       waiting on a deployment: what is read is Uniswap, not our own
       contracts. */
    durum: "canli",
    ozet: "Fifty suggested assets, or paste any contract address — both go through the same check."
  },
  {
    yol: "kasalar",
    ad: "Collateral vaults",
    grup: "piyasa",
    ikon: "kalkan",
    durum: "canli",
    ozet: "Each token's reserve, its claim per token, the price where the floor engages, and buyback history.",
    kaynak: "KopruKasasi.hak() / bakiye() / dolasim()"
  },
  {
    yol: "analitik",
    ad: "Platform analytics",
    grup: "piyasa",
    ikon: "grafik",
    /* LIVE since 14 Oct 2026. It was "yapim" because these numbers need an
       event walk, not one call. scripts/analitik-ozet.js now does that walk
       on both chains and writes veri/analitik.json; the page shows the
       block each chain was read to, so it never pretends to be live. */
    durum: "canli",
    ozet: "Launches, volume, fees by slice and reserves, on Arc and Robinhood Chain.",
    kaynak: "veri/analitik.json - Launched, Swap and Ucret events, balanceOf"
  },

  /* ---- holdings --------------------------------------------------- */
  {
    yol: "portfoy",
    ad: "Portfolio",
    kisa: "Portfolio",
    grup: "varlik",
    ikon: "cuzdan",
    durum: "canli",
    ozet: "The connected wallet's token balances and the collateral each one can claim.",
    kaynak: "balanceOf + KopruKasasi.hak()",
    sekme: true
  },
  {
    yol: "kar-zarar",
    ad: "Profit / Loss",
    grup: "varlik",
    ikon: "terazi",
    durum: "yapim",
    ozet: "Position cost, realised and unrealised profit and loss.",
    gerekli: "Cost basis has to be derived from the wallet's past trades, which cannot be done without an indexer — and showing a guessed cost means showing a wrong profit.",
    eksik: [
      "A per-wallet Swap event indexer",
      "A decision on how a token that arrived by transfer is costed — a gift, or a purchase"
    ]
  },
  /* HOLDER REWARDS WERE REMOVED — and it was two separate false claims
       The user cancelled the holder reward ("we are not giving a holder
       reward"), but this module was still sitting there with the status
       "dagitim": a cancelled feature was being shown as on its way.

       The second and worse one: its summary said "0.30% of every trade is
       distributed to token holders." That slice now goes to the DEVELOPER
       POOL, and only the FTHM DAO can draw out of DevPool. So the page was
       saying something false about where the money goes.

       The module was removed, and the view file deleted too, because a
       view left behind can be wired back in by the next edit to the
       router. */
  /* ---- developer ecosystem ---------------------------------------- */
  {
    yol: "pazar",
    ad: "Developer marketplace",
    kisa: "Pazar",
    grup: "piyasa",
    ikon: "terazi",
    /* LIVE: Pazar is on Arc mainnet and this screen reads it. The product
       count, the fee rate and the revenue ledger come straight from the
       contract; the zeros are real. */
    durum: "canli",
    ozet: "Products from outside developers. Paid in USDC, 80% of revenue to the developer.",
    kaynak: "Pazar.urunler() / ortalamaPuan() / lisans() / platformKazanci()"
  },
  {
    yol: "gelistirici",
    ad: "Developer portal",
    kisa: "Developers",
    grup: "varlik",
    ikon: "dis",
    /* Live: the developer-pool half reads the deployed DevPool and the
       deployed FTHM stake today, and tells the truth about why that
       money cannot move yet. Only the marketplace half is pending. */
    durum: "canli",
    ozet: "Two ways to earn: sell a product on the marketplace, or be paid from the developer pool by a DAO vote.",
    kaynak: "DevPool bakiyesi + Stake.totalStaked() + Pazar defteri"
  },

  /* ---- governance -------------------------------------------------- */
  {
    yol: "dao",
    ad: "Platform DAO",
    grup: "yonetisim",
    ikon: "meclis",
    /* LIVE. This entry was "yapim" for a long time and the reason was
       sound: building a screen before answering WHAT the DAO can decide
       would have been a form wired to nothing.

       Two things changed, and both are measurements:

       1. The governance contract is not UNWRITTEN but DEPLOYED.
          0x20d2E53172D2BD4b010E90fa6ce8f09972343CeB has propose,
          castVote, queue, execute, the timelock, the quorum and the
          guardian, and all of them answer. proposalCount() is zero —
          never used, not broken.

       2. The set of powers is no longer a design question but a
          measurement: scripts/denetim-dao-erisimi.js reads the collateral
          vaults, the ledger, the fee table, the curve and the locked
          liquidity one by one and asserts that in none of them is there an
          authorised role or a setter. The permitted set that remains is two
          subjects: paying out of the developer fund and curating the launch
          menu — both read from the contracts that treat the Governor as
          authorised on chain. */
    durum: "canli",
    ozet: "Live on-chain governance: propose, vote, timelock, execute.",
    sekme: true
  },
  {
    yol: "teklifler",
    ad: "Proposals and voting",
    grup: "yonetisim",
    ikon: "oy",
    /* LIVE and it really sends transactions: propose, castVote, queue,
       execute. Each button is rendered according to whether that action is
       valid RIGHT NOW — measured, and because totalStaked() is zero the
       proposal form is not rendered at all right now; the reason is
       printed instead. Showing the form and letting the chain refuse the
       transaction would be charging the user gas to be told nothing. */
    durum: "canli",
    ozet: "Propose, vote, queue, execute — all on chain."
  },
  {
    yol: "topluluk-dao",
    ad: "Token DAOs",
    grup: "yonetisim",
    ikon: "insanlar",
    durum: "yapim",
    ozet: "Each token's own community governance, separate from the platform DAO.",
    gerekli: "The same problem as the platform DAO, plus one more: a token DAO cannot touch its own vault or its tax — both are deliberately immutable. The set of things it CAN decide has to be defined first.",
    eksik: ["A governance contract per token", "Subjects the community can genuinely decide"]
  },
  {
    yol: "topluluk",
    ad: "Community pages",
    grup: "yonetisim",
    ikon: "sohbet",
    durum: "yapim",
    ozet: "A community page per token: links and announcements.",
    gerekli: "An off-chain content store. Where text that is not written to the chain lives, and who may change it, has to be answered first.",
    eksik: ["A content store", "A rule for who may write", "An abuse policy"]
  },
  {
    yol: "liderlik",
    ad: "Leaderboards",
    grup: "yonetisim",
    ikon: "kupa",
    /* LIVE from the same snapshot. Tokens by volume and by vault, founders
       by launches. No trader ranking: the sender of a swap is the router,
       so it would be a guess, and the page says so. */
    durum: "canli",
    ozet: "Top tokens by volume and by vault, and top founders, on both chains.",
    kaynak: "veri/analitik.json"
  },

  /* ---- trust ------------------------------------------------------- */
  {
    yol: "kalkan",
    ad: "Whale Shield",
    grup: "guven",
    ikon: "kalkan-artis",
    durum: "canli",
    ozet: "The per-block cumulative sell threshold, the extra rate applied, and what the shield moves into the vault.",
    /* The event is SavunmaAcildi on this hook; KalkanCalisti was the
       previous generation's name and no such event exists to listen for. */
    kaynak: "PulseHook.pencere() + SavunmaAcildi / SnipeKesildi events"
  },
  {
    yol: "zincirler",
    ad: "Cross-chain collateral",
    grup: "guven",
    ikon: "zincir",
    durum: "canli",
    ozet: "Which assets can back a token, which bridge carries them to Arc, and which routes are actually open.",
    /* This one is live precisely because the honest answer is a
       measurement: which routes exist, which do not, and which carry what. */
    /* Chainlink is no longer a gate — the user removed the requirement
       that a collateral target have a feed ("just put in every candidate
       that works"). A feed is still consulted where one exists, as the stricter
       of the two prices, but it does not decide what may be collateral. */
    kaynak: "CCTP v2 chain reads + CrossChainAssetRegistry"
  },
  {
    yol: "guvenlik",
    ad: "Security and verification",
    grup: "guven",
    ikon: "kilit",
    durum: "canli",
    ozet: "Contract addresses, the opcode scan, every way out of the vault, and the result of the audits that run.",
    kaynak: "the deployment records + the audit scripts' output"
  },
  {
    yol: "dokuman",
    ad: "Documentation",
    grup: "guven",
    ikon: "kitap",
    durum: "canli",
    ozet: "How the system works: launching, fees, the floor, the shield, graduation.",
    kaynak: "measured numbers"
  }
];

export const SEKME_YOLLARI = ["kesfet", "terminal", "portfoy", "daha"];

export function yolBul(ad) {
  return YOLLAR.find((y) => y.yol === ad) || null;
}

export function grubunYollari(grup) {
  return YOLLAR.filter((y) => y.grup === grup && !y.gizliRay);
}

/** How many modules are in each state — the honest headline for /hakkinda. */
export function durumSayimi() {
  const s = { canli: 0, dagitim: 0, yapim: 0 };
  for (const y of YOLLAR) s[y.durum] = (s[y.durum] || 0) + 1;
  return s;
}
