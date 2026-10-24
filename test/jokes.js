// "tell me a joke", "another one", "one more": always a joke not told yet in the conversation; ordinary questions are untouched.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path'), { createRequire } = require('module');
const file = path.join(__dirname, '..', 'nlu.js'), sb = { module: { exports: {} }, require: createRequire(file), __dirname: path.dirname(file), process: { env: {}, on() {} }, console, fetch, AbortSignal, Date, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(file, 'utf8') + '\nensureLocal=async()=>true;llm=async()=>({choices:[{message:{content:"model answer"}}]});', sb);
(async () => {
  const h = [], said = [];
  for (const q of ['tell me a joke', 'another one', 'one more', 'again']) { const r = await sb.module.exports.answer(q, { history: h }); said.push(r); h.push({ role: 'user', content: q }, { role: 'assistant', content: r }); }
  assert.strictEqual(new Set(said).size, 4, 'four different jokes: ' + said.join(' | '));
  assert.strictEqual(await sb.module.exports.answer('another one', { history: [] }), 'model answer', '"another one" with no joke before goes to the model');
  assert.strictEqual(await sb.module.exports.answer('what is a sprint', { history: h }), 'model answer');
  console.log('PASS jokes: never the same joke twice in a conversation');
})().catch((e) => { console.error(e); process.exit(1); });
