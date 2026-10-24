// "listen meeting notes" / "take meeting notes" really start the notes (or say they already run); never a made-up "started"
const assert = require('assert'), L = require('../local');
let rec = false, starts = 0;
const meeting = { state: () => ({ recording: rec }), start: () => { starts++; if (rec) return { ok: false, reply: 'A meeting is already being recorded.' }; rec = true; return { ok: true, reply: 'Meeting notes started.' }; }, stop: () => ({ reply: 'stopped' }), isRecording: () => rec };
(async () => {
  for (const t of ['listen meeting notes', 'Hey Tulai, listen meeting notes', 'take meeting notes', 'listen to my meetings', 'listen to the meeting notes']) {
    rec = false; const before = starts; const r = await L.handleRules(t, { meeting, sid: 'qa-start' }); assert(r && starts === before + 1 && /started/.test(r.reply), t + ' -> ' + JSON.stringify(r));
    const again = await L.handleRules(t, { meeting, sid: 'qa-start' }); assert(/already being recorded/.test(again.reply), 'asked again while recording: ' + again.reply);
  }
  console.log('PASS meeting start phrases: "listen meeting notes" really starts, and says so when already recording');
})().catch((e) => { console.error(e); process.exit(1); });
