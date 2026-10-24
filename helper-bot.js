// The helper bot: when Tulai Bot hands a task to its coding agent, a second little bot pops up and does the work (same trained brain). When it reports
// back, the main bot CHECKS the work by running the project's own tests (or compiling what changed). If the check fails the helper looks sad, then
// serious, and tries again with the failure; when it passes it waves bye-bye and leaves. The window is helper-window.js; this file is the state + the check.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
let st = { phase: 'idle', text: '', move: '', state: 'idle', seq: 0, task: '' };
const emit = () => { try { process.emit('tulay:helper', { ...st }); } catch {} };
const set = (o) => { st = { ...st, ...o, seq: st.seq + 1 }; emit(); return st; };
const short = (s, n = 90) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const helper = {
  start: (task) => set({ phase: 'working', task: short(task, 120), text: `On it: ${short(task, 70)}`, move: 'excited', state: 'thinking' }),
  progress: (name, args) => set({ phase: 'working', text: describe(name, args), move: '', state: 'thinking' }),
  checking: () => set({ phase: 'checking', text: 'Done! Main bot, please check my work.', move: 'bow', state: 'attention' }),
  sad: (why) => set({ phase: 'sad', text: `The check failed: ${short(why, 80)}`, move: 'cry', state: 'error' }),
  serious: (n) => set({ phase: 'working', text: `Okay. Fixing it properly (try ${n}).`, move: 'angry', state: 'thinking' }),
  done: (how) => set({ phase: 'done', text: `It works${how ? ` (${short(how, 50)})` : ''}. Bye bye! 👋`, move: 'wave', state: 'idle' }),
  gaveUp: (why) => set({ phase: 'failed', text: `I could not make it pass: ${short(why, 70)}. Sorry.`, move: 'cry', state: 'error' }),
  close: () => set({ phase: 'idle', text: '', move: '', state: 'idle' }),
  state: () => ({ ...st }),
};
function describe(name, a = {}) {
  const f = a.path || a.pattern || '';
  return { read_file: `Reading ${f}…`, edit_file: `Editing ${f}…`, write_file: `Writing ${f}…`, list_dir: 'Looking at the folder…', glob: 'Finding files…', grep: `Searching for ${short(f, 30)}…`, bash: `Running: ${short(a.command, 50)}`, browser: 'Using the browser…', web_fetch: 'Reading a web page…', jira_api: 'Asking Jira…', gitlab_api: 'Asking GitLab…', github_api: 'Asking GitHub…' }[name] || `Using ${String(name).replace(/_/g, ' ')}…`;
}
const run = (cmd, ws, t = 180000) => { const r = spawnSync('/bin/zsh', ['-lc', cmd], { cwd: ws, timeout: t, encoding: 'utf8', maxBuffer: 8e6 }); const out = `${r.stdout || ''}${r.stderr || ''}`.trim(); return { ok: r.status === 0, out: out.split('\n').slice(-25).join('\n').slice(-2500), cmd }; };
const has = (ws, f) => fs.existsSync(path.join(ws, f));
function testFiles(ws) { const out = []; const walk = (d, depth) => { if (depth > 3) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (/^(node_modules|\.git|venv|\.venv|dist|build|__pycache__)$/.test(e.name)) continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p, depth + 1); else if (/^test_.*\.py$|_test\.py$/.test(e.name)) out.push(path.relative(ws, p)); } }; walk(ws, 0); return out; }
/** Files the agent changed (git), or null when this is not a git folder. */
function changed(ws) { const r = spawnSync('git', ['-C', ws, 'status', '--porcelain'], { encoding: 'utf8', timeout: 15000 }); if (r.status !== 0) return null; return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).trim()); }
/** The main bot's check: the project's own tests when it has them, otherwise compile what changed. { ok, cmd, out } or null when there is nothing to check. */
function check(ws) {
  if (!ws || !fs.existsSync(ws)) return null;
  try { const pkg = JSON.parse(fs.readFileSync(path.join(ws, 'package.json'), 'utf8')); const t = pkg.scripts && pkg.scripts.test; if (t && !/no test specified/.test(t)) return run('npm test --silent', ws); } catch {}
  const tf = testFiles(ws);
  if (tf.length) { const py = spawnSync('python3', ['-c', 'import pytest'], { cwd: ws }).status === 0; if (py) return run('python3 -m pytest -q', ws); for (const f of tf) { const r = run(`python3 ${JSON.stringify(f)}`, ws, 60000); if (!r.ok) return r; } return { ok: true, cmd: tf.map((f) => 'python3 ' + f).join(' && '), out: '' }; }
  if (has(ws, 'go.mod')) return run('go test ./...', ws);
  const ch = (changed(ws) || []).filter((f) => fs.existsSync(path.join(ws, f)));
  for (const f of ch) { const cmd = /\.py$/.test(f) ? `python3 -m py_compile ${JSON.stringify(f)}` : /\.(?:js|mjs|cjs)$/.test(f) ? `node --check ${JSON.stringify(f)}` : null; if (cmd) { const r = run(cmd, ws, 30000); if (!r.ok) return r; } }
  return ch.length ? { ok: true, cmd: 'compiled the changed files', out: '' } : null;
}
module.exports = { ...helper, check, changed, describe, testFiles };
