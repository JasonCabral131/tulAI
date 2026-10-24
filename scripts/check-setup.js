// Read-only checks, except an isolated temporary write probe. Never starts voice capture or signs in.
const fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const root=path.resolve(__dirname,'..');
function inspect({preflight=false,training=true,run=spawnSync,exists=fs.existsSync,platform=process.platform,arch=process.arch,node=process.versions.node}={}){
 const checks=[],add=(name,ok,fix)=>checks.push({name,passed:!!ok,...(!ok?{fix}: {})});
 const cmd=(name,args=[])=>{const r=run(name,args,{cwd:root,encoding:'utf8',timeout:90000});return !r.error&&r.status===0};
 add('macOS',platform==='darwin','Use a Mac; this desktop build is macOS-only.');
 add('Apple Silicon for local training',!training||arch==='arm64','Local MLX training needs Apple Silicon. Use --skip-training for the basic bot on another supported Mac.');
 add('Node.js 22 or newer',+node.split('.')[0]>=22,'Install Node.js 22 or newer (required by Selenium).' );
 for(const [name,args,fix] of [['git',['--version'],'Install Xcode Command Line Tools.'],['brew',['--version'],'Install Homebrew from brew.sh.'],['xcrun',['--find','swiftc'],'Install Xcode Command Line Tools with xcode-select --install.']])add(name,cmd(name,args),fix);
 if(training)add('Python 3.10 or newer',cmd('python3',['-c','import sys;sys.exit(0 if sys.version_info >= (3,10) else 1)']),'Install a compatible Python 3.10+ for the local MLX runtime.');
 if(!preflight){
  add('Project dependencies',cmd('npm',['ls','--depth=0']),'Reinstall project dependencies with npm ci.');
  add('Required model sizes and SHA-256 checksums',cmd(process.execPath,['scripts/fetch-models.js','--check']),'Rerun setup to download or repair model files.');
  for(const name of ['llama-server','whisper-cli'])add(name,cmd(name,['--version']),`Rerun setup to install the ${name} engine.`);
  if(training)add('llama-quantize',cmd('which',['llama-quantize']),'Rerun setup to install the llama-quantize engine.'); // it has no --version flag, so presence is what is checked
  for(const name of ['tulay-listen','tulay-ocr','tulai-pdf-text']){const p=path.join(root,'build/bin',name);let ok=exists(p);try{fs.accessSync(p,fs.constants.X_OK)}catch{ok=false}add('Native helper '+name,ok,'Rerun setup to compile the native helpers.');}
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const missing=pkg.build.files.filter(f=>!f.includes('*')&&!exists(path.join(root,f)));add('Packaged source files',missing.length===0,'Restore missing files: '+missing.join(', '));
  if(training){const converter=path.join(os.homedir(),'Library/Application Support/gateway-chat/training/llama-converter/convert_hf_to_gguf.py');add('GGUF converter',exists(converter),'Rerun setup to install the GGUF converter.');const py=path.join(os.homedir(),'Library/Application Support/gateway-chat/training/venv/bin/python');add('MLX import and local compute',exists(py)&&cmd(py,['-c','import mlx.core as mx; import mlx_lm; import transformers; assert mx.array([1,2]).sum().item()==3']),'Rerun setup to install a compatible training runtime.');}
 }
 return {ready:checks.every(c=>c.passed),phase:preflight?'preflight':'installed',checks,manual:['Allow microphone/speech, screen recording and accessibility when requested for those features.','Sign in to your own work/browser accounts; connections are not inherited from another user.','A clean installation on this machine is not a guarantee for every other Mac.']};
}
if(require.main===module){const preflight=process.argv.includes('--preflight'),training=!process.argv.includes('--skip-training'),result=inspect({preflight,training});
 for(const c of result.checks)console.log(`${c.passed?'PASS':'FAIL'} ${c.name}${c.fix?' — '+c.fix:''}`);
 console.log(result.ready?'Readiness checks passed.':'Setup is NOT ready. Fix the failed checks.');for(const note of result.manual)console.log('Manual: '+note);
 process.exitCode=result.ready?0:1;
}
module.exports={inspect};
