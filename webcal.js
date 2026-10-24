// Reads your calendars from the web (Outlook, Google Calendar, Teams) in the background, the way you would look at them in a browser.
// Tulai Bot keeps its own hidden browser that remembers your sign-in (you sign in yourself, once, in a normal window; Tulai never types a
// password). Every few minutes it opens each calendar page out of sight, reads the meetings of the next 24 hours, remembers them, and
// sets a reminder before each one. Runs inside the bot process (it needs Electron); Tulai Desktop reads the same data through the bot.
const fs = require('fs');
const path = require('path');

const FILE = () => path.join(process.env.GC_DATA_DIR || __dirname, 'calendar-cache.json');
const PARTITION = 'persist:tulai-calendar'; // the three original calendars share this sign-in; every account you add gets its own, so you can be signed in to several at once
const partitionOfRaw = (s) => (['outlook', 'google', 'teams'].includes(s.id) ? PARTITION : 'persist:tulai-cal-' + String(s.id).replace(/[^a-z0-9-]/gi, ''));
/** Sites like Teams refuse browsers that call themselves "Electron" ("Classic Teams is no longer available"): Tulai's browser presents itself as the Chrome it is built on. */
const chromeUA = () => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${(process.versions.chrome || '130.0.0.0').split('.')[0]}.0.0.0 Safari/537.36`;
const uaDone = new Set();
function partitionOf(s) { const p = partitionOfRaw(s); if (!uaDone.has(p)) { try { const E = electron(); if (E && E.session) { const ses = E.session.fromPartition(p); ses.setUserAgent(chromeUA()); ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm !== 'openExternal')); uaDone.add(p); /* never hand a link to another app (msteams:, zoommtg:): Tulai's browser stays in the background */ } } catch {} } return p; }
const KINDS = { outlook: 'https://outlook.office.com/calendar/view/day', google: 'https://calendar.google.com/calendar/u/0/r/day', teams: 'https://teams.microsoft.com/v2/', other: '' };
const DEFAULT_SOURCES = [
  { id: 'outlook', name: 'Outlook', url: 'https://outlook.office.com/calendar/view/day', enabled: false },
  { id: 'google', name: 'Google Calendar', url: 'https://calendar.google.com/calendar/u/0/r/day', enabled: false },
  { id: 'teams', name: 'Teams', url: 'https://teams.microsoft.com/v2/', enabled: false },
];

/* ---------- pure: turn the text of calendar entries into meetings (tested without a browser) ---------- */
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const TIME = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?';
const RANGE = new RegExp(`${TIME}\\s*(?:to|until|[-–—])\\s*${TIME}`, 'i');
function toMinutes(h, m, ap, fallbackAp) { let hh = +h; const mm = m ? +m : 0; const a = (ap || fallbackAp || '').toLowerCase().replace(/\./g, ''); if (a === 'pm' && hh < 12) hh += 12; if (a === 'am' && hh === 12) hh = 0; return hh * 60 + mm; }
/** strings: raw entry texts, e.g. "Daily Standup, 9:30 AM to 10:00 AM, Thursday, October 8, 2026, Teams Meeting". now: Date. */
function parseEvents(strings, now = new Date()) {
  const out = [], seen = new Set();
  for (const raw of strings) {
    const s = String(raw).replace(/â€[“”"–—‘’]/g, '–').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim(); const m = RANGE.exec(s); /* (also repairs a dash that arrived garbled) */ if (!m) continue;
    const ap2 = m[6], ap1 = m[3] || ap2; // "9:30 – 10am": the first time shares the second one's am/pm
    const start = toMinutes(m[1], m[2], m[3], ap1), end = toMinutes(m[4], m[5], m[6], ap2);
    let title = (s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length)).replace(/^[\s,;:|·•-]+|[\s,;:|·•-]+$/g, '');
    // a date inside the text ("Thursday, October 8, 2026" or "October 8")
    let day = new Date(now), dm = new RegExp(`(${MONTHS.join('|')})\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, 'i').exec(s);
    if (dm) { day = new Date(dm[3] ? +dm[3] : now.getFullYear(), MONTHS.indexOf(dm[1].toLowerCase()), +dm[2]); title = title.replace(dm[0], '').replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b,?/i, ''); }
    title = title.replace(/\b(all day|free|busy|tentative|accepted|declined|recurring|online meeting|teams meeting|microsoft teams meeting)\b/gi, ' ').split(/\s*[,;|·•]\s*/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x && !/^(organizer|teams|microsoft teams|zoom|location|calendar)\b/i.test(x) && !/:\s*\S*$/.test(x) || /^[^:]{3,}$/.test(x)).filter((x) => x && !/^(organizer|teams|microsoft teams|zoom|location)\b/i.test(x))[0] || 'Meeting'; title = title.slice(0, 120);
    if (!title || /^\d+\s+events?$/i.test(title)) continue; // a day cell's count ("1 event"), not a meeting
    if (/\b(?:create|new|add|schedule|click|double[- ]click|available|no events?)\b/i.test(s) && !/\b(?:organizer|accepted|tentative|declined|teams meeting link)\b/i.test(s)) continue; // an empty time slot ("Create meeting"), not a meeting
    if (/^(?:meeting|meetings|event|events|busy|appointment|free|calendar|time|slot|all day|today)$/i.test(title)) continue;
    if (/^(?:outside (?:of )?(?:your )?working hours|working hours|non[- ]working hours|out of working hours|work location(?: \w+)*|working (?:from )?(?:home|office|remotely)|office|home|remote)$/i.test(title)) continue; // Outlook's working-hours shading and work-location label ("Work location Office"): not meetings, never reminders // Outlook's shading of the hours you do not work, not a meeting: never a reminder // a word, not a title: nothing to remind you about
    const at = new Date(day); at.setHours(0, 0, 0, 0); at.setMinutes(start);
    const key = title.toLowerCase() + '|' + at.getTime(); if (seen.has(key)) continue; seen.add(key);
    out.push({ title, at: at.getTime(), end: at.getTime() + Math.max(0, end - start) * 60000 });
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ---------- cache ---------- */
const load = () => { try { return JSON.parse(fs.readFileSync(FILE(), 'utf8')); } catch { return { sources: DEFAULT_SOURCES.map((s) => ({ ...s })), autoRemind: true, lead: 5, events: [], checkedAt: 0, status: {} }; } };
const save = (c) => { try { const t = FILE() + '.' + process.pid; fs.writeFileSync(t, JSON.stringify(c)); fs.renameSync(t, FILE()); } catch {} };
function state() { const c = load(); const have = new Set(c.sources.map((s) => s.id)); for (const d of DEFAULT_SOURCES) if (!have.has(d.id)) c.sources.push({ ...d }); return c; }
function configure(patch) {
  const c = state(), DEF = new Set(DEFAULT_SOURCES.map((d) => d.id));
  if (Array.isArray(patch.sources)) {
    c.sources = c.sources.map((s) => { const p = patch.sources.find((x) => x.id === s.id); return p ? { ...s, enabled: !!p.enabled, url: String(p.url || s.url), name: p.name ? String(p.name).slice(0, 40) : s.name } : s; });
    for (const p of patch.sources) if (p.add) { const kind = KINDS[p.kind] !== undefined ? p.kind : 'other', url = String(p.url || KINDS[kind] || '').trim(); if (!/^https?:\/\//i.test(url)) continue; c.sources.push({ id: 'x' + Math.random().toString(36).slice(2, 8), name: String(p.name || (kind === 'other' ? 'Calendar' : kind[0].toUpperCase() + kind.slice(1))).slice(0, 40), kind, url, enabled: p.enabled !== false }); }
  }
  if (Array.isArray(patch.remove)) for (const id of patch.remove) if (!DEF.has(id)) { c.sources = c.sources.filter((s) => s.id !== id); c.events = (c.events || []).filter((e) => e.sourceId !== id); forget(id); }
  if (typeof patch.autoRemind === 'boolean') c.autoRemind = patch.autoRemind; if (patch.lead) c.lead = Math.max(1, Math.min(60, +patch.lead)); save(c); return c;
}
/** Signs an account out: its sign-in is deleted from this Mac. */
function forget(id) { const E = electron(); try { if (E && E.session) E.session.fromPartition(partitionOf({ id })).clearStorageData(); } catch {} }

/* ---------- Electron side: a hidden browser that remembers your sign-in ---------- */
const electron = () => { try { return require('electron'); } catch { return null; } };
const loginWall = (u) => /login\.microsoftonline|login\.live|accounts\.google|\/login|signin|sign-in|adfs|okta|sso/i.test(u);
const SCRAPE = `(() => {
  const out = new Set(); const re = /\\d{1,2}(:\\d{2})?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?\\s*(to|until|[-–—])\\s*\\d{1,2}(:\\d{2})?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?/i;
  for (const el of document.querySelectorAll('[aria-label], [data-eventchip], [data-eventid], [role="button"], [data-tid*="calendar"], [data-tid*="event"]')) {
    const t = (el.getAttribute('aria-label') || '') + ' | ' + ((el.innerText || '').slice(0, 200));
    if (re.test(el.getAttribute('aria-label') || '') ) out.add((el.getAttribute('aria-label') || '').slice(0, 300));
    else if (el.matches('[data-eventchip],[data-eventid],[data-tid*="event"]') && re.test(el.innerText || '')) out.add((el.innerText || '').replace(/\\n+/g, ', ').slice(0, 300));
    if (out.size > 120) break;
  }
  return { items: [...out], url: location.href, title: document.title };
})()`;

const SNAPDIR = () => path.join(process.env.GC_DATA_DIR || __dirname, 'calendar-snapshots');
function snapshotPath(id) { try { const f = fs.readdirSync(SNAPDIR()).filter((x) => x.startsWith(id + '-') && x.endsWith('.png')).sort().pop(); return f ? path.join(SNAPDIR(), f) : null; } catch { return null; } }
async function snap(win, id) { // a picture of what the hidden browser sees, so you can check it (kept a day, on this Mac only)
  try {
    const img = await win.webContents.capturePage(); if (!img || img.isEmpty()) return null; fs.mkdirSync(SNAPDIR(), { recursive: true });
    const f = path.join(SNAPDIR(), `${id}-${Date.now()}.png`); fs.writeFileSync(f, img.toPNG());
    for (const x of fs.readdirSync(SNAPDIR())) { const p = path.join(SNAPDIR(), x); if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600000) fs.rmSync(p, { force: true }); }
    const mine = fs.readdirSync(SNAPDIR()).filter((x) => x.startsWith(id + '-')).sort(); for (const x of mine.slice(0, -4)) fs.rmSync(path.join(SNAPDIR(), x), { force: true });
    return f;
  } catch { return null; }
}
async function readPage(source, { timeout = 30000, dayOffset = 0, emptyOk = false } = {}) {
  const E = electron(); if (!E || !E.BrowserWindow) throw new Error('Calendars can only be read inside the Tulai Bot app.');
  const win = new E.BrowserWindow({ show: false, width: 1400, height: 1000, webPreferences: { partition: partitionOf(source), backgroundThrottling: false, sandbox: true } });
  try {
    const load = async () => { try { await win.loadURL(source.url); } catch (e) { await new Promise((r) => setTimeout(r, 800)); await win.loadURL(source.url); } }; // one retry: some sites abort the first request
    await Promise.race([load(), new Promise((_, rej) => setTimeout(() => rej(new Error('The page did not load in time. Are you on the company network or VPN?')), timeout))]);
    let last = null; const t0 = Date.now();
    while (Date.now() - t0 < 14000) { // give the calendar app time to draw its entries
      await new Promise((r) => setTimeout(r, 1500)); const url = win.webContents.getURL(); if (loginWall(url)) { await snap(win, source.id); return { needsLogin: true, url }; }
      last = await win.webContents.executeJavaScript(SCRAPE).catch(() => null); if (last && last.items.length) break;
    }
    if (dayOffset) { // another day: step the calendar's own Next/Previous day arrows until the page itself says it shows that day (looking only, nothing is changed)
      const want = new Date(); want.setHours(0, 0, 0, 0); want.setDate(want.getDate() + dayOffset);
      const MON = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const shown = async () => { // the date the page shows = the date on its "Go to next day" button minus one day
        const lab = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /^go to next day/i.test(x.getAttribute('aria-label') || '')); return b ? b.getAttribute('aria-label') : ''; })()`).catch(() => '');
        const m = new RegExp('(' + MON.join('|') + ')\\s+(\\d{1,2}),\\s+(\\d{4})', 'i').exec(lab || ''); if (!m) return null; const d = new Date(+m[3], MON.indexOf(m[1].toLowerCase()), +m[2]); d.setDate(d.getDate() - 1); return d;
      };
      let cur = await shown(), reached = false;
      for (let i = 0; i < 45 && cur; i++) {
        if (+cur === +want) { reached = true; break; }
        const lab = cur < want ? 'go to next day' : 'go to previous day';
        const ok = await win.webContents.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.getAttribute('aria-label') || '').toLowerCase().startsWith(${JSON.stringify(lab)})); if (!b) return false; b.click(); return true; })()`).catch(() => false);
        if (!ok) break; await new Promise((r) => setTimeout(r, 1100)); cur = await shown();
      }
      if (!reached && cur && +cur === +want) reached = true;
      if (!reached) throw new Error(`The calendar did not reach ${want.toDateString()} (it shows ${cur ? cur.toDateString() : 'an unknown day'}), so I will not guess.`);
      let prevN = -1, same = 0; const t1 = Date.now(); // wait until the day's entries have stopped appearing
      while (Date.now() - t1 < 12000) { await new Promise((r) => setTimeout(r, 1300)); last = await win.webContents.executeJavaScript(SCRAPE).catch(() => null); const n = last ? last.items.length : 0; if (n === prevN) { if (++same >= 2) break; } else same = 0; prevN = n; const again = await shown(); if (again && +again !== +want) throw new Error('The calendar moved to another day while reading; try again.'); }
      const ready = await win.webContents.executeJavaScript(`/\\b(?:1[0-2]|[1-9]) (?:AM|PM)\\b/.test(document.body ? document.body.innerText : '')`).catch(() => false);
      if ((!last || !last.items.length) && !ready) throw new Error('The calendar page for that day did not finish loading, so I cannot say it is empty.');
    }
    const shot = await snap(win, source.id);
    if (emptyOk && (!last || !last.items.length)) return { items: [], url: win.webContents.getURL(), needsLogin: false, shot };
    if(!last||!last.items.length)throw new Error('No readable meeting entries. Calendar may be empty, still loading, or its layout may have changed; inspect the saved snapshot.');
    return { items: (last && last.items) || [], url: win.webContents.getURL(), needsLogin: loginWall(win.webContents.getURL()), shot };
  } finally { try { win.destroy(); } catch {} }
}
/** Opens a normal window so you can sign in yourself. Resolves when you close it. */
function signIn(sourceId) {
  const E = electron(); if (!E) return Promise.reject(new Error('Not available here.'));
  const s = state().sources.find((x) => x.id === sourceId); if (!s) return Promise.reject(new Error('Unknown calendar.'));
  return new Promise((resolve) => { const win = new E.BrowserWindow({ width: 1000, height: 760, title: `Sign in to ${s.name}`, webPreferences: { partition: partitionOf(s), sandbox: true } }); win.loadURL(s.url); win.on('closed', () => resolve(true)); });
}
let busy = false;
/** Reads every enabled calendar, updates the cache and (optionally) sets reminders. */
async function refresh({ remind = true } = {}) {
  if (busy) return state(); busy = true; const c = state();
  try {
    const events = [], status = {}, now = new Date();
    for (const s of c.sources.filter((x) => x.enabled && x.id !== 'teams' && !/teams\.(?:microsoft\.com|cloud\.microsoft|live\.com)/i.test(x.url || '')) /* Teams is ticked for messages, not read as a calendar */.sort((a,b)=>Number(/outlook/i.test(b.kind||b.id+' '+b.url))-Number(/outlook/i.test(a.kind||a.id+' '+a.url)))) {
      try { const r = await readPage(s); if (r.needsLogin) { status[s.id] = { ok: false, msg: 'Needs sign-in' }; continue; } const ev = parseEvents(r.items, now).map((e) => ({ ...e, source: s.name, sourceId: s.id })); events.push(...ev); status[s.id] = { ok: true, msg: `${ev.length} meeting${ev.length === 1 ? '' : 's'} found`, at: Date.now() }; }
      catch (e) { status[s.id] = { ok: false, msg: String(e.message).slice(0, 140) }; }
    }
    const horizon = Date.now() + 24 * 3600000, fresh = events.filter((e) => e.at >= Date.now() - 5 * 60000 && e.at <= horizon);
    const next = { ...state(), events: fresh.sort((a, b) => a.at - b.at), checkedAt: Date.now(), status }; save(next);
    if (remind && next.autoRemind) { const rem = require('./reminders'), have = new Set(rem.list().map((r) => r.text + '|' + Math.round(r.at / 60000))); const many = multi(next.events); for (const e of next.events) { const at = e.at - next.lead * 60000, text = `${label(e, many)} starts in ${next.lead} minutes`; if (at > Date.now() + 5000 && !have.has(text + '|' + Math.round(at / 60000))) { have.add(text + '|' + Math.round(at / 60000)); rem.add({ at, text }); } } }
    return next;
  } finally { busy = false; }
}

/** The meetings of one chosen day (today or later), read from every signed-in account's calendar. Returns { events, problems }. */
async function eventsOn(date) {
  const c = state(), d0 = new Date(date); d0.setHours(0, 0, 0, 0); const t0 = new Date(); t0.setHours(0, 0, 0, 0); const off = Math.round((d0 - t0) / 864e5); const events = [], problems = [], read = [];
  for (const s of c.sources.filter((x) => x.enabled && x.id !== 'teams' && !/teams\.(?:microsoft\.com|cloud\.microsoft|live\.com)/i.test(x.url || ''))) { /* Teams is ticked for messages, not read as a calendar */
    try {
      const url = /calendar\.google\.com/.test(s.url) ? s.url.replace(/\/(?:r\/)?(?:day|week|month)(?:\/.*)?$/, '') + `/r/day/${d0.getFullYear()}/${d0.getMonth() + 1}/${d0.getDate()}` : s.url;
      const r = await readPage({ ...s, url }, { dayOffset: /calendar\.google\.com/.test(s.url) ? 0 : off, emptyOk: true }); if (r.needsLogin) { problems.push(`${s.name} needs you to sign in`); continue; }
      const dayEnd = d0.getTime() + 864e5; events.push(...parseEvents(r.items, d0).filter((e) => e.at >= d0.getTime() && e.at < dayEnd).map((e) => ({ ...e, source: s.name, sourceId: s.id }))); read.push(s.name);
    } catch (e) { problems.push(`${s.name}: ${String(e.message).slice(0, 100)}`); }
  }
  return { events: events.sort((a, b) => a.at - b.at), problems, read };
}
/** The meetings in the next 24 hours: from the cache, refreshed first when it is older than maxAge. */
async function events({ maxAge = 5 * 60000 } = {}) { let c = state(); if (c.sources.some((s) => s.enabled) && Date.now() - c.checkedAt > maxAge) c = await refresh().catch(() => c); return c.events.filter((e) => e.at >= Date.now() - 5 * 60000); }
const anyEnabled = () => state().sources.some((s) => s.enabled);
const multi = (events) => new Set((events || []).map((e) => e.source).filter(Boolean)).size > 1;
/** "Standup (Ascendion Outlook)": the account is named only when meetings come from more than one. */
const label = (e, many) => `${e.title}${e.source ? ` (${e.source})` : ''}`;
module.exports = { eventsOn, loginWall, snap, multi, label, KINDS, partitionOf, snapshotPath, parseEvents, state, configure, signIn, refresh, events, anyEnabled, readPage, DEFAULT_SOURCES };
