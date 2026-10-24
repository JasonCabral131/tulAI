// Your own training: examples ("when I say this, answer like this") and checks ("the answer must say / must not say") that are added to every local
// fine-tuning run on this Mac. Stored as one JSON line each in <data folder>/training/custom/mine.jsonl, so you can also edit or drop in files by hand
// (any .jsonl or .json file in that folder is read). Nothing here leaves the Mac. Passwords, keys and card numbers are refused.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const dataDir = () => process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat');
const dir = () => path.join(dataDir(), 'training', 'custom'), mine = () => path.join(dir(), 'mine.jsonl');
const SECRET = /\b(password|passcode|api[ -]?key|secret|token|credit card|card number|cvv|ssn|private key)\b|\bsk-[a-z0-9]{6,}|\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}\b/i;
const MAX = 2000, LEN = 1500;
const str = (v, n = LEN) => String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, n);
/** Checks one entry; returns { ok, entry } or { ok:false, why }. */
function validate(e) {
  if (!e || typeof e !== 'object') return { ok: false, why: 'not an object' };
  const memory = Array.isArray(e.memory) ? e.memory.map((m) => str(m, 240)).filter(Boolean).slice(0, 8) : [];
  if (e.check) {
    const prompt = str(e.prompt); if (prompt.length < 3) return { ok: false, why: 'a check needs a prompt' };
    if (!str(e.match, 200) && !str(e.not, 200)) return { ok: false, why: 'a check needs "match" (what the answer must contain) or "not"' };
    for (const k of ['match', 'not']) if (e[k]) { try { new RegExp(e[k]); } catch { return { ok: false, why: `"${k}" is not a valid pattern` }; } }
    if (SECRET.test(prompt + ' ' + memory.join(' '))) return { ok: false, why: 'it looks like it contains a secret' };
    return { ok: true, entry: { check: true, prompt, match: str(e.match, 200), not: str(e.not, 200), ...(+e.maxWords > 0 ? { maxWords: Math.min(400, +e.maxWords) } : {}), ...(memory.length ? { memory } : {}) } };
  }
  let prompt = str(e.prompt), answer = str(e.answer);
  if (Array.isArray(e.messages) && e.messages.length >= 2) { const last = e.messages[e.messages.length - 1], q = [...e.messages].reverse().find((m) => m && m.role === 'user'); if (!last || last.role !== 'assistant' || !q) return { ok: false, why: 'messages must end with an assistant reply after a user message' }; prompt = str(q.content); answer = str(last.content); }
  if (prompt.length < 3) return { ok: false, why: 'the question is too short' }; if (!answer) return { ok: false, why: 'the answer is empty' };
  if (SECRET.test(prompt + ' ' + answer + ' ' + memory.join(' '))) return { ok: false, why: 'it looks like it contains a secret (password, key, card number)' };
  return { ok: true, entry: { prompt, answer, ...(memory.length ? { memory } : {}) } };
}
function readAll() {
  const out = []; let names = []; try { names = fs.readdirSync(dir()).filter((f) => /\.jsonl?$/.test(f)).sort(); } catch { return out; }
  for (const f of names) {
    let rows = []; const txt = (() => { try { return fs.readFileSync(path.join(dir(), f), 'utf8'); } catch { return ''; } })();
    if (f.endsWith('.jsonl')) rows = txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }); else { try { const j = JSON.parse(txt); rows = Array.isArray(j) ? j : j.examples || []; } catch {} }
    for (const r of rows) { const v = validate(r); if (v.ok) out.push({ id: str(r.id, 24) || crypto.createHash('sha1').update(JSON.stringify(v.entry)).digest('hex').slice(0, 10), file: f, ...v.entry }); }
  }
  return out;
}
function list() { const all = readAll(); return { dir: dir(), examples: all.filter((x) => !x.check), checks: all.filter((x) => x.check), max: MAX }; }
function writeMine(rows) { fs.mkdirSync(dir(), { recursive: true }); const f = mine(); fs.writeFileSync(f + '.tmp', rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), { mode: 0o600 }); fs.renameSync(f + '.tmp', f); }
const mineRows = () => { try { return fs.readFileSync(mine(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
function add(e) {
  const v = validate(e); if (!v.ok) throw new Error(v.why); const rows = mineRows(); if (readAll().length >= MAX) throw new Error(`You already have ${MAX} entries. Remove some first.`);
  const key = JSON.stringify(v.entry); if (rows.some((r) => { const x = validate(r); return x.ok && JSON.stringify(x.entry) === key; })) throw new Error('You already added exactly this.');
  const entry = { id: crypto.randomBytes(5).toString('hex'), ...v.entry }; rows.push(entry); writeMine(rows); return entry;
}
function remove(id) { const rows = mineRows(), keep = rows.filter((r) => r.id !== id); if (keep.length === rows.length) throw new Error('That entry is in a file you added by hand; delete it from that file.'); writeMine(keep); return { ok: true }; }
/** Text of a .jsonl or .json file (or pasted lines): adds the good entries, reports why the others were skipped. */
function importText(text) {
  const t = String(text || '').trim(); let rows = [];
  if (t.startsWith('[')) { try { rows = JSON.parse(t); } catch { throw new Error('That is not valid JSON.'); } } else rows = t.split('\n').filter(Boolean).map((l, i) => { try { return JSON.parse(l); } catch { return { __bad: i + 1 }; } });
  let added = 0; const skipped = [];
  rows.forEach((r, i) => { if (r && r.__bad) return skipped.push(`line ${r.__bad}: not valid JSON`); try { add(r); added++; } catch (e) { skipped.push(`entry ${i + 1}: ${e.message}`); } });
  return { added, skipped: skipped.slice(0, 20), skippedCount: skipped.length };
}
module.exports = { list, add, remove, importText, validate, dir, SECRET };
