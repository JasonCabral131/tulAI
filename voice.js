// Voice for the main process: runs the on-device speech helper (push to talk and "Hey Tulay"), and speaks replies with macOS "say".
const { spawn, execFile } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const helper = () => { for (const p of [path.join(process.resourcesPath || '', 'bin', 'tulay-listen'), path.join(__dirname, 'build', 'bin', 'tulay-listen')]) if (fs.existsSync(p)) return p; return null; };
let aliases = [], child = null, kind = null, wanted = false, locale = '', onEvent = () => {}, blocked = null, failures = 0, retry = null, sayProc = null;

/* ---- whisper.cpp (free, on-device): much better than the built-in recognizer, especially for accents and Taglish ---- */
let lang = 'en', modelDir = '', txChain = Promise.resolve(), armedUntil = 0;
const whisperBin = () => [path.join(process.resourcesPath || '', 'bin', 'whisper-cli'), '/opt/homebrew/bin/whisper-cli', '/usr/local/bin/whisper-cli'].find((p) => fs.existsSync(p)) || null;
const modelPath = () => { for (const d of [modelDir, path.join(process.resourcesPath || '', 'models')]) for (const n of ['ggml-large-v3-turbo-q5_0.bin', 'ggml-small.bin', 'ggml-base.bin', 'ggml-base.en.bin', 'ggml-tiny.bin']) { const p = path.join(d, n); if (d && fs.existsSync(p)) return p; } return null; };
const engine = () => (whisperBin() && modelPath() ? 'whisper' : 'apple');
function configure(o) { modelDir = (o && o.modelDir) || ''; if (o && o.lang && o.lang !== lang) { lang = o.lang; shutdown(); } }
const NAME = "ito\\s?la[iy]e?|itu\\s?la[iy]|tuloy|tuloi|tuloe|toloi|toloy|tooloy|tulloy|tuly|tuli|tulay|too\\s?lie|to\\s?lie|tooly|tuley|toolay|tu\\s?lay|tula|julie|to\\s?lay|too\\s?late|to\\s?late|tulle?y|tooley|tulley|tullay|tulai|tulaye|tulei|tule|tulle|to-?lay|too-?lay|tu-?lay|toolay|toola|tolay|toolie|toolee|tuley|tulee";
const NAME_STRICT = 'tulay|tuley|tulai|tulei|tule|tulee|toolay|toola|tolay|toolie|toolee|thule|thulay|tulle|tu\\s?lay|too\\s?lie|tooly|tooley|tulley|tullay|tulaye|toole|tu\\s?le|too\\s?le';
const NAME_ALL = NAME + '|' + NAME_STRICT;
const wakeRe = () => new RegExp(`\\b(?:hey|hei|hay|okay|ok)[\\s,.!?-]*(?:${NAME_ALL})\\b[,.!?-]?\\s*|\\b(?:hi|hello|he|a|ay)[\\s,.!?-]+(?:${NAME_STRICT}|tuloy|tuloi|toloy|tooloy|tulloy)\\b[,.!?-]?\\s*|^\\s*(?:${NAME_STRICT})\\b[,.!?]?\\s*${aliases.length ? '|^\\s*(?:' + aliases.map((x) => x.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/ /g, '\\\\s+')).join('|') + ')\\b[,.!?]?\\s*' : ''}`, 'i');
function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
// Sound-alike fallback: the first words, squashed together, are close enough to "hey tulay" or "okay tulay".
function fuzzyWake(text) {
  const words = text.split(/\s+/).filter(Boolean); if (words.length < 2) return null;
  if (!/^(hey|hay|hei|heh|hi|ey|eh|okay|okey|ok|ay|a)[,.!?-]*$/i.test(words[0])) return null;
  for (let take = 1; take <= Math.min(2, words.length - 1); take++) {
    const name = words.slice(1, 1 + take).join('').toLowerCase().replace(/[^a-z]/g, '');
    if (name.length >= 3 && name.length <= 7 && /[tdji]/.test(name[0]) && /l/.test(name) && lev(name, 'tulay') <= (name.length >= 6 ? 2 : 1)) return words.slice(1 + take).join(' ').replace(/^[\s,.!?-]+/, '').trim();
  }
  return null;
}
// Accent tier: how "Hey Tulay" often comes out of the recognizer for Filipino-accented English ("Hit the light", "Hey the lie").
// Only accepted when it is the whole utterance (a short call) or is followed by a clear command verb, so ordinary sentences do not wake it.
const ACCENT = /^\s*(?:hit|hate|heat|hey|hay|hi|he)[,.!?-]*\s+(?:the|da|duh|to|too|do)[,.!?-]*\s*(?:light|like|lie|lay|lye|late|lite|lait|laya|lay)\b[,.!?-]*\s*/i;
const VERB = /^(?:open|start|stop|what|what's|set|send|email|mail|search|play|pause|mute|unmute|quit|close|write|tell|launch|volume|lock|summari[sz]e|record|remind|call|please|help|screenshot|how many|how much|what time)\b/i;
function accentWake(text) {
  const m = ACCENT.exec(text); if (!m) return null;
  const rest = text.slice(m[0].length).trim();
  if (!rest) return text.trim().split(/\s+/).length <= 4 ? '' : null;
  return VERB.test(rest) ? rest : null;
}
function afterWake(text) { text = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); const m = wakeRe().exec(text); return m && !text.slice(0,m.index).trim() ? text.slice(m.index + m[0].length).trim() : (fuzzyWake(text) ?? accentWake(text)); }
const WS_PORT = +(process.env.TULAY_WHISPER_PORT || 39655); let wsProc = null, wsReady = null;
const serverBin = () => { const b = whisperBin(); if (!b) return null; const s = path.join(path.dirname(b), 'whisper-server'); return fs.existsSync(s) ? s : null; };
function ensureServer() { // keeps the model loaded in memory so each phrase takes about a tenth of a second
  if (wsReady) return wsReady; const sb = serverBin(), model = modelPath(); if (!sb || !model) return (wsReady = Promise.resolve(false)).then((x) => { wsReady = null; return x; });
  wsReady = new Promise((res) => {
    wsProc = spawn(sb, ['-m', model, '--host', '127.0.0.1', '--port', String(WS_PORT), '-l', lang, '-t', '6', '-bs', process.env.TULAY_WS_BS || '1'], { stdio: 'ignore' });
    wsProc.on('error', () => { wsProc = null; wsReady = null; res(false); }); wsProc.on('exit', () => { wsProc = null; wsReady = null; });
    let n = 0; const poll = () => { fetch(`http://127.0.0.1:${WS_PORT}/`).then(() => res(true)).catch(() => { if (++n > 60 || !wsProc) return res(false); setTimeout(poll, 500); }); }; poll();
  });
  return wsReady;
}
// No transcription prompt: Whisper can repeat hints during silence.
async function viaServer(file) {
  if (!(await ensureServer())) return null;
  try { const fd = new FormData(); fd.append('file', new Blob([fs.readFileSync(file)]), 'a.wav'); fd.append('response_format', 'json'); fd.append('temperature', '0.0'); const r = await fetch(`http://127.0.0.1:${WS_PORT}/inference`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) }); if (!r.ok) return null; const j = await r.json(); if (typeof j.text !== 'string') return null; const tx = String(j.text || ''); return /hey tulai, open youtube\.com, chrome, teams/i.test(tx) ? '' : tx; /* never let the hint leak out as speech */ } catch { return null; }
}
const tidy = (so) => { let t = String(so || '').replace(/\[[^\]]*\]|\([^)]*\)|[♪♫]/g, ' ').replace(/\s+/g, ' ').trim(); if (/^(you|thank you\.?|thanks for watching\.?|bye\.?|\.+)$/i.test(t)) t = ''; return t; };
function shutdown() { try { if (wsProc) wsProc.kill(); } catch {} wsProc = null; wsReady = null; }
process.on('exit', shutdown);
function transcribe(file) {
  return viaServer(file).then((raw) => (raw !== null ? (() => { try { fs.unlinkSync(file); } catch {} return tidy(raw); })() : transcribeCli(file)));
}
function transcribeCli(file) {
  return new Promise((resolve) => {
    const model = modelPath(), bin = whisperBin(); if (!model || !bin) return resolve('');
    execFile(bin, ['-m', model, '-f', file, '-nt', '-np', '-l', lang, '-t', '4', '-bs', '5'], { timeout: 60000, maxBuffer: 4e6 }, (e, so) => {
      try { fs.unlinkSync(file); } catch {}
      let t = String(so || '').replace(/\[[^\]]*\]|\([^)]*\)|[♪♫]/g, ' ').replace(/\s+/g, ' ').trim();
      if (/^(you|thank you\.?|thanks for watching\.?|bye\.?|\.+)$/i.test(t)) t = '';
      resolve(t);
    });
  });
}
// When the same short phrase is heard twice and then, within seconds, a proper "Hey Tulai" follows, that phrase was probably
// how this person's "Hey Tulai" sounds to the recognizer. Tulai learns it by itself (and the person can reset it in Settings).
const misses = [];
const norm2 = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
function plausibleWakeAlias(value) {
  const name=norm2(value).replace(/^(?:hey|hi|hello|okay|ok|hay|hei)\s+/, '');
  return new RegExp('^(?:'+NAME_ALL+'|hla|ula)$','i').test(name);
}
function learnFromMisses() {
  const now = Date.now(), recent = misses.filter((m) => now - m.t < 12000); misses.length = 0; const counts = {};
  for (const m of recent) counts[m.key] = (counts[m.key] || 0) + 1;
  for (const [key, n] of Object.entries(counts)) if (n >= 2 && key.length >= 5 && plausibleWakeAlias(key) && !aliases.includes(key) && !/^(yes|okay|thank you|thanks|hello|hi|hey|no|bye|you)$/.test(key)) { aliases.push(key); onEvent({ type: 'learned', alias: key, mode: 'wake' }); }
}
// "HLA open Chrome browser": the wake word was mangled but what follows is clearly a command we know. Accept it, and remember the mangled
// word as this person's way of saying "Hey Tulai". Ordinary words are never taken as a wake word.
const COMMON = new Set(['so', 'and', 'then', 'but', 'or', 'to', 'the', 'a', 'an', 'if', 'oh', 'ok', 'okay', 'yes', 'no', 'um', 'uh', 'well', 'now', 'just', 'also', 'we', 'i', 'you', 'he', 'she', 'it', 'they', 'can', 'could', 'will', 'would', 'should', 'let', 'lets', 'please', 'yeah', 'yep', 'sure', 'go', 'do', 'not', 'dont', 'lets', 'who', 'what', 'why', 'how', 'when', 'where', 'that', 'this', 'there', 'here']);
function garbledWake(text) {
  const m = /^\W*([A-Za-z]{2,5})[,.!?]?\s+((?:open|launch|quit|close|mute|unmute|volume|take|dance|dive|what)\b.*)$/i.exec(String(text).trim());
  if (!m || COMMON.has(m[1].toLowerCase()) || !plausibleWakeAlias(m[1])) return null;
  try { if (!require('./local').looksLikeCommand(m[2])) return null; } catch { return null; }
  return { prefix: m[1].toLowerCase(), rest: m[2].replace(/[.!?]+$/, '').trim() };
}
// The language model says "this was addressed to Tulai". Ordinary greetings ("hey do you know the time", "hi there how are you") fool it, so we also
// require that what comes before the command is not just a plain greeting plus everyday words, but something that is plausibly a mangled "Tulai".
const GREETING = new Set(['hey', 'hay', 'hei', 'hi', 'hello', 'ok', 'okay', 'ey', 'eh', 'ay', 'a', 'he', 'heh', 'yo']);
const EVERYDAY = new Set(['to', 'there', 'you', 'do', 'can', 'could', 'would', 'the', 'an', 'is', 'so', 'and', 'it', 'we', 'i', 'how', 'what', 'why', 'are', 'good', 'morning', 'afternoon', 'evening', 'everyone', 'please', 'just', 'now', 'then', 'well', 'yeah', 'no', 'yes', 'oh', 'um', 'uh', 'all', 'guys', 'team', 'po', 'sir', 'maam', 'folks', 'there', 'here', 'look', 'that', 'this', 'let', 'lets', 'me', 'my', 'your', 'have', 'has', 'will', 'did', 'does', 'know', 'think', 'see', 'tell', 'say', 'go', 'get', 'got', 'want', 'need']);
function llmWakeGuard(text, command) {
  const t = String(text).trim(), c = String(command || '').trim().replace(/[.!?]+$/, ''); let prefix;
  if (!c) prefix = t; else { const i = t.toLowerCase().lastIndexOf(c.toLowerCase()); if (i < 1) return null; prefix = t.slice(0, i); }
  const toks = prefix.toLowerCase().replace(/[^a-z0-9'À-ɏ ]+/g, ' ').split(/\s+/).filter(Boolean); if (!toks.length || toks.length > 4) return null;
  const odd = toks.filter((x) => !GREETING.has(x)); if (!odd.length || odd.every((x) => EVERYDAY.has(x)) || !plausibleWakeAlias(toks.join(' '))) return null;
  return { prefix: toks.join(' '), rest: c };
}
async function llmWake(text) {
  const words = String(text).trim().split(/\s+/).length; if (words < 2 || words > 16) return null;
  try { const nlu = require('./nlu'); if (!nlu.available()) return null; const r = await nlu.judgeWake(text); if (!r || !r.addressed) return null; return llmWakeGuard(text, r.command); } catch { return null; }
}
// A very short utterance that is just a mangled call ("to lay.", "Hello to Lai.", "Hi, today."): judged by sound, only when the whole thing is 1-3 words.
// Without a greeting the sound has to be very close; with a greeting a little looser is fine, because the only cost of a wrong guess is "Yes?".
function shortCall(text) {
  const toks = String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean); if (!toks.length || toks.length > 3) return null;
  const greet = GREETING.has(toks[0]), rest = greet ? toks.slice(1) : toks; if (!rest.length || rest.length > 2) return null;
  const cands = [...rest, rest.join('')].filter((x) => x.length >= 4 && x.length <= 7), thr = greet ? 2 : 1;
  if (rest.length === 1 && EVERYDAY.has(rest[0])) return null;
  for (const c of cands) for (const target of ['tulai', 'tulay', 'tuloy']) if (lev(c, target) <= thr) return { prefix: toks.join(' ') };
  return null;
}

/* People pause in the middle of a sentence ("Can you open the ... project"). The listener cuts at every pause, so a sentence that stops on a
   dangling word ("open the", "run the platform review in") is held for a moment and joined with what comes next. */
const DANGLE = new Set('a an the to in on at of for and or but with under my your this that these those from into by about as if so then than also please can could would will do does did is are was were what how why where which who when whose open run show send check review trigger start launch find tell give make create ng sa na ang mga kay yung tapos pero para kung kasi ako ko mo'.split(' '));
const incomplete = (text) => { const w = String(text).toLowerCase().replace(/[^a-z' ]+/g, ' ').trim().split(/\s+/); if (!w[0]) return false; return DANGLE.has(w[w.length - 1]) || (w.length <= 2 && /^(can|could|would|will|please|hey|tulai|tulay)$/.test(w[0])); };
const learnOk = (p) => plausibleWakeAlias(p) && !/\b(what|what's|how|who|why|where|your|you|name|the|is|are|can|do|please)\b/.test(String(p).toLowerCase());
let held = null;
/* A pause is not the end of a thought. Every sentence heard by voice waits a moment for the next words before it is acted on:
   longer when it stops on a dangling word, and as long as you keep speaking (the listener tells us when you start again). */
const GRACE = (t) => (String(t).trim().split(/\s+/).length >= 6 ? 1000 : 1600);
const emitFinal = (tx, a, mode) => { onEvent({ type: 'partial', text: tx, mode }); onEvent(a ? { type: 'final', text: tx, mode, armed: true } : { type: 'final', text: tx, mode }); };
function flushHeld() { const h = held; held = null; armedUntil = 0; if (h) emitFinal(h.text, h.armed, h.mode); }
function speechResumed() { if (held) { clearTimeout(held.t); held.t = setTimeout(flushHeld, 7000); armedUntil = Math.max(armedUntil, Date.now() + 9000); } }
function finalize(text, mode, armed) {
  if (held) { clearTimeout(held.t); text = (held.text + ' ' + text).replace(/\s+/g, ' ').trim(); armed = armed || held.armed; held = null; }
  if (mode !== 'wake') return emitFinal(text, armed, mode);
  const wait = incomplete(text) ? 3200 : GRACE(text); held = { text, armed, mode, t: setTimeout(flushHeld, wait) }; armedUntil = Math.max(armedUntil, Date.now() + wait + 4000);
}
function handleUtterance(file, mode, ms, during = false) {
  const t0 = Date.now(), heardAt = t0; /* when the end of the utterance arrived (before transcribing) */ const job = txChain.then(() => transcribe(file)).then(async (text) => {
    onEvent({ type: 'utt', ms, took: Date.now() - t0, chars: text.length, mode });
    if (!text) { if (mode === 'once') onEvent({ type: 'final', text: '', mode }); return; }
    if (during) { // heard while Tulai was talking: only a real interruption (not its own voice coming back through the speakers) counts
      const w = wordsOf(text); let hit = 0; for (const x of w) if (lastSpoken.words.has(x)) hit++;
      if (w.length < 3 || isEcho(text) || hit / w.length >= 0.3) return; stopSpeaking();
    }
    if (isEcho(text)) return; // Tulai's own voice, not you
    const head = text.split(/\s+/).slice(0, 6).join(' '), nWords = text.split(/\s+/).length, trace = (route) => onEvent({ type: 'trace', head, n: nWords, route, mode });
    onEvent({ type: 'heard', text, mode });
    if (mode === 'once') { onEvent({ type: 'partial', text, mode }); onEvent({ type: 'final', text, mode }); return; }
    if (afterWake(text) === null && heardAt < armedUntil) { trace('follow-up'); finalize(text, mode, true); return; }
    let cmd = afterWake(text), route = cmd !== null ? 'wake: rules' : '';
    if (cmd === null) { const g = garbledWake(text); if (g) { route = 'wake: mangled name + known command'; cmd = g.rest; if (!aliases.includes(g.prefix) && learnOk(g.prefix)) { aliases.push(g.prefix); onEvent({ type: 'learned', alias: g.prefix, mode: 'wake' }); } } }
    if (cmd === null) { const sc = shortCall(text); if (sc) { route = 'wake: short call by sound'; cmd = ''; if (!aliases.includes(sc.prefix) && learnOk(sc.prefix) && sc.prefix.split(' ').length <= 3) { aliases.push(sc.prefix); onEvent({ type: 'learned', alias: sc.prefix, mode: 'wake' }); } } }
    if (cmd === null) { const w = await llmWake(text); if (w) { route = 'wake: language model'; cmd = w.rest; if (!aliases.includes(w.prefix) && learnOk(w.prefix)) { aliases.push(w.prefix); onEvent({ type: 'learned', alias: w.prefix, mode: 'wake' }); } } } // the local language model's judgement, guarded
    if (cmd === null) { trace('ignored: no wake word'); const key = norm2(text); if (key && key.split(' ').length <= 3) { misses.push({ t: Date.now(), key }); if (misses.length > 10) misses.shift(); } return; }
    trace(route || 'wake'); learnFromMisses();
    onEvent({ type: 'wake', mode, at: heardAt, greet: !cmd, hello: /^\s*(hello|hi|hey)\b/i.test(text) && /^\s*(hello|hi)\b/i.test(text) });
    if (cmd) { finalize(cmd, mode, false); } else armedUntil = Date.now() + 10000;
  }).catch(() => {});
  txChain = job; return job;
}

function spawnHelper(mode) {
  const bin = helper(); if (!bin) { onEvent({ type: 'error', code: 'missing', message: 'The voice helper is not installed.' }); return null; }
  const whisper = engine() === 'whisper';
  const args = whisper ? ['--record', ...(mode === 'once' ? ['--once'] : []), '--dir', os.tmpdir()] : [...(locale ? ['--locale', locale] : []), ...(aliases.length ? ['--aliases', aliases.join('|')] : []), ...(mode === 'wake' ? ['--wake'] : [])];
  const c = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] }); let buf = '', pendingTx = null; armedUntil = 0;
  c.stdout.on('data', (d) => { buf += d.toString('utf8'); const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) { if (!l.trim()) continue; let ev; try { ev = JSON.parse(l); } catch { continue; } if (ev.type === 'utterance') { if (Date.now() <= mutedUntil) { if (sayProc && ev.ms >= 1000) { pendingTx = handleUtterance(ev.file, mode, ev.ms, true); /* you may talk over Tulai: judged after it is transcribed */ } else { try { fs.unlinkSync(ev.file); } catch {} } continue; } /* ended while Tulai was still talking: that was only its own voice. If it ended later, you spoke after it */ pendingTx = handleUtterance(ev.file, mode, ev.ms); continue; } if (ev.type === 'speech') speechResumed(); if (ev.type === 'ready') failures = 0; if (ev.type === 'error') { if (['speech_denied', 'mic_denied', 'no_ondevice', 'unavailable', 'missing'].includes(ev.code)) blocked = ev; } onEvent({ ...ev, mode }); } });
  c.on('exit', (code) => { if (child !== c) return; if (child === c) { child = null; kind = null; } if (mode === 'wake' && wanted && !blocked && !sayProc) { failures++; clearTimeout(retry); retry = setTimeout(() => { if (wanted && !child && !blocked) child = spawnHelper('wake'), kind = 'wake'; }, Math.min(30000, 1000 * 2 ** Math.min(failures, 5))); } if (mode === 'once') { Promise.resolve(pendingTx).then(() => { onEvent({ type: 'idle' }); resumeWake(); }); } });
  return c;
}
function stopChild() { if (!child) return; const c = child; child = null; kind = null; try { c.stdin.write('stop\n'); } catch {} setTimeout(() => { try { c.kill(); } catch {} }, 600); }
function resumeWake() { if (wanted && !blocked && !child && !sayProc) { child = spawnHelper('wake'); kind = 'wake'; } }

function prewarmVoice(o) { prerender({ voice: (o && o.voice) || bestVoice, rate: (o && o.rate) || 190 }); }
function setAliases(list) { aliases = (list || []).map((x) => String(x).toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim()).filter((x) => x && x.split(' ').length <= 4 && plausibleWakeAlias(x)).slice(0, 20); }
function setWake(on, loc, cb) { wanted = !!on; if (loc !== undefined) locale = loc || ''; if (cb) onEvent = cb; blocked = null; stopChild(); if (wanted) setTimeout(resumeWake, 400); }
function once(loc, cb) { if (cb) onEvent = cb; if (loc !== undefined) locale = loc || ''; blocked = null; stopChild(); stopSpeaking(); setTimeout(() => { child = spawnHelper('once'); kind = 'once'; }, 300); }
function stop() { stopChild(); setTimeout(resumeWake, 800); }

/* ---- speaking ---- */
function clean(t) {
  return String(t).replace(/<br\s*\/?>/gi, '\n').replace(/^[^\n]*\.(?:svg|png|jpe?g|pdf|pptx|xlsx|docx)\s*·[^\n]*\(\d+\/\d+\)\s*/gim,'').replace(/^Source:.*$/gm, '').replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?:\.[a-z0-9]+)?\b/gi, '').replace(/```[\s\S]*?```/g, ' (code omitted) ').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/https?:\/\/\S+/g, ' link ').replace(/[*_#>|~]+/g, ' ').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
}
let mutedUntil = 0, lastSpoken = { words: new Set(), at: 0 };
const wordsOf = (s) => String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
/** True when a transcript is mostly Tulai's own last sentence (its voice reached the microphone). Short answers like "Work" are never echo. */
function isEcho(text) { if (Date.now() - lastSpoken.at > 10000) return false; const w = wordsOf(text); if (w.length < 5) return false; let hit = 0; for (const x of w) if (lastSpoken.words.has(x)) hit++; return hit / w.length >= 0.6; }
const TTS_DIR = path.join(os.tmpdir(), 'tulai-tts'), PHRASES = ['Yes?', "I'm listening.", 'Go ahead.', 'Yes, how can I help?', 'Hello! How can I help?', 'Okay.', 'You are welcome!', 'Muted.', 'Volume up.', 'Volume down.'];
const ttsKey = (t, o) => require('crypto').createHash('md5').update(`${t}|${o.voice || ''}|${o.rate || 190}`).digest('hex').slice(0, 12);
const cachedAudio = (t, o) => { const f = path.join(TTS_DIR, ttsKey(t, o) + '.aiff'); return fs.existsSync(f) ? f : null; };
function prerender(o) { try { fs.mkdirSync(TTS_DIR, { recursive: true }); } catch {} for (const p of PHRASES) { const f = path.join(TTS_DIR, ttsKey(p, o) + '.aiff'); if (!fs.existsSync(f)) execFile('/usr/bin/say', [...(o.voice ? ['-v', o.voice] : []), '-r', String(o.rate || 190), '-o', f, '--', p], () => {}); } }
let bestVoice = null;
const pickVoice = () => new Promise((res) => execFile('/usr/bin/say', ['-v', '?'], { timeout: 6000 }, (e, so) => { const L = String(so || '').split('\n').map((l) => l.match(/^(.+?)\s{2,}(en[_-][A-Za-z]+)/)).filter(Boolean).map((m) => m[1].trim()); res(L.find((n) => /Premium/.test(n)) || L.find((n) => /Enhanced/.test(n)) || null); }));
pickVoice().then((v) => { bestVoice = v; prerender({ voice: v, rate: 190 }); });
function speak(text, opts = {}) {
  if (!opts.voice && bestVoice) opts = { ...opts, voice: bestVoice };
  stopSpeaking(); let t = clean(text); if (!t) return false; if (t.length > 700) { const cut = t.slice(0, 700), i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! ')); t = (i > 200 ? cut.slice(0, i + 1) : cut) + ' The rest is in the chat.'; }
  mutedUntil = Date.now() + 120000; // the listener keeps running (no slow restart); it just ignores what it hears while Tulai talks
  lastSpoken = { words: new Set(wordsOf(t)), at: Date.now() + 120000 };
  const cached = cachedAudio(t, opts), args = [...(opts.voice ? ['-v', opts.voice] : []), '-r', String(opts.rate || 190), '--', t];
  sayProc = cached ? spawn('/usr/bin/afplay', [cached], { stdio: 'ignore' }) : spawn('/usr/bin/say', args, { stdio: 'ignore' }); onEvent({ type: 'speaking', on: true });
  if (opts.followup || opts.keepOpen) armedUntil = Date.now() + 120000; // the answer can start as soon as the sentence ends
  const speakingProcess = sayProc;
  const finishSpeaking = () => { if (sayProc !== speakingProcess) return; sayProc = null; lastSpoken.at = Date.now(); mutedUntil = Date.now() + 750; /* room echo of its own voice */ onEvent({ type: 'speaking', on: false }); resumeWake(); if (opts.followup) { armedUntil = Date.now() + 15000; onEvent({ type: 'wake', mode: 'wake', followup: true }); } else if (opts.keepOpen) armedUntil = Date.now() + 20000; /* a plain answer: keep listening quietly for the next command, no ding */ };
  speakingProcess.once('exit', finishSpeaking); speakingProcess.once('error', finishSpeaking);
  return true;
}
/* ---- the meeting's own sound: with a headset your microphone only hears you, so during meeting notes a second listener hears what the Mac plays ---- */
let sysChild = null, sysOnText = null;
function startSystem(onText) {
  if (sysChild) { sysOnText = onText; return true; } const bin = helper(); if (!bin || engine() !== 'whisper') return false; sysOnText = onText;
  const c = spawn(bin, ['--record', '--system', '--dir', os.tmpdir()], { stdio: ['pipe', 'pipe', 'pipe'] }); sysChild = c; let buf = '';
  c.stdout.on('data', (d) => { buf += d.toString('utf8'); const lines = buf.split('\n'); buf = lines.pop(); for (const l of lines) { let ev; try { ev = JSON.parse(l); } catch { continue; }
    if (ev.type === 'utterance') { txChain = txChain.then(() => transcribe(ev.file)).then((text) => { if (text && sysChild === c && !isEcho(text) && sysOnText) sysOnText(text); }).catch(() => {}); }
    else if (ev.type === 'error') onEvent({ type: 'error', code: ev.code, message: ev.message, source: 'system' });
    else if (ev.type === 'ready') onEvent({ type: 'system-ready' }); } });
  c.on('exit', () => { if (sysChild === c) sysChild = null; }); c.on('error', () => { if (sysChild === c) sysChild = null; });
  return true;
}
function stopSystem() { const c = sysChild; sysChild = null; sysOnText = null; if (c) { try { c.stdin.write('stop\n'); } catch {} setTimeout(() => { try { c.kill(); } catch {} }, 600); } }
const systemActive = () => !!sysChild;
function stopSpeaking() { const previous = sayProc; sayProc = null; mutedUntil = 0; lastSpoken.at = Date.now(); if (previous) { try { previous.kill(); } catch {} onEvent({ type: 'speaking', on: false }); } }
const ding = () => { try { spawn('/usr/bin/afplay', ['/System/Library/Sounds/Tink.aiff'], { stdio: 'ignore' }); } catch {} };

/* ---- info ---- */
const run = (args) => new Promise((res) => { const bin = helper(); if (!bin) return res(null); execFile(bin, args, { timeout: 8000 }, (e, so) => { try { res(JSON.parse(String(so).trim().split('\n')[0])); } catch { res(null); } }); });
const status = (loc) => run(['--status', ...(loc ? ['--locale', loc] : [])]);
const locales = async () => (await run(['--list-locales']))?.locales || [];
const voices = () => new Promise((res) => execFile('/usr/bin/say', ['-v', '?'], { timeout: 8000 }, (e, so) => res(String(so || '').split('\n').map((l) => l.match(/^(.+?)\s{2,}([a-z]{2}[_-][A-Za-z0-9]+)/)).filter(Boolean).map((m) => ({ name: m[1].trim(), locale: m[2] })))));
module.exports = { arm: (ms = 20000) => { armedUntil = Math.max(armedUntil, Date.now() + ms); }, _incomplete: incomplete, _finalize: finalize, _speechResumed: speechResumed, _setEmit: (cb) => { onEvent = cb; }, _utteranceKeep: (f, m, cb) => { onEvent = cb; return handleUtterance(f, m); }, shortCall, health: () => ({ listener: !!child, listenerKind: kind, whisper: !!wsProc, model: (() => { const m = modelPath(); return m ? path.basename(m) : null; })(), helper: !!helper(), engine: engine() }), startSystem, stopSystem, systemActive, llmWakeGuard, llmWake, _isEcho: (t, said) => { lastSpoken = { words: new Set(wordsOf(said)), at: Date.now() }; return isEcho(t); }, garbledWake, prewarmVoice, _learn: (keys, cb) => { onEvent = cb; for (const k of keys) misses.push({ t: Date.now(), key: k }); learnFromMisses(); }, shutdown, warm: () => ensureServer(), _utterance: (f, m, cb) => { armedUntil = 0; onEvent = cb; return handleUtterance(f, m); }, configure, engine, afterWake, setAliases, setWake, once, stop, speak, stopSpeaking, ding, status, locales, voices, clean, isBlocked: () => blocked, helperPath: helper, listening: () => kind };
