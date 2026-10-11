# arc-launchpad

**A launch whose token is born on top of real collateral, where nobody — including us — can take the collateral or the liquidity.**

A memecoin's floor is zero. If the founder leaves, nothing is left. Here the deposit that creates a token also creates a vault behind it: holders can always burn their tokens and take their share of what is in there, and no function exists that lets anyone else touch it.

Built for [Arc](https://www.arc.io) (Circle's L1, chain id 5042), on Uniswap v4.

> **Live on Arc mainnet**
> hook &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[`0x7084e10d02dE4fCdCA68C35c84e9c2Ba4096ca44`](https://explorer.arc.io/address/0x7084e10d02dE4fCdCA68C35c84e9c2Ba4096ca44)
> launchpad [`0x9fE067cD7a00285e2D8616D61810c718A41c1a76`](https://explorer.arc.io/address/0x9fE067cD7a00285e2D8616D61810c718A41c1a76)
>
> **Bridge, live on both chains**
> vault &nbsp;&nbsp;&nbsp;&nbsp;[`0x4926de0B4FC6814488C7BB1DEb3951807b376A08`](https://robinhoodchain.blockscout.com/address/0x4926de0B4FC6814488C7BB1DEb3951807b376A08) — Robinhood Chain
> wrapped &nbsp;[`0xCfDbc078E513930bF6A4B4DDB7eD6123E8A7d342`](https://explorer.arc.io/address/0xCfDbc078E513930bF6A4B4DDB7eD6123E8A7d342) — Arc, wAAPL
>
> No owner, no admin, no upgrade path on any of them. An earlier pair was deployed
> and then replaced before any launch existed: the fee was collected correctly
> and had nowhere to go, because one hook serves every pool while the reward
> contract is per launch. Replacing it cost 0.093 USDC and nobody's money was
> involved — which is the argument for finding that class of bug before a
> customer does, not after.

---

## What was measured before any of it was built

Numbers read from the chains themselves, not from announcements:

| | |
|---|---|
| RWA / equity pools on Arc | **zero** — 40-pool sample, the whole category is empty |
| Arc liquidity in that sample | $13.1M, of which $11.7M sits in one pool |
| NVDA on Robinhood Chain | ~$1.08M liquidity, ~$43M daily volume |
| Stock Token transferability | **unrestricted** — a transfer from a real holder simulates successfully |
| Stock Token internals | standard ERC-20, beacon proxy, `paused()` exists, a `multiplier` for splits |
| Bridges on Arc | **Across is live** — SpokePool `0x9b4A302A548c7e313c2b74C461db7b84d3074A84`, chainId 5042, 21,060 deposits, deposits not paused. **Wormhole Core is live** — `0xC8aD24fC6063c41cB5C12a8e3851AafC3b3CF027`, guardian set 7 with 19 members, Arc's Wormhole chain id 71; messages only, no Token Bridge on Arc. **LayerZero is deployed but dead** — endpoint `0xb6319cc6c8c27a8f5daf0dd3df91ea35c4720dd7` has `latestVersion() == 0`, no messaging library, and `estimateFees` reverts. **CCIP is live** — router `0xB79791184973589c38e114D43Eb8E4588C283A18`, 10,761 bytes, six lanes, fee payable in USDC; it carries messages but **not USDC**. **CCTP v2 is live** — TokenMessengerV2/MessageTransmitterV2/TokenMinterV2 all deployed, `localDomain()` 26, about twenty remote domains; this is the native USDC route. Axelar, Stargate, Hop, Socket and Multichain: no Arc address found. CCIP and CCTP were reported absent in an earlier revision of this line; they activated with Arc's mainnet on 16 September and the addresses were not rechecked. **What any of this will carry is the real limit:** Across lists 18 routes into Arc and all 5 assets are dollar stablecoins (USDC, USDC.e, USDC-BNB, USDG, pathUSD) — no ETH, no WBTC, no DOGE, LINK, XRP, XLM or HBAR. Measured 2026-10-09 at block 25,061,398. An earlier version of this line said LayerZero and CCIP were simply absent; that was checked against Ethereum addresses, which most of these protocols do not reuse per chain. |
| Arc pools already locking liquidity by hook | 2,936 |
| Cost to launch on Arc | **0.018 USDC** of gas |

Two of these shaped the design more than anything else. The split `multiplier` is why the vault counts shares instead of amounts. The lack of a **direct** Arc ↔ Robinhood Chain lane is why the relayer is trusted and why there is an audit script — not the lack of a bridge, which was the earlier and wrong version of this sentence.

---

## How a launch works

```
1. Founder deposits collateral (100 to 1,500 units)
2. A 2% fee is taken, split 30 / 30 / 40
3. 1,000,000,000 tokens minted, all of them to the curve
4. The rest of the deposit BUYS tokens on the curve
5. Anyone can buy or sell on the curve, 0.50% each way
6. Holders who sat still for 24h claim their share of the fee
7. At a reserve of 6,000 the curve closes and the launch graduates
8. Graduation opens a v4 pool whose liquidity can never be removed
```

### What a depositor gets back

This is the number the first design got wrong, so it goes first. Of a
deposit of 100, the fee takes 2 and **98 reaches the reserve**. Selling
the whole position in the next block returns **97.51** — the 98 less the
0.5% trading fee on the way out. The fee is the only thing anyone loses.

| outside buying | founder's exit | |
|---|---|---|
| none | $97.51 | −2.5%, the fee |
| $500 | $164.53 | +64.5% |

The first version of this launchpad split the deposit 60/40 into a
redemption vault and permanently locked liquidity and handed the founder
free tokens. Measured afterwards: a founder who left immediately got back
**42.66 of 100**, and their best possible exit was **+4%**, capped by the
band whatever the demand. Locked liquidity cannot be withdrawn by anyone
and a floor backs the whole supply while the founder holds half of it, so
launching burned half the capital before a buyer arrived. The deposit is
not revenue and not a donation; it buys, and it is recoverable.

---

## The five guarantees, and why they are not promises

**The vault has no key.** Collateral leaves only by burning tokens, in proportion. There is no owner, no admin, no pause, no upgrade, no rescue function and no recipient parameter. A rescue function is the usual way a vault like this gets emptied — written for honest reasons, then used or stolen for dishonest ones. Leaving it out means a mistake can strand value forever. That is the right trade: a vault someone can empty is not collateral, it is a promise.

**A holder leaving cannot move the floor.** Burning cuts supply and collateral in the same proportion, so collateral-per-token is unchanged for everyone who stayed. Verified: floor identical after 10%, 50% and 90% of holders exit.

**The liquidity lock is part of the pool's identity.** A v4 pool id is `keccak(PoolKey)` and the hook address is one of PoolKey's five fields, so the hook is fixed the moment the pool exists. Changing it would produce a different pool. The hook reverts every removal — for the founder, for a stranger, and for us.

**The floor is defended by arithmetic, not by anyone's effort.** Price cannot sit below collateral-per-token, because anyone can buy there and redeem for more. Redemption is deliberately free of fees: a fee on the exit would let the price sit below the floor by exactly that much.

**It is checkable from outside.** Read the pool id, recover the PoolKey from the [registry](https://github.com/arc-depth/arc-depth), look at the hook address bits, read the code. Three steps, all on chain. v4 declares a hook's capabilities in the low 14 bits of its own address, so "this pool locks liquidity" is visible before reading a single line.

---

## Parameters

| | value |
|---|---|
| Supply | 1,000,000,000 |
| Deposit | 100 to 1,500 |
| Launch fee | 2.00%, split 30 / 30 / 40 |
| Trading fee | 0.50%, split 30 / 30 / 40 |
| Opening market cap | 1,500 |
| Virtual reserves | 1,500 collateral / 1e9 tokens |
| Curve allocation | 800,000,000 (80%) |
| Graduation at | reserve of 6,000 |
| Holder hold period | 24 hours |

The deposit range has a reason at each end. Below 100 the curve is too
thin for a single buy to behave — a 10-unit buy on a 100-unit launch
moves the price about 15%, which the interface states before anyone
signs. The cap at 1,500 keeps launches comparable to one another.

`GRADUATE_AT` is not a free choice. It is the reserve at which the
curve runs out of tokens: `k / (VIRTUAL_TOKENS − CURVE_SUPPLY) −
VIRTUAL_COLLATERAL = 1.5e12 / 2e8 − 1500 = 6000`. Anywhere else leaves
either a curve that can never graduate, or a graduation with tokens
still unsold.

<!-- the pool band below applies at graduation only -->

| opening | ceiling | founder keeps | buyer risk | 50-unit buy |
|---|---|---|---|---|
| 1.5x | 3x | 29.1% | 33% | 3.1% |
| **2x** | **6x** | **51.9%** | **50%** | **4.9%** |
| 2x | 20x | 22.2% | 50% | 4.9% |
| 3x | 10x | 76.2% | 67% | 7.2% |

2x / 6x is the only point where the founder keeps a majority, the buyer's worst case stays at half, and a 50-unit buy still moves price under 5%. The ceiling is not a wall: as price approaches it holders take profit, and their selling puts tokens back into the pool.

Nothing sits below the floor, because price cannot go there — capital placed beneath it would never trade.

### Fee split

| share | to |
|---|---|
| 0.15% | holders whose balance has not moved for 24h |
| 0.15% | outside contributors |
| 0.15% | protocol |
| 0.05% | the floor — burned, or added to the vault |

The last slice was originally meant to be re-added as pool liquidity. That
turned out to be the wrong target: liquidity needs both sides in a ratio and
the fee arrives on one side only, so pairing it would mean swapping half of it
back, inside a hook, at a price the fee itself had just moved — and the result
would be tradeable away by the next buyer anyway. Sending it to the floor
serves the same intent and cannot be undone: collateral goes to the vault,
token is burned, and both mean more collateral behind each remaining token.

The holder rule is "balance has not moved", not "has not sold". That is not a simplification — a v4 hook sees the *router* as `sender`, not the person behind it, so "who sold" is not a fact the chain makes available at the pool. "Whose balance changed" is, and it is stricter: it also closes the hole where you move tokens to a second wallet, sell from there, and keep collecting on the first.

Payment is pull, not push, so gas does not grow with the number of holders. Claiming before the wait is over forfeits the slice to everyone else — that forfeiture is the whole incentive.

---

## Governance token

No sale, no allocation to anyone who did not earn it, no mint function.

| share | |
|---|---|
| 5% | free at launch |
| 5% | over twelve months |
| 30% | liquidity and staking seed |
| 60% | emitted over thirty years |

The requirement was "thirty years, but 90% in the first ten". That is a decay constant of k = 0.229/year — a three-year half-life. A contract cannot evaluate `e^(-kt)` cheaply and does not need to: continuous decay is the same as releasing a fixed fraction of the remainder each period. At one week that is 4,401 ppm.

Measured by running the decades inside one call with a backdated start:

| after | emitted |
|---|---|
| 1 year | 20.50% |
| 3 years | 49.75% |
| **10 years** | **89.95%** |
| 30 years | 99.90% |

Emission goes to stakers, not holders. Paying holders rewards doing nothing and puts the first year's 20.5% straight onto the market; staking locks it away instead. Voting power is staked balance, because the people steering it should be the ones who cannot leave the moment a vote goes against them.

---

## The bridge, stated plainly

Collateral is a tokenized equity on Robinhood Chain; the pool is on Arc. Something has to carry the message, and today a relayer does, and that relayer is trusted.

**An earlier version of this section said Arc had no message bridge at all. That is no longer true and the correction changes what the honest answer is.** Measured on chain 2026-10-09:

| | |
|---|---|
| CCIP on Arc | **Live.** Router `0xB79791184973589c38e114D43Eb8E4588C283A18` holds 10,761 bytes of code; chain selector `6370580034781731079`; RMN `0x9A82E768C885DEF7C4b47451Fd4Db53d8B21ed07`. Fee tokens are LINK **and USDC**, so no LINK has to be acquired. Six configured lanes, both directions: Ethereum, Base, Polygon, Solana, 0G, Tempo. |
| CCIP token transfer from Arc | **Does not carry USDC.** The lanes' supported-token lists are LINK and syrupUSDC (Ethereum), VIRTUAL (Base), PST (Solana) — nothing else. So CCIP is a message path here, not a value path, and anything that describes it as moving collateral is describing a route that does not exist. |
| CCTP v2 on Arc | **Live.** TokenMessengerV2, MessageTransmitterV2 and TokenMinterV2 all hold code. `localDomain()` is **26**, wired to about twenty remote domains including Ethereum, Base, Polygon, Solana, Arbitrum, Avalanche, OP, Unichain, Linea, Sui and Aptos. This is the native USDC route — Circle's own burn and mint, no third-party bridge. |
| Arc ↔ Robinhood Chain | **No direct lane.** Robinhood Chain is on CCIP (chainId 4663, selector `6180753054346818345`, ten outbound lanes) but Arc is not among its destinations and it is not among Arc's. All four legs of a two-hop path through **Ethereum** exist, and so do all four through **Base**. |

So the reason the relayer is still trusted is not that no bridge exists. It is that **no single lane connects these two chains**, and a two-hop CCIP path costs two fees and two confirmations. That path is a real replacement for the one trusted component in this system and it is available today — it is simply not built yet, and this document will not claim a route it has not run.

The collateral vault, separately, never crosses a chain at all, and `scripts/denetim-kasa-cikislari.js` is why: the vault has exactly four outbound transfers and every one of them pays `msg.sender`. No function takes a destination, so the reserve cannot be routed anywhere — not to a bridge, not to an owner, not by anyone. Sending collateral to another chain would mean adding a function that names a recipient, and that function is a withdraw whatever it is called. CCTP's mint also waits on Circle's off-chain attestation, so funds would be in flight across blocks; during that flight the vault's balance has fallen and nothing has arrived, so the claim per token falls with it and anyone redeeming in that window is paid short. The claim is exact at every instant or it is not a claim. Assets from other chains therefore arrive as representations somebody else already bridged — cirBTC is exactly that.

Pretending otherwise would be the dishonest part of this design. What is actually done about it:

- the vault counts **shares**, not amounts, so a stock split cannot silently break the one-to-one relationship — the issuer's `multiplier` never has to be read or understood
- a lock id can be minted once and a burn id released once, which removes the most common failure of a relayed bridge
- the relayer cannot redirect anything: recipients travel with the notice and are emitted
- both sides are public, and **`scripts/denetim.js` compares them**

```
node scripts/denetim.js 0x4926de0B4FC6814488C7BB1DEb3951807b376A08 \
                        0xCfDbc078E513930bF6A4B4DDB7eD6123E8A7d342
```

Run against the live pair right now it reports `0 = 0` — the vault holds
nothing and exactly nothing has been minted against it. That is the state the
check exists to confirm, and it will keep confirming it after the first lock.

It checks that wrapped supply equals vault shares, that minted minus burned equals supply, and that the shares are actually covered by the stock held. A relayer minting out of thin air does not get away with it quietly — it gets away with it for as long as nobody runs the comparison. Trust is not removed here. It is made cheap to audit, which is a smaller claim and a true one.

---

## The rest of the system

| | |
|---|---|
| `Vesting` | the 5% slice, one twelfth a month, no cliff and no revocation |
| `Governor` | staked-weight voting, 10% quorum, power snapshotted at proposal time |
| `relayer/relayer.js` | carries lock and burn notices; dry-run by default, refuses to act when the two chains already disagree |
| `scripts/denetim.js` | the independent check: wrapped supply must equal vault shares |
| `docs/index.html` | a static page that reads the launchpad straight from Arc, no backend |

The governor is honest about its reach: it governs nothing already deployed,
because the hook, the vault and every launch are immutable and have no
function a vote could call. It decides who the developer share pays, what a
future version uses, and what the treasury does.

## Running it

```bash
npm install
npm run build     # compile everything to build/
npm test          # 103 checks against Arc's own EVM
```

The tests do not use a local chain. They run the compiled contracts inside the real Arc node through `eth_call` with a state override: real EVM version, real gas semantics, no deployment, no transaction, no cost. The launch test goes further and opens a pool against the **PoolManager actually deployed on Arc** — if the math produced a position v4 would reject, it is rejected here too.

That matters more than usual for a v4 hook. Its capabilities live in its address, so it cannot be patched after a pool exists; a wrong hook is a permanently broken pool. Testing it on the chain it will live on, while nothing is permanent yet, is the cheapest insurance available.

---

## Status

**Deployed and verified on Arc mainnet.** The hook and the launchpad are live, each one reports the other ( and  match), and both point at the same PoolManager. Total cost 0.087 USDC.

Not yet done:

- **A real launch.** The minimum deposit is 1,500 collateral units; the wallet holds about 5. Everything up to that point is exercised against the real chain — including a real swap through v4 with the hook charging its fee, the holder slice reaching that pool's reward contract and the floor slice being burned — but no customer has used it.
- **The vault is empty.** The bridge is deployed on both chains and the audit script confirms the two sides agree (0 = 0), but no Stock Token has been locked yet — that needs a Robinhood account holding one. Until then wAAPL exists and its supply is correctly zero.

Known and unresolved:

- **the relayer is trusted** — see above; this is the real weakness
- **collateral is an equity, so the floor moves with it** — the product protects against the founder, not against NVDA falling
- **Arc has no buyers for this yet** — the category is empty, which is the opportunity and the problem at once

## License

MIT
