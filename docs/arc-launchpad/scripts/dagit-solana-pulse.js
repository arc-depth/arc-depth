"use strict";
/* ===========================================================================
 * dagit-solana-pulse.js — PulseSwap and the launchpad on Solana: deploy at
 * their fixed program ids, make the code final, initialize once.
 *
 *   NODE_PATH=C:/Users/omen/araclar/sol/node_modules node scripts/dagit-solana-pulse.js yerel
 *   NODE_PATH=C:/Users/omen/araclar/sol/node_modules node scripts/dagit-solana-pulse.js ana [--uygula]
 *
 * yerel  the whole procedure against yerel-ag --bos (our own local network,
 *        solana/pulse-swap-e2e): mainnet's USDC and FTHM mint accounts are
 *        read from mainnet (read only) and copied in, the deployer is
 *        airdropped, then every step below runs for real and is verified.
 * ana    mainnet. Without --uygula: balances, what exists, what each step
 *        costs, nothing sent. With --uygula: the steps below.
 *
 * STEPS (each skipped when the chain already shows it done)
 *   1 solana program deploy  PulseSwap, launchpad (target/ana-ag builds,
 *     INITIALIZER = the deployer; program ids from ozel/solana-programlar)
 *   2 set-upgrade-authority --final on both: no one can change the code
 *   3 the platform's USDC account (deployer ATA) and the FTHM sink: the
 *     incinerator's FTHM ATA, which no one can spend from
 *   4 PulseSwap Initialize (platform, FTHM, sink)
 *   5 launchpad Initialize (USDC, platform, PulseSwap's program id)
 * Record: dagitim-solana-pulse.json (ana only).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } = require("@solana/web3.js");
const spl = require("@solana/spl-token");

const KOK = path.join(__dirname, "..");
const KIP = process.argv[2];
const UYGULA = process.argv.includes("--uygula");
const GERCEK = KIP === "ana" && UYGULA;
const ANA_RPC = "https://api.mainnet-beta.solana.com";
const URL_ = KIP === "ana" ? ANA_RPC : "http://127.0.0.1:8899";
const CLI = "C:/Users/omen/araclar/sol-tool/solana-release/bin/solana.exe";
const KAYIT = path.join(KOK, "dagitim-solana-pulse.json");

const USDC = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const FTHM = new PublicKey("Cx3gUyxZY3JzQaJ2w1V54gpg8PNZRtXbEoYpuZNtaQBb");
const INCINERATOR = new PublicKey("1nc1nerator11111111111111111111111111111111");
const PROGRAMLAR = [
  { ad: "PulseSwap", anahtar: "pulse_swap-keypair.json", so: "solana/pulse-swap/target/ana-ag/pulse_swap.so" },
  { ad: "launchpad", anahtar: "pulse_launchpad-keypair.json", so: "solana/pulse-launchpad/target/ana-ag/pulse_launchpad.so" },
];

if (!["yerel", "ana"].includes(KIP)) { console.error("kullanim: dagit-solana-pulse.js <yerel|ana> [--uygula]"); process.exit(1); }
const conn = new Connection(URL_, "confirmed");
const ana = new Connection(ANA_RPC, "confirmed");

function dagitici() {
  const m = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^SOLANA_PRIVATE_KEY\s*=\s*([0-9a-fA-F]{64})\s*$/m);
  return Keypair.fromSeed(Buffer.from(m[1], "hex"));
}
const programKey = (f) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KOK, "ozel", "solana-programlar", f)))));
const rpc = async (method, params) => {
  const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ": " + r.error.message);
  return r.result;
};
/* send and wait by polling (yerel-ag serves no websocket; mainnet answers the same way) */
async function gonder(etiket, ixs, signers) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), ...ixs);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const sim = await conn.simulateTransaction(tx);
  if (sim.value.err) throw new Error(etiket + " simulasyon: " + JSON.stringify(sim.value.err) + "\n" + (sim.value.logs || []).slice(-6).join("\n"));
  if (KIP === "ana" && !UYGULA) { console.log("  (kuru) " + etiket.padEnd(44) + "simulasyon tamam"); return null; }
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
  for (let i = 0; i < 60; i++) {
    const s = (await conn.getSignatureStatuses([sig])).value[0];
    if (s && s.err) throw new Error(etiket + " basarisiz: " + JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) { console.log("  " + etiket.padEnd(44) + sig); return sig; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(etiket + " onaylanmadi: " + sig);
}
const cli = (args, kp) => cp.execFileSync(CLI, [...args, "-u", URL_, "-k", kp], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

(async () => {
  const d = dagitici();
  const kayit = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : { tx: {} };
  const yaz = () => { if (GERCEK) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
  console.log("SOLANA " + KIP.toUpperCase() + (KIP === "ana" ? (UYGULA ? " UYGULA" : " KURU") : "") + "   " + URL_ + "   dagitici " + d.publicKey.toBase58());

  if (KIP === "yerel") {
    // mainnet's USDC and FTHM mints, copied in exactly (read from mainnet, nothing sent there)
    for (const a of [USDC, FTHM]) {
      const h = await ana.getAccountInfo(a);
      await rpc("pulse_setAccount", [a.toBase58(), { lamports: h.lamports, owner: h.owner.toBase58(), data: h.data.toString("base64"), executable: h.executable }]);
    }
    await rpc("requestAirdrop", [d.publicKey.toBase58(), 5_000_000_000]);
    console.log("  ana agdan USDC ve FTHM mint hesaplari kopyalandi, dagiticiya 5 SOL");
  }
  const bakiye = await conn.getBalance(d.publicKey);
  console.log("  bakiye " + bakiye / 1e9 + " SOL");

  /* 1-2: deploy and finalize, through the Solana CLI (the key goes to a temporary file, deleted after) */
  const gecici = path.join(KOK, "ozel", ".gecici-dagitici.json");
  let gerekli = 0;
  try {
    for (const p of PROGRAMLAR) {
      const id = programKey(p.anahtar).publicKey;
      p.id = id;
      const so = fs.readFileSync(path.join(KOK, p.so));
      const var_ = await conn.getAccountInfo(id);
      if (var_) { console.log("  deploy " + p.ad.padEnd(37) + "tamam  " + id.toBase58()); continue; }
      const kira = await conn.getMinimumBalanceForRentExemption(so.length + 45);
      gerekli += kira;
      if (KIP === "ana" && !UYGULA) { console.log("  (kuru) deploy " + p.ad.padEnd(29) + id.toBase58() + "  kira " + (kira / 1e9).toFixed(4) + " SOL (+ gecici buffer ayni kadar, iade edilir)"); continue; }
      fs.writeFileSync(gecici, JSON.stringify(Array.from(d.secretKey)));
      const out = cli(["program", "deploy", "--use-rpc", "--with-compute-unit-price", "50000", "--max-sign-attempts", "50",
        "--program-id", path.join(KOK, "ozel", "solana-programlar", p.anahtar), path.join(KOK, p.so)], gecici);
      const sig = (out.match(/Signature: (\w+)/) || [])[1];
      console.log("  deploy " + p.ad.padEnd(37) + sig);
      kayit.tx["deploy " + p.ad] = sig; yaz();
    }
    for (const p of PROGRAMLAR) {
      if (!(await conn.getAccountInfo(p.id))) continue;
      fs.writeFileSync(gecici, JSON.stringify(Array.from(d.secretKey)));
      const goster = cli(["program", "show", p.id.toBase58()], gecici);
      if (/Authority: none/i.test(goster)) { console.log("  final " + p.ad.padEnd(38) + "tamam (yukseltme yetkisi yok)"); continue; }
      if (KIP === "ana" && !UYGULA) { console.log("  (kuru) set-upgrade-authority --final " + p.ad); continue; }
      cli(["program", "set-upgrade-authority", p.id.toBase58(), "--final"], gecici);
      console.log("  final " + p.ad.padEnd(38) + "yukseltme yetkisi kaldirildi");
    }
  } finally { if (fs.existsSync(gecici)) fs.unlinkSync(gecici); }
  if (KIP === "ana" && !UYGULA && gerekli) {
    const toplam = 2 * gerekli + 50_000_000;
    console.log("  (kuru) gereken yaklasik " + (toplam / 1e9).toFixed(3) + " SOL (kira x2 gecici buffer dahil + ucretler), bakiye " + (bakiye / 1e9).toFixed(3) + (bakiye >= toplam ? "  YETER" : "  EKSIK " + ((toplam - bakiye) / 1e9).toFixed(3) + " SOL"));
    console.log("  (kuru) baslatma adimlari programlar yuklenince simule edilebilir");
    return;
  }

  /* 3: platform USDC account and the FTHM sink */
  const SWAP = PROGRAMLAR[0].id, LP = PROGRAMLAR[1].id;
  const platform = spl.getAssociatedTokenAddressSync(USDC, d.publicKey);
  const sink = spl.getAssociatedTokenAddressSync(FTHM, INCINERATOR, true);
  const eksik = [];
  if (!(await conn.getAccountInfo(platform))) eksik.push(spl.createAssociatedTokenAccountIdempotentInstruction(d.publicKey, platform, d.publicKey, USDC));
  if (!(await conn.getAccountInfo(sink))) eksik.push(spl.createAssociatedTokenAccountIdempotentInstruction(d.publicKey, sink, INCINERATOR, FTHM));
  if (eksik.length) await gonder("platform USDC + FTHM yakma hesabi", eksik, [d]);
  else console.log("  platform USDC + FTHM yakma hesabi".padEnd(46) + "tamam");

  /* 4-5: initialize, once each */
  const R = (k) => ({ pubkey: k, isSigner: false, isWritable: false }), W = (k) => ({ pubkey: k, isSigner: false, isWritable: true });
  const S = { pubkey: d.publicKey, isSigner: true, isWritable: true };
  const sp = (s) => PublicKey.findProgramAddressSync([Buffer.from(s)], SWAP)[0];
  const lConfig = PublicKey.findProgramAddressSync([Buffer.from("config")], LP)[0];
  if (!(await conn.getAccountInfo(sp("config"))))
    await gonder("PulseSwap Initialize", [new TransactionInstruction({ programId: SWAP, keys: [S, W(sp("config")), W(sp("bucket")), R(USDC), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID)],
      data: Buffer.concat([Buffer.from([0]), platform.toBuffer(), FTHM.toBuffer(), sink.toBuffer()]) })], [d]);
  else console.log("  PulseSwap Initialize".padEnd(46) + "tamam");
  if (!(await conn.getAccountInfo(lConfig)))
    await gonder("launchpad Initialize", [new TransactionInstruction({ programId: LP, keys: [S, W(lConfig), R(USDC), R(platform), R(SystemProgram.programId)],
      data: Buffer.concat([Buffer.from([0]), SWAP.toBuffer()]) })], [d]);
  else console.log("  launchpad Initialize".padEnd(46) + "tamam");

  /* verify from the chain */
  const sc = (await conn.getAccountInfo(sp("config"))).data, lc = (await conn.getAccountInfo(lConfig)).data;
  const ok = new PublicKey(sc.slice(1, 33)).equals(USDC) && new PublicKey(sc.slice(65, 97)).equals(FTHM) && new PublicKey(sc.slice(97, 129)).equals(sink)
    && new PublicKey(lc.slice(1, 33)).equals(USDC) && new PublicKey(lc.slice(33, 65)).equals(platform) && new PublicKey(lc.slice(65, 97)).equals(SWAP);
  console.log("  dogrulama: PulseSwap (USDC, FTHM, yakma) ve launchpad (USDC, platform, PulseSwap) zincirden " + (ok ? "DOGRU" : "YANLIS"));
  if (!ok) process.exit(1);
  Object.assign(kayit, { pulseSwap: SWAP.toBase58(), launchpad: LP.toBase58(), usdc: USDC.toBase58(), fthm: FTHM.toBase58(), platform: platform.toBase58(), fthmSink: sink.toBase58(), final: true });
  yaz();
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
