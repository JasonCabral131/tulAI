// Models from Hugging Face that run on this Mac: search (GGUF only), check that one fits your memory, download it (resumable, SHA-256 checked),
// and run it with the same llama.cpp server as our own brain, on its own port. Nothing you type is sent anywhere: only the search words and the download.
const fs = require('fs'), path = require('path'), os = require('os'), https = require('https'), crypto = require('crypto'), cp = require('child_process');
const DATA = () => process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat');
const DIR = () => path.join(DATA(), 'models', 'hf'), INDEX = () => path.join(DIR(), 'index.json');
const PORT = +(process.env.TULAY_LLM_PORT || 39656) + 2; // 39658: our brain uses 39656, its long copy 39657
const PREFER = ['q4_k_m', 'q4_k_s', 'q5_k_m', 'q4_0', 'iq4_xs', 'q5_k_s', 'q6_k', 'q8_0', 'q3_k_m'];
/** Biggest model file that runs well: about 60% of this Mac's memory (24 GB -> 14.4 GB), leaving room for macOS, Tulai and our own brain. */
const maxBytes = () => Math.floor(os.totalmem() * 0.6);
const gb = (n) => (n / 1e9).toFixed(1) + ' GB';

function getJSON(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Tulai', Accept: 'application/json' }, timeout }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return resolve(getJSON(new URL(r.headers.location, url).href, timeout)); }
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => { if (r.statusCode !== 200) return reject(Error(r.statusCode === 401 || r.statusCode === 403 ? 'This model is gated: accept its license on huggingface.co first.' : `Hugging Face answered ${r.statusCode}.`)); try { resolve(JSON.parse(b)); } catch (e) { reject(e); } });
    }).on('error', reject).on('timeout', function () { this.destroy(Error('Hugging Face did not answer in time.')); });
  });
}
const quantOf = (f) => (/(?:^|[-_.])(iq\d_(?:xxs|xs|s|m|nl)|q\d_k_(?:xl|l|m|s)|q\d_k|q\d_[01]|bf16|f16|f32)(?=[-_.]|$)/i.exec(f) || [])[1] || '';
const split = (f) => /-(\d{5})-of-(\d{5})\.gguf$/i.exec(f);
/** The best file of a repository: a 4-bit quant (Q4_K_M first) that fits this Mac; split files count as one (all parts). */
function bestFile(files) {
  const g = files.filter((f) => /\.gguf$/i.test(f.path) && !/mmproj|imatrix/i.test(f.path)), groups = new Map();
  for (const f of g) { const s = split(f.path), key = s ? f.path.replace(/-\d{5}-of-\d{5}\.gguf$/i, '') : f.path; const e = groups.get(key) || { key, parts: [], size: 0 }; e.parts.push(f); e.size += f.size || 0; groups.set(key, e); }
  const all = [...groups.values()].map((e) => ({ ...e, quant: quantOf(e.key).toLowerCase(), parts: e.parts.sort((a, b) => a.path.localeCompare(b.path)) }));
  const rank = (e) => { const i = PREFER.indexOf(e.quant); return i < 0 ? 99 : i; };
  return all.filter((e) => e.size && e.size <= maxBytes()).sort((a, b) => rank(a) - rank(b) || b.size - a.size)[0] || null;
}
/** "qwen coder 7b": the most downloaded GGUF repositories, each with the file Tulai would use and whether it fits. */
async function search(q, limit = 8) {
  const words = String(q || '').trim().slice(0, 80); if (!words) return [];
  const repos = await getJSON(`https://huggingface.co/api/models?search=${encodeURIComponent(words)}&filter=gguf&sort=downloads&direction=-1&limit=${limit}`);
  const out = [];
  for (const r of repos.slice(0, limit)) {
    let files = []; try { files = await getJSON(`https://huggingface.co/api/models/${r.id}/tree/main`); } catch { continue; }
    const best = bestFile(files), smallest = files.filter((f) => /\.gguf$/i.test(f.path)).sort((a, b) => a.size - b.size)[0];
    out.push({ repo: r.id, downloads: r.downloads || 0, likes: r.likes || 0, file: best ? best.parts[0].path : '', parts: best ? best.parts.map((p) => ({ path: p.path, size: p.size, sha256: (p.lfs || {}).oid || '' })) : [], size: best ? best.size : 0, quant: best ? best.quant.toUpperCase() : '', fits: !!best, tooBig: !best && smallest ? gb(smallest.size) : '' });
  }
  return out;
}

// ----- downloads -----
const jobs = new Map(); // repo -> { done, total, state, error, file }
const index = () => { try { return JSON.parse(fs.readFileSync(INDEX(), 'utf8')); } catch { return []; } };
const saveIndex = (a) => { fs.mkdirSync(DIR(), { recursive: true }); fs.writeFileSync(INDEX(), JSON.stringify(a, null, 2)); };
/** Downloaded models: { name, repo, file (first part, full path), size, quant, at }. */
const downloaded = () => index().filter((m) => fs.existsSync(m.file));
function fetchTo(url, dest, onBytes, signal) {
  return new Promise((resolve, reject) => {
    const have = fs.existsSync(dest + '.part') ? fs.statSync(dest + '.part').size : 0;
    const req = https.get(url, { headers: { 'User-Agent': 'Tulai', ...(have ? { Range: `bytes=${have}-` } : {}) }, signal }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { r.resume(); return resolve(fetchTo(new URL(r.headers.location, url).href, dest, onBytes, signal)); }
      if (![200, 206].includes(r.statusCode)) { r.resume(); return reject(Error(r.statusCode === 401 || r.statusCode === 403 ? 'This model is gated: accept its license on huggingface.co first.' : `Download failed (${r.statusCode}).`)); }
      const append = r.statusCode === 206; if (!append && have) onBytes(-have);
      const w = fs.createWriteStream(dest + '.part', { flags: append ? 'a' : 'w' });
      r.on('data', (c) => onBytes(c.length)); r.pipe(w); w.on('finish', resolve); r.on('error', reject); w.on('error', reject);
    }); req.on('error', reject);
  });
}
function sha256(file) { return new Promise((resolve, reject) => { const h = crypto.createHash('sha256'); fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject); }); }
/** Starts downloading a search result (repo + parts). Progress: status(repo). */
function download(item) {
  if (!item || !item.repo || !Array.isArray(item.parts) || !item.parts.length) throw Error('Pick a model from the search first.');
  if (item.size > maxBytes()) throw Error(`${item.repo} needs ${gb(item.size)}; this Mac can run models up to about ${gb(maxBytes())}.`);
  const free = (() => { try { const s = fs.statfsSync(DATA()); return s.bavail * s.bsize; } catch { return Infinity; } })();
  if (item.size + 2e9 > free) throw Error(`Not enough disk space: ${gb(item.size)} needed, ${gb(free)} free.`);
  const j = jobs.get(item.repo); if (j && j.state === 'downloading') return j;
  const dir = path.join(DIR(), item.repo.replace(/[^\w.-]+/g, '--')); fs.mkdirSync(dir, { recursive: true });
  const job = { repo: item.repo, done: 0, total: item.size, state: 'downloading', error: '', file: path.join(dir, path.basename(item.parts[0].path)), ctl: new AbortController() }; jobs.set(item.repo, job);
  (async () => {
    try {
      for (const p of item.parts) {
        const dest = path.join(dir, path.basename(p.path)); if (fs.existsSync(dest)) { job.done += p.size; continue; }
        if (fs.existsSync(dest + '.part')) job.done += fs.statSync(dest + '.part').size;
        await fetchTo(`https://huggingface.co/${item.repo}/resolve/main/${p.path.split('/').map(encodeURIComponent).join('/')}`, dest, (n) => { job.done += n; }, job.ctl.signal);
        job.state = 'checking'; if (p.sha256 && (await sha256(dest + '.part')) !== p.sha256) { fs.rmSync(dest + '.part', { force: true }); throw Error('The download did not match its checksum and was deleted. Try again.'); }
        fs.renameSync(dest + '.part', dest); job.state = 'downloading';
      }
      const list = index().filter((m) => m.repo !== item.repo); list.push({ name: item.repo.split('/').pop().replace(/-GGUF$/i, ''), repo: item.repo, file: job.file, size: item.size, quant: item.quant, at: Date.now() }); saveIndex(list);
      job.state = 'done';
    } catch (e) { job.state = 'failed'; job.error = e.name === 'AbortError' ? 'Cancelled (it resumes if you download again).' : e.message; }
  })();
  return job;
}
const status = (repo) => { const j = jobs.get(repo); return j ? { repo, state: j.state, done: j.done, total: j.total, percent: j.total ? Math.floor(j.done * 100 / j.total) : 0, error: j.error, file: j.file } : null; };
const allStatus = () => [...jobs.keys()].map(status);
function cancel(repo) { const j = jobs.get(repo); if (j && j.state === 'downloading') { j.ctl.abort(); return true; } return false; }
function remove(file) { const m = index().find((x) => x.file === file); if (!m) return false; for (const f of fs.readdirSync(path.dirname(m.file))) fs.rmSync(path.join(path.dirname(m.file), f), { force: true }); saveIndex(index().filter((x) => x.file !== file)); stop(); return true; }

// ----- running one downloaded model -----
let proc = null, running = '', idle = null;
const serverBin = () => [path.join(process.resourcesPath || '', 'bin', 'llama-server'), path.join(__dirname, 'build', 'bin', 'llama-server'), '/opt/homebrew/bin/llama-server', '/usr/local/bin/llama-server'].find((p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } });
function stop() { clearTimeout(idle); if (proc) { try { proc.kill(); } catch {} } proc = null; running = ''; }
const touch = () => { clearTimeout(idle); idle = setTimeout(stop, 15 * 60000); if (idle.unref) idle.unref(); };
async function up(timeout = 1500) { try { const r = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(timeout) }); return r.ok; } catch { return false; } }
/** Makes sure this downloaded model is the one running on its port (starting it takes a few seconds; it stops after 15 idle minutes). */
async function ensure(file) {
  const m = downloaded().find((x) => x.file === file || path.basename(x.file) === path.basename(String(file)));
  if (!m) throw Error('That model is not downloaded (any more). Say "search model ..." to find one.');
  if (running === m.file && (await up())) { touch(); return `http://127.0.0.1:${PORT}`; }
  stop(); const bin = serverBin(); if (!bin) throw Error('The llama.cpp server is missing. Run Tulai setup.');
  proc = cp.spawn(bin, ['-m', m.file, '--host', '127.0.0.1', '--port', String(PORT), '-c', '16384', '-ngl', '99', '-np', '1', '--jinja', '--no-webui', '--log-disable'], { stdio: 'ignore' }); running = m.file;
  proc.on('exit', () => { if (running === m.file) { proc = null; running = ''; } });
  for (let i = 0; i < 240; i++) { if (await up(1000)) { touch(); return `http://127.0.0.1:${PORT}`; } if (!proc) throw Error('The model stopped while loading (it may not be a chat model llama.cpp supports).'); await new Promise((r) => setTimeout(r, 500)); }
  stop(); throw Error('The model took too long to load.');
}
module.exports = { search, download, status, allStatus, cancel, remove, downloaded, ensure, stop, bestFile, maxBytes, PORT, gb };
