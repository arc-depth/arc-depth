/* ===========================================================================
 * pulse-cuzdan.js — Pulse Wallet (PREVIEW, 16 Nov 2026; owner: "fomoya benzer, parayı biz tutmadan").
 *
 * A wallet that lives inside the page, opened with the phone's own lock (passkey: Face ID / fingerprint):
 *   - the recovery phrase is made IN THIS BROWSER (ethers Wallet.createRandom) and never leaves it;
 *   - it is kept encrypted (AES-GCM) in this browser's storage. The key to decrypt it is
 *       passkey mode:  the passkey's PRF output (WebAuthn "prf" extension) — only this phone's lock can produce it;
 *       password mode: PBKDF2 (600,000 rounds, SHA-256) of a password the user chose (older phones);
 *   - every transaction or signature asks for that lock again, shows what is signed in plain words, signs here and
 *     sends straight to the chain's public RPC. ARC PULSE has no server for it, no copy, no account, no recovery.
 * It speaks EIP-1193, so the site's wallet layer (cuzdan.js) uses it like MetaMask.
 * =========================================================================== */
const ANAHTAR = "arcpulse-pw-v1";      // { adres, yontem: "passkey"|"sifre", kimlik?, tuz, iv, sifreli, yedeklendi }
const ZINCIR_ANAHTAR = "arcpulse-pw-zincir";
export const PW_ANAHTARLAR = [ANAHTAR, ZINCIR_ANAHTAR];
/* the page's own public RPCs (allowed by the site's CSP) */
const RPC = {
  5042: "https://arc-rpc.publicnode.com", 8453: "https://base-rpc.publicnode.com", 42161: "https://arbitrum-one-rpc.publicnode.com",
  1: "https://ethereum-rpc.publicnode.com", 56: "https://bsc-rpc.publicnode.com", 43114: "https://avalanche-c-chain-rpc.publicnode.com",
  143: "https://rpc.monad.xyz", 999: "https://rpc.hyperliquid.xyz/evm", 4663: "https://robinhood-rpc.publicnode.com",
};
const AD = { 5042: "Arc", 8453: "Base", 42161: "Arbitrum", 1: "Ethereum", 56: "BNB Chain", 43114: "Avalanche", 143: "Monad", 999: "HyperEVM", 4663: "Robinhood" };
const E = () => import("../vendor/ethers.min.js");
const b2h = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const h2b = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const rastgele = (n) => crypto.getRandomValues(new Uint8Array(n));

export function kayit() { try { return JSON.parse(localStorage.getItem(ANAHTAR) || "null"); } catch (e) { return null; } }
const kayitYaz = (k) => localStorage.setItem(ANAHTAR, JSON.stringify(k));
export const var_ = () => !!kayit();

/* ---- the lock ---- */
export async function passkeyDestekli() {
  try { return !!(window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())); } catch (e) { return false; }
}
async function prfAl(kimlik, tuz) {
  const c = await navigator.credentials.get({ publicKey: { challenge: rastgele(32), rpId: location.hostname, userVerification: "required", timeout: 60000,
    allowCredentials: [{ type: "public-key", id: h2b(kimlik) }], extensions: { prf: { eval: { first: h2b(tuz) } } } } });
  const r = c && c.getClientExtensionResults && c.getClientExtensionResults().prf;
  if (!r || !r.results || !r.results.first) throw new Error("This phone's passkey cannot unlock a wallet (no PRF support). Use a password instead.");
  return new Uint8Array(r.results.first);
}
async function aesAnahtar(ham, tuz, yontem) {
  if (yontem === "passkey") {
    const k = await crypto.subtle.importKey("raw", ham, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: h2b(tuz), info: new TextEncoder().encode("ARC PULSE Pulse Wallet v1") }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(ham), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: h2b(tuz), iterations: 600000 }, k, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** Create a new wallet (or import a phrase). yontem "passkey" asks the phone's lock; "sifre" needs `sifre` (8+ chars). */
export async function olustur({ yontem, sifre, ifade }) {
  if (kayit()) throw new Error("A Pulse Wallet already exists on this device.");
  const { Wallet } = await E();
  const w = ifade ? Wallet.fromPhrase(ifade.trim().toLowerCase().replace(/\s+/g, " ")) : Wallet.createRandom();
  const tuz = b2h(rastgele(32)); let kimlik = null, ham;
  if (yontem === "passkey") {
    const c = await navigator.credentials.create({ publicKey: {
      rp: { name: "ARC PULSE", id: location.hostname }, user: { id: rastgele(16), name: "Pulse Wallet " + w.address.slice(0, 6), displayName: "Pulse Wallet" },
      challenge: rastgele(32), pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], timeout: 60000,
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, extensions: { prf: {} } } });
    kimlik = b2h(c.rawId);
    const ext = c.getClientExtensionResults ? c.getClientExtensionResults() : {};
    if (ext.prf && ext.prf.enabled === false) throw new Error("This phone's passkey cannot unlock a wallet (no PRF support). Use a password instead.");
    ham = await prfAl(kimlik, tuz);
  } else {
    if (!sifre || sifre.length < 8) throw new Error("Use a password of at least 8 characters.");
    ham = sifre;
  }
  const iv = rastgele(12), anahtar = await aesAnahtar(ham, tuz, yontem);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, anahtar, new TextEncoder().encode(w.mnemonic.phrase));
  kayitYaz({ adres: w.address, yontem, kimlik, tuz, iv: b2h(iv), sifreli: b2h(ct), yedeklendi: !!ifade, zaman: Date.now() });
  return w.address;
}

/** Open the wallet with the lock, for one signature. sifreSor() returns the password in password mode. */
async function ac(sifreSor) {
  const k = kayit(); if (!k) throw new Error("No Pulse Wallet on this device.");
  const ham = k.yontem === "passkey" ? await prfAl(k.kimlik, k.tuz) : await sifreSor();
  if (ham == null) { const e = new Error("Cancelled."); e.code = 4001; throw e; }
  let duz;
  try { duz = await crypto.subtle.decrypt({ name: "AES-GCM", iv: h2b(k.iv) }, await aesAnahtar(ham, k.tuz, k.yontem), h2b(k.sifreli)); }
  catch (e) { throw new Error(k.yontem === "sifre" ? "Wrong password." : "The passkey did not open this wallet."); }
  const { Wallet } = await E();
  const w = Wallet.fromPhrase(new TextDecoder().decode(duz));
  if (w.address.toLowerCase() !== k.adres.toLowerCase()) throw new Error("This wallet's data on the device is damaged.");
  return w;
}
export async function ifadeGoster(sifreSor) { const w = await ac(sifreSor); const k = kayit(); k.yedeklendi = true; kayitYaz(k); return w.mnemonic.phrase; }
export function sil() { localStorage.removeItem(ANAHTAR); localStorage.removeItem(ZINCIR_ANAHTAR); }

/* ---- the confirm sheet: what is being signed, in plain words ---- */
function onayla(baslik, satirlar, uyari) {
  return new Promise((tamam) => {
    const perde = document.createElement("div");
    perde.className = "pw-perde";
    perde.innerHTML = `<div class="pw-sayfa" role="dialog" aria-label="Confirm"><div class="pw-baslik"></div><div class="pw-satirlar"></div><div class="pw-uyari"></div>
      <div class="pw-dugmeler"><button type="button" class="dugme dugme--sade pw-hayir">Reject</button><button type="button" class="dugme dugme--marka pw-evet">Confirm</button></div>
      <div class="pw-not">Pulse Wallet · signed on this device · ARC PULSE never holds your key</div></div>`;
    perde.querySelector(".pw-baslik").textContent = baslik;
    const s = perde.querySelector(".pw-satirlar");
    for (const [a, b] of satirlar) { const d = document.createElement("div"); const x = document.createElement("span"); x.textContent = a; const y = document.createElement("b"); y.textContent = b; d.append(x, y); s.append(d); }
    perde.querySelector(".pw-uyari").textContent = uyari || "";
    const kapat = (v) => { perde.remove(); tamam(v); };
    perde.querySelector(".pw-hayir").onclick = () => kapat(false);
    perde.querySelector(".pw-evet").onclick = () => kapat(true);
    if (!document.getElementById("pw-stil")) { const st = document.createElement("style"); st.id = "pw-stil"; st.textContent = PW_STIL; document.head.append(st); }
    document.body.append(perde);
  });
}
const PW_STIL = `.pw-perde{position:fixed;inset:0;z-index:90;background:rgba(0,0,0,.65);display:flex;align-items:flex-end;justify-content:center}
.pw-sayfa{width:min(480px,100%);background:#111117;border:1px solid var(--cizgi);border-radius:18px 18px 0 0;padding:18px;display:flex;flex-direction:column;gap:12px}
@media(min-width:861px){.pw-perde{align-items:center}.pw-sayfa{border-radius:18px}}
.pw-baslik{font-size:18px;font-weight:700}.pw-satirlar{display:flex;flex-direction:column;gap:6px}
.pw-satirlar div{display:flex;justify-content:space-between;gap:10px;font-size:14px}.pw-satirlar span{color:var(--yazi-3)}.pw-satirlar b{text-align:right;word-break:break-all;font-family:var(--yazi-tipi-mono)}
.pw-uyari{font-size:13px;color:#ffb86b}.pw-uyari:empty{display:none}.pw-dugmeler{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pw-not{font-size:11px;color:var(--yazi-3);text-align:center}`;

const SECICI = { "0x095ea7b3": "Allow a contract to spend a token", "0xa9059cbb": "Send a token" };

/* ---- the EIP-1193 provider ---- */
export function saglayiciKur({ sifreSor }) {
  const k = kayit(); if (!k) return null;
  const olaylar = {};
  let zincir = Number((() => { try { return localStorage.getItem(ZINCIR_ANAHTAR); } catch (e) { return null; } })() || 5042);
  if (!RPC[zincir]) zincir = 5042;
  const yay = (ad, v) => (olaylar[ad] || []).forEach((f) => { try { f(v); } catch (e) { /* listener error */ } });
  const rpc = async (method, params) => {
    const r = await fetch(RPC[zincir], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params || [] }) }).then((x) => x.json());
    if (r.error) { const e = new Error(r.error.message || "RPC error"); e.code = r.error.code; e.data = r.error.data; throw e; }
    return r.result;
  };
  const red = () => { const e = new Error("User rejected the request."); e.code = 4001; return e; };
  const p = {
    isPulseWallet: true,
    on(ad, f) { (olaylar[ad] = olaylar[ad] || []).push(f); return p; },
    removeListener(ad, f) { olaylar[ad] = (olaylar[ad] || []).filter((x) => x !== f); return p; },
    async request({ method, params }) {
      const k = kayit(); if (!k) throw new Error("No Pulse Wallet on this device.");
      switch (method) {
        case "eth_accounts": case "eth_requestAccounts": return [k.adres];
        case "eth_chainId": return "0x" + zincir.toString(16);
        case "net_version": return String(zincir);
        case "wallet_switchEthereumChain": {
          const id = parseInt(params[0].chainId, 16);
          if (!RPC[id]) { const e = new Error("Pulse Wallet does not support this chain yet."); e.code = 4902; throw e; }
          zincir = id; try { localStorage.setItem(ZINCIR_ANAHTAR, String(id)); } catch (e) { /* blocked */ }
          yay("chainChanged", "0x" + id.toString(16)); return null;
        }
        case "wallet_addEthereumChain": { const id = parseInt(params[0].chainId, 16); if (!RPC[id]) throw new Error("Pulse Wallet does not support this chain yet."); return null; }
        case "wallet_revokePermissions": case "wallet_requestPermissions": return null;
        case "eth_sendTransaction": {
          const { formatEther, JsonRpcProvider } = await E();
          const t = params[0]; const deger = BigInt(t.value || 0);
          const ne = t.data && t.data.length >= 10 ? SECICI[t.data.slice(0, 10).toLowerCase()] || "Contract call" : "Send";
          const ok = await onayla("Confirm on " + (AD[zincir] || "chain " + zincir), [["Action", ne], ["To", t.to ? t.to.slice(0, 10) + "…" + t.to.slice(-6) : "new contract"],
            ["Value", deger ? formatEther(deger) + (zincir === 5042 ? " USDC" : zincir === 56 ? " BNB" : zincir === 43114 ? " AVAX" : zincir === 143 ? " MON" : zincir === 999 ? " HYPE" : " ETH") : "0"]],
            ne === "Allow a contract to spend a token" ? "Only allow contracts you trust (ARC PULSE's buy and sell boxes use relay.link and our own pools)." : "");
          if (!ok) throw red();
          const w = (await ac(sifreSor)).connect(new JsonRpcProvider(RPC[zincir], zincir, { staticNetwork: true }));
          try {
            const g = await w.sendTransaction({ to: t.to, data: t.data || "0x", value: deger, ...(t.gas || t.gasLimit ? { gasLimit: BigInt(t.gas || t.gasLimit) } : {}) });
            return g.hash;
          } catch (e) {
            /* the chain answers an empty wallet cryptically ("missing revert data"): say it plainly */
            const bak = await w.provider.getBalance(w.address).catch(() => null);
            if (bak === 0n || /insufficient funds/i.test(String(e && e.message))) throw new Error("Not enough " + (zincir === 5042 ? "USDC" : "gas money") + " on " + (AD[zincir] || "this chain") + " in your Pulse Wallet to pay for this transaction.");
            throw e;
          }
        }
        case "personal_sign": {
          const { getBytes, toUtf8String } = await E();
          const veri = params[0]; let goster; try { goster = toUtf8String(veri); } catch (e) { goster = veri; }
          if (!(await onayla("Sign a message", [["Message", goster.slice(0, 300)]], "Signing a message costs nothing and moves no money."))) throw red();
          const w = await ac(sifreSor); return w.signMessage(getBytes(veri));
        }
        case "eth_signTypedData_v4": {
          const v = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
          const { EIP712Domain, ...tipler } = v.types;
          if (!(await onayla("Sign typed data", [["App", (v.domain && v.domain.name) || "?"], ["Type", v.primaryType]], "Check the app is the one you are using."))) throw red();
          const w = await ac(sifreSor); return w.signTypedData(v.domain, tipler, v.message);
        }
        default: return rpc(method, params);
      }
    },
  };
  return p;
}
export const PW_ZINCIRLER = Object.keys(RPC).map(Number);
export const PW_AD = AD;
