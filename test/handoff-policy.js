const assert=require('assert'),{guard}=require('../handoff-policy');
for(const text of ['mag DWS kana please','review my merge requests','prepare my standup','triage my inbox','run /report','create a Jira report','do not use Tulai Desktop']){
 const r=guard({delegate:'job',reply:'Opened Desktop'},text);assert(!r.delegate,text);assert(r.reply.includes('not opened'));
}
assert(guard({delegate:'job'},'use Tulai Desktop to review my PR').delegate);
assert(guard({delegate:'job',handoffConfirmed:true},'yes').delegate);
assert(!guard({delegate:'job'},'yes').delegate);
const answer={reply:'Local answer'};assert.equal(guard(answer,'hi'),answer);
console.log('PASS centralized handoff rules, explicit requests, confirmed offers and negation');
