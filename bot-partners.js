// Main-bot entry point for bounded partner discussions.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const pending=new Map();
const directory=()=>path.join(process.env.GC_DATA_DIR||__dirname,'bot-discussions');
const sessionKey=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,24);
function previous(key){try{return JSON.parse(fs.readFileSync(path.join(directory(),sessionKey(key)+'-latest.json'),'utf8'))}catch{return null}}
function parse(text){
 const t=String(text).trim();
 if(/\b(?:don't|do not|never|stop|cancel)\b/i.test(t))return null;
 if(!/\b(bot|bots|partner|partners|companion|companions)\b/i.test(t)||!/\b(create|add|spawn|make|bring|talk|discuss|collaborate)\b/i.test(t))return null;
 if(/^(?:why|what|explain|how (?:do|does|did))\b/i.test(t))return null;
 const number=/\b(\d+|two|three|four|five|six|seven|eight)\s+(?:bots|partners|companions)\b/i.exec(t);
 const words={two:2,three:3,four:4,five:5,six:6,seven:7,eight:8};
 const count=number?(words[number[1].toLowerCase()]||Number(number[1])):2;
 const topic=/\b(?:about|on the topic of|topic\s*:)\s*(.+)/i.exec(t)?.[1] || /\bdiscuss\s+(?!with\b|each\b)(.+)/i.exec(t)?.[1];
 return {count,topic};
}
async function handle(text,opts={}){
 const key=opts.sid||'bot';let request=parse(text);
 if(opts.signal?.aborted)return {reply:'Partner discussion stopped.'};
 if(pending.get(key)?.expires<Date.now())pending.delete(key);
 if(!request&&pending.has(key)){
  if(/^(?:cancel|stop|never mind)[.!]?$/i.test(text)){pending.delete(key);return {reply:'Partner discussion cancelled.'};}
  if(/^(?:(?:please|can you|could you)\s+)?(?:open|close|send|delete|search|launch|quit|remind|stop|start)\b/i.test(text)){pending.delete(key);return null;}
  request={...pending.get(key),topic:String(text)};
 }
 const prior=previous(key);
 if(!request&&/^(?:continue|resume|improve|review) (?:the |our |that )?(?:bot |partner |team )?discussion[.!]?$/i.test(text)&&prior)request={count:prior.count,topic:prior.topic};
 if(!request)return null;
 if(!Number.isInteger(request.count)||request.count<2||request.count>8)return {reply:'Choose a team of 2 to 8 bots. How many would you like?'};
 const room=global.__tulaiRoom;
 if(!room)return {reply:'Partner companions are unavailable. Restart Tulai and try again.'};
 if(global.__tulaiTeamBusy)return {reply:'Your bot team is already discussing a request. Stop it before starting another.'};
 // Take the shared lock before showing the asynchronous native window.
 global.__tulaiTeamBusy=true;
 let stop,record,file;
 const persist=()=>{if(!record)return;fs.mkdirSync(directory(),{recursive:true});const data=JSON.stringify(record,null,2);fs.writeFileSync(file,data,{mode:0o600});const latest=path.join(directory(),sessionKey(key)+'-latest.json');fs.writeFileSync(latest+'.tmp',data,{mode:0o600});fs.renameSync(latest+'.tmp',latest);};
 try{
  await room.show(request.count);
  if(opts.signal?.aborted)return {reply:'Partner discussion stopped.'};
  if(!request.topic){pending.set(key,{...request,expires:Date.now()+300000});return {reply:`Your ${request.count}-bot team is ready. What topic should we discuss?`,via:'bot partners'};}
  pending.delete(key);
  const revision=room.revision();stop=()=>room.stop();opts.signal?.addEventListener('abort',stop,{once:true});
  const cancelled=()=>opts.signal?.aborted||room.revision()!==revision;
  record={topic:request.topic,count:request.count,turns:[],verified:false,status:'running',startedAt:new Date().toISOString()};
  file=path.join(directory(),crypto.randomUUID()+'.json');persist();
  const history=[...(opts.history||[])];
  if(prior?.topic===request.topic&&prior.turns?.length)history.push({role:'assistant',content:'Previous unverified discussion; correct rather than blindly repeat it: '+prior.turns.at(-1).text});
  const turns=await require('./bot-team').discuss({text:request.topic,count:request.count,role:'team',history,lessons:opts.lessons},{chat:a=>(opts.nlu||require('./nlu')).chat(a),stopped:cancelled,send:async e=>{
   if(e.type==='working')opts.onProgress?.({type:'status',text:`${e.role} is thinking…`});
   if(e.type==='answer'){record.turns.push(e);persist();opts.onProgress?.({type:'text',delta:`\n\n${e.label}: ${e.text}`});if(!cancelled())await room.answer(e,true);}
  }});
  record.status=turns&&!cancelled()?'complete':'stopped';persist();
  if(record.status==='stopped')return {reply:'Partner discussion stopped. Completed contributions were saved; say “resume the discussion” to continue.',via:'bot partners'};
  return {reply:turns.at(-1).text+'\n\nDiscussion saved as an unverified reference. Say “review the discussion” to revisit it, or “Remember that…” to save your correction.',via:'bot partners'};
 }catch(e){if(record){record.status='failed';record.error=String(e.message);try{persist()}catch{}}return {reply:`The partner discussion could not finish: ${e.message}. ${record?.turns.length?'Completed contributions were saved. Say “resume the discussion” to try again.':'Please try again.'}`,via:'bot partners'};
 }finally{global.__tulaiTeamBusy=false;if(stop)opts.signal?.removeEventListener('abort',stop);}
}
module.exports={parse,handle};
