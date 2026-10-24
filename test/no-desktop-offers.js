const assert=require('assert');process.env.TULAY_LOCAL_DRY='1';
const local=require('../local'),harness=require('../harness');
(async()=>{
 for(const q of ['review my PR','fix the code','prepare a Jira report','run git pull'])assert(!harness.toolsFor(q).some(t=>t.function.name==='delegate_to_desktop'));
 const offer=local.offerDesktop('test','fix it');assert(!offer.offered);assert(!local.hasPending('test'));
 let opens=0;const listener=()=>opens++;process.on('tulay:show-desktop',listener);
 const blocked=await local.handleRules('open Tulai Desktop',{desktopAuthorized:false});assert.equal(opens,0);assert(!blocked.delegate);
 const explicit=await local.handle('use Tulai Desktop to review this PR',{sid:'explicit-test'});assert(explicit.delegate);assert.equal(opens,0);
 process.removeListener('tulay:show-desktop',listener);
 console.log('PASS no model handoff tool, no unsolicited offer, no inferred Desktop launch, explicit handoff retained');
})().catch(e=>{console.error(e);process.exitCode=1});
