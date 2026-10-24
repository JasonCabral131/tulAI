// Optional local Apple Silicon trainer; all downloads stay outside the repository.
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Local MLX training requires Apple Silicon macOS');
const dir=path.join(os.homedir(),'Library','Application Support','gateway-chat','training'),venv=path.join(dir,'venv');fs.mkdirSync(dir,{recursive:true,mode:0o700});
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}
if(!fs.existsSync(path.join(venv,'bin','python')))run('python3',['-m','venv',venv]);
run(path.join(venv,'bin','python'),['-m','pip','install','mlx-lm==0.32.0','pyarrow==25.0.1']);
run(process.execPath,[path.join(__dirname,'setup-converter.js')]);
console.log('Local trainer ready. No dataset uploaded, training started or active model changed.');
