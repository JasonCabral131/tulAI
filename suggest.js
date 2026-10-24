// The quick buttons of the bot panel. They follow your day: what is happening right now (a meeting is recording, one is about to start,
// it is Friday afternoon) first, then the things you personally ask at this time (habits.js), then a few sensible starters.
const same = (a, b) => String(a).toLowerCase().replace(/[^a-z ]/g, '') === String(b).toLowerCase().replace(/[^a-z ]/g, '');
/** ctx: { now: Date, recording: bool, nextMeetingMins: number|null, lastMeetingEndedMins: number|null, jira: bool, gitlab: bool, habits: string[] } */
function build(ctx, limit = 5) {
  const now = ctx.now || new Date(), h = now.getHours(), dow = now.getDay(), weekday = dow >= 1 && dow <= 5, out = [];
  const add = (t) => { if (t && !out.some((x) => same(x, t))) out.push(t); };
  if (ctx.recording) add('Stop meeting notes');
  else if (ctx.nextMeetingMins !== null && ctx.nextMeetingMins !== undefined && ctx.nextMeetingMins <= 5 && ctx.nextMeetingMins >= -10) add('Start meeting notes');
  if (ctx.nextMeetingMins !== null && ctx.nextMeetingMins !== undefined && ctx.nextMeetingMins <= 30 && ctx.nextMeetingMins > -10) add('Show my meetings');
  if (!ctx.recording && ctx.lastMeetingEndedMins !== null && ctx.lastMeetingEndedMins !== undefined && ctx.lastMeetingEndedMins <= 45) add('Summarize the meeting');
  if (weekday && h >= 5 && h < 11) add('Summarize my day');
  if (dow === 5 && h >= 14 && ctx.jira) add('Weekly status report');
  if (weekday && h < 12 && ctx.jira) add('Check my Jira status');
  if (weekday && h >= 9 && h < 18 && ctx.gitlab) add('Merge request queue');
  for (const x of ctx.habits || []) { if (ctx.recording && /^start meeting notes/i.test(x)) continue; if (!ctx.recording && /^stop meeting notes/i.test(x)) continue; add(x); }
  for (const x of ['Show my meetings', 'Open Teams', ctx.recording ? '' : 'Start meeting notes', 'What can you do?']) add(x);
  return out.slice(0, limit);
}
module.exports = { build };
