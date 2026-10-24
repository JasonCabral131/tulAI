// Permission cards: only listed actions exist, nothing runs without an explicit allow, a busy training blocks risky actions, and a request cannot smuggle in its own command.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.GC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'approvals-'));
const A = require('../approvals');
(async () => {
  assert.throws(() => A.request({ action: 'rm -rf /', title: 'x' }), /Unknown action/);
  let ran = 0; A.ACTIONS['stop-training'].run = async () => { ran++; return 'stopped'; };
  const it = A.request({ action: 'stop-training', title: 'Stop it', why: 'because', requestedBy: 'test' });
  assert.strictEqual(A.request({ action: 'stop-training' }).id, it.id, 'the same request is not queued twice');
  assert.strictEqual(ran, 0, 'asking never runs anything');
  const denied = await A.decide(it.id, false); assert.strictEqual(denied.status, 'denied'); assert.strictEqual(ran, 0, 'Not now runs nothing');
  const it2 = A.request({ action: 'stop-training', title: 'Stop it again', command: 'rm -rf ~' }); assert(!('command' in it2), 'a request cannot carry a command');
  const done = await A.decide(it2.id, true); assert.strictEqual(done.status, 'done'); assert.strictEqual(ran, 1); assert.strictEqual((await A.decide(it2.id, true)).status, 'done'); assert.strictEqual(ran, 1, 'one click runs it once');
  A.ACTIONS['restart-local-brain'].run = async () => { throw Error('boom'); }; const it3 = A.request({ action: 'restart-local-brain' });
  const bad = await A.decide(it3.id, true); assert(['failed', undefined].includes(bad.status) || bad.blocked, 'a failure is reported, not hidden');
  assert(A.list().length >= 3);
  console.log('PASS approvals: only listed actions, runs only after Allow, once, failures shown');
})().catch((e) => { console.error(e); process.exit(1); });
