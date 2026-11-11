/* warp-raydium.js — a Warp launch on Raydium LaunchLab (Solana), under ARC PULSE's own platform.
 *
 * ARC PULSE's LaunchLab platform (D1xZ…, made 11 Nov 2026; rapor/squad/raydium-platform.json) sets what every launch
 * through it carries: a 0.5% platform fee to ARC PULSE and a 0.5% creator fee to the creator on every bonding-curve
 * trade, on top of Raydium's own fee; at graduation 20% of the pool's liquidity is locked to ARC PULSE (its fees) and 80%
 * is burned. Raydium's official SDK (vendor/warp-raydium.mjs, GPL-3.0, a separate file) builds the mint, the pool and the
 * creator's first buy; the image goes to nostr.build and the metadata to Blossom, both free. Warp adds 0.5% of the first
 * buy, in SOL, in its own transaction after the launch has simulated cleanly. */
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

  adim("Loading Raydium…");
  const m = await import("../vendor/warp-raydium.mjs");
  const hazirla = () => m.raydiumLaunchHazirla({ rpc: RPC, kullanici: ben, ad: g.ad, sembol: g.sembol, uri, solLamport: lamport });
  const hatasi = (h) => (h.sim.find((s) => s.hata) || null);
  adim("Checking the launch on Solana before you sign…");
  const h = await hazirla();
  const hh = hatasi(h);
  if (hh) {
    if (/insufficient|0x1\b/i.test(hh.kayit.join(" ") + JSON.stringify(hh.hata))) throw new Error("Not enough SOL for this launch (first buy" + (warp ? " + Warp fee" : "") + " + about 0.03 SOL for the token's accounts and fees).");
    throw new Error("Raydium would refuse this launch (" + JSON.stringify(hh.hata) + "). Nothing was sent.");
  }
  if (warp > 0) {
    adim("Step 1 of 2: the Warp fee, " + (warp / 1e9) + " SOL (0.5% of your first buy). Confirm it in your wallet.");
    await onayBekle(await solanaCuzdan.gonder(await m.warpUcretTx({ rpc: RPC, kullanici: ben, arcSol: ARC_PULSE_SOL, lamport: warp })));
  }
  /* a launch transaction holds a recent blockhash for about a minute: after the fee step it is built and checked again */
  const son = warp > 0 ? await hazirla() : h;
  if (hatasi(son)) throw new Error("Raydium would refuse the launch now (" + JSON.stringify(hatasi(son).hata) + "); your Warp fee was paid, nothing else was sent.");
  let imza = null;
  for (const [i, t] of son.txler.entries()) {
    adim((warp > 0 ? "Step 2 of 2: " : "") + "the launch" + (lamport > 0 ? " and your first buy" : "") + (son.txler.length > 1 ? " (" + (i + 1) + "/" + son.txler.length + ")" : "") + ". Confirm it in your wallet.");
    imza = await solanaCuzdan.gonder(t);
    adim("Launching… waiting for Solana.");
    await onayBekle(imza);
  }
  return { token: son.mint, hash: imza, link: "https://raydium.io/launchpad/token/?mint=" + son.mint };
}
