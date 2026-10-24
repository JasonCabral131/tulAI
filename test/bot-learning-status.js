const assert=require('assert');const {answer}=require('../bot-learning-status');
const deps={memory:{read:()=>['preference']},chats:{chunks:()=>['a','b']},vectors:{status:()=>({database:'SQLite',indexed:2,total:3,available:true,mode:'semantic'})},failures:{read:()=>[{blocked:true},{blocked:false}]},recovery:{records:()=>[{status:'unverified guidance'},{status:'unresolved'}]}};
for(const q of ['show me a graph regarding your memory training','are you using your vector db?','keep on training and training','ano training progress mo?', 'latest memory training?', 'latest training status', 'check memory training', 'memory training?', 'training update']){const r=answer(q,deps);assert(r);assert(r.reply.includes('2 of 3'));assert(r.reply.includes('Model-weight training is not running'));assert(r.reply.includes('Blocked action failures: 1')&&/^### Local learning and memory status/.test(r.reply)&&/\n\*\*Memory\*\*\n- Saved preferences: \*\*1\*\*/.test(r.reply)&&/\*\*Fine-tuning\*\*/.test(r.reply),'the status is laid out in sections with bullets, not one wall of text');assert(!r.reply.includes('data:image'));}
assert(answer('show me a graph regarding your memory training',deps).reply.includes('This chart shows current memory counts'));
assert(answer('check your memory status',{...deps,vectors:{status(){throw Error('db unavailable')}}}).reply.includes('could not be verified'));
for(const q of ['show my RAM usage','create a training report for my team','remember my training schedule','show my meetings'])assert.equal(answer(q,deps),null);
console.log('PASS actual memory counts, unavailable database, honest training status and unrelated intent exclusions');
const history=[{role:'assistant',content:'Local learning and memory status (current snapshot):'}];
for(const text of ['i want an image','go start shwoing me the graph']){const result=answer(text,{...deps,history});assert.equal(result.chart.kind,'memory-snapshot');assert.equal(result.chart.rows.find(r=>r.label==='Indexed entries').value,2);}
assert.equal(answer('open Chrome',{...deps,history}),null);
assert.equal(answer('i want an image',deps),null);
