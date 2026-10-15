"use strict";
/* ===========================================================================
 * dagit-arc-kapali.js — an Arc launchpad whose cross-chain path is closed
 *
 *   node scripts/dagit-arc-kapali.js            # dry run
 *   node scripts/dagit-arc-kapali.js --uygula
 *
 * WHY
 *   The Arc launchpad of 13 Oct (0xB6AC…2300) is wired to a live
 *   CrossChainAssetRegistry (Ethereum + Base). Read against Circle's CCTP V2
 *   on 14 Oct 2026, that path cannot complete:
 *     - KopruKasasi sends with depositForBurnWithHook. MessageTransmitterV2
 *       calls the message's recipient — the destination TokenMessengerV2 —
 *       which mints to the remote vault and runs nothing else. Circle: "CCTP
 *       does not implement hook execution in the core protocol". The remote
 *       vault's handleReceive* (the only thing that credits bekleyenQuote)
 *       is never called, so the minted USDC sits there with no way out.
 *     - The way home names Arc's KasaFabrika (0x66a3…) as recipient, which
 *       has no function that moves USDC.
 *   And CrossChainCollateralManager.transferBaslat is permissionless: anyone
 *   could push 20% of a vault's free collateral per call, 40% per ~hour,
 *   into that dead end. No launch has used that launchpad (launchCount 0),
 *   so nothing is lost; the next one would have been exposed.
 *
 *   This deploys the stack the eight other chains already run: identical
 *   bytecode, KapaliKayit as the registry (destekliMi is false, so the
 *   transfer stops at its first check), tokenMessenger/transmitter unused.
 *   Redemption, buyback and the dollar guarantee are untouched. Conversion
 *   returns with the next generation, whose vault calls receiveMessage
 *   itself as the named destinationCaller.
 *
 *   Developer fund: the Arc DevPool already governed by the FTHM DAO
 *   (dagitim-pulse2.json), so Arc's fee stream stays in one place.
 *
 * Order (CREATE, nonces read first): YoneticiFabrika KasaFabrika KapaliKayit
 * PulseFabrika PulseLikiditeKasasi PulseLaunchpad, then PulseHook by CREATE2
 * at a mined 0xACC address. Record: dagitim-arc-kapali.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, AbiCoder, keccak256, getCreateAddress, getCreate2Address, getAddress } = require("ethers");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-arc-kapali.json");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const P2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-pulse2.json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const ic = (n, t, d) => B(n).bytecode + (t.length ? coder.encode(t, d).slice(2) : "");
const A = (x) => getAddress(String(x).toLowerCase());
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const C2 = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const ISLETME = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const HOOK_BITLERI = 0xACC, MASKE = (1 << 14) - 1;
const UYGULA = process.argv.includes("--uygula");

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) { const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {}); if (d > 7 || !/rate|limit|timeout|503|502|429|ECONNRESET|fetch failed|coalesce/i.test(m)) throw e; await bekle(2500 * (d + 1)); }
  }
}

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const p = new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true });
  const w = new Wallet(pk, p);
  const D = w.address;
  const r = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(r, null, 1)); };
  const kod = async (a) => !!a && (await israr(() => p.getCode(a))).length > 2;
  const quote = A(P2.arc.quote), PM = A(P2.arc.poolManager), DEVPOOL = A(P2.arc.devPool);
  console.log("ARC KAPALI YIGIN  " + (UYGULA ? "UYGULA" : "KURU") + "   DevPool " + DEVPOOL);

  const n0 = r.nonce != null ? r.nonce : await israr(() => p.getTransactionCount(D, "pending"));
  if (r.nonce == null) { r.nonce = n0; yaz(); }
  const sira = ["YoneticiFabrika", "KasaFabrika", "KapaliKayit", "PulseFabrika", "PulseLikiditeKasasi", "PulseLaunchpad"];
  const T = {};
  sira.forEach((n, i) => { T[n] = getCreateAddress({ from: D, nonce: n0 + i }); });
  const hookInit = ic("PulseHook", ["address", "address", "address", "address", "address", "address"],
    [PM, T.PulseLaunchpad, quote, DEVPOOL, T.PulseLikiditeKasasi, ISLETME]);
  const hh = keccak256(hookInit);
  if (!r.hookSalt || r.hookInitHash !== hh) {
    for (let i = 0; ; i++) {
      const s = "0x" + i.toString(16).padStart(64, "0");
      const a = getCreate2Address(C2, s, hh);
      if ((parseInt(a.slice(-4), 16) & MASKE) === HOOK_BITLERI) { r.hookSalt = s; r.PulseHook = a; break; }
    }
    r.hookInitHash = hh; yaz();
  }
  const init = {
    YoneticiFabrika: () => ic("YoneticiFabrika", [], []),
    KasaFabrika: () => ic("KasaFabrika", ["address"], [T.YoneticiFabrika]),
    KapaliKayit: () => ic("KapaliKayit", [], []),
    PulseFabrika: () => ic("PulseFabrika", [], []),
    PulseLikiditeKasasi: () => ic("PulseLikiditeKasasi", ["address", "address"], [quote, T.PulseLaunchpad]),
    PulseLaunchpad: () => ic("PulseLaunchpad",
      ["address", "address", "address", "address", "address", "address", "address", "address", "address", "address", "address"],
      [quote, PM, r.PulseHook, T.PulseFabrika, T.KasaFabrika, DEVPOOL, T.PulseLikiditeKasasi, ISLETME, T.KapaliKayit, DEAD, DEAD]),
  };
  const gonder = async (etiket, tx) => {
    if (!UYGULA) {
      let g; try { g = "gaz " + (await israr(() => p.estimateGas({ from: D, ...tx }))); } catch (e) { g = "olculemedi (" + (e.shortMessage || e.message).slice(0, 60) + ")"; }
      console.log("  (kuru) " + etiket.padEnd(22) + g); return null;
    }
    const t = await israr(() => w.sendTransaction(tx));
    let m = null; while (!m) { await bekle(1500); m = await israr(() => p.getTransactionReceipt(t.hash)); }
    if (m.status !== 1) throw new Error(etiket + " basarisiz " + t.hash);
    console.log("  " + etiket.padEnd(22) + t.hash + "  gaz " + m.gasUsed);
    return m;
  };
  for (const [i, n] of sira.entries()) {
    if (await kod(T[n])) { console.log("  " + n.padEnd(22) + T[n] + "  (zincirde)"); r[n] = T[n]; continue; }
    const tx = { data: init[n]() };
    if (UYGULA) {
      const simdi = await israr(() => p.getTransactionCount(D, "pending"));
      if (simdi !== n0 + i) throw new Error(n + ": nonce " + simdi + ", beklenen " + (n0 + i));
      tx.nonce = n0 + i;
    }
    const m = await gonder(n, tx);
    if (m) {
      if (m.contractAddress.toLowerCase() !== T[n].toLowerCase()) throw new Error(n + " sapti " + m.contractAddress);
      r[n] = T[n]; yaz();
    }
  }
  if (await kod(r.PulseHook)) console.log("  PulseHook".padEnd(24) + r.PulseHook + "  (zincirde)");
  else {
    await gonder("PulseHook", { to: C2, data: r.hookSalt + hookInit.slice(2) });
    if (UYGULA) for (let i = 0; i < 20 && !(await kod(r.PulseHook)); i++) await bekle(3000);
  }
  Object.assign(r, { quote, poolManager: PM, DevPool: DEVPOOL, emekli: { launchpad: A(P2.arc.launchpad), kayit: A(P2.paylasilan.kayit),
    neden: "canli CCTP kaydina bagli; KopruKasasi'nin CCTP alimi calismiyor (hook cekirdekte yurutulmez), donus alicisi KasaFabrika — launch 0" } });
  if (UYGULA) { r.zaman = new Date().toISOString(); yaz(); }
  console.log("  launchpad " + T.PulseLaunchpad + "   hook " + r.PulseHook);
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
