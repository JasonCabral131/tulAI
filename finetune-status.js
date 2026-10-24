// Report persisted run evidence, never ask the model to invent training progress.
const fs=require('fs'),path=require('path');
function status(){
 const root=path.join(process.env.GC_DATA_DIR||__dirname,'training','runs');
 let names;try{names=fs.readdirSync(root).filter(n=>/^pilot-/.test(n)).sort().reverse()}catch{return 'Model-weight training is not running. No local fine-tuning run is recorded.'}
 for(const name of names){try{const r=JSON.parse(fs.readFileSync(path.join(root,name,'manifest.json'),'utf8'));return `Local Qwen fine-tuning pilot: ${r.status}. Examples: ${r.counts?.train||0} training, ${r.counts?.valid||0} validation, ${r.counts?.test||0} held out. This is a small experimental run, not proof of improved capability. ${require('./active-model').state().current?.run===name?'This candidate is active.':'This run is not the active model.'}`}catch{}}
 return 'Fine-tuning status is unavailable.';
}
module.exports={status};
