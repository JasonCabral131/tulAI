// First-launch setup: makes sure the local AI models Tulai needs are on this Mac, downloading what is missing (with resume and a checksum), and reports
// progress to the setup window. Models are looked for in the data folder first, then inside the app (full installers carry them).
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), crypto = require('crypto');
const manifest = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'models.json'), 'utf8'));
const dataDir = () => process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat');
const modelDir = () => path.join(dataDir(), 'models');
const dirs = () => [modelDir(), path.join(process.resourcesPath || '', 'models')];
const have = (m) => dirs().some((d) => { try { return fs.statSync(path.join(d, m.file)).size === m.bytes; } catch { return false; } });
const S = { phase: 'idle', startedAt: 0, error: '', models: [] };
const fresh = () => manifest().models.filter((m) => m.required).map((m) => ({ id: m.id, what: m.what, file: m.file, bytes: m.bytes, done: have(m) ? m.bytes : 0, speed: 0, state: have(m) ? 'ready' : 'waiting' }));
function status() { if (S.phase === 'idle' || S.phase === 'done') S.models = fresh(); return { ...S, needed: S.models.some((m) => m.state !== 'ready'), totalBytes: S.models.reduce((a, m) => a + m.bytes, 0), doneBytes: S.models.reduce((a, m) => a + Math.min(m.done, m.bytes), 0) }; }
const needed = () => manifest().models.some((m) => m.required && !have(m));
const sha = (f) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej); });
function get(url, start, hops = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Tulai-installer', ...(start ? { Range: `bytes=${start}-` } : {}) } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) { res.resume(); return resolve(get(new URL(res.headers.location, url).href, start, hops + 1)); }
      if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return reject(new Error('The download server answered ' + res.statusCode)); } resolve({ res, resumed: res.statusCode === 206 });
    }); req.on('error', reject); req.setTimeout(30000, () => req.destroy(new Error('The connection timed out')));
  });
}
let stopFlag = false, current = null;
async function fetchOne(m, row) {
  const file = path.join(modelDir(), m.file), part = file + '.part'; fs.mkdirSync(modelDir(), { recursive: true });
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const start = fs.existsSync(part) ? fs.statSync(part).size : 0; if (start > m.bytes) fs.rmSync(part, { force: true });
      const { res, resumed } = await get(m.url, fs.existsSync(part) ? fs.statSync(part).size : 0); const out = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' }); current = res;
      let done = resumed ? start : 0, t0 = Date.now(), b0 = done; row.state = 'downloading';
      await new Promise((ok, bad) => { res.on('data', (c) => { done += c.length; row.done = done; const dt = (Date.now() - t0) / 1000; if (dt >= 1) { row.speed = (done - b0) / dt; if (dt > 6) { t0 = Date.now(); b0 = done; } } if (stopFlag) res.destroy(new Error('paused')); }); res.on('error', bad); res.pipe(out); out.on('finish', ok); out.on('error', bad); res.on('aborted', () => bad(new Error('The connection dropped'))); });
      row.state = 'verifying'; row.speed = 0;
      if (fs.statSync(part).size !== m.bytes || (await sha(part)) !== m.sha256) { fs.rmSync(part, { force: true }); throw new Error('The file arrived damaged; downloading it again'); }
      fs.renameSync(part, file); row.done = m.bytes; row.state = 'ready'; return;
    } catch (e) { if (stopFlag) throw e; row.state = 'retrying'; row.speed = 0; if (attempt === 4) throw e; await new Promise((r) => setTimeout(r, 2500 * attempt)); }
  }
}
/** Starts (or resumes) the downloads. Safe to call twice. */
async function start() {
  if (S.phase === 'downloading') return status(); stopFlag = false; S.phase = 'downloading'; S.error = ''; S.startedAt = Date.now(); S.models = fresh();
  try {
    for (const row of S.models) { if (row.state === 'ready') continue; await fetchOne(manifest().models.find((m) => m.id === row.id), row); }
    S.phase = 'done';
  } catch (e) { S.phase = e.message === 'paused' ? 'paused' : 'error'; S.error = e.message === 'paused' ? '' : e.message; }
  return status();
}
function pause() { stopFlag = true; try { current && current.destroy(new Error('paused')); } catch {} return status(); }
module.exports = { status, needed, start, pause, modelDir };
