/* ===========================================================================
 * move-hesap.js — the Aptos and Sui launch pools' arithmetic, as the Move
 * code runs it (aptos/pulse-launchpad, sui/pulse-launchpad): quotes for the
 * token page, so the minimum a trade accepts is computed, not guessed.
 *
 *   buy:  snipe (99% in the opening second, quartering each second, 0 from
 *         5 s), then the 2% fee (0.30 founder, 0.70 depth, 1.00 platform)
 *         and the collateral tax; the rest buys on x*y with the virtual
 *         dollar reserve
 *   sell: x*y against real + virtual dollars, never more than the real ones,
 *         then the same fee and tax. The volume shield (up to 3% more when a
 *         block sells over 0.5% of circulating) is not known in advance: the
 *         slippage room covers it.
 * =========================================================================== */
const PPM = 1_000_000n;
const ppm = (x, p) => (x * BigInt(p)) / PPM;

export function snipePpm(gecenSn) {
  if (gecenSn >= 5) return 0n;
  return 990000n >> BigInt(2 * Math.max(0, Math.floor(gecenSn)));
}

function kes(miktar, vergiPpm) {
  const ucret = ppm(miktar, 3000) + ppm(miktar, 10000) + ppm(miktar, 7000);
  const vergi = ppm(miktar, vergiPpm);
  return { ucret, vergi, kalan: miktar - ucret - vergi };
}

/* { tokenRez, gercekDolar, sanalDolar, vergiPpm, acilisSn } -> tokens for `dolar` */
export function alimTeklifi(h, dolar, simdiSn = Date.now() / 1000) {
  const snipe = ppm(dolar, snipePpm(simdiSn - h.acilisSn));
  const { ucret, vergi, kalan } = kes(dolar - snipe, h.vergiPpm);
  const y = h.gercekDolar + h.sanalDolar;
  return { token: (h.tokenRez * kalan) / (y + kalan), ucret: ucret + snipe, vergi, snipe };
}

export function satimTeklifi(h, token) {
  const y = h.gercekDolar + h.sanalDolar;
  let brut = (y * token) / (h.tokenRez + token);
  if (brut > h.gercekDolar) brut = h.gercekDolar;
  const { ucret, vergi, kalan } = kes(brut, h.vergiPpm);
  return { dolar: kalan, ucret, vergi };
}

/* burning `miktar` of `dolasim` pays the same share of every vault balance */
export const itfaPayi = (bakiye, miktar, dolasim) => (dolasim === 0n ? 0n : (bakiye * miktar) / dolasim);

/* the price on the pool now, and the floor: dollars per whole token */
export function fiyatlar(h, kasa, dolasim, ondalik) {
  const birim = 10 ** ondalik;
  const fiyat = Number(h.gercekDolar + h.sanalDolar) / 1e6 / (Number(h.tokenRez) / birim);
  const taban = dolasim === 0n ? 0 : Number(kasa) / 1e6 / (Number(dolasim) / birim);
  return { fiyat, taban };
}

export const asgari = (x, payBps = 300) => (x * BigInt(10000 - payBps)) / 10000n;
