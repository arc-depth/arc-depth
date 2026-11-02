/* ===========================================================================
 * designs/js/mesajlar.js — Messages: inbox and one conversation
 *
 * Two boxes on Arc:
 *   - the PRIVATE BOX, MesajKutusu2 (once SOSYAL.mesaj2 is set in sosyal.js):
 *     no recipient on chain. Every message of every wallet is read and this
 *     browser finds the wallet's own by view tag + decryption (mesaj2.js),
 *     which needs the unlock key (one signature per page load, memory only).
 *     Sending goes here. The sender's wallet is public (it pays the gas).
 *     Delete (the sender's Sil on chain) and disappearing messages hide a
 *     message in the app for both sides; the encrypted copy stays on Arc.
 *     Block and Hide are kept in this browser (okundu.js): with the
 *     recipient hidden there can be no on-chain block list.
 *   - the old box, MesajKutusu: Mesaj events to or from the wallet, who wrote
 *     to whom public. With the private box on, these show under "Earlier
 *     messages (who wrote to whom is public)"; without it, exactly as before
 *     (sending, the on-chain Block).
 * Live: while the page is visible it asks Arc for new events every ~15 s
 * (both boxes; private ones are checked by view tag when the key is in
 * memory). Unread dots compare each conversation's newest incoming message
 * with the block last read in this browser (okundu.js; convenience only).
 * =========================================================================== */
import { el, temizle, S, SO, esit, adresMi, avatar, isim, eylem, durumSatiri, durumYaz, bosKutu, hesapIste, tarih, ikon } from "./ortak.js";
import * as O from "./okundu.js";

const UYARI = "Messages are end-to-end encrypted; who you write to and when is public on Arc.";
const UYARI2 = "Private box: the text and who it is for are hidden on Arc. Your wallet is visible as the sender (it pays the gas), with the time and a rounded size.";
const SIL_NOTU = "Delete and disappearing messages remove a message from this app for both sides; an encrypted copy stays in Arc's history (only the two of you can open it).";
const ESKI = "Earlier messages (who wrote to whom is public)";
export const CANLI_ARALIK = 15_000;

function ustBant() {
  return el("div", { sinif: "dz-mesaj-uyari" }, [ikon("kilit", 16), el("span", { yazi: SO.MESAJ2_VAR ? UYARI2 : UYARI })]);
}
const yenidenCiz = () => window.dispatchEvent(new HashChangeEvent("hashchange"));
/** Derive the unlock key (one signature) and tell the bell it can look for private messages. */
async function kilitAc(cuzdan) {
  const Sf = await import("../../js/designs/sifre.js");
  const sk = await Sf.acmaAnahtari(cuzdan);
  window.dispatchEvent(new CustomEvent("dz-anahtar"));
  return sk;
}

export async function mesajSayfasi({ cuzdan }, kiminle) {
  const kap = el("div", { sinif: "dz-mesaj-sayfa" });
  kap.append(el("div", { sinif: "dz-sayfa-ust" }, [el("h1", { yazi: "Inbox" })]), ustBant());
  if (!SO.MESAJ_VAR && !SO.MESAJ2_VAR) { kap.append(bosKutu("Messages open soon", "Wallet-to-wallet messages, encrypted in your browser, open when the message box is deployed on Arc.")); return kap; }
  const ben = cuzdan.hesap();
  if (!ben) {
    const b = eylem("Connect wallet", async () => { await hesapIste(); }, "dugme dugme--marka");
    kap.append(bosKutu("Connect to read your messages", "Your inbox is your wallet. Messages are opened in this browser with a key derived from your wallet's signature; nothing is stored.", el("div", {}, [b, b._durum])));
    if (kiminle && adresMi(kiminle)) kap.append(el("p", { sinif: "ds-cihaz", attr: { style: "text-align:center" } }, ["To write to ", isim(kiminle), ", connect first."]));
    return kap;
  }
  const v2 = SO.MESAJ2_VAR;
  const Sf = await import("../../js/designs/sifre.js");
  const M2 = v2 ? await import("./mesaj2.js") : null;
  let okumaHatasi = false;
  const [liste, benimAnahtar, olaylar2, silinen] = await Promise.all([
    SO.MESAJ_VAR ? SO.mesajlar(ben) : [], S.anahtarOku(ben).catch(() => "0x"),
    v2 ? SO.mesajlar2().catch(() => { okumaHatasi = true; return []; }) : [],
    v2 ? SO.silinenler2().catch(() => new Set()) : new Set()]);
  if (!benimAnahtar || benimAnahtar === "0x") {
    const T = await import("../../js/designs/teslim.js");
    kap.append(el("div", { sinif: "not not--uyari" }, [el("div", { sinif: "yigin" }, [el("div", { yazi: "Register your unlock key so others can write to you (one transaction; the same key receives design files)." }), T.anahtarKutusu(cuzdan)])]));
  }
  const sk = Sf.bellektekiAnahtar(ben);
  const acilan2 = v2 && sk ? await M2.tara(olaylar2, { sk, ben }) : [];
  let F = { ben, silinen, gizli: O.gizlenenler(ben), engel: O.engelliler(ben) };
  const gor = (m) => (m.surum === 2 ? M2.gorunurMu(m, F) : !(v2 && !esit(m.gonderen, ben) && F.engel.has(m.gonderen.toLowerCase())));

  /* conversations: `kon` = the private box when it is on, else the old box (as before); `kon1` = earlier (old box) */
  const kon = new Map(), kon1 = new Map();
  const yerlestir = (harita, o, m) => {
    const k = o.toLowerCase();
    if (!harita.has(k)) harita.set(k, { kim: o, mesajlar: [] });
    harita.get(k).mesajlar.push(m);
    return harita.get(k);
  };
  const kayit = (m) => (m.surum === 2 ? yerlestir(kon, m.kiminle, m) : yerlestir(v2 ? kon1 : kon, esit(m.gonderen, ben) ? m.alici : m.gonderen, m));
  for (const m of liste) kayit(m);
  for (const m of acilan2) kayit(m);
  if (kiminle && adresMi(kiminle) && !kon.has(kiminle.toLowerCase())) kon.set(kiminle.toLowerCase(), { kim: kiminle, mesajlar: [] });
  const gizli = await SO.gizliler().catch(() => new Set());

  const gorunen = (k) => k.mesajlar.filter(gor);
  /* newest incoming message of a conversation after the block read here: unread */
  const okunmadi = (k) => {
    const son = [...gorunen(k)].reverse().find((m) => !esit(m.gonderen, ben));
    if (!son || !Number.isInteger(son.blok)) return false;
    return son.blok > (O.okunanlar(ben)[k.kim.toLowerCase()] || 0);
  };
  const okunduIsaretle = (k) => {
    const son = k && k.mesajlar.filter((m) => Number.isInteger(m.blok)).at(-1);
    if (son) O.okunduYaz(ben, k.kim, son.blok);
  };
  if (kiminle && adresMi(kiminle)) { okunduIsaretle(kon.get(kiminle.toLowerCase())); okunduIsaretle(kon1.get(kiminle.toLowerCase())); }

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
  /* the private box needs the unlock key to find this wallet's messages at all */
  if (v2 && !sk) {
    const acB = eylem("Unlock private messages (one signature)", async (yaz) => { yaz("Sign in your wallet (nothing is sent)…"); await kilitAc(cuzdan); yaz(""); yenidenCiz(); }, "dugme dugme--marka dugme--kucuk");
    sol.append(el("div", { sinif: "dz-ac dz-gelen__kilit" }, [acB, acB._durum, el("div", { sinif: "ds-cihaz", yazi: "Private messages are found in this browser by trying your key on the shared box; the key is forgotten when you close the page." })]));
  }
  if (okumaHatasi) sol.append(el("div", { sinif: "ds-cihaz", attr: { style: "padding:8px 12px" }, yazi: "Could not read the private box from Arc right now; it will try again." }));
  const ogeler = el("div", { sinif: "dz-gelen__liste" });
  sol.append(ogeler);
  const sirala = (h) => [...h.values()].sort((a, b) => (gorunen(b).at(-1)?.blok || Infinity) - (gorunen(a).at(-1)?.blok || Infinity));
  const oge = (k) => {
    const g = gorunen(k), son = g.at(-1);
    const yeniMi = !esit(k.kim, kiminle) && okunmadi(k);
    return el("a", { sinif: "dz-gelen__oge" + (yeniMi ? " dz-gelen__oge--yeni" : ""), attr: { href: "#/messages/" + k.kim, "aria-current": esit(k.kim, kiminle) ? "page" : null } }, [
      avatar(k.kim, 44),
      el("span", { sinif: "dz-gelen__metin" }, [isim(k.kim), el("span", { sinif: "ds-cihaz", yazi: son ? (esit(son.gonderen, ben) ? "You · " : "") + tarih(son.zaman) + " · " + g.length + " message" + (g.length > 1 ? "s" : "") : "New conversation" })]),
      yeniMi ? el("span", { sinif: "dz-okunmadi", attr: { role: "img", "aria-label": "unread", title: "New message" } }) : null]);
  };
  const listeCiz = () => {
    temizle(ogeler);
    const ana = sirala(kon).filter((k) => !k.mesajlar.length || gorunen(k).length || esit(k.kim, kiminle));
    const eski = sirala(kon1).filter((k) => gorunen(k).length);
    if (!ana.length && !eski.length) { ogeler.append(el("div", { sinif: "ds-cihaz", attr: { style: "padding:12px" }, yazi: "No messages yet. Open a profile and press Message, or type an address above." })); return; }
    for (const k of ana) ogeler.append(oge(k));
    if (eski.length) {
      ogeler.append(el("div", { sinif: "dz-gelen__baslik", yazi: ESKI }));
      for (const k of eski) ogeler.append(oge(k));
    }
  };
  listeCiz();
  const sag = el("section", { sinif: "dz-konusma" });
  kap.append(el("div", { sinif: "dz-mesaj-izgara" + (kiminle ? " dz-mesaj-izgara--acik" : "") }, [sol, sag]));

  let acik = null;   // the open conversation ({ ekle(m), sil() })
  const ortak = { cuzdan, ben, M2, silinen, gor, yenile: () => { F = { ben, silinen, gizli: O.gizlenenler(ben), engel: O.engelliler(ben) }; listeCiz(); } };
  if (!kiminle) sag.append(el("div", { sinif: "dz-konusma__bos" }, [ikon("mesaj", 48), el("div", { yazi: "Choose a conversation" })]));
  else if (!adresMi(kiminle)) sag.append(bosKutu("Not a wallet address", kiminle));
  else if (gizli.has(kiminle.toLowerCase())) sag.append(bosKutu("This profile is hidden", "The moderator hid this profile after a report."));
  else {
    const k = kiminle.toLowerCase();
    const eskiler = v2 ? (kon1.get(k) || { mesajlar: [] }).mesajlar : (kon.get(k) || { mesajlar: [] }).mesajlar;
    const ozeller = v2 ? (kon.get(k) || { mesajlar: [] }).mesajlar : [];
    acik = await konusma(sag, ortak, kiminle, eskiler, ozeller, v2 && !sk);
  }

  canliBaslat({ kap, ben, liste, olaylar2, M2, silinen,
    yeniler: (l) => {
      for (const m of l) {
        const k = kayit(m);
        if (acik && esit(k.kim, kiminle)) { acik.ekle(m); okunduIsaretle(k); }
      }
      listeCiz();
    },
    silindi: () => { if (acik) acik.sil(); else ortak.yenile(); } });
  return kap;
}

/* poll both boxes for new events while the page is shown and visible; stops when the page is left */
function canliBaslat({ kap, ben, liste, olaylar2, M2, silinen, yeniler, silindi }) {
  const enSon = (l) => l.reduce((a, m) => (Number.isInteger(m.blok) && m.blok > a ? m.blok : a), -1);
  let son = enSon(liste), son2 = enSon(olaylar2);
  const gorulen = new Set([...liste, ...olaylar2].map((m) => m.tx + ":" + m.sira));
  const taze = (l) => l.filter((m) => { const k = m.tx + ":" + m.sira; if (gorulen.has(k)) return false; gorulen.add(k); return true; });
  let calisiyor = false, ilk = true;
  const tur = async () => {
    if (!kap.isConnected && !ilk) { clearInterval(z); document.removeEventListener("visibilitychange", gorunurlukte); return; }
    ilk = false;
    if (calisiyor || document.visibilityState !== "visible") return;
    calisiyor = true;
    try {
      const yeni = [];
      if (SO.MESAJ_VAR) {
        if (son < 0) son = await (await S.arc()).getBlockNumber();
        const l = taze(await SO.mesajlar(ben, son));
        for (const m of l) if (m.blok > son) son = m.blok;
        yeni.push(...l);
      }
      if (M2) {
        if (son2 < 0) son2 = await (await S.arc()).getBlockNumber();
        const l = taze(await SO.mesajlar2(son2));
        for (const m of l) if (m.blok > son2) son2 = m.blok;
        const Sf = await import("../../js/designs/sifre.js");
        const sk = Sf.bellektekiAnahtar(ben);
        if (l.length && sk) yeni.push(...(await M2.tara(l, { sk, ben })));
      }
      if (yeni.length) yeniler(yeni);
      if (M2) {
        /* deletions by senders, and messages whose disappearing time has come */
        const s = await SO.silinenler2().catch(() => null);
        if (s) for (const id of s) silinen.add(id);
        silindi();
      }
    } catch (e) { /* the next round tries again */ }
    finally { calisiyor = false; }
  };
  const z = setInterval(tur, CANLI_ARALIK);
  const gorunurlukte = () => { if (document.visibilityState === "visible") tur(); };
  document.addEventListener("visibilitychange", gorunurlukte);
  kap._canli = tur;   // for tests and an immediate refresh
}

async function konusma(sag, ortak, kim, mesajlar, ozeller, kilitli) {
  const { cuzdan, ben, M2, silinen, gor } = ortak;
  const v2 = !!M2;
  const bd = durumSatiri();
  const engelD = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" } });
  let engel;
  if (v2) {
    /* the private box hides recipients, so a block lives in this browser */
    engel = O.engelliler(ben).has(kim.toLowerCase());
    const engelYaz = () => { engelD.textContent = engel ? "Unblock" : "Block"; engelD.title = engel ? "Show this wallet's messages again" : "Hide this wallet's messages in this browser (the private box has no on-chain block list: recipients are hidden)"; };
    engelYaz();
    engelD.addEventListener("click", () => {
      engel = !engel; O.engelYaz(ben, kim, engel); engelYaz();
      if (!engel) { yenidenCiz(); return; }   // their messages come back: draw the page again
      durumYaz(bd, "Blocked in this browser: their messages are hidden here. They can still post to the shared box; you will not see it.", "ok");
      ortak.yenile(); yenile();
    });
  } else {
    engel = !!(await SO.engelliMi(ben, kim).catch(() => false));
    const engelYaz = () => { engelD.textContent = engel ? "Unblock" : "Block"; engelD.title = engel ? "Let this wallet message you again" : "This wallet's messages to you will be refused on Arc (public)"; };
    engelYaz();
    engelD.addEventListener("click", async () => {
      engelD.disabled = true;
      try {
        await SO.mesajGonder({ cuzdan, data: SO.veriM.engelle(kim, !engel), durum: (m, t) => durumYaz(bd, m, t), aciklama: engel ? "Confirm unblocking" : "Confirm blocking" });
        engel = !engel; engelYaz(); durumYaz(bd, engel ? "Blocked. Their messages to you are refused." : "Unblocked.", "ok");
      } catch (e) { durumYaz(bd, SO.hataAcikla(e), "hata"); } finally { engelD.disabled = false; }
    });
  }
  /* disappearing messages: the sender's choice per conversation, written inside each envelope */
  let kaybol = null;
  if (v2) {
    kaybol = el("select", { sinif: "girdi dz-kaybol", attr: { "aria-label": "Disappearing messages", title: "Messages you send from now on disappear from the app for both sides after this time (an encrypted copy stays on Arc)" } },
      M2.SURELER.map(([sn, ad]) => el("option", { yazi: "Disappearing: " + ad, attr: { value: String(sn) } })));
    kaybol.value = String(O.kaybolma(ben, kim));
    kaybol.addEventListener("change", () => { O.kaybolmaYaz(ben, kim, Number(kaybol.value)); durumYaz(bd, Number(kaybol.value) ? "New messages you send here disappear after " + kaybol.selectedOptions[0].textContent.replace("Disappearing: ", "") + ". " + SIL_NOTU : "Disappearing messages off for new messages.", "ok"); });
  }
  sag.append(el("header", { sinif: "dz-konusma__ust" }, [
    el("a", { sinif: "dz-geri", attr: { href: "#/messages", "aria-label": "Back to conversations" } }, [ikon("geri")]),
    el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + kim } }, [avatar(kim, 36), isim(kim)]), el("span", { sinif: "dz-konusma__eylem", attr: { style: "margin-left:auto" } }, [kaybol, engelD])]), bd);

  const akis = el("div", { sinif: "dz-balonlar", attr: { "aria-live": "polite" } });
  sag.append(akis);
  const Sf = await import("../../js/designs/sifre.js");
  const M = await import("./mesaj.js");
  /* old box: opened with the unlock key (v1 envelope) */
  const balon = (m) => {
    const benden = esit(m.gonderen, ben);
    const metin = el("div", { sinif: "dz-balon__metin", yazi: "🔒 Encrypted" });
    const b = el("div", { sinif: "dz-balon" + (benden ? " dz-balon--ben" : ""), attr: { "data-surum": "1" } }, [metin, el("a", { sinif: "dz-balon__zaman", attr: { href: S.TASARIM.kasif + "/tx/" + m.tx, target: "_blank", rel: "noopener" }, yazi: tarih(m.zaman) })]);
    b._m = m;
    b._ac = async (sk) => { try { metin.textContent = await M.coz(m.sifreli, { sk, ben, gonderen: m.gonderen }); } catch (e) { metin.textContent = "Could not open this message (it was encrypted to another key)."; metin.classList.add("dz-balon__hata"); } };
    return b;
  };
  /* private box: already opened by the scan */
  const balon2 = (m) => {
    const benden = esit(m.gonderen, ben);
    const alt = el("div", { sinif: "dz-balon__alt" }, [
      el("a", { sinif: "dz-balon__zaman", attr: { href: m.tx ? S.TASARIM.kasif + "/tx/" + m.tx : "#", target: "_blank", rel: "noopener" }, yazi: tarih(m.zaman) }),
      m.bitis ? el("span", { sinif: "dz-balon__zaman dz-balon__bitis", attr: { title: SIL_NOTU }, yazi: "disappears " + tarih(m.bitis * 1000) }) : null]);
    const b = el("div", { sinif: "dz-balon" + (benden ? " dz-balon--ben" : ""), attr: { "data-surum": "2", "data-id": String(m.id || "").toLowerCase() } }, [el("div", { sinif: "dz-balon__metin", yazi: m.metin }), alt]);
    b._m = m;
    const dugme = el("button", { sinif: "dz-balon__eylem", attr: { type: "button", title: benden ? "Delete for both sides (one transaction). " + SIL_NOTU : "Hide this message in this browser" }, yazi: benden ? "Delete" : "Hide" });
    dugme.addEventListener("click", async () => {
      dugme.disabled = true;
      try {
        const id = String(b._m.id || "").toLowerCase();
        if (!id) throw new Error("Wait for Arc to confirm the message first.");
        if (benden) {
          const n = await SO.nonceBul2(ben, id);
          if (n < 0) throw new Error("That message was not sent by this wallet.");
          await SO.mesaj2Gonder({ cuzdan, data: SO.veriM2.sil(n), durum: (x, t) => durumYaz(bd, x, t), aciklama: "Confirm deleting the message" });
          silinen.add(id);
          durumYaz(bd, "Deleted: removed from the app for both sides. An encrypted copy stays in Arc's history.", "ok");
        } else {
          O.gizle(ben, id);
          durumYaz(bd, "Hidden in this browser.", "ok");
        }
        ortak.yenile(); yenile();
      } catch (e) { durumYaz(bd, SO.hataAcikla(e), "hata"); dugme.disabled = false; }
    });
    alt.append(dugme);
    return b;
  };
  const balonlar = mesajlar.filter(gor).map(balon);
  const balonlar2 = ozeller.filter(gor).map(balon2);
  const bos = () => el("div", { sinif: "ds-cihaz dz-balonlar__bos", yazi: "No messages yet. Say hello." });
  if (v2 && balonlar.length) akis.append(el("div", { sinif: "dz-balonlar__ayrac", yazi: ESKI }), ...balonlar, el("div", { sinif: "dz-balonlar__ayrac dz-balonlar__ayrac--ozel", yazi: "Private box" }));
  else akis.append(...balonlar);
  akis.append(...balonlar2);
  if (!balonlar.length && !balonlar2.length) akis.append(kilitli ? el("div", { sinif: "ds-cihaz dz-balonlar__bos", yazi: "Unlock your private messages to see this conversation." }) : bos());
  /* bubbles that should no longer show (deleted, hidden, disappeared, blocked) */
  function yenile() {
    for (const b of [...akis.querySelectorAll(".dz-balon")]) if (b._m && !gor(b._m)) b.remove();
    if (!akis.querySelector(".dz-balon") && !akis.querySelector(".dz-balonlar__bos")) akis.append(bos());
  }
  const acDugme = eylem("Unlock messages (one signature)", async (yaz) => {
    const sk = v2 ? await kilitAc(cuzdan) : await Sf.acmaAnahtari(cuzdan);
    if (v2 && kilitli) { yaz(""); yenidenCiz(); return; }
    await Promise.all(balonlar.map((b) => b._ac(sk)));
    acKutu.remove(); yaz("");
    akis.scrollTop = akis.scrollHeight;
  }, "dugme dugme--kucuk");
  const acKutu = el("div", { sinif: "dz-ac" }, [acDugme, acDugme._durum, el("div", { sinif: "ds-cihaz", yazi: "Signing derives your private unlock key in this browser; it sends nothing and is forgotten when you close the page." })]);
  const hazir = Sf.bellektekiAnahtar(ben);
  if (balonlar.length || (v2 && kilitli)) {
    if (hazir) Promise.all(balonlar.map((b) => b._ac(hazir))).then(() => { akis.scrollTop = akis.scrollHeight; });
    else sag.append(acKutu);
  }

  /* compose */
  const azami = v2 ? M2.ACIK_AZAMI : M.ACIK_AZAMI;
  const yazi = el("textarea", { sinif: "girdi dz-yaz", attr: { rows: "2", placeholder: "Message…", "aria-label": "Message", maxlength: String(azami) } });
  const sd = durumSatiri();
  const NEDEN = { 1: "Your wallet is muted by the moderator.", 2: "This wallet has blocked you.", 3: "This wallet has not registered an unlock key yet, so it cannot receive encrypted messages. Ask them to register it (Profile → Unlock key).", 4: "Too many messages in a minute. Wait a moment.", 5: "Not a wallet you can write to." };
  const gonderdiklerim = new Set();   // ciphertexts sent from this tab (already shown when their event arrives)
  const gonder = eylem("Send", async (yaz) => {
    const metin = yazi.value.trim();
    if (!metin) throw new Error("Write a message first.");
    let b;
    if (v2) {
      if (esit(kim, ben)) throw new Error(NEDEN[5]);
      const n = await SO.gonderilebilir2(ben);
      if (n) throw new Error(NEDEN[n] || "Cannot send now (" + n + ").");
      /* MesajKutusu2 cannot check the recipient's key (it never sees the recipient): checked here */
      const aliciPub = await S.anahtarOku(kim).catch(() => "0x");
      if (!aliciPub || aliciPub === "0x") throw new Error(NEDEN[3]);
      yaz("Sign to derive your unlock key, so you can reread what you send (nothing is sent)…");
      const sk = await kilitAc(cuzdan);
      const sifreli = await M2.sifrele(metin, { alici: kim, aliciPub, ben, benPub: sk.compressedPublicKey, sure: O.kaybolma(ben, kim) });
      gonderdiklerim.add(String(sifreli).toLowerCase());
      const { h, m: makbuz } = await SO.mesaj2Gonder({ cuzdan, data: SO.veriM2.gonder(sifreli), durum: yaz, aciklama: "Confirm sending the private message" });
      let id = "", blok;
      for (const l of (makbuz && makbuz.logs) || []) {
        if (!esit(l.address, SO.SOSYAL.mesaj2)) continue;
        try { const e = SO.ifcM2.parseLog(l); if (e && e.name === "Mesaj") { id = String(e.args.id).toLowerCase(); blok = makbuz.blockNumber; } } catch (x) { /* another event */ }
      }
      const a = await M2.coz(sifreli, { sk, ben, gonderen: ben });
      b = balon2({ surum: 2, ...a, gonderen: ben, kiminle: kim, id, sifreli, zaman: Date.now(), tx: h, blok });
    } else {
      const n = await SO.gonderilebilir(ben, kim);
      if (n) throw new Error(NEDEN[n] || "Cannot send now (" + n + ").");
      const aliciPub = await S.anahtarOku(kim);
      yaz("Sign to derive your unlock key, so you can reread what you send (nothing is sent)…");
      const sk = await Sf.acmaAnahtari(cuzdan);
      const sifreli = await M.sifrele(metin, { alici: kim, aliciPub, ben, benPub: sk.compressedPublicKey });
      gonderdiklerim.add(String(sifreli).toLowerCase());
      await SO.mesajGonder({ cuzdan, data: SO.veriM.gonder(kim, sifreli), durum: yaz, aciklama: "Confirm sending the encrypted message" });
      b = balon({ gonderen: ben, alici: kim, sifreli, zaman: Date.now(), tx: "" });
      await b._ac(sk);
    }
    akis.querySelector(".dz-balonlar__bos")?.remove();
    akis.append(b);
    akis.scrollTop = akis.scrollHeight;
    yazi.value = ""; yaz("Sent. " + (v2 ? UYARI2 : UYARI), "ok");
  }, "dugme dugme--marka", sd);
  yazi.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) gonder.click(); });
  sag.append(el("div", { sinif: "dz-yazma" }, [yazi, gonder]), sd);
  if (v2) {
    sag.append(el("p", { sinif: "ds-cihaz dz-mesaj-not", yazi: UYARI2 + " " + SIL_NOTU + " Block and Hide work in this browser only." }));
    Promise.all([S.anahtarOku(kim).catch(() => "0x"), SO.gonderilebilir2(ben).catch(() => 0)]).then(([k, n]) => {
      if (esit(kim, ben)) durumYaz(sd, NEDEN[5], "hata");
      else if (!k || k === "0x") durumYaz(sd, NEDEN[3], "hata");
      else if (n === 1) durumYaz(sd, NEDEN[1], "hata");
    });
  } else {
    const durum = await SO.gonderilebilir(ben, kim).catch(() => null);
    if (durum && durum !== 0 && durum !== 4) durumYaz(sd, NEDEN[durum] || "", "hata");
  }
  akis.scrollTop = akis.scrollHeight;

  return {
    /* a message that arrived live: a bubble at the bottom (v1: opened at once when the key is in memory) */
    ekle(m) {
      if (esit(m.gonderen, ben) && gonderdiklerim.has(String(m.sifreli).toLowerCase())) {
        /* my own message from this tab: make sure its bubble has the id (for Delete) */
        const b = [...akis.querySelectorAll('.dz-balon[data-surum="2"]')].find((x) => x._m && String(x._m.sifreli).toLowerCase() === String(m.sifreli).toLowerCase());
        if (b && m.id) { b._m = { ...b._m, id: m.id, blok: m.blok, tx: m.tx }; b.setAttribute("data-id", String(m.id).toLowerCase()); }
        return;
      }
      if (!gor(m)) return;
      const b = m.surum === 2 ? balon2(m) : balon(m);
      akis.querySelector(".dz-balonlar__bos")?.remove();
      const altta = akis.scrollHeight - akis.scrollTop - akis.clientHeight < 60;
      akis.append(b);
      if (m.surum !== 2) {
        balonlar.push(b);
        const sk = Sf.bellektekiAnahtar(ben);
        if (sk) b._ac(sk).then(() => { if (altta) akis.scrollTop = akis.scrollHeight; });
        else if (!acKutu.isConnected) sag.insertBefore(acKutu, sag.querySelector(".dz-yazma"));
      }
      if (altta) akis.scrollTop = akis.scrollHeight;
    },
    /* deletions and disappearing times since the last look */
    sil() { ortak.yenile(); yenile(); }
  };
}
