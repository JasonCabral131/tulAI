// "commit my changes in <repo>": a permission card first, nothing runs before Allow, secrets are never staged, nothing is pushed, only repos in the home folder.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-home-')); process.env.HOME = home; process.env.GC_DATA_DIR = path.join(home, 'data');
const repo = path.join(home, 'Desktop', 'demo-repo'); fs.mkdirSync(repo, { recursive: true });
const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
g('init', '-q'); g('config', 'user.email', 't@example.com'); g('config', 'user.name', 'T'); fs.writeFileSync(path.join(repo, 'a.js'), '1'); g('add', '.'); g('commit', '-qm', 'init');
fs.writeFileSync(path.join(repo, 'a.js'), '2'); fs.writeFileSync(path.join(repo, 'b.js'), 'new'); fs.writeFileSync(path.join(repo, '.env'), 'KEY=secret');
const G = require('../git-commit'), A = require('../approvals');
(async () => {
  const r = G.handle('commit my changes in demo-repo'); assert(/Waiting for your OK/.test(r.reply) && r.approval, r.reply);
  assert.strictEqual(g('rev-list', '--count', 'HEAD').trim(), '1', 'asking commits nothing');
  const done = await A.decide(r.approval, true); assert.strictEqual(done.status, 'done', done.result); assert(/Committed 2 files/.test(done.result) && /Not pushed/.test(done.result) && /\.env/.test(done.result), done.result);
  const files = g('show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean).sort(); assert.deepStrictEqual(files, ['a.js', 'b.js'], 'the secret file is not committed');
  assert(/\.env/.test(g('status', '--porcelain')), '.env stays uncommitted');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-out-')); execFileSync('git', ['-C', outside, 'init', '-q']); assert.throws(() => A.request({ action: 'git-commit', params: { repo: outside } }), /home folder/); assert.throws(() => A.request({ action: 'git-commit', params: { repo: '/etc' } }), /not a Git repository/);
  assert.strictEqual(G.handle('commit my changes in nothing-here').reply.includes('could not find'), true);
  assert.strictEqual(G.handle('what is a commit'), null);
  console.log('PASS git commit: Allow first, secrets never staged, never pushed, home-folder repos only');
})().catch((e) => { console.error(e); process.exit(1); });
