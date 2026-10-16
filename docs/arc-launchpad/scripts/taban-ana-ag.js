"use strict";
/* ===========================================================================
 * taban-ana-ag.js — the floor layer's first mainnet round trip, Base <-> Arbitrum
 *
 *   node scripts/taban-ana-ag.js doldur     Arc -> Base, 5 USDC for the test (CCTP)
 *   node scripts/taban-ana-ag.js kur        FthmPayi + TabanKasasi on Base and
 *                                           Arbitrum, twins named, Base seeded, locked
 *   node scripts/taban-ana-ag.js git        Base -> Arbitrum: half the tokens, with
 *                                           their dollars, in one CCTP message
 *   node scripts/taban-ana-ag.js itfa-arb   redeem a fifth on Arbitrum, locally
 *   node scripts/taban-ana-ag.js don        Arbitrum -> Base: the rest back
 *   node scripts/taban-ana-ag.js itfa-base  redeem everything on Base
 *   node scripts/taban-ana-ag.js supur      FTHM's share on Base -> Arc stake
 *   node scripts/taban-ana-ag.js durum      read both vaults
 *
 * Every step that sends a CCTP message waits for Circle's attestation (Iris)
 * and delivers it. State is kept in dagitim-taban.json so a step can be
 * rerun after an interruption.
 *
 * Cost (approved by the user, 16 Oct 2026): about 6 USDC moves; net about
 * $2.6 — the $5 opening fee (half to our own treasury, half to FTHM stakers
 * on Arc), a $1 seed that is redeemed back, 0.1% bridge fees, gas.
 * The key is read from C:/bot/.env and never printed.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, FallbackProvider, Wallet, ContractFactory, Contract, parseUnits, formatUnits } = require("ethers");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-taban.json");
const ART = path.join(KOK, "nesil2-test", "out");

const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";   // Circle TokenMessengerV2, every EVM chain
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";   // Circle MessageTransmitterV2
const STAKE_ARC = "0xAbD31A537E089D8a12b928aF7837C148dE2Bd2de";
const Z = {
  arc: { rpc: "https://rpc.mainnet.arc.io", usdc: "0x3600000000000000000000000000000000000000", domain: 26, kasif: "https://explorer.arc.io/tx/" },
  base: { rpc: "https://base-rpc.publicnode.com", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", domain: 6, kasif: "https://basescan.org/tx/" },
  arbitrum: { rpc: "https://arbitrum-one-rpc.publicnode.com", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", domain: 3, kasif: "https://arbiscan.io/tx/" },
};
const ERC20 = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"];
const TMABI = ["function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)"];
const MTABI = ["function receiveMessage(bytes,bytes) returns (bool)"];
const SIFIR32 = "0x" + "0".repeat(64);
const SIFIR20 = "0x" + "0".repeat(40);

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const kayit = () => (fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : { zincirler: {}, islemler: [] });
const kaydet = (k) => fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1) + "\n");
const b32 = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

/* Each chain's own RPC first, PublicNode behind it: one rate limit must
   not stop a step halfway. */
const YEDEK = { base: "https://mainnet.base.org", arbitrum: "https://arb1.arbitrum.io/rpc" };
const saglayicilar = {};
function saglayici(z) {
  if (!saglayicilar[z]) {
    const ps = [YEDEK[z], Z[z].rpc].filter(Boolean).map((u, i) =>
      ({ provider: new JsonRpcProvider(u, undefined, { staticNetwork: true }), priority: i + 1, weight: 1, stallTimeout: 4000 }));
    saglayicilar[z] = ps.length > 1 ? new FallbackProvider(ps, undefined, { quorum: 1 }) : ps[0].provider;
  }
  return saglayicilar[z];
}
function cuzdan(z) {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  return new Wallet(pk, saglayici(z));
}
function artefakt(ad) {
  const j = JSON.parse(fs.readFileSync(path.join(ART, ad + ".sol", ad + ".json"), "utf8"));
  return { abi: j.abi, bytecode: j.bytecode.object };
}
/* Public RPCs answer a receipt poll with "request limit reached" now and
   then; a sent transaction must not read as failed because of it. */
async function makbuz(tx) {
  for (let d = 0; ; d++) {
    try {
      const r = await tx.wait();
      if (r) return r;
    } catch (e) {
      if (/revert|CALL_EXCEPTION/i.test(String(e.code) + String(e.shortMessage))) throw e;
      if (d >= 12) throw e;
    }
    await bekle(5000);
  }
}

async function islem(k, z, ne, tx) {
  const r = await makbuz(tx);
  if (r.status !== 1) throw new Error(ne + " reverted: " + r.hash);
  console.log("  " + z.padEnd(8) + " " + ne.padEnd(30) + " " + Z[z].kasif + r.hash);
  k.islemler.push({ z, ne, tx: r.hash, zaman: new Date().toISOString() });
  kaydet(k);
  return r;
}

async function iris(kaynak, hash) {
  const url = "https://iris-api.circle.com/v2/messages/" + Z[kaynak].domain + "?transactionHash=" + hash;
  process.stdout.write("  Iris bekleniyor (" + kaynak + " " + hash.slice(0, 10) + "…) ");
  for (let i = 0; i < 54; i++) {
    try {
      const j = await fetch(url).then((r) => r.json());
      const m = j.messages && j.messages[0];
      if (m && m.status === "complete" && m.attestation && m.attestation !== "PENDING") {
        console.log("tamam, " + (i * 10) + " sn");
        return m;
      }
    } catch { /* not indexed yet */ }
    if (i % 6 === 0) process.stdout.write(".");
    await bekle(10000);
  }
  throw new Error("Iris 9 dakikada onaylamadi (tekrar calistir): " + hash);
}

async function vaultOku(z, adres) {
  const w = cuzdan(z);
  const v = new Contract(adres, artefakt("TabanKasasi").abi, w.provider);
  const [arz, kasa, taban, bal] = await Promise.all([v.totalSupply(), v.kasa(), v.taban(), v.balanceOf(w.address)]);
  return { arz, kasa, taban, bal };
}

const adimlar = {
  async doldur() {
    const k = kayit();
    const w = cuzdan("arc");
    const miktar = parseUnits("5", 6);
    const usdc = new Contract(Z.arc.usdc, ERC20, w);
    await islem(k, "arc", "approve TokenMessengerV2", await usdc.approve(TM, miktar));
    const tm = new Contract(TM, TMABI, w);
    const r = await islem(k, "arc", "CCTP 5 USDC -> Base",
      await tm.depositForBurn(miktar, Z.base.domain, b32(w.address), Z.arc.usdc, SIFIR32, 0, 2000));
    const m = await iris("arc", r.hash);
    const mt = new Contract(MT, MTABI, cuzdan("base"));
    await islem(k, "base", "receiveMessage (5 USDC)", await mt.receiveMessage(m.message, m.attestation));
  },

  async kur() {
    const k = kayit();
    const pay = artefakt("FthmPayi"), kas = artefakt("TabanKasasi");
    for (const z of ["base", "arbitrum"]) {
      if (k.zincirler[z] && k.zincirler[z].kasa) { console.log("  " + z + " zaten kurulu"); continue; }
      const w = cuzdan(z);
      let fp = k.zincirler[z] && k.zincirler[z].fthmPayi;
      if (!fp) {
        const p = await new ContractFactory(pay.abi, pay.bytecode, w).deploy(Z[z].usdc, TM, Z[z].domain, STAKE_ARC);
        fp = await p.getAddress();
        k.zincirler[z] = { fthmPayi: fp, domain: Z[z].domain };
        kaydet(k);   // before the wait: an RPC hiccup must not lose a deployed address
        await islem(k, z, "FthmPayi deploy", p.deploymentTransaction());
      }
      const v = await new ContractFactory(kas.abi, kas.bytecode, w).deploy(
        "ARC PULSE Floor Test", "PFT", Z[z].usdc, MT, TM, w.address, fp, w.address);
      k.zincirler[z] = { fthmPayi: fp, kasa: await v.getAddress(), domain: Z[z].domain };
      kaydet(k);
      await islem(k, z, "TabanKasasi deploy", v.deploymentTransaction());
    }
    const B = k.zincirler.base, A = k.zincirler.arbitrum;
    const vb = new Contract(B.kasa, kas.abi, cuzdan("base")), va = new Contract(A.kasa, kas.abi, cuzdan("arbitrum"));
    if ((await vb.ikiz(3)) === SIFIR32) await islem(k, "base", "ikizEkle(arbitrum)", await vb.ikizEkle(3, A.kasa));
    if ((await va.ikiz(6)) === SIFIR32) await islem(k, "arbitrum", "ikizEkle(base)", await va.ikizEkle(6, B.kasa));
    if ((await vb.totalSupply()) === 0n) {
      const usdc = new Contract(Z.base.usdc, ERC20, cuzdan("base"));
      await islem(k, "base", "approve 6 USDC", await usdc.approve(B.kasa, parseUnits("6", 6)));
      await islem(k, "base", "tohumla $1 / 1,000,000 PFT",
        await vb.tohumla(cuzdan("base").address, parseUnits("1", 6), parseUnits("1000000", 18)));
    }
    if ((await vb.kurucu()) !== SIFIR20) await islem(k, "base", "kilitle", await vb.kilitle());
    if ((await va.kurucu()) !== SIFIR20) await islem(k, "arbitrum", "kilitle", await va.kilitle());
  },

  async git() { await kopru("base", "arbitrum", parseUnits("500000", 18)); },
  async don() {
    const k = kayit();
    const s = await vaultOku("arbitrum", k.zincirler.arbitrum.kasa);
    await kopru("arbitrum", "base", s.bal);
  },
  /* Resume a bridge whose sender was stopped while Iris was still signing:
     node scripts/taban-ana-ag.js teslim <kaynak> <hedef> <kaynak tx> */
  async teslim() {
    const [kaynak, hedef, hash] = process.argv.slice(3);
    const k = kayit();
    const vh = new Contract(k.zincirler[hedef].kasa, artefakt("TabanKasasi").abi, cuzdan(hedef));
    const m = await iris(kaynak, hash);
    const once = await vh.balanceOf(cuzdan(hedef).address);
    await islem(k, hedef, "teslimAl", await vh.teslimAl(m.message, m.attestation));
    console.log("  " + hedef + "'de basilan: " + formatUnits((await vh.balanceOf(cuzdan(hedef).address)) - once, 18) +
      " PFT; " + hedef + " tabani " + (await vh.taban()));
  },
  /* Resume the FTHM sweep: node scripts/taban-ana-ag.js arc-teslim <base tx> */
  async "arc-teslim"() {
    const k = kayit();
    const m = await iris("base", process.argv[3]);
    const usdc = new Contract(Z.arc.usdc, ERC20, cuzdan("arc").provider);
    const once = await usdc.balanceOf(STAKE_ARC);
    const mt = new Contract(MT, MTABI, cuzdan("arc"));
    await islem(k, "arc", "receiveMessage (FTHM share)", await mt.receiveMessage(m.message, m.attestation));
    console.log("  Arc stake USDC: " + formatUnits(once, 6) + " -> " + formatUnits(await usdc.balanceOf(STAKE_ARC), 6));
  },
  async "itfa-arb"() { await itfa("arbitrum", 5n); },
  async "itfa-base"() { await itfa("base", 1n); },

  async supur() {
    const k = kayit();
    const w = cuzdan("base");
    const p = new Contract(k.zincirler.base.fthmPayi, artefakt("FthmPayi").abi, w);
    const r = await islem(k, "base", "FthmPayi.supur -> Arc stake", await p.supur(0));
    const m = await iris("base", r.hash);
    const usdc = new Contract(Z.arc.usdc, ERC20, cuzdan("arc").provider);
    const once = await usdc.balanceOf(STAKE_ARC);
    const mt = new Contract(MT, MTABI, cuzdan("arc"));
    await islem(k, "arc", "receiveMessage (FTHM share)", await mt.receiveMessage(m.message, m.attestation));
    console.log("  Arc stake USDC: " + formatUnits(once, 6) + " -> " + formatUnits(await usdc.balanceOf(STAKE_ARC), 6));
  },

  async durum() {
    const k = kayit();
    for (const z of ["base", "arbitrum"]) {
      if (!k.zincirler[z]) continue;
      const s = await vaultOku(z, k.zincirler[z].kasa);
      console.log("  " + z.padEnd(8) + " kasa $" + formatUnits(s.kasa, 6) + "  arz " + formatUnits(s.arz, 18) +
        "  taban " + s.taban + " (1e-6 $ / 1e18)  bizde " + formatUnits(s.bal, 18));
    }
  },
};

async function kopru(kaynak, hedef, miktar) {
  const k = kayit();
  const S = k.zincirler[kaynak], H = k.zincirler[hedef];
  const kas = artefakt("TabanKasasi");
  const ws = cuzdan(kaynak), wh = cuzdan(hedef);
  const vs = new Contract(S.kasa, kas.abi, ws), vh = new Contract(H.kasa, kas.abi, wh);
  const tabanOnce = await vs.taban();
  const r = await islem(k, kaynak, "kopru " + formatUnits(miktar, 18) + " PFT -> " + hedef,
    await vs.kopru(miktar, H.domain, ws.address, 0, 0));
  const m = await iris(kaynak, r.hash);
  const once = await vh.balanceOf(wh.address);
  await islem(k, hedef, "teslimAl", await vh.teslimAl(m.message, m.attestation));
  const sonra = await vh.balanceOf(wh.address);
  console.log("  " + hedef + "'de basilan: " + formatUnits(sonra - once, 18) + " PFT; " + kaynak + " tabani " + tabanOnce +
    " -> " + (await vs.taban()) + "; " + hedef + " tabani " + (await vh.taban()));
}

async function itfa(z, bolen) {
  const k = kayit();
  const w = cuzdan(z);
  const v = new Contract(k.zincirler[z].kasa, artefakt("TabanKasasi").abi, w);
  const bal = await v.balanceOf(w.address);
  const miktar = bal / bolen;
  const usdc = new Contract(Z[z].usdc, ERC20, w.provider);
  const once = await usdc.balanceOf(w.address);
  await islem(k, z, "itfa " + formatUnits(miktar, 18) + " PFT", await v.itfa(miktar));
  console.log("  " + z + " redeem odedi: $" + formatUnits((await usdc.balanceOf(w.address)) - once, 6) + "; taban " + (await v.taban()));
}

(async () => {
  const adim = process.argv[2];
  if (!adimlar[adim]) { console.log("adim: " + Object.keys(adimlar).join(" | ")); process.exit(1); }
  console.log("== " + adim);
  await adimlar[adim]();
})().catch((e) => { console.error("HATA: " + String(e.shortMessage || e.message).slice(0, 400)); process.exit(1); });
