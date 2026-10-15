/* olc-wnvda-sahipler.js — who holds the live wNVDA on Arc, from its deployment block.
 * Every Transfer since block 24512832, in 5000-block windows (the Arc RPC rejects
 * wider ranges), summed per address. The holder total must equal totalSupply to
 * the wei; on 14 Oct 2026 it did, with 0 unread windows. Writes rapor/wnvda-sahipler.json. */
const {id}=require("ethers");const fs=require("fs");const W="0xA3cd6fD4316DB70C06931A233FDddC48c2879DC4";const T=id("Transfer(address,address,uint256)");
const rpc=(m,p)=>fetch("https://rpc.mainnet.arc.io",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:m,params:p})}).then(r=>r.json()).catch(e=>({error:{message:e.message}}));
(async()=>{const son=parseInt((await rpc("eth_blockNumber",[])).result,16);const bak={};const kayit=[];let okunamayan=0;
for(let b=24512832;b<=son;b+=5000){let r;for(let d=0;d<8;d++){r=await rpc("eth_getLogs",[{address:W,topics:[T],fromBlock:"0x"+b.toString(16),toBlock:"0x"+Math.min(b+4999,son).toString(16)}]);if(r.result)break;await new Promise(s=>setTimeout(s,2500*(d+1)));}
 if(!r.result){okunamayan++;console.log("okunamadi",b,JSON.stringify(r.error).slice(0,80));continue;}
 for(const l of r.result){const f="0x"+l.topics[1].slice(26),t="0x"+l.topics[2].slice(26),v=BigInt(l.data);bak[f]=(bak[f]||0n)-v;bak[t]=(bak[t]||0n)+v;kayit.push({blok:parseInt(l.blockNumber,16),tx:l.transactionHash,f,t,v:v.toString()});console.log("blok",parseInt(l.blockNumber,16),f,"->",t,Number(v)/1e18);}
 await new Promise(s=>setTimeout(s,1500));}
const sahip=Object.entries(bak).filter(([a,v])=>v>0n).map(([a,v])=>({a,v:v.toString(),n:Number(v)/1e18}));
console.log("transfer",kayit.length,"okunamayan pencere",okunamayan);for(const s of sahip)console.log("SAHIP",s.a,s.n);
fs.writeFileSync("rapor/wnvda-sahipler.json",JSON.stringify({okundu:new Date().toISOString(),sonBlok:son,okunamayan,kayit,sahip},null,1));})();
