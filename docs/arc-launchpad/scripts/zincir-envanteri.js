"use strict";
/* ===========================================================================
 * zincir-envanteri.js — can ARC PULSE be deployed on each chain, and at what cost
 *
 *   node scripts/zincir-envanteri.js        # writes rapor/zincir-envanteri.json
 *
 * For every EVM chain in zincirler.js this reads, from the chain itself:
 *   - the chain id behind the RPC
 *   - code at the LayerZero endpoint, send/receive libraries and executor
 *   - code at the two DVNs, and whether each quotes the pathway to Arc
 *   - code at the Uniswap v4 PoolManager and the CREATE2 factory the hooks need
 *   - the dollar token's symbol and decimals
 *   - the gas price, the deployer's balance, and what the full stack costs
 * The stack is priced at GAZ_YIGIN gas: the launchpad stack measured on
 * Robinhood (13.93M), the FTHM stack (7.27M) and the wiring to eleven peers.
 *
 * Non-EVM chains are listed with what they need; their tooling is a separate
 * track (see arastirma/cok-zincir.md).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract, getAddress } = require("ethers");
const { EVM, DIGER, dvnDoldur } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const DAGITICI = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const GAZ_YIGIN = 13_931_740 + 7_272_000 + 11 * 400_000;
const A = (x) => getAddress(String(x).toLowerCase());

async function dvnMeta() {
  const yerel = path.join(KOK, "rapor", "lz-dvns.json");
  try {
    const r = await fetch("https://metadata.layerzero-api.com/v1/metadata/dvns");
    const j = await r.json();
    fs.mkdirSync(path.dirname(yerel), { recursive: true });
    fs.writeFileSync(yerel, JSON.stringify(j));
    return j;
  } catch (e) {
    return JSON.parse(fs.readFileSync(yerel, "utf8"));
  }
}

async function fiyatlar() {
  const ids = [...new Set(Object.values(EVM).map((z) => z.cgId))].join(",");
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=" + ids);
    return await r.json();
  } catch (e) { return {}; }
}

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) { if (d > 4) throw e; await new Promise((r) => setTimeout(r, 1500 * (d + 1))); }
  }
}

(async () => {
  dvnDoldur(await dvnMeta());
  const usd = await fiyatlar();
  const cikti = { olculdu: new Date().toISOString(), dagitici: DAGITICI, gazYigin: GAZ_YIGIN, evm: {}, diger: DIGER };
  console.log("ZINCIR ENVANTERI  (yigin " + (GAZ_YIGIN / 1e6).toFixed(1) + "M gaz)\n");
  console.log("zincir".padEnd(11) + "id".padEnd(7) + "LZ  DVN  v4  c2  dolar".padEnd(26) + "gaz fiyati".padEnd(14) + "yigin maliyeti".padEnd(18) + "bakiye");

  for (const [ad, z] of Object.entries(EVM)) {
    const r = { ad: z.ad, eid: z.eid, sorun: [] };
    try {
      const p = new JsonRpcProvider(z.rpc, undefined, { staticNetwork: false, batchMaxCount: 1 });
      const kod = async (a) => !!a && (await israr(() => p.getCode(A(a)))).length > 2;
      r.chainId = Number((await israr(() => p.getNetwork())).chainId);
      if (r.chainId !== z.chainId) r.sorun.push("RPC baska zincir: " + r.chainId);
      r.lz = (await kod(z.endpoint)) && (await kod(z.sendLib)) && (await kod(z.recvLib)) && (await kod(z.executor));
      r.dvnKod = !!z.dvn && (await kod(z.dvn.lzLabs)) && (await kod(z.dvn.nethermind));
      if (ad !== "arc" && z.dvn) {
        const dv = ["function getFee(uint32,uint64,address,bytes) view returns (uint256)"];
        r.dvnArcYolu = true;
        for (const a of [z.dvn.lzLabs, z.dvn.nethermind]) {
          try { await israr(() => new Contract(A(a), dv, p).getFee(EVM.arc.eid, 5, A(z.sendLib), "0x")); }
          catch (e) { r.dvnArcYolu = false; r.sorun.push("DVN " + a.slice(0, 8) + " Arc yolunu fiyatlamiyor"); }
        }
      }
      r.v4 = await kod(z.poolManager);
      r.create2 = await kod(CREATE2_FACTORY);
      const t = new Contract(A(z.dolar.adres), ["function symbol() view returns (string)", "function decimals() view returns (uint8)"], p);
      try { r.dolar = { adres: A(z.dolar.adres), sembol: await israr(() => t.symbol()), ondalik: Number(await israr(() => t.decimals())) }; }
      catch (e) { r.sorun.push("dolar tokeni okunamadi"); }
      const f = await israr(() => p.getFeeData());
      const birim = f.gasPrice || f.maxFeePerGas || 0n;
      r.gazFiyatiGwei = Number(birim) / 1e9;
      r.bakiye = Number(await israr(() => p.getBalance(DAGITICI))) / 1e18;
      r.yiginYerel = (Number(birim) * GAZ_YIGIN) / 1e18;
      const fiyat = z.gazUsdc ? 1 : (usd[z.cgId] && usd[z.cgId].usd);
      r.yiginUsd = fiyat ? r.yiginYerel * fiyat : null;
      r.bakiyeUsd = fiyat ? r.bakiye * fiyat : null;
      if (!r.lz) r.sorun.push("LayerZero kodu eksik");
      if (!r.v4) r.sorun.push("Uniswap v4 yok");
      if (!r.create2) r.sorun.push("CREATE2 fabrikasi yok");
      if (z.not) r.sorun.push(z.not);
    } catch (e) {
      r.sorun.push("okunamadi: " + (e.shortMessage || e.message).slice(0, 80));
    }
    cikti.evm[ad] = r;
    const e = (b) => (b ? "ok " : "-- ");
    console.log(z.ad.padEnd(11) + String(r.chainId || "?").padEnd(7) +
      (e(r.lz) + " " + e(r.dvnKod && r.dvnArcYolu !== false) + " " + e(r.v4) + e(r.create2) + (r.dolar ? r.dolar.sembol + "/" + r.dolar.ondalik : "?")).padEnd(26) +
      ((r.gazFiyatiGwei != null ? r.gazFiyatiGwei.toPrecision(3) : "?") + " gwei").padEnd(14) +
      ((r.yiginYerel != null ? r.yiginYerel.toPrecision(3) : "?") + " " + z.gaz + (r.yiginUsd != null ? " ($" + r.yiginUsd.toFixed(2) + ")" : "")).padEnd(18) +
      (r.bakiye != null ? r.bakiye.toPrecision(3) + " " + z.gaz + (r.bakiyeUsd != null ? " ($" + r.bakiyeUsd.toFixed(2) + ")" : "") : "?") +
      (r.sorun.length ? "\n           ! " + r.sorun.join("; ") : ""));
  }

  console.log("\nEVM DISI");
  for (const [, z] of Object.entries(DIGER)) console.log("  " + z.ad.padEnd(9) + "eid " + z.eid + "  " + z.calisma + "  CCTP " + z.cctp);

  const eksik = Object.values(cikti.evm).filter((r) => r.yiginUsd != null && (r.bakiyeUsd || 0) < r.yiginUsd * 1.5);
  const toplam = eksik.reduce((t, r) => t + r.yiginUsd * 1.5 - (r.bakiyeUsd || 0), 0);
  cikti.gazAcigiUsd = toplam;
  console.log("\nGas acigi (yigin x1.5, bakiyeden sonra): $" + toplam.toFixed(2) + " — " + eksik.map((r) => r.ad).join(", "));
  fs.mkdirSync(path.join(KOK, "rapor"), { recursive: true });
  fs.writeFileSync(path.join(KOK, "rapor", "zincir-envanteri.json"), JSON.stringify(cikti, null, 1));
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
