/* ===========================================================================
 * gorunum/terminal-ag.js — the terminal for a local-collateral launch, on
 *                          whichever chain it lives (#/terminal?ag=&t=)
 *
 * Everything is read from that chain: the launchpad's record, the pool key
 * the launchpad reports, the pool's price from the PoolManager, and the
 * vault's two holdings — the chain's dollar (trade taxes) and the token
 * the founder chose as collateral. Both pay out on redemption, pro rata.
 *
 * TRADING
 *   Through the audited SwapRouter (contracts/SwapRouter.sol): exact input,
 *   one pool, a minimum enforced on chain. The quote is Uniswap's own
 *   V4Quoter, which runs the real swap — the PulseHook's fee and tax
 *   included — and reverts it. The minimum is the quote less the slippage
 *   the trader sets. Where the router is not yet on the chain the panel
 *   says so and offers no button.
 * REDEEMING
 *   TeminatKasasi.iade: burn tokens, receive that share of both holdings.
 *   The preview is the vault's own arithmetic (holding × amount ÷
 *   circulating), not an estimate of value.
 * =========================================================================== */
import { el, sayfaUst, panel, bos, not, olcum } from "../ui.js";
import { agBul, agLaunchlari, cokluOku, havuzFiyatiAg, fiyat, kasif, ABI3 } from "../ag-okur.js";
import { UNISWAP } from "../teminat-bul.js";
import { cuzdan } from "../cuzdan.js";
import { canli } from "../adresler.js";
import { JsonRpcProvider, Contract, Interface, parseUnits, formatUnits } from "../../vendor/ethers.min.js";

/* the launch dollar: on BNB the 6-decimal wrapper pUSDC, elsewhere the chain's dollar */
const qSembol = (ag) => (ag.sarmal ? "pUSDC" : ag.dolarSembol);

const V4Q = ["function quoteExactInputSingle(((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 exactAmount,bytes hookData)) returns (uint256 amountOut,uint256 gasEstimate)"];
const E20 = new Interface(ABI3.erc20);
const say = (x, o = 4) => x == null ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: o });
const dolarYaz = (x) => x == null ? "—" : "$" + (x < 0.01 ? x.toPrecision(3) : x.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);

async function makbuz(ag, h) {
  const p = new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true });
  for (let i = 0; i < 120; i++) {
    const m = await p.getTransactionReceipt(h).catch(() => null);
    if (m) { if (m.status !== 1) throw new Error("Reverted: " + h); return m; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("No receipt yet for " + h);
}

/* approve exactly what this call spends, only if the allowance is short */
async function onayla(ag, token, harcayan, miktar, durum) {
  const [izin] = await cokluOku(ag, [[token, ABI3.erc20, "allowance", [cuzdan.hesap(), harcayan]]]);
  if (izin != null && izin >= miktar) return;
  durum.textContent = "Approve in your wallet…";
  await makbuz(ag, await cuzdan.agdaGonder(ag, { to: token, data: E20.encodeFunctionData("approve", [harcayan, miktar]) }));
}

export async function ciz({ param }) {
  const kap = el("div", { sinif: "yigin" });
  const ag = agBul(param.get("ag") || "");
  const t = (param.get("t") || "").toLowerCase();
  const dur = (baslik, yazi) => { kap.append(sayfaUst("Trading terminal")); kap.append(bos(baslik, yazi)); return kap; };
  if (!ag || ag.nesil !== 3) return dur("Unknown chain", "There is no local-collateral launchpad on \"" + (param.get("ag") || "") + "\".");
  let liste;
  try { liste = await agLaunchlari(ag); } catch (e) { return dur(ag.ad + " did not answer", e.message); }
  const l = liste.find((x) => x.token.toLowerCase() === t);
  if (!l) return dur("Token not found on " + ag.ad, t);

  const [key, dolasim, dolarB, teminatB, arz] = await cokluOku(ag, [
    [ag.launchpad, ABI3.launchpad, "havuzAnahtari", [l.token]],
    [l.kasa, ABI3.kasa, "dolasim"],
    [l.kasa, ABI3.kasa, "bakiye", [ag.quote]],
    [l.kasa, ABI3.kasa, "bakiye", [l.hedefVarlik]],
    [l.token, ABI3.erc20, "totalSupply"]
  ]);
  const anahtar = key && { currency0: key[0], currency1: key[1], fee: Number(key[2]), tickSpacing: Number(key[3]), hooks: key[4] };
  const anahtarDizi = anahtar && [anahtar.currency0, anahtar.currency1, anahtar.fee, anahtar.tickSpacing, anahtar.hooks];
  const tokenSifirinci = anahtar && anahtar.currency0.toLowerCase() === l.token.toLowerCase();
  const p = anahtar ? fiyat(await havuzFiyatiAg(ag, anahtar), tokenSifirinci) : null;
  const dol = dolasim == null ? null : Number(formatUnits(dolasim, 18));
  const dolarRezerv = dolarB == null ? null : Number(formatUnits(dolarB, 6));
  const teminatTut = teminatB == null ? null : Number(formatUnits(teminatB, l.teminatOndalik));
  const ayni = l.hedefVarlik.toLowerCase() === ag.quote.toLowerCase();

  kap.append(sayfaUst(l.sembol + " · " + ag.ad, l.ad));
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Price", dolarYaz(p), p == null ? "the pool could not be read" : qSembol(ag) + " per token"),
    olcum("Market cap", p == null || dol == null ? "—" : dolarYaz(p * dol), "price × circulating"),
    olcum(qSembol(ag) + " in the vault", dolarYaz(dolarRezerv), "trade taxes"),
    ayni ? null : olcum(l.teminatSembol + " in the vault", say(teminatTut, 6), "the collateral the founder chose"),
    olcum("Circulating", say(dol, 0))
  ].filter(Boolean)));

  /* ---- trade ---- */
  /* a well-formed address or nothing: the button exists only if the router does */
  const r = canli(ag.takasRouter) ? ag.takasRouter : null;
  let alis = true;
  const miktar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "0", placeholder: "0.00" } });
  const birim = el("span", { sinif: "girdi-grup__son", yazi: qSembol(ag) });
  const kayma = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "0.1", max: "50", step: "0.1", value: "3" } });
  const teklif = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const alD = el("button", { sinif: "dugme dugme--alis", attr: { type: "button", "aria-pressed": "true" }, yazi: "Buy" });
  const satD = el("button", { sinif: "dugme dugme--satis", attr: { type: "button", "aria-pressed": "false" }, yazi: "Sell" });
  const yon = (a) => {
    alis = a; birim.textContent = a ? qSembol(ag) : l.sembol; teklif.textContent = "";
    alD.setAttribute("aria-pressed", String(a)); satD.setAttribute("aria-pressed", String(!a));
  };
  alD.addEventListener("click", () => yon(true));
  satD.addEventListener("click", () => yon(false));

  const girdi = () => { const v = String(miktar.value || "").trim(); return v && Number(v) > 0 ? parseUnits(v, alis ? 6 : 18) : 0n; };
  const zf = () => (alis ? !tokenSifirinci : tokenSifirinci);
  async function fiyatla() {
    const g = girdi();
    if (!g || !anahtar) return null;
    const q = new Contract(UNISWAP[ag.anahtar].v4quoter, V4Q, new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true }));
    const [cikti] = await q.quoteExactInputSingle.staticCall([anahtarDizi, zf(), g, "0x"]);
    const bps = BigInt(Math.round(Math.min(50, Math.max(0.1, Number(kayma.value) || 3)) * 100));
    return { g, cikti, asgari: (cikti * (10000n - bps)) / 10000n };
  }
  const goster = async () => {
    try {
      const f = await fiyatla();
      const o = alis ? 18 : 6, b = alis ? l.sembol : qSembol(ag);
      teklif.textContent = f ? "You receive about " + say(formatUnits(f.cikti, o), alis ? 0 : 4) + " " + b +
        " (at least " + say(formatUnits(f.asgari, o), alis ? 0 : 4) + "), fee and tax included." : "";
    } catch (e) { teklif.textContent = "The pool could not quote this amount."; }
  };
  miktar.addEventListener("change", goster);
  kayma.addEventListener("change", goster);
  const onay = el("button", { sinif: "dugme dugme--marka dugme--buyuk dugme--tam", attr: { type: "button" }, yazi: "Confirm" });
  onay.addEventListener("click", async () => {
    try {
      if (!(cuzdan.hesap() || (await cuzdan.bagla()))) { durum.textContent = "Connect a wallet first."; return; }
      durum.textContent = "Quoting…";
      const f = await fiyatla();
      if (!f) { durum.textContent = "Enter an amount."; return; }
      await onayla(ag, alis ? ag.quote : l.token, r, f.g, durum);
      durum.textContent = "Confirm the trade in your wallet…";
      const veri = new Interface(ABI3.router).encodeFunctionData("swap", [anahtarDizi, zf(), f.g, f.asgari]);
      const h = await cuzdan.agdaGonder(ag, { to: r, data: veri });
      await makbuz(ag, h);
      durum.textContent = "Done. Transaction " + kisa(h) + ".";
    } catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
  });

  kap.append(panel("Trade on " + ag.ad, r ? el("div", { sinif: "yigin" }, [
    el("div", { sinif: "satir" }, [alD, satD]),
    el("div", { sinif: "girdi-grup" }, [miktar, birim]),
    el("div", { sinif: "satir satir--arasi" }, [el("span", { sinif: "ucuncul", yazi: "Slippage %" }), kayma]),
    teklif, onay, durum
  ]) : not("The trade router is not on " + ag.ad + " yet, so no button is offered. The pool itself is live: " +
    "any Uniswap v4 router can trade it with the pool key below.", "uyari")));

  /* ---- redeem ---- */
  const iadeM = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "0", placeholder: "0" } });
  const iadeOn = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const iadeDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  iadeM.addEventListener("input", () => {
    const v = Number(iadeM.value) || 0;
    if (!v || !dol || dolarRezerv == null) { iadeOn.textContent = ""; return; }
    const oran = Math.min(1, v / dol);
    iadeOn.textContent = "You receive " + dolarYaz(dolarRezerv * oran) + " " + qSembol(ag) +
      (ayni || teminatTut == null ? "" : " and " + say(teminatTut * oran, 6) + " " + l.teminatSembol) + ".";
  });
  const iadeD = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Redeem" });
  iadeD.addEventListener("click", async () => {
    try {
      if (!(cuzdan.hesap() || (await cuzdan.bagla()))) { iadeDurum.textContent = "Connect a wallet first."; return; }
      const v = String(iadeM.value || "").trim();
      if (!v || Number(v) <= 0) { iadeDurum.textContent = "Enter an amount."; return; }
      const m = parseUnits(v, 18);
      await onayla(ag, l.token, l.kasa, m, iadeDurum);
      iadeDurum.textContent = "Confirm the redemption in your wallet…";
      const h = await cuzdan.agdaGonder(ag, { to: l.kasa, data: new Interface(ABI3.kasa).encodeFunctionData("iade", [m]) });
      await makbuz(ag, h);
      iadeDurum.textContent = "Redeemed. Transaction " + kisa(h) + ".";
    } catch (e) { iadeDurum.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
  });
  kap.append(panel("Redeem from the vault", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Burn tokens and take their share of everything the vault holds, at any time." }),
    el("div", { sinif: "girdi-grup" }, [iadeM, el("span", { sinif: "girdi-grup__son", yazi: l.sembol })]), iadeOn, iadeD, iadeDurum
  ])));

  /* ---- facts ---- */
  const satir = (a, b, h) => el("div", { sinif: "satir satir--arasi" }, [el("span", { sinif: "ucuncul", yazi: a }),
    h ? el("a", { sinif: "mono", attr: { href: h, target: "_blank", rel: "noopener" }, yazi: b }) : el("span", { sinif: "mono", yazi: b })]);
  kap.append(panel("Token", el("div", { sinif: "yigin yigin--sik" }, [
    satir("Chain", ag.ad),
    satir("Token", kisa(l.token), kasif(ag, l.token)),
    satir("Vault", kisa(l.kasa), kasif(ag, l.kasa)),
    satir("Collateral", l.teminatSembol, kasif(ag, l.hedefVarlik)),
    satir("Total supply", arz == null ? "—" : say(formatUnits(arz, 18), 0)),
    satir("Collateral tax", (l.vergiPpm / 10_000).toFixed(2) + "%"),
    satir("Launched", new Date(l.zaman * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC"),
    anahtar ? satir("Pool fee / spacing", anahtar.fee + " / " + anahtar.tickSpacing) : null,
    anahtar ? satir("Hook", kisa(anahtar.hooks), kasif(ag, anahtar.hooks)) : null
  ].filter(Boolean))));
  return kap;
}
