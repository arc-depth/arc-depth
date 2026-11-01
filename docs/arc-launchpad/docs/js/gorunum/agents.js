/* gorunum/agents.js — the product page for TurKaydi type 3 (see urun.js)
 *
 * Extras for AI agent tokens (1 Nov 2026):
 *   - the agent wallet named in the token's TurKaydi description, with its
 *     USDC balance on Arc and whether it is the founder TurKaydi recognises
 *     (the founder is the one paid 0.30% of every trade).
 *   - "Launch from code": the exact calls an agent makes on Arc, MerkezKapi.launch
 *     and TurKaydi.yaz, with the live addresses. Nothing here is a server or an
 *     API of ours: the agent signs with its own key against Arc directly.
 */
import { el, panel, not } from "../ui.js";
import { urunSayfasi, arcUsdc, kurucuOku, canliAyar, kodBlogu, dolarYaz } from "../urun.js";
import { TUR_KAYDI, ZINCIR, DIS } from "../adresler.js";

const ARCP = "0xbe98138311c2D89526eCD86B368A2B4B81cf840b";   // an Arc asset with a pool there, used as the sample basket line

export function kartEk(x) {
  const w = x.bilgi && x.bilgi.agentWallet;
  if (typeof w !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(w)) return el("div", { sinif: "yazi yazi--kucuk yazi--sessiz", yazi: "No agent wallet published in this token's description." });
  const satir = el("div", { sinif: "yazi yazi--kucuk", yazi: "Agent wallet USDC on Arc: reading…" });
  Promise.all([arcUsdc(w), kurucuOku(x.token).catch(() => null)]).then(([d, k]) => {
    const kurucu = k && k.toLowerCase() === w.toLowerCase();
    satir.textContent = "Agent wallet USDC on Arc: " + dolarYaz(d) + (kurucu
      ? " · this wallet is the token's founder, so the founder's 0.30% of every trade goes to it."
      : " · this wallet is not the token's founder on record, so the founder's 0.30% goes to the founder's wallet, not to this one.");
  }).catch(() => { satir.textContent = "Agent wallet USDC on Arc: could not be read now."; });
  return satir;
}

function ornekKod(a) {
  return `// Launch a token from an agent's own wallet, directly on Arc (chain ${ZINCIR.id}), with ethers v6.
// The agent pays in Arc USDC (also Arc's gas token). Nothing goes through ARC PULSE's site.
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider("${ZINCIR.rpc}");
const wallet = new ethers.Wallet(process.env.AGENT_KEY, provider);   // the agent's own key
const me = await wallet.getAddress();

const USDC      = "${DIS.usdc}"; // Arc USDC, ERC-20 interface: 6 decimals
const KAPI      = "${a.kapi}"; // MerkezKapi (the launch gate)
const ARC_VAULT = "${a.zincir.arc.kasa}"; // the basket vault on Arc
const TUR_KAYDI = "${TUR_KAYDI.adres}"; // product type record
const ASSET     = "${ARCP}"; // basket line: ARCP on Arc (any Arc token with a pool)

// 1. The vault must be able to buy the asset from a pool (the Create page checks this too)
const vault = new ethers.Contract(ARC_VAULT, ["function havuzVar(address) view returns (bool,bool,bool)"], provider);
const [hasPool] = await vault.havuzVar(ASSET);
if (!hasPool) throw new Error("No pool on Arc for this asset: pick another one");

// 2. A starting quote: raw units of the asset the line's dollars buy now.
//    The site asks relay.link for a same-chain quote where DexScreener has no price
//    (Arc's native USDC is 18 decimals in that request).
const lineUsd = 1;   // dollars on this basket line: at least 5% of the first buy
const q = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ user: KAPI, recipient: KAPI, originChainId: ${ZINCIR.id}, destinationChainId: ${ZINCIR.id},
    originCurrency: ethers.ZeroAddress, destinationCurrency: ASSET,
    amount: (BigInt(lineUsd * 1e6) * 10n ** 12n).toString(), tradeType: "EXACT_INPUT" }) }).then((r) => r.json());
const teklif = BigInt(q.details.currencyOut.amount);

// LayerZero executor options (type 3, lzReceive gas), encoded as the site encodes them
const lzOptions = (gas) => ethers.solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, gas]);

const kapi = new ethers.Contract(KAPI, [
  "function launch((string ad,string sembol,(uint32 zincir,bytes32 varlik,uint256 dolar)[] sepet,uint256[] teklif,uint256 vergiPpm,uint256 alim,bytes32 kurucu,uint32 kurucuZincir,uint32 kurucuEid,uint32[] ikizler,bytes ikizSecenek,uint256 ikizUcret,bytes gonderSecenek,address iade,string[] tipler,uint32[] uzakIkizler,uint256 uzakUcret) r) payable returns (address)",
  "event MerkezLaunch(address indexed token, address vekil, bytes32 kurucu, uint32 kurucuZincir, uint256 kurucuToken)"
], wallet);

const alim = 20_000_000n;                                   // first buy $20 (6 decimals; $20 to $500)
const dolar = BigInt(lineUsd * 1e6);
const istek = {
  ad: "Agent Token", sembol: "AGNT",
  sepet: [{ zincir: 26, varlik: ethers.zeroPadValue(ASSET, 32), dolar }],   // 26 = Arc (CCTP domain); up to 5 lines
  teklif: [teklif],                                         // one per line
  vergiPpm: 20_000n,                                        // collateral tax 2% (10_000 = 1%; 1% to 5%)
  alim,
  kurucu: ethers.zeroPadValue(me, 32),                      // founder: the agent's wallet, paid 0.30% of every trade in USDC
  kurucuZincir: 26,                                         // founder paid on Arc
  kurucuEid: 0,                                             // founder's tokens stay on Arc
  ikizler: [],                                              // no twins now: anyone can create them later
  ikizSecenek: lzOptions(6_300_000n),
  ikizUcret: 0n,
  gonderSecenek: lzOptions(100_000n),
  iade: me,                                                 // unused native value comes back here
  tipler: [""],                                             // one per line; only a Sui line names its coin type
  uzakIkizler: [], uzakUcret: 0n
};

// 3. Approve the first buy plus the basket, then launch
const usdc = new ethers.Contract(USDC, ["function approve(address,uint256) returns (bool)"], wallet);
await (await usdc.approve(KAPI, alim + dolar)).wait();
const receipt = await (await kapi.launch(istek)).wait();
const token = receipt.logs.map((l) => { try { return kapi.interface.parseLog(l); } catch { return null; } })
  .find((e) => e && e.name === "MerkezLaunch").args.token;
console.log("launched", token);

// 4. Save the product type: 3 = AI agent, with the agent's wallet in the public description (at most ${TUR_KAYDI.bilgiAzami} bytes)
const tur = new ethers.Contract(TUR_KAYDI, ["function yaz(address token, uint8 tur, string bilgi)"], wallet);
await (await tur.yaz(token, 3, JSON.stringify({ text: "What this agent does", links: ["https://example.com"], agentWallet: me }))).wait();
`;
}

async function koddanBolum() {
  const a = await canliAyar();
  if (!a || !a.kapi || !a.zincir || !a.zincir.arc) {
    return panel("Launch from code", not("The live gate's addresses (veri/sepet-v2.json) could not be loaded, so the example is not shown. Reload the page.", "uyari"));
  }
  return panel("Launch from code", el("div", { sinif: "yigin" }, [
    el("p", { yazi: "An agent does not need this site. It can launch with its own wallet by calling MerkezKapi.launch on Arc, then write its product type with TurKaydi.yaz. The example below uses the live addresses and the same request the Create page builds, for the simplest case: everything on Arc, one basket line, no twins at launch." }),
    kodBlogu(ornekKod(a)),
    not("Before running it: the wallet needs Arc USDC for the first buy, the basket and gas. The first buy is $20–$500; each basket line is at least 5% of it. Twins on other chains can be added in the same call (ikizler, with the LayerZero fee as ikizUcret) or created later by anyone. Only the founder wallet (or the record's owner) can call TurKaydi.yaz for a token.", "bilgi"),
  ]));
}

export async function ciz() {
  return urunSayfasi(3, { kartEk, sonrasi: [await koddanBolum()] });
}
