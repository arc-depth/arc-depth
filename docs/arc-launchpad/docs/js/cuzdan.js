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

/* EIP-6963: wallets announce themselves instead of fighting over
   window.ethereum. With two extensions installed only one of them owns
   window.ethereum; the announcement list has both. MetaMask first when it
   is there, since that is the one people mean. */
const _duyurulan = [];
if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (e) => {
    if (e && e.detail && e.detail.provider && !_duyurulan.some((x) => x.info.uuid === e.detail.info.uuid)) _duyurulan.push(e.detail);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/* WalletConnect: any wallet, by QR on a computer or by link on a phone.
   The project id is public by design (it names the site to the relay, it
   grants nothing); the relay only serves the domains allowed for it on
   dashboard.reown.com (arcpulse.app; arc-depth.github.io before 24 Oct 2026). The 2 MB bundle is loaded on
   the click, and on load only when a session was left open here. */
const WC_PROJE = "3732e09480d6f286889688c0f4a70918";
/* The relay answers "Unauthorized: origin not allowed" (code 3000) for arcpulse.app until the
   domain is on this project's allowlist at dashboard.reown.com (measured 24 Oct 2026). Off until
   then: the wallet apps' own links open the page inside them, no relay needed.
   28 Oct 2026: the relay pairs from https://arcpulse.app (EthereumProvider.init emitted display_uri),
   so WalletConnect is on, next to the wallet apps' own links. */
export const WC_ACIK = true;
/* HyperEVM (999) is left out on purpose: chainid.network lists 999 as
   "Wanchain Testnet", so wallets that check the registry flag it. */
const WC_ZINCIRLER = [5042, 4663, 8453, 42161, 1, 56, 43114, 143];
const WC_ISARET = "arcpulse-wc";
/* Set when the visitor presses Disconnect: an extension wallet keeps the site's permission, so
   without this a refresh would quietly reconnect through eth_accounts. Cleared by Connect. */
const KOPUK = "arcpulse-kopuk";
const kopukMu = () => { try { return localStorage.getItem(KOPUK) === "1"; } catch (e) { return false; } };
const kopukYaz = (v) => { try { v ? localStorage.setItem(KOPUK, "1") : localStorage.removeItem(KOPUK); } catch (e) { /* storage may be blocked */ } };
let _wc = null;

async function wcKur() {
  if (_wc) return _wc;
  const { EthereumProvider } = await import("../vendor/walletconnect.mjs");
  const rpcMap = {};
  for (const id of WC_ZINCIRLER) if (KAYITLI[id]) rpcMap[id] = KAYITLI[id].rpcUrls[0];
  _wc = await EthereumProvider.init({
    projectId: WC_PROJE,
    /* nothing required: a wallet that has never heard of Arc still pairs,
       and the page asks it to add Arc when a send needs it */
    optionalChains: WC_ZINCIRLER,
    rpcMap,
    /* privacy: no telemetry to WalletConnect's event service (pulse.walletconnect.org), and the QR
       modal without analytics, email/social login, on-ramp or swaps; what remains is the
       end-to-end encrypted relay pairing and the public wallet list */
    telemetryEnabled: false,
    showQrModal: true,
    qrModalOptions: { features: { analytics: false, email: false, socials: false, onramp: false, swaps: false, send: false, receive: false, history: false } },
    metadata: {
      name: "ARC PULSE",
      description: "Token launchpad with a collateral vault behind every token",
      url: new URL(".", location.href).href,
      icons: [new URL("veri/ikon.png", location.href).href],
    },
  });
  _wc.on("accountsChanged", (h) => { _hesap = h && h.length ? h[0] : null; duyur(); });
  _wc.on("chainChanged", (c) => { _zincir = typeof c === "number" ? "0x" + c.toString(16) : c; duyur(); });
  _wc.on("disconnect", () => {
    try { localStorage.removeItem(WC_ISARET); } catch (e) { /* storage may be blocked */ }
    _wc = null; _hesap = null; _zincir = null; duyur();
  });
  return _wc;
}

function saglayici() {
  if (typeof window === "undefined") return null;
  if (_wc && _wc.session) return _wc;
  const mm = _duyurulan.find((x) => /metamask/i.test(x.info.rdns || x.info.name || ""));
  if (mm) return mm.provider;
  if (window.ethereum) return window.ethereum;
  return _duyurulan.length ? _duyurulan[0].provider : null;
}

/**
 * Phone browsers (Safari, Chrome on iOS and Android) carry no wallet. The
 * wallet apps each have a browser of their own and a link that opens this
 * very page inside it, where the wallet is present. Those links are the
 * wallets' own documented deep links; nothing is installed or relayed.
 */
export function cuzdanUygulamalari() {
  const tam = location.href;
  const yalin = location.host + location.pathname + location.search + location.hash;
  return [
    { ad: "MetaMask", url: "https://metamask.app.link/dapp/" + yalin },
    { ad: "Coinbase Wallet", url: "https://go.cb-w.com/dapp?cb_url=" + encodeURIComponent(tam) },
    { ad: "Trust Wallet", url: "https://link.trustwallet.com/open_url?coin_id=60&url=" + encodeURIComponent(tam) },
    { ad: "OKX Wallet", url: "okx://wallet/dapp/url?dappUrl=" + encodeURIComponent(tam) },
  ];
}

/** The browser wallet's own name (EIP-6963), or null when there is none. */
export function tarayiciCuzdani() {
  const p = typeof window !== "undefined" ? (window.ethereum || null) : null;
  const d = _duyurulan.find((x) => /metamask/i.test(x.info.rdns || "")) || _duyurulan[0];
  if (d) return { ad: d.info.name, ikon: d.info.icon };
  if (p) return { ad: p.isMetaMask ? "MetaMask" : p.isCoinbaseWallet ? "Coinbase Wallet" : p.isTrust ? "Trust Wallet" : "Browser wallet", ikon: null };
  return null;
}

export const mobilMi = () => typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/* What a wallet is told when it adds a chain. MetaMask checks a new
   network against the public chain registry (chainid.network) and warns
   "this network may not be safe" when the name, the currency or the RPC do
   not match it. So these are the registry's own values, copied 16 Oct
   2026, not our short display names ("Arbitrum", "BNB Chain"). */
const KAYITLI = {
  5042: { chainName: "Arc", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.arc.io", "https://rpc.drpc.mainnet.arc.io", "https://rpc.blockdaemon.mainnet.arc.io"],
    blockExplorerUrls: ["https://explorer.arc.io"] },
  4663: { chainName: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com"],
    blockExplorerUrls: ["https://robinhoodchain.blockscout.com"] },
  8453: { chainName: "Base", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://mainnet.base.org"], blockExplorerUrls: ["https://basescan.org"] },
  42161: { chainName: "Arbitrum One", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://arb1.arbitrum.io/rpc"], blockExplorerUrls: ["https://arbiscan.io"] },
  1: { chainName: "Ethereum Mainnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://ethereum-rpc.publicnode.com"], blockExplorerUrls: ["https://etherscan.io"] },
  56: { chainName: "BNB Smart Chain Mainnet", nativeCurrency: { name: "BNB Chain Native Token", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed1.bnbchain.org"], blockExplorerUrls: ["https://bscscan.com"] },
  43114: { chainName: "Avalanche C-Chain", nativeCurrency: { name: "Avalanche", symbol: "AVAX", decimals: 18 },
    rpcUrls: ["https://api.avax.network/ext/bc/C/rpc"], blockExplorerUrls: ["https://snowtrace.io"] },
  143: { chainName: "Monad", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: ["https://rpc.monad.xyz"], blockExplorerUrls: ["https://monadvision.com"] },
};

function agEkleParam(id, yedek) {
  const k = KAYITLI[id];
  return { chainId: "0x" + id.toString(16), ...(k || yedek) };
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
      const h = kopukMu() ? [] : await p.request({ method: "eth_accounts" });
      _hesap = h && h.length ? h[0] : null;
    } catch (e) {
      _hesap = null;
    }
    await zinciriOku();
    duyur();
    return _hesap;
  },

  /** WalletConnect: opens its own QR / wallet-list modal. Only from a click. */
  async walletConnect() {
    kopukYaz(false);
    const p = await wcKur();
    if (!p.session) await p.connect();
    try { localStorage.setItem(WC_ISARET, "1"); } catch (e) { /* storage may be blocked */ }
    _hesap = p.accounts && p.accounts.length ? p.accounts[0] : null;
    await zinciriOku();
    duyur();
    return _hesap;
  },

  /** Disconnect: ends a WalletConnect session; for an extension wallet asks it to drop this
      site's permission (wallet_revokePermissions: MetaMask, Rabby and others) and, whether or not
      the wallet supports that, stops this page from reconnecting until the visitor presses Connect. */
  async kes() {
    if (_wc) await _wc.disconnect().catch(() => {});
    _wc = null;
    try { localStorage.removeItem(WC_ISARET); } catch (e) { /* storage may be blocked */ }
    const p = saglayici();
    if (p) { try { await p.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch (e) { /* not supported: the flag below still holds */ } }
    kopukYaz(true);
    _hesap = null; _zincir = null;
    duyur();
  },
  wcMi() { return !!(_wc && _wc.session); },

  /** Disconnect and forget this device: ends a WalletConnect session and wipes everything this
      site and the WalletConnect library keep in this browser (local/session storage, IndexedDB).
      Nothing was ever kept anywhere else. An extension wallet's own permission for the site is
      revoked in the wallet itself. */
  async unut() {
    if (_wc) await _wc.disconnect().catch(() => {});
    const p = saglayici();
    if (p) { try { await p.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] }); } catch (e) { /* not supported */ } }
    _wc = null; _hesap = null; _zincir = null;
    try { localStorage.clear(); } catch (e) { /* storage may be blocked */ }
    try { sessionStorage.clear(); } catch (e) { /* storage may be blocked */ }
    try {
      const dbs = indexedDB.databases ? await indexedDB.databases() : [];
      await Promise.all(dbs.map((d) => d.name && new Promise((ok) => { const r = indexedDB.deleteDatabase(d.name); r.onsuccess = r.onerror = r.onblocked = ok; })));
    } catch (e) { /* not supported: nothing to clear */ }
    kopukYaz(true);
    duyur();
  },

  /** Prompt. Only ever from a click. */
  async bagla() {
    const p = saglayici();
    if (!p) {
      const e = new Error(
        "No wallet found in this browser. A wallet that supports the Arc " +
    "network has to be installed."
      );
      e.code = "CUZDAN_YOK";   // the page offers the wallet apps instead of an error
      /* every view's connect button lands here; ana.js opens one dialog */
      window.dispatchEvent(new CustomEvent("cuzdan-yok"));
      throw e;
    }
    kopukYaz(false);
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
        /* The registry's values (KAYITLI); the comment below is why the
           decimals are eighteen. */
        await p.request({
          method: "wallet_addEthereumChain",
          params: [agEkleParam(ZINCIR.id, {
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
            nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 }
          })]
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
        await p.request({ method: "wallet_addEthereumChain", params: [agEkleParam(ag.id, {
          chainName: ag.ad, rpcUrls: [ag.rpc],
          nativeCurrency: { name: ag.gaz, symbol: ag.gaz, decimals: 18 },
          blockExplorerUrls: ag.kasif ? [ag.kasif] : undefined
        })] });
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
/* Wallets announce over EIP-6963 a moment after the page loads, so the
   listeners and the silent reconnect wait one tick for them. */
setTimeout(() => {
  const p = saglayici();
  if (p && p.on) {
    p.on("accountsChanged", (h) => { _hesap = !kopukMu() && h && h.length ? h[0] : null; duyur(); });
    p.on("chainChanged", (c) => { _zincir = c; duyur(); });
  }
  /* a WalletConnect session left open on this device: restore it quietly */
  let wcVar = false;
  try { wcVar = localStorage.getItem(WC_ISARET) === "1"; } catch (e) { /* storage may be blocked */ }
  if (wcVar) wcKur().then(() => cuzdan.sessizBagla()).catch(() => cuzdan.sessizBagla());
  else cuzdan.sessizBagla();
}, 150);
