const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),{execFileSync,spawnSync}=require('child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tulai-repo-hygiene-')),script=path.resolve(__dirname,'../scripts/repo-check.js');
const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'});
const audit=()=>spawnSync(process.execPath,[script],{env:{...process.env,TULAI_REPO_CHECK_ROOT:dir},encoding:'utf8'});
try{
 git('init','-q');fs.copyFileSync(path.join(__dirname,'../.gitignore'),path.join(dir,'.gitignore'));
 for(const file of ['model.gguf','model.safetensors','model.onnx','model.pt','bot-memory.sqlite','browser-accounts/client/Cookies','artifacts/report.html']){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),'fixture');assert(git('check-ignore',file).trim(),file);}
 assert.equal(audit().status,0);git('add','-f','model.gguf');assert.equal(audit().status,1,'forced model must fail');git('rm','--cached','model.gguf');
 fs.writeFileSync(path.join(dir,'large.txt'),Buffer.alloc(6*1024*1024));git('add','large.txt');fs.writeFileSync(path.join(dir,'large.txt'),'small now');assert.equal(audit().status,1,'large staged blob must fail even if working file is small');git('rm','--cached','-f','large.txt');assert.equal(audit().status,0);
 console.log('PASS ignored downloads/runtime data; forced tracked model and oversized staged blob rejected; clean repository accepted');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
