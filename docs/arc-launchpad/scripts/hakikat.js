"use strict";
/* ===========================================================================
 * hakikat.js — what is actually on chain, read once, written in one place
 *
 *   node scripts/hakikat.js
 *
 * Step 1 of the truth ledger: READ ONLY. Changes no file but its two outputs:
 *   hakikat.json              every address the deployment records and the
 *                             site name, where it has code, who owns it
 *   rapor/hakikat-raporu.md   the contradictions found, for a person
 *
 * Sources it reads, and only reads:
 *   scripts/zincirler.js      the chain registry (RPCs, infrastructure)
 *   dagitim*.json             every deployment record, plans included
 *   docs/**                   every address the site shows or calls
 *   scripts/*.js              to count hardcoded RPCs, not to run them
 *
 * Facts come from the chain: eth_getCode on all nine EVM chains for every
 * address, owner() and kurucu() on every one that has code. Nothing is true
 * because it is written in a record; the record is what is being checked.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const { EVM, DIGER } = require("./zincirler");

const KOK = path.join(__dirname, "..");
const ADRES = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const SIFIR = "0x" + "0".repeat(40);
const OLU = new Set([SIFIR, "0x000000000000000000000000000000000000dead"]);

/* Public RPCs that answer JSON-RPC batches; the registry's own where it can. */
const RPC = Object.fromEntries(Object.entries(EVM).map(([k, z]) => [k, z.rpc]));
RPC.base = "https://base-rpc.publicnode.com";
RPC.arbitrum = "https://arbitrum-one-rpc.publicnode.com";
RPC.bsc = "https://bsc-rpc.publicnode.com";

const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

/* A strict public RPC (HyperEVM: batches of 20, rate limited) sets the pace. */
const ARA = { hyperevm: 2500, monad: 800, arc: 800 };

/* A batch counts only if every answer in it is an answer: an eth_getCode
   that came back as a rate-limit error must not read as "no code here".
   eth_call reverts are answers (no owner()); transport errors are not. */
function cevapMi(x) {
  if (x.result !== undefined) return true;
  const m = String((x.error && x.error.message) || "");
  return x.error && x.error.code === 3 || /revert|execution/i.test(m);
}

async function rpcToplu(zincir, istekler) {
  const url = RPC[zincir];
  const cevap = [];
  for (let i = 0; i < istekler.length; i += 20) {
    const parca = istekler.slice(i, i + 20).map((x, j) => ({ jsonrpc: "2.0", id: i + j, ...x }));
    for (let deneme = 0; ; deneme++) {
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parca) });
        const j = await r.json();
        if (!Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 160));
        const kotu = j.find((x) => !cevapMi(x));
        if (kotu || j.length !== parca.length) throw new Error("eksik cevap: " + JSON.stringify(kotu || {}).slice(0, 160));
        j.sort((a, b) => a.id - b.id);
        cevap.push(...j);
        break;
      } catch (e) {
        if (deneme >= 8) throw new Error(url + ": " + e.message);
        await bekle(2000 * (deneme + 1));
      }
    }
    await bekle(ARA[zincir] || 250);
  }
  return cevap;
}

/* ---- 1. what the records and the site say ------------------------------ */

function jsonAdresleri(dugum, yol, cikti) {
  if (typeof dugum === "string") {
    for (const m of dugum.matchAll(ADRES)) cikti.push({ adres: m[0].toLowerCase(), yol });
  } else if (Array.isArray(dugum)) {
    dugum.forEach((x, i) => jsonAdresleri(x, yol + "[" + i + "]", cikti));
  } else if (dugum && typeof dugum === "object") {
    for (const [k, v] of Object.entries(dugum)) jsonAdresleri(v, yol ? yol + "." + k : k, cikti);
  }
  return cikti;
}

function dosyalar(dizin, uzanti) {
  const c = [];
  for (const g of fs.readdirSync(dizin, { withFileTypes: true })) {
    const p = path.join(dizin, g.name);
    if (g.isDirectory()) { if (g.name !== "vendor" && g.name !== "node_modules") c.push(...dosyalar(p, uzanti)); }
    else if (uzanti.some((u) => g.name.endsWith(u))) c.push(p);
  }
  return c;
}

const rel = (p) => path.relative(KOK, p).replace(/\\/g, "/");

function kayitlariOku() {
  const kayit = new Map();   // adres -> { kayitlar: [dosya:yol], site: [dosya] }
  const al = (a) => { if (!kayit.has(a)) kayit.set(a, { kayitlar: [], site: [] }); return kayit.get(a); };

  const dagitim = fs.readdirSync(KOK).filter((f) => /^dagitim.*\.json$/.test(f)).sort();
  for (const f of dagitim) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(KOK, f), "utf8")); } catch { continue; }
    for (const { adres, yol } of jsonAdresleri(j, "", [])) al(adres).kayitlar.push(f + ":" + yol);
  }
  const site = dosyalar(path.join(KOK, "docs"), [".js", ".html", ".json"]);
  for (const p of site) {
    const metin = fs.readFileSync(p, "utf8");
    const gorulen = new Set();
    for (const m of metin.matchAll(ADRES)) gorulen.add(m[0].toLowerCase());
    for (const a of gorulen) al(a).site.push(rel(p));
  }
  return { kayit, dagitim, siteDosyasi: site.length };
}

/* Infrastructure we did not deploy: named by the registry. */
function altyapi() {
  const a = new Map();
  for (const [k, z] of Object.entries(EVM)) {
    const ekle = (adres, ne) => adres && a.set(adres.toLowerCase(), k + " " + ne);
    ekle(z.endpoint, "LayerZero endpoint"); ekle(z.sendLib, "LZ sendLib"); ekle(z.recvLib, "LZ recvLib");
    ekle(z.executor, "LZ executor"); ekle(z.poolManager, "Uniswap v4 PoolManager");
    ekle(z.dolar && z.dolar.adres, z.dolar && z.dolar.sembol);
    if (z.dvn) { ekle(z.dvn.lzLabs, "DVN LayerZero Labs"); ekle(z.dvn.nethermind, "DVN Nethermind"); }
  }
  return a;
}

/* Record keys that name someone else's contract we only point at. */
const DIS_ANAHTAR = /^(tokenMessenger|mesajTasiyici|besleyici|v3Fabrika|quoter|v4Quoter|permit2|poolManager|positionManager|weth|usdc|quote|dolar|usdg|endpoint|executor|sendLib|recvLib)$/i;
function disMi(k) {
  if (!k.kayitlar.length) return true;   // only the site names it: a listed token, a pool asset
  return k.kayitlar.every((y) => DIS_ANAHTAR.test(y.split(":").pop().split(".").pop().replace(/\[\d+\]/g, "")));
}

/* ---- 2. what the chain says -------------------------------------------- */

async function zincirOku(adresler) {
  const sonuc = new Map(adresler.map((a) => [a, { kod: [], sahip: {} }]));
  await Promise.all(Object.keys(EVM).map(async (z) => {
    const kod = await rpcToplu(z, adresler.map((a) => ({ method: "eth_getCode", params: [a, "latest"] })));
    const kodlu = adresler.filter((a, i) => kod[i] && kod[i].result && kod[i].result !== "0x");
    for (const a of kodlu) sonuc.get(a).kod.push(z);
    /* owner() 0x8da5cb5b, kurucu() — whichever answers with an address */
    for (const [ad, sec] of [["owner", "0x8da5cb5b"], ["kurucu", kurucuSecici()]]) {
      const r = await rpcToplu(z, kodlu.map((a) => ({ method: "eth_call", params: [{ to: a, data: sec }, "latest"] })));
      kodlu.forEach((a, i) => {
        const v = r[i] && r[i].result;
        if (v && v.length === 66) sonuc.get(a).sahip[z + "." + ad] = "0x" + v.slice(26).toLowerCase();
      });
    }
  }));
  return sonuc;
}

function kurucuSecici() {
  /* keccak256("kurucu()")[0..4], computed once with ethers and fixed here */
  return "0x" + require("ethers").id("kurucu()").slice(2, 10);
}

/* ---- 3. the scripts' copies -------------------------------------------- */

function scriptSayimi() {
  const sc = fs.readdirSync(path.join(__dirname)).filter((f) => f.endsWith(".js"));
  let sabitRpc = 0, sabitRpcDosya = 0, kayittan = 0;
  for (const f of sc) {
    const m = fs.readFileSync(path.join(__dirname, f), "utf8");
    const n = (m.match(/https:\/\/[a-z0-9.-]*(rpc|publicnode|infura|alchemy|ankr|llamarpc)[a-z0-9./-]*/gi) || []).length;
    sabitRpc += n; if (n) sabitRpcDosya++;
    if (/require\(["']\.\/zincirler["']\)/.test(m)) kayittan++;
  }
  return { toplam: sc.length, sabitRpc, sabitRpcDosya, kayittan };
}

/* ---- 4. the report ------------------------------------------------------ */

(async () => {
  const { kayit, dagitim, siteDosyasi } = kayitlariOku();
  const alt = altyapi();
  const adresler = [...kayit.keys()].filter((a) => !OLU.has(a));
  console.log(adresler.length + " adres, " + dagitim.length + " dagitim dosyasi, " + siteDosyasi + " site dosyasi; zincir okunuyor…");
  const zincir = await zincirOku(adresler);

  const hakikat = { uretildi: new Date().toISOString(), kaynak: "scripts/hakikat.js", zincirler: {}, kodsuz: {}, digerZincirler: {} };
  for (const [k, z] of Object.entries(EVM)) {
    hakikat.zincirler[k] = { ad: z.ad, chainId: z.chainId, eid: z.eid, cctp: z.cctp, rpc: z.rpc,
      dolar: z.dolar, kontratlar: {} };
  }
  for (const [k, z] of Object.entries(DIGER)) hakikat.digerZincirler[k] = { ad: z.ad, eid: z.eid, cctp: z.cctp, dolar: z.dolar,
    not: "EVM disi; bu adimda zincirden okunmadi" };

  const bulgular = { siteKodsuz: [], kayitliSiteDisi: [], sahipli: [], cokZincir: [] };
  for (const a of adresler) {
    const k = kayit.get(a), c = zincir.get(a);
    const kimlik = { kayitlar: k.kayitlar, site: k.site };
    if (alt.has(a)) kimlik.altyapi = alt.get(a);
    if (c.kod.length === 0) {
      hakikat.kodsuz[a] = kimlik;
      if (k.site.length && !alt.has(a)) bulgular.siteKodsuz.push({ a, ...kimlik });
      continue;
    }
    if (c.kod.length > 1) bulgular.cokZincir.push({ a, zincirler: c.kod, ...kimlik });
    for (const z of c.kod) {
      const sahip = {};
      for (const [anahtar, v] of Object.entries(c.sahip)) if (anahtar.startsWith(z + ".")) sahip[anahtar.split(".")[1]] = v;
      hakikat.zincirler[z].kontratlar[a] = { ...kimlik, ...(Object.keys(sahip).length ? { sahip } : {}) };
      if (alt.has(a) || disMi(k)) { hakikat.zincirler[z].kontratlar[a].dis = true; continue; }
      /* owner() is a power (Ownable). kurucu() in these contracts is an
         immutable fee recipient, read from the code: no function is
         guarded by it. So only owner() counts as an admin key. */
      if (sahip.owner && !OLU.has(sahip.owner)) bulgular.sahipli.push({ a, z, sahip: { owner: sahip.owner }, ...kimlik });
      if (!k.site.length) {
        const v = bulgular.kayitliSiteDisi.find((x) => x.a === a);
        if (v) v.z += ", " + z; else bulgular.kayitliSiteDisi.push({ a, z, ...kimlik });
      }
    }
  }
  fs.writeFileSync(path.join(KOK, "hakikat.json"), JSON.stringify(hakikat, null, 1) + "\n");

  /* the registry's own claims that the chain or Circle contradict */
  const kayitCelisgi = [];
  if (EVM.bsc.cctp != null) kayitCelisgi.push("`zincirler.js` bsc.cctp = " + EVM.bsc.cctp +
    ": Circle lists domain 17 for USYC only, USDC has no CCTP on BNB (developers.circle.com, 16 Oct 2026).");

  const sc = scriptSayimi();
  const kodluSay = Object.values(hakikat.zincirler).reduce((n, z) => n + Object.keys(z.kontratlar).length, 0);
  const kisa = (x) => x.slice(0, 6) + "…" + x.slice(-4);
  const satir = (b) => "| `" + b.a + "` | " + (b.z || (b.zincirler || []).join(", ")) + " | " +
    (b.kayitlar.slice(0, 2).join("<br>") || "—") + (b.kayitlar.length > 2 ? " (+" + (b.kayitlar.length - 2) + ")" : "") + " | " +
    (b.site.slice(0, 2).join("<br>") || "—") + " |";

  const md = [];
  md.push("# Hakikat raporu — " + hakikat.uretildi.slice(0, 10), "",
    "`node scripts/hakikat.js` üretti. Salt okuma: zincirden `eth_getCode`, `owner()`, `kurucu()`.", "",
    "## Özet", "",
    "| | |", "|---|---|",
    "| Dağıtım kaydı dosyası | " + dagitim.length + " |",
    "| Kayıtlarda + sitede geçen adres | " + adresler.length + " |",
    "| Kodu olan kontrat örneği (adres × zincir, 9 EVM) | " + kodluSay + " |",
    "| Kodu hiçbir zincirde olmayan | " + Object.keys(hakikat.kodsuz).length + " (cüzdan, plan ya da hiç dağıtılmamış) |",
    "| Scriptler | " + sc.toplam + "; " + sc.sabitRpcDosya + " dosyada " + sc.sabitRpc + " elle yazılmış RPC; zincir kaydını kullanan " + sc.kayittan + " |",
    "");
  md.push("## 1. Sitede geçiyor ama hiçbir zincirde kodu yok (" + bulgular.siteKodsuz.length + ")", "",
    "Cüzdan adresi olabilir (kurucu, ajan) ya da taranmayan bir zincirdeki token (Polygon, Optimism…) — o zaman sorun değil. Kontrat sanılıyorsa kırık bağlantıdır.", "",
    "| adres | zincir | kayıt | site |", "|---|---|---|---|", ...bulgular.siteKodsuz.map(satir), "");
  md.push("## 2. Sahibi olan kontratlar (" + bulgular.sahipli.length + ")", "",
    "Bizim kontratlarımızdan `owner()` sıfır/0xdead olmayan bir adres döndürenler (Ownable: sahibi ayar değiştirebilir). `kurucu()` sayılmadı: bu kontratlarda değişmez bir ücret alıcısı, hiçbir fonksiyonu korumuyor (koddan okundu). Başkalarının kontratları (Circle, Chainlink, Uniswap, listelenen tokenlar) bu rapora girmez.", "",
    "| adres | zincir | sahip | kayıt | site |", "|---|---|---|---|---|",
    ...bulgular.sahipli.map((b) => "| `" + b.a + "` | " + b.z + " | " +
      Object.entries(b.sahip).map(([k, v]) => k + " " + kisa(v)).join("<br>") + " | " +
      (b.kayitlar.slice(0, 2).join("<br>") || "—") + " | " + (b.site.slice(0, 1).join("") || "—") + " |"), "");
  md.push("## 3. Zincirde kodu var, kayıtta var, sitede yok (" + bulgular.kayitliSiteDisi.length + ")", "",
    "Sitede görünmemek emekli olmak demek değil: canlı bir sistemin iç parçaları (fabrika, çevirici) da burada çıkar. Arşiv kararı kayıt dosyasına göre tek tek verilmeli. Dosyaya göre:", "",
    ...Object.entries(bulgular.kayitliSiteDisi.reduce((m, b) => {
      for (const f of new Set(b.kayitlar.map((y) => y.split(":")[0]))) m[f] = (m[f] || 0) + 1;
      return m;
    }, {})).sort((x, y) => y[1] - x[1]).map(([f, n]) => "- `" + f + "`: " + n), "",
    "| adres | zincir | kayıt | site |", "|---|---|---|---|", ...bulgular.kayitliSiteDisi.map(satir), "");
  md.push("## 4. Aynı adreste birden çok zincirde kod (" + bulgular.cokZincir.length + ")", "",
    "CREATE2 ile bilerek aynı adres (ikizler, fabrikalar) beklenir; listede beklenmeyen varsa bakılmalı.", "",
    "| adres | zincirler | kayıt | site |", "|---|---|---|---|", ...bulgular.cokZincir.map(satir), "");
  md.push("## 5. Kaydın kendi çelişkileri", "", ...(kayitCelisgi.length ? kayitCelisgi.map((x) => "- " + x) : ["- yok"]), "");
  md.push("## Bu adımda bakılmayanlar", "",
    "- Solana, Aptos, Sui adresleri zincirden okunmadı (EVM dışı).",
    "- Sitedeki *metin* iddiaları (\"%2\", \"7 zincir\") henüz kontrol edilmiyor — adım 3.",
    "- Sahiplik yalnız `owner()` ve `kurucu()` ile okundu; başka adla tutulan yetki (yonetici, admin) görünmez.", "");
  fs.writeFileSync(path.join(KOK, "rapor", "hakikat-raporu.md"), md.join("\n"));

  console.log("kodlu " + kodluSay + ", kodsuz " + Object.keys(hakikat.kodsuz).length);
  console.log("site-kodsuz " + bulgular.siteKodsuz.length + ", sahipli " + bulgular.sahipli.length +
    ", kayitli-site-disi " + bulgular.kayitliSiteDisi.length + ", cok-zincir " + bulgular.cokZincir.length);
  console.log("scriptler: " + JSON.stringify(sc));
})().catch((e) => { console.error("HATA: " + e.message); process.exit(1); });
