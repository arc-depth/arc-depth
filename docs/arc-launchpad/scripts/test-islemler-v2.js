"use strict";
/* ===========================================================================
 * test-islemler-v2.js — the joint test's trades on PTEST2, from the deployer
 *
 *   node scripts/test-islemler-v2.js <adim> [--uygula]
 *     al       buy $1 on Arc through MerkezKapi.al
 *     sat      sell half of what `al` bought (MerkezKapi.satArc, paid on Arc)
 *     tasi     send 100,000 PTEST2 from Arc to the deployer on Base (the token's adapter)
 *     geri     send them back from Base to Arc (the twin on Base; fee in Base ETH)
 *     itfa     redeem 1,000,000 PTEST2 (SepetUcu.itfa, paid on Arc)
 *     gelir    send the founder's accrued slice (KurucuVekili.ilet; founder on Arc)
 *     kurucu-sat  sell every PTEST2 the deployer holds back into the pool (ends the test, frees the dollars)
 *     durum    balances, pool, basket (read only)
 * Dry by default: each step is simulated (staticCall / estimateGas) and printed.
 * Steps are logged in dagitim-test-launch-v2.json under "islemler".
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, AbiCoder, keccak256, zeroPadValue, solidityPacked } = require("ethers");

const KOK = path.join(__dirname, "..");
const ADIM = process.argv[2];
const UYGULA = process.argv.includes("--uygula");
const V2 = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "sepet-v2.json"), "utf8"));
const KAYIT = path.join(KOK, "dagitim-test-launch-v2.json");
const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
const T = kayit.token;
const USDC = "0x3600000000000000000000000000000000000000";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const ARC_EID = 30417, BASE_EID = 30184, ARC = 26;
const sec = (g) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, g]);
const E18 = 10n ** 18n;
const arc = new JsonRpcProvider("https://arc-rpc.publicnode.com", 5042, { staticNetwork: true });
const base = new JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true });
const anahtar = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
const w = new Wallet(anahtar, arc), wb = new Wallet(anahtar, base);
const ERC = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"];
const OFT = ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
  "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable returns ((bytes32,uint64,(uint256,uint256)),(uint256,uint256))"];
const KAPI = ["function al(address,uint256,uint256,uint32,bytes32,bytes,address) payable returns (uint256)",
  "function satArc(address,uint256,uint256,uint32,bytes32,uint256) returns (uint256)", "function vekilOf(address) view returns (address)"];
const usd = (x) => "$" + (Number(x) / 1e6).toFixed(4);
const tok = (x) => (Number(x) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 });

async function gonder(etiket, c, fn, args, deger = 0n) {
  const r0 = await c[fn].staticCall(...args, { value: deger });
  const gaz = await c[fn].estimateGas(...args, { value: deger });
  if (!UYGULA) { console.log("  (kuru) " + etiket + " simulasyon tamam, gaz " + gaz + (r0 != null && typeof r0 !== "object" ? ", donus " + r0 : "")); return null; }
  const t = await c[fn](...args, { value: deger, gasLimit: (gaz * 13n) / 10n });
  const m = await t.wait();
  if (m.status !== 1) throw new Error(etiket + " geri dondu " + t.hash);
  console.log("  " + etiket + " " + t.hash);
  (kayit.islemler ||= []).push({ adim: etiket, tx: t.hash, zaman: new Date().toISOString() });
  fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1));
  return m;
}
async function onay(c, harcayan, miktar) {
  if ((await c.allowance(c.runner.address, harcayan)) >= miktar) return;
  if (!UYGULA) { console.log("  (kuru) onay gerekecek: " + harcayan); return; }
  const t = await c.approve(harcayan, miktar); await t.wait(); console.log("  onay " + t.hash);
}

async function durum() {
  const egri = await import("file:///" + path.join(KOK, "docs", "js", "egri.js").replace(/\\/g, "/"));
  const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, V2.launchpad, PM, T);
  const o = egri.ozet(st);
  const y = new Contract(YAYICI, ["function ikizAdresi(address) view returns (address)", "function adapterAdresi(address) view returns (address)"], arc);
  const ikiz = await y.ikizAdresi(T);
  const d = new Contract(V2.defter, ["function idOf(uint32,bytes32) view returns (uint64)", "function beklemede(uint64) view returns (uint256)"], arc);
  const id = await d.idOf(ARC, zeroPadValue(T, 32));
  const vekil = await new Contract(V2.kapi, KAPI, arc).vekilOf(T);
  console.log("  havuz: piyasa degeri $" + o.piyasaDegeri.toFixed(0) + ", gercek dolar $" + o.gercekDolar.toFixed(2));
  console.log("  dagitici Arc: " + tok(await new Contract(T, ERC, arc).balanceOf(w.address)) + " PTEST2, " + (Number(await arc.getBalance(w.address)) / 1e18).toFixed(4) + " USDC");
  console.log("  dagitici Base: " + tok(await new Contract(ikiz, ERC, base).balanceOf(w.address)) + " PTEST2, " + (Number(await base.getBalance(w.address)) / 1e18).toFixed(6) + " ETH");
  console.log("  Defter bekleyen: " + usd(await d.beklemede(id)) + "   kurucu vekili " + vekil + " USDC " + usd(await new Contract(USDC, ERC, arc).balanceOf(vekil)));
}

(async () => {
  console.log("TEST ISLEMLERI  " + ADIM + "  " + (UYGULA ? "UYGULA" : "KURU") + "  token " + T);
  const kapi = new Contract(V2.kapi, KAPI, w);
  const t = new Contract(T, ERC, w);
  if (ADIM === "al") {
    const girdi = 1_000_000n;
    const egri = await import("file:///" + path.join(KOK, "docs", "js", "egri.js").replace(/\\/g, "/"));
    const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, V2.launchpad, PM, T);
    const tahmin = egri.alim(st, 1).token;
    const asgari = BigInt(Math.floor(tahmin * 0.97)) * E18;
    console.log("  tahmin " + tahmin.toFixed(0) + " token, asgari %97");
    await onay(new Contract(USDC, ERC, w), V2.kapi, girdi);
    const once = await t.balanceOf(w.address);
    await gonder("al $1", kapi, "al", [T, girdi, asgari, 0, zeroPadValue(w.address, 32), "0x", w.address]);
    if (UYGULA) { kayit.alinan = ((await t.balanceOf(w.address)) - once).toString(); fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); console.log("  alinan " + tok(kayit.alinan)); }
  } else if (ADIM === "sat") {
    const miktar = BigInt(kayit.alinan || "0") / 2n;
    if (!miktar) throw new Error("once: al --uygula");
    await onay(t, V2.kapi, miktar);
    await gonder("sat " + tok(miktar), kapi, "satArc", [T, miktar, 0n, ARC, zeroPadValue(w.address, 32), 0n]);
  } else if (ADIM === "tasi") {
    const adapter = await new Contract(YAYICI, ["function adapterAdresi(address) view returns (address)"], arc).adapterAdresi(T);
    const miktar = 100_000n * E18;
    const p = [BASE_EID, zeroPadValue(w.address, 32), miktar, (miktar * 99n) / 100n, sec(100_000n), "0x", "0x"];
    const a = new Contract(adapter, OFT, w);
    const [ucret] = await a.quoteSend(p, false);
    console.log("  LayerZero ucreti " + (Number(ucret) / 1e18).toFixed(4) + " USDC");
    await onay(t, adapter, miktar);
    await gonder("tasi Arc->Base 100.000", a, "send", [p, [ucret, 0n], w.address], ucret);
  } else if (ADIM === "geri") {
    const ikiz = await new Contract(YAYICI, ["function ikizAdresi(address) view returns (address)"], arc).ikizAdresi(T);
    const b = new Contract(ikiz, [...OFT, ...ERC], wb);
    const miktar = await b.balanceOf(w.address);
    if (!miktar) throw new Error("Base'de PTEST2 yok (once tasi, teslimi bekle)");
    const p = [ARC_EID, zeroPadValue(w.address, 32), miktar, (miktar * 99n) / 100n, sec(100_000n), "0x", "0x"];
    const [ucret] = await b.quoteSend(p, false);
    console.log("  LayerZero ucreti " + (Number(ucret) / 1e18).toFixed(6) + " ETH");
    await gonder("geri Base->Arc " + tok(miktar), b, "send", [p, [ucret, 0n], w.address], ucret);
  } else if (ADIM === "kurucu-sat") {
    const egri = await import("file:///" + path.join(KOK, "docs", "js", "egri.js").replace(/\\/g, "/"));
    const st = await egri.zincirdenDurum({ Contract, AbiCoder, keccak256 }, arc, V2.launchpad, PM, T);
    const miktar = await t.balanceOf(w.address);
    const tahmin = egri.satim(st, Number(miktar) / 1e18, true).dolar;
    const asgari = BigInt(Math.floor(tahmin * 0.97 * 1e6));
    console.log("  " + tok(miktar) + " PTEST2, tahmini net $" + tahmin.toFixed(2) + " (asgari %97)");
    await onay(t, V2.kapi, miktar);
    await gonder("kurucu-sat " + tok(miktar), kapi, "satArc", [T, miktar, asgari, ARC, zeroPadValue(w.address, 32), 0n]);
  } else if (ADIM === "itfa") {
    const miktar = 1_000_000n * E18;
    const u = new Contract(V2.ucu, ["function itfa(address,uint256,uint32,bytes32)"], w);
    await onay(t, V2.ucu, miktar);
    await gonder("itfa 1.000.000", u, "itfa", [T, miktar, ARC, zeroPadValue(w.address, 32)]);
  } else if (ADIM === "gelir") {
    const vekil = await kapi.vekilOf(T);
    const b = await new Contract(USDC, ERC, arc).balanceOf(vekil);
    console.log("  vekilde " + usd(b));
    if (!b) return;
    await gonder("kurucu geliri ilet", new Contract(vekil, ["function ilet(uint256)"], w), "ilet", [0n]);
  } else if (ADIM !== "durum") {
    console.error("adim: al | sat | tasi | geri | itfa | gelir | kurucu-sat | durum"); process.exit(1);
  }
  await durum();
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
