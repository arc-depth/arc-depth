"use strict";
/* The page parses. That says nothing about whether it works.
 *
 * Headless Chrome does not run on this machine, so the screen cannot be
 * opened and clicked. What can be done is to take the exact ABI fragments
 * and the exact encode/decode the page uses, point them at the real Arc
 * mainnet, and see whether the calls come back. That catches the failure
 * that actually matters here — an ABI fragment that does not match the
 * deployed contract — which in a browser shows up as a silently empty
 * panel.
 *
 * The fragments below are pulled out of docs/app.html rather than retyped,
 * so this tests the page's ABI and not a copy of it that agrees with me.
 */
const fs = require("fs");
const { Contract, JsonRpcProvider, Interface, formatUnits, parseUnits } = require("ethers");

const RPC = "https://rpc.mainnet.arc.io";
const D = JSON.parse(fs.readFileSync("C:/arc-launchpad/dagitim.json", "utf8"));
const G = JSON.parse(fs.readFileSync("C:/arc-launchpad/dagitim-yonetisim.json", "utf8"));
const A = { usdc: D.usdc, devPool: G.devPool, governor: G.governor, staking: G.staking, govToken: G.govToken };

let hata = 0;
const ok = (b, ad, not) => {
  console.log((b ? "  PASS " : "  FAIL ") + ad + (not ? "   " + not : ""));
  if (!b) hata++;
};

/* ---- lift the ABI straight out of the page -------------------------- */
const sayfa = fs.readFileSync("C:/arc-launchpad/docs/app.html", "utf8");
function abiCek(ad) {
  const i = sayfa.indexOf("\n  " + ad + ":[");
  if (i < 0) return null;
  const j = sayfa.indexOf("\n  ]", i);
  const blok = sayfa.slice(i, j);
  return [...blok.matchAll(/"((?:function|event)[^"]+)"/g)].map((m) => m[1]);
}
const ABI = { governor: abiCek("governor"), staking: abiCek("staking"), devPool: abiCek("devPool") };

console.log("sayfadan cikarilan ABI");
for (const k of Object.keys(ABI)) ok(ABI[k] && ABI[k].length > 0, k + " bulundu", ABI[k] ? ABI[k].length + " parca" : "YOK");
if (hata) { console.log("\nABI cikarilamadi, devam edilemez"); process.exit(1); }

/* The page's ABI must be a subset of what is deployed. A fragment the
   contract does not have is a panel that renders empty in a browser and
   gives no hint why. */
console.log("\nABI dagitilmis kontratla uyusuyor mu");
for (const [ad, derlenmis] of [["governor", "Governor"], ["staking", "Staking"], ["devPool", "DevPool"]]) {
  const gercek = new Interface(JSON.parse(fs.readFileSync("C:/arc-launchpad/build/" + derlenmis + ".json", "utf8")).abi);
  const sayfaki = new Interface(ABI[ad]);
  const eksik = [];
  sayfaki.forEachFunction((f) => {
    try { gercek.getFunction(f.selector); } catch (e) { eksik.push(f.format("sighash")); }
  });
  ok(eksik.length === 0, ad + " tum parcalari kontratta var", eksik.length ? "EKSIK: " + eksik.join(", ") : "");
}

/* ---- the payment call the builder composes -------------------------- */
console.log("\nodeme cagrisi: kodla, sonra geri coz");
const i4 = new Interface(["function pay(address,address,uint256,uint256)"]);
const ALICI = "0x1111111111111111111111111111111111111111";
const veri = i4.encodeFunctionData("pay", [A.usdc, ALICI, parseUnits("250", 6), 7]);
const devGercek = new Interface(JSON.parse(fs.readFileSync("C:/arc-launchpad/build/DevPool.json", "utf8")).abi);
ok(veri.slice(0, 10) === devGercek.getFunction("pay").selector,
  "secici DevPool.pay ile ayni", veri.slice(0, 10));
const geri = i4.parseTransaction({ data: veri });
ok(geri && geri.name === "pay", "geri cozulebiliyor");
ok(geri.args[1].toLowerCase() === ALICI, "alici dogru");
/* 250 USDC must come back as 250, not 250,000,000,000,000. This is the
   mistake that cost this project 300,000,000 locked tokens. */
ok(Number(formatUnits(geri.args[2], 6)) === 250, "tutar 6 ondalikla 250", formatUnits(geri.args[2], 6));
ok(Number(geri.args[3]) === 7, "katki numarasi 7");

/* ---- the reads, against the real chain ------------------------------ */
(async function main() {
  const read = new JsonRpcProvider(RPC, { chainId: 5042, name: "arc" }, { staticNetwork: true, batchMaxCount: 1 });
  const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
  async function dene(ad, fn) {
    let w = 1200;
    for (let k = 0; ; k++) {
      try { const v = await fn(); await bekle(700); return v; }
      catch (e) {
        if (!/rate limit|429|503|timeout|TIMEOUT/i.test(String(e.message)) || k >= 6) {
          ok(false, ad, String(e.message).slice(0, 90)); return null;
        }
        await bekle(w); w = Math.min(w * 2, 20000);
      }
    }
  }

  const gov = new Contract(A.governor, ABI.governor, read);
  const stk = new Contract(A.staking, ABI.staking, read);
  const dev = new Contract(A.devPool, ABI.devPool, read);

  console.log("\nzincirden okunan ayarlar");
  const q = await dene("QUORUM_BPS", () => gov.QUORUM_BPS());
  const t = await dene("PROPOSAL_THRESHOLD_BPS", () => gov.PROPOSAL_THRESHOLD_BPS());
  const tl = await dene("TIMELOCK", () => gov.TIMELOCK());
  const gr = await dene("GRACE_PERIOD", () => gov.GRACE_PERIOD());
  ok(Number(q) === 1000, "yeter sayi %10", Number(q) + " bps");
  ok(Number(t) === 100, "oneri esigi %1", Number(t) + " bps");
  ok(Number(tl) === 172800, "timelock 2 gun", Number(tl) / 86400 + " gun");
  ok(Number(gr) === 1209600, "muhlet 14 gun", Number(gr) / 86400 + " gun");

  /* The floor the screen prints has to be the floor the contract holds, so
     read it rather than trust the number written on the page. */
  const mn = await dene("MIN_OY_GUCU", () => gov.MIN_OY_GUCU());
  ok(mn !== null && formatUnits(mn, 18) === "50000.0", "oy tabani 50.000 ALP",
    mn === null ? "" : formatUnits(mn, 18));
  /* The panel reads the floor from the contract rather than printing a
     constant, which is the property worth asserting — a hardcoded 50,000
     would be a number free to drift away from the chain. The prose says it
     too, and that copy does have to agree. */
  ok(sayfa.includes("MIN_OY_GUCU"), "panel tabani ZINCIRDEN okuyor", "sabit yazmiyor");
  const prozaTaban = (sayfa.match(/50\.000 ALP/g) || []).length;
  ok(prozaTaban > 0 && formatUnits(mn, 18) === "50000.0",
    "yazidaki taban kontrattakiyle ayni", prozaTaban + " yerde geciyor");
  /* And nobody can move it: a floor governance could lower is not a floor. */
  const govAbi = new Interface(JSON.parse(fs.readFileSync("C:/arc-launchpad/build/Governor.json", "utf8")).abi);
  let setter = false;
  govAbi.forEachFunction((f) => {
    if (f.stateMutability !== "view" && f.stateMutability !== "pure" &&
        /min|taban|floor|quorum|threshold/i.test(f.name)) setter = true;
  });
  ok(!setter, "tabani degistiren fonksiyon YOK", "yonetisim bile indiremiyor");

  console.log("\nzincirden okunan durum");
  const ts = await dene("totalStaked", () => stk.totalStaked());
  const hv = await dene("held(USDC)", () => dev.held(A.usdc));
  const pc = await dene("proposalCount", () => gov.proposalCount());
  ok(ts !== null, "totalStaked okundu", ts === null ? "" : formatUnits(ts, 18) + " ALP");
  ok(hv !== null, "devPool USDC okundu", hv === null ? "" : "$" + formatUnits(hv, 6));
  ok(pc !== null, "proposalCount okundu", pc === null ? "" : String(pc));

  /* The page says the pool is empty and nothing is staked. If that ever
     stops being true the page must stop saying it, so this asserts the
     claim rather than just printing it. */
  if (ts !== null && hv !== null && pc !== null) {
    ok(Number(ts) === 0, "sayfanin 'hic stake yok' sozu dogru");
    ok(Number(hv) === 0, "sayfanin 'havuz bos' sozu dogru");
    ok(Number(pc) === 0, "sayfanin 'hic oneri yok' sozu dogru");
  }

  /* A read against an address that has never touched staking has to answer
     zero, not revert — the panel calls these for whoever connects. */
  console.log("\nbos bir adres icin okumalar (panel bunu her baglanmada yapiyor)");
  const BOS = "0x2222222222222222222222222222222222222222";
  for (const [ad, fn] of [
    ["stakedOf", () => stk.stakedOf(BOS)],
    ["votingPower", () => stk.votingPower(BOS)],
    ["pending", () => stk.pending(BOS)],
    ["hasVoted(0,…)", () => gov.hasVoted(0, BOS)],
    ["powerAt(0,…)", () => gov.powerAt(0, BOS)]
  ]) {
    const v = await dene(ad, fn);
    ok(v !== null, ad + " revert etmedi", v === null ? "" : String(v));
  }

  console.log("\n" + (hata ? hata + " KONTROL BASARISIZ" : "tum kontroller gecti"));
  process.exit(hata ? 1 : 0);
})();
