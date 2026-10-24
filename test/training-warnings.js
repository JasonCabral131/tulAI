// Warnings and model facts shown before a restore/switch: what each model passed, memory skills yes/no, and the warnings that matter.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-tw-')); process.env.GC_DATA_DIR = tmp;
const T = path.join(tmp, 'training'); fs.mkdirSync(path.join(T, 'runs'), { recursive: true });
const run = (name, groups, passed = true) => { const d = path.join(T, 'runs', name, 'deployment'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'gguf-gate.json'), JSON.stringify({ passed, score: 50, total: 54, groups, cases: [] })); fs.writeFileSync(path.join(T, 'runs', name, 'manifest.json'), JSON.stringify({ status: 'evaluated-passed', origin: 'Generated skill examples', iterations: 800 })); return { run: name, path: '/x', sha256: 'a', bytes: 1, gatePassed: true, createdAt: Date.now() / 1000 }; };
const old = run('pilot-20261001T000000Z-aaaaaa', { core: { passed: 6, total: 6 } }), neu = run('pilot-20261010T000000Z-bbbbbb', { core: { passed: 6, total: 6 }, memory: { passed: 10, total: 10 } });
fs.writeFileSync(path.join(T, 'active-model.json'), JSON.stringify({ current: old, previous: neu, rolledBackAt: new Date().toISOString() }));
const bt = require('../bot-training'); const m = bt.metrics();
assert(m.models.current.hasMemory === false && m.models.previous.hasMemory === true && m.models.previous.gate.score === 50, JSON.stringify(m.models));
const texts = m.warnings.map((w) => w.text).join('\n');
assert(/You restored the previous model/.test(texts) && /trained before the memory skills/.test(texts), texts);
assert(m.warnings.every((w) => ['warn', 'info'].includes(w.level) && w.text));
fs.writeFileSync(path.join(T, 'active-model.json'), JSON.stringify({ current: neu, previous: null })); const m2 = bt.metrics();
assert(m2.models.current.hasMemory && m2.models.previous === null && !m2.warnings.some((w) => /memory skills/.test(w.text)), 'no memory warning when the active model has memory skills');
fs.writeFileSync(path.join(T, 'active-model.json'), JSON.stringify({ current: null, previous: null })); assert(bt.metrics().warnings.some((w) => /base model is active/.test(w.text)));
// the panel asks before restoring, switching or training
const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'training-panel.js'), 'utf8'); for (const k of ["confirmThen('rollback')", "confirmThen('activate')", "confirmThen('start')", "confirmThen('skills')"]) assert(js.includes(k), k);
fs.rmSync(tmp, { recursive: true, force: true }); console.log('PASS training warnings: model facts, restore/memory warnings, confirm before restore, switch and train');
