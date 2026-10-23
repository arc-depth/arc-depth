"use strict";
/* ===========================================================================
 * raydium-dok.js — read a Raydium CLMM pool's accounts from mainnet (no
 * transaction) into fixtures/raydium-<ad>.json, all from one slot, for the
 * vault's DEX tests in LiteSVM (tests/sepet_v4.rs).
 *
 *   node raydium-dok.js [pool] [ad]     default: SOL/USDC 3ucNos4N…, "sol-usdc"
 *
 * Takes: the pool, its amm_config, both vaults, the observation ring, the
 * initialized tick arrays from the current tick (up to seven each way), the bitmap extension
 * when it exists, both mints; and the slot's unix time (the tests set the
 * clock to it). The program itself: `solana program dump` in calistir.sh.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { PublicKey } = require("@solana/web3.js");

const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const CLMM = new PublicKey("CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK");
const HAVUZ = new PublicKey(process.argv[2] || "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv");
const AD = process.argv[3] || "sol-usdc";
const rpc = (m, p) => fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) })
  .then((r) => r.json()).then((j) => { if (j.error) throw new Error(m + ": " + JSON.stringify(j.error)); return j.result; });

(async () => {
  const h = await rpc("getAccountInfo", [HAVUZ.toBase58(), { encoding: "base64" }]);
  const d = Buffer.from(h.value.data[0], "base64");
  const pk = (o) => new PublicKey(d.subarray(o, o + 32));
  const aralik = d.readUInt16LE(235) * 60;
  const tick = d.readInt32LE(269);
  const bas = Math.floor(tick / aralik) * aralik;
  /* the tick arrays a swap walks are the initialized ones (the pool's bitmap, arrays -512..511), from the
     current one in each direction: "asagi" when the price falls (token0 in), "yukari" when it rises */
  const bit = (i) => (d.readBigUInt64LE(904 + 8 * (i >> 6)) >> BigInt(i & 63)) & 1n;
  const baslar = [];
  for (let i = 0; i < 1024; i++) if (bit(i)) baslar.push((i - 512) * aralik);
  const asagi = baslar.filter((x) => x <= bas).reverse().slice(0, 7);
  const yukari = baslar.filter((x) => x >= bas).slice(0, 7);
  const dizi = (st) => { const b = Buffer.alloc(4); b.writeInt32BE(st); return PublicKey.findProgramAddressSync([Buffer.from("tick_array"), HAVUZ.toBuffer(), b], CLMM)[0]; };
  const uzanti = PublicKey.findProgramAddressSync([Buffer.from("pool_tick_array_bitmap_extension"), HAVUZ.toBuffer()], CLMM)[0];
  const adlar = { havuz: HAVUZ, amm_config: pk(9), mint0: pk(73), mint1: pk(105), vault0: pk(137), vault1: pk(169), gozlem: pk(201), uzanti };
  asagi.forEach((st, i) => { adlar["asagi" + i] = dizi(st); });
  yukari.forEach((st, i) => { adlar["yukari" + i] = dizi(st); });
  console.log("  dizi baslari asagi " + asagi.join(",") + "  yukari " + yukari.join(","));
  const liste = Object.values(adlar).map((x) => x.toBase58());
  const r = await rpc("getMultipleAccounts", [liste, { encoding: "base64" }]);
  const zaman = await rpc("getBlockTime", [r.context.slot]);
  const cikti = { slot: r.context.slot, zaman, tick, aralik, hesaplar: {} };
  Object.keys(adlar).forEach((ad, i) => {
    const v = r.value[i];
    if (!v) { console.log("  " + ad.padEnd(11) + liste[i] + "  (yok)"); return; }
    cikti.hesaplar[ad] = { adres: liste[i], sahip: v.owner, lamport: v.lamports, veri: v.data[0] };
    console.log("  " + ad.padEnd(11) + liste[i] + "  " + Buffer.from(v.data[0], "base64").length + " bayt");
  });
  const yol = path.join(__dirname, "fixtures", "raydium-" + AD + ".json");
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol, JSON.stringify(cikti, null, 1));
  console.log("yazildi " + yol + "  slot " + cikti.slot + "  zaman " + zaman + "  tick " + tick);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
