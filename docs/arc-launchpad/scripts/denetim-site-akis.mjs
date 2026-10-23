/* ===========================================================================
 * denetim-site-akis.mjs — the site, clicked through like a user, nothing sent
 *
 *   node scripts/denetim-site-akis.mjs [akis ...]
 *     (puppeteer-core in C:/Users/omen/araclar/tarayici-test; Chrome installed)
 *
 * Serves docs/ on localhost and drives it in headless Chrome. The page gets a
 * wallet (window.ethereum) for a test address that never broadcasts:
 *   - every JSON-RPC call the page makes to an EVM chain is answered here;
 *     Arc calls (eth_call, estimateGas, balances, receipts) run through
 *     eth_simulateV1 on Arc mainnet state, with every transaction the page
 *     "sent" so far replayed in front, one block each, 15 s apart, the test
 *     address funded by a state override — so a launch, then a buy, a sale
 *     and a redemption see each other as they would on chain;
 *   - eth_sendTransaction on Arc simulates the transaction in that sequence
 *     and keeps it (a fake hash, a receipt built from the simulation); on
 *     another chain it is checked with eth_call (balance overridden) and
 *     answered with a fake hash, never broadcast;
 *   - relay.link, DexScreener, Circle and the chains' read calls are real.
 * Flows: launch from Arc (WETH on Base $20; five lines over Solana/Sui/Aptos;
 * a $50 line so a vault holds something), launch from Base through relay
 * (quote only), buy / sell / redeem / founder income / move to Aptos, the
 * read pages (Discover, analytics, vaults, docs, leaderboard), and the
 * Solana / Sui / Aptos modules in the browser (quotes).
 * =========================================================================== */
import http from "http";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire("C:/Users/omen/araclar/tarayici-test/package.json");
const puppeteer = require("puppeteer-core");
const { Interface, AbiCoder, keccak256, toUtf8Bytes, id: olayId } = require("ethers");

const KOK = "C:/arc-launchpad";
const DOCS = path.join(KOK, "docs");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const ARC_SIM = "https://arc-rpc.publicnode.com";
const TEST = "0x7e57000000000000000000000000000000c0ffee";
const BAKIYE = 10n ** 22n;                      // 10,000 USDC (native, 18 dp) in the simulation only
const SECILEN = process.argv.slice(2);
const V = JSON.parse(fs.readFileSync(path.join(DOCS, "veri", "sepet-v2.json"), "utf8"));

/* ---- results ---- */
const sonuc = [];
let gecti = 0, kaldi = 0;
const ok = (k, ad, d) => { k ? gecti++ : kaldi++; sonuc.push([k, ad, d]); console.log((k ? "  PASS " : "  FAIL ") + ad + (d !== undefined ? "  (" + String(d).slice(0, 300) + ")" : "")); };

/* ---- the EVM chains the page reads ---- */
const ZINCIRLER = {
  5042: ["arc-rpc.publicnode.com", "rpc.mainnet.arc.io", "rpc.drpc.mainnet.arc.io", "rpc.blockdaemon.mainnet.arc.io", "arc-mainnet.drpc.org"],
  8453: ["mainnet.base.org"], 42161: ["arb1.arbitrum.io"], 1: ["ethereum-rpc.publicnode.com"], 56: ["bsc-dataseed.bnbchain.org", "bsc-dataseed1.bnbchain.org"],
  43114: ["avalanche-c-chain-rpc.publicnode.com", "api.avax.network"], 143: ["rpc.monad.xyz"], 999: ["rpc.hyperliquid.xyz"], 4663: ["rpc.mainnet.chain.robinhood.com"],
};
const GERCEK = { 5042: "https://rpc.mainnet.arc.io", 8453: "https://mainnet.base.org", 42161: "https://arb1.arbitrum.io/rpc", 1: "https://ethereum-rpc.publicnode.com",
  56: "https://bsc-dataseed.bnbchain.org", 43114: "https://avalanche-c-chain-rpc.publicnode.com", 143: "https://rpc.monad.xyz", 999: "https://rpc.hyperliquid.xyz/evm",
  4663: "https://rpc.mainnet.chain.robinhood.com" };
const zincirOf = (url) => { const h = new URL(url).host; for (const [id, hs] of Object.entries(ZINCIRLER)) if (hs.includes(h)) return Number(id); return null; };

/* one JSON-RPC call upstream; rate limits (429/403) and network errors are retried, as a patient browser would */
async function rpc(url, method, params) {
  for (let i = 0; ; i++) {
    try {
      const y = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
      if (y.status === 429 || y.status === 403 || y.status >= 500) throw new Error("HTTP " + y.status);
      const j = await y.json();
      if (j.error && /rate|limit|too many|capacity|timeout|busy/i.test(j.error.message || "")) throw new Error(j.error.message);
      return j;
    } catch (e) {
      if (i >= 8) { if (process.env.AYRINTI) console.log("    [rpc vazgecti] " + url + " " + method + ": " + (e.message || e)); return { error: { code: -32000, message: String(e.message || e) } }; }
      await new Promise((ok) => setTimeout(ok, 1500 * (i + 1)));
    }
  }
}

/* ---- the Arc simulation: the page's transactions so far, one block each ---- */
const S = { bloklar: [], makbuzlar: new Map(), taban: null, sayac: 0, gonderilen: [] };
async function taban() {
  if (!S.taban) {
    const b = (await rpc(GERCEK[5042], "eth_getBlockByNumber", ["latest", false])).result;
    /* an hour ahead: the simulated blocks must stay after the chain's latest for the whole run */
    S.taban = { sayi: BigInt(b.number), zaman: BigInt(b.timestamp) + 3600n };
  }
  return S.taban;
}
const hex = (x) => "0x" + BigInt(x).toString(16);
/* publicnode is the only Arc RPC with eth_simulateV1: one at a time, identical calls answered once per state */
let _yol = 0; const _bekleyen = [];
const sirayla = async (f) => { while (_yol >= 1) await new Promise((ok) => _bekleyen.push(ok)); _yol++; try { return await f(); } finally { _yol--; const n = _bekleyen.shift(); if (n) n(); } };
const _onbellek = new Map();
async function simule(son) {
  const anahtar = S.bloklar.length + "|" + JSON.stringify(son || null);
  if (_onbellek.has(anahtar)) return _onbellek.get(anahtar);
  const p = sirayla(() => simuleEt(son));
  _onbellek.set(anahtar, p);
  p.catch(() => _onbellek.delete(anahtar));
  return p;
}
async function simuleEt(son) {
  const t = await taban();
  const bloklar = [...S.bloklar, ...(son ? [son] : [])].map((b, i) => ({
    ...(i === 0 ? { stateOverrides: { [TEST]: { balance: hex(BAKIYE) } } } : {}),
    blockOverrides: { time: hex(t.zaman + 15n * BigInt(i + 1)) },
    calls: b.calls }));
  if (!bloklar.length) bloklar.push({ stateOverrides: { [TEST]: { balance: hex(BAKIYE) } }, calls: [] });
  const r = await rpc(ARC_SIM, "eth_simulateV1", [{ blockStateCalls: bloklar, validation: false, traceTransfers: false }, "latest"]);
  if (r.error) throw Object.assign(new Error("simulateV1: " + JSON.stringify(r.error).slice(0, 300)), { rpcHata: r.error });
  return r.result;
}
const cagri = (tx) => ({ from: tx.from || "0x0000000000000000000000000000000000000000", to: tx.to, data: tx.data || tx.input || "0x",
  value: tx.value ? hex(tx.value) : "0x0", gas: hex(29_000_000) });
async function arcCagri(tx) {
  const r = await simule({ calls: [cagri(tx)] });
  return r[r.length - 1].calls[0];
}
async function arcGonder(tx) {
  const c = cagri({ ...tx, from: TEST });
  const r = await simule({ calls: [c] });
  const x = r[r.length - 1].calls[0];
  const hash = keccak256(toUtf8Bytes("sahte-" + Date.now() + "-" + S.sayac++));
  const blok = (await taban()).sayi;
  const basarili = x.status === "0x1";
  if (basarili) S.bloklar.push({ calls: [c] });
  const logs = basarili ? (x.logs || []).map((l, i) => ({ address: l.address, topics: l.topics, data: l.data, blockNumber: hex(blok), blockHash: "0x" + "ab".repeat(32),
    transactionHash: hash, transactionIndex: "0x0", logIndex: hex(i), removed: false })) : [];
  S.makbuzlar.set(hash, { transactionHash: hash, transactionIndex: "0x0", blockHash: "0x" + "ab".repeat(32), blockNumber: hex(blok), from: TEST, to: tx.to,
    cumulativeGasUsed: x.gasUsed, gasUsed: x.gasUsed, effectiveGasPrice: "0x3b9aca00", contractAddress: null, logs, logsBloom: "0x" + "00".repeat(256),
    status: basarili ? "0x1" : "0x0", type: "0x2" });
  S.gonderilen.push({ zincir: 5042, to: tx.to, secici: (tx.data || "0x").slice(0, 10), durum: basarili, hata: basarili ? null : JSON.stringify(x.error || x.returnData).slice(0, 300), loglar: logs, donus: x.returnData });
  return hash;
}

/* a JSON-RPC call to chain `zid`, answered from the simulation on Arc and from the real chain elsewhere */
async function cevapla(zid, q, url) {
  const m = q.method, p = q.params || [];
  const sonuc = (r) => { const { result, error } = r; return error ? { jsonrpc: "2.0", id: q.id, error } : { jsonrpc: "2.0", id: q.id, result }; };
  if ((m === "eth_getTransactionReceipt" || m === "eth_getTransactionByHash") && S.makbuzlar.has(p[0])) {
    const mk = S.makbuzlar.get(p[0]);
    if (m === "eth_getTransactionReceipt") return sonuc({ result: mk });
    return sonuc({ result: { hash: mk.transactionHash, blockNumber: mk.blockNumber, blockHash: mk.blockHash, from: mk.from, to: mk.to, input: "0x", value: "0x0",
      nonce: "0x0", gas: mk.gasUsed, gasPrice: "0x3b9aca00", transactionIndex: "0x0", type: "0x2", chainId: hex(zid), v: "0x0", r: "0x0", s: "0x0" } });
  }
  /* simulated only once the page has "sent" something, or when the call comes from the test address */
  const bizden = p[0] && typeof p[0] === "object" && String(p[0].from || "").toLowerCase() === TEST.toLowerCase();
  if (zid === 5042 && (S.bloklar.length || bizden)) {
    if (m === "eth_call" || m === "eth_estimateGas") {
      try {
        const c = await arcCagri(p[0]);
        if (c.status !== "0x1") {
          if (process.env.AYRINTI) console.log("    [sim geri] " + JSON.stringify(p[0]).slice(0, 160) + " -> " + JSON.stringify(c).slice(0, 300));
          return sonuc({ error: { code: 3, message: "execution reverted", data: c.returnData || (c.error && c.error.data) || "0x" } });
        }
        return sonuc({ result: m === "eth_call" ? c.returnData : hex((BigInt(c.gasUsed) * 13n) / 10n + 50_000n) });
      } catch (e) { if (process.env.AYRINTI) console.log("    [sim hata] " + e.message.slice(0, 200)); return sonuc({ error: { code: -32000, message: e.message } }); }
    }
    if (m === "eth_getBalance") {
      const c = await arcCagri({ to: "0x3600000000000000000000000000000000000000", data: "0x70a08231" + p[0].slice(2).toLowerCase().padStart(64, "0") });
      return sonuc({ result: hex(BigInt(c.returnData) * 10n ** 12n) });
    }
  }
  if (zid === 5042 && m === "eth_getBalance" && p[0].toLowerCase() === TEST.toLowerCase()) return sonuc({ result: hex(BAKIYE) });
  return sonuc(await rpc(url || GERCEK[zid], m, p));
}

/* ---- the wallet the page sees ---- */
const C = { zincir: 5042 };
async function cuzdanIstek(method, params) {
  params = params || [];
  if (method === "eth_accounts" || method === "eth_requestAccounts") return [TEST];
  if (method === "eth_chainId") return hex(C.zincir);
  if (method === "net_version") return String(C.zincir);
  if (method === "wallet_switchEthereumChain") { C.zincir = parseInt(params[0].chainId, 16); return null; }
  if (method === "wallet_addEthereumChain") return null;
  if (method === "eth_sendTransaction") {
    const tx = params[0];
    if (C.zincir === 5042) return arcGonder(tx);
    /* another chain: checked with eth_call against that chain (the test address funded), never sent */
    const r = await rpc(GERCEK[C.zincir], "eth_call", [{ from: TEST, to: tx.to, data: tx.data, value: tx.value || "0x0" }, "latest", { [TEST]: { balance: hex(10n ** 22n) } }]);
    const hash = keccak256(toUtf8Bytes("sahte-" + C.zincir + "-" + S.sayac++));
    const basarili = !r.error;
    S.makbuzlar.set(hash, { transactionHash: hash, transactionIndex: "0x0", blockHash: "0x" + "cd".repeat(32), blockNumber: (await rpc(GERCEK[C.zincir], "eth_blockNumber", [])).result,
      from: TEST, to: tx.to, cumulativeGasUsed: "0x5208", gasUsed: "0x5208", effectiveGasPrice: "0x1", contractAddress: null, logs: [], logsBloom: "0x" + "00".repeat(256),
      status: basarili ? "0x1" : "0x0", type: "0x2" });
    S.gonderilen.push({ zincir: C.zincir, to: tx.to, durum: basarili, hata: basarili ? null : JSON.stringify(r.error).slice(0, 300) });
    return hash;
  }
  const r = await cevapla(C.zincir, { id: 1, method, params });
  if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code, data: r.error.data });
  return r.result;
}
const ENJEKTE = `(() => {
  const dinleyici = {};
  window.ethereum = {
    isMetaMask: true,
    request: async ({ method, params }) => {
      const r = await window.__cuzdan(method, params || []);
      if (r && r.__hata) { const e = new Error(r.__hata); e.code = r.code; e.data = r.data; throw e; }
      if (method === "wallet_switchEthereumChain") (dinleyici.chainChanged || []).forEach((f) => f(params[0].chainId));
      return r;
    },
    on: (ad, f) => { (dinleyici[ad] ||= []).push(f); },
    removeListener: () => {},
  };
})();`;

/* ---- static server for docs/ ---- */
const TUR = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const sunucu = http.createServer((q, s) => {
  const p = path.join(DOCS, decodeURIComponent(new URL(q.url, "http://x").pathname));
  if (!p.startsWith(DOCS) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { "content-type": TUR[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(s);
});
await new Promise((ok) => sunucu.listen(0, "127.0.0.1", ok));
const ADRES = "http://127.0.0.1:" + sunucu.address().port + "/app.html";

/* ---- the browser ---- */
const tarayici = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const sayfa = await tarayici.newPage();
await sayfa.setViewport({ width: 1280, height: 900 });
const konsol = [];
sayfa.on("console", (m) => { if (m.type() === "error") konsol.push(m.text()); });
sayfa.on("pageerror", (e) => konsol.push("pageerror: " + e.message));
await sayfa.exposeFunction("__cuzdan", async (method, params) => {
  try { return await cuzdanIstek(method, params); }
  catch (e) { return { __hata: e.message, code: e.code ?? 4001, data: e.data }; }
});
await sayfa.evaluateOnNewDocument(ENJEKTE);
await sayfa.setRequestInterception(true);
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, GET, OPTIONS" };
sayfa.on("request", async (q) => {
  const zid = /^https?:/.test(q.url()) ? zincirOf(q.url()) : null;
  if (zid == null) return q.continue();
  if (q.method() === "OPTIONS") return q.respond({ status: 204, headers: CORS });
  if (q.method() !== "POST") return q.continue();
  try {
    const govde = JSON.parse(q.postData() || "{}");
    const cevap = Array.isArray(govde) ? await Promise.all(govde.map((x) => cevapla(zid, x, q.url()))) : await cevapla(zid, govde, q.url());
    return q.respond({ status: 200, headers: CORS, contentType: "application/json", body: JSON.stringify(cevap) });
  } catch (e) { return q.respond({ status: 500, headers: CORS, contentType: "application/json", body: JSON.stringify({ error: { message: e.message } }) }); }
});

/* ---- page helpers ---- */
const bekle = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function git(yol) {
  konsol.length = 0;
  await sayfa.goto(ADRES + "#/" + yol, { waitUntil: "networkidle2", timeout: 90_000 }).catch(() => {});
  await bekle(2500);
}
/* the element whose own text is `metin`, clicked; its status line emptied first so an old message is not read as the new one */
async function tikla(metin) {
  await sayfa.evaluate((m) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(m));
    if (!b) return;
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    w.currentNode = b;
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.classList && n.classList.contains("yazi--kucuk") && n.tagName === "DIV") { n.textContent = ""; break; }
  }, metin);
  const h = await sayfa.evaluateHandle((m) => [...document.querySelectorAll("button, a")].find((b) => b.textContent.trim().startsWith(m)), metin);
  const e = h.asElement();
  if (!e) throw new Error("dugme yok: " + metin);
  await e.evaluate((b) => b.scrollIntoView());
  await e.click();
}
async function deger(secici, v) {
  await sayfa.evaluate((s, v) => { const e = document.querySelector(s); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }, secici, v);
}
/* the status line under a button: wait until `kosul(text)` holds or the text stops changing on an error */
async function durumBekle(dugmeMetni, kosul, sure = 180_000) {
  const t0 = Date.now();
  let son = "";
  while (Date.now() - t0 < sure) {
    son = await sayfa.evaluate((m) => {
      const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(m) || (m === "Launch" && x.textContent.trim().startsWith("Confirm and pay")));
      if (!b) return "";
      /* the first status line after the button in document order */
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
      w.currentNode = b;
      for (let n = w.nextNode(); n; n = w.nextNode()) if (n.classList && n.classList.contains("yazi--kucuk") && n.tagName === "DIV") return n.textContent;
      return "";
    }, dugmeMetni);
    if (kosul(son)) return son;
    if (/^(Reverted|Could not|No route|No market|HATA|Error)|failed|exceeds|insufficient/i.test(son)) return son;
    await bekle(1500);
  }
  return son + " [zaman asimi]";
}
const dugmeYazisi = (m) => sayfa.evaluate((m) => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(m)); return b ? b.textContent.trim() : null; }, m);

/* a launch form filled: `satirlar` = [[domain, address, dollars], ...] (unused slots emptied) */
async function launchFormu({ ad, sembol, zincir, satirlar, ikiz = [] }) {
  await deger("#merkez-zincir", zincir);
  await deger("#merkez-ad", ad);
  await deger("#merkez-sembol", sembol);
  await deger("#merkez-alim", "100");
  await deger("#merkez-vergi", "2");
  await sayfa.evaluate((satirlar, ikiz) => {
    const kap = document.querySelector("#merkez-alim").closest(".yigin");
    const yuvalar = [...kap.querySelectorAll(".girdi-grup")].filter((g) => g.querySelector("select") && g.querySelectorAll("input").length === 2);
    yuvalar.forEach((g, i) => {
      const [z, a, d] = [g.querySelector("select"), g.querySelectorAll("input")[0], g.querySelectorAll("input")[1]];
      const s = satirlar[i];
      z.value = s ? String(s[0]) : z.value; a.value = s ? s[1] : ""; d.value = s ? String(s[2]) : "4";
      for (const e of [z, a, d]) e.dispatchEvent(new Event("change", { bubbles: true }));
    });
    for (const k of document.querySelectorAll("input[data-eid]")) { k.checked = ikiz.includes(Number(k.dataset.eid)); k.dispatchEvent(new Event("change", { bubbles: true })); }
  }, satirlar, ikiz);
}
const MERKEZ_LAUNCH = olayId("MerkezLaunch(address,address,bytes32,uint32,uint256)");
const sonToken = () => {
  for (const g of [...S.gonderilen].reverse()) for (const l of g.loglar || []) if (l.topics[0] === MERKEZ_LAUNCH) return "0x" + l.topics[1].slice(26);
  return null;
};

/* ======================================================================= */
const akis = {};

akis.launchArc = async (varyant) => {
  await git("merkez");
  const WETH = "0x4200000000000000000000000000000000000006";
  const v = {
    tek: { ad: "Site Akis Bir", sembol: "AKIS1", satirlar: [[6, WETH, 20]], ikiz: [] },
    bes: { ad: "Site Akis Bes", sembol: "AKIS5", satirlar: [[6, WETH, 4], [26, "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE", 4],
      [5, "So11111111111111111111111111111111111111112", 4], [8, "0x2::sui::SUI", 4], [9, "0xa", 4]], ikiz: [30184, 30110, 30102, 30106, 30390, 30367, 30416] },
    elli: { ad: "Site Akis Elli", sembol: "AKIS50", satirlar: [[6, WETH, 50]], ikiz: [] },
  }[varyant];
  await launchFormu({ ...v, zincir: "arc" });
  await tikla("Launch");
  const fatura = await durumBekle("Launch", (s) => /Check it, then press the button again/.test(s), 240_000);
  ok(/Check it, then press/.test(fatura), "launch Arc [" + varyant + "]: kalem kalem fatura", fatura);
  if (!/Check it/.test(fatura)) return null;
  const dugme = await dugmeYazisi("Confirm and pay");
  const toplamSayfa = Number((dugme.match(/\$([\d.]+)/) || [])[1]);
  const beklenen = 100 + v.satirlar.reduce((n, s) => n + s[2], 0);
  ok(toplamSayfa >= beklenen && toplamSayfa < beklenen + 60, "launch Arc [" + varyant + "]: odenecek toplam makul", "$" + toplamSayfa + " (alim+teminat $" + beklenen + ")");
  const n0 = S.gonderilen.length;
  await tikla("Confirm and pay");
  const son = await durumBekle("Launch", (s) => /^Paid\./.test(s), 240_000);
  const islemler = S.gonderilen.slice(n0);
  ok(/^Paid\./.test(son) && islemler.length === 2 && islemler.every((x) => x.durum), "launch Arc [" + varyant + "]: onay + launch simulasyonda gecti",
    son.slice(0, 120) + " | " + islemler.map((x) => (x.durum ? "ok" : "GERI: " + x.hata)).join(", "));
  const t = sonToken();
  ok(!!t, "launch Arc [" + varyant + "]: MerkezLaunch olayi, token", t);
  return t;
};

akis.launchBase = async () => {
  await git("merkez");
  await launchFormu({ ad: "Site Akis Base", sembol: "AKISB", zincir: "base", satirlar: [[6, "0x4200000000000000000000000000000000000006", 20]], ikiz: [] });
  await tikla("Launch");
  const s = await durumBekle("Launch", (x) => /Check it, then press/.test(x), 240_000);
  ok(/relay bridge: you pay/.test(s), "launch Base (relay): relay teklif verdi (Arc tarafini simule ederek)", s);
};

akis.islem = async (token) => {
  await git("merkez");
  await deger("#merkez-zincir", "arc");
  await deger("#merkez-token", token);
  let fiyat = "";
  for (let i = 0; i < 40 && !fiyat; i++) { await bekle(1500); fiyat = await sayfa.evaluate(() => document.querySelector("#merkez-token").nextElementSibling.textContent); }
  ok(/^Price \$/.test(fiyat), "islem: havuz fiyati okundu", fiyat);
  if (SECILEN.includes("yalniz-tasi")) return tasi();
  /* buy $5 */
  await deger("#merkez-al", "5");
  let n0 = S.gonderilen.length;
  await tikla("Buy");
  let s = await durumBekle("Buy", (x) => /^Paid\./.test(x));
  ok(/^Paid\./.test(s) && S.gonderilen.slice(n0).every((x) => x.durum), "alim $5 (Arc)", s.slice(0, 160));
  /* sell 100,000 */
  await deger("#merkez-sat", "100000");
  n0 = S.gonderilen.length;
  await tikla("Sell");
  s = await durumBekle("Sell", (x) => /^Sold in the Arc pool/.test(x));
  ok(/^Sold in the Arc pool/.test(s) && S.gonderilen.slice(n0).every((x) => x.durum), "satis 100.000 (Arc)", s.slice(0, 160));
  /* redeem 1,000,000 */
  await deger("#merkez-sat", "1000000");
  n0 = S.gonderilen.length;
  await tikla("Redeem from the basket");
  s = await durumBekle("Sell", (x) => /^Burned for redemption/.test(x));
  const it = S.gonderilen.slice(n0);
  ok(/^Burned for redemption/.test(s) && it.every((x) => x.durum), "itfa 1.000.000 (Arc, v4)", s.slice(0, 160) + " | " + it.length + " islem" + (it.find((x) => !x.durum) ? " GERI: " + it.find((x) => !x.durum).hata : ""));
  /* founder income */
  n0 = S.gonderilen.length;
  await tikla("Send the founder's trading income");
  s = await durumBekle("Send the founder's trading income", (x) => /^Sent to the founder|Nothing has accrued/.test(x));
  ok(/^Sent to the founder/.test(s), "kurucu geliri ilet", s.slice(0, 160));
  await tasi();
};
const tasi = async () => {
  let s, n0;
  /* move 100,000 to Aptos (the twin there created first) */
  await sayfa.evaluate(() => { const s = [...document.querySelectorAll("select")].find((x) => [...x.options].some((o) => o.value === "aptos") && !x.id); s.value = "aptos"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await sayfa.evaluate(() => { const i = [...document.querySelectorAll("input")].find((x) => (x.placeholder || "").startsWith("your address there")); i.value = "0x" + "5a".repeat(32); i.dispatchEvent(new Event("change", { bubbles: true })); });
  n0 = S.gonderilen.length;
  await tikla("Move from Arc");
  s = await durumBekle("Move from Arc", (x) => /^Sent\. LayerZero delivers/.test(x));
  ok(/^Sent\. LayerZero delivers/.test(s) && S.gonderilen.slice(n0).every((x) => x.durum), "Arc'tan Aptos'a tasi (ikiz once yaratilir)", s.slice(0, 160) + " | " + S.gonderilen.slice(n0).length + " islem");
};

akis.sayfalar = async () => {
  for (const y of ["kesfet", "analitik", "kasalar", "dokuman", "liderlik", "guvenlik", "merkez"]) {
    await git(y);
    await bekle(y === "analitik" ? 12_000 : 6000);
    const metin = await sayfa.evaluate(() => document.body.innerText);
    const kotu = (metin.match(/(Could not[^\n]{0,120}|undefined|NaN|\[object Object\]|Error[:][^\n]{0,120})/g) || []).slice(0, 4);
    const hatalar = konsol.filter((x) => !/favicon|ERR_FILE_NOT_FOUND|Failed to load resource: the server responded with a status of 404/.test(x));
    ok(!kotu.length && !hatalar.length, "sayfa " + y + ": konsol ve metin temiz", [...kotu, ...hatalar].join(" | ").slice(0, 400) || "temiz");
  }
};

akis.uzak = async () => {
  await git("merkez");
  const r = await sayfa.evaluate(async () => {
    const o = {};
    const yaz = async (ad, f) => { try { o[ad] = String(await f()); } catch (e) { o[ad] = "HATA " + (e && e.message); } };
    const sol = await import("./js/solana-ikiz.js");
    const u = await import("./js/uzak-ikiz.js");
    const v = await import("./js/v4-uzak-varlik.js");
    const cfg = await fetch("veri/sepet-v2.json").then((x) => x.json());
    await yaz("solana teklif (0 bayt istek)", () => sol.teklif("5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh", 0));
    await yaz("solana teklif (192 bayt istek)", () => sol.teklif("5H9J7nHFwZBaBVF2HA4SyvkFcSbhmSCcKWZKw47Zr5gh", 192));
    const al = new Uint8Array(32); al[31] = 1;
    await yaz("sui teklif", () => u.suiTeklif("0x9d547e639e4dad7b98f1ec9a6e8d684f42dd289fb0875f08a2ed8fc77fe7f078", "0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE", al, 10n ** 18n));
    await yaz("aptos teklif", () => u.aptosTeklif("0x8c2016b8DbB9034c2Fe173000639A9a1380b26AE", al, 10n ** 18n));
    await yaz("v4 listede: SOL", () => v.uzakVarlikUygunMu("solana", "So11111111111111111111111111111111111111112", cfg.uzak).then((x) => JSON.stringify(x)));
    await yaz("v4 listede: SUI", () => v.uzakVarlikUygunMu("sui", "0x2::sui::SUI", cfg.uzak).then((x) => JSON.stringify(x)));
    await yaz("v4 listede: APT", () => v.uzakVarlikUygunMu("aptos", "0xa", cfg.uzak).then((x) => JSON.stringify(x)));
    o.panel = [...document.querySelectorAll(".panel, section")].some((x) => /Solana, Sui or Aptos wallet|from a Solana, Sui or Aptos/i.test(x.textContent)) ? "var"
      : "yok: " + [...document.querySelectorAll("h2, h3, .panel__baslik")].map((x) => x.textContent.trim()).join(" / ");
    return o;
  });
  for (const [k, v] of Object.entries(r)) ok(!/^HATA/.test(v) && !/^yok/.test(v) && !/"uygun":false/.test(v), "tarayicida " + k, v);
};

/* ======================================================================= */
console.log("SITE AKIS  " + ADRES + "  test adresi " + TEST + "  (v" + (V.surum || 2) + ", hicbir islem gonderilmez)");
const calis = (ad) => !SECILEN.length || SECILEN.includes(ad);
try {
  if (calis("sayfalar")) await akis.sayfalar();
  if (calis("uzak")) await akis.uzak();
  if (calis("base")) await akis.launchBase();
  let token = null;
  if (calis("arc")) { token = await akis.launchArc("tek"); if (token && calis("islem")) await akis.islem(token); }
  if (calis("bes")) await akis.launchArc("bes");
  if (calis("elli")) { const t = await akis.launchArc("elli"); if (t) await akis.islem(t); }
} catch (e) { ok(false, "beklenmeyen", e.stack || e.message); }
await tarayici.close();
sunucu.close();
console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
console.log("gonderilen (simule): " + S.gonderilen.map((x) => x.zincir + ":" + x.secici + ":" + (x.durum ? "ok" : "GERI")).join(" "));
process.exitCode = kaldi ? 1 : 0;
