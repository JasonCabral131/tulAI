// Operational counters, never model-generated claims about training or intelligence.
function matches(text){
 const t=String(text).trim();
 return /^(?:(?:show|check|what(?:'s| is)|ano(?: ang)?)\s+)?(?:(?:the|my|your|latest|current|local|bot)\s+)*(?:memory(?:\s+(?:and\s+)?(?:training|learning))?|training|learning|vector\s*(?:db|database))(?:\s+(?:status|progress|update|updates|latest))?[.!?]*$/i.test(t)
  || /\b(?:your|bot|tulai|tulay|mo|mong)\b/i.test(t)&&/\b(?:memory|learning|training|vector\s*(?:db|database))\b/i.test(t)&&/\b(?:status|progress|graph|chart|using|used|working|gumagana|ginagamit|nagaganit|show|check|how|ano)\b/i.test(t)
  || /^(?:please\s+)?(?:keep(?: on)?|continue|start)\s+(?:training|learning)(?:\s+and\s+training)?(?:\s+please)?[.!]?$/i.test(t);
}
function answer(text,deps={}){
 const recent=(deps.history||[]).slice(-4);
 const followup=recent.some(m=>m.role==='assistant'&&String(m.content).includes('Local learning and memory status')) && /^(?:please\s+)?(?:(?:i want|show(?: me)?|create|make|give me)\s+(?:an? |the |this )?(?:image|graph|chart|picture)|go start(?: showing| shwoing)?(?: me)?(?: the)?(?: graph)?)[.!?]*$/i.test(String(text).trim());
 if(!matches(text)&&!followup)return null;
 const memory=deps.memory||require('./bot-memory'),vectors=deps.vectors||require('./vector-memory');
 let stats;try{stats=vectors.status()}catch{stats=null}
 const count=fn=>{try{return fn().length}catch{return 'unavailable'}};
 const preferences=count(()=>memory.read()),chunks=count(()=> (deps.chats||require('./chat-memory')).chunks());
 const failures=count(()=> (deps.failures||require('./failure-memory')).read().filter(r=>r.blocked));
 const guidance=count(()=> (deps.recovery||require('./failure-research')).records().filter(r=>r.status==='unverified guidance'));
 let reviewed=[];try{reviewed=require('./learning-review').read()}catch{}
 let dataset;try{dataset=(deps.dataset||require('./task-dataset')).collect()}catch{}
 const plural=(n,w)=>`${n} ${w}${n===1?'':'s'}`;
 const vec=stats?[`- Vector database: ${stats.database} · **${stats.indexed||0} of ${stats.total||0}** stored entries have embeddings`,`- Embedding model available: ${stats.available?'yes':'no'} · last retrieval mode in this session: ${stats.mode}`]:['- Vector database: unavailable; indexing and retrieval could not be verified'];
 const ds=dataset?[`- Interaction dataset: **${dataset.examples.length}** collected · ${dataset.eligible} training targets · ${dataset.unverified} unverified · ${dataset.excluded} excluded`,`  *Includes saved local bot and Desktop/company AI conversations. ${dataset.reason||'Ready for a candidate training run.'}*`]:['- Interaction dataset: unavailable'];
 const pending=reviewed.filter(r=>r.review==='pending').length,approved=reviewed.filter(r=>r.review==='approved').length;
 const reply=['### Local learning and memory status (current snapshot)','',
 '**Memory**',`- Saved preferences: **${preferences}**`,`- Chat text chunks available: **${chunks}**`,...vec,'',
 '**Safety**',`- Blocked action failures: ${failures}`,`- Unverified recovery notes: ${guidance}`,'',
 '**Learning data**',...ds,`- Correction dataset: ${plural(reviewed.length,'example')} · ${pending} pending review · ${approved} approved. Say “show learning review” to inspect them.`,'',
 '**Fine-tuning**',require('./finetune-status').status(),'',
 '*Saving and retrieving memories does not itself change model weights. Recovery advice still needs testing.*',
 /graph|chart/i.test(text)?'*This chart shows current memory counts. For recorded training loss, open Train local bot AI in Settings.*':'*New chat text and saved preferences are available to memory retrieval; stored embeddings alone do not prove that a particular answer used them.*'
 ].join('\n');
 const chart=(followup||/graph|chart|image/i.test(text))?{kind:'memory-snapshot',rows:[{label:'Saved preferences',value:preferences},{label:'Chat text chunks',value:chunks},...(stats?[{label:'Indexed entries',value:stats.indexed||0},{label:'Pending embeddings',value:Math.max(0,(stats.total||0)-(stats.indexed||0))}]:[])].filter(r=>Number.isFinite(r.value))}:undefined;
 return {reply,chart,via:'verified learning status'};
}
module.exports={answer,matches};
