// Meeting notes: listens through the microphone, transcribes on this Mac (whisper.cpp) and summarizes with Tulai's own trained AI (also on this Mac;
// never the company AI). A quick keyword summary is written first and replaced when the AI summary is ready. Files are saved in ~/Documents/Tulai Meetings.
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = () => path.join(os.homedir(), 'Documents', 'Tulai Meetings');
let cur = null, last = null;
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const dur = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute' : m < 60 ? `${m} minute${m > 1 ? 's' : ''}` : `${Math.floor(m / 60)} hr ${m % 60} min`; };

const STOP = new Set(`a about above after again all also am an and any are as at be because been before being but by can could did do does doing don't down for from further had has have having he her here hers him his how i if in into is it its just let's me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up us very was we were what when where which while who whom why will with would you your yeah okay ok um uh like yes oh well really actually basically ang ng sa na at ay mga ko mo ka ako ikaw siya kami tayo sila ito yan yung iyon po opo hindi oo lang din rin naman kasi para pero kung`.split(' '));
const words = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9'-]*/g) || []).filter((w) => w.length > 2 && !STOP.has(w));

function summarize(segments, startedAt, endedAt) {
  const text = segments.map((s) => s.text).join(' ');
  const sentences = [];
  for (const seg of segments) for (const p of String(seg.text).split(/(?<=[.!?])\s+/)) { const t = p.trim(); if (t.split(/\s+/).length >= 4) sentences.push({ t, at: seg.at }); }
  const freq = new Map(); for (const w of words(text)) freq.set(w, (freq.get(w) || 0) + 1);
  const max = Math.max(1, ...freq.values());
  const score = (t, i) => { const ws = words(t); if (!ws.length) return 0; const tf = ws.reduce((a, w) => a + (freq.get(w) || 0) / max, 0) / Math.sqrt(ws.length + 3); return tf * (i < 3 ? 1.15 : 1) * (t.length > 220 ? 0.7 : 1); };
  const ranked = sentences.map((s, i) => ({ ...s, i, sc: score(s.t, i) })).sort((a, b) => b.sc - a.sc);
  const n = Math.min(6, Math.max(2, Math.round(sentences.length / 8)));
  const key = ranked.slice(0, n).sort((a, b) => a.i - b.i).map((s) => s.t);
  const ACTION = /\b(i'll|i will|we'll|we will|need to|needs to|have to|has to|should|must|let's|action item|follow up|follow-up|to-?do|deadline|assign(ed)?|take care of|send (me|us|the)|please (send|check|review|update|prepare))\b|\bby (monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|tonight|next week|end of (the )?(day|week|month)|eod|\d)/i;
  const DECIDE = /\b(decid(ed|e)|agreed?|approved?|we're going (with|to)|going with|settled on|confirmed|final(ly)? (decision|answer)|let's go with)\b/i;
  const uniq = (arr) => [...new Set(arr)];
  const actions = uniq(sentences.filter((s) => ACTION.test(s.t)).map((s) => s.t)).slice(0, 12);
  const decisions = uniq(sentences.filter((s) => DECIDE.test(s.t)).map((s) => s.t)).slice(0, 8);
  const questions = uniq(sentences.filter((s) => /\?$/.test(s.t)).map((s) => s.t)).slice(0, 6);
  const topics = [...freq.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w]) => w);
  return { duration: dur(endedAt - startedAt), wordCount: words(text).length, segments: segments.length, key, actions, decisions, questions, topics };
}
/** Our own AI (the local trained brain) writes the notes from the transcript: Taglish speech in, English notes out, only real commitments as action items. */
const AI_INST = 'Above is part of a meeting transcript (English mixed with Filipino, from speech recognition, with errors). Summarize it in your own words in English. Do NOT copy sentences from the transcript. Never invent names, dates or numbers.\nWrite exactly:\nKey points:\n- (3 to 5 short points about what was discussed)\nAction items:\n- Owner: task (due) (only real commitments; "Someone" if the owner is unclear; leave out "(due)" when no date was said; "- None" if there are none)\nDecisions:\n- (what the group agreed, or "- None")\nOpen questions:\n- (questions still open, or "- None")'; // instructions AFTER the transcript: a small model follows them better there
const TEMPLATE = /^\(.*\)$|or "- none"|what the group agreed|questions still open|\btask \(due\)|only real commitments|"someone" if the owner|leave out "\(due\)"|^name: task|^- none\b/i; // the format example the AI was given, echoed back: never an action item
function parseNotes(t) {
  const out = { key: [], actions: [], decisions: [], questions: [] }, map = { 'key points': 'key', 'action items': 'actions', decisions: 'decisions', 'open questions': 'questions' }; let sec = null;
  for (const line of String(t || '').split('\n')) { const h = /^\W*(key points|action items|decisions|open questions)\W*:?\W*$/i.exec(line.trim()); if (h) { sec = map[h[1].toLowerCase()]; continue; }
    const b = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/.exec(line); if (sec && b && !/^none\.?$/i.test(b[1].trim()) && !TEMPLATE.test(b[1])) out[sec].push(b[1].trim().replace(/\*\*/g, '').replace(/^owner:\s*/i, 'Someone: ')); }
  return out.key.length ? out : null;
}
async function aiSummary(segments, nlu = require('./nlu')) {
  const chunks = []; let cur = '';
  for (const x of segments) { const l = String(x.text).trim(); if (!l) continue; if ((cur + ' ' + l).length > 3500 && cur) { chunks.push(cur); cur = ''; } cur += (cur ? ' ' : '') + l; } if (cur) chunks.push(cur);
  const parts = [];
  for (const c of chunks.slice(0, 12)) { const r = await nlu.chat({ messages: [{ role: 'system', content: 'You are a precise meeting assistant.' }, { role: 'user', content: 'Transcript:\n\"\"\"\n' + c + '\n\"\"\"\n\n' + AI_INST }], max_tokens: 600, temperature: 0.2, timeout: 180000 }); const n = parseNotes(r && r.content); if (n) parts.push(n); }
  if (!parts.length) return null; const uniq = (a) => [...new Set(a)];
  return { key: uniq(parts.flatMap((x) => x.key)).slice(0, 8), actions: uniq(parts.flatMap((x) => x.actions)).slice(0, 15), decisions: uniq(parts.flatMap((x) => x.decisions)).slice(0, 10), questions: uniq(parts.flatMap((x) => x.questions)).slice(0, 10) };
}
const render = (title, startedAt, endedAt, segs, sum) => {
  const who = (s) => (s.who ? `${s.who}: ` : '');
  const bullets = (a) => (a.length ? a.map((x) => `- ${x}`).join('\n') : '- (none detected)');
  let md = `# ${title}\n\n- Date: ${startedAt.toLocaleString()}\n- Length: ${sum ? sum.duration : 'in progress'}\n- ${sum && sum.notUseful ? 'Not reviewed: only background noise or very little speech was recorded, so no notes were written' : sum && sum.byAI ? 'Summary written by Tulai\'s own AI on this Mac (never the company AI); check names and dates against the transcript' : 'Quick keyword summary made on this Mac (the AI summary replaces it when ready)'}\n\n`;
  if (sum) md += `## Key points\n${bullets(sum.key)}\n\n## Action items\n${bullets(sum.actions)}\n\n## Decisions\n${bullets(sum.decisions)}\n\n## Open questions\n${bullets(sum.questions)}\n\n## Topics\n${(sum.topics || []).join(', ') || '(not enough speech)'}\n\n`;
  md += `## Transcript\n${segs.map((s) => `**${clock(s.at)} ${who(s)}**${s.text}`).join('\n\n')}\n`;
  return md;
};
const save = () => { if (!cur) return; try { fs.mkdirSync(DIR(), { recursive: true }); fs.writeFileSync(cur.file, render(cur.title, cur.startedAt, null, cur.segments, null)); } catch {} };

/** Useful speech: a real sentence (4+ words), not a sound ("*crash*", "[music]") and not filler ("thank you", "okay"). */
const useful = (text) => { const x = String(text || '').replace(/\*[^*]*\*|\[[^\]]*\]|\([^)]*\)/g, '').replace(/^[-–\s]+/, '').trim();
  return x.split(/\s+/).filter(Boolean).length >= 4 && !/^(?:ok(?:ay)?|yes|yeah|thank(?:s| you)(?: so much| po)?|salamat(?: po)?|bye|see you|i'?ll see you later)\b[\s\w]{0,12}[.!]?$/i.test(x); };
/** Minutes without useful speech before meeting notes end on their own (your choice: a recording that only hears noise is not kept going). */
const QUIET_MIN = () => +process.env.TULAI_MEETING_QUIET_MIN || 20;
/** Ends the notes when nothing useful was said for QUIET_MIN minutes. Returns the stop result, or null. */
function checkQuiet(now = Date.now()) {
  if (!cur || now - cur.lastUseful < QUIET_MIN() * 60000) return null;
  const r = stop({ auto: true }); try { process.emit('tulay:meeting-notes', r.reply); } catch {}
  return r;
}
function start(title) {
  if (require('./sandbox').would('start meeting notes')) return { ok: true, reply: 'Meeting notes started. (self-test: nothing was recorded)' }; // a self-test never records
  if (cur) return { ok: false, reply: 'A meeting is already being recorded.' };
  const startedAt = new Date(), t = String(title || 'Meeting').trim().slice(0, 60) || 'Meeting';
  cur = { title: t, startedAt, segments: [], useful: 0, lastUseful: startedAt.getTime(), file: path.join(DIR(), `${stamp(startedAt)} ${t.replace(/[\\/:*?"<>|]/g, ' ')}.md`) }; save();
  cur.quietTimer = setInterval(() => checkQuiet(), 60000); if (cur.quietTimer.unref) cur.quietTimer.unref();
  try { process.emit('tulay:meeting', true); } catch {}
  return { ok: true, file: cur.file, reply: 'Meeting notes started. I am listening to your microphone and to the sound your Mac plays, so it works with a headset too. Please tell the others that the meeting is being transcribed. Say "Hey Tulai, stop meeting notes" when you are done.' };
}
const wset = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean));
function similar(a, b) { const A = wset(a), B = wset(b); if (A.size < 3 || B.size < 3) return false; let hit = 0; for (const x of A) if (B.has(x)) hit++; return hit / Math.min(A.size, B.size) >= 0.7; }
/** who: "You" (microphone) or "Others" (the Mac's sound). Without a headset both hear the same words: keep only one copy. */
function feed(text, who = 'You') {
  if (!cur) return; const t = String(text || '').trim(); if (!t || t.length < 2) return; const now = Date.now();
  for (const s of cur.segments.slice(-4)) if (s.who !== who && now - s.at.getTime() < 8000 && similar(s.text, t)) { if (who === 'Others' && s.who === 'You') { s.who = 'Others'; } return; }
  const seg = { at: new Date(), text: t, who }; cur.segments.push(seg); if (useful(t)) { cur.useful++; cur.lastUseful = now; } if (cur.segments.length % 4 === 0) save();
  try { require('./live-answer').onSegment(seg, cur.segments.slice(-12)); } catch {} // a question from the others: suggest what to say
}
function stop({ auto = false } = {}) {
  if (require('./sandbox').would('stop meeting notes')) return { ok: false, reply: 'No meeting is being recorded right now.' }; // a self-test never stops your notes
  if (!cur) return { ok: false, reply: 'No meeting is being recorded right now.' };
  const m = cur, endedAt = new Date(); cur = null; clearInterval(m.quietTimer); try { process.emit('tulay:meeting', false); } catch {}
  const usefulLines = m.segments.filter((s) => useful(s.text)).length;
  const notUseful = usefulLines < 3; // only background noise or a few words: no review, no made-up notes
  const sum = summarize(m.segments, m.startedAt, endedAt); if (notUseful) { sum.key = []; sum.actions = []; sum.decisions = []; sum.questions = []; sum.notUseful = true; }
  try { fs.mkdirSync(DIR(), { recursive: true }); fs.writeFileSync(m.file, render(m.title, m.startedAt, endedAt, m.segments, sum)); } catch {}
  last = { file: m.file, title: m.title, summary: sum, endedAt, segments: m.segments };
  const why = auto ? `I ended the meeting notes after ${sum.duration}: nothing useful was said for ${QUIET_MIN()} minutes.` : `Meeting ended after ${sum.duration}.`;
  const spoken = notUseful ? `${why} Only background noise or very little speech was recorded, so I did not review it and wrote no notes. The transcript is in Documents, Tulai Meetings.`
    : auto ? `${why} I am writing the notes with my own AI now; they appear here in a minute. The transcript is saved in Documents, Tulai Meetings.` : `Meeting ended after ${sum.duration}. I am writing the notes with my own AI now; they appear here in a minute. The transcript is saved in Documents, Tulai Meetings.`;
  if (!notUseful) aiSummary(m.segments).then((ai) => { if (!ai) return; const full = { ...sum, ...ai, byAI: true }; try { fs.writeFileSync(m.file, render(m.title, m.startedAt, endedAt, m.segments, full)); } catch {} if (last && last.file === m.file) last.summary = full;
    const b = (a) => (a.length ? a.map((x) => '- ' + x).join('\n') : '- None'); try { process.emit('tulay:meeting-notes', `**Meeting notes (${sum.duration})**\n\n**Key points**\n${b(ai.key)}\n\n**Action items (${ai.actions.length})**\n${b(ai.actions)}${ai.decisions.length ? '\n\n**Decisions**\n' + b(ai.decisions) : ''}${ai.questions.length ? '\n\n**Open questions**\n' + b(ai.questions) : ''}\n\n_Saved in Documents, Tulai Meetings. Written by my own AI from the transcript; check names and dates._`); } catch {} }).catch(() => {});
  return { ok: true, file: m.file, reply: spoken, summary: sum };
}
const state = () => ({ recording: !!cur, title: cur && cur.title, since: cur && cur.startedAt.getTime(), lines: cur ? cur.segments.length : 0, last: last && { file: last.file, title: last.title } });
const list = (n = 20) => { try { return fs.readdirSync(DIR()).filter((f) => f.endsWith('.md')).sort().reverse().slice(0, n).map((f) => ({ name: f, file: path.join(DIR(), f) })); } catch { return []; } };
const lastSummary = () => (last ? { ok: true, reply: `${last.title}: ${last.summary.key.slice(0, 3).join(' ') || 'not enough speech to summarize.'} ${last.summary.actions.length ? last.summary.actions.length + ' action items.' : ''}`, file: last.file } : { ok: false, reply: 'I have no finished meeting to summarize yet.' });
/** One saved meeting file -> { name, file, at, title, duration, summary (or null), byAI, lines (transcript lines) }. */
function readFile(f) {
  let txt = ''; try { txt = fs.readFileSync(f.file, 'utf8'); } catch { return null; }
  const [head, tr = ''] = txt.split(/\n## Transcript/i), m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})/.exec(f.name);
  return { name: f.name, file: f.file, at: m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null, title: (/^# (.+)$/m.exec(txt) || [, 'Meeting'])[1],
    duration: (/^- Length: (.+)$/m.exec(txt) || [])[1] || '', summary: parseNotes(head), byAI: /written by Tulai's own AI/i.test(txt), lines: (tr.match(/^\*\*\d{1,2}:\d{2}/gm) || []).length,
    transcript: tr.split('\n').map((l) => /^\*\*(\d{1,2}:\d{2})(?::\d{2})?\s+([^:*]+):\s*\*\*\s*(.*)$/.exec(l)).filter(Boolean).map((x) => ({ time: x[1], who: x[2].trim(), text: x[3].trim() })) };
}
/** Every saved meeting of one day (local date), oldest first. */
const byDay = (day) => { const k = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, want = k(day);
  try { return fs.readdirSync(DIR()).filter((f) => f.endsWith('.md') && f.startsWith(want)).sort().map((f) => readFile({ name: f, file: path.join(DIR(), f) })).filter(Boolean); } catch { return []; } };
/** The last meeting's notes: from memory, or after a restart from the newest saved notes file. */
const lastFull = () => {
  if (last) return { title: last.title, file: last.file, summary: last.summary, byAI: !!(last.summary && last.summary.byAI), duration: last.summary && last.summary.duration };
  const f = list()[0]; if (!f) return null; let txt = ''; try { txt = fs.readFileSync(f.file, 'utf8'); } catch { return null; }
  const notes = parseNotes(txt.split(/\n## Transcript/i)[0]); if (!notes) return null;
  return { title: (/^# (.+)$/m.exec(txt) || [, 'Meeting'])[1] + ' · ' + f.name.replace(/\.md$/, ''), file: f.file, summary: notes, byAI: /written by Tulai's own AI/i.test(txt), duration: (/^- Length: (.+)$/m.exec(txt) || [])[1] };
};
module.exports = { checkQuiet, useful, byDay, readFile, lastFull, recent: () => (cur ? cur.segments.slice(-12) : last && last.segments ? last.segments.slice(-12) : []), aiSummary, parseNotes, lastEndedAt: () => (last && last.endedAt ? new Date(last.endedAt).getTime() : null), start, stop, feed, state, list, lastSummary, summarize, isRecording: () => !!cur, DIR };
