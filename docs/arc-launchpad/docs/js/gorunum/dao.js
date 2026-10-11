/* ===========================================================================
 * gorunum/dao.js — the Platform DAO
 *
 * WHY THIS SCREEN IS REAL
 *   The spec is explicit: *"Do not build a decorative DAO screen. Build
 *   real voting and a real proposal mechanism."* This screen shows no
 *   invented governance — it reads the Governor that is LIVE on chain.
 *   Every number is an `eth_call`, every button a transaction.
 *
 *   The rest of the platform shows an empty state because it is not
 *   deployed; the DAO is deployed and has never been used.
 *   `proposalCount()` is zero and the screen says so as it is, not as an
 *   error: the mechanism exists, nobody has proposed anything yet.
 *
 * WHAT THE DAO CAN TOUCH IS NOT A DESIGN QUESTION BUT A MEASUREMENT
 *   `yol.js` said for a while that "the DAO's set of powers has not been
 *   answered yet", and it was right. The answer was given by measurement:
 *   `scripts/denetim-dao-erisimi.js` reads the collateral vaults, the
 *   ledger, the fee table, the curve and the locked liquidity one by one
 *   and asserts that in none of them is there an authorised role or a
 *   setter. So the constraint does not rest on the DAO behaving politely
 *   but on there being no lever to pull on the other side.
 *
 *   Putting a whitelist in the Governor would look more impressive and be
 *   weaker: that list is mutable state, and the proposal that changes it
 *   is also a proposal.
 *
 * THE DURATIONS ARE SECONDS
 *   `Governor.state()` compares against `block.timestamp`, and `end` is
 *   `block.timestamp + VOTING_PERIOD`. Mistaking these for block counts
 *   and converting with Arc's measured 0.507 s/block showed 5 days as 2.54
 *   — once. Here they are read as seconds.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres, hata } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { YONETISIM, DAO_YETKI } from "../adresler.js";
import { jetonMiktar, tamSayidanSayi, gecenSure } from "../bicim.js";

/* bicim.js `yuzde` prefixes a plus sign, which is right for a change and
   wrong for a parameter: a quorum of "+10.00%" reads as a quorum that
   went up. These are settings, so they are formatted plainly. */
const oran = (bps) => (Number(bps) / 100).toFixed(2) + "%";

/* Governor.State, in order. A number nobody can read is a number that
   invites a guess. */
const DURUM = [
  { ad: "Oylamada", sinif: "etiket--aktif" },
  { ad: "Reddedildi", sinif: "etiket--red" },
  { ad: "Kabul edildi", sinif: "etiket--kabul" },
  { ad: "Kuyrukta", sinif: "etiket--bekle" },
  { ad: "Uygulanabilir", sinif: "etiket--kabul" },
  { ad: "Executed", sinif: "etiket--bitti" },
  { ad: "Expired", sinif: "etiket--red" },
  { ad: "Cancelled", sinif: "etiket--red" }
];

function sureYaz(saniye) {
  const s = Number(saniye);
  if (!isFinite(s) || s <= 0) return "—";
  if (s % 86400 === 0) return s / 86400 + " days";
  if (s >= 86400) return (s / 86400).toFixed(2) + " days";
  if (s >= 3600) return (s / 3600).toFixed(1) + " saat";
  return s + " sn";
}

/* ---- the live parameters, read in one batch -------------------------- */

async function parametreler() {
  const g = YONETISIM.governor;
  /* MIN_OY_GUCU AND staking() ARE NOT ON THIS GOVERNOR
       Both were read from the Governor here. On DepthGovernor the floor
       lives on the Stake and the getter is stake(), so these two calls
       returned nothing and the screen would have printed "—" for a
       number that exists one contract over. */
  const adlar = [
    "proposalCount", "PROPOSAL_THRESHOLD_BPS", "QUORUM_BPS",
    "VOTING_PERIOD", "TIMELOCK", "GRACE_PERIOD",
    "guardianActive", "guardianExpiry", "guardian", "stake"
  ];
  const sonuclar = await cokluCagri(adlar.map((ad) => ({
    method: "eth_call",
    params: [{ to: g, data: cagriVerisi(ABI.governor, ad) }, "latest"]
  })));

  /* The proposal floor, from the contract that actually holds it. */
  const taban = await cokluCagri([{
    method: "eth_call",
    params: [{ to: YONETISIM.staking,
      data: cagriVerisi(ABI.staking, "MIN_OY_GUCU") }, "latest"]
  }]);

  /* sonucCoz returns the whole decode Result. `oku()` unwraps a single
     value before handing it back; a raw sonucCoz does not, so Number()
     on a one-element Result is NaN and every parameter would render as
     an em dash. Unwrapped here, once. */
  const cikti = {};
  adlar.forEach((ad, i) => {
    const r = sonuclar[i];
    const c = r == null ? null : sonucCoz(ABI.governor, ad, r);
    cikti[ad] = c && c.length === 1 ? c[0] : c;
  });
  const t = taban[0] == null
    ? null : sonucCoz(ABI.staking, "MIN_OY_GUCU", taban[0]);
  cikti.MIN_OY_GUCU = t && t.length === 1 ? t[0] : t;
  return cikti;
}

/* The concentration line, as a function so the wording lives in one
   place and cannot drift between the empty and the active case. */
function gucVgovde(kap, kurucuPay, yuzde, toplam) {
  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Kurucuda stake", jetonMiktar(kurucuPay) + " FTHM",
      "the floor that made activation possible"),
    olcum("Share of voting power", yuzde.toFixed(1) + "%",
      "the part held by one address")
  ]));
  if (yuzde > 50) {
    kap.append(not(
      yuzde.toFixed(1) + "% of the voting power sits at one address. As it " +
      "stands this is a one-address DAO: that address alone clears both " +
      "the proposal threshold and the quorum. What slows a decision down " +
      "is not the spread of votes but five days of voting, a two-day " +
      "timelock, and a guardian that can only CANCEL, until 2027. The " +
      "DAO's only power is paying out of the developer pool; collateral, " +
      "locked liquidity, fees and the opening price are out of reach.",
      "uyari"
    ));
  } else {
    kap.append(not(
      yuzde.toFixed(1) + "% of the voting power is the founder's, the rest " +
      "is at other addresses. That share erodes as more is staked.",
      "bilgi"
    ));
  }
}

/* ---- the screen ------------------------------------------------------ */

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  kap.append(sayfaUst(
    "Platform DAO",
    "Live on-chain governance — propose, vote, timelock, execute"
  ));

  let p;
  try {
    p = await parametreler();
  } catch (e) {
    kap.append(hata(
      "Governance could not be read",
      "The governor is at " + YONETISIM.governor + " and did not " +
      "answer: " + e.message
    ));
    return kap;
  }

  if (p.proposalCount == null) {
    kap.append(hata(
      "Governance is not answering",
      "The governor is at " + YONETISIM.governor + " but `proposalCount()` " +
      "did not answer. The screen stops here rather than inventing a state."
    ));
    return kap;
  }

  /* ---- 1. what this DAO actually is ------------------------------- */

  const sayi = Number(p.proposalCount);

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Proposal threshold", oran(p.PROPOSAL_THRESHOLD_BPS), "of the staked supply"),
    olcum("Quorum", oran(p.QUORUM_BPS), "against the stake when the proposal opened"),
    olcum("Voting period", sureYaz(p.VOTING_PERIOD), "seconds, not blocks"),
    olcum("Timelock", sureYaz(p.TIMELOCK), "kabulden uygulamaya"),
    olcum("Execution window", sureYaz(p.GRACE_PERIOD), "after which it expires"),
    /* FTHM, not ALP. Governance moved; a screen still saying ALP would
       be naming a token that no longer decides anything. */
    olcum("Minimum voting power", p.MIN_OY_GUCU == null
      ? "unreadable"
      : jetonMiktar(tamSayidanSayi(p.MIN_OY_GUCU, 18)) + " FTHM",
      "needed in order to propose")
  ]));

  kap.append(not(
    "This DAO is live on chain and has taken " + sayi + " proposals. " +
    (sayi === 0
      ? "Zero is not a fault: the mechanism is in place, nobody has " +
        "teklif vermedi."
      : ""),
    sayi === 0 ? "bilgi" : ""
  ));

  /* ---- 2. the guardian, named rather than hidden ------------------- */

  if (p.guardianActive === true) {
    const bitis = Number(p.guardianExpiry) * 1000;
    kap.append(panel("Guardian", el("div", { sinif: "yigin yigin--sik" }, [
      el("p", {
        sinif: "yazi yazi--sessiz",
        yazi: "The guardian can CANCEL a proposal and nothing else: it " +
          "cannot propose, it carries no voting weight, it cannot pass " +
          "anything and it cannot move money. Its power points one way " +
          "and it expires."
      }),
      el("div", { sinif: "izgara izgara--olcum" }, [
        olcum("Address", adres(p.guardian), "cancel authority"),
        olcum("Expires", new Date(bitis).toISOString().slice(0, 10),
          bitis > Date.now()
            ? gecenSure(bitis - Date.now()) + " left"
            : "already expired"),
        olcum("State", bitis > Date.now() ? "Active" : "Ended",
          "can be given up early with renounce()")
      ])
    ])));
  }

  /* ---- 3. voting power, which is staked and not held --------------- */

  let stakeToplam = null;
  try {
    stakeToplam = await oku(YONETISIM.staking, ABI.staking, "totalStaked");
  } catch (e) { /* reported below */ }

  const gucGovde = el("div", { sinif: "yigin yigin--sik" });
  gucGovde.append(el("p", {
    sinif: "yazi yazi--sessiz",
    yazi: "Voting power comes from STAKING FTHM, not from holding it, and " +
      "the total is snapshotted when a proposal opens. So the quorum is " +
      "measured against the stake that existed at that moment — not " +
      "against a total that can be inflated mid-vote."
  }));
  /* HOW MUCH OF THE VOTING POWER IS IN ONE PLACE
       The total alone can read as healthy when it is one wallet. The set
       of stakers cannot be enumerated from a getter, but the founder
       allocation can be looked up directly, and that is the share that
       decides whether this is a DAO or one address with a five day delay.

       Activation is deliberately the floor — 50.000 FTHM of a 50.066.437
       balance — so this number starts honest and falls as others stake.
       Printing the total without it would have been the comfortable
       version of the same data. */
  let kurucuStake = null;
  try {
    kurucuStake = await oku(YONETISIM.staking, ABI.staking,
      "stakedOf", [YONETISIM.kurucu]);
  } catch (e) { kurucuStake = null; }

  if (stakeToplam == null) {
    gucGovde.append(not("The stake contract could not be read: " + YONETISIM.staking, "uyari"));
  } else {
    const t = tamSayidanSayi(stakeToplam, 18);
    /* The floor comes from a second contract now, so it can be missing
       on its own. Treating a failed read as zero would quietly lower the
       threshold on screen. */
    const asgari = p.MIN_OY_GUCU == null
      ? null : tamSayidanSayi(p.MIN_OY_GUCU, 18);
    const esik = asgari == null
      ? null : Math.max(t * Number(p.PROPOSAL_THRESHOLD_BPS) / 10_000, asgari);
    gucGovde.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Total staked", jetonMiktar(t) + " FTHM", "all of the voting power"),
      olcum("Quorum threshold",
        jetonMiktar(t * Number(p.QUORUM_BPS) / 10_000) + " FTHM",
        "the FOR votes a proposal needs to pass"),
      olcum("Proposal threshold", esik == null ? "unreadable" : jetonMiktar(esik) + " FTHM",
        "the greater of the stake share and the floor")
    ]));

    /* THE STATE NOBODY WOULD GUESS FROM THE PARAMETERS.

       Measured on chain: totalStaked is 0. So every address has zero
       voting power, and MIN_OY_GUCU is a floor nobody
       clears. The DAO is deployed, answering, and cannot be used by
       anyone until somebody stakes.

       That floor is also what stops a zero-stake takeover: with nothing
       staked the percentage threshold resolves to zero and the quorum
       does too, so a single wei of stake would otherwise be able to
       propose AND pass. The absolute minimum is what makes the empty
       state safe rather than wide open.

       Saying this plainly rather than rendering a proposal form that
       cannot succeed: the brief forbids presenting a feature that does
       not work as a live control. */
    if (t > 0 && kurucuStake != null) {
      const k = tamSayidanSayi(kurucuStake, 18);
      const pay = t > 0 ? (k / t) * 100 : 0;
      gucVgovde(gucGovde, k, pay, t);
    }

    if (t === 0 && asgari != null) {
      gucGovde.append(not(
        "No FTHM is staked, so nobody has voting power right now and " +
        "nobody can propose: the floor is " + jetonMiktar(asgari) +
        " FTHM and everyone is at zero. The DAO is deployed and " +
        "answering; what is missing is stake.",
        "uyari"
      ));
      gucGovde.append(not(
        "That floor is also what keeps the empty state safe: with nothing " +
        "staked both the percentage threshold and the quorum collapse to " +
        "zero, so without an absolute minimum a single wei of stake could " +
        "both propose and pass.",
        "bilgi"
      ));
    }
  }
  kap.append(panel("Voting power", gucGovde));

  /* ---- 4. the permitted set, as measured --------------------------- */

  const yetkiGovde = el("div", { sinif: "yigin yigin--sik" });
  yetkiGovde.append(el("p", {
    sinif: "yazi yazi--sessiz",
    yazi: "The governor's proposal signature is propose(string, address, " +
      "bytes), so a proposal can EXPRESS any call to any address. What " +
      "holds it is not a list inside the governor but the absence of a " +
      "lever in the target contracts. Being expressible is not the same " +
      "as being valid: a call without authority reverts."
  }));

  const iki = el("div", { sinif: "izgara izgara--iki" });

  const yapabilir = el("ul", { sinif: "liste liste--isaretli" });
  for (const x of DAO_YETKI.yapabilir) {
    yapabilir.append(el("li", {}, [
      el("strong", { yazi: x.ne }),
      el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + x.nerede })
    ]));
  }
  iki.append(panel("Karar verebilir", yapabilir));

  const yapamaz = el("ul", { sinif: "liste liste--capraz" });
  for (const x of DAO_YETKI.yapamaz) {
    yapamaz.append(el("li", {}, [
      el("strong", { yazi: x.ne }),
      el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + x.neden })
    ]));
  }
  iki.append(panel("Dokunamaz", yapamaz));
  yetkiGovde.append(iki);

  yetkiGovde.append(not(
    "This split is not a policy but a measurement: " +
    "scripts/denetim-dao-erisimi.js reads those contracts one by one and " +
    "asserts that none of them has a privileged role or a setter. If " +
    "somebody adds a setter to a vault, that audit goes red.",
    "bilgi"
  ));

  /* The residual risk inside the permitted set. Stated, not buried. */
  yetkiGovde.append(not(DAO_YETKI.artikRisk, "uyari"));

  kap.append(panel("DAO neye karar verebilir", yetkiGovde));

  /* ---- 5. the proposals themselves -------------------------------- */

  if (sayi === 0) {
    kap.append(panel("Teklifler", bos(
      "No proposals yet",
      "The governor has recorded " + sayi + " proposals. To propose and " +
      "to vote, go to the Proposals and voting screen — every button " +
      "there sends a real transaction.",
      el("a", {
        sinif: "dugme dugme--marka",
        attr: { href: "#/teklifler" },
        yazi: "Proposals and voting"
      })
    )));
    return kap;
  }

  /* Newest first, and at most the last ten here — the full list and the
     voting controls live on the proposals screen. */
  const basla = Math.max(1, sayi - 9);
  const idler = [];
  for (let i = sayi; i >= basla; i--) idler.push(i);

  const ham = await cokluCagri(idler.flatMap((id) => ([
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "proposals", [id]) }, "latest"] },
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "state", [id]) }, "latest"] },
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "forVotesOf", [id]) }, "latest"] },
    { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "againstVotesOf", [id]) }, "latest"] }
  ])));
  const tek = (ad, r) => {
    if (r == null) return null;
    const c = sonucCoz(ABI.governor, ad, r);
    return c && c.length === 1 ? c[0] : c;
  };
  const oylar = idler.map((_, k) => ({
    lehte: tek("forVotesOf", ham[k * 4 + 2]),
    aleyhte: tek("againstVotesOf", ham[k * 4 + 3])
  }));

  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "#" }),
    el("th", { yazi: "Description" }),
    el("th", { yazi: "Durum" }),
    el("th", { yazi: "Lehte" }),
    el("th", { yazi: "Aleyhte" }),
    el("th", { yazi: "Hedef" })
  ])]));
  const govde = el("tbody");

  idler.forEach((id, k) => {
    const pr = ham[k * 4] == null ? null : sonucCoz(ABI.governor, "proposals", ham[k * 4]);
    const dr = ham[k * 4 + 1] == null ? null : sonucCoz(ABI.governor, "state", ham[k * 4 + 1]);
    if (!pr) return;

    const d = dr == null ? null : DURUM[Number(dr)];
    /* BY NAME, BECAUSE THE INDEX MOVED
         DepthGovernor's Proposal has a sixth uint — snapshotTotal —
         sitting where forVotes used to be. pr[7] on this governor is
         the staked supply at the snapshot, so the old indices would
         have shown an unsupported proposal as unanimously backed.
         forVotesOf/againstVotesOf cannot drift by one. */
    const lehte = oylar[k] && oylar[k].lehte != null
      ? tamSayidanSayi(oylar[k].lehte, 18) : null;
    const aleyhte = oylar[k] && oylar[k].aleyhte != null
      ? tamSayidanSayi(oylar[k].aleyhte, 18) : null;

    govde.append(el("tr", {}, [
      el("td", { yazi: String(id) }),
      el("td", {}, [
        el("div", { yazi: pr[3] || "(no description)" }),
        el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" }, [adres(pr[0])])
      ]),
      el("td", {}, [d
        ? el("span", { sinif: "etiket " + d.sinif, yazi: d.ad })
        : el("span", { sinif: "yazi yazi--sessiz", yazi: "unreadable" })]),
      el("td", { yazi: lehte == null ? "unreadable" : jetonMiktar(lehte) }),
      el("td", { yazi: aleyhte == null ? "unreadable" : jetonMiktar(aleyhte) }),
      el("td", {}, [
        /* A zero target is a signal proposal: a question put on the record
           with no call behind it. Those still vote and still pass, and
           executing one only marks it. Saying "—" would hide the
           difference between that and a proposal that moves money. */
        pr[1] && pr[1] !== "0x0000000000000000000000000000000000000000"
          ? adres(pr[1])
          : el("span", { sinif: "yazi yazi--sessiz", yazi: "signal (no call)" })
      ])
    ]));
  });

  tablo.append(govde);
  kap.append(panel("Recent proposals", tablo, el("a", {
    sinif: "dugme dugme--sessiz",
    attr: { href: "#/teklifler" },
    yazi: "See all and vote"
  }), true));

  return kap;
}
