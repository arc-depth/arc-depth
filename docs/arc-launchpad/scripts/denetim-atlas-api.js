"use strict";
/* denetim-atlas-api.js — the Atlas API's gate, tested end to end over HTTP.
 * Access is injected (what AtlasAbonelik.erisim would return for each
 * wallet); signatures are real, made with throwaway keys. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Wallet } = require("ethers");
const { sunucu, kullanimDeposu } = require("./atlas-api");

let gecti = 0, kaldi = 0;
const kontrol = (ad, kosul, ek = "") => { kosul ? gecti++ : kaldi++; console.log((kosul ? "  PASS  " : "  FAIL  ") + ad + (ek ? "   " + ek : "")); };

(async () => {
  const abone = Wallet.createRandom(), paket = Wallet.createRandom(), bos = Wallet.createRandom(), kurumsal = Wallet.createRandom();
  const erisimler = {
    [abone.address]: { cagriHakki: 0, abone: true, seviye: 1, bitis: 9e9 },
    [kurumsal.address]: { cagriHakki: 0, abone: true, seviye: 2, bitis: 9e9 },
    [paket.address]: { cagriHakki: 2, abone: false, seviye: 0, bitis: 0 },
    [bos.address]: { cagriHakki: 0, abone: false, seviye: 0, bitis: 0 }
  };
  let zincirde = true;
  const dosya = path.join(os.tmpdir(), "atlas-kullanim-" + Date.now() + ".json");
  const veri = () => ({ atlas: { zaman: "t", dugumler: [{ id: "z:arc", ad: "Arc" }, { id: "z:base", ad: "Base" }], kenarlar: [{ kaynak: "z:base", hedef: "z:arc", tur: "cctp", miktar: 5, adet: 1 }] }, gecmis: [{ zaman: "t0" }] });
  const s = sunucu({ erisim: async (a) => (zincirde ? erisimler[a] || { cagriHakki: 0, abone: false, seviye: 0, bitis: 0 } : null), depo: kullanimDeposu(dosya), veri, rotaBul: async () => ({ rotalar: [] }) });
  await new Promise((r) => s.listen(0, r));
  const taban = "http://localhost:" + s.address().port;
  const istek = async (w, yol, { zaman, imzaci } = {}) => {
    const t = zaman || Math.floor(Date.now() / 1000);
    const imza = await (imzaci || w).signMessage("ATLAS GET " + yol + " " + t);
    const r = await fetch(taban + yol, { headers: { "x-atlas-address": w.address, "x-atlas-time": String(t), "x-atlas-signature": imza } });
    return { kod: r.status, govde: await r.json() };
  };

  kontrol("belgeler imzasiz acik", (await fetch(taban + "/")).status === 200);
  kontrol("imzasiz istek 401", (await fetch(taban + "/v1/map")).status === 401);
  kontrol("abone harita alir", (await istek(abone, "/v1/map")).govde.dugumler.length === 2);
  kontrol("baskasinin imzasi 401", (await istek(abone, "/v1/map", { imzaci: bos })).kod === 401);
  kontrol("eski zaman damgasi 401", (await istek(abone, "/v1/map", { zaman: Math.floor(Date.now() / 1000) - 600 })).kod === 401);
  const f = await istek(abone, "/v1/flows?chain=arc");
  kontrol("akislar tek zincire suzulur", f.kod === 200 && f.govde.kenarlar.length === 1);
  kontrol("odemesiz cuzdan 402", (await istek(bos, "/v1/map")).kod === 402);
  kontrol("paket 1. cagri", (await istek(paket, "/v1/map")).kod === 200);
  kontrol("paket 2. cagri", (await istek(paket, "/v1/history")).kod === 200);
  kontrol("paket bitince 402", (await istek(paket, "/v1/map")).kod === 402);
  const acc = await istek(abone, "/v1/access");
  kontrol("erisim bilgisi", acc.govde.abone === true && acc.govde.seviye === 1);
  let k429 = 0;
  for (let i = 0; i < 60; i++) if ((await istek(abone, "/v1/map")).kod === 429) k429++;
  kontrol("aylik abonelik dakikada 60 ile sinirli", k429 >= 1, k429 + " istek 429");
  let kk = 0;
  for (let i = 0; i < 80; i++) if ((await istek(kurumsal, "/v1/map")).kod === 200) kk++;
  kontrol("kurumsal ayni hizda sinira takilmaz", kk === 80);
  zincirde = false;
  kontrol("sozlesme zincirde degilse 503 (erisim uydurulmaz)", (await istek(abone, "/v1/map")).kod === 503);
  s.close();

  /* ---- GENESIS: titles free, text and answers paid ------------------ */
  const bilgi = require("./genesis-bilgi");
  const { cevapla } = require("./genesis-llm");
  zincirde = true;
  const sahteModel = async (url, o) => {   // stands in for llama-server; echoes what it was given
    const m = JSON.parse(o.body).messages;
    return { json: async () => ({ choices: [{ message: { content: "ANSWER<" + m[1].content + ">" + (m[0].content.includes("Copycat floods") ? " used:copycat" : "") } }] }) };
  };
  const g = { basliklar: bilgi.basliklar, cevapla: (q) => cevapla(q, { sohbet: sahteModel }),
    konu: (id) => { const m = bilgi.hepsi().find((x) => x.id === id); return m && { id: m.id, baslik: m.baslik, metin: m.metin }; } };
  const ab2 = Wallet.createRandom();
  erisimler[ab2.address] = { cagriHakki: 0, abone: true, seviye: 1, bitis: 9e9 };
  const s2 = sunucu({ erisim: async (a) => erisimler[a] || { cagriHakki: 0, abone: false, seviye: 0, bitis: 0 }, depo: kullanimDeposu(dosya), veri, rotaBul: async () => ({}), genesis: g });
  await new Promise((r) => s2.listen(0, r));
  const t2 = "http://localhost:" + s2.address().port;
  const istek2 = async (w, yontem, yol, govde) => {
    const t = Math.floor(Date.now() / 1000);
    const imza = await w.signMessage("ATLAS " + yontem + " " + yol + " " + t);
    const r = await fetch(t2 + yol, { method: yontem, headers: { "content-type": "application/json", "x-atlas-address": w.address, "x-atlas-time": String(t), "x-atlas-signature": imza }, body: govde ? JSON.stringify(govde) : undefined });
    return { kod: r.status, govde: await r.json() };
  };
  const topics = await fetch(t2 + "/v1/genesis/topics").then(async (r) => ({ kod: r.status, govde: await r.json() }));
  kontrol("GENESIS basliklari imzasiz ve ucretsiz", topics.kod === 200 && topics.govde.konular.length === bilgi.basliklar().length && topics.govde.konular.length > 0);
  const metinler = bilgi.hepsi().map((m) => m.metin.slice(0, 40));
  kontrol("baslik listesinde gizli metin yok", !metinler.some((x) => JSON.stringify(topics.govde).includes(x)) && topics.govde.konular.every((k) => /^0x[0-9a-f]{64}$/.test(k.icerikHash)));
  kontrol("imzasiz soru 401", (await fetch(t2 + "/v1/genesis/ask", { method: "POST", body: "{}" })).status === 401);
  kontrol("odemesiz cuzdan soru soramaz 402", (await istek2(bos, "POST", "/v1/genesis/ask", { question: "copycat tokens on a new chain?" })).kod === 402);
  const c = await istek2(ab2, "POST", "/v1/genesis/ask", { question: "Are copycat tokens a risk on a new chain?" });
  kontrol("abone cevap alir, dogru konu modele verilir", c.kod === 200 && c.govde.cevap.includes("used:copycat") && c.govde.konular[0].id === "copycat-flood-new-chain", (c.govde.konular || []).map((k) => k.id).join(","));
  const bilmez = await istek2(ab2, "POST", "/v1/genesis/ask", { question: "weather forecast paris tomorrow" });
  kontrol("bilgi yoksa uydurmaz (cevap null)", bilmez.kod === 200 && bilmez.govde.cevap === null);
  kontrol("GET ile soru 405", (await istek2(ab2, "GET", "/v1/genesis/ask")).kod === 405);
  kontrol("bos soru 400", (await istek2(ab2, "POST", "/v1/genesis/ask", { question: "" })).kod === 400);
  const tam = await istek2(ab2, "GET", "/v1/genesis/topic?id=deployer-history");
  kontrol("abone konunun tam metnini alir", tam.kod === 200 && tam.govde.metin.includes("8.7x"));
  kontrol("odemesiz cuzdan tam metni alamaz 402", (await istek2(bos, "GET", "/v1/genesis/topic?id=deployer-history")).kod === 402);
  kontrol("gizlilik suzgeci adresi reddeder", bilgi.gizlilik({ baslik: "x", metin: "sent to 0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0" }) !== null);
  kontrol("gizlilik suzgeci kendi bakiyemizi reddeder", bilgi.gizlilik({ baslik: "x", metin: "our wallet holds 50 USDC" }) !== null);
  kontrol("gizlilik suzgeci dosya adini reddeder", bilgi.gizlilik({ baslik: "x", metin: "read from kararlar.jsonl" }) !== null);
  kontrol("bilgi tabani suzgecten temiz gecer", bilgi.kontrol().hatalar.length === 0, bilgi.kontrol().adet + " kayit");
  s2.close();
  fs.rmSync(dosya, { force: true });
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})();
