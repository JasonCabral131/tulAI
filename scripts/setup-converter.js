const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const REV='de7fa0a3c6a2e1b4cd9f22eb8d6bf5b12dbdb63b';
const base=path.join(os.homedir(),'Library/Application Support/gateway-chat/training'),repo=path.join(base,'llama-converter');
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.error||r.status!==0)throw Error('Converter setup failed: '+cmd)}
fs.mkdirSync(repo,{recursive:true});if(!fs.existsSync(path.join(repo,'.git')))run('git',['init',repo]);
run('git',['-C',repo,'fetch','--depth','1','https://github.com/ggml-org/llama.cpp.git',REV]);run('git',['-C',repo,'checkout','--detach',REV]);
const env=path.join(base,'converter-venv');if(!fs.existsSync(path.join(env,'bin/python')))run('python3',['-m','venv',env]);
run(path.join(env,'bin/python'),['-m','pip','install','-r',path.join(repo,'requirements/requirements-convert_hf_to_gguf.txt')]);
console.log('Pinned local GGUF converter ready: '+REV);
