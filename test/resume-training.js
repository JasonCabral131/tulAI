// The next training continues from the brain in use (its adapter), so it keeps what it knows; packs it does not have yet get extra steps.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-')); process.env.GC_DATA_DIR = d; const T = path.join(d, 'training'), run = 'pilot-20261012T000000Z-abc';
fs.mkdirSync(path.join(T, 'runs', run, 'adapter'), { recursive: true }); fs.writeFileSync(path.join(T, 'runs', run, 'adapter', 'adapters.safetensors'), 'x');
fs.writeFileSync(path.join(T, 'runs', run, 'manifest.json'), JSON.stringify({ packs: ['jira-mastery', 'qa-test-ai'] }));
fs.writeFileSync(path.join(T, 'active-model.json'), JSON.stringify({ current: { run } }));
const B = require('../bot-training');
let e = B.resumeEnv(['jira-mastery', 'qa-test-ai']); assert.strictEqual(e.TULAI_RESUME_ADAPTER, path.join(T, 'runs', run, 'adapter')); assert.strictEqual(e.TULAI_ITERATIONS, '600', 'only a short practice when nothing is new');
e = B.resumeEnv(['jira-mastery', 'qa-test-ai', 'coding-ai']); assert.strictEqual(e.TULAI_ITERATIONS, '1200', 'a new pack gets extra steps'); assert.strictEqual(e.TULAI_NEW_PACKS, 'coding-ai', 'and its examples are practised more often');
// self-test: a weak pack of the brain in use and a pack that slipped in a newer brain that was switched back both get the extra practice
fs.writeFileSync(path.join(T, 'self-test-history.json'), JSON.stringify({ [run]: { at: 1, packs: { 'qa-test-ai': { pass: 8, total: 10 }, 'jira-mastery': { pass: 10, total: 11 } } },
  'pilot-later': { at: 2, rejected: 'worse', packs: { 'qa-test-ai': { pass: 10, total: 10 }, 'jira-mastery': { pass: 9, total: 11 } } } }));
e = B.resumeEnv(['jira-mastery', 'qa-test-ai']); assert.deepStrictEqual(e.TULAI_NEW_PACKS.split(',').sort(), ['jira-mastery', 'qa-test-ai']); assert.strictEqual(e.TULAI_ITERATIONS, '600');
fs.writeFileSync(path.join(T, 'runs', run, 'manifest.json'), JSON.stringify({ packs: [] }));
e = B.resumeEnv(['jira-mastery']); assert(!e.TULAI_RESUME_ADAPTER && e.TULAI_ITERATIONS === '1050', 'a brain without packs: start from the base model');
console.log('PASS resume: continues from the current brain, short practice, extra steps only for new packs');
