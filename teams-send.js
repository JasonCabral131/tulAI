// Sends a Teams chat message in the background through Tulai's own signed-in Teams (Tulai's browser, the "Teams" account in Settings → Calendars/Accounts).
// Only after you said yes in the chat. It opens the chat with the person, puts your message in the box, sends it, and checks that it shows in the chat.
const webcal = require('./webcal');
const BOX = '[data-tid="ckeditor"], div[role="textbox"][contenteditable="true"], [contenteditable="true"][aria-label*="message" i]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const electron = () => { try { return require('electron'); } catch { return null; } };
function teamsSource() { const st = webcal.state(); return st.sources.find((s) => s.id === 'teams') || st.sources.find((s) => /teams\.microsoft\.com|teams\.live\.com/i.test(s.url || '')); }
async function send({ email, body, dryRun = false, timeout = 60000 }) { if (require('./sandbox').would('teams ' + email)) dryRun = true;
  const E = electron(); if (!E || !E.BrowserWindow) throw new Error('Sending in Teams only works inside the Tulai Bot app.');
  const src = teamsSource(); if (!src) throw new Error('Add your Teams account in Tulai Desktop → Settings → Calendars first, then press Sign in on it.');
  const win = new E.BrowserWindow({ show: false, width: 1300, height: 900, webPreferences: { partition: webcal.partitionOf(src), sandbox: true, backgroundThrottling: false } });
  const js = (code) => win.webContents.executeJavaScript(code).catch(() => null);
  try {
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//i.test(url)) win.loadURL(url).catch(() => {}); return { action: 'deny' }; }); // "Use Teams on the web" opens a tab: follow it here
    await win.loadURL(`https://teams.cloud.microsoft/l/chat/0/0?users=${encodeURIComponent(email)}`).catch(() => {});
    const t0 = Date.now(); let box = false;
    while (Date.now() - t0 < timeout) {
      await sleep(1500); if (webcal.loginWall(win.webContents.getURL())) return { ok: false, needsLogin: true };
      await js(`(() => { const a = [...document.querySelectorAll('a,button')].find((x) => /use the web app instead|use teams on the web|continue on this browser/i.test(x.innerText || '')); if (a) a.click(); })()`);
      box = await js(`(() => { const b = document.querySelector('[data-tid="ckeditor"], div[role="textbox"][contenteditable="true"], [contenteditable="true"][aria-label*="message" i]'); return !!b; })()`);
      if (box) break;
    }
    if (!box) { await webcal.snap(win, src.id); return { ok: false, reason: 'The chat box did not appear. Open Tulai\'s browser on the Teams account and check that you are signed in.' }; }
    if (dryRun) { await webcal.snap(win, src.id); return { ok: true, dryRun: true, url: win.webContents.getURL() }; }
    const before = await js(`document.body.innerText.split(${JSON.stringify(body)}).length - 1`) || 0;
    await js(`(() => { const b = document.querySelector(${JSON.stringify(BOX)}); b.scrollIntoView(); b.click(); b.focus(); })()`); await sleep(400); win.webContents.insertText(String(body)); await sleep(500); // typed like a keyboard: a hidden window ignores execCommand
    const typed = await js(`(() => { const b = document.querySelector(${JSON.stringify(BOX)}); return b ? b.innerText.trim() : ''; })()`); if (!String(typed).includes(String(body).slice(0, 20))) { await webcal.snap(win, src.id); return { ok: false, reason: 'I could not type into the Teams message box.' }; }
    await sleep(600);
    const clicked = await js(`(() => { const s = document.querySelector('button[data-tid="newMessageCommands-send"], button[name="send"], button[aria-label^="Send" i], button[title^="Send" i]'); if (s && !s.disabled) { s.click(); return true; } return false; })()`);
    if (!clicked) { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' }); }
    let after = before; for (let i = 0; i < 8; i++) { await sleep(1000); after = await js(`document.body.innerText.split(${JSON.stringify(body)}).length - 1`) || 0; const empty = await js(`(() => { const b = document.querySelector('[data-tid="ckeditor"], div[role="textbox"][contenteditable="true"]'); return !b || !b.innerText.trim(); })()`); if (after > before && empty) break; }
    const shot = await webcal.snap(win, src.id);
    return after > before ? { ok: true, shot } : { ok: false, shot, reason: 'I could not confirm that the message appeared in the chat. Open Tulai\'s browser on Teams to check.' };
  } finally { try { win.destroy(); } catch {} }
}
/** Finds a person by name with Teams' own search (in the background), opens the chat with them, and (unless dryRun) sends the message. No email needed. */
async function sendByName({ name, body, dryRun = false, timeout = 75000 }) { if (require('./sandbox').would('teams ' + name)) dryRun = true;
  const E = electron(); if (!E || !E.BrowserWindow) throw new Error('Sending in Teams only works inside the Tulai Bot app.');
  const src = teamsSource(); if (!src) throw new Error('Add your Teams account in Tulai Desktop → Settings → Calendars first, then press Sign in on it.');
  const win = new E.BrowserWindow({ show: false, width: 1300, height: 900, webPreferences: { partition: webcal.partitionOf(src), sandbox: true, backgroundThrottling: false } });
  const wc = win.webContents, js = (code) => wc.executeJavaScript(code).catch(() => null);
  try {
    wc.setWindowOpenHandler(() => ({ action: 'deny' })); await win.loadURL('https://teams.cloud.microsoft/').catch(() => {});
    const t0 = Date.now(); let ready = false;
    while (Date.now() - t0 < timeout) { await sleep(1200); if (webcal.loginWall(wc.getURL())) return { ok: false, needsLogin: true }; ready = await js(`!!document.querySelector('#ms-searchux-input') && !/setting things up for you/i.test(document.body.innerText)`); if (ready) { await sleep(2500); break; } } // Teams must be fully loaded, not "We're setting things up for you"
    if (!ready) return { ok: false, reason: 'Teams did not finish loading.' };
    await js(`(() => { const i = document.querySelector('#ms-searchux-input'); i.focus(); i.click(); })()`); await sleep(500); wc.insertText(String(name)); let options = [];
    await sleep(800); wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: '\r' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); // a hidden window gets no suggestion list: run the full search
    for (let i = 0; i < 10; i++) { await sleep(1000); options = await js(`[...document.querySelectorAll('[role="option"], [role="listitem"], [data-tid*="people" i], [data-tid*="person" i]')].map((o, i) => ({ i, label: (o.getAttribute('aria-label') || o.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 140) })).filter((o) => o.label)`) || []; if (options.some((o) => String(name).toLowerCase().split(/\s+/).every((w) => o.label.toLowerCase().includes(w)))) break; }
    const words = String(name).toLowerCase().split(/\s+/).filter(Boolean), pick = options.find((o) => words.every((w) => o.label.toLowerCase().includes(w)));
    if (!pick) { await webcal.snap(win, src.id); return { ok: false, notFound: true, options: options.slice(0, 8) }; }
    await js(`(() => { const o = [...document.querySelectorAll('[role="option"], [role="listitem"], [data-tid*="people" i], [data-tid*="person" i]')][${pick.i}]; if (o) o.click(); })()`);
    let box = false; for (let i = 0; i < 12 && !box; i++) { await sleep(1000); box = await js(`!!document.querySelector(${JSON.stringify(BOX)})`); }
    const info = { picked: pick.label, url: wc.getURL(), title: await js('document.title'), box, options: options.slice(0, 8) };
    if (!box) { await webcal.snap(win, src.id); return { ok: false, ...info, reason: 'I found the person but the chat box did not open.' }; }
    if (dryRun) return { ok: true, dryRun: true, ...info };
    const before = await js(`document.body.innerText.split(${JSON.stringify(body)}).length - 1`) || 0;
    await js(`(() => { const b = document.querySelector(${JSON.stringify(BOX)}); b.scrollIntoView(); b.click(); b.focus(); })()`); await sleep(400); win.webContents.insertText(String(body)); await sleep(500); // typed like a keyboard: a hidden window ignores execCommand
    const typed = await js(`(() => { const b = document.querySelector(${JSON.stringify(BOX)}); return b ? b.innerText.trim() : ''; })()`); if (!String(typed).includes(String(body).slice(0, 20))) { await webcal.snap(win, src.id); return { ok: false, reason: 'I could not type into the Teams message box.' }; } await sleep(600);
    const clicked = await js(`(() => { const s = document.querySelector('button[data-tid="newMessageCommands-send"], button[name="send"], button[aria-label^="Send" i], button[title^="Send" i]'); if (s && !s.disabled) { s.click(); return true; } return false; })()`);
    if (!clicked) { wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' }); }
    let after = before; for (let i = 0; i < 8; i++) { await sleep(1000); after = await js(`document.body.innerText.split(${JSON.stringify(body)}).length - 1`) || 0; if (after > before) break; }
    const shot = await webcal.snap(win, src.id);
    return after > before ? { ok: true, shot, ...info } : { ok: false, shot, ...info, reason: 'I could not confirm that the message appeared in the chat.' };
  } finally { try { win.destroy(); } catch {} }
}
/** Looks a person up with Teams' full search (People results) in the background: { name, email, title } — read only, nothing is sent. */
async function findPerson({ name, timeout = 75000 }) {
  const E = electron(); if (!E || !E.BrowserWindow) throw new Error('Teams lookup only works inside the Tulai Bot app.');
  const src = teamsSource(); if (!src) throw new Error('Add your Teams account in Tulai Desktop → Settings → Calendars first, then press Sign in on it.');
  const win = new E.BrowserWindow({ show: false, width: 1300, height: 900, webPreferences: { partition: webcal.partitionOf(src), sandbox: true, backgroundThrottling: false } });
  const wc = win.webContents, js = (code) => wc.executeJavaScript(code).catch(() => null), jsAll = async (code) => { const out = []; for (const f of wc.mainFrame.framesInSubtree) { try { const r = await f.executeJavaScript(code); if (Array.isArray(r)) out.push(...r); else if (r) out.push(r); } catch {} } return out; }; // Teams shows search results inside frames
  try {
    wc.setWindowOpenHandler(() => ({ action: 'deny' })); await win.loadURL('https://teams.cloud.microsoft/').catch(() => {});
    const t0 = Date.now(); let ready = false;
    while (Date.now() - t0 < timeout) { await sleep(1200); if (webcal.loginWall(wc.getURL())) return { ok: false, needsLogin: true }; ready = await js(`!!document.querySelector('#ms-searchux-input') && !/setting things up for you/i.test(document.body.innerText)`); if (ready) { await sleep(2500); break; } }
    if (!ready) return { ok: false, reason: 'Teams did not finish loading.' };
    await js(`(() => { const i = document.querySelector('#ms-searchux-input'); i.focus(); i.click(); })()`); await sleep(500); wc.insertText(String(name)); await sleep(800);
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' }); wc.sendInputEvent({ type: 'char', keyCode: '\r' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    const words = String(name).toLowerCase().split(/\s+/).filter(Boolean); let people = [];
    for (let i = 0; i < 12; i++) { await sleep(1000);
      people = await jsAll(`(() => { const out = []; const emails = new Set([...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.href.slice(7).split('?')[0]).concat((document.body.innerText.match(/[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+/g) || []))); for (const e of emails) out.push(e); return out; })()`) || [];
      const hit = people.find((e) => { const local = e.split('@')[0].toLowerCase(); return words.every((w) => local.includes(w)) || (words.length > 1 && local.includes(words[0]) && local.includes(words[words.length - 1])); }); if (hit) { people = [hit]; break; } }
    const email = people.length === 1 ? people[0] : null; await webcal.snap(win, src.id);
    if (!email) return { ok: false, notFound: true };
    const texts = await jsAll(`document.body ? document.body.innerText : ''`), lines = (texts.find((t) => t.includes(email)) || '').split('\n').map((x) => x.trim()).filter(Boolean), at = lines.findIndex((l) => l.includes(email));
    const title = at > 0 ? lines.slice(Math.max(0, at - 4), at).filter((l) => l.toLowerCase() !== String(name).toLowerCase() && !/^[A-Z]{1,3}$/.test(l) && !/^people$/i.test(l)).slice(-2).join(' · ') : '';
    return { ok: true, name, email, title };
  } finally { try { win.destroy(); } catch {} }
}
module.exports = { send, sendByName, findPerson, teamsSource };
