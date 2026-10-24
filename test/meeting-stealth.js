// During a meeting Tulai hides from the menu bar (Tulai Bot) and from the Dock and top menu (Tulai Desktop); after it, both come back
const assert = require('assert'), fs = require('fs'), path = require('path');
const bot = fs.readFileSync(path.join(__dirname, '..', 'main-bot.js'), 'utf8'), desk = fs.readFileSync(path.join(__dirname, '..', 'main-desktop.js'), 'utf8'), srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
// the bot's rule, run with a fake menu-bar icon
const src = /function meetingStealth\(meetingNow\) \{[\s\S]*?\n\}/.exec(bot)[0];
let tray = null, made = 0; const prefs = { tray: true };
const makeTray = () => { tray = {}; made++; }, destroyTray = () => { tray = null; };
const g = {}; const run = (on) => new Function('prefs', 'makeTray', 'destroyTray', 'global', `let tray = arguments[4]; ${src}; meetingStealth(${on}); return tray;`);
meetingStealthCheck();
function meetingStealthCheck() {
  let t = run(true)(prefs, makeTray, destroyTray, g, {}); assert(g.__tulaiMeetingHidden === true, 'a meeting hides Tulai');
  prefs.hideInMeetings = false; run(true)(prefs, makeTray, destroyTray, g, {}); assert(g.__tulaiMeetingHidden === false, 'the setting turns it off');
  delete prefs.hideInMeetings; run(false)(prefs, makeTray, destroyTray, g, null); assert(g.__tulaiMeetingHidden === false && made >= 1, 'after the meeting the menu-bar icon comes back');
}
assert(/setInterval\(\(\) => \{ try \{ const meetingNow = require\('\.\/call-detect'\)\.inCall\(\) \|\| require\('\.\/meeting'\)\.isRecording\(\); bot\.protect\(meetingNow\); meetingStealth\(meetingNow\);/.test(bot), 'checked every few seconds: a call or meeting notes');
assert(/hideApp: !!global\.__tulaiMeetingHidden/.test(srv), 'Tulai Desktop is told when to hide');
assert(/app\.dock\.hide\(\)/.test(desk) && /app\.dock\.show\(\)/.test(desk) && /setInterval\(meetingStealth, 4000\)/.test(desk) && /!meetingHidden\) \{ try \{ app\.dock\.show/.test(desk), 'Desktop leaves the Dock during a meeting and does not come back when its window opens');
console.log('PASS meeting stealth: no menu-bar icon, Dock icon or top menu during a meeting; back after it; can be turned off');
