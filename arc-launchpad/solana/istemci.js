"use strict";
/* ===========================================================================
 * istemci.js — builds a PulseLaunchpad launch on Solana as TWO transactions
 *
 *   const ist = require("./istemci");
 *   const { hazirlik, launch, adres } = await ist.launchIslemleri(conn, { ... });
 *   send hazirlik.ixs signed by [founder, mint], then launch.ixs signed by [founder]
 *
 * WHY TWO
 *   One transaction carried: compute budget, create the mint account,
 *   initialize it, create the founder's token account and Launch (15
 *   accounts) — 968 bytes with a short name, and LaunchBacked (24
 *   accounts) 1,204 bytes with an EMPTY URI. Solana's limit is 1,232. A
 *   real name, symbol and 200-byte URI would not fit, and the site would
 *   fail at signing for the longest tokens only.
 *
 *   Split:
 *     1 hazirlik  create the mint account, InitializeMint2 with the launch
 *                 PDA as the only mint authority (no freeze authority), and
 *                 the founder's associated token account for it
 *     2 launch    compute budget + Launch / LaunchBacked
 *   The program needs nothing new: Launch already takes an initialized,
 *   empty mint whose authority is the launch PDA.
 *
 * WHAT HAPPENS BETWEEN THE TWO
 *   After (1) the mint exists with supply 0 and its only authority is the
 *   launch PDA, which only the program can sign for: nobody can mint, and
 *   no one but the program ever will. Someone else could send (2) first,
 *   for this mint, as their own founder with their own money; the original
 *   founder then loses only the mint's rent (~0.0015 SOL) and launches with
 *   a fresh mint. If (2) fails, (1) is harmless and the client can retry
 *   (2) with the same mint.
 *
 * THE LOOKUP TABLE
 *   Split alone, LaunchBacked at the longest name, symbol and URI came to
 *   exactly 1,232 bytes: inside the limit by zero. So the launch
 *   transaction is a v0 message against one address lookup table holding
 *   the accounts every launch repeats (config, the dollar, the platform
 *   accounts, the programs, PulseSwap's config and bucket): each costs one
 *   byte instead of 32. The table is created once at deployment and frozen,
 *   so nobody can change what an index points to. Without a table the
 *   legacy message still works for every launch but that one extreme.
 *
 * Works in Node (NODE_PATH=C:/Users/omen/araclar/sol/node_modules) against
 * any RPC; not part of the site.
 * =========================================================================== */
const { PublicKey, SystemProgram, TransactionInstruction, ComputeBudgetProgram, TransactionMessage, VersionedTransaction } = require("@solana/web3.js");
const spl = require("@solana/spl-token");

const MPL = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const SINIR = { ad: 32, sembol: 10, uri: 200 };   // Metaplex Token Metadata
const ISLEM_SINIRI = 1232;

const u64 = (...v) => Buffer.concat(v.map((n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; }));
const metin = (...s) => Buffer.concat(s.map((x) => Buffer.concat([Buffer.from([Buffer.byteLength(x)]), Buffer.from(x)])));
const W = (k) => ({ pubkey: k, isSigner: false, isWritable: true });
const R = (k) => ({ pubkey: k, isSigner: false, isWritable: false });
const S = (k) => ({ pubkey: k, isSigner: true, isWritable: true });

/** Every address a launch of `mint` uses. */
function adresler(LP, mint, founder) {
  const pda = (...s) => PublicKey.findProgramAddressSync(s, LP)[0];
  const launch = pda(Buffer.from("launch"), mint.toBuffer());
  return {
    config: pda(Buffer.from("config")),
    mint, launch,
    pt: pda(Buffer.from("pt"), launch.toBuffer()),
    pd: pda(Buffer.from("pd"), launch.toBuffer()),
    vault: pda(Buffer.from("vault"), launch.toBuffer()),
    kv: pda(Buffer.from("kv"), launch.toBuffer()),
    fT: spl.getAssociatedTokenAddressSync(mint, founder),
    md: PublicKey.findProgramAddressSync([Buffer.from("metadata"), MPL.toBuffer(), mint.toBuffer()], MPL)[0],
  };
}

/**
 * @param conn  a @solana/web3.js Connection (only the mint rent is read)
 * @param p {
 *   LP, usdc, platform, founder, founderDollar   PublicKeys
 *   mint        PublicKey of a fresh keypair the caller holds (signs hazirlik)
 *   arz, teminat, ilkAlim, vergiPpm, asgari      bigint | number (asgari = min tokens)
 *   ad, sembol, uri                              strings (Metaplex limits)
 *   yapistir?   { SWAP, k, swapConfig, pool, tv, dv, bucket, swapPlatform, asgariK }
 *               present = LaunchBacked: `teminat` dollars are swapped into k
 * }
 */
/** The accounts every launch repeats, for the shared lookup table. */
function tabloHesaplari({ LP, usdc, platform, SWAP, swapConfig, bucket, swapPlatform }) {
  const config = PublicKey.findProgramAddressSync([Buffer.from("config")], LP)[0];
  return [config, usdc, platform, SystemProgram.programId, spl.TOKEN_PROGRAM_ID, MPL, LP, ComputeBudgetProgram.programId,
    SWAP, swapConfig, bucket, swapPlatform].filter(Boolean);
}

/** A v0 transaction for `ixs`, paid by `odeyen`, resolved against `tablolar`. */
function v0Islem(odeyen, ixs, blockhash, tablolar) {
  const mesaj = new TransactionMessage({ payerKey: odeyen, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(tablolar);
  return new VersionedTransaction(mesaj);
}

async function launchIslemleri(conn, p) {
  for (const [alan, n] of Object.entries(SINIR)) {
    if (Buffer.byteLength(p[alan] || "") > n) throw new Error(alan + " en fazla " + n + " bayt");
  }
  const a = adresler(p.LP, p.mint, p.founder);
  const rent = await conn.getMinimumBalanceForRentExemption(spl.MINT_SIZE);
  const hazirlik = {
    ixs: [
      SystemProgram.createAccount({ fromPubkey: p.founder, newAccountPubkey: p.mint, lamports: rent, space: spl.MINT_SIZE, programId: spl.TOKEN_PROGRAM_ID }),
      spl.createInitializeMint2Instruction(p.mint, 6, a.launch, null),
      spl.createAssociatedTokenAccountIdempotentInstruction(p.founder, a.fT, p.founder, p.mint),
    ],
  };
  const keys = [S(p.founder), R(a.config), W(a.mint), W(a.launch), W(a.pt), W(a.pd), W(a.vault), W(p.founderDollar), W(a.fT),
    W(p.platform), R(SystemProgram.programId), R(spl.TOKEN_PROGRAM_ID), R(p.usdc), W(a.md), R(MPL)];
  let data;
  if (p.yapistir) {
    const y = p.yapistir;
    keys.push(R(y.k), W(a.kv), R(y.SWAP), R(y.swapConfig), R(y.pool), W(y.tv), W(y.dv), W(y.bucket), W(y.swapPlatform));
    data = Buffer.concat([Buffer.from([6]), u64(p.arz, p.teminat, p.ilkAlim, p.vergiPpm, p.asgari, y.asgariK || 0), metin(p.ad, p.sembol, p.uri || "")]);
  } else {
    data = Buffer.concat([Buffer.from([1]), u64(p.arz, p.teminat, p.ilkAlim, p.vergiPpm, p.asgari), metin(p.ad, p.sembol, p.uri || "")]);
  }
  const launch = {
    ixs: [ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }), new TransactionInstruction({ programId: p.LP, keys, data })],
  };
  return { hazirlik, launch, adres: a };
}

module.exports = { launchIslemleri, adresler, tabloHesaplari, v0Islem, MPL, SINIR, ISLEM_SINIRI };
