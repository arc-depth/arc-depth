/* Mirrors the launchpad repository into the site's subfolder.

   Compares on content with line endings normalised, and writes back in the
   style the destination already used. Copying blind made all 454 files look
   modified when only the translated ones had actually changed, which turns
   a reviewable diff into an unreadable one. */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KAYNAK = "C:/arc-launchpad";
const HEDEF = path.join(process.cwd(), "docs", "arc-launchpad");

/* Not mirrored: code and tests that describe, in detail, how the deployed
   immutable contracts can be attacked. They stay in the repository and
   reach the site once the fixed generation they belong to is live. */
const GIZLI = ["contracts/nesil4/", "nesil2-test/test/Nesil4.t.sol"];
const izlenen = cp.execSync("git -C " + KAYNAK + " ls-files", { encoding: "utf8" })
  .trim().split("\n").filter((f) => !GIZLI.some((g) => f.startsWith(g)));
const mevcut = cp.execSync("git ls-files docs/arc-launchpad", { encoding: "utf8" })
  .trim().split("\n").map((x) => x.replace("docs/arc-launchpad/", ""));

const duz = (b) => b.toString("binary").split("\r\n").join("\n");
/* Binary files (wasm, images, fonts) are copied byte for byte: their 0x0d 0x0a
   pairs are data, not line endings. Normalising them corrupted the published
   Sui template wasm and the wallet icon. Same test git uses: a NUL byte early. */
const IKILI = /\.(wasm|png|jpe?g|gif|ico|webp|woff2?|ttf|otf|pdf|mp4|webm|zip|gz|bin|mv)$/i;
const ikiliMi = (f, b) => IKILI.test(f) || b.subarray(0, 8000).includes(0);

let yazilan = 0, yeniDosya = 0, silinen = 0;
for (const f of izlenen) {
  const a = path.join(KAYNAK, f), b = path.join(HEDEF, f);
  const kaynak = fs.readFileSync(a);
  let hedef = null;
  try { hedef = fs.readFileSync(b); } catch (e) { /* new file */ }
  if (ikiliMi(f, kaynak)) {
    if (hedef && kaynak.equals(hedef)) continue;
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.writeFileSync(b, kaynak);
    if (hedef) yazilan++; else yeniDosya++;
    continue;
  }
  if (hedef && duz(kaynak) === duz(hedef)) continue;
  const crlf = hedef !== null && duz(hedef) !== hedef.toString("binary");
  const metin = duz(kaynak);
  const cikti = crlf ? metin.split("\n").join("\r\n") : metin;
  fs.mkdirSync(path.dirname(b), { recursive: true });
  fs.writeFileSync(b, Buffer.from(cikti, "binary"));
  if (hedef) yazilan++; else yeniDosya++;
}

const kume = new Set(izlenen);
for (const f of mevcut) {
  if (kume.has(f)) continue;
  try { fs.unlinkSync(path.join(HEDEF, f)); silinen++; } catch (e) { /* already gone */ }
}

console.log("guncellenen " + yazilan + " · yeni " + yeniDosya + " · silinen " + silinen);
