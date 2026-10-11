/* ===========================================================================
 * adresler.js — every address this interface knows, in one place
 *
 * WHY ONE FILE
 *   An address pasted into a view is an address that will be stale in one
 *   view and current in another. After a deployment exactly one file
 *   changes.
 *
 * WHY null AND NOT A PLACEHOLDER
 *   The new launchpad is NOT deployed. Writing a zero address or a dummy
 *   here would let every screen render as though it had something to talk
 *   to, and the brief is explicit: nothing that is not working may be shown
 *   as working. `null` propagates — `canli()` is false, the view renders
 *   its "not deployed" state, and no button is offered that cannot act.
 *
 *   So the absence is load-bearing. Filling these in is a deployment step,
 *   and until then the interface says so on every screen that depends on
 *   one.
 * =========================================================================== */

export const ZINCIR = {
  id: 5042,
  ad: "Arc",
  rpc: "https://rpc.mainnet.arc.io",
  paraSembol: "USDC",

  /* ---- TWO SCALES FOR ONE BALANCE, AND THEY ARE EASY TO SWAP ------
   *
   * Arc's gas token IS USDC, so there is no separate native currency to
   * think about — except for its scale, which is not the ERC20's.
   * Measured on the operations wallet, same address, same block:
   *
   *   eth_getBalance    16473110094122734642   -> $16.47 at 1e18
   *   USDC.balanceOf              16473110     -> $16.47 at 1e6
   *   ratio                         1.0000e+12
   *
   * Same money, two scales. So:
   *
   *   paraOndalik   18   eth_getBalance, gas prices, wallet_addEthereumChain
   *   quoteOndalik   6   the USDC contract: balanceOf, transfer, every
   *                      amount a contract in this project reasons about
   *
   * Named apart because the confident wrong comment that used to sit here
   * said six was the native scale, and cuzdan.js passed six to
   * wallet_addEthereumChain — which would have shown anyone adding Arc
   * from this page a balance a trillion times too large. The same
   * six-versus-eighteen slip produced a $497 BILLION deployment estimate
   * elsewhere in this project on the same day. */
  paraOndalik: 18,
  quoteOndalik: 6,
  /* Arc's USDC, which is also its native gas token. Named here because
     the creation form has to approve it, and an address spelled out at a
     call site is an address nobody checks against the deployment. */
  quote: "0x3600000000000000000000000000000000000000"
};

/* Live, not ours. Verified on chain. */
export const DIS = {
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  usdc: "0x3600000000000000000000000000000000000000"
};

/* ---- GOVERNANCE: FTHM, AND IT IS LIVE ---------------------------
 *
 * Governance is FTHM now. This block pointed at the ALP stack, and
 * repointing it was not a one-line change: the two governors are
 * different contracts with different shapes, measured before anything
 * moved.
 *
 *   ABI drift        oyYonu() and staking() and MIN_OY_GUCU() are not
 *                    on DepthGovernor; votingPower()/stakeOf() are not
 *                    on its Stake. Four screens' reads would have gone
 *                    quiet, not loud.
 *   struct drift     DepthGovernor's Proposal has a sixth uint, so
 *                    every index after description moved by one and
 *                    pr[4] became a BLOCK NUMBER where a deadline was.
 *
 * Read from the FTHM governor on chain, same block:
 *
 *   proposalCount()           0          never used, not broken
 *   PROPOSAL_THRESHOLD_BPS  100          1.00% of staked supply
 *   QUORUM_BPS             1000          10.00%
 *   VOTING_PERIOD        432000 s        5.00 days
 *   TIMELOCK             172800 s        2.00 days
 *   GRACE_PERIOD        1209600 s        14.00 days
 *   ANLIK_GERI                1          snapshot taken one block back
 *   guardianExpiry()  1822925564         2027-10-07, can only CANCEL
 *   totalStaked()        50.000 FTHM     activated with the floor
 *
 * The periods are SECONDS, not blocks: state() compares against
 * block.timestamp. Reading them as blocks and converting at Arc's
 * measured 0.507 s/block gave 2.54 days and 1.01 days, both wrong, and
 * that wrong pair was still printed by the DAO access audit. */
export const YONETISIM = {
  governor: "0x1084AD3162afC8A62736D604598377D8e6Be8D95",
  govToken: "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE",                 // FTHM
  staking: "0xAbD31A537E089D8a12b928aF7837C148dE2Bd2de",                  // voting power
  devPool: "0xA110b71c3f0748536f10C9e71A6E9F96999F6CD0",            // the 0.30% developer slice
  vesting: "0x386968f036cbc0d0965C81bf1fCEd0b40EE11E14",
  acici: "0x0EEE2d24a18ad48960935D08862059Ac07171281",
  /* The address that holds the founder allocation. Named so the DAO
     screen can report how much of the voting power sits in one place
     instead of only reporting the total. */
  kurucu: "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0",
  hook: "0x72fd3c2eE8A499E97D87e2a642B7DFd908D58A44"
};

/* The ALP-era governance stack. Still on chain, no longer governing:
   FTHM is the only governance token. Named rather than deleted because
   the contracts below still answer to it and a reader who finds one of
   these addresses needs to know why it is not the DAO. */
export const ESKI_YONETISIM = {
  governor: "0x20d2E53172D2BD4b010E90fa6ce8f09972343CeB",
  govToken: "0xFeA8F85B9020dAD8d1bbad0E0CC991564c1e2D41",   // ALP
  staking: "0xE0fE4664417Fc7DE9f35a5c55bb490105Ed589f2",
  devPool: "0xDE4b0B1ac667F4aD46800DeD2262978a0F9E1b7b",
  alpLocker: "0x9F0acc69b849CF891ADD6862B2ffd54E3aa85dd9",
  vesting: "0xe62fe875aaaC73f33ac809200Ab883d004A13B17"
};

/* What a passing FTHM proposal can and cannot reach.
 *
 * Not a policy statement — a measurement, and the measurement moved
 * three of these from CAN to CANNOT.
 *
 * Every target's authority was read on chain against the FTHM governor
 * 0x1084AD31:
 *
 *   DevPool (new)      governor()   FTHM GOVERNOR     -> can
 *   DevPool (ALP era)  governor()   ALP GOVERNOR      -> cannot
 *   GelistiriciFonu    tahsisci()   ISLETME CUZDANI   -> cannot
 *   Hazine             governor()   ALP GOVERNOR      -> cannot
 *   LaunchQueue        governor()   ALP GOVERNOR      -> cannot
 *   AlpLocker          governor()   reverts, no such getter
 *
 * This block previously listed the treasury, the launch menu and the
 * ALP lock as DAO powers. Under FTHM they are not: those authorities
 * are `address public immutable governor` set to the ALP governor, so
 * they can never be handed over, and the launch menu curated the share
 * queue that was cancelled anyway.
 *
 * Which leaves the FTHM DAO with exactly ONE power today — paying
 * developers out of the slice every trade feeds. That is a small list,
 * and listing the other three would have been inventing authority the
 * chain refuses. */
export const DAO_YETKI = {
  yapabilir: [
    { ne: "Pay a developer out of the pool",
      nerede: "DevPool.pay — 0.30% of every trade flows here" }
  ],
  yapamaz: [
    { ne: "Collateral reserves", neden: "TeminatKasasi: no owner, no setter" },
    { ne: "Cross-chain collateral", neden: "KopruKasasi: one setter, once, to the deployer" },
    { ne: "The claim ledger", neden: "CrossChainAccounting: one setter, once, to the vault" },
    { ne: "The fee table and the hook", neden: "PulseHook: the constants cannot be changed" },
    { ne: "Locked liquidity", neden: "PulseAcici / PulseLikiditeKasasi: no owner, no setter" },
    { ne: "The opening price and the supply", neden: "PulseLaunchpad: the constants cannot be changed" },
    { ne: "The treasury", neden: "Hazine.governor is the ALP governor and immutable — FTHM cannot reach it" },
    { ne: "The launch menu (the share queue)", neden: "LaunchQueue.governor is the ALP governor, and the queue was cancelled" },
    { ne: "The old developer fund", neden: "GelistiriciFonu.tahsisci is the operations wallet, and immutable" }
  ],
  /* The honest residual, measured the same way. */
  /* THIS TEXT CHANGED BECAUSE THE SITUATION CHANGED
       Its previous form said "no FTHM is staked, nobody can propose", and
       that was true. The DAO was opened with the floor (50,000 FTHM);
       propose() is now accepted for a real DevPool payment — verified by
       simulation.

       Being open did not make the risk disappear, it MOVED it: the risk is
       no longer "nobody can decide" but "one address can decide". Fixing
       the first without writing down the second would be swapping bad news
       for good. */
  artikRisk: "The DAO's only power is paying out of the DevPool. The " +
    "floor has been staked, so proposals are possible — but the only " +
    "address staking is the founder's, so all of the voting power sits " +
    "there: that one address clears both the proposal threshold and the " +
    "quorum. What slows this down is not the spread of votes but five " +
    "days of voting, a two-day timelock, and a guardian that can only " +
    "CANCEL until 2027. The share erodes as third parties stake, and " +
    "the DAO screen shows it as it is."
};

/* Ours, and deployed. The previous generation of this product — kept
   because the pages that read it are still true. */
export const ESKI = {
  teminatKarnesi: "0x633c266aA9dB7df2f2aC63eB8711bF9dA76846Da",
  fthm: "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE"
};

/* ---- THE SECOND GENERATION: DEPLOYED AND VERIFIED ---------------
 *
 * Every address comes from `dagitim-pulse2.json`, and that file was written
 * from the chain AFTER `scripts/denetim-dagitim-pulse2.js` passed its 34
 * assertions. `scripts/denetim-sayfa.js` checks that this block matches
 * that record — so an address corrected by hand becomes a difference the
 * audit catches, not the interface silently reading the wrong contract.
 *
 * THREE STRUCTURAL DIFFERENCES FROM THE PREVIOUS GENERATION
 *   1. NO CURVE. The market is Uniswap v4 from the first block. In the
 *      previous one the curve held its own price and at graduation the pool
 *      started from the opening level — every bit of price movement
 *      accumulated on the curve was reset.
 *   2. THE FOUNDER GETS WHAT THEY PAID FOR. The entire net payment after
 *      the fee turns into tokens at the opening price: 100 USDC -> 2.80% of
 *      supply, 500 USDC -> 14.00%. Not free, and measured: across all five
 *      payments the value at the opening price equals the net paid to
 *      within 0 raw units.
 *   3. NO HOLDER REWARD. That 0.30% went to pool depth: 0.40% -> 0.70%. The
 *      2% total did not change.
 *
 * THE HOOK ADDRESS ENDS IN 0xACC, NOT 0xA44
 *   v4 reads a hook's low bits and decides which callbacks it will receive,
 *   and this generation wants two more: beforeSwap and
 *   beforeSwapReturnsDelta. Without them the buy leg's tax was taken as
 *   TOKENS and went to depth, and $0.000000 reached the vault — measured.
 *   The collateral system was missing half the volume.
 */
export const PULSE = {
  /* Written from dagitim-pulse2.json, which denetim-dagitim-pulse2.js
     writes only after reading every one of these off the chain and
     checking the running code against the compiled artifact. Typing
     them by hand is how an interface ends up pointing at a contract
     that was superseded two rounds ago. */
  launchpad: "0xB6AC82F391FD6A7f59af804e3BE1C4753f832300",
  hook: "0xE6cc37D2467aAA05BED35D0E667170015E680Acc",
  fabrika: "0x065B318A624275bFF6833d0408DC572482BBF227",
  likiditeKasasi: "0x0a35cfe06Ead3858375690993280Aff1f9aFbF69",

  /* The 0.30% developer slice, under the FTHM DAO. Both the launchpad
     and the hook point here — verified from both ends, because a hook
     still pointing at the old fund would have piled the slice up
     somewhere the DAO cannot reach, with nothing reverting. */
  devPool: "0xA110b71c3f0748536f10C9e71A6E9F96999F6CD0",

  /* Shared with the retired generation and NOT redeployed. The registry
     fixes its chain set at construction and the one on chain points at the
     real remote factories on Ethereum and Base, verified byte for byte; a
     second registry would be a second answer to where a token's
     collateral goes. */
  kasaFabrika: "0x66a3ab2AC43445B91c61B98631Be14886ab45F40",
  yoneticiFabrika: "0xEcB57eDDf0830aa76ee8E5eCeFcf4A3F6ACE5a95",
  kayit: "0xaAD7Fb1bCeE3c78108f8d093fa3a0bFd6C87780c",

  /* Never deployed, and the reasons have not changed. */
  oracle: null,
  varlikKayit: null,
  router: null,
  geriAlimRobotu: null
};

/* ---- THE MARKETPLACE, WRITTEN AND MEASURED BUT NOT DEPLOYED -----
 *
 * Pazar.sol is compiled and measured against Arc's real USDC inside an
 * eth_call (scripts/olc-pazar.js, 20 assertions: the 80/20 split to the
 * cent, a zero contract balance after the sale, and every gate driven
 * from the refusing side).
 *
 * It is NOT on mainnet, because the brief says to get approval before a
 * mainnet deployment. null here rather than a placeholder address: every
 * screen gates on canli(), so a null keeps the marketplace screens
 * honestly in "awaiting deployment" instead of pointing at nothing.
 */
export const PAZAR = {
  /* dagitim-pazar.json'dan. O kayit dagitim betiginin kendisi tarafindan
     yaziliyor ve ancak calisan kod derlenen kodla bayt bayt esit cikip
     iki degismez getter'dan okunduktan sonra yaziliyor. */
  pazar: "0x3b6fb718DC0529645B20F10CC3013f14af2Ad68E",
  /* Platform payinin gittigi adres — sozlesmede immutable. */
  isletme: "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0"
};

/* The split per sale. A constant in the contract, so it has no setter and
   cannot be changed. The number here is the copy the page quotes; the audit
   compares it against the deployed contract's own constant. */
export const PAZAR_KURAL = {
  platformPpm: 200000,
  gelistiriciPpm: 800000
};

/* Superseded, and named so a reader who finds one of these on chain
   knows why it is idle rather than assuming the site is stale.

   gelistiriciFonu is the one that matters: it still holds the shape of
   a developer fund, but its allocator is the operations wallet and the
   allocator is immutable, so the DAO could never have spent from it.
   That is why the slice was repointed and why this round happened. */
export const PULSE_EMEKLI = {
  launchpad: "0x993C3e9632BF07851b5088c229ef54295D99d56F",
  hook: "0xb7528154B82f4cAaf77F8BBbc2166F4f02958acC",
  likiditeKasasi: "0x2112c227173D2BF6Ff56f40Cb8Ea9812670fa8D5",
  gelistiriciFonu: "0x63e3C95fF9f78891F5e9F214346DC5eEA82f1a13",
  eskiLikiditeKasasi: "0x926325b92f959697F3e3f45d7E6535eC85AFB123"
};

/* ---- WHAT A LAUNCH COSTS AND WHAT IT BUYS ----------------------
 *
 * Read from the deployed launchpad's own constants, so a screen can state
 * them without a second copy that could drift.
 */
export const PULSE_KURAL = {
  asgariAlim: 100,          // USDC, the founder's buy
  azamiAlim: 500,
  asgariTeminat: 20,        // separate, and the holders' money
  launchUcretPpm: 20_000,   // 2,00%
  acilisMcap: 3_500,
  arz: 1_000_000_000,
  /* Every trade, both directions, whatever the router. */
  islemUcretPpm: 20_000,    // 2,00% total
  dilimler: [
    { ne: "The token's founder", ppm: 3_000 },
    { ne: "Developer pool", ppm: 3_000 },
    { ne: "Locked protocol liquidity", ppm: 5_000 },
    { ne: "Operations", ppm: 2_000 },
    { ne: "Pool depth", ppm: 7_000 }
  ],
  vergiAsgariPpm: 10_000,   // 1%, chosen once and never changeable
  vergiAzamiPpm: 50_000,    // 5%
  vergiVarsayilanPpm: 10_000,
  /* 99,00% in the pool's opening second, quartering every second, gone
     after five. Applies to BUYS only and never to the founder's own
     first buy — which is not a swap at all, so there is nothing to
     exempt. */
  snipeBasPpm: 990_000,
  snipeSuresi: 5,
  olculdu: "2026-10-11"
};

/* The retired generation's addresses, kept ONLY so they can be
   recognised. Nothing reads these to build a transaction.
   Why keep them: an address that disappears from the codebase is an
   address nobody can look up when it turns up in a block explorer, and
   these will keep turning up forever. */
export const EMEKLI = {
  /* First generation — curve, graduation, zero founder allocation. */
  egriLaunchpad: "0x23950C71D0dACF30320b869f3908FfAe7D875eB6",
  egriHook: "0x0B55FC926106C0472cbF7e0c40DC825100C34A44",
  egriFabrika: "0xCd898DBbc557c4d301AE0F84861B793e40dF245A",
  aciciFabrika: "0x9BE01aEDB8fd4fCeaA12ecdc7d0b826325dB8D8A",
  likiditeKasasi: "0x926325b92f959697F3e3f45d7E6535eC85AFB123",

  /* Second generation, FIRST ROUND. Retired after ten minutes, and the
     reason is worth keeping: its hook sent the 0,50% slice to the
     generation-1 liquidity vault, whose besle() refuses a new-generation
     token with BilinmeyenToken. Nothing would have reverted during a
     trade — the slice would have accumulated there unreachable. */
  pulseLaunchpadV1: "0x4A49e38816BC25f09BE3e0c51D4067340d203244",
  pulseHookV1: "0xb9D0869b32626559c6f9C282E605E11a1f6ccACc",

  neden: "None of them has a launch and none of them holds money — " +
    "measured. They cannot be deleted from the chain: there is no " +
    "selfdestruct, no owner and no pause, which is the design itself. " +
    "The only thing that can be done is to cut every pointer.",
  olculdu: "2026-10-11"
};

export const UZAK = {
  ethereum: {
    zincirId: 1, cctpDomain: 0,
    fabrika: "0x5928768E5f9339c24Ca1723B24c7F1e2bBf73473",
    havuzFiyat: "0x9e4bC111F0fec70Fb6F9b24b3F084750c5E94AD0",
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
  },
  base: {
    zincirId: 8453, cctpDomain: 6,
    fabrika: "0xC89eE170F0f78269Cba5ADF560645238c9976BE4",
    havuzFiyat: "0x5928768E5f9339c24Ca1723B24c7F1e2bBf73473",
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  }
};

/* RemoteCollateralVault'un yaratma kodunun hash'i. Uc zincirde de ayni
   ve Arc'in kaydi bunu kurucuda tutuyor: ayrisirsa ilk transfer hicbir
   yere iner. Denetim bunu her zincirin fabrikasina ayri ayri soruyor. */
export const UZAK_INIT_HASH = "0x7d184cc1e6bbb210b2fd8aca173f66023b92b5d0dfa37862177599e99af62da7";

/* The three fee destinations that are plain addresses rather than
   contracts. "isletme" is the operations sink; the interface calls it that
   and nothing else, here and on screen. */
export const HEDEFLER = {
  isletme: "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0"
};

/* The collateral menu. Produced by scripts/olc-besleyiciler.js from
   Chainlink's own reference directory and verified by
   scripts/olc-evren.js, which builds a real oracle and vault from exactly
   this list — so a token the contracts would reject cannot appear here.
   The feeds are PROXIES: an aggregator gets retired under its proxy and
   then answers a stale price with no error. */
export const TEMINAT_EVRENI = [
  {
    anahtar: "usdc",
    sembol: "USDC",
    ad: "USD Coin",
    token: "0x3600000000000000000000000000000000000000",
    ondalik: 6,
    besleyici: "0x84EA90AC252Dc437031461836DB5164219147905",
    besleyiciAdi: "USDC / USD"
  },
  {
    anahtar: "cirbtc",
    sembol: "cirBTC",
    ad: "Bitcoin (Circle)",
    token: "0x171a4217b86a807a64eb94757db6849fb4bdbaa0",
    ondalik: 8,
    besleyici: "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De",
    besleyiciAdi: "BTC / USD"
  },
  {
    anahtar: "weth",
    sembol: "WETH",
    ad: "Wrapped Ether",
    token: "0x128cc466b61f542da60c70e3aa11c10e19b84edb",
    ondalik: 18,
    besleyici: "0x50FCDD99D6762D1C170DC6A9111db944AEE6D364",
    besleyiciAdi: "ETH / USD"
  },
  {
    anahtar: "eurc",
    sembol: "EURC",
    ad: "Euro Coin",
    token: "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1",
    ondalik: 6,
    besleyici: "0x361b95c10b76Ca3f35C686d423e43A951755Bf23",
    besleyiciAdi: "EURC / USD"
  },
  {
    anahtar: "xaum",
    sembol: "XAUM",
    ad: "Tokenised gold",
    token: "0x178b01f61cbea1d2a5581fe1621be607835ec349",
    ondalik: 18,
    besleyici: "0xB27522566BE765c94D21BFA0A9a1e19934999AB2",
    besleyiciAdi: "XAUM Reference Rate"
  }
];

/* The launch economics, mirrored from the contracts so the interface can
   show a payment breakdown before anything is deployed. Every figure here
   is a `constant` in EgriLaunchpad.sol — if one is edited there and not
   here, scripts/denetim-sayfa-sabitleri.js fails. A screen that quotes a
   fee the contract does not charge is worse than a screen that quotes
   nothing. */
export const EKONOMI = {
  arz: 1_000_000_000,
  acilisMcap: 3_500,
  acilisFiyat: 0.0000035,
  esik: 6_000,
  asgariOdeme: 100,
  asgariTeminat: 20,
  ucretPpm: 20_000,          /* 2.00% of the launch payment */
  vergiAsgariPpm: 10_000,    /* creator picks 1%..5% */
  vergiAzamiPpm: 50_000,
  vergiVarsayilanPpm: 10_000,
  /* Trading fee table, in ppm of the trade — PulseHook's own constants.
   *
   * THIS TABLE CLAIMED A SLICE THE LIVE HOOK DOES NOT PAY
   *   It listed stake: 3_000 ("0,30% to stakers") and derinlik: 4_000.
   *   The deployed PulseHook has FIVE slices and no staker one:
   *
   *     kurucu       3.000   0,30%
   *     gelistirici  3.000   0,30%
   *     likidite     5.000   0,50%
   *     isletme      2.000   0,20%
   *     derinlik     7.000   0,70%  = FEE_PPM - the four above
   *
   *   The slice audit passed anyway, because it read EgriHook.sol — the
   *   RETIRED generation, which does have STAKE_PPM = 3.000. So the page
   *   was checked against a contract that no longer prices anything.
   *
   *   That made two numbers false at once, and the direction matters:
   *   the site told FTHM stakers they earn 0,30% of every trade while
   *   the live hook sends them nothing, and understated the locked
   *   depth slice by 0,30%. The audit now reads PulseHook.sol.
   *
   *   What stakers DO earn is the FTHM emission (SALIM_PPM per 7-day
   *   period from the stake contract's own budget) — not a cut of
   *   trades. Those are different things and only one of them exists. */
  dilimler: {
    kurucu: 3_000,
    gelistirici: 3_000,
    likidite: 5_000,
    isletme: 2_000,
    derinlik: 7_000
  },
  /* Whale shield. */
  kalkanEsikPpm: 5_000,      /* 0.5% of circulating, per pool per block */
  kalkanTavanPpm: 30_000,    /* at most 3% extra */
  /* Vault limits. */
  islemTavaniBps: 200,       /* 2% of the reserve may be spent per call */
  donemTavaniBps: 1_000,     /* 10% may LEAVE per window */
  donemBlok: 7_200,          /* ~1.01 hours at Arc's measured 0.507 s/block */
  odulPayiBps: 2_000         /* keeper keeps 20% of the captured discount */
};

/** Is a contract address present, so a view may act against it? */
export function canli(adres) {
  return typeof adres === "string" && /^0x[0-9a-fA-F]{40}$/.test(adres);
}

/** Does the whole launchpad exist yet? Used by every view that writes. */
export function launchpadCanli() {
  return canli(PULSE.launchpad) && canli(PULSE.hook);
}
