/* ===========================================================================
 * gorunum/fthm-al-sat.js — buy and sell FTHM from any chain
 *
 * One market: FTHM's pool on Arc. From any other chain:
 *   BUY   one relay.link order on your chain, paid in its USDC. relay brings
 *         the dollars to Arc and, in the same order, calls the FTHM gate
 *         (KapiAg, one address on every chain): buy in Arc's pool, send the
 *         FTHM over LayerZero back to you on your chain.
 *   SELL  one LayerZero send from your chain to the gate on Arc, with the
 *         sale instruction attached: the gate sells in Arc's pool and pays
 *         USDC to your address on Arc. If the pool cannot meet your minimum,
 *         you get the FTHM on Arc instead — nothing is left in the gate.
 * Measured on mainnet 15 Oct 2026: Base 1.568 USDC -> 79,086 FTHM on Base;
 * Base 50,000 FTHM -> 0.746 USDC on Arc (rapor/fthm-her-zincir.json).
 * =========================================================================== */
import { el, sayfaUst, panel, not, temizle, olcum } from "../ui.js";
import { FTHM, fthmDurum } from "../fthm-veri.js";
import { AGLAR } from "../aglar.js";
import { cuzdan } from "../cuzdan.js";
import { JsonRpcProvider, Contract, Interface, AbiCoder, zeroPadValue } from "../../vendor/ethers.min.js";
import { YedekliOkur } from "../yedekli-okur.js";
import { rpcPost } from "../ag-okur.js";

const KAPI = "0x060BD07354462eBa410164aBaB6965fe289d2e80";
const ADAPTOR = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const IKIZ = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const RELAY = "https://api.relay.link";
/* KapiUzak (Arc): the same buy in Arc's pool, delivered to a 32-byte wallet (Solana). Ownerless; tested 27 Oct 2026: 0.5 USDC -> 33,190 FTHM on Solana. */
const KAPI_UZAK = "0xa31Ea3F12b23ad5937c6F25EE9E3Fd82871A622b";
const SOL_EID = 30168, SOLANA_RELAY = 792703809;
const ARC_EID = 30417;
/* LayerZero type-3 options: lzReceive 200k + lzCompose 500k on Arc, the
   same figures the Arc adapter enforces for send-and-call. */
const SAT_SECENEK = "0x00030100110100000000000000000000000000030d400100130300000000000000000000000000000007a120";
const OFT_ABI = ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
  "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable"];

/* reads move to the next Arc RPC on 429/403: the single RPC answered 3–4 of this page's 7 reads with 429 (29 Oct) */
const arc = new YedekliOkur();
/* Uniswap's V4Quoter on Arc runs the real swap through FTHM's pool (hook included) without sending anything */
const V4_QUOTER = "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94";
const HAVUZ_ANAHTARI = [ARC_USDC, FTHM.token, 0, 60, FTHM.hook];
const KAYMA = 0.03;   // the price may move 3% between the quote and the trade on Arc
async function teklif(usdcdenFthm, miktar) {
  const q = new Contract(V4_QUOTER, ["function quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes)) returns (uint256,uint256)"], arc);
  const [cikan] = await q.quoteExactInputSingle.staticCall([HAVUZ_ANAHTARI, usdcdenFthm, miktar, "0x"]);
  return cikan;
}
const asgariOf = (x) => (x * BigInt(Math.round((1 - KAYMA) * 1000))) / 1000n;
const evmler = () => AGLAR.filter((a) => a.anahtar !== "arc");

/* the receipt through the chain's spare RPCs; a timeout says plainly not to pay twice */
async function makbuz(ag, hash) {
  const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
  for (let i = 0; i < 160; i++) {
    const r = await rpcPost(ag, { jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [hash] }).catch(() => null);
    if (r && r.result) return { ...r.result, status: Number(r.result.status) };
    const m = await p.getTransactionReceipt(hash).catch(() => null);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("No receipt yet for " + hash + " on " + ag.ad + ". It may still go through: do NOT pay again. Check this transaction in an explorer first, then reload.");
}

/* one payment at a time: a second press while one runs could pay twice */
const tekSefer = (dugme, fn) => async () => {
  if (dugme._mesgul) return;
  dugme._mesgul = true; dugme.disabled = true;
  try { await fn(); } finally { dugme._mesgul = false; dugme.disabled = false; }
};

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("FTHM", "The token every ARC PULSE trade buys and burns — one market on Arc, reachable from every chain"));

  /* ---- live tokenomics, read from Arc on every visit ---- */
  const tok = (x) => Math.round(x).toLocaleString("en-US");
  const usd = (x) => "$" + (x >= 1000 ? Math.round(x).toLocaleString("en-US") : x.toPrecision(4));
  const canli = el("div", { sinif: "izgara izgara--olcum" }, [olcum("Price", "reading…"), olcum("Supply", "reading…")]);
  const dagilim = el("div", { sinif: "yigin" });
  fthmDurum(arc).then((d) => {
    temizle(canli);
    canli.append(
      olcum("Price", usd(d.fiyat), tok(d.fthmPerUsdc) + " FTHM per $1, from the Arc pool"),
      olcum("Fully diluted value", usd(d.fdv), "price × supply"),
      olcum("Market cap", usd(d.piyasaDegeri), "price × circulating"),
      olcum("Total supply", tok(d.arz), "fixed: the token has no mint function"),
      olcum("Circulating", tok(d.dolasim), "supply − staking − vesting − burned"),
      olcum("Burned", tok(d.yakilan), "bought by ARC PULSE trades and burned"));
    temizle(dagilim);
    dagilim.append(el("div", { sinif: "tablo-sarmal" }, [el("table", { sinif: "tablo tablo--kart" }, [
      el("thead", {}, [el("tr", {}, ["Allocation", "Now on chain", "Held by"].map((h) => el("th", { yazi: h })))]),
      el("tbody", {}, [
        ["Staking rewards", tok(d.stake), FTHM.stake, "paid out to stakers over time"],
        ["Founder vesting", tok(d.vesting), FTHM.vesting, "unlocks on schedule"],
        ["Market", tok(d.arz - d.stake - d.vesting - d.yakilan), FTHM.poolManager, "the Arc pool and holders"],
        ["Burned", tok(d.yakilan), "0x000000000000000000000000000000000000dEaD", "gone for good"],
      ].map(([ad, mik, adr, alt]) => el("tr", {}, [
        el("td", { attr: { "data-et": "Allocation" } }, [el("div", { yazi: ad }), el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: alt })]),
        el("td", { sinif: "sayi", attr: { "data-et": "Now on chain" }, yazi: mik }),
        el("td", { sinif: "mono", attr: { "data-et": "Held by" } }, [el("a", { attr: { href: "https://explorer.arc.io/address/" + adr, target: "_blank", rel: "noopener" }, yazi: adr.slice(0, 6) + "…" + adr.slice(-4) })]),
      ]))),
    ])]));
  }).catch(() => { temizle(canli); canli.append(olcum("Live figures", "Arc RPC busy — reload in a moment")); });
  kap.append(panel("FTHM live from Arc", el("div", { sinif: "yigin" }, [canli, dagilim])));
  kap.append(panel("Why FTHM", el("div", { sinif: "yigin" }, [
    el("p", { yazi: "Every trade on ARC PULSE sets aside 0.2% for FTHM. The trades themselves buy FTHM from its pool on Arc and burn it — no team wallet in between, nobody has to press a button. More launches and more trading on ARC PULSE mean more FTHM bought and burned." }),
    el("p", { yazi: "One pool on Arc, the same price on every chain: FTHM moves to Base, Arbitrum, Ethereum, BNB, Avalanche, Monad, HyperEVM, Robinhood, Solana, Sui and Aptos over LayerZero." }),
    el("p", {}, ["Contracts: ", el("a", { attr: { href: "https://repo.sourcify.dev/5042/" + FTHM.token, target: "_blank", rel: "noopener" }, yazi: "FTHM (source verified on Sourcify)" }),
      " · ", el("a", { attr: { href: "https://repo.sourcify.dev/5042/" + FTHM.yakici, target: "_blank", rel: "noopener" }, yazi: "FTHM burner" }),
      " · ", el("a", { attr: { href: "#/guvenlik" }, yazi: "every live contract" })]),
  ])));
  kap.append(not("Buy from any EVM chain in the list below (from Solana, use the Solana panel): you pay in your chain's USDC and receive FTHM on the same chain. Buying and selling both go through FTHM's pool on Arc, so the price is the same wherever you hold it.", "bilgi"));

  let ag = evmler().find((a) => a.anahtar === "base") || evmler()[0];
  const zincirSec = el("select", { sinif: "girdi" }, evmler().map((a) => el("option", { attr: { value: a.anahtar }, yazi: a.ad })));
  zincirSec.value = ag.anahtar;
  zincirSec.addEventListener("change", () => { ag = AGLAR.find((a) => a.anahtar === zincirSec.value); });

  /* ---- buy ---- */
  const alTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1", value: "10" } });
  const alDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const alDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Buy FTHM" });
  alDugme.addEventListener("click", tekSefer(alDugme, async () => {
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) { alDurum.textContent = "Connect a wallet first."; return; }
      const toplam = BigInt(Math.round(Number(alTutar.value) * 1e6));
      if (toplam < 1_000_000n) { alDurum.textContent = "At least 1 USDC."; return; }
      alDurum.textContent = "Reading the LayerZero fee back to " + ag.ad + "…";
      const [ucret] = await new Contract(ADAPTOR, OFT_ABI, arc).quoteSend([ag.eid, zeroPadValue(ben, 32), 10n ** 22n, 0n, "0x", "0x", "0x"], false);
      const deger = (ucret * 12n) / 10n;
      const girdi = toplam - (deger / 10n ** 12n + 1n);
      if (girdi <= 0n) { alDurum.textContent = "The amount does not cover the delivery fee."; return; }
      /* what the pool gives for it now; less than 97% of that on Arc and nothing is bought (relay refunds) */
      const tahmin = await teklif(true, girdi);
      const asgari = asgariOf(tahmin);
      alDurum.textContent = "Estimate: ~" + tok(Number(tahmin) / 1e18) + " FTHM for $" + (Number(girdi) / 1e6).toFixed(2) + " (delivery fee $" + (Number(deger) / 1e18).toFixed(2) + "); at least " + tok(Number(asgari) / 1e18) + " or nothing is bought.";
      const e = new Interface(["function approve(address,uint256) returns (bool)"]);
      const k = new Interface(["function alVeGonder(uint32,uint256,uint256,address,bytes) payable returns (uint256)"]);
      const govde = { user: ben, recipient: ben, originChainId: ag.id, destinationChainId: 5042,
        originCurrency: ag.dolar, destinationCurrency: "0x0000000000000000000000000000000000000000",
        amount: (toplam * 10n ** 12n).toString(), tradeType: "EXACT_OUTPUT", txsGasLimit: 1500000,
        txs: [{ to: ARC_USDC, data: e.encodeFunctionData("approve", [KAPI, girdi]), value: "0" },
          { to: KAPI, data: k.encodeFunctionData("alVeGonder", [ag.eid, girdi, asgari, ben, "0x"]), value: deger.toString() }] };
      alDurum.textContent = "Asking relay.link for the route…";
      const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
      if (!q.steps) { alDurum.textContent = "No route right now: " + (q.message || "try again"); return; }
      for (const adim of q.steps) for (const it of adim.items || []) {
        if (adim.kind !== "transaction") continue;
        alDurum.textContent = (adim.id === "approve" ? "Approve " : "Pay ") + q.details.currencyIn.amountFormatted + " " + q.details.currencyIn.currency.symbol + " in your wallet…";
        const d = it.data;
        const h = await cuzdan.agdaGonder(ag, { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
        const m = await makbuz(ag, h);
        if (m.status !== 1) throw new Error("Reverted: " + h);
      }
      alDurum.textContent = "Paid. relay buys on Arc and LayerZero delivers the FTHM to you on " + ag.ad + " — usually within a few minutes.";
    } catch (x) { alDurum.textContent = (x && x.message) || "Could not send."; }
  }));

  /* ---- sell ---- */
  const satTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1000", value: "10000" } });
  const satDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const satDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Sell FTHM" });
  satDugme.addEventListener("click", tekSefer(satDugme, async () => {
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) { satDurum.textContent = "Connect a wallet first."; return; }
      const miktar = BigInt(Math.round(Number(satTutar.value))) * 10n ** 18n;
      const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
      const t = new Contract(IKIZ, OFT_ABI, p);
      const cikan = await teklif(false, miktar);
      const asgari = asgariOf(cikan);
      satDurum.textContent = "Estimate: ~$" + (Number(cikan) / 1e6).toFixed(2) + "; at least $" + (Number(asgari) / 1e6).toFixed(2) + ", or the FTHM is delivered to your address on Arc instead.";
      const compose = AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [ben, asgari]);
      const prm = [ARC_EID, zeroPadValue(KAPI, 32), miktar, (miktar * 99n) / 100n, SAT_SECENEK, compose, "0x"];
      const [ucret] = await t.quoteSend(prm, false);
      satDurum.textContent += "  Sending to the gate on Arc (fee " + (Number(ucret) / 1e18).toPrecision(3) + " " + ag.gaz + ")…";
      const h = await cuzdan.agdaGonder(ag, { to: IKIZ, data: new Interface(OFT_ABI).encodeFunctionData("send", [prm, [ucret, 0], ben]), value: "0x" + ucret.toString(16) });
      const m = await makbuz(ag, h);
      if (m.status !== 1) throw new Error("Reverted: " + h);
      satDurum.textContent = "Sent. The gate sells on Arc and the USDC arrives at your address on Arc in a few minutes.";
    } catch (x) { satDurum.textContent = (x && x.message) || "Could not send."; }
  }));

  kap.append(panel("Your chain", zincirSec));
  kap.append(panel("Buy FTHM from any chain", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Pay in your chain's USDC. The FTHM arrives on the same chain." }),
    el("div", { sinif: "girdi-grup" }, [alTutar, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), alDugme, alDurum])));
  /* ---- buy from a Solana wallet: relay brings SOL to Arc as USDC, KapiUzak buys in Arc's pool and LayerZero delivers to the wallet on Solana ---- */
  const solTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "2", step: "1", value: "10" } });
  const solIade = el("input", { sinif: "girdi", attr: { placeholder: "your Arc / EVM address 0x… (only for relay refunds)" } });
  const solDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const solDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Buy FTHM with SOL" });
  solDugme.addEventListener("click", tekSefer(solDugme, async () => {
    try {
      const m = await import("../solana-ikiz.js");
      const ben = await m.solanaCuzdan.baglan();
      const iade = solIade.value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(iade)) { solDurum.textContent = "Enter an EVM address for relay refunds (any of yours)."; return; }
      const toplam = BigInt(Math.round(Number(solTutar.value) * 1e6));
      if (toplam < 2_000_000n) { solDurum.textContent = "At least 2 USDC worth (the delivery to Solana costs about $1.50)."; return; }
      const b = await m.adresBaytlari(ben);
      const alici = "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      const [ucret] = await new Contract(ADAPTOR, OFT_ABI, arc).quoteSend([SOL_EID, alici, 10n ** 22n, 0n, "0x", "0x", "0x"], false);
      const deger = (ucret * 12n) / 10n;
      const girdi = toplam - (deger / 10n ** 12n + 1n);
      if (girdi <= 0n) { solDurum.textContent = "The amount does not cover the delivery fee."; return; }
      const tahmin = await teklif(true, girdi);
      const asgari = asgariOf(tahmin);
      const e = new Interface(["function approve(address,uint256) returns (bool)"]);
      const k = new Interface(["function alVeGonder(uint32,uint256,uint256,bytes32,bytes) payable returns (uint256)"]);
      solDurum.textContent = "Asking relay.link for the route from Solana…";
      const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        user: ben, recipient: iade, originChainId: SOLANA_RELAY, destinationChainId: 5042, originCurrency: "11111111111111111111111111111111",
        destinationCurrency: "0x0000000000000000000000000000000000000000", amount: (toplam * 10n ** 12n).toString(), tradeType: "EXACT_OUTPUT", txsGasLimit: 1500000,
        txs: [{ to: ARC_USDC, data: e.encodeFunctionData("approve", [KAPI_UZAK, girdi]), value: "0" },
          { to: KAPI_UZAK, data: k.encodeFunctionData("alVeGonder", [SOL_EID, girdi, asgari, alici, "0x"]), value: deger.toString() }] }) }).then((x) => x.json());
      if (!q.steps) { solDurum.textContent = "No route right now: " + (q.message || "try again"); return; }
      const adim = q.steps.find((s) => s.items && s.items[0] && s.items[0].data && s.items[0].data.instructions);
      if (!adim) { solDurum.textContent = "relay returned no Solana step."; return; }
      solDurum.textContent = "Estimate: ~" + tok(Number(tahmin) / 1e18) + " FTHM (at least " + tok(Number(asgari) / 1e18) + " or nothing is bought). Approve " + Number(q.details.currencyIn.amountFormatted).toPrecision(5) + " SOL in your Solana wallet…";
      const imza = await m.relayAdimi(adim.items[0].data);
      solDurum.textContent = "Paid on Solana (" + imza.slice(0, 12) + "…). relay buys on Arc and LayerZero delivers the FTHM to this wallet on Solana, usually within minutes.";
    } catch (x) { solDurum.textContent = (x && x.message) || "Could not send."; }
  }));
  kap.append(panel("Buy FTHM from Solana", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Pay in SOL from a Solana wallet. The FTHM is bought in the same Arc pool and arrives in this wallet on Solana (mint Cx3gUyxZY3JzQaJ2w1V54gpg8PNZRtXbEoYpuZNtaQBb)." }),
    el("div", { sinif: "girdi-grup" }, [solTutar, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), solIade, solDugme, solDurum])));
  /* ---- sell from a Solana wallet: the wallet's own LayerZero send (Paxos's immutable OFT program) to the gate on Arc
     with the sale instruction; the gate sells in Arc's pool and pays USDC to the seller's EVM address on Arc.
     Then, optionally, relay.link carries that USDC back to the Solana wallet as SOL (signed by the EVM wallet on Arc). ---- */
  const SOL_SAT_BEKLEYEN = "arcpulse-fthm-sol-sat";   // only the pending Solana signature, on this device
  const ssTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1000", value: "10000" } });
  const ssAlici = el("input", { sinif: "girdi", attr: { placeholder: "your Arc / EVM address 0x… (the USDC is paid there on Arc)" } });
  const ssDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const ssIz = (imza) => { try { imza ? localStorage.setItem(SOL_SAT_BEKLEYEN, imza) : localStorage.removeItem(SOL_SAT_BEKLEYEN); } catch (e) { /* storage may be blocked */ } };
  const ssBag = (imza) => el("a", { attr: { href: "https://layerzeroscan.com/tx/" + imza, target: "_blank", rel: "noopener" }, yazi: "follow it on LayerZero Scan" });
  try { const b = localStorage.getItem(SOL_SAT_BEKLEYEN); if (b) ssDurum.append("Your last sale from Solana (" + b.slice(0, 12) + "…): ", ssBag(b), "."); } catch (e) { /* storage may be blocked */ }
  const ssMax = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Use my balance" });
  ssMax.addEventListener("click", async () => {
    try {
      const m = await import("../solana-ikiz.js");
      const b = await m.fthmBakiye(await m.solanaCuzdan.baglan());
      ssTutar.value = String(Math.floor(Number(b) / 1e9));
      ssDurum.textContent = "This wallet holds " + tok(Number(b) / 1e9) + " FTHM on Solana.";
    } catch (x) { ssDurum.textContent = (x && x.message) || "Could not read the balance."; }
  });
  const ssDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Sell FTHM from Solana" });
  ssDugme.addEventListener("click", tekSefer(ssDugme, async () => {
    try {
      const m = await import("../solana-ikiz.js");
      const ben = await m.solanaCuzdan.baglan();
      const alici = ssAlici.value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(alici)) { ssDurum.textContent = "Enter your EVM address: the USDC is paid to it on Arc (any EVM wallet of yours, e.g. Phantom's)."; return; }
      const miktar = BigInt(Math.round(Number(ssTutar.value))) * 10n ** 9n;
      if (miktar <= 0n) { ssDurum.textContent = "Enter an amount of FTHM."; return; }
      const varolan = await m.fthmBakiye(ben);
      if (varolan < miktar) { ssDurum.textContent = "This wallet holds " + tok(Number(varolan) / 1e9) + " FTHM on Solana."; return; }
      const imza = await m.fthmSat({ miktar, aliciEvm: alici, durum: (s) => { ssDurum.textContent = s; } });
      ssIz(imza);
      temizle(ssDurum);
      ssDurum.append("Sent from Solana (" + imza.slice(0, 12) + "…). LayerZero carries it to Arc, the gate sells in the pool and pays the USDC to " +
        alici.slice(0, 6) + "…" + alici.slice(-4) + " on Arc, usually within minutes: ", ssBag(imza), ". Then bring it to Solana below, or keep it on Arc.");
    } catch (x) { ssDurum.textContent = (x && x.message) || "Could not send."; }
  }));
  /* step 2: USDC on Arc -> SOL in the Solana wallet, through relay.link (Arc's gas is paid in that same USDC) */
  const ssGeri = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "0.01", placeholder: "empty = all but 0.05" } });
  const ssGeriDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const ssGeriDugme = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Bring the USDC to Solana as SOL" });
  ssGeriDugme.addEventListener("click", tekSefer(ssGeriDugme, async () => {
    try {
      const arcAg = AGLAR.find((a) => a.anahtar === "arc");
      const m = await import("../solana-ikiz.js");
      const solBen = await m.solanaCuzdan.baglan();
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) { ssGeriDurum.textContent = "Connect the EVM wallet that received the USDC on Arc."; return; }
      const bakiye = await new Contract(ARC_USDC, ["function balanceOf(address) view returns (uint256)"], arc).balanceOf(ben);
      const tutar = ssGeri.value ? BigInt(Math.round(Number(ssGeri.value) * 1e6)) : bakiye - 50_000n;
      if (tutar < 1_000_000n) { ssGeriDurum.textContent = "At least 1 USDC (this wallet has " + (Number(bakiye) / 1e6).toFixed(2) + " USDC on Arc; 0.05 stays for gas)."; return; }
      if (tutar > bakiye) { ssGeriDurum.textContent = "This wallet has " + (Number(bakiye) / 1e6).toFixed(2) + " USDC on Arc."; return; }
      ssGeriDurum.textContent = "Asking relay.link for the route to Solana…";
      const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        user: ben, recipient: solBen, originChainId: 5042, destinationChainId: SOLANA_RELAY, originCurrency: ARC_USDC,
        destinationCurrency: "11111111111111111111111111111111", amount: tutar.toString(), tradeType: "EXACT_INPUT", refundTo: ben }) }).then((x) => x.json());
      if (!q.steps) { ssGeriDurum.textContent = "No route right now: " + (q.message || "try again"); return; }
      const cikan = Number(q.details.currencyOut.amountFormatted).toPrecision(5) + " SOL";
      for (const adim of q.steps) for (const it of adim.items || []) {
        if (adim.kind !== "transaction") continue;
        ssGeriDurum.textContent = (adim.id === "approve" ? "Approve " : "Send ") + (Number(tutar) / 1e6).toFixed(2) + " USDC on Arc in your EVM wallet (you receive about " + cikan + ")…";
        const d = it.data;
        const h = await cuzdan.agdaGonder(arcAg, { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
        const r = await makbuz(arcAg, h);
        if (r.status !== 1) throw new Error("Reverted: " + h);
      }
      ssIz(null);
      ssGeriDurum.textContent = "Done on Arc. relay.link delivers about " + cikan + " to " + solBen.slice(0, 6) + "… on Solana, usually within a minute.";
    } catch (x) { ssGeriDurum.textContent = (x && x.message) || "Could not send."; }
  }));
  kap.append(panel("Sell FTHM from Solana", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Sell FTHM held in a Solana wallet in the same Arc pool. Your Solana wallet signs one LayerZero send (fee well under 0.01 SOL); the gate on Arc sells and pays USDC to your EVM address on Arc. If the pool cannot fill the sale, you receive the FTHM there instead — nothing is left in the gate." }),
    el("div", { sinif: "girdi-grup" }, [ssTutar, el("span", { sinif: "girdi-grup__son", yazi: "FTHM" })]), ssMax, ssAlici, ssDugme, ssDurum,
    el("div", { sinif: "alan__ipucu", yazi: "Then, to get SOL back in the Solana wallet: connect the EVM wallet that received the USDC (Arc's gas is paid in that USDC) and relay.link brings it to Solana." }),
    el("div", { sinif: "girdi-grup" }, [ssGeri, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), ssGeriDugme, ssGeriDurum])));
  kap.append(panel("Sell", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Sell FTHM you hold on this chain. The USDC is paid on Arc, to your same address." }),
    el("div", { sinif: "girdi-grup" }, [satTutar, el("span", { sinif: "girdi-grup__son", yazi: "FTHM" })]), satDugme, satDurum])));
  return kap;
}
