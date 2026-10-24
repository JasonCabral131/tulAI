// Live browser: a real Chromium view embedded in the Tulai window that Claude (and you) can drive and inspect.
// Runs in the Electron main process. Uses the DevTools protocol for emulation, network and screenshots.
let electron = null;
try { const e = require('electron'); if (e && e.WebContentsView) electron = e; } catch {}
const shots = require('./shots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let view = null, wc = null, win = null, getInsecure = () => false;
const st = { host: { x: 0, y: 0, width: 0, height: 0 }, visible: false, device: 'desktop', agent: false, custom: null };
const logs = [], reqs = new Map(); let reqSeq = 0;
const DEVICES = { desktop: null, tablet: shots.PRESETS.tablet, phone: shots.PRESETS.iphone, iphone: shots.PRESETS.iphone, android: shots.PRESETS.android };
const WELCOME = 'data:text/html;charset=utf-8,' + encodeURIComponent('<body style="font:15px -apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#777;background:#fafafa"><div style="text-align:center"><div style="font-size:40px">🌉</div><p>Tulai browser<br><small>Tulai can open and inspect pages here. You can use it too.</small></p></div></body>');

const pushState = () => { if (win && !win.isDestroyed() && wc && !wc.isDestroyed()) win.webContents.send('browser:state', { url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), back: wc.navigationHistory.canGoBack(), forward: wc.navigationHistory.canGoForward(), agent: st.agent, device: st.device }); };
const isLocal = (u) => { try { const h = new URL(u).hostname; return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.localhost') || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h.endsWith('.local'); } catch { return false; } };
const normUrl = (u) => { u = String(u || '').trim(); if (!u) throw new Error('url is required'); if (u === 'about:blank') return u; if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = (/^(localhost|127\.|\[::1\]|\d+\.\d+\.\d+\.\d+)/.test(u) ? 'http://' : 'https://') + u; if (!/^https?:/i.test(u)) throw new Error('Only http(s) addresses can be opened'); return u; };

function init(hostWin, opts = {}) {
  if (!electron) return; win = hostWin; getInsecure = opts.insecure || (() => false);
  if (view) return;
  view = new electron.WebContentsView({ webPreferences: { partition: 'persist:tulay-browser', sandbox: true, contextIsolation: true, backgroundThrottling: false } });
  win.contentView.addChildView(view); wc = view.webContents; view.setBackgroundColor('#ffffff');
  const sess = wc.session; sess.setPermissionRequestHandler((_w, _p, cb) => cb(false)); sess.setCertificateVerifyProc((_r, cb) => cb(getInsecure() ? 0 : -3));
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) wc.loadURL(url).catch(() => {}); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!/^(https?:|about:|data:)/i.test(url)) e.preventDefault(); });
  for (const ev of ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading']) wc.on(ev, pushState);
  wc.on('console-message', (_e, level, message, line, source) => { if (/Electron Security Warning/.test(String(message))) return; logs.push({ t: Date.now(), level: ['debug', 'log', 'warning', 'error'][level] || 'log', message: String(message).slice(0, 600), at: `${String(source || '').split('/').pop()}:${line}` }); if (logs.length > 300) logs.shift(); });
  wc.on('did-start-navigation', (_e, _u, inPlace, main) => { if (main && !inPlace) logs.length = 0; });
  try { // network log through the DevTools protocol
    wc.debugger.attach('1.3'); wc.debugger.sendCommand('Network.enable').catch(() => {});
    wc.debugger.on('message', (_e, method, p) => {
      if (method === 'Network.requestWillBeSent') { reqs.set(p.requestId, { id: ++reqSeq, rid: p.requestId, method: p.request.method, url: p.request.url, type: p.type, t: Date.now() }); if (reqs.size > 400) reqs.delete(reqs.keys().next().value); }
      else if (method === 'Network.responseReceived') { const r = reqs.get(p.requestId); if (r) { r.status = p.response.status; r.mime = p.response.mimeType; r.fromCache = p.response.fromDiskCache || p.response.fromServiceWorker; } }
      else if (method === 'Network.loadingFinished') { const r = reqs.get(p.requestId); if (r) { r.ms = Date.now() - r.t; r.size = p.encodedDataLength; } }
      else if (method === 'Network.loadingFailed') { const r = reqs.get(p.requestId); if (r) { r.failed = p.errorText; r.ms = Date.now() - r.t; } }
    });
  } catch {}
  try { wc.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {}); } catch {}
  wc.loadURL(WELCOME).catch(() => {}); applyBounds();
  win.on('closed', () => { view = null; wc = null; win = null; });
}

/* ---------- layout (the page reports where the browser pane sits) ---------- */
function applyBounds() {
  if (!view) return; const h = st.host, d = DEVICES[st.device] || st.custom;
  if (!st.visible || h.width < 20 || h.height < 20) { const w = d ? d.w : 1280, hh = d ? d.h : 800; return view.setBounds({ x: -6000, y: 0, width: w, height: hh }); } // kept alive offscreen so screenshots still work
  const width = d ? Math.min(d.w, h.width) : h.width, height = d ? Math.min(d.h, h.height) : h.height;
  view.setBounds({ x: Math.round(h.x + (h.width - width) / 2), y: Math.round(h.y), width: Math.round(width), height: Math.round(height) });
}
function setHost(rect) { st.host = { x: rect.x || 0, y: rect.y || 0, width: rect.width || 0, height: rect.height || 0 }; st.visible = !!rect.visible; applyBounds(); }

/* ---------- helpers ---------- */
/** Tulai Bot has no Browser tab: it gets its own browser window the first time it browses (you can watch it and take over; sign-ins persist). */
function ownWindow() {
  if (!electron || process.env.TULAI_ROLE !== 'bot' || (view && wc && !wc.isDestroyed())) return;
  const { BrowserWindow, screen } = electron, a = screen.getPrimaryDisplay().workArea, W = Math.min(1180, a.width - 80), H = Math.min(820, a.height - 80);
  const w = new BrowserWindow({ width: W, height: H, x: a.x + 40, y: a.y + 40, title: 'Tulai Bot · browser', show: false, backgroundColor: '#ffffff', webPreferences: { sandbox: true, contextIsolation: true } });
  const BAR = 34; // a title strip you can drag (the page below it fills the rest)
  w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<body style="margin:0;background:#10151f;color:#cfd8e3;font:12.5px -apple-system,system-ui,sans-serif"><div style="-webkit-app-region:drag;height:${BAR}px;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #2a3550;user-select:none">🤖 Tulai Bot · browser <span style="opacity:.6;margin-left:8px">(drag here to move)</span></div></body>`));
  view = null; init(w, { insecure: getInsecure });
  const fit = () => { if (w.isDestroyed()) return; const [cw, ch] = w.getContentSize(); setHost({ x: 0, y: BAR, width: cw, height: ch - BAR, visible: true }); };
  w.on('resize', fit); w.on('closed', () => { view = null; wc = null; win = null; st.visible = false; }); fit(); w.showInactive();
}
const need = () => { if (!electron) throw new Error('The live browser needs the Tulai desktop app.'); ownWindow(); if (!view || !wc || wc.isDestroyed()) throw new Error('The browser is not ready yet. Open the Browser tab once and retry.'); };
const cdp = (m, p) => wc.debugger.sendCommand(m, p || {});
const ev = (code) => wc.executeJavaScript(code, true);
async function settle(ms = 15000) {
  const t0 = Date.now(); await sleep(150);
  while (wc.isLoading() && Date.now() - t0 < ms) await sleep(100);
  await sleep(350);
}
async function setDevice(name, w, h) {
  const d = name === 'custom' ? { w: Math.round(w), h: Math.round(h), dpr: 2, mobile: true, ua: shots.PRESETS.iphone.ua } : DEVICES[name];
  if (name !== 'custom' && !(name in DEVICES)) throw new Error('device must be desktop, tablet, phone, android, or custom with width and height');
  st.device = name === 'custom' ? 'custom' : name; st.custom = name === 'custom' ? d : null; applyBounds();
  if (!d) { await cdp('Emulation.clearDeviceMetricsOverride'); await cdp('Emulation.setUserAgentOverride', { userAgent: '' }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: false }); }
  else { await cdp('Emulation.setDeviceMetricsOverride', { width: d.w, height: d.h, deviceScaleFactor: d.dpr || 2, mobile: !!d.mobile }); await cdp('Emulation.setUserAgentOverride', { userAgent: d.ua || '' }); await cdp('Emulation.setTouchEmulationEnabled', { enabled: !!d.mobile, maxTouchPoints: 5 }); }
  pushState(); return d ? `${d.w}×${d.h}` : 'desktop';
}
const CURSOR = (x, y) => `(()=>{let c=document.getElementById('__tulay_cur');if(!c){c=document.createElement('div');c.id='__tulay_cur';c.style.cssText='position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .3s;opacity:0';c.innerHTML='<svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-3 6z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';document.documentElement.appendChild(c)}c.style.opacity=1;c.style.transform='translate(${x}px,${y}px)';const r=document.createElement('div');r.style.cssText='position:fixed;left:${x - 14}px;top:${y - 14}px;width:28px;height:28px;border-radius:50%;border:2px solid #c15f3c;z-index:2147483646;pointer-events:none;transition:transform .5s,opacity .5s;opacity:.9';document.documentElement.appendChild(r);requestAnimationFrame(()=>{r.style.transform='scale(2.2)';r.style.opacity=0});setTimeout(()=>{r.remove();c.style.opacity=0},1300)})()`;
const DESCRIBE = `(el)=>{const t=(el.innerText||el.value||el.getAttribute('aria-label')||el.placeholder||el.title||'').trim().replace(/\\s+/g,' ').slice(0,60);return el.tagName.toLowerCase()+(t?' "'+t+'"':'')}`;
async function pointOf(a) {
  if (a.ref || a.selector) {
    const sel = a.ref ? `[data-tulay-ref="${String(a.ref).replace(/[^\w-]/g, '')}"]` : a.selector;
    const r = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return null;el.scrollIntoView({block:'center',inline:'center'});const b=el.getBoundingClientRect();return{x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),d:(${DESCRIBE})(el),disabled:!!el.disabled}})()`);
    if (!r) throw new Error(`No element for ${a.ref ? 'ref ' + a.ref : 'selector ' + a.selector}. Run action "read" again to get fresh refs.`);
    return r;
  }
  if (typeof a.x === 'number' && typeof a.y === 'number') return { x: Math.round(a.x), y: Math.round(a.y), d: `point (${a.x}, ${a.y})` };
  throw new Error('Give a ref (from "read"), a CSS selector, or x and y.');
}
const VK = { enter: [13, 'Enter', '\r'], return: [13, 'Enter', '\r'], tab: [9, 'Tab'], escape: [27, 'Escape'], esc: [27, 'Escape'], backspace: [8, 'Backspace'], delete: [46, 'Delete'], arrowup: [38, 'ArrowUp'], up: [38, 'ArrowUp'], arrowdown: [40, 'ArrowDown'], down: [40, 'ArrowDown'], arrowleft: [37, 'ArrowLeft'], left: [37, 'ArrowLeft'], arrowright: [39, 'ArrowRight'], right: [39, 'ArrowRight'], home: [36, 'Home'], end: [35, 'End'], pageup: [33, 'PageUp'], pagedown: [34, 'PageDown'], space: [32, ' ', ' '] };
// Input goes through the DevTools protocol so it works even when the window is not focused or is in the background.
async function mouse(x, y, kind, button = 'left', clicks = 1) {
  await cdp('Input.dispatchMouseEvent', { type: kind, x, y, button: kind === 'mouseMoved' ? 'none' : button, clickCount: clicks, buttons: kind === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0 });
}
async function clickAt(x, y, button = 'left', clicks = 1) {
  await mouse(x, y, 'mouseMoved'); await mouse(x, y, 'mousePressed', button, clicks); await mouse(x, y, 'mouseReleased', button, clicks);
  if (clicks === 2) { await mouse(x, y, 'mousePressed', button, 2); await mouse(x, y, 'mouseReleased', button, 2); }
}
async function press(combo) {
  const parts = String(combo).split('+').map((s) => s.trim()), key = parts.pop(), lk = key.toLowerCase();
  const mods = parts.reduce((m, p) => m | ({ alt: 1, option: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, command: 4, shift: 8 }[p.toLowerCase()] || 0), 0);
  const [vk, name, text] = VK[lk] || [key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0, key, key.length === 1 ? key : undefined];
  const typed = text !== undefined && !(mods & 6); // ctrl or meta combos are shortcuts, not text
  await cdp('Input.dispatchKeyEvent', { type: typed ? 'keyDown' : 'rawKeyDown', key: name, code: name.length === 1 ? 'Key' + name.toUpperCase() : name, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods, text: typed ? text : undefined, unmodifiedText: typed ? text : undefined, commands: mods & 4 && lk === 'a' ? ['selectAll'] : mods & 4 && lk === 'c' ? ['copy'] : mods & 4 && lk === 'v' ? ['paste'] : mods & 4 && lk === 'x' ? ['cut'] : undefined });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name.length === 1 ? 'Key' + name.toUpperCase() : name, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods });
}
const READ_SCRIPT = `(()=>{const vis=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'&&r.bottom>=0&&r.top<Math.max(innerHeight,800)*4};window.__tr=window.__tr||0;const out=[];
document.querySelectorAll('a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[role=switch],[onclick],[contenteditable=true]').forEach(e=>{if(!vis(e)||out.length>=150)return;let id=e.getAttribute('data-tulay-ref');if(!id){id='r'+(++window.__tr);e.setAttribute('data-tulay-ref',id)}const b=e.getBoundingClientRect();const tag=e.tagName.toLowerCase();const label=(e.innerText||e.getAttribute('aria-label')||e.placeholder||e.title||e.name||'').trim().replace(/\\s+/g,' ').slice(0,70);out.push({ref:id,tag,role:e.getAttribute('role')||'',type:e.type||'',label,value:(tag==='input'&&e.type!=='password')?String(e.value||'').slice(0,40):'',href:e.href?String(e.href).slice(0,90):'',x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),off:b.top>innerHeight||b.bottom<0,disabled:!!e.disabled,checked:e.checked===true})});
return{url:location.href,title:document.title,vw:innerWidth,vh:innerHeight,scrollY:Math.round(scrollY),pageH:document.documentElement.scrollHeight,text:(document.body?document.body.innerText:'').replace(/\\n{3,}/g,'\\n\\n').slice(0,__MAX__),items:out}})()`;

/* ---------- make sure the page can actually render ---------- */
async function ensureShown() {
  if (st.visible && st.host.width > 20 && st.host.height > 60) return;
  if (win && !win.isDestroyed()) win.webContents.send('browser:open'); // ask the window to open the Browser tab and report where it sits
  for (let i = 0; i < 12 && !(st.visible && st.host.width > 20 && st.host.height > 60); i++) await sleep(200);
  if (!(st.visible && st.host.width > 20 && st.host.height > 60) && win && !win.isDestroyed()) { const [w, h] = win.getContentSize(); setHost({ x: 0, y: 0, width: w, height: h, visible: true }); } // fallback: cover the window
}

/* ---------- the tool ---------- */
async function run(a, ctx = {}) {
  need(); const action = String(a.action || '').toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim(); // "open(url)" / "click(ref)" from the tool description mean open / click st.agent = true; pushState();
  if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive(); // a hidden window cannot render; show it without stealing focus
  ctx.ui && ctx.ui({ type: 'browser', action });
  await ensureShown();
  const res = { text: '', shots: [] };
  try {
    switch (action) {
      case 'open': case 'navigate': case 'goto': {
        const url = normUrl(a.url); await wc.loadURL(url).catch((e) => { if (!/ERR_ABORTED/.test(String(e))) throw e; }); await settle(); res.text = `Opened ${wc.getURL()} — "${wc.getTitle()}"`; break;
      }
      case 'back': wc.navigationHistory.goBack(); await settle(); res.text = `Back to ${wc.getURL()}`; break;
      case 'forward': wc.navigationHistory.goForward(); await settle(); res.text = `Forward to ${wc.getURL()}`; break;
      case 'reload': wc.reload(); await settle(); res.text = `Reloaded ${wc.getURL()}`; break;
      case 'wait': {
        const t0 = Date.now(), ms = Math.min(+a.wait_ms || 1000, 30000);
        if (a.until_text) { while (Date.now() - t0 < ms) { if (await ev(`document.body&&document.body.innerText.includes(${JSON.stringify(String(a.until_text))})`)) break; await sleep(250); } res.text = (await ev(`document.body&&document.body.innerText.includes(${JSON.stringify(String(a.until_text))})`)) ? `Text "${a.until_text}" appeared after ${Date.now() - t0}ms` : `Text "${a.until_text}" did not appear within ${ms}ms`; }
        else { await sleep(ms); res.text = `Waited ${ms}ms`; } break;
      }
      case 'read': case 'snapshot': {
        const r = await ev(READ_SCRIPT.replace('__MAX__', String(Math.min(+a.max_chars || 3500, 12000))));
        res.text = `URL: ${r.url}\nTitle: ${r.title}\nViewport: ${r.vw}×${r.vh}, scrolled ${r.scrollY}px of ${r.pageH}px\n\nInteractive elements (use ref with click/type; coordinates are viewport pixels):\n` + (r.items.map((i) => `[${i.ref}] ${i.role || i.tag}${i.type && i.type !== 'submit' && i.tag === 'input' ? ':' + i.type : ''} ${i.label ? '"' + i.label + '"' : ''}${i.value ? ' value="' + i.value + '"' : ''}${i.href ? ' → ' + i.href : ''} @(${i.x},${i.y})${i.off ? ' [off-screen]' : ''}${i.disabled ? ' [disabled]' : ''}${i.checked ? ' [checked]' : ''}`).join('\n') || '(none)') + `\n\nVisible page text:\n${r.text}`; break;
      }
      case 'screenshot': {
        const p = { format: 'png', fromSurface: true }; if (a.full_page) p.captureBeyondViewport = true;
        const r = await cdp('Page.captureScreenshot', p); const saved = await shots.saveShot(Buffer.from(r.data, 'base64'));
        res.shots.push(saved.id); res.text = `Screenshot of ${wc.getURL()} (${saved.width}×${saved.height}${a.full_page ? ', full page' : ''}${st.device !== 'desktop' ? ', emulating ' + st.device : ''}). The image is attached in the next message.`; break;
      }
      case 'click': case 'double_click': case 'right_click': case 'hover': {
        const p = await pointOf(a); if (p.disabled) throw new Error(`${p.d} is disabled.`);
        await ev(CURSOR(p.x, p.y)); await sleep(380); const before = wc.getURL();
        if (action === 'hover') await mouse(p.x, p.y, 'mouseMoved'); else await clickAt(p.x, p.y, action === 'right_click' ? 'right' : 'left', action === 'double_click' ? 2 : 1);
        await settle(8000); res.text = `${action === 'hover' ? 'Hovered' : action === 'right_click' ? 'Right-clicked' : action === 'double_click' ? 'Double-clicked' : 'Clicked'} ${p.d} at (${p.x}, ${p.y})` + (wc.getURL() !== before ? `. Page is now ${wc.getURL()} — "${wc.getTitle()}"` : ''); break;
      }
      case 'type': {
        if (a.ref || a.selector) { const p = await pointOf(a); await ev(CURSOR(p.x, p.y)); await sleep(300); await clickAt(p.x, p.y); await sleep(120); }
        if (a.clear) { await ev('(()=>{const e=document.activeElement;if(e&&e.select)e.select();else document.execCommand("selectAll")})()'); await sleep(60); await press('Backspace'); }
        if (a.text !== undefined) await cdp('Input.insertText', { text: String(a.text) });
        if (a.submit) { await sleep(120); await press('Enter'); await settle(8000); }
        res.text = `Typed ${JSON.stringify(String(a.text ?? '').slice(0, 60))}${a.submit ? ' and pressed Enter' : ''}`; break;
      }
      case 'press': await press(a.key || a.text); await settle(2500); res.text = `Pressed ${a.key || a.text}`; break;
      case 'scroll': {
        if (a.ref || a.selector) { const p = await pointOf(a); res.text = `Scrolled to ${p.d}`; break; }
        const amt = Math.min(Math.abs(+a.amount || 600), 5000), dir = String(a.direction || 'down').toLowerCase(), dy = dir === 'up' ? -amt : dir === 'down' ? amt : 0, dx = dir === 'left' ? -amt : dir === 'right' ? amt : 0;
        await ev(`window.scrollBy(${dx},${dy})`); await sleep(300); res.text = `Scrolled ${dir} ${amt}px; now at ${await ev('Math.round(scrollY)')}px`; break;
      }
      case 'eval': { const v = await ev(String(a.expression || a.text || 'null')); let s; try { s = JSON.stringify(v, null, 1); } catch { s = String(v); } res.text = `Result: ${String(s).slice(0, 8000)}`; break; }
      case 'console': {
        const lv = a.level ? String(a.level).toLowerCase() : null, list = logs.filter((l) => !lv || l.level === lv || (lv === 'error' && l.level === 'error'));
        res.text = list.length ? list.slice(-60).map((l) => `[${l.level}] ${l.message}  (${l.at})`).join('\n') : 'No console messages' + (lv ? ` at level ${lv}` : ''); if (a.clear) logs.length = 0; break;
      }
      case 'network': {
        let list = [...reqs.values()]; list = list.filter((r) => !/^data:/.test(r.url) && !/ERR_ABORTED/.test(r.failed || '')); if (a.filter) list = list.filter((r) => r.url.includes(String(a.filter))); if (a.failed_only) list = list.filter((r) => r.failed || r.status >= 400);
        res.text = list.length ? list.slice(-50).map((r) => `#${r.id} ${r.method} ${r.status || (r.failed ? 'FAILED' : '…')} ${r.type || ''} ${r.url.slice(0, 120)}${r.failed ? ' — ' + r.failed : ''}${r.ms != null ? ` (${r.ms}ms)` : ''}`).join('\n') + '\n(use action "response" with id to read a response body)' : 'No matching requests'; break;
      }
      case 'response': {
        const r = [...reqs.values()].find((x) => x.id === +a.id); if (!r) throw new Error(`No request #${a.id}`);
        const b = await cdp('Network.getResponseBody', { requestId: r.rid }); res.text = `#${r.id} ${r.method} ${r.url} → ${r.status}\n` + (b.base64Encoded ? '(binary body)' : String(b.body).slice(0, 8000)); break;
      }
      case 'device': res.text = `Browser now emulates ${await setDevice(String(a.device || 'desktop').toLowerCase(), a.width, a.height)}`; await sleep(300); break;
      default: throw new Error(`Unknown browser action "${a.action}". Actions: open, back, forward, reload, wait, read, screenshot, click, double_click, right_click, hover, type, press, scroll, eval, console, network, response, device.`);
    }
    return res;
  } finally { st.agent = false; pushState(); }
}

/* ---------- commands from the toolbar (the person, not Claude) ---------- */
async function userCmd(c) {
  need();
  switch (c.cmd) {
    case 'go': { await wc.loadURL(normUrl(c.url)).catch((e) => { if (!/ERR_ABORTED/.test(String(e))) throw e; }); break; }
    case 'back': wc.navigationHistory.goBack(); break; case 'forward': wc.navigationHistory.goForward(); break; case 'reload': wc.reload(); break;
    case 'device': await setDevice(c.device, c.width, c.height); break;
    case 'devtools': wc.openDevTools({ mode: 'detach' }); break;
    case 'screenshot': { const r = await cdp('Page.captureScreenshot', { format: 'png', fromSurface: true }); return await shots.saveShot(Buffer.from(r.data, 'base64')); }
  }
  pushState(); return { ok: true };
}
module.exports = { init, setHost, run, userCmd, isLocal, normUrl, available: () => !!electron };
