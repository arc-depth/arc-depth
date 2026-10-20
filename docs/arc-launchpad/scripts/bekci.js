"use strict";
/* ===========================================================================
 * bekci.js — the basket's keeper: carries what the contracts cannot carry
 *
 *   node scripts/bekci.js                 one pass, dry: what it would do
 *   node scripts/bekci.js --uygula        one pass, sends
 *   node scripts/bekci.js --prova         the mainnet rehearsal set instead
 *                                         (dagitim-sepet-prova.json)
 *
 * TASK 1 — CCTP delivery (this file). Every dollar a Haberci sends to another
 * chain leaves as a CCTP burn whose destination caller is the twin Haberci,
 * so only that Haberci can deliver it, and anyone may ask it to. Per chain:
 * read the Haberci's `Gonderildi` events since the last pass, ask Circle's
 * Iris for the attested message of that transaction, and if the
 * destination's MessageTransmitter has not used its nonce, call
 * `teslim(message, attestation)` on the destination Haberci (simulated
 * first). The keeper decides nothing: a wrong or stale message reverts in
 * the contract and costs only the simulation.
 *
 * Later tasks (separate passes, same state file): filling auctions,
 * Sui/Aptos orders, the BNB island relayer (sepet-ada-tasiyici.js).
 *
 * Wallet: BEKCI_PRIVATE_KEY in .env (its own key, a little gas on each
 * chain); a dry pass needs no key. State: rapor/bekci-durum.json (last
 * block read per chain). Nothing about any other wallet is read.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, Interface, NonceManager } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const PROVA = process.argv.includes("--prova");
/* --tx <chain> <hash>: deliver what one transaction sent, whatever the log scan can reach */
const TX = process.argv.includes("--tx") ? { zincir: process.argv[process.argv.indexOf("--tx") + 1], hash: process.argv[process.argv.indexOf("--tx") + 2] } : null;
const IRIS = "https://iris-api.circle.com/v2/messages/";
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const DURUM = path.join(KOK, "rapor", PROVA ? "bekci-prova-durum.json" : "bekci-durum.json");

const AG = {
  arc: { ad: "Arc", domain: 26, id: 5042, rpc: "https://arc-rpc.publicnode.com", parca: 10_000 },
  base: { ad: "Base", domain: 6, id: 8453, rpc: "https://base-rpc.publicnode.com", parca: 5_000 },
  arbitrum: { ad: "Arbitrum", domain: 3, id: 42161, rpc: "https://arb1.arbitrum.io/rpc", parca: 5_000 },
  avalanche: { ad: "Avalanche", domain: 1, id: 43114, rpc: "https://avalanche-c-chain-rpc.publicnode.com", parca: 2_000 },
  monad: { ad: "Monad", domain: 15, id: 143, rpc: "https://rpc.monad.xyz", parca: 1_000 },
  hyperevm: { ad: "HyperEVM", domain: 19, id: 999, rpc: "https://rpc.hyperliquid.xyz/evm", parca: 50, ilkGeri: 300 },   // small ranges, rate limited
  bsc: { ad: "BNB", domain: 17, id: 56, rpc: "https://bsc-rpc.publicnode.com", parca: 5_000 },
  ethereum: { ad: "Ethereum", domain: 0, id: 1, rpc: "https://ethereum-rpc.publicnode.com", parca: 5_000 },
  robinhood: { ad: "Robinhood", domain: 35, id: 4663, rpc: "https://rpc.mainnet.chain.robinhood.com", parca: 10_000 },
};
const HAB = new Interface([
  "event Gonderildi(uint32 indexed hedefZincir, address indexed kaynak, bytes32 indexed hedef, uint256 usdc)",
  "function teslim(bytes mesaj, bytes imza)",
]);
const MT_ABI = ["function usedNonces(bytes32) view returns (uint256)"];
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

function adresler() {
  if (PROVA) {
    const a = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet-prova.json"), "utf8")).adres;
    return { arc: a["Arc HaberciCctp"], base: a["Base HaberciCctp"] };
  }
  const d = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet.json"), "utf8")).zincir;
  return Object.fromEntries(Object.entries(d).filter(([k]) => AG[k]).map(([k, v]) => [k, v.HaberciCctp]));
}

/* Where the first pass starts reading. Public RPCs serve logs only for
   recent blocks (older ones need a paid archive token), and nothing has
   been sent through the live set yet: the first pass starts a little
   before now and every pass after continues from the last. A pass every
   few minutes stays well inside what the RPCs keep. */
const ILK_GERI = 5_000;   // blocks before "now" on the very first pass
const BASLANGIC = Date.parse("2026-10-16T00:00:00Z") / 1000;
async function zamandakiBlok(p, ts) {
  const son = await p.getBlock("latest");
  const once = await p.getBlock(Math.max(1, son.number - 10_000));
  const sure = (son.timestamp - once.timestamp) / (son.number - once.number);
  let b = Math.max(0, Math.round(son.number - (son.timestamp - ts) / sure));
  for (let i = 0; i < 5; i++) {
    const x = await p.getBlock(b);
    if (!x) break;
    const fark = Math.round((x.timestamp - ts) / sure);
    if (Math.abs(fark) < 50) break;
    b = Math.max(0, b - fark);
  }
  return Math.max(0, b - 1000);   // a margin before, never after
}

async function loglar(p, filtre, bas, son, parca) {
  const out = [];
  for (let b = bas; b <= son; b += parca) {
    let s = Math.min(son, b + parca - 1);
    for (;;) {
      try { out.push(...(await p.getLogs({ ...filtre, fromBlock: b, toBlock: s }))); break; }
      catch (e) { if (s - b < 10) throw e; s = b + Math.floor((s - b) / 2); }   // the RPC refused the range: halve it
    }
  }
  return out;
}

async function provaLoglari(p, haberci) {
  const adim = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet-prova.json"), "utf8")).adim;
  const out = [];
  for (const h of Object.values(adim)) {
    const m = await p.getTransactionReceipt(h).catch(() => null);
    if (m) out.push(...m.logs.filter((l) => l.address.toLowerCase() === haberci.toLowerCase() && l.topics[0] === HAB.getEvent("Gonderildi").topicHash));
  }
  return out;
}

/* sends to Sui and Aptos wait here for bekci-sui.js / bekci-aptos.js */
const KUYRUK = path.join(KOK, "rapor", "bekci-move-kuyruk.json");
function kuyrugaEkle(g) {
  const k = fs.existsSync(KUYRUK) ? JSON.parse(fs.readFileSync(KUYRUK, "utf8")) : [];
  if (k.some((x) => x.hash === g.hash && x.hedef === g.hedef)) return;
  k.push(g); fs.mkdirSync(path.dirname(KUYRUK), { recursive: true }); fs.writeFileSync(KUYRUK, JSON.stringify(k, null, 1));
}

async function iris(domain, tx) {
  const r = await fetch(IRIS + domain + "?transactionHash=" + tx).then((x) => x.json()).catch(() => ({}));
  return r.messages || [];
}

(async () => {
  const HB = adresler();
  const durum = fs.existsSync(DURUM) ? JSON.parse(fs.readFileSync(DURUM, "utf8")) : {};
  const anahtar = (fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^BEKCI_PRIVATE_KEY\s*=\s*(0x[0-9a-fA-F]{64})\s*$/m) || [])[1];
  if (UYGULA && !anahtar) { console.error("BEKCI_PRIVATE_KEY .env'de yok"); process.exit(1); }
  const zincirler = Object.keys(HB);
  const p = {}, w = {};
  for (const z of zincirler) {
    p[z] = new JsonRpcProvider(AG[z].rpc, AG[z].id, { staticNetwork: true });
    if (anahtar) w[z] = new NonceManager(new Wallet(anahtar, p[z]));
  }
  const domainden = Object.fromEntries(zincirler.map((z) => [AG[z].domain, z]));
  console.log("BEKCI  " + (PROVA ? "PROVA SETI  " : "") + (UYGULA ? "UYGULA" : "KURU") + "  zincirler " + zincirler.map((z) => AG[z].ad).join(", "));

  let bulunan = 0, teslim = 0, zaten = 0, bekleyen = 0, yabanci = 0;
  for (const z of zincirler) try {
    const son = await p[z].getBlockNumber();
    const bas = durum[z] != null ? durum[z] + 1 : Math.max(0, son - (AG[z].ilkGeri || ILK_GERI));
    /* the rehearsal's sends are older than any public RPC keeps logs for: read them from its recorded transactions */
    if (TX && TX.zincir !== z) continue;
    const kayitlar = TX ? (await p[z].getTransactionReceipt(TX.hash)).logs.filter((l) => l.address.toLowerCase() === HB[z].toLowerCase() && l.topics[0] === HAB.getEvent("Gonderildi").topicHash)
      : PROVA ? await provaLoglari(p[z], HB[z]) : await loglar(p[z], { address: HB[z], topics: [HAB.getEvent("Gonderildi").topicHash] }, bas, son, AG[z].parca);
    let tamam = true;
    for (const l of kayitlar) {
      const hedefDomain = Number(HAB.parseLog(l).args.hedefZincir);
      /* a send to its own chain is delivered inside the same transaction, no CCTP */
      if (hedefDomain === AG[z].domain) continue;
      bulunan++;
      const hedef = domainden[hedefDomain];
      if (!hedef && (hedefDomain === 8 || hedefDomain === 9) && UYGULA) kuyrugaEkle({ kaynak: z, hash: l.transactionHash, hedef: hedefDomain });
      if (!hedef) { yabanci++; console.log("  " + AG[z].ad + " -> domain " + hedefDomain + "  (bu bekcinin teslim etmedigi zincir; Sui/Aptos/Solana sonraki gorev)  " + l.transactionHash); continue; }
      const mesajlar = (await iris(AG[z].domain, l.transactionHash)).filter((m) => Number(m.decodedMessage && m.decodedMessage.destinationDomain) === hedefDomain);
      const hazir = mesajlar.filter((m) => m.status === "complete" && m.attestation && m.attestation !== "PENDING");
      if (!hazir.length) { bekleyen++; tamam = false; console.log("  " + AG[z].ad + " -> " + AG[hedef].ad + "  Iris onayi bekleniyor  " + l.transactionHash); continue; }
      for (const m of hazir) {
        const kullanildi = await new Contract(MT, MT_ABI, p[hedef]).usedNonces(m.eventNonce);
        if (kullanildi !== 0n) { zaten++; console.log("  " + AG[z].ad + " -> " + AG[hedef].ad + "  zaten teslim  " + l.transactionHash); continue; }
        const h = new Contract(HB[hedef], HAB, w[hedef] || p[hedef]);
        try { await h.teslim.staticCall(m.message, m.attestation); }
        catch (e) { tamam = false; console.log("  HATA " + AG[z].ad + " -> " + AG[hedef].ad + "  simulasyon: " + (e.shortMessage || e.message).slice(0, 120)); continue; }
        if (!UYGULA) { console.log("  (kuru) " + AG[z].ad + " -> " + AG[hedef].ad + "  teslim simulasyonu tamam  " + l.transactionHash); continue; }
        const t = await (await h.teslim(m.message, m.attestation)).wait();
        teslim++;
        console.log("  " + AG[z].ad + " -> " + AG[hedef].ad + "  teslim " + t.hash);
      }
    }
    /* move the cursor only past what is finished, so a pending message is read again next pass */
    if (tamam && UYGULA && !TX) durum[z] = son;
    else if (tamam && !UYGULA) { /* a dry pass never moves the cursor */ }
  } catch (e) { console.log("  HATA " + AG[z].ad + ": " + (e.shortMessage || e.message).slice(0, 160) + "  (bu zincir sonraki turda yeniden okunur)"); }
  if (UYGULA) { fs.mkdirSync(path.dirname(DURUM), { recursive: true }); fs.writeFileSync(DURUM, JSON.stringify(durum, null, 1)); }
  console.log("\n" + bulunan + " gonderim; " + teslim + " teslim edildi, " + zaten + " zaten teslimdi, " + bekleyen + " onay bekliyor, " + yabanci + " baska gorevin");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
