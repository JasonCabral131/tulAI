const assert=require('assert'),{inspect}=require('../scripts/check-setup');
const ok=()=>({status:0});
let r=inspect({preflight:true,platform:'darwin',arch:'arm64',node:'24.0.0',run:ok});assert(r.ready);
r=inspect({preflight:true,platform:'linux',arch:'x64',node:'16.0.0',run:ok});assert(!r.ready);assert(r.checks.filter(c=>!c.passed).length>=3);
r=inspect({preflight:true,platform:'darwin',arch:'arm64',node:'24.0.0',run:(cmd)=>({status:cmd==='brew'?1:0})});assert(!r.ready);assert(r.checks.find(c=>c.name==='brew').fix);
r=inspect({preflight:true,training:false,platform:'darwin',arch:'x64',node:'24.0.0',run:ok});assert(r.ready);
r=inspect({platform:'darwin',arch:'arm64',node:'24.0.0',run:(cmd,args)=>({status:args.includes('scripts/fetch-models.js')?1:0}),exists:()=>true});assert(!r.ready);assert(!r.checks.find(c=>c.name.includes('SHA-256')).passed);
r=inspect({preflight:true,platform:'darwin',arch:'arm64',node:'24.0.0',run:()=>({status:null,error:Error('missing executable')})});assert(!r.ready);
// desktop-only: no Homebrew, models or engines needed
r=inspect({platform:'darwin',arch:'arm64',node:'24.0.0',training:false,bot:false,run:(cmd,args)=>({status:cmd==='brew'||cmd==='llama-server'||cmd==='whisper-cli'||(args||[]).includes('scripts/fetch-models.js')?1:0}),exists:()=>true});assert(r.ready,'desktop-only install needs no bot engines or models');assert(!r.checks.some(c=>/brew|SHA-256|llama|whisper/.test(c.name)));
{const fs=require('fs'),path=require('path'),root=path.join(__dirname,'..'),setup=fs.readFileSync(path.join(root,'scripts/setup.js'),'utf8'),desk=fs.readFileSync(path.join(root,'main-desktop.js'),'utf8'),pkg=require('../package.json');
 assert(/!process\.argv\.includes\('--bot'\)/.test(setup)&&/desktop-only'\)/.test(setup),'setup is Desktop-only unless --bot is given, and remembers the choice');
 assert(/DESKTOP-ONLY/.test(desk)&&/desktop-only'\)/.test(desk)&&/desktopOnly\(\)/.test(desk),'Desktop does not start the bot in a Desktop-only install');
 assert(/TULAI_DESKTOP_ONLY=1/.test(pkg.scripts['build:desktop'])&&pkg.scripts['setup:desktop']&&/--bot/.test(pkg.scripts['setup:bot'])&&pkg.scripts['start:desktop'],'Desktop-only npm scripts exist');}
// a Desktop-only build stays Desktop-only after packaging: slimming the installer must keep the marker
{const fs=require('fs'),path=require('path'),os=require('os'),{slim}=require('../build/protect'),res=fs.mkdtempSync(path.join(os.tmpdir(),'tulai-slim-')),models=path.join(res,'models'),marker=path.join(models,'DESKTOP-ONLY');
 const fill=(withMarker)=>{fs.mkdirSync(models,{recursive:true});fs.writeFileSync(path.join(models,'a.gguf'),'x');if(withMarker)fs.writeFileSync(marker,'m');};
 try{fill(true);slim(res);assert(fs.existsSync(marker),'slim packaging keeps the DESKTOP-ONLY marker');assert(!fs.existsSync(path.join(models,'a.gguf')),'slim packaging removes models');
  fs.rmSync(models,{recursive:true,force:true});fill(false);slim(res);assert(!fs.existsSync(models),'a slim build with the bot ships no models folder');}finally{fs.rmSync(res,{recursive:true,force:true});}
 const desk=fs.readFileSync(path.join(__dirname,'..','main-desktop.js'),'utf8');
 assert(/openAtLogin: p\.login, args: desktopOnly\(\) \? \[\] : \['--bot'\]/.test(desk),'start at login never launches the bot on a Desktop-only install');}
console.log('PASS missing tools, unsupported OS/CPU/Node, checksum failure, opt-out, spawn errors and Desktop-only installs');
