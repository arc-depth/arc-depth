"use strict";
/* ===========================================================================
 * denetim-dao-koprusu.js — the Arc DAO moving Robinhood revenue
 *
 *   node scripts/denetim-dao-koprusu.js
 *
 * contracts/lz/DaoKoprusu.sol: DaoElcisi (Arc) sends a voted, timelocked
 * decision over LayerZero; UzakYurutucu (Robinhood) is the allocator of the
 * unchanged GelistiriciFonu deployed with USDG and performs the call. The
 * harness plays the Governor. Checked: a non-DAO cannot send; a voted grant
 * lands on Robinhood; nobody can grant directly; a forged sender is refused;
 * a grant beyond the fund fails at delivery with nothing half-done; the
 * developer withdraws themselves; ownership burns.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Interface } = require("ethers");

const KOK = path.join(__dirname, "..");
const T = JSON.parse(fs.readFileSync(path.join(KOK, "build", "TestDaoKoprusu.json"), "utf8"));
const I = new Interface(T.abi);
const H = "0x00000000000000000000000000000000000000FB";

function rpc(m, p) {
  return new Promise((r, j) => {
    const b = JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p });
    const q = https.request({ hostname: "rpc.mainnet.arc.io", path: "/", method: "POST",
      headers: { "content-type": "application/json" } }, (s) => {
      let d = ""; s.on("data", (c) => (d += c));
      s.on("end", () => { const x = JSON.parse(d); x.error ? j(new Error(JSON.stringify(x.error))) : r(x.result); });
    });
    q.on("error", j); q.write(b); q.end();
  });
}
let gecti = 0, kaldi = 0;
function ok(k, ad, v) { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (v !== undefined ? "  (" + v + ")" : "")); }

(async () => {
  let out;
  for (let i = 1; ; i++) {
    try { out = await rpc("eth_call", [{ to: H, data: I.encodeFunctionData("run", []), gas: "0x8000000" }, "latest", { [H]: { code: T.deployedBytecode } }]); break; }
    catch (e) { if (!/rate limit/.test(e.message) || i > 6) throw e; await new Promise((r) => setTimeout(r, i * 8000)); }
  }
  const [s] = I.decodeFunctionResult("run", out);
  const u = (x) => (Number(BigInt(x)) / 1e6).toString();

  console.log("DAO KOPRUSU  Arc DAO karari -> LayerZero -> Robinhood fonu");
  ok(s.yabanciGonderemedi, "DAO disindaki adres karar gonderemedi");
  ok(BigInt(s.devBakiye) === 300_000_000n && BigInt(s.dagitilmamis) === 300_000_000n, "oylanan 300 USDG tahsis Robinhood'a ulasti", u(s.devBakiye) + " USDG");
  ok(s.dogrudanTahsisReddedildi, "Robinhood fonunda dogrudan tahsis reddedildi");
  ok(s.sahteGonderenReddedildi, "elci disindan gelen mesaj reddedildi");
  ok(s.fazlaTahsisTeslimiDustu && BigInt(s.fazlaSonrasiBakiye) === 300_000_000n, "fondan buyuk tahsis teslimde dustu, yarim is yok", u(s.fazlaSonrasiBakiye) + " USDG");
  ok(BigInt(s.devTalep) === 100_000_000n, "gelistirici Robinhood'da kendi payini kendisi cekti", u(s.devTalep) + " USDG");
  ok(s.sahipYok, "iki ucta da sahiplik yakildi");
  for (const ad of ["DaoElcisi", "UzakYurutucu"]) {
    const boy = (JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8")).deployedBytecode.length - 2) / 2;
    ok(boy < 24576, ad + " dagitilabilir boyutta", boy + " bayt");
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
