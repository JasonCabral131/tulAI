// "test yourself": the bot grades itself on the independent acceptance questions, saves the result, and reports reliable vs not reliable honestly.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.GC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'self-test-'));
const T = require('../self-test');
(async () => {
  assert(/not tested myself yet/.test(T.report(T.load())));
  const r = await T.run({ nlu: { answer: async () => 'I do not know.' } }); // a brain that knows nothing: only the exact-code answers can pass
  assert.strictEqual(r.cases, require('../acceptance-packs').cases.length);
  const lead = r.packs['reporting-mastery'], meet = r.packs['meeting-skills'];
  assert.strictEqual(lead.pass, lead.total, 'lead reporting is answered by exact code');
  assert.strictEqual(meet.pass, 0, 'an empty brain never passes by luck');
  const rep = T.report(T.load()); assert(/Reliable/.test(rep) && /Not reliable yet/.test(rep) && /Meeting Notes Mastery: 0\/10/.test(rep), rep);
  const h = T.handle('test yourself', { nlu: { answer: async () => '' } }); assert(/Testing myself now/.test(h.reply));
  assert(/already testing/.test(T.handle('test yourself').reply));
  assert.strictEqual(T.handle('what is a self test about'), null);
  // a new brain that is worse than the one it replaced is switched back on its own
  const P = (a, b) => ({ qa: { pass: a, total: 10 }, charts: { pass: b, total: 11 } });
  assert.strictEqual(T.worse(P(10, 10), P(8, 10)), '', 'better total, no pack under 80%: keep');
  assert(/charts fell under 80%/.test(T.worse(P(10, 8), P(8, 10))), 'same total but a pack fell under 80%');
  assert.strictEqual(T.worse(P(9, 9), P(10, 10)), '', 'two fewer right, no pack under 80%: normal wobble, keep');
  assert(/got 15 .* got 20/.test(T.worse(P(8, 7), P(10, 10))), '3+ fewer right: worse');
  let rolled = 0; const am = { state: () => ({ current: { run: 'new' }, previous: { run: 'old' } }), rollback: async () => { rolled++; } };
  const hist = { old: { at: 1, packs: P(8, 10) }, new: { at: 2, packs: P(10, 8) } };
  const back = await T.keepOrRestore({ model: 'new', cases: 21, packs: P(10, 8) }, hist, am);
  assert.strictEqual(rolled, 1); assert.strictEqual(back.model, 'old'); assert.strictEqual(T.load().model, 'old', 'the saved score is the restored brain\'s own');
  assert(/switched back to this brain on my own/.test(T.report(T.load())));
  assert.strictEqual(await T.keepOrRestore({ model: 'new', cases: 21, packs: P(10, 10) }, { old: { at: 1, packs: P(8, 10) } }, am), null, 'a better brain stays');
  assert.strictEqual(rolled, 1);
  console.log('PASS self-test: graded on independent questions, saved, honest report; a worse new brain is switched back on its own');
})().catch((e) => { console.error(e); process.exit(1); });
