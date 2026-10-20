"use strict";
/* ===========================================================================
 * bekci-doldur.js — keeper task 3: fill the vaults' auctions when it pays
 *
 *   node scripts/bekci-doldur.js            dry: every open auction, its ask now,
 *                                           the market cost, and when it turns
 *   node scripts/bekci-doldur.js --uygula   fill the ones that pay
 *
 * A vault's buy auction offers dollars for at least `istenen` units of the
 * asset; the ask halves every 30 minutes. The keeper fills it when it can
 * buy those units on the market (relay.link, same-chain swap, which routes
 * through the chain's own DEXes) for less than the dollars it receives, by
 * at least KAR. A sell auction (a redemption) offers units for at least
 * `istenen` dollars; the keeper fills it when selling the units brings more
 * than it pays. The contract checks every fill; the keeper only chooses
 * when. Its own wallet (BEKCI_PRIVATE_KEY) holds a little USDC per chain as
 * working capital, which comes back with each fill.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, NonceManager, MaxUint256 } = require("ethers");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const RELAY = "https://api.relay.link";
const SIFIR = "0x0000000000000000000000000000000000000000";
const KAR = 0.01;                                  // fill only with at least 1% to spare
const YARILANMA = 30 * 60;
const AG = {
  arc: { ad: "Arc", domain: 26, id: 5042, rpc: "https://arc-rpc.publicnode.com", usdc: "0x3600000000000000000000000000000000000000", relayUsdc: SIFIR, dec: 6 },
  base: { ad: "Base", domain: 6, id: 8453, rpc: "https://base-rpc.publicnode.com", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", dec: 6 },
  arbitrum: { ad: "Arbitrum", domain: 3, id: 42161, rpc: "https://arb1.arbitrum.io/rpc", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", dec: 6 },
  avalanche: { ad: "Avalanche", domain: 1, id: 43114, rpc: "https://avalanche-c-chain-rpc.publicnode.com", usdc: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", dec: 6 },
  monad: { ad: "Monad", domain: 15, id: 143, rpc: "https://rpc.monad.xyz", usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603", dec: 6 },
  hyperevm: { ad: "HyperEVM", domain: 19, id: 999, rpc: "https://rpc.hyperliquid.xyz/evm", usdc: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", dec: 6 },
  bsc: { ad: "BNB", domain: 17, id: 56, rpc: "https://bsc-rpc.publicnode.com", usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", dec: 18 },
  ethereum: { ad: "Ethereum", domain: 0, id: 1, rpc: "https://ethereum-rpc.publicnode.com", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", dec: 6 },
};
const KASA = ["function ihaleSayisi() view returns (uint256)",
  "function ihaleler(uint256) view returns (uint8 tur, uint64 launchId, address varlik, uint256 verilen, uint256 baslangic, uint64 baslama, uint32 hedefZincir, bytes32 alici, bool bitti)",
  "function istenen(uint256) view returns (uint256)", "function doldur(uint256,uint256)",
  "function usdcBakiye(uint64) view returns (uint256)", "function taahhut(uint64) view returns (uint256)"];
const ERC = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)",
  "function allowance(address,address) view returns (uint256)", "function symbol() view returns (string)", "function decimals() view returns (uint8)"];
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function teklif(z, kim, giren, cikan, miktar, tur) {
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    user: kim, recipient: kim, originChainId: z.id, destinationChainId: z.id, originCurrency: giren, destinationCurrency: cikan,
    amount: miktar.toString(), tradeType: tur }) }).then((x) => x.json()).catch((e) => ({ message: e.message }));
  return q.details ? q : null;
}

async function relayYap(w, q) {
  for (const adim of q.steps) for (const it of adim.items || []) {
    if (adim.kind !== "transaction") continue;
    const d = it.data;
    const t = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
    for (let i = 0; i < 40; i++) { const m = await w.provider.getTransactionReceipt(t.hash).catch(() => null); if (m) { if (m.status !== 1) throw new Error("takas geri dondu " + t.hash); break; } await bekle(1500); }
  }
}

(async () => {
  const d = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sepet.json"), "utf8")).zincir;
  const k = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(/^BEKCI_PRIVATE_KEY\s*=\s*(0x[0-9a-fA-F]{64})/m)[1];
  const ben = new Wallet(k).address;
  console.log("BEKCI DOLDUR  " + (UYGULA ? "UYGULA" : "KURU") + "  bekci " + ben + "  en az %" + KAR * 100 + " pay");
  let acik = 0, dolan = 0;
  for (const [ad, z] of Object.entries(AG)) {
    if (!d[ad]) continue;
    try {
      const p = new JsonRpcProvider(z.rpc, z.id, { staticNetwork: true });
      const w = new NonceManager(new Wallet(k, p));
      const kasa = new Contract(d[ad].SepetKasasi, KASA, w);
      const n = Number(await kasa.ihaleSayisi());
      const simdi = (await p.getBlock("latest")).timestamp;
      for (let id = n - 1; id >= Math.max(0, n - 40); id--) {
        const h = await kasa.ihaleler(id);
        if (h.bitti) continue;
        acik++;
        const varlik = new Contract(h.varlik, ERC, w);
        const [sem, dec, ist] = await Promise.all([varlik.symbol().catch(() => "?"), varlik.decimals().catch(() => 18), kasa.istenen(id)]);
        const birim = (x) => (Number(x) / 10 ** Number(dec)).toPrecision(5) + " " + sem;
        const dolar = (x) => "$" + (Number(x) / 10 ** z.dec).toFixed(4);
        const yas = simdi - Number(h.baslama);
        const usdcR = z.relayUsdc || z.usdc;
        if (Number(h.tur) === 1) {
          /* buy: what the vault pays now and the units it asks for that */
          const [ub, t] = await Promise.all([kasa.usdcBakiye(h.launchId), kasa.taahhut(h.launchId)]);
          const harca = t > 0n ? (h.verilen * ub) / t : 0n;
          const gerek = h.verilen > 0n ? (ist * harca) / h.verilen : 0n;
          const al = (gerek * 1005n) / 1000n + 1n;        // a hair over, for rounding in the swap
          const q = await teklif(z, ben, usdcR, h.varlik, al, "EXACT_OUTPUT");
          const maliyet = q ? BigInt(q.details.currencyIn.amount) / (z.relayUsdc === SIFIR ? 10n ** 12n : 1n) : null;
          const kazanc = maliyet != null ? Number(harca - maliyet) / Number(harca || 1n) : null;
          const sonraki = Math.ceil((yas + 1) / YARILANMA) * YARILANMA - yas;
          console.log("  " + z.ad.padEnd(9) + "#" + id + " ALIM  kasa " + dolar(harca) + " verir, " + birim(gerek) + " ister; piyasa " +
            (maliyet != null ? dolar(maliyet) : "teklif yok") + (kazanc != null ? "  pay %" + (kazanc * 100).toFixed(1) : "") + "  (" + Math.floor(yas / 60) + " dk, istek " + Math.ceil(sonraki / 60) + " dk sonra yarilanir)");
          if (kazanc == null || kazanc < KAR) continue;
          if (!UYGULA) { console.log("    (kuru) doldurulurdu"); continue; }
          const usdcBak = z.relayUsdc === SIFIR ? (await p.getBalance(ben)) / 10n ** 12n : await new Contract(z.usdc, ERC, p).balanceOf(ben);
          if (usdcBak < maliyet) { console.log("    sermaye yetmiyor: " + dolar(usdcBak)); continue; }
          await relayYap(w, q);
          const elde = await new Contract(h.varlik, ERC, p).balanceOf(ben);
          if ((await varlik.allowance(ben, d[ad].SepetKasasi)) < elde) await (await varlik.approve(d[ad].SepetKasasi, MaxUint256)).wait();
          const m = await (await kasa.doldur(id, elde)).wait();
          dolan++;
          console.log("    DOLDU " + m.hash + "  " + birim(elde) + " verildi, " + dolar(harca) + " alindi");
        } else {
          /* sell (a redemption): the units the vault offers against the dollars it asks */
          const q = await teklif(z, ben, h.varlik, usdcR, h.verilen, "EXACT_INPUT");
          const gelir = q ? BigInt(q.details.currencyOut.amount) / (z.relayUsdc === SIFIR ? 10n ** 12n : 1n) : null;
          const kazanc = gelir != null ? Number(gelir - ist) / Number(ist || 1n) : null;
          console.log("  " + z.ad.padEnd(9) + "#" + id + " SATIM kasa " + birim(h.verilen) + " verir, " + dolar(ist) + " ister; piyasa " +
            (gelir != null ? dolar(gelir) : "teklif yok") + (kazanc != null ? "  pay %" + (kazanc * 100).toFixed(1) : ""));
          if (kazanc == null || kazanc < KAR) continue;
          if (!UYGULA) { console.log("    (kuru) doldurulurdu"); continue; }
          const usdc = new Contract(z.usdc, ERC, w);
          if ((await usdc.balanceOf(ben)) < ist) { console.log("    sermaye yetmiyor"); continue; }
          if ((await usdc.allowance(ben, d[ad].SepetKasasi)) < ist) await (await usdc.approve(d[ad].SepetKasasi, MaxUint256)).wait();
          const m = await (await kasa.doldur(id, ist)).wait();
          await relayYap(w, await teklif(z, ben, h.varlik, usdcR, h.verilen, "EXACT_INPUT"));
          dolan++;
          console.log("    DOLDU " + m.hash + "  " + dolar(ist) + " odendi, birimler satildi");
        }
      }
    } catch (e) { console.log("  HATA " + z.ad + ": " + (e.shortMessage || e.message).slice(0, 160)); }
  }
  console.log("\n" + acik + " acik ihale, " + dolan + " dolduruldu");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
