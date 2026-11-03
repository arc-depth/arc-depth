/* ===========================================================================
 * designs/js/isler.js — Jobs: hire a designer (SiparisKaydi on Arc)
 *
 *   #/jobs              every job: Open / Posted by me / My work / All
 *   #/jobs/new[?to=0x…] post a job (brief, USDC budget held in escrow,
 *                       deadline, optionally addressed to one designer)
 *   #/jobs/<id>         one job: brief, budget, deadline, applicants,
 *                       deliveries, history, and the buttons for the
 *                       client (pick, extend, cancel, refund, approve, ask
 *                       for changes, dispute), the designer (apply, accept,
 *                       deliver, step back, post the file key, dispute) and
 *                       anyone (release the payment after the review window)
 *
 * The brief, notes and links are untrusted text: shown as text, links only
 * when they are https:, ipfs: or ar:. A delivered design NFT waits in the
 * contract and moves to the client with the payment; its file key, encrypted
 * to the client's registered unlock key, is in the delivery event, so the
 * client can open the file before approving. Nothing is stored off chain.
 * =========================================================================== */
import { parseUnits } from "../../vendor/ethers.min.js";
import { el, temizle, S, SO, usd, kisa, esit, tarih, adresMi, avatar, isim, karo, eylem, durumSatiri, bosKutu, hesapIste, yukleniyor } from "./ortak.js";
import * as Si from "./siparis.js";

const cevir = (e) => Si.siparisHatasi(e) || SO.hataAcikla(e);
const ust = (yazi, alt, sag) => el("div", { sinif: "dz-sayfa-ust dz-is-ust" }, [el("div", {}, [el("h1", { yazi }), alt ? el("p", { yazi: alt }) : null]), sag || null]);
const yakinda = () => bosKutu("Jobs open soon", "Hire a designer with a USDC budget held in escrow on Arc until you approve the work. The commissions contract is being deployed.");
const guvenliLink = (u) => /^(https:\/\/|ipfs:\/\/|ar:\/\/)[^\s<>"']+$/i.test(String(u || "").trim());
function linkVeyaMetin(u) {
  const s = String(u || "").trim();
  if (!s) return el("span", { sinif: "ds-cihaz", yazi: "—" });
  if (!guvenliLink(s)) return el("span", { sinif: "ds-mono", yazi: s.slice(0, 200) });
  const href = s.replace(/^ipfs:\/\//i, "https://ipfs.io/ipfs/").replace(/^ar:\/\//i, "https://arweave.net/");
  return el("a", { attr: { href, target: "_blank", rel: "noopener nofollow ugc noreferrer" }, yazi: s.slice(0, 120) + " ↗" });
}
const kalan = (ms) => {
  const s = Math.round((ms - Date.now()) / 1000);
  if (s <= 0) return "passed";
  const g = Math.floor(s / 86400), sa = Math.floor((s % 86400) / 3600), dk = Math.floor((s % 3600) / 60);
  return g ? g + "d " + sa + "h left" : sa ? sa + "h " + dk + "m left" : dk + "m left";
};
const rozet = (j) => el("span", { sinif: "ds-rozet dz-is-durum dz-is-durum--" + j.durum, yazi: Si.DURUM_ADI[j.durum] || "?" });

/** Send calldata to SiparisKaydi (or another `to`) from the visitor's wallet, simulated first. */
async function gonder({ cuzdan, to = Si.SIPARIS.adres, data, durum, aciklama }) {
  const ben = await hesapIste();
  try { await S.onceDene(ben, to, data); } catch (e) { throw new Error(cevir(e)); }
  durum && durum((aciklama || "Confirm in your wallet") + " (on Arc, a fraction of a cent of gas)…");
  let h;
  try { h = await cuzdan.agdaGonder(await S.arcAg(), { to, data, value: "0x0" }); } catch (e) { throw new Error(cevir(e)); }
  durum && durum("Sent. Waiting for Arc to confirm…");
  return S.makbuz(h, durum);
}
const yenile = (ms = 1500) => setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), ms);

/* ======================================================================
 * LIST
 * ====================================================================== */
export async function isListesi({ cuzdan, param }) {
  const kap = el("div", { sinif: "dz-isler" });
  kap.append(ust("Jobs", "Hire a designer: post a brief with a USDC budget held in escrow on Arc. The designer is paid when you approve the work.",
    el("a", { sinif: "dugme dugme--marka", attr: { href: "#/jobs/new" }, yazi: "Post a job" })));
  if (!Si.SIPARIS_VAR) { kap.append(yakinda()); return kap; }
  const ben = cuzdan.hesap();
  const [liste, ay] = await Promise.all([Si.isler(), Si.ayarlar().catch(() => null)]);
  const SEKME = [["acik", "Open"], ["benim", "Posted by me"], ["isim", "My work"], ["hepsi", "All"]];
  let sekme = SEKME.some(([k]) => k === param.get("f")) ? param.get("f") : "acik";
  const cipler = el("div", { sinif: "dz-cipler", attr: { role: "tablist", "aria-label": "Filter jobs" } });
  const govde = el("div", { sinif: "dz-is-liste" });
  const filtre = (j) => sekme === "hepsi" ? true
    : sekme === "acik" ? j.durum === Si.DURUM.ACIK && j.son > Date.now()
      : sekme === "benim" ? esit(j.musteri, ben)
        : esit(j.tasarimci, ben) || esit(j.hedef, ben) || false;
  const ciz = () => {
    temizle(cipler);
    for (const [k, y] of SEKME) cipler.append(el("button", { sinif: "dz-cip", attr: { type: "button", role: "tab", "aria-selected": String(k === sekme), "data-filtre": k }, yazi: y,
      on: { click: () => { sekme = k; history.replaceState(null, "", "#/jobs?f=" + k); ciz(); } } }));
    temizle(govde);
    if ((sekme === "benim" || sekme === "isim") && !ben) { govde.append(bosKutu("Connect a wallet", "Your jobs are the ones your wallet posted or works on.")); return; }
    const l = liste.filter(filtre);
    if (!l.length) { govde.append(bosKutu(sekme === "acik" ? "No open jobs right now" : "Nothing here yet", sekme === "acik" ? "Post the first one." : "")); return; }
    for (const j of l) govde.append(isKarti(j, ben));
  };
  ciz();
  kap.append(cipler, govde);
  if (ay) kap.append(ucretNotu(ay));
  return kap;
}

function isKarti(j, ben) {
  const net = Si.netHesapla(j.butce, j.ucretBps).net;
  return el("a", { sinif: "dz-is-kart", attr: { href: "#/jobs/" + j.id, "data-is": String(j.id) } }, [
    el("div", { sinif: "dz-is-kart__ust" }, [el("b", { sinif: "dz-is-kart__ad", yazi: Si.baslikOf(j.brief) }), rozet(j)]),
    el("div", { sinif: "dz-is-kart__alt" }, [
      el("span", { sinif: "dz-is-butce", yazi: usd(j.butce) + " USDC" }),
      el("span", { yazi: j.durum === Si.DURUM.ACIK || j.durum === Si.DURUM.ATANDI ? "Due " + tarih(j.son) + " · " + kalan(j.son) : "Due " + tarih(j.son) }),
      j.hedef ? el("span", {}, ["For ", isim(j.hedef)]) : el("span", { yazi: j.basvuruSayisi + (j.basvuruSayisi === 1 ? " applicant" : " applicants") }),
      el("span", {}, ["by ", esit(j.musteri, ben) ? "you" : isim(j.musteri)]),
      el("span", { sinif: "ds-cihaz", yazi: "designer gets " + usd(net) })])]);
}

function ucretNotu(ay) {
  const p = ay.paylar;
  return el("p", { sinif: "ds-cihaz dz-is-not", yazi: "Platform fee: " + ay.ucretBps / 100 + "% of what the designer is paid, only when they are paid (" + p.yakim / 100 + "% of it buys ARCP and burns it, " + p.gelistirici / 100 + "% dev fund, " + p.pazarlama / 100 + "% marketing, " + p.sahip / 100 + "% owner). Posting, applying and delivering cost only gas. A refund returns the whole budget. Review window " + Math.round(ay.inceleme / 3600) + " h; disputes go to the arbiter (the ARC PULSE moderator wallet, later the DAO)." });
}

/* ======================================================================
 * POST A JOB
 * ====================================================================== */
export async function isYeni({ cuzdan, param }) {
  const kap = el("div", { sinif: "dz-isler" });
  kap.append(ust("Post a job", "Describe the work, set a budget and a deadline. The budget waits in the contract until you approve the delivery."));
  if (!Si.SIPARIS_VAR) { kap.append(yakinda()); return kap; }
  const ay = await Si.ayarlar();
  const d = durumSatiri();
  const brief = el("textarea", { sinif: "girdi dz-is-brief", attr: { rows: "8", placeholder: "First line = title. Then the brief: what you need, style, formats, size, references (links).", "aria-label": "Brief" } });
  const sayac = el("span", { sinif: "dz-yorum-sayac", yazi: "0 / " + Si.BRIEF_AZAMI });
  brief.addEventListener("input", () => { const n = Si.bayt(brief.value); sayac.textContent = n + " / " + Si.BRIEF_AZAMI; sayac.classList.toggle("dz-yorum-sayac--asim", n > Si.BRIEF_AZAMI); });
  const asgari = Number(ay.asgariButce) / 1e6;
  const butce = el("input", { sinif: "girdi", attr: { type: "number", min: String(Math.max(asgari, 0.01)), step: "0.01", placeholder: "Budget in USDC", "aria-label": "Budget in USDC" } });
  const varsayilan = new Date(Date.now() + 7 * 86400_000);
  const yerel = (t) => new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const son = el("input", { sinif: "girdi", attr: { type: "datetime-local", value: yerel(varsayilan), "aria-label": "Delivery deadline" } });
  const hedef = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "Optional: 0x… or @handle of one designer", "aria-label": "Addressed to (optional)", autocapitalize: "none", spellcheck: "false", value: adresMi(param.get("to")) ? param.get("to") : "" } });
  const ozet = el("div", { sinif: "ds-cihaz dz-is-ozet", attr: { "aria-live": "polite" } });
  const ozetCiz = () => {
    const v = Number(butce.value);
    if (!(v > 0)) { ozet.textContent = "Minimum budget " + usd(ay.asgariButce) + "."; return; }
    const b = parseUnits(String(v.toFixed(6)), 6);
    const { ucret, net } = Si.netHesapla(b, ay.ucretBps);
    ozet.textContent = "Escrow " + usd(b) + " · the designer receives " + usd(net) + " after the " + ay.ucretBps / 100 + "% platform fee (" + usd(ucret) + ") when you approve. Cancel before picking a designer, or no delivery by the deadline: the whole " + usd(b) + " comes back.";
  };
  butce.addEventListener("input", ozetCiz); ozetCiz();
  const gonderB = eylem("Approve USDC and post", async (yaz) => {
    const ben = await hesapIste();
    const metin = brief.value.trim();
    const n = Si.bayt(metin);
    if (!n) throw new Error("Write the brief first.");
    if (n > Si.BRIEF_AZAMI) throw new Error("The brief is " + n + " bytes; at most " + Si.BRIEF_AZAMI + ".");
    const v = Number(butce.value);
    if (!(v > 0)) throw new Error("Enter a budget in USDC.");
    const b = parseUnits(String(v.toFixed(6)), 6);
    if (b < ay.asgariButce) throw new Error("The minimum budget is " + usd(ay.asgariButce) + ".");
    const t = new Date(son.value).getTime();
    if (!(t > Date.now() + 3600_000)) throw new Error("The deadline must be at least an hour from now.");
    if (t > Date.now() + 365 * 86400_000) throw new Error("The deadline must be within a year.");
    let h = hedef.value.trim();
    if (h.startsWith("@")) { const a = await SO.sahibi(h.slice(1).toLowerCase()).catch(() => null); if (!a) throw new Error("No profile has the handle " + h + "."); h = a; }
    if (h && !adresMi(h)) throw new Error("Addressed to: a wallet address (0x…) or an @handle, or leave it empty.");
    if (h && esit(h, ben)) throw new Error("You cannot address a job to yourself.");
    const bakiye = await (await S.erc20(S.TASARIM.usdc)).balanceOf(ben).catch(() => null);
    if (bakiye != null && bakiye < b) throw new Error("Not enough USDC on Arc: you have " + usd(bakiye) + ".");
    if ((await Si.usdcIzni(ben).catch(() => 0n)) < b) {
      await gonder({ cuzdan, to: S.TASARIM.usdc, data: S.veri.onay(Si.SIPARIS.adres, b), durum: yaz, aciklama: "Approve " + usd(b) + " USDC for the commissions contract" });
    }
    const m = await gonder({ cuzdan, data: Si.veriS.isAc(metin, b, Math.floor(t / 1000), h || null), durum: yaz, aciklama: "Confirm posting the job (" + usd(b) + " USDC into escrow)" });
    const log = m.logs.map((l) => { try { return Si.ifcS.parseLog(l); } catch (e) { return null; } }).find((e) => e && e.name === "IsAcildi");
    yaz("Posted. Opening the job…", "ok");
    setTimeout(() => { location.hash = log ? "#/jobs/" + log.args.id : "#/jobs?f=benim"; }, 900);
  }, "dugme dugme--marka", d, cevir);
  kap.append(el("div", { sinif: "ds-kutu ds-form dz-is-form" }, [
    el("label", {}, ["Brief", brief, sayac]),
    el("div", { sinif: "dz-is-iki" }, [el("label", {}, ["Budget (USDC on Arc)", butce]), el("label", {}, ["Delivery deadline", son])]),
    el("label", {}, ["Addressed to", hedef, el("span", { sinif: "ds-cihaz", yazi: "Empty = any designer can apply and you pick one. Addressed = only that designer can take it." })]),
    ozet, el("div", { sinif: "ds-dugmeler" }, [gonderB]), d,
    el("p", { sinif: "ds-cihaz", yazi: "The brief is public on Arc (in the job's event) and stays in the chain's history. Do not put private details in it; use Messages for those." })]));
  kap.append(ucretNotu(ay));
  return kap;
}

/* ======================================================================
 * ONE JOB
 * ====================================================================== */
export async function isSayfasi({ cuzdan }, id) {
  const kap = el("div", { sinif: "dz-isler dz-is-sayfa" });
  if (!Si.SIPARIS_VAR) { kap.append(ust("Job #" + id), yakinda()); return kap; }
  const j = await Si.isOku(id);
  if (!j) { kap.append(bosKutu("No such job", "Job #" + id + " has not been posted.", el("a", { sinif: "dugme", attr: { href: "#/jobs" }, yazi: "All jobs" }))); return kap; }
  const ben = cuzdan.hesap();
  const musteri = esit(j.musteri, ben), tasarimci = esit(j.tasarimci, ben), hedefim = esit(j.hedef, ben);
  const { ucret, net } = Si.netHesapla(j.butce, j.ucretBps);
  const satirlar = j.brief.split(/\r?\n/);
  document.title = Si.baslikOf(j.brief) + " · Jobs · ARC PULSE Designs";

  kap.append(el("header", { sinif: "dz-is-baslik" }, [
    el("div", { sinif: "dz-is-kart__ust" }, [el("h1", { yazi: Si.baslikOf(j.brief) }), rozet(j)]),
    el("div", { sinif: "dz-is-meta" }, [
      el("span", { sinif: "dz-is-butce", yazi: usd(j.butce) + " USDC in escrow" }),
      el("span", { yazi: "Due " + tarih(j.son) + (j.durum <= Si.DURUM.ATANDI ? " · " + kalan(j.son) : "") }),
      el("span", { yazi: "Job #" + j.id })])]));
  kap.append(el("div", { sinif: "ds-kutu" }, [
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Client" }), el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + j.musteri } }, [avatar(j.musteri, 22), musteri ? "you" : isim(j.musteri)])]),
    j.hedef ? el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Addressed to" }), el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + j.hedef } }, [avatar(j.hedef, 22), hedefim ? "you" : isim(j.hedef)])]) : null,
    j.tasarimci ? el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Designer" }), el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + j.tasarimci } }, [avatar(j.tasarimci, 22), tasarimci ? "you" : isim(j.tasarimci)])]) : null,
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Designer receives" }), el("span", { yazi: usd(net) + " (" + j.ucretBps / 100 + "% platform fee: " + usd(ucret) + ")" })]),
    el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Review window" }), el("span", { yazi: Math.round(j.inceleme / 3600) + " h after a delivery · changes asked " + j.revizyon + " / " + j.revizyonHakki })])]));
  kap.append(el("section", { sinif: "ds-kutu dz-is-brief-metin" }, [el("h2", { yazi: "Brief" }), el("div", { sinif: "dz-is-govde", yazi: satirlar.slice(1).join("\n").trim() || satirlar[0] })]));

  const eylemler = el("section", { sinif: "dz-is-eylemler" });
  kap.append(eylemler);
  eylemKutulari({ cuzdan, j, ben, musteri, tasarimci, hedefim }).then((l) => { for (const x of l) if (x) eylemler.append(x); }).catch((e) => eylemler.append(el("div", { sinif: "ds-durum ds-durum--hata", yazi: (e && e.message) || String(e) })));

  /* applicants */
  if (!j.hedef && (j.basvurular.length || j.durum === Si.DURUM.ACIK)) {
    const liste = el("div", { sinif: "dz-is-basvurular" });
    for (const b of j.basvurular) {
      const d = durumSatiri();
      liste.append(el("div", { sinif: "dz-is-basvuru", attr: { "data-basvuran": b.tasarimci.toLowerCase() } }, [
        el("a", { sinif: "dz-kisi", attr: { href: "#/u/" + b.tasarimci } }, [avatar(b.tasarimci, 32), isim(b.tasarimci)]),
        el("div", { sinif: "dz-is-basvuru__not", yazi: b.not || "(no note)" }),
        musteri && j.durum === Si.DURUM.ACIK ? el("div", { sinif: "ds-dugmeler" }, [
          eylem("Pick", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.sec(j.id, b.tasarimci), durum: yaz, aciklama: "Confirm picking this designer" }); yaz("Picked.", "ok"); yenile(); }, "dugme dugme--marka dugme--kucuk", d, cevir),
          el("a", { sinif: "dugme dugme--kucuk", attr: { href: "#/messages/" + b.tasarimci }, yazi: "Message" })]) : null, d]));
    }
    if (!j.basvurular.length) liste.append(el("div", { sinif: "ds-cihaz", yazi: "No applications yet." }));
    kap.append(el("section", { sinif: "ds-kutu" }, [el("h2", { yazi: "Applicants (" + j.basvurular.length + ")" }), liste]));
  }

  /* deliveries */
  if (j.teslimler.length) {
    const yayinlar = await S.yayinlar().catch(() => []);
    kap.append(el("section", { sinif: "ds-kutu" }, [el("h2", { yazi: "Deliveries" }), ...j.teslimler.slice().reverse().map((t, i) => {
      const y = t.nftId ? yayinlar.find((x) => x.id === t.nftId) : null;
      return el("div", { sinif: "dz-is-teslim", attr: { "data-teslim": String(j.teslimler.length - i) } }, [
        el("div", { sinif: "ds-satir" }, [el("span", { yazi: i === 0 ? "Latest delivery" : "Earlier delivery" }), el("a", { attr: { href: S.TASARIM.kasif + "/tx/" + t.tx, target: "_blank", rel: "noopener" }, yazi: "block " + t.blok + " ↗" })]),
        t.uri ? el("div", { sinif: "ds-satir" }, [el("span", { yazi: "File link" }), linkVeyaMetin(t.uri)]) : null,
        !/^0x0{64}$/.test(t.dosyaHash) ? el("div", { sinif: "ds-satir" }, [el("span", { yazi: "File hash (SHA-256)" }), el("span", { sinif: "ds-mono", attr: { title: t.dosyaHash }, yazi: t.dosyaHash.slice(0, 18) + "…" })]) : null,
        t.nftId ? el("div", { sinif: "ds-satir" }, [el("span", { yazi: "Design NFT" }), el("a", { attr: { href: "#/d/" + t.nftId }, yazi: "#" + t.nftId + (t.zarf && t.zarf !== "0x" ? " · file key included" : " · file key not posted yet") })]) : null,
        y && i === 0 ? el("div", { sinif: "dz-izgara dz-izgara--tek" }, [karo(y, null, null)]) : null]);
    })]));
  }

  /* history */
  const ad = {
    IsAcildi: (a) => "Posted with " + usd(a.butce) + " in escrow", Basvuru: (a) => kisa(a.tasarimci) + " applied", Atandi: (a) => kisa(a.tasarimci) + " is working on it",
    Birakti: (a) => kisa(a.tasarimci) + " stepped back", SureUzatildi: (a) => "Deadline moved to " + tarih(Number(a.son) * 1000), Teslim: (a) => "Delivered" + (Number(a.nftId) ? " with design #" + a.nftId : ""),
    AnahtarGonderildi: () => "File key posted to the client", RevizyonIstendi: (a) => "Changes asked (" + a.revizyon + "): " + String(a.not_).slice(0, 140),
    ItirazAcildi: (a) => "Dispute opened by " + kisa(a.kim) + ": " + String(a.not_).slice(0, 140), Odendi: (a) => "Paid " + usd(a.tasarimciya) + " to the designer" + (a.otomatik ? " after the review window" : ""),
    Iptal: (a) => "Refunded " + usd(a.iade) + (Number(a.sebep) === 2 ? " (no delivery by the deadline)" : " (cancelled)"),
    ItirazCozuldu: (a) => "Arbiter: " + Number(a.tasarimciBps) / 100 + "% to the designer (" + usd(a.tasarimciya) + "), " + usd(a.musteriye) + " back to the client",
    UcretDagitildi: (a) => "Platform fee " + usd(a.yakim + a.gelistirici + a.pazarlama + a.sahip) + " (" + usd(a.yakim) + " for the ARCP burn)",
    NftDevredildi: (a) => a.basarili ? "Design #" + a.nftId + " moved to " + kisa(a.kime) : "Design #" + a.nftId + " could not move (taken down)"
  };
  kap.append(el("details", { sinif: "ds-kutu" }, [el("summary", { yazi: "History on Arc (" + j.olaylar.length + ")" }), el("div", { sinif: "ds-gecmis" }, j.olaylar.map((o) =>
    el("div", { sinif: "ds-gecmis__oge" }, [el("span", { yazi: ad[o.ad] ? ad[o.ad](o.args) : o.ad }), el("a", { attr: { href: S.TASARIM.kasif + "/tx/" + o.tx, target: "_blank", rel: "noopener" }, yazi: "block " + o.blok + " ↗" })])))]));
  return kap;
}

/* the buttons for whoever is looking */
async function eylemKutulari({ cuzdan, j, ben, musteri, tasarimci, hedefim }) {
  const kutular = [];
  const kutu = (baslik, ...icerik) => el("div", { sinif: "ds-kutu dz-is-eylem" }, [el("h3", { yazi: baslik }), ...icerik]);
  const not = (ph) => el("textarea", { sinif: "girdi", attr: { rows: "3", maxlength: String(Si.NOT_AZAMI * 2), placeholder: ph, "aria-label": ph } });
  const notKontrol = (t) => { if (Si.bayt(t.value) > Si.NOT_AZAMI) throw new Error("At most " + Si.NOT_AZAMI + " bytes."); return t.value.trim(); };
  const simdi = Date.now();
  const D = Si.DURUM;

  if (j.durum === D.ACIK) {
    if (musteri) {
      const d = durumSatiri();
      kutular.push(kutu("Your job is open", el("p", { sinif: "ds-cihaz", yazi: j.hedef ? "Waiting for the addressed designer to accept." : "Pick one of the applicants below. Until then you can cancel and get the whole budget back." }),
        el("div", { sinif: "ds-dugmeler" }, [eylem("Cancel and refund " + usd(j.butce), async (yaz) => { await gonder({ cuzdan, data: Si.veriS.iptalEt(j.id), durum: yaz, aciklama: "Confirm cancelling (the budget comes back)" }); yaz("Cancelled and refunded.", "ok"); yenile(); }, "dugme", d, cevir)]), d, sureKutusu()));
    } else if (j.hedef) {
      if (hedefim) {
        const d = durumSatiri();
        kutular.push(kutu("This job is addressed to you", el("p", { sinif: "ds-cihaz", yazi: "Accept to start. Deliver before the deadline; you are paid " + usd(Si.netHesapla(j.butce, j.ucretBps).net) + " when the client approves or the review window passes." }),
          el("div", { sinif: "ds-dugmeler" }, [eylem("Accept the job", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.kabulEt(j.id), durum: yaz, aciklama: "Confirm accepting the job" }); yaz("Accepted. Deliver before the deadline.", "ok"); yenile(); }, "dugme dugme--marka", d, cevir),
            el("a", { sinif: "dugme", attr: { href: "#/messages/" + j.musteri }, yazi: "Message the client" })]), d));
      }
    } else if (j.son > simdi) {
      const zaten = ben ? await Si.basvurduMu(j.id, ben).catch(() => false) : false;
      const d = durumSatiri();
      const n = not("A short note: portfolio link, your price and timing (public, at most 500 bytes)");
      kutular.push(zaten ? kutu("You applied", el("p", { sinif: "ds-cihaz", yazi: "The client picks one applicant. You can message them meanwhile." }), el("a", { sinif: "dugme", attr: { href: "#/messages/" + j.musteri }, yazi: "Message the client" }))
        : kutu("Apply", n, el("div", { sinif: "ds-dugmeler" }, [eylem("Apply to this job", async (yaz) => { await hesapIste(); await gonder({ cuzdan, data: Si.veriS.basvur(j.id, notKontrol(n)), durum: yaz, aciklama: "Confirm your application" }); yaz("Applied.", "ok"); yenile(); }, "dugme dugme--marka", d, cevir)]), d));
    }
  }

  if (j.durum === D.ATANDI) {
    if (tasarimci) kutular.push(await teslimKutusu({ cuzdan, j }));
    if (tasarimci) {
      const d = durumSatiri();
      const n = not("Why (public)");
      kutular.push(el("details", { sinif: "ds-kutu dz-is-eylem" }, [el("summary", { yazi: "Step back or dispute" }),
        el("div", { sinif: "ds-dugmeler" }, [eylem("Step back (the job reopens)", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.birak(j.id), durum: yaz, aciklama: "Confirm stepping back" }); yaz("You stepped back.", "ok"); yenile(); }, "dugme", d, cevir)]),
        j.son > simdi ? n : null, j.son > simdi ? el("div", { sinif: "ds-dugmeler" }, [eylem("Open a dispute", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.itirazEt(j.id, notKontrol(n)), durum: yaz, aciklama: "Confirm opening a dispute" }); yaz("Dispute opened: the arbiter decides.", "ok"); yenile(); }, "dugme", d, cevir)]) : null, d]));
    }
    if (musteri) {
      const d = durumSatiri();
      if (j.son < simdi) {
        kutular.push(kutu("No delivery by the deadline", el("p", { sinif: "ds-cihaz", yazi: "Take the whole budget back, or give more time." }),
          el("div", { sinif: "ds-dugmeler" }, [eylem("Refund " + usd(j.butce), async (yaz) => { await gonder({ cuzdan, data: Si.veriS.iadeAl(j.id), durum: yaz, aciklama: "Confirm the refund" }); yaz("Refunded.", "ok"); yenile(); }, "dugme dugme--marka", d, cevir)]), d, sureKutusu()));
      } else {
        const n = not("Why (public)");
        kutular.push(kutu("The designer is working", el("p", { sinif: "ds-cihaz", yazi: "Delivery due " + tarih(j.son) + " (" + kalan(j.son) + "). If nothing arrives by then, you can take the whole budget back." }), sureKutusu(),
          el("details", {}, [el("summary", { yazi: "Open a dispute" }), n, el("div", { sinif: "ds-dugmeler" }, [eylem("Open a dispute", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.itirazEt(j.id, notKontrol(n)), durum: yaz, aciklama: "Confirm opening a dispute" }); yaz("Dispute opened: the arbiter decides.", "ok"); yenile(); }, "dugme", d, cevir)])]), d));
      }
    }
  }

  if (j.durum === D.TESLIM) {
    const bitis = Si.incelemeSonu(j);
    if (musteri) {
      const d = durumSatiri();
      const n = not("What should change (public)");
      const nI = not("Why (public)");
      const son = j.teslimler[j.teslimler.length - 1];
      kutular.push(kutu("Review the delivery", el("p", { sinif: "ds-cihaz", yazi: "Approve to pay " + usd(Si.netHesapla(j.butce, j.ucretBps).net) + " to the designer" + (j.nftId ? " and receive design #" + j.nftId + " with its license" : "") + ". If you do nothing until " + tarih(bitis) + " (" + kalan(bitis) + "), the payment is released." }),
        son && son.nftId && son.zarf && son.zarf !== "0x" ? onizlemeKutusu({ cuzdan, j, son }) : null,
        el("div", { sinif: "ds-dugmeler" }, [eylem("Approve and pay", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.onayla(j.id), durum: yaz, aciklama: "Confirm approving (pays the designer)" }); yaz("Approved and paid." + (j.nftId ? " Design #" + j.nftId + " is yours." : ""), "ok"); yenile(2500); }, "dugme dugme--marka", d, cevir)]),
        j.revizyon < j.revizyonHakki ? el("details", {}, [el("summary", { yazi: "Ask for changes (" + (j.revizyonHakki - j.revizyon) + " left)" }), n,
          el("div", { sinif: "ds-dugmeler" }, [eylem("Ask for changes", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.revizyonIste(j.id, notKontrol(n)), durum: yaz, aciklama: "Confirm asking for changes" }); yaz("Sent back to the designer.", "ok"); yenile(); }, "dugme", d, cevir)])]) : null,
        el("details", {}, [el("summary", { yazi: "Open a dispute" }), nI, el("div", { sinif: "ds-dugmeler" }, [eylem("Open a dispute", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.itirazEt(j.id, notKontrol(nI)), durum: yaz, aciklama: "Confirm opening a dispute" }); yaz("Dispute opened: the arbiter decides.", "ok"); yenile(); }, "dugme", d, cevir)])]), d));
    } else if (tasarimci) {
      const d = durumSatiri();
      kutular.push(kutu("Delivered", el("p", { sinif: "ds-cihaz", yazi: "Waiting for the client until " + tarih(bitis) + " (" + kalan(bitis) + "). After that anyone, you included, can release your payment." }),
        j.nftId ? anahtarDugmesi({ cuzdan, j, d }) : null, d));
    }
    if (bitis && bitis < simdi) {
      const d = durumSatiri();
      kutular.push(kutu("The review window has passed", el("div", { sinif: "ds-dugmeler" }, [eylem("Release the payment", async (yaz) => { await gonder({ cuzdan, data: Si.veriS.talepEt(j.id), durum: yaz, aciklama: "Confirm releasing the payment" }); yaz("Released to the designer.", "ok"); yenile(); }, "dugme dugme--marka", d, cevir)]), d));
    }
  }

  if (j.durum === D.ITIRAZ) kutular.push(kutu("Disputed", el("p", { sinif: "ds-cihaz", yazi: "The arbiter (the ARC PULSE moderator wallet; later the DAO) splits the escrow between the designer and the client, and gives any delivered design NFT to one of them. Talk it through in Messages meanwhile." })));
  if (j.durum >= D.ODENDI) {
    kutular.push(kutu(Si.DURUM_ADI[j.durum], el("p", { sinif: "ds-cihaz", yazi: j.durum === D.ODENDI ? "The designer was paid." + (j.nftId ? " Design #" + j.nftId + " went to the client; open its page to download the file." : "") : j.durum === D.IPTAL ? "The budget went back to the client." : "The arbiter split the escrow (see the history)." }),
      j.nftId && musteri ? el("a", { sinif: "dugme", attr: { href: "#/d/" + j.nftId }, yazi: "Open design #" + j.nftId }) : null,
      tasarimci && j.nftId ? anahtarDugmesi({ cuzdan, j, d: durumSatiri() }) : null));
  }
  return kutular;

  function sureKutusu() {
    const d = durumSatiri();
    const yerel = (t) => new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const g = el("input", { sinif: "girdi", attr: { type: "datetime-local", value: yerel(Math.max(j.son, Date.now()) + 3 * 86400_000), "aria-label": "New deadline" } });
    return el("details", {}, [el("summary", { yazi: "Give more time" }), g, el("div", { sinif: "ds-dugmeler" }, [eylem("Move the deadline", async (yaz) => {
      const t = new Date(g.value).getTime();
      if (!(t > j.son)) throw new Error("Choose a later time than the current deadline.");
      await gonder({ cuzdan, data: Si.veriS.sureUzat(j.id, Math.floor(t / 1000)), durum: yaz, aciklama: "Confirm the new deadline" });
      yaz("Deadline moved.", "ok"); yenile();
    }, "dugme", d, cevir)]), d]);
  }
}

/* the file key of design `nftId` encrypted to the client's registered unlock key, or null when the client has none */
async function zarfYap({ cuzdan, j, nftId, yaz }) {
  const pub = await S.anahtarOku(j.musteri);
  if (!pub || pub === "0x") return null;
  const T = await import("../../js/designs/teslim.js");
  const Sf = await import("../../js/designs/sifre.js");
  const t = await S.tasarimOku(nftId);
  if (!t) throw new Error("Design #" + nftId + " not found.");
  const k = await T.dosyaAnahtariBul(cuzdan, t, null, yaz);
  return Sf.sarIkili(k, pub, j.musteri, t.dosyaHash);
}

function anahtarDugmesi({ cuzdan, j, d }) {
  return el("div", { sinif: "ds-dugmeler" }, [eylem("Post the file key to the client", async (yaz) => {
    const z = await zarfYap({ cuzdan, j, nftId: j.nftId || j.teslimler.map((t) => t.nftId).filter(Boolean).pop(), yaz });
    if (!z) throw new Error("The client has not registered an unlock key yet (Studio → Unlock key). Ask them in Messages, then try again.");
    await gonder({ cuzdan, data: Si.veriS.anahtarGonder(j.id, z), durum: yaz, aciklama: "Confirm posting the file key" });
    yaz("Posted: the client can open the file now.", "ok");
  }, "dugme", d, cevir)]);
}

async function teslimKutusu({ cuzdan, j }) {
  const ben = cuzdan.hesap();
  const d = durumSatiri();
  const link = el("input", { sinif: "girdi", attr: { type: "text", placeholder: "File link: https://…, ipfs://… or ar://… (public)", "aria-label": "File link" } });
  const dosya = el("input", { sinif: "girdi", attr: { type: "file", "aria-label": "Compute the hash of a file (stays in this browser)" } });
  const hash = el("input", { sinif: "girdi ds-mono", attr: { type: "text", placeholder: "File hash (SHA-256, 0x…, optional)", "aria-label": "File hash", spellcheck: "false" } });
  dosya.addEventListener("change", async () => {
    const f = dosya.files && dosya.files[0];
    if (!f) return;
    const { sha256Hex } = await import("../../js/designs/parmakizi.js");
    hash.value = await sha256Hex(new Uint8Array(await f.arrayBuffer()));
  });
  /* the designer's own designs they still hold, with no sale in progress */
  const sec = el("select", { sinif: "girdi", attr: { "aria-label": "Design NFT to deliver" } }, [el("option", { attr: { value: "0" }, yazi: "No NFT (link / hash only)" })]);
  try {
    const benim = (await S.yayinlar()).filter((t) => esit(t.tasarimci, ben));
    const dl = await S.durumlar(benim.map((t) => t.id));
    for (const x of dl) if (esit(x.sahip, ben)) sec.append(el("option", { attr: { value: String(x.id) }, yazi: "Design #" + x.id + (x.fiyat ? " (listed: delivering ends the listing)" : "") }));
  } catch (e) { /* the list is optional */ }
  const anahtarVar = await S.anahtarOku(j.musteri).then((a) => a && a !== "0x").catch(() => false);
  return el("div", { sinif: "ds-kutu ds-form dz-is-eylem dz-is-teslim-form" }, [el("h3", { yazi: "Deliver" }),
    el("p", { sinif: "ds-cihaz", yazi: "Due " + tarih(j.son) + " (" + kalan(j.son) + "). Best: publish the work as a design first (Publish), then pick it here. The NFT waits in escrow and goes to the client with the payment, with full usage rights (the Designs license); its file key goes to the client encrypted." }),
    el("label", {}, ["Design NFT", sec]),
    el("p", { sinif: "ds-cihaz", yazi: anahtarVar ? "The client has registered an unlock key: the file key is posted with the delivery." : "The client has not registered an unlock key yet: deliver now and post the key later from this page." }),
    el("label", {}, ["File link", link]), el("label", {}, ["File hash", hash, dosya]),
    el("div", { sinif: "ds-dugmeler" }, [eylem("Deliver", async (yaz) => {
      await hesapIste();
      const nftId = Number(sec.value) || 0;
      const u = link.value.trim();
      if (u && !guvenliLink(u)) throw new Error("The link must start with https://, ipfs:// or ar://.");
      if (Si.bayt(u) > Si.URI_AZAMI) throw new Error("The link is too long (at most 512 bytes).");
      const h = hash.value.trim();
      if (h && !/^0x[0-9a-fA-F]{64}$/.test(h)) throw new Error("The hash must be 0x and 64 hex characters.");
      if (!u && !h && !nftId) throw new Error("Pick a design NFT, or give a file link or hash.");
      let zarf = null;
      if (nftId) {
        if (!(await Si.nftOnayliMi(ben).catch(() => false))) await gonder({ cuzdan, to: S.TASARIM.adres, data: Si.veriS.nftOnay(), durum: yaz, aciklama: "Allow the commissions contract to hold your delivered designs" });
        zarf = await zarfYap({ cuzdan, j, nftId, yaz }).catch((e) => { yaz("No file key posted: " + ((e && e.message) || e)); return null; });
      }
      await gonder({ cuzdan, data: Si.veriS.teslimEt(j.id, u, h || null, nftId, zarf), durum: yaz, aciklama: "Confirm the delivery" });
      yaz("Delivered. The client reviews it now.", "ok"); yenile();
    }, "dugme dugme--marka", d, cevir)]), d]);
}

/* the client opens the delivered file before approving: the envelope from the delivery, checked against the on-chain key commitment and file hash */
function onizlemeKutusu({ cuzdan, j, son }) {
  const d = durumSatiri();
  return el("div", { sinif: "dz-is-onizleme" }, [eylem("Open the delivered file", async (yaz) => {
    await hesapIste();
    const Sf = await import("../../js/designs/sifre.js");
    const { sha256Hex } = await import("../../js/designs/parmakizi.js");
    const { metaOku, baytAl } = await import("../../js/designs/meta.js");
    const { keccak256 } = await import("../../vendor/ethers.min.js");
    const t = await S.tasarimOku(son.nftId);
    const meta = await metaOku(t.uri);
    const f = meta && meta.arcpulse && meta.arcpulse.file;
    if (!f || !f.uri) throw new Error("This design has no encrypted file in its metadata.");
    yaz("Sign to derive your unlock key (nothing is sent)…");
    const sk = await Sf.acmaAnahtari(cuzdan);
    let k = null;
    for (const z of j.zarflar.slice().reverse()) { try { const x = await Sf.acIkili(z.zarf, sk, cuzdan.hesap().toLowerCase(), t.dosyaHash); if (!t.anahtarTaahhut || keccak256(x) === t.anahtarTaahhut) { k = x; break; } } catch (e) { /* not for this key */ } }
    if (!k) throw new Error("No file key for your current unlock key in this delivery. Ask the designer to post it again.");
    yaz("Downloading the encrypted file…");
    const acik = await Sf.dosyaCoz(await baytAl(f.uri), k);
    if ((await sha256Hex(acik)).toLowerCase() !== t.dosyaHash.toLowerCase()) throw new Error("The decrypted file does not match the hash on chain.");
    const url = URL.createObjectURL(new Blob([acik], { type: f.mime || "application/octet-stream" }));
    const a = el("a", { attr: { href: url, download: f.name || ("design-" + t.id) } });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    yaz("Opened and verified against the on-chain hash. Approve to own the NFT and its rights.", "ok");
  }, "dugme", d, cevir), d]);
}

export { yukleniyor };
