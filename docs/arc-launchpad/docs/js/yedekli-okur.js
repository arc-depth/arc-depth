/* ===========================================================================
 * yedekli-okur.js — a read-only Arc provider that moves to the next RPC
 *
 * The public Arc RPCs answer bursts with 429 (rate limit) or 403, and a page
 * that reads a dozen figures at load is exactly such a burst. Each request
 * goes to the first RPC; on 429/403/5xx or a network error it is retried on
 * the next one in the list. Every URL here is already allowed by the pages'
 * Content-Security-Policy (connect-src).
 * =========================================================================== */
import { JsonRpcProvider } from "../vendor/ethers.min.js";

export const ARC_RPCLER = ["https://rpc.mainnet.arc.io", "https://arc-rpc.publicnode.com", "https://arc-mainnet.drpc.org", "https://rpc.drpc.mainnet.arc.io"];

export class YedekliOkur extends JsonRpcProvider {
  constructor(urller = ARC_RPCLER, chainId = 5042) {
    super(urller[0], { chainId, name: "arc" }, { staticNetwork: true, batchMaxCount: 1 });
    this._urller = urller;
    this._sira = 0;   // the RPC that answered last goes first next time
  }
  async _send(payload) {
    let son;
    for (let i = 0; i < this._urller.length; i++) {
      const k = (this._sira + i) % this._urller.length;
      try {
        /* a silent RPC must not hold a button for minutes: 12 s, then the next one */
        const r = await fetch(this._urller[k], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(12_000) });
        if (r.status === 429 || r.status === 403 || r.status >= 500) throw new Error("RPC " + r.status);
        const j = await r.json();
        /* some RPCs say "rate limited" inside an HTTP 200 */
        if ((Array.isArray(j) ? j : [j]).some((x) => x && x.error && (x.error.code === -32005 || /rate limit/i.test(x.error.message || "")))) throw new Error("RPC rate limited");
        this._sira = k;
        return Array.isArray(j) ? j : [j];
      } catch (e) { son = e; }
    }
    throw son;
  }
}
