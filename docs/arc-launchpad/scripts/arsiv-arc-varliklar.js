"use strict";
/* Arc's own collateral-grade assets, archived read-only.
 *
 * Written for two reasons. The launchpad needs to know which assets can be
 * collateral without a bridge of ours, and ARC PULSE's chain detector and
 * token resolver need a verified catalogue rather than a list somebody
 * typed. Both get the same files.
 *
 * What is recorded per asset: symbol, name, decimals, total supply, code
 * size, and whether the deployed bytecode contains any of the usual
 * transfer-restriction selectors. The last one matters most for
 * collateral: an asset that can freeze or blacklist a holder can freeze a
 * vault, and a floor that can be frozen is not a floor.
 *
 * Also records the pool census from the local registry — how many pools
 * each asset appears in — because an asset nobody trades cannot be priced,
 * and the opening price of a collateralised launch has to come from
 * somewhere.
 *
 * Read-only. Nothing is sent, nothing is signed.
 */
const fs = require("fs");
const path = require("path");
const { id: keccakId, AbiCoder, getAddress } = require("ethers");
const { Arsivci } = require("./arsivci.js");

const KOK = path.join(__dirname, "..");
const ARC_RPC = process.env.ARC_RPC || "https://rpc.mainnet.arc.io";
const DIZIN = path.join(KOK, "kanit-arc-varliklar");
const coder = AbiCoder.defaultAbiCoder();
const sel = (imza) => keccakId(imza).slice(0, 10);
const ars = Arsivci(DIZIN);

const USDC = "0x3600000000000000000000000000000000000000";

/* The candidates, found by counting how often each token appears in the
   local pool registry rather than by picking names. */
const VARLIKLAR = [
  ["usdc",   USDC],
  ["cirbtc", "0x171a4217b86a807a64eb94757db6849fb4bdbaa0"],
  ["eurc",   "0xbef5f6d51cb62b58e6a8f77868681825c6fe21c1"],
  ["weth",   "0x128cc466b61f542da60c70e3aa11c10e19b84edb"]
];

/* Who can change the rules. Kept separate from the restriction list,
   because an owner who can upgrade the implementation can add a
   restriction that is not there today. */
const YETKI_SECICILERI = [
  "owner()", "masterMinter()", "upgradeTo(address)", "upgradeToAndCall(address,bytes)",
  "admin()", "changeAdmin(address)", "mint(address,uint256)", "pause()"
];

/* Proxy storage slots, in the order worth trying. */
const PROXY_SLOTLARI = [
  ["EIP-1967", "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"],
  ["OZ-legacy", "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3"]
];

/* Resolves what actually runs behind an address: a known proxy slot first,
   then implementation() if the contract answers it. Returns nulls when it
   cannot be resolved, and a null is reported as unknown rather than as
   clean — scanning the stub is how the first version of this file decided
   Arc USDC had no blacklister. */
async function proxyArkasi(etiket, adres, blok) {
  /* Every read here goes through al() so it lands in the archive. The
     first version used sabirli(), which fetches without writing — so the
     conclusions were in the manifest and the evidence for them was
     nowhere. A proxy resolution nobody can re-derive from the files is
     the same as an assertion. */
  for (const [ad, slot] of PROXY_SLOTLARI) {
    const r = await ars.al("proxy-slot-" + etiket + "-" + ad.toLowerCase(), ARC_RPC,
      "eth_getStorageAt", [adres, slot, blok], { adres, slot, proxyTipi: ad }, true);
    if (!r.sonuc || BigInt(r.sonuc) === 0n) continue;
    const olasi = "0x" + r.sonuc.slice(26);
    if (/^0x0{40}$/i.test(olasi)) continue;
    const i = getAddress(olasi);
    const k = await ars.al("impl-kod-" + etiket, ARC_RPC, "eth_getCode", [i, blok],
      { implementasyon: i, proxyTipi: ad }, true);
    if (k.sonuc && k.sonuc !== "0x") return { yol: ad, adres: i, kod: k.sonuc };
  }
  const c = await ars.al("impl-cagri-" + etiket, ARC_RPC, "eth_call",
    [{ to: adres, data: sel("implementation()") }, blok], { adres }, true);
  if (c.sonuc && c.sonuc !== "0x") {
    const olasi = "0x" + c.sonuc.slice(26);
    if (!/^0x0{40}$/i.test(olasi)) {
      const i = getAddress(olasi);
      const k = await ars.al("impl-kod-" + etiket, ARC_RPC, "eth_getCode", [i, blok],
        { implementasyon: i, proxyTipi: "implementation()" }, true);
      if (k.sonuc && k.sonuc !== "0x")
        return { yol: "implementation()", adres: i, kod: k.sonuc };
    }
  }
  return { yol: null, adres: null, kod: null };
}

/* Anything here in the executing code means a third party can interfere
   with a holder's balance — including a vault's balance. */
const KISIT_SECICILERI = [
  "isBlacklisted(address)", "blacklist(address)", "blocklist(address)",
  "isFrozen(address)", "freeze(address)", "frozen(address)",
  "allowlist(address)", "isWhitelisted(address)", "whitelist(address)",
  "blocked(address)", "isKYCApproved(address)", "kycRegistry()",
  "canTransfer(address,address,uint256)", "detectTransferRestriction(address,address,uint256)",
  "restricted(address)", "transfersEnabled()", "allowlistEnabled()"
];

const metin = (h) => {
  if (!h || h === "0x") return null;
  try { return coder.decode(["string"], h)[0]; }
  catch (e) {
    const s = Buffer.from(h.slice(2), "hex").toString("utf8").replace(/[^\x20-\x7e]/g, "").trim();
    return s || null;
  }
};
const ond = (x, b) => {
  const d = 10n ** BigInt(b);
  return (x / d).toLocaleString("tr-TR") + "." + (x % d).toString().padStart(b, "0").slice(0, 4);
};

/* How many pools each asset appears in, from the local registry. No
   network: this is a census of what was already collected. */
function havuzSayimi() {
  const yol = path.join(KOK, "arc-havuz-durum.json");
  if (!fs.existsSync(yol)) return null;
  const j = JSON.parse(fs.readFileSync(yol, "utf8"));
  const say = {};
  let toplam = 0, usdcli = 0;
  for (const p of Object.values(j.havuzlar || {})) {
    toplam++;
    const c0 = String(p.c0).toLowerCase(), c1 = String(p.c1).toLowerCase();
    if (c0 === USDC.toLowerCase() || c1 === USDC.toLowerCase()) usdcli++;
    for (const c of [c0, c1]) say[c] = (say[c] || 0) + 1;
  }
  return { say, toplam, usdcli, ustBlok: j.ust };
}

(async function () {
  console.log("");
  console.log("ARC TEMINAT VARLIKLARI — KOPRU GEREKTIRMEYENLER");
  console.log("  arsiv " + DIZIN);
  console.log("");

  const z = await ars.al("zincir", ARC_RPC, "eth_chainId", []);
  if (!z.sonuc) { console.log("  RPC yanit vermiyor: " + z.hata); return; }
  const zincir = Number(BigInt(z.sonuc));
  const sn = await ars.al("son-blok", ARC_RPC, "eth_blockNumber", []);
  /* Pinned to one height for every read below. At "latest" the snapshot
     has no time on it, and these are upgradeable contracts: an
     implementation can change and the archive would not be able to say
     what was true when it was written. */
  const BLOK = sn.sonuc ? sn.sonuc : "latest";
  console.log("  zincir " + zincir + "   okumalar blok " + (BLOK === "latest" ? "latest (SABITLENEMEDI)" : BigInt(BLOK)) + " uzerinden");

  const sayim = havuzSayimi();
  if (sayim) {
    console.log("  yerel havuz kataloğu: " + sayim.toplam + " havuz, " +
      sayim.usdcli + " tanesi USDC'li   (blok " + sayim.ustBlok + "'e kadar)");
    fs.writeFileSync(path.join(DIZIN, "havuz-sayimi.json"),
      JSON.stringify({ not: "arc-havuz-durum.json icindeki yerel kataloğun sayimi; ag cagrisi yok",
        ustBlok: sayim.ustBlok, toplamHavuz: sayim.toplam, usdcliHavuz: sayim.usdcli,
        varlikBasinaHavuz: Object.fromEntries(VARLIKLAR.map(([ad, a]) =>
          [ad, sayim.say[a.toLowerCase()] || 0])) }, null, 1) + "\n");
  }
  console.log("");

  const sonuc = [];
  for (const [ad, adres] of VARLIKLAR) {
    const a = getAddress(adres);
    const s = await ars.al("sembol-" + ad, ARC_RPC, "eth_call",
      [{ to: a, data: sel("symbol()") }, BLOK], { adres: a, blok: BLOK }, true);
    const n = await ars.al("ad-" + ad, ARC_RPC, "eth_call",
      [{ to: a, data: sel("name()") }, BLOK], { adres: a, blok: BLOK }, true);
    const d = await ars.al("basamak-" + ad, ARC_RPC, "eth_call",
      [{ to: a, data: sel("decimals()") }, BLOK], { adres: a, blok: BLOK }, true);
    const t = await ars.al("arz-" + ad, ARC_RPC, "eth_call",
      [{ to: a, data: sel("totalSupply()") }, BLOK], { adres: a, blok: BLOK }, true);
    const k = await ars.al("kod-" + ad, ARC_RPC, "eth_getCode", [a, BLOK], { adres: a, blok: BLOK }, true);

    const sembol = s.sonuc ? metin(s.sonuc) : null;
    const isim = n.sonuc ? metin(n.sonuc) : null;
    const basamak = d.sonuc && d.sonuc !== "0x" ? Number(BigInt(d.sonuc)) : null;
    const arz = t.sonuc && t.sonuc !== "0x" ? BigInt(t.sonuc) : null;

    /* The scan has to run on the code that actually executes. All four of
       these are proxies, and scanning the stub reported "no restrictions"
       for Arc USDC — which has a blacklister. A size threshold was the
       wrong guard: 1798 bytes looked like a real token and was not. So the
       implementation is resolved first, and if it cannot be, the result is
       reported as unknown rather than as clean. */
    const impl = await proxyArkasi(ad, a, BLOK);
    const taranan = impl.adres ? impl.kod : (k.sonuc && k.sonuc !== "0x" ? k.sonuc : null);
    const kisit = taranan ? KISIT_SECICILERI.filter((x) => taranan.includes(sel(x).slice(2))) : null;
    const yetki = taranan ? YETKI_SECICILERI.filter((x) => taranan.includes(sel(x).slice(2))) : null;

    const havuz = sayim ? (sayim.say[a.toLowerCase()] || 0) : null;
    console.log("  " + (sembol || "?").padEnd(8) + (isim || "").slice(0, 24).padEnd(26) +
      "bas " + (basamak === null ? "?" : String(basamak).padEnd(2)) +
      "  havuz " + String(havuz === null ? "?" : havuz).padStart(6) +
      "  arz " + (arz !== null && basamak !== null ? ond(arz, basamak) : "?"));
    console.log("           " + (impl.adres
      ? "PROXY (" + impl.yol + ") -> " + impl.adres + "  " + ((impl.kod.length - 2) / 2) + "b"
      : "proxy degil, " + (k.sonuc ? ((k.sonuc.length - 2) / 2) + "b" : "kod okunamadi")));
    console.log("           DONDURMA : " + (kisit === null ? "BILINMIYOR" :
      (kisit.length ? kisit.join(", ") : "yok")));
    console.log("           YETKI    : " + (yetki === null ? "BILINMIYOR" :
      (yetki.length ? yetki.join(", ") : "yok")));

    sonuc.push({ ad, adres: a, sembol, isim, basamak,
      arz: arz === null ? null : arz.toString(), havuzSayisi: havuz,
      kodBoyutu: k.sonuc ? (k.sonuc.length - 2) / 2 : null,
      proxyYolu: impl.yol, implementasyon: impl.adres,
      implementasyonBoyutu: impl.kod ? (impl.kod.length - 2) / 2 : null,
      kisitSecicileri: kisit, yetkiSecicileri: yetki,
      /* What is actually measured: whether these selectors appear in the
         code that runs at this block. Deliberately NOT called
         "dondurulabilir" — see yetenekNotu in the manifest. */
      bytecodeDaKisitVar: kisit === null ? null : kisit.length > 0,
      yukseltilebilirProxy: impl.adres !== null,
      hedefliDondurmaYetenegi: kisit === null ? "BILINMIYOR"
        : (kisit.length > 0 ? "MEVCUT" : "bu bytecode'da gorunmuyor; yukseltilebilir oldugu icin DISLANAMAZ") });
    await ars.bekle(260);
  }

  const ozet = ars.ozetYaz({
    amac: "Arc uzerinde kopru gerektirmeyen teminat adaylarinin dogrulanmis kataloğu. " +
          "Launchpad teminat secimi ve ARC PULSE chain detector / token resolver icin.",
    arcRpc: ARC_RPC, zincir: zincir, usdc: USDC,
    varliklar: sonuc,
    kisitTaramasiNotu: "Seciciler PROXY ARKASINDAKI implementasyonda arandi. Ilk surum " +
      "stub'i tarayip Arc USDC icin 'kisit yok' demisti — oysa blacklister'i var. " +
      "Implementasyon cozulemezse sonuc BILINMIYOR yazilir, temiz olarak degil.",
    bulgu: "Dordu de yukseltilebilir proxy ve dordunde de owner + pause var. Ama " +
      "HEDEFLI DONDURMA konusunda ayrisiyorlar: USDC, cirBTC ve EURC ayni Circle " +
      "implementasyonunu paylasiyor ve blacklist/blocklist tasiyor, yani BELIRLI " +
      "bir adres — ornegin bizim kasamiz — hedef alinarak dondurulabilir. WETH'in " +
      "implementasyonunda blacklist secicisi YOK; orada yalnizca global pause var, " +
      "ki o herkesi birlikte durdurur, secici bir silah degil.",
    yetenekNotu: "ONEMLI DUZELTME. Bir secicinin bytecode'da BULUNMAMASI, o yetenegin " +
      "OLMADIGINI kanitlamaz. Uc sebepten: (1) secici listesi tahmin, tuketici degil; " +
      "(2) dondurma public bir seciciyle degil ic mantikla ya da baska isimli bir " +
      "fonksiyonun yazdigi bir mapping ile de kurulabilir; (3) ve belirleyici olan bu — " +
      "dort varligin DORDU de yukseltilebilir proxy ve owner tasiyor, yani bugun " +
      "olmayan bir kisit YARIN EKLENEBILIR. Dolayisiyla hicbiri icin 'hedefli " +
      "dondurmaya kapali' DENEMEZ. Olcebildigim sey yalnizca su blokta calisan kodda " +
      "bu secicilerin gorunup gorunmedigi.",
    secimSonucu: "Mevcut bytecode'da USDC/cirBTC/EURC blacklist tasiyor, WETH tasimiyor. " +
      "Bu bir fark ama kesin bir guvence degil: WETH de yukseltilebilir ve owner'i var. " +
      "Ve Arc Circle'in zinciri, USDC ayni zamanda gaz — yani teminat secimi Circle'in " +
      "nihai kontrolunu ortadan kaldirmiyor. Karar varliklar arasinda degil, bu riskin " +
      "varligini kabul edip etmemek ve SITEDE YAZIP YAZMAMAK uzerine.",
    ifadeDuzeltmesi: "Her halukarda sunu duzeltmek lazim: 'teminati kimse alamaz' " +
      "DEGIL, 'teminati BIZIM kontratlarimiz uzerinden kimse alamaz'. Kasada " +
      "rescue/sweep/owner yok ve bu dogru; ama varligin ihraccisi kasanin " +
      "bakiyesini dondurabilir ve bunu sitede yazmamak eksik anlatim olur."
  });
  console.log("");
  console.log("  " + ozet.kayit + " kayit, " + ozet.basarisiz + " basarisiz, " +
    ars.cagri + " cagri, " + ars.yenidenKullanilan + " yeniden kullanildi");
})().catch((e) => { console.log("\nHATA: " + (e && e.message)); process.exit(1); });
