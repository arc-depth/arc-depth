/* ===========================================================================
 * gorunum/fthm-al-sat.js — buy and sell ARCP (Arc Pulse) from any chain
 *   (the file keeps its name so the #/fthm route and every link stay valid)
 *
 * One market: ARCP's Uniswap v4 pool on Arc. ARCP lives on Arc; its twins on
 * other chains come later.
 *   BUY   one relay.link order on your chain, paid in its USDC (on Solana in
 *         SOL): relay buys ARCP in the Arc pool and delivers it to your
 *         address on Arc. Quoted 31 Oct 2026 from all nine EVM chains (Arc,
 *         Robinhood, Base, Arbitrum, Ethereum, BNB, Avalanche, Monad,
 *         HyperEVM): $10 -> ~660,000 ARCP; from Solana 0.05 SOL -> ~314,000.
 *   SELL  on Arc, through the SwapRouter (contracts/SwapRouter.sol) in the
 *         same pool, with a minimum enforced on chain: USDC to your address
 *         on Arc. The pool's USDC side is what buyers have put in.
 * =========================================================================== */
import { el, sayfaUst, panel, not, temizle, olcum, ayrinti } from "../ui.js";
import { FTHM as ARCP, fthmDurum as arcpDurum } from "../fthm-veri.js";
import { AGLAR } from "../aglar.js";
import { ELYSIUM } from "../elysium.js";
import { cuzdan } from "../cuzdan.js";
import { JsonRpcProvider, Contract, Interface } from "../../vendor/ethers.min.js";
import { YedekliOkur } from "../yedekli-okur.js";
import { rpcPost } from "../ag-okur.js";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const RELAY = "https://api.relay.link";
const SOLANA_RELAY = 792703809;
const arcAg = () => AGLAR.find((a) => a.anahtar === "arc");
/* the audited SwapRouter on Arc (aglar.js takasRouter): pays the output to the caller */
const ROUTER = () => arcAg().takasRouter;
const ROUTER_ABI = ["function swap((address,address,uint24,int24,address),bool,uint256,uint256) payable returns (uint256)"];
const ERC = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];

/* reads move to the next Arc RPC on 429/403: the single RPC answered 3–4 of this page's 7 reads with 429 (29 Oct) */
const arc = new YedekliOkur();
/* Uniswap's V4Quoter on Arc runs the real swap through ARCP's pool (hook included) without sending anything */
const V4_QUOTER = "0x8Dc178eFB8111BB0973Dd9d722ebeFF267c98F94";
const HAVUZ_ANAHTARI = [ARC_USDC, ARCP.token, 0, 60, ARCP.hook];
const KAYMA = 0.03;   // the price may move 3% between the quote and the trade on Arc
async function teklif(usdcden, miktar) {
  const q = new Contract(V4_QUOTER, ["function quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes)) returns (uint256,uint256)"], arc);
  const [cikan] = await q.quoteExactInputSingle.staticCall([HAVUZ_ANAHTARI, usdcden, miktar, "0x"]);
  return cikan;
}
const asgariOf = (x) => (x * BigInt(Math.round((1 - KAYMA) * 1000))) / 1000n;
/* every EVM chain, Arc included: relay routes each chain's dollar to ARCP on Arc */
const evmler = () => [...AGLAR, ELYSIUM];   // Elysium pays in its USDCe; the ARCP is delivered on Arc
/* the chain's dollar in raw units: BNB's USDC has 18 decimals, the others 6 */
const dolarHam = (ag, usd) => BigInt(Math.round(usd * 1e6)) * 10n ** BigInt(ag.anahtar === "bsc" ? 12 : 0);

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

/* ===========================================================================
 * ARCP 2 (9 Nov 2026): the page leads with the new ARCP, its presale and its supply, read live from
 * Arc (docs/veri/arcp2.json + the token's balances). Its own buy box opens with its pool; until then
 * buying ARCP is the presale. The previous ARCP contract, its figures and its buy / sell panels stay
 * below, folded: nothing it did is taken away.
 * =========================================================================== */
const TUR_ABI = ["function tur() view returns (uint256)", "function turToplam(uint256) view returns (uint256)", "function turBitis(uint256) view returns (uint256)",
  "function katilimciSayisi(uint256) view returns (uint256)", "function kuruldu() view returns (bool)", "function dolu() view returns (bool)"];
export async function ciz(arg) {
  const k = await fetch("veri/arcp2.json").then((x) => (x.ok ? x.json() : null)).catch(() => null);
  if (!k || !k.canli) return eskiCiz(arg);
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("ARCP", "Arc Pulse — the token every ARC PULSE trade buys and burns, now in its second contract (ARCP 2)", [
    el("a", { sinif: "dugme dugme--marka", attr: { href: "presale.html" }, yazi: "Join the presale" })]));
  const ok = new YedekliOkur();
  const os = new Contract(k.onSatis, TUR_ABI, ok);
  const tk = new Contract(k.token, ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"], ok);
  const sayi = (x) => Math.round(x).toLocaleString("en-US");
  const kalan = (sn) => { const z = Math.max(0, sn - Date.now() / 1000); return Math.floor(z / 86400) + "d " + Math.floor((z % 86400) / 3600) + "h"; };

  /* the presale, live */
  const satis = el("div", { sinif: "izgara izgara--olcum" }, [olcum("Presale", "reading Arc…")]);
  kap.append(panel("ARCP 2 presale, live from Arc", el("div", { sinif: "yigin" }, [satis,
    el("p", { yazi: "250,000,000 ARCP for $15,000 in 30-day rounds, $10 to $250 per wallet. Every presale dollar goes into the Uniswap pool as locked liquidity; not one dollar goes to a wallet. A round that does not fill is refunded automatically and the next one starts." })])));
  (async () => {
    const tur = await os.tur();
    const [top, bit, kisi, kur] = await Promise.all([os.turToplam(tur), os.turBitis(tur), os.katilimciSayisi(tur), os.kuruldu()]);
    temizle(satis).append(
      olcum("Round", String(Number(tur) + 1), kur ? "the pool is open" : "30 days each"),
      olcum("Raised", "$" + sayi(Number(top) / 1e6) + " of $15,000", (Math.min(100, Number(top) / 1e6 / 150)).toFixed(1) + "%"),
      olcum("Buyers", String(kisi), "this round"),
      olcum("Ends in", kur ? "—" : kalan(Number(bit)), new Date(Number(bit) * 1000).toUTCString().slice(5, 22) + " UTC"),
      olcum("Presale price", "$0.00006", "opening $0.00007"));
  })().catch(() => { temizle(satis).append(olcum("Presale", "Arc RPC busy — reload in a moment")); });

  /* the supply, where every token sits right now */
  const PAY = [["Pool ladder", "one-sided, locked forever: 70k → 140k → 700k → ∞ FDV", k.acici, 300],
    ["Presale", "250M for $15,000; half at the opening, half over 30 days", k.onSatis, 250],
    ["Founder", "75M at the opening, 75M monthly over 12 months; nothing before the pool opens", k.kurucuPayi, 150],
    ["Staking", "released weekly to stakers, slowing over time, on top of the USDC fee share", k.stake, 100],
    ["Marketing", "locked creator grants; at most 30% in the first 3 months", k.pazarlama, 100],
    ["Usage airdrop", "rounds for people who use ARC PULSE", k.kullanim, 60],
    ["Post rewards", "weekly rewards for posts about ARC PULSE", k.tweet, 40]];
  const govde = el("tbody");
  const tablo = el("table", { sinif: "tablo" }, [el("thead", {}, [el("tr", {}, ["Allocation", "Share", "Now on chain", "Held by"].map((x, i) => el("th", { sinif: i === 1 || i === 2 ? "sayi" : "", yazi: x })))]), govde]);
  for (const [ad, alt, adr, m] of PAY) {
    const hucre = el("td", { sinif: "sayi", attr: { "data-et": "Now on chain" }, yazi: "…" });
    govde.append(el("tr", {}, [el("td", {}, [el("div", { yazi: ad }), el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: alt })]),
      el("td", { sinif: "sayi", yazi: (m / 10) + "%" }), hucre,
      el("td", { sinif: "mono" }, [el("a", { attr: { href: "https://explorer.arc.io/address/" + adr, target: "_blank", rel: "noopener" }, yazi: adr.slice(0, 6) + "…" + adr.slice(-4) })])]));
    tk.balanceOf(adr).then((b) => { hucre.textContent = sayi(Number(b / 10n ** 18n)); }).catch(() => { hucre.textContent = "—"; });
  }
  kap.append(panel("Supply: 1,000,000,000 ARCP, every token born inside a contract", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "tablo-sarmal" }, [tablo]),
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "No wallet holds ARCP before the pool opens, the founder's included. The token has no owner and no mint function." })])));

  const exp = (adr, yazi) => el("a", { attr: { href: "https://explorer.arc.io/address/" + adr, target: "_blank", rel: "noopener" }, yazi });
  kap.append(panel("Why ARCP", el("div", { sinif: "yigin" }, [
    el("p", { yazi: "A slice of every trade on every ARC PULSE token, from all thirteen chains, buys ARCP from its pool on Arc and burns it: no team wallet in between, nobody has to press a button. More launches and more trading mean more ARCP bought and burned." }),
    el("p", { yazi: "Stakers earn a share of the fees in USDC and vote in the DAO on how the developer pool is spent. The opening trades at $70k FDV on a ladder that is locked for good, with the presale's $15,000 below it as buy-side liquidity." }),
    el("p", { yazi: "Buying ARCP: today through the presale. When the round fills and the pool opens, this page buys ARCP 2 from any of thirteen chains, paid in that chain's dollars or gas token." }),
    el("p", {}, ["Contracts on Arc: ", exp(k.token, "ARCP token"), " · ", exp(k.onSatis, "presale"), " · ", exp(k.stake, "staking"), " · ", exp(k.governor, "governor"),
      " · ", el("a", { attr: { href: "#/guvenlik" }, yazi: "every live contract" })]),
  ])));
  /* the previous contract: its live figures and its buy / sell panels, folded */
  const eski = await eskiCiz(arg).catch(() => null);
  if (eski) {
    const ilk = eski.querySelector(".sayfa-ust"); if (ilk) ilk.remove();
    kap.append(ayrinti("The previous ARCP contract (before ARCP 2): its figures, buy and sell", eski));
  }
  return kap;
}

async function eskiCiz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("ARCP", "Arc Pulse — the token every ARC PULSE trade buys and burns. One market on Arc, reachable from every chain"));

  /* ---- live tokenomics, read from Arc on every visit ---- */
  const tok = (x) => Math.round(x).toLocaleString("en-US");
  const usd = (x) => "$" + (x >= 1000 ? Math.round(x).toLocaleString("en-US") : x.toPrecision(4));
  const canli = el("div", { sinif: "izgara izgara--olcum" }, [olcum("Price", "reading…"), olcum("Supply", "reading…")]);
  const dagilim = el("div", { sinif: "yigin" });
  arcpDurum(arc).then((d) => {
    temizle(canli);
    canli.append(
      olcum("Price", usd(d.fiyat), tok(d.fthmPerUsdc) + " ARCP per $1, from the Arc pool"),
      olcum("Fully diluted value", usd(d.fdv), "price × supply"),
      olcum("Market cap", usd(d.piyasaDegeri), "price × circulating"),
      olcum("Total supply", tok(d.arz), "fixed: the token has no mint function"),
      olcum("Circulating", tok(d.dolasim), "supply − staking − vesting − burned"),
      olcum("Burned", tok(d.yakilan), "bought by ARC PULSE trades and burned"));
    temizle(dagilim);
    dagilim.append(el("div", { sinif: "tablo-sarmal" }, [el("table", { sinif: "tablo tablo--kart" }, [
      el("thead", {}, [el("tr", {}, ["Allocation", "Now on chain", "Held by"].map((h) => el("th", { yazi: h })))]),
      el("tbody", {}, [
        ["Staking rewards", tok(d.stake), ARCP.stake, "paid out to stakers over time"],
        ["Founder vesting", tok(d.vesting), ARCP.vesting, "unlocks over 12 months"],
        ["Market", tok(d.arz - d.stake - d.vesting - d.yakilan), ARCP.poolManager, "the Arc pool and holders"],
        ["Burned", tok(d.yakilan), "0x000000000000000000000000000000000000dEaD", "gone for good"],
      ].map(([ad, mik, adr, alt]) => el("tr", {}, [
        el("td", { attr: { "data-et": "Allocation" } }, [el("div", { yazi: ad }), el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: alt })]),
        el("td", { sinif: "sayi", attr: { "data-et": "Now on chain" }, yazi: mik }),
        el("td", { sinif: "mono", attr: { "data-et": "Held by" } }, [el("a", { attr: { href: "https://explorer.arc.io/address/" + adr, target: "_blank", rel: "noopener" }, yazi: adr.slice(0, 6) + "…" + adr.slice(-4) })]),
      ]))),
    ])]));
  }).catch(() => { temizle(canli); canli.append(olcum("Live figures", "Arc RPC busy — reload in a moment")); });
  kap.append(panel("ARCP live from Arc", el("div", { sinif: "yigin" }, [canli, dagilim])));
  const exp = (adr, yazi) => el("a", { attr: { href: "https://explorer.arc.io/address/" + adr, target: "_blank", rel: "noopener" }, yazi });
  kap.append(panel("Why ARCP", el("div", { sinif: "yigin" }, [
    el("p", { yazi: "Every trade on ARC PULSE sets aside 0.2% for ARCP. The trades themselves buy ARCP from its pool on Arc and burn it — no team wallet in between, nobody has to press a button. More launches and more trading on ARC PULSE mean more ARCP bought and burned." }),
    el("p", { yazi: "1,000,000,000 ARCP, fixed: the token has no mint function. 500,000,000 sit in the Arc pool as a one-sided ladder whose liquidity is locked for good, 400,000,000 pay stakers over time, 50,000,000 vest to the founder over 12 months and 50,000,000 are the founder's own. ARCP is also the governance token: its stakers vote on paying developers out of the developer pool." }),
    el("p", { yazi: "One pool on Arc, one price: pay from Arc, Base, Arbitrum, Ethereum, BNB, Avalanche, Monad, HyperEVM, Robinhood or Solana and relay.link delivers the ARCP to you on Arc. ARCP on other chains: coming." }),
    el("p", {}, ["Contracts on Arc: ", exp(ARCP.token, "ARCP token"),
      " · ", exp(ARCP.yakici, "ARCP burner"),
      " · ", exp(ARCP.stake, "staking"),
      " · ", exp(ARCP.governor, "governor"),
      " · ", el("a", { attr: { href: "#/guvenlik" }, yazi: "every live contract" })]),
  ])));
  kap.append(not("Buy from any EVM chain in the list below (from Solana, use the Solana panel): you pay in your chain's USDC and receive ARCP at your same address on Arc. Every buy and sell goes through ARCP's one pool on Arc, so there is one price.", "bilgi"));

  let ag = evmler().find((a) => a.anahtar === "base") || evmler()[0];
  const zincirSec = el("select", { sinif: "girdi" }, evmler().map((a) => el("option", { attr: { value: a.anahtar }, yazi: a.ad })));
  zincirSec.value = ag.anahtar;
  zincirSec.addEventListener("change", () => { ag = evmler().find((a) => a.anahtar === zincirSec.value); });

  /* ---- buy: relay.link brings your chain's dollar to Arc, buys ARCP in its pool and delivers it to your address on Arc ---- */
  const alTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1", value: "10" } });
  const alDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const alDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Buy (closed · old ARCP)" });
  alDugme.addEventListener("click", tekSefer(alDugme, async () => {
    alDurum.textContent = "This is the old, retired ARCP — buying it is closed. Buy ARCP 2 in the presale (arcpulse.app/presale.html)."; return;   // the old contract is retired
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) { alDurum.textContent = "Connect a wallet first."; return; }
      const usd = Number(alTutar.value);
      if (!(usd >= 1)) { alDurum.textContent = "At least 1 USDC."; return; }
      alDurum.textContent = "Asking relay.link for the route to ARCP on Arc…";
      const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        user: ben, recipient: ben, originChainId: ag.id, destinationChainId: 5042, originCurrency: ag.dolar, destinationCurrency: ARCP.token,
        amount: dolarHam(ag, usd).toString(), tradeType: "EXACT_INPUT", refundTo: ben }) }).then((x) => x.json());
      if (!q.steps) { alDurum.textContent = "No route right now: " + (q.message || "try again"); return; }
      const cik = q.details.currencyOut;
      const tahmin = "~" + tok(Number(cik.amountFormatted)) + " ARCP on Arc (at least " + tok(Number(cik.minimumAmount) / 1e18) + ")";
      for (const adim of q.steps) for (const it of adim.items || []) {
        if (adim.kind !== "transaction") continue;
        alDurum.textContent = "Estimate: " + tahmin + ". " + (adim.id === "approve" ? "Approve " : "Pay ") + q.details.currencyIn.amountFormatted + " " + q.details.currencyIn.currency.symbol + " in your wallet…";
        const d = it.data;
        const h = await cuzdan.agdaGonder(ag, { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
        const m = await makbuz(ag, h);
        if (m.status !== 1) throw new Error("Reverted: " + h);
      }
      alDurum.textContent = "Paid. relay buys " + tahmin + " in the Arc pool and delivers it to " + ben.slice(0, 6) + "…" + ben.slice(-4) + " on Arc — usually within a minute.";
    } catch (x) { alDurum.textContent = (x && x.message) || "Could not send."; }
  }));

  /* ---- sell: on Arc, through the SwapRouter in ARCP's pool; USDC to your address on Arc ---- */
  const satTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1000", value: "10000" } });
  const satDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const satDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Sell ARCP" });
  satDugme.addEventListener("click", tekSefer(satDugme, async () => {
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) { satDurum.textContent = "Connect a wallet first."; return; }
      const miktar = BigInt(Math.round(Number(satTutar.value))) * 10n ** 18n;
      if (miktar <= 0n) { satDurum.textContent = "Enter an amount of ARCP."; return; }
      const t = new Contract(ARCP.token, ERC, arc);
      const varolan = await t.balanceOf(ben);
      if (varolan < miktar) { satDurum.textContent = "This wallet holds " + tok(Number(varolan) / 1e18) + " ARCP on Arc."; return; }
      let cikan;
      try { cikan = await teklif(false, miktar); }
      catch (e) { satDurum.textContent = "The pool cannot take that much ARCP right now (its USDC side is what buyers have put in). Try a smaller amount."; return; }
      const asgari = asgariOf(cikan);
      satDurum.textContent = "Estimate: ~$" + (Number(cikan) / 1e6).toFixed(2) + "; at least $" + (Number(asgari) / 1e6).toFixed(2) + " or nothing is sold.";
      const A = arcAg(), r = ROUTER();
      if ((await t.allowance(ben, r)) < miktar) {
        satDurum.textContent += "  Approve the router on Arc in your wallet…";
        const h0 = await cuzdan.agdaGonder(A, { to: ARCP.token, data: new Interface(ERC).encodeFunctionData("approve", [r, miktar]), value: "0x0" });
        if ((await makbuz(A, h0)).status !== 1) throw new Error("Reverted: " + h0);
      }
      satDurum.textContent = "Estimate: ~$" + (Number(cikan) / 1e6).toFixed(2) + ". Confirm the sale on Arc in your wallet…";
      const h = await cuzdan.agdaGonder(A, { to: r, data: new Interface(ROUTER_ABI).encodeFunctionData("swap", [HAVUZ_ANAHTARI, false, miktar, asgari]), value: "0x0" });
      const m = await makbuz(A, h);
      if (m.status !== 1) throw new Error("Reverted: " + h);
      satDurum.textContent = "Sold in the ARCP pool on Arc. The USDC is at your address on Arc.";
    } catch (x) { satDurum.textContent = (x && x.message) || "Could not send."; }
  }));

  kap.append(panel("Your chain", zincirSec));
  kap.append(panel("Buy ARCP from any chain", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Pay in your chain's USDC. The ARCP arrives at your same address on Arc." }),
    el("div", { sinif: "girdi-grup" }, [alTutar, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), alDugme, alDurum])));
  /* ---- buy from a Solana wallet: relay brings SOL to Arc, buys ARCP in the Arc pool and delivers it to your EVM address on Arc ---- */
  const solTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "0.01", step: "0.01", value: "0.1" } });
  const solIade = el("input", { sinif: "girdi", attr: { placeholder: "your Arc / EVM address 0x… (the ARCP is delivered there on Arc)" } });
  const solDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const solDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Buy with SOL (closed · old ARCP)" });
  solDugme.addEventListener("click", tekSefer(solDugme, async () => {
    solDurum.textContent = "This is the old, retired ARCP — buying it is closed. Buy ARCP 2 in the presale (arcpulse.app/presale.html)."; return;   // the old contract is retired
    try {
      const m = await import("../solana-ikiz.js");
      const ben = await m.solanaCuzdan.baglan();
      const alici = solIade.value.trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(alici)) { solDurum.textContent = "Enter your EVM address: the ARCP is delivered to it on Arc (any EVM wallet of yours, e.g. Phantom's)."; return; }
      const lamport = BigInt(Math.round(Number(solTutar.value) * 1e9));
      if (lamport < 10_000_000n) { solDurum.textContent = "At least 0.01 SOL."; return; }
      solDurum.textContent = "Asking relay.link for the route from Solana…";
      const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        user: ben, recipient: alici, originChainId: SOLANA_RELAY, destinationChainId: 5042, originCurrency: "11111111111111111111111111111111",
        destinationCurrency: ARCP.token, amount: lamport.toString(), tradeType: "EXACT_INPUT", refundTo: ben }) }).then((x) => x.json());
      if (!q.steps) { solDurum.textContent = "No route right now: " + (q.message || "try again"); return; }
      const adim = q.steps.find((s) => s.items && s.items[0] && s.items[0].data && s.items[0].data.instructions);
      if (!adim) { solDurum.textContent = "relay returned no Solana step."; return; }
      const cik = q.details.currencyOut;
      const tahmin = "~" + tok(Number(cik.amountFormatted)) + " ARCP (at least " + tok(Number(cik.minimumAmount) / 1e18) + ")";
      solDurum.textContent = "Estimate: " + tahmin + ". Approve " + Number(q.details.currencyIn.amountFormatted).toPrecision(5) + " SOL in your Solana wallet…";
      const imza = await m.relayAdimi(adim.items[0].data);
      solDurum.textContent = "Paid on Solana (" + imza.slice(0, 12) + "…). relay buys " + tahmin + " in the Arc pool and delivers it to " + alici.slice(0, 6) + "…" + alici.slice(-4) + " on Arc, usually within minutes.";
    } catch (x) { solDurum.textContent = (x && x.message) || "Could not send."; }
  }));
  kap.append(panel("Buy ARCP from Solana", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Pay in SOL from a Solana wallet. The ARCP is bought in the same Arc pool and delivered to your EVM address on Arc. ARCP on Solana: coming." }),
    el("div", { sinif: "girdi-grup" }, [solTutar, el("span", { sinif: "girdi-grup__son", yazi: "SOL" })]), solIade, solDugme, solDurum])));
  /* ---- sell from a Solana wallet: waits for ARCP's Solana twin (coming). What works today is the second step:
     relay.link carries USDC on Arc (e.g. from selling ARCP there) to the Solana wallet as SOL, signed by the EVM wallet on Arc. ---- */
  const SOL_SAT_BEKLEYEN = "arcpulse-fthm-sol-sat";   // only the pending Solana signature, on this device
  const ssTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1000", value: "10000" } });
  const ssAlici = el("input", { sinif: "girdi", attr: { placeholder: "your Arc / EVM address 0x… (the USDC is paid there on Arc)" } });
  const ssDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const ssIz = (imza) => { try { imza ? localStorage.setItem(SOL_SAT_BEKLEYEN, imza) : localStorage.removeItem(SOL_SAT_BEKLEYEN); } catch (e) { /* storage may be blocked */ } };
  const ssBag = (imza) => el("a", { attr: { href: "https://layerzeroscan.com/tx/" + imza, target: "_blank", rel: "noopener" }, yazi: "follow it on LayerZero Scan" });
  try { const b = localStorage.getItem(SOL_SAT_BEKLEYEN); if (b) ssDurum.append("Your last sale from Solana (" + b.slice(0, 12) + "…): ", ssBag(b), "."); } catch (e) { /* storage may be blocked */ }
  /* ARCP on Solana: coming. The two buttons stay, disabled and labelled, until ARCP's Solana twin exists. */
  const yakinda = "ARCP on Solana: coming. For now ARCP lives on Arc — sell it in the Sell panel below, then bring the USDC here as SOL.";
  const ssMax = el("button", { sinif: "dugme dugme--sade", attr: { type: "button", disabled: "", title: yakinda }, yazi: "Use my balance" });
  const ssDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button", disabled: "", title: yakinda }, yazi: "Sell ARCP from Solana (coming)" });
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
  kap.append(panel("Sell ARCP from Solana", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: yakinda }),
    el("div", { sinif: "girdi-grup" }, [ssTutar, el("span", { sinif: "girdi-grup__son", yazi: "ARCP" })]), ssMax, ssAlici, ssDugme, ssDurum,
    el("div", { sinif: "alan__ipucu", yazi: "To get SOL in the Solana wallet: connect the EVM wallet that holds the USDC on Arc (Arc's gas is paid in that USDC) and relay.link brings it to Solana." }),
    el("div", { sinif: "girdi-grup" }, [ssGeri, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), ssGeriDugme, ssGeriDurum])));
  kap.append(panel("Sell", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Sell ARCP you hold on Arc, in its pool there. The USDC is paid on Arc, to your same address. ARCP on other chains: coming." }),
    el("div", { sinif: "girdi-grup" }, [satTutar, el("span", { sinif: "girdi-grup__son", yazi: "ARCP" })]), satDugme, satDurum])));
  return kap;
}
