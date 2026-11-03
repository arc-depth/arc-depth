/* ===========================================================================
 * designs/teslim.js — Designs v2: the file key delivered on chain
 *
 * TasarimNFT2 makes the key the condition of payment: every sale waits in
 * escrow until the seller posts the file key encrypted to the buyer's
 * registered key (teslimEt); the buyer confirms (teslimAldim) or says the key
 * does not work (anahtarItiraz); no delivery in time refunds the buyer
 * (iadeEt); after confirmation or the dispute window anyone releases the
 * payment (serbestBirak). This module is used only when SURUM === 2
 * (sozlesme.js DESIGNS_V2); with v1 nothing here runs.
 *
 *   anahtarKutusu    profile: register the unlock key on chain (replaces the
 *                    key card shared by hand)
 *   teslimBandi      every Designs page: a seller with sales waiting for the
 *                    key sees them and delivers all with one click (one
 *                    signature to derive the key, then one transaction each)
 *   satisDurumu      design page: the sale's state and the buttons for
 *                    seller, buyer and anyone (deliver, open, confirm,
 *                    dispute, refund, release)
 *   dosyaAnahtariBul the file key for the connected wallet: the designer's
 *                    envelope in the metadata, or an on-chain envelope to it
 * =========================================================================== */
import { el } from "../ui.js";
import { keccak256, getBytes } from "../../vendor/ethers.min.js";
import * as S from "./sozlesme.js";
import { metaOku } from "./meta.js";

const esit = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const tarih = (ms) => new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function durumSatiri() { return el("div", { sinif: "ds-durum", attr: { role: "status", "aria-live": "polite" } }); }
function yazici(d) { return (m, tur) => { d.textContent = m || ""; d.className = "ds-durum" + (tur ? " ds-durum--" + tur : ""); }; }
function eylem(yazi, f, sinif, d) {
  const b = el("button", { sinif: sinif || "dugme dugme--marka", yazi, attr: { type: "button" } });
  b.addEventListener("click", async () => {
    b.disabled = true;
    try { await f(yazici(d)); } catch (e) { yazici(d)(S.hataAcikla(e), "hata"); } finally { b.disabled = false; }
  });
  return b;
}

/** The connected wallet's unlock key and its compressed public key (one signature per page load). */
export async function benimAnahtarim(cuzdan) {
  const Sf = await import("./sifre.js");
  const sk = await Sf.acmaAnahtari(cuzdan);
  return { sk, pub: sk.compressedPublicKey };
}

/** The file key of design `t` for the connected wallet, checked against the on-chain commitment. */
export async function dosyaAnahtariBul(cuzdan, t, meta, yaz) {
  const Sf = await import("./sifre.js");
  yaz && yaz("Sign to derive your unlock key (nothing is sent)…");
  const sk = await Sf.acmaAnahtari(cuzdan);
  const me = cuzdan.hesap().toLowerCase();
  const m = meta || (await metaOku(t.uri).catch(() => null)) || {};
  const tamam = (k) => !t.anahtarTaahhut || /^0x0{64}$/.test(t.anahtarTaahhut) || keccak256(k) === t.anahtarTaahhut;
  for (const z of ((m.arcpulse && m.arcpulse.keys) || []).filter((z) => z && String(z.to).toLowerCase() === me)) {
    try { const k = await Sf.ac(z, sk, t.dosyaHash); if (tamam(k)) return k; } catch (e) { /* not for this key */ }
  }
  /* envelopes from TasarimNFT2 sales and from the market v3 (TasarimPazar3) sales, oldest first */
  const liste = [...(await S.zarflar(t.id)), ...(await import("./pazar3.js").then((P) => P.zarflar(t.id)).catch(() => []))];
  for (const z of liste.reverse().filter((z) => esit(z.alici, me))) {
    try { const k = await Sf.acIkili(z.zarf, sk, me, t.dosyaHash); if (tamam(k)) return k; } catch (e) { /* not for this key */ }
  }
  /* a design delivered through a commission (SiparisKaydi): its file key was posted to the client there */
  try {
    const Si = await import("../../designs/js/siparis.js");
    for (const z of (await Si.nftZarflari(t.id)).reverse().filter((z) => esit(z.alici, me))) {
      try { const k = await Sf.acIkili(z.zarf, sk, me, t.dosyaHash); if (tamam(k)) return k; } catch (e) { /* not for this key */ }
    }
  } catch (e) { /* commissions not readable */ }
  throw new Error("No file key for this wallet yet: the seller has not delivered it to your registered key.");
}

/** The buyer's key the sale was made with (the registered one, or an earlier one whose hash the sale kept). */
async function satisAnahtari(s) {
  const simdi = await S.anahtarOku(s.alici);
  if (simdi && simdi !== "0x" && keccak256(simdi) === s.aliciAnahtarHash) return simdi;
  for (const a of await S.anahtarGecmisi(s.alici)) if (keccak256(a) === s.aliciAnahtarHash) return a;
  throw new Error("Could not find the key the buyer registered for this sale.");
}

/** teslimEt calldata for design `id` (the connected wallet is the seller). */
async function teslimVerisi(cuzdan, id, yaz) {
  const Sf = await import("./sifre.js");
  const t = await S.tasarimOku(id);
  if (!t || !t.satis || t.satis.durum !== 1) throw new Error("Design #" + id + " is not waiting for a delivery.");
  const k = await dosyaAnahtariBul(cuzdan, t, null, yaz);
  const pub = await satisAnahtari(t.satis);
  const zarf = await Sf.sarIkili(k, pub, t.satis.alici, t.dosyaHash);
  return S.veri.teslimEt(id, zarf);
}

/* ---- profile: the unlock key on chain ---- */
export function anahtarKutusu(cuzdan) {
  const d = durumSatiri();
  const yaz = yazici(d);
  const kutu = el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Your unlock key (to receive design files)" }),
    el("p", { sinif: "ds-lisans", yazi: "Design files are encrypted. A seller is paid only after posting the file key encrypted to your unlock key, on Arc. Your unlock key comes from a signature of your wallet (nothing is stored); its public half is registered on chain once. Buying from this page registers it in the same transaction if you have not." })]);
  const durumYazi = el("div", { sinif: "ds-durum", yazi: "Reading…" });
  kutu.append(durumYazi);
  S.anahtarOku(cuzdan.hesap()).then((a) => { durumYazi.textContent = a && a !== "0x" ? "Registered on Arc: " + a.slice(0, 14) + "…" : "Not registered yet."; })
    .catch(() => { durumYazi.textContent = "Could not read your registered key."; });
  kutu.append(el("div", { sinif: "ds-dugmeler" }, [
    eylem("Register my unlock key on Arc", async (y) => {
      const { pub } = await benimAnahtarim(cuzdan);
      const simdi = await S.anahtarOku(cuzdan.hesap());
      if (simdi && simdi.toLowerCase() === pub.toLowerCase()) return y("Already registered: this is your current unlock key.", "ok");
      await S.gonder({ cuzdan, data: S.veri.anahtarKaydet(pub), durum: y, aciklama: "Confirm registering your unlock key" });
      durumYazi.textContent = "Registered on Arc: " + pub.slice(0, 14) + "…";
      y("Registered. Sellers' browsers deliver file keys to it.", "ok");
    }, "dugme", d)]), d);
  return kutu;
}

/* ---- every page: sales waiting for this seller's key ---- */
export async function teslimBandi(cuzdan) {
  const ben = cuzdan.hesap();
  if (!ben) return null;
  const liste = await S.bekleyenTeslimler(ben).catch(() => []);
  if (!liste.length) return null;
  const d = durumSatiri();
  const enYakin = Math.min(...liste.map((x) => x.teslimSonu));
  return el("div", { sinif: "not not--uyari" }, [el("div", { sinif: "yigin" }, [
    el("div", { yazi: liste.length + " of your sales wait for the file key (designs " + liste.map((x) => "#" + x.id).join(", ") + "). You are paid after you deliver it; the first deadline is " + tarih(enYakin) + ", after which the buyer can be refunded." }),
    eylem("Deliver all (" + liste.length + ")", async (yaz) => {
      let n = 0;
      for (const x of liste) {
        const data = await teslimVerisi(cuzdan, x.id, yaz);
        await S.gonder({ cuzdan, data, durum: yaz, aciklama: "Confirm delivering the key for design #" + x.id + " (" + (++n) + "/" + liste.length + ")" });
      }
      yaz("Delivered " + n + ". Each buyer can now open the file; you are paid when they confirm or their window passes.", "ok");
    }, "dugme dugme--marka", d), d])]);
}

/* ---- design page: the sale's state ---- */
export async function satisDurumu({ cuzdan, t, meta, ay }) {
  const s = t.satis;
  const ben = cuzdan.hesap();
  const d = durumSatiri();
  const kutu = el("div", { sinif: "ds-kutu" }, [el("h3", { yazi: "Sale and file key" })]);
  if (!s) {
    kutu.append(el("div", { sinif: "ds-cihaz", yazi: "No open sale. When this design is bought, the payment waits here until the seller delivers the file key to the buyer." }));
    return kutu;
  }
  const simdi = Date.now();
  if (s.durum === 1) {
    kutu.append(el("div", { yazi: "Bought by " + (esit(s.alici, ben) ? "you" : s.alici.slice(0, 8) + "…") + ". Waiting for the seller to deliver the file key until " + tarih(s.teslimSonu) + "; the payment is held until then." }));
    if (esit(s.satici, ben)) kutu.append(eylem("Deliver the file key", async (yaz) => {
      await S.gonder({ cuzdan, data: await teslimVerisi(cuzdan, t.id, yaz), durum: yaz, aciklama: "Confirm delivering the key" });
      yaz("Delivered.", "ok");
    }, "dugme dugme--marka", d));
    if (simdi > s.teslimSonu) kutu.append(eylem("Refund the buyer (no key delivered in time)", async (yaz) => {
      await S.gonder({ cuzdan, data: S.veri.iadeEt(t.id), durum: yaz }); yaz("Refunded; the NFT went back to the seller.", "ok");
    }, "dugme", d));
  } else if (s.durum === 2) {
    kutu.append(el("div", { yazi: "The seller delivered the file key. " + (esit(s.alici, ben) ? "Open the file and confirm, or say the key does not work until " + tarih(s.itirazSonu) + "." : "The buyer can dispute it until " + tarih(s.itirazSonu) + ".") }));
    if (esit(s.alici, ben)) {
      const ac = async (yaz) => {
        const { sha256Hex } = await import("./parmakizi.js");
        const Sf = await import("./sifre.js");
        const { baytAl } = await import("./meta.js");
        const k = await dosyaAnahtariBul(cuzdan, t, meta, yaz);
        yaz("The key matches the designer's commitment ✓. Downloading the encrypted file…");
        const f = meta && meta.arcpulse && meta.arcpulse.file;
        if (!f || !f.uri) return yaz("The key is valid; this design's metadata names no file to download.", "ok");
        const acik = await Sf.dosyaCoz(await baytAl(f.uri), k);
        if ((await sha256Hex(acik)).toLowerCase() !== t.dosyaHash.toLowerCase()) throw new Error("The file does not match the hash on chain. Say the key doesn't work.");
        const url = URL.createObjectURL(new Blob([acik], { type: f.mime || "application/octet-stream" }));
        const a = el("a", { attr: { href: url, download: f.name || ("design-" + t.id) } });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        yaz("Opened and verified against the on-chain hash. If it is right, confirm below.", "ok");
      };
      kutu.append(el("div", { sinif: "ds-dugmeler" }, [
        eylem("Open the file", ac, "dugme dugme--marka", d),
        eylem("I received it", async (yaz) => { await S.gonder({ cuzdan, data: S.veri.teslimAldim(t.id), durum: yaz }); yaz("Confirmed. The seller is paid (after the copy window, if still open).", "ok"); }, "dugme", d),
        simdi <= s.itirazSonu ? eylem("The key doesn't work", async (yaz) => { await S.gonder({ cuzdan, data: S.veri.anahtarItiraz(t.id), durum: yaz }); yaz("Disputed. The payment is frozen until the admin (later the DAO) decides.", "ok"); }, "dugme", d) : null]));
      /* auto-open: when this page already holds the unlock key (signed earlier in this visit), no prompt is needed */
      const Sf = await import("./sifre.js");
      if (Sf.bellektekiAnahtar(ben)) setTimeout(() => ac(yazici(d)).catch((e) => yazici(d)(S.hataAcikla(e), "hata")), 0);
    }
    if (simdi > s.itirazSonu) kutu.append(eylem("Release the payment to the seller", async (yaz) => { await S.gonder({ cuzdan, data: S.veri.serbestBirak(t.id), durum: yaz }); yaz("Released.", "ok"); }, "dugme", d));
  } else if (s.durum === 3) {
    kutu.append(el("div", { yazi: "The buyer said the key does not work. The payment is frozen until the admin (later the DAO) refunds the buyer or pays the seller." }));
  } else if (s.durum === 4) {
    const pencere = ay && Date.now() <= t.itirazBitis;
    kutu.append(el("div", { yazi: "The buyer confirmed the file. " + (pencere ? "The payment is released after the copy-challenge window (" + tarih(t.itirazBitis) + ")." : "The payment can be released now.") }));
    if (!pencere && !t.itiraz) kutu.append(eylem("Release the payment to the seller", async (yaz) => { await S.gonder({ cuzdan, data: S.veri.serbestBirak(t.id), durum: yaz }); yaz("Released.", "ok"); }, "dugme", d));
  }
  kutu.append(d);
  return kutu;
}

/** The anahtar bytes to send with a v2 purchase: "0x" when the wallet has a key on chain, else its unlock key (registered in the same call). */
export async function alimAnahtari(cuzdan, yaz) {
  const a = await S.anahtarOku(cuzdan.hesap());
  if (a && a !== "0x" && getBytes(a).length) return "0x";
  yaz && yaz("Sign once to derive your unlock key: it is registered with this purchase, so the seller can deliver the file key to you.");
  return (await benimAnahtarim(cuzdan)).pub;
}
