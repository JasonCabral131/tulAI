// "What is my meeting on Monday?", "how about on Friday?", "anything tomorrow?": the calendar of ONE chosen day, read from every signed-in account in the background
// browser (it steps the calendar's own Next/Previous day arrows; it only looks). "Today" is left to the existing today/next-24-hours rule.
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'], ABBR = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6 };
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
let lastCalAt = 0;
const startOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
/** The day a sentence points at, or null. { date, label }. */
function dayOf(tl, now = new Date()) {
  const t0 = startOf(now); let m;
  if (/\bday after tomorrow\b|\bsa makalawa\b/.test(tl)) { const d = new Date(t0); d.setDate(d.getDate() + 2); return { date: d, label: 'the day after tomorrow' }; }
  if (/\b(?:tomorrow|bukas)\b/.test(tl)) { const d = new Date(t0); d.setDate(d.getDate() + 1); return { date: d, label: 'tomorrow' }; }
  if (/\b(?:today|ngayon|this day)\b/.test(tl)) return { date: t0, label: 'today' };
  if ((m = /\bin (\d{1,2}) days?\b/.exec(tl))) { const d = new Date(t0); d.setDate(d.getDate() + +m[1]); return { date: d, label: `in ${m[1]} days` }; }
  if ((m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(tl))) return { date: new Date(+m[1], +m[2] - 1, +m[3]), label: m[0] };
  if ((m = new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`).exec(tl))) { const d = new Date(t0.getFullYear(), MONTHS.indexOf(m[1]), +m[2]); if (d < t0) d.setFullYear(d.getFullYear() + 1); return { date: d, label: `${m[1][0].toUpperCase() + m[1].slice(1)} ${m[2]}` }; }
  if ((m = new RegExp(`\\b(?:(next|this|coming)\\s+)?(${DAYS.join('|')}|${Object.keys(ABBR).join('|')})\\b`).exec(tl))) {
    const idx = DAYS.includes(m[2]) ? DAYS.indexOf(m[2]) : ABBR[m[2]]; let delta = (idx - t0.getDay() + 7) % 7; if (m[1] === 'next' && delta < 7 && delta <= (7 - t0.getDay()) % 7 && idx === t0.getDay()) delta = 7; const d = new Date(t0); d.setDate(d.getDate() + delta);
    return { date: d, label: DAYS[idx][0].toUpperCase() + DAYS[idx].slice(1) };
  }
  return null;
}
const CAL = /\b(?:meetings?|calendar|schedule|agenda|appointments?|events?|lakad|lakaran|pulong)\b/;
const ACTION = /\b(?:set|create|add|schedule a|book|cancel|move|reschedule|delete|remove|remind|reminder|send|write|draft|invite|record|start|stop|join)\b/;
/** ctx: { call(cmd, arg), now?, history? }. Returns a reply or null. */
async function handle(text, tl, ctx) {
  const now = ctx.now ? new Date(ctx.now) : new Date(); const t = String(tl).replace(/[?!.,]+$/g, '').trim(); if (t.split(/\s+/).length > 14 || ACTION.test(t)) return null;
  const recent = Date.now() - lastCalAt < 10 * 60000 || /\b(?:meetings?|calendar|schedule|agenda)\b/i.test(String((ctx.history || []).filter((h) => h.role === 'user').slice(-2).map((h) => h.content).join(' ')));
  const followUp = /^(?:and |so |ok(?:ay)?,? |how|what) ?(?:about|of)?\s*(?:on |for |sa )?(?:next |this |coming )?\w+(?: \d{1,2})?$/.test(t) && !CAL.test(t);
  const asks = CAL.test(t) && /\b(?:what|which|any|anything|do i have|am i|show|tell|check|list|meron|ano)\b/.test(t) || (/^(?:meetings?|my meetings?|calendar|my calendar|schedule|my schedule)\b/.test(t));
  if (!(asks || (followUp && recent))) return null;
  const day = dayOf(t, now); if (!day) { if (asks) lastCalAt = Date.now(); return null; }
  lastCalAt = Date.now(); if (+day.date === +startOf(now)) return null; // today: the existing rule answers
  let r; try { r = await ctx.call('eventson', { date: day.date.getTime() }); } catch (e) { return { reply: `I could not read your calendar for ${day.label}: ${e.message}` }; }
  const pretty = day.date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), many = new Set(r.events.map((e) => e.source)).size > 1;
  const lines = r.events.map((e) => `${new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${e.title}${many && e.source ? ` (${e.source})` : ''}`);
  const bad = r.problems && r.problems.length ? ` Note: ${r.problems.join('; ')}.` : '';
  if (!lines.length) return { reply: r.problems && r.problems.length && !(r.read && r.read.length) ? `I could not check ${pretty} reliably, so I won't say it is empty.${bad}` : `Nothing on your calendar for ${pretty}${r.read && r.read.length && r.problems && r.problems.length ? ` (checked: ${r.read.join(', ')})` : ''}.${bad}` }; // empty is only trusted when at least one calendar was actually read
  return { reply: `On ${pretty} you have ${lines.length} meeting${lines.length === 1 ? '' : 's'}:\n\n${lines.map((l) => '- ' + l).join('\n')}${bad}` };
}
module.exports = { handle, dayOf };
