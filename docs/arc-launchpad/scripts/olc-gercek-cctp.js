"use strict";
/* ===========================================================================
 * olc-gercek-cctp.js — AŞAMA 4 (giden bacak): Arc'ın GERÇEK CCTP'si bizim
 *                      çağrımızı kabul ediyor mu
 *
 *   node scripts/olc-gercek-cctp.js
 *
 * WHY THIS IS NOT A FORK TEST
 *   It was meant to be. Foundry was installed and anvil forked Arc
 *   correctly — chain 5042, block 25,220,678 — and then every USDC
 *   transferFrom died:
 *
 *     USDC.transferFrom -> 0x1800…0001::isBlocklisted(...)
 *                          <- OpcodeNotFound
 *
 *   Arc is not a vanilla EVM chain. Its USDC consults a custom precompile
 *   for the blocklist, whose on-chain code is the single byte 0xef, and
 *   anvil cannot execute it. `anvil_setCode` with a stub fixes eth_call and
 *   does NOT fix the transaction path — the two disagree — so a forked Arc
 *   cannot burn USDC at all, and the outbound leg is untestable there.
 *
 *   The real node implements the precompile. So this measures the Arc side
 *   the way everything else in this project is measured: one eth_call
 *   against mainnet with the harness injected by state override, running
 *   the real TokenMessenger, the real USDC and the real precompile inside
 *   one simulated transaction.
 *
 * WHAT A PASS PROVES, AND WHAT IT DOES NOT
 *   Proves: the signature is right, the parameters are accepted, the
 *   allowance and the burn work, and the balance falls by exactly what was
 *   sent. Both variants — plain and with a hook.
 *
 *   Does not prove: that the money arrives. The mint needs Circle's
 *   attestation, which is off-chain and cannot exist for a simulated burn.
 *   That half belongs to the Ethereum fork, where anvil works because
 *   Ethereum is a vanilla EVM chain.
 * =========================================================================== */
const { Interface } = require("ethers");
const fs = require("fs");
const path = require("path");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const H = "0x00000000000000000000000000000000000000F3";
const CAGIRAN = "0x2222222222222222222222222222222222222222";

/* Measured on chain, not read from documentation. */
const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d";
const TOKEN_MINTER = "0xfd78EE919681417d192449715b2594ab58f5D002";
const BLOKLIST_PRECOMPILE = "0x1800000000000000000000000000000000000001";

const B = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "build", n + ".json"), "utf8"));
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const { kisaIsim: hataAdi, yaz: revertYaz } = require("./revert-coz");

async function rpc(m, p) {
  let b = 2500;
  for (let k = 0; ; k++) {
    const r = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: p })
    });
    const j = await r.json();
    if (!j.error) return j.result;
    if (k < 6 && /rate|limit|429/i.test(j.error.message)) { await bekle(b); b *= 2; continue; }
    const e = new Error(j.error.message); e.data = j.error.data; throw e;
  }
}

const U = (v) => "$" + (Number(v) / 1e6).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const V = (v) => BigInt(v.toString());

(async () => {
  let kotu = 0;
  const ok = (iyi, ad, not) => { if (!iyi) kotu++; console.log("  " + (iyi ? "PASS" : "KOTU") + "  " + ad + (not ? "   " + not : "")); };

  console.log("ASAMA 4 (GIDEN BACAK) — ARC'IN GERCEK CCTP'SI");
  console.log("");

  /* ---- 0. why there is no fork here ------------------------------- */
  console.log("0) ARC VANILYA EVM DEGIL — forkun neden kullanilamadigi");
  {
    const kod = await rpc("eth_getCode", [BLOKLIST_PRECOMPILE, "latest"]);
    console.log("     bloklist precompile " + BLOKLIST_PRECOMPILE);
    console.log("     zincirdeki kodu     " + kod);
    ok(kod === "0xef",
      "precompile'in kodu tek bayt: 0xef",
      "anvil bunu calistiramiyor; USDC transferFrom OpcodeNotFound ile oluyor");
    await bekle(500);
  }

  /* ---- 1. the real call ------------------------------------------- */
  console.log("");
  console.log("1) GERCEK depositForBurn VE depositForBurnWithHook");

  const T = B("TestGercekCCTP");
  const iface = new Interface(T.abi);

  /* Ethereum, because Arc's CCTP has a linked token pair for domain 0 and
     it is the first remote chain this project targets. */
  const DOMAIN = 0;
  const ALICI = "0x000000000000000000000000fc368b88148b0aece910943a66a1829dbadf105c";
  const MIKTAR = 100_000_000n;      // $100
  const AZAMI_UCRET = 1_000n;       // $0.001 ceiling
  const KESINLIK = 2000;            // finalized; free in both directions

  const r = await rpc("eth_call", [
    { from: CAGIRAN, to: H, gas: "0x4000000",
      data: iface.encodeFunctionData("run", [DOMAIN, ALICI, MIKTAR, AZAMI_UCRET, KESINLIK]) },
    "latest",
    { [H]: { code: T.deployedBytecode, balance: "0x" + (10n ** 21n).toString(16) } }
  ]);
  const s = iface.decodeFunctionResult("run", r)[0];

  console.log("     localMinter       " + s.localMinter);
  console.log("     uzak messenger(0) " + s.uzakMessenger);
  console.log("     denylistte        " + s.denylistte);
  console.log("     bakiye            " + U(s.bakiyeOnce) + "  ->  " + U(s.bakiyeSonra));
  console.log("     harcanan          " + U(s.harcanan));
  console.log("     kalan allowance   " + U(s.allowanceSonra));

  ok(s.localMinter.toLowerCase() === TOKEN_MINTER.toLowerCase(),
    "TokenMessenger'in minter'i olculen TokenMinterV2", s.localMinter);
  ok(V(s.uzakMessenger) !== 0n,
    "hedef domain icin uzak messenger tanimli", "domain " + DOMAIN);
  ok(s.denylistte === false, "cagiran denylistte degil");

  if (!s.kancaliGecti) {
    console.log("     kancali cagri reverti:");
    revertYaz(s.kancaliSebep, 3);
  }
  ok(s.kancaliGecti === true,
    "depositForBurnWithHook GERCEK SOZLESMEDE GECTI",
    "kanca tokenId ve transferId tasiyor");

  if (!s.sadeGecti) {
    console.log("     sade cagri reverti:");
    revertYaz(s.sadeSebep, 3);
  }
  ok(s.sadeGecti === true,
    "depositForBurn (kancasiz) de gecti",
    "bir hata olsaydi kancaya mi CCTP'ye mi ait oldugu ayirt edilebilirdi");

  /* Two calls of MIKTAR each, so the balance must have fallen by exactly
     twice it. Checking the amount rather than merely "it did not revert"
     is what rules out a call that succeeded and moved nothing. */
  ok(V(s.harcanan) === MIKTAR * 2n,
    "BAKIYE TAM OLARAK IKI YAKMA KADAR DUSTU",
    U(MIKTAR * 2n) + " — basarili ama hicbir sey tasimayan bir cagri degil");
  ok(V(s.allowanceSonra) === 0n,
    "allowance tam tukendi", "verilen izin kadar harcandi, fazlasi degil");

  console.log("");
  console.log("  GIDEN BACAK GERCEK. Varista mint icin Circle'in zincir disi");
  console.log("  attestation'i gerekiyor; simule edilmis bir yakma icin o");
  console.log("  uretilemez, o yarim Ethereum forkunun isi.");

  console.log("");
  console.log(kotu === 0 ? "TUMU GECTI" : kotu + " KOTU");
  process.exit(kotu === 0 ? 0 : 1);
})().catch((e) => {
  console.error("HATA " + e.message);
  if (e.data) revertYaz(String(e.data), 1);
  process.exit(1);
});
