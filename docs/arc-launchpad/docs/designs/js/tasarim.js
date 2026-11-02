/* ===========================================================================
 * designs/js/tasarim.js — one design (TasarimNFT2)
 *
 * Big preview (a carousel when the metadata has more images, galeri.js),
 * its category, designer and owner, price in USDC and in the designer token
 * (30-minute TWAP), likes, Buy (with the designer token, or with Arc USDC
 * swapped into it: al / alUsdc, the buyer's unlock key registered in the
 * same call), the v2 delivery states (deliver / open / confirm / dispute /
 * refund / release, from the main app's teslim.js), listing for the
 * holder, the stake, the history from the events, the license, and below
 * the comments with a Report button (yorumlar.js, YorumKaydi; "Comments
 * open soon" until it is deployed).
 * Payment is on Arc (USDC or the designer token, which the main app's
 * trade page sells from 12 chains); copy challenges stay on the main
 * app's design page.
 * =========================================================================== */
import { parseUnits } from "../../vendor/ethers.min.js";
import { el, temizle, S, SO, ANA, usd, kisa, esit, tarih, jetonYaz, avatar, isim, resimKutusu, begeniDugmesi, takipDugmesi, eylem, durumSatiri, bosKutu, hesapIste, gorunurler } from "./ortak.js";
import { metaOku, baytAl, kategoriOf, kategoriAdi } from "../../js/designs/meta.js";
import { galeri } from "./galeri.js";
import { yorumBolumu, bildirDugmesi } from "./yorumlar.js";

export async function tasarimSayfasi({ cuzdan }, id) {
  const kap = el("div", { sinif: "dz-tasarim-sayfa" });
  const [t, ay] = await Promise.all([S.tasarimOku(id).catch(() => null), S.ayarlar().catch(() => null)]);
  if (!t) { kap.append(bosKutu("No such design", "Design #" + id + " has not been published.", el("a", { sinif: "dugme", attr: { href: "#/explore" }, yazi: "Explore designs" }))); return kap; }
  if (!(await gorunurler([t])).length) { kap.append(bosKutu("This design is hidden", "The designer's profile was hidden by the moderator after a report. The record stays on Arc.")); return kap; }
  const ben = cuzdan.hesap();
  const [j, meta] = await Promise.all([S.jetonBilgi(t.token).catch(() => ({ sembol: null, ondalik: 18 })), metaOku(t.uri).catch(() => null)]);
  const sym = j.sembol || "designer token";
  const symL = j.sembol ? "$" + j.sembol : "the designer token";
  const ad = meta && meta.name ? String(meta.name).slice(0, 120) : "Design #" + id;
  document.title = ad + " · ARC PULSE Designs";

  /* one preview, or a carousel when the metadata has more images (meta.js gorseller) */
  const sol = el("div", { sinif: "dz-tasarim__sol" }, [meta ? galeri(meta, t.uri, ad) : resimKutusu(t.uri, "dz-tasarim__resim", ad)]);
  const yan = el("div", { sinif: "dz-tasarim__yan" });
  yan.append(el("header", { sinif: "dz-tasarim__ust" }, [
    el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + t.tasarimci } }, [avatar(t.tasarimci, 36), el("span", {}, [isim(t.tasarimci), el("span", { sinif: "ds-cihaz", yazi: " · designer" })])]),
    el("span", { attr: { style: "margin-left:auto" } }, [takipDugmesi(cuzdan, t.tasarimci)])]));
  yan.append(el("h1", { sinif: "dz-tasarim__ad", yazi: ad }));
  if (meta) { const k = kategoriOf(meta); yan.append(el("a", { sinif: "dz-kategori", attr: { href: "#/explore?k=" + k, title: "More in this category" }, yazi: kategoriAdi(k) })); }
  if (meta && meta.description) yan.append(el("p", { sinif: "dz-tasarim__aciklama", yazi: String(meta.description).slice(0, 4000) }));
  const pencereAcik = Date.now() <= t.itirazBitis;
  yan.append(el("div", { sinif: "dz-tasarim__eylem" }, [begeniDugmesi(cuzdan, id),
    t.sahip ? null : el("span", { sinif: "ds-rozet ds-rozet--uyari", yazi: "Taken down" }),
    t.itiraz ? el("span", { sinif: "ds-rozet ds-rozet--uyari", yazi: "Challenge open" }) : pencereAcik ? el("span", { sinif: "ds-rozet", attr: { title: "Anyone may challenge a copy until then" }, yazi: "Challenge window until " + tarih(t.itirazBitis) }) : el("span", { sinif: "ds-rozet ds-rozet--ok", yazi: "Original · window closed" }),
    el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button", style: "margin-left:auto" }, yazi: "Copy link", on: { click: async (e) => { try { await navigator.clipboard.writeText(location.href); e.target.textContent = "Copied"; } catch (x) { e.target.textContent = location.href; } } } }),
    bildirDugmesi({ cuzdan }, { nft: S.TASARIM.adres, id, ad: "design #" + id })]));

  if (t.sahip) yan.append(await fiyatKutusu({ cuzdan, t, ay, j, sym }));
  yan.append(el("div", { sinif: "ds-kutu" }, [
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Owner" }), t.sahip ? el("a", { attr: { href: "#/u/" + t.sahip } }, [esit(t.sahip, ben) ? "you" : isim(t.sahip)]) : el("span", { yazi: "none (burned)" })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Designer token" }), el("a", { attr: { href: ANA + "#/merkez?t=" + t.token }, yazi: (j.sembol ? "$" + j.sembol : kisa(t.token)) + " · Trade ↗" })]),
    meta && meta.arcpulse && meta.arcpulse.file ? el("div", { sinif: "ds-satir" }, [el("span", { yazi: "File" }), el("span", { yazi: String(meta.arcpulse.file.name || "file").slice(0, 80) + (meta.arcpulse.file.size ? " · " + Math.ceil(meta.arcpulse.file.size / 1024) + " KB" : "") + " · encrypted" })]) : null,
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Exact file hash" }), el("span", { sinif: "ds-mono", attr: { title: t.dosyaHash }, yazi: t.dosyaHash.slice(0, 18) + "…" })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Token" }), el("a", { attr: { href: S.TASARIM.kasif + "/token/" + S.TASARIM.adres + "?a=" + id, target: "_blank", rel: "noopener" }, yazi: "#" + id + " on " + kisa(S.TASARIM.adres) + " ↗" })])]));

  if (S.SURUM === 2) yan.append(await (await import("../../js/designs/teslim.js")).satisDurumu({ cuzdan, t, meta, ay }));
  if (t.sahip && esit(t.sahip, ben) && !t.satis) yan.append(ilanKutusu({ cuzdan, t, ay }), dosyaKutusu({ cuzdan, t, meta }));
  if (esit(t.tasarimci, ben) && t.teminat > 0n && !pencereAcik && !t.itiraz) {
    const d = durumSatiri();
    yan.append(el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Your stake" }), el("div", { yazi: usd(t.teminat) + " USDC held since publishing; the window is over." }),
      eylem("Take the stake back", async (yaz) => { await hesapIste(); await S.gonder({ cuzdan, data: S.veri.teminatGeriAl(id), durum: yaz }); yaz("Stake returned.", "ok"); }, "dugme", d), d]));
  }
  yan.append(el("details", { sinif: "ds-kutu" }, [el("summary", { yazi: "License" }), el("p", { sinif: "ds-lisans", yazi: (ay && ay.lisans) || S.LISANS_YEDEK }),
    el("div", { sinif: "ds-dugmeler" }, [el("a", { attr: { href: "#/license" }, yazi: "Full license" }),
      t.sahip && pencereAcik && !t.itiraz ? el("a", { attr: { href: ANA + "#/designs/d/" + id }, yazi: "Challenge as a copy (main app) ↗" }) : null])]));

  const gecmis = el("details", { sinif: "ds-kutu" }, [el("summary", { yazi: "History" }), el("div", { sinif: "ds-cihaz", yazi: "Reading…" })]);
  yan.append(gecmis);
  S.gecmis(id).then((o) => { gecmis.lastChild.replaceWith(el("div", { sinif: "ds-gecmis" }, o.length ? o.map((x) => gecmisSatiri(x, j)) : [el("div", { yazi: "No events found." })])); })
    .catch((e) => { gecmis.lastChild.replaceWith(el("div", { sinif: "ds-durum ds-durum--hata", yazi: "Could not read the history: " + ((e && e.message) || e) })); });

  kap.append(el("article", { sinif: "dz-tasarim" }, [sol, yan]));
  kap.append(yorumBolumu({ cuzdan }, t));
  /* more from this designer */
  const digerleri = (await S.yayinlar()).filter((x) => esit(x.tasarimci, t.tasarimci) && x.id !== id).slice(0, 6);
  if (digerleri.length) {
    const { karo } = await import("./ortak.js");
    kap.append(el("section", { sinif: "dz-daha" }, [el("h2", {}, ["More from ", isim(t.tasarimci)]), el("div", { sinif: "dz-izgara" }, digerleri.map((x) => karo(x, null, null)))]));
  }
  return kap;
}

function gecmisSatiri(o, j) {
  const a = o.args;
  const Z = "0x0000000000000000000000000000000000000000";
  const y = {
    Yayinlandi: () => "Published by " + kisa(a.tasarimci),
    IlanVerildi: () => "Listed by " + kisa(a.satici) + " for " + usd(a.fiyat),
    IlanKalkti: () => "Listing ended",
    Satildi: () => "Sold by " + kisa(a.satici) + " to " + kisa(a.alici) + " for " + usd(a.fiyat) + " (" + jetonYaz(a.tokenMiktari, j.ondalik || 18) + " " + (j.sembol || "tokens") + (a.usdcIle ? ", paid in USDC" : "") + ")",
    ItirazEdildi: () => "Challenged by " + kisa(a.itirazci) + (Number(a.oncekiId) ? " as a copy of #" + a.oncekiId : ""),
    ItirazCozuldu: () => "Challenge " + (a.kabul ? "upheld: design burned" : "rejected"),
    Kaldirildi: () => "Taken down: " + String(a.sebep).slice(0, 140),
    TeminatIade: () => "Stake returned to " + kisa(a.kime),
    TeslimEdildi: () => "File key delivered to " + kisa(a.alici),
    TeslimAlindi: () => "Buyer confirmed the file",
    AnahtarItirazi: () => "Buyer said the key does not work",
    SatisKapandi: () => (a.saticiyaOdendi ? "Payment released to " : "Refunded to ") + kisa(a.kime),
    OnuAlindi: () => "Front-run: design #" + a.eskiId + " burned for #" + a.yeniId,
    Transfer: () => a.from === Z ? "Minted to " + kisa(a.to) : a.to === Z ? "Burned" : "Transferred " + kisa(a.from) + " → " + kisa(a.to)
  }[o.ad];
  return el("div", { sinif: "ds-gecmis__oge" }, [el("span", { yazi: y ? y() : o.ad }),
    el("a", { attr: { href: S.TASARIM.kasif + "/tx/" + o.tx, target: "_blank", rel: "noopener" }, yazi: "block " + o.blok + " ↗" })]);
}

async function fiyatKutusu({ cuzdan, t, ay, j, sym }) {
  const ben = cuzdan.hesap();
  const symL = j.sembol ? "$" + j.sembol : "designer token";
  const kutu = el("div", { sinif: "ds-kutu dz-fiyat-kutu" });
  if (!t.ilan) { kutu.append(el("div", { sinif: "ds-fiyat--yok", yazi: "Not listed for sale." })); return kutu; }
  const q = ay && ay.fiyatCanli ? await S.tokenKarsiligi(t.token, t.ilan.fiyat) : null;
  kutu.append(el("div", { sinif: "ds-buyuk-fiyat", yazi: usd(t.ilan.fiyat) + " USDC" }),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "In " + symL }), el("span", { sinif: "ds-fiyat", yazi: q != null ? "≈ " + jetonYaz(q, j.ondalik) + " " + sym + " (time-weighted)" : "— (no feed price for this token yet)" })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Seller" }), esit(t.ilan.satici, ben) ? el("span", { yazi: "you" }) : el("a", { attr: { href: "#/u/" + t.ilan.satici } }, [isim(t.ilan.satici)])]));
  if (esit(t.ilan.satici, ben)) { kutu.append(el("div", { sinif: "ds-cihaz", yazi: "This is your listing." })); return kutu; }
  if (!ay || !ay.fiyatCanli || q == null) {
    kutu.append(el("div", { sinif: "not not--uyari" }, [el("div", { yazi: "Buying opens when the price feed is live for $" + sym + " (its pool needs a time-weighted price on PulseHook6). The listing is real and stays." })]));
    return kutu;
  }
  if (t.itiraz) { kutu.append(el("div", { sinif: "not not--uyari" }, [el("div", { yazi: "A challenge is open on this design; buying waits for it to be resolved." })])); return kutu; }
  if (t.satis) { kutu.append(el("div", { sinif: "ds-cihaz", yazi: "A sale is in progress (waiting for the file key); buying opens again when it settles." })); return kutu; }
  const d = durumSatiri();
  const T = await import("../../js/designs/teslim.js");
  /* the Arc purchase with USDC; also the last step of a payment from another chain (uzak-alim.js) */
  const usdcIleAl = async (yaz) => {
      await hesapIste();
      const kanca = await S.havuzKancasi(t.token);
      const ka = await (await S.nft()).kancaAyar(kanca);
      if (!ka.izinli) throw new Error("This designer token's pool is not allowed for USDC purchases yet; buy with $" + sym + ".");
      const miktar = await S.tokenKarsiligi(t.token, t.ilan.fiyat);
      if (miktar == null) throw new Error("Buying opens when the price feed is live.");
      await S.onayGerekirse({ cuzdan, token: S.TASARIM.usdc, miktar: t.ilan.fiyat, durum: yaz, etiket: usd(t.ilan.fiyat) + " USDC" });
      const anahtar = await T.alimAnahtari(cuzdan, yaz);
      await S.gonder({ cuzdan, data: S.veri.alUsdc(t.id, kanca, miktar * 9700n / 10000n, anahtar), durum: yaz, aciklama: "Confirm the purchase (" + usd(t.ilan.fiyat) + " USDC, swapped into $" + sym + " for the seller)" });
      yaz("Bought. Your payment waits until the seller delivers the file key to you; this page then opens the file.", "ok");
      setTimeout(() => location.reload(), 2500);
  };
  const U = await import("../../js/designs/uzak-alim.js");
  kutu.append(el("div", { sinif: "ds-dugmeler" }, [
    eylem("Buy with USDC", usdcIleAl, "dugme dugme--marka", d, S.hataAcikla),
    eylem("Buy with " + symL, async (yaz) => {
      await hesapIste();
      const miktar = await S.tokenKarsiligi(t.token, t.ilan.fiyat);
      if (miktar == null) throw new Error("Buying opens when the price feed is live.");
      const azami = miktar * 10200n / 10000n;   // 2% room for the TWAP to move
      await S.onayGerekirse({ cuzdan, token: t.token, miktar: azami, durum: yaz, etiket: "$" + sym });
      const anahtar = await T.alimAnahtari(cuzdan, yaz);
      await S.gonder({ cuzdan, data: S.veri.al(t.id, azami, anahtar), durum: yaz, aciklama: "Confirm the purchase (at most " + jetonYaz(azami, j.ondalik) + " " + sym + ")" });
      yaz("Bought. Your payment waits until the seller delivers the file key to you; this page then opens the file.", "ok");
      setTimeout(() => location.reload(), 2500);
    }, "dugme", d, S.hataAcikla)]), d,
    el("div", { sinif: "ds-cihaz", yazi: "Both ways pay on Arc: USDC on Arc (Arc's gas token too) or the designer token, which you can buy on its trade page in the ARC PULSE app from 12 chains. Holding USDC on another chain? Pay from there below." }),
    U.uzakAlimKutusu({ cuzdan, fiyat6: t.ilan.fiyat, arcAlim: usdcIleAl, hesapIste, durumSatiri, eylem: (a, f, s, dd) => eylem(a, f, s, dd, S.hataAcikla),
      onKontrol: async () => { if (!(await (await S.nft()).kancaAyar(await S.havuzKancasi(t.token))).izinli) throw new Error("This designer token's pool is not allowed for USDC purchases yet, so paying from another chain is not open for it; buy with $" + sym + " on Arc."); } }),
    el("div", { sinif: "ds-cihaz", yazi: "Buyer protection: the contract holds your payment until the seller delivers the file key to you" + (ay.teslimSuresi ? " (within " + Math.round(ay.teslimSuresi / 86400) + " days, or you are refunded)" : "") + "; you can say the key does not work before it is released." }));
  return kutu;
}

function ilanKutusu({ cuzdan, t, ay }) {
  const fiyat = el("input", { sinif: "girdi", attr: { type: "number", min: "0.01", step: "0.01", placeholder: "Price in USDC", "aria-label": "Price in USDC" } });
  const d = durumSatiri();
  return el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: t.ilan ? "Your listing" : "List for sale" }), fiyat,
    el("div", { sinif: "ds-dugmeler" }, [
      eylem(t.ilan ? "Change price" : "List for sale", async (yaz) => {
        await hesapIste();
        const v = String(fiyat.value || "").trim();
        if (!(Number(v) > 0)) throw new Error("Enter a price in USDC.");
        await S.gonder({ cuzdan, data: S.veri.ilanVer(t.id, parseUnits(v, 6)), durum: yaz, aciklama: "Confirm the listing at $" + v });
        yaz("Listed at $" + v + ".", "ok");
      }, "dugme dugme--marka", d, S.hataAcikla),
      t.ilan ? eylem("Remove listing", async (yaz) => { await hesapIste(); await S.gonder({ cuzdan, data: S.veri.ilanKaldir(t.id), durum: yaz }); yaz("Listing removed.", "ok"); }, "dugme", d, S.hataAcikla) : null]), d,
    el("div", { sinif: "ds-cihaz", yazi: "Buyers pay the USDC price in the designer's token. On a resale " + (ay ? (ay.telifBps / 100) + "%" : "a royalty") + " goes to the designer." })]);
}

/* the holder opens the file (no open sale): the key from the metadata envelope or an on-chain delivery */
function dosyaKutusu({ cuzdan, t, meta }) {
  const f = meta && meta.arcpulse && meta.arcpulse.file;
  if (!f || !f.uri) return el("span");
  const d = durumSatiri();
  return el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Your file" }),
    el("p", { sinif: "ds-lisans", yazi: "Opened in this browser with your unlock key and checked against the exact hash on Arc." }),
    eylem("Unlock and download", async (yaz) => {
      await hesapIste();
      const T = await import("../../js/designs/teslim.js");
      const Sf = await import("../../js/designs/sifre.js");
      const { sha256Hex } = await import("../../js/designs/parmakizi.js");
      const k = await T.dosyaAnahtariBul(cuzdan, t, meta, yaz);
      yaz("Downloading the encrypted file…");
      const acik = await Sf.dosyaCoz(await baytAl(f.uri), k);
      if ((await sha256Hex(acik)).toLowerCase() !== t.dosyaHash.toLowerCase()) throw new Error("The decrypted file does not match the hash on chain.");
      const url = URL.createObjectURL(new Blob([acik], { type: f.mime || "application/octet-stream" }));
      const a = el("a", { attr: { href: url, download: f.name || ("design-" + t.id) } });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      yaz("Opened and verified against the on-chain hash.", "ok");
    }, "dugme dugme--marka", d, S.hataAcikla), d]);
}
