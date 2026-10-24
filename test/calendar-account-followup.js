// After a calendar answer, "on outlook" / "sa google" / "on ascendion" checks that one account: its meetings, or exactly why it cannot be read
const assert = require('assert'), path = require('path');
const soon = Date.now() + 2 * 3600e3;
require.cache[require.resolve('../webcal')] = { exports: {
  anyEnabled: () => true, multi: () => true, label: (e) => `${e.title} (${e.source})`,
  state: () => ({ sources: [{ id: 'outlook', name: 'Outlook', enabled: true, url: 'https://outlook.office.com' }, { id: 'google', name: 'Google Calendar', enabled: true, url: 'https://calendar.google.com' }, { id: 'xl', name: 'Metrobank Outlook', enabled: true, url: 'https://outlook.cloud.microsoft' }, { id: 'teams', name: 'Teams', enabled: true, url: 'https://teams.microsoft.com' }],
    status: { google: { ok: false, msg: 'signed out' }, xl: { ok: false, msg: 'signed out' } } }),
  events: async () => [{ title: 'Leads touchpoint', source: 'Outlook', at: soon }] } };
const L = require('../local'), hist = [{ role: 'user', content: 'ano meeting ko ngayon?' }, { role: 'assistant', content: 'Nothing on your Calendar for the next 24 hours. (I could not read Google Calendar and Metrobank Outlook; the others are checked.)' }];
(async () => {
  let r = await L.handleRules('on outlook', { history: hist, sid: 'qa-cal' });
  assert(/\*\*Outlook\*\*: Leads touchpoint at/.test(r.reply) && /\*\*Metrobank Outlook\*\*: I could not read it \(signed out\)\. Open Tulai Desktop → Settings → Calendars and press \*\*Sign in\*\*/.test(r.reply), r.reply);
  r = await L.handleRules('sa google', { history: hist, sid: 'qa-cal' }); assert(/Google Calendar\*\*: I could not read it/.test(r.reply) && !/Outlook/.test(r.reply), r.reply);
  r = await L.handleRules('on ascendion', { history: hist, sid: 'qa-cal' }); assert(/no calendar account named "ascendion"/i.test(r.reply) && /Outlook, Google Calendar, Metrobank Outlook/.test(r.reply), r.reply);
  r = await L.handleRules('on outlook', { history: [{ role: 'assistant', content: 'Here is a joke.' }], sid: 'qa-cal2' }); assert(!r || r.via !== 'calendar account', 'only right after a calendar answer');
  console.log('PASS calendar follow-up: "on outlook" re-checks that account, says exactly which needs sign-in, and names the accounts when unknown');
})().catch((e) => { console.error(e); process.exit(1); });
