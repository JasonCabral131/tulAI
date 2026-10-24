// The floating bot's conversation: one persistent chat ("bot-main") that you can talk or type to. Streams agent events back to the caller.
const store = require('./store');
const { runAgent, resolveApproval } = require('./agent');
const { EventEmitter } = require('events');
const missions = require('./missions');

const BOT_ID = 'bot-main';
const sessions = new Map(); // chat id -> { res, pending[] }

function load(cfg, id = BOT_ID, title = '🎙 Tulai bot') {
  const ex = store.listChats().find((c) => String(c.id) === id);
  return ex ? Object.assign(ex, { owner: 'bot' }) : { id, title, owner: 'bot', messages: [], history: [], workspace: cfg.workspace, updated: Date.now(), unread: false }; // owner: the bot's own chats stay out of Tulai Desktop's list
}
/** "/clear", "clear today convo", "clear our chat", "new chat", "burahin ang usapan": start this conversation fresh. */
const CLEAR = /^(?:\/(?:clear|new|reset)|(?:(?:hey|hi|ok)\s+tula[iy][,\s]+)?(?:please\s+|pls\s+)?(?:clear|reset|wipe|erase|delete|empty|start)\s+(?:a\s+)?(?:(?:the|my|our|this|today'?s?|all|of|new|fresh)\s+)*(?:convo|conversation|chat|chats|history|messages|thread)(?:\s+(?:today|now|please|po|history))*|new\s+(?:chat|conversation)|(?:burahin|i-?clear|linisin)\s+(?:mo\s+)?(?:ang\s+|yung\s+)?(?:usapan|chat|convo))[.!]?$/i;
function trim(h) { // keep the recent turns, starting on a plain user message so tool calls and results stay paired
  if (h.length <= 80) return h;
  for (let i = h.length - 40; i < h.length; i++) if (h[i].role === 'user' && typeof h[i].content === 'string') return h.slice(i);
  return h.slice(-4);
}
const state = (cfg, id = BOT_ID) => { const c = load(cfg, id), current = sessions.get(id); return { busy: !!current, pending: current ? current.pending : [], messages: c.messages.slice(-12).map((m) => ({ role: m.role, content: (m.content || '').slice(0, 1500), atts: undefined, views:(m.viewPaths||[]).map(p=>require('./viewer').register(p)).filter(Boolean) })) }; };

const brainLog = (o) => { try { const f = require('path').join(process.env.GC_DATA_DIR || __dirname, 'brain.log'), fs = require('fs'); fs.appendFileSync(f, new Date().toISOString().slice(11, 19) + ' ' + JSON.stringify(o) + '\n'); if (fs.statSync(f).size > 150000) fs.writeFileSync(f, ''); } catch {} };
async function say(text, { send, deps, id = BOT_ID, title, mode, effort, system, allow, reset, noComputer, voice, followup }) {
  if (sessions.has(id)) throw new Error('The bot is still working on your last request.');
  if (CLEAR.test(String(text).trim())) { const c = load(deps.loadConfig(), id, title); c.messages = []; c.history = []; c.updated = Date.now(); try { store.saveChat(c); } catch {} const r = 'Cleared. This conversation starts fresh (what I remember about you is kept).'; send({ type: 'text', delta: r }); send({ type: 'done' }); return r; } // /clear really clears
  if (!String(id).startsWith('qa-')) { globalThis.__tulaiLastUserAt = Date.now(); try { { const c0 = load(deps.loadConfig(), id); require('./missed').observe(text, c0.history || [], c0.updated || 0); } } catch {} } // the background conversation tests wait until you have been quiet for a while
  const cfg = deps.loadConfig();
  if(!noComputer){try{const learned=require('./bot-memory').capture(text);if(learned)send({type:'learned_memory',text:learned});}catch{send({type:'memory_error',message:'I could not save that preference.'});}}
  const mood0 = require('./mood').analyze(text), profile = require('./profile'), hint0 = profile.seen(text, mood0);
  let agentJob = null;
  if (!noComputer) { // simple requests about this computer are done right here, without asking the model
    const controller = new AbortController();
    const localRun = {controller,pending:[]}; sessions.set(id,localRun);
    try {
    let local = null;
    try { const deny = cfg.computerDenyApps && cfg.computerDenyApps.length ? cfg.computerDenyApps : require('./computer').DEFAULT_DENY; local = await require('./local').handle(text, { recentViewPaths:(load(cfg,id).messages||[]).filter(m=>m.role==='assistant'&&m.viewPaths?.length).slice(-1).flatMap(m=>m.viewPaths), workConfig:cfg, deny, meeting: require('./meeting'), sid: id, signal: controller.signal, lessons: await require('./bot-memory').retrieve(text), onProgress: send, history: (load(cfg, id).history || []).filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content).slice(-8).map(m => ({role:m.role, content:m.content.slice(0, 2000)})), nlu: require('./nlu'), voice: !!voice, followup: !!followup }); } catch (e) { try { require('fs').appendFileSync(require('path').join(process.env.GC_DATA_DIR || '', 'errors.log'), `${new Date().toISOString()} brain: ${String(text).slice(0, 80)} -> ${e && e.stack}\n`); } catch {} local = { reply: `I tried, but it failed: ${e.message}` }; }
    if(controller.signal.aborted){send({type:'text',delta:'Stopped. No further steps will run.'});send({type:'done'});return 'Stopped.';}
    brainLog({ said: String(text).slice(0, 120), voice: !!voice, followup: !!followup, decided: !local ? 'no local answer: asked whether to use Tulai Desktop' : local.silent ? 'ignored (not for me)' : local.delegate ? 'sent to Tulai Desktop' : (local.via || 'local rule'), reply: local && local.reply ? String(local.reply).slice(0, 80) : undefined, command: local && local.command });
    if (local && local.delegate) { process.emit('tulay:delegate', local.delegate); }
    if (local && local.perform) { send({ type: 'perform', move: local.perform }); process.emit('tulay:perform', local.perform); }
    if (local && local.silent) { send({ type: 'silent' }); send({ type: 'done' }); return ''; } // background talk after "how can I help": ignored
    if (local && local.agent) { agentJob = local.agent; } // coding work: the full coding agent runs below, in this chat, on the bot's own brain
    else if (local) {
      if (hint0.repeated && mood0.level !== 'calm' && !/^I tried, but it failed|^Sorry/.test(local.reply)) local.reply = 'Sorry about that. ' + local.reply; // only when you had to ask twice AND sound annoyed: a similar new request is not a complaint
      profile.outcome('local', text, !/^I tried, but it failed|^I could not find/.test(local.reply)); try { require('./habits').record(text, local.reply); } catch {} if (local.via) local.reply = local.reply;
      const lc = load(cfg, id, title); lc.history = trim(lc.history || []); const reply = { role: 'assistant', content: local.reply, parts: [{ t: 'text', text: local.reply }], usage: local.via || 'bot response' };
      if(local.views)reply.viewPaths=local.views.map(v=>require('./viewer').get(v.id)?.path).filter(Boolean);
      lc.messages.push({ role: 'user', content: text, atts: [], hlen: lc.history.length }, reply); lc.history.push({ role: 'user', content: text }, { role: 'assistant', content: local.reply });
      lc.updated = Date.now(); try { store.saveChat(lc); } catch {}
      send({ type: 'text', delta: local.reply });
      if(local.navigation)send({type:'document_navigation',navigation:local.navigation});
      if (local.chart) send({ type: 'chart', chart: local.chart });
      if (local.views && local.views.length) send({ type: 'views', views: local.views });
      if (local.terminal) send({ type: 'terminal', tool: local.terminal.tool || '', install: local.terminal.install || '' }); // "log in to claude": a terminal opens in the chat
      const files = (local.files || []).filter((f) => f && f.path); if (files.length) send({ type: 'files', files: files.map((f) => ({ name: f.name, ext: f.ext, label: f.label, preview: f.preview })) });
      else if (!local.file && !local.chart && String(local.reply).length >= 120) { try { require('./export').setLast(local.reply, 'Tulai answer'); } catch {} } // a long answer can be turned into a file with "export that as PDF"
      send({ type: 'done' }); return local.reply;
    }
    if (!agentJob) {
    // The bot never calls the company AI by itself: whatever its own brain could not do goes to Tulai Desktop, which uses the company AI.
    const handoff = 'My configured bot model did not return an answer. I have not switched providers or opened Desktop. Check the bot model connection and try again.';
    const hc = load(cfg, id, title); hc.history = trim(hc.history || []); const hreply = { role: 'assistant', content: handoff, parts: [{ t: 'text', text: handoff }], usage: 'bot model unavailable' };
    hc.messages.push({ role: 'user', content: text, atts: [], hlen: hc.history.length }, hreply); hc.history.push({ role: 'user', content: text }, { role: 'assistant', content: handoff }); hc.updated = Date.now(); try { store.saveChat(hc); } catch {}
    try { if (!String(id).startsWith('qa-')) require('./missed').note({ kind: 'no answer', asked: text, got: handoff }); } catch {}
    send({ type: 'text', delta: handoff }); send({ type: 'done' }); return handoff;
    }
    } finally { if(sessions.get(id)===localRun)sessions.delete(id); }
  }
  // Tulai Bot always uses our trained AI (server.js usesLocal), so the Desktop's company-AI choice and its key never matter here
  const chat = load(cfg, id, title), ws = agentJob && agentJob.workspace && require('fs').existsSync(agentJob.workspace) ? agentJob.workspace : chat.workspace && require('fs').existsSync(chat.workspace) ? chat.workspace : cfg.workspace;
  if (agentJob) { try { send({ type: 'note', text: `Working on it with my coding tools${agentJob.workspace ? ' in ' + require('path').basename(agentJob.workspace) : ''}: file edits happen directly (undo with git); commands ask you first.` }); } catch {} }
  if (reset) { chat.messages = []; chat.history = []; }
  chat.history = trim(chat.history || []); chat.workspace = ws;
  const user = { role: 'user', content: text, atts: [], hlen: chat.history.length }, reply = { role: 'assistant', content: '', parts: [] };
  chat.messages.push(user, reply); chat.history.push({ role: 'user', content: text });
  const res = new EventEmitter(); res.writableEnded = false; res.writeHead = () => {}; res.end = () => { res.writableEnded = true; };
  const run = { res, pending: [], quiet: true, failed: false, usage: null }; sessions.set(id, run);
  let buf = '', last = 0, edited = false;
  res.write = (chunk) => {
    buf += String(chunk); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const piece = buf.slice(0, i); buf = buf.slice(i + 2); if (!piece.startsWith('data:')) continue; let ev; try { ev = JSON.parse(piece.slice(5)); } catch { continue; } if (agentJob && ev.type === 'tool') { if (/^(?:edit_file|write_file|bash)$/.test(ev.name)) edited = true; try { require('./helper-bot').progress(ev.name, ev.input || ev.args || {}); } catch {} } try { missions.apply(chat, reply, ev, run); } catch {} send(ev); }
    if (Date.now() - last > 3000) { last = Date.now(); chat.updated = Date.now(); try { store.saveChat(chat); } catch {} }
  };
  const picked = require('./engine').pick(text, { mood: mood0, repeated: hint0.repeated, configured: cfg.botModel, saver: cfg.interaction === 'saver' }), tier = picked.tier;
  const sys = agentJob ? ['You are Tulai\'s coding assistant with direct access to the user\'s project through tools.', require('./agent-mode').CODER].join('\n\n') : [require('./engine').calmHint(mood0, hint0.repeated), cfg.system, 'You are Tulai\'s floating assistant. The person may be talking to you by voice, so answer in short, natural sentences (usually one to three) and avoid markdown, tables and long lists in your spoken-style reply. Do the task first, then briefly say what you did. If the result is long, give the headline and say the details are in the chat.'].filter(Boolean).join('\n\n');
  const t0 = Date.now();
  try {
    const H = agentJob ? require('./helper-bot') : null; if (H) H.start(text);
    let failedOnce = false; // after a failed check, a try that changes nothing is checked again, never "nothing to test"
    for (let attempt = 1; ; attempt++) { // the helper bot works; the main bot checks; a failed check goes back to the helper (up to 3 tries)
      res.writableEnded = false; edited = false;
  await runAgent({ upstream: deps.upstream, fetchPage: deps.fetchPage, agentFor: deps.agentFor, cfg: { ...cfg, maxRunMinutes: 20 }, res, body: { model: cfg.models[tier], messages: chat.history, mode: mode || (agentJob && agentJob.mode) || cfg.botMode || 'ask', noPush: true, workspace: ws, allow: allow || cfg.botAllow || [], effort: effort || cfg.botEffort || 'low', system: [sys, system].filter(Boolean).join('\n\n'), noComputer: !!noComputer, max_tokens: cfg.maxTokens, temperature: cfg.temperature } });
      if (!H) break;
      const c = (edited || failedOnce) ? H.check(ws) : null; brainLog({ helperCheck: { attempt, edited, ws, ran: c && c.cmd, ok: c && c.ok } }); H.checking(); try { send({ type: 'note', text: 'Checking the helper\'s work…' }); } catch {}
      if (!c || c.ok) { H.done(c && c.cmd); try { send({ type: 'note', text: c ? `Checked: ${c.cmd} passed ✅` : 'The helper finished; there was nothing to test.' }); } catch {} setTimeout(() => H.close(), 6000); break; }
      const why = (c.out.split('\n').filter(Boolean).pop() || 'failed').slice(0, 160);
      if (attempt >= 3) { H.gaveUp(why); try { send({ type: 'note', text: `⚠️ The check still fails after 3 tries (${c.cmd}): ${why}. The changes are in place for you to look at; nothing was pushed.` }); } catch {} setTimeout(() => H.close(), 8000); break; }
      failedOnce = true; H.sad(why); try { send({ type: 'note', text: `Checked: ${c.cmd} failed (${why}). Sending it back to the helper, try ${attempt + 1} of 3.` }); } catch {}
      await new Promise((r) => setTimeout(r, 3500)); H.serious(attempt + 1);
      chat.history.push({ role: 'user', content: `I ran \`${c.cmd}\` to check your work and it failed:\n\n${c.out}\n\nFix the cause in the files, then run the check again.` });
    }
  } finally {
    for (const p of reply.parts) if (p.t === 'tool' && ['queued', 'approval', 'running'].includes(p.state)) p.state = 'denied';
    { const plain = reply.parts.filter((p) => p.t === 'text').map((p) => p.text).join(''); // the company AI could not be reached (off VPN, offline): the local brain answers instead of an error
      if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ECONNRESET|fetch failed|socket hang up|network/i.test(plain) && plain.replace(/⚠️[\s\S]*$/, '').trim().length < 5) {
        let a = null; try { a = await require('./nlu').answer(text, { history: [], lessons: await require('./bot-memory').retrieve(text) }); } catch {}
        if (a) { reply.parts = reply.parts.filter((p) => p.t !== 'text'); reply.parts.push({ t: 'text', text: a }); reply.note = 'The company AI could not be reached, so my local brain answered.'; try { if (send) { send({ type: 'text', delta: '\n\n' + a }); send({ type: 'note', text: reply.note }); } } catch {} run.failed = false; }
      } }
    reply.content = reply.parts.filter((p) => p.t === 'text').map((p) => p.text).join('') || '(no reply)';
    if (run.usage) reply.usage = `${(run.usage.prompt_tokens || 0).toLocaleString()} in · ${(run.usage.completion_tokens || 0).toLocaleString()} out · ${Math.round((Date.now() - t0) / 1000)}s`;
    try { profile.outcome('model', text, !run.failed); } catch {}
    chat.updated = Date.now(); chat.unread = id !== BOT_ID; store.saveChat(chat); sessions.delete(id);
    try { deps.usage({ engine: require('./engines').usageTag(require('./engines').chosen(cfg, 'bot').id), chat: id, title: chat.title, workspace: ws, model: cfg.models[tier], tier, effort: cfg.botEffort || 'low', mode: cfg.botMode || 'ask', agent: true, prompt: run.usage?.prompt_tokens || 0, completion: run.usage?.completion_tokens || 0, cached: run.usage?.cached || 0, secs: Math.round((Date.now() - t0) / 1000), stopped: false }); } catch {}
  }
  return reply.content;
}
function stop(id = BOT_ID) { const current = sessions.get(id); if (!current) return false; if(current.controller){current.controller.abort();return true;} current.res.emit('close'); for (const p of current.pending) resolveApproval(p.key, 'deny'); return true; }
function stopAll() { let n = 0; for (const id of [...sessions.keys()]) if (stop(id)) n++; return n; }
/** Starts the bot conversation from nothing (used by the acceptance runner so one answer can never lean on an earlier one). */
function wipe(deps, id = BOT_ID) { try { const ch = load(deps.loadConfig(), id); ch.messages = []; ch.history = []; store.saveChat(ch); } catch {} }
module.exports = { CLEAR, say, stop, stopAll, state, busy: (id) => sessions.has(id), BOT_ID, wipe, load };
