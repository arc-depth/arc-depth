"use strict";
/* ===========================================================================
 * lz-izle.js — find network messages that were verified but not executed,
 *              and execute them
 *
 *   node scripts/lz-izle.js            # report only
 *   node scripts/lz-izle.js --uygula   # also retry stuck EVM deliveries
 *
 * WHY
 *   14 Oct 2026: the first IkizYayici spread to Base was verified by both
 *   DVNs and then reverted in the executor — 4.375M gas given, the twin
 *   deployment needed ~4.58M. Verified messages wait in the destination
 *   endpoint, and `lzReceive` there is permissionless: anyone can execute
 *   them with enough gas. That was done by hand. This does it on a schedule.
 *
 * HOW
 *   LayerZero Scan lists every message per OApp. Watched: the network core
 *   (IkizYayici, FiyatAgi — one address on nine chains), the Arc DAO
 *   messenger, the FTHM bridge (Arc adapter + the twin on eight chains), and
 *   everything the deployer wallet sent. A message whose source is ours and
 *   whose destination is an EVM chain, verified but not delivered
 *   (SIMULATION_REVERTED / FAILED / PAYLOAD_STORED), is estimated against the
 *   destination endpoint and executed with 1.5x the measured gas.
 *   Messages to Solana are reported only.
 * Log: rapor/lz-izle.log (one JSON line per finding).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Interface, zeroPadValue } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const LOG = path.join(KOK, "rapor", "lz-izle.log");
const AG = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-ag.json"), "utf8"));
const SUI = fs.existsSync(path.join(KOK, "dagitim-sui-fthm.json")) ? JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sui-fthm.json"), "utf8")) : {};
const FAG = fs.existsSync(path.join(KOK, "dagitim-fthm-ag.json")) ? JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fthm-ag.json"), "utf8")) : {};
const UYGULA = process.argv.includes("--uygula");
const DAGITICI = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const SCAN = "https://scan.layerzero-api.com/v1/messages";
const EP = new Interface(["function lzReceive((uint32 srcEid,bytes32 sender,uint64 nonce) origin,address receiver,bytes32 guid,bytes message,bytes extraData) payable"]);
const eidZincir = Object.fromEntries(Object.values(EVM).map((z) => [z.eid, z]));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const yaz = (o) => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ zaman: new Date().toISOString(), ...o }) + "\n"); };

async function sorgu(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url).then((x) => x.json()).catch(() => null);
    if (r && Array.isArray(r.data)) return r.data;
    if (r && /not found/i.test(JSON.stringify(r))) return [];
    await bekle(2000 * (i + 1));
  }
  return [];
}

(async () => {
  const izlenen = [];
  for (const z of Object.values(EVM)) {
    izlenen.push([z.eid, AG.arc.IkizYayici], [z.eid, AG.arc.FiyatAgi]);
    if (FAG.fthmIkiz && z.eid !== 30417) izlenen.push([z.eid, FAG.fthmIkiz]);
  }
  izlenen.push([30417, "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0"], [30417, AG.arc.DaoElcisiAg]);
  if (SUI.baseGecit) izlenen.push([30184, SUI.baseGecit]);   // FTHM Base <-> Sui + Aptos gate

  const gorulen = new Map();
  for (const [eid, oapp] of izlenen) {
    for (const m of await sorgu(SCAN + "/oapp/" + eid + "/" + oapp + "?limit=100")) gorulen.set(m.guid, m);
    await bekle(300);
  }
  for (const m of await sorgu(SCAN + "/wallet/" + DAGITICI + "?limit=100")) gorulen.set(m.guid, m);

  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  let takili = 0, cozulen = 0;
  for (const m of gorulen.values()) {
    const durum = m.status && m.status.name;
    if (durum === "DELIVERED" || durum === "INFLIGHT" || durum === "CONFIRMING") continue;
    const hedef = m.destination && m.destination.status;
    const z = eidZincir[m.pathway.dstEid];
    const kayit = { guid: m.guid, yol: m.pathway.srcEid + "->" + m.pathway.dstEid, durum, hedef, kaynakTx: m.source && m.source.tx && m.source.tx.txHash };
    takili++;
    if (!z || !/SIMULATION_REVERTED|FAILED|PAYLOAD_STORED|WAITING/i.test(String(hedef) + String(durum))) {
      console.log("  ! " + kayit.yol + " " + durum + "/" + hedef + "  (otomatik yeniden deneme yok)  " + kayit.kaynakTx);
      yaz({ ...kayit, eylem: "rapor" });
      continue;
    }
    const p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    const veri = EP.encodeFunctionData("lzReceive", [[m.pathway.srcEid, zeroPadValue(m.pathway.sender.address, 32), m.pathway.nonce],
      m.pathway.receiver.address, m.guid, m.source.tx.payload, "0x"]);
    let gaz;
    try { gaz = await p.estimateGas({ from: DAGITICI, to: z.endpoint, data: veri }); }
    catch (e) {
      console.log("  ! " + kayit.yol + " tahmin edilemedi: " + (e.shortMessage || e.message).slice(0, 90));
      yaz({ ...kayit, eylem: "tahmin-yok", hata: (e.shortMessage || e.message).slice(0, 200) });
      continue;
    }
    console.log("  takili " + kayit.yol + " " + hedef + "  gaz " + gaz + "  " + kayit.kaynakTx);
    if (!UYGULA) { yaz({ ...kayit, eylem: "kuru", gaz: gaz.toString() }); continue; }
    const w = new Wallet(pk, p);
    const tx = { to: z.endpoint, data: veri, gasLimit: (gaz * 15n) / 10n };
    if (z.chainId === 999) { tx.gasPrice = BigInt(await p.send("eth_bigBlockGasPrice", [])) * 12n / 10n; tx.type = 0; }
    const t = await w.sendTransaction(tx);
    const r = await t.wait();
    console.log("  yurutuldu " + t.hash + " durum " + r.status);
    yaz({ ...kayit, eylem: "yurutuldu", tx: t.hash, durumTx: r.status });
    if (r.status === 1) cozulen++;
  }
  console.log("LZ IZLE  mesaj " + gorulen.size + ", takili " + takili + ", yurutulen " + cozulen + (UYGULA ? "" : " (kuru)"));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
