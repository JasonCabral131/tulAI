// The bot keeps testing itself on real-life conversations: every 2 hours, never while you chat, train, record or are in a call; follow-up turns get the
// conversation so far; a turn with no answer fails; live scenarios (real sends, settings) never run on the schedule; results and history are saved.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.GC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'scen-'));
const R = require('../scenario-runner'), { scenarios } = require('../scenarios'), H = 3600000, now = Date.now();
assert(R.due({ now, lastRun: now - 3 * H, lastUser: now - 20 * 60000, macIdle: 15 * 60000 }));
assert(!R.due({ now, lastRun: now - 3 * H, lastUser: now - 20 * 60000, macIdle: 60000 }), 'not while you use the Mac (a meeting in the browser, other apps)');
assert(!R.due({ now, lastRun: now - 1 * H, lastUser: 0, macIdle: 15 * 60000 }), 'not more often than every 2 hours');
assert(!R.due({ now, lastRun: 0, lastUser: now - 60000, macIdle: 15 * 60000 }), 'not while you are chatting');
for (const k of ['training', 'inCall', 'recording']) assert(!R.due({ now, lastRun: 0, lastUser: 0, macIdle: 15 * 60000, [k]: true }), 'not while ' + k);
assert(scenarios.length >= 50 && new Set(scenarios.map((s) => s.id)).size === scenarios.length, 'many scenarios, unique ids');
(async () => {
  const seen = []; const talk = async (sid, text, hist) => { seen.push({ sid, text, n: hist.length }); return text === 'and 20%?' ? '20% of 240 is 48.' : /15%/.test(text) ? '15% of 240 is 36.' : ''; };
  const out = await R.run({ talk, only: 'math-followup' });
  assert.strictEqual(out.total, 1); assert.strictEqual(out.pass, 1); assert.deepStrictEqual(seen.map((x) => x.n), [0, 2], 'the follow-up gets the conversation so far'); assert(seen.every((x) => x.sid.startsWith('qa-')), 'test conversations only');
  const out2 = await R.run({ talk, only: 'hi' }); assert.strictEqual(out2.pass, 0, 'no answer fails');
  const all = await R.run({ talk: async () => '' }); assert(!all.rows.some((r) => scenarios.find((s) => s.id === r.id).live), 'live scenarios never run on the schedule');
  assert(/Not right yet/.test(R.report(R.load())) && /you said "hi"/.test(R.report(R.load())));
  assert.strictEqual(fs.readFileSync(path.join(process.env.GC_DATA_DIR, 'training', 'scenario-history.jsonl'), 'utf8').trim().split('\n').length, 3, 'every run is kept');
  assert(R.handle('conversation test results') && R.START.test('test conversations') && R.START.test('run your scenario tests') && !R.handle('what is a conversation'));
  // a skill question that fails in two runs in a row of the same brain: that pack gets practised next
  const hf = path.join(process.env.GC_DATA_DIR, 'training', 'scenario-history.jsonl');
  fs.writeFileSync(hf, [{ model: 'b1', weakPacks: ['charts-reporting-ai', 'jira-mastery'] }, { model: 'b1', weakPacks: ['charts-reporting-ai'] }, { model: 'b2', weakPacks: ['qa-test-ai'] }].map((x) => JSON.stringify(x)).join('\n') + '\n');
  assert.deepStrictEqual(R.weakPacks('b1'), ['charts-reporting-ai'], 'only what failed twice in a row'); assert.deepStrictEqual(R.weakPacks('b2'), [], 'once is not enough'); assert.deepStrictEqual(R.weakPacks('b3'), []);
  await meTest();
  console.log('PASS scenario runner: scheduled only when you are free, follow-ups keep context, no answer fails, live ones never automatic, history kept');
})().catch((e) => { console.error(e); process.exit(1); });
// {me} Teams scenarios: you are filled in when the test runs (this Mac's account name, never Jira), and with no name they are skipped, never sent to someone else
async function meTest() {
  const R = require('../scenario-runner'), said = [];
  const talk = async (sid, t) => { said.push(t); return /\{me\}/.test(t) ? 'Sent to **nobody**' : t.startsWith('send message to') || t.startsWith('in teams chat') || t.startsWith('chat mo si') ? 'Sent to **Test Person** in Teams' : 'ok'; };
  const out = await R.run({ talk, live: true, only: 'teams', me: 'Test Person' });
  require('assert')(out.rows.length >= 3 && out.rows.every((r) => r.pass), JSON.stringify(out.rows));
  require('assert')(said.every((t) => !t.includes('{me}')) && said.some((t) => t.includes('Test Person')), said.join(' | '));
  said.length = 0; const none = await R.run({ talk, live: true, only: 'teams', me: '' });
  require('assert')(none.rows.every((r) => !r.pass && /skipped/.test(r.error)) && said.length === 0, 'no name: nothing is sent');
  console.log('PASS scenario {me}: Teams tests message only you, found from this Mac account, never from Jira');
}
