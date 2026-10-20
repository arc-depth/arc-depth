"use strict";
/* ===========================================================================
 * bekci-aptos.js — keeper task 2b: deliveries into the Aptos vault
 *
 *   node scripts/bekci-aptos.js --tx <arc|base|…> <hash>            dry
 *   node scripts/bekci-aptos.js --tx <arc|base|…> <hash> --uygula   send
 *   (NODE_PATH must reach @aptos-labs/ts-sdk, e.g. C:/Users/omen/araclar/aptossdk/node_modules)
 *
 * On Aptos one entry does it all (aptos/pulse-sepet haberci.move):
 * haberci::teslim(haberci, message, attestation) receives the CCTP message
 * with the Haberci's own signer, mints the dollars to it when there are
 * any, and carries out the Defter's order — a buy goes straight into an
 * auction (kasa::al_emri), a redemption into sell orders. The asset is
 * named by its metadata address, so nothing else has to be known.
 * Every transaction is simulated first. Signer: APTOS_SEPET_PRIVATE_KEY.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const TX = process.argv.includes("--tx") ? { zincir: process.argv[process.argv.indexOf("--tx") + 1], hash: process.argv[process.argv.indexOf("--tx") + 2] } : null;
const IRIS = "https://iris-api.circle.com/v2/messages/";
const DOMAIN = { arc: 26, base: 6, arbitrum: 3, avalanche: 1, monad: 15, hyperevm: 19, bsc: 17, ethereum: 0, robinhood: 35, sui: 8 };
const kayit = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet.json"), "utf8")).aptos;
const P = kayit.hesap, HABERCI = kayit.haberci;
const hex = (s) => Uint8Array.from(Buffer.from(s.replace(/^0x/, ""), "hex"));

(async () => {
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const pk = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^APTOS_SEPET_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const imzaci = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(pk) });
  console.log("BEKCI APTOS  " + (UYGULA ? "UYGULA" : "KURU") + "  haberci " + HABERCI.slice(0, 10) + "…  imzaci " + imzaci.accountAddress.toString().slice(0, 10) + "…");
  const KUYRUK = path.join(KOK, "rapor", "bekci-move-kuyruk.json");
  const kuyruk = fs.existsSync(KUYRUK) ? JSON.parse(fs.readFileSync(KUYRUK, "utf8")) : [];
  const isler = TX ? [{ kaynak: TX.zincir, hash: TX.hash }] : kuyruk.filter((x) => x.hedef === 9);
  if (!isler.length) console.log("  kuyrukta Aptos gonderimi yok");
  for (const is of isler) {
  let acik = 0;
  const r = await fetch(IRIS + DOMAIN[is.kaynak] + "?transactionHash=" + is.hash).then((x) => x.json());
  const mesajlar = (r.messages || []).filter((m) => Number(m.decodedMessage && m.decodedMessage.destinationDomain) === 9);
  console.log("  " + mesajlar.length + " Aptos mesaji, " + mesajlar.filter((m) => m.status === "complete").length + " onayli");
  for (const m of mesajlar) {
    if (m.status !== "complete") { acik++; console.log("  onay bekliyor"); continue; }
    const tx = await ag.transaction.build.simple({ sender: imzaci.accountAddress,
      data: { function: P + "::haberci::teslim", functionArguments: [HABERCI, hex(m.message), hex(m.attestation)] }, options: { maxGasAmount: 200000 } });   // receive + mint + an auction: measured over 20k
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: imzaci.publicKey, transaction: tx });
    if (!sim.success) {
      if (/ENONCE_ALREADY_USED/.test(sim.vm_status)) { console.log("  zaten teslim"); continue; }
      acik++; console.log("  teslim simulasyonu: " + sim.vm_status); continue;
    }
    if (!UYGULA) { console.log("  (kuru) teslim simulasyonu tamam, gaz " + sim.gas_used); continue; }
    const g = await ag.signAndSubmitTransaction({ signer: imzaci, transaction: tx });
    const s = await ag.waitForTransaction({ transactionHash: g.hash });
    console.log("  teslim " + g.hash + "  " + (s.success ? "basarili" : s.vm_status));
    if (!s.success) acik++;
  }
  if (!TX && UYGULA && acik === 0 && mesajlar.length) {
    fs.writeFileSync(KUYRUK, JSON.stringify(JSON.parse(fs.readFileSync(KUYRUK, "utf8")).filter((x) => !(x.hash === is.hash && x.hedef === 9)), null, 1));
    console.log("  " + is.hash.slice(0, 12) + "… tamam, kuyruktan cikti");
  }
  }
  const [n] = await ag.view({ payload: { function: P + "::kasa::ihale_sayisi", functionArguments: [kayit.kasa] } });
  console.log("  Aptos kasasinda ihale sayisi " + n);
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
