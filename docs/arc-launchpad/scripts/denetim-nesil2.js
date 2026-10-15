"use strict";
/* ===========================================================================
 * denetim-nesil2.js — is the second generation on chain what it claims?
 *
 *   node scripts/denetim-nesil2.js
 *
 * Read from the chains, compared against dagitim-nesil2.json and the build:
 *   home   every contract has code; the launchpad points at this chain's
 *          dollar, PoolManager, hook, KasaFabrika2, registry, CCTP V2; the
 *          vault factory builds only for this launchpad and its init hash is
 *          the build's; the hook sits at 0xACC bits and knows the launchpad;
 *          the registry's home domain is this chain's (CCTP localDomain) and
 *          every remote it names has a factory with code.
 *   remote every factory names the right home domain, home vault factory
 *          and init hash, this chain's USDC and CCTP, and publishes the vault
 *          init hash the home registry holds.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract, keccak256, getAddress } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const K = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-nesil2.json"), "utf8"));
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const A = (x) => getAddress(String(x).toLowerCase());
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64", TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };
async function israr(f) { for (let d = 0; ; d++) { try { return await f(); } catch (e) { if (d > 6) throw e; await bekle(2000 * (d + 1)); } } }

(async () => {
  const kasaHash = keccak256(B("KopruKasasi2").bytecode);
  const uzakHash = keccak256(B("RemoteCollateralVault2").bytecode);
  const prov = (ad) => new JsonRpcProvider(EVM[ad].rpc, EVM[ad].chainId, { staticNetwork: true, batchMaxCount: 1 });

  for (const [ad, r] of Object.entries(K.ev)) {
    const p = prov(ad);
    console.log("\n" + EVM[ad].ad + " (ev)");
    const adlar = ["YoneticiFabrika2", "CrossChainAssetRegistry2", "KasaFabrika2", "PulseFabrika", "PulseLikiditeKasasi", "PulseLaunchpad2", "PulseHook"];
    const eksik = [];
    for (const n of adlar) if ((await israr(() => p.getCode(r[n]))).length <= 2) eksik.push(n);
    ok(eksik.length === 0, "7 kontratin hepsinde kod", eksik.join(",") || undefined);

    const lp = new Contract(r.PulseLaunchpad2, ["function quote() view returns (address)", "function poolManager() view returns (address)",
      "function hook() view returns (address)", "function kasaFabrika() view returns (address)", "function kayit() view returns (address)",
      "function tokenMessenger() view returns (address)", "function mesajTasiyici() view returns (address)", "function gelistiriciFonu() view returns (address)"], p);
    const [q, pm, h, kf, ky, tm, mt, dp] = await Promise.all(["quote", "poolManager", "hook", "kasaFabrika", "kayit", "tokenMessenger", "mesajTasiyici", "gelistiriciFonu"].map((f) => israr(() => lp[f]())));
    ok(A(q) === A(r.quote) && A(pm) === A(EVM[ad].poolManager) && A(h) === A(r.PulseHook), "launchpad: zincirin dolari, PoolManager'i, hook'u", q);
    ok(A(kf) === A(r.KasaFabrika2) && A(ky) === A(r.CrossChainAssetRegistry2) && A(tm) === A(TM) && A(mt) === A(MT), "launchpad: KasaFabrika2, kayit, CCTP V2");
    ok(A(dp) === A(r.DevPool), "launchpad: gelistirici fonu mevcut DevPool (DAO)", dp);

    const kfc = new Contract(r.KasaFabrika2, ["function launchpad() view returns (address)", "function kasaInitHash() view returns (bytes32)"], p);
    ok(A(await israr(() => kfc.launchpad())) === A(r.PulseLaunchpad2), "KasaFabrika2 yalniz bu launchpad'e kurar");
    ok((await israr(() => kfc.kasaInitHash())) === kasaHash, "KasaFabrika2 kasa init hash'i derlemeyle ayni");

    ok((parseInt(r.PulseHook.slice(-4), 16) & 0x3FFF) === 0xACC, "hook adresi 0xACC bitlerinde", r.PulseHook);

    const kay = new Contract(r.CrossChainAssetRegistry2, ["function EV_DOMAIN() view returns (uint32)", "function zincirSayisi() view returns (uint256)",
      "function zincirAt(uint256) view returns ((uint32,uint64,address,bytes32,address,string))"], p);
    const yerel = await israr(() => new Contract(MT, ["function localDomain() view returns (uint32)"], p).localDomain());
    ok(Number(await israr(() => kay.EV_DOMAIN())) === Number(yerel), "kayit ev domain'i = CCTP localDomain", Number(yerel));
    const n = Number(await israr(() => kay.zincirSayisi()));
    for (let i = 0; i < n; i++) {
      const z = await israr(() => kay.zincirAt(i));
      const uzakAd = z[5];
      const q2 = prov(uzakAd);
      const kodVar = (await israr(() => q2.getCode(z[2]))).length > 2;
      ok(kodVar && A(z[2]) === A(K.uzak[uzakAd].fabrikalar[ad]) && z[3] === uzakHash,
        "kayit -> " + uzakAd + " (domain " + z[0] + ") fabrikasi zincirde, init hash dogru", z[2]);
    }
  }

  for (const [u, r] of Object.entries(K.uzak)) {
    const p = prov(u);
    console.log("\n" + EVM[u].ad + " (uzak)");
    for (const [ev, f] of Object.entries(r.fabrikalar)) {
      const c = new Contract(f, ["function arcDomain() view returns (uint32)", "function evKasaFabrika() view returns (address)",
        "function evKasaInitHash() view returns (bytes32)", "function usdc() view returns (address)", "function tokenMessenger() view returns (address)",
        "function mesajTasiyici() view returns (address)", "function initKodHash() view returns (bytes32)", "function havuzFiyat() view returns (address)"], p);
      const [d, kf, kh, usdc, tm, mt, ih, hf] = await Promise.all(["arcDomain", "evKasaFabrika", "evKasaInitHash", "usdc", "tokenMessenger", "mesajTasiyici", "initKodHash", "havuzFiyat"].map((x) => israr(() => c[x]())));
      ok(Number(d) === K.ev[ev].domain && A(kf) === A(K.ev[ev].KasaFabrika2) && kh === kasaHash && ih === uzakHash,
        "fabrika(" + ev + "): ev domain " + Number(d) + ", ev KasaFabrika2, iki init hash");
      ok(A(usdc) === A(EVM[u].dolar.adres) && A(tm) === A(TM) && A(mt) === A(MT) && A(hf) === A(r.havuzFiyat), "fabrika(" + ev + "): bu zincirin USDC'si, CCTP V2, havuz fiyati");
    }
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
