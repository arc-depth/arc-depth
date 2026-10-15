"use strict";
/* ===========================================================================
 * atlas-api.js — the GENESIS ATLAS API server
 *
 *   node scripts/atlas-api.js [--port 8787]
 *
 * ENDPOINTS (JSON)
 *   GET /v1/map                    latest snapshot (nodes, edges, discoveries)
 *   GET /v1/flows?chain=<key|id>   CCTP + LayerZero edges touching one node
 *   GET /v1/history                compact history windows
 *   GET /v1/route?from=&to=&amount=   Circle CCTP V2 fees + relay.link quote
 *   GET /v1/access                 what the calling wallet has bought
 *   GET /                          short documentation (free)
 *
 * AUTH: the paying wallet is the key
 *   X-Atlas-Address    the wallet
 *   X-Atlas-Time       unix seconds, within 5 minutes of the server clock
 *   X-Atlas-Signature  personal_sign("ATLAS <METHOD> <PATH> <TIME>")
 *   The server recovers the signer and reads AtlasAbonelik.erisim(wallet) on
 *   Arc (cached 60 s). A running subscription is rate limited by its level
 *   (monthly 60 calls/min, enterprise 600/min); otherwise each call is
 *   counted against the wallet's call pack (counted here, in
 *   genesis/atlas/kullanim.json — the chain records what was paid for, the
 *   server meters it). No subscription and no calls left: 402.
 *   Not on chain yet (no AtlasAbonelik address): 503 for paid endpoints —
 *   the server never grants access it cannot check.
 *
 * DATA comes from docs/veri/atlas*.json (scripts/atlas-indeks.js) and, for
 * routes, Circle's public fee endpoint and relay.link's open quote API.
 * =========================================================================== */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Contract, verifyMessage, getAddress } = require("ethers");

const KOK = path.join(__dirname, "..");
const KULLANIM = path.join(KOK, "genesis", "atlas", "kullanim.json");
const SINIR = { 1: 60, 2: 600 };            // calls per minute by subscription level
const PAKET_SINIR = 60;                      // calls per minute on a call pack
const ERISIM_ABI = ["function erisim(address) view returns (uint64 cagriHakki, bool abone, uint8 seviye, uint64 bitis)"];

function adresler() {
  const s = fs.readFileSync(path.join(KOK, "docs", "js", "genesis-adres.js"), "utf8");
  return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1));
}

/* ---- access, read from the chain ---------------------------------- */
function zincirErisimi() {
  const p = new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true });
  const onbellek = new Map();
  return async (adres) => {
    const g = adresler();
    if (!g.atlasAbonelik) return null;                   // not on chain: unknown, not "none"
    const o = onbellek.get(adres);
    if (o && Date.now() - o.t < 60000) return o.v;
    const r = await new Contract(g.atlasAbonelik, ERISIM_ABI, p).erisim(adres);
    const v = { cagriHakki: Number(r.cagriHakki), abone: r.abone, seviye: Number(r.seviye), bitis: Number(r.bitis) };
    onbellek.set(adres, { t: Date.now(), v });
    return v;
  };
}

function kullanimDeposu(dosya) {
  let k = fs.existsSync(dosya) ? JSON.parse(fs.readFileSync(dosya, "utf8")) : {};
  return {
    kullanilan: (a) => (k[a] && k[a].toplam) || 0,
    say: (a) => { k[a] = k[a] || { toplam: 0 }; k[a].toplam++; fs.mkdirSync(path.dirname(dosya), { recursive: true }); fs.writeFileSync(dosya, JSON.stringify(k)); }
  };
}

/* ---- the server ----------------------------------------------------- */
function sunucu({ erisim, depo, veri, rotaBul, saat = () => Math.floor(Date.now() / 1000) }) {
  const pencere = new Map();     // wallet -> timestamps of the last minute
  const yanit = (r, kod, govde) => { r.writeHead(kod, { "content-type": "application/json", "access-control-allow-origin": "*" }); r.end(JSON.stringify(govde)); };

  async function dogrula(q) {
    const a = q.headers["x-atlas-address"], t = Number(q.headers["x-atlas-time"]), s = q.headers["x-atlas-signature"];
    if (!a || !t || !s) return { kod: 401, hata: "sign the request: X-Atlas-Address, X-Atlas-Time, X-Atlas-Signature" };
    if (Math.abs(saat() - t) > 300) return { kod: 401, hata: "X-Atlas-Time is more than 5 minutes off" };
    let adres;
    try { adres = getAddress(a); } catch (e) { return { kod: 401, hata: "bad address" }; }
    const yol = q.url;
    let imzalayan;
    try { imzalayan = verifyMessage("ATLAS " + q.method + " " + yol + " " + t, s); } catch (e) { return { kod: 401, hata: "bad signature" }; }
    if (imzalayan !== adres) return { kod: 401, hata: "signature is not from X-Atlas-Address" };
    const e = await erisim(adres);
    if (e == null) return { kod: 503, hata: "Atlas sales contract is not on chain yet; access cannot be checked" };
    const simdi = Date.now();
    const p = (pencere.get(adres) || []).filter((x) => simdi - x < 60000);
    const sinir = e.abone ? SINIR[e.seviye] || SINIR[1] : PAKET_SINIR;
    if (!e.abone && depo.kullanilan(adres) >= e.cagriHakki) return { kod: 402, hata: "no subscription and no calls left; buy a package on the ARC PULSE GENESIS page" };
    if (p.length >= sinir) return { kod: 429, hata: "rate limit: " + sinir + " calls per minute" };
    p.push(simdi); pencere.set(adres, p);
    if (!e.abone) depo.say(adres);
    return { adres, e };
  }

  return http.createServer(async (q, r) => {
    try {
      const u = new URL(q.url, "http://atlas");
      if (u.pathname === "/") return yanit(r, 200, { ad: "GENESIS ATLAS API", uclar: ["/v1/map", "/v1/flows?chain=", "/v1/history", "/v1/route?from=&to=&amount=", "/v1/access"],
        imza: "personal_sign(\"ATLAS <METHOD> <PATH+QUERY> <UNIX_TIME>\")", odeme: "AtlasAbonelik on Arc, USDC" });
      if (!u.pathname.startsWith("/v1/")) return yanit(r, 404, { hata: "unknown endpoint" });
      const d = await dogrula(q);
      if (d.hata) return yanit(r, d.kod, { hata: d.hata });
      const { atlas, gecmis } = veri();
      switch (u.pathname) {
        case "/v1/access": return yanit(r, 200, { ...d.e, kullanilan: depo.kullanilan(d.adres) });
        case "/v1/map": return yanit(r, 200, atlas);
        case "/v1/history": return yanit(r, 200, gecmis);
        case "/v1/flows": {
          const c = (u.searchParams.get("chain") || "").toLowerCase();
          const n = atlas.dugumler.find((x) => x.id.toLowerCase() === "z:" + c || x.id.toLowerCase() === c || x.ad.toLowerCase() === c);
          if (!n) return yanit(r, 404, { hata: "unknown chain" });
          return yanit(r, 200, { dugum: n, kenarlar: atlas.kenarlar.filter((k) => k.kaynak === n.id || k.hedef === n.id), zaman: atlas.zaman });
        }
        case "/v1/route": return yanit(r, 200, await rotaBul(u.searchParams.get("from"), u.searchParams.get("to"), Number(u.searchParams.get("amount") || 0)));
        default: return yanit(r, 404, { hata: "unknown endpoint" });
      }
    } catch (e) { return yanit(r, 500, { hata: (e.message || "error").slice(0, 120) }); }
  });
}

/* routes: the same two sources the map uses */
async function rotaBul(from, to, miktar) {
  const { EVM } = require("./zincirler");
  const k = EVM[from], h = EVM[to];
  if (!k || !h || !(miktar > 0)) return { hata: "from/to must be chain keys (arc, base, …) and amount > 0" };
  const out = [];
  if (k.cctp != null && h.cctp != null) {
    try {
      const f = await fetch("https://iris-api.circle.com/v2/burn/USDC/fees/" + k.cctp + "/" + h.cctp, { signal: AbortSignal.timeout(15000) }).then((x) => x.json());
      for (const x of f) out.push({ rota: "cctp-v2-" + (Number(x.finalityThreshold) <= 1000 ? "fast" : "standard"), cikti: miktar * (1 - Number(x.minimumFee) / 10000), ucretBps: Number(x.minimumFee), gazHaric: true });
    } catch (e) { out.push({ rota: "cctp-v2", hata: "fee endpoint did not answer" }); }
  }
  try {
    const govde = { user: "0x000000000000000000000000000000000000dEaD", recipient: "0x000000000000000000000000000000000000dEaD", originChainId: k.chainId, destinationChainId: h.chainId,
      originCurrency: k.dolar.adres, destinationCurrency: h.dolar.adres, amount: String(Math.round(miktar * 1e6)), tradeType: "EXACT_INPUT" };
    const q = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde), signal: AbortSignal.timeout(20000) }).then((x) => x.json());
    out.push(q.details ? { rota: "relay", cikti: Number(q.details.currencyOut.amountFormatted), sureSn: q.details.timeEstimate } : { rota: "relay", hata: q.message || "no route" });
  } catch (e) { out.push({ rota: "relay", hata: "did not answer" }); }
  return { from, to, miktar, rotalar: out, zaman: new Date().toISOString() };
}

function dosyaVerisi() {
  const oku = (f, v) => { try { return JSON.parse(fs.readFileSync(path.join(KOK, "docs", "veri", f), "utf8")); } catch (e) { return v; } };
  return () => ({ atlas: oku("atlas.json", { dugumler: [], kenarlar: [] }), gecmis: oku("atlas-gecmis.json", []) });
}

module.exports = { sunucu, kullanimDeposu };

if (require.main === module) {
  const i = process.argv.indexOf("--port");
  const port = i > 0 ? Number(process.argv[i + 1]) : 8787;
  sunucu({ erisim: zincirErisimi(), depo: kullanimDeposu(KULLANIM), veri: dosyaVerisi(), rotaBul })
    .listen(port, () => console.log("GENESIS ATLAS API http://localhost:" + port));
}
