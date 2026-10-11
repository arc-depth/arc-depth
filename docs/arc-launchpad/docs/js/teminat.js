/* ===========================================================================
 * teminat.js — bir kontrat adresinin teminat olarak çalışıp çalışmadığı
 *
 * NE YAPAR
 *   Verilen kontrat adresi için her zincirde en derin USDC havuzunu bulur,
 *   likiditesine ve gözlem geçmişine bakar ve "çalışıyor mu" sorusunu
 *   cevaplar. Hiçbir liste okumaz, hiçbir servise sormaz — zinciri okur.
 *
 * NEDEN SÖZLEŞMEYLE AYNI TÜRETME
 *   `contracts/HavuzFiyat.sol` aynı işi zincir üstünde yapıyor: kademeleri
 *   tarar, en likit havuzu bulur, fiyatı o havuzun geçmişinden okur. Burada
 *   da aynısı yapılıyor ki sayfanın gösterdiği ile zincirin kabul edeceği
 *   şey ayrışamasın.
 *
 *   Ayrışırsa olacak şey şu: sayfa "çalışıyor" der, kullanıcı launch'ı
 *   gönderir, sözleşme reddeder ve gaz gider. Ya da tersi — sayfa
 *   "çalışmıyor" der ve kullanıcı çalışan bir tokeni kullanamaz.
 *
 * ÜÇ ŞART, VARLIĞA KALİTE KAPISI DEĞİL
 *   1. Havuz var mı
 *   2. En derin havuzun likiditesi sıfır değil
 *      Ölçüldü: PEPE'nin Base'deki iki havuzunun da likiditesi sıfır ama
 *      observe() yine bir fiyat döndürüyor. Kimsenin işlem yapamayacağı
 *      bir fiyat.
 *   3. Gözlem geçmişi var (kardinalite >= 2)
 *      Kardinalite 1 ise TWAP anlık fiyatın kendisidir ve tek işlemde
 *      oynatılabilir.
 *
 *   Üçüncüsü kalıcı değil: Uniswap'te gözlem geçmişini HERKES açabilir,
 *   bir kerelik gaz. O yüzden cevap "hayır" değil "henüz değil, şöyle
 *   açılır" oluyor.
 *
 * EN DERİN HAVUZ, ÇÜNKÜ FARK 160 KAT
 *   Ölçüldü — DEGEN'in Base'deki dört kademesi 0 / 26 milyar / 4,3 trilyon
 *   / 445 milyar. Yanlış kademeyi okumak 160 kat ince bir havuzda fiyat
 *   okumak demek, o yüzden kademe kullanıcıdan alınmıyor.
 * =========================================================================== */

import { ZINCIRLER, KADEMELER, ONERILEN } from "./teminat-listesi.js";

const SIFIR_ADRES = "0x0000000000000000000000000000000000000000";

/* Minimum observation history for a TWAP to be an average rather than the
   spot price. The contract uses the same number. */
export const ASGARI_KARDINALITE = 2;

const pad = (a) => a.slice(2).toLowerCase().padStart(64, "0");
const kademeHex = (k) => k.toString(16).padStart(64, "0");

/* Selectors, written out rather than built from an ABI: three calls do not
   justify pulling a decoder into the page, and a four-byte constant is
   easier to check against Etherscan than a generated one.
     getPool(address,address,uint24)  0x1698ee82
     liquidity()                      0x1a686502
     slot0()                          0x3850c7bd
     decimals()                       0x313ce567
     symbol()                         0x95d89b41 */
const SEC = {
  getPool: "0x1698ee82",
  liquidity: "0x1a686502",
  slot0: "0x3850c7bd",
  token0: "0x0dfe1681",
  decimals: "0x313ce567",
  symbol: "0x95d89b41"
};

/* ---- DEPTH, WHICH IS A DIFFERENT QUESTION FROM PRICE ----------------
 *
 * NEDEN IKI AYRI SORU
 *   Havuzun fiyati olculebilir olmasi, o havuzda ISLEM yapilabilecegi
 *   anlamina gelmiyor. Olculdu, ve sonuc sasirtici:
 *
 *     SHIB   fiyat %0.00 tutarli    ama $2.000'lik islem 17.5 kat ittiriyor
 *     DEGEN  fiyat %0.00 tutarli    ama $2.000'lik islem 16.1 kat ittiriyor
 *     WETH   fiyat %0.01 tutarli    $2.000 islem 1.00 kat
 *
 *   Sebep: SHIB'in likiditesi SHIB/USDC havuzunda degil, SHIB/WETH'te.
 *   Tek adimlik USDC havuzu fiyati dogru soyluyor ama derinligi yok.
 *
 *   Bu onemli, cunku taban MARJINAL fiyattan turetiliyor: havuzu ittiren
 *   bir islem tabana ulasamaz ve donusum REDDEDILIR. Guvenli yonde
 *   kapaniyor, para kaybolmuyor — ama sayfa yalnizca "calisiyor" derse
 *   kullanici calismayacak bir seye "calisiyor" dendigini sanir.
 *
 *   O yuzden sayfa iki seyi ayri soyluyor: fiyati olculebiliyor mu, ve
 *   su buyuklukte donusturulebiliyor mu.
 *
 * QUOTER ADRESLERI OLCULDU, VARSAYILMADI
 *   Alti zincirde cevap veren adres bulundu; Unichain'de bulunamadi ve
 *   orada derinlik "olculemedi" olarak gecer. Tahmin edilmis bir adres,
 *   sessizce yanlis bir derinlik demek olurdu.
 */
const QUOTER = {
  ethereum: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  base: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
  arbitrum: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  optimism: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  polygon: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  avalanche: "0xbe0F5544EC67e9B3b2D979aaA43f18Fd87E6257F"
  /* unichain: deliberately absent — see above */
};

/* quoteExactInputSingle((address,address,uint256,uint24,uint160)) */
const QUOTE_SEC = "0xc6a5026a";

/** The conversion size the depth question is asked about. */
export const OLCUM_TUTARI = 2_000_000_000n;      // $2,000 at 6 decimals

/** The floor's tolerance. Past this, the conversion cannot reach it. */
export const AZAMI_KAYMA_BPS = 300;

const say = (h) => (h && h !== "0x" ? BigInt("0x" + h.slice(2, 66)) : 0n);

export function adresMi(s) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(s || "").trim());
}

/* One batched JSON-RPC round trip. A chain scan is four getPool calls plus
   two reads per pool found; sending those one at a time is a dozen round
   trips per chain and the page would feel broken. */
async function toplu(rpc, cagrilar) {
  if (!cagrilar.length) return [];
  const govde = cagrilar.map((c, i) => ({
    jsonrpc: "2.0", id: i + 1, method: "eth_call",
    params: [{ to: c.to, data: c.data }, "latest"]
  }));
  const r = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(govde),
    signal: AbortSignal.timeout(20_000)
  });
  if (!r.ok) throw new Error("RPC " + r.status);
  const j = await r.json();
  const liste = Array.isArray(j) ? j : [j];
  const esle = new Map(liste.map((x) => [x.id, x]));
  return govde.map((g) => {
    const c = esle.get(g.id);
    return c && !c.error ? c.result : null;
  });
}

function metinCoz(ham) {
  if (!ham || ham === "0x") return null;
  try {
    const off = Number(BigInt("0x" + ham.slice(2, 66)));
    const len = Number(BigInt("0x" + ham.slice(2 + off * 2, 2 + off * 2 + 64)));
    const bayt = ham.slice(2 + off * 2 + 64, 2 + off * 2 + 64 + len * 2);
    let s = "";
    for (let i = 0; i < bayt.length; i += 2) s += String.fromCharCode(parseInt(bayt.substr(i, 2), 16));
    return s;
  } catch (e) {
    return null;
  }
}

/**
 * Scan one chain for the deepest USDC pool of `token`.
 *
 * Returns a verdict rather than throwing, because "this asset does not work
 * here" is the normal answer for most assets on most chains and an
 * exception would make the caller treat it as a fault.
 */
export async function zinciriTara(zincirAnahtar, token) {
  const Z = ZINCIRLER[zincirAnahtar];
  if (!Z) return { zincir: zincirAnahtar, hata: "bilinmeyen zincir" };

  try {
    /* 1 — the four canonical tiers. Exhaustive: a pool cannot exist
       outside them. */
    const havuzHam = await toplu(Z.rpc, KADEMELER.map((k) => ({
      to: Z.v3Fabrika,
      data: SEC.getPool + pad(token) + pad(Z.usdc) + kademeHex(k)
    })));

    const havuzlar = [];
    havuzHam.forEach((h, i) => {
      if (!h || h === "0x") return;
      const adres = "0x" + h.slice(26);
      if (adres.toLowerCase() === SIFIR_ADRES) return;
      havuzlar.push({ kademe: KADEMELER[i], havuz: adres });
    });

    if (!havuzlar.length) {
      return { zincir: zincirAnahtar, ad: Z.ad, calisiyor: false, sebep: "havuz yok", duzeltilebilir: false };
    }

    /* 2 — liquidity and observation history for each */
    const okuma = await toplu(Z.rpc, havuzlar.flatMap((h) => ([
      { to: h.havuz, data: SEC.liquidity },
      { to: h.havuz, data: SEC.slot0 },
      { to: h.havuz, data: SEC.token0 }
    ])));

    havuzlar.forEach((h, i) => {
      const L = okuma[i * 3];
      const s0 = okuma[i * 3 + 1];
      const t0 = okuma[i * 3 + 2];
      h.varlikSifirinci = !!t0 && t0 !== "0x" &&
        ("0x" + t0.slice(26)).toLowerCase() === token.toLowerCase();
      /* slot0's first word is sqrtPriceX96 — the marginal price, which is
         what the floor is derived from. Kept so the push a real trade
         causes can be compared against it. */
      h.sqrtX96 = s0 && s0 !== "0x" ? BigInt("0x" + s0.slice(2, 66)) : 0n;
      h.likidite = L && L !== "0x" ? BigInt(L) : 0n;
      /* slot0's fourth word is observationCardinality. Read by offset
         rather than decoded: the layout is fixed by Uniswap and a decoder
         for one field is more code than the offset. */
      h.kardinalite = 0;
      if (s0 && s0 !== "0x" && s0.length >= 2 + 64 * 4) {
        try { h.kardinalite = Number(BigInt("0x" + s0.slice(2 + 64 * 3, 2 + 64 * 4))); } catch (e) { /* 0 */ }
      }
    });

    /* 3 — the deepest, and whether a price can be measured from it */
    const enDerin = havuzlar.reduce((a, b) => (b.likidite > a.likidite ? b : a));

    let calisiyor = true, sebep = "", duzeltilebilir = false;
    if (enDerin.likidite === 0n) {
      calisiyor = false;
      sebep = "en derin havuzun likiditesi sıfır";
    } else if (enDerin.kardinalite < ASGARI_KARDINALITE) {
      calisiyor = false;
      sebep = "gözlem geçmişi yok";
      /* Anybody can call increaseObservationCardinalityNext on the pool.
         So this is a "not yet", not a "no". */
      duzeltilebilir = true;
    }

    /* ---- the second question: does a real trade reach that price ----
       Only asked when the price IS measurable; otherwise there is no
       floor to fail to reach and the answer would be noise. */
    let ittirme = null, derinlikNotu = "ölçülemedi";
    if (calisiyor) {
      const d = await derinlikOlc(zincirAnahtar, token, enDerin.kademe);
      if (d && enDerin.sqrtX96 > 0n) {
        /* The marginal amount, from the pool's own price. Float maths is
           fine here: this is a ratio shown to a person, not a bound a
           contract enforces — the contract derives its own in Solidity. */
        const oran = (Number(enDerin.sqrtX96) / 2 ** 96) ** 2;
        const hamFiyat = enDerin.varlikSifirinci ? oran : 1 / oran;
        const marjinal = Number(OLCUM_TUTARI) / hamFiyat;
        if (marjinal > 0) {
          ittirme = marjinal / Number(d.gercekler);
          const tavan = 1 / (1 - Number(AZAMI_KAYMA_BPS) / 10_000);
          derinlikNotu = ittirme <= tavan
            ? "bu büyüklükte dönüştürülebiliyor"
            : "havuz bu büyüklük için yeterince derin değil";
        }
      }
    }

    return {
      zincir: zincirAnahtar, ad: Z.ad, domain: Z.domain,
      calisiyor, sebep, duzeltilebilir,
      /* Separate from `calisiyor` on purpose. A price that is measurable
         but a pool that is too thin is a real case — measured on SHIB and
         DEGEN — and collapsing the two would make the page say "works"
         about a conversion that would be refused. */
      ittirme, derinlikNotu,
      yeterliDerinlik: ittirme == null
        ? null
        : ittirme <= 1 / (1 - Number(AZAMI_KAYMA_BPS) / 10_000),
      enDerin, havuzlar, havuzSayisi: havuzlar.length
    };
  } catch (e) {
    return { zincir: zincirAnahtar, ad: Z.ad, hata: (e && e.message) || String(e) };
  }
}

/**
 * How far `OLCUM_TUTARI` pushes the price in that pool.
 *
 * Returns `null` when it cannot be measured, which is not the same as
 * "deep enough" and is not reported as such.
 */
export async function derinlikOlc(zincirAnahtar, token, kademe) {
  const Z = ZINCIRLER[zincirAnahtar];
  const q = QUOTER[zincirAnahtar];
  if (!Z || !q) return null;

  try {
    /* No offset word: every member of the struct is static, so the tuple
       is encoded inline. Prepending 0x20 shifted all five arguments by one
       word and the call reverted — measured, both ways. */
    const veri = QUOTE_SEC +
      pad(Z.usdc) + pad(token) +
      OLCUM_TUTARI.toString(16).padStart(64, "0") +
      kademe.toString(16).padStart(64, "0") +
      "".padStart(64, "0");
    const [ham] = await toplu(Z.rpc, [{ to: q, data: veri }]);
    const gercekler = say(ham);
    if (gercekler === 0n) return null;
    return { gercekler };
  } catch (e) {
    return null;
  }
}

/**
 * The token's own symbol and decimals, from the first chain that answers.
 *
 * Needed because a pasted address is just twenty bytes: showing it back as
 * a symbol is the only way the person can tell they pasted what they meant.
 */
export async function jetonKimligi(token, zincirAnahtarlari) {
  for (const k of zincirAnahtarlari) {
    const Z = ZINCIRLER[k];
    if (!Z) continue;
    try {
      const [simgeHam, ondalikHam] = await toplu(Z.rpc, [
        { to: token, data: SEC.symbol },
        { to: token, data: SEC.decimals }
      ]);
      const simge = metinCoz(simgeHam);
      const ondalik = ondalikHam && ondalikHam !== "0x" ? Number(BigInt(ondalikHam)) : null;
      if (simge || ondalik != null) return { simge, ondalik, zincir: k };
    } catch (e) { /* next chain */ }
  }
  return { simge: null, ondalik: null, zincir: null };
}

/**
 * Scan every chain at once.
 *
 * All chains in parallel because they are independent endpoints; serially
 * this is seven round trips and the form would stall long enough that
 * somebody would think it had failed.
 */
export async function tumZincirleriTara(token) {
  const anahtarlar = Object.keys(ZINCIRLER);
  const [kimlik, sonuclar] = await Promise.all([
    jetonKimligi(token, anahtarlar),
    Promise.all(anahtarlar.map((k) => zinciriTara(k, token)))
  ]);

  const calisan = sonuclar.filter((s) => s.calisiyor);
  const derin = calisan.filter((s) => s.yeterliDerinlik === true);
  const duzeltilebilir = sonuclar.filter((s) => !s.calisiyor && s.duzeltilebilir);

  return {
    token,
    kimlik,
    sonuclar,
    calisan,
    duzeltilebilir,
    /* The verdict the form acts on. "Works" means at least one chain can
       measure a price, because collateral lives on ONE remote chain. */
    calisiyor: calisan.length > 0,
    /* At least one chain where the conversion could actually execute. */
    derin,
    donusturulebilir: derin.length > 0,
    /* Not a verdict — the reason, so the form can say something true when
       the answer is no. */
    ozet: calisan.length > 0
      ? (derin.length > 0
          ? calisan.length + " zincirde fiyatı ölçülebiliyor, " +
            derin.length + " zincirde $" +
            (Number(OLCUM_TUTARI) / 1e6).toLocaleString("tr") +
            " dönüştürülebiliyor"
          : (calisan.some((c) => c.ittirme != null)
              ? calisan.length + " zincirde fiyatı ölçülebiliyor ama hiçbirinde " +
                "havuz bu büyüklük için yeterince derin değil"
              /* Not a verdict about depth — the depth was never measured.
                 Saying "not deep enough" here would be inventing a
                 measurement that was not taken. */
              : calisan.length + " zincirde fiyatı ölçülebiliyor; " +
                "işlem derinliği bu zincirde ölçülemedi"))
      : duzeltilebilir.length > 0
        ? "havuz var ama gözlem geçmişi açılmamış"
        : "hiçbir zincirde USDC havuzu bulunamadı"
  };
}

/** The recommended list, with its measurement timestamp. */
export { ONERILEN, ZINCIRLER, KADEMELER };
