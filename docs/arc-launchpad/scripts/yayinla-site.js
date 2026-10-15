"use strict";
/* ===========================================================================
 * yayinla-site.js — commit the site changes and publish them
 *
 *   node scripts/yayinla-site.js ["commit message"]
 *
 * 1. commits docs/ changes in C:\arc-launchpad (if any)
 * 2. mirrors the repo into the arc-depth checkout (docs/arc-launchpad/)
 *    with the existing aynala.js (line endings preserved)
 * 3. commits and pushes arc-depth main, which GitHub Pages serves
 * Nothing on chain; no keys are read.
 * =========================================================================== */
const cp = require("child_process");

const KOK = "C:/arc-launchpad";
const SP = "C:/Users/omen/AppData/Local/Temp/claude/C--Users-omen/29ba58cd-5a89-4b3e-9b6e-2475a84ecc0e/scratchpad";
const AYNA = SP + "/yayin";
const IMZA = "\n\nCo-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>\n";
const git = (cwd, args, input) => {
  console.log("$ git " + args.join(" ") + "   (" + cwd + ")");
  return cp.execFileSync("git", args, { cwd, input, encoding: "utf8", stdio: [input ? "pipe" : "ignore", "pipe", "inherit"] });
};
const commit = (cwd, mesaj) => {
  if (!git(cwd, ["diff", "--cached", "--name-only"]).trim()) { console.log("  nothing to commit"); return; }
  git(cwd, ["commit", "-q", "-F", "-"], mesaj + IMZA);
};

const mesaj = process.argv.slice(2).join(" ") ||
  "Site: seven chains on the home page; GENESIS page retries rate-limited RPCs and shows live addresses";

git(KOK, ["add", "docs"]);
commit(KOK, mesaj);

console.log("$ node aynala.js   (" + AYNA + ")");
console.log(cp.execFileSync("node", [SP + "/aynala.js"], { cwd: AYNA, encoding: "utf8" }));

git(AYNA, ["add", "-A", "docs"]);
commit(AYNA, "launchpad: " + mesaj);
git(AYNA, ["push", "origin", "HEAD:main"]);
console.log(git(AYNA, ["log", "--oneline", "-1"]));
console.log("published: https://arc-depth.github.io/arc-depth/launchpad/");
