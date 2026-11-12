/* ===========================================================================
 * warp-durum.js — which Warp launchpads are live (one source for warp.js and
 * the Create chooser in gorunum/merkez.js)
 *
 * A connection is "live" only once a real launch through it has worked.
 * Montra opened with Halo (Pulse Squad #1, 12 Nov 2026); the others are
 * connected in code and open with their first real launch.
 * =========================================================================== */
export const ACIK = { montra: true, pump: false, raydium: false, meteora: false, flap: false, pons: false, clanker: false };

/** The launchpads offered in the Warp form, in its order, with the chains each launches on. */
export const WARP_LISTE = [
  { k: "montra", ad: "Montra", zincir: "Elysium" },
  { k: "pump", ad: "pump.fun", zincir: "Solana" },
  { k: "raydium", ad: "Raydium LaunchLab", zincir: "Solana" },
  { k: "meteora", ad: "Meteora", zincir: "Solana" },
  { k: "flap", ad: "Flap", zincir: "BNB Chain, Robinhood, Monad" },
  { k: "pons", ad: "Pons", zincir: "Robinhood" },
];
export const durumYazi = (k) => (ACIK[k] ? "Live" : "Coming soon");
