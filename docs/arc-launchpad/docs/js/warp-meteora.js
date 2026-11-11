/* warp-meteora.js — a Warp launch on Meteora's Dynamic Bonding Curve (Solana), under ARC PULSE's own config.
 *
 * ARC PULSE's partner config (EH9dz…, made 11 Nov 2026; rapor/squad/meteora-config.json) fixes the curve for every launch
 * through it: SOL quote, 1B supply, ~30 SOL start, migration to DAMM v2 at ~400 SOL market cap, a 1% trade fee of which
 * Meteora keeps its protocol share and the rest goes half to the creator, half to ARC PULSE; after migration all
 * liquidity is locked for good, half the creator's, half ARC PULSE's (their fees claimable, the liquidity not).
 * Meteora's official SDK (vendor/warp-meteora.mjs) builds pool creation + the creator's first buy; the image goes to
 * nostr.build and the metadata to Blossom, both free. Warp adds 0.5% of the first buy, in SOL, in its own transaction. */
import { solanaCuzdan, onayBekle } from "./solana-ikiz.js";
import { gorselYukle, metaYukle } from "./warp-montra.js";
import { ARC_PULSE_SOL } from "./warp-pump.js";

const RPC = "https://solana-rpc.publicnode.com";

/* g: { ad, sembol, aciklama, gorsel (a File) or logo (an https address), ilkAlim (SOL, may be 0), website, twitter } */
export async function launch(g, adim) {
  const ben = solanaCuzdan.hesap() || (await solanaCuzdan.baglan());
  const biz = ben === ARC_PULSE_SOL;
  const lamport = Math.round(Number(g.ilkAlim || 0) * 1e9), warp = biz ? 0 : Math.round(lamport * 0.005);

  let logo = g.logo;
  if (!logo) { adim("Uploading your image (free, to nostr.build)…"); logo = await gorselYukle(g.gorsel); }
  adim("Storing your token's details (free)…");
  const uri = await metaYukle({ name: g.ad, symbol: g.sembol, description: g.aciklama || "", image: logo,
    ...(g.twitter ? { twitter: g.twitter } : {}), ...(g.website ? { website: g.website } : {}) });

  adim("Loading Meteora…");
  const m = await import("../vendor/warp-meteora.mjs");
  const hazirla = () => m.meteoraLaunchHazirla({ rpc: RPC, kullanici: ben, ad: g.ad, sembol: g.sembol, uri, solLamport: lamport });
  adim("Checking the launch on Solana before you sign…");
  const h = await hazirla();
  if (h.hata) {
    if (/insufficient|0x1\b/i.test(h.kayit.join(" ") + JSON.stringify(h.hata))) throw new Error("Not enough SOL for this launch (first buy" + (warp ? " + Warp fee" : "") + " + about 0.03 SOL for the token's accounts and fees).");
    throw new Error("Meteora would refuse this launch (" + JSON.stringify(h.hata) + "). Nothing was sent.");
  }
  if (warp > 0) {
    adim("Step 1 of 2: the Warp fee, " + (warp / 1e9) + " SOL (0.5% of your first buy). Confirm it in your wallet.");
    await onayBekle(await solanaCuzdan.gonder(await m.warpUcretTx({ rpc: RPC, kullanici: ben, arcSol: ARC_PULSE_SOL, lamport: warp })));
  }
  /* a launch transaction holds a recent blockhash for about a minute: after the fee step it is built and checked again */
  const son = warp > 0 ? await hazirla() : h;
  if (son.hata) throw new Error("Meteora would refuse the launch now (" + JSON.stringify(son.hata) + "); your Warp fee was paid, nothing else was sent.");
  adim((warp > 0 ? "Step 2 of 2: " : "") + "the launch" + (lamport > 0 ? " and your first buy" : "") + ". Confirm it in your wallet.");
  const imza = await solanaCuzdan.gonder(son.vtx);
  adim("Launching… waiting for Solana.");
  await onayBekle(imza);
  return { token: son.mint, hash: imza, link: "https://jup.ag/tokens/" + son.mint };
}
