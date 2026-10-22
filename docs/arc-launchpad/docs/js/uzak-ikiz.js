/* ===========================================================================
 * uzak-ikiz.js — a Sui or Aptos wallet on the one-pool platform
 *
 *   TWINS   sell / redeem / send to Arc: the twin gate burns the twins and
 *           LayerZero carries them (through the hop on Base) to the IkizHub
 *           on Arc, with the 192-byte order MerkezKapi reads, or none.
 *             Sui    kapi::gonder<T> returns the endpoint Call, routed in the
 *                    same transaction from the chain's own PTB description
 *                    (docs/js/lz-sui-ptb.js); the fee is kapi::teklif routed
 *                    the same way.
 *             Aptos  kapi::gonder (entry); the fee is the view kapi::ucret.
 *   LAUNCH  pay with USDC burned through Circle's CCTP v2 toward Arc. The
 *           burn names LaunchEmaneti (contracts/merkez/LaunchEmaneti.sol) as
 *           recipient and only caller, and carries the launch as its hook
 *           data; once Circle attests it, anyone calls LaunchEmaneti.isle and
 *           the launch runs on Arc with those dollars.
 *             Sui    deposit_for_burn → the USDC handler's burn → complete_burn
 *             Aptos  Circle's precompiled script deposit_for_burn_with_hook
 *                    (docs/vendor/cctp-aptos-v2-deposit_for_burn_with_hook.mv)
 * Amounts of twins are in their 6 decimals.
 * =========================================================================== */
import { SUI, suiCuzdan, islemBekle as suiBekle } from "./sui.js";
import { kayitliTip } from "./sui-ikiz.js";
import { APTOS, aptosCuzdan, islemBekle as aptosBekle } from "./aptos.js";
import { lzYonlendir, lzSuiTeklif } from "./lz-sui-ptb.js";

export const UZAK = {
  sui: {
    ikizPaket: "0xe397f5cf0c1382cfff29068d73a60aa186436bcdfe3b0fdd8d46ba02a4446bfb",
    kapiNesne: "0x05611ea5fa7f6b91d3cf9e934bd198d29c8898683b23995a6578706af5183dad",
    oapp: "0xfddd7363e4a8fc4fee42c47952beece8fdae712b4d3ff231b7cdb6588ba5fe46",
    /* Circle CCTP v2 on Sui (scripts/bekci-sui.js) */
    tmm: "0xeb14978abfe93a37c5d5bf86a0623b923553a5f0e794daac7724f1e2fdbfb830",
    tmmDurum: "0x06fb166941cd7bc095edc019d054a753ec3f1e4c25f28f2ecc4a6cfa0a9b1167",
    mtDurum: "0x0c067f7d325e5b60e3179712e7783534ba1556cbb3d359d8161497e37689230c",
    isleyici: "0x185ed207c4d64fc594882ab927f9f3c6ff957aad03df8a731ba64378faeeb2bf",
    isleyiciDurum: "0xa32de8a6dd0178fb05f662929d55cddb69a25c26bde4b83f89e36d17ead94c41",
    hazine: "0x57d6725e7a8b49a7b2a612f6bd66ab5f39fc95332ca48be421c3229d514a6de7",
    yasak: "0x0000000000000000000000000000000000000000000000000000000000000403",
    usdc: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  },
  aptos: {
    ikizHesap: "0xcba3e9e320a9cc5874625975fde00a9dcb6aa79b758bd228913c76cb7c17cda3",
    betik: "../vendor/cctp-aptos-v2-deposit_for_burn_with_hook.mv",
  },
  arcDomain: 26,
  kesinlik: 2000,
};

const pad = (a) => "0x" + String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");
const hexB = (h) => Uint8Array.from((String(h).replace(/^0x/, "").match(/../g) || []).map((x) => parseInt(x, 16)));
const baytHex = (b) => "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/* ---------------------------------------------------------------- Sui ---- */
let _lz = null;
async function lzSui() {
  if (!_lz) {
    const m = await import("../vendor/sui.mjs");
    _lz = { m, client: new m.SuiJsonRpcClient({ url: SUI.rpc }) };
  }
  return _lz;
}

function suiTeklifCagrisi(tx, token, alici32, miktar, istek) {
  const u = UZAK.sui;
  return tx.moveCall({ target: u.ikizPaket + "::kapi::teklif", arguments: [tx.object(u.kapiNesne), tx.object(u.oapp), tx.pure.address(pad(token)),
    tx.pure.vector("u8", Array.from(alici32)), tx.pure.u64(miktar), tx.pure.vector("u8", Array.from(istek))] });
}

/// LayerZero's fee in MIST for sending these twins from Sui, through the endpoint's own quote.
export async function suiTeklif(gonderen, token, alici32, miktar, istek = new Uint8Array(0)) {
  const { m, client } = await lzSui();
  const f = await lzSuiTeklif({ client, Transaction: m.Transaction, gonderen, kur: (tx) => suiTeklifCagrisi(tx, token, alici32, miktar, istek) });
  return f.nativeFee;
}

/// Twins of `token` this Sui address holds, and their coin type (null: not registered on Sui yet).
export async function suiIkizBakiye(sahip, token) {
  const tip = await kayitliTip(UZAK.sui.ikizPaket, UZAK.sui.kapiNesne, token);
  if (!tip) return { tip: null, miktar: 0n };
  const { client } = await lzSui();
  return { tip, miktar: BigInt((await client.getBalance({ owner: sahip, coinType: tip })).totalBalance) };
}

/// The transaction: burn `miktar` twins through the gate, routed through LayerZero's endpoint.
export async function suiGonderIslemi(sahip, { token, alici32, miktar, istek = new Uint8Array(0) }) {
  const { m, client } = await lzSui();
  const u = UZAK.sui;
  const tip = await kayitliTip(u.ikizPaket, u.kapiNesne, token);
  if (!tip) throw new Error("This token's twin coin is not registered on Sui yet.");
  const ucret = await suiTeklif(sahip, token, alici32, miktar, istek);
  const coinler = (await client.getCoins({ owner: sahip, coinType: tip })).data;
  if (coinler.reduce((n, c) => n + BigInt(c.balance), 0n) < BigInt(miktar)) throw new Error("You hold fewer twins than that on Sui.");
  const tx = new m.Transaction();
  tx.setSender(sahip);
  const [ilk, ...diger] = coinler.map((c) => tx.object(c.coinObjectId));
  if (diger.length) tx.mergeCoins(ilk, diger);
  const [para] = tx.splitCoins(ilk, [tx.pure.u64(miktar)]);
  /* the fee with a 10% margin; the gate's lz_send_and_refund returns what LayerZero does not take */
  const [ucretCoin] = tx.splitCoins(tx.gas, [tx.pure.u64((ucret * 11n) / 10n)]);
  const call = tx.moveCall({ target: u.ikizPaket + "::kapi::gonder", typeArguments: [tip], arguments: [tx.object(u.kapiNesne), tx.object(u.oapp),
    tx.pure.address(pad(token)), para, tx.pure.vector("u8", Array.from(alici32)), tx.pure.vector("u8", Array.from(istek)), ucretCoin] });
  await lzYonlendir({ client, Transaction: m.Transaction, tx, call, gonderen: sahip, tur: "send" });
  return { tx, ucret };
}

export async function suiGonder({ token, alici32, miktar, istek, durum = () => {} }) {
  const ben = await suiCuzdan.baglan();
  durum("Reading LayerZero's fee on Sui…");
  const { tx, ucret } = await suiGonderIslemi(ben, { token, alici32, miktar, istek });
  durum("LayerZero fee " + (Number(ucret) / 1e9).toFixed(3) + " SUI (+10%, the unused part comes back). Approve in your Sui wallet…");
  return { r: await suiCuzdan.gonder(tx), ucret };
}

/// The transaction: burn `miktar6` USDC on Sui toward LaunchEmaneti on Arc, carrying `kanca` (the launch).
export async function suiLaunchIslemi(sahip, { emanet, miktar6, kanca }) {
  const { m, client } = await lzSui();
  const u = UZAK.sui;
  const coinler = (await client.getCoins({ owner: sahip, coinType: u.usdc })).data;
  if (coinler.reduce((n, c) => n + BigInt(c.balance), 0n) < BigInt(miktar6)) throw new Error("Not enough USDC on Sui.");
  const tx = new m.Transaction();
  tx.setSender(sahip);
  const [ilk, ...diger] = coinler.map((c) => tx.object(c.coinObjectId));
  if (diger.length) tx.mergeCoins(ilk, diger);
  const [para] = tx.splitCoins(ilk, [tx.pure.u64(miktar6)]);
  const [makbuz, coin] = tx.moveCall({ target: u.tmm + "::deposit_for_burn::deposit_for_burn", typeArguments: [u.usdc], arguments: [para,
    tx.pure.u32(UZAK.arcDomain), tx.pure.address(pad(emanet)), tx.pure.address(pad(emanet)), tx.pure.u256(0), tx.pure.u32(UZAK.kesinlik),
    tx.pure.vector("u8", Array.from(kanca)), tx.object(u.tmmDurum)] });
  const [bilet] = tx.moveCall({ target: u.isleyici + "::handler::burn", arguments: [tx.object(u.isleyiciDurum), makbuz, coin, tx.object(u.yasak), tx.object(u.hazine)] });
  tx.moveCall({ target: u.tmm + "::deposit_for_burn::complete_burn", typeArguments: [u.usdc, u.isleyici + "::handler::Auth"],
    arguments: [bilet, tx.object(u.tmmDurum), tx.object(u.mtDurum)] });
  return tx;
}

export async function suiLaunch({ emanet, miktar6, kanca, durum = () => {} }) {
  const ben = await suiCuzdan.baglan();
  const tx = await suiLaunchIslemi(ben, { emanet, miktar6, kanca });
  durum("Burn $" + (Number(miktar6) / 1e6).toFixed(2) + " USDC on Sui toward the launch on Arc. Approve in your Sui wallet…");
  const r = await suiCuzdan.gonder(tx);
  return { kaynak: 8, hash: r.digest };
}

/* -------------------------------------------------------------- Aptos ---- */
async function gorus(fn, args) {
  const r = await fetch(APTOS.api + "/view", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ function: fn, type_arguments: [], arguments: args }) });
  const j = await r.json();
  if (!r.ok) throw new Error((j && j.message) || "Aptos view failed");
  return j;
}

/// LayerZero's fee in octas for sending these twins from Aptos (the gate's own view).
export async function aptosTeklif(token, alici32, miktar, istek = new Uint8Array(0)) {
  const [u] = await gorus(UZAK.aptos.ikizHesap + "::kapi::ucret", [pad(token), baytHex(alici32), String(miktar), baytHex(istek)]);
  return BigInt(u);
}

export async function aptosIkizBakiye(sahip, token) {
  const t = pad(token);
  const [var_] = await gorus(UZAK.aptos.ikizHesap + "::kapi::ikiz_var", [t]);
  if (!var_) return { meta: null, miktar: 0n };
  const [meta] = await gorus(UZAK.aptos.ikizHesap + "::kapi::ikiz_adresi", [t]);
  const r = await fetch(APTOS.api + "/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    function: "0x1::primary_fungible_store::balance", type_arguments: ["0x1::fungible_asset::Metadata"], arguments: [sahip, meta] }) }).then((x) => x.json());
  return { meta, miktar: BigInt(r[0]) };
}

export async function aptosGonder({ token, alici32, miktar, istek = new Uint8Array(0), durum = () => {} }) {
  await aptosCuzdan.baglan();
  durum("Reading LayerZero's fee on Aptos…");
  const ucret = await aptosTeklif(token, alici32, miktar, istek);
  durum("LayerZero fee " + (Number(ucret) / 1e8).toFixed(3) + " APT (+10%, the unused part comes back). Approve in your Aptos wallet…");
  const h = await aptosCuzdan.gonder(UZAK.aptos.ikizHesap + "::kapi::gonder", [],
    [pad(token), Uint8Array.from(alici32), String(miktar), Uint8Array.from(istek), String((ucret * 11n) / 10n)]);
  return { r: await aptosBekle(h), ucret };
}

/// The script payload for Circle's deposit_for_burn_with_hook (typed arguments, as wallets need for scripts).
export async function aptosLaunchYuku({ emanet, miktar6, kanca, bytecode }) {
  const { U64, U32, AccountAddress, MoveVector } = await import("../vendor/aptos-betik.mjs");
  bytecode ||= new Uint8Array(await fetch(new URL(UZAK.aptos.betik, import.meta.url)).then((r) => r.arrayBuffer()));
  return { bytecode, typeArguments: [], functionArguments: [new U64(BigInt(miktar6)), new U32(UZAK.arcDomain), AccountAddress.from(pad(emanet)),
    AccountAddress.from(pad(emanet)), AccountAddress.from(APTOS.usdc), new U64(0n), new U32(UZAK.kesinlik), MoveVector.U8(Uint8Array.from(kanca))] };
}

export async function aptosLaunch({ emanet, miktar6, kanca, durum = () => {} }) {
  const ben = await aptosCuzdan.baglan();
  const yuk = await aptosLaunchYuku({ emanet, miktar6, kanca });
  durum("Burn $" + (Number(miktar6) / 1e6).toFixed(2) + " USDC on Aptos toward the launch on Arc. Approve in your Aptos wallet…");
  const h = await aptosCuzdan.betik(yuk);
  await aptosBekle(h);
  return { kaynak: 9, hash: h, sahip: ben };
}

/* ------------------------------------------------------- the launch hook ---- */
/// The hook data LaunchEmaneti decodes: abi.encode(LaunchIstegi, address iade).
export function launchKancasi(AbiCoder, r, iade) {
  const T = "tuple(string,string,tuple(uint32,bytes32,uint256)[],uint256[],uint256,uint256,bytes32,uint32,uint32,uint32[],bytes,uint256,bytes,address,string[],uint32[],uint256)";
  return hexB(AbiCoder.defaultAbiCoder().encode([T, "address"], [r, iade]));
}

/// Circle's attestation for a burn from `kaynak` (domain) in transaction `hash`, once ready.
export async function onay(kaynak, hash) {
  const j = await fetch("https://iris-api.circle.com/v2/messages/" + kaynak + "?transactionHash=" + encodeURIComponent(hash)).then((r) => r.json()).catch(() => null);
  const m = j && j.messages && j.messages[0];
  return m && m.status === "complete" ? { message: m.message, attestation: m.attestation } : null;
}
