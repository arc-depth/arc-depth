/* ===========================================================================
 * gorunum/hl-para.js — "Deposit and withdraw" on #/perps/trade (15 Nov 2026, v2)
 *
 * Deposit: from the visitor's wallet on Arc, Arbitrum, Base and the site's other EVM chains, USDC
 * (or the chain's gas token) -> relay.link -> USDC in the visitor's OWN Hyperliquid perps account
 * (hl-yatir.js checks every quote: recipient = this address, destination = Hyperliquid perps USDC).
 * The quote (what arrives, fees, time) is shown before anything is signed; quotes older than a
 * minute must be fetched again.
 * Withdraw: Hyperliquid's withdraw3, signed by the main wallet, to the SAME address on Arbitrum only
 * (the address is not editable). Hyperliquid keeps $1.
 * ARC PULSE takes no fee on either.
 * =========================================================================== */

import { el, panel, not } from "../ui.js";
import * as hl from "../hl.js";
import * as Y from "../hl-yatir.js";

const usd = (x) => (x == null || !isFinite(x) ? "–" : "$" + Number(x).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const kisaAdres = (a) => a.slice(0, 6) + "…" + a.slice(-4);
const disBag = (href, yazi) => el("a", { sinif: "dugme dugme--sade dugme--kucuk", attr: { href, target: "_blank", rel: "noopener noreferrer" }, yazi });

export function paraPaneli({ kim, cuzdan, hesapYukle }) {
  let H = null;
  const durumKutu = () => el("div", { sinif: "hl-durum", attr: { role: "status", "aria-live": "polite" } });
  const yaz = (d, yazi, tur = "") => { d.textContent = yazi || ""; d.className = "hl-durum" + (tur === "hata" ? " hl-eks" : tur === "ok" ? " hl-art" : ""); };

  /* ---- deposit ---- */
  const simdiki = parseInt(cuzdan.zincirId() || "0", 16);
  const zincirSec = el("select", { sinif: "girdi", attr: { "aria-label": "Deposit from chain" } }, Y.KAYNAKLAR.map((k) => el("option", { attr: { value: String(k.id) }, yazi: k.ad })));
  zincirSec.value = String(Y.kaynakBul(simdiki) ? simdiki : 5042);
  const paraSec = el("select", { sinif: "girdi", attr: { "aria-label": "Token" } });
  const paraCiz = () => {
    const k = Y.kaynakBul(zincirSec.value);
    paraSec.replaceChildren(el("option", { attr: { value: "usd" }, yazi: k.sembol }), k.yerel ? el("option", { attr: { value: "yerel" }, yazi: k.yerel }) : null);
  };
  paraCiz();
  const miktar = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Amount, e.g. 25", "aria-label": "Deposit amount" } });
  const teklifDug = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Get quote" });
  const teklifKutu = el("div", { sinif: "hl-onizle", attr: { hidden: true } });
  const yDurum = durumKutu();
  let T = null, Tzaman = 0, mesgul = false;
  const sifirla = () => { T = null; teklifKutu.hidden = true; };
  zincirSec.addEventListener("change", () => { paraCiz(); sifirla(); yaz(yDurum, ""); });
  [paraSec].forEach((x) => x.addEventListener("change", sifirla));
  miktar.addEventListener("input", sifirla);

  teklifDug.addEventListener("click", async () => {
    if (mesgul) return;
    const k = Y.kaynakBul(zincirSec.value), yerel = paraSec.value === "yerel";
    sifirla(); yaz(yDurum, "Asking relay.link for a quote…");
    try {
      T = await Y.teklif(k, kim, miktar.value, yerel); Tzaman = Date.now();
      const ad = yerel ? k.yerel : k.sembol;
      const satir = (a, b) => el("div", { attr: { style: "display:flex;justify-content:space-between;gap:10px" } }, [el("span", { yazi: a }), el("strong", { yazi: b })]);
      const gonder = el("button", { sinif: "dugme dugme--marka dugme--tam", attr: { type: "button" }, yazi: "Deposit " + T.odenen + " " + ad });
      const azMi = T.bakiye != null && T.bakiye < Number(miktar.value);
      teklifKutu.replaceChildren(...[
        satir("You send", T.odenen + " " + ad + " on " + k.ad + " (≈ " + usd(T.odenenUsd) + ")"),
        satir("Arrives in your Hyperliquid account", "≈ " + T.alinan.toFixed(2) + " USDC (at least " + T.enAz.toFixed(2) + ")"),
        satir("relay.link fees and gas", "≈ " + usd(T.ucret)),
        satir("Time", T.sure ? "≈ " + T.sure + " s after your transaction confirms" : "usually under a minute"),
        T.bakiye != null ? satir("Your " + ad + " on " + k.ad, T.bakiye.toLocaleString("en-US", { maximumFractionDigits: 6 })) : null,
        not("To your own Hyperliquid account: " + kim + ". If this is the first deposit to this account, Hyperliquid keeps about $1 to activate it. relay.link is a separate service; ARC PULSE adds no fee to deposits. Your wallet switches to " + k.ad + " and asks you to approve " + ad + (yerel ? "" : " (exactly this amount)") + " and then send it.", "bilgi"),
        azMi ? not("Your balance on " + k.ad + " is lower than this amount.", "uyari") : null,
        gonder].filter(Boolean));
      teklifKutu.hidden = false;
      yaz(yDurum, "");
      gonder.addEventListener("click", async () => {
        if (Date.now() - Tzaman > 60000) { yaz(yDurum, "This quote is more than a minute old. Get a new quote.", "hata"); return; }
        mesgul = true; gonder.disabled = true; teklifDug.disabled = true;
        try {
          const izle = await Y.ode(T, { cuzdan, durum: (x) => yaz(yDurum, x) });
          yaz(yDurum, "Deposit delivered to your Hyperliquid account." + (izle ? " Receipt: " + izle : ""), "ok");
          teklifKutu.hidden = true; miktar.value = "";
          setTimeout(hesapYukle, 1500);
        } catch (e) {
          const m = (e && e.message) || String(e);
          yaz(yDurum, e && (e.code === 4001 || /user (rejected|denied)|rejected the request/i.test(m)) ? "You declined in your wallet. Nothing more was sent." : m, "hata");
          gonder.disabled = false;
        }
        mesgul = false; teklifDug.disabled = false;
      });
    } catch (e) { yaz(yDurum, (e && e.message) || String(e), "hata"); }
  });

  const yatir = el("div", { sinif: "yigin yigin--sik" }, [
    el("h3", { sinif: "panel__baslik", attr: { style: "margin:0;font-size:14px" }, yazi: "Deposit from any chain" }),
    el("div", { sinif: "hl-sec" }, [zincirSec, paraSec]),
    miktar, teklifDug, teklifKutu, yDurum,
    el("div", { sinif: "hl-bag" }, [disBag("https://app.hyperliquid.xyz/portfolio", "Or deposit on Hyperliquid ↗")]),
  ]);

  /* ---- withdraw ---- */
  const cekMiktar = el("input", { sinif: "girdi", attr: { type: "text", inputmode: "decimal", autocomplete: "off", placeholder: "Amount in USDC, at least 2", "aria-label": "Withdraw amount" } });
  const enCok = el("button", { sinif: "dugme dugme--sade dugme--kucuk", attr: { type: "button" }, yazi: "Max" });
  const cekIpucu = el("div", { sinif: "hl-ipucu" });
  /* 16 Nov 2026 (owner: "USDC olarak Arc'a geçsin"): where it goes — USDC on Arc through relay.link (default, ~$0.02),
     or Hyperliquid's own withdrawal to Arbitrum ($1) */
  const hedef = el("select", { sinif: "girdi", attr: { "aria-label": "Withdraw to" } }, [
    el("option", { attr: { value: "arc" }, yazi: "To USDC on Arc · one signature (≈ $1 fee)" }),
    el("option", { attr: { value: "arc2" }, yazi: "To USDC on Arc · two signatures (≈ $0.03 fee)" }),
    el("option", { attr: { value: "arb" }, yazi: "To USDC on Arbitrum (Hyperliquid, $1 fee)" })]);
  const cekDug = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Withdraw" });
  const arcMi = () => hedef.value === "arc" || hedef.value === "arc2";
  const tekMi = () => hedef.value === "arc";
  const cekOnay = el("div", { sinif: "hl-onizle", attr: { hidden: true } });
  const cDurum = durumKutu();
  const asagi2 = (x) => Math.floor(x * 100 + 1e-9) / 100;
  const ipucuCiz = () => {
    const a = Number(cekMiktar.value);
    cekIpucu.textContent = "Available to withdraw: " + (H ? usd(H.cekilebilir) : "–") + ". Goes to " + kisaAdres(kim) + " (your own address) on " + (arcMi() ? "Arc" : "Arbitrum") + "." +
      (arcMi() ? (tekMi() ? " One signature; about $1 goes to fees (Hyperliquid charges $1 to send to a new address)." : " Cheapest, but some phone wallets do not show the first of the two signatures.") + " You see the exact amount before you sign." : a >= 2 ? " You receive ≈ " + usd(a - hl.CEK_UCRETI) + " USDC after Hyperliquid's $" + hl.CEK_UCRETI + " fee." : " Hyperliquid keeps $" + hl.CEK_UCRETI + ".");
  };
  cekMiktar.addEventListener("input", () => { cekOnay.hidden = true; ipucuCiz(); });
  hedef.addEventListener("change", () => { cekOnay.hidden = true; ipucuCiz(); });
  enCok.addEventListener("click", () => { if (H) { cekMiktar.value = String(asagi2(H.cekilebilir)); cekOnay.hidden = true; ipucuCiz(); } });
  cekDug.addEventListener("click", async () => {
    const a = asagi2(Number(cekMiktar.value));
    if (arcMi()) {
      if (!(a >= 1)) { yaz(cDurum, "Enter at least 1 USDC.", "hata"); return; }
      if (!H || a > H.cekilebilir + 1e-9) { yaz(cDurum, "That is more than you can withdraw now (" + (H ? usd(H.cekilebilir) : "–") + "). Margin held by open positions and orders cannot be withdrawn.", "hata"); return; }
      yaz(cDurum, "Getting the exact amount from relay.link…");
      let q;
      try { q = await hl.arcaCekTeklif(kim, a, tekMi()); } catch (e) { yaz(cDurum, e.message, "hata"); return; }
      const gelen = Number(q.details.currencyOut.amountFormatted);
      const evet = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Sign and send" });
      const hayir = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Keep", on: { click: () => { cekOnay.hidden = true; } } });
      cekOnay.replaceChildren(el("div", { yazi: "Send " + a + " USDC from Hyperliquid to " + kisaAdres(kim) + " (you) on Arc. You receive ≈ " + usd(gelen) + " USDC on Arc (fees " + usd(a - gelen) + "), usually within a minute. Your wallet signs " + (tekMi() ? "once" : "twice") + ", no gas." }), el("div", { sinif: "hl-sec" }, [hayir, evet]));
      cekOnay.hidden = false; yaz(cDurum, "");
      evet.addEventListener("click", async () => {
        evet.disabled = true; hayir.disabled = true;
        try {
          const q2 = await hl.arcaCekTeklif(kim, a, tekMi());   // a fresh quote: the first one may be a minute old
          const s = await hl.arcaCekGonder(kim, q2, (m) => yaz(cDurum, m), () => new Promise((tamam) => {
            const b = el("button", { sinif: "dugme dugme--marka", attr: { type: "button", style: "width:100%;margin-top:8px" }, yazi: "Step 2 of 2: sign to send the USDC", on: { click: () => { b.remove(); tamam(); } } });
            yaz(cDurum, "Signature 1 of 2 done ✓ Tap the button to sign the transfer."); cDurum.after(b);
          }));
          yaz(cDurum, s === "arrived" ? "Done ✓ ≈ " + usd(Number(q2.details.currencyOut.amountFormatted)) + " USDC is in your wallet on Arc." : "Sent ✓ relay.link is paying it out on Arc; it usually lands within a minute.", "ok");
          cekOnay.hidden = true; cekMiktar.value = "";
          setTimeout(hesapYukle, 1500);
        } catch (e) { yaz(cDurum, (e && e.message) || String(e), "hata"); evet.disabled = false; hayir.disabled = false; }
      });
      return;
    }
    if (!(a >= 2)) { yaz(cDurum, "The smallest withdrawal here is 2 USDC (Hyperliquid keeps $1).", "hata"); return; }
    if (!H || a > H.cekilebilir + 1e-9) { yaz(cDurum, "That is more than you can withdraw now (" + (H ? usd(H.cekilebilir) : "–") + "). Margin held by open positions and orders cannot be withdrawn.", "hata"); return; }
    const miktarYazi = String(a);
    const evet = el("button", { sinif: "dugme dugme--satis", attr: { type: "button" }, yazi: "Sign withdrawal" });
    const hayir = el("button", { sinif: "dugme dugme--sade", attr: { type: "button" }, yazi: "Keep", on: { click: () => { cekOnay.hidden = true; } } });
    cekOnay.replaceChildren(el("div", { yazi: "Withdraw " + miktarYazi + " USDC from Hyperliquid to " + kim + " on Arbitrum. You receive ≈ " + usd(a - hl.CEK_UCRETI) + " (Hyperliquid keeps $" + hl.CEK_UCRETI + "), usually within a few minutes. Your wallet signs (no gas)." }), el("div", { sinif: "hl-sec" }, [hayir, evet]));
    cekOnay.hidden = false; yaz(cDurum, "");
    evet.addEventListener("click", async () => {
      evet.disabled = true; hayir.disabled = true; yaz(cDurum, "Confirm the withdrawal in your wallet…");
      try {
        await hl.cekGonder(kim, miktarYazi);
        yaz(cDurum, "Withdrawal accepted by Hyperliquid. The USDC arrives on Arbitrum at your address in a few minutes. To move it to another chain afterwards, use relay.link.", "ok");
        cekOnay.hidden = true; cekMiktar.value = "";
        setTimeout(hesapYukle, 1500);
      } catch (e) { yaz(cDurum, (e && e.message) || String(e), "hata"); evet.disabled = false; hayir.disabled = false; }
    });
  });
  ipucuCiz();
  const cek = el("div", { sinif: "yigin yigin--sik" }, [
    el("h3", { sinif: "panel__baslik", attr: { style: "margin:0;font-size:14px" }, yazi: "Withdraw" }),
    el("div", { sinif: "hl-kal" }, [cekMiktar, enCok]), hedef, cekIpucu, cekDug, cekOnay, cDurum,
    el("div", { sinif: "hl-bag" }, [disBag("https://relay.link/bridge", "Bridge from Arbitrum to another chain (relay.link) ↗")]),
  ]);

  const kutu = panel("Deposit and withdraw", el("div", { sinif: "hl-para-izgara" }, [yatir, cek]));
  kutu.classList.add("hl-para");
  /* 16 Nov 2026: the account summary's "Move to Hyperliquid" opens this with the chain and amount filled in */
  const doldur = (id, tutar) => { zincirSec.value = String(id); paraCiz(); paraSec.value = "usd"; miktar.value = String(tutar); sifirla(); yaz(yDurum, "Press Get quote: you will see what arrives before you sign."); kutu.scrollIntoView({ behavior: "smooth", block: "start" }); };
  /* 16 Nov 2026 (owner: "burda para çekme yok"): the summary's Withdraw opens this with the whole available amount */
  const cekAc = () => { if (H) cekMiktar.value = String(asagi2(H.cekilebilir)); cekOnay.hidden = true; ipucuCiz(); cek.scrollIntoView({ behavior: "smooth", block: "center" }); setTimeout(() => cekMiktar.focus({ preventScroll: true }), 400); };
  return { panel: kutu, doldur, cekAc, guncelle(h) { H = h; if (document.activeElement !== cekMiktar) ipucuCiz(); } };
}
