// Teams in the background (never Chrome): "in team chat <name>: <message>" sends right away; "him" = the last person; found by name in Teams; asks only what is missing.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.GC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'teams-')); process.env.TULAY_LOCAL_DRY = '1';
const sent = []; global.__tulaiCalendar = async (cmd, arg) => { if (cmd === 'teamsfind') return { ok: true, name: arg.name, email: 'juan.delacruz@example.com', title: 'Developer' }; if (cmd === 'teamssend') { sent.push(arg); return { ok: true }; } return null; };
const L = require('../local');
(async () => {
  const say = async (t) => (await L.handle(t, { sid: 'tt' })).reply;
  let r = await say('in team chat Juan Dela Cruz: Hi Pogi'); assert(/Sent to \*\*Juan Dela Cruz \(juan.delacruz@example.com, Developer\)\*\* in Teams/.test(r) && /Hi Pogi/.test(r), 'sent right away, no extra question: ' + r); assert.deepStrictEqual(sent[0], { email: 'juan.delacruz@example.com', body: 'Hi Pogi' }, 'the email found by name in Teams is used');
  r = await say('in teams chat him'); assert(/What should I send to Juan Dela Cruz/.test(r), r);
  r = await say('Kumusta ka na?'); assert(/Sent to \*\*Juan Dela Cruz/.test(r), r); assert.strictEqual(sent.length, 2);
  r = await say('send message to Ana Lim: hi pogi'); assert(/Sent to \*\*Ana Lim/.test(r) && /hi pogi/.test(r), 'plain "send message to" goes to Teams: ' + r);
  r = await say('chat mo si Ana ng hi pogi'); assert(/Sent to \*\*Ana/.test(r) && /hi pogi/.test(r), 'Taglish: ' + r);
  r = await say('email Ana that I am late'); assert(!/in Teams/.test(r || ''), 'email stays email');
  console.log('PASS teams send: sends right away, him = last person, found by name, asks only for a missing message');
})().catch((e) => { console.error(e); process.exit(1); });
