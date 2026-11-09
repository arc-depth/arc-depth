/* elysium.js — Elysium as a pay-from chain (9 Nov 2026), in its own file: a phone that still holds an
   older aglar.js in its cache must not break the pages that import it (that happened once). The same
   object is exported from aglar.js; the pages import it from here. */
export const ELYSIUM = {
  anahtar: "elysium", ad: "Elysium", id: 99901, rpc: "https://rpc.elysium.kinetiq.xyz", gaz: "HYPE",
  kasif: "https://elysium.kinetiq.xyz/explorer", dolar: "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65", dolarSembol: "USDCe",
  sadeceOdeme: true,
};
