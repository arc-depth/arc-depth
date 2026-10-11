"use strict";
/* ===========================================================================
 * dagit-havuz.js — get DEPTH onto Uniswap today, with the money that exists.
 *
 *   node scripts/dagit-havuz.js                 dry run
 *   node scripts/dagit-havuz.js --uygula        send it
 *
 * WHY A SECOND CURVE
 *   The deployed curve graduates at $15,000 and that figure is immutable,
 *   which is the property that makes it worth trusting and also the reason
 *   it cannot be lowered. There is $7.34 on hand. So the only route to a
 *   real Uniswap pool today is a second, smaller curve whose threshold the
 *   available money can actually fill.
 *
 * THE ONE THING THAT MUST NOT GO WRONG
 *   Two venues for the same token at two different prices is postmortem
 *   mistake #10 — it is what left ALP with a zombie pool that confused
 *   every price site. So this curve is sized so that its GRADUATION price
 *   lands on the first curve's current price. It opens lower and climbs to
 *   meet it, and the pool therefore opens where DEPTH already trades.
 *
 *   The arbitrage that opens up between them while this curve is cheap is
 *   bounded by what the first curve holds, which is $0.49.
 *
 * WHAT YOU GET, STATED PLAINLY
 *   A real, locked, hook-enabled Uniswap v4 pool with about $6 in it. That
 *   serves a $1 trade at roughly 16% slippage and will not serve a $100
 *   one. It is a seed, not a market. What makes it worth planting: every
 *   trade routes 0.20% back into the position and a buyer's USDC stays in
 *   the pool, so depth grows with volume instead of needing to be funded.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, AbiCoder, getCreateAddress, getCreate2Address, keccak256, id } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const UYGULA = process.argv.includes("--uygula");

const GEREKEN_BITLER = (1 << 11) | (1 << 9) | (1 << 6) | (1 << 2);   // 0xa44
const BIT_MASKE = (1 << 14) - 1;

const coder = AbiCoder.defaultAbiCoder();
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));
const sel = (s) => id(s).slice(0, 10);
const E = 10n ** 18n;
const U6 = 10n ** 6n;

/* ---- the plan, from round inputs -------------------------------- */
const EGRI_TOKEN = 3_300_000n * E;      // from the founder's share
const FANTOM = 1n * U6;                  // $1, notional
const ESIK = 6n * U6;                    // $6 — what the wallet can fill
const SNIPE_SURESI = 0n;                 // nothing to protect: one buyer, by design
const SPACING = 60;

function hookSaltAra(initCodeHash) {
  const t0 = Date.now();
  for (let i = 0; i < 5_000_000; i++) {
    const salt = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
    if ((parseInt(a.slice(-4), 16) & BIT_MASKE) === GEREKEN_BITLER) {
      return { salt, adres: a, deneme: i + 1, ms: Date.now() - t0 };
    }
  }
  return null;
}

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
    try { const r = await ham(m, p); await new Promise((x) => setTimeout(x, 700)); return r; }
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
const nf = (x, d = 0) => Number(x).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (x, d = 4) => "$" + nf(Number(x) / 1e6, d);
const tk = (x) => nf(Number(x) / 1e18);

(async function main() {
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);
  const BEN = cuzdan.address;
  const nonce = Number(await rpc("eth_getTransactionCount", [BEN, "latest"]));

  const A2 = {
    egri: getCreateAddress({ from: BEN, nonce: nonce + 0 }),
    acici: getCreateAddress({ from: BEN, nonce: nonce + 1 })
    /* nonce + 2 is the factory call that places the hook */
  };

  const hookInit = B("DepthHook").bytecode + coder.encode(
    ["address", "address", "address", "address", "address"],
    [POOL_MANAGER, A2.acici, BEN, D.stake, D.usdc]).slice(2);
  process.stdout.write("  hook adresi araniyor... ");
  const maden = hookSaltAra(keccak256(hookInit));
  if (!maden) { console.log("bulunamadi"); process.exit(1); }
  console.log(nf(maden.deneme) + " denemede, " + maden.ms + " ms");
  A2.hook = maden.adres;

  const adimlar = [
    ["Egri2", A2.egri, B("Egri").bytecode + coder.encode(
      ["address", "address", "uint256", "uint256", "uint256", "address", "uint64", "address", "address"],
      [D.token, D.usdc, FANTOM, EGRI_TOKEN, ESIK, A2.acici, SNIPE_SURESI, BEN, D.stake]).slice(2)],
    ["HavuzAcici2", A2.acici, B("HavuzAcici").bytecode + coder.encode(
      ["address", "address", "address", "address", "uint24", "int24", "address"],
      [POOL_MANAGER, D.token, D.usdc, A2.hook, 0, SPACING, A2.egri]).slice(2)],
    ["DepthHook2", A2.hook, maden.salt + hookInit.slice(2), CREATE2_FACTORY]
  ];

  /* ---- what this produces, computed not guessed ------------------ */
  const ayrilan = (EGRI_TOKEN * FANTOM) / (FANTOM + ESIK);
  const satilan = EGRI_TOKEN - ayrilan;
  /* kapanis = (FANTOM + ESIK) / ayrilan, as a ratio of raw amounts */
  const havuzToken = (ESIK * ayrilan) / (FANTOM + ESIK);
  const yakilan = ayrilan - havuzToken;
  const kapanisMcap = (Number(FANTOM + ESIK) / 1e6) / (Number(ayrilan) / 1e18) * 1e9;

  console.log("");
  console.log("IKINCI EGRI — DEPTH'i bugun Uniswap'a cikarmak icin");
  console.log("  Mevcut egri $15.000'da mezun oluyor ve bu sayi IMMUTABLE.");
  console.log("  Elde " + usd(await bakiyeUsdc(BEN), 2) + " var. Bu yuzden esigi");
  console.log("  elimizdeki parayla dolacak ikinci bir egri.");
  console.log("");
  console.log("  egriye konan      " + tk(EGRI_TOKEN) + " DEPTH   (kurucu payindan)");
  console.log("  fantom            " + usd(FANTOM, 2) + "   sanal, kimse yatirmiyor");
  console.log("  esik              " + usd(ESIK, 2) + "   <- eldeki parayla dolar");
  console.log("");
  console.log("  acilis mcap       $" + nf((Number(FANTOM) / 1e6) / (Number(EGRI_TOKEN) / 1e18) * 1e9));
  console.log("  mezuniyet mcap    $" + nf(kapanisMcap) + "   <- mevcut egrinin fiyatina denk");
  console.log("  havuza konacak    " + tk(havuzToken) + " DEPTH + " + usd(ESIK, 2));
  console.log("  yakilacak         " + tk(yakilan));
  console.log("  bana geri gelecek " + tk(satilan) + "   (alici benim)");
  console.log("  KURUCU NET        " + tk(havuzToken + yakilan) + " DEPTH");
  console.log("");
  console.log("  tahmin edilen adresler");
  for (const [ad, adres] of adimlar.map((x) => [x[0], x[1]])) console.log("    " + ad.padEnd(13) + adres);
  console.log("");

  const gasPrice = BigInt(await rpc("eth_gasPrice", []));
  let toplamGas = 0n;
  const tahminler = [];
  for (const [ad, , init, hedef] of adimlar) {
    let g = 0n;
    try {
      g = BigInt(await rpc("eth_estimateGas",
        [{ from: BEN, data: init, ...(hedef ? { to: hedef } : {}) }]));
    } catch (e) { g = 0n; }
    tahminler.push(g);
    toplamGas += g;
    console.log("    " + ad.padEnd(13) + nf(Number(g)).padStart(10) + " gas");
  }
  console.log("    " + "".padEnd(13) + "".padStart(10, "-"));
  console.log("    " + "deploy".padEnd(13) + nf(Number(toplamGas)).padStart(10) + " gas   " +
    (Number(toplamGas * gasPrice) / 1e18).toFixed(5));
  console.log("    artı transfer, approve, alım ve mezunEt islemleri");
  console.log("");
  console.log("  SONUCTA NE OLUYOR");
  console.log("    Gercek, kilitli, hooklu bir Uniswap v4 havuzu — derinligi " + usd(ESIK, 2) + ".");
  console.log("    $1'lik islemi ~%16 kaymayla kaldirir, $100'luk islemi KALDIRMAZ.");
  console.log("    Tohum, piyasa degil. Ama her islemin %0,20'si havuza geri");
  console.log("    yatiyor ve alicinin USDC'si havuzda kaliyor — hacim geldikce");
  console.log("    kendiliginden derinlesir.");
  console.log("    Ve mezun olunca DexScreener kendiliginden listeler.");
  console.log("");

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi. --uygula ekle");
    return;
  }

  /* ---- send -------------------------------------------------------- */
  let n2 = nonce;
  const gonder = async (tx, ad) => {
    const imzali = await cuzdan.signTransaction({ ...tx, chainId: CHAIN_ID, nonce: n2++, gasPrice });
    let hash;
    try { hash = await rpc("eth_sendRawTransaction", [imzali]); }
    catch (e) {
      if (!/already known|nonce too low/i.test(String(e.message))) throw e;
      hash = keccak256(imzali);
    }
    console.log("      " + ad + " -> " + hash);
    for (let i = 0; i < 90; i++) {
      let rc = null;
      try { rc = await rpc("eth_getTransactionReceipt", [hash]); } catch (e) { /* poll */ }
      if (rc) {
        if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
        console.log("        blok " + parseInt(rc.blockNumber, 16) +
          ", gaz " + nf(parseInt(rc.gasUsed, 16)));
        return rc;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error("makbuz gelmedi: " + hash);
  };
  const kodVar = async (a) => { const k = await rpc("eth_getCode", [a, "latest"]); return !!k && k !== "0x"; };

  for (let i = 0; i < adimlar.length; i++) {
    const [ad, adres, init, hedef] = adimlar[i];
    if (await kodVar(adres)) { console.log("    " + ad + " yerinde, atlandi"); n2++; continue; }
    console.log("    " + ad + " gonderiliyor...");
    await gonder({ data: init, ...(hedef ? { to: hedef } : {}),
      gasLimit: tahminler[i] > 0n ? (tahminler[i] * 13n) / 10n : 3_000_000n, value: 0n }, ad);
    if (!(await kodVar(adres))) throw new Error(ad + ": tahmin edilen adreste kod yok");
  }

  console.log("    egriye token gonderiliyor...");
  await gonder({ to: D.token, data: sel("transfer(address,uint256)") +
    coder.encode(["address", "uint256"], [A2.egri, EGRI_TOKEN]).slice(2),
    gasLimit: 90_000n, value: 0n }, "transfer");

  console.log("    USDC onayi...");
  await gonder({ to: D.usdc, data: sel("approve(address,uint256)") +
    coder.encode(["address", "uint256"], [A2.egri, (1n << 255n)]).slice(2),
    gasLimit: 80_000n, value: 0n }, "approve");

  /* The fee takes 1% of which 0.6% leaves, so `toplanan` rises by 99% of
     what is paid. Buy the shortfall plus a margin, then top up if the
     rounding leaves it short. */
  for (let tur = 0; tur < 4; tur++) {
    const toplanan = BigInt(await rpc("eth_call", [{ to: A2.egri, data: sel("toplanan()") }, "latest"]));
    if (toplanan >= ESIK) break;
    const eksik = ESIK - toplanan;
    const odenecek = (eksik * 1_010_000n) / 1_000_000n + 2n;
    console.log("    alim: " + usd(odenecek, 6) + "   (eksik " + usd(eksik, 6) + ")");
    await gonder({ to: A2.egri, data: sel("al(uint256,uint256)") +
      coder.encode(["uint256", "uint256"], [odenecek, 0]).slice(2),
      gasLimit: 260_000n, value: 0n }, "al");
  }

  const son = BigInt(await rpc("eth_call", [{ to: A2.egri, data: sel("toplanan()") }, "latest"]));
  console.log("    toplanan " + usd(son, 6) + " / esik " + usd(ESIK, 2));
  if (son < ESIK) throw new Error("esige ulasilamadi");

  console.log("    MEZUN EDILIYOR — havuz aciliyor...");
  await gonder({ to: A2.egri, data: sel("mezunEt()"), gasLimit: 2_000_000n, value: 0n }, "mezunEt");

  /* ---- verify ------------------------------------------------------ */
  const oku = (to, data) => rpc("eth_call", [{ to, data }, "latest"]);
  const havuzId = await oku(A2.acici, sel("havuzId()"));
  const likidite = BigInt(await oku(A2.acici, sel("likidite()")));
  const havuzUsdc = await bakiyeUsdc(POOL_MANAGER);
  const arz = BigInt(await oku(D.token, sel("totalSupply()")));

  console.log("");
  console.log("  HAVUZ ACILDI");
  console.log("    poolId      " + havuzId);
  console.log("    likidite    " + likidite.toString());
  console.log("    hook        " + A2.hook);
  console.log("    arz         " + tk(arz) + "   (yakma sonrasi)");
  console.log("");

  const M = {
    zincir: "arc", chainId: CHAIN_ID,
    not: "Ikinci egri: mevcut egrinin $15.000 esigi elde para yokken ulasilamaz oldugu icin, " +
         "eldeki parayla dolacak olcekte acildi. Mezuniyet fiyati mevcut egrinin fiyatina denk.",
    egri2: A2.egri, havuzAcici2: A2.acici, hook2: A2.hook, hookSalt: maden.salt,
    token: D.token, usdc: D.usdc, stake: D.stake,
    egriToken: EGRI_TOKEN.toString(), fantom: FANTOM.toString(), esik: ESIK.toString(),
    havuzId, likidite: likidite.toString(), spacing: SPACING, fee: 0,
    zaman: new Date().toISOString()
  };
  fs.writeFileSync(path.join(__dirname, "..", "dagitim-havuz.json"), JSON.stringify(M, null, 1));
  console.log("  dagitim-havuz.json yazildi");
  console.log("  DEPTH artik Uniswap v4'te. DexScreener birkac dakikada listeler.");

  async function bakiyeUsdc(w) {
    return BigInt(await rpc("eth_call", [{ to: D.usdc,
      data: sel("balanceOf(address)") + coder.encode(["address"], [w]).slice(2) }, "latest"]));
  }
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
