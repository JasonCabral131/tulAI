import importlib.util,pathlib,tempfile,json
p=pathlib.Path(__file__).resolve().parents[1]/'scripts/finetune.py'
s=importlib.util.spec_from_file_location('ft',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 base=pathlib.Path(d);run=m.prepare(base);manifest=json.loads((run/'manifest.json').read_text());assert manifest['counts']=={'train':20,'valid':3,'test':4};assert manifest['activeModelChanged'] is False
 (base/'corrections.json').write_text(json.dumps([{'review':'pending','prompt':'hi','expected':'hello'}]))
 try:m.prepare(base,True);raise AssertionError('Pending examples trained')
 except ValueError:pass
 approved=[{'review':'approved','prompt':f'question {i}','expected':f'answer {i}'} for i in range(30)]
 (base/'corrections.json').write_text(json.dumps(approved));run=m.prepare(base,True);man=json.loads((run/'manifest.json').read_text());assert sum(man['counts'].values())==30
 approved[0]['expected']='password: verysecret12345';(base/'corrections.json').write_text(json.dumps(approved))
 try:m.prepare(base,True);raise AssertionError('Credential accepted')
 except ValueError:pass
 print('PASS dataset splits, pending exclusion, reviewed gate, credential rejection, inactive candidate')

with tempfile.TemporaryDirectory() as d:
 base=pathlib.Path(d)
 task={'ready':True,'source':'test interactions','examples':[{'state':'eligible','group':split,'split':split,'messages':[{'role':'user','content':split+' question'},{'role':'assistant','content':'corrected target'}],'rejectedAnswer':'failed answer'} for split in ['train','valid','test']]}
 f=base/'task.json';f.write_text(json.dumps(task));run=m.prepare(base,task_data=f)
 assert (run/'interaction-evidence.json').exists()
 assert 'failed answer' not in (run/'data/train.jsonl').read_text()
 assert 'corrected target' in (run/'data/train.jsonl').read_text()
 print('PASS interaction training export preserves evidence and excludes rejected answers')
with tempfile.TemporaryDirectory() as d:
 base=pathlib.Path(d);run=m.prepare(base)
 class Tokenizer:
  def apply_chat_template(self,ms,**kw):return list(range(20 if len(ms)==2 else 10))
 assert m.validate_tokens(run,Tokenizer(),30)['examples']==27
 try:m.validate_tokens(run,Tokenizer(),15);raise AssertionError('Truncated target allowed')
 except ValueError:pass
 print('PASS sequence validation prevents truncation')
