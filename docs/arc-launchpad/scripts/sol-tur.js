"use strict";
/* ===========================================================================
 * sol-tur.js — a real FTHM round trip Arc -> Solana -> Arc
 *
 *   NODE_PATH=C:\Users\omen\araclar\sol\node_modules node scripts/sol-tur.js <git|don|durum> [--uygula]
 *
 * The Arc FTHMOFTAdapter is the last owned contract of the FTHM network and
 * it also carries the Solana path. Its owner is burned only after this path
 * has carried a real transfer both ways.
 *   git   buy 1 USDC of FTHM in Arc's pool (ops money, the one-off
 *         V4Takasci from fthm-tur.js), send it to the Solana deployer; the
 *         adapter's enforced options pay 200k CU and the recipient's token
 *         account rent (2,039,280 lamports) on arrival
 *   don   send it all back from Solana to the EVM deployer on Arc, through
 *         Paxos's immutable OFT program and our OFT store
 * Record: rapor/fthm-tur.json (key "sol").
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, hexlify, zeroPadValue } = require("ethers");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "rapor", "fthm-tur.json");
const SOL = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sol-fthm.json"), "utf8"));
const F = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const UYGULA = process.argv.includes("--uygula");
const ADIM = process.argv[2];
const ADAPTOR = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const RPC_SOL = process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const anahtar = (dosya, ad) => fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();

(async () => {
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  const yaz = () => fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1));
  k.sol = k.sol || {};
  const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
  const { createSignerFromKeypair, signerIdentity, publicKey } = require("@metaplex-foundation/umi");
  const { oft } = require("@layerzerolabs/oft-v2-solana-sdk");
  const { findAssociatedTokenPda } = require("@metaplex-foundation/mpl-toolbox");
  const umi = createUmi(RPC_SOL).use(require("@metaplex-foundation/mpl-toolbox").mplToolbox());
  const solSigner = createSignerFromKeypair(umi, umi.eddsa.createKeypairFromSeed(new Uint8Array(Buffer.from(anahtar(path.join(KOK, ".env"), "SOLANA_PRIVATE_KEY"), "hex"))));
  umi.use(signerIdentity(solSigner));
  const mint = publicKey(SOL.mint);
  const [ata] = findAssociatedTokenPda(umi, { mint, owner: solSigner.publicKey });
  const solBakiye = async () => {
    const r = await umi.rpc.getAccount(ata).catch(() => null);
    if (!r || !r.exists) return 0n;
    return Buffer.from(r.data).readBigUInt64LE(64);
  };

  const pk = anahtar("C:/bot/.env", "TRADER_PRIVATE_KEY");
  const arc = new Wallet(pk, new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true }));
  const fthm = new Contract(F.token, ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)",
    "function allowance(address,address) view returns (uint256)"], arc);
  const israr = async (f) => { for (let d = 0; ; d++) { try { return await f(); } catch (e) { if (d > 8 || !/rate limit|429|coalesce/i.test(e.message || "")) throw e; await bekle(5000 * (d + 1)); } } };
  const tx = async (etiket, p) => {
    const t = await israr(() => arc.sendTransaction(p));
    let m = null; while (!m) { await bekle(2000); m = await arc.provider.getTransactionReceipt(t.hash).catch(() => null); }
    console.log("  " + etiket.padEnd(26) + t.hash + " durum " + m.status);
    if (m.status !== 1) throw new Error(etiket);
    k.sol[etiket] = t.hash; yaz();
    return m;
  };

  if (ADIM === "git") {
    const art = JSON.parse(fs.readFileSync(path.join(KOK, "nesil2-test", "out", "V4Takasci.sol", "V4Takasci.json"), "utf8"));
    const takasci = new Contract(k.takasci, art.abi, arc);
    const usdc = new Contract(F.usdc, ["function approve(address,uint256) returns (bool)"], arc);
    const a = new Contract(ADAPTOR, ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
      "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable"], arc);
    const to = hexlify(new (require("@solana/web3.js").PublicKey)(solSigner.publicKey.toString()).toBytes());
    if (!UYGULA) { const [f] = await a.quoteSend([30168, to, 10n ** 22n, 0n, "0x", "0x", "0x"], false); console.log("Arc -> Solana ucret " + Number(f) / 1e18 + " USDC (kuru)"); return; }
    let miktar;
    if (k.sol.alinan && !k.sol["Arc->Solana"]) {
      miktar = BigInt(k.sol.alinan);   // bought in an earlier, interrupted run
    } else {
      await tx("USDC onay (sol)", await usdc.approve.populateTransaction(k.takasci, 1_000_000n));
      const once = await fthm.balanceOf(arc.address);
      await tx("FTHM al 1 USDC (sol)", await takasci.takas.populateTransaction([F.usdc, F.token, F.fee, F.spacing, F.hook], true, 1_000_000n));
      miktar = (await fthm.balanceOf(arc.address)) - once;
      miktar = (miktar / 10n ** 12n) * 10n ** 12n;
      k.sol.alinan = miktar.toString(); yaz();
    }
    const p = [30168, to, miktar, (miktar * 99n) / 100n, "0x", "0x", "0x"];
    const [ucret] = await a.quoteSend(p, false);
    if ((await fthm.allowance(arc.address, ADAPTOR)) < miktar) await tx("FTHM onay (sol)", await fthm.approve.populateTransaction(ADAPTOR, miktar));
    const s0 = await solBakiye();
    await tx("Arc->Solana", { ...(await a.send.populateTransaction(p, [ucret, 0], arc.address)), value: ucret });
    for (let i = 0; i < 90; i++) {
      await bekle(10000);
      const s = await solBakiye();
      if (s > s0) { console.log("  Solana'da FTHM geldi: " + Number(s - s0) / 1e9); k.sol.geldi = String(s - s0); yaz(); return; }
    }
    console.log("  zaman asimi");
  }

  if (ADIM === "don") {
    const miktar = await solBakiye();
    console.log("Solana FTHM " + Number(miktar) / 1e9);
    if (miktar === 0n) return;
    const tutar = (miktar / 1000n) * 1000n;   // 9 local, 6 shared decimals
    const to = Uint8Array.from(Buffer.from(zeroPadValue(arc.address, 32).slice(2), "hex"));
    const program = publicKey(SOL.program);
    const prm = { dstEid: 30417, to, amountLd: tutar, minAmountLd: (tutar * 99n) / 100n };
    /* the LayerZero SDK checks "instanceof Connection" against ITS copy of
       @solana/web3.js; hand it a connection built from that copy */
    const web3 = require(require.resolve("@solana/web3.js", { paths: [require.resolve("@layerzerolabs/lz-solana-sdk-v2")] }));
    const rpc = Object.assign(Object.create(umi.rpc), { connection: new web3.Connection(RPC_SOL, "confirmed") });
    const q = await oft.quote(rpc, { payer: solSigner.publicKey, tokenMint: mint, tokenEscrow: publicKey(SOL.escrow) }, prm, { oft: program });
    console.log("  ucret " + Number(q.nativeFee) / 1e9 + " SOL");
    if (!UYGULA) return;
    const ix = await oft.send(rpc, { payer: solSigner, tokenMint: mint, tokenEscrow: publicKey(SOL.escrow), tokenSource: ata },
      { ...prm, nativeFee: q.nativeFee }, { oft: program });
    const { transactionBuilder } = require("@metaplex-foundation/umi");
    const { setComputeUnitLimit } = require("@metaplex-foundation/mpl-toolbox");
    const r = await transactionBuilder().add(setComputeUnitLimit(umi, { units: 400000 })).add(ix).sendAndConfirm(umi);
    const imza = require("bs58").default ? require("bs58").default.encode(r.signature) : require("bs58").encode(r.signature);
    console.log("  Solana->Arc " + imza);
    k.sol["Solana->Arc"] = imza; yaz();
    const a0 = await fthm.balanceOf(arc.address);
    for (let i = 0; i < 90; i++) {
      await bekle(10000);
      const a1 = await fthm.balanceOf(arc.address);
      if (a1 > a0) { console.log("  Arc'ta FTHM geldi: " + Number(a1 - a0) / 1e18); k.sol.dondu = String(a1 - a0); yaz(); return; }
    }
    console.log("  zaman asimi");
  }

  if (ADIM === "durum") console.log("Solana FTHM " + Number(await solBakiye()) / 1e9 + "   ATA " + ata);
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
