# Memory training rows: computed answers are right, the real "Retrieved memory" format is used, nothing equals a gate question, your own examples are merged and secrets are refused.
import importlib.util, json, os, pathlib, tempfile, sys
root = pathlib.Path(__file__).resolve().parents[1]
def load(n, f):
    sp = importlib.util.spec_from_file_location(n, root / 'scripts' / f); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
ms = load('ms', 'memory-skills.py')
gate_q = {c['text'].lower().strip() for c in json.load(open(root / 'training-config/nlu-gate-cases.json'))['memory']}
assert len(gate_q) == 10
rows = ms.build(7, 400, gate_q); assert len(rows) == 400, len(rows)
for r in rows:
    m = r['messages']; assert m[0]['role'] == 'system' and m[-1]['role'] == 'assistant' and m[-2]['role'] == 'user'
    assert m[-2]['content'].lower().strip() not in gate_q, 'a gate question leaked into training: ' + m[-2]['content']
    ctx = [x for x in m if x['content'].startswith('Retrieved memory:')]
    assert len(ctx) <= 1
    if ctx: assert ctx[0]['content'].startswith(ms.HEADER), 'memory block must be written exactly as bot-memory.js writes it'
# the header must stay identical to the one the bot writes
js = (root / 'bot-memory.js').read_text(); assert ms.HEADER.split('\n')[0] in js, 'memory header drifted from bot-memory.js'
# computed answers
kinds = {'recall': 0, 'absent': 0, 'secret': 0, 'unverified': 0}
for r in rows:
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']; mem = ' '.join(x['content'] for x in r['messages'] if x['content'].startswith('Retrieved memory:'))
    if "I won't save a " in a or "so I won't save it" in a: kinds['secret'] += 1; assert any(w in q.lower() for w in ('remember', 'tandaan', 'save this', 'keep in mind', 'note down')), q
    if "saved yet" in a: kinds['absent'] += 1
    if "can't confirm" in a: kinds['unverified'] += 1; assert 'Assistant:' in mem
    if a.startswith(('Your manager is ', 'You live in ', 'You use ', 'You work in ')): kinds['recall'] += 1; val = a.rstrip('.').split(' is ')[-1].split(' in ')[-1].split('You use ')[-1]; assert val.replace(' team', '') in mem or val in mem, (q, a, mem)
print(kinds); assert all(v > 3 for v in kinds.values()), kinds
# a secret never gets an "I will remember" answer
for r in rows:
    if any(w in r['messages'][-2]['content'].lower() for w in ('password', 'api key', 'credit card', 'token is', 'passcode', ' pin ', 'passphrase', 'one-time', 'cvv')): assert "won't save" in r['messages'][-1]['content']
# your own examples
sd = load('sd', 'skill-data.py'); d = pathlib.Path(tempfile.mkdtemp()); os.environ['TULAI_CUSTOM_DIR'] = str(d); os.environ['TULAI_FREE_DIR'] = tempfile.mkdtemp()
(d / 'mine.jsonl').write_text('\n'.join(json.dumps(x) for x in [
    {'prompt': 'what is our deploy day?', 'answer': 'We deploy on Thursdays.'},
    {'prompt': 'who do I report to', 'answer': 'You report to Zoe.', 'memory': ['my manager is Zoe']},
    {'prompt': 'what is my password', 'answer': 'zq9uniqx'},
    {'check': True, 'prompt': 'deploy day?', 'match': 'Thursday'},
    {'prompt': 'x', 'answer': 'too short question'}, {'broken': True}]) + '\nnot json\n')
mine = sd.custom_examples(); assert len(mine) == 2, len(mine)
assert any('Retrieved memory:' in m['content'] for r in mine for m in r['messages']), 'memory notes become the real memory block'
built = sd.build(); assert built.get('custom') == 2 and built.get('memory', 0) > 200
assert sum('We deploy on Thursdays.' in json.dumps(x) for x in built['train']) >= 3, 'your examples are repeated so a few are enough'
assert not any('zq9uniqx' in json.dumps(x) for k in ('train', 'valid', 'test') for x in built[k]), 'secrets never reach training'
print('PASS memory skills: computed answers, real memory format, gate questions held out, your own examples merged, secrets refused')
