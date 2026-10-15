"use strict";
/* ===========================================================================
 * sol-fthm.js — FTHM on Solana, on an immutable LayerZero OFT program
 *
 *   NODE_PATH=C:\Users\omen\araclar\sol\node_modules node scripts/sol-fthm.js [--uygula]
 *
 * WHY NO PROGRAM OF OUR OWN
 *   A Solana OFT needs an OFT program; deploying one costs ~3.8 SOL of rent.
 *   One program serves many tokens (its OFT Store accounts), `init_oft` is
 *   permissionless (LayerZero devtools source: only `payer` signs, `admin` is
 *   a parameter), and several deployed OFT programs have their upgrade
 *   authority burned. Paxos's — paxosVkYuJBKUQoZGAidRA47Qt4uidqG5fAt5kmr1nR,
 *   home of USDG, PYUSD and PAXG — was compared byte for byte with three other
 *   immutable deployments: 288 differing bytes in 9 regions, every one the
 *   program's own id inlined. Same source, nobody can change it. FTHM gets its
 *   own OFT Store there; we pay account rent only.
 *
 * STEPS (each read first, skipped when done; each simulated before it is sent)
 *   1  SPL mint, 9 decimals (shared 6, like every LayerZero OFT), Metaplex
 *      metadata "Fathom"/"FTHM", supply 0
 *   2  init_oft on the Paxos program: Native type, admin = this deployer
 *   3  mint authority -> the OFT Store PDA; freeze authority -> none
 *   (wiring to Arc is sol-fthm-bagla.js)
 *
 * Keys: SOLANA_PRIVATE_KEY (payer/admin), SOLANA_FTHM_MINT_KEY, SOLANA_FTHM_ESCROW_KEY
 * in .env — created here if absent, never replaced. Record: dagitim-sol-fthm.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { createSignerFromKeypair, signerIdentity, transactionBuilder, publicKey, percentAmount } = require("@metaplex-foundation/umi");
const { createV1, mplTokenMetadata, TokenStandard } = require("@metaplex-foundation/mpl-token-metadata");
const { setAuthority, AuthorityType } = require("@metaplex-foundation/mpl-toolbox");
const { oft, OftPDA } = require("@layerzerolabs/oft-v2-solana-sdk");
const bs58 = require("bs58").default || require("bs58");

const KOK = path.join(__dirname, "..");
const ENV = path.join(KOK, ".env");
const KAYIT = path.join(KOK, "dagitim-sol-fthm.json");
const RPC = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const PAXOS_OFT = "paxosVkYuJBKUQoZGAidRA47Qt4uidqG5fAt5kmr1nR";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const UYGULA = process.argv.includes("--uygula");

function anahtar(ad) {
  let env = fs.existsSync(ENV) ? fs.readFileSync(ENV, "utf8") : "";
  const m = env.match(new RegExp("^" + ad + "\\s*=\\s*([0-9a-fA-F]{64})\\s*$", "m"));
  if (m) return Buffer.from(m[1], "hex");
  const yeni = crypto.randomBytes(32);
  env += (env.endsWith("\n") ? "" : "\n") + ad + "=" + yeni.toString("hex") + "\n";
  fs.writeFileSync(ENV, env);
  return yeni;
}

(async () => {
  const umi = createUmi(RPC).use(mplTokenMetadata());
  const imzaci = (seed) => createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSeed(new Uint8Array(seed)));
  const odeyen = imzaci(anahtar("SOLANA_PRIVATE_KEY"));
  umi.use(signerIdentity(odeyen));
  const mint = imzaci(anahtar("SOLANA_FTHM_MINT_KEY"));
  const escrow = imzaci(anahtar("SOLANA_FTHM_ESCROW_KEY"));
  const program = publicKey(PAXOS_OFT);
  const [oftStore] = new OftPDA(program).oftStore(escrow.publicKey);
  const k = { program: PAXOS_OFT, odeyen: odeyen.publicKey, mint: mint.publicKey, escrow: escrow.publicKey, oftStore };
  console.log("SOLANA FTHM  " + (UYGULA ? "UYGULA" : "KURU"));
  for (const [a, v] of Object.entries(k)) console.log("  " + a.padEnd(9) + v);
  const bakiye = await umi.rpc.getBalance(odeyen.publicKey);
  console.log("  bakiye   " + Number(bakiye.basisPoints) / 1e9 + " SOL");

  const gonder = async (etiket, tb) => {
    const tx = await tb.buildWithLatestBlockhash(umi);
    const imzali = await tb.buildAndSign(umi);
    const sim = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "simulateTransaction",
      params: [Buffer.from(umi.transactions.serialize(imzali)).toString("base64"), { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true }] }) }).then((x) => x.json());
    const hata = sim.result && sim.result.value && sim.result.value.err;
    const kayit = (sim.result && sim.result.value && sim.result.value.logs) || [];
    console.log("  " + etiket.padEnd(28) + "simulasyon " + (hata ? "HATA " + JSON.stringify(hata) : "ok") +
      (sim.result && sim.result.value ? "  CU " + sim.result.value.unitsConsumed : ""));
    if (hata) { console.log(kayit.slice(-12).join("\n")); throw new Error(etiket + " simulasyonda dustu"); }
    if (!UYGULA) return null;
    const r = await tb.sendAndConfirm(umi, { confirm: { commitment: "confirmed" } });
    const imza = bs58.encode(r.signature);
    console.log("  " + "".padEnd(28) + "https://solscan.io/tx/" + imza);
    return imza;
  };
  const var_ = async (pk) => (await umi.rpc.getAccount(pk)).exists;

  /* 1 */
  if (!(await var_(mint.publicKey))) {
    k.mintTx = await gonder("mint + metaveri", transactionBuilder().add(createV1(umi, {
      mint, name: "Fathom", symbol: "FTHM", decimals: 9, uri: "", isMutable: true,
      sellerFeeBasisPoints: percentAmount(0), authority: odeyen, tokenStandard: TokenStandard.Fungible,
    })));
    if (!UYGULA) { console.log("  (kuru: sonraki adimlar mint olusmadan simule edilemez)"); return; }
  } else console.log("  mint zincirde");

  /* 2 */
  if (!(await var_(oftStore))) {
    k.initTx = await gonder("init_oft (Paxos programi)", transactionBuilder().add(oft.initOft(
      { payer: odeyen, admin: odeyen.publicKey, mint: mint.publicKey, escrow },
      oft.types.OFTType.Native, 6, { oft: program, token: publicKey(TOKEN_PROGRAM) })));
  } else console.log("  OFT Store zincirde");

  /* 3 */
  const mintHesap = await umi.rpc.getAccount(mint.publicKey);
  const yetki = mintHesap.exists ? bs58.encode(mintHesap.data.slice(4, 36)) : null;
  const yetkiVar = mintHesap.exists && mintHesap.data[0] === 1;
  if (yetkiVar && yetki !== String(oftStore)) {
    k.yetkiTx = await gonder("basim yetkisi -> OFT Store", transactionBuilder()
      .add(setAuthority(umi, { owned: mint.publicKey, owner: odeyen, newAuthority: oftStore, authorityType: AuthorityType.MintTokens }))
      .add(setAuthority(umi, { owned: mint.publicKey, owner: odeyen, newAuthority: null, authorityType: AuthorityType.FreezeAccount })));
  } else console.log("  basim yetkisi OFT Store'da");

  if (UYGULA) {
    const onceki = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
    fs.writeFileSync(KAYIT, JSON.stringify({ ...onceki, ...Object.fromEntries(Object.entries(k).map(([a, v]) => [a, String(v)])),
      zaman: new Date().toISOString() }, null, 1));
  }
  const son = await umi.rpc.getBalance(odeyen.publicKey);
  console.log("  harcanan " + (Number(bakiye.basisPoints - son.basisPoints) / 1e9).toFixed(6) + " SOL");
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
