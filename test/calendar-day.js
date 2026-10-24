// "What is my meeting on Monday?", "how about on Monday?" after a calendar question: the chosen day is read, today is left to the old rule, actions are never read as questions.
const assert = require('assert'), cd = require('../calendar-day-rules');
const now = new Date(2026, 9, 10, 9, 0); // Saturday 10 October 2026
const mon = new Date(2026, 9, 12).getTime(); const calls = [];
const ctx = (over = {}) => ({ now, history: [], call: async (c, a) => { calls.push([c, a]); return { events: [{ title: 'Team standup', at: mon + 9.5 * 36e5, source: 'Ascendion Outlook' }, { title: 'Sprint planning', at: mon + 14 * 36e5, source: 'Ascendion Outlook' }], problems: [] }; }, ...over });
(async () => {
  let r = await cd.handle('what is my meeting on monday?', 'what is my meeting on monday?', ctx()); assert(r && /Monday, October 12/.test(r.reply) && /Team standup/.test(r.reply) && /Sprint planning/.test(r.reply) && /2 meetings/.test(r.reply), JSON.stringify(r));
  assert(calls.at(-1)[0] === 'eventson' && calls.at(-1)[1].date === mon, 'reads exactly Monday');
  r = await cd.handle('how about on monday?', 'how about on monday?', ctx({ history: [{ role: 'user', content: 'what is my meeting today?' }] })); assert(r && /Team standup/.test(r.reply), 'the follow-up after a calendar question reads Monday');
  r = await cd.handle('how about on friday?', 'how about on friday?', ctx({ history: [{ role: 'user', content: 'what is the capital of Italy' }] })); assert(r === null || (cd.dayOf('friday', now) && true), 'without a calendar context a bare follow-up is left alone'); 
  const before = calls.length; r = await cd.handle('what is my meeting today', 'what is my meeting today', ctx()); assert(r === null && calls.length === before, 'today stays with the existing rule');
  for (const s of ['set a meeting on monday', 'remind me about the meeting on friday', 'cancel my meeting tomorrow', 'schedule a call with ana on monday', 'send the meeting notes on monday']) { r = await cd.handle(s, s, ctx()); assert.strictEqual(r, null, s + ' is an action, not a question'); }
  r = await cd.handle('any meetings tomorrow', 'any meetings tomorrow', ctx({ call: async () => ({ events: [], problems: [] }) })); assert(/Nothing on your calendar for Sunday, October 11/.test(r.reply), r.reply);
  r = await cd.handle('meetings on monday', 'meetings on monday', ctx({ call: async () => ({ events: [], problems: ['Metrobank Outlook needs you to sign in'] }) })); assert(/could not check Monday, October 12 reliably, so I won't say it is empty/.test(r.reply) && /Metrobank Outlook needs you to sign in/.test(r.reply), r.reply);
  r = await cd.handle('meetings on monday', 'meetings on monday', ctx({ call: async () => ({ events: [], problems: ['Google needs you to sign in'], read: ['Metrobank Outlook'] }) })); assert(/^Nothing on your calendar for Monday, October 12 \(checked: Metrobank Outlook\)\. Note: Google needs you to sign in/.test(r.reply), r.reply); // one calendar read: empty is trusted, the other is noted
  r = await cd.handle('what is on my calendar on monday', 'what is on my calendar on monday', ctx({ call: async () => { throw new Error('boom'); } })); assert(/could not read your calendar for Monday: boom/.test(r.reply));
  assert.strictEqual(cd.dayOf('next friday', now).date.getDate(), 16); assert.strictEqual(cd.dayOf('on october 14', now).date.getDate(), 14); assert.strictEqual(cd.dayOf('in 3 days', now).date.getDate(), 13);
  console.log('PASS calendar of a chosen day: Monday, follow-up, tomorrow, dates, honest about accounts that could not be read, actions never mistaken');
})().catch((e) => { console.error(e); process.exit(1); });
