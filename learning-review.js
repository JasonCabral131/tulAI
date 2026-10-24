// Reviewed examples and a read-only regression gate. Never trains or replaces a model.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=()=>path.join(process.env.GC_DATA_DIR||__dirname,'training');
const file=()=>path.join(dir(),'corrections.json');
function read(){try{return JSON.parse(fs.readFileSync(file(),'utf8'))}catch(e){if(e.code==='ENOENT')return [];throw Error('Correction dataset could not be read; it was not overwritten.')}}
function save(rows){fs.mkdirSync(dir(),{recursive:true});fs.writeFileSync(file()+'.tmp',JSON.stringify(rows,null,2),{mode:0o600});fs.renameSync(file()+'.tmp',file())}
const hash=r=>crypto.createHash('sha256').update(JSON.stringify([r.prompt,r.expected,r.includes,r.excludes])).digest('hex');
function add(input){
 const prompt=String(input.prompt||'').trim(),expected=String(input.expected||'').trim();
 if(!prompt||!expected||prompt.length>4000||expected.length>4000)throw Error('Provide prompt and expected, each 1–4000 characters.');
 const list=x=>{if(!Array.isArray(x)||x.some(s=>typeof s!=='string'||!s.trim()||s.length>160)||x.length>12)throw Error('Checks must be lists of 1–160 character phrases, at most 12 each.');return x.map(s=>s.trim());};
 const includes=list(input.includes),excludes=list(input.excludes||[]);if(!includes.length)throw Error('At least one required phrase is needed for evaluation.');
 if(includes.some(s=>!expected.toLowerCase().includes(s.toLowerCase()))||excludes.some(s=>expected.toLowerCase().includes(s.toLowerCase())))throw Error('Expected answer does not satisfy its checks.');
 if(/-----BEGIN .*PRIVATE KEY-----|\b(?:api[_ -]?key|password|secret|token)\s*[:=]\s*\S{12,}/i.test(prompt+'\n'+expected))throw Error('Remove potential credentials before saving a lesson.');
 const row={id:crypto.randomBytes(6).toString('hex'),prompt,expected,includes,excludes,review:'pending',createdAt:new Date().toISOString(),origin:'user-submitted correction'};const rows=read();if(rows.length>=500)throw Error('Review dataset limit reached (500).');const existing=rows.find(r=>hash(r)===hash(row));if(existing)return existing;save([...rows,row]);return row;
}
function review(id,decision){const rows=read(),r=rows.find(r=>r.id===id);if(!r)throw Error('Lesson not found.');r.review=decision;r.reviewedAt=new Date().toISOString();save(rows);return r;}
function modelKey(nlu){const b=nlu.brain?.()||{kind:'unknown'};return JSON.stringify({kind:b.kind,provider:b.provider||null,model:b.kind==='local'?(nlu.health?.().model||'unknown'):(b.model||'unknown')});}
async function evaluate(id,nlu,signal){const r=read().find(r=>r.id===id);if(!r)throw Error('Lesson not found.');if(signal?.aborted)throw Error('Evaluation stopped.');const key=modelKey(nlu),digest=hash(r);
 // No target answer, tests or saved lessons are sent to the model. No action tools are called.
 const output=await nlu.answer(r.prompt,{history:[],lessons:[],timeout:30000});if(signal?.aborted)throw Error('Evaluation stopped.');
 const value=typeof output==='string'?output:'',missing=r.includes.filter(x=>!value.toLowerCase().includes(x.toLowerCase())),forbidden=r.excludes.filter(x=>value.toLowerCase().includes(x.toLowerCase()));
 const result={at:new Date().toISOString(),hash:digest,model:key,passed:!!value&&missing.length===0&&forbidden.length===0,output:value,missing,forbidden,scope:'phrase checks on model answer only; not factual verification or action execution'};
 const rows=read(),current=rows.find(x=>x.id===id);if(!current||hash(current)!==digest)throw Error('Lesson changed during evaluation; result discarded.');current.evaluation=result;save(rows);return result;
}
function eligible(r,nlu){return r.review==='approved'&&r.evaluation?.passed===true&&r.evaluation.hash===hash(r)&&r.evaluation.model===modelKey(nlu);}
function exportDataset(nlu){const rows=read().filter(r=>eligible(r,nlu));if(!rows.length)throw Error('No approved examples with a passing evaluation for the current model.');fs.mkdirSync(dir(),{recursive:true});const target=path.join(dir(),'reviewed-'+crypto.randomUUID()+'.jsonl');fs.writeFileSync(target,rows.map(r=>JSON.stringify({messages:[{role:'user',content:r.prompt},{role:'assistant',content:r.expected}]})).join('\n')+'\n',{mode:0o600});fs.writeFileSync(target+'.manifest.json',JSON.stringify({createdAt:new Date().toISOString(),model:modelKey(nlu),lessons:rows.map(r=>({id:r.id,hash:hash(r),evaluation:r.evaluation.at})),scope:'Reviewed examples passing phrase checks. Not an independently validated training set; no training run or model change occurred.'},null,2),{mode:0o600});return {path:target,count:rows.length};}
async function handle(text,opts={}){
 const t=String(text).trim(),nlu=opts.nlu||require('./nlu');let m;
 try{
 if((m=/^save correction\s*:\s*(\{[\s\S]*\})$/i.exec(t))){const r=add(JSON.parse(m[1]));return {reply:`Saved lesson ${r.id} for review. It is not active or approved. Say “review lesson ${r.id}”.`,via:'correction dataset'};}
 if(/^show (?:my )?(?:learning review|training dataset)[.!]?$/i.test(t)){const rows=read();
  if(!rows.length)return {reply:'### Learning review\n\nNo correction examples yet.\n\nSave one like this:\n\n```\nsave correction: {"prompt":"question","expected":"reviewed answer","includes":["required phrase"],"excludes":["wrong phrase"]}\n```'};
  const state=r=>eligible(r,nlu)?'eligible for export':r.evaluation?(r.evaluation.passed?'evaluation passed':'evaluation failed'):'not evaluated yet';
  const item=(r,n)=>[`**${n}. ${r.prompt.slice(0,160).replace(/\n+/g,' ')}**`,`- Review: ${r.review} · ${state(r)}`,`- Expected answer: ${String(r.expected).slice(0,240)}`,
   ...(r.evaluation&&!r.evaluation.passed?[`- What the bot answered: ${String(r.evaluation.output||'no answer').slice(0,240)}`,`- Why it failed: ${(r.evaluation.missing&&r.evaluation.missing.length)?'missing the required phrase '+r.evaluation.missing.join('; '):(r.evaluation.forbidden&&r.evaluation.forbidden.length)?'it said a forbidden phrase: '+r.evaluation.forbidden.join('; '):'the answer did not meet the required phrases'}`]:[]),
   `- Next: say “review lesson ${r.id}”, “evaluate lesson ${r.id}”, “approve lesson ${r.id}” or “reject lesson ${r.id}”`].join('\n');
  return {reply:`### Learning review (${rows.length} lesson${rows.length===1?'':'s'})\n\n`+rows.map((r,n)=>item(r,n+1)).join('\n\n')+'\n\n*Approving a lesson only marks it as reviewed. It does not change the model; training happens only when you start it.*'};}
 if((m=/^review lesson ([a-f0-9]{12})[.!]?$/i.exec(t))){const r=read().find(r=>r.id===m[1]);if(!r)throw Error('Lesson not found.');return {reply:`Lesson ${r.id} (${r.review})\nQuestion: ${r.prompt}\nExpected answer: ${r.expected}\nRequired: ${r.includes.join('; ')}\nForbidden: ${r.excludes.join('; ')||'none'}\n\nSay “approve lesson ${r.id}” or “reject lesson ${r.id}”. Evaluation is separate; phrase checks alone do not establish factual correctness.`};}
 if((m=/^(approve|reject) lesson ([a-f0-9]{12})[.!]?$/i.exec(t))){const r=review(m[2],m[1].toLowerCase()==='approve'?'approved':'rejected');return {reply:`Lesson ${r.id}: ${r.review}. Model weights unchanged.`};}
 if((m=/^evaluate lesson ([a-f0-9]{12})[.!]?$/i.exec(t))){const r=await evaluate(m[1],nlu,opts.signal);return {reply:`Evaluation ${r.passed?'passed':'failed'} for ${m[1]}.\nActual answer: ${r.output||'No answer returned.'}\nMissing phrases: ${r.missing.join('; ')||'none'}. Forbidden phrases found: ${r.forbidden.join('; ')||'none'}.\nRead-only model-response test; no action was executed or model trained.`};}
 if(/^export approved lessons[.!]?$/i.test(t)){const r=exportDataset(nlu);return {reply:`Exported ${r.count} reviewed examples with passing checks to ${r.path}. Export only: no training or model replacement occurred.`};}
 return null;
 }catch(e){return {reply:'Learning review could not finish: '+e.message,via:'learning review error'};}
}
module.exports={add,read,review,evaluate,eligible,exportDataset,handle};
