"use strict";
/* Raw evidence for the Fathom launch.
 *
 * Review asked whether I had archived receipts for the FTHM/USDC events
 * in Arc block 24759028. I had not: kopru/kanit holds only the bridge
 * items. And the question landed on something I should have noticed
 * myself, because every claim I made about FTHM has the same weakness the
 * collateral claim had — the -0.50% on the real one dollar buy, the fee
 * going to depth rather than to anyone's pocket, the supply closing to
 * zero wei. All of it was measured and then the output scrolled away.
 *
 * So this archives the launch: every deployment receipt, the three ladder
 * transactions, the first buy, the pool's own storage read out of
 * PoolManager, the supply and the balances the accounting rests on. Each
 * result is kept exactly as the node returned it, beside the method and
 * params that produced it.
 *
 * dogrula-fathom-arsivi.js then re-derives the claims from these files
 * with no network at all.
 *
 * Read-only. Nothing is sent, nothing is signed.
 */
const fs = require("fs");
const path = require("path");
const { id: keccakId, AbiCoder, keccak256 } = require("ethers");
const { Arsivci } = require("./arsivci.js");

const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const A = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dagitim-fathom.json"), "utf8"));
const DIZIN = path.join(__dirname, "..", "kanit-fathom");

const coder = AbiCoder.defaultAbiCoder();
const sel = (imza) => keccakId(imza).slice(0, 10);
const ars = Arsivci(DIZIN);

/* The first buy is recorded in the manifest. The second hash came from
   review and is not in any file of mine, so it is archived as named
   rather than as something I can already account for. */
const EK_ISLEMLER = (process.argv.slice(2).filter((s) => /^0x[0-9a-fA-F]{64}$/.test(s)));
const INCELEME_ISLEMI = "0xff81b6a913e4c654b8db5640c048fe7b0af9f3f64cc40c62e7bb397ea70c61b9";

(async function () {
  console.log("");
  console.log("FATHOM KANIT ARSIVI");
  console.log("  dizin " + DIZIN);
  console.log("  token " + A.token + "   havuz " + A.havuzId.slice(0, 18));
  console.log("");

  const z = await ars.al("zincir-arc", ARC_RPC, "eth_chainId", []);
  if (!z.sonuc) { console.log("  Arc RPC yanit vermiyor: " + z.hata); return; }
  console.log("  zincir " + Number(BigInt(z.sonuc)));
  await ars.al("son-blok-arc", ARC_RPC, "eth_blockNumber", []);

  /* ---- every transaction the launch is made of -------------------- */
  const islemler = [];
  for (const [ad, k] of Object.entries(A.islemler || {}))
    islemler.push(["dagitim-" + ad, k.tx, k.blok]);
  for (const k of A.merdivenIslemleri || [])
    islemler.push(["merdiven-" + k.kademe, k.tx, k.blok]);
  if (A.ilkAlim) islemler.push(["ilk-alim", A.ilkAlim.tx, A.ilkAlim.blok]);
  islemler.push(["inceleme-islemi", INCELEME_ISLEMI, null]);
  for (const [i, tx] of EK_ISLEMLER.entries()) islemler.push(["ek-" + (i + 1), tx, null]);

  console.log("");
  console.log("MAKBUZLAR");
  const bloklar = new Set();
  for (const [ad, tx, beklenenBlok] of islemler) {
    /* A receipt at a fixed hash is settled history: reusable. */
    const r = await ars.al("makbuz-" + ad, ARC_RPC, "eth_getTransactionReceipt", [tx],
      beklenenBlok === null ? undefined : { manifestBlok: beklenenBlok }, true);
    if (!r.sonuc) { console.log("  " + ad.padEnd(20) + "ALINAMADI / YOK  " + (r.hata || "")); continue; }
    const blok = parseInt(r.sonuc.blockNumber, 16);
    console.log("  " + ad.padEnd(20) + "blok " + blok + "  status " + r.sonuc.status +
      "  log " + (r.sonuc.logs || []).length +
      (beklenenBlok !== null && blok !== beklenenBlok ? "   MANIFESTTEN FARKLI (" + beklenenBlok + ")" : ""));
    bloklar.add(r.sonuc.blockNumber);
    await ars.bekle(200);
  }

  /* The block each receipt names, so the binding can be checked offline
     the same way the bridge archive allows. */
  console.log("");
  console.log("BLOKLAR");
  for (const numara of bloklar) {
    /* A block at a fixed height, likewise. */
    const b = await ars.al("blok-arc-" + parseInt(numara, 16), ARC_RPC,
      "eth_getBlockByNumber", [numara, false], undefined, true);
    if (b.sonuc) console.log("  " + parseInt(numara, 16) + "  " + b.sonuc.hash);
    await ars.bekle(200);
  }

  /* ---- the pool's own storage ------------------------------------- */
  console.log("");
  console.log("HAVUZ DURUMU (PoolManager extsload)");
  /* Pools live at slot 6; slot0 is keccak256(abi.encode(poolId, 6)) and
     liquidity sits three words later. Read from storage rather than from
     a helper, so nothing between me and the state can shade it. */
  const slot = keccak256(coder.encode(["bytes32", "uint256"], [A.havuzId, 6]));
  const likSlot = "0x" + (BigInt(slot) + 3n).toString(16).padStart(64, "0");
  const s0 = await ars.al("havuz-slot0", ARC_RPC, "eth_call",
    [{ to: A.poolManager, data: sel("extsload(bytes32)") + slot.slice(2) }, "latest"],
    { not: "slot0 = keccak256(abi.encode(havuzId, 6)); alt 160 bit sqrtPriceX96" });
  const lk = await ars.al("havuz-likidite", ARC_RPC, "eth_call",
    [{ to: A.poolManager, data: sel("extsload(bytes32)") + likSlot.slice(2) }, "latest"],
    { not: "slot0 + 3 = aktif likidite" });
  if (s0.sonuc) console.log("  slot0     " + s0.sonuc);
  if (lk.sonuc) console.log("  likidite  " + BigInt(lk.sonuc));

  /* ---- was the opening price still the price when the buy landed? -- */
  console.log("");
  console.log("ILK ALIMDAN ONCE HAVUZDA TAKAS OLDU MU");
  /* Review found the hole in my slippage figure and it was a real one. I
     used the opening sqrtPrice from the manifest as the pre-trade spot,
     but 2019 blocks sit between the ladder and the first buy, and the
     slot0 I archived was read at "latest" — current state, not the state
     before the trade. So the baseline rested on an assumption I had not
     checked: that nothing swapped in between.

     Checked here, as coverage rather than as a claim. Swap carries the
     pool id as its first indexed topic, so the filter is exact and the
     answer is small. Windows are contiguous and each one is archived, so
     whether the range is actually closed is a property of the file. */
  const SWAP = keccakId("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)");
  const alimBlok = A.ilkAlim ? BigInt(A.ilkAlim.blok) : null;
  const basBlok = BigInt((A.merdivenIslemleri || [])[0]
    ? (A.merdivenIslemleri[0].blok) : A.ilkBlok);
  if (alimBlok === null) {
    console.log("  ilk alim manifestte yok, tarama yapilmadi");
  } else {
    const jsonl = path.join(DIZIN, "havuz-swap-tarama.jsonl");
    const oncekiler = fs.existsSync(jsonl)
      ? fs.readFileSync(jsonl, "utf8").trim().split(/\r?\n/).filter(Boolean).map((s) => JSON.parse(s))
      : [];
    /* The range ends at the buy's own block and never moves, so a
       complete earlier archive is reused whole. */
    const tamam = oncekiler.length &&
      BigInt(oncekiler[0].fromBlock) === basBlok &&
      BigInt(oncekiler[oncekiler.length - 1].toBlock) >= alimBlok &&
      oncekiler.every((p) => p.sonuc !== null);
    if (tamam) {
      const kac = oncekiler.reduce((a, p) => a + p.sonuc.length, 0);
      console.log("  arsiv zaten tam: " + oncekiler.length + " pencere, " + kac + " Swap");
    } else {
      const akis = fs.createWriteStream(jsonl);
      const PENCERE = 2000n;
      let alt = basBlok, say = 0, eksik = 0, olay = 0;
      while (alt <= alimBlok) {
        const ust = (alt + PENCERE > alimBlok) ? alimBlok : alt + PENCERE;
        const c = await ars.sabirli(ARC_RPC, "eth_getLogs", [{
          address: A.poolManager, topics: [SWAP, A.havuzId],
          fromBlock: "0x" + alt.toString(16), toBlock: "0x" + ust.toString(16)
        }]);
        akis.write(JSON.stringify({
          fromBlock: alt.toString(), toBlock: ust.toString(),
          sonuc: c.sonuc === undefined ? null : c.sonuc,
          hata: c.sonuc === undefined ? c.hata : undefined
        }) + "\n");
        say++;
        if (c.sonuc === undefined) eksik++; else olay += c.sonuc.length;
        alt = ust + 1n;
      }
      akis.end();
      await new Promise((r) => akis.on("close", r));
      console.log("  " + say + " pencere, " + eksik + " eksik, " + olay + " Swap  (" +
        basBlok + " -> " + alimBlok + ")");
    }
    const govde = fs.readFileSync(jsonl);
    ars.kayitlar.push({
      dosya: "havuz-swap-tarama.jsonl",
      uc: ARC_RPC, yontem: "eth_getLogs",
      parametreler: { address: A.poolManager, topics: [SWAP, A.havuzId],
                      aralik: basBlok + "-" + alimBlok, pencere: "2000" },
      alindi: new Date().toISOString(),
      sha256: require("crypto").createHash("sha256").update(govde).digest("hex"),
      basarili: true,
      not: "Merdivenin ilk kademesinden ilk alimin blogunun sonuna kadar bu havuzdaki " +
           "butun Swap olaylari. Kayma tabanini 'acilis fiyati hala fiyatti' varsayimindan " +
           "cikarip kapsama baglamak icin."
    });

    /* And the state at a fixed historical height, which is the direct
       answer if this endpoint keeps archive state. Many do not; a refusal
       is recorded as a refusal rather than left looking like an answer. */
    const oncekiBlok = "0x" + (alimBlok - 1n).toString(16);
    const t0 = await ars.al("havuz-slot0-blok-" + (alimBlok - 1n), ARC_RPC, "eth_call",
      [{ to: A.poolManager, data: sel("extsload(bytes32)") + slot.slice(2) }, oncekiBlok],
      { not: "ISLEM ONCESI durum: " + (alimBlok - 1n) + " blogunda slot0" }, true);
    console.log("  islem oncesi slot0 (" + (alimBlok - 1n) + "): " +
      (t0.sonuc ? t0.sonuc : "ARSIV DURUMU YOK — " + t0.hata));
  }

  /* ---- the numbers the supply accounting compares ----------------- */
  console.log("");
  console.log("ARZ VE BAKIYELER");
  await ars.al("arz-fthm", ARC_RPC, "eth_call",
    [{ to: A.token, data: sel("totalSupply()") }, "latest"]);
  for (const [ad, adres] of [["stake", A.stake], ["vesting", A.vesting],
                             ["kurucu", A.kurucu], ["acici", A.acici],
                             ["hook", A.hook], ["poolManager", A.poolManager]]) {
    const b = await ars.al("bakiye-fthm-" + ad, ARC_RPC, "eth_call",
      [{ to: A.token, data: sel("balanceOf(address)") +
          coder.encode(["address"], [adres]).slice(2) }, "latest"],
      { adres });
    if (b.sonuc) console.log("  " + ad.padEnd(13) + BigInt(b.sonuc));
    await ars.bekle(150);
  }

  /* USDC on the hook's two destinations, because "the founder fee went to
     the wallet inside the swap" is a claim about USDC moving, not FTHM. */
  for (const [ad, adres] of [["kurucu", A.kurucu], ["stake", A.stake]]) {
    const b = await ars.al("bakiye-usdc-" + ad, ARC_RPC, "eth_call",
      [{ to: A.usdc, data: sel("balanceOf(address)") +
          coder.encode(["address"], [adres]).slice(2) }, "latest"],
      { adres, basamak: 6 });
    if (b.sonuc) console.log("  usdc/" + ad.padEnd(8) + BigInt(b.sonuc));
    await ars.bekle(150);
  }

  /* ---- the locks, read as code rather than asserted --------------- */
  console.log("");
  console.log("KILIT KONTROLLERI ICIN KOD");
  for (const [ad, adres] of [["hook", A.hook], ["acici", A.acici], ["token", A.token]]) {
    const k = await ars.al("kod-" + ad, ARC_RPC, "eth_getCode", [adres, "latest"], { adres });
    if (k.sonuc) console.log("  " + ad.padEnd(8) + (k.sonuc.length - 2) / 2 + " bayt");
    await ars.bekle(150);
  }

  const ozet = ars.ozetYaz({
    amac: "Fathom lansmaninin ham dayanagi: dagitim ve merdiven makbuzlari, ilk alim, " +
          "havuzun PoolManager depolamasindan okunan durumu, arz ve bakiyeler. " +
          "Iddialari bu dosyalardan yeniden turetmek icin: dogrula-fathom-arsivi.js",
    arcRpc: ARC_RPC,
    token: A.token, havuzId: A.havuzId, poolManager: A.poolManager,
    hook: A.hook, acici: A.acici, stake: A.stake, vesting: A.vesting,
    kurucu: A.kurucu, usdc: A.usdc,
    acilisTick: A.acilisTick, acilisSqrtPriceX96: A.acilisSqrtPriceX96,
    ilkBlok: A.ilkBlok,
    incelemedenGelenIslem: {
      tx: INCELEME_ISLEMI,
      not: "Bu kimlik incelemeden geldi ve benim hicbir manifestimde yok. " +
           "Ne oldugunu iddia etmiyorum; makbuzu oldugu gibi arsivlendi."
    }
  });

  console.log("");
  console.log("  " + ozet.kayit + " kayit yazildi, " + ozet.basarisiz + " basarisiz");
  for (const b of ozet.basarisizlar) console.log("     ALINAMADI " + b.dosya);
  console.log("  " + ars.cagri + " salt-okunur cagri, hicbir sey gonderilmedi.");
  console.log("  ozet " + path.join(DIZIN, "ozet.json"));
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
