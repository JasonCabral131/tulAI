"""Gate MLX candidate, export Qwen GGUF, then gate the actual quantized artifact.
Never changes the running model. Node performs the atomic switch and rollback.
"""
import argparse,json,pathlib,subprocess,sys,os,hashlib,time,urllib.request,socket,importlib.util,gc,shutil
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
spec=importlib.util.spec_from_file_location('gate',pathlib.Path(__file__).with_name('activation-gate.py'));gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def write(p,v):
 tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(v,indent=2)+'\n');tmp.chmod(0o600);tmp.replace(p)
def add_understanding(result,port):
 """The bot's real command understanding (nlu.js with its checks) must work on the converted model too: all cases pass, and conversation never turns into an action.
 If this cannot be run, nothing is activated."""
 app=pathlib.Path(os.environ.get('TULAI_APP_DIR') or pathlib.Path(__file__).resolve().parents[1]);node=os.environ.get('TULAI_NODE') or shutil.which('node')
 if not node:raise ValueError('Cannot verify command understanding: node was not found; no activation')
 env={**os.environ,**({'ELECTRON_RUN_AS_NODE':'1'} if os.environ.get('TULAI_NODE') else {})}
 r=subprocess.run([node,str(app/'scripts/nlu-gate.js'),str(app),str(port)],capture_output=True,text=True,timeout=600,env=env)
 try:cases=json.loads(r.stdout)
 except ValueError:raise ValueError('Cannot verify command understanding ('+(r.stderr.strip()[:120] or 'no output')+'); no activation')
 result['cases']+=cases;result['total']+=len(cases);result['score']+=sum(c['passed'] for c in cases)
 for g in ('nlu','chat','conversation','memory','custom'):
  sub=[c for c in cases if c['group']==g]
  if sub or g in ('nlu','chat','conversation'):result['groups'][g]={'passed':sum(c['passed'] for c in sub),'total':len(sub)}
 if any(not c['passed'] for c in cases if c['group'] not in ('memory','custom','pack','conversation')):result['passed']=False
 conv=[c for c in cases if c['group']=='conversation']  # 12 dialogues: at most 1 may miss (a single dialogue is a coin flip for a 3B model; the whole set is not)
 if sum(not c['passed'] for c in conv)>max(0,len(conv)//12):result['passed']=False
 mem=[c for c in cases if c['group']=='memory']  # memory: at most 1 of 10 may miss (a small model is not perfect), never a silent pass
 if sum(not c['passed'] for c in mem)>1:result['passed']=False
 packs=[c for c in cases if c['group']=='pack']  # skill packs: the whole pack group must pass at least 85% (you set this bar), and no single pack may fall under 80% (10 tests per pack: 2 may miss)
 for pid in sorted({c['pack'] for c in packs}):
  pc=[c for c in packs if c['pack']==pid];miss=sum(not c['passed'] for c in pc)
  result['groups']['pack:'+pid]={'passed':len(pc)-miss,'total':len(pc)}
  if miss>len(pc)*20//100:result['passed']=False
 if packs and sum(c['passed'] for c in packs)*100<85*len(packs):result['passed']=False
 cus=[c for c in cases if c['group']=='custom']  # your own checks: at least 90% must pass
 if cus and sum(not c['passed'] for c in cus)>len(cus)*10//100:result['passed']=False
def prepare(run,export_only=False):
 (run/'activation-error.json').unlink(missing_ok=True)  # a new attempt starts clean; an old failure must not be shown as the current reason
 m=json.loads((run/'manifest.json').read_text());base=run.parents[1]
 if not export_only and (m.get('status') not in ['evaluated-awaiting-review','evaluated-passed'] or m.get('review',{}).get('decision')=='reject'):raise ValueError('Run is not eligible: evaluate it successfully first; rejected runs cannot activate')
 for name,digest in m['dataHashes'].items():
  if pathlib.Path(name).name!=name or sha(run/'data'/name)!=digest:raise ValueError('Dataset changed after training')
 model=base/'model-cache'/('models--'+m['model'].replace('/','--'))/'snapshots'/m['revision']
 if not export_only:
  from mlx_lm import load,generate
  from mlx_lm.sample_utils import make_sampler
  import mlx.core as mx
  tests={}
  for label,adapter in [('base',None),('candidate',str(run/'adapter'))]:
   net,tok=load(str(model),adapter_path=adapter)
   def answer(prompt):
    ids=tok.apply_chat_template([{'role':'user','content':prompt}],tokenize=True,add_generation_prompt=True)
    return generate(net,tok,prompt=ids,max_tokens=160,sampler=make_sampler(temp=0))
   tests[label]=gate.grade(answer,tests.get('base'));del net,tok;gc.collect();mx.clear_cache()
  write(run/'activation-gate.json',tests)
  diag=(base/'diag').exists()  # a flag file written only when diagnosing: go on to the converted-model gate so every check is reported (that gate alone decides activation)
  if (not tests['candidate']['passed'] or tests['candidate']['score']<tests['base']['score']) and not diag:raise ValueError('Candidate failed device regression gate; active model unchanged')
 repo=base/'llama-converter';converter=repo/'convert_hf_to_gguf.py'
 if not converter.exists():raise ValueError('GGUF converter missing; rerun setup')
 out=run/'deployment';out.mkdir(exist_ok=True,mode=0o700)
 fused=out/'fused';f16=out/'model-f16.gguf';gguf=out/'model-q4_k_m.gguf'
 subprocess.run([sys.executable,'-m','mlx_lm','fuse','--model',str(model),'--adapter-path',str(run/'adapter'),'--dequantize','--save-path',str(fused)],check=True)
 # Fine-tuning does not modify vocabulary. Preserve original tokenizer metadata across Transformers versions.
 for filename in ['tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.json','merges.txt']:
  if (model/filename).exists():shutil.copy2(model/filename,fused/filename)
 subprocess.run([str(base/'converter-venv/bin/python'),str(converter),str(fused),'--outfile',str(f16),'--outtype','f16'],check=True)
 quant=shutil.which('llama-quantize')
 if not quant:raise ValueError('llama-quantize missing; rerun setup')
 subprocess.run([quant,str(f16),str(gguf),'Q4_K_M'],check=True)
 with gguf.open('rb') as f:
  if f.read(4)!=b'GGUF':raise ValueError('Invalid GGUF header')
 server=os.environ.get('TULAI_LLAMA_SERVER') or shutil.which('llama-server')
 if not server:raise ValueError('llama-server missing')
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 url=f'http://127.0.0.1:{port}'
 with (out/'smoke.log').open('w') as log:
  proc=subprocess.Popen([server,'-m',str(gguf),'--host','127.0.0.1','--port',str(port),'-c','4096','-ngl','99','--jinja','--no-webui'],stdout=log,stderr=log)
  try:
   for _ in range(120):
    if proc.poll() is not None:raise ValueError('Candidate server exited')
    try:
     with urllib.request.urlopen(url+'/health',timeout=1) as r:
      if r.status==200:break
    except Exception:time.sleep(.5)
   else:raise ValueError('Candidate server did not become healthy')
   def answer(prompt):
    data=json.dumps({'messages':[{'role':'user','content':prompt}],'temperature':0,'max_tokens':160}).encode()
    with urllib.request.urlopen(urllib.request.Request(url+'/v1/chat/completions',data,{'Content-Type':'application/json'}),timeout=90) as r:return json.load(r)['choices'][0]['message']['content']
   try: baseline=json.loads((run/'activation-gate.json').read_text()).get('base')
   except Exception: baseline=None
   result=gate.grade(answer,baseline);add_understanding(result,port);write(out/'gguf-gate.json',result)
  finally:
   proc.terminate()
   try:proc.wait(timeout=10)
   except subprocess.TimeoutExpired:proc.kill();proc.wait()
   shutil.rmtree(fused,ignore_errors=True);f16.unlink(missing_ok=True)  # 12 GB of intermediates are never needed again
   if 'result' in dir() and not result.get('passed'):gguf.unlink(missing_ok=True)  # a candidate that failed the checks is never kept (its verdict stays in gguf-gate.json)
 if export_only:
  print('Conversion and isolated server test complete; no activation authorized by this export-only run.');return
 if not result['passed']:raise ValueError('Quantized candidate failed regression checks; no activation')
 write(run/'activation-ready.json',{'run':run.name,'path':str(gguf),'sha256':sha(gguf),'bytes':gguf.stat().st_size,'gatePassed':True,'scope':'Six device regression cases on MLX and GGUF; not broad capability certification','createdAt':time.time()})
 print('Candidate ready for atomic activation: '+str(run),flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('run');p.add_argument('--export-only',action='store_true');a=p.parse_args();r=pathlib.Path(a.run).resolve()
 try:prepare(r,a.export_only)
 except Exception as e:
  write(r/'activation-error.json',{'error':str(e),'activeModelChanged':False});raise
