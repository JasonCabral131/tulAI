// The bot improves on its own: a selected pack missing from its brain, or a weak pack from its own self-test, starts a short practice;
// no daily cap or waiting (your choice); only free memory is required, and never two trainings at once.
const assert = require('assert'), b = require('../bot-training'), now = Date.now();
const base = { running: false, activeRun: 'r1', runtimeReady: true, plugged: true, memoryLevel: 'normal', state: {}, now, improve: 'weak skills (git-mastery)' };
assert.strictEqual(b.decide(base).action, 'improve');
assert.strictEqual(b.decide({ ...base, running: true }).action, 'none');
assert.strictEqual(b.decide({ ...base, plugged: false }).action, 'improve', 'no plugged-in rule (your choice)');
assert.strictEqual(b.decide({ ...base, memoryLevel: 'critical' }).action, 'none');
assert.strictEqual(b.decide({ ...base, state: { improveRuns: [now - 1000, now - 2000, now - 3000], lastImprove: now - 1000 } }).action, 'improve', 'no daily cap, no waiting (your choice)');
assert(b.matches('improve yourself') && b.matches('train what failed') && !b.matches('what is training'));
assert(b.needsSelfTest({ action: 'none', activeRun: 'r2', training: false, testedRun: 'r1' }), 'a new brain that switched itself on tests itself');
assert(!b.needsSelfTest({ action: 'none', activeRun: 'r2', training: false, testedRun: 'r2' }), 'already tested');
assert(!b.needsSelfTest({ action: 'none', activeRun: 'r2', training: true, testedRun: 'r1' }), 'not while training');
assert(b.needsSelfTest({ action: 'improve', activeRun: 'r2', training: false, testedRun: 'r1' }), 'non-stop training: a new brain grades itself before the next round');
assert(!b.needsSelfTest({ action: 'train', activeRun: 'r2', training: false, testedRun: 'r1' }));
// non-stop training: nothing weak still means the next round (your choice), except when paused, recording a meeting or out of memory
assert.strictEqual(b.decide({ ...base, improve: '' }).action, 'improve', 'keep learning: the next round starts');
assert.strictEqual(b.decide({ ...base, improve: '', keepTraining: false }).action, 'none', 'paused with "stop training"');
assert.strictEqual(b.decide({ ...base, improve: '', recording: true }).action, 'none', 'no new round during meeting notes');
assert.strictEqual(b.decide({ ...base, improve: '', memoryLevel: 'critical' }).action, 'none');
console.log('PASS self-improve: weak or missing packs trigger practice on its own, no caps');
// once the brain in use passed every check, training stops: no non-stop rounds, no re-practice of weak spots; only a newly selected pack trains
assert.strictEqual(b.decide({ ...base, improve: '', activePassed: true }).action, 'none', 'passed every check: training stops');
assert.strictEqual(b.decide({ ...base, improve: 'my self-test found weak skills (git-mastery)', activePassed: true }).action, 'none', 'passed: no extra rounds');
assert.strictEqual(b.decide({ ...base, improve: 'a selected skill pack is not in my brain yet (x)', activePassed: true }).action, 'improve', 'a new pack still trains');
assert.strictEqual(b.decide({ ...base, improve: '', activePassed: false }).action, 'improve', 'not passed yet: keeps training');
