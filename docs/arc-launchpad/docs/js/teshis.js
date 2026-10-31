/* ===========================================================================
 * teshis.js — GENESIS's diagnosis of an ARC PULSE launch, from the chain alone
 *
 * Arc: one call to LaunchpadTeshis (rapor + kuyruk) gives the Defter lines,
 * the queued redemption orders, the tax bucket, the founder's income and the
 * pool price. Every other chain is read directly from its own RPC: for the
 * token's twins, the LayerZero endpoint on each side says how many messages
 * were sent and how many arrived (outboundNonce on the sender's chain,
 * inboundNonce / lazyInboundNonce on the receiver's): a gap is a message
 * verified but not delivered, which anyone can deliver with more gas.
 * A gap gets a fix: the message bytes are found in the sender chain's
 * PacketSent event, checked against the receiver endpoint's
 * inboundPayloadHash, and delivered with EndpointV2.lzReceive from the
 * visitor's wallet on that chain. The basket vault on every EVM chain is read
 * too (dollars waiting for a pool buy, units held, whether the pool buys now),
 * with its public retry (dene) where dollars wait.
 * No server, nothing stored; the user's wallet is used only for a fix the
 * user chooses, and its tip (if any) goes to that wallet.
 * =========================================================================== */
import { JsonRpcProvider, Contract, Interface, zeroPadValue, getAddress, keccak256, concat, dataSlice, getBytes, hexlify } from "../vendor/ethers.min.js";
import { AGLAR } from "./aglar.js";

const USDC = "0x3600000000000000000000000000000000000000";
const YAYICI = "0x24C644e7C29F6582B892cb5D89d7b23Bc34d1bD9";
/* LayerZero EndpointV2 per chain (contracts/lz/ZincirTablosu.sol) */
const UC_NOKTA = { 5042: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B", 4663: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B", 143: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B",
  999: "0x3A73033C0b1407574C76BdBAc67f126f6b4a9AA9", 8453: "0x1a44076050125825900e736c501f859c50fE728c", 42161: "0x1a44076050125825900e736c501f859c50fE728c",
  1: "0x1a44076050125825900e736c501f859c50fE728c", 56: "0x1a44076050125825900e736c501f859c50fE728c", 43114: "0x1a44076050125825900e736c501f859c50fE728c" };
const TESHIS = ["function rapor(address) view returns ((bool var_,uint64 id,uint256 launchNo,address kova,uint256 kovaDolar,bool kovaGonderir,address vekil,uint256 vekilDolar,uint256 arz,uint256 vergi,uint256 toplamBiriken,uint256 lotHazirSayisi,(uint32 zincir,bytes32 varlik,uint256 agirlik,uint256 biriken,bool lotHazir,bool bekliyor,uint256 sonHata,bool kasaDolu)[] satirlar,uint160 sqrtPriceX96,int24 tick))",
  "function kuyruk(uint64,uint256,uint256) view returns ((uint256 sira,uint32 zincir,uint256 ucret,uint256 bahsis)[],uint256)"];
const UC = ["function outboundNonce(address,uint32,bytes32) view returns (uint64)", "function inboundNonce(address,uint32,bytes32) view returns (uint64)",
  "function lazyInboundNonce(address,uint32,bytes32) view returns (uint64)"];
const ALAN = { 26: "Arc", 6: "Base", 3: "Arbitrum", 0: "Ethereum", 1: "Avalanche", 15: "Monad", 19: "HyperEVM", 17: "BNB", 35: "Robinhood", 5: "Solana", 8: "Sui", 9: "Aptos" };
export const zincirAdi = (d) => ALAN[d] || "chain " + d;
const d6 = (x) => "$" + (Number(x) / 1e6).toFixed(2);

const saglayicilar = new Map();
const saglayici = (ag) => {
  if (!saglayicilar.has(ag.id)) saglayicilar.set(ag.id, new JsonRpcProvider(ag.rpc, ag.id, { staticNetwork: true, batchMaxCount: 1 }));
  return saglayicilar.get(ag.id);
};
const arcAg = () => AGLAR.find((a) => a.anahtar === "arc");

const UC_TAM = [...UC, "function inboundPayloadHash(address,uint32,bytes32,uint64) view returns (bytes32)",
  "function lzReceive((uint32,bytes32,uint64),address,bytes32,bytes,bytes) payable"];
const PAKET = new Interface(["event PacketSent(bytes encodedPayload, bytes options, address sendLibrary)"]);
const agEid = (eid) => AGLAR.find((a) => a.eid === Number(eid)) || null;
const SIFIR32 = "0x" + "0".repeat(64);

/// A LayerZero v2 packet: header (version 1, nonce 8, srcEid 4, sender 32, dstEid 4, receiver 32), guid 32, message.
export function paketCoz(encoded) {
  const b = getBytes(encoded);
  const oku = (a, n) => hexlify(b.slice(a, a + n));
  return { nonce: BigInt(oku(1, 8)), srcEid: Number(BigInt(oku(9, 4))), sender: oku(13, 32), dstEid: Number(BigInt(oku(45, 4))),
    receiver: getAddress("0x" + oku(49, 32).slice(26)), guid: oku(81, 32), message: hexlify(b.slice(113)) };
}

/// State of one packet at its destination: "teslim" (delivered), "bekliyor" (verified, not delivered: anyone
/// can deliver it), "dogrulanmadi" (the DVNs have not verified it yet: nobody can deliver it yet).
export async function paketDurumu(m) {
  const ag = agEid(m.dstEid);
  if (!ag || !UC_NOKTA[ag.id]) return { ...m, durum: "bilinmiyor" };
  const uc = new Contract(UC_NOKTA[ag.id], UC_TAM, saglayici(ag));
  const [h, lazy] = await Promise.all([uc.inboundPayloadHash(m.receiver, m.srcEid, m.sender, m.nonce), uc.lazyInboundNonce(m.receiver, m.srcEid, m.sender)]);
  const beklenen = keccak256(concat([m.guid, m.message]));
  const durum = h === beklenen ? "bekliyor" : (h === SIFIR32 && m.nonce <= lazy ? "teslim" : "dogrulanmadi");
  return { ...m, ag, durum, uc: UC_NOKTA[ag.id] };
}

/// The fix for a waiting packet: EndpointV2.lzReceive on its destination, gas estimated for `kimden` (+25%).
export async function teslimIslemi(m, kimden) {
  const veri = new Interface(UC_TAM).encodeFunctionData("lzReceive", [[m.srcEid, m.sender, m.nonce], m.receiver, m.guid, m.message, "0x"]);
  const gaz = await saglayici(m.ag).estimateGas({ from: kimden, to: m.uc, data: veri });
  return { ag: m.ag, hedef: m.uc, veri, gaz: "0x" + ((gaz * 125n) / 100n).toString(16) };
}

/// Every LayerZero packet a transaction sent, with its state at the destination. `ag`: the sending chain.
export async function islemPaketleri(ag, txHash) {
  const r = await saglayici(ag).getTransactionReceipt(txHash.trim());
  if (!r) throw new Error("Transaction not found on " + ag.ad + ".");
  const uc = (UC_NOKTA[ag.id] || "").toLowerCase();
  const konu = PAKET.getEvent("PacketSent").topicHash;
  const out = [];
  for (const l of r.logs) {
    if (l.address.toLowerCase() !== uc || l.topics[0] !== konu) continue;
    out.push(await paketDurumu(paketCoz(PAKET.parseLog(l).args.encodedPayload)));
  }
  return out;
}

/// Find packet `nonce` from `sender` (on `ag`) to `receiver` on `dstEid` among recent PacketSent events:
/// windows of 5,000 blocks back from now (Arc's RPC refuses wider), `pencere` windows at most.
export async function paketBul(ag, sender, dstEid, receiver, nonce, pencere = 60) {
  const p = saglayici(ag);
  const son = await p.getBlockNumber();
  const s32 = zeroPadValue(sender, 32).toLowerCase(), r = getAddress(receiver);
  const konu = PAKET.getEvent("PacketSent").topicHash;
  for (let i = 0; i < pencere; i++) {
    const b = son - i * 5000;
    if (b < 0) break;
    const loglar = await p.getLogs({ address: UC_NOKTA[ag.id], topics: [konu], fromBlock: Math.max(0, b - 4999), toBlock: b }).catch(() => []);
    for (const l of loglar) {
      const m = paketCoz(PAKET.parseLog(l).args.encodedPayload);
      if (m.nonce === BigInt(nonce) && m.dstEid === Number(dstEid) && m.sender.toLowerCase() === s32 && m.receiver === r) return paketDurumu(m);
    }
  }
  return null;
}

const KASA = ["function alimBekleyen(uint64,address) view returns (uint256)", "function bakiye(uint64,address) view returns (uint256)",
  "function havuzVar(address) view returns (bool,bool,bool)", "function dene(uint64,address)"];

/// The basket vault of each EVM line, read on its own chain.
async function kasaDurumlari(V, r, sorunlar) {
  const out = [];
  for (const s of r.satirlar) {
    const z = Object.entries(V.zincir || {}).find(([, v]) => Number(v.domain) === Number(s.zincir));
    if (!z || !z[1].kasa) continue;
    const ag = AGLAR.find((a) => a.anahtar === z[0]);
    if (!ag) continue;
    const varlik = getAddress(dataSlice(s.varlik, 12));
    try {
      const k = new Contract(z[1].kasa, KASA, saglayici(ag));
      const [bekleyen, birim, yol] = await Promise.all([k.alimBekleyen(r.id, varlik), k.bakiye(r.id, varlik), k.havuzVar(varlik).catch(() => [false, false, false])]);
      out.push({ ag: ag.ad, varlik, bekleyen, birim, yolVar: yol[0], simdiAlinir: yol[2] });
      if (bekleyen > 0n) sorunlar.push(yol[2]
        ? { tur: "kasa", metin: d6(bekleyen) + " wait in the " + ag.ad + " vault to buy " + varlik.slice(0, 10) + "…; its pool is inside the price bound now.",
            duzelt: { ad: "Buy it now on " + ag.ad + " (SepetKasasi.dene)", ag, hedef: z[1].kasa, veri: new Interface(KASA).encodeFunctionData("dene", [r.id, varlik]), bahsis: "$0.05 when at least $1 is spent" } }
        : { tur: "kasa", metin: d6(bekleyen) + " wait in the " + ag.ad + " vault: its pool's price is outside the bound (or its oracle is young); the next delivery or anyone's retry buys when it returns." });
    } catch (e) { out.push({ ag: ag.ad, varlik, hata: String(e.shortMessage || e.message).slice(0, 80) }); }
  }
  return out;
}

/// The whole diagnosis of `token` (an Arc launch). `V` is docs/veri/sepet-v2.json.
export async function teshisEt(V, token) {
  token = getAddress(token.trim());
  const arc = saglayici(arcAg());
  const t = new Contract(V.teshis, TESHIS, arc);
  const r = await t.rapor(token);
  const sorunlar = [];
  if (!r.var_) return { token, var_: false, rapor: r, sorunlar: [{ tur: "yok", metin: "This token is not a launch of the current ARC PULSE set on Arc." }], ikizler: [] };

  /* queued redemption orders, paged over the Defter's global queue */
  const emirler = [];
  for (let bas = 0n; ; ) {
    const [e, sonraki] = await t.kuyruk(r.id, bas, 400n);
    emirler.push(...e);
    if (sonraki < bas + 400n) break;    // reached the end of the queue
    bas = sonraki;
  }

  for (const s of r.satirlar) if (s.lotHazir) sorunlar.push({ tur: "lot", metin: "Basket line on " + zincirAdi(Number(s.zincir)) + " holds " + d6(s.biriken) +
    " (at or above the $50 lot) and is still in the Defter" + (s.bekliyor ? "; its last send failed less than an hour ago" : "") + ".",
    duzelt: { ad: "Send waiting lines (Defter.bekleyenleriGonder)", hedef: V.defter, veri: new Interface(["function bekleyenleriGonder(uint64)"]).encodeFunctionData("bekleyenleriGonder", [r.id]), bahsis: "$0.05 per line sent" } });
  for (const e of emirler) sorunlar.push({ tur: "emir", metin: "Redemption order #" + e.sira + " to " + zincirAdi(Number(e.zincir)) + " is queued; sending it costs " + d6(e.ucret) + " now.",
    duzelt: { ad: "Send queued order #" + e.sira + " (Defter.emirGonder)", hedef: V.defter, veri: new Interface(["function emirGonder(uint256)"]).encodeFunctionData("emirGonder", [e.sira]),
      onay: { token: USDC, harcayan: V.defter, miktar: (BigInt(e.ucret) * 11n) / 10n + 1n }, bahsis: "$0.05" } });
  if (r.kovaGonderir) sorunlar.push({ tur: "kova", metin: "The tax bucket holds " + d6(r.kovaDolar) + " that should already be in the basket.",
    duzelt: { ad: "Pass the tax to the basket (VergiKovasi.gonder)", hedef: r.kova, veri: new Interface(["function gonder()"]).encodeFunctionData("gonder", []), gaz: "0x3d0900" } });
  if (r.vekilDolar >= 1_000_000n) sorunlar.push({ tur: "vekil", metin: "Founder income of " + d6(r.vekilDolar) + " is waiting in the launch's KurucuVekili (it can only go to the founder).",
    duzelt: { ad: "Send it to the founder (KurucuVekili.ilet)", hedef: r.vekil, veri: new Interface(["function ilet(uint256)"]).encodeFunctionData("ilet", [r.vekilDolar / 20n]) } });

  /* v7+: the gate's upkeep (depth and liquidity into the pool, the platform token's burner — ARCP from v8 — a founder paid on Arc).
     Every trade through the gate does it; shown here only if something is due now, with the same
     call as a backup anyone can send. */
  if ((V.surum || 0) >= 7 && V.kapi) {
    try {
      const k = new Contract(V.kapi, ["function bakimGerek(address) view returns (bool,bool,bool,bool,bool,uint256)"], arc);
      const [besle, biriktir, ilan, doldur, kurucu, gaz] = await k.bakimGerek(token);
      const pt = (V.platformToken && V.platformToken.sembol) || "platform token";
      const ne = [besle && "the liquidity vault's dollars into this pool", biriktir && "the pool opener's depth slices into the pool",
        ilan && "open the " + pt + " burner's auction", doldur && "fill the " + pt + " auction from " + pt + "'s pool (if the pool pays its ask)",
        kurucu && "the founder's income on Arc"].filter(Boolean);
      if (ne.length) sorunlar.push({ tur: "bakim", metin: "Upkeep due (the next trade does it by itself): " + ne.join("; ") + ".",
        duzelt: { ad: "Run the upkeep now (MerkezKapi.bakim)", hedef: V.kapi, veri: new Interface(["function bakim(address)"]).encodeFunctionData("bakim", [token]),
          gaz: "0x" + (BigInt(gaz) + 600_000n).toString(16) } });
    } catch (e) { /* an older gate has no upkeep view */ }
  }

  /* twins: LayerZero messages between the token's Arc adapter and its twin on each EVM chain */
  const y = new Contract(YAYICI, ["function adapterAdresi(address) view returns (address)", "function ikizAdresi(address) view returns (address)"], arc);
  const [adapter, ikiz] = await Promise.all([y.adapterAdresi(token), y.ikizAdresi(token)]);
  const ikizler = await Promise.all(AGLAR.filter((a) => a.id !== 5042 && UC_NOKTA[a.id] && a.eid).map(async (ag) => {
    try {
      const p = saglayici(ag);
      if ((await p.getCode(ikiz)).length <= 2) return { ag: ag.ad, var_: false };
      const ucArc = new Contract(UC_NOKTA[5042], UC, arc), ucUzak = new Contract(UC_NOKTA[ag.id], UC, p);
      const [gidenArc, varanUzak, islenenUzak, gidenUzak, varanArc, islenenArc] = await Promise.all([
        ucArc.outboundNonce(adapter, ag.eid, zeroPadValue(ikiz, 32)), ucUzak.inboundNonce(ikiz, 30417, zeroPadValue(adapter, 32)), ucUzak.lazyInboundNonce(ikiz, 30417, zeroPadValue(adapter, 32)),
        ucUzak.outboundNonce(ikiz, 30417, zeroPadValue(adapter, 32)), ucArc.inboundNonce(adapter, ag.eid, zeroPadValue(ikiz, 32)), ucArc.lazyInboundNonce(adapter, ag.eid, zeroPadValue(ikiz, 32))]);
      const k = { ag: ag.ad, var_: true, arcdanGiden: Number(gidenArc), oradaDogrulanan: Number(varanUzak), oradaIslenen: Number(islenenUzak),
        oradanGiden: Number(gidenUzak), arcdaDogrulanan: Number(varanArc), arcdaIslenen: Number(islenenArc) };
      /* inboundNonce counts verified messages; lazyInboundNonce the ones delivered past a gap. A verified
         message above the delivered one is waiting for delivery: LayerZero scan, or EndpointV2.lzReceive by anyone. */
      for (let n = k.oradaIslenen + 1; n <= k.oradaDogrulanan; n++) sorunlar.push({ tur: "lz", metin: "LayerZero message #" + n + " from Arc is verified on " + ag.ad +
        " but not delivered yet. Anyone can deliver it with more gas.", paket: { kaynak: arcAg(), sender: adapter, dstEid: ag.eid, receiver: ikiz, nonce: n } });
      for (let n = k.arcdaIslenen + 1; n <= k.arcdaDogrulanan; n++) sorunlar.push({ tur: "lz", metin: "LayerZero message #" + n + " from " + ag.ad +
        " is verified on Arc but not delivered yet. Anyone can deliver it with more gas.", paket: { kaynak: ag, sender: ikiz, dstEid: 30417, receiver: adapter, nonce: n } });
      return k;
    } catch (e) { return { ag: ag.ad, hata: String(e.shortMessage || e.message).slice(0, 80) }; }
  }));
  const kasalar = await kasaDurumlari(V, r, sorunlar).catch(() => []);
  return { token, var_: true, rapor: r, emirler, sorunlar, ikizler, kasalar, adapter, ikiz };
}
