"use strict";
/* ===========================================================================
 * genesis-llm.js — GENESIS's voice: a local open model answering from
 *                  GENESIS's own knowledge only
 *
 *   node scripts/genesis-llm.js baslat         start llama-server (Vulkan, GPU)
 *   node scripts/genesis-llm.js durum          is the model up
 *   node scripts/genesis-llm.js sor "<soru>"   answer one question locally
 *
 * MODEL: Qwen2.5-3B-Instruct, Q4_K_M GGUF (Apache-2.0), run by llama.cpp
 * on the CPU (see AYGIT). Free, local, no API key: nothing about a
 * question or the knowledge leaves this machine. The model is the voice,
 * not the source: it only rephrases the retrieved topics, and says so
 * when the knowledge does not cover a question.
 * =========================================================================== */
const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const bilgi = require("./genesis-bilgi");

const LLM = "C:/Users/omen/araclar/llm";
/* the strongest model that fits beside the bot in RAM; first one present wins */
const MODELLER = [
  ["Qwen3-4B-Instruct-2507-Q4_K_M.gguf", "Qwen3-4B-Instruct-2507 (local, llama.cpp)", 2.3e9],
  ["qwen2.5-3b-instruct-q4_k_m.gguf", "Qwen2.5-3B-Instruct (local, llama.cpp)", 2.0e9],
];
/* a file still downloading is smaller than its floor and does not count */
const tam = ([f, , enAz]) => { try { return fs.statSync(path.join(LLM, f)).size >= enAz; } catch (e) { return false; } };
const secilen = MODELLER.find(tam) || MODELLER[MODELLER.length - 1];
const MODEL = path.join(LLM, secilen[0]), MODEL_ADI = secilen[1];
const PORT = Number(process.env.GENESIS_LLM_PORT || 8090);
const ADRES = "http://127.0.0.1:" + PORT;
/* CPU by default. Measured 15 Oct 2026: the Vulkan build on this machine's
   AMD GPUs (RX 6600M alone, or split with the integrated Radeon) returned
   garbage ("Yes????..."); the same model on CPU answers correctly in
   ~15 s. Set GENESIS_LLM_DEVICE=Vulkan1 GENESIS_LLM_NGL=99 to retry the GPU
   after a driver update. */
const AYGIT = process.env.GENESIS_LLM_DEVICE || "none";

const SISTEM = [
  "You are GENESIS, the AI of ARC PULSE, a collateral-backed memecoin launchpad.",
  "Answer ONLY from the KNOWLEDGE below. If it does not cover the question, say plainly that GENESIS has no verified knowledge on that yet — do not guess and do not use outside facts.",
  "Use only the topic that actually answers the question; ignore the others. Do not add opinions, predictions or general claims that are not in the KNOWLEDGE.",
  "Give the measured numbers that answer the question, with their exact conditions (e.g. 'deployers WITH a 2x in their history: 13.1%'). Be direct and concrete, 3 to 8 sentences, no filler.",
  "Reply in the same language as the question.",
  "Never give financial advice or tell anyone to buy or sell; explain what was measured.",
].join(" ");

function sunucuYolu() {
  const bul = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) { const r = bul(p); if (r) return r; } else if (f.name === "llama-server.exe") return p;
  } return null; };
  return bul(path.join(LLM, "llama"));
}

async function durum() {
  try { const r = await fetch(ADRES + "/health", { signal: AbortSignal.timeout(3000) }); return r.ok; } catch (e) { return false; }
}

function baslat() {
  const exe = sunucuYolu();
  if (!exe) throw new Error("llama-server.exe yok: " + LLM + "/llama");
  if (!fs.existsSync(MODEL)) throw new Error("model yok: " + MODEL);
  const p = cp.spawn(exe, ["-m", MODEL, "--port", String(PORT), "--host", "127.0.0.1", "--device", AYGIT, "-ngl", process.env.GENESIS_LLM_NGL || "0", "-c", "4096", "--parallel", "1", "--no-repack", "--threads", "4"],
    { detached: true, stdio: ["ignore", fs.openSync(path.join(LLM, "sunucu.log"), "a"), fs.openSync(path.join(LLM, "sunucu.log"), "a")], windowsHide: true });
  p.unref();
  return p.pid;
}

/* On demand: the model takes ~2.5-3.5 GB of RAM that the trading bot comes
   before, so a server process (atlas-api.js) starts it at the first
   question and stops it after BOSTA_DK idle minutes. */
const BOSTA_DK = 10;
let kendiPid = null, bostaZamanlayici = null;
async function hazirla() {
  if (!(await durum())) {
    kendiPid = baslat();
    for (let i = 0; i < 60 && !(await durum()); i++) await new Promise((r) => setTimeout(r, 1000));
    if (!(await durum())) throw new Error("model did not start");
  }
  clearTimeout(bostaZamanlayici);
  bostaZamanlayici = setTimeout(() => { if (kendiPid) { try { process.kill(kendiPid); } catch (e) { /* gone */ } kendiPid = null; } }, BOSTA_DK * 60000);
  bostaZamanlayici.unref();
}

async function tamamla(sohbet, mesajlar, max_tokens) {
  const r = await sohbet(ADRES + "/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ messages: mesajlar, temperature: 0.2, max_tokens }),
  }).then((x) => x.json());
  const c = r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content;
  if (!c) throw new Error("model did not answer");
  return c.trim();
}

/* The knowledge is in English and retrieval matches words, so a question in
   another language (or one that matches nothing) is first turned into
   English search keywords by the model, then searched with both. */
const ingilizceDegil = (s) => /[^\x00-\x7F]/.test(s) || /\b(ve|bir|mi|mu|ne|nasil|neden|hangi|icin)\b/i.test(s);
const aramaKelimeleri = (soru, sohbet) => tamamla(sohbet, [
  { role: "system", content: "Translate the user's question into 5-12 English search keywords. Keep its meaning; do not add topics it does not mention. Output only the keywords, space separated." },
  { role: "user", content: soru }], 40);

/* knowledge -> answer. Returns the topics used so the caller can show them. */
async function cevapla(soru, { k = 3, sohbet = fetch } = {}) {
  if (sohbet === fetch) await hazirla();
  let bulunan = bilgi.ara(soru, k);
  if (!bulunan.length || ingilizceDegil(soru)) {
    const ek = await aramaKelimeleri(soru, sohbet).catch(() => "");
    if (ek) bulunan = bilgi.ara(soru + " " + ek, k);
  }
  const konular = bulunan.map((x) => ({ id: x.m.id, baslik: x.m.baslik, icerikHash: bilgi.icerikHash(x.m) }));
  if (!bulunan.length) return { cevap: null, konular, bilinmiyor: true };
  const bilgiMetni = bulunan.map((x, i) => "[" + (i + 1) + "] " + x.m.baslik + "\n" + x.m.metin + "\n(source: " + x.m.kaynak + ")").join("\n\n");
  /* The 3B model is exact in English and loose in Turkish (it flipped "had a
     2x" into "had no 2x" in a direct Turkish answer). So it always answers in
     English, and a question in another language gets a faithful translation
     of that answer as a second step. */
  const ingilizce = await tamamla(sohbet, [{ role: "system", content: SISTEM.replace("Reply in the same language as the question.", "Reply in English.") + "\n\nKNOWLEDGE:\n" + bilgiMetni },
    { role: "user", content: soru }], 450);
  if (!ingilizceDegil(soru)) return { cevap: ingilizce, konular, model: MODEL_ADI };
  const dil = /[çğıöşüÇĞİÖŞÜ]/.test(soru) || /\b(ve|bir|mi|mu|ne|nasil|neden|hangi|icin)\b/i.test(soru) ? "Turkish" : "the language of this question: " + soru;
  const cevap = await tamamla(sohbet, [{ role: "system", content: "You are a precise translator. Translate the user's English text into " + dil + ". Keep every number, percentage and condition exactly; do not add, drop or reverse anything. Output only the translation." },
    { role: "user", content: ingilizce }], 600);
  return { cevap, ingilizce, konular, model: MODEL_ADI };
}

module.exports = { cevapla, durum, baslat, MODEL_ADI };

if (require.main === module) {
  (async () => {
    const k = process.argv[2];
    if (k === "baslat") {
      if (await durum()) return console.log("zaten calisiyor: " + ADRES);
      console.log("baslatildi, pid " + baslat() + " — model yukleniyor");
      for (let i = 0; i < 60; i++) { await new Promise((r) => setTimeout(r, 2000)); if (await durum()) return console.log("hazir: " + ADRES); }
      console.log("60 sn icinde hazir olmadi; " + LLM + "/sunucu.log");
    } else if (k === "durum") console.log((await durum()) ? "calisiyor " + ADRES : "kapali");
    else if (k === "sor") {
      const t = Date.now();
      const r = await cevapla(process.argv.slice(3).join(" "));
      console.log(r.cevap || "(bilgi yok)");
      console.log("\nkonular: " + r.konular.map((x) => x.baslik).join(" | ") + "\nsure " + ((Date.now() - t) / 1000).toFixed(1) + " sn");
    } else console.log("kullanim: baslat | durum | sor <soru>");
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
