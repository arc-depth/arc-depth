/* squad.js — the Pulse Squad: ARC PULSE's own mascot memecoins, one per chain (from video/squad/squad.json).
 * `token` is filled in once a mascot is really launched; `x` is its launch post. Used by Warp, its token pages and Trade. */
export const SQUAD = [
  /* no launches until the market recovers, 15 Nov 2026: every `tarih` is null, so every mascot shows "Coming soon" */
  /* Lumi (a glowing firefly) is the Elysium mascot since 15 Nov 2026 */
  { k: "lumi", ad: "Lumi", zincir: "Elysium", lp: "Montra", tarih: null, renk: "#7cf0a0",
    kisilik: "Bright, curious and first to spot something new. Lights the way to every launch.", soz: "Follow the glow." },
  { k: "zappy", ad: "Zappy", zincir: "Solana", lp: "pump.fun", tarih: null },
  { k: "blu", ad: "Blu", zincir: "Base", lp: "Clanker", tarih: null },
  { k: "feather", ad: "Feather", zincir: "Robinhood", lp: "Pons", tarih: null },
  { k: "goldie", ad: "Goldie", zincir: "BNB Chain", lp: "Flap", tarih: null },
  { k: "vio", ad: "Vio", zincir: "Monad", lp: "nad.fun", tarih: null },
  { k: "pulsy", ad: "Pulsy", zincir: "Arc", lp: "ARC PULSE", tarih: null },
  { k: "turbo", ad: "Turbo", zincir: "HyperEVM", lp: "Alt Fun", tarih: null },
  { k: "drip", ad: "Drip", zincir: "Sui", lp: "Turbos", tarih: null },
  { k: "yeti", ad: "Yeti", zincir: "Avalanche", lp: "Arena", tarih: null },
  { k: "pebble", ad: "Pebble", zincir: "Aptos", lp: "Emojicoin", tarih: null },
  { k: "bolt", ad: "Bolt", zincir: "Arbitrum", lp: "ARC PULSE", tarih: null },
];

/** the squad member behind a token address, if any */
export const squadOf = (token) => SQUAD.find((m) => m.token && token && m.token.toLowerCase() === String(token).toLowerCase()) || null;
/** a mascot's picture, relative to app.html */
export const squadResim = (m) => "img/squad/" + m.k + ".svg";
