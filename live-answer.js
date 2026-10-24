// Live Answer (like a call assistant): during meeting notes, when someone else asks a question, Tulai's own AI on this Mac suggests what you can say,
// using what was just said, your saved notes and the documents you gave it. Never the company AI. "auto answer off" stops it; "answer that" answers on demand.
const Q_START = /^(?:so,?\s+|and\s+|okay,?\s+|ok,?\s+|um,?\s+)?(?:what|how|why|when|where|who|which|can you|could you|would you|will you|do you|does|did|is it|is there|are you|are there|have you|has|should we|tell me|explain|walk me through|ano|paano|bakit|kailan|saan|sino|pwede ba|kaya mo ba|meron ba)\b/i;
let on = true, timer = null, busy = false, lastQ = null, lastAt = 0; const items = []; // the last suggestions, newest first (shown in the floating answer window)
const SMALL_TALK = /^(?:(?:hi|hello|hey|good (?:morning|afternoon|evening))\b|what'?s up\b|wassup\b|how are you\b|how'?s it going\b|how is everyone\b|how was your (?:weekend|day)\b|can you hear me\b|can everyone (?:see|hear)\b|is my screen (?:visible|showing)\b|kumusta\b|musta\b)/i;
function isQuestion(t) { const s = String(t || '').trim(); return s.split(/\s+/).length >= 4 && (/\?\s*$/.test(s) || Q_START.test(s)) && !SMALL_TALK.test(s); } // "What's up? Sir Jason…" or "can you hear me?" is not a question to answer
function overlap(a, b) { const A = new Set(String(a).toLowerCase().match(/[a-z]{4,}/g) || []); let k = 0; for (const w of new Set(String(b).toLowerCase().match(/[a-z]{4,}/g) || [])) if (A.has(w)) k++; return k; }
const CODE_Q = /\b(?:write|implement|code|function|algorithm|complexity|big ?o|array|string|linked list|tree|graph|hash ?map|recursion|sort|leetcode|sql query|regex|class|method)\b/i;
/** A coding problem on the screen (LeetCode, HackerRank, CoderPad, a shared editor): a task statement with examples, constraints or a function to fill in. */
function looksLikeProblem(t) {
  const s = String(t || ''); if (s.length < 80) return false;
  const signs = [/\bExample\s*\d*\s*:/i, /\bInput\s*:/i, /\bOutput\s*:/i, /\bConstraints?\s*:?/i, /\bclass Solution\b/, /\bdef \w+\(self/, /\b(?:function|def|public \w+) \w+\s*\(/, /\bReturn (?:the|an?|true|false)\b/i, /\bGiven (?:an?|the|two) \w+/i, /\b(?:O\(n\)|time complexity)\b/i, /\bWrite a (?:function|program|query)\b/i].filter((r) => r.test(s)).length;
  return signs >= 3;
}
async function readScreen() { if (process.env.TULAI_NO_SCREEN) return ''; const sc = require('./screen-code'), f = await sc.snap(); try { return String(await require('./viewer').ocr(f) || '').trim(); } finally { try { require('fs').rmSync(f, { force: true }); } catch {} } }
const words = (t) => new Set(String(t).toLowerCase().match(/[a-z]{3,}/g) || []);
const similar = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let k = 0; for (const w of A) if (B.has(w)) k++; return k / Math.max(A.size, B.size); };
let lastProblem = '', solving = false;
/** Coding interview help: a coding problem on the screen gets a solution in the floating window (approach, code, complexity). Once per new problem. */
async function solveScreen({ force = false, nlu = require('./nlu'), read = readScreen, emit = (x) => process.emit('tulay:live-answer', x) } = {}) {
  if (solving) return null; solving = true;
  try {
    const text = await read(); if (!text) return null;
    if (!looksLikeProblem(text) && !force) return null;
    if (!force && lastProblem && similar(text, lastProblem) > 0.8) return null; lastProblem = text;
    const out = (await require('./screen-solve').solve(text, { nlu })).text; // a Python solution is run on the examples shown with the problem, and fixed up to 3 times
    if (!out) return null; const MENU = /^(?:[\w.]+ )?(?:File|Edit|View|Window|Help|Go|Run|Terminal|Selection|History|Bookmarks|Profiles|Tab)\b|^(?:Electron|Google Chrome|Safari|Microsoft Teams|zoom\.us|Code|Arc|Firefox)$/; const L = text.split('\n').map((l) => l.trim()).filter(Boolean), gi = L.findIndex((l) => /^Given\b/i.test(l)); const title = ((gi > 0 && /[a-z]{2}/i.test(L[gi - 1]) && L[gi - 1].length < 80 ? L[gi - 1] : '') || L.find((l) => l.length >= 4 && /[a-z]{2}/i.test(l) && /\s/.test(l) && !MENU.test(l) && !/^(?:\d+|[{}();]+)$/.test(l)) || 'what is on your screen').slice(0, 90); // the problem's title, not the app's menu bar
    items.unshift({ question: '🖥️ On your screen: ' + title, text: out, at: Date.now() }); items.length = Math.min(items.length, 10); emit({ question: 'screen: ' + title, text: out }); return out;
  } catch { return null; } finally { solving = false; }
}
let watch = null;
/** While you are in a call or taking notes with auto answer on, look at the screen every 12 seconds for a new coding problem. */
function watchScreen(active = () => false, ms = 12000) { clearInterval(watch); watch = setInterval(() => { if (on && active()) solveScreen().catch(() => null); }, ms); return watch; }
async function suggest(question, recent = [], opts = {}) {
  const { nlu = require('./nlu'), emit = (x) => process.emit('tulay:live-answer', x) } = opts;
  if (busy) return null; busy = true;
  try {
    let docs = []; try { docs = require('./document-work').notes().map((n) => [overlap(n, question), n]).filter(([k]) => k >= 2).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, n]) => n.slice(0, 900)); } catch {}
    let lessons = []; try { lessons = await require('./bot-memory').retrieve(question); } catch {}
    const ctx = recent.slice(-12).map((s) => `${s.who || 'Speaker'}: ${s.text}`).join('\n');
    let screenText = ''; if (opts.screen !== false) { try { screenText = await (opts.readScreen || readScreen)(); } catch {} } // what is on the screen right now (Tulai's own windows are hidden from the capture)
    const coding = CODE_Q.test(question) || /```/.test(question) || looksLikeProblem(screenText);
    const msgs = [{ role: 'system', content: 'You help the user answer live in a meeting, call or interview. Write what the user can say next, in the language of the question. ' +
      'For general knowledge, technical or interview questions, answer directly and confidently from your own knowledge: 2 to 4 short, natural sentences. ' +
      (coding ? 'This is a coding question: give the approach in one or two sentences, then the code in one code block, then the time and space complexity in one line. ' : '') +
      'Use the conversation, the screen text, the documents and the saved notes when they hold the answer. Only for facts about this project or company that nobody has stated (prices, dates, owners, decisions), do not invent them: suggest a reasonable option and say you will confirm. Never answer small talk with "not decided".' },
      ...(lessons.length ? [{ role: 'user', content: 'Saved notes about me:\n' + lessons.slice(0, 6).join('\n') }] : []), ...(docs.length ? [{ role: 'user', content: 'Documents:\n' + docs.join('\n---\n') }] : []),
      ...(screenText ? [{ role: 'user', content: 'Text on my screen right now (read with OCR, some characters may be wrong):\n' + screenText.slice(0, 3500) }] : []),
      { role: 'user', content: `Conversation so far:\n${ctx}\n\nQuestion to answer now: "${question}"\nWhat should I say?` }];
    const r = await nlu.chat({ messages: msgs, max_tokens: coding ? 900 : 260, temperature: 0.3, timeout: coding ? 120000 : 60000 }); const text = String((r && r.content) || '').trim();
    if (text) { items.unshift({ question, text, at: Date.now() }); items.length = Math.min(items.length, 10); emit({ question, text }); } return text || null;
  } catch { return null; } finally { busy = false; }
}
/** Called by meeting.js for every new transcript line. Only the other people's questions trigger it; waits a moment so the question can finish. */
function onSegment(seg, recent, opts) {
  if (!seg || seg.who !== 'Others' || !isQuestion(seg.text)) return false;
  lastQ = seg.text; if (!on) return false; const now = Date.now(); if (now - lastAt < 8000) return false; lastAt = now;
  clearTimeout(timer); timer = setTimeout(() => { suggest(seg.text, recent, opts); }, (opts && opts.delay) ?? 1500); return true;
}
function handle(text, recentFn = () => { try { return require('./meeting').recent(); } catch { return []; } }) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^(?:turn |switch )?(?:auto[- ]?answer|live answers?)\s+(?:on|back on)$|^(?:turn|switch) on (?:auto[- ]?answer|live answers?)$/.test(t)) { on = true; return { reply: 'Auto answer is on: during meeting notes I suggest an answer when someone asks a question.' }; }
  if (/^(?:turn |switch )?(?:auto[- ]?answer|live answers?)\s+off$|^(?:turn|switch) off (?:auto[- ]?answer|live answers?)$|^stop (?:auto[- ]?answer|live answers?)$/.test(t)) { on = false; clearTimeout(timer); return { reply: 'Auto answer is off. Say "answer that" when you want a suggestion for the last question.' }; }
  if (/^(?:solve (?:the |my )?screen|solve (?:the |this )?(?:coding )?problem(?: on (?:my |the )?screen)?|answer (?:from|based on) (?:my |the )?screen|answer what'?s on (?:my |the )?screen|sagutin mo (?:ang )?(?:nasa )?screen)$/.test(t)) {
    solveScreen({ force: true }).catch(() => null); return { reply: 'Reading your screen now. The answer appears in the floating answer window (hidden from screen sharing) in a few seconds.', via: 'screen answer' };
  }
  if (/^(?:answer (?:that|it|the (?:last )?question)|help me answer|what should i say|ano isasagot ko)$/.test(t)) {
    const recent = recentFn(), q = lastQ || [...recent].reverse().find((s) => s.who === 'Others' && s.text.split(/\s+/).length >= 3)?.text;
    if (!q) return { reply: 'I have not heard a question yet. Start meeting notes so I can listen, or tell me the question.' };
    suggest(q, recent); return { reply: `Thinking about: "${q}". The suggestion appears here in a few seconds.` };
  }
  return null;
}
module.exports = { looksLikeProblem, solveScreen, watchScreen, isQuestion, suggest, onSegment, handle, items: () => items.slice(), busy: () => busy, setOn: (v) => { on = !!v; }, state: () => ({ on, lastQ }), _reset: () => { on = true; busy = false; lastQ = null; lastAt = 0; items.length = 0; clearTimeout(timer); lastProblem = ''; solving = false; clearInterval(watch); } };
