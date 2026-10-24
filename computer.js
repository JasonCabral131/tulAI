// Whole-Mac control: Claude can look at the screen and use any app with the mouse and keyboard.
// Needs two macOS permissions for Tulai: Screen Recording (to see) and Accessibility (to click and type).
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const shots = require('./shots');

const DRY = process.env.TULAY_COMPUTER_DRY === '1'; // tests only: log what would happen instead of touching the Mac
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dryLog = [];
let lastAction = 0, killedUntil = 0, screen = null; // screen: { pw, ph, iw, ih } points vs the image Claude was shown
const DEFAULT_DENY = ['Keychain Access', '1Password', '1Password 7', 'Bitwarden', 'LastPass', 'Dashlane', 'Passwords', 'System Settings', 'System Preferences', 'Terminal', 'iTerm2', 'iTerm', 'Script Editor', 'Activity Monitor'];

function sh(cmd, args, timeout = 20000, opts = {}) {
  return new Promise((resolve, reject) => { const p = execFile(cmd, args, { timeout, maxBuffer: 20e6, ...opts }, (e, so, se) => (e ? reject(new Error(String(se || e.message).trim().slice(0, 300))) : resolve(String(so).trim()))); p.stdin && p.stdin.end(); });
}
const osa = (script, jxa) => (DRY ? (dryLog.push(`${jxa ? 'JXA' : 'AppleScript'}: ${script.replace(/\s+/g, ' ').slice(0, 160)}`), Promise.resolve('')) : sh('/usr/bin/osascript', [...(jxa ? ['-l', 'JavaScript'] : []), '-e', script]));

async function logicalSize() {
  if (DRY) return { w: 1512, h: 982 };
  try { const { screen: s } = require('electron'); if (s && s.getPrimaryDisplay) { const z = s.getPrimaryDisplay().size; return { w: z.width, h: z.height }; } } catch {}
  const r = await osa('tell application "Finder" to get bounds of window of desktop'); const n = r.split(',').map((x) => +x.trim()); return { w: n[2], h: n[3] };
}
async function frontmost() { if (DRY) return process.env.TULAY_FAKE_FRONT || 'Safari'; return osa('tell application "System Events" to get name of first process whose frontmost is true'); }
const trusted = async () => (DRY ? true : (await osa("ObjC.import('ApplicationServices'); $.AXIsProcessTrusted() ? 'yes' : 'no'", true)) === 'yes');

async function guard(cfg, input) {
  if (Date.now() < killedUntil) throw new Error('Stopped by the emergency stop. Try again in a moment.');
  const wait = 450 - (Date.now() - lastAction); if (wait > 0) await sleep(wait); // a short pause between actions so you can step in
  const deny = (cfg && cfg.computerDenyApps && cfg.computerDenyApps.length ? cfg.computerDenyApps : DEFAULT_DENY).map((x) => x.toLowerCase());
  const app = await frontmost();
  if (deny.includes(String(app).toLowerCase())) throw new Error(`Blocked: ${app} is on your protected apps list. Use another approach (for terminal work, use the bash tool).`);
  if (input && !(await trusted())) throw new Error('Tulai does not have Accessibility permission yet. Turn it on in System Settings → Privacy & Security → Accessibility (Settings → Mac control has a shortcut).');
  lastAction = Date.now(); return app;
}
const MOUSE = (kind, x, y, extra = '') => `ObjC.import('ApplicationServices'); const p={x:${x},y:${y}}; function ev(t,b,c){ const e=$.CGEventCreateMouseEvent($(),t,p,b); if(c) $.CGEventSetIntegerValueField(e,$.kCGMouseEventClickState,c); $.CGEventPost($.kCGHIDEventTap,e); } ${kind}`;
const click = (x, y, btn, n) => { const d = btn === 'right' ? 3 : 1, u = btn === 'right' ? 4 : 2, b = btn === 'right' ? 1 : 0; return MOUSE(`ev(5,0); delay(0.05); for (let i=1;i<=${n};i++){ ev(${d},${b},i); delay(0.03); ev(${u},${b},i); delay(0.06); }`, x, y); };

const KEYCODES = { return: 36, enter: 36, tab: 48, space: 49, delete: 51, backspace: 51, escape: 53, esc: 53, left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121, forwarddelete: 117 };
function keyScript(combo) {
  const parts = String(combo).split('+').map((s) => s.trim()), key = parts.pop(), mods = parts.map((m) => ({ cmd: 'command', command: 'command', meta: 'command', ctrl: 'control', control: 'control', alt: 'option', option: 'option', shift: 'shift' }[m.toLowerCase()])).filter(Boolean);
  const using = mods.length ? ` using {${mods.map((m) => m + ' down').join(', ')}}` : '', code = KEYCODES[key.toLowerCase()];
  return `tell application "System Events" to ${code !== undefined ? `key code ${code}` : `keystroke "${key.replace(/["\\]/g, '\\$&')}"`}${using}`;
}
const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const toPoint = (v, axis) => { const sc = screen ? (axis === 'x' ? screen.pw / screen.iw : screen.ph / screen.ih) : 1; return Math.round(Number(v) * sc); };

async function capture(cfg) {
  const f = path.join(os.tmpdir(), 'tulay-screen-' + Date.now() + '.png');
  if (DRY) { dryLog.push('screencapture'); fs.writeFileSync(f, require('./icongen').appIcon(256)); } else await sh('/usr/sbin/screencapture', ['-x', '-t', 'png', f]).catch((e) => { throw new Error(/could not create image/i.test(e.message) ? 'Tulai cannot see the screen yet. Turn on Screen Recording for Tulai in System Settings → Privacy & Security → Screen & System Audio Recording, then restart Tulai.' : e.message); });
  const { w, h } = await logicalSize(); try { if (!DRY) await sh('/usr/bin/sips', ['-z', String(h), String(w), f]); } catch {} // retina pixels -> points, so positions in the picture are real positions
  const raw = fs.readFileSync(f); fs.rmSync(f, { force: true }); const sv = await shots.saveShot(raw); screen = { pw: w, ph: h, iw: sv.width, ih: sv.height }; return sv;
}

async function run(a, ctx = {}) {
  if (require('./sandbox').would('computer ' + JSON.stringify(a).slice(0, 120))) return { text: 'Done (self-test: nothing was touched).', shots: [] }; // a self-test never controls your Mac
  const action = String(a.action || '').toLowerCase(), cfg = ctx.cfg || {}, res = { text: '', shots: [] };
  const done = (t) => { res.text = t; return res; };
  switch (action) {
    case 'screenshot': { const front = await frontmost().catch(() => '?'); const sv = await capture(cfg); res.shots.push(sv.id); return done(`Screenshot of the main display (${screen.pw}×${screen.ph} points; frontmost app: ${front}). The image is attached in the next message; use pixel positions from it for clicks.`); }
    case 'frontmost': return done(`Frontmost app: ${await frontmost()}`);
    case 'wait': await sleep(Math.min(+a.wait_ms || 1000, 15000)); return done(`Waited ${Math.min(+a.wait_ms || 1000, 15000)}ms`);
    case 'open_app': {
      const name = String(a.name || '').trim(); if (!name) throw new Error('name is required');
      const deny = (cfg.computerDenyApps && cfg.computerDenyApps.length ? cfg.computerDenyApps : DEFAULT_DENY).map((x) => x.toLowerCase()); if (deny.includes(name.toLowerCase())) throw new Error(`Blocked: ${name} is on your protected apps list.`);
      await guard(cfg, false); if (DRY) dryLog.push('open -a ' + name); else await sh('/usr/bin/open', ['-a', name]); await sleep(DRY ? 0 : 1500); return done(`Opened ${name}. Take a screenshot to see it.`);
    }
    case 'click': case 'double_click': case 'right_click': case 'move': {
      const x = toPoint(a.x, 'x'), y = toPoint(a.y, 'y'); if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('x and y are required');
      const app = await guard(cfg, true); await osa(action === 'move' ? MOUSE('ev(5,0);', x, y) : click(x, y, action === 'right_click' ? 'right' : 'left', action === 'double_click' ? 2 : 1), true);
      return done(`${action.replace('_', '-')} at (${x}, ${y}) in ${app}`);
    }
    case 'drag': {
      const x = toPoint(a.x, 'x'), y = toPoint(a.y, 'y'), x2 = toPoint(a.x2, 'x'), y2 = toPoint(a.y2, 'y'); const app = await guard(cfg, true);
      await osa(`ObjC.import('ApplicationServices'); function ev(t,x,y){ const e=$.CGEventCreateMouseEvent($(),t,{x:x,y:y},0); $.CGEventPost($.kCGHIDEventTap,e); } ev(5,${x},${y}); delay(0.05); ev(1,${x},${y}); for(let i=1;i<=12;i++){ delay(0.02); ev(6,${x}+(${x2}-${x})*i/12,${y}+(${y2}-${y})*i/12); } delay(0.05); ev(2,${x2},${y2});`, true);
      return done(`Dragged (${x}, ${y}) → (${x2}, ${y2}) in ${app}`);
    }
    case 'scroll': {
      const x = toPoint(a.x ?? (screen ? screen.iw / 2 : 400), 'x'), y = toPoint(a.y ?? (screen ? screen.ih / 2 : 400), 'y'), amt = Math.min(Math.abs(+a.amount || 5), 50), dir = String(a.direction || 'down').toLowerCase(), dy = dir === 'up' ? amt : dir === 'down' ? -amt : 0, dx = dir === 'left' ? amt : dir === 'right' ? -amt : 0; const app = await guard(cfg, true);
      await osa(`ObjC.import('ApplicationServices'); const p={x:${x},y:${y}}; $.CGEventPost($.kCGHIDEventTap,$.CGEventCreateMouseEvent($(),5,p,0)); delay(0.05); $.CGEventPost($.kCGHIDEventTap,$.CGEventCreateScrollWheelEvent2($(),$.kCGScrollEventUnitLine,2,${dy},${dx},0));`, true);
      return done(`Scrolled ${dir} ${amt} in ${app}`);
    }
    case 'type': {
      const t = String(a.text ?? ''); if (!t) throw new Error('text is required'); const app = await guard(cfg, true);
      if (t.length <= 80) await osa(`tell application "System Events" to keystroke "${esc(t)}"`);
      else { const old = DRY ? '' : await sh('/usr/bin/pbpaste').catch(() => ''); if (!DRY) await new Promise((r, j) => { const p = execFile('/usr/bin/pbcopy', (e) => (e ? j(e) : r())); p.stdin.end(t); }); await osa('tell application "System Events" to keystroke "v" using {command down}'); await sleep(DRY ? 0 : 400); if (!DRY) await new Promise((r) => { const p = execFile('/usr/bin/pbcopy', () => r()); p.stdin.end(old); }); }
      if (a.submit) await osa(keyScript('return'));
      return done(`Typed ${JSON.stringify(t.slice(0, 60))}${t.length > 60 ? '…' : ''}${a.submit ? ' and pressed Return' : ''} in ${app}`);
    }
    case 'key': { const app = await guard(cfg, true); await osa(keyScript(a.key || a.text)); return done(`Pressed ${a.key || a.text} in ${app}`); }
    default: throw new Error('action must be screenshot, click, double_click, right_click, move, drag, scroll, type, key, open_app, frontmost or wait');
  }
}
module.exports = { run, panic: () => { killedUntil = Date.now() + 3000; }, DEFAULT_DENY, keyScript, dryLog, _screen: () => screen };
