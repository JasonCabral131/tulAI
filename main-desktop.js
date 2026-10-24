// TULAI DESKTOP: the chat app. It uses the company AI, runs the agent harness and the embedded browser pane, and nothing else.
// It is a separate program from Tulai Bot (the floating robot, voice, missions and chat apps): quitting Desktop never touches the bot.
// Desktop makes sure the bot is running, and reaches its voice settings through the bot's local server.
const { app, BrowserWindow, shell, dialog, ipcMain, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

process.env.TULAI_ROLE = 'desktop';
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); } // a second launch just asks the first one to show itself or do something (see second-instance)

const PORT = process.env.TULAY_PORT || '39391', BOT_PORT = process.env.TULAY_BOT_PORT || '39393'; // PORT overridable so a test copy can run next to the real app
process.env.PORT = PORT; process.env.TULAI_BOT_PORT = BOT_PORT; process.env.GC_DATA_DIR = app.getPath('userData');
require('./server.js');
const store = require('./prefs-store');
const browser = require('./browser');

let win = null, quitting = false, running = 0;
const send = (channel, ...args) => { if (win && !win.isDestroyed()) win.webContents.send(channel, ...args); };

const errLog = (kind, e) => { try { const f = path.join(app.getPath('userData'), 'errors.log'); fs.appendFileSync(f, `${new Date().toISOString()} desktop ${kind}: ${(e && e.stack) || e}\n`); if (fs.statSync(f).size > 200000) fs.writeFileSync(f, ''); } catch {} };
process.on('uncaughtException', (e) => errLog('uncaughtException', e));
process.on('unhandledRejection', (e) => errLog('unhandledRejection', e));
/* ---------- Tulai Bot is a separate program: make sure it is running ---------- */
const cleanEnv = () => { const e = { ...process.env }; for (const k of ['PORT', 'GC_DATA_DIR', 'TULAI_ROLE', 'TULAI_BOT_PORT', 'ELECTRON_RUN_AS_NODE']) delete e[k]; return e; };
const appArgs = () => [...(app.isPackaged ? [] : [app.getAppPath()]), ...process.argv.filter((a) => a.startsWith('--user-data-dir='))];
async function botUp() { try { const r = await fetch(`http://127.0.0.1:${BOT_PORT}/api/bot/state`, { signal: AbortSignal.timeout(900) }); return r.ok; } catch { return false; } }
async function ensureBot() { if (process.env.TULAI_NO_BOT === '1' || await botUp()) return; try { spawn(process.execPath, [...appArgs(), '--bot'], { detached: true, stdio: 'ignore', env: cleanEnv() }).unref(); } catch {} }
function botCall(cmd, arg) { // POST to the bot's local server
  return new Promise((resolve) => { const body = JSON.stringify({ arg }); const r = http.request({ host: '127.0.0.1', port: BOT_PORT, path: '/api/voice/' + cmd, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d).result); } catch { resolve(null); } }); }); r.on('error', () => resolve(null)); r.setTimeout(8000, () => r.destroy()); r.end(body); });
}
function followBotVoice() { // the bot's microphone events (for "Train my voice") reach the Settings screen from here
  const connect = () => { const r = http.get({ host: '127.0.0.1', port: BOT_PORT, path: '/api/voice/events' }, (res) => { let buf = ''; res.on('data', (c) => { buf += c; let i; while ((i = buf.indexOf('\n\n')) >= 0) { const piece = buf.slice(0, i); buf = buf.slice(i + 2); if (piece.startsWith('data:')) { try { send('voice:event', JSON.parse(piece.slice(5))); } catch {} } } }); res.on('end', () => setTimeout(connect, 2000)); }); r.on('error', () => setTimeout(connect, 3000)); };
  connect();
}

/* ---------- window ---------- */
let meetingHidden = false; // during a meeting Tulai Desktop stays out of the Dock and the top menu bar (Tulai Bot says when: /api/bot/live hideApp)
async function meetingStealth() {
  if (process.platform !== 'darwin' || !app.dock) return; let hide = false;
  try { const r = await fetch(`http://127.0.0.1:${BOT_PORT}/api/bot/live`, { signal: AbortSignal.timeout(3000) }); hide = !!(await r.json()).hideApp; } catch {}
  if (hide && (!meetingHidden || (app.dock.isVisible && app.dock.isVisible()))) { meetingHidden = true; try { app.dock.hide(); } catch {} }
  else if (!hide && meetingHidden) { meetingHidden = false; try { app.dock.show(); } catch {} }
}
function showWindow() { if (process.platform === 'darwin' && app.dock && !meetingHidden) { try { app.dock.show(); } catch {} } if (!win || win.isDestroyed()) return createWindow(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function createWindow() {
  const b = store.load().bounds || {};
  win = new BrowserWindow({
    width: b.width || 1240, height: b.height || 820, x: b.x, y: b.y, minWidth: 720, minHeight: 500,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
    titleBarStyle: 'hiddenInset', backgroundColor: '#1a1917', title: 'Tulai Desktop', show: false,
  });
  win.once('ready-to-show', () => win.show());
  browser.init(win, { insecure: () => { try { return !!JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')).insecureTls; } catch { return false; } } });
  win.loadURL(`http://localhost:${PORT}`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  let t; const keep = () => { clearTimeout(t); t = setTimeout(() => { if (win && !win.isDestroyed() && !win.isMaximized() && !win.isFullScreen()) store.update({ bounds: win.getBounds() }); }, 600); };
  win.on('resize', keep); win.on('move', keep);
  // Closing the window only hides it, so chats keep working; Cmd+Q quits Tulai Desktop (the bot is a different program and keeps running).
  win.on('close', (e) => { if (!quitting && process.platform === 'darwin') { e.preventDefault(); win.hide(); } });
  win.on('closed', () => { win = null; });
}
function delegateToDesktop(job) { const d = typeof job === 'object' ? job : { text: job }; showWindow(); const go = () => send('menu', 'delegate:' + Buffer.from(JSON.stringify({ text: d.text, workspace: d.workspace })).toString('base64')); const tryGo = () => { if (win && !win.isDestroyed() && win.webContents.isLoading()) win.webContents.once('did-finish-load', () => setTimeout(go, 400)); else setTimeout(go, 250); }; tryGo(); }
function handleArgs(argv) { // what a second launch (or the bot) asks for
  let did = false;
  for (const a of argv) {
    if (a.startsWith('--delegate=')) { try { delegateToDesktop(JSON.parse(Buffer.from(a.slice(11), 'base64').toString('utf8'))); did = true; } catch {} }
    else if (a.startsWith('--open-chat=')) { showWindow(); const id = a.slice(12); setTimeout(() => send('menu', 'open-chat:' + id), 500); did = true; }
    else if (a === '--stop-all') { send('menu', 'stop-all'); did = true; }
  }
  if (!did) showWindow();
}

/* ---------- app menu ---------- */
function buildMenu() {
  const m = (label, accelerator, action) => ({ label, accelerator, click: () => { showWindow(); send('menu', action); } });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Tulai Desktop', submenu: [{ role: 'about' }, { type: 'separator' }, m('Settings…', 'CmdOrCtrl+,', 'settings'), { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { label: 'Quit Tulai Desktop', accelerator: 'Cmd+Q', click: () => app.quit() }] },
    { label: 'File', submenu: [m('New Chat', 'CmdOrCtrl+N', 'new-chat'), { type: 'separator' }, { role: 'close' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [m('Toggle Sidebar', 'CmdOrCtrl+Shift+B', 'toggle-sidebar'), m('Toggle Side Panel', 'CmdOrCtrl+J', 'toggle-panel'), { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] },
  ]));
}

/* ---------- IPC from the page ---------- */
ipcMain.handle('pick-folder', async (e) => { const r = await dialog.showOpenDialog(BrowserWindow.fromWebContents(e.sender), { properties: ['openDirectory', 'createDirectory'], title: 'Choose a workspace folder' }); return r.canceled ? null : r.filePaths[0]; });
ipcMain.handle('reveal', (_e, p) => { shell.openPath(p || app.getPath('userData')); });
ipcMain.handle('focus', () => showWindow());
ipcMain.handle('browser:bounds', (_e, r) => { browser.setHost(r); return true; });
ipcMain.handle('browser:cmd', async (_e, c) => { try { return await browser.userCmd(c); } catch (e) { return { error: e.message }; } });
ipcMain.handle('badge', (_e, n) => { if (process.platform === 'darwin' && app.dock) app.dock.setBadge(n > 0 ? String(n) : ''); });
ipcMain.handle('running', (_e, n) => { running = Math.max(0, +n || 0); });
ipcMain.handle('computer:status', () => { const { systemPreferences } = require('electron'); return { screen: systemPreferences.getMediaAccessStatus('screen'), accessibility: systemPreferences.isTrustedAccessibilityClient(false) }; });
ipcMain.handle('computer:request', (_e, what) => { const { systemPreferences } = require('electron'); if (what === 'accessibility') systemPreferences.isTrustedAccessibilityClient(true); else shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'); return true; });
// voice controls in Settings belong to the bot: forward them
for (const name of ['once', 'stop', 'speak', 'stopspeaking', 'ding', 'status', 'locales', 'voices']) ipcMain.handle('voice:' + name, (_e, arg) => botCall(name, arg));
ipcMain.handle('prefs:get', () => { const p = store.load(); return { tray: p.tray, shortcut: p.shortcut, login: app.getLoginItemSettings().openAtLogin, bot: p.bot !== false, voice: p.voice, skin: p.skin, appearance: p.appearance }; });
ipcMain.handle('prefs:set', (_e, p) => { // saved to prefs.json; the bot notices within a couple of seconds and applies it
  const patch = {};
  if (typeof p.tray === 'boolean') patch.tray = p.tray;
  if (typeof p.shortcut === 'boolean') patch.shortcut = p.shortcut;
  if (typeof p.login === 'boolean') app.setLoginItemSettings({ openAtLogin: p.login, args: ['--bot'] }); // at login only the bot starts
  if (typeof p.bot === 'boolean' && p.botChanged === true) patch.bot = p.bot;
  if (p.voice && typeof p.voice === 'object') patch.voice = p.voice;
  if (typeof p.appearance === 'string' && ['neon', 'dark', 'light', 'auto'].includes(p.appearance)) patch.appearance = p.appearance;
  if (p.skin && typeof p.skin === 'object') patch.skin = { type: String(p.skin.type || 'classic').slice(0, 12), shell: String(p.skin.shell || '').slice(0, 7), accent: String(p.skin.accent || '').slice(0, 7), eye: String(p.skin.eye || '').slice(0, 7), craft: ['spacecraft','rocket','shuttle'].includes(p.skin.craft) ? p.skin.craft : 'none' };
  store.update(patch); return true;
});
// the bot-window calls are not for Desktop
for (const n of ['bot:expand', 'bot:dragstart']) ipcMain.handle(n, () => null);

/* ---------- lifecycle ---------- */
app.setAboutPanelOptions({ applicationName: 'Tulai Desktop', applicationVersion: require('./package.json').version, copyright: 'Tulai: the bridge between you and your company Claude' });
app.on('second-instance', (_e, argv) => { ensureBot(); handleArgs(argv); });
app.on('activate', showWindow);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { quitting = true; app.quit(); });
app.on('before-quit', (e) => {
  if (quitting) return;
  if (running > 0) { // don't silently kill chats that are still working
    e.preventDefault();
    const n = dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, { type: 'warning', buttons: ['Keep working', 'Quit anyway'], defaultId: 0, cancelId: 0, message: `${running} chat${running > 1 ? 's are' : ' is'} still working.`, detail: 'Quitting stops them. Close the window instead to let them finish in the background. The Tulai bot keeps running either way.' });
    if (n === 1) { quitting = true; app.quit(); }
    return;
  }
  quitting = true;
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.whenReady().then(() => {
  setInterval(meetingStealth, 4000); // hidden from the Dock and the top menu while a meeting is on
  buildMenu();
  if (process.platform === 'darwin' && app.dock) app.dock.setIcon(nativeImage.createFromBuffer(require('./icongen').appIcon(512)));
  ensureBot(); followBotVoice();
  setTimeout(() => { createWindow(); handleArgs(process.argv.slice(1).filter((a) => a.startsWith('--delegate=') || a.startsWith('--open-chat=') || a === '--stop-all')); }, 300);
});
