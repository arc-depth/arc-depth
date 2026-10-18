"use strict";
/* ===========================================================================
 * dagit-ada-aptos.js — the island gate's Aptos end (aptos/ada-kapisi), wired to BNB
 *
 *   NODE_PATH="C:/Users/omen/araclar/aptossdk/node_modules;C:/arc-launchpad/node_modules" \
 *     node scripts/dagit-ada-aptos.js [--uygula]
 *
 * WHY: the Defter (immutable) routes Solana/Sui/Aptos shares for island
 * holders through Arc, but not the other way round: the BNB vault paying a
 * holder on Aptos had no road (its Haberci has no CCTP). This gives it one:
 * BNB's Haberci treats Aptos as reached through its island gate, the gate
 * sends the order over LayerZero to this Move gate, anyone pays the holder
 * in Aptos USDC and the receipt releases the BNB dollars to the payer.
 *
 * APTOS (the basket account, APTOS_SEPET_PRIVATE_KEY)
 *   publish ada_kapisi ("compatible" like LayerZero's packages; the account's
 *   key is closed when the set is locked), kapi::kur(USDC),
 *   set_peer(BNB) = BNB AdaKapisi, delegate = the account, ULN both ways:
 *   LayerZero Labs + Nethermind on Aptos, 260 confirmations out of Aptos
 *   (the pathway default), 20 in from BNB
 * BNB (deployer; HaberciCctp and AdaKapisi not locked yet, write-once)
 *   HaberciCctp.adaYap(9); AdaKapisi: libraries + ULN for Aptos (BNB's two
 *   DVNs, 20 out / 260 in), ikizEkle(9, 30108, the package address)
 * Every step simulated first; without --uygula nothing is sent.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const KAYIT = path.join(KOK, "dagitim-sepet.json");
const APTOS_CLI = "C:/Users/omen/araclar/aptos/aptos.exe";
const APTOS_USDC = "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";
const BNB_EID = 30102, APTOS_EID = 30108, APTOS = 9;
const ULN_APT = "0xc33752e0220faf79e45385dd73fb28d681dcd9f1569a1480725507c1f3c3aba9";
const APT_DVN = ["0x07ad47ea4f858e7189d2c6e7327f166993e8f884386db9564d732bcff63fe4ff", "0xf3f0a412626edba5ddd3613d91109b241893873ac5479ade231cf0b3130572b5"];
const ONAY_APT = 260, ONAY_BNB = 20;
const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
const ozel = (ad) => { const m = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim() : null; };

/* uln_302 configs_uln::append_uln_config, big-endian (as in aptos-fthm-bagla.js) */
function ulnAptos(onay) {
  const b = [];
  const u64 = Buffer.alloc(8); u64.writeBigUInt64BE(BigInt(onay)); b.push(u64);
  b.push(Buffer.from([0, APT_DVN.length]));
  for (const d of APT_DVN) b.push(Buffer.from(d.slice(2), "hex"));
  b.push(Buffer.from([0, 0, 0, 0]));
  return Buffer.concat(b);
}

(async () => {
  const { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey, MoveVector } = require("@aptos-labs/ts-sdk");
  const ag = new Aptos(new AptosConfig({ network: Network.MAINNET }));
  const hesap = Account.fromPrivateKey({ privateKey: new Ed25519PrivateKey(ozel("APTOS_SEPET_PRIVATE_KEY")) });
  const P = hesap.accountAddress.toString();
  const k = (kayit.adaAptos ||= { paket: P, tx: {} });
  const bnbKapi = kayit.zincir.bsc.AdaKapisi;
  console.log("ADA KAPISI APTOS  " + (UYGULA ? "UYGULA" : "KURU") + "   paket " + P + "   BNB kapi " + bnbKapi + "   bakiye " + (await ag.getAccountAPTAmount({ accountAddress: P })) / 1e8 + " APT");
  const calistir = async (etiket, data, yayin) => {
    if (k.tx[etiket]) { console.log("  " + etiket.padEnd(36) + "tamam"); return true; }
    const tx = await ag.transaction.build.simple({ sender: hesap.accountAddress, data, options: { maxGasAmount: yayin ? 400000 : 20000 } });
    const [sim] = await ag.transaction.simulate.simple({ signerPublicKey: hesap.publicKey, transaction: tx });
    if (!sim.success) throw new Error(etiket + " simulasyon: " + sim.vm_status);
    if (!UYGULA) { console.log("  (kuru) Aptos " + etiket.padEnd(32) + "simulasyon tamam, ~" + (Number(sim.gas_used) * Number(sim.gas_unit_price) / 1e8).toFixed(4) + " APT"); return false; }
    const g = await ag.signAndSubmitTransaction({ signer: hesap, transaction: tx });
    const r = await ag.waitForTransaction({ transactionHash: g.hash });
    if (!r.success) throw new Error(etiket + ": " + r.vm_status);
    console.log("  Aptos " + etiket.padEnd(36) + g.hash);
    k.tx[etiket] = g.hash; yaz();
    return true;
  };

  /* ---- Aptos ---- */
  const moduller = (await ag.getAccountModules({ accountAddress: P })).map((m) => m.abi.name);
  if (!moduller.includes("kapi")) {
    const adlar = fs.readFileSync(path.join(KOK, "aptos", "ada-kapisi", "adlar-fthm-ornegi.txt"), "utf8").trim()
      .split(",").map((x) => x.startsWith("oft=") ? "oft=" + P : x.startsWith("oft_admin=") ? "oft_admin=" + P : x).join(",");
    const cikti = path.join(KOK, "ozel", "yayin-ada-kapisi.json");
    cp.execFileSync(APTOS_CLI, ["move", "build-publish-payload", "--package-dir", path.join(KOK, "aptos", "ada-kapisi"), "--named-addresses", adlar,
      "--json-output-file", cikti, "--assume-yes", "--skip-fetch-latest-git-deps"], { stdio: ["ignore", "ignore", "inherit"] });
    const y = JSON.parse(fs.readFileSync(cikti, "utf8"));
    const [meta, kod] = y.args.map((a) => a.value);
    const ok = await calistir("publish ada_kapisi", { function: "0x1::code::publish_package_txn",
      functionArguments: [MoveVector.U8(Buffer.from(meta.slice(2), "hex")), new MoveVector(kod.map((c) => MoveVector.U8(Buffer.from(c.slice(2), "hex"))))] }, true);
    if (!ok) { console.log("  (kuru) Aptos kur / peer / ULN yayindan sonra simule edilir"); }
  }
  const yayinli = (await ag.getAccountModules({ accountAddress: P })).some((m) => m.abi.name === "kapi");
  if (yayinli) {
    const bnb32 = Array.from(Buffer.from(bnbKapi.slice(2).toLowerCase().padStart(64, "0"), "hex"));
    await calistir("kapi::kur(USDC)", { function: P + "::kapi::kur", functionArguments: [APTOS_USDC] });
    await calistir("set_peer(BNB)", { function: P + "::oapp_core::set_peer", functionArguments: [BNB_EID, bnb32] });
    await calistir("set_delegate", { function: P + "::oapp_core::set_delegate", functionArguments: [P] });
    await calistir("ULN gonderim (BNB)", { function: P + "::oapp_core::set_config", functionArguments: [ULN_APT, BNB_EID, 2, Array.from(ulnAptos(ONAY_APT))] });
    await calistir("ULN alim (BNB)", { function: P + "::oapp_core::set_config", functionArguments: [ULN_APT, BNB_EID, 3, Array.from(ulnAptos(ONAY_BNB))] });
  }

  /* ---- BNB ---- */
  const { JsonRpcProvider, FeeData, Wallet, Contract, AbiCoder } = require("ethers");
  const p = new JsonRpcProvider("https://bsc-dataseed.bnbchain.org", 56, { staticNetwork: true });
  p.getFeeData = async () => new FeeData(BigInt(await p.send("eth_gasPrice", [])), null, null);
  const w = new Wallet(fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim(), p);
  const satir = (() => { const s = fs.readFileSync(path.join(KOK, "contracts", "lz", "ZincirTablosu.sol"), "utf8");
    const m = s.match(/Zincir\(56, 30102, (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), (\d+)\)/);
    return { ep: m[1], send: m[2], recv: m[3], dvn: [m[4], m[5]].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)) }; })();
  const h = new Contract(kayit.zincir.bsc.HaberciCctp, ["function ada(uint32) view returns (bool)", "function adaYap(uint32)"], w);
  const g = new Contract(bnbKapi, ["function ikiz(uint32) view returns (bytes32)", "function ikizEkle(uint32,uint32,bytes32)"], w);
  const e = new Contract(satir.ep, ["function setSendLibrary(address,uint32,address)", "function setReceiveLibrary(address,uint32,address,uint256)", "function setConfig(address,address,(uint32,uint32,bytes)[])"], w);
  const uln = (onay) => AbiCoder.defaultAbiCoder().encode(["tuple(uint64,uint8,uint8,uint8,address[],address[])"], [[onay, 2, 0, 0, satir.dvn, []]]);
  const is = async (etiket, c, f, args) => {
    if (k.tx[etiket]) { console.log("  " + etiket.padEnd(36) + "tamam"); return; }
    await c[f].staticCall(...args);
    if (!UYGULA) { console.log("  (kuru) BNB " + etiket.padEnd(34) + "simulasyon tamam"); return; }
    const m = await (await c[f](...args)).wait();
    console.log("  BNB " + etiket.padEnd(36) + m.hash);
    k.tx[etiket] = m.hash; yaz();
  };
  if (!(await h.ada(APTOS))) await is("Haberci adaYap(Aptos)", h, "adaYap", [APTOS]);
  if ((await g.ikiz(APTOS)) === "0x" + "00".repeat(32)) {
    await is("LZ gonderim kutuphanesi -> Aptos", e, "setSendLibrary", [bnbKapi, APTOS_EID, satir.send]);
    await is("LZ alim kutuphanesi <- Aptos", e, "setReceiveLibrary", [bnbKapi, APTOS_EID, satir.recv, 0]);
    await is("ULN gonderim -> Aptos (" + ONAY_BNB + ")", e, "setConfig", [bnbKapi, satir.send, [[APTOS_EID, 2, uln(ONAY_BNB)]]]);
    await is("ULN alim <- Aptos (" + ONAY_APT + ")", e, "setConfig", [bnbKapi, satir.recv, [[APTOS_EID, 2, uln(ONAY_APT)]]]);
    if (yayinli || UYGULA) await is("AdaKapisi ikiz Aptos", g, "ikizEkle", [APTOS, APTOS_EID, "0x" + P.slice(2).padStart(64, "0")]);
    else console.log("  (kuru) BNB AdaKapisi ikiz Aptos paket yayinlaninca yazilir (bir kez)");
  }
  console.log(UYGULA ? "TAMAM" : "KURU TAMAM");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message).slice(0, 500)); process.exitCode = 1; });
