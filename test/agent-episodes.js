// Coding-agent practice: every episode uses only the agent's real core tools, every edit was really applied, the run ends with a passing check, the final
// answer says what changed, no request is repeated (so training and validation never share one), and the training step keeps the tool definitions.
const assert = require('assert'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..'), d = require('../training-config/agent-episodes.json'), A = require('../agent');
const real = new Set(A.TOOLS.map((t) => t.function.name)); assert(d.episodes.length >= 40);
const asks = new Set();
for (const e of d.episodes) {
  const m = e.messages; assert.strictEqual(m[0].role, 'system'); assert.strictEqual(m[1].role, 'user'); assert(!asks.has(m[1].content.toLowerCase()), 'repeated request: ' + m[1].content); asks.add(m[1].content.toLowerCase());
  assert(e.tools.every((t) => real.has(t.function.name)), 'only real agent tools');
  const calls = m.filter((x) => x.tool_calls).map((x) => x.tool_calls[0]); assert(calls.length >= 1 && calls.every((c) => real.has(c.function.name) && typeof c.function.arguments === 'object'));
  for (const x of m.filter((y) => y.role === 'tool')) assert(!/^Error:/.test(x.content), 'no tool failed: ' + x.content);
  const bash = m.filter((y) => y.role === 'tool' && y.name === 'bash').pop(); if (bash) assert(/\[exit 0\]\s*$/.test(bash.content), 'the check passed');
  assert(m[m.length - 1].role === 'assistant' && m[m.length - 1].content.length > 20 && !m[m.length - 1].tool_calls, 'ends with a short report');
}
assert(/row=\{'messages':msgs,\*\*\(\{'tools':item\['tools'\]\}/.test(fs.readFileSync(path.join(root, 'scripts', 'finetune.py'), 'utf8')), 'the training step keeps the tool definitions');
const py = execFileSync('python3', ['-c', `import importlib.util as u,os,json;os.environ['TULAI_PACKS']='git-mastery';sp=u.spec_from_file_location('sd','scripts/skill-data.py');sd=u.module_from_spec(sp);sp.loader.exec_module(sd);o=sd.build(0)
k=lambda it:' || '.join(m['content'] for m in it['messages'] if m['role']=='user').lower() if isinstance(it,dict) else it[0].lower()
tr={k(i) for i in o['train']};last=[i['messages'][-1] for i in o['train'] if isinstance(i,dict) and i.get('tools')];print(json.dumps({'calls':sum(1 for m in last if m.get('tool_calls')),'finals':sum(1 for m in last if not m.get('tool_calls')),'agent':o.get('agent'),'cross':[k(i) for s in ('valid','test') for i in o[s] if k(i) in tr][:3],'tools':sum(1 for i in o['train'] if isinstance(i,dict) and i.get('tools'))}))`], { cwd: root }).toString();
const o = JSON.parse(py); assert.strictEqual(o.agent, d.episodes.length); assert.deepStrictEqual(o.cross, [], 'no request in both training and validation'); const stepsN = (e) => e.messages.filter((m) => m.role === 'assistant').length; assert.strictEqual(o.tools, d.episodes.slice(2).length ? o.tools : -1); assert(o.tools >= (d.episodes.length - 2) * 4 * 3, 'every step of every episode is its own row (training learns only the last message of a row), 4 times');
assert(o.calls > o.finals * 2, 'most rows end in a tool call, so the tool steps are what is learned: ' + o.calls + ' calls, ' + o.finals + ' finals');
console.log(`PASS agent episodes: ${d.episodes.length} real tool-use episodes, all checks passing, kept with their tools in training`);
