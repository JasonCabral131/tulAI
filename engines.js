// Which AI answers in each window (Tulai Bot, Tulai Desktop). The default is always our trained brain (Qwen2.5-3B, fine-tuned on this Mac).
// You can switch, per window, to:
//   - a model downloaded from Hugging Face, run on this Mac (kind 'gguf', see hf-models.js)
//   - an AI tool you are logged into with your own subscription, through its official command-line tool (kind 'cli'):
//     Claude (Claude Code), ChatGPT (Codex), Qwen (Qwen Code), Gemini (Gemini CLI), or any command you add
//   - a provider with an API key, OpenAI-compatible (kind 'api'): Groq, OpenRouter, OpenAI, Anthropic, DeepSeek, Mistral, Qwen Model Studio, Gemini, xAI, Together, or any address
//   - Tulai Desktop only: the company AI gateway (kind 'gateway')
// Your prompts go to the provider you pick, under your account. Keys stay in config.json on this Mac (owner-only) and are never shown back.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), { Readable } = require('stream');

const APIS = {
  groq: { name: 'Groq', base: 'https://api.groq.com/openai/v1' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1' },
  openai: { short: 'OpenAI', name: 'OpenAI API', base: 'https://api.openai.com/v1' },
  anthropic: { short: 'Anthropic', name: 'Anthropic API', base: 'https://api.anthropic.com/v1' },
  deepseek: { name: 'DeepSeek', base: 'https://api.deepseek.com/v1' },
  mistral: { name: 'Mistral', base: 'https://api.mistral.ai/v1' },
  dashscope: { short: 'Qwen Model Studio', name: 'Qwen (Alibaba Model Studio)', base: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
  gemini: { short: 'Gemini', name: 'Google Gemini API', base: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  xai: { short: 'xAI Grok', name: 'xAI (Grok)', base: 'https://api.x.ai/v1' },
  together: { name: 'Together AI', base: 'https://api.together.xyz/v1' },
  custom: { short: 'Other address', name: 'Other (OpenAI-compatible address)', base: '' },
};
const home = () => os.homedir();
const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const jsonHas = (p, k) => { try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); return k ? !!k.split('.').reduce((o, x) => o && o[x], j) : true; } catch { return false; } };
const CLIS = {
  claude: { name: 'Claude (your Claude subscription)', bin: 'claude', pkg: '@anthropic-ai/claude-code', login: 'claude', loggedIn: () => jsonHas(path.join(home(), '.claude.json'), 'oauthAccount') || exists(path.join(home(), '.claude', '.credentials.json')) },
  codex: { name: 'ChatGPT (your ChatGPT subscription, via Codex)', bin: 'codex', pkg: '@openai/codex', login: 'codex login', loggedIn: () => jsonHas(path.join(home(), '.codex', 'auth.json'), 'tokens') || jsonHas(path.join(home(), '.codex', 'auth.json'), 'OPENAI_API_KEY') },
  qwen: { name: 'Qwen (your Qwen account, via Qwen Code)', bin: 'qwen', pkg: '@qwen-code/qwen-code', login: 'qwen', loggedIn: () => exists(path.join(home(), '.qwen', 'oauth_creds.json')) },
  gemini: { name: 'Gemini (your Google account, via Gemini CLI)', bin: 'gemini', pkg: '@google/gemini-cli', login: 'gemini', loggedIn: () => exists(path.join(home(), '.gemini', 'oauth_creds.json')) },
};

/** The PATH of your login shell (the app itself starts with a minimal one), so tools installed with npm, Homebrew or ~/.local/bin are found. */
let shellPath = null;
function userPath() {
  if (shellPath) return shellPath;
  const extra = [path.join(home(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin', path.join(home(), '.npm-global/bin'), path.join(home(), '.bun/bin')];
  let p = ''; try { p = cp.execFileSync(process.env.SHELL || '/bin/zsh', ['-lc', 'printf %s "$PATH"'], { encoding: 'utf8', timeout: 4000 }); } catch {}
  shellPath = [...new Set([...String(p).split(':'), ...extra, ...String(process.env.PATH || '').split(':')].filter(Boolean))].join(':'); return shellPath;
}
/** Where Tulai sets up an AI tool you log in to, if it is not on this Mac yet (no global install, nothing outside Tulai's data folder). */
const TOOLS_DIR = () => path.join(process.env.GC_DATA_DIR || path.join(home(), 'Library', 'Application Support', 'gateway-chat'), 'ai-tools');
/** The shell command behind "Log in": sets the tool up once if it is missing, then starts its own login (a browser page may open). */
function loginCmd(id) {
  const c = CLIS[id]; if (!c) return '';
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`, args = c.login.split(' ').slice(1).join(' '), at = which(c.bin), local = path.join(TOOLS_DIR(), 'node_modules', '.bin', c.bin);
  const hint = id === 'claude' ? `echo "If Claude does not ask you to log in, type /login and press Enter."; ` : '';
  if (at) return `${hint}${q(at)}${args ? ' ' + args : ''}`;
  return `echo "Setting up ${c.name.split(' (')[0]} for Tulai (one time, about a minute)…"; command -v npm >/dev/null || { echo "Node.js is needed once: install it from nodejs.org (or: brew install node), then press Log in again."; exit 1; }; `
    + `npm install --prefix ${q(TOOLS_DIR())} ${c.pkg} --no-fund --no-audit --loglevel=error && echo "Ready. Starting the login…" && ${hint}${q(local)}${args ? ' ' + args : ''}`;
}
function which(bin) { const own = path.join(TOOLS_DIR(), 'node_modules', '.bin', bin); try { fs.accessSync(own, fs.constants.X_OK); return own; } catch {} for (const d of userPath().split(':')) { const f = path.join(d, bin); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch {} } return ''; }

/** Custom command-line AIs you add: { id, name, command, args: ['-p', '{prompt}'] } in config.engineCLIs. */
const customCLIs = (cfg) => (Array.isArray(cfg && cfg.engineCLIs) ? cfg.engineCLIs : []).filter((c) => c && /^[a-z0-9-]{2,30}$/.test(c.id) && c.command);

/** Everything you can pick, with whether it is ready. */
function list(cfg = {}, role = 'bot') {
  const keys = cfg.engineKeys || {}, out = [{ id: 'tulai', kind: 'local', name: 'Our trained AI (Tulai, Qwen2.5-3B on this Mac)', short: 'Our trained AI (default)', ready: true, default: true }];
  try { for (const m of require('./hf-models').downloaded()) out.push({ id: 'gguf:' + m.file, kind: 'gguf', name: `${m.name} (downloaded, on this Mac)`, short: `${m.name} (this Mac)`, ready: true, file: m.file, size: m.size }); } catch {}
  for (const [id, c] of Object.entries(CLIS)) { const at = which(c.bin); out.push({ id: 'cli:' + id, kind: 'cli', name: c.name, short: c.name.split(' (')[0] + ' (your account)', ready: !!at && c.loggedIn(), installed: !!at, loggedIn: c.loggedIn(), install: `npm install -g ${c.pkg}`, login: c.login }); }
  for (const c of customCLIs(cfg)) { const at = c.command.includes('/') ? (exists(c.command) ? c.command : '') : which(c.command); out.push({ id: 'cli:' + c.id, kind: 'cli', name: c.name || c.id, ready: !!at, installed: !!at, custom: true }); }
  for (const [id, a] of Object.entries(APIS)) out.push({ id: 'api:' + id, kind: 'api', name: a.name, short: (a.short || a.name) + ' (API key)', ready: !!keys[id] && (id !== 'custom' || !!(cfg.engineBases || {}).custom), hasKey: !!keys[id] });
  if (role === 'desktop') out.push({ id: 'gateway', kind: 'gateway', name: 'Company AI (gateway)', short: 'Company AI (gateway)', ready: !!cfg.apiKey });
  return out;
}
/** The engine chosen for a window: { id, model } (default: our trained AI). Tulai Desktop's old "AI source = company AI" still counts. */
function chosen(cfg = {}, role = 'bot') {
  const e = cfg.engine && cfg.engine[role];
  if (e && e.id) return { id: e.id, model: e.model || '' };
  if (role === 'desktop' && cfg.aiSource === 'gateway') return { id: 'gateway', model: '' };
  return { id: 'tulai', model: '' };
}
const label = (cfg, role) => { const c = chosen(cfg, role), e = list(cfg, role).find((x) => x.id === c.id); return (e ? e.name : c.id) + (c.model ? ` · ${c.model}` : ''); };
/** A short engine tag for the usage page: local | gguf | claude | codex | groq | gateway ... */
const usageTag = (id) => (id === 'tulai' ? 'local' : id === 'gateway' ? 'company' : id.startsWith('gguf:') ? 'gguf' : id === 'api:gemini' ? 'gemini_api' : id.replace(/^(?:cli|api):/, ''));

/** Words you might say for each engine ("use claude", "switch to chatgpt", "gamitin ang groq"). */
function find(cfg, role, said) {
  const s = String(said || '').toLowerCase().trim(), all = list(cfg, role);
  if (/^(?:default|tulai|our (?:own )?(?:ai|brain|model)|the default|local|qwen ?2\.?5(?:[- ]?3b)?|our trained (?:ai|brain))$/.test(s)) return all[0];
  const alias = { chatgpt: 'cli:codex', codex: 'cli:codex', 'openai codex': 'cli:codex', claude: 'cli:claude', 'claude code': 'cli:claude', 'qwen code': 'cli:qwen', qwen: 'cli:qwen', gemini: 'cli:gemini', 'gemini cli': 'cli:gemini', 'company ai': 'gateway', gateway: 'gateway',
    groq: 'api:groq', openrouter: 'api:openrouter', 'openai api': 'api:openai', 'anthropic api': 'api:anthropic', deepseek: 'api:deepseek', mistral: 'api:mistral', dashscope: 'api:dashscope', 'model studio': 'api:dashscope', 'gemini api': 'api:gemini', grok: 'api:xai', xai: 'api:xai', together: 'api:together' };
  if (alias[s]) return all.find((x) => x.id === alias[s]) || null;
  return all.find((x) => x.id === s || x.id.endsWith(':' + s)) || all.find((x) => x.kind === 'gguf' && x.name.toLowerCase().includes(s)) || all.find((x) => x.name.toLowerCase().startsWith(s)) || null;
}

// ----- running a command-line AI as if it were a streaming chat model -----
const MCP_FILE = () => path.join(process.env.GC_DATA_DIR || path.join(home(), 'Library', 'Application Support', 'gateway-chat'), 'engine-mcp.json');
/** Tulai's browser as tools for the command-line AIs (open a page, read it, snapshot), so they can check their own work. */
function mcpConfig() {
  const script = path.join(__dirname, 'browser-mcp.js'), runner = process.env.TULAI_NODE || process.execPath;
  const conf = { mcpServers: { 'tulai-browser': { command: runner, args: [script], env: { ELECTRON_RUN_AS_NODE: '1', GC_DATA_DIR: process.env.GC_DATA_DIR || '' } } } };
  try { fs.writeFileSync(MCP_FILE(), JSON.stringify(conf), { mode: 0o600 }); return MCP_FILE(); } catch { return ''; }
}
/** The conversation as one prompt (command-line AIs take a single prompt): the last turns, then the request. */
function promptOf(messages) {
  const sys = messages.filter((m) => m.role === 'system').map((m) => text(m.content)).join('\n\n');
  const turns = messages.filter((m) => m.role === 'user' || (m.role === 'assistant' && text(m.content))).slice(-12);
  const last = turns.pop(), before = turns.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${text(m.content).slice(0, 2000)}`).join('\n\n');
  return { system: sys, prompt: (before ? `Conversation so far:\n${before}\n\n---\n\n` : '') + text(last && last.content) };
}
function text(c) { return typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n') : ''; }
function argsFor(id, { system, prompt, model, mode, mcp, cwd }, cfg) {
  const edit = mode === 'auto' || mode === 'edits';
  if (id === 'claude') return ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...(system ? ['--append-system-prompt', system.slice(0, 8000)] : []), ...(model ? ['--model', model] : []), ...(mcp ? ['--mcp-config', mcp] : []),
    '--permission-mode', edit ? 'acceptEdits' : 'default', '--allowedTools', ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'mcp__tulai-browser', ...(edit ? ['Edit', 'Write', 'MultiEdit', 'Bash'] : [])].join(','), '--disallowedTools', 'Bash(git push:*),Bash(git push)'];
  if (id === 'codex') return ['exec', '--json', '--skip-git-repo-check', '-C', cwd, '--sandbox', edit ? 'workspace-write' : 'read-only', ...(model ? ['-m', model] : []),
    ...(mcp ? ['-c', `mcp_servers.tulai-browser.command=${JSON.stringify(JSON.parse(fs.readFileSync(mcp, 'utf8')).mcpServers['tulai-browser'].command)}`, '-c', `mcp_servers.tulai-browser.args=${JSON.stringify([path.join(__dirname, 'browser-mcp.js')])}`, '-c', 'mcp_servers.tulai-browser.env={ELECTRON_RUN_AS_NODE="1"}'] : []), (system ? system.slice(0, 4000) + '\n\n' : '') + prompt];
  if (id === 'qwen' || id === 'gemini') return [...(model ? ['-m', model] : []), '-p', (system ? system.slice(0, 4000) + '\n\n' : '') + prompt];
  const c = customCLIs(cfg).find((x) => x.id === id); const full = (system ? system.slice(0, 4000) + '\n\n' : '') + prompt;
  return (Array.isArray(c && c.args) && c.args.length ? c.args : ['{prompt}']).map((a) => String(a).split('{prompt}').join(full).split('{model}').join(model || ''));
}
/** What a command-line AI printed, as text and progress notes: Claude stream-json, Codex --json, or plain text from the others. */
function parser(id, onText, onNote) {
  let buf = '', plain = id !== 'claude' && id !== 'codex', said = '';
  const line = (l) => {
    let j; try { j = JSON.parse(l); } catch { if (l.trim()) onText(l + '\n'); return; }
    if (id === 'claude') {
      if (j.type === 'assistant' && j.message && Array.isArray(j.message.content)) for (const c of j.message.content) { if (c.type === 'text' && c.text) { onText(c.text); said += c.text; } else if (c.type === 'tool_use') onNote(`${c.name.replace(/^mcp__tulai-browser__/, 'browser: ')} ${JSON.stringify(c.input || {}).slice(0, 120)}`); }
      if (j.type === 'result' && j.result && !said) onText(j.result);
      return;
    }
    const it = j.item || j.msg || j; const t = it.type || '';
    if (/agent_message/.test(t) && (it.text || it.message)) onText(it.text || it.message);
    else if (/command_execution|exec_command|mcp_tool_call|tool_call|web_search/.test(t)) onNote(`${t.replace(/_/g, ' ')} ${String(it.command || it.tool || it.query || '').slice(0, 120)}`);
  };
  return { push(chunk) { if (plain) { onText(chunk.toString('utf8')); return; } buf += chunk.toString('utf8'); const ls = buf.split('\n'); buf = ls.pop(); for (const l of ls) line(l); }, end() { if (!plain && buf) line(buf); } };
}
/** Runs the command-line AI and returns a response that looks like an OpenAI streaming reply (what Tulai's agent reads). */
function cliUpstream(cfg, eng, body, signal, { mode, cwd } = {}) {
  const id = eng.id.slice(4), def = CLIS[id], custom = customCLIs(cfg).find((x) => x.id === id);
  const bin = def ? which(def.bin) : custom && (custom.command.includes('/') ? custom.command : which(custom.command));
  const out = new Readable({ read() {} }); out.statusCode = 200; out.headers = { 'content-type': 'text/event-stream' };
  const sse = (delta) => out.push(`data: ${JSON.stringify({ choices: [{ delta, index: 0 }] })}\n\n`);
  const finish = (reason) => { out.push(`data: ${JSON.stringify({ choices: [{ delta: {}, index: 0, finish_reason: reason || 'stop' }] })}\n\ndata: [DONE]\n\n`); out.push(null); };
  if (!bin) { setImmediate(() => { sse({ content: def ? `Log in to ${def.name} first: say **log in to ${id}** (a terminal opens here and sets it up), then ask again.` : `${custom.command} was not found on this Mac.` }); finish(); }); return out; }
  if (def && !def.loggedIn()) { setImmediate(() => { sse({ content: `You are not logged in to ${def.name} yet. Say **open terminal ${id}** and log in there (\`${def.login}\`), then ask again.` }); finish(); }); return out; }
  const work = cwd && exists(cwd) ? cwd : home(), mcp = (id === 'claude' || id === 'codex') ? mcpConfig() : '';
  const args = argsFor(id, { ...promptOf(body.messages || []), model: eng.model, mode, mcp, cwd: work }, cfg);
  const env = { ...process.env, PATH: userPath() }; delete env.ELECTRON_RUN_AS_NODE; delete env.ANTHROPIC_API_KEY; delete env.OPENAI_API_KEY; // your logged-in subscription, never a key from Tulai's own settings
  const child = cp.spawn(bin, args, { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] }); let err = '', any = false, said = '';
  const p = parser(id, (t) => { any = true; said += t; if (said.length > 4000) said = said.slice(-4000); sse({ content: t }); }, (n) => sse({ reasoning_content: n + '\n' }));
  child.stdout.on('data', (c) => p.push(c)); child.stderr.on('data', (c) => { err += c.toString('utf8'); if (err.length > 8000) err = err.slice(-8000); });
  const kill = () => { try { child.kill('SIGTERM'); } catch {} }; if (signal) signal.addEventListener('abort', kill, { once: true });
  child.on('error', (e) => { sse({ content: `Could not start ${bin}: ${e.message}` }); finish(); });
  child.on('close', (code) => { p.end(); if (!any) sse({ content: code ? `${def ? def.name : id} stopped (exit ${code}): ${err.trim().split('\n').slice(-3).join(' ').slice(0, 400) || 'no output'}` : '(no answer)' });
    if (def && /\b(?:authenticat\w*|oauth|session expired|expired|not logged in|log ?in|login|unauthori[sz]ed|invalid api key)\b/i.test(said + ' ' + err) && (code || said.length < 400)) sse({ content: `\n\nYour ${def.name} login needs renewing: say **log in to ${id}** (a terminal opens here), finish the login, then ask again.` });
    finish(); });
  return out;
}

module.exports = { loginCmd, TOOLS_DIR, APIS, CLIS, list, chosen, label, find, usageTag, which, userPath, cliUpstream, promptOf, argsFor, parser, mcpConfig };
