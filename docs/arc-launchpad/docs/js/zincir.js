/* ===========================================================================
 * zincir.js — reading Arc, and only reading what is really there
 *
 * Every number this interface shows comes through here. There is no mock
 * mode, no sample data and no fallback value: a call that cannot be made
 * returns null and the view says so. That is the brief's hardest rule and
 * the easiest one to break by accident, so the only way to produce a number
 * is to have read it.
 *
 * ONE RPC, BATCHED
 *   Arc's public endpoint rate-limits, and a dashboard that fires forty
 *   calls on open gets throttled into looking broken. Reads go through
 *   `cokluCagri`, which packs them into one JSON-RPC batch, and results are
 *   briefly cached so switching tabs does not re-ask for the same block.
 * =========================================================================== */

import { ZINCIR, DIS, PULSE, canli } from "./adresler.js";

/* ethers is vendored locally; see docs/vendor/. */
import { Interface, AbiCoder } from "../vendor/ethers.min.js";

const kodlayici = AbiCoder.defaultAbiCoder();

/* ---- transport ------------------------------------------------------ */

let sayac = 1;
const onbellek = new Map();
const ONBELLEK_MS = 4000;

async function hamIstek(govde) {
  const r = await fetch(ZINCIR.rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(govde)
  });
  if (!r.ok) throw new Error("RPC " + r.status);
  return r.json();
}

/** One call. */
export async function cagri(method, params) {
  const anahtar = method + ":" + JSON.stringify(params);
  const simdi = Date.now();
  const v = onbellek.get(anahtar);
  if (v && simdi - v.t < ONBELLEK_MS) return v.d;

  const j = await hamIstek({ jsonrpc: "2.0", id: sayac++, method, params });
  if (j.error) {
    const e = new Error(j.error.message || "RPC error");
    e.data = j.error.data;
    throw e;
  }
  onbellek.set(anahtar, { t: simdi, d: j.result });
  return j.result;
}

/**
 * Many calls, one request. Returns an array in the same order, with `null`
 * where a call failed — a failed read must not take the whole screen down
 * with it.
 */
export async function cokluCagri(istekler) {
  if (!istekler.length) return [];
  const govde = istekler.map((i) => ({
    jsonrpc: "2.0", id: sayac++, method: i.method, params: i.params
  }));
  const j = await hamIstek(govde);
  const liste = Array.isArray(j) ? j : [j];
  const esle = new Map(liste.map((x) => [x.id, x]));
  return govde.map((g) => {
    const c = esle.get(g.id);
    return c && !c.error ? c.result : null;
  });
}

/* ---- contract reads -------------------------------------------------- */

export function cagriVerisi(abiParcasi, ad, args = []) {
  return new Interface(abiParcasi).encodeFunctionData(ad, args);
}

export function sonucCoz(abiParcasi, ad, veri) {
  if (veri == null || veri === "0x") return null;
  try {
    return new Interface(abiParcasi).decodeFunctionResult(ad, veri);
  } catch (e) {
    return null;
  }
}

/** eth_call against a contract, decoded. Returns null rather than throwing:
 *  a missing contract is the normal case before deployment. */
export async function oku(adres, abiParcasi, ad, args = []) {
  if (!canli(adres)) return null;
  try {
    const veri = await cagri("eth_call", [
      { to: adres, data: cagriVerisi(abiParcasi, ad, args) }, "latest"
    ]);
    const c = sonucCoz(abiParcasi, ad, veri);
    return c && c.length === 1 ? c[0] : c;
  } catch (e) {
    return null;
  }
}

/* ---- the fragments this interface actually uses ---------------------- */

export const ABI = {
  erc20: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address) view returns (uint256)"
  ],
  /* ---- WRITE SIDE, KEPT APART FROM THE READ SIDE ----------------
     Separated on purpose. Everything above is a view call and cannot
     move money; these two build transactions. Mixing them in one table
     makes it impossible to see at a glance which entries can spend
     something, and that distinction is the only one that matters when
     reviewing an interface. */
  erc20Yaz: [
    "function approve(address spender, uint256 value) returns (bool)"
  ],
  launchpadYaz: [
    "function launch(string ad, string sembol, address hedefVarlik, uint256 vergiPpm, uint256 alim, uint256 teminat) returns (address token, address kasa)"
  ],
  /* second generation: the founder names the chain (CCTP domain) and the
     asset on it; domain 0 keeps the collateral in dollars on this chain */
  launchpad2Yaz: [
    "function launch(string ad, string sembol, uint32 hedefDomain, address hedefVarlik, uint256 vergiPpm, uint256 alim, uint256 teminat) returns (address token, address kasa)"
  ],
  /* BNB: the 1:1 six-decimal wrapper over 18-decimal USDC (Dolar6) */
  sarmalYaz: [
    "function sar(uint256 birim) returns (uint256)",
    "function coz(uint256 birim) returns (uint256)"
  ],
  /* IkizYayici: one address on all nine chains */
  yayici: [
    "function ucret(address token, uint32[] hedefler, bytes secenekler) view returns (uint256)",
    "function ikizAdresi(address token) view returns (address)",
    "function adapterAdresi(address token) view returns (address)"
  ],
  yayiciYaz: [
    "function yay(address token, uint32[] hedefler, bytes secenekler) payable"
  ],
  launchedOlay: [
    "event Launched(uint256 indexed id, address indexed token, address indexed kurucu, address acici, address kasa, string ad, string sembol)"
  ],

  kasa: [
    "function hak(address) view returns (uint256)",
    "function bakiye(address) view returns (uint256)",
    "function dolasim() view returns (uint256)",
    /* THE BASKET IS GONE, AND SO ARE ITS FOUR FUNCTIONS
         sepetDegeri, varlikSayisi, varliklar and agirlik belonged to the
         weighted-basket vault. The current vault holds the quote and its
         claim is quote over circulating, so there is no basket to value
         and no weights to read.

         They sat here declared and unused, which is harmless until
         something calls one — and then it returns empty and the screen
         blames the network. Found by the ABI assertion in
         denetim-sayfa.js on its first run.

       What replaces them is what the vault actually answers: the ledger
       figures behind the claim. */
    "function ekonomik() view returns (uint256)",
    "function musait() view returns (uint256)",
    "function bekleyenTalep() view returns (uint256, uint256)",
    "function quote() view returns (address)",
    "function token() view returns (address)",
    "function ISLEM_TAVANI_BPS() view returns (uint256)",
    "function DONEM_TAVANI_BPS() view returns (uint256)",
    "function DONEM_BLOK() view returns (uint256)",
    "function ODUL_PAYI_BPS() view returns (uint256)"
  ],
  /* THE SECOND GENERATION'S SHAPE, AND THE THREE THINGS THAT CHANGED
       launchSayisi -> launchCount    the name
       launchAt     -> a STRUCT       ten fields, different order
       ESIK         -> gone           there is no graduation any more

     None of these would have reverted visibly. A call to a function the
     contract does not have returns empty, the decoder gives null and the
     screen says "could not read" — which reads like a network problem.
     The launch list would simply have been empty forever.

     The page audit checks ADDRESSES, not ABIs, which is why it passed
     while this was wrong. An assertion for exactly this now exists in
     denetim-sayfa.js. */
  launchpad: [
    "function launchCount() view returns (uint256)",
    "function SUPPLY() view returns (uint256)",
    "function ACILIS_MCAP() view returns (uint256)",
    "function ASGARI_ALIM() view returns (uint256)",
    "function AZAMI_ALIM() view returns (uint256)",
    "function ASGARI_TEMINAT() view returns (uint256)"
  ],
  egri: [
    "function toplanan() view returns (uint256)",
    "function ESIK() view returns (uint256)",
    "function mezun() view returns (bool)",
    "function FANTOM() view returns (uint256)",
    "function SANAL_TOKEN() view returns (uint256)",
    "function x() view returns (uint256)",
    "function y() view returns (uint256)"
  ],
  besleyici: [
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    "function decimals() view returns (uint8)"
  ],
  acici: [
    "function likidite() view returns (uint128)",
    "function acildi() view returns (bool)",
    "function altTick() view returns (int24)",
    "function ustTick() view returns (int24)"
  ],

  /* The live Governor. Every period is SECONDS: state() compares
     against block.timestamp, and `end` is block.timestamp +
     VOTING_PERIOD. Reading them as blocks is how 5 days became
     2.54 days in a report. */
  /* FTHM'S GOVERNOR, NOT ALP'S — AND THEY ARE NOT THE SAME SHAPE
   *
   * Governance moved to FTHM, so these tables now describe
   * DepthGovernor + Stake. Four entries here did not exist on that
   * stack and were measured against the compiled artifacts before
   * anything was repointed:
   *
   *   oyYonu(uint256,address)   not there at all — DepthGovernor records
   *                             THAT you voted, never which way
   *   staking()                 is stake()
   *   MIN_OY_GUCU()             is on the Stake, not the Governor
   *   votingPower(address)      is oyGucu(address)
   *   stakeOf(address)          is stakedOf(address)
   *
   * AND THE STRUCT GREW
   *   The ALP governor's Proposal had five uints; DepthGovernor's has
   *   six — snapshotTotal sits between eta and forVotes. Decoding the
   *   new one with the old list put snapshotTotal where forVotes
   *   belongs, so a proposal with zero support would have displayed the
   *   entire staked supply as votes FOR it. Nothing would have errored.
   *
   *   So the vote counts are read through forVotesOf/againstVotesOf
   *   instead of by struct index. A named getter cannot drift by one. */
  governor: [
    "function proposalCount() view returns (uint256)",
    "function proposals(uint256) view returns (address,address,bytes,string,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool)",
    "function state(uint256) view returns (uint8)",
    "function hasVoted(uint256,address) view returns (bool)",
    "function forVotesOf(uint256) view returns (uint256)",
    "function againstVotesOf(uint256) view returns (uint256)",
    "function powerAt(uint256,address) view returns (uint256)",
    "function guardian() view returns (address)",
    "function guardianActive() view returns (bool)",
    "function guardianExpiry() view returns (uint256)",
    "function stake() view returns (address)",
    "function PROPOSAL_THRESHOLD_BPS() view returns (uint256)",
    "function QUORUM_BPS() view returns (uint256)",
    "function VOTING_PERIOD() view returns (uint256)",
    "function TIMELOCK() view returns (uint256)",
    "function GRACE_PERIOD() view returns (uint256)",
    "function ANLIK_GERI() view returns (uint256)",
    "function propose(string,address,bytes) returns (uint256)",
    "function castVote(uint256,bool) returns (uint256)",
    "function queue(uint256) returns (uint256)",
    "function execute(uint256)",
    "function cancel(uint256)"
  ],

  /* Voting power comes from staking, not from holding. A snapshot of
     the total is taken when a proposal opens, so quorum is measured
     against the stake that existed then — not against a total somebody
     can inflate mid-vote. */
  /* The marketplace. Read side only — nothing here can move money. */
  pazar: [
    "function urunSayisi() view returns (uint256)",
    /* urunler(), NOT urunAt() — and the audit caught this.
         urunAt() returns ONE struct. Because there is a string inside it,
         that struct is DYNAMIC, so the ABI encoding is not seven values but
         an OFFSET to a tuple. Declaring it as seven flat fields would have
         decoded the wrong data silently: what was taken for the price would
         be an offset.

         urunler(), on the other hand, is the public array's getter and
         gives the same data as SEVEN SEPARATE returns. The same
         information, in a shape whose decoding carries no ambiguity.

         I got this class of thing wrong twice in this project — launchAt
         grew to ten fields, DepthGovernor's proposal to twelve — and both
         were silently reading the wrong field. The audit caught this third
         one while the code was being written, before it ever ran. */
    "function urunler(uint256) view returns (address,uint256,uint64,bool,string,uint256,uint256)",
    "function gelistirici(address) view returns (bool,uint64,string)",
    "function lisans(uint256,address) view returns (bool,uint64,bool)",
    "function ortalamaPuan(uint256) view returns (uint256,uint256)",
    "function PLATFORM_PPM() view returns (uint256)",
    "function isletme() view returns (address)",
    "function quote() view returns (address)",
    "function lisansliMi(uint256,address) view returns (bool)",
    "function gelistiriciKazanci(address) view returns (uint256)",
    "function platformKazanci() view returns (uint256)",
    "function toplamHasilat() view returns (uint256)",
    "function puanSayisi(uint256) view returns (uint256)",
    "function tutulan() view returns (uint256)"
  ],
  /* Write side. satinAl pulls USDC, so it needs an approve first; the
     ERC20 write table already has that. */
  pazarYaz: [
    "function kaydol(string)",
    "function urunEkle(uint256,uint64,string) returns (uint256)",
    "function urunGuncelle(uint256,uint256,bool,string)",
    "function satinAl(uint256) returns (uint64)",
    "function puanla(uint256,uint8)"
  ],
  /* The developer pool. register() is permissionless and pay() is the
     governor's alone — kept in separate tables so it is visible at a
     glance which one can move money. */
  devPool: [
    "function governor() view returns (address)",
    "function contributionCount() view returns (uint256)",
    "function held(address) view returns (uint256)",
    "function paid(address,address) view returns (uint256)"
  ],
  devPoolYaz: [
    "function register(string) returns (uint256)"
  ],
  /* pay() IS HERE ONLY TO BE ENCODED — the page never SENDS it.
   *
   * DevPool.pay is accepted only from the FTHM Governor, so called from a
   * wallet it reverts with NotGovernor (measured). The only reason it is
   * here is to produce the calldata that goes INSIDE A PROPOSAL: the
   * proposal passes, the timelock runs out, and execute() calls it on the
   * Governor's behalf.
   *
   * It sits in a separate table because the others mean "this page sends
   * this", while this table means "this page writes this, the DAO sends
   * it". Putting both in one place would make who can send what unreadable
   * at a glance. */
  devPoolTeklif: [
    "function pay(address,address,uint256,uint256)"
  ],
  /* The hook's readable side. Only the views: the callbacks are called
     by the PoolManager and a page has no business in them. */
  kanca: [
    "function KALKAN_ESIK_PPM() view returns (uint256)",
    "function KALKAN_TAVAN_PPM() view returns (uint256)",
    "function SNIPE_PPM() view returns (uint256)",
    "function SNIPE_SURESI() view returns (uint64)",
    "function pencere(bytes32) view returns (uint64,uint192)",
    "function acilis(bytes32) view returns (uint64)",
    "function savunmaDurumu(bytes32) view returns (bool,uint160)",
    "function zirve(bytes32) view returns (uint160)"
  ],
  staking: [
    "function totalStaked() view returns (uint256)",
    "function oyGucu(address) view returns (uint256)",
    "function oyGucuAt(address,uint256) view returns (uint256)",
    "function stakedOf(address) view returns (uint256)",
    "function MIN_OY_GUCU() view returns (uint256)",
    "function token() view returns (address)",
    "function pending(address) view returns (uint256)"
  ],
  stakingYaz: [
    "function stake(uint256)",
    "function unstake(uint256)",
    "function claim() returns (uint256)"
  ]
};

/* ---- block and price ------------------------------------------------- */

export async function sonBlok() {
  try { return parseInt(await cagri("eth_blockNumber", []), 16); }
  catch (e) { return null; }
}

/** A Chainlink proxy's answer, scaled. null when the feed cannot be read —
 *  which is a real outcome and not an excuse to invent a price. */
export async function besleyiciFiyat(proxy, ondalik = 8) {
  const c = await oku(proxy, ABI.besleyici, "latestRoundData");
  if (!c) return null;
  const cevap = c[1];
  const guncellendi = Number(c[3]) * 1000;
  if (cevap == null || cevap <= 0n) return null;
  return { fiyat: Number(cevap) / 10 ** ondalik, guncellendi };
}

/**
 * A v4 pool's sqrtPriceX96, read from the PoolManager's storage.
 *
 * v4 keeps no public getter for slot0, so this reads the `_pools` mapping
 * directly: slot 6, keyed by the pool id. The layout is v4-core's and is
 * pinned by the same slot number the opener uses internally — if either
 * moves, both move together and scripts/olc-*.js would fail first.
 */
export async function havuzFiyati(poolKey) {
  const id = havuzId(poolKey);
  const yuva = keccakIki(id, 6);
  try {
    const v = await cagri("eth_call", [{
      to: DIS.poolManager,
      data: cagriVerisi(["function extsload(bytes32) view returns (bytes32)"], "extsload", [yuva])
    }, "latest"]);
    const c = sonucCoz(["function extsload(bytes32) view returns (bytes32)"], "extsload", v);
    if (!c) return null;
    const ham = BigInt(c[0]);
    const sqrtP = ham & ((1n << 160n) - 1n);
    if (sqrtP === 0n) return null;
    return sqrtP;
  } catch (e) {
    return null;
  }
}

export function havuzId(k) {
  return keccak(kodlayici.encode(
    ["address", "address", "uint24", "int24", "address"],
    [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]
  ));
}

/* keccak comes from ethers; importing the whole utils namespace for two
   functions is cheaper than hand-rolling a hash. */
import { keccak256, concat, zeroPadValue, toBeHex } from "../vendor/ethers.min.js";

function keccak(hex) { return keccak256(hex); }
function keccakIki(id, yuvaNo) {
  return keccak256(concat([id, zeroPadValue(toBeHex(yuvaNo), 32)]));
}

/**
 * Token price in quote terms, from sqrtPriceX96.
 *
 * sqrtP tracks currency1 per currency0. When the launch token is
 * currency1 the token's price is the INVERSE, and reading it the other way
 * round reports every crash as a rally — which it did once, in a test,
 * before this was written down.
 */
export function fiyatCevir(sqrtP, tokenSifirinci, tokenOndalik, quoteOndalik) {
  if (sqrtP == null) return null;
  const q96 = 2 ** 96;
  const p = Number(sqrtP) / q96;
  const oran = p * p;                           // currency1 / currency0
  const olcek = 10 ** (tokenOndalik - quoteOndalik);
  return tokenSifirinci ? oran * olcek : (1 / oran) * olcek;
}

/** Which side a token sits on is decided by address order, never guessed. */
export function anahtarKur(token, quote, fee, tickSpacing, hooks) {
  const tokenSifirinci = token.toLowerCase() < quote.toLowerCase();
  return {
    anahtar: {
      currency0: tokenSifirinci ? token : quote,
      currency1: tokenSifirinci ? quote : token,
      fee, tickSpacing, hooks
    },
    tokenSifirinci
  };
}

/* ---- the launch list ------------------------------------------------- */

/**
 * Every launch the launchpad knows.
 *
 * Returns { dagitildiMi, liste }. Before deployment `dagitildiMi` is false
 * and the list is empty — and the view renders "nothing is deployed yet"
 * rather than "no tokens found", because those are different sentences and
 * only one of them is true.
 */
export async function launchListesi() {
  if (!canli(PULSE.launchpad)) return { dagitildiMi: false, liste: [] };

  const sayi = await oku(PULSE.launchpad, ABI.launchpad, "launchCount");
  if (sayi == null) return { dagitildiMi: true, liste: [], hata: "launchCount could not be read" };

  const n = Number(sayi);
  if (n === 0) return { dagitildiMi: true, liste: [] };

  /* A STRUCT, not a flat tuple. The previous generation returned seven
     loose values; this one returns one Kayit with ten fields, and the
     order differs — acici moved, rewards is gone, kurucuToken and teklif
     are new. Decoded by the struct so a field can never be read from the
     wrong position. */
  const abi = [
    "function launchAt(uint256) view returns ((address token, address acici, address kasa, address yonetici, address hedefVarlik, address kurucu, uint256 kurucuToken, uint256 teklif, uint256 vergiPpm, uint64 zaman))"
  ];
  const sonuc = await cokluCagri(
    Array.from({ length: n }, (_, i) => ({
      method: "eth_call",
      params: [{ to: PULSE.launchpad, data: cagriVerisi(abi, "launchAt", [i]) }, "latest"]
    }))
  );

  const liste = [];
  for (let i = 0; i < sonuc.length; i++) {
    const c = sonucCoz(abi, "launchAt", sonuc[i]);
    if (!c || !c[0]) continue;
    const k = c[0];
    liste.push({
      id: i,
      token: k[0], acici: k[1], kasa: k[2], yonetici: k[3],
      hedefVarlik: k[4], kurucu: k[5],
      kurucuToken: k[6], teklif: k[7],
      vergiPpm: Number(k[8]), zaman: Number(k[9]),
      /* Gone with the curve and with holder rewards. Named here as null
         rather than left undefined, so a view that still reads them gets
         a falsy value it can test instead of silently rendering
         "undefined". */
      egri: null, rewards: null
    });
  }
  return { dagitildiMi: true, liste };
}

/** Name, symbol, decimals and supply for several tokens, in one batch. */
export async function jetonBilgileri(adresler) {
  if (!adresler.length) return [];
  const istekler = [];
  for (const a of adresler) {
    for (const f of ["name", "symbol", "decimals", "totalSupply"]) {
      istekler.push({
        method: "eth_call",
        params: [{ to: a, data: cagriVerisi(ABI.erc20, f) }, "latest"]
      });
    }
  }
  const s = await cokluCagri(istekler);
  return adresler.map((a, i) => {
    const d = s.slice(i * 4, i * 4 + 4);
    const al = (j, f) => {
      const c = sonucCoz(ABI.erc20, f, d[j]);
      return c ? c[0] : null;
    };
    return {
      adres: a,
      ad: al(0, "name"),
      sembol: al(1, "symbol"),
      ondalik: al(2, "decimals") == null ? 18 : Number(al(2, "decimals")),
      arz: al(3, "totalSupply")
    };
  });
}
