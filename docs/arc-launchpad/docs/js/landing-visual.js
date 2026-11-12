import { JsonRpcProvider, Contract } from '../vendor/ethers.min.js';
import { fthmDurum } from './fthm-veri.js';

// 9 Nov 2026: ARCP 2 first (docs/veri/arcp2.json): its presale price and how much the round has raised,
// its supply from the token; the previous ARCP's figures are the fallback if that record is missing.
// 12 Nov 2026: the figures load shortly after the page does, not when the section scrolls into view,
// and nothing on the page is hidden waiting for a scroll (the old reveal effect left sections blank).
let started=false;
async function loadFthm(){
 if(started)return;started=true;
 const status=document.querySelector('#fthm-status');
 if(!status)return;
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
setTimeout(loadFthm,600);

// The phone menu is a <details>: it opens without script. This only closes it after a link
// is chosen, when Escape is pressed, or when a tap lands outside it.
const menu=document.querySelector('details.mmenu');
if(menu){
 menu.addEventListener('click',e=>{if(e.target.closest('a'))menu.open=false;});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}});
 document.addEventListener('click',e=>{if(menu.open&&!menu.contains(e.target))menu.open=false;});
}
// The desktop "More" panel opens on hover and focus (CSS); Escape moves focus out so it closes.
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const d=document.activeElement&&document.activeElement.closest('.drop');if(d)document.activeElement.blur();}});
