// TULAI BOT: its own process. It owns the floating robot, the microphone and voice ("Hey Tulai"), the embedded models (whisper + llama),
// the local engine and harness, missions, the Slack/Telegram bridges, the memory watch and the menu bar icon.
// Closing, quitting or even crashing Tulai Desktop does not touch it: they are two separate programs that only talk through
// a few local calls. The bot opens Tulai Desktop (and hands it work for the company AI) by launching it as its own process.
const { app, ipcMain, Tray, Menu, nativeImage, globalShortcut, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

process.env.TULAI_ROLE = 'bot';
const BASE = app.getPath('userData'); // the shared data folder (config, chats, prefs, models)
app.setPath('userData', BASE + '-bot'); // the bot keeps its own browser profile and its own single-instance lock
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const BOT_PORT = process.env.TULAY_BOT_PORT || '39393', DESKTOP_PORT = process.env.TULAY_PORT || '39391';
process.env.PORT = BOT_PORT; process.env.TULAI_BOT_PORT = BOT_PORT; process.env.GC_DATA_DIR = BASE;
require('./server.js');
const store = require('./prefs-store');
const { trayIcon } = require('./icongen');
const bot = require('./bot-window');
const voice = require('./voice');

let prefs = store.load(), tray = null, userHidBot = false, forceQuit = false;
const savePrefs = () => store.update({ botPos: prefs.botPos });
const modelDir = () => path.join(BASE, 'models');
const SHORTCUT = 'CommandOrControl+Shift+Space';

/* ---------- Tulai Desktop is a separate program: launch it, do not embed it ---------- */
const cleanEnv = () => { const e = { ...process.env }; for (const k of ['PORT', 'GC_DATA_DIR', 'TULAI_ROLE', 'TULAI_BOT_PORT', 'ELECTRON_RUN_AS_NODE']) delete e[k]; return e; };
const appArgs = () => [...(app.isPackaged ? [] : [app.getAppPath()]), ...process.argv.filter((a) => a.startsWith('--user-data-dir='))];
function openDesktop(extra = []) { try { spawn(process.execPath, [...appArgs(), '--desktop', ...extra], { detached: true, stdio: 'ignore', env: cleanEnv() }).unref(); } catch {} }
async function desktopUp() { try { const r = await fetch(`http://127.0.0.1:${DESKTOP_PORT}/api/config`, { signal: AbortSignal.timeout(700) }); return r.ok; } catch { return false; } }
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64');
process.on('tulay:roam', (s) => { try { bot.roam(s); } catch {} });
process.on('tulay:delegate', (d) => { const o = d && typeof d === 'object' ? d : { text: d }; openDesktop(['--delegate=' + b64({ text: String(o.text || ''), workspace: o.workspace ? String(o.workspace) : undefined })]); });
process.on('tulay:show-desktop', () => openDesktop());
try { require('./call-detect').start((app) => { try { bot.show(); bot.send('voice:event', { type: 'notes', text: `📞 It looks like a **${app}** call just started. Say **start meeting notes** and I will take notes and suggest answers to questions (only you see them). Please tell the others the call is being transcribed.` }); } catch {} }); } catch {} // offers meeting notes when a call starts; never records by itself
process.on('tulay:helper', (h) => { try { const hw = require('./helper-window'); if (h.phase === 'idle') hw.close(); else if (!hw.isOpen()) { const w = bot.window && bot.window(); hw.open(BOT_PORT, w && !w.isDestroyed() ? w.getBounds() : null); } } catch {} }); // the helper bot pops up while it works and leaves after waving
process.on('tulay:live-answer', () => { try { const cw = require('./call-window'); if (!cw.isOpen()) cw.open(BOT_PORT); } catch {} }); // suggested answers appear ONLY in the floating answer window (hidden from screen sharing), never in the chat
try { require('./live-answer').watchScreen(() => { try { return require('./call-detect').inCall() || require('./meeting').isRecording(); } catch { return false; } }); } catch {} // coding interview: a new coding problem on the screen gets a solution in the hidden answer window
setInterval(() => { try { const meetingNow = require('./call-detect').inCall() || require('./meeting').isRecording(); bot.protect(meetingNow); meetingStealth(meetingNow); } catch {} }, 4000); // in a call or taking notes: the bot window is hidden from screen sharing too // a suggested answer during a call
process.on('tulay:meeting-notes', (text) => { try { bot.show(); bot.send('voice:event', { type: 'notes', text: String(text) }); } catch {} }); // the AI meeting notes, posted in the chat when ready
process.on('tulay:open-chat', (id) => openDesktop(['--open-chat=' + id]));
process.on('tulay:perform', (move) => { try { bot.show(); bot.send('voice:event', { type: 'perform', move }); } catch {} });
function panicStop() { process.emit('tulay:panic'); desktopUp().then((up) => { if (up) openDesktop(['--stop-all']); }); }

/* ---------- errors never take the bot down: they are written to errors.log ---------- */
const errLog = (kind, e) => { try { const f = path.join(BASE, 'errors.log'); fs.appendFileSync(f, `${new Date().toISOString()} ${kind}: ${(e && e.stack) || e}\n`); if (fs.statSync(f).size > 200000) fs.writeFileSync(f, ''); } catch {} };
process.on('uncaughtException', (e) => errLog('uncaughtException', e));
process.on('unhandledRejection', (e) => errLog('unhandledRejection', e));

/* ---------- /api/health: what works, what does not, and how to fix it ---------- */
global.__tulaiHealth = async () => {
  const sm = (() => { try { return require('electron').systemPreferences; } catch { return null; } })(), V = voice.health(), N = require('./nlu').health(), W = require('./work'), cfg = (() => { try { return JSON.parse(fs.readFileSync(path.join(BASE, 'config.json'), 'utf8')); } catch { return {}; } })(), cal = webcal.state();
  let mem = null; try { const x = await require('./sysmem').read(); mem = { level: x.level, freePct: x.freePct, swapUsedGB: x.swapUsedGB }; } catch {}
  const rows = [
    { id: 'bot', ok: true, label: 'Tulai Bot', detail: `running (up ${Math.round(process.uptime() / 60)} min)` },
    { id: 'listener', ok: V.listener, label: 'Listening for "Hey Tulai"', detail: V.listener ? 'on' : (prefs.voice.wake === false ? 'turned off in Settings' : 'not running, restarting'), fix: V.listener ? '' : 'Settings → Chat → Always listening' },
    { id: 'mic', ok: sm ? sm.getMediaAccessStatus('microphone') === 'granted' : null, label: 'Microphone permission', detail: sm ? sm.getMediaAccessStatus('microphone') : '?', fix: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone' },
    { id: 'whisper', ok: !!V.model && V.engine === 'whisper', label: 'Speech recognition (whisper)', detail: V.model ? `${V.model}${V.whisper ? ', loaded' : ', loads on first use'}` : 'model missing' },
    (() => { const b = require('./nlu').brain(); return b.kind === 'online' ? { id: 'brain', ok: b.last.ok !== false, label: `Understanding model (${b.name})`, detail: b.last.ok === false ? `cannot reach it (${b.last.error}); using the embedded model instead` : `${b.model}, online. The embedded model is the backup` } : { id: 'brain', ok: N.available, label: 'Understanding model (local AI)', detail: N.available ? `${N.model}${N.running ? ', running' : ', starting'}` : 'model or program missing' }; })(),
    (() => { const t = require('./bot-training').firstRunStatus(); return { id: 'training', ok: t.ok, label: 'Skill training (the Tulai skills model)', detail: t.detail }; })(),
    { id: 'screen', ok: sm ? sm.getMediaAccessStatus('screen') === 'granted' : null, label: 'Screen & System Audio Recording', detail: (sm ? sm.getMediaAccessStatus('screen') : '?') + ' (needed to hear the other people in a meeting through a headset, and for Mac control)', fix: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture' },
    { id: 'jira', ok: W.connected(cfg).jira, label: 'Jira', detail: W.connected(cfg).jira ? 'connected' : 'not connected', fix: 'Settings → Work tools', optional: true },
    { id: 'gitlab', ok: W.connected(cfg).gitlab, label: 'GitLab', detail: W.connected(cfg).gitlab ? 'connected' : 'not connected', fix: 'Settings → Work tools', optional: true },
    { id: 'calendar', ok: cal.sources.some((s) => s.enabled) ? !Object.values(cal.status || {}).some((x) => x && !x.ok) : null, label: 'Calendars', detail: cal.sources.some((s) => s.enabled) ? cal.sources.filter((s) => s.enabled).map((s) => `${s.name}: ${((cal.status || {})[s.id] || {}).msg || 'waiting for first check'}`).join('; ') : 'none turned on', fix: 'Settings → Calendars', optional: true },
    { id: 'memory', ok: mem ? mem.level !== 'critical' : null, label: 'Mac memory', detail: mem ? `${mem.level}, ${mem.freePct}% free, ${mem.swapUsedGB} GB swapped` : '?' },
  ];
  let errs = 0; try { errs = fs.readFileSync(path.join(BASE, 'errors.log'), 'utf8').split('\n').filter(Boolean).length; } catch {}
  return { ok: rows.filter((r) => !r.optional).every((r) => r.ok !== false), version: require('./package.json').version, rows, reminders: require('./reminders').list().length, errors: errs, models: { speech: V.model, brain: N.model } };
};

/* ---------- supervisor: if an engine dies, bring it back ---------- */
function superviseEngines() {
  try {
    if (prefs.voice.wake !== false) { voice.warm().catch(() => {}); const nlu = require('./nlu'); if (nlu.localAvailable()) nlu.ensureLocal().catch(() => {}); }
  } catch (e) { errLog('supervisor', e); }
}

/* ---------- menu bar icon ---------- */
function makeTray() {
  if (tray) return;
  const img = nativeImage.createFromBuffer(trayIcon(36), { scaleFactor: 2 }); img.setTemplateImage(true);
  tray = new Tray(img); tray.setToolTip('Tulai Bot'); tray.on('click', () => openDesktop()); refreshTray();
}
function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Tulai Bot is running', enabled: false },
    { type: 'separator' },
    { label: 'Open Tulai Desktop', click: () => openDesktop() },
    { label: bot.visible() ? 'Hide floating bot' : 'Show floating bot', click: () => { const hide = bot.visible(); prefs.bot = !hide; store.update({ bot: !hide }); userHidBot = false; hide ? bot.hide() : bot.show(); setTimeout(refreshTray, 300); } }, // a choice that stays: Settings in Tulai Desktop shows the same switch
    { label: 'Talk to Tulai', click: () => talk() },
    { label: 'Walk around the screen now', click: () => bot.roam() },
    { label: 'Go to a corner', submenu: [['Right', 'right'], ['Left', 'left'], ['Left bottom', 'left-bottom'], ['Left top', 'left-top'], ['Right top', 'right-top'], ['Right bottom', 'right-bottom']].map(([l, s]) => ({ label: l, click: () => bot.roam(s) })) },
    { label: 'Hide Tulai from the menu bar and Dock during meetings', type: 'checkbox', checked: prefs.hideInMeetings !== false, click: (i) => { prefs.hideInMeetings = i.checked; store.update({ hideInMeetings: i.checked }); } },
    { label: 'Roam around now and then', type: 'checkbox', checked: prefs.roam !== false, click: (i) => { prefs.roam = i.checked; store.update({ roam: i.checked }); } },
    { label: 'Stop everything now', accelerator: 'Cmd+Shift+Esc', click: () => panicStop() },
    { type: 'separator' },
    { label: 'Quit Tulai Bot', click: () => { forceQuit = true; app.quit(); } },
  ]));
}
function destroyTray() { if (tray) { tray.destroy(); tray = null; } }
/** During a meeting (a call is on, or meeting notes record) Tulai leaves the menu bar (and Tulai Desktop leaves the Dock and its top menu: it reads
 hideApp from /api/bot/live). After the meeting both come back. On by default; "Hide during meetings" in the menu-bar menu turns it off. */
function meetingStealth(meetingNow) {
  const hide = !!meetingNow && prefs.hideInMeetings !== false; global.__tulaiMeetingHidden = hide;
  if (hide && tray) destroyTray(); else if (!hide && prefs.tray && !tray) makeTray();
}

/* ---------- shortcuts ---------- */
function applyShortcut() {
  globalShortcut.unregisterAll();
  if (!prefs.shortcut) return;
  globalShortcut.register('CommandOrControl+Shift+V', () => talk());
  globalShortcut.register('CommandOrControl+Shift+Escape', () => panicStop());
  globalShortcut.register(SHORTCUT, () => openDesktop());
}

/* ---------- voice, as the bot window and Tulai Desktop's settings use it ---------- */
const speakOpts = (t) => ({ voice: prefs.voice.voice, rate: prefs.voice.rate, followup: /\?/.test(String(t)) && voice.engine() === 'whisper', keepOpen: false });
ipcMain.handle('focus', () => { openDesktop(); });
ipcMain.handle('bot:menu', () => { Menu.buildFromTemplate([{ label: 'Open Tulai Desktop', click: () => openDesktop() }, { type: 'separator' }, { label: 'Hide the bot', click: () => { prefs.bot = false; store.update({ bot: false }); userHidBot = false; bot.hide(); setTimeout(refreshTray, 300); } }]).popup(); return true; }); // to bring it back: menu bar icon, Show floating bot, or Settings in Tulai Desktop
ipcMain.handle('prefs:get', () => ({ tray: prefs.tray, shortcut: prefs.shortcut, login: false, bot: prefs.bot !== false, voice: prefs.voice, skin: prefs.skin, appearance: prefs.appearance, panelSize: prefs.panelSize }));
ipcMain.handle('prefs:set', (_e, p) => { if (p && p.voice && typeof p.voice === 'object') { prefs.voice = { ...(prefs.voice || {}), ...p.voice }; store.update({ voice: prefs.voice }); } return true; });
ipcMain.handle('bot:expand', (_e, v) => bot.expand(!!v));
ipcMain.handle('bot:size', (_e, lvl) => { const r = bot.setSize(lvl); store.update({ panelSize: r.level }); return r; });
const fileIn = (name) => { const f = path.join(require('./export').dir(), path.basename(String(name || ''))); return fs.existsSync(f) ? f : null; };
ipcMain.handle('file:open', (_e, name) => { const f = fileIn(name); if (f) shell.openPath(f); return !!f; });
ipcMain.handle('file:reveal', (_e, name) => { const f = fileIn(name); if (f) shell.showItemInFolder(f); return !!f; });
ipcMain.handle('view:open', (_e, id) => { const e = require('./viewer').get(id); if (e) shell.openPath(e.path); return !!e; });
ipcMain.handle('view:reveal', (_e, id) => { const e = require('./viewer').get(id); if (e) shell.showItemInFolder(e.path); return !!e; });
ipcMain.handle('url:open', (_e, u) => { try { const x = new URL(String(u)); if (/^https?:$/.test(x.protocol)) shell.openExternal(x.href); } catch {} return true; });
ipcMain.handle('bot:dragstart', () => bot.dragStart());
ipcMain.on('bot:dragmove', (_e, x, y) => bot.dragMove(x, y));
ipcMain.on('bot:dragend', () => bot.dragEnd());
const VOICE = {
  once: () => { voice.once(prefs.voice.locale, voiceEvent); return true; },
  stop: () => { voice.stop(); return true; },
  speak: (t) => voice.speak(t, speakOpts(t)),
  stopspeaking: () => { voice.stopSpeaking(); return true; },
  arm: () => { voice.arm(25000); return true; },
  ding: () => { voice.ding(); return true; },
  status: async () => ({ ...(await voice.status(prefs.voice.locale)), blocked: voice.isBlocked(), helper: !!voice.helperPath() }),
  locales: () => voice.locales(),
  voices: () => voice.voices(),
};
for (const [name, fn] of Object.entries(VOICE)) ipcMain.handle('voice:' + name, (_e, arg) => fn(arg));
require('./bot-room').configure({port:BOT_PORT,skin:()=>prefs.skin,voice,voiceName:()=>prefs.voice.voice});
global.__tulaiVoice = async (cmd, arg) => (VOICE[cmd] ? VOICE[cmd](arg) : null); // Tulai Desktop reaches these through the bot's local server

let lvlMax = 0, lvlAt = Date.now(), greetTimer = null, lastSpeechAt = 0;
const VLOG = () => path.join(BASE, 'voice.log');
function voiceEvent(ev) {
  require('./bot-room').voiceEvent(ev);
  if (ev.type === 'learned' && ev.alias) { prefs.voice.aliases = [...new Set([...(prefs.voice.aliases || []), ev.alias])].slice(-20); store.update({ voice: { aliases: prefs.voice.aliases } }); }
  if (ev.type === 'heard' && ev.text) { try { if (voice.afterWake(ev.text) === null) require('./meeting').feed(ev.text); } catch {} }
  if (ev.type === 'level') { lvlMax = Math.max(lvlMax, ev.v || 0); if (Date.now() - lvlAt > 5000) { try { fs.appendFileSync(VLOG(), new Date().toISOString().slice(11, 19) + ' mic level max ' + lvlMax.toFixed(3) + ' (5s)\n'); } catch {} lvlAt = Date.now(); lvlMax = 0; } }
  if (ev.type !== 'level' && ev.type !== 'speech') { try { const quiet = ev.type === 'heard' && !prefs.voice.debug && String(ev.text || '').split(/\s+/).length > 6 && voice.afterWake(ev.text) === null; const rec = quiet ? { type: 'heard', chars: String(ev.text || '').length, note: 'long speech without a wake phrase: text not stored' } : (ev.type === 'partial' && !prefs.voice.debug ? null : ev); if (rec) fs.appendFileSync(VLOG(), new Date().toISOString().slice(11, 19) + ' ' + JSON.stringify(rec) + '\n'); if (fs.statSync(VLOG()).size > 200000) fs.writeFileSync(VLOG(), ''); } catch {} }
  if (ev.type === 'speaking') global.__tulaiSpeaking = !!ev.on; if (ev.type === 'wake') global.__tulaiSpeaking = false;
  bot.send('voice:event', ev); try { global.__tulaiVoiceEvents(ev); } catch {}
  if (ev.type === 'speech') { lastSpeechAt = Date.now(); clearTimeout(greetTimer); greetTimer = null; return; } // you kept talking: do not talk over you
  if (ev.type === 'wake') {
    bot.show(); voice.ding(); // instant tick so you know it heard you
    if (ev.greet && !ev.followup && prefs.voice.speak !== false && voice.engine() === 'whisper' && !(lastSpeechAt > (ev.at || 0))) { // skip the greeting if you already started speaking after the wake phrase
      clearTimeout(greetTimer);
      greetTimer = setTimeout(() => { greetTimer = null; const line = ev.hello ? 'Hello! How can I help?' : ['Yes?', "I'm listening.", 'Go ahead.', 'Yes, how can I help?'][Math.floor(Math.random() * 4)]; voice.speak(line, { voice: prefs.voice.voice, rate: prefs.voice.rate, followup: true }); }, 1000); // only if you stay quiet
    }
  }
  if (ev.type === 'error' && ['speech_denied', 'mic_denied'].includes(ev.code)) bot.show();
  if (ev.type === 'error' && ev.code === 'screen_denied' && ev.source === 'system' && Date.now() - (global.__scrWarn || 0) > 120000) { global.__scrWarn = Date.now(); const say = 'To hear the other people in the meeting, please allow Tulai in System Settings, Privacy and Security, Screen and System Audio Recording. Until then I only hear you.'; bot.show(); bot.send('voice:event', { type: 'reminder', text: say }); try { const { Notification, shell } = require('electron'); if (Notification.isSupported()) new Notification({ title: 'Tulai needs a permission', body: 'Allow Screen & System Audio Recording so I can hear the meeting.' }).show(); shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'); } catch {} if (prefs.voice.speak !== false) voice.speak(say, { voice: prefs.voice.voice, rate: prefs.voice.rate }); }
}
function talk() { bot.show(); voice.once(prefs.voice.locale, voiceEvent); setTimeout(() => bot.send('voice:event', { type: 'ready', mode: 'once' }), 350); }

/* ---------- memory watch: smoke over the robot's head when the Mac's memory gets tight ---------- */
let lastMemLevel = 'normal', lastMemWarn = 0;
async function watchMemory() {
  try {
    const sm = require('./sysmem'), m = await sm.read();
    const ev = { type: 'memory', level: m.level, freePct: m.freePct }; bot.send('voice:event', ev);
    if (m.level === 'critical' && lastMemLevel !== 'critical' && Date.now() - lastMemWarn > 10 * 60000) { lastMemWarn = Date.now(); if (prefs.voice.speak !== false) voice.speak(`Heads up, your Mac's memory is critical.${m.top[0] ? ` ${m.top[0].name} is using ${m.top[0].gb} gigabytes.` : ''}`, { voice: prefs.voice.voice, rate: prefs.voice.rate }); }
    lastMemLevel = m.level;
  } catch {}
}

/* ---------- settings changed in Tulai Desktop arrive through prefs.json ---------- */
function applyFromDisk() {
  const n = store.load(), o = prefs; prefs = { ...n, botPos: o.botPos };
  if (n.tray !== o.tray) { n.tray ? makeTray() : destroyTray(); }
  if (n.shortcut !== o.shortcut) applyShortcut();
  if (JSON.stringify(n.skin) !== JSON.stringify(o.skin) || n.appearance !== o.appearance) bot.send('voice:event', { type: 'skin', skin: n.skin, appearance: n.appearance });
  if ((n.bot !== false) !== (o.bot !== false)) { userHidBot = false; n.bot !== false ? bot.show() : bot.hide(); setTimeout(refreshTray, 300); }
  const v = n.voice, w = o.voice;
  voice.configure({ modelDir: modelDir(), lang: v.lang || 'en' }); voice.setAliases(v.aliases);
  if (v.wake !== w.wake || v.locale !== w.locale || (v.lang || 'en') !== (w.lang || 'en') || JSON.stringify(v.aliases) !== JSON.stringify(w.aliases)) voice.setWake(v.wake, v.locale, voiceEvent);
}

/* ---------- lifecycle ---------- */
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { forceQuit = true; app.quit(); });
/* Clicking the Tulai icon (Dock, Finder, Spotlight) always brings up Tulai Desktop, never the floating bot: the bot has its own switch in Settings and the menu bar */
app.on('second-instance', () => openDesktop());
const bornAt = Date.now(); app.on('activate', () => { if (Date.now() - bornAt > 15000) openDesktop(); }); // (not during start-up, so a restart of the bot does not pop the window)
app.on('window-all-closed', () => {}); // the bot stays alive without windows
app.on('will-quit', () => { globalShortcut.unregisterAll(); try { voice.shutdown(); voice.stop(); voice.stopSpeaking(); } catch {} try { require('./nlu').shutdown(); } catch {} });
/* ---------- calendars read in the background (Outlook, Google, Teams): Tulai asks you to sign in when it has to ---------- */
const webcal = require('./webcal'), askedSignIn = {};
function needSignIn(s) {
  const say = `I need you to sign in to ${s.name}. I opened it for you. Close the window when you are done, and I will take it from there.`;
  bot.show(); bot.send('voice:event', { type: 'reminder', text: say });
  try { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title: 'Tulai needs you to sign in', body: `${s.name}: sign in once, then close the window.` }).show(); } catch {}
  if (prefs.voice.speak !== false) voice.speak(say, { voice: prefs.voice.voice, rate: prefs.voice.rate });
  webcal.signIn(s.id).then(() => { askedSignIn[s.id] = 0; calendarTick(); });
}
async function calendarTick() {
  try {
    if (!webcal.anyEnabled()) return; const st = await webcal.refresh();
    for (const s of st.sources.filter((x) => x.enabled)) { const status = (st.status || {})[s.id]; if (status && !status.ok && /sign-in/i.test(status.msg) && Date.now() - (askedSignIn[s.id] || 0) > 30 * 60000) { askedSignIn[s.id] = Date.now(); needSignIn(s); } }
    return st;
  } catch {}
}
const calState = () => { const c = webcal.state(); return { sources: c.sources.map((s) => ({ ...s, status: (c.status || {})[s.id] || null, snapshot: !!webcal.snapshotPath(s.id) })), autoRemind: c.autoRemind, lead: c.lead, checkedAt: c.checkedAt, events: c.events.slice(0, 20) }; };
global.__tulaiCalendar = async (cmd, arg) => {
  if (cmd === 'state') return calState();
  if (cmd === 'config') { webcal.configure(arg || {}); return calState(); }
  if (cmd === 'signin') { const s = webcal.state().sources.find((x) => x.id === (arg && arg.id)); if (!s) throw new Error('Unknown calendar.'); webcal.signIn(s.id).then(() => calendarTick()); return { ok: true }; }
  if (cmd === 'refresh') { await calendarTick(); return calState(); }
  if (cmd === 'webread') { const r = await require('./bot-web').read(arg.id, arg.url, { search: arg.search }); const shot = r.shot && fs.existsSync(r.shot) ? fs.readFileSync(r.shot) : null; return { ...r, shot }; }
  if (cmd === 'teamsfind') return require('./teams-send').findPerson(arg || {}); // read only: a person's work email from Teams search
  if (cmd === 'teamssend') return (arg && arg.email) ? require('./teams-send').send(arg) : require('./teams-send').sendByName(arg || {}); // only called after you said yes in the chat
  if (cmd === 'webopen') return require('./bot-web').open(arg.id, arg.url);
  if (cmd === 'eventson') return require('./webcal').eventsOn(arg.date);
  if (cmd === 'webtabs') return require('./bot-web').tabs();
  if (cmd === 'webclose') return require('./bot-web').close(arg.id);
  if (cmd === 'webinspect') { const r = await require('./bot-web').inspect(arg.id, arg); const shot = r.shot && fs.existsSync(r.shot) ? fs.readFileSync(r.shot) : null; return { ...r, shot }; }
  if (cmd === 'snapshot') return webcal.snapshotPath(arg);
  return null;
};
/* ---------- meeting sound: hear the other people while meeting notes run (works with a headset) ---------- */
process.on('tulay:meeting', (on) => { try { const cw = require('./call-window'); if (on) cw.open(BOT_PORT); else setTimeout(() => { try { if (!require('./meeting').isRecording()) cw.close(); } catch {} }, 120000); } catch {} }); // the floating answer window opens with meeting notes (closes 2 minutes after they stop, so the last answer can still be read)
process.on('tulay:meeting', (on) => {
  if (!on) { voice.stopSystem(); return; }
  const ok = voice.startSystem((text) => { try { require('./meeting').feed(text, 'Others'); } catch {} });
  if (!ok) bot.send('voice:event', { type: 'reminder', text: 'I can only hear your microphone for now.' });
});
function checkReminders() {
  try {
    const rem = require('./reminders'), fired = rem.due();
    for (const r of fired) {
      bot.show(); bot.send('voice:event', { type: 'reminder', text: rem.spoken(r) });
      try { const { Notification } = require('electron'); if (Notification.isSupported()) new Notification({ title: 'Tulai reminder', body: rem.spoken(r) }).show(); } catch {}
      try{fs.appendFileSync(path.join(BASE,'reminder-delivery.jsonl'),JSON.stringify({id:r.id,text:r.text,scheduledAt:r.at,deliveredAt:Date.now(),channel:'bot popup; notification requested'})+'\n',{mode:0o600});}catch{}
      voice.ding(); if (prefs.voice.speak !== false) setTimeout(() => voice.speak(rem.spoken(r) + ' Say snooze to hear it again in five minutes.', { voice: prefs.voice.voice, rate: prefs.voice.rate }), 700);
    }
  } catch {}
}
app.whenReady().then(() => {
  prefs = store.load();
  if (process.platform === 'darwin' && app.dock) { try { app.dock.hide(); } catch {} } // the bot has no Dock icon: it lives in the menu bar
  if (prefs.tray) makeTray(); applyShortcut();
  bot.create({ prefs, savePrefs, port: BOT_PORT }); bot.startPresence(() => prefs, () => !!require('./converse').busy(require('./converse').BOT_ID) || global.__tulaiSpeaking === true);
  fs.watchFile(store.file(), { interval: 1500 }, applyFromDisk);
  setTimeout(watchMemory, 4000); setInterval(watchMemory, 8000);
  checkReminders();setInterval(checkReminders, 1000);
  setInterval(superviseEngines, 30000);
  setTimeout(calendarTick, 25000); setInterval(calendarTick, 5 * 60000);
  { const ins = require('./installer'); if (ins.needed() || require('./skill-packs').setupPending()) { const w = new BrowserWindow({ width: 640, height: 720, title: 'Setting up Tulai', resizable: false, minimizable: true, backgroundColor: '#10151f', webPreferences: { sandbox: true } }); w.setMenuBarVisibility && w.setMenuBarVisibility(false); w.loadURL(`http://localhost:${BOT_PORT}/setup.html`); try { app.dock && app.dock.show(); } catch {} w.on('closed', () => { try { app.dock && app.dock.hide(); } catch {} }); } } // first launch: the setup window downloads the local AI, with the bot as the progress indicator
  { const bt = require('./bot-training'); setTimeout(() => bt.autoStart(), 90000); setInterval(() => bt.autoStart(), 5 * 60000); /* every 5 minutes: with non-stop training the next round starts within minutes of the last one */ } { const sr = require('./scenario-runner'); setInterval(() => sr.tick(), 15 * 60000); } // keeps testing itself on real-life conversations, never while you chat, train or are in a call // every install trains the Tulai skills model in the background (plugged in), then switches to it if it passes the checks
  setInterval(() => { try { if (prefs.bot !== false && !userHidBot && !forceQuit && !(bot.visible && bot.visible())) bot.show(); } catch {} }, 4000);
  if (prefs.voice.wake) setTimeout(async () => {
    try { if (systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') { bot.show(); await systemPreferences.askForMediaAccess('microphone'); } } catch {}
    voice.configure({ modelDir: modelDir(), lang: prefs.voice.lang || 'en' }); voice.setAliases(prefs.voice.aliases); voice.warm().catch(() => {}); voice.prewarmVoice(prefs.voice);
    try { const nlu = require('./nlu'); nlu.configure({ modelDir: modelDir() }); if (nlu.localAvailable()) nlu.ensureLocal(); } catch {}
    voice.setWake(true, prefs.voice.locale, voiceEvent);
  }, 2500);
});
