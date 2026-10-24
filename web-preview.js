// Read the original website and show its captured screenshot with a direct source link.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
function target(text){
 const t=String(text);if(/\b(export|give me that|save (?:it|that)|convert)\b/i.test(t))return null;
 const web=/\b(webpage|web page|website|browse|internet|online)\b/i.test(t),fresh=/\b(latest|newest|current|up.to.date)\b/i.test(t);
 if(!web&&!(fresh&&/\b(react native|technology|technologies|release|version|news)\b/i.test(t)))return null;
 if(!web&&/\b(your|my|local|llm|model)\b/i.test(t))return null;
 const address=t.match(/https?:\/\/[^\s<>"']+/i)?.[0]?.replace(/[.,!?]+$/,'');
 if(address)return address;
 if(/\breact native\b/i.test(t))return 'https://reactnative.dev/blog';
 return '';
}
async function handle(text,opts={},deps={}){
 const address=target(text);if(address===null)return null;
 // Let account-specific commands retain their authenticated browser workflow.
 if(/using account\b/i.test(text))return null;
 if(!address)return {reply:'Which website should I read? Send its URL and I can show a screenshot of the original page here. I need a live source before answering what is latest.',via:'web source needed'};
 try{
  const r=await (deps.read||require('./bot-browser').researchRead)(address,{signal:opts.signal});
  if(opts.signal?.aborted)return {reply:'Stopped.'};
  if(r.needsLogin)return {reply:'This page requires sign-in. Connect its browser account before I can read it.',via:'web sign-in required'};
  if(!String(r.text||'').trim())throw Error('The page returned no readable text.');
  const dir=deps.dir||path.join(os.homedir(),'Documents','Tulai Reports');fs.mkdirSync(dir,{recursive:true});
  const id=crypto.randomUUID(),stamp=new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'});
  const source=new URL(r.url||address);if(!['https:','http:'].includes(source.protocol)||source.username||source.password)throw Error('Invalid source URL');
  const sourceUrl=source.href.replace(/[()]/g,c=>encodeURIComponent(c));
  const register=deps.register||require('./viewer').register,views=[];
  if(r.screenshot&&fs.existsSync(r.screenshot)){const shot=path.join(dir,'Web snapshot '+id+'.png');fs.copyFileSync(r.screenshot,shot);views.push(register(shot));}
  // Quote actual fetched content, rather than asking the model to invent release facts.
  let content=String(r.text).replace(/\r/g,'');const release=content.search(/React Native 0\.\d+\s*[-–—]/);if(release>=0)content=content.slice(release);
  const excerpt=content.slice(0,1400).trim().split('\n').filter(Boolean).slice(0,5).map(s=>'> '+s).join('\n');
  return {reply:`**${r.title||'Live webpage'}**\n\nFrom the page I just read:\n\n${excerpt}\n\n[Open original website](${sourceUrl})\n\n*Read ${stamp} (Asia/Manila). ${views.filter(Boolean).length ? "Below is a screenshot captured from the original website. Use the source link for the live page." : "The screenshot was unavailable; use the source link to view the live page."}*`,views:views.filter(Boolean),via:'live web preview'};
 }catch(e){if(opts.signal?.aborted)return {reply:'Stopped.'};return {reply:'I could not read the live webpage: '+String(e.message).slice(0,250)+'. I have not verified the latest information. Try again or send another source URL.',via:'web read failed'};}
}
module.exports={handle,target};
