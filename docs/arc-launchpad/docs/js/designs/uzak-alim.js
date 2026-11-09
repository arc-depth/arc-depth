/* ===========================================================================
 * designs/uzak-alim.js — buy a design paying USDC from any of the 12 chains
 *
 * TasarimNFT2 makes msg.sender the buyer of record: the NFT, the escrow
 * (refund, "the key does not work", confirm) and the unlock key the file key
 * is encrypted to all belong to whoever calls al / alUsdc, and an NFT in an
 * open sale cannot be moved. A purchase run by someone else on Arc (relay's
 * solver executing calldata, or a helper contract) would make THEM the buyer.
 * So a buy from another chain is two steps, with no server of ours:
 *
 *   1. bring the dollars to the buyer's OWN address on Arc
 *        EVM chains + Solana  relay.link, EXACT_OUTPUT to Arc USDC
 *                             (USDG on Robinhood, Binance-Peg USDC on BNB)
 *        Sui, Aptos           Circle CCTP v2 burn to the Arc address with
 *                             Circle's forwarding ("cctp-forward" hook):
 *                             Circle mints on Arc, its fee comes out of it
 *   2. the buyer's EVM wallet buys on Arc as today (approve + alUsdc, the
 *      unlock key registered in the same call); Arc's gas is USDC, so the
 *      bridged amount carries a small gas reserve.
 *
 * Solana / Sui / Aptos wallets only pay: the design lives on Arc under an
 * EVM wallet (the file key is derived from an EVM signature), so the page
 * asks for that wallet first and sends the dollars to its address.
 * Nothing about the buyer is stored anywhere; every call is the buyer's own
 * wallet or a public read (relay.link quote/status, Circle's fee/attestation
 * API, the chains' RPCs).
 * =========================================================================== */
import { el } from "../ui.js";
import * as S from "./sozlesme.js";

export const RELAY = "https://api.relay.link";
export const ARC_USDC = "0x3600000000000000000000000000000000000000";
const SIFIR = "0x0000000000000000000000000000000000000000";
/* Circle's forwarding request: "cctp-forward" then zeros (version 0), as MerkezKapi / HaberciLZ send it */
export const ILET = "0x636374702d666f72776172640000000000000000000000000000000000000000";
export const MT_V2 = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";   // Circle MessageTransmitterV2 (same address on Arc)
const ASGARI_KOPRU = 500_000n;   // never bridge less than $0.50 (dust routes fail); the rest stays in the buyer's Arc wallet
/* approve (~55k) + alUsdc (~800k measured: the swap runs the pool hook, which wants 250k+ gas left). A wallet
   reserves gas limit x max fee up front, so the reserve covers a 2.6M limit at three times today's price;
   about $0.02 is actually spent at 20 gwei, the rest stays in the buyer's Arc wallet */
const ALIM_GAZI = 2_600_000n;

/* The 11 chains besides Arc. `id` is relay's chain id; `ag` the AGLAR key for EVM wallets. */
export const KAYNAKLAR = [
  { anahtar: "base", ad: "Base", tur: "evm", id: 8453, para: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", sembol: "USDC", gaz: "ETH" },
  { anahtar: "arbitrum", ad: "Arbitrum", tur: "evm", id: 42161, para: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", sembol: "USDC", gaz: "ETH" },
  { anahtar: "ethereum", ad: "Ethereum", tur: "evm", id: 1, para: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", sembol: "USDC", gaz: "ETH" },
  { anahtar: "avalanche", ad: "Avalanche", tur: "evm", id: 43114, para: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", sembol: "USDC", gaz: "AVAX" },
  { anahtar: "monad", ad: "Monad", tur: "evm", id: 143, para: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", sembol: "USDC", gaz: "MON" },
  { anahtar: "hyperevm", ad: "HyperEVM", tur: "evm", id: 999, para: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", sembol: "USDC", gaz: "HYPE" },
  { anahtar: "robinhood", ad: "Robinhood", tur: "evm", id: 4663, para: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", sembol: "USDG", gaz: "ETH", not: "Robinhood Chain has no USDC; its dollar is USDG, which relay.link turns into USDC on Arc." },
  { anahtar: "elysium", ad: "Elysium", tur: "evm", id: 99901, para: "0xb47c4C8F73F009CC0C0d3f92B388d13E293F0B65", sembol: "USDCe", gaz: "HYPE" },
  { anahtar: "bsc", ad: "BNB Chain", tur: "evm", id: 56, para: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", sembol: "USDC", gaz: "BNB" },
  { anahtar: "solana", ad: "Solana", tur: "solana", id: 792703809, para: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", sembol: "USDC", gaz: "SOL" },
  { anahtar: "sui", ad: "Sui", tur: "sui", domain: 8, sembol: "USDC", gaz: "SUI" },
  { anahtar: "aptos", ad: "Aptos", tur: "aptos", domain: 9, sembol: "USDC", gaz: "APT" },
];
export const kaynak = (anahtar) => KAYNAKLAR.find((k) => k.anahtar === anahtar);
const evmMi = (k) => k.tur === "evm";
const relayMi = (k) => k.tur === "evm" || k.tur === "solana";
const d6 = (m) => "$" + (Number(m) / 1e6).toFixed(2);
const d6i = (m) => "$" + (Number(m) / 1e6).toFixed(4).replace(/0{1,2}$/, "");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const pad32 = (a) => "0x" + String(a).toLowerCase().replace(/^0x/, "").padStart(64, "0");

/* ---------------------------------------------------------------- Arc side ---- */

let _gazFiyati = 0n;
/** The Arc gas reserve in USDC (6 dp): the approval + purchase at three times today's gas price, at least 5 cents. */
export async function gazPayi() {
  try { _gazFiyati = BigInt(await (await S.arc()).send("eth_gasPrice", [])); } catch (e) { /* keep the floor */ }
  const u = (ALIM_GAZI * _gazFiyati * 3n) / 10n ** 12n;     // native USDC has 18 dp; the token view 6
  return u > 50_000n ? u : 50_000n;
}
/** What approval + purchase actually spend at the last gas price read (~855k gas), 6 dp. */
export const gazHarcamasi = () => (855_000n * _gazFiyati) / 10n ** 12n;

/** What the Arc address holds and what it still needs for a `fiyat6` purchase. */
export async function arcIhtiyac(alici, fiyat6, gaz6) {
  const gaz = gaz6 != null ? gaz6 : await gazPayi();
  const bakiye = BigInt(await (await S.erc20(ARC_USDC)).balanceOf(alici));
  const gereken = fiyat6 + gaz;
  let eksik = gereken > bakiye ? gereken - bakiye : 0n;
  if (eksik > 0n && eksik < ASGARI_KOPRU) eksik = ASGARI_KOPRU;
  return { bakiye, gaz, gereken, eksik };
}

/** Wait until the Arc address holds `gereken` (6 dp). Returns true when it does, false after ~`sn` seconds. */
export async function arcVarisBekle(alici, gereken, durum, ne, sn = 600) {
  const c = await S.erc20(ARC_USDC);
  for (let i = 0; i < Math.ceil(sn / 4); i++) {
    const b = await c.balanceOf(alici).catch(() => null);
    if (b != null && BigInt(b) >= gereken) return true;
    durum && durum("Waiting for the USDC to arrive on Arc at " + alici.slice(0, 8) + "… (" + ne + ")");
    await bekle(4000);
  }
  return false;
}

/* --------------------------------------------------------------- relay.link ---- */

/** relay's request body for `eksik6` Arc USDC delivered to `alici`, paid from `k` by `kullanici`. */
export function relayGovde(k, kullanici, alici, eksik6) {
  return { user: kullanici, recipient: alici, originChainId: k.id, destinationChainId: 5042, originCurrency: k.para,
    destinationCurrency: ARC_USDC, amount: eksik6.toString(), tradeType: "EXACT_OUTPUT", refundTo: kullanici };
}

/** A relay quote, checked: the recipient is `alici`, at least `eksik6` arrives, every step runs on the paying chain. */
export async function relayTeklifi(k, kullanici, alici, eksik6) {
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(relayGovde(k, kullanici, alici, eksik6)), signal: AbortSignal.timeout(20_000) }).then((x) => x.json());
  if (!q || !q.steps) throw new Error("relay.link has no route from " + k.sembol + " on " + k.ad + " to Arc right now: " + ((q && q.message) || "try again in a minute") + ".");
  const d = q.details || {};
  if (d.recipient && d.recipient.toLowerCase() !== alici.toLowerCase()) throw new Error("relay's quote names another recipient (" + d.recipient + "). Nothing was paid.");
  const cikan = BigInt((d.currencyOut && (d.currencyOut.minimumAmount || d.currencyOut.amount)) || 0);
  if (cikan < eksik6) throw new Error("relay's quote delivers less than needed on Arc. Nothing was paid; try again.");
  for (const s of q.steps) for (const it of s.items || []) {
    if (s.kind !== "transaction" || !it.data) continue;
    if (evmMi(k) && Number(it.data.chainId) !== k.id) throw new Error("relay returned a step on chain " + it.data.chainId + " instead of " + k.ad + ". Nothing was paid.");
  }
  const f = q.fees || {};
  const n = (x) => Number((x && x.amountUsd) || 0);
  return {
    q,
    odenen: d.currencyIn ? d.currencyIn.amountFormatted : "?",
    odenenUsd: Number((d.currencyIn && d.currencyIn.amountUsd) || 0),
    relayUcret: n(f.relayer) + n(f.app),
    hedefGaz: n(f.gas),
    sure: Number(d.timeEstimate || 0),
    bakiye: d.userBalance != null && d.currencyIn ? Number(d.userBalance) / 10 ** Number((d.currencyIn.currency && d.currencyIn.currency.decimals) || 6) : null,
    istekId: (q.steps.map((s) => s.requestId).find(Boolean)) || null,
  };
}

async function evmMakbuz(ag, h, durum) {
  for (let i = 0; i < 120; i++) {
    const r = await fetch(ag.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [h] }) }).then((x) => x.json()).catch(() => null);
    if (r && r.result) { if (r.result.status !== "0x1") throw new Error("The transaction failed on " + ag.ad + ": " + h); return r.result; }
    if (i === 10 && durum) durum("Still waiting for " + ag.ad + " to confirm " + h.slice(0, 12) + "…");
    await bekle(2500);
  }
  throw new Error("No receipt yet for " + h + " on " + ag.ad + ". It may still go through: do NOT pay again. Check it in an explorer first, then reload.");
}

/** Run relay's steps from the paying wallet, then follow the request until it is done on Arc. */
export async function relayOde(k, t, { cuzdan, durum }) {
  if (evmMi(k)) {
    const { AGLAR, ELYSIUM } = await import("../aglar.js");
    const ag = AGLAR.find((a) => a.id === k.id) || (k.id === ELYSIUM.id ? ELYSIUM : null);
    if (!ag) throw new Error("Unknown chain " + k.ad + ".");
    for (const s of t.q.steps) for (const it of s.items || []) {
      if (s.kind !== "transaction" || !it.data) continue;
      durum((s.id === "approve" ? "Approve " + k.sembol + " for relay.link" : "Pay " + t.odenen + " " + k.sembol + " (≈ $" + t.odenenUsd.toFixed(2) + ")") + " on " + k.ad + " in your wallet…");
      const h = await cuzdan.agdaGonder(ag, { to: it.data.to, data: it.data.data, value: "0x" + BigInt(it.data.value || 0).toString(16) });
      durum("Sent on " + k.ad + ". Waiting for it to confirm…");
      await evmMakbuz(ag, h, durum);
    }
  } else {
    const m = await import("../solana-ikiz.js");
    const adim = t.q.steps.find((s) => s.items && s.items[0] && s.items[0].data && s.items[0].data.instructions);
    if (!adim) throw new Error("relay returned no Solana step.");
    durum("Approve in your Solana wallet: " + t.odenen + " USDC (≈ $" + t.odenenUsd.toFixed(2) + ")…");
    await m.relayAdimi(adim.items[0].data);
  }
  const id = t.istekId;
  if (!id) return;
  const izle = "relay.link/transaction/" + id;
  for (let i = 0; i < 72; i++) {
    const d = await fetch(RELAY + "/intents/status/v2?requestId=" + id, { signal: AbortSignal.timeout(15_000) }).then((x) => x.json()).catch(() => ({}));
    if (d.status === "success") return izle;
    if (d.status === "failure" || d.status === "refund" || d.status === "refunded")
      throw new Error("relay could not deliver on Arc (" + d.status + "); it refunds to your wallet on " + k.ad + ". Details: " + izle);
    durum("Paid on " + k.ad + ". relay.link is delivering the USDC to Arc… (" + izle + ")");
    await bekle(5000);
  }
  return izle;
}

/* ------------------------------------------------------- Circle CCTP (Sui, Aptos) ---- */

/** Circle's forwarding fee into Arc from `domain` (6 dp) and the cap the burn allows: twice the high quote plus a cent. */
export async function cctpUcret(domain) {
  const j = await fetch("https://iris-api.circle.com/v2/burn/USDC/fees/" + domain + "/26?forward=true", { signal: AbortSignal.timeout(15_000) }).then((x) => x.json()).catch(() => null);
  const s = (Array.isArray(j) ? j : (j && j.data) || []).find((x) => x.finalityThreshold === 2000);
  if (!s || !s.forwardFee) throw new Error("Circle did not quote its forwarding fee into Arc right now; try again in a minute.");
  const ff = s.forwardFee;
  const yuksek = BigInt(ff.high ?? ff.med ?? ff);
  const orta = BigInt(ff.med ?? ff.high ?? ff);
  const taban = BigInt(Math.ceil(Number(s.minimumFee || 0)));   // bps of the amount; 0 for standard transfers
  return { tahmini: orta, tavan: yuksek * 2n + 10_000n, tabanBps: taban };
}

/** The arguments of a CCTP v2 burn into Arc with forwarding (shared by Sui and Aptos). */
export function cctpParametre(alici, miktar6, tavan6) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(alici)) throw new Error("An Arc (EVM) address is needed.");
  return { miktar: BigInt(miktar6), domain: 26, mintAlici: pad32(alici), cagiran: pad32(SIFIR), tavan: BigInt(tavan6), kesinlik: 2000, kanca: ILET };
}

const hexB = (h) => Uint8Array.from((String(h).replace(/^0x/, "").match(/../g) || []).map((x) => parseInt(x, 16)));

/** Sui: burn USDC toward the Arc address (deposit_for_burn → the USDC handler's burn → complete_burn, as the launch does). */
export async function suiYakIslemi(sahip, p) {
  const { UZAK } = await import("../uzak-ikiz.js");
  const m = await import("../../vendor/sui.mjs");
  const { gqlTransport } = await import("../sui-gql.js");
  const client = new m.SuiJsonRpcClient({ transport: gqlTransport, network: "mainnet" });
  const u = UZAK.sui;
  const coinler = (await client.getCoins({ owner: sahip, coinType: u.usdc })).data;
  const var_ = coinler.reduce((n, c) => n + BigInt(c.balance), 0n);
  if (var_ < p.miktar) throw new Error("Not enough USDC on Sui: " + d6(var_) + " held, " + d6(p.miktar) + " needed.");
  const tx = new m.Transaction();
  tx.setSender(sahip);
  const [ilk, ...diger] = coinler.map((c) => tx.object(c.coinObjectId));
  if (diger.length) tx.mergeCoins(ilk, diger);
  const [para] = tx.splitCoins(ilk, [tx.pure.u64(p.miktar)]);
  const [makbuz, coin] = tx.moveCall({ target: u.tmm + "::deposit_for_burn::deposit_for_burn", typeArguments: [u.usdc], arguments: [para,
    tx.pure.u32(p.domain), tx.pure.address(p.mintAlici), tx.pure.address(p.cagiran), tx.pure.u256(p.tavan), tx.pure.u32(p.kesinlik),
    tx.pure.vector("u8", Array.from(hexB(p.kanca))), tx.object(u.tmmDurum)] });
  const [bilet] = tx.moveCall({ target: u.isleyici + "::handler::burn", arguments: [tx.object(u.isleyiciDurum), makbuz, coin, tx.object(u.yasak), tx.object(u.hazine)] });
  tx.moveCall({ target: u.tmm + "::deposit_for_burn::complete_burn", typeArguments: [u.usdc, u.isleyici + "::handler::Auth"],
    arguments: [bilet, tx.object(u.tmmDurum), tx.object(u.mtDurum)] });
  return tx;
}

/** Aptos: the typed script payload for Circle's deposit_for_burn_with_hook (same script the launch uses). */
export async function aptosYakYuku(p, bytecode) {
  const { UZAK } = await import("../uzak-ikiz.js");
  const { APTOS } = await import("../aptos.js");
  const { U64, U32, AccountAddress, MoveVector } = await import("../../vendor/aptos-betik.mjs");
  bytecode ||= new Uint8Array(await fetch(new URL(UZAK.aptos.betik, new URL("../uzak-ikiz.js", import.meta.url))).then((r) => r.arrayBuffer()));
  return { bytecode, typeArguments: [], functionArguments: [new U64(p.miktar), new U32(p.domain), AccountAddress.from(p.mintAlici),
    AccountAddress.from(p.cagiran), AccountAddress.from(APTOS.usdc), new U64(p.tavan), new U32(p.kesinlik), MoveVector.U8(hexB(p.kanca))] };
}

async function aptosUsdc(sahip) {
  const { APTOS } = await import("../aptos.js");
  const r = await fetch(APTOS.api + "/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    function: "0x1::primary_fungible_store::balance", type_arguments: ["0x1::fungible_asset::Metadata"], arguments: [sahip, APTOS.usdc] }) }).then((x) => x.json()).catch(() => null);
  return Array.isArray(r) ? BigInt(r[0]) : null;
}

/** Burn on Sui / Aptos from the connected wallet there. Returns { kaynak (domain), hash }. */
export async function cctpYak(k, p, durum) {
  if (k.tur === "sui") {
    const { suiCuzdan } = await import("../sui.js");
    const ben = await suiCuzdan.baglan();
    const tx = await suiYakIslemi(ben, p);
    durum("Burn " + d6(p.miktar) + " USDC on Sui toward your Arc address. Approve in your Sui wallet…");
    const r = await suiCuzdan.gonder(tx);
    return { kaynak: 8, hash: r.digest };
  }
  const { aptosCuzdan, islemBekle } = await import("../aptos.js");
  const ben = await aptosCuzdan.baglan();
  const var_ = await aptosUsdc(ben);
  if (var_ != null && var_ < p.miktar) throw new Error("Not enough USDC on Aptos: " + d6(var_) + " held, " + d6(p.miktar) + " needed.");
  durum("Burn " + d6(p.miktar) + " USDC on Aptos toward your Arc address. Approve in your Aptos wallet…");
  const h = await aptosCuzdan.betik(await aptosYakYuku(p));
  const r = await islemBekle(h);
  if (r && r.success === false) throw new Error("The burn failed on Aptos: " + (r.vm_status || h));
  return { kaynak: 9, hash: h };
}

/** Circle's attestation for a burn (null until ready). */
export async function cctpOnay(kaynak, hash) {
  const j = await fetch("https://iris-api.circle.com/v2/messages/" + kaynak + "?transactionHash=" + encodeURIComponent(hash), { signal: AbortSignal.timeout(15_000) }).then((r) => r.json()).catch(() => null);
  const m = j && j.messages && j.messages[0];
  return m && m.status === "complete" ? { message: m.message, attestation: m.attestation } : null;
}

/* ---------------------------------------------------------------------- the box ---- */

/**
 * "Pay with USDC from another chain" for a listed design.
 *   fiyat6     the listing's USDC price (6 dp)
 *   arcAlim    async (yaz) => the page's own Arc purchase with USDC (approve + alUsdc), run by the EVM wallet
 *   hesapIste  async () => connects the EVM wallet when needed
 *   eylem, durumSatiri   the page's own button / status helpers (same look as the rest of the box)
 *   onKontrol  optional async () => throws when the Arc purchase cannot run (checked before anything is paid)
 */
export function uzakAlimKutusu({ cuzdan, fiyat6, arcAlim, hesapIste, eylem, durumSatiri, onKontrol }) {
  const secim = el("select", { sinif: "girdi", attr: { "aria-label": "Chain to pay from" } },
    KAYNAKLAR.map((k) => el("option", { attr: { value: k.anahtar }, yazi: k.sembol + " on " + k.ad })));
  const aciklama = el("div", { sinif: "ds-cihaz" });
  const satirlar = el("div", { sinif: "ds-uzak-satirlar" });
  const d = durumSatiri();
  let teklif = null;   // { k, alici, ihtiyac, t | c }

  const k = () => kaynak(secim.value);
  const aciklamaYaz = () => {
    const x = k();
    teklif = null; satirlar.textContent = "";
    odeD.textContent = "Pay on " + x.ad + " and buy";
    aciklama.textContent = evmMi(x)
      ? "Your wallet pays " + x.sembol + " on " + x.ad + "; relay.link delivers USDC to the SAME address on Arc, then you confirm the purchase on Arc (your wallet switches to Arc). The design, the escrow and the file key belong to that address." + (x.not ? " " + x.not : "")
      : x.ad + " only pays here. The design, the escrow rights and the file key live on Arc under an EVM wallet (MetaMask, Rabbit, a WalletConnect wallet…): connect one first. The USDC goes to that wallet's Arc address and that wallet confirms the purchase — keep it: it is the only one that can open the file." +
        (relayMi(x) ? " " + x.ad + " → Arc by relay.link." : " " + x.ad + " → Arc by Circle (CCTP): your USDC is burned on " + x.ad + " and minted to your Arc address.");
  };

  async function hesapla(yaz) {
    const x = k();
    await hesapIste();
    if (onKontrol) await onKontrol();
    const alici = cuzdan.hesap();
    if (!alici) throw new Error("Connect an EVM wallet first: it is the buyer on Arc.");
    const ihtiyac = await arcIhtiyac(alici, fiyat6);
    const satir = (a, b) => el("div", { sinif: "ds-satir" }, [el("span", { yazi: a }), el("span", { yazi: b })]);
    const liste = [
      satir("Design price (paid on Arc, held in escrow until the file key is delivered)", d6(fiyat6)),
      satir("Arc gas reserve (Arc's gas is USDC; approval + purchase spend about " + d6i(gazHarcamasi()) + " today, the rest stays in your Arc wallet)", d6i(ihtiyac.gaz)),
      satir("Already at " + alici.slice(0, 8) + "… on Arc", d6i(ihtiyac.bakiye)),
    ];
    if (ihtiyac.eksik === 0n) {
      teklif = { x, alici, ihtiyac };
      satirlar.replaceChildren(...liste, satir("To bring from " + x.ad, "nothing: your Arc address already holds enough"));
      yaz("Your Arc address already holds enough USDC: the purchase runs on Arc directly.", "ok");
      return teklif;
    }
    liste.push(satir("To bring to Arc", d6i(ihtiyac.eksik) + (ihtiyac.eksik === ASGARI_KOPRU && ihtiyac.gereken - ihtiyac.bakiye < ASGARI_KOPRU ? " (the $0.50 minimum; the rest stays yours on Arc)" : "")));
    if (relayMi(x)) {
      yaz("Asking relay.link for the route…");
      let kullanici = alici;
      if (x.tur === "solana") { const m = await import("../solana-ikiz.js"); kullanici = await m.solanaCuzdan.baglan(); }
      const t = await relayTeklifi(x, kullanici, alici, ihtiyac.eksik);
      liste.push(
        satir("You pay on " + x.ad, t.odenen + " " + x.sembol + " (≈ $" + t.odenenUsd.toFixed(2) + ")"),
        satir("of which relay.link's fee", "≈ $" + t.relayUcret.toFixed(3) + (t.hedefGaz ? " + its gas ≈ $" + t.hedefGaz.toFixed(3) : "")),
        satir("Your own gas on " + x.ad, x.tur === "solana" ? "a Solana fee in SOL (a fraction of a cent)" : "two transactions (approve + deposit), paid in " + x.gaz + " (keep a little " + x.gaz + " there); your wallet shows the exact fee before you sign"),
        satir("Time", "relay ≈ " + (t.sure > 0 ? t.sure + " s" : "seconds") + " to Arc, then the Arc purchase (seconds)"));
      if (t.bakiye != null && t.bakiye < Number(t.odenen)) liste.push(el("div", { sinif: "ds-durum ds-durum--hata", yazi: "Your wallet holds " + t.bakiye.toFixed(2) + " " + x.sembol + " on " + x.ad + ": not enough for this payment." }));
      teklif = { x, alici, ihtiyac, t, kullanici };
    } else {
      yaz("Reading Circle's forwarding fee…");
      const c = await cctpUcret(x.domain);
      const miktar = ihtiyac.eksik + c.tavan + (ihtiyac.eksik * c.tabanBps + 9_999n) / 10_000n;
      liste.push(
        satir("You burn on " + x.ad, d6i(miktar) + " USDC"),
        satir("of which Circle's forwarding fee", "≈ " + d6i(c.tahmini) + " now, at most " + d6i(c.tavan) + "; whatever is not charged arrives on Arc with the rest"),
        satir("Your own gas on " + x.ad, "one transaction, paid in " + x.gaz + " (a fraction of a cent)"),
        satir("Time", "Circle attests the burn and mints on Arc, usually within a few minutes (no relay, no server of ours); then the Arc purchase"));
      teklif = { x, alici, ihtiyac, c, miktar };
    }
    satirlar.replaceChildren(...liste);
    yaz("This is the full cost. Nothing has been paid.", "ok");
    return teklif;
  }

  const fiyatD = eylem("See the cost", async (yaz) => { await hesapla(yaz); }, "dugme", d);

  const odeD = eylem("Pay and buy", async (yaz) => {
    const once = teklif && teklif.x === k() ? teklif : null;
    const yeni = await hesapla(yaz);
    if (cuzdan.hesap() && yeni.alici.toLowerCase() !== cuzdan.hesap().toLowerCase()) throw new Error("The wallet changed. Press again.");
    if (yeni.ihtiyac.eksik > 0n) {
      if (yeni.t) {
        if (once && once.t && yeni.t.odenenUsd > once.t.odenenUsd * 1.03 + 0.01)
          throw new Error("The cost moved since you checked it: now ≈ $" + yeni.t.odenenUsd.toFixed(2) + " instead of ≈ $" + once.t.odenenUsd.toFixed(2) + ". Nothing was paid. Press again to pay the new amount.");
        if (!once && !confirm("Pay " + yeni.t.odenen + " " + yeni.x.sembol + " (≈ $" + yeni.t.odenenUsd.toFixed(2) + ") on " + yeni.x.ad + "? relay.link delivers " + d6i(yeni.ihtiyac.eksik) + " USDC to " + yeni.alici + " on Arc; then you confirm the purchase there.")) return yaz("Cancelled. Nothing was paid.");
        const izle = await relayOde(yeni.x, yeni.t, { cuzdan, durum: yaz });
        const geldi = await arcVarisBekle(yeni.alici, yeni.ihtiyac.gereken, yaz, izle || "relay.link", 600);
        if (!geldi) throw new Error("Paid, but the USDC has not reached Arc yet. Do NOT pay again: follow " + (izle || "relay.link") + "; when it arrives, press \"Buy with USDC\" above (the dollars wait at your Arc address).");
      } else {
        if (!confirm("Burn " + d6i(yeni.miktar) + " USDC on " + yeni.x.ad + "? Circle mints it to " + yeni.alici + " on Arc (forwarding fee ≈ " + d6i(yeni.c.tahmini) + "); then you confirm the purchase there.")) return yaz("Cancelled. Nothing was paid.");
        const p = cctpParametre(yeni.alici, yeni.miktar, yeni.c.tavan);
        const r = await cctpYak(yeni.x, p, yaz);
        yaz("Burned on " + yeni.x.ad + " (" + r.hash.slice(0, 14) + "…). Circle attests it and mints USDC to your Arc address; this usually takes a few minutes. Keep this page open.");
        let geldi = await arcVarisBekle(yeni.alici, yeni.ihtiyac.gereken, yaz, "Circle CCTP, burn " + r.hash.slice(0, 12) + "…", 1200);
        if (!geldi) {
          const o = await cctpOnay(r.kaynak, r.hash);
          throw new Error(o ? "Circle attested the burn but its forwarder has not minted on Arc yet. Your dollars are safe: anyone can finish it on Arc with MessageTransmitterV2.receiveMessage (" + MT_V2 + ") and the attestation from iris-api.circle.com/v2/messages/" + r.kaynak + "?transactionHash=" + r.hash + ". Then press \"Buy with USDC\" above."
            : "Circle has not attested the burn yet (" + r.hash + "). Your dollars are safe; when they reach your Arc address, press \"Buy with USDC\" above.");
        }
      }
    }
    yaz("USDC is at your Arc address. Now confirm the purchase on Arc (your EVM wallet switches to Arc)…");
    await arcAlim(yaz);
  }, "dugme dugme--marka", d);

  secim.addEventListener("change", aciklamaYaz);
  aciklamaYaz();
  return el("details", { sinif: "ds-kutu ds-uzak" }, [
    el("summary", { yazi: "Pay with USDC from another chain" }),
    el("div", { sinif: "ds-cihaz", yazi: "Base, Arbitrum, Ethereum, Avalanche, Monad, HyperEVM, Robinhood, BNB Chain, Solana, Sui or Aptos. The dollars are brought to your address on Arc first, then the purchase runs on Arc from your own wallet — the same escrow and buyer protection as paying on Arc." }),
    secim, aciklama, satirlar, el("div", { sinif: "ds-dugmeler" }, [fiyatD, odeD]), d]);
}
