"use strict";
/* ===========================================================================
 * denetim-dagitim-ag.js — is what dagitim-ag.json says actually on chain?
 *
 *   node scripts/denetim-dagitim-ag.js [zincir ...]
 *
 * Read-only. For every chain in the record:
 *   - every recorded contract has code, of the size its build produces
 *   - the network core sits at the same address on every chain
 *   - each OApp (FiyatAgi, IkizYayici, UzakYurutucuAg, Arc DaoElcisiAg) has
 *     no owner, a dead delegate, two required DVNs on all 8 pathways both
 *     ways (read back from the endpoint) and the expected peers
 *   - the launchpad is wired to this chain's PoolManager, its dollar (or
 *     Dolar6 over it), the recorded hook, developer pool and liquidity vault
 *   - DevPool's governor is UzakYurutucuAg
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract, AbiCoder, getAddress, zeroPadValue } = require("ethers");
const { EVM, dvnDoldur } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const K = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const HV = fs.existsSync(path.join(KOK, "dagitim-ikiz-havuz-ag.json")) ? JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ikiz-havuz-ag.json"), "utf8")) : {};
dvnDoldur(JSON.parse(fs.readFileSync(path.join(KOK, "rapor", "lz-dvns.json"), "utf8")));
const coder = AbiCoder.defaultAbiCoder();
const A = (x) => getAddress(String(x).toLowerCase());
const B = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
const OLU = "0x000000000000000000000000000000000000dEaD";
const ULN = "tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)";
const ONAY = { 5042: 5, 4663: 20, 8453: 10, 42161: 20, 1: 15, 56: 20, 43114: 12, 143: 10, 999: 10 };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) { if (d > 6) throw e; await bekle(2000 * (d + 1)); }
  }
}

let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; console.log((k ? "  ok   " : "  HATA ") + ad + (d !== undefined ? "  (" + d + ")" : "")); };

(async () => {
  const secili = process.argv.slice(2);
  const CEKIRDEK = ["IkizOFTFabrikaAg", "IkizFabrikaAg", "FiyatAgi", "KapiAg", "IkizYayici"];
  const tekAdres = {};
  for (const [ad, z] of Object.entries(EVM)) {
    if (secili.length && !secili.includes(ad)) continue;
    const r = K[ad];
    if (!r) { console.log(z.ad + ": kayit yok"); continue; }
    console.log("\n" + z.ad);
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true, batchMaxCount: 1 });
    const kod = async (a) => (await israr(() => p.getCode(a)));

    /* code present, right size */
    const kontrat = Object.entries(r).filter(([k, v]) => /^0x[0-9a-fA-F]{40}$/.test(String(v)) && !/Tahmin$/.test(k) && k !== "quote" && k !== "poolManager");
    const eksik = [];
    for (const [n, a] of kontrat) {
      const c = await kod(a);
      let ad2 = n;
      if (!fs.existsSync(path.join(KOK, "build", ad2 + ".json"))) continue;
      const beklenen = (B(ad2).deployedBytecode.length - 2) / 2;
      if ((c.length - 2) / 2 !== beklenen) eksik.push(n + " " + (c.length - 2) / 2 + "/" + beklenen);
    }
    ok(eksik.length === 0, kontrat.length + " kontratin hepsinde dogru boyutta kod", eksik.join(", ") || undefined);

    for (const n of CEKIRDEK) {
      if (!r[n]) { ok(false, n + " kayitta yok"); continue; }
      tekAdres[n] = tekAdres[n] || r[n];
      if (tekAdres[n].toLowerCase() !== r[n].toLowerCase()) ok(false, n + " diger zincirlerle ayni adreste degil", r[n]);
    }

    /* OApps */
    const ep = new Contract(A(z.endpoint), ["function getConfig(address,address,uint32,uint32) view returns (bytes)",
      "function delegates(address) view returns (address)"], p);
    const oappler = [["FiyatAgi", r.FiyatAgi, "kendisi"], ["IkizYayici", r.IkizYayici, "kendisi"]];
    if (ad === "arc") oappler.push(["DaoElcisiAg", r.DaoElcisiAg, "yurutucu"]);
    else oappler.push(["UzakYurutucuAg", r.UzakYurutucuAg, "arc"]);
    const d0d1 = [z.dvn.lzLabs, z.dvn.nethermind].map(A).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
    for (const [n, a, peerTuru] of oappler) {
      if (!a) continue;
      const c = new Contract(a, ["function owner() view returns (address)", "function peers(uint32) view returns (bytes32)"], p);
      const sahip = await israr(() => c.owner());
      const delege = await israr(() => ep.delegates(a));
      let ayar = 0, peer = 0, hedef = 0;
      for (const [kad, k] of Object.entries(EVM)) {
        if (k.eid === z.eid) continue;
        hedef++;
        const g = coder.decode([ULN], await israr(() => ep.getConfig(a, A(z.sendLib), k.eid, 2)))[0];
        const al = coder.decode([ULN], await israr(() => ep.getConfig(a, A(z.recvLib), k.eid, 2)))[0];
        const dvnDogru = (u) => u.requiredDVNs.length === 2 && u.requiredDVNs.map(A).join() === d0d1.join();
        if (Number(g.confirmations) === ONAY[z.chainId] && dvnDogru(g) && Number(al.confirmations) === ONAY[k.chainId] && dvnDogru(al)) ayar++;
        const pr = (await israr(() => c.peers(k.eid))).toLowerCase();
        let beklenenPeer = zeroPadValue(a, 32).toLowerCase();
        if (peerTuru === "arc") beklenenPeer = k.eid === 30417 ? zeroPadValue(K.arc.DaoElcisiAg, 32).toLowerCase() : "0x" + "00".repeat(32);
        if (peerTuru === "yurutucu") beklenenPeer = zeroPadValue(kad === "robinhood" ? JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood.uzakYurutucu : K.base.UzakYurutucuAg, 32).toLowerCase();
        if (pr === beklenenPeer) peer++;
      }
      ok(sahip === "0x0000000000000000000000000000000000000000" && delege.toLowerCase() === OLU.toLowerCase() && ayar === hedef && peer === hedef,
        n + ": sahipsiz, delege 0xdead, " + ayar + "/" + hedef + " hatta iki DVN, " + peer + "/" + hedef + " peer");
    }

    /* launchpad wiring */
    if (r.PulseLaunchpad) {
      const lp = new Contract(r.PulseLaunchpad, ["function quote() view returns (address)", "function poolManager() view returns (address)",
        "function hook() view returns (address)", "function gelistiriciFonu() view returns (address)", "function likiditeKasasi() view returns (address)"], p);
      const oku = async (f) => { try { return A(await israr(() => lp[f]())); } catch (e) { return "?"; } };
      const q = await oku("quote"), pm = await oku("poolManager"), h = await oku("hook"), dp = await oku("gelistiriciFonu"), lk = await oku("likiditeKasasi");
      ok(q === A(r.quote) && pm === A(z.poolManager), "launchpad bu zincirin PoolManager'i ve doları", "quote " + q + (r.Dolar6 ? " (Dolar6)" : ""));
      ok(h === A(r.PulseHook) && dp === A(r.DevPool) && lk === A(r.PulseLikiditeKasasi), "launchpad hook, gelistirici fonu ve likidite kasasina bagli");
      const gov = new Contract(r.DevPool, ["function governor() view returns (address)"], p);
      let g = "?"; try { g = A(await israr(() => gov.governor())); } catch (e) { /* */ }
      ok(g === A(r.UzakYurutucuAg), "gelistirici fonunu yalniz Arc DAO'su yonetir (UzakYurutucuAg)", g);
    }

    /* twin pools: a factory and its lock hook (0xA00), bound to each other,
       this chain's PoolManager and dollar, priced from FiyatAgi */
    const hv = HV[ad];
    if (hv) {
      const fb = new Contract(hv.fabrika, ["function hook() view returns (address)", "function poolManager() view returns (address)",
        "function usdg() view returns (address)", "function referans() view returns (address)"], p);
      const oku = async (f) => { try { return A(await israr(() => fb[f]())); } catch (e) { return "?"; } };
      const fh = await oku("hook"), fpm = await oku("poolManager"), fu = await oku("usdg"), fr = await oku("referans");
      const dolar = A(ad === "arc" ? JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8")).arc.quote
        : ad === "robinhood" ? JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-robinhood.json"), "utf8")).robinhood.quote : r.quote);
      const hookKod = (await kod(hv.hook)).length > 2;
      ok(hookKod && fh === A(hv.hook) && (parseInt(hv.hook.slice(-4), 16) & 0x3FFF) === 0xA00, "ikiz havuz fabrikasi kilit hook'una bagli (0xA00)", hv.fabrika);
      ok(fpm === A(z.poolManager) && fu === dolar && fr === A(K.arc.FiyatAgi), "ikiz havuzlar bu zincirin PoolManager'i ve dolariyla, fiyat FiyatAgi'ndan", "dolar " + fu);
    }
  }
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
