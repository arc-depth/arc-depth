"use strict";
/* Codex asked for the public transaction ids of a real lock/mint pair, to
 * bind its receipt matcher to something that actually happened instead of
 * to synthetic fixtures. This finds the Arc side.
 *
 * It also corrects something I had recorded wrongly: I reported that the
 * StockVault address was never written down anywhere, so wNVDA's backing
 * could not be checked from this repo. It is written down —
 * relayer/ayar.json has the vault, the underlying stock token and the
 * deployment block for both AAPL and NVDA. The backing is checkable; I
 * had simply not looked in the right file.
 *
 * The first version of this script reported "no logs from wNVDA" when in
 * fact every single call had come back "rate limit exceeded". A window
 * that was never scanned is not a window that came back clean, and the
 * two must not print the same way. They no longer do.
 *
 * Read-only throughout: eth_getLogs and eth_getTransactionReceipt against
 * the public Arc RPC. Nothing is sent, nothing is signed.
 */
const https = require("https");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const { id: keccakId } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const AYAR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
const SEMBOL = process.argv[2] || "NVDA";
const H = AYAR.hisseler[SEMBOL];
if (!H) { console.log("relayer/ayar.json icinde " + SEMBOL + " yok"); process.exit(1); }

const MINTED = keccakId("Minted(bytes32,address,uint256)");
const BURNED = keccakId("Burned(address,address,uint256,bytes32)");
const TRANSFER = keccakId("Transfer(address,address,uint256)");

/* The public endpoint caps a getLogs range somewhere between 2000 and
   10000 blocks and throttles aggressively on top of that, so the window
   is small and a throttled call is retried rather than counted as empty. */
const PENCERE = 2000n;
const TUR_TAVANI = 60;

let cagri = 0;
function rpc(yontem, parametreler) {
  cagri++;
  const u = new URL(RPC);
  const govde = JSON.stringify({ jsonrpc: "2.0", id: cagri, method: yontem, params: parametreler });
  return new Promise((coz) => {
    const istek = https.request({
      hostname: u.hostname, path: u.pathname, method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(govde) }
    }, (y) => {
      let v = "";
      y.on("data", (p) => (v += p));
      y.on("end", () => {
        try {
          const c = JSON.parse(v);
          if (c.error) return coz({ hata: c.error.message });
          coz({ sonuc: c.result });
        } catch (e) { coz({ hata: "cozulemeyen yanit" }); }
      });
    });
    istek.on("error", (e) => coz({ hata: e.message }));
    istek.write(govde);
    istek.end();
  });
}
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* A throttled call is retried with growing gaps. If it still will not
   answer, the window is reported as UNSCANNED, which is a different fact
   from "nothing there". */
async function loglar(adres, alt, ust) {
  for (let deneme = 0; deneme < 5; deneme++) {
    const c = await rpc("eth_getLogs", [{
      address: adres,
      fromBlock: "0x" + alt.toString(16),
      toBlock: "0x" + ust.toString(16)
    }]);
    if (c.sonuc) return { loglar: c.sonuc };
    if (!/rate limit|too many|limit exceeded/i.test(c.hata)) return { hata: c.hata };
    await bekle(800 * (deneme + 1));
  }
  return { hata: "rate limit (5 denemeden sonra)" };
}

(async function () {
  console.log("");
  console.log(SEMBOL + " KOPRU OLAYI ARANIYOR");
  console.log("  wrapped (Arc)      " + H.wrapped);
  console.log("  vault (Robinhood)  " + H.vault);
  console.log("  stock (Robinhood)  " + H.stock);
  console.log("  dagitim blogu      " + H.wrappedStartBlock);
  console.log("  rpc                " + RPC);
  console.log("");

  const zc = await rpc("eth_chainId", []);
  const sc = await rpc("eth_blockNumber", []);
  if (zc.hata || sc.hata) { console.log("  RPC yanit vermiyor: " + (zc.hata || sc.hata)); return; }
  const zincir = Number(BigInt(zc.sonuc));
  const son = BigInt(sc.sonuc);
  console.log("  zincir " + zincir + "   son blok " + son);

  /* Forward from the recorded deployment block: a mint that followed a
     deployment is within a few windows of it, and sweeping the whole
     chain at 2000 blocks a call would be both futile and rude. */
  let alt = BigInt(H.wrappedStartBlock);
  const bulunan = [];
  const taranmayan = [];
  let tarananBlok = 0n;

  for (let tur = 0; tur < TUR_TAVANI && alt <= son; tur++) {
    const ust = (alt + PENCERE > son) ? son : alt + PENCERE;
    const c = await loglar(H.wrapped, alt, ust);
    if (c.hata) {
      taranmayan.push(alt + "-" + ust + ": " + c.hata);
    } else {
      tarananBlok += (ust - alt + 1n);
      for (const l of c.loglar) bulunan.push(l);
      if (c.loglar.length) console.log("  " + alt + "-" + ust + ": " + c.loglar.length + " log");
    }
    alt = ust + 1n;
    await bekle(250);
  }

  console.log("");
  console.log("  TARAMA: " + tarananBlok + " blok gercekten tarandi, " +
    taranmayan.length + " pencere TARANAMADI");
  if (taranmayan.length) {
    for (const t of taranmayan.slice(0, 6)) console.log("     taranamadi " + t);
    if (taranmayan.length > 6) console.log("     ... " + (taranmayan.length - 6) + " tane daha");
  }

  if (!bulunan.length) {
    console.log("");
    console.log("  Taradigim araliktan hic log cikmadi.");
    if (taranmayan.length)
      console.log("  TARANAMAYAN pencereler var, yani 'olay yok' DEMIYORUM; bu aralik eksik.");
    else
      console.log("  Bu aralik temiz tarandi. Arz sifir degil, demek ki mint bu araligin disinda.");
    console.log("  Olmayan bir tx kimligi uretmek yerine durumu boyle bildiriyorum.");
    return;
  }

  console.log("");
  for (const log of bulunan) {
    const konu = log.topics[0];
    const ad = konu === MINTED ? "Minted" : konu === BURNED ? "Burned"
             : konu === TRANSFER ? "Transfer" : "(tanimsiz olay)";
    console.log("  " + ad);
    console.log("    blok      " + parseInt(log.blockNumber, 16));
    console.log("    tx        " + log.transactionHash);
    console.log("    blockHash " + log.blockHash);
    console.log("    logIndex  " + parseInt(log.logIndex, 16));
    for (let i = 1; i < log.topics.length; i++)
      console.log("    konu" + i + "     " + log.topics[i]);
    if (log.data && log.data !== "0x") console.log("    data      " + log.data);

    if (konu === MINTED) {
      console.log("    -> lockId " + log.topics[1]);
      console.log("       Robinhood tarafindaki kilide tek bag bu. Karsiligi artik");
      console.log("       dogrulanabilir: vault " + H.vault + " ayni kimlikle");
      console.log("       bir Locked yaymis olmali.");
      /* Bind the receipt to the log, exactly as the signer now does — the
         check Codex asked for, run against a real event rather than a
         fixture. */
      const mk = await rpc("eth_getTransactionReceipt", [log.transactionHash]);
      if (mk.hata) { console.log("       makbuz alinamadi: " + mk.hata); }
      else if (!mk.sonuc) { console.log("       makbuz YOK"); }
      else {
        const m = mk.sonuc;
        const dus = (v) => (v || "").toLowerCase();
        const esi = (m.logs || []).find((x) =>
          BigInt(x.logIndex) === BigInt(log.logIndex) &&
          dus(x.address) === dus(log.address) &&
          dus(x.data) === dus(log.data));
        console.log("       makbuz status     " + m.status);
        console.log("       makbuz blockHash  " + m.blockHash +
          (m.blockHash === log.blockHash ? "  (log ile ayni)" : "  UYUSMUYOR"));
        console.log("       log makbuz icinde " + (esi ? "EVET" : "HAYIR"));
        console.log("       gonderen          " + m.from);
      }
    }
    console.log("");
  }
  console.log("  " + cagri + " salt-okunur RPC cagrisi yapildi, hicbir sey gonderilmedi.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
