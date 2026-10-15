"use strict";
/* ===========================================================================
 * fthm-tur-donus.js — the return legs of the FTHM round trip
 *
 *   NODE_PATH="C:/Users/omen/araclar/suisdk/node_modules;C:/Users/omen/araclar/aptossdk/node_modules;C:/Users/omen/araclar/sol/node_modules" \
 *     node scripts/fthm-tur-donus.js <sui|aptos|durum> [--uygula]
 *
 * Sends everything the deployer holds of FTHM on Sui / Aptos back to its
 * Base address, through the Base gate (dagitim-sui-fthm.json,
 * dagitim-aptos-fthm.json). Quote first; on Sui the transaction is
 * dry-run before it is signed, on Aptos simulated. Record: rapor/fthm-tur.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract } = require("ethers");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "rapor", "fthm-tur.json");
const UYGULA = process.argv.includes("--uygula");
const ADIM = process.argv[2];
const SUI = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sui-fthm.json"), "utf8"));
const APT = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-aptos-fthm.json"), "utf8"));
const BEN = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const BEN32 = Uint8Array.from(Buffer.from(BEN.slice(2).toLowerCase().padStart(64, "0"), "hex"));
const BASE_EID = 30184;
const IKIZ = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const anahtar = (ad) => fs.readFileSync(path.join(KOK, ".env"), "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m"))[1].trim();
const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
const yaz = () => fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1));

(async () => {
  if (ADIM === "sui") {
    const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
    const { Transaction } = require("@mysten/sui/transactions");
    const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
    const { SDK } = require("@layerzerolabs/lz-sui-sdk-v2");
    const { OFT } = require("@layerzerolabs/lz-sui-oft-sdk-v2");
    const client = new SuiJsonRpcClient({ url: "https://sui-rpc.publicnode.com", network: "mainnet" });
    const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(anahtar("SUI_PRIVATE_KEY"), "hex"));
    const ben = imzaci.toSuiAddress();
    const bakiye = BigInt((await client.getBalance({ owner: ben, coinType: SUI.coinTipi })).totalBalance);
    console.log("SUI -> BASE  FTHM bakiyesi " + Number(bakiye) / 1e9);
    if (bakiye === 0n) return;
    const oft = new OFT(new SDK({ client }), SUI.paket, SUI.oft, SUI.coinTipi, SUI.oapp, SUI.adminCap);
    const miktar = bakiye / 1000n * 1000n;   // 9 local decimals, 6 shared: drop dust
    const sp = { dstEid: BASE_EID, to: BEN32, amountLd: miktar, minAmountLd: miktar * 99n / 100n,
      extraOptions: new Uint8Array(), composeMsg: new Uint8Array(), oftCmd: new Uint8Array() };
    const ucret = await oft.quoteSend(ben, sp, false);
    console.log("  ucret " + Number(ucret.nativeFee) / 1e9 + " SUI");
    const tx = new Transaction();
    tx.setSender(ben);
    const coin = await oft.splitCoinMoveCall(tx, ben, miktar);
    await oft.sendMoveCall(tx, ben, sp, coin, ucret.nativeFee, 0n, ben);
    tx.transferObjects([coin], ben);
    const sim = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
    console.log("  simulasyon " + sim.effects.status.status + (sim.effects.status.error ? " " + sim.effects.status.error : ""));
    if (sim.effects.status.status !== "success" || !UYGULA) return;
    const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true } });
    console.log("  gonderildi " + r.digest + " " + r.effects.status.status);
    (k.tx = k.tx || {})["Sui->Base"] = r.digest; yaz();
  }

  if (ADIM === "aptos") {
    const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");
    const aptos = new Aptos(new AptosConfig({ network: Network.MAINNET }));
    const hesap = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(anahtar("APTOS_PRIVATE_KEY")) });
    const P = hesap.accountAddress.toString();
    const [b0] = await aptos.view({ payload: { function: P + "::oft::balance", functionArguments: [P] } });
    const bakiye = BigInt(b0);
    console.log("APTOS -> BASE  FTHM bakiyesi " + Number(bakiye) / 1e8);
    if (bakiye === 0n) return;
    const miktar = bakiye / 100n * 100n;   // 8 local decimals, 6 shared
    const to = Array.from(BEN32);
    const [nf, zf] = await aptos.view({ payload: { function: P + "::oft::quote_send",
      functionArguments: [P, BASE_EID, to, miktar.toString(), (miktar * 99n / 100n).toString(), [], [], [], false] } });
    console.log("  ucret " + Number(nf) / 1e8 + " APT");
    const tx = await aptos.transaction.build.simple({ sender: hesap.accountAddress, data: { function: P + "::oft::send_withdraw",
      functionArguments: [BASE_EID, to, miktar.toString(), (miktar * 99n / 100n).toString(), [], [], [], nf, zf] } });
    const [sim] = await aptos.transaction.simulate.simple({ signerPublicKey: hesap.publicKey, transaction: tx });
    console.log("  simulasyon " + sim.vm_status);
    if (!sim.success || !UYGULA) return;
    const g = await aptos.signAndSubmitTransaction({ signer: hesap, transaction: tx });
    const r = await aptos.waitForTransaction({ transactionHash: g.hash });
    console.log("  gonderildi " + g.hash + " " + r.vm_status);
    (k.tx = k.tx || {})["Aptos->Base"] = g.hash; yaz();
  }

  if (ADIM === "durum") {
    const p = new JsonRpcProvider("https://base-rpc.publicnode.com", 8453, { staticNetwork: true });
    const c = new Contract(IKIZ, ["function balanceOf(address) view returns (uint256)"], p);
    console.log("Base ikiz (ben) " + Number(await c.balanceOf(BEN)) / 1e18 + "   gecitte kilitli " + Number(await c.balanceOf(SUI.baseGecit)) / 1e18);
  }
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
