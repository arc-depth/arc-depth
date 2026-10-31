/* ===========================================================================
 * teminat-bul.js — find how a pasted token can be bought with this chain's
 *                  dollar, and quote it
 *
 * The founder pastes a contract address on the chain they launch from. This
 * reads the token (symbol, name, decimals) and asks Uniswap's own quoters,
 * on that chain, what the collateral deposit would buy:
 *
 *   v3  direct pools dollar -> token at every fee tier (QuoterV2)
 *   v3  two hops through the chain's wrapped native token (QuoterV2)
 *   v4  hookless pools dollar <-> token at the four standard fee tiers (V4Quoter)
 *
 * The largest output wins. The result is the exact route PulseLaunchpad3
 * executes (tur 0 = v3 path, tur 1 = v4 PoolKey) and the expected amount;
 * the launch's minimum is set below it so that a block of drift does not
 * refuse the launch, and anything worse than that does.
 *
 * Addresses: Uniswap's deployments.json (22 Sep 2026). The wrapped native
 * token is read from the chain's own SwapRouter02 (WETH9()).
 * =========================================================================== */
import { JsonRpcProvider, Contract, Interface, AbiCoder, solidityPacked, getAddress } from "../vendor/ethers.min.js";

export const UNISWAP = {
  arc:       { router: "0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77", quoter: "0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468", v4quoter: "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94" },
  robinhood: { router: "0xCaf681a66D020601342297493863E78C959E5cb2", quoter: "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7", v4quoter: "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" },
  base:      { router: "0x2626664c2603336E57B271c5C0b26F421741e481", quoter: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a", v4quoter: "0x0d5e0f971ed27fbff6c2837bf31316121532048d" },
  arbitrum:  { router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", v4quoter: "0x3972c00f7ed4885e145823eb7c655375d275a1c5" },
  avalanche: { router: "0xbb00FF08d01D300023C629E8fFfFcb65A5a578cE", quoter: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F", v4quoter: "0xbe40675bb704506a3c2ccfb762dcfd1e979845c2" },
  monad:     { router: "0xfE31F71C1b106EAc32F1A19239c9a9A72ddfb900", quoter: "0x661E93cca42AfacB172121EF892830cA3b70F08d", v4quoter: "0xa222dd357a9076d1091ed6aa2e16c9742dd26891" },
  bsc:       { router: "0xB971eF87ede563556b2ED4b1C0b0019111Dd85d2", quoter: "0x78D78E420Da98ad378D7799bE8f4AF69033EB077", v4quoter: "0x9f75dd27d6664c475b90e105573e550ff69437b0" },
};

/* Pools of the platform's own tokens carry our hooks, so a hookless search
   cannot see them: ARCP's pool on Arc, and every token launched by one of
   our launchpads (its pool key is asked from the launchpad itself). */
const BILINEN = {
  arc: [{ token: "0xbe98138311c2D89526eCD86B368A2B4B81cf840b",
    key: ["0x3600000000000000000000000000000000000000", "0xbe98138311c2D89526eCD86B368A2B4B81cf840b", 0, 60, "0xC7aDe691ef2FDBF09E793226Db1c79c36b038a44"],
    aciklama: "ARCP pool on Arc" }],
};

const V3_FEES = [100, 500, 3000, 10000];
const V4_KEYS = [[100, 1], [500, 10], [3000, 60], [10000, 200]];
const SIFIR = "0x0000000000000000000000000000000000000000";
const QUOTER_ABI = [
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[],uint32[],uint256)",
];
const V4_QUOTER_ABI = [
  "function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns (uint256 amountOut,uint256 gasEstimate)",
];
const ERC20_ABI = ["function symbol() view returns (string)", "function name() view returns (string)", "function decimals() view returns (uint8)"];

const saglayicilar = {};
const saglayici = (ag) => (saglayicilar[ag.anahtar] = saglayicilar[ag.anahtar] || new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true }));

/** Read a token's identity; null if the address is not an ERC-20 on this chain. */
export async function tokenOku(ag, adres) {
  const p = saglayici(ag);
  const kod = await p.getCode(adres).catch(() => "0x");
  if (!kod || kod === "0x") return null;
  const c = new Contract(adres, ERC20_ABI, p);
  try {
    const [simge, ad, ondalik] = await Promise.all([c.symbol(), c.name(), c.decimals()]);
    return { adres: getAddress(adres), simge, ad, ondalik: Number(ondalik) };
  } catch (e) { return null; }
}

/**
 * Every route by which `miktar` (6-decimal dollars) buys `adres` on `ag`,
 * best first. Each: { tur, rota (hex), cikti (bigint), aciklama }.
 */
export async function rotalar(ag, adres, miktar) {
  const u = UNISWAP[ag.anahtar];
  if (!u) return [];
  const p = saglayici(ag);
  /* Where the launch dollar is the 6-decimal wrapper (BNB), the converter
     unwraps first: routes start at the 18-decimal dollar it wraps, for
     the same amount in that dollar's units. */
  const sarmal = !!ag.sarmal;
  const dolar = getAddress(sarmal ? ag.dolar : ag.quote);
  const hedef = getAddress(adres);
  if (sarmal) {
    miktar = miktar * 10n ** 12n;
    if (hedef === dolar) return [{ tur: 0, rota: "0x", cikti: miktar, aciklama: ag.dolarSembol + " itself, unwrapped 1:1" }];
  }
  const q = new Contract(u.quoter, QUOTER_ABI, p);
  const q4 = new Contract(u.v4quoter, V4_QUOTER_ABI, p);
  const coder = AbiCoder.defaultAbiCoder();
  const bulunan = [];
  const dene = async (f) => { try { return await f(); } catch (e) { return null; } };

  /* v3 direct */
  await Promise.all(V3_FEES.map(async (fee) => {
    const r = await dene(() => q.quoteExactInputSingle.staticCall([dolar, hedef, miktar, fee, 0]));
    if (r && r[0] > 0n) bulunan.push({ tur: 0, rota: solidityPacked(["address", "uint24", "address"], [dolar, fee, hedef]), cikti: r[0],
      aciklama: "Uniswap v3, " + (fee / 10000) + "% pool" });
  }));

  /* v3 through the wrapped native token */
  const weth = await dene(() => new Contract(u.router, ["function WETH9() view returns (address)"], p).WETH9());
  if (weth && getAddress(weth) !== hedef && getAddress(weth) !== dolar) {
    const pairs = [];
    for (const f1 of [500, 3000]) for (const f2 of V3_FEES) pairs.push([f1, f2]);
    await Promise.all(pairs.map(async ([f1, f2]) => {
      const yol = solidityPacked(["address", "uint24", "address", "uint24", "address"], [dolar, f1, weth, f2, hedef]);
      const r = await dene(() => q.quoteExactInput.staticCall(yol, miktar));
      if (r && r[0] > 0n) bulunan.push({ tur: 0, rota: yol, cikti: r[0], aciklama: "Uniswap v3, via the wrapped native token" });
    }));
  }

  /* v4 hookless pools */
  const [c0, c1] = BigInt(dolar) < BigInt(hedef) ? [dolar, hedef] : [hedef, dolar];
  await Promise.all(V4_KEYS.map(async ([fee, ts]) => {
    const key = [c0, c1, fee, ts, SIFIR];
    const r = await dene(() => q4.quoteExactInputSingle.staticCall([key, c0 === dolar, miktar, "0x"]));
    if (r && r[0] > 0n) bulunan.push({ tur: 1, rota: coder.encode(["tuple(address,address,uint24,int24,address)"], [key]), cikti: r[0],
      aciklama: "Uniswap v4, " + (fee / 10000) + "% pool" });
  }));

  /* the platform's own pools */
  const ozel = [];
  for (const b of BILINEN[ag.anahtar] || []) if (getAddress(b.token) === hedef) ozel.push([b.key, b.aciklama]);
  /* launch pools trade against the wrapper, which the converter does not
     route from, so they are not offered where the dollar is wrapped */
  for (const lp of (sarmal ? [] : [ag.launchpad, ag.launchpad3]).filter(Boolean)) {
    const key = await dene(() => new Contract(lp, ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))"], p).havuzAnahtari(hedef));
    if (key) ozel.push([[key[0], key[1], Number(key[2]), Number(key[3]), key[4]], "its ARC PULSE pool"]);
  }
  await Promise.all(ozel.map(async ([key, aciklama]) => {
    const r = await dene(() => q4.quoteExactInputSingle.staticCall([key, getAddress(key[0]) === dolar, miktar, "0x"]));
    if (r && r[0] > 0n) bulunan.push({ tur: 1, rota: coder.encode(["tuple(address,address,uint24,int24,address)"], [key]), cikti: r[0], aciklama });
  }));

  return bulunan.sort((a, b) => (b.cikti > a.cikti ? 1 : b.cikti < a.cikti ? -1 : 0));
}

/** The minimum the launch will accept: 3% under the quote. */
export const asgariCikti = (cikti) => (cikti * 97n) / 100n;
