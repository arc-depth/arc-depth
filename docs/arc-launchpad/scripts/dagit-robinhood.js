"use strict";
/* ===========================================================================
 * dagit-robinhood.js — deploy the launchpad to Robinhood Chain, USDG quote
 *
 *   node scripts/dagit-robinhood.js              # prices it, sends nothing
 *   node scripts/dagit-robinhood.js --uygula
 *
 * The same PulseLaunchpad / PulseHook bytecode that is live on Arc, with
 * USDG as the quote. Measured first on Robinhood mainnet state: 21/21 in
 * `node scripts/olc-pulse-launch.js --robinhood`.
 *
 * WHAT DIFFERS FROM ARC, AND ONLY THIS
 *   - Nothing is shared: Robinhood has none of the infrastructure, so the
 *     vault factories, the token factory and the liquidity vault are all
 *     deployed here.
 *   - No CCTP on Robinhood. The registry is KapaliKayit, which answers
 *     "no chain" to everything, and the two CCTP addresses are 0xdead
 *     placeholders the vault's send path never reaches (it stops at the
 *     registry check first).
 *   - The developer pool's governor is UzakYurutucu: the Arc DAO's decisions
 *     arrive over LayerZero and only they can pay out of it. UzakYurutucu
 *     is deployed with this wallet as its temporary owner, because its peer
 *     (DaoElcisi on Arc) does not exist yet. Until that peer is set it
 *     accepts no message at all, and the owner is burned once it is.
 *
 * THE ADDRESS RING
 *   Launchpad needs the hook, the hook needs the launchpad and the
 *   liquidity vault, the vault needs the launchpad. Everything except the
 *   hook goes out through CREATE in a fixed order, so every address is
 *   known from the starting nonce; the hook goes through CREATE2 with a salt
 *   mined for the 0xACC permission bits. The deployer must send nothing
 *   else on Robinhood while this runs — the script stops if the nonce has
 *   moved, and resumes from what is on chain.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const {
  JsonRpcProvider, Wallet, AbiCoder, keccak256, getCreateAddress,
  getCreate2Address, Transaction
} = require("ethers");

const KOK = path.join(__dirname, "..");
const RPC = "https://rpc.mainnet.chain.robinhood.com";
const ZINCIR = 4663;
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const LZ_ENDPOINT = "0x6f475642a6e85809b1c36fa62763669b1b48dd5b";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";

const UYGULA = process.argv.includes("--uygula");
const coder = AbiCoder.defaultAbiCoder();
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const GEREKEN = (1 << 11) | (1 << 9) | (1 << 7) | (1 << 6) | (1 << 3) | (1 << 2);  // 0xacc
const MASKE = (1 << 14) - 1;
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const ETH = (v) => (Number(v) / 1e18).toFixed(6) + " ETH";

function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

function madenle(initCodeHash) {
  for (let i = 0; i < 20_000_000; i++) {
    const salt = "0x" + i.toString(16).padStart(64, "0");
    const a = getCreate2Address(CREATE2_FACTORY, salt, initCodeHash);
    if ((parseInt(a.slice(-4), 16) & MASKE) === GEREKEN) return { salt, adres: a, deneme: i + 1 };
  }
  return null;
}

let kotu = 0;
const ok = (iyi, ad, not) => {
  if (!iyi) kotu++;
  console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : ""));
};

(async () => {
  console.log("PULSE — Robinhood Chain dagitimi (USDG)");
  console.log("  kip  " + (UYGULA ? "UYGULA — GERCEK ISLEM, GERI ALINAMAZ" : "KURU CALISMA"));

  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  const p = new JsonRpcProvider(RPC, { chainId: ZINCIR, name: "robinhood" }, { staticNetwork: true });
  const cuzdan = new Wallet(pk, p);
  const dagitici = await cuzdan.getAddress();
  const zincirNonce = await p.getTransactionCount(dagitici);
  const bakiye = await p.getBalance(dagitici);

  for (const [ad, a] of [["PoolManager", PM], ["USDG", USDG], ["LayerZero endpoint", LZ_ENDPOINT], ["CREATE2 factory", CREATE2_FACTORY]]) {
    const k = await p.getCode(a);
    ok(k && k !== "0x", ad + " Robinhood'da var", a + "  " + ((k.length - 2) / 2) + " bayt");
  }

  const planYolu = path.join(KOK, "dagitim-robinhood-plan.json");
  const onceki = fs.existsSync(planYolu) ? JSON.parse(fs.readFileSync(planYolu, "utf8")) : null;
  let nonce = zincirNonce;
  if (onceki && !onceki.uygulandiMi && typeof onceki.nonce === "number" && zincirNonce > onceki.nonce) {
    const k = await p.getCode(onceki.tahminler.YoneticiFabrika);
    if (k && k !== "0x") nonce = onceki.nonce;
  }

  console.log("");
  console.log("1) DAGITICI " + dagitici + "  nonce " + zincirNonce +
    (nonce !== zincirNonce ? " (DEVAM: plan nonce " + nonce + ")" : "") + "  bakiye " + ETH(bakiye));

  const ad = (i) => getCreateAddress({ from: dagitici, nonce: nonce + i });
  const T = {
    YoneticiFabrika: ad(0), KasaFabrika: ad(1), KapaliKayit: ad(2), PulseFabrika: ad(3),
    UzakYurutucu: ad(4), DevPool: ad(5), PulseLikiditeKasasi: ad(6), PulseLaunchpad: ad(7),
  };

  const hookInit = B("PulseHook").bytecode + coder.encode(
    ["address", "address", "address", "address", "address", "address"],
    [PM, T.PulseLaunchpad, USDG, T.DevPool, T.PulseLikiditeKasasi, ISLETME]).slice(2);
  const m = madenle(keccak256(hookInit));
  if (!m) { console.log("salt bulunamadi"); process.exit(1); }
  T.PulseHook = m.adres;
  ok((parseInt(m.adres.slice(-4), 16) & MASKE) === GEREKEN, "hook adresi 0xACC izin bitleriyle bitiyor", m.adres + "  (" + m.deneme + " deneme)");

  const ac = (n, tipler, degerler) => B(n).bytecode + (tipler.length ? coder.encode(tipler, degerler).slice(2) : "");
  const adimlar = [
    { ad: "YoneticiFabrika", init: ac("YoneticiFabrika", [], []) },
    { ad: "KasaFabrika", init: ac("KasaFabrika", ["address"], [T.YoneticiFabrika]) },
    { ad: "KapaliKayit", init: ac("KapaliKayit", [], []) },
    { ad: "PulseFabrika", init: ac("PulseFabrika", [], []) },
    { ad: "UzakYurutucu", init: ac("UzakYurutucu", ["address", "address"], [LZ_ENDPOINT, dagitici]) },
    { ad: "DevPool", init: ac("DevPool", ["address"], [T.UzakYurutucu]) },
    { ad: "PulseLikiditeKasasi", init: ac("PulseLikiditeKasasi", ["address", "address"], [USDG, T.PulseLaunchpad]) },
    { ad: "PulseLaunchpad", init: ac("PulseLaunchpad",
        ["address", "address", "address", "address", "address", "address", "address", "address", "address", "address", "address"],
        [USDG, PM, T.PulseHook, T.PulseFabrika, T.KasaFabrika, T.DevPool, T.PulseLikiditeKasasi, ISLETME, T.KapaliKayit, DEAD, DEAD]) },
    { ad: "PulseHook", init: hookInit, create2: true },
  ].map((a, i) => ({ ...a, beklenen: T[a.ad], sira: i }));

  console.log("");
  console.log("2) ADRESLER");
  for (const a of adimlar) console.log("     " + a.ad.padEnd(20) + a.beklenen + (a.create2 ? "  CREATE2" : "  nonce " + (nonce + a.sira)));

  console.log("");
  console.log("3) MALIYET");
  const ucret = await p.getFeeData();
  const birim = ucret.maxFeePerGas || ucret.gasPrice || 0n;
  let toplam = 0n;
  /* Each contract's deployment gas measured on its own; later contracts
     only store earlier addresses as immutables and call nothing at
     construction, so an estimate before the earlier ones exist is valid. */
  for (const a of adimlar) {
    const g = await p.estimateGas(a.create2 ? { from: dagitici, to: CREATE2_FACTORY, data: m.salt + a.init.slice(2) }
                                            : { from: dagitici, data: a.init });
    a.gaz = g; toplam += g;
    console.log("     " + a.ad.padEnd(20) + g.toString().padStart(10) + " gaz");
  }
  const maliyet = toplam * birim;
  console.log("     toplam " + toplam + " gaz x " + (Number(birim) / 1e9) + " gwei = " + ETH(maliyet));
  ok(bakiye > maliyet * 2n, "bakiye maliyetin en az iki kati", ETH(bakiye) + " > " + ETH(maliyet * 2n));

  const kayit = {
    olculdu: new Date().toISOString(), zincir: ZINCIR, dagitici, nonce,
    poolManager: PM, quote: USDG, lzEndpoint: LZ_ENDPOINT, isletme: ISLETME,
    tahminler: T, hookSalt: m.salt, gaz: toplam.toString(), maliyet: maliyet.toString(), uygulandiMi: false,
  };
  fs.writeFileSync(planYolu, JSON.stringify(kayit, null, 1));

  if (!UYGULA || kotu > 0) {
    console.log("");
    console.log(UYGULA ? "DURDURULDU — " + kotu + " sav gecmedi." : "KURU CALISMA BITTI — hicbir islem gonderilmedi.");
    console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
    process.exit(kotu === 0 ? 0 : 1);
  }

  console.log("");
  console.log("=== UYGULA ===");
  let atlanan = 0;
  for (const a of adimlar) { const k = await p.getCode(a.beklenen); if (k && k !== "0x") atlanan++; else break; }
  const createAtlanan = Math.min(atlanan, adimlar.length - 1);
  if (zincirNonce !== nonce + createAtlanan + (atlanan === adimlar.length ? 1 : 0)) {
    console.log("DURDURULDU — nonce beklenenle tutmuyor: plan " + nonce + ", dusen " + atlanan + ", zincir " + zincirNonce);
    process.exit(1);
  }
  const dagitilan = {};
  for (const a of adimlar) {
    process.stdout.write("  " + (a.sira + 1) + ". " + a.ad.padEnd(20));
    if (a.sira < atlanan) { dagitilan[a.ad] = a.beklenen; console.log(a.beklenen + "  (zincirde)"); continue; }
    const to = a.create2 ? CREATE2_FACTORY : null;
    const data = a.create2 ? m.salt + a.init.slice(2) : a.init;
    let islem = null, son = null;
    for (let d = 0; d < 6 && !islem; d++) {
      if (d > 0) await bekle(4000 * d);
      try {
        const t = Transaction.from({ to, data, nonce: nonce + Math.min(a.sira, adimlar.length - 1), chainId: ZINCIR,
          gasLimit: (a.gaz * 13n) / 10n, maxFeePerGas: birim * 2n, maxPriorityFeePerGas: 0n, type: 2 });
        t.signature = cuzdan.signingKey.sign(t.unsignedHash);
        islem = await p.broadcastTransaction(t.serialized);
      } catch (e) { son = e; if (!/rate limit|too many|timeout|503|502|ECONNRESET/i.test(e.message || "")) break; }
    }
    if (!islem) { console.log("GONDERILEMEDI: " + ((son && son.message) || "?").slice(0, 120)); process.exit(1); }
    const mk = await islem.wait();
    const dustu = a.create2 ? a.beklenen : mk.contractAddress;
    if (!dustu || dustu.toLowerCase() !== a.beklenen.toLowerCase()) { console.log("SAPMA " + dustu); process.exit(1); }
    let k = "0x";
    for (let d = 0; d < 6 && (!k || k === "0x"); d++) { if (d) await bekle(2000); try { k = await p.getCode(dustu); } catch (e) { k = "0x"; } }
    const boy = (k.length - 2) / 2, beklenenBoy = (B(a.ad).deployedBytecode.length - 2) / 2;
    if (boy !== beklenenBoy) { console.log("KOD UYUSMUYOR " + boy + " / " + beklenenBoy); process.exit(1); }
    dagitilan[a.ad] = dustu;
    console.log(dustu + "  " + boy + " bayt  gaz " + mk.gasUsed);
  }
  const sonBakiye = await p.getBalance(dagitici);
  kayit.uygulandiMi = true; kayit.dagitilan = dagitilan; kayit.dagitimZamani = new Date().toISOString();
  kayit.harcanan = (bakiye - sonBakiye).toString();
  fs.writeFileSync(planYolu, JSON.stringify(kayit, null, 1));
  console.log("");
  console.log("  harcanan " + ETH(bakiye - sonBakiye) + "  kalan " + ETH(sonBakiye));
  console.log("  DAGITILDI. Sirada: node scripts/denetim-dagitim-robinhood.js");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
