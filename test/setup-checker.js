const assert=require('assert'),{inspect}=require('../scripts/check-setup');
const ok=()=>({status:0});
let r=inspect({preflight:true,platform:'darwin',arch:'arm64',node:'24.0.0',run:ok});assert(r.ready);
r=inspect({preflight:true,platform:'linux',arch:'x64',node:'16.0.0',run:ok});assert(!r.ready);assert(r.checks.filter(c=>!c.passed).length>=3);
r=inspect({preflight:true,platform:'darwin',arch:'arm64',node:'24.0.0',run:(cmd)=>({status:cmd==='brew'?1:0})});assert(!r.ready);assert(r.checks.find(c=>c.name==='brew').fix);
r=inspect({preflight:true,training:false,platform:'darwin',arch:'x64',node:'24.0.0',run:ok});assert(r.ready);
r=inspect({platform:'darwin',arch:'arm64',node:'24.0.0',run:(cmd,args)=>({status:args.includes('scripts/fetch-models.js')?1:0}),exists:()=>true});assert(!r.ready);assert(!r.checks.find(c=>c.name.includes('SHA-256')).passed);
r=inspect({preflight:true,platform:'darwin',arch:'arm64',node:'24.0.0',run:()=>({status:null,error:Error('missing executable')})});assert(!r.ready);
console.log('PASS missing tools, unsupported OS/CPU/Node, checksum failure, opt-out and spawn errors');
