const path=require('path'),os=require('os'),fs=require('fs'),{spawnSync}=require('child_process');
const python=path.join(os.homedir(),'Library','Application Support','gateway-chat','training','venv','bin','python');
if(!fs.existsSync(python)){const setup=spawnSync(process.execPath,[path.join(__dirname,'setup-training.js')],{stdio:'inherit'});if(setup.error||setup.status!==0)process.exit(1)}
const [mode,...args]=process.argv.slice(2);
const script=mode==='evaluate'?'evaluate-finetune.py':'finetune.py';
const result=spawnSync(python,[path.join(__dirname,script),...(mode==='evaluate'?args:['run',...args,...(args.includes('--evaluate')?['--prepare-activation']:[])])],{stdio:'inherit',env:{...process.env,HF_HUB_DISABLE_TELEMETRY:'1',WANDB_MODE:'disabled'}});
process.exitCode=result.error?1:(result.status??1);
// Desktop starts activate automatically through bot-training; CLI leaves a passing artifact ready for Desktop activation.

