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
import { teminatDurumu, islemZincirleri, cikisZinciri } from "../teminat-izle.js";

const LP5 = "0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d";   // PulseLaunchpad5, the one pool's registry (dagitim-sepet.json)
const LP5_ABI = [
  "function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))",
];
const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });

/* the chains with a live basket vault (dagitim-sepet.json); the other three are listed as not open */
const SEPET_ACIK = ["Arc", "Base", "Arbitrum", "Avalanche", "Monad", "HyperEVM", "BNB", "Sui", "Aptos"];

/* Newest first, ten to a page, two hundred pages: the 2,000 newest
   launches. Older ones drop off the end as new ones arrive. */
const SAYFA_BOY = 10, AZAMI_SAYFA = 200;

async function arcListesi(sayfa) {
  const lp = new Contract(LP5, LP5_ABI, arc);
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
const yuzde = (x) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
function teminatKarti(s, cfg) {
  const nereden = el("span", { sinif: "etiket", yazi: "launched from …" });
  const zincirler = el("div", { attr: { style: "display:flex;flex-wrap:wrap;gap:4px" } }, [el("span", { sinif: "etiket", yazi: "…" })]);
  const simdi = el("div", { sinif: "dg", yazi: "—" });
  const degisim = el("div", { sinif: "dg", yazi: "—" });
  const ilk = el("div", { sinif: "dg", yazi: "—" });
  const kalemler = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "reading the vaults…" });
  const olc = (et, dg) => el("div", { sinif: "jeton-kart__olcum" }, [el("div", { sinif: "et", yazi: et }), dg]);
  const kart = el("a", { sinif: "jeton-kart", attr: { href: "#/merkez?t=" + s.token, style: "color:inherit;text-decoration:none" } }, [
    el("div", { attr: { style: "display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap" } }, [
      el("div", { sinif: "jeton" }, [
        el("div", { sinif: "jeton__logo jeton__logo--bos", yazi: (s.sembol || "?").slice(0, 3).toUpperCase() }),
        el("div", { sinif: "jeton__yazi" }, [el("div", { sinif: "jeton__sembol", yazi: (s.sembol || "?") + "  #" + s.no }), el("div", { sinif: "jeton__ad", yazi: s.ad || "" })]),
      ]),
      nereden,
    ]),
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Trades on" }),
    zincirler,
    el("div", { sinif: "jeton-kart__olcumler" }, [olc("Collateral now", simdi), olc("Change", degisim), olc("Started with", ilk)]),
    kalemler,
  ]);
  (async () => {
    const [tz, td] = await Promise.allSettled([islemZincirleri(s.token, cfg), teminatDurumu(s.token, cfg)]);
    if (tz.status === "fulfilled") {
      zincirler.replaceChildren(...tz.value.zincirler.map((z) => el("span", { sinif: "etiket etiket--marka", yazi: z })));
      cikisZinciri(s.token, tz.value.adapter, s.zaman, cfg).then((c) => { nereden.textContent = c ? "launched from " + c : "launched on Arc's launchpad"; })
        .catch(() => { nereden.textContent = "launch chain unreadable"; });
    } else { zincirler.replaceChildren(el("span", { sinif: "etiket etiket--uyari", yazi: "could not read" })); nereden.textContent = ""; }
    if (td.status !== "fulfilled" || !td.value) { kalemler.textContent = td.status === "fulfilled" ? "No basket recorded for this token." : "Vaults could not be read: " + td.reason.message; return; }
    const t = td.value;
    simdi.textContent = para(t.simdi) + (t.eksik ? " +?" : "");
    ilk.textContent = para(t.ilk);
    degisim.textContent = yuzde(t.degisim);
    degisim.className = "dg " + (t.degisim > 0.00005 ? "artis" : t.degisim < -0.00005 ? "dusus" : "sabit");
    kalemler.textContent = t.kalemler.map((k) => k.zincirAd + " " + (k.deger == null ? "price n/a" : para(k.deger)) + (k.kaynak === "last auction" ? " (last auction)" : "")).join(" · ") +
      (t.bekleyen > 0.000001 ? " · waiting to be bought " + para(t.bekleyen) : "") + (t.hatalar.length ? " · unreadable: " + t.hatalar.join("; ") : "");
  })();
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
  const [arcS, suiS, aptosS] = await Promise.allSettled([arcListesi(sayfa),
    import("../sui.js").then((m) => m.launchListesi()), import("../aptos.js").then((m) => m.launchListesi())]);   // loaded here so a Move library failing never blanks the page

  /* ---- facts that are true for every launch, plus the live count ---- */
  const izgara = el("div", { sinif: "izgara izgara--olcum" });
  const say = (s, f) => (s.status === "fulfilled" ? f(s.value) : null);
  const sayilar = [say(arcS, (v) => v.n), say(suiS, (v) => v.length), say(aptosS, (v) => v.length)];
  izgara.append(olcum("Launches", sayilar.every((x) => x != null) ? String(sayilar.reduce((a, b) => a + b, 0)) : "—",
    "Arc " + (sayilar[0] ?? "—") + " · Sui " + (sayilar[1] ?? "—") + " · Aptos " + (sayilar[2] ?? "—")));
  izgara.append(olcum("Opening market cap", para(EKONOMI.acilisMcap, { kisalt: true }), "the same price for every launch"));
  izgara.append(olcum("Trading fee", "2.2%", "plus the token's collateral tax (1–5%)"));
  izgara.append(olcum("Collateral chains", SEPET_ACIK.length + " of 12", "Ethereum, Solana and Robinhood not open yet"));
  kap.append(izgara);

  /* ---- the one pool on Arc: collateral cards, newest first ---- */
  const BASLIK = "Collateral of every launch (one pool on Arc)";
  if (arcS.status !== "fulfilled") {
    kap.append(panel(BASLIK, bos("Could not read the registry", String(arcS.reason && arcS.reason.message || arcS.reason))));
  } else if (!arcS.value.liste.length) {
    kap.append(panel(BASLIK, bos("No launches yet",
      "The registry on Arc (PulseLaunchpad5) is deployed and empty. The first launch made from any chain appears here, with its collateral read from the vaults.")));
  } else {
    const v = arcS.value;
    const satirlar = v.liste.filter(uyar);
    const izg = el("div", { sinif: "izgara izgara--kart" }, satirlar.map(teminatKarti));
    kap.append(panel(BASLIK, el("div", { sinif: "yigin" }, [
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Collateral now = what each vault holds for the token at market price (DexScreener; the vault's last auction price where the market has none) plus dollars waiting to be bought. Change is against what the founder put in. Newest first; the 2,000 newest are kept." }),
      satirlar.length ? izg : bos("No matches", 'Nothing on this page for "' + arama + '".'),
      v.sayfaSayisi > 1 ? sayfalayici(v.sayfa, v.sayfaSayisi) : el("span"),
    ]), el("span", { sinif: "ucuncul", yazi: v.n + " token · page " + v.sayfa + " of " + v.sayfaSayisi })));

    /* new launches: page 1 redraws itself when the registry grows */
    if (v.sayfa === 1) {
      const zamanlayici = setInterval(async () => {
        if (!document.body.contains(kap)) return clearInterval(zamanlayici);
        const n = Number(await new Contract(LP5, LP5_ABI, arc).launchCount().catch(() => v.n));
        if (n !== v.n) { clearInterval(zamanlayici); window.dispatchEvent(new HashChangeEvent("hashchange")); }
      }, 30_000);
    }
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
