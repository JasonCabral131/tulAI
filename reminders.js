// Reminders: "remind me in 10 minutes about my meeting", "paalalahanan mo ako ng meeting ng 3pm". Stored on this Mac, checked by Tulai Bot.
const fs = require('fs');
const path = require('path');

const FILE = () => path.join(process.env.GC_DATA_DIR || __dirname, 'reminders.json');
const load = () => { try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return []; } };
const save = (l) => { fs.mkdirSync(path.dirname(FILE()),{recursive:true});const t = FILE() + '.' + process.pid; fs.writeFileSync(t, JSON.stringify(l),{mode:0o600}); fs.renameSync(t, FILE()); };

const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty five': 45, fortyfive: 45, sixty: 60, isa: 1, dalawa: 2, tatlo: 3, lima: 5, sampu: 10 };
const UNIT = (u) => (/^(?:sec|segundo)/.test(u) ? 1000 : /^(?:min|minuto)/.test(u) ? 60000 : 3600000);
const num = (s) => { s = String(s).toLowerCase().trim(); return /^\d+(\.\d+)?$/.test(s) ? +s : NUM[s] ?? null; };

/** Finds a time in the sentence. Returns { at: Date, rest } or null. `now` is injectable for tests. */
function parseWhen(text, now = new Date()) {
  const t = String(text).toLowerCase().replace(/[,]+/g, ' ').replace(/\s+/g, ' ').trim(); let m;
  // "in 10 minutes", "in an hour", "in 1 hour and 30 minutes", "after 20 mins", "10 minutes from now", "sa loob ng 5 minuto"
  if ((m = /\b(?:in|after|within|sa loob ng|pagkatapos ng|mamaya sa)\s+(?:(half an?|\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty five|forty|sixty|isa|dalawa|tatlo|lima|sampu)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|oras|minuto|segundo)(?:\s+(?:and\s+|at\s+)?(\d+)\s*(minutes?|mins?|minuto))?)/.exec(t)) || (m = /\b()(\d+|an?|one|two|three|five|ten|fifteen|twenty|thirty)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|oras|minuto)\s+from now/.exec(t))) {
    const k = m[1] === undefined ? 2 : 1; let q = m[k], unit = m[k + 1], extra = m[k + 2], eu = m[k + 3];
    q = /^half/.test(q) ? 0.5 : num(q); if (q === null) return null; let ms = q * UNIT(unit); if (extra) ms += +extra * UNIT(eu);
    return { at: new Date(now.getTime() + ms), rest: (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).trim() };
  }
  // "at 3pm", "at 3:30 pm", "alas 3", "ng 2pm", "15:00", "tomorrow at 9", "bukas 9am"
  const tt = t.replace(/(\d)(am|pm)\b/g, '$1 $2');
  const mt = /(?:\b(?:at|by|around|alas|sa|ng|mga|before)\s+|\b)(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?!\d)/.exec(tt);
  const hasKey = mt && (mt[3] || mt[2] || /\b(?:at|by|around|alas|sa|ng|mga)\s+\d/.test(tt)); const tomorrow = /\b(tomorrow|bukas)\b/.test(t);
  if (mt && hasKey) {
    let h = +mt[1], min = mt[2] ? +mt[2] : 0; const ap = mt[3] ? mt[3].replace(/\./g, '') : '';
    if (h > 24 || min > 59) return null;
    const cand = (hh) => { const d = new Date(now); d.setHours(hh % 24, min, 0, 0); if (tomorrow) d.setDate(d.getDate() + 1); return d; };
    let at;
    if (ap) at = cand(ap === 'pm' ? (h % 12) + 12 : h % 12);
    else if (h >= 13) at = cand(h);
    else { const am = cand(h % 12), pm = cand((h % 12) + 12); at = [am, pm].filter((d) => d > now).sort((a, b) => a - b)[0] || (am.setDate(am.getDate() + 1), am); }
    if (at <= now && !tomorrow) at.setDate(at.getDate() + 1);
    const cut = tt.replace(mt[0], ' ').replace(/\b(tomorrow|bukas)\b/g, ' ');
    return { at, rest: cut.replace(/\s+/g, ' ').trim() };
  }
  if (/\b(?:later|mamaya)\b/.test(t)) return { at: new Date(now.getTime() + 30 * 60000), rest: t.replace(/\b(later|mamaya)\b/g, ' ').trim() };
  return null;
}

/** What to say when it is time. */
function spoken(r) { const s = subjectFrom(r.text); return /meeting|standup|stand-up|sync|call|huddle|interview|demo|retro|review/.test(s) || !s ? (s && !/^(you have|your)/.test(s) ? `Reminder: ${/^(?:a |an |the |my )/.test(s) ? 'you have ' + s.replace(/^(?:my )/, 'a ') : s}` : 'Reminder: you have a meeting.') : `Reminder: ${s}`; }
function subjectFrom(rest) {
  let s = String(rest || '').trim()
    .replace(/^(?:(?:please|pls|kindly|tulai|tulay)[, ]+)?(?:set (?:a )?reminder|remind me|remind|reminder|paalalahanan mo ako|paalalahanan mo|paalalahanan|ipaalala mo sa akin|ipaalala mo|ipaalala|i-?remind mo ako|i-?remind mo|mag-?remind ka sa akin|mag-?remind ka|pakipaalala|paalala)\b[,:]*(?:\s+(?:about|to|that)\b)?/i, '')
    .replace(/\b(?:every weekday|weekdays|monday to friday|every day|daily|araw araw)\b/gi,' ')
    .replace(/^\s*(?:about|to|that)\s+/i,'').replace(/\s+/g,' ').trim();
  // Normalize this common work routine without carrying speech filler into the alert.
  if (/\bdws\b/i.test(s) && /\b(?:good\s*morning|godmorning)\b/i.test(s) && /\bteams\b/i.test(s)) {
    const team=s.match(/["“]([^"”]+)["”]/)?.[1];
    if (team) return `Complete DWS and send a good-morning greeting in Microsoft Teams: “${team}”.`;
  }
  return s.replace(/^my\s+/i, 'your ');

}
function add({ at, text = '', repeat = '' }) { if (require('./sandbox').would('reminder ' + text)) return { id: 'selftest', at, text, repeat }; // a self-test never saves a real reminder
 const l = load(), r = { id: Math.random().toString(36).slice(2, 8), at: +at, text: String(text).slice(0, 160), repeat, created: Date.now() }; l.push(r); save(l); return r; }
const list = () => load().filter((r) => r.at > Date.now() - 60000).sort((a, b) => a.at - b.at);
function cancel(which) { const l = load(); const keep = which === 'all' ? [] : l.filter((r) => r.id !== which); save(keep); return l.length - keep.length; }
/** Reminders that are due now. One-off ones are removed, repeating ones move to their next time. */
function due(now = Date.now()) {
  const l = load(), fire = [], keep = [];
  for (const r of l) {
    if (r.at <= now) { if (now - r.at < 3600000) fire.push(r); if (r.repeat) { const d = new Date(r.at); do { d.setDate(d.getDate() + 1); } while (r.repeat === 'weekdays' && [0, 6].includes(d.getDay()) || d.getTime() <= now); keep.push({ ...r, at: d.getTime() }); } }
    else keep.push(r);
  }
  if (fire.length || keep.length !== l.length) save(keep); if (fire.length) last = fire[fire.length - 1]; return fire;
}
const clock = (at) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const when = (at) => { const d = new Date(at), n = new Date(), t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); const seconds = Math.max(1,Math.ceil((d-n)/1000));if(seconds<60)return `in ${seconds} second${seconds===1?'':'s'}`; const mins = Math.max(1,Math.round((d - n) / 60000)); if (mins < 60) return `in ${Math.max(1, mins)} minute${mins === 1 ? '' : 's'}`; return d.toDateString() === n.toDateString() ? `at ${t}` : `${d.toLocaleDateString([], { weekday: 'long' })} at ${t}`; };
let last = null;
const getLast = () => last;
module.exports = { clock, getLast, setLast: (x) => { last = x; }, parseWhen, subjectFrom, spoken, add, list, cancel, due, when };
