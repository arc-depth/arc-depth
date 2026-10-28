/* ===========================================================================
 * gorunum/kesfet.js — discovery: every launch that exists, read from chain
 *
 * THE MODEL THIS PAGE DESCRIBES
 *   A token launched through the one-pool gate (MerkezKapi) has one pool
 *   and one price, on Arc, in PulseLaunchpad5; people on twelve chains reach
 *   it with their own gas token. Its collateral is a basket of up to five
 *   tokens held in vaults on the chains they came from. That registry is
 *   the main list here, read live with launchCount / launchAt.
 *
 *   Sui and Aptos also have their own launchpads (a token living on that
 *   chain, paid from a Move wallet). Their launches are listed below the
 *   Arc list, read from each chain's own record.
 *
 * WHAT IS NOT HERE ON PURPOSE
 *   Rankings by volume or 24h change need summed trade history, which no
 *   single chain call returns; the list is ordered newest first instead of
 *   by an invented rank. An empty registry says it is empty.
 * =========================================================================== */

import { el, panel, sayfaUst, bos, olcum } from "../ui.js";
import { ikon } from "../ikon.js";
import { EKONOMI } from "../adresler.js";
import { para } from "../bicim.js";
import { JsonRpcProvider, Contract } from "../../vendor/ethers.min.js";
import { teminatDurumu, islemZincirleri, cikisZinciri, sepetV2, SEPET } from "../teminat-izle.js";

const LP5 = "0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d";   // PulseLaunchpad5, the one pool's registry (dagitim-sepet.json)
const LP5_ABI = [
  "function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))",
];
const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });

/* the chains with a live basket vault (dagitim-sepet.json); the other three are listed as not open */
const SEPET_ACIK = ["Arc", "Base", "Arbitrum", "Avalanche", "Monad", "HyperEVM", "BNB", "Ethereum", "Sui", "Aptos"];

/* Newest first, ten to a page, two hundred pages: the 2,000 newest
   launches. Older ones drop off the end as new ones arrive. */
const SAYFA_BOY = 10, AZAMI_SAYFA = 200;

async function arcListesi(sayfa, lpAdres = LP5) {
  const lp = new Contract(lpAdres, LP5_ABI, arc);
  const n = Number(await lp.launchCount());
  const gorunur = Math.min(n, SAYFA_BOY * AZAMI_SAYFA);
  const sayfaSayisi = Math.max(1, Math.ceil(gorunur / SAYFA_BOY));
  const p = Math.min(Math.max(1, sayfa), sayfaSayisi);
  const bas = n - 1 - (p - 1) * SAYFA_BOY, alt = n - gorunur;
  const sira = [];
  for (let i = bas; i > bas - SAYFA_BOY && i >= alt; i--) sira.push(i);
  const kayitlar = await Promise.all(sira.map((i) => lp.launchAt(i)));
  /* name and symbol read one by one: ten calls a page, and a batch some RPCs refuse cannot blank them */
  const bilgi = await Promise.all(kayitlar.map(async (k) => {
    const c = new Contract(k.token, ["function name() view returns (string)", "function symbol() view returns (string)"], arc);
    const [ad, sembol] = await Promise.all([c.name().catch(() => null), c.symbol().catch(() => null)]);
    return { ad, sembol };
  }));
  return { n, sayfa: p, sayfaSayisi, liste: kayitlar.map((k, i) => ({ no: sira[i] + 1, token: k.token, vergi: Number(k.vergiPpm) / 10_000,
    zaman: Number(k.zaman), ad: bilgi[i] && bilgi[i].ad, sembol: bilgi[i] && bilgi[i].sembol })) };
}

/* ---- one token's card: filled in as each chain answers ---- */
const yuzde = (x) => (x > 0.00005 ? "▲ +" : x < -0.00005 ? "▼ " : "") + (x * 100).toFixed(2) + "%";
const yon = (x) => (x > 0.00005 ? "artis" : x < -0.00005 ? "dusus" : "sabit");
const kucukPara = (x) => (x >= 0.01 ? para(x) : "$" + x.toPrecision(3));
/* each chain in its own brand colour */
const RENK = { Arc: "#7c5cff", Base: "#0052ff", Arbitrum: "#28a0f0", Ethereum: "#627eea", BNB: "#f0b90b", Avalanche: "#e84142",
  Monad: "#836ef9", HyperEVM: "#50e3c2", Robinhood: "#ccff00", Solana: "#14f195", Sui: "#4da2ff", Aptos: "#2ed8a7" };
const zincirCipi = (z) => el("span", { sinif: "tk__zincir", attr: { style: "--z:" + (RENK[z] || "#888") }, yazi: z });

function teminatKarti(s, cfg) {
  const yeni = Date.now() / 1000 - s.zaman < 3600;
  const nereden = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "launched from …" });
  const zincirler = el("div", { sinif: "tk__zincirler" }, [el("span", { sinif: "etiket", yazi: "…" })]);
  const deger = el("span", { sinif: "tk__deger", yazi: "—" });
  const degisim = el("span", { sinif: "tk__yuzde sabit", yazi: "…" });
  const cubuk = el("i");
  const ilk = el("div", { sinif: "dg", yazi: "—" });
  const destek = el("div", { sinif: "dg", yazi: "—" });
  const fiyat = el("div", { sinif: "dg", yazi: "—" });
  const kalemler = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "reading the vaults…" });
  const olc = (et, dg) => el("div", { sinif: "jeton-kart__olcum" }, [el("div", { sinif: "et", yazi: et }), dg]);
  const kart = el("a", { sinif: "jeton-kart tk", attr: { href: "#/merkez?t=" + s.token } }, [
    el("div", { sinif: "tk__ust" }, [
      el("div", { sinif: "jeton" }, [
        el("div", { sinif: "jeton__logo jeton__logo--bos", yazi: (s.sembol || "?").slice(0, 3).toUpperCase() }),
        el("div", { sinif: "jeton__yazi" }, [el("div", { sinif: "jeton__sembol", yazi: s.sembol || "?" }), el("div", { sinif: "jeton__ad", yazi: (s.ad || "") + "  · #" + s.no })]),
      ]),
      yeni ? el("span", { sinif: "tk__yeni", yazi: "NEW" }) : el("span"),
    ]),
    nereden,
    el("div", { sinif: "tk__buyuk" }, [deger, degisim]),
    el("div", { sinif: "tk__cubuk", attr: { title: "collateral now against what it started with" } }, [cubuk]),
    el("div", { sinif: "jeton-kart__olcumler" }, [olc("Started with", ilk), olc("Backing / token", destek), olc("Price / token", fiyat)]),
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Trades on" }),
    zincirler,
    kalemler,
  ]);
  let onceki = null;
  const doldur = async () => {
    const [tz, td, hf] = await Promise.allSettled([onceki ? Promise.resolve(null) : islemZincirleri(s.token, cfg), teminatDurumu(s.token, cfg),
      import("./merkez.js").then((m) => m.havuzFiyati(s.token, cfg.lp5))]);
    if (!onceki) {
      if (tz.status === "fulfilled") {
        zincirler.replaceChildren(...tz.value.zincirler.map(zincirCipi));
        cikisZinciri(s.token, tz.value.adapter, s.zaman, cfg).then((c) => { nereden.replaceChildren(el("span", { yazi: "launched from " }), zincirCipi(c || "Arc")); })
          .catch(() => { nereden.textContent = ""; });
      } else { zincirler.replaceChildren(el("span", { sinif: "etiket etiket--uyari", yazi: "could not read" })); nereden.textContent = ""; }
    }
    if (td.status !== "fulfilled" || !td.value) { if (!onceki) kalemler.textContent = td.status === "fulfilled" ? "No basket recorded for this token." : "Vaults could not be read: " + td.reason.message; return; }
    const t = td.value;
    if (onceki && Math.abs(t.simdi - onceki) > 0.000001) { deger.classList.remove("tk__parla"); void deger.offsetWidth; deger.classList.add("tk__parla"); }
    onceki = t.simdi;
    deger.textContent = para(t.simdi) + (t.eksik ? "+" : "");
    degisim.textContent = yuzde(t.degisim);
    degisim.className = "tk__yuzde " + yon(t.degisim);
    kart.classList.toggle("tk--artis", yon(t.degisim) === "artis");
    kart.classList.toggle("tk--dusus", yon(t.degisim) === "dusus");
    cubuk.style.width = Math.max(2, Math.min(100, (t.simdi / Math.max(t.ilk, 1e-9)) * 50)) + "%";   // half-way = where it started
    ilk.textContent = para(t.ilk);
    if (t.arz > 0) destek.textContent = kucukPara(t.simdi / t.arz);
    if (hf.status === "fulfilled" && Number.isFinite(hf.value) && hf.value > 0) fiyat.textContent = kucukPara(hf.value);
    kalemler.textContent = t.kalemler.map((k) => k.zincirAd + " " + (k.deger == null ? "price n/a" : para(k.deger)) + (k.kaynak === "last auction" ? " (last auction)" : k.kaynak === "on its way" ? " (on its way)" : "")).join(" · ") +
      (t.bekleyen > 0.000001 ? " · waiting to be bought " + para(t.bekleyen) : "") + (t.hatalar.length ? " · unreadable: " + t.hatalar.join("; ") : "");
  };
  doldur();
  /* live: the vaults are read again every minute while the card is on screen */
  const z = setInterval(() => { if (!document.body.contains(kart)) return clearInterval(z); doldur().catch(() => {}); }, 60_000);
  return kart;
}

function sayfalayici(gecerli, toplam) {
  const ser = el("div", { attr: { style: "display:flex;gap:4px;overflow-x:auto;padding-bottom:4px" } });
  for (let i = 1; i <= toplam; i++) {
    ser.append(el("a", { sinif: "dugme dugme--kucuk" + (i === gecerli ? " dugme--marka" : ""), attr: { href: "#/kesfet?s=" + i, "aria-current": i === gecerli ? "page" : null }, yazi: String(i) }));
  }
  return ser;
}

export async function ciz({ param }) {
  const kap = el("div", { sinif: "yigin" });
  const arama = ((param && param.get("q")) || "").trim().toLowerCase();
  const uyar = (x) => !arama || [x.ad, x.sembol, x.simge, x.token].join(" ").toLowerCase().includes(arama);

  kap.append(sayfaUst("Discover", "Collateral-backed tokens: one pool on Arc, reachable from twelve chains", [
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" } }, [
      el("span", { html: ikon("arti", "yol-oge__ikon") }), el("span", { yazi: "Create a token" })]),
  ]));

  const sayfa = Number((param && param.get("s")) || 1) || 1;
  /* the second generation, once wired, is the main list; the first stays readable below it */
  const v2 = await sepetV2();
  const cfg = v2 || SEPET;
  const [arcS, suiS, aptosS, eskiS] = await Promise.allSettled([arcListesi(sayfa, cfg.lp5),
    import("../sui.js").then((m) => m.launchListesi()), import("../aptos.js").then((m) => m.launchListesi()), v2 ? arcListesi(1, SEPET.lp5) : Promise.resolve(null)]);   // loaded here so a Move library failing never blanks the page

  /* ---- facts that are true for every launch, plus the live count ---- */
  const izgara = el("div", { sinif: "izgara izgara--olcum" });
  const say = (s, f) => (s.status === "fulfilled" ? f(s.value) : null);
  /* the first generation's launches, counted in the total and named apart so the list below can't seem to contradict it */
  const eskiN = eskiS.status === "fulfilled" && eskiS.value ? eskiS.value.n : 0;
  const sayilar = [say(arcS, (v) => v.n + (eskiS.status === "fulfilled" && eskiS.value ? eskiS.value.n : 0)), say(suiS, (v) => v.length), say(aptosS, (v) => v.length)];
  izgara.append(olcum("Launches", sayilar.every((x) => x != null) ? String(sayilar.reduce((a, b) => a + b, 0)) : "—",
    "Arc " + (sayilar[0] ?? "—") + (eskiN ? " (" + eskiN + " in the first generation)" : "") + " · Sui " + (sayilar[1] ?? "—") + " · Aptos " + (sayilar[2] ?? "—")));
  izgara.append(olcum("Opening market cap", para(EKONOMI.acilisMcap, { kisalt: true }), "the same price for every launch"));
  izgara.append(olcum("Trading fee", "2.2%", "plus the token's collateral tax (1–5%)"));
  if (v2) izgara.append(olcum("Collateral chains", (cfg.kasa[5] ? 12 : 11) + " of 12", cfg.kasa[5] ? "every chain" : "Solana opens when its gate is wired"));
  else izgara.append(olcum("Collateral chains", SEPET_ACIK.length + " of 12", "Robinhood waits on Circle's CCTP route; Solana not open yet"));
  kap.append(izgara);

  /* ---- the one pool on Arc: collateral cards, newest first ---- */
  const BASLIK = "Collateral of every launch (one pool on Arc)";
  if (arcS.status !== "fulfilled") {
    kap.append(panel(BASLIK, bos("Could not read the registry", String(arcS.reason && arcS.reason.message || arcS.reason))));
  } else if (!arcS.value.liste.length) {
    kap.append(panel(BASLIK, bos(eskiN ? "No launches in this generation yet" : "No launches yet",
      "The registry on Arc (PulseLaunchpad5) is deployed and empty. The first launch made from any chain appears here, with its collateral read from the vaults." +
      (eskiN ? " The " + (eskiN === 1 ? "launch" : eskiN + " launches") + " counted above " + (eskiN === 1 ? "is" : "are") + " in the first generation, listed further down this page." : ""))));
  } else {
    const v = arcS.value;
    const satirlar = v.liste.filter(uyar);
    const izg = el("div", { sinif: "izgara izgara--kart" }, satirlar.map((x) => teminatKarti(x, cfg)));
    kap.append(panel(BASLIK, el("div", { sinif: "yigin" }, [
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Collateral now = what each vault holds for the token at market price (DexScreener; the vault's last auction price where the market has none) plus dollars waiting to be bought. Change is against what the founder put in. Newest first; the 2,000 newest are kept." }),
      satirlar.length ? izg : bos("No matches", 'Nothing on this page for "' + arama + '".'),
      v.sayfaSayisi > 1 ? sayfalayici(v.sayfa, v.sayfaSayisi) : el("span"),
    ]), el("span", { sinif: "tk__canli", yazi: "live · " + v.n + " token · page " + v.sayfa + " of " + v.sayfaSayisi })));

    /* new launches: page 1 redraws itself when the registry grows */
    if (v.sayfa === 1) {
      const zamanlayici = setInterval(async () => {
        if (!document.body.contains(kap)) return clearInterval(zamanlayici);
        const n = Number(await new Contract(cfg.lp5, LP5_ABI, arc).launchCount().catch(() => v.n));
        if (n !== v.n) { clearInterval(zamanlayici); window.dispatchEvent(new HashChangeEvent("hashchange")); }
      }, 30_000);
    }
  }

  /* ---- the first generation (before the second was wired): its launches stay readable ---- */
  if (eskiS.status === "fulfilled" && eskiS.value && eskiS.value.liste.length) {
    kap.append(panel("First generation", el("div", { sinif: "izgara izgara--kart" }, eskiS.value.liste.filter(uyar).map((x) => teminatKarti(x, SEPET)))));
  }

  /* ---- tokens living on Sui and Aptos ---- */
  const move = [];
  if (suiS.status === "fulfilled") move.push(...suiS.value.map((x) => ({ ...x, etiket: "Sui", href: "#/move-token?zincir=sui&kasa=" + x.kasa })));
  if (aptosS.status === "fulfilled") move.push(...aptosS.value.map((x) => ({ ...x, etiket: "Aptos", href: "#/move-token?zincir=aptos&token=" + x.token })));
  const moveSatir = move.filter(uyar);
  const hatalar = [suiS.status === "rejected" ? "Sui" : null, aptosS.status === "rejected" ? "Aptos" : null].filter(Boolean);
  if (!moveSatir.length) {
    kap.append(panel("Tokens on Sui and Aptos", bos(hatalar.length ? "Could not read " + hatalar.join(" and ") : "No launches yet",
      hatalar.length ? "The chain's record did not answer; try again." : "Launches paid from a Sui or Aptos wallet live on that chain and appear here.")));
  } else {
    const t = el("table", { sinif: "tablo" });
    t.append(el("thead", {}, [el("tr", {}, ["Token", "Chain", ""].map((b) => el("th", { yazi: b })))]));
    const g = el("tbody");
    for (const x of moveSatir) {
      g.append(el("tr", {}, [
        el("td", { yazi: x.simge ? x.simge + " · " + (x.ad || "") : String(x.token).split("::").slice(-1)[0] }),
        el("td", { yazi: x.etiket }),
        el("td", {}, [el("a", { sinif: "dugme dugme--kucuk", attr: { href: x.href }, yazi: "Trade" })]),
      ]));
    }
    t.append(g);
    kap.append(panel("Tokens on Sui and Aptos", el("div", { sinif: "tablo-sarmal" }, [t])));
  }
  return kap;
}
