# Revenue and FTHM value accrual — research and concrete design

Date: 2026-10-16 · Status: research + design only. No transactions sent, no code edited, `.env` not read.
Repo context read: `hafta-plani.md`, `cok-zincir.md` (log), `sistem.md`, `fthm-iki-zincir.md`,
`taban-katmani.md` §7b, `genesis-ekonomi-onerisi.md`, `genesis-atlas-plan.md`, `ADRESLER.md`,
`dagitim-fathom.json`, `dagitim-yonetisim.json`, and the constants of `PulseHook.sol`,
`PulseLaunchpad.sol`, `Stake.sol`, `Governor.sol`, `Vesting.sol`.

---

## 0. TL;DR

1. **As built today, no launchpad money ever touches FTHM.** The 2% PulseHook fee, the launch fee
   and GENESIS income have no path to FTHM. The only FTHM paths are the PulseSwap 5%-of-0.10% bucket
   (0.005% of volume) and the planned Taban bridge share, which pays stakers in USDC.
2. **The "1% to the platform" is mostly not cash.** 0.50% is locked forever as liquidity in each
   launch's own pool (`PulseLikiditeKasasi.besle`). 0.30% goes to `DevPool`, which only the DAO can
   spend, and the DAO cannot act because nobody has staked. The only spendable cash is the 0.20%
   operations slice, which goes to an EOA.
3. **FTHM is tiny and thin.** It opened at a $15k FDV with a one-sided ladder and no dollars in it
   (`dagitim-fathom.json`); `fthm-iki-zincir.md` measured real exit depth at about $4. Even small,
   rule-based buy flow is large compared with that. Because the pool's liquidity is locked forever,
   every buyback dollar also stays in the pool as permanent bid depth.
4. **Overhang:** 50M founder FTHM is already liquid, 50M more vests over 12 months (≈4.2M/month),
   and `Stake` releases ≈27M FTHM in year one (0.1332%/week of 400M). Circulating float bought out
   of the ladder is close to zero, so these flows dominate.
5. **Ranked recommendation** (details in §4 and §5):
   1. A permissionless FTHM buy-and-burn sink, with existing cash flows pointed at it.
   2. Founder supply re-lock plus a public unlock calendar (zero code, biggest credibility gain).
   3. Stake-for-access for GENESIS/Atlas and pro features (utility demand, no yield promise).
   4. Next-generation fee constants on the chains and contracts not yet deployed.
   5. A promotion ("boost") marketplace with its proceeds going to the sink.
   6. An FTHM floor vault (rising, redeemable USDC backing).
   7. Keep USDC staker yield small and unadvertised, and send new flows to burn instead.

None of this matters without volume. The 2026-10-15 weekly measurement showed **0 launches, 0 trades
and $0 volume across all 9 chains**. Every number below is a scenario, not a forecast.

---

## 1. What the market taught (2025–2026)

### 1.1 Buybacks: what worked and what did not

| Protocol | Mechanism | Result | Lesson |
|---|---|---|---|
| **Hyperliquid** | Assistance Fund puts ~97–99% of protocol fees into open-market HYPE buys. From Oct 2026 it also uses ~90% of cost-adjusted USDC-reserve earnings. Buying runs at ~7% of market cap a year. | ~44.4M HYPE bought by June 2026 (~$2.2B). HYPE beat BTC. | Works because revenue is huge and real ($784M/yr fees), buys are automatic, and the product grows. Even so, Tokenomist counts unlocks of 119M against 14.3M burned, so supply still grows ~47%/yr. Demand is doing the work, not net deflation. |
| **pump.fun** | ~50% of daily revenue buys and burns PUMP, locked in until Apr 2027. A one-off burn of ~36% of circulating supply in Apr 2026. | $350M+ spent and ~33% of circulating supply removed, yet PUMP sat ~81% below ATH and under its $0.004 ICO price. It recovered later in 2026. | Insiders sold into the buybacks, and a 41% unlock was due Jul 2026. **Buybacks cannot outrun unlocks plus insider supply.** |
| **Raydium** | 12% of AMM fees and 25% of LaunchLab fees go to daily RAY buybacks. | One of only 2 of 11 tokens with real net supply reduction (~20.3M bought vs ~2M unlocked a year). Buyback wallet holds ~31% of circulating supply. | Small but **structural, continuous, and larger than unlocks**. A launchpad feeding its parent token is a direct precedent for us. |
| **Jupiter** | 50% of fees go to the Litterbox Trust (buy and hold). A proposal would raise it to 70%. | Co-founder: $70M+ spent "with little impact on price". JUP fell ~55% year on year. | Buying and holding is not burning. Unlocks were bigger than the buys. |
| **Uniswap** | "UNIfication": fee switch on, 100M UNI burned from treasury, ongoing TokenJar/Firepit burn. | Burn run-rate above $250M/yr by Sep 2026, but UNI still printed a cycle low. | Market-wide beta and valuation can swamp a burn. A burn helps but is not sufficient. |
| **GMX** | 27% of fees buy back GMX and 63% go to LPs. Since Mar 2026, bought GMX is held until GMX > $90 instead of being paid out. | Steady, modest buying (~$3.1M Mar–Sep 2026). | "Real yield" shifted toward buybacks. Even the classic real-yield protocol stopped paying out directly. |
| **dYdX** | 75% of net fees buy back and stake DYDX. Staking previously paid USDC. | — | The same direction: buy the token instead of paying a dividend. |
| **Aerodrome / Velodrome** | ve(3,3): 100% of a pool's fees go to the veAERO voters who direct emissions to it, plus bribes. Merging into "Aero" (Oct 21 2026). | $260M in 52 weeks before the merger. Revenue is now approaching emissions. | Works for a DEX that sells *emissions* to protocols that need liquidity. Needs large emissions and outside bribers. **Not a fit** for a $15k-FDV launchpad token. |
| **Virtuals** | 1% fee on agent-token trades (70% to the creator, 30% to the treasury) plus buyback and burn. | ACP fees fell 98.6% in one month once incentives ended (Mar → Apr 2026). | Incentive-driven "revenue" disappears. Only count fees from organic usage. |
| **Zora** | 1% fee: 0.5% to the creator, 0.2% to the market, 0.2% platform referral, 0.04% trade referral. ZORA buybacks were only planned for Q4 2026. | The token had no direct accrual for most of its life. | Creator share drives usage. Token accrual added late is weak. |
| **Clanker / bonk.fun** | Clanker: a 0.2% protocol fee funds CLANKER buys (~14% of supply bought for $8M). bonk.fun: 30% of its 1% fee buys BONK. | Both are launchpads feeding a parent token. | **The direct template for ARC PULSE → FTHM.** |

**Cross-study findings.**
- Tokenomist (11 tokens): only BNB and RAY actually shrink supply. Buy-and-hold (JUP) and
  buy-and-redistribute (ASTER) cut nothing.
- Announcement effects fade. At +30 days only OKB and AAVE, the two with real action behind the
  headline, still beat BTC.
- Bill Hsu: only AAVE, HYPE and SKY of 10 buyback tokens beat BTC during their buyback windows.
- Keyrock (16,000 unlocks): 90% of unlocks push price down. Prices fall from about 30 days before
  the unlock. **Team unlocks are the worst (~−25%).** Unlocks of 5–10% of supply hit about 2.4×
  harder than smaller ones.

### 1.2 What makes a platform token investable (synthesis)

1. **Revenue is real and organic**, not driven by incentives (the Virtuals ACP collapse).
2. **Accrual is programmatic and verifiable.** A contract does it on a rule, not a team decision
   (HYPE, RAY, UNI Firepit).
3. **Burn, not hold.** Supply actually falls (Tokenomist).
4. **Net of unlocks and emissions, the flow is positive.** Buyback dollars per year must exceed
   unlocked tokens × price (PUMP, JUP, HYPE).
5. **Insiders cannot sell into the program** (the PUMP 0xSweep allegation). Team allocations should
   be locked and visible.
6. **The token is needed to use the product:** stake-for-access, fee discounts, deployer stakes
   (Hyperliquid: 500k HYPE stake for a HIP-3 market; 5–40% fee discounts for staking).
7. **Liquidity exists.** A buyback into a $4-deep pool is mostly slippage, and an exit is impossible.

### 1.3 Regulatory red lines

- **SEC staff FAQs, 25 Sep 2026** (staff view, no legal force):
  - On a *functional* network, announcing a buyback of a non-security token for treasury
    management, supply reduction or protocol burns is **not** a promise of essential managerial
    effort.
  - On an *unfinished* network, **presenting a buyback as yield or return for holders** can create
    an investment contract.
  - Funding development of a functional network is not "managerial effort" either.
  - Staking receipt tokens on non-security assets are "digital tools".
- **What this means for us:**
  - Frame burns as supply policy. Never as "returns", "APY", "dividends" or "passive income".
  - **USDC distributions to stakers are not what the FAQ covers.** Pro-rata USDC paid out of a
    company's revenue is the closest thing to profit-sharing under Howey, and is the riskiest
    mechanism we have.
  - Do not announce price targets. Do not run buybacks at the team's discretion (that is a timing /
    insider problem). Founder wallets should not trade while the sink buys.
- **Existing project rule** (`hukuk-ve-odeme.md` §3b, plan item C3): US users are excluded and the
  stock-backed product was dropped. Keep the US exclusion for any FTHM yield feature.
- **EU / MiCA:** offering a crypto-asset to the EU public, or getting it admitted to trading, needs
  a notified white paper. CASP authorization is mandatory from 1 Jul 2026. A CEX listing of FTHM
  would trigger the white paper.
- **Turkey** (founder jurisdiction): the 2024 CMB crypto-asset law (No. 7518) licenses service
  providers. Have counsel confirm that a self-operated platform taking fees is not a CASP activity.
  Not researched in depth here.

---

## 2. Where the money goes today (from the code)

### 2.1 Fee map

| Flow | Rate | Recipient (immutable) | Touches FTHM? |
|---|---|---|---|
| PulseHook trade fee: creator | 0.30% | the token's creator | no |
| PulseHook trade fee: depth | 0.70% | stays in the launch's ladder | no |
| PulseHook trade fee: dev | 0.30% | `DevPool` (spent only by the FTHM Governor) | only indirectly, if the DAO ever votes to buy FTHM |
| PulseHook trade fee: protocol liquidity | 0.50% | `PulseLikiditeKasasi` → `besle()` locks it in **that launch's** pool | no |
| PulseHook trade fee: operations | 0.20% | EOA `0x8918…11D0` | no |
| Launch fee | 2% of the founder's first buy ($100–$500 → **$2–$10 per launch**) | 30% DevPool / 50% liquidity vault / 20% ops (`_ucretiDagit`) | no |
| Collateral tax 1–5% | — | that token's own vault | no |
| PulseSwap (Aptos/Sui, Solana rehearsed) | 0.10% protocol | 5% buys FTHM → sent to a fixed burn address; 95% platform | **yes, 0.005% of volume** |
| GENESIS / `AtlasAbonelik` | — | 70% founder / 30% DevPool | no |
| Taban bridge (prototype, not in production) | 0.10% of bridged dollars; $5 opening | 40% / 50% → `Stake` as **USDC** (`FthmPayi.supur`) | USDC to stakers, no burn |
| FTHM's own Arc pool | fee 0 | — | the pool earns nothing |

### 2.2 Scenario: $100k/day PulseHook volume, $100k/day PulseSwap, 10 launches/day at $200

| Line | $/day | Spendable cash? | To FTHM |
|---|---|---|---|
| Creator 0.30% | 300 | creator | 0 |
| Depth 0.70% | 700 | locked | 0 |
| DevPool 0.30% | 300 | only by DAO vote (no stakers today → frozen) | 0 |
| Liquidity vault 0.50% | 500 | no, locked into launch pools | 0 |
| Ops 0.20% | 200 | **yes** | 0 |
| Launch fees | 40 | 8 ops / 12 DevPool / 20 liquidity vault | 0 |
| PulseSwap protocol | 100 | 95 | **5** |
| **Total "platform"** | **~1,140** | **~303 spendable** | **5 (~$1.8k/yr)** |

At $1M/day, multiply by 10. Even then FTHM receives about $50/day.

### 2.3 Things in the current design that weaken FTHM

1. **No fee path to FTHM on the main product.** This is the core problem, and it is visible on
   chain to anyone who reads `PulseHook`.
2. **Stake emission is a time clock, not revenue.** It releases ~27.3M FTHM in year one (2.7% of
   supply), regardless of revenue. To its credit it pauses while nobody stakes
   (`totalStaked == 0` → the schedule slides). This is the same shape of mistake the ALP postmortem
   (#1) names, only smaller and slower.
3. **Founder supply:** 50M (5%) is liquid now, and 50M vests over 12 months. Against a near-zero
   float this is the dominant overhang, and per Keyrock, team unlocks are the worst kind.
4. **Liquidity is about $4 deep.** No buyer can enter size and no holder can exit. The Robinhood and
   other-chain FTHM pools need real dollars on both sides (`fthm-iki-zincir.md` risk 4).
5. **The FTHM pool fee is 0** and the Arc hook `0x…8A44` is immutable with no beforeSwap. The pool
   that sets FTHM's price earns nothing for FTHM.
6. **Governance capture after the guardian expires** (365 days → ~Oct 2027):
   - `MIN_OY_GUCU` is 50k FTHM, which is ≈$0.75 at the opening price.
   - Quorum is 10% of a tiny staked total.
   - Whoever stakes first can direct `DevPool`. Until expiry only the founder's guardian veto stands
     in the way, and that is itself a centralization flag.
7. **GENESIS revenue is 70% to the founder** and Atlas API access explicitly "does not require
   FTHM". The newest product adds no FTHM demand.
8. **Taban §7b pays stakers in USDC.** That is the mechanism the SEC FAQ does not protect, and
   Hyperliquid, GMX and dYdX have all moved away from it.
9. **Fragmentation:** 11 chains and 4 codebases, with FTHM liquidity on Arc only. Every buyback
   from another chain pays a CCTP or LayerZero hop, so it has to be batched.

---

## 3. Design principles for our mechanisms

- **Burn, do not distribute,** wherever we have a choice. It is regulator-friendlier, it cuts
  supply, and, because FTHM's Arc liquidity is permanently locked, **every buyback dollar stays in
  the pool as bid depth forever**. That is a one-sided floor we get for free.
- **Ownerless, rule-based, permissionless trigger,** matching the house style: no owner, no
  setter, `herkes tetikler` (anyone can trigger).
- **Do not touch deployed immutable contracts.** Hook into (a) the EOA-held ops slice, (b) the
  DAO-held `DevPool`, (c) contracts **not yet deployed** (Solana launchpad and PulseSwap, nesil3
  `TeminatKasasi`, Taban production, `.pulse` names in F14, a new `AtlasAbonelik`), and (d)
  off-chain gating that reads `Stake.stakedOf`.
- **Net-flow test:** at any proposed rate, buyback dollars per year must exceed (emission +
  vesting) × price over a realistic price range.

---

## 4. Mechanisms

All numbers use the §2.2 scenario ($100k/day PulseHook volume) unless stated otherwise. FTHM
reference price is the $0.000015 opening price ($15k FDV). Read the live price before deciding.

### M1. `FthmYakici`: permissionless buy-and-burn sink, with existing flows routed to it

**Money flow.**
1. Any USDC sent to `FthmYakici` on Arc can be spent by anyone through `yak()`.
2. `yak()` swaps up to a capped amount per call in the FTHM/USDC v4 pool. The cap is, for example,
   $25 or 2% of measured pool depth, with at most one call per hour.
3. The bought FTHM goes straight to `0x…dEaD`. Arc FTHM has no `burn`; the dead address is the
   burn.
4. On other chains, a twin `FthmYakiciUzak` batches USDC and sends it to Arc:
   - CCTP chains: CCTP burn with mint recipient = `FthmYakici` on Arc. This is the same pattern
     `FthmPayi.supur()` already proved on mainnet (Base → Arc Stake, 16 Oct).
   - Robinhood (USDG) and BNB: via `FTHMKapi` (`alVeGonder`), buying on the local FTHM pool and
     delivering to dead.
   - Move chains: PulseSwap's existing FTHM bucket already does exactly this. Keep it.

**What it hooks into.**
- (a) The **ops slice** (0.20% plus 20% of launch fees) goes to EOA `0x8918`. The founder commits
  publicly to forward X% weekly with a public script (`scripts/…`). Every forward is an on-chain
  transfer to `FthmYakici`, so it can be audited even though it cannot be enforced on the deployed
  chains.
- (b) For **every not-yet-deployed** launchpad (Solana launchpad, nesil3, Taban production),
  `isletmeKasasi` becomes an immutable `GelirBolucu` splitter (e.g. 75% ops / 25% `FthmYakici`),
  so it *is* enforced.
- (c) A DAO proposal to stream part of `DevPool` to `FthmYakici`, once staking exists.

**Effect** (25% of the ops slice + launch-fee ops share + PulseSwap bucket):
- ≈ $50 + $2 + $5 = **$57/day ≈ $21k/yr**, which is above FTHM's entire opening FDV.
- Net-flow test: year-one new supply is 27M emission + 50M vesting = 77M FTHM. $21k/yr absorbs all
  of it at any price below **$0.00027** (FDV ≈ $270k). Absorbing the emission alone works up to
  ≈ $0.00077 (FDV ≈ $770k).
- Above those prices the flow has to grow with volume. At $1M/day PulseHook volume the thresholds
  are about 10× higher.
- Every dollar spent also stays as locked bid depth in the Arc pool. After year one, about $21k of
  permanent buy-side depth, versus about $4 today.

**Build effort:** small.
- One ~3–5 KB contract per EVM chain, reusing `FTHMKapi`, `ZincirTablosu` and the `FthmPayi`
  CCTP code.
- A splitter of ~1 KB.
- Forge tests against a real PoolManager fork.
- About 1–2 days including the suite.

**Risks.**
- Sandwiching on a thin pool. Mitigate with a small per-call cap, the rate limit, and a `minOut`
  from the pool's own spot price with a slippage bound.
- The ops forward is a promise on deployed chains. Only new deployments enforce it.
- Buying into a one-sided ladder moves price fast. Good optics, but it can draw momentum sellers
  holding founder or emission tokens. See M2.

### M2. Supply discipline: founder re-lock and a public unlock calendar (zero contract risk)

**Money flow:** none. Founder actions only.
1. Move the 50M liquid founder FTHM into a new `Vesting` with the same audited bytecode: immutable
   beneficiary, no rescue. Proposed terms: 24 months, 6-month cliff. Alternatively burn part of it.
2. Re-lock monthly claims from the existing 12-month `Vesting` `0x3869…1E14`.
3. Publish on the site a calendar, read from chain, of: `Vesting.unlocked()`, `Stake.emisyonKalan`,
   weekly `EmisyonSalindi`, burned FTHM at dead, and `FthmYakici` totals.
4. Commit that no founder wallet sells while `FthmYakici` is active.

**What it hooks into:** `Vesting.sol` (redeploy with new args), `Stake` events, the site analytics
(`docs/veri/analitik.json`).

**Effect:**
- Removes the single largest overhang (100M ≈ 10% of supply, about 20% of the 500M market
  allocation).
- Keyrock data says team unlocks are the most price-negative event; PUMP shows buybacks fail when
  insiders sell into them.
- Cost: $0 and about half a day.

**Risks:** founder liquidity for operations. Mitigate with the ops cash slice, not token sales.

### M3. Stake-for-access: GENESIS / Atlas and pro features gated by staked FTHM

**Money flow:** no new money. Demand for FTHM comes from locking it.
1. The Atlas API server (`scripts/atlas-api.js`, which already verifies wallet signatures and reads
   payments from chain) adds one check: `Stake.stakedOf(wallet)`.
2. Tiers, for example:
   - stake ≥ T1 → free quota of N calls/day;
   - stake ≥ T2 → higher rate limit plus advanced Atlas layers;
   - USDC subscription stays available for non-holders.
3. A **new** `AtlasAbonelik2` accepts payment in FTHM at a 20% discount; the FTHM is sent to dead.
   The existing contract, with its fixed 70/30 USDC split, stays live for USDC.
4. Optionally, site "pro" features (launch alerts, wallet labels, GENESIS risk score per launch)
   use the same check.

**What it hooks into:** `Stake` `0xAbD3…d2de` (unchanged, read-only), the Atlas server, a new
subscription contract.

**Effect:**
- Example: 40 API users × 2M FTHM staked = 80M FTHM locked (8% of supply).
- More staked FTHM also raises the cost of governance capture (§2.3 item 6). This is the cheapest
  fix for that.
- Revenue unchanged or better: users who would not pay USDC still bring demand.

**Build effort:** server check ~0.5 day. `AtlasAbonelik2` ~1 day.

**Risks.**
- Thresholds in fixed FTHM become trivial or impossible as price moves. Re-set them by DAO vote, or
  use thresholds in USD from a time-weighted pool price.
- Staking currently also earns the FTHM emission, so access-stakers dilute other stakers. That is
  acceptable.
- Never market it as yield.

### M4. Next-generation fee constants: put FTHM into contracts not yet deployed

**Money flow.** Only for code not yet on mainnet:
- **Solana PulseSwap** (rehearsed, not deployed): raise the FTHM share of the 0.10% protocol fee
  from 5% to **25%**.
- **Solana launchpad, nesil3 `TeminatKasasi` launch fee, Taban production:** carve **0.10% of the
  2% trade fee** into `FthmYakici`.
  - Take it from *depth* (0.70 → 0.60), so creator and platform cash stay unchanged; depth is the
    least visible slice.
  - Alternatively take it from the 0.50% liquidity vault, which today produces no cash.
- **`.pulse` names (F14):** the fee is already "5% FTHM". Make it 100% paid in FTHM, or 50% burned.

**What it hooks into:** constants in `solana/pulse-swap`, `solana/pulse-launchpad`,
`contracts/nesil3`, `contracts/taban`.

**Effect:**
- 0.10% × $100k = **$100/day ≈ $36.5k/yr per $100k/day** of volume on those chains.
- The Solana PulseSwap change takes FTHM from $5 to $25 per $100k.

**Build effort:**
- Constant changes plus re-running suites (Solana LiteSVM 4/4, Move suites, forge).
- About 1 day.
- Move packages on Aptos/Sui are already immutable, so they stay at 5% unless a v3 is deployed
  (that requires re-registering adapters).

**Risks.**
- A different fee schedule per chain or generation. The site must show it per chain (it already
  shows per-chain tables).
- Lower depth share means slightly thinner launch pools.

### M5. Promotion ("boost") marketplace, proceeds to the sink

**Money flow.**
1. A new ownerless `OneCikar` contract on each chain: `boost(launchId, slots)` takes USDC at a
   fixed schedule, or FTHM at a 25% discount (burned).
2. It emits an event. The site ranks a clearly labelled **"Promoted"** row on the explore page for
   a fixed time window.
3. Split of USDC proceeds: 50% `FthmYakici`, 50% ops. Safety badges (floor, locked liquidity,
   creator share, GENESIS risk flags) are **never** overridden by payment.

**What it hooks into:** site explore/leaderboard screens (`analitik.json`) and `FthmYakici`.

**Precedent:** DEX Screener boosts ($99 per 10 boosts up to $3,999 per 500) bring in about
$32M/yr by DeFiLlama's trailing count.

**Effect:**
- Revenue tracks launch count, not just volume.
- 5 boosts/day × $20 = $100/day, which **doubles the platform's spendable cash** at our scenario
  scale. $50/day to the sink.

**Build effort:** contract ~0.5 day, site row ~0.5 day (the site is "on hold" per F11, so this
waits for the user).

**Risks.**
- Paid promotion of memecoins is a consumer-protection exposure. Label it, add a disclaimer, keep
  the US exclusion.
- Promoted rugs damage the brand. Require a minimum floor or collateral before a token can be
  boosted.

### M6. FTHM floor vault: rising, redeemable USDC backing

**Money flow.**
1. New ownerless `FthmTabanKasasi` on Arc, with the same rule as `CollateralVault`:
   `payout = backing × amount / effectiveSupply`.
   - `effectiveSupply = 1e9 − balanceOf(dead) − balanceOf(vault)`. Total supply never grows: no
     mint, and emission and vesting come from pre-minted balances. So the per-token floor can only
     rise.
2. Funding: a share of `FthmYakici` inflow, e.g. 50% of it goes to backing instead of buying.
3. A holder can always burn FTHM for the floor. When the market is below the floor, arbitrage buys
   and redeems, which is itself a buy-and-burn.

**What it hooks into:** `FthmYakici` / `GelirBolucu`; reuses the audited `CollateralVault` logic
and the site's existing "floor" vocabulary (`taban`).

**Effect:**
- $28/day (half of M1's $57) ≈ $10k/yr → floor ≈ $0.00001 per FTHM after a year, about 70% of the
  opening price.
- **A hard, verifiable number the site can show,** which is the project's brand ("floor only
  rises").

**Build effort:** ~1 day (it is a copy of the existing kasa rule plus tests). Low technical risk.

**Risks.**
- **Regulatory:** a redemption right against a pool funded by company revenue is closer to a claim
  on the business than a burn is. **Lawyer before launch.** This is why it ranks below M1.
- It competes with M1 for the same dollars.
- Unclaimed emission and vesting tokens also redeem later, at the higher floor. That is correct
  pro-rata, but a large holder can drain backing when the market is below the floor. This is
  intended, but should be stated.

### M7. Staker USDC yield: keep it small, honest, and unadvertised

**Money flow:** existing `Stake.dagit()` already distributes any USDC sent to it. The Taban
prototype (`FthmPayi`) routes 40% of bridge fees and 50% of opening fees there.

**Recommendation.**
- In Taban production, change `FthmPayi`'s target from `Stake` to `FthmYakici`, or split 50/50.
- If USDC yield stays:
  - never display an APY;
  - call it a "fee rebate to participants who secure governance";
  - keep the US exclusion.
- This follows Hyperliquid (all buyback), GMX (hold instead of payout, Mar 2026) and dYdX (75% to
  buy-and-stake).

**Effect:** at $100k/day bridged, 0.10% × 40% = $40/day → about $14.6k/yr to burn instead of
dividends.

**Build effort:** one address constant in undeployed code.

**Risks:** fewer people stake without visible yield. M3 (access) replaces yield as the reason to
stake.

### (Considered and rejected)

- **ve(3,3) / vote-escrow emissions:**
  - It needs large emissions and outside bribers.
  - Our emission is fixed in `Stake`, and our pools are launch pools with immutable hooks, not
    gauges.
  - It would add an unreplaceable lock contract, which is exactly the ALP postmortem's
    unfixable-contract mistake.
- **A fee on the FTHM pool itself:** the hook is immutable with fee 0. A second FTHM pool with a
  fee would split already-$4 liquidity.
- **FTHM as the quote asset for launches:** the floor would become volatile and the "USDC floor"
  brand would break.

---

## 5. Ranked recommendation

Ranking weighs value accrual × verifiability × effort × regulatory safety.

| Rank | Mechanism | Cash or FTHM effect at $100k/day | Effort | Main risk |
|---|---|---|---|---|
| **1** | **M1 `FthmYakici` buy-and-burn sink** + 25% of ops slice + PulseSwap bucket routed to it | ~$57/day ≈ $21k/yr burned; out-burns all new supply below ~$270k FDV; builds permanent bid depth | 1–2 days | thin-pool MEV; ops forward is a promise on deployed chains |
| **2** | **M2 Founder re-lock + public unlock/burn calendar** | removes 100M (10%) overhang; credibility | ½ day, $0 | founder liquidity |
| **3** | **M3 Stake-for-access** (Atlas/GENESIS + pro features; FTHM-paid subscription burned) | locks supply (e.g. 80M); fixes cheap governance capture | 1–1.5 days | threshold calibration |
| **4** | **M4 Next-gen constants** (0.10% of trade fee → sink on undeployed launchpads; Solana PulseSwap 5% → 25%; `.pulse` fees in FTHM) | +$100/day per $100k volume on those chains | ~1 day | per-chain fee differences |
| **5** | **M5 Promotion marketplace** (USDC or FTHM, 50% → sink) | ~$100/day new cash at 5 boosts/day; scales with launches | 1 day (+ site, on hold) | consumer-protection / brand |
| **6** | **M6 FTHM floor vault** (half of sink inflow → redeemable backing) | floor ≈ 70% of opening price after 1 yr | ~1 day | **needs legal review** |
| **7** | **M7 Redirect Taban `FthmPayi` from USDC dividends to burn** | ~$15k/yr per $100k/day bridged | trivial | less staking incentive (covered by M3) |

**Do first, this week:** M2 (no code), then M1 with the splitter, then M3's server check. Together
they give FTHM a fee path, a supply story and a reason to hold, in about three days of work and
with no change to any deployed immutable contract.

**Do not** market any of it as yield or returns. Describe burns as supply policy executed by an
ownerless contract, show the chain data, and nothing more.

---

## 6. Sources

Market:
- pump.fun buybacks and price: [Yahoo Finance — $350M buybacks fail to lift price](https://finance.yahoo.com/markets/crypto/articles/pump-fun-350-million-pump-210555552.html) · [FXStreet — 36% burn, 50% revenue buyback](https://www.fxstreet.com/cryptocurrencies/news/pumpfun-burns-36-of-circulating-pump-supply-unveils-50-revenue-buyback-program-202604290053) · [KuCoin — $300M buybacks](https://www.kucoin.com/news/articles/pump-fun-surpasses-300-million-in-pump-token-buybacks-a-deep-dive-into-the-platform-s-deflationary-strategy) · [WalletInvestor — $200M in 2026](https://walletinvestor.com/news/crypto-news/pump-funs-pump-token-nears-0-006-as-its-buybacks-pass-200-million-in-2026/)
- pump.fun dynamic fees: [Blockworks — dynamic fee model](https://blockworks.com/news/pumpdotfun-fee-model) · [CoinMarketCap — Project Ascend](https://coinmarketcap.com/academy/article/pump-token-project-ascend-launches-10x-creator-rewards)
- Hyperliquid: [crypto.news — inside Hyperliquid's buyback](https://crypto.news/why-hype-is-different-inside-hyperliquids-buyback/) · [AMINA — HYPE buyback/staking](https://aminagroup.com/research/hyperliquid-hype-etf-buyback-staking-yield-institutional-access-2026/) · [CryptoTicker — USDC earnings fund buybacks](https://cryptoticker.io/en/hyperliquid-buyback-usdc-earnings/) · [Hyperliquid Docs — HIP-3](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals) · [Dwellir — fee tiers / staking discounts](https://www.dwellir.com/blog/hyperliquid-fees-explained)
- Raydium: [Raydium Docs — buybacks](https://docs.raydium.io/ray/ray-buybacks) · [Solana Compass — buyback pace](https://solanacompass.com/news/raydiums-ray-buyback-pace-hits-its-highest-level-since-early-2026-with-150k-acquired-in-three-days) · [Memeburn — 30% of supply](https://memeburn.com/raydium-ray-buyback-protocol-revenue-analysis/)
- Jupiter: [Jupiter Research — Litterbox 50→70%](https://discuss.jup.ag/t/increase-the-litterbox-buyback-allocation-from-50-to-70/40136) · [The Block — 50% of fees to buybacks](https://www.theblock.co/post/337071/jupiter-spikes-40-as-founder-says-50-of-fees-will-go-to-token-buybacks)
- Aerodrome / Velodrome: [KuCoin — merge into Aero](https://www.kucoin.com/news/flash/aerodrome-and-velodrome-merge-into-unified-protocol-aero) · [Tokenomics.com — AERO captures 100% of fees](https://tokenomics.com/articles/aerodrome-tokenomics-how-aero-captures-100-of-protocol-fees) · [CryptoBriefing — merger rally](https://cryptobriefing.com/aerodrome-aero-rallies-velodrome-merger/)
- Virtuals: [ChainWard — ACP fees 2026](https://chainward.ai/decodes/virtuals-top-dog) · [Datawallet — Virtuals](https://www.datawallet.com/crypto/what-is-virtuals-protocol)
- Zora: [Zora Docs — coin rewards](https://docs.zora.co/coins/contracts/rewards) · [CoinMarketCap — ZORA updates](https://coinmarketcap.com/cmc-ai/zora/latest-updates/)
- GMX: [GMX Docs — rewards](https://docs.gmx.io/docs/tokenomics/rewards/) · [Coin Bureau — GMX review 2026](https://coinbureau.com/review/gmx-review) · [DefiLlama — GMX](https://defillama.com/protocol/gmx)
- dYdX: [AMBCrypto — 75% buyback](https://ambcrypto.com/dydx-community-approves-massive-buyback-increase-to-75-of-protocol-revenue/)
- Uniswap: [The Defiant — UNIfication passes](https://thedefiant.io/news/defi/uniswap-passes-unification-fee-switch-proposal) · [Bitget — fee switch live, UNI at cycle low](https://www.bitget.com/news/detail/12560605397905) · [Block Editorial — burns](https://blockeditorial.com/uniswap-fee-switch-turns-protocol-revenue-into-permanent-uni-burns/)
- Clanker / bonk.fun: [crypto.news — Clanker ecosystem fund](https://crypto.news/clanker-launches-ecosystem-fund-to-recycle-fees-into-creators-and-community/) · [Bitget Academy — bonk.fun](https://web3.bitget.com/en/academy/what-is-letsbonk-fun-complete-guide-to-the-top-solana-meme-coin-launchpad) · [Coin Bureau — best memecoin launchpads 2026](https://coinbureau.com/analysis/best-memecoin-launchpads)
- Buyback effectiveness: [Tokenomist — 11 tokens, only 2 shrink supply](https://tokenomist.ai/research/buyback-and-burn-explained-what-they-are-who-is-doing-them-and-whether-they-actually-work) · [KuCoin — $640M buybacks in 2026](https://www.kucoin.com/news/flash/crypto-token-buybacks-surge-to-640m-in-2026-spark-debate-on-value-creation) · [CryptoTimes — 90% led by 2 projects](https://www.cryptotimes.io/2026/08/31/crypto-firms-spend-638m-on-token-buybacks-in-2026-90-led-by-2-projects/)
- Unlocks: [Keyrock — 16,000 token unlocks](https://keyrock.com/from-locked-to-liquidity-what-16000-token-unlocks-teach-us/) · [CryptoSlate — summary](https://cryptoslate.com/90-of-token-unlocks-drive-prices-down-declines-begin-a-month-ahead/)
- Floor model precedent: [Baseline FAQ](https://www.baseline.markets/faq) · [Baseline — fees](https://www.baseline.markets/blog/baseline-fees-explained)
- Promotion revenue: [DefiLlama — DEX Screener](https://defillama.com/protocol/dex-screener) · [OpenLiquid — DexScreener boosts](https://openliquid.io/blog/dexscreener-boost-feature-explained/)
- Arc: [arc.io — mainnet 16 Sep 2026](https://www.arc.io/blog/arc-mainnet-goes-live-on-september-16-2026)

Regulatory:
- [Unchained — SEC staff clear buybacks on working networks, warn on unfinished ones](https://unchainedcrypto.com/sec-staff-clear-token-buybacks-on-working-networks-with-a-warning-for-unfinished-ones/) · [Crowdfund Insider — SEC officials on buybacks and staking tokens](https://www.crowdfundinsider.com/2026/09/313182-sec-officials-state-that-certain-crypto-buybacks-and-staking-tokens-fall-outside-existing-securities-laws/) · [Fenwick — protocol staking statement](https://www.fenwick.com/insights/publications/sec-staff-statement-concludes-protocol-staking-is-not-a-securities-transaction)
- [Paul Hastings — MiCA white papers](https://www.paulhastings.com/insights/client-alerts/mica-crypto-white-papers-comply-or-be-de-listed) · [Sumsub — MiCA 2026](https://sumsub.com/blog/crypto-regulations-in-the-european-union-markets-in-crypto-assets-mica/)

Repo (read-only):
- `contracts/PulseHook.sol` (fee constants)
- `contracts/PulseLaunchpad.sol` (`LAUNCH_UCRET_PPM`, `_ucretiDagit`)
- `contracts/Stake.sol` (`dagit`, `SALIM_PPM`, `MIN_OY_GUCU`)
- `contracts/Governor.sol` (quorum, guardian)
- `contracts/Vesting.sol`
- `dagitim-fathom.json`, `dagitim-yonetisim.json`, `ADRESLER.md`
- `arastirma/taban-katmani.md` §7b, `cok-zincir.md` (PulseSwap entry, 2026-10-16)
