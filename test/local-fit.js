// Every request to our local brain fits its memory (32K everyday, 100K for long requests): no sub-agent tool, long tool results trimmed, oldest middle steps dropped with a note,
// while the instructions, the task and the latest steps stay. (A 160k-token agent request used to fail with "exceeds the available context size".)
const assert = require('assert'), { fitLocal, needsLong, LOCAL_CTX, LONG_CTX } = require('../local-fit');
const est = (x) => Math.ceil(JSON.stringify(x || '').length / 3.2);
const msgs = [{ role: 'system', content: 'S'.repeat(6000) }, { role: 'user', content: 'Create the platform-reports skill' }];
for (let i = 0; i < 160; i++) msgs.push({ role: 'assistant', content: '', tool_calls: [{ id: 'c' + i, type: 'function', function: { name: 'read_file', arguments: '{"path":"f' + i + '"}' } }] }, { role: 'tool', tool_call_id: 'c' + i, content: 'x'.repeat(9000) });
const tools = [{ type: 'function', function: { name: 'read_file' } }, { type: 'function', function: { name: 'task' } }];
assert(needsLong({ messages: msgs, tools }), 'a huge agent request goes to the 100K brain'); assert(!needsLong({ messages: [{ role: 'user', content: 'hi' }] }), 'everyday requests stay on the 32K brain');
const out = fitLocal({ messages: msgs, tools, max_tokens: 64000 }, LONG_CTX);
assert(est(out.messages) + est(out.tools) < LONG_CTX - out.max_tokens && est(out.messages) > LOCAL_CTX, 'it fits the 100K brain (and uses it): ' + (est(out.messages) + est(out.tools)));
const out32 = fitLocal({ messages: msgs, tools, max_tokens: 64000 }); assert(est(out32.messages) + est(out32.tools) < LOCAL_CTX - out32.max_tokens, 'and the 32K brain when that is all there is');
assert(!out.tools.some((t) => t.function.name === 'task'), 'no sub-agent tool on the local brain');
assert.deepStrictEqual(fitLocal({ messages: [{ role: 'user', content: 'x' }], tools: ['read_file', 'ctx_read', 'jira_api', 'browser', 'render'].map((n) => ({ type: 'function', function: { name: n } })) }).tools.map((t) => t.function.name), ['read_file', 'browser'], 'only the tools our brain practised');
assert.strictEqual(out.messages[0].role, 'system'); assert.strictEqual(out.messages[1].content, 'Create the platform-reports skill', 'the task stays');
assert(/Earlier steps were removed/.test(out.messages[2].content), 'a note says steps were removed');
assert.strictEqual(out.messages.at(-1).tool_call_id, 'c159', 'the latest step stays');
for (let i = 3; i < out.messages.length; i++) if (out.messages[i].role === 'tool') assert(out.messages[i - 1].role === 'assistant' || out.messages[i - 1].role === 'tool', 'every tool result still follows its call');
const small = fitLocal({ messages: [{ role: 'user', content: 'hi' }], max_tokens: 200 }); assert.strictEqual(small.messages.length, 1, 'small requests are untouched');
assert.strictEqual(msgs.length, 322, 'the original request is not modified');
console.log('PASS local fit: every request fits the 32K or the 100K brain; task and latest steps kept, sub-agents off');
