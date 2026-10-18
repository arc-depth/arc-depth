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
import { jetonBilgileri } from "../zincir.js";
import { EKONOMI } from "../adresler.js";
import { para } from "../bicim.js";
import { havuzFiyati } from "./merkez.js";
import { JsonRpcProvider, Contract } from "../../vendor/ethers.min.js";

const LP5 = "0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d";   // PulseLaunchpad5, the one pool's registry (dagitim-sepet.json)
const LP5_ABI = [
  "function launchCount() view returns (uint256)",
  "function launchAt(uint256) view returns ((address token, address acici, address kasa, uint256 teminat, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))",
];
const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });

/* the chains with a live basket vault (dagitim-sepet.json); the other three are listed as not open */
const SEPET_ACIK = ["Arc", "Base", "Arbitrum", "Avalanche", "Monad", "HyperEVM", "BNB", "Sui", "Aptos"];

async function arcListesi() {
  const lp = new Contract(LP5, LP5_ABI, arc);
  const n = Number(await lp.launchCount());
  const kayitlar = await Promise.all(Array.from({ length: Math.min(n, 100) }, (_, i) => lp.launchAt(n - 1 - i)));
  const bilgi = await jetonBilgileri(kayitlar.map((k) => k.token));
  return { n, liste: kayitlar.map((k, i) => ({ token: k.token, teminat: Number(k.teminat) / 1e6, vergi: Number(k.vergiPpm) / 10_000,
    zaman: Number(k.zaman), ad: bilgi[i] && bilgi[i].ad, sembol: bilgi[i] && bilgi[i].sembol })) };
}

export async function ciz({ param }) {
  const kap = el("div", { sinif: "yigin" });
  const arama = ((param && param.get("q")) || "").trim().toLowerCase();
  const uyar = (x) => !arama || [x.ad, x.sembol, x.simge, x.token].join(" ").toLowerCase().includes(arama);

  kap.append(sayfaUst("Discover", "Collateral-backed tokens: one pool on Arc, reachable from twelve chains", [
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" } }, [
      el("span", { html: ikon("arti", "yol-oge__ikon") }), el("span", { yazi: "Create a token" })]),
  ]));

  const [arcS, suiS, aptosS] = await Promise.allSettled([arcListesi(),
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

  /* ---- the one pool on Arc ---- */
  if (arcS.status !== "fulfilled") {
    kap.append(panel("Tokens (one pool on Arc)", bos("Could not read the registry", String(arcS.reason && arcS.reason.message || arcS.reason))));
  } else if (!arcS.value.liste.length) {
    kap.append(panel("Tokens (one pool on Arc)", bos("No launches yet",
      "The registry on Arc (PulseLaunchpad5) is deployed and empty. The first launch made from any chain appears here.")));
  } else {
    const satirlar = arcS.value.liste.filter(uyar);
    const t = el("table", { sinif: "tablo tablo--kart" });
    t.append(el("thead", {}, [el("tr", {}, ["Token", "Price", "Collateral", "Tax", "Launched", ""].map((b) => el("th", { yazi: b })))]));
    const g = el("tbody");
    for (const s of satirlar) {
      const fiyat = el("td", { sinif: "sayi", attr: { "data-et": "Price" }, yazi: "—" });
      havuzFiyati(s.token).then((f) => { if (f > 0) fiyat.textContent = "$" + f.toPrecision(3); }).catch(() => {});
      g.append(el("tr", {}, [
        el("td", { attr: { "data-et": "Token" } }, [el("a", { sinif: "jeton", attr: { href: "#/merkez?t=" + s.token } }, [
          el("div", { sinif: "jeton__logo jeton__logo--bos", yazi: (s.sembol || "?").slice(0, 3).toUpperCase() }),
          el("div", { sinif: "jeton__yazi" }, [el("div", { sinif: "jeton__sembol", yazi: s.sembol || "?" }), el("div", { sinif: "jeton__ad", yazi: s.ad || "" })]),
        ])]),
        fiyat,
        el("td", { sinif: "sayi", attr: { "data-et": "Collateral" }, yazi: para(s.teminat) }),
        el("td", { sinif: "sayi", attr: { "data-et": "Tax" }, yazi: s.vergi.toFixed(0) + "%" }),
        el("td", { attr: { "data-et": "Launched" }, yazi: new Date(s.zaman * 1000).toUTCString().slice(5, 22) }),
        el("td", { attr: { "data-et": "" } }, [el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/merkez?t=" + s.token }, yazi: "Trade" })]),
      ]));
    }
    t.append(g);
    kap.append(panel("Tokens (one pool on Arc)", satirlar.length ? el("div", { sinif: "tablo-sarmal" }, [t]) : bos("No matches", 'Nothing found for "' + arama + '".'),
      el("span", { sinif: "ucuncul", yazi: arcS.value.n + " token" })));
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
