// Workspace snapshots using a shadow git repo stored in the app data dir (the user's own .git is never touched).
const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DATA = () => process.env.GC_DATA_DIR || __dirname;
const gdir = (ws) => path.join(DATA(), 'snapshots', crypto.createHash('sha1').update(ws).digest('hex').slice(0, 12));
const EXCLUDE = ['.git/', 'node_modules/', '.venv/', 'venv/', '__pycache__/', '.DS_Store', 'dist/', '.next/', 'target/', '*.log', '.cache/'];

function git(ws, args, input) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 'Gateway Chat', GIT_AUTHOR_EMAIL: 'snapshots@local', GIT_COMMITTER_NAME: 'Gateway Chat', GIT_COMMITTER_EMAIL: 'snapshots@local', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
  return new Promise((resolve, reject) => {
    const p = execFile('git', ['--git-dir', gdir(ws), '--work-tree', ws, '-c', 'core.autocrlf=false', '-c', 'core.quotepath=off', ...args], { env, maxBuffer: 64e6, timeout: 120000, cwd: ws }, (e, so, se) => (e ? reject(new Error((se || e.message).trim().slice(0, 400))) : resolve(so)));
    if (input) p.stdin.end(input);
  });
}
// Refuse folders that are too broad to snapshot (home folder, root, top-level dirs).
function unsafe(ws) {
  const home = os.homedir();
  if (!ws || ws === '/' || ws === home) return 'Snapshots are off for your home folder. Pick a project folder.';
  if (path.dirname(ws) === '/' || path.dirname(ws) === path.dirname(home)) return 'Snapshots are off for this folder. Pick a project folder.';
  return null;
}
async function ensure(ws) {
  const gd = gdir(ws);
  if (!fs.existsSync(path.join(gd, 'HEAD'))) {
    fs.mkdirSync(gd, { recursive: true });
    await git(ws, ['init', '-q']);
    fs.mkdirSync(path.join(gd, 'info'), { recursive: true });
    fs.writeFileSync(path.join(gd, 'info', 'exclude'), EXCLUDE.join('\n') + '\n');
  }
}
// Agent turns can finish close together and request a snapshot for the same
// workspace. Git allows only one writer per index, so queue snapshot writes by
// workspace instead of racing `git add` and colliding on index.lock.
const snapshotQueues = new Map();

async function create(ws, label) {
  const key = path.resolve(ws);
  const previous = snapshotQueues.get(key) || Promise.resolve();
  let release;
  const queued = new Promise((resolve) => { release = resolve; });
  snapshotQueues.set(key, queued);
  await previous.catch(() => {});
  try {
    const why = unsafe(ws); if (why) throw new Error(why);
    await ensure(ws);
    await git(ws, ['add', '-A']);
    await git(ws, ['commit', '-q', '--allow-empty', '-m', String(label || 'snapshot').slice(0, 200)]);
    const hash = (await git(ws, ['rev-parse', 'HEAD'])).trim();
    const n = (await git(ws, ['rev-list', '--count', 'HEAD'])).trim();
    if (+n % 50 === 0) git(ws, ['gc', '--auto', '-q']).catch(() => {});
    return { hash, label };
  } finally {
    release();
    if (snapshotQueues.get(key) === queued) snapshotQueues.delete(key);
  }
}
async function list(ws, n = 60) {
  const why = unsafe(ws); if (why) return { error: why, snapshots: [] };
  if (!fs.existsSync(path.join(gdir(ws), 'HEAD'))) return { snapshots: [] };
  const out = await git(ws, ['log', `-n${n}`, '--format=%H%x1f%ct%x1f%s']).catch(() => '');
  return { snapshots: out.split('\n').filter(Boolean).map((l) => { const [hash, ct, label] = l.split('\x1f'); return { hash, time: +ct * 1000, label }; }) };
}
async function restore(ws, hash) {
  if (!/^[0-9a-f]{7,40}$/.test(String(hash))) throw new Error('Invalid snapshot id');
  const why = unsafe(ws); if (why) throw new Error(why);
  await create(ws, 'before restore');                       // so the restore itself can be undone
  const now = (await git(ws, ['rev-parse', 'HEAD'])).trim();
  const added = (await git(ws, ['diff', '--name-only', '--diff-filter=A', '-z', hash, now])).split('\0').filter(Boolean);
  let removed = 0;
  for (const rel of added) { const f = path.resolve(ws, rel); if (f.startsWith(ws + path.sep) && fs.existsSync(f)) { fs.rmSync(f, { force: true }); removed++; } }
  await git(ws, ['checkout', hash, '--', '.']);
  const changed = (await git(ws, ['diff', '--name-only', hash, now])).split('\n').filter(Boolean).length;
  return { removed, changed };
}
async function diffStat(ws, hash) {
  if (!/^[0-9a-f]{7,40}$/.test(String(hash))) throw new Error('Invalid snapshot id');
  await ensure(ws); await git(ws, ['add', '-A']);
  return (await git(ws, ['diff', '--stat', '--no-color', hash])) || 'No differences from the current files.';
}
module.exports = { create, list, restore, diffStat, unsafe };
