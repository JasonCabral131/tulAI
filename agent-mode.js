// How much the bot's coding agent may do on its own, set by talking to it: "plan mode" (read only, plan first), "ask me first" (every edit and command
// asks), "edits mode" (edits files directly, commands ask; the default), "allow everything" (auto). Remembered on this Mac. Pushing is always blocked.
const fs = require('fs'), path = require('path');
const file = () => path.join(process.env.GC_DATA_DIR || path.join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'agent-mode.json');
const MODES = { plan: 'Plan mode: I only read and search, then show you a plan to approve before changing anything.', ask: 'Ask mode: I ask before every file edit and every command.', edits: 'Edits mode: I edit files directly (undo with git) and ask before running commands.', auto: 'Auto mode: I edit files and run commands without asking. I still never push; you push.' };
const get = () => { try { const m = JSON.parse(fs.readFileSync(file(), 'utf8')).mode; return MODES[m] ? m : 'edits'; } catch { return 'edits'; } };
const set = (m) => { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify({ mode: m, at: Date.now() })); return m; };
function handle(text) {
  const t = String(text || '').toLowerCase().replace(/[.!?]+$/g, '').trim(); let m = null;
  if (/^(?:(?:switch to|use|go to|turn on|enable)\s+)?plan(?:ning)? mode(?: on)?$|^plan first$|^plan it first$/.test(t)) m = 'plan';
  else if (/^(?:(?:switch to|use)\s+)?ask mode$|^ask (?:me )?(?:first|before (?:editing|changing|you edit)(?: anything)?)$|^always ask(?: me)?$/.test(t)) m = 'ask';
  else if (/^(?:(?:switch to|use)\s+)?edits? mode$|^(?:back to )?normal mode$|^edit files directly$/.test(t)) m = 'edits';
  else if (/^(?:(?:switch to|use)\s+)?auto(?:matic)? mode$|^allow everything$|^(?:don'?t|do not|never) ask(?: me)?(?: anymore| again)?$|^walang tanong(?: na)?$|^huwag ka nang magtanong$/.test(t)) m = 'auto';
  else if (/^(?:what(?:'s| is) (?:the |your )?(?:coding |agent )?mode|which mode are you in)$/.test(t)) return { reply: MODES[get()], via: 'agent mode' };
  if (!m) return null; set(m); return { reply: MODES[m], via: 'agent mode' };
}
/** The coding instruction the bot's brain practised with (scripts/agent-episodes.js uses the same text), so real jobs look exactly like the practice. */
const CODER = 'Use the tools to look at the real files: list the folder, read the file, make the smallest correct edit, then run the test or the code to check it. Never guess file contents and never ask the user to paste code you can read yourself. When you edit, copy old_string exactly from what read_file showed (every line, including comments and docstrings). For a local web app, first check what is actually running (bash: lsof -nP -iTCP -sTCP:LISTEN) and open only those; if what the user asked for is not running, say so and ask instead of searching around. Do not modify files unrelated to the request. Never push to a remote; commits stay local. Finish with one or two short sentences: what you changed and how you checked it.';
module.exports = { get, set, handle, MODES, CODER };
