"use strict";
/* ===========================================================================
 * gonderici.js — collect the signatures and present the notice.
 *
 *   node kopru/gonderici.js --yapilandirma kopru/yapilandirma.json
 *   node kopru/gonderici.js --yapilandirma ... --uygula
 *
 * This holds no authority at all, which is the point. The contract takes
 * the notice from anyone; what it will not take is a notice without M
 * signatures over exactly those fields. So whoever runs this cannot
 * change a recipient, an amount or an event id — any edit invalidates
 * every signature it is carrying — and if this process disappears the
 * signatures are still valid and somebody else can submit them.
 *
 * It refuses to send anything it has not re-checked itself:
 *   - every signature recovers to an address the destination lists
 *   - they all cover the same (eventId, recipient, amount)
 *   - the digest is rebuilt here, not taken from the signature files
 *   - the destination has not already consumed that event id
 *   - a dry run against the chain succeeds before a transaction is signed
 *
 * The last one matters most: a notice that would revert costs gas and
 * tells an attacker which of their attempts are close.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { Wallet, AbiCoder, Interface, keccak256, getBytes, id,
        verifyMessage, getAddress } = require("ethers");

const coder = AbiCoder.defaultAbiCoder();
const OZET = require("./ozet.js");
const val = (a, d) => { const i = process.argv.indexOf(a); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const UYGULA = process.argv.includes("--uygula");
const YAPILANDIRMA = val("--yapilandirma", path.join(__dirname, "yapilandirma.json"));

function istek(url, method, params) {
  return new Promise((res, rej) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const r = mod.request({ hostname: u.hostname, port: u.port || undefined,
      path: (u.pathname || "/") + (u.search || ""), method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (s) => { let b = ""; s.on("data", (c) => (b += c));
        s.on("end", () => { try { const j = JSON.parse(b); j.error ? rej(new Error(j.error.message)) : res(j.result); } catch (e) { rej(e); } }); });
    r.on("error", rej);
    r.setTimeout(90000, () => r.destroy(new Error("timeout")));
    r.write(body); r.end();
  });
}
async function rpc(url, m, p) {
  let w = 2000;
  for (let i = 0; ; i++) {
    try { return await istek(url, m, p); }
    catch (e) {
      if (!/rate limit|too many requests|429|503|timeout|ECONN/i.test(String(e.message)) || i >= 6) throw e;
      await new Promise((x) => setTimeout(x, w)); w = Math.min(w * 2, 30000);
    }
  }
}
const sel = (s) => id(s).slice(0, 10);
const nf = (x) => Number(x).toLocaleString("tr-TR");

const iface = new Interface([
  "function release(bytes32 burnId,address to,uint256 shares,bytes[] imzalar) returns (uint256)",
  "function mint(bytes32 lockId,address to,uint256 shares,bytes[] imzalar)"
]);

(async function main() {
  const y = JSON.parse(fs.readFileSync(YAPILANDIRMA, "utf8"));
  y.hedefKontrat = getAddress(y.hedefKontrat);
  const fn = y.hedefFonksiyon || "mint";

  const dosyalar = fs.readdirSync(y.imzaDizini)
    .filter((f) => f.endsWith(".json") && !f.startsWith("durum."));
  /* Every field is validated here, one record at a time. A single
     malformed file used to throw inside getAddress or BigInt and take the
     whole run down through the top-level catch, stranding every other
     notice waiting to be submitted. */
  const gruplar = new Map();
  const bozuk = [];
  for (const f of dosyalar) {
    try {
      const k = JSON.parse(fs.readFileSync(path.join(y.imzaDizini, f), "utf8"));
      if (!/^0x[0-9a-fA-F]{64}$/.test(k.olayId || "")) throw new Error("olayId bicimi");
      k.alici = getAddress(k.alici);
      k.imzaci = getAddress(k.imzaci);
      k.hedefKontrat = getAddress(k.hedefKontrat);
      if (BigInt(k.miktar) <= 0n) throw new Error("miktar");
      if (!/^0x[0-9a-fA-F]{130}$/.test(k.imza || "")) throw new Error("imza bicimi");
      k.hedefZincir = Number(k.hedefZincir);
      k.kaynakZincir = Number(k.kaynakZincir);
      if (!Number.isFinite(k.hedefZincir) || !Number.isFinite(k.kaynakZincir))
        throw new Error("zincir alanlari");
      if (!gruplar.has(k.olayId)) gruplar.set(k.olayId, []);
      gruplar.get(k.olayId).push(k);
    } catch (e) { bozuk.push(f + ": " + e.message); }
  }
  if (bozuk.length) {
    console.log("  AYRILDI " + bozuk.length + " bozuk kayit, digerleri etkilenmedi:");
    for (const b of bozuk.slice(0, 10)) console.log("     " + b);
    console.log("");
  }

  const esik = Number(BigInt(await rpc(y.hedefRpc, "eth_call",
    [{ to: y.hedefKontrat, data: sel("esik()") }, "latest"])));

  console.log("KOPRU GONDERICISI");
  console.log("  hedef   " + y.hedefKontrat + "   fonksiyon " + fn);
  console.log("  esik    " + esik + " imza");
  console.log("  bulunan " + gruplar.size + " olay, " + dosyalar.length + " imza dosyasi");
  let siradakiNonce = null;
  console.log("");

  for (const [olayId, kayitlar] of gruplar) {
    const k0 = kayitlar[0];
    /* Every record must describe the same notice. A mismatch here means
       two signers saw different things, and that is a reason to stop
       rather than to pick one. */
    /* The chain ids belong in here too. Without them two records carrying
       different chain metadata agreed on everything this looked at and
       passed. The signature check behind this would still have refused
       them — it is not a bypass — but a filter that waves through exactly
       what it exists to catch is not doing its job. */
    const ayrik = kayitlar.filter((k) =>
      k.alici !== k0.alici || k.miktar !== k0.miktar ||
      k.hedefKontrat !== y.hedefKontrat ||
      k.hedefZincir !== k0.hedefZincir || k.kaynakZincir !== k0.kaynakZincir);
    if (ayrik.length) {
      console.log("  " + olayId.slice(0, 12) + "  IMZACILAR AYNI SEYI GORMEMIS — durdum");
      for (const k of kayitlar)
        console.log("     " + k.imzaci + "  " + k.alici + "  " + k.miktar);
      continue;
    }

    const miktar = BigInt(k0.miktar);
    /* Rebuilt here. Taking the digest from the files would let a bad file
       choose what the signatures are checked against. */
    const d = OZET.imzalanacak(k0.hedefZincir, y.hedefKontrat, k0.kaynakZincir,
                               olayId, k0.alici, miktar);

    const gecerli = [];
    for (const k of kayitlar) {
      let geri;
      try { geri = verifyMessage(d, k.imza); } catch (e) { geri = null; }
      if (!geri || geri.toLowerCase() !== k.imzaci.toLowerCase()) {
        console.log("     imza kaydiyla uyusmuyor: " + k.imzaci); continue;
      }
      const uye = await rpc(y.hedefRpc, "eth_call", [{ to: y.hedefKontrat,
        data: sel("imzaciMi(address)") + coder.encode(["address"], [geri]).slice(2) }, "latest"]);
      if (BigInt(uye) === 0n) { console.log("     hedefte imzaci degil: " + geri); continue; }
      gecerli.push([geri.toLowerCase(), k.imza]);
    }

    /* Strictly increasing by signer, which is how the contract refuses a
       duplicate. Deduplicated here so a repeated file cannot make a
       threshold look reached when it is not. */
    const benzersiz = [...new Map(gecerli).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (benzersiz.length < esik) {
      console.log("  " + olayId.slice(0, 12) + "  " + benzersiz.length + "/" + esik +
        " imza — bekliyor");
      continue;
    }

    const kullanildi = BigInt(await rpc(y.hedefRpc, "eth_call", [{ to: y.hedefKontrat,
      data: sel("kullanildi(bytes32)") + olayId.slice(2) }, "latest"]));
    if (kullanildi !== 0n) {
      console.log("  " + olayId.slice(0, 12) + "  hedefte zaten islenmis");
      continue;
    }

    const imzalar = benzersiz.map((x) => x[1]);
    const data = iface.encodeFunctionData(fn, [olayId, k0.alici, miktar, imzalar]);

    const gonderen = y.gonderenAdres || k0.imzaci;
    try {
      await rpc(y.hedefRpc, "eth_call",
        [{ from: gonderen, to: y.hedefKontrat, data, gas: "0x1000000" }, "latest"]);
    } catch (e) {
      console.log("  " + olayId.slice(0, 12) + "  KURU CALISMA REVERT: " + e.message);
      continue;
    }

    console.log("  " + olayId.slice(0, 12) + "  " + benzersiz.length + "/" + esik +
      " imza, kuru calisma TAMAM  ->  " + k0.alici + "  " + nf(miktar));

    if (!UYGULA) continue;

    const pk = process.env[y.gonderenAnahtarDegiskeni || "KOPRU_GONDERICI_ANAHTARI"];
    if (!pk) { console.log("     gonderici anahtari yok, gonderilmedi"); continue; }
    const cuzdan = new Wallet(pk.trim());
    const gasPrice = BigInt(await rpc(y.hedefRpc, "eth_gasPrice", []));
    /* Read once as PENDING, then counted locally. Re-reading "latest" per
       submission gave two notices in one run the same nonce, so the
       second replaced the first and one of them silently never happened. */
    if (siradakiNonce === null)
      siradakiNonce = Number(await rpc(y.hedefRpc, "eth_getTransactionCount",
        [cuzdan.address, "pending"]));
    const nonce = siradakiNonce++;
    const g = BigInt(await rpc(y.hedefRpc, "eth_estimateGas",
      [{ from: cuzdan.address, to: y.hedefKontrat, data }]));
    const raw = await cuzdan.signTransaction({ chainId: Number(k0.hedefZincir),
      nonce, to: y.hedefKontrat, data, gasLimit: (g * 13n) / 10n, gasPrice, value: 0n });
    const hash = await rpc(y.hedefRpc, "eth_sendRawTransaction", [raw]);
    console.log("     gonderildi " + hash);
  }
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
