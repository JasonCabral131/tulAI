// Atomic model pointer; model files stay outside the app and repository.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
const home=()=>path.join(process.env.GC_DATA_DIR||path.join(os.homedir(),'Library/Application Support/gateway-chat'),'training');
const pointer=()=>path.join(home(),'active-model.json');
function state(){try{return JSON.parse(fs.readFileSync(pointer(),'utf8'))}catch{return {current:null,previous:null}}}
function save(s){fs.mkdirSync(home(),{recursive:true});const tmp=pointer()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,2),{mode:0o600});fs.renameSync(tmp,pointer())}
function selected(){const c=state().current;if(!c)return null;const allowed=path.join(home(),'runs')+path.sep;if(!c.path?.startsWith(allowed)||!c.path.endsWith('.gguf'))return null;try{if(fs.statSync(c.path).size!==c.bytes)return null;const fd=fs.openSync(c.path,'r'),b=Buffer.alloc(4);try{fs.readSync(fd,b,0,4,0)}finally{fs.closeSync(fd)}return b.toString()==='GGUF'?c.path:null}catch{return null}}
async function hash(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex')}
let busy=false;
async function activate(run,nlu=require('./nlu')){
 if(busy)throw Error('A model switch is already running');busy=true;
 const old=state();let switched=false;
 try{
  if(!/^pilot-[\w-]+$/.test(run))throw Error('Invalid training run');
  const root=path.join(home(),'runs',run),m=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  if(m.review?.decision==='reject'||m.status==='evaluated-rejected')throw Error('Rejected candidates cannot activate');
  const c=JSON.parse(fs.readFileSync(path.join(root,'activation-ready.json'),'utf8'));
  if(c.run!==run||c.gatePassed!==true||c.path!==path.join(root,'deployment/model-q4_k_m.gguf')||fs.statSync(c.path).size!==c.bytes||await hash(c.path)!==c.sha256)throw Error('Activation artifact did not pass integrity checks');
  const gate=JSON.parse(fs.readFileSync(path.join(root,'deployment/gguf-gate.json'),'utf8'));
  const conv=(gate.cases||[]).filter(t=>t.group==='conversation'),convMiss=conv.filter(t=>!t.passed).length;if(conv.length&&convMiss>Math.floor(conv.length/12))throw Error('GGUF regression gate failed (conversation)');
  const core=(gate.cases||[]).filter(t=>['core','nlu','chat'].includes(t.group||'core')); // the gate decides (core cases must all pass; the others have bounded tolerance and a never-worse-than-base rule)
  if(gate.passed!==true||!core.length||core.some(t=>!t.passed))throw Error('GGUF regression gate failed');
  save({current:c,previous:old.current||null,activatedAt:new Date().toISOString()});switched=true;
  if(!(await nlu.reloadLocal()))throw Error('New model failed to start');
  m.status='activated';m.activeModelChanged=true;fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(m,null,2),{mode:0o600});
  return {active:true,run};
 }catch(e){if(switched){save(old);await nlu.reloadLocal().catch(()=>false)}throw e}finally{busy=false}
}
async function rollback(nlu=require('./nlu')){if(busy)throw Error('A model switch is already running');busy=true;const old=state();try{save({current:old.previous||null,previous:old.current||null,rolledBackAt:new Date().toISOString()});if(!(await nlu.reloadLocal()))throw Error('Rollback model failed to start');return state()}catch(e){save(old);await nlu.reloadLocal().catch(()=>false);throw e}finally{busy=false}}
/** Disk: a training run leaves up to 15 GB. Keep the active model and the previous one; drop the weights of every other run (their reports stay). */
function prune(){
 const root=path.join(home(),'runs');let names=[];try{names=fs.readdirSync(root).filter(n=>/^pilot-/.test(n))}catch{return 0}
 const s=state(),keep=new Set([s.current?.run,s.previous?.run].filter(Boolean));let freed=0;
 const waiting=(n)=>{try{return JSON.parse(fs.readFileSync(path.join(root,n,'activation-ready.json'),'utf8')).gatePassed===true}catch{return false}}; // a model that passed every check and is waiting to be switched on keeps its weights
 for(const n of names){
  const subs=['deployment/fused','deployment/model-f16.gguf',...(keep.has(n)||waiting(n)?[]:['deployment/model-q4_k_m.gguf'])];
  for(const sub of subs){const p=path.join(root,n,sub);try{const st=fs.statSync(p);freed+=st.isDirectory()?1:st.size;fs.rmSync(p,{recursive:true,force:true})}catch{}}
  try{for(const f of fs.readdirSync(path.join(root,n,'adapter')))if(/^0\d*_adapters\.safetensors$/.test(f))fs.rmSync(path.join(root,n,'adapter',f),{force:true})}catch{}
 }
 return freed;
}
module.exports={state,selected,activate,rollback,prune,home};
