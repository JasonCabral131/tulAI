// Learning from the company AI: Sonnet's saved tool steps from a Tulai Desktop chat become practice steps for our brain (one per move, last few steps as
// context, long results clipped, whole-file writes skipped), kept privately in training/sonnet and added to training.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const S = require('../scripts/sonnet-episodes');
const chat = { title: 'demo', workspace: '/x/shop', history: [
  { role: 'user', content: 'fix the cart total' },
  { role: 'assistant', content: 'Looking.', tool_calls: [{ id: 'a', type: 'function', function: { name: 'read_file', arguments: '{"path":"cart.py"}' } }] },
  { role: 'tool', tool_call_id: 'a', content: 'x'.repeat(3000) },
  { role: 'assistant', content: 'None', tool_calls: [{ id: 'b', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'big.py', content: 'y'.repeat(5000) }) } }] },
  { role: 'tool', tool_call_id: 'b', content: 'Created' },
  { role: 'assistant', content: 'None', tool_calls: [{ id: 'c', type: 'function', function: { name: 'edit_file', arguments: '{"path":"cart.py","old_string":"- 1","new_string":""}' } }] },
  { role: 'tool', tool_call_id: 'c', content: 'Edited' },
  { role: 'user', content: 'continue' },
  { role: 'assistant', content: 'Fixed the loop; the test passes.' }] };
const e = S.episodes(chat);
assert.deepStrictEqual(e.map((x) => x.messages.at(-1).tool_calls ? x.messages.at(-1).tool_calls[0].function.name : 'summary'), ['read_file', 'edit_file', 'summary'], 'one example per move; the whole-file write is skipped; "continue" keeps the same task');
assert(e[1].messages.some((m) => m.role === 'tool' && m.content.length < 600), 'long results are clipped in the context');
assert(e.every((x) => x.messages[1].content === 'fix the cart total' && x.tools.length), 'the task and the tools used are kept');
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'son-')); fs.mkdirSync(path.join(d, 'training', 'sonnet'), { recursive: true }); fs.writeFileSync(path.join(d, 'training', 'sonnet', 'c.json'), JSON.stringify({ episodes: e }));
const py = execFileSync('python3', ['-c', `import importlib.util as u,os,json;os.environ['TULAI_PACKS']='git-mastery';os.environ['TULAI_DATA_DIR']=${JSON.stringify(d)};sp=u.spec_from_file_location('sd','scripts/skill-data.py');sd=u.module_from_spec(sp);sp.loader.exec_module(sd);o=sd.build(0);print(o.get('sonnet'))`], { cwd: path.join(__dirname, '..') }).toString().trim();
assert.strictEqual(py, '3', 'the saved Sonnet steps are added to training');
console.log('PASS sonnet episodes: the company AI\'s saved tool steps become private practice for our brain');
