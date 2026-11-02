/* ===========================================================================
 * yedekli-okur.js — a read-only Arc provider that moves to the next RPC
 *
 * The public Arc RPCs answer bursts with 429 (rate limit) or 403, and a page
 * that reads a dozen figures at load is exactly such a burst. Each request
 * goes to the first RPC; on 429/403/5xx or a network error it is retried on
 * the next one in the list. Every URL here is already allowed by the pages'
 * Content-Security-Policy (connect-src).
 *
 * EVENT HISTORY (eth_getLogs), 2 Nov 2026: the public RPCs refuse wide block
 * ranges (rpc.mainnet.arc.io at 10,000 blocks, about 1.5 hours of Arc;
 * publicnode serves recent blocks only; drpc refuses getLogs). So:
 *   1. history up to a block is read from a published archive of the public
 *      logs of our own contracts (veri/olaylar/<address>.json, written by
 *      scripts/olay-arsivi.js); it is chain data anyone can re-read, not
 *      anything about a visitor;
 *   2. the blocks after the archive (or any range without one) are read in
 *      pieces of PARCA blocks, a piece refused by one RPC tried on the next.
 * Callers keep calling provider.getLogs over any range as before.
 * =========================================================================== */
import { JsonRpcProvider } from "../vendor/ethers.min.js";

export const ARC_RPCLER = ["https://rpc.mainnet.arc.io", "https://arc-rpc.publicnode.com", "https://rpc.blockdaemon.mainnet.arc.io", "https://arc-mainnet.drpc.org", "https://rpc.drpc.mainnet.arc.io"];
const PARCA = 9000;        // blocks per getLogs piece (the strictest public limit is 10,000)
const ESZAMAN = 3;         // pieces in flight at once
const hex = (n) => "0x" + n.toString(16);
const kucuk = (x) => String(x).toLowerCase();

/* the archive of one contract's logs, fetched once per page load */
const _arsiv = new Map();
function arsivAl(adres) {
  const k = kucuk(adres);
  if (!_arsiv.has(k)) {
    _arsiv.set(k, fetch("veri/olaylar/" + k + ".json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j && Number.isInteger(j.sonBlok) && Array.isArray(j.loglar) ? j : null))
      .catch(() => null));
  }
  return _arsiv.get(k);
}
/** Whether a log matches an eth_getLogs topic filter (null = any, array = one of). */
function konuUyar(log, konular) {
  if (!konular) return true;
  for (let i = 0; i < konular.length; i++) {
    const f = konular[i];
    if (f == null) continue;
    const t = log.topics[i];
    if (t == null) return false;
    if (Array.isArray(f) ? !f.some((x) => x != null && kucuk(x) === kucuk(t)) : kucuk(f) !== kucuk(t)) return false;
  }
  return true;
}

export class YedekliOkur extends JsonRpcProvider {
  constructor(urller = ARC_RPCLER, chainId = 5042) {
    super(urller[0], { chainId, name: "arc" }, { staticNetwork: true, batchMaxCount: 1 });
    this._urller = urller;
    this._sira = 0;   // the RPC that answered last goes first next time
  }
  async _send(payload) {
    if (!Array.isArray(payload) && payload && payload.method === "eth_getLogs") return [await this._loglar(payload)];
    return this._gonder(payload);
  }
  /* `kati`: an error inside the answer also moves to the next RPC (used for log pieces) */
  async _gonder(payload, kati = false) {
    let son;
    for (let i = 0; i < this._urller.length; i++) {
      const k = (this._sira + i) % this._urller.length;
      try {
        /* a silent RPC must not hold a button for minutes: 12 s, then the next one */
        const r = await fetch(this._urller[k], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12_000) });
        if (r.status === 429 || r.status === 403 || r.status >= 500) throw new Error("RPC " + r.status);
        const j = await r.json();
        /* some RPCs say "rate limited" inside an HTTP 200 */
        const hatali = (Array.isArray(j) ? j : [j]).find((x) => x && x.error && (kati || x.error.code === -32005 || /rate limit/i.test(x.error.message || "")));
        if (hatali) throw new Error("RPC: " + (hatali.error.message || hatali.error.code));
        this._sira = k;
        return Array.isArray(j) ? j : [j];
      } catch (e) { son = e; }
    }
    throw son;
  }
  async _sonBlok() {
    const [r] = await this._gonder({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] });
    return parseInt(r.result, 16);
  }
  async _loglar(p) {
    const f = (p.params && p.params[0]) || {};
    const cevap = (result) => ({ jsonrpc: "2.0", id: p.id, result });
    if (f.blockHash) return (await this._gonder(p, true))[0];
    const blok = async (b) => (b == null || ["latest", "pending", "safe", "finalized"].includes(b) ? this._sonBlok() : b === "earliest" ? 0 : parseInt(b, 16));
    let a = await blok(f.fromBlock);
    const z = await blok(f.toBlock);
    if (z < a) return cevap([]);
    const eldeki = [];
    /* our contracts with a published archive (it starts at the deploy block, so nothing
       older exists): take the archived part from it, up to the oldest archive's end */
    const adresler = typeof f.address === "string" ? [f.address] : Array.isArray(f.address) ? f.address : [];
    if (adresler.length) {
      const arsivler = await Promise.all(adresler.map(arsivAl));
      const sonu = arsivler.every(Boolean) ? Math.min(...arsivler.map((x) => x.sonBlok)) : -1;
      if (sonu >= a) {
        const ust = Math.min(z, sonu);
        for (const ar of arsivler) for (const l of ar.loglar) {
          const b = parseInt(l.blockNumber, 16);
          if (b >= a && b <= ust && konuUyar(l, f.topics)) eldeki.push(l);
        }
        eldeki.sort((x, y) => parseInt(x.blockNumber, 16) - parseInt(y.blockNumber, 16) || parseInt(x.logIndex, 16) - parseInt(y.logIndex, 16));
        a = ust + 1;
        if (a > z) return cevap(eldeki);
      }
    }
    const parcalar = [];
    for (let x = a; x <= z; x += PARCA) parcalar.push([x, Math.min(z, x + PARCA - 1)]);
    const sonuc = new Array(parcalar.length);
    let i = 0;
    const isci = async () => { while (i < parcalar.length) { const k = i++; sonuc[k] = await this._parca(p, f, parcalar[k][0], parcalar[k][1]); } };
    await Promise.all(Array.from({ length: Math.min(ESZAMAN, parcalar.length) }, isci));
    return cevap(eldeki.concat(sonuc.flat()));
  }
  async _parca(p, f, a, z) {
    const [r] = await this._gonder({ jsonrpc: "2.0", id: p.id, method: "eth_getLogs", params: [{ ...f, fromBlock: hex(a), toBlock: hex(z) }] }, true);
    return r.result || [];
  }
}
