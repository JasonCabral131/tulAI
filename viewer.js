// Shows files inside the Tulai Bot chat: pictures, PDFs, video and audio, text and code, Office documents, archives.
// A file is only ever shown after Tulai itself found it for you (or you dropped/pasted it into the chat); the chat then gets a short random id,
// never a path, so a web page cannot ask for arbitrary files. Pictures can also be read (OCR) on this Mac with Apple's Vision.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const HOME = os.homedir(), REG = new Map(), MAX_REG = 300;
const uploads = () => path.join(process.env.GC_DATA_DIR || path.join(HOME, 'Library', 'Application Support', 'gateway-chat'), 'uploads');
const KINDS = {
  image: 'png jpg jpeg gif webp svg bmp heic heif tiff tif avif ico', pdf: 'pdf', video: 'mp4 mov m4v webm', audio: 'mp3 m4a wav aac flac ogg aiff',
  text: 'txt md markdown json jsonl csv tsv log js mjs cjs ts tsx jsx py java go rb rs c h cpp hpp cs css scss sql sh zsh yml yaml xml toml ini conf env.example swift kt php lua r gradle properties diff patch gitignore dockerfile makefile',
  html: 'html htm', office: 'docx doc xlsx xls pptx ppt pages numbers key rtf odt ods odp', archive: 'zip',
};
const kindOf = (ext) => { ext = String(ext).toLowerCase().replace(/^\./, ''); for (const [k, v] of Object.entries(KINDS)) if (v.split(' ').includes(ext)) return k; return 'other'; };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', pdf: 'application/pdf', mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac', flac: 'audio/flac', ogg: 'audio/ogg', aiff: 'audio/aiff' };
const NEEDS_CONVERT = new Set(['heic', 'heif', 'tiff', 'tif']);
/** Where files may be shown from: inside your home folder, never secrets or system areas. */
const FORBIDDEN = /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube|\.config\/gcloud|Keychains|Library\/(?:Keychains|Cookies|Mail|Messages|Safari)|node_modules)(\/|$)|(^|\/)\.env(\.|$)|id_(rsa|ed25519|ecdsa)|\.pem$|\.p12$|\.keychain|credential|\.netrc$/i;
function allowed(p) {
  const abs = path.resolve(String(p || '')); let real; try { real = fs.realpathSync(abs); } catch { return null; }
  const rel = path.relative(HOME, real); if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  let up = ''; try { up = fs.realpathSync(uploads()); } catch { up = path.resolve(uploads()); }
  if (real.startsWith(up + path.sep)) return real; // what you dropped or pasted into the chat
  if (rel.split(path.sep).some((s) => s.startsWith('.')) || /^Library(\/|$)/.test(rel) || FORBIDDEN.test('/' + rel)) return null; // hidden folders, Library and secrets are never shown
  return real;
}
/** Gives a file an id for the chat. Returns { id, name, ext, kind, size, mime } or null when it must not be shown. */
function register(p) {
  const real = allowed(p); if (!real) return null; let st; try { st = fs.statSync(real); } catch { return null; } if (!st.isFile() || st.size > 400 * 1048576) return null;
  const ext = path.extname(real).slice(1).toLowerCase(), kind = kindOf(ext || path.basename(real).toLowerCase()), id = crypto.randomBytes(9).toString('base64url');
  REG.set(id, { path: real, name: path.basename(real), ext, kind, size: st.size, at: Date.now() }); if (REG.size > MAX_REG) REG.delete(REG.keys().next().value);
  const d = { id, name: path.basename(real), ext, kind, size: st.size, mime: MIME[ext] || '' }; last = { ...d }; lastAt = Date.now(); return d;
}
let last = null, lastAt = 0; const getLast = () => (last && Date.now() - lastAt < 15 * 60000 ? last : null), setLast = (d) => { last = d; lastAt = Date.now(); }; // "that screenshot" means the one in the chat just now, not one from this morning
const get = (id) => REG.get(String(id));
const human = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? Math.round(n / 1024) + ' KB' : n + ' B');

/* ---------- finding files by what you say ---------- */
const ROOTS = () => ['Desktop', 'Downloads', 'Documents', 'Pictures', 'Movies'].map((r) => path.join(HOME, r)).filter((d) => fs.existsSync(d));
function walk(dir, depth, out, filter, limit = 4000) {
  let items; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const it of items) { if (out.length > limit) return; if (it.name.startsWith('.') || it.name === 'node_modules') continue; const p = path.join(dir, it.name); if (it.isFile()) { if (filter(it.name)) { try { out.push({ path: p, name: it.name, mtime: fs.statSync(p).mtimeMs }); } catch {} } } else if (it.isDirectory() && depth > 0 && !/\.app$|\.photoslibrary$/.test(it.name)) walk(p, depth - 1, out, filter, limit); }
}
const LATEST = { screenshot: (n) => /^(screenshot|screen shot|cleanshot)/i.test(n) && /\.(png|jpg|jpeg)$/i.test(n), recording: (n) => /^(screen recording|recording)/i.test(n) || /\.(mov|mp4)$/i.test(n), image: (n) => /\.(png|jpe?g|gif|webp|heic)$/i.test(n), photo: (n) => /\.(png|jpe?g|heic)$/i.test(n), picture: (n) => /\.(png|jpe?g|gif|webp|heic)$/i.test(n), pdf: (n) => /\.pdf$/i.test(n), download: () => true, file: () => true, document: (n) => /\.(pdf|docx?|pptx?|xlsx?|txt|md|pages|key|numbers)$/i.test(n), video: (n) => /\.(mp4|mov|m4v|webm)$/i.test(n), spreadsheet: (n) => /\.(xlsx?|csv|numbers)$/i.test(n), presentation: (n) => /\.(pptx?|key)$/i.test(n) };
/** "latest screenshot" / "my last download" / "the newest pdf": the most recently changed match. */
function latest(what, n = 1) {
  const w = String(what).toLowerCase().replace(/s$/, '').replace(/^screen ?recording$/, 'recording'), f = LATEST[w]; if (!f) return [];
  const roots = w === 'download' ? [path.join(HOME, 'Downloads')] : w === 'screenshot' ? [path.join(HOME, 'Desktop'), path.join(HOME, 'Pictures'), path.join(HOME, 'Downloads')] : ROOTS(), out = [];
  for (const r of roots) walk(r, w === 'screenshot' || w === 'download' ? 1 : 2, out, f); return out.sort((a, b) => b.mtime - a.mtime).slice(0, n);
}
/** "report.pdf", "budget 2026.xlsx", or part of a name: best match first. */
function byName(name) {
  const q = String(name).toLowerCase().trim(), toks = q.replace(/\.[a-z0-9]{2,5}$/, '').split(/[^a-z0-9]+/).filter((t) => t.length > 1), out = [];
  if (!toks.length) return []; walk(HOME, 0, out, () => false); for (const r of ROOTS()) walk(r, 3, out, (n) => { const l = n.toLowerCase(); return l === q || toks.every((t) => l.includes(t)); });
  return out.sort((a, b) => ((b.name.toLowerCase() === q) - (a.name.toLowerCase() === q)) || b.mtime - a.mtime).slice(0, 5);
}

/* ---------- reading and previewing ---------- */
const run = (cmd, args, timeout = 30000) => new Promise((res) => execFile(cmd, args, { timeout, maxBuffer: 16e6 }, (e, so, se) => res({ ok: !e, out: String(so || ''), err: String(se || '') })));
const ocrBin = () => [path.join(process.resourcesPath || '', 'bin', 'tulay-ocr'), path.join(__dirname, 'build', 'bin', 'tulay-ocr')].find((p) => fs.existsSync(p)) || null;
async function ocr(file) { const b = ocrBin(); if (!b) throw new Error('The picture-reading helper is not installed.'); const r = await run(b, [file], 40000); if (!r.ok) throw new Error((r.err || 'could not read the picture').split('\n')[0]); return r.out.replace(/\n{3,}/g, '\n\n').trim(); }
const cacheDir = () => { const d = path.join(os.tmpdir(), 'tulai-view-cache'); fs.mkdirSync(d, { recursive: true }); return d; };
/** A PNG of the first page of Office files, or a PNG version of HEIC/TIFF pictures (what a web view can draw). */
async function thumb(entry, size = 1100) {
  const out = path.join(cacheDir(), crypto.createHash('md5').update(entry.path + entry.size + size).digest('hex') + '.png'); if (fs.existsSync(out)) return out;
  if (entry.kind === 'image') { const r = await run('/usr/bin/sips', ['-s', 'format', 'png', '-Z', String(size), entry.path, '--out', out], 30000); return r.ok && fs.existsSync(out) ? out : null; }
  const tmp = fs.mkdtempSync(path.join(cacheDir(), 'ql-')); const r = await run('/usr/bin/qlmanage', ['-t', '-s', String(size), '-o', tmp, entry.path], 30000); const f = fs.readdirSync(tmp).find((x) => x.endsWith('.png'));
  if (!r.ok && !f) return null; if (f) { fs.copyFileSync(path.join(tmp, f), out); try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} return out; } return null;
}
function readText(entry, max = 24000) {
  const fd = fs.openSync(entry.path, 'r'); try { const buf = Buffer.alloc(Math.min(max + 1, entry.size)); fs.readSync(fd, buf, 0, buf.length, 0); const t = buf.toString('utf8'); if (/\u0000/.test(t.slice(0, 2000))) return null; return { text: t.slice(0, max), truncated: entry.size > max }; } finally { fs.closeSync(fd); }
}
async function zipList(entry) { const r = await run('/usr/bin/unzip', ['-Z1', entry.path], 15000); if (!r.ok) return null; const all = r.out.split('\n').filter(Boolean); return { count: all.length, files: all.slice(0, 40) }; }
/** What the chat card needs besides the file itself. */
async function info(id) {
  const e = get(id); if (!e) return null; const base = { name: e.name, kind: e.kind, ext: e.ext, size: human(e.size) };
  if (e.kind === 'text') { const t = readText(e); return t ? { ...base, ...t } : { ...base, binary: true }; }
  if (e.kind === 'archive') return { ...base, ...(await zipList(e) || {}) };
  return base;
}

/* ---------- saving what you drop or paste into the chat ---------- */
function saveUpload(name, buf) {
  const safeName = path.basename(String(name || 'pasted')).replace(/[^\w .()\-]+/g, '_').slice(0, 80) || 'file'; fs.mkdirSync(uploads(), { recursive: true });
  for (const f of fs.readdirSync(uploads())) { const p = path.join(uploads(), f); try { if (Date.now() - fs.statSync(p).mtimeMs > 14 * 864e5) fs.rmSync(p, { force: true }); } catch {} }
  const p = path.join(uploads(), `${Date.now()}-${safeName}`); fs.writeFileSync(p, buf, { mode: 0o600 }); return register(p);
}
module.exports = { register, get, info, latest, byName, ocr, thumb, readText, kindOf, getLast, setLast, saveUpload, uploads, allowed, human, MIME, NEEDS_CONVERT };
