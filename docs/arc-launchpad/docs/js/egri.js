/* ===========================================================================
 * egri.js — what a trade in a launch's Arc pool will do, before it is signed
 *
 * The pool (contracts/sepet/PulseLaunchpad5.sol, ladder without end, 19 Oct
 * 2026) holds two locked positions, priced here in dollars per token:
 *   ladder  [opening price, no end)  all tokens at the open:
 *           L_l = ladderTokens · sqrt(open)
 *   band    [open · 1.0001^-9180, open)  the founder's net dollars:
 *           L_b = net / (sqrt(open) - sqrt(low))
 * Inside a range at price p:  tokens = L (1/sqrt p - 1/sqrt hi),
 * dollars = L (sqrt p - sqrt lo). A buy moves sqrt p up by dollars / L,
 * a sale moves it down. Above the open this is x·y=k with the virtual
 * dollar reserve ladderTokens × open (measured: nesil2-test/test/SonsuzEgri.t.sol).
 *
 * Fees as the hook takes them (PulseHook5): 2.2% plus the token's
 * collateral tax on every trade; in the first 5 seconds after launch a
 * snipe tax on buys; a sale above 0.5% of circulating supply in one block
 * pays up to 3% more. Estimates, shown as such: the pool may move before
 * the trade lands.
 * =========================================================================== */

export const ARZ = 1e9;                  // whole tokens
export const ACILIS = 3500 / ARZ;        // dollars per token at the open
export const UCRET = 0.022;
const BAND_ALT = ACILIS * Math.pow(1.0001, -9180);

/// The pool as numbers. `fiyat` dollars per token now; `kurucuToken` the
/// founder's tokens (whole); `teklif` the founder's net dollars in the band;
/// `vergi` the collateral tax as a fraction (0.01–0.05).
export function durum({ fiyat, kurucuToken, teklif, vergi }) {
  const merdiven = ARZ - kurucuToken;
  const sa = Math.sqrt(ACILIS), sl = Math.sqrt(BAND_ALT);
  return { fiyat, vergi, merdiven, teklif, Ll: merdiven * sa, Lb: teklif / (sa - sl), sa, sl };
}

/// What the pool holds at its price: real dollars, tokens, and their sum at that price.
export function ozet(s) {
  const sp = Math.sqrt(s.fiyat);
  const dolarMerdiven = s.Ll * Math.max(0, sp - s.sa);
  const dolarBant = s.Lb * (Math.min(Math.max(sp, s.sl), s.sa) - s.sl);
  const tokenMerdiven = sp >= s.sa ? s.Ll / sp : s.merdiven;
  const tokenBant = sp < s.sa ? s.Lb * (1 / Math.max(sp, s.sl) - 1 / s.sa) : 0;
  const gercekDolar = dolarMerdiven + dolarBant, token = tokenMerdiven + tokenBant;
  return { fiyat: s.fiyat, piyasaDegeri: s.fiyat * ARZ, gercekDolar, token, likidite: gercekDolar + token * s.fiyat };
}

/// A buy of `dolar` dollars: tokens out, price after, impact, fee paid.
export function alim(s, dolar) {
  const ucret = dolar * (UCRET + s.vergi);
  let kalan = dolar - ucret, sp = Math.sqrt(s.fiyat), token = 0;
  /* the band first, while the price is under the open */
  if (sp < s.sa) {
    const sp0 = Math.max(sp, s.sl), gerek = s.Lb * (s.sa - sp0);
    if (kalan <= gerek) { const sp1 = sp0 + kalan / s.Lb; token += s.Lb * (1 / sp0 - 1 / sp1); sp = sp1; kalan = 0; }
    else { token += s.Lb * (1 / sp0 - 1 / s.sa); kalan -= gerek; sp = s.sa; }
  }
  if (kalan > 0) { const sp1 = sp + kalan / s.Ll; token += s.Ll * (1 / sp - 1 / sp1); sp = sp1; }
  const yeni = sp * sp;
  return { token, ucret, fiyatSonra: yeni, etki: yeni / s.fiyat - 1, ortalama: dolar / token };
}

/// A sale of `token` tokens: dollars out (after fees), price after, impact.
/// `bitti` when the band runs out before the tokens do (the rest finds no buyer).
export function satim(s, token, kalkanVar = false) {
  let kalan = token, sp = Math.sqrt(s.fiyat), dolar = 0;
  if (sp > s.sa) {
    const gerek = s.Ll * (1 / s.sa - 1 / sp);
    if (kalan <= gerek) { const sp1 = 1 / (1 / sp + kalan / s.Ll); dolar += s.Ll * (sp - sp1); sp = sp1; kalan = 0; }
    else { dolar += s.Ll * (sp - s.sa); kalan -= gerek; sp = s.sa; }
  }
  let bitti = false;
  if (kalan > 0) {
    const sp0 = Math.min(sp, s.sa), gerek = s.Lb * (1 / s.sl - 1 / sp0);
    if (kalan <= gerek) { const sp1 = 1 / (1 / sp0 + kalan / s.Lb); dolar += s.Lb * (sp0 - sp1); sp = sp1; kalan = 0; }
    else { dolar += s.Lb * (sp0 - s.sl); kalan -= gerek; sp = s.sl; bitti = true; }
  }
  const oran = UCRET + s.vergi + (kalkanVar ? 0.03 : 0);
  const ucret = dolar * oran;
  const yeni = sp * sp;
  return { dolar: dolar - ucret, ucret, fiyatSonra: yeni, etki: yeni / s.fiyat - 1, satilamayan: kalan, bitti };
}

/* ---- reading a live pool on Arc ---- */

/// The pool's state for `token` from the chain: its price, the founder's
/// tokens and band, the tax. `oku` is an ethers Contract factory bound to Arc.
export async function zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, lpAdres, pmAdres, token) {
  const lp = new Contract(lpAdres, ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))",
    "function launchIdOfPool(bytes32) view returns (uint256)",
    "function launchAt(uint256) view returns ((address token,address acici,address kasa,uint256 teminat,address kurucu,uint256 kurucuToken,uint256 teklif,uint256 vergiPpm,uint64 zaman))"], arc);
  const k = await lp.havuzAnahtari(token);
  const c = AbiCoder.defaultAbiCoder();
  const id = keccak256(c.encode(["address", "address", "uint24", "int24", "address"], [k[0], k[1], k[2], k[3], k[4]]));
  const no = await lp.launchIdOfPool(id);
  if (no === 0n) throw new Error("Not a launch of this launchpad");
  const [kayit, w] = await Promise.all([lp.launchAt(no - 1n),
    new Contract(pmAdres, ["function extsload(bytes32) view returns (bytes32)"], arc).extsload(keccak256(c.encode(["bytes32", "uint256"], [id, 6])))]);
  const sqrt = BigInt(w) & ((1n << 160n) - 1n);
  const ham = Number(sqrt) ** 2 / 2 ** 192;                         // currency1 per currency0, raw
  const fiyat = (k[0].toLowerCase() === token.toLowerCase() ? ham * 1e12 : (1 / ham) * 1e12);   // dollars per token
  return durum({ fiyat, kurucuToken: Number(kayit.kurucuToken) / 1e18, teklif: Number(kayit.teklif) / 1e6, vergi: Number(kayit.vergiPpm) / 1e6 });
}
