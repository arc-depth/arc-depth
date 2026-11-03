/* ===========================================================================
 * limit-emir.js — limit orders on Arc (LimitEmir), shared by the token page,
 *                 the keeper (scripts/limit-bekci.js) and the audit
 *                 (scripts/limit-denetim.js)
 *
 * An order escrows USDC (buy) or a launched token (sell) in LimitEmir with a
 * minimum output and an expiry. The minimum output is the limit price:
 *   buy:  deposit D USDC, receive at least N tokens  -> price <= D / N
 *   sell: deposit N tokens, receive at least D USDC  -> price >= D / N
 * Both are "all in": the pool's 2.2% fee and collateral tax, the platform
 * fee and the keeper's tip are all inside them. Anyone may fill an order when
 * the pool can pay it (the contract checks the output itself); the owner can
 * cancel at any time. No server: the keeper is a public script anyone runs.
 * =========================================================================== */

/** LimitEmir on Arc (dagitim-limit.json). Empty until deployed. */
export const LIMIT = {
  adres: "0x1fef84Bd1Dd626E0F3e8FcD6A48521D5C6f839dC",
  blok: 29167436,
  kapiV8: "0x1f042E18E1C7899E87cec5CAC5C07c487163BBbF",
  kapiV9: "0xA64AC16a5469561080bd8657fD852E346Bf8bF49",
  usdc: "0x3600000000000000000000000000000000000000",
};

const EMIR = "(address sahip,uint40 bitis,uint16 ucretBps,uint8 durum,bool alim,address token,uint64 bahsis,address kapi,uint128 girdi,uint128 asgari)";
export const LIMIT_ABI = [
  "function emirVer(address token,bool alim,uint256 girdi,uint256 asgari,uint256 bahsis,uint256 bitis) returns (uint256 id)",
  "function iptal(uint256 id)",
  "function doldur(uint256 id,address bahsisAlici) returns (uint256 cikti)",
  "function emir(uint256 id) view returns (" + EMIR + ")",
  "function emirler(uint256 bas,uint256 adet) view returns (" + EMIR + "[] e)",
  "function emirSayisi() view returns (uint256)",
  "function kapiOf(address token) view returns (address)",
  "function ucretBps() view returns (uint16)",
  "function asgariBahsis() view returns (uint64)",
  "function BAHSIS_AZAMI() view returns (uint256)",
  "function BAHSIS_ORAN_TAVAN_BPS() view returns (uint256)",
  "function ASGARI_ALIM() view returns (uint256)",
  "function brutAsgari(uint256 asgari,uint256 bahsis,uint256 bps) pure returns (uint256)",
  "event EmirVerildi(uint256 indexed id,address indexed sahip,address indexed token,bool alim,uint256 girdi,uint256 asgari,uint256 bahsis,uint40 bitis,uint16 ucretBps,address kapi)",
  "event EmirDolduruldu(uint256 indexed id,address indexed sahip,address indexed bekci,uint256 cikti,uint256 iade,uint256 ucret,uint256 bahsis)",
  "event EmirKapandi(uint256 indexed id,address indexed sahip,bool sureDoldu)",
  "error YetkiYok()", "error SifirAdres()", "error KotuDeger()", "error BilinmeyenToken()", "error KotuSure()", "error KotuBahsis()",
  "error AzGirdi()", "error EmirAcikDegil()", "error SuresiDoldu()", "error AzCikti(uint256 cikti,uint256 asgari)", "error TransferOlmadi()", "error Kilitli()",
];

export const ACIK = 1, DOLDU = 2, IPTAL = 3;
/** What the keeper's tip defaults to on the page: 5 cents (a fill costs ~1-6 cents of Arc gas at 20 gwei). */
export const VARSAYILAN_BAHSIS = 50_000n;

/** A decimal string ("0.000012") as an integer with `ondalik` decimals. Throws on anything else. */
export function ondalikliOku(s, ondalik) {
  const t = String(s).trim();
  if (!/^\d*(\.\d*)?$/.test(t) || t === "" || t === ".") throw new Error("Not a number: " + s);
  const [a, b = ""] = t.split(".");
  return BigInt(a || "0") * 10n ** BigInt(ondalik) + BigInt((b + "0".repeat(ondalik)).slice(0, ondalik) || "0");
}

/** The limit price (USDC per token, as a decimal string) -> the order's minimum output.
 *  buy: `girdi` USDC (6 dp) -> least tokens (18 dp); sell: `girdi` tokens (18 dp) -> least USDC (6 dp). */
export function asgariHesapla(alim, girdi, fiyat) {
  const f18 = ondalikliOku(fiyat, 18);
  if (f18 <= 0n) throw new Error("The price must be above zero");
  return alim ? (BigInt(girdi) * 10n ** 30n) / f18 : (BigInt(girdi) * f18) / 10n ** 30n;
}

/** The all-in price an order fills at, or better (USDC per token, a number for display). */
export function emirFiyati(e) {
  const g = Number(e.girdi), a = Number(e.asgari);
  if (!g || !a) return 0;
  return e.alim ? (g / 1e6) / (a / 1e18) : (a / 1e6) / (g / 1e18);
}

/** Where a buy order's deposit goes on a fill: the tip, the fee (fixed into the order), the rest into the pool. */
export function alimBolumu(girdi, bahsis, ucretBps) {
  const net = BigInt(girdi) - BigInt(bahsis);
  const ucret = (net * BigInt(ucretBps)) / 10_000n;
  return { bahsis: BigInt(bahsis), ucret, harca: net - ucret };
}

/** The checks the contract makes on a new order (a human sentence for the first one that fails, or null). */
export function emirKontrol({ alim, girdi, asgari, bahsis, bitis, simdi, asgariBahsis, bahsisAzami = 1_000_000n, oranTavanBps = 500n, asgariAlim = 1_000_000n }) {
  girdi = BigInt(girdi); asgari = BigInt(asgari); bahsis = BigInt(bahsis);
  if (girdi <= 0n || asgari <= 0n) return "Enter an amount and a price.";
  if (alim && girdi < asgariAlim) return "A buy order needs at least $" + Number(asgariAlim) / 1e6 + ".";
  if (!(bitis > simdi) || bitis > simdi + 365 * 86400) return "The expiry must be in the future, at most a year away.";
  if (bahsis < BigInt(asgariBahsis)) return "The keeper's tip must be at least $" + (Number(asgariBahsis) / 1e6).toFixed(2) + ".";
  if (bahsis > bahsisAzami) return "The keeper's tip is at most $" + (Number(bahsisAzami) / 1e6).toFixed(2) + ".";
  const dolar = alim ? girdi : asgari;
  if (bahsis * 10_000n > dolar * oranTavanBps) return "The keeper's tip is at most " + Number(oranTavanBps) / 100 + "% of the order's dollars.";
  return null;
}

/** An order's state for display. */
export function durumAdi(e, simdi) {
  const d = Number(e.durum);
  if (d === DOLDU) return "Filled";
  if (d === IPTAL) return "Cancelled";
  if (d === ACIK) return Number(e.bitis) < simdi ? "Expired (cancel to get it back)" : "Open";
  return "?";
}
