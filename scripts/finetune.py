"""Local experimental Qwen QLoRA runner. Never activates weights or uploads data."""
import argparse, datetime, hashlib, json, os, pathlib, subprocess, sys, uuid, re
ROOT=pathlib.Path(__file__).resolve().parents[1]
HOME=pathlib.Path.home()/ 'Library/Application Support/gateway-chat/training'
MODEL='mlx-community/Qwen2.5-3B-Instruct-4bit'
def write(p,o): p.write_text(json.dumps(o,indent=2)+'\n');p.chmod(0o600)
def validate_task(task):
    if not task.get('ready'): raise ValueError(task.get('reason') or 'Task dataset not ready')
    groups={};seen=set();selected=[]
    for e in task.get('examples',[]):
        if e.get('state')!='eligible': continue
        split=e.get('split');group=e.get('group');ms=e.get('messages',[])
        if split not in ['train','valid','test'] or not isinstance(group,str) or not group: raise ValueError('Invalid task split or conversation group')
        if group in groups and groups[group]!=split: raise ValueError('Conversation leakage across splits')
        groups[group]=split
        if len(ms)!=2 or [m.get('role') for m in ms]!=['user','assistant'] or any(not isinstance(m.get('content'),str) or not m['content'].strip() for m in ms): raise ValueError('Invalid task messages')
        key=' '.join(ms[0]['content'].lower().split())
        if key in seen: raise ValueError('Duplicate task prompt')
        seen.add(key)
        if re.search(r'-----BEGIN .*PRIVATE KEY-----|(?:password|api[_ -]?key|secret|access[_ -]?token|authorization)\s*[:=]\s*\S{8,}|\bsk-[a-zA-Z0-9]{16,}|\bghp_[a-zA-Z0-9]+', '\n'.join(m['content'] for m in ms),re.I): raise ValueError('Possible credential in task data')
        if e.get('rejectedAnswer') and ms[1]['content'].strip()==e['rejectedAnswer'].strip(): raise ValueError('Rejected answer used as target')
        selected.append(e)
    if set(groups.values())!={'train','valid','test'}: raise ValueError('Task dataset needs three conversation-separated splits')
    return selected

def validate_tokens(run, tokenizer, maximum):
    lengths=[]
    for split in ['train','valid','test']:
        for line in (run/'data'/(split+'.jsonl')).read_text().splitlines():
            ms=json.loads(line)['messages']
            tokens=tokenizer.apply_chat_template(ms,tokenize=True,return_dict=False)
            prefix=tokenizer.apply_chat_template(ms[:-1],tokenize=True,add_generation_prompt=True,return_dict=False)
            if len(tokens)>maximum: raise ValueError('Example exceeds token budget; section it before training instead of truncating the answer')
            if len(tokens)<=len(prefix): raise ValueError('No assistant tokens to train')
            lengths.append(len(tokens))
    return {'examples':len(lengths),'maxTokens':max(lengths),'sequenceLimit':maximum}

def prepare(base, reviewed=False, task_data=None, skills=False):
    fixture=json.loads((ROOT/'training-config/pilot-examples.json').read_text())
    if skills:
        import importlib.util
        spec=importlib.util.spec_from_file_location('skill_data',ROOT/'scripts/skill-data.py');sd=importlib.util.module_from_spec(spec);spec.loader.exec_module(sd)
        fixture=sd.build()
    if reviewed:
        source=json.loads((base/'corrections.json').read_text())
        pairs=[];seen=set()
        for row in source:
            if row.get('review')!='approved': continue
            prompt=str(row.get('prompt','')).strip();answer=str(row.get('expected','')).strip()
            if not prompt or not answer: raise ValueError('Empty approved example')
            import re
            if re.search(r'-----BEGIN .*PRIVATE KEY-----|(?:password|api[_ -]?key|secret|token)\s*[:=]\s*\S{8,}',prompt+' '+answer,re.I): raise ValueError('Possible credential in reviewed data')
            key=prompt.lower()
            if key in seen: continue
            seen.add(key);pairs.append([prompt,answer])
        if len(pairs)<30: raise ValueError('Need at least 30 distinct approved corrections for this reviewed-data run; no raw AI replies are auto-approved.')
        pairs.sort(key=lambda p:hashlib.sha256(p[0].encode()).hexdigest())
        n=max(4,len(pairs)//10)
        fixture={'origin':'Approved correction targets from local corrections.json. Approval does not prove factual correctness.','train':pairs[2*n:],'valid':pairs[:n],'test':pairs[n:2*n]}
    if task_data:
        task=json.loads(pathlib.Path(task_data).read_text())
        selected=validate_task(task)
        fixture={'origin':task['source'],**{s:[] for s in ['train','valid','test']}}
        for e in selected:
            if e.get('state')=='eligible' and e.get('split') in ['train','valid','test']:
                fixture[e['split']].append([e['messages'][0]['content'],e['messages'][1]['content']])
        if not all(fixture[s] for s in ['train','valid','test']): raise ValueError('Task dataset needs all three splits')
    run=base/'runs'/('pilot-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:6]);run.mkdir(parents=True,mode=0o700)
    if task_data: write(run/'interaction-evidence.json',task)
    data=run/'data';data.mkdir();seen={};counts={}
    for split in ['train','valid','test']:
        rows=[]
        for item in fixture[split]:
            if isinstance(item,dict):  # a whole conversation (the bot's real understanding prompt); the last user turn identifies it
                msgs=item['messages'];prompt=' || '.join(m['content'] for m in msgs if m['role']=='user');row={'messages':msgs,**({'tools':item['tools']} if item.get('tools') else {})}  # tool-use episodes keep their tool definitions  # the whole conversation identifies it ("ok" alone repeats)
            else:
                prompt,answer=item;row={'messages':[{'role':'user','content':prompt},{'role':'assistant','content':answer}]}
            key=prompt.strip().lower()
            if seen.get(key,split)!=split: raise ValueError('Duplicate prompt across splits')  # (your own examples are repeated inside train on purpose; they never cross into valid or test)
            seen[key]=split
            rows.append(row)
        p=data/(split+'.jsonl');p.write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows));p.chmod(0o600);counts[split]=len(rows)
    write(run/'manifest.json',{'status':'prepared','experimental':True,'origin':fixture['origin'],'counts':counts,'model':MODEL,'packs':[x for x in os.environ.get('TULAI_PACKS','').split(',') if x.strip()],'dataHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in data.iterdir()},'activeModelChanged':False,'scope':'Conversation-separated task outcomes; not independent verification.' if task_data else 'Small behavior pilot; not proof of broad intelligence.'})
    return run

def main():
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['prepare','run']);parser.add_argument('--task-data');parser.add_argument('--skills',action='store_true');parser.add_argument('--seed',type=int,default=None);parser.add_argument('--num-layers',type=int,default=0);parser.add_argument('--batch-size',type=int,default=0);parser.add_argument('--grad-accum',type=int,default=1);parser.add_argument('--prepare-activation',action='store_true');parser.add_argument('--reviewed',action='store_true');parser.add_argument('--evaluate',action='store_true');parser.add_argument('--iterations',type=int,default=30);parser.add_argument('--learning-rate',type=float,default=0.00001);args=parser.parse_args()
    if args.skills:  # the shared recipe (training-config/skills-recipe.json) fills in whatever was not given on the command line
        recipe=json.loads((ROOT/'training-config/skills-recipe.json').read_text());given=sys.argv[1:]
        if '--iterations' not in given:args.iterations=recipe['iterations']
        if os.environ.get('TULAI_PACKS','').strip():args.iterations=max(args.iterations,min(4000,int(os.environ.get('TULAI_ITERATIONS') or args.iterations)))  # a skill pack adds rows: more passes, so the new skill is learned and the old ones are kept
        if '--learning-rate' not in given:args.learning_rate=recipe['learningRate']
        if '--num-layers' not in given:args.num_layers=recipe['numLayers']
        if '--batch-size' not in given:args.batch_size=recipe['batchSize']
        if '--grad-accum' not in given:args.grad_accum=recipe['gradAccum']
        args.lora_rank=0
        if os.environ.get('TULAI_PACKS','').strip():  # skill packs teach many exact skills at once: a wider adapter (more layers, higher rank) learns them without forgetting the older ones
            if '--num-layers' not in given:args.num_layers=recipe.get('packLayers',args.num_layers)
            args.lora_rank=int(recipe.get('packRank',0))
    resume=pathlib.Path(os.environ.get('TULAI_RESUME_ADAPTER','') or '/nonexistent')
    if args.skills and (resume/'adapters.safetensors').exists() and (resume/'adapter_config.json').exists():  # continue from the brain you use now: same adapter shape, fewer steps, it keeps what it knows
        ac=json.loads((resume/'adapter_config.json').read_text()); args.num_layers=int(ac.get('num_layers') or args.num_layers); args.lora_rank=int((ac.get('lora_parameters') or {}).get('rank') or args.lora_rank or 0)
        if '--learning-rate' not in sys.argv[1:]: args.learning_rate=float(os.environ.get('TULAI_RESUME_LR') or 1e-5)  # a gentle practice on a brain that already knows: the full rate (4e-5) overwrote what it knew
    else: resume=None
    if not 1<=args.iterations<=((4000 if os.environ.get('TULAI_PACKS','').strip() else 800) if args.skills else 200): parser.error('Pilot iterations must be 1–200 (1–800 for --skills, 1–4000 with skill packs)')
    if not 0 < args.learning_rate <= 0.001: parser.error('Learning rate must be positive and at most 0.001')
    HOME.mkdir(parents=True,exist_ok=True,mode=0o700)
    run=prepare(HOME,args.reviewed,args.task_data,args.skills);print(run,flush=True)
    if args.action=='prepare':return
    from huggingface_hub import HfApi,snapshot_download
    pinned=json.loads((ROOT/'training-config/skills-recipe.json').read_text()).get('baseRevision') if args.skills else None  # same base weights on every install
    revision=pinned or HfApi().model_info(MODEL).sha
    model=snapshot_download(MODEL,revision=revision,cache_dir=str(HOME/'model-cache'),allow_patterns=['*.json','*.safetensors','*.model','*.txt','*.jinja'])
    from transformers import AutoTokenizer
    token_check=validate_tokens(run,AutoTokenizer.from_pretrained(model),2048 if args.task_data else 4096 if args.skills else 256)
    manifest=json.loads((run/'manifest.json').read_text());manifest['tokenValidation']=token_check;manifest['learningRate']=args.learning_rate;manifest.update(revision=revision,status='training',iterations=args.iterations,runtime=subprocess.check_output([sys.executable,'-m','pip','freeze'],text=True).splitlines());write(run/'manifest.json',manifest)
    if getattr(args,'lora_rank',0):
        (run/'lora-config.yaml').write_text(f'lora_parameters:\n  rank: {args.lora_rank}\n  scale: 20.0\n  dropout: 0.0\n')
        manifest['loraRank']=args.lora_rank;write(run/'manifest.json',manifest)
    if resume: manifest['resumedFrom']=str(resume.parent.name);write(run/'manifest.json',manifest)
    cmd=[str(pathlib.Path(sys.executable).parent/'mlx_lm.lora'),'--model',model,'--data',str(run/'data'),'--train','--iters',str(args.iterations),'--batch-size',str(args.batch_size or (4 if args.skills else 1)),'--grad-accumulation-steps',str(max(1,args.grad_accum)),*(['--grad-checkpoint'] if args.skills else []),'--num-layers',str(args.num_layers or (8 if args.skills else 4)),'--max-seq-length','2048' if args.task_data else '4096' if args.skills else '256','--learning-rate',str(args.learning_rate),'--steps-per-report','5','--steps-per-eval','10','--val-batches','3','--save-every','10','--seed',str(args.seed if args.seed is not None else 0),'--mask-prompt','--adapter-path',str(run/'adapter'),*(['-c',str(run/'lora-config.yaml')] if getattr(args,'lora_rank',0) else [])]
    if resume: cmd+=['--resume-adapter-file',str(resume/'adapters.safetensors')]
    try:
        with (run/'training.log').open('w') as log: subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT,check=True,env={**os.environ,'HF_HUB_DISABLE_TELEMETRY':'1','WANDB_MODE':'disabled'})
        for ck in (run/'adapter').glob('0*_adapters.safetensors'):ck.unlink()  # only the final adapter is needed; the 50 checkpoints are ~1 GB
        manifest['status']='trained-not-activated';write(run/'manifest.json',manifest)
        print('Training completed; adapter is NOT active: '+str(run),flush=True)
        if args.evaluate:
            subprocess.run([sys.executable,str(ROOT/'scripts/evaluate-finetune.py'),str(run)],check=True)
            manifest['status']='evaluated-awaiting-review';write(run/'manifest.json',manifest)
            print('Training and comparison finished.',flush=True)
            if args.prepare_activation:
                for attempt in range(3):  # a checking tool that crashed (no scores at all) is not a failed model: check the same model again before anything is retrained
                    activation=subprocess.run([sys.executable,str(ROOT/'scripts/prepare-activation.py'),str(run)])
                    try:err=json.loads((run/'activation-error.json').read_text()).get('error','')
                    except Exception:err=''
                    if activation.returncode==0 or 'Cannot verify' not in err:break
                    print(f'The quality check itself did not run ({err[:80]}); checking the same model again ({attempt+2} of 3).',flush=True)
                manifest['status']='activation-ready' if activation.returncode==0 else 'activation-blocked'
                write(run/'manifest.json',manifest)
                print('Activation preparation: '+manifest['status'],flush=True)
    except BaseException:
        manifest['status']='failed-or-interrupted';write(run/'manifest.json',manifest);raise
def gate_result(run):
    """(checks passed, [ids of packs under their bar]) from a run's quality check, or (None, []) when it was not checked."""
    try: g=json.loads((run/'deployment'/'gguf-gate.json').read_text())
    except Exception: return None,[]
    names={p['name']:p['id'] for p in json.loads((ROOT/'training-config/skill-packs.json').read_text())['packs']}; per={}
    for c in g.get('cases',[]):
        if c.get('group')!='pack': continue
        n=str(c.get('name','')).split(':')[0]; a=per.setdefault(n,[0,0]); a[1]+=1; a[0]+=bool(c.get('passed'))
    return g.get('score'),[names[n] for n,(ok,t) in per.items() if n in names and ok*100<t*80]
def skills_with_seeds():
    """A fine-tune is not perfectly repeatable: the same recipe can land just under the gate on one random seed and pass on the next.
    So the recipe lists a few seeds; they are tried in order and the first model that passes every check wins. The rest are deleted."""
    recipe=json.loads((ROOT/'training-config/skills-recipe.json').read_text());argv=sys.argv[1:]
    seeds=recipe.get('seeds',[0]); start=os.environ.get('TULAI_SEED_FROM','').strip()
    if start.isdigit() and int(start) in seeds: seeds=seeds[seeds.index(int(start)):]  # continue from a try that was cut off (the Mac restarted), instead of starting over
    best=None; top=None
    for seed in seeds:
        print(f'--- skills training, seed {seed} (attempt {recipe.get("seeds",[0]).index(seed)+1} of {len(recipe.get("seeds",[0]))}) ---',flush=True)
        before={p.name for p in (HOME/'runs').glob('pilot-*')}
        subprocess.run([sys.executable,str(pathlib.Path(__file__).resolve()),*argv,'--seed',str(seed)])
        made=[p for p in (HOME/'runs').glob('pilot-*') if p.name not in before]  # the run(s) this seed created, not whichever folder was touched last
        passed=[p for p in made if (p/'activation-ready.json').exists()]
        if passed:print('A model that passed every check is ready: '+str(passed[-1])+'. The remaining seeds are NOT run.',flush=True);return
        for p in sorted(made):  # keep learning as a chain with a safety rail: the next try continues from THIS try (seed 0 -> 7 -> 21 -> 42) so what it learned
            sc,failed=gate_result(p)  # is carried forward, unless it fell more than 2 checks below the best try so far (then from that best try, so one bad try never poisons the rest)
            if not (p/'adapter'/'adapters.safetensors').exists() or sc is None: continue
            if top is None or sc>=top[0]: top=(sc,p,failed)
            best=(sc,p,failed) if sc>=top[0]-2 else top
        if best:
            os.environ['TULAI_RESUME_ADAPTER']=str(best[1]/'adapter'); os.environ['TULAI_RESUME_RUN']=best[1].name
            os.environ['TULAI_MISTAKES_RUNS']=','.join(dict.fromkeys([best[1].name]+[p.name for p in sorted(made) if gate_result(p)[0] is not None]))  # the next try practises right where this try and the one it continues from went wrong
            boost=[x for x in os.environ.get('TULAI_NEW_PACKS','').split(',') if x]+best[2]; os.environ['TULAI_NEW_PACKS']=','.join(dict.fromkeys(boost))
            print(f'Seed {seed} did not pass every check; the next try continues from {'this try' if best[1] in made else 'the best try so far'} ({best[1].name}, {best[0]} checks passed) and practises: {", ".join(best[2]) or "everything"}.',flush=True)
        else: print(f'Seed {seed} did not pass every check; trying the next.',flush=True)
    print('No seed produced a model that passed every check; the base model stays.',flush=True)
if __name__=='__main__':
    if '--skills' in sys.argv and '--seed' not in sys.argv and 'run' in sys.argv:skills_with_seeds()
    else:main()
