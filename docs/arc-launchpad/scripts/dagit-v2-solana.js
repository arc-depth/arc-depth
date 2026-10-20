"use strict";
/* ===========================================================================
 * dagit-v2-solana.js — Solana for the second basket generation: the basket
 * vault (solana/pulse-sepet) and the LayerZero gate (solana/pulse-kapi)
 *
 *   set NODE_PATH=C:/Users/omen/araclar/sol/node_modules
 *   node scripts/dagit-v2-solana.js            dry: sizes, rent, SOL needed, options, wiring
 *   node scripts/dagit-v2-solana.js --uygula   deploy, initialize, wire (user command only)
 *
 * Needs the Arc addresses of the EVM set (dagit-v2.js kur): the Defter, the
 * HaberciLZ and the IkizHub. Writes what the EVM wiring needs into
 * dagitim-v2.json (uzak.solana); then `dagit-v2.js bagla` binds Arc's side.
 *
 * STEPS (each skipped when the chain already shows it done)
 *   1 solana program deploy  pulse-sepet, pulse-kapi (target/ana-ag builds,
 *     INITIALIZER = the deployer; program ids from ozel/solana-programlar,
 *     created there on the first run). Upgradeable: the upgrade authority
 *     stays with the deployer until the whole set is locked, after the joint
 *     test launch.
 *   2 pulse-sepet Initialize: domain 5, emirci = the gate's store PDA,
 *     Defter (Arc, domain 26), ikiz = the Arc HaberciLZ, Circle USDC
 *   3 pulse-kapi Initialize: Arc eid 30417, IkizHub, HaberciLZ, pulse-sepet,
 *     enforced options toward Arc for Gonder (lzReceive 800k gas). It
 *     registers the store with the endpoint, the deployer as delegate.
 *   4 LayerZero, as LayerZero's own wiring does it for an OApp on Solana
 *     (@layerzerolabs/protocol-devtools-solana): send and receive library
 *     configs, the ULN302 OApp config, ULN302 as send and receive library,
 *     send ULN (32 confirmations, the Solana default), receive ULN (Arc's 5,
 *     contracts/lz/ZincirTablosu.sol), both with LayerZero Labs + Nethermind
 *     required; the executor config (the default executor, 10000 bytes);
 *     the nonces for both Arc senders.
 *   5 an upgrade of a deployed program whose code differs from the build
 *     (pulse-kapi gained the v2 receive path), extending it first if bigger
 *   6 the gate's address lookup table: created, extended with the fixed
 *     accounts every delivery uses (pulse-kapi `sabitler`, same order),
 *     frozen (no authority: nobody can change or close it), then AltKur
 *     records it. LayerZero's executor (lz-solana-sdk-v2 3.0.168, v2 path:
 *     lz_receive_types_info, lz_receive_types_v2) builds a v0 transaction
 *     with it; without it a redemption order does not fit 1232 bytes
 *     (measured: solana/pulse-swap-e2e/tests/kapi.rs).
 *   7 printed only: what Arc must change (executor maxMessageSize toward
 *     Solana for IkizHub and HaberciLZ; LayerZero's default there is 200)
 * Options Arc attaches toward Solana (gas = compute units, value = lamports
 * the executor may spend, LayerZero's Solana executor, execute.rs): compute
 * units measured in LiteSVM with the real endpoint program
 * (solana/pulse-swap-e2e/tests/kapi.rs, olcum_mesaj_turlerinin_maliyeti),
 * lamports = mainnet rent of the accounts each message creates, read here.
 * Nothing is locked here: Kilitle, the upgrade authorities and the deployer
 * key are closed with the rest of the set.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram, AddressLookupTableProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY } = require("@solana/web3.js");
const { JsonRpcProvider, Contract, AbiCoder } = require("ethers");
const spl = require("@solana/spl-token");
const lz = require("@layerzerolabs/lz-solana-sdk-v2");
const { Options } = require("@layerzerolabs/lz-v2-utilities");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const KAYIT = process.env.V2_KAYIT || path.join(KOK, "dagitim-v2.json");   // V2_KAYIT: a dry run against predicted addresses
const RPC = "https://api.mainnet-beta.solana.com";
const CLI = "C:/Users/omen/araclar/sol-tool/solana-release/bin/solana.exe";
const SOL_TOOL = "C:/Users/omen/araclar/sol-tool";
const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const INITIALIZER = "5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh";   // both programs' INITIALIZER (mainnet builds)
const ENDPOINT = lz.EndpointProgram.PROGRAM_ID, ULN = lz.UlnProgram.PROGRAM_ID;
const ARC_EID = 30417, SOLANA = 5, ARC = 26, UZAK_SOLANA_EID = 30168;
/* LayerZero Labs + Nethermind on Solana (both in Solana's default config for Arc, read below) */
const DVN = ["4VDjp6XQaxoZf5RGwiPU9NR1EXSZn2TP4ATMmiSzLfhb", "GPjyWr8vCotGuFubDpTxDxy9Vj1ZeEN4F2dwRmFiaGab"].map((x) => new PublicKey(x));
const ONAY_SOLANA = 32;
const ONAY_ARC = (() => {
  const s = fs.readFileSync(path.join(KOK, "contracts", "lz", "ZincirTablosu.sol"), "utf8");
  return Number(s.match(/Zincir\(5042, 30417,[^;]*?, (\d+)\);/)[1]);
})();
const MAX_MESAJ = 10_000;
const MPL = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const ATA_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const YUKLEYICI = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
/* Arc -> Solana: the largest message each Arc OApp may send. The executor's v0
   transaction with the gate's table measured (tests/kapi.rs): 541 bytes + the
   message for an order, 574 + the message for YARAT; Solana's limit is 1232.
   HaberciLZ 640 (a five-mint redemption is 608), IkizHub 512 (YARAT with a
   32-byte name and 10-byte symbol is 256; longer names fit up to 512). */
const ARC_MAX = { HaberciLZ: 640, IkizHub: 512 };
const ARC_RPC = "https://arc-rpc.publicnode.com";
const ARC_EP = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B", ARC_SEND = "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7";
/* compute units of lz_receive, measured in LiteSVM 18 Oct (YARAT 68,361; TASI with a new
   token account 46,099; an order 36,458, a five-mint redemption 35,460), times 1.5 rounded
   up to 10k, plus 30k for the executor's own `execute` around it */
const CU = { yarat: 140_000, tasi: 100_000, emir: 90_000 };
/* the accounts each message creates, paid by the executor: YARAT the mint (82 bytes) and
   the Metaplex metadata (607 bytes, plus Metaplex's 0.01 SOL create fee, measured with
   mainnet's Token Metadata program); TASI the recipient's token account (165; when it
   exists nothing is spent); an order the Emir PDA in pulse-sepet (241) */
const METAPLEX_UCRET = 10_000_000;
const BOY = { mint: 82, metadata: 607, ata: 165, emir: 241 };
/* what the deployment itself creates (sizes from the programs and LayerZero's sources) */
const KURULUS = { sepetConfig: 202, depo: 165, store: 233, lrt: 72, oappRegistry: 41, sendLib: 41, recvLib: 83, sendConfig: 1088,
  recvConfig: 1052, nonce: 25, pendingNonce: 2061 };
const PROGRAMLAR = [
  { ad: "pulse-sepet", anahtar: "pulse_sepet-keypair.json", dizin: "solana/pulse-sepet", so: "solana/pulse-sepet/target/ana-ag/pulse_sepet.so" },
  { ad: "pulse-kapi", anahtar: "pulse_kapi-keypair.json", dizin: "solana/pulse-kapi", so: "solana/pulse-kapi/target/ana-ag/pulse_kapi.so" },
];

const conn = new Connection(RPC, "confirmed");
const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
kayit.uzak ||= {};
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
const A = (kayit.zincir || {}).arc || {};
const DEFTER = kayit.defter || A.SepetDefteri;
if (!DEFTER || !A.HaberciLZ || !A.IkizHub) { console.error("once EVM seti (Arc Defter, HaberciLZ, IkizHub): dagit-v2.js kur --uygula"); process.exit(1); }
const b32 = (a) => Buffer.from(a.toLowerCase().replace(/^0x/, "").padStart(64, "0"), "hex");
const hex32 = (pk) => "0x" + Buffer.from(pk.toBytes()).toString("hex");
/* LayerZero type 3 options: executor lzReceive (gas[, value]), as scripts/dagit-v2.js writes them */
const secenek = (gaz, deger) => deger
  ? "0x0003010021" + "01" + BigInt(gaz).toString(16).padStart(32, "0") + BigInt(deger).toString(16).padStart(32, "0")
  : "0x0003010011" + "01" + BigInt(gaz).toString(16).padStart(32, "0");

function dagitici() {
  const m = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^SOLANA_PRIVATE_KEY\s*=\s*([0-9a-fA-F]{64})\s*$/m);
  return Keypair.fromSeed(Buffer.from(m[1], "hex"));
}
/* a program id: its key in ozel/solana-programlar, created the first time (it holds nothing; it only fixes the address) */
function programKey(f) {
  const p = path.join(KOK, "ozel", "solana-programlar", f);
  if (!fs.existsSync(p)) { fs.writeFileSync(p, JSON.stringify(Array.from(Keypair.generate().secretKey))); console.log("  program anahtari olusturuldu: ozel/solana-programlar/" + f); }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p))));
}
/* the mainnet builds, from the sources as they are now (no local-test feature) */
function derle(p) {
  const L = SOL_TOOL + "/llvm-mingw-20261006-ucrt-x86_64/bin";
  const env = { ...process.env, PATH: "C:\\Users\\omen\\.cargo\\bin;" + process.env.PATH + ";" + SOL_TOOL + "/dlltool",
    CC_x86_64_pc_windows_gnu: L + "/x86_64-w64-mingw32-clang.exe", AR_x86_64_pc_windows_gnu: L + "/llvm-ar.exe" };
  cp.execFileSync(SOL_TOOL + "/solana-release/bin/cargo-build-sbf.exe", ["--sbf-out-dir", "target/ana-ag"], { cwd: path.join(KOK, p.dizin), env, stdio: "ignore" });
}
async function gonder(etiket, ixs, signers) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), ...ixs);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) throw new Error(etiket + " simulasyon: " + JSON.stringify(sim.value.err) + "\n" + (sim.value.logs || []).slice(-6).join("\n"));
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
  for (let i = 0; i < 60; i++) {
    const s = (await conn.getSignatureStatuses([sig])).value[0];
    if (s && s.err) throw new Error(etiket + " basarisiz: " + JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) { console.log("  " + etiket.padEnd(46) + sig); return sig; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(etiket + " onaylanmadi: " + sig);
}
const kira = (n) => conn.getMinimumBalanceForRentExemption(n);
const sol = (l) => (Number(l) / 1e9).toFixed(4);

(async () => {
  const d = dagitici();
  if (d.publicKey.toBase58() !== INITIALIZER) throw new Error("dagitici " + d.publicKey.toBase58() + " programlarin INITIALIZER'i degil");
  console.log("SEPET V2 SOLANA " + (UYGULA ? "UYGULA" : "KURU") + "   dagitici " + d.publicKey.toBase58() + "   kayit " + KAYIT);
  const bakiye = await conn.getBalance(d.publicKey);
  console.log("  bakiye " + sol(bakiye) + " SOL");

  for (const p of PROGRAMLAR) { derle(p); p.id = programKey(p.anahtar).publicKey; p.boy = fs.statSync(path.join(KOK, p.so)).size; }
  const SEPET = PROGRAMLAR[0].id, KAPI = PROGRAMLAR[1].id;
  const pda = (s, prog) => PublicKey.findProgramAddressSync(s, prog)[0];
  const store = pda([Buffer.from("Store")], KAPI);
  const lrt = pda([Buffer.from("LzReceiveTypes"), store.toBuffer()], KAPI);
  const config = pda([Buffer.from("config")], SEPET);
  const depo = pda([Buffer.from("depo"), USDC.toBuffer()], SEPET);
  const ep = new lz.EndpointProgram.Endpoint(ENDPOINT);
  const uln = new lz.UlnProgram.Uln(ULN);
  const epd = new lz.EndpointPDADeriver(ENDPOINT);
  const HUB = b32(A.IkizHub), HABERCI = b32(A.HaberciLZ);
  console.log("  pulse-sepet " + SEPET.toBase58() + "   config " + config.toBase58() + "   dolar deposu " + depo.toBase58());
  console.log("  pulse-kapi  " + KAPI.toBase58() + "   store (OApp) " + store.toBase58());
  console.log("  Arc: Defter " + DEFTER + "   HaberciLZ " + A.HaberciLZ + "   IkizHub " + A.IkizHub + "   (Arc onay " + ONAY_ARC + ")");

  /* what LayerZero's default for Arc on Solana says: the two DVNs must be among its DVN accounts, and the executor */
  const vs = await uln.getDefaultSendConfigState(conn, ARC_EID);
  const vr = await uln.getDefaultReceiveConfigState(conn, ARC_EID);
  const varsayilan = [...vs.uln.requiredDvns, ...vr.uln.requiredDvns].map((x) => x.toBase58());
  for (const x of DVN) if (!varsayilan.includes(x.toBase58())) throw new Error("DVN " + x.toBase58() + " Solana'nin Arc varsayilaninda yok");
  const YURUTUCU = vs.executor.executor;
  console.log("  LZ varsayilani (Arc): gonderim " + Number(vs.uln.confirmations) + " onay, alim " + Number(vr.uln.confirmations) + " onay, " +
    vs.uln.requiredDvnCount + " DVN; LZ Labs + Nethermind aralarinda. Yurutucu " + YURUTUCU.toBase58() + " (" + vs.executor.maxMessageSize + " bayt)");

  /* ---- options Arc attaches toward Solana ---- */
  const deger = {
    yarat: (await kira(BOY.mint)) + (await kira(BOY.metadata)) + METAPLEX_UCRET,
    tasi: await kira(BOY.ata),
    emir: await kira(BOY.emir),
  };
  const S = { secenek: secenek(CU.emir, deger.emir), ikizSecenek: secenek(CU.tasi, deger.tasi), yaratSecenek: secenek(CU.yarat, deger.yarat) };
  const gonderSecenek = secenek(800_000);
  console.log("  SECENEKLER (LayerZero'nun Options cozucusuyle okundu: Solana yurutucusu gaz = CU, deger = lamport)");
  for (const [ad, h] of [["secenek (HaberciLZ emri)", S.secenek], ["ikizSecenek (TASI)", S.ikizSecenek], ["yaratSecenek (YARAT)", S.yaratSecenek], ["Gonder -> Arc (zorunlu)", gonderSecenek]]) {
    const o = Options.fromOptions(h).decodeExecutorLzReceiveOption();
    console.log("    " + ad.padEnd(26) + h + "   CU " + o.gas + "  lamport " + o.value + " (" + sol(o.value) + " SOL)");
  }

  /* ---- 1 deploy ---- */
  const gecici = path.join(KOK, "ozel", ".gecici-dagitici.json");
  let gerekli = 0, tamponlar = 0, enBuyukTampon = 0;
  try {
    for (const p of PROGRAMLAR) {
      const var_ = await conn.getAccountInfo(p.id);
      if (var_) {
        const pd = PublicKey.findProgramAddressSync([p.id.toBuffer()], YUKLEYICI)[0];
        const pda_ = await conn.getAccountInfo(pd);
        const kod = fs.readFileSync(path.join(KOK, p.so));
        const yetki = pda_.data[12] === 1 ? new PublicKey(pda_.data.slice(13, 45)) : null;
        const ayni = pda_.data.length - 45 >= kod.length && Buffer.compare(pda_.data.slice(45, 45 + kod.length), kod) === 0 && pda_.data.slice(45 + kod.length).every((x) => x === 0);
        if (ayni) { console.log("  deploy " + p.ad.padEnd(39) + "tamam, kod guncel  " + p.id.toBase58()); continue; }
        if (!yetki || !yetki.equals(d.publicKey)) throw new Error(p.ad + " degismis ama yukseltme yetkisi dagiticida degil");
        const ek = Math.max(0, kod.length - (pda_.data.length - 45));
        const ekKira = ek ? Math.max(0, (await kira(kod.length + 45)) - pda_.lamports) : 0;
        const tampon = await kira(kod.length + 37);
        const yazim = Math.ceil(kod.length / 1000) + 4;
        gerekli += ekKira + tampon + yazim * 15_000;
        tamponlar += tampon;
        enBuyukTampon = Math.max(enBuyukTampon, tampon);
        if (!UYGULA) {
          console.log("  (kuru) yukselt " + p.ad.padEnd(11) + (kod.length / 1024).toFixed(1) + " KB (zincirde " + ((pda_.data.length - 45) / 1024).toFixed(1) + " KB yer)" +
            (ek ? "   genislet +" + ek + " bayt, kira " + sol(ekKira) + " SOL" : "") + "   tampon " + sol(tampon) + " (iade) + ~" + yazim + " islem");
          continue;
        }
        fs.writeFileSync(gecici, JSON.stringify(Array.from(d.secretKey)));
        if (ek) cp.execFileSync(CLI, ["program", "extend", p.id.toBase58(), String(ek), "-u", RPC, "-k", gecici], { encoding: "utf8" });
        const out = cp.execFileSync(CLI, ["program", "deploy", "--use-rpc", "--with-compute-unit-price", "50000", "--max-sign-attempts", "50",
          "--program-id", path.join(KOK, "ozel", "solana-programlar", p.anahtar), path.join(KOK, p.so), "-u", RPC, "-k", gecici], { encoding: "utf8" });
        console.log("  yukselt " + p.ad.padEnd(38) + ((out.match(/Signature: (\w+)/) || [])[1]));
        continue;
      }
      const k = (await kira(p.boy + 45)) + (await kira(36));
      const tampon = await kira(p.boy + 37);
      const yazim = Math.ceil(p.boy / 1000) + 4;
      gerekli += k + tampon + yazim * 15_000;
      tamponlar += tampon;
      enBuyukTampon = Math.max(enBuyukTampon, tampon);
      if (!UYGULA) {
        console.log("  (kuru) deploy " + p.ad.padEnd(12) + (p.boy / 1024).toFixed(1) + " KB   kira " + sol(k) + " SOL kalici + " + sol(tampon) +
          " gecici tampon (iade) + ~" + yazim + " islem");
        continue;
      }
      fs.writeFileSync(gecici, JSON.stringify(Array.from(d.secretKey)));
      const out = cp.execFileSync(CLI, ["program", "deploy", "--use-rpc", "--with-compute-unit-price", "50000", "--max-sign-attempts", "50",
        "--program-id", path.join(KOK, "ozel", "solana-programlar", p.anahtar), path.join(KOK, p.so), "-u", RPC, "-k", gecici], { encoding: "utf8" });
      const sig = (out.match(/Signature: (\w+)/) || [])[1];
      console.log("  deploy " + p.ad.padEnd(39) + sig + "   (yukseltme yetkisi dagiticida)");
    }
  } finally { if (fs.existsSync(gecici)) fs.unlinkSync(gecici); }

  /* ---- 2-4 initialize and wire ---- */
  const R = (k) => ({ pubkey: k, isSigner: false, isWritable: false }), W = (k) => ({ pubkey: k, isSigner: false, isWritable: true });
  const SG = { pubkey: d.publicKey, isSigner: true, isWritable: true };
  const evtEp = pda([Buffer.from("__event_authority")], ENDPOINT);
  const registry = pda([Buffer.from("OApp"), store.toBuffer()], ENDPOINT);
  const isler = [];
  const is = (etiket, hesap, ixs, boy) => isler.push({ etiket, hesap, ixs, boy });

  const sd = Buffer.alloc(1 + 4 + 32 + 32 + 4 + 32 + 32);
  let o = 0;
  sd[o++] = 0; sd.writeUInt32LE(SOLANA, o); o += 4;
  store.toBuffer().copy(sd, o); o += 32;
  spl.getAssociatedTokenAddressSync(USDC, store, true).toBuffer().copy(sd, o); o += 32;   // the direct emirci path is unused: nothing holds this
  sd.writeUInt32LE(ARC, o); o += 4;
  b32(DEFTER).copy(sd, o); o += 32;
  HABERCI.copy(sd, o);
  is("pulse-sepet Initialize", config, () => [new TransactionInstruction({ programId: SEPET, keys: [SG, W(config), R(USDC), W(depo), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID)], data: sd })],
    KURULUS.sepetConfig + KURULUS.depo);

  const opt = Buffer.from(gonderSecenek.slice(2), "hex");
  const kd = Buffer.concat([Buffer.from([0]), (() => { const b = Buffer.alloc(4); b.writeUInt32LE(ARC_EID); return b; })(), HUB, HABERCI, SEPET.toBuffer(),
    (() => { const b = Buffer.alloc(2); b.writeUInt16LE(opt.length); return b; })(), opt]);
  is("pulse-kapi Initialize (+ register_oapp)", store, () => [new TransactionInstruction({ programId: KAPI,
    keys: [SG, W(store), W(lrt), R(SystemProgram.programId), R(ENDPOINT), W(registry), R(evtEp)], data: kd })], KURULUS.store + KURULUS.lrt + KURULUS.oappRegistry);

  is("LZ gonderim kutuphanesi kaydi (Arc)", epd.sendLibraryConfig(store, ARC_EID)[0], () => [ep.initSendLibrary(d.publicKey, store, ARC_EID)], KURULUS.sendLib);
  is("LZ alim kutuphanesi kaydi (Arc)", epd.receiveLibraryConfig(store, ARC_EID)[0], () => [ep.initReceiveLibrary(d.publicKey, store, ARC_EID)], KURULUS.recvLib);
  is("ULN302 OApp ayari (Arc)", new lz.UlnPDADeriver(ULN).sendConfig(ARC_EID, store)[0], () => [ep.initOAppConfig(d.publicKey, uln, d.publicKey, store, ARC_EID)],
    KURULUS.sendConfig + KURULUS.recvConfig);
  const uc = (onay) => ({ confirmations: onay, requiredDvnCount: 2, optionalDvnCount: 0, optionalDvnThreshold: 0, requiredDvns: DVN, optionalDvns: [] });
  /* in place when the send and receive configs on the chain already say so */
  const ulnTamam = async () => {
    try {
      const s1 = await uln.getSendConfigState(conn, store, ARC_EID), r1 = await uln.getReceiveConfigState(conn, store, ARC_EID);
      return !!s1 && !!r1 && Number(s1.uln.confirmations) === ONAY_SOLANA && Number(r1.uln.confirmations) === ONAY_ARC && s1.uln.requiredDvnCount === 2 && r1.uln.requiredDvnCount === 2
        && s1.executor.executor.equals(YURUTUCU) && s1.executor.maxMessageSize === MAX_MESAJ;
    } catch (e) { return false; }
  };
  is("ULN302 kutuphaneler, ULN " + ONAY_SOLANA + "/" + ONAY_ARC + " onay, yurutucu", ulnTamam, async () => [
    ep.setSendLibrary(d.publicKey, store, ULN, ARC_EID),
    ep.setReceiveLibrary(d.publicKey, store, ULN, ARC_EID, 0),
    await ep.setOappConfig(conn, d.publicKey, store, ULN, ARC_EID, { configType: lz.SetConfigType.SEND_ULN, value: uc(ONAY_SOLANA) }),
    await ep.setOappConfig(conn, d.publicKey, store, ULN, ARC_EID, { configType: lz.SetConfigType.RECEIVE_ULN, value: uc(ONAY_ARC) }),
    await ep.setOappConfig(conn, d.publicKey, store, ULN, ARC_EID, { configType: lz.SetConfigType.EXECUTOR, value: { maxMessageSize: MAX_MESAJ, executor: YURUTUCU } }),
  ], 0);
  for (const [ad, g] of [["IkizHub", HUB], ["HaberciLZ", HABERCI]])
    is("LZ nonce (Arc " + ad + ")", epd.nonce(store, ARC_EID, g)[0], () => [ep.initOAppNonce(d.publicKey, ARC_EID, store, g)], KURULUS.nonce + KURULUS.pendingNonce);

  const programlarVar = (await conn.getAccountInfo(SEPET)) && (await conn.getAccountInfo(KAPI));
  let kurulusKira = 0;
  for (const x of isler) {
    const yapildi = typeof x.hesap === "function" ? await x.hesap() : x.hesap && (await conn.getAccountInfo(x.hesap));
    if (yapildi) { console.log("  " + x.etiket.padEnd(46) + "tamam"); continue; }
    kurulusKira += x.boy ? await kira(x.boy) : 0;
    if (!UYGULA || !programlarVar) {
      /* the instructions are built (so the SDK calls are checked) but cannot be simulated before the programs exist */
      const ixs = await x.ixs();
      console.log("  (kuru) " + x.etiket.padEnd(46) + ixs.length + " talimat" + (x.boy ? "   kira " + sol(await kira(x.boy)) + " SOL" : ""));
      continue;
    }
    await gonder(x.etiket, await x.ixs(), [d]);
  }
  /* a setting already in place is checked from the chain, not skipped blindly */
  if (UYGULA && programlarVar) {
    const s = await uln.getSendConfigState(conn, store, ARC_EID), r = await uln.getReceiveConfigState(conn, store, ARC_EID);
    const ok = Number(s.uln.confirmations) === ONAY_SOLANA && Number(r.uln.confirmations) === ONAY_ARC && s.uln.requiredDvnCount === 2 && r.uln.requiredDvnCount === 2
      && s.executor.executor.equals(YURUTUCU);
    console.log("  dogrulama: ULN gonderim/alim ve yurutucu zincirden " + (ok ? "DOGRU" : "YANLIS"));
    if (!ok) process.exit(1);
  }

  /* ---- 6 the address lookup table ---- */
  const storeVeri = await conn.getAccountInfo(store);
  if (storeVeri && storeVeri.data[232] !== 0) console.log("  UYARI: kapi kilitli (Kilitle yapilmis): AltKur artik reddedilir");
  const sabitler = [ENDPOINT, store, registry, pda([Buffer.from("Endpoint")], ENDPOINT), evtEp, epd.nonce(store, ARC_EID, HUB)[0], epd.nonce(store, ARC_EID, HABERCI)[0],
    spl.TOKEN_PROGRAM_ID, ATA_PROGRAM, SystemProgram.programId, MPL, SEPET, config, SYSVAR_INSTRUCTIONS_PUBKEY];
  const altPda = pda([Buffer.from("Alt")], KAPI);
  const altKira = await kira(56 + 32 * sabitler.length) + await kira(34);
  let altVar = await conn.getAccountInfo(altPda);
  if (altVar) {
    kayit.uzak.solana = { ...(kayit.uzak.solana || {}), alt: new PublicKey(altVar.data.slice(1, 33)).toBase58() };
    console.log("  adres tablosu (AltKur)".padEnd(48) + "tamam  " + kayit.uzak.solana.alt);
  } else if (!UYGULA || !programlarVar) {
    kurulusKira += altKira;
    console.log("  (kuru) adres tablosu: olustur + " + sabitler.length + " adres + dondur + AltKur".padEnd(38) + "kira " + sol(altKira) + " SOL (kalici; dondurulmus tablo kapanmaz)");
    sabitler.forEach((x, i) => console.log("           " + String(i).padStart(2) + "  " + x.toBase58()));
  } else {
    kayit.uzak.solana ||= {};
    let tablo = kayit.uzak.solana.alt ? new PublicKey(kayit.uzak.solana.alt) : null;
    if (!tablo || !(await conn.getAccountInfo(tablo))) {
      const [ix, adr] = AddressLookupTableProgram.createLookupTable({ authority: d.publicKey, payer: d.publicKey, recentSlot: await conn.getSlot("finalized") });
      await gonder("adres tablosu olustur", [ix], [d]);
      tablo = adr;
      kayit.uzak.solana.alt = adr.toBase58(); yaz();
    }
    const t = await conn.getAddressLookupTable(tablo, { commitment: "confirmed" });
    if (t.value.state.addresses.length === 0)
      await gonder("adres tablosu: " + sabitler.length + " adres", [AddressLookupTableProgram.extendLookupTable({ lookupTable: tablo, authority: d.publicKey, payer: d.publicKey, addresses: sabitler })], [d]);
    for (let i = 0; i < 30; i++) {
      const v = (await conn.getAddressLookupTable(tablo, { commitment: "confirmed" })).value;
      if (v && v.state.addresses.length === sabitler.length) break;
      await new Promise((x) => setTimeout(x, 1000));
    }
    const v = (await conn.getAddressLookupTable(tablo, { commitment: "confirmed" })).value;
    if (!v.state.addresses.every((x, i) => x.equals(sabitler[i]))) throw new Error("adres tablosu beklenen sirada degil");
    if (v.state.authority) await gonder("adres tablosunu dondur", [AddressLookupTableProgram.freezeLookupTable({ lookupTable: tablo, authority: d.publicKey })], [d]);
    await gonder("AltKur", [new TransactionInstruction({ programId: KAPI, keys: [SG, R(store), W(altPda), R(tablo), R(SystemProgram.programId)], data: Buffer.from([3]) })], [d]);
  }

  /* ---- 7 Arc: what must change toward Solana (printed; dagit-v2.js sends it) ---- */
  {
    const p = new JsonRpcProvider(ARC_RPC, 5042, { staticNetwork: true });
    const ep2 = new Contract(ARC_EP, ["function getConfig(address,address,uint32,uint32) view returns (bytes)"], p);
    const c = AbiCoder.defaultAbiCoder();
    console.log("  ARC TARAFI (Solana " + UZAK_SOLANA_EID + "; gonderim kutuphanesi " + ARC_SEND + "):");
    for (const [ad, adres] of [["HaberciLZ", A.HaberciLZ], ["IkizHub", A.IkizHub]]) {
      const [enBuyuk, yurutucu] = c.decode(["tuple(uint32,address)"], await ep2.getConfig(adres, ARC_SEND, UZAK_SOLANA_EID, 1))[0];
      const yeni = c.encode(["tuple(uint32,address)"], [[ARC_MAX[ad], yurutucu]]);
      console.log("    " + ad.padEnd(10) + adres + "   simdi maxMessageSize " + enBuyuk + " (yurutucu " + yurutucu + ") -> " + ARC_MAX[ad]);
      console.log("      endpoint.setConfig(" + adres + ", " + ARC_SEND + ", [(" + UZAK_SOLANA_EID + ", 1, " + yeni + ")])");
    }
  }

  /* ---- record ---- */
  kayit.uzak.solana = { ...(kayit.uzak.solana || {}), sepetProgram: SEPET.toBase58(), kapiProgram: KAPI.toBase58(),
    kapi: hex32(store), kasa: hex32(config), dolarDepo: hex32(depo), ...S, gonderSecenek, arcMaxMesaj: ARC_MAX };
  yaz();
  console.log("  uzak.solana " + (UYGULA ? "yazildi" : "(kuru, yazilmadi)") + ":");
  for (const [k, v] of Object.entries(kayit.uzak.solana)) console.log("    " + k.padEnd(14) + (typeof v === "object" ? JSON.stringify(v) : v));
  if (!UYGULA) {
    const toplam = gerekli + kurulusKira + isler.length * 20_000;
    console.log("  GEREKEN ~" + sol(toplam) + " SOL (programlar " + sol(gerekli) + " gecici tampon dahil, hesaplar " + sol(kurulusKira) + ", ucretler)   bakiye " +
      sol(bakiye) + (bakiye >= toplam ? "  YETER" : "  EKSIK " + sol(toplam - bakiye) + " SOL"));
    const tepe = toplam - tamponlar + enBuyukTampon;
    console.log("  tamponlar (" + sol(tamponlar) + " SOL) her deploy sonunda iade edilir: kalici harcama ~" + sol(toplam - tamponlar) + " SOL; deploylar sirayla gidince bakiyede bir anda gereken ~" + sol(tepe) + " SOL" + (bakiye >= tepe ? "  YETER" : "  EKSIK " + sol(tepe - bakiye) + " SOL"));
  }
  console.log("TAMAM");
})().catch((e) => { console.error("HATA " + (e.message || e)); if (process.env.AYRINTI) console.error(e.stack); process.exit(1); });
