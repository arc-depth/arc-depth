"use strict";
/* ===========================================================================
 * e2e/yerel.js — PulseSwap end to end on a LOCAL validator (no network, no
 * real SOL). Expects solana-test-validator on 127.0.0.1:8899 with the
 * local-test build loaded at PROGRAM_ID (see e2e/calistir.sh).
 *
 * Checks, every number read back from the chain:
 *   init once; second init refused; non-initializer refused
 *   open TOK/USDC 1000/1000 and FTHM/USDC 100000/1000
 *   buy 100 USDC: out == x*y quote, bucket +0.005, platform +0.095
 *   sell back: fee on the dollars out
 *   buy_fthm: the bucket becomes FTHM at the sink, bucket emptied
 *   buy_fthm to a wrong sink refused
 *   add / remove liquidity, removing more than held refused
 * =========================================================================== */
const path = require("path");
const fs = require("fs");
const M = "C:/Users/omen/araclar/sol/node_modules/";
const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } = require(M + "@solana/web3.js");
const spl = require(M + "@solana/spl-token");

const PROGRAM_ID = new PublicKey(process.argv[2]);
const conn = new Connection("http://127.0.0.1:8899", "confirmed");
const admin = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(__dirname, "test-admin.json")))));
const USD = 1_000_000n;
let gecti = 0, kaldi = 0;
const kontrol = (ad, ok, ek = "") => { ok ? gecti++ : kaldi++; console.log((ok ? "  PASS  " : "  FAIL  ") + ad + (ek ? "   " + ek : "")); };
const pda = (...s) => PublicKey.findProgramAddressSync(s.map((x) => (typeof x === "string" ? Buffer.from(x) : x.toBuffer())), PROGRAM_ID)[0];
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const bal = async (a) => BigInt((await conn.getTokenAccountBalance(a)).value.amount);
const W = (k) => ({ pubkey: k, isSigner: false, isWritable: true });
const R = (k) => ({ pubkey: k, isSigner: false, isWritable: false });
const S = (k, w = true) => ({ pubkey: k, isSigner: true, isWritable: w });
const gonder = (keys, data, signers) => sendAndConfirmTransaction(conn, new Transaction().add(new TransactionInstruction({ programId: PROGRAM_ID, keys, data })), signers);
const reddedilir = async (ad, f) => { try { await f(); kontrol(ad, false, "gecti, reddedilmeliydi"); } catch (e) { kontrol(ad, true); } };
const quote = (rin, rout, a) => { const after = (a * 997000n) / 1000000n; return (rout * after) / (rin + after); };

(async () => {
  for (const k of [admin]) await conn.confirmTransaction(await conn.requestAirdrop(k.publicKey, 100 * LAMPORTS_PER_SOL));
  const user = Keypair.generate(), lp = Keypair.generate(), platformW = Keypair.generate(), sinkW = Keypair.generate(), stranger = Keypair.generate();
  for (const k of [user, lp, stranger]) await conn.confirmTransaction(await conn.requestAirdrop(k.publicKey, 10 * LAMPORTS_PER_SOL));
  const mk = () => spl.createMint(conn, admin, admin.publicKey, null, 6);
  const usdc = await mk(), tok = await mk(), fthm = await mk();
  const ata = async (mint, owner) => (await spl.getOrCreateAssociatedTokenAccount(conn, admin, mint, owner)).address;
  const lpU = await ata(usdc, lp.publicKey), lpT = await ata(tok, lp.publicKey), lpF = await ata(fthm, lp.publicKey);
  const uU = await ata(usdc, user.publicKey), uT = await ata(tok, user.publicKey);
  const platform = await ata(usdc, platformW.publicKey), sink = await ata(fthm, sinkW.publicKey), wrongSink = await ata(fthm, stranger.publicKey);
  await spl.mintTo(conn, admin, usdc, lpU, admin, 10000n * USD);
  await spl.mintTo(conn, admin, tok, lpT, admin, 10000n * USD);
  await spl.mintTo(conn, admin, fthm, lpF, admin, 100000n * USD);
  await spl.mintTo(conn, admin, usdc, uU, admin, 1000n * USD);

  const config = pda("config"), bucket = pda("bucket");
  const initKeys = (who) => [S(who.publicKey), W(config), W(bucket), R(usdc), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID)];
  const initData = Buffer.concat([Buffer.from([0]), platform.toBuffer(), fthm.toBuffer(), sink.toBuffer()]);
  await reddedilir("yalniz INITIALIZER initialize eder", () => gonder(initKeys(stranger), initData, [stranger]));
  await gonder(initKeys(admin), initData, [admin]);
  kontrol("initialize: config ve kova olustu", (await conn.getAccountInfo(config)) !== null && (await bal(bucket)) === 0n);
  await reddedilir("ikinci initialize reddedilir", () => gonder(initKeys(admin), initData, [admin]));

  const havuz = (mint) => { const p = pda("pool", mint); return { p, tv: pda("tv", p), dv: pda("dv", p) }; };
  const ac = async (mint, opT, opU, t, d) => {
    const h = havuz(mint);
    await gonder([S(lp.publicKey), R(config), W(h.p), R(mint), W(h.tv), W(h.dv), W(opT), W(opU), W(pda("shares", h.p, lp.publicKey)), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID), R(usdc)],
      Buffer.concat([Buffer.from([1]), u64(t), u64(d)]), [lp]);
    return h;
  };
  const T = await ac(tok, lpT, lpU, 1000n * USD, 1000n * USD);
  const F = await ac(fthm, lpF, lpU, 100000n * USD, 1000n * USD);
  kontrol("havuz acildi: TOK/USDC 1000/1000", (await bal(T.tv)) === 1000n * USD && (await bal(T.dv)) === 1000n * USD);
  const sharesAcc = await conn.getAccountInfo(pda("shares", T.p, lp.publicKey));
  kontrol("acana pay = sqrt(t*d) - 1000 kilitli", sharesAcc.data.readBigUInt64LE(0) === 1000n * USD - 1000n);

  const takas = (who, h, buy, inAcc, outAcc, amount, min = 0n) => gonder(
    [S(who.publicKey, false), R(config), R(h.p), W(h.tv), W(h.dv), W(inAcc), W(outAcc), W(bucket), W(platform), R(spl.TOKEN_PROGRAM_ID)],
    Buffer.concat([Buffer.from([buy ? 1 : 0]), u64(amount), u64(min)]), [who]);

  const beklenen = quote(1000n * USD, 1000n * USD, 100n * USD - 100000n);
  await takas(user, T, true, uU, uT, 100n * USD);
  const got = await bal(uT);
  kontrol("alim: cikti x*y teklifiyle birebir", got === beklenen, got + " = " + beklenen);
  kontrol("protokol ucreti: %5'i (0,005) FTHM kovasinda", (await bal(bucket)) === 5000n);
  kontrol("protokol ucreti: %95'i (0,095) platformda", (await bal(platform)) === 95000n);
  await reddedilir("kayma siniri uygulanir", () => takas(user, T, true, uU, uT, 1n * USD, 10n * USD));
  const u0 = await bal(uU);
  await takas(user, T, false, uT, uU, got);
  const geri = (await bal(uU)) - u0;
  kontrol("satis: geri gelen < 100 ve > 99", geri < 100n * USD && geri > 99n * USD, geri.toString());
  kontrol("satis da ucret odedi (kova buyudu)", (await bal(bucket)) > 5000n);

  const kova = await bal(bucket);
  const fk = [R(config), W(bucket), R(F.p), W(F.tv), W(F.dv)];
  await reddedilir("kova yanlis adrese FTHM alamaz", () => gonder([...fk, W(wrongSink), R(spl.TOKEN_PROGRAM_ID)], Buffer.from([5]), [stranger]));
  await gonder([...fk, W(sink), R(spl.TOKEN_PROGRAM_ID)], Buffer.from([5]), [stranger]);
  const fthmAlinan = await bal(sink);
  kontrol("buy_fthm: kova FTHM'ye dondu, alici sabit adres", fthmAlinan === quote(1000n * USD, 100000n * USD, kova), fthmAlinan.toString());
  kontrol("buy_fthm: kova bosaldi", (await bal(bucket)) === 0n);

  const lpShares = () => conn.getAccountInfo(pda("shares", T.p, lp.publicKey)).then((a) => a.data.readBigUInt64LE(0));
  const s0 = await lpShares();
  await gonder([S(lp.publicKey), R(config), W(T.p), W(T.tv), W(T.dv), W(lpT), W(lpU), W(pda("shares", T.p, lp.publicKey)), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID)],
    Buffer.concat([Buffer.from([2]), u64(100n * USD), u64(100n * USD)]), [lp]);
  kontrol("likidite ekleme pay verir", (await lpShares()) > s0);
  const s1 = await lpShares();
  const rm = (n) => gonder([S(lp.publicKey, false), W(T.p), W(T.tv), W(T.dv), W(lpT), W(lpU), W(pda("shares", T.p, lp.publicKey)), R(spl.TOKEN_PROGRAM_ID)], Buffer.concat([Buffer.from([3]), u64(n)]), [lp]);
  await reddedilir("sahip olunandan fazla pay cekilemez", () => rm(s1 + 1n));
  await rm(s1);
  kontrol("tum pay cekildi, havuzda yalniz kilitli toz kaldi", (await lpShares()) === 0n && (await bal(T.tv)) < 2000n && (await bal(T.dv)) < 2000n,
    (await bal(T.tv)) + " / " + (await bal(T.dv)));

  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})().catch((e) => { console.error("HATA", e.message, e.logs || ""); process.exit(1); });
