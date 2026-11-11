/* warp-clanker.js — a Warp launch on Clanker v5, signed in the creator's own wallet.
 *
 * One launchpad on six of our chains: Base, BNB Chain, Monad, Robinhood Chain, Arc and Elysium. The launch is built and
 * simulated by Clanker's own SDK (clanker-sdk 5.1.0, bundled with viem into vendor/warp-clanker.mjs), which talks to
 * the wallet through a small EIP-1193 adapter over this site's wallet module.
 *
 * What Warp adds, shown before anything is signed:
 *   - 0.5% of the first buy, in the chain's own coin, sent to ARC PULSE in its own transaction after the launch has
 *     simulated cleanly (0.3% runs Warp; 0.2% is booked to ARCP, which buys ARCP and burns it once its pool is open);
 *   - Clanker's integrator share: 10% of the tax left after Clanker's protocol share, paid to ARC PULSE by Clanker's
 *     fee escrow; the creator keeps the rest.
 * A launch from ARC PULSE's own wallet takes neither. */
import { AGLAR } from "./aglar.js";
import { ELYSIUM } from "./elysium.js";
import { cuzdan } from "./cuzdan.js";
import { ARC_PULSE } from "./warp-montra.js";

export const CLANKER_ZINCIRLER = ["base", "bsc", "monad", "robinhood", "arc", "elysium"];
const ag = (k) => (k === "elysium" ? ELYSIUM : AGLAR.find((a) => a.anahtar === k));
const ARAC_PAYI = 10;          // % of the tax after Clanker's protocol share
const WARP_UCRET = 0.005;      // 0.5% of the first buy

/* the wallet as viem sees it: sends go through this site's wallet module on the right chain, reads go to the chain's RPC */
function saglayici(z, hesap) {
  return {
    request: async ({ method, params }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts") return [hesap];
      if (method === "eth_chainId") return "0x" + z.id.toString(16);
      if (method === "eth_sendTransaction") { const { from, ...islem } = params[0]; return cuzdan.agdaGonder(z, islem); }
      const r = await fetch(z.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) }).then((x) => x.json());
      if (r.error) throw Object.assign(new Error(r.error.message || "RPC error"), { code: r.error.code, data: r.error.data });
      return r.result;
    },
  };
}

/* the launch. g: { zincir, ad, sembol, aciklama, logo, ucret (1-10 %), ilkAlim (in the chain's coin), website, twitter } */
export async function launch(g, adim) {
  const z = ag(g.zincir);
  if (!z || !CLANKER_ZINCIRLER.includes(g.zincir)) throw new Error("Clanker does not launch on that chain.");
  const ben = cuzdan.hesap() || (await cuzdan.bagla());
  if (!ben) throw new Error("Connect a wallet first.");
  if (!cuzdan.agdaMi(z)) { adim("Switching your wallet to " + z.ad + "…"); await cuzdan.agaGec(z); }
  const biz = ben.toLowerCase() === ARC_PULSE.toLowerCase();
  adim("Loading Clanker…");
  const { clankerIstemcisi } = await import("../vendor/warp-clanker.mjs");
  const { clanker, publicClient } = clankerIstemcisi({ id: z.id, ad: z.ad, rpc: z.rpc, gaz: z.gaz }, saglayici(z, ben), ben);
  const ilk = Number(g.ilkAlim || 0);
  const sosyal = [g.website && { platform: "website", url: g.website }, g.twitter && { platform: "x", url: g.twitter }].filter(Boolean);
  const tok = {
    name: g.ad, symbol: g.sembol, image: g.logo,
    metadata: { description: g.aciklama || "", ...(sosyal.length ? { socialMediaUrls: sosyal } : {}) },
    context: { interface: "ARC PULSE" },
    buyFee: g.ucret, sellFee: g.ucret,
    ...(biz ? {} : { integrator: { address: ARC_PULSE, share: ARAC_PAYI } }),
    ...(ilk > 0 ? { devBuy: { ethAmount: String(ilk) } } : {}),
  };

  const bakiye = Number(await publicClient.getBalance({ address: ben })) / 1e18;
  const warp = biz ? 0 : ilk * WARP_UCRET;
  if (bakiye < ilk + warp) throw new Error("Not enough " + z.gaz + " on " + z.ad + ": you have " + bakiye.toFixed(5) + ", the launch needs " + (ilk + warp).toFixed(5) + " plus gas.");
  adim("Checking the launch on " + z.ad + " before you sign…");
  const sim = await clanker.deploySimulate(tok, { account: ben });
  if (sim.error) throw new Error("Clanker would refuse this launch: " + (sim.error.message || sim.error) + ". Nothing was sent.");

  if (warp > 0) {
    adim("Step 1 of 2: the Warp fee, " + warp.toFixed(6) + " " + z.gaz + " (0.5% of your first buy). Confirm it in your wallet.");
    const deger = BigInt(Math.round(warp * 1e6)) * 10n ** 12n;   // 18-decimal native units, rounded to 6 places
    const h = await cuzdan.agdaGonder(z, { to: ARC_PULSE, value: "0x" + deger.toString(16) });
    await publicClient.waitForTransactionReceipt({ hash: h });
  }
  adim((warp > 0 ? "Step 2 of 2: " : "") + "the launch. Confirm it in your wallet.");
  const { txHash, waitForTransaction, error } = await clanker.deploy(tok);
  if (error) {
    const metin = String(error.message || error) + " " + String((error.cause && error.cause.message) || "");
    if (/user rejected|denied|declined|4001/i.test(metin)) throw new Error("You declined the launch in your wallet. Nothing was sent.");
    throw new Error((error.data && error.data.rawName === "SEND_UNCERTAIN") ? "The wallet may have sent the launch: check your wallet's activity before trying again." : "The launch was not sent: " + (error.message || error));
  }
  adim("Launching… waiting for " + z.ad + ".");
  const r = await waitForTransaction();
  if (r.error) throw new Error("Check transaction " + txHash + " before trying again: " + (r.error.message || r.error));
  return { token: r.address, hash: txHash, link: "https://clanker.world/clanker/" + r.address };
}
