// Free open datasets for the local training (training-config/free-data.json): download once, pinned to a commit and a sha256, switch on or off per dataset.
// Raw files live in <data>/training/free/raw/<id>/; scripts/free-data.py turns them into capped training rows at training time. Nothing is sent anywhere.
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), crypto = require('crypto');
const catalog = () => JSON.parse(fs.readFileSync(process.env.TULAI_FREE_CATALOG || path.join(__dirname, 'training-config', 'free-data.json'), 'utf8')); // (TULAI_FREE_CATALOG: tests)
const dataDir = () => process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat');
const base = () => path.join(dataDir(), 'training', 'free'), rawDir = (id) => path.join(base(), 'raw', id), cfgFile = () => path.join(base(), 'config.json');
const HOSTS = (h) => h === 'huggingface.co' || h === 'zenodo.org' || h === 'raw.githubusercontent.com' || h === 'github.com' || h === 'codeload.github.com' || h.endsWith('.hf.co') || h.endsWith('.huggingface.co') || h === 'objects.githubusercontent.com';
const cfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } };
const isOn = (d) => { const c = cfg().enabled || {}; return d.id in c ? !!c[d.id] : !!d.defaultOn; };
const have = (d) => d.files.every((f) => { try { return fs.statSync(path.join(rawDir(d.id), f.name)).size === f.bytes; } catch { return false; } });
const prog = {}; // id -> { done, total, state, error }
function list() {
  return catalog().datasets.map((d) => { const p = prog[d.id]; const bytes = d.files.reduce((a, f) => a + f.bytes, 0), ready = have(d);
    return { id: d.id, name: d.name, skill: d.skill, license: d.license, licenseNote: d.licenseNote, licenseUrl: d.licenseUrl, source: d.source, commit: d.commit, maxRows: d.maxRows, enabled: isOn(d), bytes, state: p && p.state === 'downloading' ? 'downloading' : ready ? 'ready' : p && p.state === 'error' ? 'error' : 'missing', done: p ? p.done : ready ? bytes : 0, error: p && p.error || '' }; });
}
function setEnabled(id, on) { if (!catalog().datasets.some((d) => d.id === id)) throw new Error('Unknown dataset.'); const c = cfg(); c.enabled = { ...(c.enabled || {}), [id]: !!on }; fs.mkdirSync(base(), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c), { mode: 0o600 }); return list(); }
function get(url, start, hops = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); if (u.protocol !== 'https:' || !HOSTS(u.hostname)) return reject(new Error('Only GitHub and Hugging Face addresses are allowed.'));
    const req = https.get(u, { headers: { 'User-Agent': 'Tulai-free-data', ...(start ? { Range: `bytes=${start}-` } : {}) } }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 6) { res.resume(); return resolve(get(new URL(res.headers.location, u).href, start, hops + 1)); }
      if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); return reject(new Error('The server answered ' + res.statusCode)); } resolve({ res, resumed: res.statusCode === 206 });
    }); req.on('error', reject); req.setTimeout(30000, () => req.destroy(new Error('The connection timed out')));
  });
}
const sha = (f) => new Promise((ok, bad) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (c) => h.update(c)).on('end', () => ok(h.digest('hex'))).on('error', bad); });
/** Downloads one dataset (resumes, checks size and sha256, refuses a changed file). Never throws: the result is in list(). */
async function download(id, { fetcher = get } = {}) {
  const d = catalog().datasets.find((x) => x.id === id); if (!d) throw new Error('Unknown dataset.'); if (prog[id] && prog[id].state === 'downloading') return list();
  const total = d.files.reduce((a, f) => a + f.bytes, 0); prog[id] = { done: 0, total, state: 'downloading', error: '' }; fs.mkdirSync(rawDir(id), { recursive: true }); let doneBefore = 0;
  try {
    for (const f of d.files) {
      const file = path.join(rawDir(id), f.name), part = file + '.part';
      if (fs.existsSync(file) && fs.statSync(file).size === f.bytes && (await sha(file)) === f.sha256) { doneBefore += f.bytes; prog[id].done = doneBefore; continue; }
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const start = fs.existsSync(part) ? fs.statSync(part).size : 0; if (start > f.bytes) fs.rmSync(part, { force: true });
          const { res, resumed } = await fetcher(f.url, fs.existsSync(part) ? fs.statSync(part).size : 0); const out = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' }); let n = resumed ? start : 0;
          await new Promise((ok, bad) => { res.on('data', (c) => { n += c.length; prog[id].done = doneBefore + n; }); res.on('error', bad); res.pipe(out); out.on('finish', ok); out.on('error', bad); res.on('aborted', () => bad(new Error('The connection dropped'))); });
          if (fs.statSync(part).size !== f.bytes || (await sha(part)) !== f.sha256) { fs.rmSync(part, { force: true }); throw new Error(`${f.name} does not match its pinned checksum; it was refused`); }
          fs.renameSync(part, file); break;
        } catch (e) { if (attempt === 3 || /pinned checksum/.test(e.message)) throw e; await new Promise((r) => setTimeout(r, 1500 * attempt)); }
      }
      doneBefore += f.bytes; prog[id].done = doneBefore;
    }
    prog[id] = { done: total, total, state: 'done', error: '' };
  } catch (e) { prog[id] = { done: prog[id].done, total, state: 'error', error: e.message }; }
  return list();
}
/** Before a training run: fetch what is switched on and missing. Best effort, never blocks training. */
async function beforeTraining() { for (const d of catalog().datasets) if (isOn(d) && !have(d)) await download(d.id).catch(() => {}); }
const warnings = () => { const w = []; for (const x of list()) if (x.enabled && x.state === 'error') w.push(`Free dataset "${x.name}" could not be downloaded: ${x.error}`); return w; };
module.exports = { list, setEnabled, download, beforeTraining, warnings, catalog, rawDir };
