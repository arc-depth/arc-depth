/* ===========================================================================
 * teminat-izle.js — what a one-pool launch's collateral is worth now
 *
 * Everything here is read from chain, except the market price of a basket
 * asset, which comes from DexScreener; when DexScreener has no price the
 * vault's own last auction fill is used instead (and the line says so).
 *
 *   started   Σ the founder's dollars per line (SepetDefteri.sepet)
 *   now       Σ per line: units the vault holds for this launch × price
 *             + dollars the vault holds for this launch (auctions not yet
 *               filled, counted once per chain)
 *             + tax dollars waiting in the Defter for the next re-buy
 *   change    now / started − 1
 *
 * Also: the chain the founder launched from (the chain the founder's tokens
 * were sent to, from the OFTSent in the launch transaction) and the chains
 * the token trades on (Arc plus every chain its Arc adapter has a peer on).
 *
 * Used by the Discover page and by scripts/denetim-teminat-izle.mjs, which
 * runs it in Node against the mainnet rehearsal basket.
 * =========================================================================== */

import { JsonRpcProvider, Contract, Interface, zeroPadValue, id as olayKimligi } from "../vendor/ethers.min.js";

/* the live one-pool deployment (dagitim-sepet.json) */
export const SEPET = {
  kapi: "0xA3D9B4259fbd6Ca17b79f3b7A7dB55B34dA04080",
  defter: "0x6a5e78680f484C2D720a3C3D6D4c3d68295F33DD",
  lp5: "0x52e600c8259ca44D9837B7b9E6BA1faee4bC040d",
  yayici: "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9",
  kasa: {
    26: "0xDcB74021A922572CbbEda8cf010ACC27dE892C08",
    6: "0x6582EaaA0AedDb3020e9898344aF6ef99b8D593F",
    3: "0xCe5b0513C3D5fB830227C06a3BE80Cca1C6FE233",
    1: "0x3F42ce7a7ecd7dCD89F01349cA41375213DBE44F",
    15: "0x3F42ce7a7ecd7dCD89F01349cA41375213DBE44F",
    19: "0xb45Da3bF630df87007947e62FaA7288613aE3cAC",
    17: "0x175249f817221963AD685CEf183AD8f547501f4A",
  },
  sui: { paket: "0x4a22de4e2b7621b1f6c09a0c5e5c04b1f4d205eb53c7131c154cff055c68dc1b", kasa: "0x32d0bbaba2511793ae4f451e0fd92da6808b31ac68a6dbc6d3168db138b08cd3" },
  aptos: { paket: "0x0a848e04efa359646980ab1d3f435302f99da3eb72b0afae75204a3a07b65593", kasa: "0x577689cb7e74c3a38b762bf1d5af27ffcea8638b0c1e10669c3afa6096a2cfda" },
};

/* CCTP domain → chain; usdcDec is the vault's dollar on that chain */
export const ZINCIRLER = {
  26: { ad: "Arc", rpc: "https://arc-rpc.publicnode.com", id: 5042, ds: null, usdcDec: 6 },
  6: { ad: "Base", rpc: "https://mainnet.base.org", id: 8453, ds: "base", usdcDec: 6 },
  3: { ad: "Arbitrum", rpc: "https://arb1.arbitrum.io/rpc", id: 42161, ds: "arbitrum", usdcDec: 6 },
  1: { ad: "Avalanche", rpc: "https://avalanche-c-chain-rpc.publicnode.com", id: 43114, ds: "avalanche", usdcDec: 6 },
  15: { ad: "Monad", rpc: "https://rpc.monad.xyz", id: 143, ds: "monad", usdcDec: 6 },
  19: { ad: "HyperEVM", rpc: "https://rpc.hyperliquid.xyz/evm", id: 999, ds: "hyperevm", usdcDec: 6 },
  17: { ad: "BNB", rpc: "https://bsc-dataseed.bnbchain.org", id: 56, ds: "bsc", usdcDec: 18 },
  0: { ad: "Ethereum" },
  5: { ad: "Solana" },
  8: { ad: "Sui", rpc: "https://fullnode.mainnet.sui.io", ds: "sui", usdcDec: 6 },
  9: { ad: "Aptos", rpc: "https://api.mainnet.aptoslabs.com/v1", ds: "aptos", usdcDec: 6 },
};

/* LayerZero eid → chain name: where a twin can live */
export const EID = {
  30184: "Base", 30110: "Arbitrum", 30101: "Ethereum", 30102: "BNB", 30106: "Avalanche",
  30390: "Monad", 30367: "HyperEVM", 30416: "Robinhood", 30168: "Solana", 30378: "Sui", 30108: "Aptos",
};

const DEFTER_ABI = [
  "function idOf(uint32,bytes32) view returns (uint64)",
  "function sepet(uint64) view returns ((uint32 zincir, bytes32 varlik, uint256 dolar)[])",
  "function launchlar(uint64) view returns (uint32 zincir, bytes32 token, uint256 arz, uint256 agirlikToplam, uint256 vergi, bool var_)",
];
const KASA_ABI = [
  "function bakiye(uint64,address) view returns (uint256)",
  "function usdcBakiye(uint64) view returns (uint256)",
  "function sonFiyat(address) view returns (uint128 usdc, uint128 varlik)",
];
const ERC20_ABI = ["function decimals() view returns (uint8)", "function name() view returns (string)", "function symbol() view returns (string)"];
const OFT_SENT = olayKimligi("OFTSent(bytes32,uint32,address,uint256,uint256)");
const MERKEZ_LAUNCH = olayKimligi("MerkezLaunch(address,address,bytes32,uint32,uint256)");

const saglayicilar = {};
export const saglayici = (d) => (saglayicilar[d] ||= new JsonRpcProvider(ZINCIRLER[d].rpc, ZINCIRLER[d].id, { staticNetwork: true }));
const ham = (x, dec) => Number(x) / 10 ** dec;

/* ---- market price: DexScreener, the deepest pair quoting this asset ---- */
const fiyatOnbellek = new Map();
async function piyasaFiyati(ds, adres) {
  if (!ds) return null;
  const k = ds + ":" + adres.toLowerCase();
  if (fiyatOnbellek.has(k)) return fiyatOnbellek.get(k);
  const p = fetch("https://api.dexscreener.com/tokens/v1/" + ds + "/" + adres).then((r) => r.json()).then((ciftler) => {
    const uygun = (Array.isArray(ciftler) ? ciftler : []).filter((c) => c.baseToken && c.baseToken.address.toLowerCase() === adres.toLowerCase() && Number(c.priceUsd) > 0);
    uygun.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
    return uygun.length ? Number(uygun[0].priceUsd) : null;
  }).catch(() => null);
  fiyatOnbellek.set(k, p);
  return p;
}

/* ---- one EVM chain's lines ---- */
async function evmSatirlari(cfg, d, id, satirlar) {
  const z = ZINCIRLER[d], kasa = new Contract(cfg.kasa[d], KASA_ABI, saglayici(d));
  const dolar = await kasa.usdcBakiye(id);
  const kalemler = await Promise.all(satirlar.map(async (s) => {
    const varlik = "0x" + s.varlik.slice(26);
    const [miktar, son, dec] = await Promise.all([kasa.bakiye(id, varlik), kasa.sonFiyat(varlik),
      new Contract(varlik, ERC20_ABI, saglayici(d)).decimals().catch(() => 18)]);
    const piyasa = await piyasaFiyati(z.ds, varlik);
    let deger = null, kaynak = null;
    if (piyasa != null) { deger = ham(miktar, Number(dec)) * piyasa; kaynak = "market"; }
    else if (son.varlik > 0n) { deger = ham((miktar * son.usdc) / son.varlik, z.usdcDec); kaynak = "last auction"; }
    else if (miktar === 0n) { deger = 0; kaynak = "empty"; }
    return { ...s, adres: varlik, miktar, ondalik: Number(dec), deger, kaynak };
  }));
  return { bekleyen: ham(dolar, z.usdcDec), kalemler };
}

/* ---- Sui: the vault's dynamic fields name the coin type ---- */
async function suiCagri(method, params) {
  const r = await fetch(ZINCIRLER[8].rpc, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message);
  return r.result;
}
async function suiSatirlari(cfg, id, satirlar) {
  const alanlar = [];
  let imlec = null;
  do {
    const r = await suiCagri("suix_getDynamicFields", [cfg.sui.kasa, imlec, 50]);
    alanlar.push(...r.data);
    imlec = r.hasNextPage ? r.nextCursor : null;
  } while (imlec);
  const benim = (tur) => alanlar.filter((a) => a.name.type.endsWith("::kasa::" + tur) && String(a.name.value.launch) === String(id));
  const deger = async (a) => {
    const o = await suiCagri("sui_getObject", [a.objectId, { showContent: true }]);
    const v = o.data.content.fields.value;
    return BigInt(typeof v === "object" ? v.fields.value : v);
  };
  const dolarAlan = benim("DolarKey")[0];
  const dolar = dolarAlan ? await deger(dolarAlan) : 0n;
  const varliklar = await Promise.all(benim("VarlikKey").map(async (a) => ({ tip: "0x" + String(a.name.value.varlik.name).replace(/^0x/, ""), miktar: await deger(a) })));
  /* a line's asset id is keccak256 of the type string without 0x (kasa::tip_kimligi) */
  const { keccak256, toUtf8Bytes } = await import("../vendor/ethers.min.js");
  const kalemler = await Promise.all(satirlar.map(async (s) => {
    const v = varliklar.find((x) => keccak256(toUtf8Bytes(x.tip.slice(2))) === s.varlik);
    if (!v) return { ...s, adres: null, miktar: 0n, deger: 0, kaynak: "empty" };
    const meta = await suiCagri("suix_getCoinMetadata", [v.tip]).catch(() => null);
    const dec = meta ? meta.decimals : 9;
    const piyasa = await piyasaFiyati("sui", v.tip);
    return { ...s, adres: v.tip, miktar: v.miktar, ondalik: dec, deger: piyasa != null ? ham(v.miktar, dec) * piyasa : null, kaynak: piyasa != null ? "market" : null };
  }));
  return { bekleyen: ham(dolar, 6), kalemler };
}

/* ---- Aptos: view functions take the asset's metadata address ---- */
async function aptosGorunum(fn, args) {
  const r = await fetch(ZINCIRLER[9].rpc + "/view", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ function: fn, type_arguments: [], arguments: args }) }).then((x) => x.json());
  if (!Array.isArray(r)) throw new Error(r.message || "aptos view failed");
  return r;
}
async function aptosSatirlari(cfg, id, satirlar) {
  const m = cfg.aptos.paket + "::kasa::";
  const [dolar] = await aptosGorunum(m + "dolar_bakiye", [cfg.aptos.kasa, String(id)]);
  const kalemler = await Promise.all(satirlar.map(async (s) => {
    const [miktar] = await aptosGorunum(m + "bakiye", [cfg.aptos.kasa, String(id), s.varlik]);
    const [dec] = await aptosGorunum("0x1::fungible_asset::decimals", [s.varlik]).catch(() => [8]);
    const piyasa = await piyasaFiyati("aptos", s.varlik);
    return { ...s, adres: s.varlik, miktar: BigInt(miktar), ondalik: Number(dec), deger: piyasa != null ? ham(BigInt(miktar), Number(dec)) * piyasa : (BigInt(miktar) === 0n ? 0 : null), kaynak: piyasa != null ? "market" : null };
  }));
  return { bekleyen: ham(BigInt(dolar), 6), kalemler };
}

/**
 * The collateral of one launch, by its token on Arc.
 * Returns null if the Defter has no launch for this token.
 */
export async function teminatDurumu(token, cfg = SEPET) {
  const arc = saglayici(26);
  const defter = new Contract(cfg.defter, DEFTER_ABI, arc);
  const id = await defter.idOf(26, zeroPadValue(token, 32));
  if (id === 0n) return null;
  const [sepet, l] = await Promise.all([defter.sepet(id), defter.launchlar(id)]);
  const satirlar = sepet.map((k) => ({ zincir: Number(k.zincir), varlik: k.varlik, ilk: ham(k.dolar, 6) }));
  const gruplar = {};
  for (const s of satirlar) (gruplar[s.zincir] ||= []).push(s);
  const sonuc = await Promise.all(Object.entries(gruplar).map(([d, ss]) => {
    d = Number(d);
    const okur = d === 8 ? suiSatirlari(cfg, id, ss) : d === 9 ? aptosSatirlari(cfg, id, ss) : cfg.kasa[d] ? evmSatirlari(cfg, d, id, ss) : null;
    return okur ? okur.then((x) => ({ d, ...x })).catch((e) => ({ d, hata: e.message, kalemler: ss.map((s) => ({ ...s, deger: null })) }))
      : Promise.resolve({ d, hata: "no vault on " + ZINCIRLER[d].ad, kalemler: ss.map((s) => ({ ...s, deger: null })) });
  }));
  const kalemler = sonuc.flatMap((x) => x.kalemler.map((k) => ({ ...k, zincirAd: ZINCIRLER[x.d].ad })));
  const bekleyen = sonuc.reduce((a, x) => a + (x.bekleyen || 0), 0) + ham(l.vergi, 6);
  const eksik = kalemler.filter((k) => k.deger == null).length;
  const ilk = satirlar.reduce((a, s) => a + s.ilk, 0);
  const simdi = kalemler.reduce((a, k) => a + (k.deger || 0), 0) + bekleyen;
  return { id: Number(id), ilk, simdi, bekleyen, degisim: ilk > 0 ? simdi / ilk - 1 : 0, kalemler, eksik, hatalar: sonuc.filter((x) => x.hata).map((x) => x.hata) };
}

/** Arc plus every chain the token's Arc adapter has a peer on. */
export async function islemZincirleri(token, cfg = SEPET) {
  const arc = saglayici(26);
  const adapter = await new Contract(cfg.yayici, ["function adapterAdresi(address) view returns (address)"], arc).adapterAdresi(token);
  if ((await arc.getCode(adapter)) === "0x") return { adapter: null, zincirler: ["Arc"] };
  const oapp = new Contract(adapter, ["function peers(uint32) view returns (bytes32)"], arc);
  const eidler = Object.keys(EID).map(Number);
  const p = await Promise.all(eidler.map((e) => oapp.peers(e).catch(() => "0x" + "0".repeat(64))));
  return { adapter, zincirler: ["Arc", ...eidler.filter((e, i) => BigInt(p[i]) !== 0n).map((e) => EID[e])] };
}

/**
 * The chain the founder launched from: where the launch sent the founder's
 * tokens (the OFTSent from the token's adapter in the launch block). Arc
 * when nothing was sent out. `zaman` is the registry's launch time.
 */
export async function cikisZinciri(token, adapter, zaman, cfg = SEPET) {
  if (!adapter) return "Arc";
  const arc = saglayici(26);
  /* find the block at `zaman`: two reads give the block time, then step */
  const son = await arc.getBlock("latest");
  const once = await arc.getBlock(son.number - 10000);
  const sure = (son.timestamp - once.timestamp) / 10000;
  let b = Math.max(0, Math.round(son.number - (son.timestamp - zaman) / sure));
  for (let i = 0; i < 4; i++) {
    const x = await arc.getBlock(b);
    if (!x || x.timestamp === zaman) break;
    b = Math.max(0, Math.round(b - (x.timestamp - zaman) / sure));
  }
  const aralik = { fromBlock: Math.max(0, b - 50), toBlock: b + 50 };
  /* the launch transaction is the gate's MerkezLaunch for this token; its OFTSent is the founder's tokens leaving */
  const [launch] = await arc.getLogs({ address: cfg.kapi, topics: [MERKEZ_LAUNCH, zeroPadValue(token, 32)], ...aralik });
  if (!launch) return null;      // launched straight on the launchpad, or outside the window: unknown, not guessed
  const loglar = (await arc.getLogs({ address: adapter, topics: [OFT_SENT], ...aralik })).filter((x) => x.transactionHash === launch.transactionHash);
  if (!loglar.length) return "Arc";
  const eid = Number(new Interface(["event OFTSent(bytes32 indexed guid, uint32 dstEid, address indexed fromAddress, uint256 amountSentLD, uint256 amountReceivedLD)"]).parseLog(loglar[0]).args.dstEid);
  return EID[eid] || "eid " + eid;
}
