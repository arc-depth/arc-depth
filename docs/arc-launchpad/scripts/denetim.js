"use strict";
/* ===========================================================================
 * denetim.js — compare the two sides of the bridge
 *
 *   node scripts/denetim.js <vaultAddress> <wrappedAddress>
 *
 * WHY THIS SCRIPT IS PART OF THE PRODUCT
 *   The bridge has a relayer, and the relayer is trusted. Arc has no general
 *   message bridge yet — LayerZero and CCIP are both absent, checked on
 *   chain — so nothing on Arc can verify that stock was really locked on
 *   Robinhood Chain before the wrapped claim was minted.
 *
 *   What CAN be done is to make the discrepancy cheap to see. Both numbers
 *   are public: the vault's share count on one chain, the wrapped supply on
 *   the other. They must be equal. If they are not, either the relayer
 *   minted claims with nothing behind them or it failed to release against a
 *   burn — and either way it is visible to anyone who runs this.
 *
 *   Trust is not removed by writing a comparison script. It is made cheap to
 *   audit, which is a smaller claim and a true one. Anyone can run this, on
 *   any schedule, against public endpoints, with no permission.
 *
 * WHAT IT CHECKS
 *   1. wrapped supply == vault shares               (nothing minted spare)
 *   2. minted - burned == supply                    (internal consistency)
 *   3. shares * sharePrice == stock actually held   (the vault is solvent)
 * =========================================================================== */

const https = require("https");
const { Interface } = require("ethers");

const ARC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const RHC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";

const vaultAbi = new Interface([
  "function totalShares() view returns (uint256)",
  "function balance() view returns (uint256)",
  "function sharePrice() view returns (uint256)",
  "function stock() view returns (address)"
]);
const wrappedAbi = new Interface([
  "function totalSupply() view returns (uint256)",
  "function mintedTotal() view returns (uint256)",
  "function burnedTotal() view returns (uint256)",
  "function symbol() view returns (string)"
]);

function rpc(url, method, params) {
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
        try {
          const j = JSON.parse(b);
          if (j.error) return rej(new Error(j.error.message || "rpc"));
          res(j.result);
        } catch (e) { rej(new Error("HTTP " + s.statusCode)); }
      });
    });
    r.on("error", rej);
    r.setTimeout(25000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}

/* A rate limit is not a discrepancy. Reporting one as a failed audit would
 * be the worst possible false alarm for a script whose whole job is to be
 * believed when it says something is wrong. */
async function call(url, to, iface, fn, args) {
  let wait = 1000;
  for (let i = 0; ; i++) {
    try {
      const out = await rpc(url, "eth_call", [{ to, data: iface.encodeFunctionData(fn, args || []) }, "latest"]);
      return iface.decodeFunctionResult(fn, out)[0];
    } catch (e) {
      if (!/rate limit|429|503|timeout/i.test(String(e.message)) || i >= 5) throw e;
      await new Promise((r) => setTimeout(r, wait));
      wait = Math.min(wait * 2, 12000);
    }
  }
}

const f18 = (x) => (Number(BigInt(x)) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 6 });

(async function main() {
  const vault = process.argv[2];
  const wrapped = process.argv[3];
  if (!vault || !wrapped) {
    console.log("kullanim: node scripts/denetim.js <vaultAddress> <wrappedAddress>");
    console.log("");
    console.log("vault    Robinhood Chain uzerindeki StockVault");
    console.log("wrapped  Arc uzerindeki WrappedStock");
    process.exit(1);
  }

  console.log("KOPRU DENETIMI");
  console.log("  kasa (Robinhood Chain) " + vault);
  console.log("  sarmal (Arc)           " + wrapped);
  console.log("");

  const [shares, bal, price, supply, minted, burned, sym] = await Promise.all([
    call(RHC, vault, vaultAbi, "totalShares"),
    call(RHC, vault, vaultAbi, "balance"),
    call(RHC, vault, vaultAbi, "sharePrice"),
    call(ARC, wrapped, wrappedAbi, "totalSupply"),
    call(ARC, wrapped, wrappedAbi, "mintedTotal"),
    call(ARC, wrapped, wrappedAbi, "burnedTotal"),
    call(ARC, wrapped, wrappedAbi, "symbol")
  ]);

  const S = BigInt(shares), B = BigInt(bal), P = BigInt(price);
  const T = BigInt(supply), M = BigInt(minted), Y = BigInt(burned);

  console.log("  " + sym);
  console.log("  kasadaki hisse      " + f18(B));
  console.log("  kasa paylari        " + f18(S));
  console.log("  pay fiyati          " + f18(P));
  console.log("  sarmal arz          " + f18(T));
  console.log("  basilan / yakilan   " + f18(M) + " / " + f18(Y));
  console.log("");

  let hata = 0;
  const kontrol = (ok, ad, not) => {
    console.log("  " + (ok ? "TAMAM " : "UYUMSUZ ") + ad + (not ? "   " + not : ""));
    if (!ok) hata++;
  };

  kontrol(T === S, "sarmal arz = kasa paylari",
    T === S ? f18(T) : f18(T) + " vs " + f18(S) + "   FARK " + f18(T > S ? T - S : S - T));
  kontrol(M - Y === T, "basilan - yakilan = arz", f18(M - Y));

  const beklenen = (S * P) / 10n ** 18n;
  const sapma = B > beklenen ? B - beklenen : beklenen - B;
  kontrol(sapma <= S / 10n ** 12n + 1n, "paylar kasadaki hisseyi karsiliyor",
    f18(beklenen) + " ~ " + f18(B));

  console.log("");
  if (hata) {
    console.log(hata + " UYUMSUZLUK. Sarmal arz kasadaki teminattan fazlaysa,");
    console.log("relayer karsiligi olmayan pay basmis demektir.");
    process.exit(1);
  }
  console.log("iki taraf birbirini tutuyor.");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
