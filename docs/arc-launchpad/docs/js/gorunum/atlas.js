/* ===========================================================================
 * gorunum/atlas.js — GENESIS ATLAS: the map of chains, the flows between
 *                    them, and routes across them
 *
 * A capability of GENESIS, drawn inside its page (gorunum/genesis.js). The
 * data is docs/veri/atlas.json and atlas-gecmis.json, written by
 * scripts/atlas-indeks.js from public RPCs alone: every edge is a count or a
 * dollar sum of on-chain events (Circle CCTP V2 burns, LayerZero packets) in
 * a stated window. Nothing on the map is estimated.
 *
 * ACCESS
 *   The live map is open to everyone. The advanced layer — history
 *   slider, GENESIS research on a node, the discovery layer — opens with
 *   an FTHM stake, at the staking contract's own first level (any amount
 *   staked; the only other level that exists is the 50,000 FTHM vote
 *   threshold). No payment. This is a gate in the page; the API's gate is
 *   enforced by its server against AtlasAbonelik.
 * NAVIGATION
 *   Dollar routes between chains: Circle CCTP V2 (burn and mint by the
 *   issuer; fee read from Circle's public fee endpoint) and relay.link
 *   (solvers; quote from its open API). Compared on output, time and risk;
 *   the relay route executes with the user's signature through the same
 *   path the FTHM page uses. CCTP execution from this page is not built
 *   yet, and the page says so.
 * =========================================================================== */
import { el, panel, not } from "../ui.js";
import { AGLAR } from "../aglar.js";
import { GENESIS } from "../genesis-adres.js";
import { cokluOku } from "../ag-okur.js";
import { cuzdan } from "../cuzdan.js";
import { Interface } from "../../vendor/ethers.min.js";

const STAKE = "0xAbD31A537E089D8a12b928aF7837C148dE2Bd2de";        // dagitim-fathom.json "stake", Arc
const STAKE_ABI = ["function stakedOf(address) view returns (uint256)", "function MIN_OY_GUCU() view returns (uint256)"];
const ABONE_ABI = ["function paketSayisi() view returns (uint256)",
  "function paketler(uint256) view returns (uint256 fiyat, uint32 gun, uint64 cagri, bool acik, string ad)",
  "function erisim(address) view returns (uint64 cagriHakki, bool abone, uint8 seviye, uint64 bitis)",
  "function satinAl(uint256,address)"];
const RELAY = "https://api.relay.link";
const IRIS = "https://iris-api.circle.com";
const arc = () => AGLAR.find((a) => a.anahtar === "arc");
const css = (ad, yedek) => (getComputedStyle(document.documentElement).getPropertyValue(ad) || "").trim() || yedek;
const dolar = (x) => "$" + Number(x).toLocaleString("en-US", { maximumFractionDigits: x < 100 ? 2 : 0 });

async function veriOku() {
  const [a, g] = await Promise.all([
    fetch("veri/atlas.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch("veri/atlas-gecmis.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).catch(() => [])
  ]);
  return { atlas: a, gecmis: g };
}

async function stakeDurumu() {
  const ben = cuzdan.hesap();
  if (!ben) return { ben: null, stake: 0n };
  const [s] = await cokluOku(arc(), [[STAKE, STAKE_ABI, "stakedOf", [ben]]]).catch(() => [null]);
  return { ben, stake: s == null ? null : BigInt(s) };
}

/* ---- the map ------------------------------------------------------- */

function yerlesim(dugumler) {
  /* our chains on the inner ring, everything discovered in traffic outside */
  const ic = dugumler.filter((d) => d.bizim), dis = dugumler.filter((d) => !d.bizim);
  const konum = {};
  ic.forEach((d, i) => { const a = (i / ic.length) * Math.PI * 2 - Math.PI / 2; konum[d.id] = { x: Math.cos(a) * 220, y: Math.sin(a) * 220 }; });
  dis.forEach((d, i) => { const a = (i / Math.max(1, dis.length)) * Math.PI * 2 - Math.PI / 2 + 0.2; konum[d.id] = { x: Math.cos(a) * 420, y: Math.sin(a) * 420 }; });
  return konum;
}

function haritaCiz(atlas, gecmis, gelismis, secildi) {
  const tuval = el("canvas", { sinif: "atlas__tuval", attr: { role: "img", "aria-label": "Map of chains and the capital flowing between them" } });
  tuval.style.cssText = "width:100%;height:520px;display:block;touch-action:none;cursor:grab;border-radius:var(--yuvarlak-m);background:var(--yuzey-1)";
  const durum = { olcek: 0.75, dx: 0, dy: 0, filtre: { cctp: true, lz: true, dis: true }, ara: "", an: null, isik: new Set() };
  const konum = yerlesim(atlas.dugumler);
  const kesifler = new Set((atlas.kesifler || []).map((k) => k.kenar || ""));
  let kenarlar = atlas.kenarlar;
  const parcaciklar = [];

  const kenarlariKur = (liste) => {
    kenarlar = liste;
    parcaciklar.length = 0;
    for (const k of liste) {
      const v = k.miktar != null ? k.miktar : k.adet;
      const n = Math.max(1, Math.min(8, Math.round(Math.log10(1 + v))));
      for (let i = 0; i < n; i++) parcaciklar.push({ k, t: Math.random() });
    }
  };
  kenarlariKur(kenarlar);

  const ekranda = (p) => {
    const r = tuval.getBoundingClientRect();
    return { x: r.width / 2 + (p.x + durum.dx) * durum.olcek, y: r.height / 2 + (p.y + durum.dy) * durum.olcek };
  };
  const gorunur = (k) => (k.tur === "cctp" ? durum.filtre.cctp : durum.filtre.lz) &&
    (durum.filtre.dis || (atlas.dugumler.find((d) => d.id === k.hedef) || {}).bizim);

  function ciz() {
    const r = tuval.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (tuval.width !== Math.round(r.width * dpr)) { tuval.width = Math.round(r.width * dpr); tuval.height = Math.round(r.height * dpr); }
    const c = tuval.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, r.width, r.height);
    const renkCctp = css("--alis", "#2bb673"), renkLz = css("--marka", "#7a5cff"), metin = css("--yazi-1", "#eee"), soluk = css("--yazi-3", "#888");
    for (const k of kenarlar) {
      if (!gorunur(k) || !konum[k.kaynak] || !konum[k.hedef]) continue;
      const a = ekranda(konum[k.kaynak]), b = ekranda(konum[k.hedef]);
      const v = k.miktar != null ? k.miktar : k.adet;
      c.strokeStyle = k.tur === "cctp" ? renkCctp : renkLz;
      c.globalAlpha = 0.35;
      c.lineWidth = Math.max(1, Math.log10(1 + v) * 1.2);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      if (kesifler.has(k.tur + ":" + k.kaynak + ">" + k.hedef)) { c.globalAlpha = 0.9; c.setLineDash([4, 4]); c.stroke(); c.setLineDash([]); }
    }
    c.globalAlpha = 1;
    for (const p of parcaciklar) {
      if (!gorunur(p.k) || !konum[p.k.kaynak] || !konum[p.k.hedef]) continue;
      const a = ekranda(konum[p.k.kaynak]), b = ekranda(konum[p.k.hedef]);
      c.fillStyle = p.k.tur === "cctp" ? renkCctp : renkLz;
      c.beginPath(); c.arc(a.x + (b.x - a.x) * p.t, a.y + (b.y - a.y) * p.t, 2.2, 0, Math.PI * 2); c.fill();
    }
    c.font = "12px " + css("--yazi-tipi", "sans-serif");
    for (const d of atlas.dugumler) {
      if (!d.bizim && !durum.filtre.dis) continue;
      const p = ekranda(konum[d.id]);
      const aranan = durum.ara && d.ad.toLowerCase().includes(durum.ara);
      const hatali = d.hatalar && d.hatalar.length;
      c.fillStyle = d.bizim ? (hatali ? css("--uyari", "#e0a000") : metin) : soluk;
      c.beginPath(); c.arc(p.x, p.y, d.bizim ? 9 : 5, 0, Math.PI * 2); c.fill();
      if (aranan || secildi.id === d.id) { c.strokeStyle = css("--marka-parlak", "#a08cff"); c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, 14, 0, Math.PI * 2); c.stroke(); }
      c.fillStyle = d.bizim ? metin : soluk;
      c.fillText(d.ad, p.x + 12, p.y + 4);
    }
  }

  function dongu() {
    for (const p of parcaciklar) { p.t += 0.004 + Math.min(0.01, Math.log10(1 + (p.k.miktar || p.k.adet)) * 0.0015); if (p.t > 1) p.t = 0; }
    /* keep going until the canvas is on the page; stop once it has left it */
    if (tuval.isConnected) { durum.bagli = true; ciz(); }
    if (tuval.isConnected || !durum.bagli) durum.an = requestAnimationFrame(dongu);
  }
  requestAnimationFrame(dongu);

  /* pan, zoom, pick */
  let surukle = null;
  tuval.addEventListener("pointerdown", (e) => { surukle = { x: e.clientX, y: e.clientY, dx: durum.dx, dy: durum.dy, hareket: 0 }; tuval.setPointerCapture(e.pointerId); tuval.style.cursor = "grabbing"; });
  tuval.addEventListener("pointermove", (e) => {
    if (!surukle) return;
    surukle.hareket += Math.abs(e.movementX) + Math.abs(e.movementY);
    durum.dx = surukle.dx + (e.clientX - surukle.x) / durum.olcek; durum.dy = surukle.dy + (e.clientY - surukle.y) / durum.olcek;
  });
  tuval.addEventListener("pointerup", (e) => {
    tuval.style.cursor = "grab";
    const tik = surukle && surukle.hareket < 6;
    surukle = null;
    if (!tik) return;
    const r = tuval.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    let en = null, enM = 18;
    for (const d of atlas.dugumler) { const p = ekranda(konum[d.id]); const m = Math.hypot(p.x - mx, p.y - my); if (m < enM) { en = d; enM = m; } }
    if (en) secildi.sec(en);
  });
  tuval.addEventListener("wheel", (e) => { e.preventDefault(); durum.olcek = Math.min(4, Math.max(0.3, durum.olcek * (e.deltaY < 0 ? 1.12 : 0.89))); }, { passive: false });

  const araKutu = el("input", { sinif: "girdi", attr: { type: "search", placeholder: "Find a chain…", "aria-label": "Find a chain" } });
  araKutu.addEventListener("input", () => {
    durum.ara = araKutu.value.trim().toLowerCase();
    const d = durum.ara && atlas.dugumler.find((x) => x.ad.toLowerCase().includes(durum.ara));
    if (d) { durum.dx = -konum[d.id].x; durum.dy = -konum[d.id].y; }
  });
  const kutu = (ad, anahtar) => {
    const g = el("input", { attr: { type: "checkbox", checked: true } });
    g.addEventListener("change", () => { durum.filtre[anahtar] = g.checked; });
    return el("label", { sinif: "satir yazi yazi--kucuk" }, [g, el("span", { yazi: " " + ad })]);
  };
  const yak = (k) => el("button", { sinif: "dugme dugme--sessiz dugme--kucuk", attr: { type: "button", "aria-label": k > 1 ? "Zoom in" : "Zoom out" }, yazi: k > 1 ? "+" : "−",
    on: { click: () => { durum.olcek = Math.min(4, Math.max(0.3, durum.olcek * k)); } } });

  /* history: the advanced layer */
  const zamanSatiri = el("div", { sinif: "yigin yigin--sik" });
  if (gelismis && gecmis.length > 1) {
    const kaydirici = el("input", { attr: { type: "range", min: "0", max: String(gecmis.length - 1), value: String(gecmis.length - 1), "aria-label": "Point in history" }, sinif: "girdi" });
    const etiket = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Now: " + atlas.zaman });
    kaydirici.addEventListener("input", () => {
      const g = gecmis[Number(kaydirici.value)];
      etiket.textContent = "Window ending " + g.zaman + (Number(kaydirici.value) === gecmis.length - 1 ? " (latest)" : "");
      kenarlariKur(g.kenar.map(([a, v]) => {
        const [tur, rest] = [a.slice(0, a.indexOf(":")), a.slice(a.indexOf(":") + 1)];
        const [kaynak, hedef] = rest.split(">");
        return tur === "cctp" ? { tur, kaynak, hedef, miktar: v } : { tur, kaynak, hedef, adet: v };
      }));
    });
    zamanSatiri.append(kaydirici, etiket);
  } else if (gelismis) {
    zamanSatiri.append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "History builds up as the indexer runs; " + gecmis.length + " window(s) so far." }));
  }

  return el("div", { sinif: "yigin" }, [
    el("div", { sinif: "satir", attr: { style: "flex-wrap:wrap;gap:12px;align-items:center" } },
      [araKutu, kutu("Dollar flows (CCTP)", "cctp"), kutu("Messages (LayerZero)", "lz"), kutu("Chains outside ARC PULSE", "dis"), yak(1.25), yak(0.8)]),
    tuval, zamanSatiri,
    el("div", { sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: "Green: USDC burned on one chain and minted on another (Circle CCTP V2). Purple: LayerZero messages. Dashed: a discovery. " +
        "Window: last " + Math.round(atlas.pencereSaniye / 60) + " min of blocks per chain, read " + atlas.zaman + ". Drag to move, wheel or +/− to zoom, click a chain." })
  ]);
}

/* ---- research on a node (deterministic analysis of the indexed data) - */

function arastir(atlas, gecmis, d) {
  const cikis = atlas.kenarlar.filter((k) => k.kaynak === d.id), giris = atlas.kenarlar.filter((k) => k.hedef === d.id);
  const top = (l, t) => l.filter((k) => k.tur === t).reduce((s, k) => s + (k.miktar != null ? k.miktar : k.adet), 0);
  const tumCctp = atlas.kenarlar.filter((k) => k.tur === "cctp").reduce((s, k) => s + k.miktar, 0);
  const satirlar = [];
  if (d.bizim) {
    satirlar.push("Head block " + d.blok + (d.blokSuresi ? ", " + d.blokSuresi + " s per block" : "") + (d.gazGwei != null ? ", gas " + d.gazGwei + " gwei" : "") + ".");
    if (d.usdcArz != null) satirlar.push("Native USDC on this chain: " + dolar(d.usdcArz) + ".");
    if (d.yeniHavuz != null) satirlar.push(d.yeniHavuz + " new Uniswap v4 pool(s) opened in the window.");
  }
  const cc = top(cikis, "cctp"), gc = top(giris, "cctp");
  satirlar.push("USDC out by CCTP: " + dolar(cc) + (tumCctp ? " (" + ((cc / tumCctp) * 100).toFixed(1) + "% of all CCTP outflow seen)" : "") + "; in from the indexed chains: " + dolar(gc) + ".");
  const enBuyuk = cikis.filter((k) => k.tur === "cctp").sort((a, b) => b.miktar - a.miktar)[0];
  if (enBuyuk) satirlar.push("Largest destination: " + ((atlas.dugumler.find((x) => x.id === enBuyuk.hedef) || {}).ad || enBuyuk.hedef) + ", " + dolar(enBuyuk.miktar) + " in " + enBuyuk.adet + " burn(s).");
  satirlar.push("LayerZero messages out: " + top(cikis, "lz") + ", in from indexed chains: " + top(giris, "lz") + ".");
  if (gecmis.length >= 3) {
    const seri = gecmis.map((g) => g.kenar.filter((x) => x[0].startsWith("cctp:" + d.id + ">")).reduce((s, x) => s + x[1], 0));
    const ort = seri.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, seri.length - 1);
    satirlar.push("Against its own average over " + (seri.length - 1) + " earlier windows (" + dolar(ort) + "), this window's CCTP outflow is " + (ort ? ((seri[seri.length - 1] / ort) * 100).toFixed(0) + "%" : "new") + ".");
  }
  const kesif = (atlas.kesifler || []).filter((k) => (k.kenar || "").includes(d.id));
  for (const k of kesif) satirlar.push("Discovery: " + k.tur + " " + (k.kenar || "") + (k.medyan ? " — " + dolar(k.deger) + " against a median of " + dolar(k.medyan) : "") + ".");
  if (d.hatalar && d.hatalar.length) satirlar.push("Not read this window: " + d.hatalar.join("; ") + ".");
  return satirlar;
}

/* ---- navigation ---------------------------------------------------- */

async function rotalar(kaynak, hedef, miktar, ben) {
  const out = [];
  /* CCTP V2: Circle's public fee endpoint, standard and fast */
  if (kaynak.domain != null && hedef.domain != null) {
    try {
      const f = await fetch(IRIS + "/v2/burn/USDC/fees/" + kaynak.domain + "/" + hedef.domain).then((r) => r.json());
      const liste = Array.isArray(f) ? f : f.data || [];
      for (const x of liste) {
        const hizli = Number(x.finalityThreshold) <= 1000;
        const bps = Number(x.minimumFee || 0);
        out.push({ ad: "Circle CCTP V2 — " + (hizli ? "fast" : "standard"), cikti: miktar * (1 - bps / 10000), ucret: miktar * bps / 10000,
          sure: hizli ? "seconds" : "minutes (waits for the source chain's finality)", risk: "lowest: USDC is burned and re-minted by its issuer; no bridge pool. Cost shown is Circle's fee only; you also pay gas on both chains",
          yurut: null });
      }
    } catch (e) { out.push({ ad: "Circle CCTP V2", hata: "fee endpoint did not answer" }); }
  }
  /* relay.link: solvers, open API */
  try {
    const govde = { user: ben || "0x000000000000000000000000000000000000dEaD", recipient: ben || "0x000000000000000000000000000000000000dEaD",
      originChainId: kaynak.id, destinationChainId: hedef.id, originCurrency: kaynak.dolar, destinationCurrency: hedef.dolar,
      amount: String(BigInt(Math.round(miktar * 1e6)) * (kaynak.sarmal ? 10n ** 12n : 1n)), tradeType: "EXACT_INPUT" };
    const q = await fetch(RELAY + "/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(govde) }).then((r) => r.json());
    if (q.details) {
      const cik = Number(q.details.currencyOut.amountFormatted), sure = q.details.timeEstimate;
      out.push({ ad: "relay.link (solver fill)", cikti: cik, ucret: miktar - cik, sure: sure != null ? sure + " s (estimate)" : "—",
        risk: "a solver fronts the funds on the destination; you are exposed only for the fill time", yurut: ben ? q : null });
    } else out.push({ ad: "relay.link", hata: q.message || "no route" });
  } catch (e) { out.push({ ad: "relay.link", hata: "did not answer" }); }
  return out;
}

async function relayYurut(q, ag, durumYaz) {
  for (const adim of q.steps || []) for (const it of adim.items || []) {
    if (adim.kind !== "transaction") continue;
    durumYaz((adim.id === "approve" ? "Approve" : "Confirm") + " in your wallet…");
    const d = it.data;
    await cuzdan.agdaGonder(ag, { to: d.to, data: d.data, value: "0x" + BigInt(d.value || 0).toString(16) });
  }
  durumYaz("Sent. Delivery on the destination usually takes seconds to a few minutes.");
}

function navigasyon() {
  const aglar = AGLAR.filter((a) => a.dolar);
  const sec = (v) => { const s = el("select", { sinif: "girdi", attr: { style: "flex:1 1 140px;width:auto" } }, aglar.map((a) => el("option", { attr: { value: a.anahtar }, yazi: a.ad }))); s.value = v; return s; };
  const kaynak = sec("base"), hedef = sec("arc");
  const miktar = el("input", { sinif: "girdi girdi--sayi", attr: { type: "number", min: "1", value: "100", style: "flex:0 1 120px;width:auto", "aria-label": "Amount in USDC" } });
  const sonuc = el("div", { sinif: "yigin yigin--sik" });
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const bul = el("button", { sinif: "dugme dugme--marka", attr: { type: "button" }, yazi: "Find routes" });
  bul.addEventListener("click", async () => {
    sonuc.textContent = ""; durum.textContent = "Comparing routes…";
    const k = aglar.find((a) => a.anahtar === kaynak.value), h = aglar.find((a) => a.anahtar === hedef.value);
    if (k === h) { durum.textContent = "Pick two different chains."; return; }
    const m = Number(miktar.value) || 0;
    const r = await rotalar(k, h, m, cuzdan.hesap());
    durum.textContent = "";
    const iyi = r.filter((x) => !x.hata).sort((a, b) => b.cikti - a.cikti);
    if (!iyi.length) { durum.textContent = "No route answered right now."; }
    for (const x of r) {
      const satir = el("div", { sinif: "panel" }, [el("div", { sinif: "panel__govde yigin yigin--sik" }, x.hata
        ? [el("strong", { yazi: x.ad }), el("div", { sinif: "yazi yazi--kucuk", yazi: x.hata })]
        : [el("strong", { yazi: x.ad + (x === iyi[0] ? " · most received" : "") }),
          el("div", { sinif: "yazi yazi--kucuk", yazi: "You receive ≈ " + x.cikti.toLocaleString("en-US", { maximumFractionDigits: 4 }) + " " + h.dolarSembol + " · cost ≈ " + dolar(Math.max(0, x.ucret)) + " · time " + x.sure }),
          el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Risk: " + x.risk }),
          x.yurut ? el("button", { sinif: "dugme dugme--sessiz dugme--kucuk", attr: { type: "button" }, yazi: "Send with this route",
            on: { click: () => relayYurut(x.yurut, k, (t) => { durum.textContent = t; }).catch((e) => { durum.textContent = e.message || "Could not send."; }) } })
            : el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: x.ad.startsWith("Circle") ? "Executing CCTP from this page is not built yet; compare here, send through Circle-integrated apps." : "Connect a wallet to send." })])]);
      sonuc.append(satir);
    }
  });
  return el("div", { sinif: "yigin" }, [
    el("div", { sinif: "satir", attr: { style: "flex-wrap:wrap;gap:8px;align-items:center" } }, [kaynak, el("span", { yazi: "→" }), hedef, miktar, el("span", { yazi: "USDC" }), bul]),
    durum, sonuc
  ]);
}

/* ---- API sales ----------------------------------------------------- */

async function apiPaneli() {
  const a = arc();
  const adres = GENESIS.atlasAbonelik;
  const govde = el("div", { sinif: "yigin" }, [
    el("div", { sinif: "yazi yazi--kucuk", yazi: "Atlas data as an API: chain stats, CCTP and LayerZero flows, discoveries, history, and route quotes. Paid in USDC on Arc; no FTHM stake needed. Your wallet is your key: sign each request, nothing secret to leak." }),
    el("pre", { sinif: "mono yazi yazi--kucuk", attr: { style: "white-space:pre-wrap;overflow-x:auto" },
      yazi: "GET /v1/map          latest snapshot (nodes, edges, discoveries)\nGET /v1/flows?chain=  CCTP + LayerZero edges for one chain\nGET /v1/history       compact history windows\nGET /v1/route?from=&to=&amount=   route comparison\n\nHeaders: X-Atlas-Address, X-Atlas-Time (unix s), X-Atlas-Signature =\n  personal_sign(\"ATLAS <METHOD> <PATH> <TIME>\") by the paying wallet" })
  ]);
  if (!adres) { govde.append(not("The sales contract is written and tested but not on chain yet, so nothing can be bought yet.", "uyari")); return panel("Atlas API", govde); }
  const n = Number((await cokluOku(a, [[adres, ABONE_ABI, "paketSayisi"]]))[0] || 0);
  const p = await cokluOku(a, Array.from({ length: n }, (_, i) => [adres, ABONE_ABI, "paketler", [i]]));
  const durum = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  p.forEach((x, i) => {
    if (!x || !x.acik) return;
    const al = el("button", { sinif: "dugme dugme--sessiz dugme--kucuk", attr: { type: "button" }, yazi: "Buy · " + dolar(Number(x.fiyat) / 1e6) });
    al.addEventListener("click", async () => {
      try {
        const ben = cuzdan.hesap() || (await cuzdan.bagla());
        if (!ben) { durum.textContent = "Connect a wallet first."; return; }
        durum.textContent = "Approve " + dolar(Number(x.fiyat) / 1e6) + " USDC in your wallet…";
        await cuzdan.agdaGonder(a, { to: a.dolar, data: new Interface(["function approve(address,uint256)"]).encodeFunctionData("approve", [adres, x.fiyat]) });
        durum.textContent = "Confirm the purchase…";
        await cuzdan.agdaGonder(a, { to: adres, data: new Interface(ABONE_ABI).encodeFunctionData("satinAl", [i, ben]) });
        durum.textContent = "Bought. Your wallet can call the API as soon as the transaction confirms.";
      } catch (e) { durum.textContent = (e && (e.shortMessage || e.message)) || "Could not send."; }
    });
    govde.append(el("div", { sinif: "satir satir--arasi" }, [el("span", { yazi: x.ad }), al]));
  });
  govde.append(durum);
  return panel("Atlas API", govde);
}

/* ---- from the chat ------------------------------------------------- */

/** Atlas lines for a chat question that names a chain; null if none is
 *  named, or a stake note if the asker has no FTHM stake. */
export async function atlasSoru(soru) {
  const { atlas, gecmis } = await veriOku();
  if (!atlas) return null;
  const q = soru.toLocaleLowerCase("tr");
  const d = atlas.dugumler.filter((x) => q.includes(x.ad.toLocaleLowerCase("tr"))).sort((a, b) => b.ad.length - a.ad.length)[0];
  if (!d) return null;
  const { stake } = await stakeDurumu();
  if (!(stake != null && stake > 0n)) return { zincir: d.ad, satirlar: ["Atlas research on " + d.ad + " opens with an FTHM stake (any amount)."] };
  return { zincir: d.ad, satirlar: arastir(atlas, gecmis, d) };
}

/* ---- the section --------------------------------------------------- */

export async function atlasBolumu() {
  const kap = el("div", { sinif: "yigin" });
  const { atlas, gecmis } = await veriOku();
  if (!atlas) {
    kap.append(panel("GENESIS ATLAS", not("The Atlas indexer has not published a snapshot yet.", "uyari")));
    return kap;
  }
  const { ben, stake } = await stakeDurumu();
  const gelismis = stake != null && stake > 0n;
  const bilgi = el("div", { sinif: "yigin yigin--sik" });
  const secildi = {
    id: null,
    sec(d) {
      this.id = d.id;
      bilgi.textContent = "";
      bilgi.append(el("strong", { yazi: d.ad }));
      if (!gelismis) {
        bilgi.append(el("div", { sinif: "yazi yazi--kucuk", yazi: d.bizim ? "Block " + d.blok + (d.usdcArz != null ? " · USDC " + dolar(d.usdcArz) : "") : "Seen in traffic from the indexed chains." }),
          not(ben ? "GENESIS research on a chain opens with an FTHM stake (any amount, in the staking contract on Arc)." : "Connect a wallet with an FTHM stake to have GENESIS research this chain.", "bilgi"));
        return;
      }
      for (const s of arastir(atlas, gecmis, d)) bilgi.append(el("div", { sinif: "yazi yazi--kucuk", yazi: s }));
    }
  };
  kap.append(panel("GENESIS ATLAS — the map", el("div", { sinif: "yigin" }, [
    gelismis ? null : not("Live map for everyone. History, research on a chain and the discovery list open with an FTHM stake — no payment.", "bilgi"),
    haritaCiz(atlas, gecmis, gelismis, secildi),
    el("div", { sinif: "panel" }, [el("div", { sinif: "panel__govde" }, [bilgi])])
  ].filter(Boolean))));
  bilgi.append(el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "Click a chain on the map." }));

  if (gelismis && (atlas.kesifler || []).length) {
    kap.append(panel("Discoveries", el("div", { sinif: "yigin yigin--sik" }, atlas.kesifler.map((k) =>
      el("div", { sinif: "yazi yazi--kucuk", yazi: k.tur + " · " + (k.kenar || k.ad || k.chainId) + (k.deger != null ? " · " + dolar(k.deger) : "") })))));
  }
  if (gelismis && atlas.analiz && atlas.analiz.enIyiYontem) {
    kap.append(panel("Methods GENESIS tested", el("div", { sinif: "yazi yazi--kucuk",
      yazi: "Forecasting each flow's next window, mean absolute error over " + atlas.analiz.sinananKenar + " edges: " +
        Object.entries(atlas.analiz.ortalamaMutlakHata).map(([k, v]) => k + " " + dolar(v)).join(", ") + ". Best: " + atlas.analiz.enIyiYontem + "." })));
  }
  kap.append(panel("Navigate between chains", navigasyon()));
  kap.append(await apiPaneli());
  return kap;
}
