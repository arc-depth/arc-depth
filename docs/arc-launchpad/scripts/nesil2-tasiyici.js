"use strict";
/* ===========================================================================
 * nesil2-tasiyici.js — the keeper that moves second-generation collateral
 *
 *   node scripts/nesil2-tasiyici.js            # report what it would do
 *   node scripts/nesil2-tasiyici.js --uygula   # do it
 *
 * Every function it calls is permissionless; this script is one way to
 * call them, not an authority. Anyone can run it, or write another.
 *
 * ONE ROUND
 *   1 vaults     KasaFabrika2.kasaOf/yoneticiOf on every home chain
 *   2 convert    manager.transferEdilebilir() >= $100 -> transferBaslat
 *   3 relay      the vaults' CCTP messages: home vault Kopruye (burn),
 *                manager GeriCagrildi (recall), remote vault Raporlandi
 *                (report) and ArcaGonderildi (burn home). Each transaction
 *                is looked up in Circle's Iris API; every attested message
 *                whose destinationCaller is one of our vaults is delivered
 *                with teslimAl on its destination chain (the remote vault
 *                is deployed first if it does not exist yet). A message
 *                that is early (a report it depends on is not delivered)
 *                reverts in simulation and waits for the next round.
 *   4 swap       remote positions: quote -> takasEt through TakasYurutucu,
 *                recalled collateral -> geriTakasEt, set-aside dollars ->
 *                arcaGonder. The route is the first Uniswap v3 fee tier the
 *                router accepts in simulation; the vault's own floor decides.
 *   5 recall     transfers in ULASTI / TAKAS_EDILDI: geriCagir when the
 *                manager allows it (simulated first).
 * State: rapor/nesil2-tasiyici.json (scanned blocks, pending messages).
 * Log: rapor/nesil2-tasiyici.log.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, Interface, getAddress, solidityPacked, AbiCoder } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const N2 = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-nesil2.json"), "utf8"));
const DURUM = path.join(KOK, "rapor", "nesil2-tasiyici.json");
const LOG = path.join(KOK, "rapor", "nesil2-tasiyici.log");
const UYGULA = process.argv.includes("--uygula");
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const IRIS = "https://iris-api.circle.com/v2/messages/";
const DOMAIN = { arc: 26, robinhood: 35, base: 6, arbitrum: 3, avalanche: 1, monad: 15, hyperevm: 19 };
const ADI = Object.fromEntries(Object.entries(DOMAIN).map(([k, v]) => [v, k]));
const PENCERE = { arc: 5000, robinhood: 5000, base: 100, arbitrum: 5000, avalanche: 2000, monad: 100, hyperevm: 1000 };
const ASGARI = 100_000_000n;
const coder = AbiCoder.defaultAbiCoder();
const A = (x) => getAddress(String(x).toLowerCase());
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const yaz = (o) => { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ zaman: new Date().toISOString(), ...o }) + "\n"); };

const KASA = new Interface(["event Kopruye(uint32 indexed domain, uint256 miktar, bytes32 alici, uint256 azamiUcret, uint32 kesinlik)",
  "function teslimAl(bytes,bytes)"]);
const YON = new Interface(["event GeriCagrildi(bytes32 indexed id, address varlik, uint256 miktar)",
  "function transferEdilebilir() view returns (uint256)", "function transferBaslat(uint256) returns (bytes32)",
  "function transferSayisi() view returns (uint256)", "function transferIdler(uint256) view returns (bytes32)",
  "function durumu(bytes32) view returns (uint8)", "function geriCagir(bytes32)"]);
const UZAK = new Interface(["event Raporlandi(uint8 indexed tur, bytes32 indexed id, address varlik, uint256 a, uint256 b)",
  "event ArcaGonderildi(uint256 miktar, bytes32 alici, bytes hookVerisi)",
  "event Fonlandi(uint256 miktar, address hedefVarlik, bytes32 transferId)",
  "function pozisyon(bytes32) view returns (uint256 quote, uint256 varlik, uint256 donecek, bool satilabilir)",
  "function hedefVarlik() view returns (address)", "function usdc() view returns (address)",
  "function takasEt(bytes32,uint256,address,bytes)", "function geriTakasEt(bytes32,uint256,address,bytes)", "function arcaGonder(bytes32)",
  "function teslimAl(bytes,bytes)"]);

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) { const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {}); if (d > 6 || !/rate|limit|timeout|503|502|429|ECONNRESET|fetch failed|coalesce/i.test(m)) throw e; await bekle(2000 * (d + 1)); }
  }
}

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const st = fs.existsSync(DURUM) ? JSON.parse(fs.readFileSync(DURUM, "utf8")) : { blok: {}, txler: [], pozisyonlar: [] };
  const kaydet = () => fs.writeFileSync(DURUM, JSON.stringify(st, null, 1));
  const zincir = {};
  const z = (ad) => {
    if (!zincir[ad]) {
      const p = new JsonRpcProvider(EVM[ad].rpc, EVM[ad].chainId, { staticNetwork: true });
      zincir[ad] = { p, w: new Wallet(pk, p) };
    }
    return zincir[ad];
  };
  const gonder = async (ad, etiket, to, data) => {
    const { p, w } = z(ad);
    try { await israr(() => p.call({ from: w.address, to, data })); }
    catch (e) { return { atlandi: (e.shortMessage || e.message || "").slice(0, 90) }; }
    if (!UYGULA) { console.log("  (kuru) " + ad.padEnd(10) + etiket); return { kuru: true }; }
    const tx = { to, data };
    if (EVM[ad].chainId === 999) { tx.gasPrice = BigInt(await israr(() => p.send("eth_bigBlockGasPrice", []))) * 12n / 10n; tx.type = 0; tx.gasLimit = 3_000_000n; }
    const t = await israr(() => w.sendTransaction(tx));
    let m = null; while (!m) { await bekle(1500); m = await israr(() => p.getTransactionReceipt(t.hash)); }
    console.log("  " + ad.padEnd(10) + etiket.padEnd(34) + t.hash + " durum " + m.status);
    yaz({ ad, etiket, tx: t.hash, durum: m.status });
    return { m };
  };

  /* 1 — vaults */
  const kasalar = [];   // { ev, id, kasa, yonetici }
  for (const [ev, r] of Object.entries(N2.ev)) {
    const kf = new Contract(r.KasaFabrika2, ["function sayi() view returns (uint256)", "function kasaOf(uint256) view returns (address)", "function yoneticiOf(uint256) view returns (address)"], z(ev).p);
    const n = Number(await israr(() => kf.sayi()));
    for (let i = 1; i <= n; i++) kasalar.push({ ev, id: i, kasa: A(await israr(() => kf.kasaOf(i))), yonetici: A(await israr(() => kf.yoneticiOf(i))) });
  }
  console.log("NESIL 2 TASIYICI  " + (UYGULA ? "UYGULA" : "KURU") + "   kasa " + kasalar.length);
  const uzakKasa = (ev, uzakAd, tokenId) => new Contract(N2.uzak[uzakAd].fabrikalar[ev],
    ["function kasaAdresi(uint256) view returns (address)", "function kasaKur(uint256) returns (address)", "function kasalar(uint256) view returns (address)"], z(uzakAd).p);

  /* 2 — convert where the limits allow */
  for (const k of kasalar) {
    const y = new Contract(k.yonetici, YON, z(k.ev).p);
    const e = await israr(() => y.transferEdilebilir()).catch(() => 0n);
    if (e >= ASGARI) {
      const sonuc = await gonder(k.ev, "transferBaslat(" + Number(e) / 1e6 + ") #" + k.id, k.yonetici, YON.encodeFunctionData("transferBaslat", [e]));
      if (sonuc.m) st.txler.push({ ad: k.ev, hash: sonuc.m.hash });
    }
  }

  /* 3a — collect our CCTP transactions from logs */
  const izlenen = {};   // chain -> addresses
  for (const k of kasalar) (izlenen[k.ev] = izlenen[k.ev] || new Set()).add(k.kasa).add(k.yonetici);
  for (const [u, r] of Object.entries(N2.uzak)) {
    for (const k of kasalar) {
      if (!r.fabrikalar[k.ev]) continue;
      const a = await israr(() => uzakKasa(k.ev, u, k.id).kasaAdresi(k.id));
      (izlenen[u] = izlenen[u] || new Set()).add(A(a));
    }
  }
  const konular = [KASA.getEvent("Kopruye").topicHash, YON.getEvent("GeriCagrildi").topicHash, UZAK.getEvent("Raporlandi").topicHash,
    UZAK.getEvent("ArcaGonderildi").topicHash, UZAK.getEvent("Fonlandi").topicHash];
  for (const [ad, set] of Object.entries(izlenen)) {
    if (!set.size) continue;
    const { p } = z(ad);
    const son = await israr(() => p.getBlockNumber());
    let bas = st.blok[ad] != null ? st.blok[ad] + 1 : son - PENCERE[ad] * 3;
    for (let b = bas; b <= son; b += PENCERE[ad]) {
      const e = Math.min(son, b + PENCERE[ad] - 1);
      const loglar = await israr(() => p.getLogs({ address: [...set], fromBlock: b, toBlock: e, topics: [konular] })).catch(() => []);
      for (const l of loglar) {
        if (l.topics[0] === UZAK.getEvent("Fonlandi").topicHash) {
          const d = UZAK.parseLog(l);
          st.pozisyonlar.push({ ad, kasa: A(l.address), id: d.args.transferId });
        }
        if (!st.txler.some((t) => t.hash === l.transactionHash)) st.txler.push({ ad, hash: l.transactionHash });
      }
    }
    st.blok[ad] = son;
  }
  kaydet();

  /* 3b — relay through Iris */
  const kalan = [];
  for (const t of st.txler) {
    const r = await fetch(IRIS + DOMAIN[t.ad] + "?transactionHash=" + t.hash).then((x) => x.json()).catch(() => null);
    const mesajlar = (r && r.messages) || [];
    let bitmedi = mesajlar.length === 0;
    for (const m of mesajlar) {
      if (m.status !== "complete" || !m.attestation || m.attestation === "PENDING") { bitmedi = true; continue; }
      /* Only CCTP V2 messages are ours; V1 has a different header. The
         fields are read at the V2 offsets (CctpMesaj.sol): destination
         domain at byte 8, nonce 12..44, destinationCaller 108..140. */
      if (String(m.cctpVersion) !== "2") continue;
      const msg = m.message;
      const hedefDomain = parseInt(msg.slice(2 + 16, 2 + 24), 16);
      const nonce = "0x" + msg.slice(2 + 24, 2 + 88);
      const hedefCagiran = A("0x" + msg.slice(2 + 216 + 24, 2 + 280));
      if (m.decodedMessage && Number(m.decodedMessage.destinationDomain) !== hedefDomain) continue;
      const hedefAd = ADI[hedefDomain];
      if (!hedefAd) continue;
      const kullanildi = await israr(() => new Contract(MT, ["function usedNonces(bytes32) view returns (uint256)"], z(hedefAd).p).usedNonces(nonce));
      if (kullanildi !== 0n) continue;
      /* the remote vault must exist before its message can be delivered */
      if ((await israr(() => z(hedefAd).p.getCode(hedefCagiran))).length <= 2) {
        const k = kasalar.find((x) => N2.uzak[hedefAd] && N2.uzak[hedefAd].fabrikalar[x.ev]);
        for (const x of kasalar) {
          if (!N2.uzak[hedefAd] || !N2.uzak[hedefAd].fabrikalar[x.ev]) continue;
          const f = uzakKasa(x.ev, hedefAd, x.id);
          if (A(await israr(() => f.kasaAdresi(x.id))) === hedefCagiran) {
            await gonder(hedefAd, "kasaKur(" + x.id + ") <- " + x.ev, await f.getAddress(), f.interface.encodeFunctionData("kasaKur", [x.id]));
          }
        }
        if (!k) continue;
      }
      const s = await gonder(hedefAd, "teslimAl " + t.ad + "->" + hedefAd, hedefCagiran, KASA.encodeFunctionData("teslimAl", [msg, m.attestation]));
      if (s.atlandi) { bitmedi = true; console.log("  bekliyor  " + t.ad + "->" + hedefAd + "  " + s.atlandi); }
      else if (s.m) st.txler.push({ ad: hedefAd, hash: s.m.hash });   // a delivery may emit the next message
    }
    if (bitmedi) kalan.push(t);
  }
  st.txler = kalan;
  kaydet();

  /* 4 — remote positions */
  const gorulen = new Set();
  for (const pz of st.pozisyonlar) {
    const anahtar = pz.ad + pz.kasa + pz.id;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    const v = new Contract(pz.kasa, UZAK, z(pz.ad).p);
    const [q, varlik, donecek, satilabilir] = await israr(() => v.pozisyon(pz.id));
    const hedef = await israr(() => v.hedefVarlik()), usdc = await israr(() => v.usdc());
    const yurutucu = N2.uzak[pz.ad].yurutucu;
    const yol = (a, fee, b) => coder.encode(["bytes"], [solidityPacked(["address", "uint24", "address"], [a, fee, b])]);
    if (q > 0n) {
      for (const fee of [500, 3000, 10000, 100]) {
        const s = await gonder(pz.ad, "takasEt " + pz.id.slice(0, 10) + " fee " + fee, pz.kasa, UZAK.encodeFunctionData("takasEt", [pz.id, 0, yurutucu, yol(usdc, fee, hedef)]));
        if (!s.atlandi) { if (s.m) st.txler.push({ ad: pz.ad, hash: s.m.hash }); break; }
      }
    }
    if (varlik > 0n && satilabilir) {
      for (const fee of [500, 3000, 10000, 100]) {
        const s = await gonder(pz.ad, "geriTakasEt " + pz.id.slice(0, 10) + " fee " + fee, pz.kasa, UZAK.encodeFunctionData("geriTakasEt", [pz.id, 0, yurutucu, yol(hedef, fee, usdc)]));
        if (!s.atlandi) { if (s.m) st.txler.push({ ad: pz.ad, hash: s.m.hash }); break; }
      }
    }
    const [, , donecek2] = await israr(() => v.pozisyon(pz.id));
    if (donecek2 > 0n) {
      const s = await gonder(pz.ad, "arcaGonder " + pz.id.slice(0, 10), pz.kasa, UZAK.encodeFunctionData("arcaGonder", [pz.id]));
      if (s.m) st.txler.push({ ad: pz.ad, hash: s.m.hash });
    }
  }

  /* 5 — recall where the manager allows it */
  for (const k of kasalar) {
    const y = new Contract(k.yonetici, YON, z(k.ev).p);
    const n = Number(await israr(() => y.transferSayisi()));
    for (let i = 0; i < n; i++) {
      const id = await israr(() => y.transferIdler(i));
      const d = Number(await israr(() => y.durumu(id)));
      if (d !== 3 && d !== 4) continue;   // ULASTI, TAKAS_EDILDI
      const s = await gonder(k.ev, "geriCagir " + id.slice(0, 10), k.yonetici, YON.encodeFunctionData("geriCagir", [id]));
      if (s.m) st.txler.push({ ad: k.ev, hash: s.m.hash });
    }
  }
  kaydet();
  console.log("  bekleyen islem " + st.txler.length + ", izlenen pozisyon " + gorulen.size);
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
