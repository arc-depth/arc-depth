/* ===========================================================================
 * gorunum/kasalar.js — the basket vaults, one per chain
 *
 * A launch's collateral is a basket of up to five tokens, each held in the
 * vault on its own chain. Each vault buys and sells through reverse Dutch
 * auctions that anyone can fill: a buy auction offers dollars for units of
 * the asset, a sell auction (a redemption) offers units for dollars; the
 * ask starts at twice the last price, halves every 30 minutes, stops at a
 * sixteenth and restarts after a day.
 *
 * v4 vaults (23 Oct 2026) on a chain with Uniswap v3 buy and sell in the
 * pool itself, within ~3% of its 30-minute average; the auction stays as
 * their fallback. Each card reads which a vault does (its `fabrika`): a
 * vault without one (every v2 vault) is auctions only.
 *
 * Read live from each chain: the vault's dollars, how many auctions it has
 * opened, and the open ones with what they ask right now. Per-token
 * collateral is on Discover.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum } from "../ui.js";
import { para } from "../bicim.js";
import { kasaOzeti, ZINCIRLER, SEPET, saglayici } from "../teminat-izle.js";
import { Contract } from "../../vendor/ethers.min.js";

const ACIK = [26, 6, 3, 1, 15, 19, 17, 0, 35, 8, 9];
const RENK = { Arc: "#7c5cff", Base: "#0052ff", Arbitrum: "#28a0f0", BNB: "#f0b90b", Avalanche: "#e84142", Monad: "#836ef9", HyperEVM: "#50e3c2", Sui: "#4da2ff", Aptos: "#2ed8a7", Ethereum: "#627eea", Robinhood: "#ccff00" };
const cip = (z) => el("span", { sinif: "tk__zincir", attr: { style: "--z:" + (RENK[z] || "#888") }, yazi: z });
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const adresLinki = (d, a) => {
  const z = ZINCIRLER[d];
  const yol = d === 8 ? "/object/" : d === 9 ? "/object/" : "/address/";
  return el("a", { attr: { href: z.kasif + yol + a + (d === 9 ? "?network=mainnet" : ""), target: "_blank", rel: "noopener" }, yazi: kisa(a) });
};
const sure = (sn) => (sn < 3600 ? Math.floor(sn / 60) + " min" : sn < 86400 ? Math.floor(sn / 3600) + " h" : Math.floor(sn / 86400) + " d");

/* a launch id → its token's symbol, through the Defter on Arc */
const sembolOnbellek = new Map();
function launchSembolu(id) {
  if (!sembolOnbellek.has(id)) {
    sembolOnbellek.set(id, (async () => {
      const arc = saglayici(26);
      const l = await new Contract(SEPET.defter, ["function launchlar(uint64) view returns (uint32, bytes32 token, uint256, uint256, uint256, bool)"], arc).launchlar(id);
      const t = "0x" + l.token.slice(26);
      return new Contract(t, ["function symbol() view returns (string)"], arc).symbol().catch(() => "#" + id);
    })().catch(() => "#" + id));
  }
  return sembolOnbellek.get(id);
}
const ondalikOnbellek = new Map();
function ondalik(d, varlik) {
  const k = d + ":" + varlik;
  if (!ondalikOnbellek.has(k)) ondalikOnbellek.set(k, new Contract(varlik, ["function decimals() view returns (uint8)", "function symbol() view returns (string)"], saglayici(d))
    .decimals().then(Number).catch(() => 18));
  return ondalikOnbellek.get(k);
}

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Collateral vaults", "The basket vaults on eleven chains: what they hold and the auctions anyone can fill"));
  kap.append(not("Every launch's collateral is a basket of up to five tokens, each kept in the vault on its own chain. " +
    "A vault on a chain with Uniswap v3 (shown on its card) buys and sells in the pool itself, no worse than ~3% from the pool's 30-minute average; " +
    "anything the price limit stops waits and anyone can push it (for a $0.05 tip). Every other vault, and the fallback of all of them, " +
    "is a reverse Dutch auction that anyone can fill: the ask starts at twice the last price, halves every 30 minutes, " +
    "never goes below a sixteenth, and restarts after a day. Each token's collateral is on Discover.", "bilgi"));

  const sonuclar = await Promise.allSettled(ACIK.map((d) => kasaOzeti(d)));
  const okunan = sonuclar.filter((s) => s.status === "fulfilled").map((s) => s.value);
  const dolar = okunan.reduce((a, o) => a + (o.dolar || 0), 0);
  const ihale = okunan.reduce((a, o) => a + o.ihaleSayisi, 0);
  const acikSay = okunan.reduce((a, o) => a + (o.acik ? o.acik.length : 0), 0);
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Vaults", ACIK.length + " of 12", "Robinhood's vault is deployed; Circle has not opened CCTP into Robinhood yet. Solana not open yet"),
    olcum("Dollars in the vaults", para(dolar), "waiting for their auctions to fill"),
    olcum("Auctions so far", String(ihale), "on all eleven chains"),
    olcum("Open now", String(acikSay), "on the EVM chains, newest 40 each"),
  ]));

  /* ---- one card per chain ---- */
  const kartlar = ACIK.map((d, i) => {
    const s = sonuclar[i], z = ZINCIRLER[d];
    if (s.status !== "fulfilled") {
      return el("div", { sinif: "jeton-kart" }, [cip(z.ad), el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Could not read: " + (s.reason && s.reason.message || "").slice(0, 120) })]);
    }
    const o = s.value;
    const olc = (et, dg) => el("div", { sinif: "jeton-kart__olcum" }, [el("div", { sinif: "et", yazi: et }), el("div", { sinif: "dg", yazi: dg })]);
    /* how this vault buys: read from the vault (v4 has a Uniswap v3 factory; v2 and the Move / Solana vaults do not) */
    const nasil = olc("Buys in", "…");
    if (d === 8 || d === 9 || d === 5) nasil.lastChild.textContent = "auction";
    else new Contract(o.kasa, ["function fabrika() view returns (address)"], saglayici(d)).fabrika()
      .then((f) => { nasil.lastChild.textContent = /^0x0+$/.test(f) ? "auction" : "Uniswap v3 pool"; })
      .catch(() => { nasil.lastChild.textContent = "auction"; });
    return el("div", { sinif: "jeton-kart" }, [
      el("div", { sinif: "tk__ust" }, [cip(z.ad), el("span", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [adresLinki(d, o.kasa)])]),
      el("div", { sinif: "jeton-kart__olcumler" }, [
        olc("Dollars", o.dolar == null ? "—" : para(o.dolar)),
        olc("Auctions", String(o.ihaleSayisi)),
        olc("Open", o.acik ? String(o.acik.length) : "—"),
        nasil,
      ]),
    ]);
  });
  kap.append(panel("Vaults", el("div", { sinif: "izgara izgara--kart" }, kartlar)));

  /* ---- open auctions ---- */
  const acik = [];
  ACIK.forEach((d, i) => { const s = sonuclar[i]; if (s.status === "fulfilled" && s.value.acik) for (const a of s.value.acik) acik.push({ d, ...a }); });
  if (!acik.length) {
    kap.append(panel("Open auctions", bos("No open auctions", "Auctions open when a launch's basket is bought, when collateral tax re-buys it and when someone redeems.")));
    return kap;
  }
  acik.sort((a, b) => b.baslama - a.baslama);
  const simdi = Date.now() / 1000;
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["Chain", "Token", "Auction", "Vault gives", "Asks now", "Open for"].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  for (const a of acik) {
    const z = ZINCIRLER[a.d];
    const tok = el("td", { yazi: "#" + a.launchId });
    launchSembolu(a.launchId).then((s) => { tok.textContent = s; });
    const ver = el("td", { sinif: "sayi", yazi: "—" }), ist = el("td", { sinif: "sayi", yazi: "—" });
    const dolarYaz = (x) => para(Number(x) / 10 ** z.usdcDec);
    ondalik(a.d, a.varlik).then((dec) => {
      const birim = (x) => (Number(x) / 10 ** dec).toLocaleString("en-US", { maximumSignificantDigits: 6 }) + " units";
      if (a.tur === "buy") { ver.textContent = dolarYaz(a.verilen); ist.textContent = birim(a.istenen); }
      else { ver.textContent = birim(a.verilen); ist.textContent = dolarYaz(a.istenen); }
    });
    g.append(el("tr", {}, [el("td", {}, [cip(z.ad)]), tok,
      el("td", {}, [el("span", { sinif: "etiket " + (a.tur === "buy" ? "etiket--alis" : "etiket--satis"), yazi: a.tur === "buy" ? "buys the asset" : "sells the asset" })]),
      ver, ist, el("td", { yazi: sure(simdi - a.baslama) })]));
  }
  t.append(g);
  kap.append(panel("Open auctions", el("div", { sinif: "tablo-sarmal" }, [t]),
    el("span", { sinif: "ucuncul", yazi: "fill with the vault's doldur(id, offer)" })));
  return kap;
}
