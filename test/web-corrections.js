// User corrections: original sources, honest failures, no synthetic web-page artifacts.
const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path');
const {handle,target}=require('../web-preview');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tulai-web-corrections-'));let checks=0;
 const check=(ok,msg)=>{assert(ok,msg);checks++};
 try{
  for(const q of ['show me latest technology in react native render the webpage here','latest React Native release','ipakita ang React Native webpage dito'])check(target(q)==='https://reactnative.dev/blog',q);
  for(const q of ['what is your current model','give me that as an html web page','export this report as HTML','what are my reminders'])check(target(q)===null,q);
  let calls=0;const deps={dir,read:async()=>{calls++;return {title:'Official source',url:'https://example.com/release',text:'Verified fixture text'}},register:()=>null};
  const r=await handle('read webpage https://example.com',{},deps);
  check(calls===1,'must actually read the source');
  check(r.reply.includes('[Open original website](https://example.com/release)'),'use final source URL');
  check(r.reply.includes('screenshot was unavailable'),'do not claim missing screenshot');
  check(!fs.readdirSync(dir).some(f=>/\.html?$/.test(f)),'never generate a reader HTML file');
  const unknown=await handle('show latest technology webpage',{},deps);check(calls===1&&unknown.via==='web source needed','unknown source needs URL, not fabricated facts');
  const failed=await handle('latest React Native',{}, {...deps,read:async()=>{throw Error('offline')}});check(!failed.views&&failed.reply.includes('not verified'),'no stale latest facts on failure');
  const cancelled=await handle('latest React Native',{signal:{aborted:true}},deps);check(cancelled.reply==='Stopped.'&&!cancelled.views,'no artifacts after cancellation');
  const invalid=await handle('latest React Native',{}, {...deps,read:async()=>({url:'javascript:alert(1)',text:'unsafe'})});check(!invalid.views&&invalid.via==='web read failed','reject unsafe source links');
  check(await handle('browse https://example.com using account client',{},deps)===null,'preserve account-specific route');
  console.log(`PASS ${checks} source and correction regression checks`);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
