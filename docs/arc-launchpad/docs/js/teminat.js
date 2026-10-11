/* ===========================================================================
 * teminat.js — whether a contract address works as collateral
 *
 * WHAT IT DOES
 *   For the given contract address it finds the deepest USDC pool on every
 *   chain, looks at its liquidity and its observation history, and answers
 *   the question "does it work". It reads no list and asks no service — it
 *   reads the chain.
 *
 * WHY THE SAME DERIVATION AS THE CONTRACT
 *   `contracts/HavuzFiyat.sol` does the same job on chain: it scans the
 *   tiers, finds the most liquid pool, reads the price from that pool's
 *   history. The same thing is done here so that what the page shows and
 *   what the chain will accept cannot drift apart.
 *
 *   If they drift, here is what happens: the page says "it works", the
 *   user sends the launch, the contract refuses and the gas is gone. Or
 *   the other way round — the page says "it does not work" and the user
 *   cannot use a token that does.
 *
 * THREE CONDITIONS, NOT A QUALITY GATE ON THE ASSET
 *   1. Is there a pool
 *   2. Is the deepest pool's liquidity non-zero
 *      Measured: both of PEPE's pools on Base have zero liquidity, yet
 *      observe() still returns a price. A price nobody can trade at.
 *   3. Is there an observation history (cardinality >= 2)
 *      At cardinality 1 the TWAP is the spot price itself, and it can be
 *      moved in a single transaction.
 *
 *   The third is not permanent: on Uniswap ANYONE can extend the
 *   observation history, for a one-off bit of gas. So the answer is not
 *   "no" but "not yet, and here is how to open it".
 *
 * THE DEEPEST POOL, BECAUSE THE GAP IS 160x
 *   Measured — DEGEN's four tiers on Base are 0 / 26 billion / 4.3
 *   trillion / 445 billion. Reading the wrong tier means reading a price
 *   from a pool 160 times thinner, which is why the tier is not taken from
 *   the user.
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
 * WHY THESE ARE TWO SEPARATE QUESTIONS
 *   A pool's price being measurable does not mean that pool can be TRADED
 *   in. It was measured, and the result is surprising:
 *
 *     SHIB   price consistent to 0.00%   but a $2,000 trade moves it 17.5x
 *     DEGEN  price consistent to 0.00%   but a $2,000 trade moves it 16.1x
 *     WETH   price consistent to 0.01%   a $2,000 trade moves it 1.00x
 *
 *   The reason: SHIB's liquidity is not in the SHIB/USDC pool, it is in
 *   SHIB/WETH. The single-hop USDC pool tells the truth about the price
 *   but has no depth.
 *
 *   That matters, because the floor is derived from the MARGINAL price: a
 *   trade that pushes the pool cannot reach the floor and the conversion
 *   is REFUSED. It closes in the safe direction and no money is lost — but
 *   if the page only says "it works", the user thinks something that will
 *   not work has been called working.
 *
 *   So the page says two things separately: can its price be measured, and
 *   can it be converted at this size.
 *
 * THE QUOTER ADDRESSES WERE MEASURED, NOT ASSUMED
 *   An address that answers was found on six chains; on Unichain none was
 *   found, and depth is reported there as "could not be measured". A
 *   guessed address would have meant a silently wrong depth. */
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
      sebep = "the deepest pool has zero liquidity";
    } else if (enDerin.kardinalite < ASGARI_KARDINALITE) {
      calisiyor = false;
      sebep = "no observation history";
      /* Anybody can call increaseObservationCardinalityNext on the pool.
         So this is a "not yet", not a "no". */
      duzeltilebilir = true;
    }

    /* ---- the second question: does a real trade reach that price ----
       Only asked when the price IS measurable; otherwise there is no
       floor to fail to reach and the answer would be noise. */
    let ittirme = null, derinlikNotu = "not measurable";
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
            ? "converts at this size"
            : "the pool is not deep enough for this size";
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
          ? "priced on " + calisan.length + " chains, converts $" +
            (Number(OLCUM_TUTARI) / 1e6).toLocaleString("en") +
            " on " + derin.length
          : (calisan.some((c) => c.ittirme != null)
              ? "priced on " + calisan.length + " chains, but on none " +
                "of them is the pool deep enough for this size"
              /* Not a verdict about depth — the depth was never measured.
                 Saying "not deep enough" here would be inventing a
                 measurement that was not taken. */
              : "priced on " + calisan.length + " chains; trade depth " +
                "could not be measured on this chain"))
      : duzeltilebilir.length > 0
        ? "a pool exists but its observation history is not open"
        : "no USDC pool found on any chain"
  };
}

/** The recommended list, with its measurement timestamp. */
export { ONERILEN, ZINCIRLER, KADEMELER };
