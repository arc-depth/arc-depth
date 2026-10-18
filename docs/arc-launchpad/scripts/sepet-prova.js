"use strict";
/* ===========================================================================
 * sepet-prova.js — the basket system end to end on Arc and Base, with
 *                  Circle's real CCTP V2, for a few dollars that come back
 *
 *   node scripts/sepet-prova.js yerel            forks of Arc and Base mainnet
 *                                                (anvil), every step, checked
 *   node scripts/sepet-prova.js ana              mainnet, dry: what each step costs
 *   node scripts/sepet-prova.js ana --uygula     mainnet, for real (resumable)
 *
 * A REHEARSAL SET, NOT THE PRODUCT: its SepetUcu names the deployer as the
 * launchpad, so the site never uses it; the product set is deployed later
 * with PulseLaunchpad5. The launch token and the two basket assets are
 * ProvaJeton (whole supply to the deployer, nothing bought).
 *
 * STEPS (each skipped when the record shows it done)
 *   1 deploy  Arc: HaberciCctp, SepetDefteri, SepetKasasi, SepetUcu, 3 ProvaJeton
 *             Base: HaberciCctp, SepetKasasi, SepetUcu, 1 ProvaJeton
 *   2 wire    twins both ways, Defter.bagla for both chains, everything locked
 *   3 launch  from Arc, $8: $4 line on Arc, $4 line on Base (CCTP burn with hook)
 *   4 relay   Circle's attestation (Iris) -> Base Haberci.teslim
 *   5 fill    both buy auctions (the deployer gives test units, gets the $4 back)
 *   6 redeem  half the supply, paid on Base; the Base order goes by CCTP
 *   7 fill    both sell auctions; Arc's payout crosses to Base by CCTP
 *   8 check   the deployer's dollars on Base grew by what the sales paid
 *
 * Money: Arc ~12 USDC moves and comes back (launch $8, a sale ~$4), Base
 * ~4 USDC; what is lost is gas only. CCTP standard transfers carry no fee.
 * Record: dagitim-sepet-prova.json (ana only).
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const { JsonRpcProvider, FeeData, Wallet, NonceManager, Contract, ContractFactory, Interface, zeroPadValue, getBytes, hexlify, concat, keccak256, Signature, AbiCoder, toBeHex } = require("ethers");

const KOK = path.join(__dirname, "..");
const KIP = process.argv[2];
const UYGULA = process.argv.includes("--uygula");
const KAYIT = path.join(KOK, "dagitim-sepet-prova.json");
const MT = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64";
const TM = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const IRIS = "https://iris-api.circle.com/v2/messages/";
const ZINCIR = {
  /* On a local fork Arc cannot stand in: its USDC is a system contract that
     anvil cannot execute (transfer reverts, measured 17 Oct 2026). The
     rehearsal of the logic therefore puts the centre on an Arbitrum fork,
     where USDC is a plain ERC-20 and CCTP V2 is the same contract; mainnet
     puts it on Arc. */
  arbitrum: { ad: "Arbitrum", id: 42161, domain: 3, rpc: "https://arb1.arbitrum.io/rpc", catal: "https://arb1.arbitrum.io/rpc", usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", port: 8613 },
  arc: { ad: "Arc", id: 5042, domain: 26, rpc: "https://arc-rpc.publicnode.com", catal: "https://arc-rpc.publicnode.com", usdc: "0x3600000000000000000000000000000000000000", port: 8611 },
  base: { ad: "Base", id: 8453, domain: 6, rpc: "https://mainnet.base.org", catal: "https://mainnet.base.org", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", port: 8612 },
};
const ARZ = 10n ** 24n;
const MESAJ_OLAYI = keccak256(Buffer.from("MessageSent(bytes)"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const b32 = (a) => zeroPadValue(a, 32);
const art = (ad) => JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
const ERC20 = ["function approve(address,uint256) returns (bool)", "function balanceOf(address) view returns (uint256)"];

if (!["yerel", "ana"].includes(KIP)) { console.error("kullanim: sepet-prova.js <yerel|ana> [--uygula]"); process.exit(1); }
const GERCEK = KIP === "ana" && UYGULA;
const anahtar = () => fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();

/* ---- local forks ------------------------------------------------------- */
const anviller = [];
function anvilBaslat(z) {
  const a = cp.spawn("C:/Users/omen/araclar/foundry/anvil.exe", ["--fork-url", z.catal, "--port", String(z.port), "--chain-id", String(z.id), "--silent"], { stdio: "ignore" });
  anviller.push(a);
}
async function hazirMi(url) {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }) }); if (r.ok) return; } catch (e) {}
    await bekle(1000);
  }
  throw new Error("anvil acilmadi: " + url);
}
const yerelRpc = (url, m, p) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p }) }).then((x) => x.json());

/// On a fork, our own key attests: the attester manager (impersonated) enables it, threshold 1.
const YEREL_ATTESTER = new Wallet("0x" + "a7".repeat(32));
async function yerelAttester(z) {
  const p = z.p;
  const mt = new Contract(MT, ["function attesterManager() view returns (address)", "function enableAttester(address)", "function setSignatureThreshold(uint256)", "function signatureThreshold() view returns (uint256)"], p);
  const yon = await mt.attesterManager();
  await yerelRpc(z.url, "anvil_impersonateAccount", [yon]);
  await yerelRpc(z.url, "anvil_setBalance", [yon, "0x56BC75E2D63100000"]);
  const s = await p.getSigner(yon);
  await (await mt.connect(s).enableAttester(YEREL_ATTESTER.address)).wait();
  if ((await mt.signatureThreshold()) !== 1n) await (await mt.connect(s).setSignatureThreshold(1)).wait();
}

/* ---- CCTP relay ---------------------------------------------------------- */
/// Messages emitted by MessageTransmitterV2 in a transaction.
function mesajlar(makbuz) {
  return makbuz.logs.filter((l) => l.address.toLowerCase() === MT.toLowerCase() && l.topics[0] === MESAJ_OLAYI)
    .map((l) => AbiCoder.defaultAbiCoder().decode(["bytes"], l.data)[0]);
}
/// The attested form: Iris on mainnet; on a fork, nonce and finality filled in and signed locally.
let yerelNonce = BigInt(Date.now());
async function onayla(kaynak, txHash, m) {
  if (KIP === "yerel") {
    const b = getBytes(m);
    const nn = getBytes(toBeHex(yerelNonce++, 32));
    b.set(nn, 12);
    b.set(getBytes("0x000007d0"), 144);                 // finality executed 2000
    const imza = YEREL_ATTESTER.signingKey.sign(keccak256(b));
    return { mesaj: hexlify(b), imza: Signature.from(imza).serialized };
  }
  for (let i = 0; i < 240; i++) {
    const r = await fetch(IRIS + kaynak.domain + "?transactionHash=" + txHash).then((x) => x.json()).catch(() => ({}));
    const hepsi = (r.messages || []);
    const bul = hepsi.find((x) => x.status === "complete" && x.attestation && x.attestation !== "PENDING");
    if (bul) return { mesaj: bul.message, imza: bul.attestation };
    if (i % 6 === 0) console.log("    Iris bekleniyor (" + kaynak.ad + " kesinligi)...");
    await bekle(10000);
  }
  throw new Error("Iris onayi gelmedi: " + txHash);
}

/* ---- main ---------------------------------------------------------------- */
(async () => {
  const kayit = GERCEK && fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : { adres: {}, adim: {} };
  const yaz = () => { if (GERCEK) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
  const pk = anahtar();
  if (KIP === "yerel") delete ZINCIR.arc; else delete ZINCIR.arbitrum;
  for (const z of Object.values(ZINCIR)) {
    if (KIP === "yerel") { anvilBaslat(z); z.url = "http://127.0.0.1:" + z.port; await hazirMi(z.url); }
    else z.url = z.rpc;
    z.p = new JsonRpcProvider(z.url, z.id, { staticNetwork: true });
    if (z === ZINCIR.base) {
      /* Base: a priority fee of 0.001 gwei is what the chain pays; ethers would default to 1 gwei */
      const p = z.p;
      p.getFeeData = async () => { const b = (await p.getBlock("latest")).baseFeePerGas; const o = 1_000_000n; return new FeeData(null, b * 2n + o, o); };
    }
    z.w = new NonceManager(new Wallet(pk, z.p));
  }
  const A = ZINCIR.arc || ZINCIR.arbitrum, B = ZINCIR.base;
  const ben = await A.w.getAddress();
  console.log("SEPET PROVA  " + KIP.toUpperCase() + (KIP === "ana" ? (UYGULA ? " UYGULA" : " KURU") : "") + "  cuzdan " + ben);
  for (const z of [A, B]) {
    const u = new Contract(z.usdc, ERC20, z.p);
    console.log("  " + z.ad.padEnd(5) + " USDC " + Number(await u.balanceOf(ben)) / 1e6 + "  gaz " + Number(await z.p.getBalance(ben)) / 1e18);
  }
  if (KIP === "yerel") {
    /* fork only: give the wallet the dollars it holds on Arc mainnet (FiatToken balances, slot 9) */
    for (const z of [A, B]) {
      const yuva = keccak256(AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [ben, 9]));
      await yerelRpc(z.url, "anvil_setStorageAt", [z.usdc, yuva, toBeHex(25_000_000n, 32)]);
      await yerelRpc(z.url, "anvil_setBalance", [ben, "0x16345785D8A0000"]);
    }
    await yerelAttester(A); await yerelAttester(B); console.log("  yerel: iki catalda attester bizim test anahtarimiz (esik 1)"); }
  if (KIP === "ana" && !UYGULA) {
    const g = { arc: 0n, base: 0n };
    for (const [ad, n] of [["HaberciCctp", 2], ["SepetKasasi", 2], ["SepetUcu", 2], ["ProvaJeton", 4]]) {
      const b = art(ad).bytecode;
      g.arc += BigInt(Math.ceil(b.length / 2)) * 220n * BigInt(n === 4 ? 3 : 1);
      g.base += BigInt(Math.ceil(b.length / 2)) * 220n * BigInt(n === 4 ? 1 : 1);
    }
    g.arc += BigInt(Math.ceil(art("SepetDefteri").bytecode.length / 2)) * 220n;
    for (const z of [A, B]) {
      const f = await z.p.getFeeData();
      const tahmin = (g[z === A ? "arc" : "base"] + 3_000_000n) * (f.gasPrice || f.maxFeePerGas);
      console.log("  (kuru) " + z.ad + ": kurulum + adimlar ~" + (Number(g[z === A ? "arc" : "base"] + 3_000_000n) / 1e6).toFixed(1) + "M gaz, ~" + (Number(tahmin) / 1e18).toFixed(6) + (z === A ? " USDC" : " ETH"));
    }
    console.log("  (kuru) dolar: Arc'tan 8 $ launch + ~4 $ satis, Base'de ~4 $ satis; hepsi bu cuzdana geri doner, kayip yalniz gaz");
    console.log("  (kuru) once 'yerel' ile ayni adimlar ana ag catalinda dogrulanir");
    return;
  }

  const gonder = async (z, etiket, f) => {
    if (kayit.adim[etiket]) return null;
    const t = await f();
    const m = await t.wait();
    if (m.status !== 1) throw new Error(etiket + " basarisiz");
    console.log("  " + etiket.padEnd(40) + m.hash);
    kayit.adim[etiket] = m.hash; yaz();
    /* Base RPC is load balanced: let every node see this block before the next estimate */
    if (z === ZINCIR.base && KIP === "ana") await bekle(6000);
    return m;
  };
  const kur = async (z, ad, anahtarAd, args) => {
    const k = z.ad + " " + anahtarAd;
    if (kayit.adres[k]) return new Contract(kayit.adres[k], art(ad).abi, z.w);
    const a = art(ad);
    const c = await new ContractFactory(a.abi, a.bytecode, z.w).deploy(...args);
    await c.waitForDeployment();
    kayit.adres[k] = await c.getAddress(); yaz();
    console.log("  kur " + k.padEnd(36) + kayit.adres[k]);
    return c;
  };

  /* 1 deploy */
  const hA = await kur(A, "HaberciCctp", "HaberciCctp", [A.usdc, MT, TM, A.domain]);
  const defter = await kur(A, "SepetDefteri", "SepetDefteri", [await hA.getAddress(), A.usdc]);
  const D = b32(await defter.getAddress());
  const kA = await kur(A, "SepetKasasi", "SepetKasasi", [await hA.getAddress(), A.usdc, A.domain, D]);
  const uA = await kur(A, "SepetUcu", "SepetUcu", [await hA.getAddress(), A.usdc, A.domain, D, ben]);
  const T = await kur(A, "ProvaJeton", "token", ["ARC PULSE prova", "PROVA", ARZ]);
  const vA = await kur(A, "ProvaJeton", "varlik", ["Prova varlik Arc", "PVARC", ARZ]);
  const hB = await kur(B, "HaberciCctp", "HaberciCctp", [B.usdc, MT, TM, B.domain]);
  const kB = await kur(B, "SepetKasasi", "SepetKasasi", [await hB.getAddress(), B.usdc, A.domain, D]);
  const uB = await kur(B, "SepetUcu", "SepetUcu", [await hB.getAddress(), B.usdc, A.domain, D, ben]);
  const vB = await kur(B, "ProvaJeton", "varlik", ["Prova varlik Base", "PVBASE", ARZ]);

  /* 2 wire and lock */
  await gonder(A, "Arc Haberci ikiz Base", () => hA.ikizEkle(B.domain, b32(kayit.adres["Base HaberciCctp"])));
  await gonder(B, "Base Haberci ikiz Arc", () => hB.ikizEkle(A.domain, b32(kayit.adres[A.ad + " HaberciCctp"])));
  await gonder(A, "Defter bagla Arc", async () => defter.bagla(A.domain, b32(await uA.getAddress()), b32(await kA.getAddress())));
  await gonder(A, "Defter bagla Base", async () => defter.bagla(B.domain, b32(await uB.getAddress()), b32(await kB.getAddress())));
  await gonder(A, "Arc Haberci kilitle", () => hA.kilitle());
  await gonder(B, "Base Haberci kilitle", () => hB.kilitle());
  await gonder(A, "Defter kilitle", () => defter.kilitle());

  /* 3 launch: $4 on Arc, $4 on Base */
  const usdcA = new Contract(A.usdc, ERC20, A.w), usdcB = new Contract(B.usdc, ERC20, B.w);
  await gonder(A, "launch onay 8 USDC", async () => usdcA.approve(await uA.getAddress(), 8_000_000n));
  const kalem = [[A.domain, b32(await vA.getAddress()), 4_000_000n], [B.domain, b32(await vB.getAddress()), 4_000_000n]];
  const mL = await gonder(A, "launch (Arc'tan, 8 $)", async () => uA.baslat(await T.getAddress(), ben, ARZ, kalem, [4n * 10n ** 18n, 4n * 10n ** 18n]));

  /* 4 relay the Base line */
  const aktar = async (kaynak, hedef, hHedef, makbuzHash, etiket) => {
    if (kayit.adim[etiket]) return;
    const m = await kaynak.p.getTransactionReceipt(makbuzHash);
    for (const ham of mesajlar(m)) {
      const { mesaj, imza } = await onayla(kaynak, makbuzHash, ham);
      await gonder(hedef, etiket, () => hHedef.teslim(mesaj, imza));
    }
  };
  await aktar(A, B, hB, kayit.adim["launch (Arc'tan, 8 $)"] || mL.hash, "Base teslim (launch kalemi)");
  const id = await defter.idOf(A.domain, b32(await T.getAddress()));
  console.log("  launch id " + id + "  Arc kasa " + Number(await kA.usdcBakiye(id)) / 1e6 + " $  Base kasa " + Number(await kB.usdcBakiye(id)) / 1e6 + " $");

  /* 5 fill both buys: give test units, get the dollars back */
  for (const [z, k, v, ad] of [[A, kA, vA, "Arc"], [B, kB, vB, "Base"]]) {
    await gonder(z, ad + " varlik onay", async () => v.approve(await k.getAddress(), ARZ));
    await gonder(z, ad + " alim doldur", async () => k.doldur(0, await k.istenen(0)));
  }

  /* 6 redeem half the supply, paid on Base */
  await gonder(A, "itfa onay", async () => T.approve(await uA.getAddress(), ARZ / 2n));
  const mI = await gonder(A, "itfa (yari arz, Base'de odenir)", async () => uA.itfa(await T.getAddress(), ARZ / 2n, B.domain, b32(ben)));
  await aktar(A, B, hB, kayit.adim["itfa (yari arz, Base'de odenir)"] || mI.hash, "Base teslim (itfa emri)");

  /* 7 fill both sells: Arc first, its payout crosses to Base */
  const onceB = await usdcB.balanceOf(ben);
  await gonder(A, "Arc satis onay", async () => usdcA.approve(await kA.getAddress(), 10_000_000n));
  const mS = await gonder(A, "Arc satis doldur", async () => kA.doldur(1, await kA.istenen(1)));
  await aktar(A, B, hB, kayit.adim["Arc satis doldur"] || mS.hash, "Base teslim (Arc'in odemesi)");
  await gonder(B, "Base satis onay", async () => usdcB.approve(await kB.getAddress(), 10_000_000n));
  await gonder(B, "Base satis doldur", async () => kB.doldur(1, await kB.istenen(1)));

  /* 8 check */
  const sonB = await usdcB.balanceOf(ben);
  console.log("  Base'de cuzdana itfa odemesi geldi (Arc kasasinin satisi CCTP ile): +" + Number(sonB - onceB) / 1e6 + " $ (Base satisina odenen dahil net)");
  console.log("  Arc kasa varlik " + (await kA.bakiye(id, await vA.getAddress())) + "  Base kasa varlik " + (await kB.bakiye(id, await vB.getAddress())));
  for (const z of [A, B]) {
    const u = new Contract(z.usdc, ERC20, z.p);
    console.log("  son " + z.ad.padEnd(5) + " USDC " + Number(await u.balanceOf(ben)) / 1e6 + "  gaz " + Number(await z.p.getBalance(ben)) / 1e18);
  }
  console.log("PROVA TAMAM");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); if (process.env.AYRINTI) console.error(String(e.stack || "").slice(0, 600), JSON.stringify(e.info || e.error || {}).slice(0, 1500)); process.exitCode = 1; })
  .finally(() => { for (const a of anviller) a.kill(); });
