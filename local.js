// Local engine: simple requests about this computer are handled right here, with no call to the gateway.
// Anything it does not clearly understand returns null, and the request goes to the model as usual.
// Everything is safe by construction: only opens things, adjusts volume, reads the clock. Nothing is deleted or typed.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DRY = process.env.TULAY_LOCAL_DRY === '1', dry = [];
const run = (cmd, args, timeout = 15000) => (DRY || require('./sandbox').would([path.basename(cmd), ...args].join(' '))) ? (dry.push([path.basename(cmd), ...args].join(' ')), Promise.resolve('')) : new Promise((res, rej) => execFile(cmd, args, { timeout }, (e, so, se) => (e ? rej(new Error(String(se || e.message).trim().slice(0, 200))) : res(String(so).trim()))));
const osa = (script) => run('/usr/bin/osascript', ['-e', script]);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const clean = (t) => String(t || '').trim().replace(/\binversus\b/gi, 'in versus').replace(/\bin in\b/gi, 'in').replace(/^[\s,.!?]+|[\s,.!?]+$/g, '').replace(/^(please|pls|can you|could you|would you|kindly|tulay|tulai)[,\s]+/i, '').replace(/\s+(please|pls|for me|now)$/i, '').trim();

const EDITORS = { 'versus code': 'Visual Studio Code', 'inversus code': 'Visual Studio Code', 'vessus code': 'Visual Studio Code', 'vs. code': 'Visual Studio Code', 'v s code': 'Visual Studio Code', 'vscode': 'Visual Studio Code', 'vs code': 'Visual Studio Code', vscode: 'Visual Studio Code', 'visual studio code': 'Visual Studio Code', code: 'Visual Studio Code', cursor: 'Cursor', xcode: 'Xcode', 'android studio': 'Android Studio', finder: 'Finder', terminal: 'Terminal', qoder: 'Qoder', sublime: 'Sublime Text' };
const ALIAS = { viscode: 'Visual Studio Code', 'vis code': 'Visual Studio Code', 'viz code': 'Visual Studio Code', 'visual code': 'Visual Studio Code', 'vs codes': 'Visual Studio Code', 'be s code': 'Visual Studio Code', 'versus code': 'Visual Studio Code', 'vessus code': 'Visual Studio Code', chrome: 'Google Chrome', 'google chrome': 'Google Chrome', browser: 'Safari', vscode: 'Visual Studio Code', 'vs code': 'Visual Studio Code', code: 'Visual Studio Code', 'visual studio code': 'Visual Studio Code', settings: 'System Settings', 'system settings': 'System Settings', 'system preferences': 'System Settings', docker: 'Docker', claude: 'Claude', chatgpt: 'ChatGPT', simulator: 'Simulator', 'ios simulator': 'Simulator', notes: 'Notes', calendar: 'Calendar', mail: 'Mail', messages: 'Messages', music: 'Music', photos: 'Photos', calculator: 'Calculator', slack: 'Slack', teams: 'Microsoft Teams', zoom: 'zoom.us', spotify: 'Spotify' };

function lev(a, b) { const m = a.length, n = b.length; if (Math.abs(m - n) > 3) return 9; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const tol = (s) => { const n = String(s).length; return n >= 9 ? 2 : n >= 5 ? 1 : 0; }; // how many mistakes in a heard name we forgive
function installedApps() {
  const out = new Map();
  for (const dir of ['/Applications', '/System/Applications', '/System/Applications/Utilities', '/Applications/Utilities', '/System/Library/CoreServices', '/System/Cryptexes/App/System/Applications', path.join(os.homedir(), 'Applications')]) {
    try { for (const f of fs.readdirSync(dir)) if (f.endsWith('.app')) out.set(norm(f.slice(0, -4)), f.slice(0, -4)); } catch {}
  }
  return out;
}
function findApp(name) {
  const key = String(name).toLowerCase().trim().replace(/^(my|the)\s+/, ''), have = installedApps(), there = (v) => have.has(norm(v)) || ['Finder', 'Safari'].includes(v); // a nickname only counts if that app is really installed
  if (ALIAS[key]) return there(ALIAS[key]) ? ALIAS[key] : null;
  for (const [k, v] of Object.entries(ALIAS)) if (k.length >= 5 && lev(norm(key), norm(k)) <= 1 && there(v)) return v;
  const apps = installedApps(), n = norm(name); if (!n) return null;
  if (apps.has(n)) return apps.get(n);
  for (const [k, v] of apps) if (k.startsWith(n)) return v;
  for (const [k, v] of apps) if (k.includes(n) && n.length >= 4) return v;
  let best = null; for (const [k, v] of apps) { const d = lev(n, k); if (d <= tol(n) && (!best || d < best.d)) best = { v, d }; }
  return best ? best.v : null;
}
const FILLER = new Set(['the', 'a', 'an', 'my', 'it', 'that', 'this', 'please', 'up', 'something', 'stuff', 'one', 'project', 'folder', 'app', 'and', 'to', 'in', 'on', 'of', 'for', 'ang', 'sa', 'na']);
function findFolder(name, roots) {
  const n = norm(name); if (!n || FILLER.has(n)) return null; let best = null;
  const dirs = (roots && roots.length ? roots : ['Desktop', 'Documents', 'Developer', 'Projects', 'Code', 'dev', 'work', 'repos', 'src', 'Downloads', '']).map((r) => path.join(os.homedir(), r));
  const skip = new Set(['node_modules', 'Library', '.git', 'Applications', 'Movies', 'Music', 'Pictures']);
  const visit = (dir, depth) => {
    let items; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (!it.isDirectory() || it.name.startsWith('.') || skip.has(it.name)) continue;
      const k = norm(it.name), full = path.join(dir, it.name), score = k === n ? 3 : k.startsWith(n) ? 2 : n.length >= 3 && k.includes(n) ? 1 : (n.length >= 5 && lev(n, k) <= tol(n) ? 2 : 0);
      if (score > (best ? best.score : 0) || (score && best && score === best.score && full.length < best.path.length)) best = { path: full, score };
      if (depth < 2 && score < 3) visit(full, depth + 1);
    }
  };
  for (const d of dirs) { if (fs.existsSync(d)) visit(d, 0); if (best && best.score === 3) break; }
  return best ? best.path : null;
}
const openWith = (app, target) => run('/usr/bin/open', app ? ['-a', app, ...(target ? [target] : [])] : [target]);
/* Speech engines hear "open youtube.com" as youborn.com, ucorn.com, utube.com... A near miss of a well-known site is corrected; an adult site is never opened without a clear yes. */
const MISHEARD = /^(youborn|youporn|ucorn|ucorns|uborn|youcorn|utube|youtub|youtoob|youtuube|yootube|newtube|you ?tube)$/;
const ADULT = /(porn|xxx|xvideo|xnxx|hentai|redtube|xhamster|onlyfans|sexcam)/i;
function fixSite(s) {
  const m = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+)\.(com|net|org|io|co|ph|tv)(\/\S*)?$/i.exec(String(s).trim().replace(/\s+/g, '')); if (!m) return null; const label = m[1].toLowerCase();
  if (MISHEARD.test(label)) return { url: 'https://www.youtube.com', name: 'youtube.com', fixed: true };
  for (const k of ['facebook', 'github', 'gmail', 'google', 'netflix']) if (label !== k && label.length >= 5 && lev(label, k) <= 1) return { url: SITES[k], name: k + '.com', fixed: true };
  return null;
}
/* Work apps many people only use in the browser: when the app is not installed, "open Teams" opens the web version (and asks which Chrome profile). */
const WEBAPPS = { teams: 'https://teams.microsoft.com', 'microsoft teams': 'https://teams.microsoft.com', outlook: 'https://outlook.office.com/mail', 'outlook mail': 'https://outlook.office.com/mail', 'outlook calendar': 'https://outlook.office.com/calendar', calendar: 'https://calendar.google.com', slack: 'https://app.slack.com/client', notion: 'https://www.notion.so', figma: 'https://www.figma.com', 'google meet': 'https://meet.google.com', meet: 'https://meet.google.com', zoom: 'https://zoom.us/myhome', confluence: 'https://www.atlassian.com/software/confluence', 'google docs': 'https://docs.google.com', 'google sheets': 'https://sheets.google.com', onedrive: 'https://onedrive.live.com', sharepoint: 'https://www.office.com' };
const urlFrom = (t) => { const s = t.trim().replace(/\s+/g, ''); if (/^https?:\/\//i.test(s)) return s; if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|org|net|io|dev|ph|gov|edu|app|ai|co|me)(\/\S*)?$/i.test(s)) return 'https://' + s; return null; };
const SITES = { youtube: 'https://www.youtube.com', github: 'https://github.com', gmail: 'https://mail.google.com', google: 'https://www.google.com', facebook: 'https://www.facebook.com', jira: 'https://www.atlassian.com/software/jira', netflix: 'https://www.netflix.com', 'google drive': 'https://drive.google.com' };

const clock = () => { const d = new Date(); return `It is ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`; };
const day = () => `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`;


const LAST = new Map(); // last folder opened, per conversation, so "open it in VS Code" works
const NEDIT = {}; for (const [k, v] of Object.entries({ ...EDITORS, thiscode: 'Visual Studio Code', thecode: 'Visual Studio Code', acode: 'Visual Studio Code', becode: 'Visual Studio Code', bscode: 'Visual Studio Code', vscodes: 'Visual Studio Code', viscode: 'Visual Studio Code', vizcode: 'Visual Studio Code', vcode: 'Visual Studio Code', visualcode: 'Visual Studio Code', 'beescode': 'Visual Studio Code' })) NEDIT[k.toLowerCase().replace(/[^a-z0-9]+/g, '')] = v;
function editorFor(str) {
  const k = String(str).toLowerCase().replace(/^(?:my|the|a)\s+/, '').replace(/\s+(?:app|editor)$/, '').replace(/[^a-z0-9]+/g, ''); if (!k) return null;
  if (NEDIT[k]) return NEDIT[k];
  if (k.length >= 5) for (const [nk, v] of Object.entries(NEDIT)) if (nk.length >= 5 && lev(k, nk) <= 1) return v;
  return null;
}

/* ---- follow-up questions (which Chrome profile? who is the email for?) ---- */
const PEND = new Map();
const setPend = (sid, p) => PEND.set(sid, { ...p, exp: Date.now() + 120000 });
const getPend = (sid) => { const p = PEND.get(sid); if (p && p.exp > Date.now()) return p; PEND.delete(sid); return null; };
const DATA = () => process.env.GC_DATA_DIR || __dirname;
const readPrefs = () => { try { return JSON.parse(fs.readFileSync(path.join(DATA(), 'local-prefs.json'), 'utf8')); } catch { return {}; } };
const writePrefs = (o) => { try { fs.writeFileSync(path.join(DATA(), 'local-prefs.json'), JSON.stringify({ ...readPrefs(), ...o })); } catch {} };

function chromeProfiles() {
  const dir = process.env.TULAY_CHROME_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  try {
    const ic = (JSON.parse(fs.readFileSync(path.join(dir, 'Local State'), 'utf8')).profile || {}).info_cache || {};
    return Object.entries(ic).map(([d, v]) => ({ dir: d, name: v.name || d, email: v.user_name || '' })).sort((a, b) => (a.dir === 'Default' ? -1 : b.dir === 'Default' ? 1 : a.dir.localeCompare(b.dir, undefined, { numeric: true })));
  } catch { return []; }
}
const ORD = { first: 0, one: 0, '1': 0, '1st': 0, second: 1, two: 1, '2': 1, '2nd': 1, third: 2, three: 2, '3': 2, '3rd': 2, fourth: 3, four: 3, '4': 3, fifth: 4, five: 4, '5': 4 };
const W2D = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
function matchProfile(text, options) {
  const t = String(text).toLowerCase().replace(/[^a-z0-9@. ]+/g, ' ').replace(/\s+/g, ' ').trim(); if (!t) return null;
  const nt = norm(t.split(' ').map((w) => (W2D[w] !== undefined ? String(W2D[w]) : w)).join(' ')); // "back up one" is the profile called backup1
  for (const o of options) { const nn = norm(o.name), ne = norm(o.email.split('@')[0]); if ((nn && (nt.includes(nn) || (nt.length >= 3 && nn.includes(nt)))) || (ne && ne.length >= 3 && nt.includes(ne))) return o; } // names first
  for (const o of options) { const nn = norm(o.name); if (nn.length >= 5 && lev(nt, nn) <= 1) return o; }
  if (t.split(' ').length <= 4) for (const w of t.split(' ')) if (ORD[w] !== undefined && options[ORD[w]]) return options[ORD[w]]; // "the first one", "number 3"
  return null;
}
const listNames = (opts) => { const dup = (o) => opts.filter((x) => x.name === o.name).length > 1; const n = opts.map((o) => o.name + (dup(o) && o.email ? ` (${o.email})` : '')); return n.length > 1 ? n.slice(0, -1).join(', ') + ' or ' + n[n.length - 1] : n[0]; };
async function openChrome(profile, url) {
  const args = ['-na', 'Google Chrome', '--args', ...(profile ? [`--profile-directory=${profile.dir}`] : []), ...(url ? [url] : [])];
  await run('/usr/bin/open', args);
}
/** Opens Chrome. One profile: opens it straight away. Several: asks which one (unless the person already named it). */
async function chromeOpen(sid, { url, hint, message, after }) {
  const profs = chromeProfiles(), done = (p) => ({ reply: (message ? message : url ? 'Opened it in Chrome' : 'Opened Chrome') + (p && profs.length > 1 ? ` with the ${p.name} profile` : '') + (after ? `. ${after}` : '.') });
  if (profs.length <= 1) { await openChrome(profs[0], url); return done(profs[0]); }
  const named = hint ? matchProfile(hint, profs) : null; if (named) { await openChrome(named, url); return done(named); }
  setPend(sid, { kind: 'chrome', url, message, after, options: profs });
  return { reply: `Which Chrome profile should I open? ${listNames(profs)}.` };
}

/* ---- Microsoft Teams (web): opens a chat with the person with your message typed in the box; you press Enter to send ---- */
const contactsOf = () => readPrefs().contacts || {};
const saveContact = (name, email) => writePrefs({ contacts: { ...contactsOf(), [norm(name)]: email } });
async function teamsChat(sid, d) {
  const key = norm(d.who), email = d.email || contactsOf()[key];
  let hasTeams = false; try { hasTeams = !!(global.__tulaiCalendar && require('./teams-send').teamsSource()); } catch {}
  if (hasTeams) { // Tulai's own signed-in Teams, in the background: never Chrome, no email needed (it finds the person by name in Teams)
    if (d.skip) { try { await global.__tulaiCalendar('webopen', { id: 'teams' }); } catch {} return { reply: 'Opened Teams in Tulai\'s browser.' }; }
    if (!d.body) { setPend(sid, { kind: 'teams-body', d: { ...d, email } }); return { reply: `What should I send to ${d.who} in Teams?` }; }
    let found = email ? { email } : null, title = '';
    if (!found) { try { const r = await global.__tulaiCalendar('teamsfind', { name: d.who }); if (r && r.needsLogin) return { reply: 'Teams needs you to sign in again. Open Tulai Desktop → Settings → Calendars, press Sign in on Teams, then ask me again.' }; if (r && r.ok) { found = r; title = r.title || ''; saveContact(d.who, r.email); } } catch {} }
    if (!found) { setPend(sid, { kind: 'teams-email', d }); return { reply: `I could not find ${d.who} in Teams search. What is their work email? I will remember it.` }; }
    const who = `${d.who} (${found.email}${title ? ', ' + title : ''})`; // you named the person and the message: send it now, no extra question
    try { const r = await global.__tulaiCalendar('teamssend', { email: found.email, body: d.body }); if (r && r.ok) return { reply: `Sent to **${who}** in Teams ✓\n\n> ${d.body}` }; if (r && r.needsLogin) return { reply: 'Teams needs you to sign in again. Open Tulai Desktop → Settings → Calendars, press Sign in on Teams, then ask me again.' }; return { reply: `I could not send it to ${who}: ${(r && r.reason) || 'Teams did not respond.'}` }; }
    catch (e) { return { reply: 'I could not send it: ' + e.message }; }
  }
  if (!email && !d.skip) { setPend(sid, { kind: 'teams-email', d }); return { reply: `What is ${d.who}'s work email? I will remember it for next time. Or say "just open Teams".` }; }
  if (email && !d.skip && global.__tulaiCalendar) { let has = false; try { has = !!require('./teams-send').teamsSource(); } catch {}
    if (has) { if (!d.body) { setPend(sid, { kind: 'teams-body', d: { ...d, email } }); return { reply: `What should I send to ${d.who} in Teams?` }; }
      setPend(sid, { kind: 'teams-send', d: { ...d, email } }); return { reply: `Send to **${d.who}** (${email}) in Teams:\n\n> ${d.body}\n\nSay **yes** to send it, or **no**.` }; } }
  const url = email ? `https://teams.microsoft.com/l/chat/0/0?users=${enc(email)}${d.body ? `&message=${enc(d.body)}` : ''}` : 'https://teams.microsoft.com/';
  return chromeOpen(sid, { url, hint: d.org, message: email ? `Opened a Teams chat with ${d.who}` : 'Opened Teams', after: email ? (d.body ? 'Your message is typed in the box. Please check it and press Enter to send' : 'Type your message and press Enter') : `Search for ${d.who} there` });
}
// Looser reading for natural and Taglish sentences: "send ka nga ng message kay Marko sa Teams", "padalhan mo si Marco ng message sa teams na may meeting tayo"
const NOT_NAMES = /^(me|him|her|them|you|ang|yung|iyong|ung|a|an|the|my|ako|ikaw|siya|kami|tayo|sila|mo|ka|nga|po|pls|please|message|msg|chat|teams|team|ng|na|sa)$/i;
function parseTeamsLoose(text) {
  if (!/\bteams\b/i.test(text) || !/\b(send|message|msg|chat|dm|text|ping|padala|padalhan|i-?message|mag-?message|magmessage|mag-?chat|sabihan|kausapin|contact|reach out)\b/i.test(text)) return null;
  const nm = /\b(?:kay|si|ni|to|with|for)\s+([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)?)(?=\s+(?:sa|on|in|at|via|using|through|thru|ng|na|that|saying|about|regarding|ka|mo|nga|please|pls|po)\b|[,.!?]|$)/i.exec(text);
  let who = nm ? nm[1].trim() : ''; who = who.split(/\s+/).filter((w) => !NOT_NAMES.test(w)).join(' '); if (!who) return null;
  let body = ''; const mb = /\bteams\b[,.:]?\s*(?:(?:na|saying|that says|and say|and tell (?:him|her|them)|sabihin mo(?: na)?|message)\s+)?([\s\S]+)$/i.exec(text); if (mb) body = mb[1].trim();
  const pre = /(?:saying|that says|and say|sabihin mo(?: na)?|na)\s+([\s\S]+?)\s+(?:on|in|sa|via|using)\s+(?:my\s+|the\s+)?(?:\w+\s+)?teams\s*$/i.exec(text); if (!body && pre) body = pre[1].trim();
  body = body.replace(/^(?:na\s+)?(?:may|saying)\s+(?=\S)/i, (m) => (/^na\s+may/i.test(m) || /^may/i.test(m) ? 'may ' : '')).replace(/[.]$/, '');
  const og = /\b(?:in|on|sa)\s+(?:the\s+|my\s+)?([A-Za-z][A-Za-z-]+)\s+(?:ms\s+|microsoft\s+)?teams\b/i.exec(text); const org = og && !/^(microsoft|ms|my|the|a|this|that)$/i.test(og[1]) ? og[1] : '';
  return { who, org, body, email: extractEmail(who) || null };
}
/** "send message to Juan Dela Cruz: hi", "message Ana that I am late", "chat mo si Ana ng hi pogi": a chat message without the word Teams.
 Goes to Teams only when your Teams account is set up in Tulai, and never when you say email. */
function parseChatAny(text) {
  const t = String(text).trim(); if (/\b(?:e-?mail|gmail|mail)\b/i.test(t)) return null;
  let has = false; try { has = !!require('./teams-send').teamsSource(); } catch {} if (!has) return null;
  let m = /^(?:please\s+|can you\s+|pakis?\s*)?(?:send\s+(?:a\s+)?(?:message|msg|chat)\s+to|message|msg|chat(?:\s+with)?|dm|ping|tell)\s+(.+?)\s*(?:[:\-–]\s*|\s+(?:that|saying)\s+)([\s\S]+)$/i.exec(t);
  if (!m) m = /^(?:pa)?(?:chat|message|i-?message|mag-?message|sabihan|padalhan)\s+(?:mo\s+|nga\s+)*(?:si|kay|sina)\s+(.+?)\s+(?:ng|na|nang)\s+(?:message\s+(?:na\s+)?)?([\s\S]+)$/i.exec(t);
  if (!m) return null; const who = m[1].replace(/^(?:to|si|kay)\s+/i, '').replace(/[,.]+$/, '').trim(); if (!who || who.split(/\s+/).length > 4) return null;
  return { who, org: '', body: m[2].trim(), email: extractEmail(who) || null };
}
let lastTeamsWho = null; // "chat him" means the last person you messaged
function parseTeams(text) {
  const m = /^(?:in\s+|on\s+|via\s+)?(?:ms\s+|microsoft\s+)?teams?\s+(?:chat|message|msg|dm)\s+(.+?)(?:\s*[:\-–]\s*([\s\S]+))?$/i.exec(String(text).trim());
  let r = m ? { who: m[1].replace(/[,.]+$/, '').trim(), org: '', body: (m[2] || '').trim(), email: extractEmail(m[1]) || null } : (parseTeamsStrict(text) || parseTeamsLoose(text) || parseChatAny(text));
  if (!r) return null;
  if (/^(?:him|her|them|siya|sya|kanya)$/i.test(r.who)) { if (!lastTeamsWho) return null; r = { ...r, who: lastTeamsWho }; }
  if (r.who && r.who.split(/\s+/).length > 5) return null; lastTeamsWho = r.who; return r;
}
function parseTeamsStrict(text) {
  const m = /^(?:(?:can|could|would) you\s+|please\s+)?(?:chat|message|msg|dm|ping|text|talk to|contact|teams)\s+(?:with\s+|to\s+)?(.+)$/i.exec(text); if (!m) return null;
  let rest = m[1], body = '';
  const mb = /(?:^|[\s,])(?:saying|that says|and say|and tell (?:him|her|them)|with (?:the )?message|message)\s+([\s\S]+)$/i.exec(rest); if (mb) { body = mb[1].trim(); rest = rest.slice(0, mb.index).trim(); }
  let mt = /^(.+?)\s+(?:in|on|at|via|using|through|thru)\s+(?:the\s+|my\s+)?(?:(.+?)\s+)?(?:ms\s+|microsoft\s+)?teams$/i.exec(rest);
  if (!mt) { const m2 = /^(.+?)\s+(?:(?:in|on|at|via|using|through|thru)\s+)?(?:the\s+|my\s+)?(?:ms\s+|microsoft\s+)?teams\b[,.:]?\s*([\s\S]*)$/i.exec(rest); if (m2 && m2[1].split(/\s+/).length <= 4) { mt = [rest, m2[1].replace(/\s+(?:in|on|at|via|using)$/i, ''), '']; if (!body && m2[2]) body = m2[2].trim(); } }
  if (!mt && !/\bteams\b/i.test(text)) return null; // plain "message John" without Teams is left to the model
  const who = (mt ? mt[1] : rest.replace(/\s*teams.*$/i, '')).replace(/[,.]+$/, '').trim(), org = mt && mt[2] ? mt[2].replace(/^(?:the|my)\s+/i, '').trim() : '';
  if (!who || who.split(/\s+/).length > 4) return null;
  return { who, org, body, email: extractEmail(who) || null };
}

/* ---- email: opens a draft for you to check and send; it never sends on its own except when you say "send it" for the Mail app ---- */
const enc = encodeURIComponent;
const MAILERS = {
  gmail: (to, su, b) => `https://mail.google.com/mail/?view=cm&fs=1&to=${enc(to)}&su=${enc(su)}&body=${enc(b)}`,
  outlook: (to, su, b) => `https://outlook.office.com/mail/deeplink/compose?to=${enc(to)}&subject=${enc(su)}&body=${enc(b)}`,
};
function extractEmail(s) {
  const t = String(s).toLowerCase().replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.').replace(/\s*@\s*/g, '@').replace(/(?<=\w)\s+(?=\w+@)/g, '');
  const m = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/.exec(t); return m ? m[0] : null;
}
const aq = (x) => String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
async function composeMail(sid, d) {
  if (!d.to) { setPend(sid, { kind: 'email-to', d }); return { reply: d.who ? `What is ${d.who}'s email address? Say it like name at company dot com.` : 'Who should I send it to? Say the email address, like name at company dot com.' }; }
  if (!d.body) { setPend(sid, { kind: 'email-body', d }); return { reply: 'What should the email say?' }; }
  const subject = d.subject || d.body.split(/\s+/).slice(0, 7).join(' '), provider = d.provider || readPrefs().emailProvider || 'gmail';
  if (provider === 'mail') {
    await osa(`tell application "Mail"\nset m to make new outgoing message with properties {subject:"${aq(subject)}", content:"${aq(d.body)}", visible:true}\ntell m to make new to recipient with properties {address:"${aq(d.to)}"}\nactivate\nend tell`);
    setPend(sid, { kind: 'email-confirm', d: { ...d, subject } });
    return { reply: `The email to ${d.to} is ready in Mail. Say "send it" to send, or "cancel".` };
  }
  return chromeOpen(sid, { url: MAILERS[provider](d.to, subject, d.body), message: `Your ${provider === 'outlook' ? 'Outlook' : 'Gmail'} draft to ${d.to} is open in Chrome`, after: 'Please check it and press Send' });
}
const EMAIL_RE = /^(?:send|write|compose|draft|create|email|mail)\s+(?:an?\s+|the\s+)?(?:e-?mail|mail|message)?\s*(?:to\s+)?(.*)$/i;
function parseEmail(text) {
  if (!/^(?:send|write|compose|draft|create)\s+(?:an?\s+|the\s+)?(?:e-?mail|mail)\b|^e-?mail\s+\S/i.test(text)) return null;
  let rest = text.replace(/^(?:send|write|compose|draft|create)\s+(?:an?\s+|the\s+)?(?:e-?mail|mail)\s*/i, '').replace(/^e-?mail\s+/i, '').replace(/^to\s+/i, '').trim();
  let body = '', subject = '';
  const mb = /(?:^|[\s,])(?:saying|that says|and say|and tell (?:him|her|them)|with (?:the )?(?:message|body)|message)\s+([\s\S]+)$/i.exec(rest); if (mb) { body = mb[1].trim(); rest = rest.slice(0, mb.index).trim(); }
  const ms = /(?:^|[\s,])(?:with )?(?:the )?(?:subject|about|regarding)\s+([\s\S]+)$/i.exec(rest); if (ms) { subject = ms[1].trim(); rest = rest.slice(0, ms.index).trim(); }
  const to = extractEmail(rest), who = to ? '' : rest.replace(/^(to|my|the)\s+/i, '').replace(/[,.]+$/, '').trim();
  return { to, who: who && who.length < 40 ? who : '', subject, body };
}
function withOffer(sid, r) { if (!r) return r; const {offerTask, ...result} = r; return result; }
let lastDevCtx = null;
function devCtx(sid, opts) { lastDevCtx = { sid, setPend, chromeOpen, last: LAST.get(sid), setLast: (d) => LAST.set(sid, d), findFolder, roots: opts.roots, nlu: opts.nlu, vocab: () => vocab(opts) }; return lastDevCtx; }
async function handlePending(sid, p, text) {
  const t = text.toLowerCase();
  if (/^(cancel|never mind|nevermind|stop|forget it|wag na|huwag na|ayaw ko na)\b/.test(t)) { PEND.delete(sid); if (p.kind === 'email-confirm') await osa('tell application "Mail" to close (first outgoing message) saving no').catch(() => {}); return { reply: 'Okay, cancelled.' }; }
  const looksNew = text.split(/\s+/).length >= 4 || /^(open|start|stop|what|set|send|email|search|play|pause|mute|quit|close|write|tell|launch|volume|lock|summari[sz]e|record|hey|hello|hi)\b/i.test(text);
  if (p.kind === 'forget-all') { PEND.delete(sid); if (/^(?:yes|yeah|yep|sure|go|do it|ok|okay|sige|oo|confirm)\b/.test(t)) { require('./bot-memory').save([]); return { reply: 'Done. I forgot everything I had saved.' }; } return { reply: 'Okay, I kept them.' }; }
  if (p.kind === 'open-adult') { PEND.delete(sid); if (/^(?:yes|yeah|yep)[,.!\s]*(?:open it|please|i do|i'm sure)?[.!]*$/.test(t)) { await run('/usr/bin/open', [p.url]); return { reply: 'Okay, opened it.' }; } return { reply: 'Okay, I will not open it.' }; }
  if (p.kind === 'open-what') { PEND.delete(sid); if (text.split(/\s+/).length > 6) return null; return handleRules('open ' + text.replace(/^(?:the|my|a)\s+/i, ''), { sid }); }
  if (p.kind === 'dev-project' || p.kind === 'dev-confirm') {
    if (p.kind === 'dev-confirm' && !/^(?:yes|yeah|yep|sure|go|go ahead|do it|ok|okay|sige|oo|confirm|please)\b/.test(t) && looksNew) { PEND.delete(sid); return null; }
    PEND.delete(sid); const dctx = lastDevCtx && lastDevCtx.sid === sid ? lastDevCtx : devCtx(sid, {}); const r = await require('./dev-rules').pending(p, text, dctx);
    if (r && r.keep) { setPend(sid, p); } return r;
  }
  if (p.kind === 'chrome') { const o = matchProfile(text, p.options); if (!o && looksNew) { PEND.delete(sid); return null; } if (!o) { setPend(sid, p); return { reply: `I did not catch that. Which profile: ${listNames(p.options)}?` }; } PEND.delete(sid); await openChrome(o, p.url); return { reply: `${p.message ? p.message : p.url ? 'Opened it in Chrome' : 'Opened Chrome'} with the ${o.name} profile${p.after ? `. ${p.after}` : '.'}` }; }
  if (p.kind === 'desktop-offer') { if (/^(?:yes|yeah|yep|sure|please|go ahead|sige|oo|ok|okay|do it|yes please|ask|ask it|ipasa mo|pasa mo)\b/.test(t)) { PEND.delete(sid); return { delegate: p.task, handoffConfirmed: true, reply: 'Okay, I opened Tulai Desktop and I am starting on it.' }; } PEND.delete(sid); return /^(?:no|nope|not now|hindi|wag|huwag|never ?mind|cancel)\b/.test(t) ? { reply: 'Okay, I will not.' } : null; }
  if (p.kind === 'meeting-polish') { if (/^(?:yes|yeah|yep|sure|please|go ahead|sige|oo|ok|okay|do it|yes please)\b/.test(t)) { PEND.delete(sid); return require('./work-rules').polish(p.file); } PEND.delete(sid); return /^(?:no|nope|not now|hindi|wag|huwag)\b/.test(t) ? { reply: 'Okay.' } : null; }
  if (p.kind === 'remind-when') { const rem = require('./reminders'), w = rem.parseWhen(text); if (!w) { if (looksNew) { PEND.delete(sid); return null; } setPend(sid, p); return { reply: 'I did not get the time. Say in 10 minutes, or at 3 PM, or say cancel.' }; } PEND.delete(sid); const at = w.at.getTime(); rem.add({ at, text: p.text || 'you have a meeting' }); return { reply: `Okay, I will remind you ${rem.when(at)}${p.text ? ` about ${p.text}` : ''}.` }; }
  if (p.kind === 'teams-body') { if (looksNew && text.split(/\s+/).length > 12) { PEND.delete(sid); return null; } PEND.delete(sid); return teamsChat(sid, { ...p.d, body: text }); }
  if (p.kind === 'teams-send') {
    if (/^(?:yes|yeah|yep|send(?: it)?|go ahead|sige|oo|ipadala|ok(?:ay)?)\b/.test(t)) { PEND.delete(sid);
      try { const r = await global.__tulaiCalendar('teamssend', p.d.email ? { email: p.d.email, body: p.d.body } : { name: p.d.who, body: p.d.body }); if (r && r.notFound) return { reply: `I could not find ${p.d.who} in Teams search${(r.options || []).length ? ': I saw ' + r.options.slice(0, 3).map((o) => o.label).join('; ') : ''}. Tell me their work email and I will send it.` }; if (r && r.ok) return { reply: `Sent to ${p.d.who} in Teams ✓ (I checked that it appears in the chat).` }; if (r && r.needsLogin) return { reply: 'Teams needs you to sign in again. Open Tulai Desktop → Settings → Calendars, press Sign in on Teams, then ask me again.' }; return { reply: 'I could not send it: ' + ((r && r.reason) || 'Teams did not respond.') }; }
      catch (e) { return { reply: 'I could not send it: ' + e.message }; } }
    PEND.delete(sid); return /^(?:no|nope|cancel|wag|huwag|hindi|stop)\b/.test(t) ? { reply: 'Okay, not sent.' } : null;
  }
  if (p.kind === 'teams-email') {
    if (/^(?:just open teams|open teams|skip|just open it|no email)\b/.test(t)) { PEND.delete(sid); return teamsChat(sid, { ...p.d, skip: true }); }
    const to = extractEmail(text); if (!to && looksNew) { PEND.delete(sid); return null; } if (!to) { setPend(sid, p); return { reply: 'I did not catch the address. Say it like name at company dot com, or say "just open Teams".' }; }
    PEND.delete(sid); saveContact(p.d.who, to); return teamsChat(sid, { ...p.d, email: to });
  }
  if (p.kind === 'email-to') { const to = extractEmail(text); if (!to && looksNew) { PEND.delete(sid); return null; } if (!to) { setPend(sid, p); return { reply: 'I did not catch the address. Say it like name at company dot com, or say cancel.' }; } PEND.delete(sid); return composeMail(sid, { ...p.d, to }); }
  if (p.kind === 'email-body') { PEND.delete(sid); return composeMail(sid, { ...p.d, body: text }); }
  if (p.kind === 'email-confirm') {
    if (/^(yes|yeah|yep|send( it| now| the email)?|go ahead|confirm|sige|oo|ipadala)\b/.test(t)) { PEND.delete(sid); await osa('tell application "Mail" to send (first outgoing message)'); return { reply: `Sent to ${p.d.to}.` }; }
    setPend(sid, p); return { reply: 'Say "send it" to send, or "cancel".' };
  }
  PEND.delete(sid); return null;
}

/* ---- Tagalog and Taglish: rewrite common Filipino phrasings into the English forms the engine already understands ---- */
const FIL = [
  [/^(?:ano(?:ng)?|anu)\s*(?:ang\s+)?oras(?:\s+(?:na|ngayon))?(?:\s+(?:po|ba))?\??$/i, 'what time is it'],
  [/^(?:ano(?:ng)?|anu)\s*(?:ang\s+)?(?:petsa|araw)(?:\s+(?:na|ngayon|ba))*\??$/i, 'what is the date today'],
  [/^(?:ano|anu)\s+(?:ang\s+)?(?:magagawa|kaya(?:ng)?\s+(?:mo|gawin))(?:\s+(?:mo|gawin))?\??$/i, 'what can you do'],
  [/^(?:pa-?ki-?|paki\s*)?(?:buksan|ibukas|open)(?:\s+(?:mo|po))*\s+(?:ang|yung|'yung|iyong|ung)\s+/i, 'open '],
  [/^(?:pa-?ki-?|paki\s*)(?:buksan|open)(?:\s+(?:mo|po))*\s+/i, 'open '],
  [/^buksan(?:\s+(?:mo|po))*\s+/i, 'open '],
  [/^(?:isara|i-?close|i-?quit)(?:\s+(?:mo|po))*\s+(?:ang|yung|'yung)?\s*/i, 'quit '],
  [/^(?:hanapin|hanap|i-?search|mag-?search)(?:\s+(?:mo|ka|po))*(?:\s+(?:ng|ang|si|yung))?\s+/i, 'search for '],
  [/^(?:lakasan|palakasin|taasan)(?:\s+(?:mo|po))*(?:\s+ang)?(?:\s+(?:volume|tunog))?$/i, 'volume up'],
  [/^(?:hinaan|hinaan|hinaan|babaan|pahinaan)(?:\s+(?:mo|po))*(?:\s+ang)?(?:\s+(?:volume|tunog))?$/i, 'volume down'],
  [/^(?:i-?mute|patayin)(?:\s+(?:mo|po))*(?:\s+ang)?(?:\s+(?:tunog|volume))?$/i, 'mute'],
  [/^(?:i-?unmute|buksan\s+ang\s+tunog)$/i, 'unmute'],
  [/^(?:kuhanan|kunan|mag-?)(?:\s+(?:mo|ako))*(?:\s+ng)?\s*screenshot$/i, 'take a screenshot'],
  [/^(?:simulan|umpisahan|start)(?:\s+(?:mo|po))*(?:\s+ang)?\s+(?:meeting|pulong)(?:\s+(?:notes|recording))?$/i, 'start meeting notes'],
  [/^(?:tapusin|itigil|ihinto|i-?stop|tigilan)(?:\s+(?:mo|po))*(?:\s+ang)?\s+(?:meeting|pulong|recording)(?:\s+(?:notes|recording))?$/i, 'stop meeting notes'],
  [/^(?:.*\s)?(?:petsa)(?:\s.*)?$/i, 'what is the date today'],
  [/^(?:.*\s)?(?:patahimik\w*|tahimik)(?:\s.*)?$/i, 'mute'],
  [/^(?:.*\s)?oras(?:\s+na|\s+ngayon|\s+ba)*\s*\??$/i, 'what time is it'],
  [/^(?:i-?summari[sz]e|buod(?:in)?)(?:\s+(?:mo|po))*(?:\s+ang)?\s+(?:meeting|pulong)$/i, 'summarize the meeting'],
];
function fil(t) {
  let x = t.trim().replace(/[?!.]+$/g, m => (/\?$/.test(m) ? '?' : '')).replace(/\s+(po|nga|naman|lang|sana|kasi)(?=\s|$|\?)/gi, '');
  for (const [re, to] of FIL) if (re.test(x)) { x = x.replace(re, to).trim(); break; }
  x = x.replace(/\s+sa\s+(vs ?code|vis ?code|vscode|visual studio code|cursor|xcode|chrome|finder)$/i, ' in $1').replace(/\s+(?:sa|gamit ang)\s+(google\s+)?chrome$/i, ' in chrome');
  return x;
}
const SMALL = [
  [/^(?:salamat|maraming salamat|salamuch)(?:\s+(?:tulay|tulai|po))*$/i, ['Walang anuman!', 'Walang anuman po!', 'Sige, anytime!']], // Tagalog thanks get a Tagalog reply
  [/^(?:thanks|thank you|thanks a lot|thank u|ty)(?:\s+(?:tulay|tulai|po))?$/i, ['You are welcome!', 'Anytime!', 'Happy to help.']],
  [/^(?:how are you(?:\s+(?:today|doing))?|kumusta(?:\s+ka)?(?:\s+na)?|musta(?:\s+ka)?(?:\s+na)?|kamusta(?:\s+ka)?(?:\s+na)?)(?:\s+(?:tulai|tulay|po))?\??$/i, ['I am doing well and ready to help. What do you need?']],
  [/^(?:(?:can|could|would) you\s+)?(?:please\s+|pls\s+)?(?:introduce yourself|tell me about yourself|describe yourself|who are you|sino ka|ano ka|who is this|what are you|what is your name|ano ang pangalan mo|ano pangalan mo|magpakilala ka|pakilala ka)(?:\s+(?:please|pls|po|to me))?\??$/i, ['Hi, I am Tulai, the assistant on this Mac. I can open apps and projects, change the volume, take meeting notes, write emails, start Teams chats, and hand bigger work like tickets and code to Tulai Desktop, which uses the company AI. Just say hey Tulai.']],
  [/^(?:good (?:morning|afternoon|evening)|magandang (?:umaga|hapon|gabi)|hello|hi|hey|kumusta tulay)(?:\s+tulay)?[.!]?$/i, ['Hello! How can I help?', 'Hi! What do you need?']],
  [/^(?:never ?mind|forget it|wala|wag na|huwag na|cancel)$/i, ['Okay.']],
];
function smallTalk(t) { for (const [re, outs] of SMALL) if (re.test(t.trim())) return { reply: outs[Math.floor(Math.random() * outs.length)] }; return null; }

/* ---- meetings: reads the Mac's Calendar app for the next 24 hours, and sets reminders ---- */
async function calendarNext() {
  const wc=require('./webcal');
  if(wc.anyEnabled()){
    const ev=await wc.events();const state=wc.state();const isCal=(s)=>!/teams\.(?:microsoft|cloud\.microsoft|live)\.com|teams\.cloud\.microsoft/i.test(s.url||'')&&s.id!=='teams'; // Teams is ticked for messages, not a calendar page
    const cal=state.sources.filter(s=>s.enabled&&isCal(s)),bad=cal.filter(s=>state.status?.[s.id]?.ok===false),good=cal.filter(s=>state.status?.[s.id]?.ok!==false);
    if(cal.length&&!good.length)throw Error('Calendar account check incomplete: '+bad.map(s=>s.name+': '+state.status[s.id].msg).join('; ')+'. Open Settings → Calendars to sign in or inspect the snapshot.'); // only when NO calendar could be read
    ev.unread=bad.map(s=>s.name);return ev;
  }
  // Calendar.app must be running before AppleScript can talk to it ("Application isn't running", error -600, otherwise): start it hidden, without stealing focus
  if (!DRY && !require('./sandbox').isDry()) { try { const up = () => require('child_process').spawnSync('/usr/bin/pgrep', ['-x', 'Calendar']).status === 0; if (!up()) { await run('/usr/bin/open', ['-g', '-j', '-a', 'Calendar']); for (let i = 0; i < 16 && !up(); i++) await new Promise((r) => setTimeout(r, 250)); await new Promise((r) => setTimeout(r, 600)); } } catch {} }
  const out = await osa(`set nowD to current date
set endD to nowD + (24 * hours)
set out to ""
tell application "Calendar"
  repeat with c in calendars
    try
      if (name of c) does not contain "Birthdays" and (name of c) does not contain "Holiday" and (name of c) does not contain "Siri" and (name of c) does not contain "Reminders" then
        set evs to (every event of c whose start date >= nowD and start date <= endD)
        repeat with e in evs
          set out to out & (summary of e) & "|" & (((start date of e) - nowD) as integer) & linefeed
        end repeat
      end if
    end try
  end repeat
end tell
return out`);
  return String(out).split('\n').map((x) => x.trim()).filter(Boolean).map((x) => { const i = x.lastIndexOf('|'); return { title: x.slice(0, i), at: Date.now() + (+x.slice(i + 1)) * 1000 }; }).filter((e) => Number.isFinite(e.at)).sort((a, b) => a.at - b.at);
}
const NO_CAL_PERM = 'macOS has not allowed Tulai to read the Calendar app yet. Open System Settings, Privacy and Security, Automation, and turn on Calendar under Tulai. Or connect Outlook or Google in Tulai Desktop, Settings, Calendars.';
const NO_CAL = 'I cannot see a calendar yet. Open Tulai Desktop, Settings, Chat, Calendars, turn on Outlook or Google (you can add several accounts), press Sign in once, and then I can read your meetings and remind you before each one.';
const clockOf = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
/** "Summarize my day": from what is really on this Mac (calendars, reminders, meeting notes, missions). No model guesses, no questions back. */
async function daySummary() {
  const parts = [], end = new Date(); end.setHours(23, 59, 59, 999);
  try { const ev = (await calendarNext()).filter((e) => e.at <= end.getTime()); parts.push(ev.length ? `${ev.length} event${ev.length > 1 ? 's' : ''} left today: ${ev.slice(0, 4).map((e) => `${require('./webcal').label(e, require('./webcal').multi(ev))} at ${clockOf(e.at)}`).join(', ')}` : 'no more events on your calendar today'); } catch { parts.push('your calendar is not connected yet (Settings, then Calendars, in Tulai Desktop)'); }
  try { const r = require('./reminders').due ? require('./reminders').list().filter((x) => !x.done && x.at <= end.getTime()) : []; if (r.length) parts.push(`${r.length} reminder${r.length > 1 ? 's' : ''}: ${r.slice(0, 3).map((x) => `${x.text} at ${clockOf(x.at)}`).join(', ')}`); } catch {}
  try { const l = require('./meeting').lastSummary(); if (l.ok && Date.now() - new Date(l.endedAt || Date.now()).getTime() < 864e5) parts.push(`your last meeting: ${l.reply}`); } catch {}
  try { const ms = require('./missions').view(), w = ms.filter((x) => x.pending && x.pending.length).length; if (ms.length) parts.push(`${ms.length} mission${ms.length > 1 ? 's' : ''}${w ? `, ${w} waiting for your OK` : ''}`); } catch {}
  if (parts.length === 1 && /not connected/.test(parts[0])) parts.push('no reminders, meetings or missions yet. Say "remind me to ... at 3 pm" or start meeting notes and I will fill this in');
  return { reply: `Here is your day: ${parts.join('; ')}.` };
}
async function remindRules(text, tl, sid, opts = {}) {
  const rem = require('./reminders');
  if (/^(?:what|show|list|check|tell me)(?: are| about)?(?: my| the| all)?(?: upcoming)? (?:reminders?|alarms?)\??$|^(?:ano|ano ang|mga) (?:ang )?(?:mga )?reminders? ko\??$/.test(tl)) { const l = rem.list(); return { reply: l.length ? `You have ${l.length} reminder${l.length > 1 ? 's' : ''}: ` + l.slice(0, 5).map((r) => `${r.text || 'a reminder'} at ${rem.clock(r.at)}`).join('; ') + '.' : 'You have no reminders.' }; }
  if (/^(?:cancel|delete|clear|remove|stop)(?: all| every)?(?: of)?(?: my| the)? (?:reminders?|alarms?)$|^(?:alisin|burahin|i-?cancel)(?: mo)?(?: lahat ng| ang)?(?: mga)? reminders?$/.test(tl)) { const n = rem.cancel('all'); return { reply: n ? `Cancelled ${n} reminder${n > 1 ? 's' : ''}.` : 'You have no reminders to cancel.' }; }
  let m;
  if ((m = /^(?:snooze|remind me again|mamaya ulit|ulitin mo mamaya)(?:\s+(?:for|in)\s+(\d+)\s*(?:minutes?|mins?|minuto))?$/.exec(tl))) { const last = rem.getLast(); const mins = +m[1] || 5; if (!last) return { reply: 'There is no reminder to snooze.' }; rem.add({ at: Date.now() + mins * 60000, text: last.text }); return { reply: `Okay, I will remind you again in ${mins} minutes.` }; }
  if (/\b(?:remind me|remind|reminder|paalalahanan|ipaalala|pakipaalala|paalala|i-?remind|mag-?remind)\b/.test(tl) && /\b(?:my |the |a |an |ang |na may )?(?:meetings?|calendar|schedule|events?)\b/.test(tl) && /\b(?:all|every|each|lahat|calendar|today|ngayon|before|bago|my meetings|mga meeting)\b/.test(tl) && !rem.parseWhen(tl)) { // remind me of all my meetings
    const ev = await calendarNext().catch((e) => ({ err: String(e && e.message) })); if (ev && ev.err) return { reply: /-1743|not allowed|not authori[sz]ed/i.test(ev.err) ? NO_CAL_PERM : /Calendar account check incomplete/.test(ev.err)?ev.err:NO_CAL };
    const wc0 = require('./webcal'), many = wc0.multi(ev), future = ev.filter((e) => e.at - 5 * 60000 > Date.now()); let n = 0; const have = new Set(rem.list().map((r) => r.text + '|' + r.at));
    for (const e of future) { const at = e.at - 5 * 60000, text = `${wc0.label(e, many)} starts in 5 minutes`; if (!have.has(text + '|' + at)) { rem.add({ at, text }); n++; } }
    return { reply: ev.length ? `You have ${ev.length} meeting${ev.length > 1 ? 's' : ''} in the next 24 hours, starting with ${wc0.label(ev[0], many)} at ${clockOf(ev[0].at)}. I set ${n} reminder${n === 1 ? '' : 's'}, 5 minutes before each.` : 'I do not see any meetings on your Calendar in the next 24 hours.' };
  }
  if (/^(?:show|open|let me see)(?: me)?(?: what you see(?: on)?| the)?(?: my)?(?: calendar)? snapshots?$|^(?:show|let me see) (?:me )?what you see(?: on (?:my )?(?:calendar|outlook|google|teams))?$|^(?:ipakita mo|pakita mo)(?: sa akin)?(?: ang)? (?:snapshot|nakikita mo)(?: sa calendar)?$/.test(tl)) { const wc = require('./webcal'), f = wc.state().sources.map((s) => wc.snapshotPath(s.id)).filter(Boolean).sort().pop(); if (!f) return { reply: 'I have no calendar snapshot yet. Turn a calendar on in Settings first.' }; await run('/usr/bin/open', [f]); return { reply: 'Here is the last page I looked at.' }; }
  if (/^(?:what|which)(?:'s| is| are)?(?: my)? (?:meetings?|schedule|events?|calendar)(?: (?:do i have|for|today|next|tomorrow|coming up|now))*\??$|^(?:check|show|read)(?: me)?(?: my)? (?:calendar|schedule|meetings?)(?: today)?$|^(?:ano|ano ang|mga) (?:ang )?(?:meetings?|schedule) ko(?: ngayon| today)?\??$|^do i have (?:any |a )?meetings?(?: today| now| soon)?\??$/.test(tl)) {
    const ev = await calendarNext().catch((e) => ({ err: String(e && e.message) })); if (ev && ev.err) return { reply: /-1743|not allowed|not authori[sz]ed/i.test(ev.err) ? NO_CAL_PERM : /Calendar account check incomplete/.test(ev.err)?ev.err:NO_CAL };
    const note = ev.unread && ev.unread.length ? ` (I could not read ${ev.unread.join(' and ')}; the others are checked.)` : ''; return { reply: (ev.length ? `You have ${ev.length} thing${ev.length > 1 ? 's' : ''} in the next 24 hours: ` + ev.slice(0, 5).map((e) => `${require('./webcal').label(e, require('./webcal').multi(ev))} at ${clockOf(e.at)}`).join('; ') + '.' : 'Nothing on your Calendar for the next 24 hours.') + note };
  }
  { // a follow-up right after a calendar answer: "on outlook", "sa google", "what about metrobank", "on ascendion": that one account, read again
    const prev = [...(opts.history || [])].reverse().find((m) => m.role === 'assistant'), fm = /^(?:(?:and\s+|how about\s+|what about\s+|check\s+|i-?check\s+|tingnan\s+)?(?:on|in|sa|from|ang)\s+|how about\s+|what about\s+|check\s+)?(?:my\s+|the\s+|yung\s+)?([a-z][a-z0-9 .-]{1,30}?)(?:\s+(?:calendar|account|outlook|naman|po|please))?\??$/i.exec(tl.trim());
    if (fm && prev && /\b(?:calendar|meetings?|could not read|can't read)\b/i.test(String(prev.content || '')) && require('./webcal').anyEnabled()) {
      const wc = require('./webcal'), st = wc.state(), word = fm[1].toLowerCase().trim(), cal = st.sources.filter((x) => x.enabled && x.id !== 'teams');
      const hit = cal.filter((x) => x.name.toLowerCase().includes(word) || word.split(/\s+/).every((w) => x.name.toLowerCase().includes(w)));
      if (/^(?:outlook|google|gmail|metrobank|ascendion|teams|office|microsoft|work|personal)\b/.test(word) || hit.length) {
        if (!hit.length) return { reply: `I have no calendar account named "${fm[1]}". Your accounts are: ${cal.map((x) => x.name).join(', ')}. If one of them is ${fm[1]}, you can rename it in Tulai Desktop → Settings → Calendars, then ask again.` };
        const ev = await calendarNext().catch((e) => ({ err: String(e && e.message) })), out = [];
        for (const src of hit) {
          const bad = st.status && st.status[src.id] && st.status[src.id].ok === false;
          if (bad || (ev && ev.err)) { out.push(`**${src.name}**: I could not read it${st.status?.[src.id]?.msg ? ` (${st.status[src.id].msg})` : ''}. Open Tulai Desktop → Settings → Calendars and press **Sign in** on ${src.name}, then ask again.`); continue; }
          const mine = (Array.isArray(ev) ? ev : []).filter((e) => e.source === src.name);
          out.push(`**${src.name}**: ${mine.length ? mine.slice(0, 6).map((e) => `${e.title} at ${clockOf(e.at)}`).join('; ') : 'nothing in the next 24 hours'}.`);
        }
        return { reply: out.join('\n'), via: 'calendar account' };
      }
    }
  }
  // set a reminder, or a statement like "may meeting ako ng 3pm" / "I have a meeting at 3" (reminds 5 minutes before)
  const asks = /\b(?:remind me|remind|reminder|paalalahanan|ipaalala|pakipaalala|paalala|i-?remind|mag-?remind|alarm)\b/.test(tl), statement = /\b(?:i have|may|meron akong|mayroon akong)\b.*\bmeeting\b/.test(tl);
  if (asks || statement) {
    const w = rem.parseWhen(text); const lead = (/(\d+)\s*(?:minutes?|mins?|minuto)\s+(?:before|bago)/.exec(tl) || [])[1];
    if (!w) { if (!asks) return null; setPend(sid, { kind: 'remind-when', text: rem.subjectFrom(tl) }); return { reply: 'When should I remind you? Say something like in 10 minutes, or at 3 PM.' }; }
    let at = w.at.getTime(); const subject = rem.subjectFrom(w.rest), leadMin = lead ? +lead : (statement && !asks ? 5 : 0);
    if (leadMin) at -= leadMin * 60000; if (at < Date.now() + 5000) at = Date.now() + 5000;
    const subj = statement && !asks ? 'your meeting' : (/^(?:meeting|standup|stand-up|call|sync|huddle|demo|retro|interview)$/.test(subject) ? 'your ' + subject : subject);
    const repeat=/\b(?:every weekday|weekdays|monday to friday)\b/i.test(text)?'weekdays':/\b(?:every day|daily|araw araw)\b/i.test(text)?'daily':'';
    if(repeat==='weekdays'){const next=new Date(at);while([0,6].includes(next.getDay()))next.setDate(next.getDate()+1);at=next.getTime();}
    rem.add({ at, text: subj || 'you have a meeting', repeat });
    return { reply: `Okay, I will remind you ${rem.when(at)}${subj ? ` about ${subj}` : ''}${leadMin ? `, ${leadMin} minutes before` : ''}${repeat?' ('+repeat+')':''}.` };
  }
  return null;
}

/** The bot answers on its own. When something is bigger than it can do alone, it ASKS before opening Tulai Desktop (the company AI). */
/** What the small bot tools cannot finish goes to the full coding agent (the same one Tulai Desktop runs: read, search and edit files, run commands, Jira and
 GitLab APIs), right here in the bot chat and on the bot's own trained brain. Never the company AI, never a Desktop window. */
/** "how do I undo my last commit?", "write a JQL query…", "who is the national hero?", "review this code…": knowledge, not a job for the Mac tools.
 Pointing at the Mac ("my files", "open …", "in my calendar") still uses them. */
function knowledgeOnly(text) {
  const t = String(text || '').trim().toLowerCase();
  if (/\b(?:open|launch|close|quit|screenshot|volume|mute|on my (?:mac|computer|screen)|my (?:files?|folders?|downloads|desktop|documents|calendar|meetings?|reminders?|projects?|repos?|emails?|inbox)|in (?:my )?(?:teams|outlook))\b/.test(t)) return false;
  return /^(?:please\s+|pls\s+|can you\s+|could you\s+)?(?:how (?:do|can|should|would) (?:i|you|we)|how to|what(?:'s| is| are| does| do)|why|who (?:is|was|are)|when (?:is|was|did)|where (?:is|was)|which|write|draft|explain|describe|review|translate|define|compare|give me (?:the |a )?(?:git |shell |sql |jql )?(?:command|query|example|regex)|tell me (?:a|about|what)|sino|ano(?:ng| ang)|paano|bakit)\b/.test(t);
}
function offerDesktop(sid, task, preface) { return { agent: { task: typeof task === 'string' ? task : (task && task.text) || '', mode: require('./agent-mode').get() }, reply: '', via: 'coding agent' }; }
const CODE_WORK = /^(?:please\s+|pls\s+|can you\s+|could you\s+|pakis?\s*)?(?:fix|edit|change|update|refactor|rename|add|implement|create|write|build|debug|run|make|remove|delete|clean up|upgrade|migrate|ayusin|gawin|gumawa|baguhin|idagdag|tanggalin)\b/i;
/** Coding work in a project on this Mac ("fix the login bug in map-governance-ui", "add tests to mb-mobile", "run the tests in gateway-chat"): the coding agent works in that folder. */
function codeWork(raw) {
  let pre = null; const t = String(raw || '').trim().replace(/^in ([\w.-]+)[:,]\s*/i, (m0, rp) => { pre = rp; return ''; }); if ((!CODE_WORK.test(t) && !(pre && t.split(/\s+/).length > 25)) || t.split(/\s+/).length < 3) return null; // "In map-governance-ui: …" names the project up front; a long task there is work for the agent
  if (!(pre && t.split(/\s+/).length > 25) && !/\b(?:code|bug|test|tests|function|component|file|files|page|screen|api|endpoint|feature|module|class|method|build|lint|readme|repo|project|codebase|error|crash|typescript|react|python|script)\b/i.test(t)) return null;
  let repos = []; try { repos = require('./code-ingest').resolve(pre ? pre + ' ' + t : t); } catch {}
  if (repos.length === 1) { lastWorkspace = repos[0]; return { agent: { task: t, workspace: repos[0], mode: require('./agent-mode').get() }, reply: '', via: 'coding agent' }; }
  if (!repos.length && lastWorkspace && /\b(?:this|that|the same|same)\s+(?:project|repo|repository|codebase|code|app|folder)\b|\b(?:dito|diyan)\b/i.test(t)) return { agent: { task: t, workspace: lastWorkspace, mode: require('./agent-mode').get() }, reply: '', via: 'coding agent' }; // "fix the bug in this project": the last project you named
  return null;
}
let lastWorkspace = null;
/** Work that needs the agent's tools but is not coding: browse a site and do something there, use the browser, call an API, plan a change. */
function toolWork(raw) {
  const t = String(raw || '').trim(), tl = t.toLowerCase();
  const web = /\b(?:go to|open|visit|browse(?: to)?|puntahan)\b\s+\S+.*\b(?:and|then|tapos|at)\b.*\b(?:check|find|read|tell|look|get|test|click|fill|log ?in|sign ?in|search|compare|download|summari[sz]e|screenshot)\b/.test(tl) || /^(?:use|open) the browser (?:to|and)\b/.test(tl);
  const api = /\b(?:call|hit|curl|test|request)\b.{0,30}\b(?:api|endpoint|url|localhost:\d+|https?:\/\/)/.test(tl);
  const plan = /^(?:plan|make a plan for|draft a plan for|gumawa ng plano para sa)\b.{8,}/.test(tl);
  if (!web && !api && !plan) return null;
  return { agent: { task: t, workspace: lastWorkspace || undefined, mode: plan ? 'plan' : require('./agent-mode').get() }, reply: '', via: 'agent' };
}
/** True when a sentence is clearly one of the device commands we understand (used to rescue a mangled "Hey Tulai"). Does not run anything. */
function looksLikeCommand(text) {
  const t = fil(clean(String(text))).toLowerCase().replace(/[.!?]+$/g, '').trim(); let m;
  if (/^(mute|unmute|volume (up|down)|take a screenshot|what time is it|what is the date today|dance|dive)$/.test(t)) return true;
  if ((m = /^(?:open|launch|quit|close)\s+(?:up\s+)?(?:my\s+|the\s+)?(.+?)(?:\s+(?:app|browser|application))?$/.exec(t))) { const w = m[1]; return !!(findApp(w) || findFolder(w) || SITES[w] || urlFrom(w) || /^(chrome|google chrome|browser|safari)$/.test(w)); }
  return false;
}
// Anything that depends on up-to-date or exact facts: the small embedded model must not answer it
const FRESH = /\b(current|currently|latest|newest|today|tonight|now|news|weather|forecast|price|prices|score|scores|stock|exchange rate|rate|president|presidente|senador|gobernador|alkalde|prime minister|ceo|mayor|governor|who won|how much is|ngayon|ngayong|balita|panahon|presyo|kasalukuyan|pangulo)\b/i;
/** Returns { reply } when handled locally, otherwise null. deny = apps the person protected in settings. */
async function handleRules(raw, opts = {}) {
  const sid = opts.sid || 'bot';
  try { const w = require('./voice').afterWake(String(raw || '')); if (w !== null) { if (!w) return { reply: 'Yes? How can I help?' }; raw = w; } } catch {} // typed or tapped-mic text may still start with "Hey Tulai"
  const text = fil(clean(raw)); if (!text) return null;
  const pend = getPend(sid); if (pend) { const r = await handlePending(sid, pend, text); if (r) return r; }
  const tm = parseTeams(text); if (tm) return teamsChat(sid, tm);
  const mail = parseEmail(text); if (mail) return composeMail(sid, mail);
  if (text.length > 160) return null;
  const small = smallTalk(text); if (small) return small;
  const tl = text.toLowerCase().replace(/[.!?]+$/g, '').trim();
  { // arithmetic is done exactly here, never guessed by a model
    const W = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
    const m = /^(?:what(?:'s| is)|calculate|compute|how much is|magkano ang|ano ang)?\s*([a-z0-9.,+\-*/x×÷()^% ]+?)\s*(?:equals?|=)?\??$/.exec(tl);
    if (m && /(?:plus|minus|times|multiplied by|divided by|over|[+\-*/x×÷^])/.test(m[1]) && /\d|\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)\b/.test(m[1])) {
      let e = m[1].replace(/\bto the power of\b|\bsquared\b/g, (x) => (x === 'squared' ? '**2' : '**')).replace(/\bplus\b/g, '+').replace(/\bminus\b/g, '-').replace(/\b(?:times|multiplied by)\b/g, '*').replace(/\b(?:divided by|over)\b/g, '/').replace(/\bx\b|×/g, '*').replace(/÷/g, '/').replace(/\^/g, '**').replace(/(\d),(?=\d{3})/g, '$1').replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-]+(one|two|three|four|five|six|seven|eight|nine)\b/g, (_m, t10, u) => String(W[t10] + W[u])).replace(/\b[a-z]+\b/g, (w) => (W[w] !== undefined ? String(W[w]) : w));
      if (/^[0-9+\-*/(). %]+$/.test(e.replace(/\*\*/g, '*'))) { try { const v = Function('"use strict"; return (' + e.replace(/%/g, '/100') + ')')(); if (Number.isFinite(v)) return { reply: `${m[1].trim()} is ${Math.round(v * 1e6) / 1e6}.` }; } catch {} }
    }
  }
  if (/^(?:test|testing|test working|mic check|check|sound check|one two three|1 2 3|can you hear me|hello can you hear me|hello testing|are you listening|are you working|nakikinig ka ba|naririnig mo ba ako)(?: test(?:ing)?)*\??$/.test(tl)) {
    if (opts.voice) return { reply: 'I can hear you, loud and clear.' };
    let brain = ''; try { brain = (require('./active-model').state().current?.run || '').slice(-6); } catch {}
    return { reply: `Yes, I'm working, on my own trained brain on this Mac${brain ? ` (version ${brain})` : ''}. Try: "fix the bug in <file> in <project>", "explain this folder", "check my jira", "show my meetings", or "send message to <name>: <text>". Say "what can you do" for everything.`, via: 'status' };
  }
  if (/^(?:uy|oy|psst|yo|hoy|hey you|hey there|ay)$/.test(tl)) return { reply: 'Yes? How can I help?' };
  if (/^(?:who (?:made|built|created|programmed) you|sino ang gumawa sa iyo|sino gumawa sa iyo|who is your (?:maker|creator|developer))\??$/.test(tl)) return { reply: 'I was built for you as part of Tulai. The AI inside me runs on this Mac, and Tulai Desktop uses your company AI.' };
  if (/^(?:i love you|love you|i like you|you are (?:the )?(?:best|great|awesome|amazing|cool)|mahal kita|ang galing mo)$/.test(tl)) return { reply: ['Aww, I appreciate you!', 'That makes my day!'][Math.floor(Math.random() * 2)], perform: 'love' };
  if (/^(?:you(?:'re| are) (?:so )?funny|haha+|lol|ang kulit mo|nakakatawa)$/.test(tl)) return { reply: ['Hehe, thank you!', 'Glad I made you laugh!'][Math.floor(Math.random() * 2)], perform: 'giggle' };
  if (/^(?:i(?:'m| am) (?:so )?(?:bored|sad|lonely)|bored|wala akong magawa|nabobored ako|malungkot ako)$/.test(tl)) return { reply: 'Aww. Want me to tell you a joke, dance, or sing? Just say which one.', perform: 'cry' };
  if (/^(?:i(?:'m| am) (?:so )?(?:tired|sleepy|exhausted|pagod)|pagod na ako|inaantok na ako)$/.test(tl)) return { reply: 'You sound tired. A short break and some water could help. Do you want me to remind you in 30 minutes?', perform: 'tired' };
  if (/^(?:i(?:'m| am) (?:so )?(?:hungry|gutom)|gutom na ako|nagugutom ako)$/.test(tl)) return { reply: 'Time for a snack! Do you want me to search for food near you?', perform: 'happy' };
  if (/^(?:i(?:'m| am) (?:so )?(?:happy|excited|glad)(?: today)?|masaya ako|masaya ako ngayon)$/.test(tl)) return { reply: 'That is wonderful to hear!', perform: 'happy' };
  { const rr = await remindRules(text, tl, sid, opts); if (rr) return rr; }
  { // the background browser: your signed-in accounts (mail, Teams, any page of an account), read out of sight
    const wr = !global.__tulaiCalendar ? null : await require('./web-account-rules').handle(text, tl.replace(/\b(?:please|pls|plz|pelase|pleas|pleaase)\b/g, '').replace(/\s+/g, ' ').trim(), { nlu: opts.nlu, sources: () => require('./webcal').state().sources.map((s) => ({ ...s, status: (require('./webcal').state().status || {})[s.id] })), call: async (c, a) => { const f = global.__tulaiCalendar; if (!f) throw new Error('The background browser is part of the Tulai Bot app and is not running here.'); return f(c, a); }, home: (a, what) => require('./bot-web').homeFor(a, what), save: (name, buf) => require('./viewer').saveUpload(name, buf) }); if (wr && !/^I have no (?:email|Teams) account yet/.test(wr.reply || '')) return wr; /* nothing signed in: the older Mail/Teams paths still answer */
  }
  { // files you can see in the chat: "show my latest screenshot", "open report.pdf", "read the text in that image", "summarize that file"
    const vr = await require('./view-rules').handle(text, tl, { nlu: opts.nlu }); if (vr) return withOffer(sid, vr, 'to read it');
  }
  { // "export that as Excel / CSV / PDF / PowerPoint / a web page": the last thing Tulai showed you becomes a file
    const kindWord = /\b(excel|xlsx|spreadsheet|csv|pdf|power ?point|pptx|slides?|slide deck|presentation|html|web ?page|website)\b/.exec(tl);
    if (kindWord && /\b(export|save|make|create|turn|convert|give|send|put|download|generate|produce|i want|can i have)\b/.test(tl) && /\b(that|this|it|report|answer|table|summary|result|results|list|chart|graph|above|last|those|these)\b/.test(tl) && tl.split(/\s+/).length <= 14) {
      const w = kindWord[1].replace(/\s+/g, ''), kind = /excel|xlsx|spreadsheet/.test(w) ? 'excel' : /csv/.test(w) ? 'csv' : /pdf/.test(w) ? 'pdf' : /power|pptx|slide|presentation/.test(w) ? 'powerpoint' : 'html', ex = require('./export'), last = ex.getLast();
      if (!last) return { reply: 'I have nothing to put in a file yet. Ask me for a report first, for example "team status", "show me a graph of my memory", or "summarize my day".' };
      try { const f = await ex.exportAs(last.md, kind, last.name); return { reply: `Done. I made ${/^[aeiou]/i.test(f.label) ? 'an' : 'a'} ${f.label} file: ${f.name}. It is in Documents, Tulai Reports.`, files: [{ name: f.name, ext: f.ext, label: f.label, path: f.file, preview: f.preview }] }; } catch (e) { return { reply: `I could not make the ${kind} file: ${e.message}` }; }
    }
  }
  { // graphs of things Tulai really knows (never invented pictures)
    if (/\b(graph|chart|plot|visuali[sz]e|diagram)\b/.test(tl) && tl.split(/\s+/).length <= 16) {
      const ex = require('./export');
      if (/\b(memory|ram|swap|mac(?:book)?(?:'s)? (?:memory|performance))\b/.test(tl) && !/\b(train|trained|training|learn|learned|learning|remember|notes|habits|you)\b/.test(tl.replace(/\byour\b/g, ''))) {
        const sm = require('./sysmem'), m = await sm.read(); const labels = m.top.map((x) => x.name), values = m.top.map((x) => x.gb);
        const md = `# Mac memory by app\n\n${m.freePct} percent of ${m.totalGB} GB is free; ${m.swapUsedGB} GB is swapped to disk.\n\n| App | Memory (GB) |\n|---|---|\n${m.top.map((x) => `| ${x.name} | ${x.gb} |`).join('\n')}\n`; ex.setLast(md, 'Mac memory by app');
        return { reply: sm.describe(m), chart: { type: 'bar', title: 'Memory used by app (GB)', labels, values, unit: 'GB' } };
      }
    }
  }
  { // reports for a team lead: team status, sprint, risks, MR queue, weekly report, 1:1 prep, release notes (no AI call)
    { const rp = await require('./label-report').handle(text, { workConfig: opts.workConfig }); if (rp) return rp; } // Jira label + repository report, built here (never handed off)
    const lr = await require('./lead-rules').handle(text, tl, { sid, setPend, findFolder, roots: opts.roots, last: LAST.get(sid), setLast: (d) => LAST.set(sid, d), meetingFile: (() => { try { const l = opts.meeting && opts.meeting.lastSummary(); return l && l.file; } catch { return null; } })() }); if (lr) return withOffer(sid, lr, 'to polish it into a message you can send');
  }
  { const wr = await require('./work-rules').handle(text, tl, { sid, setPend, chromeOpen, meeting: opts.meeting }); if (wr) return wr; }
  { // the engineer's own toolbox: git, tickets, tests, ports, clipboard helpers (no AI call)
    const dctx = devCtx(sid, opts), dr = await require('./dev-rules').handle(text, tl, dctx); if (dr) return withOffer(sid, dr, 'to fix it properly');
  }
  if (/^(?:so[, ]+)?may i call\??$|^(?:sumayaw|sayaw|magsayaw)(?:\s+(?:ka|naman|nga|po|tayo))*$/.test(tl)) return { reply: ['Watch this!', 'Okay, here I go!', 'Time to dance!'][Math.floor(Math.random() * 3)], perform: 'dance' }; // "sumayaw ka" often comes out as "so may I call"
  if (/^(?:please\s+|pls\s+)?(?:(?:can|could|would) you\s+)?(?:do a\s+|do the\s+|show me a\s+|let'?s\s+)?(?:dance|dans|dunce|dants|boogie|groove)(?:\s+(?:for me|please|now|a little|for us))?$|^(?:sumayaw|sayaw|magsayaw)(?:\s+(?:ka|naman|nga|po|tayo))*$|^(?:show me|let me see)\s+(?:your\s+)?(?:dance|moves)$/.test(tl)) return { reply: ['Watch this!', 'Okay, here I go!', 'Time to dance!'][Math.floor(Math.random() * 3)], perform: 'dance' };
  { // the robot's feelings and moves, by voice or in the chat: "cry", "giggle", "sumayaw ka", "umiyak ka", ...
    const MV = [
      ['cry', /(?:cry|crying|weep|sob|be sad|act sad|feel sad|umiyak|iyak|malungkot)/, ['Waaah...', 'Sniff, sniff.', 'Okay, I am so sad.']],
      ['laugh', /(?:laugh|laughing|lol|haha+|tumawa|tawa|humalakhak)/, ['Hahaha!', 'Ha ha ha!']],
      ['giggle', /(?:giggle|giggling|gigle|jiggle|chuckle|hihi|hehe|humagikgik|kiliti)/, ['Hehe!', 'Hihi!', 'Hee hee hee!']],
      ['excited', /(?:excited|exciting|hyper|thrilled|pumped|eager|energetic|nasasabik|excitement|masayang masaya)/, ['Yay, I am so excited!', 'Wooo, I cannot wait!']],
      ['happy', /(?:happy|glad|joyful|cheerful|smile|masaya|natutuwa|smiling)/, ['I am so happy!', 'Yay, what a day!']],
      ['surprised', /(?:surprised|shocked|amazed|astonished|gulat|nagulat|wow)/, ['Whoa!', 'What?! Really?']],
      ['shy', /(?:shy|embarrassed|bashful|blushing|nahihiya|hiya|nahihiya ka)/, ['Oh, stop it...', 'I am blushing.']],
      ['thinking', /(?:thinking|think|ponder|pondering|confused|hmm+|nag-?iisip|isip)/, ['Hmm, let me think.', 'Hmm...']],
      ['tired', /(?:tired|sleepy|exhausted|yawn|yawning|pagod|inaantok|humikab|antok)/, ['So tired...', 'Yaaawn.']],
      ['dizzy', /(?:dizzy|woozy|hilo|nahihilo)/, ['Whoa, the room is spinning.', 'I am so dizzy.']],
      ['proud', /(?:proud|confident|flex|mayabang|proud of yourself|nagmamalaki)/, ['Look at me!', 'I did great!']],
      ['wave', /(?:wave|say hi to everyone|kaway|kumaway)/, ['Hi there!', 'Hello!']],
      ['jump', /(?:jump|hop|tumalon|talon)/, ['Boing!', 'Wheee!']],
      ['spin', /(?:spin|twirl|turn around|umikot|ikot|pumirouette)/, ['Wheee!', 'Round and round!']],
      ['sleep', /(?:sleep|go to sleep|to sleep|take a nap|nap|matulog|tulog|bedtime)/, ['Zzz... goodnight.', 'Okay, sleepy time.']],
      ['angry', /(?:angry|get angry|be angry|mad|furious|magalit|galit|nagagalit)/, ['Grr!', 'I am so mad!']],
      ['love', /(?:love|show love|heart|romantic|in love|magmahal|ibig|mahal)/, ['Aww, love you too!', 'So much love!']],
      ['sing', /(?:sing|sing a song|kumanta|kanta|hum)/, ['La la la!', 'Okay, here is my song!']],
      ['bow', /(?:bow|take a bow|yumuko|yuko|magbigay galang)/, ['Thank you, thank you!']],
      ['clap', /(?:clap|applaud|pumalakpak|palakpak)/, ['Clap clap clap!']],
      ['scared', /(?:scared|be scared|afraid|frightened|get scared|matakot|takot|natatakot)/, ['Eek!', 'I am so scared!']],
      ['wink', /(?:wink|kumindat|kindat)/, ['Wink wink!']],
      ['celebrate', /(?:celebrate|party|cheer|yay|hooray|magdiwang|magsaya|selebrasyon)/, ['Yay! Party time!', 'Hooray!']],
    ];
    const g = tl.replace(/^(?:hey tulai[, ]*)/, '').replace(/^(?:please|pls)\s+/, '').replace(/^(?:(?:can|could|would) you|pwede ka bang|puwede ka bang|pwede mo bang)\s+/, '').replace(/^(?:show me|let me see|do|do a|do the|act|be|look|feel|get|pretend to be|pretend you are|go(?! to)|take a|make a|try to|try)\s+(?:so\s+|very\s+|really\s+)?/, '').replace(/\s+(?:for me|please|now|naman|nga|po|ka|ako|na|lang|a little|again)$/g, '').replace(/\s+(?:for me|please|now|naman|nga|po|ka|na|lang)$/g, '').replace(/^(?:an?\s+)/, '').trim();
    for (const [mv, re, says] of MV) if (new RegExp('^' + re.source + '$').test(g)) return { reply: says[Math.floor(Math.random() * says.length)], perform: mv };
  }
  if (/^(?:please\s+|pls\s+)?(?:(?:can|could|would) you\s+)?(?:do a\s+|take a\s+|go for a\s+|go\s+)?(?:dive|diving|die|dye|dime|dyve)(?:\s+(?:in|for me|please|now))?$|^(?:sumisid|sisid|magsisid)(?:\s+(?:ka|naman|nga|po))*$/.test(tl)) return { reply: ['Here I go!', 'Cannonball!', 'Diving in!'][Math.floor(Math.random() * 3)], perform: 'dive' };
  if (/^(?:how(?:'s| is| are)|what(?:'s| is)|check|show|tell me|give me)(?: about)?(?: my| the| our)?(?: mac(?:book)?(?:'s)?| computer(?:'s)?| laptop(?:'s)?| system(?:'s)?)? ?(?:memory|ram)(?: (?:status|usage|use|pressure|level|health|doing|is doing|looks? like|right now|now))*\??$|^(?:memory|ram) (?:status|usage|check|health)$|^is (?:my|the) (?:mac(?:book)?|computer|laptop|memory|ram)(?: (?:running|doing))? (?:ok|okay|fine|slow|full|critical|healthy|low)\??$|^(?:kumusta|kamusta|ano)(?: ang| na)?(?: yung)? (?:memory|ram)(?: (?:ko|natin|ng mac|ng computer))?\??$|^(?:how much|gaano)(?: free)?(?: memory| ram)(?: do i have| left| ang natitira)?\??$/.test(tl)) { const sm = require('./sysmem'); const m = await sm.read(); return { reply: sm.describe(m), memory: m }; }
  const dsk = /^(?:open|launch|start|show|go to|buksan)\s+(?:the\s+|my\s+)?(?:tulai|tulay)\s+desktop(?:\s+app)?\s*[,.]?\s*(?:(?:and|then|tapos|at)\s+)?([\s\S]*)$/i.exec(text) || /^(?:tell|ask|use)\s+(?:the\s+)?(?:tulai\s+|tulay\s+)?desktop(?:\s+app)?\s+(?:to\s+)?([\s\S]+)$/i.exec(text);
  if (dsk) { if (opts.desktopAuthorized === false) return {reply:'I have not opened Desktop. The current request did not explicitly ask for it.'}; const task = (dsk[1] || '').trim(); if (!task) { process.emit('tulay:show-desktop'); return { reply: 'Opened Tulai Desktop.' }; } return { delegate: task, reply: 'Okay, I opened Tulai Desktop and I am starting on it.' }; }
  if (/^(?:hey|hi|hay|hei|okay|ok)[,.!?\s]+\S+(?:\s+\S+)?[.!?]?$/i.test(text) && text.split(/\s+/).length <= 3 && !/\b(open|start|stop|what|set|send|play|pause|mute|quit|close|search)\b/i.test(text)) return { reply: 'Yes? How can I help?' };
  const t = text.toLowerCase(), deny = (opts.deny || []).map((x) => String(x).toLowerCase());
  let m;
  if ((m = /^(?:use|switch to|set)\s+(gmail|outlook|(?:the )?mail(?: app)?)\s+(?:for|as|to send)?\s*(?:my )?e-?mail/.exec(t))) { const p = /gmail/.test(m[1]) ? 'gmail' : /outlook/.test(m[1]) ? 'outlook' : 'mail'; writePrefs({ emailProvider: p }); return { reply: `Okay, I will use ${p === 'mail' ? 'the Mail app' : p === 'gmail' ? 'Gmail' : 'Outlook'} for email.` }; }
  if (/^(?:open|launch|start|show|buksan)\s+(?:up\s+)?(?:my\s+|the\s+|a\s+)?(?:web\s+|internet\s+)?browser$/.test(t)) return chromeOpen(sid, {});
  if ((m = /^(?:open|launch|start|show)\s+(?:up\s+)?(?:my\s+|the\s+)?(?:google\s+)?chrome(?:\s+(?:browser|app))?(?:\s+(?:with|for|using|on|in)?\s*(?:my\s+|the\s+)?(.+?)\s*(?:profile|account)?)?$/.exec(t)) && !/^(a|an|new)$/.test(m[1] || '')) return chromeOpen(sid, { hint: m[1] && m[1].replace(/\s*(profile|account)$/, '') });
  if ((m = /^(?:open|go to|show|visit)\s+(?:up\s+)?(?:my\s+|the\s+)?(.+?)\s+(?:in|on|with|using)\s+(?:google\s+)?chrome(?:\s+(?:with|using|for)\s+(?:my\s+|the\s+)?(.+?)(?:\s+(?:profile|account))?)?$/.exec(t))) { const w = m[1], url = urlFrom(w) || SITES[w]; if (url) return chromeOpen(sid, { url, hint: m[2], message: `Opened ${w} in Chrome` }); }

  if (/^(what('?s| is) the )?(current )?time( is it)?( now)?\??$|^what time is it( now)?\??$|^anong oras( na)?\??$/.test(t)) return { reply: clock() };
  if (/^(what('?s| is) )?(the |today'?s )?(date|day)( today| is it)?\??$|^what day is (it|today)\??$|^anong araw( ngayon)?\??$/.test(t)) return { reply: day() };
  if (/^(how much )?battery( level| left| percentage)?\??$|^what('?s| is) my battery( level)?\??$/.test(t)) { const b = await run('/usr/bin/pmset', ['-g', 'batt']).catch(() => ''); const x = /(\d+)%;\s*([^;]+)/.exec(b); return { reply: x ? `Battery is at ${x[1]} percent, ${x[2].trim()}.` : 'This Mac has no battery information.' }; }
  if ((m = /^(?:set |turn )?(?:the )?volume (?:to |at )?(\d{1,3})(?: percent| %)?$/.exec(t))) { const v = Math.min(100, +m[1]); await osa(`set volume output volume ${v}`); return { reply: `Volume set to ${v} percent.` }; }
  if (/^(turn |volume )?(up|louder)( the volume)?$|^(turn )?volume up$|^louder$/.test(t)) { await osa('set volume output volume ((output volume of (get volume settings)) + 15)'); return { reply: 'Volume up.' }; }
  if (/^(turn |volume )?(down|lower|quieter)( the volume)?$|^(turn )?volume down$|^quieter$/.test(t)) { await osa('set volume output volume ((output volume of (get volume settings)) - 15)'); return { reply: 'Volume down.' }; }
  if (/^(mute|silence)( (the )?(sound|volume|mac))?$/.test(t)) { await osa('set volume with output muted'); return { reply: 'Muted.' }; }
  if (/^unmute( (the )?(sound|volume|mac))?$/.test(t)) { await osa('set volume without output muted'); return { reply: 'Sound is back on.' }; }
  if (/^(take (a )?)?screenshot( of (my|the) screen)?$/.test(t)) { const f = path.join(os.homedir(), 'Desktop', `Screenshot ${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`); await run('/usr/sbin/screencapture', ['-x', f]); return { reply: 'Screenshot saved to your Desktop.' }; }
  if ((m = /^(?:search|google|look up|look for)(?: for| on google for| google for)? (.+)$/.exec(t))) { await run('/usr/bin/open', ['https://www.google.com/search?q=' + encodeURIComponent(m[1])]); return { reply: `Searching for ${m[1]}.` }; }

  const mt = opts.meeting;
  if (mt) {
    if (/^(?:please\s+)?(?:(?:can|could) you\s+)?(?:listen|pakinggan|pakinggan mo)(?:\s+(?:in|to|sa))?(?:\s+(?:on|to|sa))?\s+(?:to\s+)?(?:this\s+|the\s+|my\s+|our\s+|ang\s+)?(?:current\s+|ongoing\s+|live\s+)?(?:meetings?|calls?|pulong)(?:\s+(?:notes?|recording|transcript))?(?:\s+(?:now|please))?$/.test(t) || /^(?:please\s+)?(?:take|write|make|do)\s+(?:the\s+|my\s+|some\s+)?meeting\s+notes(?:\s+(?:now|please))?$/.test(t)) return { reply: mt.start('Meeting').reply }; // "listen meeting notes", "take meeting notes": really starts (or says it is already recording), never a made-up "started"
    if ((m = /^(?:start|begin|resume)\s+(?:a\s+|the\s+|my\s+)?(?:meeting(?:\s+notes|\s+recording|\s+transcript)?|recording|taking no(?:te|de)s|note taking|no(?:te|de)s)(?:\s+(?:called|for|titled|about|on)\s+(.+))?$/.exec(t)) || (m = /^(?:record|take notes (?:of|for|in|on)|transcribe)\s+(?:this|the|my)\s+meeting(?:\s+(?:called|for|about)\s+(.+))?$/.exec(t))) return { reply: mt.start(m[1] || 'Meeting').reply };
    if (/^(?:stop|end|finish|done with)\s+(?:the\s+|my\s+|this\s+)?(?:meeting(?:\s+notes|\s+recording|\s+transcript)?|recording|taking no(?:te|de)s|no(?:te|de)s)$/.test(t) || (/^(?:summari[sz]e|summary of|wrap up)\s+(?:the\s+|my\s+|this\s+)?meeting$/.test(t) && mt.isRecording())) return { reply: mt.stop().reply };
    if (/^(?:summari[sz]e|summary of|what happened in|recap)\s+(?:the\s+|my\s+|that\s+|last\s+)?meeting$|^meeting (?:summary|recap)$/.test(t)) return { reply: mt.lastSummary().reply };
  }

  { const f = require('./bot-features').handle(t); if (f) return f; } // what is really installed: skill packs (trained or not), files, commit, agent skills
  if (/^(list|show) (my )?(projects|repos|repositories)$/.test(t)) { const names = []; for (const r of ['Desktop', 'Documents', 'Developer', 'Projects']) { try { for (const f of fs.readdirSync(path.join(os.homedir(), r), { withFileTypes: true })) if (f.isDirectory() && !f.name.startsWith('.') && fs.existsSync(path.join(os.homedir(), r, f.name, '.git'))) names.push(f.name); } catch {} } return { reply: names.length ? `I found ${names.length} projects: ${names.slice(0, 8).join(', ')}.` : 'I did not find git projects on your Desktop or Documents.' }; }
  if (/^(play|resume|pause|stop)( the)?( music| song| spotify)?$/.test(t) && /music|song|spotify|^(play|pause)$/.test(t)) { const app = /spotify/.test(t) ? 'Spotify' : 'Music'; const cmd = /^(pause|stop)/.test(t) ? 'pause' : 'play'; await osa(`tell application "${app}" to ${cmd}`); return { reply: cmd === 'pause' ? 'Paused.' : 'Playing.' }; }
  if (/^(next|skip)( the)?( song| track)?$/.test(t)) { await osa('tell application "Music" to next track'); return { reply: 'Next track.' }; }
  if (/^(turn on |enable |switch to )dark mode$|^dark mode( on)?$/.test(t)) { await osa('tell application "System Events" to tell appearance preferences to set dark mode to true'); return { reply: 'Dark mode is on.' }; }
  if (/^(turn off |disable |switch to )(dark mode)$|^light mode( on)?$|^(turn on |switch to )light mode$/.test(t)) { await osa('tell application "System Events" to tell appearance preferences to set dark mode to false'); return { reply: 'Light mode is on.' }; }
  if (/^lock (the |my )?(screen|mac|computer)$/.test(t)) { await run('/usr/bin/pmset', ['displaysleepnow']); return { reply: 'Locking the screen.' }; }
  if ((m = /^(?:open|launch|start|show)\s+(?:up\s+)?(vs ?code|visual studio code|cursor|xcode)\s+(?:and (?:open|then open)\s+)?(?:my\s+|the\s+)?(.+?)(?:\s+(?:project|folder|repo|repository))?$/.exec(t)) && !/^(app|application)$/.test(m[2])) {
    const app = EDITORS[m[1].replace(/\s+/g, ' ')] || EDITORS[m[1].replace(/ /g, '')] || findApp(m[1]); const dir = app && !deny.includes(app.toLowerCase()) ? findFolder(m[2].replace(/\s+(project|folder|repo)$/, ''), opts.roots) : null;
    if (dir) { await openWith(app, dir); return { reply: `Opened ${path.basename(dir)} in ${app}.` }; }
  }

  // open <project> in <editor>   (also "... and <editor>", and follow-ups like "open it in VS Code")
  const lastDir = LAST.get(sid);
  if ((m = /^(?:open|launch|show|start)\s+(?:up\s+)?(?:it|that|this|them|the (?:project|folder|repo))?\s*(?:in|with|using|on)\s+(?:my\s+|the\s+)?(.+)$/.exec(t)) && lastDir) {
    const app = editorFor(m[1]); if (app && !deny.includes(app.toLowerCase())) { await openWith(app, lastDir); return { reply: `Opened ${path.basename(lastDir)} in ${app}.` }; }
  }
  if ((m = /^(?:open|launch|show|start)\s+(?:up\s+)?(?:my\s+|the\s+)?(.+?)\s*,?\s*(?:and(?:\s+then)?\s+(?:open\s+)?(?:it\s+)?(?:in\s+|with\s+|using\s+|on\s+)?|in\s+|with\s+|on\s+|using\s+)(?:my\s+|the\s+)?(.+)$/.exec(t)) && editorFor(m[2])) {
    const app = editorFor(m[2]), name = m[1].replace(/\s+(project|folder|repo|repository|workspace)$/, '');
    if (deny.includes(app.toLowerCase())) return { reply: `${app} is on your protected list, so I will not open it from here.` };
    const dir = findFolder(name, opts.roots); if (!dir) return { reply: `I could not find a folder called ${name}. Tell me where it is, or its exact name.` };
    LAST.set(sid, dir); writePrefs({ editor: app }); await openWith(app, dir); return { reply: `Opened ${path.basename(dir)} in ${app}.` };
  }
  if (/^(?:please\s+)?(?:summari[sz]e|recap|brief me on|give me|what(?:'s| is))\s+(?:on\s+)?(?:my\s+|the\s+)?(?:day|today|plan for today|schedule)(?:\s+(?:today|so far|please))?$|^(?:what do i have|what's on) today$|^plan my day$|^buod ng araw ko$/.test(tl)) return daySummary();
  if (/^(?:check|what(?:'s| is| are)|show|how are|how's|any|list|tell me)\s*(?:me\s+)?(?:about\s+)?(?:on\s+)?(?:my\s+|the\s+)?missions?(?:\s+(?:status|now|today|please|doing))?$/.test(tl)) {
    let list = []; try { list = require('./missions').view(); } catch {}
    if (!list.length) return { reply: 'You have no missions yet. Create one in Tulai Desktop, under Missions.' };
    const run = list.filter((x) => x.running), wait = list.filter((x) => x.pending && x.pending.length);
    const parts = list.slice(0, 5).map((x) => `${x.title}: ${x.running ? 'working now' : x.pending && x.pending.length ? 'waiting for your OK' : (x.schedText || 'idle').toLowerCase()}`);
    return { reply: `You have ${list.length} mission${list.length > 1 ? 's' : ''}${run.length ? `, ${run.length} running` : ''}${wait.length ? `, ${wait.length} waiting for you` : ''}. ${parts.join('. ')}.` };
  }
  { // "go to the left", "move to the top right corner": the floating bot walks there
    const mv = /^(?:please\s+)?(?:go|move|walk|run|fly|stay|lipat|punta|pumunta)\s+(?:over\s+)?(?:to\s+|sa\s+)?(?:the\s+|my\s+)?(top|bottom|upper|lower)?[\s-]*(left|right|kaliwa|kanan)?[\s-]*(top|bottom|upper|lower)?\s*(?:corner|side|part|of the screen|ng screen)?$/.exec(tl);
    if (mv && (mv[1] || mv[2] || mv[3]) && (mv[2] || /corner|side/.test(tl)) ) {
      const v = [mv[1], mv[3]].find(Boolean), h = mv[2] ? (/left|kaliwa/.test(mv[2]) ? 'left' : 'right') : '', vert = v ? (/top|upper/.test(v) ? 'top' : 'bottom') : '';
      const spot = h && vert ? `${h}-${vert}` : h || (vert ? `right-${vert}` : ''); if (spot) { process.emit('tulay:roam', spot); return { reply: `Okay, going to the ${spot.replace('-', ' ')}.`, perform: 'jump' }; }
    }
  }
  { // what Tulai remembers about you: only what you asked it to remember ("remember that I prefer short answers"); you can hear it and wipe it
    const mem = require('./bot-memory');
    if (/^(?:what do you (?:remember|know) about me|what(?:'s| is| are) (?:saved|stored) (?:in|on) (?:your |my )?(?:memory|notes)|what(?:'s| are) my (?:saved )?preferences|what did i ask you to remember|ano ang naaalala mo|what(?:'s| is) in your memory|show (?:me )?(?:your |my )?memory)$/.test(tl)) {
      const notes = mem.read(); return { reply: notes.length ? `I remember ${notes.length} thing${notes.length > 1 ? 's' : ''} you asked me to: ${notes.slice(-5).join('; ')}.${notes.length > 5 ? ' That is the latest five.' : ''} Say "forget everything" to clear them.` : 'Nothing yet. I only keep what you ask me to, for example "remember that I prefer short answers". I never save passwords or what I answer myself.' };
    }
    if (/^(?:forget|clear|erase|delete|wipe)\s+(?:everything|all|all of it|my memory|your memory|all memories|all my preferences)$|^(?:wag mo nang tandaan|kalimutan mo (?:lahat|ang lahat))$/.test(tl)) { const n = mem.read().length; if (!n) return { reply: 'I have nothing saved to forget.' }; setPend(sid, { kind: 'forget-all', n }); return { reply: `Forget all ${n} saved thing${n > 1 ? 's' : ''}? Say yes to clear them.` }; }
  }
  if (/^(?:open|launch|go to|show|start|buksan|pakibuksan)(?:\s+(?:up|my|the|a|an|ang|it|that|this|something))*$/.test(t)) { setPend(sid, { kind: 'open-what' }); return { reply: 'Open what? Say the app, website or project name.' }; }
  { // "open <project> and trigger /platform-reports": the project is opened and the command is run by Tulai Desktop (company AI) inside it
    const rl = String(raw).toLowerCase().replace(/\bslash\s+/g, '/').replace(/[.!?]+$/g, '').trim();
    const sm = /^(?:open|launch|go to|start)\s+(?:up\s+)?(?:my\s+|the\s+)?(.+?)\s+(?:project\s+|folder\s+|repo\s+)?(?:and|then|and then)\s+(?:trigger|run|use|execute|invoke|start|do)\s+(?:the\s+|my\s+)?(\/[\w-]+(?:[ -][\w-]+){0,3}|[\w-]+(?:[ -][\w-]+){0,3}?)\s*(?:command|skill)?$/.exec(rl);
    if (sm) {
      const dir = findFolder(sm[1].replace(/\s+(project|folder|repo|repository|workspace)$/, ''), opts.roots);
      if (dir) {
        const nm = sm[2].replace(/^\//, '').trim().replace(/\s+/g, '-'), known = ['.claude/commands/' + nm + '.md', '.claude/skills/' + nm].some((x) => fs.existsSync(path.join(dir, x))), slash = sm[2].startsWith('/') || known;
        LAST.set(sid, dir); return { delegate: { text: slash ? '/' + nm : 'Run ' + sm[2].trim(), workspace: dir }, reply: `Okay. I am opening ${path.basename(dir)} in Tulai Desktop and running ${slash ? '/' + nm : sm[2].trim()}. It uses the company AI.` };
      }
    }
    const bare = /^(?:trigger|run|execute|invoke|use)\s+(?:the\s+)?(\/[\w-]+(?:[ -][\w-]+){0,3})$/.exec(rl);
    if (bare) { const d = LAST.get(sid); return { delegate: { text: '/' + bare[1].slice(1).trim().replace(/\s+/g, '-'), workspace: d || undefined }, reply: `Okay. I am running ${bare[1].replace(/\s+/g, '-')} in Tulai Desktop.` }; }
  }
  if ((m = /^(?:open|launch|go to|show|start|pakibuksan ang|buksan ang|buksan)\s+(?:up\s+)?(?:my\s+|the\s+|ang\s+)?(.+)$/.exec(t))) {
    const what = m[1].replace(/\s+(app|application)$/, ''), fx = fixSite(what), url = (fx && fx.url) || urlFrom(what) || SITES[what];
    if (!fx && ADULT.test(what) && urlFrom(what)) { setPend(sid, { kind: 'open-adult', url }); return { reply: `That looks like an adult site, and I may have misheard you. Say "yes, open it" if you really want ${what}.` }; }
    if (url) { await run('/usr/bin/open', [url]); return { reply: fx ? `Opened ${fx.name}.` : `Opened ${what}.` }; }
    const isFolder = /\s(folder|directory|project|repo)$/.test(what), base = what.replace(/\s+(folder|directory|project|repo)$/, '');
    if (/^(downloads|desktop|documents|home|applications)( folder)?$/.test(base)) { await run('/usr/bin/open', [base === 'home' ? os.homedir() : base === 'applications' ? '/Applications' : path.join(os.homedir(), base[0].toUpperCase() + base.slice(1))]); return { reply: `Opened ${base}.` }; }
    if (!isFolder && !findApp(what) && WEBAPPS[what.toLowerCase().trim()]) { const w = what.toLowerCase().trim(); return chromeOpen(sid, { url: WEBAPPS[w], message: `Opened ${what} in your browser, because the ${what} app is not installed` }); }
    if (!isFolder) { const app = findApp(what); if (app) { if (deny.includes(app.toLowerCase())) return { reply: `${app} is on your protected list, so I will not open it from here.` }; await openWith(app); return { reply: `Opened ${app}.` }; } }
    const dir = findFolder(base, opts.roots); if (dir) {
      LAST.set(sid, dir);
      if (fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, 'package.json'))) { // a project: use the editor you used last, or VS Code
        const ed = readPrefs().editor || (findApp('Visual Studio Code') ? 'Visual Studio Code' : null);
        if (ed && !deny.includes(ed.toLowerCase())) { await openWith(ed, dir); return { reply: `Opened ${path.basename(dir)} in ${ed}.` }; }
      }
      await run('/usr/bin/open', [dir]); return { reply: `Opened ${path.basename(dir)} in Finder.` };
    }
    if (/\s(?:and|at)\s/.test(what)) { const apps = what.split(/\s+(?:and|at)\s+/).map((x) => findApp(x.trim())); if (apps.length > 1 && apps.every(Boolean) && !apps.some((x) => deny.includes(x.toLowerCase()))) { for (const a of apps) await openWith(a); return { reply: `Opened ${apps.join(' and ')}.` }; } }
    if (what.split(/\s+/).length <= 3) return { reply: `I could not find an app, folder or website called ${what}. Say its exact name, or tell me where it is.` };
    return null; // longer and unclear: let the model figure it out
  }
  if ((m = /^(?:quit|close|exit)\s+(?:the\s+)?(.+?)(?:\s+app)?$/.exec(t))) { const app = findApp(m[1]); if (app && !deny.includes(app.toLowerCase())) { await osa(`tell application "${app.replace(/"/g, '')}" to quit`); return { reply: `Closed ${app}.` }; } }
  return null;
}
/* ---- vocabulary for the understanding engine: real names on this computer, so mishearings can be corrected ---- */
let vocabCache = null;
function vocab(opts = {}) {
  if (vocabCache && Date.now() - vocabCache.t < 60000) return vocabCache.v;
  const projects = new Set();
  for (const r of opts.roots || ['Desktop', 'Documents', 'Developer', 'Projects', 'Code', 'dev', 'work', 'repos']) {
    const base = path.join(os.homedir(), r); try { for (const f of fs.readdirSync(base, { withFileTypes: true })) if (f.isDirectory() && !f.name.startsWith('.') && fs.existsSync(path.join(base, f.name, '.git'))) projects.add(f.name); } catch {}
  }
  const v = { apps: [...installedApps().values()], projects: [...projects], contacts: Object.keys(contactsOf()), profiles: chromeProfiles().map((p) => p.name) };
  vocabCache = { t: Date.now(), v }; return v;
}
/** Rules first (instant). If they do not understand, the local language model reads it, fixes mishearings and gives a clean command. */
/* The small model ends every answer with "How can I assist you further?". That is noise to read or hear, and it would make Tulai think it asked you something. */
const CLOSER = /(?:\s*(?:how (?:can|may) i (?:assist|help)(?: you)?(?: further| today| with anything else| with that)?|is there anything else(?: i can (?:help|assist)(?: you)? with)?|anything else (?:i can|you(?:'d| would) like)[^?.!]*|what else can i (?:do|help)[^?.!]*|let me know if you need anything else)\s*[?.!]*\s*)+$/i;
const tidyReply = (r) => { const s = String(r).replace(/!\[[^\]]*\]\(data:[^)]*\)/g, '').replace(CLOSER, '').trim(); /* a picture written by the model is not real: never shown, never read aloud */ return s.length >= 3 ? s : String(r); };
async function handle(raw, opts = {}) {
  raw = require('./human-rules').fixTypos(raw);
  { const mn = require('./human-rules').meeting(raw, opts.meeting || require('./meeting')); if (mn) return mn; }
  { const fd = require('./folder-rules').handle(raw, { sid: opts.sid }); if (fd) return fd; }
  { const er = await require('./engine-rules').handle(raw, { role: 'bot' }); if (er) return er; } // "use claude", "search model qwen coder", "open terminal claude": the AI of this window // "create a folder on Desktop named X": made for real, never guessed by a tool
  { const sr = await require('./status-report').handle(raw); if (sr) return sr; }
  { const gp = require('./git-prefs').handle(raw); if (gp) return gp; } // "always use GIT_SSL_NO_VERIFY": a saved setting, never improvised commands // "run the status report": the repo's own report script (no AI), shown in the chat // stop / summary of meeting notes, however it is said: never left to the brain (it promised and did nothing) // "shw my meetngs" -> "show my meetings" (short commands only)
  opts = {...opts, desktopAuthorized: require('./handoff-policy').explicit(raw)};
  if(opts.signal?.aborted)return {reply:'Stopped.'};
  const training=await require('./bot-training').handle(raw);if(training)return training;
  // a standing instruction ("if you don't know, research it and remember") is saved before anything tries to answer or read a web page
  if(/\b(if|when|whenever)\b/i.test(raw)&&/\b(?:don.?t know|do not know|unsure|uncertain)\b/i.test(raw)&&/\b(research|internet|search|look up)\b/i.test(raw)){
    require('./bot-memory').capture('Remember that when uncertain, research the actual question and cite sources; never treat an unverified discussion as fact.');
    return {reply:'Remembered: research the actual question when uncertain and cite sources. What question should I research?',via:'saved research preference'};
  }
  const correction=await require('./learning-review').handle(raw,opts);if(correction)return correction;
  { const text = raw, tl = String(raw).toLowerCase().replace(/[.!?,]+$/g, '').trim(); /* signed-in accounts come before the generic web reader */
    const wr = !global.__tulaiCalendar ? null : await require('./web-account-rules').handle(text, tl.replace(/\b(?:please|pls|plz|pelase|pleas|pleaase)\b/g, '').replace(/\s+/g, ' ').trim(), { nlu: opts.nlu, sources: () => require('./webcal').state().sources.map((s) => ({ ...s, status: (require('./webcal').state().status || {})[s.id] })), call: async (c, a) => { const f = global.__tulaiCalendar; if (!f) throw new Error('The background browser is part of the Tulai Bot app and is not running here.'); return f(c, a); }, home: (a, what) => require('./bot-web').homeFor(a, what), save: (name, buf) => require('./viewer').saveUpload(name, buf) }); if (wr && !/^I have no (?:email|Teams) account yet/.test(wr.reply || '')) return wr; /* nothing signed in: the older Mail/Teams paths still answer */
  }
  { const tl = String(raw).toLowerCase().replace(/\b(?:please|pls|plz|pelase|pleas|pleaase)\b/g, '').replace(/\s+/g, ' ').trim(); /* the calendar of a chosen day (Monday, tomorrow, a date): read from the signed-in accounts */
    if (global.__tulaiCalendar) { const cd = await require('./calendar-day-rules').handle(raw, tl, { call: (c, a) => global.__tulaiCalendar(c, a), history: opts.history }); if (cd) return cd; } }
  const webpage=await require('./web-preview').handle(raw,opts);if(webpage)return webpage;
  const mock=await require('./mock-call').handle(raw,opts);if(mock)return mock; // practice interviews and calls (while one runs, your messages are your answers)
  const screenCode=await require('./screen-code').handle(raw,opts);if(screenCode)return screenCode; // read and explain the code on the screen (OCR + own AI)
  const callDetect=require('./call-detect').handle(raw);if(callDetect)return callDetect;
  const live=require('./live-answer').handle(raw);if(live)return live; // auto answer on/off, "answer that" during calls
  const selfTest=require('./self-test').handle(raw,opts);if(selfTest)return selfTest; // the bot grades itself on independent questions
  const convTest=require('./scenario-runner').handle(raw);if(convTest)return convTest; // the bot tests itself on real-life conversations
  const committing=require('./git-commit').handle(raw);if(committing)return committing; // a permission card first; never pushes
  const computed=require('./pack-solvers').handle(raw);if(computed)return computed; // exact arithmetic/graph answers in a known prompt shape are computed by code, not guessed by the model
  const dropped=await require('./folder-drop').handle(raw,opts);if(dropped)return dropped;
  const ingested=await require('./code-ingest').handle(raw,opts);if(ingested)return ingested;
  const render=require('./render-request').handle(raw,opts);if(render)return render;
  const document=await require('./document-work').handle(raw,opts);if(document)return document;
  const commits=await require('./commit-charts').handle(raw,opts);if(commits)return commits;
  const analysis=await require('./bot-analyst').handle(raw,opts);if(analysis)return analysis;
  const learning=require('./bot-learning-status').answer(raw,{history:opts.history});if(learning){ if(learning.chart&&Array.isArray(learning.chart.rows)){ try { const rows=learning.chart.rows; require('./export').setLast(`# Tulai memory snapshot\n\n| Item | Count |\n|---|---|\n${rows.map((r)=>`| ${r.label} | ${r.value} |`).join('\n')}\n\n${learning.reply}\n`,'Tulai memory snapshot'); } catch {} } return learning; }
  const identity=await require('./bot-identity').answer(raw,opts);if(identity)return identity;
  if(/^(?:ano(?: ulit)? .*?(?:re-?remind|remind|paalala)|what (?:will|were|are) you .*?remind|what (?:was|is) (?:my|the) reminder)/i.test(String(raw).trim())){
    const rem=require('./reminders'),items=rem.list();
    return {reply:items.length?'Saved reminders: '+items.map(r=>`${r.text} — ${rem.when(r.at)}${r.repeat?' ('+r.repeat+')':''}`).join('; '):'Wala akong aktuwal na naka-save na reminder ngayon. Kung sinabi kong naka-set na dati, hindi iyon na-save sa scheduler. Sabihin mo ang task at oras para ma-set nang tama.',via:'reminder lookup'};
  }
  raw = String(raw).replace(/\b([\p{L}']+)(?:[\s,.!?-]+\1\b)+/giu, '$1').replace(/^\s*(open|visit|go to)(?=[a-z0-9-]+\.(?:com|net|org|io|ph|gov|edu|app|dev|co)\b)/i, '$1 '); // "hello hello hello hello" is just "hello"
  const researchFailure=/^research failure ([a-f0-9]{12})[.!]?$/i.exec(String(raw).trim());
  if(researchFailure){const failure=require('./failure-memory').read().find(r=>r.id===researchFailure[1]);if(!failure)return {reply:'No failure with that ID.'};const recovery=require('./failure-research');return {reply:recovery.format(await recovery.research(failure,'',{force:true,signal:opts.signal,progress:opts.onProgress})),via:'recovery research'};}
  const failureCommand=require('./failure-memory').handle(raw);if(failureCommand)return failureCommand;
  const browsed=await require('./bot-browser').handle(raw);if(browsed)return browsed;
  const scheduled=require('./bot-schedule').handle(raw);if(scheduled)return scheduled;
  if(/^\s*(?:(?:hey|hi)\s+tul(?:ai|ay)[,\s]+)?(?:please\s+|pls\s+)?(?:can you\s+|could you\s+)?(?:remember|save|store|keep|note(?: down)?|tandaan(?: mo)?|i-?save)\b/i.test(raw)&&require('./custom-training').SECRET.test(raw)||/\b(?:my|the)\s+(?:pin|otp|cvv|passphrase|passcode)\b/i.test(raw)&&/^\s*(?:please\s+)?(?:remember|save|store|tandaan)\b/i.test(raw)){
    return {reply:'I won\'t save that: passwords, keys, codes and card numbers do not belong in my memory. Please keep it in a password manager.',via:'secret refused'};
  }
  const explicitMemory=require('./bot-memory').extract(raw);
  if(explicitMemory&&!/\b(remind|reminder|ipaalala|paalalahanan|alarm)\b/i.test(raw)){
    require('./bot-memory').capture(raw);
    return {reply:'Saved to local memory: '+explicitMemory+'.'+(/\b(before|weekday|every day|schedule|login|log in)\b/i.test(raw)?' This is a saved instruction, not a scheduled action. Tell me to set a reminder or schedule the workflow to activate it.':''),via:'persisted memory'};
  }
  const partner = await require('./bot-partners').handle(raw, opts); if(partner)return partner;
  const compound = require('./nlu').multiStep(raw);
  // our own rules go first even for "X and then Y" ("open my project and open it in Cursor", "open Jira and make a report by labels" are exact rules); only if no rule owns the whole sentence is it a multi-step task
  { const r = await handleRules(raw, opts); if (r && !(compound && /^I could not find|^Which app|^Open what/.test(String(r.reply || '')))) return r; }
  { const am=require('./agent-mode').handle(raw); if(am) return am; } // "plan mode", "allow everything", "ask me first"
  { const cw=codeWork(raw)||toolWork(raw); if(cw) return cw; } // coding work in a named project: the full coding agent, in this chat
  const human=require('./human-rules').handle(raw,opts);if(human)return human; // frustration, a bare "send it", percentages with follow-ups (after the rules, so a pending "send it" still confirms)
  const workRoute=require('./bot-work').route(raw,opts);if(workRoute)return workRoute;
  { // "be jealous", "act sleepy", "feel proud": an emotion we have no word for yet: the language model picks the closest move
    const em = /^(?:please\s+)?(?:be|act|feel|look|get|show me|pretend to be|pretend you are|mag-?)\s+(?:so\s+|very\s+|really\s+)?([a-z-]{3,15})(?:\s+(?:please|now|for me|naman|nga))?[.!?]?$/i.exec(String(raw).replace(/^hey tulai[, ]*/i, '').trim());
    if (em && opts.nlu && opts.nlu.available()) { const mv = await opts.nlu.emote(em[1].toLowerCase()).catch(() => null); if (mv) return { reply: ['Okay!', 'Like this?', 'Watch this!'][Math.floor(Math.random() * 3)], perform: mv, via: 'understanding engine' }; }
  }
  if (!opts.nlu || !opts.nlu.available() || /^\s*$/.test(String(raw))) return null;
  let text = String(raw); try { const w = require('./voice').afterWake(text); if (w !== null) text = w || text; } catch {}
  let out = await opts.nlu.interpret(text, vocab(opts), { followup: !!opts.followup, history: opts.history }).catch(() => null);
  if(opts.signal?.aborted)return {reply:'Stopped.'};
  if (!out) return null;
  // A conditional policy is not an instruction to open a search page.
  if(out.kind==='command' && /^search for /.test(out.command) && /\b(if|when|whenever)\b/i.test(text))out={kind:'question',command:''};
  const ADDRESSED = /\b(yourself|please|pls|tell me|help me|tulai|tulay|hey tulai|introduce)\b|\b(paki\w*|pakiusap|pwede (ka|mo|bang)|puwede (ka|mo|bang)|sabihin mo)\b/i;
  if (out.kind === 'not_for_me' && opts.voice && opts.followup && ADDRESSED.test(text)) out = { kind: 'question', command: '' }; // spoken to me after "Yes?": do not ignore it
  const lastA = [...(opts.history || [])].reverse().find((m) => m.role === 'assistant' && m.content), answeringQ = !!(lastA && /\?["')\s]*$/.test(String(lastA.content).trim()) && !CLOSER.test(String(lastA.content).trim())); // Tulai had just asked you something (even in the chat window): what you say next is the answer, not background talk
  if (out.kind === 'not_for_me' && opts.voice && opts.followup && answeringQ) out = { kind: 'question', command: '' };
  if (out.kind === 'not_for_me' && opts.voice && opts.followup) return { silent: true, reply: '' }; // background talk right after "Yes?"
  if (out.kind === 'not_for_me') out = { kind: 'question', command: '' }; // they spoke to me on purpose: it is conversation, so answer
  const TASKY = /\b(tickets?|git|rebase|merge|commit|push|pull|branch|code|function|class|bug|fix|implement|refactor|deploy|review|pr|mr|jira|gitlab|github|file|folder|repo|report|document|email|mail|write|draft|create|build|migrate|plan|test plan|summary|summari[sz]e)\b/i;
  if (out.kind === 'task' && !TASKY.test(text) && text.trim().split(/\s+/).length <= 12) out = { kind: 'question', command: '' }; // "what is 2 plus 2" is not a work task
  const REQUESTISH = /\?|^(?:please\s+|pls\s+|can you\s+|could you\s+)?(?:what|why|how|when|where|who|which|can|could|would|will|do|does|is|are|write|draft|explain|tell|show|give|create|make|summari[sz]e|help|find|translate|generate|list|compare|fix|review|check|remind|finish|complete|implement|rebase|pull|commit|push|merge|ano|bakit|paano|sino|saan|kailan|pwede|puwede|paki|gawin|isulat|ipaliwanag)\b/i;
  if ((out.kind === 'question' || out.kind === 'task') && opts.voice && opts.followup && !answeringQ && !REQUESTISH.test(text.trim())) return { silent: true, reply: '' };
  if (out.kind === 'task') out = { kind: 'question', command: '', wasTask: true }; // try it myself first; the helper below offers Tulai Desktop if it is bigger than I can do
  // The small embedded model must not answer anything that depends on up-to-date or exact facts: it can be wrong or out of date.
  const fresh = out.kind === 'question' && FRESH.test(text) && /\?|^\s*(?:what|who|whom|whose|when|where|which|how (?:much|many|is|are|do|does)|is |are |does |do |did |can |ano|sino|kailan|saan|magkano)\b|\b(?:tell me|show me|give me|check|find|look up)\b/i.test(text); // "i am so tired today" is not a question about the world
  if (out.kind === 'question') {
    const h = knowledgeOnly(text) ? null : await require('./harness').run(text, { nlu: opts.nlu, sid: opts.sid || 'bot', opts }).catch(() => null); // a knowledge question is answered, never turned into tool calls
    if (h && h.offer) return offerDesktop(opts.sid || 'bot', h.offer, h.reply);
    let reply = h && h.reply, perform = h && h.perform, steps = h && h.steps;
    if (!reply) reply = await opts.nlu.answer(text, {history: opts.history, lessons: opts.lessons}).catch(() => null);
    if (!reply) return null; reply = tidyReply(reply);
    if (fresh && !(steps || []).some((s) => ['search_web', 'open_website'].includes(s.tool))) { return { reply: `${reply} I have not verified this against a live source. Send a source URL to read it here.`, via: 'bot harness', answered: true, perform, steps }; }
    return { reply, via: 'bot harness', steps, answered: true, perform };
  }
  if (out.kind === 'command' && /^chat /.test(out.command)) { const pt = parseTeams(text); if (pt) return { ...(await teamsChat(opts.sid || 'bot', pt)), via: 'understanding engine', command: out.command }; } // use our own reading of the name and message, not the model's guess
  if (out.kind === 'command' && /^search for /.test(out.command) && /\b(file|files|folder|document|pdf|spreadsheet|on my (mac|computer|disk|laptop)|in my (documents|downloads|desktop|folder)|named|called)\b/i.test(text)) out = { kind: 'question', command: '' }; // looking for a file, not the web
  // (questions are answered by the block below)
  if (out.kind === 'command' && out.command) { const r2 = await handleRules(out.command, { ...opts, nlu: null }); if (r2) return { ...r2, via: 'understanding engine', command: out.command };
    const h = await require('./harness').run(text, { nlu: opts.nlu, sid: opts.sid || 'bot', opts }).catch(() => null); if (h && h.offer) return offerDesktop(opts.sid || 'bot', h.offer, h.reply); if (h) return { reply: h.reply, via: 'bot harness', steps: h.steps, answered: true, perform: h.perform }; }
  return null;
}
module.exports = { knowledgeOnly, toolWork, codeWork, offerDesktop, looksLikeCommand, handleRules, hasPending: (sid) => !!getPend(sid || 'bot'), vocab, parseTeams, fil, dry, handle: async (raw,opts) => require('./handoff-policy').guard(await handle(raw,opts),raw), chromeProfiles, extractEmail, parseEmail, findFolder, findApp, clean };
