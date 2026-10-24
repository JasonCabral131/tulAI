"""Executable coding evaluation: held-out OpenCodeInstruct tasks (never trained on), the model writes the code, the task's own unit tests run it.

  python coding-eval.py <port> <tasks.jsonl> <out.json> [label]

A task passes only if every one of its asserts passes (each run in a fresh `python3 -I` process in an empty temp folder, 10 s limit).
Reports pass@1 (whole task) and the share of individual asserts that pass. Nothing here trains anything.
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.request

FENCE = re.compile(r'```(?:python|py)?\n(.*?)```', re.S)
SYSTEM = 'You are a careful software engineer. Answer with one complete ```python code block that implements exactly what is asked, then nothing else.'


def ask(port, prompt, max_tokens=900):
    body = json.dumps({'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': prompt}], 'max_tokens': max_tokens, 'temperature': 0}).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{port}/v1/chat/completions', body, {'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r: return json.load(r)['choices'][0]['message']['content']


def code_of(answer):
    blocks = FENCE.findall(answer or '')
    return max(blocks, key=len) if blocks else ''


def run_tests(code, tests):
    passed = 0
    with tempfile.TemporaryDirectory() as d:
        for i, t in enumerate(tests):
            src = os.path.join(d, f't{i}.py'); open(src, 'w').write(code + '\n\n' + t + '\n')
            try:
                r = subprocess.run([sys.executable, '-I', src], cwd=d, capture_output=True, timeout=10, env={'PATH': '/usr/bin:/bin'})
                passed += r.returncode == 0
            except subprocess.TimeoutExpired: pass
    return passed


def main():
    port, tasks_file, out = sys.argv[1], sys.argv[2], sys.argv[3]; label = sys.argv[4] if len(sys.argv) > 4 else ''
    tasks = [json.loads(l) for l in open(tasks_file)]; res = []; t0 = time.time()
    for t in tasks:
        try: ans = ask(port, t['prompt'])
        except Exception as e: ans = ''; err = str(e)
        code = code_of(ans); p = run_tests(code, t['tests']) if code else 0
        res.append({'id': t['id'], 'asserts': len(t['tests']), 'passed': p, 'task_passed': bool(code) and p == len(t['tests']), 'had_code': bool(code)})
    n = len(res); summary = {'label': label, 'tasks': n, 'pass_at_1': round(sum(r['task_passed'] for r in res) / max(1, n) * 100, 1), 'assert_pass_rate': round(sum(r['passed'] for r in res) / max(1, sum(r['asserts'] for r in res)) * 100, 1),
                             'no_code': sum(not r['had_code'] for r in res), 'seconds': round(time.time() - t0), 'results': res}
    json.dump(summary, open(out, 'w'), indent=1); print(json.dumps({k: v for k, v in summary.items() if k != 'results'}))


if __name__ == '__main__': main()
