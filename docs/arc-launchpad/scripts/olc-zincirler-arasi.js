"use strict";
/* ===========================================================================
 * olc-zincirler-arasi.js — cross-chain collateral, measured end to end
 *
 *   node scripts/olc-zincirler-arasi.js
 *
 * THE QUESTION THIS ANSWERS
 *   Can collateral come from, or go to, another chain without breaking the
 *   one property the vault exists to have — that the claim per token is
 *   exact at every instant?
 *
 *   The answer turns out to be asymmetric, and nothing in the docs says so:
 *   INFLOW already works and needs no new code, while OUTFLOW cannot be
 *   built without adding a withdraw. This script measures both halves
 *   rather than arguing them.
 *
 * WHY EACH CHECK IS HERE
 *   1. The bridges on Arc, from the chain itself — not from a changelog.
 *      This project has already reported CCIP and CCTP as absent twice,
 *      once from checking Ethereum addresses and once from not rechecking
 *      after Arc's mainnet launch.
 *
 *   2. What those bridges will CARRY. "There is a lane" and "the lane moves
 *      your money" are different claims, and the second one is the only one
 *      that matters for collateral.
 *
 *   3. Whether the vault counts an unsolicited inbound transfer. A CCTP
 *      mint calls nothing — it mints to a recipient. So if the vault
 *      credited only besle(), every cross-chain deposit would land and be
 *      silently stranded, and nobody would find out until one arrived.
 * =========================================================================== */
const { Interface, AbiCoder, id } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const USDC = "0x3600000000000000000000000000000000000000";
const H = "0x00000000000000000000000000000000000000Ec";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

/* CCTP v2, standard addresses, verified to hold code on Arc below. */
const CCTP = {
  tokenMessenger: "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
  messageTransmitter: "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
  tokenMinter: "0xfd78EE919681417d192449715b2594ab58f5D002"
};
const CCIP_ROUTER = "0xB79791184973589c38e114D43Eb8E4588C283A18";
const ARC_DOMAIN = 26;
const ARC_SELECTOR = "6370580034781731079";

const coder = AbiCoder.defaultAbiCoder();
const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p })
    });
    const j = await r.json();
    if (!j.error) return j.result;
    if (k < 6 && /rate|limit|429|too large/i.test(j.error.message)) { await bekle(b); b *= 2; continue; }
    return null;
  }
}

const DOM = {
  0: "Ethereum", 1: "Avalanche", 2: "OP", 3: "Arbitrum", 4: "Noble", 5: "Solana",
  6: "Base", 7: "Polygon", 8: "Sui", 9: "Aptos", 10: "Unichain", 11: "Linea",
  12: "Codex", 13: "Sonic", 14: "World", 15: "Sei", 16: "XDC", 17: "HyperEVM",
  18: "Ink", 19: "Plume", 20: "BNB", 26: "Arc"
};

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ZINCIRLER ARASI TEMINAT — olculdu, okunmadi");
  console.log("");

  /* ---- 1. the bridges are really there ----------------------------- */
  console.log("1) ARC'TAKI KOPRULER ZINCIRDE VAR MI");
  for (const [ad, adres] of [
    ["CCTP TokenMessengerV2", CCTP.tokenMessenger],
    ["CCTP MessageTransmitterV2", CCTP.messageTransmitter],
    ["CCTP TokenMinterV2", CCTP.tokenMinter],
    ["CCIP Router", CCIP_ROUTER]
  ]) {
    const kod = await rpc("eth_getCode", [adres, "latest"]);
    const var_ = kod && kod !== "0x";
    ok(var_, ad + " kodlu", var_ ? ((kod.length - 2) / 2) + " bayt" : "KOD YOK");
    await bekle(500);
  }

  const ld = await rpc("eth_call", [
    { to: CCTP.messageTransmitter, data: id("localDomain()").slice(0, 10) }, "latest"
  ]);
  const domain = ld ? parseInt(ld, 16) : null;
  ok(domain === ARC_DOMAIN, "Arc'in CCTP domain kimligi " + ARC_DOMAIN, String(domain));

  /* ---- 2. what CCTP will carry ------------------------------------- */
  console.log("");
  console.log("2) CCTP ARC'TA HANGI TOKENI BASABILIYOR");

  /* TokenPairLinked enumerates every (remoteDomain, remoteToken) ->
     localToken the minter accepts. The pairs are registered at setup, so
     the scan starts from the minter's first block — found by binary search
     once and written down, because scanning 25 million blocks per run to
     rediscover it would be absurd. */
  const ILK_BLOK = 710_000;
  const SON_BLOK = 1_000_000;
  const ADIM = 10_000;
  const konu = id("TokenPairLinked(address,uint32,bytes32)");
  const olaylar = [];
  for (let b = ILK_BLOK; b < SON_BLOK; b += ADIM) {
    const l = await rpc("eth_getLogs", [{
      address: CCTP.tokenMinter, topics: [konu],
      fromBlock: "0x" + b.toString(16), toBlock: "0x" + (b + ADIM - 1).toString(16)
    }]);
    if (Array.isArray(l) && l.length) olaylar.push(...l);
    await bekle(300);
  }

  const yerel = new Map();
  for (const e of olaylar) {
    const d = coder.decode(["address", "uint32", "bytes32"], e.data);
    const k = d[0].toLowerCase();
    if (!yerel.has(k)) yerel.set(k, new Set());
    yerel.get(k).add(Number(d[1]));
  }

  ok(olaylar.length > 0, "eslestirme olaylari bulundu", olaylar.length + " olay");
  for (const [tok, ds] of yerel) {
    console.log("     " + tok + "  <-  " + ds.size + " domain");
    console.log("       " + [...ds].sort((a, b) => a - b).map((d) => DOM[d] || "#" + d).join(", "));
  }
  ok(yerel.size === 1 && yerel.has(USDC.toLowerCase()),
    "CCTP ARC'TA YALNIZCA USDC BASIYOR",
    yerel.size + " token eslestirilmis — baska varlik yok");
  const usdcDomain = yerel.get(USDC.toLowerCase());
  ok(usdcDomain && usdcDomain.size >= 20,
    "USDC yirmiden fazla zincirden gelebiliyor",
    (usdcDomain ? usdcDomain.size : 0) + " domain");

  /* ---- 3. fast vs standard, from Circle's own fee service ---------- */
  console.log("");
  console.log("3) HIZ VE UCRET — Circle'in kendi servisinden");
  const yollar = [[6, 26, "Base -> Arc"], [0, 26, "Ethereum -> Arc"],
                  [5, 26, "Solana -> Arc"], [26, 6, "Arc -> Base"], [26, 0, "Arc -> Ethereum"]];
  let hizliVar = 0;
  for (const [k, h, ad] of yollar) {
    try {
      const r = await fetch("https://iris-api.circle.com/v2/burn/USDC/fees/" + k + "/" + h);
      const j = await r.json();
      if (!Array.isArray(j)) { console.log("     " + ad.padEnd(20) + " cevap yok"); continue; }
      const hizli = j.find((x) => x.finalityThreshold === 1000);
      const standart = j.find((x) => x.finalityThreshold === 2000);
      if (hizli) hizliVar++;
      console.log("     " + ad.padEnd(20) +
        " hizli: " + (hizli ? hizli.minimumFee + " bps" : "YOK") +
        "   standart: " + (standart ? standart.minimumFee + " bps" : "YOK"));
    } catch (e) {
      console.log("     " + ad.padEnd(20) + " sorgulanamadi");
    }
    await bekle(400);
  }
  ok(hizliVar === yollar.length, "her yonde Fast Transfer var",
    hizliVar + "/" + yollar.length + " — eşik 1000, saniyeler mertebesinde");

  /* ---- 4. CCIP carries messages, not USDC -------------------------- */
  console.log("");
  console.log("4) CCIP USDC TASIYOR MU");
  let ccipUsdc = null;
  try {
    const r = await fetch("https://docs.chain.link/api/ccip/v1/lanes?environment=mainnet&sourceChainId=5042");
    const j = await r.json();
    const hatlar = Object.values(j.data || {}).filter(
      (l) => String(l.sourceChain && l.sourceChain.chainId) === "5042"
    );
    const tasinan = new Set();
    for (const l of hatlar) for (const t of (l.supportedTokens || [])) tasinan.add(t.symbol || String(t));
    console.log("     Arc'tan cikan hat: " + hatlar.length);
    console.log("     bu hatlarda tasinan token: " + ([...tasinan].join(", ") || "yok"));
    ccipUsdc = [...tasinan].some((s) => String(s).toUpperCase() === "USDC");
    ok(hatlar.length >= 5, "CCIP'de Arc'tan cikan hat var", hatlar.length + " hat");
    ok(ccipUsdc === false, "CCIP HICBIR HATTA USDC TASIMIYOR",
      "yani CCIP bu projede mesaj hatti, deger hatti degil");
  } catch (e) {
    ok(false, "CCIP dizini sorgulanabildi", e.message);
  }

  /* ---- 5. the property the whole design rests on ------------------- */
  console.log("");
  console.log("5) KASA, BESLE CAGRILMADAN GELEN TRANSFERI SAYIYOR MU");
  console.log("     (CCTP mint hicbir sey cagirmaz — yalnizca alicisina basar)");
  {
    const yol = path.join(__dirname, "..", "teminat-evreni.json");
    if (!fs.existsSync(yol)) {
      ok(false, "teminat-evreni.json var", "once: node scripts/olc-besleyiciler.js");
    } else {
      const E = JSON.parse(fs.readFileSync(yol, "utf8"));
      const T = B("TestEvren");
      const iface = new Interface(T.abi);
      const miktar = 250_000_000n;        // $250
      const r = await rpc("eth_call", [
        { from: CAGIRAN, to: H, gas: "0x4000000",
          data: iface.encodeFunctionData("dogrudanTransferTesti", [
            USDC,
            E.varliklar.map((v) => v.token),
            E.varliklar.map((v) => v.proxy),
            [4000, 2500, 1500, 1000, 1000],
            miktar
          ]) },
        "latest",
        { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 24n).toString(16) } }
      ]);
      if (!r) {
        ok(false, "dogrudan transfer testi kosturulabildi", "eth_call cevap vermedi");
      } else {
        const d = iface.decodeFunctionResult("dogrudanTransferTesti", r);
        const V = (x) => BigInt(x.toString());
        const U = (x) => "$" + (Number(x) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        console.log("     gonderilen " + U(miktar));
        console.log("     bakiye " + U(d[1]) + " -> " + U(d[3]) +
          "    hak " + (Number(d[0]) / 1e36).toExponential(3) + " -> " + (Number(d[2]) / 1e36).toExponential(3) +
          "    sepet " + U(d[4]) + " -> " + U(d[5]));
        ok(V(d[3]) - V(d[1]) === miktar, "BAKIYE TAM GONDERILEN KADAR ARTTI");
        ok(V(d[2]) > V(d[0]), "HAK/TOKEN YUKSELDI — davetsiz transfer tabani buyutuyor");
        ok(V(d[5]) - V(d[4]) === miktar, "SEPET DEGERI TAM GONDERILEN KADAR ARTTI");
      }
    }
  }

  /* ---- 6. and the asymmetry, stated ------------------------------- */
  console.log("");
  console.log("6) SONUC — NEDEN GIRIS SERBEST, CIKIS YOK");
  console.log("     GIRIS: CCTP alicisina basar, hicbir sey cagirmaz. Kasa");
  console.log("            bakiyesini saydigi icin 25 zincirden gelen USDC");
  console.log("            SIFIR yeni kodla tabana ekleniyor — yeni guven");
  console.log("            varsayimi da yok, cunku kasa kimseye bir sey");
  console.log("            gondermiyor.");
  console.log("     CIKIS: Teminati baska zincire gondermek, cagiranin HEDEF");
  console.log("            verdigi bir fonksiyon gerektirir ve o fonksiyon");
  console.log("            adi ne olursa olsun withdraw'dir. Ayrica CCTP");
  console.log("            kaynakta yakar, hedefte basar: arada kasanin");
  console.log("            bakiyesi dusmus ve hicbir sey ulasmamistir, yani");
  console.log("            o pencerede hak duser ve iade eden eksik alir.");
  console.log("            Fast Transfer bu pencereyi saniyelere indiriyor");
  console.log("            ama sifire indirmiyor — ve hak her an tam olmak");
  console.log("            zorunda.");
  console.log("");
  console.log("     UYARI: Sepette OLMAYAN bir varlik kasaya gonderilirse");
  console.log("            iade onu dagitmaz ve sepet degeri onu saymaz —");
  console.log("            orada kalir. Zincirler arasi giris yalnizca");
  console.log("            sepetteki varlik icin anlamli.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => { console.error("HATA " + e.message); process.exit(1); });
