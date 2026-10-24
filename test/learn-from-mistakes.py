"""The next try practises where the last try went wrong: failed pack checks pick the most similar training rows, never the check prompt itself."""
import importlib.util, json, os, pathlib, tempfile
root = pathlib.Path(__file__).resolve().parents[1]
tmp = pathlib.Path(tempfile.mkdtemp()); os.environ['TULAI_CUSTOM_DIR'] = str(tmp / 'custom'); os.environ['TULAI_FREE_DIR'] = str(tmp / 'free')
s = importlib.util.spec_from_file_location('sd', root / 'scripts/skill-data.py'); sd = importlib.util.module_from_spec(s); s.loader.exec_module(sd)
cat = [{'id': 'coding-ai', 'name': 'Coding AI', 'checks': [{'prompt': 'Write a Python function `merge_intervals(intervals)` that merges overlapping intervals.'}, {'prompt': 'Write a Python function `is_prime(n)`.'}]}]
gate = tmp / 'runs' / 'pilot-x' / 'deployment'; gate.mkdir(parents=True)
(gate / 'gguf-gate.json').write_text(json.dumps({'score': 1, 'cases': [
    {'group': 'pack', 'name': 'Coding AI: ' + cat[0]['checks'][0]['prompt'][:52], 'passed': False},
    {'group': 'pack', 'name': 'Coding AI: ' + cat[0]['checks'][1]['prompt'][:52], 'passed': True}]}))
assert sd.failed_checks(['pilot-x'], cat) == [('coding-ai', cat[0]['checks'][0]['prompt'])], 'only the failed check is a mistake'
check = cat[0]['checks'][0]['prompt']
train = [['Write a Python function `merge_ranges(ranges)` that merges overlapping ranges of numbers.', 'def merge_ranges...'],
         [check, 'leaked'], ['What is the capital of France?', 'Paris'],
         {'messages': [{'role': 'user', 'content': 'Merge overlapping intervals in Python: write a function.'}, {'role': 'assistant', 'content': 'def f...'}]}]
os.environ['TULAI_MISTAKES_RUNS'] = 'pilot-x'
got = sd.mistake_rows(train, cat, {' '.join(check.lower().split())})
assert train[0] in got and train[3] in got, 'similar practice is picked (both row shapes)'
assert train[1] not in got, 'the failed check prompt itself is never trained on'
assert train[2] not in got, 'unrelated rows are not boosted'
os.environ['TULAI_MISTAKES_RUNS'] = ''; os.environ.pop('TULAI_RESUME_RUN', None)
assert sd.mistake_rows(train, cat, set()) == [], 'no previous try: nothing extra'
print('learn-from-mistakes: ok')
