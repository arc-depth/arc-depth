"use strict";
/* The registry's refusals, not just its admissions.
 *
 * A registry that accepted everything would pass a test that only tried
 * valid assets, so every gate is driven from the failing side: no code, no
 * adapter for the chain, a duplicate, a remote asset nobody can price, and
 * a real oracle handed the wrong asset — which is the dangerous one,
 * because the adapter exists and only the mapping is missing.
 */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000Ec";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

const USDC = "0x3600000000000000000000000000000000000000";
const CIRBTC = "0x171a4217b86a807a64eb94757db6849fb4bdbaa0";
const WETH = "0x128cc466b61f542da60c70e3aa11c10e19b84edb";
const BTC_FEED = "0xa109B535C70C8Be9995be64Bb6751AcDB27e03De";
const ETH_FEED = "0x50FCDD99D6762D1C170DC6A9111db944AEE6D364";
const KODSUZ = "0x00000000000000000000000000000000000000AB";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) });
      const j = await r.json();
      if (j.error) { const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } catch (e) {
      if (k >= 6 || !/rate|limit|429|timeout|ECONN|fetch/i.test(String(e.message))) throw e;
      await new Promise((r2) => setTimeout(r2, b)); b = Math.min(b * 2, 20000);
    }
  }
}

const T = B("TestVarlikKayit");
const iface = new Interface(T.abi);

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("VARLIK KAYDI — GERCEK Arc, gercek Chainlink besleyicileri");
  console.log("");
  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x3000000",
      data: iface.encodeFunctionData("run", [USDC, CIRBTC, WETH, BTC_FEED, ETH_FEED, KODSUZ]) },
    "latest", { [H]: { code: T.deployedBytecode } }
  ]);
  const [s] = iface.decodeFunctionResult("run", r);

  console.log("  KABUL EDILENLER");
  ok(s.cirbtcKayitli === true, "cirBTC kaydedildi", "oracle'i var");
  ok(Number(s.cirbtcOndalik) === 8, "ondalik ZINCIRDEN okundu", Number(s.cirbtcOndalik) + " (cirBTC 8)");
  ok(s.cirbtcCevrilebilir === true, "cirBTC DONUSUM HEDEFI olabilir", "degerlenebiliyor");
  ok(s.oraclesizKayitli === true, "ORACLE'SIZ varlik da kaydedildi", "tutulabilir");
  ok(s.oraclesizCevrilebilir === false,
     "ORACLE'SIZ varlik DONUSUM HEDEFI OLAMAZ",
     "tutulur ama degeri SIFIR sayilir — tabani sisirmiyor");
  ok(BigInt(s.toplamKayit) === 2n, "iki kayit var", String(s.toplamKayit));

  console.log("");
  console.log("  REDDEDILENLER — bunlar gecerse kayit hicbir sey korumuyor");
  ok(s.kodsuzRed === true, "KODU OLMAYAN adres reddedildi");
  ok(s.desteksizZincirRed === true, "ADAPTORU OLMAYAN ZINCIR reddedildi",
     "yeni zincir kod gerektirir, izinsiz degil");
  ok(s.mukerrerRed === true, "MUKERRER kayit reddedildi");
  ok(s.uzakOraclesizRed === true, "UZAK + ORACLE'SIZ reddedildi",
     "Arc o zinciri okuyamaz, fiyatlayamazsa dogrulayacak sey kalmaz");
  ok(s.yanlisOracleRed === true, "GERCEK ORACLE + YANLIS VARLIK reddedildi",
     "en tehlikeli hal: adaptor var, eslesme yok");

  console.log("");
  console.log("  kayit  " + s.kayit);
  console.log("  oracle " + s.oracle);
  console.log("");
  console.log(kotu === 0 ? "  GECTI — kapilar hem geciriyor hem REDDEDIYOR."
                         : "  BASARISIZ — " + kotu + " sorun.");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.log("HATA: " + e.message); if (e.data) console.log("data: " + String(e.data).slice(0, 200)); process.exit(1); });
