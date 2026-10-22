/* ===========================================================================
 * aptos.js — the ARC PULSE launchpad on Aptos mainnet, from the browser
 *
 * The dispatch-aware build (dagitim-move-pulse.json, "aptos2"): the first
 * packages (16 Oct, at the deployer account) moved USDC with plain
 * fungible_asset calls, which Aptos refuses for Circle's USDC, so they can
 * never launch anything; this one uses dispatchable_fungible_asset. The
 * collateral is Aptos's native USDC, PulseSwap is the only "paste a token"
 * adapter, fees go to the deployer account.
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
  paket: "0xe1ddef8fcbf442f87657e4f1f6ee6cfa4954aa537ef362dd2a3991602defe1c4",
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
  },
  /* a Move script ({ bytecode, typeArguments, functionArguments } with typed arguments); returns the transaction hash */
  async betik(yuk) {
    const c = aptosCuzdani();
    if (!_hesap) await this.baglan();
    if (!c.standart) throw new Error("This needs a Wallet Standard Aptos wallet (Petra, Nightly…): the old injected API cannot sign scripts.");
    const r = await c.standart.features["aptos:signAndSubmitTransaction"].signAndSubmitTransaction({ payload: yuk });
    if (r.status === "Rejected") throw new Error("Rejected in the wallet.");
    return r.args.hash;
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

/* ---- a launched token: read, trade, redeem -------------------------- */
async function kaynak(adres, tip) {
  const r = await fetch(APTOS.api + "/accounts/" + adres + "/resource/" + tip);
  return r.ok ? (await r.json()).data : null;
}

/* everything the token page shows, from the chain */
export async function tokenDurumu(token) {
  const [meta, launch, backed] = await Promise.all([
    kaynak(token, "0x1::fungible_asset::Metadata"),
    kaynak(token, APTOS.paket + "::launchpad::Launch"),
    kaynak(token, APTOS.paket + "::launchpad::Backed"),
  ]);
  if (!meta || !launch) return null;
  const [rez, kasa, dolasim] = await Promise.all([
    gorus(APTOS.paket + "::launchpad::pool_reserves", [], [token]),
    gorus(APTOS.paket + "::launchpad::backing", [], [token]),
    gorus(APTOS.paket + "::launchpad::circulating", [], [token]),
  ]);
  let hedef = null;
  if (backed) {
    const [adres, miktar] = await gorus(APTOS.paket + "::launchpad::target_backing", [], [token]);
    const hm = await kaynak(adres, "0x1::fungible_asset::Metadata");
    hedef = { adres, miktar: BigInt(miktar), simge: hm ? hm.symbol : "?", ondalik: hm ? hm.decimals : 0 };
  }
  return {
    zincir: "aptos", token, ad: meta.name, simge: meta.symbol, ondalik: meta.decimals,
    kurucu: launch.founder, havuz: { tokenRez: BigInt(rez[0]), gercekDolar: BigInt(rez[1]), sanalDolar: BigInt(rez[2]), vergiPpm: Number(launch.tax_ppm), acilisSn: Number(launch.opened_at) },
    kasa: BigInt(kasa[0]), dolasim: BigInt(dolasim[0]), hedef
  };
}

export async function faBakiye(adres, meta) {
  const [b] = await gorus("0x1::primary_fungible_store::balance", ["0x1::fungible_asset::Metadata"], [adres, meta]);
  return BigInt(b);
}

export const al = (token, dolar, asgariToken) => aptosCuzdan.gonder(APTOS.paket + "::launchpad::buy", [], [token, dolar.toString(), asgariToken.toString()]);
export const sat = (token, miktar, asgariDolar) => aptosCuzdan.gonder(APTOS.paket + "::launchpad::sell", [], [token, miktar.toString(), asgariDolar.toString()]);
export const itfa = (token, miktar, yapistirilmis) => aptosCuzdan.gonder(APTOS.paket + "::launchpad::" + (yapistirilmis ? "redeem_backed" : "redeem"), [], [token, miktar.toString()]);

/* every launch on this launchpad: the tokens its account created (the
   indexer's fungible asset table; Aptos retired the events table) */
export async function launchListesi() {
  const q = { query: "query($c:String){ fungible_asset_metadata(where:{creator_address:{_eq:$c}}, order_by:{last_transaction_timestamp:desc}, limit:100){ asset_type name symbol decimals } }", variables: { c: APTOS.paket } };
  const r = await fetch(APTOS.api + "/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(q) }).then((x) => x.json());
  if (r.errors) throw new Error(r.errors[0].message);
  return r.data.fungible_asset_metadata.map((m) => ({ zincir: "aptos", token: m.asset_type, ad: m.name, simge: m.symbol }));
}
