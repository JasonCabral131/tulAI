// Your own training: add, list, delete, import, validate; secrets and bad patterns are refused; files you drop in by hand are read.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-ct-')); process.env.GC_DATA_DIR = tmp;
const ct = require('../custom-training');
assert.deepStrictEqual(ct.list().examples, []);
const a = ct.add({ prompt: 'who is my lead?', answer: 'Your lead is Mia.', memory: ['my lead is Mia'] }); assert(a.id && ct.list().examples.length === 1);
assert.throws(() => ct.add({ prompt: 'who is my lead?', answer: 'Your lead is Mia.', memory: ['my lead is Mia'] }), /already added/);
assert.throws(() => ct.add({ prompt: 'my password?', answer: 'it is hunter2' }), /secret/);
assert.throws(() => ct.add({ prompt: 'q', answer: 'a' }), /too short/);
assert.throws(() => ct.add({ prompt: 'a question', answer: '' }), /empty/);
assert.throws(() => ct.add({ check: true, prompt: 'a question' }), /needs "match"/);
assert.throws(() => ct.add({ check: true, prompt: 'a question', match: '(' }), /not a valid pattern/);
ct.add({ check: true, prompt: 'what day do we deploy?', match: 'Thursday', not: 'Friday', maxWords: 20 }); const L = ct.list(); assert(L.checks.length === 1 && L.checks[0].maxWords === 20);
const im = ct.importText('{"prompt":"deploy day?","answer":"Thursday."}\n{"prompt":"my API key is sk-abcdef123","answer":"ok"}\nnot json\n[1]'.split('\n').slice(0, 3).join('\n')); assert(im.added === 1 && im.skippedCount === 2, JSON.stringify(im));
assert(ct.importText('[{"prompt":"hello there","answer":"Hi!"},{"prompt":"hey you","answer":"Hello!"}]').added === 2, 'a JSON array imports too');
fs.writeFileSync(path.join(ct.dir(), 'team.jsonl'), JSON.stringify({ prompt: 'team motto?', answer: 'Ship small.' }) + '\n'); assert(ct.list().examples.some((e) => e.file === 'team.jsonl'), 'hand-added files are read');
assert.throws(() => ct.remove(ct.list().examples.find((e) => e.file === 'team.jsonl').id), /by hand/);
ct.remove(a.id); assert(!ct.list().examples.some((e) => e.id === a.id));
fs.rmSync(tmp, { recursive: true, force: true }); console.log('PASS custom training: add, import, validate, delete; secrets and bad patterns refused; hand-added files read');
