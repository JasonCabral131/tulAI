// The GitHub training pack: set a repo, download index + files, verify checksums, drop secrets, replace old pack files, never trust a bad address.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-tp-')); process.env.GC_DATA_DIR = tmp;
const tp = require('../training-pack'), ct = require('../custom-training');
(async () => {
  assert.strictEqual(tp.config().repo, ''); assert((await tp.sync()).error.includes('No GitHub repo'));
  assert.throws(() => tp.setConfig({ repo: 'not a repo' }), /owner\/name/); assert.throws(() => tp.setConfig({ repo: 'a/b', dir: '../x' }), /not allowed/);
  assert.strictEqual(tp.setConfig({ repo: 'https://github.com/acme/tulai-training.git' }).repo, 'acme/tulai-training');
  const file = Buffer.from([{ prompt: 'who leads QA?', answer: 'Mia leads QA.', memory: ['QA lead is Mia'] }, { prompt: 'my password is x', answer: 'ok' }, { check: true, prompt: 'who leads QA?', match: 'Mia' }].map((x) => JSON.stringify(x)).join('\n') + '\nnot json\n');
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex'); const served = {}; const urls = [];
  const fetcher = async (u) => { urls.push(u); const n = u.split('/').pop(); if (!(n in served)) throw new Error('Not found on GitHub.'); return Buffer.from(served[n]); };
  served['index.json'] = JSON.stringify({ version: 3, files: [{ name: 'team.jsonl', sha256: sha(file) }, { name: '../evil.jsonl' }, { name: 'notes.txt' }] }); served['team.jsonl'] = file.toString();
  let st = await tp.sync({ get: fetcher }); assert(st.ok && st.files === 1 && st.rows === 2 && st.skipped === 2 && st.version === '3', JSON.stringify(st));
  assert(urls[0] === 'https://raw.githubusercontent.com/acme/tulai-training/main/training-pack/index.json', urls[0]);
  const L = ct.list(); assert(L.examples.length === 1 && L.checks.length === 1 && L.examples[0].file === 'pack-team.jsonl', 'pack rows join your own training');
  assert(!JSON.stringify(L).includes('password'), 'a secret in the pack is dropped');
  served['index.json'] = JSON.stringify({ version: 4, files: [{ name: 'team.jsonl', sha256: '0'.repeat(64) }] }); st = await tp.sync({ get: fetcher }); assert(!st.ok && /checksum/.test(st.error), st.error);
  served['index.json'] = JSON.stringify({ version: 5, files: [{ name: 'other.jsonl' }] }); served['other.jsonl'] = JSON.stringify({ prompt: 'deploy day?', answer: 'Thursday.' }) + '\n'; st = await tp.sync({ get: fetcher }); assert(st.ok);
  assert(!fs.existsSync(path.join(ct.dir(), 'pack-team.jsonl')) && fs.existsSync(path.join(ct.dir(), 'pack-other.jsonl')), 'a file removed from the repo disappears here');
  delete served['index.json']; st = await tp.sync({ get: fetcher }); assert(!st.ok && /Not found/.test(st.error));
  // only GitHub is ever contacted
  const real = require('../training-pack'); await assert.rejects(() => real.sync({ get: async () => { throw new Error('x'); } }).then((s) => { assert(!s.ok); throw new Error('ok'); }), /ok/);
  assert(tp.status().last && tp.status().config.repo === 'acme/tulai-training');
  // the shipped starter pack is well-formed and its index matches the files
  const dir = path.join(__dirname, '..', 'training-pack'), idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); assert(idx.files.length >= 1);
  for (const f of idx.files) assert.strictEqual(sha(fs.readFileSync(path.join(dir, f.name))), f.sha256, f.name + ' changed: run node scripts/make-training-pack.js');
  fs.rmSync(tmp, { recursive: true, force: true }); console.log('PASS GitHub training pack: download, checksum, validation, replace, safe addresses, starter pack index matches');
})().catch((e) => { console.error(e); process.exit(1); });
