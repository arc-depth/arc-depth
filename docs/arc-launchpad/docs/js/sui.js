/* ===========================================================================
 * sui.js — the ARC PULSE launchpad on Sui mainnet, from the browser
 *
 * Published 16 Oct 2026 (dagitim-move-pulse.json): launchpad + PulseSwap in
 * one package, every capability consumed, the package made immutable.
 *
 * A TOKEN ON SUI NEEDS ITS OWN PACKAGE
 *   A Sui coin type is defined by the package that declares it, and only
 *   that package's init gets the TreasuryCap. So a launch is two
 *   transactions from the founder's wallet:
 *     1 publish the coin template (sui/coin-sablon, bytecode in
 *       veri/sui-sablon.json) with its identifiers and NAME/SYMBOL rewritten
 *       by Mysten's move-bytecode-template; init mints nothing and hands the
 *       founder the TreasuryCap; the template's own package is made
 *       immutable in the same transaction
 *     2 launchpad::launch<T, USDC> (or swap::convert + launch_backed for a
 *       pasted token): the cap is locked in the vault, the whole supply goes
 *       into the pool, the founder's first buy comes back
 *
 * WALLETS: any Sui wallet on the Wallet Standard (Slush, Suiet, Phantom,
 * OKX…), found through the standard's register event; nothing connects
 * until the visitor presses the button.
 *
 * `ayarla` swaps the network (the tests run this module against a local
 * Sui network with its own package and test dollar).
 * =========================================================================== */
import { Transaction, SuiJsonRpcClient, normalizeSuiAddress, fromBase64, toBase64, bcs, sablonYukle, update_identifiers, update_constants } from "../vendor/sui.mjs";

export const SUI = {
  anahtar: "sui", ad: "Sui", dolarSembol: "USDC", nesil: "move",
  zincir: "sui:mainnet",
  rpc: "https://sui-rpc.publicnode.com",
  gezgin: "https://suiscan.xyz/mainnet",
  paket: "0x76399a58d2015436ab081cda41d9d2dffed0e2bd87d6a0b238743cde59d941ff",
  config: "0x4ed9f80bcebde893969689839472f1621ed8e66df9a9f67d1d3f508f3de9f80a",
  registry: "0x197f9625fbedc287c90210db792780994f96941dbefee6800cd4b4efed280d94",
  fees: "0xfb34b2c2b1c1552598e3ed4e5aaa746adc1eab252ec2bfde9a93155c4abdfad3",
  usdc: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  /* every launch: 1,000,000,000 tokens with 6 decimals, as on the other chains */
  ondalik: 6,
  arz: 1_000_000_000_000_000n,
  sanalRezerv: 3_500_000_000n,
  havuzYasMs: 86_400_000,
  derinlikKati: 10n,
  sablonUrl: null,      // set below from this module's own URL
  wasmUrl: null
};
if (typeof document !== "undefined") {
  SUI.sablonUrl = new URL("../veri/sui-sablon.json", import.meta.url).href;
  SUI.wasmUrl = new URL("../vendor/move_bytecode_template_bg.wasm", import.meta.url).href;
}
export function ayarla(degisen) { Object.assign(SUI, degisen); }

/* ---- reads ---------------------------------------------------------- */
let _istemci = null;
export const istemci = () => (_istemci && _istemci.__url === SUI.rpc ? _istemci : (_istemci = Object.assign(new SuiJsonRpcClient({ url: SUI.rpc }), { __url: SUI.rpc })));

export async function usdcBakiye(adres) {
  return BigInt((await istemci().getBalance({ owner: adres, coinType: SUI.usdc })).totalBalance);
}

/* the opening buy is exact: launch fee 2%, the rest against the virtual reserve */
export function acilisTokeni(ilkAlim) {
  const x = ilkAlim - (ilkAlim * 20000n) / 1000000n;
  return (SUI.arz * x) / (SUI.sanalRezerv + x);
}

/* a pasted token: PulseSwap's pool for it, and whether it can vouch for
   `dolar` (6-decimal units) now. `tip` is the coin type, 0x…::module::NAME */
export async function teminatHavuzu(tip, dolar) {
  const c = istemci();
  const meta = await c.getCoinMetadata({ coinType: tip }).catch(() => null);
  if (!meta) return { hata: "No Sui coin of that type." };
  const t = { tip, ad: meta.name, simge: meta.symbol, ondalik: meta.decimals };
  const reg = await c.getObject({ id: SUI.registry, options: { showContent: true } });
  const tablo = reg.data.content.fields.pools.fields.id.id;

  const alan = await c.getDynamicFieldObject({ parentId: tablo, name: { type: "0x1::type_name::TypeName", value: { name: normalizeTip(tip).replace(/^0x/, "") } } }).catch(() => null);
  if (!alan || !alan.data) return { ...t, hata: t.simge + " has no PulseSwap pool on Sui yet. A pool opened now can back launches 24 hours later." };
  const havuzId = alan.data.content.fields.value;
  const h = (await c.getObject({ id: havuzId, options: { showContent: true } })).data.content.fields;
  const tokenRez = BigInt(h.token), dolarRez = BigInt(h.dollars), acilis = Number(h.created_ms);
  const yas = Date.now() - acilis;

  if (yas < SUI.havuzYasMs) return { ...t, hata: t.simge + "'s PulseSwap pool is " + Math.floor(yas / 3600000) + " h old; it can back launches when it is 24 h old." };
  if (dolarRez < dolar * SUI.derinlikKati) return { ...t, hata: t.simge + "'s pool holds " + (Number(dolarRez) / 1e6).toFixed(2) + " USDC; it needs ten times the collateral (" + (Number(dolar * SUI.derinlikKati) / 1e6).toFixed(2) + ")." };
  /* x*y with PulseSwap's 0.10% protocol fee and 0.30% pool fee */
  const net = dolar - dolar / 1000n;
  const sonra = (net * 997000n) / 1000000n;
  return { ...t, havuzId, cikti: (tokenRez * sonra) / (dolarRez + sonra) };
}

/* 0x2::sui::SUI -> 0000…0002::sui::SUI, as Move's TypeName prints it */
export function normalizeTip(tip) {
  const [a, m, n] = tip.split("::");
  return normalizeSuiAddress(a) + "::" + m + "::" + n;
}

/* ---- the coin template ---------------------------------------------- */
let _wasm = null;
async function wasmHazir(wasm) {
  if (!_wasm) _wasm = sablonYukle(wasm ? { module_or_path: wasm } : { module_or_path: SUI.wasmUrl });
  return _wasm;
}

/* a Move identifier from a symbol: letters, digits, underscore, starting with a letter */
export function tanimlayici(sembol) {
  let s = String(sembol).toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (!/^[A-Z]/.test(s)) s = "T" + s;
  return s.slice(0, 32);
}

const vekU8 = (s) => bcs.vector(bcs.u8()).serialize(Array.from(new TextEncoder().encode(s))).toBytes();

/* the template's bytecode with this launch's names in it */
export async function sablonModulu(ad, sembol, { sablon, wasm } = {}) {
  await wasmHazir(wasm);
  const j = sablon || (await fetch(SUI.sablonUrl).then((r) => r.json()));
  const OTW = tanimlayici(sembol);
  let b = fromBase64(j.modules[0]);
  b = update_identifiers(b, { SABLON: OTW, sablon: OTW.toLowerCase() });
  b = update_constants(b, vekU8(sembol), vekU8("SABLON"), "Vector(U8)");
  b = update_constants(b, vekU8(ad), vekU8("Sablon Token Name Placeholder"), "Vector(U8)");
  return { modules: [toBase64(b)], dependencies: j.dependencies, modul: OTW.toLowerCase(), otw: OTW };
}

/* transaction 1: publish the coin, its package immutable at once */
export function yayinIslemi(sablon) {
  const tx = new Transaction();
  const cap = tx.publish({ modules: sablon.modules, dependencies: sablon.dependencies });
  tx.moveCall({ target: "0x2::package::make_immutable", arguments: [cap] });
  return tx;
}

/* from transaction 1's effects: the new coin type and its TreasuryCap */
export function yayinSonucu(degisimler, sablon) {
  const p = degisimler.find((o) => o.type === "published");
  const cap = degisimler.find((o) => o.type === "created" && /::coin::TreasuryCap</.test(o.objectType || ""));
  if (!p || !cap) throw new Error("The coin package was not published.");
  return { paket: p.packageId, tip: p.packageId + "::" + sablon.modul + "::" + sablon.otw, cap: cap.objectId };
}

/* transaction 2: the launch, paid from the founder's USDC coins */
export function launchIslemi({ sahip, tip, cap, usdcCoinler, teminat, ilkAlim, vergiPpm, yapistir }) {
  const tx = new Transaction();
  const [ilk, ...kalan] = usdcCoinler.map((id) => tx.object(id));
  if (kalan.length) tx.mergeCoins(ilk, kalan);
  const [tem, alim] = tx.splitCoins(ilk, [tx.pure.u64(teminat), tx.pure.u64(ilkAlim)]);
  const asgari = (acilisTokeni(ilkAlim) * 99n) / 100n;
  let tokenler;
  if (yapistir) {
    const conv = tx.moveCall({ target: SUI.paket + "::swap::convert", typeArguments: [yapistir.tip, SUI.usdc],
      arguments: [tx.object(yapistir.havuzId), tx.object(SUI.fees), tx.object(SUI.config), tem, tx.pure.u64((yapistir.cikti * 99n) / 100n), tx.object("0x6")] });
    tokenler = tx.moveCall({ target: SUI.paket + "::launchpad::launch_backed", typeArguments: [tip, SUI.usdc, yapistir.tip],
      arguments: [tx.object(SUI.config), tx.object(cap), tx.pure.u64(SUI.arz), conv, alim, tx.pure.u64(vergiPpm), tx.pure.u64(asgari), tx.object("0x6")] });
  } else {
    tokenler = tx.moveCall({ target: SUI.paket + "::launchpad::launch", typeArguments: [tip, SUI.usdc],
      arguments: [tx.object(SUI.config), tx.object(cap), tx.pure.u64(SUI.arz), tem, alim, tx.pure.u64(vergiPpm), tx.pure.u64(asgari), tx.object("0x6")] });
  }
  tx.transferObjects([tokenler], tx.pure.address(sahip));
  return tx;
}

export async function usdcCoinleri(sahip) {
  const out = [];
  let cursor = null;
  do {
    const r = await istemci().getCoins({ owner: sahip, coinType: SUI.usdc, cursor });
    out.push(...r.data.map((c) => c.coinObjectId));
    cursor = r.hasNextPage ? r.nextCursor : null;
  } while (cursor);
  return out;
}

/* ---- the Wallet Standard registry, minimal ------------------------- */
const _cuzdanlar = [];
function kaydet(...ws) { for (const w of ws) if (w && !_cuzdanlar.includes(w)) _cuzdanlar.push(w); return () => {}; }
if (typeof window !== "undefined") {
  window.addEventListener("wallet-standard:register-wallet", (e) => { try { e.detail({ register: kaydet }); } catch (x) { /* a bad wallet must not break the page */ } });
  try { window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register: kaydet } })); } catch (x) { /* old browser */ }
}
const suiCuzdani = () => _cuzdanlar.find((w) => w.features && w.features["standard:connect"] &&
  (w.features["sui:signAndExecuteTransaction"] || w.features["sui:signAndExecuteTransactionBlock"]) && (w.chains || []).some((c) => c.startsWith("sui:")));

let _hesap = null;
export const suiCuzdan = {
  varMi: () => !!suiCuzdani(),
  ad: () => (suiCuzdani() || {}).name,
  hesap: () => _hesap && _hesap.address,
  async baglan() {
    const w = suiCuzdani();
    if (!w) throw new Error("No Sui wallet found. Install Slush (or any Sui wallet) and reload.");
    const r = await w.features["standard:connect"].connect();
    _hesap = (r.accounts || w.accounts)[0];
    if (!_hesap) throw new Error("The wallet shared no account.");
    return _hesap.address;
  },
  /* sign and execute; returns the transaction with its object changes */
  async gonder(tx) {
    const w = suiCuzdani();
    if (!_hesap) await this.baglan();
    let digest;
    if (w.features["sui:signAndExecuteTransaction"]) {
      tx.setSenderIfNotSet(_hesap.address);
      const r = await w.features["sui:signAndExecuteTransaction"].signAndExecuteTransaction({ transaction: tx, account: _hesap, chain: SUI.zincir });
      digest = r.digest;
    } else {
      const r = await w.features["sui:signAndExecuteTransactionBlock"].signAndExecuteTransactionBlock({ transactionBlock: tx, account: _hesap, chain: SUI.zincir });
      digest = r.digest;
    }
    return islemBekle(digest);
  }
};

export async function islemBekle(digest) {
  const r = await istemci().waitForTransaction({ digest, options: { showEffects: true, showObjectChanges: true } });
  if (r.effects.status.status !== "success") throw new Error("Failed on chain: " + (r.effects.status.error || digest));
  return r;
}

/* the whole launch from the browser: two wallet prompts */
export async function launchEt({ ad, sembol, teminat, ilkAlim, vergiPpm, yapistir, durum = () => {} }) {
  const sahip = await suiCuzdan.baglan();
  const bakiye = await usdcBakiye(sahip);
  if (bakiye < teminat + ilkAlim) throw new Error("This wallet holds " + (Number(bakiye) / 1e6).toFixed(2) + " USDC on Sui; the launch needs " + (Number(teminat + ilkAlim) / 1e6).toFixed(2) + ".");
  durum("Preparing the coin…");
  const sablon = await sablonModulu(ad, sembol);
  durum("1/2 Approve creating the coin in your wallet…");
  const y = yayinSonucu((await suiCuzdan.gonder(yayinIslemi(sablon))).objectChanges, sablon);
  durum("2/2 Approve the launch in your wallet…");
  const r = await suiCuzdan.gonder(launchIslemi({ sahip, tip: y.tip, cap: y.cap, usdcCoinler: await usdcCoinleri(sahip), teminat, ilkAlim, vergiPpm, yapistir }));
  const kasa = r.objectChanges.find((o) => o.type === "created" && /::launchpad::Vault</.test(o.objectType || ""));
  return { tip: y.tip, kasa: kasa && kasa.objectId, digest: r.digest };
}
