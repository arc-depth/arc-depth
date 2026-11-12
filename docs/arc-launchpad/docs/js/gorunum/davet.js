/* ===========================================================================
 * gorunum/davet.js — Referrals: your invite link, who you invited, rewards
 *
 * Contracts: DavetKaydi (who invited whom, written once by the invited
 * wallet; no admin) and DavetOdemesi (USDC rewards). Everything on this page
 * is read from Arc and recomputed here with docs/js/davet-hesap.js, the
 * same program the admin runs to publish a reward root, so the page can say
 * whether the published root matches before it offers a claim.
 * No server, no account, nothing stored about the visitor.
 * =========================================================================== */
import { el, sayfaUst, panel, bos, not, olcum, adres, adimlar, ayrinti } from "../ui.js";
import { sozlesmeAyrinti } from "./squad.js";
import { para } from "../bicim.js";
import * as H from "../davet-hesap.js";
import { arcOkur, davetCanli, bekleyenDavet, baglantiDurumu, baglaGonder, arcGonder, zincirVerisi, refCoz } from "../davet.js";
import { Contract } from "../../vendor/ethers.min.js";

const usd = (x) => para(Number(x) / 1e6);
const usdTam = (x) => "$" + (Number(x) / 1e6).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const hataMetni = (e) => (e && (e.shortMessage || e.reason || e.message)) || String(e);

function kopyaSatiri(metin) {
  const b = el("button", { sinif: "dugme dugme--sade dugme--kucuk", yazi: "Copy", attr: { type: "button" }, on: { click: async () => {
    try { await navigator.clipboard.writeText(metin); b.textContent = "Copied"; } catch (_) { b.textContent = "Select and copy"; }
    setTimeout(() => { b.textContent = "Copy"; }, 1500);
  } } });
  return el("div", { sinif: "girdi-grup davet-link" }, [el("input", { sinif: "girdi mono", attr: { readonly: true, value: metin, "aria-label": "Invite link" } }), b]);
}

/* the share of a trade that counts for referrals (davet-hesap.js): development 0.30% + marketing
   (operations) 0.20% on a main-launchpad trade, 0.30% + 0.10% on a designer-token trade */
const PAY_ANA = 0.005, PAY_TASARIM = 0.004;

/** A worked example the visitor can change: an amount a friend trades, and what the rate on chain gives the referrer. */
function ornekHesap(oranBps) {
  const oran = oranBps / 10_000;
  const girdi = el("input", { sinif: "girdi mono", attr: { type: "number", min: "0", step: "100", value: "1000", inputmode: "decimal", "aria-label": "Amount your friend trades, in dollars", style: "max-width:160px" } });
  const sonuc = el("div", { sinif: "d4-ornek-hesap" });
  const yaz = () => {
    const x = Math.max(0, Number(girdi.value) || 0);
    const kutu = (et, dg, alt) => el("div", { sinif: "olcum" }, [el("div", { sinif: "olcum__etiket", yazi: et }), el("div", { sinif: "olcum__deger", yazi: dg }), el("div", { sinif: "olcum__alt", yazi: alt })]);
    sonuc.replaceChildren(
      kutu("Main launchpad trade", "$" + (x * PAY_ANA * oran).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }), (oranBps / 100) + "% of 0.50% of the trade"),
      kutu("Designer-token trade", "$" + (x * PAY_TASARIM * oran).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }), (oranBps / 100) + "% of 0.40% of the trade"));
  };
  girdi.addEventListener("input", yaz);
  yaz();
  return el("div", { sinif: "yigin yigin--sik" }, [
    el("label", { sinif: "yazi", attr: { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center" } }, ["If a friend you invited trades $", girdi, " you earn, in USDC:"]),
    sonuc,
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "An example of the arithmetic, not a forecast: you earn only from fees your invitees actually pay." }),
  ]);
}

function kurallar(oranBps, bekleme) {
  const oran = (oranBps / 100).toLocaleString("en-US") + "%";
  return panel("How it works", el("div", { sinif: "yigin yigin--sik" }, [
    ornekHesap(oranBps),
    el("ol", { sinif: "davet-adimlar" }, [
      el("li", { yazi: "Share your link. Anyone who opens it and then links their wallet (one Arc transaction, gas only) becomes your invitee. The link is set once per wallet, forever: the first invite they link wins, nobody can change it, and a wallet cannot invite itself." }),
      el("li", { yazi: "When your invitees trade, launch, publish or buy a design, hire on Designs or fill a limit order, the contracts take their usual fees. Nothing is added for them." }),
      el("li", { yazi: "You earn " + oran + " of the development and marketing share of those fees, for activity after they linked." }),
      el("li", { yazi: "Rewards are worked out from public Arc records by an open program (the same code this page runs). Once a day the total owed to every referrer is published to the referral payout contract; after a " + Math.round(bekleme / 3600) + "-hour wait you claim it in USDC here." })
    ]),
    ayrinti("Which fees count, exactly?", "The development + marketing share of each fee, exactly as each contract paid it: on a main-launchpad trade 0.30% + 0.20% of the trade, on a designer-token trade 0.30% + 0.10%, half of the 2% launch fee, the $0.10 marketing half of a design publish fee, and the development and marketing slices of the Designs market, commission and limit-order fees. " +
      "The daily publication is a Merkle root of every referrer's running total; this page recomputes it from Arc and shows whether it matches before it offers a claim."),
    not("The rate is set on chain (now " + oran + ", hard cap 30%) and changes are public events that only apply from their block on. A published total can never promise more than the contract holds. Rewards come only from fees your invitees actually pay: no amount is promised, and this is not an investment or income product."),
    sozlesmeAyrinti([["Who invited whom (written once by the invited wallet, no admin)", "DavetKaydi", H.DAVET.kayit], ["Referral payouts in USDC", "DavetOdemesi", H.DAVET.odeme]]),
  ]));
}
export async function ciz({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Referrals", "Invite people to ARC PULSE and receive 20% of the development + marketing share of the fees they pay, in USDC"));
  kap.append(adimlar([
    { ikon: "zincir", baslik: "Share your link", yazi: "Connect a wallet and copy your invite link. It is your wallet address, or a short code you register on Arc." },
    { ikon: "insanlar", baslik: "Friends trade and launch", yazi: "When people you invited trade, launch or buy designs, they pay the usual fees. Nothing is added for them." },
    { ikon: "cuzdan", baslik: "You earn USDC", yazi: "20% of the development and marketing share of their fees is yours, claimable in USDC on this page every day." },
  ]));
  if (!davetCanli()) { kap.append(panel("Referrals", bos("Not deployed", "The referral contracts are not set on this page yet."))); return kap; }
  const p = arcOkur();
  const kayit = new Contract(H.DAVET.kayit, H.KAYIT_ABI, p);
  const odeme = new Contract(H.DAVET.odeme, H.ODEME_ABI, p);
  const [oranBps, bekleme] = await Promise.all([odeme.oranBps().then(Number).catch(() => H.VARSAYILAN_ORAN_BPS), odeme.beklemeSaniye().then(Number).catch(() => 86400)]);

  const ben = cuzdan.hesap();
  if (!ben) {
    const d = bekleyenDavet();
    kap.append(panel("Your invite link", el("div", { sinif: "yigin yigin--sik" }, [
      d ? not("You opened an invite (" + (d.ref.length > 20 ? kisa(d.ref) : d.ref) + "). Connect a wallet to link it.") : null,
      el("p", { sinif: "yazi--sessiz", yazi: "Connect a wallet to get your link and see who you invited. Your link is your wallet address, or a short code you register on Arc." }),
      el("button", { sinif: "dugme dugme--marka", yazi: "Connect wallet", attr: { type: "button" }, on: { click: async () => { try { await cuzdan.bagla(); location.reload(); } catch (_) { /* the wallet dialog explains */ } } } })
    ])));
    kap.append(kurallar(oranBps, bekleme));
    return kap;
  }

  let durum;
  try { durum = await baglantiDurumu(ben); } catch (e) { kap.append(panel("Referrals", bos("Could not read Arc", hataMetni(e)))); return kap; }

  /* ---- your link and code ---- */
  const linkKap = el("div", { sinif: "yigin yigin--sik" });
  const linkCiz = (kod) => {
    linkKap.replaceChildren(
      el("div", { sinif: "yazi--kucuk yazi--sessiz", yazi: "App link" }), kopyaSatiri(H.davetLinki(kod || ben)),
      el("div", { sinif: "yazi--kucuk yazi--sessiz", yazi: "Designs link" }), kopyaSatiri(H.davetLinki(kod || ben, "designs")));
  };
  linkCiz(durum.kod);
  const kodDurum = el("div", { sinif: "yazi--kucuk yazi--sessiz", attr: { role: "status" } });
  let kodBolum;
  if (durum.kod) {
    kodBolum = el("div", { sinif: "yigin yigin--sik" }, [
      el("div", { yazi: "Your code: " }, [el("strong", { sinif: "mono", yazi: durum.kod })]),
      el("button", { sinif: "dugme dugme--sade dugme--kucuk", yazi: "Release this code", attr: { type: "button" }, on: { click: async (ev) => {
        if (!confirm("Release '" + durum.kod + "'? Links with this code stop working (wallets already linked stay linked) and anyone may take it.")) return;
        ev.currentTarget.disabled = true;
        try { await arcGonder(cuzdan, H.DAVET.kayit, H.veri.kodBirak(), (s) => { kodDurum.textContent = s; }); kodDurum.textContent = "Released."; linkCiz(""); }
        catch (e) { kodDurum.textContent = hataMetni(e); ev.currentTarget.disabled = false; }
      } } }), kodDurum]);
  } else {
    const girdi = el("input", { sinif: "girdi mono", attr: { id: "davet-kod", placeholder: "yourname", maxlength: "16", "aria-label": "Invite code" } });
    const dugme = el("button", { sinif: "dugme dugme--marka", yazi: "Take code", attr: { type: "button" } });
    dugme.addEventListener("click", async () => {
      const kod = girdi.value.trim().toLowerCase();
      if (!H.kodGecerli(kod)) { kodDurum.textContent = "3 to 16 characters: a-z, 0-9 and '-', not starting or ending with '-'."; return; }
      dugme.disabled = true;
      try {
        const sahip = await kayit.kodCoz(kod);
        if (!/^0x0{40}$/i.test(sahip)) throw new Error("'" + kod + "' is taken.");
        await arcGonder(cuzdan, H.DAVET.kayit, H.veri.kodAl(kod), (s) => { kodDurum.textContent = s; });
        kodDurum.textContent = "Your code is '" + kod + "'."; linkCiz(kod);
      } catch (e) { kodDurum.textContent = hataMetni(e); dugme.disabled = false; }
    });
    kodBolum = el("div", { sinif: "yigin yigin--sik" }, [
      el("div", { sinif: "yazi--kucuk yazi--sessiz", yazi: "Optional: a short code instead of your address (one per wallet, first come, public on Arc)." }),
      el("div", { sinif: "girdi-grup" }, [girdi, dugme]), kodDurum]);
  }
  kap.append(panel("Your invite link", el("div", { sinif: "yigin" }, [linkKap, kodBolum])));

  /* ---- who invited you ---- */
  const bagDurum = el("div", { sinif: "yazi--kucuk yazi--sessiz", attr: { role: "status" } });
  let bagGovde;
  if (durum.davetci) {
    bagGovde = el("div", {}, ["Your wallet is linked to ", adres(durum.davetci), " since block " + durum.blok.toLocaleString("en-US") + ". This is permanent."]);
  } else {
    const d = bekleyenDavet();
    const girdi = el("input", { sinif: "girdi mono", attr: { id: "davet-ref", placeholder: "invite code or 0x address", value: d ? d.ref : "", "aria-label": "Invite code or address" } });
    const dugme = el("button", { sinif: "dugme dugme--marka", yazi: "Link invite", attr: { type: "button" } });
    dugme.addEventListener("click", async () => {
      const ref = girdi.value.trim();
      const r = /^0x[0-9a-fA-F]{40}$/.test(ref) ? ref : ref.toLowerCase();
      if (!/^0x[0-9a-fA-F]{40}$/.test(r) && !H.kodGecerli(r)) { bagDurum.textContent = "Enter an invite code or a 0x address."; return; }
      dugme.disabled = true;
      try { await baglaGonder(cuzdan, r, (s) => { bagDurum.textContent = s; }); bagDurum.textContent = "Linked. This cannot change."; }
      catch (e) { bagDurum.textContent = hataMetni(e); dugme.disabled = false; }
    });
    const onizle = el("div", { sinif: "yazi--kucuk yazi--sessiz" });
    if (d) refCoz(d.ref).then((a) => { onizle.textContent = a ? "This invite belongs to " + a + "." : "This code is not registered."; }).catch(() => {});
    bagGovde = el("div", { sinif: "yigin yigin--sik" }, [
      el("div", { yazi: "Not linked. If someone invited you, link their code or address once (one Arc transaction, gas only). It cannot be changed later and it adds no fee to anything you do." }),
      el("div", { sinif: "girdi-grup" }, [girdi, dugme]), onizle, bagDurum]);
  }
  kap.append(panel("Invited by", bagGovde));

  /* ---- dashboard ---- */
  const pano = el("div", { sinif: "yigin" }, [el("div", { sinif: "yazi--sessiz", yazi: "Reading referral activity from Arc…" })]);
  kap.append(panel("Your referrals", pano));
  kap.append(kurallar(oranBps, bekleme));
  panoCiz(pano, { ben, durum, odeme, cuzdan }).catch((e) => pano.replaceChildren(bos("Could not compute", hataMetni(e))));
  return kap;
}

async function panoCiz(pano, { ben, durum, odeme, cuzdan }) {
  const v = await zincirVerisi();
  const k = ben.toLowerCase();
  const benim = v.oduller.get(k) || { odul: 0n, hacim: 0n, platform: 0n, gelistirme: 0n, pazarlama: 0n, davetli: new Set(), aktif: new Set(), adet: 0 };
  const [guncel, etkin, odenen, kasa, borc] = await Promise.all([
    odeme.guncel(), odeme.etkinKok(), odeme.odenen(ben), arcOkur().call({ to: "0x3600000000000000000000000000000000000000", data: "0x70a08231" + H.DAVET.odeme.slice(2).toLowerCase().padStart(64, "0") }).then(BigInt), odeme.borc()
  ]);
  const ozet = el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Invited wallets", String(durum.davetli), benim.aktif.size + " active"),
    olcum("Their volume", usd(benim.hacim), "after linking"),
    olcum("Dev + marketing fees from them", usdTam(benim.platform), "development " + usdTam(benim.gelistirme) + " · marketing " + usdTam(benim.pazarlama)),
    olcum("Earned so far", usdTam(benim.odul), "computed live to block " + v.sonBlok.toLocaleString("en-US")),
    olcum("Claimed", usdTam(odenen))
  ]);
  pano.replaceChildren(ozet);

  /* the published root, recomputed here */
  const kokKap = el("div", { sinif: "yigin yigin--sik" });
  pano.append(kokKap);
  const kokVar = !/^0x0{64}$/i.test(etkin.kok);
  const bekleyenVar = !/^0x0{64}$/i.test(guncel[0]) && Number(guncel[2]) * 1000 > Date.now();
  if (!kokVar && !bekleyenVar) {
    kokKap.append(not("No reward root is published yet. Earnings above are what the program computes from Arc today; they become claimable once the daily root that includes them is published and its wait has passed."));
  }
  if (bekleyenVar) kokKap.append(not("A new root (up to block " + Number(guncel[1]).toLocaleString("en-US") + ", total " + usdTam(guncel[3]) + ") becomes claimable " + new Date(Number(guncel[2]) * 1000).toLocaleString() + "."));
  if (kokVar) {
    const yeniden = H.hepsiniHesapla(v.loglar, Number(etkin.sonBlok));
    const uyar = yeniden.agac.kok && yeniden.agac.kok.toLowerCase() === etkin.kok.toLowerCase() && yeniden.agac.toplam === BigInt(etkin.toplam);
    kokKap.append(el("div", { sinif: "yazi--kucuk" }, [
      el("span", { sinif: "etiket " + (uyar ? "etiket--alis" : "etiket--uyari"), yazi: uyar ? "ROOT VERIFIED" : "ROOT DIFFERS" }),
      " Claimable root covers activity up to block " + Number(etkin.sonBlok).toLocaleString("en-US") + ", total " + usdTam(etkin.toplam) + ". " +
      (uyar ? "This page recomputed it from Arc logs and got the same root." : "This page's recomputation gives a different root; claims below use the published root only if your own leaf is in it.")
    ]));
    const kanit = yeniden.agac.kanit(ben);
    if (kanit && uyar) {
      const alinir = await odeme.talepEdilebilir(ben, kanit.miktar, kanit.kanit);
      const d = el("div", { sinif: "yazi--kucuk yazi--sessiz", attr: { role: "status" } });
      const b = el("button", { sinif: "dugme dugme--marka", yazi: "Claim " + usdTam(alinir), attr: { type: "button", disabled: alinir === 0n } });
      b.addEventListener("click", async () => {
        b.disabled = true;
        try { await arcGonder(cuzdan, H.DAVET.odeme, H.veri.talep(ben, kanit.miktar, kanit.kanit), (s) => { d.textContent = s; }); d.textContent = "Paid to your wallet on Arc."; }
        catch (e) { d.textContent = hataMetni(e); b.disabled = false; }
      });
      kokKap.append(el("div", { sinif: "girdi-grup" }, [b]), d);
    } else if (kokVar) kokKap.append(el("div", { sinif: "yazi--kucuk yazi--sessiz", yazi: "Nothing for this wallet in the claimable root." }));
  }
  kokKap.append(el("div", { sinif: "yazi--kucuk yazi--sessiz", yazi: "Reward pot: " + usdTam(kasa) + " held, " + usdTam(borc) + " owed to published totals." }));

  /* invitees */
  const liste = [...v.baglar].filter(([, b]) => b.davetci === k);
  if (!liste.length) { pano.append(bos("No invitees yet", "Share your link: wallets that link to you appear here.")); return; }
  const hacimOf = new Map();
  for (const e of v.etkinlikler) { const b = v.baglar.get(e.cuzdan); if (b && b.davetci === k && e.blok > b.blok) hacimOf.set(e.cuzdan, (hacimOf.get(e.cuzdan) || 0n) + e.hacim); }
  const t = el("table", { sinif: "tablo" });
  t.append(el("thead", {}, [el("tr", {}, ["Wallet", "Linked at block", "Volume since"].map((x) => el("th", { yazi: x })))]));
  const g = el("tbody");
  for (const [a, b] of liste.sort((x, y) => y[1].blok - x[1].blok).slice(0, 100)) g.append(el("tr", {}, [el("td", {}, [adres(a)]), el("td", { yazi: b.blok.toLocaleString("en-US") }), el("td", { yazi: usd(hacimOf.get(a) || 0n) })]));
  t.append(g);
  pano.append(el("div", { sinif: "tablo-sarmal" }, [t]));
}
