/* ===========================================================================
 * cuzdan.js — the wallet connection, and nothing more
 *
 * Deliberately small. It connects, reports the account and the chain,
 * switches to Arc, and sends a transaction when a view asks. It does not
 * know what any contract does.
 *
 * NO AUTO-CONNECT
 *   The page never calls eth_requestAccounts on load. A site that pops a
 *   wallet prompt before the visitor has asked for anything is a site
 *   people close. `sessizBagla` only reports an account the wallet has
 *   ALREADY authorised, which is what makes a refresh keep the session
 *   without a second prompt.
 *
 * THE CHAIN IS CHECKED, NOT ASSUMED
 *   Arc is 5042 and its gas token is USDC. A transaction sent from the
 *   wrong chain either fails or — worse — succeeds somewhere else, so
 *   every send goes through `zincirdeMi`.
 * =========================================================================== */

import { ZINCIR } from "./adresler.js";

const ONALTILIK_ID = "0x" + ZINCIR.id.toString(16);

let _hesap = null;
let _zincir = null;
const _dinleyiciler = new Set();

function saglayici() {
  return typeof window !== "undefined" && window.ethereum ? window.ethereum : null;
}

function duyur() {
  for (const f of _dinleyiciler) {
    try { f({ hesap: _hesap, zincir: _zincir }); } catch (e) { /* a listener must not break the rest */ }
  }
}

async function zinciriOku() {
  const p = saglayici();
  if (!p) return null;
  try {
    _zincir = await p.request({ method: "eth_chainId" });
  } catch (e) {
    _zincir = null;
  }
  return _zincir;
}

export const cuzdan = {
  varMi() { return !!saglayici(); },
  hesap() { return _hesap; },
  zincirId() { return _zincir; },
  zincirdeMi() { return _zincir != null && _zincir.toLowerCase() === ONALTILIK_ID; },

  /** Report an already-authorised account. Never prompts. */
  async sessizBagla() {
    const p = saglayici();
    if (!p) return null;
    try {
      const h = await p.request({ method: "eth_accounts" });
      _hesap = h && h.length ? h[0] : null;
    } catch (e) {
      _hesap = null;
    }
    await zinciriOku();
    duyur();
    return _hesap;
  },

  /** Prompt. Only ever from a click. */
  async bagla() {
    const p = saglayici();
    if (!p) {
      throw new Error(
        "No wallet found in this browser. A wallet that supports the Arc " +
    "network has to be installed."
      );
    }
    const h = await p.request({ method: "eth_requestAccounts" });
    _hesap = h && h.length ? h[0] : null;
    await zinciriOku();
    duyur();
    return _hesap;
  },

  /**
   * Ask the wallet to switch to Arc, adding it if the wallet does not know
   * it. 4902 is the "unrecognised chain" code; anything else is the user
   * saying no, and that is an answer rather than an error.
   */
  async arcaGec() {
    const p = saglayici();
    if (!p) throw new Error("No wallet");
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ONALTILIK_ID }] });
    } catch (e) {
      if (e && e.code === 4902) {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: ONALTILIK_ID,
            chainName: "Arc",
            rpcUrls: [ZINCIR.rpc],
            /* EIGHTEEN, and this line said six.

               Arc's gas token IS USDC, which makes six look obviously
               right — the ERC20 contract really does report six. But the
               NATIVE unit is eighteen decimals like any EVM chain, and
               the two are the same balance at different scales.

               Measured on the operations wallet, same address, same block:

                 eth_getBalance    16473110094122734642   -> $16.47 at 1e18
                 USDC.balanceOf              16473110     -> $16.47 at 1e6
                 ratio                         1.0000e+12

               So a wallet told six displays $16,473,110,094,122.74 where
               the balance is $16.47. The old comment claimed the opposite
               and was confident about it, which is why this was measured
               rather than reasoned about: the same six-versus-eighteen
               mistake cost a $497 BILLION deployment estimate elsewhere
               in this project on the same day. */
            nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 }
          }]
        });
      } else {
        throw e;
      }
    }
    await zinciriOku();
    duyur();
  },

  /** Send a transaction. The chain is verified first, every time. */
  async gonder(islem) {
    const p = saglayici();
    if (!p) throw new Error("No wallet");
    if (!_hesap) throw new Error("Wallet not connected");
    if (!this.zincirdeMi()) await this.arcaGec();
    if (!this.zincirdeMi()) throw new Error("Wallet is not on the Arc network");
    return p.request({ method: "eth_sendTransaction", params: [{ from: _hesap, ...islem }] });
  },

  /* ---- any of the nine chains (aglar.js) -------------------------- */

  /** True when the wallet sits on chain `ag` (an AGLAR entry). */
  agdaMi(ag) { return _zincir != null && parseInt(_zincir, 16) === ag.id; },

  /**
   * Switch the wallet to `ag`, adding it when the wallet does not know it.
   * Native currency is 18 decimals on every one of them — on Arc too, where
   * the gas token is USDC (see arcaGec for the measurement).
   */
  async agaGec(ag) {
    if (ag.id === ZINCIR.id) return this.arcaGec();
    const p = saglayici();
    if (!p) throw new Error("No wallet");
    const hex = "0x" + ag.id.toString(16);
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
    } catch (e) {
      if (e && e.code === 4902) {
        await p.request({ method: "wallet_addEthereumChain", params: [{
          chainId: hex, chainName: ag.ad, rpcUrls: [ag.rpc],
          nativeCurrency: { name: ag.gaz, symbol: ag.gaz, decimals: 18 },
          blockExplorerUrls: ag.kasif ? [ag.kasif] : undefined
        }] });
      } else {
        throw e;
      }
    }
    await zinciriOku();
    duyur();
  },

  /** Send on chain `ag`. The chain is verified first, every time. */
  async agdaGonder(ag, islem) {
    const p = saglayici();
    if (!p) throw new Error("No wallet");
    if (!_hesap) throw new Error("Wallet not connected");
    if (!this.agdaMi(ag)) await this.agaGec(ag);
    if (!this.agdaMi(ag)) throw new Error("Wallet is not on " + ag.ad);
    return p.request({ method: "eth_sendTransaction", params: [{ from: _hesap, ...islem }] });
  },

  dinle(f) {
    _dinleyiciler.add(f);
    return () => _dinleyiciler.delete(f);
  }
};

/* The wallet can change account or chain without the page doing anything,
   and a page that keeps showing the old account after the user switched is
   a page that will show somebody the wrong balance. */
const p = saglayici();
if (p && p.on) {
  p.on("accountsChanged", (h) => { _hesap = h && h.length ? h[0] : null; duyur(); });
  p.on("chainChanged", (c) => { _zincir = c; duyur(); });
}

cuzdan.sessizBagla();
