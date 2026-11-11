/* warp-pons.js — a Warp launch on Pons v2 (Robinhood Chain), signed in the creator's own wallet.
 *
 * Pons's launch-and-buy router creates the launch and makes the creator's opening buy in one call, so nothing can trade
 * in between (docs.ponsfamily.com/v2, "Launching and buying in one transaction"). The launch's terms are pinned with
 * previewLaunchEconomics, the call is simulated before anything is signed, and the creator tax goes to the creator.
 * Pons has no integrator share, so what Warp adds is only 0.5% of the opening buy, sent to ARC PULSE in its own
 * transaction after the simulation passes (none from ARC PULSE's own wallet). The image is an https address. */
import { Interface, JsonRpcProvider, hexlify, randomBytes, parseEther, formatEther, toBeHex, ZeroAddress } from "../vendor/ethers.min.js";
import { AGLAR } from "./aglar.js";
import { cuzdan } from "./cuzdan.js";
import { ARC_PULSE } from "./warp-montra.js";

const FABRIKA = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e", YONLENDIRICI = "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948";
const TP = "tuple(string name,string symbol,string logo,string description,tuple(string twitter,string telegram,string discord,string website,string farcaster) socials,address creatorFeeRecipient,uint16 creatorTaxBps,bool buybackEnabled,bytes32 expectedEconomics,bytes32 salt)";
const F = new Interface(["function previewLaunchEconomics(uint256,address) view returns (bytes32)", "function launchFee() view returns (uint256)", "function maxCreatorTaxBps() view returns (uint16)", "function launchConfigCount() view returns (uint256)", "function canLaunch(address) view returns (bool)"]);
const R = new Interface(["function launchAndBuy(" + TP + " params,uint256 launchConfigId,address pairToken,uint256 quoteIn,uint256 minTokensOut,address recipient,address[] snipeTaxExemptions) payable returns (address token,address curve,uint256 tokensOut)"]);
const WARP_UCRET = 50n;   // 0.5% of the opening buy, in basis points

/* g: { ad, sembol, aciklama, logo (https), ucret (creator tax %, capped by Pons), ilkAlim (ETH, required), website, twitter } */
export async function launch(g, adim) {
  const z = AGLAR.find((a) => a.anahtar === "robinhood");
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  const biz = ben.toLowerCase() === ARC_PULSE.toLowerCase();
  const okur = new JsonRpcProvider(z.rpc, z.id, { staticNetwork: true });
  const oku = async (ad, args = []) => F.decodeFunctionResult(ad, await okur.call({ to: FABRIKA, data: F.encodeFunctionData(ad, args) }))[0];
  const ilk = parseEther(String(g.ilkAlim || 0));
  if (ilk <= 0n) throw new Error("A Pons launch through Warp needs an opening buy: it is made in the same transaction, so no one can buy before you.");
  if (!(await oku("canLaunch", [ben]))) throw new Error("Pons is not open for launches from this wallet right now.");

  adim("Reading Pons's launch terms…");
  const [ucret, tavan, n] = [await oku("launchFee"), Number(await oku("maxCreatorTaxBps")), Number(await oku("launchConfigCount"))];
  let cfg = null, eco = null;
  for (let i = 0; i < n && cfg === null; i++) { try { eco = await oku("previewLaunchEconomics", [i, ZeroAddress]); cfg = i; } catch { /* disabled */ } }
  if (cfg === null) throw new Error("Pons has no launch config open right now.");
  const params = { name: g.ad, symbol: g.sembol, logo: g.logo, description: g.aciklama || "",
    socials: { twitter: g.twitter || "", telegram: "", discord: "", website: g.website || "", farcaster: "" },
    creatorFeeRecipient: ben, creatorTaxBps: Math.min(Math.round(Number(g.ucret) * 100), tavan), buybackEnabled: true, expectedEconomics: eco, salt: hexlify(randomBytes(32)) };
  /* ARC PULSE in the opening-snipe exemption list: harmless (it only spares that wallet the first seconds' surcharge) and it
     marks the launch as a Warp launch in its own calldata, which is how the Warp launch list finds it */
  const veri = R.encodeFunctionData("launchAndBuy", [params, cfg, ZeroAddress, ilk, 1n, ben, biz ? [] : [ARC_PULSE]]);
  const deger = ucret + ilk;

  adim("Checking the launch on Robinhood Chain before you sign…");
  let token;   // CREATE2 from the sender and the salt, so the simulated address is the launched one
  try { token = R.decodeFunctionResult("launchAndBuy", await okur.send("eth_call", [{ from: ben, to: YONLENDIRICI, data: veri, value: toBeHex(deger) }, "latest", { [ben]: { balance: toBeHex(deger + parseEther("10")) } }]))[0]; }
  catch (e) {
    /* measured 11 Nov 2026: Pons refused opening buys under about 0.0045 ETH */
    if (ilk < parseEther("0.005")) throw new Error("Pons needs a bigger opening buy: at least about 0.005 ETH. Nothing was sent.");
    throw new Error("Pons would refuse this launch: " + (e.shortMessage || e.message) + ". Nothing was sent.");
  }
  const warp = biz ? 0n : (ilk * WARP_UCRET) / 10000n;
  const bakiye = await okur.getBalance(ben);
  if (bakiye < deger + warp) throw new Error("Not enough ETH on Robinhood Chain: you have " + formatEther(bakiye) + ", the launch needs " + formatEther(deger + warp) + " (Pons's launch fee " + formatEther(ucret) + " included) plus gas.");

  if (warp > 0n) {
    adim("Step 1 of 2: the Warp fee, " + formatEther(warp) + " ETH (0.5% of your opening buy). Confirm it in your wallet.");
    const h = await cuzdan.agdaGonder(z, { to: ARC_PULSE, value: toBeHex(warp) });
    await okur.waitForTransaction(h, 1, 180000);
  }
  adim((warp > 0n ? "Step 2 of 2: " : "") + "the launch and your opening buy. Confirm it in your wallet.");
  const hash = await cuzdan.agdaGonder(z, { to: YONLENDIRICI, data: veri, value: toBeHex(deger) });
  adim("Launching… waiting for Robinhood Chain.");
  const mk = await okur.waitForTransaction(hash, 1, 240000);
  if (!mk || mk.status !== 1) throw new Error("The launch did not go through: " + hash);
  return { token, hash, link: "https://www.ponsfamily.com/launchpad/" + token };
}
