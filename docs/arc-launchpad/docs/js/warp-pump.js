/* warp-pump.js — a Warp launch on pump.fun (Solana), signed in the creator's own Solana wallet.
 *
 * pump.fun's official SDK (bundled in vendor/warp-pump.mjs) builds the coin's creation and the creator's first buy as one
 * transaction; the new mint's key is made in this page, signs it first, and is dropped. The image goes to nostr.build and
 * the coin's metadata document to Blossom, both free; the metadata address is what pump.fun reads.
 * pump.fun has no integrator share, so Warp adds only 0.5% of the first buy, in SOL, to ARC PULSE's Solana address, in its
 * own small transaction after the launch has simulated cleanly (create + buy + a transfer do not fit Solana's 1232 bytes). */
import { solanaCuzdan, onayBekle } from "./solana-ikiz.js";
import { gorselYukle, metaYukle } from "./warp-montra.js";

export const ARC_PULSE_SOL = "5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh";
const RPC = "https://solana-rpc.publicnode.com";   // the same RPC this site's Solana wallet uses (it answers browsers)

/* g: { ad, sembol, aciklama, gorsel (a File) or logo (an https address), ilkAlim (SOL), website, twitter } */
export async function launch(g, adim) {
  const ben = solanaCuzdan.hesap() || (await solanaCuzdan.baglan());
  const biz = ben === ARC_PULSE_SOL;
  const sol = Number(g.ilkAlim || 0);
  if (!(sol > 0)) throw new Error("A pump.fun launch through Warp needs a first buy in SOL (it is made in the launch itself).");
  const lamport = Math.round(sol * 1e9), warp = biz ? 0 : Math.round(lamport * 0.005);

  let logo = g.logo;
  if (!logo) { adim("Uploading your image (free, to nostr.build)…"); logo = await gorselYukle(g.gorsel); }
  adim("Storing your coin's details (free)…");
  const uri = await metaYukle({ name: g.ad, symbol: g.sembol, description: g.aciklama || "", image: logo, showName: true, createdOn: "https://arcpulse.app",
    ...(g.twitter ? { twitter: g.twitter } : {}), ...(g.website ? { website: g.website } : {}) });

  adim("Loading pump.fun…");
  const p = await import("../vendor/warp-pump.mjs");
  adim("Checking the launch on Solana before you sign…");
  const h = await p.pumpLaunchHazirla({ rpc: RPC, kullanici: ben, ad: g.ad, sembol: g.sembol, uri, solLamport: lamport });
  if (h.hata) {
    const kayit = h.kayit.join(" ");
    if (/insufficient|0x1\b/i.test(kayit + JSON.stringify(h.hata))) throw new Error("Not enough SOL: the launch needs " + sol + " SOL" + (warp ? " plus the Warp fee " + (warp / 1e9) : "") + " plus about 0.03 SOL for the coin's accounts and fees.");
    throw new Error("pump.fun would refuse this launch (" + JSON.stringify(h.hata) + "). Nothing was sent.");
  }
  if (warp > 0) {
    adim("Step 1 of 2: the Warp fee, " + (warp / 1e9) + " SOL (0.5% of your first buy). Confirm it in your wallet.");
    const imza = await solanaCuzdan.gonder(await p.warpUcretTx({ rpc: RPC, kullanici: ben, arcSol: ARC_PULSE_SOL, lamport: warp }));
    await onayBekle(imza);
  }
  /* a launch transaction holds a recent blockhash for about a minute: after the fee step it is built again, and checked again */
  const son = warp > 0 ? await p.pumpLaunchHazirla({ rpc: RPC, kullanici: ben, ad: g.ad, sembol: g.sembol, uri, solLamport: lamport }) : h;
  if (son.hata) throw new Error("pump.fun would refuse the launch now (" + JSON.stringify(son.hata) + "); your Warp fee was paid, nothing else was sent.");
  adim((warp > 0 ? "Step 2 of 2: " : "") + "the launch and your first buy. Confirm it in your wallet.");
  const imza = await solanaCuzdan.gonder(son.vtx);
  adim("Launching… waiting for Solana.");
  await onayBekle(imza);
  return { token: son.mint, hash: imza, link: "https://pump.fun/coin/" + son.mint };
}
