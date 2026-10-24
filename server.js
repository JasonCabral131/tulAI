// Local proxy + static server for the Gateway Chat UI. No dependencies.
const http = require('http');
const os = require('os');
const snapshots = require('./snapshots');
const shots = require('./shots');
const store = require('./store');
const diagnostics = require('./diagnostics');
const mcp = require('./mcp');
const missions = require('./missions');
const converse = require('./converse');
const bridge = require('./bridge');
const { runAgent, resolveApproval, gitEnv, restoreCheckpoint, policyBlock, loadSkills } = require('./agent');
const { spawn, execFile } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3939;
// Tulai runs as two separate processes: Tulai Desktop (this chat UI and the company AI) and Tulai Bot (voice, local engine, missions, chat apps).
const ROLE = process.env.TULAI_ROLE === 'bot' ? 'bot' : 'desktop', BOT_PORT = +(process.env.TULAI_BOT_PORT || 39393);
const voiceClients = new Set();
global.__tulaiVoiceEvents = (ev) => { const line = `data: ${JSON.stringify(ev)}\n\n`; for (const c of voiceClients) { try { c.write(line); } catch { voiceClients.delete(c); } } };
function proxyToBot(req, res) { // the Desktop UI talks to the always-on bot through here
  const h = { ...req.headers, host: `127.0.0.1:${BOT_PORT}` }; delete h.origin; delete h.referer; // the bot only accepts its own pages; Desktop speaks for itself
  const p = http.request({ host: '127.0.0.1', port: BOT_PORT, path: req.url, method: req.method, headers: h }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on('error', () => { if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Tulai Bot is not running. Open it from the menu bar icon, or start it again.' } })); } else res.end(); });
  res.on('close', () => p.destroy()); req.pipe(p);
}
const CONFIG_FILE = path.join(process.env.GC_DATA_DIR || __dirname, 'config.json');
const PUBLIC = path.join(__dirname, 'public');

const defaults = {
  baseUrl: process.env.ANTHROPIC_FOUNDRY_BASE_URL || 'https://llm.np.mbtc.mgc.local',
  apiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY || '',
  caFile: '',
  insecureTls: false,
  models: {
    opus: 'framework-claude-opus-4-6',
    sonnet: 'framework-claude-sonnet-4-6',
    haiku: 'framework-claude-haiku-4-5',
  },
  maxTokens: 8000,
  temperature: 0.7,
  system: '',
  workspace: os.homedir(),
  agent: true,
  interaction: 'quality', // conversation uses Sonnet or better (Opus for hard moments); 'saver' lets short chat use Haiku
  mode: 'ask',
  effort: 'medium',
  contextMode: true,
  skillDirs: [],
  mcpServers: [],
  telegram: { enabled: false, token: '', allowed: [], pairCode: '', mode: 'ask' },
  slack: { enabled: false, appToken: '', botToken: '', allowed: [], pairCode: '', mode: 'ask' },
  stallSeconds: 300,
  maxRunTokens: 800000,
  maxRunMinutes: 15,
  notify: true,
  computerDenyApps: [],
  features: {},
  diag: null,
  price: { input: 0, cached: 0, output: 0 },
  snapshots: true,
  jira: { baseUrl: '', auth: 'cloud', email: '', token: '' },
  gitlab: { baseUrl: 'https://gitlab.com', token: '' },
  lead: { projects: [] }, // Jira projects the team reports cover (blank = the projects of your own open tickets)
  aiSource: 'local', // Tulai Desktop's brain: 'local' = our trained AI on this Mac (default); 'gateway' = the company AI, only if you switch it on in Settings
  botModel: { provider: 'local', apiKey: '', model: '', baseUrl: '' }, // which brain Tulai Bot uses; the embedded model unless you pick an online one
  githubToken: '',
  githubApi: 'https://api.github.com',
  githubHost: 'github.com',
  gitName: '',
  gitEmail: '',
  permissions: {
    confineWrites: true,
    readOnlyPaths: [],
    alwaysAskPaths: ['.gitlab-ci.yml', 'azure-pipelines.yml', '.github/', '.husky/', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'eslint.config.js', 'eslint.config.mjs', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts', 'jest.config.js', 'Dockerfile'],
    denyPaths: ['~/.ssh', '~/.aws', '~/.gnupg', '~/.config/gcloud', '~/Library/Keychains', '~/Library/Cookies', '.env', 'id_rsa', 'id_ed25519'],
    blockCommands: ['sudo ', 'rm -rf /', 'rm -rf ~', 'rm -rf $HOME', 'mkfs', 'dd if=', ':(){', 'chmod -R 777 /', '| sh', '| bash', '| zsh', 'git push --force', 'git push -f', 'shutdown', 'reboot', 'diskutil erase', 'launchctl', 'printenv', 'GITHUB_TOKEN', 'GH_TOKEN', 'askpass'],
    allowCommands: ['git status', 'git diff', 'git log', 'git branch', 'ls', 'pwd', 'cat ', 'head ', 'tail ', 'wc ', 'which ', 'node -v', 'npm -v', 'npm test', 'npm run test', 'npm run lint', 'npm run build', 'python3 --version'],
  },
};

function loadConfig() {
  try { const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); return { ...defaults, ...saved, permissions: { ...defaults.permissions, ...(saved.permissions || {}) } }; }
  catch { return { ...defaults }; }
}
try { require('./nlu').setModelSource(() => loadConfig().botModel); } catch {}
function saveConfig(c) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2), { mode: 0o600 }); try { fs.chmodSync(CONFIG_FILE, 0o600); } catch {} // settings hold tokens: owner only, even if the file already existed
}
try { if (fs.existsSync(CONFIG_FILE)) fs.chmodSync(CONFIG_FILE, 0o600); } catch {}

function agentFor(cfg) {
  const opts = { keepAlive: true };
  if (cfg.insecureTls) opts.rejectUnauthorized = false;
  else if (cfg.caFile && fs.existsSync(cfg.caFile)) opts.ca = fs.readFileSync(cfg.caFile);
  return new https.Agent(opts);
}

const LOCAL_BRAIN = () => `http://127.0.0.1:${+(process.env.TULAY_LLM_PORT || 39656)}`;
/** A chat that belongs to Tulai Bot (its conversation, its self-tests): never shown in Tulai Desktop. */
const isBotChat = (c) => !!c && (c.owner === 'bot' || /^(?:bot-|qa-)/.test(String(c.id || '')));
const usesLocal = (cfg) => ROLE === 'bot' || (cfg.aiSource || 'local') !== 'gateway'; // Tulai Bot ALWAYS uses our trained AI; Tulai Desktop does too unless you pick the company AI in Settings → Connection
/** Our trained AI runs in Tulai Bot (llama.cpp, OpenAI-compatible). Ask the bot to start it if it is not up yet. */
async function wakeLocalBrain() { try { await fetch(`http://127.0.0.1:${BOT_PORT}/api/bot/brain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(90000) }); } catch {} }
/** Sends a chat to the AI chosen for this window (engines.js): our trained brain by default; a downloaded model, a logged-in subscription tool,
 a provider with an API key, or (Tulai Desktop only, when you choose it) the company AI. Tulai Bot never uses the company AI. */
function upstream(cfg, method, p, body, signal) {
  const E = require('./engines'), eng = E.chosen(cfg, ROLE);
  if (eng.id.startsWith('cli:')) return Promise.resolve(E.cliUpstream(cfg, eng, body || {}, signal, cfg.run || {}));
  if (eng.id.startsWith('api:')) return apiUpstream(cfg, eng, method, p, body, signal);
  if (eng.id.startsWith('gguf:')) return ggufUpstream(eng, method, p, body, signal);
  if (eng.id === 'gateway' && ROLE !== 'bot') return gatewayUpstream(cfg, method, p, body, signal);
  return localUpstream(method, p, body, signal);
}
const sayStream = (text) => { const { Readable } = require('stream'), r = new Readable({ read() {} }); r.statusCode = 200; r.headers = {}; r.push(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`); r.push(null); return r; };
/** A provider with an API key (OpenAI-compatible): Groq, OpenRouter, OpenAI, Anthropic, DeepSeek, Mistral, Qwen Model Studio, Gemini, xAI, Together, or your own address. */
function apiUpstream(cfg, eng, method, p, body, signal) {
  const E = require('./engines'), id = eng.id.slice(4), a = E.APIS[id] || {}, key = (cfg.engineKeys || {})[id], base = String(id === 'custom' ? (cfg.engineBases || {}).custom || '' : a.base || '').replace(/\/+$/, '');
  if (!key || !base) return Promise.resolve(sayStream(`${a.name || id} needs ${base ? 'its API key' : 'an address and an API key'}: add it in Settings → AI engines (or say **use our AI** to go back to the default).`));
  if (!eng.model) return Promise.resolve(sayStream(`Pick a ${a.name || id} model first: say **${id} models** to list them, then **use ${id} <model>**.`));
  if (body && typeof body === 'object') { body = { ...body, model: eng.model }; delete body.thinking; delete body.reasoning_effort; delete body.effort; }
  const u = new URL(base + String(p).replace(/^\/v1(?=\/)/, '')), data = body ? Buffer.from(JSON.stringify(body)) : null;
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(id === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : {}), ...(data ? { 'Content-Length': data.length } : {}) };
  return new Promise((resolve, reject) => { const req = https.request(u, { method, headers, signal }, resolve); req.on('error', reject); if (data) req.write(data); req.end(); });
}
/** A model you downloaded from Hugging Face, run on this Mac by Tulai Bot (hf-models.js) on its own port. */
async function ggufUpstream(eng, method, p, body, signal) {
  const file = eng.id.slice(5), H = require('./hf-models');
  try { if (ROLE === 'bot') await H.ensure(file); else { const r = await fetch(`http://127.0.0.1:${BOT_PORT}/api/bot/hf/ensure`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file }), signal: AbortSignal.timeout(180000) }); const j = await r.json(); if (!r.ok) throw Error(j.error?.message || 'could not start it'); } }
  catch (e) { return sayStream(`I could not start ${require('path').basename(file)}: ${e.message}`); }
  if (body && typeof body === 'object') { body = fitLocal({ ...body }, 16384); delete body.model; delete body.thinking; delete body.reasoning_effort; delete body.effort; }
  const u = new URL(p, `http://127.0.0.1:${H.PORT}/`), data = body ? Buffer.from(JSON.stringify(body)) : null, headers = { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': data.length } : {}) };
  return new Promise((resolve, reject) => { const req = http.request(u, { method, headers, signal }, resolve); req.on('error', reject); if (data) req.write(data); req.end(); });
}
const { fitLocal, needsLong, LOCAL_CTX, LONG_CTX } = require('./local-fit');
const LONG_BRAIN = () => `http://127.0.0.1:${+(process.env.TULAY_LLM_PORT || 39656) + 1}`;
/** Starts (or keeps alive) the 100K copy of our brain; in Tulai Desktop it asks Tulai Bot, which runs the brains. */
async function wakeLongBrain() { if (ROLE === 'bot') return require('./nlu').ensureLong().catch(() => false); try { const r = await fetch(`http://127.0.0.1:${BOT_PORT}/api/bot/brain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ long: true }), signal: AbortSignal.timeout(120000) }); return r.ok; } catch { return false; } }
async function localUpstream(method, p, body, signal, retried) {
  if (body && typeof body === 'object') { body = { ...body }; delete body.thinking; delete body.reasoning_effort; delete body.effort; } // not llama.cpp options
  let long = false; if (body && Array.isArray(body.messages)) { long = needsLong(body); body = fitLocal(body, long ? LONG_CTX : LOCAL_CTX); } // everyday requests: the 32K brain; only big ones go to the 100K copy
  if (long) { const ok = await wakeLongBrain(); if (!ok) { long = false; body = fitLocal(body, LOCAL_CTX); } }
  if (body && Array.isArray(body.messages)) body.messages = body.messages.map((m) => !Array.isArray(m.content) ? m : { ...m, content: m.content.map((c) => (c && c.type === 'image_url' ? { type: 'text', text: '[An image is attached. Our trained AI on this Mac cannot see images; describe it in words or switch to the company AI in Settings.]' } : c)) }); // the local model reads text only
  const u = new URL(p, (long ? LONG_BRAIN() : LOCAL_BRAIN()) + '/'), data = body ? Buffer.from(JSON.stringify(body)) : null, headers = { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': data.length } : {}) };
  try {
    return await new Promise((resolve, reject) => { const req = http.request(u, { method, headers, signal }, resolve); req.on('error', reject); if (data) req.write(data); req.end(); });
  } catch (e) {
    if (retried || !/ECONNREFUSED|ECONNRESET/.test(e.code || e.message)) throw Object.assign(new Error('Our trained AI is not running. Open Tulai Bot (it starts the local brain), then try again.'), { code: e.code });
    await wakeLocalBrain(); return localUpstream(method, p, body, signal, true);
  }
}
function gatewayUpstream(cfg, method, p, body, signal) {
  const u = new URL(p, cfg.baseUrl.replace(/\/+$/, '') + '/');
  const mod = u.protocol === 'http:' ? http : https;
  const headers = { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' };
  const data = body ? Buffer.from(JSON.stringify(body)) : null;
  if (data) headers['Content-Length'] = data.length;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method, headers, signal, agent: u.protocol === 'https:' ? agentFor(cfg) : undefined }, resolve);
    req.on('socket', (sock) => { if (sock.connecting) { const t = setTimeout(() => req.destroy(Object.assign(new Error('connect timeout'), { code: 'ETIMEDOUT' })), 10000); sock.once('connect', () => clearTimeout(t)); sock.once('close', () => clearTimeout(t)); } });
    req.setTimeout(((loadConfig().stallSeconds || 300) + 60) * 1000, () => req.destroy(Object.assign(new Error('The gateway stopped responding (no data for several minutes).'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
/** A file name can hold any character (macOS puts a thin space in screenshot names); a header may not, so it is sent the standard way. */
const dispo = (n) => `inline; filename="${String(n).replace(/[^\x20-\x7e]|["\\;]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(String(n))}`;
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const text = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return { title: title.trim(), text };
}

async function fetchPage(target) {
  const u = new URL(target);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs are supported');
  const cfg = loadConfig();
  const mod = u.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = mod.get(u, { headers: { 'User-Agent': 'Mozilla/5.0 GatewayChat' }, agent: u.protocol === 'https:' ? agentFor(cfg) : undefined }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return fetchPage(new URL(r.headers.location, u).href).then(resolve, reject);
      }
      const chunks = []; let size = 0;
      r.on('data', (c) => { size += c.length; if (size < 3e6) chunks.push(c); });
      r.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const isHtml = /html/i.test(r.headers['content-type'] || '');
        const { title, text } = isHtml ? htmlToText(raw) : { title: u.href, text: raw };
        resolve({ url: u.href, status: r.statusCode, title, text: text.slice(0, 40000) });
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error('Timed out')));
    req.on('error', reject);
  });
}

function appendUsage(b) {
  const n = (x) => Math.max(0, Math.round(+x || 0));
  const E = require('./engines'), cfgU = loadConfig(), eng = E.chosen(cfgU, ROLE), tag = b.engine || E.usageTag(eng.id === 'gateway' && ROLE === 'bot' ? 'tulai' : eng.id), local = tag === 'local'; let brain = ''; try { brain = require('./active-model').state().current?.run || ''; } catch {} // which engine really answered: always recorded apart (our trained AI, the company AI, or the engine you picked)
  if (local) b = { ...b, model: 'tulai-local' + (brain ? ' · ' + brain.slice(-6) : '') }; else if (tag !== 'company') b = { ...b, model: (eng.model || E.label(cfgU, ROLE)) };
  const row = { ts: Date.now(), engine: tag, chat: String(b.chat || '').slice(0, 40), title: String(b.title || '').slice(0, 80), workspace: String(b.workspace || '').slice(0, 300), model: String(b.model || '').slice(0, 80), tier: String(b.tier || ''), effort: String(b.effort || ''), mode: String(b.mode || ''), agent: !!b.agent, prompt: n(b.prompt), completion: n(b.completion), cached: n(b.cached), secs: n(b.secs), stopped: !!b.stopped };
  fs.appendFileSync(path.join(process.env.GC_DATA_DIR || __dirname, 'usage.jsonl'), JSON.stringify(row) + '\n');
}
function notify(title, body, chatId) { // desktop notification (Electron only); clicking it opens the chat
  try { const { Notification } = require('electron'); if (Notification && Notification.isSupported()) { const n = new Notification({ title, body: String(body || '').slice(0, 200) }); n.on('click', () => process.emit('tulay:open-chat', chatId)); n.show(); } } catch {}
}
function friendly(e) {
  const host = (() => { try { return new URL(loadConfig().baseUrl).host; } catch { return 'the gateway'; } })();
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(e.code)) return `Can't find ${host}. Connect to the company VPN / network, then retry.`;
  if (['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(e.code)) return `Can't reach ${host} (timed out). Check the company VPN / network, then retry.`;
  if (e.code === 'ECONNREFUSED') return `${host} refused the connection. Check the gateway URL in Settings.`;
  if (/CERT|SELF_SIGNED|ISSUER/i.test(e.code || '')) return 'The gateway certificate is not trusted. In Settings, add the company CA path or tick "Skip TLS verification".';
  return e.message;
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  // Only Tulai's own pages and programs may use the API. A web page on another site (even one the person has open) must not be able to
  // drive this app, so: the Host must be this machine, a browser's Origin must be this same app, and anything that changes state must be
  // JSON (a form or text/plain POST from another site is refused before any code runs).
  if (url.pathname.startsWith('/api/')) {
    const mine = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]); let bad = '';
    if (!mine.has(String(req.headers.host || '').toLowerCase())) bad = 'host';
    else if (req.headers.origin && req.headers.origin !== 'null') { try { if (!mine.has(new URL(req.headers.origin).host.toLowerCase())) bad = 'origin'; } catch { bad = 'origin'; } }
    else if (req.headers.origin === 'null') bad = 'origin';
    else if (!['GET', 'HEAD'].includes(req.method) && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) bad = 'type';
    if (bad) { res.writeHead(bad === 'type' ? 415 : 403, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: bad === 'type' ? 'JSON only.' : 'Not allowed from here.' } })); }
  }
  if (ROLE === 'desktop' && /^\/api\/(missions|bridges|meeting|profile|bot|voice|calendar|health|approvals)(\/|$)/.test(url.pathname)) return proxyToBot(req, res);
  try {
    if (ROLE === 'bot' && url.pathname === '/api/voice/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); res.write(': hi\n\n'); voiceClients.add(res); const hb = setInterval(() => { try { res.write(': \n\n'); } catch {} }, 15000); res.on('close', () => { clearInterval(hb); voiceClients.delete(res); }); return; }
    if (ROLE === 'bot' && url.pathname === '/api/health') { const h = global.__tulaiHealth; try { return json(res, 200, h ? await h() : { ok: false }); } catch (e) { return json(res, 500, { error: { message: e.message } }); } }
    if (ROLE === 'bot' && url.pathname.startsWith('/api/calendar/')) {
      const cmd = url.pathname.slice(14), cal = global.__tulaiCalendar; if (!cal) return json(res, 503, { error: { message: 'Calendar is not ready yet.' } });
      if (cmd === 'snapshot') { const f = await cal('snapshot', url.searchParams.get('id')); if (!f || !fs.existsSync(f)) return json(res, 404, { error: { message: 'No snapshot yet. Check the calendar first.' } }); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); return res.end(fs.readFileSync(f)); }
      const b = req.method === 'POST' ? await readBody(req) : {}; try { const out = await cal(cmd, b); if (out && out.shot) delete out.shot; /* a picture is for the chat, never for this JSON */ return json(res, 200, out); } catch (e) { return json(res, 500, { error: { message: e.message } }); }
    }
    if (ROLE === 'bot' && url.pathname.startsWith('/api/voice/') && req.method === 'POST') { const b = await readBody(req); const out = global.__tulaiVoice ? await global.__tulaiVoice(url.pathname.slice(11), b && b.arg) : null; return json(res, 200, { result: out === undefined ? null : out }); }
    if (url.pathname === '/api/config' && req.method === 'GET') {
      const { apiKey, githubToken, engineKeys, ...rest } = loadConfig(); rest.engineKeyHints = Object.fromEntries(Object.entries(engineKeys || {}).filter(([, v]) => v).map(([k, v]) => [k, '…' + String(v).slice(-4)])); // API keys are never sent back to a page rest.mcpServers = mcp.maskServers(rest.mcpServers); for (const [p, fs_] of [['telegram', ['token']], ['slack', ['appToken', 'botToken']], ['jira', ['token']], ['gitlab', ['token']], ['botModel', ['apiKey']]]) { rest[p] = { ...(rest[p] || {}) }; for (const f of fs_) if (rest[p][f]) rest[p][f] = mcp.MASK; }
      return json(res, 200, { ...rest, aiSource: rest.aiSource || 'local', hasKey: !!apiKey, keyHint: apiKey ? `…${apiKey.slice(-4)}` : '', hasGithub: !!githubToken, ghHint: githubToken ? `…${githubToken.slice(-4)}` : '' });
    }
    if (url.pathname === '/api/config' && req.method === 'POST') {
      const b = await readBody(req);
      const cur = loadConfig();
      if (b.mcpServers) b.mcpServers = mcp.unmaskServers(b.mcpServers, cur.mcpServers);
      for (const [p, fs_] of [['telegram', ['token']], ['slack', ['appToken', 'botToken']], ['jira', ['token']], ['gitlab', ['token']], ['botModel', ['apiKey']]]) if (b[p]) { const inc = { ...b[p] }; delete inc.allowed; delete inc.pairCode; for (const f of fs_) if (inc[f] === mcp.MASK || inc[f] === undefined) inc[f] = (cur[p] || {})[f] || ''; b[p] = { ...(cur[p] || {}), ...inc }; }
      const next = { ...cur, ...b, models: { ...cur.models, ...(b.models || {}) } };
      if (!b.apiKey) next.apiKey = cur.apiKey; // blank = keep existing
      if (!b.githubToken) next.githubToken = cur.githubToken;
      if (b.clearGithub) next.githubToken = '';
      delete next.hasKey; delete next.keyHint; delete next.hasGithub; delete next.ghHint; delete next.clearGithub; delete next.engineKeyHints;
      next.engineKeys = cur.engineKeys; next.engine = cur.engine; // keys and engine choices change only through /api/engines (never overwritten by a settings save)
      if (b.aiSource && b.aiSource !== cur.aiSource) next.engine = { ...(cur.engine || {}), desktop: { id: b.aiSource === 'gateway' ? 'gateway' : 'tulai', model: '' } }; // the old "AI source" switch still works
      saveConfig(next);
      if (b.mcpServers) mcp.configure(next.mcpServers, { agent: () => agentFor(next) });
      if (b.telegram || b.slack) bridge.configure();
      return json(res, 200, { ok: true });
    }
    // ----- AI engines: which AI answers in each window (engines.js), the in-chat terminal (term.js), Hugging Face models (hf-models.js) -----
    if (url.pathname.startsWith('/api/engines') || url.pathname.startsWith('/api/term/') || url.pathname.startsWith('/api/bot/hf/')) {
      const E = require('./engines'), ui = req.headers['x-tulai-ui'] === '1', cfgE = loadConfig(), roleOf = (r) => (r === 'bot' || r === 'desktop' ? r : ROLE);
      if (req.method !== 'GET' && !ui) return json(res, 403, { error: { message: 'Only Tulai can do that.' } }); // changes need Tulai's own page (a header other sites cannot send)
      if (url.pathname === '/api/engines' && req.method === 'GET') { const role = roleOf(url.searchParams.get('role')); return json(res, 200, { role, chosen: E.chosen(cfgE, role), label: E.label(cfgE, role), engines: E.list(cfgE, role) }); }
      if (url.pathname === '/api/engines/choose' && req.method === 'POST') {
        const b = await readBody(req), role = roleOf(b.role), id = String(b.id || ''), eng = E.list(cfgE, role).find((x) => x.id === id);
        if (!eng) return json(res, 400, { error: { message: 'Unknown engine.' } });
        cfgE.engine = { ...(cfgE.engine || {}), [role]: { id, model: String(b.model || '').slice(0, 120) } }; if (role === 'desktop') cfgE.aiSource = id === 'gateway' ? 'gateway' : 'local';
        saveConfig(cfgE); return json(res, 200, { ok: true, chosen: E.chosen(cfgE, role), label: E.label(cfgE, role), ready: eng.ready });
      }
      if (url.pathname === '/api/engines/key' && req.method === 'POST') {
        const b = await readBody(req), id = String(b.provider || ''); if (!E.APIS[id]) return json(res, 400, { error: { message: 'Unknown provider.' } });
        cfgE.engineKeys = { ...(cfgE.engineKeys || {}) }; if (b.key === null || b.key === '') delete cfgE.engineKeys[id]; else if (typeof b.key === 'string' && b.key.trim()) cfgE.engineKeys[id] = b.key.trim();
        if (id === 'custom' && typeof b.base === 'string') cfgE.engineBases = { ...(cfgE.engineBases || {}), custom: b.base.trim() };
        saveConfig(cfgE); return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/engines/models' && req.method === 'GET') {
        const id = String(url.searchParams.get('id') || '');
        if (id === 'cli:claude') return json(res, 200, { models: ['sonnet', 'opus', 'haiku'] });
        if (!id.startsWith('api:')) return json(res, 200, { models: [] });
        const p = id.slice(4), key = (cfgE.engineKeys || {})[p], base = String(p === 'custom' ? (cfgE.engineBases || {}).custom || '' : (E.APIS[p] || {}).base || '').replace(/\/+$/, '');
        if (!key || !base) return json(res, 400, { error: { message: 'Add the API key first.' } });
        try { const r = await fetch(base + '/models', { headers: { Authorization: `Bearer ${key}`, ...(p === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : {}) }, signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (!r.ok) throw Error(j.error?.message || `HTTP ${r.status}`); return json(res, 200, { models: (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean).sort() }); }
        catch (e) { return json(res, 502, { error: { message: `${(E.APIS[p] || {}).name || p}: ${e.message}` } }); }
      }
      const T = require('./term');
      if (url.pathname === '/api/term/start' && req.method === 'POST') { const b = await readBody(req); try { return json(res, 200, T.start({ cmd: E.loginCmd(b.tool || b.install || ''), cols: b.cols, rows: b.rows, cwd: b.cwd && fs.existsSync(b.cwd) ? b.cwd : undefined })); } catch (e) { return json(res, 429, { error: { message: e.message } }); } }
      if (url.pathname === '/api/term/input' && req.method === 'POST') { const b = await readBody(req); try { T.input(b.id, b.data); return json(res, 200, { ok: true }); } catch (e) { return json(res, 410, { error: { message: e.message } }); } }
      if (url.pathname === '/api/term/resize' && req.method === 'POST') { const b = await readBody(req); try { T.resize(b.id, b.cols, b.rows); return json(res, 200, { ok: true }); } catch (e) { return json(res, 410, { error: { message: e.message } }); } }
      if (url.pathname === '/api/term/stop' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, { ok: T.stop(b.id) }); }
      if (url.pathname === '/api/term/stream' && req.method === 'GET') {
        let off; try { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); off = T.watch(url.searchParams.get('id'), (e) => { try { res.write(`data: ${JSON.stringify(e)}\n\n`); if (e.exit !== undefined) res.end(); } catch {} }); } catch (e) { res.write(`data: ${JSON.stringify({ exit: -1, error: e.message })}\n\n`); return res.end(); }
        req.on('close', () => off && off()); return;
      }
      if (ROLE === 'bot' && url.pathname.startsWith('/api/bot/hf/')) { // one downloader and one model server for both windows (Tulai Desktop forwards these here)
        const H = require('./hf-models');
        try {
          if (url.pathname === '/api/bot/hf/search' && req.method === 'GET') return json(res, 200, { results: await H.search(url.searchParams.get('q')), maxGB: H.gb(H.maxBytes()) });
          if (url.pathname === '/api/bot/hf/status' && req.method === 'GET') return json(res, 200, { jobs: H.allStatus(), downloaded: H.downloaded() });
          if (url.pathname === '/api/bot/hf/download' && req.method === 'POST') { const b = await readBody(req); H.download(b.item); return json(res, 200, { status: H.status(b.item.repo) }); }
          if (url.pathname === '/api/bot/hf/cancel' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, { ok: H.cancel(b.repo) }); }
          if (url.pathname === '/api/bot/hf/remove' && req.method === 'POST') { const b = await readBody(req), ok = H.remove(b.file), c = loadConfig(); let reset = false; for (const r of ['bot', 'desktop']) if (c.engine && c.engine[r] && c.engine[r].id === 'gguf:' + b.file) { c.engine[r] = { id: 'tulai', model: '' }; reset = true; } if (reset) saveConfig(c); return json(res, 200, { ok, reset }); } // a window that used it goes back to our trained AI
          if (url.pathname === '/api/bot/hf/ensure' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, { base: await H.ensure(b.file) }); }
        } catch (e) { return json(res, 400, { error: { message: e.message } }); }
      }
    }
    if (url.pathname === '/api/botmodel' && req.method === 'GET') { const nlu = require('./nlu'); return json(res, 200, { presets: Object.fromEntries(Object.entries(nlu.PRESETS).map(([k, v]) => [k, { name: v.name, model: v.model, base: v.base, keyless: !!v.keyless }])), brain: nlu.brain() }); }
    if (url.pathname === '/api/botmodel/test' && req.method === 'POST') { const b = await readBody(req), cur = loadConfig().botModel || {}, m = { ...(b.botModel || {}) }; if (!m.apiKey || m.apiKey === mcp.MASK) m.apiKey = cur.apiKey || ''; return json(res, 200, await require('./nlu').testModel(m)); }
    if (url.pathname === '/api/work/test' && req.method === 'POST') { const b = await readBody(req); try { return json(res, 200, { ok: true, message: await require('./work').test(loadConfig(), b.kind === 'gitlab' ? 'gitlab' : 'jira') }); } catch (e) { return json(res, 200, { ok: false, message: e.message }); } }
    if (url.pathname === '/api/work/status') return json(res, 200, require('./work').connected(loadConfig()));
    if (url.pathname === '/api/engine/pick' && req.method === 'POST') { const b = await readBody(req), cfg = loadConfig(); return json(res, 200, require('./engine').pick(String(b.text || '').slice(0, 4000), { saver: cfg.interaction === 'saver' })); }
    if (url.pathname === '/api/models') {
      const r = await upstream(loadConfig(), 'GET', '/v1/models');
      res.writeHead(r.statusCode, { 'Content-Type': 'application/json' });
      return r.pipe(res);
    }
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      const b = await readBody(req);
      if (Array.isArray(b.messages)) b.messages = b.messages.map((m) => !Array.isArray(m.content) ? m : { ...m, content: m.content.map((p) => { const u = String(p.image_url?.url || ''); if (p.type !== 'image_url' || !(u.startsWith('media://') || u.startsWith('shot://'))) return p; const d = u.startsWith('media://') ? store.mediaDataUrl(u.slice(8)) : shots.dataUrl(u.slice(7)); return d ? { type: 'image_url', image_url: { url: d } } : { type: 'text', text: '[image no longer available]' }; }) });
      const r = await upstream(loadConfig(), 'POST', '/v1/chat/completions', b);
      res.writeHead(r.statusCode, { 'Content-Type': r.headers['content-type'] || 'application/json', 'Cache-Control': 'no-cache' });
      return r.pipe(res);
    }
    if (url.pathname === '/api/fetch-url' && req.method === 'POST') {
      const { url: target } = await readBody(req);
      return json(res, 200, await fetchPage(target));
    }
    if (url.pathname === '/api/agent' && req.method === 'POST') {
      const b = await readBody(req);
      { const last = [...(b.messages || [])].reverse().find((m) => m.role === 'user'), said = last && (typeof last.content === 'string' ? last.content : Array.isArray(last.content) ? last.content.filter((c) => c.type === 'text').map((c) => c.text).join(' ') : '');
        const er = said && said.length < 200 ? await require('./engine-rules').handle(said, { role: ROLE, cfg: loadConfig(), save: saveConfig }).catch(() => null) : null;
        if (er) { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); const ev = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`); ev({ type: 'text', delta: er.reply }); if (er.terminal) ev({ type: 'terminal', tool: er.terminal.tool || '', install: er.terminal.install || '' }); ev({ type: 'done', usage: null }); return res.end(); } } // "use claude", "search model ...", "open terminal": answered here, no AI needed
      return runAgent({ upstream, fetchPage, agentFor, cfg: loadConfig(), body: b, res });
    }
    if (url.pathname === '/api/approve' && req.method === 'POST') {
      const b = await readBody(req);
      return json(res, 200, { ok: resolveApproval(b.id, b.decision) });
    }
    if (url.pathname === '/api/check-dir' && req.method === 'POST') {
      const b = await readBody(req);
      try { return json(res, 200, { ok: fs.statSync(b.path).isDirectory() }); } catch { return json(res, 200, { ok: false }); }
    }
    if (url.pathname === '/api/github/test') {
      const cfg = loadConfig();
      if (!cfg.githubToken) return json(res, 400, { error: { message: 'No GitHub token saved' } });
      const u = new URL(cfg.githubApi.replace(/\/+$/, '') + '/user');
      const r = await new Promise((resolve, reject) => (u.protocol === 'http:' ? http : https).get(u, { headers: { Authorization: `Bearer ${cfg.githubToken}`, 'User-Agent': 'GatewayChat', Accept: 'application/vnd.github+json' }, agent: u.protocol === 'https:' ? agentFor(cfg) : undefined }, resolve).on('error', reject));
      let b = ''; for await (const c of r) b += c;
      let j = {}; try { j = JSON.parse(b); } catch {}
      if (r.statusCode !== 200) return json(res, 502, { error: { message: `GitHub ${r.statusCode}: ${j.message || 'request failed'}` } });
      return json(res, 200, { login: j.login, name: j.name });
    }
    if (url.pathname === '/api/tree') {
      const cfg = loadConfig(), ws = cfg.workspace, rel = url.searchParams.get('path') || '';
      const dir = path.resolve(ws, rel);
      if (policyBlock('list_dir', { path: dir }, ws, cfg.permissions)) return json(res, 403, { error: { message: 'Protected path' } });
      const ents = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !['.git', '.DS_Store', 'node_modules'].includes(e.name))
        .sort((a, b) => b.isDirectory() - a.isDirectory() || a.name.localeCompare(b.name)).slice(0, 500)
        .map((e) => ({ name: e.name, dir: e.isDirectory(), path: path.relative(ws, path.join(dir, e.name)) }));
      return json(res, 200, { root: ws, entries: ents });
    }
    if (url.pathname === '/api/file') {
      const cfg = loadConfig(), f = path.resolve(cfg.workspace, url.searchParams.get('path') || '');
      if (policyBlock('read_file', { path: f }, cfg.workspace, cfg.permissions)) return json(res, 403, { error: { message: 'Protected path' } });
      const st = fs.statSync(f); if (st.size > 1e6) return json(res, 200, { path: f, text: '(file larger than 1 MB)' });
      return json(res, 200, { path: f, text: fs.readFileSync(f, 'utf8') });
    }
    if (url.pathname === '/api/git') {
      const cfg = loadConfig(), env = { ...process.env, ...gitEnv(cfg) };
      const git = (args) => new Promise((resolve) => execFile('git', args, { cwd: cfg.workspace, env, maxBuffer: 8e6, timeout: 20000 }, (e, so, se) => resolve({ ok: !e, out: so, err: se })));
      const [br, st, df] = await Promise.all([git(['rev-parse', '--abbrev-ref', 'HEAD']), git(['status', '--porcelain']), git(['diff', 'HEAD', '--no-color'])]);
      if (!br.ok) return json(res, 200, { repo: false });
      const files = st.out.split('\n').filter(Boolean).map((l) => ({ status: l.slice(0, 2).trim() || '?', path: l.slice(3) }));
      return json(res, 200, { repo: true, branch: br.out.trim(), files, diff: df.out.slice(0, 400000) });
    }
    if (url.pathname === '/api/exec' && req.method === 'POST') {
      const b = await readBody(req), cfg = loadConfig();
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const p = spawn('/bin/zsh', ['-lc', b.command], { cwd: cfg.workspace, detached: true, env: { ...process.env, TERM: 'dumb', ...gitEnv(cfg) } });
      const send = (o) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };
      p.stdout.on('data', (d) => send({ out: d.toString() })); p.stderr.on('data', (d) => send({ out: d.toString() }));
      p.on('error', (e) => { send({ out: e.message }); send({ exit: -1 }); res.end(); });
      p.on('close', (code) => { send({ exit: code }); res.end(); });
      res.on('close', () => { try { process.kill(-p.pid, 'SIGKILL'); } catch { p.kill('SIGKILL'); } });
      return;
    }
    if (url.pathname === '/api/restore' && req.method === 'POST') {
      const b = await readBody(req);
      try { return json(res, 200, { path: restoreCheckpoint(b.id) }); } catch { return json(res, 404, { error: { message: 'No checkpoint for this edit' } }); }
    }
    if (url.pathname === '/api/skills') return json(res, 200, loadSkills(loadConfig().workspace, loadConfig().skillDirs || []).map(({ name, description, source, suite, command }) => ({ name, description, source, suite: !!suite, command })));
    if (url.pathname === '/api/snapshots' && req.method === 'GET') return json(res, 200, await snapshots.list(loadConfig().workspace));
    if (url.pathname === '/api/snapshots' && req.method === 'POST') {
      const b = await readBody(req);
      try { return json(res, 200, await snapshots.create(loadConfig().workspace, b.label || 'manual snapshot')); } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/snapshots/restore' && req.method === 'POST') {
      const b = await readBody(req);
      try { return json(res, 200, await snapshots.restore(loadConfig().workspace, b.hash)); } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/snapshots/diff') {
      try { return json(res, 200, { text: await snapshots.diffStat(loadConfig().workspace, url.searchParams.get('hash')) }); } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/commands') {
      const ws = loadConfig().workspace, out = [];
      for (const d of [path.join(ws, '.claude', 'commands'), path.join(os.homedir(), '.claude', 'commands')]) {
        try { for (const f of fs.readdirSync(d)) if (f.endsWith('.md')) { const body = fs.readFileSync(path.join(d, f), 'utf8'); const name = f.slice(0, -3); if (!out.some((c) => c.name === name)) out.push({ name, body, desc: (body.replace(/^---[\s\S]*?---\s*/, '').split('\n')[0] || '').slice(0, 80) }); } } catch {}
      }
      return json(res, 200, out);
    }
    if (url.pathname === '/api/clone' && req.method === 'POST') {
      const b = await readBody(req);
      const m = String(b.url || '').match(/^(https?:\/\/|git@|ssh:\/\/)[^\s]+$/);
      if (!m) return json(res, 400, { error: { message: 'Enter an https:// or git@ repository URL' } });
      const name = b.url.replace(/\/+$/, '').split(/[\/:]/).pop().replace(/\.git$/, '') || 'repo';
      const dest = path.join(os.homedir(), 'GatewayChat', 'repos', name);
      if (fs.existsSync(dest)) return json(res, 200, { path: dest, existed: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      const env = { ...process.env, ...gitEnv(loadConfig()) };
      if (loadConfig().insecureTls) env.GIT_SSL_NO_VERIFY = '1';
      const out = await new Promise((resolve) => require('child_process').execFile('git', ['clone', '--depth', '50', '--', b.url, dest], { env, timeout: 300000 }, (err, so, se) => resolve({ err, msg: se || so })));
      if (out.err) return json(res, 500, { error: { message: String(out.msg || out.err.message).slice(0, 500) } });
      return json(res, 200, { path: dest });
    }
    if (url.pathname.startsWith('/shots/')) {
      const f = shots.shotFile(path.basename(url.pathname, '.png'));
      if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' }); return fs.createReadStream(f).pipe(res);
    }
    if (url.pathname === '/api/chats' && req.method === 'GET') return json(res, 200, ROLE === 'bot' ? store.listChats() : store.listChats().filter((c) => !isBotChat(c))); // Tulai Desktop never lists the bot's chats
    if (url.pathname.startsWith('/api/chats/') && req.method === 'PUT') { const b = await readBody(req); if (ROLE !== 'bot' && isBotChat({ ...b, id: decodeURIComponent(url.pathname.slice(11)) })) return json(res, 200, { ok: true, skipped: 'a Tulai Bot chat' }); store.saveChat({ ...b, id: decodeURIComponent(url.pathname.slice(11)) }); return json(res, 200, { ok: true }); }
    if (url.pathname.startsWith('/api/chats/') && req.method === 'DELETE') { store.deleteChat(decodeURIComponent(url.pathname.slice(11))); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/storage') return json(res, 200, store.stats());
    if (url.pathname.startsWith('/media/')) {
      const f = store.mediaFile(path.basename(url.pathname));
      if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=86400' }); return fs.createReadStream(f).pipe(res);
    }
    if (url.pathname === '/api/usage' && req.method === 'POST') { appendUsage(await readBody(req)); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/usage') {
      const since = Date.now() - (+url.searchParams.get('days') || 36500) * 864e5; let rows = [];
      try { rows = fs.readFileSync(path.join(process.env.GC_DATA_DIR || __dirname, 'usage.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.ts >= since); } catch {}
      return json(res, 200, rows.slice(-20000));
    }
    if (url.pathname === '/api/diagnostics' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const send = (o) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };
      try {
        const out = await diagnostics.run(loadConfig(), upstream, send);
        saveConfig({ ...loadConfig(), features: out.features, diag: { at: Date.now(), results: out.results } });
        send({ type: 'done', features: out.features, at: Date.now() });
      } catch (e) { send({ type: 'error', message: friendly(e) }); }
      return res.end();
    }
    if (url.pathname === '/api/device/frame') {
      try { const f = await shots.frame(url.searchParams.get('target'), url.searchParams.get('device') || ''); res.writeHead(200, { 'Content-Type': f.mime, 'Cache-Control': 'no-store', 'X-Device-Name': encodeURIComponent(f.name || '') }); return res.end(f.buf); }
      catch (e) { return json(res, 409, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/device/input' && req.method === 'POST') {
      const b = await readBody(req);
      try { return json(res, 200, { text: await shots.deviceInput({ ...b, raw: true }) }); } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/profile') return json(res, 200, require('./profile').insights());
    if (url.pathname === '/api/profile/reset' && req.method === 'POST') return json(res, 200, { ok: require('./profile').reset() });
    if (url.pathname === '/api/meeting/start' && req.method === 'POST') { const b = await readBody(req); return json(res, 200, require('./meeting').start(b && b.title)); }
    if (url.pathname === '/api/meeting/stop' && req.method === 'POST') return json(res, 200, require('./meeting').stop());
    if (url.pathname === '/api/meeting/state') return json(res, 200, { ...require('./meeting').state(), list: require('./meeting').list(), engine: (() => { try { return require('./voice').engine(); } catch { return 'apple'; } })() });
    if (ROLE === 'bot' && url.pathname.startsWith('/api/bot/view') || (ROLE === 'bot' && url.pathname === '/api/bot/thumb') || (ROLE === 'bot' && (url.pathname === '/api/bot/upload' || url.pathname === '/api/bot/upload-folder')) || (ROLE === 'bot' && url.pathname === '/api/bot/ocr')) {
      const V = require('./viewer'), id = url.searchParams.get('id') || '';
      if (url.pathname === '/api/bot/upload-folder' && req.method === 'POST') { // a whole folder dropped into the chat: { name, files: [{ path, data: base64 }] }
        const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > 60 * 1048576) return json(res, 413, { error: { message: 'That folder is bigger than 40 MB of readable files.' } }); chunks.push(c); }
        let b = {}; try { b = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {} if (!Array.isArray(b.files) || !b.files.length) return json(res, 400, { error: { message: 'There was nothing in that folder.' } });
        return json(res, 200, require('./folder-drop').save(b.name, b.files));
      }
      if (url.pathname === '/api/bot/upload' && req.method === 'POST') { // a file dropped or pasted into the chat
        const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > 34 * 1048576) return json(res, 413, { error: { message: 'That file is bigger than 25 MB.' } }); chunks.push(c); } // JSON only: { name, data: base64 }
        let b = {}; try { b = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch {} const buf = Buffer.from(String(b.data || ''), 'base64'); if (!buf.length) return json(res, 400, { error: { message: 'There was nothing in that file.' } });
        const d = V.saveUpload(b.name || 'pasted', buf); return d ? json(res, 200, d) : json(res, 400, { error: { message: 'I could not keep that file.' } });
      }
      const e = V.get(id); if (!e) return json(res, 404, { error: { message: 'That file is not available any more. Ask me to find it again.' } });
      if (url.pathname === '/api/bot/viewinfo') return json(res, 200, (await V.info(id)) || {});
      if (url.pathname === '/api/bot/ocr' && req.method === 'POST') { try { const f = (e.kind === 'image' && !V.NEEDS_CONVERT.has(e.ext)) ? e.path : await V.thumb(e); return json(res, 200, { text: f ? await V.ocr(f) : '' }); } catch (err) { return json(res, 200, { error: err.message }); } }
      if (url.pathname === '/api/bot/thumb') { const f = await V.thumb(e); if (!f) return json(res, 404, { error: { message: 'No preview for this file.' } }); res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); return res.end(fs.readFileSync(f)); }
      let file = e.path, mime = V.MIME[e.ext] || 'application/octet-stream';
      if (V.NEEDS_CONVERT.has(e.ext)) { file = await V.thumb(e, 2400); mime = 'image/png'; if (!file) return json(res, 404, { error: { message: 'I could not open that picture.' } }); }
      else if (e.kind === 'text') mime = 'text/plain; charset=utf-8'; else if (e.kind === 'html') mime = 'text/html; charset=utf-8'; else if (!V.MIME[e.ext]) return json(res, 415, { error: { message: 'This kind of file has no preview here. Use Open.' } });
      const st = fs.statSync(file), head = { 'Content-Type': mime, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': dispo(path.basename(file)), ...(e.ext === 'svg' || e.kind === 'html' ? { 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:" } : {}) };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''); if (m && (e.kind === 'video' || e.kind === 'audio')) { const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1; if (a > b || a >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end(); } res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 }); return fs.createReadStream(file, { start: a, end: b }).pipe(res); }
      res.writeHead(200, { ...head, 'Content-Length': st.size }); return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname === '/api/bot/file' && req.method === 'GET') { // a file Tulai made (only from its own reports folder, by plain file name)
      const ex = require('./export'), name = path.basename(String(url.searchParams.get('name') || '')), f = path.join(ex.dir(), name), ext = path.extname(name).slice(1).toLowerCase();
      const TYPES = { html: 'text/html; charset=utf-8', pdf: 'application/pdf', csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', md: 'text/markdown; charset=utf-8' };
      if (!name || !TYPES[ext] || !fs.existsSync(f)) return json(res, 404, { error: { message: 'That file is not here.' } });
      res.writeHead(200, { 'Content-Type': TYPES[ext], 'Content-Disposition': dispo(name), 'X-Content-Type-Options': 'nosniff', ...(ext === 'html' ? { 'Content-Security-Policy': "sandbox allow-same-origin; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'" } : {}), 'Cache-Control': 'no-store' }); /* a sandbox header would stop the PDF viewer, so only web pages get one */ return res.end(fs.readFileSync(f));
    }
    if (url.pathname === '/api/bot/suggestions' && req.method === 'GET') {
      let ctx = { now: new Date(), habits: [] }; const cfg = loadConfig(), on = require('./work').connected(cfg);
      try { ctx.habits = require('./habits').suggest(ctx.now, 6); } catch {}
      try { const mt = require('./meeting'); ctx.recording = mt.isRecording(); const e = mt.lastEndedAt(); ctx.lastMeetingEndedMins = e ? Math.round((Date.now() - e) / 60000) : null; } catch {}
      try { const ev = (require('./webcal').state().events || []).filter((x) => x.at >= Date.now() - 10 * 60000).sort((a, b) => a.at - b.at)[0]; ctx.nextMeetingMins = ev ? Math.round((ev.at - Date.now()) / 60000) : null; } catch {}
      ctx.jira = on.jira; ctx.gitlab = on.gitlab; return json(res, 200, { chips: require('./suggest').build(ctx) });
    }
    if (url.pathname === '/api/bot/learning' && req.method === 'GET') return json(res,200,{notes:require('./bot-memory').read(),memory:(()=>{try{return require('./vector-memory').status()}catch{return {available:false,mode:'keyword fallback'}}})()});
    if (url.pathname === '/api/bot/learning' && req.method === 'PUT') {
      const body=await readBody(req);
      try { return json(res,200,{notes:require('./bot-memory').save(body.notes)}); }
      catch(e) { return json(res,400,{error:{message:e.message}}); }
    }
    if(url.pathname==='/api/bot/team/room'&&req.method==='POST'){const b=await readBody(req);if(!global.__tulaiRoom)return json(res,503,{error:'Bot display unavailable'});await global.__tulaiRoom.show(b.count,b.visible!==false);return json(res,200,{ok:true});}
    if (url.pathname === '/api/bot/team' && req.method === 'POST') {
      const body = await readBody(req); let stopped = false;
      if(global.__tulaiTeamBusy)return json(res,409,{error:'A team discussion is already running.'});
      global.__tulaiTeamBusy=true;let revision;
      res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache'});
      res.on('close', () => { stopped = true;if(body.floating)global.__tulaiRoom?.stop(); });
      const send = async ev => { if (!stopped && !res.writableEnded) {res.write(`data: ${JSON.stringify(ev)}\n\n`);if(body.floating&&ev.type==='answer')await global.__tulaiRoom?.answer(ev,body.speak===true);} };
      try { if(body.floating){await global.__tulaiRoom?.show(body.count||4);revision=global.__tulaiRoom?.revision();} const learned=require('./bot-memory').capture(body.text);if(learned)send({type:'learned_memory',text:learned}); await require('./bot-team').discuss({...body,lessons:await require('./bot-memory').retrieve(body.text)}, {chat: args => require('./nlu').chat(args), send, stopped: () => stopped||(body.floating&&revision!==global.__tulaiRoom?.revision())}); }
      catch (e) { await send({type:'error',message:e.message}); }
      finally {global.__tulaiTeamBusy=false;}
      return res.end();
    }
    if (url.pathname === '/api/bot/training/dataset' && req.method === 'GET') { try { return json(res,200,require('./bot-training').dataset(url.searchParams.get('run'))); } catch(e) { return json(res,400,{error:'Dataset could not be read: '+e.message}); } }
    if (ROLE === 'bot' && url.pathname === '/api/bot/helper') return json(res, 200, require('./helper-bot').state()); // the helper bot's window reads what it is doing
    if (ROLE === 'bot' && url.pathname === '/api/bot/live') { // the floating answer window during calls
      const L = require('./live-answer'), mt = require('./meeting');
      if (req.method === 'POST') { const b = await readBody(req); if (b.action === 'answer') return json(res, 200, L.handle('answer that')); if (b.action === 'solve') return json(res, 200, L.handle('solve the screen')); if (b.action === 'on' || b.action === 'off') { L.setOn(b.action === 'on'); } }
      const st = mt.state(); return json(res, 200, { hideApp: !!global.__tulaiMeetingHidden, recording: st.recording, since: st.since, on: L.state().on, thinking: L.busy(), lastQuestion: L.state().lastQ, items: L.items() });
    }
    if (ROLE === 'bot' && url.pathname === '/api/bot/brain' && req.method === 'POST') { const bb = await readBody(req).catch(() => ({})); const ok = await (bb && bb.long ? require('./nlu').ensureLong() : require('./nlu').ensureLocal()).catch(() => false); return json(res, ok ? 200 : 503, ok ? { ok: true } : { error: { message: 'The local brain could not start (model not downloaded yet?).' } }); } // Tulai Desktop uses our trained AI through this
    if (ROLE === 'bot' && url.pathname === '/api/bot/eval' && req.method === 'POST') { // acceptance runner: answers from the REAL local model (mode "model") or through the whole bot (mode "app"), one fresh conversation per prompt
      const b = await readBody(req); if (b.mode === 'chat') { const out = [], sid = /^qa-[\w-]{1,40}$/.test(b.sid || '') ? b.sid : 'qa-test', hist = []; for (const p of (Array.isArray(b.prompts) ? b.prompts : []).slice(0, 8)) { const t0 = Date.now(); let r = null; try { r = await require('./local').handle(String(p).slice(0, 4000), { sid, history: b.conversation ? hist.slice(-12) : [], workConfig: loadConfig(), meeting: require('./meeting'), nlu: require('./nlu'), lessons: await require('./bot-memory').retrieve(String(p)).catch(() => []) }); } catch (e) { r = { reply: 'ERROR ' + e.message }; } const a = (r && r.reply) || ''; if (b.conversation) hist.push({ role: 'user', content: String(p) }, { role: 'assistant', content: a || 'My configured bot model did not return an answer.' }); out.push({ answer: a || '(no answer: the real chat would say "My configured bot model did not return an answer")', noAnswer: !a, via: (r && r.via) || '', ms: Date.now() - t0 }); } return json(res, 200, { mode: 'chat', results: out }); } // the real chat rules, in a separate test session (your chat is not touched)
      const mode = b.mode === 'app' ? 'app' : 'model', prompts = (Array.isArray(b.prompts) ? b.prompts : []).slice(0, 5).map((p) => String(p).slice(0, 6000)), out = [];
      for (const p of prompts) {
        if (mode === 'model') { let a = null; try { a = await require('./nlu').answer(p, { history: [], temperature: 0, maxTokens: 700, timeout: 120000 }); } catch {} out.push({ answer: a || '', engine: 'local model' }); continue; }
        { const sv = require('./pack-solvers').handle(p) || require('./bot-features').handle(p); if (sv) { out.push({ answer: sv.reply, engine: 'bot (computed by code: ' + sv.via + ')' }); continue; } } // the same side-effect-free rules the chat runs first
        { let a = ''; try { a = (await require('./nlu').answer(p, { history: [], lessons: await require('./bot-memory').retrieve(p), temperature: 0, maxTokens: 700, timeout: 120000 })) || ''; } catch {} out.push({ answer: a, engine: 'bot (local brain; never the company AI)' }); continue; } // the bot's own path for questions: exact code first (above), then its local brain
      }
      return json(res, 200, { mode, results: out });
    }
    if (url.pathname === '/api/approvals') { // permission cards: something asks, the owner clicks Allow in the Desktop app
      const A = require('./approvals');
      try {
        if (req.method === 'GET') return json(res, 200, { items: A.list(), actions: Object.keys(A.ACTIONS) });
        if (req.method === 'POST') { const b = await readBody(req); if (b.request) return json(res, 200, { item: A.request(b.request) }); if (typeof b.id === 'string') { if (req.headers['x-tulai-ui'] !== '1') return json(res, 403, { error: { message: 'Only the Tulai window can approve.' } }); return json(res, 200, { item: await A.decide(b.id, !!b.allow) }); } return json(res, 400, { error: { message: 'Nothing to do.' } }); }
      } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/bot/training/packs') { // one-click skill packs (skill-packs.js)
      const sp = require('./skill-packs');
      try {
        if (req.method === 'GET') { let g = {}; try { const run = require('./active-model').state().current?.run; if (run) g = JSON.parse(fs.readFileSync(path.join(require('./active-model').home(), 'runs', run, 'deployment', 'gguf-gate.json'), 'utf8')).groups || {}; } catch {} return json(res, 200, { packs: sp.list().map((p) => (p.state === 'up to date' && g['pack:' + p.id] ? { ...p, score: g['pack:' + p.id] } : p)), auto: sp.state().auto }); } // a trained pack shows the score it got in the brain you use now
        if (req.method === 'POST') { const b = await readBody(req);
          if (b.select && typeof b.select.id === 'string') return json(res, 200, { packs: sp.select(b.select.id, !!b.select.on), auto: sp.state().auto });
          if (typeof b.auto === 'boolean') { sp.setAuto(b.auto); return json(res, 200, { packs: sp.list(), auto: sp.state().auto }); }
          if (typeof b.finetune === 'string') { if (b.only === true) for (const id of sp.selectedIds()) if (id !== b.finetune) sp.select(id, false); sp.select(b.finetune, true); /* "only this pack": the others are unticked first, so exactly this pack is trained */ const r = await require('./bot-training').handle('train your skills', { packs: sp.selectedIds() }); return json(res, 200, { packs: sp.list(), auto: sp.state().auto, message: r.reply }); } return json(res, 400, { error: { message: 'Nothing to do.' } }); }
      } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/bot/training/free') { // free open datasets (free-data.js)
      const fd = require('./free-data');
      try {
        if (req.method === 'GET') return json(res, 200, { datasets: fd.list() });
        if (req.method === 'POST') { const b = await readBody(req); if (b.enable && typeof b.enable.id === 'string') return json(res, 200, { datasets: fd.setEnabled(b.enable.id, !!b.enable.on) }); if (typeof b.download === 'string') { fd.download(b.download); return json(res, 200, { datasets: fd.list() }); } return json(res, 400, { error: { message: 'Nothing to do.' } }); }
      } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/bot/training/pack') { // the GitHub training pack (training-pack.js)
      const tp = require('./training-pack');
      try {
        if (req.method === 'GET') return json(res, 200, tp.status());
        if (req.method === 'POST') { const b = await readBody(req); if (b.config) tp.setConfig(b.config); if (b.sync) { const st = await tp.sync(); return json(res, 200, { ...tp.status(), last: st, custom: require('./custom-training').list() }); } return json(res, 200, tp.status()); }
      } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/bot/training/custom') { // your own training examples and checks (custom-training.js)
      const ct = require('./custom-training');
      try {
        if (req.method === 'GET') return json(res, 200, ct.list());
        if (req.method === 'POST') { const b = await readBody(req); if (b.remove) return json(res, 200, ct.remove(String(b.remove))); if (b.import != null) return json(res, 200, { ...ct.importText(String(b.import).slice(0, 4e6)), ...ct.list() }); return json(res, 200, { added: ct.add(b.entry || b), ...ct.list() }); }
      } catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    if (url.pathname === '/api/bot/training' && req.method === 'GET') return json(res,200,require('./bot-training').metrics());
    if (url.pathname === '/api/bot/training' && req.method === 'POST') { const b=await readBody(req); if(!['start','skills','stop','rollback','activate','auto'].includes(b.action))return json(res,400,{error:'Invalid training action'}); if(b.action==='auto'){const d=await require('./bot-training').autoStart();return json(res,200,{...require('./bot-training').metrics(),decision:d,message:d.why})} if(b.action==='activate'){try{const m=require('./bot-training').metrics();if(!m.run)throw Error('There is no trained candidate yet.');await require('./active-model').activate(m.run);require('./bot-training').afterActivate(m.run);return json(res,200,{...require('./bot-training').metrics(),message:'The new model is now running. Use Restore previous model to go back.'})}catch(e){return json(res,400,{error:e.message})}} if(b.action==='rollback'){try{await require('./active-model').rollback();return json(res,200,{...require('./bot-training').metrics(),message:'Restored the previous local model.'})}catch(e){return json(res,400,{error:e.message})}} const result=await require('./bot-training').handle(b.action==='start'?'train yourself':b.action==='skills'?'train your skills':'stop training',b.action==='skills'?{packs:require('./skill-packs').selectedIds(),...(Number.isInteger(b.fromSeed)?{fromSeed:b.fromSeed}:{})}:{}); return json(res,200,{...require('./bot-training').metrics(),message:result.reply}); }
    if (url.pathname === '/api/bot/state') return json(res, 200, converse.state(loadConfig()));
    if (url.pathname === '/api/bot/stop' && req.method === 'POST') return json(res, 200, { ok: converse.stop() });
    if (ROLE === 'bot' && url.pathname === '/api/setup' && req.method === 'GET') { const sp = require('./skill-packs'); return json(res, 200, { ...require('./installer').status(), skills: { pending: sp.setupPending(), packs: sp.list().map((p) => ({ id: p.id, name: p.name, icon: p.icon, summary: p.summary, checks: p.checks })) } }); }
    if (ROLE === 'bot' && url.pathname === '/api/setup/skills' && req.method === 'POST') { // the first-run step: fine-tune the chosen skill packs now, or skip and do it later in Settings
      const b = await readBody(req), sp = require('./skill-packs');
      if (b.action === 'later') { sp.setupDone(); return json(res, 200, { ok: true, message: 'Skipped. You can fine-tune any time in Settings, Train your local bot AI, Skill packs.' }); }
      if (b.action === 'finetune') { const ids = (Array.isArray(b.packs) ? b.packs : []).map(String); if (!ids.length) return json(res, 400, { error: { message: 'Choose at least one skill, or press Skip for now.' } }); sp.setupDone(ids); const r = await require('./bot-training').handle('train your skills', { packs: sp.selectedIds() }); return json(res, 200, { ok: true, message: r.reply }); }
      return json(res, 400, { error: { message: 'Nothing to do.' } }); }
    if (ROLE === 'bot' && url.pathname === '/api/setup/start' && req.method === 'POST') { require('./installer').start().then(() => { try { require('./nlu').reloadLocal(); } catch {} }); return json(res, 200, { ok: true }); }
    if (ROLE === 'bot' && url.pathname === '/api/setup/pause' && req.method === 'POST') return json(res, 200, require('./installer').pause());
    if (url.pathname === '/api/bot/say' && req.method === 'POST') {
      const b = await readBody(req); res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const send = (o) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };
      res.on('close', () => { if (!res.writableEnded) converse.stop(); });
      try { send({ type: 'bot_done', text: await converse.say(String(b.text || '').slice(0, 8000), { send, deps: missions.getDeps(), voice: !!b.voice, followup: !!b.followup, ...(/^qa-[\w-]{1,40}$/.test(b.sid || '') ? { id: b.sid, title: 'Test' } : {}) }) }); } catch (e) { send({ type: 'error', message: friendly(e) }); }
      return res.end();
    }
    if (url.pathname === '/api/missions' && req.method === 'GET') return json(res, 200, { missions: missions.view(), events: missions.events() });
    if (url.pathname === '/api/missions' && req.method === 'POST') { try { return json(res, 200, missions.save(await readBody(req))); } catch (e) { return json(res, 400, { error: { message: e.message } }); } }
    if (url.pathname === '/api/missions/run' && req.method === 'POST') {
      const b = await readBody(req); const p = missions.run(String(b.id), 'manual'); p.catch(() => {});
      const early = await Promise.race([p.then(() => null, (e) => e.message), new Promise((r) => setTimeout(() => r(null), 250))]);
      return early ? json(res, 400, { error: { message: early } }) : json(res, 200, { ok: true });
    }
    if (url.pathname === '/api/missions/stop' && req.method === 'POST') return json(res, 200, { ok: missions.stop(String((await readBody(req)).id)) });
    if (url.pathname === '/api/missions/delete' && req.method === 'POST') { missions.remove(String((await readBody(req)).id)); return json(res, 200, { ok: true }); }
    if (url.pathname === '/api/missions/toggle' && req.method === 'POST') { const b = await readBody(req), m = missions.get(String(b.id)); if (!m) return json(res, 404, { error: { message: 'No such mission' } }); return json(res, 200, missions.save({ ...m, enabled: !!b.enabled })); }
    if (url.pathname === '/api/missions/chats') return json(res, 200, missions.chatsSince(+url.searchParams.get('since') || 0));
    if (url.pathname === '/api/bridges/status') return json(res, 200, bridge.status());
    if (url.pathname === '/api/bridges/newcode' && req.method === 'POST') { bridge.newCode(String((await readBody(req)).platform)); return json(res, 200, bridge.status()); }
    if (url.pathname === '/api/bridges/unpair' && req.method === 'POST') { const b = await readBody(req); bridge.unpair(String(b.platform), b.id); return json(res, 200, bridge.status()); }
    if (url.pathname === '/api/mcp/status') return json(res, 200, mcp.status(loadConfig().mcpServers));
    if (url.pathname === '/api/mcp/project') return json(res, 200, mcp.projectServers(loadConfig().workspace));
    if (url.pathname === '/api/mcp/test' && req.method === 'POST') {
      const b = await readBody(req), cfg = loadConfig(); const s = mcp.unmaskServers([b.server], cfg.mcpServers)[0];
      return json(res, 200, await mcp.test(s, { agent: () => agentFor(cfg) }));
    }
    if (url.pathname === '/api/devices') return json(res, 200, await shots.devices());
    if (url.pathname === '/api/screenshot' && req.method === 'POST') {
      const b = await readBody(req), cfg = loadConfig();
      try { const r = await shots.capture(b, cfg.workspace, cfg); return json(res, 200, { ...r, url: `/shots/${r.id}.png`, urls: r.shots.map((i) => `/shots/${i}.png`) }); }
      catch (e) { return json(res, 400, { error: { message: e.message } }); }
    }
    // static
    let f = url.pathname === '/' ? '/index.html' : url.pathname;
    const full = path.join(PUBLIC, path.normalize(f));
    if (!full.startsWith(PUBLIC) || !fs.existsSync(full)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    if (!res.headersSent) json(res, 502, { error: { message: friendly(e) } }); else res.end();
  }
process.on('tulay:panic', () => { try { require('./computer').panic(); } catch {} try { converse.stopAll(); } catch {} });
}).listen(PORT, '127.0.0.1', () => { console.log(`Tulai → http://localhost:${PORT}`); try { if (ROLE === 'bot') missions.init({ loadConfig, upstream, fetchPage, agentFor, usage: appendUsage, notify }); if (ROLE === 'bot') bridge.init({ loadConfig, saveConfig, agentFor, freshChat: (id) => { const c = store.listChats().find((x) => String(x.id) === id); if (c) { c.messages = []; c.history = []; store.saveChat(c); } } }); } catch (e) { console.error('missions:', e.message); } try { mcp.configure(loadConfig().mcpServers, { agent: () => agentFor(loadConfig()) }); } catch {} });
