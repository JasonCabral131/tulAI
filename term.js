// A real terminal inside Tulai's chat, so you can log in to your AI tools (claude, codex login, qwen, gemini) and use any command, without leaving Tulai.
// No native module: Python's built-in pty (scripts/pty-host.py) gives the shell a real terminal (colors, prompts, login screens, resizing); output streams to the page and your keys come back.
// Only Tulai's own pages can open one (server.js checks the host, origin, JSON and the x-tulai-ui header); each session has an unguessable id.
const cp = require('child_process'), crypto = require('crypto'), os = require('os');
const sessions = new Map(); // id -> { child, out: [], listeners: Set, done, code, title, at }
const MAX = 6, KEEP = 200000;
/** A Python 3 to run the terminal host: Tulai's training Python, Homebrew's, or the system one. */
const python = () => [require('path').join(process.env.GC_DATA_DIR || require('path').join(os.homedir(), 'Library', 'Application Support', 'gateway-chat'), 'training', 'venv', 'bin', 'python'), '/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'].find((p) => { try { require('fs').accessSync(p, require('fs').constants.X_OK); return true; } catch { return false; } }) || 'python3';
/** The terminal host script, copied next to Tulai's data (Python cannot run a file that is packed inside the app archive). */
function host() {
  const fs = require('fs'), path = require('path'), dir = process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat'), dest = path.join(dir, 'pty-host.py');
  const src = fs.readFileSync(path.join(__dirname, 'scripts', 'pty-host.py'), 'utf8'); let cur = ''; try { cur = fs.readFileSync(dest, 'utf8'); } catch {}
  if (cur !== src) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(dest, src, { mode: 0o600 }); } return dest;
}
/** Opens a login shell (optionally running one command first, e.g. "claude" or "codex login"). Returns the session id. */
function start({ cmd = '', cols = 100, rows = 28, cwd } = {}) {
  for (const [id, s] of sessions) if (s.done && Date.now() - s.at > 10 * 60000) sessions.delete(id);
  if ([...sessions.values()].filter((s) => !s.done).length >= MAX) throw Error('Too many terminals are open. Close one first.');
  const c = Math.max(40, Math.min(300, +cols || 100)), r = Math.max(10, Math.min(100, +rows || 28)), safeCmd = String(cmd || '').replace(/[\r\n]/g, ' ').trim().slice(0, 1500);
  const shell = process.env.SHELL || '/bin/zsh', inner = `${safeCmd ? safeCmd + '; ' : ''}exec ${shell} -l`;
  const env = { ...process.env, TERM: 'xterm-256color', COLUMNS: String(c), LINES: String(r), PATH: require('./engines').userPath() }; delete env.ELECTRON_RUN_AS_NODE;
  const child = cp.spawn(python(), [host(), String(c), String(r), shell, '-lc', inner], { cwd: cwd || os.homedir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
  const id = crypto.randomBytes(16).toString('hex'), s = { child, out: [], size: 0, listeners: new Set(), done: false, code: null, title: safeCmd || shell.split('/').pop(), at: Date.now() };
  const push = (b) => { const t = b.toString('base64'); s.out.push(t); s.size += t.length; while (s.size > KEEP && s.out.length > 1) s.size -= s.out.shift().length; for (const l of s.listeners) l({ data: t }); };
  child.stdout.on('data', push); child.stderr.on('data', push);
  child.on('close', (code) => { s.done = true; s.code = code; s.at = Date.now(); for (const l of s.listeners) l({ exit: code }); });
  child.on('error', (e) => { push(Buffer.from(`\r\nCould not start the terminal: ${e.message}\r\n`)); });
  sessions.set(id, s); return { id, title: s.title };
}
const get = (id) => { const s = sessions.get(String(id || '')); if (!s) throw Error('That terminal is closed.'); return s; };
/** Your keystrokes (text as typed; Enter is "\r"). */
function input(id, data) { const s = get(id); if (s.done) throw Error('That terminal has ended.'); s.child.stdin.write(String(data).slice(0, 10000)); }
/** The window changed size: the terminal follows (programs redraw). */
function resize(id, cols, rows) { const s = get(id); if (!s.done) s.child.stdin.write(`\x1b]tulai;resize;${Math.max(40, Math.min(300, +cols || 100))};${Math.max(10, Math.min(100, +rows || 28))}\x07`); }
/** Streams output: replays what is already there, then calls onEvent({data}|{exit}). Returns an unsubscribe function. */
function watch(id, onEvent) { const s = get(id); for (const t of s.out) onEvent({ data: t }); if (s.done) { onEvent({ exit: s.code }); return () => {}; } s.listeners.add(onEvent); return () => s.listeners.delete(onEvent); }
function stop(id) { const s = sessions.get(String(id || '')); if (!s) return false; try { s.child.kill('SIGHUP'); } catch {} setTimeout(() => { try { s.child.kill('SIGKILL'); } catch {} }, 1500); return true; }
const list = () => [...sessions.entries()].map(([id, s]) => ({ id, title: s.title, done: s.done }));
/** The login command for an AI tool ("claude", "codex login"...), or '' if unknown. */
function loginCommand(tool) { const c = require('./engines').CLIS[String(tool || '').toLowerCase()]; return c ? c.login : ''; }
module.exports = { start, input, resize, watch, stop, list, loginCommand };
