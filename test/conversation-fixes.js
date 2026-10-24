// Fixes from a real conversation: "clear today convo" clears the chat; "what is the screenshot all about" reads and explains it; no "Sorry about that." on a calm new request
const assert = require('assert'), fs = require('fs'), path = require('path');
const C = require('../converse');
for (const t of ['clear today convo', '/clear', 'clear our chat', 'new chat', 'burahin ang usapan', 'clear the conversation please']) assert(C.CLEAR.test(t), t);
for (const t of ['clear my reminders', 'clear the cache', 'chat with ana', 'clear']) assert(!C.CLEAR.test(t), t);
const vr = fs.readFileSync(path.join(__dirname, '..', 'view-rules.js'), 'utf8'), line = vr.split('\n').find((l) => l.includes("tl = 'read the text in the screenshot'"));
const ask = eval(/^  if \((\/.+\/)\.test\(tl\)\) tl =/.exec(line)[1]);
for (const t of ['what is the screenshot all about', 'explain my latest screenshot', 'ano laman ng screenshot', "what's in the screenshot?"]) assert(ask.test(t), t);
assert(!ask.test('what is a screenshot'), 'a general question stays a question');
const cv = fs.readFileSync(path.join(__dirname, '..', 'converse.js'), 'utf8');
assert(/hint0\.repeated && mood0\.level !== 'calm'/.test(cv), 'the apology needs a repeat AND an annoyed tone');
console.log('PASS conversation fixes: clear the chat in plain words, explain the screenshot, no needless apology');
