// Voice rules for a software engineer's working day, answered on this Mac with no AI call (instant, free, private):
// git (status, branch, commits, unpushed work, pull/rebase, new branch), the ticket and merge request of the current branch,
// running tests/lint/build, ports and Docker, small developer utilities (uuid, timestamps, base64, JSON) and "explain what I copied".
// Anything that changes something (pull, switch branch, kill a process) asks for a clear yes first.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const sh = (cmd, args, cwd, timeout = 20000, extraEnv = {}) => new Promise((res) => execFile(cmd, args, { cwd, timeout, maxBuffer: 8e6, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...extraEnv } }, (e, so, se) => res({ ok: !e, code: e ? e.code : 0, out: String(so || '').trim(), err: String(se || '').trim() })));
const git = (dir, ...a) => sh('git', ['-C', dir, ...a], undefined, undefined, require('./git-prefs').envFor(dir, a)); // your GIT_SSL_NO_VERIFY choice, for private company hosts only
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const clip = {
  get: async () => (process.env.TULAI_CLIP_FILE ? (fs.existsSync(process.env.TULAI_CLIP_FILE) ? fs.readFileSync(process.env.TULAI_CLIP_FILE, 'utf8') : '') : (await sh('/usr/bin/pbpaste', [])).out),
  set: (t) => new Promise((res) => { if (require('./sandbox').would('clipboard')) return res(); if (process.env.TULAI_CLIP_FILE) { fs.writeFileSync(process.env.TULAI_CLIP_FILE, t); return res(); } const p = spawn('/usr/bin/pbcopy'); p.on('close', res); p.on('error', res); p.stdin.end(t); }),
};

/** The folder of the editor window you were last working in (VS Code or Cursor). */
function editorFolder() {
  if (process.env.TULAI_NO_EDITOR_FOLDER) return null;
  for (const app of ['Code', 'Cursor']) {
    try { const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'Library', 'Application Support', app, 'User', 'globalStorage', 'storage.json'), 'utf8')); const f = j.windowsState && j.windowsState.lastActiveWindow && j.windowsState.lastActiveWindow.folder; if (f && f.startsWith('file://')) { const d = decodeURIComponent(f.slice(7)); if (fs.existsSync(d)) return d; } } catch {}
  }
  return null;
}
const isRepo = (d) => !!d && fs.existsSync(path.join(d, '.git'));
const PROJ = '(?:\\s+(?:in|for|on|of|at)\\s+(?:the\\s+|my\\s+)?(.+?)(?:\\s+(?:project|repo|repository|folder))?)?';
const base = path.basename;

/** Which project? An explicit name wins, then the one you just talked about, then your editor's window. */
async function project(name, ctx, needGit = true) {
  let dir = null;
  if (name) { dir = ctx.findFolder(name.trim(), ctx.roots); if (!dir) return { reply: `I could not find a project called ${name}.` }; }
  else dir = ctx.forceDir || ctx.last || editorFolder();
  if (!dir) return { ask: true };
  if (needGit && !isRepo(dir)) return { reply: `${base(dir)} is not a git project.` };
  ctx.setLast && ctx.setLast(dir); return { dir };
}

async function snapshot(dir) {
  const st = await git(dir, 'status', '--porcelain=v1', '-b'); if (!st.ok) return null;
  const lines = st.out.split('\n').filter(Boolean), head = lines.shift() || '', br = /^## (?:No commits yet on |Initial commit on )?([^\s.]+(?:\/[^\s.]+)*)/.exec(head), up = /\[(.+)\]/.exec(head);
  const ahead = +((/ahead (\d+)/.exec(up ? up[1] : '') || [])[1] || 0), behind = +((/behind (\d+)/.exec(up ? up[1] : '') || [])[1] || 0);
  const untracked = lines.filter((l) => l.startsWith('??')), changed = lines.filter((l) => !l.startsWith('??'));
  return { branch: br ? br[1] : 'unknown', hasUpstream: /\.\.\./.test(head), ahead, behind, changed, untracked, files: lines.map((l) => l.slice(3)) };
}
const spokenStatus = (name, s) => {
  const bits = [`${name} is on ${s.branch}`];
  if (!s.changed.length && !s.untracked.length) bits.push('and the working tree is clean'); else bits.push(`with ${[s.changed.length ? plural(s.changed.length, 'changed file') : '', s.untracked.length ? plural(s.untracked.length, 'new file') : ''].filter(Boolean).join(' and ')}`);
  const sync = [s.ahead ? `${s.ahead} to push` : '', s.behind ? `${s.behind} behind the remote` : ''].filter(Boolean); if (sync.length) bits.push(sync.join(', '));
  let t = bits.join(', ') + '.'; if (s.files.length) t += ` ${s.files.slice(0, 4).map((f) => base(f)).join(', ')}${s.files.length > 4 ? ' and more' : ''}.`; return t;
};
const who = async (dir) => (await git(dir, 'config', 'user.email')).out || (await git(dir, 'config', '--global', 'user.email')).out;
async function commitsSince(dir, since, until) {
  const me = await who(dir), args = ['log', '--all', '--no-merges', '--since=' + since, '--pretty=%s', ...(until ? ['--until=' + until] : []), ...(me ? ['--author=' + me] : [])];
  const r = await git(dir, ...args); return r.ok ? r.out.split('\n').filter(Boolean) : [];
}
async function remoteWeb(dir) {
  const u = (await git(dir, 'remote', 'get-url', 'origin')).out; if (!u) return null;
  const m = /^(?:git@|ssh:\/\/git@|https?:\/\/(?:[^@/]+@)?)([^:/]+)[:/](.+?)(?:\.git)?\/?$/.exec(u); if (!m) return null; return { host: m[1], repo: m[2], web: `https://${m[1]}/${m[2]}`, gitlab: !/github/i.test(m[1]) };
}
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
const TICKET = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/;

/** Which package manager / test runner a project uses. */
function runner(dir, what) {
  const has = (f) => fs.existsSync(path.join(dir, f));
  if (has('package.json')) {
    let scripts = {}; try { scripts = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts || {}; } catch {}
    const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : has('bun.lockb') || has('bun.lock') ? 'bun' : 'npm';
    const name = { test: 'test', tests: 'test', lint: 'lint', build: 'build', typecheck: 'typecheck', 'type check': 'typecheck' }[what];
    const pick = scripts[name] ? name : name === 'typecheck' ? (scripts['type-check'] ? 'type-check' : scripts.tsc ? 'tsc' : null) : null;
    if (!pick) return { none: `${base(dir)} has no "${name}" script in package.json.` };
    return { cmd: pm, args: pm === 'npm' ? ['run', pick, '--silent'] : ['run', pick], label: `${pm} run ${pick}` };
  }
  if (what === 'test' || what === 'tests') {
    if (has('pyproject.toml') || has('pytest.ini') || has('setup.py')) return { cmd: 'python3', args: ['-m', 'pytest', '-q'], label: 'pytest' };
    if (has('go.mod')) return { cmd: 'go', args: ['test', './...'], label: 'go test' };
    if (has('Cargo.toml')) return { cmd: 'cargo', args: ['test', '--quiet'], label: 'cargo test' };
    if (has('gradlew')) return { cmd: './gradlew', args: ['test', '-q'], label: 'gradle test' };
  }
  return { none: `I could not tell how to run ${what} in ${base(dir)}.` };
}
const summarizeRun = (r, label, dir) => {
  const text = `${r.out}\n${r.err}`, tail = text.trim().split('\n').slice(-60).join('\n');
  const jest = /Tests:\s+(?:(\d+) failed, )?(?:(\d+) skipped, )?(\d+) passed/.exec(tail), vitest = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(tail), py = /(?:(\d+) failed, )?(\d+) passed/.exec(tail), fails = (tail.match(/^\s*(?:●|FAIL|✗|×|FAILED)\s+(.+)$/gm) || []).slice(0, 3).map((x) => x.replace(/^\s*(?:●|FAIL|✗|×|FAILED)\s+/, '').slice(0, 60));
  const m = jest || vitest || py; let detail = '';
  if (m) { const failed = +(m[1] || 0), passed = +(jest ? m[3] : m[2]); detail = `${passed} passed${failed ? `, ${failed} failed` : ''}`; }
  const err = !r.ok && !m ? (tail.split('\n').filter((l) => /error|cannot|failed|not found/i.test(l)).slice(-2).join(' ').slice(0, 160) || 'it exited with an error') : '';
  return r.ok ? `${label} passed in ${base(dir)}${detail ? ': ' + detail : ''}.` : `${label} failed in ${base(dir)}${detail ? ': ' + detail : ''}${fails.length ? '. First failures: ' + fails.join('; ') : ''}${err ? '. ' + err : ''}.`;
};

async function listening(port) {
  const r = await sh('/usr/sbin/lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpcn']); if (!r.out) return null;
  const p = { pid: '', name: '' }; for (const l of r.out.split('\n')) { if (l[0] === 'p' && !p.pid) p.pid = l.slice(1); if (l[0] === 'c' && !p.name) p.name = l.slice(1); } return p.pid ? p : null;
}

const EXPLAIN_SYS = 'You are a senior software engineer helping by voice. The person copied some code, a log or an error message. In at most three short spoken sentences, say what it means, the most likely cause, and the first thing to try. No markdown, no code blocks, no lists.';

/** ctx: { sid, setPend, chromeOpen, last, setLast, findFolder, roots, nlu, forceDir }. Returns a reply object or null. */
async function handle(text, tl, ctx) {
  let m;

  // ----- git: status / branch / sync -----
  if ((m = new RegExp(`^(?:git\\s+)?(?:status|what(?:'s| is) (?:the )?status|what changed|what did i change(?: today)?|any (?:uncommitted )?changes|am i clean|is (?:it|my tree) clean|uncommitted(?: changes)?)${PROJ}$`).exec(tl))) {
    const p = await project(m[1], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p;
    const s = await snapshot(p.dir); return { reply: s ? spokenStatus(base(p.dir), s) : `I could not read git status in ${base(p.dir)}.` };
  }
  if ((m = new RegExp(`^(?:what(?:'s| is) (?:the |my )?(?:current |active )?branch|what branch(?: am i on| is this| is it)?|which branch(?: am i on| is this)?|current branch)${PROJ}$`).exec(tl))) {
    const p = await project(m[1], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const s = await snapshot(p.dir); return { reply: s ? `You are on ${s.branch} in ${base(p.dir)}.` : 'I could not read the branch.' };
  }
  if ((m = new RegExp(`^(?:what(?:'s| is| are)? (?:the )?(?:unpushed|not pushed)(?: commits)?|do i have (?:any )?unpushed(?: commits)?|did i push|have i pushed|anything to push|am i ahead(?: of (?:origin|remote))?)${PROJ}$`).exec(tl))) {
    const p = await project(m[1], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const s = await snapshot(p.dir); if (!s) return { reply: 'I could not read git status.' };
    if (!s.hasUpstream) return { reply: `${s.branch} has not been pushed yet, so nothing is on the remote.` };
    const log = s.ahead ? (await git(p.dir, 'log', '--oneline', `-${Math.min(s.ahead, 4)}`)).out.split('\n').map((x) => x.replace(/^\w+\s/, '')).join('; ') : '';
    return { reply: s.ahead ? `${plural(s.ahead, 'commit')} not pushed on ${s.branch}: ${log}.` : `Everything on ${s.branch} is pushed.${s.changed.length ? ` You still have ${plural(s.changed.length, 'uncommitted file')}.` : ''}` };
  }

  // ----- git: history -----
  if ((m = new RegExp(`^(?:what(?:'s| is| are) (?:my |the )?(?:last|latest|recent) commits?|(?:show|list) (?:my )?(?:last|latest|recent) commits|last commit|latest commit)${PROJ}$`).exec(tl))) {
    const p = await project(m[1], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const r = await git(p.dir, 'log', '--pretty=%s (%cr)', '-n', /commits$/.test(tl.replace(PROJ, '')) ? '4' : '1');
    return { reply: r.out ? `Latest in ${base(p.dir)}: ${r.out.split('\n').join('; ')}.` : 'There are no commits yet.' };
  }
  if ((m = /^(?:what did i (?:do|work on|commit|ship|push|finish)|my (?:commits|work)|git standup|standup (?:from )?(?:git|commits)|what have i done)\s*(today|yesterday|this week|last week)?$/.exec(tl))) {
    const when = m[1] || 'yesterday', since = { today: 'midnight', yesterday: 'yesterday.midnight', 'this week': '1 week ago', 'last week': '2 weeks ago' }[when], until = when === 'yesterday' ? 'midnight' : undefined, V = ctx.vocab ? ctx.vocab().projects : [];
    const repos = new Set(); if (ctx.last && isRepo(ctx.last)) repos.add(ctx.last); const ed = editorFolder(); if (isRepo(ed)) repos.add(ed);
    for (const name of V.slice(0, 40)) { const d = ctx.findFolder(name, ctx.roots); if (isRepo(d)) repos.add(d); }
    const lines = []; for (const d of repos) { const c = await commitsSince(d, since, until); if (c.length) lines.push({ name: base(d), c }); }
    if (!lines.length) return { reply: `I found no commits from you ${when === 'today' ? 'today' : when === 'yesterday' ? 'yesterday' : when} in your projects.` };
    const full = lines.map((l) => `${l.name}:\n${l.c.map((x) => '- ' + x).join('\n')}`).join('\n\n'); await clip.set(`${when === 'today' ? 'Today' : when === 'yesterday' ? 'Yesterday' : when}:\n${full}`);
    const n = lines.reduce((a, l) => a + l.c.length, 0);
    return { reply: `${plural(n, 'commit')} ${when === 'today' ? 'today' : when === 'yesterday' ? 'yesterday' : when} across ${plural(lines.length, 'project')}. ${lines.slice(0, 3).map((l) => `${l.name}: ${l.c.slice(0, 2).map((x) => (x.length > 70 ? x.slice(0, 67) + '...' : x)).join(', ')}`).join('. ')}. The full list is on your clipboard.` };
  }

  // ----- git: changing things (always asks first) -----
  if ((m = new RegExp(`^(?:git\\s+)?pull(?:\\s+(?:and\\s+)?rebase)?(?:\\s+(?:the\\s+)?(?:latest|main|master|develop|changes))?${PROJ}$|^(?:rebase|update)\\s+(?:my\\s+)?(?:branch|project)?\\s*(?:on|onto|from|with)?\\s*(main|master|develop)?${PROJ}$`).exec(tl)) && /\b(pull|rebase|update)\b/.test(tl)) {
    const p = await project(m[1] || m[3], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const s = await snapshot(p.dir); if (!s) return { reply: 'I could not read git status.' };
    const onto = /\b(main|master|develop)\b/.exec(tl); ctx.setPend(ctx.sid, { kind: 'dev-confirm', action: 'pull', dir: p.dir, onto: onto ? onto[1] : '' });
    return { reply: `Pull${onto ? ` and rebase on ${onto[1]}` : ' with rebase'} in ${base(p.dir)}, on ${s.branch}?${s.changed.length ? ` You have ${plural(s.changed.length, 'uncommitted file')}; I will stash them and bring them back.` : ''} Say yes to go.` };
  }
  if ((m = /^(?:create|make|start|open|new)\s+(?:a\s+|new\s+)*branch(?:\s+(?:called|named|for))?\s+(.+?)(?:\s+(?:in|for|on)\s+(?:the\s+|my\s+)?(.+?))?$/.exec(tl)) && !/\b(merge request|pull request)\b/.test(tl)) {
    const p = await project(m[2], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const tk = TICKET.exec(m[1].toUpperCase().replace(/\s+/g, '-')), name = (tk ? tk[1] + '-' : '') + slug(m[1].replace(TICKET, '').replace(/\b[a-z]{2,10}\s+\d{1,6}\b/i, '')) || slug(m[1]);
    const nm = /^(?:feature|fix|bugfix|chore)\//.test(m[1]) ? m[1] : (/\b(fix|bug)\b/i.test(m[1]) ? 'fix/' : 'feature/') + (name || slug(m[1]));
    const s0 = await snapshot(p.dir); ctx.setPend(ctx.sid, { kind: 'dev-confirm', action: 'branch', dir: p.dir, name: nm }); return { reply: `Create the branch ${nm} in ${base(p.dir)}, from ${s0 ? s0.branch : 'the current branch'}? Say yes to go.` };
  }
  if ((m = /^(?:switch|checkout|check out|go)\s+(?:back\s+)?to\s+(?:the\s+)?(?:branch\s+)?(main|master|develop|dev|[\w./-]*[\d\/-][\w./-]*)(?:\s+(?:branch|in|on|for)\s*(.*))?$/.exec(tl)) && (/\b(?:switch|checkout|check out)\b/.test(tl) || /\bbranch\b/.test(tl))) {
    const p = await project(m[2] && !/^branch$/.test(m[2]) ? m[2] : '', ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const s = await snapshot(p.dir);
    if (s && (s.changed.length || s.untracked.length) && s.changed.length) return { reply: `You have ${plural(s.changed.length, 'uncommitted file')} in ${base(p.dir)}. Commit or stash first, then ask me again.` };
    ctx.setPend(ctx.sid, { kind: 'dev-confirm', action: 'switch', dir: p.dir, name: m[1] }); return { reply: `Switch ${base(p.dir)} to ${m[1]}? Say yes to go.` };
  }

  // ----- the ticket and the merge request of this branch -----
  if ((m = new RegExp(`^(?:open|show|what(?:'s| is))\\s+(?:the\\s+|my\\s+)?(?:jira\\s+)?(?:ticket|issue|jira)(?:\\s+(?:for|of|on)\\s+(?:this|my|the current)\\s+branch)?${PROJ}$`).exec(tl)) && (/\bticket\b|\bissue\b/.test(tl))) {
    const p = await project(m[1], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const s = await snapshot(p.dir); const tk = s && TICKET.exec(s.branch.toUpperCase());
    if (!tk) return { reply: `The branch ${s ? s.branch : ''} has no ticket number in its name, like ABC-123.` };
    const jira = readJira(); if (!jira) return { reply: `The ticket is ${tk[1]}, but I do not know your Jira address yet. Add it in Tulai Desktop, Settings, Work tools.` };
    return ctx.chromeOpen(ctx.sid, { url: `${jira.replace(/\/+$/, '')}/browse/${tk[1]}`, message: `Opened ${tk[1]}` });
  }
  if ((m = new RegExp(`^(?:open|create|make|start|raise|new)\\s+(?:a\\s+|the\\s+|my\\s+|new\\s+)*(?:mr|m\\.r\\.|merge request|pull request|pr)(?:\\s+for\\s+(?:this|my|the current)\\s+branch)?${PROJ}$`).exec(tl))) {
    const p = await project(m[1], ctx); if (p.ask) return ask(ctx, tl); if (p.reply) return p; const [s, r] = [await snapshot(p.dir), await remoteWeb(p.dir)];
    if (!r || !s) return { reply: `I could not find the remote of ${base(p.dir)}.` };
    const url = r.gitlab ? `${r.web}/-/merge_requests/new?merge_request%5Bsource_branch%5D=${encodeURIComponent(s.branch)}` : `${r.web}/compare/${encodeURIComponent(s.branch)}?expand=1`;
    return ctx.chromeOpen(ctx.sid, { url, message: `Opened the ${r.gitlab ? 'merge request' : 'pull request'} page for ${s.branch}` });
  }

  // ----- run tests / lint / build -----
  if ((m = new RegExp(`^(?:run|execute|start|do)\\s+(?:the\\s+|my\\s+|all\\s+)*(tests?|lint|build|type ?check)${PROJ}$`).exec(tl))) {
    const p = await project(m[2], ctx, false); if (p.ask) return ask(ctx, tl); if (p.reply) return p;
    const what = m[1].replace(/^type ?check$/, 'typecheck'), rn = runner(p.dir, what); if (rn.none) return { reply: rn.none };
    if (process.env.TULAY_DEV_DRY) return { reply: `Would run ${rn.label} in ${base(p.dir)}.` };
    const r = await sh(rn.cmd, rn.args, p.dir, 300000); return { reply: summarizeRun(r, rn.label, p.dir) };
  }

  // ----- ports and docker -----
  if ((m = /^(?:what(?:'s| is)|who(?:'s| is)|what process(?: is)?|is anything)\s*(?:running|using|listening|on|in|has|holding)?\s*(?:on\s+|to\s+)?(?:the\s+)?port\s+(\d{1,5})$|^(?:is\s+)?port\s+(\d{1,5})\s+(?:in use|busy|taken|free|being used|open)$/.exec(tl))) {
    const port = m[1] || m[2], pr = await listening(port); return { reply: pr ? `Port ${port} is used by ${pr.name}, process ${pr.pid}. Say "free port ${port}" to stop it.` : `Nothing is listening on port ${port}.` };
  }
  if ((m = /^(?:kill|free|free up|stop|close)\s+(?:whatever(?:'s| is) (?:on|using)\s+)?(?:the\s+)?port\s+(\d{2,5})$/.exec(tl))) {
    const pr = await listening(m[1]); if (!pr) return { reply: `Nothing is listening on port ${m[1]}.` };
    ctx.setPend(ctx.sid, { kind: 'dev-confirm', action: 'kill', pid: pr.pid, name: pr.name, port: m[1] }); return { reply: `Stop ${pr.name} (process ${pr.pid}) on port ${m[1]}? Say yes to stop it.` };
  }
  if (/^(?:is\s+)?docker\s+(?:running|up|on|started)$/.test(tl)) { const r = await sh('docker', ['info', '--format', '{{.ServerVersion}}'], undefined, 8000); return { reply: r.ok && r.out ? `Docker is running, version ${r.out}.` : 'Docker is not running, or it is not installed.' }; }
  if (/^(?:docker ps|(?:what|which)\s+(?:docker\s+)?containers?\s+(?:are\s+)?(?:running|up)|list (?:my )?containers|show (?:my )?containers)$/.test(tl)) {
    const r = await sh('docker', ['ps', '--format', '{{.Names}} ({{.Status}})'], undefined, 8000); if (!r.ok) return { reply: 'Docker is not running, or it is not installed.' };
    const l = r.out.split('\n').filter(Boolean); return { reply: l.length ? `${plural(l.length, 'container')} running: ${l.slice(0, 6).join(', ')}.` : 'No containers are running.' };
  }

  // ----- developer utilities (the result is also put on your clipboard) -----
  if (/^(?:generate|make|create|give me|new)\s+(?:a\s+|me a\s+)?(?:random\s+)?(?:uuid|guid)(?:\s+v?4)?$|^(?:uuid|guid)$/.test(tl)) { const id = crypto.randomUUID(); await clip.set(id); return { reply: `New UUID copied to your clipboard. It starts with ${id.slice(0, 8).split('').join(' ')}.` }; }
  if ((m = /^(?:convert\s+|what(?:'s| is)\s+|what date is\s+|decode\s+)?(?:the\s+)?(?:unix\s+|epoch\s+)?(?:time ?stamp|epoch)\s+(\d{9,13})(?:\s+(?:as a date|in (?:utc|local time)|to (?:a )?date))?$/.exec(tl))) {
    const n = +m[1], d = new Date(n < 1e11 ? n * 1000 : n); return { reply: `${m[1]} is ${d.toLocaleString([], { dateStyle: 'full', timeStyle: 'medium' })} your time, ${d.toISOString().replace('T', ' ').slice(0, 19)} UTC.` };
  }
  if (/^(?:what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?(?:unix\s+)?(?:time ?stamp|epoch)(?:\s+now)?|unix time(?:stamp)?(?: now)?|epoch(?: now)?)$/.test(tl)) { const n = Math.floor(Date.now() / 1000); await clip.set(String(n)); return { reply: `The Unix timestamp is ${n}. It is on your clipboard.` }; }
  if ((m = /^(?:base ?64|b64)\s+(encode|decode)(?:\s+(?:my|the)?\s*(?:clipboard|what i copied))?$|^(encode|decode)\s+(?:my\s+|the\s+)?(?:clipboard|what i copied)\s+(?:as|to|from|in)\s+base ?64$/.exec(tl))) {
    const mode = m[1] || m[2], src = await clip.get(); if (!src.trim()) return { reply: 'Your clipboard is empty.' };
    try { const out = mode === 'encode' ? Buffer.from(src, 'utf8').toString('base64') : Buffer.from(src.trim(), 'base64').toString('utf8'); if (mode === 'decode' && /�/.test(out)) return { reply: 'That does not look like valid base64 text.' }; await clip.set(out); return { reply: `Base64 ${mode}d (${out.length} characters) and put back on your clipboard.` }; } catch { return { reply: 'I could not convert that.' }; }
  }
  if ((m = /^(?:format|prettify|pretty print|pretty-print|validate|check|minify|fix)\s+(?:the\s+|my\s+)?(?:json)(?:\s+(?:in|on|from)\s+(?:my\s+|the\s+)?clipboard)?$|^(?:format|validate|check)\s+(?:my\s+|the\s+)?clipboard(?: as json)?$/.exec(tl))) {
    const src = await clip.get(); if (!src.trim()) return { reply: 'Your clipboard is empty.' };
    try { const j = JSON.parse(src), minify = /minify/.test(tl); if (!/format|prettif|pretty|minify/.test(tl)) return { reply: `That is valid JSON${Array.isArray(j) ? `, a list of ${j.length}` : j && typeof j === 'object' ? ` with ${plural(Object.keys(j).length, 'top-level key')}` : ''}.` }; await clip.set(JSON.stringify(j, null, minify ? 0 : 2)); return { reply: `JSON ${minify ? 'minified' : 'formatted'} and copied back to your clipboard.` }; }
    catch (e) { const pos = /position (\d+)/.exec(e.message); const line = pos ? src.slice(0, +pos[1]).split('\n').length : 0; return { reply: `That is not valid JSON${line ? `, it breaks around line ${line}` : ''}: ${String(e.message).replace(/^JSON\.parse: /, '').slice(0, 90)}.` }; }
  }
  if ((m = /^(?:sha ?256|sha ?1|md5|hash)\s+(?:of\s+)?(?:my\s+|the\s+)?(?:clipboard|what i copied)?$/.exec(tl)) && /sha|md5|hash/.test(tl)) {
    const src = await clip.get(); if (!src) return { reply: 'Your clipboard is empty.' }; const alg = /md5/.test(tl) ? 'md5' : /sha ?1\b/.test(tl) ? 'sha1' : 'sha256', h = crypto.createHash(alg).update(src).digest('hex'); await clip.set(h); return { reply: `${alg.toUpperCase()} of your clipboard is copied. It starts with ${h.slice(0, 8).split('').join(' ')}.` };
  }

  // ----- explain what I copied (an error, a stack trace, a snippet) with the embedded model -----
  if (/^(?:explain|what(?:'s| is| does)|help me (?:with|understand)|fix|debug|why (?:is|did)|summari[sz]e|translate)\s+(?:this\s+|the\s+|my\s+|that\s+)?(?:error|stack ?trace|exception|log|logs|code|snippet|function|command|clipboard|what i copied|what(?:'s| is) in my clipboard|copied (?:text|code|error))(?:\s+(?:message|for me|please))?$|^what(?:'s| is) this error$|^explain (?:this|it)$/.test(tl)) {
    const src = (await clip.get()).trim(); if (!src) return { reply: 'Your clipboard is empty. Copy the error or code first, then ask me again.' };
    if (!ctx.nlu || !ctx.nlu.available()) return { reply: 'My thinking brain is not ready yet. Try again in a moment.' };
    const head = src.length > 3500 ? src.slice(0, 1800) + '\n...\n' + src.slice(-1500) : src, kind = /summari[sz]e/.test(tl) ? 'Summarize it.' : /translate/.test(tl) ? 'Translate it to plain English.' : /fix|debug/.test(tl) ? 'Say what is wrong and how to fix it.' : 'Explain it.';
    const r = await ctx.nlu.chat({ messages: [{ role: 'system', content: EXPLAIN_SYS }, { role: 'user', content: `${kind}\n\n${head}` }], max_tokens: 200, temperature: 0.2, timeout: 45000 });
    const out = r && String(r.content || '').replace(/[*_`#]+/g, '').trim(); if (!out) return { reply: 'I could not work that out. Try pasting a smaller part.' };
    return { reply: out, ...(src.length > 3500 || /fix|debug/.test(tl) ? { offerTask: `Look at this and fix it properly:\n\n${src.slice(0, 6000)}` } : {}) };
  }
  return null;
}

const ask = (ctx, tl) => { ctx.setPend(ctx.sid, { kind: 'dev-project', text: tl }); return { reply: 'Which project? Say its name, or open it in VS Code first and I will follow that.' }; };
function readJira() { try { const c = JSON.parse(fs.readFileSync(path.join(process.env.GC_DATA_DIR || __dirname, 'config.json'), 'utf8')); return (c.jira && c.jira.baseUrl) || ''; } catch { return ''; } }

/** Answers to the questions above ("Which project?" and the yes/no before changing something). */
async function pending(p, text, ctx) {
  const t = String(text).toLowerCase().trim().replace(/[.!?]+$/g, '');
  if (p.kind === 'dev-project') {
    const dir = ctx.findFolder(t.replace(/^(?:the|my|in)\s+/, '').replace(/\s+(?:project|repo)$/, ''), ctx.roots); if (!dir) return { reply: `I could not find a project called ${t}. Say the exact folder name.`, keep: true };
    return handle(p.text, p.text, { ...ctx, forceDir: dir, last: dir });
  }
  if (p.kind === 'dev-confirm') {
    if (!/^(?:yes|yeah|yep|sure|go|go ahead|do it|ok|okay|sige|oo|confirm|please)\b/.test(t)) return { reply: 'Okay, I did nothing.' };
    if (p.action === 'branch') { const r = await git(p.dir, 'checkout', '-b', p.name); return { reply: r.ok ? `Created and switched to ${p.name} in ${base(p.dir)}.` : `I could not create ${p.name}: ${r.err.split('\n')[0]}` }; }
    if (p.action === 'switch') { const r = await git(p.dir, 'checkout', p.name); return { reply: r.ok ? `Switched to ${p.name} in ${base(p.dir)}.` : `I could not switch to ${p.name}: ${r.err.split('\n')[0]}` }; }
    if (p.action === 'kill') { try { process.kill(+p.pid, 'SIGTERM'); await new Promise((r) => setTimeout(r, 600)); const still = await listening(p.port); return { reply: still ? `I asked ${p.name} to stop, but port ${p.port} is still busy.` : `Stopped ${p.name}. Port ${p.port} is free.` }; } catch (e) { return { reply: `I could not stop it: ${e.message}` }; } }
    if (p.action === 'pull') {
      const args = ['pull', '--rebase', '--autostash', ...(p.onto ? ['origin', p.onto] : [])], r = await git(p.dir, ...args);
      if (r.ok) { const s = await snapshot(p.dir); return { reply: `Done. ${/up to date/i.test(r.out) ? 'Already up to date.' : 'Pulled and rebased.'} ${s ? spokenStatus(base(p.dir), s) : ''}`.trim() }; }
      const conflict = /conflict/i.test(r.out + r.err); if (conflict) await git(p.dir, 'rebase', '--abort');
      return { reply: conflict ? `There are merge conflicts, so I stopped and put everything back. Resolve them in your editor, or ask Tulai Desktop to do the rebase.` : `The pull failed: ${(r.err || r.out).split('\n')[0].slice(0, 140)}` };
    }
  }
  return null;
}

module.exports = { clip, sh, git, handle, pending, editorFolder, runner, summarizeRun, snapshot, spokenStatus, remoteWeb, slug };
