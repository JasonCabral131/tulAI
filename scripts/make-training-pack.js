// Builds training-pack/index.json (the list of files with their checksums) so you can push the folder to GitHub.
//   node scripts/make-training-pack.js [folder]        (default: training-pack)
const fs = require('fs'), path = require('path'), crypto = require('crypto'), ct = require('../custom-training');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'training-pack')); let version = 1;
try { version = (JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).version | 0) + 1; } catch {}
const files = []; let rows = 0, bad = 0;
for (const f of fs.readdirSync(dir).filter((x) => /^[A-Za-z0-9][A-Za-z0-9_.-]*\.jsonl$/.test(x)).sort()) {
  const buf = fs.readFileSync(path.join(dir, f)); const lines = buf.toString('utf8').split('\n').filter(Boolean); let ok = 0;
  for (const l of lines) { let v = { ok: false }; try { v = ct.validate(JSON.parse(l)); } catch {} if (v.ok) ok++; else { bad++; console.log(`  skipped in ${f}: ${l.slice(0, 80)}`); } }
  files.push({ name: f, rows: ok, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }); rows += ok;
}
fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ version, files }, null, 2) + '\n');
console.log(`training-pack/index.json: version ${version}, ${files.length} file(s), ${rows} usable row(s)${bad ? `, ${bad} row(s) will be ignored by installs` : ''}.\nPush the folder to your public GitHub repo; installs download it when they train.`);
