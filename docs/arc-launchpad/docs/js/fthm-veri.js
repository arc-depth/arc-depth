/* ===========================================================================
 * fthm-veri.js — FTHM's numbers, read live from Arc (nothing hardcoded)
 *
 *   supply       FTHM.totalSupply (fixed at mint; the token has no mint function)
 *   burned       1,000,000,000 − totalSupply + the balance at 0x…dEaD
 *   staking      the stake contract's balance (emissions not yet paid out)
 *   vesting      the founder vesting contract's balance (not yet unlocked)
 *   circulating  supply − staking − vesting − dEaD balance
 *   price        FTHM's Uniswap v4 pool on Arc (slot0 via PoolManager.extsload)
 *   FDV / mcap   price × supply / price × circulating
 * =========================================================================== */
import { Contract, AbiCoder, keccak256 } from "../vendor/ethers.min.js";

export const FTHM = {
  token: "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE",
  havuz: "0x06bdf3466fb9f017bf3e68bedfbc220d3c0bee3f73f584de897106f33a388f59",
  hook: "0x72fd3c2eE8A499E97D87e2a642B7DFd908D58A44",
  stake: "0xAbD31A537E089D8a12b928aF7837C148dE2Bd2de",
  vesting: "0x386968f036cbc0d0965C81bf1fCEd0b40EE11E14",
  governor: "0x1084AD3162afC8A62736D604598377D8e6Be8D95",
  yakici: "0x4D78b78A49a9AdDdfA9Be56d5F1bc33591452ff2",
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  ilkArz: 1_000_000_000,
};
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ERC = ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
const n18 = (x) => Number(x) / 1e18;

/// Live FTHM figures from Arc. `arc` is an ethers provider on chain 5042.
export async function fthmDurum(arc) {
  const t = new Contract(FTHM.token, ERC, arc);
  const pm = new Contract(FTHM.poolManager, ["function extsload(bytes32) view returns (bytes32)"], arc);
  const yuva = keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [FTHM.havuz, 6]));
  /* one call at a time, retried: the public Arc RPC answers bursts with "rate limit exceeded" */
  const oku = async (f) => { for (let i = 0; ; i++) { try { return await f(); } catch (e) { if (i >= 3) throw e; await new Promise((r) => setTimeout(r, 700 * (i + 1))); } } };
  const arz = await oku(() => t.totalSupply());
  const olu = await oku(() => t.balanceOf(DEAD));
  const stake = await oku(() => t.balanceOf(FTHM.stake));
  const vesting = await oku(() => t.balanceOf(FTHM.vesting));
  const kelime = await oku(() => pm.extsload(yuva));
  /* currency0 is Arc USDC (6 decimals), currency1 FTHM (18): price = token1 per token0 in raw units */
  const sqrt = BigInt(kelime) & ((1n << 160n) - 1n);
  const fthmPerUsdc = Number((sqrt * sqrt * 1_000_000n) >> 192n) / 1e18;   // whole FTHM per $1
  const fiyat = fthmPerUsdc > 0 ? 1 / fthmPerUsdc : 0;
  const yakilan = FTHM.ilkArz - n18(arz) + n18(olu);
  const dolasim = n18(arz) - n18(stake) - n18(vesting) - n18(olu);
  return { arz: n18(arz), yakilan, stake: n18(stake), vesting: n18(vesting), dolasim, fiyat, fthmPerUsdc,
    fdv: fiyat * n18(arz), piyasaDegeri: fiyat * dolasim };
}
