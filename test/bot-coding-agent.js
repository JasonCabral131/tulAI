// The bot chat codes like Tulai Desktop: coding work in a project on this Mac goes to the full coding agent (read/search/edit files, run commands) in the
// same chat, on the bot's own brain; file edits happen directly, commands ask first, and it never pushes. What the small bot tools cannot finish goes there too.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'coder-')); process.env.GC_DATA_DIR = home; fs.mkdirSync(path.join(home, 'Desktop', 'shop-app', '.git'), { recursive: true });
const realHome = os.homedir; os.homedir = () => home;
const L = require('../local');
let r = L.codeWork('fix the login bug in shop-app'); assert(r && r.agent.workspace === path.join(home, 'Desktop', 'shop-app') && r.agent.mode === 'edits' && r.via === 'coding agent');
assert(L.codeWork('add unit tests for the cart page in shop-app'), 'tests'); assert(L.codeWork('ayusin mo yung bug sa shop-app'), 'Tagalog');
assert.strictEqual(L.codeWork('fix my schedule for tomorrow'), null, 'not coding'); assert.strictEqual(L.codeWork('fix the login bug'), null, 'no project named: not guessed');
assert.strictEqual(L.codeWork('add a meeting with Ana tomorrow'), null);
r = L.offerDesktop('bot', 'refactor the api', 'x'); assert(r.agent && r.agent.task === 'refactor the api' && !/could not finish/.test(r.reply), 'what the bot tools cannot do goes to the coding agent, not a refusal');
// modes by talking, remembered; the chosen mode is used
const M = require('../agent-mode'); assert.strictEqual(M.get(), 'edits', 'edits by default');
assert(/Plan mode/.test(M.handle('plan mode').reply)); assert.strictEqual(M.get(), 'plan'); assert.strictEqual(L.codeWork('fix the login bug in shop-app').agent.mode, 'plan');
M.handle('allow everything'); assert.strictEqual(M.get(), 'auto'); M.handle('ask me first'); assert.strictEqual(M.get(), 'ask'); assert(/never push/i.test(M.handle('auto mode').reply)); M.handle('edits mode');
assert.strictEqual(M.handle('what is a plan'), null);
// "this project" = the last project named; tool work that is not coding also goes to the agent
assert.strictEqual(L.codeWork('fix the crash in this project').agent.workspace, path.join(home, 'Desktop', 'shop-app'), 'the last project named');
for (const q of ['go to github.com and check my open pull requests', 'use the browser to find the release date of React 19', 'call the localhost:3000/health endpoint', 'plan the refactor of the payments module']) assert(L.toolWork(q) && L.toolWork(q).agent, q);
assert.strictEqual(L.toolWork('plan the refactor of the payments module').agent.mode, 'plan');
for (const q of ['open youtube', 'go to sleep', 'what is an api']) assert.strictEqual(L.toolWork(q), null, q);
os.homedir = realHome;
const conv = fs.readFileSync(path.join(__dirname, '..', 'converse.js'), 'utf8'), ag = fs.readFileSync(path.join(__dirname, '..', 'agent.js'), 'utf8');
assert(/if \(local && local\.agent\) \{ agentJob = local\.agent; \}/.test(conv) && /noPush: true/.test(conv) && /agentJob && agentJob\.mode/.test(conv), 'the chat runs the agent with the job\'s folder and mode, and never pushes');
assert(/body\.noPush && name === 'bash' && \/\\bgit\\b\[\\s\\S\]\*\\bpush\\b\/i/.test(ag), 'git push is blocked for the bot');
assert(/function planCard\(ev\)/.test(fs.readFileSync(path.join(__dirname, '..', 'public', 'bot.html'), 'utf8')), 'the bot window shows the plan with Go ahead / Ask me / Stop');
console.log('PASS bot coding agent: coding work runs the full agent in the bot chat (edits direct, commands asked, never pushes)');
