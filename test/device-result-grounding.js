// Isolated fake tools: no device changes, network calls, messages or file searches.
const assert=require('assert'),fs=require('fs'),vm=require('vm'),path=require('path');
let calls=[];let result='';
const local={vocab:()=>({apps:['Safari'],projects:[]}),hasPending:()=>false,handleRules:async cmd=>{calls.push(cmd);return {reply:result}}};
const real=require('module').createRequire(path.resolve(__dirname,'../harness.js'));
const box={module:{exports:{}},require:n=>n==='./local'?local:n==='./failure-memory'?{blocked:()=>null,success:()=>{}}:real(n)};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../harness.js'),'utf8'),box);
const h=box.module.exports;const tool=(name,args)=>({id:name,function:{name,arguments:JSON.stringify(args)}});
async function simulate(text,tools,claim){const replies=[{tool_calls:tools},{content:claim}];return h.run(text,{opts:{recovery:false},nlu:{available:()=>true,chat:async()=>replies.shift()}})}
(async()=>{
 result='Draft prepared for Ana. Not sent.';
 let r=await simulate('draft a Teams message to Ana and then report status',[tool('chat_teams',{person:'Ana',message:'hello'})],'Sent successfully!');
 assert.equal(r.reply,result);assert(!r.reply.includes('Sent successfully'));
 result='Agency meeting: 14:30. Client calendar disconnected; client meetings unknown.';
 r=await simulate('show my meetings',[tool('list_meetings',{})],'No client meetings today.');assert.equal(r.reply,result);
 result='Weekdays at 07:45 Asia/Manila: Daily Work Setup.';
 r=await simulate('show my reminders',[tool('list_reminders',{})],'Every day at 08:00.');assert.equal(r.reply,result);
 calls=[];
 r=await simulate('open Safari and find expenses.csv',[tool('open_app',{name:'Safari'}),tool('find_files',{name:'expenses.csv',path:'/Users/*'})],'Done');assert.equal(calls.length,0);assert(r.reply.includes('invalid'));
 assert.equal(h.validateCall(tool('find_files',{name:'expenses.csv',path:'/Users/*'}),h.TOOLS),null);
 assert(h.validateCall(tool('find_files',{name:'expenses.csv'}),h.TOOLS));
 assert.equal(h.validateCall(tool('git_log',{project:'demo',count:-1}),h.TOOLS),null);
 console.log('PASS grounded draft/calendar/reminder replies; invalid batch performs zero actions; exact file-search schema and numeric limits');
})().catch(e=>{console.error(e);process.exitCode=1});
