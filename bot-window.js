// The floating bot: a small always-on-top window you can drag anywhere. Click the orb to open a mini chat. Also the home of voice control.
const { BrowserWindow, screen, powerMonitor } = require('electron');
const path = require('path');

let shield = false; // while you are in a call or taking meeting notes, the bot window is hidden from screen sharing and recordings
let win = null, ctx = null, expanded = false, align = { right: false, bottom: false };
const ORB = 132, SIZES = [{ w: 392, h: 560 }, { w: 580, h: 760 }, { w: 780, h: 900 }]; let PANEL = { ...SIZES[0] }, sizeLevel = 0;
/** Chat size: compact, large or extra large (never bigger than the screen). */
function fit(level) { const a = screen.getPrimaryDisplay().workArea, s = SIZES[Math.max(0, Math.min(2, +level || 0))]; return { w: Math.min(s.w, a.width - 24), h: Math.min(s.h, a.height - 24) }; }

function workArea(b) { return screen.getDisplayMatching(b).workArea; }
function clampTo(b) { const a = workArea(b); return { x: Math.min(Math.max(b.x, a.x - 8), a.x + a.width - b.width + 8), y: Math.min(Math.max(b.y, a.y), a.y + a.height - b.height + 8), width: b.width, height: b.height }; }

function create(c) {
  ctx = c; if (win && !win.isDestroyed()) return win; sizeLevel = +(ctx.prefs && ctx.prefs.panelSize) || 0; PANEL = fit(sizeLevel);
  const p = ctx.prefs.botPos, a = screen.getPrimaryDisplay().workArea, pos = p && Number.isFinite(p.x) ? p : { x: a.x + a.width - ORB - 24, y: a.y + a.height - ORB - 60 };
  win = new BrowserWindow({ width: ORB, height: ORB, x: pos.x, y: pos.y, frame: false, transparent: true, hasShadow: false, resizable: false, movable: true, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, show: false, focusable: true, backgroundColor: '#00000000', title: 'Tulai bot', webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.setAlwaysOnTop(true, 'floating'); win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); if (shield) { try { win.setContentProtection(true); } catch {} }
  win.loadURL(`http://localhost:${ctx.port}/bot.html`); win.once('ready-to-show', () => { if (ctx.prefs.bot !== false) win.showInactive(); });
  win.on('closed', () => { win = null; expanded = false; });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  return win;
}
const alive = () => win && !win.isDestroyed();
function show() { if (!alive()) return create(ctx); win.showInactive(); }
function hide() { if (alive()) win.hide(); }
function toggle() { if (alive() && win.isVisible()) hide(); else show(); }
function focus() { if (!alive()) return; show(); win.focus(); }
function send(channel, ...a) { if (alive() && !win.webContents.isDestroyed()) win.webContents.send(channel, ...a); }

// Expanding keeps the orb where it is: the panel opens toward the side of the screen that has room.
function expand(on) {
  if (!alive()) return null; const b = win.getBounds(), a = workArea(b);
  if (on && !expanded) {
    const orbX = b.x, orbY = b.y; align = { right: orbX + PANEL.w > a.x + a.width, bottom: orbY + PANEL.h > a.y + a.height };
    const nb = { x: align.right ? orbX + ORB - PANEL.w : orbX, y: align.bottom ? orbY + ORB - PANEL.h : orbY, width: PANEL.w, height: PANEL.h };
    win.setResizable(true); win.setBounds(clampTo(nb)); win.setResizable(false); expanded = true;
  } else if (!on && expanded) {
    const orbX = align.right ? b.x + b.width - ORB : b.x, orbY = align.bottom ? b.y + b.height - ORB : b.y;
    win.setResizable(true); win.setBounds(clampTo({ x: orbX, y: orbY, width: ORB, height: ORB })); win.setResizable(false); expanded = false;
  }
  return { expanded, alignRight: align.right, alignBottom: align.bottom };
}
function setSize(level) {
  sizeLevel = Math.max(0, Math.min(2, +level || 0)); PANEL = fit(sizeLevel); if (ctx && ctx.prefs) ctx.prefs.panelSize = sizeLevel;
  if (alive() && expanded) { const b = win.getBounds(), orbX = align.right ? b.x + b.width - ORB : b.x, orbY = align.bottom ? b.y + b.height - ORB : b.y, a = workArea(b);
    align = { right: orbX + PANEL.w > a.x + a.width, bottom: orbY + PANEL.h > a.y + a.height }; win.setResizable(true); win.setBounds(clampTo({ x: align.right ? orbX + ORB - PANEL.w : orbX, y: align.bottom ? orbY + ORB - PANEL.h : orbY, width: PANEL.w, height: PANEL.h })); win.setResizable(false); }
  return { level: sizeLevel, alignRight: align.right, alignBottom: align.bottom };
}
function dragStart() { return alive() ? win.getBounds() : null; }
function dragMove(x, y) { if (alive()) win.setPosition(Math.round(x), Math.round(y)); }
function dragEnd() {
  if (!alive()) return; let b = win.getBounds(); const a = workArea(b);
  b = clampTo(b);
  if (!expanded) { const dl = b.x - a.x, dr = a.x + a.width - (b.x + b.width); if (dl < 40) b.x = a.x + 6; else if (dr < 40) b.x = a.x + a.width - b.width - 6; } // snap to a screen edge when released near it
  win.setBounds(b); if (!expanded) { ctx.prefs.botPos = { x: b.x, y: b.y }; ctx.savePrefs(); }
}

/* ---- presence: the bot notices you on the screen ----
   It looks at your mouse wherever it is, gets curious when you come near, falls asleep when you are away,
   waves when you are back, and now and then walks to another spot (even another display) while you work. */
let presTimer = null, lastCur = '', nearSince = 0, lastNear = 0, wasAway = false, nextRoam = 0, roaming = false, lastEmote = 0;
const emote = (move) => { send('voice:event', { type: 'perform', move }); lastEmote = Date.now(); };
function startPresence(getPrefs, busy) {
  if (presTimer) return; nextRoam = Date.now() + 60000;
  presTimer = setInterval(() => {
    if (!alive() || !win.isVisible()) return; const now = Date.now(), b = win.getBounds(), c = screen.getCursorScreenPoint();
    const dx = c.x - (b.x + b.width / 2), dy = c.y - (b.y + ORB / 2), key = Math.round(dx / 6) + ',' + Math.round(dy / 6);
    if (key !== lastCur) { lastCur = key; send('voice:event', { type: 'cursor', dx, dy }); }
    const dist = Math.hypot(dx, dy), idle = powerMonitor.getSystemIdleTime(), p = getPrefs() || {};
    if (!expanded && !roaming && !busy()) {
      if (dist < 70) { if (!nearSince) nearSince = now; if (now - nearSince > 1500 && now - lastNear > 45000 && now - lastEmote > 8000) { lastNear = now; emote(Math.random() < 0.5 ? 'giggle' : 'happy'); } } else nearSince = 0;
      if (idle > 300 && !wasAway) { wasAway = true; emote('sleep'); }
      if (idle < 5 && wasAway) { wasAway = false; emote('wave'); }
      if (p.roam !== false && idle < 90 && now > nextRoam) { nextRoam = now + (2 + Math.random() * 3) * 60000; roam(); }
    }
  }, 120);
}
const SPOTS = ['right', 'left', 'left-bottom', 'left-top', 'right-top', 'right-bottom']; let lastSpot = '';
function roam(spot) {
  if (!alive() || expanded) return; const displays = screen.getAllDisplays(), here = screen.getDisplayMatching(win.getBounds()), d = (displays.length > 1 && Math.random() < 0.3 ? displays[Math.floor(Math.random() * displays.length)] : here).workArea, b = win.getBounds();
  const pick = SPOTS.includes(spot) ? spot : (() => { const o = SPOTS.filter((s) => s !== lastSpot); return o[Math.floor(Math.random() * o.length)]; })(); lastSpot = pick;
  const L = d.x + 6, R = d.x + d.width - ORB - 6, T = d.y + 6, B = d.y + d.height - ORB - 6, M = Math.round(d.y + (d.height - ORB) / 2);
  const to = { right: { x: R, y: M }, left: { x: L, y: M }, 'left-bottom': { x: L, y: B }, 'left-top': { x: L, y: T }, 'right-top': { x: R, y: T }, 'right-bottom': { x: R, y: B } }[pick]; if (!to || ![to.x, to.y, b.x, b.y].every(Number.isFinite)) return;
  roaming = true; const from = { x: b.x, y: b.y }, steps = 60; let i = 0; emote('jump');
  const tm = setInterval(() => { if (!alive() || expanded) { clearInterval(tm); roaming = false; return; } i++; const k = i / steps, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; const px = Math.round(from.x + (to.x - from.x) * e), py = Math.round(from.y + (to.y - from.y) * e - Math.sin(Math.PI * k) * 40); if (!Number.isFinite(px) || !Number.isFinite(py)) { clearInterval(tm); roaming = false; return; } try { win.setPosition(px, py); } catch { clearInterval(tm); roaming = false; return; } if (i >= steps) { clearInterval(tm); roaming = false; emote(pick.includes('top') ? 'wave' : 'happy'); } }, 24);
}
/** Hide (true) or show (false) the bot window in screen sharing, screenshots and recordings. You still see it. */
function protect(on) { on = !!on; if (on === shield) return shield; shield = on; if (alive()) { try { win.setContentProtection(on); } catch {} } return shield; }
module.exports = { protect, protectedNow: () => shield, setSize, startPresence, roam,  create, show, hide, toggle, focus, send, expand, dragStart, dragMove, dragEnd, visible: () => alive() && win.isVisible(), window: () => win };
