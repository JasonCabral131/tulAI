// Chat-triggered local training. One bounded run; never auto-activates an adapter.
const fs=require('fs'),path=require('path'),os=require('os'),{spawn}=require('child_process');
const home=()=>path.join(process.env.GC_DATA_DIR||path.join(os.homedir(),'Library/Application Support/gateway-chat'),'training');
const file=()=>path.join(home(),'chat-job.json');
function job(){try{return JSON.parse(fs.readFileSync(file(),'utf8'))}catch{return null}}
function alive(j){if(!j?.pid||!Number.isInteger(j.pid)||j.pid<2)return false;try{process.kill(j.pid,0);return j.status==='running'}catch{return false}}
function save(j){fs.mkdirSync(home(),{recursive:true,mode:0o700});fs.writeFileSync(file(),JSON.stringify(j,null,2),{mode:0o600})}
let starting=false;
const SKILLS=/^(?:please\s+)?(?:(?:train|practice|improve|sharpen)\s+(?:your\s+)?(?:weak\s+)?skills|improve yourself|train what failed|train (?:on )?what you got wrong|practi[cs]e what (?:you )?failed)(?:\s+please)?[.!]?$/i;
function matches(t){return /^(?:please\s+)?(?:train yourself|(?:keep(?: on)?|continue|start)\s+(?:training|fine[- ]?tuning)(?:\s+and\s+training)?)(?:\s+please)?[.!]?$/i.test(String(t).trim())||SKILLS.test(String(t).trim())}
/** "latest training of jira?": the real state of a skill pack (version, trained or not, running now, last test result), never a guess. */
const PACK_WORDS=[['jira-mastery',/\bjira\b/i],['gitlab-browser-ai',/\bgit ?lab\b/i],['git-mastery',/\bgit\b|merge request/i],['architect-ai',/\barchitect\w*/i],['code-review-ai',/\bcode review\w*|\breviewer\b/i],['qa-test-ai',/\bqa\b|\btest engineer\w*/i],['frontend-ai',/\bfrontend\b|\bfront-end\b/i],['react-engineer-ai',/\breact\b(?! native)/i],['react-native-engineer-ai',/\breact native\b/i],['uiux-ai',/\bui\/?ux\b|\bdesign\b/i],['frontend-qa-ai',/\bfrontend qa\b/i],['charts-reporting-ai',/\bchart\w*|\bexecutive\b/i],['eng-productivity-ai',/\bproductivity\b|\bengineering report\w*/i],['reporting-mastery',/\breporting\b|\brag status\b/i],['meeting-skills',/\bmeeting (?:notes|skills)\b/i]];
function packStatus(text){
 const t=String(text||'');if(!/\b(?:train\w*|fine[- ]?tun\w*|skill pack\w*|learn\w*)\b/i.test(t)||/^(?:please\s+)?(?:train|start|begin|stop|fine[- ]?tune)\b/i.test(t.trim()))return null;
 let sp;try{sp=require('./skill-packs')}catch{return null}
 const list=sp.list(),hit=PACK_WORDS.find(([id,re])=>re.test(t)&&list.some(p=>p.id===id));
 if(!hit){ // "what are the other fine tunings, can you check the status": every pack, one line each
  if(/^(?:show (?:my |your )?)?(?:training|fine[- ]?tuning) (?:status|progress)[.!]?$/i.test(t.trim()))return null;
  if(/\b(?:graph|chart|image|picture|export|excel|csv|memory|vector)\b/i.test(t))return null;
  if(!(/\b(?:other|others|all|every|list|status|check|progress|latest|last|recent|current|newest|what|how)\b.*\b(?:train\w*|fine[- ]?tun\w*|skill packs?)\b/i.test(t)||/\b(?:train\w*|fine[- ]?tun\w*|skill packs?)\b.*\b(?:status|check|progress|list|latest|result)\b/i.test(t)))return null;
  const lines=[];let run=null;try{const m=metrics(),j=job();if(m.running)run=`A fine-tuning is running now (${(j?.packs||[]).map(id=>list.find(p=>p.id===id)?.name||id).join(', ')||'built-in skills'}): step ${m.step} of ${m.iterations}. The new brain only switches on if it passes every check (skill packs: at least 85% overall, none under 80%).`}catch{}
  for(const p of list)lines.push(`- ${p.icon} **${p.name}** (v${p.version}): ${p.state==='not trained'?'not trained yet':p.state==='up to date'?'trained'+(p.trainedAt?' '+new Date(p.trainedAt).toLocaleDateString():''):'update available'}${p.selected?', selected':''}`);
  let brain='';try{const st=require('./active-model').state(),cur=st.current?.run,h=history(),act=h.find(x=>x.run===cur),last=h.find(x=>x.run!==cur&&x.status!=='previous');const nm=(ids)=>(ids||[]).map(id=>list.find(p=>p.id===id)?.name||id).join(', ');
   if(act)brain=`**My brain now:** trained ${new Date(act.at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}${act.score?`, passed ${act.score.score} of ${act.score.total} checks`:''}. ${act.learned.slice(3).join(' ')||'Built-in and memory skills only.'}\n\n`;
   if(last&&last.at>(act?.at||0))brain+=`**Latest training:** ${new Date(last.at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}, ${last.label.toLowerCase()}${last.score?` (${last.score.score} of ${last.score.total} checks)`:''}${last.note?`. ${last.note}`:''}. It was not switched on, so my brain above stays.\n\n`;}catch{}
  return {reply:`${brain}${run?run+'\n\n':'No fine-tuning is running right now.\n\n'}${lines.join('\n')}\n\nAsk about one, for example "latest training of jira", to see its last test result.`,via:'skill pack status'};
 }
 const p=list.find(x=>x.id===hit[0]);
 const out=[`**${p.name}** (version ${p.version}): ${p.state==='not trained'?'not trained on this Mac yet':p.state==='up to date'?`trained, version ${p.trainedVersion}${p.trainedAt?', '+new Date(p.trainedAt).toLocaleString():''}`:`trained with version ${p.trainedVersion}; a newer version (${p.version}) is available`}.${p.selected?' It is included in every training.':''}`];
 try{const m=metrics(),j=job();if(m.running&&(j?.packs||[]).includes(p.id))out.push(`I am fine-tuning it right now: step ${m.step} of ${m.iterations}. It is only switched on if every test passes at 90% or better.`);else if(m.running)out.push(`A training is running (step ${m.step} of ${m.iterations}) but it does not include this pack.`)}catch{}
 try{const root=path.join(home(),'runs');let runs=[];try{runs=fs.readdirSync(root).filter(n=>n.startsWith('pilot-')).sort().reverse()}catch{}let shown=false;
  for(const run of runs){let g=null;try{g=JSON.parse(fs.readFileSync(path.join(root,run,'deployment','gguf-gate.json'),'utf8'))}catch{}const grp=g&&g.groups&&g.groups['pack:'+p.id];if(!grp)continue;
   const fails=(g.cases||[]).filter(c=>c.group==='pack'&&c.pack===p.id&&!c.passed).map(c=>c.name.replace(/^[^:]+: /,'')).slice(0,3),act=require('./active-model').state().current?.run===run;
   out.push(`Last finished run: it passed ${grp.passed} of ${grp.total} ${p.name} tests (${Math.round(grp.passed*100/grp.total)}%)${grp.passed*100>=grp.total*80?'':', below the 80% minimum for a pack'}${act?'; that model is active now':g.passed?'; it passed every check':'; it was NOT switched on'}.${fails.length?` Missed: ${fails.join(' | ')}.`:''}`);shown=true;break}
  if(!shown&&p.state==='not trained')out.push('No finished run has tested it yet. Press Fine-tune on the pack in Settings, Train your local bot AI, Skill packs.')}catch{}
 return {reply:out.join(' '),via:'skill pack status'};
}
async function handle(text,opts={}){
 const t=String(text).trim();
 {const ps=packStatus(t);if(ps)return ps}
 if(/^(?:show (?:my |your )?)?(?:training|fine[- ]?tuning) (?:status|progress)[.!]?$/i.test(t))return {reply:require('./finetune-status').status(),via:'local training status'};
 if(/^(?:keep (?:on )?training|train (?:continuously|non[- ]?stop|all the time)|never stop training|resume training|tuloy(?:-tuloy)? (?:ang )?training)[.!]?$/i.test(t)){saveFirst({...firstState(),keepTraining:true});setTimeout(()=>autoStart().catch(()=>{}),1000);return {reply:'Training keeps going: when a round ends, pass or fail, the next one starts from the best brain so far. Say "stop training" to pause it.',via:'local training'}}
 if(/^stop (?:training|fine[- ]?tuning)[.!]?$/i.test(t)){
  saveFirst({...firstState(),keepTraining:false}); // a stop also pauses the non-stop loop, until "keep training"
  const j=job();if(!alive(j))return {reply:'Training is paused: no new rounds will start until you say "keep training".'};
  try{process.kill(-j.pid,'SIGTERM');save({...j,status:'stopped'});return {reply:'Stopped the training process and paused training until you say "keep training". The active bot model is unchanged.'}}catch(e){return {reply:'Could not stop training: '+e.message}}
 }
 if(!matches(t))return null;
 const old=job();if(starting||alive(old))return {reply:'A local training run is already running. Say “training status” for progress or “stop training” to stop it.',via:'local training'};
 const skills=SKILLS.test(t);
 const packIds=skills?((opts.packs&&opts.packs.length)?opts.packs:(()=>{try{return require('./skill-packs').selectedIds()}catch{return []}})()):[]; // one-click skill packs; chosen packs are always part of a skills training so a retrain never forgets them
 if(skills){try{await require('./training-pack').beforeTraining()}catch{} try{await require('./free-data').beforeTraining()}catch{}} // the GitHub training pack (if a repo is set) is refreshed first, at most once a day
 const collected=skills?{examples:[],ready:true}:require('./task-dataset').collect();if(!collected.ready)return {reply:`Collected ${collected.examples.length} task examples: ${collected.eligible} training targets, ${collected.unverified} unverified, ${collected.excluded} excluded. ${collected.reason} I have not started another demo run. Open View dataset to inspect the task evidence.`,via:'task dataset not ready'};
 const python=path.join(home(),'venv/bin/python');if(!fs.existsSync(python))return {reply:'The local training runtime is not installed on this Mac yet. I have not started a run.',via:'local training unavailable'};
 // Python cannot read files inside app.asar. Stage only the bundled runner and fixtures.
 const stage=path.join(home(),'chat-runner');for(const f of ['scripts/finetune.py','scripts/evaluate-finetune.py','scripts/prepare-activation.py','scripts/activation-gate.py','scripts/memory-skills.py','scripts/free-data.py','scripts/pack-skills.py','scripts/coding-data.py','scripts/coding-practice.py','scripts/springboot-data.py','scripts/springboot-practice.py','scripts/skill-data.py','training-config/pilot-examples.json','training-config/rehearsal.json','training-config/nlu-examples.json','training-config/chat-rehearsal.json','training-config/skills-recipe.json','training-config/nlu-gate-cases.json','training-config/acceptance-prompts.json','training-config/agent-episodes.json','training-config/free-data.json','training-config/skill-packs.json','training-config/jira-knowledge.json']){const dest=path.join(stage,f);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,f),dest)}
 const snapshot=skills?null:path.join(home(),'task-dataset-'+Date.now()+'.json');if(snapshot)fs.writeFileSync(snapshot,JSON.stringify(collected),{mode:0o600});
 const log=path.join(home(),'chat-training.log'),fd=fs.openSync(log,'a',0o600),logOffset=fs.statSync(log).size;
 try{
  starting=true;
  const child=spawn(python,[path.join(stage,'scripts/finetune.py'),'run','--evaluate','--prepare-activation',...(skills?['--skills']:['--task-data',snapshot])],{detached:true,stdio:['ignore',fd,fd],env:{...process.env,HF_HUB_DISABLE_TELEMETRY:'1',WANDB_MODE:'disabled',TULAI_APP_DIR:__dirname,TULAI_NODE:process.execPath,TULAI_DATA_DIR:process.env.GC_DATA_DIR||path.dirname(home()),TULAI_CUSTOM_DIR:require('./custom-training').dir(),TULAI_PACKS:packIds.join(','),...resumeEnv(packIds),...(Number.isInteger(opts.fromSeed)?{TULAI_SEED_FROM:String(opts.fromSeed)}:{})}});
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject)});
  const j={logOffset,pid:child.pid,status:'running',startedAt:new Date().toISOString(),log,packs:packIds,resumeFrom:(skills&&resumeEnv(packIds).TULAI_RESUME_RUN)||null};save(j);
  child.on('exit',async(code,signal)=>{
   if(job()?.pid!==child.pid)return;
   save({...j,status:signal?'stopped':code===0?'completed':'failed',exitCode:code,signal,finishedAt:new Date().toISOString()});
   if(code===0&&!signal){try{const runs=[...new Set([...fs.readFileSync(log,'utf8').slice(j.logOffset).matchAll(/\/runs\/(pilot-[\w-]+)/g)].map(m=>m[1]))].reverse(),run=runs.find(n=>fs.existsSync(path.join(home(),'runs',n,'activation-ready.json')));/* several seeds may have run; the one that passed is the one to switch on */if(run){await require('./active-model').activate(run);try{require('./skill-packs').markTrained(packIds,run);saveFirst({...firstState(),packAttempts:0})}catch{}save({...j,status:'activated',run,finishedAt:new Date().toISOString()})}}catch(e){save({...j,status:'activation-failed',error:e.message,finishedAt:new Date().toISOString()})}}
  });child.unref();
  return {reply:'Started a local Qwen training run. I’ll train an experimental adapter and compare it with the base model automatically. It uses corrections and accepted answers from your saved interactions. Failed replies are not target answers. Say “training status” for progress or “stop training” to stop. A candidate activates automatically only after conversion and regression checks pass; failed checks keep the current model.',via:'local fine-tuning started'};
 }finally{starting=false;fs.closeSync(fd)}
}
/** Why a trained candidate is not the active model, in words a person can act on. Null when nothing blocks it. */
function blocked(dir,manifest){
 const rd=(f)=>{try{return JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))}catch{return null}},at=(f)=>{try{return fs.statSync(path.join(dir,f)).mtimeMs}catch{return 0}};
 const cut=(s,n=140)=>String(s==null?'':typeof s==='string'?s:JSON.stringify(s)).replace(/\s+/g,' ').slice(0,n),failing=(g)=>(g.cases||[]).filter(c=>!c.passed).map(c=>({name:c.name,expected:cut(c.expected),answer:cut(c.answer)}));
 if(manifest.review?.decision==='reject')return {stage:'review',reason:'Rejected after review: '+(manifest.review.reason||(manifest.review.cases||[]).filter(x=>/^(FAIL|Partial)/.test(x)).join(' ')||'it was not good enough.'),cases:(()=>{const g=rd('deployment/gguf-gate.json');return g&&!g.passed?failing(g):[]})()};
 if(rd('activation-ready.json')?.gatePassed)return null;
 const found=[];
 const gg=rd('deployment/gguf-gate.json');if(gg&&!gg.passed)found.push({t:at('deployment/gguf-gate.json'),stage:'gguf-gate',reason:`The converted model (the file the bot actually runs) failed ${gg.total-gg.score} of ${gg.total} regression checks, so it was not activated.`,cases:failing(gg)});
 const ag=rd('activation-gate.json');if(ag?.candidate&&!ag.candidate.passed)found.push({t:at('activation-gate.json'),stage:'device-gate',reason:`The trained adapter failed ${ag.candidate.total-ag.candidate.score} of ${ag.candidate.total} regression checks before conversion (the base model passed ${ag.base?.score}/${ag.base?.total}).`,cases:failing(ag.candidate)});
 const err=rd('activation-error.json');if(err?.error){const e=String(err.error);found.push({t:at('activation-error.json'),stage:'conversion',reason:/converter missing/i.test(e)?'The GGUF converter is not installed. Run npm run training:setup, then train again.':/llama-quantize missing/i.test(e)?'The quantizer (llama-quantize) is not installed. Run npm run setup, then train again.':/llama-server missing/i.test(e)?'The model server (llama-server) is not installed. Run npm run setup, then train again.':/Dataset changed/i.test(e)?'The training data changed after training, so the result cannot be trusted.':/not eligible/i.test(e)?e:/convert_hf_to_gguf/.test(e)?'Converting the trained model for the bot failed. The details are in the run folder.':'Preparing the model for the bot failed: '+cut(e,160),cases:[]})}
 found.sort((a,b)=>b.t-a.t);return found[0]?{stage:found[0].stage,reason:found[0].reason,cases:found[0].cases}:null;
}

/* ---------- first-run training: every install gets the Tulai skills model, started before you use the bot ----------
   The recipe (training-config/skills-recipe.json) and the training examples ship with the app. When the training runtime is installed
   (npm run setup does it), the bot trains on its own, in the background, while the Mac is plugged in; the result is checked against the
   regression gate and only then switched on. Until then, and if anything fails, the bot simply keeps the base model. */
const FIRST=()=>path.join(home(),'first-run.json');
const firstState=()=>{try{return JSON.parse(fs.readFileSync(FIRST(),'utf8'))}catch{return {}}};
const saveFirst=(s)=>{fs.mkdirSync(home(),{recursive:true,mode:0o700});fs.writeFileSync(FIRST(),JSON.stringify(s,null,2),{mode:0o600})};
/** Pure decision, so it can be tested: what should happen now? */
function decide(c){
 if(c.running)return {action:'none',why:'training is already running'};
 if(c.packUpdate){ // an app update improved a skill pack you use: fine-tune again (plugged in, idle, once a day, twice at most) and switch only if every check passes
  if(!c.runtimeReady)return {action:'none',why:'the training runtime is not installed (run npm run training:setup)'};
  const s=c.state||{};if((s.packAttempts||0)>=2)return {action:'none',why:'two attempts to update the skill packs did not pass the checks; the current model stays'};
  if(s.lastPackAttempt&&c.now-s.lastPackAttempt<24*3600*1000)return {action:'none',why:'the last skill pack update was tried less than a day ago'};
  if(!c.plugged)return {action:'none',why:'a skill pack update is waiting until the Mac is plugged in'};
  if(c.memoryLevel==='critical')return {action:'none',why:'a skill pack update is waiting for the Mac to have free memory'};
  return {action:'train-packs',why:'a skill pack you use was improved in this version'};
 }
 if(c.improve&&!(c.activePassed&&!/not in my brain/.test(c.improve))){ // once the brain in use passed every check, only a newly selected pack starts training again. The bot improves itself: a selected pack it does not have yet, or a weak pack (last try or its own self-test under 85%) -> a short practice from the current brain
  if(c.runtimeReady&&c.memoryLevel!=='critical')return {action:'improve',why:'improving on its own: '+c.improve}; // no daily cap or waiting: it keeps practising until every selected pack passes (only memory must be free, or the training crashes)
 }
 if(c.orphanReady)return {action:'activate',run:c.orphanReady,why:'the training you started passed every check; its run finished while the app was restarting, so it is switched on now'};
 if(c.activeRun&&!c.activePassed&&c.keepTraining!==false&&c.runtimeReady&&c.memoryLevel!=='critical'&&!c.recording)return {action:'improve',why:'keep learning: the next practice round starts from the best brain so far'}; // non-stop training (your choice); a new round never starts during meeting notes
 if(c.activeRun)return {action:'none',why:'the trained model is already active'}; // never swaps one trained model for another on its own
 if(c.readyRun)return {action:'activate',run:c.readyRun,why:'a trained model passed every check and is waiting to be switched on'};
 if(!c.runtimeReady)return {action:'none',why:'the training runtime is not installed (run npm run training:setup)'};
 const s=c.state||{};
 if((s.attempts||0)>=2)return {action:'none',why:'two training attempts did not produce a model that passed the checks; the base model stays'};
 if(s.lastAttempt&&c.now-s.lastAttempt<24*3600*1000)return {action:'none',why:'the last attempt was less than a day ago'};
 if(!c.plugged)return {action:'none',why:'waiting until the Mac is plugged in'};
 if(c.memoryLevel==='critical')return {action:'none',why:'waiting for the Mac to have free memory'};
 return {action:'train',why:'first-run training of the Tulai skills'};
}
function newestReadyRun(skip=[]){
 const root=path.join(home(),'runs');let names=[];try{names=fs.readdirSync(root).filter(n=>/^pilot-/.test(n)).sort().reverse()}catch{return null}
 const cur=require('./active-model').state();
 for(const n of names){if(skip.includes(n)||cur.current?.run===n)continue;try{const r=JSON.parse(fs.readFileSync(path.join(root,n,'activation-ready.json'),'utf8')),m=JSON.parse(fs.readFileSync(path.join(root,n,'manifest.json'),'utf8'));if(r.gatePassed===true&&m.review?.decision!=='reject'&&m.status!=='evaluated-rejected'&&/skills|Generated skill examples/i.test(m.origin||''))return n}catch{}}
 return null;
}
const pluggedIn=()=>new Promise(res=>require('child_process').execFile('/usr/bin/pmset',['-g','batt'],{timeout:4000},(e,so)=>res(e?true:!/Battery Power/i.test(String(so))||!/InternalBattery/i.test(String(so)))));
async function autoStart(){
 try{
  const s=firstState(),python=path.join(home(),'venv/bin/python');let mem='normal';try{mem=(await require('./sysmem').read()).level}catch{}
  const jb=job(),rr=newestReadyRun(s.activationFailed||[]),orphanReady=(jb&&jb.status==='running'&&!alive(jb)&&rr&&(()=>{try{return fs.statSync(path.join(home(),'runs',rr)).mtimeMs>=Date.parse(jb.startedAt)}catch{return false}})())?rr:null;
  const d=decide({orphanReady,running:starting||alive(job()),readyRun:newestReadyRun(s.activationFailed||[]),activeRun:require('./active-model').state().current?.run||null,activePassed:(()=>{const r=require('./active-model').state().current?.run;return !!r&&fs.existsSync(path.join(home(),'runs',r,'activation-ready.json'))})(),runtimeReady:fs.existsSync(python),state:s,now:Date.now(),plugged:await pluggedIn(),memoryLevel:mem,packUpdate:(()=>{try{const sp=require('./skill-packs');return sp.state().auto&&sp.pending().length>0}catch{return false}})(),improve:improveReason(),keepTraining:s.keepTraining!==false,recording:(()=>{try{return require('./meeting').isRecording()}catch{return false}})()});
  try{const j=job();if(j&&j.status==='running'&&!alive(j)&&!starting&&!orphanReady&&d.action!=='activate'){j.status='ended';j.endedAt=new Date().toISOString();j.note='the training process finished while the app was restarting; its result is in the log';fs.writeFileSync(file(),JSON.stringify(j,null,2))}}catch{} // a round that ended during an app restart is closed, so nothing waits for it forever
  try{if(!alive(job())&&!starting)require('./active-model').prune()}catch{} // never clean up while a training is converting or being checked: it deletes that run's files
  saveFirst({...s,lastDecision:d.why,lastCheck:new Date().toISOString()});
  let grading=false;try{const T=require('./self-test'),cur=require('./active-model').state().current?.run,st=T.load();if(needsSelfTest({action:d.action,activeRun:cur,training:alive(job())||starting,testedRun:st?.model})&&!T.busy()){T.handle('test yourself');grading=true}grading=grading||T.busy()}catch{}
  if(grading&&d.action==='improve')return d; // non-stop training: a new brain first grades itself (and is kept only if it is not worse), then practice continues from what it got wrong // a brain that switched itself on at the end of training grades itself too (afterActivate only covers switches made here)
  if(d.action==='activate'){try{await require('./active-model').activate(d.run);saveFirst({...firstState(),activated:d.run,activatedAt:new Date().toISOString()});afterActivate(d.run);}catch(e){const t=firstState();saveFirst({...t,activationFailed:[...(t.activationFailed||[]),d.run],lastDecision:'switching to the trained model failed ('+e.message+'); the base model stays'})}}
  else if(d.action==='improve'){const t=firstState();saveFirst({...t,lastImprove:Date.now(),improveRuns:[...(t.improveRuns||[]).filter(x=>Date.now()-x<24*3600*1000),Date.now()]});await handle('train your skills',{packs:require('./skill-packs').selectedIds()})}
  else if(d.action==='train-packs'){saveFirst({...firstState(),packAttempts:(s.packAttempts||0)+1,lastPackAttempt:Date.now()});await handle('train your skills',{packs:require('./skill-packs').selectedIds()})}
  else if(d.action==='train'){saveFirst({...firstState(),attempts:(s.attempts||0)+1,lastAttempt:Date.now()});await handle('train your skills')}
  return d;
 }catch(e){return {action:'none',why:'first-run check failed: '+e.message}}
}
function firstRunStatus(){
 const s=firstState(),j=job();let active=null;try{active=require('./active-model').state().current?.run||null}catch{}
 if(active)return {ok:true,detail:'trained skills model is active'};
 if(starting||alive(j))return {ok:true,detail:'training the Tulai skills now (about 10 minutes, in the background)'};
 return {ok:null,detail:s.lastDecision||'not started yet'};
}
/** What a model switch is about to change, in numbers a person can read: the checks each model passed, and whether it was trained with the memory skills. */
function modelInfo(e){
 if(!e)return null;let g=null;try{g=JSON.parse(fs.readFileSync(path.join(home(),'runs',e.run,'deployment','gguf-gate.json'),'utf8'))}catch{}
 const groups=g?.groups||{};return {run:e.run,at:e.createdAt?Math.round(e.createdAt*1000):null,groups,hasMemory:!!groups.memory,gate:g?{passed:!!g.passed,score:g.score,total:g.total}:null};
}

/** After a model is switched on (by the run itself, the button or the app's check): mark the packs it was trained with, and close a job whose process is gone. */
function afterActivate(run){setTimeout(()=>{try{require('./self-test').run().catch(()=>{})}catch{}},90000); // a new brain grades itself on the independent questions, so the next practice knows what is weak
try{const mf=JSON.parse(fs.readFileSync(path.join(home(),'runs',run,'manifest.json'),'utf8'));if((mf.packs||[]).length)require('./skill-packs').markTrained(mf.packs,run)}catch{}const jj=job();if(jj&&jj.status==='running'&&!alive(jj))save({...jj,status:'activated',run,finishedAt:new Date().toISOString()});}
/** Continue from the brain in use (its adapter) when it already holds skill packs: it keeps what it knows and only needs a short practice on the new data.
 Packs it does not have yet get extra steps. A first training (or a base-model brain) starts from the base model. */
/** Packs under 85% in the self-test of the brain in use, plus packs under 85% in a newer brain that was switched back because it got worse: practise all of them, so fixing one skill does not wear down another. */
function selfTestWeak(packIds,cur){try{const h=require('./self-test').history(),me=h[cur];if(!me)return [];const low=(e)=>Object.entries(e.packs||{}).filter(([id,v])=>packIds.includes(id)&&v.pass*100<v.total*85).map(([id])=>id);
 return [...new Set([...low(me),...Object.values(h).filter(e=>e.rejected&&e.at>me.at).flatMap(low)])];}catch{return []}}
/** The newest try made after the brain in use (it missed the bar): the next round continues from it, so what it learned is kept (a chain from try to
 try and round to round), and it practises the packs it missed. Only tries that learned the same packs count. */
function bestCandidate(cur,had){
 const root=path.join(home(),'runs'),score=(n)=>{try{const g=JSON.parse(fs.readFileSync(path.join(root,n,'deployment','gguf-gate.json'),'utf8'));return g}catch{return null}};
 const mine=score(cur);if(!mine||typeof mine.score!=='number')return null;const cands=[];
 const names={};try{for(const p of require('./skill-packs').catalog())names[p.name]=p.id}catch{}
 for(const n of fs.readdirSync(root).filter(x=>/^pilot-/.test(x)&&x>cur)){const g=score(n);if(!g||typeof g.score!=='number')continue;if(!fs.existsSync(path.join(root,n,'adapter','adapters.safetensors')))continue;
  let mf={};try{mf=JSON.parse(fs.readFileSync(path.join(root,n,'manifest.json'),'utf8'))}catch{}if(!had.every(id=>(mf.packs||[]).includes(id)))continue;
  const per={};for(const c of g.cases||[]){if(c.group!=='pack')continue;const k=String(c.name||'').split(':')[0];const a=per[k]=per[k]||[0,0];a[1]++;if(c.passed)a[0]++}
  const failed=Object.entries(per).filter(([k,[ok,t]])=>names[k]&&ok*100<t*80).map(([k])=>names[k]);
  cands.push({run:n,score:g.score,failed});}
 const top=Math.max(...cands.map(c=>c.score)),newest=cands.sort((a,b)=>a.run<b.run?1:-1)[0]; if(!newest)return null;
 return newest.score>=top-2?newest:cands.find(c=>c.score===top); // a chain (the newest try), unless it fell more than 2 checks below the best try: then the best
}
function resumeEnv(packIds){
 const full={TULAI_ITERATIONS:String(Math.min(4000,800+packIds.length*250))};
 try{const cur=require('./active-model').state().current?.run;if(!cur||!packIds.length)return full;const dir=path.join(home(),'runs',cur,'adapter');if(!fs.existsSync(path.join(dir,'adapters.safetensors')))return full;
  const mf=JSON.parse(fs.readFileSync(path.join(home(),'runs',cur,'manifest.json'),'utf8')),had=mf.packs||[];if(!had.length)return full;
  const bc=bestCandidate(cur,had);if(bc)return {TULAI_RESUME_ADAPTER:path.join(home(),'runs',bc.run,'adapter'),TULAI_ITERATIONS:'800',TULAI_RESUME_RUN:bc.run,...(bc.failed.length?{TULAI_NEW_PACKS:bc.failed.join(',')}:{})}; // keep learning: continue from a newer try that scored higher than the brain in use
  const fresh=packIds.filter(id=>!had.includes(id));
  let weak=[];try{const last=fs.readdirSync(path.join(home(),'runs')).filter(n=>/^pilot-/.test(n)&&n!==cur&&fs.existsSync(path.join(home(),'runs',n,'deployment','gguf-gate.json'))).sort().pop();if(last){const g=JSON.parse(fs.readFileSync(path.join(home(),'runs',last,'deployment','gguf-gate.json'),'utf8')).groups||{};weak=packIds.filter(id=>{const v=g['pack:'+id];return v&&v.passed*10<v.total*8;});}}catch{} // a known pack that fell under 80% in the last try gets the extra practice too
  weak=weak.concat(selfTestWeak(packIds,cur));try{weak=weak.concat(require('./scenario-runner').weakPacks(cur).filter(id=>packIds.includes(id)))}catch{}const boost=[...new Set([...fresh,...weak])];return {TULAI_RESUME_ADAPTER:dir,TULAI_ITERATIONS:String(Math.min(4000,600+fresh.length*600)),TULAI_RESUME_RUN:cur,...(boost.length?{TULAI_NEW_PACKS:boost.join(',')}:{})};}catch{return full}
}
/** Why the bot should practise again on its own, or '' when nothing needs it. Only skill packs you selected; only when automatic updates are on. */
/** The brain in use has never graded itself (it switched itself on at the end of training) and nothing else is happening: run the self-test. */
const needsSelfTest=({action,activeRun,training,testedRun})=>(action==='none'||action==='improve')&&!!activeRun&&!training&&testedRun!==activeRun;
function improveReason(){
 try{const sp=require('./skill-packs');if(!sp.state().auto)return '';const sel=sp.selectedIds();if(!sel.length)return '';
  const cur=require('./active-model').state().current?.run;if(!cur)return '';let had=[];try{had=JSON.parse(fs.readFileSync(path.join(home(),'runs',cur,'manifest.json'),'utf8')).packs||[]}catch{}
  const missing=sel.filter(id=>!had.includes(id));if(missing.length)return 'a selected skill pack is not in my brain yet ('+missing.join(', ')+')';
  try{const cw=require('./scenario-runner').weakPacks(cur).filter(id=>sel.includes(id));if(cw.length)return 'real-life conversations failed twice in a row ('+cw.join(', ')+')';}catch{}
  const st=require('./self-test').load();if(st&&st.model===cur){const weak=Object.entries(st.packs||{}).filter(([id,v])=>sel.includes(id)&&v.pass*100<v.total*85).map(([id])=>id);if(weak.length)return 'my self-test found weak skills ('+weak.join(', ')+')';}
 }catch{}return '';
}
/** Which seed attempt the running job is on (a model that misses the gate is retrained with the next seed; at most 4 tries). */
function attempt(){try{const l=job()?.log;if(!l)return null;const fd=fs.openSync(l,'r'),size=fs.fstatSync(fd).size,len=Math.min(size,400000),buf=Buffer.alloc(len);fs.readSync(fd,buf,0,len,size-len);fs.closeSync(fd);const all=[...buf.toString('utf8').matchAll(/--- skills training, seed (\d+)(?: \(attempt (\d+) of (\d+)\))? ---/g)];const m=all[all.length-1];if(!m)return null;const seeds=[0,7,21,42],n=m[2]?+m[2]:seeds.indexOf(+m[1])+1;return {n,of:m[3]?+m[3]:4,seed:+m[1]}}catch{return null}}
/** Every training run on this Mac, newest first: what it learned, whether it passed the gate, and whether it is the model in use. */
function history(){
 const root=path.join(home(),'runs'),st=require('./active-model').state();let names=[];try{names=fs.readdirSync(root).filter(n=>/^pilot-/.test(n))}catch{}
 const text={active:'In use now','activation-ready':'Passed every check — ready to switch','activation-blocked':'Not used: it failed the quality checks','trained-not-activated':'Trained, not checked yet','evaluated-awaiting-review':'Trained, waiting for review',training:'Training now…','failed-or-interrupted':'Stopped before it finished',activated:'Was used','evaluated-rejected':'Rejected',prepared:'Prepared only'};
 return names.map(n=>{
  let m={},g=null;try{m=JSON.parse(fs.readFileSync(path.join(root,n,'manifest.json'),'utf8'))}catch{}
  try{g=JSON.parse(fs.readFileSync(path.join(root,n,'deployment','gguf-gate.json'),'utf8'))}catch{}
  if(m.status==='training'&&!(job()?.status==='running'&&n===[...names].sort().pop()))m.status='failed-or-interrupted';const used=st.current?.run===n,prev=st.previous?.run===n,failed=g?[...new Set((g.cases||[]).filter(c=>!c.passed).map(c=>c.group||'core'))]:[];
  const packs=(m.packs||[]).map(id=>{try{return require('./skill-packs').list().find(p=>p.id===id)?.name||id}catch{return id}});
  const learned=['Built-in skills','Memory skills','Free open data'].concat(packs.length?[packs.length+' skill pack'+(packs.length>1?'s':'')+': '+packs.join(', ')]:[]);
  const at=Number(String(n).match(/(\d{8}T\d{6})Z/)?.[1]&&Date.parse(n.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/).slice(1).reduce((a,v,i)=>a+['','-','-','T',':',':'][i]+v,'')+'Z'))||0;
  return {run:n,at,status:used?'active':prev?'previous':(m.status||'prepared'),label:used?text.active:prev?'The model you go back to with "Restore previous model"':(text[m.status]||m.status||'Unknown'),rows:m.counts?.train||0,iterations:m.iterations||0,learned,score:g?{score:g.score,total:g.total}:null,failedGroups:failed,note:m.status==='activation-blocked'&&failed.length?'Failed: '+failed.join(', '):''};
 }).filter(h=>h.rows>0).sort((a,b)=>b.at-a.at).filter((h,i)=>i<12||['active','previous'].includes(h.status));
}
/** Things worth knowing before you press a button: shown in the training panel and read by the switch/restore confirmation. */
function warnings(m){
 const w=[],st=require('./active-model').state(),cur=modelInfo(st.current),prev=modelInfo(st.previous);
 if(m.running)w.push({level:'info',text:'Training is running. The bot keeps using its current model until the new one is converted and passes every check.'});
 if(st.rolledBackAt&&Date.now()-Date.parse(st.rolledBackAt)<7*864e5)w.push({level:'warn',text:`You restored the previous model on ${new Date(st.rolledBackAt).toLocaleString()}. Tulai will not switch back by itself; press "Restore previous model" again to return to the newer one.`});
 if(cur&&!cur.hasMemory&&prev&&prev.hasMemory)w.push({level:'warn',text:'The active model was trained before the memory skills. It may ignore your saved notes, accept things it should refuse to save, or say it saved something it did not. The previous model has the memory checks (trained and passed).'});
 else if(cur&&!cur.hasMemory)w.push({level:'info',text:'The active model has no memory checks. Train the skills again to get models that follow your saved notes.'});
 if(!st.current)w.push({level:'info',text:'The built-in base model is active (no trained skills model).'});
 if(m.blocked)w.push({level:'warn',text:'The last training was not activated: '+m.blocked.reason});
 try{const tp=require('./training-pack').status();if(tp.config.repo&&tp.last&&!tp.last.ok)w.push({level:'warn',text:'The GitHub training pack could not be downloaded: '+tp.last.error+' Training uses what was downloaded before.'})}catch{}
 try{if(require('./installer').needed())w.push({level:'warn',text:'The local AI models are not fully downloaded yet. Tulai cannot think or listen offline until they are.'})}catch{}
 try{const f=fs.statfsSync(home()),free=f.bavail*f.bsize;if(free<25*2**30)w.push({level:'warn',text:`Only ${(free/2**30).toFixed(0)} GB of disk is free. Training needs about 25 GB while it runs.`})}catch{}
 try{for(const t of require('./skill-packs').warnings())w.push({level:'warn',text:t})}catch{}
 try{for(const t of require('./free-data').warnings())w.push({level:'warn',text:t})}catch{}
 if(!m.runtimeReady)w.push({level:'info',text:'The local training runtime is not installed on this Mac, so Train is unavailable.'});
 return w;
}
function metrics(){
 const root=path.join(home(),'runs');let run=null,manifest={},points=[],bytes=0;
 try{run=fs.readdirSync(root).filter(n=>n.startsWith('pilot-')).sort().pop();if(run){const dir=path.join(root,run);manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));for(const split of ['train','valid','test'])try{bytes+=fs.statSync(path.join(dir,'data',split+'.jsonl')).size}catch{}
 let log='';try{log=fs.readFileSync(path.join(dir,'training.log'),'utf8').replace(/\x1b\[[0-9;]*m/g,'')}catch{}
 for(const line of log.split('\n')){const m=/^\s*(\d+)\s+(?:(val)\s+)?(\d+\.\d+)\b/.exec(line);if(m)points.push({step:+m[1],kind:m[2]?'validation':'training',loss:+m[3]})}
 }}catch{}
 const j=job(),running=starting||alive(j);let corrections=[];try{corrections=require('./learning-review').read()}catch{}
 const out={nextDataset:(()=>{const d=require('./task-dataset').collect();return {counts:d.counts,total:d.examples.length,eligible:d.eligible,unverified:d.unverified,excluded:d.excluded,bytes:d.bytes,ready:d.ready,reason:d.reason}})(),running,run,status:running?(manifest.status==='trained-not-activated'?'evaluating':'training'):(j&&['failed','stopped'].includes(j.status)?j.status:manifest.status||'ready'),counts:manifest.counts||{},bytes,points,step:Math.max(0,...points.map(p=>p.step)),iterations:manifest.iterations||30,approved:corrections.filter(r=>r.review==='approved').length,pending:corrections.filter(r=>r.review==='pending').length,active:require('./active-model').state().current?.run===run,activation:require('./active-model').state(),activationError:(()=>{try{return JSON.parse(fs.readFileSync(path.join(root,run,'activation-error.json'),'utf8')).error}catch{return j?.error||null}})(),blocked:run?blocked(path.join(root,run),manifest):null,source:manifest.origin||'Prepared correction pilot',runtimeReady:fs.existsSync(path.join(home(),'venv/bin/python'))};
 out.packs=(job()?.packs)||[];out.models={current:modelInfo(require('./active-model').state().current),previous:modelInfo(require('./active-model').state().previous)};out.warnings=warnings(out);out.history=history();out.attempt=attempt();out.resumeFrom=(running&&job()?.resumeFrom)||null;return out;
}
function dataset(requested){
 if(!requested)return require('./task-dataset').collect();
 const run=requested;
 if(!run)return {run:null,source:'No training run yet.',examples:[]};
 if(!/^pilot-[a-zA-Z0-9-]+$/.test(run))throw Error('Invalid run');
 const dir=path.join(home(),'runs',run),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8')),examples=[];
 for(const split of ['train','valid','test']){
  const f=path.join(dir,'data',split+'.jsonl');if(!fs.existsSync(f))continue;const big=fs.statSync(f).size>10*1024*1024;
  const lines=fs.readFileSync(f,'utf8').split('\n').filter(l=>l.trim());
  const step=big?Math.ceil(lines.length/400):1;lines.forEach((line,index)=>{if(index%step)return;const row=JSON.parse(line);if(!Array.isArray(row.messages))throw Error('Unsupported dataset format');examples.push({id:split+'-'+(index+1),split,messages:row.messages.filter(m=>['system','user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:m.content}))})});
 }
 return {run,source:(manifest.origin||'Origin not recorded')+(manifest.counts?' This is the real data of the latest run: '+(manifest.counts.train||0)+' training, '+(manifest.counts.valid||0)+' validation and '+(manifest.counts.test||0)+' test examples. Large files are shown as an even sample of about 400 rows.':''),examples};
}
module.exports={bestCandidate,selfTestWeak,needsSelfTest,improveReason,resumeEnv,afterActivate,packStatus,handle,matches,metrics,dataset,blocked,decide,autoStart,firstRunStatus,newestReadyRun};
