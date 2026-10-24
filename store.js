// File-based chat storage. Each chat is one JSON file; large images are moved out to media/ so chats stay small and nothing hits a browser quota.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA = () => process.env.GC_DATA_DIR || __dirname;
const CH = () => path.join(DATA(), 'chats');
const MD = () => path.join(DATA(), 'media');
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function externalize(v) {
  if (typeof v === 'string') {
    const m = v.length > 2000 && v.match(/^data:(image\/[a-z+]+);base64,/);
    if (!m) return v;
    const buf = Buffer.from(v.slice(m[0].length), 'base64');
    const name = crypto.createHash('sha1').update(buf).digest('hex').slice(0, 20) + '.' + (EXT[m[1]] || 'bin');
    fs.mkdirSync(MD(), { recursive: true });
    const f = path.join(MD(), name); if (!fs.existsSync(f)) fs.writeFileSync(f, buf);
    return 'media://' + name;
  }
  if (Array.isArray(v)) return v.map(externalize);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = externalize(v[k]); return o; }
  return v;
}
const safeId = (id) => { if (!/^[\w-]{1,40}$/.test(String(id))) throw new Error('Invalid chat id'); return String(id); };

function saveChat(chat) {
  const id = safeId(chat.id); fs.mkdirSync(CH(), { recursive: true });
  const f = path.join(CH(), id + '.json'), tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(externalize(chat))); fs.renameSync(tmp, f);
}
function listChats() {
  let files = []; try { files = fs.readdirSync(CH()).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) { try { out.push(JSON.parse(fs.readFileSync(path.join(CH(), f), 'utf8'))); } catch {} }
  return out.sort((a, b) => (b.updated || b.id) - (a.updated || a.id));
}
function deleteChat(id) { try { fs.rmSync(path.join(CH(), safeId(id) + '.json'), { force: true }); } catch {} }
function mediaFile(name) { return /^[a-f0-9]{20}\.(png|jpg|webp|gif|bin)$/.test(String(name)) ? path.join(MD(), name) : null; }
function mediaDataUrl(name) {
  const f = mediaFile(name); if (!f) return null;
  try { const ext = path.extname(f).slice(1); const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'application/octet-stream'; return `data:${mime};base64,${fs.readFileSync(f).toString('base64')}`; } catch { return null; }
}
function stats() {
  const sz = (d) => { let n = 0, b = 0; try { for (const f of fs.readdirSync(d)) { n++; b += fs.statSync(path.join(d, f)).size; } } catch {} return { n, b }; };
  const c = sz(CH()), m = sz(MD()); return { chats: c.n, media: m.n, bytes: c.b + m.b, dir: DATA() };
}
module.exports = { saveChat, listChats, deleteChat, mediaFile, mediaDataUrl, stats };
