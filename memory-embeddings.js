// Dedicated local embedder. Shares the bundled llama runtime, never a cloud API.
const fs=require('fs'),path=require('path'),os=require('os'),net=require('net'),crypto=require('crypto'),{spawn}=require('child_process');
const MODEL='nomic-embed-text-v1.5.Q4_K_M.gguf',VERSION='nomic-v1.5-q4km-768-v1';
let child=null,ready=null,idle=null,retryAt=0;
const model=()=>[path.join(process.env.GC_DATA_DIR||path.join(os.homedir(),'Library/Application Support/gateway-chat'),'models',MODEL),path.join(process.resourcesPath||'', 'models',MODEL)].find(p=>fs.existsSync(p));
const binary=()=>[path.join(process.resourcesPath||'','bin','llama-server'),path.join(__dirname,'build/bin/llama-server'),'/opt/homebrew/bin/llama-server','/usr/local/bin/llama-server'].find(p=>fs.existsSync(p));
function stop(){clearTimeout(idle);const c=child;child=null;ready=null;if(c)c.kill();}
const port=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
async function ensure(){
 if(ready)return ready;if(Date.now()<retryAt)throw Error('Embedding engine cooling down');
 ready=(async()=>{const m=model(),bin=binary();if(!m||!bin)throw Error('Run Tulai setup to install the memory model and runtime.');
 const p=await port(),key=crypto.randomBytes(24).toString('hex'),url='http://127.0.0.1:'+p;
 const c=child=spawn(bin,['-m',m,'--host','127.0.0.1','--port',String(p),'--embedding','--pooling','mean','-c','2048','-b','2048','-ub','2048','-ngl','99','-t','4','--api-key',key,'--no-webui'],{stdio:'ignore'});
 let failed=false;c.on('error',()=>{failed=true});c.on('exit',()=>{failed=true;if(child===c){child=null;ready=null}});
 for(let i=0;i<60;i++){if(failed)break;try{const r=await fetch(url+'/health',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(700)});if(r.ok)return {url,key};}catch{}await new Promise(r=>setTimeout(r,250));}
 throw Error('Local embedding engine did not start');
 })().catch(e=>{stop();retryAt=Date.now()+30000;throw e});return ready;
}
async function embed(text,query=false){const {url,key}=await ensure();clearTimeout(idle);try{const r=await fetch(url+'/v1/embeddings',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({input:(query?'search_query: ':'search_document: ')+String(text).slice(0,2000)}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Embedding request failed');const v=(await r.json()).data?.[0]?.embedding;if(!Array.isArray(v)||v.length!==768||v.some(n=>!Number.isFinite(n)))throw Error('Invalid embedding');return v;}finally{idle=setTimeout(stop,120000);idle.unref();}}
process.on('exit',stop);
module.exports={embed,stop,MODEL,VERSION,available:()=>!!model()&&!!binary()};
