// The background browser: after you sign in to an account once (Settings, Accounts), Tulai can use that signed-in session out of sight to read what
// you could read there: your mail, calendar, chats and any page of that account. It looks, it does not click, type or send. Each account has its own
// session (webcal.partitionOf), so two Outlook accounts never mix. "Open Tulai's browser" shows the same session in a normal window.
const webcal = require('./webcal');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const electron = () => { try { return require('electron'); } catch { return null; } };
const cleanUrl = (v) => { const u = new URL(String(v)); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw new Error('Use an http(s) address without a password in it.'); return u.href; };
const sourceOf = (id) => webcal.state().sources.find((s) => s.id === id || s.name.toLowerCase() === String(id).toLowerCase());
/** Where a plain request ("my inbox", "my chats") goes in an account. */
function homeFor(src, what) {
  const o = (() => { try { return new URL(src.url).origin; } catch { return ''; } })();
  if (what === 'mail') return /google/i.test(o) || src.kind === 'google' ? 'https://mail.google.com/mail/u/0/#inbox' : o + '/mail/';
  if (what === 'calendar') return src.url;
  return src.url;
}
/** Types into the page's own search box and presses Enter (looking things up, nothing more), then waits for the results to settle. */
async function typeSearch(win, term, timeout) {
  const wc = win.webContents;
  const found = await wc.executeJavaScript(`(() => { const q = [...document.querySelectorAll('input')].filter((i) => i.offsetParent && /search/i.test((i.getAttribute('aria-label') || '') + (i.placeholder || '') + (i.type || '') + i.id)); const i = q[0]; if (!i) return false; i.focus(); i.select && i.select(); return true; })()`).catch(() => false);
  if (!found) return false;
  wc.insertText(term); await sleep(400); wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
  let last = -1, stable = 0; const t0 = Date.now(); await sleep(1500);
  while (Date.now() - t0 < timeout / 2) { await sleep(900); const n = await wc.executeJavaScript('document.body ? document.body.innerText.length : 0').catch(() => 0); if (n > 200 && n === last) { if (++stable >= 2) break; } else stable = 0; last = n; }
  return true;
}
let busy = new Set();
/** Reads one page as that account. Returns { ok, needsLogin, title, url, text, links, shot }. */
async function read(id, url, { timeout = 30000, search = '' } = {}) {
  const src = sourceOf(id); if (!src) throw new Error('I do not know that account. Add it in Settings, Accounts.');
  const E = electron(); if (!E || !E.BrowserWindow) throw new Error('The background browser only runs inside the Tulai Bot app.');
  const target = cleanUrl(url || src.url); if (busy.has(src.id)) throw new Error(`The ${src.name} browser is busy. Try again in a moment.`); busy.add(src.id);
  const win = new E.BrowserWindow({ show: false, width: 1300, height: 900, webPreferences: { partition: webcal.partitionOf(src), sandbox: true, backgroundThrottling: false } });
  try {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await Promise.race([win.loadURL(target).catch(() => {}), sleep(timeout)]);
    let last = -1, stable = 0; const t0 = Date.now();
    while (Date.now() - t0 < timeout) { // wait until the page has drawn and stopped changing
      await sleep(900); if (webcal.loginWall(win.webContents.getURL())) break;
      const n = await win.webContents.executeJavaScript('document.body ? document.body.innerText.length : 0').catch(() => 0);
      if (n > 200 && n === last) { if (++stable >= 2) break; } else stable = 0; last = n;
    }
    if (search && !webcal.loginWall(win.webContents.getURL())) await typeSearch(win, String(search).slice(0, 120), timeout);
    const now = win.webContents.getURL(), needsLogin = webcal.loginWall(now);
    const data = await win.webContents.executeJavaScript(`(() => ({ title: document.title, text: (document.body ? document.body.innerText : '').replace(/[ \\t]+\\n/g, '\\n').replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 14000), links: [...document.querySelectorAll('a[href]')].slice(0, 60).map((a) => ({ t: (a.innerText || a.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 90), h: a.href })).filter((x) => x.t && /^https?:/.test(x.h)) }))()`).catch(() => ({ title: '', text: '', links: [] }));
    const shot = await webcal.snap(win, src.id);
    return { ok: !needsLogin && data.text.length > 0, needsLogin, account: src.name, title: data.title, url: now, text: data.text, links: data.links, shot };
  } finally { busy.delete(src.id); try { win.destroy(); } catch {} }
}
/* ---------- one live browser per account: kept open, listed, inspected like Selenium would (through Chrome's DevTools protocol), read-only ---------- */
const LIVE = new Map(); // account id -> BrowserWindow
function live(src, { show = false, url } = {}) {
  const E = electron(); if (!E || !E.BrowserWindow) throw new Error('The background browser only runs inside the Tulai Bot app.');
  let win = LIVE.get(src.id);
  if (!win || win.isDestroyed()) {
    win = new E.BrowserWindow({ show: false, width: 1200, height: 860, title: `Tulai's browser · ${src.name}`, webPreferences: { partition: webcal.partitionOf(src), sandbox: true, backgroundThrottling: false } });
    win.webContents.setWindowOpenHandler(({ url: u }) => { try { win.loadURL(cleanUrl(u)); } catch {} return { action: 'deny' }; });
    win.on('page-title-updated', (e) => e.preventDefault()); win.on('closed', () => { if (LIVE.get(src.id) === win) LIVE.delete(src.id); });
    LIVE.set(src.id, win); win.loadURL(cleanUrl(url || src.url)).catch(() => {});
  } else if (url) win.loadURL(cleanUrl(url)).catch(() => {});
  if (show) { win.show(); win.focus(); } return win;
}
/** A normal window on the same signed-in session. It stays open (one per account) so you and Tulai look at the same page. */
function open(id, url) {
  const src = sourceOf(id); if (!src) throw new Error('I do not know that account.'); live(src, { show: true, url }); return { ok: true };
}
const tabs = () => webcal.state().sources.map((s) => { const w = LIVE.get(s.id), ok = w && !w.isDestroyed(); return { id: s.id, name: s.name, kind: s.kind || '', enabled: !!s.enabled, open: !!ok, visible: !!ok && w.isVisible(), url: ok ? w.webContents.getURL() : '', title: ok ? w.webContents.getTitle() : '' }; });
function close(id) { const w = LIVE.get(id); if (w && !w.isDestroyed()) w.destroy(); LIVE.delete(id); return { ok: true }; }
/** What is on the page now, the way a test tool sees it: interactive elements with a selector, role, label and place. { selector } narrows it, { text } finds by words. Never clicks or types. */
async function inspect(id, { url, selector, text, limit = 60 } = {}) {
  const src = sourceOf(id); if (!src) throw new Error('I do not know that account.');
  const had = LIVE.has(src.id) && !LIVE.get(src.id).isDestroyed(), win = live(src, { url: url || undefined }); const wc = win.webContents;
  if (!had || url) { let last = -1, stable = 0; const t0 = Date.now(); while (Date.now() - t0 < 25000) { await sleep(900); if (webcal.loginWall(wc.getURL())) break; const n = await wc.executeJavaScript('document.body ? document.body.innerText.length : 0').catch(() => 0); if (n > 200 && n === last) { if (++stable >= 2) break; } else stable = 0; last = n; } }
  const q = JSON.stringify({ selector: selector || '', text: String(text || '').toLowerCase(), limit: Math.min(200, +limit || 60) });
  const found = await wc.executeJavaScript(`(() => { const o = ${q}; const path = (e) => { const p = []; for (; e && e.nodeType === 1 && p.length < 5; e = e.parentElement) { let t = e.tagName.toLowerCase(); if (e.id) { p.unshift(t + '#' + CSS.escape(e.id)); break; } const c = [...(e.parentElement ? e.parentElement.children : [])].filter((x) => x.tagName === e.tagName); if (c.length > 1) t += ':nth-of-type(' + (c.indexOf(e) + 1) + ')'; p.unshift(t); } return p.join(' > '); };
    const base = o.selector ? [...document.querySelectorAll(o.selector)] : [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[contenteditable=true],h1,h2,h3,[role=heading]')];
    const rows = []; for (const e of base) { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue; const label = (e.getAttribute('aria-label') || e.innerText || e.value || e.placeholder || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 100); if (o.text && !(label + ' ' + (e.getAttribute('href') || '')).toLowerCase().includes(o.text)) continue; if (!o.selector && !label && e.tagName !== 'INPUT') continue; rows.push({ tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || '', type: e.type || '', label, href: e.href || '', selector: path(e), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); if (rows.length >= o.limit) break; }
    return { title: document.title, url: location.href, total: base.length, elements: rows, forms: document.forms.length, frames: document.querySelectorAll('iframe').length }; })()`).catch((e) => ({ error: e.message }));
  const shot = await webcal.snap(win, src.id).catch(() => null);
  return { ok: !found.error, account: src.name, needsLogin: webcal.loginWall(wc.getURL()), ...found, shot };
}
module.exports = { read, open, close, tabs, inspect, homeFor, sourceOf, cleanUrl };
