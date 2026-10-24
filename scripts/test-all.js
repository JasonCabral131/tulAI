// One command for every check: the main suite, each stand-alone test in test/, and the Python training tests.
// The heavy model-switch test (a real llama-server) is separate: npm run test:activation
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const root = path.join(__dirname, '..'), dir = path.join(root, 'test'), results = [];
const os = require('os');
// every test file gets its own empty data folder, so no test can ever read or change your real settings, chats or memory
const run = (label, cmd, args) => { const t0 = Date.now(), r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 600000, env: { ...process.env, GC_DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-test-data-')) } }); const out = (r.stdout + r.stderr).trim().split('\n'); const ok = r.status === 0; results.push({ label, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (${((Date.now() - t0) / 1000).toFixed(1)}s)${ok ? '' : '\n      ' + out.slice(-6).join('\n      ')}`); };
run('test/run.js (main suite)', process.execPath, [path.join(dir, 'run.js')]);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'run.js').sort()) run('test/' + f, process.execPath, [path.join(dir, f)]);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.py')).sort()) run('test/' + f, 'python3', [path.join(dir, f)]);
const bad = results.filter((r) => !r.ok); console.log(`\n${results.length - bad.length} of ${results.length} test files passed${bad.length ? '. Failed: ' + bad.map((b) => b.label).join(', ') : '.'}`); process.exit(bad.length ? 1 : 0);
