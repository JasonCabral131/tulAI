const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tulai-activation-'));process.env.GC_DATA_DIR=dir;
const model=require('../active-model');
function fixture(id){const run='pilot-'+id,root=path.join(dir,'training/runs',run);fs.mkdirSync(root+'/deployment',{recursive:true});const bytes=Buffer.from('GGUFfixture-'+id),file=root+'/deployment/model-q4_k_m.gguf';fs.writeFileSync(file,bytes);fs.writeFileSync(root+'/manifest.json',JSON.stringify({status:'activation-ready'}));fs.writeFileSync(root+'/deployment/gguf-gate.json',JSON.stringify({passed:true,cases:[{passed:true}]}));fs.writeFileSync(root+'/activation-ready.json',JSON.stringify({run,path:file,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),gatePassed:true}));return {run,root,file};}
(async()=>{try{
 const a=fixture('a'),b=fixture('b'),nlu={reloadLocal:async()=>true};
 await model.activate(a.run,nlu);assert.equal(model.selected(),a.file);
 let count=0;await assert.rejects(()=>model.activate(b.run,{reloadLocal:async()=>++count!==1}),/failed to start/);assert.equal(model.selected(),a.file);assert.equal(count,2);
 await model.activate(b.run,nlu);assert.equal(model.selected(),b.file);await model.rollback(nlu);assert.equal(model.selected(),a.file);
 fs.writeFileSync(b.file,'GGUFtampered');await assert.rejects(()=>model.activate(b.run,nlu),/integrity/);assert.equal(model.selected(),a.file);
 fs.writeFileSync(a.root+'/manifest.json',JSON.stringify({status:'evaluated-rejected'}));await assert.rejects(()=>model.activate(a.run,nlu),/Rejected/);
 // the gate's own verdict decides: bounded misses outside the core cases are fine, any core miss is not
 const c=fixture('c'),g=(cases,passed)=>fs.writeFileSync(c.root+'/deployment/gguf-gate.json',JSON.stringify({passed,cases}));
 g([{group:'core',passed:true},{group:'extra',passed:false},{group:'general',passed:false}],true);await model.activate(c.run,nlu);assert.equal(model.selected(),c.file,'tolerated non-core misses still activate');
 await model.rollback(nlu);g([{group:'core',passed:false},{group:'extra',passed:true}],true);await assert.rejects(()=>model.activate(c.run,nlu),/gate failed/,'a core miss blocks even if the file says passed');
 g([{group:'core',passed:true}],false);await assert.rejects(()=>model.activate(c.run,nlu),/gate failed/,'the gate verdict must be passed');
 await assert.rejects(()=>model.activate('../escape',nlu),/Invalid/);
 console.log('PASS atomic selection, failed-start rollback, manual rollback, checksum failure and rejected-run block (mocked server)');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
