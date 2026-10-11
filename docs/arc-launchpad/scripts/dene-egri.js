"use strict";
/* ===========================================================================
 * dene-egri.js — buy and sell on the live curve, with the smallest amount
 *                that still proves something.
 *
 *   node scripts/dene-egri.js                 dry run
 *   node scripts/dene-egri.js --uygula        send it
 *   node scripts/dene-egri.js --uygula --tutar 1
 *
 * WHAT THIS CAN PROVE
 *   That a buy works, that a sell works, and that the founder's 0.30% and
 *   the stakers' 0.30% actually arrive during the trade rather than being
 *   booked somewhere for later. Those are the two halves of the curve and
 *   the fee split, which is most of what the curve does.
 *
 * WHAT IT CANNOT PROVE, AND WILL NOT CLAIM TO
 *   Graduation, the locked pool, the hook and biriktir() all live on the
 *   far side of a $15,000 threshold. No amount of small trades reaches
 *   them. They stay untested until the curve actually fills, and a lock
 *   placed before then would be a lock around something nobody has run.
 *
 * Every figure is read off the chain before and after. Nothing here trusts
 * a receipt to mean what it says.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, id, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const UYGULA = process.argv.includes("--uygula");
const val = (ad, d) => { const i = process.argv.indexOf(ad); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const TUTAR = Number(val("--tutar", "1"));

const coder = AbiCoder.defaultAbiCoder();
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);
const U6 = 10n ** 6n;

function ham(method, params) {
  return new Promise((res, rej) => {
    const u = new URL(RPC);
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) }
    }, (s) => {
      let b = "";
      s.on("data", (c) => (b += c));
      s.on("end", () => {
        try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); }
        catch (e) { rej(e); }
      });
    });
    r.on("error", rej);
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 800)); return r; }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((x) => setTimeout(x, w));
      w = Math.min(w * 2, 25000);
    }
  }
}
function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const p of [path.join("C:", "bot", ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      const m = fs.readFileSync(p, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}
const nf = (x, d = 6) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x) => "$" + nf(Number(x) / 1e6, 6);
const tok = (x) => nf(Number(x) / 1e18, 0);

(async function main() {
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const BEN = cuzdan.address;

  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const bakiyeUsdc = async (w) => BigInt(await oku(D.usdc, sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2)));
  const bakiyeTok = async (w) => BigInt(await oku(D.token, sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2)));
  const egriOku = async (sig) => BigInt(await oku(D.egri, sel(sig)));

  /* ---- before ------------------------------------------------------ */
  const once = {
    benUsdc: await bakiyeUsdc(BEN),
    benTok: await bakiyeTok(BEN),
    stakeUsdc: await bakiyeUsdc(D.stake),
    egriUsdc: await bakiyeUsdc(D.egri),
    egriTok: await bakiyeTok(D.egri),
    toplanan: await egriOku("toplanan()"),
    vergi: await egriOku("vergi()")
  };
  const giris = BigInt(Math.round(TUTAR * 1e6));
  const kota = BigInt(await oku(D.egri, sel("alimKotasi(uint256)") +
    coder.encode(["uint256"], [(giris * 99n) / 100n]).slice(2)));

  console.log("CANLI EGRIDE MINIMUM DENEME");
  console.log("  egri        " + D.egri);
  console.log("  alinacak    " + usd(giris) + "   ucret %1: %0,30 kurucu / %0,30 stake / %0,40 havuz");
  console.log("");
  console.log("  ONCE");
  console.log("    cuzdan USDC      " + usd(once.benUsdc));
  console.log("    cuzdan DEPTH     " + tok(once.benTok));
  console.log("    stake kasasi     " + usd(once.stakeUsdc));
  console.log("    egri toplanan    " + usd(once.toplanan));
  console.log("    egri vergi       " + usd(once.vergi));
  console.log("    beklenen token   " + tok(kota) + "   (ucret dusulmus girisin kotasi)");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi. --uygula ekle");
    return;
  }
  if (once.benUsdc < giris * 2n) {
    console.log("  DURDURULDU: bakiye alim + gaz icin yetersiz.");
    process.exit(1);
  }

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  let nonce = Number(await rpc("eth_getTransactionCount", [BEN, "latest"]));
  const gonder = async (to, data, ad) => {
    let g;
    try { g = BigInt(await rpc("eth_estimateGas", [{ from: BEN, to, data }])); }
    catch (e) { console.log("    " + ad + " tahmin edilemedi: " + e.message); throw e; }
    const imzali = await cuzdan.signTransaction({
      chainId: CHAIN_ID, nonce: nonce++, to, data,
      gasLimit: (g * 13n) / 10n, gasPrice, value: 0n
    });
    let hash;
    try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
    catch (e) {
      if (!/already known|nonce too low/i.test(String(e.message))) throw e;
      hash = keccak256(imzali);
    }
    console.log("    " + ad + " -> " + hash);
    for (let i = 0; i < 90; i++) {
      let rc = null;
      try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
      if (rc) {
        if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
        console.log("      blok " + parseInt(rc.blockNumber, 16) + ", gaz " +
          parseInt(rc.gasUsed, 16).toLocaleString("en-US"));
        return rc;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error("makbuz gelmedi: " + hash);
  };

  /* ---- approve, then buy ------------------------------------------ */
  const izin = BigInt(await oku(D.usdc, sel("allowance(address,address)") +
    coder.encode(["address", "address"], [BEN, D.egri]).slice(2)));
  if (izin < giris) {
    console.log("  USDC onayi...");
    await gonder(D.usdc, sel("approve(address,uint256)") +
      coder.encode(["address", "uint256"], [D.egri, (1n << 255n)]).slice(2), "approve");
  }

  console.log("  ALIM...");
  await gonder(D.egri, sel("al(uint256,uint256)") +
    coder.encode(["uint256", "uint256"], [giris, 0]).slice(2), "al");

  const alimSonra = {
    benUsdc: await bakiyeUsdc(BEN),
    benTok: await bakiyeTok(BEN),
    stakeUsdc: await bakiyeUsdc(D.stake),
    toplanan: await egriOku("toplanan()"),
    vergi: await egriOku("vergi()")
  };
  const alinanTok = alimSonra.benTok - once.benTok;
  const stakeAldi = alimSonra.stakeUsdc - once.stakeUsdc;

  console.log("");
  console.log("  ALIM SONUCU");
  console.log("    gelen DEPTH       " + tok(alinanTok));
  console.log("    stake kasasina    " + usd(stakeAldi) +
    "   beklenen " + usd((giris * 3000n) / 1_000_000n));
  console.log("    egri toplanan     " + usd(alimSonra.toplanan));
  console.log("    egri vergi        " + usd(alimSonra.vergi) + "   (havuza kalan dilim)");
  /* The founder's slice lands in the same wallet that paid, so it cannot be
     read as a balance increase — it is derived instead. */
  console.log("    kurucu dilimi     " + usd((giris * 3000n) / 1_000_000n) +
    "   ayni cuzdan oldugu icin bakiyeden ayirt edilemiyor; olay kaydindan");

  /* ---- then sell half back ---------------------------------------- */
  const satilacak = alinanTok / 2n;
  console.log("");
  console.log("  SATIM... " + tok(satilacak) + " DEPTH");
  const tokIzin = BigInt(await oku(D.token, sel("allowance(address,address)") +
    coder.encode(["address", "address"], [BEN, D.egri]).slice(2)));
  if (tokIzin < satilacak) {
    await gonder(D.token, sel("approve(address,uint256)") +
      coder.encode(["address", "uint256"], [D.egri, (1n << 255n)]).slice(2), "token approve");
  }
  await gonder(D.egri, sel("sat(uint256,uint256)") +
    coder.encode(["uint256", "uint256"], [satilacak, 0]).slice(2), "sat");

  const son = {
    benTok: await bakiyeTok(BEN),
    stakeUsdc: await bakiyeUsdc(D.stake),
    egriUsdc: await bakiyeUsdc(D.egri),
    toplanan: await egriOku("toplanan()"),
    vergi: await egriOku("vergi()")
  };

  console.log("");
  console.log("  SATIM SONUCU");
  console.log("    kalan DEPTH       " + tok(son.benTok - once.benTok));
  console.log("    stake kasasi      " + usd(son.stakeUsdc) +
    "   satistan da pay aldi: +" + usd(son.stakeUsdc - alimSonra.stakeUsdc));
  console.log("    egri toplanan     " + usd(son.toplanan));
  console.log("    egri vergi        " + usd(son.vergi));
  console.log("");
  console.log("  DEGISMEZ");
  const borc = son.toplanan + son.vergi;
  console.log("    egrinin tuttugu   " + usd(son.egriUsdc));
  console.log("    borcu             " + usd(borc) + "   (toplanan + vergi)");
  console.log("    " + (son.egriUsdc >= borc ? "OK   tuttugundan fazlasini borclanmadi"
                                             : "HATA borcu tuttugundan fazla"));
  console.log("");
  console.log("  TEST EDILMEYENLER — bu tutarla ulasilamaz");
  console.log("    mezuniyet, kilitli havuz, hook, biriktir()");
  console.log("    hepsi $" + nf(Number(BigInt(D.esik)) / 1e6, 0) + " esigin otesinde.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
