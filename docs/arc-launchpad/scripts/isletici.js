"use strict";
/* ===========================================================================
 * isletici.js — the operator. Turns a customer's USDC into collateral.
 *
 *   node scripts/isletici.js --hisse NVDA --usdc 3
 *   node scripts/isletici.js --hisse NVDA --usdc 3 --uygula
 *
 * Four legs, in order, with real transactions:
 *
 *   1. Arc USDC            -> Robinhood Chain ETH     (relay)
 *   2. ETH                 -> the tokenized share     (our router, Uniswap v4)
 *   3. the share           -> locked in the vault     (Robinhood Chain)
 *   4. the lock            -> wrapped share on Arc    (relayer mint)
 *
 * WHY THIS EXISTS AS A SCRIPT AT ALL
 *   Arc has no general message bridge — checked, not assumed; neither
 *   LayerZero nor CCIP is deployed on it. So no contract on Arc can reach
 *   Robinhood Chain, buy a share and return inside one transaction.
 *   Somebody has to carry it, and this is that somebody.
 *
 *   What it carries is its own money, not the customer's. LaunchQueue pays
 *   the operator back only in the same transaction that delivers the
 *   collateral and creates the launch; there is deliberately no function
 *   that advances the deposit first. So the risk here is ours and the
 *   customer's deposit never leaves a contract they can reclaim it from.
 *
 * RESUMABLE
 *   Every leg writes what it did to isletici-durum.json before starting the
 *   next. A run that dies after the swap does not buy a second share when
 *   it is started again — it picks up at the lock.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, Interface, keccak256, formatUnits, parseUnits, getAddress } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const ARC_ID = 5042, RHC_ID = 4663;

/* The first router deployed here could not take native input — it went
 * out before SwapRouter learned to settle with value — and every pool
 * "reverted" until that was spotted. This one has it. */
const ROUTER_RHC = "0x7C021F03CF2ABb9C0a8312b4789ca3AD36d44c0a";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const SIFIR = "0x0000000000000000000000000000000000000000";

const arg = process.argv.slice(2);
const val = (k, d) => { const i = arg.indexOf(k); return i >= 0 && arg[i + 1] ? arg[i + 1] : d; };
const UYGULA = arg.includes("--uygula");
const HISSE = (val("--hisse", "NVDA")).toUpperCase();
const USDC = val("--usdc", "3");
/* Sweep every ETH on Robinhood Chain instead of only what this run
   bridged. Off by default: spending more than was asked for is a decision. */
const HEPSI = process.argv.includes("--hepsi");
/* Gas on Robinhood Chain is ether, and spending every last wei on the swap
 * would leave nothing to pay for the lock. */
const GAS_PAYI = BigInt(val("--gas-payi", "250000000000000")); // 0.00025 ETH

const DURUM = path.join(__dirname, "..", "isletici-durum.json");

/* --------------------------------------------------------------- plumbing */

function istek(url, method, body, headers) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const b = body ? JSON.stringify(body) : null;
    const h = Object.assign({ accept: "application/json" }, headers || {});
    if (b) { h["content-type"] = "application/json"; h["content-length"] = Buffer.byteLength(b); }
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: h }, (s) => {
      let d = "";
      s.on("data", (c) => (d += c));
      s.on("end", () => res({ kod: s.statusCode, govde: d }));
    });
    r.on("error", rej);
    r.setTimeout(40000, () => r.destroy(new Error("timeout")));
    if (b) r.write(b);
    r.end();
  });
}

function hamRpc(url, method, params) {
  return new Promise((res, rej) => {
    const u = new URL(url);
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
    r.setTimeout(45000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

/* Both endpoints throttle and ethers has no retry; this has cost four
 * scripts in this project a run each. */
async function rpc(url, method, params) {
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await hamRpc(url, method, params); }
    catch (e) {
      const t = String(e.message);
      if (!/rate limit|too many requests|429|503|timeout|coalesce/i.test(t) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 25000);
    }
  }
}

async function gonder(url, chainId, cuzdan, tx, ad) {
  const nonce = Number(await rpc(url, "eth_getTransactionCount", [cuzdan.address, "latest"]));
  /* Double the quoted price. Robinhood Chain makes a block every ~100 ms
   * and its base fee moves between the quote and the send: a swap failed
   * here with maxFeePerGas 20,032,000 against a base fee of 20,060,000 —
   * short by a tenth of a percent. Gas costs a fraction of a cent on both
   * chains, so the margin is free and the failure is not. */
  const gasPrice = (BigInt(await rpc(url, "eth_gasPrice", [])) * 2n);
  const tam = Object.assign({ chainId, nonce, gasPrice }, tx);
  if (!tam.gasLimit) {
    const g = BigInt(await rpc(url, "eth_estimateGas", [{
      from: cuzdan.address, to: tam.to, data: tam.data,
      value: tam.value ? "0x" + BigInt(tam.value).toString(16) : undefined
    }]));
    tam.gasLimit = (g * 13n) / 10n;
  }
  const imzali = await cuzdan.signTransaction(tam);
  let hash;
  try { hash = await rpc(url, "eth_sendRawTransaction", [imzali]); }
  catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
    log("    (zaten dugumde)");
  }
  log("    " + ad + " -> " + hash);
  for (let i = 0; i < 90; i++) {
    let rc = null;
    try { rc = await rpc(url, "eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
      log("    blok " + parseInt(rc.blockNumber, 16));
      return { hash, rc };
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("makbuz gelmedi: " + hash);
}

const log = (...a) => console.log(...a);
const f = (x, d = 8) => Number(formatUnits(x, 18)).toLocaleString("en-US", { maximumFractionDigits: d });

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

function durumOku() {
  try { return JSON.parse(fs.readFileSync(DURUM, "utf8")); } catch (e) { return {}; }
}
function durumYaz(d) { fs.writeFileSync(DURUM, JSON.stringify(d, null, 1)); }

/* ------------------------------------------------------------ interfaces */

const ERC = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function symbol() view returns (string)"
]);
const ROUTER = new Interface([
  "function swap((address,address,uint24,int24,address),bool,uint256,uint256) payable returns (uint256)"
]);
const VAULT = new Interface([
  "function lock(uint256,address) returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function balance() view returns (uint256)"
]);
const WRAP = new Interface([
  "function mint(bytes32,address,uint256)",
  "function totalSupply() view returns (uint256)",
  "function usedLockId(bytes32) view returns (bool)"
]);

/* ------------------------------------------------------------------ main */

(async function main() {
  const ayar = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
  const h = (ayar.hisseler || {})[HISSE];
  if (!h) { log("relayer/ayar.json icinde " + HISSE + " yok. Once: node scripts/dagit-kopru.js --uygula --stock 0x… --sembol w" + HISSE); process.exit(1); }

  /* Which pool to buy in — measured, not chosen. */
  let anahtar = null;
  try {
    const a = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "rhc-alim.json"), "utf8"));
    if (a.hisse && a.hisse.toLowerCase() === h.stock.toLowerCase()) anahtar = a.enIyi;
  } catch (e) { /* reported below */ }
  if (!anahtar) {
    log("rhc-alim.json bu hisse icin olculmemis. Once:");
    log("  HISSE=" + h.stock + " node scripts/olc-rhc-alim.js");
    process.exit(1);
  }

  const pk = ozelAnahtar();
  if (!pk) { log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);

  log("ISLETICI — teminat uretimi");
  log("  hisse     " + HISSE + "  " + h.stock + "  (Robinhood Chain)");
  log("  sarmal    " + h.wrapped + "  (Arc)");
  log("  kasa      " + h.vault + "  (Robinhood Chain)");
  log("  havuz     fee " + anahtar.fee + ", tickSpacing " + anahtar.spacing + ", hooksuz");
  log("  cuzdan    " + cuzdan.address);
  log("  tutar     " + USDC + " USDC");
  log("  kip       " + (UYGULA ? "UYGULA — gercek islem" : "KURU CALISMA"));
  log("");

  const arcBak = BigInt(await rpc(ARC_RPC, "eth_getBalance", [cuzdan.address, "latest"]));
  const rhcBak = BigInt(await rpc(RHC_RPC, "eth_getBalance", [cuzdan.address, "latest"]));
  log("  Arc bakiye  " + f(arcBak, 6) + " USDC");
  log("  RHC bakiye  " + f(rhcBak, 8) + " ETH");

  const miktar = parseUnits(USDC, 18);

  const d = durumOku();
  const anahtarAd = HISSE + ":" + USDC;
  if (!d[anahtarAd]) d[anahtarAd] = {};
  const s = d[anahtarAd];

  /* ---- 1. relay: Arc USDC -> Robinhood Chain ETH --------------------- */
  log("");
  log("[1] kopru: Arc USDC -> Robinhood Chain ETH");
  if (s.kopruTx) {
    log("    zaten yapilmis: " + s.kopruTx);
  } else {
    /* Checked here rather than at the top: a resumed run has already sent
       the money across and must not be stopped for not having it twice. */
    if (arcBak < miktar) { log("    Arc bakiyesi yetmiyor."); process.exit(1); }
    const q = await istek("https://api.relay.link/quote", "POST", {
      user: cuzdan.address, recipient: cuzdan.address,
      originChainId: ARC_ID, destinationChainId: RHC_ID,
      originCurrency: SIFIR, destinationCurrency: SIFIR,
      amount: miktar.toString(), tradeType: "EXACT_INPUT"
    });
    if (q.kod !== 200) { log("    relay teklifi alinamadi: " + q.govde.slice(0, 200)); process.exit(1); }
    const j = JSON.parse(q.govde);
    const det = j.details || {};
    const beklenen = BigInt(((det.currencyOut || {}).amount) || "0");
    log("    teklif: " + USDC + " USDC -> " + f(beklenen, 10) + " ETH" +
      "   etki " + ((det.totalImpact || {}).percent) + "%   ~" + det.timeEstimate + " sn");

    const adim = (j.steps || [])[0];
    const oge = adim && (adim.items || [])[0];
    if (!oge || !oge.data) { log("    relay adimi bos"); process.exit(1); }
    if (Number(oge.data.chainId) !== ARC_ID) { log("    adim beklenen zincirde degil"); process.exit(1); }

    if (!UYGULA) { log("    (kuru calisma: gonderilmedi)"); }
    else {
      const r = await gonder(ARC_RPC, ARC_ID, cuzdan, {
        to: getAddress(oge.data.to), data: oge.data.data,
        value: BigInt(oge.data.value || "0")
      }, "kopru");
      s.kopruTx = r.hash;
      s.beklenenEth = beklenen.toString();
      s.durum = (oge.check && oge.check.endpoint) || null;
      durumYaz(d);
    }
  }

  /* ---- 2. wait for arrival -------------------------------------------- */
  let geldi = rhcBak;
  if (UYGULA && !s.varis) {
    log("");
    log("[2] varis bekleniyor (Robinhood Chain)");
    const basla = Date.now();
    for (let i = 0; i < 90; i++) {
      const b = BigInt(await rpc(RHC_RPC, "eth_getBalance", [cuzdan.address, "latest"]));
      if (b > rhcBak) {
        geldi = b;
        log("    geldi: +" + f(b - rhcBak, 10) + " ETH   (" + Math.round((Date.now() - basla) / 1000) + " sn)");
        s.varis = (b - rhcBak).toString();
        durumYaz(d);
        break;
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!s.varis) { log("    gelmedi — relay durumu: " + (s.durum || "?")); process.exit(1); }
  } else if (s.varis) {
    log("");
    log("[2] varis zaten dogrulanmis: +" + f(BigInt(s.varis), 10) + " ETH");
  }

  /* ---- 3. buy the share ------------------------------------------------ */
  log("");
  log("[3] alim: ETH -> " + HISSE + "  (Uniswap v4, Robinhood Chain)");
  const stokOnce = BigInt(await rpc(RHC_RPC, "eth_call", [{
    to: h.stock, data: ERC.encodeFunctionData("balanceOf", [cuzdan.address])
  }, "latest"]));

  if (s.alimTx) {
    log("    zaten yapilmis: " + s.alimTx);
  } else {
    const simdiEth = BigInt(await rpc(RHC_RPC, "eth_getBalance", [cuzdan.address, "latest"]));

    /* What this run bridged, not what the wallet holds. The float on this
       chain belongs to the next run, and an operator that spends it without
       being asked cannot be reconciled against anything. */
    const geldiEth = s.varis ? BigInt(s.varis) : 0n;
    let harcanacak;
    if (HEPSI || geldiEth === 0n) {
      harcanacak = simdiEth > GAS_PAYI ? simdiEth - GAS_PAYI : 0n;
      log("    elde " + f(simdiEth, 10) + " ETH, gas icin " + f(GAS_PAYI, 8) + " ayrilip " +
        f(harcanacak, 10) + " harcanacak" + (HEPSI ? "   (--hepsi)" : "   (koprudan gelen bilinmiyor)"));
    } else {
      harcanacak = geldiEth;
      if (simdiEth < harcanacak + GAS_PAYI) {
        /* Not enough to cover the gas on top of it; trim rather than fail,
           because the alternative is a stranded half-finished run. */
        harcanacak = simdiEth > GAS_PAYI ? simdiEth - GAS_PAYI : 0n;
        log("    not: gas payi icin kisildi");
      }
      log("    bu kosuda koprulenen " + f(geldiEth, 10) + " ETH harcanacak" +
        "   (cuzdanda toplam " + f(simdiEth, 10) + ", kalani sonraki kosuya)");
    }
    if (harcanacak <= 0n) { log("    harcanacak ETH yok (gas payi " + f(GAS_PAYI, 8) + ")"); process.exit(1); }

    const key = [SIFIR, getAddress(h.stock), anahtar.fee, anahtar.spacing, SIFIR];

    /* Simulate first, then demand 99% of it. A swap that silently fills
     * far worse than the quote is the one thing a router must not do. */
    const sim = await rpc(RHC_RPC, "eth_call", [{
      from: cuzdan.address, to: ROUTER_RHC,
      data: ROUTER.encodeFunctionData("swap", [key, true, harcanacak, 0]),
      value: "0x" + harcanacak.toString(16), gas: "0x1000000"
    }, "latest"]);
    const beklenenTok = ROUTER.decodeFunctionResult("swap", sim)[0];
    const asgari = (beklenenTok * 99n) / 100n;
    log("    simulasyon: " + f(beklenenTok, 10) + " " + HISSE + "   asgari " + f(asgari, 10));

    if (!UYGULA) { log("    (kuru calisma: gonderilmedi)"); }
    else {
      const r = await gonder(RHC_RPC, RHC_ID, cuzdan, {
        to: ROUTER_RHC,
        data: ROUTER.encodeFunctionData("swap", [key, true, harcanacak, asgari]),
        value: harcanacak
      }, "alim");
      s.alimTx = r.hash;
      durumYaz(d);
    }
  }

  const stokSonra = BigInt(await rpc(RHC_RPC, "eth_call", [{
    to: h.stock, data: ERC.encodeFunctionData("balanceOf", [cuzdan.address])
  }, "latest"]));
  const alinan = stokSonra > stokOnce ? stokSonra - stokOnce : stokSonra;
  log("    elimizdeki " + HISSE + ": " + f(stokSonra, 10));

  if (!UYGULA) { log("\n  kuru calisma bitti — --uygula ile gercekten calisir"); return; }
  if (stokSonra === 0n) { log("    hisse alinamadi"); process.exit(1); }

  /* ---- 4. lock it ------------------------------------------------------ */
  log("");
  log("[4] kilit: " + HISSE + " -> kasa  (Robinhood Chain)");
  if (s.kilitTx) {
    log("    zaten yapilmis: " + s.kilitTx);
  } else {
    const izin = BigInt(await rpc(RHC_RPC, "eth_call", [{
      to: h.stock, data: ERC.encodeFunctionData("allowance", [cuzdan.address, h.vault])
    }, "latest"]));
    if (izin < stokSonra) {
      await gonder(RHC_RPC, RHC_ID, cuzdan, {
        to: getAddress(h.stock),
        data: ERC.encodeFunctionData("approve", [h.vault, (2n ** 256n - 1n)])
      }, "kasa onayi");
    }
    /* Before, so the lock's own shares can be told apart from everything
       already in the vault. Minting the total instead is how the wrapper
       came to exceed its backing by exactly one earlier run. */
    const payOnce = BigInt(await rpc(RHC_RPC, "eth_call", [{
      to: h.vault, data: VAULT.encodeFunctionData("totalShares")
    }, "latest"]));

    const r = await gonder(RHC_RPC, RHC_ID, cuzdan, {
      to: getAddress(h.vault),
      data: VAULT.encodeFunctionData("lock", [stokSonra, cuzdan.address])
    }, "kilit");
    s.kilitTx = r.hash;

    const paySonra = BigInt(await rpc(RHC_RPC, "eth_call", [{
      to: h.vault, data: VAULT.encodeFunctionData("totalShares")
    }, "latest"]));
    s.payArtisi = (paySonra - payOnce).toString();
    durumYaz(d);
  }

  const toplamPay = BigInt(await rpc(RHC_RPC, "eth_call", [{
    to: h.vault, data: VAULT.encodeFunctionData("totalShares")
  }, "latest"]));

  /* What this run is entitled to mint. Recorded at lock time so a resumed
     run uses the same figure rather than whatever the vault holds later. */
  const paylar = s.payArtisi ? BigInt(s.payArtisi) : toplamPay;
  const kasaBak = BigInt(await rpc(RHC_RPC, "eth_call", [{
    to: h.vault, data: VAULT.encodeFunctionData("balance")
  }, "latest"]));
  log("    kasadaki hisse " + f(kasaBak, 10) + "   toplam pay " + f(toplamPay, 10) +
    "   bu kilidin payi " + f(paylar, 10));

  /* ---- 5. mint the wrapper on Arc -------------------------------------- */
  log("");
  log("[5] basim: sarmal " + HISSE + "  (Arc)");
  const lockId = s.kilitTx;
  const kullanildi = await rpc(ARC_RPC, "eth_call", [{
    to: h.wrapped, data: WRAP.encodeFunctionData("usedLockId", [lockId])
  }, "latest"]);
  if (BigInt(kullanildi) !== 0n) {
    log("    bu kilit zaten basilmis");
  } else {
    /* Checked before sending, not reported after. The wrapper must never
       exceed the shares backing it, and the version of this that only
       looked afterwards let exactly that happen — it minted the vault's
       running total instead of one lock's shares, and unwinding it needed
       a burn. */
    const arzOnce = BigInt(await rpc(ARC_RPC, "eth_call", [{
      to: h.wrapped, data: WRAP.encodeFunctionData("totalSupply")
    }, "latest"]));
    if (arzOnce + paylar > toplamPay) {
      log("    DURDURULDU: bu basim arzi teminatin ustune cikarirdi");
      log("      su anki arz  " + f(arzOnce, 18));
      log("      basilacak    " + f(paylar, 18));
      log("      kasa paylari " + f(toplamPay, 18));
      process.exit(1);
    }
    await gonder(ARC_RPC, ARC_ID, cuzdan, {
      to: getAddress(h.wrapped),
      data: WRAP.encodeFunctionData("mint", [lockId, cuzdan.address, paylar])
    }, "basim");
    s.basimTamam = true;
    durumYaz(d);
  }

  /* ---- 6. the two sides must agree ------------------------------------- */
  const arz = BigInt(await rpc(ARC_RPC, "eth_call", [{
    to: h.wrapped, data: WRAP.encodeFunctionData("totalSupply")
  }, "latest"]));
  const bende = BigInt(await rpc(ARC_RPC, "eth_call", [{
    to: h.wrapped, data: ERC.encodeFunctionData("balanceOf", [cuzdan.address])
  }, "latest"]));

  log("");
  log("SONUC");
  log("  harcanan USDC        " + USDC);
  log("  alinan " + HISSE.padEnd(14) + f(alinan, 10));
  log("  kasada kilitli       " + f(kasaBak, 10) + " " + HISSE + "   (Robinhood Chain)");
  log("  Arc'ta w" + HISSE + " arzi" + "".padEnd(Math.max(0, 9 - HISSE.length)) + f(arz, 10));
  log("  bizde                " + f(bende, 10) + " w" + HISSE);
  /* The wrapper's whole supply against the vault's whole shares — not this
     run's slice. A run that balanced on its own while the totals drifted
     would be the same bug wearing a tick. */
  const tutuyor = arz === toplamPay;
  log("  iki taraf tutuyor mu " + (tutuyor ? "EVET" : "HAYIR — arz " + arz + " vs pay " + toplamPay));
  if (!tutuyor) process.exit(1);
  log("");
  log("  teminat uretildi. bu w" + HISSE + " bir launch'a teminat olabilir.");
})().catch((e) => { console.log("\nHATA: " + String(e && e.message).slice(0, 240)); process.exit(1); });
