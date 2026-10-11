/* ===========================================================================
 * gorunum/teklifler.js — proposals and voting
 *
 * THIS SCREEN REALLY SENDS TRANSACTIONS
 *   From the spec: *"Do not build a decorative DAO screen. Build real
 *   voting and a real proposal mechanism."* Every button here calls
 *   `eth_sendTransaction` against the live governor on chain —
 *   `propose`, `castVote`, `queue`, `execute`. None of it is a mock.
 *
 * NO CONTROL THAT CANNOT WORK IS RENDERED
 *   The other rule in the same spec: *"Do not offer features that do
 *   not work as active buttons."* So each button is rendered according
 *   to whether that action is valid RIGHT NOW:
 *
 *     proposal form   only if voting power clears the threshold
 *     vote buttons    only while the proposal is Active and the user
 *                     has not voted
 *     queue           only when the state is Succeeded
 *     execute         only when the state is Executable
 *
 *   Measured: `totalStaked()` is zero. So nobody has voting power right
 *   now and the proposal form is not rendered at all — the reason is
 *   printed instead. Showing the form would send a transaction the chain
 *   refuses, charging the user gas to be told nothing.
 *
 * THE RAW CALLDATA FIELD IS OPEN, AND LABELLED
 *   The governor's signature is `propose(string, address, bytes)`, so a
 *   proposal can express any call. Hiding that in the interface would be
 *   showing the system as safer than it is. The field is there, it
 *   defaults to empty (a signal proposal), and what it means is written
 *   down: nobody verifies those bytes.
 * =========================================================================== */

import { el, sayfaUst, panel, bos, not, olcum, adres, hata } from "../ui.js";
import { oku, cokluCagri, cagriVerisi, sonucCoz, ABI } from "../zincir.js";
import { YONETISIM, DAO_YETKI, PULSE, EKONOMI, canli } from "../adresler.js";
import { jetonMiktar, tamSayidanSayi, gecenSure, para } from "../bicim.js";

const SIFIR_ADRES = "0x0000000000000000000000000000000000000000";

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

/* Governor.State indices, named so a comparison reads as a sentence. */
const OYLAMADA = 0, KABUL = 2, UYGULANABILIR = 4;

function tekli(abi, ad, veri) {
  const c = sonucCoz(abi, ad, veri);
  return c && c.length === 1 ? c[0] : c;
}

/* ---- sending, with the outcome shown rather than swallowed ----------- */

function gonderici(cuzdan, dugme, durumSatiri) {
  return async (veri, aciklama) => {
    dugme.disabled = true;
    const eskiYazi = dugme.textContent;
    dugme.textContent = "Waiting for the wallet…";
    durumSatiri.textContent = "";
    durumSatiri.className = "yazi yazi--kucuk yazi--sessiz";
    try {
      const hash = await cuzdan.gonder({ to: YONETISIM.governor, data: veri });
      durumSatiri.className = "yazi yazi--kucuk";
      /* The hash and nothing else. Claiming the proposal "passed" here
         would be claiming something only the chain can say, and it says
         it on the next read. */
      durumSatiri.textContent = aciklama + " sent: " + hash;
      dugme.textContent = "Sent";
      /* Re-read after a few blocks rather than guessing the new state.
         Arc's measured block time is ~0.507 s, so five seconds is several
         blocks. */
      setTimeout(() => window.dispatchEvent(new HashChangeEvent("hashchange")), 5000);
    } catch (e) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      /* 4001 is the user declining, which is an answer and not a fault. */
      durumSatiri.textContent = (e && e.code === 4001)
        ? "The wallet rejected it."
        : "Could not send: " + ((e && e.message) || String(e));
      dugme.disabled = false;
      dugme.textContent = eskiYazi;
    }
  };
}

/* ---- a developer payment, composed rather than hand-encoded --------
 *
 * THIS SPEC ITEM EXISTED AS A MECHANISM BUT NOT AS A PATH
 *   The DAO's only power is paying out of the DevPool, and that is now
 *   possible: the floor is staked and propose() is accepted. But the
 *   free-form form below asks for a bare target address and bare hex
 *   calldata — so proposing a payment to a developer meant ABI-encoding
 *   pay(address,address,uint256,uint256) by hand.
 *
 *   An authority nobody can use differs from one that does not exist
 *   only on paper. This section builds that call from three fields:
 *   recipient, amount, contribution id.
 *
 * IT ENCODES, IT DOES NOT SEND
 *   The calldata produced goes inside the proposal. This page does not
 *   make the payment: the proposal has to pass, the two-day timelock has
 *   to run out, and then execute() calls it as the governor. The
 *   button's label says so — "propose a payment", not "pay". */
function odemeTeklifi(cuzdan, havuzBakiye) {
  const alici = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… the developer's address" }
  });
  const miktar = el("input", {
    sinif: "girdi",
    attr: { type: "number", min: "0", step: "0.01", placeholder: "500.00" }
  });
  const katkiNo = el("input", {
    sinif: "girdi",
    attr: { type: "number", min: "0", step: "1", placeholder: "0" }
  });
  const neden = el("textarea", {
    sinif: "girdi girdi--alan",
    attr: { rows: 2,
      placeholder: "What is this paying for? This text goes on chain." }
  });

  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const dugme = el("button", {
    sinif: "dugme dugme--marka", attr: { type: "button" },
    yazi: "PROPOSE A PAYMENT"
  });
  const gonder = gonderici(cuzdan, dugme, durumSatiri);

  dugme.addEventListener("click", () => {
    const a = (alici.value || "").trim();
    const m = Number(miktar.value);
    const k = Number(katkiNo.value);
    const n = (neden.value || "").trim();

    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "The recipient is not an address.";
      return;
    }
    if (a === SIFIR_ADRES) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "The zero address is refused — the contract reverts with ZeroAddress.";
      return;
    }
    if (!Number.isFinite(m) || m <= 0) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "The amount has to be above zero — the contract reverts with ZeroAmount.";
      return;
    }
    if (!Number.isInteger(k) || k < 0) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "The contribution id has to be a whole number — write 0 if there is none.";
      return;
    }
    if (!n) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "The description cannot be empty: it is the only readable thing written on chain.";
      return;
    }

    /* Six decimals, because the quote has six. Rounded rather than
       truncated so a form showing 500 does not propose 499,999999. */
    const ham = BigInt(Math.round(m * 1e6));

    /* Not a block, a warning: the pool fills with every trade, so an
       amount above today's balance may well be payable by the time the
       vote and the timelock are done. Refusing it here would be the page
       deciding something the chain decides later. */
    if (havuzBakiye != null && ham > BigInt(havuzBakiye)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "Warning: the pool holds " + para(tamSayidanSayi(havuzBakiye, 6)) +
        " and the proposal asks for " + para(m) + ". It can still be sent, " +
        "but if the balance is short when it executes, the call reverts. " +
        "Press the button again to send it anyway.";
      /* The second press goes through: the warning is shown once. */
      if (!dugme.dataset.uyarildi) { dugme.dataset.uyarildi = "1"; return; }
    }

    const veri = cagriVerisi(ABI.devPoolTeklif, "pay",
      [EKONOMI.quote, a, ham, BigInt(k)]);
    /* gonderici ZATEN kodlanmis governor cagrisini aliyor, uc parca
       degil. Teklifin kendisi burada kuruluyor: propose(aciklama, hedef,
       cagriVerisi). */
    gonder(
      cagriVerisi(ABI.governor, "propose", [n, PULSE.devPool, veri]),
      "Propose a payment");
  });

  const kap = el("div", { sinif: "yigin yigin--sik" });
  kap.append(el("p", {
    sinif: "yazi yazi--sessiz",
    yazi: "This is the DAO's only power: paying USDC out of the developer " +
      "pool. The fields below build the pay() call. This page does not " +
      "make the payment — the proposal has to pass, the two-day timelock " +
      "has to run out, and then execute() calls it as the governor."
  }));
  if (havuzBakiye != null) {
    kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
      olcum("Havuzda", para(tamSayidanSayi(havuzBakiye, 6)),
        "DevPool'un USDC bakiyesi"),
      olcum("Hedef", "DevPool", PULSE.devPool)
    ]));
  }
  for (const [etiket, girdi] of [
    ["Developer's address", alici],
    ["Miktar (USDC)", miktar],
    ["Contribution id (from DevPool.register)", katkiNo],
    ["What for", neden]
  ]) {
    kap.append(el("div", { sinif: "alan" }, [
      el("label", { sinif: "alan__etiket", yazi: etiket }), girdi
    ]));
  }
  kap.append(dugme);
  kap.append(durumSatiri);
  kap.append(not(
    "The contribution id is optional and is not validated: a payment may " +
    "legitimately come before a registration, or cover several of them. " +
    "The contract does not refuse a vote over a bookkeeping reference.",
    "bilgi"));
  return kap;
}

/* ---- the proposal form ---------------------------------------------- */

function teklifFormu(cuzdan) {
  const aciklama = el("textarea", {
    sinif: "girdi girdi--alan",
    attr: { rows: 3, placeholder: "Say what the proposal is. This text goes on chain." }
  });
  const hedef = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… (leave empty for a signal proposal)" }
  });
  const veri = el("input", {
    sinif: "girdi",
    attr: { type: "text", placeholder: "0x… calldata (may be left empty)" }
  });

  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const dugme = el("button", {
    sinif: "dugme dugme--marka",
    attr: { type: "button" },
    yazi: "Send the proposal"
  });
  const gonder = gonderici(cuzdan, dugme, durumSatiri);

  dugme.addEventListener("click", () => {
    const a = aciklama.value.trim();
    if (!a) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "The description cannot be empty: it is the only thing written on chain.";
      return;
    }
    const h = hedef.value.trim() || SIFIR_ADRES;
    if (!/^0x[0-9a-fA-F]{40}$/.test(h)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "The target is not an address. Leaving it empty means a signal proposal.";
      return;
    }
    const d = veri.value.trim() || "0x";
    if (!/^0x([0-9a-fA-F]{2})*$/.test(d)) {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent = "Calldata has to start with 0x and have an even number of hex digits.";
      return;
    }
    if (h !== SIFIR_ADRES && d === "0x") {
      durumSatiri.className = "yazi yazi--kucuk yazi--hata";
      durumSatiri.textContent =
        "A target was given but the calldata is empty. Even if this passes " +
        "it makes an empty call. Leave the target empty for a signal proposal.";
      return;
    }
    gonder(cagriVerisi(ABI.governor, "propose", [a, h, d]), "Teklif");
  });

  return el("div", { sinif: "yigin yigin--sik" }, [
    el("label", { sinif: "etiket-girdi", yazi: "Description" }),
    aciklama,
    el("label", { sinif: "etiket-girdi", yazi: "Target contract (optional)" }),
    hedef,
    el("label", { sinif: "etiket-girdi", yazi: "Calldata (optional)" }),
    veri,
    not(
      "With the target and calldata left empty this is a SIGNAL proposal: " +
      "it is recorded, voted on, and can pass, but it calls nothing. " +
      "Filled in, the call is made exactly as written when the proposal " +
      "passes — and nobody verifies those bytes, neither this page nor " +
      "the contract.",
      "uyari"
    ),
    el("div", { sinif: "satir satir--arali" }, [dugme]),
    durumSatiri
  ]);
}

/* ---- one proposal, with only the controls that can act -------------- */

function teklifKarti(id, pr, durumNo, hesap, oyVerdi, gucu, cuzdan, oy) {
  const d = durumNo == null ? null : DURUM[Number(durumNo)];
  /* EVERY INDEX HERE MOVED BY ONE — AND ONE CHANGED UNITS
       The ALP governor's Proposal had five uints; FTHM's DepthGovernor
       has six, because anBlok (the block weights are read at) comes
       first. So on the new governor:

         pr[4]  anBlok         was end      — a BLOCK NUMBER, and
                                              Number(pr[4]) * 1000 would
                                              have rendered it as a date
         pr[5]  end            was eta
         pr[6]  eta            was snapshotTotal
         pr[7]  snapshotTotal  was forVotes
         pr[8]  forVotes       was againstVotes

       Nothing would have thrown. The screen would have shown a deadline
       in the wrong millennium, quorum measured against the wrong total,
       and the FOR count taken from the staked supply.

       The two vote counts come from named getters now; an index can
       drift again when a struct changes, a name cannot. */
  const lehte = oy.lehte == null ? null : tamSayidanSayi(oy.lehte, 18);
  const aleyhte = oy.aleyhte == null ? null : tamSayidanSayi(oy.aleyhte, 18);
  const toplamAnlik = tamSayidanSayi(pr[7], 18);
  const bitis = Number(pr[5]) * 1000;
  const eta = Number(pr[6]) * 1000;

  const govde = el("div", { sinif: "yigin yigin--sik" });

  govde.append(el("p", { yazi: pr[3] || "(no description)" }));

  govde.append(el("div", { sinif: "izgara izgara--olcum" }, [
    /* A failed read is not zero votes. Printing 0 would tell someone
       deciding how to vote that a proposal has no support when the
       truth is that the count did not arrive. */
    olcum("For", lehte == null ? "unreadable" : jetonMiktar(lehte) + " FTHM",
      lehte != null && toplamAnlik > 0
        ? (lehte / toplamAnlik * 100).toFixed(2) + "% of the snapshot" : null),
    olcum("Against", aleyhte == null ? "unreadable" : jetonMiktar(aleyhte) + " FTHM", null),
    olcum("Snapshot total", jetonMiktar(toplamAnlik) + " FTHM", "stake when the proposal opened"),
    olcum("Voting ends", new Date(bitis).toISOString().slice(0, 16).replace("T", " "),
      bitis > Date.now() ? gecenSure(bitis - Date.now()) + " left" : "over"),
    eta > 0
      ? olcum("Uygulanabilir", new Date(eta).toISOString().slice(0, 16).replace("T", " "),
        eta > Date.now() ? gecenSure(eta - Date.now()) + " left" : "now")
      : null,
    olcum("Teklif eden", adres(pr[0]), null)
  ].filter(Boolean)));

  govde.append(el("div", { sinif: "satir satir--arali" }, [
    pr[1] && pr[1] !== SIFIR_ADRES
      ? el("span", { sinif: "yazi yazi--kucuk" }, ["Hedef: ", adres(pr[1])])
      : el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Signal proposal — no call; executing it only marks it"
      })
  ]));

  const durumSatiri = el("div", { sinif: "yazi yazi--kucuk yazi--sessiz" });
  const eylemler = el("div", { sinif: "satir satir--arali" });

  /* Only the action the state actually allows. A disabled button with a
     tooltip would still be a button for something that cannot happen. */
  if (durumNo != null && Number(durumNo) === OYLAMADA) {
    if (!hesap) {
      eylemler.append(el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Connect a wallet to vote."
      }));
    } else if (oyVerdi) {
      eylemler.append(el("span", {
        sinif: "etiket etiket--bitti",
        yazi: "You have voted"
      }));
    } else if (!gucu || gucu === 0) {
      eylemler.append(el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Your voting power is zero — it comes from staking FTHM."
      }));
    } else {
      for (const [yazi, lehteMi, sinif] of [
        ["Lehte oy ver", true, "dugme dugme--marka"],
        ["Aleyhte oy ver", false, "dugme"]
      ]) {
        const b = el("button", { sinif, attr: { type: "button" }, yazi });
        const g = gonderici(cuzdan, b, durumSatiri);
        b.addEventListener("click", () =>
          g(cagriVerisi(ABI.governor, "castVote", [id, lehteMi]),
            lehteMi ? "Lehte oy" : "Aleyhte oy"));
        eylemler.append(b);
      }
      eylemler.append(el("span", {
        sinif: "yazi yazi--kucuk yazi--sessiz",
        yazi: "Your weight: " + jetonMiktar(gucu) + " FTHM"
      }));
    }
  } else if (durumNo != null && Number(durumNo) === KABUL) {
    const b = el("button", {
      sinif: "dugme dugme--marka", attr: { type: "button" },
      yazi: "Queue"
    });
    const g = gonderici(cuzdan, b, durumSatiri);
    b.addEventListener("click", () => g(cagriVerisi(ABI.governor, "queue", [id]), "Queueing"));
    if (hesap) eylemler.append(b);
    eylemler.append(el("span", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: hesap
        ? "The timelock starts once it is queued."
        : "Connect a wallet to queue it. Anyone can."
    }));
  } else if (durumNo != null && Number(durumNo) === UYGULANABILIR) {
    const b = el("button", {
      sinif: "dugme dugme--marka", attr: { type: "button" },
      yazi: "Uygula"
    });
    const g = gonderici(cuzdan, b, durumSatiri);
    b.addEventListener("click", () => g(cagriVerisi(ABI.governor, "execute", [id]), "Uygulama"));
    if (hesap) eylemler.append(b);
    eylemler.append(el("span", {
      sinif: "yazi yazi--kucuk yazi--sessiz",
      yazi: hesap
        ? "Executing is open to anyone — you do not have to be the proposer."
        : "Connect a wallet to execute it. Anyone can."
    }));
  }

  if (eylemler.childNodes.length) govde.append(eylemler);
  govde.append(durumSatiri);

  const bas = el("div", { sinif: "satir satir--arali" }, [
    el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "#" + id }),
    d ? el("span", { sinif: "etiket " + d.sinif, yazi: d.ad }) : null
  ].filter(Boolean));

  return panel("Teklif #" + id, govde, bas);
}

/* ---- the screen ------------------------------------------------------ */

export async function ciz({ cuzdan }) {
  const kap = el("div", { sinif: "yigin" });
  const hesap = cuzdan.hesap();
  kap.append(sayfaUst(
    "Proposals and voting",
    "A live governor — every button sends a real transaction"
  ));

  /* ---- parameters and the caller's standing --------------------- */
  /* MIN_OY_GUCU IS ON THE STAKE, NOT THE GOVERNOR
       Reading it from the Governor returned nothing on this stack, which
       would have made the proposal threshold collapse to the percentage
       alone — lower than the contract enforces, shown to someone
       deciding whether they can propose. */
  const temelAdlar = ["proposalCount", "PROPOSAL_THRESHOLD_BPS", "QUORUM_BPS"];
  const temel = await cokluCagri(temelAdlar.map((ad) => ({
    method: "eth_call",
    params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, ad) }, "latest"]
  })));
  const P = {};
  temelAdlar.forEach((ad, i) => {
    P[ad] = temel[i] == null ? null : tekli(ABI.governor, ad, temel[i]);
  });

  if (P.proposalCount == null) {
    kap.append(hata(
      "Governance could not be read",
      "The governor is at " + YONETISIM.governor + " but `proposalCount()` " +
      "did not answer. The screen is not inventing a state."
    ));
    return kap;
  }

  const stakeToplam = await oku(YONETISIM.staking, ABI.staking, "totalStaked");
  const toplam = stakeToplam == null ? null : tamSayidanSayi(stakeToplam, 18);
  const asgariHam = await oku(YONETISIM.staking, ABI.staking, "MIN_OY_GUCU");
  const asgari = asgariHam == null ? null : tamSayidanSayi(asgariHam, 18);
  const esik = toplam == null || asgari == null
    ? null
    : Math.max(toplam * Number(P.PROPOSAL_THRESHOLD_BPS) / 10_000, asgari);

  let gucu = null;
  if (hesap) {
    const g = await oku(YONETISIM.staking, ABI.staking, "oyGucu", [hesap]);
    gucu = g == null ? null : tamSayidanSayi(g, 18);
  }

  kap.append(el("div", { sinif: "izgara izgara--olcum" }, [
    olcum("Proposals", String(Number(P.proposalCount)), "to date"),
    olcum("Proposal threshold", esik == null ? "—" : jetonMiktar(esik) + " FTHM",
      "the greater of the stake share and the floor"),
    olcum("Your voting power",
      hesap ? (gucu == null ? "—" : jetonMiktar(gucu) + " FTHM") : "no wallet connected",
      hesap ? "FTHM staked" : null)
  ]));

  /* ---- the form, and only if it can succeed --------------------- */
  if (!hesap) {
    kap.append(panel("Teklif ver", bos(
      "Wallet not connected",
      "Connect a wallet to propose and to vote. The page sends nothing " +
      "on its own.",
      el("button", {
        sinif: "dugme dugme--marka", attr: { type: "button" },
        yazi: "Connect wallet",
        on: { click: () => document.getElementById("cuzdan-dugme").click() }
      })
    )));
  } else if (!cuzdan.zincirdeMi()) {
    kap.append(panel("Teklif ver", bos(
      "Wallet is not on the Arc network",
      "The governor lives on Arc. You have to switch networks.",
      el("button", {
        sinif: "dugme dugme--marka", attr: { type: "button" },
        yazi: "Switch to Arc",
        on: { click: () => cuzdan.arcaGec().catch(() => {}) }
      })
    )));
  } else if (gucu == null || esik == null) {
    kap.append(panel("Teklif ver", not(
      "Voting power could not be read, so the proposal form is not " +
      "rendered: stopping is better than sending a transaction that " +
      "would be refused and charging gas for it.",
      "uyari"
    )));
  } else if (gucu < esik) {
    /* The measured state today: nothing is staked, so this is everyone. */
    kap.append(panel("Teklif ver", not(
      "Your voting power is " + jetonMiktar(gucu) + " FTHM and the " +
      "threshold is " + jetonMiktar(esik) + " FTHM. The form is not " +
      "rendered because the transaction would be refused on chain — " +
      "showing the button and charging gas for it is not information, " +
      "maliyet olurdu." +
      (toplam === 0
        ? " Right now NO FTHM is staked, so this holds for everyone: the " +
          "DAO is deployed and answering; what is missing is stake."
        : ""),
      "uyari"
    )));
  } else {
    /* THE PAYMENT COMPOSER FIRST, THE FREE-FORM FORM AFTER IT
         The DAO has one power — paying out of the DevPool — so nearly
         everyone who proposes will be doing that. Putting the free-form
         form first would invite every one of them to ABI-encode a pay()
         call by hand: the mechanism would exist and be unusable. */
    let havuzBakiye = null;
    if (canli(PULSE.devPool)) {
      try {
        havuzBakiye = await oku(EKONOMI.quote, ABI.erc20, "balanceOf",
          [PULSE.devPool]);
      } catch (e) { havuzBakiye = null; }
    }
    kap.append(panel("Propose a developer payment",
      odemeTeklifi(cuzdan, havuzBakiye)));
    kap.append(panel("Serbest teklif — ileri seviye", teklifFormu(cuzdan)));
  }

  /* ---- what a proposal may ask for ----------------------------- */
  kap.append(panel("Neye karar verilebilir", el("div", { sinif: "yigin yigin--sik" }, [
    el("ul", { sinif: "liste liste--isaretli" },
      DAO_YETKI.yapabilir.map((x) => el("li", {}, [
        el("strong", { yazi: x.ne }),
        el("span", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "  " + x.nerede })
      ]))),
    not(
      "A proposal outside this list CAN be made — the governor's signature " +
      "can express any call. But the target contracts have no lever to " +
      "pull, so the call reverts even if the vote passes. The detail is " +
      "on the Platform DAO screen.",
      "bilgi"
    )
  ])));

  /* ---- the proposals ------------------------------------------- */
  const sayi = Number(P.proposalCount);
  if (sayi === 0) {
    kap.append(panel("Teklifler", bos(
      "No proposals yet",
      "The governor has recorded zero proposals. That is not a fault: " +
      "the contract is deployed and answering, nobody has proposed yet."
    )));
    return kap;
  }

  const idler = [];
  for (let i = sayi; i >= 1; i--) idler.push(i);

  const istekler = idler.flatMap((id) => {
    const temelIki = [
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "proposals", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "state", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "forVotesOf", [id]) }, "latest"] },
      { method: "eth_call", params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "againstVotesOf", [id]) }, "latest"] }
    ];
    if (hesap) {
      temelIki.push({
        method: "eth_call",
        params: [{ to: YONETISIM.governor, data: cagriVerisi(ABI.governor, "hasVoted", [id, hesap]) }, "latest"]
      });
    }
    return temelIki;
  });
  const adim = hesap ? 5 : 4;
  const ham = await cokluCagri(istekler);

  const liste = el("div", { sinif: "yigin" });
  idler.forEach((id, k) => {
    const pr = ham[k * adim] == null ? null : sonucCoz(ABI.governor, "proposals", ham[k * adim]);
    const dr = ham[k * adim + 1] == null ? null : tekli(ABI.governor, "state", ham[k * adim + 1]);
    const oy = {
      lehte: ham[k * adim + 2] == null
        ? null : tekli(ABI.governor, "forVotesOf", ham[k * adim + 2]),
      aleyhte: ham[k * adim + 3] == null
        ? null : tekli(ABI.governor, "againstVotesOf", ham[k * adim + 3])
    };
    const ov = hesap && ham[k * adim + 4] != null
      ? tekli(ABI.governor, "hasVoted", ham[k * adim + 4])
      : false;
    if (!pr) {
      liste.append(panel("Teklif #" + id, not(
        "This proposal could not be read. Left empty rather than showing " +
        "invented content.", "uyari"
      )));
      return;
    }
    liste.append(teklifKarti(id, pr, dr, hesap, ov, gucu, cuzdan, oy));
  });

  kap.append(liste);
  return kap;
}
