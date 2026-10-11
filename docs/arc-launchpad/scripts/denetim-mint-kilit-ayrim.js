"use strict";
/* The collateral audit flagged one mint whose lock does not match it, and
 * matching-or-not is too coarse an answer for something this size. This
 * opens the source transaction and prints every Locked event in it, plus
 * the vault's release history, so the discrepancy can be named rather
 * than guessed at.
 *
 * Read-only on both chains.
 */
const https = require("https");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const { id: keccakId, AbiCoder, getAddress } = require("ethers");

const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const AYAR = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
const SEMBOL = (process.argv[2] || "NVDA").toUpperCase();
const H = AYAR.hisseler[SEMBOL];

const LOCKED = keccakId("Locked(address,address,uint256,uint256)");
const RELEASED = keccakId("Released(bytes32,address,uint256,uint256)");
const coder = AbiCoder.defaultAbiCoder();
const sel = (imza) => keccakId(imza).slice(0, 10);

/* The two lock ids the Arc mints named. */
const KIMLIKLER = process.argv.slice(3).length ? process.argv.slice(3) : [
  "0xdd4478ba9b348698c6cf725b5171a5a9a25997128ca55574b58d68b50f7a0c1d",
  "0x2872a7fdf04d6d396742ff12507c08fd003657117e631616d078cae06ab7cfde"
];

let cagri = 0;
function rpc(url, yontem, parametreler) {
  cagri++;
  const u = new URL(url);
  const govde = JSON.stringify({ jsonrpc: "2.0", id: cagri, method: yontem, params: parametreler });
  return new Promise((coz) => {
    const istek = https.request({
      hostname: u.hostname, path: u.pathname || "/", method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(govde) }
    }, (y) => {
      let v = "";
      y.on("data", (p) => (v += p));
      y.on("end", () => {
        try {
          const c = JSON.parse(v);
          if (c.error) return coz({ hata: c.error.message });
          coz({ sonuc: c.result });
        } catch (e) { coz({ hata: "cozulemeyen yanit" }); }
      });
    });
    istek.on("error", (e) => coz({ hata: e.message }));
    istek.write(govde);
    istek.end();
  });
}
const ond = (x, b) => {
  const d = 10n ** BigInt(b);
  return (x / d) + "." + (x % d).toString().padStart(b, "0");
};

(async function () {
  console.log("");
  console.log("KAYNAK ISLEMLERDEKI KILITLERIN TAMAMI   " + SEMBOL);
  console.log("  kasa " + H.vault);
  console.log("");

  let toplamKilit = 0n;
  for (const kimlik of KIMLIKLER) {
    const mk = await rpc(RHC_RPC, "eth_getTransactionReceipt", [kimlik]);
    console.log("  lockId " + kimlik);
    if (mk.hata || !mk.sonuc) { console.log("    islem yok: " + (mk.hata || "-")); continue; }
    const r = mk.sonuc;
    console.log("    blok " + parseInt(r.blockNumber, 16) + "   status " + r.status +
      "   gonderen " + r.from);
    const kilitler = (r.logs || []).filter((l) =>
      l.topics[0] === LOCKED && l.address.toLowerCase() === H.vault.toLowerCase());
    console.log("    kasadan " + kilitler.length + " Locked olayi");
    for (const l of kilitler) {
      const k = l.data.slice(2);
      const miktar = BigInt("0x" + k.slice(0, 64));
      const hisse = BigInt("0x" + k.slice(64, 128));
      toplamKilit += hisse;
      console.log("      logIndex " + parseInt(l.logIndex, 16) +
        "   kilitleyen " + getAddress("0x" + l.topics[1].slice(26)));
      console.log("        arc alicisi " + getAddress("0x" + l.topics[2].slice(26)));
      console.log("        amount      " + ond(miktar, 18));
      console.log("        shares      " + ond(hisse, 18));
    }
    /* Everything else the vault emitted in this transaction, in case the
       lock is not the only thing that happened. */
    const digerleri = (r.logs || []).filter((l) =>
      l.address.toLowerCase() === H.vault.toLowerCase() && l.topics[0] !== LOCKED);
    for (const l of digerleri)
      console.log("      kasadan baska olay, topic0 " + l.topics[0]);
    console.log("");
  }

  console.log("  KILITLENEN TOPLAM   " + ond(toplamKilit, 18) + " hisse");

  /* Did anything ever come back out? A burn on Arc with no release here
     means somebody's shares were destroyed for nothing. */
  console.log("");
  console.log("KASADAN HIC CIKIS OLDU MU (Released)");
  const bas = BigInt(H.vaultStartBlock);
  const sn = await rpc(RHC_RPC, "eth_blockNumber", []);
  if (sn.hata) { console.log("  blok numarasi alinamadi: " + sn.hata); }
  else {
    const son = BigInt(sn.sonuc);
    let alt = bas, bulunan = 0, taranamayan = 0, tarananBlok = 0n;
    const PENCERE = 2000n;
    for (let t = 0; t < 400 && alt <= son; t++) {
      const ust = (alt + PENCERE > son) ? son : alt + PENCERE;
      const c = await rpc(RHC_RPC, "eth_getLogs", [{
        address: H.vault, topics: [RELEASED],
        fromBlock: "0x" + alt.toString(16), toBlock: "0x" + ust.toString(16)
      }]);
      if (c.hata) taranamayan++;
      else {
        tarananBlok += (ust - alt + 1n);
        for (const l of c.sonuc) {
          bulunan++;
          const k = l.data.slice(2);
          console.log("  Released  burnId " + l.topics[1]);
          console.log("            alici  " + getAddress("0x" + l.topics[2].slice(26)));
          console.log("            shares " + ond(BigInt("0x" + k.slice(0, 64)), 18));
          console.log("            tx     " + l.transactionHash);
        }
      }
      alt = ust + 1n;
    }
    console.log("  taranan " + tarananBlok + " blok, taranamayan " + taranamayan + " pencere");
    if (!bulunan) {
      console.log("  HIC Released YOK.");
      if (taranamayan) console.log("  (taranamayan pencereler var, kesin konusmuyorum)");
    }
  }

  /* And what the vault holds now, against what was locked. */
  console.log("");
  const bk = await rpc(RHC_RPC, "eth_call", [{ to: H.stock,
    data: sel("balanceOf(address)") + coder.encode(["address"], [H.vault]).slice(2) }, "latest"]);
  if (!bk.hata) {
    const bakiye = BigInt(bk.sonuc);
    console.log("  KASADAKI BAKIYE     " + ond(bakiye, 18));
    console.log("  KILITLENEN TOPLAM   " + ond(toplamKilit, 18));
    console.log("  fark                " + ond(bakiye - toplamKilit, 18));
  }
  console.log("");
  console.log("  " + cagri + " salt-okunur cagri, hicbir sey gonderilmedi.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
