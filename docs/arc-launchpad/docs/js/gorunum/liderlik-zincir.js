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
import { para } from "../bicim.js";
import { siralamalar, PUAN } from "../davet-hesap.js";
import { zincirVerisi, blokEsigi } from "../davet.js";

const PENCERELER = [{ anahtar: "24s", ad: "24h", saniye: 86_400 }, { anahtar: "7g", ad: "7d", saniye: 7 * 86_400 }, { anahtar: "hepsi", ad: "All time", saniye: 0 }];

function tablo(baslik, satirlar, sutunlar, bosYazi) {
  if (!satirlar.length) return panel(baslik, bos("Nothing in this window", bosYazi));
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["#", ...sutunlar.map((s) => s[0])].map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  satirlar.slice(0, 20).forEach((s, i) => g.append(el("tr", {}, [el("td", { yazi: String(i + 1) }), ...sutunlar.map((c) => c[1](s))])));
  t.append(g);
  return panel(baslik, t);
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
    govde.replaceChildren(
      el("div", { sinif: "izgara izgara--genis" }, [
        tablo("Top traders by volume", s.tuccar, [["Wallet", kim], ["Volume", (x) => td(para(x.hacim))], ["Trades", (x) => td(x.alim + " buys · " + x.satim + " sells")]],
          "No buy or sell through the ARC PULSE gates in this window."),
        tablo("Top launchers", s.kurucu, [["Founder", kim], ["Launches", (x) => td(String(x.launch))], ["Launch fees paid", (x) => td(para(x.ucret))]],
          "No launch in this window."),
        tablo("Top designers by sales", s.tasarimci, [["Designer", kim], ["Sales", (x) => td(String(x.satis))], ["Sales value", (x) => td(para(x.hacim))]],
          "No design sold in this window."),
        tablo("Top referrers", s.davetci, [["Referrer", kim], ["Active invitees", (x) => td(String(x.aktif))], ["Linked", (x) => td(String(x.davetli))], ["Invitee volume", (x) => td(para(x.hacim))]],
          "No referral activity in this window. Get your link on the Referrals page.")
      ]),
      tablo("Points", s.puan, [["Wallet", kim], ["Points", (x) => td(Math.round(x.puan).toLocaleString("en-US"))]], "No activity in this window."),
      not("Points are a display score: $1 traded = " + PUAN.dolar + ", a launch = " + PUAN.launch + ", a design sold = " + PUAN.satis + " + $1 of its price, a design published = " + PUAN.yayin +
        ", an invited wallet that became active = " + PUAN.davet + ". They are not a token or a balance and promise nothing. Read live from Arc up to block " + v.sonBlok.toLocaleString("en-US") + (esikler[secili] ? " (window from about block " + esikler[secili].toLocaleString("en-US") + ")" : "") + ".")
    );
  };
  const sek = sekmeler(PENCERELER, secili, (a) => { secili = a; govde.replaceChildren(el("div", { sinif: "yazi--sessiz", yazi: "Counting…" })); ciz().catch((e) => govde.replaceChildren(bos("Could not compute", e.message))); });
  sek.classList.add("lider-pencere");
  bolum.append(el("h3", { yazi: "Traders, launchers, designers and referrers (live from Arc)" }), sek, govde);
  try { v = await zincirVerisi(); await ciz(); }
  catch (e) { govde.replaceChildren(bos("Could not read Arc", (e && e.message) || String(e))); }
}
