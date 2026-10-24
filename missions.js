// Missions: goals the bot works on by itself, now or on a schedule, with the app in the background.
// A run is an ordinary agent run recorded as a chat (so you can open it, read it and continue it).
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const store = require('./store');
const { runAgent, resolveApproval } = require('./agent');

const DATA = () => process.env.GC_DATA_DIR || __dirname;
const DIR = () => path.join(DATA(), 'missions');
const live = new Map();      // mission id -> { res, chatId, meter, pending[], startedAt }
const events = [];           // recent finished/needs-approval events for the UI
let deps = null, timer = null;
const MAX_PARALLEL = 2;
const approvalWaitMs = 30 * 60 * 1000;

const idOk = (id) => /^[\w-]{1,40}$/.test(String(id));
const file = (id) => path.join(DIR(), `${id}.json`);
function list() { try { return fs.readdirSync(DIR()).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(fs.readFileSync(path.join(DIR(), f), 'utf8')); } catch { return null; } }).filter(Boolean).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); } catch { return []; } }
const get = (id) => { try { return JSON.parse(fs.readFileSync(file(id), 'utf8')); } catch { return null; } };
function put(m) { if (!idOk(m.id)) throw new Error('bad mission id'); fs.mkdirSync(DIR(), { recursive: true }); const f = file(m.id), t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(m, null, 1)); fs.renameSync(t, f); }

/* ---------- schedule ---------- */
function nextRun(s, from = Date.now()) {
  if (!s || s.type === 'none' || !s.type) return null;
  if (s.type === 'interval') return from + Math.max(1, +s.every || 60) * 60000;
  const [hh, mm] = String(s.at || '09:00').split(':').map((x) => +x || 0);
  const d = new Date(from); d.setHours(hh, mm, 0, 0); if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  if (s.type === 'weekdays') while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d.getTime();
}
const describe = (s) => !s || s.type === 'none' || !s.type ? 'Only when you press Run' : s.type === 'interval' ? `Every ${s.every} min` : s.type === 'daily' ? `Every day at ${s.at}` : `Weekdays at ${s.at}`;

/* ---------- turn agent events into the same message shape the app renders ---------- */
function apply(chat, reply, ev, run) {
  const parts = reply.parts, part = (id) => parts.find((x) => x.t === 'tool' && x.id === id);
  const addText = (t) => { const l = parts[parts.length - 1]; if (l && l.t === 'text') l.text += t; else parts.push({ t: 'text', text: t }); };
  switch (ev.type) {
    case 'text': addText(ev.delta); break;
    case 'thinking': { const l = parts[parts.length - 1]; if (l && l.t === 'think') l.text += ev.delta; else parts.push({ t: 'think', text: ev.delta }); break; }
    case 'note': parts.push({ t: 'note', text: ev.text }); break;
    case 'history': chat.history.push(ev.message); break;
    case 'tool': parts.push({ t: 'tool', id: ev.id, name: ev.name, args: ev.args, state: 'queued', output: '' }); break;
    case 'approval': { const p = part(ev.id); if (p) { p.state = 'approval'; p.reason = ev.reason; p.lock = ev.lock; p.key = ev.key; } run.pending.push({ key: ev.key, id: ev.id, name: ev.name, reason: ev.reason || '', args: ev.args, at: Date.now() }); if (!run.quiet) deps.notify(`${chat.title}: needs your approval`, `${ev.name}${ev.reason ? ': ' + ev.reason : ''}`, chat.id); setTimeout(() => { if (run.pending.some((x) => x.key === ev.key)) resolveApproval(ev.key, 'deny'); }, approvalWaitMs); break; }
    case 'plan': { const p = part(ev.id); if (p) { p.args = { plan: ev.plan }; p.state = 'approval'; p.key = ev.key; } run.pending.push({ key: ev.key, id: ev.id, name: 'plan', reason: 'A plan is waiting for approval', at: Date.now() }); break; }
    case 'running': { const p = part(ev.id); if (p) { p.state = 'running'; run.pending = run.pending.filter((x) => x.id !== ev.id); } break; }
    case 'progress': { const p = part(ev.id); if (p) p.log = ev.replace ? [ev.text] : [...(p.log || []), ev.text].slice(-10); break; }
    case 'shot': { const p = part(ev.id); if (p) p.shots = [...(p.shots || []), ev.url]; break; }
    case 'tool_result': { const p = part(ev.id); if (p) { p.output = ev.output; p.checkpoint = ev.checkpoint; p.state = ev.denied ? 'denied' : ev.error ? 'error' : 'done'; } run.pending = run.pending.filter((x) => x.id !== ev.id); break; }
    case 'meter': run.meter = { step: ev.step, steps: ev.steps, tokens: ev.tokens, secs: ev.secs }; break;
    case 'limit': reply.limit = true; break;
    case 'snapshot': chat.messages[0].snap = ev.hash; break;
    case 'error': run.failed = true; addText(`\n\n⚠️ ${ev.message}`); break;
    case 'done': run.usage = ev.usage; break;
  }
}

/* ---------- running ---------- */
async function run(id, why = 'manual') {
  const m = get(id); if (!m) throw new Error('No such mission');
  if (live.has(id)) throw new Error('This mission is already running');
  if (live.size >= MAX_PARALLEL) throw new Error(`${MAX_PARALLEL} missions are already running. Try again in a moment.`);
  const cfg = deps.loadConfig(); if (!cfg.apiKey && cfg.aiSource === 'gateway') throw new Error('Add your gateway API key in Settings first.');
  const ws = m.workspace && fs.existsSync(m.workspace) ? m.workspace : cfg.workspace;
  const chatId = `m${id}-${Date.now()}`, started = Date.now();
  const user = { role: 'user', content: m.goal, atts: [], hlen: 0 }, reply = { role: 'assistant', content: '', parts: [] };
  const chat = { id: chatId, title: `🤖 ${m.title}`, messages: [user, reply], history: [{ role: 'user', content: m.goal }], workspace: ws, mission: { id, runAt: started, why }, updated: started, unread: true };
  const res = new EventEmitter(); res.writableEnded = false; res.writeHead = () => {}; res.end = () => { res.writableEnded = true; };
  const state = { res, chatId, startedAt: started, pending: [], meter: null, failed: false, usage: null };
  live.set(id, state); m.running = true; m.lastRun = { at: started, status: 'running', chatId }; put(m); store.saveChat(chat);
  let last = 0, buf = '';
  res.write = (chunk) => {
    buf += String(chunk); let i; while ((i = buf.indexOf('\n\n')) >= 0) { const piece = buf.slice(0, i); buf = buf.slice(i + 2); if (!piece.startsWith('data:')) continue; try { apply(chat, reply, JSON.parse(piece.slice(5)), state); } catch {} }
    if (Date.now() - last > 2500) { last = Date.now(); chat.updated = Date.now(); try { store.saveChat(chat); } catch {} }
  };
  const tier = ['opus', 'sonnet', 'haiku'].includes(m.model) ? m.model : 'sonnet';
  const runCfg = { ...cfg, maxRunTokens: (m.maxTokens || 800) * 1000, maxRunMinutes: m.maxMinutes || 30 };
  let status = 'done';
  try {
    await runAgent({ upstream: deps.upstream, fetchPage: deps.fetchPage, agentFor: deps.agentFor, cfg: runCfg, res, body: { model: cfg.models[tier], messages: chat.history, mode: m.mode || 'edits', noComputer: true, workspace: ws, allow: [], effort: m.effort || 'medium', system: [cfg.system, 'You are running as an unattended mission. Work toward the goal on your own, verify your results, and finish with a short report of what you did, what you verified, and anything that needs the person\'s attention.'].filter(Boolean).join('\n\n'), max_tokens: cfg.maxTokens, temperature: cfg.temperature, guard: m.guard } });
    if (state.failed) status = 'failed'; else if (reply.limit) status = 'paused'; else if (live.get(id)?.stopped) status = 'stopped';
  } catch (e) { status = 'failed'; reply.parts.push({ t: 'text', text: `\n\n⚠️ ${e.message}` }); }
  for (const p of reply.parts) if (p.t === 'tool' && ['queued', 'approval', 'running'].includes(p.state)) p.state = 'denied';
  reply.content = reply.parts.filter((p) => p.t === 'text').map((p) => p.text).join('') || '(no output)';
  if (state.usage) reply.usage = `${(state.usage.prompt_tokens || 0).toLocaleString()} in · ${(state.usage.completion_tokens || 0).toLocaleString()} out · ${Math.round((Date.now() - started) / 1000)}s`;
  chat.updated = Date.now(); store.saveChat(chat);
  const fresh = get(id) || m; fresh.running = false; fresh.lastRun = { at: started, ended: Date.now(), status, chatId, summary: reply.content.replace(/\s+/g, ' ').trim().slice(0, 400), tokens: state.usage ? (state.usage.prompt_tokens || 0) - (state.usage.cached || 0) + (state.usage.completion_tokens || 0) : 0, secs: Math.round((Date.now() - started) / 1000) };
  fresh.nextRun = fresh.enabled !== false ? nextRun(fresh.schedule) : null; put(fresh); live.delete(id);
  try { await deps.usage({ chat: chatId, title: chat.title, workspace: ws, model: cfg.models[tier], tier, effort: m.effort || 'medium', mode: m.mode || 'edits', agent: true, prompt: state.usage?.prompt_tokens || 0, completion: state.usage?.completion_tokens || 0, cached: state.usage?.cached || 0, secs: fresh.lastRun.secs, stopped: status !== 'done' }); } catch {}
  events.push({ at: Date.now(), id, title: m.title, status, chatId }); if (events.length > 50) events.shift();
  if (m.notify !== false && status !== 'stopped') deps.notify(`${m.title}: ${status === 'done' ? 'finished' : status === 'paused' ? 'paused' : 'failed'}`, fresh.lastRun.summary.slice(0, 140), chatId);
  return fresh;
}
function stop(id) { const s = live.get(id); if (!s) return false; s.stopped = true; s.res.emit('close'); for (const p of s.pending) resolveApproval(p.key, 'deny'); return true; }

/* ---------- API for the server ---------- */
function save(input) {
  const now = Date.now(), old = input.id && idOk(input.id) ? get(input.id) : null;
  const m = { id: old?.id || `${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`, createdAt: old?.createdAt || now, title: String(input.title || 'Untitled mission').slice(0, 80), goal: String(input.goal || '').slice(0, 8000), workspace: String(input.workspace || ''), mode: ['ask', 'edits', 'auto'].includes(input.mode) ? input.mode : 'edits', effort: ['low', 'medium', 'high', 'extra', 'max', 'ultra'].includes(input.effort) ? input.effort : 'medium', model: ['opus', 'sonnet', 'haiku'].includes(input.model) ? input.model : 'sonnet', schedule: input.schedule && input.schedule.type ? { type: input.schedule.type, every: Math.max(1, +input.schedule.every || 60), at: /^\d{1,2}:\d{2}$/.test(input.schedule.at || '') ? input.schedule.at : '09:00' } : { type: 'none' }, enabled: input.enabled !== false, notify: input.notify !== false, maxMinutes: Math.min(Math.max(+input.maxMinutes || 30, 1), 480), maxTokens: Math.min(Math.max(+input.maxTokens || 800, 50), 5000), running: old?.running || false, lastRun: old?.lastRun || null };
  if (!m.goal.trim()) throw new Error('Describe the goal first.');
  m.nextRun = m.enabled ? nextRun(m.schedule) : null; put(m); return m;
}
function remove(id) { if (live.has(id)) stop(id); try { fs.rmSync(file(id), { force: true }); } catch {} }
function view() {
  return list().map((m) => { const s = live.get(m.id); return { ...m, schedText: describe(m.schedule), running: !!s, meter: s?.meter || null, pending: s ? s.pending : [], chatId: s?.chatId || m.lastRun?.chatId }; });
}
const chatsSince = (since) => store.listChats().filter((c) => c.mission && (c.updated || 0) > since);

/* ---------- scheduler ---------- */
function tick() {
  for (const m of list()) {
    if (live.has(m.id) || m.enabled === false || !m.nextRun || !m.schedule || m.schedule.type === 'none') continue;
    if (Date.now() >= m.nextRun) { if (Date.now() - m.nextRun > 24 * 3600 * 1000) { m.nextRun = nextRun(m.schedule); put(m); continue; } run(m.id, 'schedule').catch((e) => { events.push({ at: Date.now(), id: m.id, title: m.title, status: 'failed', error: e.message }); m.nextRun = nextRun(m.schedule); put(m); }); }
  }
}
function init(d) {
  deps = d; for (const m of list()) if (m.running) { m.running = false; if (m.lastRun) m.lastRun.status = 'interrupted'; put(m); } // the app was closed mid-run
  clearInterval(timer); timer = setInterval(tick, 20000); setTimeout(tick, 3000);
}
module.exports = { apply, getDeps: () => deps, init, save, remove, run, stop, view, get, chatsSince, events: () => events, nextRun, describe };
