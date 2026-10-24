"""Compare frozen base and candidate on held-out prompts, without action tools."""
import argparse,gc,json,pathlib,re,os
os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
from mlx_lm import load,generate
from mlx_lm.sample_utils import make_sampler
import mlx.core as mx
p=argparse.ArgumentParser();p.add_argument('run');args=p.parse_args();run=pathlib.Path(args.run).resolve()
manifest=json.loads((run/'manifest.json').read_text())
if manifest['status']!='trained-not-activated':raise ValueError('Training did not complete')
model_path=run.parents[1]/'model-cache'/('models--'+manifest['model'].replace('/','--'))/'snapshots'/manifest['revision']
rows=[json.loads(x) for x in (run/'data/test.jsonl').read_text().splitlines()]
results={}
for name,adapter in [('base',None),('candidate',str(run/'adapter'))]:
    model,tok=load(str(model_path),adapter_path=adapter)
    outputs=[]
    for row in rows:
        prompt=row['messages'][0]['content']
        tokens=tok.apply_chat_template([{'role':'user','content':prompt}],add_generation_prompt=True,tokenize=True)
        out=generate(model,tok,prompt=tokens,max_tokens=512,sampler=make_sampler(temp=0))
        outputs.append({'prompt':prompt,'answer':out,'reference':row['messages'][-1]['content']})
    results[name]=outputs
    del model,tok;gc.collect();mx.clear_cache()
# Keep raw answers for review; loss or phrase overlap alone must not approve activation.
result={'scope':'Held-out interaction prompts; no actual tool execution. Human-readable comparison, no automatic promotion.', 'base':results['base'],'candidate':results['candidate'],'deployment':'not activated','decision':'requires comparison review'}
(run/'evaluation.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n');(run/'evaluation.json').chmod(0o600)
print(run/'evaluation.json')
