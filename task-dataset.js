// Build training candidates from real saved tasks. Never assume an AI reply is correct merely because it exists.
const crypto=require('crypto');
const text=m=>typeof m?.content==='string'&&m.content.trim()?m.content:(m?.parts||[]).filter(p=>p.t==='text').map(p=>p.text||'').join('\n');
const secret=/-----BEGIN .*PRIVATE KEY-----|\b(?:api[_ -]?key|password|secret|access[_ -]?token|authorization)\s*[:=]\s*\S{8,}|\b(?:sk-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]+)\b/i;
const corrected=/\b(wrong|incorrect|doesn.t work|not working|failed|hallucinat\w*|stupid|bobo|mali|hindi gumagana)\b/i;
const accepted=/^(?:(?:yes|great|okay|ok)[,! .]+)?(?:works(?: now)?|it works|fixed|correct|that works|that.s correct|tama|gumagana na)[.!\s]*$/i;

function category(t){for(const [name,re] of [['Testing',/\b(test|tests|testing|regression|coverage|assert|unit test|integration)\b/i],['Debugging',/\b(bug|fix|error|debug|exception|crash)\b/i],['Code review',/\b(review|pull request|merge request|pr|mr)\b/i],['Architecture',/\b(architect\w*|design|refactor|scal\w*|interface|api)\b/i],['Implementation',/\b(code|implement|function|component|react|typescript|python|repo|git|commit|build)\b/i],['Reporting',/\b(report|chart|analysis|analyze|csv|excel|dataset|jira|ticket)\b/i],['Automation',/\b(automate|schedule|reminder|dws|teams|browser|selenium)\b/i]])if(re.test(t))return name;return null}
function collect(chats=require('./store').listChats()){
 const examples=[];
 for(const chat of chats){const ms=chat.messages||[];
  for(let i=0;i<ms.length-1;i++){
   if(ms[i].role!=='user'||ms[i+1].role!=='assistant')continue;
   const prompt=text(ms[i]).trim(),answer=text(ms[i+1]).trim(),kind=category(prompt)||'User interaction';if(!prompt||!answer||accepted.test(prompt)||(i>=2&&ms[i-1]?.role==='assistant'&&corrected.test(prompt)))continue;
   const id=crypto.createHash('sha256').update(prompt.toLowerCase().replace(/\s+/g,' ').trim()).digest('hex').slice(0,20);
   const feedback=ms[i+2]?.role==='user'?text(ms[i+2]):'';
   const failed=corrected.test(feedback);
   const explicit=/^(?:wrong[,.! ]+|incorrect[,.! ]+|mali[,.! ]+)?(?:the correct answer is|correct answer|use this answer|dapat ang sagot|correction)\s*[:：]\s*([\s\S]+)/i.exec(feedback);
   // A user-supplied target is evidence. A fresh AI retry alone is not a successful correction.
   const retry=failed&&ms[i+3]?.role==='assistant'&&ms[i+4]?.role==='user'&&accepted.test(text(ms[i+4]))&&!corrected.test(text(ms[i+4]))?text(ms[i+3]).trim():'';
   const target=explicit?.[1]?.trim()||retry;
   const rejected=failed||!!explicit;
   const trainingAnswer=target||answer;
   const trainingPrompt=retry&&!explicit?prompt+'\n\nUser correction: '+feedback:prompt;
   const privateText=prompt+'\n'+answer+'\n'+feedback+'\n'+trainingAnswer;
   const reason=secret.test(privateText)?'Potential credential; text withheld':rejected&&!target?'Failed response awaiting a corrected answer':/\b(?:I can.t|I cannot|could not|not connected|not implemented|not available)\b/i.test(trainingAnswer)?'Incomplete outcome':prompt.length+trainingAnswer.length>10000?'Long task: needs sectioning before training':null;
   const state=reason?'excluded':(target||accepted.test(feedback))?'eligible':'unverified';
   examples.push({id,category:kind,state,learningType:target?'corrected failure':rejected?'unresolved failure':'interaction',rejectedAnswer:rejected&&!secret.test(privateText)?answer:null,feedback:!secret.test(privateText)?feedback:null,reason:reason||(state==='eligible'?target?'Correction target from user feedback or accepted retry':'User feedback accepted the answer; not an independent correctness proof':'No explicit positive outcome recorded'),group:String(chat.id),source:{chatId:String(chat.id),message:i,workspace:chat.workspace||null,channel:String(chat.id).startsWith('bot-')?'local bot':'Tulai Desktop / company AI',provider:ms[i+1].provider||chat.provider||null,model:ms[i+1].model||chat.model||null},messages:secret.test(privateText)?[]:[{role:'user',content:trainingPrompt},{role:'assistant',content:trainingAnswer}]});
  }
 }
 // Conflicting targets are retained for inspection, never silently chosen for training.
 const byPrompt=new Map();for(const e of examples){if(!byPrompt.has(e.id))byPrompt.set(e.id,[]);byPrompt.get(e.id).push(e);}
 for(const rows of byPrompt.values()){
  const usable=rows.filter(e=>e.state==='eligible');
  if(new Set(usable.map(e=>JSON.stringify(e.messages))).size>1){for(const e of usable){e.state='unverified';e.reason='Conflicting interaction targets; needs a resolved correction';}}
  else for(const e of usable.slice(1)){e.state='excluded';e.reason='Duplicate interaction';}
 }

 const eligible=examples.filter(e=>e.state==='eligible'),groups=[...new Set(eligible.map(e=>e.group))].sort();
 // Whole conversations stay in one split: follow-up paraphrases cannot leak into the test set.
 const split=new Map(groups.map((g,i)=>[g,i===0?'test':i===1?'valid':'train']));
 for(const e of examples)e.split=e.state==='eligible'?(groups.length>=3?split.get(e.group):'candidate'):'candidate';
 const counts={train:0,valid:0,test:0};for(const e of examples)if(e.split in counts)counts[e.split]++;
 return {run:null,source:'Saved user tasks and assistant answers from local conversations. Training targets come from explicit user corrections or answers accepted by subsequent feedback. Failed replies are retained as negative evidence, never as target answers. Engineering categories describe tasks, not a certification of correctness.',examples,counts,eligible:eligible.length,unverified:examples.filter(e=>e.state==='unverified').length,excluded:examples.filter(e=>e.state==='excluded').length,ready:groups.length>=3,groups:groups.length,bytes:Buffer.byteLength(JSON.stringify(examples)),reason:groups.length<3?'Need accepted outcomes from at least 3 separate conversations to keep training, validation and test conversations separate.':null};
}
module.exports={collect,category};
