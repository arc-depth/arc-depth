"use strict";
/* My collateral finding rested on stdout from a run that is already gone,
 * and Codex hit HTTP 429 after two calls trying to check it. It stopped
 * rather than calling the absence proven, which is right, and it asked for
 * raw archives instead. There were none. This writes them.
 *
 * What it keeps is the unmodified JSON-RPC result for every call, next to
 * the exact method and params that produced it, so each claim can be
 * re-derived from the files without touching a throttled endpoint:
 *
 *   nokta/*.json       receipts, blocks, chain ids, supply, vault balance
 *   released-rhc.jsonl one line per getLogs window over the vault's whole
 *                      life — the absence claim, window by window
 *   ozet.json          manifest: method, params, sha256, time, endpoint
 *
 * On what this is and is not. An archive I fetched is not proof that I
 * fetched it honestly, and I am not presenting it as that. What it does is
 * make the claim checkable: the receipts carry blockHash, the blocks carry
 * their own hash and parentHash, so the receipt-to-block binding and the
 * chain between the heights can be verified from the files alone, offline,
 * by someone who trusts none of it. Any single item can be re-fetched
 * later in one call when the endpoint is not throttling. And the Released
 * sweep records every window, so whether the windows actually tile the
 * range with no gaps is a property of the file rather than of my summary.
 *
 * Read-only. Nothing is sent, nothing is signed.
 */
const https = require("https");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { id: keccakId, AbiCoder } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const AYAR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
const H = AYAR.hisseler.NVDA;

const DIZIN = path.join(__dirname, "..", "kopru", "kanit");
const NOKTA = path.join(DIZIN, "nokta");
fs.mkdirSync(NOKTA, { recursive: true });

const RELEASED = keccakId("Released(bytes32,address,uint256,uint256)");
const coder = AbiCoder.defaultAbiCoder();
const sel = (imza) => keccakId(imza).slice(0, 10);

/* The three Arc transactions and the two Robinhood ones the claim is
   built on. Named so the archive says what each file is for. */
const ARC_ISLEMLER = [
  ["mint-a", "0x742fbe4294b6ccfe3209dabcf700d8c4c37c1b05135eaaeba36e5e3ac360b7ec"],
  ["mint-b", "0x67888679bf274c158a3c35fbf2f006f5ba14110b3a1fe3268aa2c35914d85ba9"],
  ["yakma",  "0x88bd43e93220239ac8ae369252b02deff19cb134cbc165f2015cf28fe4f5a42a"]
];
const RHC_ISLEMLER = [
  ["kilit-a", "0xdd4478ba9b348698c6cf725b5171a5a9a25997128ca55574b58d68b50f7a0c1d"],
  ["kilit-b", "0x2872a7fdf04d6d396742ff12507c08fd003657117e631616d078cae06ab7cfde"]
];

const manifest = [];
let cagri = 0;

function rpc(url, yontem, parametreler) {
  cagri++;
  const u = new URL(url);
  const govde = JSON.stringify({ jsonrpc: "2.0", id: cagri, method: yontem, params: parametreler });
  return new Promise((coz) => {
    const istek = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(govde) }
    }, (y) => {
      let v = "";
      y.on("data", (p) => (v += p));
      y.on("end", () => {
        try {
          const c = JSON.parse(v);
          if (c.error) return coz({ hata: c.error.message, kod: c.error.code, http: y.statusCode });
          coz({ sonuc: c.result, http: y.statusCode });
        } catch (e) { coz({ hata: "cozulemeyen yanit", http: y.statusCode }); }
      });
    });
    istek.on("error", (e) => coz({ hata: e.message }));
    istek.write(govde);
    istek.end();
  });
}
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* Throttling is the normal case on these endpoints, so a 429 is retried
   with growing gaps rather than recorded as a fact about the chain. */
async function sabirli(url, yontem, parametreler, denemeTavani = 6) {
  for (let d = 0; d < denemeTavani; d++) {
    const c = await rpc(url, yontem, parametreler);
    if (c.sonuc !== undefined) return c;
    if (!/rate limit|too many|429|-32005|limit exceeded/i.test(
        (c.hata || "") + " " + (c.kod || "") + " " + (c.http || ""))) return c;
    await bekle(700 * (d + 1));
  }
  return { hata: "rate limit (" + denemeTavani + " denemeden sonra)" };
}

function yaz(ad, url, yontem, parametreler, cevap) {
  const dosya = path.join(NOKTA, ad + ".json");
  /* The result verbatim. Nothing reformatted, nothing selected. */
  const govde = JSON.stringify(cevap.sonuc === undefined ? { hata: cevap.hata } : cevap.sonuc, null, 1) + "\n";
  fs.writeFileSync(dosya, govde);
  manifest.push({
    dosya: path.relative(DIZIN, dosya).replace(/\\/g, "/"),
    uc: url, yontem, parametreler,
    alindi: new Date().toISOString(),
    sha256: crypto.createHash("sha256").update(govde).digest("hex"),
    basarili: cevap.sonuc !== undefined
  });
  return cevap.sonuc;
}

(async function () {
  console.log("");
  console.log("KOPRU KANIT ARSIVI");
  console.log("  dizin " + DIZIN);
  console.log("");

  /* ---- chain ids, so the archive says which chains it is about ---- */
  for (const [ad, url] of [["zincir-arc", ARC_RPC], ["zincir-rhc", RHC_RPC]]) {
    const c = await sabirli(url, "eth_chainId", []);
    const v = yaz(ad, url, "eth_chainId", [], c);
    console.log("  " + ad.padEnd(14) + (v ? Number(BigInt(v)) : "ALINAMADI: " + c.hata));
  }

  /* ---- receipts, and the block each one claims to be in ---------- */
  const bloklar = new Set();
  for (const [grup, url, liste] of [["arc", ARC_RPC, ARC_ISLEMLER], ["rhc", RHC_RPC, RHC_ISLEMLER]]) {
    for (const [ad, tx] of liste) {
      const c = await sabirli(url, "eth_getTransactionReceipt", [tx]);
      const r = yaz("makbuz-" + grup + "-" + ad, url, "eth_getTransactionReceipt", [tx], c);
      if (!r) { console.log("  makbuz " + grup + "/" + ad + " ALINAMADI: " + c.hata); continue; }
      console.log("  makbuz " + grup + "/" + ad.padEnd(8) + " blok " +
        parseInt(r.blockNumber, 16) + "  status " + r.status + "  log " + (r.logs || []).length);
      bloklar.add(grup + ":" + r.blockNumber);
      await bekle(200);
    }
  }

  /* The block at that height, by number, so the receipt's blockHash can
     be tied to the canonical chain from the files alone. */
  for (const anahtar of bloklar) {
    const [grup, numara] = anahtar.split(":");
    const url = grup === "arc" ? ARC_RPC : RHC_RPC;
    const c = await sabirli(url, "eth_getBlockByNumber", [numara, false]);
    const b = yaz("blok-" + grup + "-" + parseInt(numara, 16), url,
                  "eth_getBlockByNumber", [numara, false], c);
    if (b) console.log("  blok   " + grup + "/" + parseInt(numara, 16) + "  " + b.hash);
    await bekle(200);
  }

  /* ---- the two numbers the 1:1 claim compares ------------------- */
  const arz = await sabirli(ARC_RPC, "eth_call",
    [{ to: H.wrapped, data: sel("totalSupply()") }, "latest"]);
  yaz("arz-wnvda", ARC_RPC, "eth_call",
    [{ to: H.wrapped, data: sel("totalSupply()") }, "latest"], arz);
  const bakiye = await sabirli(RHC_RPC, "eth_call", [{ to: H.stock,
    data: sel("balanceOf(address)") + coder.encode(["address"], [H.vault]).slice(2) }, "latest"]);
  yaz("kasa-bakiye", RHC_RPC, "eth_call", [{ to: H.stock,
    data: sel("balanceOf(address)") + coder.encode(["address"], [H.vault]).slice(2) }, "latest"], bakiye);
  if (arz.sonuc) console.log("  wNVDA arz      " + BigInt(arz.sonuc));
  if (bakiye.sonuc) console.log("  kasa bakiyesi  " + BigInt(bakiye.sonuc));

  /* ---- the absence claim, window by window ---------------------- */
  console.log("");
  console.log("RELEASED TARAMASI — her pencere dosyaya yaziliyor");
  const jsonl = path.join(DIZIN, "released-rhc.jsonl");
  /* The sweep extends an existing archive instead of redoing it. The
     absence it records is only true up to the block it reached, and that
     boundary goes stale the moment the chain moves — so moving it forward
     has to be cheap enough to actually do, which means a handful of
     windows rather than 738. Append, never truncate: the earlier windows
     are the evidence. */
    const oncekiSatirlar = fs.existsSync(jsonl)
      ? fs.readFileSync(jsonl, "utf8").trim().split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s))
      : [];
  const devamdan = oncekiSatirlar.length
    ? BigInt(oncekiSatirlar[oncekiSatirlar.length - 1].toBlock) + 1n
    : BigInt(H.vaultStartBlock);
  if (oncekiSatirlar.length)
    console.log("  mevcut arsiv " + oncekiSatirlar.length + " pencere, " +
      (devamdan - 1n) + " blogunda bitiyor — oradan devam ediliyor");
  const akis = fs.createWriteStream(jsonl, { flags: "a" });
  const sn = await sabirli(RHC_RPC, "eth_blockNumber", []);
  yaz("son-blok-rhc", RHC_RPC, "eth_blockNumber", [], sn);
  if (!sn.sonuc) { console.log("  son blok alinamadi, tarama yapilmadi"); akis.end(); }
  else {
    const son = BigInt(sn.sonuc);
    const PENCERE = 2000n;
    let alt = devamdan;
    let pencereSayisi = 0, eksik = 0, bulunan = 0;
    /* Contiguity is checked while writing: a window that starts anywhere
       other than one past the previous window's end is a gap, and a gap
       is the only thing that can make this sweep lie. */
    let beklenenAlt = alt;
    const bosluklar = [];
    while (alt <= son) {
      const ust = (alt + PENCERE > son) ? son : alt + PENCERE;
      const c = await sabirli(RHC_RPC, "eth_getLogs", [{
        address: H.vault, topics: [RELEASED],
        fromBlock: "0x" + alt.toString(16), toBlock: "0x" + ust.toString(16)
      }]);
      if (alt !== beklenenAlt) bosluklar.push(beklenenAlt + "-" + (alt - 1n));
      akis.write(JSON.stringify({
        fromBlock: alt.toString(), toBlock: ust.toString(),
        sonuc: c.sonuc === undefined ? null : c.sonuc,
        hata: c.sonuc === undefined ? c.hata : undefined
      }) + "\n");
      pencereSayisi++;
      if (c.sonuc === undefined) eksik++;
      else bulunan += c.sonuc.length;
      beklenenAlt = ust + 1n;
      alt = ust + 1n;
    }
    akis.end();
    await new Promise((r) => akis.on("close", r));
    const govde = fs.readFileSync(jsonl);
    const toplamPencere = oncekiSatirlar.length + pencereSayisi;
    manifest.push({
      dosya: "released-rhc.jsonl",
      uc: RHC_RPC, yontem: "eth_getLogs",
      parametreler: { address: H.vault, topics: [RELEASED],
                      aralik: H.vaultStartBlock + "-" + son.toString(), pencere: "2000" },
      alindi: new Date().toISOString(),
      sha256: crypto.createHash("sha256").update(govde).digest("hex"),
      basarili: eksik === 0,
      pencere: toplamPencere, buKosudaPencere: pencereSayisi,
      eksikPencere: eksik, bulunanOlay: bulunan, bosluk: bosluklar,
      /* The boundary, stated as data rather than left in prose. An absence
         is only an absence up to here, and this number is what says where
         "here" is. */
      kapsamSonBlok: son.toString(),
      kapsamZamani: new Date().toISOString()
    });
    console.log("  bu kosuda " + pencereSayisi + " pencere, toplam " + toplamPencere +
      ", " + eksik + " eksik, " + bulunan + " Released olayi, " + bosluklar.length + " bosluk");
    if (eksik || bosluklar.length) {
      console.log("  EKSIK TARAMA VAR — bu dosya yokluk iddiasini TASIMIYOR.");
    } else if (bulunan === 0) {
      /* Said carefully, because the flat version of this sentence is
         wrong. The file shows no Released up to the block it reached, at
         the moment it reached it. It says nothing about later blocks, and
         re-running this script is what moves the boundary forward. */
      console.log("  Aralik eksiksiz tarandi ve " + son + " BLOGUNA KADAR hic Released yok.");
      console.log("  Bu bir zaman sinirli iddia: " + son + "'den sonrasi icin hicbir sey");
      console.log("  soylemiyor. Siniri ilerletmek icin bu betigi tekrar kosmak yeterli,");
      console.log("  mevcut pencereler korunuyor ve sadece yenileri ekleniyor.");
    }
  }

  /* ---- manifest -------------------------------------------------- */
  const ozet = {
    uretildi: new Date().toISOString(),
    amac: "wNVDA karsilik iddiasinin ham dayanagi. Her kayit, sonucu ureten " +
          "yontem ve parametrelerle birlikte duruyor; makbuzlardaki blockHash ile " +
          "bloklarin hash/parentHash alanlari dosyalardan, cevrimdisi, kimseye " +
          "guvenmeden karsilastirilabilir.",
    uyari: "Benim cektigim bir arsiv, durust cektigimin kaniti degildir. Yaptigi " +
           "sey iddiayi kontrol edilebilir kilmak: her kalem tek bir cagriyla " +
           "yeniden dogrulanabilir ve Released taramasinin araligi gercekten " +
           "kapatip kapatmadigi dosyanin kendi ozelligi.",
    arcRpc: ARC_RPC, rhcRpc: RHC_RPC,
    wrapped: H.wrapped, kasa: H.vault, hisse: H.stock,
    kayitlar: manifest
  };
  fs.writeFileSync(path.join(DIZIN, "ozet.json"), JSON.stringify(ozet, null, 1) + "\n");

  const basarisiz = manifest.filter((m) => !m.basarili);
  console.log("");
  console.log("  " + manifest.length + " kayit yazildi, " + basarisiz.length + " basarisiz");
  for (const b of basarisiz) console.log("     ALINAMADI " + b.dosya);
  console.log("  " + cagri + " salt-okunur cagri, hicbir sey gonderilmedi.");
  console.log("  ozet " + path.join(DIZIN, "ozet.json"));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
