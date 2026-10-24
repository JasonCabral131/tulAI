// Saved meeting notes: by day, the latest with real speech (noise-only recordings skipped), and by topic ("meeting notes on X"), extracted from the
// transcripts and summarized by Tulai's own brain. Read only: never starts or stops a recording.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-meetings-')), H = require('../human-rules'), real = require('../meeting');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const y = new Date(); y.setDate(y.getDate() - 1); const k = ymd(y);
const tr = (lines) => '\n## Transcript\n' + lines.map(([t, who, text]) => `**${t}:00 ${who}: **${text}`).join('\n\n') + '\n';
fs.writeFileSync(path.join(dir, `${k} 09.30 Meeting.md`), "# Meeting\n\n- Length: 30 minutes\n- Summary written by Tulai's own AI on this Mac\n\n## Key points\n- Okay.\n- - The release moves to Friday.\n- Thank you so much.\n\n## Action items\n- Ana: update the test plan\n"
  + tr([['09:31', 'Others', 'The release moves to Friday because QA needs two more days'], ['09:32', 'You', 'We will use Spira for the test cases from now on'], ['09:33', 'Others', 'Ana will update the test plan in Spira today']]));
fs.writeFileSync(path.join(dir, `${k} 14.00 Meeting.md`), '# Meeting\n\n- Length: in progress\n\n## Transcript\n');
fs.writeFileSync(path.join(dir, `${k} 15.00 Meeting.md`), '# Meeting\n\n- Length: 20 minutes\n\n## Key points\n- (not enough speech)\n'
  + tr([['15:01', 'Others', 'The budget for the portal is approved for next quarter'], ['15:02', 'You', 'Then we can hire one more tester for the portal'], ['15:03', 'Others', 'Ben will draft the job post for the tester role']]));
fs.writeFileSync(path.join(dir, `${k} 17.00 Meeting.md`), '# Meeting\n\n- Length: 3 hr 0 min\n\n## Key points\n- - I think it\'s water.\n' + tr([['17:01', 'You', '*crash*'], ['17:02', 'You', '- Thank you.'], ['17:03', 'You', "- I think it's water."]]));
const files = (n = 20) => fs.readdirSync(dir).sort().reverse().slice(0, n).map((f) => ({ name: f, file: path.join(dir, f) }));
const calls = [], asked = [];
const mt = { state: () => ({ recording: true, since: Date.now() }), stop: () => { calls.push('stop'); return { reply: 'stopped' }; }, start: () => calls.push('start'), list: files, readFile: real.readFile,
  byDay: (d) => files(300).reverse().filter((f) => f.name.startsWith(ymd(d))).map(real.readFile) };
const nlu = { chat: async ({ messages }) => { const u = messages[messages.length - 1].content; asked.push(u);
  return { content: /Spira/.test(u) ? 'Key points:\n- The team will use Spira for test cases.\nAction items:\n- Ana: update the test plan in Spira\n- Ana: update the test plan in Spira\nDecisions:\n- None' : 'Key points:\n- The portal budget is approved for next quarter.\nAction items:\n- Ben: draft the tester job post\nDecisions:\n- Hire one more tester' }; } };
(async () => {
  for (const q of ['hey tulai what are the meeting notes yesterday?', 'meeting notes kahapon', 'what was discussed in the meeting yesterday']) {
    const r = await H.meeting(q, mt, nlu); assert(r && /4 meetings/.test(r.reply), q + ' -> ' + (r && r.reply));
    assert(/The release moves to Friday/.test(r.reply) && !/- - /.test(r.reply), 'saved key points, no double dash');
    assert(!/Okay\.|Thank you so much|it's water/.test(r.reply), 'filler and noise are left out'); assert(/Ana: update the test plan/.test(r.reply), 'action items');
    assert(/cut off before anything/.test(r.reply), 'a cut recording is said plainly'); assert(/Only background noise/.test(r.reply), 'a noise-only recording is said plainly');
    assert(/portal budget is approved/.test(r.reply) && /Summarized just now from the transcript/.test(r.reply), 'no good notes: the transcript is summarized now');
  }
  const latest = await H.meeting('show my meeting notes', mt, nlu);
  assert(/\(2 meetings\)/.test(latest.reply) && /Not shown: 2 recordings with only background noise or cut off/.test(latest.reply) && /release moves to Friday/.test(latest.reply) && /portal budget/.test(latest.reply) && !/it's water/.test(latest.reply), 'latest = every meeting of the latest day with real speech: ' + latest.reply);
  asked.length = 0; const topic = await H.meeting('meeting notes on Spira', mt, nlu);
  assert(/Meeting notes on "Spira"\*\*: found in 1 meeting/.test(topic.reply), topic.reply);
  assert(/Spira for the test cases/.test(topic.reply) && !/budget/.test(topic.reply), 'only the parts about the topic are extracted');
  assert.strictEqual((topic.reply.match(/Ana: update the test plan in Spira/g) || []).length, 1, 'repeated action items are shown once');
  assert(asked.length === 1 && /only the parts about "Spira"/.test(asked[0]) && !/budget/i.test(asked[0]), 'the brain only sees the extracted parts');
  const nothing = await H.meeting('meeting notes about kubernetes', mt, nlu); assert(/found nothing about \*\*kubernetes\*\*/.test(nothing.reply), nothing.reply);
  assert.strictEqual(H.notesTopic('meeting notes on monday'), '', 'a day is not a topic'); assert.strictEqual(H.notesTopic('meeting notes on oct 14'), '');
  const none = await H.meeting('meeting notes on 2020-01-02', mt, nlu); assert(/no meeting notes from/i.test(none.reply) && /The latest ones I have/.test(none.reply), none.reply);
  assert.strictEqual(H.meeting('start meeting notes', mt, nlu), null, 'starting notes is not a notes question');
  assert.deepStrictEqual(calls, [], 'asking for notes never stops or starts a recording, even while one is running');
  assert.strictEqual(H.notesDay('notes from monday', new Date(2026, 9, 15)).getDate(), 12, 'monday = the last Monday');
  assert.strictEqual(H.notesDay('meeting notes oct 14', new Date(2026, 9, 15)).getDate(), 14);
  console.log('PASS meeting notes: by day, latest with real speech, by topic (extracted + summarized by its own brain), never touches a recording');
})().catch((e) => { console.error(e); process.exit(1); });
