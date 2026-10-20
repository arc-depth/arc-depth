"use strict";
/* ===========================================================================
 * bekci-move-doldur.js — keeper task 3b: fill the Sui and Aptos vaults' buy auctions
 *
 *   node scripts/bekci-move-doldur.js            dry: each open buy auction, its ask, the market
 *   node scripts/bekci-move-doldur.js --uygula   fill the ones that pay
 *   (NODE_PATH must reach @mysten/sui and @aptos-labs/ts-sdk)
 *
 * The vault offers dollars for at least `istenen` units of a coin; the ask
 * only falls with time, so giving what it asks now is enough when the
 * transaction lands. The keeper fills from coins it already holds (SUI on
 * the Sui deployer, APT on the Aptos deployer) when the dollars it gets are
 * worth more than the coins it gives by KAR, priced by CoinGecko. The vault
 * checks the coin and the amount; the keeper only chooses when.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const KAR = 0.01;
const d = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet.json"), "utf8"));
const ozel = (ad) => (fs.readFileSync(path.join(KOK, ".env"), "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")) || [])[1].trim();
const USDC_SUI = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const CLOCK = "0x6";
/* CoinGecko ids for coins the keeper may hold; anything else is skipped */
const CG = { "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI": "sui", "0xa": "aptos",
  "0x000000000000000000000000000000000000000000000000000000000000000a": "aptos" };

async function fiyatlar() {
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=sui,aptos&vs_currencies=usd").then((x) => x.json());
  return { sui: r.sui.usd, aptos: r.aptos.usd };
}

async function sui(f) {
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const ist = new SuiJsonRpcClient({ url: "https://sui-rpc.publicnode.com", network: "mainnet" });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  const PKG = d.sui.paket, KASA = d.sui.kasa;
  const k = await ist.getObject({ id: KASA, options: { showContent: true } });
  const alanlar = await ist.getDynamicFields({ parentId: k.data.content.fields.ihaleler.fields.id.id });
  for (const a of alanlar.data) {
    const o = await ist.getObject({ id: a.objectId, options: { showContent: true } });
    const h = o.data.content.fields.value.fields;
    if (h.bitti || Number(h.tur) !== 1) continue;
    const tip = "0x" + String(h.varlik.fields ? h.varlik.fields.name : h.varlik).replace(/^0x/, "");
    const id = a.name.value;
    /* what it asks now: kasa::istenen through devInspect */
    const q = new Transaction();
    q.moveCall({ target: PKG + "::kasa::istenen", typeArguments: [USDC_SUI], arguments: [q.object(KASA), q.pure.u64(id), q.object(CLOCK)] });
    const di = await ist.devInspectTransactionBlock({ sender: ben, transactionBlock: q });
    const istenen = BigInt(Buffer.from(di.results[0].returnValues[0][0]).readBigUInt64LE());
    const cg = CG[tip];
    const dolar = Number(h.verilen) / 1e6;
    if (!cg) { console.log("  Sui #" + id + " " + tip.split("::").slice(1).join("::") + ": bekcide bu coin yok, atlandi"); continue; }
    const dec = (await ist.getCoinMetadata({ coinType: tip })).decimals;
    const deger = (Number(istenen) / 10 ** dec) * f[cg];
    const pay = (dolar - deger) / dolar;
    console.log("  Sui   #" + id + " " + tip.split("::").slice(1).join("::") + "  kasa $" + dolar.toFixed(4) + " verir, " + (Number(istenen) / 10 ** dec).toPrecision(5) + " ister (piyasa $" + deger.toFixed(4) + ")  pay %" + (pay * 100).toFixed(1));
    if (pay < KAR) continue;
    if (!UYGULA) { console.log("    (kuru) doldurulurdu"); continue; }
    const tx = new Transaction();
    tx.setSender(ben);
    const [coin] = tip.endsWith("::sui::SUI") ? tx.splitCoins(tx.gas, [tx.pure.u64(istenen)]) : (() => { throw new Error("yalniz SUI destekli"); })();
    const [usdc] = tx.moveCall({ target: PKG + "::kasa::doldur_alim", typeArguments: [USDC_SUI, tip], arguments: [tx.object(KASA), tx.pure.u64(id), coin, tx.object(CLOCK)] });
    tx.transferObjects([usdc], ben);
    const r = await ist.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true } });
    await ist.waitForTransaction({ digest: r.digest });
    console.log("    DOLDU " + r.digest + "  " + r.effects.status.status);
  }
}

async function aptos(f) {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const imzaci = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_PRIVATE_KEY")) });
  const P = d.aptos.hesap, KASA = d.aptos.kasa;
  const [n] = await ag.view({ payload: { function: P + "::kasa::ihale_sayisi", functionArguments: [KASA] } });
  const kaynak = await ag.getAccountResource({ accountAddress: KASA, resourceType: P + "::kasa::Kasa" });
  for (let id = 0; id < Number(n); id++) {
    const h = await ag.getTableItem({ handle: kaynak.ihaleler.handle, data: { key_type: "u64", value_type: P + "::kasa::Ihale", key: String(id) } });
    if (h.bitti || Number(h.tur) !== 1) continue;
    const [istenen] = await ag.view({ payload: { function: P + "::kasa::istenen", functionArguments: [KASA, id] } });
    const cg = CG[h.varlik] || CG[h.varlik.replace(/^0x0*/, "0x")];
    const dolar = Number(h.verilen) / 1e6;
    if (!cg) { console.log("  Aptos #" + id + " " + h.varlik.slice(0, 12) + "…: bekcide bu varlik yok, atlandi"); continue; }
    const deger = (Number(istenen) / 1e8) * f[cg];
    const pay = (dolar - deger) / dolar;
    console.log("  Aptos #" + id + " APT  kasa $" + dolar.toFixed(4) + " verir, " + (Number(istenen) / 1e8).toPrecision(5) + " APT ister (piyasa $" + deger.toFixed(4) + ")  pay %" + (pay * 100).toFixed(1));
    if (pay < KAR) continue;
    const tx = await ag.transaction.build.simple({ sender: imzaci.accountAddress, data: { function: P + "::kasa::doldur_alim", functionArguments: [KASA, id, String(istenen)] }, options: { maxGasAmount: 50000 } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: imzaci.publicKey, transaction: tx });
    if (!sim.success) { console.log("    simulasyon: " + sim.vm_status); continue; }
    if (!UYGULA) { console.log("    (kuru) doldurulurdu, simulasyon tamam"); continue; }
    const g = await ag.signAndSubmitTransaction({ signer: imzaci, transaction: tx });
    const s = await ag.waitForTransaction({ transactionHash: g.hash });
    console.log("    DOLDU " + g.hash + "  " + (s.success ? "basarili" : s.vm_status));
  }
}

(async () => {
  const f = await fiyatlar();
  console.log("BEKCI MOVE DOLDUR  " + (UYGULA ? "UYGULA" : "KURU") + "  SUI $" + f.sui + "  APT $" + f.aptos + "  en az %" + KAR * 100 + " pay");
  for (const [ad, fn] of [["Sui", sui], ["Aptos", aptos]]) {
    try { await fn(f); } catch (e) { console.log("  HATA " + ad + ": " + (e.shortMessage || e.message).slice(0, 200)); }
  }
})();
