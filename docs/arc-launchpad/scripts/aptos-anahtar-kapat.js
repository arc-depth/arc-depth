"use strict";
/* ===========================================================================
 * aptos-anahtar-kapat.js — make the Aptos launchpad account unsignable
 *
 *   NODE_PATH=C:/Users/omen/araclar/aptossdk/node_modules node scripts/aptos-anahtar-kapat.js [--uygula]
 *
 * WHY (arastirma/7saat/guvenlik-move-solana.md, C-1): every vault, pool and
 * pasted-token store of the v2 launchpad and PulseSwap is an object created
 * under the publishing account 0xe1dd…, and Aptos lets an object's owner
 * (transitively) withdraw from its stores. So whoever holds that account's
 * key could empty every launch. The packages are immutable; the account
 * still has a key. This removes it: the authentication key becomes 32 zero
 * bytes, which no private key hashes to, so the account can never sign
 * again. The packages keep working: nothing in them needs the account to
 * sign after initialize.
 *
 * STEPS (simulated without --uygula)
 *   0 refuse if the account has an outstanding signer- or rotation-
 *     capability offer (someone could still act as it)
 *   1 send the account's APT, minus the fee for step 2, back to the deployer
 *   2 0x1::account::rotate_authentication_key_call(32 zero bytes)
 *   3 read the account back: auth key all zeros
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const anahtar = (ad) => fs.readFileSync(path.join(KOK, ".env"), "utf8").match(new RegExp("^" + ad + "\\s*=\\s*([0-9a-fA-F]{64})\\s*$", "m"))[1];
const SIFIR = "0x" + "00".repeat(32);

(async () => {
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const h = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(anahtar("APTOS_PULSE2_PRIVATE_KEY")) });
  const dagitici = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(anahtar("APTOS_PRIVATE_KEY")) }).accountAddress.toString();
  const P = h.accountAddress.toString();
  const hesap = await ag.getAccountResource({ accountAddress: P, resourceType: "0x1::account::Account" });
  console.log("APTOS ANAHTAR KAPAT  " + (UYGULA ? "UYGULA" : "KURU") + "   hesap " + P);
  console.log("  simdiki auth key " + hesap.authentication_key);
  if (hesap.authentication_key === SIFIR) { console.log("  zaten kapali, yapilacak bir sey yok"); return; }
  const teklif = (o) => o && o.for && o.for.vec && o.for.vec.length;
  if (teklif(hesap.signer_capability_offer) || teklif(hesap.rotation_capability_offer)) throw new Error("hesapta bekleyen yetki teklifi var: once onu iptal et");
  console.log("  bekleyen signer/rotation teklifi: yok");

  const gonder = async (etiket, data, gaz) => {
    const tx = await ag.transaction.build.simple({ sender: h.accountAddress, data, options: { maxGasAmount: gaz } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: h.publicKey, transaction: tx });
    if (!sim.success) throw new Error(etiket + " simulasyon: " + sim.vm_status);
    if (!UYGULA) { console.log("  (kuru) " + etiket.padEnd(38) + "simulasyon tamam, gaz " + sim.gas_used); return null; }
    const g = await ag.signAndSubmitTransaction({ signer: h, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    console.log("  " + etiket.padEnd(38) + g.hash + " " + r.vm_status);
    if (!r.success) throw new Error(etiket);
    return g.hash;
  };

  /* 1: what is left goes home; enough stays for step 2 (10,000 gas units at 100 octa, plus margin) */
  const bakiye = await ag.getAccountAPTAmount({ accountAddress: P });
  const kalsin = 2_000_000 + 2_000_000;   // 0.04 APT: this transfer's fee + the rotation's
  const gidecek = bakiye - kalsin;
  console.log("  APT bakiyesi " + bakiye / 1e8 + "  -> dagiticiya " + Math.max(0, gidecek) / 1e8);
  if (gidecek > 0) await gonder("APT dagiticiya", { function: "0x1::aptos_account::transfer", functionArguments: [dagitici, gidecek] }, 20000);

  /* 2: the key becomes nothing */
  await gonder("rotate_authentication_key_call(0x00…00)", { function: "0x1::account::rotate_authentication_key_call", functionArguments: [Array.from(Buffer.alloc(32))] }, 20000);

  /* 3: read back */
  if (UYGULA) {
    const son = await ag.getAccountResource({ accountAddress: P, resourceType: "0x1::account::Account" });
    console.log("  dogrulama: auth key " + son.authentication_key + (son.authentication_key === SIFIR ? "  KAPALI — bu hesap bir daha imza atamaz" : "  BEKLENMEDIK"));
    if (son.authentication_key !== SIFIR) process.exit(1);
  }
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
