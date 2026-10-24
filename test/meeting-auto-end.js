// A meeting with nothing useful ends on its own after 20 quiet minutes and is not reviewed; a real meeting is kept going and reviewed.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-home-')); os.homedir = () => home; // notes go to a temporary Documents folder
require.cache[require.resolve('../nlu')] = { exports: { chat: async () => ({ content: '' }) } }; // a stand-in brain: the test never starts a model server
const M = require('../meeting'), said = []; process.on('tulay:meeting-notes', (t) => said.push(t));
assert(M.useful('We will move the release to Friday') && !M.useful('*crash*') && !M.useful('- Thank you so much.') && !M.useful('[music] okay'), 'what counts as useful speech');
// 1) only noise: after 20 quiet minutes it ends by itself, with no review and no notes
M.start('Noise'); for (const t of ['*crash*', '- Thank you.', '*Loud noise*', "- I think it's"]) M.feed(t, 'You');
assert.strictEqual(M.checkQuiet(Date.now() + 19 * 60000), null, 'not yet at 19 minutes');
const r = M.checkQuiet(Date.now() + 21 * 60000); assert(r && r.ok && !M.state().recording, 'ended after 20 quiet minutes');
assert(/nothing useful was said for 20 minutes/.test(r.reply) && /did not review it and wrote no notes/.test(r.reply), r.reply);
assert(said.some((t) => /ended the meeting notes/.test(t)), 'you are told in the bot chat');
const txt = fs.readFileSync(r.file, 'utf8'); assert(/Not reviewed: only background noise/.test(txt) && !/## Key points\n- [^(]/.test(txt), 'the file says it was not reviewed, no made-up key points');
// 2) a real meeting: useful speech keeps it going; stopping it reviews it
M.start('Real'); for (const t of ['The release moves to Friday because QA needs two more days', 'Ana will update the test plan in Spira today', 'We agreed to use Spira for all test cases']) M.feed(t, 'Others');
assert.strictEqual(M.checkQuiet(Date.now() + 5 * 60000), null, 'useful speech just now: keeps recording'); assert(M.state().recording);
const s = M.stop(); assert(/writing the notes with my own AI/.test(s.reply) && !/did not review/.test(s.reply), s.reply);
console.log('PASS meeting auto end: noise-only notes end after 20 quiet minutes and are not reviewed; real meetings keep going and are reviewed');
setTimeout(() => process.exit(0), 50);
