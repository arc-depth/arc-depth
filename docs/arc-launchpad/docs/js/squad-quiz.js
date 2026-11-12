/* ===========================================================================
 * squad-quiz.js — "Which Pulse Squad mascot are you?" on squad.html (13 Nov 2026)
 *
 * The twelve mascots are read from the page's own grid (each .sq-kart carries
 * data-k, data-ad, data-zincir, data-anahtar, data-soz, data-kisilik), so the
 * words live in one place: the HTML. Six questions, four answers each; every
 * mascot is the answer to exactly two of the twenty-four, so all twelve can win.
 *
 * Nothing is stored or sent: the answers stay in this page. The result is put
 * in the address (?m=<k>) with replaceState, so the shared link opens that
 * result; a visitor arriving with ?m= sees it and can take the quiz themselves.
 * =========================================================================== */
const KOK = "https://arcpulse.app/arc-launchpad/docs/squad.html";

const SORULAR = [
  { s: "It's launch day. You are…", c: [["🛡️", "First in line, checking the path for everyone", "halo"], ["⚡", "Already live before anyone finished reading", "zappy"], ["🧢", "Shipping quietly, smiling later", "blu"], ["🎯", "Waiting for one calm, perfect shot", "feather"]] },
  { s: "Pick a superpower.", c: [["🐙", "Doing eight things at once", "vio"], ["💜", "Keeping the whole crew in sync", "pulsy"], ["🏁", "Pure, unreasonable speed", "turbo"], ["💧", "Going with the flow, always", "drip"]] },
  { s: "Your ideal weekend?", c: [["🏔️", "Racing down a snowy mountain", "yeti"], ["🪨", "A slow, steady, cosy day", "pebble"], ["🧩", "A puzzle nobody else could solve", "bolt"], ["🍯", "Something sweet and golden", "goldie"]] },
  { s: "Which motto is yours?", c: [["😇", "Look after the newcomers", "halo"], ["🌊", "Stay liquid", "drip"], ["🥽", "Goggles on. Full send.", "turbo"], ["🤖", "Logic first, vibes right after", "bolt"]] },
  { s: "In the group chat you are…", c: [["❤️", "The one who keeps everyone together", "pulsy"], ["💨", "The fastest reply, every time", "zappy"], ["🌟", "The sweet, stubborn optimist", "goldie"], ["🤗", "The big heart with the big hugs", "yeti"]] },
  { s: "Pick a look.", c: [["🔧", "Cap backwards, sleeves rolled up", "blu"], ["🪶", "Light, sharp and precise", "feather"], ["🌀", "A little of everything, all at once", "vio"], ["🐰", "Small, soft and unbreakable", "pebble"]] },
];

const kartlar = [...document.querySelectorAll(".sq-kart[data-k]")];
const SQUAD = Object.fromEntries(kartlar.map((a) => [a.dataset.k, {
  k: a.dataset.k, ad: a.dataset.ad, zincir: a.dataset.zincir, anahtar: a.dataset.anahtar, soz: a.dataset.soz, kisilik: a.dataset.kisilik,
  renk: a.style.getPropertyValue("--z").trim() || "#7c5cff",
}]));
const kutu = document.getElementById("sq-quiz");

const el = (ad, ozellik = {}, ...cocuk) => {
  const e = document.createElement(ad);
  for (const [k, v] of Object.entries(ozellik)) {
    if (k === "yazi") e.textContent = v;
    else if (k === "on") for (const [o, f] of Object.entries(v)) e.addEventListener(o, f);
    else e.setAttribute(k, v);
  }
  e.append(...cocuk.filter(Boolean));
  return e;
};
const azHareket = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

let cevaplar = [];

function soruGoster(i) {
  const q = SORULAR[i];
  const baslik = el("p", { class: "sq-soru", id: "sq-soru", tabindex: "-1", yazi: q.s });
  kutu.replaceChildren(
    el("p", { class: "k", yazi: "The quiz" }),
    el("p", { class: "sq-sayac", yazi: "Question " + (i + 1) + " of " + SORULAR.length }),
    el("div", { class: "sq-ilerleme", role: "progressbar", "aria-label": "Quiz progress", "aria-valuemin": "0", "aria-valuemax": String(SORULAR.length), "aria-valuenow": String(i) },
      el("i", { style: "width:" + Math.round((i / SORULAR.length) * 100) + "%" })),
    baslik,
    el("div", { class: "sq-secenek", role: "group", "aria-labelledby": "sq-soru" }, ...q.c.map(([ikon, metin, k]) =>
      el("button", { type: "button", on: { click: () => { cevaplar[i] = k; if (i + 1 < SORULAR.length) soruGoster(i + 1); else sonucGoster(hesapla(), true); } } },
        el("span", { "aria-hidden": "true", yazi: ikon }), metin))),
    el("div", { class: "sq-alt" },
      i > 0 ? el("button", { type: "button", class: "sq-geri", yazi: "← Back", on: { click: () => soruGoster(i - 1) } }) : el("span"),
      el("span", { class: "sy-kucuk", yazi: "Nothing is saved or sent." })),
  );
  baslik.focus({ preventScroll: true });
}

/* the mascot picked most often; a tie goes to the one picked last */
function hesapla() {
  const say = {};
  let en = null;
  cevaplar.forEach((k) => {
    say[k] = (say[k] || 0) + 1;
    if (!en || say[k] >= say[en]) en = k;
  });
  return en || "halo";
}

function sonucGoster(k, kendi) {
  const m = SQUAD[k];
  if (!m) return;
  const adres = KOK + "?m=" + encodeURIComponent(k);
  try { history.replaceState(null, "", "?m=" + encodeURIComponent(k) + "#quiz"); } catch { /* file:// or a sandbox */ }
  const metin = "I'm " + m.ad + " of the Pulse Squad — “" + m.soz + "” Which one are you?";
  const paylas = "https://x.com/intent/tweet?text=" + encodeURIComponent(metin) + "&url=" + encodeURIComponent(adres);
  const baslik = el("h3", { id: "sq-sonuc-h", tabindex: "-1", yazi: (kendi ? "You're " : "Meet ") + m.ad + "!" });
  kutu.replaceChildren(
    el("p", { class: "k", yazi: kendi ? "Your result" : "A friend's result" }),
    el("div", { class: "sq-sonuc", style: "--z:" + m.renk, role: "region", "aria-labelledby": "sq-sonuc-h" },
      el("div", { class: "sq-sonuc__resim" }, el("img", { src: "img/squad/" + k + ".svg", alt: m.ad + ", the Pulse Squad's " + m.zincir + " mascot", width: "200", height: "200" })),
      el("div", {},
        el("span", { class: "sq-zincir", yazi: m.zincir + (k === "pulsy" ? " · also guides Ethereum" : "") }),
        baslik,
        el("p", { yazi: m.kisilik }),
        el("q", { yazi: m.soz }),
        el("div", { class: "btns" },
          el("a", { class: "cta x", href: paylas, target: "_blank", rel: "noopener", yazi: "Share on X" }),
          el("a", { class: "cta ghost", href: "app.html#/kesfet?zincir=" + encodeURIComponent(m.anahtar), yazi: "Meet " + m.ad + "'s chain" }),
          k === "halo" ? el("a", { class: "cta", href: "halo.html", yazi: "See $HALO" }) : null),
        el("div", { class: "sq-alt" },
          el("button", { type: "button", class: "sq-geri", yazi: kendi ? "↻ Take it again" : "Which one are you? Take the quiz →", on: { click: basla } }),
          el("a", { class: "text-link", href: "#m-" + k, yazi: "See " + m.ad + " in the Squad ↓" })))),
  );
  if (kendi) baslik.focus({ preventScroll: true });
  kutu.scrollIntoView({ behavior: azHareket() ? "auto" : "smooth", block: "start" });
}

function basla() {
  cevaplar = [];
  try { history.replaceState(null, "", location.pathname + "#quiz"); } catch { /* ignore */ }
  soruGoster(0);
  kutu.scrollIntoView({ behavior: azHareket() ? "auto" : "smooth", block: "start" });
}

if (kutu && kartlar.length) {
  const bas = document.getElementById("sq-basla");
  if (bas) bas.addEventListener("click", basla);
  const m = new URLSearchParams(location.search).get("m");
  if (m && SQUAD[m]) sonucGoster(m, false);
}
