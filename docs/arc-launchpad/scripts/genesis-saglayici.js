"use strict";
/* ===========================================================================
 * genesis-saglayici.js — a GENESIS COMPUTE NETWORK provider
 *
 *   SAGLAYICI_KEY=0x... node scripts/genesis-saglayici.js <zincir> [kaydol <dolar>] [--uygula]
 *
 * Anyone can run this with their own key and stake: that is the point.
 * It watches GenesisHesap on one chain for jobs it can run, runs them
 * itself, commits the output hash, reveals it after the commit window,
 * settles, and publishes the agreed output.
 *
 * WHICH MODELS
 *   GENESIS-0 (model id keccak256("GENESIS-0")): the job input is the
 *   prompt, the output is GenesisDil.uret(prompt, 160, 0, false) — greedy,
 *   so every honest provider computes the same bytes. The provider runs
 *   it as a call against ITS OWN choice of RPC node; the agreement of k
 *   independent providers is what the chain settles on. (For GENESIS-0 the
 *   requester could also call the view directly; jobs are how the network
 *   is exercised and paid, and the same commit-reveal path carries the
 *   larger models registered in mode 2 as providers add runtimes for them.)
 *
 * MODE: 2 — computed by independent participants, agreed on chain. Not a
 * cryptographic proof; see contracts/genesis/GenesisHesap.sol.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, keccak256, toUtf8Bytes, AbiCoder, hexlify, randomBytes } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const [ZINCIR, ALT, MIKTAR] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const B = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8")).abi;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const GENESIS0 = keccak256(toUtf8Bytes("GENESIS-0"));
const DURUM = path.join(KOK, "rapor", "genesis-saglayici-" + (ZINCIR || "x") + ".json");

(async () => {
  const z = EVM[ZINCIR];
  if (!z) throw new Error("kullanim: <zincir> [kaydol <dolar>] [--uygula]");
  const s = fs.readFileSync(path.join(KOK, "docs", "js", "genesis-adres.js"), "utf8");
  const g = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
  if (!g.hesap[ZINCIR]) throw new Error("GenesisHesap " + ZINCIR + " uzerinde yok");
  const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
  const anahtar = process.env.SAGLAYICI_KEY;
  if (!anahtar) throw new Error("SAGLAYICI_KEY yok");
  const w = new Wallet(anahtar, p);
  const h = new Contract(g.hesap[ZINCIR], B("GenesisHesap"), w);
  const d = new Contract(g.dil, B("GenesisDil"), p);
  const tx = async (etiket, f) => {
    if (!UYGULA) { console.log("(kuru) " + etiket); return; }
    const t = await f();
    const m = await t.wait();
    console.log(etiket.padEnd(28) + t.hash + (m.status === 1 ? "" : " BASARISIZ"));
  };

  if (ALT === "kaydol") {
    const dolar = new Contract(await h.dolar(), ["function approve(address,uint256) returns (bool)"], w);
    const m = BigInt(Math.round(Number(MIKTAR || "5") * 1e6));
    await tx("onay", () => dolar.approve(h.target, m));
    await tx("kaydol " + Number(m) / 1e6, () => h.kaydol(m));
    return;
  }

  const durum = fs.existsSync(DURUM) ? JSON.parse(fs.readFileSync(DURUM, "utf8")) : { isler: {} };
  const kaydet = () => fs.writeFileSync(DURUM, JSON.stringify(durum, null, 1));
  console.log("saglayici " + w.address + " " + z.ad + " GenesisHesap " + h.target);
  for (;;) {
    const n = Number(await h.isSayisi());
    const simdi = Math.floor(Date.now() / 1000);
    for (let id = Math.max(0, n - 50); id < n; id++) {
      const j = await h.isBilgisi(id);
      const ben = durum.isler[id] || {};
      if (Number(j.durum) !== 1) {
        if (Number(j.durum) === 2 && ben.cikti && !ben.yayinlandi && (await h.ciktilar(id)) === "0x") {
          await tx("yayinla #" + id, () => h.ciktiYayinla(id, ben.cikti));
          ben.yayinlandi = true; kaydet();
        }
        continue;
      }
      if (j.modelId !== GENESIS0) continue;
      if (!ben.muhur && simdi <= Number(j.taahhutSon)) {
        const girdi = await h.girdi(j.girdiHash);
        if (girdi === "0x") continue;                     // input not on chain: cannot run
        const cikti = await d.uret(girdi, 160, 0, false);
        const ch = keccak256(cikti);
        const tuz = hexlify(randomBytes(32));
        const muhur = keccak256(AbiCoder.defaultAbiCoder().encode(["uint256", "bytes32", "bytes32", "address"], [id, ch, tuz, w.address]));
        await tx("taahhut #" + id, () => h.taahhutEt(id, muhur));
        Object.assign(ben, { muhur, ch, tuz, cikti }); durum.isler[id] = ben; kaydet();
      } else if (ben.muhur && !ben.acildi && simdi > Number(j.taahhutSon) && simdi <= Number(j.acmaSon)) {
        await tx("ac #" + id, () => h.ac(id, ben.ch, ben.tuz));
        ben.acildi = true; kaydet();
      } else if (ben.acildi && simdi > Number(j.acmaSon)) {
        await tx("sonuclandir #" + id, () => h.sonuclandir(id));
      }
    }
    if (!UYGULA) return;
    await bekle(20000);
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
