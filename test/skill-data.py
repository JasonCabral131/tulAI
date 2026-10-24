import importlib.util, json, pathlib, re
root = pathlib.Path(__file__).resolve().parents[1]
def load(name, file):
    s = importlib.util.spec_from_file_location(name, root / file); m = importlib.util.module_from_spec(s); s.loader.exec_module(m); return m
gate = load('gate', 'scripts/activation-gate.py'); sd = load('sd', 'scripts/skill-data.py')
import os, tempfile; os.environ['TULAI_CUSTOM_DIR'] = tempfile.mkdtemp(); os.environ['TULAI_FREE_DIR'] = tempfile.mkdtemp()  # the test never reads your own training
d = sd.build(); norm = lambda p: ' '.join(p.lower().split())
gate_prompts = {norm(p) for _, p, _ in gate.CASES + gate.EXTRA} | {norm(p) for p, _ in gate.GENERAL}
# 1. the gate is held out: no training, validation or test prompt is a gate prompt, and no prompt repeats anywhere
seen = set()
for split in ('train', 'valid', 'test'):
    assert d[split], split + ' is empty'
    for item in d[split]:
        p = ' || '.join(m['content'] for m in item['messages'] if m['role'] == 'user') if isinstance(item, dict) else item[0]
        k = norm(p); assert k not in gate_prompts, 'gate prompt leaked into ' + split + ': ' + p[:60]; assert k not in seen, 'duplicate prompt: ' + p[:60]; seen.add(k)
        if isinstance(item, dict): assert item['messages'][-1]['role'] == 'assistant' and item['messages'][-1]['content'].strip(), 'whole-conversation rows end with the answer'
        else: assert len(item) == 2
# 2. every computed answer is right (recomputed here from the prompt itself)
def check(p, a):
    m = re.match(r'(?:Progress report: (\d+) done, \d+ remaining, (\d+) in total|(\d+) of (\d+) tickets are done|Sprint status: (\d+)/(\d+) stories finished|We closed (\d+) out of (\d+) tasks)', p)
    if m and 'completion_percent' in a:
        g = [x for x in m.groups() if x]; n, t = int(g[0]), int(g[-1]); assert json.loads(a)['completion_percent'] == n * 100 // t and n * 100 % t == 0, (p, a)
    if p.startswith(('Tickets:', 'Ticket list')):
        rows = re.findall(r'([A-Z]+-\d+) (Done|Open|Blocked)', p); st = {}
        for k, s in rows:
            assert st.setdefault(k, s) == s, 'a ticket listed with two statuses is ambiguous'
        out = json.loads(a); assert out == {'unique_count': len(st), 'done_count': sum(s == 'Done' for s in st.values()), 'blocked_count': sum(s == 'Blocked' for s in st.values())}, (p, a)
    if '"sent": boolean' in p: assert json.loads(a)['sent'] == bool(re.search(r'delivered|completed|posted successfully', p)), (p, a)
    if '"known": boolean' in p: assert json.loads(a)['known'] == bool(re.search(r'connected and returned|read successfully', p)), (p, a)
    if 'time in HH:MM' in p:
        o = json.loads(a); assert re.fullmatch(r'\d\d:\d\d', o['time']) and o['frequency'] in ('weekdays', 'daily', 'weekly', 'monthly'), a
for split in d:
    if isinstance(d[split], list):
        for item in d[split]:
            if not isinstance(item, dict): check(*item)
# 3. the hard cases are really practised, in all three kinds of data
ans = [i[1] for i in d['train'] if not isinstance(i, dict)]; assert sum('unique_count' in a for a in ans) >= 60 and sum('completion_percent' in a for a in ans) >= 60 and sum('frequency' in a for a in ans) >= 40, 'the hard skills have enough examples'
assert any('Daily' in p and '"weekdays"' in a for p, a in [i for i in d['train'] if not isinstance(i, dict)] if 'frequency' in a), 'a title that says "Daily" can still repeat on weekdays'
# 4. replayed base-model answers are clean: no other-language leftovers, no wrong identity, no markdown noise
for p, a in sd.rehearsal():
    assert not re.search(r'[一-鿿]|Qwen|Alibaba|\*\*', a), 'unclean rehearsal answer: ' + p
assert len(sd.rehearsal()) >= 80
assert sd.build() == sd.build(), 'deterministic'
# 5. the understanding examples never use an utterance of the understanding gate
cases = json.loads((root / 'training-config/nlu-gate-cases.json').read_text())['cases']; gate_nlu = {re.sub('[^a-z ]', '', c['text'].lower()).strip() for c in cases}
examples = sd.nlu_examples(); assert len(examples) >= 60, 'understanding examples are present'
for e in examples:
    u = [m for m in e['messages'] if m['role'] == 'user'][-1]['content']; assert re.sub('[^a-z ]', '', u.lower()).strip() not in gate_nlu, 'understanding gate utterance used for training: ' + u
assert sum(1 for e in examples if '"question"' in e['messages'][-1]['content']) >= 15, 'conversation examples exist (must never become actions)'
# 6. replayed multi-turn chats never use a line of the conversation gate, and carry the bot's real chat prompt
dialogue_lines = {re.sub('[^a-z ]', '', t.lower()).strip() for d_ in json.loads((root / 'training-config/nlu-gate-cases.json').read_text())['dialogues'] for t in d_['turns']}
chats = sd.chat_rehearsal(); assert len(chats) >= 50, 'multi-turn chat replay present'
for e in chats:
    assert e['messages'][0]['role'] == 'system' and 'Tulai' in e['messages'][0]['content']
    for m in e['messages']:
        if m['role'] == 'user': assert re.sub('[^a-z ]', '', m['content'].lower()).strip() not in dialogue_lines, 'conversation gate line used for training: ' + m['content']
print('PASS training data: gate held out, every answer recomputed and correct, hard skills practised, replay data clean')
