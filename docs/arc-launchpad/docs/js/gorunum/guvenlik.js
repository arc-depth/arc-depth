/* ===========================================================================
 * gorunum/guvenlik.js — contract addresses, deployment state, and the
 *                       properties that are actually proven
 *
 * The page a sceptical reader opens first. So it leads with what is NOT
 * deployed, because a security page that buries that is marketing.
 *
 * Everything claimed here is produced by a script in this repository that
 * anybody can run, and each claim says which one. A property asserted
 * without a way to check it does not belong on this page.
 * =========================================================================== */

import { el, sayfaUst, panel, not, olcum, adres } from "../ui.js";
import { ikon } from "../ikon.js";
import { PULSE, DIS, ESKI, HEDEFLER, EKONOMI, canli } from "../adresler.js";
import { sonBlok } from "../zincir.js";
import { bloktanSure } from "../bicim.js";

/* Claims, each with the script that establishes it. */
const KANITLAR = [
  {
    baslik: "Every transfer out of the vault goes to msg.sender",
    yazi: "There are exactly four ways an asset leaves the collateral " +
          "vault — redemption, the buyback loan, the buyback reward and " +
          "the conversion loan — and none of them takes a destination " +
          "argument. The reserve cannot be routed to a bridge, to an " +
          "owner, or to any address at all.",
    betik: "scripts/denetim-kasa-cikislari.js"
  },
  {
    baslik: "The contracts cannot be changed",
    yazi: "The bytecode of 15 contracts was scanned: no DELEGATECALL, no " +
          "SELFDESTRUCT, and no other opcode that could change code. The " +
          "factories' CREATE is permitted and which contract each one " +
          "embeds is recorded by name.",
    betik: "scripts/degismezlik.js"
  },
  {
    baslik: "The curve's arithmetic was not forked",
    yazi: "EgriLaunch is a fork of Egri. Nine of the price and quota " +
          "functions are identical line for line; every line that does " +
          "differ has to match a named fork point, or the audit fails.",
    betik: "scripts/egri-catal-denetimi.js"
  },
  {
    baslik: "The fee table matches in both contracts",
    yazi: "The table is written in both the launchpad and the hook. The " +
          "script compares the two and checks that the total divides into " +
          "the slices.",
    betik: "scripts/egri-ucret-denetimi.js"
  },
  {
    baslik: "On a real sale the fee reached seven addresses correctly",
    yazi: "A real sale was made on Arc mainnet and what the seven targets " +
          "received matched the table to within 1 ppm. Before this, the " +
          "hook's money side reverted on every sale with an overflow — " +
          "this measurement is what found it.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "The floor caught a real collapse",
    yazi: "With nothing added to the reserve and only the price pushed " +
          "down: the buyback triggered at −94.9%, 2.5 million tokens were " +
          "burned, and the claim per token went up. Along the way the " +
          "sell tax grew the reserve by itself.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "No more than 10% of the reserve can leave in one window",
    yazi: "Back-to-back buybacks were tried. The window cap stopped the " +
          "sequence and the total that left stayed under the limit. That " +
          "limit counts the reward too — until it did, the 10% promise " +
          "was being kept at 17.07%.",
    betik: "scripts/olc-geri-alim-canli.js"
  },
  {
    baslik: "No money becomes unreachable at graduation",
    yazi: "When the curve fills, its money deepens the same pool; the " +
          "excess the tokens cannot match goes to the collateral vault. " +
          "The accounting closes to the cent. Before the fix, 698,671 " +
          "USDC was stuck in the opener forever.",
    betik: "scripts/olc-mezuniyet.js"
  },
  {
    baslik: "The Chainlink feeds can be read from a contract",
    yazi: "All 34 feed proxies on Arc were read from inside a contract and " +
          "34/34 answered. The aggregator addresses found by scanning " +
          "logs did not manage this: one of them read fine from a wallet " +
          "and refused a contract with 'No access'.",
    betik: "scripts/olc-besleyiciler.js"
  }
];

export async function ciz() {
  const kap = el("div", { sinif: "yigin" });
  const blok = await sonBlok();

  kap.append(sayfaUst("Security and verification",
    blok ? "Arc block " + blok.toLocaleString("en-US") : "Arc"));

  /* ---- deployment state, first ------------------------------------- */
  const dagitildi = Object.entries(PULSE).filter(([, v]) => canli(v));
  const bekleyen = Object.entries(PULSE).filter(([, v]) => !canli(v));

  kap.append(not(
    bekleyen.length
      ? "The contracts for this model are NOT DEPLOYED YET. " +
        bekleyen.length + " contracts are not on chain, so no button in " +
        "the interface that sends a transaction is active. Every proof " +
        "below was measured against real Arc mainnet with eth_call — " +
        "deploying is a separate step."
      : "The contracts for this model are deployed.",
    bekleyen.length ? "uyari" : "bilgi"
  ));

  const izgara = el("div", { sinif: "izgara izgara--olcum" });
  izgara.append(olcum("Deployed", String(dagitildi.length), "from this model"));
  izgara.append(olcum("Pending", String(bekleyen.length), "still to deploy"));
  izgara.append(olcum("Per call", EKONOMI.islemTavaniBps / 100 + "%", "spendable in one buyback"));
  izgara.append(olcum("Per window", EKONOMI.donemTavaniBps / 100 + "%",
    "able to leave within " + bloktanSure(EKONOMI.donemBlok)));
  kap.append(izgara);

  /* ---- addresses ---------------------------------------------------- */
  const tablo = el("table", { sinif: "tablo tablo--kart" });
  tablo.append(el("thead", {}, [el("tr", {}, [
    el("th", { yazi: "Contract" }), el("th", { yazi: "Address" }), el("th", { yazi: "State" })
  ])]));
  const govde = el("tbody");

  const ekle = (ad, deger, kaynak) => {
    govde.append(el("tr", {}, [
      el("td", { attr: { "data-et": "Contract" } }, [
        el("strong", { yazi: ad }),
        kaynak ? el("div", { sinif: "ucuncul", yazi: kaynak }) : null
      ]),
      el("td", { attr: { "data-et": "Adres" } },
        [canli(deger) ? adres(deger) : el("span", { sinif: "ucuncul", yazi: "—" })]),
      el("td", { attr: { "data-et": "Durum" } }, [
        canli(deger)
          ? el("span", { sinif: "etiket etiket--alis", yazi: "zincirde" })
          : el("span", { sinif: "etiket etiket--uyari", yazi: "not deployed" })
      ])
    ]));
  };

  for (const [ad, v] of Object.entries(PULSE)) ekle(ad, v, "this model");
  ekle("isletme (fee target)", HEDEFLER.isletme, "a plain address");
  ekle("PoolManager", DIS.poolManager, "Uniswap v4, not ours");
  ekle("USDC", DIS.usdc, "native on Arc — both collateral and gas");
  for (const [ad, v] of Object.entries(ESKI)) ekle(ad, v, "previous generation");

  tablo.append(govde);
  kap.append(panel([
    el("span", { html: ikon("kilit", "yol-oge__ikon") }),
    el("span", { yazi: "Adresler" })
  ], el("div", { sinif: "tablo-sarmal" }, [tablo]), null, false));

  /* ---- proofs ------------------------------------------------------- */
  const kanitlar = el("div", { sinif: "yigin yigin--sik" });
  for (const k of KANITLAR) {
    kanitlar.append(el("div", { sinif: "jeton-kart" }, [
      el("div", { sinif: "satir satir--arasi" }, [
        el("strong", { yazi: k.baslik }),
        el("span", { sinif: "etiket etiket--alis", yazi: "measured" })
      ]),
      el("div", { sinif: "ikincil", yazi: k.yazi }),
      el("code", { sinif: "mono ucuncul", yazi: "node " + k.betik })
    ]));
  }
  kap.append(panel("What is true, and how to check it", kanitlar));

  kap.append(not(
    "Every claim on this page names the script that establishes it. A " +
    "claim that cannot be checked does not go on this page.",
    "bilgi"
  ));

  return kap;
}
