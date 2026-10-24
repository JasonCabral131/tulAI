"""Coding AI data filters on small hand-made records: failing unit tests, low judge scores, broken code, secrets, duplicates, check topics and the SWE-bench
test split are all kept out; SWE-bench rows are issue -> patch; held-out evaluation tasks never reach training."""
import importlib.util, json, pathlib
spec = importlib.util.spec_from_file_location('cd', pathlib.Path(__file__).resolve().parents[1] / 'scripts/coding-data.py'); cd = importlib.util.module_from_spec(spec); spec.loader.exec_module(cd)
good = '```python\ndef f(x):\n    return x + 1\n```'
judge = json.dumps({'a': {'score': 5}, 'b': {'score': 4}})
OCI = [{'id': f'ok{i}', 'input': f'Write a function number {i} that adds one to x and returns it.', 'output': good, 'average_test_score': 1.0, 'llm_judgement': judge, 'unit_tests': '["assert f(1) == 2"]'} for i in range(200)]
OCI += [{'id': 'fail', 'input': 'Write a function that fails its tests please.', 'output': good, 'average_test_score': 0.9, 'llm_judgement': judge, 'unit_tests': '[]'},
        {'id': 'judge', 'input': 'Write a function with a low judge score please.', 'output': good, 'average_test_score': 1.0, 'llm_judgement': json.dumps({'a': {'score': 3}}), 'unit_tests': '[]'},
        {'id': 'broken', 'input': 'Write a function whose code is broken please.', 'output': '```python\ndef f(:\n```', 'average_test_score': 1.0, 'llm_judgement': judge, 'unit_tests': '[]'},
        {'id': 'secret', 'input': 'Write a function that uses this key AKIAABCDEFGHIJKLMNOP please.', 'output': good, 'average_test_score': 1.0, 'llm_judgement': judge, 'unit_tests': '[]'},
        {'id': 'topic', 'input': 'Write is_palindrome(s) that checks a palindrome string.', 'output': good, 'average_test_score': 1.0, 'llm_judgement': judge, 'unit_tests': '[]'}]
SWE = [{'repo': 'o/r', 'instance_id': 'o__r-1', 'problem_statement': 'Calling foo() with None crashes with a TypeError in the parser module.', 'patch': 'diff --git a/x.py b/x.py\n--- a/x.py\n+++ b/x.py\n@@ -1 +1 @@\n-a\n+b\n'}]
EVOL = [{'instruction': 'Write a function number 3 that adds one to x and returns it.', 'response': good}, {'instruction': 'Refactor this loop into a comprehension please.', 'response': good}]
cd.catalog = lambda: {s: {'id': s, 'maxRows': 1000, 'files': [], 'name': s, 'license': 'x', 'licenseNote': 'x', 'source': 'x', 'commit': 'x'} for s in cd.ORDER}
cd.files_of = lambda d: [pathlib.Path(d['id'])] if d['id'] in ('opencodeinstruct', 'magicoder-evol', 'swe-bench') else None
cd.read_parquet = lambda p: OCI if p.name == 'opencodeinstruct' else SWE
cd.jsonl = lambda p: iter(EVOL)
pool, stats = cd.collect()
oci = stats['opencodeinstruct']
assert oci['unit tests not all passing'] == 1 and oci['judge score under 4'] == 1 and oci['code does not parse'] == 1 and oci['secret found'] == 1 and oci['same task as a check (excluded)'] == 1, oci
held = oci.get('held out for evaluation', 0); assert held >= 1 and oci['kept'] + held == 200, oci
assert stats['magicoder-evol']['duplicate'] == 1 or any(cd.heldout(f'ok{3}') for _ in [0]), stats['magicoder-evol']  # the evol copy of task 3 is a duplicate (unless task 3 was held out)
assert all(not cd.heldout(r[0]) for r in pool['opencodeinstruct']), 'held-out tasks never reach training'
q, a = pool['swe-bench'][0][1], pool['swe-bench'][0][2]; assert q.startswith('Repository: o/r') and a.startswith('```diff') and 'diff --git' in a
rows = cd.rows(1); assert len(rows) == sum(s['kept'] for s in stats.values() if 'kept' in s)
assert stats['codealpaca']['status'] == 'not downloaded' and pool['codealpaca'] == []
print('PASS coding data: failing tests, low scores, broken code, secrets, duplicates and check topics are filtered; held-out tasks never train; SWE-bench issue -> patch')
