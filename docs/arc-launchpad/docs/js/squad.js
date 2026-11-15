/* squad.js — the Pulse Squad: ARC PULSE's own mascot memecoins, one per chain (from video/squad/squad.json).
 * `token` is filled in once a mascot is really launched; `x` is its launch post. Used by Warp, its token pages and Trade. */
export const SQUAD = [
  /* Halo's first token was exited on 15 Nov 2026; Halo returns later as a new token, so no date for now */
  { k: "halo", ad: "Halo", zincir: "Elysium", lp: "Montra", tarih: null, renk: "#c6f86b",
    kisilik: "Kind, brave and always first. The squad's guardian angel.", soz: "Every chain deserves a guardian." },
  { k: "zappy", ad: "Zappy", zincir: "Solana", lp: "pump.fun", tarih: "18 Nov" },
  { k: "blu", ad: "Blu", zincir: "Base", lp: "Clanker", tarih: "23 Nov" },
  { k: "feather", ad: "Feather", zincir: "Robinhood", lp: "Pons", tarih: "28 Nov" },
  { k: "goldie", ad: "Goldie", zincir: "BNB Chain", lp: "Flap", tarih: "3 Dec" },
  { k: "vio", ad: "Vio", zincir: "Monad", lp: "nad.fun", tarih: "8 Dec" },
  { k: "pulsy", ad: "Pulsy", zincir: "Arc", lp: "ARC PULSE", tarih: "13 Dec" },
  { k: "turbo", ad: "Turbo", zincir: "HyperEVM", lp: "Alt Fun", tarih: "18 Dec" },
  { k: "drip", ad: "Drip", zincir: "Sui", lp: "Turbos", tarih: "23 Dec" },
  { k: "yeti", ad: "Yeti", zincir: "Avalanche", lp: "Arena", tarih: "28 Dec" },
  { k: "pebble", ad: "Pebble", zincir: "Aptos", lp: "Emojicoin", tarih: "2 Jan" },
  { k: "bolt", ad: "Bolt", zincir: "Arbitrum", lp: "ARC PULSE", tarih: "7 Jan" },
];

/** the squad member behind a token address, if any */
export const squadOf = (token) => SQUAD.find((m) => m.token && token && m.token.toLowerCase() === String(token).toLowerCase()) || null;
/** a mascot's picture, relative to app.html */
export const squadResim = (m) => "img/squad/" + m.k + ".svg";
