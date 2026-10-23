"use strict";
/* ===========================================================================
 * kilitle-v2.js — close every key the second generation still has
 *
 *   set NODE_PATH=C:/Users/omen/araclar/sol/node_modules;C:/Users/omen/araclar/suisdk/node_modules;C:/Users/omen/araclar/aptossdk/node_modules
 *   node scripts/kilitle-v2.js [evm|solana|sui|aptos ...]            dry: reads, simulates, prints
 *   node scripts/kilitle-v2.js [evm|solana|sui|aptos ...] --uygula   locks (user command only, after
 *                                                                    the joint test launch)
 *
 * Reads the record (dagitim-v2.json, or V2_KAYIT) and, for each authority,
 * first what the chain says now; a step already done is skipped. Nothing
 * here can be undone.
 *
 *   EVM      HaberciLZ on every chain, SepetDefteri, IkizHub (Arc), AktarmaLZ
 *            (Base): kilitle() — kurucu = 0 and, for the LayerZero OApps, the
 *            endpoint delegate = 0xdead (no more peer, library or DVN change).
 *            The rest of the set has no owner (immutable constructors).
 *   Solana   pulse-kapi Kilitle (store admin cleared, delegate = incinerator; v4: HubDegistir with it);
 *            v4 pulse-sepet Muhurle (its pool list and Defter fixed);
 *            both programs' upgrade authority set to none (final).
 *            The ALT is already frozen; pulse-sepet has no admin after Initialize.
 *   Sui      basket haberci::kilitle (v2's and v4's: the list goes with it); the twin OApp's delegate = 0xdead and its
 *            AdminCap sent to 0x0; both packages' UpgradeCaps made immutable.
 *   Aptos    basket haberci::kilitle; the twin OApp's delegate = 0xdead and
 *            renounce_admin; both accounts' keys closed (their packages cannot
 *            be made "immutable": they depend on upgradeable Circle / LayerZero
 *            packages, EDEP_WEAKER_POLICY; an upgrade needs the account signer).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const SECILEN = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const KAYIT = process.env.V2_KAYIT || path.join(KOK, "dagitim-v2.json");
const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
const ENV = path.join(KOK, ".env");
const ozel = (ad) => { const m = fs.readFileSync(ENV, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim() : null; };
const OLU = "0x000000000000000000000000000000000000dEaD";
const OLU32 = "0x" + "0".repeat(60) + "dead";
const ozet = [];   // what each authority is now: [chain, what, state]
const not = (z, ne, d) => { ozet.push([z, ne, d]); console.log("  " + z.padEnd(10) + ne.padEnd(40) + d); };

/* ---- EVM ------------------------------------------------------------------ */
const RPC = { arc: [5042, "https://arc-rpc.publicnode.com"], base: [8453, "https://mainnet.base.org"], arbitrum: [42161, "https://arb1.arbitrum.io/rpc"],
  ethereum: [1, "https://ethereum-rpc.publicnode.com"], avalanche: [43114, "https://api.avax.network/ext/bc/C/rpc"], monad: [143, "https://rpc.monad.xyz"],
  hyperevm: [999, "https://rpc.hyperliquid.xyz/evm"], bsc: [56, "https://bsc-dataseed.bnbchain.org"], robinhood: [4663, "https://rpc.mainnet.chain.robinhood.com"] };
const EP = (() => {
  const s = fs.readFileSync(path.join(KOK, "contracts", "lz", "ZincirTablosu.sol"), "utf8");
  const r = {};
  for (const m of s.matchAll(/Zincir\((\d+), (\d+), (0x[0-9a-fA-F]{40})/g)) r[Number(m[1])] = m[3];
  return r;
})();

async function evm() {
  const { JsonRpcProvider, FeeData, Wallet, Contract } = require("ethers");
  const anahtar = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const ABI = ["function kurucu() view returns (address)", "function kilitle()"];
  for (const [ad, z] of Object.entries(kayit.zincir)) {
    if (!RPC[ad]) continue;
    const [id, url] = RPC[ad];
    const p = new JsonRpcProvider(url, id, { staticNetwork: true });
    if (id === 999) p.getFeeData = async () => new FeeData(BigInt(await p.send("eth_bigBlockGasPrice", [])) * 12n / 10n, null, null);
    const w = new Wallet(anahtar, p);
    const ep = new Contract(EP[id], ["function delegates(address) view returns (address)"], p);
    for (const ne of ["HaberciLZ", "SepetDefteri", "IkizHub", "AktarmaLZ"]) {
      if (!z[ne]) continue;
      const c = new Contract(z[ne], ABI, w);
      const k = await c.kurucu();
      const lzMi = ne !== "SepetDefteri";
      const del = lzMi ? await ep.delegates(z[ne]) : null;
      const durum = "kurucu " + (k === "0x0000000000000000000000000000000000000000" ? "yok" : k.slice(0, 10)) + (lzMi ? "  LZ delegesi " + del.slice(0, 10) : "");
      if (k === "0x0000000000000000000000000000000000000000") { not(ad, ne, "KILITLI  " + durum); continue; }
      if (k.toLowerCase() !== w.address.toLowerCase()) { not(ad, ne, "HATA kurucu dagitici degil: " + durum); process.exitCode = 1; continue; }
      await c.kilitle.staticCall();
      if (!UYGULA) { not(ad, ne, "acik -> kilitle() simulasyon tamam  (" + durum + ")"); continue; }
      const tx = await c.kilitle(id === 999 ? { type: 0 } : {});
      const r = await tx.wait();
      if (r.status !== 1) throw new Error(ad + " " + ne + " kilitle geri dondu " + tx.hash);
      const del2 = lzMi ? await ep.delegates(z[ne]) : null;
      not(ad, ne, "KILITLENDI " + tx.hash + (lzMi ? "  delege " + del2 : ""));
    }
  }
}

/* ---- Solana --------------------------------------------------------------- */
async function solana() {
  const { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, ComputeBudgetProgram } = require("@solana/web3.js");
  const S = (kayit.uzak || {}).solana;
  if (!S) return not("solana", "-", "kayitta yok");
  const conn = new Connection("https://api.mainnet-beta.solana.com", "confirmed");
  const d = Keypair.fromSeed(Buffer.from(ozel("SOLANA_PRIVATE_KEY").match(/[0-9a-fA-F]{64}/)[0], "hex"));
  const YUKLEYICI = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
  const ENDPOINT = new PublicKey("76y77prsiCMvXMjuoZ5VRrhG5qYBrUMYTE5WgHqgjEn6");
  const INCINERATOR = "1nc1nerator11111111111111111111111111111111";
  const pda = (s, p) => PublicKey.findProgramAddressSync(s, p)[0];
  const gonder = async (etiket, ix) => {
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }), ix);
    tx.feePayer = d.publicKey;
    tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
    tx.sign(d);
    const sim = await conn.simulateTransaction(tx);
    if (sim.value.err) throw new Error(etiket + " simulasyon: " + JSON.stringify(sim.value.err) + "\n" + (sim.value.logs || []).slice(-5).join("\n"));
    if (!UYGULA) return "simulasyon tamam";
    const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 5 });
    const s = await conn.confirmTransaction(sig, "confirmed");
    if (s.value.err) throw new Error(etiket + " basarisiz " + sig);
    return "KILITLENDI " + sig;
  };
  /* the gate: Kilitle (instruction 1) — store byte 232 is `kilitli` */
  const KAPI = new PublicKey(S.kapiProgram);
  const store = pda([Buffer.from("Store")], KAPI);
  const st = await conn.getAccountInfo(store);
  if (st.data[232] === 1) not("solana", "pulse-kapi Kilitle", "KILITLI");
  else {
    const ix = new TransactionInstruction({ programId: KAPI, data: Buffer.from([1]), keys: [
      { pubkey: d.publicKey, isSigner: true, isWritable: true }, { pubkey: store, isSigner: false, isWritable: true },
      { pubkey: ENDPOINT, isSigner: false, isWritable: false }, { pubkey: pda([Buffer.from("OApp"), store.toBuffer()], ENDPOINT), isSigner: false, isWritable: true },
      { pubkey: pda([Buffer.from("__event_authority")], ENDPOINT), isSigner: false, isWritable: false }] });
    not("solana", "pulse-kapi Kilitle (delege " + INCINERATOR.slice(0, 8) + ")", await gonder("Kilitle", ix));
  }
  /* v4 vault: the seal (Muhurle, 14) fixes its pool list and its Defter; on the v2 code the instruction is unknown (E_BAD_DATA 4) */
  {
    const SEPET = new PublicKey(S.sepetProgram);
    const muhur = pda([Buffer.from("muhur")], SEPET);
    if (await conn.getAccountInfo(muhur)) not("solana", "pulse-sepet Muhurle (liste + Defter)", "KILITLI");
    else {
      const ix = new TransactionInstruction({ programId: SEPET, data: Buffer.from([14]), keys: [
        { pubkey: d.publicKey, isSigner: true, isWritable: true }, { pubkey: muhur, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }] });
      try { not("solana", "pulse-sepet Muhurle (liste + Defter)", await gonder("Muhurle", ix)); }
      catch (e) { if (/"Custom":4/.test(e.message)) not("solana", "pulse-sepet Muhurle", "KILITLI (v2 kodu: liste ve Defter degistirme yok)"); else throw e; }
    }
  }
  /* upgrade authorities: ProgramData byte 12 = Some?, 13..45 the authority; SetAuthority (4) without a new one = final */
  for (const [ad, id] of [["pulse-sepet", S.sepetProgram], ["pulse-kapi", S.kapiProgram]]) {
    const prog = new PublicKey(id);
    const pd = pda([prog.toBuffer()], YUKLEYICI);
    const veri = (await conn.getAccountInfo(pd)).data;
    if (veri[12] === 0) { not("solana", ad + " yukseltme yetkisi", "KILITLI (yok)"); continue; }
    const yetki = new PublicKey(veri.subarray(13, 45)).toBase58();
    if (yetki !== d.publicKey.toBase58()) { not("solana", ad + " yukseltme yetkisi", "HATA yetki dagitici degil: " + yetki); process.exitCode = 1; continue; }
    const data = Buffer.alloc(4); data.writeUInt32LE(4);
    const ix = new TransactionInstruction({ programId: YUKLEYICI, data, keys: [
      { pubkey: pd, isSigner: false, isWritable: true }, { pubkey: d.publicKey, isSigner: true, isWritable: false }] });
    not("solana", ad + " yukseltme yetkisi -> yok", await gonder(ad + " final", ix));
  }
}

/* ---- Sui ------------------------------------------------------------------ */
async function sui() {
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const { SDK } = require("@layerzerolabs/lz-sui-sdk-v2");
  const k = (kayit.uzak || {}).sui;
  if (!k) return not("sui", "-", "kayitta yok");
  const client = new SuiJsonRpcClient({ url: "https://sui-rpc.publicnode.com", network: "mainnet" });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  const calistir = async (etiket, tx) => {
    tx.setSender(ben);
    const sim = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
    if (sim.effects.status.status !== "success") throw new Error("Sui " + etiket + " simulasyon: " + JSON.stringify(sim.effects.status));
    if (!UYGULA) return "simulasyon tamam";
    const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true } });
    await client.waitForTransaction({ digest: r.digest });
    if (r.effects.status.status !== "success") throw new Error("Sui " + etiket + " " + r.digest);
    return "KILITLENDI " + r.digest;
  };
  const nesne = (id) => client.getObject({ id, options: { showContent: true, showOwner: true } });
  /* the basket's haberci */
  const h = await nesne(k.haberci);
  const kurucu = h.data.content.fields.kurucu;
  if (kurucu == null || (kurucu.fields && kurucu.fields.vec && kurucu.fields.vec.length === 0)) not("sui", "haberci kurucu", "KILITLI");
  else { const tx = new Transaction(); tx.moveCall({ target: k.paket + "::haberci::kilitle", arguments: [tx.object(k.haberci)] }); not("sui", "haberci::kilitle", await calistir("haberci::kilitle", tx)); }
  /* v4: the receiver made for the v4 Defter (dagit-v4-uzak.js), its pool list written by the same founder */
  const v4yol = process.env.V4_KAYIT || path.join(KOK, "dagitim-v4.json");
  const v4 = fs.existsSync(v4yol) ? ((JSON.parse(fs.readFileSync(v4yol, "utf8")).uzak || {}).sui || {}) : {};
  if (v4.v4Haberci) {
    const h4 = await nesne(v4.v4Haberci);
    const k4 = h4.data.content.fields.kurucu;
    if (k4 == null || (k4.fields && k4.fields.vec && k4.fields.vec.length === 0)) not("sui", "v4 haberci kurucu (liste)", "KILITLI");
    else { const tx = new Transaction(); tx.moveCall({ target: v4.v4Paket + "::haberci::kilitle", arguments: [tx.object(v4.v4Haberci)] }); not("sui", "v4 haberci::kilitle (liste)", await calistir("v4 haberci::kilitle", tx)); }
  }
  /* the twin OApp: delegate, then the AdminCap away */
  const cap = await nesne(k.adminCap);
  if (!cap.data || (cap.data.owner && cap.data.owner.AddressOwner !== ben)) not("sui", "ikiz OApp AdminCap", "KILITLI (dagiticide degil: " + JSON.stringify(cap.data ? cap.data.owner : "yok") + ")");
  else {
    const sdk = new SDK({ client });
    const tx = new Transaction();
    await sdk.getOApp(k.ikizPaket).setDelegateMoveCall(tx, OLU32);
    tx.transferObjects([tx.object(k.adminCap)], "0x0");
    not("sui", "ikiz OApp delege 0xdead + AdminCap -> 0x0", await calistir("delege + AdminCap", tx));
  }
  /* the packages */
  for (const [ad, id] of [["sepet paketi", k.upgradeCap], ["ikiz paketi", k.ikizUpgradeCap]]) {
    const c = await nesne(id);
    if (!c.data) { not("sui", ad + " UpgradeCap", "KILITLI (yok edilmis)"); continue; }
    const tx = new Transaction();
    tx.moveCall({ target: "0x2::package::make_immutable", arguments: [tx.object(id)] });
    not("sui", ad + " -> degismez", await calistir(ad, tx));
  }
}

/* ---- Aptos ---------------------------------------------------------------- */
async function aptos() {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey, MoveVector } = require("@aptos-labs/ts-sdk");
  const k = (kayit.uzak || {}).aptos;
  if (!k) return not("aptos", "-", "kayitta yok");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const sepet = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_SEPET2_PRIVATE_KEY")) });
  const ikiz = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_IKIZ_PRIVATE_KEY")) });
  if (sepet.accountAddress.toString() !== k.hesap || ikiz.accountAddress.toString() !== k.ikizHesap) throw new Error("Aptos anahtarlari kayittaki hesaplar degil");
  const gonder = async (imzaci, etiket, data, buyuk) => {
    const tx = await ag.transaction.build.simple({ sender: imzaci.accountAddress, data, options: { maxGasAmount: buyuk ? 400000 : 20000 } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: imzaci.publicKey, transaction: tx });
    if (!sim.success) throw new Error("Aptos " + etiket + " simulasyon: " + sim.vm_status);
    if (!UYGULA) return "simulasyon tamam";
    const g = await ag.signAndSubmitTransaction({ signer: imzaci, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    if (!r.success) throw new Error("Aptos " + etiket + ": " + r.vm_status);
    return "KILITLENDI " + g.hash;
  };
  const view = (f, a) => ag.view({ payload: { function: f, functionArguments: a } }).catch(() => null);
  /* the basket's haberci (its resource: kurucu Option) */
  const hr = await ag.getAccountResource({ accountAddress: k.haberci, resourceType: k.hesap + "::haberci::Haberci" }).catch(() => null);
  if (hr && hr.kurucu && hr.kurucu.vec && hr.kurucu.vec.length === 0) not("aptos", "haberci kurucu", "KILITLI");
  else not("aptos", "haberci::kilitle", await gonder(sepet, "haberci::kilitle", { function: k.hesap + "::haberci::kilitle", functionArguments: [k.haberci] }));
  /* the twin OApp */
  const I = k.ikizHesap;
  const admin = await view(I + "::oapp_core::get_admin", []);
  if (admin && /^0x0+$/.test(admin[0])) not("aptos", "ikiz OApp admin", "KILITLI");
  else {
    not("aptos", "ikiz OApp delege -> 0xdead", await gonder(ikiz, "set_delegate", { function: I + "::oapp_core::set_delegate", functionArguments: [OLU32] }));
    not("aptos", "ikiz OApp renounce_admin", await gonder(ikiz, "renounce_admin", { function: I + "::oapp_core::renounce_admin", functionArguments: [] }));
  }
  /* the packages: Aptos refuses "immutable" for a package whose dependencies are upgradeable
     (EDEP_WEAKER_POLICY: Circle's CCTP and LayerZero's packages are "compatible"), measured in the
     dry run. So the account's key is closed instead: an upgrade needs the account's signer, and the
     authentication key becomes 32 bytes nobody holds the key to (0x1::account::rotate_authentication_key_call).
     Its APT goes to the deployer first, less what the two transactions cost. */
  const dagitici = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_PRIVATE_KEY")) }).accountAddress.toString();
  const KIMSE = "0x" + "00".repeat(30) + "dead";
  for (const [hesap, ad] of [[sepet, "sepet"], [ikiz, "ikiz"]]) {
    const a = hesap.accountAddress.toString();
    const auth = (await ag.getAccountInfo({ accountAddress: a })).authentication_key;
    if (auth.toLowerCase() === KIMSE) { not("aptos", ad + " hesabi anahtari", "KILITLI (kimsenin olmayan anahtar)"); continue; }
    const bak = await ag.getAccountAPTAmount({ accountAddress: a });
    const tut = bak - 2_000_000;   // 0.02 APT left for the two transactions
    if (tut > 0) not("aptos", ad + " APT -> dagitici (" + (tut / 1e8).toFixed(4) + ")", await gonder(hesap, ad + " APT", { function: "0x1::aptos_account::transfer", functionArguments: [dagitici, tut] }));
    not("aptos", ad + " hesabi anahtari -> kimse", await gonder(hesap, ad + " anahtar", { function: "0x1::account::rotate_authentication_key_call",
      functionArguments: [MoveVector.U8(Buffer.from(KIMSE.slice(2), "hex"))] }));
  }
}

(async () => {
  console.log("KILIT v2  " + (UYGULA ? "UYGULA — GERI ALINAMAZ" : "KURU (hicbir sey gonderilmez)") + "   kayit " + KAYIT);
  for (const [ad, f] of [["evm", evm], ["solana", solana], ["sui", sui], ["aptos", aptos]]) {
    if (SECILEN.length && !SECILEN.includes(ad)) continue;
    console.log("\n" + ad.toUpperCase());
    try { await f(); } catch (e) { console.log("  " + ad + " HATA " + (e.shortMessage || e.message).slice(0, 500)); process.exitCode = 1; }
  }
  const acik = ozet.filter((x) => !/^KILITLI/.test(x[2]));
  console.log("\n" + (acik.length ? acik.length + " yetki " + (UYGULA ? "islendi/hatali" : "hala acik") : "HEPSI KILITLI") + " / " + ozet.length);
})();
