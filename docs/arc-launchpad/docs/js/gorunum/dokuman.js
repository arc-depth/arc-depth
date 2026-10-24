/* ===========================================================================
 * gorunum/dokuman.js — how the second generation works, with its numbers
 *
 * Rewritten 20 Oct 2026 for the one-pool design (MerkezKapi, PulseLaunchpad5
 * with the ladder without end, the basket on twelve chains). Every number
 * here comes from the contracts' constants or from docs/js/egri.js, which
 * computes the pool exactly as the contract lays it out (checked against
 * forge on a real Uniswap v4 PoolManager: scripts/denetim-egri.mjs). What is
 * not built yet is said so, in its own section.
 * =========================================================================== */

import { el, sayfaUst, panel, not } from "../ui.js";
import * as egri from "../egri.js";

const yuzde = (x, n = 1) => (x * 100).toFixed(n) + "%";
const usd = (x) => "$" + (x >= 1000 ? Math.round(x).toLocaleString("en-US") : x.toFixed(2));

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst("Documentation", "Exactly what the system does — the second generation"));

  /* ---- 1. one pool, twelve chains ------------------------------------ */
  kap.append(panel("1 — One pool, twelve chains", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi: "Every token has ONE pool, on Arc (Uniswap v4). Every buy and sell, from whichever chain, is made in that pool, " +
        "so the price is the same everywhere by construction — there is no second market to keep in line and no price messages." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "On the other eleven chains the token exists as its twin: the real token locked on Arc " +
        "(the EVM twins in their Arc adapter, the Solana / Sui / Aptos twins in the twin hub) and the same amount minted there. " +
        "Supply is fixed at 1,000,000,000; there is no mint function, only burn. Twins are moved by LayerZero, dollars by Circle " +
        "(CCTP with forwarding) or relay.link; nothing waits on a machine of ours." }),
    ]),
  ]));

  /* ---- 2. launching ------------------------------------------------- */
  const s0 = egri.durum({ fiyat: egri.ACILIS, kurucuToken: 28e6, teklif: 98, vergi: 0.02 });
  kap.append(panel("2 — Launching: what you pay", [
    tablo(["Item", "Amount"], [
      ["First buy (your tokens, at the opening price)", "$100 – $500"],
      ["— launch fee", "2%: 30% developer fund, 50% the pool's depth, 20% the DAO-controlled fund"],
      ["— at $100: your tokens", "28,000,000 (2.8% of supply)"],
      ["— your net dollars become the pool's bid", "below the opening price, down to −60%"],
      ["Collateral basket", "1 to 5 tokens on any of the 12 chains, at least $4 a line, $20 in total"],
      ["Twins", "you choose the chains; each costs its real LayerZero fee"],
      ["Your tokens to your chain", "its real LayerZero fee"],
      ["Bridge (if you pay from another chain)", "relay.link's fee, shown in its quote"],
    ]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "Before you pay, the page shows the bill item by item with fees read live and a 10% margin on the LayerZero fees; " +
      "what is not used comes back to your address on Arc. Measured 20 Oct: a $100 + $20 launch with twins on the 8 EVM chains, " +
      "paid from Robinhood, Base, BNB or Arbitrum, came to about $125. Solana, Sui and Aptos twins cost more to create " +
      "(about $9, $4.8 and $1.7), so by default the first holder who moves the token there creates them." }),
  ]));

  /* ---- 3. the pool -------------------------------------------------- */
  /* price impact before fees (vergi = -UCRET cancels the fee in egri's formulas) */
  const satir = [5_000, 20_000, 100_000, 1_000_000].map((pd) => {
    const s = egri.durum({ fiyat: pd / egri.ARZ, kurucuToken: 28e6, teklif: 98, vergi: -egri.UCRET });
    const sat = (d) => egri.satim(s, d / s.fiyat).etki, al = (d) => egri.alim(s, d).etki;
    return [usd(pd), yuzde(sat(100), 2), yuzde(sat(1000), 2), "+" + yuzde(al(100), 2), "+" + yuzde(al(1000), 2)];
  });
  kap.append(panel("3 — The pool: a curve without end", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi: "The 972 million tokens not bought by the founder sit in the pool from the opening price up to the last price " +
        "Uniswap v4 can express. The token never runs out; the price follows x·y=k with a virtual dollar reserve of " +
        usd(egri.ozet(s0).token * egri.ACILIS) + " (ladder tokens × opening price)." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "A sale is paid from the real dollars in the pool: buyers' net dollars plus the founder's " +
        "bid. Nothing is paid that is not there, so the pool never owes. Whoever sells first gets the better price." }),
    ]),
    tablo(["Market cap", "$100 sale", "$1,000 sale", "$100 buy", "$1,000 buy"], satir),
    not("Price impact before fees, from the contract's own layout (scripts/denetim-egri.mjs reproduces forge to 0.01%). " +
      "The page shows your trade's impact, the amount and the fees before you sign, with a 3% slippage limit by default.", "bilgi"),
    not("If every holder sells: the price walks back to the opening price, then the founder's bid pays down to −60% of it, and below " +
      "that the pool has nothing left to buy with. That is not a guaranteed value; what each token can always claim is its share " +
      "of the basket (section 5).", "uyari"),
  ]));

  /* ---- 4. fees -------------------------------------------------------- */
  kap.append(panel("4 — Every trade", [
    tablo(["Goes to", "Share"], [
      ["the token's founder", "0.30%"], ["developer fund", "0.30%"], ["protocol liquidity", "0.50%"], ["operations (to the DAO-controlled developer fund)", "0.20%"],
      ["FTHM bought and burned", "0.20%"], ["back into the pool (depth)", "0.70%"], ["the token's basket (collateral tax)", "1% – 5%, set at launch (1% if not chosen)"],
    ]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:12px" }, yazi:
      "Anti-snipe: a buy in the launch's first second pays 99%, then a quarter of that each second, nothing from the fifth; it goes back " +
      "into the pool. Whale shield: sales in one block above 0.5% of the circulating supply pay the excess (at most 3% more), into the basket. The founder's slice collects on Arc and anyone can " +
      "send it on to the founder's chain (Buy, sell, redeem → founder's trading income)." }),
    not("Every trade through the gate also does the upkeep itself: the depth slice, the snipe tax and the 0.5% liquidity slice become " +
      "locked liquidity in that token's own pool, the FTHM slice is auctioned and the auction filled from FTHM's pool (the FTHM burned), " +
      "and a founder paid on Arc receives their slice — in the same transaction, nobody has to press anything. A founder on another chain " +
      "sends their income on with one click (Circle's delivery fee needs a fresh quote). There is no 'drawdown defence': an earlier hook " +
      "set a flag 60% below the peak that nothing used; v7 removed it.", "bilgi"),
  ]));

  /* ---- 5. the basket -------------------------------------------------- */
  kap.append(panel("5 — The collateral basket", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi: "Each line's dollars wait as USDC in the Defter on Arc. Every trade's collateral tax is split across the lines " +
        "by their weight; when a line reaches $50 its asset is bought on its own chain and held in that chain's vault, for this token only." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "Every vault buys the asset itself from a pool on its own chain: Uniswap v4 on Arc, " +
        "Uniswap v3 on Base, Arbitrum, Ethereum, Avalanche, Monad and Robinhood, HyperSwap v3 on HyperEVM and PancakeSwap v3 on BNB (within ~3% " +
        "of the pool's 30-minute average price), Raydium on Solana (the pool's own average), and Cetus on Sui, Hyperion on Aptos and the Arc " +
        "pools (within ~3% of a slowly moving reference price). The launch form refuses a token that has no such pool. If the price is " +
        "outside the bound the dollars wait as USDC and anyone may retry later for a $0.05 tip. At most two lines go to their vaults per " +
        "trade; the rest go with the next trades, so nothing ever waits for a person." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "Redeeming burns tokens and pays (amount ÷ supply) of everything in the basket: the " +
        "waiting dollars at once; each vault that holds something sells your share and pays you (or hands you the asset itself if it " +
        "cannot sell). You pay the messaging fee of those orders in the same transaction, shown before you sign; an order that cannot " +
        "go now waits in a queue and anyone may send it later for a $0.05 tip. Redemption never fails because a distant chain is slow." }),
    ]),
    not("Every trade's collateral tax reaches the basket in the same transaction; nobody has to push it.", "bilgi"),
  ]));

  /* ---- 6. twins on Solana, Sui, Aptos -------------------------------- */
  kap.append(panel("6 — Solana, Sui and Aptos", [
    el("div", { sinif: "ikincil", yazi:
      "Tokens held on Arc can be moved to Solana, Sui or Aptos (Buy, sell, redeem → Move from Arc). If the token has no twin there yet, " +
      "the mover creates it in the same flow. On Sui every coin is its own type: once per token anyone publishes it from the twin template " +
      "(four approvals in a Sui wallet); until then transfers to Sui wait there, safe. Moving costs, measured 20 Oct: Solana ~$1.2, " +
      "Aptos ~$1.7, Sui ~$4.8 (it goes through Base)." }),
  ]));

  /* ---- 7. not yet ------------------------------------------------------ */
  kap.append(panel("7 — Known limits (stated plainly)", [
    tablo(["What", "Today"], [
      ["Price protection on Arc, Sui and Aptos vaults", "their pools have no readable 30-minute average; the vault keeps its own slowly moving reference (about 1% a minute) and trades only within about 3% of it, so a sandwich can cost at most about 3% on those chains. EVM chains with Uniswap v3 / PancakeSwap use the pool's 30-minute average."],
      ["Independent audit", "none yet. Every contract is open source and Sourcify-verified, the tests are public, and a disclosure and bounty policy is below (section 9)."],
      ["GENESIS's open model", "small (0.5B). It answers only from on-chain memory records and says \"Not in GENESIS memory\" when none matches; when its wording adds what the records do not say, the page shows the records instead."],
      ["Older contract sets (v2, v4, v5, v6)", "still on chain; they hold no live launch except the PTEST2 test token. The lock closes their admin keys together with v7."],
      ["PTEST2", "a test token from the joint test of 22 Oct 2026; not a project, do not buy it."],
      ["Wallet signatures", "simulated on mainnet state for every flow; the first real launches are the live test. Until the lock, a bug can still be fixed."],
      ["Something stuck (a basket line, a queued redemption, a LayerZero message, a vault buy)", "GENESIS → Diagnose a launch reads it from the chains and offers the fix; anyone can send it from their own wallet and takes the tip where there is one."],
    ]),
  ]));
  kap.append(panel("8 — Privacy", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi: "No accounts, no cookies, no analytics, no trackers, and no server of ours. This page is static files; " +
        "it keeps nothing about you anywhere, and we cannot see who visits or who connects a wallet." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "What is public by nature: blockchain transactions. Any address that trades, " +
        "launches or redeems is visible on-chain to everyone, as on every public blockchain. We add nothing to that." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "Who your browser talks to, and when (the page's security policy refuses anything else):" }),
    ]),
    tablo(["Service", "When", "What it sees"], [
      ["Chain RPC providers (Arc, Base, …; publicnode, drpc, the chains' own)", "reading prices, pools, your balances; sending your signed transaction", "your IP and the addresses in the read or transaction"],
      ["relay.link", "only when you ask for a cross-chain quote or payment", "your address and the amount (it needs them to route)"],
      ["Circle (iris-api)", "fees and attestations of USDC transfers", "the transfer, not you"],
      ["DexScreener", "token prices", "no user data"],
      ["WalletConnect relay (Reown)", "only if you choose WalletConnect", "end-to-end encrypted messages; telemetry and analytics are switched off"],
      ["GitHub Pages", "serving these files", "standard web-server logs kept by GitHub; we have no access to them"],
    ]),
    el("div", { sinif: "ikincil", attr: { style: "margin-top:10px" }, yazi:
      "In this browser the page keeps one flag (whether WalletConnect was used); the WalletConnect library keeps its session keys. " +
      "\"Disconnect and forget this device\" in the wallet dialog wipes both. An extension wallet's permission is revoked in the wallet itself." }),
  ]));
  /* ---- 9. security --------------------------------------------------- */
  kap.append(panel("9 — Security: reporting a vulnerability, and the bounty", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi: "In scope: the live v7 contracts on all twelve chains (the Security page lists every address with its Sourcify-verified source), the site at arcpulse.app and GENESIS's diagnosis code. " +
        "Out of scope: third parties we depend on (Circle CCTP, LayerZero, relay.link, Uniswap, Raydium, Cetus, Hyperion, wallets), the older sets v2–v6 except where they still hold funds, price movements, and anything that needs a stolen key." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "Report privately: GitHub → arc-depth/arc-depth → Security → Report a vulnerability (private advisory), or a direct message to @Arcdepthoock on X. " +
        "Please do not open a public issue or exploit it on mainnet beyond what proves it. We answer within 72 hours and publish the fix and the report after it is safe." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "Reward: there is no company and no treasury of ours. Bounties are paid from the DAO-controlled developer fund by a DAO proposal; the amount is decided by that vote, " +
        "guided by severity (funds at risk, how many launches, whether it can be undone). We will write the proposal for a valid report; we cannot promise its outcome." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "Safe harbour: research done in good faith, within this scope, without harming users or keeping funds, will not be pursued by us. No third-party audit has been done yet." }),
    ]),
  ]));

  /* ---- 10. run it yourself ------------------------------------------- */
  const ipfs = await fetch("veri/ipfs-cid.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  kap.append(panel("10 — Run it yourself (IPFS)", [
    el("div", { sinif: "ikincil" }, [
      el("p", { yazi: "The site is static files. Nothing here needs our server or our computer: the same files are published on IPFS under a content address, so anyone can serve or pin them, and any gateway shows the same bytes." }),
      ipfs && ipfs.cid
        ? el("p", { attr: { style: "margin-top:10px" }, sinif: "mono", yazi: "Site CID (v1): " + ipfs.cid + (ipfs.tarih ? "  ·  " + ipfs.tarih : "") })
        : el("p", { attr: { style: "margin-top:10px" }, yazi: "You are reading the IPFS copy, or the CID file could not be read; the CID is also written on chain in GENESIS memory." }),
      el("p", { attr: { style: "margin-top:10px" }, yazi: "Verify it: clone github.com/arc-depth/arc-depth, take docs/arc-launchpad/docs without the model folder and veri/ipfs-cid.json, and run `ipfs add -r --cid-version=1 --only-hash` on it: the root must equal the CID above. " +
        "Open it at any gateway as <gateway>/ipfs/<CID>/app.html. The open model (483 MB) is a separate IPFS folder, also recorded on chain with its sha256." }),
    ]),
  ]));

  return kap;
}

function tablo(basliklar, satirlar) {
  const t = el("table", { sinif: "tablo tablo--kart" });
  t.append(el("thead", {}, [el("tr", {}, basliklar.map((b) => el("th", { yazi: b })))]));
  const g = el("tbody");
  for (const s of satirlar) {
    g.append(el("tr", {}, s.map((h, i) => el("td", { sinif: i > 0 ? "sayi" : "", attr: { "data-et": basliklar[i] }, yazi: h }))));
  }
  t.append(g);
  return el("div", { sinif: "tablo-sarmal" }, [t]);
}
