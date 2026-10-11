"use strict";
/* Does the live wrapped stock on Arc have anything behind it?
 *
 * This is the question the whole collateral design rests on, and until now
 * I had answered it with "cannot be checked, the vault address was never
 * recorded". That was wrong. relayer/ayar.json records the vault, the
 * underlying stock token and the deployment block for both AAPL and NVDA.
 *
 * The check has two halves:
 *
 *   Arc side — every Minted and Burned on the wrapped token, summed, and
 *   compared against the live totalSupply. If minted minus burned does
 *   not equal the supply, shares came from somewhere other than a bridge
 *   notice.
 *
 *   Robinhood side — each mint names a lockId, and the relayer derives
 *   that id from the source transaction hash. So the id can be presented
 *   straight back to the Robinhood chain: if a transaction with that hash
 *   exists, succeeded, touched the vault and emitted Locked for the same
 *   number of shares, the mint has a lock behind it. If it does not, the
 *   wrapped shares are backed by nothing.
 *
 * Read-only on both chains. Nothing is sent, nothing is signed.
 *
 * Note on the derivation itself: using the bare transaction hash as the
 * lock id means two locks in one transaction collapse into a single
 * notice, and the second is unmintable. The signer in kopru/ does not
 * have that bug — it derives from tx plus log index — but the live
 * relayer does, and anything already minted carries the old shape.
 */
const https = require("https");
const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const { id: keccakId, AbiCoder, getAddress } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const AYAR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
const SEMBOL = (process.argv[2] || "NVDA").toUpperCase();
const H = AYAR.hisseler[SEMBOL];
if (!H) {
  console.log("relayer/ayar.json icinde " + SEMBOL + " yok. Olanlar: " +
    Object.keys(AYAR.hisseler).join(", "));
  process.exit(1);
}

const MINTED = keccakId("Minted(bytes32,address,uint256)");
const BURNED = keccakId("Burned(address,address,uint256,bytes32)");
const LOCKED = keccakId("Locked(address,address,uint256,uint256)");
const coder = AbiCoder.defaultAbiCoder();
const sel = (imza) => keccakId(imza).slice(0, 10);

const PENCERE = 2000n;
const TUR_TAVANI = 160;

let cagri = 0;
function rpc(url, yontem, parametreler) {
  cagri++;
  const u = new URL(url);
  const tasiyici = u.protocol === "http:" ? http : https;
  const govde = JSON.stringify({ jsonrpc: "2.0", id: cagri, method: yontem, params: parametreler });
  return new Promise((coz) => {
    const istek = tasiyici.request({
      hostname: u.hostname, port: u.port || undefined, path: u.pathname || "/", method: "POST",
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

/* A throttled window is retried, and if it still will not answer it is
   reported as unscanned. A window that was never read is not a window
   that came back empty, and the two must never print alike — the first
   version of the sibling script made exactly that mistake. */
async function loglar(url, adres, alt, ust) {
  for (let deneme = 0; deneme < 5; deneme++) {
    const c = await rpc(url, "eth_getLogs", [{
      address: adres,
      fromBlock: "0x" + alt.toString(16),
      toBlock: "0x" + ust.toString(16)
    }]);
    if (c.sonuc) return { loglar: c.sonuc };
    if (!/rate limit|too many|limit exceeded/i.test(c.hata || "")) return { hata: c.hata };
    await bekle(800 * (deneme + 1));
  }
  return { hata: "rate limit (5 denemeden sonra)" };
}

const ond = (x, basamak) => {
  const b = 10n ** BigInt(basamak);
  const tam = x / b, kalan = x % b;
  return tam + "." + kalan.toString().padStart(basamak, "0");
};

let gecen = 0, kalan = 0, uyari = 0;
const ok = (ad, kosul, not) => {
  if (kosul) { gecen++; console.log("  OK     " + ad + (not ? "   " + not : "")); }
  else { kalan++; console.log("  KALDI  " + ad + (not ? "   " + not : "")); }
};
const dikkat = (s) => { uyari++; console.log("  DIKKAT " + s); };

(async function () {
  console.log("");
  console.log("W" + SEMBOL + " KARSILIK DENETIMI");
  console.log("  wrapped (Arc)       " + H.wrapped);
  console.log("  vault (Robinhood)   " + H.vault);
  console.log("  stock (Robinhood)   " + H.stock);
  console.log("  kayitli relayer     " + AYAR.relayer);
  console.log("");

  const zA = await rpc(ARC_RPC, "eth_chainId", []);
  const sA = await rpc(ARC_RPC, "eth_blockNumber", []);
  if (zA.hata || sA.hata) { console.log("  Arc RPC yanit vermiyor: " + (zA.hata || sA.hata)); return; }
  const arcZincir = Number(BigInt(zA.sonuc));
  const arcSon = BigInt(sA.sonuc);
  console.log("  Arc        zincir " + arcZincir + "   son blok " + arcSon);

  const zR = await rpc(RHC_RPC, "eth_chainId", []);
  const rhcVar = !zR.hata;
  const rhcZincir = rhcVar ? Number(BigInt(zR.sonuc)) : null;
  console.log("  Robinhood  " + (rhcVar ? "zincir " + rhcZincir : "ULASILAMIYOR: " + zR.hata));
  console.log("");

  /* ---- 1. the Arc side: supply against bridge notices ---------- */
  console.log("ARC TARAFI — ARZ, KOPRU BILDIRIMLERIYLE ACIKLANIYOR MU");

  let alt = BigInt(H.wrappedStartBlock);
  const mintler = [], yakmalar = [];
  const taranmayan = [];
  let tarananBlok = 0n;
  for (let tur = 0; tur < TUR_TAVANI && alt <= arcSon; tur++) {
    const ust = (alt + PENCERE > arcSon) ? arcSon : alt + PENCERE;
    const c = await loglar(ARC_RPC, H.wrapped, alt, ust);
    if (c.hata) taranmayan.push(alt + "-" + ust);
    else {
      tarananBlok += (ust - alt + 1n);
      for (const l of c.loglar) {
        if (l.topics[0] === MINTED)
          mintler.push({ lockId: l.topics[1], alici: getAddress("0x" + l.topics[2].slice(26)),
                         hisse: BigInt(l.data), tx: l.transactionHash,
                         blok: parseInt(l.blockNumber, 16), blockHash: l.blockHash,
                         logIndex: parseInt(l.logIndex, 16) });
        else if (l.topics[0] === BURNED) {
          const k = l.data.slice(2);
          yakmalar.push({ yakan: getAddress("0x" + l.topics[1].slice(26)),
                          hisse: BigInt("0x" + k.slice(0, 64)),
                          burnId: "0x" + k.slice(64, 128),
                          tx: l.transactionHash, blok: parseInt(l.blockNumber, 16) });
        }
      }
    }
    alt = ust + 1n;
    await bekle(200);
  }

  console.log("  taranan " + tarananBlok + " blok, TARANAMAYAN " + taranmayan.length + " pencere");
  if (taranmayan.length)
    dikkat(taranmayan.length + " pencere okunamadi — asagidaki sayim EKSIK olabilir, " +
      "'hepsi bu' DEMIYORUM. (" + taranmayan.slice(0, 3).join(", ") +
      (taranmayan.length > 3 ? ", ..." : "") + ")");

  const toplamMint = mintler.reduce((a, m) => a + m.hisse, 0n);
  const toplamYakma = yakmalar.reduce((a, y) => a + y.hisse, 0n);
  console.log("  " + mintler.length + " mint, toplam " + ond(toplamMint, 18) + " hisse");
  console.log("  " + yakmalar.length + " yakma, toplam " + ond(toplamYakma, 18) + " hisse");

  const arzC = await rpc(ARC_RPC, "eth_call", [{ to: H.wrapped, data: sel("totalSupply()") }, "latest"]);
  if (arzC.hata) { dikkat("totalSupply okunamadi: " + arzC.hata); }
  else {
    const arz = BigInt(arzC.sonuc);
    console.log("  canli totalSupply   " + ond(arz, 18));
    const bekl = toplamMint - toplamYakma;
    /* This is bookkeeping, not backing. It says the supply equals what the
       notices add up to — and the live wNVDA books balance to the wei
       while carrying two opposite defects that cancel each other exactly:
       one mint that created shares with no lock behind them, and one burn
       that destroyed shares with nothing released back. An audit that
       stops at matching totals would have called that healthy, and the
       first version of this script did. So it is reported as arithmetic
       and nothing more; the backing question is answered per mint below. */
    if (bekl === arz)
      console.log("  defter tutuyor: mint eksi yakma = arz, 0 wei fark" +
        (taranmayan.length ? "  (eksik taramaya ragmen)" : "") +
        "   -- bu KARSILIK degil, sadece aritmetik; birbirini goturen iki" +
        " hata da boyle gorunur");
    else if (taranmayan.length)
      dikkat("mint eksi yakma " + ond(bekl, 18) + " ama arz " + ond(arz, 18) +
             " — pencereler eksik oldugu icin KUSUR SAYMIYORUM, acik birakiyorum");
    else
      ok("mint eksi yakma = arz", false, "fark " + (arz - bekl) + " wei");
  }

  /* ---- 2. the Robinhood side: is there a lock behind each mint? -- */
  console.log("");
  console.log("ROBINHOOD TARAFI — HER MINT'IN ARKASINDA KILIT VAR MI");

  if (!rhcVar) {
    dikkat("Robinhood RPC ulasilamiyor, karsilik DOGRULANAMADI. " +
      "Bu 'karsilik yok' demek degil; 'bakamadim' demek.");
  } else if (!mintler.length) {
    dikkat("Arc tarafinda mint bulamadim, karsilastiracak bir sey yok.");
  } else {
    let kanitli = 0n, kanitsiz = 0n;
    for (const m of mintler) {
      console.log("");
      console.log("  mint " + ond(m.hisse, 18) + " -> " + m.alici);
      console.log("    Arc tx   " + m.tx + "  blok " + m.blok);
      console.log("    lockId   " + m.lockId);

      /* The relayer derives the lock id from the source transaction hash,
         so the id goes straight back to the Robinhood chain as a hash. */
      const mk = await rpc(RHC_RPC, "eth_getTransactionReceipt", [m.lockId]);
      if (mk.hata || !mk.sonuc) {
        console.log("    -> Robinhood'da bu kimlikle islem YOK" +
          (mk.hata ? " (" + mk.hata + ")" : ""));
        dikkat("mint " + ond(m.hisse, 18) + " hisse icin kaynak islem bulunamadi");
        kanitsiz += m.hisse;
        continue;
      }
      const r = mk.sonuc;
      console.log("    kaynak   status " + r.status + "  blok " + parseInt(r.blockNumber, 16) +
        "  gonderen " + r.from);

      const kilitler = (r.logs || []).filter((l) =>
        l.topics[0] === LOCKED && l.address.toLowerCase() === H.vault.toLowerCase());
      if (r.status !== "0x1") {
        dikkat("kaynak islem BASARISIZ ama Arc'ta mint yapilmis");
        kanitsiz += m.hisse;
      } else if (!kilitler.length) {
        dikkat("kaynak islemde kasadan Locked olayi YOK — mint'in arkasinda kilit yok");
        kanitsiz += m.hisse;
      } else {
        /* Locked(from, arcRecipient, amount, shares): shares is the second
           data word, and it has to be the number that was minted. */
        let eslesen = null;
        let kilitToplam = 0n;
        for (const l of kilitler) {
          const k = l.data.slice(2);
          const hisse = BigInt("0x" + k.slice(64, 128));
          const aliciK = getAddress("0x" + l.topics[2].slice(26));
          kilitToplam += hisse;
          console.log("    kilit    " + ond(hisse, 18) + " hisse -> " + aliciK);
          if (hisse === m.hisse) eslesen = { hisse, aliciK, miktar: BigInt("0x" + k.slice(0, 64)) };
        }
        if (!eslesen) {
          /* Naming the gap matters more than flagging one. The live case is
             a relayer that minted the vault's CUMULATIVE locked balance
             instead of the new lock's shares, so the excess is exactly an
             earlier lock — invisible if the report only says "mismatch". */
          dikkat("MINT " + ond(m.hisse, 18) + " ama bu islemde kilitlenen " +
            ond(kilitToplam, 18) + "  ->  KARSILIKSIZ " + ond(m.hisse - kilitToplam, 18) +
            " hisse uretilmis");
          kanitsiz += m.hisse - kilitToplam;
          kanitli += kilitToplam;
        } else {
          console.log("    -> Locked  " + ond(eslesen.hisse, 18) + " hisse, alici " + eslesen.aliciK);
          ok("mint'in arkasinda ayni sayida kilit var", true, ond(m.hisse, 18));
          if (eslesen.aliciK !== m.alici)
            dikkat("kilitteki Arc alicisi " + eslesen.aliciK + " ama mint " + m.alici + " adresine gitti");
          if (kilitler.length > 1)
            dikkat("ayni islemde " + kilitler.length + " kilit var — kimlik ciplak tx hash'i " +
              "oldugu icin digerleri AYNI kimlige dusuyor ve bir daha mint edilemez");
          kanitli += eslesen.hisse;
        }
      }
    }

    console.log("");
    console.log("  kilitle kanitlanan   " + ond(kanitli, 18) + " hisse");
    console.log("  kanitlanamayan       " + ond(kanitsiz, 18) + " hisse");
    ok("her mint'in arkasinda bir kilit var", kanitsiz === 0n);
  }

  /* ---- 2b. and did every burn get anything released back? ------- */
  console.log("");
  console.log("YAKILAN HISSELERIN KARSILIGI KASADAN CIKTI MI");
  if (!rhcVar) {
    dikkat("Robinhood RPC ulasilamiyor, cikislar kontrol edilemedi.");
  } else if (!yakmalar.length) {
    console.log("  Arc tarafinda yakma yok, kontrol edecek bir sey de yok.");
  } else {
    /* A burn destroys shares on Arc on the promise that the vault lets the
       stock go. If nothing was ever released, whoever burned simply lost
       them — and the totals still balance, because the supply fell by the
       same amount. That is the half an aggregate check cannot see. */
    const RELEASED = keccakId("Released(bytes32,address,uint256,uint256)");
    const snR = await rpc(RHC_RPC, "eth_blockNumber", []);
    if (snR.hata) { dikkat("Robinhood blok numarasi alinamadi: " + snR.hata); }
    else {
      const sonR = BigInt(snR.sonuc);
      let altR = BigInt(H.vaultStartBlock);
      const cikislar = new Map();
      let eksikR = 0, tarananR = 0n;
      for (let t = 0; t < 500 && altR <= sonR; t++) {
        const ustR = (altR + PENCERE > sonR) ? sonR : altR + PENCERE;
        const c = await loglar(RHC_RPC, H.vault, altR, ustR);
        if (c.hata) eksikR++;
        else {
          tarananR += (ustR - altR + 1n);
          for (const l of c.loglar)
            if (l.topics[0] === RELEASED)
              cikislar.set(l.topics[1], { hisse: BigInt("0x" + l.data.slice(2, 66)),
                                          tx: l.transactionHash });
        }
        altR = ustR + 1n;
      }
      console.log("  kasada taranan " + tarananR + " blok, taranamayan " + eksikR + " pencere");
      console.log("  bulunan Released sayisi " + cikislar.size);
      let karsiliksizYakma = 0n;
      for (const y of yakmalar) {
        const c = cikislar.get(y.burnId);
        if (c) {
          ok("yakmanin karsiligi serbest birakilmis", c.hisse === y.hisse,
             ond(y.hisse, 18) + (c.hisse === y.hisse ? "" : " ama cikan " + ond(c.hisse, 18)));
        } else {
          karsiliksizYakma += y.hisse;
          dikkat("YAKILDI ama KARSILIGI CIKMADI: " + ond(y.hisse, 18) +
            " hisse, burnId " + y.burnId.slice(0, 18) + "   Arc tx " + y.tx +
            (eksikR ? "   (taranamayan pencere var, kesin konusmuyorum)" : ""));
        }
      }
      if (karsiliksizYakma > 0n && !eksikR)
        console.log("  TOPLAM KARSILIKSIZ YAKMA " + ond(karsiliksizYakma, 18) +
          " hisse — bu kadar hisse yok edildi ve yerine hicbir sey verilmedi");
      ok("her yakmanin karsiligi cikti", karsiliksizYakma === 0n);
    }
  }

  /* ---- 3. does the vault actually hold the stock? --------------- */
  console.log("");
  console.log("KASA GERCEKTEN HISSEYI TUTUYOR MU");
  if (!rhcVar) {
    dikkat("Robinhood RPC ulasilamiyor, kasa bakiyesi okunamadi.");
  } else {
    const bk = await rpc(RHC_RPC, "eth_call", [{ to: H.stock,
      data: sel("balanceOf(address)") + coder.encode(["address"], [H.vault]).slice(2) }, "latest"]);
    const dk = await rpc(RHC_RPC, "eth_call", [{ to: H.stock, data: sel("decimals()") }, "latest"]);
    if (bk.hata || dk.hata) dikkat("kasa bakiyesi okunamadi: " + (bk.hata || dk.hata));
    else {
      const bakiye = BigInt(bk.sonuc), basamak = Number(BigInt(dk.sonuc));
      console.log("  kasadaki " + SEMBOL + "   " + ond(bakiye, basamak) + "  (" + basamak + " basamak)");
      ok("kasa bos degil", bakiye > 0n);
    }
  }

  console.log("");
  console.log("  " + gecen + " gecti, " + kalan + " kaldi, " + uyari + " dikkat");
  console.log("  " + cagri + " salt-okunur RPC cagrisi, iki zincirde, hicbir sey gonderilmedi.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
