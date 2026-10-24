// The coding answer checks itself: examples are read from the screen, the Python solution runs against them, a failure is sent back to the brain
// (up to 3 tries), and the answer says honestly whether it passed.
const assert = require('assert'), S = require('../screen-solve');
const screen = 'Valid Parentheses\nGiven a string s containing just the characters (, ), {, }, [ and ], determine if the input string is valid.\nExample 1:\nInput: s = "()[]{}"\nOutput: true\nExample 2:\nInput: s = "(]"\nOutput: false\nExample 3:\nInput: nums = [2,7,11,15], target = 9\nOutput: [0,1]\nclass Solution:\n    def isValid(self, s: str) -> bool:';
const ex = S.examples(screen); assert.strictEqual(ex.length, 3); assert.deepStrictEqual(ex[0], { args: [{ name: 's', value: '"()[]{}"' }], out: 'True' }); assert.deepStrictEqual(ex[2].args, [{ name: 'nums', value: '[2,7,11,15]' }, { name: 'target', value: '9' }]);
const good = '```python\nclass Solution:\n    def isValid(self, s: str) -> bool:\n        pairs = {")": "(", "]": "[", "}": "{"}\n        st = []\n        for c in s:\n            if c in pairs:\n                if not st or st.pop() != pairs[c]: return False\n            else: st.append(c)\n        return not st\n```';
const bad = '```python\nclass Solution:\n    def isValid(self, s: str) -> bool:\n        return True\n```';
const two = ex.slice(0, 2);
assert.strictEqual(S.verify(good, two), '', 'a correct solution passes'); assert(/example 2: expected False, got True/.test(S.verify(bad, two)), 'a wrong one fails with the reason');
assert.strictEqual(S.verify('```js\nfunction f(){}\n```', two), null, 'not Python: cannot check'); assert.strictEqual(S.verify(good, []), null, 'no examples: cannot check');
(async () => {
  const seen = []; let n = 0; const nlu = { chat: async ({ messages }) => { seen.push(messages); n++; return { content: n === 1 ? 'Use a stack.\n' + bad : 'Use a stack.\n' + good + '\nO(n) time, O(n) space.' }; } };
  const scr = screen.replace(/Example 3:[\s\S]*?Output: \[0,1\]\n/, '');
  const r = await S.solve(scr, { nlu }); assert(r.passed && r.tries === 2 && /✅ Ran it on the 2 examples on your screen: all pass \(fixed on try 2\)/.test(r.text), r.text);
  assert(/failed: example 2: expected False, got True/.test(seen[1][seen[1].length - 1].content), 'the failure is sent back to the brain');
  const r2 = await S.solve(scr, { nlu: { chat: async () => ({ content: bad }) } }); assert(!r2.passed && r2.tries === 3 && /⚠️ My code still fails an example/.test(r2.text), 'honest when it never passes');
  console.log('PASS screen solve: examples read from the screen, the code is run, failures retried, honest result');
})().catch((e) => { console.error(e); process.exit(1); });
