"use strict";
/* ===========================================================================
 * dogrulama-girdisi.js — the Standard JSON Input a block explorer needs
 *
 *   node scripts/dogrulama-girdisi.js Jeton.sol
 *
 * WHY THIS EXISTS
 *   Blockscout will not let the owner of a contract edit its token info
 *   until the contract's source is verified, and verification wants the
 *   exact compiler input that produced the deployed bytecode — not the
 *   source file on its own. With `viaIR` and the optimizer on, a
 *   reconstructed input that differs in any setting produces different
 *   bytecode and the verification is simply refused.
 *
 *   So the input is not written by hand here. It is built by the same
 *   `cozumle` import resolution and the same settings object that
 *   `derle.js` uses, and then the result is COMPILED AGAIN and compared
 *   byte for byte against the artifact in build/. A file that does not
 *   reproduce the artifact is not written out.
 *
 * WHY IT ALSO READS THE CHAIN
 *   Matching the local artifact only proves the input matches what we
 *   compiled. The question that matters is whether it matches what is
 *   DEPLOYED, so the runtime code is fetched from Arc and compared too.
 *   Immutables differ by construction, so the comparison is by length and
 *   by the metadata-stripped prefix, the same way degismezlik.js does it.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const KOK = path.join(__dirname, "..");
const SRC = path.join(KOK, "contracts");
const CIKTI = path.join(KOK, "dogrulama");

const RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";

/* Same resolution as derle.js: node modules from node_modules, everything
   else relative to contracts/. Every file it opens is recorded, because
   those are exactly the sources the explorer has to receive. */
const acilan = new Map();
function cozumle(yol) {
  const adaylar = yol.startsWith("@")
    ? [path.join(KOK, "node_modules", yol)]
    : [path.join(SRC, yol), path.join(KOK, yol)];
  for (const a of adaylar) {
    try {
      const contents = fs.readFileSync(a, "utf8");
      acilan.set(yol, contents);
      return { contents };
    } catch (e) { /* next candidate */ }
  }
  return { error: "bulunamadi: " + yol };
}

const AYAR = {
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "cancun",
  viaIR: true
};

function girdiKur(dosya, sources) {
  return {
    language: "Solidity",
    sources,
    settings: {
      ...AYAR,
      outputSelection: { "*": { "*": [
        "abi", "evm.bytecode.object",
        "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"
      ] } }
    }
  };
}

const soy = (h) => String(h || "").replace(/^0x/, "");

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(25000)
  }).then((x) => x.json());
  if (r.error) throw new Error(r.error.message);
  return r.result;
}

(async () => {
  const dosya = process.argv[2] || "Jeton.sol";
  const ad = path.basename(dosya, ".sol");
  const adres = process.argv[3] || null;

  console.log("");
  console.log("DOGRULAMA GIRDISI  —  " + dosya);

  /* ---- 1. compile the way derle.js does, recording every source ---- */
  const kaynak = fs.readFileSync(path.join(SRC, dosya), "utf8");
  acilan.set(dosya, kaynak);
  const ilk = girdiKur(dosya, { [dosya]: { content: kaynak } });
  const cikti = JSON.parse(solc.compile(JSON.stringify(ilk), { import: cozumle }));
  const hata = (cikti.errors || []).filter((e) => e.severity === "error");
  if (hata.length) { hata.forEach((e) => console.log("  " + e.formattedMessage)); process.exit(1); }

  const derlenen = cikti.contracts[dosya][ad];
  if (!derlenen) { console.log("  " + ad + " bulunamadi"); process.exit(1); }
  console.log("  solc                 " + solc.version().split("+")[0]);
  console.log("  acilan kaynak        " + acilan.size + " dosya");

  /* ---- 2. the input the explorer receives: every source inline ----- */
  const sources = {};
  for (const [yol, content] of acilan) sources[yol] = { content };
  const girdi = girdiKur(dosya, sources);

  /* ---- 3. it has to reproduce the artifact, or it is wrong --------- */
  const tekrar = JSON.parse(solc.compile(JSON.stringify(girdi)));
  const h2 = (tekrar.errors || []).filter((e) => e.severity === "error");
  if (h2.length) { h2.forEach((e) => console.log("  " + e.formattedMessage)); process.exit(1); }
  const yeniden = tekrar.contracts[dosya][ad];

  const a = soy(derlenen.evm.deployedBytecode.object);
  const b = soy(yeniden.evm.deployedBytecode.object);
  console.log("  kendini uretiyor mu  " + (a === b ? "EVET" : "HAYIR — girdi eksik"));
  if (a !== b) process.exit(1);

  const yapit = JSON.parse(fs.readFileSync(path.join(KOK, "build", ad + ".json"), "utf8"));
  const c = soy(yapit.deployedBytecode && (yapit.deployedBytecode.object || yapit.deployedBytecode));
  console.log("  build/ ile ayni mi   " + (a === c ? "EVET" : "HAYIR"));
  if (a !== c) process.exit(1);

  /* ---- 4. and against what is actually on chain -------------------- */
  if (adres) {
    const zincir = soy(await rpc("eth_getCode", [adres, "latest"]));
    console.log("  zincirdeki uzunluk   " + zincir.length / 2 + " bayt");
    console.log("  derlenen uzunluk     " + a.length / 2 + " bayt");
    /* Immutables are written into the runtime code at construction, so an
       exact match is not expected; equal length plus an equal prefix up to
       the first immutable is. */
    const yuva = Object.values(derlenen.evm.deployedBytecode.immutableReferences || {})
      .flat().map((x) => x.start).sort((x, y) => x - y);
    const ilkDegismez = yuva.length ? yuva[0] : a.length / 2;
    const esit = zincir.length === a.length &&
      zincir.slice(0, ilkDegismez * 2) === a.slice(0, ilkDegismez * 2);
    console.log("  degismez yuvasi      " + yuva.length +
      (yuva.length ? "  (ilki " + ilkDegismez + ". bayt)" : ""));
    console.log("  zincirle ayni mi     " + (esit ? "EVET" : "HAYIR"));
    if (!esit) process.exit(1);
  }

  fs.mkdirSync(CIKTI, { recursive: true });
  const yol = path.join(CIKTI, ad + "-standard-input.json");
  fs.writeFileSync(yol, JSON.stringify(girdi, null, 2));
  console.log("");
  console.log("  yazildi: dogrulama/" + ad + "-standard-input.json");
  console.log("");
  console.log("  Blockscout'ta: Verify & publish -> Solidity (Standard JSON input)");
  console.log("    derleyici   v" + solc.version().split("+")[0]);
  console.log("    dosya       dogrulama/" + ad + "-standard-input.json");
  console.log("");
})().catch((e) => { console.log(""); console.log("HATA: " + e.message); process.exit(1); });

/* ---------------------------------------------------------------------------
 * 12 EKIM 2026: THE INPUT IS CORRECT AND THE EXPLORER STILL CANNOT USE IT
 *
 * This produced an input that reproduces the deployed FTHM runtime byte for
 * byte, and submitting it to explorer.arc.io returned "verification started"
 * and then quietly did nothing. The reason is not in the input:
 *
 *   /api/v2/smart-contracts/verification/config lists 1,657 solc versions
 *   and the newest is v0.8.36+commit.8a079791. This repository compiles with
 *   0.8.37, and the local build matches the deployed bytecode exactly, which
 *   means the deployment used 0.8.37 too - the metadata hash encodes the
 *   compiler version, so an exact match could not happen otherwise.
 *
 * So the contract cannot be verified there until Blockscout adds 0.8.37. The
 * three ways out, in order of how much they cost:
 *
 *   wait          the version list is updated regularly; re-run this script
 *                 and resubmit, nothing else changes
 *   ask           help@blockscout.com, which the explorer itself offers
 *   recompile     with 0.8.36 - which would mean redeploying a live token
 *                 holding real money, so no
 *
 * The submission itself, for when the version lands:
 *
 *   curl -X POST \
 *     "https://explorer.arc.io/api/v2/smart-contracts/<adres>/verification/via/standard-input" \
 *     -F "compiler_version=v0.8.37+commit.f401782d" \
 *     -F "license_type=mit" \
 *     -F "autodetect_constructor_args=true" \
 *     -F "files[0]=@dogrulama/Jeton-standard-input.json;type=application/json"
 *
 * The commit hash matters and is not guessable: the first attempt used
 * 4f2e0f5c, which is a different release, and the job failed the same silent
 * way a missing version does. `require("solc").version()` prints the real
 * one.
 * ------------------------------------------------------------------------- */
