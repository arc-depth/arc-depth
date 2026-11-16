/* ===========================================================================
 * gorunum/pulse-wallet.js — #/pulse-wallet, the Pulse Wallet PREVIEW page (16 Nov 2026). Not in any menu until the
 * owner approves it. Create (phone lock or password) or import a phrase, see the address and dollar balances, use it
 * as the site's wallet, show the recovery phrase, remove it from this device. See js/pulse-cuzdan.js for how the key
 * is kept: in this browser only, encrypted, opened by the phone's lock for each signature.
 * =========================================================================== */
import { el, temizle } from "../ui.js";
import { cuzdan } from "../cuzdan.js";

const STIL = `
.pwp { display: flex; flex-direction: column; gap: 14px; max-width: 560px; }
.pwp h1 { margin: 0; font-size: 24px; }
.pwp-onizleme { border: 1px solid #f5c542; color: #f5c542; background: rgba(245,197,66,.08); border-radius: 12px; padding: 10px 12px; font-size: 13px; }
.pwp-kart { border: 1px solid var(--cizgi); background: var(--yuzey-1); border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.pwp-kart h2 { margin: 0; font-size: 16px; }
.pwp-kart p { margin: 0; color: var(--yazi-2); font-size: 14px; }
.pwp-madde { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: var(--yazi-2); margin: 0; padding-left: 18px; }
.pwp-adres { font-family: var(--yazi-tipi-mono); font-size: 14px; word-break: break-all; background: var(--yuzey-2); border-radius: 10px; padding: 10px; }
.pwp-bakiye { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.pwp-bakiye div { border: 1px solid var(--cizgi); border-radius: 12px; padding: 8px 10px; }
.pwp-bakiye span { display: block; font-size: 12px; color: var(--yazi-3); }
.pwp-bakiye b { font-family: var(--yazi-tipi-mono); }
.pwp-dugmeler { display: flex; gap: 8px; flex-wrap: wrap; }
.pwp-ifade { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 6px; font-family: var(--yazi-tipi-mono); font-size: 14px; }
.pwp-ifade span { background: var(--yuzey-2); border-radius: 8px; padding: 6px 8px; }
.pwp-ifade i { color: var(--yazi-3); font-style: normal; margin-right: 4px; }
.pwp-durum { font-size: 13px; color: var(--yazi-2); min-height: 18px; }
.pwp-durum.hata { color: var(--satis); }
.pwp input, .pwp textarea { width: 100%; background: var(--yuzey-2); border: 1px solid var(--cizgi); border-radius: 10px; color: var(--yazi-1); padding: 10px; font: inherit; }
.pwp-uyari { color: #ffb86b; font-size: 13px; }
`;
/* the dollar token on each chain the wallet supports (USDC; Arc's USDC is also its gas) */
const USDC = { 5042: "0x3600000000000000000000000000000000000000", 8453: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 42161: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  1: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 56: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 43114: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E" };

const sifreSor = async () => { const s = prompt("Pulse Wallet password:"); return s == null ? null : s; };

export async function ciz() {
  if (!document.getElementById("pwp-stil")) document.head.append(el("style", { attr: { id: "pwp-stil" }, yazi: STIL }));
  const P = await import("../pulse-cuzdan.js");
  const kok = el("div", { sinif: "pwp" });
  const durum = el("div", { sinif: "pwp-durum" });
  const hata = (e) => { durum.className = "pwp-durum hata"; durum.textContent = (e && e.code === 4001) || /cancel|abort|NotAllowed/i.test(String(e && (e.name + e.message))) ? "Cancelled." : (e && e.message) || String(e); };
  const bilgi = (t) => { durum.className = "pwp-durum"; durum.textContent = t; };

  const yenile = () => { temizle(kok); ciz2(); };
  /* 16 Nov 2026 (owner: "bana özel kapalı beta yap"): the page opens for the invited wallet only. Once that wallet
     connected in this browser, a flag keeps the page open here (also while the Pulse Wallet is the site's wallet).
     A gate in a public site's code stops casual visitors, not a determined reader; the wallet itself is the user's own. */
  const DAVETLI = ["0x89189c84dc95d0520aeec9c8cf3ba5b9d42611d0"];
  const BETA = "arcpulse-pw-beta";
  const betaVar = () => { try { return localStorage.getItem(BETA) === "1"; } catch (e) { return false; } };
  const h0 = cuzdan.hesap();
  if (h0 && DAVETLI.includes(h0.toLowerCase())) { try { localStorage.setItem(BETA, "1"); } catch (e) { /* blocked */ } }
  if (!betaVar() && !P.kayit()) {
    const kapi = el("div", { sinif: "pwp-kart" }, [el("h2", { yazi: "Private beta" }), el("p", { yazi: "Pulse Wallet is in a closed beta. Connect the invited wallet to enter." }),
      el("div", { sinif: "pwp-dugmeler" }, [el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: h0 ? "This wallet is not invited" : "Connect wallet", on: { click: () => { if (!h0) window.dispatchEvent(new CustomEvent("cuzdan-yok")); } } })])]);
    kok.append(el("h1", { yazi: "Pulse Wallet" }), kapi);
    const birak = cuzdan.dinle(() => { birak(); if (kok.isConnected) window.dispatchEvent(new HashChangeEvent("hashchange")); });
    return kok;
  }
  const ciz2 = async () => {
    kok.append(el("h1", { yazi: "Pulse Wallet" }),
      el("div", { sinif: "pwp-onizleme", yazi: "PREVIEW — not announced yet. Try it with a few dollars only. Your key stays in this browser: ARC PULSE cannot see it, move it or recover it." }));
    const k = P.kayit();
    if (!k) {
      const pk = await P.passkeyDestekli();
      kok.append(el("div", { sinif: "pwp-kart" }, [
        el("h2", { yazi: "A wallet that opens with your phone's lock" }),
        el("ul", { sinif: "pwp-madde" }, [
          el("li", { yazi: "Made on this phone, in this browser. Nothing is sent to ARC PULSE or anyone." }),
          el("li", { yazi: "Every buy, sell or signature asks Face ID / fingerprint, and shows what you sign." }),
          el("li", { yazi: "Works on Arc, Base, Arbitrum, Ethereum, BNB, Avalanche, Monad, HyperEVM and Robinhood." }),
          el("li", { yazi: "If you lose this phone or clear the browser, only your recovery phrase brings the wallet back. Write it down." })]),
        el("div", { sinif: "pwp-dugmeler" }, [
          pk ? el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Create with Face ID / fingerprint", on: { click: async () => {
            try { bilgi("Confirm with your phone's lock…"); await P.olustur({ yontem: "passkey" }); yenile(); } catch (e) { hata(e); } } } }) : "",
          el("button", { sinif: "dugme " + (pk ? "dugme--sade" : "dugme--marka"), attr: { type: "button" }, yazi: "Create with a password", on: { click: async () => {
            const s = prompt("Choose a password (8+ characters). It cannot be reset:"); if (s == null) return;
            const s2 = prompt("Type it again:"); if (s2 !== s) return hata(new Error("The two passwords differ."));
            try { bilgi("Creating…"); await P.olustur({ yontem: "sifre", sifre: s }); yenile(); } catch (e) { hata(e); } } } }),
          el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Import a recovery phrase", on: { click: async () => {
            const ifade = prompt("Your 12 or 24 recovery words, separated by spaces:"); if (!ifade) return;
            const y = pk && confirm("Lock it with Face ID / fingerprint? (Cancel = use a password)") ? "passkey" : "sifre";
            const s = y === "sifre" ? prompt("Choose a password (8+ characters):") : null; if (y === "sifre" && s == null) return;
            try { bilgi("Importing…"); await P.olustur({ yontem: y, sifre: s, ifade }); yenile(); } catch (e) { hata(e); } } } }),
        ]),
        pk ? "" : el("div", { sinif: "pwp-uyari", yazi: "This browser has no phone-lock (passkey) support, so a password protects the wallet." }),
        durum]));
      return;
    }
    /* the wallet on this device */
    const bakiyeler = el("div", { sinif: "pwp-bakiye" }, [el("div", {}, [el("span", { yazi: "Balances" }), el("b", { yazi: "reading…" })])]);
    const kullaniliyor = cuzdan.pulseMi && cuzdan.pulseMi();
    kok.append(el("div", { sinif: "pwp-kart" }, [
      el("h2", { yazi: "Your address" }),
      el("div", { sinif: "pwp-adres", yazi: k.adres }),
      el("p", { yazi: "Send USDC here on any supported chain (the same address on all of them). Locked with " + (k.yontem === "passkey" ? "your phone's lock (passkey)." : "a password.") }),
      el("div", { sinif: "pwp-dugmeler" }, [
        el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Copy address", on: { click: (e) => { navigator.clipboard && navigator.clipboard.writeText(k.adres); e.target.textContent = "Copied ✓"; } } }),
        kullaniliyor ? el("span", { sinif: "dugme dugme--sade", yazi: "In use on ARC PULSE ✓" })
          : el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Use it on ARC PULSE", on: { click: async () => { try { await cuzdan.pulseBagla(sifreSor); bilgi("Pulse Wallet is now the site's wallet: Trade, Perps and Launch use it."); yenile(); } catch (e) { hata(e); } } } }),
      ]),
      bakiyeler,
    ]));
    if (!k.yedeklendi) kok.append(el("div", { sinif: "pwp-kart" }, [el("h2", { yazi: "⚠ Back up your recovery phrase" }), el("p", { yazi: "Without it, a lost phone or a cleared browser means a lost wallet. Nobody, ARC PULSE included, can restore it." })]));
    const ifadeYer = el("div");
    kok.append(el("div", { sinif: "pwp-kart" }, [
      el("h2", { yazi: "Recovery phrase" }),
      el("p", { yazi: "12 words that ARE the wallet. Write them on paper. Never type them into a site or send them to anyone — ARC PULSE will never ask." }),
      el("div", { sinif: "pwp-dugmeler" }, [el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Show recovery phrase", on: { click: async () => {
        try { const f = await P.ifadeGoster(sifreSor); ifadeYer.replaceChildren(el("div", { sinif: "pwp-ifade" }, f.split(" ").map((w, i) => el("span", {}, [el("i", { yazi: String(i + 1) }), w]))),
          el("button", { sinif: "dugme dugme--sade", attr: { type: "button", style: "margin-top:8px" }, yazi: "Hide", on: { click: () => ifadeYer.replaceChildren() } })); } catch (e) { hata(e); } } } })]),
      ifadeYer]));
    kok.append(el("div", { sinif: "pwp-kart" }, [
      el("h2", { yazi: "Remove from this device" }),
      el("p", { yazi: "Deletes the wallet from this browser. The money stays on the chain, but only your recovery phrase can open it again." }),
      el("div", { sinif: "pwp-dugmeler" }, [el("button", { sinif: "dugme dugme--sade", attr: { type: "button", style: "color:var(--satis)" }, yazi: "Remove Pulse Wallet", on: { click: async () => {
        const y = prompt('This cannot be undone. Type REMOVE to delete the wallet from this device:'); if (y !== "REMOVE") return;
        if (cuzdan.pulseMi && cuzdan.pulseMi()) await cuzdan.kes();
        P.sil(); yenile(); } } })])]));
    kok.append(durum);
    /* balances: USDC on each chain, plus Arc native (its gas is USDC) */
    (async () => {
      const { JsonRpcProvider, Contract, formatUnits } = await import("../../vendor/ethers.min.js");
      const RPC = { 5042: "https://arc-rpc.publicnode.com", 8453: "https://base-rpc.publicnode.com", 42161: "https://arbitrum-one-rpc.publicnode.com", 1: "https://ethereum-rpc.publicnode.com", 56: "https://bsc-rpc.publicnode.com", 43114: "https://avalanche-c-chain-rpc.publicnode.com" };
      const s = await Promise.all(Object.keys(USDC).map(async (id) => {
        try { const c = new Contract(USDC[id], ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"], new JsonRpcProvider(RPC[id], Number(id), { staticNetwork: true }));
          const [b, d] = await Promise.all([c.balanceOf(k.adres), c.decimals()]); return [P.PW_AD[id], Number(formatUnits(b, d))]; } catch (e) { return [P.PW_AD[id], null]; }
      }));
      bakiyeler.replaceChildren(...s.map(([ad, v]) => el("div", {}, [el("span", { yazi: ad + " · USDC" }), el("b", { yazi: v == null ? "—" : "$" + v.toFixed(2) })])));
    })().catch(() => {});
  };
  await ciz2();
  return kok;
}
