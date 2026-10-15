"use strict";
/* ===========================================================================
 * grok-nabiz.js — the one paid helper in the X operation
 *
 *   node scripts/grok-nabiz.js            # pulse: what is live on X right now
 *   node scripts/grok-nabiz.js danisma    # strategy only, no X search, ~$0.01
 *   node scripts/grok-nabiz.js --kuru     # print the request and spend, send nothing
 *
 * Why this exists. Replying to a three-day-old post is shouting into an
 * empty room, and nothing free can see what was posted on X in the last
 * few hours: x.com answers WebFetch with HTTP 402, and reading the
 * timeline through screenshots is slow and misses everything outside the
 * logged-in feed. Grok sits on the firehose. That is the single thing it
 * is bought for here.
 *
 * Everything downstream is free and stays free: verifying that a handle
 * and a post really exist, writing the replies, scheduling them,
 * measuring what came back. Grok answers "what is happening"; it does not
 * write our posts and it is not asked to.
 *
 * Cost. X Search is billed per item fetched, not per call — $5 per 1k
 * posts, $10 per 1k profiles — plus tokens at grok-4.3 rates. A pulse run
 * that reads ~40 posts costs about $0.21. Two a day is roughly $13 a
 * month. The script keeps its own ledger in rapor/grok/harcama.json and
 * refuses to run once the month is over AYLIK_TAVAN, so a loop or a
 * runaway search cannot quietly spend real money.
 *
 * The key is read from XAI_API_KEY, or from .grok-anahtar at the repo
 * root. That file is gitignored and is never printed, not even partially.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");

const KOK = path.join(__dirname, "..");
const RAPOR = path.join(KOK, "rapor", "grok");
const DEFTER = path.join(RAPOR, "harcama.json");

const MODEL = "grok-4.3";
const UC = {                 // USD, read off docs.x.ai/developers/pricing
  girdi: 1.25 / 1e6,         // per input token,  grok-4.3 under 200k
  cikti: 2.50 / 1e6,         // per output token
  gonderi: 5 / 1000,         // per X post fetched
  profil: 10 / 1000,         // per X profile fetched
};
const AYLIK_TAVAN = Number(process.env.GROK_AYLIK_TAVAN || 15);

/* --- what we are, in Grok's words ------------------------------------------
 * Kept short and factual. Every number here is read off the chain
 * elsewhere in this repo; nothing aspirational goes in, because an
 * inflated self-description comes straight back as an inflated reply
 * suggestion. */
const BIZ = `
ARC PULSE (@Arcdepthoock on X, arc-depth.github.io/arc-depth/launchpad/) is a
memecoin launchpad live on Arc, chain 5042 — Circle's L1, where USDC is both
the quote asset and the gas token. What makes it different from a pump.fun
clone: every token launches on top of a collateral vault, a 2% protocol fee
and a 1-5% transfer tax feed a floor you can redeem against, and the deployed
contracts have no mint function, no owner and no pause. One token is live:
FTHM. The account is new: blue tick, 11 posts, near zero followers. Audience
we want: people who build or trade on Uniswap v4 hooks, people following Arc
and Circle, and people who care about rug mechanics and liquidity design.
`.trim();

const ORTAK_KURAL = `
Hard rules for your answer:
- Never invent a handle, a post, a URL or a follower count. If the search did
  not return it, leave the field out. A plausible-looking fabrication is worse
  than a short answer.
- Only cite posts you actually retrieved in this search.
- The handle MUST be the one in the URL's own path: x.com/<handle>/status/<id>.
  On the first run of this script one row named an account that did not own
  the post it linked to, which made the whole row worthless. Read the handle
  off the URL, do not recall it separately.
- Answer with one JSON object and nothing else. No prose before or after, no
  markdown fences.
`.trim();

/* The strategy question rotates, so the twice-daily run keeps teaching us
 * something instead of asking the same thing 60 times a month. Index is
 * the run count, so morning and evening get different questions. */
const SORULAR = [
  "How does an account with a blue tick and ~0 followers actually get its first 500 real followers in crypto X in 2026? Be concrete about what works this month, not evergreen advice.",
  "Reply guy strategy: what separates a reply that earns a follow from one that gets ignored, on technical crypto posts? Give the structural pattern and two real examples you saw this week.",
  "What should a protocol with one live token and real on-chain proofs post, as original content, to get reach without an audience yet? Formats, cadence, and what the algorithm is rewarding right now.",
  "X Ads for a crypto protocol with a small budget: is it worth it at all in 2026, what objective and targeting actually converts to followers, and what is the realistic cost per follower?",
  "Which communities, group chats, Discords, and recurring X Spaces are where Arc / Circle / Uniswap v4 hook builders actually hang out, and how does a newcomer enter them without getting muted as a shill?",
  "We publish verifiable on-chain facts as our differentiator against pump.fun clones. Is 'provable mechanics' a narrative that travels on crypto X, or does it lose to pure degen framing? What is the evidence?",
];

function anahtar() {
  const e = (process.env.XAI_API_KEY || "").trim();
  if (e) return { k: e, nereden: "XAI_API_KEY" };
  const dosya = path.join(KOK, ".grok-anahtar");
  if (fs.existsSync(dosya)) {
    const k = fs.readFileSync(dosya, "utf8").trim();
    if (k) return { k, nereden: ".grok-anahtar" };
  }
  console.error(
    "\nxAI anahtari yok.\n\n" +
    "  console.x.ai -> API Keys -> yeni anahtar, sonra iki yoldan biri:\n" +
    "    setx XAI_API_KEY xai-...\n" +
    "    ya da anahtari su dosyaya tek satir olarak yaz:\n" +
    "      " + dosya + "\n\n" +
    "  (.grok-anahtar gitignore'da; icerigi hicbir yere yazilmaz.)\n"
  );
  process.exit(2);
}

function defteriOku() {
  try { return JSON.parse(fs.readFileSync(DEFTER, "utf8")); } catch (e) { return { kosular: [] }; }
}
function buAy(d) {
  const ay = new Date().toISOString().slice(0, 7);
  return d.kosular.filter((k) => String(k.zaman).slice(0, 7) === ay)
                  .reduce((t, k) => t + (k.usd || 0), 0);
}

/* The two prompts. Both ask for JSON; the pulse one is the expensive one
 * because it is the only one that touches x_search. */
function nabizIstegi(sira) {
  const bugun = new Date();
  const dun = new Date(bugun.getTime() - 24 * 3600 * 1000);
  const g = (d) => d.toISOString().slice(0, 10);
  const yarin = new Date(bugun.getTime() + 24 * 3600 * 1000);

  return {
    model: MODEL,
    input: [{
      role: "user",
      content: [
        BIZ,
        "",
        "Search X for posts from the last 24 hours only. Topics: Uniswap v4 hooks,",
        "Arc chain / Circle's L1, USDC-denominated DeFi, launchpad and bonding-curve",
        "mechanics, rug pulls and liquidity locking, memecoin market structure.",
        "",
        "Give me the posts that are worth replying to RIGHT NOW: still getting",
        "replies, from an account with an audience that overlaps ours, and about",
        "something we can say a true, specific, non-obvious thing about. Prefer a",
        "question or a complaint we can answer over an announcement we can only",
        "congratulate. Skip giveaways, engagement-farm threads and pure price talk.",
        "",
        "Run several different searches, not one. I want 8 to 12 candidates, not",
        "two: it is cheap to give me a weak candidate I discard and expensive to",
        "miss a good one.",
        "",
        "Rank by the REACH OF THE POST, not by the follower count of the author.",
        "On the first run the top candidate had 10.6k followers and the post had",
        "21 views and no replies - replying to it would have reached nobody. Give",
        "me the post's real view, reply, repost and like counts in `etkilesim`,",
        "and drop anything under about 1000 views unless it is less than an hour",
        "old. Also fetch the author's profile so `takipci` is a real number; a",
        "profile costs a cent and saves me opening the page by hand.",
        "",
        "Then answer this strategy question: " + SORULAR[sira % SORULAR.length],
        "",
        ORTAK_KURAL,
        "",
        "JSON shape:",
        JSON.stringify({
          gonderiler: [{
            handle: "@example",
            takipci: 0,
            url: "https://x.com/example/status/...",
            saat_once: 0,
            etkilesim: "12 replies, 80 likes",
            konu: "one line: what the post actually says",
            neden: "one line: why our angle fits this specific post",
            aci: "the angle to take, not the finished reply text",
          }],
          konular: ["topics trending in this niche in the last 24h"],
          strateji: {
            soru: "the question restated",
            cevap: "your answer, concrete, 150-300 words",
            yarin_yap: ["two or three specific actions for the next 24 hours"],
          },
        }, null, 2),
      ].join("\n"),
    }],
    tools: [{
      type: "x_search",
      from_date: g(dun),
      to_date: g(yarin),
      enable_image_understanding: false,
      enable_video_understanding: false,
    }],
  };
}

/* The account list. This is what the twice-daily cadence is actually
 * suited for: who reliably gets reach in this niche changes over weeks,
 * not over hours. The post-level question it replaced was structurally
 * late - by the time a batch run named a post it was hours old and
 * thirty-five replies deep, and our reply to one such post drew exactly
 * one view. Catching a post while it is fresh is a watching problem, and
 * watching is free once we follow the right accounts. */
function hesapIstegi() {
  const bugun = new Date();
  const g = (d) => d.toISOString().slice(0, 10);
  const onbes = new Date(bugun.getTime() - 15 * 24 * 3600 * 1000);
  const yarin = new Date(bugun.getTime() + 24 * 3600 * 1000);

  return {
    model: MODEL,
    input: [{
      role: "user",
      content: [
        BIZ,
        "",
        "I need the account list, not posts. Find the X accounts whose posts in",
        "our niche RELIABLY get reach - roughly 5k+ views on a normal post, not",
        "one viral outlier. Niche: Uniswap v4 hooks, Arc chain and Circle's L1,",
        "USDC-denominated DeFi, launchpad and bonding-curve mechanics, rug and",
        "liquidity design, memecoin market structure.",
        "",
        "For each one I want the handle, the follower count (fetch the profile),",
        "what they post about, how often they post, and the typical view count",
        "you actually saw on their recent posts. Split them into two groups:",
        "accounts to follow and watch for early replies, and accounts whose",
        "posts are worth watching but who are too big for a reply to land.",
        "",
        "Give me 20 to 30 accounts. Prefer people who post original takes and",
        "answer their replies over broadcast accounts that never engage - a",
        "reply only lifts if someone engages with it.",
        "",
        ORTAK_KURAL,
        "",
        "JSON shape:",
        JSON.stringify({
          hesaplar: [{
            handle: "@example",
            takipci: 0,
            grup: "takip-et | izle",
            konu: "what they post about",
            siklik: "posts per day, roughly",
            tipik_goruntulenme: 0,
            cevap_veriyor_mu: true,
          }],
        }, null, 2),
      ].join("\n"),
    }],
    tools: [{
      type: "x_search",
      from_date: g(onbes),
      to_date: g(yarin),
      enable_image_understanding: false,
      enable_video_understanding: false,
    }],
  };
}

/* `ara` attaches the web and X search tools. Without them the model
 * answered "unsure, no data" to every question about how X distributes a
 * post today - which is the honest answer for a model asked about the
 * current month from memory, and the reason to give it search instead of
 * accepting the shrug. Web search is $5 per 1k calls, so this is cheap;
 * what makes a run expensive is X posts, at $5 per 1k fetched. */
function danismaIstegi(sira, ozel, ara) {
  const istek = {
    model: MODEL,
    input: [{
      role: "user",
      content: [
        BIZ,
        "",
        (ara ? "Search the web, and X itself, before answering: "
             : "No search. Answer from what you know: ") +
          (ozel || SORULAR[sira % SORULAR.length]),
        "",
        ara ? "Cite the source for every claim that is a fact about the platform, " +
              "and keep saying when you are unsure - a sourced 'nobody knows' beats " +
              "a confident guess." : "",
        "",
        ORTAK_KURAL,
        "",
        "JSON shape:",
        JSON.stringify({
          strateji: { soru: "", cevap: "", kaynaklar: [""], yarin_yap: [""] },
        }, null, 2),
      ].join("\n"),
    }],
  };
  if (ara) {
    istek.tools = [
      { type: "web_search" },
      { type: "x_search", enable_image_understanding: false, enable_video_understanding: false },
    ];
  }
  return istek;
}

/* The Responses API nests the text a few layers down and the convenience
 * field is not always present, so try every shape rather than assume one. */
function metniCikar(j) {
  if (typeof j.output_text === "string" && j.output_text) return j.output_text;
  const parcalar = [];
  for (const o of j.output || []) {
    for (const c of o.content || []) {
      if (typeof c.text === "string") parcalar.push(c.text);
    }
  }
  if (parcalar.length) return parcalar.join("\n");
  const m = j.choices && j.choices[0] && j.choices[0].message;
  if (m && typeof m.content === "string") return m.content;
  return "";
}

/* Models wrap JSON in fences no matter how firmly you ask them not to. */
function jsonCoz(metin) {
  let s = metin.trim();
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (f) s = f[1].trim();
  try { return JSON.parse(s); } catch (e) { /* fall through */ }
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { /* no */ } }
  return null;
}

function markdown(mod, veri, ham, maliyet) {
  const L = [];
  L.push("# Grok " + mod + " — " + new Date().toISOString().replace("T", " ").slice(0, 16));
  L.push("");
  L.push("Model `" + MODEL + "`. Bu kosu: **$" + maliyet.usd.toFixed(3) + "** " +
         "(" + maliyet.gonderi + " gonderi, " + maliyet.profil + " profil, " +
         maliyet.girdi + "/" + maliyet.cikti + " token).");
  L.push("");
  if (!veri) {
    L.push("JSON cozulemedi. Ham cevap:"); L.push(""); L.push("```"); L.push(ham); L.push("```");
    return L.join("\n");
  }
  const h = veri.hesaplar || [];
  if (h.length) {
    L.push("## Hesaplar (" + h.length + ")");
    L.push("");
    L.push("| hesap | takipci | grup | tipik goruntulenme | siklik | cevap veriyor | konu |");
    L.push("|-------|---------|------|--------------------|--------|---------------|------|");
    h.forEach((a) => {
      L.push("| " + (a.handle || "?") + " | " + (a.takipci ?? "?") + " | " + (a.grup || "?") +
             " | " + (a.tipik_goruntulenme ?? "?") + " | " + (a.siklik || "?") +
             " | " + (a.cevap_veriyor_mu === true ? "evet" : a.cevap_veriyor_mu === false ? "hayir" : "?") +
             " | " + String(a.konu || "").replace(/\|/g, "/") + " |");
    });
    L.push("");
    L.push("> Takip etmeden once her hesap elle acilip gercekten var mi ve");
    L.push("> gercekten o isi mi yapiyor diye bakilacak.");
    L.push("");
  }
  const g = veri.gonderiler || [];
  if (g.length) {
    L.push("## Simdi cevap verilebilecek gonderiler (" + g.length + ")");
    L.push("");
    L.push("| # | hesap | takipci | saat | konu | aci | link |");
    L.push("|---|-------|---------|------|------|-----|------|");
    g.forEach((p, i) => {
      L.push("| " + (i + 1) + " | " + (p.handle || "?") + " | " + (p.takipci ?? "?") + " | " +
             (p.saat_once ?? "?") + "s | " + String(p.konu || "").replace(/\|/g, "/") + " | " +
             String(p.aci || "").replace(/\|/g, "/") + " | " + (p.url || "-") + " |");
    });
    L.push("");
    L.push("> Bunlarin hicbiri dogrulanmadi. Her satir gonderilmeden once elle");
    L.push("> acilip gercekten var mi, gercekten taze mi diye bakilacak.");
    L.push("");
  }
  if (veri.konular && veri.konular.length) {
    L.push("## Son 24 saatin konulari");
    L.push("");
    veri.konular.forEach((k) => L.push("- " + k));
    L.push("");
  }
  const s = veri.strateji;
  if (s) {
    L.push("## Strateji — " + (s.soru || ""));
    L.push("");
    L.push(s.cevap || "");
    L.push("");
    if (s.kaynaklar && s.kaynaklar.length) {
      L.push("**Kaynaklar:**");
      s.kaynaklar.forEach((k) => L.push("- " + k));
      L.push("");
    }
    if (s.yarin_yap && s.yarin_yap.length) {
      L.push("**Onumuzdeki 24 saatte:**");
      s.yarin_yap.forEach((y) => L.push("- [ ] " + y));
      L.push("");
    }
  }
  return L.join("\n");
}

async function main() {
  const arg = process.argv.slice(2);
  const kuru = arg.includes("--kuru");
  const mod = arg.includes("danisma") ? "danisma"
            : arg.includes("hesaplar") ? "hesaplar" : "nabiz";

  fs.mkdirSync(RAPOR, { recursive: true });
  const defter = defteriOku();
  const harcanan = buAy(defter);
  // The question normally rotates with the run count, so the scheduled
  // runs work through the list by themselves. --soru N picks one, for
  // when a particular question has been asked and is waiting on an answer.
  const secilen = arg.indexOf("--soru");
  const sira = secilen >= 0 ? Number(arg[secilen + 1]) : defter.kosular.length;

  const istek = mod === "nabiz" ? nabizIstegi(sira)
              : mod === "hesaplar" ? hesapIstegi()
              : danismaIstegi(sira, (() => {
                  const i = arg.indexOf("--metin");
                  return i >= 0 ? arg[i + 1] : null;
                })(), arg.includes("--ara"));

  if (kuru) {
    console.log("mod        : " + mod);
    console.log("model      : " + MODEL);
    console.log("bu ay      : $" + harcanan.toFixed(2) + " / $" + AYLIK_TAVAN.toFixed(2));
    console.log("soru       : " + SORULAR[sira % SORULAR.length]);
    console.log("\n--- istek ---\n" + JSON.stringify(istek, null, 2));
    return;
  }

  if (harcanan >= AYLIK_TAVAN) {
    console.error("TAVAN: bu ay $" + harcanan.toFixed(2) + " harcandi, tavan $" +
                  AYLIK_TAVAN.toFixed(2) + ". Calistirmadim.");
    console.error("Tavani bilerek yukseltmek icin: GROK_AYLIK_TAVAN=25 node scripts/grok-nabiz.js");
    process.exit(3);
  }

  const { k, nereden } = anahtar();
  console.log("mod " + mod + " · model " + MODEL + " · anahtar " + nereden +
              " · bu ay $" + harcanan.toFixed(2) + "/$" + AYLIK_TAVAN.toFixed(2));

  const t0 = Date.now();
  const r = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + k },
    body: JSON.stringify(istek),
  });
  const govde = await r.text();
  if (!r.ok) {
    console.error("HTTP " + r.status + ": " + govde.slice(0, 600));
    process.exit(1);
  }
  const j = JSON.parse(govde);

  const u = j.usage || {};
  const t = u.server_side_tool_usage_details || {};
  const maliyet = {
    girdi: u.input_tokens ?? u.prompt_tokens ?? 0,
    cikti: u.output_tokens ?? u.completion_tokens ?? 0,
    gonderi: t.x_posts_fetched || 0,
    profil: t.x_users_fetched || 0,
  };
  maliyet.usd = maliyet.girdi * UC.girdi + maliyet.cikti * UC.cikti +
                maliyet.gonderi * UC.gonderi + maliyet.profil * UC.profil;

  const ham = metniCikar(j);
  const veri = jsonCoz(ham);

  const damga = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const ad = mod + "-" + damga;
  fs.writeFileSync(path.join(RAPOR, ad + ".json"),
    JSON.stringify({ zaman: new Date().toISOString(), mod, model: MODEL, maliyet, veri, ham }, null, 2));
  const md = path.join(RAPOR, ad + ".md");
  fs.writeFileSync(md, markdown(mod, veri, ham, maliyet));

  defter.kosular.push({ zaman: new Date().toISOString(), mod, usd: maliyet.usd, ...maliyet });
  fs.writeFileSync(DEFTER, JSON.stringify(defter, null, 2));

  console.log("sure " + ((Date.now() - t0) / 1000).toFixed(1) + "s · " +
              maliyet.gonderi + " gonderi, " + maliyet.profil + " profil · " +
              "$" + maliyet.usd.toFixed(3) + " · bu ay $" + (harcanan + maliyet.usd).toFixed(2));
  if (veri && veri.gonderiler) console.log("aday gonderi: " + veri.gonderiler.length);
  if (!veri) console.log("UYARI: JSON cozulemedi, ham cevap dosyaya yazildi.");
  console.log(md);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
