// The floating answer window during calls (like a call assistant): a small panel that stays on top of Teams, Zoom or Meet and shows Tulai's suggested answers.
// It is excluded from screen sharing and recordings (setContentProtection), so only you see it. Opens when meeting notes start, closes when they stop.
const { BrowserWindow, screen } = require('electron');
let win = null, port = 39393;
function open(p) {
  if (p) port = p; if (win && !win.isDestroyed()) { win.showInactive(); return win; }
  const a = screen.getPrimaryDisplay().workArea, W = 380, H = 420;
  win = new BrowserWindow({ width: W, height: H, x: a.x + a.width - W - 24, y: a.y + 40, frame: false, transparent: false, backgroundColor: '#10151f', resizable: true, minWidth: 300, minHeight: 220, alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, show: false, title: 'Tulai answers', webPreferences: { sandbox: true, contextIsolation: true } });
  win.setAlwaysOnTop(true, 'floating'); win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  try { win.setContentProtection(true); } catch {} // not visible to the people you share your screen with
  win.loadURL(`http://localhost:${port}/call.html`); win.once('ready-to-show', () => win.showInactive());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.on('closed', () => { win = null; });
  return win;
}
function close() { if (win && !win.isDestroyed()) win.close(); win = null; }
module.exports = { open, close, isOpen: () => !!(win && !win.isDestroyed()) };
