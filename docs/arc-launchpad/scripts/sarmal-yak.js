"use strict";
/* ===========================================================================
 * sarmal-yak.js — burn wrapped stock on Arc.
 *
 *   node scripts/sarmal-yak.js --hisse NVDA --miktar 0.0127053949
 *   node scripts/sarmal-yak.js --hisse NVDA --fazla        # just the excess
 *   add --uygula to send
 *
 * Burning is the first half of unwrapping: it destroys the wrapper on Arc
 * and emits a burnId that entitles the holder to the matching stock out of
 * the Robinhood Chain vault. Releasing it is a separate, operator-side step
 * — this does not do it, and says so.
 *
 * WHY IT EXISTS TODAY
 *   The operator minted the vault's running total instead of the shares a
 *   single lock produced, so the wrapper's supply ran ahead of its backing
 *   by exactly one earlier run. `--fazla` burns precisely that difference,
 *   which puts the two sides back on 1:1 without touching the vault.
 *
 *   Nothing is lost by it. The tokens being destroyed were never backed;
 *   destroying them is what makes the remaining ones honest.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Wallet, Interface, keccak256, formatUnits, parseUnits, getAddress } = require("ethers");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC_RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const ARC_ID = 5042;
const UYGULA = process.argv.includes("--uygula");

const val = (ad, v) => {
  const i = process.argv.indexOf(ad);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : v;
};
const HISSE = val("--hisse", "NVDA");
const MIKTAR = val("--miktar", null);
const FAZLA = process.argv.includes("--fazla");

const ERC = new Interface([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)"
]);
const WRAP = new Interface([
  "function burn(uint256 shares, address stockRecipient) returns (bytes32 burnId)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)"
]);
const VAULT = new Interface([
  "function totalShares() view returns (uint256)",
  "function balance() view returns (uint256)"
]);

function ham(rpcUrl, method, params) {
  return new Promise((res, rej) => {
    const u = new URL(rpcUrl);
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
async function rpc(u, m, p) {
  let bekle = 2000;
  for (let i = 0; ; i++) {
    try { return await ham(u, m, p); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout/i.test(String(e.message)) || i >= 7) throw e;
      await new Promise((r) => setTimeout(r, bekle));
      bekle = Math.min(bekle * 2, 30000);
    }
  }
}
async function gonder(cuzdan, tx, ad) {
  const imzali = await cuzdan.signTransaction(tx);
  let hash;
  try { hash = await rpc(ARC_RPC, "eth_sendRawTransaction", [imzali]); }
  catch (e) {
    if (!/already known|nonce too low/i.test(String(e.message))) throw e;
    hash = keccak256(imzali);
  }
  console.log("    " + ad + " -> " + hash);
  for (let i = 0; i < 80; i++) {
    let rc = null;
    try { rc = await rpc(ARC_RPC, "eth_getTransactionReceipt", [hash]); } catch (e) { /* keep polling */ }
    if (rc) {
      if (rc.status !== "0x1") throw new Error(ad + " zincirde basarisiz: " + hash);
      console.log("    blok " + parseInt(rc.blockNumber, 16));
      return rc;
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error("makbuz gelmedi: " + hash);
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

(async function main() {
  const A = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "relayer", "ayar.json"), "utf8"));
  const h = (A.hisseler || {})[HISSE];
  if (!h) { console.log(HISSE + " icin kopru ayari yok"); process.exit(1); }

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const cuzdan = new Wallet(pk);

  const oku = async (u, to, ifc, fn, args = []) => {
    const r = await rpc(u, "eth_call", [{ to, data: ifc.encodeFunctionData(fn, args) }, "latest"]);
    return ifc.decodeFunctionResult(fn, r)[0];
  };

  const arz = BigInt(await oku(ARC_RPC, h.wrapped, WRAP, "totalSupply"));
  const bende = BigInt(await oku(ARC_RPC, h.wrapped, WRAP, "balanceOf", [cuzdan.address]));
  const pay = BigInt(await oku(RHC_RPC, h.vault, VAULT, "totalShares"));
  const kasa = BigInt(await oku(RHC_RPC, h.vault, VAULT, "balance"));

  console.log("SARMAL YAKMA  " + HISSE);
  console.log("  sarmal   " + h.wrapped + "   (Arc)");
  console.log("  kasa     " + h.vault + "   (Robinhood Chain)");
  console.log("");
  console.log("  Arc'ta sarmal arzi        " + formatUnits(arz, 18));
  console.log("  kasadaki paylar           " + formatUnits(pay, 18));
  console.log("  kasadaki gercek hisse     " + formatUnits(kasa, 18));
  console.log("  bende                     " + formatUnits(bende, 18));

  const fazla = arz > pay ? arz - pay : 0n;
  console.log("  teminatsiz fazla          " + formatUnits(fazla, 18) +
    (fazla === 0n ? "   (iki taraf tutuyor)" : "   <- karsiligi yok"));
  console.log("");

  let miktar;
  if (FAZLA) {
    if (fazla === 0n) { console.log("  yakilacak fazla yok."); return; }
    miktar = fazla;
  } else if (MIKTAR) {
    miktar = parseUnits(MIKTAR, 18);
  } else {
    console.log("  --miktar <adet> VEYA --fazla gerekli");
    process.exit(1);
  }

  if (bende < miktar) {
    console.log("  elinde yeterli sarmal yok: " + formatUnits(miktar, 18) + " gerekli, " +
      formatUnits(bende, 18) + " var");
    process.exit(1);
  }

  console.log("  yakilacak                 " + formatUnits(miktar, 18) + " w" + HISSE);
  if (FAZLA) {
    console.log("  not: bu tokenlerin zaten karsiligi yoktu. Yakmak kalanlari");
    console.log("       durust hale getiriyor; kasadaki hisseye dokunmuyor.");
  }
  console.log("");

  /* Where the released stock would go if anyone relayed the burn. For the
     excess there is nothing to release — these tokens had no backing — so
     the recipient is recorded and the release simply is not run. */
  const alici = cuzdan.address;
  const veri = WRAP.encodeFunctionData("burn", [miktar, alici]);

  let g;
  try {
    g = BigInt(await rpc(ARC_RPC, "eth_estimateGas",
      [{ from: cuzdan.address, to: getAddress(h.wrapped), data: veri }]));
  } catch (e) { console.log("  REDDEDILDI: " + e.message); process.exit(1); }
  console.log("  gas " + Number(g).toLocaleString("en-US"));

  if (!UYGULA) {
    console.log("  kuru calisma: hicbir sey gonderilmedi.");
    console.log("  gondermek icin --uygula ekle");
    return;
  }

  const gasPrice = BigInt(await rpc(ARC_RPC, "eth_gasPrice", []));
  const nonce = Number(await rpc(ARC_RPC, "eth_getTransactionCount", [cuzdan.address, "latest"]));
  const makbuz = await gonder(cuzdan, {
    chainId: ARC_ID, nonce, to: getAddress(h.wrapped), data: veri,
    gasLimit: (g * 13n) / 10n, gasPrice, value: 0n
  }, "yakma");

  /* The burnId, out of the event the wrapper emitted. */
  const KONU = keccak256(Buffer.from("Burned(address,address,uint256,bytes32)"));
  let burnId = null;
  for (const l of (makbuz.logs || [])) {
    if ((l.topics || [])[0] === KONU && l.data && l.data.length >= 130) {
      burnId = "0x" + l.data.slice(2).slice(64, 128);
    }
  }
  console.log("    burnId " + (burnId || "okunamadi"));

  /* A repair is not an exit. The relayer releases stock against any burn it
     sees, and against this one there is nothing to release — the tokens had
     no backing. It skips whatever its state file already lists, so this
     writes itself in rather than relying on somebody remembering. */
  if (FAZLA && burnId) {
    const dYol = path.join(__dirname, "..", "relayer", "durum.json");
    try {
      const d = JSON.parse(fs.readFileSync(dYol, "utf8"));
      d.islenen = d.islenen || {};
      d.islenen["release:" + burnId] = "tamirat — karsiligi yoktu, serbest birakilmayacak";
      fs.writeFileSync(dYol, JSON.stringify(d, null, 1));
      console.log("    relayer'a islenmeyecek diye yazildi");
    } catch (e) {
      console.log("    UYARI: relayer/durum.json yazilamadi — " + e.message);
      console.log("    relayer bu yakmayi serbest birakma olarak isleyebilir!");
    }
  }

  const arzSonra = BigInt(await oku(ARC_RPC, h.wrapped, WRAP, "totalSupply"));
  const paySonra = BigInt(await oku(RHC_RPC, h.vault, VAULT, "totalShares"));
  console.log("");
  console.log("SONUC  (zincirden okundu)");
  console.log("  arz        " + formatUnits(arz, 18) + "  ->  " + formatUnits(arzSonra, 18));
  console.log("  paylar     " + formatUnits(paySonra, 18));
  console.log("  tutuyor mu " + (arzSonra === paySonra ? "EVET" : "HAYIR"));
  console.log("");
  console.log("  not: yakma bir cikis hakki (burnId) uretir. Kasadan hisse");
  console.log("       serbest birakmak ayri bir adimdir ve burada yapilmadi.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
