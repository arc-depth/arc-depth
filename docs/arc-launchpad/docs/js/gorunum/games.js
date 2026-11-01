/* gorunum/games.js — the product page for TurKaydi type 6 (see urun.js)
 *
 * Extras for game tokens (1 Nov 2026):
 *   - per token: the chains it trades on now and its twin's address on the
 *     EVM chains (IkizYayici.ikizAdresi; the same address on each of them).
 *   - "For game developers": a launch token is a plain ERC-20, so a game takes
 *     it as payment with transfer / approve + transferFrom and checks the
 *     Transfer event. There is no ARC PULSE SDK; the snippet uses ethers v6 only.
 */
import { el, panel, not } from "../ui.js";
import { urunSayfasi, kodBlogu } from "../urun.js";
import { ZINCIR } from "../adresler.js";
import { YedekliOkur } from "../yedekli-okur.js";
import { Contract } from "../../vendor/ethers.min.js";

const arc = new YedekliOkur();

export function kartEk(x) {
  const satir = el("div", { sinif: "yazi yazi--kucuk", yazi: "Trades on: reading…" });
  import("../teminat-izle.js").then(async (m) => {
    const cfg = (await m.sepetV2()) || m.SEPET;
    const [z, ikiz] = await Promise.all([m.islemZincirleri(x.token, cfg),
      new Contract(cfg.yayici, ["function ikizAdresi(address) view returns (address)"], arc).ikizAdresi(x.token).catch(() => null)]);
    const evm = z.zincirler.filter((c) => !["Arc", "Solana", "Sui", "Aptos"].includes(c));
    satir.replaceChildren(el("div", { yazi: "Trades on: " + z.zincirler.join(", ") }),
      evm.length && ikiz ? el("div", { sinif: "mono yazi--sessiz", yazi: "Twin on " + evm.join(", ") + ": " + ikiz }) : el("span"));
  }).catch(() => { satir.textContent = "Trades on: could not be read now."; });
  return satir;
}

const KOD = `// Accept a game token as in-game payment, with ethers v6. A launch token is a standard ERC-20:
// on Arc use the token address; on an EVM chain where its twin exists, use the twin's address
// (shown on the token's card) with that chain's RPC.
import { ethers } from "ethers";

const TOKEN = "0x...";          // the token (or its twin on the player's chain)
const GAME_WALLET = "0x...";    // where your game receives payments
const ERC20 = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)"
];

// --- In the player's browser: pay 100 tokens for an item ---
const signer = await new ethers.BrowserProvider(window.ethereum).getSigner();
const token = new ethers.Contract(TOKEN, ERC20, signer);
const price = ethers.parseUnits("100", await token.decimals());
const tx = await token.transfer(GAME_WALLET, price);
await tx.wait();
// send tx.hash to your game server

// --- On your game server: check the payment before granting the item ---
const rpc = new ethers.JsonRpcProvider("${ZINCIR.rpc}");   // Arc; use the twin chain's RPC for a twin
async function paid(hash, minAmount) {
  const r = await rpc.getTransactionReceipt(hash);
  if (!r || r.status !== 1) return false;
  const iface = new ethers.Interface(ERC20);
  return r.logs.some((l) => {
    if (l.address.toLowerCase() !== TOKEN.toLowerCase()) return false;
    let e = null; try { e = iface.parseLog(l); } catch {}
    return e && e.name === "Transfer" && e.args.to.toLowerCase() === GAME_WALLET.toLowerCase() && e.args.value >= minAmount;
  });
}
// keep every hash you accepted, so one payment cannot be used twice

// --- Read a player's balance (for example, to unlock holder-only content) ---
const balance = await new ethers.Contract(TOKEN, ERC20, rpc).balanceOf("0xPlayer...");

// --- Or let your own game contract pull the payment ---
// the player approves once; your contract then calls token.transferFrom(player, GAME_WALLET, price)
await (await token.approve("0xYourGameContract...", price)).wait();
`;

function gelistiriciBolumu() {
  return panel("For game developers", el("div", { sinif: "yigin" }, [
    el("p", { yazi: "A game token is a standard ERC-20 token. A game can take it as payment the same way it would take any ERC-20: the player sends it to the game's wallet (transfer), or approves the game's contract, which then pulls the amount (transferFrom). The game confirms the payment from the Transfer event in the transaction receipt, and reads balances with balanceOf." }),
    el("p", { yazi: "Players do not need Arc's gas token to get it: on the token's page they can buy it paying from any of the twelve chains with that chain's own gas token. The token itself lives on Arc and, as its twin, on the chains where the twin has been created (listed on each card above; one twin address shared by the EVM chains)." }),
    kodBlogu(KOD),
    not("There is no ARC PULSE game SDK: the example uses ethers v6 and the standard ERC-20 calls only. Accept a payment only after its receipt is confirmed, and store the hashes you have accepted.", "bilgi"),
  ]));
}

export function ciz() {
  return urunSayfasi(6, { kartEk, sonrasi: [gelistiriciBolumu()] });
}
