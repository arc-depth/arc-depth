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

const arc = new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true });
const evmler = () => AGLAR.filter((a) => a.anahtar !== "arc");

async function makbuz(ag, hash) {
  const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
  for (let i = 0; i < 120; i++) {
    const m = await p.getTransactionReceipt(hash).catch(() => null);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("No receipt yet for " + hash);
}

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
  alDugme.addEventListener("click", async () => {
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
      const e = new Interface(["function approve(address,uint256) returns (bool)"]);
      const k = new Interface(["function alVeGonder(uint32,uint256,uint256,address,bytes) payable returns (uint256)"]);
      const govde = { user: ben, recipient: ben, originChainId: ag.id, destinationChainId: 5042,
        originCurrency: ag.dolar, destinationCurrency: "0x0000000000000000000000000000000000000000",
        amount: (toplam * 10n ** 12n).toString(), tradeType: "EXACT_OUTPUT", txsGasLimit: 1500000,
        txs: [{ to: ARC_USDC, data: e.encodeFunctionData("approve", [KAPI, girdi]), value: "0" },
          { to: KAPI, data: k.encodeFunctionData("alVeGonder", [ag.eid, girdi, 1n, ben, "0x"]), value: deger.toString() }] };
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
  });

  /* ---- sell ---- */
  const satTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1000", value: "10000" } });
  const satDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const satDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Sell FTHM" });
  satDugme.addEventListener("click", async () => {
    try {
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) { satDurum.textContent = "Connect a wallet first."; return; }
      const miktar = BigInt(Math.round(Number(satTutar.value))) * 10n ** 18n;
      const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
      const t = new Contract(IKIZ, OFT_ABI, p);
      const compose = AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [ben, 0]);
      const prm = [ARC_EID, zeroPadValue(KAPI, 32), miktar, (miktar * 99n) / 100n, SAT_SECENEK, compose, "0x"];
      const [ucret] = await t.quoteSend(prm, false);
      satDurum.textContent = "Sending to the gate on Arc (fee " + (Number(ucret) / 1e18).toPrecision(3) + " " + ag.gaz + ")…";
      const h = await cuzdan.agdaGonder(ag, { to: IKIZ, data: new Interface(OFT_ABI).encodeFunctionData("send", [prm, [ucret, 0], ben]), value: "0x" + ucret.toString(16) });
      const m = await makbuz(ag, h);
      if (m.status !== 1) throw new Error("Reverted: " + h);
      satDurum.textContent = "Sent. The gate sells on Arc and the USDC arrives at your address on Arc in a few minutes.";
    } catch (x) { satDurum.textContent = (x && x.message) || "Could not send."; }
  });

  kap.append(panel("Your chain", zincirSec));
  kap.append(panel("Buy FTHM from any chain", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Pay in your chain's USDC. The FTHM arrives on the same chain." }),
    el("div", { sinif: "girdi-grup" }, [alTutar, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), alDugme, alDurum])));
  /* ---- buy from a Solana wallet: relay brings SOL to Arc as USDC, KapiUzak buys in Arc's pool and LayerZero delivers to the wallet on Solana ---- */
  const solTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "2", step: "1", value: "10" } });
  const solIade = el("input", { sinif: "girdi", attr: { placeholder: "your Arc / EVM address 0x… (only for relay refunds)" } });
  const solDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const solDugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Buy FTHM with SOL" });
  solDugme.addEventListener("click", async () => {
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
      const e = new Interface(["function approve(address,uint256) returns (bool)"]);
      const k = new Interface(["function alVeGonder(uint32,uint256,uint256,bytes32,bytes) payable returns (uint256)"]);
      solDurum.textContent = "Asking relay.link for the route from Solana…";
      const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        user: ben, recipient: iade, originChainId: SOLANA_RELAY, destinationChainId: 5042, originCurrency: "11111111111111111111111111111111",
        destinationCurrency: "0x0000000000000000000000000000000000000000", amount: (toplam * 10n ** 12n).toString(), tradeType: "EXACT_OUTPUT", txsGasLimit: 1500000,
        txs: [{ to: ARC_USDC, data: e.encodeFunctionData("approve", [KAPI_UZAK, girdi]), value: "0" },
          { to: KAPI_UZAK, data: k.encodeFunctionData("alVeGonder", [SOL_EID, girdi, 1n, alici, "0x"]), value: deger.toString() }] }) }).then((x) => x.json());
      if (!q.steps) { solDurum.textContent = "No route right now: " + (q.message || "try again"); return; }
      const adim = q.steps.find((s) => s.items && s.items[0] && s.items[0].data && s.items[0].data.instructions);
      if (!adim) { solDurum.textContent = "relay returned no Solana step."; return; }
      solDurum.textContent = "Approve " + Number(q.details.currencyIn.amountFormatted).toPrecision(5) + " SOL in your Solana wallet…";
      const imza = await m.relayAdimi(adim.items[0].data);
      solDurum.textContent = "Paid on Solana (" + imza.slice(0, 12) + "…). relay buys on Arc and LayerZero delivers the FTHM to this wallet on Solana, usually within minutes.";
    } catch (x) { solDurum.textContent = (x && x.message) || "Could not send."; }
  });
  kap.append(panel("Buy FTHM from Solana", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Pay in SOL from a Solana wallet. The FTHM is bought in the same Arc pool and arrives in this wallet on Solana (mint Cx3gUyxZY3JzQaJ2w1V54gpg8PNZRtXbEoYpuZNtaQBb)." }),
    el("div", { sinif: "girdi-grup" }, [solTutar, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), solIade, solDugme, solDurum])));
  kap.append(panel("Sell", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Sell FTHM you hold on this chain. The USDC is paid on Arc, to your same address." }),
    el("div", { sinif: "girdi-grup" }, [satTutar, el("span", { sinif: "girdi-grup__son", yazi: "FTHM" })]), satDugme, satDurum])));
  return kap;
}
