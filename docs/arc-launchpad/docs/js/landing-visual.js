import { JsonRpcProvider, Contract } from '../vendor/ethers.min.js';
import { fthmDurum } from './fthm-veri.js';

// Figures are loaded only when the token section approaches the viewport.
// 9 Nov 2026: ARCP 2 first (docs/veri/arcp2.json): its presale price and how much the round has raised,
// its supply from the token; the previous ARCP's figures are the fallback if that record is missing.
const panel=document.querySelector('#fthm');
let started=false;
async function loadFthm(){
 if(started)return;started=true;
 const status=document.querySelector('#fthm-status');
 try{
  const provider=new JsonRpcProvider('https://rpc.mainnet.arc.io',5042,{staticNetwork:true,batchMaxCount:1});
  const k=await fetch('veri/arcp2.json').then(r=>r.ok?r.json():null).catch(()=>null);
  if(k&&k.canli){
   const os=new Contract(k.onSatis,['function tur() view returns (uint256)','function turToplam(uint256) view returns (uint256)','function kuruldu() view returns (bool)'],provider);
   const tk=new Contract(k.token,['function totalSupply() view returns (uint256)'],provider);
   const tur=await os.tur();
   const [top,arz,kur]=await Promise.all([os.turToplam(tur),tk.totalSupply(),os.kuruldu()]);
   document.querySelector('#fthm-price').textContent=kur?'pool open':'$0.00006 presale';
   document.querySelector('#fthm-supply').textContent=(Number(arz/10n**18n)/1e9).toLocaleString('en-US',{maximumFractionDigits:3})+'B';
   status.textContent='ARCP 2, read from Arc · presale raised $'+Math.round(Number(top)/1e6).toLocaleString('en-US')+' of $15,000 · '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC';
   return;
  }
  const d=await fthmDurum(provider);
  document.querySelector('#fthm-price').textContent='$'+d.fiyat.toFixed(8);
  document.querySelector('#fthm-supply').textContent=(d.arz/1e9).toLocaleString('en-US',{maximumFractionDigits:3})+'B';
  const burned=document.querySelector('#fthm-burned');if(burned)burned.textContent=Math.round(d.yakilan).toLocaleString('en-US');
  status.textContent='Read directly from Arc · '+new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC';
 }catch{status.textContent='Live figures unavailable. Open ARCP to retry.';document.querySelectorAll('.fthm-metrics b').forEach(x=>x.textContent='Unavailable');}
}
if('IntersectionObserver'in window){
 const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){loadFthm();observer.disconnect();}},{rootMargin:'250px'});
 if(panel)observer.observe(panel);
 const reveal=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){e.target.classList.add('is-visible');reveal.unobserve(e.target);}},{threshold:.08});
 if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.querySelectorAll('.journey-card,.fthm-panel,.eco .ec').forEach(el=>{el.classList.add('reveal-ready');reveal.observe(el);});
}else loadFthm();
