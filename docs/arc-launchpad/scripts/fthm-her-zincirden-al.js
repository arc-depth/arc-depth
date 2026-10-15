"use strict";
/* ===========================================================================
 * fthm-her-zincirden-al.js — buy FTHM from any relay chain with that chain's
 *                            USDC, in one signature, delivered back there
 *
 *   node scripts/fthm-her-zincirden-al.js <kaynak> <usdc> [--uygula]
 *   e.g. node scripts/fthm-her-zincirden-al.js base 1.5 --uygula
 *
 * HOW
 *   relay.link bridges the USDC to Arc and, in the same order, executes two
 *   calls on Arc with the bridged dollars: approve the FTHM gate (KapiAg,
 *   one address on every chain), then KapiAg.alVeGonder — buy FTHM in Arc's
 *   pool and send it over LayerZero to the buyer on the chain they paid
 *   from. Arc's gas is USDC, so the LayerZero fee is paid from the same
 *   dollars. One market (Arc's pool), one price, no pool needed elsewhere.
 * The app builds the same request in the browser; this script is the
 * measured proof and the operator's tool. Record: rapor/fthm-her-zincir.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, Interface, zeroPadValue } = require("ethers");
const { EVM } = require("./zincirler");

const KAPI = "0x060BD07354462eBa410164aBaB6965fe289d2e80";
const ADAPTOR = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const IKIZ = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const RELAY = "https://api.relay.link";
const [kaynakAd, usdcStr] = process.argv.slice(2);
const UYGULA = process.argv.includes("--uygula");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const z = EVM[kaynakAd];
  if (!z || !usdcStr) throw new Error("kullanim: <kaynak> <usdc> [--uygula]");
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const w = new Wallet(pk, new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true }));
  const arc = new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true });
  const toplam = BigInt(Math.round(Number(usdcStr) * 1e6));
  const [ucret] = await new Contract(ADAPTOR, ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))"], arc)
    .quoteSend([z.eid, zeroPadValue(w.address, 32), 10n ** 22n, 0n, "0x", "0x", "0x"], false);
  const deger = (ucret * 12n) / 10n;                       // native USDC, 18 decimals; surplus refunded
  const degerUsdc = deger / 10n ** 12n + 1n;
  const girdi = toplam - degerUsdc;
  if (girdi <= 0n) throw new Error("tutar LayerZero ucretini karsilamiyor");
  const e = new Interface(["function approve(address,uint256) returns (bool)"]);
  const k = new Interface(["function alVeGonder(uint32,uint256,uint256,address,bytes) payable returns (uint256)"]);
  const govde = { user: w.address, recipient: w.address, originChainId: z.chainId, destinationChainId: 5042,
    originCurrency: z.dolar.adres, destinationCurrency: "0x0000000000000000000000000000000000000000",
    amount: (toplam * 10n ** 12n).toString(), tradeType: "EXACT_OUTPUT", txsGasLimit: 1500000,
    txs: [{ to: "0x3600000000000000000000000000000000000000", data: e.encodeFunctionData("approve", [KAPI, girdi]), value: "0" },
      { to: KAPI, data: k.encodeFunctionData("alVeGonder", [z.eid, girdi, 1n, w.address, "0x"]), value: deger.toString() }] };
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  if (!q.steps) throw new Error("teklif yok: " + JSON.stringify(q).slice(0, 300));
  console.log(z.ad + " -> Arc -> " + z.ad + "  giren " + q.details.currencyIn.amountFormatted + " " + q.details.currencyIn.currency.symbol +
    "  Arc'ta alim " + Number(girdi) / 1e6 + " USDC, LZ " + Number(ucret) / 1e18 + " USDC" + (UYGULA ? "" : "  (kuru)"));
  if (!UYGULA) return;
  const ikiz = new Contract(IKIZ, ["function balanceOf(address) view returns (uint256)"], w.provider);
  const once = await ikiz.balanceOf(w.address);
  for (const adim of q.steps) for (const it of adim.items || []) {
    if (adim.kind !== "transaction") continue;
    const d = it.data;
    const t = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
    let m = null; while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(t.hash).catch(() => null); }
    console.log("  " + adim.id + " " + t.hash + " durum " + m.status);
  }
  for (let i = 0; i < 90; i++) {
    await bekle(8000);
    const s = await ikiz.balanceOf(w.address);
    if (s > once) {
      console.log("  " + z.ad + "'de FTHM geldi: " + Number(s - once) / 1e18);
      const f = path.join(__dirname, "..", "rapor", "fthm-her-zincir.json");
      const kay = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : [];
      kay.push({ zaman: new Date().toISOString(), kaynak: kaynakAd, usdc: usdcStr, fthm: Number(s - once) / 1e18 });
      fs.writeFileSync(f, JSON.stringify(kay, null, 1));
      return;
    }
  }
  console.log("  zaman asimi: FTHM henuz gelmedi");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
