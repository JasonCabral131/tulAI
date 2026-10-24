// Model and local actions are faked: no apps, messages, or microphone are used.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
process.env.GC_DATA_DIR=fs.mkdtempSync('/tmp/tulai-followthrough-');
const actions=[];let pending=false;
const local={vocab:()=>({apps:['Safari'],projects:[]}),hasPending:()=>pending,handleRules:async cmd=>{actions.push(cmd);return {reply:pending?'Which profile?':'Completed '+cmd}}};
const box={module:{exports:{}},require:n=>n==='./local'?local:require('module').createRequire(path.resolve(__dirname,'../harness.js'))(n)};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../harness.js'),'utf8'),box);
const run=box.module.exports.run;
const call=(name,args)=>({id:name,function:{name,arguments:JSON.stringify(args)}});
(async()=>{
 let seen=[],responses=[{tool_calls:[call('open_app',{name:'Safari'})]},{tool_calls:[call('search_web',{query:'pizza'})]},{content:'Opened Safari and searched for pizza.'}];
 let result=await run('open Safari and search for pizza',{sid:'test',opts:{recovery:false,history:[{role:'user',content:'I prefer Safari'}],lessons:['Use a concrete example']},nlu:{available:()=>true,chat:async p=>{seen.push(JSON.parse(JSON.stringify(p)));return responses.shift()}}});
 assert.deepStrictEqual(actions,['open Safari','search for pizza']);assert.strictEqual(result.steps.length,2);assert(seen[0].messages.some(m=>m.content==='I prefer Safari'));assert(seen[0].messages[0].content.includes('Use a concrete example'));
 actions.length=0;pending=true;
 result=await run('open Chrome and search for pizza',{sid:'test',opts:{recovery:false,},nlu:{available:()=>true,chat:async()=>({tool_calls:[call('open_chrome',{}),call('search_web',{query:'pizza'})]})}});
 assert.strictEqual(actions.length,1,'Pause before dependent actions when clarification is needed');
 pending=false;actions.length=0;
 result=await run('open Safari and search for pizza',{sid:'test',opts:{recovery:false,},nlu:{available:()=>true,chat:async()=>({tool_calls:[call('open_app',{name:'Safari'})]})}});
 assert.strictEqual(actions.length,1,'Do not repeat completed actions');assert(result.reply.includes('stopped'));
 result=await run('explain this',{opts:{recovery:false,},nlu:{available:()=>true,chat:async()=>({content:''})}});assert(!result.reply.includes('Done.'));
 actions.length=0;
 for(const tc of [call('set_volume',{level:'banana'}),call('open_app',{}),{id:'bad',function:{name:'open_app',arguments:'broken json'}},call('unknown_tool',{})]) {
   await run('open Safari and change volume',{opts:{recovery:false,},nlu:{available:()=>true,chat:async()=>({tool_calls:[tc]})}});
 }
 assert.strictEqual(actions.length,0,'Invalid tool details must never perform actions');
 const original=local.handleRules;local.handleRules=async cmd=>{actions.push(cmd);return {reply:'I could not open Safari.'}};
 result=await run('open Safari and search for pizza',{opts:{recovery:false,},nlu:{available:()=>true,chat:async()=>({tool_calls:[call('open_app',{name:'Safari'}),call('search_web',{query:'pizza'})]})}});
 assert.strictEqual(actions.length,1,'Failed step must stop subsequent actions');assert(result.reply.includes('could not'));
 const failures=require('../failure-memory');
 actions.length=0;await run('open Safari and search for pizza',{opts:{recovery:false,},nlu:{available:()=>true,chat:async()=>({tool_calls:[call('open_app',{name:'Safari'})]})}});assert.equal(actions.length,0,'Persisted failure must block repeat');failures.retry(failures.read()[0].id);
 local.handleRules=original;
 actions.length=0;const progress=[];
 result=await run('open it again',{opts:{recovery:false,history:[{role:'user',content:'Open Safari'}],onProgress:e=>progress.push(e)},nlu:{available:()=>true,chat:async()=>({tool_calls:[call('open_app',{name:'Safari'})]})}});
 assert.deepStrictEqual(actions,['open Safari'],'Resolve app from immediate conversation');
 assert.deepStrictEqual(progress.map(e=>e.type),['tool','tool_result']);assert.strictEqual(progress[0].id,progress[1].id);
 actions.length=0;let round=0;
 result=await run('open Safari and search for pizza',{opts:{recovery:false,},nlu:{available:()=>true,chat:async()=>{if(round++)throw Error('offline');return {tool_calls:[call('open_app',{name:'Safari'})]}}}});
 assert(result.reply.includes('Completed open Safari')&&result.reply.includes('remaining steps'),'Keep partial results after model failure');
 console.log('Bot follow-through: multi-step actions, history, clarification pause, duplicate guard, and empty replies passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
