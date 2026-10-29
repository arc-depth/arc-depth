/* ===========================================================================
 * uzak-cuzdan.js — the one-pool platform from a Solana, Sui or Aptos wallet
 *
 * Mounted under the trade panel of gorunum/merkez.js. Everything here uses
 * the wallet of that chain, never an EVM wallet, except the optional last
 * step of a Sui / Aptos launch (anyone may run it on Arc).
 *
 *   SELL / REDEEM / SEND   twins burned by the chain's twin gate; LayerZero
 *       carries them to the IkizHub on Arc with the 192-byte order MerkezKapi
 *       reads (docs/js/solana-ikiz.js, docs/js/uzak-ikiz.js). A sale pays
 *       USDC on Solana (Circle forwarding to the wallet's USDC account) or,
 *       from Sui / Aptos (Circle does not forward there), on Arc to the Arc
 *       address given. Redemptions pay on Arc. Anything that cannot be done
 *       hands the tokens to that Arc address.
 *   BUY (Solana)    relay.link: SOL in, bought in the Arc pool, the tokens
 *       to the wallet on Solana through the hub (or on Arc if the token has
 *       no Solana twin yet).
 *   LAUNCH  Solana: relay.link, as from any chain. Sui / Aptos: USDC burned
 *       through CCTP to LaunchEmaneti on Arc, the launch carried in the burn.
 *       The founder's income and tokens go to an Arc address (Circle pays
 *       neither Sui nor Aptos by itself); the tokens can be moved later.
 *       The basket is fixed here: FTHM on Arc and WETH on Base, $10 each.
 * =========================================================================== */
import { el, panel } from "./ui.js";
import { AGLAR } from "./aglar.js";
import { cuzdan } from "./cuzdan.js";
import * as egri from "./egri.js";
import { YedekliOkur } from "./yedekli-okur.js";
import { JsonRpcProvider, Contract, Interface, AbiCoder, zeroPadValue, keccak256, getAddress, isAddress, solidityPacked } from "../vendor/ethers.min.js";

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const FTHM = "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const RELAY = "https://api.relay.link";
const SOLANA_RELAY = 792703809;
const EID = { solana: 30168, sui: 30378, aptos: 30108 };
const EVM_EID = [30416, 30184, 30110, 30101, 30102, 30106, 30390, 30367];
const KAPI2 = new Interface([
  "function launch((string,string,(uint32,bytes32,uint256)[],uint256[],uint256,uint256,bytes32,uint32,uint32,uint32[],bytes,uint256,bytes,address,string[],uint32[],uint256)) payable returns (address)",
  "function al(address,uint256,uint256,uint32,bytes32,bytes,address) payable returns (uint256)",
  "function vekilOf(address) view returns (address)"]);
const ERC20 = new Interface(["function approve(address,uint256) returns (bool)"]);
const EMANET = new Interface(["function isle(bytes,bytes) returns (address)"]);
const sec = (gaz) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, gaz]);
const arcAg = () => AGLAR.find((a) => a.anahtar === "arc");
/* reads move to the next Arc RPC on 429/403 (yedekli-okur.js), as on the launch page */
let arcOkur = null;
const arc = () => (arcOkur ||= new YedekliOkur());
const hexB = (h) => Uint8Array.from((String(h).replace(/^0x/, "").match(/../g) || []).map((x) => parseInt(x, 16)));

/// The 192-byte order MerkezKapi.hubIstek reads: kind, payout chain, payee, minimum, fallback on Arc, Circle fee cap.
function siparis(tur, odemeZincir, alici32, asgari, yedek, maxUcret) {
  return hexB(AbiCoder.defaultAbiCoder().encode(["uint8", "uint32", "bytes32", "uint256", "address", "uint256"],
    [tur, odemeZincir, "0x" + Array.from(alici32, (x) => x.toString(16).padStart(2, "0")).join(""), asgari, yedek, maxUcret]));
}

/// Circle's forwarding fee from Arc to `domain`, doubled plus 5 cents (as the trade panel does).
async function ileriUcret(domain) {
  const j = await fetch("https://iris-api.circle.com/v2/burn/USDC/fees/26/" + domain + "?forward=true").then((x) => x.json()).catch(() => []);
  const s = (Array.isArray(j) ? j : j.data || []).find((x) => x.finalityThreshold === 2000) || {};
  const u = s.forwardFee ? BigInt(s.forwardFee.high ?? s.forwardFee.med ?? s.forwardFee) : 0n;
  return u * 2n + 50_000n;
}

async function makbuz(hash) {
  const { arcMakbuz } = await import("./arc-sonuc.js");
  const m = await arcMakbuz(hash, 400);
  if (!m) throw new Error("No receipt yet for " + hash + " on Arc. It may still go through: do NOT pay again. Check it at https://explorer.arc.io/tx/" + hash + ", then reload.");
  if (Number(m.status) !== 1) throw new Error("Reverted on Arc: " + hash);
  return m;
}

/* the chain's wallet and its pieces, loaded only when chosen */
async function zincir(ad) {
  if (ad === "solana") {
    const m = await import("./solana-ikiz.js");
    return { ad: "Solana", m, baglan: () => m.solanaCuzdan.baglan(), birim: "SOL", ondalik: 9 };
  }
  const u = await import("./uzak-ikiz.js");
  if (ad === "sui") {
    const s = await import("./sui.js");
    return { ad: "Sui", u, baglan: () => s.suiCuzdan.baglan(), birim: "SUI", ondalik: 9 };
  }
  const a = await import("./aptos.js");
  return { ad: "Aptos", u, baglan: () => a.aptosCuzdan.baglan(), birim: "APT", ondalik: 8 };
}

/// The panel. `token` is the trade panel's token input, `V2` the second generation's addresses, `kaymaOrani` its slippage.
export function uzakCuzdanPaneli({ token, V2, kaymaOrani }) {
  const secim = el("select", { sinif: "girdi" }, ["solana", "sui", "aptos"].map((z) => el("option", { attr: { value: z }, yazi: z[0].toUpperCase() + z.slice(1) })));
  const baglaDugme = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Connect" });
  const hesapYazi = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const arcAdres = el("input", { sinif: "girdi", attr: { placeholder: "your Arc address 0x… (payouts on Arc, fallback, founder)" } });
  const tutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1000", value: "100000" } });
  const durumYazi = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const durum = (x) => { durumYazi.textContent = x; };
  let ben = null, z = null;

  const arcAdresi = () => {
    const a = arcAdres.value.trim();
    if (!isAddress(a)) throw new Error("Enter your Arc (EVM) address: the payout, the fallback and the founder's income go there.");
    return getAddress(a);
  };
  const tokenAdresi = () => {
    const t = token.value.trim();
    if (!isAddress(t)) throw new Error("Enter the token's address on Arc above.");
    return getAddress(t);
  };
  const hazir = async () => {
    if (!V2) throw new Error("Opens with the second generation.");
    const ad = secim.value;
    if (!z || z.anahtar !== ad) { z = Object.assign(await zincir(ad), { anahtar: ad }); ben = null; }
    if (!ben) { ben = await z.baglan(); hesapYazi.textContent = z.ad + ": " + ben; }
    return z;
  };
  const bakiye = async () => {
    const t = tokenAdresi();
    if (z.anahtar === "solana") return z.m.ikizBakiye(ben, t);
    if (z.anahtar === "sui") return (await z.u.suiIkizBakiye(ben, t)).miktar;
    return (await z.u.aptosIkizBakiye(ben, t)).miktar;
  };
  baglaDugme.addEventListener("click", async () => {
    try { await hazir(); durum(token.value.trim() ? "Twins held: " + (Number(await bakiye()) / 1e6).toLocaleString("en-US") : "Connected."); }
    catch (x) { durum((x && x.message) || "Could not connect."); }
  });
  secim.addEventListener("change", () => { z = null; ben = null; hesapYazi.textContent = ""; });

  /* tur 0 sell, 1 redeem, null send to Arc */
  const gonder = async (tur) => {
    try {
      await hazir();
      const t = tokenAdresi(), yedek = arcAdresi();
      const miktar = BigInt(Math.round(Number(tutar.value) * 1e6));
      if (miktar <= 0n) return durum("Enter an amount.");
      if ((await bakiye()) < miktar) return durum("You hold fewer twins than that on " + z.ad + ".");
      const arc32 = hexB(zeroPadValue(yedek, 32));
      let istek = new Uint8Array(0), yer = "Arc (" + yedek + ")";
      if (tur !== null) {
        let asgari = 0n;
        if (tur === 0) {
          const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc(), V2.launchpad, PM, t);
          const e = egri.satim(st, Number(miktar) / 1e6);
          if (e.bitti) return durum("The pool cannot buy all of that: only ~$" + e.dolar.toFixed(2) + " is there for it. Sell less, or redeem.");
          asgari = BigInt(Math.floor(e.dolar * (1 - kaymaOrani()) * 1e6));
          durum("Estimate: ~$" + e.dolar.toFixed(2) + " after fees, price impact " + (e.etki * 100).toFixed(2) + "% (the price when it reaches Arc decides).");
        }
        if (tur === 0 && z.anahtar === "solana") {
          /* paid on Solana by Circle's forwarding, into the wallet's USDC account; opened first if missing
             (its own small transaction: with it the gate's transaction would pass Solana's 1232-byte limit) */
          const h = await z.m.usdcHesabi(ben);
          if (h.ac.length) { durum("Your wallet has no USDC account on Solana yet: approve opening it (rent ~0.002 SOL, yours)…"); await z.m.talimatGonder(h.ac); }
          istek = siparis(0, 5, h.ata32, asgari, yedek, await ileriUcret(5));
          yer = "Solana (your USDC account)";
        } else {
          istek = siparis(tur, 26, arc32, asgari, yedek, 0n);
        }
      }
      let r;
      if (z.anahtar === "solana") r = await z.m.gonder({ token20: t, alici32: arc32, miktar, istek, durum });
      else if (z.anahtar === "sui") r = await z.u.suiGonder({ token: t, alici32: arc32, miktar, istek, durum });
      else r = await z.u.aptosGonder({ token: t, alici32: arc32, miktar, istek, durum });
      durum("Sent from " + z.ad + ". LayerZero brings it to Arc " + (z.anahtar === "solana" ? "" : "through Base ") + "in minutes; " +
        (tur === 0 ? "sold in the Arc pool, the USDC paid on " + yer : tur === 1 ? "burned for redemption, each vault pays your share on Arc" : "the tokens arrive at " + yedek) +
        ". If it cannot be done, the tokens go to " + yedek + " on Arc.");
      return r;
    } catch (x) { durum((x && x.message) || "Could not send."); }
  };
  const satD = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Sell" });
  const itfaD = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Redeem" });
  const tasD = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Send to Arc" });
  /* one payment at a time: a second press while one runs could pay twice */
  const tekSefer = (dugme, fn) => async () => {
    if (dugme._mesgul) return durum("A payment is already in progress. Wait for it to finish; do not pay again.");
    dugme._mesgul = true; dugme.disabled = true;
    try { await fn(); } finally { dugme._mesgul = false; dugme.disabled = false; }
  };

  satD.addEventListener("click", tekSefer(satD, () => gonder(0)));
  itfaD.addEventListener("click", tekSefer(itfaD, () => gonder(1)));
  tasD.addEventListener("click", tekSefer(tasD, () => gonder(null)));

  /* ---- buy from Solana (relay) ---- */
  const alTutar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", step: "1", value: "20" } });
  const alD = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Buy with SOL" });
  alD.addEventListener("click", tekSefer(alD, async () => {
    try {
      await hazir();
      if (z.anahtar !== "solana") return durum("Buying is paid from Solana here (relay.link); from Sui or Aptos, use the buy above with an EVM wallet.");
      const t = tokenAdresi(), yedek = arcAdresi();
      const usdc6 = BigInt(Math.round(Number(alTutar.value) * 1e6));
      if (usdc6 < 1_000_000n) return durum("At least $1.");
      const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc(), V2.launchpad, PM, t);
      const e = egri.alim(st, Number(usdc6) / 1e6);
      const asgari = BigInt(Math.floor(e.token * (1 - kaymaOrani()) * 1e6)) * 10n ** 12n;
      const hub = new Contract(V2.hub, ["function ucret(uint32,bytes) view returns (uint256)", "function yaratildi(address,uint32) view returns (bool)"], arc());
      const solVar = await hub.yaratildi(t, EID.solana);
      const benB = await z.m.adresBaytlari(ben);
      const alici = solVar ? "0x" + Array.from(benB, (x) => x.toString(16).padStart(2, "0")).join("") : zeroPadValue(yedek, 32);
      const deger = solVar ? ((await hub.ucret(EID.solana, AbiCoder.defaultAbiCoder().encode(["uint8", "address", "bytes32", "uint256"], [2, t, alici, 10n ** 12n]))) * 13n) / 10n : 0n;
      const txs = [
        { to: ARC_USDC, data: ERC20.encodeFunctionData("approve", [V2.kapi, usdc6]), value: "0" },
        { to: V2.kapi, data: KAPI2.encodeFunctionData("al", [t, usdc6, asgari, solVar ? EID.solana : 0, alici, "0x", yedek]), value: deger.toString() }];
      await relaySolana(usdc6, deger, txs, yedek, "~" + e.token.toLocaleString("en-US", { maximumFractionDigits: 0 }) + " tokens" +
        (solVar ? ", delivered to this wallet on Solana" : " (this token has no Solana twin yet: delivered to " + yedek + " on Arc)"));
    } catch (x) { durum((x && x.message) || "Could not buy."); }
  }));

  /* relay from Solana: quote (relay simulates the Arc side), show it, then the wallet signs relay's Solana instructions */
  async function relaySolana(usdc6, deger, txs, yedek, ne) {
    durum("Asking relay.link for the route from Solana (it simulates the Arc side first)…");
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      user: ben, recipient: yedek, originChainId: SOLANA_RELAY, destinationChainId: 5042, originCurrency: "11111111111111111111111111111111",
      destinationCurrency: "0x0000000000000000000000000000000000000000", amount: (usdc6 * 10n ** 12n + deger).toString(),
      tradeType: "EXACT_OUTPUT", txsGasLimit: 9_000_000, txs }) }).then((x) => x.json());
    if (!q.steps) throw new Error("No route: " + (q.message || "try again") + (q.errorCode ? " (" + q.errorCode + ")" : ""));
    const odenen = Number(q.details.currencyIn.amountFormatted).toPrecision(5) + " SOL (≈ $" + Number(q.details.currencyIn.amountUsd).toFixed(2) + ")";
    if (!confirm("Pay " + odenen + " from Solana for: " + ne + ". relay.link carries it to Arc and runs it there. Continue?")) return durum("Cancelled.");
    const adim = q.steps.find((s) => s.items && s.items[0] && s.items[0].data && s.items[0].data.instructions);
    if (!adim) throw new Error("relay returned no Solana step.");
    durum("Approve in your Solana wallet (" + odenen + ")…");
    const imza = await z.m.relayAdimi(adim.items[0].data);
    /* follow the request until it ran on Arc (as the EVM path does), so "done" is only said once it is done */
    const id = adim.requestId || (q.steps.map((s) => s.requestId).find(Boolean)) || "";
    const izle = "relay.link/transaction/" + id;
    if (!id) return durum("Paid on Solana (" + imza.slice(0, 12) + "…). relay runs it on Arc within a minute; do not pay again.");
    for (let i = 0; i < 60; i++) {
      durum("Paid on Solana (" + imza.slice(0, 12) + "…). Waiting for relay to run it on Arc… (" + izle + ")");
      const d = await fetch(RELAY + "/intents/status/v2?requestId=" + id, { signal: AbortSignal.timeout(15_000) }).then((x) => x.json()).catch(() => ({}));
      if (d.status === "success") { durum("Done on Arc: " + ne + " (" + izle + ")."); return { id }; }
      if (d.status === "failure" || d.status === "refund" || d.status === "refunded")
        throw new Error("relay could not run it on Arc (" + d.status + "); relay refunds the payment to your Solana wallet. Details: " + izle);
      await new Promise((r) => setTimeout(r, 5000));
    }
    durum("Paid on Solana. relay is still running it on Arc; do not pay again. Follow it at " + izle + ".");
  }

  /* ---- launch ---- */
  const lAd = el("input", { sinif: "girdi", attr: { placeholder: "name" } });
  const lSembol = el("input", { sinif: "girdi", attr: { placeholder: "SYMBOL" } });
  const lAlim = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "100", max: "500", step: "10", value: "100" } });
  const lIkiz = el("input", { attr: { type: "checkbox" } });
  lIkiz.checked = true;
  const lD = el("button", { sinif: "dugme", attr: { type: "button" }, yazi: "Launch from this wallet" });
  const bitirD = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button", hidden: "" }, yazi: "Finish on Arc now (EVM wallet, cents of gas)" });
  let bekleyen = null;
  /* A burn waiting for Arc survives a closed page: only the burn's source domain and transaction hash
     are kept, on this device, and cleared once the launch is carried out. A hash from another device
     can be pasted below. */
  const BEKLEYEN = "arcpulse-launch-bekleyen";
  const bekleyenYaz = (v) => { try { v ? localStorage.setItem(BEKLEYEN, JSON.stringify(v)) : localStorage.removeItem(BEKLEYEN); } catch (e) { /* storage may be blocked */ } };
  const bekleyenOku = () => { try { return JSON.parse(localStorage.getItem(BEKLEYEN) || "null"); } catch (e) { return null; } };
  const hashGir = el("input", { sinif: "girdi", attr: { placeholder: "burn transaction hash on Sui or Aptos (to finish a launch started elsewhere)" } });
  const hashD = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Find my launch" });
  hashD.addEventListener("click", () => {
    const h = hashGir.value.trim();
    if (!h) return durum("Paste the burn transaction hash first.");
    /* CCTP domains: Sui 8, Aptos 9 (0x-prefixed hashes are Aptos; Sui digests are base58) */
    bekleyen = { kaynak: h.startsWith("0x") ? 9 : 8, hash: h, zincir: h.startsWith("0x") ? "Aptos" : "Sui", t: Date.now() };
    bekleyenYaz(bekleyen);
    bitirD.hidden = false;
    durum("Found. Press \"Finish on Arc\": it checks Circle's attestation first.");
  });
  {
    const k = bekleyenOku();
    if (k && k.hash && Date.now() - (k.t || 0) < 30 * 864e5) {
      bekleyen = k;
      bitirD.hidden = false;
      setTimeout(() => durum("A launch you started from " + (k.zincir || "Sui/Aptos") + " (" + k.hash.slice(0, 14) + "…) is waiting for Arc. Press \"Finish on Arc\"."), 0);
    }
  }
  lD.addEventListener("click", tekSefer(lD, async () => {
    try {
      await hazir();
      const kurucu = arcAdresi();
      const ad = lAd.value.trim(), sembol = lSembol.value.trim().toUpperCase();
      if (!ad || !sembol) return durum("Name and symbol.");
      if (ad.length > 32 || sembol.length > 10) return durum("Name up to 32 characters, symbol up to 10.");
      const alim6 = BigInt(Math.round(Number(lAlim.value) * 1e6));
      /* the gate refuses a first buy outside $100–$500: a burn for less would only come back as a refund on Arc */
      if (alim6 < 100_000_000n || alim6 > 500_000_000n) return durum("The first buy is between $100 and $500.");
      const b = (a) => zeroPadValue(a, 32);
      /* the fixed basket: FTHM on Arc and WETH on Base, $10 each (the rough quotes only seed the vaults' auctions) */
      const sepet = [[26, b(FTHM), 10_000_000n], [6, b("0x4200000000000000000000000000000000000006"), 10_000_000n]];
      const teklif = [650_000n * 10n ** 18n, 3n * 10n ** 15n];
      const toplam = alim6 + 20_000_000n;
      /* creating a twin measured 4.54–4.78M gas on 22 Oct (Monad the most); 3.5M ran out on every chain */
      const ikizSec = sec(6_300_000n);
      const evm = lIkiz.checked ? EVM_EID : [];
      const ikizGercek = evm.length ? await new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)"], arc()).ucret(FTHM, evm, ikizSec) : 0n;
      const ikizUcret = (ikizGercek * 11n) / 10n;
      const istek = (iade) => [ad, sembol, sepet, teklif, 20_000n, alim6, b(kurucu), 26, 0, evm, ikizSec, ikizUcret, sec(100_000n), iade, ["", ""], [], 0n];
      if (z.anahtar === "solana") {
        const txs = [
          { to: ARC_USDC, data: ERC20.encodeFunctionData("approve", [V2.kapi, toplam]), value: "0" },
          { to: V2.kapi, data: KAPI2.encodeFunctionData("launch", [istek(kurucu)]), value: ikizUcret.toString() }];
        const rs = await relaySolana(toplam, ikizUcret, txs, kurucu, "launching " + sembol + " ($" + Number(alim6) / 1e6 + " first buy, $20 basket" +
          (evm.length ? ", twins on 8 EVM chains" : "") + "); your tokens and the founder's income go to " + kurucu + " on Arc");
        if (rs && rs.id) {
          const { relayLaunchTokeni, tokenBaglantilari } = await import("./arc-sonuc.js");
          const yeni = await relayLaunchTokeni(rs.id).catch(() => null);
          if (yeni) durum("Launched on Arc.  " + tokenBaglantilari(yeni));
        }
        return;
      }
      if (!V2.emanet) return durum("Launching from " + z.ad + " opens when LaunchEmaneti is deployed on Arc (scripts/dagit-launch-emaneti.js).");
      /* paid by a CCTP burn: the dollars and the launch arrive together at LaunchEmaneti; the LayerZero value comes out of them */
      const deger6 = (ikizUcret + 10n ** 12n - 1n) / 10n ** 12n;
      /* v4: $0.05 more for whoever carries the launch out on Arc if this page is closed by then (LaunchEmaneti.BAHSIS);
         when this page does it from your own Arc address, it comes back with the rest */
      const bahsis6 = Number(V2.surum || 2) >= 4 ? 50_000n : 0n;
      const miktar6 = toplam + deger6 + bahsis6;
      const kanca = z.u.launchKancasi(AbiCoder, istek(V2.emanet), kurucu);
      if (!confirm("Burn $" + (Number(miktar6) / 1e6).toFixed(2) + " USDC on " + z.ad + " for " + sembol + ": first buy $" + Number(alim6) / 1e6 +
        ", basket $20" + (evm.length ? ", twins on 8 EVM chains ≈ $" + (Number(ikizGercek) / 1e18).toFixed(2) + " (+10%)" : "") +
        ". Your tokens, the founder's income and anything unused go to " + kurucu + " on Arc. Continue?")) return durum("Cancelled.");
      const r = z.anahtar === "sui" ? await z.u.suiLaunch({ emanet: V2.emanet, miktar6, kanca, durum }) : await z.u.aptosLaunch({ emanet: V2.emanet, miktar6, kanca, durum });
      bekleyen = r;
      bekleyenYaz({ kaynak: r.kaynak, hash: r.hash, zincir: z.ad, t: Date.now() });
      durum("Burned on " + z.ad + " (" + r.hash.slice(0, 14) + "…). Circle attests it in a few minutes; then anyone runs it on Arc (LaunchEmaneti.isle). Waiting for the attestation…");
      for (let i = 0; i < 120; i++) {
        const o = await z.u.onay(r.kaynak, r.hash);
        if (o) { bekleyen.onay = o; bitirD.hidden = false; return durum("Attested. Press \"Finish on Arc\" with any EVM wallet (or leave it to anyone: it can only launch your token, with your dollars" +
          (Number(V2.surum || 2) >= 4 ? "; whoever does it gets $0.05 of them" : "") + ")."); }
        await new Promise((ok) => setTimeout(ok, 10_000));
      }
      durum("Still waiting for Circle's attestation; come back and press Launch's finish when it is ready (" + r.hash + ").");
    } catch (x) { durum((x && x.message) || "Could not launch."); }
  }));
  bitirD.addEventListener("click", tekSefer(bitirD, async () => {
    try {
      if (!bekleyen) return durum("Nothing waiting.");
      if (!bekleyen.onay) {
        const o = await (await import("./uzak-ikiz.js")).onay(bekleyen.kaynak, bekleyen.hash);
        if (!o) return durum("Circle has not attested this burn yet (" + bekleyen.hash.slice(0, 14) + "…). It usually takes a few minutes; press again later. Your dollars are safe meanwhile.");
        bekleyen.onay = o;
      }
      if (!cuzdan.hesap()) await cuzdan.bagla();
      const h = await cuzdan.agdaGonder(arcAg(), { to: V2.emanet, data: EMANET.encodeFunctionData("isle", [bekleyen.onay.message, bekleyen.onay.attestation]), value: "0x0" });
      durum("Sent on Arc (" + h.slice(0, 14) + "…). Waiting for the receipt…");
      const { arcMakbuz, emanetSonucu, tokenBaglantilari } = await import("./arc-sonuc.js");
      const m = await arcMakbuz(h);
      if (!m) return durum("No receipt yet for " + h + " on Arc. It may still go through: do NOT press again. Check it at https://explorer.arc.io/tx/" + h + ", then reload.");
      if (Number(m.status) !== 1) throw new Error("Reverted on Arc: " + h + ". If someone already carried this launch out, your token is on Arc; check Discover.");
      bitirD.hidden = true;
      bekleyenYaz(null);
      /* LaunchEmaneti refunds inside a successful transaction when the launch itself fails: say which one happened */
      const r = emanetSonucu(m);
      if (r && !r.token) return durum("The launch did not go through on Arc, so your dollars were refunded: $" + (Number(r.iade) / 1e6).toFixed(2) + " is at your address on Arc (" + h + ").");
      durum("Launched on Arc: " + h + (r && r.token ? "  " + tokenBaglantilari(r.token) : ""));
    } catch (x) { const t = (x && x.message) || "Could not finish."; durum(/^Reverted/.test(t) ? t + " If someone already carried this launch out, your token is on Arc: check Discover." : t); }
  }));

  return panel("From a Solana, Sui or Aptos wallet", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Use the token above from a wallet on Solana, Sui or Aptos. Twins are sent to Arc by LayerZero (its fee shown before you sign); a sale from Solana pays USDC on Solana, from Sui or Aptos on your Arc address. Anything that cannot be done goes to your Arc address." }),
    el("div", { sinif: "girdi-grup" }, [secim, baglaDugme]), hesapYazi, arcAdres,
    el("div", { sinif: "girdi-grup" }, [tutar, el("span", { sinif: "girdi-grup__son", yazi: "twins" })]),
    el("div", { sinif: "girdi-grup" }, [satD, itfaD, tasD]),
    el("div", { sinif: "alan__ipucu", yazi: "Buy with SOL (relay.link): bought in the Arc pool, delivered to this wallet on Solana." }),
    el("div", { sinif: "girdi-grup" }, [alTutar, el("span", { sinif: "girdi-grup__son", yazi: "$" }), alD]),
    el("div", { sinif: "alan__ipucu", yazi: "Launch from this wallet: Solana pays through relay.link; Sui and Aptos burn USDC through Circle to LaunchEmaneti on Arc, which launches with it. Basket: FTHM on Arc + WETH on Base, $10 each. The founder's tokens and income go to the Arc address above." }),
    el("div", { sinif: "girdi-grup" }, [lAd, lSembol]),
    el("div", { sinif: "girdi-grup" }, [lAlim, el("span", { sinif: "girdi-grup__son", yazi: "$ first buy" })]),
    el("label", { sinif: "alan__ipucu" }, [lIkiz, el("span", { yazi: " twins on the 8 EVM chains now (their LayerZero fee is added)" })]),
    lD, bitirD, el("div", { sinif: "girdi-grup" }, [hashGir, hashD]), durumYazi]));
}
