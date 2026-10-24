// Human moments the small brain gets wrong: frustration and insults (stay calm, ask what broke), a bare "send it" with nothing to send (ask, never guess),
// and percentages with follow-ups ("15% of 240?" then "and 20%?"), which are computed by code. Runs after every other rule, before the brain.
const TL = /\b(?:mo|ka|ko|hindi|ang|ng|yung|naman|wala|kayo|po|gumagana|bakit)\b/i;
const INSULT = /\b(?:stupid|idiot|dumb|useless|moron|tanga|bobo|gago|tangina|putang ?ina|ulol|inutil|walang kwenta|walang silbi)\b/i;
const BROKEN_YOU = /\b(?:nothing works|you (?:don'?t|do not|never) work|you(?:'re| are) (?:not working|broken)|hindi ka (?:gumagana|nagana)|sira ka)\b/i;
const pct = (p, n) => { const v = p * n / 100; return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100); };
function handle(raw, opts = {}) {
  const t = String(raw || '').trim(), tl = t.toLowerCase();
  // frustration aimed at the bot: no insult back, no lecture; one short apology and a concrete question
  if ((INSULT.test(tl) || BROKEN_YOU.test(tl)) && t.split(/\s+/).length <= 14 && !/\b(?:jira|teams|outlook|calendar|gitlab|report|send|meeting|train)\b/i.test(tl)) {
    return TL.test(tl)
      ? { reply: 'Pasensya na. Ano ang hindi gumana? Sabihin mo kung ano ang inutos mo at ano ang lumabas, at aayusin ko agad.', via: 'calm reply' }
      : { reply: "Sorry about that. What didn't work? Tell me what you asked and what you got, and I'll fix it.", via: 'calm reply' };
  }
  // who it is: always the truth, never a made-up maker
  if (/^(?:are you|r u|you are|ikaw ba ay|tao ka ba|totoong tao ka ba)\b.*\b(?:real|human|person|people|robot|bot|ai|tao)\b|^(?:totoong )?tao ka ba\b|^(?:who|what) (?:made|built|created|trained) you\b|^(?:sino ang gumawa sa(?:yo|iyo)|sinong gumawa sa(?:yo|iyo))\b/i.test(t) && !/\b(?:using|use|chat ?gpt|gpt|company ai|openai|claude|gemini)\b/i.test(t) && t.split(/\s+/).length <= 10) {
    const tl2 = TL.test(tl) || /\btao\b|sino/i.test(tl);
    return { reply: tl2 ? 'Hindi ako tao. Ako si Tulai, isang AI assistant na tumatakbo dito sa Mac mo. Ang utak ko ay Qwen2.5-3B (gawa ng Qwen team ng Alibaba) na tinrain dito sa Mac gamit ang Tulai skill packs. Hindi ako ChatGPT at hindi ko ginagamit ang company AI.' : "No, I'm not a person. I'm Tulai, an AI assistant running on this Mac. My brain is Qwen2.5-3B (made by Alibaba's Qwen team), fine-tuned here on this Mac with Tulai's skill packs. I'm not ChatGPT or Claude, and I don't use the company AI.", via: 'identity' };
  }
  // which AI answers: always the truth (its own local brain; never ChatGPT or the company AI)
  if (/\b(?:chat ?gpt|gpt|openai|claude|gemini|company ai|which (?:ai|model|brain)|what (?:ai|model|brain)|anong ai|anong model)\b/i.test(tl) && /\b(?:you|your|u|mo|ka|using|use|gamit|are|is|answer)\b/i.test(tl) && t.split(/\s+/).length <= 16) {
    let run = ''; try { run = require('./active-model').state().current?.run || ''; } catch {}
    return { reply: `I answer with my own brain: a Qwen2.5-3B model that was trained on this Mac with the skill packs${run ? ` (version ${run})` : ''}. It runs here, offline. I never use ChatGPT or the company AI, and what you ask me does not leave this Mac.`, via: 'identity' };
  }
  // math, exactly: a sum inside a complaint ("i ask you 1 + 1 and you answer 11"), and "wrong, it must be 6" is re-checked, never just agreed with
  const SUM = /(-?\d+(?:\.\d+)?)\s*([+\-*/x×÷])\s*(-?\d+(?:\.\d+)?)/;
  const calc = (a, op, b) => { a = +a; b = +b; const v = op === '+' ? a + b : op === '-' ? a - b : /[*x×]/.test(op) ? a * b : b === 0 ? NaN : a / b; return Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; };
  { const m = SUM.exec(t); if (m && /\b(?:i ask(?:ed)?|you (?:answer(?:ed)?|said|say)|wrong|mali|bakit)\b/i.test(t)) { const v = calc(m[1], m[2], m[3]); if (v !== null) return { reply: `${m[1]} ${m[2]} ${m[3]} is ${v}. Sorry about the wrong answer before.`, via: 'computed' }; } }
  if (/^(?:no[, ]+|nope[, ]+|hindi[, ]+)?(?:that'?s |it'?s |its )?(?:wrong|mali|incorrect)\b|\b(?:it )?(?:must|should) be\b|\bdapat\b/i.test(t)) {
    const prevA = [...(opts.history || [])].reverse().find((h) => h.role === 'assistant'), prevU = [...(opts.history || [])].reverse().find((h) => h.role === 'user');
    const m = prevU && SUM.exec(prevU.content || ''); const v = m && calc(m[1], m[2], m[3]);
    if (v !== null && v !== undefined && prevA && new RegExp(`\\b${String(v).replace('.', '\\.')}\\b`).test(prevA.content || '')) return { reply: `I checked again: ${m[1]} ${m[2]} ${m[3]} is ${v}. That one is right, so I'll keep it.`, via: 'computed' };
  }
  // what it has learned: the real training history, never made-up claims
  if (/^(?:what (?:have|did) you (?:improve|improved|learn|learned|learnt)|what(?:'s| is) new (?:with|in) you|how (?:have|did) you improve|ano(?:ng| ang) (?:natutunan|na-?improve) mo)\b/i.test(t)) {
    try { const r = require('./bot-training').packStatus('what is the latest training'); if (r && r.reply) return { reply: r.reply, via: 'training history' }; } catch {}
  }
  // too vague to act on ("do the thing", "gawin mo na"): ask what, never guess an action (a pending "do it" was already confirmed by the rules before this)
  if (/^(?:(?:just |please |pls )?do (?:the|that|this) thing|do (?:it|that|this|something)|handle it|gawin mo(?: na| yan| iyan| yun)?|ikaw na bahala)[.!]*$/i.test(t)) {
    return { reply: TL.test(tl) || /gawin|bahala/.test(tl) ? 'Ano ang gagawin ko? Sabihin mo ang task at kung saan (halimbawa: "ayusin ang bug sa cart.py sa shop-app").' : 'What should I do? Tell me the task and where (for example: "fix the bug in cart.py in shop-app").', via: 'asks what to do' };
  }
  // "send it" with nothing to send: ask; never pick a message or a person by guessing
  if (/^(?:send(?: it| that| this| na)?|pakisend(?: na)?|i-?send mo(?: na)?|ipadala mo(?: na)?)[.!]*$/i.test(t)) {
    return { reply: TL.test(tl) || /^paki|^i-?send|^ipadala|\bna\b/.test(tl) ? 'Ano ang ise-send ko, at kanino? Halimbawa: "send message to Ana: tapos na ang report".' : 'What should I send, and to whom? For example: "send message to Ana: the report is ready".', via: 'asks what to send' };
  }
  // percentages: "what is 15% of 240", then "and 20%?" / "how about 20%" uses the number from the last question
  let m = /(?:^|\b)(?:what(?:'s| is)\s+|ano ang\s+|magkano ang\s+|calculate\s+|compute\s+)?(\d+(?:\.\d+)?)\s*%\s*(?:of|ng)\s*(\d[\d,]*(?:\.\d+)?)\s*\??$/i.exec(t);
  if (m) { const p = +m[1], n = +m[2].replace(/,/g, ''); return { reply: `${m[1]}% of ${m[2]} is ${pct(p, n)}.`, via: 'computed' }; }
  m = /^(?:and|how about|what about|e|eh|paano kung|then)\s+(\d+(?:\.\d+)?)\s*%\s*\??$/i.exec(t);
  if (m) {
    const prev = (opts.history || []).filter((h) => h.role === 'user').map((h) => /(\d+(?:\.\d+)?)\s*%\s*(?:of|ng)\s*(\d[\d,]*(?:\.\d+)?)/i.exec(h.content)).filter(Boolean).pop();
    if (prev) { const n = +prev[2].replace(/,/g, ''); return { reply: `${m[1]}% of ${prev[2]} is ${pct(+m[1], n)}.`, via: 'computed' }; }
  }
  return null;
}
const TYPO = { shw: 'show', shwo: 'show', sho: 'show', meetngs: 'meetings', meetigns: 'meetings', meetins: 'meetings', meeings: 'meetings', metings: 'meetings', meting: 'meeting', calender: 'calendar', calandar: 'calendar', calnedar: 'calendar',
  jria: 'jira', jirra: 'jira', chek: 'check', chck: 'check', cehck: 'check', tickts: 'tickets', tikets: 'tickets', statsu: 'status', stauts: 'status', reprot: 'report', repot: 'report', tommorow: 'tomorrow', tomorow: 'tomorrow', tmrw: 'tomorrow', tmr: 'tomorrow', todya: 'today', tody: 'today' };
/** Common typos in short commands ("shw my meetngs") become the real words, so the rules find them. Long text and message bodies (after ':') are never changed. */
function fixTypos(raw) {
  const t = String(raw || ''); if (t.includes(':') || t.split(/\s+/).length > 8) return t;
  return t.replace(/[A-Za-z]+/g, (w) => TYPO[w.toLowerCase()] || w);
}
/** Meeting notes, however it is said ("stop meeting notes and tell me the summary", "go tell me the summary", "tapusin mo ang meeting"):
 stop really stops (never just promises to), and a summary always comes from the real notes: the running meeting or the last one. */
function notesText(sum) {
  if (!sum) return ''; const b = (a) => (a && a.length ? a.map((x) => '- ' + x).join('\n') : '- None');
  return `**Key points**\n${b(sum.key)}\n\n**Action items (${(sum.actions || []).length})**\n${b(sum.actions)}${sum.decisions && sum.decisions.length ? '\n\n**Decisions**\n' + b(sum.decisions) : ''}`;
}
/** "what are the meeting notes yesterday?", "show meeting notes", "meeting notes kahapon", "notes from monday's meeting": the saved notes of that
 day (or the latest), read from ~/Documents/Tulai Meetings. Read only: never starts or stops a recording. */
const FILLER = /^(?:ok(?:ay)?|yes|yeah|no|thank(?:s| you)(?: so much| po)?|salamat(?: po)?|bye|see you|i'?ll see you later|hello|hi|good (?:morning|afternoon))\b[\s\w]{0,12}[.!]?$/i;
function notesDay(t, now = new Date()) {
  const d = new Date(now); d.setHours(0, 0, 0, 0);
  if (/\b(?:yesterday|kahapon)\b/.test(t)) { d.setDate(d.getDate() - 1); return d; }
  if (/\b(?:today|kanina|ngayon|this morning|this afternoon)\b/.test(t)) return d;
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], wd = days.findIndex((x) => new RegExp('\\b' + x).test(t));
  if (wd >= 0) { d.setDate(d.getDate() - (((d.getDay() - wd) + 7) % 7 || 7)); return d; }
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(t); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(t); if (m) return new Date(d.getFullYear(), +m[1] - 1, +m[2]);
  const mons = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/.exec(t) || /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t);
  if (m) { const [mo, dd] = isNaN(+m[1]) ? [m[1], +m[2]] : [m[2], +m[1]]; return new Date(d.getFullYear(), mons.indexOf(mo), dd); }
  return null;
}
const NOISE = (x) => { const t = String(x || '').replace(/\*[^*]*\*|\[[^\]]*\]|\([^)]*\)/g, '').replace(/^[-–\s]+/, '').trim(); return !t || FILLER.test(t) || t.split(/\s+/).length < 4; };
const STOP = new Set('the and for with that this what are was were from about meeting meetings notes note show give tell read my our your yung ang mga sa ng on of in to a an is it me please po'.split(' '));
/** "meeting notes on Spira", "notes about the release", "meeting notes tungkol sa budget": the topic, unless it is a day ("on monday", "on oct 14"). */
function notesTopic(t) {
  const m = /\b(?:on|about|regarding|re|tungkol sa|patungkol sa)\s+(?:the\s+)?(.+?)\s*\??$/i.exec(t); if (!m || notesDay(m[1].toLowerCase())) return '';
  const words = m[1].toLowerCase().match(/[\p{L}\p{N}]+/gu) || []; return words.filter((w) => w.length > 2 && !STOP.has(w)).length ? m[1].trim() : '';
}
/** The spoken lines worth reading (no noise, no filler); with a topic, the lines about it and the line before and after. */
function extract(m, topic = '') {
  const tr = (m.transcript || []).filter((x) => !NOISE(x.text)); if (!topic) return tr;
  const words = (topic.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((w) => w.length > 2 && !STOP.has(w)), need = words.length <= 2 ? words.length : Math.ceil(words.length * 0.6); // "pdf file" needs both words, longer topics most of them
  const hit = (x) => words.filter((w) => x.toLowerCase().includes(w)).length >= need, keep = new Set();
  tr.forEach((x, i) => { if (hit(x.text)) [i - 1, i, i + 1].forEach((k) => k >= 0 && k < tr.length && keep.add(k)); });
  const notes = m.summary ? [...m.summary.key, ...m.summary.actions, ...m.summary.decisions].filter(hit) : [];
  return Object.assign([...keep].sort((a, b) => a - b).map((k) => tr[k]), { notes });
}
/** Summarize spoken lines with Tulai's own local brain (never the company AI). null when it is not available. */
async function summarizeLines(lines, topic, nlu) {
  if (!lines.length || !nlu || !nlu.chat) return null;
  const text = lines.map((x) => `[${x.when || ''}${x.time}] ${x.who}: ${x.text}`).join('\n').slice(-7000);
  try {
    const r = await nlu.chat({ messages: [{ role: 'system', content: 'You are a precise meeting assistant. Use only what is in the transcript. English, Tagalog and Taglish are mixed; answer in English.' },
      { role: 'user', content: `Transcript${topic ? ` (only the parts about "${topic}")` : ''}:\n"""\n${text}\n"""\n\nSummarize what was discussed${topic ? ` about ${topic}` : ''} IN YOUR OWN WORDS. Do not copy sentences from the transcript. Each key point names a topic and what was said about it (for example: "Roles: the checker approves; the reviewer can only view").\n\nKey points:\n- (3 to 6 short points)\nAction items:\n- (only something a person agreed to do, as "Person or team: task (when)", or "- None")\nDecisions:\n- (only what was agreed, or "- None")` }], max_tokens: 500, temperature: 0.2, timeout: 120000 });
    const n = require('./meeting').parseNotes(r && r.content); if (!n) return null; const uniq = (a) => [...new Set(a.map((x) => x.trim().replace(/[;,]+$/, '')))].filter((x) => !/^none\.?$/i.test(x));
    return { key: uniq(n.key), actions: uniq(n.actions), decisions: uniq(n.decisions).filter((d) => !uniq(n.actions).some((x) => { const A = new Set(d.toLowerCase().match(/[a-z0-9]{3,}/g) || []), B = x.toLowerCase().match(/[a-z0-9]{3,}/g) || []; return A.size && B.filter((w) => A.has(w)).length >= Math.ceil(A.size / 2); })), questions: uniq(n.questions) };
  } catch { return null; }
}
/** Summaries made from transcripts are kept (keyed by the file and its last change) so asking again is instant. */
const SUMS = () => require('path').join(process.env.GC_DATA_DIR || require('path').join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'meeting-summaries.json');
async function transcriptSummary(m, nlu) {
  const fs = require('fs'); let key = m.file; try { key += '|' + fs.statSync(m.file).mtimeMs; } catch {}
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(SUMS(), 'utf8')); } catch {}
  if (cache[key]) return cache[key];
  let sum = await summarizeLines(extract(m), '', nlu); if (!sum || sum.key.length < 2) sum = await summarizeLines(extract(m), '', nlu); // one retry: the small model sometimes answers off-format
  if (!sum || !sum.key.length) return null;
  cache[key] = sum; try { fs.writeFileSync(SUMS(), JSON.stringify(cache), { mode: 0o600 }); } catch {}
  return sum;
}
const fmtDay = (d) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), fmtTime = (m) => (m.at ? m.at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : m.name);
const cleanKey = (m) => (m.summary ? m.summary.key.map((x) => x.replace(/^(?:[-*•]\s+)+/, '')).filter((x) => !NOISE(x)) : []);
const bullets = (a) => a.map((x) => '- ' + x).join('\n');
/** A meeting with real speech: at least 3 spoken lines in its transcript (or, with no transcript, at least 2 real key points). Noise-only recordings are not notes. */
const hasSpeech = (m) => (m.lines ? extract(m).length >= 3 : cleanKey(m).length >= 2);
/** "show my meeting notes", "meeting notes yesterday", "meeting notes on Spira": extracts the real speech from the saved meetings in ~/Documents/Tulai Meetings
 and summarizes it with Tulai's own brain when there is no good summary yet. Read only: never starts or stops a recording. */
function savedNotes(t, mt, nlu, said = t) {
  const ask = /\b(?:meeting|pulong|call)\s*(?:notes?|minutes|transcripts?)\b|\bnotes? (?:from|of|sa|ng|in|on|about) (?:the |my |our |yung |ang )?(?:\w+'s )?(?:meetings?|calls?|pulong)\b|\bminutes of\b|\bwhat (?:was|were) (?:discussed|said|talked about)\b|\bmeetings? (?:yesterday|today|kahapon|kanina)\b/.test(t);
  if (!ask || /\b(?:start|restart|begin|take|record|listen|simulan|mag-?notes?)\b/.test(t) && !/\b(?:what|show|read|give|ano|pakita|yesterday|kahapon)\b/.test(t)) return null;
  if (!mt.byDay || !mt.readFile) return null;
  const day = notesDay(t), topic = day ? '' : notesTopic(said), all = () => (mt.list ? mt.list(300) : []).map(mt.readFile).filter(Boolean);
  const recent = () => (mt.list ? mt.list() : []).slice(0, 5).map((f) => '- ' + f.name.replace(/\.md$/, '')).join('\n');
  if (topic) return (async () => { // search every meeting for the topic, extract those parts, summarize them together
    const found = all().map((m) => ({ m, x: extract(m, topic) })).filter(({ x }) => x.length || x.notes.length).slice(0, 6);
    if (!found.length) return { reply: `I found nothing about **${topic}** in your saved meetings.${recent() ? '\n\nThe latest ones I have:\n' + recent() : ''}`, via: 'meeting notes' };
    const lines = found.flatMap(({ m, x }) => x.map((l) => ({ ...l, when: m.at ? `${m.at.getMonth() + 1}/${m.at.getDate()} ` : '' })));
    const sum = await summarizeLines(lines, topic, nlu);
    const per = found.map(({ m, x }) => `**${m.at ? fmtDay(m.at) + ', ' : ''}${fmtTime(m)}** (${m.duration || 'meeting'})${x.notes.length ? '\n' + bullets(x.notes.slice(0, 4)) : ''}${x.length ? '\n' + x.slice(0, 4).map((l) => `> ${l.time} ${l.who}: ${l.text}`).join('\n') : ''}\n\`${m.file}\``).join('\n\n');
    return { reply: `**Meeting notes on "${topic}"**: found in ${found.length} meeting${found.length === 1 ? '' : 's'}${sum ? `\n\n**Summary**\n${bullets(sum.key)}${sum.actions.length ? `\n\n**Action items**\n${bullets(sum.actions)}` : ''}${sum.decisions.length ? `\n\n**Decisions**\n${bullets(sum.decisions)}` : ''}` : ''}\n\n**Where it came up**\n${per}${sum ? '\n\n*Summarized by my own AI on this Mac from the transcripts; check names and dates.*' : ''}`, via: 'meeting notes' };
  })();
  let list = day ? mt.byDay(day) : [], skipped = [];
  if (!day) { // every meeting of the latest day that has real speech; recordings that only heard noise (or were cut off) are mentioned, not shown as notes
    const newest = all().find(hasSpeech);
    if (newest && newest.at) { const d = new Date(newest.at); d.setHours(0, 0, 0, 0); const that = mt.byDay(d); list = that.filter(hasSpeech); skipped = all().filter((m) => m.at && m.at >= d && !hasSpeech(m)); }
    else if (newest) list = [newest];
  }
  if (!list.length) return { reply: day ? `I have no meeting notes from ${fmtDay(day)}.${recent() ? '\n\nThe latest ones I have:\n' + recent() : ''}` : 'I have no meeting notes with real speech yet. Say **start meeting notes** when a meeting begins.', via: 'meeting notes' };
  return (async () => {
    const one = async (m) => {
      const head = `**${fmtTime(m)} · ${m.title}**${m.duration && m.duration !== 'in progress' ? ` (${m.duration})` : ''}`, key = cleanKey(m), spoken = extract(m);
      if (!hasSpeech(m)) { const cut = m.duration === 'in progress'; return `${head}\n- ${cut ? 'The recording was cut off before anything useful was saved.' : 'Only background noise or very little speech was recorded.'}\n\`${m.file}\``; }
      if (key.length < 3 && spoken.length >= 8) { const sum = await transcriptSummary(m, nlu); // the saved summary is thin for how much was said: summarize the transcript again
        if (sum && sum.key.length > key.length) return `${head}\n${bullets(sum.key.slice(0, 6))}${sum.actions.length ? `\n*Action items:* ${sum.actions.join('; ')}` : ''}${sum.decisions.length ? `\n*Decisions:* ${sum.decisions.join('; ')}` : ''}\n*Summarized from the transcript.*\n\`${m.file}\``; }
      if (key.length) { const acts = m.summary.actions || []; return `${head}\n${bullets(key.slice(0, 6))}${acts.length ? `\n*Action items:* ${acts.join('; ')}` : ''}\n\`${m.file}\``; }
      if (spoken.length >= 3) { const sum = await transcriptSummary(m, nlu); // no good notes yet: summarize the transcript now
        if (sum && sum.key.length) return `${head}\n${bullets(sum.key.slice(0, 6))}${sum.actions.length ? `\n*Action items:* ${sum.actions.join('; ')}` : ''}\n*Summarized just now from the transcript.*\n\`${m.file}\``;
        return `${head}\n${spoken.slice(0, 6).map((l) => `> ${l.time} ${l.who}: ${l.text}`).join('\n')}\n\`${m.file}\``; }
      const cut = m.duration === 'in progress';
      return `${head}\n- ${cut ? (m.lines ? 'The recording was cut off before the notes were written, and little was said.' : 'The recording was cut off before anything was saved.') : 'Only background noise or very little speech was recorded.'}\n\`${m.file}\``;
    };
    const parts = []; for (const m of list) parts.push(await one(m));
    const note = skipped.length ? `*Not shown: ${skipped.length} recording${skipped.length === 1 ? '' : 's'} with only background noise or cut off (${skipped.map((m) => (m.at ? fmtDay(m.at).replace(/^\w+, /, '') + ' ' : '') + fmtTime(m)).join(', ')}).*\n\n` : '';
    const title = day ? `**Meeting notes · ${fmtDay(day)}** (${list.length} meeting${list.length === 1 ? '' : 's'})` : `**Your latest meeting notes${list[0].at ? ' · ' + fmtDay(list[0].at) : ''}** (${list.length} meeting${list.length === 1 ? '' : 's'})`;
    return { reply: `${title}\n\n${note}${parts.join('\n\n')}\n\n*Written by my own AI on this Mac; check names and dates against the transcript.*`, via: 'meeting notes' };
  })();
}
function meeting(raw, mt = require('./meeting'), nlu = require('./nlu')) {
  const t = String(raw || '').toLowerCase().replace(/^(?:hey|hi|ok|okay)\s+tula[iy][,!.\s]*/, '').replace(/[.!?]+$/g, '').trim();
  const stopIt = /\b(?:stop|end|finish|close|tapusin|itigil|ihinto|i-?stop|tigilan)\b[\w\s-]{0,30}\b(?:meeting|notes|recording|pulong|listening)\b|^(?:stop listening|stop recording)$/.test(t);
  if (/\b(?:remind|reminder|paalala|schedule|book|invite|join|create|set up|sprint|team|standup|1:1|one on one|weekly|jira|mr|merge)\b/.test(t)) return null; // other features that mention meetings
  if (!stopIt && !/\b(?:summary|summari[sz]e|recap|buod|ibuod)\b/.test(t)) { const saved = savedNotes(t, mt, nlu, String(raw || '').replace(/^(?:hey|hi|ok|okay)\s+tula[iy][,!.\s]*/i, '').replace(/[.!?]+$/g, '').trim()); if (saved) return saved; }
  const wantSum = /\b(?:summary|summari[sz]e|recap|buod|ibuod)\b/.test(t) && !/\b(?:file|document|doc|pdf|folder|code|email|mail|page|article|text|link|video|chat|thread|ticket|jira|report)\b/.test(t)
    && (/\b(?:meeting|notes|call|pulong)\b/.test(t) || /^(?:go\s+|ok\s+|okay\s+|so\s+)?(?:(?:tell|give|show|send) me |what(?:'s| is) |ano ang )?(?:the |yung |ang )?(?:summary|recap|buod)(?: (?:please|na|po|so far))?$/.test(t));
  if (!stopIt && !wantSum) return null;
  const st = mt.state();
  if (stopIt && st.recording) { const r = mt.stop(); return { reply: r.reply + (r.file ? `\n\nTranscript: \`${r.file}\`` : ''), via: 'meeting notes' }; }
  if (wantSum && st.recording && !stopIt) { let so = null; try { so = mt.summarize(mt.recent(), new Date(st.since), new Date()); } catch {}
    return { reply: `Still recording (since ${new Date(st.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}). Say **stop meeting notes** for the full notes.${so && so.key && so.key.length ? '\n\n**So far**\n' + so.key.slice(0, 5).map((x) => '- ' + x).join('\n') : ''}`, via: 'meeting notes' }; }
  const last = mt.lastFull ? mt.lastFull() : null;
  if (last) return { reply: `${stopIt ? 'The meeting notes had already stopped. ' : ''}**${last.title}**${last.duration ? ` (${last.duration})` : ''}${last.byAI ? '' : ' — the full AI notes are still being written; ask again in a minute.'}\n\n${notesText(last.summary)}\n\nTranscript: \`${last.file}\``, via: 'meeting notes' };
  const files = mt.list ? mt.list() : []; if (files.length) return { reply: `${stopIt ? 'No meeting is being recorded right now. ' : ''}The latest meeting notes are in \`${files[0].file}\`. Say **open my last meeting notes** to see them.`, via: 'meeting notes' };
  return { reply: stopIt ? 'No meeting is being recorded right now, and I have no saved meeting notes yet. Say **start meeting notes** when a meeting begins.' : 'I have no meeting notes yet. Say **start meeting notes** when a meeting begins.', via: 'meeting notes' };
}
module.exports = { handle, fixTypos, meeting, notesText, notesDay, notesTopic, extract };
