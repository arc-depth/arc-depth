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
  /* 1 Nov 2026: nine products on one launch engine, told apart by TurKaydi */
  { anahtar: "urunler", ad: "Products" },
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
    ozet: "Every launch with its collateral now against what it started with, where it launched and where it trades.",
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
    ozet: "Launch from any chain with its gas token: name, symbol, up to five collateral tokens from any chain, tax and first buy.",
    kaynak: "PulseLaunchpad.launch()",
    /* The form is real and the payment breakdown is computed from the
       contract's own constants, so it can be filled in and checked. It
       cannot be SUBMITTED until the launchpad exists. */
    gerekli: "EgriLaunchpad and EgriHook must be deployed, with the hook address mined to end in 0xa44",
    sekme: true
  },
  {
    yol: "genesis",
    ad: "PULSE GENESIS",
    kisa: "GENESIS",
    grup: "piyasa",
    ikon: "sohbet",
    /* The page reads every chain for the contract and says plainly when it
       is not there; what it shows is what is on chain. */
    durum: "canli",
    ozet: "Talk to GENESIS; explore the Atlas map of chains and capital flows; find routes between chains. Answers come from on-chain memory.",
    kaynak: "GenesisCekirdek + GenesisDil + GenesisHesap",
    sekme: true
  },
  {
    yol: "olustur-move",
    ad: "Create token (Sui / Aptos wallet)",
    kisa: "Create (Move)",
    grup: "piyasa",
    ikon: "arti",
    durum: "canli",
    ozet: "Launch paid from a Sui or Aptos wallet, the token living on that chain.",
    kaynak: "pulse_launchpad (Sui) + pulse_launchpad (Aptos)",
    gizliRay: true
  },
  {
    yol: "merkez",
    gizliRay: true,   /* off the rail: same page as Create token */
    ad: "Launch on any chain",
    kisa: "Any chain",
    grup: "piyasa",
    ikon: "pusula",
    durum: "canli",
    ozet: "Launch, buy, sell and redeem from any chain with its own gas token; one pool and one price on Arc.",
    kaynak: "relay.link + MerkezKapi (Arc) + IkizYayici twins + basket vaults",
    sekme: true
  },
  {
    yol: "fthm",
    ad: "ARCP from any chain",
    kisa: "ARCP",
    grup: "piyasa",
    ikon: "pusula",
    durum: "canli",
    ozet: "Buy ARCP with your chain's USDC or SOL from any chain, delivered on Arc; sell it in the same pool on Arc.",
    kaynak: "relay.link + ARCP pool (Uniswap v4, Arc) + SwapRouter",
    sekme: true
  },
  {
    /* 9 Nov 2026: the ARCP 2 presale, its own page (docs/presale.html) behind its own top tab */
    yol: "presale",
    ad: "ARCP presale",
    kisa: "Presale",
    grup: "piyasa",
    ikon: "kupa",
    durum: "canli",
    site: "presale.html",
    ozet: "250,000,000 ARCP for $15,000 in 30-day rounds, $10 to $250 per wallet; an unfilled round is refunded.",
    kaynak: "OnSatis (Arc) + TweetKayit + Dagitici"
  },
  {
    /* 9 Nov 2026 DEMO: every token on the chains relay reaches, bought from any of ours; off the rail until approved */
    yol: "vitrin",
    ad: "Market",
    kisa: "Market",
    grup: "piyasa",
    ikon: "grafik",
    durum: "canli",
    gizliRay: true,
    ozet: "Trending and new tokens on ten chains; buy any of them with the dollars you hold on any chain.",
    kaynak: "GeckoTerminal public API + relay.link"
  },
  {
    yol: "move-token",
    ad: "Aptos & Sui launches",
    kisa: "Aptos & Sui",
    grup: "piyasa",
    ikon: "pusula",
    durum: "canli",
    ozet: "Every token launched on the Aptos and Sui launchpads; buy, sell and redeem against its vault.",
    kaynak: "Move launchpads (Aptos v2, Sui) + their pools and vaults",
    sekme: true
  },
  {
    yol: "terminal",
    ad: "Trading terminal",
    kisa: "Trade",
    grup: "piyasa",
    ikon: "mum",
    durum: "canli",
    ozet: "First-generation tokens: candles, trade history, buy/sell panel, holders, collateral reserve and buyback history.",
    kaynak: "v4 Swap events + KopruKasasi + PulseHook events",
    sekme: true,
    gizliRay: true          /* reached from a token, not from the rail */
  },
  {
    yol: "kasalar",
    ad: "Collateral vaults",
    grup: "piyasa",
    ikon: "kalkan",
    durum: "canli",
    ozet: "The basket vault on each of nine chains: its dollars, its auctions, and the open ones with what they ask now.",
    kaynak: "SepetKasasi.ihaleler() / istenen() on each chain + Sui and Aptos vaults"
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

  /* ---- products (1 Nov 2026) ----------------------------------------
     Every product launches through the same MerkezKapi with the same
     rules; the type its founder writes into TurKaydi (adresler.js →
     TUR_KAYDI) is the only difference. Each page lists the tokens whose
     latest TurKaydi entry has its type, read from Arc (an honest empty
     list until the first one is saved). Shared code: docs/js/urun.js. */
  {
    yol: "communities", ad: "Communities", kisa: "Communities", grup: "urunler", ikon: "insanlar", durum: "canli",
    ozet: "Tokens for groups (Discord, Telegram, X) that build shared value together, with token-holder-only channels.",
    kaynak: "TurKaydi type 1 (TurYazildi events) + MerkezKapi"
  },
  {
    yol: "creators", ad: "Creators", kisa: "Creators", grup: "urunler", ikon: "kupa", durum: "canli",
    ozet: "Fans support creators by holding their token; the creator earns 0.30% of every trade in USDC.",
    kaynak: "TurKaydi type 2 (TurYazildi events) + MerkezKapi"
  },
  {
    yol: "agents", ad: "AI agents", kisa: "Agents", grup: "urunler", ikon: "dis", durum: "canli",
    ozet: "An AI agent's own token; with the agent's wallet as founder, its trading share pays the agent's own costs.",
    kaynak: "TurKaydi type 3 (TurYazildi events) + MerkezKapi"
  },
  {
    yol: "projects", ad: "Projects", kisa: "Projects", grup: "urunler", ikon: "arti", durum: "canli",
    ozet: "Small teams gather support for what they build. No profit promises; an optional founder lock is live.",
    kaynak: "TurKaydi type 4 (TurYazildi events) + MerkezKapi"
  },
  {
    yol: "daos", ad: "DAOs", kisa: "DAOs", grup: "urunler", ikon: "meclis", durum: "canli",
    ozet: "Holders vote and run a shared treasury. Per-token governance contracts (Token DAOs) are live.",
    kaynak: "TurKaydi type 5 (TurYazildi events) + MerkezKapi"
  },
  {
    yol: "games", ad: "Games", kisa: "Games", grup: "urunler", ikon: "mum", durum: "canli",
    ozet: "In-game currencies and rewards. A developer guide is coming.",
    kaynak: "TurKaydi type 6 (TurYazildi events) + MerkezKapi"
  },
  {
    yol: "baskets", ad: "Baskets", kisa: "Baskets", grup: "urunler", ikon: "kasa", durum: "canli",
    ozet: "The collateral basket holds up to five assets from twelve chains; holders can redeem their share without selling.",
    kaynak: "TurKaydi type 7 (TurYazildi events) + basket vaults"
  },
  {
    /* LIVE (1 Nov 2026): TasarimNFT is deployed on Arc (0x2D6b9920…,
       dagitim-designs.json) and gorunum/designs.js reads and writes it:
       feed, explore, profiles, design pages, publish. Behind its own button
       in the top nav (ana.js BIRINCIL). Buying needs a TWAP for the designer
       token's pool on the price source (PulseHook6, set 1 Nov 2026; tokens in
       older pools have none) and the page says so per token; publishing works now.
       (Was "yapim" with the description below while the contract was not
       deployed; `eksik` is kept for the record and shown only in that state.) */
    yol: "designs", ad: "Designer NFTs", kisa: "NFT designs", grup: "urunler", ikon: "hediye", durum: "canli",
    /* 1 Nov 2026: the top button and the rail open ARC PULSE Designs, its own site (docs/designs/);
       #/designs keeps working here for old links and the on-chain license URI */
    site: "designs/",
    kaynak: "TasarimNFT (Arc) + TurKaydi type 8 + Irys storage paid by the designer's wallet",
    ozet: "Designers launch their own token through the same launch engine, with a collateral basket like every launch. They publish files and images as 1-of-1 NFTs priced in USDC and paid for with the designer's own token. Full usage rights belong to whoever holds the NFT and move with it on resale; duplicates are blocked.",
    gerekli: "Buying needs a time-weighted price for the designer token's pool on PulseHook6 (the price source); publishing, listing and challenges work now.",
    eksik: [
      "A 1-of-1 NFT contract with duplicate blocking",
      "A marketplace that prices in USDC and takes payment in the designer's token",
      "File and image storage, and the usage-rights terms that move with each NFT"
    ]
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
       POOL, and only the platform token's DAO (now ARCP) can draw out of DevPool. So the page was
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
       deployed ARCP stake today, and tells the truth about why that
       money cannot move yet. Only the marketplace half is pending. */
    durum: "canli",
    ozet: "Two ways to earn: sell a product on the marketplace, or be paid from the developer pool by a DAO vote.",
    kaynak: "DevPool balance + Stake.totalStaked() + Pazar ledger"
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
    gizliRay: true,   /* off the rail: reached from Platform DAO */
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
    ozet: "Top traders, launchers, designers and referrers live from Arc (24h / 7d / all time), plus tokens by volume and vault and founders.",
    kaynak: "veri/analitik.json + MerkezKapi / TasarimNFT2 / DavetKaydi logs"
  },
  {
    yol: "davet",
    ad: "Referrals",
    kisa: "Invite",
    grup: "yonetisim",
    ikon: "insanlar",
    /* LIVE: DavetKaydi (who invited whom, set once by the invited wallet) and
       DavetOdemesi (USDC rewards from the platform's cut, Merkle roots the page recomputes). */
    durum: "canli",
    ozet: "Your invite link, who you invited, and your share of the platform's cut of their fees, claimable in USDC.",
    kaynak: "DavetKaydi + DavetOdemesi (Arc)"
  },

  /* ---- trust ------------------------------------------------------- */
  {
    yol: "kalkan",
    ad: "Whale Shield",
    grup: "guven",
    ikon: "kalkan-artis",
    durum: "canli",
    ozet: "First generation: the per-block cumulative sell threshold, the extra rate applied, and what the shield moves into the vault.",
    /* The event is SavunmaAcildi on this hook; KalkanCalisti was the
       previous generation's name and no such event exists to listen for. */
    kaynak: "PulseHook.pencere() + SavunmaAcildi / SnipeKesildi events"
  },
  {
    yol: "zincirler",
    gizliRay: true,   /* off the rail: the old bridge-to-Arc collateral; baskets stay on their own chains now */
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
    ozet: "How the second generation works: one pool on Arc, twins on eleven chains, the basket, fees, what is not built yet.",
    kaynak: "the contracts' constants + docs/js/egri.js"
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
