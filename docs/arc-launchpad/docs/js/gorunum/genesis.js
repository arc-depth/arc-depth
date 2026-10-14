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
import { cokluOku } from "../ag-okur.js";
import { cuzdan } from "../cuzdan.js";
import { Interface, toUtf8Bytes, toUtf8String, hexlify } from "../../vendor/ethers.min.js";

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
const TRANSFORMERS = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1";
const ev = () => AGLAR.find((a) => a.anahtar === "arc");
const zincirler = () => GENESIS.zincirler.map((k) => AGLAR.find((a) => a.anahtar === k)).filter(Boolean);
const kisa = (a) => a.slice(0, 6) + "…" + a.slice(-4);

async function kodVar(ag, adres) {
  try {
    const r = await fetch(ag.rpc, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [adres, "latest"] }) }).then((x) => x.json());
    return !!r.result && r.result.length > 2;
  } catch (e) { return null; }
}

/* every verified-knowledge record stored on chain, read from Arc */
export async function bilgiler(ag) {
  const sayilar = await cokluOku(ag, zincirler().map((z) => [GENESIS.cekirdek, CEKIRDEK, "kayitSayisi", [z.eid]]));
  const istek = [];
  zincirler().forEach((z, i) => { for (let s = 0; s < Number(sayilar[i] || 0); s++) istek.push([GENESIS.cekirdek, CEKIRDEK, "kayitVeri", [z.eid, s], z, s]); });
  const out = [];
  for (let i = 0; i < istek.length; i += 40) {
    const parca = istek.slice(i, i + 40);
    const r = await cokluOku(ag, parca.map((x) => x.slice(0, 4)));
    r.forEach((x, j) => {
      if (!x) return;
      const [k, v] = x;
      if (Number(k.tur) !== 2 || Number(k.saklama) !== 0) return;
      let metin; try { metin = toUtf8String(v); } catch (e) { return; }
      out.push({ metin, zincir: parca[j][4].ad, sira: parca[j][5] });
    });
  }
  return out;
}

const kelimeler = (s) => (s.toLocaleLowerCase("tr").match(/[\p{L}\p{N}]{3,}/gu) || []);
export function ilgili(soru, liste, n = 3) {
  const q = new Set(kelimeler(soru));
  return liste.map((b) => {
    const k = kelimeler(b.metin);
    const ortak = k.filter((w) => q.has(w)).length;
    return { ...b, puan: ortak / Math.sqrt(k.length + 1) };
  }).filter((b) => b.puan > 0).sort((a, b) => b.puan - a.puan).slice(0, n);
}

let uretici = null;
async function acikModeliYukle(durum) {
  if (uretici) return uretici;
  const { pipeline } = await import(TRANSFORMERS);
  const ilerleme = (x) => { if (x.status === "progress" && x.total) durum.textContent = "Downloading the open model to your device: " + Math.round((x.loaded / x.total) * 100) + "% of " + x.file; };
  try {
    uretici = await pipeline("text-generation", ACIK_MODEL, { dtype: "q4f16", device: "webgpu", progress_callback: ilerleme });
  } catch (e) {
    uretici = await pipeline("text-generation", ACIK_MODEL, { dtype: "q4", device: "wasm", progress_callback: ilerleme });
  }
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
    olcum("Chains with GENESIS", canliZ.length + " of " + zs.length, canliZ.map((z) => z.ad).join(", ") || "none yet"),
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
      satir("Open model in this page (Qwen2.5-0.5B)", "3 — on your device; weights hash on chain", "registered in memory"),
    ])
  ])));

  /* ---- chat ---- */
  const kayit = el("div", { sinif: "yigin" });
  const soru = el("textarea", { sinif: "girdi", attr: { rows: "3", placeholder: "Ask GENESIS anything, in any language." } });
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const sor = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Ask" });
  const yukle = el("button", { sinif: "dugme dugme--sessiz", attr: { type: "button" }, yazi: "Load the open model on this device (~500 MB, once)" });
  let hafiza = null;
  yukle.addEventListener("click", async () => {
    try { yukle.disabled = true; await acikModeliYukle(durum); durum.textContent = "Open model ready, running on your device."; yukle.textContent = "Open model loaded"; }
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
          : el("div", { yazi: hafiza.length ? "I have no verified memory on this yet. Load the open model for general questions, or propose what you know below." :
            "GENESIS memory is not on chain yet, so I have nothing verified to answer from." }), "on-chain memory");
      }
      kayit.prepend(cevap);

      if (arcCanli) {
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
    soru, el("div", { sinif: "satir" }, [sor, yukle]), durum, kayit
  ])));
  kap.append(panel("Teach GENESIS", el("div", { sinif: "yigin" }, [
    el("div", { sinif: "alan__ipucu", yazi: "Proposals are public and signed by your wallet. GENESIS learns only what passes its rules." }),
    oneriMetin, oneriD, oneriDurum
  ])));

  if (arcCanli) {
    const [korkuluk] = await cokluOku(arc, [[GENESIS.cekirdek, CEKIRDEK, "KORKULUK_METNI"]]);
    if (korkuluk) kap.append(panel("Guardrails (immutable, in the contract)", el("div", { sinif: "yazi yazi--kucuk", yazi: korkuluk })));
  }
  return kap;
}
