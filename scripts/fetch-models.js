// Downloads the AI models Tulai needs (listed in models.json) and checks them. Safe to run again: it skips what is already there and
// correct, resumes an interrupted download, and refuses a file whose checksum is wrong.
//   node scripts/fetch-models.js            download what is missing
//   node scripts/fetch-models.js --check    only verify, download nothing
// Test hooks: TULAI_MODELS_MANIFEST (another manifest), TULAI_MODELS_DIR (another folder).
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const manifest = JSON.parse(fs.readFileSync(process.env.TULAI_MODELS_MANIFEST || path.join(__dirname, '..', 'models.json'), 'utf8'));
const DIR = (process.env.TULAI_MODELS_DIR || manifest.dir).replace(/^~/, os.homedir()), checkOnly = process.argv.includes('--check');
const mb = (n) => (n / 1048576).toFixed(0) + ' MB';
const sha = (f) => new Promise((res, rej) => { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (c) => h.update(c)).on('end', () => res(h.digest('hex'))).on('error', rej); });
async function ensure(m) {
  const file = path.join(DIR, m.file), part = file + '.part';
  const good = async () => fs.existsSync(file) && fs.statSync(file).size === m.bytes && (await sha(file)) === m.sha256;
  if (await good()) { console.log(`  ✓ ${m.file} (${mb(m.bytes)}) is ready`); return true; }
  if (checkOnly) { console.log(`  ✗ ${m.file} is ${fs.existsSync(file) ? 'damaged' : 'missing'}`); return false; }
  if (fs.existsSync(file)) fs.rmSync(file); fs.mkdirSync(DIR, { recursive: true });
  console.log(`  ↓ ${m.file}: ${m.what}\n    ${mb(m.bytes)} from ${new URL(m.url).host}${fs.existsSync(part) ? ` (resuming at ${mb(fs.statSync(part).size)})` : ''}`);
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = spawnSync('curl', ['-L', '--fail', '--retry', '3', '--retry-delay', '3', '-C', '-', '-o', part, '--progress-bar', m.url], { stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status === 0) break; if (attempt === 4) { console.log(`  ✗ download failed (curl exit ${r.status}). Run the same command again to resume.`); return false; } console.log(`  … retrying (${attempt}/3)`);
  }
  if (!fs.existsSync(part) || fs.statSync(part).size !== m.bytes) { console.log(`  ✗ ${m.file}: the download is incomplete (${fs.existsSync(part) ? mb(fs.statSync(part).size) : '0'} of ${mb(m.bytes)}). Run again to resume.`); return false; }
  process.stdout.write('    checking the checksum… '); const got = await sha(part);
  if (got !== m.sha256) { fs.rmSync(part); console.log(`WRONG (${got.slice(0, 12)}…). Removed it; run again.`); return false; }
  fs.renameSync(part, file); console.log('ok'); return true;
}
(async () => {
  console.log(`Tulai models → ${DIR}`); let ok = true;
  for (const m of manifest.models) { try { if (!(await ensure(m)) && m.required) ok = false; } catch (e) { console.log('  ✗', m.file, e.message); if (m.required) ok = false; } }
  console.log(ok ? (checkOnly ? 'All models are in place.' : 'Models ready.') : 'Some required models are missing.'); process.exit(ok ? 0 : 1);
})();
