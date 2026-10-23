/* ===========================================================================
 * gorunum/merkez.js — one pool on Arc, every chain's door to it
 *
 * The model (MerkezKapi on Arc, 0xA3D9…4080, live 18 Oct 2026):
 *   LAUNCH  pay on your chain in its own gas token, one signature. relay.link
 *           brings Arc USDC and, in the same order, calls MerkezKapi.launch:
 *           the token and its only pool open on Arc, the 1–5 token basket
 *           goes to the vaults through the Defter, the token's twins are
 *           placed on the EVM chains and your tokens arrive on your chain.
 *   BUY     pay on your chain in its gas token; bought in the Arc pool,
 *           delivered to your chain.
 *   SELL    send the token from your chain to the gate (LayerZero, your
 *           gas); sold in the Arc pool, USDC paid on your chain (CCTP; BNB
 *           through the island gate; chains without a road: on Arc, same
 *           address).
 *   REDEEM  the same send with a redeem order: burned, the basket pays
 *           your share on your chain.
 * relay.link simulates the Arc calls before it quotes, so a route that
 * would fail is refused before anything is signed.
 * =========================================================================== */
import { el, sayfaUst, panel, not } from "../ui.js";
import { AGLAR } from "../aglar.js";
import { cuzdan } from "../cuzdan.js";
import * as egri from "../egri.js";
import { JsonRpcProvider, Contract, Interface, AbiCoder, zeroPadValue, keccak256, toUtf8Bytes, solidityPacked, decodeBase58, toBeHex } from "../../vendor/ethers.min.js";

const KAPI = "0xA3D9B4259fbd6Ca17b79f3b7A7dB55B34dA04080";
const LP = "0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const FTHM_ARC = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const RELAY = "https://api.relay.link";
const ARC_EID = 30417, ARC_DOMAIN = 26;
const UCU = "0x7B695AAd76507CB1080d38E03b743CbDd02F9d4e";   // SepetUcu on Arc (dagitim-sepet.json): burns a holder's own tokens for redemption
const SIFIR = "0x0000000000000000000000000000000000000000";

/* where a sale's dollars can be paid: the chains the Arc Haberci reaches (CCTP twins + the BNB island) */
/* Ethereum's Haberci since 18 Oct. Robinhood (35) has one too, but Circle has not opened CCTP routes INTO
   Robinhood yet (remoteTokenMessengers(35) is empty on Arc, Base, Ethereum, Arbitrum): its sellers are paid on Arc until it does */
const ODEME_DOMAIN = new Set([26, 6, 3, 1, 15, 19, 17, 0]);
/* the chains a basket line can sit on: those with a basket vault */
const SEPET_ZINCIR = [
  { ad: "Arc", domain: 26, tur: "evm", rpc: "https://arc-rpc.publicnode.com", ds: "arc", id: 5042, usdc: SIFIR, usdcDec: 18 },
  { ad: "Base", domain: 6, tur: "evm", rpc: "https://mainnet.base.org", ds: "base", id: 8453, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", usdcDec: 6 },
  { ad: "Arbitrum", domain: 3, tur: "evm", rpc: "https://arb1.arbitrum.io/rpc", ds: "arbitrum", id: 42161, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", usdcDec: 6 },
  { ad: "Avalanche", domain: 1, tur: "evm", rpc: "https://avalanche-c-chain-rpc.publicnode.com", ds: "avalanche", id: 43114, usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", usdcDec: 6 },
  { ad: "Monad", domain: 15, tur: "evm", rpc: "https://rpc.monad.xyz", ds: "monad", id: 143, usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", usdcDec: 6 },
  { ad: "HyperEVM", domain: 19, tur: "evm", rpc: "https://rpc.hyperliquid.xyz/evm", ds: "hyperevm", id: 999, usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", usdcDec: 6 },
  { ad: "BNB", domain: 17, tur: "evm", rpc: "https://bsc-dataseed.bnbchain.org", ds: "bsc", id: 56, usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", usdcDec: 18 },
  { ad: "Sui", domain: 8, tur: "sui", ds: "sui" },
  { ad: "Aptos", domain: 9, tur: "aptos", ds: "aptos" },
  /* listed so the choice is visible, not selectable until their vaults are deployed */
  { ad: "Ethereum", domain: 0, tur: "evm", rpc: "https://ethereum-rpc.publicnode.com", ds: "ethereum", id: 1, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", usdcDec: 6 },
  { ad: "Solana", domain: 5, kapali: "opens after launch" },
  { ad: "Robinhood", domain: 35, kapali: "waiting for Circle to open CCTP into Robinhood", tur: "evm", rpc: "https://rpc.mainnet.chain.robinhood.com", ds: "robinhood", id: 4663, usdc: "0x3884564BA51B349e7661c7e28Ad947DEE327FeDF", usdcDec: 6 },
];
const IKIZ_EID = [30416, 30184, 30110, 30101, 30102, 30106, 30390, 30367];   // the eight EVM chains other than Arc

/* ---- the second generation (arastirma/sepet-v2-tasarim.md) ----
   scripts/dagit-v2.js writes docs/veri/sepet-v2.json only after every
   contract is deployed AND wired; until then the file does not exist and
   this page keeps using the gate above. Nothing below is offered before. */
let V2 = null;
async function v2Yukle() {
  if (V2 === null) V2 = await fetch("veri/sepet-v2.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : false)).catch(() => false);
  return V2;
}
const S = () => (V2 ? { kapi: V2.kapi, lp: V2.launchpad, ucu: V2.ucu } : { kapi: KAPI, lp: LP, ucu: UCU });
/* v2: Circle forwarding delivers sale and founder dollars on these chains by itself */
const ILERI_DOMAIN = new Set([26, 6, 3, 0, 1, 15, 19, 5]);
/* v2: where relay delivers dollars on the two chains Circle does not reach (an open deposit address on Arc) */
const RELAY_DOLAR = { 17: [56, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"], 35: [4663, "0x5fc5360d0400a0fd4f2af552add042d716f1d168"] };
const UZAK_EID = { solana: 30168, sui: 30378, aptos: 30108 };
const KAPI2_ABI = new Interface([
  "function launch((string,string,(uint32,bytes32,uint256)[],uint256[],uint256,uint256,bytes32,uint32,uint32,uint32[],bytes,uint256,bytes,address,string[],uint32[],uint256)) payable returns (address)",
  "function al(address,uint256,uint256,uint32,bytes32,bytes,address) payable returns (uint256)",
  "function satArc(address,uint256,uint256,uint32,bytes32,uint256) returns (uint256)",
  "function vekilOf(address) view returns (address)"]);
const HUB_ABI = ["function ucret(uint32,bytes) view returns (uint256)", "function kapi(uint32) view returns (bytes32)"];

/// Circle's forwarding fee from Arc to `domain` (Iris), doubled plus 5 cents: the most the payout may lose on the way.
async function ileriUcret(domain) {
  if (domain === ARC_DOMAIN) return 0n;
  const j = await fetch("https://iris-api.circle.com/v2/burn/USDC/fees/26/" + domain + "?forward=true").then((x) => x.json()).catch(() => []);
  const s = (Array.isArray(j) ? j : j.data || []).find((x) => x.finalityThreshold === 2000) || {};
  const u = s.forwardFee ? BigInt(s.forwardFee.high ?? s.forwardFee.med ?? s.forwardFee) : 0n;
  return u * 2n + 50_000n;
}

/// v2: where a payout to a wallet on `ag` is sent from Arc. Circle-forwarding chains are paid
/// there; BNB and Robinhood through a relay open deposit address on Arc made for this wallet
/// (relay's solvers deliver that chain's dollar to it); the rest on Arc, same address.
async function odemeYeri(ag, ben) {
  if (ag.anahtar === "arc") return { zincir: ARC_DOMAIN, alici: zeroPadValue(ben, 32), maxUcret: 0n, yer: "Arc" };
  if (ILERI_DOMAIN.has(ag.domain)) return { zincir: ag.domain, alici: zeroPadValue(ben, 32), maxUcret: await ileriUcret(ag.domain), yer: ag.ad };
  const rd = RELAY_DOLAR[ag.domain];
  if (rd) {
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: ben, recipient: ben, originChainId: 5042, destinationChainId: rd[0], originCurrency: ARC_USDC, destinationCurrency: rd[1],
      amount: "20000000", tradeType: "EXACT_INPUT", useDepositAddress: true, refundTo: ben }) }).then((x) => x.json()).catch(() => ({}));
    const a = q.steps && q.steps[0] && q.steps[0].depositAddress;
    if (a) return { zincir: ARC_DOMAIN, alici: zeroPadValue(a, 32), maxUcret: 0n, yer: ag.ad + " (through relay)" };
  }
  return { zincir: ARC_DOMAIN, alici: zeroPadValue(ben, 32), maxUcret: 0n, yer: "Arc (your same address)" };
}

const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
/* every chain pays: Arc in its own USDC straight to the gate, the others through relay */
const odemeAglari = () => AGLAR;
/* where the gate delivers tokens for a wallet on `ag`: 0 means on Arc itself */
const teslimEid = (ag) => (ag.anahtar === "arc" ? 0 : ag.eid);
const sec = (lz, compose = 0, composeDeger = 0n) => composeDeger
  /* lzCompose with native value (v4 redemption from a twin: Arc's dollar pays the vault orders' fees) */
  ? solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128", "uint8", "uint16", "uint8", "uint16", "uint128", "uint128"],
    [3, 1, 17, 1, lz, 1, 35, 3, 0, compose, composeDeger])
  : compose
  ? solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128", "uint8", "uint16", "uint8", "uint16", "uint128"], [3, 1, 17, 1, lz, 1, 19, 3, 0, compose])
  : solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, lz]);
/* v4 (23 Oct 2026): a redemption pays the vault orders' messenger fees itself, quoted by the Defter */
const DEFTER4_ABI = ["function idOf(uint32,bytes32) view returns (uint64)", "function itfaUcreti(uint64,uint256,uint32,bytes32) view returns (uint256)"];
const v4mu = () => V2 && Number(V2.surum || 2) >= 4;
/// The fee (6-decimal dollars) a redemption of `miktar` of `t`, paid to `alici` on `hz`, sends along: the Defter's quote + 10%.
async function itfaUcreti(t, miktar, hz, alici) {
  const d = new Contract(V2.defter, DEFTER4_ABI, arc);
  const id = await d.idOf(ARC_DOMAIN, zeroPadValue(t, 32));
  const u = await d.itfaUcreti(id, miktar, hz, alici);
  return u === 0n ? 0n : (u * 11n) / 10n + 1n;
}
const OFT_ABI = ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
  "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable",
  "function balanceOf(address) view returns (uint256)"];
const KAPI_ABI = new Interface([
  "function launch((string,string,(uint32,bytes32,uint256)[],uint256[],uint256,uint256,bytes32,uint32,uint32,uint32[],bytes,uint256,bytes,address)) payable returns (address)",
  "function al(address,uint256,uint256,uint32,bytes32,bytes,address) payable returns (uint256)",
  "function vekilOf(address) view returns (address)"]);
const E = new Interface(["function approve(address,uint256) returns (bool)", "function decimals() view returns (uint8)", "function symbol() view returns (string)"]);

async function makbuz(ag, hash) {
  const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
  for (let i = 0; i < 160; i++) {
    const m = await p.getTransactionReceipt(hash).catch(() => null);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("No receipt yet for " + hash);
}

/// relay: one signature on `ag`, `usdc6` dollars (plus `yerel18` of Arc native) on Arc, then `txs` there.
/// relay's quote for exactly this order, without paying: what the founder will be asked on their chain.
async function relayTeklif(ag, ben, usdc6, yerel18, txs) {
  if (ag.anahtar === "arc") return null;
  const govde = { user: ben, recipient: ben, originChainId: ag.id, destinationChainId: 5042,
    originCurrency: SIFIR, destinationCurrency: SIFIR, amount: (usdc6 * 10n ** 12n + yerel18).toString(),
    tradeType: "EXACT_OUTPUT", txsGasLimit: 9_000_000, txs };
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  if (!q.steps) throw new Error("No route: " + (q.message || "try again") + (q.errorCode ? " (" + q.errorCode + ")" : ""));
  return q;
}

async function relayIle(ag, ben, usdc6, yerel18, txs, durum) {
  if (ag.anahtar === "arc") {
    /* on Arc the wallet already holds the dollars (native USDC is the same balance as the token): call the gate directly */
    for (const [i, t] of txs.entries()) {
      durum((i ? "Confirm the call to the gate" : "Approve the USDC") + " in your wallet (" + (i + 1) + "/" + txs.length + ")…");
      const h = await cuzdan.agdaGonder(ag, { to: t.to, data: t.data, value: "0x" + BigInt(t.value || 0).toString(16) });
      const m = await makbuz(ag, h);
      if (m.status !== 1) throw new Error("Reverted: " + h);
    }
    return null;
  }
  const govde = { user: ben, recipient: ben, originChainId: ag.id, destinationChainId: 5042,
    originCurrency: SIFIR, destinationCurrency: SIFIR, amount: (usdc6 * 10n ** 12n + yerel18).toString(),
    tradeType: "EXACT_OUTPUT", txsGasLimit: 9_000_000, txs };
  durum("Asking relay.link for the route (it simulates the Arc side first)…");
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  if (!q.steps) throw new Error("No route: " + (q.message || "try again") + (q.errorCode ? " (" + q.errorCode + ")" : ""));
  for (const adim of q.steps) for (const it of adim.items || []) {
    if (adim.kind !== "transaction") continue;
    durum("Pay " + Number(q.details.currencyIn.amountFormatted).toPrecision(5) + " " + q.details.currencyIn.currency.symbol + " (≈ $" + Number(q.details.currencyIn.amountUsd).toFixed(2) + ") in your wallet…");
    const d = it.data;
    const h = await cuzdan.agdaGonder(ag, { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
    const m = await makbuz(ag, h);
    if (m.status !== 1) throw new Error("Reverted: " + h);
  }
  return q;
}

/* ---- basket lines: the asset's id on its chain, and a starting quote ---- */

/// The asset as the vault names it: EVM address; Sui keccak256 of the coin type; Aptos the metadata object.
function varlikKimligi(zincir, girdi) {
  const g = girdi.trim();
  if (zincir.tur === "sui") {
    const [adr, ...kalan] = g.split("::");
    const t = adr.replace(/^0x/, "").toLowerCase().padStart(64, "0") + "::" + kalan.join("::");
    return keccak256(toUtf8Bytes(t));
  }
  /* Solana: the mint's 32 bytes */
  if (zincir.tur === "solana") return toBeHex(decodeBase58(g), 32);
  /* Aptos metadata addresses are often written short (APT is 0xa): left-pad the hex, any length */
  if (zincir.tur === "aptos") return "0x" + g.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  return zeroPadValue(g.toLowerCase(), 32);
}

/// A Sui coin type as the gate checks it: "<64 hex address>::module::Name".
function suiTipi(girdi) {
  const [adr, ...kalan] = girdi.trim().split("::");
  return adr.replace(/^0x/, "").toLowerCase().padStart(64, "0") + "::" + kalan.join("::");
}

async function ondalik(zincir, girdi) {
  if (zincir.tur === "evm") return Number(await new Contract(girdi, E.fragments, new JsonRpcProvider(zincir.rpc, undefined, { staticNetwork: false })).decimals());
  if (zincir.tur === "sui") {
    const { suiJsonRpc } = await import("../sui-gql.js");
    const m = await suiJsonRpc("suix_getCoinMetadata", [girdi]);
    if (!m) throw new Error("No Sui coin of type " + girdi);
    return m.decimals;
  }
  if (zincir.tur === "solana") {
    /* the mint account itself (byte 44 is the decimals): publicnode refuses getTokenSupply without a personal token */
    const r = await fetch("https://solana-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [girdi, { encoding: "base64" }] }) }).then((x) => x.json());
    const v = r.result && r.result.value;
    if (!v) throw new Error("No Solana mint at " + girdi + (r.error ? " (" + r.error.message + ")" : ""));
    const d = Uint8Array.from(atob(v.data[0]), (c) => c.charCodeAt(0));
    if (d.length < 45) throw new Error(girdi + " is not a Solana token mint.");
    return d[44];
  }
  const r = await fetch("https://api.mainnet.aptoslabs.com/v1/accounts/" + girdi + "/resource/0x1::fungible_asset::Metadata").then((x) => x.json());
  return Number(r.data.decimals);
}

/// Raw units of the asset one line's dollars buy now: a starting point
/// only (each line's auction starts at twice this and halves every 30
/// minutes). DexScreener first (median across its pools); where it has no
/// price (it does not index Arc), relay.link's same-chain quote.
async function teklifBirimi(zincir, girdi, dolar) {
  const adr = zincir.tur === "sui" ? girdi.trim() : girdi.trim().toLowerCase();
  const r = await fetch("https://api.dexscreener.com/tokens/v1/" + zincir.ds + "/" + encodeURIComponent(adr)).then((x) => x.json()).catch(() => []);
  const fiyatlar = (Array.isArray(r) ? r : []).map((p) => Number(p.priceUsd)).filter((x) => x > 0).sort((a, b) => a - b);
  if (fiyatlar.length) {
    const fiyat = fiyatlar[Math.floor(fiyatlar.length / 2)];
    const dec = await ondalik(zincir, girdi.trim());
    const birim = dolar / fiyat;
    return BigInt(Math.floor(birim * 1e6)) * 10n ** BigInt(dec) / 1_000_000n;
  }
  if (zincir.tur === "evm") {
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: KAPI, recipient: KAPI, originChainId: zincir.id, destinationChainId: zincir.id, originCurrency: zincir.usdc, destinationCurrency: girdi.trim(),
      amount: (BigInt(Math.round(dolar * 1e6)) * 10n ** BigInt(zincir.usdcDec - 6)).toString(), tradeType: "EXACT_INPUT" }) }).then((x) => x.json()).catch(() => ({}));
    if (q.details) return BigInt(q.details.currencyOut.amount);
  }
  throw new Error("No market price found for " + girdi.slice(0, 12) + "… on " + zincir.ad);
}

/* ---- the Arc pool's price ---- */
export async function havuzFiyati(token, lpAdres) {
  const lp = new Contract(lpAdres || S().lp, ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))"], arc);
  const k = await lp.havuzAnahtari(token);
  const id = keccak256(AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k[0], k[1], k[2], k[3], k[4]]));
  const yuva = keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32", "uint256"], [id, 6]));
  const w = await new Contract(PM, ["function extsload(bytes32) view returns (bytes32)"], arc).extsload(yuva);
  const sqrt = BigInt(w) & ((1n << 160n) - 1n);
  const ham = Number(sqrt) ** 2 / 2 ** 192;      // currency1 per currency0, raw units
  const tokenSifir = k[0].toLowerCase() === token.toLowerCase();
  /* dollars (6 dp) per token (18 dp) */
  return tokenSifir ? ham * 1e12 : (1 / ham) * 1e12;
}

export async function ciz({ param } = {}) {
  await v2Yukle();
  if (V2) {
    /* v2 reaches every vault chain: Robinhood's dollar is USDG (what relay delivers there), Solana once its gate is wired */
    for (const z of SEPET_ZINCIR) {
      if (z.domain === 35) { delete z.kapali; z.usdc = "0x5fc5360d0400a0fd4f2af552add042d716f1d168"; }
      if (z.domain === 5 && V2.uzak && V2.uzak.solana && V2.uzak.solana.kasa) { delete z.kapali; z.tur = "solana"; z.ds = "solana"; }
    }
  }
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Launch on any chain", "One pool on Arc, every chain's door to it"));
  kap.append(not("Every token here has one pool and one price, on Arc. You launch, buy and sell from your own chain with its own gas token, in one signature. The token lives on your chain as its twin. Fees are shown before you sign.", "bilgi"));

  let ag = odemeAglari().find((a) => a.anahtar === "base");
  const zincirSec = el("select", { sinif: "girdi", attr: { id: "merkez-zincir" } }, odemeAglari().map((a) => el("option", { attr: { value: a.anahtar }, yazi: a.ad + " (pay in " + a.gaz + ")" })));
  zincirSec.value = ag.anahtar;
  zincirSec.addEventListener("change", () => { ag = AGLAR.find((a) => a.anahtar === zincirSec.value); });
  kap.append(panel("Your chain", el("div", { sinif: "yigin" }, [zincirSec,
    el("div", { sinif: "alan__ipucu", yazi: V2 ? "EVM chains here. A Solana, Sui or Aptos wallet has its own panel at the bottom of this page." : "Solana, Sui and Aptos wallets come next; today the doors are the EVM chains." })])));

  /* ================= launch ================= */
  const ad = el("input", { sinif: "girdi", attr: { id: "merkez-ad", placeholder: "Name", maxlength: "32" } });
  const sembol = el("input", { sinif: "girdi", attr: { id: "merkez-sembol", placeholder: "SYMBOL", maxlength: "10" } });
  const alim = el("input", { sinif: "girdi girdi--sayi", attr: { id: "merkez-alim", type: "number", min: "100", max: "500", step: "10", value: "100" } });
  const vergi = el("select", { sinif: "girdi", attr: { id: "merkez-vergi" } }, [1, 2, 3, 4, 5].map((v) => el("option", { attr: { value: String(v) }, yazi: v + "% collateral tax" })));
  vergi.value = "2";
  /* five collateral slots, always on the page; a slot left without an address is not used */
  const satirlar = el("div", { sinif: "yigin" });
  const VARSAYILAN = [[26, "", 20], [6, "", 4], [3, "", 4], [8, "", 4], [9, "", 4]];   // empty: the founder chooses every token
  VARSAYILAN.forEach(([zd, adres, dolar], i) => {
    const z = el("select", { sinif: "girdi" }, SEPET_ZINCIR.map((s) => el("option", { attr: { value: String(s.domain), disabled: !!s.kapali }, yazi: s.ad + (s.kapali ? " — " + s.kapali : "") })));
    z.value = String(zd);
    const a = el("input", { sinif: "girdi", attr: { placeholder: i ? "token address (Sui: coin type) — empty: not used" : "token address (Sui: coin type)", value: adres } });
    const d = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "4", step: "1", value: String(dolar) } });
    const satir = el("div", { sinif: "yigin" }, [
      el("div", { sinif: "alan__etiket", yazi: "Collateral " + (i + 1) + (i ? " (optional)" : "") }),
      el("div", { sinif: "girdi-grup" }, [z, a, d, el("span", { sinif: "girdi-grup__son", yazi: "$" })]),
    ]);
    satir._oku = () => ({ zincir: SEPET_ZINCIR.find((s) => s.domain === Number(z.value)), adres: a.value.trim(), dolar: Number(d.value) });
    satirlar.append(satir);
  });
  const lDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const lDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Launch" });
  /* v2: the twins on Solana, Sui and Aptos cost far more to create than the EVM ones (measured 20 Oct:
     Solana ~9, Sui ~4.8, Aptos ~1.7 USDC against ~4 for all eight EVM twins), so by default they are
     created on demand: the first holder who moves the token there creates it (IkizHub.yarat, open to all) */
  /* v2: the founder chooses the twin chains; each costs its real LayerZero fee, shown before paying.
     A chain left out can get its twin later from anyone (IkizYayici.yay / IkizHub.yarat, open to all). */
  const IKIZ_ZINCIR = [["Robinhood", 30416], ["Base", 30184], ["Arbitrum", 30110], ["Ethereum", 30101], ["BNB", 30102],
    ["Avalanche", 30106], ["Monad", 30390], ["HyperEVM", 30367], ["Solana", 30168, "uzak"], ["Sui", 30378, "uzak"], ["Aptos", 30108, "uzak"]];
  const ikizKutular = IKIZ_ZINCIR.map(([zad, eid, uzak]) => {
    const k = el("input", { attr: { type: "checkbox", "data-eid": String(eid) } });
    /* the EVM twins by default; Ethereum (~$22 on 20 Oct: the twin is a contract deployed there) and
       Solana / Sui / Aptos cost more, chosen by hand — or made later by the first holder who moves there */
    k.checked = !uzak && eid !== 30101;
    k._eid = eid; k._uzak = !!uzak; k._ad = zad;
    return el("label", { sinif: "etiket", attr: { style: "display:inline-flex;gap:4px;margin:2px" } }, [k, el("span", { yazi: zad })]);
  });
  const ikizSecimi = () => ikizKutular.map((l) => l.firstChild).filter((k) => k.checked || (!k._uzak && teslimEid(ag) === k._eid));
  const uzakEtiket = el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Twin chains: where the token exists from the start (Arc always). Your own chain is always included: your tokens are delivered there. Each chain's real LayerZero fee is added to what you pay; a chain left out can get its twin later from anyone." }),
    el("div", {}, ikizKutular)]);
  let hazirOdeme = null;   // the order shown to the founder, paid on the second click
  const odemeDurum = () => { hazirOdeme = null; lDugme.textContent = "Launch"; };
  ikizKutular.forEach((l) => l.firstChild.addEventListener("change", odemeDurum));
  for (const g of [ad, sembol, alim, vergi, zincirSec]) g.addEventListener("change", odemeDurum);
  satirlar.addEventListener("change", odemeDurum);
  satirlar.addEventListener("input", odemeDurum);
  lDugme.addEventListener("click", async () => {
    const durum = (s) => { lDurum.textContent = s; };
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) return durum("Connect a wallet first.");
      /* second press: pay exactly the order that was shown */
      if (V2 && hazirOdeme) {
        const h = hazirOdeme;
        hazirOdeme = null;
        lDugme.textContent = "Launch";
        await relayIle(ag, ben, h.toplam, h.deger, h.txs, durum);
        durum(ag.anahtar === "arc" ? "Paid. Launched on Arc: the token and its pool are open and your tokens are in your wallet. Any LayerZero fee not used came back to you."
          : "Paid. relay launches on Arc within seconds; your tokens arrive on " + ag.ad + " in a few minutes. Any LayerZero fee not used comes back to your address on Arc.");
        return;
      }
      if (!ad.value.trim() || !sembol.value.trim()) return durum("Give the token a name and a symbol.");
      const alim6 = BigInt(Math.round(Number(alim.value) * 1e6));
      if (alim6 < 100_000_000n || alim6 > 500_000_000n) return durum("The first buy is between $100 and $500.");
      const ss = [...satirlar.children].map((s) => s._oku()).filter((s) => s.adres);
      if (!ss.length) return durum("Add at least one basket token.");
      const sepet = [], teklif = [];
      let teminat = 0n;
      for (const s of ss) {
        const asgari = !V2 && s.zincir.domain === 0 ? 25 : 4;
        if (!(s.dolar >= asgari)) return durum("Each basket line needs at least $" + asgari + ".");
        /* v4: a Solana / Sui / Aptos vault buys only an asset its own list names (written before the lock);
           any other line would wait as USDC forever, so it is refused here, before anything is signed */
        if (v4mu() && ["solana", "sui", "aptos"].includes(s.zincir.tur)) {
          durum("Checking that the " + s.zincir.ad + " vault can buy " + s.adres.slice(0, 14) + "…");
          const { uzakVarlikUygunMu } = await import("../v4-uzak-varlik.js");
          const u = await uzakVarlikUygunMu(s.zincir.tur, s.adres, V2.uzak);
          if (!u.uygun) return durum(s.zincir.ad + " line refused: " + (u.neden || "the vault there cannot buy this asset."));
        }
        durum("Pricing " + s.zincir.ad + " " + s.adres.slice(0, 10) + "… (DexScreener)…");
        const dolar6 = BigInt(Math.round(s.dolar * 1e6));
        sepet.push([s.zincir.domain, varlikKimligi(s.zincir, s.adres), dolar6]);
        teklif.push(await teklifBirimi(s.zincir, s.adres, s.dolar));
        teminat += dolar6;
      }
      if (teminat < 20_000_000n) return durum("The basket must hold at least $20 in total.");
      /* the twins' LayerZero fee, read with a live token of the same shape; the excess comes back */
      durum("Reading the LayerZero fee for the twins…");
      /* creating a twin measured 4.54–4.78M gas on 22 Oct (Monad the most); 3.5M ran out on every chain */
      const ikizSec = sec(6_300_000n);
      const yayici = new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)"], arc);
      const ikizUcret = ((await yayici.ucret(FTHM_ARC, IKIZ_EID, ikizSec)) * 13n) / 10n;
      const deger = ikizUcret + 2n * 10n ** 18n;      // + the founder's tokens to your chain; unused value refunded
      const toplam = alim6 + teminat;
      if (V2) {
        /* the founder's slice is paid where the founder is (Circle forwarding, or relay to BNB / Robinhood) */
        const ko = await odemeYeri(ag, ben);
        /* a Sui line names its coin type; the gate checks it against the line's hash */
        const tipler = ss.map((x) => (x.zincir.tur === "sui" ? suiTipi(x.adres) : ""));
        /* the twins on Solana, Sui and Aptos, through the hub: the chains whose gate is wired, and LayerZero's fee for each */
        durum("Reading the LayerZero fee for the Solana / Sui / Aptos twins…");
        const hub = new Contract(V2.hub, HUB_ABI, arc);
        const ornek = AbiCoder.defaultAbiCoder().encode(["uint8", "address", "string", "string"], [1, FTHM_ARC, ad.value.trim(), sembol.value.trim().toUpperCase()]);
        const uzak = [];
        let uzakUcret = 0n;
        const atlanan = [];
        const secilen = ikizSecimi();
        const evmIkiz = secilen.filter((k) => !k._uzak).map((k) => k._eid);
        for (const k of secilen.filter((x) => x._uzak)) {
          const zad = k._ad, eid = k._eid;
          if ((await hub.kapi(eid)) === zeroPadValue("0x00", 32)) continue;
          /* a chain LayerZero refuses to quote for this message (Solana: the executor's message size limit
             on Arc) is left out; the launch still goes, its twin there can be created later */
          const u = await hub.ucret(eid, ornek).catch(() => null);
          if (u == null) { atlanan.push(zad); continue; }
          uzak.push(eid);
          uzakUcret += u;
        }
        if (atlanan.length) durum("Twin not created now on: " + atlanan.join(", ") + " (LayerZero refused the quote). The launch goes on without it.");
        /* real fees, read now: the EVM twins (IkizYayici), the Solana / Sui / Aptos twins (IkizHub), and the
           founder's tokens to their chain (an existing launch's adapter: the same OFT, the same peers). A 10%
           margin covers gas moving before the order lands; what is not used comes back on Arc. */
        const evmGercek = evmIkiz.length ? await yayici.ucret(FTHM_ARC, evmIkiz, ikizSec) : 0n;
        const uzakGercek = uzakUcret;
        let teslimGercek = 0n;
        if (teslimEid(ag)) {
          const ornekAdaptor = new Contract("0xe204C0762F749183530a945B161b54D8454d80Be", OFT_ABI, arc);
          [teslimGercek] = await ornekAdaptor.quoteSend([teslimEid(ag), zeroPadValue(ben, 32), 10n ** 24n, 10n ** 24n, sec(100_000n), "0x", "0x"], false);
        }
        const pay = (x) => (x * 11n) / 10n;
        const ikizDeger = pay(evmGercek), uzakDeger = pay(uzakGercek), teslimDeger = pay(teslimGercek);
        const deger2 = ikizDeger + uzakDeger + teslimDeger;
        const istek = [ad.value.trim(), sembol.value.trim().toUpperCase(), sepet, teklif, BigInt(Number(vergi.value) * 10_000), alim6,
          ko.alici, ko.zincir, teslimEid(ag), evmIkiz, ikizSec, ikizDeger, sec(100_000n), ben, tipler, uzak, uzakDeger];
        const txs = [
          { to: ARC_USDC, data: E.encodeFunctionData("approve", [V2.kapi, toplam]), value: "0" },
          { to: V2.kapi, data: KAPI2_ABI.encodeFunctionData("launch", [istek]), value: deger2.toString() },
        ];
        durum("Asking relay.link for the route (it simulates the Arc side first)…");
        const q = await relayTeklif(ag, ben, toplam, deger2, txs);
        const usd = (x) => "$" + (Number(x) / 1e18).toFixed(2);
        const d6 = (x) => "$" + (Number(x) / 1e6).toFixed(2);
        const net = Number(toplam) / 1e6 + Number(deger2) / 1e18;
        const satirlarOzet = [
          "First buy " + d6(alim6) + " · collateral " + d6(teminat) + " (" + ss.length + " line" + (ss.length > 1 ? "s" : "") + ")",
          "Twins on " + evmIkiz.length + " EVM chain(s): LayerZero " + usd(evmGercek) + (uzak.length ? " · on " + uzak.length + " of Solana/Sui/Aptos: " + usd(uzakGercek) : ""),
          teslimGercek ? "Your tokens to " + ag.ad + ": LayerZero " + usd(teslimGercek) : "Your tokens stay on Arc",
          "+10% margin on those fees (" + usd(deger2 - evmGercek - uzakGercek - teslimGercek) + "), returned to you on Arc if unused",
          q ? "relay bridge: you pay " + Number(q.details.currencyIn.amountFormatted).toPrecision(5) + " " + q.details.currencyIn.currency.symbol +
            " (≈ $" + Number(q.details.currencyIn.amountUsd).toFixed(2) + "), of which relay's own fee ≈ $" + Math.max(0, Number(q.details.currencyIn.amountUsd) - net).toFixed(2)
            : "Paid directly on Arc: $" + net.toFixed(2) + " in total",
        ];
        hazirOdeme = { toplam, deger: deger2, txs };
        lDugme.textContent = "Confirm and pay" + (q ? " ≈ $" + Number(q.details.currencyIn.amountUsd).toFixed(2) : " $" + net.toFixed(2));
        durum(satirlarOzet.join("  ·  ") + ".  Check it, then press the button again to pay.");
        return;
      } else {
        const istek = [ad.value.trim(), sembol.value.trim().toUpperCase(), sepet, teklif, BigInt(Number(vergi.value) * 10_000), alim6,
          zeroPadValue(ben, 32), ODEME_DOMAIN.has(ag.domain) ? ag.domain : ARC_DOMAIN, teslimEid(ag), IKIZ_EID, ikizSec, ikizUcret, sec(100_000n), ben];
        const txs = [
          { to: ARC_USDC, data: E.encodeFunctionData("approve", [KAPI, toplam]), value: "0" },
          { to: KAPI, data: KAPI_ABI.encodeFunctionData("launch", [istek]), value: deger.toString() },
        ];
        await relayIle(ag, ben, toplam, deger, txs, durum);
      }
      durum("Paid. relay launches on Arc within seconds; your tokens arrive on " + ag.ad + " in a few minutes, the basket is bought by auction over the next hours.");
    } catch (x) { durum((x && x.message) || "Could not launch."); }
  });
  kap.append(panel("Launch", el("div", { sinif: "yigin" }, [
    V2 ? el("div", { sinif: "alan__ipucu", yazi: "Paying from a Solana, Sui or Aptos wallet? Use the panel \"From a Solana, Sui or Aptos wallet\" at the bottom of this page." })
      : el("a", { sinif: "alan__ipucu", attr: { href: "#olustur-move" }, yazi: "Paying from a Sui or Aptos wallet? Use the Sui / Aptos launch form →" }),
    el("div", { sinif: "girdi-grup" }, [ad, sembol]),
    el("div", { sinif: "alan__ipucu", yazi: "First buy $100–$500 (2% launch fee; the rest becomes your tokens at the opening price: $3,500 for the whole supply of 1,000,000,000)." }),
    el("div", { sinif: "girdi-grup" }, [alim, el("span", { sinif: "girdi-grup__son", yazi: "$ first buy" })]), vergi,
    el("div", { sinif: "alan__ipucu", yazi: v4mu()
      ? "Collateral basket: up to 5 tokens, mixed as you like across the chains below, at least $4 a line, at least $20 in total. Each line waits as USDC on Arc until it reaches $50 (every trade's collateral tax adds to it); then its vault buys the token from that chain's pool (by auction on Arc, BNB, Monad and Robinhood, which have no pool with an average price). Until then the line is redeemable as USDC."
      : "Collateral basket: up to 5 tokens, mixed as you like across the chains below, at least $4 a line ($25 on Ethereum), at least $20 in total. Bought into the vaults by auction; every trade's collateral tax re-buys it every $50." }),
    satirlar,
    V2 ? uzakEtiket : el("span"),
    el("div", { sinif: "alan__ipucu", yazi: "Every trade: 2.2% (0.3% you, 0.3% developers, 0.5% liquidity, 0.2% operations, 0.2% FTHM bought and burned, 0.7% back into the pool) plus your collateral tax." }),
    lDugme, lDurum])));

  /* ================= trade ================= */
  const token = el("input", { sinif: "girdi", attr: { id: "merkez-token", placeholder: "token address on Arc", value: (param && param.get("t")) || "" } });
  const fiyatYazi = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const fiyatOku = async () => {
    try {
      if (!/^0x[0-9a-fA-F]{40}$/.test(token.value.trim())) return;
      const v = await new Contract(S().kapi, KAPI_ABI.fragments, arc).vekilOf(token.value.trim());
      if (v === SIFIR) { fiyatYazi.textContent = "This token was not launched through this door."; return; }
      if (V2) {
        const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, V2.launchpad, PM, token.value.trim());
        const o = egri.ozet(st);
        const usd = (x) => "$" + (x >= 1000 ? Math.round(x).toLocaleString("en-US") : x.toFixed(2));
        fiyatYazi.textContent = "Price $" + o.fiyat.toPrecision(4) + " per token · market cap " + usd(o.piyasaDegeri) +
          " · real USDC in the pool " + usd(o.gercekDolar) + " · pool liquidity " + usd(o.likidite) +
          " (one pool on Arc, the same from every chain) · collateral tax " + (st.vergi * 100).toFixed(0) + "%";
        return;
      }
      const f = await havuzFiyati(token.value.trim());
      fiyatYazi.textContent = "Arc pool price: $" + f.toPrecision(4) + " per token";
    } catch (x) { fiyatYazi.textContent = "Could not read the pool: " + ((x && x.message) || ""); }
  };
  token.addEventListener("change", fiyatOku);

  const kayma = el("input", { sinif: "girdi girdi--sayi", attr: { id: "merkez-kayma", type: "number", min: "0.5", max: "50", step: "0.5", value: "3" } });
  const kaymaOrani = () => Math.min(Math.max(Number(kayma.value) || 3, 0.5), 50) / 100;
  const alTutar = el("input", { sinif: "girdi girdi--sayi", attr: { id: "merkez-al", type: "number", min: "1", step: "1", value: "20" } });
  const alDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const alDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Buy" });
  alDugme.addEventListener("click", async () => {
    const durum = (s) => { alDurum.textContent = s; };
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) return durum("Connect a wallet first.");
      const t = token.value.trim();
      const usdc6 = BigInt(Math.round(Number(alTutar.value) * 1e6));
      if (usdc6 < 1_000_000n) return durum("At least $1.");
      let asgari;
      if (V2) {
        const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, V2.launchpad, PM, t);
        const e = egri.alim(st, Number(usdc6) / 1e6);
        asgari = BigInt(Math.floor(e.token * (1 - kaymaOrani()) * 1e6)) * 10n ** 12n;
        durum("Estimate: ~" + Math.floor(e.token).toLocaleString("en-US") + " tokens, price impact +" + (e.etki * 100).toFixed(2) +
          "%, fees $" + e.ucret.toFixed(2) + " (2.2% + " + (st.vergi * 100).toFixed(0) + "% collateral tax). Minimum " + (100 - kaymaOrani() * 100) + "% of that, or nothing is bought.");
        await new Promise((ok) => setTimeout(ok, 1500));
      } else {
        const f = await havuzFiyati(t);
        /* at least 85% of what the pool price gives before fees and tax: the slippage limit */
        asgari = BigInt(Math.floor((Number(usdc6) / 1e6 / f) * 0.85 * 1e6)) * 10n ** 12n;
      }
      const deger = teslimEid(ag) ? 2n * 10n ** 18n : 0n;      // LayerZero fee for the delivery; none on Arc
      const txs = [
        { to: ARC_USDC, data: E.encodeFunctionData("approve", [S().kapi, usdc6]), value: "0" },
        { to: S().kapi, data: KAPI_ABI.encodeFunctionData("al", [t, usdc6, asgari, teslimEid(ag), zeroPadValue(ben, 32), teslimEid(ag) ? sec(100_000n) : "0x", ben]), value: deger.toString() },
      ];
      await relayIle(ag, ben, usdc6, deger, txs, durum);
      durum(ag.anahtar === "arc" ? "Paid. Bought on Arc; the tokens are in your wallet." : "Paid. Bought on Arc; the tokens arrive on " + ag.ad + " in a few minutes.");
    } catch (x) { durum((x && x.message) || "Could not buy."); }
  });

  const satTutar = el("input", { sinif: "girdi girdi--sayi", attr: { id: "merkez-sat", type: "number", min: "1", step: "1000", value: "100000" } });
  const satDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const gonder = async (tur) => {
    const durum = (s) => { satDurum.textContent = s; };
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) return durum("Connect a wallet first.");
      /* the deployed gate sells and redeems only what arrives from another chain; an Arc-side door comes with its next version */
      const t = token.value.trim();
      if (ag.anahtar === "arc") {
        /* the deployed gate sells only what arrives from another chain; its Arc-side sale comes with the next version */
        const miktar = BigInt(Math.round(Number(satTutar.value))) * 10n ** 18n;
        const tk = new Contract(t, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], arc);
        if ((await tk.balanceOf(ben)) < miktar) return durum("You hold less than that on Arc.");
        if (tur === 0) {
          if (!V2) return durum("Selling tokens held on Arc from this page opens with the gate's next version. Redeeming from the basket works now.");
          /* v2: the gate sells in one call and pays here; what a price limit leaves unsold comes back */
          const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, V2.launchpad, PM, t);
          const e = egri.satim(st, Number(miktar / 10n ** 12n) / 1e6);
          if (e.bitti) return durum("The pool cannot buy all of that: only ~$" + e.dolar.toFixed(2) + " is there for it. Sell less, or redeem from the basket.");
          const asgari = BigInt(Math.floor(e.dolar * (1 - kaymaOrani()) * 1e6));
          durum("Estimate: ~$" + e.dolar.toFixed(2) + " after fees ($" + e.ucret.toFixed(2) + "), price impact " + (e.etki * 100).toFixed(2) + "%. Approve the sale (1/2)…");
          let h = await cuzdan.agdaGonder(ag, { to: t, data: tk.interface.encodeFunctionData("approve", [V2.kapi, miktar]), value: "0x0" });
          if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
          durum("Sell (2/2)…");
          h = await cuzdan.agdaGonder(ag, { to: V2.kapi, data: KAPI2_ABI.encodeFunctionData("satArc", [t, miktar, asgari, ARC_DOMAIN, zeroPadValue(ben, 32), 0n]), value: "0x0" });
          if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
          return durum("Sold in the Arc pool; the USDC is in your wallet on Arc.");
        }
        /* v4: the vault orders' fees go with the burn (0 while no vault holds anything of the launch) */
        const ucret = v4mu() ? await itfaUcreti(t, miktar, ARC_DOMAIN, zeroPadValue(ben, 32)) : 0n;
        const adim = ucret > 0n ? 3 : 2;
        durum("Approve the burn (1/" + adim + ")…" + (ucret > 0n ? " The vaults' messenger fee is $" + (Number(ucret) / 1e6).toFixed(2) + " (the unused part comes back)." : ""));
        let h = await cuzdan.agdaGonder(ag, { to: t, data: tk.interface.encodeFunctionData("approve", [S().ucu, miktar]), value: "0x0" });
        if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
        if (ucret > 0n) {
          durum("Approve the fee (2/3)…");
          h = await cuzdan.agdaGonder(ag, { to: ARC_USDC, data: new Interface(["function approve(address,uint256) returns (bool)"]).encodeFunctionData("approve", [S().ucu, ucret]), value: "0x0" });
          if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
        }
        durum("Redeem (" + adim + "/" + adim + ")…");
        const U = new Interface(["function itfa(address,uint256,uint32,bytes32)", "function itfaUcretli(address,uint256,uint32,bytes32,uint256,address)"]);
        const veri = ucret > 0n ? U.encodeFunctionData("itfaUcretli", [t, miktar, ARC_DOMAIN, zeroPadValue(ben, 32), ucret, ben])
          : U.encodeFunctionData("itfa", [t, miktar, ARC_DOMAIN, zeroPadValue(ben, 32)]);
        h = await cuzdan.agdaGonder(ag, { to: S().ucu, data: veri, value: "0x0" });
        if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
        return durum(v4mu() ? "Burned for redemption: the waiting dollars' share is in your wallet now; each vault sells your share in its own pool (auction where it has none) and pays you on Arc."
          : "Burned for redemption; each vault sells your share by auction and pays you on Arc.");
      }
      const ikiz = await new Contract(YAYICI, ["function ikizAdresi(address) view returns (address)"], arc).ikizAdresi(t);
      const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
      const oft = new Contract(ikiz, OFT_ABI, p);
      const miktar = BigInt(Math.round(Number(satTutar.value))) * 10n ** 18n;
      if ((await oft.balanceOf(ben)) < miktar) return durum("You hold less than that on " + ag.ad + ".");
      let asgari = 0n;
      if (tur === 0 && V2) {
        const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, V2.launchpad, PM, t);
        const e = egri.satim(st, Number(miktar / 10n ** 12n) / 1e6);
        if (e.bitti) return durum("The pool cannot buy all of that: only ~$" + e.dolar.toFixed(2) + " is there for it. Sell less, or redeem from the basket.");
        asgari = BigInt(Math.floor(e.dolar * (1 - kaymaOrani()) * 1e6));
        durum("Estimate: ~$" + e.dolar.toFixed(2) + " after fees, price impact " + (e.etki * 100).toFixed(2) + "% (the price when it reaches Arc decides).");
      } else if (tur === 0) { const f = await havuzFiyati(t); asgari = BigInt(Math.floor(Number(miktar / 10n ** 12n) / 1e6 * f * 0.85 * 1e6)); }
      let yuk, yer;
      if (V2) {
        /* v2: the 192-byte order the gate reads (kind, payout chain, payee, minimum, fallback on Arc, Circle fee cap) */
        const o = await odemeYeri(ag, ben);
        yer = o.yer;
        yuk = AbiCoder.defaultAbiCoder().encode(["uint8", "uint32", "bytes32", "uint256", "address", "uint256"], [tur, o.zincir, o.alici, asgari, ben, o.maxUcret]);
      } else {
        const odeme = ODEME_DOMAIN.has(ag.domain) ? ag.domain : ARC_DOMAIN;
        yer = odeme === ARC_DOMAIN ? "Arc (your same address)" : ag.ad;
        yuk = AbiCoder.defaultAbiCoder().encode(["uint8", "uint32", "bytes32", "uint256", "address"], [tur, odeme, zeroPadValue(ben, 32), asgari, ben]);
      }
      /* v4 redemption: Arc's dollar for the vault orders' fees rides with the compose (the unused part comes back on Arc) */
      let secenekler = sec(200_000n, 900_000n);
      if (tur === 1 && v4mu()) {
        const o = await odemeYeri(ag, ben);
        const u = await itfaUcreti(t, miktar, o.zincir, o.alici);
        if (u > 0n) secenekler = sec(200_000n, 1_500_000n, u * 10n ** 12n);
      }
      const prm = [ARC_EID, zeroPadValue(S().kapi, 32), miktar, (miktar * 99n) / 100n, secenekler, yuk, "0x"];
      const [ucret] = await oft.quoteSend(prm, false);
      durum("Sending to the gate on Arc (LayerZero fee " + (Number(ucret) / 1e18).toPrecision(3) + " " + ag.gaz + ")…");
      const h = await cuzdan.agdaGonder(ag, { to: ikiz, data: new Interface(OFT_ABI).encodeFunctionData("send", [prm, [ucret, 0], ben]), value: "0x" + ucret.toString(16) });
      const m = await makbuz(ag, h);
      if (m.status !== 1) throw new Error("Reverted: " + h);
      durum(tur === 0 ? "Sent. Sold in the Arc pool; the USDC is paid on " + yer + " (minutes; Ethereum-anchored chains up to ~20)." :
        "Sent. Burned for redemption; each vault sells your share " + (v4mu() ? "in its own pool (auction where it has none)" : "by auction") + " and pays on " + yer + ".");
    } catch (x) { durum((x && x.message) || "Could not send."); }
  };
  const tasZincir = el("select", { sinif: "girdi" }, Object.keys(UZAK_EID).map((z) => el("option", { attr: { value: z }, yazi: z[0].toUpperCase() + z.slice(1) })));
  const tasAlici = el("input", { sinif: "girdi", attr: { placeholder: "your address there (Solana: wallet address; Sui / Aptos: 0x…)" } });
  const tasTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1000", value: "100000" } });
  const tasDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const tasDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Move from Arc" });
  tasDugme.addEventListener("click", async () => {
    const durum = (x) => { tasDurum.textContent = x; };
    try {
      if (!V2) return durum("Opens with the second generation.");
      if (ag.anahtar !== "arc") return durum("Choose Arc as your chain: this moves tokens you hold on Arc.");
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) return durum("Connect a wallet first.");
      const t = token.value.trim(), eid = UZAK_EID[tasZincir.value];
      const g = tasAlici.value.trim();
      const alici = tasZincir.value === "solana" ? toBeHex(decodeBase58(g), 32) : zeroPadValue(g.toLowerCase(), 32);
      const miktar = BigInt(Math.round(Number(tasTutar.value))) * 10n ** 18n;
      const HUB = new Interface(["function yarat(address,uint32[],address) payable", "function gonder(address,uint32,bytes32,uint256,address) payable returns (uint256)",
        "function ucret(uint32,bytes) view returns (uint256)", "function yaratildi(address,uint32) view returns (bool)", "function kapi(uint32) view returns (bytes32)"]);
      const hub = new Contract(V2.hub, HUB.fragments, arc);
      if ((await hub.kapi(eid)) === zeroPadValue("0x00", 32)) return durum("That chain's twin gate is not wired.");
      const tk = new Contract(t, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)",
        "function name() view returns (string)", "function symbol() view returns (string)"], arc);
      if ((await tk.balanceOf(ben)) < miktar) return durum("You hold less than that on Arc.");
      const c = AbiCoder.defaultAbiCoder();
      const tasiUcret = (await hub.ucret(eid, c.encode(["uint8", "address", "bytes32", "uint256"], [2, t, alici, miktar / 10n ** 12n]))) * 13n / 10n;
      let yaratUcret = 0n;
      const var_ = await hub.yaratildi(t, eid);
      if (!var_) yaratUcret = (await hub.ucret(eid, c.encode(["uint8", "address", "string", "string"], [1, t, await tk.name(), await tk.symbol()]))) * 13n / 10n;
      durum((var_ ? "" : "The twin does not exist there yet: you create it first (" + (Number(yaratUcret) / 1e18).toFixed(2) + " USDC). ") +
        "Moving costs " + (Number(tasiUcret) / 1e18).toFixed(2) + " USDC of LayerZero fees (unused fee comes back).");
      let adim = 1; const toplam = var_ ? 2 : 3;
      if (!var_) {
        durum("Create the twin (" + adim++ + "/" + toplam + ")…");
        const h = await cuzdan.agdaGonder(ag, { to: V2.hub, data: HUB.encodeFunctionData("yarat", [t, [eid], ben]), value: "0x" + yaratUcret.toString(16) });
        if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
      }
      durum("Approve (" + adim++ + "/" + toplam + ")…");
      let h = await cuzdan.agdaGonder(ag, { to: t, data: tk.interface.encodeFunctionData("approve", [V2.hub, miktar]), value: "0x0" });
      if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
      durum("Move (" + adim++ + "/" + toplam + ")…");
      h = await cuzdan.agdaGonder(ag, { to: V2.hub, data: HUB.encodeFunctionData("gonder", [t, eid, alici, miktar, ben]), value: "0x" + tasiUcret.toString(16) });
      if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
      durum("Sent. LayerZero delivers it on " + tasZincir.value + " in a few minutes" + (tasZincir.value === "sui" ? " (on Sui the coin type is registered once per token; until then the transfer waits there and anyone can deliver it)." : "."));
    } catch (x) { durum((x && x.message) || "Could not move."); }
  });
  /* Sui: the twin's coin type, published once per token by anyone (docs/js/sui-ikiz.js) */
  const suiDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const suiDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Register this token's Sui coin (Sui wallet)" });
  suiDugme.addEventListener("click", async () => {
    const durum = (x) => { suiDurum.textContent = x; };
    try {
      if (!V2 || !V2.uzak || !V2.uzak.sui) return durum("Opens with the second generation.");
      const m = await import("../sui-ikiz.js");
      const r = await m.tipiKaydet({ paket: V2.uzak.sui.ikizPaket, kapi: V2.uzak.sui.kapiNesne, token: token.value.trim(), durum });
      durum("Registered: " + r.tip + (r.teslim ? "; " + r.teslim + " waiting transfer(s) delivered." : "."));
    } catch (x) { durum((x && x.message) || "Could not register."); }
  });
  /* the founder's slice of every trade waits in the launch's KurucuVekili on Arc; anyone sends it on (ilet) */
  const kpDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const kpDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Send the founder's trading income" });
  const VEKIL = ["function ilet(uint256)", "function kurucuZincir() view returns (uint32)", "function kurucu() view returns (bytes32)"];
  const kpOku = async () => {
    const v = await new Contract(S().kapi, KAPI_ABI.fragments, arc).vekilOf(token.value.trim());
    if (v === SIFIR) throw new Error("This token was not launched through this door.");
    const b = await new Contract(ARC_USDC, ["function balanceOf(address) view returns (uint256)"], arc).balanceOf(v);
    const z = Number(await new Contract(v, VEKIL, arc).kurucuZincir());
    return { v, b, z };
  };
  kpDugme.addEventListener("click", async () => {
    const durum = (x) => { kpDurum.textContent = x; };
    try {
      if (!V2) return durum("Opens with the second generation.");
      const { v, b, z } = await kpOku();
      if (b === 0n) return durum("Nothing has accrued yet.");
      if (z !== ARC_DOMAIN && b < 1_000_000n) return durum("$" + (Number(b) / 1e6).toFixed(2) + " has accrued; it is sent on from $1 (below that the delivery costs more than it carries).");
      /* Circle's forwarding fee for the founder's chain, capped at 5% by the contract */
      let maxUcret = await ileriUcret(z);
      if (maxUcret * 20n > b) maxUcret = b / 20n;
      durum("$" + (Number(b) / 1e6).toFixed(2) + " to the founder (Circle fee at most $" + (Number(maxUcret) / 1e6).toFixed(2) + "). Confirm in your wallet (on Arc; anyone can send it, it always goes to the founder)…");
      const arcAg = AGLAR.find((a) => a.anahtar === "arc");
      const h = await cuzdan.agdaGonder(arcAg, { to: v, data: new Interface(VEKIL).encodeFunctionData("ilet", [maxUcret]), value: "0x0" });
      if ((await makbuz(arcAg, h)).status !== 1) throw new Error("Reverted: " + h);
      durum("Sent to the founder" + (z === ARC_DOMAIN ? " on Arc." : ": it arrives on their chain in minutes."));
    } catch (x) { durum((x && x.message) || "Could not send."); }
  });
  /* v4: each trade's collateral tax lands in the launch's bucket (VergiKovasi) and the hook passes it on
     within 1.5M gas. When several basket lines cross $50 in the same trade the passing needs more
     (measured 1.38M for five lines plus the 63/64 reserve) and the dollars wait in the bucket; anyone
     can pass them on here, with the gas it needs. Nothing is lost while they wait. */
  const kovaDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const kovaDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Pass the waiting collateral tax to the basket" });
  kovaDugme.addEventListener("click", async () => {
    const durum = (x) => { kovaDurum.textContent = x; };
    try {
      if (!V2 || !(V2.surum >= 4)) return durum("Opens with basket v4.");
      const lp = new Contract(V2.launchpad, ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))",
        "function launchIdOfPool(bytes32) view returns (uint256)",
        "function launchAt(uint256) view returns ((address token,address acici,address kasa,uint256 teminat,address kurucu,uint256 kurucuToken,uint256 teklif,uint256 vergiPpm,uint64 zaman))"], arc);
      const k = await lp.havuzAnahtari(token.value.trim());
      const pid = keccak256(AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24", "int24", "address"], [k[0], k[1], k[2], k[3], k[4]]));
      /* launchIdOfPool counts from 1 (0: no launch); launchAt takes the 0-based index */
      const no = await lp.launchIdOfPool(pid);
      if (no === 0n) return durum("This token has no pool on the v4 launchpad.");
      const kova = (await lp.launchAt(no - 1n)).kasa;
      const b = await new Contract(ARC_USDC, ["function balanceOf(address) view returns (uint256)"], arc).balanceOf(kova);
      if (b === 0n) return durum("Nothing waits: every trade's tax has reached the basket.");
      durum("$" + (Number(b) / 1e6).toFixed(2) + " waits in the bucket. Confirm in your wallet (on Arc, a few cents of gas; the dollars can only go to this token's basket)…");
      const arcAg = AGLAR.find((a) => a.anahtar === "arc");
      const h = await cuzdan.agdaGonder(arcAg, { to: kova, data: new Interface(["function gonder()"]).encodeFunctionData("gonder", []), value: "0x0", gas: "0x3d0900" });
      if ((await makbuz(arcAg, h)).status !== 1) throw new Error("Reverted: " + h);
      durum("Passed on: the basket lines that crossed $50 are on their way to their vaults.");
    } catch (x) { durum((x && x.message) || "Could not send."); }
  });
  const satDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Sell" });
  const itfaDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Redeem from the basket" });
  satDugme.addEventListener("click", () => gonder(0));
  itfaDugme.addEventListener("click", () => gonder(1));

  kap.append(panel("Buy, sell, redeem", el("div", { sinif: "yigin" }, [
    token, fiyatYazi,
    el("div", { sinif: "girdi-grup" }, [kayma, el("span", { sinif: "girdi-grup__son", yazi: "% slippage limit" })]),
    el("div", { sinif: "alan__ipucu", yazi: "Buy: pay on your chain in its gas token; the tokens arrive on your chain." }),
    el("div", { sinif: "girdi-grup" }, [alTutar, el("span", { sinif: "girdi-grup__son", yazi: "$" })]), alDugme, alDurum,
    el("div", { sinif: "alan__ipucu", yazi: "Sell or redeem tokens you hold on your chain. A sale that cannot meet its minimum returns the tokens to your address on Arc instead; nothing is left in the gate." }),
    el("div", { sinif: "girdi-grup" }, [satTutar, el("span", { sinif: "girdi-grup__son", yazi: "tokens" })]),
    el("div", { sinif: "girdi-grup" }, [satDugme, itfaDugme]), satDurum,
    ...(V2 ? [el("div", { sinif: "alan__ipucu", yazi: "Move tokens you hold on Arc to Solana, Sui or Aptos. The first one to move a token to a chain creates its twin there." }),
      el("div", { sinif: "girdi-grup" }, [tasZincir, tasTutar, el("span", { sinif: "girdi-grup__son", yazi: "tokens" })]), tasAlici, tasDugme, tasDurum,
      el("div", { sinif: "alan__ipucu", yazi: "On Sui a coin is its own type: once per token, anyone publishes it (4 approvals in a Sui wallet). Until then transfers to Sui wait there, safe, and are delivered by the same step." }),
      suiDugme, suiDurum,
      el("div", { sinif: "alan__ipucu", yazi: "The founder's 0.3% of every trade collects on Arc for this token. Anyone can send it on; it can only go to the founder, on the founder's chain." }),
      kpDugme, kpDurum,
      ...(V2.surum >= 4 ? [el("div", { sinif: "alan__ipucu", yazi: "Every trade's collateral tax goes to the basket in the same transaction. When several lines cross $50 at once it may need more gas than a trade gives it; then it waits, safe, and anyone passes it on here." }),
        kovaDugme, kovaDurum] : [])] : [])])));
  /* Solana / Sui / Aptos wallets (docs/js/uzak-cuzdan.js) */
  if (V2) import("../uzak-cuzdan.js").then((m) => kap.append(m.uzakCuzdanPaneli({ token, V2, kaymaOrani }))).catch(() => {});
  return kap;
}
