/* ===========================================================================
 * cuzdan-varlik.js — what the connected wallets hold, on every chain at once (16 Nov 2026; owner: "cüzdan bağlandığı
 * anda tüm zincirler bağlı… alınmış tokenler etkilenmesin"). Nothing depends on the network the wallet is on: each
 * chain is read through its own public RPC.
 *
 *   - the dollar token (USDC / USDG / USDCe) on every EVM chain we serve;
 *   - tokens bought through ARC PULSE (remembered in THIS browser only, localStorage "arcpulse-tutulan": chain + address,
 *     never sent anywhere) — so a DRB bought on Base or a GTA6 bought on Solana shows up wherever the wallet is;
 *   - with a Solana address (linked wallet or typed): SOL, USDC and the remembered Solana tokens (their token accounts,
 *     read one by one: the free RPC refuses "list every token of this owner").
 * Prices: GeckoTerminal's public simple price endpoint.
 * =========================================================================== */
const TUTULAN = "arcpulse-tutulan";
const SOL_RPC = "https://solana-rpc.publicnode.com";
const SOL_USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export function hatirla(t) {
  try {
    const l = JSON.parse(localStorage.getItem(TUTULAN) || "[]").filter((x) => !(x.z === t.z && x.a.toLowerCase() === String(t.a).toLowerCase()));
    l.unshift({ z: t.z, a: t.a, s: t.s, d: t.d, g: t.g });
    localStorage.setItem(TUTULAN, JSON.stringify(l.slice(0, 60)));
  } catch (e) { /* storage blocked: the token is still in the wallet, only not listed here */ }
}
export const hatirlanan = () => { try { return JSON.parse(localStorage.getItem(TUTULAN) || "[]"); } catch (e) { return []; } };
export function solAdresi() {
  try { const a = localStorage.getItem("arcpulse-sol-adres"); return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a || "") ? a : null; } catch (e) { return null; }
}

const post = (url, govde) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((r) => r.json());
const zaman = (p, ms = 9000) => Promise.race([p, new Promise((_, r) => setTimeout(() => r(new Error("timeout")), ms))]);
async function fiyatlar(gecko, adresler) {
  if (!adresler.length) return {};
  const j = await zaman(fetch("https://api.geckoterminal.com/api/v2/simple/networks/" + gecko + "/token_price/" + adresler.slice(0, 30).join(",")).then((r) => r.json())).catch(() => null);
  const p = (j && j.data && j.data.attributes && j.data.attributes.token_prices) || {};
  const o = {}; for (const [k, v] of Object.entries(p)) o[k.toLowerCase()] = Number(v); return o;
}

/** every holding worth showing: [{ zincir, zk, ad, sembol, miktar, fiyat, deger, href }] */
export async function varliklar(evm, sol) {
  const V = (await import("./gorunum/vitrin.js")).borsaYardim;
  const satirlar = [];
  const hat = hatirlanan();
  /* EVM: dollars + remembered tokens, per chain, in parallel */
  if (evm) {
    const veri = "0x70a08231" + evm.toLowerCase().slice(2).padStart(64, "0");
    await Promise.all(V.evmler().map(async (ag) => {
      const z = V.ZINCIRLER.find((x) => x.relay === ag.id);
      const toks = hat.filter((x) => z && x.z === z.k);
      const istek = [{ a: ag.dolar, s: ag.dolarSembol || "USDC", d: ag.anahtar === "bsc" ? 18 : 6, dolar: true }, ...toks.map((x) => ({ a: x.a, s: x.s, d: x.d || 18, g: x.g }))];
      const sonuc = await Promise.all(istek.map((x) => zaman(post(ag.rpc, { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: x.a, data: veri }, "latest"] })).then((r) => (r && r.result && r.result !== "0x" ? BigInt(r.result) : 0n)).catch(() => 0n)));
      const fp = await fiyatlar(z ? z.gecko : "", istek.filter((x, i) => !x.dolar && sonuc[i] > 0n).map((x) => x.a));
      istek.forEach((x, i) => {
        const m = Number(sonuc[i]) / 10 ** x.d; if (!(m > 0)) return;
        const f = x.dolar ? 1 : fp[x.a.toLowerCase()] || null;
        if (x.dolar && m < 0.01) return;
        satirlar.push({ zincir: ag.ad, zk: z ? z.k : ag.anahtar, ad: x.s, sembol: x.s, miktar: m, fiyat: f, deger: f != null ? m * f : null, href: x.dolar ? null : "#/terminal?z=" + (z ? z.k : "") + "&a=" + x.a, resim: x.g, dolar: !!x.dolar });
      });
    }));
  }
  /* Solana */
  if (sol) {
    try {
      const { PublicKey, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } = await import("../vendor/solana.mjs");
      const T22 = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"), sahip = new PublicKey(sol);
      const toks = [{ a: SOL_USDC, s: "USDC", d: 6, dolar: true }, ...hat.filter((x) => x.z === "solana").map((x) => ({ a: x.a, s: x.s, d: x.d || 6, g: x.g }))];
      const hesaplar = toks.flatMap((x) => [TOKEN_PROGRAM_ID, T22].map((p) => getAssociatedTokenAddressSync(new PublicKey(x.a), sahip, false, p).toBase58()));
      const [bak, coklu] = await Promise.all([zaman(post(SOL_RPC, { jsonrpc: "2.0", id: 1, method: "getBalance", params: [sol] })),
        zaman(post(SOL_RPC, { jsonrpc: "2.0", id: 1, method: "getMultipleAccounts", params: [hesaplar, { encoding: "base64" }] }))]);
      const miktar = (v) => { if (!v || !v.data) return 0n; const b = Uint8Array.from(atob(v.data[0]), (c) => c.charCodeAt(0)); return b.length >= 72 ? new DataView(b.buffer).getBigUint64(64, true) : 0n; };
      const degerler = (coklu.result && coklu.result.value) || [];
      const fp = await fiyatlar("solana", ["So11111111111111111111111111111111111111112", ...toks.filter((x) => !x.dolar).map((x) => x.a)]);
      const solM = ((bak.result && bak.result.value) || 0) / 1e9;
      if (solM > 0.0001) satirlar.push({ zincir: "Solana", zk: "solana", ad: "SOL", sembol: "SOL", miktar: solM, fiyat: fp["so11111111111111111111111111111111111111112"] || null, deger: fp["so11111111111111111111111111111111111111112"] ? solM * fp["so11111111111111111111111111111111111111112"] : null, href: null });
      toks.forEach((x, i) => {
        const m = Number(miktar(degerler[2 * i]) + miktar(degerler[2 * i + 1])) / 10 ** x.d; if (!(m > 0)) return;
        const f = x.dolar ? 1 : fp[x.a.toLowerCase()] || null;
        satirlar.push({ zincir: "Solana", zk: "solana", ad: x.s, sembol: x.s, miktar: m, fiyat: f, deger: f != null ? m * f : null, href: x.dolar ? null : "#/terminal?z=solana&a=" + x.a, resim: x.g, dolar: !!x.dolar });
      });
    } catch (e) { /* Solana unreadable now: the rest still shows */ }
  }
  return satirlar.sort((a, b) => (b.deger || 0) - (a.deger || 0));
}
