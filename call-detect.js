// Notices when a call starts (Teams, Zoom, Google Meet in a browser, Webex, Slack huddle) without any extra Mac permission: apps in a call ask macOS to keep the
// display awake ("pmset -g assertions"), and browsers name theirs "WebRTC". Tulai then OFFERS to start meeting notes; it never starts recording by itself.
const { execFile } = require('child_process');
const APPS = [[/zoom\.us|CptHost/i, 'Zoom'], [/Microsoft Teams|MSTeams/i, 'Teams'], [/Webex/i, 'Webex'], [/Slack/i, 'Slack huddle']];
/** Which call apps are in a call right now, from the text of "pmset -g assertions". */
function parse(text) {
  const found = new Set();
  for (const line of String(text || '').split('\n')) {
    const m = /pid \d+\(([^)]+)\):.*?(PreventUserIdleDisplaySleep|PreventUserIdleSystemSleep|NoDisplaySleepAssertion|NoIdleSleepAssertion)\b.*?named: "([^"]*)"/.exec(line); if (!m) continue;
    const [, proc, , name] = m;
    for (const [re, app] of APPS) if (re.test(proc) && !/^Electron$/i.test(name) || (re.test(name) && re !== APPS[3][0])) found.add(app);
    if (/WebRTC/i.test(name) && /Chrome|Edge|Safari|Brave|Arc|Firefox/i.test(proc)) found.add('a browser call (Meet)');
  }
  return [...found];
}
let timer = null, inCall = new Set(), offeredAt = 0, enabled = true;
function check(onStart, run = (cb) => execFile('/usr/bin/pmset', ['-g', 'assertions'], { timeout: 5000 }, (e, out) => cb(e ? '' : out))) {
  run((out) => { const now = new Set(parse(out)); const started = [...now].filter((a) => !inCall.has(a)); inCall = now;
    if (enabled && started.length && Date.now() - offeredAt > 10 * 60000) { let rec = false; try { rec = require('./meeting').isRecording(); } catch {} if (!rec) { offeredAt = Date.now(); onStart(started[0]); } } });
}
function start(onStart, every = 15000) { stop(); check(() => {}); timer = setInterval(() => check(onStart), every); } // the first look only learns what is already running
function stop() { clearInterval(timer); timer = null; }
function handle(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^(?:stop|turn off|don'?t) (?:detecting|watching for|asking about) calls$|^call detection off$/.test(t)) { enabled = false; return { reply: 'Okay, I will not offer meeting notes when a call starts. Say "detect calls" to turn it back on.' }; }
  if (/^(?:detect calls|call detection on|turn on call detection)$/.test(t)) { enabled = true; return { reply: 'Okay: when a Teams, Zoom or Meet call starts, I will offer to take notes and suggest answers.' }; }
  return null;
}
module.exports = { parse, check, start, stop, handle, inCall: () => inCall.size > 0, _set: (s) => { inCall = new Set(s || []); offeredAt = 0; enabled = true; } };
