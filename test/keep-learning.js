// Training keeps learning: a failed try is not thrown away. Within a round the next try continues from the best try so far and practises the packs it
// missed; a new round continues from a newer try that passed MORE checks than the brain in use. Only the full quality check switches anything on.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keep-')); process.env.GC_DATA_DIR = d; const R = path.join(d, 'training', 'runs');
const mk = (n, score, cases, packs = ['jira-mastery', 'coding-ai']) => { fs.mkdirSync(path.join(R, n, 'adapter'), { recursive: true }); fs.mkdirSync(path.join(R, n, 'deployment'), { recursive: true }); fs.writeFileSync(path.join(R, n, 'adapter', 'adapters.safetensors'), 'x'); fs.writeFileSync(path.join(R, n, 'manifest.json'), JSON.stringify({ packs })); if (score !== null) fs.writeFileSync(path.join(R, n, 'deployment', 'gguf-gate.json'), JSON.stringify({ score, cases })); };
const pk = (name, ok, n = 10) => Array.from({ length: n }, (_, i) => ({ group: 'pack', name: name + ': q' + i, passed: i < ok }));
mk('pilot-20261013T075537Z-cur', 185, [...pk('Jira Mastery', 10), ...pk('Coding AI', 9)]);
mk('pilot-20261013T110419Z-s0', 187, [...pk('Jira Mastery', 10), ...pk('Coding AI', 7)]);
mk('pilot-20261013T120000Z-s7', 181, [...pk('Jira Mastery', 9), ...pk('Coding AI', 5)]);
mk('pilot-20261013T050000Z-old', 190, pk('Coding AI', 7));
fs.writeFileSync(path.join(d, 'training', 'active-model.json'), JSON.stringify({ current: { run: 'pilot-20261013T075537Z-cur' } }));
const B = require('../bot-training'); const bc = B.bestCandidate('pilot-20261013T075537Z-cur', ['jira-mastery', 'coding-ai']);
assert.strictEqual(bc.run, 'pilot-20261013T110419Z-s0', 'safety rail: seed 7 fell 6 checks below seed 0, so the next round continues from seed 0'); assert.deepStrictEqual(bc.failed, ['coding-ai'], 'and it practises what it missed');
fs.writeFileSync(path.join(R, 'pilot-20261013T120000Z-s7', 'deployment', 'gguf-gate.json'), JSON.stringify({ score: 186, cases: [...pk('Jira Mastery', 10), ...pk('Coding AI', 7)] }));
assert.strictEqual(B.bestCandidate('pilot-20261013T075537Z-cur', ['jira-mastery', 'coding-ai']).run, 'pilot-20261013T120000Z-s7', 'chain: seed 7 is within 2 checks of the best, so its learning is carried forward');
fs.writeFileSync(path.join(R, 'pilot-20261013T120000Z-s7', 'deployment', 'gguf-gate.json'), JSON.stringify({ score: 181, cases: [...pk('Jira Mastery', 9), ...pk('Coding AI', 5)] }));
assert.strictEqual(B.bestCandidate('pilot-20261013T075537Z-cur', ['jira-mastery', 'coding-ai', 'qa-test-ai']), null, 'a try that did not learn every pack is not continued');
const e = B.resumeEnv(['jira-mastery', 'coding-ai']); assert(e.TULAI_RESUME_ADAPTER.endsWith(path.join('pilot-20261013T110419Z-s0', 'adapter')) && e.TULAI_NEW_PACKS === 'coding-ai');
fs.writeFileSync(path.join(R, 'pilot-20261013T110419Z-s0', 'deployment', 'gguf-gate.json'), JSON.stringify({ score: 180, cases: [] })); fs.writeFileSync(path.join(R, 'pilot-20261013T120000Z-s7', 'deployment', 'gguf-gate.json'), JSON.stringify({ score: 180, cases: [] }));
fs.rmSync(path.join(R, 'pilot-20261013T110419Z-s0'), { recursive: true }); fs.rmSync(path.join(R, 'pilot-20261013T120000Z-s7'), { recursive: true }); assert.strictEqual(B.bestCandidate('pilot-20261013T075537Z-cur', ['jira-mastery', 'coding-ai']), null, 'no newer try: continue from the brain in use');
// within a round (finetune.py): the best try so far and the packs under their bar
const py = execFileSync('python3', ['-c', `import importlib.util as u,pathlib,json,sys;sys.argv=['x'];sp=u.spec_from_file_location('ft','scripts/finetune.py');ft=u.module_from_spec(sp);sp.loader.exec_module(ft)
print(json.dumps(ft.gate_result(pathlib.Path(${JSON.stringify(path.join(R, 'pilot-20261013T050000Z-old'))}))))`], { cwd: path.join(__dirname, '..') }).toString();
assert.deepStrictEqual(JSON.parse(py), [190, ['coding-ai']]);
const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'finetune.py'), 'utf8'); assert(/os\.environ\['TULAI_RESUME_ADAPTER'\]=str\(best\[1\]\/'adapter'\)/.test(src) && /for p in sorted\(made\)/.test(src) && /best=\(sc,p,failed\) if sc>=top\[0\]-2 else top/.test(src), 'within a round: chain from the previous try, best try when it fell more than 2 checks');
console.log('PASS keep learning: a chain — each try continues from the previous one (seed 0 -> 7 -> 21 -> 42, and round to round), practising what it missed; only the full check switches a brain on');
