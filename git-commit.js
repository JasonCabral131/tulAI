// "Commit my changes in <repo>": after the owner clicks Allow, stage and commit the changes of a local Git repository. Never pushes.
// Files that look like secrets (.env, keys, credentials) are never staged; the commit message lists what changed.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const SECRET = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx)|id_rsa|id_ed25519|credentials?[^/]*|secrets?[^/]*)$/i;
const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30000, maxBuffer: 16e6 });
/** The repository path, if it is a real Git work tree inside the home folder. Throws otherwise. */
function checkRepo(p) {
  let repo = path.resolve(String(p || '')); if (!fs.existsSync(path.join(repo, '.git'))) throw Error('That folder is not a Git repository.');
  repo = fs.realpathSync(repo); const home = fs.realpathSync(os.homedir()) + path.sep;
  if (!repo.startsWith(home)) throw Error('Only repositories inside your home folder can be committed.');
  return repo;
}
function changes(repo) { return git(repo, ['status', '--porcelain', '-z']).split('\0').filter(Boolean).map((l) => ({ code: l.slice(0, 2), file: l.slice(3) })).filter((c) => c.file); }
function commit(repo, message) {
  repo = checkRepo(repo); const ch = changes(repo); if (!ch.length) return 'Nothing to commit: the working tree is clean.';
  const secret = ch.filter((c) => SECRET.test(c.file)).map((c) => c.file), keep = ch.filter((c) => !SECRET.test(c.file)).map((c) => c.file);
  if (!keep.length) return 'Only secret-looking files changed (' + secret.join(', ') + '); nothing was committed.';
  git(repo, ['add', '--', ...keep]);
  for (const f of secret) { try { git(repo, ['reset', '-q', '--', f]); } catch {} } // never staged, even if they were before
  const staged = git(repo, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean); if (!staged.length) return 'Nothing staged to commit.';
  const msg = (message && message.trim()) || `Update ${staged.length} file${staged.length > 1 ? 's' : ''}: ${staged.slice(0, 5).map((f) => path.basename(f)).join(', ')}${staged.length > 5 ? ', …' : ''}`;
  git(repo, ['commit', '-q', '-m', msg]); const sha = git(repo, ['rev-parse', '--short', 'HEAD']).trim();
  return `Committed ${staged.length} file${staged.length > 1 ? 's' : ''} as ${sha} in ${path.basename(repo)}: "${msg}". Not pushed.${secret.length ? ' Skipped secret-looking files: ' + secret.join(', ') + '.' : ''}`;
}
/** Chat: "commit my changes in map-governance-ui" -> a permission card (nothing happens until Allow). */
function handle(text) {
  const t = String(text || '').trim(), m = /^(?:please\s+)?(?:auto[- ]?)?commit\b(?:\s+(?:all\s+)?(?:my\s+|the\s+)?(?:changes|work|files))?(?:\s+(?:in|for|on|to)\s+(.+?))?[.!]?$/i.exec(t);
  if (!m) return null;
  const target = m[1] || ''; const found = target ? (path.isAbsolute(target.replace(/^~/, os.homedir())) ? [target.replace(/^~/, os.homedir())] : require('./code-ingest').resolve(target)) : [];
  if (!found.length) return { reply: target ? `I could not find a Git repository called "${target}" in Desktop, Documents, Developer or Projects. Tell me its folder path.` : 'Which repository? Say for example: commit my changes in map-governance-ui.' };
  if (found.length > 1) return { reply: 'More than one repository matches: ' + found.map((f) => '`' + f + '`').join(', ') + '. Say the full path.' };
  let repo; try { repo = checkRepo(found[0]); } catch (e) { return { reply: e.message }; }
  const ch = changes(repo); if (!ch.length) return { reply: `Nothing to commit in ${path.basename(repo)}: the working tree is clean.` };
  const it = require('./approvals').request({ action: 'git-commit', title: `Commit ${ch.length} changed file${ch.length > 1 ? 's' : ''} in ${path.basename(repo)}`, why: ch.slice(0, 8).map((c) => c.file).join(', ') + (ch.length > 8 ? ', …' : '') + '. Secret-looking files are never staged. Nothing is pushed.', requestedBy: 'Tulai Bot', params: { repo } });
  return { reply: `**Waiting for your OK** to commit ${ch.length} changed file${ch.length > 1 ? 's' : ''} in **${path.basename(repo)}** (never pushed).\n\nPress **Allow** on the card.`, approval: it.id, via: 'git-commit' };
}
module.exports = { checkRepo, changes, commit, handle, SECRET };
