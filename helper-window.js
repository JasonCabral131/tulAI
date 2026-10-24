// The helper bot's little window: pops up next to Tulai Bot while the helper works, floats on top, and closes after it waves bye-bye.
// Hidden from screen sharing like the bot during calls (it shows your code). It reads its state from /api/bot/helper.
const { BrowserWindow, screen } = require('electron');
let win = null, port = 39393;
function open(p, near) {
  if (p) port = p; if (win && !win.isDestroyed()) { win.showInactive(); return win; }
  const a = screen.getPrimaryDisplay().workArea, W = 240, H = 300;
  let x = a.x + a.width - W - 260, y = a.y + a.height - H - 40; if (near) { x = Math.max(a.x, near.x - W - 10); y = Math.min(Math.max(a.y, near.y + near.height - H), a.y + a.height - H); }
  win = new BrowserWindow({ width: W, height: H, x, y, frame: false, transparent: true, hasShadow: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, focusable: true, movable: true, show: false, title: 'Tulai helper', webPreferences: { sandbox: true, contextIsolation: true } });
  win.setAlwaysOnTop(true, 'floating'); win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  try { win.setContentProtection(true); } catch {}
  win.loadURL(`http://localhost:${port}/helper.html`); win.once('ready-to-show', () => win.showInactive()); win.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); win.on('closed', () => { win = null; });
  return win;
}
function close() { if (win && !win.isDestroyed()) win.close(); win = null; }
module.exports = { open, close, isOpen: () => !!(win && !win.isDestroyed()) };
