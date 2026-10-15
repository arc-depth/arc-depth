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
  fs.rmSync(dosya, { force: true });
  console.log("\n" + gecti + " gecti, " + kaldi + " kaldi");
  process.exit(kaldi ? 1 : 0);
})();
