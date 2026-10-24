// Release step: gives every skill pack its version. A pack's version changes only when the pack itself changed (its catalog entry, its generator code, the constants
// those use, its knowledge file), and then it becomes the version of this release. Writes training-config/pack-versions.json. Run by scripts/publish-update.js.
//   node scripts/pack-versions.js [--version 1.2.0]      (default: the version in package.json)    --check  only report, change nothing
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..'), vf = path.join(root, 'training-config', 'pack-versions.json');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
/** Top-level blocks of scripts/pack-skills.py: { name: source } for defs and NAME = ... assignments. */
function blocks(src) {
  const lines = src.split('\n'), out = {}; let name = null, buf = [];
  const flush = () => { if (name) out[name] = (out[name] || '') + buf.join('\n') + '\n'; name = null; buf = []; };
  for (const l of lines) { const m = /^(?:def (\w+)|([A-Za-z_]\w*)\s*=)/.exec(l); if (m) { flush(); name = m[1] || m[2]; buf = [l]; } else if (name && (/^[\s)\]}]/.test(l) || l === '')) buf.push(l); else if (name && /^#/.test(l)) { /* a comment line between blocks */ } else flush(); }
  flush(); return out;
}
function contentOf(pack, B) {
  const seen = new Set(), todo = [...pack.generators]; let text = JSON.stringify(pack); // everything the generators (and what they call) are made of
  while (todo.length) { const n = todo.pop(); if (seen.has(n) || !B[n]) continue; seen.add(n); text += '\n' + B[n]; for (const other of Object.keys(B)) if (other !== n && !seen.has(other) && new RegExp(`\\b${other}\\b`).test(B[n])) todo.push(other); }
  for (const f of ['jira-knowledge.json']) if (pack.id === 'jira-mastery') text += '\n' + fs.readFileSync(path.join(root, 'training-config', f), 'utf8');
  if (pack.springData) for (const f of ['springboot-practice.py', 'springboot-data.py']) text += '\n' + fs.readFileSync(path.join(__dirname, f), 'utf8'); // its practice and data reader are its content
  return text;
}
function compute(version, prev = {}) {
  const B = blocks(fs.readFileSync(path.join(__dirname, 'pack-skills.py'), 'utf8')), cat = JSON.parse(fs.readFileSync(process.env.TULAI_PACKS_CATALOG || path.join(root, 'training-config', 'skill-packs.json'), 'utf8')).packs, out = {};
  for (const p of cat) { const hash = sha(contentOf(p, B)), old = prev[p.id]; out[p.id] = { hash, version: old && old.hash === hash ? old.version : (version || (old && old.version) || '1.0.0') }; }
  return out;
}
module.exports = { compute, blocks };
if (require.main === module) {
  const args = process.argv.slice(2), version = args.includes('--version') ? args[args.indexOf('--version') + 1] : require('../package.json').version; let prev = {}; try { prev = JSON.parse(fs.readFileSync(vf, 'utf8')).packs || {}; } catch {}
  const next = compute(version, prev), changed = Object.keys(next).filter((k) => !prev[k] || prev[k].version !== next[k].version);
  if (!args.includes('--check')) fs.writeFileSync(vf, JSON.stringify({ about: 'Written by scripts/pack-versions.js at release time. A pack gets the release version only when its own content changed.', packs: next }, null, 1) + '\n');
  console.log(changed.length ? 'Skill packs updated in this release: ' + changed.map((k) => `${k} ${next[k].version}`).join(', ') : 'No skill pack changed.');
}
