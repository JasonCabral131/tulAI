// "show learning review": a readable layout (question, expected answer, what the bot answered, why it failed, next steps), never a bare id and a cryptic status.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-lrf-')); process.env.GC_DATA_DIR = dir; const L = require('../learning-review'); const nlu = { brain: () => ({ kind: 'local' }), health: () => ({ model: 'x' }), answer: async () => 'I am a robot.' };
(async () => {
  let r = await L.handle('show learning review', { nlu }); assert(/^### Learning review/.test(r.reply) && /No correction examples yet/.test(r.reply) && /save correction:/.test(r.reply));
  const add = await L.handle('save correction: {"prompt":"Who are you?","expected":"I am Tulai, your partner.","includes":["Tulai"],"excludes":["robot"]}', { nlu }); const id = /lesson ([a-f0-9]{12})/.exec(add.reply)[1];
  await L.handle(`evaluate lesson ${id}`, { nlu }); r = await L.handle('show learning review', { nlu });
  assert(/^### Learning review \(1 lesson\)/.test(r.reply), r.reply); assert(/\*\*1\. Who are you\?\*\*/.test(r.reply) && /Review: pending · evaluation failed/.test(r.reply) && /Expected answer: I am Tulai, your partner\./.test(r.reply), r.reply);
  assert(/What the bot answered: I am a robot\./.test(r.reply) && /Why it failed: .*Tulai/.test(r.reply), r.reply); assert(new RegExp(`approve lesson ${id}`).test(r.reply) && /does not change the model/.test(r.reply));
  assert(!/No model-weight training is running\.$/.test(r.reply.trim()), 'not a bare footer'); fs.rmSync(dir, { recursive: true, force: true });
  console.log('PASS learning review is laid out in sections with the answer, the reason it failed and the next steps');
})().catch((e) => { console.error(e); process.exit(1); });
