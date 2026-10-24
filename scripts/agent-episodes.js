// Coding-agent practice for the bot's brain: worked examples of USING the tools (look at the folder, read the file, edit it, run the test, report), so
// the bot codes in real folders like Tulai Desktop. Every episode is produced by really running the agent's own tools (agent.js execTool) on a throwaway
// repo, so each tool result is exactly what the agent sees, and an episode is kept only when the test passes at the end.
//   node scripts/agent-episodes.js            writes training-config/agent-episodes.json
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const A = require('../agent'), ROOT = path.join(__dirname, '..');
const CORE = ['read_file', 'write_file', 'edit_file', 'list_dir', 'glob', 'grep', 'bash'];
const TOOLS = A.TOOLS.filter((t) => CORE.includes(t.function.name));
const SYSTEM = (ws) => `You are Tulai's coding assistant with direct access to the user's project through tools.\n\nWorking directory: ${ws}\n\n${require('../agent-mode').CODER}`; // the same instruction real jobs get (converse.js)
const cp = JSON.parse(execFileSync('python3', ['-c', "import importlib.util as u,json;sp=u.spec_from_file_location('cp','scripts/coding-practice.py');cp=u.module_from_spec(sp);sp.loader.exec_module(cp);print(json.dumps({'fixes':cp.FIXES,'impl':cp.IMPL}))"], { cwd: ROOT }).toString());
const MODS = ['dates', 'calc', 'textutil', 'helpers', 'report', 'lists', 'stats', 'names'];
let n = 0; const call = (name, args) => ({ id: `call_${++n}`, type: 'function', function: { name, arguments: args } });
async function episode(files, ask, steps, final) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-')); for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(ws, f)), { recursive: true }); fs.writeFileSync(path.join(ws, f), c); }
  const shown = '~/Projects/' + path.basename(Object.keys(files)[0], '.py').replace(/^test_/, '') + '-app';
  const msgs = [{ role: 'system', content: SYSTEM(shown) }, { role: 'user', content: ask }]; let ok = true, lastOut = '';
  try {
    for (const [name, args] of steps) {
      const c = call(name, args); let out; try { out = String(await A.execTool(name, args, { ws, signal: new AbortController().signal })); } catch (e) { out = 'Error: ' + e.message; ok = false; }
      out = out.split(ws).join(shown); lastOut = out; msgs.push({ role: 'assistant', content: '', tool_calls: [c] }, { role: 'tool', tool_call_id: c.id, name, content: out.slice(0, 1800) });
    }
    if (!/\[exit 0\]\s*$/.test(lastOut) && steps.some(([nm]) => nm === 'bash')) ok = false; // the check at the end must pass
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  msgs.push({ role: 'assistant', content: final }); return ok ? { messages: msgs, tools: TOOLS } : null;
}
const fname = (code) => /def (\w+)\(/.exec(code)[1];
const ASK_FIX = ['fix the bug in {f} in {m}.py so the test passes', 'the test for {f} in test_{m}.py fails, fix it', 'ayusin mo yung bug sa {f} ({m}.py)', 'CI is red on test_{m}.py because of {f}, please fix the code', 'test_{m}.py is failing. Can you fix {f}?'];
const ASK_ADD = ['add a function `{f}` to {m}.py that {t}', 'in {m}.py, implement {f}: it {t}', 'gumawa ka ng function na {f} sa {m}.py: {t}'];
(async () => {
  const out = [], asked = new Set(); let i = 0; const keep = (e) => { if (!e) return; const k = e.messages[1].content.toLowerCase(); if (asked.has(k)) return; asked.add(k); out.push(e); };
  const DOC = ['    """Used by the reports page."""', '    # keep this in sync with the API', '    """See the README for examples."""'];
  const withDoc = (code, k) => (k ? code.replace(/^(def [^\n]+\n)/m, `$1${DOC[k % DOC.length]}\n`) : code); // the edit must copy the docstring/comment exactly
  for (const [test, err, bad0, ins, good0] of cp.fixes) for (let k = 0; k < 3; k++) {
    const bad = withDoc(bad0, k), good = withDoc(good0, k);
    const m = MODS[(i++) % MODS.length], f = fname(bad), testFile = `from ${m} import ${f}\n\n\ndef test_${f}():\n    ${test}\n\n\nif __name__ == '__main__':\n    test_${f}()\n    print('1 passed')\n`;
    const ask = ASK_FIX[(i + k) % ASK_FIX.length].replace(/\{m\}/g, m).replace(/\{f\}/g, f);
    const e = await episode({ [`${m}.py`]: bad + '\n', [`test_${m}.py`]: testFile }, ask,
      [['list_dir', {}], ['read_file', { path: `${m}.py` }], ['read_file', { path: `test_${m}.py` }], ['edit_file', { path: `${m}.py`, old_string: bad, new_string: good }], ['bash', { command: `python3 test_${m}.py` }]],
      `Fixed \`${f}\` in ${m}.py: ${ins.replace(/^Fix it /i, 'it now works ').replace(/\.$/, '')}. I ran test_${m}.py and it passes.`);
    keep(e);
  }
  // real-world orders: run the failing test FIRST, then read, edit, run again; and the main bot's "the check failed" -> fix it (never stop at a diagnosis)
  for (const [test, err, bad1, ins, good1] of cp.fixes) {
    const bad = withDoc(bad1, 2), good = withDoc(good1, 2);
    const m = MODS[(i++) % MODS.length], f = fname(bad), testFile = `from ${m} import ${f}\n\n\ndef test_${f}():\n    ${test}\n\n\nif __name__ == '__main__':\n    test_${f}()\n    print('1 passed')\n`;
    keep(await episode({ [`${m}.py`]: bad + '\n', [`test_${m}.py`]: testFile }, `make test_${m}.py pass (${f} is broken)`,
      [['bash', { command: `python3 test_${m}.py` }], ['read_file', { path: `${m}.py` }], ['edit_file', { path: `${m}.py`, old_string: bad, new_string: good }], ['bash', { command: `python3 test_${m}.py` }]],
      `test_${m}.py failed first; I fixed \`${f}\` in ${m}.py (${ins.replace(/^Fix it /i, '').replace(/\.$/, '')}) and the test passes now.`));
    keep(await episode({ [`${m}.py`]: bad + '\n', [`test_${m}.py`]: testFile }, `fix ${f} in ${m}.py.\n\nI ran \`python3 test_${m}.py\` to check your work and it failed:\n\n${err}\n\nFix the cause in the files, then run the check again.`,
      [['read_file', { path: `${m}.py` }], ['edit_file', { path: `${m}.py`, old_string: bad, new_string: good }], ['bash', { command: `python3 test_${m}.py` }]],
      `You were right, it was still broken. I edited ${m}.py so ${f} is correct now, and test_${m}.py passes.`));
  }
  for (const [f, task, sol, asserts] of cp.impl) for (let k = 0; k < 2; k++) {
    const m = MODS[(i++) % MODS.length], base = `def hello(name):\n    return 'Hello, ' + name\n`;
    const ask = ASK_ADD[(i + k) % ASK_ADD.length].replace(/\{m\}/g, m).replace(/\{f\}/g, f).replace(/\{t\}/g, task);
    const check = `python3 -c "from ${m} import ${f}; assert ${asserts[0].replace(/"/g, "'")}; print('ok')"`;
    const e = await episode({ [`${m}.py`]: base }, ask, [['read_file', { path: `${m}.py` }], ['edit_file', { path: `${m}.py`, old_string: base, new_string: base + '\n\n' + sol + '\n' }], ['bash', { command: check }]],
      `Added \`${f}\` to ${m}.py and checked it: \`${asserts[0]}\` holds.`);
    keep(e);
  }
  // find something in a project, then answer from the file (no edit)
  const proj = { 'README.md': '# Shop app\nA small shop backend: carts, orders and invoices.\n', 'orders.py': "def place_order(cart):\n    if not cart:\n        raise ValueError('empty cart')\n    return {'status': 'placed', 'items': len(cart)}\n", 'invoices.py': 'def invoice_total(lines):\n    return round(sum(l * 1.12 for l in lines), 2)\n' };
  for (const [ask, steps, final] of [
    ['what does this project do?', [['list_dir', {}], ['read_file', { path: 'README.md' }]], 'It is a small shop backend for carts, orders and invoices: orders.py places orders and invoices.py totals invoices with 12% tax.'],
    ['where is the empty cart error raised?', [['grep', { pattern: 'empty cart' }]], 'In orders.py, line 3: `place_order` raises `ValueError(\'empty cart\')` when the cart is empty.'],
    ['how is the invoice total calculated?', [['grep', { pattern: 'def invoice_total' }], ['read_file', { path: 'invoices.py' }]], '`invoice_total` in invoices.py adds 12% to every line and rounds the sum to 2 decimals.'],
    ['ano ang ginagawa ng orders.py?', [['read_file', { path: 'orders.py' }]], 'Ang `place_order` sa orders.py ay nagbibigay ng error kapag walang laman ang cart; kung meron, ibinabalik nito ang status na "placed" at ang bilang ng items.']]) { const e = await episode(proj, ask, steps, final); keep(e); }
  // more projects to explore: always look first (list, read the README or package file, search), then answer from what was read
  const PROJECTS = [
    [{ 'package.json': '{\n  "name": "notes-api",\n  "scripts": { "start": "node src/server.js", "test": "node test/notes.test.js" },\n  "dependencies": { "express": "^4.19.2" }\n}\n', 'src/server.js': "const express = require('express');\nconst notes = require('./notes');\nconst app = express();\napp.use(express.json());\napp.get('/notes', (req, res) => res.json(notes.list()));\napp.post('/notes', (req, res) => res.status(201).json(notes.add(req.body.text)));\napp.listen(3000);\n", 'src/notes.js': 'const items = [];\nexports.list = () => items;\nexports.add = (text) => { const n = { id: items.length + 1, text }; items.push(n); return n; };\n' },
     [['explain this repo', [['list_dir', {}], ['read_file', { path: 'package.json' }], ['read_file', { path: 'src/server.js' }]], 'It is a small Express API for notes: `GET /notes` lists them and `POST /notes` adds one (src/server.js), and src/notes.js keeps them in memory. Start it with `npm start`; it listens on port 3000.'],
      ['which port does the server use?', [['grep', { pattern: 'listen' }]], 'Port 3000: src/server.js line 7 calls `app.listen(3000)`.'],
      ['how are notes stored?', [['grep', { pattern: 'items' }], ['read_file', { path: 'src/notes.js' }]], 'Only in memory: src/notes.js keeps them in an `items` array, so they are lost when the server restarts.']]],
    [{ 'README.md': '# weather-cli\nPrints today\'s temperature for a city.\n\nUsage: python3 weather.py Manila\n', 'weather.py': "import sys\nfrom forecast import today\n\nif __name__ == '__main__':\n    city = sys.argv[1] if len(sys.argv) > 1 else 'Manila'\n    print(f'{city}: {today(city)} C')\n", 'forecast.py': "TEMPS = {'Manila': 31, 'Baguio': 19, 'Cebu': 30}\n\ndef today(city):\n    return TEMPS.get(city, 25)\n" },
     [["what's in this folder?", [['list_dir', {}], ['read_file', { path: 'README.md' }]], 'A small weather command-line tool: weather.py prints today\'s temperature for a city (for example `python3 weather.py Manila`), and forecast.py holds the temperatures.'],
      ['where do the temperatures come from?', [['grep', { pattern: 'TEMPS' }], ['read_file', { path: 'forecast.py' }]], 'From a fixed table in forecast.py (`TEMPS`): Manila 31, Baguio 19, Cebu 30, and 25 for any other city. It does not call a weather service.'],
      ['ano ang laman ng project na ito?', [['list_dir', {}], ['read_file', { path: 'README.md' }]], 'Isang maliit na weather tool: ang weather.py ay nagpi-print ng temperatura ng isang lungsod, at ang forecast.py ang may listahan ng temperatura.']]],
    [{ 'package.json': '{\n  "name": "todo-web",\n  "scripts": { "dev": "vite", "build": "vite build" },\n  "dependencies": { "react": "^18.3.1" }\n}\n', 'src/App.jsx': "import { useState } from 'react';\nimport TodoList from './TodoList';\n\nexport default function App() {\n  const [items, setItems] = useState([]);\n  return <TodoList items={items} onAdd={(t) => setItems([...items, t])} />;\n}\n", 'src/TodoList.jsx': "export default function TodoList({ items, onAdd }) {\n  return (<div>{items.map((t, i) => <p key={i}>{t}</p>)}<button onClick={() => onAdd('New task')}>Add</button></div>);\n}\n" },
     [['summarize this codebase', [['list_dir', {}], ['read_file', { path: 'package.json' }], ['glob', { pattern: 'src/**/*.jsx' }]], 'A small React to-do app built with Vite: src/App.jsx keeps the list in state and src/TodoList.jsx shows it with an Add button. Run it with `npm run dev`.'],
      ['where is the Add button?', [['grep', { pattern: 'Add' }]], 'In src/TodoList.jsx: the `<button>` calls `onAdd(\'New task\')`, and App.jsx adds that to its list.'],
      ['what does App.jsx do?', [['read_file', { path: 'src/App.jsx' }]], 'App.jsx keeps the to-do items in React state and renders `TodoList`, passing the items and an `onAdd` that appends a new item.']]],
  ];
  for (const [files, qs] of PROJECTS) for (const [ask, steps, final] of qs) keep(await episode(files, ask, steps, final));
  fs.writeFileSync(path.join(ROOT, 'training-config', 'agent-episodes.json'), JSON.stringify({ about: 'Coding-agent practice made by running the agent tools on throwaway repos (scripts/agent-episodes.js). Each episode ends with a passing check.', episodes: out }) + '\n');
  console.log(`${out.length} agent episodes written (fix ${cp.fixes.length * 3}, add ${cp.impl.length * 2}, explore 4 attempted)`);
})();
