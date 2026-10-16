/* ===========================================================================
 * gorunum/move-token.js — launches on Aptos and Sui: the list, and a token's
 * page with buy, sell and redeem
 *
 *   #/move-token                         every launch on both chains
 *   #/move-token?zincir=aptos&token=0x…  an Aptos launch (its metadata address)
 *   #/move-token?zincir=sui&kasa=0x…     a Sui launch (its shared Vault)
 *
 * Every figure is read from the chain when the page opens: the pool's
 * reserves, the vault, circulating supply. Quotes use the Move code's own
 * arithmetic (move-hesap.js) and every trade carries a minimum 3% under the
 * quote, so a moved pool makes the trade fail rather than fill badly.
 * =========================================================================== */
import { el, sayfaUst, panel, olcum, not, temizle, bos } from "../ui.js";
import { APTOS, aptosCuzdan, tokenDurumu, faBakiye, al as aptosAl, sat as aptosSat, itfa as aptosItfa, islemBekle as aptosBekle, launchListesi as aptosListe } from "../aptos.js";
import { SUI, suiCuzdan, kasaDurumu, coinBakiye, islemYap, launchListesi as suiListe } from "../sui.js";
import { alimTeklifi, satimTeklifi, itfaPayi, fiyatlar, asgari } from "../move-hesap.js";

const fmt = (x, ondalik, basamak = 4) => (Number(x) / 10 ** ondalik).toLocaleString("en-US", { maximumFractionDigits: basamak });
const usd = (x) => "$" + (Number(x) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cokKucuk = (x) => (x < 0.0001 ? "$" + x.toExponential(3) : "$" + x.toLocaleString("en-US", { maximumFractionDigits: 6 }));

export async function ciz({ param }) {
  const zincir = param && param.get("zincir");
  if (zincir === "aptos" && param.get("token")) return tokenSayfasi("aptos", param.get("token"));
  if (zincir === "sui" && param.get("kasa")) return tokenSayfasi("sui", param.get("kasa"));
  return liste();
}

/* ---- the list --------------------------------------------------------- */
async function liste() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Aptos and Sui launches", "Every token launched on the Move launchpads, read from the chains"));
  const [a, s] = await Promise.allSettled([aptosListe(), suiListe()]);
  const satirlar = [];
  if (a.status === "fulfilled") for (const x of a.value) satirlar.push({ ...x, link: "#/move-token?zincir=aptos&token=" + x.token, ad: x.ad + " (" + x.simge + ")" });
  if (s.status === "fulfilled") for (const x of s.value) satirlar.push({ ...x, link: "#/move-token?zincir=sui&kasa=" + x.kasa, ad: x.token.split("::")[2] });
  const hatalar = [a, s].filter((x) => x.status === "rejected").map((x) => x.reason && x.reason.message);
  if (hatalar.length) kap.append(not("Could not read every chain right now: " + hatalar.join("; "), "uyari"));
  if (!satirlar.length) {
    kap.append(bos("No launches on Aptos or Sui yet", "The launchpads are live on both chains. The first token launched there appears here.",
      el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur?zincir=sui" }, yazi: "Create a token" })));
    return kap;
  }
  kap.append(panel("Launches", el("div", { sinif: "yigin yigin--sik" }, satirlar.map((x) =>
    el("a", { sinif: "satir satir--arasi", attr: { href: x.link, style: "padding:10px 0;border-bottom:1px solid var(--cizgi, #2a2a33)" } }, [
      el("span", { yazi: x.ad }),
      el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: x.zincir === "aptos" ? "Aptos" : "Sui" })
    ])))));
  return kap;
}

/* ---- a token ---------------------------------------------------------- */
async function tokenSayfasi(zincir, kimlik) {
  const kap = el("div", { sinif: "yigin" });
  const d = zincir === "aptos" ? await tokenDurumu(kimlik).catch(() => null) : await kasaDurumu(kimlik).catch(() => null);
  if (!d) {
    kap.append(bos("Not a launch", "Nothing launched on the " + (zincir === "aptos" ? "Aptos" : "Sui") + " launchpad at " + kimlik + "."));
    return kap;
  }
  const kasa = zincir === "aptos" ? d.kasa : d.kasaBakiye;
  const { fiyat, taban } = fiyatlar(d.havuz, kasa, d.dolasim, d.ondalik);
  kap.append(sayfaUst(d.ad + " (" + d.simge + ")", (zincir === "aptos" ? "Aptos" : "Sui") + " · fixed supply · collateral vault · locked pool"));
  kap.append(el("div", { sinif: "izgara" }, [
    olcum("Price now", cokKucuk(fiyat), "on the launch pool"),
    olcum("Floor", cokKucuk(taban), "vault ÷ circulating, redeemable"),
    olcum("Vault", usd(kasa) + (d.hedef ? " + " + fmt(d.hedef.miktar, d.hedef.ondalik) + " " + d.hedef.simge : ""), d.hedef ? "pasted token + tax dollars" : "USDC"),
    olcum("Circulating", fmt(d.dolasim, d.ondalik, 0) + " " + d.simge, "outside the pool"),
    olcum("Pool", usd(d.havuz.gercekDolar), "real USDC bid, locked"),
    olcum("Collateral tax", (d.havuz.vergiPpm / 10000).toFixed(2) + "%", "of every trade, to the vault")
  ]));

  const cuzdanKap = el("div", { sinif: "yigin yigin--sik" });
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const cuz = zincir === "aptos" ? aptosCuzdan : suiCuzdan;
  let hesap = null, dolarBak = 0n, tokenBak = 0n;
  const bakiyeOku = async () => {
    if (!hesap) return;
    if (zincir === "aptos") [dolarBak, tokenBak] = await Promise.all([faBakiye(hesap, APTOS.usdc), faBakiye(hesap, d.token)]);
    else [dolarBak, tokenBak] = await Promise.all([coinBakiye(hesap, d.dolar), coinBakiye(hesap, d.token)]);
    temizle(cuzdanKap).append(el("div", { sinif: "satir", attr: { style: "gap:16px" } }, [
      el("span", { sinif: "mono", yazi: hesap.slice(0, 8) + "…" + hesap.slice(-4) }),
      el("span", { yazi: usd(dolarBak) + " USDC" }),
      el("span", { yazi: fmt(tokenBak, d.ondalik) + " " + d.simge })
    ]));
  };
  temizle(cuzdanKap).append(el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Connect " + (zincir === "aptos" ? "Aptos" : "Sui") + " wallet",
    on: { click: async () => {
      try { hesap = await cuz.baglan(); await bakiyeOku(); } catch (e) { durum.className = "yazi yazi--kucuk yazi--hata"; durum.textContent = e.message; }
    } } }));
  kap.append(panel("Wallet", [cuzdanKap, durum]));

  /* one form per action, with a live quote */
  const form = (baslik, birim, tahmin, gonder) => {
    const girdi = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "0", step: "any", placeholder: "0" } });
    const ozet = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const miktar = () => BigInt(Math.floor(Number(girdi.value || 0) * 10 ** (birim === "USDC" ? 6 : d.ondalik)));
    girdi.addEventListener("input", () => { const m = miktar(); ozet.textContent = m > 0n ? tahmin(m) : ""; });
    const dugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: baslik, on: { click: async () => {
      const m = miktar();
      if (m <= 0n) { durum.textContent = "Enter an amount."; return; }
      try {
        durum.className = "yazi yazi--kucuk yazi--sessiz";
        if (!hesap) hesap = await cuz.baglan();
        durum.textContent = "Approve in your wallet…";
        await gonder(m);
        durum.className = "yazi yazi--kucuk";
        durum.textContent = baslik + " done. Reload the page for the new figures.";
        await bakiyeOku();
      } catch (e) { durum.className = "yazi yazi--kucuk yazi--hata"; durum.textContent = (e && e.message) || "The transaction failed."; }
    } } });
    return panel(baslik, el("div", { sinif: "yigin" }, [
      el("div", { sinif: "girdi-grup" }, [girdi, el("span", { sinif: "girdi-grup__son", yazi: birim })]), ozet, dugme
    ]));
  };

  const aptosGonder = async (h) => { const t = await aptosBekle(await h); if (!t.success) throw new Error("Failed on chain: " + t.vm_status); };
  kap.append(form("Buy", "USDC",
    (m) => { const q = alimTeklifi(d.havuz, m); return "≈ " + fmt(q.token, d.ondalik) + " " + d.simge + " · fee " + usd(q.ucret) + (q.snipe ? " (incl. anti-snipe)" : "") + " · tax to vault " + usd(q.vergi); },
    async (m) => {
      const min = asgari(alimTeklifi(d.havuz, m).token);
      if (zincir === "aptos") return aptosGonder(aptosAl(d.token, m, min));
      return islemYap("al", d, m, min);
    }));
  kap.append(form("Sell", d.simge,
    (m) => { const q = satimTeklifi(d.havuz, m); return "≈ " + usd(q.dolar) + " USDC · fee " + usd(q.ucret) + " · tax to vault " + usd(q.vergi) + " (a large sale in one block pays up to 3% more to the vault)"; },
    async (m) => {
      const min = asgari(satimTeklifi(d.havuz, m).dolar, 600);
      if (zincir === "aptos") return aptosGonder(aptosSat(d.token, m, min));
      return islemYap("sat", d, m, min);
    }));
  kap.append(form("Redeem", d.simge,
    (m) => "Burn " + fmt(m, d.ondalik) + " " + d.simge + " → " + usd(itfaPayi(kasa, m, d.dolasim)) + " USDC" +
      (d.hedef ? " + " + fmt(itfaPayi(d.hedef.miktar, m, d.dolasim), d.hedef.ondalik) + " " + d.hedef.simge : "") + " from the vault. No fee.",
    async (m) => {
      if (zincir === "aptos") return aptosGonder(aptosItfa(d.token, m, !!d.hedef));
      return islemYap("itfa", d, m);
    }));
  kap.append(not("Redeeming burns the tokens for the same share of the vault that they are of the circulating supply. The pool's dollars and the vault can never be withdrawn by anyone.", "bilgi"));
  return kap;
}
