// Mock calls: questions one at a time, feedback after each answer, a summary at the end; "end mock" stops; without a mock, messages are untouched.
const assert = require('assert'), M = require('../mock-call');
(async () => {
  M._reset(); const nlu = { chat: async ({ messages }) => ({ content: /exactly 5 questions/.test(messages[0].content) ? '1. Tell me about yourself.\n2. What is React state?\n3. How do you test a component?' : /Summarize this practice/.test(messages[0].content) ? 'Score: 7/10' : '- Good structure\n- Add an example' }) };
  assert.strictEqual(await M.handle('hello', { nlu }), null, 'no mock: normal chat');
  const a = await M.handle('start a mock interview for a frontend developer', { nlu }); assert(/Mock interview: a frontend developer/.test(a.reply) && /Question 1:\*\* Tell me about yourself/.test(a.reply), a.reply);
  const b = await M.handle('I build web apps with React.', { nlu }); assert(/Feedback/.test(b.reply) && /Question 2/.test(b.reply));
  await M.handle('State is data that changes.', { nlu }); const c = await M.handle('With Testing Library.', { nlu }); assert(/finished/.test(c.reply) && /7\/10/.test(c.reply), c.reply);
  assert(!M.active()); await M.handle('practice a sales call about renewals', { nlu }); assert(M.active()); assert(/stopped|finished/.test((await M.handle('end mock', { nlu })).reply)); assert(!M.active());
  console.log('PASS mock call: one question at a time, feedback, summary, end mock');
})().catch((e) => { console.error(e); process.exit(1); });
