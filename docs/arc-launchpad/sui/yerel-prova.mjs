/* ===========================================================================
 * yerel-prova.mjs — the site's Sui launch (docs/js/sui.js) end to end on a
 * local Sui network (`sui start --with-faucet`), every number read back.
 *
 *   SUI_CONFIG_DIR=C:/Users/omen/araclar/sui/yerel sui start --with-faucet --force-regenesis
 *   node sui/yerel-prova.mjs
 *
 * Publishes the test dollar (devnet-coins) and the launchpad + PulseSwap
 * package, initializes them, points sui.js at them with `ayarla`, then runs
 * exactly the site's builders: rewrite the coin template, publish it with
 * its package made immutable, launch with the TreasuryCap. Only the wallet
 * prompt is replaced by a local keypair.
 * =========================================================================== */
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const KOK = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RPC = process.env.SUI_YEREL || "http://127.0.0.1:9000";
const FAUCET = "http://127.0.0.1:9123";
const req = createRequire("C:/Users/omen/araclar/suisdk/node_modules/");
const { Ed25519Keypair } = req("@mysten/sui/keypairs/ed25519");
const sui = await import("../docs/js/sui.js");
const { Transaction } = await import("../docs/vendor/sui.mjs");
const USD = 1_000_000n;
let gecti = 0, kaldi = 0;
const kontrol = (ad, ok, ek = "") => { ok ? gecti++ : kaldi++; console.log((ok ? "  PASS  " : "  FAIL  ") + ad + (ek ? "   " + ek : "")); };

sui.ayarla({ rpc: RPC, zincir: "sui:localnet" });
const c = sui.istemci();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function musluk(adres) {
  for (const yol of ["/v2/gas", "/gas"]) {
    const r = await fetch(FAUCET + yol, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ FixedAmountRequest: { recipient: adres } }) }).catch(() => null);
    if (r && r.ok) { await bekle(1500); return; }
  }
  throw new Error("faucet");
}
async function calistir(kp, tx) {
  tx.setSender(kp.toSuiAddress());
  const bytes = await tx.build({ client: c });
  const { signature } = await kp.signTransaction(bytes);
  const r = await c.executeTransactionBlock({ transactionBlock: bytes, signature, options: { showEffects: true, showObjectChanges: true } });
  await c.waitForTransaction({ digest: r.digest });
  if (r.effects.status.status !== "success") throw new Error(r.effects.status.error);
  return r;
}
const derle = (dizin, ekler = []) => {
  const o = execFileSync("C:/Users/omen/araclar/sui/sui.exe", ["move", "build", "--dump-bytecode-as-base64", "-e", "mainnet", "--path", path.join(KOK, "sui", dizin), ...ekler], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(o.slice(o.indexOf("{")));
};
const yayinla = async (kp, paket) => {
  const tx = new Transaction();
  const cap = tx.publish(paket);
  tx.transferObjects([cap], tx.pure.address(kp.toSuiAddress()));
  return (await calistir(kp, tx)).objectChanges;
};
const bul = (d, s) => (d.find((o) => o.type === "created" && (o.objectType || "").includes(s)) || {}).objectId;

/* ---- setup: test dollar, launchpad + PulseSwap ----------------------- */
const admin = new Ed25519Keypair(), founder = new Ed25519Keypair(), platform = new Ed25519Keypair().toSuiAddress();
await musluk(admin.toSuiAddress()); await musluk(founder.toSuiAddress());
const coins = await yayinla(admin, derle("devnet-coins"));
const cp = coins.find((o) => o.type === "published").packageId;
const TUSDC = cp + "::tusdc::TUSDC", FTHM = cp + "::tgt::TGT";
const faucetId = coins.find((o) => o.type === "created" && /::tusdc::Faucet$/.test(o.objectType)).objectId;
const pulse = await yayinla(admin, derle("pulse-swap", ["--with-unpublished-dependencies"]));
const P = pulse.find((o) => o.type === "published").packageId;
const ids = { config: bul(pulse, "::launchpad::Config"), registry: bul(pulse, "::swap::Registry"), init: bul(pulse, "::launchpad::InitCap"), adapter: bul(pulse, "::launchpad::AdapterCap"), fee: bul(pulse, "::swap::FeeCap") };
{
  const tx = new Transaction();
  tx.moveCall({ target: P + "::launchpad::initialize", typeArguments: [TUSDC], arguments: [tx.object(ids.init), tx.object(ids.config), tx.pure.u8(6), tx.pure.address(platform)] });
  tx.moveCall({ target: P + "::launchpad::register_adapter", typeArguments: [P + "::swap::Witness"], arguments: [tx.object(ids.adapter), tx.object(ids.config)] });
  tx.moveCall({ target: P + "::swap::initialize", typeArguments: [TUSDC, FTHM], arguments: [tx.object(ids.fee), tx.pure.address(platform), tx.pure.address("0xdead")] });
  const r = await calistir(admin, tx);
  ids.fees = bul(r.objectChanges, "::swap::Fees<");
}
sui.ayarla({ paket: P, config: ids.config, registry: ids.registry, fees: ids.fees, usdc: TUSDC });
kontrol("yerel agda test dolari + launchpad + PulseSwap kuruldu ve baslatildi", !!ids.fees, P.slice(0, 12) + "…");
{
  const tx = new Transaction();
  const m = tx.moveCall({ target: cp + "::tusdc::mint", arguments: [tx.object(faucetId), tx.pure.u64(1000n * USD)] });
  tx.transferObjects([m], tx.pure.address(founder.toSuiAddress()));
  await calistir(founder, tx);
}
kontrol("kurucuda 1000 tUSDC", (await sui.usdcBakiye(founder.toSuiAddress())) === 1000n * USD);

/* ---- the site's launch, two transactions ----------------------------- */
const sablon = await sui.sablonModulu("Yerel Sui Test", "YST1", {
  sablon: JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", "sui-sablon.json"), "utf8")),
  wasm: fs.readFileSync(path.join(KOK, "docs", "vendor", "move_bytecode_template_bg.wasm")),
});
kontrol("sablon yeniden adlandirildi (modul yst1, OTW YST1)", sablon.modul === "yst1" && sablon.otw === "YST1");
const y = sui.yayinSonucu((await calistir(founder, sui.yayinIslemi(sablon))).objectChanges, sablon);
const meta = await c.getCoinMetadata({ coinType: y.tip });
kontrol("coin yayinlandi: ad/sembol/ondalik zincirden", meta.name === "Yerel Sui Test" && meta.symbol === "YST1" && meta.decimals === 6, y.tip.slice(0, 14) + "…");
const capObj = await c.getObject({ id: y.cap, options: { showOwner: true } });
kontrol("TreasuryCap kurucuda, arz 0", capObj.data.owner.AddressOwner === founder.toSuiAddress() && (await c.getTotalSupply({ coinType: y.tip })).value === "0");
const usdc = await sui.usdcCoinleri(founder.toSuiAddress());
const r = await calistir(founder, sui.launchIslemi({ sahip: founder.toSuiAddress(), tip: y.tip, cap: y.cap, usdcCoinler: usdc, teminat: 20n * USD, ilkAlim: 100n * USD, vergiPpm: 10000 }));
const al = BigInt((await c.getBalance({ owner: founder.toSuiAddress(), coinType: y.tip })).totalBalance);
kontrol("launch: kurucu 27.237.354,085603 token (Aptos/Sui devnet ile ayni)", al === 27237354085603n, al.toString());
kontrol("launch onizlemesi sitedeki formulle ayni", sui.acilisTokeni(100n * USD) === al);
const kasa = bul(r.objectChanges, "::launchpad::Vault<");
const v = (await c.getObject({ id: kasa, options: { showContent: true } })).data.content.fields;
kontrol("kasa paylasilan nesne: teminat 20 tUSDC, havuz 98 tUSDC", BigInt(v.backing) === 20n * USD && BigInt(v.pool_dollars) === 98n * USD, "kasa " + v.backing + " / havuz " + v.pool_dollars);
kontrol("arz kesin: 1e9 token, cap kasanin icinde (kimsenin elinde degil)", v.cap.fields.total_supply.fields.value === String(sui.SUI.arz) && (await c.getObject({ id: y.cap }).then((o) => !o.data, () => true)), "arz (kasadaki cap) " + v.cap.fields.total_supply.fields.value);
kontrol("kurucuda tUSDC kaldi: 1000 - 120 = 880", (await sui.usdcBakiye(founder.toSuiAddress())) === 880n * USD);

/* ---- the token page: read, buy, sell, redeem (docs/js/sui.js + move-hesap.js) ---- */
const H = await import("../docs/js/move-hesap.js");
let d = await sui.kasaDurumu(kasa);
kontrol("kasaDurumu: tipler, dolasim = kurucunun tokeni, kasa 20", d.token === y.tip && d.dolar === TUSDC && d.dolasim === al && d.kasaBakiye === 20n * USD);
const liste = await sui.launchListesi();
kontrol("launch listesi bu kasayi Launched olayindan buldu", liste.some((x) => x.kasa === kasa && x.token === y.tip));
await bekle(6000);   // past the 5 s anti-snipe window, so the quote is exact
const buyer = new Ed25519Keypair();
await musluk(buyer.toSuiAddress());
{
  const tx = new Transaction();
  const m = tx.moveCall({ target: cp + "::tusdc::mint", arguments: [tx.object(faucetId), tx.pure.u64(100n * USD)] });
  tx.transferObjects([m], tx.pure.address(buyer.toSuiAddress()));
  await calistir(buyer, tx);
}
const q = H.alimTeklifi(d.havuz, 50n * USD);
await calistir(buyer, sui.alIslemi({ sahip: buyer.toSuiAddress(), d, dolarCoinler: await sui.usdcCoinleri(buyer.toSuiAddress()), dolar: 50n * USD, asgariToken: H.asgari(q.token) }));
const aldi = await sui.coinBakiye(buyer.toSuiAddress(), y.tip);
kontrol("alim: zincirin verdigi = sayfanin teklifi (50 tUSDC)", aldi === q.token, aldi + " = " + q.token);
d = await sui.kasaDurumu(kasa);
const sq = H.satimTeklifi(d.havuz, aldi);
const u0 = await sui.usdcBakiye(buyer.toSuiAddress());
const tc = (await c.getCoins({ owner: buyer.toSuiAddress(), coinType: y.tip })).data.map((x) => x.coinObjectId);
await calistir(buyer, sui.satIslemi({ sahip: buyer.toSuiAddress(), d, tokenCoinler: tc, miktar: aldi, asgariDolar: H.asgari(sq.dolar, 600) }));
const geri = (await sui.usdcBakiye(buyer.toSuiAddress())) - u0;
kontrol("satis: kalkan dahil teklifin %6 icinde ve teklifi asmiyor", geri <= sq.dolar && geri >= H.asgari(sq.dolar, 600), geri + " / teklif " + sq.dolar);
d = await sui.kasaDurumu(kasa);
const onda = al / 10n;
const beklenen = H.itfaPayi(d.kasaBakiye, onda, d.dolasim);
const f0 = await sui.usdcBakiye(founder.toSuiAddress());
const fc = (await c.getCoins({ owner: founder.toSuiAddress(), coinType: y.tip })).data.map((x) => x.coinObjectId);
await calistir(founder, sui.itfaIslemi({ sahip: founder.toSuiAddress(), d, tokenCoinler: fc, miktar: onda }));
kontrol("itfa %10: odenen = sayfanin hesabi (kasa x pay / dolasim)", (await sui.usdcBakiye(founder.toSuiAddress())) - f0 === beklenen, String(beklenen));

/* ---- paste a token: refused on a pool younger than a day -------------- */
{
  const tx = new Transaction();
  const t = tx.moveCall({ target: cp + "::tgt::mint", arguments: [tx.object(bul(coins, "::tgt::Faucet")), tx.pure.u64(10000n * USD)] });
  const d = tx.moveCall({ target: cp + "::tusdc::mint", arguments: [tx.object(faucetId), tx.pure.u64(1000n * USD)] });
  tx.moveCall({ target: P + "::swap::open_pool", typeArguments: [FTHM, TUSDC], arguments: [tx.object(ids.registry), t, d, tx.object("0x6")] });
  await calistir(admin, tx);
}
const h = await sui.teminatHavuzu(FTHM, 25n * USD);
kontrol("CA yapistir: genc havuz sitede reddedilir (24 saat)", !!h.hata && /24 h old/.test(h.hata), h.hata);

console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
process.exit(kaldi ? 1 : 0);
