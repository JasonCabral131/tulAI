// Skill packs, the app side: choice is remembered, "update available" appears only when a pack's own content changed in a newer release, the version file is stable, and the auto-update decision is safe.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-sp-')); process.env.GC_DATA_DIR = tmp;
const sp = require('../skill-packs'), pv = require('../scripts/pack-versions'), bt = require('../bot-training');
assert.deepStrictEqual(sp.selectedIds(), []); assert(sp.list().length === 13 && sp.list().every((p) => p.state === 'not trained' && !p.selected && p.checks >= 4));
sp.select('jira-mastery', true); assert.deepStrictEqual(sp.selectedIds(), ['jira-mastery']); assert.throws(() => sp.select('nope', true), /Unknown/);
sp.markTrained(['jira-mastery'], 'run-1'); let j = sp.list().find((p) => p.id === 'jira-mastery'); assert(j.state === 'up to date' && j.trainedVersion === j.version, JSON.stringify(j)); assert.strictEqual(sp.pending().length, 0);
// a newer release changes only the pack whose content changed
const prev = pv.compute('1.1.0', {}); assert(Object.values(prev).every((x) => x.version === '1.1.0' && /^[0-9a-f]{64}$/.test(x.hash)));
const same = pv.compute('1.2.0', prev); assert(Object.values(same).every((x) => x.version === '1.1.0'), 'nothing changed: versions stay');
const fake = JSON.parse(JSON.stringify(prev)); fake['jira-mastery'].hash = 'changed'; const bumped = pv.compute('1.2.0', fake); assert.strictEqual(bumped['jira-mastery'].version, '1.2.0'); assert.strictEqual(bumped['git-mastery'].version, '1.1.0');
// the blocks parser finds generators and constants
const B = pv.blocks(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'pack-skills.py'), 'utf8')); assert(B.jira_jql && B.JQL_PARTS && B.git_cmd && B.GENERATORS, Object.keys(B).slice(0, 8).join());
// an app update that improves a selected, trained pack shows as an update and a warning
const vfile = path.join(tmp, 'pack-versions.json'); fs.writeFileSync(vfile, JSON.stringify({ packs: { 'jira-mastery': { hash: 'x', version: '9.9.9' } } })); process.env.TULAI_PACK_VERSIONS = vfile; try {
  j = sp.list().find((p) => p.id === 'jira-mastery'); assert(j.state === 'update available' && j.version === '9.9.9' && j.trainedVersion !== '9.9.9'); assert.strictEqual(sp.pending().length, 1); assert(/was improved \(version 9\.9\.9\)/.test(sp.warnings()[0]));
  const ok = { running: false, runtimeReady: true, state: {}, now: Date.now(), plugged: true, memoryLevel: 'normal', activeRun: 'r', readyRun: null, packUpdate: true };
  assert.strictEqual(bt.decide(ok).action, 'train-packs'); assert.strictEqual(bt.decide({ ...ok, plugged: false }).action, 'none'); assert.strictEqual(bt.decide({ ...ok, memoryLevel: 'critical' }).action, 'none'); assert.strictEqual(bt.decide({ ...ok, state: { packAttempts: 2 } }).action, 'none');
  assert.strictEqual(bt.decide({ ...ok, state: { lastPackAttempt: Date.now() - 3600e3 } }).action, 'none', 'once a day'); assert.strictEqual(bt.decide({ ...ok, runtimeReady: false }).action, 'none'); assert.strictEqual(bt.decide({ ...ok, running: true }).action, 'none');
  assert.strictEqual(bt.decide({ ...ok, packUpdate: false, keepTraining: false }).action, 'none', 'without a pack update (and with training paused) nothing starts'); assert.notStrictEqual(bt.decide({ ...ok, packUpdate: false }).action, 'activate', 'an active trained model is never swapped on its own');
  sp.setAuto(false); assert(/Press Fine-tune/.test(sp.warnings()[0])); assert.strictEqual(sp.state().auto, false);
  const m = bt.metrics(); assert(m.warnings.some((w) => /was improved/.test(w.text)), 'the panel warning shows it');
} finally { delete process.env.TULAI_PACK_VERSIONS; }
fs.rmSync(tmp, { recursive: true, force: true }); console.log('PASS skill packs (app): choice kept, versions only change with content, update shows and is auto-decided safely');
