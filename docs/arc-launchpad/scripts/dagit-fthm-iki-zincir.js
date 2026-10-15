"use strict";
/* ===========================================================================
 * dagit-fthm-iki-zincir.js — FTHM on two chains: bridge, price, gates
 *
 *   node scripts/dagit-fthm-iki-zincir.js            # plan and price, sends nothing
 *   node scripts/dagit-fthm-iki-zincir.js --uygula   # deploy + wire (resumable)
 *   node scripts/dagit-fthm-iki-zincir.js --yak      # burn ownership (after a round trip)
 *
 * ARC (USDC is gas)
 *   FTHMOFTAdapter   locks FTHM that goes to Robinhood, releases what comes back
 *   FiyatElcisi      sends the Arc FTHM pool's price to Robinhood
 *   FTHMKapi         Arc gate: sell Robinhood FTHM here, or buy here and receive there
 * ROBINHOOD (ETH is gas)
 *   FTHMOFT          FTHM on Robinhood: minted only against FTHM locked on Arc
 *   TekYonluAcici    opens the FTHM/USDG pool later as a locked single-sided ladder
 *   FTHMFarkHook     the pool's hook: a trade that captures the gap to the Arc
 *                    price pays exactly that gap, into the pool's depth
 *   FTHMKapi         Robinhood gate, the mirror of the Arc one
 *
 * WHY THE DVNs ARE SET HERE
 *   Measured on chain on 14 Oct 2026: the LayerZero default for the
 *   Arc <-> Robinhood pathway is LZDeadDVN — with defaults no message would
 *   ever verify. Every OApp here is configured with two required DVNs that
 *   both quote the pathway in both directions: LayerZero Labs and
 *   Nethermind. Both must sign or nothing passes.
 *
 * OWNERSHIP
 *   Wiring needs an owner. `--yak` burns it on the four OApps (delegate to
 *   0xdead, owner to zero) and is a separate step on purpose: the DVN config
 *   is frozen with it, so it runs only after a real round trip has shown the
 *   configuration delivers. The gates have no owner at all; their one-time
 *   `karsiyiBagla` is spent during wiring.
 *
 * Every step reads the chain first and is skipped if already done, so a run
 * that stops can simply be started again.
 * =========================================================================== */
const fs = require("fs");
const path = require("path");
const {
  JsonRpcProvider, Wallet, Contract, ContractFactory, AbiCoder, keccak256,
  getCreateAddress, getCreate2Address, zeroPadValue, solidityPacked
} = require("ethers");

const KOK = path.join(__dirname, "..");
const KAYIT = path.join(KOK, "dagitim-fthm-iki-zincir.json");
const B = (p) => JSON.parse(fs.readFileSync(path.join(KOK, "build", p + ".json"), "utf8"));
const coder = AbiCoder.defaultAbiCoder();
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));

const EP = "0x6f475642a6e85809b1c36fa62763669b1b48dd5b";
const PM = "0x8366a39CC670B4001A1121B8F6A443A643e40951";
const CREATE2_FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SEND_LIB = "0xC39161c743D0307EB9BCc9FEF03eeb9Dc4802de7";
const RECV_LIB = "0xe1844c5D63a9543023008D332Bd3d2e6f1FE1043";
const fathom = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));

const Z = {
  arc: { ad: "Arc", rpc: "https://rpc.mainnet.arc.io", chainId: 5042, eid: 30417, gaz: "USDC",
    dvn: ["0x9e0e95ede70f680f74480b510ff9f45c70e3da80", "0xa2447e5b58d357c49bf74b50b14421e6a100e525"] }, // Nethermind, LZ Labs
  rh: { ad: "Robinhood", rpc: "https://rpc.mainnet.chain.robinhood.com", chainId: 4663, eid: 30416, gaz: "ETH",
    dvn: ["0x0ffe02df012299a370d5dd69298a5826eacafdf8", "0xd01ae6905d48315f7be10c7330aecf8360ef5b12"] }, // Nethermind, LZ Labs
};
/* Block confirmations before the DVNs sign: Arc has deterministic finality;
   Robinhood is a rollup, so its side waits longer. Sender and receiver of a
   direction must agree, so each direction has one number. */
const ONAY = { arcdanRh: 5, rhdanArc: 20 };
const FTHM = fathom.token;
const USDC = fathom.usdc;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const DEPTH_HOOK = fathom.hook;
const AZAMI_YAS = 86400;        // a reference older than a day charges nothing
const TAVAN_PPM = 500_000;      // the gap fee never exceeds 50%
const HOOK_BITLERI = 0xC4;      // beforeSwap | afterSwap | afterSwapReturnDelta

const UYGULA = process.argv.includes("--uygula");
const YAK = process.argv.includes("--yak");

function ozelAnahtar() {
  if (process.env.TRADER_PRIVATE_KEY) return process.env.TRADER_PRIVATE_KEY.trim();
  for (const f of [path.join("C:", "bot", ".env"), path.join(KOK, ".env")]) {
    try {
      const m = fs.readFileSync(f, "utf8").match(/^TRADER_PRIVATE_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim();
    } catch (e) { /* next */ }
  }
  return null;
}

/* LayerZero type-3 executor options */
const secenek = {
  alim: (gaz) => solidityPacked(["uint8", "uint16", "uint8", "uint128"], [1, 17, 1, gaz]),
  bileske: (gaz) => solidityPacked(["uint8", "uint16", "uint8", "uint16", "uint128"], [1, 19, 3, 0, gaz]),
};
const tip3 = (...p) => "0x0003" + p.map((x) => x.slice(2)).join("");

const ULN = "tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)";
function ulnBayt(onay, dvnler) {
  const s = [...dvnler].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  return coder.encode([ULN], [[onay, s.length, 0, 0, s, []]]);
}

const EP_ABI = [
  "function setConfig(address,address,tuple(uint32 eid,uint32 configType,bytes config)[])",
  "function getConfig(address,address,uint32,uint32) view returns (bytes)",
  "function delegates(address) view returns (address)",
];
const OAPP_ABI = [
  "function peers(uint32) view returns (bytes32)", "function setPeer(uint32,bytes32)", "function owner() view returns (address)",
  "function sahipligiYak()", "function enforcedOptions(uint32,uint16) view returns (bytes)",
  "function setEnforcedOptions(tuple(uint32 eid,uint16 msgType,bytes options)[])",
  "function quoteSend(tuple(uint32 dstEid,bytes32 to,uint256 amountLD,uint256 minAmountLD,bytes extraOptions,bytes composeMsg,bytes oftCmd),bool) view returns (tuple(uint256 nativeFee,uint256 lzTokenFee))",
];

async function israr(f) {
  for (let d = 0; ; d++) {
    try { return await f(); }
    catch (e) {
      const m = (e.shortMessage || e.message || "") + JSON.stringify(e.info || {});
      if (d > 6 || !/rate limit|too many|timeout|503|502|ECONNRESET|fetch failed|nonce/i.test(m)) throw e;
      await bekle(3000 * (d + 1));
    }
  }
}

(async () => {
  console.log("FTHM — iki zincir dagitimi  (" + (YAK ? "SAHIPLIK YAKMA" : UYGULA ? "UYGULA — GERCEK ISLEM" : "KURU CALISMA") + ")");
  const pk = ozelAnahtar();
  if (!pk) { console.log("TRADER_PRIVATE_KEY bulunamadi."); process.exit(1); }
  for (const z of Object.values(Z)) {
    z.p = new JsonRpcProvider(z.rpc, z.chainId, { staticNetwork: true });
    z.w = new Wallet(pk, z.p);
  }
  const D = Z.arc.w.address;
  const k = fs.existsSync(KAYIT) ? JSON.parse(fs.readFileSync(KAYIT, "utf8")) : { arc: {}, rh: {} };
  const yaz = () => fs.writeFileSync(KAYIT, JSON.stringify(k, null, 1));
  const kodVar = async (z, a) => !!a && (await israr(() => z.p.getCode(a))).length > 2;

  /* the Arc pool the gate and the price messenger point at */
  const arcAnahtar = coder.encode(["address", "address", "uint24", "int24", "address"], [USDC, FTHM, 0, 60, DEPTH_HOOK]);
  const arcHavuz = keccak256(arcAnahtar);
  if (arcHavuz.toLowerCase() !== fathom.havuzId.toLowerCase()) { console.log("Arc havuz kimligi tutmuyor: " + arcHavuz); process.exit(1); }
  console.log("  Arc FTHM havuzu " + arcHavuz + " (kayitla ayni)");

  const baslangic = {};
  for (const [n, z] of Object.entries(Z)) {
    baslangic[n] = await israr(() => z.p.getBalance(D));
    console.log("  " + z.ad.padEnd(10) + "bakiye " + (Number(baslangic[n]) / 1e18).toFixed(6) + " " + z.gaz);
  }

  async function gonder(z, ad, tx) {
    if (!UYGULA && !YAK) { console.log("     (kuru) " + ad); return null; }
    const r = await israr(() => z.w.sendTransaction(tx));
    /* Receipts are polled by hand: ethers' own wait() gives up on the
       first rate-limit answer, and Arc's RPC gives plenty of those. */
    let m = null;
    while (!m) { await bekle(1500); m = await israr(() => z.p.getTransactionReceipt(r.hash)); }
    if (m.status !== 1) throw new Error(ad + " basarisiz: " + r.hash);
    console.log("     " + ad + "  " + r.hash + "  gaz " + m.gasUsed);
    return m;
  }
  const kuruSayac = {};
  async function kur(z, n, ad, args, opts = {}) {
    if (await kodVar(z, k[n][ad])) { console.log("  " + ad.padEnd(16) + k[n][ad] + "  (zincirde)"); return k[n][ad]; }
    const f = new ContractFactory(B(ad).abi, B(ad).bytecode, z.w);
    const tx = await f.getDeployTransaction(...args);
    if (!UYGULA) {
      /* In a dry run the earlier contracts do not exist yet, so a
         constructor that reads one (the gate asks the OFT for its token)
         cannot be estimated; that is reported, not guessed. */
      let g;
      try { g = "gaz " + (await israr(() => z.p.estimateGas({ from: D, data: tx.data }))); }
      catch (e) { g = "gaz olculemedi: kurucusu henuz olmayan bir kontrati okuyor"; }
      console.log("  " + ad.padEnd(16) + "(kuru) " + g);
      if (!kuruSayac[n]) kuruSayac[n] = await israr(() => z.p.getTransactionCount(D, "pending"));
      return opts.tahmin || getCreateAddress({ from: D, nonce: kuruSayac[n]++ });
    }
    if (opts.nonce !== undefined) tx.nonce = opts.nonce;
    const m = await gonder(z, ad, tx);
    k[n][ad] = m.contractAddress; yaz();
    if (opts.tahmin && m.contractAddress.toLowerCase() !== opts.tahmin.toLowerCase()) throw new Error(ad + " beklenen adreste degil");
    console.log("  " + ad.padEnd(16) + m.contractAddress);
    return m.contractAddress;
  }

  if (!YAK) {
    /* ---------------------------------------------------------- Arc */
    console.log("\nARC");
    const adapter = await kur(Z.arc, "arc", "FTHMOFTAdapter", [FTHM, EP, D]);
    const elci = await kur(Z.arc, "arc", "FiyatElcisi", [EP, D, PM, arcHavuz, false, Z.rh.eid]);
    const kapiArc = await kur(Z.arc, "arc", "FTHMKapi", [PM, EP, adapter, USDC, 0, 60, DEPTH_HOOK, Z.rh.eid, D]);

    /* ---------------------------------------------------- Robinhood */
    console.log("\nROBINHOOD");
    const oft = await kur(Z.rh, "rh", "FTHMOFT", [EP, D]);
    /* The opener and the hook name each other: the opener is placed by
       nonce, the hook by a mined CREATE2 salt over an init code that
       already contains the opener's address. */
    let acici = k.rh.TekYonluAcici, hook = k.rh.FTHMFarkHook, salt = k.rh.hookSalt;
    let aciciNonce;
    if (!(await kodVar(Z.rh, acici))) {
      aciciNonce = await israr(() => Z.rh.p.getTransactionCount(D, "pending"));
      acici = getCreateAddress({ from: D, nonce: aciciNonce });
      const init = B("FTHMFarkHook").bytecode + coder.encode(
        ["address", "address", "address", "address", "address", "address", "uint64", "uint24"],
        [EP, D, PM, oft, USDG, acici, AZAMI_YAS, TAVAN_PPM]).slice(2);
      const h = keccak256(init);
      for (let i = 0; ; i++) {
        const s = "0x" + i.toString(16).padStart(64, "0");
        const a = getCreate2Address(CREATE2_FACTORY, s, h);
        if ((parseInt(a.slice(-4), 16) & 0x3FFF) === HOOK_BITLERI) { salt = s; hook = a; break; }
      }
      k.rh.hookSalt = salt; k.rh.hookInit = h;
      if (UYGULA) { k.rh.aciciTahmin = acici; k.rh.FTHMFarkHookTahmin = hook; yaz(); }
    }
    console.log("  hook adresi     " + hook + "  (izin bitleri 0x" + (parseInt(hook.slice(-4), 16) & 0x3FFF).toString(16) + ")");
    acici = await kur(Z.rh, "rh", "TekYonluAcici", [PM, oft, USDG, hook, 0, 60, D], { nonce: aciciNonce, tahmin: acici });
    if (await kodVar(Z.rh, hook)) {
      console.log("  FTHMFarkHook    " + hook + "  (zincirde)");
    } else {
      const init = B("FTHMFarkHook").bytecode + coder.encode(
        ["address", "address", "address", "address", "address", "address", "uint64", "uint24"],
        [EP, D, PM, oft, USDG, acici, AZAMI_YAS, TAVAN_PPM]).slice(2);
      if (UYGULA) {
        await gonder(Z.rh, "FTHMFarkHook (CREATE2)", { to: CREATE2_FACTORY, data: salt + init.slice(2) });
        if (!(await kodVar(Z.rh, hook))) throw new Error("hook beklenen adreste yok");
        k.rh.FTHMFarkHook = hook; yaz();
        console.log("  FTHMFarkHook    " + hook);
      } else {
        const g = await israr(() => Z.rh.p.estimateGas({ from: D, to: CREATE2_FACTORY, data: salt + init.slice(2) }));
        console.log("  FTHMFarkHook    (kuru) gaz " + g);
      }
    }
    const kapiRh = await kur(Z.rh, "rh", "FTHMKapi", [PM, EP, oft, USDG, 0, 60, hook, Z.arc.eid, D]);

    if (!UYGULA) { console.log("\nKURU CALISMA BITTI — hicbir islem gonderilmedi."); process.exit(0); }

    /* --------------------------------------------------------- wiring */
    console.log("\nBAGLAMA");
    const b32 = (a) => zeroPadValue(a, 32).toLowerCase();
    const cifter = [
      [Z.arc, adapter, Z.rh.eid, oft], [Z.rh, oft, Z.arc.eid, adapter],
      [Z.arc, elci, Z.rh.eid, hook], [Z.rh, hook, Z.arc.eid, elci],
    ];
    for (const [z, o, eid, karsi] of cifter) {
      const c = new Contract(o, OAPP_ABI, z.w);
      if ((await israr(() => c.peers(eid))).toLowerCase() === b32(karsi)) { console.log("  peer " + o.slice(0, 10) + " -> " + eid + "  (tamam)"); continue; }
      await gonder(z, "setPeer " + o.slice(0, 10) + " -> " + eid, await c.setPeer.populateTransaction(eid, b32(karsi)));
    }

    for (const [z, o, eid] of [[Z.arc, adapter, Z.rh.eid], [Z.arc, elci, Z.rh.eid], [Z.rh, oft, Z.arc.eid], [Z.rh, hook, Z.arc.eid]]) {
      const ep = new Contract(EP, EP_ABI, z.w);
      const gidis = z === Z.arc ? ONAY.arcdanRh : ONAY.rhdanArc;
      const gelis = z === Z.arc ? ONAY.rhdanArc : ONAY.arcdanRh;
      for (const [lib, onay] of [[SEND_LIB, gidis], [RECV_LIB, gelis]]) {
        const istenen = ulnBayt(onay, z.dvn);
        const simdi = await israr(() => ep.getConfig(o, lib, eid, 2));
        if (simdi.toLowerCase() === istenen.toLowerCase()) { console.log("  DVN " + o.slice(0, 10) + (lib === SEND_LIB ? " gonderim" : " alim") + "  (tamam)"); continue; }
        await gonder(z, "DVN " + o.slice(0, 10) + (lib === SEND_LIB ? " gonderim" : " alim") + " onay " + onay,
          await ep.setConfig.populateTransaction(o, lib, [{ eid, configType: 2, config: istenen }]));
      }
    }

    /* Enforced gas: a plain transfer needs only lzReceive; a transfer that
       sells on arrival also needs the compose call, which swaps on v4. */
    for (const [z, o, eid] of [[Z.arc, adapter, Z.rh.eid], [Z.rh, oft, Z.arc.eid]]) {
      const c = new Contract(o, OAPP_ABI, z.w);
      const istenen = [
        { eid, msgType: 1, options: tip3(secenek.alim(100_000)) },
        { eid, msgType: 2, options: tip3(secenek.alim(150_000), secenek.bileske(500_000)) },
      ];
      const s1 = await israr(() => c.enforcedOptions(eid, 1));
      const s2 = await israr(() => c.enforcedOptions(eid, 2));
      if (s1.toLowerCase() === istenen[0].options.toLowerCase() && s2.toLowerCase() === istenen[1].options.toLowerCase()) {
        console.log("  zorunlu gaz " + o.slice(0, 10) + "  (tamam)"); continue;
      }
      await gonder(z, "zorunlu gaz " + o.slice(0, 10), await c.setEnforcedOptions.populateTransaction(istenen));
    }

    const KAPI_ABI = ["function karsiKapi() view returns (address)", "function karsiyiBagla(address)"];
    for (const [z, kapi, karsi] of [[Z.arc, kapiArc, kapiRh], [Z.rh, kapiRh, kapiArc]]) {
      const c = new Contract(kapi, KAPI_ABI, z.w);
      const s = await israr(() => c.karsiKapi());
      if (s.toLowerCase() === karsi.toLowerCase()) { console.log("  kapi " + kapi.slice(0, 10) + " baglı  (tamam)"); continue; }
      await gonder(z, "kapi " + kapi.slice(0, 10) + " -> " + karsi.slice(0, 10), await c.karsiyiBagla.populateTransaction(karsi));
    }

    /* ---------------------------------------------- what it costs now */
    console.log("\nUCRET SORGUSU (gercek uc nokta, gercek DVN + yurutucu)");
    const tek = [Z.rh.eid, b32(D), 10n ** 18n, 0n, "0x", "0x", "0x"];
    try {
      const f = await new Contract(adapter, OAPP_ABI, Z.arc.p).quoteSend(tek, false);
      console.log("  Arc -> Robinhood 1 FTHM: " + (Number(f.nativeFee) / 1e18).toFixed(6) + " USDC");
      k.ucretArcRh = f.nativeFee.toString();
    } catch (e) { console.log("  Arc -> Robinhood sorgu HATA: " + (e.shortMessage || e.message)); }
    try {
      const f = await new Contract(oft, OAPP_ABI, Z.rh.p).quoteSend([Z.arc.eid, ...tek.slice(1)], false);
      console.log("  Robinhood -> Arc 1 FTHM: " + (Number(f.nativeFee) / 1e18).toFixed(8) + " ETH");
      k.ucretRhArc = f.nativeFee.toString();
    } catch (e) { console.log("  Robinhood -> Arc sorgu HATA: " + (e.shortMessage || e.message)); }
  } else {
    /* ------------------------------------------------------------ burn */
    console.log("\nSAHIPLIK YAKMA");
    for (const [z, o] of [[Z.arc, k.arc.FTHMOFTAdapter], [Z.arc, k.arc.FiyatElcisi], [Z.rh, k.rh.FTHMOFT], [Z.rh, k.rh.FTHMFarkHook]]) {
      const c = new Contract(o, OAPP_ABI, z.w);
      if ((await israr(() => c.owner())) === "0x0000000000000000000000000000000000000000") { console.log("  " + o + "  (zaten sahipsiz)"); continue; }
      await gonder(z, "sahipligiYak " + o, await c.sahipligiYak.populateTransaction());
    }
    k.sahiplikYakildi = new Date().toISOString();
  }

  for (const [n, z] of Object.entries(Z)) {
    const s = await israr(() => z.p.getBalance(D));
    console.log("  " + z.ad.padEnd(10) + "harcanan " + (Number(baslangic[n] - s) / 1e18).toFixed(6) + " " + z.gaz);
  }
  k.zaman = new Date().toISOString();
  yaz();
})().catch((e) => { console.error("HATA " + (e.shortMessage || e.message)); process.exit(1); });
