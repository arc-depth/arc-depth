/* ===========================================================================
 * aptos.js — the ARC PULSE launchpad on Aptos mainnet, from the browser
 *
 * Published immutable on 16 Oct 2026 (dagitim-move-pulse.json): the
 * launchpad and PulseSwap live at the deployer account, the collateral is
 * Aptos's native USDC, PulseSwap is the only "paste a token" adapter.
 *
 * WALLETS
 *   Any Aptos wallet that speaks the Wallet Standard (AIP-62: Petra,
 *   Nightly, OKX, Pontem…) is found through the standard's register event;
 *   an older Petra that only injects window.aptos is used as a fallback.
 *   Nothing connects until the visitor presses the button.
 *
 * READS go straight to the Aptos fullnode API (views and transactions),
 * so a figure on the page is the chain's, not ours.
 * =========================================================================== */

export const APTOS = {
  anahtar: "aptos", ad: "Aptos", dolarSembol: "USDC", nesil: "move",
  paket: "0xc3318acec3eaf067b1865e86c39fb56529ae1cf181663c68750d79f28259da84",
  usdc: "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b",
  api: "https://api.mainnet.aptoslabs.com/v1",
  gezgin: "https://explorer.aptoslabs.com",
  /* every launch: 1,000,000,000 tokens with 6 decimals, as on the devnet run */
  ondalik: 6,
  arz: 1_000_000_000_000_000n,
  /* the opening price: whole supply against a 3,500 dollar virtual reserve */
  sanalRezerv: 3_500_000_000n,
  havuzYasi: 86_400,
  derinlikKati: 10n
};

/* ---- the Wallet Standard registry, minimal ------------------------- */
const _cuzdanlar = [];
function kaydet(...ws) { for (const w of ws) if (w && !_cuzdanlar.includes(w)) _cuzdanlar.push(w); return () => {}; }
if (typeof window !== "undefined") {
  window.addEventListener("wallet-standard:register-wallet", (e) => { try { e.detail({ register: kaydet }); } catch (x) { /* a bad wallet must not break the page */ } });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register: kaydet } })); } catch (x) { /* old browser */ }
}

/* the first wallet that can sign Aptos transactions, or the injected Petra */
function aptosCuzdani() {
  const w = _cuzdanlar.find((x) => x.features && x.features["aptos:signAndSubmitTransaction"] && x.features["aptos:connect"]);
  if (w) return { ad: w.name, standart: w };
  if (typeof window !== "undefined" && window.aptos) return { ad: "Petra", eski: window.aptos };
  return null;
}

let _hesap = null;
export const aptosCuzdan = {
  varMi: () => !!aptosCuzdani(),
  ad: () => (aptosCuzdani() || {}).ad,
  hesap: () => _hesap,
  async baglan() {
    const c = aptosCuzdani();
    if (!c) throw new Error("No Aptos wallet found. Install Petra (or any Aptos wallet) and reload.");
    if (c.standart) {
      const r = await c.standart.features["aptos:connect"].connect();
      const hesap = r && (r.args || r);
      if (r && r.status === "Rejected") throw new Error("The wallet refused the connection.");
      _hesap = String(hesap.address || (c.standart.accounts[0] || {}).address);
    } else {
      const r = await c.eski.connect();
      _hesap = String(r.address);
    }
    return _hesap;
  },
  /* entry function call; returns the transaction hash */
  async gonder(fn, typeArgs, args) {
    const c = aptosCuzdani();
    if (!_hesap) await this.baglan();
    if (c.standart) {
      const r = await c.standart.features["aptos:signAndSubmitTransaction"].signAndSubmitTransaction({ payload: { function: fn, typeArguments: typeArgs, functionArguments: args } });
      if (r.status === "Rejected") throw new Error("Rejected in the wallet.");
      return r.args.hash;
    }
    const r = await c.eski.signAndSubmitTransaction({ type: "entry_function_payload", function: fn, type_arguments: typeArgs, arguments: args });
    return r.hash;
  }
};

/* ---- reads ---------------------------------------------------------- */
async function gorus(fn, typeArgs, args) {
  const r = await fetch(APTOS.api + "/view", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ function: fn, type_arguments: typeArgs, arguments: args }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "view failed");
  return j;
}

export async function usdcBakiye(adres) {
  const [b] = await gorus("0x1::primary_fungible_store::balance", ["0x1::fungible_asset::Metadata"], [adres, APTOS.usdc]);
  return BigInt(b);
}

/* a pasted token: its metadata, and whether PulseSwap's pool for it can
   vouch for `dolar` (6-decimal units) right now */
export async function teminatHavuzu(token, dolar) {
  const meta = await fetch(APTOS.api + "/accounts/" + token + "/resource/0x1::fungible_asset::Metadata").then((r) => (r.ok ? r.json() : null));
  if (!meta) return { hata: "No fungible asset at that address on Aptos." };
  const t = { adres: token, ad: meta.data.name, simge: meta.data.symbol, ondalik: meta.data.decimals };
  let r;
  try { r = await gorus(APTOS.paket + "::swap::reserves", [], [token]); }
  catch (e) { return { ...t, hata: t.simge + " has no PulseSwap pool yet. A pool opened now can back launches 24 hours later." }; }
  const [tokenRez, dolarRez, acilis] = r.map((x) => BigInt(x));
  const yas = Math.floor(Date.now() / 1000) - Number(acilis);
  if (yas < APTOS.havuzYasi) return { ...t, hata: t.simge + "'s PulseSwap pool is " + Math.floor(yas / 3600) + " h old; it can back launches when it is 24 h old." };
  if (dolarRez < dolar * APTOS.derinlikKati) return { ...t, hata: t.simge + "'s pool holds " + (Number(dolarRez) / 1e6).toFixed(2) + " USDC; it needs ten times the collateral (" + (Number(dolar * APTOS.derinlikKati) / 1e6).toFixed(2) + ")." };
  /* x*y with PulseSwap's 0.10% protocol fee and 0.30% pool fee */
  const net = dolar - dolar / 1000n;
  const sonra = (net * 997000n) / 1000000n;
  return { ...t, cikti: (tokenRez * sonra) / (dolarRez + sonra) };
}

/* the opening buy is exact: launch fee 2%, the rest against the virtual reserve */
export function acilisTokeni(ilkAlim) {
  const x = ilkAlim - (ilkAlim * 20000n) / 1000000n;
  return (APTOS.arz * x) / (APTOS.sanalRezerv + x);
}

export async function islemBekle(hash) {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(APTOS.api + "/transactions/by_hash/" + hash).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r && r.type === "user_transaction") return r;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new Error("No result yet for " + hash);
}

/* the new token's address, from the launchpad's own Launched event */
export function launchTokeni(tx) {
  const e = (tx.events || []).find((x) => x.type === APTOS.paket + "::launchpad::Launched");
  return e ? e.data.token : null;
}

/* ---- the two launches ---------------------------------------------- */
const asgari = (x) => (x * 99n) / 100n;   // 1% slippage room on quoted outputs

export function launchDolar({ ad, sembol, teminat, ilkAlim, vergiPpm }) {
  return aptosCuzdan.gonder(APTOS.paket + "::launchpad::launch", [],
    [ad, sembol, APTOS.ondalik, APTOS.arz.toString(), teminat.toString(), ilkAlim.toString(), String(vergiPpm), asgari(acilisTokeni(ilkAlim)).toString()]);
}

export function launchTokenle({ ad, sembol, teminat, ilkAlim, vergiPpm, token, beklenen }) {
  return aptosCuzdan.gonder(APTOS.paket + "::swap::launch_with_token", [],
    [token, teminat.toString(), asgari(beklenen).toString(), ad, sembol, APTOS.ondalik, APTOS.arz.toString(), ilkAlim.toString(), String(vergiPpm), asgari(acilisTokeni(ilkAlim)).toString()]);
}
