// Training packs from GitHub: examples and checks that you publish in a public GitHub repo (free), and every Tulai install downloads and adds to its own
// local fine-tuning. A pack is a folder in the repo (default "training-pack") with an index.json and .jsonl files in the same format as "Your own training".
// Only github.com / raw.githubusercontent.com are used. Every row is validated here (secrets and malformed rows are dropped) and every file is checked
// against its sha256 from index.json. Nothing is ever sent to GitHub, only downloaded.
const fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), crypto = require('crypto');
const ct = require('./custom-training');
const dataDir = () => process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat');
const cfgFile = () => path.join(dataDir(), 'training', 'pack.json'), logFile = () => path.join(dataDir(), 'training', 'pack-status.json');
const REPO = /^[A-Za-z0-9_.-]{1,60}\/[A-Za-z0-9_.-]{1,100}$/, NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}\.jsonl?$/;
const clean = (c) => ({ repo: String(c.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '').split('/').slice(0, 2).join('/'), ref: String(c.ref || 'main').trim().slice(0, 60) || 'main', dir: String(c.dir || 'training-pack').trim().replace(/^\/+|\/+$/g, '').slice(0, 100) || 'training-pack', auto: c.auto !== false });
function config() { let c = {}; try { c = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch {} if (!c.repo && process.env.TULAI_TRAINING_REPO) c.repo = process.env.TULAI_TRAINING_REPO; return clean(c); }
function setConfig(c) { const v = clean({ ...config(), ...c }); if (v.repo && !REPO.test(v.repo)) throw new Error('Type the repo like  owner/name  (for example  myteam/tulai-training).'); if (/\.\.|[^A-Za-z0-9_./-]/.test(v.ref + v.dir)) throw new Error('The branch or folder has a character that is not allowed.'); fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(v), { mode: 0o600 }); return v; }
function get(url, hops = 0) {
  return new Promise((resolve, reject) => {
    const u = new URL(url); if (u.protocol !== 'https:' || !['raw.githubusercontent.com', 'github.com', 'objects.githubusercontent.com'].includes(u.hostname)) return reject(new Error('Only GitHub addresses are allowed.'));
    const req = https.get(u, { headers: { 'User-Agent': 'Tulai-training-pack' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && hops < 4) { res.resume(); return resolve(get(new URL(res.headers.location, u).href, hops + 1)); }
      if (res.statusCode === 404) { res.resume(); return reject(new Error('Not found on GitHub. Is the repo public, and does it have the folder with an index.json?')); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('GitHub answered ' + res.statusCode)); }
      const chunks = []; let n = 0; res.on('data', (c) => { n += c.length; if (n > 5e6) { req.destroy(new Error('A file is larger than 5 MB.')); } else chunks.push(c); }); res.on('end', () => resolve(Buffer.concat(chunks))); res.on('error', reject);
    }); req.on('error', reject); req.setTimeout(20000, () => req.destroy(new Error('GitHub did not answer in time.')));
  });
}
const base = (c) => `https://raw.githubusercontent.com/${c.repo}/${encodeURIComponent(c.ref)}/${c.dir.split('/').map(encodeURIComponent).join('/')}`;
/** Downloads the pack (if a repo is set) into <data>/training/custom/pack-*.jsonl. Never throws; returns the status. */
async function sync({ get: fetcher = get } = {}) {
  const c = config(), st = { at: Date.now(), repo: c.repo, ok: false, files: 0, rows: 0, skipped: 0, version: '', error: '' };
  try {
    if (!c.repo) throw new Error('No GitHub repo is set yet.');
    let idx; try { idx = JSON.parse((await fetcher(base(c) + '/index.json')).toString('utf8')); } catch (e) { if (/Not found/.test(e.message)) throw e; throw new Error('index.json could not be read: ' + e.message); }
    const files = (Array.isArray(idx.files) ? idx.files : []).filter((f) => f && NAME.test(String(f.name))).slice(0, 20); if (!files.length) throw new Error('The index.json lists no .jsonl files.');
    fs.mkdirSync(ct.dir(), { recursive: true }); const keep = new Set();
    for (const f of files) {
      const buf = await fetcher(base(c) + '/' + encodeURIComponent(f.name)); if (f.sha256 && crypto.createHash('sha256').update(buf).digest('hex') !== String(f.sha256).toLowerCase()) throw new Error(`${f.name} does not match its checksum in index.json; nothing was added from it.`);
      const rows = []; const text = buf.toString('utf8'); const items = f.name.endsWith('.jsonl') ? text.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }) : (() => { try { const j = JSON.parse(text); return Array.isArray(j) ? j : j.examples || []; } catch { return []; } })();
      for (const r of items) { const v = ct.validate(r); if (v.ok) rows.push(v.entry); else st.skipped++; }
      const out = 'pack-' + f.name.replace(/\.json$/, '.jsonl'); keep.add(out); fs.writeFileSync(path.join(ct.dir(), out + '.tmp'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 }); fs.renameSync(path.join(ct.dir(), out + '.tmp'), path.join(ct.dir(), out)); st.files++; st.rows += rows.length;
    }
    for (const x of fs.readdirSync(ct.dir())) if (/^pack-/.test(x) && !keep.has(x)) fs.rmSync(path.join(ct.dir(), x), { force: true }); // a file removed from the repo is removed here too
    st.ok = true; st.version = String(idx.version || '').slice(0, 40);
  } catch (e) { st.error = e.message; }
  try { fs.mkdirSync(path.dirname(logFile()), { recursive: true }); fs.writeFileSync(logFile(), JSON.stringify(st)); } catch {}
  return st;
}
const status = () => { let s = null; try { s = JSON.parse(fs.readFileSync(logFile(), 'utf8')); } catch {} return { config: config(), last: s }; };
/** Before a training run: refresh the pack at most once a day (and only when a repo is set and auto is on). */
async function beforeTraining() { const c = config(); if (!c.repo || !c.auto) return null; const s = status().last; if (s && s.ok && s.repo === c.repo && Date.now() - s.at < 20 * 3600000) return s; return sync(); }
module.exports = { config, setConfig, sync, status, beforeTraining, base };
