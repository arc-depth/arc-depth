"use strict";
/* ===========================================================================
 * fthm-havuz-move.js — the FTHM/USDC PulseSwap pools on Aptos and Sui, which
 * turn the 5% FTHM share of PulseSwap's protocol fee into FTHM
 *
 *   NODE_PATH="C:/Users/omen/araclar/aptossdk/node_modules;C:/Users/omen/araclar/suisdk/node_modules" \
 *     node scripts/fthm-havuz-move.js <durum|usdc|kopru|havuz> [--uygula]
 *
 * Without --uygula a step only quotes or simulates. Sized small on purpose
 * (the user: "makul şekilde"); anyone can add liquidity later.
 *
 *   durum  every balance involved, and whether the pools exist
 *   usdc   SideShift (the route gaz-aptos.js measured): USDC_PER_ZINCIR Arc
 *          USDC from the deployer to each chain's deployer, as native USDC
 *   kopru  the deployer's FTHM on Base, all of it, half to Aptos and half
 *          to Sui through the Base gate (FTHMOFTAdapter 0xFb99…); this FTHM
 *          was bought on the market (14 Oct, fthm-her-zincirden-al.js), it
 *          is not the founder's allocation
 *   havuz  PulseSwap open_pool on each chain: all the FTHM that arrived,
 *          against USDC at Arc's live FTHM price (FiyatAgi.kaynak); the
 *          USDC left over stays with that chain's deployer
 * Record: rapor/fthm-havuz-move.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { Wallet, Contract, zeroPadValue, formatUnits } = require("ethers");
const { saglayici } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "rapor", "fthm-havuz-move.json");
const ADIM = process.argv[2];
const UYGULA = process.argv.includes("--uygula");
const USDC_PER_ZINCIR = 4;
const SS = "https://sideshift.ai/api/v2", AFFILIATE = "nYkWNTFtl";
const ARC_USDC = "0x3600000000000000000000000000000000000000";
const FIYAT_AGI = "0x18b8D56c8c2b8f36B06380f47796e40b65DE45C6";
const BASE_FTHM = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const GECIT = "0xFb99d4Ab471e82A19F721Be43F80e6d555C8aF2a";
const EID = { aptos: 30108, sui: 30378 };
const M = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-move-pulse.json"), "utf8"));
/* the funds sit with the deployer; the pools are PulseSwap v2's (aptos2), the
   dispatch-aware build that can hold Circle's USDC */
const AP = { adres: M.aptos.adres, paket: (M.aptos2 && M.aptos2.adres) || "0xe1ddef8fcbf442f87657e4f1f6ee6cfa4954aa537ef362dd2a3991602defe1c4", usdc: M.aptos.usdc, fthm: M.aptos.fthm, api: "https://api.mainnet.aptoslabs.com/v1", fthmOndalik: 8 };
const SU = { adres: M.sui.adres, paket: M.sui.paket, registry: M.sui.registry, usdc: M.sui.usdc, fthm: M.sui.fthm, rpc: "https://sui-rpc.publicnode.com", fthmOndalik: 9 };
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const kayit = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };

const env = (dosya, ad) => fs.readFileSync(dosya, "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(\\S+)\\s*$", "m"))[1];
const evm = (zincir) => new Wallet(env("C:/bot/.env", "TRADER_PRIVATE_KEY"), saglayici(zincir));
const E20 = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"];

async function aptosGorus(fn, targs, args) {
  const r = await fetch(AP.api + "/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ function: fn, type_arguments: targs, arguments: args }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.message || "view");
  return j;
}
const aptosFa = async (meta) => BigInt((await aptosGorus("0x1::primary_fungible_store::balance", ["0x1::fungible_asset::Metadata"], [AP.adres, meta]))[0]);
async function suiRpc(method, params) {
  const r = await fetch(SU.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ": " + r.error.message);
  return r.result;
}
const suiBakiye = async (tip) => BigInt((await suiRpc("suix_getBalance", [SU.adres, tip])).totalBalance);

/* dollars (6-decimal raw) per FTHM raw unit with `ondalik` decimals, from Arc's pool */
async function fthmFiyati() {
  const f = new Contract(FIYAT_AGI, ["function fthm() view returns (address)", "function kaynak(address) view returns (uint160,address)"], saglayici("arc"));
  const [s] = await f.kaynak(await f.fthm());
  return (Number(s) / 2 ** 96) ** 2 * 1e18;   // dollar raw per whole FTHM
}

async function durum() {
  const arc = evm("arc"), base = evm("base");
  const fthmBase = await new Contract(BASE_FTHM, E20, base.provider).balanceOf(base.address);
  const usdDolarFthm = (await fthmFiyati()) / 1e6;
  console.log("FTHM fiyati (Arc havuzu): $" + usdDolarFthm.toExponential(4) + " = " + Math.round(1 / usdDolarFthm) + " FTHM/$");
  console.log("  Arc   dagitici USDC " + formatUnits(await new Contract(ARC_USDC, E20, arc.provider).balanceOf(arc.address), 6));
  console.log("  Base  dagitici ETH " + formatUnits(await base.provider.getBalance(base.address), 18) + "   FTHM " + formatUnits(fthmBase, 18));
  console.log("  Aptos dagitici USDC " + formatUnits(await aptosFa(AP.usdc), 6) + "   FTHM " + formatUnits(await aptosFa(AP.fthm), AP.fthmOndalik));
  console.log("  Sui   dagitici USDC " + formatUnits(await suiBakiye(SU.usdc), 6) + "   FTHM " + formatUnits(await suiBakiye(SU.fthm), SU.fthmOndalik));
  const aHavuz = await aptosGorus(AP.paket + "::swap::reserves", [], [AP.fthm]).catch(() => null);
  console.log("  Aptos FTHM havuzu " + (aHavuz ? "VAR " + JSON.stringify(aHavuz) : "yok"));
  const reg = await suiRpc("sui_getObject", [SU.registry, { showContent: true }]);
  const tablo = reg.data.content.fields.pools.fields.id.id;
  const df = await suiRpc("suix_getDynamicFields", [tablo, null, 50]);
  const suiVar = df.data.some((x) => JSON.stringify(x.name).includes(SU.fthm.replace(/^0x/, "")));
  console.log("  Sui   FTHM havuzu " + (suiVar ? "VAR" : "yok"));
}

async function usdc() {
  const arc = evm("arc");
  for (const [zincir, adres] of [["aptos", AP.adres], ["sui", SU.adres]]) {
    const cift = await fetch(SS + "/pair/usdc-arc/usdc-" + zincir).then((x) => x.json());
    console.log("  SideShift Arc USDC -> " + zincir + " USDC  " + USDC_PER_ZINCIR + " -> ~" + (USDC_PER_ZINCIR * Number(cift.rate)).toFixed(3) + "  (asgari " + Number(cift.min).toFixed(2) + ")");
    if (!UYGULA) continue;
    const s = await fetch(SS + "/shifts/variable", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ settleAddress: adres, depositCoin: "USDC", depositNetwork: "arc", settleCoin: "USDC", settleNetwork: zincir, refundAddress: arc.address, affiliateId: AFFILIATE }) }).then((x) => x.json());
    if (!s.depositAddress) throw new Error("shift acilmadi: " + JSON.stringify(s).slice(0, 200));
    const t = await new Contract(ARC_USDC, E20, arc).transfer(s.depositAddress, BigInt(USDC_PER_ZINCIR * 1e6));
    await t.wait();
    console.log("    gonderildi " + t.hash + "  shift " + s.id);
    (kayit.usdc = kayit.usdc || {})[zincir] = { shift: s.id, tx: t.hash }; yaz();
    for (let i = 0; i < 60; i++) {
      await bekle(10000);
      const d = await fetch(SS + "/shifts/" + s.id).then((x) => x.json()).catch(() => ({}));
      if (d.status === "settled") { console.log("    vardi " + (d.settleHash || "")); kayit.usdc[zincir].settle = d.settleHash; yaz(); break; }
      if (d.status === "refunded" || d.status === "expired") throw new Error("shift " + d.status);
    }
  }
}

async function kopru() {
  const base = evm("base");
  const fthm = new Contract(BASE_FTHM, E20, base);
  const gecit = new Contract(GECIT, ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
    "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable returns ((bytes32,uint64,(uint256,uint256)),(uint256,uint256))"], base);
  const hepsi = await fthm.balanceOf(base.address);
  // shared decimals 6: the OFT drops anything below 1e12 wei, so send whole multiples
  const yarim = (hepsi / 2n / 10n ** 12n) * 10n ** 12n;
  if (yarim === 0n) { console.log("  Base'de gonderilecek FTHM yok"); return; }
  for (const [zincir, adres] of [["aptos", AP.adres], ["sui", SU.adres]]) {
    const p = [EID[zincir], zeroPadValue(adres, 32), yarim, (yarim * 99n) / 100n, "0x", "0x", "0x"];
    const [ucret] = await gecit.quoteSend(p, false);
    console.log("  Base -> " + zincir.padEnd(5) + formatUnits(yarim, 18) + " FTHM   LayerZero ucreti " + formatUnits(ucret, 18) + " ETH");
    if (!UYGULA) continue;
    if ((await fthm.allowance(base.address, GECIT)) < yarim) await (await fthm.approve(GECIT, yarim * 2n)).wait();
    const t = await gecit.send(p, [ucret, 0n], base.address, { value: ucret });
    await t.wait();
    console.log("    gonderildi " + t.hash + "  (LayerZeroScan'de izlenebilir)");
    (kayit.kopru = kayit.kopru || {})[zincir] = { tx: t.hash, fthm: formatUnits(yarim, 18) }; yaz();
  }
}

async function havuz() {
  const dolarBasinaFthm = await fthmFiyati();   // dollar raw per whole FTHM
  const esle = (fthmRaw, ondalik, usdcVar) => {
    const gerek = BigInt(Math.floor((Number(fthmRaw) / 10 ** ondalik) * dolarBasinaFthm));
    return gerek <= usdcVar ? [fthmRaw, gerek] : [BigInt(Math.floor(Number(usdcVar) / dolarBasinaFthm * 10 ** ondalik)), usdcVar];
  };

  /* Aptos */
  const aVar = await aptosGorus(AP.paket + "::swap::reserves", [], [AP.fthm]).catch(() => null);
  if (aVar) console.log("  Aptos havuzu zaten var " + JSON.stringify(aVar));
  else {
    const [f, d] = esle(await aptosFa(AP.fthm), AP.fthmOndalik, await aptosFa(AP.usdc));
    if (f === 0n || d === 0n) console.log("  Aptos: FTHM ya da USDC henuz yok (kopru/usdc adimlari)");
    else {
      const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } = require("@aptos-labs/ts-sdk");
      const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
      const h = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(env(path.join(KOK, ".env"), "APTOS_PRIVATE_KEY")) });
      const tx = await ag.transaction.build.simple({ sender: h.accountAddress, data: { function: AP.paket + "::swap::open_pool", functionArguments: [AP.fthm, f.toString(), d.toString()] } });
      const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: h.publicKey, transaction: tx });
      console.log("  Aptos open_pool " + formatUnits(f, AP.fthmOndalik) + " FTHM + " + formatUnits(d, 6) + " USDC   simulasyon " + sim.vm_status);
      if (UYGULA && sim.success) {
        const g = await ag.signAndSubmitTransaction({ signer: h, transaction: tx });
        const r = await ag.waitForTransaction({ transactionHash: g.hash });
        console.log("    " + g.hash + " " + r.vm_status);
        (kayit.havuz = kayit.havuz || {}).aptos = { tx: g.hash, fthm: formatUnits(f, AP.fthmOndalik), usdc: formatUnits(d, 6) }; yaz();
      }
    }
  }

  /* Sui */
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const client = new SuiJsonRpcClient({ url: SU.rpc, network: "mainnet" });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(env(path.join(KOK, ".env"), "SUI_PRIVATE_KEY"), "hex"));
  const [f, d] = esle(await suiBakiye(SU.fthm), SU.fthmOndalik, await suiBakiye(SU.usdc));
  if (f === 0n || d === 0n) { console.log("  Sui: FTHM ya da USDC henuz yok (kopru/usdc adimlari)"); return; }
  const coinlar = async (tip) => (await client.getCoins({ owner: SU.adres, coinType: tip })).data.map((c) => c.coinObjectId);
  const tx = new Transaction();
  const parca = (ids, miktar) => {
    const [ilk, ...kalan] = ids.map((id) => tx.object(id));
    if (kalan.length) tx.mergeCoins(ilk, kalan);
    return tx.splitCoins(ilk, [tx.pure.u64(miktar)])[0];
  };
  const fc = parca(await coinlar(SU.fthm), f), dc = parca(await coinlar(SU.usdc), d);
  tx.moveCall({ target: SU.paket + "::swap::open_pool", typeArguments: [SU.fthm, SU.usdc], arguments: [tx.object(SU.registry), fc, dc, tx.object("0x6")] });
  tx.setSender(SU.adres);
  tx.setGasBudget(100_000_000);
  const sim = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
  console.log("  Sui open_pool " + formatUnits(f, SU.fthmOndalik) + " FTHM + " + formatUnits(d, 6) + " USDC   simulasyon " + sim.effects.status.status + (sim.effects.status.error ? " " + sim.effects.status.error : ""));
  if (UYGULA && sim.effects.status.status === "success") {
    const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true } });
    console.log("    " + r.digest + " " + r.effects.status.status);
    (kayit.havuz = kayit.havuz || {}).sui = { tx: r.digest, fthm: formatUnits(f, SU.fthmOndalik), usdc: formatUnits(d, 6) }; yaz();
  }
}

const ADIMLAR = { durum, usdc, kopru, havuz };
if (!ADIMLAR[ADIM]) { console.error("kullanim: fthm-havuz-move.js <durum|usdc|kopru|havuz> [--uygula]"); process.exit(1); }
console.log("FTHM HAVUZ (Aptos + Sui)  " + ADIM + "  " + (UYGULA ? "UYGULA" : "KURU"));
ADIMLAR[ADIM]().catch((e) => { console.error("HATA " + (e.shortMessage || e.message || e)); process.exit(1); });
