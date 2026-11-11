/* warp-flap.js — a Warp launch on Flap (BNB Chain, Robinhood Chain, Monad), signed in the creator's own wallet.
 *
 * Flap's Portal makes a tax token (Tax Token V3) with newTokenV6, as its token-launcher docs describe
 * (docs.flap.sh, "Launch token through Portal"): the image and metadata go to Flap's own upload API, which pins them
 * to IPFS for free and allows this site; the token address must end in the chain's vanity suffix, so a salt is mined
 * here first; the call is simulated before anything is signed.
 *
 * The token's tax goes to the creator (mktBps 10000, beneficiary = the creator). What Warp adds, shown before signing:
 *   - Flap's commission receiver: ARC PULSE, which Flap pays a protocol-set commission on every taxed trade;
 *   - 0.5% of the first buy, in the chain's coin, sent to ARC PULSE in its own transaction after the simulation passes.
 * A launch from ARC PULSE's own wallet takes neither. */
import { Interface, JsonRpcProvider, getCreate2Address, keccak256, randomBytes, parseEther, formatEther, toBeHex, ZeroAddress, ZeroHash } from "../vendor/ethers.min.js";
import { AGLAR } from "./aglar.js";
import { cuzdan } from "./cuzdan.js";
import { ARC_PULSE } from "./warp-montra.js";

/* docs.flap.sh, Deployed Contract Addresses (11 Nov 2026): Portal and Tax Token V3 implementation, and the suffix the
   token address must end in; the DEX threshold the Portal accepts was found by simulation (FOUR_FIFTHS) */
export const FLAP = {
  bsc: { portal: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0", impl: "0x024f18294970B5c76c0691b87f138A0317156422", ek: "7777", yol: "bnb" },
  robinhood: { portal: "0x26605f322f7fF986f381bB9A6e3f5DAb0bEaEb09", impl: "0x7777C8743C88B3aff3cf262135beF2c8b2e83333", ek: "7777", yol: "robinhood" },
  monad: { portal: "0x30e8ee7b5881bf2E158A0514f2150aabe2c68b23", impl: "0x777782e7EbB89802E2379E5fFcF7336538f43333", ek: "1111", yol: "monad" },
};
const UPLOAD = "https://funcs.flap.sh/api/upload";
const PORTAL = new Interface(["function newTokenV6((string name,string symbol,string meta,uint8 dexThresh,bytes32 salt,uint8 migratorType,address quoteToken,uint256 quoteAmt,address beneficiary,bytes permitData,bytes32 extensionID,bytes extensionData,uint8 dexId,uint8 lpFeeProfile,uint16 buyTaxRate,uint16 sellTaxRate,uint64 taxDuration,uint64 antiFarmerDuration,uint16 mktBps,uint16 deflationBps,uint16 dividendBps,uint16 lpBps,uint256 minimumShareBalance,address dividendToken,address commissionReceiver,uint8 tokenVersion) params) payable returns (address token)"]);
const FOUR_FIFTHS = 1, V2_MIGRATOR = 1, TOKEN_TAXED_V3 = 6;
const WARP_UCRET = 50n;   // 0.5% of the first buy, in basis points

/* the image and metadata, pinned by Flap; returns the metadata CID */
async function metaYukle(gorsel, g) {
  const form = new FormData();
  form.append("operations", JSON.stringify({
    query: "mutation Create($file: Upload!, $meta: MetadataInput!) { create(file: $file, meta: $meta) }",
    variables: { file: null, meta: { website: g.website || null, twitter: g.twitter || null, telegram: null, description: g.aciklama || "", creator: "0x0000000000000000000000000000000000000000" } },
  }));
  form.append("map", JSON.stringify({ 0: ["variables.file"] }));
  form.append("0", gorsel, gorsel.name || "image.png");
  const r = await fetch(UPLOAD, { method: "POST", body: form });
  const j = await r.json().catch(() => ({}));
  const cid = j && j.data && j.data.create;
  if (!r.ok || !cid) throw new Error("Flap's image upload failed (" + ((j.errors && j.errors[0] && j.errors[0].message) || r.status) + ").");
  return cid;
}

/* a salt whose CREATE2 token address ends in the suffix, mined a slice at a time so the page stays responsive */
async function tuzBul(f) {
  const kod = keccak256("0x3d602d80600a3d3981f3363d3d373d3d3d363d73" + f.impl.slice(2).toLowerCase() + "5af43d82803e903d91602b57fd5bf3");
  let tuz = keccak256(randomBytes(32));
  for (;;) {
    for (let i = 0; i < 4000; i++) {
      const a = getCreate2Address(f.portal, tuz, kod);
      if (a.toLowerCase().endsWith(f.ek)) return { tuz, adres: a };
      tuz = keccak256(tuz);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
}

/* g: { zincir, ad, sembol, aciklama, gorsel (a File), ucret (1-10 %), ilkAlim, website, twitter } */
export async function launch(g, adim) {
  const f = FLAP[g.zincir], z = AGLAR.find((a) => a.anahtar === g.zincir);
  if (!f || !z) throw new Error("Flap does not launch on that chain from Warp.");
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  const biz = ben.toLowerCase() === ARC_PULSE.toLowerCase();
  const okur = new JsonRpcProvider(z.rpc, z.id, { staticNetwork: true });
  const ilk = parseEther(String(g.ilkAlim || 0));
  const vergi = Math.round(Number(g.ucret) * 100);

  adim("Uploading your image and details to Flap (free)…");
  const meta = await metaYukle(g.gorsel, g);
  adim("Finding your token's address (it must end in " + f.ek + ")…");
  const t = await tuzBul(f);
  const params = { name: g.ad, symbol: g.sembol, meta, dexThresh: FOUR_FIFTHS, salt: t.tuz, migratorType: V2_MIGRATOR, quoteToken: ZeroAddress, quoteAmt: ilk,
    beneficiary: ben, permitData: "0x", extensionID: ZeroHash, extensionData: "0x", dexId: 0, lpFeeProfile: 0,
    buyTaxRate: vergi, sellTaxRate: vergi, taxDuration: 100n * 365n * 24n * 3600n, antiFarmerDuration: 3600n,
    mktBps: 10000, deflationBps: 0, dividendBps: 0, lpBps: 0, minimumShareBalance: 0n, dividendToken: ZeroAddress,
    commissionReceiver: biz ? ZeroAddress : ARC_PULSE, tokenVersion: TOKEN_TAXED_V3 };
  const veri = PORTAL.encodeFunctionData("newTokenV6", [params]);

  adim("Checking the launch on " + z.ad + " before you sign…");
  try { await okur.send("eth_call", [{ from: ben, to: f.portal, data: veri, value: toBeHex(ilk) }, "latest", { [ben]: { balance: toBeHex(ilk + parseEther("10")) } }]); }
  catch (e) { throw new Error("Flap would refuse this launch: " + (e.shortMessage || e.message) + ". Nothing was sent."); }
  const warp = biz ? 0n : (ilk * WARP_UCRET) / 10000n;
  const bakiye = await okur.getBalance(ben);
  if (bakiye < ilk + warp) throw new Error("Not enough " + z.gaz + " on " + z.ad + ": you have " + formatEther(bakiye) + ", the launch needs " + formatEther(ilk + warp) + " plus gas.");

  if (warp > 0n) {
    adim("Step 1 of 2: the Warp fee, " + formatEther(warp) + " " + z.gaz + " (0.5% of your first buy). Confirm it in your wallet.");
    const h = await cuzdan.agdaGonder(z, { to: ARC_PULSE, value: toBeHex(warp) });
    await okur.waitForTransaction(h, 1, 180000);
  }
  adim((warp > 0n ? "Step 2 of 2: " : "") + "the launch. Confirm it in your wallet.");
  const hash = await cuzdan.agdaGonder(z, { to: f.portal, data: veri, value: toBeHex(ilk) });
  adim("Launching… waiting for " + z.ad + ".");
  const mk = await okur.waitForTransaction(hash, 1, 240000);
  if (!mk || mk.status !== 1) throw new Error("The launch did not go through: " + hash);
  return { token: t.adres, hash, link: "https://flap.sh/" + f.yol + "/" + t.adres };
}
