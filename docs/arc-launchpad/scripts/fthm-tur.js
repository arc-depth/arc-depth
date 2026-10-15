"use strict";
/* ===========================================================================
 * fthm-tur.js — a real FTHM round trip before the bridge owners are burned
 *
 *   node scripts/fthm-tur.js <adim> [--uygula]
 *     al        buy ~1.5 USDC of FTHM on Arc's FTHM pool (ops money, not
 *               the founder's share), through a one-off v4 swapper
 *     base      Arc FTHMOFTAdapter -> Base twin (what was bought, exactly)
 *     uzak      Base gate -> Sui (half) and -> Aptos (half)
 *     durum     balances on every leg
 *
 * Why: the Base gate (Sui + Aptos) and the Arc adapter are the last owned
 * contracts in the FTHM network. Their configuration is frozen by burning
 * the owner, which cannot be undone — so a real transfer has to arrive on
 * every path first. The FTHM moved here is the amount bought in step "al";
 * the founder's share is not touched. Record: rapor/fthm-tur.json.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const { JsonRpcProvider, Wallet, Contract, ContractFactory, zeroPadValue } = require("ethers");
const { Options } = require("@layerzerolabs/lz-v2-utilities");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "rapor", "fthm-tur.json");
const UYGULA = process.argv.includes("--uygula");
const ADIM = process.argv[2];
const F = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const SUI = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-sui-fthm.json"), "utf8"));
const APT = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-aptos-fthm.json"), "utf8"));
const ADAPTOR = "0x6e591AfAf47A0Ff6aB26a4F5c077De7715C34bf0";
const IKIZ = "0x933F764D62ff7C0D86626972003f6c5138B9eBdd";
const BEN = "0x89189C84DC95d0520AEeC9c8cF3BA5B9d42611D0";
const SUI_ADR = "0x9d547e639e4dad7b98f1ec9a6e8d684f42dd289fb0875f08a2ed8fc77fe7f078";
const APT_ADR = "0xc3318acec3eaf067b1865e86c39fb56529ae1cf181663c68750d79f28259da84";
const ERC = ["function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)"];
const OFT = ["function quoteSend((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),bool) view returns ((uint256,uint256))",
  "function send((uint32,bytes32,uint256,uint256,bytes,bytes,bytes),(uint256,uint256),address) payable returns ((bytes32,uint64,(uint256,uint256)),(uint256,uint256))"];
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : {};
const yaz = () => fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1));
const pk = fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim();
const arc = new Wallet(pk, new JsonRpcProvider("https://rpc.mainnet.arc.io", 5042, { staticNetwork: true }));
const base = new Wallet(pk, new JsonRpcProvider("https://mainnet.base.org", 8453, { staticNetwork: true }));

async function gonder(w, etiket, tx) {
  if (!UYGULA) { console.log("  (kuru) " + etiket + "  gaz " + (await w.provider.estimateGas({ from: w.address, ...tx }).catch((e) => "? " + (e.shortMessage || e.message).slice(0, 80)))); return null; }
  const t = await w.sendTransaction(tx);
  let m = null; while (!m) { await bekle(1500); m = await w.provider.getTransactionReceipt(t.hash).catch(() => null); }
  console.log("  " + etiket.padEnd(30) + t.hash + " durum " + m.status);
  if (m.status !== 1) throw new Error(etiket);
  (k.tx = k.tx || {})[etiket] = t.hash; yaz();
  return m;
}

async function lzBekle(hash, etiket) {
  for (let i = 0; i < 120; i++) {
    const r = await fetch("https://scan.layerzero-api.com/v1/messages/tx/" + hash).then((x) => x.json()).catch(() => null);
    const m = r && r.data && r.data[0];
    const d = m && m.status && m.status.name;
    if (i % 6 === 0) console.log("  " + etiket + " LZ durum " + d);
    if (d === "DELIVERED") return m;
    if (d === "FAILED" || d === "BLOCKED") throw new Error(etiket + " " + d);
    await bekle(10000);
  }
  throw new Error(etiket + " zaman asimi");
}

(async () => {
  const fthm = new Contract(F.token, ERC, arc);
  if (ADIM === "al") {
    /* the pool: USDC (0x36..) < FTHM (0x8c..), so USDC is currency0 */
    const key = [F.usdc, F.token, F.fee, F.spacing, F.hook];
    const art = JSON.parse(fs.readFileSync(path.join(KOK, "nesil2-test", "out", "V4Takasci.sol", "V4Takasci.json"), "utf8"));
    if (!k.takasci) {
      const tx = await new ContractFactory(art.abi, art.bytecode.object, arc).getDeployTransaction(F.poolManager);
      const m = await gonder(arc, "V4Takasci dagit", tx);
      if (!m) return;
      k.takasci = m.contractAddress; yaz();
    }
    const usdc = new Contract(F.usdc, ERC, arc);
    const t = new Contract(k.takasci, art.abi, arc);
    if ((await usdc.allowance(BEN, k.takasci)) < 1_500_000n) await gonder(arc, "USDC onay", await usdc.approve.populateTransaction(k.takasci, 1_500_000n));
    const once = await fthm.balanceOf(BEN);
    await gonder(arc, "FTHM al (1,5 USDC)", await t.takas.populateTransaction(key, true, 1_500_000n));
    if (UYGULA) { k.alinan = String((await fthm.balanceOf(BEN)) - once); yaz(); console.log("  alinan FTHM " + Number(k.alinan) / 1e18); }
  }

  if (ADIM === "base") {
    const miktar = BigInt(k.alinan);
    const a = new Contract(ADAPTOR, OFT, arc);
    const p = [30184, zeroPadValue(BEN, 32), miktar, miktar * 99n / 100n, "0x", "0x", "0x"];
    const [ucret] = await a.quoteSend(p, false);
    console.log("  Arc -> Base ucret " + Number(ucret) / 1e18 + " USDC");
    if ((await fthm.allowance(BEN, ADAPTOR)) < miktar) await gonder(arc, "FTHM adaptor onay", await fthm.approve.populateTransaction(ADAPTOR, miktar));
    const m = await gonder(arc, "Arc->Base gonder", { ...(await a.send.populateTransaction(p, [ucret, 0], BEN)), value: ucret });
    if (m) { await lzBekle(m.hash, "Arc->Base"); console.log("  Base ikiz bakiyesi " + Number(await new Contract(IKIZ, ERC, base).balanceOf(BEN)) / 1e18); }
  }

  if (ADIM === "uzak") {
    const ikiz = new Contract(IKIZ, ERC, base);
    const toplam = await ikiz.balanceOf(BEN);
    const g = new Contract(SUI.baseGecit, OFT, base);
    if ((await ikiz.allowance(BEN, SUI.baseGecit)) < toplam) await gonder(base, "ikiz gecit onay", await ikiz.approve.populateTransaction(SUI.baseGecit, toplam));
    /* shared decimals 6: amounts are rounded down to 1e12 units by the OFT */
    const yarim = (toplam / 2n) / 10n ** 12n * 10n ** 12n;
    for (const [eid, alici, ad] of [[30378, SUI_ADR, "Sui"], [30108, APT_ADR, "Aptos"]]) {
      const p = [eid, alici, yarim, yarim * 99n / 100n, "0x", "0x", "0x"];
      const [ucret] = await g.quoteSend(p, false);
      console.log("  Base -> " + ad + " ucret " + Number(ucret) / 1e18 + " ETH");
      const m = await gonder(base, "Base->" + ad, { ...(await g.send.populateTransaction(p, [ucret, 0], BEN)), value: ucret });
      if (m) await lzBekle(m.hash, "Base->" + ad);
    }
  }

  if (ADIM === "durum") {
    console.log("  Arc FTHM (alinan) " + Number(k.alinan || 0) / 1e18);
    console.log("  Base ikiz " + Number(await new Contract(IKIZ, ERC, base).balanceOf(BEN)) / 1e18 + "   gecit kilitli " + Number(await new Contract(IKIZ, ERC, base).balanceOf(SUI.baseGecit)) / 1e18);
  }
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message) + " " + JSON.stringify(e.error || e.info || {}).slice(0, 300)); process.exit(1); });
