/* ===========================================================================
 * designs/js/pazar.js — the Designs market v3 on the site (TasarimPazar3)
 *
 *   pazarKutusu   design page: the live auction (Bid / Settle), the USDC
 *                 resale listing (Buy), offers (Make offer / Accept /
 *                 Withdraw / Return expired), the holder's List for resale /
 *                 Start auction, and the market sale waiting for the file key
 *                 (Deliver / Open / Confirm / Dispute / Refund / Release)
 *   bolusKutusu   design page and Publish: the designer's co-designer split
 *                 (up to 5 payees, shares in %, optional lock)
 *   pazarSayfasi  #/market: live auctions and listings, the wallet's balance
 *                 (Withdraw), its offers and the sales waiting for its key
 *
 * Contract and calldata: docs/js/designs/pazar3.js. Until it is deployed
 * (PAZAR3_VAR false) every box says "opens soon". Nothing is stored; every
 * action is a transaction from the visitor's own wallet on Arc.
 * =========================================================================== */
import { parseUnits, keccak256 } from "../../vendor/ethers.min.js";
import { el, temizle, S, usd, kisa, esit, tarih, isim, eylem, durumSatiri, hesapIste, bosKutu, karo } from "./ortak.js";
import * as P from "../../js/designs/pazar3.js";

export const PAZAR3_ADRES = P.PAZAR3.adres;
const hata = P.hataAcikla;
const ek = (yazi, f, sinif, d) => eylem(yazi, f, sinif, d, hata);
const yuzde = (bps) => (bps / 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";
const sureYaz = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const g = Math.floor(s / 86400), sa = Math.floor((s % 86400) / 3600), dk = Math.floor((s % 3600) / 60);
  return g ? g + "d " + sa + "h" : sa ? sa + "h " + dk + "m" : dk ? dk + "m " + (s % 60) + "s" : s + "s";
};
const usdGirdi = (yer, deger) => el("input", { sinif: "girdi", attr: { type: "number", min: "0.1", step: "0.01", inputmode: "decimal", placeholder: yer, "aria-label": yer, ...(deger ? { value: deger } : {}) } });
const usdOku = (g, ad) => {
  const v = String(g.value || "").trim();
  if (!(Number(v) > 0)) throw new Error("Enter " + ad + " in USDC.");
  return parseUnits(v, 6);
};
const yenile = (ms = 2200) => setTimeout(() => location.reload(), ms);

/** The buyer's key must be registered in TasarimNFT2 (the seller delivers the file key to it). */
async function anahtarGarantile(cuzdan, yaz) {
  const a = await S.anahtarOku(cuzdan.hesap()).catch(() => "0x");
  if (a && a !== "0x") return;
  const T = await import("../../js/designs/teslim.js");
  yaz("Sign once to derive your unlock key; it is registered on Arc so the seller can deliver the file key to you.");
  const { pub } = await T.benimAnahtarim(cuzdan);
  await S.gonder({ cuzdan, data: S.veri.anahtarKaydet(pub), durum: yaz, aciklama: "Confirm registering your unlock key" });
}

/** The fee lines shown before a sale. */
function payNotu(ay, fiyat, ilk) {
  const p = P.paylar(fiyat, ilk, ay);
  return el("div", { sinif: "dz-pazar__pay" }, [
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: ilk ? "To the designer (and co-designers)" : "To the seller" }), el("span", { yazi: usd(p.net) })]),
    ilk ? null : el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Designer royalty (" + yuzde(ay.telifBps) + ")" }), el("span", { yazi: usd(p.telif) })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Platform fee (" + yuzde(ay.ucretBps) + ": ARCP burn, dev fund, marketing, owner)" }), el("span", { yazi: usd(p.yakim + p.gelistirme + p.pazarlama + p.sahip) })])]);
}

/* =================================================================== design page */
export async function pazarKutusu({ cuzdan, t, meta }) {
  const kutu = el("section", { sinif: "ds-kutu dz-pazar", attr: { "aria-label": "Market" } }, [
    el("div", { sinif: "dz-pazar__baslik" }, [el("h3", { yazi: "Market" }), el("a", { sinif: "ds-cihaz", attr: { href: "#/market" }, yazi: "Live auctions →" })])]);
  if (!P.PAZAR3_VAR) { kutu.append(el("div", { sinif: "ds-cihaz", yazi: "Offers, auctions and USDC resale open soon." })); return kutu; }
  let ay, dm;
  try { [ay, dm] = await Promise.all([P.ayarlar(), P.durum(t.id)]); }
  catch (e) { kutu.append(el("div", { sinif: "ds-durum ds-durum--hata", yazi: "Could not read the market: " + ((e && e.message) || e) })); return kutu; }
  const ben = cuzdan.hesap();
  const sahibim = esit(t.sahip, ben);
  const ilk = (satici) => esit(satici, t.tasarimci);
  const d = durumSatiri();

  if (dm.satis) kutu.append(await satisBolumu({ cuzdan, t, meta, s: dm.satis, d }));

  /* ---- auction ---- */
  if (dm.muzayede) {
    const m = dm.muzayede, bitti = Date.now() >= m.bitis;
    const sayac = el("span", { sinif: "dz-pazar__sayac", attr: { "data-bitis": String(m.bitis) }, yazi: bitti ? "ended" : sureYaz(m.bitis - Date.now()) + " left" });
    if (!bitti) { const iv = setInterval(() => { if (!sayac.isConnected) return clearInterval(iv); const k = m.bitis - Date.now(); sayac.textContent = k <= 0 ? "ended" : sureYaz(k) + " left"; }, 1000); }
    const blok = el("div", { sinif: "dz-pazar__blok" }, [
      el("div", { sinif: "dz-pazar__ust" }, [el("span", { sinif: "ds-rozet", yazi: "Auction" }), sayac]),
      el("div", { sinif: "ds-buyuk-fiyat", yazi: m.enYuksek ? usd(m.teklif) + " USDC" : usd(m.rezerv) + " USDC reserve" }),
      el("div", { sinif: "ds-satir" }, [el("span", { yazi: m.enYuksek ? "Highest bid" : "No bids yet" }), m.enYuksek ? (esit(m.enYuksek, ben) ? el("span", { yazi: "you" }) : isim(m.enYuksek)) : el("span", { yazi: "—" })]),
      el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Seller" }), esit(m.satici, ben) ? el("span", { yazi: "you" }) : isim(m.satici)]),
      el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Ends" }), el("span", { yazi: tarih(m.bitis) })])]);
    if (!bitti && !esit(m.satici, ben)) {
      const asgari = await P.asgariPey(t.id).catch(() => m.rezerv);
      const g = usdGirdi("Your bid in USDC", (Number(asgari) / 1e6).toFixed(2));
      blok.append(el("div", { sinif: "dz-pazar__satir" }, [g, ek("Bid", async (yaz) => {
        await hesapIste();
        const miktar = usdOku(g, "a bid");
        await anahtarGarantile(cuzdan, yaz);
        await P.usdcOnayGerekirse({ cuzdan, miktar, durum: yaz });
        await P.gonder({ cuzdan, data: P.veri.pey(t.id, miktar), durum: yaz, aciklama: "Confirm your bid of " + usd(miktar) });
        yaz("Bid placed. If someone outbids you, your USDC waits in your market balance (Withdraw on the Market page).", "ok"); yenile();
      }, "dugme dugme--marka", d)]),
      el("div", { sinif: "ds-cihaz", yazi: "Minimum now " + usd(asgari) + " (step " + yuzde(m.adimBps) + "). A bid in the last " + Math.round(ay.uzatmaPenceresi / 60) + " minutes extends the end by " + Math.round(ay.uzatmaSuresi / 60) + " minutes." }));
    }
    if (bitti) blok.append(ek(m.enYuksek ? "Settle the auction" : "Close the auction (no bids: back to the seller)", async (yaz) => {
      await hesapIste();
      await P.gonder({ cuzdan, data: P.veri.muzayedeKapat(t.id), durum: yaz });
      yaz(m.enYuksek ? "Settled. The winning bid waits in escrow until the seller delivers the file key." : "Closed; the design went back to the seller.", "ok"); yenile();
    }, "dugme dugme--marka", d));
    if (!bitti && esit(m.satici, ben) && !m.enYuksek) blok.append(ek("Cancel the auction", async (yaz) => {
      await P.gonder({ cuzdan, data: P.veri.muzayedeIptal(t.id), durum: yaz }); yaz("Cancelled; the design is back with you.", "ok"); yenile();
    }, "dugme", d));
    kutu.append(blok);
  }

  /* ---- fixed-price resale listing ---- */
  if (dm.ilan) {
    const i = dm.ilan, gecerli = esit(t.sahip, i.satici);
    const blok = el("div", { sinif: "dz-pazar__blok" }, [
      el("div", { sinif: "dz-pazar__ust" }, [el("span", { sinif: "ds-rozet", yazi: "Buy now in USDC" })]),
      el("div", { sinif: "ds-buyuk-fiyat", yazi: usd(i.fiyat) + " USDC" }),
      el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Seller" }), esit(i.satici, ben) ? el("span", { yazi: "you" }) : isim(i.satici)]), payNotu(ay, i.fiyat, ilk(i.satici))]);
    if (!gecerli) blok.append(el("div", { sinif: "ds-cihaz", yazi: "This listing went stale (the design moved)." }), ek("Remove the stale listing", async (yaz) => { await hesapIste(); await P.gonder({ cuzdan, data: P.veri.ilanKaldir(t.id), durum: yaz }); yaz("Removed.", "ok"); yenile(); }, "dugme", d));
    else if (esit(i.satici, ben)) blok.append(ek("Remove listing", async (yaz) => { await P.gonder({ cuzdan, data: P.veri.ilanKaldir(t.id), durum: yaz }); yaz("Listing removed.", "ok"); yenile(); }, "dugme", d));
    else blok.append(ek("Buy for " + usd(i.fiyat), async (yaz) => {
      await hesapIste();
      await anahtarGarantile(cuzdan, yaz);
      await P.usdcOnayGerekirse({ cuzdan, miktar: i.fiyat, durum: yaz });
      await P.gonder({ cuzdan, data: P.veri.satinAl(t.id, i.fiyat), durum: yaz, aciklama: "Confirm the purchase (" + usd(i.fiyat) + " USDC)" });
      yaz("Bought. Your payment waits in escrow until the seller delivers the file key to you.", "ok"); yenile();
    }, "dugme dugme--marka", d));
    kutu.append(blok);
  }

  /* ---- offers ---- */
  const tekBlok = el("div", { sinif: "dz-pazar__blok" }, [el("div", { sinif: "dz-pazar__ust" }, [el("span", { sinif: "ds-rozet", yazi: "Offers" }), el("span", { sinif: "ds-cihaz", yazi: dm.teklifler.length ? dm.teklifler.length + " open" : "none yet" })])]);
  for (const o of dm.teklifler) {
    const doldu = Date.now() > o.bitis;
    const satir = el("div", { sinif: "dz-pazar__teklif" }, [el("b", { yazi: usd(o.miktar) }), esit(o.alici, ben) ? el("span", { yazi: "you" }) : isim(o.alici),
      el("span", { sinif: "ds-cihaz", yazi: doldu ? "expired" : "until " + tarih(o.bitis) })]);
    if (sahibim && !doldu && !esit(o.alici, ben)) satir.append(ek("Accept", async (yaz) => {
      await P.nftOnayGerekirse({ cuzdan, id: t.id, durum: yaz });
      await P.gonder({ cuzdan, data: P.veri.teklifKabul(o.tid, o.miktar), durum: yaz, aciklama: "Confirm accepting " + usd(o.miktar) });
      yaz("Accepted. Deliver the file key to the buyer now; you are paid when they confirm or their window passes.", "ok"); yenile();
    }, "dugme dugme--marka dugme--kucuk", d));
    if (esit(o.alici, ben) || doldu) satir.append(ek(esit(o.alici, ben) ? "Withdraw" : "Return to the buyer", async (yaz) => {
      await hesapIste();
      await P.gonder({ cuzdan, data: P.veri.teklifGeriCek(o.tid), durum: yaz }); yaz("The offer's USDC went back to the buyer.", "ok"); yenile();
    }, "dugme dugme--kucuk", d));
    tekBlok.append(satir);
  }
  if (t.sahip && !sahibim && !esit(t.sahip, P.PAZAR3.adres)) {
    const g = usdGirdi("Offer in USDC");
    const sure = el("select", { sinif: "girdi", attr: { "aria-label": "Offer valid for" } }, [["1 day", 86400], ["3 days", 3 * 86400], ["7 days", 7 * 86400], ["30 days", 30 * 86400]]
      .filter(([, s]) => s <= ay.teklifAzamiSure).map(([a, s]) => el("option", { attr: { value: String(s) }, yazi: a })));
    tekBlok.append(el("div", { sinif: "dz-pazar__satir" }, [g, sure, ek("Make offer", async (yaz) => {
      await hesapIste();
      const miktar = usdOku(g, "an offer");
      await anahtarGarantile(cuzdan, yaz);
      await P.usdcOnayGerekirse({ cuzdan, miktar, durum: yaz });
      await P.gonder({ cuzdan, data: P.veri.teklifVer(t.id, miktar, Number(sure.value)), durum: yaz, aciklama: "Confirm your offer of " + usd(miktar) + " (held by the contract)" });
      yaz("Offer made. Your USDC is held by the contract; withdraw it any time before the holder accepts.", "ok"); yenile();
    }, "dugme dugme--marka", d)]), el("div", { sinif: "ds-cihaz", yazi: "Your USDC is escrowed in the contract, not sent to the holder. Withdraw any time before acceptance; after it expires anyone can return it to you." }));
  }
  kutu.append(tekBlok);

  /* ---- the holder: list or auction ---- */
  if (sahibim && !dm.satis) {
    const fiyat = usdGirdi("Price in USDC");
    const rezerv = usdGirdi("Reserve in USDC");
    const sure = el("select", { sinif: "girdi", attr: { "aria-label": "Auction length" } }, [["1 hour", 3600], ["1 day", 86400], ["3 days", 3 * 86400], ["7 days", 7 * 86400]]
      .filter(([, s]) => s >= ay.muzayedeAsgari && s <= ay.muzayedeAzami).map(([a, s]) => el("option", { attr: { value: String(s) }, yazi: a })));
    const adim = el("select", { sinif: "girdi", attr: { "aria-label": "Minimum bid step" } }, [500, 1000, 2000].filter((b) => b >= ay.asgariAdimBps).map((b) => el("option", { attr: { value: String(b) }, yazi: "step " + yuzde(b) })));
    kutu.append(el("div", { sinif: "dz-pazar__blok" }, [el("div", { sinif: "dz-pazar__ust" }, [el("span", { sinif: "ds-rozet", yazi: "Sell on the market" })]),
      el("div", { sinif: "dz-pazar__satir" }, [fiyat, ek(dm.ilan ? "Change price" : "List for resale", async (yaz) => {
        const f = usdOku(fiyat, "a price");
        await P.nftOnayGerekirse({ cuzdan, id: t.id, durum: yaz });
        await P.gonder({ cuzdan, data: P.veri.ilanVer(t.id, f), durum: yaz, aciklama: "Confirm listing at " + usd(f) });
        yaz("Listed at " + usd(f) + ". The design stays with you until someone buys.", "ok"); yenile();
      }, "dugme dugme--marka", d)]),
      el("div", { sinif: "dz-pazar__satir" }, [rezerv, sure, adim, ek("Start auction", async (yaz) => {
        const r = usdOku(rezerv, "a reserve");
        await P.nftOnayGerekirse({ cuzdan, id: t.id, durum: yaz });
        await P.gonder({ cuzdan, data: P.veri.muzayedeBaslat(t.id, r, Number(sure.value), Number(adim.value)), durum: yaz, aciklama: "Confirm the auction (reserve " + usd(r) + ")" });
        yaz("Auction started. The contract holds the design until it ends; with no bids it comes back.", "ok"); yenile();
      }, "dugme", d)]),
      el("div", { sinif: "ds-cihaz", yazi: (ilk(ben) ? "First sale: you receive the price minus the " + yuzde(ay.ucretBps) + " platform fee, split with your co-designers if you set any." : "Resale: " + yuzde(ay.telifBps) + " goes to the designer as a royalty and " + yuzde(ay.ucretBps) + " is the platform fee.") +
        " Buyers pay in USDC on Arc; every sale waits in escrow until you deliver the file key. Approval is per design (TasarimNFT2.approve)." })]));
  }
  kutu.append(d);
  const gecmis = el("details", { sinif: "dz-pazar__gecmis" }, [el("summary", { yazi: "Market history" }), el("div", { sinif: "ds-cihaz", yazi: "Reading…" })]);
  gecmis.addEventListener("toggle", () => {
    if (!gecmis.open || gecmis._okundu) return;
    gecmis._okundu = true;
    P.gecmis(t.id).then((o) => gecmis.lastChild.replaceWith(el("div", { sinif: "ds-gecmis" }, o.length ? o.map((x) => el("div", { sinif: "ds-gecmis__oge" }, [el("span", { yazi: gecmisYazi(x) }),
      el("a", { attr: { href: S.TASARIM.kasif + "/tx/" + x.tx, target: "_blank", rel: "noopener" }, yazi: "block " + x.blok + " ↗" })])) : [el("div", { yazi: "No market events yet." })])))
      .catch((e) => gecmis.lastChild.replaceWith(el("div", { sinif: "ds-durum ds-durum--hata", yazi: "Could not read the market history: " + ((e && e.message) || e) })));
  });
  kutu.append(gecmis);
  return kutu;
}

/** The buyer's key the sale was made with (current or an earlier one with the same hash). */
async function satisAnahtari(s) {
  const simdi = await S.anahtarOku(s.alici);
  if (simdi && simdi !== "0x" && keccak256(simdi) === s.aliciAnahtarHash) return simdi;
  for (const a of await S.anahtarGecmisi(s.alici)) if (keccak256(a) === s.aliciAnahtarHash) return a;
  throw new Error("Could not find the key the buyer registered for this sale.");
}

/** teslimEt calldata for a market sale of design `t` (the connected wallet is the seller). */
async function teslimVerisi(cuzdan, t, s, yaz) {
  const T = await import("../../js/designs/teslim.js");
  const Sf = await import("../../js/designs/sifre.js");
  const k = await T.dosyaAnahtariBul(cuzdan, t, null, yaz);
  const zarf = await Sf.sarIkili(k, await satisAnahtari(s), s.alici, t.dosyaHash);
  return P.veri.teslimEt(t.id, zarf);
}

async function satisBolumu({ cuzdan, t, meta, s, d }) {
  const ben = cuzdan.hesap();
  const simdi = Date.now();
  const tur = { 1: "resale", 2: "accepted offer", 3: "auction" }[s.tur] || "sale";
  const blok = el("div", { sinif: "dz-pazar__blok dz-pazar__blok--satis" }, [el("div", { sinif: "dz-pazar__ust" }, [el("span", { sinif: "ds-rozet ds-rozet--uyari", yazi: "Market sale in escrow" }), el("span", { sinif: "ds-cihaz", yazi: tur + " · " + usd(s.fiyat) })])]);
  const gonderF = (data, msj) => async (yaz) => { await hesapIste(); await P.gonder({ cuzdan, data, durum: yaz }); yaz(msj, "ok"); yenile(); };
  if (s.durum === 1) {
    blok.append(el("div", { yazi: (esit(s.alici, ben) ? "You bought it. " : "Bought by " + kisa(s.alici) + ". ") + "Waiting for the seller to deliver the file key until " + tarih(s.teslimSonu) + "; the market holds the design and the payment." }));
    if (esit(s.satici, ben)) blok.append(ek("Deliver the file key", async (yaz) => {
      await P.gonder({ cuzdan, data: await teslimVerisi(cuzdan, t, s, yaz), durum: yaz, aciklama: "Confirm delivering the key" });
      yaz("Delivered. You are paid when the buyer confirms or their window passes.", "ok"); yenile();
    }, "dugme dugme--marka", d));
    if (simdi > s.teslimSonu) blok.append(ek("Refund the buyer (no key in time)", gonderF(P.veri.iadeEt(t.id), "Refunded to the buyer's market balance; the design went back to the seller."), "dugme", d));
  } else if (s.durum === 2) {
    blok.append(el("div", { yazi: "The seller delivered the file key. " + (esit(s.alici, ben) ? "Open the file and confirm, or say the key does not work until " + tarih(s.itirazSonu) + "." : "The buyer can dispute it until " + tarih(s.itirazSonu) + ".") }));
    if (esit(s.alici, ben)) blok.append(el("div", { sinif: "ds-dugmeler" }, [
      ek("Open the file", async (yaz) => {
        const T = await import("../../js/designs/teslim.js");
        const Sf = await import("../../js/designs/sifre.js");
        const { sha256Hex } = await import("../../js/designs/parmakizi.js");
        const { baytAl } = await import("../../js/designs/meta.js");
        const k = await T.dosyaAnahtariBul(cuzdan, t, meta, yaz);
        const f = meta && meta.arcpulse && meta.arcpulse.file;
        if (!f || !f.uri) return yaz("The key matches the designer's commitment; this design's metadata names no file to download.", "ok");
        yaz("The key matches the designer's commitment. Downloading the encrypted file…");
        const acik = await Sf.dosyaCoz(await baytAl(f.uri), k);
        if ((await sha256Hex(acik)).toLowerCase() !== t.dosyaHash.toLowerCase()) throw new Error("The file does not match the hash on chain. Say the key doesn't work.");
        const url = URL.createObjectURL(new Blob([acik], { type: f.mime || "application/octet-stream" }));
        const a = el("a", { attr: { href: url, download: f.name || ("design-" + t.id) } });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        yaz("Opened and verified against the on-chain hash. If it is right, confirm.", "ok");
      }, "dugme dugme--marka", d),
      ek("I received it", gonderF(P.veri.teslimAldim(t.id), "Confirmed. The seller is paid (after the copy window, if still open) and the design moves to you."), "dugme", d),
      simdi <= s.itirazSonu ? ek("The key doesn't work", gonderF(P.veri.anahtarItiraz(t.id), "Disputed. The payment is frozen until the admin (later the DAO) decides."), "dugme", d) : null]));
    if (simdi > s.itirazSonu) blok.append(ek("Release the payment", gonderF(P.veri.serbestBirak(t.id), "Released: the payouts are in the payees' market balances and the design moved to the buyer."), "dugme", d));
  } else if (s.durum === 3) {
    blok.append(el("div", { yazi: "The buyer said the key does not work. The payment is frozen until the admin (later the DAO) refunds the buyer or pays the seller." }));
  } else if (s.durum === 4) {
    const pencere = Date.now() <= t.itirazBitis;
    blok.append(el("div", { yazi: "The buyer confirmed the file. " + (t.itiraz ? "A copy challenge is open; the payment waits for it." : pencere ? "The payment is released after the copy-challenge window (" + tarih(t.itirazBitis) + ")." : "The payment can be released now.") }));
    if (!pencere && !t.itiraz) blok.append(ek("Release the payment", gonderF(P.veri.serbestBirak(t.id), "Released."), "dugme", d));
  }
  if (!t.sahip) blok.append(ek("Refund the buyer (design taken down)", gonderF(P.veri.yanmisIade(t.id), "Refunded to the buyer's market balance."), "dugme", d));
  return blok;
}

/* =================================================================== co-designer split */
export async function bolusKutusu({ cuzdan, id, baslik }) {
  const kutu = el("div", { sinif: "ds-kutu dz-bolus" }, [el("h3", { yazi: baslik || "Co-designers" })]);
  if (!P.PAZAR3_VAR) { kutu.append(el("div", { sinif: "ds-cihaz", yazi: "Co-designer splits open soon." })); return kutu; }
  const d = durumSatiri();
  const b = await P.durum(id).then((x) => x.bolus).catch(() => ({ alicilar: [], bpsler: [], kilitli: false }));
  kutu.append(el("p", { sinif: "ds-lisans", yazi: "Up to 5 wallets share this design's market payouts: the first sale on the market and the royalty on every resale. Shares must add up to 100%; rounding dust goes to the first wallet. Without a split everything goes to the designer." }));
  const satirlar = el("div", { sinif: "dz-bolus__satirlar" });
  const satirEkle = (a = "", bps = "") => {
    if (satirlar.children.length >= 5) return;
    const adr = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "0x… wallet", "aria-label": "Payee wallet", spellcheck: "false", value: a } });
    const pay = el("input", { sinif: "girdi dz-bolus__pay", attr: { type: "number", min: "0.01", max: "100", step: "0.01", placeholder: "%", "aria-label": "Share in percent", value: bps === "" ? "" : String(bps / 100) } });
    const sil = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", "aria-label": "Remove payee" }, yazi: "✕", on: { click: () => satir.remove() } });
    const satir = el("div", { sinif: "dz-bolus__satir" }, [adr, pay, b.kilitli ? null : sil]);
    if (b.kilitli) { adr.disabled = true; pay.disabled = true; }
    satirlar.append(satir);
  };
  b.alicilar.forEach((a, i) => satirEkle(a, b.bpsler[i]));
  if (!b.alicilar.length) satirEkle(cuzdan.hesap() || "", 10000);
  kutu.append(satirlar);
  const oku = () => {
    const al = [], bp = [];
    for (const s of satirlar.children) {
      const [a, p] = s.querySelectorAll("input");
      if (!a.value.trim() && !p.value.trim()) continue;
      al.push(a.value.trim()); bp.push(Math.round(Number(p.value) * 100));
    }
    return [al, bp];
  };
  if (b.kilitli) kutu.append(el("div", { sinif: "ds-rozet ds-rozet--ok", yazi: "Locked for good" }));
  else kutu.append(el("div", { sinif: "ds-dugmeler" }, [
    el("button", { sinif: "dugme dugme--kucuk", attr: { type: "button" }, yazi: "+ Add payee", on: { click: () => satirEkle() } }),
    ek("Save split", async (yaz) => {
      await hesapIste();
      const [al, bp] = oku();
      const h = P.bolusDenetle(al, bp);
      if (h) throw new Error(h);
      await P.gonder({ cuzdan, data: P.veri.bolusAyarla(id, al, bp), durum: yaz, aciklama: "Confirm the split (" + al.length + " payees)" });
      yaz("Saved on Arc.", "ok");
    }, "dugme dugme--marka", d),
    ek("Lock for good", async (yaz) => {
      await hesapIste();
      if (!confirm("Lock this split for good? Nobody, you included, can change it afterwards.")) return;
      await P.gonder({ cuzdan, data: P.veri.bolusKilitle(id), durum: yaz }); yaz("Locked.", "ok"); yenile();
    }, "dugme", d)]));
  kutu.append(d);
  return kutu;
}

/** Publish page: pick one of your designs and record its co-designers. */
export async function yayinBolusu({ cuzdan }) {
  const kap = el("section", { sinif: "ds-kutu dz-bolus-yayin" }, [el("h3", { yazi: "Co-designers (after publishing)" }),
    el("p", { sinif: "ds-lisans", yazi: "Made it with others? Once your design is published, record up to 5 co-designer wallets and their shares. The market pays the first sale and every resale royalty to them automatically." })]);
  if (!P.PAZAR3_VAR) { kap.append(el("div", { sinif: "ds-cihaz", yazi: "Opens soon." })); return kap; }
  const ben = cuzdan.hesap();
  if (!ben) { kap.append(el("div", { sinif: "ds-cihaz", yazi: "Connect your wallet to pick one of your designs." })); return kap; }
  const benim = (await S.yayinlar().catch(() => [])).filter((x) => esit(x.tasarimci, ben));
  if (!benim.length) { kap.append(el("div", { sinif: "ds-cihaz", yazi: "No published designs from this wallet yet. Publish above, then come back here." })); return kap; }
  const sec = el("select", { sinif: "girdi", attr: { "aria-label": "Your design" } }, benim.map((x) => el("option", { attr: { value: String(x.id) }, yazi: "Design #" + x.id })));
  const yer = el("div");
  const goster = async () => { temizle(yer); yer.append(await bolusKutusu({ cuzdan, id: Number(sec.value), baslik: "Split for design #" + sec.value })); };
  sec.addEventListener("change", goster);
  kap.append(sec, yer);
  await goster();
  return kap;
}

/* =================================================================== #/market */
export async function pazarSayfasi({ cuzdan }) {
  document.title = "Market · ARC PULSE Designs";
  const kap = el("div", { sinif: "dz-pazar-sayfa" }, [el("h1", { sinif: "dz-sayfa-baslik", yazi: "Market" }),
    el("p", { sinif: "ds-cihaz", yazi: "Live auctions and USDC resale on Arc. Every sale waits in escrow until the seller delivers the file key to the buyer; payouts land in a market balance you withdraw." })]);
  if (!P.PAZAR3_VAR) { kap.append(bosKutu("The market opens soon", "Offers, timed auctions and USDC resale arrive with the market contract.")); return kap; }
  const ben = cuzdan.hesap();
  const [ay, acik] = await Promise.all([P.ayarlar(), P.acikIlanlar()]);
  if (ben) kap.append(await benimBolumum({ cuzdan, ay }));
  const tum = await S.yayinlar().catch(() => []);
  const bul = (id) => tum.find((x) => x.id === id) || { id, uri: "" };
  const izgara = (liste, alt) => liste.length ? el("div", { sinif: "dz-izgara" }, liste.map((x) => { const k = karo(bul(x.id), null, null); k.append(el("div", { sinif: "dz-pazar__karo-alt", yazi: alt(x) })); return k; })) : el("div", { sinif: "ds-cihaz", yazi: "Nothing right now." });
  kap.append(el("h2", { yazi: "Live auctions" }), izgara(acik.muzayedeler, (m) => (m.enYuksek ? usd(m.teklif) : usd(m.rezerv) + " reserve") + " · " + (Date.now() >= m.bitis ? "ended" : sureYaz(m.bitis - Date.now()) + " left")));
  kap.append(el("h2", { yazi: "Buy now in USDC" }), izgara(acik.ilanlar, (i) => usd(i.fiyat) + " · " + kisa(i.satici)));
  kap.append(el("p", { sinif: "ds-cihaz", yazi: "Fees on every market sale: " + yuzde(ay.ucretBps) + " platform fee (ARCP buy-and-burn " + yuzde(ay.yakimBps) + ", developer fund " + yuzde(ay.gelistirmeBps) + ", marketing " + yuzde(ay.pazarlamaBps) + ", owner " + yuzde(ay.sahipBps) + ") and, on resales, a " + yuzde(ay.telifBps) + " royalty to the designer and co-designers. Rates are fixed when a sale starts." }));
  return kap;
}

async function benimBolumum({ cuzdan }) {
  const ben = cuzdan.hesap();
  const d = durumSatiri();
  const [bakiye, tek, bekleyen] = await Promise.all([P.alacak(ben).catch(() => 0n), P.tekliflerim(ben).catch(() => []), P.bekleyenTeslimler(ben).catch(() => [])]);
  const kutu = el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Your market" }),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Balance to withdraw" }), el("b", { yazi: usd(bakiye) + " USDC" })])]);
  if (bakiye > 0n) kutu.append(ek("Withdraw " + usd(bakiye), async (yaz) => { await P.gonder({ cuzdan, data: P.veri.cek(), durum: yaz }); yaz("Withdrawn to your wallet.", "ok"); yenile(); }, "dugme dugme--marka", d));
  if (bekleyen.length) kutu.append(el("div", { sinif: "not not--uyari" }, [el("div", { yazi: bekleyen.length + " of your market sales wait for the file key: " }),
    ...bekleyen.map((x) => el("a", { attr: { href: "#/d/" + x.id }, yazi: "#" + x.id + " (by " + tarih(x.teslimSonu) + ") " }))]));
  if (tek.length) kutu.append(el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Your open offers" }), el("span", {}, tek.map((o) => el("a", { attr: { href: "#/d/" + o.id }, yazi: usd(o.miktar) + " on #" + o.id + " " })))]));
  kutu.append(d);
  return kutu;
}

/* history lines for the design page */
export function gecmisYazi(o) {
  const a = o.args;
  return ({
    IlanVerildi: () => "Market: listed by " + kisa(a.satici) + " for " + usd(a.fiyat),
    IlanKalkti: () => "Market: listing ended",
    TeklifVerildi: () => "Market: offer " + usd(a.miktar) + " by " + kisa(a.alici),
    TeklifKalkti: () => "Market: offer returned to " + kisa(a.alici),
    TeklifKabul: () => "Market: offer " + usd(a.miktar) + " accepted by " + kisa(a.satici),
    MuzayedeBasladi: () => "Market: auction started by " + kisa(a.satici) + ", reserve " + usd(a.rezerv),
    Pey: () => "Market: bid " + usd(a.miktar) + " by " + kisa(a.alici),
    MuzayedeBitti: () => "Market: auction ended" + (/^0x0{40}$/i.test(a.kazanan) ? " with no bids" : ", won by " + kisa(a.kazanan) + " at " + usd(a.miktar)),
    MuzayedeIptal: () => "Market: auction cancelled",
    Emanete: () => "Market: sold to " + kisa(a.alici) + " for " + usd(a.fiyat) + " (in escrow)",
    TeslimEdildi: () => "Market: file key delivered to " + kisa(a.alici),
    TeslimAlindi: () => "Market: buyer confirmed the file",
    AnahtarItirazi: () => "Market: buyer said the key does not work",
    SatisKapandi: () => (a.saticiyaOdendi ? "Market: payment released, seller " : "Market: refunded to ") + kisa(a.kime),
    Dagitildi: () => "Market: paid out (royalty " + usd(a.telif) + ")"
  }[o.ad] || (() => "Market: " + o.ad))();
}
