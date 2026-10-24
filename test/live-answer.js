// Live Answer: only the other people's questions trigger a suggestion; it uses what was said; on/off and "answer that" work; nothing goes to the company AI.
const assert = require('assert'), L = require('../live-answer'); process.env.TULAI_NO_SCREEN = '1'; // tests never take a real screenshot
(async () => {
  assert(L.isQuestion('How does the routing process work end to end today?') && L.isQuestion('Paano natin i-assign ang role sa users?') && !L.isQuestion('Okay, thanks everyone.') && !L.isQuestion('why?'));
  let got = null, seen = null; const nlu = { chat: async ({ messages }) => { seen = messages; return { content: 'We route overnight freight through two hubs today; I can send the details after the call.' }; } }, emit = (x) => { got = x; };
  const recent = [{ who: 'You', text: 'We handle overnight freight.' }, { who: 'Others', text: 'How does the routing process work end to end today?' }];
  assert.strictEqual(L.onSegment({ who: 'You', text: 'How does it work today?' }, recent, { nlu, emit, delay: 0 }), false, 'your own question never triggers it');
  assert.strictEqual(L.onSegment(recent[1], recent, { nlu, emit, delay: 0 }), true); await new Promise((r) => setTimeout(r, 30));
  assert(got && /two hubs/.test(got.text) && got.question === recent[1].text, 'a suggestion is posted');
  assert(/overnight freight/.test(seen[seen.length - 1].content), 'the conversation is used');
  assert(/off/.test(L.handle('auto answer off').reply)); got = null; L._reset(); L.handle('auto answer off');
  assert.strictEqual(L.onSegment({ who: 'Others', text: 'What is the rollout timeline on your side?' }, recent, { nlu, emit, delay: 0 }), false, 'off means no automatic suggestion');
  assert(/on/.test(L.handle('turn on auto answer').reply));
  assert(/Thinking about/.test(L.handle('answer that', () => recent).reply));
  assert.strictEqual(L.handle('what is the weather'), null);
  // small talk is not a question to answer
  for (const q of ["What's up? Sir Jason, what's our question? We should talk about it.", 'Hi everyone, can you hear me okay?', 'How are you doing today, all good?', 'Kumusta kayo lahat dito ngayon?']) assert(!L.isQuestion(q), q);
  // the screen is read and used; coding questions get room for code and the coding instructions
  L._reset(); seen = null; await L.suggest('Can you write a function that merges two sorted arrays?', recent, { nlu, emit, readScreen: async () => 'def merge(a, b):\n    # TODO' });
  assert(seen.some((m) => /Text on my screen right now/.test(m.content) && /def merge/.test(m.content)), 'screen text is given to the brain');
  assert(/coding question/.test(seen[0].content) && /answer directly and confidently/.test(seen[0].content), 'coding instructions, and no "not decided" for knowledge questions');
  // a coding problem on the screen is solved once, in the floating window; ordinary screens are ignored unless asked
  const problem = 'Two Sum\nGiven an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\nExample 1:\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nConstraints:\n2 <= nums.length <= 10^4\nclass Solution:\n    def twoSum(self, nums, target):';
  assert(L.looksLikeProblem(problem) && !L.looksLikeProblem('Quarterly planning\nAgenda: roadmap, hiring, budget\nNotes from last week') && !L.looksLikeProblem(''));
  let calls = 0; const nlu2 = { chat: async () => { calls++; return { content: 'Use a hash map.\n```python\nclass Solution:\n    def twoSum(self, nums, target):\n        seen = {}\n```\nO(n) time, O(n) space.' }; } }; const posted = [];
  const out = await L.solveScreen({ nlu: nlu2, read: async () => problem, emit: (x) => posted.push(x) }); assert(/hash map/.test(out) && posted.length === 1 && /On your screen: Two Sum/.test(L.items()[0].question));
  const afterFirst = calls; assert.strictEqual(afterFirst, 3, 'the incomplete code fails the example on screen, so it is retried (3 tries)'); assert(/⚠️ My code still fails an example/.test(L.items()[0].text), 'and the answer says so');
  assert.strictEqual(await L.solveScreen({ nlu: nlu2, read: async () => problem + '\n' }), null, 'the same problem is not solved twice'); assert.strictEqual(calls, afterFirst);
  assert.strictEqual(await L.solveScreen({ nlu: nlu2, read: async () => 'Quarterly planning\nAgenda: roadmap, hiring, budget' }), null, 'not a coding problem: nothing');
  assert(await L.solveScreen({ nlu: nlu2, read: async () => 'Quarterly planning\nAgenda: roadmap, hiring, budget', force: true }), 'but "solve the screen" always answers');
  assert(/floating answer window/.test(L.handle('solve the screen').reply) && L.handle('answer from my screen'));
  console.log('PASS live answer: other people\'s questions, conversation used, on/off, answer that; small talk skipped; the screen is read; coding problems on screen solved once');
})().catch((e) => { console.error(e); process.exit(1); });
