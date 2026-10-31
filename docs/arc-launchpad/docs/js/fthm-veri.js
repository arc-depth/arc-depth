/* ===========================================================================
 * fthm-veri.js — ARCP's numbers, read live from Arc (nothing hardcoded)
 *
 *   supply       ARCP.totalSupply (fixed at mint; the token has no mint function)
 *   burned       1,000,000,000 − totalSupply + the balance at 0x…dEaD
 *   staking      the stake contract's balance (emissions not yet paid out)
 *   vesting      the founder vesting contract's balance (not yet unlocked)
 *   circulating  supply − staking − vesting − dEaD balance
 *   price        ARCP's Uniswap v4 pool on Arc (slot0 via PoolManager.extsload)
 *   FDV / mcap   price × supply / price × circulating
 * =========================================================================== */
import { Contract, AbiCoder, keccak256 } from "../vendor/ethers.min.js";

/* The platform token: ARCP (Arc Pulse). The binding keeps its old name
   so every importer keeps working; the addresses are ARCP's, from
   dagitim-arcp.json and dagitim-v8.json. */
export const FTHM = {
  token: "0xbe98138311c2D89526eCD86B368A2B4B81cf840b",
  havuz: "0x1c3f13f2da0b7dca5378ea0f2d2f5e846898577994896f23225ddcae529c8337",
  hook: "0xC7aDe691ef2FDBF09E793226Db1c79c36b038a44",
  stake: "0x7b5883Dc1744B3E793E64276F5e290F9FdB1B273",
  vesting: "0xD5b95DFf257A30188b8ff64450d6fB158f2De8b6",
  governor: "0x846E0e9997ee900BcaFFAA79ad0B377FC907712c",
  yakici: "0x32d96E618142aaAB3100C26183b60940D00D1644",   // v8 burner (buys and burns ARCP)
  acici: "0x97cCfedBfb6338291bc3Ea29344C37E10B757007",
  sembol: "ARCP",
  ad: "Arc Pulse",
  poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  ilkArz: 1_000_000_000,
};
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ERC = ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
const n18 = (x) => Number(x) / 1e18;

/// Live ARCP figures from Arc. `arc` is an ethers provider on chain 5042.
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
  /* currency0 is Arc USDC (6 decimals), currency1 ARCP (18): price = token1 per token0 in raw units */
  const sqrt = BigInt(kelime) & ((1n << 160n) - 1n);
  const fthmPerUsdc = Number((sqrt * sqrt * 1_000_000n) >> 192n) / 1e18;   // whole ARCP per $1
  const fiyat = fthmPerUsdc > 0 ? 1 / fthmPerUsdc : 0;
  const yakilan = FTHM.ilkArz - n18(arz) + n18(olu);
  const dolasim = n18(arz) - n18(stake) - n18(vesting) - n18(olu);
  return { arz: n18(arz), yakilan, stake: n18(stake), vesting: n18(vesting), dolasim, fiyat, fthmPerUsdc,
    fdv: fiyat * n18(arz), piyasaDegeri: fiyat * dolasim };
}
export const ARCP = FTHM;
export const arcpDurum = fthmDurum;
