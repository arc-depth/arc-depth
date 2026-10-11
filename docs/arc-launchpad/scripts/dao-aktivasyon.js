"use strict";
/* ===========================================================================
 * dao-aktivasyon.js — FTHM DAO'sunu kilitli durumdan çıkarmak
 *
 *   node scripts/dao-aktivasyon.js            ölçer ve prova eder, GÖNDERMEZ
 *   node scripts/dao-aktivasyon.js --uygula   tek işlemi gönderir
 *
 * SORUN, ÖLÇÜLMÜŞ HALİYLE
 *   Her işlemin %0,30'u artık DevPool'a gidiyor ve DevPool'dan parayı
 *   yalnızca FTHM Governor çıkarabiliyor. Governor'dan para çıkması için bir
 *   teklifin geçmesi gerekiyor. Teklif verebilmek için oy gücü gerekiyor. Oy
 *   gücü stake etmekten geliyor. Ve zincirden okundu:
 *
 *     totalStaked        0
 *     MIN_OY_GUCU   50.000 FTHM
 *
 *   Yani bugün hiç kimse teklif veremiyor. Dilim birikmeye devam ediyor ve
 *   kimse çekemiyor — ne DAO ne biz. Sözleşmede bir kusur yok; eksik olan
 *   dolaşımdaki stake.
 *
 * NEDEN YENİ BİR SÖZLEŞME YOK
 *   Stake.stake(uint256) izinsiz: FTHM tutan herkes çağırabilir. Yani
 *   kilidin çözümü bir sözleşme değil, bir işlem. Buraya bir "aktivasyon
 *   sözleşmesi" koymak yeni bir yetki, yeni bir dağıtım ve yeni bir güven
 *   varsayımı eklerdi — hiçbirine gerek yok.
 *
 * NE KADAR — VE NİYE EN AZ
 *   Kurucunun bakiyesi 50.066.437 FTHM. Bunun tamamını stake etmek DAO'yu
 *   açar ama oy gücünün tamamını tek adreste toplar. Tabanı (50.000 FTHM)
 *   stake etmek de DAO'yu açar, çünkü eşik stake edilmiş arzın %1'i ile bu
 *   tabanın BÜYÜĞÜ ve tek stake eden kişi her ikisini de geçer.
 *
 *   İkisi arasında fark yetki değil, YOĞUNLUK: üçüncü taraflar stake
 *   etmeye başladığında kurucunun payı tabandan başlarsa hızla erir,
 *   50 milyondan başlarsa erimez. O yüzden taban.
 *
 * DÜRÜST SINIR — VE BU SAKLANMIYOR
 *   Bu işlem DAO'yu "merkeziyetsiz" yapmıyor. Tek stake eden kurucu olduğu
 *   sürece teklif eşiğini de kotayı da yalnız geçer; yani DAO açıldığı anda
 *   tek adresli bir DAO oluyor. Bunu tutan şey oy dağılımı değil:
 *
 *     oy süresi    5 gün      bir ödeme aynı gün hareket etmiyor
 *     timelock     2 gün      kabulden uygulamaya
 *     guardian     2027-10-07'ye kadar, YALNIZCA iptal edebiliyor
 *
 *   Ve DAO'nun tek yetkisi DevPool'dan ödeme yapmak; teminat, kilitli
 *   likidite, ücretler ve açılış fiyatı erişilemez (denetim-dao-erisimi.js
 *   bunu zincirden sorarak doğruluyor).
 *
 *   Arayüz bunu olduğu gibi gösteriyor: tek stake eden varsa ekran "oy
 *   gücünün %100'ü tek adreste" yazıyor, "DAO yönetiyor" yazmıyor.
 *
 * GERİ ALINABİLİR
 *   unstake(uint256) var. Bu işlem bir yöne kilitlenme değil.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { id, Wallet, JsonRpcProvider, Contract } = require("ethers");

const KOK = path.join(__dirname, "..");
const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const UYGULA = process.argv.includes("--uygula");

const F = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const TOKEN = F.token;
const STAKE = F.stake;
const GOV = F.governor;

const sel = (imza) => id(imza).slice(0, 10);
const w = (a) => a.slice(2).toLowerCase().padStart(64, "0");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

let no = 1;
async function arc(yontem, parametreler) {
  for (let d = 0; d < 5; d++) {
    if (d > 0) await bekle(1000 * d);
    const r = await fetch(ARC_RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: no++, method: yontem, params: parametreler }),
      signal: AbortSignal.timeout(30_000)
    }).then((x) => x.json()).catch((e) => ({ error: { message: e.message } }));
    if (r.result !== undefined) return r.result;
    const m = (r.error && r.error.message) || "";
    if (!/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed/i.test(m)) {
      throw new Error(m || "bilinmeyen RPC hatasi");
    }
  }
  throw new Error("okunamadi");
}
const oku = async (to, imza, ek = "") => {
  const r = await arc("eth_call", [{ to, data: sel(imza) + ek }, "latest"]);
  return r && r !== "0x" ? BigInt(r) : null;
};
const jeton = (v) => v == null ? "okunamadi"
  : (Number(v) / 1e18).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " FTHM";

/* The deployer key, resolved exactly the way every other script here
   resolves it. Inventing a second variable name (ARC_ANAHTAR) meant the
   dry run could not even start — and a key that is "not configured" looks
   identical to a key that is wrong. */
function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  console.log("");
  console.log("FTHM DAO AKTIVASYONU" + (UYGULA ? "  —  UYGULAMA" : "  —  PROVA, hicbir sey gonderilmiyor"));
  console.log("");

  const anahtar = ozelAnahtar();
  if (!anahtar) {
    console.log("  TRADER_PRIVATE_KEY bulunamadi — yalnizca okuma yapilacak.");
  }
  const cuzdan = anahtar ? new Wallet(anahtar) : null;
  const ben = cuzdan ? cuzdan.address : F.kurucu;

  /* ---- 1. the lock, measured ------------------------------------- */
  console.log("1) KILIT");
  const toplam = await oku(STAKE, "totalStaked()");
  const taban = await oku(STAKE, "MIN_OY_GUCU()");
  const esikBps = await oku(GOV, "PROPOSAL_THRESHOLD_BPS()");
  const kotaBps = await oku(GOV, "QUORUM_BPS()");
  console.log("     totalStaked    " + jeton(toplam));
  console.log("     MIN_OY_GUCU    " + jeton(taban));
  console.log("     teklif esigi   stake'in %" + (Number(esikBps) / 100) +
    " ile tabanin BUYUGU");
  console.log("     kota           anlik toplamin %" + (Number(kotaBps) / 100));

  ok(toplam != null && taban != null && esikBps != null,
    "kilidin uc bileseni okunabildi",
    "stake toplami, taban ve esik — ucu olmadan ne kadar gerektigi bilinemez");

  if (toplam != null && toplam > 0n) {
    console.log("");
    console.log("  DAO ZATEN ACIK: " + jeton(toplam) + " stake edilmis.");
    console.log("  Bu betigin yapacagi bir sey yok.");
    process.exit(0);
  }

  /* ---- 2. what this wallet can do -------------------------------- */
  console.log("");
  console.log("2) BU CUZDAN NE YAPABILIR");
  const bakiye = await oku(TOKEN, "balanceOf(address)", w(ben));
  const stakeli = await oku(STAKE, "stakedOf(address)", w(ben));
  const izin = await oku(TOKEN, "allowance(address,address)", w(ben) + w(STAKE));
  console.log("     adres          " + ben);
  console.log("     FTHM bakiyesi  " + jeton(bakiye));
  console.log("     stake edilmis  " + jeton(stakeli));
  console.log("     stake iznine   " + jeton(izin));

  ok(bakiye != null && taban != null && bakiye >= taban,
    "BAKIYE TABANI KARSILIYOR",
    bakiye != null && taban != null && bakiye >= taban
      ? jeton(bakiye) + " var, " + jeton(taban) + " gerekiyor"
      : "taban karsilanmiyor — bu cuzdan DAO'yu acamaz");

  /* ---- 3. the amount, and why it is the floor -------------------- */
  console.log("");
  console.log("3) MIKTAR");
  const miktar = taban;
  const yuzde = bakiye && bakiye > 0n
    ? (Number(miktar) / Number(bakiye) * 100).toFixed(3) : "?";
  console.log("     stake edilecek " + jeton(miktar) +
    "   (bu cuzdanin %" + yuzde + "'i)");
  console.log("");
  console.log("     Tabani seciyorum cunku DAO'yu acmak icin yeterli ve");
  console.log("     yogunlugu en az tutan miktar bu. Ucuncu taraflar stake");
  console.log("     etmeye basladiginda tabandan baslayan pay hizla erir.");

  /* ---- 4. the honest limit, printed before anything is sent ------ */
  console.log("");
  console.log("4) BU ISLEMDEN SONRA DURUM — susulmuyor");
  console.log("     Tek stake eden bu cuzdan olacagi icin teklif esigini de");
  console.log("     kotayi da yalniz gecer. Yani DAO acilir ama TEK ADRESLI");
  console.log("     bir DAO olur. Bunu tutan sey oy dagilimi degil:");
  console.log("       - oy suresi 5 gun, timelock 2 gun");
  console.log("       - guardian 2027-10-07'ye kadar YALNIZCA iptal edebilir");
  console.log("       - DAO'nun tek yetkisi DevPool'dan odeme yapmak");
  console.log("     Arayuz bunu oldugu gibi gosteriyor.");

  /* ---- 5. the dry run -------------------------------------------- */
  console.log("");
  console.log("5) PROVA — zincir kabul eder mi");
  /* eth_call on a write tells us whether it would revert, for free. The
     approve has to be simulated as if it had already happened, so the
     stake call is checked against the allowance it would then have; with
     no allowance yet the stake call legitimately reverts and that is not
     a finding. */
  let onayGecer = false, stakeGecer = null;
  try {
    await arc("eth_call", [{ from: ben, to: TOKEN,
      data: sel("approve(address,uint256)") + w(STAKE) +
        miktar.toString(16).padStart(64, "0") }, "latest"]);
    onayGecer = true;
  } catch (e) { onayGecer = false; }
  ok(onayGecer, "approve(STAKE, taban) zincirde kabul ediliyor",
    onayGecer ? "izin tam gereken kadar — sinirsiz izin verilmiyor"
      : "approve prova sirasinda dondu");

  if (izin != null && izin >= miktar) {
    try {
      await arc("eth_call", [{ from: ben, to: STAKE,
        data: sel("stake(uint256)") + miktar.toString(16).padStart(64, "0") },
        "latest"]);
      stakeGecer = true;
    } catch (e) { stakeGecer = String(e.message).slice(0, 80); }
    ok(stakeGecer === true, "stake(taban) zincirde kabul ediliyor",
      stakeGecer === true ? "izin zaten yeterli" : String(stakeGecer));
  } else {
    console.log("     stake provasi atlandi: izin henuz " + jeton(izin) +
      ", yani simdi cagrilsa hakli olarak doner. Izin verildikten");
    console.log("     sonra ayni prova tekrar kosulacak.");
  }

  if (!UYGULA) {
    console.log("");
    console.log("  PROVA BITTI — hicbir islem gonderilmedi.");
    console.log("  Gondermek icin: node scripts/dao-aktivasyon.js --uygula");
    console.log("");
    console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
    process.exit(kotu === 0 ? 0 : 1);
  }

  /* ---- 6. apply --------------------------------------------------- */
  if (!cuzdan) {
    console.log("");
    console.log("KOTU  --uygula verildi ama TRADER_PRIVATE_KEY bulunamadi.");
    process.exit(1);
  }
  if (kotu > 0) {
    console.log("");
    console.log("KOTU  prova gecmedi, gonderilmiyor.");
    process.exit(1);
  }

  console.log("");
  console.log("6) UYGULANIYOR");

  /* HER AG CAGRISI YENIDEN DENENIYOR — ILK DENEMEDE BURADA KESILDI
       Ilk gercek kosum tam burada durdu: eth_getTransactionCount "rate
       limit exceeded" dondu ve betik hicbir sey gondermeden cikti.
       Zincir durumu kontrol edildi, hicbir islem gitmemisti — ama
       okumalarin yeniden denenip GONDERIMIN denenmemesi tutarsizdi:
       bu dosyanin okuma tarafi bastan beri alti kez deniyor.

       Arc'in acik ucu hiz sinirini sert uyguluyor ve bu proje ayni
       sinira daha once de carpti: bir dagitim dokuz adimin sekizinde
       kesildi. Orada ogrenilen sey buraya da gecerli. */
  const saglayici = new JsonRpcProvider(ARC_RPC,
    { chainId: 5042, name: "arc" }, { staticNetwork: true });
  const imzaci = cuzdan.connect(saglayici);
  const erc20 = new Contract(TOKEN,
    ["function approve(address,uint256) returns (bool)"], imzaci);
  const stk = new Contract(STAKE, ["function stake(uint256)"], imzaci);

  const direngen = async (ad, is) => {
    let sonHata = null;
    for (let d = 0; d < 6; d++) {
      if (d > 0) {
        const ms = Math.min(3000 * Math.pow(2, d - 1), 24000);
        process.stdout.write(".");
        await bekle(ms);
      }
      try { return await is(); } catch (e) {
        sonHata = e;
        const m = String((e && e.message) || "");
        /* Only throttling and transport noise are worth retrying. A
           revert is an answer, and repeating it six times just hides it. */
        if (!/rate limit|too many|timeout|503|502|ECONNRESET|coalesce|fetch failed/i.test(m)) break;
      }
    }
    throw new Error(ad + ": " + ((sonHata && sonHata.message) || "?").slice(0, 120));
  };

  /* "pending" rather than "latest": if an earlier transaction from this
     wallet is still in the mempool, latest would hand back a nonce that
     is already taken. This project reused a nonce exactly once and it
     cost a deployment. */
  const n0 = await direngen("nonce okunamadi",
    () => saglayici.getTransactionCount(imzaci.address, "pending"));
  let n = n0;

  const t1 = await direngen("approve gonderilemedi",
    () => erc20.approve(STAKE, miktar, { nonce: n++ }));
  console.log("     approve  " + t1.hash);
  await direngen("approve makbuzu alinamadi", () => t1.wait());

  const t2 = await direngen("stake gonderilemedi",
    () => stk.stake(miktar, { nonce: n++ }));
  console.log("     stake    " + t2.hash);
  await direngen("stake makbuzu alinamadi", () => t2.wait());

  await bekle(1500);
  const sonToplam = await oku(STAKE, "totalStaked()");
  const sonGuc = await oku(STAKE, "oyGucu(address)", w(imzaci.address));
  console.log("");
  console.log("     totalStaked    " + jeton(sonToplam));
  console.log("     oy gucun       " + jeton(sonGuc));

  /* Voting power is read at a snapshot one block back (ANLIK_GERI = 1),
     so a proposal opened in the same block as the stake would read zero.
     Stating it because "I staked and still cannot propose" is exactly the
     kind of silence this project keeps running into. */
  ok(sonToplam != null && sonToplam >= miktar,
    "DAO ARTIK KILITLI DEGIL",
    "stake zincirde. Oy gucu bir blok geriden okunuyor (ANLIK_GERI = 1), " +
      "yani ayni blokta acilan bir teklif sifir agirlik gorur.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.log("");
  console.log("KOTU  " + e.message);
  process.exit(1);
});
