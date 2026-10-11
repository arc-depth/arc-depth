"use strict";
/* ===========================================================================
 * rapor-fathom.js — governance, staking and the founder's share, read back
 *                   from the chain.
 *
 *   node scripts/rapor-fathom.js
 *
 * Not a description of the design: every number here is read from the
 * deployed contracts. Where the deployment does something different from
 * what was asked for, this prints the difference rather than the intention.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const coder = AbiCoder.defaultAbiCoder();
const KOK = path.join(__dirname, "..");
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({ hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(60000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2500;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}
const nf = (x, d = 0) => Number(x).toLocaleString("tr-TR", { maximumFractionDigits: d });
const adet = (v) => nf(Number(v) / 1e18);
const usd = (x, d = 2) => "$" + nf(x, d);
const gun = (sn) => nf(Number(sn) / 86400, 1) + " gun";
const tarih = (ts) => new Date(Number(ts) * 1000).toISOString().slice(0, 10);

(async function main() {
  const oku = (to, fn) => rpc("eth_call", [{ to, data: sel(fn) }, "latest"]);
  const sayi = async (to, fn) => BigInt(await oku(to, fn));
  const adres = async (to, fn) => "0x" + (await oku(to, fn)).slice(26);
  const bal = async (t, w) => BigInt(await rpc("eth_call", [{ to: t,
    data: sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2) }, "latest"]));
  const dene = async (f, varsayilan) => { try { return await f(); } catch (e) { return varsayilan; } };

  const simdi = Math.floor(Date.now() / 1000);

  console.log("FATHOM — YONETISIM, STAKE, KURUCU PAYI   (hepsi zincirden)");
  console.log("");

  /* ================= 1. governance ================================== */
  console.log("1) YONETISIM   " + A.governor);
  const gStake = await dene(() => adres(A.governor, "stake()"), "?");
  const nobetci = await dene(() => adres(A.governor, "guardian()"), "?");
  const nobetciSon = await dene(() => sayi(A.governor, "guardianExpiry()"), 0n);
  const oylama = await dene(() => sayi(A.governor, "VOTING_PERIOD()"), 0n);
  const timelock = await dene(() => sayi(A.governor, "TIMELOCK()"), 0n);
  const muhlet = await dene(() => sayi(A.governor, "GRACE_PERIOD()"), 0n);
  const kotaBps = await dene(() => sayi(A.governor, "QUORUM_BPS()"), 0n);
  const esikBps = await dene(() => sayi(A.governor, "PROPOSAL_THRESHOLD_BPS()"), 0n);
  const teklifSayisi = await dene(() => sayi(A.governor, "teklifSayisi()"),
    await dene(() => sayi(A.governor, "proposalCount()"), 0n));

  console.log("    oy gucu kaynagi   " + gStake +
    (gStake.toLowerCase() === A.stake.toLowerCase() ? "   = stake kasasi" : "   BEKLENMEDIK"));
  console.log("    oylama suresi     " + gun(oylama));
  console.log("    timelock          " + gun(timelock) + "   (gecen teklif bu kadar bekler)");
  console.log("    muhlet            " + gun(muhlet) + "   (bu sure icinde uygulanmazsa duser)");
  console.log("    yetersayi         %" + nf(Number(kotaBps) / 100, 2) + "   (dolasimdaki oy gucunun)");
  console.log("    teklif esigi      %" + nf(Number(esikBps) / 100, 2));
  console.log("    acilmis teklif    " + teklifSayisi);
  console.log("    NOBETCI           " + nobetci);
  if (nobetciSon > 0n) {
    const kalan = Number(nobetciSon) - simdi;
    console.log("                      " + tarih(nobetciSon) + " tarihine kadar  (" +
      (kalan > 0 ? nf(kalan / 86400, 0) + " gun kaldi" : "SURESI DOLDU") + ")");
  }
  console.log("    Nobetci ne yapabilir: kotu bir teklifi VETO eder. Yeni teklif");
  console.log("    gecirmek, para tasimak, oran degistirmek YAPAMAZ. Suresi dolunca");
  console.log("    o da biter ve geri gelmez.");
  console.log("");

  /* ================= 2. staking ===================================== */
  console.log("2) STAKE   " + A.stake);
  const minOy = await dene(() => sayi(A.stake, "MIN_OY_GUCU()"), 0n);
  const emisyonKalan = await dene(() => sayi(A.stake, "emisyonKalan()"), 0n);
  const salimPpm = await dene(() => sayi(A.stake, "SALIM_PPM()"), 0n);
  const periyot = await dene(() => sayi(A.stake, "PERIYOT()"), 0n);
  const toplamStake = await dene(() => sayi(A.stake, "totalStaked()"), 0n);
  const islenen = await dene(() => sayi(A.stake, "islenenPeriyot()"), 0n);
  const gecen = await dene(() => sayi(A.stake, "periyotGecti()"), 0n);
  const stakeTok = await bal(A.token, A.stake);
  const stakeUsdc = await bal(A.usdc, A.stake);

  console.log("    kasadaki FTHM     " + adet(stakeTok));
  console.log("    emisyon kalan     " + adet(emisyonKalan));
  console.log("    periyot           " + gun(periyot) + "   islenen " + islenen + " / gecen " + gecen);
  console.log("    periyot basi salim %" + nf(Number(salimPpm) / 10000, 4) +
    "   (kalanin; 10 yillik yarilanma)");
  console.log("    toplam stake      " + adet(toplamStake) + "   (henuz kimse yatirmadi ise 0)");
  console.log("    biriken USDC odul " + usd(Number(stakeUsdc) / 1e6, 6) +
    "   <- satis islemlerinden gelir");
  console.log("");
  console.log("    ODUL YATIRANA NASIL GELIR — iki ayri kalem");
  console.log("      a) FTHM emisyonu: 400.000.000, 30 yil, 10 yilda bir yarilanarak.");
  console.log("         Kimse stake etmemisse takvim ILERLER ama tokenler dagitilmaz —");
  console.log("         birikip ilk yatirana toptan gitmez. (Eski ALP'nin hatasiydi.)");
  console.log("      b) USDC: her SATIS isleminin %0,15'i buraya nakit olarak gelir.");
  console.log("");
  console.log("    OY HAKKI");
  console.log("      oy kullanmak icin en az  " + adet(minOy) + " FTHM stake");
  console.log("      odul almak icin alt sinir YOK — 1 FTHM de yatirsa odul alir");
  console.log("      " + (minOy === 50_000n * 10n ** 18n
        ? "50.000 siniri sozlesmede SABIT, degistiren fonksiyon yok."
        : "UYARI: sinir 50.000 degil."));
  console.log("");

  /* ================= 3. the founder's share ========================= */
  console.log("3) SENIN PAYIN");
  const kurucuTok = await bal(A.token, A.kurucu);
  const vestTok = await bal(A.token, A.vesting);
  const vToplam = await dene(() => sayi(A.vesting, "total()"), 0n);
  const vBaslangic = await dene(() => sayi(A.vesting, "start()"), 0n);
  const vCekilen = await dene(() => sayi(A.vesting, "released()"),
    await dene(() => sayi(A.vesting, "cekilen()"), 0n));
  const vAy = await dene(() => sayi(A.vesting, "monthsUnlocked()"), 0n);
  const vHak = await dene(() => adres(A.vesting, "beneficiary()"), "?");
  const kurucuUsdc = await bal(A.usdc, A.kurucu);
  const satilan = kurucuTok > 50_000_000n * 10n ** 18n ? kurucuTok - 50_000_000n * 10n ** 18n : 0n;

  console.log("    kurucu cuzdani       " + A.kurucu);
  console.log("      FTHM            " + adet(kurucuTok) +
    "   = 50.000.000 pay + " + adet(satilan) + " test alimi");
  console.log("      USDC            " + usd(Number(kurucuUsdc) / 1e6, 6) + "   (gaz da bu)");
  console.log("      Bu 50.000.000 SERBEST — her an satilabilir, kilit yok, takvim yok.");
  console.log("");
  console.log("    vesting           " + A.vesting);
  console.log("      icindeki FTHM   " + adet(vestTok));
  console.log("      toplam          " + adet(vToplam) + "   cekilen " + adet(vCekilen));
  console.log("      basladi         " + tarih(vBaslangic));
  console.log("      acilan ay       " + vAy + " / 12   -> su an cekilebilir yaklasik " +
    adet((vToplam * vAy) / 12n - vCekilen));
  console.log("      alici           " + vHak +
    (vHak.toLowerCase() === A.kurucu.toLowerCase() ? "   = kurucu cuzdani" : "   BEKLENMEDIK"));
  console.log("");

  /* ---- the per-trade cut, stated as it actually is ----------------- */
  const aciciTok = await bal(A.token, A.acici);
  const aciciUsdc = await bal(A.usdc, A.acici);
  console.log("    ISLEM BASI KESINTI — %0,50 hook ucreti");
  console.log("      SATISTA (cikti USDC):  %0,15 sana  %0,15 stake  %0,20 derinlige");
  console.log("      ALISTA  (cikti FTHM):  %0,50'nin TAMAMI derinlige, sana PAY YOK");
  console.log("");
  console.log("      BU ISTEDIGIN GIBI DEGIL ve sebebini yaziyorum: hook, cikti token");
  console.log("      oldugunda ucreti token olarak aliyor ve stake kasasina FTHM");
  console.log("      gonderilemeyecegi icin (orasi USDC dagitiyor, FTHM orada sikisir)");
  console.log("      bolmeden hepsini havuza koyuyor. Sana da token dusebilirdi —");
  console.log("      zaten FTHM tutuyorsun — ama o sozlesme DEPTH icin yazilmisti ve");
  console.log("      oldugu gibi kullandim. Duzeltmek yeni hook + yeni havuz demek.");
  console.log("");
  console.log("      Su ana kadar bu yoldan biriken:");
  console.log("        acicida FTHM  " + adet(aciciTok) + "   (alis ucretleri, derinlige doner)");
  console.log("        acicida USDC  " + usd(Number(aciciUsdc) / 1e6, 6));
  console.log("        sana USDC     " + usd(0, 2) + "   (henuz satis islemi olmadi)");
  console.log("");
  console.log("      Kaybolmuyor: alis ucreti kalici derinlige gidiyor, yani elindeki");
  console.log("      50.000.000'in satilabilirligini artiriyor. Ama 'her islemden");
  console.log("      cuzdanima dussun' dedigin sey su an yarim calisiyor.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
