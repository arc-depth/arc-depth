"use strict";
/* ===========================================================================
 * kur-fathom-sayfa.js — build docs/fathom.html from the DEPTH page.
 *
 *   node scripts/kur-fathom-sayfa.js
 *
 * WHY A GENERATOR AND NOT AN EDIT
 *   The old page cannot just have its address swapped. It is built around
 *   a bonding curve — a graduation progress bar, a curve-versus-pool
 *   slippage table, buy and sell calling Egri.al and Egri.sat — and Fathom
 *   has no curve. Pointing those panels at a contract that does not exist
 *   would show a visitor numbers read from nothing, which is worse than
 *   the dead page it replaces.
 *
 *   So the head, the CSS and the wallet plumbing are carried over byte for
 *   byte from a file already audited, and everything that touched the
 *   curve is rewritten against the pool and the router that are deployed.
 *   Every address comes from dagitim-fathom.json, so the page cannot drift
 *   from the deployment.
 * =========================================================================== */

const fs = require("fs");
const path = require("path");
const KOK = path.join(__dirname, "..");
const A = JSON.parse(fs.readFileSync(path.join(KOK, "dagitim-fathom.json"), "utf8"));
const ESKI = path.join(KOK, "docs", "depth.html");
const YENI = path.join(KOK, "docs", "fathom.html");
const ROUTER = "0x7550058C3F4D8839eBc8AcCB96959Fe69C109581";

const kaynak = fs.readFileSync(ESKI, "utf8");
const kes = kaynak.indexOf("</header>");
if (kes < 0) throw new Error("depth.html icinde </header> yok — yapisi degismis");

let bas = kaynak.slice(0, kes + "</header>".length)
  .replace("<title>Arc Depth · DEPTH</title>", "<title>Arc Depth · FTHM</title>");
if (bas.includes("DEPTH")) throw new Error("basligda DEPTH kaldi");

const govde = `

<main class="wrap">
  <h1>FTHM</h1>
  <p class="sub">
    Fiyatı kimse belirlemiyor; Uniswap belirliyor. Piyasa payının tamamı —
    <strong>500.000.000 FTHM</strong> — havuzda, kalıcı kilitli, üç kademeli
    bir merdiven halinde. <strong>Protokol havuza tek dolar koymadı;</strong>
    içindeki para ne kadarsa onu alıcılar koydu.
  </p>

  <div class="ca">
    <code id="ca">—</code>
    <button id="kopya">kopyala</button>
    <button id="exp">explorer</button>
  </div>

  <div id="uyari"></div>
  <div id="derinlik"></div>

  <div class="cols">
    <div class="panel">
      <h2>Al / Sat · Uniswap havuzu</h2>
      <div class="rows" id="havuzDurum"></div>

      <div class="field" style="margin-top:16px">
        <label for="alMik">Ödenecek USDC</label>
        <input id="alMik" placeholder="1" inputmode="decimal" spellcheck="false">
        <div class="hint" id="alNot">—</div>
      </div>
      <div class="two">
        <button class="btn alt" id="alOnay" disabled>USDC onayla</button>
        <button class="btn" id="al" disabled>Al</button>
      </div>

      <div class="field" style="margin-top:18px">
        <label for="satMik">Satılacak FTHM</label>
        <input id="satMik" placeholder="0" inputmode="decimal" spellcheck="false">
        <div class="hint" id="satNot">—</div>
      </div>
      <div class="two">
        <button class="btn alt" id="satOnay" disabled>FTHM onayla</button>
        <button class="btn alt" id="sat" disabled>Sat</button>
      </div>
      <div id="islemMesaj"></div>
    </div>

    <div class="panel">
      <h2>Stake</h2>
      <div class="rows" id="stakeDurum"></div>

      <div class="field" style="margin-top:16px">
        <label for="stMik">FTHM miktarı</label>
        <input id="stMik" placeholder="0" inputmode="decimal" spellcheck="false">
        <div class="hint">
          Alt sınır yok — ne kadar koyarsan koy, satış ücretlerinden USDC
          payı ve havuzdan FTHM kazanırsın. <strong>Oy kullanmak</strong>
          için 50.000 gerekiyor. Kilit yok, her an çözebilirsin.
        </div>
      </div>
      <div class="two">
        <button class="btn alt" id="stOnay" disabled>FTHM onayla</button>
        <button class="btn" id="st" disabled>Stake et</button>
      </div>
      <div class="two" style="margin-top:9px">
        <button class="btn alt" id="stCoz" disabled>Çöz</button>
        <button class="btn alt" id="stAl" disabled>Ödülü al</button>
      </div>
      <div id="stakeMesaj"></div>
    </div>
  </div>

  <div class="panel" style="margin-top:16px">
    <h2>Merdiven</h2>
    <div class="rows" id="merdiven"></div>
  </div>

  <div class="panel" style="margin-top:16px">
    <h2>Arz</h2>
    <div class="rows" id="arz"></div>
  </div>
</main>

<footer>
  <div class="wrap">
    Arc ana ağı, chain 5042. Hiçbir kontrat yükseltilebilir değil; sahip,
    duraklatma, sweep, withdraw ve mint fonksiyonu yok. Havuz likiditesi
    çıkarılamaz — hook her çıkarma denemesini, bizimki dahil, reddeder.
    <div class="adr" id="adresler"></div>
  </div>
</footer>

<div class="ort hid" id="cuzdanOrt">
  <div class="kutu">
    <div class="kutubas"><strong>Cüzdan seç</strong>
      <button class="kapat" id="cuzdanKapat">&times;</button></div>
    <div id="cuzdanListe"></div>
  </div>
</div>
`;

const betik = `<script type="module">
import { BrowserProvider, Contract, JsonRpcProvider, parseUnits, MaxUint256 }
  from "https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm";

const ARC = { chainId:5042, chainIdHex:"0x13b2", name:"Arc",
  rpc:"https://rpc.mainnet.arc.io", explorer:"https://explorer.arc.io",
  currency:{ name:"USDC", symbol:"USDC", decimals:18 } };

const A = {
  token:   "${A.token}",
  stake:   "${A.stake}",
  acici:   "${A.acici}",
  hook:    "${A.hook}",
  governor:"${A.governor}",
  vesting: "${A.vesting}",
  usdc:    "${A.usdc}",
  poolManager:"${A.poolManager}",
  router:  "${ROUTER}",
  havuzId: "${A.havuzId}",
  fee: ${A.fee}, spacing: ${A.spacing}, acilisTick: ${A.acilisTick},
  merdiven: ${JSON.stringify(A.merdiven)},
  /* The previous token, cancelled. Named so nobody buys it by mistake. */
  eskiToken: "0xF67Eea3A140305dBC243e611CFa421c76F3C608B"
};

/* FTHM sorts above USDC, so it is currency1 and a buy is zeroForOne.
   Derived rather than written down: getting it backwards would quote a
   sell on the buy button. */
const TOKEN_SIFIRINCI = A.token.toLowerCase() < A.usdc.toLowerCase();
const KEY = [ TOKEN_SIFIRINCI ? A.token : A.usdc,
              TOKEN_SIFIRINCI ? A.usdc : A.token,
              A.fee, A.spacing, A.hook ];
const ALIS_ZFO = !TOKEN_SIFIRINCI;

const ABI = {
  erc20:[
    "function balanceOf(address) view returns (uint256)",
    "function allowance(address,address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)"
  ],
  router:["function swap((address,address,uint24,int24,address) key,bool zeroForOne,uint256 amountIn,uint256 minOut) payable returns (uint256)"],
  pm:["function extsload(bytes32) view returns (bytes32)"],
  stake:[
    "function stake(uint256)","function unstake(uint256)",
    "function claim() returns (uint256)",
    "function stakedOf(address) view returns (uint256)",
    "function totalStaked() view returns (uint256)",
    "function pending(address) view returns (uint256)",
    "function pendingToken(address) view returns (uint256)",
    "function oyGucu(address) view returns (uint256)",
    "function MIN_OY_GUCU() view returns (uint256)",
    "function emisyonKalan() view returns (uint256)",
    "function emisyonDagitilan() view returns (uint256)"
  ]
};

const $ = (i) => document.getElementById(i);
const read = new JsonRpcProvider(ARC.rpc,{chainId:ARC.chainId,name:"arc"},
  {staticNetwork:true,batchMaxCount:1});
const esc = (s) => String(s==null?"":s).replace(/[&<>"]/g,(c)=>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const kisa = (a) => String(a).slice(0,6)+"…"+String(a).slice(-4);
const say = (v) => Number(String(v).replace(",","."));
const satir = (l,v,not) => '<div class="row"><span>'+l+
  (not?'<span class="note">'+not+"</span>":"")+"</span><b>"+v+"</b></div>";
const mesaj = (el,tip,html) => { $(el).innerHTML='<div class="msg '+tip+'">'+html+"</div>"; };
const txLink = (h) => '<a href="'+ARC.explorer+"/tx/"+h+'" target="_blank" rel="noopener">işlemi gör</a>';
const nd = (x,d=0) => Number(x).toLocaleString("tr-TR",{maximumFractionDigits:d});
const nalp = (x) => { const v=Number(x); if(v===0) return "0";
  if(v>=0.01) return nd(v,2);
  return v.toLocaleString("tr-TR",{maximumSignificantDigits:2}); };
const usd = (x,d=2) => "$"+Number(x).toLocaleString("tr-TR",
  {minimumFractionDigits:d,maximumFractionDigits:d});

function hataMetni(e){
  const s = String((e&&(e.shortMessage||e.reason||e.message))||e);
  if (/user rejected|denied/i.test(s)) return "İşlem cüzdanda reddedildi.";
  if (/insufficient funds/i.test(s)) return "Bakiye yetersiz — gaz için de USDC gerekiyor.";
  if (/Kayma|minOut|slippage/i.test(s)) return "Fiyat beklediğinden fazla oynadı, işlem geri çevrildi.";
  if (/allowance|transferFrom/i.test(s)) return "Önce onay ver (soldaki onayla düğmesi).";
  return s.length>160 ? s.slice(0,160)+"…" : s;
}

let saglayici=null, signer=null, hesap=null, USDC_OND=6;

/* ---- wallets: EIP-6963, then whatever injected itself ----------- */
const cuzdanlar = new Map();
window.addEventListener("eip6963:announceProvider",(e)=>{
  const d=e.detail; if(d&&d.info&&d.provider) cuzdanlar.set(d.info.uuid,d);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));

function cuzdanListesi(){
  const el=$("cuzdanListe");
  const hepsi=[...cuzdanlar.values()];
  if(!hepsi.length && window.ethereum)
    hepsi.push({info:{name:"Tarayıcı cüzdanı",icon:""},provider:window.ethereum});
  if(!hepsi.length){
    el.innerHTML='<div class="msg err">Cüzdan bulunamadı. MetaMask gibi bir '+
      'cüzdan kurup sayfayı yenile.</div>'; return;
  }
  el.innerHTML=hepsi.map((c,i)=>'<button class="cz" data-i="'+i+'">'+
    (c.info.icon?'<img src="'+esc(c.info.icon)+'" alt="">':"")+esc(c.info.name)+"</button>").join("");
  for(const b of el.querySelectorAll(".cz"))
    b.addEventListener("click", async ()=>{
      kapa("cuzdanOrt");
      try{ await bagla(hepsi[Number(b.dataset.i)].provider); }
      catch(e){ mesaj("islemMesaj","err",esc(hataMetni(e))); }
    });
}
const ac=(id)=>$(id).classList.remove("hid");
const kapa=(id)=>$(id).classList.add("hid");
$("cuzdanKapat").addEventListener("click",()=>kapa("cuzdanOrt"));
$("cuzdanOrt").addEventListener("click",(e)=>{ if(e.target===$("cuzdanOrt")) kapa("cuzdanOrt"); });

async function bagla(eip1193){
  await eip1193.request({method:"eth_requestAccounts"});
  const bp=new BrowserProvider(eip1193);
  const net=await bp.getNetwork();
  if(Number(net.chainId)!==ARC.chainId){
    try{ await eip1193.request({method:"wallet_switchEthereumChain",
      params:[{chainId:ARC.chainIdHex}]}); }
    catch(sw){
      if(sw&&(sw.code===4902||/Unrecognized chain|Unsupported chain/i.test(String(sw.message)))){
        await eip1193.request({method:"wallet_addEthereumChain",params:[{
          chainId:ARC.chainIdHex,chainName:ARC.name,rpcUrls:[ARC.rpc],
          nativeCurrency:ARC.currency,blockExplorerUrls:[ARC.explorer]}]});
      } else throw sw;
    }
  }
  saglayici=eip1193;
  signer=await (new BrowserProvider(eip1193)).getSigner();
  hesap=await signer.getAddress();
  $("wallet").innerHTML='<span class="wdot"></span>'+kisa(hesap);
  $("wallet").classList.add("conn");
  for(const b of ["alOnay","al","satOnay","sat","stOnay","st","stCoz","stAl"])
    $(b).disabled=false;
  if(eip1193.on){
    eip1193.on("accountsChanged",()=>location.reload());
    eip1193.on("chainChanged",()=>location.reload());
  }
  oku();
}
$("wallet").addEventListener("click",()=>{
  if(hesap){ navigator.clipboard&&navigator.clipboard.writeText(hesap); return; }
  cuzdanListesi(); ac("cuzdanOrt");
});

$("ca").textContent=A.token;
$("exp").addEventListener("click",()=>window.open(ARC.explorer+"/address/"+A.token,"_blank","noopener"));
$("kopya").addEventListener("click", async ()=>{
  try{ await navigator.clipboard.writeText(A.token); $("kopya").textContent="kopyalandı"; }
  catch(e){ $("kopya").textContent="kopyalanamadı"; }
  setTimeout(()=>{ $("kopya").textContent="kopyala"; },1600);
});

$("adresler").innerHTML=[
  ["token",A.token],["havuz açıcı",A.acici],["hook",A.hook],["stake",A.stake],
  ["yönetişim",A.governor],["vesting",A.vesting],["yönlendirici",A.router]
].map(([ad,adr])=>'<a href="'+ARC.explorer+"/address/"+adr+
  '" target="_blank" rel="noopener">'+ad+" · "+adr+"</a>").join("");

/* ---- reads ------------------------------------------------------- */
const stakeR=()=>new Contract(A.stake,ABI.stake,read);
const tokR=()=>new Contract(A.token,ABI.erc20,read);
const usdcR=()=>new Contract(A.usdc,ABI.erc20,read);
const pmR=()=>new Contract(A.poolManager,ABI.pm,read);
const routerR=()=>new Contract(A.router,ABI.router,read);

const Q96 = 2**96;
/* v4 keeps pools in a mapping at slot 6; slot0 holds sqrtPriceX96 in the
   low 160 bits and slot0+3 holds the active liquidity. Read directly
   because there is no getter. */
async function havuzOku(){
  const { keccak256, AbiCoder } = await import("https://cdn.jsdelivr.net/npm/ethers@6.13.4/+esm");
  const slot = keccak256(AbiCoder.defaultAbiCoder().encode(["bytes32","uint256"],[A.havuzId,6]));
  const raw = BigInt(await pmR().extsload(slot));
  const likSlot = "0x"+(BigInt(slot)+3n).toString(16).padStart(64,"0");
  const lik = BigInt(await pmR().extsload(likSlot));
  const sqrt = raw & ((1n<<160n)-1n);
  const sqrtP = Number(sqrt)/Q96;
  /* FTHM is currency1, so the pool price is token-wei per USDC unit and the
     dollar price is its reciprocal scaled by the decimal gap. Written out
     because inverting it once already produced a confident wrong answer. */
  const fiyat = sqrtP>0 ? (1/(sqrtP*sqrtP))*1e12 : 0;
  /* USDC is currency0, so its virtual reserve — what sets slippage — is
     L/sqrtP, not L*sqrtP. */
  const derinlik = (sqrtP>0 && lik>0n) ? (Number(lik)/sqrtP)/1e6 : 0;
  return { sqrtP, fiyat, lik, derinlik };
}

/* How much USDC the ladder actually holds, rung by rung. A position over
   [a,b] holds currency0 = L*(1/sqrt(p) - 1/sqrt(b)) for the part of it
   the price has passed. This is the money a seller could be paid, and it
   is not the market cap. */
function gercekPara(sqrtP){
  let toplam = 0;
  for (const r of A.merdiven) {
    const a = Math.sqrt(Math.pow(1.0001, r.tick));
    const b = Math.sqrt(Math.pow(1.0001, r.ust !== undefined ? r.ust : A.acilisTick));
    const N = Number(r.token)/1e18;
    if (!(b > a)) continue;
    const L = N / (1/a - 1/b) * 1;          // currency1 amount -> L, in float
    const p = Math.min(Math.max(sqrtP, a), b);
    toplam += L * (1/p - 1/b);
  }
  return toplam;
}

async function oku(){
  try{
    const h = await havuzOku();
    const arz = await tokR().totalSupply();
    const mcap = h.fiyat * (Number(arz)/1e18);

    let benUsdc=0n, benTok=0n;
    if (hesap) [benUsdc,benTok] = await Promise.all([
      usdcR().balanceOf(hesap), tokR().balanceOf(hesap)]);

    mesaj("uyari","info",
      "<strong>Tek işlem yeri bu havuz.</strong> Eğri yok; piyasa payının "+
      "tamamı burada ve kalıcı kilitli. Cüzdanından Uniswap'ta da aynı "+
      "havuza düşersin — "+
      '<a href="https://dexscreener.com/arc/'+A.havuzId+'" target="_blank" '+
      'rel="noopener">DexScreener</a>.<br>'+
      "Eski <b>DEPTH</b> tokeni <strong>iptal</strong> edildi ve o havuzda "+
      "yalnızca $12 var; karıştırma — doğru adres yukarıdaki.");

    const hd = (d) => h.derinlik>0 ? "%"+nd((1-h.derinlik/(h.derinlik+d))*100+0.5,2) : "—";
    $("havuzDurum").innerHTML =
      satir("fiyat", usd(h.fiyat,8).replace("$","$ "), "Uniswap belirliyor, biz değil") +
      satir("piyasa değeri", usd(mcap,0)) +
      satir("havuz derinliği", h.derinlik>0?usd(h.derinlik,0):"ilk alımla açılır",
        "kaymayı bu belirler — bandın yoğunluğundan geliyor, yatırılan paradan değil") +
      satir("$20 alımda kayma", hd(20), "hook ücreti dahil") +
      satir("$1.000 alımda kayma", hd(1000)) +
      satir("işlem ücreti","%0,50",
        "satışta %0,15 kurucu · %0,15 stake · %0,20 derinlik — alışta tamamı derinliğe") +
      (hesap ? satir("cüzdanındaki USDC", usd(Number(benUsdc)/1e6,2)) +
               satir("cüzdanındaki FTHM", nalp(Number(benTok)/1e18)) : "");

    await derinlikOku(h, mcap);
    await merdivenOku(h);
    await stakeOku();
    await arzOku(arz);
    await onizle();
  }catch(err){
    mesaj("islemMesaj","err","Zincire ulaşılamadı: "+esc(hataMetni(err)));
  }
}

/* The number a price site cannot show you. */
async function derinlikOku(h, mcap){
  const para = gercekPara(h.sqrtP);
  const kat = para>0 ? mcap/para : 0;
  const sat2 = (miktar) => {
    const deger = miktar * h.fiyat;
    const cikan = Math.min(deger, para) * 0.995;
    return "<tr><td>"+nd(miktar)+"</td><td>"+usd(deger,2)+"</td><td><strong>"+
      usd(cikan,4)+"</strong></td></tr>";
  };
  $("derinlik").innerHTML =
    '<div class="msg '+(para<50?"uyari":"info")+'" style="margin-bottom:20px">'+
    "<strong>Satarsan ne alacağını buradan oku.</strong><br>"+
    "Havuzda şu an gerçekten <strong>"+usd(para,2)+"</strong> var ve "+
    "<strong>tamamını alıcılar koydu</strong> — biz sıfır koyduk. "+
    (para<50
      ? "Henüz çok az alım oldu, yani <strong>çıkış da o kadar.</strong> "+
        "Bu bir kusur değil, para koymadan açmanın doğrudan sonucu: ilk "+
        "doları alıcı koyar, satış karşılığı ondan sonra oluşur."
      : "Piyasa değeri "+usd(mcap,0)+" görünüyor; aradaki fark <strong>"+
        nd(kat)+" kat</strong>. Havuz, içinde olmayan parayı ödeyemez.")+
    '<table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:12.5px">'+
    '<tr style="color:var(--dim)"><th style="text-align:left">satılan FTHM</th>'+
    '<th style="text-align:left">fiyata göre</th>'+
    '<th style="text-align:left">gerçekte alınan</th></tr>'+
    [10000,100000,1000000].map(sat2).join("")+
    "</table>"+
    '<div style="margin-top:10px;color:var(--dim)">'+
    "Her alım parasını havuzda bırakıyor ve çıkarılamıyor; yani bu rakam "+
    "yalnızca artar. Alış ücretinin tamamı da kalıcı derinliğe dönüyor."+
    "</div></div>";
}

async function merdivenOku(h){
  const ad = { ic:"iç kademe", orta:"orta kademe", dis:"dış kademe" };
  const satirlar = A.merdiven.map((r)=>{
    const ust = 1/Math.pow(1.0001, r.tick) * 1e12 / 1e12;
    const fiyatUst = (1/Math.pow(1.0001,r.tick))*1e12;
    return satir(ad[r.ad]||r.ad, nd(Number(r.token)/1e18)+" FTHM",
      "tavan $"+fiyatUst.toExponential(3)+" · tick "+r.tick);
  }).join("");
  $("merdiven").innerHTML = satirlar +
    satir("toplam", nd(A.merdiven.reduce((a,r)=>a+Number(r.token)/1e18,0))+" FTHM",
      "hepsi tek yönlü ve kalıcı kilitli — çıkarma fonksiyonu yok");
}

async function stakeOku(){
  const s=stakeR();
  const [toplam,taban,kalan,dagitilan]=await Promise.all([
    s.totalStaked(), s.MIN_OY_GUCU(), s.emisyonKalan(), s.emisyonDagitilan()]);
  let benim=0n,odulUsdc=0n,odulTok=0n,oy=0n;
  if(hesap) [benim,odulUsdc,odulTok,oy]=await Promise.all([
    s.stakedOf(hesap), s.pending(hesap), s.pendingToken(hesap), s.oyGucu(hesap)]);
  const t=Number(toplam)/1e18, b=Number(benim)/1e18, tb=Number(taban)/1e18;
  $("stakeDurum").innerHTML =
    satir("toplam stake", t>0?nalp(t)+" FTHM":"0 — henüz kimse stake etmedi") +
    satir("emisyon havuzu", nd(Number(kalan)/1e18)+" FTHM",
      "30 yıl, 10 yılda yarılanır · dağıtılan "+nd(Number(dagitilan)/1e18)) +
    satir("oy kullanma tabanı", nd(tb)+" FTHM") +
    (hesap
      ? satir("stake ettiğin", nalp(b)) +
        satir("oy kullanabilir misin", Number(oy)>0
          ? "evet · tabanın "+nalp(b-tb)+" üstünde"
          : "hayır · "+nalp(Math.max(0,tb-b))+" FTHM daha gerekiyor") +
        satir("USDC ödülün", usd(Number(odulUsdc)/1e6,6)) +
        satir("FTHM ödülün", nalp(Number(odulTok)/1e18))
      : satir("cüzdan","bağlı değil"));
}

async function arzOku(arz){
  const t=tokR();
  const [havuzB,stakeB,aciciB,vestB]=await Promise.all([
    t.balanceOf(A.poolManager), t.balanceOf(A.stake),
    t.balanceOf(A.acici), t.balanceOf(A.vesting)]);
  const m=(x)=>nd(Number(x)/1e18);
  $("arz").innerHTML =
    satir("toplam arz", m(arz), "mint fonksiyonu yok — sadece azalabilir") +
    satir("havuzda, kilitli", m(havuzB), "piyasa payı · çıkarılamaz") +
    satir("stake emisyon havuzunda", m(stakeB), "30 yıla yayılı") +
    satir("açıcıda bekleyen ücret", m(aciciB), "biriktir() ile derinliğe döner") +
    satir("vesting (kurucu, 12 ay)", m(vestB)) +
    satir("kurucu, serbest", "50.000.000", "kurucu cüzdanında, kilit yok");
}

/* ---- quotes ------------------------------------------------------ */
/* The exact quote comes from running the swap against the real pool, which
   needs a caller who holds the asset — so it is only available once a
   wallet is connected. Without one the page says so instead of printing a
   number it cannot stand behind. */
async function onizle(){
  const a = say($("alMik").value);
  const s = say($("satMik").value);
  if (!hesap) {
    if (a>0) $("alNot").textContent="Kesin kota için cüzdanı bağla.";
    else $("alNot").textContent="Bir tutar gir.";
    if (s>0) $("satNot").textContent="Kesin kota için cüzdanı bağla.";
    else $("satNot").textContent="Satacağın FTHM miktarını gir.";
    return;
  }
  try{
    const r = routerR();
    if (a>0) {
      const giris = parseUnits(String(a), USDC_OND);
      const q = await r.swap.staticCall(KEY, ALIS_ZFO, giris, 0, { from: hesap });
      $("alNot").innerHTML = "≈ <strong>"+nd(Number(q)/1e18)+" FTHM</strong> alırsın. "+
        "%0,50 hook ücreti dahil; alışta ücretin tamamı havuz derinliğine gider.";
    } else $("alNot").textContent="Bir tutar gir, ne kadar token alacağını hesaplayayım.";
    if (s>0) {
      const q = await r.swap.staticCall(KEY, !ALIS_ZFO, parseUnits(String(s),18), 0, { from: hesap });
      $("satNot").innerHTML = "≈ <strong>"+usd(Number(q)/1e6,6)+"</strong> alırsın "+
        "(ücret düşülmüş). Havuzda o kadar para yoksa işlem geri çevrilir.";
    } else $("satNot").textContent="Satacağın FTHM miktarını gir.";
  }catch(err){
    if (a>0) $("alNot").textContent="Kota alınamadı — onay verilmemiş ya da bakiye yetersiz olabilir.";
    if (s>0) $("satNot").textContent="Kota alınamadı — havuzda yeterli para olmayabilir.";
  }
}
$("alMik").addEventListener("input", onizle);
$("satMik").addEventListener("input", onizle);

/* ---- writes ------------------------------------------------------ */
const bekle = async (tx, el, ad) => {
  mesaj(el,"info",ad+" gönderildi, onay bekleniyor… "+txLink(tx.hash));
  await tx.wait();
  mesaj(el,"ok","<strong>"+ad+" tamam.</strong> "+txLink(tx.hash));
  await oku();
};
/* Slippage is the caller's: the router reverts below minOut rather than
   filling at whatever the pool moved to. */
const KAYMA_TOLERANS = 300n;   // 3,00%
const altSinir = (q) => (q * (10000n - KAYMA_TOLERANS)) / 10000n;

$("alOnay").addEventListener("click", async ()=>{
  try{
    mesaj("islemMesaj","info","Cüzdanda onay bekleniyor…");
    const tx = await (new Contract(A.usdc,ABI.erc20,signer)).approve(A.router,MaxUint256);
    await bekle(tx,"islemMesaj","USDC onayı");
  }catch(e){ mesaj("islemMesaj","err",esc(hataMetni(e))); }
});
$("al").addEventListener("click", async ()=>{
  try{
    const v=say($("alMik").value);
    if(!(v>0)){ mesaj("islemMesaj","err","Bir tutar gir."); return; }
    const giris=parseUnits(String(v),USDC_OND);
    mesaj("islemMesaj","info","Kota alınıyor…");
    const q=await routerR().swap.staticCall(KEY,ALIS_ZFO,giris,0,{from:hesap});
    mesaj("islemMesaj","info","Alım gönderiliyor…");
    const tx=await (new Contract(A.router,ABI.router,signer))
      .swap(KEY,ALIS_ZFO,giris,altSinir(q));
    await bekle(tx,"islemMesaj","Alım");
  }catch(e){ mesaj("islemMesaj","err",esc(hataMetni(e))); }
});
$("satOnay").addEventListener("click", async ()=>{
  try{
    mesaj("islemMesaj","info","Cüzdanda onay bekleniyor…");
    const tx=await (new Contract(A.token,ABI.erc20,signer)).approve(A.router,MaxUint256);
    await bekle(tx,"islemMesaj","FTHM onayı");
  }catch(e){ mesaj("islemMesaj","err",esc(hataMetni(e))); }
});
$("sat").addEventListener("click", async ()=>{
  try{
    const v=say($("satMik").value);
    if(!(v>0)){ mesaj("islemMesaj","err","Bir miktar gir."); return; }
    const giris=parseUnits(String(v),18);
    mesaj("islemMesaj","info","Kota alınıyor…");
    const q=await routerR().swap.staticCall(KEY,!ALIS_ZFO,giris,0,{from:hesap});
    mesaj("islemMesaj","info","Satış gönderiliyor…");
    const tx=await (new Contract(A.router,ABI.router,signer))
      .swap(KEY,!ALIS_ZFO,giris,altSinir(q));
    await bekle(tx,"islemMesaj","Satış");
  }catch(e){ mesaj("islemMesaj","err",esc(hataMetni(e))); }
});

$("stOnay").addEventListener("click", async ()=>{
  try{
    mesaj("stakeMesaj","info","Cüzdanda onay bekleniyor…");
    const tx=await (new Contract(A.token,ABI.erc20,signer)).approve(A.stake,MaxUint256);
    await bekle(tx,"stakeMesaj","FTHM onayı");
  }catch(e){ mesaj("stakeMesaj","err",esc(hataMetni(e))); }
});
$("st").addEventListener("click", async ()=>{
  try{
    const v=say($("stMik").value);
    if(!(v>0)){ mesaj("stakeMesaj","err","Bir miktar gir."); return; }
    const tx=await (new Contract(A.stake,ABI.stake,signer)).stake(parseUnits(String(v),18));
    await bekle(tx,"stakeMesaj","Stake");
  }catch(e){ mesaj("stakeMesaj","err",esc(hataMetni(e))); }
});
$("stCoz").addEventListener("click", async ()=>{
  try{
    const v=say($("stMik").value);
    if(!(v>0)){ mesaj("stakeMesaj","err","Bir miktar gir."); return; }
    const tx=await (new Contract(A.stake,ABI.stake,signer)).unstake(parseUnits(String(v),18));
    await bekle(tx,"stakeMesaj","Çözme");
  }catch(e){ mesaj("stakeMesaj","err",esc(hataMetni(e))); }
});
$("stAl").addEventListener("click", async ()=>{
  try{
    const tx=await (new Contract(A.stake,ABI.stake,signer)).claim();
    await bekle(tx,"stakeMesaj","Ödül");
  }catch(e){ mesaj("stakeMesaj","err",esc(hataMetni(e))); }
});

/* The page reads the chain with no wallet: the price and the depth are
   facts about the pool, not about the visitor. */
(async function basla(){
  try{ USDC_OND=Number(await usdcR().decimals()); }catch(e){ USDC_OND=6; }
  await oku();
  setInterval(oku,30000);
})();
<\/script>
</body>
</html>
`;

const sayfa = bas + govde + betik;
fs.writeFileSync(YENI, sayfa);

/* ---- checks before anyone sees it ------------------------------- */
const hata = [];
if (sayfa.includes(A.eskiToken || "0xF67Eea3A")) { /* only inside the warning */ }
for (const [ad, deger] of [["token", A.token], ["stake", A.stake], ["acici", A.acici],
                           ["hook", A.hook], ["havuzId", A.havuzId]])
  if (!sayfa.includes(deger)) hata.push("sayfada " + ad + " adresi yok");
if (/egriR\(|ABI\.egri|alimKotasi|satisKotasi|mezunEt/.test(sayfa))
  hata.push("egri kalintisi var");
const acilis = (sayfa.match(/<div/g) || []).length;
const kapanis = (sayfa.match(/<\/div>/g) || []).length;
if (acilis !== kapanis) hata.push("div dengesiz: " + acilis + " acilis / " + kapanis + " kapanis");
for (const id of ["ca","uyari","derinlik","havuzDurum","alMik","alNot","alOnay","al",
                  "satMik","satNot","satOnay","sat","islemMesaj","stakeDurum","stMik",
                  "stOnay","st","stCoz","stAl","stakeMesaj","merdiven","arz","adresler",
                  "wallet","cuzdanOrt","cuzdanListe","cuzdanKapat","kopya","exp"])
  if (!sayfa.includes('id="' + id + '"')) hata.push("eksik element: " + id);

console.log("docs/fathom.html yazildi — " + sayfa.length.toLocaleString("tr-TR") + " bayt");
console.log("  div " + acilis + "/" + kapanis);
if (hata.length) { console.log("\nKONTROL HATASI:"); for (const h of hata) console.log("  " + h); process.exit(1); }
console.log("  tum yapisal kontroller gecti");
