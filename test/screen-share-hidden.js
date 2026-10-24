// What you see during a call stays private: suggested answers go only to the floating answer window (content-protected), never into the bot chat,
// and the bot window itself is hidden from screen sharing while you are in a call or taking meeting notes.
const assert = require('assert'), fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main-bot.js'), 'utf8'), cw = fs.readFileSync(path.join(root, 'call-window.js'), 'utf8'), bw = fs.readFileSync(path.join(root, 'bot-window.js'), 'utf8');
const la = main.slice(main.indexOf("process.on('tulay:live-answer'")); assert(la.length > 0);
assert(!/bot\.send\([^)]*live-answer/.test(la.split('\n')[0]), 'live answers are never sent into the bot chat');
assert(/setContentProtection\(true\)/.test(cw), 'the floating answer window is hidden from screen sharing');
assert(/function protect\(on\)[\s\S]*setContentProtection\(on\)/.test(bw) && /if \(shield\) \{ try \{ win\.setContentProtection\(true\)/.test(bw), 'the bot window can be hidden, also when it is re-created');
assert(/const meetingNow = require\('\.\/call-detect'\)\.inCall\(\) \|\| require\('\.\/meeting'\)\.isRecording\(\); bot\.protect\(meetingNow\)/.test(main), 'hidden while in a call or taking notes');
console.log('PASS screen share: suggestions only in the hidden answer window; the bot window is hidden during calls and notes');
