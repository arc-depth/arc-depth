"use strict";
/* ===========================================================================
 * derle.js — compile the contracts
 *
 *   node scripts/derle.js [SozlesmeAdi]
 *
 * Output goes to build/<Name>.json with the ABI and both bytecodes.
 *
 * The import resolver reaches into node_modules, so the Uniswap v4 interfaces
 * are used exactly as published rather than copied into this repository. A
 * copied interface drifts silently; an imported one cannot.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const solc = require("solc");

const KOK = path.join(__dirname, "..");
const SRC = path.join(KOK, "contracts");
const OUT = path.join(KOK, "build");

function cozumle(yol) {
  /* solc asks for every import by the path written in the source. Node
   * modules are resolved from node_modules, everything else relative to
   * contracts/. */
  /* LayerZero's OApp/OFT are written against OpenZeppelin 5 (Ownable takes
   * the owner in its constructor), while the package installed as
   * @openzeppelin/contracts is 4.7.3, pulled in by other dependencies. No
   * contract of ours imports OpenZeppelin directly, so pointing the bare
   * name at the 5.3.0 copy changes nothing that was built before. */
  if (yol.startsWith("@openzeppelin/contracts/")) {
    yol = yol.replace("@openzeppelin/contracts/", "@openzeppelin/contracts-5.3.0/");
  }
  const adaylar = yol.startsWith("@")
    ? [path.join(KOK, "node_modules", yol)]
    : [path.join(SRC, yol), path.join(KOK, yol)];
  for (const a of adaylar) {
    try { return { contents: fs.readFileSync(a, "utf8") }; } catch (e) { /* next */ }
  }
  return { error: "bulunamadi: " + yol };
}

function derle(dosya) {
  const kaynak = fs.readFileSync(path.join(SRC, dosya), "utf8");
  const girdi = {
    language: "Solidity",
    sources: { [dosya]: { content: kaynak } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true,
      /* immutableReferences says WHICH BYTES of the runtime code hold
         immutable values. Without it, comparing a deployed contract to its
         compiled bytecode cannot tell an immutable from a changed jump
         target: every contract with an immutable differs from its build
         artifact, and the only choices left are to call that "probably
         fine" or to fail everything. denetim-dagitim.js needs it to say
         anything honest. */
      outputSelection: { "*": { "*": [
        "abi", "evm.bytecode.object",
        "evm.deployedBytecode.object", "evm.deployedBytecode.immutableReferences"
      ] } }
    }
  };
  const cikti = JSON.parse(solc.compile(JSON.stringify(girdi), { import: cozumle }));

  const hatalar = (cikti.errors || []).filter((e) => e.severity === "error");
  const uyarilar = (cikti.errors || []).filter((e) => e.severity === "warning");
  for (const u of uyarilar) console.log("  UYARI " + String(u.formattedMessage).split("\n")[0]);
  if (hatalar.length) {
    for (const h of hatalar) console.log("\nHATA " + h.formattedMessage);
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  let n = 0;
  for (const [ad, c] of Object.entries(cikti.contracts[dosya] || {})) {
    const deployed = c.evm.deployedBytecode.object || "";
    if (!deployed) continue;
    fs.writeFileSync(path.join(OUT, ad + ".json"), JSON.stringify({
      contractName: ad,
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + deployed,
      immutableReferences: c.evm.deployedBytecode.immutableReferences || {}
    }, null, 1));
    console.log("  " + ad.padEnd(22) + (deployed.length / 2).toLocaleString("en-US").padStart(7) + " bayt");
    n++;
  }
  return n;
}

/* Walks contracts/ including subdirectories, so test doubles can live in
 * contracts/test/ without being mistaken for production contracts. */
function solDosyalari(dizin, onek) {
  const out = [];
  for (const e of fs.readdirSync(dizin, { withFileTypes: true })) {
    const rel = onek ? onek + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...solDosyalari(path.join(dizin, e.name), rel));
    else if (e.name.endsWith(".sol")) out.push(rel);
  }
  return out;
}

const hedef = process.argv[2];
const dosyalar = hedef ? [hedef + ".sol"] : solDosyalari(SRC, "");
console.log("DERLE  (solc " + solc.version() + ")");
let toplam = 0;
for (const d of dosyalar) { console.log(d); toplam += derle(d); }
console.log("\n" + toplam + " sozlesme -> build/");
