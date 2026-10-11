"use strict";
/* ===========================================================================
 * denetim-alp.js — audit the ALP liquidity lock from the chain alone.
 *
 *   node scripts/denetim-alp.js
 *
 * The deploy script said it worked. A deploy script saying it worked is not
 * evidence of anything, so this reads the same facts from sources that have
 * no reason to agree with it:
 *
 *   the pool's price and liquidity    out of the PoolManager's own storage
 *                                     via extsload, not out of a getter
 *                                     somebody wrote
 *   the locked ALP                    off the ALP contract's balance of the
 *                                     PoolManager
 *   the free ALP                      off the same contract's balance of the
 *                                     wallet
 *   that nothing can withdraw it      off the deployed bytecode, which is
 *                                     what will actually run
 *
 * The last one is the only claim that matters to anyone buying ALP, and it
 * is the one a README cannot make. modifyLiquidity can only be reached
 * through unlock, and a position can only be touched by the address that
 * created it. So the question is whether the locker's own code contains any
 * path to either — and the deployed code is the answer, whatever the source
 * says.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { AbiCoder, Interface, keccak256 } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDC = "0x3600000000000000000000000000000000000000";
const CUZDAN = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";

/* Where v4 keeps its pools. Uniswap's own StateLibrary uses this constant;
   if it ever changed, the sanity check below (a price that matches the one
   the pool was opened at) is what would catch it. */
const POOLS_SLOT = 6n;

const coder = AbiCoder.defaultAbiCoder();

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
  let bekle = 1500;
  for (let i = 0; ; i++) {
    try { return await ham(m, p); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}

let gecti = 0, kaldi = 0;
const ok = (k, ad, not) => {
  console.log("  " + (k ? "PASS " : "FAIL ") + ad + (not ? "   " + not : ""));
  k ? gecti++ : kaldi++;
};

(async function main() {
  const G = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-yonetisim.json"), "utf8"));
  const ALP = G.govToken;
  const KILIT = G.alpLocker;
  const ID = G.alpPoolId;

  console.log("ALP KILIT DENETIMI   (zincirden, betige sormadan)");
  console.log("  ALP          " + ALP);
  console.log("  kilitleyici  " + KILIT);
  console.log("  havuz id     " + ID);
  console.log("");

  const erc = new Interface(["function balanceOf(address) view returns (uint256)"]);
  const pm = new Interface([
    "function extsload(bytes32) view returns (bytes32)",
    "function initialize((address,address,uint24,int24,address),uint160) returns (int24)"
  ]);
  const bak = async (token, who) => BigInt(await rpc("eth_call", [
    { to: token, data: erc.encodeFunctionData("balanceOf", [who]) }, "latest"]));

  /* ---- 1. the pool exists, at the price it was opened at -------------- */
  const durumSlot = keccak256(coder.encode(["bytes32", "uint256"], [ID, POOLS_SLOT]));
  const slot0 = BigInt(await rpc("eth_call",
    [{ to: POOL_MANAGER, data: pm.encodeFunctionData("extsload", [durumSlot]) }, "latest"]));

  const sqrtP = slot0 & ((1n << 160n) - 1n);
  let tick = Number((slot0 >> 160n) & ((1n << 24n) - 1n));
  if (tick >= 1 << 23) tick -= 1 << 24;            // int24, two's complement
  const lpFee = Number((slot0 >> 208n) & ((1n << 24n) - 1n));

  ok(sqrtP > 0n, "havuz GERCEKTEN acilmis", "sqrtPriceX96 " + sqrtP.toString());

  /* ALP is currency1, so the pool price is ALP per USDC and the dollar
     price of ALP is its reciprocal. Derived from the raw slot rather than
     from anything the deploy script wrote down. */
  const Q96 = 2 ** 96;
  const havuzFiyat = (Number(sqrtP) / Q96) ** 2;
  const alpUsd = 1 / havuzFiyat;
  const mcap = alpUsd * 1e9;
  ok(Math.abs(mcap - G.alpAcilisMcap) / G.alpAcilisMcap < 0.01,
    "acilis piyasa degeri hedefte", "$" + mcap.toFixed(2) + "  (hedef $" + G.alpAcilisMcap + ")");
  ok(lpFee === G.alpPoolFee, "havuz ucreti " + lpFee, "ALP ucretsiz islem goruyor");

  /* ---- 2. there is live liquidity, in the band we placed -------------- */
  const likiditeSlot = "0x" + (BigInt(durumSlot) + 3n).toString(16).padStart(64, "0");
  const likidite = BigInt(await rpc("eth_call",
    [{ to: POOL_MANAGER, data: pm.encodeFunctionData("extsload", [likiditeSlot]) }, "latest"]));
  /* Zero is the right answer here, and it is worth saying why rather than
     quietly not checking it. The position is one-sided: all ALP, in a band
     entirely on the far side of the opening price. That is exactly what
     makes it cost no USDC, and it also means the band is out of range at
     the opening tick, so the pool reports no ACTIVE liquidity until the
     first purchase moves the price into it. Liquidity that is present but
     not yet in range is not missing liquidity. */
  ok(likidite === 0n, "acilista aktif likidite 0 — pozisyon araligin disinda",
    "tek yonlu pozisyonun tanimi; ilk alimda banda girer");
  ok(tick > G.alpBantUst, "fiyat bandin HEMEN USTUNDE",
    "tick " + tick + "  bant [" + G.alpBantAlt + ", " + G.alpBantUst + "]");

  /* ---- 3. where the ALP actually is ---------------------------------- */
  const havuzda = await bak(ALP, POOL_MANAGER);
  const kilitte = await bak(ALP, KILIT);
  const cuzdanda = await bak(ALP, CUZDAN);
  const d = (x) => Number(x) / 1e18;

  ok(havuzda === BigInt(G.alpKilitli) * 10n ** 18n - kilitte,
    "KILITLENEN ALP HAVUZDA", d(havuzda).toLocaleString("en-US") + " ALP");
  ok(kilitte < 10n ** 6n, "kilitleyicide sadece tamsayi tozu kaldi", kilitte.toString() + " wei");
  ok(d(cuzdanda) === 50000000, "SERBEST %5 CUZDANDA, HER ZAMAN SATILABILIR",
    d(cuzdanda).toLocaleString("en-US") + " ALP");

  /* ---- 4. the USDC side, which nobody funded -------------------------
     Six decimals, not eighteen. Dividing by 1e18 here printed three units
     of USDC as 0.000003 — the same assumption that priced the pool wrong,
     surviving into the script written to audit it. */
  const havuzUsdc = await bak(USDC, POOL_MANAGER);
  console.log("  not  PoolManager'daki USDC: " + (Number(havuzUsdc) / 1e6).toFixed(6) +
    "   (tum havuzlarin toplami — ALP tarafi alim geldikce birikir)");

  /* ---- 5. the part that cannot be taken on trust --------------------- */
  const kod = await rpc("eth_getCode", [KILIT, "latest"]);
  ok(kod && kod !== "0x", "kilitleyicinin kodu zincirde", ((kod.length - 2) / 2) + " bayt");

  /* A selector absent from the deployed code cannot be reached, whatever
     the source says. Only the ones that would let the locker touch the
     position or the pool's balances again are meaningful here.
     `transfer` is deliberately NOT in this list: the locker pays the pool
     with it, so it must be present, and its presence proves nothing either
     way — bytecode holds outgoing call selectors exactly like entry
     points. What the locker exposes is settled by its ABI, which the test
     suite checks has two writing functions and no more. */
  const sel = (sig) => keccak256(Buffer.from(sig)).slice(2, 10);
  const yok = (sig) => kod.indexOf(sel(sig)) < 0;
  const tehlikeli = [
    ["modifyLiquidity", "pozisyonu degistirmenin tek yolu",
     "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)"],
    ["take", "havuzdan para cekmenin tek yolu", "take(address,address,uint256)"],
    ["burn", "havuz bakiyesini yakma", "burn(address,uint256,uint256)"]
  ];
  for (const [ad, ne, imza] of tehlikeli) {
    ok(yok(imza), "kodda " + ad + " SELEKTORU YOK", ne + " — " + sel(imza));
  }

  /* And `kilitle` has already run, so even its one path is closed. */
  const kilitIface = new Interface(["function kilitlendi() view returns (bool)"]);
  const kl = await rpc("eth_call",
    [{ to: KILIT, data: kilitIface.encodeFunctionData("kilitlendi") }, "latest"]);
  ok(BigInt(kl) === 1n, "kilitle() HARCANMIS, bir daha calismaz", "tek seferlik");

  /* ---- 6. and the pool itself cannot be re-opened --------------------- */
  const key = [USDC, ALP, 0, 60, "0x0000000000000000000000000000000000000000"];
  let tekrarRed = false;
  try {
    await rpc("eth_call", [{
      from: CUZDAN, to: POOL_MANAGER,
      data: pm.encodeFunctionData("initialize", [key, sqrtP])
    }, "latest"]);
  } catch (e) { tekrarRed = true; }
  ok(tekrarRed, "havuz ikinci kez baslatilamiyor", "ayni PoolKey = ayni havuz");

  console.log("");
  if (kaldi) { console.log(kaldi + " KONTROL BASARISIZ"); process.exit(1); }
  console.log("hepsi gecti (" + gecti + ") — kilit zincirde, sozde degil");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
