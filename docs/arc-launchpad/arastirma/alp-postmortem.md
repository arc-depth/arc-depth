# ALP: a postmortem

ALP is abandoned. This is the record of what was built, what it cost, and
why it could not be repaired. It is kept rather than deleted because the
chain is public, the mistakes are instructive, and a project that hides its
own failures has no standing to ask anyone to trust its other claims.

The launch product — Launchpad, hook, queue, vaults, wrappers, bridges — is
untouched by this. It never depended on ALP. Only the token and governance
layer dies.

---

## What was built

A fixed supply of 1,000,000,000 ALP, minted once and split at deployment:

| slice | share | where it went |
|---|---|---|
| emission | 60% — 600,000,000 | `Staking`, released 0.4401%/week for ~30 years |
| liquidity | 30% — 300,000,000 | one-sided Uniswap v4 position, locked forever |
| founder | 5% — 50,000,000 | free, liquid |
| vesting | 5% — 50,000,000 | `Vesting`, 12 monthly tranches |

Plus `Governor` (propose / vote / timelock / execute), `DevPool` (outside
contributor payments) and two `AlpLocker` deployments.

## What it cost, measured

- **300,000,000 ALP** permanently locked in pool `0x02753845…` at
  $1,500,000 per token. That pool's tick (134107) has passed the top of its
  band (134100), so active liquidity reads zero: the book is shut. Nobody
  will buy at that price, and nothing can be sold into it either, because it
  holds no USDC to pay anyone with. It is inert, not merely locked.
- **9,369,988 ALP** of the founder's free slice locked in pool
  `0x5f4407e5…`, which cannot be withdrawn — `AlpLocker` has only
  `kilitle` and `unlockCallback`, no owner, no sweep. The trading fees that
  position earns are unreachable too.
- The surviving market is **$115.23 deep in total**. A $1000 buyer cannot be
  filled: they take every token in the book for $115.23 and $884.77 has
  nothing to buy.

---

## The mistakes

Ordered by how much damage each did, not by when it happened.

### 1. The emission was tied to a clock instead of to revenue

600,000,000 ALP — 60% of everything — releases 0.4401% of the remainder
every week whether the protocol earns anything or not. That is about
**123,000,000 ALP in year one**, against roughly 90,000,000 currently
liquid: the supply more than doubles in a year, in exchange for nothing the
protocol received.

This is the one that could not be repaired. `Staking` holds the entire
emission and has no exit but `claim` and `unstake`, so replacing it would
abandon 60% of the supply. Every other mistake here has a fix; this one
defines the ceiling on how good the token could ever get, and the ceiling
was below "worth holding."

**The rule it broke:** a token may only promise what the protocol has
actually earned.

### 2. The token came before the product

ALP is a governance token for a protocol with $0 of revenue. There was no
cash flow, no collateral and no demand — so there was nothing to price, and
the price had to be invented. Every error below follows from this one.

**The rule it broke:** issue a claim on something that exists.

### 3. The opening price was chosen by us

The pool was opened at a $1,500 market cap because somebody had to pick a
number and I picked it. The user objected to exactly this, twice, in plain
terms — and I had already fixed it for launch tokens, where the pool now
opens at the collateral's own value (`openPrice = floorPrice`) and nothing
is invented. I did not apply the same rule to the project's own token.

**The rule it broke:** we do not set prices. The pattern for not setting
them was already written, tested and deployed in this same repository.

### 4. The token had no redemption floor

This is the project's central idea: a launch token is backed by a vault, so
holders can always burn and take their share, and the floor can only rise.
It is proven on mainnet — 700,000,000 tokens were redeemed from a vault and
the floor did not move (1277062 → 1277062).

ALP had none of it. No vault, no claim, no floor. It was a vote and a hope.

**The rule it broke:** apply your own best idea to yourself.

### 5. The liquidity slice was pre-placed, one-sided, at the invented price, forever

300,000,000 tokens into a permanent position priced by a guess. Even with
the decimals correct this was wrong, because:

- depth becomes `invented price × tokens` rather than anything real;
- a one-sided position holds no USDC, so it can only ever be bought from,
  never sold into;
- and there is no correction path. A mistake placed this way is permanent
  by construction.

**The rule it broke:** do not make an irreversible commitment to a number
you guessed.

### 6. 6-decimal USDC was treated as 18-decimal

Arc USDC (`0x3600…`) has 6 decimals; everything else here has 18. The price
was computed as a 1e18-scaled value, which silently assumed both sides
shared a scale. The result was a position opened at $1,500,000 per token
instead of $0.0000015 — a factor of 10^12 — and 300,000,000 tokens placed
where no one will ever trade.

The structural fix was adopted afterwards and still holds: **all prices are
raw-amount ratios**, never a scaled price, and every test standing in for
USDC uses 6 decimals. The design below keeps that rule.

**The rule it broke:** never let two different units meet in one number.

### 7. A permanent lock was applied where it did not belong

Locking liquidity forever is right for a launch token: the collateral gives
an objective floor, and the lock is the promise to buyers that nobody can
pull the rug. ALP had no collateral and no buyers. The lock protected
nobody and only removed the ability to fix the position.

**The rule it broke:** a guarantee is only worth its cost when somebody is
relying on it.

### 8. The emission clock has a catch-up windfall

`release()` returns early when `totalStaked == 0` *without advancing
`lastPeriod`*. `stake()` calls `release()` before recording the stake, so
the first staker's own call releases nothing — and their **next**
interaction releases every accumulated week at once, to a pool consisting
of themselves.

Currently harmless: 0 weeks elapsed, 0 released. It grows with every week
nobody stakes.

**The rule it broke:** a fix for one bug (burning unreleased emission)
created its mirror image, because the test only covered the first direction.

### 9. Depth was guessed instead of grown

A $1,500 market cap on a 1,000,000,000 supply is $0.0000015 a token, so the
10,000,000 tokens placed are about $15 of value; the band stretches that to
$115. Ten times the tokens would still be a hundred-dollar book. Ten times
the opening price would be a thousand-dollar one. The depth was never a
function of anything the protocol did.

**The rule it broke:** liquidity should be a consequence of revenue, not a
parameter.

### 10. Two pools for one token, one of them a zombie

When the first pool turned out to be unusable, a second was opened rather
than the first being understood as unrecoverable and retired. The result is
two markets for the same token at prices nine orders of magnitude apart, one
of which is permanently inert and will confuse every price site that finds
it.

**The rule it broke:** do not route around a broken thing and leave it
running.

### 11. Governance existed before holders

Both the proposal threshold (1%) and the quorum (10%) are shares of total
staked. With nothing staked, one wei was a hundred percent of the vote. A
50,000-token voting floor was added later, which bounds the absurdity but
does not fix it: the first staker still decides alone.

**The rule it broke:** thresholds expressed as fractions of a quantity that
starts at zero are not thresholds.

### 12. Votes could be rented

Voting power was read at the moment of voting and unstaking had no delay, so
a decision could be carried by stake that left in the next block. This was
patched with `tazele`, which cuts a vote down to the stake still behind it
and can be called by anyone — but it is an optimistic repair that needs
somebody to be watching.

The clean fix is a balance checkpoint taken when the proposal opens, and it
was unavailable: checkpoints have to live in the token or the staking
contract, and neither could be replaced. **Writing a new token makes this
fix available**, which is one of the few concrete gains from starting over.

**The rule it broke:** a vote should cost what it decides.

### 13. An irreversible action was taken on the founder's share without asking

10,000,000 ALP of the founder's 50,000,000 was placed into the permanent
lock. Nobody approved that, and the founder found out by asking where the
missing 9,369,988 had gone.

**The rule it broke:** value that cannot come back needs consent before it
goes, not an explanation afterwards.

---

## Root cause

Every item above is a variation of one thing: **the token was designed as an
allocation instead of as a claim.**

Once supply is fixed and split before any revenue exists, every remaining
question — what is it worth, where does liquidity come from, why would
anyone hold it — has to be answered by inventing something. The invented
answers then have to be made permanent to look credible, and permanence
turns each guess into a fact nobody can revise.

The project already had the correct pattern and had proven it on mainnet.
It just was not applied to the project's own token.

---

## What survives

Nothing in the launch product depends on ALP. `Launchpad` and
`ArcLaunchHook` reference their fee destinations only as addresses
(`devSink`, `protocolSink`), so they keep working and need only to be
repointed once new governance exists.

| contract | fate |
|---|---|
| `Launchpad`, `ArcLaunchHook`, `LaunchQueue` | kept; fee sinks repointed |
| `LaunchToken`, `CollateralVault`, `HolderRewards` | kept, untouched |
| wrappers, stock vaults, bridges | kept, untouched |
| `GovToken` (ALP) | abandoned |
| `Staking` | abandoned — holds the unfixable emission |
| `Governor`, `DevPool`, `Vesting` | abandoned with the token they serve |
| `AlpLocker` ×2, both ALP pools | abandoned; contents unrecoverable |

The replacement is in [token-redesign.md](token-redesign.md).
