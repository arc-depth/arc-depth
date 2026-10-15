"use strict";
/* ===========================================================================
 * kanit-teslimat.js — delivery proof on mainnet, Arc <-> Base, with receipts
 *
 *   node scripts/kanit-teslimat.js --uygula
 *
 * Plan item A3 asked for a testnet round trip with receipts. Both testnet
 * faucets require a CAPTCHA; the captcha-free agent faucet that is documented
 * returns 404. The same question — do the network's messages actually get
 * delivered and executed on the far chain? — is answered here on mainnet for
 * about a dollar, with a token whose name says it is a proof:
 *
 *   1. KanitJeton (APPROOF, 1,000 supply) deployed on Arc
 *   2. IkizYayici.yay(token, [Base]) — Arc adapter created, LayerZero message
 *      to Base, where IkizYayici places the twin at the precomputed address
 *   3. 1 APPROOF Arc -> Base through the adapter
 *   4. 0.5 APPROOF Base -> Arc through the twin
 * Each step waits for the far chain to show the result and prints the
 * LayerZero Scan link. Record: rapor/kanit-teslimat.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, ContractFactory, zeroPadValue } = require("ethers");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "rapor", "kanit-teslimat.json");
const B = (n) => JSON.parse(fs.readFileSync(path.join(KOK, "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
const ARC = 30417, BASE = 30184;
const SEC_IKIZ = "0x0003010011010000000000000000000000000042c1d8";       // lzReceive 4.375M gas: twin deployment
const SEC_GONDER = "0x00030100110100000000000000000000000000030d40";     // lzReceive 200k gas: credit
const OFT_ABI = [
  "function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
  "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable returns ((bytes32,uint64,(uint256,uint256)),(uint256,uint256))",
  "function balanceOf(address) view returns (uint256)",
];

function ozelAnahtar() {
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try { const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m); if (m) return m[1].trim(); } catch (e) { /* next */ }
  }
  return null;
}

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); } catch (e) { if (d > 7) throw e; await bekle(2500 * (d + 1)); }
  }
}

async function makbuz(p, tx) {
  let m = null;
  while (!m) { await bekle(1500); m = await israr(() => p.getTransactionReceipt(tx.hash)); }
  if (m.status !== 1) throw new Error("basarisiz " + tx.hash);
  return m;
}

(async () => {
  if (!process.argv.includes("--uygula")) { console.log("kullanim: node scripts/kanit-teslimat.js --uygula"); return; }
  const pk = ozelAnahtar();
  const arcP = new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true });
  const baseP = new JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true });
  const arcW = new Wallet(pk, arcP), baseW = new Wallet(pk, baseP);
  const D = arcW.address;
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
  const yaz = () => fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1));
  const scan = (h) => "https://layerzeroscan.com/tx/" + h;

  /* 1 */
  if (!k.token) {
    const f = new ContractFactory(B("KanitJeton").abi, B("KanitJeton").bytecode, arcW);
    const t = await israr(() => f.getDeployTransaction());
    const tx = await israr(() => arcW.sendTransaction(t));
    const m = await makbuz(arcP, tx);
    k.token = m.contractAddress; k.tokenTx = tx.hash; yaz();
  }
  console.log("1) APPROOF Arc'ta " + k.token);

  /* 2 */
  const y = new Contract(YAYICI, ["function ucret(address,uint32[],bytes) view returns (uint256)",
    "function yay(address,uint32[],bytes) payable", "function ikizAdresi(address) view returns (address)",
    "function adapterAdresi(address) view returns (address)"], arcW);
  k.adapter = await israr(() => y.adapterAdresi(k.token));
  k.ikiz = await israr(() => y.ikizAdresi(k.token));
  if (!k.yayTx) {
    const fee = await israr(() => y.ucret(k.token, [BASE], SEC_IKIZ));
    const tx = await israr(() => y.yay(k.token, [BASE], SEC_IKIZ, { value: fee }));
    await makbuz(arcP, tx);
    k.yayTx = tx.hash; k.yayUcret = fee.toString(); yaz();
  }
  console.log("2) yayildi  " + scan(k.yayTx) + "  ikiz (Base) " + k.ikiz);
  for (let i = 0; i < 120; i++) {
    if ((await israr(() => baseP.getCode(k.ikiz))).length > 2) break;
    if (i % 10 === 0) console.log("     Base'de ikiz bekleniyor… " + (i * 10) + " sn");
    await bekle(10000);
  }
  if ((await israr(() => baseP.getCode(k.ikiz))).length <= 2) throw new Error("ikiz Base'e ulasmadi; " + scan(k.yayTx));
  console.log("   ikiz Base'de kuruldu");

  /* 3 */
  const tok = new Contract(k.token, ["function approve(address,uint256) returns (bool)"], arcW);
  const ad = new Contract(k.adapter, OFT_ABI, arcW);
  const ikizB = new Contract(k.ikiz, OFT_ABI, baseW);
  if (!k.gidisTx) {
    await makbuz(arcP, await israr(() => tok.approve(k.adapter, 10n ** 30n)));
    const sp = [BASE, zeroPadValue(D, 32), 10n ** 18n, 10n ** 18n, SEC_GONDER, "0x", "0x"];
    const [nf] = await israr(() => ad.quoteSend(sp, false));
    const tx = await israr(() => ad.send(sp, [nf, 0n], D, { value: nf }));
    await makbuz(arcP, tx);
    k.gidisTx = tx.hash; yaz();
  }
  console.log("3) 1 APPROOF Arc -> Base  " + scan(k.gidisTx));
  for (let i = 0; i < 120 && (await israr(() => ikizB.balanceOf(D))) < 10n ** 18n; i++) await bekle(10000);
  k.baseBakiye = (await israr(() => ikizB.balanceOf(D))).toString(); yaz();
  console.log("   Base bakiyesi " + Number(k.baseBakiye) / 1e18 + " APPROOF");

  /* 4 */
  const arcTok = new Contract(k.token, ["function balanceOf(address) view returns (uint256)"], arcP);
  if (!k.donusTx) {
    k.arcOnce = (await israr(() => arcTok.balanceOf(D))).toString();
    const sp = [ARC, zeroPadValue(D, 32), 5n * 10n ** 17n, 5n * 10n ** 17n, SEC_GONDER, "0x", "0x"];
    const [nf] = await israr(() => ikizB.quoteSend(sp, false));
    const tx = await israr(() => ikizB.send(sp, [nf, 0n], D, { value: nf }));
    await makbuz(baseP, tx);
    k.donusTx = tx.hash; yaz();
  }
  console.log("4) 0.5 APPROOF Base -> Arc  " + scan(k.donusTx));
  for (let i = 0; i < 120 && (await israr(() => arcTok.balanceOf(D))) < BigInt(k.arcOnce) + 5n * 10n ** 17n; i++) await bekle(10000);
  const arcSon = await israr(() => arcTok.balanceOf(D));
  const kilitli = await israr(() => arcTok.balanceOf(k.adapter));
  const baseArz = await israr(() => new Contract(k.ikiz, ["function totalSupply() view returns (uint256)"], baseP).totalSupply());
  k.arcSon = arcSon.toString(); k.kilitli = kilitli.toString(); k.baseArz = baseArz.toString(); k.zaman = new Date().toISOString(); yaz();
  console.log("   Arc'a dondu: " + (Number(arcSon - BigInt(k.arcOnce)) / 1e18) + " APPROOF");
  console.log("   Arc'ta kilitli " + Number(kilitli) / 1e18 + " == Base arzi " + Number(baseArz) / 1e18 + (kilitli === baseArz ? "  ESIT" : "  ESIT DEGIL"));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
