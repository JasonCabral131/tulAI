// "on desktop create a folder name it platform-skills", "gumawa ng folder sa documents na reports", "make a new folder called notes":
// creates the folder for real (no AI guessing a tool). A missing place means the Desktop; a missing name is asked once and the next reply is the name.
// Anything written after the first line (a list of files to make, a spec) goes to the coding agent, working inside the new folder.
const fs = require('fs'), path = require('path'), os = require('os');
const PLACES = { desktop: 'Desktop', documents: 'Documents', docs: 'Documents', downloads: 'Downloads', home: '', 'home folder': '' };
const pending = new Map(); // sid -> { place, rest, at }
const INTENT = /\b(?:create|make|add|new|gawa|gumawa|gawin)\b[^\n]{0,40}?\b(?:folder|directory|dir)\b|\b(?:folder|directory)\b[^\n]{0,20}\b(?:create|make|gawa)\b/i;
const placeOf = (t) => { const m = /\b(?:on|in|sa|inside|under)\s+(?:the\s+|my\s+|aking\s+)?(desktop|documents|docs|downloads|home(?: folder)?)\b|^\s*(?:on\s+)?(desktop|documents|downloads)\b/i.exec(t); return m ? (m[1] || m[2]).toLowerCase() : ''; };
const nameOf = (t) => { const m = /\b(?:name(?:d)?(?:\s+it)?|call(?:ed)?(?:\s+it)?|pangalan(?:an)?(?:\s+mo)?(?:\s+ng)?(?:\s+(?:ay|is))?|titled)\s*:?\s+["'“]?([\w][\w.@ +-]{0,59}?)["'”]?\s*(?=$|[\n,.;]|\s+(?:and|then|at|on|in|sa|with)\b)/i.exec(t)
  || /\b(?:folder|directory)\s+["'“]([\w][\w.@ +-]{0,59})["'”]/i.exec(t); return m ? m[1].trim() : ''; };
const safe = (n) => !!n && !/[\/\\:*?"<>|]/.test(n) && !/^\.+$/.test(n) && n.length <= 60;
function make(place, name, rest) {
  const base = path.join(os.homedir(), PLACES[place] ?? 'Desktop'), dir = path.join(base, name), where = PLACES[place] === '' ? 'your home folder' : `your ${PLACES[place] || 'Desktop'}`;
  const existed = fs.existsSync(dir); if (!require('./sandbox').would('mkdir ' + dir)) fs.mkdirSync(dir, { recursive: true });
  const reply = `${existed ? 'That folder already exists' : 'Created the folder'} **${name}** ${PLACES[place] === '' ? 'in' : 'on'} ${where}: \`${dir}\``;
  if (rest && rest.trim().length > 20) return { agent: { task: `The folder ${dir} ${existed ? 'already exists' : 'was just created'}. Work inside it. Do this:\n\n${rest.trim()}`, workspace: dir, mode: require('./agent-mode').get() }, reply, via: 'create folder' };
  return { reply, via: 'create folder' };
}
function handle(raw, { sid = 'bot' } = {}) {
  const text = String(raw || '').replace(/^(?:hey|hi|ok|okay)\s+tula[iy][,!.\s]*/i, ''), [first, ...more] = text.split('\n'), rest = more.join('\n');
  const p = pending.get(sid);
  if (p && Date.now() - p.at < 10 * 60000) { // the answer to "what should I name it?"
    pending.delete(sid); const n = first.trim().replace(/^(?:name it|call it|named?|pangalan)\s+/i, '').replace(/[.!?]+$/, '').replace(/^["'“]|["'”]$/g, '');
    if (!INTENT.test(first) && safe(n) && n.split(/\s+/).length <= 6) return make(p.place, n, p.rest);
  }
  if (!INTENT.test(first)) return null;
  if (/\b(?:open|show|delete|remove|rename|move|zip)\b/i.test(first) && !/\b(?:create|make|new|gawa|gumawa)\b/i.test(first)) return null;
  const place = placeOf(first) || 'desktop', name = nameOf(first);
  if (!safe(name)) { pending.set(sid, { place, rest, at: Date.now() }); return { reply: `What should I name the new folder on your ${PLACES[place] || 'home folder'}?`, via: 'create folder' }; }
  return make(place, name, rest);
}
module.exports = { handle, nameOf, placeOf };
