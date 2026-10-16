"use strict";
/* ===========================================================================
 * yerel-prova.js — the whole Solana flow, client side, against yerel-ag (our
 * own local network): the same @solana/web3.js + spl-token calls the site
 * and the mainnet setup will make, every number read back over JSON-RPC.
 *
 *   solana/pulse-swap-e2e/target/release/yerel-ag.exe          (one window)
 *   NODE_PATH=C:/Users/omen/araclar/sol/node_modules node solana/yerel-prova.js
 *
 * Steps: initialize PulseSwap and the launchpad (test admin key, local-test
 * builds) -> open TOK/USDC and FTHM/USDC pools -> a launch in ONE
 * transaction as the site builds it (mint account + mint init + founder's
 * token account + Launch) -> buy, sell, redeem -> warp 24 h -> paste TOK as
 * collateral (LaunchBacked) -> the FTHM bucket buys FTHM for the sink.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram } = require("@solana/web3.js");
const spl = require("@solana/spl-token");

const URL_ = process.env.YEREL_AG || "http://127.0.0.1:8899";
const conn = new Connection(URL_, { commitment: "confirmed", disableRetryOnRateLimit: true });
const USD = 1_000_000n;
const SUPPLY = 1_000_000_000_000_000n;
const MPL = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
let gecti = 0, kaldi = 0;
const kontrol = (ad, ok, ek = "") => { ok ? gecti++ : kaldi++; console.log((ok ? "  PASS  " : "  FAIL  ") + ad + (ek ? "   " + ek : "")); };

const rpc = async (method, params = []) => {
  const r = await fetch(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ": " + r.error.message);
  return r.result;
};
/* send and wait by polling statuses (yerel-ag has no websocket) */
async function gonder(ixs, signers) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
  tx.sign(...signers);
  const ham = tx.serialize();
  const sig = await conn.sendRawTransaction(ham, { skipPreflight: true });
  const s = (await conn.getSignatureStatuses([sig])).value[0];
  if (!s || s.err) throw new Error("tx failed " + JSON.stringify(s && s.err));
  return { sig, boyut: ham.length };
}
const reddedilir = async (ad, f) => { try { await f(); kontrol(ad, false, "gecti, reddedilmeliydi"); } catch (e) { kontrol(ad, true); } };
const bal = async (a) => BigInt((await conn.getTokenAccountBalance(a)).value.amount);
const u64 = (...v) => Buffer.concat(v.map((n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }));
const adlar = (...s) => Buffer.concat(s.map((x) => Buffer.concat([Buffer.from([Buffer.byteLength(x)]), Buffer.from(x)])));
const W = (k) => ({ pubkey: k, isSigner: false, isWritable: true });
const R = (k) => ({ pubkey: k, isSigner: false, isWritable: false });
const S = (k, w = true) => ({ pubkey: k, isSigner: true, isWritable: w });
const quote = (rin, rout, a) => { const after = (a * 997000n) / 1000000n; return (rout * after) / (rin + after); };

(async () => {
  const progs = Object.fromEntries((await rpc("pulse_programs")).map((p) => [p.name, new PublicKey(p.programId)]));
  const SWAP = progs.pulse_swap, LP = progs.pulse_launchpad;
  console.log("yerel-ag " + URL_ + "   PulseSwap " + SWAP.toBase58() + "   launchpad " + LP.toBase58());
  const sp = (...s) => PublicKey.findProgramAddressSync(s.map((x) => (typeof x === "string" ? Buffer.from(x) : x.toBuffer())), SWAP)[0];
  const lpp = (...s) => PublicKey.findProgramAddressSync(s.map((x) => (typeof x === "string" ? Buffer.from(x) : x.toBuffer())), LP)[0];

  const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, "pulse-swap", "e2e", "test-admin.json")))));
  const yeni = async () => { const k = Keypair.generate(); await rpc("requestAirdrop", [k.publicKey.toBase58(), 10_000_000_000]); return k; };
  await rpc("requestAirdrop", [admin.publicKey.toBase58(), 100_000_000_000]);
  const founder = await yeni(), buyer = await yeni(), lpUser = await yeni(), sinkOwner = Keypair.generate();

  /* mints and accounts from spl-token's instruction builders (its send
     helpers confirm over websocket, which yerel-ag does not serve) */
  const mint = async (dec = 6) => {
    const m = Keypair.generate();
    await gonder([SystemProgram.createAccount({ fromPubkey: admin.publicKey, newAccountPubkey: m.publicKey, lamports: await conn.getMinimumBalanceForRentExemption(spl.MINT_SIZE), space: spl.MINT_SIZE, programId: spl.TOKEN_PROGRAM_ID }),
      spl.createInitializeMint2Instruction(m.publicKey, dec, admin.publicKey, null)], [admin, m]);
    return m.publicKey;
  };
  const usdc = await mint(), tok = await mint(), fthm = await mint();
  const ata = async (m, o, amount = 0n) => {
    const a = spl.getAssociatedTokenAddressSync(m, o, true);
    const ixs = [spl.createAssociatedTokenAccountIdempotentInstruction(admin.publicKey, a, o, m)];
    if (amount) ixs.push(spl.createMintToInstruction(m, a, admin.publicKey, amount));
    await gonder(ixs, [admin]);
    return a;
  };
  const platformS = await ata(usdc, admin.publicKey), platformL = platformS, sink = await ata(fthm, sinkOwner.publicKey);

  /* ---- initialize both programs ---- */
  const sConfig = sp("config"), bucket = sp("bucket"), lConfig = lpp("config");
  await gonder([new TransactionInstruction({ programId: SWAP, keys: [S(admin.publicKey), W(sConfig), W(bucket), R(usdc), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID)],
    data: Buffer.concat([Buffer.from([0]), platformS.toBuffer(), fthm.toBuffer(), sink.toBuffer()]) })], [admin]);
  await gonder([new TransactionInstruction({ programId: LP, keys: [S(admin.publicKey), W(lConfig), R(usdc), R(platformL), R(SystemProgram.programId)],
    data: Buffer.concat([Buffer.from([0]), SWAP.toBuffer()]) })], [admin]);
  kontrol("iki program da baslatildi (config hesaplari zincirde)", (await conn.getAccountInfo(sConfig)) !== null && (await conn.getAccountInfo(lConfig)) !== null);
  await reddedilir("launchpad ikinci kez baslatilamaz", () => gonder([new TransactionInstruction({ programId: LP, keys: [S(admin.publicKey), W(lConfig), R(usdc), R(platformL), R(SystemProgram.programId)], data: Buffer.concat([Buffer.from([0]), SWAP.toBuffer()]) })], [admin]));

  /* ---- PulseSwap pools ---- */
  const havuz = (m) => { const p = sp("pool", m); return { p, tv: sp("tv", p), dv: sp("dv", p) }; };
  const ac = async (m, t, d) => {
    const h = havuz(m), lt = await ata(m, lpUser.publicKey, t * 2n), ld = await ata(usdc, lpUser.publicKey, d * 2n);
    await gonder([new TransactionInstruction({ programId: SWAP, keys: [S(lpUser.publicKey), R(sConfig), W(h.p), R(m), W(h.tv), W(h.dv), W(lt), W(ld), W(sp("shares", h.p, lpUser.publicKey)), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID), R(usdc)],
      data: Buffer.concat([Buffer.from([1]), u64(t, d)]) })], [lpUser]);
    return h;
  };
  const T = await ac(tok, 2000n * USD, 1000n * USD), F = await ac(fthm, 100000n * USD, 1000n * USD);
  kontrol("havuzlar acildi: TOK/USDC 2000/1000, FTHM/USDC 100000/1000", (await bal(T.tv)) === 2000n * USD && (await bal(F.dv)) === 1000n * USD);

  /* ---- a launch in one transaction, as the site will build it ---- */
  const fD = await ata(usdc, founder.publicKey, 1000n * USD);
  async function launchTx(backed) {
    const m = Keypair.generate();
    const launch = lpp("launch", m.publicKey);
    const L = { mint: m.publicKey, launch, pt: lpp("pt", launch), pd: lpp("pd", launch), vault: lpp("vault", launch), kv: lpp("kv", launch),
      fT: spl.getAssociatedTokenAddressSync(m.publicKey, founder.publicKey), md: PublicKey.findProgramAddressSync([Buffer.from("metadata"), MPL.toBuffer(), m.publicKey.toBuffer()], MPL)[0] };
    const rent = await conn.getMinimumBalanceForRentExemption(spl.MINT_SIZE);
    const keys = [S(founder.publicKey), R(lConfig), W(L.mint), W(launch), W(L.pt), W(L.pd), W(L.vault), W(fD), W(L.fT), W(platformL), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID), R(usdc), W(L.md), R(MPL)];
    let data = Buffer.concat([Buffer.from([1]), u64(SUPPLY, 20n * USD, 100n * USD, 10000n, 0n), adlar("Yerel Test", "YRL", "https://arc-depth.github.io/arc-depth/")]);
    if (backed) {
      keys.push(R(tok), W(L.kv), R(SWAP), R(sConfig), R(T.p), W(T.tv), W(T.dv), W(bucket), W(platformS));
      data = Buffer.concat([Buffer.from([6]), u64(SUPPLY, 25n * USD, 100n * USD, 10000n, 0n, 0n), adlar("Backed Test", "BKD", "")]);
    }
    L.ixs = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }),
      SystemProgram.createAccount({ fromPubkey: founder.publicKey, newAccountPubkey: m.publicKey, lamports: rent, space: spl.MINT_SIZE, programId: spl.TOKEN_PROGRAM_ID }),
      spl.createInitializeMint2Instruction(m.publicKey, 6, launch, null),
      spl.createAssociatedTokenAccountInstruction(founder.publicKey, L.fT, founder.publicKey, m.publicKey),
      new TransactionInstruction({ programId: LP, keys, data }),
    ];
    L.signers = [founder, m];
    return L;
  }
  const L1 = await launchTx(false);
  const r1 = await gonder(L1.ixs, L1.signers);
  kontrol("launch tek islemde (" + r1.boyut + " bayt / 1232 sinir)", r1.boyut <= 1232);
  kontrol("kurucu 27.237.354,085603 token aldi (Aptos/Sui devnet ile ayni)", (await bal(L1.fT)) === 27237354085603n, String(await bal(L1.fT)));
  kontrol("kasa 20 USDC, havuz 98 USDC", (await bal(L1.vault)) === 20n * USD && (await bal(L1.pd)) === 98n * USD);
  const mi = await spl.getMint(conn, L1.mint);
  kontrol("arz kesin: basim ve dondurma yetkisi yok, arz 1e9", mi.mintAuthority === null && mi.freezeAuthority === null && mi.supply === SUPPLY);
  const md = (await conn.getAccountInfo(L1.md)).data;
  const ad = md.slice(69, 69 + md.readUInt32LE(65)).toString().replace(/\0+$/, "");
  kontrol("metaveri zincirde: ad 'Yerel Test'", ad === "Yerel Test", ad);

  /* ---- buy, sell, redeem ---- */
  await rpc("pulse_warp", [10]);
  const bD = await ata(usdc, buyer.publicKey, 100n * USD), bT = await ata(L1.mint, buyer.publicKey);
  const al = (who, wd, wt, dollars) => gonder([new TransactionInstruction({ programId: LP, keys: [S(who.publicKey, false), R(lConfig), R(L1.launch), W(L1.pt), W(L1.pd), W(L1.vault), W(wd), W(wt), W(fD), W(platformL), R(spl.TOKEN_PROGRAM_ID)], data: Buffer.concat([Buffer.from([2]), u64(dollars, 0n)]) })], [who]);
  await al(buyer, bD, bT, 50n * USD);
  kontrol("50 USDC alim: 12.938.156,678142 token", (await bal(bT)) === 12938156678142n, String(await bal(bT)));
  const d0 = await bal(bD);
  await gonder([new TransactionInstruction({ programId: LP, keys: [S(buyer.publicKey, false), R(lConfig), R(L1.mint), W(L1.launch), W(L1.pt), W(L1.pd), W(L1.vault), W(bT), W(bD), W(fD), W(platformL), R(spl.TOKEN_PROGRAM_ID)], data: Buffer.concat([Buffer.from([3]), u64(await bal(bT), 0n)]) })], [buyer]);
  kontrol("tum pozisyon satisi: net 45,594378 USDC", (await bal(bD)) - d0 === 45594378n, String((await bal(bD)) - d0));
  const tenth = (await bal(L1.fT)) / 10n, f0 = await bal(fD);
  await gonder([new TransactionInstruction({ programId: LP, keys: [S(founder.publicKey, false), W(L1.mint), R(L1.launch), R(L1.pt), W(L1.vault), W(L1.fT), W(fD), R(spl.TOKEN_PROGRAM_ID)], data: Buffer.concat([Buffer.from([4]), u64(tenth)]) })], [founder]);
  kontrol("%10 itfa: 2,244018 USDC (iki devnet ile kurusu kurusuna ayni)", (await bal(fD)) - f0 === 2244018n, String((await bal(fD)) - f0));
  kontrol("son kasa 20,196168 USDC", (await bal(L1.vault)) === 20196168n);

  /* ---- paste TOK as collateral: refused on a young pool, accepted a day later ---- */
  const L2a = await launchTx(true);
  await reddedilir("1 gunluk olmayan havuzla teminat reddedilir", () => gonder(L2a.ixs, L2a.signers));
  const saat = await rpc("pulse_warp", [86400]);
  const L2 = await launchTx(true);
  const r2 = await gonder(L2.ixs, L2.signers);
  const net = 25n * USD - 25000n;
  kontrol("24 saat sonra CA yapistir tek islemde (" + r2.boyut + " bayt)", r2.boyut <= 1232, "zincir saati " + new Date(saat.unixTimestamp * 1000).toISOString());
  kontrol("kasada takasin teslim ettigi TOK birebir", (await bal(L2.kv)) === quote(1000n * USD, 2000n * USD, net), String(await bal(L2.kv)));

  /* ---- the bucket becomes FTHM at the sink ---- */
  const kova = await bal(bucket);
  await gonder([new TransactionInstruction({ programId: SWAP, keys: [R(sConfig), W(bucket), R(F.p), W(F.tv), W(F.dv), W(sink), R(spl.TOKEN_PROGRAM_ID), S(buyer.publicKey)], data: Buffer.from([5]) })], [buyer]);
  kontrol("kova (" + kova + ") FTHM'ye dondu, sabit alici adreste", (await bal(sink)) === quote(1000n * USD, 100000n * USD, kova) && (await bal(bucket)) === 0n);

  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA", e.message, e.logs || ""); process.exit(1); });
