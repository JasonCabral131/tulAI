import importlib.util, json, pathlib
p = pathlib.Path(__file__).resolve().parents[1] / 'scripts/activation-gate.py'
s = importlib.util.spec_from_file_location('gate', p); g = importlib.util.module_from_spec(s); s.loader.exec_module(g)
exact = {pr: ex for _, pr, ex in g.CASES + g.EXTRA}; needle = dict(g.GENERAL)
def oracle(prompt, fence=False, break_json=(), break_general=()):
    if prompt in needle: return 'Wrong.' if prompt in break_general else 'The answer is ' + needle[prompt] + '.'
    a = json.dumps(exact[prompt]); a = '```json\n' + a + '\n```' if fence else a
    return '{}' if prompt in break_json else a
assert g.grade(lambda q: oracle(q, fence=True))['passed'], 'fenced exact answers pass'
assert g.grade(lambda q: oracle(q))['groups'] == {'core': {'passed': 6, 'total': 6}, 'extra': {'passed': 12, 'total': 12}, 'general': {'passed': 12, 'total': 12}}
core = [pr for _, pr, _ in g.CASES]; extra = [pr for _, pr, _ in g.EXTRA]; general = [pr for pr, _ in g.GENERAL]
assert not g.grade(lambda q: oracle(q, break_json=core[:1]))['passed'], 'one core failure blocks'
assert g.grade(lambda q: oracle(q, break_json=extra[:1]))['passed'], 'one extra miss (91.7%) is tolerated'
assert not g.grade(lambda q: oracle(q, break_json=extra[:2]))['passed'], 'two extra misses (83%) are below the 90% bar and block'
assert g.grade(lambda q: oracle(q, break_general=general[:1]))['passed'] and not g.grade(lambda q: oracle(q, break_general=general[:2]))['passed'], 'forgetting plain questions blocks'
base = g.grade(lambda q: oracle(q, break_general=general[:3]))  # a base model that itself misses three plain questions
assert not g.grade(lambda q: oracle(q, break_general=general[:3]), base)['passed'], 'the 90% bar holds even when the base model itself is below it'
wrong = lambda prompt: oracle(prompt).replace('}', ', "extra": 1}') if prompt in exact else oracle(prompt)
assert not g.grade(wrong)['passed'], 'extra keys fail'
assert g.grade(lambda q: ('Sure! ' + oracle(q)) if q in exact else oracle(q))['groups']['core']['passed'] == 0, 'prose around JSON fails'
assert 'h2o' in 'H₂O'.lower().translate(g.SUB), 'subscripts are normalised'
print('PASS activation gate: fenced exact JSON passes; wrong values, extra keys and prose fail; tolerance and never-worse-than-base rules hold')
