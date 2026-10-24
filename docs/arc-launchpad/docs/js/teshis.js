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
 * No server, nothing stored; the user's wallet is used only for a fix the
 * user chooses, and its tip (if any) goes to that wallet.
 * =========================================================================== */
import { JsonRpcProvider, Contract, Interface, zeroPadValue, getAddress } from "../vendor/ethers.min.js";
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

  /* v7: the gate's upkeep (depth and liquidity into the pool, the FTHM burner, a founder paid on Arc).
     Every trade through the gate does it; shown here only if something is due now, with the same
     call as a backup anyone can send. */
  if ((V.surum || 0) >= 7 && V.kapi) {
    try {
      const k = new Contract(V.kapi, ["function bakimGerek(address) view returns (bool,bool,bool,bool,bool,uint256)"], arc);
      const [besle, biriktir, ilan, doldur, kurucu, gaz] = await k.bakimGerek(token);
      const ne = [besle && "the liquidity vault's dollars into this pool", biriktir && "the pool opener's depth slices into the pool",
        ilan && "open the FTHM burner's auction", doldur && "fill the FTHM auction from FTHM's pool (if the pool pays its ask)",
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
      if (k.oradaDogrulanan > k.oradaIslenen) sorunlar.push({ tur: "lz", metin: (k.oradaDogrulanan - k.oradaIslenen) + " LayerZero message(s) from Arc are verified on " + ag.ad +
        " but not delivered yet. Anyone can deliver them with more gas (EndpointV2.lzReceive; the message bytes are on Arc in the PacketSent event)." });
      if (k.arcdaDogrulanan > k.arcdaIslenen) sorunlar.push({ tur: "lz", metin: (k.arcdaDogrulanan - k.arcdaIslenen) + " LayerZero message(s) from " + ag.ad +
        " are verified on Arc but not delivered yet." });
      return k;
    } catch (e) { return { ag: ag.ad, hata: String(e.shortMessage || e.message).slice(0, 80) }; }
  }));
  return { token, var_: true, rapor: r, emirler, sorunlar, ikizler, adapter, ikiz };
}
