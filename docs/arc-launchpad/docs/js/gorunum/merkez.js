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
import { JsonRpcProvider, Contract, Interface, AbiCoder, zeroPadValue, keccak256, toUtf8Bytes, solidityPacked } from "../../vendor/ethers.min.js";

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

const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
/* every chain pays: Arc in its own USDC straight to the gate, the others through relay */
const odemeAglari = () => AGLAR;
/* where the gate delivers tokens for a wallet on `ag`: 0 means on Arc itself */
const teslimEid = (ag) => (ag.anahtar === "arc" ? 0 : ag.eid);
const sec = (lz, compose = 0) => compose
  ? solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128", "uint8", "uint16", "uint8", "uint16", "uint128"], [3, 1, 17, 1, lz, 1, 19, 3, 0, compose])
  : solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, lz]);
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
  return zeroPadValue(g.toLowerCase(), 32);
}

async function ondalik(zincir, girdi) {
  if (zincir.tur === "evm") return Number(await new Contract(girdi, E.fragments, new JsonRpcProvider(zincir.rpc, undefined, { staticNetwork: false })).decimals());
  if (zincir.tur === "sui") {
    const r = await fetch("https://sui-rpc.publicnode.com", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "suix_getCoinMetadata", params: [girdi] }) }).then((x) => x.json());
    return r.result.decimals;
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
export async function havuzFiyati(token) {
  const lp = new Contract(LP, ["function havuzAnahtari(address) view returns ((address,address,uint24,int24,address))"], arc);
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
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Launch on any chain", "One pool on Arc, every chain's door to it"));
  kap.append(not("Every token here has one pool and one price, on Arc. You launch, buy and sell from your own chain with its own gas token, in one signature. The token lives on your chain as its twin. Fees are shown before you sign.", "bilgi"));

  let ag = odemeAglari().find((a) => a.anahtar === "base");
  const zincirSec = el("select", { sinif: "girdi", attr: { id: "merkez-zincir" } }, odemeAglari().map((a) => el("option", { attr: { value: a.anahtar }, yazi: a.ad + " (pay in " + a.gaz + ")" })));
  zincirSec.value = ag.anahtar;
  zincirSec.addEventListener("change", () => { ag = AGLAR.find((a) => a.anahtar === zincirSec.value); });
  kap.append(panel("Your chain", el("div", { sinif: "yigin" }, [zincirSec,
    el("div", { sinif: "alan__ipucu", yazi: "Solana, Sui and Aptos wallets come next; today the doors are the EVM chains." })])));

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
  lDugme.addEventListener("click", async () => {
    const durum = (s) => { lDurum.textContent = s; };
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) return durum("Connect a wallet first.");
      if (!ad.value.trim() || !sembol.value.trim()) return durum("Give the token a name and a symbol.");
      const alim6 = BigInt(Math.round(Number(alim.value) * 1e6));
      if (alim6 < 100_000_000n || alim6 > 500_000_000n) return durum("The first buy is between $100 and $500.");
      const ss = [...satirlar.children].map((s) => s._oku()).filter((s) => s.adres);
      if (!ss.length) return durum("Add at least one basket token.");
      const sepet = [], teklif = [];
      let teminat = 0n;
      for (const s of ss) {
        const asgari = s.zincir.domain === 0 ? 25 : 4;
        if (!(s.dolar >= asgari)) return durum("Each basket line needs at least $" + asgari + ".");
        durum("Pricing " + s.zincir.ad + " " + s.adres.slice(0, 10) + "… (DexScreener)…");
        const dolar6 = BigInt(Math.round(s.dolar * 1e6));
        sepet.push([s.zincir.domain, varlikKimligi(s.zincir, s.adres), dolar6]);
        teklif.push(await teklifBirimi(s.zincir, s.adres, s.dolar));
        teminat += dolar6;
      }
      if (teminat < 20_000_000n) return durum("The basket must hold at least $20 in total.");
      /* the twins' LayerZero fee, read with a live token of the same shape; the excess comes back */
      durum("Reading the LayerZero fee for the twins…");
      const ikizSec = sec(3_500_000n);
      const yayici = new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)"], arc);
      const ikizUcret = ((await yayici.ucret(FTHM_ARC, IKIZ_EID, ikizSec)) * 13n) / 10n;
      const deger = ikizUcret + 2n * 10n ** 18n;      // + the founder's tokens to your chain; unused value refunded
      const istek = [ad.value.trim(), sembol.value.trim().toUpperCase(), sepet, teklif, BigInt(Number(vergi.value) * 10_000), alim6,
        zeroPadValue(ben, 32), ODEME_DOMAIN.has(ag.domain) ? ag.domain : ARC_DOMAIN, teslimEid(ag), IKIZ_EID, ikizSec, ikizUcret, sec(100_000n), ben];
      const toplam = alim6 + teminat;
      const txs = [
        { to: ARC_USDC, data: E.encodeFunctionData("approve", [KAPI, toplam]), value: "0" },
        { to: KAPI, data: KAPI_ABI.encodeFunctionData("launch", [istek]), value: deger.toString() },
      ];
      await relayIle(ag, ben, toplam, deger, txs, durum);
      durum("Paid. relay launches on Arc within seconds; your tokens arrive on " + ag.ad + " in a few minutes, the basket is bought by auction over the next hours.");
    } catch (x) { durum((x && x.message) || "Could not launch."); }
  });
  kap.append(panel("Launch", el("div", { sinif: "yigin" }, [
    el("a", { sinif: "alan__ipucu", attr: { href: "#olustur-move" }, yazi: "Paying from a Sui or Aptos wallet? Use the Sui / Aptos launch form →" }),
    el("div", { sinif: "girdi-grup" }, [ad, sembol]),
    el("div", { sinif: "alan__ipucu", yazi: "First buy $100–$500 (2% launch fee; the rest becomes your tokens at the opening price: $3,500 for the whole supply of 1,000,000,000)." }),
    el("div", { sinif: "girdi-grup" }, [alim, el("span", { sinif: "girdi-grup__son", yazi: "$ first buy" })]), vergi,
    el("div", { sinif: "alan__ipucu", yazi: "Collateral basket: up to 5 tokens, mixed as you like across the chains below, at least $4 a line ($25 on Ethereum), at least $20 in total. Bought into the vaults by auction; every trade's collateral tax re-buys it every $50." }),
    satirlar,
    el("div", { sinif: "alan__ipucu", yazi: "Every trade: 2.2% (0.3% you, 0.3% developers, 0.5% liquidity, 0.2% operations, 0.2% FTHM bought and burned, 0.7% back into the pool) plus your collateral tax." }),
    lDugme, lDurum])));

  /* ================= trade ================= */
  const token = el("input", { sinif: "girdi", attr: { id: "merkez-token", placeholder: "token address on Arc", value: (param && param.get("t")) || "" } });
  const fiyatYazi = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const fiyatOku = async () => {
    try {
      if (!/^0x[0-9a-fA-F]{40}$/.test(token.value.trim())) return;
      const v = await new Contract(KAPI, KAPI_ABI.fragments, arc).vekilOf(token.value.trim());
      if (v === SIFIR) { fiyatYazi.textContent = "This token was not launched through this door."; return; }
      const f = await havuzFiyati(token.value.trim());
      fiyatYazi.textContent = "Arc pool price: $" + f.toPrecision(4) + " per token";
    } catch (x) { fiyatYazi.textContent = "Could not read the pool: " + ((x && x.message) || ""); }
  };
  token.addEventListener("change", fiyatOku);

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
      const f = await havuzFiyati(t);
      /* at least 85% of what the pool price gives before fees and tax: the slippage limit */
      const asgari = BigInt(Math.floor((Number(usdc6) / 1e6 / f) * 0.85 * 1e6)) * 10n ** 12n;
      const deger = teslimEid(ag) ? 2n * 10n ** 18n : 0n;      // LayerZero fee for the delivery; none on Arc
      const txs = [
        { to: ARC_USDC, data: E.encodeFunctionData("approve", [KAPI, usdc6]), value: "0" },
        { to: KAPI, data: KAPI_ABI.encodeFunctionData("al", [t, usdc6, asgari, teslimEid(ag), zeroPadValue(ben, 32), teslimEid(ag) ? sec(100_000n) : "0x", ben]), value: deger.toString() },
      ];
      await relayIle(ag, ben, usdc6, deger, txs, durum);
      durum("Paid. Bought on Arc; the tokens arrive on " + ag.ad + " in a few minutes.");
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
        if (tur === 0) return durum("Selling tokens held on Arc from this page opens with the gate's next version. Redeeming from the basket works now.");
        const miktar = BigInt(Math.round(Number(satTutar.value))) * 10n ** 18n;
        const tk = new Contract(t, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], arc);
        if ((await tk.balanceOf(ben)) < miktar) return durum("You hold less than that on Arc.");
        durum("Approve the burn (1/2)…");
        let h = await cuzdan.agdaGonder(ag, { to: t, data: tk.interface.encodeFunctionData("approve", [UCU, miktar]), value: "0x0" });
        if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
        durum("Redeem (2/2)…");
        const U = new Interface(["function itfa(address,uint256,uint32,bytes32)"]);
        h = await cuzdan.agdaGonder(ag, { to: UCU, data: U.encodeFunctionData("itfa", [t, miktar, ARC_DOMAIN, zeroPadValue(ben, 32)]), value: "0x0" });
        if ((await makbuz(ag, h)).status !== 1) throw new Error("Reverted: " + h);
        return durum("Burned for redemption; each vault sells your share by auction and pays you on Arc.");
      }
      const ikiz = await new Contract(YAYICI, ["function ikizAdresi(address) view returns (address)"], arc).ikizAdresi(t);
      const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
      const oft = new Contract(ikiz, OFT_ABI, p);
      const miktar = BigInt(Math.round(Number(satTutar.value))) * 10n ** 18n;
      if ((await oft.balanceOf(ben)) < miktar) return durum("You hold less than that on " + ag.ad + ".");
      const odeme = ODEME_DOMAIN.has(ag.domain) ? ag.domain : ARC_DOMAIN;
      let asgari = 0n;
      if (tur === 0) { const f = await havuzFiyati(t); asgari = BigInt(Math.floor(Number(miktar / 10n ** 12n) / 1e6 * f * 0.85 * 1e6)); }
      const yuk = AbiCoder.defaultAbiCoder().encode(["uint8", "uint32", "bytes32", "uint256", "address"], [tur, odeme, zeroPadValue(ben, 32), asgari, ben]);
      const prm = [ARC_EID, zeroPadValue(KAPI, 32), miktar, (miktar * 99n) / 100n, sec(200_000n, 900_000n), yuk, "0x"];
      const [ucret] = await oft.quoteSend(prm, false);
      durum("Sending to the gate on Arc (LayerZero fee " + (Number(ucret) / 1e18).toPrecision(3) + " " + ag.gaz + ")…");
      const h = await cuzdan.agdaGonder(ag, { to: ikiz, data: new Interface(OFT_ABI).encodeFunctionData("send", [prm, [ucret, 0], ben]), value: "0x" + ucret.toString(16) });
      const m = await makbuz(ag, h);
      if (m.status !== 1) throw new Error("Reverted: " + h);
      const yer = odeme === ARC_DOMAIN ? "Arc (your same address)" : ag.ad;
      durum(tur === 0 ? "Sent. Sold in the Arc pool; the USDC is paid on " + yer + " (minutes; Ethereum-anchored chains up to ~20)." :
        "Sent. Burned for redemption; each vault sells your share by auction and pays on " + yer + ".");
    } catch (x) { durum((x && x.message) || "Could not send."); }
  };
  const satDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Sell" });
  const itfaDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Redeem from the basket" });
  satDugme.addEventListener("click", () => gonder(0));
  itfaDugme.addEventListener("click", () => gonder(1));

  kap.append(panel("Buy, sell, redeem", el("div", { sinif: "yigin" }, [
    token, fiyatYazi,
    el("div", { sinif: "alan__ipucu", yazi: "Buy: pay on your chain in its gas token; the tokens arrive on your chain." }),
    el("div", { sinif: "girdi-grup" }, [alTutar, el("span", { sinif: "girdi-grup__son", yazi: "$" })]), alDugme, alDurum,
    el("div", { sinif: "alan__ipucu", yazi: "Sell or redeem tokens you hold on your chain. A sale that cannot meet its minimum returns the tokens to your address on Arc instead; nothing is left in the gate." }),
    el("div", { sinif: "girdi-grup" }, [satTutar, el("span", { sinif: "girdi-grup__son", yazi: "tokens" })]),
    el("div", { sinif: "girdi-grup" }, [satDugme, itfaDugme]), satDurum])));
  return kap;
}
