import { JsonRpcProvider } from '../vendor/ethers.min.js';
import { fthmDurum } from './fthm-veri.js';

// Figures are loaded only when the token section approaches the viewport.
const panel=document.querySelector('#fthm');
let started=false;
async function loadFthm(){
 if(started)return;started=true;
 const status=document.querySelector('#fthm-status');
 try{
  const provider=new JsonRpcProvider('https://rpc.mainnet.arc.io',5042,{staticNetwork:true,batchMaxCount:1});
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
