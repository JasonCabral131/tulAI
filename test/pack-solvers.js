// Every computed answer must equal the pack's own (Python-computed) answer, byte for byte, on thousands of generated prompts. Where they differ, one of the two has a bug.
const assert = require('assert'), path = require('path'), { spawnSync } = require('child_process'), S = require('../pack-solvers');
const run = spawnSync('python3', [path.join(__dirname, '..', 'scripts', 'dump-pack-samples.py'), '250'], { encoding: 'utf8', maxBuffer: 1 << 28 }); assert.strictEqual(run.status, 0, run.stderr);
const rows = run.stdout.trim().split('\n').map((l) => JSON.parse(l)), seen = {}, bad = {};
for (const r of rows) { const s = S.solve(r.prompt); if (!s) continue; seen[s.id] = (seen[s.id] || 0) + 1; if (s.answer !== r.answer) (bad[s.id] = bad[s.id] || []).push({ prompt: r.prompt.slice(0, 120), got: s.answer.slice(0, 160), want: r.answer.slice(0, 160) }); }
for (const s of S.SOLVERS) assert((seen[s.id] || 0) >= 100, `${s.id}: only ${seen[s.id] || 0} generated prompts were recognised`);
assert.deepStrictEqual(Object.keys(bad), [], JSON.stringify(Object.fromEntries(Object.entries(bad).map(([k, v]) => [k, [v.length, v[0]]])), null, 1));
assert.strictEqual(S.solve('what is the weather today'), null); assert.strictEqual(S.handle('hello'), null);
console.log('PASS pack solvers: ' + Object.entries(seen).map(([k, v]) => k + ' ' + v).join(', '));
