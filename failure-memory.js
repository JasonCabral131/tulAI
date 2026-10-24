// Durable circuit breaker. Failures are observations, never training labels or verified facts.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const file=()=>path.join(process.env.GC_DATA_DIR||__dirname,'bot-failures.json');
const read=()=>{try{return JSON.parse(fs.readFileSync(file(),'utf8'))}catch{return []}};
const id=(tool,args)=>crypto.createHash('sha256').update(tool+JSON.stringify(args,Object.keys(args||{}).sort())).digest('hex').slice(0,12);
function save(rows){fs.mkdirSync(path.dirname(file()),{recursive:true});fs.writeFileSync(file()+'.tmp',JSON.stringify(rows.slice(-200)),{mode:0o600});fs.renameSync(file()+'.tmp',file())}
function blocked(tool,args){return read().find(r=>r.id===id(tool,args)&&r.blocked)}
function fail(tool,args){const rows=read(),key=id(tool,args),old=rows.find(r=>r.id===key);const record={id:key,tool,count:(old?.count||0)+1,at:new Date().toISOString(),blocked:true};save([...rows.filter(r=>r.id!==key),record]);return record}
function success(tool,args){const rows=read(),key=id(tool,args);save(rows.filter(r=>r.id!==key))}
function retry(key){const rows=read(),r=rows.find(r=>r.id===key);if(!r)return false;r.blocked=false;save(rows);return true}
const message=r=>`Stopped: ${r.tool} failed previously (${r.count} attempt${r.count===1?'':'s'}). No dependent actions will run. Fix the cause, then say “retry failure ${r.id}” and repeat your request.`;
function handle(text){if(/^show (?:my )?failed actions[.!]?$/i.test(text)){const rows=read();return {reply:rows.length?rows.map(message).join('\n'):'No recorded action failures.'}}const m=/^retry failure ([a-f0-9]{12})[.!]?$/i.exec(text);if(m)return {reply:retry(m[1])?'Retry unlocked. Repeat the original request after fixing the cause.':'No failure with that ID.'};return null}
function notes(){return read().filter(r=>r.blocked).map(r=>`Recorded action failure: ${r.tool}; ${r.count} failed attempts. Do not claim completion. Failure ID ${r.id}; an explicit retry is required.`)}
module.exports={retry,blocked,fail,success,message,handle,notes,read};
