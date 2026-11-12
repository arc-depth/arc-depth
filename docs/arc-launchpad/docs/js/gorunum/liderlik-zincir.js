/* ===========================================================================
 * gorunum/liderlik-zincir.js — live rankings from Arc logs: traders,
 * launchers, designers, referrers and display points, over 24h / 7d / all
 *
 * Read with docs/js/yedekli-okur.js (the published log archive, then RPC
 * pieces) and counted by docs/js/davet-hesap.js:
 *   traders    MerkezKapi v8/v9 Alindi + Satildi, by the recipient wallet
 *              (the person the gate delivered to, not the router)
 *   launchers  MerkezLaunch, by founder
 *   designers  TasarimNFT2 sales, by designer
 *   referrers  DavetKaydi links and their invitees' activity
 * Points are a display score only. They are not a token, not a balance and
 * not a promise of anything.
 * =========================================================================== */
import { el, panel, bos, not, sekmeler, adres } from "../ui.js";
import { maskotBos, dugmeLink, arsiv } from "./squad.js";
import { para } from "../bicim.js";
import { siralamalar, PUAN } from "../davet-hesap.js";
import { zincirVerisi, blokEsigi } from "../davet.js";

const PENCERELER = [{ anahtar: "24s", ad: "24h", saniye: 86_400 }, { anahtar: "7g", ad: "7d", saniye: 7 * 86_400 }, { anahtar: "hepsi", ad: "All time", saniye: 0 }];

/* each board, when empty, gets its own mascot (rotating by day) and says what will appear and how to get on it */
let maskotSirasi = Math.floor(Date.now() / 86_400_000);
function tablo(baslik, satirlar, sutunlar, bosYazi, eylemler = []) {
  if (!satirlar.length) return panel(baslik, maskotBos(maskotSirasi++, "Nobody here yet in this window", bosYazi, eylemler));
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["#", ...sutunlar.map((s) => s[0])].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  satirlar.slice(0, 20).forEach((s, i) => g.append(el("tr", {}, [el("td", { yazi: String(i + 1) }), ...sutunlar.map((c) => c[1](s))])));
  t.append(g);
  return panel(baslik, el("div", { sinif: "tablo-sarmal" }, [t]));
}
const td = (x) => el("td", { yazi: x });
const kim = (x) => el("td", {}, [adres(x.adres)]);

/** Appends the live section to `kap`. */
export async function zincirSiralari(kap) {
  const bolum = el("div", { sinif: "yigin", attr: { id: "lider-zincir" } });
  kap.append(bolum);
  const govde = el("div", { sinif: "yigin" }, [el("div", { sinif: "yazi--sessiz", yazi: "Reading activity from Arc…" })]);
  let secili = "7g";
  const esikler = {};
  let v;
  const ciz = async () => {
    const p = PENCERELER.find((x) => x.anahtar === secili);
    if (!(secili in esikler)) esikler[secili] = p.saniye ? await blokEsigi(p.saniye, v.sonBlok, v.sonZaman) : 0;
    const s = siralamalar(v.etkinlikler, v.baglar, esikler[secili]);
    const notu = not("Points are a display score: $1 traded = " + PUAN.dolar + ", a launch = " + PUAN.launch + ", a design sold = " + PUAN.satis + " + $1 of its price, a design published = " + PUAN.yayin +
      ", an invited wallet that became active = " + PUAN.davet + ". They are not a token or a balance and promise nothing.");
    const kaynak = arsiv("Where these numbers come from", "Read live from Arc up to block " + v.sonBlok.toLocaleString("en-US") + (esikler[secili] ? " (this window starts at about block " + esikler[secili].toLocaleString("en-US") + ")" : "") +
      ". Traders are counted by the wallet the ARC PULSE gate delivered to, not by the router contract.");
    /* every board empty: one calm empty state for the whole section, not four */
    if (!s.tuccar.length && !s.kurucu.length && !s.tasarimci.length && !s.davetci.length) {
      govde.replaceChildren(
        maskotBos(maskotSirasi++, "The boards are empty in this window",
          "Four boards fill in here: traders by volume, launchers, designers by sales, and referrers by active invitees. Trade a token, launch one, sell a design or invite a friend, and your wallet appears on the board for that window. Try \"All time\" above for the whole history.",
          [dugmeLink("Trade", "#/terminal", true), dugmeLink("Create a token", "#/olustur"), dugmeLink("Designs", "#/designs"), dugmeLink("Get your invite link", "#/davet")]),
        notu, kaynak);
      return;
    }
    govde.replaceChildren(
      el("div", { sinif: "izgara izgara--genis" }, [
        tablo("Top traders by volume", s.tuccar, [["Wallet", kim], ["Volume", (x) => td(para(x.hacim))], ["Trades", (x) => td(x.alim + " buys · " + x.satim + " sells")]],
          "Buys and sells through ARC PULSE land here, ranked by volume.", [dugmeLink("Trade", "#/terminal")]),
        tablo("Top launchers", s.kurucu, [["Founder", kim], ["Launches", (x) => td(String(x.launch))], ["Launch fees paid", (x) => td(para(x.ucret))]],
          "Every token launched on ARC PULSE puts its founder here.", [dugmeLink("Create a token", "#/olustur")]),
        tablo("Top designers by sales", s.tasarimci, [["Designer", kim], ["Sales", (x) => td(String(x.satis))], ["Sales value", (x) => td(para(x.hacim))]],
          "Designers rank here by the designs they sell.", [dugmeLink("Designs", "#/designs")]),
        tablo("Top referrers", s.davetci, [["Referrer", kim], ["Active invitees", (x) => td(String(x.aktif))], ["Linked", (x) => td(String(x.davetli))], ["Invitee volume", (x) => td(para(x.hacim))]],
          "Invite a friend with your link; once they trade, you appear here.", [dugmeLink("Get your invite link", "#/davet")])
      ]),
      s.puan.length ? tablo("Points", s.puan, [["Wallet", kim], ["Points", (x) => td(Math.round(x.puan).toLocaleString("en-US"))]], "") : null,
      notu, kaynak
    );
  };
  const sek = sekmeler(PENCERELER, secili, (a) => { secili = a; govde.replaceChildren(el("div", { sinif: "yazi--sessiz", yazi: "Counting…" })); ciz().catch((e) => govde.replaceChildren(bos("Could not compute", e.message))); });
  sek.classList.add("lider-pencere");
  bolum.append(el("h3", { yazi: "Traders, launchers, designers and referrers (live from Arc)" }), sek, govde);
  try { v = await zincirVerisi(); await ciz(); }
  catch (e) { govde.replaceChildren(bos("Could not read Arc just now", "The public Arc endpoint is busy. Reload the page in a minute. (" + ((e && e.message) || String(e)) + ")")); }
}
