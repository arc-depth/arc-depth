/* ===========================================================================
 * urun-kurucu.js — the founder slot for projects (lock) and DAOs (treasury)
 *
 * Owner, 1 Nov 2026. Every launch sends the founder's tokens and the founder's
 * USDC trading income to the LaunchIstegi's `kurucu`. Two products put a
 * contract there instead of the founder's wallet, at an address computed
 * BEFORE the launch (CREATE2), with kurucuZincir = Arc (26) and kurucuEid = 0:
 *
 *   Project  KurucuKilidi from KilitFabrikasi: the founder share released
 *            linearly over 3–24 months after an optional cliff; USDC income
 *            passes straight through to the founder. Nobody, not us, can take
 *            locked tokens early.
 *   DAO      TokenDAO from TokenDAOFabrikasi: holders deposit tokens to vote,
 *            proposals run from the treasury after voting + quorum + timelock.
 *
 * Same launch, same fees; the founder only chooses where the founder share
 * goes. The salt is derived from the token's symbol, so the address can be
 * found again from on-chain data alone if the page is closed after a launch.
 *
 * Addresses: veri/urun-kilit-dao.json (empty until deployed: "Not deployed
 * yet"). Nothing about the visitor is stored; the pending choice lives in a
 * module variable and sessionStorage until the launch or "Remove".
 * =========================================================================== */
import { el, panel, not, adres as adresYaz } from "./ui.js";
import { YedekliOkur } from "./yedekli-okur.js";
import { Contract, Interface, zeroPadValue, keccak256, toUtf8Bytes } from "../vendor/ethers.min.js";

const ARC_DOMAIN = 26;
const USDC = "0x3600000000000000000000000000000000000000";
const SIFIR = /^0x0{40}$/i;
const adresMi = (s) => /^0x[0-9a-fA-F]{40}$/.test(String(s || "").trim());
const arc = new YedekliOkur();

const KILIT_FAB_ABI = [
  "function adresHesapla(address lehtar, uint8 ay, uint8 ucurumAy, bytes32 tuz) view returns (address)",
  "function kur(address lehtar, uint8 ay, uint8 ucurumAy, bytes32 tuz, address[] tokenlar) returns (address)",
  "function kilitMi(address) view returns (bool)"
];
const KILIT_ABI = [
  "function lehtar() view returns (address)", "function ay() view returns (uint8)", "function ucurumAy() view returns (uint8)",
  "function baslat(address token) returns (uint64)", "function serbestBirak(address token) returns (uint256)", "function usdcGecir() returns (uint256)",
  "function turYaz(address token, uint8 tur, string bilgi)", "function lehtarDegistir(address yeni)",
  "function takvim(address token) view returns ((uint64 baslangic, uint64 ucurumBitis, uint64 bitis, uint256 toplam, uint256 serbest, uint256 cekilebilir, uint256 kilitli))"
];
const DAO_FAB_ABI = [
  "function adresHesapla(address kurucu, bytes32 tuz) view returns (address)",
  "function kur(address token, bytes32 tuz, (uint32 oySuresi, uint32 zamanKilidi, uint16 yeterSayiBps, bool yeterSayiYatirilandan, uint16 oneriEsigiBps) ayar, string bilgi) returns (address)",
  "function daoOf(address) view returns (address)", "function tokenOf(address) view returns (address)"
];
const DAO_ABI = [
  "function token() view returns (address)",
  "function ayar() view returns (uint32 oySuresi, uint32 zamanKilidi, uint16 yeterSayiBps, bool yeterSayiYatirilandan, uint16 oneriEsigiBps)",
  "function toplamYatirilan() view returns (uint256)", "function yatirilan(address) view returns (uint256)", "function kilitBitis(address) view returns (uint64)",
  "function oneriSayisi() view returns (uint256)", "function oneriEsigi() view returns (uint256)", "function hazineToken() view returns (uint256)",
  "function oneriler(uint256) view returns (address oneren, uint64 oyBitis, uint64 uygulanabilir, bool uygulandi, bool iptal, uint256 yeterSayi, uint256 evet, uint256 hayir, uint256 cekimser, bytes32 eylemHash)",
  "function durum(uint256) view returns (uint8)", "function oyVerdi(uint256, address) view returns (bool)",
  "function yatir(uint256)", "function cek(uint256)", "function oyVer(uint256 id, uint8 destek)",
  "function oneriVer(address[] hedefler, uint256[] degerler, bytes[] veriler, string aciklama) returns (uint256)",
  "function uygula(uint256 id, address[] hedefler, uint256[] degerler, bytes[] veriler)",
  "event OneriYapildi(uint256 indexed id, address indexed oneren, address[] hedefler, uint256[] degerler, bytes[] veriler, string aciklama, uint64 oyBitis, uint64 uygulanabilir, uint256 yeterSayi)"
];
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)"];
const TUR_ABI = ["function kurucuOf(address token) view returns (address)"];
const DURUMLAR = ["None", "Voting", "Rejected", "In timelock", "Ready to execute", "Executed", "Cancelled", "Expired"];

/* ---- the deployed addresses ---- */
let _ayar = null;
export function sozlesmeler() {
  _ayar ||= fetch("veri/urun-kilit-dao.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((j) => ({ kilit: adresMi(j.KilitFabrikasi) ? j.KilitFabrikasi : "", dao: adresMi(j.TokenDAOFabrikasi) ? j.TokenDAOFabrikasi : "",
      tur: adresMi(j.turKaydi) ? j.turKaydi : "0xbC0639f73e6485e479aCeE3bd5a427154CDe7402" }));
  return _ayar;
}

/** The salt the site uses: from the token's symbol (as launched: trimmed, upper case). */
export const kilitTuzu = (sembol) => keccak256(toUtf8Bytes("arcpulse-kilit:" + String(sembol || "").trim().toUpperCase()));
export const daoTuzu = (sembol) => keccak256(toUtf8Bytes("arcpulse-dao:" + String(sembol || "").trim().toUpperCase()));

/* ---- the pending choice for the Create page ---- */
const ANAHTAR = "arcpulse-kurucu-secim";
let _secim;
export function secim() {
  if (_secim === undefined) {
    _secim = null;
    try { const s = sessionStorage.getItem(ANAHTAR); if (s) _secim = JSON.parse(s); } catch (e) { /* storage may be blocked */ }
  }
  return _secim;
}
export function secimYap(s) {
  _secim = s;
  try { if (s) sessionStorage.setItem(ANAHTAR, JSON.stringify(s)); else sessionStorage.removeItem(ANAHTAR); } catch (e) { /* storage may be blocked */ }
  for (const f of _dinleyen) f();
}
const _dinleyen = new Set();
const secimYazi = (s) => s.tur === "kilit"
  ? "Founder lock: " + s.ay + " months" + (s.ucurum ? ", nothing for the first " + s.ucurum : ", no cliff")
  : "DAO treasury: voting " + s.ayar[0] / 86400 + " day(s), timelock " + s.ayar[1] / 3600 + " hour(s), quorum " + s.ayar[2] / 100 + "% of " + (s.ayar[3] ? "deposits" : "supply");

/** The box on the Create page: what the founder slot will be, and a way to remove the choice. */
export function secimKutusu() {
  const kutu = el("div", { sinif: "yigin" });
  const ciz = () => {
    kutu.replaceChildren();
    const s = secim();
    if (!s) return;
    kutu.append(el("div", { sinif: "not not--bilgi" }, [el("span", { yazi:
      secimYazi(s) + ". Your founder tokens and your 0.30% trading income go to that contract's address on Arc (computed before the launch from your wallet and the symbol) instead of your wallet; the launch itself, its rules and its fees are the same. " +
      (s.tur === "kilit" ? "USDC income passes straight through to you. " : "The DAO is created at that address right after the launch. ") +
      "Your tokens stay on Arc (any LayerZero fee for delivering them elsewhere is returned)." })]),
      el("button", { sinif: "dugme dugme--sessiz dugme--kucuk", attr: { type: "button" }, yazi: "Remove this choice (launch to my wallet)", on: { click: () => secimYap(null) } }));
  };
  _dinleyen.add(ciz);
  ciz();
  return kutu;
}

let _sonLaunch = null;   // the choice and address used by the launch being paid
/**
 * The LaunchIstegi's [kurucu, kurucuZincir, kurucuEid]: the default (the
 * founder's own) unless a lock or DAO is chosen, then [predicted address, 26, 0].
 */
export async function kurucuUc(ben, sembol, varsayilan) {
  const s = secim();
  _sonLaunch = null;
  if (!s) return varsayilan;
  const c = await sozlesmeler();
  const fab = s.tur === "kilit" ? c.kilit : c.dao;
  if (!fab) throw new Error((s.tur === "kilit" ? "The founder lock" : "Token DAOs") + " is not deployed yet. Remove the choice above to launch to your wallet.");
  let hedef;
  if (s.tur === "kilit") hedef = await new Contract(fab, KILIT_FAB_ABI, arc).adresHesapla(ben, s.ay, s.ucurum, kilitTuzu(sembol));
  else {
    hedef = await new Contract(fab, DAO_FAB_ABI, arc).adresHesapla(ben, daoTuzu(sembol));
    if ((await arc.getCode(hedef)) !== "0x") throw new Error("You already have a DAO for a token with the symbol " + sembol + ". Choose another symbol.");
  }
  _sonLaunch = { ...s, ben, sembol, hedef };
  return [zeroPadValue(hedef, 32), ARC_DOMAIN, 0];
}

/* ---- sending on Arc ---- */
async function gonder(cuzdan, to, data, durum) {
  const { AGLAR } = await import("./aglar.js");
  const arcAg = AGLAR.find((a) => a.anahtar === "arc");
  durum("Confirm in your wallet (on Arc, a few cents of gas)…");
  const h = await cuzdan.agdaGonder(arcAg, { to, data, value: "0x0" });
  durum("Sent. Waiting for Arc to confirm…");
  for (let i = 0; i < 40; i++) {
    const m = await arc.getTransactionReceipt(h).catch(() => null);
    if (m) { if (m.status !== 1) throw new Error("Reverted: " + h); return h; }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("No receipt yet for " + h + ". It may still go through: check it in an explorer before sending again.");
}
const hataYazi = (x) => ((x && x.code === 4001) ? "Cancelled." : ((x && (x.shortMessage || x.message)) || "Failed."));
function adim(etiket, ipucu, fn) {
  const d = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const b = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: etiket });
  b.addEventListener("click", async () => {
    if (b._mesgul) return;
    b._mesgul = true; b.disabled = true;
    try { d.textContent = (await fn((s) => { d.textContent = s; })) || "Done."; } catch (x) { d.textContent = hataYazi(x); }
    finally { b._mesgul = false; b.disabled = false; }
  });
  return el("div", { sinif: "yigin" }, [ipucu ? el("div", { sinif: "alan__ipucu", yazi: ipucu }) : null, b, d]);
}

/**
 * After a launch paid with a lock or DAO choice: the steps that follow, in
 * `kap`. Returns false when the launch used no such choice (the Create page
 * then shows its usual "Save product type" step).
 */
export function launchSonrasi({ token, kap, cuzdan, bilgi }) {
  const s = _sonLaunch;
  if (!s) return false;
  _sonLaunch = null;
  secimYap(null);
  kap.replaceChildren(s.tur === "kilit" ? kilitAdimlari({ token, cuzdan, ...s, bilgi }) : daoAdimlari({ token, cuzdan, ...s, bilgi }));
  return true;
}

function kilitAdimlari({ token, cuzdan, ben, ay, ucurum, sembol, hedef, bilgi }) {
  return el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Your founder share is at your lock's address " + hedef + "." }),
    adim("Start the lock", "Step 2: deploy the lock at that address and start its clock now (" + ay + " months" + (ucurum ? ", cliff " + ucurum : "") + "). Anyone may do it; the terms are fixed by the address.", async (durum) => {
      const c = await sozlesmeler();
      const kod = await arc.getCode(hedef);
      if (kod === "0x") await gonder(cuzdan, c.kilit, new Interface(KILIT_FAB_ABI).encodeFunctionData("kur", [ben, ay, ucurum, kilitTuzu(sembol), [token]]), durum);
      else await gonder(cuzdan, hedef, new Interface(KILIT_ABI).encodeFunctionData("baslat", [token]), durum);
      return "The lock is running. Follow it on the Projects page.";
    }),
    adim("Save product type: Project", "Step 3: the lock is the token's founder of record, so the type is saved through it (from your wallet, the beneficiary).", async (durum) => {
      await gonder(cuzdan, hedef, new Interface(KILIT_ABI).encodeFunctionData("turYaz", [token, 4, bilgi || ""]), durum);
      return "Saved. Your token is listed on the Projects page.";
    }),
  ]);
}

function daoAdimlari({ token, cuzdan, ayar, sembol, hedef, bilgi }) {
  return el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Your founder share and trading income go to your DAO's address " + hedef + "." }),
    adim("Create the DAO", "Step 2: create the DAO at that address. It also saves the product type DAO in the record.", async (durum) => {
      const c = await sozlesmeler();
      await gonder(cuzdan, c.dao, new Interface(DAO_FAB_ABI).encodeFunctionData("kur", [token, daoTuzu(sembol), ayar, bilgi || ""]), durum);
      return "Created. Open it: #/daos?dao=" + hedef;
    }),
  ]);
}

/* ---- small form pieces ---- */
const secimKutu = (secenekler, deger) => {
  const s = el("select", { sinif: "girdi" }, secenekler.map(([v, y]) => el("option", { attr: { value: String(v) }, yazi: y })));
  s.value = String(deger);
  return s;
};
const girdi = (ph, deger = "") => el("input", { sinif: "girdi", attr: { placeholder: ph, value: deger } });
const sayi = (deger, min, max, adim_ = "1") => el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: String(min), max: String(max), step: adim_, value: String(deger) } });
const birim = (x, d = 18) => Number(x) / 10 ** d;
const fmt = (x) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });
const tarih = (t) => (Number(t) ? new Date(Number(t) * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "not started");
const ozelOlmayan = () => not("Not deployed yet. This page will offer it as soon as the contract is live on Arc; until then nothing here can be used.", "uyari");
async function sembolOku(token) { return new Contract(token, ERC20, arc).symbol(); }
async function kurucuOf(token) { const c = await sozlesmeler(); return new Contract(c.tur, TUR_ABI, arc).kurucuOf(token); }

/* ============================ Projects ============================ */
/** The Projects page: choose a lock before launching, and follow / start / release a lock. */
export function kilitPaneli({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  (async () => {
    const c = await sozlesmeler();
    if (!c.kilit) { kap.append(panel("Lock my founder share", el("div", { sinif: "yigin" }, [ozelOlmayan(),
      el("p", { yazi: "What it will do: you choose 3 to 24 months and an optional cliff before launching. Your founder tokens then go to a lock contract instead of your wallet and are released to you month by month; nobody, us included, can take them out early. Your USDC trading income is not locked." })]))); return; }

    /* before the launch */
    const ay = secimKutu(Array.from({ length: 22 }, (_, i) => [i + 3, (i + 3) + " months"]), 12);
    const ucurum = secimKutu(Array.from({ length: 25 }, (_, i) => [i, i ? i + " months" : "No cliff"]), 3);
    const sinirla = () => { for (const o of ucurum.options) o.disabled = Number(o.value) > Number(ay.value); if (Number(ucurum.value) > Number(ay.value)) ucurum.value = ay.value; };
    ay.addEventListener("change", sinirla); sinirla();
    const sec = el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" }, yazi: "Lock my founder share and create a project token" });
    sec.addEventListener("click", async () => {
      secimYap({ tur: "kilit", ay: Number(ay.value), ucurum: Number(ucurum.value) });
      (await import("./urun.js")).turSec(4);
    });
    kap.append(panel("Lock my founder share", el("div", { sinif: "yigin" }, [
      el("p", { yazi: "Choose how long your founder tokens stay locked. They are released to you linearly over the whole period, nothing before the cliff ends; the clock starts when the lock first holds them (right after the launch). Your 0.30% USDC trading income is never locked: it passes straight to you. You can change your receiving address later; nobody else, us included, can take locked tokens out." }),
      el("div", { sinif: "alan__etiket", yazi: "Lock period" }), ay,
      el("div", { sinif: "alan__etiket", yazi: "Cliff (nothing released before it ends)" }), ucurum,
      not("Same launch and same fees as any token: the lock only changes where your founder share goes (the founder address becomes the lock's address on Arc, computed before you pay). The lock contract's gas, a few cents, is the only extra.", "bilgi"),
      sec])));

    /* after the launch: follow a lock */
    const tokenG = girdi("Token address on Arc");
    const ayG = sayi(12, 3, 24), ucG = sayi(3, 0, 24);
    const sonuc = el("div", { sinif: "yigin" });
    const bak = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Show the lock" });
    bak.addEventListener("click", async () => {
      sonuc.replaceChildren(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Reading…" }));
      try { sonuc.replaceChildren(await kilitGorunumu({ token: tokenG.value.trim(), ay: Number(ayG.value), ucurum: Number(ucG.value), cuzdan, c })); }
      catch (x) { sonuc.replaceChildren(el("div", { sinif: "yazi yazi--kucuk", yazi: hataYazi(x) })); }
    });
    kap.append(panel("A project's founder lock", el("div", { sinif: "yigin" }, [
      el("div", { sinif: "alan__ipucu", yazi: "Anyone can check a project token's lock: how much is locked, released and releasable, and when. If the lock was not started yet after a launch, its founder can start it here (enter the months and cliff chosen at launch)." }),
      tokenG, el("div", { sinif: "girdi-grup" }, [ayG, el("span", { sinif: "girdi-grup__son", yazi: "months" }), ucG, el("span", { sinif: "girdi-grup__son", yazi: "cliff" })]),
      bak, sonuc])));
  })().catch((x) => kap.append(not(hataYazi(x), "uyari")));
  return kap;
}

async function kilitGorunumu({ token, ay, ucurum, cuzdan, c }) {
  if (!adresMi(token)) throw new Error("Enter the token's address on Arc.");
  const k = await kurucuOf(token);
  if (SIFIR.test(k)) throw new Error("This token's founder of record could not be read (not launched through the gate, or a non-EVM founder).");
  const fab = new Contract(c.kilit, KILIT_FAB_ABI, arc);
  const kod = await arc.getCode(k);
  const ben = cuzdan && cuzdan.hesap();
  if (kod === "0x") {
    /* not deployed yet: the founder deploys it with the terms chosen at launch */
    const sembol = await sembolOku(token);
    if (!ben) return el("div", { sinif: "alan__ipucu", yazi: "The founder of record " + k + " has no contract yet. If it is your lock, connect your wallet and press again." });
    const p = await fab.adresHesapla(ben, ay, ucurum, kilitTuzu(sembol));
    if (p.toLowerCase() !== k.toLowerCase()) return el("div", { sinif: "alan__ipucu", yazi: "The founder of record " + k + " is not a lock of yours with " + ay + " months and a " + ucurum + "-month cliff. Check the terms chosen at launch." });
    return adim("Deploy and start my lock", "Your lock (" + ay + " months, cliff " + ucurum + ") holds the founder share and waits to be deployed.", async (durum) => {
      await gonder(cuzdan, c.kilit, new Interface(KILIT_FAB_ABI).encodeFunctionData("kur", [ben, ay, ucurum, kilitTuzu(sembol), [token]]), durum);
      return "The lock is running. Press \"Show the lock\" again to see it.";
    });
  }
  if (!(await fab.kilitMi(k))) return el("div", { sinif: "alan__ipucu", yazi: "This token's founder of record (" + k + ") is not a founder lock." });
  const L = new Contract(k, KILIT_ABI, arc);
  const [lehtar, a, u, t, usdc] = await Promise.all([L.lehtar(), L.ay(), L.ucurumAy(), L.takvim(token), new Contract(USDC, ERC20, arc).balanceOf(k)]);
  const parca = [
    el("div", { sinif: "yazi", yazi: "Lock " + k }),
    el("div", { sinif: "yazi yazi--kucuk", yazi: Number(a) + " months, cliff " + Number(u) + " · beneficiary " + lehtar }),
    el("div", { sinif: "yazi yazi--kucuk", yazi: "Started " + tarih(t.baslangic) + " · cliff ends " + tarih(t.ucurumBitis) + " · fully released " + tarih(t.bitis) }),
    el("div", { sinif: "yazi yazi--kucuk", yazi: "Locked " + fmt(birim(t.kilitli)) + " · released " + fmt(birim(t.serbest)) + " · releasable now " + fmt(birim(t.cekilebilir)) + " of " + fmt(birim(t.toplam)) + " tokens" }),
  ];
  if (!Number(t.baslangic) && t.toplam > 0n) parca.push(adim("Start the clock", "The lock holds the tokens but its clock has not started. Anyone may start it.", (d) => gonder(cuzdan, k, new Interface(KILIT_ABI).encodeFunctionData("baslat", [token]), d).then(() => "Started.")));
  if (t.cekilebilir > 0n) parca.push(adim("Release to the beneficiary", "Anyone may press it; the tokens always go to the beneficiary.", (d) => gonder(cuzdan, k, new Interface(KILIT_ABI).encodeFunctionData("serbestBirak", [token]), d).then(() => "Released.")));
  if (usdc > 0n) parca.push(adim("Pass $" + (Number(usdc) / 1e6).toFixed(2) + " USDC to the beneficiary", "Trading income is never locked.", (d) => gonder(cuzdan, k, new Interface(KILIT_ABI).encodeFunctionData("usdcGecir", []), d).then(() => "Passed on.")));
  if (ben && ben.toLowerCase() === lehtar.toLowerCase()) {
    const yeni = girdi("New receiving address 0x...");
    parca.push(yeni, adim("Change my receiving address", "Only the beneficiary can do this.", (d) => {
      if (!adresMi(yeni.value)) throw new Error("Enter an address.");
      return gonder(cuzdan, k, new Interface(KILIT_ABI).encodeFunctionData("lehtarDegistir", [yeni.value.trim()]), d).then(() => "Changed.");
    }));
  }
  return el("div", { sinif: "yigin" }, parca);
}

/* ============================== DAOs ============================== */
function ayarFormu() {
  const oy = sayi(3, 1, 30), kilit = sayi(24, 1, 720), yeter = sayi(10, 1, 50), esik = sayi(0.1, 0, 5, "0.1");
  const taban = secimKutu([["1", "of the tokens deposited to vote"], ["0", "of the total supply"]], "1");
  const oku = () => {
    const a = [Math.round(Number(oy.value) * 86400), Math.round(Number(kilit.value) * 3600), Math.round(Number(yeter.value) * 100), taban.value === "1", Math.round(Number(esik.value) * 100)];
    if (!(a[0] >= 86400 && a[0] <= 30 * 86400)) throw new Error("Voting lasts 1 to 30 days.");
    if (!(a[1] >= 3600 && a[1] <= 30 * 86400)) throw new Error("The timelock is 1 hour to 30 days.");
    if (!(a[2] >= 100 && a[2] <= 5000)) throw new Error("The quorum is 1% to 50%.");
    if (!(a[4] >= 0 && a[4] <= 500)) throw new Error("The proposal threshold is 0% to 5% of the supply.");
    return a;
  };
  const kutu = el("div", { sinif: "yigin" }, [
    el("div", { sinif: "girdi-grup" }, [oy, el("span", { sinif: "girdi-grup__son", yazi: "days of voting" })]),
    el("div", { sinif: "girdi-grup" }, [kilit, el("span", { sinif: "girdi-grup__son", yazi: "hours of timelock before execution" })]),
    el("div", { sinif: "girdi-grup" }, [yeter, el("span", { sinif: "girdi-grup__son", yazi: "% quorum" })]), taban,
    el("div", { sinif: "girdi-grup" }, [esik, el("span", { sinif: "girdi-grup__son", yazi: "% of supply deposited to propose" })]),
  ]);
  return { kutu, oku };
}

/** The DAOs page: create a DAO before or after a launch, open one. */
export function daoPaneli({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  (async () => {
    const c = await sozlesmeler();
    if (!c.dao) { kap.append(panel("Create a DAO for my token", el("div", { sinif: "yigin" }, [ozelOlmayan(),
      el("p", { yazi: "What it will do: holders deposit the token to vote, proposals send the treasury's funds after a vote, a quorum and a timelock, and you can point your founder share and your 0.30% trading income at the treasury by launching with the DAO's address as founder." })]))); return; }

    const f1 = ayarFormu();
    const d1 = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const sec = el("a", { sinif: "dugme dugme--marka", attr: { href: "#/olustur" }, yazi: "Create a DAO token: founder share to the treasury" });
    sec.addEventListener("click", async (e) => {
      try { secimYap({ tur: "dao", ayar: f1.oku() }); (await import("./urun.js")).turSec(5); }
      catch (x) { e.preventDefault(); d1.textContent = hataYazi(x); }
    });
    kap.append(panel("Create a DAO for my token", el("div", { sinif: "yigin" }, [
      el("p", { yazi: "Before the launch: choose the DAO's rules here, then launch. Your founder tokens and your 0.30% USDC trading income go to the DAO's treasury address (computed before you pay); right after the launch you create the DAO there. Holders deposit tokens to vote; a deposit can be withdrawn once the votes it took part in have ended, so nobody can vote twice with the same tokens." }),
      f1.kutu,
      not("Same launch and same fees as any token. The DAO has no owner and no admin; it changes its own rules only by a vote, within the same limits.", "bilgi"),
      sec, d1])));

    /* after the launch, or for a token launched to the founder's own wallet */
    const tokenG = girdi("Token address on Arc");
    const f2 = ayarFormu();
    const sonuc = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    const kur = adim("Create the DAO", null, async (durum) => {
      const token = tokenG.value.trim();
      if (!adresMi(token)) throw new Error("Enter the token's address on Arc.");
      const ben = cuzdan.hesap() || (await cuzdan.bagla());
      if (!ben) throw new Error("Connect a wallet first.");
      const fab = new Contract(c.dao, DAO_FAB_ABI, arc);
      const var_ = await fab.daoOf(token);
      if (!SIFIR.test(var_)) return "This token already has a DAO: #/daos?dao=" + var_;
      const [k, sembol] = await Promise.all([kurucuOf(token), sembolOku(token)]);
      const tuz = daoTuzu(sembol);
      const p = await fab.adresHesapla(ben, tuz);
      if (k.toLowerCase() !== ben.toLowerCase() && k.toLowerCase() !== p.toLowerCase()) throw new Error("Only the token's founder (" + k + ") can create its DAO. Connect that wallet.");
      await gonder(cuzdan, c.dao, new Interface(DAO_FAB_ABI).encodeFunctionData("kur", [token, tuz, f2.oku(), ""]), durum);
      return "Created: #/daos?dao=" + p + (k.toLowerCase() === ben.toLowerCase() ? " (save the type DAO for the token from the Create / Trade page)" : " (type DAO saved)");
    });
    kap.append(panel("Already launched: create its DAO", el("div", { sinif: "yigin" }, [
      el("div", { sinif: "alan__ipucu", yazi: "For the token's founder. If the token was launched with its DAO's address as founder, the DAO is created at that address; otherwise it is created for the token and you can send it funds yourself." }),
      tokenG, f2.kutu, kur, sonuc])));

    const acG = girdi("Token or DAO address on Arc");
    const ac = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Open" });
    const acD = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
    ac.addEventListener("click", async () => {
      try {
        const a = acG.value.trim();
        if (!adresMi(a)) throw new Error("Enter an address.");
        const fab = new Contract(c.dao, DAO_FAB_ABI, arc);
        let d = await fab.daoOf(a);
        if (SIFIR.test(d)) d = SIFIR.test(await fab.tokenOf(a)) ? null : a;
        if (!d) throw new Error("No DAO for this address.");
        location.hash = "#/daos?dao=" + d;
      } catch (x) { acD.textContent = hataYazi(x); }
    });
    kap.append(panel("Open a token's DAO", el("div", { sinif: "yigin" }, [acG, ac, acD])));
  })().catch((x) => kap.append(not(hataYazi(x), "uyari")));
  return kap;
}

/** One DAO: deposits, proposals, votes, execution. */
export async function daoSayfasi({ dao, cuzdan }) {
  const c = await sozlesmeler();
  if (!c.dao) return panel("Token DAO", ozelOlmayan());
  if (!adresMi(dao)) return panel("Token DAO", not("Not a DAO address.", "uyari"));
  const fab = new Contract(c.dao, DAO_FAB_ABI, arc);
  const tokenA = await fab.tokenOf(dao);
  if (SIFIR.test(tokenA)) return panel("Token DAO", not("This address is not a DAO made by the Token DAO factory.", "uyari"));
  const D = new Contract(dao, DAO_ABI, arc), T = new Contract(tokenA, ERC20, arc);
  const ifc = new Interface(DAO_ABI);
  const [sembol, ayar, toplam, hazT, hazU, n, esik] = await Promise.all([T.symbol().catch(() => "?"), D.ayar(), D.toplamYatirilan(), D.hazineToken(),
    new Contract(USDC, ERC20, arc).balanceOf(dao), D.oneriSayisi(), D.oneriEsigi()]);
  const ben = cuzdan && cuzdan.hesap();
  const kap = el("div", { sinif: "yigin" });
  kap.append(panel("Token DAO · " + sembol, el("div", { sinif: "yigin" }, [
    el("div", { sinif: "yazi yazi--kucuk" }, ["DAO ", adresYaz(dao, false), " · token ", adresYaz(tokenA, false)]),
    el("div", { sinif: "yazi yazi--kucuk", yazi: "Treasury: $" + (Number(hazU) / 1e6).toFixed(2) + " USDC · " + fmt(birim(hazT)) + " " + sembol + " · deposited to vote: " + fmt(birim(toplam)) + " " + sembol }),
    el("div", { sinif: "yazi yazi--kucuk", yazi: "Rules: voting " + Number(ayar.oySuresi) / 86400 + " day(s) · timelock " + Number(ayar.zamanKilidi) / 3600 + " hour(s) · quorum " + Number(ayar.yeterSayiBps) / 100 + "% of " + (ayar.yeterSayiYatirilandan ? "deposits" : "supply") + " · to propose: " + fmt(birim(esik)) + " " + sembol + " deposited · executable for 14 days after the timelock" }),
  ])));

  /* deposit / withdraw */
  if (ben) {
    const [mine, kb, bak] = await Promise.all([D.yatirilan(ben), D.kilitBitis(ben), T.balanceOf(ben)]);
    const m = sayi(0, 0, 1e30, "any");
    const miktar = () => { const x = Number(m.value); if (!(x > 0)) throw new Error("Enter an amount."); return BigInt(Math.round(x * 1e6)) * 10n ** 12n; };
    kap.append(panel("My votes", el("div", { sinif: "yigin" }, [
      el("div", { sinif: "yazi yazi--kucuk", yazi: "Deposited " + fmt(birim(mine)) + " · in wallet " + fmt(birim(bak)) + " " + sembol + (Number(kb) * 1000 > Date.now() ? " · locked by your votes until " + tarih(kb) : " · free to withdraw") }),
      el("div", { sinif: "girdi-grup" }, [m, el("span", { sinif: "girdi-grup__son", yazi: sembol })]),
      adim("Deposit to vote", "Two confirmations the first time (approve, then deposit).", async (d) => {
        const x = miktar();
        if ((await T.allowance(ben, dao)) < x) await gonder(cuzdan, tokenA, new Interface(ERC20).encodeFunctionData("approve", [dao, x]), d);
        await gonder(cuzdan, dao, ifc.encodeFunctionData("yatir", [x]), d);
        return "Deposited. Reload to see it.";
      }),
      adim("Withdraw", "Possible once every vote you took part in (or proposal you made) has ended.", (d) => gonder(cuzdan, dao, ifc.encodeFunctionData("cek", [miktar()]), d).then(() => "Withdrawn.")),
    ])));
  } else kap.append(not("Connect a wallet to deposit, vote or propose.", "bilgi"));

  /* proposals: their calls come from the OneriYapildi events */
  const loglar = await arc.getLogs({ address: dao, topics: [ifc.getEvent("OneriYapildi").topicHash], fromBlock: 29039545, toBlock: "latest" })   /* no token DAO is older than its factory (TokenDAOFabrikasi deploy block) */.catch(() => []);
  const eylem = new Map(loglar.map((l) => { const p = ifc.parseLog(l); return [Number(p.args.id), p.args]; }));
  const liste = el("div", { sinif: "yigin" });
  for (let i = Number(n); i >= 1 && i > Number(n) - 30; i--) {
    const [o, dr, verdi] = await Promise.all([D.oneriler(i), D.durum(i), ben ? D.oyVerdi(i, ben) : false]);
    const e = eylem.get(i);
    const d = Number(dr);
    const parca = [
      el("div", { sinif: "yazi", yazi: "#" + i + " · " + DURUMLAR[d] + (e ? " · " + e.aciklama : "") }),
      el("div", { sinif: "yazi yazi--kucuk", yazi: "Yes " + fmt(birim(o.evet)) + " · No " + fmt(birim(o.hayir)) + " · Abstain " + fmt(birim(o.cekimser)) + " · quorum " + fmt(birim(o.yeterSayi)) + " · voting ends " + tarih(o.oyBitis) + " · executable from " + tarih(o.uygulanabilir) }),
      e ? el("div", { sinif: "yazi yazi--kucuk mono", yazi: e.hedefler.map((h, j) => h + (e.degerler[j] > 0n ? " +" + e.degerler[j] : "") + " " + String(e.veriler[j]).slice(0, 74) + (String(e.veriler[j]).length > 74 ? "…" : "")).join(" | ") }) : null,
    ];
    if (d === 1 && ben && !verdi) for (const [v, y] of [[1, "Vote yes"], [0, "Vote no"], [2, "Abstain"]])
      parca.push(adim(y, null, (dd) => gonder(cuzdan, dao, ifc.encodeFunctionData("oyVer", [i, v]), dd).then(() => "Voted.")));
    if (d === 1 && verdi) parca.push(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "You voted." }));
    if (d === 4 && e) parca.push(adim("Execute", "Anyone may execute a passed proposal after its timelock.", (dd) =>
      gonder(cuzdan, dao, ifc.encodeFunctionData("uygula", [i, [...e.hedefler], [...e.degerler], [...e.veriler]]), dd).then(() => "Executed.")));
    liste.append(el("div", { sinif: "yigin", attr: { style: "border-top:1px solid var(--cizgi);padding-top:8px" } }, parca));
  }
  kap.append(panel("Proposals", Number(n) ? liste : el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "No proposals yet." })));

  /* a new proposal: send treasury USDC, or one raw call */
  if (ben) {
    const aciklama = girdi("What and why (public)");
    const alici = girdi("Pay to 0x...");
    const tutar = sayi(1, 0, 1e12, "any");
    const ham = girdi("Or a raw call: target 0x...");
    const hamVeri = girdi("calldata 0x... (optional, for a raw call)");
    kap.append(panel("New proposal", el("div", { sinif: "yigin" }, [
      el("div", { sinif: "alan__ipucu", yazi: "Needs " + fmt(birim(esik)) + " " + sembol + " deposited. A call to the DAO's own token may only be a transfer, and no proposal can touch the tokens deposited to vote." }),
      aciklama, el("div", { sinif: "girdi-grup" }, [alici, tutar, el("span", { sinif: "girdi-grup__son", yazi: "USDC" })]), ham, hamVeri,
      adim("Propose", null, async (d) => {
        let hedef, veri;
        if (adresMi(ham.value)) { hedef = ham.value.trim(); veri = hamVeri.value.trim() || "0x"; if (!/^0x([0-9a-fA-F]{2})*$/.test(veri)) throw new Error("The calldata is not hex."); }
        else {
          if (!adresMi(alici.value)) throw new Error("Enter who to pay, or a raw call target.");
          hedef = USDC; veri = new Interface(ERC20).encodeFunctionData("transfer", [alici.value.trim(), BigInt(Math.round(Number(tutar.value) * 1e6))]);
        }
        await gonder(cuzdan, dao, ifc.encodeFunctionData("oneriVer", [[hedef], [0n], [veri], aciklama.value.trim()]), d);
        return "Proposed. Voting is open now; reload to see it.";
      }),
    ])));
  }
  return kap;
}
