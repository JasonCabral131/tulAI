// Real chats where the bot got it wrong are captured (corrected, frustrated, repeated, no answer) so they become new tests; normal talk is not.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.GC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'missed-')); const M = require('../missed');
const H = (ask, got) => [{ role: 'user', content: ask }, { role: 'assistant', content: got }];
assert.strictEqual(M.observe("that's wrong", H('who is the father of computer', 'Bill Gates')), 'corrected');
assert.strictEqual(M.observe('mali yan', H('capital of japan', 'Kyoto')), 'corrected');
assert.strictEqual(M.observe('in teams you stupid bitch you have a background process', H('in teams chat him', "What is him's work email?")), 'frustrated');
assert.strictEqual(M.observe('who is again our national heroes?', H('who is the national heroes', 'Emilio Aguinaldo')), 'repeated');
assert.strictEqual(M.observe('listen to my meeting', H('listen to my meeting', 'Meeting notes started.'), Date.now() - 2 * 3600000), '', 'the same request hours later is a new request, not a repeat');
assert.strictEqual(M.observe('thanks!', H('what is 2+2', '4')), '', 'normal talk is not a miss');
assert.strictEqual(M.observe('and tomorrow?', H('show my meetings', 'Nothing today')), '');
assert.strictEqual(M.observe('hi', []), '', 'nothing before: nothing to judge');
M.note({ kind: 'no answer', asked: 'hello?', got: 'My configured bot model did not return an answer.' });
const l = M.list(); assert.strictEqual(l.length, 5); assert.strictEqual(l[0].kind, 'no answer'); assert.strictEqual(l[2].then, 'in teams you stupid bitch you have a background process');
const R = require('../scenario-runner'); assert(/From your real chats, where I got it wrong/.test(R.report({ at: Date.now(), model: 'b', pass: 1, total: 1, rows: [{ id: 'x', area: 'a', pass: true }] })));
console.log('PASS missed: real chats where I got it wrong are captured (corrected, frustrated, repeated, no answer) and shown with the conversation tests');
