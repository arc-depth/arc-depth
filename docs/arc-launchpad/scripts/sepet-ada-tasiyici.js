"use strict";
/* ===========================================================================
 * sepet-ada-tasiyici.js — the basket's relayer for BNB (and any chain
 *                         without CCTP USDC), with no bridge fee per order
 *
 *   node scripts/sepet-ada-tasiyici.js            dry run: routes, fees, what it would do
 *   node scripts/sepet-ada-tasiyici.js --uygula   send
 *
 * NETTING, NOT A BRIDGE PER ORDER
 *   This wallet keeps dollars on both sides (Dolar6 on BNB, USDC on Arc and
 *   the other chains) and pays each waiting order from its OWN balance on
 *   that chain (AdaKapisi.doldur). The dollars the order locked at home come
 *   back to it there, one for one (bildir). A launch from BNB moves the
 *   stock one way, a redemption paid on BNB the other: they cancel out.
 * BATCHES
 *   Every order queued for one chain goes in ONE LayerZero message (yolla),
 *   every receipt owed to one chain in one more (bildir), so the LayerZero
 *   fee is shared by the whole batch.
 * BRIDGE ONLY TO REBALANCE
 *   Only when the stock on one side runs out does it bridge, once and in
 *   bulk (at least YENIDEN_DENGE), by relay.link in one signature — the
 *   same road as FTHM (fthm-her-zincirden-al.js, mainnet 15 Oct 2026).
 *
 * The contracts never trust relay or this wallet: an order runs only with
 * dollars that arrived, and a lock opens only on the twin gate's receipt.
 * Addresses: dagitim-sepet.json (written by the basket deployment). Until it
 * exists, the dry run checks the relay routes with stand-in calls.
 * State: rapor/sepet-ada-durum.json (last block read per chain).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, Interface, zeroPadValue, solidityPacked, AbiCoder } = require("ethers");
const { EVM } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const RELAY = "https://api.relay.link";
const UYGULA = process.argv.includes("--uygula");
const KAYIT = path.join(KOK, "dagitim-sepet.json");
const DURUM = path.join(KOK, "rapor", "sepet-ada-durum.json");
const DOMAIN = { arc: 26, robinhood: 35, base: 6, arbitrum: 3, ethereum: 0, avalanche: 1, monad: 15, hyperevm: 19, bsc: 17 };
const DOLAR6_BNB = "0xb233F129F7255F86d67BDAEA4e8c4f8274Fa70d9";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const SIFIR = "0x0000000000000000000000000000000000000000";
const LZ_GAZ = 600_000n;                    // lzReceive gas on the far chain, per order
const YENIDEN_DENGE = 50_000_000n;          // a rebalance moves at least $50 at once
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const KAPI = new Interface([
  "event Kuyruk(uint64 indexed id, uint32 indexed hedefZincir, uint256 miktar, bytes mesaj)",
  "event Yollandi(uint64 indexed id, bytes32 guid)",
  "event Bekliyor(uint32 indexed kaynakZincir, uint64 indexed id, uint256 miktar, bytes mesaj)",
  "event Dolduruldu(uint32 indexed kaynakZincir, uint64 indexed id, address indexed doldurucu, bytes32 alacakli)",
  "event Bildirildi(uint32 indexed kaynakZincir, uint64 indexed id, bytes32 guid)",
  "function yolla(uint64[] ids, bytes[] ms, bytes secenekler) payable",
  "function doldur(uint32 kaynakZincir, bytes m, bytes32 alacakli)",
  "function bildir(uint32 kaynakZincir, uint64[] ids, bytes secenekler) payable",
  "function ucret(uint32 hedefZincir, bytes m, bytes secenekler) view returns (uint256)",
  "function bekleyen(uint32, uint64) view returns (bytes32)",
  "function odeyen(uint32, uint64) view returns (bytes32)",
  "function giden(uint64) view returns (uint32 hedefZincir, bool yollandi, uint256 kilitli, bytes32 ozet)",
]);
const ERC20 = new Interface(["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"]);
const D6 = new Interface(["function sar(uint256) returns (uint256)", "function coz(uint256) returns (uint256)"]);

/// LayerZero executor options, type 3: lzReceive with `gaz`.
const secenek = (gaz) => solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, gaz]);
const adOf = (domain) => Object.keys(DOMAIN).find((k) => DOMAIN[k] === domain);
const saglayici = (ad) => new JsonRpcProvider(EVM[ad].rpc, EVM[ad].chainId, { staticNetwork: true });
/// relay names Arc's USDC as the native currency (18 decimals), every other dollar as its token.
const relayPara = (ad, miktar6) => ad === "arc" ? { para: SIFIR, miktar: miktar6 * 10n ** 12n }
  : ad === "bsc" ? { para: EVM.bsc.dolar.adres, miktar: miktar6 * 10n ** 12n } : { para: EVM[ad].dolar.adres, miktar: miktar6 };

async function teklif(govde) {
  const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((x) => x.json());
  if (!q.steps) throw new Error("relay teklifi yok: " + JSON.stringify(q).slice(0, 300));
  return q;
}

/// The calls relay runs on `hedef` with the bridged dollars: pay order `m` from chain `kz`.
function hedefCagrilari(hedef, kapi, kz, m, miktar6, alacakli) {
  const doldur = { to: kapi, data: KAPI.encodeFunctionData("doldur", [kz, m, zeroPadValue(alacakli, 32)]), value: "0" };
  if (hedef === "bsc") {
    return [
      { to: EVM.bsc.dolar.adres, data: ERC20.encodeFunctionData("approve", [DOLAR6_BNB, miktar6 * 10n ** 12n]), value: "0" },
      { to: DOLAR6_BNB, data: D6.encodeFunctionData("sar", [miktar6]), value: "0" },
      { to: DOLAR6_BNB, data: ERC20.encodeFunctionData("approve", [kapi, miktar6]), value: "0" },
      doldur,
    ];
  }
  const dolar = hedef === "arc" ? ARC_USDC : EVM[hedef].dolar.adres;
  return [{ to: dolar, data: ERC20.encodeFunctionData("approve", [kapi, miktar6]), value: "0" }, doldur];
}

/// One signature on `kaynak`: relay brings `miktar6` dollars to `hedef` and runs `txs` there.
function relayGovdesi(kullanici, kaynak, hedef, miktar6, txs) {
  const k = relayPara(kaynak, 0n), h = relayPara(hedef, miktar6);
  return { user: kullanici, recipient: kullanici, originChainId: EVM[kaynak].chainId, destinationChainId: EVM[hedef].chainId,
    originCurrency: k.para, destinationCurrency: h.para, amount: h.miktar.toString(), tradeType: "EXACT_OUTPUT",
    txsGasLimit: 900000, txs };
}

async function gonderAdimlar(w, q, etiket) {
  for (const adim of q.steps) for (const it of adim.items || []) {
    if (adim.kind !== "transaction") continue;
    const d = it.data;
    const t = await w.sendTransaction({ to: d.to, data: d.data, value: BigInt(d.value || 0), ...(d.gas ? { gasLimit: BigInt(d.gas) } : {}) });
    let m = null; while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(t.hash).catch(() => null); }
    console.log("  " + etiket + " " + adim.id + " " + t.hash + " durum " + m.status);
    if (m.status !== 1) throw new Error(etiket + " basarisiz");
  }
}

/// Before the basket is deployed: the routes, priced with stand-in calls.
async function rotaKontrolu(kullanici) {
  console.log("dagitim-sepet.json yok: sepet kontratlari henuz dagitilmadi. Rota kontrolu (sahte hedef cagrisiyla):");
  const yer = "0x000000000000000000000000000000000000dEaD";
  for (const [kaynak, hedef] of [["arc", "bsc"], ["bsc", "arc"], ["base", "bsc"], ["bsc", "base"], ["arbitrum", "bsc"]]) {
    const txs = hedefCagrilari(hedef, yer, DOMAIN[kaynak], "0x", 4_000_000n, kullanici).slice(0, -1);
    try {
      const q = await teklif(relayGovdesi(kullanici, kaynak, hedef, 4_000_000n, txs));
      const d = q.details;
      console.log("  " + (kaynak + " -> " + hedef).padEnd(16) + "4 $ cikar, giren " + Number(d.currencyIn.amountFormatted).toFixed(4) + " " +
        d.currencyIn.currency.symbol + ", relay ucreti $" + Number(q.fees.relayer.amountUsd).toFixed(3) + ", ~" + d.timeEstimate + " sn, hedefte " + txs.length + " cagri");
    } catch (e) { console.log("  " + kaynak + " -> " + hedef + "  " + e.message); }
  }
}

(async () => {
  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const ben = new Wallet(pk).address;
  console.log("SEPET ADA TASIYICI  " + (UYGULA ? "UYGULA" : "KURU") + "  cuzdan " + ben);
  if (!fs.existsSync(KAYIT)) return rotaKontrolu(ben);

  const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
  const durum = fs.existsSync(DURUM) ? JSON.parse(fs.readFileSync(DURUM, "utf8")) : {};
  const zincirler = Object.keys(kayit).filter((ad) => kayit[ad].AdaKapisi && EVM[ad]);
  const abi = AbiCoder.defaultAbiCoder();
  const BOS = "0x" + "0".repeat(64);
  for (const ad of zincirler) {
    const p = saglayici(ad);
    const w = new Wallet(pk, p);
    const kapi = new Contract(kayit[ad].AdaKapisi, KAPI, w);
    const son = await p.getBlockNumber();
    const bas = durum[ad] ?? kayit[ad].blok ?? son - 5000;
    const kayitlar = [];
    for (let b = bas; b <= son; b += 5000) {
      kayitlar.push(...await p.getLogs({ address: kayit[ad].AdaKapisi, fromBlock: b, toBlock: Math.min(son, b + 4999) }));
    }
    const olaylar = kayitlar.map((l) => KAPI.parseLog(l)).filter(Boolean);

    /* 1. queued orders: one LayerZero message per destination chain */
    const gruplar = {};
    for (const e of olaylar.filter((x) => x.name === "Kuyruk")) {
      if ((await kapi.giden(e.args.id)).yollandi) continue;
      (gruplar[Number(e.args.hedefZincir)] ||= []).push(e);
    }
    for (const [hz, es] of Object.entries(gruplar)) {
      const ids = es.map((e) => e.args.id), ms = es.map((e) => e.args.mesaj);
      const ucret = await kapi.ucret(Number(hz), abi.encode(["uint8", "bytes[]"], [1, ms]), secenek(LZ_GAZ * BigInt(ids.length)));
      console.log(ad + "  yolla " + ids.length + " emir -> " + adOf(Number(hz)) + " TEK mesajda, LZ " + ucret);
      if (UYGULA) await (await kapi.yolla(ids, ms, secenek(LZ_GAZ * BigInt(ids.length)), { value: (ucret * 12n) / 10n })).wait();
    }

    /* 2. waiting orders: paid from this wallet's own dollars here, no bridge per order */
    const bekleyenler = [];
    for (const e of olaylar.filter((x) => x.name === "Bekliyor")) {
      if ((await kapi.bekleyen(e.args.kaynakZincir, e.args.id)) !== BOS) bekleyenler.push(e);
    }
    if (bekleyenler.length) {
      const dolarAdr = ad === "bsc" ? DOLAR6_BNB : ad === "arc" ? ARC_USDC : EVM[ad].dolar.adres;
      const dolar = new Contract(dolarAdr, [...ERC20.fragments, ...D6.fragments], w);
      const gerek = bekleyenler.reduce((t, e) => t + e.args.miktar, 0n);
      let elde = await dolar.balanceOf(ben);
      if (ad === "bsc" && elde < gerek) {
        /* BNB: wrap Binance-Peg USDC this wallet already holds into Dolar6 */
        const peg = new Contract(EVM.bsc.dolar.adres, ERC20, w);
        const sar = (await peg.balanceOf(ben)) / 10n ** 12n;
        const n = sar < gerek - elde ? sar : gerek - elde;
        if (n > 0n && UYGULA) { await (await peg.approve(DOLAR6_BNB, n * 10n ** 12n)).wait(); await (await dolar.sar(n)).wait(); }
        elde += n;
      }
      if (elde < gerek) {
        /* stock ran out on this side: rebalance once, in bulk, from where the
           repayments piled up (the source chain), by relay.link */
        const kaynak = adOf(Number(bekleyenler[0].args.kaynakZincir));
        const tutar = (gerek - elde) > YENIDEN_DENGE ? gerek - elde : YENIDEN_DENGE;
        const q = await teklif(relayGovdesi(ben, kaynak, ad, tutar, []));
        console.log(ad + "  STOK AZ: " + kaynak + "'dan toplu " + Number(tutar) / 1e6 + " $ relay ile (bu emirler icin TEK kopru, ucret $" + q.fees.relayer.amountUsd + ")");
        if (UYGULA) {
          const kw = new Wallet(pk, saglayici(kaynak));
          if (kaynak === "bsc") {
            const d6 = new Contract(DOLAR6_BNB, [...ERC20.fragments, ...D6.fragments], kw);
            const b = await d6.balanceOf(ben);
            if (b > 0n) await (await d6.coz(b)).wait();
          }
          await gonderAdimlar(kw, q, kaynak + "->" + ad);
          if (ad === "bsc") return console.log("  BNB'ye stok geldi; Dolar6'ya sarma bir sonraki turda");
        }
      }
      for (const e of bekleyenler) {
        console.log(ad + "  doldur " + adOf(Number(e.args.kaynakZincir)) + "#" + e.args.id + "  " + Number(e.args.miktar) / 1e6 + " $ kendi bakiyesinden");
        if (!UYGULA) continue;
        if (e.args.miktar > 0n) await (await dolar.approve(kayit[ad].AdaKapisi, e.args.miktar)).wait();
        await (await kapi.doldur(e.args.kaynakZincir, e.args.mesaj, zeroPadValue(ben, 32))).wait();
      }
    }

    /* 3. receipts: one LayerZero message per source chain */
    const makbuz = {};
    const dolanlar = [...olaylar.filter((x) => x.name === "Dolduruldu").map((e) => [Number(e.args.kaynakZincir), e.args.id]),
      ...bekleyenler.filter((e) => e.args.miktar > 0n).map((e) => [Number(e.args.kaynakZincir), e.args.id])];
    for (const [kz, id] of dolanlar) {
      if (UYGULA && (await kapi.odeyen(kz, id)) === BOS) continue;
      if ((makbuz[kz] ||= []).some((x) => x === id)) continue;
      makbuz[kz].push(id);
    }
    for (const [kz, ids] of Object.entries(makbuz)) {
      const m = abi.encode(["uint8", "uint64[]", "bytes32[]"], [2, ids, ids.map(() => zeroPadValue(ben, 32))]);
      const ucret = await kapi.ucret(Number(kz), m, secenek(LZ_GAZ));
      console.log(ad + "  bildir " + ids.length + " makbuz -> " + adOf(Number(kz)) + " TEK mesajda, LZ " + ucret);
      if (UYGULA) await (await kapi.bildir(Number(kz), ids, secenek(LZ_GAZ), { value: (ucret * 12n) / 10n })).wait();
    }
    durum[ad] = son + 1;
  }
  if (UYGULA) fs.writeFileSync(DURUM, JSON.stringify(durum, null, 1));
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
