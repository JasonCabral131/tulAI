// Runs the code a model wrote against hidden tests (coding checks): python3 -I in an empty temp folder, 10 s per test, no network variables.
// mode "impl": the answer's code + each test must pass. mode "tests": the answer is tests; they must pass on the correct code and fail on the buggy one.
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
const code = (answer) => { const t = String(answer || ''), b = [...t.matchAll(/```(?:python|py)?[ \t]*\n([\s\S]*?)```/g)].map((m) => m[1]); if (b.length) return b.sort((a, c) => c.length - a.length)[0]; return /^\s*(?:def |class |import |from \w+ import )/m.test(t) && !/```/.test(t) ? t : ''; }; // unfenced code (the whole answer is code) is run as is
function run(src) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-code-')); const f = path.join(d, 'main.py'); fs.writeFileSync(f, src);
  try { const r = spawnSync('python3', ['-I', f], { cwd: d, timeout: 10000, env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8' }); return r.status === 0 ? '' : ((r.stderr || '').trim().split('\n').pop() || 'failed').slice(0, 160); }
  finally { fs.rmSync(d, { recursive: true, force: true }); }
}
const RUNNER = '\nimport sys\n_fails = 0\n_tests = [v for k, v in list(globals().items()) if k.startswith("test_") and callable(v)]\nfor _t in _tests:\n    try: _t()\n    except Exception: _fails += 1\nsys.exit(1 if (_fails or not _tests) else 0)\n';
/** '' when the answer passes, otherwise the reason. */
function check(answer, spec) {
  const c = code(answer); if (!c) return 'no python code block';
  if (spec.mode === 'tests') {
    const good = run(spec.correct + '\n' + c + RUNNER); if (good) return 'its tests fail on correct code: ' + good;
    for (const b of spec.buggy || []) if (!run(b + '\n' + c + RUNNER)) return 'its tests do not catch the bug';
    return '';
  }
  for (const t of spec.tests || []) { const why = run(c + '\n\n' + t + '\n'); if (why) return 'test failed: ' + t.slice(0, 70) + ' -> ' + why; }
  return '';
}
module.exports = { check, code, run };
