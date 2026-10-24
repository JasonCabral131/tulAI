"""Writes samples of every skill-pack generator as JSON lines {gen, prompt, answer} to stdout (used by test/pack-crosscheck.js, which recomputes the answers independently in JavaScript)."""
import importlib.util, json, os, pathlib, random, sys, tempfile
os.environ.setdefault('TULAI_FREE_DIR', tempfile.mkdtemp())
sp = importlib.util.spec_from_file_location('ps', pathlib.Path(__file__).with_name('pack-skills.py')); ps = importlib.util.module_from_spec(sp); sp.loader.exec_module(ps)
n = int(sys.argv[1]) if len(sys.argv) > 1 else 120; r = random.Random(20261011)
for name, fn in ps.GENERATORS.items():
    for _ in range(n):
        q, a = (fn(r, None) if name in ('jira_velocity', 'review_classify', 'review_format', 'qa_review_class', 'chart_type_real', 'gl_webarena') else fn(r))
        print(json.dumps({'gen': name, 'prompt': q, 'answer': a}, ensure_ascii=False))
