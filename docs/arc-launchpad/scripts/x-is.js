"use strict";
/* ===========================================================================
 * x-is.js — act on X as @Arcdepthoock, headless, and prove every action
 *
 *   node scripts/x-is.js takip <handle> [<handle> ...]
 *   node scripts/x-is.js cevap <post-url> <text-file>
 *   node scripts/x-is.js durum
 *
 * Uses the profile signed in by x-oturum.js. Elements are found by X's own
 * data-testid attributes, so nothing depends on where a button is drawn.
 *
 * Every action is read back before it is reported:
 *   takip  -> the button must turn into "-unfollow" after the click
 *   cevap  -> our handle must appear in the conversation afterwards
 * A click that "probably worked" is reported as not done.
 *
 * Posting is still the user's decision: `cevap` sends exactly the text in
 * the file it is given, and that text is shown to the user and approved
 * before this is run. Follows are limited to accounts checked by hand to be
 * on-topic; following everyone was tried and rightly stopped.
 *
 * Pace is human: several seconds between accounts, one browser at a time.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const KOK = path.join(__dirname, "..");
const PROFIL = path.join(KOK, "tarayici-profil");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BIZ = "Arcdepthoock";
const DEFTER = path.join(KOK, "rapor", "x-is-defteri.jsonl");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const ara = (a, b) => bekle(a + Math.floor(Math.random() * (b - a)));

function yaz(kayit) {
  fs.mkdirSync(path.dirname(DEFTER), { recursive: true });
  fs.appendFileSync(DEFTER, JSON.stringify({ t: new Date().toISOString(), ...kayit }) + "\n");
}

async function ac() {
  const t = await puppeteer.launch({
    executablePath: CHROME, headless: true, userDataDir: PROFIL,
    defaultViewport: { width: 1280, height: 1000 },
    args: ["--no-first-run", "--no-default-browser-check"],
  });
  const s = (await t.pages())[0] || (await t.newPage());
  await s.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 60000 });
  await s.waitForSelector('[data-testid="SideNav_AccountSwitcher_Button"]', { timeout: 30000 })
    .catch(() => { throw new Error("oturum yok — once: node scripts/x-oturum.js"); });
  const kim = await s.$eval('[data-testid="SideNav_AccountSwitcher_Button"]', (e) => e.innerText);
  if (!kim.includes("@" + BIZ)) throw new Error("yanlis hesap girili: " + kim.replace(/\s+/g, " "));
  return { t, s };
}

async function sayilar(s) {
  return s.evaluate(() => {
    const a = [...document.querySelectorAll('a[href$="/verified_followers"], a[href$="/followers"], a[href$="/following"]')];
    return a.map((x) => x.innerText.replace(/\s+/g, " ")).join(" | ");
  }).catch(() => "");
}

async function takip(s, hesaplar) {
  for (const h of hesaplar) {
    await s.goto("https://x.com/" + h, { waitUntil: "domcontentloaded", timeout: 60000 });
    const dugme = await s.waitForSelector('[data-testid$="-follow"], [data-testid$="-unfollow"]', { timeout: 20000 })
      .catch(() => null);
    if (!dugme) { console.log(h.padEnd(18) + " dugme yok (hesap yok/askida?)"); yaz({ is: "takip", h, sonuc: "dugme-yok" }); continue; }
    const once = await s.evaluate((e) => e.getAttribute("data-testid"), dugme);
    if (once.endsWith("-unfollow")) { console.log(h.padEnd(18) + " zaten takipte"); yaz({ is: "takip", h, sonuc: "zaten" }); continue; }
    await ara(1200, 2500);
    await dugme.click();
    const tuttu = await s.waitForSelector('[data-testid$="-unfollow"]', { timeout: 10000 }).then(() => true).catch(() => false);
    console.log(h.padEnd(18) + (tuttu ? " TAKIP EDILDI (dogrulandi)" : " TIKLANDI AMA DOGRULANAMADI"));
    yaz({ is: "takip", h, sonuc: tuttu ? "tamam" : "dogrulanamadi" });
    await ara(6000, 11000);
  }
}

async function cevap(s, url, dosya) {
  const metin = fs.readFileSync(dosya, "utf8").trim();
  if (!metin) throw new Error("metin bos");
  await s.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  const kutu = await s.waitForSelector('[data-testid="tweetTextarea_0"]', { timeout: 25000 });
  await kutu.click();
  await ara(600, 1200);
  await s.keyboard.type(metin, { delay: 25 });
  await ara(800, 1500);
  const gonder = await s.waitForSelector('[data-testid="tweetButtonInline"]:not([aria-disabled="true"])', { timeout: 10000 });
  await gonder.click();
  await bekle(6000);
  /* read back: is there a post by us in this conversation containing the text's opening? */
  const bas = metin.slice(0, 40);
  await s.reload({ waitUntil: "domcontentloaded" });
  await bekle(5000);
  const var_ = await s.evaluate((biz, bas) => {
    return [...document.querySelectorAll('[data-testid="tweet"]')].some((t) =>
      t.innerText.includes("@" + biz) && t.innerText.replace(/\s+/g, " ").includes(bas.replace(/\s+/g, " ")));
  }, BIZ, bas);
  console.log(var_ ? "CEVAP YAYINDA (dogrulandi)" : "CEVAP DOGRULANAMADI — profilin Replies sekmesine bak");
  yaz({ is: "cevap", url, sonuc: var_ ? "tamam" : "dogrulanamadi", uzunluk: metin.length });
}

(async () => {
  const [komut, ...arg] = process.argv.slice(2);
  const { t, s } = await ac();
  try {
    if (komut === "takip") await takip(s, arg);
    else if (komut === "cevap") await cevap(s, arg[0], arg[1]);
    else if (komut === "durum") {
      await s.goto("https://x.com/" + BIZ, { waitUntil: "domcontentloaded" });
      await bekle(4000);
      console.log("@" + BIZ + ": " + (await sayilar(s)));
    } else console.log("komut: takip | cevap | durum");
  } finally {
    await t.close().catch(() => {});
  }
})().catch((e) => { console.error("HATA: " + String(e.message || e).slice(0, 300)); process.exit(1); });
