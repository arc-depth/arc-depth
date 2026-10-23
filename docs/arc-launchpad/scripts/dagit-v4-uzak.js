"use strict";
/* ===========================================================================
 * dagit-v4-uzak.js — Solana, Sui and Aptos onto the v4 Defter, with the
 * vaults' DEX path (arastirma/v4-tasarim.md, section 5)
 *
 *   set NODE_PATH=C:/Users/omen/araclar/sol/node_modules;C:/Users/omen/araclar/suisdk/node_modules;C:/Users/omen/araclar/aptossdk/node_modules
 *   node scripts/dagit-v4-uzak.js [solana|sui|aptos ...]            dry: builds, reads, simulates what can be simulated
 *   node scripts/dagit-v4-uzak.js [solana|sui|aptos ...] --uygula   sends (user command only)
 *
 * Reads the v4 record (V4_KAYIT, else dagitim-v4.json, written by
 * `dagit-v2.js v4`): the v4 Defter and IkizHub on Arc, the v4 AktarmaLZ on
 * Base; the Arc HaberciLZ is kept (dagitim-v2.json). Without a v4 record a
 * dry run still builds and simulates, with the v2 addresses standing in.
 * Writes what Arc's wiring needs (the new Sui vault) into the v4 record's
 * `uzak`. The pools each vault lists come from docs/veri/v4-uzak-liste.json.
 *
 * SOLANA (program ids, config, store, Arc bindings unchanged)
 *   1 upgrade pulse-sepet and pulse-kapi (mainnet builds, target/ana-ag)
 *   2 pulse-sepet DefterDegistir (once): config.defter = v4 Defter, ikiz = Arc HaberciLZ
 *   3 pulse-sepet ListeEkle: each listed mint's Raydium CLMM pool
 *   4 pulse-kapi: the endpoint's nonce for the v4 IkizHub (the store's delegate is still the
 *     deployer), a new address lookup table holding `sabitler` for it, frozen; HubDegistir (once)
 * SUI (the package's CCTP identity is per package and stays)
 *   1 upgrade the package (compatible: the DEX path is new functions only)
 *   2 haberci::kur<USDC>(8, 26, v4 Defter) -> a new Haberci and Kasa; ikiz_ekle(26, Arc HaberciLZ)
 *   3 haberci::liste_ekle_a/_b: each listed coin's Cetus pool, its size cap
 *   4 the twin gate: oapp::set_peer(Base, v4 AktarmaLZ), built here (GraphQL; no JSON-RPC)
 * APTOS (the Haberci object is the twin Arc names, write-once there: it stays)
 *   1 upgrade pulse_sepet (compatible; adds the dex dependency)
 *   2 haberci::defter_degistir (once): v4 Defter
 *   3 haberci::liste_ekle: each listed asset's Hyperion pool, its size cap
 *   4 the twin gate: oapp_core::set_peer(Base, v4 AktarmaLZ)
 * Nothing here locks: the seals (Solana Muhurle, Sui/Aptos kilitle) are in
 * scripts/kilitle-v2.js, after the joint test.
 *
 * v5 (24 Oct 2026): `node scripts/dagit-v4-uzak.js v5 [solana|sui|aptos] [--uygula]`
 * (or V4_KAYIT=dagitim-v5.json) points the three chains at the v5 Defter and
 * IkizHub the same way. The one-time moves of v4 became repeatable until the
 * seal (Solana DefterDegistir / HubDegistir, Aptos defter_degistir), so
 * Solana and Aptos are upgraded once more; the Solana gate also gets 3.5M gas
 * toward Arc (SecenekDegistir: a sale from Solana reaches the Arc pool, whose
 * hook now requires the gas the tax may need). Sui needs no upgrade: a new
 * haberci::kur names the v5 Defter. Low memory: DERLEME_YOK=1 uses the builds
 * in target/ana-ag; programs go up over TPU (no --use-rpc); an extension is
 * at least 10,240 bytes.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const V5 = process.argv.includes("v5");
const SECILEN = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== "v5");
const V2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-v2.json"), "utf8"));
const V4_YOL = process.env.V4_KAYIT || path.join(KOK, V5 ? "dagitim-v5.json" : "dagitim-v4.json");
/* v5: the Solana gate's options toward Arc, lzReceive gas there (type 3, executor) */
const GONDER_GAZ_V5 = 3_500_000n;
const V4_VAR = fs.existsSync(V4_YOL);
const V4 = V4_VAR ? JSON.parse(fs.readFileSync(V4_YOL, "utf8")) : { zincir: { arc: {}, base: {} } };
const LISTE = JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "v4-uzak-liste.json"), "utf8"));
const ENV = fs.readFileSync(path.join(KOK, ".env"), "utf8");
const ozel = (ad) => { const m = ENV.match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
const yaz = () => { if (UYGULA && V4_VAR) fs.writeFileSync(V4_YOL, JSON.stringify(V4, null, 1)); };
const pad = (a) => "0x" + a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

const ARC = (V4.zincir && V4.zincir.arc) || {};
const DEFTER = V4.defter || ARC.SepetDefteri || V2.zincir.arc.SepetDefteri;
const HUB = ARC.IkizHub || V2.zincir.arc.IkizHub;
const HABERCI = (ARC.HaberciLZ || V2.zincir.arc.HaberciLZ);
const AKTARMA = (V4.zincir.base && V4.zincir.base.AktarmaLZ) || V2.zincir.base.AktarmaLZ;
const ARC_EID = 30417, BASE_EID = 30184;

/* ---- Solana ---------------------------------------------------------------- */
async function solana() {
  const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram, AddressLookupTableProgram,
    SYSVAR_INSTRUCTIONS_PUBKEY } = require("@solana/web3.js");
  const spl = require("@solana/spl-token");
  const lz = require("@layerzerolabs/lz-solana-sdk-v2");
  const RPC = "https://api.mainnet-beta.solana.com";
  const CLI = "C:/Users/omen/araclar/sol-tool/solana-release/bin/solana.exe";
  const SOL_TOOL = "C:/Users/omen/araclar/sol-tool";
  const ENDPOINT = lz.EndpointProgram.PROGRAM_ID;
  const MPL = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
  const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
  const conn = new Connection(RPC, "confirmed");
  const d = Keypair.fromSeed(Buffer.from(ozel("SOLANA_PRIVATE_KEY").match(/[0-9a-fA-F]{64}/)[0], "hex"));
  const S = V2.uzak.solana;
  const SEPET = new PublicKey(S.sepetProgram), KAPI = new PublicKey(S.kapiProgram);
  const pda = (s, p) => PublicKey.findProgramAddressSync(s, p)[0];
  const b32 = (h) => Buffer.from(pad(h).slice(2), "hex");
  const sol = (l) => (Number(l) / 1e9).toFixed(4);
  console.log("SOLANA  dagitici " + d.publicKey.toBase58() + "  bakiye " + sol(await conn.getBalance(d.publicKey)) + " SOL");
  const gonder = async (etiket, ixs) => {
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), ...ixs);
    tx.feePayer = d.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(d);
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) throw new Error(etiket + " simulasyon: " + JSON.stringify(sim.value.err) + "\n" + (sim.value.logs || []).slice(-5).join("\n"));
    if (!UYGULA) { console.log("  (kuru) " + etiket.padEnd(46) + "simulasyon tamam"); return null; }
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    const r = await conn.confirmTransaction(sig, "confirmed");
    if (r.value.err) throw new Error(etiket + " basarisiz " + sig);
    console.log("  " + etiket.padEnd(46) + sig);
    return sig;
  };

  /* 1 the mainnet builds, then upgrade what differs */
  const derle = (dizin) => {
    const L = SOL_TOOL + "/llvm-mingw-20261006-ucrt-x86_64/bin";
    const env = { ...process.env, PATH: "C:\\Users\\omen\\.cargo\\bin;" + process.env.PATH + ";" + SOL_TOOL + "/dlltool",
      CC_x86_64_pc_windows_gnu: L + "/x86_64-w64-mingw32-clang.exe", AR_x86_64_pc_windows_gnu: L + "/llvm-ar.exe" };
    cp.execFileSync(SOL_TOOL + "/solana-release/bin/cargo-build-sbf.exe", ["--sbf-out-dir", "target/ana-ag"], { cwd: path.join(KOK, dizin), env, stdio: "ignore" });
  };
  const gecici = path.join(KOK, "ozel", ".gecici-dagitici.json");
  let guncel = true, kalici = 0, enBuyukTampon = 0;
  try {
    for (const [ad, id, dizin, so, anahtar] of [["pulse-sepet", SEPET, "solana/pulse-sepet", "solana/pulse-sepet/target/ana-ag/pulse_sepet.so", "pulse_sepet-keypair.json"],
      ["pulse-kapi", KAPI, "solana/pulse-kapi", "solana/pulse-kapi/target/ana-ag/pulse_kapi.so", "pulse_kapi-keypair.json"]]) {
      /* DERLEME_YOK=1: use the build already in target/ana-ag (the compiler takes 1-2 GB; twice the
         machine ran short of memory and the upload was stopped, 23 Oct) */
      if (!(process.env.DERLEME_YOK && fs.existsSync(path.join(KOK, so)))) derle(dizin);
      const kod = fs.readFileSync(path.join(KOK, so));
      const pd = pda([id.toBuffer()], new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"));
      const v = (await conn.getAccountInfo(pd)).data;
      const ayni = v.length - 45 >= kod.length && Buffer.compare(v.subarray(45, 45 + kod.length), kod) === 0 && v.subarray(45 + kod.length).every((x) => x === 0);
      if (ayni) { console.log("  yukseltme " + ad.padEnd(36) + "tamam, kod guncel"); continue; }
      guncel = false;
      const yetki = v[12] === 1 ? new PublicKey(v.subarray(13, 45)).toBase58() : null;
      if (yetki !== d.publicKey.toBase58()) throw new Error(ad + ": yukseltme yetkisi dagiticida degil (" + yetki + ")");
      /* the loader now refuses an extension under 10,240 bytes (23 Oct) */
      const ek = kod.length > v.length - 45 ? Math.max(10_240, kod.length - (v.length - 45)) : 0;
      const tampon = await conn.getMinimumBalanceForRentExemption(kod.length + 37);
      const pdHesap = await conn.getAccountInfo(pd);
      kalici += Math.max(0, (await conn.getMinimumBalanceForRentExemption(kod.length + 45)) - pdHesap.lamports);
      enBuyukTampon = Math.max(enBuyukTampon, tampon);
      if (!UYGULA) { console.log("  (kuru) yukselt " + ad.padEnd(12) + (kod.length / 1024).toFixed(1) + " KB (zincirde " + ((v.length - 45) / 1024).toFixed(1) + " KB)" + (ek ? "  genislet +" + ek + " bayt" : "") + "  tampon " + sol(tampon) + " SOL (iade)"); continue; }
      fs.writeFileSync(gecici, JSON.stringify(Array.from(d.secretKey)));
      if (ek) cp.execFileSync(CLI, ["program", "extend", id.toBase58(), String(ek), "-u", RPC, "-k", gecici], { encoding: "utf8" });
      const out = cp.execFileSync(CLI, ["program", "deploy", "--with-compute-unit-price", "50000", "--max-sign-attempts", "50",
        "--program-id", path.join(KOK, "ozel", "solana-programlar", anahtar), path.join(KOK, so), "-u", RPC, "-k", gecici], { encoding: "utf8" });
      console.log("  yukselt " + ad.padEnd(38) + ((out.match(/Signature: (\w+)/) || [])[1]));
    }
  } finally { if (fs.existsSync(gecici)) fs.unlinkSync(gecici); }
  if (!guncel && !UYGULA) {
    const bak = await conn.getBalance(d.publicKey);
    const tepe = kalici + enBuyukTampon + 2_000_000 + 0.05e9;   // + the new lookup table, the nonce, fees
    console.log("  (kuru) GEREKEN tepe ~" + sol(tepe) + " SOL (kalici genisletme " + sol(kalici) + " + en buyuk tampon " + sol(enBuyukTampon) + ", iade) bakiye " + sol(bak) +
      (bak >= tepe ? "  YETER" : "  EKSIK ~" + sol(tepe - bak) + " SOL"));
    console.log("  (kuru) 2-4 yeni talimatlar: programlar yukseltilince simule edilir (tests/sepet_v4.rs, tests/kapi.rs yerelde)");
  }

  const R = (k) => ({ pubkey: k, isSigner: false, isWritable: false }), W = (k) => ({ pubkey: k, isSigner: false, isWritable: true });
  const SG = { pubkey: d.publicKey, isSigner: true, isWritable: true };
  const config = pda([Buffer.from("config")], SEPET);
  const muhur = pda([Buffer.from("muhur")], SEPET);
  const calis = guncel || UYGULA;

  /* 2 the Defter, once */
  const cfg = (await conn.getAccountInfo(config)).data;
  const simdiki = "0x" + Buffer.from(cfg.subarray(114, 146)).toString("hex");
  if (simdiki === pad(DEFTER)) console.log("  DefterDegistir".padEnd(48) + "tamam  " + DEFTER);
  else if (calis) await gonder("DefterDegistir -> " + DEFTER, [new TransactionInstruction({ programId: SEPET,
    keys: [SG, W(config), W(pda([Buffer.from("defter-degisti")], SEPET)), R(muhur), R(SystemProgram.programId)],
    data: Buffer.concat([Buffer.from([13]), b32(DEFTER), b32(HABERCI)]) })]);

  /* 3 the list */
  const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  for (const x of LISTE.solana) {
    const mint = new PublicKey(x.varlik), havuz = new PublicKey(x.havuz);
    const liste = pda([Buffer.from("liste"), mint.toBuffer()], SEPET);
    const l = await conn.getAccountInfo(liste);
    if (l && new PublicKey(l.data.subarray(1, 33)).equals(havuz)) { console.log(("  ListeEkle " + x.ad).padEnd(48) + "tamam"); continue; }
    if (calis) await gonder("ListeEkle " + x.ad + " (Raydium " + x.havuz.slice(0, 6) + "…)", [new TransactionInstruction({ programId: SEPET,
      keys: [SG, R(config), W(liste), R(mint), R(havuz), R(muhur), R(SystemProgram.programId)], data: Buffer.from([12]) })]);
  }

  /* 4 the gate onto the v4 IkizHub */
  const store = pda([Buffer.from("Store")], KAPI);
  const st = (await conn.getAccountInfo(store)).data;
  const hubSimdi = "0x" + Buffer.from(st.subarray(38, 70)).toString("hex");
  if (hubSimdi === pad(HUB)) { console.log("  HubDegistir".padEnd(48) + "tamam  " + HUB); }
  else {
    const ep = new lz.EndpointProgram.Endpoint(ENDPOINT);
    const epd = new lz.EndpointPDADeriver(ENDPOINT);
    const hub = b32(HUB);
    const nonce = epd.nonce(store, ARC_EID, hub)[0];
    if (await conn.getAccountInfo(nonce)) console.log("  LZ nonce (v4 IkizHub)".padEnd(48) + "tamam");
    else await gonder("LZ nonce (v4 IkizHub " + HUB.slice(0, 10) + "…)", [ep.initOAppNonce(d.publicKey, ARC_EID, store, hub)]);
    const sabitler = [ENDPOINT, store, pda([Buffer.from("OApp"), store.toBuffer()], ENDPOINT), pda([Buffer.from("Endpoint")], ENDPOINT),
      pda([Buffer.from("__event_authority")], ENDPOINT), nonce, epd.nonce(store, ARC_EID, b32(HABERCI))[0],
      spl.TOKEN_PROGRAM_ID, ATA_PROGRAM, SystemProgram.programId, MPL, SEPET, config, SYSVAR_INSTRUCTIONS_PUBKEY];
    if (!UYGULA) {
      console.log("  (kuru) yeni adres tablosu: olustur + " + sabitler.length + " adres + dondur, sonra HubDegistir (pulse-kapi yukseltilince)");
    } else {
      V4.uzak ||= {}; V4.uzak.solana ||= {};
      let tablo = V4.uzak.solana.alt ? new PublicKey(V4.uzak.solana.alt) : null;
      if (!tablo || !(await conn.getAccountInfo(tablo))) {
        const [ix, adr] = AddressLookupTableProgram.createLookupTable({ authority: d.publicKey, payer: d.publicKey, recentSlot: (await conn.getSlot("confirmed")) - 2 });
        await gonder("adres tablosu olustur", [ix]);
        tablo = adr; V4.uzak.solana.alt = adr.toBase58(); yaz();
      }
      const t = await conn.getAddressLookupTable(tablo, { commitment: "confirmed" });
      if (t.value.state.addresses.length === 0)
        await gonder("adres tablosu: " + sabitler.length + " adres", [AddressLookupTableProgram.extendLookupTable({ lookupTable: tablo, authority: d.publicKey, payer: d.publicKey, addresses: sabitler })]);
      for (let i = 0; i < 30; i++) { const v = (await conn.getAddressLookupTable(tablo, { commitment: "confirmed" })).value; if (v && v.state.addresses.length === sabitler.length) break; await new Promise((x) => setTimeout(x, 1000)); }
      const v = (await conn.getAddressLookupTable(tablo, { commitment: "confirmed" })).value;
      if (!v.state.addresses.every((x, i) => x.equals(sabitler[i]))) throw new Error("adres tablosu beklenen sirada degil");
      if (v.state.authority) await gonder("adres tablosunu dondur", [AddressLookupTableProgram.freezeLookupTable({ lookupTable: tablo, authority: d.publicKey })]);
      await gonder("HubDegistir -> " + HUB, [new TransactionInstruction({ programId: KAPI,
        keys: [SG, W(store), W(pda([Buffer.from("hub-degisti")], KAPI)), W(pda([Buffer.from("Alt")], KAPI)), R(tablo), R(SystemProgram.programId)],
        data: Buffer.concat([Buffer.from([4]), hub]) })]);
    }
  }
  /* 5 (v5) the options every Gonder carries toward Arc */
  if (V5) {
    const hedef = Buffer.concat([Buffer.from([0, 3, 1, 0, 0x11, 1]), Buffer.from(GONDER_GAZ_V5.toString(16).padStart(32, "0"), "hex")]);
    const st2 = (await conn.getAccountInfo(store)).data;
    const n = st2.readUInt16LE(166);
    if (n === hedef.length && Buffer.compare(st2.subarray(168, 168 + n), hedef) === 0) console.log("  SecenekDegistir".padEnd(48) + "tamam  " + GONDER_GAZ_V5 + " gaz");
    else if (calis) {
      const len = Buffer.alloc(2); len.writeUInt16LE(hedef.length);
      await gonder("SecenekDegistir -> lzReceive " + GONDER_GAZ_V5 + " gaz", [new TransactionInstruction({ programId: KAPI, keys: [SG, W(store)],
        data: Buffer.concat([Buffer.from([5]), len, hedef]) })]);
      V4.uzak ||= {}; V4.uzak.solana ||= {}; V4.uzak.solana.gonderSecenek = "0x" + hedef.toString("hex"); yaz();
    }
  }
  console.log("  ARC TARAFI: IkizHub'in Solana (30168) yurutucu maxMessageSize'i (dagit-v2.js baglamasi)");
}

/* ---- Sui -------------------------------------------------------------------- */
async function sui() {
  const { Transaction, Inputs } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const k = V2.uzak.sui;
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
  const gql = (q, v) => fetch("https://graphql.mainnet.sui.io/graphql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: q, variables: v }) })
    .then((r) => r.json()).then((j) => { if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data; });
  const sahipli = async (id) => { const o = (await gql(`{ object(address:"${id}"){ version digest } }`)).object; return Inputs.ObjectRef({ objectId: id, version: o.version, digest: o.digest }); };
  const paylasilan = async (id, mutable) => { const o = (await gql(`{ object(address:"${id}"){ owner { ... on Shared { initialSharedVersion } } } }`)).object; return Inputs.SharedObjectRef({ objectId: id, initialSharedVersion: o.owner.initialSharedVersion, mutable }); };
  const fiyat = BigInt((await gql(`{ epoch { referenceGasPrice } }`)).epoch.referenceGasPrice);
  const bakiye = (await gql(`{ address(address:"${ben}"){ balance(coinType:"0x2::sui::SUI"){ totalBalance } } }`)).address.balance.totalBalance;
  console.log("SUI  " + ben + "  bakiye " + (Number(bakiye) / 1e9).toFixed(4) + " SUI");
  /* simulate on mainnet state (GraphQL), then sign and execute (GraphQL) */
  const calistir = async (etiket, kur) => {
    const tx = new Transaction();
    tx.setSender(ben); tx.setGasPrice(fiyat); tx.setGasBudget(600_000_000n);
    const gaz = (await gql(`{ address(address:"${ben}"){ objects(filter:{type:"0x2::coin::Coin<0x2::sui::SUI>"}, first: 5){ nodes { address version digest } } } }`)).address.objects.nodes;
    tx.setGasPayment(gaz.map((g) => ({ objectId: g.address, version: g.version, digest: g.digest })));
    await kur(tx);
    const bytes = await tx.build();
    const b64 = Buffer.from(bytes).toString("base64");
    const sim = (await gql(`query($t: JSON!){ simulateTransaction(transaction: $t) { effects { status executionError { message } gasEffects { gasSummary { computationCost storageCost storageRebate } } } } }`, { t: { bcs: { value: b64 } } })).simulateTransaction.effects;
    if (sim.status !== "SUCCESS") throw new Error("Sui " + etiket + " simulasyon: " + JSON.stringify(sim.executionError));
    const g = sim.gasEffects.gasSummary;
    const ucret = (Number(g.computationCost) + Number(g.storageCost) - Number(g.storageRebate)) / 1e9;
    if (!UYGULA) { console.log("  (kuru) Sui " + etiket.padEnd(40) + "simulasyon tamam, ~" + ucret.toFixed(4) + " SUI"); return null; }
    const { signature } = await imzaci.signTransaction(bytes);
    const r = (await gql(`mutation($b: Base64!, $s: [Base64!]!){ executeTransaction(transactionDataBcs: $b, signatures: $s) { effects { status digest objectChanges { nodes { address outputState { asMoveObject { contents { type { repr } } } } } } } } }`,
      { b: b64, s: [signature] })).executeTransaction.effects;
    if (r.status !== "SUCCESS") throw new Error("Sui " + etiket + " " + r.digest);
    console.log("  Sui " + etiket.padEnd(44) + r.digest);
    return r;
  };

  /* 1 the upgrade */
  const cikti = cp.execFileSync("C:/Users/omen/araclar/sui/sui.exe", ["move", "build", "-e", "mainnet", "--dump-bytecode-as-base64", "--path", path.join(KOK, "sui", "pulse-sepet")],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20, env: { ...process.env, SUI_CONFIG_DIR: path.join(KOK, "ozel", "sui-ana-cfg") } });
  const { modules, dependencies, digest } = JSON.parse(cikti.slice(cikti.indexOf("{")));
  V4.uzak ||= {};
  const u = (V4.uzak.sui ||= { ...k });
  if (u.v4Paket) console.log("  yukseltme".padEnd(48) + "tamam  " + u.v4Paket);
  else {
    const r = await calistir("paket yukseltme (compatible)", async (tx) => {
      const cap = tx.object(await sahipli(k.upgradeCap));
      const bilet = tx.moveCall({ target: "0x2::package::authorize_upgrade", arguments: [cap, tx.pure.u8(0), tx.pure.vector("u8", digest)] });
      const makbuz = tx.upgrade({ modules, dependencies, package: k.paket, ticket: bilet });
      tx.moveCall({ target: "0x2::package::commit_upgrade", arguments: [cap, makbuz] });
    });
    /* the cap names the new package once the indexer has the upgrade (it lagged on 23 Oct and gave the old id) */
    if (r) for (let i = 0; i < 30 && !u.v4Paket; i++) {
      const pk = (await gql(`{ object(address:"${k.upgradeCap}"){ asMoveObject { contents { json } } } }`)).object.asMoveObject.contents.json.package;
      if (pk !== k.paket) { u.v4Paket = pk; yaz(); } else await new Promise((ok) => setTimeout(ok, 2000));
    }
  }
  if (!u.v4Paket) { console.log("  (kuru) 2-4 yukseltilmis paketle simule edilir (yerelde: sui move test 22/22)"); return; }
  const P = u.v4Paket;

  /* 2 a receiver and vault for the v4 Defter */
  if (!u.v4Haberci) {
    const r = await calistir("haberci::kur<USDC>(8, 26, v4 Defter)", async (tx) => {
      tx.moveCall({ target: P + "::haberci::kur", typeArguments: [USDC], arguments: [tx.pure.u32(8), tx.pure.u32(26), tx.pure.address(pad(DEFTER))] });
    });
    if (r) {
      for (const n of r.objectChanges.nodes) {
        const t = n.outputState && n.outputState.asMoveObject && n.outputState.asMoveObject.contents.type.repr;
        if (t && t.endsWith("::haberci::Haberci")) u.v4Haberci = n.address;
        if (t && t.includes("::kasa::Kasa<")) { u.v4Kasa = n.address; u.kasa = pad(n.address); }
      }
      yaz();
    }
  }
  if (u.v4Haberci && !u.v4IkizEklendi) {
    const r = await calistir("ikiz_ekle(26, Arc HaberciLZ)", async (tx) => {
      tx.moveCall({ target: P + "::haberci::ikiz_ekle", arguments: [tx.object(await paylasilan(u.v4Haberci, true)), tx.pure.u32(26), tx.pure.address(pad(HABERCI))] });
    });
    if (r) { u.v4IkizEklendi = r.digest; yaz(); }
  }
  /* 3 the list */
  for (const x of LISTE.sui) {
    if ((u.v4Liste || {})[x.ad]) { console.log(("  liste " + x.ad).padEnd(48) + "tamam"); continue; }
    const r = await calistir("liste_ekle_" + (x.dolar_a ? "a" : "b") + " " + x.ad + " (Cetus " + x.havuz.slice(0, 8) + "…, tavan $" + x.tavan / 1e6 + ")", async (tx) => {
      tx.moveCall({ target: P + "::haberci::liste_ekle_" + (x.dolar_a ? "a" : "b"), typeArguments: [USDC, x.varlik],
        arguments: [tx.object(await paylasilan(u.v4Haberci, false)), tx.object(await paylasilan(u.v4Kasa, true)), tx.object(await paylasilan(x.havuz, false)),
          tx.pure.u64(x.tavan), tx.object(Inputs.SharedObjectRef({ objectId: "0x6", initialSharedVersion: 1, mutable: false }))] });
    });
    if (r) { (u.v4Liste ||= {})[x.ad] = r.digest; yaz(); }
  }
  /* 4 the twin gate onto the v4 AktarmaLZ: oapp::set_peer built here and sent through GraphQL
     (public JSON-RPC is gone, 23 Oct). The objects: LayerZero's oapp and utils packages and the
     EndpointV2 object (LayerZero's Sui deployment), the gate's OApp and AdminCap, and its messaging
     channel (created when the gate registered, transaction `kuruldu`). */
  const LZ_SUI = { oapp: "0xfdc28afc0110cb2edb94e3e57f2b1ce69b5a99c503b06d15e51cfa212de56e24",
    utils: "0x00245ba36f7a1cc643a2b037450dff1e4399e18069c6545fb5fcaaf37d39d7dc",
    endpointV2: "0xd45b6890fa030bcb43347c0c69a9e5a1a288d1ca7b86b428014752b472f6bf91",
    kanal: "0xb4f45b79b7c72d8bc9efa372355d605c9db190b6a82032d03d8c91e7566d32b6" };
  if (u.v4PeerBase === AKTARMA) console.log("  ikiz kapisi peer Base".padEnd(48) + "tamam");
  else {
    const r = await calistir("ikiz kapisi set_peer(Base, v4 AktarmaLZ)", async (tx) => {
      const peer = tx.moveCall({ target: LZ_SUI.utils + "::bytes32::from_bytes", arguments: [tx.pure.vector("u8", Array.from(Buffer.from(pad(AKTARMA).slice(2), "hex")))] });
      tx.moveCall({ target: LZ_SUI.oapp + "::oapp::set_peer", arguments: [tx.object(await paylasilan(k.oapp, true)), tx.object(await sahipli(k.adminCap)),
        tx.object(await paylasilan(LZ_SUI.endpointV2, false)), tx.object(await paylasilan(LZ_SUI.kanal, true)), tx.pure.u32(BASE_EID), peer] });
    });
    if (r) { u.v4PeerBase = AKTARMA; yaz(); }
  }
  console.log("  ARC TARAFI: v4 Defter.bagla Sui (8) kasasi = " + (u.kasa || "(kur sonrasi)") + "; HaberciLZ ikiz[8] degismez");
}

/* ---- Aptos -------------------------------------------------------------------- */
async function aptos() {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey, MoveVector } = require("@aptos-labs/ts-sdk");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const k = V2.uzak.aptos;
  const sepet = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_SEPET2_PRIVATE_KEY")) });
  const ikiz = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_IKIZ_PRIVATE_KEY")) });
  if (sepet.accountAddress.toString() !== k.hesap || ikiz.accountAddress.toString() !== k.ikizHesap) throw new Error("Aptos anahtarlari kayittaki hesaplar degil");
  const apt = async (a) => (await ag.getAccountAPTAmount({ accountAddress: a }).catch(() => 0)) / 1e8;
  console.log("APTOS  sepet " + k.hesap.slice(0, 12) + "… (" + (await apt(k.hesap)) + " APT)  ikiz " + k.ikizHesap.slice(0, 12) + "… (" + (await apt(k.ikizHesap)) + " APT)");
  const gonder = async (imzaci, etiket, data, buyuk) => {
    const tx = await ag.transaction.build.simple({ sender: imzaci.accountAddress, data, options: { maxGasAmount: buyuk ? 400000 : 20000 } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: imzaci.publicKey, transaction: tx });
    if (!sim.success) throw new Error("Aptos " + etiket + " simulasyon: " + sim.vm_status);
    if (!UYGULA) { console.log("  (kuru) Aptos " + etiket.padEnd(40) + "simulasyon tamam, ~" + (Number(sim.gas_used) * Number(sim.gas_unit_price) / 1e8).toFixed(4) + " APT"); return null; }
    const g = await ag.signAndSubmitTransaction({ signer: imzaci, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    if (!r.success) throw new Error("Aptos " + etiket + ": " + r.vm_status);
    console.log("  Aptos " + etiket.padEnd(44) + g.hash);
    return r;
  };
  V4.uzak ||= {};
  const u = (V4.uzak.aptos ||= { ...k });
  const P = k.hesap;
  /* 1 the upgrade: the same build as on the chain plus the v4 functions */
  const fonksiyonlar = (await ag.getAccountModule({ accountAddress: P, moduleName: "kasa" })).abi.exposed_functions.map((f) => f.name);
  /* v5 adds haberci::defter_adresi with the repeatable defter_degistir */
  const hFonk = (await ag.getAccountModule({ accountAddress: P, moduleName: "haberci" })).abi.exposed_functions.map((f) => f.name);
  if (fonksiyonlar.includes("takas_al") && (!V5 || hFonk.includes("defter_adresi"))) console.log("  yukseltme".padEnd(48) + "tamam");
  else {
    const cikti = path.join(KOK, "ozel", "yukseltme-pulse-sepet.json");
    cp.execFileSync("C:/Users/omen/araclar/aptos/aptos.exe", ["move", "build-publish-payload", "--package-dir", path.join(KOK, "aptos", "pulse-sepet"), "--named-addresses", "sepet=" + P,
      "--json-output-file", cikti, "--assume-yes", "--skip-fetch-latest-git-deps"], { stdio: ["ignore", "ignore", "inherit"] });
    const [meta, kod] = JSON.parse(fs.readFileSync(cikti, "utf8")).args.map((a) => a.value);
    await gonder(sepet, "pulse_sepet yukseltme (compatible)", { function: "0x1::code::publish_package_txn",
      functionArguments: [MoveVector.U8(Buffer.from(meta.slice(2), "hex")), new MoveVector(kod.map((c) => MoveVector.U8(Buffer.from(c.slice(2), "hex"))))] }, true);
    if (!UYGULA) { console.log("  (kuru) 2-4 yukseltme sonrasi simule edilir (yerelde: aptos move test 21/21)"); return; }
  }
  /* 2 the Defter, once */
  const hr = await ag.getAccountResource({ accountAddress: k.haberci, resourceType: P + "::haberci::Haberci" });
  if (pad(hr.defter) === pad(DEFTER)) console.log("  defter_degistir".padEnd(48) + "tamam  " + DEFTER);
  else await gonder(sepet, "defter_degistir -> " + DEFTER.slice(0, 12) + "…", { function: P + "::haberci::defter_degistir", functionArguments: [k.haberci, pad(DEFTER)] });
  /* 3 the list */
  for (const x of LISTE.aptos) {
    const var_ = await ag.view({ payload: { function: P + "::kasa::liste", functionArguments: [hr.kasa, x.varlik] } }).catch(() => null);
    if (var_ && var_[0] === x.havuz) { console.log(("  liste " + x.ad).padEnd(48) + "tamam"); continue; }
    await gonder(sepet, "liste_ekle " + x.ad + " (Hyperion " + x.havuz.slice(0, 8) + "…, tavan $" + x.tavan / 1e6 + ")", { function: P + "::haberci::liste_ekle", functionArguments: [k.haberci, x.varlik, x.havuz, x.tavan] });
  }
  /* 4 the twin gate onto the v4 AktarmaLZ */
  const I = k.ikizHesap;
  const peer = await ag.view({ payload: { function: I + "::oapp_core::get_peer", functionArguments: [BASE_EID] } }).catch(() => null);
  if (peer && pad(peer[0]) === pad(AKTARMA)) console.log("  ikiz kapisi peer Base".padEnd(48) + "tamam");
  else await gonder(ikiz, "ikiz kapisi set_peer(Base, " + AKTARMA.slice(0, 10) + "…)", { function: I + "::oapp_core::set_peer", functionArguments: [BASE_EID, MoveVector.U8(Buffer.from(pad(AKTARMA).slice(2), "hex"))] });
}

(async () => {
  console.log("V4 UZAK  " + (UYGULA ? "UYGULA" : "KURU") + "   " + (V4_VAR ? "kayit " + V4_YOL : "v4 kaydi YOK (dagit-v2.js v4): v2 adresleriyle yalniz kuru"));
  console.log("  Defter " + DEFTER + "   IkizHub " + HUB + "   Arc HaberciLZ " + HABERCI + "   Base AktarmaLZ " + AKTARMA);
  if (UYGULA && !V4_VAR) { console.error("v4 kaydi olmadan --uygula yok"); process.exit(1); }
  for (const [ad, f] of [["solana", solana], ["sui", sui], ["aptos", aptos]]) {
    if (SECILEN.length && !SECILEN.includes(ad)) continue;
    try { await f(); } catch (e) { console.log("  " + ad + " HATA " + (e.shortMessage || e.message).slice(0, 500)); process.exitCode = 1; }
  }
  console.log(UYGULA ? "TAMAM" : "KURU TAMAM");
})();
