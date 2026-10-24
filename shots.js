// UI screenshots: web (Chromium inside Electron), iOS Simulator (simctl), Android (adb), plus visual baselines/diffs.
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

let electron = null;
try { const e = require('electron'); if (e && e.BrowserWindow) electron = e; } catch {}

const DATA = () => process.env.GC_DATA_DIR || __dirname;
const SHOTS = () => path.join(DATA(), 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const PIXEL_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const PRESETS = {
  desktop: { w: 1280, h: 800 }, laptop: { w: 1440, h: 900 },
  tablet: { w: 820, h: 1180, mobile: true, dpr: 2, ua: IPHONE_UA.replace('iPhone; CPU iPhone', 'iPad; CPU') },
  iphone: { w: 390, h: 844, mobile: true, dpr: 3, ua: IPHONE_UA },
  android: { w: 412, h: 915, mobile: true, dpr: 2.6, ua: PIXEL_UA },
};

function sh(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = execFile(cmd, args, { timeout: opts.timeout || 60000, maxBuffer: 80e6, encoding: opts.binary ? 'buffer' : 'utf8' }, (e, so, se) => (e ? reject(new Error(String(se || e.message).trim().slice(0, 400))) : resolve(so)));
    p.stdin.end();
  });
}
const newId = () => 'shot_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function shotFile(id) { if (!/^shot_[a-z0-9]+$/.test(String(id))) return null; return path.join(SHOTS(), id + '.png'); }
function dataUrl(id) { try { return 'data:image/png;base64,' + fs.readFileSync(shotFile(id)).toString('base64'); } catch { return null; } }

async function saveShot(rawPng) { // keep a display copy no larger than 1400px so images stay cheap for the model
  fs.mkdirSync(SHOTS(), { recursive: true });
  const id = newId(), f = shotFile(id), tmp = f + '.raw.png';
  fs.writeFileSync(tmp, rawPng);
  try {
    const dims = await sh('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', tmp]);
    const big = Math.max(+dims.match(/pixelWidth: (\d+)/)[1], +dims.match(/pixelHeight: (\d+)/)[1]) > 1400;
    if (big) await sh('/usr/bin/sips', ['-Z', '1400', tmp, '--out', f]); else fs.copyFileSync(tmp, f); // only shrink, never enlarge
  } catch { fs.copyFileSync(tmp, f); }
  fs.rmSync(tmp, { force: true });
  let w = 0, h = 0; try { const o = await sh('/usr/bin/sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', f]); w = +o.match(/pixelWidth: (\d+)/)[1]; h = +o.match(/pixelHeight: (\d+)/)[1]; } catch {}
  return { id, width: w, height: h };
}

/* ---------- web (Chromium) ---------- */
async function withWindow(o, cfg, W, H, pre, fn) {
  // Offscreen window: renders without being shown. (Device emulation and live resizing of offscreen windows crash/hang Electron, so mobile is
  // approximated with a phone-sized viewport + phone user agent, and full-page uses a fresh, taller window.)
  const win = new electron.BrowserWindow({ show: false, width: W, height: H, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, backgroundThrottling: false } });
  try {
    const wc = win.webContents;
    if (pre.mobile && !o.width) wc.setUserAgent(pre.ua);
    if (cfg && cfg.insecureTls) wc.session.setCertificateVerifyProc((_r, cb) => cb(0));
    await Promise.race([wc.loadURL(o.url), sleep(25000).then(() => { throw new Error('Page did not finish loading in 25s'); })]);
    await sleep(o.wait_ms ?? 1000);
    return await fn(wc);
  } finally { win.destroy(); }
}
async function captureWeb(o, cfg) {
  if (!electron) throw new Error('Web rendering needs the desktop app (it uses the built-in Chromium engine).');
  if (!/^https?:\/\//i.test(o.url || '')) throw new Error('url must start with http:// or https://');
  const pre = PRESETS[o.device || 'desktop'] || PRESETS.desktop, W = Math.round(o.width || pre.w);
  let H = Math.round(o.height || pre.h);
  if (o.full_page) { const h = await withWindow(o, cfg, W, H, pre, (wc) => wc.executeJavaScript('Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0)')); H = Math.min(Math.max(Number(h) || H, H), 8000); }
  const png = await withWindow(o, cfg, W, H, pre, async (wc) => (await wc.capturePage()).toPNG());
  return { raw: png, label: `web · ${o.device || 'desktop'} ${W}×${H}${o.full_page ? ' full page' : ''} · ${o.url}`, engine: 'Chromium' };
}

/* ---------- iOS Simulator ---------- */
async function iosDevices() {
  const j = JSON.parse(await sh('xcrun', ['simctl', 'list', 'devices', '-j']));
  return Object.entries(j.devices).filter(([rt]) => /iOS/.test(rt)).flatMap(([rt, ds]) => ds.filter((d) => d.isAvailable).map((d) => ({ udid: d.udid, name: d.name, state: d.state, runtime: rt.split('.').pop() })));
}
async function captureIos(o) {
  let all; try { all = await iosDevices(); } catch (e) { throw new Error('iOS Simulator unavailable (is Xcode installed?): ' + e.message); }
  let d = o.device ? all.find((x) => x.name.toLowerCase() === o.device.toLowerCase() || x.udid === o.device) : all.find((x) => x.state === 'Booted');
  if (o.device && !d) throw new Error(`No simulator named "${o.device}". Available: ${[...new Set(all.map((x) => x.name))].slice(0, 12).join(', ')}`);
  if (!d) d = all.filter((x) => /^iPhone/.test(x.name)).sort((a, b) => (/Pro$/.test(b.name) - /Pro$/.test(a.name)) || b.name.localeCompare(a.name))[0];
  if (!d) throw new Error('No iOS simulators installed. Add one in Xcode → Settings → Platforms.');
  let booted = false;
  if (d.state !== 'Booted') { await sh('xcrun', ['simctl', 'boot', d.udid]).catch(() => {}); await sh('open', ['-a', 'Simulator']).catch(() => {}); await sh('xcrun', ['simctl', 'bootstatus', d.udid, '-b'], { timeout: 180000 }); booted = true; }
  if (o.url) await sh('xcrun', ['simctl', 'openurl', d.udid, o.url]);
  if (o.bundle_id) await sh('xcrun', ['simctl', 'launch', d.udid, o.bundle_id]);
  await sleep(o.wait_ms ?? (o.url || o.bundle_id || booted ? 3000 : 500));
  const f = path.join(os.tmpdir(), newId() + '.png');
  await sh('xcrun', ['simctl', 'io', d.udid, 'screenshot', '--type=png', f]);
  const raw = fs.readFileSync(f); fs.rmSync(f, { force: true });
  return { raw, label: `iOS · ${d.name}${o.url ? ' · ' + o.url : ''}${o.bundle_id ? ' · ' + o.bundle_id : ''}`, engine: 'iOS Simulator (WebKit/Safari)' };
}

/* ---------- Android ---------- */
function adbPath() {
  for (const p of [process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', 'adb'), process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'), path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'), '/opt/homebrew/bin/adb', '/usr/local/bin/adb'].filter(Boolean)) if (fs.existsSync(p)) return p;
  return null;
}
async function androidDevices() {
  const adb = adbPath(); if (!adb) return { adb: null, devices: [], avds: [] };
  const out = await sh(adb, ['devices']).catch(() => '');
  const devices = out.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p[1] === 'device').map((p) => p[0]);
  let avds = []; const emu = path.join(path.dirname(path.dirname(adb)), 'emulator', 'emulator');
  if (fs.existsSync(emu)) avds = (await sh(emu, ['-list-avds']).catch(() => '')).split('\n').map((s) => s.trim()).filter(Boolean);
  return { adb, devices, avds };
}
async function captureAndroid(o) {
  const { adb, devices, avds } = await androidDevices();
  if (!adb) throw new Error('adb not found. Install Android Studio (SDK Platform-Tools) or set ANDROID_HOME.');
  const serial = o.device && devices.includes(o.device) ? o.device : devices[0];
  if (!serial) throw new Error('No Android device or emulator is running.' + (avds.length ? ` Start one first, e.g. in Terminal: emulator -avd ${avds[0]}` : ' Create an emulator in Android Studio → Device Manager.'));
  let url = o.url; if (url && serial.startsWith('emulator-')) url = url.replace(/\/\/(localhost|127\.0\.0\.1)/, '//10.0.2.2');
  if (url) await sh(adb, ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`]);
  if (o.package) await sh(adb, ['-s', serial, 'shell', 'monkey', '-p', o.package, '-c', 'android.intent.category.LAUNCHER', '1']);
  await sleep(o.wait_ms ?? (url || o.package ? 3000 : 300));
  const raw = await sh(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { binary: true });
  return { raw, label: `Android · ${serial}${url ? ' · ' + url : ''}${o.package ? ' · ' + o.package : ''}`, engine: 'Android (Chrome/WebView)' };
}

/* ---------- baselines & diff ---------- */
const bpath = (ws, name) => path.join(DATA(), 'baselines', crypto.createHash('sha1').update(ws).digest('hex').slice(0, 12), String(name).replace(/[^\w.-]/g, '_') + '.png');
function diffPngs(a, b) {
  if (!electron) throw new Error('Comparing needs the desktop app.');
  const A = electron.nativeImage.createFromBuffer(a), B = electron.nativeImage.createFromBuffer(b), sa = A.getSize(), sb = B.getSize();
  if (sa.width !== sb.width || sa.height !== sb.height) return { sizeMismatch: true, a: sa, b: sb };
  const pa = A.toBitmap(), pb = B.toBitmap(), out = Buffer.from(pb); let changed = 0;
  for (let i = 0; i < pa.length; i += 4) {
    if (Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 24) { changed++; out[i] = 0; out[i + 1] = 0; out[i + 2] = 255; out[i + 3] = 255; }
    else { out[i] = out[i] >> 1; out[i + 1] = out[i + 1] >> 1; out[i + 2] = out[i + 2] >> 1; }
  }
  return { pct: (changed / (pa.length / 4)) * 100, changed, png: electron.nativeImage.createFromBitmap(out, { width: sa.width, height: sa.height }).toPNG() };
}

async function capture(o, ws, cfg) {
  const target = o.target || 'web';
  const r = target === 'ios' ? await captureIos(o) : target === 'android' ? await captureAndroid(o) : await captureWeb(o, cfg);
  const saved = await saveShot(r.raw);
  if (target === 'android') { const z = pngSize(r.raw); if (z) lastFrame.android = { rawW: z.w, rawH: z.h, imgW: saved.width, imgH: saved.height }; }
  const res = { ...saved, label: r.label, engine: r.engine, target, shots: [saved.id] };
  if (o.baseline) {
    const bf = bpath(ws, o.baseline);
    if (o.mode === 'save_baseline' || !fs.existsSync(bf)) { fs.mkdirSync(path.dirname(bf), { recursive: true }); fs.writeFileSync(bf, r.raw); res.baseline = o.mode === 'save_baseline' ? 'saved' : 'created (none existed)'; }
    else if (o.mode === 'compare') {
      const d = diffPngs(fs.readFileSync(bf), r.raw);
      if (d.sizeMismatch) res.diff = { sizeMismatch: true, a: d.a, b: d.b };
      else { const ds = await saveShot(d.png); res.diff = { pct: d.pct, changed: d.changed, diffId: ds.id }; res.shots.push(ds.id); }
    }
  }
  return res;
}
async function devices() {
  const out = { web: !!electron, ios: { available: false, devices: [] }, android: { adb: false, devices: [], avds: [] } };
  try { const all = await iosDevices(); out.ios = { available: true, booted: all.filter((d) => d.state === 'Booted').map((d) => d.name), devices: [...new Set(all.filter((d) => /^iPhone|^iPad/.test(d.name)).map((d) => d.name))].slice(0, 20) }; } catch {}
  try { const a = await androidDevices(); out.android = { adb: !!a.adb, devices: a.devices, avds: a.avds }; } catch {}
  return out;
}

/* ---------- live device view and touch input ---------- */
const lastFrame = {}; // per target: raw device size vs the (possibly shrunk) screenshot the model saw, so taps map back to real pixels
const pngSize = (b) => (b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null);
async function frame(target, device) {
  if (target === 'ios') {
    const all = await iosDevices(); const d = device ? all.find((x) => x.name === device || x.udid === device) : all.find((x) => x.state === 'Booted');
    if (!d || d.state !== 'Booted') throw new Error('No booted iOS Simulator. Choose one and press Boot.');
    const f = path.join(os.tmpdir(), newId() + '.jpg'); await sh('xcrun', ['simctl', 'io', d.udid, 'screenshot', '--type=jpeg', f]);
    const buf = fs.readFileSync(f); fs.rmSync(f, { force: true }); return { buf, mime: 'image/jpeg', name: d.name };
  }
  const { adb, devices } = await androidDevices(); if (!adb) throw new Error('adb not found. Install Android Studio (Platform-Tools).');
  const serial = device && devices.includes(device) ? device : devices[0]; if (!serial) throw new Error('No Android emulator or device is running.');
  const buf = await sh(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { binary: true }); const z = pngSize(buf); if (z) lastFrame.android = { rawW: z.w, rawH: z.h };
  return { buf, mime: 'image/png', name: serial, w: z && z.w, h: z && z.h };
}
const AKEYS = { back: 4, home: 3, recents: 187, enter: 66, delete: 67, backspace: 67, tab: 61, power: 26, volume_up: 24, volume_down: 25, menu: 82, search: 84, up: 19, down: 20, left: 21, right: 22, escape: 111, space: 62 };
async function deviceInput(b) {
  const target = b.target === 'ios' ? 'ios' : 'android', action = String(b.action || '').toLowerCase();
  if (target === 'ios') {
    const all = await iosDevices(); let d = b.device ? all.find((x) => x.name === b.device || x.udid === b.device) : all.find((x) => x.state === 'Booted') || all.find((x) => /^iPhone/.test(x.name));
    if (!d) throw new Error('No iOS simulator available.');
    const ensureBooted = async () => { if (d.state !== 'Booted') { await sh('xcrun', ['simctl', 'boot', d.udid]).catch(() => {}); await sh('open', ['-a', 'Simulator']).catch(() => {}); await sh('xcrun', ['simctl', 'bootstatus', d.udid, '-b'], { timeout: 180000 }); d.state = 'Booted'; } };
    if (action === 'boot') { await ensureBooted(); return `Booted ${d.name}`; }
    await ensureBooted();
    if (action === 'open_url') { await sh('xcrun', ['simctl', 'openurl', d.udid, String(b.url)]); return `Opened ${b.url} on ${d.name}`; }
    if (action === 'launch') { await sh('xcrun', ['simctl', 'launch', d.udid, String(b.bundle_id)]); return `Launched ${b.bundle_id} on ${d.name}`; }
    if (action === 'appearance') { await sh('xcrun', ['simctl', 'ui', d.udid, 'appearance', b.mode === 'dark' ? 'dark' : 'light']); return `Appearance set to ${b.mode === 'dark' ? 'dark' : 'light'}`; }
    throw new Error('Touch, swipe, typing and keys are not available for the iOS Simulator from Tulai (Apple provides no built-in input API). You can still boot it, open URLs, launch apps, switch light or dark mode, and take screenshots. Use an Android emulator for touch control.');
  }
  const { adb, devices, avds } = await androidDevices(); if (!adb) throw new Error('adb not found. Install Android Studio (Platform-Tools).');
  if (action === 'boot') {
    const name = b.device || avds[0]; if (!name || !avds.includes(name)) throw new Error('Unknown emulator. Available: ' + (avds.join(', ') || 'none; create one in Android Studio → Device Manager'));
    const emu = path.join(path.dirname(path.dirname(adb)), 'emulator', 'emulator'); require('child_process').spawn(emu, ['-avd', name], { detached: true, stdio: 'ignore' }).unref(); return `Starting emulator ${name}. It takes about a minute.`;
  }
  const serial = b.device && devices.includes(b.device) ? b.device : devices[0]; if (!serial) throw new Error('No Android emulator or device is running.' + (avds.length ? ` Press Boot to start ${avds[0]}.` : ''));
  const A = (...args) => sh(adb, ['-s', serial, ...args]);
  const sc = b.raw ? 1 : (lastFrame.android && lastFrame.android.imgW ? lastFrame.android.rawW / lastFrame.android.imgW : 1), px = (v) => Math.round(Number(v) * sc);
  switch (action) {
    case 'tap': await A('shell', 'input', 'tap', String(px(b.x)), String(px(b.y))); return `Tapped (${px(b.x)}, ${px(b.y)}) on ${serial}`;
    case 'long_press': await A('shell', 'input', 'swipe', String(px(b.x)), String(px(b.y)), String(px(b.x)), String(px(b.y)), '800'); return `Long-pressed (${px(b.x)}, ${px(b.y)})`;
    case 'swipe': await A('shell', 'input', 'swipe', String(px(b.x)), String(px(b.y)), String(px(b.x2)), String(px(b.y2)), String(Math.min(+b.ms || 300, 3000))); return `Swiped (${px(b.x)}, ${px(b.y)}) → (${px(b.x2)}, ${px(b.y2)})`;
    case 'type': { const t = String(b.text ?? ''); if (/[^\x20-\x7e]/.test(t)) throw new Error('Only plain ASCII text can be typed on Android through adb.'); await A('shell', 'input', 'text', `'${t.replace(/ /g, '%s').replace(/'/g, "'\\''")}'`); return `Typed ${JSON.stringify(t.slice(0, 60))}`; }
    case 'key': { const k = AKEYS[String(b.key).toLowerCase()]; if (!k) throw new Error('key must be one of: ' + Object.keys(AKEYS).join(', ')); await A('shell', 'input', 'keyevent', String(k)); return `Pressed ${b.key}`; }
    case 'open_url': { let u = String(b.url); if (/^(localhost|127\.0\.0\.1)/.test(u.replace(/^https?:\/\//, '')) && serial.startsWith('emulator-')) u = u.replace(/\/\/(localhost|127\.0\.0\.1)/, '//10.0.2.2'); await A('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${u}'`); return `Opened ${u}`; }
    case 'launch': await A('shell', 'monkey', '-p', String(b.package), '-c', 'android.intent.category.LAUNCHER', '1'); return `Launched ${b.package}`;
    default: throw new Error('action must be tap, long_press, swipe, type, key, open_url, launch or boot');
  }
}
module.exports = { capture, devices, shotFile, dataUrl, saveShot, PRESETS, frame, deviceInput, lastFrame, iosDevices, androidDevices };
