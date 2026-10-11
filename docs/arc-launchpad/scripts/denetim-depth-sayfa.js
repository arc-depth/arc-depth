"use strict";
/* ===========================================================================
 * denetim-depth-sayfa.js — does docs/depth.html actually work against the
 *                          deployed contracts?
 *
 *   node scripts/denetim-depth-sayfa.js
 *
 * Headless Chrome does not run on this machine, so the page cannot be
 * opened and clicked. What can be done is to lift the ABI fragments out of
 * the page — not a copy of them, the page's own text — check each one
 * against the deployed bytecode's ABI, and then call every read the page
 * makes on the live chain.
 *
 * That catches the failure that matters here: a fragment that does not
 * match the contract, which in a browser shows up as a panel that is
 * silently empty with no hint why.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface, Contract, JsonRpcProvider, formatUnits } = require("ethers");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-depth.json"), "utf8"));
const B = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", p + ".json"), "utf8"));
const sayfa = fs.readFileSync(path.join(__dirname, "..", "docs", "depth.html"), "utf8");

let hata = 0;
const ok = (b, ad, not) => {
  console.log((b ? "  PASS " : "  FAIL ") + ad + (not ? "   " + not : ""));
  if (!b) hata++;
};

/* ---- lift the ABI out of the page -------------------------------- */
function abiCek(ad) {
  const i = sayfa.indexOf("\n  " + ad + ":[");
  if (i < 0) return null;
  const j = sayfa.indexOf("\n  ]", i);
  return [...sayfa.slice(i, j).matchAll(/"((?:function|event)[^"]+)"/g)].map((m) => m[1]);
}
const ABI = { erc20: abiCek("erc20"), egri: abiCek("egri"), stake: abiCek("stake") };

console.log("SAYFADAN CIKARILAN ABI");
for (const k of Object.keys(ABI)) {
  ok(ABI[k] && ABI[k].length > 0, k, ABI[k] ? ABI[k].length + " parca" : "YOK");
}
if (hata) { console.log("\nABI cikarilamadi."); process.exit(1); }

console.log("");
console.log("DAGITILMIS KONTRATLA UYUSUYOR MU");
for (const [ad, derlenmis] of [["egri", "Egri"], ["stake", "Stake"], ["erc20", "DepthToken"]]) {
  const gercek = new Interface(B(derlenmis).abi);
  const sayfaki = new Interface(ABI[ad]);
  const eksik = [];
  sayfaki.forEachFunction((f) => {
    try { gercek.getFunction(f.selector); } catch (e) { eksik.push(f.format("sighash")); }
  });
  ok(eksik.length === 0, ad + " tum parcalari kontratta var",
    eksik.length ? "EKSIK: " + eksik.join(", ") : "");
}

(async function main() {
  const read = new JsonRpcProvider(RPC, { chainId: 5042, name: "arc" },
    { staticNetwork: true, batchMaxCount: 1 });
  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  async function dene(ad, fn) {
    let w = 1500;
    for (let k = 0; ; k++) {
      try { const v = await fn(); await bekle(650); return v; }
      catch (e) {
        if (!/rate limit|429|503|timeout|TIMEOUT/i.test(String(e.message)) || k >= 6) {
          ok(false, ad, String(e.message).slice(0, 90)); return null;
        }
        await bekle(w); w = Math.min(w * 2, 20000);
      }
    }
  }

  const e = new Contract(D.egri, ABI.egri, read);
  const s = new Contract(D.stake, ABI.stake, read);
  const t = new Contract(D.token, ABI.erc20, read);
  const u = new Contract(D.usdc, ABI.erc20, read);
  const BOS = "0x2222222222222222222222222222222222222222";

  console.log("");
  console.log("SAYFANIN YAPTIGI HER OKUMA, CANLI ZINCIRDE");
  const x = await dene("egri.x()", () => e.x());
  const y = await dene("egri.y()", () => e.y());
  const toplanan = await dene("egri.toplanan()", () => e.toplanan());
  const esik = await dene("egri.ESIK()", () => e.ESIK());
  const ucret = await dene("egri.UCRET_PPM()", () => e.UCRET_PPM());
  const mezun = await dene("egri.mezun()", () => e.mezun());
  await dene("egri.vergi()", () => e.vergi());
  await dene("egri.alimKotasi()", () => e.alimKotasi(1_000_000n));
  await dene("egri.satisKotasi()", () => e.satisKotasi(10n ** 18n));
  const arz = await dene("token.totalSupply()", () => t.totalSupply());
  await dene("token.balanceOf()", () => t.balanceOf(BOS));
  await dene("usdc.decimals()", () => u.decimals());
  await dene("usdc.balanceOf()", () => u.balanceOf(BOS));
  const toplamStake = await dene("stake.totalStaked()", () => s.totalStaked());
  const taban = await dene("stake.MIN_OY_GUCU()", () => s.MIN_OY_GUCU());
  const kalan = await dene("stake.emisyonKalan()", () => s.emisyonKalan());
  await dene("stake.emisyonDagitilan()", () => s.emisyonDagitilan());
  await dene("stake.stakedOf()", () => s.stakedOf(BOS));
  await dene("stake.pending()", () => s.pending(BOS));
  await dene("stake.pendingToken()", () => s.pendingToken(BOS));
  await dene("stake.oyGucu()", () => s.oyGucu(BOS));

  ok(x !== null && y !== null && toplanan !== null, "egri okumalari dondu");
  ok(kalan !== null && taban !== null, "stake okumalari dondu");

  /* ---- and the numbers the page will print ---------------------- */
  console.log("");
  console.log("SAYFANIN GOSTERECEGI DEGERLER");
  if (x !== null && y !== null && arz !== null) {
    /* The page computes price as a ratio of raw amounts: 6-decimal quote
       over an 18-decimal token. Recomputed here independently. */
    const fiyat = (Number(x) / 1e6) / (Number(y) / 1e18);
    const mcap = fiyat * (Number(arz) / 1e18);
    console.log("    fiyat            $" + fiyat.toExponential(4));
    console.log("    piyasa degeri    $" + Math.round(mcap).toLocaleString("en-US"));
    console.log("    toplanan         $" + (Number(toplanan) / 1e6).toFixed(2) +
      " / $" + (Number(esik) / 1e6).toLocaleString("en-US"));
    console.log("    ilerleme         %" + ((Number(toplanan) / Number(esik)) * 100).toFixed(4));
    console.log("    islem ucreti     %" + (Number(ucret) / 10000).toFixed(2));
    console.log("    mezun mu         " + (mezun ? "EVET" : "hayir"));
    console.log("    toplam stake     " + (Number(toplamStake) / 1e18).toLocaleString("en-US"));
    console.log("    emisyon kalan    " + Math.round(Number(kalan) / 1e18).toLocaleString("en-US"));
    ok(mcap > 1000 && mcap < 1e9, "piyasa degeri makul bir aralikta",
      "10^12 kat kayma olsa burada gorulurdu");
    ok(Number(taban) === 50_000 * 1e18, "oy tabani 50.000");
  }

  console.log("");
  console.log(hata ? hata + " KONTROL BASARISIZ" : "tum kontroller gecti");
  process.exit(hata ? 1 : 0);
})();
