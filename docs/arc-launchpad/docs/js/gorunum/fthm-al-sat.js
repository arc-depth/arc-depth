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
import { el, sayfaUst, panel, not, temizle } from "../ui.js";
import { AGLAR } from "../aglar.js";
import { cuzdan } from "../cuzdan.js";
import { JsonRpcProvider, Contract, Interface, AbiCoder, zeroPadValue } from "../../vendor/ethers.min.js";

const KAPI = "0x060BD07354462eBa410164aBaB6965fe289d2e80";
const ADAPTOR = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const IKIZ = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const RELAY = "https://api.relay.link";
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
  kap.append(sayfaUst("FTHM on any chain", "One market on Arc, reachable from every chain"));
  kap.append(not("Buying and selling both go through FTHM's pool on Arc, so the price is the same wherever you hold it. You sign on your own chain; you never need Arc gas to buy.", "bilgi"));

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
  kap.append(panel("Buy", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Pay in your chain's USDC. The FTHM arrives on the same chain." }),
    el("div", { sinif: "girdi-grup" }, [alTutar, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), alDugme, alDurum])));
  kap.append(panel("Sell", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Sell FTHM you hold on this chain. The USDC is paid on Arc, to your same address." }),
    el("div", { sinif: "girdi-grup" }, [satTutar, el("span", { sinif: "girdi-grup__son", yazi: "FTHM" })]), satDugme, satDurum])));
  return kap;
}
