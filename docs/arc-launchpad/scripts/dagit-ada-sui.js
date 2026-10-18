"use strict";
/* ===========================================================================
 * dagit-ada-sui.js — the island gate's Sui end (sui/ada-kapisi), wired to BNB
 *
 *   NODE_PATH="C:/Users/omen/araclar/suisdk/node_modules;C:/arc-launchpad/node_modules" \
 *     node scripts/dagit-ada-sui.js [--uygula]
 *
 * WHY: as dagit-ada-aptos.js — the BNB vault paying a holder on Sui had no
 * road. BNB's Haberci treats Sui as reached through its island gate; the
 * order goes over LayerZero to this gate, anyone pays the holder in Sui USDC,
 * the receipt releases the BNB dollars to the payer.
 *
 * SUI (deployer SUI_PRIVATE_KEY)
 *   1 publish sui/ada-kapisi: init makes the OApp (shared), the Kapi
 *     (shared) and hands the AdminCap and UpgradeCap to the deployer (both
 *     dealt with when the set is locked)
 *   2 kapi::kaydet  registers with the endpoint: lz_receive_info tells the
 *     executor to call kapi::lz_receive(kapi, oapp, call)
 *   3 set_peer(BNB) = BNB AdaKapisi; ULN both ways: LayerZero Labs +
 *     Nethermind on Sui, 5 confirmations out of Sui (as FTHM), 20 in from BNB
 * BNB (deployer): HaberciCctp.adaYap(8); AdaKapisi libraries + ULN for Sui
 *   (BNB's two DVNs, 20 out / 5 in), ikizEkle(8, 30378, the package address —
 *   a package CallCap's LayerZero identity)
 * Without --uygula: the publish is dry-run on mainnet; later steps need it.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const KOK = path.join(__dirname, "..");
const UYGULA = process.argv.includes("--uygula");
const KAYIT = path.join(KOK, "dagitim-sepet.json");
const SUI_CLI = "C:/Users/omen/araclar/sui/sui.exe";
const SUI_RPC = "https://sui-rpc.publicnode.com";
const BNB_EID = 30102, SUI_EID = 30378, SUI = 8;
const SUI_DVN = ["0x0c12321ebe562b8fb8a74e6d29f144ea199a8f31a4cea3a417ce72477f6dfebb", "0x52aa129049de845353484868d1be6e2df6878b0ed2213d94d3c827309aeae685"]; // Nethermind, LZ Labs (sorted)
const ONAY_SUI = 5, ONAY_BNB = 20;
const kayit = JSON.parse(fs.readFileSync(KAYIT, "utf8"));
const yaz = () => { if (UYGULA) fs.writeFileSync(KAYIT, JSON.stringify(kayit, null, 1)); };
const ozel = (ad) => { const m = fs.readFileSync(path.join(KOK, ".env"), "utf8").match(new RegExp("^" + ad + "\\s*=\\s*(.+)$", "m")); return m ? m[1].trim() : null; };

(async () => {
  const { SuiJsonRpcClient } = require("@mysten/sui/jsonRpc");
  const { Transaction } = require("@mysten/sui/transactions");
  const { Ed25519Keypair } = require("@mysten/sui/keypairs/ed25519");
  const { SDK, OAppUlnConfigBcs } = require("@layerzerolabs/lz-sui-sdk-v2");
  const client = new SuiJsonRpcClient({ url: SUI_RPC, network: "mainnet" });
  const sdk = new SDK({ client });
  const imzaci = Ed25519Keypair.fromSecretKey(Buffer.from(ozel("SUI_PRIVATE_KEY"), "hex"));
  const ben = imzaci.getPublicKey().toSuiAddress();
  const k = (kayit.adaSui ||= { tx: {} });
  const bnbKapi = kayit.zincir.bsc.AdaKapisi;
  console.log("ADA KAPISI SUI  " + (UYGULA ? "UYGULA" : "KURU") + "   " + ben + "   bakiye " + Number((await client.getBalance({ owner: ben })).totalBalance) / 1e9 + " SUI");
  const calistir = async (etiket, tx) => {
    if (k.tx[etiket]) { console.log("  " + etiket.padEnd(34) + "tamam"); return null; }
    tx.setSender(ben);
    const sim = await client.dryRunTransactionBlock({ transactionBlock: await tx.build({ client }) });
    if (sim.effects.status.status !== "success") throw new Error("Sui " + etiket + " simulasyon: " + JSON.stringify(sim.effects.status));
    const g = sim.effects.gasUsed;
    if (!UYGULA) { console.log("  (kuru) Sui " + etiket.padEnd(30) + "simulasyon tamam, ~" + ((Number(g.computationCost) + Number(g.storageCost) - Number(g.storageRebate)) / 1e9).toFixed(4) + " SUI"); return false; }
    const r = await client.signAndExecuteTransaction({ signer: imzaci, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
    await client.waitForTransaction({ digest: r.digest });
    if (r.effects.status.status !== "success") throw new Error("Sui " + etiket);
    console.log("  Sui " + etiket.padEnd(34) + r.digest);
    k.tx[etiket] = r.digest; yaz();
    return r;
  };

  /* 1 publish */
  if (!k.paket) {
    const cikti = cp.execFileSync(SUI_CLI, ["move", "build", "--dump-bytecode-as-base64", "-e", "mainnet", "--path", path.join(KOK, "sui", "ada-kapisi")],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20, env: { ...process.env, SUI_CONFIG_DIR: path.join(KOK, "ozel", "sui-ana-cfg") } });
    const { modules, dependencies } = JSON.parse(cikti.slice(cikti.indexOf("{")));
    const tx = new Transaction();
    tx.transferObjects([tx.publish({ modules, dependencies })], ben);
    const r = await calistir("publish ada-kapisi", tx);
    if (!r) { console.log("  (kuru) kayit, eş, ULN ve BNB adimlari yayindan sonra simule edilir"); return; }
    const oc = r.objectChanges;
    k.paket = oc.find((o) => o.type === "published").packageId;
    k.kapi = oc.find((o) => o.type === "created" && o.objectType.endsWith("::kapi::Kapi")).objectId;
    k.oapp = oc.find((o) => o.type === "created" && o.objectType.endsWith("::oapp::OApp")).objectId;
    k.adminCap = oc.find((o) => o.type === "created" && o.objectType.endsWith("::oapp::AdminCap")).objectId;
    k.upgradeCap = oc.find((o) => o.type === "created" && o.objectType.endsWith("::package::UpgradeCap")).objectId;
    yaz();
  }
  console.log("  paket " + k.paket + "  Kapi " + k.kapi + "  OApp " + k.oapp);

  /* 2 register with the endpoint */
  {
    const tx = new Transaction();
    tx.moveCall({ target: k.paket + "::kapi::kaydet", arguments: [tx.object(k.kapi), tx.object(k.oapp), tx.object(k.adminCap), tx.object(sdk.getEndpoint().objects.endpointV2)] });
    await calistir("kapi::kaydet (uc nokta)", tx);
  }

  /* 3 peer BNB + ULN */
  {
    const oapp = sdk.getOApp(k.paket);
    const tx = new Transaction();
    await oapp.setPeerMoveCall(tx, BNB_EID, Uint8Array.from(Buffer.from(bnbKapi.slice(2).toLowerCase().padStart(64, "0"), "hex")));
    const lib = await sdk.getEndpoint().getDefaultSendLibrary(BNB_EID);
    const uS = (n) => OAppUlnConfigBcs.serialize({ use_default_confirmations: false, use_default_required_dvns: false, use_default_optional_dvns: false,
      uln_config: { confirmations: n, required_dvns: SUI_DVN, optional_dvns: [], optional_dvn_threshold: 0 } }).toBytes();
    for (const [tur, onay] of [[2, ONAY_SUI], [3, ONAY_BNB]]) sdk.getUln302().setConfigMoveCall(tx, await oapp.setConfigMoveCall(tx, lib, BNB_EID, tur, uS(onay)));
    await calistir("set_peer(BNB) + ULN", tx);
  }

  /* 4 BNB */
  const { JsonRpcProvider, FeeData, Wallet, Contract, AbiCoder } = require("ethers");
  const p = new JsonRpcProvider("https://bsc-dataseed.bnbchain.org", 56, { staticNetwork: true });
  p.getFeeData = async () => new FeeData(BigInt(await p.send("eth_gasPrice", [])), null, null);
  const w = new Wallet(fs.readFileSync("C:/bot/.env", "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m)[1].trim(), p);
  const s = fs.readFileSync(path.join(KOK, "contracts", "lz", "ZincirTablosu.sol"), "utf8");
  const m = s.match(/Zincir\(56, 30102, (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}),\s*(0x[0-9a-fA-F]{40}), (0x[0-9a-fA-F]{40}), (\d+)\)/);
  const satir = { ep: m[1], send: m[2], recv: m[3], dvn: [m[4], m[5]].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)) };
  const h = new Contract(kayit.zincir.bsc.HaberciCctp, ["function ada(uint32) view returns (bool)", "function adaYap(uint32)"], w);
  const g = new Contract(bnbKapi, ["function ikiz(uint32) view returns (bytes32)", "function ikizEkle(uint32,uint32,bytes32)"], w);
  const e = new Contract(satir.ep, ["function setSendLibrary(address,uint32,address)", "function setReceiveLibrary(address,uint32,address,uint256)", "function setConfig(address,address,(uint32,uint32,bytes)[])"], w);
  const uln = (onay) => AbiCoder.defaultAbiCoder().encode(["tuple(uint64,uint8,uint8,uint8,address[],address[])"], [[onay, 2, 0, 0, satir.dvn, []]]);
  const is = async (etiket, c, f, args) => {
    if (k.tx[etiket]) { console.log("  " + etiket.padEnd(34) + "tamam"); return; }
    await c[f].staticCall(...args);
    if (!UYGULA) { console.log("  (kuru) BNB " + etiket.padEnd(30) + "simulasyon tamam"); return; }
    const r = await (await c[f](...args)).wait();
    console.log("  BNB " + etiket.padEnd(34) + r.hash);
    k.tx[etiket] = r.hash; yaz();
  };
  if (!(await h.ada(SUI))) await is("Haberci adaYap(Sui)", h, "adaYap", [SUI]);
  if ((await g.ikiz(SUI)) === "0x" + "00".repeat(32)) {
    await is("LZ gonderim kutuphanesi -> Sui", e, "setSendLibrary", [bnbKapi, SUI_EID, satir.send]);
    await is("LZ alim kutuphanesi <- Sui", e, "setReceiveLibrary", [bnbKapi, SUI_EID, satir.recv, 0]);
    await is("ULN gonderim -> Sui (" + ONAY_BNB + ")", e, "setConfig", [bnbKapi, satir.send, [[SUI_EID, 2, uln(ONAY_BNB)]]]);
    await is("ULN alim <- Sui (" + ONAY_SUI + ")", e, "setConfig", [bnbKapi, satir.recv, [[SUI_EID, 2, uln(ONAY_SUI)]]]);
    await is("AdaKapisi ikiz Sui", g, "ikizEkle", [SUI, SUI_EID, "0x" + k.paket.slice(2).padStart(64, "0")]);
  }
  console.log(UYGULA ? "TAMAM" : "KURU TAMAM");
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message).slice(0, 500)); process.exitCode = 1; });
