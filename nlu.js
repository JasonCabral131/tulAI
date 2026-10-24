// Understanding engine: a small language model (Qwen via llama.cpp) that runs on this Mac, starts and stops together with Tulai,
// and never uses the gateway or any tokens. It reads what the person said (as heard by speech recognition, English, Tagalog or Taglish),
// fixes mishearings using the real apps, projects, contacts and Chrome profiles on this computer, and decides:
//   command    -> a clean command for the local engine, e.g. "open mb-mobile in vs code"
//   ask_ai     -> a bigger request that should go to Claude
//   not_for_me -> background conversation that was not meant for the assistant
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = +(process.env.TULAY_LLM_PORT || 39656);
let switching=null,localRequests=0;
let proc = null, ready = null, modelDir = '', lastUse = 0, idleTimer = null;
const MODELS = ['qwen2.5-3b-instruct-q4_k_m.gguf', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'];
const serverBin = () => [path.join(process.resourcesPath || '', 'bin', 'llama-server'), '/opt/homebrew/bin/llama-server', '/usr/local/bin/llama-server'].find((p) => fs.existsSync(p)) || null;
const modelDirs = () => [modelDir, path.join(process.resourcesPath || '', 'models')].filter(Boolean);
const modelPath = () => { const activated=require('./active-model').selected();if(activated)return activated; for (const d of modelDirs()) for (const n of MODELS) { const p = path.join(d, n); if (fs.existsSync(p)) return p; } return null; };
const localAvailable = () => !!(serverBin() && modelPath());
function configure(o) { modelDir = (o && o.modelDir) || modelDir; }

function ensureLocal() { return switching || startLocal(); }
/* ---- the long brain: the same model with 100K tokens of memory (YaRN x4), only for requests too big for 32K. Stretching costs a little quality on
   every answer, so it is not the everyday brain; it starts on demand and stops after 10 idle minutes. The model file is shared, so it adds only its
   working memory (~3.7 GB). */
const LONG_PORT = PORT + 1; let longProc = null, longReady = null, longTimer = null;
function touchLong() { clearTimeout(longTimer); longTimer = setTimeout(stopLong, 10 * 60000); }
function stopLong() { clearTimeout(longTimer); const p = longProc; longProc = null; longReady = null; try { p && p.kill(); } catch {} }
function ensureLong() {
  touchLong(); if (longReady) return longReady; if (!localAvailable()) return Promise.resolve(false);
  longReady = new Promise((res) => {
    longProc = spawn(serverBin(), ['-m', modelPath(), '--host', '127.0.0.1', '--port', String(LONG_PORT), '-c', '102400', '--rope-scaling', 'yarn', '--rope-scale', '4', '--yarn-orig-ctx', '32768', '-ngl', '99', '-np', '1', '--jinja', '--no-webui', '--log-disable'], { stdio: 'ignore' });
    const child = longProc; longProc.on('error', () => { if (longProc === child) { longProc = null; longReady = null; } res(false); }); longProc.on('exit', () => { if (longProc === child) { longProc = null; longReady = null; } });
    let n = 0; const poll = () => { fetch(`http://127.0.0.1:${LONG_PORT}/health`).then((r) => (r.ok ? res(true) : Promise.reject())).catch(() => { if (++n > 160 || !longProc) return res(false); setTimeout(poll, 500); }); }; poll();
  });
  return longReady;
}
function startLocal() {
  if (ready) return ready; if (!localAvailable()) return Promise.resolve(false);
  ready = new Promise((res) => {
    proc = spawn(serverBin(), ['-m', modelPath(), '--host', '127.0.0.1', '--port', String(PORT), '-c', '32768', '-ngl', '99', '-np', '1', '--jinja', '--no-webui', '--log-disable'], { stdio: 'ignore' });
    const child=proc;
    proc.on('error', () => { if(proc===child){proc = null; ready = null;} res(false); });
    proc.on('exit', () => { if(proc===child){proc = null; ready = null;} });
    let n = 0; const poll = () => { fetch(`http://127.0.0.1:${PORT}/health`).then((r) => (r.ok ? res(true) : Promise.reject())).catch(() => { if (++n > 120 || !proc) return res(false); setTimeout(poll, 500); }); }; poll();
  });
  return ready;
}

/* ---- which brain answers: the embedded model (default) or an online one chosen in Tulai Desktop (OpenAI, Qwen, Claude, ...) ----
   Speech recognition always stays on this Mac. If the online model cannot be reached, the embedded one answers instead. */
const PRESETS = {
  openai: { base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', name: 'OpenAI / ChatGPT' },
  anthropic: { base: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5', name: 'Claude (Anthropic)' },
  groq: { base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', name: 'Groq' },
  openrouter: { base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', name: 'OpenRouter' },
  ollama: { base: 'http://localhost:11434/v1', model: 'qwen2.5:7b', name: 'Ollama (on this Mac)', keyless: true },
  custom: { base: '', model: '', name: 'Other (OpenAI-compatible address)', keyless: true },
};
let cfgSource = null, cfgAt = 0, cfgVal = null, lastRemote = { ok: null, error: '', at: 0 };
function setModelSource(fn) { cfgSource = fn; cfgAt = 0; }
function remote(cfg) {
  if (cfg === undefined) { if (!cfgSource) return null; if (Date.now() - cfgAt > 3000) { try { cfgVal = cfgSource() || null; } catch { cfgVal = null; } cfgAt = Date.now(); } cfg = cfgVal; }
  if (!cfg || !cfg.provider || cfg.provider === 'local') return null; const p = PRESETS[cfg.provider]; if (!p) return null;
  const base = String(cfg.baseUrl || p.base || '').replace(/\/+$/, ''), model = String(cfg.model || p.model || '').trim(), key = String(cfg.apiKey || '').trim();
  if (!base || !model || (!key && !p.keyless)) return null; return { provider: cfg.provider, base, model, key };
}
async function remoteCall(r, body, timeout) {
  const b = { ...body }; delete b.cache_prompt; b.model = r.model;
  if (b.response_format && b.response_format.schema) { b.response_format = { type: 'json_object' }; const i = (b.messages || []).findIndex((m) => m.role === 'system'); if (i >= 0) b.messages = b.messages.map((m, k) => (k === i ? { ...m, content: m.content + '\nReply with a single JSON object and nothing else.' } : m)); }
  if (r.provider === 'anthropic') delete b.response_format;
  if (r.provider === 'openai') { if (b.max_tokens) { b.max_completion_tokens = b.max_tokens; delete b.max_tokens; } if (/^(o\d|gpt-5)/.test(r.model)) delete b.temperature; }
  const headers = { 'Content-Type': 'application/json', ...(r.key ? { Authorization: 'Bearer ' + r.key } : {}), ...(r.provider === 'anthropic' ? { 'x-api-key': r.key, 'anthropic-version': '2023-06-01' } : {}) };
  const res = await fetch(r.base + '/chat/completions', { method: 'POST', headers, body: JSON.stringify(b), signal: AbortSignal.timeout(Math.max(timeout || 0, 12000)) });
  const j = await res.json().catch(() => ({})); if (!res.ok || !j.choices) throw new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + res.status);
  return j;
}
async function llm(body, timeout, local = false) {
  const r = local ? null : remote();
  if (r) { try { const j = await remoteCall(r, body, timeout); lastRemote = { ok: true, error: '', at: Date.now() }; return j; } catch (e) { lastRemote = { ok: false, error: String(e.message || e).slice(0, 160), at: Date.now() }; } }
  if (!(await ensureLocal())) throw new Error('no model');
  localRequests++;try{
  const res = await fetch(`http://127.0.0.1:${PORT}/v1/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeout || 20000) });
  return await res.json();
  }finally{localRequests--}
}
const available = () => !!remote() || localAvailable();
const ensure = () => (remote() ? Promise.resolve(true) : ensureLocal());
/** Used by the Settings "Test" button: one tiny request to the model that is typed in, before it is saved. */
async function testModel(cfg) {
  const r = remote(cfg); if (!r) return { ok: false, message: cfg && cfg.provider && cfg.provider !== 'local' ? 'Add the API key (and address, for "Other") first.' : 'The embedded model is selected. Nothing to test online.' };
  const t0 = Date.now(); try { const j = await remoteCall(r, { messages: [{ role: 'user', content: 'Reply with the single word: ready' }], max_tokens: 12, temperature: 0 }, 15000); return { ok: true, message: `${PRESETS[r.provider].name}, model ${r.model}: "${String(j.choices[0].message.content || '').trim().slice(0, 40)}" in ${Date.now() - t0} ms` }; } catch (e) { return { ok: false, message: String(e.message || e).slice(0, 200) }; }
}
function reloadLocal() {
 if(switching)return switching;
 switching=(async()=>{
  const until=Date.now()+30000;
  while(localRequests){if(Date.now()>until)throw Error('Model is busy; switch postponed');await new Promise(r=>setTimeout(r,100));}
  stopLong(); // a new brain was switched on: the long copy restarts with it the next time it is needed
  const old=proc;ready=null;
  if(old){await new Promise(resolve=>{const timer=setTimeout(()=>{try{old.kill('SIGKILL')}catch{}resolve()},5000);old.once('exit',()=>{clearTimeout(timer);resolve()});try{old.kill()}catch{clearTimeout(timer);resolve()}});if(proc===old)proc=null;}
  return startLocal();
 })().finally(()=>{switching=null});return switching;
}

function shutdown() { try { if (proc) proc.kill(); } catch {} proc = null; ready = null; }
process.on('exit', shutdown);

const SCHEMA = { type: 'object', properties: { kind: { enum: ['command', 'question', 'task', 'not_for_me'] }, command: { type: 'string' } }, required: ['kind', 'command'], additionalProperties: false };
const FORMS = `Canonical commands the assistant can run (use these exact shapes):
open <app name>
open <project name> in <editor>
open <website or url>
open chrome
chat <person> in teams  (add: saying <message> if a message was given)
send an email to <email address> saying <message>
start meeting notes
stop meeting notes
summarize the meeting
what time is it
what is the date today
set volume to <0-100>
volume up
volume down
mute
unmute
take a screenshot
search for <query>
quit <app name>
what can you do
check my jira status
open jira
create jira report for labels <label, label>
review merge requests of <person>
check my email
write my standup
create meeting summary
what meetings do i have today
remind me <when> about <what>`;

const nrm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 4) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
// vocabulary items whose sound is close to some 1-3 word stretch of what was heard
function closest(text, v) {
  const w = String(text).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean), grams = [];
  for (let i = 0; i < w.length; i++) for (let n = 1; n <= 3 && i + n <= w.length; n++) grams.push(nrm(w.slice(i, i + n).join('')));
  const out = [];
  for (const [kind, list] of [['project', v.projects], ['app', v.apps], ['person', v.contacts]]) for (const item of list || []) {
    const k = nrm(item); if (k.length < 3) continue; let best = 9;
    for (const g of grams) if (g.length >= 3) best = Math.min(best, lev(g, k) / Math.max(g.length, k.length));
    if (best <= 0.34) out.push({ item, kind, score: best });
  }
  return out.sort((a, b) => a.score - b.score).slice(0, 4);
}
// reject commands that invent things the person never said
const EVIDENCE = [
  [/^what time is it$/, /time|oras|ora\b|\bclock\b/],
  [/^what is the date today$/, /date|\bday\b|petsa|araw|today/],
  [/^volume up$/, /loud|volume|turn it up|\bup\b|taas|lakas|hear|louder|malakas/],
  [/^volume down$/, /quiet|volume|\bdown\b|hina|baba|lower|soft|ingay|bawasan/],
  [/^mute$/, /mute|silent|quiet|tahimik|patahimik|shut|sound off|tunog|ingay/],
  [/^unmute$/, /unmute|sound back|sound on|turn.*sound on|buksan.*tunog|bring.*sound|restore/],
  [/^take a screenshot$/, /screenshot|screen|kuhan|capture|picture/],
  [/^search for /, /search|look up|look for|google|find|hanap|saliksik/],
  [/^(quit|close) /, /quit|close|exit|isara|get rid|kill|shut/],
  [/^open /, /open|launch|start|buksan|bukas|run|show|go to|pakita|ilabas|pull up|bring up/],
  [/^what can you do$/, /what can you|help|magagawa|kaya mo|can you do/],
  [/^check my jira status$|^open jira$|^create jira report/, /jira|label|report/],
  [/^review merge requests/, /\bmrs?\b|merge|pull|review|\bprs?\b|mister/],
  [/^check my email$/, /mail|inbox/],
  [/^write my standup$/, [/^(?=.*(?:stand-?up|daily|scrum|my day|plan|araw))(?=.*(?:write|prepare|create|give|make|help|ready|gumawa|buuin|draft|gagawin|ano ang gagawin))/i, /\b(?:what should i say|what do i say|how do i|how should i|paano|ano ang sasabihin)\b/]],
  [/^create meeting summary$/, /meeting|summary|minutes|buod|recap/],
  [/^what meetings do i have today$/, /meeting|calendar|schedule/],
  [/^remind me/, /remind|paalala|alarm|ipaalala/],
  [/^(?:start|stop) meeting notes$|^summari[sz]e the meeting$/, /meeting|notes|pulong|record|minutes/],
];
function valid(cmd, text, v) {
  const t = String(text).toLowerCase(), c = String(cmd).toLowerCase();
  for (const [shape, ev] of EVIDENCE) if (shape.test(c)) { const [must, mustNot] = Array.isArray(ev) ? ev : [ev, null]; if (!must.test(t) || (mustNot && mustNot.test(t))) return false; break; }
  let m = /^chat (.+?) in teams/.exec(c); if (m) { const toks = m[1].split(/\s+/).filter((x) => x.length >= 3); if (!toks.every((x) => t.split(/[^a-z0-9]+/).some((y) => lev(nrm(x), nrm(y)) <= (x.length >= 5 ? 2 : 1))) && !closest(text, v).some((h) => h.kind === 'person' && nrm(h.item) === nrm(m[1]))) return false; }
  m = /^send an email to (\S+)/.exec(c); if (m && !(t.includes('@') || (/\bat\b/.test(t) && /\bdot\b/.test(t)))) return false;
  m = /^open (.+?) in (?:vs code|cursor|xcode|android studio|sublime text)$/.exec(c);
  if (m) { const hits = closest(text, v).filter((h) => h.kind === 'project'); const nm = nrm(m[1]); if (hits.length && !hits.some((h) => nrm(h.item) === nm)) return false; if (!hits.length && !(v.projects || []).some((p) => nrm(p) === nm)) return false; }
  return true;
}

function prompt(text, v, followup, history = []) {
  const list = (a) => (a && a.length ? a.slice(0, 60).join(', ') : '(none)');
  return [
    { role: 'system', content: `You are the understanding module of a voice assistant named Tulai (also heard as Tulay, Tulei, Toolay, "to lay", "ito lay", "hit the light"). The person speaks English, Tagalog or Taglish, often with a Filipino accent, and the speech recognizer makes mistakes.\nYour job: read what was heard and output JSON {"kind": ..., "command": ...}.\n- kind "command": the person wants something done on this computer that matches a canonical command. Put the clean command in "command". Fix misheard names using ONLY the vocabulary below (closest match by sound). Never invent apps, projects or people that are not in the vocabulary, except email addresses and websites the person said.\n- kind "question": a general question, explanation, opinion or small talk that you can answer from general knowledge in a few sentences. command = "".\n- kind "task": real work that needs tools: finishing tickets, git (pull, rebase, commit, push, merge), changing or writing code or files, code reviews, long documents, anything multi-step on a project. command = "".\n- kind "not_for_me": background conversation, a sentence fragment, or something that is not a request to an assistant${followup ? ' (the assistant just said "Yes?" and the person is probably talking to it: treat requests, questions and commands as for the assistant, and use not_for_me only for clearly unrelated background conversation between other people or meaningless fragments)' : ''}. command = "".\nUse recent conversation to resolve references, but never replay old requests. If a request contains several actions, classify it as task; never reduce it to only its first action. Preserve negation, corrections, recipients and message text. Ask for clarification rather than inventing missing details. Drop the assistant's name and politeness words from the command.\n\n${FORMS}\n\nVocabulary on this computer:\nApps: ${list(v.apps)}\nProjects: ${list(v.projects)}\nEditors: VS Code, Cursor, Xcode, Android Studio, Sublime Text\nPeople (Teams contacts): ${list(v.contacts)}\nChrome profiles: ${list(v.profiles)}${(() => { const h = closest(text, v); return h.length ? '\nClosest names by sound to what was heard: ' + h.map((x) => `${x.item} (${x.kind})`).join(', ') + ' (prefer these when they fit)' : ''; })()}` },
    { role: 'user', content: 'Hit the light open my mbmobile in b scode' }, { role: 'assistant', content: '{"kind":"command","command":"open mb-mobile in vs code"}' },
    { role: 'user', content: 'buksan mo yung safari tapos hanapin mo yung pizza' }, { role: 'assistant', content: '{"kind":"task","command":""}' },
    { role: 'user', content: 'can you chat marco in ascendion teams' }, { role: 'assistant', content: '{"kind":"command","command":"chat marco in teams"}' },
    { role: 'user', content: 'To summarize, there are three items' }, { role: 'assistant', content: '{"kind":"not_for_me","command":""}' },
    { role: 'user', content: 'what is the difference between a mutex and a semaphore' }, { role: 'assistant', content: '{"kind":"question","command":""}' },
    { role: 'user', content: 'finish this ticket and make sure you pull and rebase first' }, { role: 'assistant', content: '{"kind":"task","command":""}' },
    { role: 'user', content: 'write me a function that reverses a linked list' }, { role: 'assistant', content: '{"kind":"task","command":""}' },
    { role: 'user', content: 'anong oras na po' }, { role: 'assistant', content: '{"kind":"command","command":"what time is it"}' },
    { role: 'user', content: 'patahimikin mo muna' }, { role: 'assistant', content: '{"kind":"command","command":"mute"}' },
    { role: 'user', content: 'tapos na yung meeting' }, { role: 'assistant', content: '{"kind":"command","command":"stop meeting notes"}' },
    { role: 'user', content: 'pakibuod ng meeting' }, { role: 'assistant', content: '{"kind":"command","command":"summarize the meeting"}' },
    { role: 'user', content: 'okay so to summarize we have three action items' }, { role: 'assistant', content: '{"kind":"not_for_me","command":""}' },
    ...history.filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-8).map(m => ({role:m.role, content:m.content.slice(0,2000)})),
    { role: 'user', content: text },
  ];
}

/** Returns { kind, command } or null when the understanding engine is not available. */
// Route explicit action sequences intact; a small model often keeps only one action.
const DEV_TASK = /^(?:please\s+|pakis?\s*)?(?:fix|implement|refactor|debug|build|code|migrate|upgrade|write (?:unit )?tests? for)\b.{0,60}\b(?:bugs?|features?|code|project|repo(?:sitory)?|functions?|tests?|endpoints?|pages?|components?|modules?|api|login|app|crash|errors?)\b/i;
function devTask(text) { return DEV_TASK.test(String(text).trim()); }
function multiStep(text) {
  return /\b(?:and(?: then)?|then|also|after that|tapos|saka|at pagkatapos|at)\s+(?:(?:please|paki|pakisuyo)\s+)?(?:open|launch|start|stop|search|find|look up|tell|show|read|write|check|send|draft|create|summari[sz]e|buksan|hanapin|isara|simulan|ihinto|sabihin|ipakita|basahin|isulat|gumawa)\b/i.test(String(text));
}
async function interpret(text, vocab = {}, opts = {}) {
  if (multiStep(text)) return {kind:'task', command:''};
  if (devTask(text)) return {kind:'task', command:''}; // "fix the login bug in my project": real development work is a task, never a question
  if (!(await ensure())) return null;
  try {
    const j = await llm({ messages: prompt(text, vocab, opts.followup, opts.history), temperature: 0, max_tokens: 90, cache_prompt: true, response_format: { type: 'json_object', schema: SCHEMA } }, opts.timeout || 8000);
    const out = JSON.parse(j.choices[0].message.content); if (process.env.TULAY_NLU_DEBUG) console.error('model said:', JSON.stringify(out));
    if (out.kind === 'ask_ai') out.kind = 'question';
    if (!['command', 'question', 'task', 'not_for_me'].includes(out.kind)) return null;
    const command = String(out.command || '').trim(); if (out.kind === 'command' && !command) return { kind: opts.followup ? 'not_for_me' : 'question', command: '' };
    if (out.kind === 'command' && !valid(command, text, vocab)) return { kind: opts.followup ? 'not_for_me' : 'question', command: '' };
    return { kind: out.kind, command };
  } catch { return null; }
}
/** A short spoken answer from the embedded model (offline, no tokens). Returns null if the engine is unavailable. */
const answerMessages = (text, opts = {}) => [

      { role: 'system', content: 'You are Tulai, a friendly voice assistant living on the person\'s Mac. You are the user’s partner, personalized through their preferences, instructions and corrections; do not claim they trained your underlying model weights. Your runtime provider can be local or online depending on settings; do not invent your model identity or billing. Never claim an action, reminder, or schedule was created without a tool result. Treat old assistant statements as possibly incorrect. Keep answers concise and easy to scan in chat. Use Markdown: bold the main finding, use short bullet lists for distinct points, and use a small table when comparing data. Italicize a brief limitation when useful. Separate paragraphs and lists with blank lines. Do not output HTML tags. Simple answers can remain plain text. Reply in the language the person used (English, Tagalog or Taglish). Use the configured bot model. Do not assume a task requires company AI or suggest switching providers just because it involves work. If a required tool is unavailable, state the specific limitation without claiming completion. You do not know recent events or exact up-to-date facts; if asked, say you may be out of date. If you are not sure, say so briefly.' },
      ...(opts.lessons?.length ? [{role:'user',content:require('./bot-memory').context(opts.lessons)}] : []),
      ...(opts.history || []).slice(-6), { role: 'user', content: text }];
const JOKES = ['Why did the developer go broke? Because he used up all his cache.', 'Why do programmers prefer dark mode? Because light attracts bugs.', 'I would tell you a UDP joke, but you might not get it.', 'Why was the function sad? It had too many arguments.', 'There are 10 kinds of people: those who understand binary and those who do not.', 'A SQL query walks into a bar, sees two tables and asks: can I join you?', 'Why did the scrum master bring a ladder? To reach the next sprint.', 'My code has no bugs, only surprise features.', 'Why did the tester cross the road? To check the other side as well.', 'How many programmers does it take to change a light bulb? None, that is a hardware problem.', 'Why do Java developers wear glasses? Because they cannot C#.', 'I told my computer I needed a break, and it said: no problem, I will go to sleep.', 'What is a programmer\'s favourite hangout place? Foo Bar.', 'Debugging is like being the detective in a crime movie where you are also the murderer.', 'Why did the server go to therapy? It had too many unresolved requests.', 'I am reading a book about anti-gravity. It is impossible to put down.', 'Why did the product owner bring a pencil to the meeting? To draw up the backlog.', 'Git happens.'];
/** "tell me a joke", then "another one" / "one more": always a joke not told yet in this conversation (a small model keeps retelling the same one). */
function jokeTurn(text, history) {
  const t = String(text).toLowerCase().trim().replace(/[.!?]+$/, ''), told = (history || []).filter((m) => m.role === 'assistant').map((m) => String(m.content)), lastWasJoke = told.length && JOKES.some((j) => told[told.length - 1].includes(j));
  const ask = /\b(?:joke|jokes|biro|make me laugh|something funny|funny one|patawa)\b/.test(t) || (lastWasJoke && /^(?:(?:give me |tell me |okay |ok |and )?(?:another|one more|again|more|a different one|isa pa|another one please|hit me with one more))(?: one| please)?$/.test(t));
  if (!ask) return null; const left = JOKES.filter((j) => !told.some((x) => x.includes(j))), pool = left.length ? left : JOKES, pick = pool[(told.length * 7 + t.length) % pool.length];
  return (told.length ? 'Here is another one: ' : 'Sure! ') + pick;
}
async function answer(text, opts = {}) {
  { const j = jokeTurn(text, opts.history); if (j) return j; }
  if (!(await ensure())) return null;
  try {
    const codey = /```|\b(?:python|javascript|typescript|function|def|class|refactor|bug|unit tests?|patch|diff|code|script|regex|sql)\b/i.test(text); // code needs room: a 170-token reply cuts a function off before its code block closes
    const j = await llm({ temperature: opts.temperature ?? 0.4, max_tokens: opts.maxTokens || (codey ? 900 : 170), cache_prompt: true, messages: [ ...answerMessages(text, opts)] }, opts.timeout || (codey ? 90000 : 20000));
    let t = String(j.choices[0].message.content || '').trim();
    const earlier = (opts.history || []).filter((m) => m.role === 'assistant').map((m) => String(m.content)), same = (a, b) => { const A = new Set(String(a).toLowerCase().match(/[a-z']+/g) || []), B = new Set(String(b).toLowerCase().match(/[a-z']+/g) || []); if (!A.size || !B.size) return false; let k = 0; for (const w of A) if (B.has(w)) k++; return k / (A.size + B.size - k) > 0.6; }, repeats = (x) => earlier.some((e) => same(x, e));
    for (let tries = 0; t && earlier.length && repeats(t) && tries < 2; tries++) { try { const j2 = await llm({ temperature: 0.9 + tries * 0.2, max_tokens: opts.maxTokens || (codey ? 900 : 170), cache_prompt: false, messages: [...answerMessages(text, opts).slice(0, -1), { role: 'user', content: text + '\n\n(You already said: ' + earlier.slice(-3).map((e) => '"' + e.slice(0, 160) + '"').join('; ') + '. Give a NEW, different answer now; never repeat any of those.)' }] }, opts.timeout || (codey ? 90000 : 20000)); const t2 = String(j2.choices[0].message.content || '').trim(); if (t2) t = t2; } catch { break; } } // asked again ("another one", "what?"): never a reply that was already given
    if (codey && t && !t.includes('```') && /^(?:def |class |import |from \w+ import |async function |function |const |export |interface )/.test(t)) t = '```' + (/^(?:async function|function|const|export|import\s*\{|import \w+ from|import \* as)/.test(t) ? (/\binterface\b|: (?:string|number|boolean)\b|<\w+>/.test(t) ? 'typescript' : 'javascript') : 'python') + '\n' + t + '\n```'; // bare code: shown as a code block
    return t || null;
  } catch { return null; }
}
/** Was the assistant addressed at the start, even though speech recognition mangled its name? Returns { addressed, command } or null. */
const WAKE_SCHEMA = { type: 'object', properties: { addressed: { type: 'boolean' }, command: { type: 'string' } }, required: ['addressed', 'command'], additionalProperties: false };
const WAKE_SHOTS = [
  ['HLA open Chrome browser.', true, 'open Chrome browser'], ['Hey, to lay, what time is it?', true, 'what time is it'], ['Hit the light.', true, ''], ['Hey, ito lay.', true, ''], ['OK to lay start meeting notes', true, 'start meeting notes'],
  ['Hei, Tulei! open safari', true, 'open safari'], ['Hey Thule do a dance', true, 'do a dance'], ['Hey Chul-A, set volume to 30', true, 'set volume to 30'], ['Pay 2A, check my Jira status', true, 'check my Jira status'],
  ['Hey till I', true, ''], ['Tulai, open my Viscode.', true, 'open my Viscode'],
  ['I am going to review it', false, ''], ['To summarize, there are three action items', false, ''], ['hello to everyone in the team', false, ''], ['a tulip is a flower', false, ''], ['we should open the PR today', false, ''],
  ['okay so the ticket is per endpoint', false, ''], ['hey do you know the time', false, ''], ['Oh my God, yeah.', false, ''], ['I used to keep tapas', false, ''], ['can you open the door', false, ''],
];
async function judgeWake(text, timeout = 4000) {
  if (!(await ensureLocal())) return null; // everything you say before the wake word is judged on this Mac only, never sent online
  const sys = { role: 'system', content: 'The voice assistant is named Tulai (say: too-LIE). Speech recognition often mangles the name at the very START of a sentence into similar-sounding words, for example: HLA, to lay, ito lay, too late, Hit the light, Hei Tulei, Thule, Chul-A, 2A, till I, Julie, Tula, Tuloy. Decide: did the speaker address the assistant by name at the start? Answer {"addressed":true,"command":"<the rest of the sentence after the name>"} only when the first one to three words sound like a greeting plus the name Tulai. If the sentence is just ordinary conversation, or only the later words look like a command, answer {"addressed":false,"command":""}. Be strict: when in doubt, false.' };
  const shots = WAKE_SHOTS.flatMap(([t, a, c]) => [{ role: 'user', content: t }, { role: 'assistant', content: JSON.stringify({ addressed: a, command: c }) }]);
  try {
    const j = await llm({ messages: [sys, ...shots, { role: 'user', content: String(text) }], temperature: 0, max_tokens: 60, cache_prompt: true, response_format: { type: 'json_object', schema: WAKE_SCHEMA } }, timeout, true);
    const o = JSON.parse(j.choices[0].message.content); return { addressed: !!o.addressed, command: String(o.command || '').trim() };
  } catch { return null; }
}
/** An emotion or action word we have no ready-made move for: which of our moves is the closest? Returns a move name or null. */
const MOVE_NAMES = ['dance', 'dive', 'cry', 'giggle', 'laugh', 'wave', 'jump', 'spin', 'sleep', 'angry', 'love', 'sing', 'bow', 'clap', 'scared', 'wink', 'celebrate', 'excited', 'happy', 'surprised', 'shy', 'thinking', 'tired', 'dizzy', 'proud'];
async function emote(word, timeout = 4000) {
  if (!(await ensureLocal())) return null;
  try {
    const j = await llm({ messages: [{ role: 'system', content: `A small robot can act out these moves: ${MOVE_NAMES.join(', ')}. The person asked it to be or act "${word}" (English or Tagalog). Pick the single closest move. Always pick the closest one, even if it is not perfect. Answer JSON {"move":"..."}.` }, { role: 'user', content: String(word) }], temperature: 0, max_tokens: 20, response_format: { type: 'json_object', schema: { type: 'object', properties: { move: { enum: MOVE_NAMES } }, required: ['move'], additionalProperties: false } } }, timeout, true);
    const m = JSON.parse((j).choices[0].message.content).move; return MOVE_NAMES.includes(m) ? m : null;
  } catch { return null; }
}
/** One chat turn with optional tools (OpenAI style). Returns the assistant message object or null. */
async function chat({ messages, tools, max_tokens = 220, temperature = 0.2, timeout = 25000 }) {
  if (!(await ensure())) return null;
  try {
    const j = await llm({ messages, ...(tools ? { tools, tool_choice: 'auto' } : {}), max_tokens, temperature, cache_prompt: true }, timeout);
    return j.choices && j.choices[0] ? j.choices[0].message : null;
  } catch { return null; }
}
module.exports = { ensureLong, touchLong, stopLong, LONG_PORT, _answerMessages: answerMessages, _prompt: prompt, reloadLocal, ensureLocal, localAvailable, PRESETS, setModelSource, testModel, brain: () => { const r = remote(); return r ? { kind: 'online', provider: r.provider, name: PRESETS[r.provider].name, model: r.model, last: lastRemote } : { kind: 'local' }; }, health: () => ({ running: !!proc, model: (() => { const m = modelPath(); return m ? path.basename(m) : null; })(), available: available(), online: (() => { const r = remote(); return r ? { provider: r.provider, model: r.model, last: lastRemote } : null; })() }), emote, MOVE_NAMES, judgeWake, chat, answer, closest, valid, multiStep, configure, available, ensure, interpret, shutdown, port: PORT };
