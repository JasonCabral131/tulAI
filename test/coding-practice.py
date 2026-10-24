"""Every Coding AI practice answer is right: renames change only the name, fixes pass their failing test, solutions pass their asserts, and no practice
task is one of the Coding AI checks."""
import importlib.util, pathlib, random, re, json
root = pathlib.Path(__file__).resolve().parents[1]
sp = importlib.util.spec_from_file_location('cp', root / 'scripts/coding-practice.py'); cp = importlib.util.module_from_spec(sp); sp.loader.exec_module(cp)
for test, err, bad, ins, good in cp.FIXES:
    g = {}; exec(good, g); exec(test, g)
    b = {}; exec(bad, b)
    try: exec(test, b); raise SystemExit('the buggy version must fail: ' + test)
    except AssertionError: pass
for name, task, sol, asserts in cp.IMPL:
    g = {}; exec(sol, g)
    for a in asserts: assert eval(a, g), (name, a)
for sig, cover, tests, good, bugs in cp.TESTS:  # written tests: top level, pass on the correct code, and catch every buggy version
    assert tests.startswith('def test_') and '\n    def test_' not in tests, sig
    g = {}; exec(good, g); exec(tests, g); names_t = [k for k in g if k.startswith('test_')]; [g[k]() for k in names_t]
    for bug in bugs:
        b = {}; exec(bug, b); exec(tests, b); failed = False
        for k in names_t:
            try: b[k]()
            except AssertionError: failed = True
        assert failed, ('the tests miss a bug', sig, bug)
r = random.Random(1)
for _ in range(60):
    q, a = cp.code_rename(r); old, new = re.search(r'Rename the function (\w+) to (\w+)', q).groups()
    assert old not in a and a.count(new) == 3 and a.count('```python') == 2, a
    for blk in re.findall(r'```python\n(.*?)```', a, re.S): compile(blk, 'x', 'exec')
for code, bug, fix in cp.REVIEW: compile(code, 'x', 'exec'); assert len(bug.split('. ')) <= 2
checks = ' '.join(c['prompt'] for p in json.loads((root / 'training-config/skill-packs.json').read_text())['packs'] if p['id'] == 'coding-ai' for c in p['checks'])
names = [x[0] for x in cp.RENAMES] + [x[1] for x in cp.RENAMES] + [x[0] for x in cp.IMPL] + [re.search(r'def (\w+)', f[2]).group(1) for f in cp.FIXES] + [re.search(r'def (\w+)', t[0]).group(1) for t in cp.TESTS]
assert not [n for n in names if n in checks], [n for n in names if n in checks]
print(f'PASS coding practice: {len(cp.FIXES)} fixes pass their tests (and the bugs fail them), {len(cp.IMPL)} solutions pass, renames exact, nothing from the checks')
