/* warp-montra.js — a Warp launch on Montra (Elysium), signed in the creator's own wallet.
 *
 * Montra's factory makes the token, its pool, its locked liquidity, the fee split and the first buy in one call
 * (montramarkets.xyz/docs/build#launch-a-token). This page cannot reach Montra's image service (it answers servers
 * only), and Montra shows only https:// and ipfs:// images, so the creator gives an image address; it goes on the token
 * as its logo, which Montra's site shows when a launch names no metadata document.
 *
 * What Warp adds, shown before anything is signed:
 *   - 0.5% of the first buy, sent to ARC PULSE in its own transaction, only after the launch has simulated cleanly
 *     (0.3% runs Warp; 0.2% is booked to ARCP, which buys ARCP and burns it once the ARCP pool is open);
 *   - a 10% slot in the creator's fee split (Montra allows a builder up to 20%); the creator keeps 90%;
 *   - the builder code "arcpulse" appended to the launch (ERC-8021), which Montra pays from its own fee, not the creator's.
 * A launch from ARC PULSE's own wallet takes none of these. */
import { JsonRpcProvider, Contract, Interface, encodeBytes32String, parseEther, formatEther, hexlify, randomBytes, toBeHex, ZeroHash, toUtf8Bytes } from "../vendor/ethers.min.js";
import { ELYSIUM } from "./elysium.js";
import { cuzdan } from "./cuzdan.js";

const REGISTRY = "0xF1E2FA75422F889e565F3142bdbf60B28dce2aa7";
export const ARC_PULSE = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const ARC_PAY = 1000;        // our slot in the creator's split, of 10,000
const WARP_UCRET = 50n;      // 0.5% of the first buy, in basis points
/* ERC-8021: the code's ASCII, its length in one byte, schema 00, then the 16-byte marker */
const KOD = "arcpulse";
const EK = hexlify(toUtf8Bytes(KOD)).slice(2) + toBeHex(KOD.length, 1).slice(2) + "00" + "80218021802180218021802180218021";

let _okur = null, _fab = null;
const okur = () => (_okur = _okur || new JsonRpcProvider(ELYSIUM.rpc, ELYSIUM.id, { staticNetwork: true }));
async function fabrika() {
  if (_fab) return _fab;
  const abi = await fetch(new URL("../abi/montra-factory.json", import.meta.url)).then((r) => r.json());
  const reg = new Contract(REGISTRY, ["function get(bytes32) view returns (address)"], okur());
  const adres = await reg.get(encodeBytes32String("factory"));
  _fab = { adres, iface: new Interface(abi), c: new Contract(adres, abi, okur()) };
  return _fab;
}

/* the menu row for a fee tier and an anti-snipe window, HYPE-quoted and enabled. Elysium's public RPC refuses bursts,
   so the row Montra's menu puts there today is read first and checked; only if it no longer matches are the rows read
   one by one (with a retry each), as Montra's docs ask: read the rows, never trust a hard-coded id. */
const KADEME = [1, 2, 3, 5, 10], PENCERE = [0, 5, 10, 30, 60, 300, 900, 1800];
const uyar = (x, u, k) => x && x.enabled && x.quote === "0x0000000000000000000000000000000000000000" && Number(x.totalFeePips) / 1e4 === u && Number(x.earlyBuyFeeWindow) === k;
async function oku(f, i) { for (let d = 0; d < 3; d++) { try { return await f.c.getConfig(i); } catch { await new Promise((r) => setTimeout(r, 600 * (d + 1))); } } return null; }
export async function satirBul(ucret, kalkan) {
  const f = await fabrika();
  const tahmin = PENCERE.indexOf(kalkan) * 5 + KADEME.indexOf(ucret);
  if (tahmin >= 0 && uyar(await oku(f, tahmin), ucret, kalkan)) return tahmin;
  const n = Number(await f.c.configCount());
  for (let i = 0; i < n; i++) if (i !== tahmin && uyar(await oku(f, i), ucret, kalkan)) return i;
  return null;
}

/* an image address Montra can show: https:// or ipfs://, and it must load as an image */
export function gorselAdresi(u) {
  u = String(u || "").trim();
  if (!/^(https:\/\/|ipfs:\/\/)\S+$/i.test(u)) throw new Error("The image must be an https:// or ipfs:// address.");
  return u;
}

/* the launch. adim(text) reports progress; returns { token, hash } */
export async function launch(g, adim) {
  const f = await fabrika();
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  const biz = ben.toLowerCase() === ARC_PULSE.toLowerCase();
  const ilk = parseEther(String(g.ilkAlim || 0));
  const params = {
    name: g.ad, symbol: g.sembol, metadataURI: "",   // no document: Montra shows the logo
    profile: { logo: g.logo, description: g.aciklama, socials: { telegram: g.telegram || "", twitter: g.twitter || "", discord: "", website: g.website || "", extra: "" } },
    configId: g.configId, supply: 0n, salt: hexlify(randomBytes(32)),
    feeRecipients: biz ? [] : [ben, ARC_PULSE], feeShares: biz ? [] : [10000 - ARC_PAY, ARC_PAY],
    firstBuyAmount: ilk, firstBuyMinOut: ilk > 0n ? 1n : 0n,
    permit: { deadline: 0n, v: 0, r: ZeroHash, s: ZeroHash },
  };
  const ucret = await f.c.launchFee();
  const deger = ucret + ilk;
  const veri = f.iface.encodeFunctionData("launch", [params]) + (biz ? "" : EK);

  adim("Checking the launch on Elysium before you sign…");
  /* the wallet is lent a balance inside the simulation only, so this checks the launch itself; the real balance is checked next */
  try { await okur().send("eth_call", [{ from: ben, to: f.adres, data: veri, value: toBeHex(deger) }, "latest", { [ben]: { balance: toBeHex(deger + parseEther("1")) } }]); }
  catch (e) { throw new Error("Montra would refuse this launch: " + (e.shortMessage || e.message) + ". Nothing was sent."); }
  const bakiye = await okur().getBalance(ben);
  const warp = biz ? 0n : (ilk * WARP_UCRET) / 10000n;
  if (bakiye < deger + warp + parseEther("0.002")) throw new Error("Not enough HYPE on Elysium: you have " + formatEther(bakiye) + ", the launch needs " + formatEther(deger + warp) + " plus a little gas.");

  if (warp > 0n) {
    adim("Step 1 of 2: the Warp fee, " + formatEther(warp) + " HYPE (0.5% of your first buy). Confirm it in your wallet.");
    const h = await cuzdan.agdaGonder(ELYSIUM, { to: ARC_PULSE, value: toBeHex(warp) });
    await okur().waitForTransaction(h, 1, 120000);
  }
  adim((warp > 0n ? "Step 2 of 2: " : "") + "the launch. Confirm it in your wallet.");
  const hash = await cuzdan.agdaGonder(ELYSIUM, { to: f.adres, data: veri, value: toBeHex(deger) });
  adim("Launching… waiting for Elysium.");
  const mk = await okur().waitForTransaction(hash, 1, 180000);
  if (!mk || mk.status !== 1) throw new Error("The launch did not go through: " + hash);
  const olay = mk.logs.map((l) => { try { return f.iface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "TokenLaunched");
  return { token: olay ? olay.args.token : null, hash };
}
