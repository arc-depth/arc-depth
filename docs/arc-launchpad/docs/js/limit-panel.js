/* ===========================================================================
 * limit-panel.js — the token page's "Limit orders" panel (LimitEmir on Arc)
 *
 * Three tabs: Limit buy, Limit sell, My limit orders. An order is placed from
 * a wallet on Arc (the deposit is escrowed in LimitEmir, docs/js/limit-emir.js)
 * and filled by anyone running the public keeper (scripts/limit-bekci.js) once
 * the pool can pay it. The price typed here is the ALL-IN price: the pool's
 * 2.2% fee and collateral tax, the 0.20% platform fee and the keeper's tip are
 * inside it. The page shows today's all-in price for the same amount next to
 * it, so a limit is set against what a trade would really cost now.
 * "My limit orders" reads the wallet's EmirVerildi events through
 * yedekli-okur.js (the published archive, then 9,000-block pieces) and each
 * order's live state from the contract. Nothing is stored anywhere else.
 * =========================================================================== */
import { el, panel, not, sekmeler } from "./ui.js";
import { AGLAR } from "./aglar.js";
import { cuzdan } from "./cuzdan.js";
import { YedekliOkur } from "./yedekli-okur.js";
import * as egri from "./egri.js";
import * as LM from "./limit-emir.js";
import { Contract, Interface, AbiCoder, keccak256, zeroPadValue } from "../vendor/ethers.min.js";

const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const ERC = ["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)"];
const IL = new Interface(LM.LIMIT_ABI);
const IE = new Interface(ERC);
const okur = new YedekliOkur();
const arcAg = () => AGLAR.find((a) => a.anahtar === "arc");
const adresMi = (t) => /^0x[0-9a-fA-F]{40}$/.test(String(t || "").trim());
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const usd = (x) => "$" + (Number(x) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 4 });
const fiyatYaz = (f) => (f >= 0.01 ? "$" + f.toFixed(4) : "$" + f.toPrecision(4));
const tokenYaz = (x) => (Number(x) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });

/* the launchpad of each gate, for the all-in price estimate (veri/sepet-v2.json = v8, sepet-v9.json = v9) */
let _lp = null;
function launchpadlar() {
  if (!_lp) _lp = Promise.all(["veri/sepet-v2.json", "veri/sepet-v9.json"].map((f) => fetch(f, { cache: "no-store" }).then((r) => r.json()).catch(() => null)))
    .then(([v8, v9]) => ({ [LM.LIMIT.kapiV8.toLowerCase()]: v8 && v8.launchpad, [LM.LIMIT.kapiV9.toLowerCase()]: v9 && v9.launchpad }));
  return _lp;
}
let _ayar = null;
const ayarlar = () => (_ayar ||= (async () => {
  const L = new Contract(LM.LIMIT.adres, LM.LIMIT_ABI, okur);
  const [ucretBps, asgariBahsis] = await Promise.all([L.ucretBps(), L.asgariBahsis()]);
  return { ucretBps: Number(ucretBps), asgariBahsis: BigInt(asgariBahsis) };
})().catch((e) => { _ayar = null; throw e; }));

/** One transaction from the wallet on Arc, waited for; throws when it reverts. */
async function gonder(to, data) {
  const h = await cuzdan.agdaGonder(arcAg(), { to, data, value: "0x0" });
  for (let i = 0; i < 120; i++) {
    const m = await okur.getTransactionReceipt(h).catch(() => null);
    if (m) { if (m.status !== 1) throw new Error("Reverted: " + h); return m; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("No receipt yet for " + h + ". It may still go through: check it in an explorer before trying again.");
}

const hataMetni = (x) => {
  const d = x && (x.data || (x.info && x.info.error && x.info.error.data));
  try { const e = d && IL.parseError(d); if (e) return "Limit order contract: " + e.name; } catch (_) { /* fall through */ }
  return (x && (x.shortMessage || x.message)) || String(x);
};

/** The panel. `tokenGirdi`: the token page's address field (its value is the token on Arc). */
export function limitPaneli({ tokenGirdi }) {
  const govde = el("div", { sinif: "yigin" });
  const tokenAl = () => String(tokenGirdi.value || "").trim();
  if (!adresMi(LM.LIMIT.adres)) {
    govde.append(not("Limit orders open once the limit order contract is deployed on Arc.", "bilgi"));
    return panel("Limit orders", govde);
  }

  /* ---------------- one form for buy and sell ---------------- */
  function form(alim) {
    const miktar = el("input", { sinif: "girdi girdi--sayi", attr: { id: alim ? "limit-al-tutar" : "limit-sat-tutar", type: "number", min: alim ? "1" : "1", step: alim ? "1" : "1000", value: alim ? "10" : "100000" } });
    const fiyat = el("input", { sinif: "girdi girdi--sayi", attr: { id: alim ? "limit-al-fiyat" : "limit-sat-fiyat", type: "text", inputmode: "decimal", placeholder: "price per token, all in" } });
    const bahsis = el("input", { sinif: "girdi girdi--sayi", attr: { id: alim ? "limit-al-bahsis" : "limit-sat-bahsis", type: "number", min: "0.02", max: "1", step: "0.01", value: "0.05" } });
    const sure = el("select", { sinif: "girdi", attr: { id: alim ? "limit-al-sure" : "limit-sat-sure" } },
      [["3600", "1 hour"], ["86400", "1 day"], ["604800", "7 days"], ["2592000", "30 days"], ["31536000", "1 year"]].map(([v, y]) => el("option", { attr: { value: v }, yazi: "Expires in " + y })));
    sure.value = "604800";
    const simdiYazi = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const ozet = el("div", { sinif: "yazi yazi--kucuk" });
    const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const dugme = el("button", { sinif: alim ? "dugme dugme--marka" : "dugme dugme--sessiz", attr: { type: "button" }, yazi: alim ? "Place limit buy" : "Place limit sell" });

    /* today's all-in price for the same amount, from the pool's state (egri.js, the same model as the Buy button) */
    let sonFiyat = null;
    const simdiOku = async () => {
      const t = tokenAl();
      sonFiyat = null;
      if (!adresMi(t)) { simdiYazi.textContent = "Enter the token address above."; return; }
      try {
        const [a, lpler] = await Promise.all([ayarlar(), launchpadlar()]);
        const kapi = await new Contract(LM.LIMIT.adres, LM.LIMIT_ABI, okur).kapiOf(t);
        const lp = lpler[String(kapi).toLowerCase()];
        if (!lp) { simdiYazi.textContent = "This token was not launched through the v8 or v9 gate: no limit orders for it."; return; }
        const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, okur, lp, PM, t);
        const bah = Number(bahsis.value) || 0.05;
        if (alim) {
          const g = Number(miktar.value) || 0;
          const net = (g - bah) * (1 - a.ucretBps / 10_000);
          if (!(net > 0)) { simdiYazi.textContent = ""; return; }
          const e = egri.alim(st, net);
          sonFiyat = g / e.token;
        } else {
          const n = Number(miktar.value) || 0;
          if (!(n > 0)) { simdiYazi.textContent = ""; return; }
          const e = egri.satim(st, n);
          if (e.bitti) { simdiYazi.textContent = "The pool cannot buy that many tokens now (only ~$" + e.dolar.toFixed(2) + " for them)."; return; }
          sonFiyat = (e.dolar * (1 - a.ucretBps / 10_000) - bah) / n;
        }
        if (tokenAl() !== t) return;
        simdiYazi.textContent = "Now: " + fiyatYaz(sonFiyat) + " per token all in for this amount (pool price " + fiyatYaz(st.fiyat) +
          ", the pool's 2.2% fee + " + (st.vergi * 100).toFixed(0) + "% collateral tax, " + (a.ucretBps / 100).toFixed(2) + "% limit fee, the keeper's tip).";
        if (!fiyat.value) fiyat.value = (sonFiyat * (alim ? 0.9 : 1.1)).toPrecision(4);
        ozetYaz();
      } catch (x) { if (tokenAl() === t) simdiYazi.textContent = "Could not read the pool now: " + ((x && x.message) || ""); }
    };
    const ozetYaz = () => {
      try {
        const f = Number(fiyat.value);
        if (!(f > 0)) { ozet.textContent = ""; return; }
        if (alim) {
          const asgari = LM.asgariHesapla(true, BigInt(Math.round(Number(miktar.value) * 1e6)), fiyat.value);
          ozet.textContent = "Fills when " + miktar.value + " USDC buys at least " + tokenYaz(asgari) + " tokens (" + fiyatYaz(f) + " per token or better)" +
            (sonFiyat ? (f >= sonFiyat ? " — at or above today's price: it can fill at once." : " — " + ((1 - f / sonFiyat) * 100).toFixed(1) + "% below today's price.") : ".");
        } else {
          const asgari = LM.asgariHesapla(false, BigInt(Math.round(Number(miktar.value))) * 10n ** 18n, fiyat.value);
          ozet.textContent = "Fills when " + Number(miktar.value).toLocaleString("en-US") + " tokens pay at least " + usd(asgari) + " to you (" + fiyatYaz(f) + " per token or better)" +
            (sonFiyat ? (f <= sonFiyat ? " — at or below today's price: it can fill at once." : " — " + ((f / sonFiyat - 1) * 100).toFixed(1) + "% above today's price.") : ".");
        }
      } catch (x) { ozet.textContent = (x && x.message) || ""; }
    };
    for (const g of [miktar, bahsis]) g.addEventListener("change", simdiOku);
    fiyat.addEventListener("input", ozetYaz);
    tokenGirdi.addEventListener("change", () => { fiyat.value = ""; simdiOku(); });

    dugme.addEventListener("click", async () => {
      if (dugme._mesgul) return;
      dugme._mesgul = true; dugme.disabled = true;
      const yaz = (s) => { durum.textContent = s; };
      try {
        const t = tokenAl();
        if (!adresMi(t)) return yaz("Enter the token address above.");
        const ben = cuzdan.hesap() || (await cuzdan.bagla());
        if (!ben) return yaz("Connect a wallet first.");
        const a = await ayarlar();
        const girdi = alim ? BigInt(Math.round(Number(miktar.value) * 1e6)) : BigInt(Math.round(Number(miktar.value))) * 10n ** 18n;
        let asgari;
        try { asgari = LM.asgariHesapla(alim, girdi, fiyat.value); } catch (x) { return yaz("Enter a limit price (USDC per token)."); }
        const bah = BigInt(Math.round(Number(bahsis.value) * 1e6));
        const simdi = Math.floor(Date.now() / 1000);
        const bitis = simdi + Number(sure.value);
        const sorun = LM.emirKontrol({ alim, girdi, asgari, bahsis: bah, bitis, simdi, asgariBahsis: a.asgariBahsis });
        if (sorun) return yaz(sorun);
        const L = new Contract(LM.LIMIT.adres, LM.LIMIT_ABI, okur);
        if (await L.kapiOf(t) === "0x0000000000000000000000000000000000000000") return yaz("This token was not launched through the v8 or v9 gate: no limit orders for it.");
        const varlik = alim ? LM.LIMIT.usdc : t;
        const tk = new Contract(varlik, ERC, okur);
        if ((await tk.balanceOf(ben)) < girdi) return yaz(alim ? "Not enough USDC on Arc in this wallet." : "You hold less than that on Arc.");
        let adim = 1;
        const toplam = (await tk.allowance(ben, LM.LIMIT.adres)) >= girdi ? 1 : 2;
        if (toplam === 2) {
          yaz("Approve the " + (alim ? "USDC" : "tokens") + " for the order (1/2)…");
          await gonder(varlik, IE.encodeFunctionData("approve", [LM.LIMIT.adres, girdi]));
          adim = 2;
        }
        yaz("Place the order (" + adim + "/" + toplam + "): the deposit is held by the limit order contract until it fills or you cancel…");
        const m = await gonder(LM.LIMIT.adres, IL.encodeFunctionData("emirVer", [t, alim, girdi, asgari, bah, bitis]));
        const lg = m.logs.map((l) => { try { return IL.parseLog(l); } catch (_) { return null; } }).find((e) => e && e.name === "EmirVerildi");
        yaz("Order #" + (lg ? lg.args.id : "?") + " placed. Anyone running the keeper fills it once the pool reaches your price; cancel any time under My limit orders.");
        liste._yenile();
      } catch (x) { yaz(hataMetni(x)); } finally { dugme._mesgul = false; dugme.disabled = false; }
    });

    const kap = el("div", { sinif: "yigin", attr: { "data-limit": alim ? "al" : "sat" } }, [
      el("div", { sinif: "alan__ipucu", yazi: alim ? "Spend this many USDC (held until filled or cancelled):" : "Sell this many tokens you hold on Arc (held until filled or cancelled):" }),
      el("div", { sinif: "girdi-grup" }, [miktar, el("span", { sinif: "girdi-grup__son", yazi: alim ? "USDC" : "tokens" })]),
      el("div", { sinif: "alan__ipucu", yazi: alim ? "Your limit: the most you pay per token, all in:" : "Your limit: the least you receive per token, all in:" }),
      el("div", { sinif: "girdi-grup" }, [fiyat, el("span", { sinif: "girdi-grup__son", yazi: "USDC / token" })]),
      simdiYazi, ozet,
      el("div", { sinif: "girdi-grup" }, [bahsis, el("span", { sinif: "girdi-grup__son", yazi: "USDC keeper tip" }), sure]),
      dugme, durum,
    ]);
    kap._ac = simdiOku;
    return kap;
  }

  /* ---------------- my orders ---------------- */
  const liste = el("div", { sinif: "yigin", attr: { "data-limit": "liste" } });
  liste._yenile = async () => {
    const ben = cuzdan.hesap();
    if (!ben) { liste.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Connect a wallet to see your limit orders." })); return; }
    liste.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading your orders on Arc…" }));
    try {
      const loglar = await okur.getLogs({ address: LM.LIMIT.adres, fromBlock: LM.LIMIT.blok, toBlock: "latest",
        topics: [IL.getEvent("EmirVerildi").topicHash, null, zeroPadValue(ben, 32)] });
      const idler = [...new Set(loglar.map((l) => IL.parseLog(l).args.id))].sort((x, y) => (x < y ? 1 : -1));
      if (!idler.length) { liste.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "No limit orders from this wallet yet." })); return; }
      const L = new Contract(LM.LIMIT.adres, LM.LIMIT_ABI, okur);
      const emirler = await Promise.all(idler.map((i) => L.emir(i)));
      const simdi = Math.floor(Date.now() / 1000);
      const semboller = {};
      await Promise.all([...new Set(emirler.map((e) => e.token))].map(async (t) => { semboller[t] = await new Contract(t, ERC, okur).symbol().catch(() => kisa(t)); }));
      const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
      const tablo = el("table", { sinif: "tablo tablo--kart" });
      tablo.append(el("thead", {}, [el("tr", {}, ["Order", "Side", "Deposit", "Limit (all in)", "Tip", "Expires", "State", ""].map((b) => el("th", { yazi: b })))]));
      tablo.append(el("tbody", {}, emirler.map((e, k) => {
        const id = idler[k];
        const acik = Number(e.durum) === LM.ACIK;
        const iptal = el("button", { sinif: "dugme dugme--kucuk", attr: { type: "button", "data-iptal": String(id) }, yazi: "Cancel order" });
        iptal.addEventListener("click", async () => {
          if (iptal.disabled) return;
          iptal.disabled = true;
          try {
            durum.textContent = "Cancel order #" + id + ": confirm in your wallet (the whole deposit comes back)…";
            await gonder(LM.LIMIT.adres, IL.encodeFunctionData("iptal", [id]));
            durum.textContent = "Order #" + id + " cancelled; the deposit is back in your wallet.";
            liste._yenile();
          } catch (x) { durum.textContent = hataMetni(x); iptal.disabled = false; }
        });
        return el("tr", { attr: { "data-emir": String(id) } }, [
          el("td", { attr: { "data-et": "Order" } }, [el("a", { attr: { href: "#/merkez?t=" + e.token }, yazi: "#" + id + " $" + semboller[e.token] })]),
          el("td", { attr: { "data-et": "Side" } }, [el("span", { sinif: "etiket " + (e.alim ? "etiket--alis" : "etiket--satis"), yazi: e.alim ? "Buy" : "Sell" })]),
          el("td", { sinif: "sayi", attr: { "data-et": "Deposit" }, yazi: e.alim ? usd(e.girdi) : tokenYaz(e.girdi) + " tokens" }),
          el("td", { sinif: "sayi", attr: { "data-et": "Limit (all in)" }, yazi: fiyatYaz(LM.emirFiyati(e)) + (e.alim ? " or less" : " or more") }),
          el("td", { sinif: "sayi", attr: { "data-et": "Tip" }, yazi: usd(e.bahsis) }),
          el("td", { attr: { "data-et": "Expires" }, yazi: new Date(Number(e.bitis) * 1000).toLocaleString() }),
          el("td", { attr: { "data-et": "State", "data-durum": String(e.durum) }, yazi: LM.durumAdi(e, simdi) }),
          el("td", { attr: { "data-et": "" } }, acik ? [iptal] : []),
        ]);
      })));
      liste.replaceChildren(el("div", { sinif: "tablo-sarmal" }, [tablo]), durum);
    } catch (x) { liste.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Could not read your orders now: " + ((x && x.message) || "") })); }
  };

  const alForm = form(true), satForm = form(false);
  const icerik = el("div", { sinif: "yigin" });
  const ipucu = el("div", { sinif: "alan__ipucu" });
  const sekmeAc = (k) => {
    icerik.replaceChildren(k === "al" ? alForm : k === "sat" ? satForm : liste);
    if (k === "liste") liste._yenile(); else (k === "al" ? alForm : satForm)._ac();
  };
  govde.append(
    not("Set a price and walk away: the deposit waits in the limit order contract on Arc and fills only at your price or better. Anyone can fill it (a public keeper earns your tip), nobody can fill it worse, and you can cancel any time for the whole deposit back. Orders are placed from a wallet on Arc.", "bilgi"),
    sekmeler([{ anahtar: "al", ad: "Limit buy" }, { anahtar: "sat", ad: "Limit sell" }, { anahtar: "liste", ad: "My limit orders" }], "al", sekmeAc),
    icerik,
    ipucu,
  );
  const ipucuYaz = (bps) => { ipucu.textContent = "Fees on a fill only: " + (bps / 100).toFixed(2) + "% of the order's USDC (split between ARCP buy-and-burn, the ARCP DAO developer fund, marketing and the platform), plus your keeper tip; nothing on cancel. LimitEmir " + kisa(LM.LIMIT.adres) + " on Arc, source verified on Sourcify."; };
  ipucuYaz(20);
  ayarlar().then((a) => ipucuYaz(a.ucretBps)).catch(() => {});
  sekmeAc("al");
  return panel("Limit orders", govde);
}
