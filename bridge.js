// Chat bridges: talk to Tulai from Telegram or Slack. Only people who paired with the one-time code in Settings get answers.
// Telegram uses long polling and Slack uses Socket Mode, so neither needs a public address or an open port.
const https = require('https');
const http = require('http');
const fs = require('fs');
const converse = require('./converse');
const missions = require('./missions');
const { resolveApproval } = require('./agent');
const shots = require('./shots');
const wsc = require('./ws');

let deps = null;
const state = { telegram: { running: false, name: '', error: '' }, slack: { running: false, name: '', error: '' } };
const conv = new Map();   // "platform:chat" -> { pending: [{ key, id, name, reason }], args: {}, nagAt }
let tg = { on: false, abort: null, token: '' }, sl = { on: false, sock: null, token: '' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const code = () => String(Math.floor(100000 + Math.random() * 900000));

/* ---------- small http helpers ---------- */
function call(method, url, body, headers = {}, timeout = 20000, agent, onReq) {
  return new Promise((resolve, reject) => {
    const u = new URL(url), mod = u.protocol === 'http:' ? http : https, data = body === null || body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
    const h = { ...(data && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...(data ? { 'Content-Length': data.length } : {}), ...headers };
    const req = mod.request(u, { method, headers: h, agent: u.protocol === 'https:' ? agent : undefined }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { let j = null; try { j = JSON.parse(b); } catch {} if (r.statusCode >= 400) return reject(new Error(`HTTP ${r.statusCode}${j && (j.description || j.error) ? ': ' + (j.description || j.error) : ''}`)); resolve(j ?? b); }); });
    req.setTimeout(timeout, () => req.destroy(new Error('timed out'))); req.on('error', reject); onReq && onReq(req); if (data) req.write(data); req.end();
  });
}
const chunks = (t, n) => { const out = []; t = String(t); while (t.length > n) { let i = t.lastIndexOf('\n', n); if (i < n / 2) i = t.lastIndexOf(' ', n); if (i < n / 2) i = n; out.push(t.slice(0, i)); t = t.slice(i).trimStart(); } out.push(t); return out; };

/* ---------- Telegram ---------- */
const tgUrl = (c, m) => `${(c.apiBase || 'https://api.telegram.org').replace(/\/+$/, '')}/bot${c.token}/${m}`;
const tgCall = (c, m, body, ms) => call('POST', tgUrl(c, m), body || {}, {}, ms || 20000, deps.agentFor(deps.loadConfig()), (r) => { tg.abort = r; });
const tgSend = async (c, chat, text) => { for (const part of chunks(text || '(empty)', 3800)) await call('POST', tgUrl(c, 'sendMessage'), { chat_id: chat, text: part, disable_web_page_preview: true }, {}, 20000, deps.agentFor(deps.loadConfig())); };
async function tgPhoto(c, chat, file) {
  const b = '----tulay' + Math.random().toString(16).slice(2), img = fs.readFileSync(file), pre = Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chat}\r\n--${b}\r\nContent-Disposition: form-data; name="photo"; filename="screenshot.png"\r\nContent-Type: image/png\r\n\r\n`), post = Buffer.from(`\r\n--${b}--\r\n`);
  await call('POST', tgUrl(c, 'sendPhoto'), Buffer.concat([pre, img, post]), { 'Content-Type': `multipart/form-data; boundary=${b}` }, 30000, deps.agentFor(deps.loadConfig()));
}
async function tgLoop() {
  if (tg.on) return; tg.on = true; let offset = 0, fails = 0;
  while (tg.on) {
    const c = deps.loadConfig().telegram || {}; if (!c.enabled || !c.token) break; tg.token = c.token;
    try {
      if (!state.telegram.name) { const me = await tgCall(c, 'getMe', {}, 15000); state.telegram.name = me.result ? '@' + me.result.username : ''; }
      const j = await tgCall(c, 'getUpdates', { timeout: 25, offset, allowed_updates: ['message'] }, 40000);
      state.telegram.running = true; state.telegram.error = ''; fails = 0;
      for (const u of j.result || []) { offset = u.update_id + 1; const m = u.message; if (m && m.text) handle('telegram', { user: m.from.id, chat: m.chat.id, text: m.text, name: m.from.first_name || m.from.username || String(m.chat.id), reply: (t) => tgSend(c, m.chat.id, t), photo: (f) => tgPhoto(c, m.chat.id, f), typing: () => tgCall(c, 'sendChatAction', { chat_id: m.chat.id, action: 'typing' }, 8000).catch(() => {}) }).catch((e) => { state.telegram.error = e.message; }); }
    } catch (e) {
      if (!tg.on) break; state.telegram.running = false; state.telegram.error = e.message; fails++;
      if (/401|404|Unauthorized/.test(e.message)) { state.telegram.error = 'Telegram rejected the bot token. Check it in Settings.'; break; }
      await sleep(Math.min(30000, 1500 * 2 ** Math.min(fails, 4)));
    }
  }
  tg.on = false; state.telegram.running = false;
}

/* ---------- Slack (Socket Mode) ---------- */
const slApi = (c) => (c.apiBase || 'https://slack.com').replace(/\/+$/, '');
async function slPost(c, channel, text) { for (const part of chunks(text || '(empty)', 3000)) { const r = await call('POST', `${slApi(c)}/api/chat.postMessage`, { channel, text: part }, { Authorization: `Bearer ${c.botToken}` }, 20000, deps.agentFor(deps.loadConfig())); if (r && r.ok === false) throw new Error(r.error); } }
async function slLoop() {
  if (sl.on) return; sl.on = true; let fails = 0;
  while (sl.on) {
    const c = deps.loadConfig().slack || {}; if (!c.enabled || !c.appToken || !c.botToken) break;
    try {
      const o = await call('POST', `${slApi(c)}/api/apps.connections.open`, null, { Authorization: `Bearer ${c.appToken}` }, 20000, deps.agentFor(deps.loadConfig())); if (!o.ok) throw new Error(o.error || 'apps.connections.open failed');
      if (!state.slack.name) { const a = await call('POST', `${slApi(c)}/api/auth.test`, null, { Authorization: `Bearer ${c.botToken}` }, 15000, deps.agentFor(deps.loadConfig())).catch(() => null); state.slack.name = a && a.ok ? `${a.user || 'bot'} @ ${a.team || ''}` : ''; }
      let dropped = false;
      const sock = await wsc.connect(o.url, { agent: deps.agentFor(deps.loadConfig()), onClose: () => { dropped = true; }, onMessage: (txt) => {
        let j; try { j = JSON.parse(txt); } catch { return; }
        if (j.envelope_id) sock.send(JSON.stringify({ envelope_id: j.envelope_id })); // acknowledge right away or Slack resends
        if (j.type === 'hello') { state.slack.running = true; state.slack.error = ''; fails = 0; }
        if (j.type === 'disconnect') { sock.close(); }
        if (j.type === 'events_api') { const ev = (j.payload || {}).event || {}; if (ev.bot_id || ev.subtype || !ev.user) return; const dm = ev.type === 'message' && ev.channel_type === 'im'; if (!dm && ev.type !== 'app_mention') return;
          handle('slack', { user: ev.user, chat: ev.channel, text: String(ev.text || '').replace(/<@[A-Z0-9]+>/g, '').trim(), name: ev.user, reply: (t) => slPost(c, ev.channel, t), photo: null, typing: null }).catch((e) => { state.slack.error = e.message; }); }
      } });
      sl.sock = sock; while (sl.on && !dropped) await sleep(500);
      sock.close(); sl.sock = null; state.slack.running = false; if (sl.on) await sleep(1500);
    } catch (e) { if (!sl.on) break; state.slack.running = false; state.slack.error = e.message; fails++; if (/invalid_auth|not_authed|account_inactive/.test(e.message)) { state.slack.error = 'Slack rejected a token. Check both tokens in Settings.'; break; } await sleep(Math.min(30000, 2000 * 2 ** Math.min(fails, 4))); }
  }
  sl.on = false; state.slack.running = false;
}

/* ---------- the conversation, shared by both ---------- */
const HELP = 'I’m Tulai running on your Mac. Just tell me what to do.\n\n/status  what I’m doing\n/stop  cancel the current task\n/new  start a fresh conversation\n/missions  list your missions\n/run <name>  start a mission\n\nWhen I need permission I’ll ask; reply yes, no or always.';
const YES = /^(y|yes|yep|ok|okay|allow|approve|approved|sure|go|go ahead|do it)$/i, NO = /^(n|no|nope|deny|stop|cancel|don'?t)$/i, ALWAYS = /^always$/i;
const argLine = (a = {}) => a.command ? `$ ${String(a.command).slice(0, 200)}` : a.path ? String(a.path) : a.url ? String(a.url) : a.action ? `${a.action}${a.text ? ' ' + a.text : ''}` : '';

async function handle(p, m) {
  const all = deps.loadConfig(), bc = all[p] || {}, key = `${p}:${m.chat}`, text = (m.text || '').trim(); if (!text) return;
  const cs = conv.get(key) || { pending: [], args: {}, nagAt: 0 }; conv.set(key, cs);
  if (!(bc.allowed || []).map(String).includes(String(m.user))) {
    const pm = text.match(/^\/?pair\s+(\d{4,10})$/i);
    if (pm && bc.pairCode && pm[1] === String(bc.pairCode)) { deps.saveConfig({ ...deps.loadConfig(), [p]: { ...deps.loadConfig()[p], allowed: [...new Set([...(bc.allowed || []), String(m.user)])], pairCode: code() } }); return m.reply('✅ Paired! You can talk to Tulai here now. Send /help to see what I can do.'); }
    if (Date.now() - cs.nagAt > 60000) { cs.nagAt = Date.now(); await m.reply('👋 I only answer people who are paired with this Tulai. In Tulai open Settings → Chat apps, copy the pairing code, and send me:  /pair CODE'); }
    return;
  }
  const id = `${p === 'telegram' ? 'tg' : 'sl'}-${String(m.chat).replace(/[^\w-]/g, '_')}`, word = text.replace(/^\//, '').trim();
  if (cs.pending.length && (YES.test(word) || NO.test(word) || ALWAYS.test(word))) {
    const dec = ALWAYS.test(word) ? 'always' : YES.test(word) ? 'allow' : 'deny'; const q = cs.pending.shift(); resolveApproval(q.key, dec); return m.reply(dec === 'deny' ? 'Okay, I won’t do that.' : '👍 On it.');
  }
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/s);
  if (cmd) {
    const [, c, arg] = [0, cmd[1].toLowerCase(), cmd[2].trim()];
    if (c === 'help' || c === 'start') return m.reply(HELP);
    if (c === 'stop') { const was = converse.stop(id); cs.pending = []; return m.reply(was ? '🛑 Stopped.' : 'Nothing is running.'); }
    if (c === 'new') { converse.stop(id); cs.pending = []; await deps.freshChat(id); return m.reply('✨ Fresh start.'); }
    if (c === 'status') { const v = missions.view(), run = v.filter((x) => x.running); return m.reply(`${converse.busy(id) ? '⏳ Working on your last request.' : '✅ Idle.'}\nMissions: ${v.length}, running now: ${run.length}${run.length ? ' (' + run.map((x) => x.title).join(', ') + ')' : ''}`); }
    if (c === 'missions') { const v = missions.view(); return m.reply(v.length ? v.map((x) => `• ${x.title} — ${x.running ? 'running' : x.lastRun ? x.lastRun.status : 'never run'} (${x.schedText})`).join('\n') : 'No missions yet. Create one in Tulai → Missions.'); }
    if (c === 'run') { const v = missions.view().find((x) => x.title.toLowerCase().includes(arg.toLowerCase()) && arg); if (!v) return m.reply(arg ? `No mission matching “${arg}”. Send /missions to list them.` : 'Tell me which one: /run <name>'); try { missions.run(v.id, 'chat').catch(() => {}); return m.reply(`▶️ Started “${v.title}”. I’ll tell you how it goes.`); } catch (e) { return m.reply(e.message); } }
  }
  if (converse.busy(id)) return m.reply('⏳ Still working on your last request. Send /stop to cancel it.');
  m.reply('⏳ On it…').catch(() => {});
  const photos = []; const typing = m.typing ? setInterval(m.typing, 4500) : null; if (m.typing) m.typing();
  const send = (ev) => {
    if (ev.type === 'tool') cs.args[ev.id] = ev.args;
    if (ev.type === 'shot') { const f = shots.shotFile(String(ev.url).replace(/^\/shots\//, '').replace(/\.png$/, '')); if (f) photos.push(f); }
    if (ev.type === 'approval') { cs.pending.push({ key: ev.key, id: ev.id, name: ev.name }); m.reply(`⚠️ I need your OK to use ${ev.name}${ev.reason ? ' (' + ev.reason + ')' : ''}\n${argLine(cs.args[ev.id])}\n\nReply: yes · no · always`).catch(() => {}); }
    if (ev.type === 'running') cs.pending = cs.pending.filter((x) => x.id !== ev.id);
  };
  let out = '';
  try {
    out = await converse.say(text, { send, deps: missions.getDeps(), id, title: `${p === 'telegram' ? '✈️ Telegram' : '💬 Slack'}: ${m.name}`, mode: bc.mode || 'ask', noComputer: true, effort: bc.effort || 'low', system: `The person is messaging you from ${p === 'telegram' ? 'Telegram' : 'Slack'} on their phone or work chat. Keep replies short and plain (no tables, minimal markdown). Do the task, then say briefly what you did.`, allow: [], noComputer: true });
  } catch (e) { out = '⚠️ ' + e.message; }
  clearInterval(typing); cs.pending = [];
  await m.reply(out || 'Done.');
  if (m.photo) for (const f of photos.slice(0, 3)) await m.photo(f).catch(() => {});
  else if (photos.length) await m.reply(`(${photos.length} screenshot${photos.length > 1 ? 's' : ''} saved in the Tulai chat)`);
}

/* ---------- lifecycle ---------- */
function configure() {
  const cfg = deps.loadConfig();
  for (const [p, loop, st, fields] of [['telegram', tgLoop, tg, ['token']], ['slack', slLoop, sl, ['appToken', 'botToken']]]) {
    const c = cfg[p] || {}; const want = c.enabled && fields.every((f) => c[f]); const sig = fields.map((f) => c[f]).join('|');
    if (want && !c.pairCode) deps.saveConfig({ ...deps.loadConfig(), [p]: { ...c, pairCode: code() } });
    if (st.sig !== undefined && st.sig !== sig) { st.on = false; if (p === 'telegram' && tg.abort) try { tg.abort.destroy(); } catch {} if (p === 'slack' && sl.sock) try { sl.sock.close(); } catch {} state[p].name = ''; }
    st.sig = sig;
    if (!want) { st.on = false; if (p === 'telegram' && tg.abort) try { tg.abort.destroy(); } catch {} if (p === 'slack' && sl.sock) try { sl.sock.close(); } catch {} state[p].running = false; }
    else setTimeout(() => { if (!st.on) loop(); }, 400);
  }
}
const status = () => { const c = deps.loadConfig(); return Object.fromEntries(['telegram', 'slack'].map((p) => [p, { ...state[p], enabled: !!(c[p] || {}).enabled, allowed: (c[p] || {}).allowed || [], pairCode: (c[p] || {}).pairCode || '' }])); };
function init(d) { deps = d; configure(); }
function newCode(p) { const c = deps.loadConfig(); deps.saveConfig({ ...c, [p]: { ...(c[p] || {}), pairCode: code() } }); }
function unpair(p, id) { const c = deps.loadConfig(); deps.saveConfig({ ...c, [p]: { ...(c[p] || {}), allowed: ((c[p] || {}).allowed || []).filter((x) => String(x) !== String(id)) } }); }
module.exports = { init, configure, status, newCode, unpair };
