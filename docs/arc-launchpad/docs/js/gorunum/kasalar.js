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
 * v6 vaults (24 Oct 2026) buy from a pool on every chain: Uniswap v4 on
 * Arc (a slowly moving reference price), PancakeSwap v3 on BNB, Uniswap v3
 * elsewhere, Raydium / Cetus / Hyperion off EVM. The auction is only the
 * fallback for an asset with no pool (the launch form refuses those).
 *
 * Read live from each chain: the vault's dollars, how many auctions it has
 * opened, and the open ones with what they ask right now. Per-token
 * collateral is on Discover.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum } from "../ui.js";
import { para } from "../bicim.js";
import { kasaOzeti, ZINCIRLER, SEPET, saglayici, sepetV2, sepetV9 } from "../teminat-izle.js";
import { maskotBos, cubuklar, arsiv, sozlesmeAyrinti, dugmeLink } from "./squad.js";
import { Contract } from "../../vendor/ethers.min.js";

const ACIK = [26, 6, 3, 1, 15, 19, 17, 0, 35, 8, 9];
const RENK = { Elysium: "#c6f86b", Arc: "#7c5cff", Base: "#0052ff", Arbitrum: "#28a0f0", BNB: "#f0b90b", Avalanche: "#e84142", Monad: "#836ef9", HyperEVM: "#50e3c2", Sui: "#4da2ff", Aptos: "#2ed8a7", Ethereum: "#627eea", Robinhood: "#ccff00" };
const cip = (z) => el("span", { sinif: "tk__zincir", attr: { style: "--z:" + (RENK[z] || "#888") }, yazi: z });
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const adresLinki = (d, a) => {
  const z = ZINCIRLER[d];
  const yol = d === 8 ? "/object/" : d === 9 ? "/object/" : "/address/";
  return el("a", { attr: { href: z.kasif + yol + a + (d === 9 ? "?network=mainnet" : ""), target: "_blank", rel: "noopener" }, yazi: kisa(a) });
};
const sure = (sn) => (sn < 3600 ? Math.floor(sn / 60) + " min" : sn < 86400 ? Math.floor(sn / 3600) + " h" : Math.floor(sn / 86400) + " d");

/* a launch id → its token's symbol, through the collateral ledger on Arc of the set the vault belongs to */
const sembolOnbellek = new Map();
function launchSembolu(id, defter = SEPET.defter) {
  const anahtar = defter + ":" + id;
  if (!sembolOnbellek.has(anahtar)) {
    sembolOnbellek.set(anahtar, (async () => {
      const arc = saglayici(26);
      const l = await new Contract(defter, ["function launchlar(uint64) view returns (uint32, bytes32 token, uint256, uint256, uint256, bool)"], arc).launchlar(id);
      const t = "0x" + l.token.slice(26);
      return new Contract(t, ["function symbol() view returns (string)"], arc).symbol().catch(() => "#" + id);
    })().catch(() => "#" + id));
  }
  return sembolOnbellek.get(anahtar);
}
const ondalikOnbellek = new Map();
function ondalik(d, varlik) {
  const k = d + ":" + varlik;
  if (!ondalikOnbellek.has(k)) ondalikOnbellek.set(k, new Contract(varlik, ["function decimals() view returns (uint8)", "function symbol() view returns (string)"], saglayici(d))
    .decimals().then(Number).catch(() => 18));
  return ondalikOnbellek.get(k);
}

/* the chains each set's vaults sit on (CCTP domains) */
const V8_ZINCIR = [26, 6, 3, 0, 1, 15, 19, 17, 35, 8, 9];   // + Solana, shown from the config
const V9_ZINCIR = [26, 6, 3, 0, 1, 15, 19, 17, 35];

/* one set: read every vault */
async function setOku(cfg, alan) {
  const sonuclar = await Promise.allSettled(alan.map((d) => kasaOzeti(d, cfg)));
  return alan.map((d, i) => ({ d, s: sonuclar[i] }));
}

function kasaKarti(d, s, poolMu, ayniAdres = null) {
  const z = ZINCIRLER[d];
  if (s.status !== "fulfilled") {
    return el("div", { sinif: "jeton-kart" }, [el("div", { sinif: "tk__ust" }, [cip(z.ad)]),
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Not readable right now (the chain's public endpoint did not answer). Try again in a minute." })]);
  }
  const o = s.value;
  const olc = (et, dg) => el("div", { sinif: "jeton-kart__olcum" }, [el("div", { sinif: "et", yazi: et }), el("div", { sinif: "dg", yazi: dg })]);
  /* how this vault buys: read from the vault (a vault with a Uniswap v3 factory buys in a pool; one without is auctions only) */
  const nasil = el("div", { sinif: "yazi yazi--kucuk" }, [el("span", { sinif: "yazi--sessiz", yazi: "Buys in: " }), el("span", { yazi: "…" })]);
  if (d === 8 || d === 9 || d === 5) nasil.lastChild.textContent = poolMu ? { 8: "Cetus pool", 9: "Hyperion pool", 5: "Raydium pool" }[d] : "auction";
  else if (poolMu && d === 26) nasil.lastChild.textContent = "Uniswap v4 pool";
  else new Contract(o.kasa, ["function fabrika() view returns (address)"], saglayici(d)).fabrika()
    .then((f) => { nasil.lastChild.textContent = /^0x0+$/.test(f) ? "auction" : d === 17 ? "PancakeSwap v3 pool" : d === 19 ? "HyperSwap v3 pool" : "Uniswap v3 pool"; })
    .catch(() => { nasil.lastChild.textContent = "auction"; });
  return el("div", { sinif: "jeton-kart" }, [
    el("div", { sinif: "tk__ust" }, [cip(z.ad), el("span", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [adresLinki(d, o.kasa)])]),
    el("div", { sinif: "jeton-kart__olcumler" }, [
      olc("Dollars waiting", o.dolar == null ? "—" : para(o.dolar)),
      olc("Auctions", String(o.ihaleSayisi)),
      olc("Open", o.acik ? String(o.acik.length) : "—"),
    ]),
    nasil,
    ayniAdres && ayniAdres(d, o.kasa) ? el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Same address as on " + ayniAdres(d, o.kasa) + ": a separate contract on each chain, deployed from the same account at the same step." }) : null,
  ]);
}

function acikTablosu(acik) {
  acik.sort((a, b) => b.baslama - a.baslama);
  const simdi = Date.now() / 1000;
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["Chain", "Token", "Auction", "Vault gives", "Asks now", "Open for"].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  for (const a of acik) {
    const z = ZINCIRLER[a.d];
    const tok = el("td", { yazi: "#" + a.launchId });
    launchSembolu(a.launchId, a.defter).then((s) => { tok.textContent = s; });
    const ver = el("td", { sinif: "sayi", yazi: "—" }), ist = el("td", { sinif: "sayi", yazi: "—" });
    const dolarYaz = (x) => para(Number(x) / 10 ** (a.dd || z.usdcDec));
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
  return el("div", { sinif: "tablo-sarmal" }, [t]);
}

function aciklar(okunan, cfg) {
  const acik = [];
  for (const { d, s } of okunan) if (s.status === "fulfilled" && s.value.acik) for (const a of s.value.acik)
    acik.push({ d, defter: cfg.defter, dd: cfg.dolar && cfg.dolar[d] ? 6 : null, ...a });
  return acik;
}

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Collateral vaults", "One basket vault per chain on 12 of the 13 chains: what each holds, and the pool it buys from"));
  const [V8, V9, V8ham] = await Promise.all([sepetV2(), sepetV9(), fetch("veri/sepet-v2.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);

  kap.append(not("Every launch's collateral is a basket of up to five tokens. Each token is kept in the vault on its own chain, and the vault buys it in that chain's pool, " +
    "within about 3% of a protected price. Vaults exist on Arc, Base, Arbitrum, Ethereum, Avalanche, Monad, HyperEVM, BNB Chain, Robinhood Chain, Solana, Sui and Aptos. " +
    "Elysium is a pay-from chain only: it has no vault.", "bilgi"));
  kap.append(arsiv("How a vault buys, in detail", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "yazi yazi--kucuk", yazi: "Pools: Uniswap v4 on Arc, PancakeSwap v3 on BNB Chain, Uniswap v3 on Base, Arbitrum, Ethereum, Avalanche, Monad and Robinhood Chain, " +
      "HyperSwap on HyperEVM, Raydium on Solana, Cetus on Sui and Hyperion on Aptos. The protected price is the pool's 30-minute average, or a reference that moves at most about 1% a minute." }),
    el("div", { sinif: "yazi yazi--kucuk", yazi: "Anything the price bound stops waits in the vault as dollars, and anyone can push it through for a $0.05 tip. A token with no pool is refused at launch. " +
      "An auction is only the last fallback: its ask starts at twice the last price, halves every 30 minutes, never goes below a sixteenth and restarts after a day." }),
  ])));

  /* ---- the live sets: v8 (sepet-v2.json, every launch but designer tokens) and v9 (designer tokens) ---- */
  const setler = [];
  if (V8) setler.push({ ad: "Current launchpad", alt: "every launch except designer tokens", cfg: V8, alan: V8_ZINCIR });
  if (V9) setler.push({ ad: "Designer launches", alt: "designer tokens; their baskets use the 9 EVM chains", cfg: V9, alan: V9_ZINCIR });
  const okumalar = await Promise.all(setler.map((s) => setOku(s.cfg, s.alan)));

  const tumOkunan = okumalar.flat();
  const dolar = tumOkunan.reduce((a, { s }) => a + (s.status === "fulfilled" ? s.value.dolar || 0 : 0), 0);
  const ihale = tumOkunan.reduce((a, { s }) => a + (s.status === "fulfilled" ? s.value.ihaleSayisi : 0), 0);
  const acikHepsi = okumalar.flatMap((o, i) => aciklar(o, setler[i].cfg));
  const okunanSay = tumOkunan.filter(({ s }) => s.status === "fulfilled").length;
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Chains with a vault", "12 of 13", "all except Elysium"),
    olcum("Vaults read now", okunanSay + " of " + tumOkunan.length, "on the two live sets"),
    olcum("Dollars waiting", para(dolar), "not yet spent in a pool"),
    olcum("Open auctions", String(acikHepsi.length), ihale + " opened so far"),
  ]));

  /* dollars per chain, when any are waiting */
  const zincirDolar = {};
  for (const { d, s } of tumOkunan) if (s.status === "fulfilled" && s.value.dolar) zincirDolar[ZINCIRLER[d].ad] = (zincirDolar[ZINCIRLER[d].ad] || 0) + s.value.dolar;
  if (Object.keys(zincirDolar).length) kap.append(panel("Dollars waiting, by chain", cubuklar(Object.entries(zincirDolar).sort((a, b) => b[1] - a[1]).map(([ad, v]) => ({ ad, deger: v, metin: para(v) })))));

  setler.forEach((st, i) => {
    /* two chains can show one address (Avalanche and Monad): say why, so it does not read as a mistake */
    const adresler = okumalar[i].filter(({ s }) => s.status === "fulfilled").map(({ d, s }) => [d, String(s.value.kasa).toLowerCase()]);
    const ayni = (d, a) => { const x = adresler.find(([d2, a2]) => d2 !== d && a2 === String(a).toLowerCase()); return x ? ZINCIRLER[x[0]].ad : null; };
    const kartlar = okumalar[i].map(({ d, s }) => kasaKarti(d, s, true, ayni));
    const sol = st.cfg === V8 && V8ham && V8ham.uzak ? V8ham.uzak.solana : null;
    if (sol && sol.sepetProgram) kartlar.push(el("div", { sinif: "jeton-kart" }, [
      el("div", { sinif: "tk__ust" }, [cip("Solana"), el("span", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [el("a", { attr: { href: "https://solscan.io/account/" + sol.sepetProgram, target: "_blank", rel: "noopener" }, yazi: sol.sepetProgram.slice(0, 4) + "…" + sol.sepetProgram.slice(-4) })])]),
      el("div", { sinif: "yazi yazi--kucuk" }, [el("span", { sinif: "yazi--sessiz", yazi: "Buys in: " }), el("span", { yazi: "Raydium pool" })]),
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "The Solana vault is a program; its balances are on Solscan." })]));
    if (i === 0) kartlar.push(el("div", { sinif: "jeton-kart" }, [el("div", { sinif: "tk__ust" }, [cip("Elysium"), el("span", { sinif: "etiket", yazi: "pay-from chain" })]),
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "No vault on Elysium: LayerZero does not reach it. An Elysium wallet still pays for launches and buys in HYPE, and what it buys is delivered to the same address on Arc." })]));
    const izgara = el("div", { sinif: "izgara izgara--kart" }, kartlar);
    /* the first set leads; the designer set is folded (same layout, fewer chains) */
    kap.append(i === 0 ? panel([st.ad, el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: " · " + st.alt })], izgara)
      : arsiv(st.ad + " (" + kartlar.length + " vaults)", izgara, st.alt));
  });

  /* ---- open auctions on the live sets ---- */
  kap.append(panel("Open auctions", acikHepsi.length ? acikTablosu(acikHepsi)
    : maskotBos("goldie", "No open auctions on the live vaults", "That is the normal state: the live vaults buy in a pool. An auction opens only when a basket token has no usable pool price, and anyone can then fill it from the vault contract.", [dugmeLink("See launches", "#/launches")]),
    acikHepsi.length ? el("span", { sinif: "ucuncul", yazi: "anyone can fill one from the vault contract" }) : null));

  /* ---- the first one-pool set: archive ---- */
  const eski = await setOku(SEPET, ACIK);
  const eskiDolar = eski.reduce((a, { s }) => a + (s.status === "fulfilled" ? s.value.dolar || 0 : 0), 0);
  const eskiAcik = aciklar(eski, SEPET);
  kap.append(arsiv("First one-pool set (archive)", [
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "The vaults of the first one-pool set, from before pool buying: they buy only through auctions. Its open auctions belong to a test launch (PTEST1) made to check the auction path; they can still be filled." }),
    el("div", { sinif: "izgara izgara--olcum" }, [olcum("Dollars waiting", para(eskiDolar)), olcum("Open auctions", String(eskiAcik.length))]),
    el("div", { sinif: "izgara izgara--kart" }, eski.map(({ d, s }) => kasaKarti(d, s, false))),
    eskiAcik.length ? acikTablosu(eskiAcik) : null,
  ], eskiAcik.length ? eskiAcik.length + " open test auctions" : null));

  kap.append(sozlesmeAyrinti([
    ["Fill an open auction (vault function)", "doldur(id, offer)", null],
    ["Collateral ledger, current launchpad", "SepetDefteri", V8 ? V8.defter : null],
    ["Collateral ledger, designer launches", "SepetDefteri v9", V9 ? V9.defter : null],
    ["Collateral ledger, first one-pool set", "SepetDefteri (first set)", SEPET.defter],
  ]));
  return kap;
}
