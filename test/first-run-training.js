// Training is opt-in and separate from application setup and builds.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'first-run-')); process.env.GC_DATA_DIR = dir;
const bt = require('../bot-training');
const base = { running: false, readyRun: null, activeRun: null, runtimeReady: true, state: {}, now: Date.now(), plugged: true, memoryLevel: 'normal' };
// 1. what the bot decides
assert.strictEqual(bt.decide(base).action, 'train', 'a fresh install trains');
assert.strictEqual(bt.decide({ ...base, running: true }).action, 'none');
assert.deepStrictEqual([bt.decide({ ...base, readyRun: 'pilot-x' }).action, bt.decide({ ...base, readyRun: 'pilot-x' }).run], ['activate', 'pilot-x'], 'a passed model from the installer is switched on first thing');
assert.strictEqual(bt.decide({ ...base, activeRun: 'pilot-y', keepTraining: false }).action, 'none', 'paused: nothing to do'); assert.strictEqual(bt.decide({ ...base, activeRun: 'pilot-y' }).action, 'improve', 'non-stop training: the next round'); assert.notStrictEqual(bt.decide({ ...base, activeRun: 'pilot-y', readyRun: 'pilot-z' }).action, 'activate', 'a newer candidate never replaces the active model by itself (only the gate in its own round does)');
assert(/runtime/.test(bt.decide({ ...base, runtimeReady: false }).why), 'no runtime: say how to install it');
assert(/plugged/.test(bt.decide({ ...base, plugged: false }).why) && /memory/.test(bt.decide({ ...base, memoryLevel: 'critical' }).why), 'never trains on battery or with no free memory');
assert.strictEqual(bt.decide({ ...base, state: { attempts: 2 } }).action, 'none', 'no endless retries');
assert.strictEqual(bt.decide({ ...base, state: { attempts: 1, lastAttempt: base.now - 3600e3 } }).action, 'none', 'one try a day');
assert.strictEqual(bt.decide({ ...base, state: { attempts: 1, lastAttempt: base.now - 25 * 3600e3 } }).action, 'train', 'a failed first try is retried the next day');
// 2. a ready run is found only when it really passed, was not rejected, and is a skills run
const runs = path.join(dir, 'training/runs'), mk = (n, ready, m) => { const r = path.join(runs, n); fs.mkdirSync(r, { recursive: true }); fs.writeFileSync(path.join(r, 'manifest.json'), JSON.stringify(m)); if (ready) fs.writeFileSync(path.join(r, 'activation-ready.json'), JSON.stringify(ready)); };
mk('pilot-1', { gatePassed: true }, { status: 'activation-ready', origin: 'Generated skill examples (answers computed by code)' }); mk('pilot-2', { gatePassed: false }, { origin: 'Generated skill examples' }); mk('pilot-3', { gatePassed: true }, { status: 'evaluated-rejected', origin: 'Generated skill examples' }); mk('pilot-4', { gatePassed: true }, { origin: 'Interaction data' });
assert.strictEqual(bt.newestReadyRun(), 'pilot-1'); assert.strictEqual(bt.newestReadyRun(['pilot-1']), null, 'a run whose switch failed is not tried again');
// 2b. pruning old runs never deletes the weights of a model that passed and is waiting to be switched on
{ const am = require('../active-model'), w = (n, ready) => { const r = path.join(runs, n, 'deployment'); fs.mkdirSync(r, { recursive: true }); fs.writeFileSync(path.join(r, 'model-q4_k_m.gguf'), 'GGUFx'); fs.writeFileSync(path.join(r, 'model-f16.gguf'), 'GGUFx'); if (ready) fs.writeFileSync(path.join(runs, n, 'activation-ready.json'), JSON.stringify({ gatePassed: true })); };
  w('pilot-keep', true); w('pilot-drop', false); am.prune(); assert(fs.existsSync(path.join(runs, 'pilot-keep/deployment/model-q4_k_m.gguf')), 'the waiting model keeps its weights'); assert(!fs.existsSync(path.join(runs, 'pilot-keep/deployment/model-f16.gguf')), 'but not the 6 GB intermediate'); assert(!fs.existsSync(path.join(runs, 'pilot-drop/deployment/model-q4_k_m.gguf')), 'a model that did not pass is dropped'); }
// 3. the recipe is one file used everywhere, and everything it needs ships
const recipe = JSON.parse(fs.readFileSync(path.join(root, 'training-config/skills-recipe.json'), 'utf8')); assert(recipe.iterations >= 300 && recipe.learningRate > 0 && /^[0-9a-f]{40}$/.test(recipe.baseRevision) && recipe.numLayers >= 8, 'recipe is complete and pins the base model');
assert(!/--iterations|--learning-rate/.test(fs.readFileSync(path.join(root, 'bot-training.js'), 'utf8').match(/spawn\(python[^\n]*skills[^\n]*/)[0]), 'the app does not carry its own copy of the numbers');
assert(/recipe/.test(fs.readFileSync(path.join(root, 'scripts/finetune.py'), 'utf8')) && /skills-recipe/.test(fs.readFileSync(path.join(root, 'scripts/finetune.py'), 'utf8')));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')), files = new Set(pkg.build.files);
for (const f of ['training-config/skills-recipe.json', 'training-config/rehearsal.json', 'training-config/nlu-examples.json', 'training-config/chat-rehearsal.json', 'training-config/nlu-gate-cases.json', 'training-config/pilot-examples.json', 'scripts/skill-data.py', 'scripts/finetune.py', 'scripts/activation-gate.py', 'scripts/prepare-activation.py', 'scripts/nlu-gate.js', 'scripts/evaluate-finetune.py']) { assert(files.has(f), f + ' must ship with the app'); assert(fs.existsSync(path.join(root, f)), f + ' exists'); }
assert(pkg.scripts['training:skills'], 'a one-line command exists');
// 4. application setup does not install the trainer or start training
const setup = fs.readFileSync(path.join(root, 'scripts/setup.js'), 'utf8'); assert(!/training-run\.js|setup-training\.js|--skip-first-training/.test(setup));
// 5. what ships is only synthetic or replayed: no personal data, no secrets, small
let total = 0; for (const f of fs.readdirSync(path.join(root, 'training-config'))) { const t = fs.readFileSync(path.join(root, 'training-config', f), 'utf8'); total += t.length; assert(!/\/Users\/[a-z]+|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]+|BEGIN .*PRIVATE KEY|(password|api[_ -]?key)\s*[:=]\s*\S{8,}/i.test(t), f + ' must hold no personal data or secrets'); }
assert(total < 3e6, 'the training examples stay small enough for git: ' + total);
fs.rmSync(dir, { recursive: true, force: true });
console.log('PASS first-run training: decision rules, ready-run selection, one shared recipe, everything ships, installer trains and can be skipped, shipped data is clean');
