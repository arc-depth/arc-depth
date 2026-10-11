"use strict";
/* The governance panel's hardest-to-reach code is the proposal card, and
 * on a chain with zero proposals it has never run. Shipping it unexercised
 * means the first person to open a proposal is the one who finds out it
 * throws — and a card that throws leaves the list blank with no hint why.
 *
 * So the real functions are lifted out of docs/app.html and run here
 * against a fake governor that hands back synthetic proposals in every
 * state. Nothing is reimplemented: the code under test is the page's own
 * text, evaluated with the page's helpers shimmed around it. If somebody
 * edits the card, this breaks.
 *
 * What this does NOT prove: that it looks right. Headless Chrome does not
 * work on this machine. It proves the card renders without throwing, says
 * the right state, offers the right button, and decodes the payment call
 * into something a voter could actually check.
 */
const fs = require("fs");
const { Interface, formatUnits, parseUnits } = require("ethers");

const D = JSON.parse(fs.readFileSync("C:/arc-launchpad/dagitim.json", "utf8"));
const G = JSON.parse(fs.readFileSync("C:/arc-launchpad/dagitim-yonetisim.json", "utf8"));

let hata = 0;
const ok = (b, ad, not) => {
  console.log((b ? "  PASS " : "  FAIL ") + ad + (not ? "   " + not : ""));
  if (!b) hata++;
};

/* ---- lift the block out of the page --------------------------------- */
const sayfa = fs.readFileSync("C:/arc-launchpad/docs/app.html", "utf8");
const bas = sayfa.indexOf("const DURUMLAR = [");
const bit = sayfa.indexOf("/* The page reads governance even with no wallet", bas);
if (bas < 0 || bit < 0) { console.log("  FAIL yonetisim blogu sayfada bulunamadi"); process.exit(1); }
const blok = sayfa.slice(bas, bit);
console.log("sayfadan cikarilan blok   " + blok.split("\n").length + " satir");

/* ---- the smallest DOM that the block needs -------------------------- */
const ogeler = new Map();
const oge = (id) => {
  if (!ogeler.has(id)) ogeler.set(id, {
    id, innerHTML: "", textContent: "", value: "", disabled: false, dataset: {},
    classList: { add(){}, remove(){}, toggle(){} },
    addEventListener(){},
    querySelectorAll(sec){
      /* The card handlers are attached by querying the HTML just written.
         Returning the matches honestly is what makes the wiring testable. */
      const m = String(sec).match(/^\[([a-z-]+)\]$/);
      if (!m) return [];
      const ad = m[1].replace(/^data-/, "");
      const re = new RegExp('data-' + ad + '="([^"]+)"', "g");
      const cik = [];
      for (const x of this.innerHTML.matchAll(re)) {
        const d = { [ad]: x[1] };
        if (ad === "oy") {
          const y = this.innerHTML.match(new RegExp('data-oy="' + x[1] + '" data-yon="([01])"'));
          if (y) d.yon = y[1];
        }
        cik.push({ dataset: d, addEventListener(){} });
      }
      return cik;
    }
  });
  return ogeler.get(id);
};

/* ---- a governor that answers, without a chain ----------------------- */
const iPay = new Interface(["function pay(address,address,uint256,uint256)"]);
const SIMDI = Math.floor(Date.now() / 1000);
const ODEME = iPay.encodeFunctionData("pay",
  [D.usdc, "0x1111111111111111111111111111111111111111", parseUnits("250", 6), 7]);

/* One proposal per state, so every branch of the card is drawn once. */
const SENARYO = [
  { d:0, hedef:G.devPool,  veri:ODEME, ac:"7 numarali katki icin 250 USDC", lehte:"300", aleyhte:"50",  top:"1000", end:SIMDI+4*86400, eta:0, bekle:{ durum:"Oylamada", buton:"kullanımdan kaldırıldı" } },
  { d:1, hedef:G.devPool,  veri:ODEME, ac:"dusen oneri",                    lehte:"20",  aleyhte:"500", top:"1000", end:SIMDI-86400,   eta:0, bekle:{ durum:"Düştü",    buton:"işlem yok" } },
  { d:2, hedef:G.devPool,  veri:ODEME, ac:"gecen oneri",                    lehte:"600", aleyhte:"10",  top:"1000", end:SIMDI-86400,   eta:0, bekle:{ durum:"Geçti",    buton:"data-sira=" } },
  { d:4, hedef:G.devPool,  veri:ODEME, ac:"uygulanmayi bekleyen",           lehte:"600", aleyhte:"10",  top:"1000", end:SIMDI-3*86400, eta:SIMDI-3600, bekle:{ durum:"Uygulanabilir", buton:"data-uygula=" } },
  { d:5, hedef:G.devPool,  veri:ODEME, ac:"uygulanmis",                     lehte:"600", aleyhte:"10",  top:"1000", end:SIMDI-9*86400, eta:SIMDI-7*86400, bekle:{ durum:"Uygulandı", buton:"işlem yok" } },
  /* A signal proposal calls nothing — the card has to say so rather than
     showing an empty payload. */
  { d:0, hedef:"0x0000000000000000000000000000000000000000", veri:"0x", ac:"sinyal onergesi", lehte:"100", aleyhte:"0", top:"1000", end:SIMDI+86400, eta:0, bekle:{ durum:"Oylamada", buton:"kullanımdan kaldırıldı" } },
  /* And a payload this page cannot read must be labelled unreadable, not
     quietly rendered as if it were understood. */
  { d:0, hedef:G.devPool, veri:"0xdeadbeef", ac:"taninmayan cagri", lehte:"100", aleyhte:"0", top:"1000", end:SIMDI+86400, eta:0, bekle:{ durum:"Oylamada", buton:"kullanımdan kaldırıldı" } }
];

const sahteGov = {
  proposalCount: async () => BigInt(SENARYO.length),
  state: async (i) => BigInt(SENARYO[Number(i)].d),
  hasVoted: async () => false,
  powerAt: async () => 0n,
  proposals: async (i) => {
    const p = SENARYO[Number(i)];
    return {
      proposer: "0x3333333333333333333333333333333333333333",
      target: p.hedef, data: p.veri, description: p.ac,
      end: BigInt(p.end), eta: BigInt(p.eta),
      snapshotTotal: parseUnits(p.top, 18),
      forVotes: parseUnits(p.lehte, 18), againstVotes: parseUnits(p.aleyhte, 18),
      executed: p.d === 5, cancelled: false
    };
  },
  QUORUM_BPS: async () => 1000n, PROPOSAL_THRESHOLD_BPS: async () => 100n,
  TIMELOCK: async () => 172800n, GRACE_PERIOD: async () => 1209600n,
  MIN_OY_GUCU: async () => parseUnits("50000", 18)
};
/* Two accounts, because the floor has two sides and only one of them was
   ever going to be exercised by accident: an account over it must be
   offered the vote, and one under it must be refused in the interface
   rather than at the moment of signing. */
const TABAN = 50000;
const stkFabrika = (stakeli) => ({
  totalStaked: async () => parseUnits("1000000", 18),
  stakedOf: async () => parseUnits(String(stakeli), 18),
  votingPower: async () => parseUnits(String(stakeli), 18),
  pending: async () => parseUnits("3", 18)
});
let sahteStk = stkFabrika(200000);
const sahteDev = { held: async () => parseUnits("12.5", 6), contributionCount: async () => 1n };

/* ---- the page's own helpers ----------------------------------------- */
const esc = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
const nk = (x) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const n2 = (x, d = 2) => Number(x).toLocaleString("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
const kisa = (a) => String(a).slice(0, 6) + "…" + String(a).slice(-4);

const kur = new Function(
  "$", "Contract", "ABI", "A", "read", "signer", "hesap", "Interface",
  "formatUnits", "parseUnits", "MaxUint256", "esc", "nk", "n2", "usd", "kisa",
  "satir", "mesaj", "hataMetni", "txLink", "say", "SIFIR_ADRES", "USDC_OND",
  "listele", "bakiyeTazele",
  blok + "\nreturn { yonetisimOku, onerileriOku, stakeDurumu, veriOku, veriKur, sureMetni, nalp };"
);

const yeniAPI = () => kur(
  oge,
  /* Contract(adres, abi, saglayici) -> whichever fake matches the address */
  function (adres) {
    const a = String(adres).toLowerCase();
    if (a === G.governor.toLowerCase()) return sahteGov;
    if (a === G.staking.toLowerCase()) return sahteStk;
    if (a === G.devPool.toLowerCase()) return sahteDev;
    return { balanceOf: async () => parseUnits("900", 18) };
  },
  { erc20: [], governor: [], staking: [], devPool: [] },
  { governor: G.governor, staking: G.staking, devPool: G.devPool, usdc: D.usdc, govToken: G.govToken },
  {}, {}, "0x4444444444444444444444444444444444444444", Interface,
  formatUnits, parseUnits, 0n, esc, nk, n2, (x) => "$" + nk(x), kisa,
  (l, v) => '<div class="row"><span>' + l + "</span><b>" + v + "</b></div>",
  (el, tip, html) => { oge(el).innerHTML = html; },
  (e) => String(e && e.message || e), () => "", (v) => Number(String(v).replace(",", ".")),
  "0x0000000000000000000000000000000000000000", 6,
  async () => {}, async () => {}
);
let api = yeniAPI();

(async function main() {
  console.log("\noneri kartlari cizildi mi");
  try { await api.yonetisimOku(); ok(true, "yonetisimOku hata atmadi"); }
  catch (e) { ok(false, "yonetisimOku PATLADI", String(e.message).slice(0, 120)); }

  const html = oge("yOneriler").innerHTML;
  ok(html.length > 0, "liste dolduruldu", html.length + " karakter");
  ok((html.match(/class="card"/g) || []).length === SENARYO.length,
    "her senaryo bir kart", (html.match(/class="card"/g) || []).length + "/" + SENARYO.length);

  console.log("\nher durum dogru etiketlendi ve dogru butonu verdi");
  for (let k = 0; k < SENARYO.length; k++) {
    const s = SENARYO[k];
    /* Cards are drawn newest first, so scenario k is card (n-1-k). */
    const parcalar = html.split('class="card"');
    const kart = parcalar[SENARYO.length - k] || "";
    ok(kart.includes(s.bekle.durum), "#" + k + " durum: " + s.bekle.durum);
    ok(kart.includes(s.bekle.buton), "#" + k + " buton: " + s.bekle.buton);
  }

  console.log("\nodeme cagrisi oy verenin okuyabilecegi hale geldi mi");
  ok(html.includes("Geliştirici ödemesi"), "odeme onerisi boyle adlandirildi");
  ok(html.includes("250,00 USDC"), "tutar 250 USDC olarak cozuldu   6 ondalik dogru");
  ok(html.includes("7 numaralı katkı"), "katki numarasi gosterildi");
  ok(html.includes("Sinyal önerisi"), "sinyal onerisi ayirt edildi");
  ok(html.includes("Tanınmayan çağrı"), "cozulemeyen cagri boyle isaretlendi   sessizce gizlenmedi");

  console.log("\nsayim ve yeter sayi");
  /* 300 for against a 1000 snapshot: quorum is 100, so the bar is full. */
  ok(html.includes("300 ALP"), "lehte oy yazildi");
  ok(html.includes("100 ALP"), "yeter sayi %10 olarak hesaplandi");

  console.log("\nkart butonlarina olay baglandi mi");
  const kutu = oge("yOneriler");
  /* The point of this check has inverted: ALP is abandoned, so an active
     proposal must offer NO vote button to anybody. A dead token that can
     still take a signature is the one thing that must not ship. */
  ok(kutu.querySelectorAll("[data-oy]").length === 0, "TERK EDILMIS TOKENDE HIC OY BUTONU YOK",
    "ustunde 200.000 ALP olan hesap icin bile");
  ok(kutu.querySelectorAll("[data-sira]").length === 1, "1 gecmis onermede sira butonu");
  ok(kutu.querySelectorAll("[data-uygula]").length === 1, "1 hazir onermede uygula butonu");

  console.log("\nstake paneli — tabanin ustundeki hesap (200.000 ALP)");
  const sd = oge("yStakeDurum").innerHTML;
  ok(sd.includes("$12,5"), "devPool bakiyesi gosterildi");
  ok(sd.includes("1.000.000"), "toplam stake gosterildi");
  ok(sd.includes("50.000"), "oy tabani satiri gosterildi");
  ok(sd.includes("evet"), "oy kullanabilir diyor");
  ok(oge("yOnerNot").textContent.includes("Öneri açabilirsin"),
    "oneri acabilir diyor", oge("yOnerNot").textContent.slice(0, 80));
  ok(oge("yOner").disabled === true, "ALP terk edildi: oneri butonu esik saglansa da KAPALI",
    oge("yOnerNot").textContent.slice(0, 60));

  /* ---- the other side of the floor ------------------------------- */
  console.log("\ntabanin ALTINDAKI hesap (10.000 ALP) — arayuzde durduruluyor");
  sahteStk = stkFabrika(10000);
  for (const k of ogeler.keys()) { ogeler.get(k).innerHTML = ""; ogeler.get(k).textContent = ""; }
  api = yeniAPI();
  try { await api.yonetisimOku(); ok(true, "yonetisimOku hata atmadi"); }
  catch (e) { ok(false, "yonetisimOku PATLADI", String(e.message).slice(0, 120)); }

  const sd2 = oge("yStakeDurum").innerHTML;
  ok(sd2.includes("hayır"), "oy kullanamaz diyor");
  ok(sd2.includes("40.000"), "eksigi tam soyluyor", "50.000 - 10.000");
  ok(oge("yOner").disabled === true, "oneri butonu KAPALI");
  ok(oge("yOnerNot").textContent.includes("50.000"),
    "neden kapali oldugunu tabanla aciklıyor", oge("yOnerNot").textContent.slice(0, 80));

  /* The important one: a vote button that looks live and reverts at the
     wallet is worse than one that is off and says why. */
  const html2 = oge("yOneriler").innerHTML;
  ok(!html2.includes("data-oy="), "AKTIF ONERIDE OY BUTONU VERILMEDI",
    "cuzdanda revert etmek yerine arayuzde duruyor");
  ok(html2.includes("kullanımdan kaldırıldı"), "butonun ustunde terk edildigi yaziyor");
  ok(html2.includes("oylama kapatıldı"), "oylamanin kapandigi yaziyor");
  ok(oge("yOneriler").querySelectorAll("[data-oy]").length === 0,
    "hicbir oy butonuna olay baglanmadi");

  console.log("\nsure metni");
  ok(api.sureMetni(-5) === "doldu", "gecmis sure 'doldu' diyor");
  ok(api.sureMetni(4 * 86400 + 3600).includes("gün"), "gunluk sure gun yaziyor", api.sureMetni(4*86400+3600));
  ok(api.sureMetni(90 * 60).includes("sa"), "saatlik sure saat yaziyor", api.sureMetni(90*60));

  /* The contract has no minimum stake, so while nobody else has staked a
     holder can legitimately own the entire vote with one wei. A formatter
     that rounds that to "0" tells them they have no power at the exact
     moment they have all of it. */
  console.log("\ntoz miktarlar sifir diye gosterilmiyor");
  ok(api.nalp(0) === "0", "sifir gercekten sifir");
  ok(api.nalp(1e-18) !== "0", "1 wei ALP sifir gorunmuyor", api.nalp(1e-18));
  ok(/[1-9]/.test(api.nalp(1e-18)), "1 wei icinde bir rakam var", api.nalp(1e-18));
  ok(api.nalp(0.005) !== "0", "yuzde yarim token sifir gorunmuyor", api.nalp(0.005));
  ok(api.nalp(40630012) === "40.630.012", "buyuk sayilar eskisi gibi", api.nalp(40630012));

  console.log("\n" + (hata ? hata + " KONTROL BASARISIZ" : "tum kontroller gecti"));
  process.exit(hata ? 1 : 0);
})();
