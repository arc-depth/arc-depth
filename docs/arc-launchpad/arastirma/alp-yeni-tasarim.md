# The replacement token: a claim, not an allocation

ALP failed for one reason, stated in full in
[token-postmortem.md](token-postmortem.md): it was designed as an
**allocation** — a fixed supply split up before any revenue existed — and
every question an allocation cannot answer had to be answered by inventing
something.

This design answers those questions with arithmetic instead.

The launch product is not being rebuilt. `Launchpad`, `ArcLaunchHook`,
`LaunchQueue`, `LaunchToken`, `CollateralVault`, `HolderRewards`, the
wrappers and the bridges all stay as they are; they never referenced ALP.
Only the token and governance layer is new.

---

## One principle

> **The token is a claim on the treasury. We never choose its price, and no
> token exists that was not paid for.**

Everything below follows from that, and nothing below requires anyone to
pick a number.

---

## The mechanism

The treasury holds USDC. The token's floor is the treasury divided by the
supply. Anyone may mint at the floor or redeem at the floor, at any time.

```
floor = treasury / supply          (never materialised as a scaled number)

mint(usdcIn)      tokensOut = usdcIn * supply / treasury
                  treasury += usdcIn ; supply += tokensOut      floor UNCHANGED

redeem(tokens)    usdcOut   = tokens * treasury / supply
                  treasury -= usdcOut ; supply -= tokens        floor UNCHANGED

fee arrives       treasury += fee  ; supply unchanged            floor RISES
```

Three properties fall straight out of this, and they are the three things
ALP could not do:

**We never set a price.** Minting and redeeming happen at whatever the
treasury-to-supply ratio currently is. There is no opening price, no
parameter, no judgement call. The first minter pays the same per-token claim
as the thousandth.

**The floor can only rise.** Minting and redeeming both leave it exactly
where it was; fees only add to the treasury. This is the property already
proven on mainnet in the launch vaults, where 700,000,000 tokens were
redeemed and the floor did not move (1277062 → 1277062). It is the same
arithmetic, pointed at the protocol's own token.

**Depth equals the treasury, in both directions.** ALP's entire market was
$115.23 because depth was `invented price × tokens`. Here, whoever wants to
sell can always redeem for the treasury's own money, and whoever wants to
buy can always mint. Depth grows when the protocol earns and shrinks only
when holders leave — it is never a guess.

### Integer form, and the rule that was learned the hard way

All of the above is expressed as **raw-amount ratios**. No 1e18-scaled
price appears anywhere, because a scaled price silently assumes both sides
share a decimal scale — which is exactly what cost 300,000,000 ALP when
6-decimal USDC was treated as 18-decimal.

```solidity
// 6-decimal USDC in, 18-decimal token out. No scaling constant.
tokensOut = (usdcIn * supply) / treasury;
usdcOut   = (tokens * treasury) / supply;
```

Both divisions **round down**, so every operation leaves the floor equal or
very slightly higher, never lower. Rounding can never be used to ratchet the
floor down.

### Verified before any of it was written in Solidity

The three properties above are claims about integer arithmetic across two
decimal scales, and the last design died because exactly that kind of claim
was assumed rather than checked. So
[`scripts/olc-yeni-token-aritmetigi.js`](../scripts/olc-yeni-token-aritmetigi.js)
runs the mechanism as arithmetic first:

```
PASS 1 USDC -> 1 token                              genesis denomination
PASS TOHUM ITFA EDILEMIYOR                          supply and treasury can never hit zero
PASS BASIM tabani ZERRE degistirmedi                minting moves the floor by nothing
PASS ITFA tabani dusurmedi                          redeeming cannot lower it
PASS UCRET tabani YUKSELTTI                         $1.00 -> $1.0998 per token
PASS $1 / $7 / $100 / $2,500 / $50,000 gidis-donus kar ETMIYOR
PASS 20.000 islemin HICBIRI tabani dusurmedi        9109 mints, 7898 redeems, 2993 fees
PASS taban baslangictaki $1'in altina hic inmedi    ended at $240.59
PASS hazine 1.000.000 kat buyuyunce $1 tam tabandan aliyor
```

Twenty thousand randomised operations, with the floor compared as a
cross-multiplied fraction after every single one. It never fell.

The fee-raid the 24-hour delay exists for is also measured rather than
asserted: minting $100,000 immediately before the largest single fee the
protocol can produce (2% of a $1,500 launch) and redeeming straight after
returns **$29.70 on $100,000 at risk** — real, and bounded by that one fee
event. A day of required exposure is what turns it from free into a
position.

### Bootstrap

With `supply == 0` the ratio is undefined, so genesis fixes a
**denomination**, not a price: the first mint receives one token per USDC.

```solidity
if (supply == 0) tokensOut = usdcIn * 1e12;   // 6 decimals -> 18, one for one
```

This is not the mistake ALP made. A denomination says "we will call this
unit a token"; a price says "this is what it is worth." Nobody is advantaged
by it — the first minter's claim per token is identical to everyone else's,
which is the only test that matters.

A small permanent seed is minted at genesis and locked in the contract
beyond redemption, so `supply > 0` and `treasury > 0` hold forever. That
removes the edge case where the last redemption leaves a supply with no
treasury behind it, and it is the same guard Uniswap v2 uses for the same
reason.

### Redeeming has a short delay after minting

Minted tokens cannot be redeemed for 24 hours.

A fee landing in the treasury raises the floor for whoever is holding at
that moment. Without a delay, somebody could mint a large amount just before
a known fee arrival — the launch queue is public — redeem immediately after,
and take a share of a fee they were present for by one block. The delay
makes that position cost a day of exposure instead of nothing.

It is a real cost to anyone legitimately round-tripping within a day. That
is accepted: the people it inconveniences and the people it stops are doing
the same thing.

---

## Governance

**Voting power is the token balance, checkpointed when the proposal opens.**

The old design read voting power at the moment of voting, so a decision
could be carried by stake that left in the next block. It was patched with
`tazele`, an optimistic repair that needs somebody to be watching. The clean
fix — a balance snapshot taken when the proposal opens — was unavailable,
because checkpoints have to live in the token or the staking contract and
neither could be replaced.

Writing a new token makes it available. The token keeps per-address balance
checkpoints; `propose()` records a block; votes are weighed at that block.
**A vote cannot be bought for a proposal that already exists**, so there is
nothing to rent and nothing to watch for. `tazele` is deleted.

**There is no staking contract.** Holding is the commitment, because the
capital behind the token is sitting in the treasury. Nothing has to be
locked to make a vote cost something; the vote already costs what the tokens
cost.

**Thresholds are fractions of supply, and supply now starts above zero** —
the genesis seed — and grows only when somebody pays. The remaining honest
caveat: early on, whoever holds most decides. That is unavoidable in any
design. The difference is that it now takes money rather than a free
allocation, so being first means having paid first, which is a legitimate
claim rather than an artefact.

---

## How the founder gets paid

**There is no founder allocation.** No free slice, no vesting contract,
nothing granted at genesis.

Compensation runs through the mechanism that already works and is already
deployed: record the work on chain, propose a payment, let it be voted, and
the governor sends it. Paid in **USDC from the treasury**, which does not
touch the supply and does not dilute anyone.

If a token grant is ever wanted instead, it must be voted with its cost
stated as a number, because minting tokens without adding treasury is the
one operation that lowers the floor:

> This grant mints N tokens and adds nothing to the treasury. The floor
> moves from $X to $Y. Every existing holder's claim falls by Z%.

A proposal that cannot show that line should not pass.

This is a direct consequence of the postmortem's mistake #13: 10,000,000 of
the founder's slice was made unrecoverable without anyone approving it. In
this design there is no slice to lose, and anything the founder receives
arrives by a vote with its price printed on it.

---

## Fees

Unchanged where it already works, repointed where it does not.

| slice | before | after |
|---|---|---|
| launch-token holders, 0.15% | `HolderRewards` / vault floor | **unchanged** — it belongs to that token's holders, not ours |
| outside developers, 0.15% | `DevPool` | **unchanged** — the mechanism works |
| protocol, 0.20% | `Hazine`, idle | **the treasury** — raises the floor for every holder |

The protocol's own slice stops sitting in a wallet waiting for a vote and
starts doing the only thing that makes the token worth holding. No separate
rewards contract, no claiming, no emission: the floor simply rises.

The launch fee's protocol share (0.8% of each deposit) routes the same way.

---

## What is deliberately absent

| not built | because |
|---|---|
| any emission | 600,000,000 on a 30-year clock paid for nothing the protocol earned, and could not be undone. Value accrues by the floor rising, not by new tokens appearing. |
| a staking contract | holding is already the commitment, and an unreplaceable contract holding most of the supply is what made the last design unfixable |
| a pre-allocated supply | an allocation forces every value question to be answered by invention |
| a seeded DEX pool | mint/redeem at the floor *is* the market, and it is as deep as the treasury. Anyone may open a pool later; if it trades above the floor that is the market's opinion, and if it trades below, redeeming arbitrages it closed |
| a permanent liquidity lock | there are no outside buyers being promised anything yet, so it would protect nobody while removing the ability to correct a mistake |
| a chosen opening price | the ratio is the price |

---

## Launch sequence

1. **Token** — mint / redeem / balance checkpoints, genesis seed, 24h redeem delay.
2. **Treasury** — holds USDC, is the mint and redeem counterparty, has no owner and no sweep.
3. **Governor** — checkpointed votes, timelock, permissionless execute. No staking.
4. **Repoint** — redeploy hook and launchpad so the protocol fee slice lands in the treasury. This is the only change the launch product needs.
5. **No pool, no liquidity placement, no price.**

Steps 1–3 are new contracts and need tests before anything is deployed; step
4 is the same redeploy that has been done before. Nothing here spends the
founder's holdings and nothing here is irreversible except the genesis seed.

## Decisions that are not mine

- **The token's name and symbol.** ALP is spent.
- **The voting minimum.** The last design used a fixed 50,000 tokens. With a
  supply that grows as people mint, a fixed count is a shrinking share, so I
  would denominate it as a claim value instead — "tokens worth at least $N
  at the floor" — which holds its meaning as the protocol grows. The number
  is yours.
- **Whether the founder takes a genesis token grant** with its dilution
  stated, or only USDC payments by vote. I recommend the latter: it is the
  point of the redesign.

## What is not being rebuilt

`Launchpad`, `ArcLaunchHook`, `LaunchQueue`, `LaunchToken`,
`CollateralVault`, `HolderRewards`, the wrappers, the stock vaults and the
bridges. They work, they are tested, and they never depended on the token.
