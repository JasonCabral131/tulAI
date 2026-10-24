// MCP connectors: a small Model Context Protocol client (stdio servers and streamable-HTTP servers).
// Each server's tools are offered to Claude as functions named mcp__<server>__<tool>.
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const servers = new Map(); // name -> { cfg, status, tools, error, proc, rpc, session }
const MASK = '••••••••';
const clean = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
const toolName = (srv, tool) => `mcp__${clean(srv)}__${clean(tool)}`.slice(0, 64);
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => Promise.race([p, sleep(ms).then(() => { throw new Error(`${what} timed out after ${Math.round(ms / 1000)}s`); })]);

/* ---------- transports ---------- */
function stdioTransport(cfg, onExit) {
  // Run through a login shell so the person's PATH (npx, uvx, node...) is available even when the app was launched from Finder.
  const line = [cfg.command, ...(cfg.args || [])].map((x, i) => (i === 0 ? cfg.command : q(x))).join(' ');
  const proc = spawn('/bin/zsh', ['-lc', `exec ${line}`], { cwd: cfg.cwd || process.env.HOME, env: { ...process.env, ...(cfg.env || {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '', errTail = ''; const pending = new Map(); let nextId = 1, dead = false;
  const fail = (e) => { for (const p of pending.values()) p.reject(e); pending.clear(); };
  proc.stdout.on('data', (d) => {
    buf += d.toString('utf8'); const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) { if (!l.trim()) continue; let m; try { m = JSON.parse(l); } catch { continue; } if (m.id !== undefined && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message || 'MCP error')) : p.resolve(m.result); } }
  });
  proc.stderr.on('data', (d) => { errTail = (errTail + d.toString('utf8')).slice(-2000); });
  proc.on('error', (e) => { dead = true; fail(e); onExit(e.message); });
  proc.on('exit', (code) => { dead = true; fail(new Error(`The connector process exited (code ${code}). ${errTail.trim().split('\n').slice(-3).join(' ')}`)); onExit(`exited (code ${code}) ${errTail.trim().split('\n').slice(-2).join(' ')}`); });
  return {
    request: (method, params, ms = 30000) => { if (dead) return Promise.reject(new Error('The connector is not running')); const id = nextId++; return withTimeout(new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }), ms, `${method}`); },
    notify: (method, params) => { if (!dead) proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'); },
    close: () => { try { proc.kill(); } catch {} }, stderr: () => errTail,
  };
}
function httpTransport(cfg, opts) {
  let nextId = 1, session = null;
  const u = new URL(cfg.url), mod = u.protocol === 'http:' ? http : https;
  const post = (payload, ms) => withTimeout(new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(payload));
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Content-Length': data.length, ...(cfg.headers || {}) }; if (session) headers['Mcp-Session-Id'] = session;
    const req = mod.request(u, { method: 'POST', headers, agent: u.protocol === 'https:' && opts.agent ? opts.agent() : undefined }, (r) => {
      if (r.headers['mcp-session-id']) session = r.headers['mcp-session-id'];
      let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => {
        if (r.statusCode >= 400) return reject(new Error(`HTTP ${r.statusCode}: ${b.slice(0, 200)}`));
        if (!b.trim()) return resolve(null);
        const ct = String(r.headers['content-type'] || ''); let msgs = [];
        if (ct.includes('text/event-stream')) { for (const l of b.split('\n')) if (l.startsWith('data:')) { try { msgs.push(JSON.parse(l.slice(5))); } catch {} } } else { try { const j = JSON.parse(b); msgs = Array.isArray(j) ? j : [j]; } catch { return reject(new Error('Invalid response from the connector')); } }
        resolve(msgs);
      });
    });
    req.on('error', reject); req.end(data);
  }), ms, 'request');
  return {
    request: async (method, params, ms = 30000) => { const id = nextId++; const msgs = await post({ jsonrpc: '2.0', id, method, params }, ms); const m = (msgs || []).find((x) => x.id === id); if (!m) throw new Error('No response from the connector'); if (m.error) throw new Error(m.error.message || 'MCP error'); return m.result; },
    notify: (method, params) => { post({ jsonrpc: '2.0', method, params }, 10000).catch(() => {}); },
    close: () => { session = null; }, stderr: () => '',
  };
}

/* ---------- lifecycle ---------- */
async function start(cfg, opts = {}) {
  const entry = { cfg, status: 'starting', tools: [], error: '', rpc: null };
  servers.set(cfg.name, entry);
  try {
    entry.rpc = cfg.type === 'http' ? httpTransport(cfg, opts) : stdioTransport(cfg, (why) => { if (entry.status !== 'stopped') { entry.status = 'failed'; entry.error = entry.error || why; } });
    await entry.rpc.request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'tulay', version: '1.0' } }, cfg.type === 'http' ? 30000 : 60000);
    entry.rpc.notify('notifications/initialized', {});
    let cursor, all = [];
    do { const r = await entry.rpc.request('tools/list', cursor ? { cursor } : {}); all = all.concat(r.tools || []); cursor = r.nextCursor; } while (cursor && all.length < 500);
    entry.tools = all; entry.status = 'running'; entry.error = '';
  } catch (e) { entry.status = 'failed'; entry.error = e.message + (entry.rpc && entry.rpc.stderr ? ' ' + entry.rpc.stderr().trim().split('\n').slice(-2).join(' ') : ''); try { entry.rpc && entry.rpc.close(); } catch {} }
  return entry;
}
function stop(name) { const e = servers.get(name); if (e) { e.status = 'stopped'; try { e.rpc && e.rpc.close(); } catch {} servers.delete(name); } }
const same = (a, b) => JSON.stringify([a.type, a.command, a.args, a.env, a.cwd, a.url, a.headers]) === JSON.stringify([b.type, b.command, b.args, b.env, b.cwd, b.url, b.headers]);
// Make the running set match the configuration. Starts happen in the background.
function configure(list, opts = {}) {
  const want = new Map((list || []).filter((s) => s && s.name && s.enabled !== false).map((s) => [s.name, s]));
  for (const name of [...servers.keys()]) { const w = want.get(name); if (!w || !same(w, servers.get(name).cfg)) stop(name); }
  for (const [name, cfg] of want) if (!servers.has(name)) start(cfg, opts).catch(() => {});
}
async function ready(ms = 20000) { const t0 = Date.now(); while ([...servers.values()].some((s) => s.status === 'starting') && Date.now() - t0 < ms) await sleep(200); }
function status(list) {
  return (list || []).map((c) => { const e = servers.get(c.name); return { name: c.name, type: c.type || 'stdio', enabled: c.enabled !== false, status: c.enabled === false ? 'disabled' : e ? e.status : 'stopped', tools: e ? e.tools.map((t) => t.name) : [], error: e ? e.error : '' }; });
}
async function test(cfg, opts) { const e = await start({ ...cfg, name: '__test__' + Math.random().toString(36).slice(2, 6) }, opts); const out = { ok: e.status === 'running', tools: e.tools.map((t) => ({ name: t.name, description: String(t.description || '').slice(0, 120) })), error: e.error }; stop(e.cfg.name); return out; }

/* ---------- what Claude sees ---------- */
function specs() {
  const out = [], map = new Map();
  for (const [srv, e] of servers) {
    if (e.status !== 'running') continue;
    for (const t of e.tools) {
      const name = toolName(srv, t.name); if (map.has(name)) continue;
      const schema = { ...(t.inputSchema || { type: 'object', properties: {} }) }; delete schema.$schema; if (schema.type !== 'object') schema.type = 'object'; if (!schema.properties) schema.properties = {};
      map.set(name, { server: srv, tool: t.name, readOnly: !!(t.annotations && t.annotations.readOnlyHint) });
      out.push({ type: 'function', function: { name, description: `[${srv}] ${String(t.description || t.name).slice(0, 900)}`, parameters: schema } });
    }
  }
  specs.map = map; return out;
}
specs.map = new Map();
const isMcp = (name) => String(name).startsWith('mcp__');
const isReadOnly = (name) => !!(specs.map.get(name) && specs.map.get(name).readOnly);
async function call(name, args, ctx = {}) {
  specs(); const m = specs.map.get(name); if (!m) throw new Error(`Unknown connector tool ${name}`);
  const e = servers.get(m.server); if (!e || e.status !== 'running') throw new Error(`Connector "${m.server}" is not running${e && e.error ? ': ' + e.error : ''}`);
  const r = await e.rpc.request('tools/call', { name: m.tool, arguments: args || {} }, 120000);
  const parts = []; let img = 0;
  for (const c of r.content || []) {
    if (c.type === 'text') parts.push(c.text);
    else if (c.type === 'image' && c.data && ctx.saveImage) { const id = await ctx.saveImage(Buffer.from(c.data, 'base64')); img++; parts.push(`[image ${img} attached in the next message]`); }
    else if (c.type === 'resource') parts.push(c.resource && c.resource.text ? c.resource.text : `[resource ${c.resource && c.resource.uri}]`);
    else parts.push(`[${c.type} content omitted]`);
  }
  if (r.structuredContent && !parts.length) parts.push(JSON.stringify(r.structuredContent));
  const text = parts.join('\n') || '(no output)';
  if (r.isError) throw new Error(text.slice(0, 4000));
  return text;
}

/* ---------- secrets in the config are masked toward the UI ---------- */
const maskServers = (list) => (list || []).map((s) => ({ ...s, env: Object.fromEntries(Object.keys(s.env || {}).map((k) => [k, MASK])), headers: Object.fromEntries(Object.keys(s.headers || {}).map((k) => [k, MASK])) }));
function unmaskServers(incoming, saved) {
  return (incoming || []).map((s) => { const old = (saved || []).find((x) => x.name === s.name) || {}; const fix = (now, was) => Object.fromEntries(Object.entries(now || {}).map(([k, v]) => [k, v === MASK ? (was || {})[k] ?? '' : v])); return { ...s, env: fix(s.env, old.env), headers: fix(s.headers, old.headers) }; });
}
// Servers declared in a project's .mcp.json (Claude Code format). They are only listed; the person turns them on.
function projectServers(ws) {
  try { const j = JSON.parse(fs.readFileSync(path.join(ws, '.mcp.json'), 'utf8')); return Object.entries(j.mcpServers || {}).map(([name, v]) => (v.url ? { name, type: 'http', url: v.url, headers: v.headers || {}, enabled: false } : { name, type: 'stdio', command: v.command, args: v.args || [], env: v.env || {}, enabled: false })); } catch { return []; }
}
module.exports = { configure, status, test, specs, call, isMcp, isReadOnly, ready, maskServers, unmaskServers, projectServers, MASK, stopAll: () => [...servers.keys()].forEach(stop) };
