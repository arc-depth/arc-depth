"use strict";
/* ===========================================================================
 * x-oturum.js — one-time sign-in for the @Arcdepthoock browser profile
 *
 *   node scripts/x-oturum.js          open a visible window, wait for sign-in
 *   node scripts/x-oturum.js --test   headless: is the session still there?
 *
 * Why a separate profile. Driving the everyday Chrome by screen coordinates
 * failed all day: the shell is DPI-unaware, so every click landed at 1.25x
 * the point read off the screenshot. An isolated profile driven through the
 * DevTools protocol addresses elements by what they are, not where they
 * appear, and never touches the user's own browser.
 *
 * The sign-in is done by a person, in the window this opens. No password is
 * read, typed, stored or logged here; the script only watches for the
 * signed-in state and then reports which account it is.
 *
 * The profile lives in tarayici-profil/ and is gitignored: it holds the
 * session cookies.
 * =========================================================================== */

const path = require("path");
const puppeteer = require("puppeteer-core");

const PROFIL = path.join(__dirname, "..", "tarayici-profil");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BEKLENEN = "Arcdepthoock";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function kimGirili(s) {
  const d = await s.$('[data-testid="SideNav_AccountSwitcher_Button"]').catch(() => null);
  if (!d) return null;
  const t = await s.evaluate((e) => e.innerText, d).catch(() => "");
  const m = String(t).match(/@([A-Za-z0-9_]+)/);
  return m ? m[1] : "?";
}

(async () => {
  const test = process.argv.includes("--test");
  const t = await puppeteer.launch({
    executablePath: CHROME,
    headless: test,
    userDataDir: PROFIL,
    defaultViewport: test ? { width: 1280, height: 900 } : null,
    args: ["--no-first-run", "--no-default-browser-check", ...(test ? [] : ["--start-maximized"])],
  });
  const s = (await t.pages())[0] || (await t.newPage());
  await s.goto("https://x.com/home", { waitUntil: "domcontentloaded", timeout: 60000 });
  await bekle(4000);

  let kim = await kimGirili(s);
  if (test) {
    console.log(kim ? "OTURUM VAR: @" + kim : "OTURUM YOK");
    await t.close();
    process.exit(kim === BEKLENEN ? 0 : 2);
  }

  /* Remote sign-in. The user is away from the machine and supplied the
   * credentials; they are read from a gitignored one-time file, typed at a
   * human pace, never printed, and the file is deleted as soon as the
   * session is confirmed. If X asks for an extra check (a username/phone
   * confirmation or an emailed code) the value is taken from a second
   * field, `ek`, in the same file. */
  const GIZLI = path.join(__dirname, "..", ".gizli-x-giris.json");
  const fs = require("fs");
  if (!kim && fs.existsSync(GIZLI)) {
    const k = JSON.parse(fs.readFileSync(GIZLI, "utf8"));
    const gizle = (m) => [k.kullanici, k.sifre, k.ek].reduce((a, g) => (g ? a.split(g).join("***") : a), String(m));
    try {
      await s.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded", timeout: 60000 });
      const ad = await s.waitForSelector('input[name="username_or_email"], input[autocomplete~="username"], input[name="text"]', { timeout: 30000, visible: true });
      await ad.click(); await ad.type(k.kullanici, { delay: 90 }); await bekle(700);
      await s.keyboard.press("Enter"); await bekle(3500);
      const ek = await s.$('input[data-testid="ocfEnterTextTextInput"]');
      if (ek) {
        if (!k.ek) { console.log("X ek dogrulama istiyor (kullanici adi/telefon/kod). Dosyaya 'ek' alani gerekli."); await t.close(); process.exit(3); }
        await ek.type(k.ek, { delay: 90 }); await s.keyboard.press("Enter"); await bekle(3500);
      }
      const sf = await s.waitForSelector('input[name="password"], input[type="password"]', { timeout: 30000, visible: true });
      await sf.click(); await sf.type(k.sifre, { delay: 80 }); await bekle(700);
      await s.keyboard.press("Enter"); await bekle(7000);
      const kod = await s.$('input[data-testid="ocfEnterTextTextInput"]');
      if (kod) { console.log("X sifreden sonra kod istiyor (mail/2FA)."); await bekle(2000); }
      kim = await kimGirili(s);
      if (!kim) { await s.goto("https://x.com/home", { waitUntil: "domcontentloaded" }); await bekle(5000); kim = await kimGirili(s); }
    } catch (e) { console.log("giris hatasi: " + gizle(e.message).slice(0, 200)); }
    if (kim) { fs.unlinkSync(GIZLI); console.log("kimlik dosyasi silindi"); }
  }

  if (!kim) {
    console.log("Pencere acik. X'e @" + BEKLENEN + " ile giris yap; bekliyorum (en fazla 15 dk).");
    const bitis = Date.now() + 15 * 60 * 1000;
    while (!kim && Date.now() < bitis) {
      await bekle(4000);
      kim = await kimGirili(s).catch(() => null);
    }
  }

  if (!kim) { console.log("Giris gorulmedi, sure doldu."); await t.close(); process.exit(1); }
  console.log("GIRISLI: @" + kim + (kim === BEKLENEN ? "" : "   <-- BEKLENEN @" + BEKLENEN + " DEGIL"));
  await bekle(3000);
  await t.close();
  process.exit(kim === BEKLENEN ? 0 : 2);
})().catch((e) => { console.error(String(e.message || e).slice(0, 300)); process.exit(1); });
