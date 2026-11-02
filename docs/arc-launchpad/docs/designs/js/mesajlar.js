/* ===========================================================================
 * designs/js/mesajlar.js — Messages: inbox and one conversation
 *
 * The inbox is read from MesajKutusu's Mesaj events (to or from the
 * connected wallet). Opening the messages takes one signature (the unlock
 * key of the main app's sifre.js, kept in memory for this page load); each
 * message is decrypted in the browser. Sending encrypts to the recipient's
 * key registered on TasarimNFT2 and to the sender's own key (mesaj.js).
 * Block: MesajKutusu.engelle, by the recipient.
 * Live: while the page is visible it asks Arc for new Mesaj events every
 * ~15 s and appends them (the open conversation gets the bubbles, the list
 * a dot). Unread dots compare each conversation's newest incoming message
 * with the block last read in this browser (okundu.js; convenience only).
 * =========================================================================== */
import { el, temizle, S, SO, kisa, esit, adresMi, avatar, isim, eylem, durumSatiri, durumYaz, bosKutu, hesapIste, tarih, yukleniyor, ikon } from "./ortak.js";
import * as O from "./okundu.js";

const UYARI = "Messages are end-to-end encrypted; who you write to and when is public on Arc.";
export const CANLI_ARALIK = 15_000;

function ustBant() {
  return el("div", { sinif: "dz-mesaj-uyari" }, [ikon("kilit", 16), el("span", { yazi: UYARI })]);
}

export async function mesajSayfasi({ cuzdan }, kiminle) {
  const kap = el("div", { sinif: "dz-mesaj-sayfa" });
  kap.append(el("div", { sinif: "dz-sayfa-ust" }, [el("h1", { yazi: "Inbox" })]), ustBant());
  if (!SO.MESAJ_VAR) { kap.append(bosKutu("Messages open soon", "Wallet-to-wallet messages, encrypted in your browser, open when the message box is deployed on Arc.")); return kap; }
  const ben = cuzdan.hesap();
  if (!ben) {
    const b = eylem("Connect wallet", async () => { await hesapIste(); }, "dugme dugme--marka");
    kap.append(bosKutu("Connect to read your messages", "Your inbox is your wallet. Messages are opened in this browser with a key derived from your wallet's signature; nothing is stored.", el("div", {}, [b, b._durum])));
    if (kiminle && adresMi(kiminle)) kap.append(el("p", { sinif: "ds-cihaz", attr: { style: "text-align:center" } }, ["To write to ", isim(kiminle), ", connect first."]));
    return kap;
  }
  const [liste, benimAnahtar] = await Promise.all([SO.mesajlar(ben), S.anahtarOku(ben).catch(() => "0x")]);
  if (!benimAnahtar || benimAnahtar === "0x") {
    const T = await import("../../js/designs/teslim.js");
    kap.append(el("div", { sinif: "not not--uyari" }, [el("div", { sinif: "yigin" }, [el("div", { yazi: "Register your unlock key so others can write to you (one transaction; the same key receives design files)." }), T.anahtarKutusu(cuzdan)])]));
  }

  /* conversations */
  const kon = new Map();
  const kayit = (m) => {
    const o = esit(m.gonderen, ben) ? m.alici : m.gonderen;
    const k = o.toLowerCase();
    if (!kon.has(k)) kon.set(k, { kim: o, mesajlar: [] });
    kon.get(k).mesajlar.push(m);
    return kon.get(k);
  };
  for (const m of liste) kayit(m);
  if (kiminle && adresMi(kiminle) && !kon.has(kiminle.toLowerCase())) kon.set(kiminle.toLowerCase(), { kim: kiminle, mesajlar: [] });
  const gizli = await SO.gizliler().catch(() => new Set());

  /* newest incoming message of a conversation after the block read here: unread */
  const okunmadi = (k) => {
    const son = [...k.mesajlar].reverse().find((m) => !esit(m.gonderen, ben));
    if (!son || !Number.isInteger(son.blok)) return false;
    return son.blok > (O.okunanlar(ben)[k.kim.toLowerCase()] || 0);
  };
  const okunduIsaretle = (k) => {
    const son = k && k.mesajlar.filter((m) => Number.isInteger(m.blok)).at(-1);
    if (son) O.okunduYaz(ben, k.kim, son.blok);
  };
  if (kiminle && adresMi(kiminle)) okunduIsaretle(kon.get(kiminle.toLowerCase()));

  const sol = el("nav", { sinif: "dz-gelen" + (kiminle ? " dz-gelen--gizle" : ""), attr: { "aria-label": "Conversations" } });
  const yeni = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "New message: 0x address or @handle", "aria-label": "New message to" } });
  const yeniD = durumSatiri();
  yeni.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const v = yeni.value.trim();
    if (adresMi(v)) { location.hash = "#/messages/" + v; return; }
    const a = await SO.sahibi(v).catch(() => null);
    if (a) location.hash = "#/messages/" + a; else durumYaz(yeniD, "No wallet has that handle.", "hata");
  });
  sol.append(el("div", { sinif: "dz-gelen__yeni" }, [yeni, yeniD]));
  const ogeler = el("div", { sinif: "dz-gelen__liste" });
  sol.append(ogeler);
  const listeCiz = () => {
    temizle(ogeler);
    const sirali = [...kon.values()].sort((a, b) => (b.mesajlar.at(-1)?.blok || Infinity) - (a.mesajlar.at(-1)?.blok || Infinity));
    if (!sirali.length) { ogeler.append(el("div", { sinif: "ds-cihaz", attr: { style: "padding:12px" }, yazi: "No messages yet. Open a profile and press Message, or type an address above." })); return; }
    for (const k of sirali) {
      const son = k.mesajlar.at(-1);
      const yeniMi = !esit(k.kim, kiminle) && okunmadi(k);
      ogeler.append(el("a", { sinif: "dz-gelen__oge" + (yeniMi ? " dz-gelen__oge--yeni" : ""), attr: { href: "#/messages/" + k.kim, "aria-current": esit(k.kim, kiminle) ? "page" : null } }, [
        avatar(k.kim, 44),
        el("span", { sinif: "dz-gelen__metin" }, [isim(k.kim), el("span", { sinif: "ds-cihaz", yazi: son ? (esit(son.gonderen, ben) ? "You · " : "") + tarih(son.zaman) + " · " + k.mesajlar.length + " message" + (k.mesajlar.length > 1 ? "s" : "") : "New conversation" })]),
        yeniMi ? el("span", { sinif: "dz-okunmadi", attr: { role: "img", "aria-label": "unread", title: "New message" } }) : null]));
    }
  };
  listeCiz();
  const sag = el("section", { sinif: "dz-konusma" });
  kap.append(el("div", { sinif: "dz-mesaj-izgara" + (kiminle ? " dz-mesaj-izgara--acik" : "") }, [sol, sag]));

  let acik = null;   // the open conversation ({ ekle(m) })
  if (!kiminle) sag.append(el("div", { sinif: "dz-konusma__bos" }, [ikon("mesaj", 48), el("div", { yazi: "Choose a conversation" })]));
  else if (!adresMi(kiminle)) sag.append(bosKutu("Not a wallet address", kiminle));
  else if (gizli.has(kiminle.toLowerCase())) sag.append(bosKutu("This profile is hidden", "The moderator hid this profile after a report."));
  else acik = await konusma(sag, cuzdan, ben, kiminle, (kon.get(kiminle.toLowerCase()) || { mesajlar: [] }).mesajlar);

  canliBaslat({ kap, ben, liste, yeniler: (l) => {
    for (const m of l) {
      const k = kayit(m);
      if (acik && esit(k.kim, kiminle)) { acik.ekle(m); okunduIsaretle(k); }
    }
    listeCiz();
  } });
  return kap;
}

/* poll MesajKutusu for new events while the page is shown and visible; stops when the page is left */
function canliBaslat({ kap, ben, liste, yeniler }) {
  let son = liste.reduce((a, m) => (Number.isInteger(m.blok) && m.blok > a ? m.blok : a), -1);
  const gorulen = new Set(liste.map((m) => m.tx + ":" + m.sira));
  let calisiyor = false, ilk = true;
  const tur = async () => {
    if (!kap.isConnected && !ilk) { clearInterval(z); document.removeEventListener("visibilitychange", gorunurlukte); return; }
    ilk = false;
    if (calisiyor || document.visibilityState !== "visible") return;
    calisiyor = true;
    try {
      if (son < 0) son = await (await S.arc()).getBlockNumber();
      const l = (await SO.mesajlar(ben, son)).filter((m) => { const k = m.tx + ":" + m.sira; if (gorulen.has(k)) return false; gorulen.add(k); return true; });
      for (const m of l) if (m.blok > son) son = m.blok;
      if (l.length) yeniler(l);
    } catch (e) { /* the next round tries again */ }
    finally { calisiyor = false; }
  };
  const z = setInterval(tur, CANLI_ARALIK);
  const gorunurlukte = () => { if (document.visibilityState === "visible") tur(); };
  document.addEventListener("visibilitychange", gorunurlukte);
  kap._canli = tur;   // for tests and an immediate refresh
}

async function konusma(sag, cuzdan, ben, kim, mesajlar) {
  const [engelledim, durum] = await Promise.all([SO.engelliMi(ben, kim).catch(() => false), SO.gonderilebilir(ben, kim).catch(() => null)]);
  const bd = durumSatiri();
  let engel = !!engelledim;
  const engelD = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" } });
  const engelYaz = () => { engelD.textContent = engel ? "Unblock" : "Block"; engelD.title = engel ? "Let this wallet message you again" : "This wallet's messages to you will be refused on Arc (public)"; };
  engelYaz();
  engelD.addEventListener("click", async () => {
    engelD.disabled = true;
    try {
      await SO.mesajGonder({ cuzdan, data: SO.veriM.engelle(kim, !engel), durum: (m, t) => durumYaz(bd, m, t), aciklama: engel ? "Confirm unblocking" : "Confirm blocking" });
      engel = !engel; engelYaz(); durumYaz(bd, engel ? "Blocked. Their messages to you are refused." : "Unblocked.", "ok");
    } catch (e) { durumYaz(bd, SO.hataAcikla(e), "hata"); } finally { engelD.disabled = false; }
  });
  sag.append(el("header", { sinif: "dz-konusma__ust" }, [
    el("a", { sinif: "dz-geri", attr: { href: "#/messages", "aria-label": "Back to conversations" } }, [ikon("geri")]),
    el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + kim } }, [avatar(kim, 36), isim(kim)]), el("span", { attr: { style: "margin-left:auto" } }, [engelD])]), bd);

  const akis = el("div", { sinif: "dz-balonlar", attr: { "aria-live": "polite" } });
  sag.append(akis);
  const Sf = await import("../../js/designs/sifre.js");
  const M = await import("./mesaj.js");
  const balon = (m) => {
    const benden = esit(m.gonderen, ben);
    const metin = el("div", { sinif: "dz-balon__metin", yazi: "🔒 Encrypted" });
    const b = el("div", { sinif: "dz-balon" + (benden ? " dz-balon--ben" : "") }, [metin, el("a", { sinif: "dz-balon__zaman", attr: { href: S.TASARIM.kasif + "/tx/" + m.tx, target: "_blank", rel: "noopener" }, yazi: tarih(m.zaman) })]);
    b._ac = async (sk) => { try { metin.textContent = await M.coz(m.sifreli, { sk, ben, gonderen: m.gonderen }); } catch (e) { metin.textContent = "Could not open this message (it was encrypted to another key)."; metin.classList.add("dz-balon__hata"); } };
    return b;
  };
  const balonlar = mesajlar.map(balon);
  if (!balonlar.length) akis.append(el("div", { sinif: "ds-cihaz dz-balonlar__bos", yazi: "No messages yet. Say hello." }));
  akis.append(...balonlar);
  const acDugme = eylem("Unlock messages (one signature)", async (yaz) => {
    const sk = await Sf.acmaAnahtari(cuzdan);
    await Promise.all(balonlar.map((b) => b._ac(sk)));
    acKutu.remove(); yaz("");
    akis.scrollTop = akis.scrollHeight;
  }, "dugme dugme--kucuk");
  const acKutu = el("div", { sinif: "dz-ac" }, [acDugme, acDugme._durum, el("div", { sinif: "ds-cihaz", yazi: "Signing derives your private unlock key in this browser; it sends nothing and is forgotten when you close the page." })]);
  const hazir = Sf.bellektekiAnahtar(ben);
  if (balonlar.length) {
    if (hazir) Promise.all(balonlar.map((b) => b._ac(hazir))).then(() => { akis.scrollTop = akis.scrollHeight; });
    else sag.append(acKutu);
  }

  /* compose */
  const yazi = el("textarea", { sinif: "girdi dz-yaz", attr: { rows: "2", placeholder: "Message…", "aria-label": "Message", maxlength: String(M.ACIK_AZAMI) } });
  const sd = durumSatiri();
  const NEDEN = { 1: "Your wallet is muted by the moderator.", 2: "This wallet has blocked you.", 3: "This wallet has not registered an unlock key yet, so it cannot receive encrypted messages. Ask them to register it (Profile → Unlock key).", 4: "Too many messages in a minute. Wait a moment.", 5: "Not a wallet you can write to." };
  const gonderdiklerim = new Set();   // ciphertexts sent from this tab (already shown when their event arrives)
  const gonder = eylem("Send", async (yaz) => {
    const metin = yazi.value.trim();
    if (!metin) throw new Error("Write a message first.");
    const n = await SO.gonderilebilir(ben, kim);
    if (n) throw new Error(NEDEN[n] || "Cannot send now (" + n + ").");
    const aliciPub = await S.anahtarOku(kim);
    yaz("Sign to derive your unlock key, so you can reread what you send (nothing is sent)…");
    const sk = await Sf.acmaAnahtari(cuzdan);
    const sifreli = await M.sifrele(metin, { alici: kim, aliciPub, ben, benPub: sk.compressedPublicKey });
    gonderdiklerim.add(String(sifreli).toLowerCase());
    await SO.mesajGonder({ cuzdan, data: SO.veriM.gonder(kim, sifreli), durum: yaz, aciklama: "Confirm sending the encrypted message" });
    const b = balon({ gonderen: ben, alici: kim, sifreli, zaman: Date.now(), tx: "" });
    akis.querySelector(".dz-balonlar__bos")?.remove();
    akis.append(b); await b._ac(sk);
    akis.scrollTop = akis.scrollHeight;
    yazi.value = ""; yaz("Sent. " + UYARI, "ok");
  }, "dugme dugme--marka", sd);
  yazi.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) gonder.click(); });
  sag.append(el("div", { sinif: "dz-yazma" }, [yazi, gonder]), sd);
  if (durum && durum !== 0 && durum !== 4) durumYaz(sd, NEDEN[durum] || "", "hata");
  akis.scrollTop = akis.scrollHeight;

  return {
    /* a message that arrived live: a bubble at the bottom, opened at once when the key is in memory */
    ekle(m) {
      if (esit(m.gonderen, ben) && gonderdiklerim.has(String(m.sifreli).toLowerCase())) return;
      const b = balon(m);
      akis.querySelector(".dz-balonlar__bos")?.remove();
      const altta = akis.scrollHeight - akis.scrollTop - akis.clientHeight < 60;
      akis.append(b);
      balonlar.push(b);
      const sk = Sf.bellektekiAnahtar(ben);
      if (sk) b._ac(sk).then(() => { if (altta) akis.scrollTop = akis.scrollHeight; });
      else if (!acKutu.isConnected) sag.insertBefore(acKutu, sag.querySelector(".dz-yazma"));
      if (altta) akis.scrollTop = akis.scrollHeight;
    }
  };
}
