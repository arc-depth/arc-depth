"use strict";
/* ===========================================================================
 * genesis-koruma.js — what GENESIS never talks about: ARC PULSE's own
 * wallets, keys, trading bot and internal systems.
 *
 *   node scripts/genesis-koruma.js      how many own addresses are guarded
 *
 * Three gates, each refusing rather than trimming:
 *   1. the question: asks for keys/seeds, or about our wallets, bot,
 *      servers, prompt or infrastructure, or names one of our addresses
 *   2. live research: our addresses are never looked up
 *   3. the answer: one of our addresses, or anything shaped like a secret
 *      key, never leaves
 * Own addresses are derived here from the key files at load; the keys
 * themselves are dropped at once and never reach the model, a log or a
 * response. The model is never given anything secret in the first place:
 * this is the second line, not the first.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const RED = "GENESIS does not discuss ARC PULSE's own wallets, keys, trading systems or internal infrastructure.";

function envOku(dosya) {
  try { return fs.readFileSync(dosya, "utf8"); } catch (e) { return ""; }
}
const deger = (env, ad) => { const m = env.match(new RegExp("^" + ad + "\\s*=\\s*(\\S+)\\s*$", "m")); return m && m[1]; };

/* every address that belongs to us, lower-cased */
function kendiAdresleriHesapla() {
  const set = new Set();
  const ekle = (a) => { if (a) set.add(String(a).toLowerCase()); };
  const { Wallet } = require("ethers");
  const evm = (k) => { try { return new Wallet(k.startsWith("0x") ? k : "0x" + k).address; } catch (e) { return null; } };
  const repo = envOku(path.join(KOK, ".env")), bot = envOku("C:/bot/.env");
  for (const [env, ad] of [[bot, "TRADER_PRIVATE_KEY"], [repo, "GENESIS_AJAN_KEY"], [repo, "TRADER_PRIVATE_KEY"]]) {
    const k = deger(env, ad); if (k) ekle(evm(k));
  }
  if (process.env.TRADER_PRIVATE_KEY) ekle(evm(process.env.TRADER_PRIVATE_KEY));
  try {
    const { ed25519 } = require("@noble/curves/ed25519");
    const { sha3_256 } = require("@noble/hashes/sha3");
    const { blake2b } = require("@noble/hashes/blake2b");
    const hex = (b) => Buffer.from(b).toString("hex");
    const pub = (k) => ed25519.getPublicKey(Buffer.from(k, "hex"));
    for (const ad of ["SOLANA_PRIVATE_KEY", "SOLANA_FTHM_MINT_KEY", "SOLANA_FTHM_ESCROW_KEY"]) {
      const k = deger(repo, ad); if (k && /^[0-9a-f]{64}$/i.test(k)) ekle(b58(pub(k)));
    }
    const ak = deger(repo, "APTOS_PRIVATE_KEY"); if (ak && /^[0-9a-f]{64}$/i.test(ak)) ekle("0x" + hex(sha3_256(Uint8Array.from([...pub(ak), 0]))));
    const sk = deger(repo, "SUI_PRIVATE_KEY"); if (sk && /^[0-9a-f]{64}$/i.test(sk)) ekle("0x" + hex(blake2b(Uint8Array.from([0, ...pub(sk)]), { dkLen: 32 })));
  } catch (e) { /* noble missing: EVM and records still guarded */ }
  // the deployer as recorded in our deployment files
  for (const f of fs.readdirSync(KOK).filter((x) => /^dagitim.*\.json$/.test(x))) {
    const t = envOku(path.join(KOK, f));
    for (const m of t.matchAll(/"(dagitici|deployer|kurucu|bot|trader|ajan|agent)"\s*:\s*"(0x[0-9a-fA-F]{40})"/g)) ekle(m[2]);
  }
  return set;
}

const ALF = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58(buf) {
  let n = BigInt("0x" + (Buffer.from(buf).toString("hex") || "0")), s = "";
  while (n > 0n) { s = ALF[Number(n % 58n)] + s; n /= 58n; }
  for (const x of buf) { if (x === 0) s = "1" + s; else break; }
  return s;
}

let _kendi = null;
const kendi = () => (_kendi = _kendi || kendiAdresleriHesapla());
const kendiMi = (a) => kendi().has(String(a).toLowerCase());

const ADRES = /0x[0-9a-fA-F]{40,64}|[1-9A-HJ-NP-Za-km-z]{32,44}/g;

/* questions GENESIS refuses outright (English and Turkish) */
const SORU_YASAK = [
  /\b(private|secret|signing)\s*keys?\b|\bseed\s*phrase|\bmnemonic|\bkeystore|\.env\b|\bapi[\s_-]*keys?\b/i,
  /özel\s*anahtar|gizli\s*anahtar|kurtarma\s*(ifadesi|kelimeleri)|tohum\s*cümlesi/i,
  /\b(arc\s*pulse|genesis|your|you|yours)\b[^.?!]{0,40}\b(wallets?|treasury|bot|trading\s*bot|servers?|infrastructure|backend|keys?|deployer|admin|prompt|instructions|system\s*prompt|positions?|balances?|pnl|strateg(y|ies))\b/i,
  /\b(arc\s*pulse|genesis|senin|sizin|sistem(iniz)?)\b[^.?!]{0,40}\b(cüzdan|kasa|bot|sunucu|altyapı|anahtar|pozisyon|bakiye|strateji|komut|talimat)/i,
  /sistem\s*prompt|\bprompt\w*\b[^.?!]{0,20}\b(yaz|göster|ver|söyle|paylaş)|talimatlar\S*\s+(yaz|göster|ver|söyle|nedir)|önceki\s+talimat/i,
  /\b(ignore|forget|disregard)\b[^.?!]{0,30}\b(instructions|rules|previous)\b|\b(reveal|print|show)\b[^.?!]{0,30}\b(prompt|instructions|system)\b/i,
];

function soruYasakMi(soru) {
  if (SORU_YASAK.some((re) => re.test(soru))) return true;
  return (String(soru).match(ADRES) || []).some(kendiMi);
}

/* the answer: none of our addresses, nothing shaped like a key. A 64-hex
   value (a key, or a public tx hash / Move address) passes only if it was in
   the data the model was given. */
function cevapTemizle(metin, verilen = "") {
  if (!metin) return metin;
  if ((metin.match(ADRES) || []).some(kendiMi)) return RED;
  const izinli = new Set((String(verilen).match(/[0-9a-fA-F]{64}/g) || []).map((x) => x.toLowerCase()));
  return metin
    .replace(/\b(0x)?[0-9a-fA-F]{64}\b/g, (m) => (izinli.has(m.replace(/^0x/, "").toLowerCase()) ? m : "[redacted]"))
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, "[redacted]");
}

module.exports = { RED, soruYasakMi, cevapTemizle, kendiMi, kendiAdresSayisi: () => kendi().size };

if (require.main === module) console.log("korunan kendi adresi: " + kendi().size);
