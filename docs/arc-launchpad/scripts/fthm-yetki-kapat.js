"use strict";
/* ===========================================================================
 * fthm-yetki-kapat.js — remove every key that can still act on FTHM
 *
 *   NODE_PATH=C:/Users/omen/araclar/suisdk/node_modules;C:/Users/omen/araclar/aptossdk/node_modules;C:/Users/omen/araclar/sol/node_modules;C:/arc-launchpad/node_modules \
 *     node scripts/fthm-yetki-kapat.js [--uygula]
 *
 * WHY (security review, 17 Oct 2026; user: "tamam yap"): FTHM is held by
 * people who bought it to support the project, and the trade fee buys and
 * burns it. Wherever one key can still set a peer, a DVN or upgrade code,
 * that key could mint FTHM on a chain or drain a pool. Read from the chains
 * before writing this:
 *
 *   ALREADY KEYLESS: Arc FTHM token, KapiAg, FTHMKapi; the FTHM twin and the
 *   Aptos/Sui gate on Base (and the twins on the other EVM chains, same
 *   factory): owner 0, delegate 0xdead.
 *
 *   STILL KEYED (deployer 0x8918…11D0 unless noted):
 *     Arc  FTHMOFTAdapter  owner + LayerZero delegate  -> sahipligiYak()
 *     Arc  FiyatElcisi     owner + delegate            -> sahipligiYak()
 *     Robinhood FTHMOFT (first generation) owner + delegate -> sahipligiYak()
 *     Aptos 0xc331…da84    fthm_oft is "compatible" and the account holds the
 *                          key (APTOS_PRIVATE_KEY): its APT moves to a new
 *                          account for the basket (APTOS_SEPET_PRIVATE_KEY,
 *                          created here), then the key is rotated to 32 zero
 *                          bytes — the scripts/aptos-anahtar-kapat.js pattern
 *     Sui  FTHM OFT        LayerZero delegate -> 0xdead; UpgradeCap -> package
 *                          made immutable; AdminCap and MigrationCap -> 0x0
 *     Solana FTHM OFT store admin + delegate (SOLANA_PRIVATE_KEY) -> a PDA of
 *                          the system program that nothing can sign for
 *
 * Peers needed today are all in place (read 17 Oct 2026): the Arc adapter
 * reaches the 8 EVM twins and Solana; Aptos and Sui reach FTHM through the
 * keyless Base gate. After this NO ONE, the deployer included, can add a
 * chain, change a DVN, pause, or upgrade FTHM anywhere. That is the point,
 * and it cannot be undone.
 * Every step is simulated first; without --uygula nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const ENV = path.join(KOK, ".env");
const DEAD = "0x000000000000000000000000000000000000dEaD";
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const ozel = (ad) => { const m = fs.readFileSync(ENV, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
const evmAnahtar = () => fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
const sonuc = [];
const not = (z, s) => { console.log("  " + z.padEnd(9) + s); sonuc.push(z + ": " + s); };

/* ---- EVM ------------------------------------------------------------------ */
async function evm() {
  const isler = [
    ["Arc", "https://arc-rpc.publicnode.com", 5042, "FTHMOFTAdapter", "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0"],
    ["Arc", "https://arc-rpc.publicnode.com", 5042, "FiyatElcisi", "0x971326596420b07bAC4E48D08fFa238bb6268465"],
    ["Robinhood", "https://rpc.mainnet.chain.robinhood.com", 4663, "FTHMOFT (nesil 1)", "0x19c9C61Dc70cd52Ab98A562e62DF369EC300855A"],
  ];
  for (const [z, rpc, id, ad, adr] of isler) {
    const w = new Wallet(evmAnahtar(), new JsonRpcProvider(rpc, id, { staticNetwork: true }));
    const c = new Contract(adr, ["function owner() view returns (address)", "function sahipligiYak()"], w);
    const sahip = await c.owner();
    if (sahip === "0x0000000000000000000000000000000000000000") { not(z, ad + ": zaten sahipsiz"); continue; }
    if (sahip.toLowerCase() !== w.address.toLowerCase()) { not(z, ad + ": sahibi baska (" + sahip + "), dokunulmadi"); continue; }
    await c.sahipligiYak.staticCall();
    if (!UYGULA) { not(z, ad + ": sahipligiYak simulasyonu tamam (delege 0xdead + sahiplik birakilir)"); continue; }
    const t = await c.sahipligiYak();
    const m = await t.wait();
    not(z, ad + ": sahipligiYak " + m.hash + " -> sahip " + (await c.owner()));
  }
}

/* ---- Aptos ---------------------------------------------------------------- */
async function aptos() {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const h = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_PRIVATE_KEY")) });
  const P = h.accountAddress.toString();
  const SIFIR = "0x" + "00".repeat(32);
  const hesap = await ag.getAccountResource({ accountAddress: P, resourceType: "0x1::account::Account" });
  if (hesap.authentication_key === SIFIR) { not("Aptos", P.slice(0, 10) + "… zaten kapali"); return; }
  const teklif = (o) => o && o.for && o.for.vec && o.for.vec.length;
  if (teklif(hesap.signer_capability_offer) || teklif(hesap.rotation_capability_offer)) throw new Error("Aptos: bekleyen yetki teklifi var");
  /* the basket's own Aptos account: created once, kept in .env */
  let yeniPk = ozel("APTOS_SEPET_PRIVATE_KEY");
  let yeni;
  if (yeniPk) yeni = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(yeniPk) });
  else {
    yeni = Account.generate();
    if (UYGULA) {
      fs.appendFileSync(ENV, "\n# Aptos account for the basket deployment (FTHM account's APT moved here before its key was closed), 17 Oct 2026\nAPTOS_SEPET_PRIVATE_KEY=" + Buffer.from(yeni.privateKey.toUint8Array()).toString("hex") + "\n");
      console.log("  Aptos    yeni sepet hesabi .env'e yazildi: " + yeni.accountAddress.toString());
    }
  }
  const gonder = async (etiket, data) => {
    const tx = await ag.transaction.build.simple({ sender: h.accountAddress, data, options: { maxGasAmount: 20000 } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: h.publicKey, transaction: tx });
    if (!sim.success) throw new Error("Aptos " + etiket + " simulasyon: " + sim.vm_status);
    if (!UYGULA) { not("Aptos", etiket + ": simulasyon tamam"); return; }
    const g = await ag.signAndSubmitTransaction({ signer: h, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    if (!r.success) throw new Error("Aptos " + etiket + ": " + r.vm_status);
    not("Aptos", etiket + " " + g.hash);
  };
  const bakiye = await ag.getAccountAPTAmount({ accountAddress: P });
  const gidecek = bakiye - 4_000_000;   // keeps 0.04 APT for this transfer and the rotation
  if (gidecek > 0) await gonder((gidecek / 1e8).toFixed(4) + " APT -> sepet hesabi " + yeni.accountAddress.toString().slice(0, 10) + "…",
    { function: "0x1::aptos_account::transfer", functionArguments: [yeni.accountAddress.toString(), gidecek] });
  await gonder("anahtar 32 sifir bayta (fthm_oft artik guncellenemez)",
    { function: "0x1::account::rotate_authentication_key_call", functionArguments: [Array.from(Buffer.alloc(32))] });
  if (UYGULA) {
    const son = await ag.getAccountResource({ accountAddress: P, resourceType: "0x1::account::Account" });
    not("Aptos", "dogrulama auth key " + (son.authentication_key === SIFIR ? "SIFIR — hesap bir daha imza atamaz" : "BEKLENMEDIK " + son.authentication_key));
  }
}

/* ---- Sui ------------------------------------------------------------------ */
async function sui() {
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const { SDK } = require("@layerzerolabs/lz-sui-sdk-v2");
  const k = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sui-fthm.json"), "utf8"));
  const client = new SuiJsonRpcClient({ url: process.env.SUI_RPC || "https://sui-rpc.publicnode.com", network: "mainnet" });
  const sdk = new SDK({ client });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  const sahibi = async (id) => { const o = await client.getObject({ id, options: { showOwner: true } }); return o.data ? (o.data.owner.AddressOwner || JSON.stringify(o.data.owner)) : "yok"; };
  const durum = { upgradeCap: await sahibi(k.upgradeCap), adminCap: await sahibi(k.adminCap), migrationCap: await sahibi(k.migrationCap) };
  const oapp = sdk.getOApp(k.oftCap);
  const tx = new Transaction();
  tx.setSender(ben);
  let is = 0;
  if (durum.adminCap === ben) { await oapp.setDelegateMoveCall(tx, "0x" + "0".repeat(60) + "dead"); is++; }
  if (durum.upgradeCap === ben) { tx.moveCall({ target: "0x2::package::make_immutable", arguments: [tx.object(k.upgradeCap)] }); is++; }
  const yak = [k.adminCap, k.migrationCap].filter((id, i) => [durum.adminCap, durum.migrationCap][i] === ben);
  if (yak.length) { tx.transferObjects(yak.map((id) => tx.object(id)), "0x0"); is++; }
  if (!is) { not("Sui", "yapilacak bir sey yok (UpgradeCap " + durum.upgradeCap + ", AdminCap " + durum.adminCap + ")"); return; }
  const bytes = await tx.build({ client });
  const sim = await client.dryRunTransactionBlock({ transactionBlock: bytes });
  if (sim.effects.status.status !== "success") throw new Error("Sui simulasyon: " + JSON.stringify(sim.effects.status));
  const ad = "delege 0xdead + paket degistirilemez + AdminCap/MigrationCap 0x0'a";
  if (!UYGULA) { not("Sui", ad + ": simulasyon tamam"); return; }
  const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true } });
  if (r.effects.status.status !== "success") throw new Error("Sui: " + JSON.stringify(r.effects.status));
  not("Sui", ad + " " + r.digest);
}

/* ---- Solana --------------------------------------------------------------- */
async function solana() {
  const { Connection, Keypair, PublicKey, SystemProgram } = require("@solana/web3.js");
  const { OFT } = require("@layerzerolabs/ua-devtools-solana");
  const { deserializeTransactionMessage } = require("@layerzerolabs/devtools-solana");
  const S = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sol-fthm.json"), "utf8"));
  const conn = new Connection(process.env.SOLANA_RPC || "https://api.mainnet-beta.solana.com", "confirmed");
  const odeyen = Keypair.fromSeed(Buffer.from(ozel("SOLANA_PRIVATE_KEY"), "hex"));
  /* a system-program PDA: off curve, no account, nothing can ever sign for it */
  const kimse = PublicKey.findProgramAddressSync([Buffer.from("fthm-sahipsiz")], SystemProgram.programId)[0];
  const sdk = new OFT(conn, { eid: 30168, address: S.oftStore }, odeyen.publicKey, S.program);
  const admin = (await sdk.getOwner()) || "";
  const delege = (await sdk.getDelegate()) || "";
  console.log("  Solana   simdiki admin " + admin + "  delege " + delege + "  hedef " + kimse.toBase58());
  const yap = async (etiket, omni) => {
    const tx = deserializeTransactionMessage(omni.data);
    tx.feePayer = odeyen.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(odeyen);
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) throw new Error("Solana " + etiket + " simulasyon: " + JSON.stringify(sim.value.err) + " " + (sim.value.logs || []).slice(-3).join(" | "));
    if (!UYGULA) { not("Solana", etiket + ": simulasyon tamam"); return; }
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    for (let i = 0; i < 60; i++) { const s = (await conn.getSignatureStatuses([sig])).value[0]; if (s && s.err) throw new Error(etiket); if (s && s.confirmationStatus) break; await bekle(1000); }
    not("Solana", etiket + " " + sig);
  };
  if (delege === odeyen.publicKey.toBase58()) await yap("delege -> kimse", await sdk.setDelegate(kimse.toBase58()));
  if (admin === odeyen.publicKey.toBase58()) await yap("admin -> kimse", await sdk.setOwner(kimse.toBase58()));
  if (admin !== odeyen.publicKey.toBase58() && delege !== odeyen.publicKey.toBase58()) not("Solana", "yapilacak bir sey yok");
}

(async () => {
  console.log("FTHM YETKI KAPAT  " + (UYGULA ? "UYGULA" : "KURU"));
  for (const [ad, f] of [["EVM", evm], ["Aptos", aptos], ["Sui", sui], ["Solana", solana]]) {
    try { await f(); } catch (e) { not(ad, "HATA " + (e.shortMessage || e.message).slice(0, 300)); }
  }
})();
