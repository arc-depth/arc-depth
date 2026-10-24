/* ===========================================================================
 * gorunum/genesis.js — GENESIS: talk to PULSE GENESIS, see what it is
 *
 * Every answer says where it came from, in the three modes the GENESIS
 * specification keeps apart:
 *   1  ON CHAIN       GENESIS-0 (GenesisDil): learning and generation run in
 *                     the EVM; the page calls it like any view function.
 *   2  AGREED ON CHAIN  the compute network (GenesisHesap): independent
 *                     providers, settled on what k of them agree on.
 *   3  HASH ON CHAIN  the open model in the browser (Qwen2.5-0.5B-Instruct,
 *                     Apache-2.0): runs on the visitor's own device; its
 *                     weights hash is registered in GENESIS memory. It is
 *                     NOT GENESIS's own model and the page says so.
 * Facts come from GENESIS memory: category-2 records an agent accepted,
 * stored on chain, cited by origin chain and sequence.
 *
 * PRIVACY: nothing typed here is stored or sent anywhere except the RPC
 * reads and, if the visitor loads it, the open model running locally.
 * "Propose to memory" is the one way text leaves the page, and it is an
 * explicit, signed, public transaction.
 * =========================================================================== */
import { el, sayfaUst, panel, not, olcum } from "../ui.js";
import { AGLAR } from "../aglar.js";
import { GENESIS } from "../genesis-adres.js";
import { cokluOku, rpcPost } from "../ag-okur.js";
import { cuzdan } from "../cuzdan.js";
import { Interface, toUtf8Bytes, toUtf8String, hexlify } from "../../vendor/ethers.min.js";
import { teshisEt, zincirAdi } from "../teshis.js";

const CEKIRDEK = [
  "function kayitSayisi(uint32) view returns (uint256)",
  "function kayitVeri(uint32,uint64) view returns ((uint8 tur,uint8 saklama,address yazar,uint64 zaman,bytes32 icerikHash,bytes32 zincirHash) k, bytes v)",
  "function hafizaKoku() view returns (bytes32)",
  "function KORKULUK_METNI() view returns (string)",
  "function modelSayisi() view returns (uint256)",
  "function oner(uint8,bytes) returns (uint256)"
];
const DIL = [
  "function uret(bytes,uint256,uint256,bool) view returns (bytes)",
  "function durum() view returns (uint256,uint256,bytes32)"
];
const ACIK_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
/* The open model is served by this site only: transformers.js and the ONNX runtime from
   vendor/transformers/, the tokenizer and config from model/, and the weights (onnx/model_q4f16.onnx,
   483 MB) in six parts under GitHub's 100 MB file limit. The page joins the parts, checks the whole
   file's sha256 against the hash GENESIS registers on chain (or, until it is registered, the hash
   Hugging Face publishes for that file, pinned here and in model_q4f16.parcalar.json), and only then
   runs it. Nothing is fetched from any other host; the verified copy stays in this browser's cache. */
const MODEL_YOLU = new URL("../../model/", import.meta.url).href;
const MODEL_DOSYA = "onnx/model_q4f16.onnx";
const MODEL_SHA256 = "b11c1dd99efd57e6c6e5bc4443a019931a5fbd5dd500d48644d8225f5ce0b2cb";
const MODEL_ONBELLEK = "genesis-model-v1";
const ev = () => AGLAR.find((a) => a.anahtar === "arc");
const zincirler = () => GENESIS.zincirler.map((k) => AGLAR.find((a) => a.anahtar === k)).filter(Boolean);
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);

/* public RPCs (Arc's above all) answer 429 when the page reads many chains at
   once; rpcPost falls over to backup RPCs, and a chain still unread is
   "not read yet", never "no code" */
async function kodVar(ag, adres) {
  for (let deneme = 0; deneme < 3; deneme++) {
    try {
      const r = await rpcPost(ag, { jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [adres, "latest"] });
      if (typeof r.result === "string") return r.result.length > 2;
    } catch (e) { /* every RPC refused: try again */ }
    await new Promise((s) => setTimeout(s, 800 * (deneme + 1)));
  }
  return null;
}

/* every verified-knowledge record stored on chain, read from Arc */
/* A paid topic is written as {"v":1,"id","t":title,"h":keccak(text)}: the
   title is public, the text is sold through the Atlas API. */
function konuKaydi(metin) {
  if (!metin.startsWith('{"v":1')) return null;
  try { const o = JSON.parse(metin); return o.t && /^0x[0-9a-f]{64}$/.test(o.h) ? o : null; } catch (e) { return null; }
}

/* every paid topic title on chain (knowledge = category 2, research = 8) */
export async function konular(ag) {
  const sayilar = await cokluOku(ag, zincirler().map((z) => [GENESIS.cekirdek, CEKIRDEK, "kayitSayisi", [z.eid]]));
  const istek = [];
  zincirler().forEach((z, i) => { for (let s = 0; s < Number(sayilar[i] || 0); s++) istek.push([GENESIS.cekirdek, CEKIRDEK, "kayitVeri", [z.eid, s]]); });
  const out = new Map();
  for (let i = 0; i < istek.length; i += 40) {
    const r = await cokluOku(ag, istek.slice(i, i + 40));
    r.forEach((x) => {
      if (!x) return;
      const [k, v] = x;
      if (![2, 8].includes(Number(k.tur)) || Number(k.saklama) !== 0) return;
      let metin; try { metin = toUtf8String(v); } catch (e) { return; }
      const o = konuKaydi(metin);
      if (o) out.set(o.id, { baslik: o.t, hash: o.h, arastirma: Number(k.tur) === 8 });
    });
  }
  return [...out.values()];
}

export async function bilgiler(ag) {
  const sayilar = await cokluOku(ag, zincirler().map((z) => [GENESIS.cekirdek, CEKIRDEK, "kayitSayisi", [z.eid]]));
  const istek = [];
  zincirler().forEach((z, i) => { for (let s = 0; s < Number(sayilar[i] || 0); s++) istek.push([GENESIS.cekirdek, CEKIRDEK, "kayitVeri", [z.eid, s], z, s]); });
  const out = [], eskiyen = new Set();
  for (let i = 0; i < istek.length; i += 40) {
    const parca = istek.slice(i, i + 40);
    const r = await cokluOku(ag, parca.map((x) => x.slice(0, 4)));
    r.forEach((x, j) => {
      if (!x) return;
      const [k, v] = x;
      if (Number(k.tur) !== 2 || Number(k.saklama) !== 0) return;
      let metin; try { metin = toUtf8String(v); } catch (e) { return; }
      if (konuKaydi(metin)) return;          // a paid topic's title, not a free fact
      /* {"v":2,"eskir":{zincir,siralar}}: memory is append-only, so a newer record names the ones it replaces */
      if (metin.startsWith('{"v":2')) {
        try { const o = JSON.parse(metin); if (o.eskir) for (const s of o.eskir.siralar || []) eskiyen.add(o.eskir.zincir + ":" + s); } catch (e) { /* not a marker */ }
        return;
      }
      out.push({ metin, zincir: parca[j][4].ad, eid: parca[j][4].eid, sira: parca[j][5] });
    });
  }
  return out.filter((b) => !eskiyen.has(b.eid + ":" + b.sira));
}

const kelimeler = (s) => (s.toLocaleLowerCase("tr").match(/[\p{L}\p{N}]{3,}/gu) || []);
export function ilgili(soru, liste, n = 3) {
  /* words weighted by how rare they are in memory (idf): "launch" is in
     half the records and says little, "fee" is in two and says a lot */
  const belgeler = liste.map((b) => new Set(kelimeler(b.metin)));
  const idf = (w) => Math.log((belgeler.length + 1) / (belgeler.filter((d) => d.has(w)).length + 0.5));
  const q = [...new Set(kelimeler(soru))];
  return liste.map((b, i) => {
    const puan = q.filter((w) => belgeler[i].has(w)).reduce((t, w) => t + idf(w), 0) / Math.sqrt(belgeler[i].size + 1);
    return { ...b, puan };
  }).filter((b) => b.puan > 0).sort((x, y) => y.puan - x.puan).slice(0, n);
}

let uretici = null;
const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, "0")).join("");
const mb = (n) => (n / 1e6).toFixed(0) + " MB";

/// The hash the weights must have: GENESIS's registration of this exact file if it exists on Arc
/// (id = keccak256("<repo>/<file>"), agirlikHash = its sha256), else the published one pinned above.
async function beklenenHash() {
  try {
    const { keccak256 } = await import("../../vendor/ethers.min.js");
    const id = keccak256(toUtf8Bytes(ACIK_MODEL + "/" + MODEL_DOSYA));
    const [m] = await cokluOku(ev(), [[GENESIS.cekirdek, ["function model(bytes32) view returns ((bytes32 id,bytes32 ebeveyn,bytes32 agirlikHash,bytes32 mimariHash,bytes32 metrikHash,uint8 mod,address adres,string uri))"], "model", [id]]]);
    if (m && m.agirlikHash && !/^0x0+$/.test(m.agirlikHash)) return { hash: m.agirlikHash.slice(2).toLowerCase(), kaynak: "registered on chain in GENESIS memory" };
  } catch (e) { /* not readable now: fall back to the pinned hash, and say so */ }
  return { hash: MODEL_SHA256, kaynak: "published by Hugging Face (not yet registered on chain)" };
}

/// The weights, joined from this site's six parts, checked, cached in this browser.
async function agirliklar(durum) {
  const beklenen = await beklenenHash();
  const anahtar = MODEL_YOLU + ACIK_MODEL + "/" + MODEL_DOSYA;
  let onbellek = null;
  try { onbellek = await caches.open(MODEL_ONBELLEK); } catch (e) { /* no Cache API (private mode): download each time */ }
  let veri = null;
  const kayitli = onbellek ? await onbellek.match(anahtar) : null;
  if (kayitli) {
    durum.textContent = "Checking the open model saved in this browser…";
    veri = new Uint8Array(await kayitli.arrayBuffer());
  } else {
    const liste = await fetch(MODEL_YOLU + ACIK_MODEL + "/onnx/model_q4f16.parcalar.json").then((r) => r.json());
    veri = new Uint8Array(liste.boyut);
    let o = 0;
    for (const p of liste.parcalar) {
      const r = await fetch(MODEL_YOLU + ACIK_MODEL + "/onnx/" + p.ad);
      if (!r.ok) throw new Error("part " + p.ad + " could not be downloaded (" + r.status + ")");
      const okuyucu = r.body.getReader();
      for (;;) {
        const { done, value } = await okuyucu.read();
        if (done) break;
        veri.set(value, o); o += value.length;
        durum.textContent = "Downloading the open model to your device from this site: " + mb(o) + " of " + mb(liste.boyut);
      }
    }
    if (o !== liste.boyut) throw new Error("the model arrived incomplete (" + o + " of " + liste.boyut + " bytes)");
  }
  durum.textContent = "Checking the model's fingerprint (sha256)…";
  const ozet = hex(await crypto.subtle.digest("SHA-256", veri));
  if (ozet !== beklenen.hash) {
    if (onbellek) await onbellek.delete(anahtar).catch(() => {});
    throw new Error("the model's sha256 is " + ozet.slice(0, 12) + "…, not the expected " + beklenen.hash.slice(0, 12) + "… (" + beklenen.kaynak + "): refused, it will not run");
  }
  if (onbellek && !kayitli) await onbellek.put(anahtar, new Response(veri, { headers: { "content-type": "application/octet-stream" } })).catch(() => {});
  return { veri, beklenen };
}

async function acikModeliYukle(durum) {
  if (uretici) return uretici;
  const { veri, beklenen } = await agirliklar(durum);
  durum.textContent = "Starting the open model on your device…";
  const tf = await import("../../vendor/transformers/transformers.min.js");
  /* this site only: no Hugging Face, no CDN; the runtime's wasm from vendor/transformers/ */
  tf.env.allowRemoteModels = false;
  tf.env.allowLocalModels = true;
  tf.env.localModelPath = MODEL_YOLU;
  tf.env.useBrowserCache = false;
  tf.env.backends.onnx.wasm.wasmPaths = new URL("../../vendor/transformers/", import.meta.url).href;
  tf.env.backends.onnx.wasm.proxy = false;
  /* the verified weights are handed over from memory; every other file comes from model/ */
  tf.env.useCustomCache = true;
  tf.env.customCache = {
    match: async (k) => (String(k).endsWith(MODEL_DOSYA) ? new Response(veri, { headers: { "content-type": "application/octet-stream" } }) : undefined),
    put: async () => {},
  };
  const secenek = { dtype: "q4f16" };
  /* WebGPU only when the device really has an adapter: a failed WebGPU start leaves the runtime
     unable to fall back in the same page, so the choice is made before the first session */
  let gpu = false;
  try { gpu = !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch (e) { gpu = false; }
  uretici = await tf.pipeline("text-generation", ACIK_MODEL, { ...secenek, device: gpu ? "webgpu" : "wasm" });
  uretici.dogrulama = beklenen;
  return uretici;
}

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("PULSE GENESIS", "One AI, one memory, on every chain it runs on"));
  const arc = ev();

  /* ---- what exists, read from each chain ---- */
  const zs = zincirler();
  const kodlar = await Promise.all(zs.map((z) => kodVar(z, GENESIS.cekirdek)));
  const canliZ = zs.filter((z, i) => kodlar[i]);
  const arcCanli = kodlar[zs.indexOf(arc)];
  if (!canliZ.length) {
    kap.append(not("GENESIS is written and tested but not on chain yet. Its address is fixed in advance and is the same on every chain: " +
      GENESIS.cekirdek + ". This page reads that address on every chain and will show the memory as soon as it exists.", "uyari"));
  }

  const koklar = await Promise.all(canliZ.map((z) => cokluOku(z, [[GENESIS.cekirdek, CEKIRDEK, "hafizaKoku"]]).then((r) => r[0]).catch(() => null)));
  const ayniKok = koklar.length > 1 && koklar.every((k) => k && k === koklar[0]);
  let dilDurum = null;
  if (arcCanli) dilDurum = (await cokluOku(arc, [[GENESIS.dil, DIL, "durum"]]))[0];
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Chains with GENESIS", canliZ.length + " of " + zs.length, (canliZ.map((z) => z.ad).join(", ") || "none yet") +
      (kodlar.includes(null) ? " · could not read: " + zs.filter((z, i) => kodlar[i] === null).map((z) => z.ad).join(", ") : "")),
    olcum("Memory in sync", canliZ.length < 2 ? "—" : ayniKok ? "yes" : "not yet", "same memory root on every chain"),
    olcum("GENESIS-0 has learned", dilDurum ? Number(dilDurum[0]) + " records" : "—", dilDurum ? Number(dilDurum[1]) + " bytes, on chain" : "")
  ]));

  /* ---- the three modes, per component ---- */
  const satir = (a, b, c) => el("tr", {}, [el("td", { yazi: a }), el("td", { yazi: b }), el("td", { yazi: c })]);
  kap.append(panel("What runs where", el("table", { sinif: "tablo" }, [
    el("thead", {}, [el("tr", {}, [el("th", { yazi: "Component" }), el("th", { yazi: "Computes" }), el("th", { yazi: "Contract" })])]),
    el("tbody", {}, [
      satir("Identity, memory, model & module registry", "On chain; synced between chains over LayerZero", "GenesisCekirdek " + kisa(GENESIS.cekirdek)),
      satir("GENESIS-0 language model (learn + generate + measure)", "1 — entirely on chain", "GenesisDil " + kisa(GENESIS.dil)),
      satir("Compute network", "2 — independent providers, agreement settled on chain (not a proof)", "GenesisHesap, one per chain"),
      satir("Open model in this page (Qwen2.5-0.5B, q4f16)", "3 — on your device, served by this site; its sha256 is checked before it runs", "hash: GENESIS registration, else the publisher's"),
    ])
  ])));

  /* ---- chat ---- */
  const kayit = el("div", { sinif: "yigin" });
  const soru = el("textarea", { sinif: "girdi", attr: { rows: "3", placeholder: "Ask GENESIS anything, in any language." } });
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const sor = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Ask" });
  const yukle = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Load the open model on this device (483 MB, once; from this site only)" });
  const zincirdeSor = el("input", { attr: { type: "checkbox" } });
  const zincirdeEtiket = el("label", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [zincirdeSor,
    el("span", { yazi: " Also ask GENESIS-0 on chain (your question is sent to the Arc RPC as a read call; nothing is stored). Off by default: otherwise your question never leaves this page." })]);
  let hafiza = null;
  yukle.addEventListener("click", async () => {
    try { yukle.disabled = true; const d = (await acikModeliYukle(durum)).dogrulama; durum.textContent = "Open model ready, running on your device. sha256 matches the hash " + d.kaynak + "."; yukle.textContent = "Open model loaded"; }
    catch (e) { durum.textContent = "Could not load the open model here: " + (e.message || e); yukle.disabled = false; }
  });

  const balon = (kim, govde, etiket) => el("div", { sinif: "panel" }, [
    el("div", { sinif: "panel__govde yigin yigin--sik" }, [
      el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: kim + (etiket ? " · " + etiket : "") }), govde])
  ]);

  sor.addEventListener("click", async () => {
    const q = String(soru.value || "").trim();
    if (!q) return;
    kayit.prepend(balon("You", el("div", { yazi: q })));
    soru.value = "";
    try {
      durum.textContent = "Reading GENESIS memory…";
      if (hafiza === null) hafiza = arcCanli ? await bilgiler(arc) : [];
      const bulunan = ilgili(q, hafiza);
      const kaynaklar = el("div", { sinif: "yigin yigin--sik" }, bulunan.map((b) =>
        el("div", { sinif: "yazi yazi--kucuk", yazi: "• " + b.metin + "  [" + b.zincir + " #" + b.sira + "]" })));

      let cevap;
      if (uretici) {
        durum.textContent = "Thinking on your device…";
        const baglam = bulunan.map((b, i) => "[" + (i + 1) + "] " + b.metin).join("\n") || "(no record matches this question)";
        const mesajlar = [
          { role: "system", content: "You are PULSE GENESIS, the AI of the ARC PULSE ecosystem. Answer in the user's language, briefly and plainly. For anything about ARC PULSE, FTHM, Arc or GENESIS, use ONLY the MEMORY records below and cite them as [n]. If the records do not contain the answer, say you do not have verified information on it. For general questions answer from general knowledge and say it is not from GENESIS memory. Never invent numbers or addresses.\n\nMEMORY:\n" + baglam },
          { role: "user", content: q }
        ];
        const r = await uretici(mesajlar, { max_new_tokens: 220, do_sample: false });
        cevap = balon("GENESIS", el("div", { sinif: "yigin yigin--sik" }, [el("div", { yazi: r[0].generated_text.at(-1).content }), kaynaklar]),
          "open model on your device (mode 3), facts from on-chain memory");
      } else {
        cevap = balon("GENESIS", bulunan.length ? el("div", { sinif: "yigin yigin--sik" }, [el("div", { yazi: "From verified memory:" }), kaynaklar])
          : el("div", { yazi: hafiza.length ? "I have no verified memory on this yet. You can propose what you know below." :
            "GENESIS memory is not on chain yet, so I have nothing verified to answer from." }), "on-chain memory");
      }
      kayit.prepend(cevap);

      /* GENESIS ATLAS from the chat: a question naming a chain gets the map's research on it */
      const at = await (await import("./atlas.js")).atlasSoru(q).catch(() => null);
      if (at) kayit.prepend(balon("GENESIS ATLAS", el("div", { sinif: "yigin yigin--sik" }, at.satirlar.map((t) => el("div", { sinif: "yazi yazi--kucuk", yazi: t }))),
        "on-chain data for " + at.zincir + ", read by the Atlas indexer"));

      /* the on-chain model reads the question through an RPC call (nothing is stored, but the RPC
         provider sees the text): only when the user asks for it */
      if (arcCanli && zincirdeSor.checked) {
        const v = toUtf8Bytes(q.slice(-120));
        const [u] = await cokluOku(arc, [[GENESIS.dil, DIL, "uret", [v, 120, BigInt(Date.now()), true]]]);
        let t = ""; try { t = u ? toUtf8String(u) : ""; } catch (e) { t = "(not valid text)"; }
        if (t) kayit.prepend(balon("GENESIS-0", el("div", { sinif: "mono yazi yazi--kucuk", yazi: t }),
          "its own model, generated on chain (mode 1) — a small trigram model, still learning"));
      }
      durum.textContent = "";
    } catch (e) { durum.textContent = (e && e.message) || "Something failed."; }
  });

  const oneriMetin = el("textarea", { sinif: "girdi", attr: { rows: "2", placeholder: "A fact GENESIS should know (English or any language, no links)." } });
  const oneriDurum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const oneriD = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Propose to GENESIS memory" });
  oneriD.addEventListener("click", async () => {
    try {
      const m = String(oneriMetin.value || "").trim();
      if (m.length < 20) { oneriDurum.textContent = "At least 20 characters."; return; }
      if (!arcCanli) { oneriDurum.textContent = "GENESIS is not on Arc yet."; return; }
      if (!(cuzdan.hesap() || (await cuzdan.bagla()))) { oneriDurum.textContent = "Connect a wallet first."; return; }
      const veri = new Interface(CEKIRDEK).encodeFunctionData("oner", [2, hexlify(toUtf8Bytes(m))]);
      const h = await cuzdan.agdaGonder(arc, { to: GENESIS.cekirdek, data: veri });
      oneriDurum.textContent = "Proposed (" + kisa(h) + "). It becomes memory only if it passes the rules: no links or unknown addresses, and the same text from a second address after 24 hours.";
    } catch (e) { oneriDurum.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
  });

  kap.append(panel("Talk to GENESIS", el("div", { sinif: "yigin" }, [
    not("Nothing you type here is stored or sent anywhere. Answers about ARC PULSE come only from GENESIS's verified on-chain memory; when it has nothing verified, it says so.", "bilgi"),
    soru, zincirdeEtiket, el("div", { sinif: "satir" }, [sor, yukle]), durum, kayit
  ])));

  kap.append(await teshisBolumu(arc));

  /* paid knowledge: titles are on chain, the text is sold through the Atlas API */
  const kl = arcCanli ? await konular(arc).catch(() => []) : [];
  kap.append(panel("What GENESIS knows (paid answers)", el("div", { sinif: "yigin" }, [
    not("Topic titles are public and written on chain, each with a hash of its text, so a bought answer can be checked against what GENESIS committed to. " +
      "The text and GENESIS's answers on these topics are paid in USDC through the Atlas API, with the same packages. No wallet, position or trade of anyone is in it.", "bilgi"),
    kl.length
      ? el("div", { sinif: "yigin yigin--sik" }, kl.map((k) => el("div", { sinif: "yazi yazi--kucuk", yazi: (k.arastirma ? "◆ research · " : "• ") + k.baslik })))
      : el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "No paid topics on chain yet." })
  ])));
  kap.append(panel("Teach GENESIS", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Proposals are public and signed by your wallet. GENESIS learns only what passes its rules." }),
    oneriMetin, oneriD, oneriDurum
  ])));

  /* GENESIS ATLAS: the map, navigation and the API, as part of GENESIS */
  kap.append(await (await import("./atlas.js")).atlasBolumu());

  if (arcCanli) {
    const [korkuluk] = await cokluOku(arc, [[GENESIS.cekirdek, CEKIRDEK, "KORKULUK_METNI"]]);
    if (korkuluk) kap.append(panel("Guardrails (immutable, in the contract)", el("div", { sinif: "yazi yazi--kucuk", yazi: korkuluk })));
  }
  return kap;
}


/* ---- Diagnose a launch: GENESIS reads the launch's health from the chains and offers the fixes ---- */
async function teshisBolumu(arc) {
  const V = await fetch("veri/sepet-v2.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const girdi = el("input", { sinif: "girdi", attr: { placeholder: "Token address on Arc (0x…)", spellcheck: "false" } });
  const dugme = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Diagnose" });
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const sonuc = el("div", { sinif: "yigin" });
  dugme.addEventListener("click", async () => {
    sonuc.replaceChildren();
    if (!V || !V.teshis) { durum.textContent = "The diagnosis contract is not configured."; return; }
    try {
      durum.textContent = "Reading the launch from Arc and its twins from every chain…";
      const t = await teshisEt(V, String(girdi.value || ""));
      const r = t.rapor;
      if (t.var_) sonuc.append(el("div", { sinif: "yazi yazi--kucuk mono", yazi: "Basket lines: " + r.satirlar.map((s) => zincirAdi(Number(s.zincir)) + " $" + (Number(s.biriken) / 1e6).toFixed(2) +
        (s.lotHazir ? " (lot ready)" : "") + (s.kasaDolu ? " · vault holds it" : "")).join(" | ") + "   ·   tax bucket $" + (Number(r.kovaDolar) / 1e6).toFixed(2) +
        "   ·   founder income $" + (Number(r.vekilDolar) / 1e6).toFixed(2) + "   ·   queued orders " + t.emirler.length }));
      if (t.ikizler && t.ikizler.length) sonuc.append(el("div", { sinif: "yazi yazi--kucuk mono yazi--sessiz", yazi: "Twins: " + t.ikizler.map((k) => k.ag + (k.hata ? " (unread)" : k.var_ === false ? " none" :
        " " + k.oradaIslenen + "/" + k.arcdanGiden + " in, " + k.arcdaIslenen + "/" + k.oradanGiden + " back")).join(" · ") }));
      if (!t.sorunlar.length) sonuc.append(not("No problem found: nothing waiting, nothing queued, every twin message delivered.", "bilgi"));
      for (const s of t.sorunlar) {
        const satir = el("div", { sinif: "yigin yigin--sik" }, [el("div", { yazi: "• " + s.metin })]);
        if (s.duzelt) {
          const b = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: s.duzelt.ad + (s.duzelt.bahsis ? " — you receive " + s.duzelt.bahsis : "") });
          const d = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
          b.addEventListener("click", async () => {
            try {
              if (!(cuzdan.hesap() || (await cuzdan.bagla()))) { d.textContent = "Connect a wallet first."; return; }
              const ag = AGLAR.find((a) => a.anahtar === "arc");
              if (s.duzelt.onay) {
                d.textContent = "Approve the exact fee in your wallet…";
                await cuzdan.agdaGonder(ag, { to: s.duzelt.onay.token, data: new Interface(["function approve(address,uint256)"]).encodeFunctionData("approve", [s.duzelt.onay.harcayan, s.duzelt.onay.miktar]) });
              }
              d.textContent = "Confirm in your wallet…";
              const h = await cuzdan.agdaGonder(ag, { to: s.duzelt.hedef, data: s.duzelt.veri, ...(s.duzelt.gaz ? { gas: s.duzelt.gaz } : {}) });
              d.textContent = "Sent: " + h + ". Diagnose again in a few seconds to see the result.";
            } catch (e) { d.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
          });
          satir.append(b, d);
        }
        sonuc.append(satir);
      }
      durum.textContent = "Read from the chains just now. Nothing was stored.";
    } catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || "Could not read this launch."; }
  });
  return panel("Diagnose a launch", el("div", { sinif: "yigin" }, [
    not("GENESIS reads a launch's health straight from the chains: basket lines waiting at $50, queued redemption orders, the tax bucket, the founder's income, and every LayerZero message between the token and its twins. Each fix is a public call anyone may make from their own wallet; where the contract pays a tip, it goes to you.", "bilgi"),
    el("div", { sinif: "satir" }, [girdi, dugme]), durum, sonuc,
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: V && V.teshis ? "LaunchpadTeshis on Arc: " + V.teshis + " (view only, no owner)" : "" })
  ]));
}
