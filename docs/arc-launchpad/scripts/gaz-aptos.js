"use strict";
/* ===========================================================================
 * gaz-aptos.js — APT for the Aptos deployer, paid from Arc USDC
 *
 *   node scripts/gaz-aptos.js [usdc=6]            # quote + open a shift, send nothing
 *   node scripts/gaz-aptos.js [usdc=6] --uygula   # also send the USDC and wait
 *
 * Measured 14 Oct 2026: relay.link, LI.FI and gas.zip have no APT route,
 * Mayan's Aptos route answers 500, LayerZero's transfer API needs a key and
 * Exolix starts at $49. SideShift has one and takes USDC on Arc directly:
 * a variable-rate shift Arc USDC -> APT (aptos), minimum ~3 USDC, ~40 s.
 * Its API needs an affiliate id, which is the id of the anonymous account
 * the site creates on first visit (nYkWNTFtl, no login, no personal data).
 * Refunds go back to the deployer on Arc.
 * The USDC is sent with the ERC-20 interface of Arc's native USDC
 * (0x3600…, 6 decimals). Record: rapor/gaz-aptos.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract } = require("ethers");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "rapor", "gaz-aptos.json");
const APTOS = "0xc3318acec3eaf067b1865e86c39fb56529ae1cf181663c68750d79f28259da84";
const DAGITICI = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const USDC = "0x3600000000000000000000000000000000000000";
const SS = "https://sideshift.ai/api/v2";
const AFFILIATE = "nYkWNTFtl";
const UYGULA = process.argv.includes("--uygula");
const miktar = Number(process.argv.slice(2).find((a) => /^\d+(\.\d+)?$/.test(a)) || 6);
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const aptBakiye = async () => {
  const r = await fetch("https://api.mainnet.aptoslabs.com/v1/view", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ function: "0x1::coin::balance", type_arguments: ["0x1::aptos_coin::AptosCoin"], arguments: [APTOS] }) }).then((x) => x.json()).catch(() => null);
  return Array.isArray(r) ? Number(r[0]) / 1e8 : 0;
};

(async () => {
  const cift = await fetch(SS + "/pair/usdc-arc/apt-aptos").then((x) => x.json());
  console.log("SIDESHIFT  Arc USDC -> APT  kur " + cift.rate + "  asgari " + cift.min + "  " + miktar + " USDC ~ " + (miktar * Number(cift.rate)).toFixed(3) + " APT");
  if (miktar < Number(cift.min)) throw new Error("asgarinin altinda");
  const s = await fetch(SS + "/shifts/variable", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ settleAddress: APTOS, depositCoin: "USDC", depositNetwork: "arc", settleCoin: "APT", settleNetwork: "aptos",
      refundAddress: DAGITICI, affiliateId: AFFILIATE }) }).then((x) => x.json());
  if (!s.depositAddress) throw new Error("shift acilmadi: " + JSON.stringify(s).slice(0, 200));
  console.log("  shift " + s.id + "  yatirma " + s.depositAddress + "  bitis " + s.expiresAt);
  fs.writeFileSync(KAYIT, JSON.stringify({ shift: s, miktar }, null, 1));
  console.log("  Aptos bakiyesi simdi " + (await aptBakiye()) + " APT");
  if (!UYGULA) { console.log("  (kuru: USDC gonderilmedi)"); return; }

  const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
  const w = new Wallet(pk, new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true }));
  const u = new Contract(USDC, ["function transfer(address,uint256) returns (bool)"], w);
  const t = await u.transfer(s.depositAddress, BigInt(Math.round(miktar * 1e6)));
  const m = await t.wait();
  console.log("  gonderildi " + t.hash + " durum " + m.status);
  for (let i = 0; i < 60; i++) {
    await bekle(10000);
    const d = await fetch(SS + "/shifts/" + s.id).then((x) => x.json()).catch(() => ({}));
    if (d.status && d.status !== "waiting") console.log("  durum " + d.status + (d.settleHash ? "  " + d.settleHash : ""));
    if (d.status === "settled" || d.status === "refunded") break;
  }
  console.log("  Aptos bakiyesi " + (await aptBakiye()) + " APT");
})().catch((e) => { console.error("HATA " + (e.message || e)); process.exit(1); });
