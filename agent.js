// Agent harness: tool-calling loop with permissions. Runs locally against the gateway's OpenAI-compatible API.
const fs = require('fs');
const snapshots = require('./snapshots');
const shots = require('./shots');
const store = require('./store');
const mcp = require('./mcp');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const EFFORT = {
  low:    { think: 0,     max: 4000,  iter: 10,  note: 'Effort: LOW. Answer directly and briefly. Use as few tool calls as possible.' },
  medium: { think: 2048,  max: 8000,  iter: 25,  note: 'Effort: MEDIUM. Balance speed and care.' },
  high:   { think: 5000,  max: 16000, iter: 40,  note: 'Effort: HIGH. Think carefully, check edge cases, verify important changes.' },
  extra:  { think: 10000, max: 24000, iter: 60,  note: 'Effort: EXTRA HIGH. Be thorough: investigate the codebase before editing, consider alternatives, and verify your work by running relevant commands.' },
  max:    { think: 20000, max: 40000, iter: 90,  note: 'Effort: MAX. Be exhaustive. Read all relevant code, reason through trade-offs, make a todo list, implement carefully, then test and re-check your work.' },
  ultra:  { think: 32000, max: 64000, iter: 150, note: 'Effort: ULTRA CODE. Work like a principal engineer on a hard task. 1) Explore the repo and understand conventions. 2) Write a todo list with todo_write and keep it updated. 3) Implement in small, correct steps. 4) Run the build, linter and tests with bash and fix every failure. 5) Review your own diff for bugs, edge cases and security issues. 6) Do not stop until the work is verified, then report what changed, what you verified and any remaining risks.' },
};
const MAX_ITER = 40;
const SANDBOX = new Set(['bash', 'grep', 'glob', 'web_fetch', 'http_request', 'github_api', 'jira_api', 'gitlab_api', 'list_dir']); // outputs eligible for context mode
const CTX_LIMIT = 6000;
const CTX_DIR = () => path.join(process.env.GC_DATA_DIR || __dirname, 'ctx');
function storeCtx(text) {
  fs.mkdirSync(CTX_DIR(), { recursive: true });
  const id = 'ctx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  fs.writeFileSync(path.join(CTX_DIR(), id + '.txt'), text); return id;
}
function readCtx(id) {
  if (!/^ctx_[a-z0-9]+$/.test(String(id))) throw new Error('Invalid id');
  try { return fs.readFileSync(path.join(CTX_DIR(), id + '.txt'), 'utf8'); } catch { throw new Error(`No stored output ${id} (it may have been cleaned up). Re-run the command.`); }
}
function compactOutput(text) {
  const id = storeCtx(text), lines = text.split('\n').length;
  return `${text.slice(0, 1500)}\n…[${text.length} chars / ${lines} lines hidden to save context; stored as ${id}. Use ctx_search {id, query} to find lines or ctx_read {id, offset, limit} to read a range. Do not re-run the command just to see more.]…\n${text.slice(-1500)}`;
}
const IGNORE = new Set(['node_modules', '.git', '.DS_Store', 'dist', '.venv', '__pycache__']);
const READ_ONLY = new Set(['calendar_events', 'render', 'screenshot', 'ctx_search', 'ctx_read', 'skill', 'read_file', 'list_dir', 'glob', 'grep', 'web_fetch', 'todo_write', 'task']);
const DATA_DIR = () => process.env.GC_DATA_DIR || __dirname;
const CP_DIR = () => path.join(DATA_DIR(), 'checkpoints');
const EDIT_TOOLS = new Set(['write_file', 'edit_file']);

const TOOLS = [
  ['read_file', 'Read a text file. Returns numbered lines. Use offset/limit for large files.', { path: 's', offset: 'n?', limit: 'n?' }],
  ['write_file', 'Create or overwrite a file with the given content. Parent folders are created.', { path: 's', content: 's' }],
  ['edit_file', 'Replace old_string with new_string in a file. old_string must match exactly and be unique unless replace_all is true.', { path: 's', old_string: 's', new_string: 's', replace_all: 'b?' }],
  ['list_dir', 'List files and folders in a directory.', { path: 's?' }],
  ['glob', 'Find files by glob pattern such as src/**/*.js. Returns paths relative to the workspace.', { pattern: 's' }],
  ['grep', 'Search file contents with a regular expression. Returns file:line:text matches.', { pattern: 's', path: 's?', include: 's?' }],
  ['bash', 'Run a shell command (zsh) in the workspace. Use for git, builds, tests, installs, scripts.', { command: 's', timeout_seconds: 'n?' }],
  ['http_request', 'Send an HTTP request to any URL, including local services (localhost, LAN). Use for calling local APIs and dev servers. Non-GET requests need user approval.', { url: 's', method: 's?', headers: 'o?', body: 's?' }],
  ['github_api', 'Call the GitHub REST API using the user\'s connected token, e.g. path /repos/OWNER/REPO/pulls with method POST. Use for pull requests, issues, listing repos, reviews. body is a JSON string. Non-GET calls need user approval. For clone/commit/push use bash with git.', { path: 's', method: 's?', body: 's?' }],
  ['ctx_search', 'Search a large tool result that was stored out-of-context (id like ctx_ab12 shown in the output). Case-insensitive; query may be a regex. Returns matching lines with surrounding context.', { id: 's', query: 's', context: 'n?' }],
  ['ctx_read', 'Read a line range of a stored tool result by id.', { id: 's', offset: 'n?', limit: 'n?' }],
  ['render', 'Show a visual inline in the chat: diagram, chart, UI mockup, table, calculator, animation. html is a self-contained HTML fragment or SVG using inline CSS and JS only (no external network, fonts or CDN scripts; it runs in a sandbox). Theme variables available: var(--ink) var(--muted) var(--line) var(--card) var(--panel) var(--accent) var(--bg). Keep it focused. Use this when a picture or interactive demo explains better than text.', { title: 's', html: 's' }],
  ['device', 'Control a phone emulator that the person can watch live in Tulai. Android (emulator or device via adb): tap(x,y), long_press, swipe(x,y,x2,y2), type(text), key(back|home|recents|enter|delete|tab|power|volume_up|volume_down), open_url, launch(package), boot(device = AVD name). iOS Simulator: boot, open_url, launch(bundle_id), appearance(mode=light|dark); touch and typing are NOT available on iOS. x and y are pixel positions in the most recent screenshot you were shown. A screenshot is attached after every action so you can verify the result. All device actions need the person\'s approval.', { target: 's?', action: 's', x: 'n?', y: 'n?', x2: 'n?', y2: 'n?', ms: 'n?', text: 's?', key: 's?', url: 's?', bundle_id: 's?', package: 's?', device: 's?', mode: 's?' }],
  ['computer', 'Use the person\'s WHOLE Mac like a human: look at the screen and click, type and press keys in any app. Actions: screenshot (always first; positions in the picture are the positions you click) | click(x,y) | double_click | right_click | move | drag(x,y,x2,y2) | scroll(direction, amount, x?, y?) | type(text, submit?) | key(key such as Return, Escape, Cmd+Space, Cmd+Shift+4) | open_app(name) | frontmost | wait(wait_ms). Take a screenshot after each action that changes the screen. Prefer other tools (bash, browser, files) when they can do the job; use this for native apps only. Password managers, Terminal and System Settings are blocked. Every use needs the person\'s approval.', { action: 's', x: 'n?', y: 'n?', x2: 'n?', y2: 'n?', text: 's?', key: 's?', direction: 's?', amount: 'n?', name: 's?', submit: 'b?', wait_ms: 'n?' }],
  ['jira_api', 'Call the Jira REST API with the user\'s connected login (never print tokens). Cloud: /rest/api/3/..., Server/Data Center: /rest/api/2/.... Examples: GET /rest/api/3/search/jql?jql=assignee%20%3D%20currentUser()%20AND%20statusCategory%20!%3D%20Done&fields=summary,status,labels,priority,duedate , GET /rest/api/3/issue/KEY-1 . body is a JSON string. Reading is automatic; anything that changes Jira (POST/PUT/DELETE) needs the user\'s approval. Prefer showing a draft first.', { path: 's', method: 's?', body: 's?' }],
  ['gitlab_api', 'Call the GitLab REST API (v4) with the user\'s connected token (never print it). Examples: GET /api/v4/merge_requests?state=opened&scope=all&author_username=NAME , GET /api/v4/projects/ID/merge_requests/IID/changes (the diff), GET /api/v4/projects/ID/merge_requests/IID/discussions , POST /api/v4/projects/ID/merge_requests/IID/notes to comment. Reading is automatic; posting or changing anything needs the user\'s approval.', { path: 's', method: 's?', body: 's?' }],
  ['calendar_events', 'Read the user\'s meetings for the next 24 hours from their Outlook, Google or Teams calendar, which Tulai Bot reads in the background. Returns time, title and source.', {}],
  ['browser', 'Control and inspect a REAL browser pane inside Tulai (Chromium, the person can watch and take over; sign-ins persist). Use it to test web apps, read pages, fill forms and debug. Actions: open(url) | read (lists interactive elements with refs and the visible text; call it before clicking) | click(ref or selector or x,y) | double_click | right_click | hover | type(ref or selector, text, clear?, submit?) | press(key such as Enter, Tab, Escape, Meta+a) | scroll(direction, amount, or ref) | screenshot(full_page?) | console(level?) | network(filter?, failed_only?) | response(id) | eval(expression) | wait(wait_ms or until_text) | back | forward | reload | device(device=desktop|tablet|phone|android, or width and height). After an action that changes the page, call read or screenshot to see the result. Clicking, typing, pressing keys, eval and opening non-local sites need the person\'s approval.', { action: 's', url: 's?', ref: 's?', selector: 's?', x: 'n?', y: 'n?', text: 's?', key: 's?', direction: 's?', amount: 'n?', expression: 's?', device: 's?', width: 'n?', height: 'n?', full_page: 'b?', wait_ms: 'n?', until_text: 's?', level: 's?', filter: 's?', failed_only: 'b?', id: 'n?', clear: 'b?', submit: 'b?', max_chars: 'n?' }],
  ['screenshot', 'Render a UI and capture a screenshot that you will see in the next message. target: web (real Chromium; any URL incl. localhost; device desktop|laptop|tablet|iphone|android, or width/height; full_page), ios (iOS Simulator, real Safari/WebKit; optional url or bundle_id; boots a simulator if none is running), android (running emulator/device via adb; optional url or package). baseline + mode: save_baseline stores a visual baseline; compare diffs against it and reports the % of pixels changed. For local URLs start the dev server first.', { target: 's?', url: 's?', device: 's?', width: 'n?', height: 'n?', full_page: 'b?', wait_ms: 'n?', bundle_id: 's?', package: 's?', baseline: 's?', mode: 's?' }],
  ['snapshot', 'Manage restore points of the whole workspace (includes changes made by shell commands). action=create (label), list, or restore (id from list). Take a snapshot before risky or large changes. restore needs user approval.', { action: 's', label: 's?', id: 's?' }],
  ['skill', 'Load the full instructions of an available skill by name. Call this first when the task matches a skill in the list.', { name: 's' }],
  ['exit_plan_mode', 'In plan mode only: present your finished plan (markdown) to the user for approval. After approval you can start implementing.', { plan: 's' }],
  ['task', 'Delegate a self-contained investigation to a sub-agent with its own fresh context. It can read and search only, and returns a concise report. Use for broad codebase exploration or research so your own context stays small.', { description: 's', prompt: 's' }],
  ['web_fetch', 'Fetch a web page or URL and return its text content.', { url: 's' }],
  ['todo_write', 'Record or update your task list for a multi-step job. Pass the full list each time.', { todos: 'a' }],
].map(([name, description, props]) => {
  const properties = {}, required = [];
  for (const [k, t] of Object.entries(props)) {
    const opt = t.endsWith('?'); const ty = t[0];
    properties[k] = ty === 'o' ? { type: 'object', additionalProperties: { type: 'string' } } : ty === 's' ? { type: 'string' } : ty === 'n' ? { type: 'number' } : ty === 'b' ? { type: 'boolean' }
      : { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] } }, required: ['content', 'status'] } };
    if (!opt) required.push(k);
  }
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } };
});

function parseSkill(file, source) {
  try {
    const raw = fs.readFileSync(file, 'utf8'), m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    let name = path.basename(path.dirname(file)), description = '', body = raw;
    if (m) {
      for (const l of m[1].split('\n')) { const kv = l.match(/^([\w-]+):\s*(.*)$/); if (!kv) continue; const v = kv[2].trim().replace(/^["']|["']$/g, ''); if (kv[1] === 'name') name = v; if (kv[1] === 'description') description = v; }
      body = m[2];
    }
    return { name, description, body: body.trim(), source, dir: path.dirname(file) };
  } catch { return null; }
}
const readSafe = (f, max = 40000) => { try { return fs.readFileSync(f, 'utf8').slice(0, max); } catch { return ''; } };
// Internal skills in the "suite" layout: skills/<name>/{README.md, CLAUDE.md, prompt.md, schema.ts, config.ts, fixtures/} + skills/<manifest>.yaml + skills/platform-shared/.
function loadSuiteSkills(root, source = 'internal') {
  let ents = []; try { ents = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  const manifestFile = ents.find((e) => e.isFile() && /-suite\.ya?ml$/.test(e.name)), yaml = manifestFile ? readSafe(path.join(root, manifestFile.name)) : '';
  const shared = ents.find((e) => e.isDirectory() && /-shared$/.test(e.name)), base = shared ? readSafe(path.join(root, shared.name, 'CLAUDE-base.md'), 12000) : '', conv = shared ? readSafe(path.join(root, shared.name, 'conventions.md'), 12000) : '';
  const out = [];
  for (const e of ents) {
    if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.') || e === shared) continue;
    const dir = path.join(root, e.name), prompt = readSafe(path.join(dir, 'prompt.md')), contract = readSafe(path.join(dir, 'CLAUDE.md'), 12000), readme = readSafe(path.join(dir, 'README.md'), 20000);
    if (!prompt && !contract) continue;
    const m = yaml.match(new RegExp(`^  ${e.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\n((?:    .*\\n?)+)`, 'm')), block = m ? m[1] : '';
    const purpose = ((block.match(/purpose:\s*(.+)/) || [])[1] || (readme.match(/## Purpose\s+([^\n]+)/) || [])[1] || '').trim(), command = ((block.match(/command:\s*(.+)/) || [])[1] || '/' + e.name).trim();
    const body = [`# Internal skill: ${e.name}`, `Folder: ${dir}  (read schema.ts, config.ts and fixtures/ from there with read_file if you need them)`, '',
      base && '## Shared entry/exit protocol (platform-shared/CLAUDE-base.md)\n' + base, contract && '## Behavioral contract (CLAUDE.md)\n' + contract, prompt && '## Skill prompt (prompt.md)\n' + prompt, readme && '## Specification (README.md)\n' + readme,
      conv && '## Shared conventions (platform-shared/conventions.md)\n' + conv, `Suite manifest: ${manifestFile ? path.join(root, manifestFile.name) : '(none)'}. These skills are immutable while running: never edit anything under skills/ or docs/skills/.`].filter((x) => x !== '' && x !== false).join('\n\n').slice(0, 90000);
    out.push({ name: e.name, description: `${purpose || 'Internal skill'} (run with ${command})`.replace(/\s+/g, ' '), body, source, dir, suite: true, command });
  }
  return out;
}
function loadSkills(ws, extraDirs = []) { // later sources override earlier: built-in < extra folders < user < project < the repo's own skills/ suite
  const folders = [[path.join(__dirname, 'skills'), 'built-in'], ...extraDirs.filter(Boolean).map((d) => [d.replace(/^~(?=$|\/)/, os.homedir()), 'internal']), [path.join(os.homedir(), '.claude', 'skills'), 'user'], [path.join(ws, '.claude', 'skills'), 'project']];
  const out = new Map();
  for (const [dir, source] of folders) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) { if (!e.isDirectory()) continue; const sk = parseSkill(path.join(dir, e.name, 'SKILL.md'), source); if (sk) out.set(sk.name, sk); }
    if (source === 'internal') for (const sk of loadSuiteSkills(dir, 'internal')) out.set(sk.name, sk);
  }
  for (const sk of loadSuiteSkills(path.join(ws, 'skills'), 'internal')) out.set(sk.name, sk);
  return [...out.values()];
}
function systemPrompt(ws, mode, extra, effort, cfg0, skills = []) {
  let claudeMd = '', planning = '';
  try { planning = '# Project state (.planning/STATE.md; follow the get-shit-done skill)\n' + fs.readFileSync(path.join(ws, '.planning', 'STATE.md'), 'utf8').slice(0, 6000); } catch {}
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    try { claudeMd += `\n\n# Project instructions (${f})\n` + fs.readFileSync(path.join(ws, f), 'utf8').slice(0, 20000); } catch {}
  }
  return [
    'You are a capable coding and computer-use assistant running inside a desktop app with direct access to the user\'s Mac through tools.',
    `Working directory: ${ws}\nPlatform: ${process.platform} (${os.release()}), shell: zsh\nHome: ${os.homedir()}\nToday: ${new Date().toDateString()}`,
    'For native Mac apps use the computer tool (screenshot first, then click/type); prefer bash, files and the browser tool when they can do the job.',
    'Connector tools (named mcp__<connector>__<tool>) reach outside systems the person has plugged in; use them when they fit the task. You can control a live Android emulator with the device tool (tap, swipe, type, keys; iOS is view-only apart from opening URLs and launching apps). You can drive and inspect a real browser pane with the browser tool (open pages, read them, click, type, screenshot, read console and network, emulate phones). Always call read before clicking so you use fresh refs, and look at a screenshot to verify results. You can show visuals inline in the chat with the render tool (or a fenced ```html or ```svg block): diagrams, charts, UI mockups, small interactive demos. Rendered content is sandboxed and self-contained: inline CSS/JS only, no external resources.',
    'Stay on the user\'s task. Do not modify files unrelated to the request (shared build scripts, tooling, config, other modules, governance docs). If something unrelated is broken or blocks you, do not fix it: report it, work around it without editing it, or ask the user. If a build, test or verification command fails for reasons unrelated to your change (tooling, environment, module-format or config problems), report it once, work around it without editing the tooling, and continue. Prefer the smallest change that completes the task, and do not retry the same failing approach more than twice.',
    'Work step by step: inspect before changing, make focused edits, verify with commands when useful, then summarise what you did. Prefer edit_file over rewriting whole files. Use todo_write to track multi-step work and the task tool to delegate broad exploration to a sub-agent. Be concise.',
    effort ? effort.note : '',
    (cfg0.jira && cfg0.jira.token && cfg0.jira.baseUrl) ? 'Jira is connected: use jira_api (reads are automatic; ask before changing anything) and the jira-status and jira-label-report skills.' : '',
    (cfg0.gitlab && cfg0.gitlab.token) ? 'GitLab is connected: use gitlab_api for merge requests and the mr-review skill. Never post comments unless the user asked.' : '',
    cfg0.githubToken ? 'GitHub is connected: git clone/fetch/push to GitHub authenticate automatically (never print or echo tokens), and github_api manages pull requests and issues. Commit with clear messages, work on a branch, and ask before pushing to main.' : '',
    skills.length ? '# Skills\nAvailable skills (call the `skill` tool with the name to load full instructions, and follow them when the task matches):\n' + skills.map((s) => `- ${s.name}: ${s.description}`).join('\n') : '',
    mode === 'plan' ? 'PLAN MODE: you may only read and search. Do not modify anything. Investigate (load the planning skill), then call the exit_plan_mode tool with the complete step-by-step plan in markdown. Do not ask for approval in prose; the user approves in the plan card.' : '',
    extra ? `# User instructions\n${extra}` : '',
    cfg0.contextMode !== false ? 'Context mode is on: large command/search outputs are stored outside the conversation and replaced by a short preview plus an id. Use ctx_search / ctx_read on that id instead of re-running commands or asking for the full output.' : '',
    planning,
    claudeMd,
  ].filter(Boolean).join('\n\n');
}

const expandHome = (p) => String(p).replace(/^~(?=$|\/)/, os.homedir());
function isDenied(abs, perm) {
  return (perm.denyPaths || []).some((d) => {
    d = d.trim(); if (!d) return false;
    if (!d.includes('/')) return path.basename(abs) === d;
    const e = expandHome(d).replace(/\/$/, ''); return abs === e || abs.startsWith(e + '/');
  });
}
// Returns a reason string if the call must be blocked in every mode, else null.
function policyBlock(name, args, ws, perm) {
  if (!perm) return null;
  const pth = args.path !== undefined || ['read_file', 'write_file', 'edit_file', 'list_dir'].includes(name) ? resolveIn(ws, args.path) : null;
  if (pth && isDenied(pth, perm)) return `Blocked: ${pth} is a protected path (Settings → Permissions).`;
  if (perm.confineWrites && pth && EDIT_TOOLS.has(name)) {
    const ok = pth.startsWith(ws + '/') || pth.startsWith('/tmp/') || pth.startsWith('/private/tmp/') || pth.startsWith(os.tmpdir() + '/');
    if (!ok) return `Blocked: writes are confined to the workspace (${ws}).`;
  }
  const roAbs = (perm.readOnlyPaths || []).map((d) => d.trim()).filter(Boolean).map((d) => { const e = expandHome(d); return (path.isAbsolute(e) ? e : path.resolve(ws, e)).replace(/\/$/, ''); });
  if (pth && EDIT_TOOLS.has(name) && roAbs.some((x) => pth === x || pth.startsWith(x + '/'))) return `Blocked: ${path.relative(ws, pth) || pth} is read-only (Settings → Permissions → Read-only paths).`;
  if (name === 'bash') {
    const cmd = String(args.command || ''), low = cmd.toLowerCase();
    for (const x of roAbs) { const rel = path.relative(ws, x); if ((cmd.includes(x) || (rel && cmd.includes(rel))) && /(>|\btee\b|sed\s+-i|\bmv\b|\bcp\b|\brm\b|\btouch\b|\bchmod\b|\bgit\s+(checkout|restore)\b)/.test(cmd)) return `Blocked: command would change read-only path ${rel || x} (Settings → Permissions → Read-only paths).`; }
    for (const b of perm.blockCommands || []) if (b.trim() && low.includes(b.toLowerCase())) return `Blocked: command contains "${b.trim()}" (Settings → Permissions).`;
    for (const d of perm.denyPaths || []) {
      if (!d.includes('/')) { if (d.trim() && cmd.includes(d.trim())) return `Blocked: command touches protected file "${d.trim()}".`; continue; }
      if (cmd.includes(d) || cmd.includes(expandHome(d))) return `Blocked: command touches protected path ${d}.`;
    }
  }
  return null;
}
// Files that always need an explicit OK, even in Auto-accept / Full auto (CI, hooks, lockfiles, lint/build config).
function sensitiveReason(name, args, ws, perm) {
  const list = (perm && perm.alwaysAskPaths || []).map((d) => d.trim()).filter(Boolean);
  if (!list.length) return null;
  const hit = (rel) => list.find((d) => (d.endsWith('/') ? (rel + '/').startsWith(d) || rel.startsWith(d) : rel === d || path.basename(rel) === d || (d.includes('*') && new RegExp('^' + d.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(path.basename(rel)))));
  if (EDIT_TOOLS.has(name) && args.path) { const rel = path.relative(ws, resolveIn(ws, args.path)); const d = hit(rel); if (d) return `${rel} is a sensitive file (${d}); it always needs your approval`; }
  if (name === 'bash') {
    const cmd = String(args.command || '');
    if (/(>|\btee\b|sed\s+-i|\bmv\b|\bcp\b|\brm\b|\btouch\b|\bchmod\b|\bnpm\s+(install|i|uninstall|update)\b|\byarn\s+(add|remove)\b|\bgit\s+(checkout|restore|reset)\b)/.test(cmd)) {
      const d = list.find((x) => cmd.includes(x.replace(/\*/g, '')) && x.replace(/\*/g, '').length > 2); if (d) return `command may change a sensitive file (${d}); it always needs your approval`;
    }
  }
  return null;
}
const BROWSER_ACT = new Set(['click', 'double_click', 'right_click', 'type', 'press', 'eval']);
// Returns a reason string when a browser call needs the person's OK (acting inside the page, or opening a site that is not local), else null.
function browserReason(args) {
  const act = String(args.action || '').toLowerCase();
  if (BROWSER_ACT.has(act)) return act === 'eval' ? 'runs JavaScript inside the live page (you may be signed in there)' : 'acts inside the live browser (you may be signed in there)';
  if (act === 'open' || act === 'navigate' || act === 'goto') { try { const b = require('./browser'); const u = b.normUrl(args.url); if (!b.isLocal(u)) return `opens ${new URL(u).host} in the live browser, which keeps your sign-ins`; } catch {} }
  return null;
}
/** Streams text but drops <tool_call>…</tool_call> blocks that a small model sometimes writes as plain text (e.g. when its step budget is used up). */
/** For a path that does not exist: the real files with that name in the workspace, so a small model's next try succeeds. */
function didYouMean(ws, p) {
  const want = path.basename(String(p || '')).toLowerCase(); if (!want) return ''; const hits = [];
  const walk = (d, depth) => { if (depth > 5 || hits.length >= 5) return; let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of es) { if (/^(node_modules|\.git|dist|build|coverage|\.next)$/.test(e.name)) continue; const full = path.join(d, e.name); if (e.name.toLowerCase() === want) hits.push(path.relative(ws, full) + (e.isDirectory() ? '/' : '')); if (e.isDirectory()) walk(full, depth + 1); if (hits.length >= 5) return; } };
  walk(ws, 0); return hits.length ? ` Did you mean: ${hits.join(', ')}? (use list_dir or glob to see the folder)` : ' Use list_dir or glob to find the right path.';
}
function toolCallFilter() {
  let buf = '', inside = false;
  return { push(chunk) {
    buf += chunk; let out = '';
    for (;;) {
      if (inside) { const e = buf.indexOf('</tool_call>'); if (e < 0) { buf = buf.slice(-12); return out; } buf = buf.slice(e + 12); inside = false; continue; }
      const s = buf.indexOf('<tool_call>'); if (s >= 0) { out += buf.slice(0, s); buf = buf.slice(s + 11); inside = true; continue; }
      const lt = buf.lastIndexOf('<'); if (lt >= 0 && '<tool_call>'.startsWith(buf.slice(lt))) { out += buf.slice(0, lt); buf = buf.slice(lt); return out; }
      out += buf; buf = ''; return out;
    }
  } };
}
/** Commands that change the Mac outside the project (global settings, system files, permissions, installs from the internet): never run without your OK. */
const RISKY_CMD = /\bgit\s+config\s+(?:--global|--system)\b|\bsudo\b|\brm\s+-[a-z]*r[a-z]*f?\s+(?:\/|~|\$HOME)|\bchmod\b|\bchown\b|\b(?:curl|wget)\b[^|]*\|\s*(?:ba|z)?sh\b|\bnpm\s+(?:publish|unpublish)\b|\bdefaults\s+write\b|>\s*~\/\.|\blaunchctl\b/;
function autoAllowed(name, args, perm) {
  if (name !== 'bash' || !perm) return false;
  const cmd = String(args.command || '').trim();
  if (/[;&|`$><\n]/.test(cmd)) return false; // no chaining or redirection
  return (perm.allowCommands || []).some((a) => a.trim() && (cmd === a.trim() || cmd.startsWith(a.endsWith(' ') ? a : a + ' ')));
}
const resolveIn = (ws, p) => path.resolve(ws, String(p || '.').replace(/^~(?=$|\/)/, os.homedir()));
const clip = (s, n = 30000) => (s.length > n ? s.slice(0, n) + `\n…[truncated ${s.length - n} chars]` : s);

function walk(root, onFile, limit = 5000) {
  let n = 0;
  (function rec(d) {
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (IGNORE.has(e.name) || n >= limit) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) rec(full); else if (e.isFile()) { n++; onFile(full); }
    }
  })(root);
}
function globToRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') { if (g[i + 1] === '*') { i++; if (g[i + 1] === '/') i++; re += '(?:.*/)?'; } else re += '[^/]*'; }
    else if (c === '?') re += '[^/]'; else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

function gitEnv(cfg) {
  const env = { GIT_TERMINAL_PROMPT: '0' };
  if (cfg.gitName) { env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = cfg.gitName; }
  if (cfg.gitEmail) { env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = cfg.gitEmail; }
  if (cfg.githubToken) {
    const dir = process.env.GC_DATA_DIR || __dirname, f = path.join(dir, 'askpass.sh');
    try {
      fs.writeFileSync(f, '#!/bin/sh\ncase "$1" in *"$GC_GH_HOST"*) ;; *) exit 1;; esac\ncase "$1" in\n  *sername*) echo x-access-token;;\n  *) echo "$GITHUB_TOKEN";;\nesac\n', { mode: 0o700 });
      env.GIT_ASKPASS = f; env.GC_GH_HOST = cfg.githubHost || 'github.com'; env.GITHUB_TOKEN = cfg.githubToken; env.GH_TOKEN = cfg.githubToken;
      env.GIT_CONFIG_COUNT = '1'; env.GIT_CONFIG_KEY_0 = 'credential.helper'; env.GIT_CONFIG_VALUE_0 = '';
    } catch {}
  }
  return env;
}
function run(cmd, args, opts, signal, timeoutMs) {
  return new Promise((resolve) => {
    const { onData: _od, ...spawnOpts } = opts;
    const p = spawn(cmd, args, { ...spawnOpts, detached: true, env: { ...process.env, TERM: 'dumb', ...(opts.env || {}) } }); // own process group so cancelling kills the whole command tree
    let out = '', killed = '';
    const onData = opts.onData; let lastEmit = 0;
    const add = (d) => { if (out.length < 400000) out += d; if (onData && Date.now() - lastEmit > 700) { lastEmit = Date.now(); onData(out); } };
    p.stdout.on('data', add); p.stderr.on('data', add);
    const kill = (why) => { killed = why; try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch {} } };
    const t = setTimeout(() => kill(`timed out after ${timeoutMs / 1000}s`), timeoutMs);
    const onAbort = () => kill('cancelled');
    signal && signal.addEventListener('abort', onAbort, { once: true });
    p.on('error', (e) => { clearTimeout(t); resolve({ out: e.message, code: -1 }); });
    p.on('close', (code) => { clearTimeout(t); signal && signal.removeEventListener('abort', onAbort); resolve({ out, code, killed }); });
  });
}

function snapshot(ctx, f) {
  if (!ctx.id) return;
  try {
    fs.mkdirSync(CP_DIR(), { recursive: true }); const ex = fs.existsSync(f);
    fs.writeFileSync(path.join(CP_DIR(), ctx.id.replace(/[^\w-]/g, '_') + '.json'), JSON.stringify({ path: f, existed: ex, content: ex ? fs.readFileSync(f, 'utf8') : null }));
  } catch {}
}
function restoreCheckpoint(id) {
  const file = path.join(CP_DIR(), String(id).replace(/[^\w-]/g, '_') + '.json');
  const cp = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (cp.existed) fs.writeFileSync(cp.path, cp.content); else if (fs.existsSync(cp.path)) fs.unlinkSync(cp.path);
  fs.unlinkSync(file); return cp.path;
}
async function execTool(name, a, ctx) {
  const { ws, signal, fetchPage } = ctx;
  switch (name) {
    case 'read_file': {
      const f = resolveIn(ws, a.path); let st; try { st = fs.statSync(f); } catch (e) { if (e.code === 'ENOENT') throw new Error(`No such file: ${a.path}.${didYouMean(ws, a.path)}`); throw e; }
      const rk = `${f}|${a.offset || 1}|${a.limit || 2000}`;
      if (ctx.readSeen && ctx.readSeen.get(rk) === st.mtimeMs) return `(Already read earlier in this run and unchanged: ${path.relative(ws, f)}. Use the earlier output instead of reading it again.)`;
      if (ctx.readSeen) ctx.readSeen.set(rk, st.mtimeMs);
      if (st.isDirectory()) throw new Error('That is a directory; use list_dir');
      if (st.size > 5e6) throw new Error('File larger than 5 MB');
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      const off = Math.max(0, (a.offset || 1) - 1), lim = Math.min(a.limit || 2000, 2000);
      return clip(lines.slice(off, off + lim).map((l, i) => `${String(off + i + 1).padStart(5)}\t${l}`).join('\n')) + (off + lim < lines.length ? `\n…[${lines.length - off - lim} more lines]` : '');
    }
    case 'write_file': {
      const f = resolveIn(ws, a.path); const existed = fs.existsSync(f); snapshot(ctx, f);
      fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, a.content ?? '');
      return `${existed ? 'Overwrote' : 'Created'} ${f} (${(a.content || '').length} chars)`;
    }
    case 'edit_file': {
      const f = resolveIn(ws, a.path); const src = fs.readFileSync(f, 'utf8');
      if (!a.old_string) throw new Error('old_string is empty');
      const crlf = src.includes('\r\n'), fix = (t) => (crlf ? String(t ?? '').replace(/\r?\n/g, '\r\n') : String(t ?? ''));
      const oldS = fix(a.old_string), newS = fix(a.new_string);
      const n = src.split(oldS).length - 1;
      if (n === 0) {
        const first = a.old_string.split('\n')[0].trim(); let hint = '';
        if (first) { const ls = src.split('\n'); const k = ls.findIndex((l) => l.includes(first)); if (k >= 0) hint = ` The first line of old_string appears at line ${k + 1}: "${ls[k].trim().slice(0, 120)}", so check indentation and whitespace.`; }
        throw new Error('old_string not found.' + hint + ' Read the file again and match it exactly.');
      }
      if (n > 1 && !a.replace_all) throw new Error(`old_string matches ${n} times; add more context or set replace_all`);
      snapshot(ctx, f);
      const out = a.replace_all ? src.split(oldS).join(newS) : src.replace(oldS, () => newS);
      fs.writeFileSync(f, out);
      const line = out.slice(0, out.indexOf(newS)).split('\n').length;
      return `Edited ${f} (${a.replace_all ? n : 1} replacement${n > 1 && a.replace_all ? 's' : ''}, first at line ${line})`;
    }
    case 'list_dir': {
      const d = resolveIn(ws, a.path);
      return fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.name !== '.DS_Store')
        .sort((x, y) => y.isDirectory() - x.isDirectory() || x.name.localeCompare(y.name))
        .map((e) => (e.isDirectory() ? e.name + '/' : e.name)).join('\n') || '(empty)';
    }
    case 'glob': {
      const re = globToRe(a.pattern.replace(/^\.\//, '')); const hits = [];
      walk(ws, (f) => { const rel = path.relative(ws, f); if (re.test(rel) && hits.length < 1000) hits.push(rel); });
      return hits.join('\n') || 'No matches';
    }
    case 'grep': {
      const args = ['-rnEI', '--exclude-dir=node_modules', '--exclude-dir=.git', '--exclude-dir=dist'];
      if (a.include) args.push(`--include=${a.include}`);
      args.push('-e', a.pattern, resolveIn(ws, a.path));
      const r = await run('/usr/bin/grep', args, { cwd: ws }, signal, 30000);
      return clip((r.out || 'No matches').split('\n').map((l) => l.replace(ws + '/', '')).slice(0, 300).join('\n'));
    }
    case 'bash': {
      const t = Math.min(Math.max(a.timeout_seconds || 120, 1), 600) * 1000;
      const r = await run('/bin/zsh', ['-lc', a.command], { cwd: ws, env: ctx.cfg ? gitEnv(ctx.cfg) : {}, onData: ctx.progress ? (o) => ctx.progress(o.trim().split('\n').slice(-6).join('\n'), true) : undefined }, signal, t);
      return clip(r.out.trim() || '(no output)') + `\n[exit ${r.code}${r.killed ? ', ' + r.killed : ''}]`;
    }
    case 'http_request': {
      const u = new URL(a.url); const mod = u.protocol === 'http:' ? require('http') : require('https');
      const method = (a.method || 'GET').toUpperCase(); const data = a.body ? Buffer.from(a.body) : null;
      const headers = { 'User-Agent': 'GatewayChat', ...(a.headers || {}) }; if (data) headers['Content-Length'] = data.length;
      return await new Promise((resolve, reject) => {
        const rq = mod.request(u, { method, headers, signal, agent: u.protocol === 'https:' ? ctx.agentFor() : undefined, timeout: 60000 }, (r) => {
          let b = ''; r.on('data', (c) => { if (b.length < 200000) b += c; });
          r.on('end', () => resolve(`HTTP ${r.statusCode} ${r.statusMessage}\ncontent-type: ${r.headers['content-type'] || ''}\n\n${clip(b)}`));
        });
        rq.on('timeout', () => rq.destroy(new Error('Request timed out'))); rq.on('error', reject);
        if (data) rq.write(data); rq.end();
      });
    }
    case 'jira_api': case 'gitlab_api': {
      const kind = name === 'jira_api' ? 'jira' : 'gitlab'; const r = await require('./work').request(ctx.cfg, kind, String(a.path || ''), { method: (a.method || 'GET').toUpperCase(), body: a.body || null, signal });
      return `HTTP ${r.status}\n${clip(r.text, 20000)}`;
    }
    case 'calendar_events': {
      const port = process.env.TULAI_BOT_PORT || '39393'; let j; try { j = await (await fetch(`http://127.0.0.1:${port}/api/calendar/state`, { signal: AbortSignal.timeout(8000) })).json(); } catch { throw new Error('Tulai Bot is not running, so I cannot read the calendars. Start it from the menu bar.'); }
      const on = (j.sources || []).filter((s) => s.enabled); if (!on.length) return 'No calendar is turned on. The user can turn on Outlook, Google or Teams in Settings, Calendars.';
      const need = on.filter((s) => s.status && !s.status.ok).map((s) => `${s.name}: ${s.status.msg}`);
      return (j.events || []).length ? (j.events.map((e) => `${new Date(e.at).toLocaleString()} · ${e.title} (${e.source || ''})`).join('\n')) + (need.length ? `\nProblems: ${need.join('; ')}` : '') : 'No meetings in the next 24 hours.' + (need.length ? ` Problems: ${need.join('; ')}` : '');
    }
    case 'github_api': {
      const cfg = ctx.cfg; if (!cfg.githubToken) throw new Error('GitHub is not connected. Ask the user to add a token in Settings → GitHub.');
      if (!String(a.path || '').startsWith('/')) throw new Error('path must start with /');
      const u = new URL((cfg.githubApi || 'https://api.github.com').replace(/\/+$/, '') + a.path);
      const mod = u.protocol === 'http:' ? require('http') : require('https');
      const method = (a.method || 'GET').toUpperCase(); const data = a.body ? Buffer.from(a.body) : null;
      const headers = { Authorization: `Bearer ${cfg.githubToken}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'GatewayChat' };
      if (data) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = data.length; }
      return await new Promise((resolve, reject) => {
        const rq = mod.request(u, { method, headers, signal, agent: u.protocol === 'https:' ? ctx.agentFor() : undefined, timeout: 60000 }, (r) => {
          let b = ''; r.on('data', (c) => { if (b.length < 300000) b += c; });
          r.on('end', () => resolve(`HTTP ${r.statusCode}\n${clip(b, 20000)}`));
        });
        rq.on('timeout', () => rq.destroy(new Error('Request timed out'))); rq.on('error', reject);
        if (data) rq.write(data); rq.end();
      });
    }
    case 'web_fetch': {
      const r = await fetchPage(a.url); return `${r.title}\n${r.url}\n\n${r.text}`;
    }
    case 'todo_write': return 'Todo list updated';
    case 'task': return await ctx.sub(a.prompt, ctx.id);
    case 'ctx_search': {
      const lines = readCtx(a.id).split('\n'); let re; try { re = new RegExp(a.query, 'i'); } catch { re = new RegExp(String(a.query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
      const c = Math.min(Math.max(a.context ?? 2, 0), 10), hits = [], shown = new Set();
      lines.forEach((l, i) => { if (re.test(l) && hits.length < 40) { hits.push(i); } });
      const out = [];
      for (const i of hits) for (let k = Math.max(0, i - c); k <= Math.min(lines.length - 1, i + c); k++) if (!shown.has(k)) { shown.add(k); out.push(`${String(k + 1).padStart(6)}${k === i ? ':' : ' '} ${lines[k]}`); }
      return clip(out.join('\n') || 'No matches', 12000) + `\n[${hits.length} matching line(s)${hits.length >= 40 ? ', first 40 shown' : ''}; ${lines.length} total lines]`;
    }
    case 'ctx_read': {
      const lines = readCtx(a.id).split('\n'), off = Math.max(0, (a.offset || 1) - 1), lim = Math.min(a.limit || 200, 500);
      return lines.slice(off, off + lim).map((l, i) => `${String(off + i + 1).padStart(6)}  ${l}`).join('\n') + `\n[lines ${off + 1}-${Math.min(off + lim, lines.length)} of ${lines.length}]`;
    }
    case 'device': {
      const target = a.target === 'ios' ? 'ios' : 'android';
      const text = await shots.deviceInput({ ...a, target });
      if (!['boot'].includes(String(a.action).toLowerCase())) {
        await new Promise((r) => setTimeout(r, 900)); // let the screen settle
        const r = await shots.capture({ target, device: a.device }, ws, ctx.cfg);
        for (const sid of r.shots) { ctx.shot && ctx.shot(sid, `${target} · ${a.action}`); ctx.image && ctx.image(sid); }
        return `${text}. Screenshot attached in the next message (${r.width}×${r.height}); use pixel positions from it.`;
      }
      return text;
    }
    case 'computer': {
      const r = await require('./computer').run(a, { cfg: ctx.cfg });
      for (const sid of r.shots || []) { ctx.shot && ctx.shot(sid, `screen · ${a.action}`); ctx.image && ctx.image(sid); }
      return r.text;
    }
    case 'browser': {
      const r = await require('./browser').run(a, { ui: ctx.ui });
      for (const sid of r.shots || []) { ctx.shot && ctx.shot(sid, `browser · ${a.action}`); ctx.image && ctx.image(sid); }
      return r.text;
    }
    case 'render': return 'Rendered inline in the chat; the user can see it now.';
    case 'screenshot': {
      const r = await shots.capture(a, ws, ctx.cfg);
      for (const sid of r.shots) { ctx.shot && ctx.shot(sid, sid === r.id ? r.label : 'diff (red = changed)'); ctx.image && ctx.image(sid); }
      let t = `Captured ${r.label} (${r.width}×${r.height}, engine: ${r.engine}). The image is attached in the next message.`;
      if (r.baseline) t += `\nBaseline ${r.baseline}.`;
      if (r.diff) t += r.diff.sizeMismatch ? `\nCompare: size differs from baseline (${r.diff.a.width}×${r.diff.a.height} vs ${r.diff.b.width}×${r.diff.b.height}); cannot diff pixels.` : `\nCompare: ${r.diff.pct.toFixed(2)}% of pixels changed (${r.diff.changed}). Diff image attached after the screenshot.`;
      return t;
    }
    case 'snapshot': {
      if (a.action === 'create') { const r = await snapshots.create(ws, a.label || 'agent snapshot'); return `Snapshot created: ${r.hash.slice(0, 10)} (${r.label})`; }
      if (a.action === 'list') { const r = await snapshots.list(ws, 20); return r.error || r.snapshots.map((x) => `${x.hash.slice(0, 10)}  ${new Date(x.time).toLocaleString()}  ${x.label}`).join('\n') || 'No snapshots yet'; }
      if (a.action === 'restore') { const r = await snapshots.restore(ws, a.id); return `Restored. ${r.changed} file(s) changed, ${r.removed} created-since file(s) removed. A "before restore" snapshot was kept.`; }
      throw new Error('action must be create, list or restore');
    }
    case 'skill': {
      const all = loadSkills(ws, ctx.cfg?.skillDirs || []), sk = all.find((s) => s.name === a.name);
      if (!sk) throw new Error(`No skill named "${a.name}". Available: ${all.map((s) => s.name).join(', ')}`);
      return `# Skill: ${sk.name} (${sk.source}; folder: ${sk.dir})\n\n${sk.body}`;
    }
    default:
      if (mcp.isMcp(name)) return await mcp.call(name, a, { saveImage: async (buf) => { const sv = await shots.saveShot(buf); ctx.shot && ctx.shot(sv.id, name); ctx.image && ctx.image(sv.id); return sv.id; } });
      throw new Error(`Unknown tool ${name}`);
  }
}

// Stream one model turn. Returns { content, toolCalls, usage, finish }.
async function modelTurn(args) { // wrapper: heartbeat covers the whole wait, including before the first byte
  const hb = { last: Date.now() };
  const beat = setInterval(() => { const sec = Math.round((Date.now() - hb.last) / 1000); if (sec >= 8) args.emit({ type: 'waiting', secs: sec }); }, 5000);
  try { return await modelTurnInner({ ...args, hb }); } finally { clearInterval(beat); }
}
async function modelTurnInner({ upstream, cfg, payload, signal, emit, state, hb }) {
  let r;
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  for (let tries = 0; ; ) {
    const p = { ...payload, messages: resolveShots(payload.messages) };
    if (state.cache !== false && /claude/i.test(String(p.model))) p.messages = withCache(p.messages);
    if (state.think && !state.thinkOff) { p.thinking = { type: 'enabled', budget_tokens: state.think }; delete p.temperature; }
    try { r = await upstream(cfg, 'POST', '/v1/chat/completions', p, signal); }
    catch (e) {
      if (signal?.aborted || tries >= 3 || !/ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|EAI_AGAIN|stopped responding/i.test(`${e.code} ${e.message}`)) throw e;
      tries++; emit({ type: 'note', text: `Connection problem (${e.code || e.message}); retrying (${tries}/3)…` }); await sleep(1000 * 3 ** (tries - 1)); continue;
    }
    if (r.statusCode === 200) break;
    let b = ''; for await (const c of r) b += c;
    let m = b; try { m = JSON.parse(b).error?.message || b; } catch {}
    if (p.messages.some((x) => x.cache_control) && /cache_control|cache control|ephemeral/i.test(String(m))) { state.cache = false; emit({ type: 'note', text: 'Prompt caching is not supported by this gateway; continuing without it.' }); continue; }
    if (p.thinking && /thinking|reasoning|budget|temperature/i.test(String(m))) { state.thinkOff = true; emit({ type: 'note', text: 'Extended thinking unavailable on this gateway; continuing without it.' }); continue; }
    if ([429, 500, 502, 503, 504, 529].includes(r.statusCode) && tries < 3) {
      tries++; emit({ type: 'note', text: `AI server busy (${r.statusCode}); retrying (${tries}/3)…` }); await sleep(1000 * 3 ** (tries - 1)); continue;
    }
    throw new Error(`AI server ${r.statusCode}: ${String(m).slice(0, 500)}`);
  }
  let content = '', usage = null, finish = null, buf = ''; const rawCalls = toolCallFilter();
  const calls = [];
  const stallMs = (cfg.stallSeconds || 300) * 1000; let stalled = false;
  let idle; const bump = () => { hb.last = Date.now(); clearTimeout(idle); idle = setTimeout(() => { stalled = true; r.destroy(new Error(`The model stopped responding (no data for ${Math.round(stallMs / 1000)}s).`)); }, stallMs); }; bump();
  try {
  for await (const chunk of r) {
    bump();
    buf += chunk.toString('utf8');
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      if (!l.startsWith('data:')) continue; const d = l.slice(5).trim(); if (!d || d === '[DONE]') continue;
      let j; try { j = JSON.parse(d); } catch { continue; }
      if (j.usage) usage = j.usage;
      const ch = j.choices?.[0]; if (!ch) continue;
      if (ch.finish_reason) finish = ch.finish_reason;
      const dl = ch.delta || {};
      if (dl.reasoning_content) emit({ type: 'thinking', delta: dl.reasoning_content });
      if (dl.content) { content += dl.content; const shown = rawCalls.push(dl.content); if (shown) emit({ type: 'text', delta: shown }); } // a tool call the model wrote as plain text is never shown
      for (const tc of dl.tool_calls || []) {
        const i = tc.index ?? 0; const c = (calls[i] ||= { id: '', name: '', args: '' });
        if (tc.id) c.id = tc.id; if (tc.function?.name) c.name += tc.function.name; if (tc.function?.arguments) c.args += tc.function.arguments;
      }
    }
  }
  } catch (e) {
    // Nothing usable arrived yet and the stream stalled: safe to ask again (no tool has run, nothing was shown).
    if (stalled && !content && !calls.length && (state.stalls || 0) < 2) {
      state.stalls = (state.stalls || 0) + 1; emit({ type: 'note', text: `The model went quiet; retrying (${state.stalls}/2)…` });
      hb.last = Date.now(); return modelTurnInner({ upstream, cfg, payload, signal, emit, state, hb });
    }
    throw e;
  } finally { clearTimeout(idle); }
  return { content, toolCalls: calls.filter(Boolean), usage, finish };
}

function withCache(msgs) { // Anthropic prompt caching: mark the stable prefix (system) and the newest message so repeated steps reuse the cached history
  const out = msgs.map((m) => ({ ...m }));
  if (out[0] && out[0].role === 'system') out[0].cache_control = { type: 'ephemeral' };
  if (out.length > 1) out[out.length - 1].cache_control = { type: 'ephemeral' };
  return out;
}
function resolveShots(msgs) { // shot://<id> placeholders -> real data URLs (keeps chat storage small)
  return msgs.map((m) => !Array.isArray(m.content) ? m : { ...m, content: m.content.map((p) => {
    const u = String(p.image_url?.url || '');
    if (p.type !== 'image_url' || !(u.startsWith('shot://') || u.startsWith('media://'))) return p;
    const d = u.startsWith('shot://') ? shots.dataUrl(u.slice(7)) : store.mediaDataUrl(u.slice(8));
    return d ? { type: 'image_url', image_url: { url: d } } : { type: 'text', text: '[screenshot no longer available]' };
  }) });
}
function shrinkContext(msgs, emit, state) {
  const size = () => msgs.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content || '').length) + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0), 0);
  if (size() < 220000) return;
  let trimmed = false;
  for (let i = 1; i < msgs.length - 12; i++) {
    const m = msgs[i];
    if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 1500) { m.content = m.content.slice(0, 800) + '\n…[older output trimmed to save context]'; trimmed = true; }
    if (Array.isArray(m.content)) { m.content = m.content.map((p) => (p.type === 'image_url' ? { type: 'text', text: '[image omitted]' } : p)); trimmed = true; }
  }
  if (trimmed && !state.warned) { state.warned = true; emit({ type: 'note', text: 'Older tool output was trimmed to fit the context window.' }); }
}
const pending = new Map(); // approval id -> resolve
function resolveApproval(id, decision) { const f = pending.get(id); if (f) { pending.delete(id); f(decision); return true; } return false; }

async function runAgent({ upstream, fetchPage, agentFor, cfg, body, res }) {
  const ws = body.workspace && fs.existsSync(body.workspace) ? body.workspace : os.homedir();
  cfg = { ...cfg, run: { workspace: ws, mode: body.mode || 'ask' } }; // a command-line AI (engines.js) works in this folder with this permission mode
  const runId = Math.random().toString(36).slice(2, 8);
  try { mcp.configure(cfg.mcpServers || [], { agent: () => agentFor(cfg) }); await mcp.ready(15000); } catch {} // connectors start in the background; wait briefly for any that are still starting
  let mode = body.mode || 'ask';
  const skills = loadSkills(body.workspace && fs.existsSync(body.workspace) ? body.workspace : os.homedir(), cfg.skillDirs || []);
  const perm = Array.isArray(body.guard) && body.guard.length ? { ...cfg.permissions, readOnlyPaths: [...((cfg.permissions && cfg.permissions.readOnlyPaths) || []), ...body.guard.map(String)] } : cfg.permissions; // skills are immutable while they run
  const allow = new Set(body.allow || []);
  const ctl = new AbortController();
  let finished = false;
  res.on('close', () => { if (!finished) { ctl.abort(); } });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const emit = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); };

  const eff = EFFORT[body.effort] || EFFORT.medium;
  const state = { think: eff.think, thinkOff: cfg.features?.thinking === false, cache: cfg.features?.cache === false ? false : undefined };
  if (cfg.snapshots !== false && body.snapshot !== false) {
    try {
      const lastUser = [...body.messages].reverse().find((m) => m.role === 'user'), t = typeof lastUser?.content === 'string' ? lastUser.content : (lastUser?.content || []).find((p) => p.type === 'text')?.text || '';
      const why = snapshots.unsafe(ws);
      if (why) emit({ type: 'note', text: why }); else { const r = await snapshots.create(ws, 'before: ' + t.replace(/\s+/g, ' ').slice(0, 80)); emit({ type: 'snapshot', hash: r.hash, label: r.label }); }
    } catch (e) { emit({ type: 'note', text: 'Snapshot skipped: ' + e.message }); }
  }
  const msgs = [{ role: 'system', content: systemPrompt(ws, mode, body.system, eff, cfg, skills) }, ...body.messages];
  const memoryQuery=[...body.messages].reverse().find(m=>m.role==='user'&&typeof m.content==='string')?.content;
  if(memoryQuery){try{const memory=require('./bot-memory');msgs[0].content+='\n\n'+memory.context(await memory.retrieve(memoryQuery));}catch{}}
  const sub = async (prompt, tid) => {
    const prog = (text) => emit({ type: 'progress', id: tid, text });
    const t0 = Date.now(), DEADLINE = 4 * 60 * 1000;
    const m = [{ role: 'system', content: systemPrompt(ws, 'plan', null, eff, cfg) + '\n\nYou are a sub-agent. Investigate thoroughly using read/search tools, then reply with a concise report of your findings (file paths and line numbers where useful).' }, { role: 'user', content: String(prompt) }];
    const tools = TOOLS.filter((t) => READ_ONLY.has(t.function.name) && !['task', 'todo_write', 'screenshot', 'render'].includes(t.function.name));
    const finalReport = async () => {
      prog('Writing final report…');
      const t = await modelTurn({ upstream, cfg, signal: ctl.signal, emit: () => {}, state: { think: 0, thinkOff: true }, payload: { model: body.model, messages: [...m, { role: 'user', content: 'Stop investigating. Write your concise report of what you found so far.' }], tools, tool_choice: 'none', stream: true, max_tokens: 4000, temperature: 0.3 } });
      return t.content || '(sub-agent produced no report)';
    };
    for (let i = 0; i < 12; i++) {
      if (Date.now() - t0 > DEADLINE) return '(Sub-agent stopped at its time limit.)\n\n' + await finalReport();
      prog(`Step ${i + 1}: asking the model…`);
      const turn = await modelTurn({ upstream, cfg, signal: ctl.signal, emit: () => {}, state: { think: 0, thinkOff: true }, payload: { model: body.model, messages: m, tools, stream: true, max_tokens: 8000, temperature: 0.3 } });
      const am = { role: 'assistant', content: turn.content || (turn.toolCalls.length ? null : '') };
      if (turn.toolCalls.length) am.tool_calls = turn.toolCalls.map((c, k) => ({ id: c.id || `s_${i}_${k}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
      m.push(am); if (!turn.toolCalls.length) return turn.content || '(sub-agent returned nothing)';
      for (const tc of am.tool_calls) {
        let out; try { const a = JSON.parse(tc.function.arguments || '{}'); prog(`${tc.function.name} ${a.path || a.pattern || a.url || ''}`.trim()); out = policyBlock(tc.function.name, a, ws, perm) || await execTool(tc.function.name, a, { ws, signal: ctl.signal, fetchPage, cfg, agentFor: () => agentFor(cfg) }); } catch (e) { out = 'Error: ' + e.message; }
        m.push({ role: 'tool', tool_call_id: tc.id, content: clip(String(out), 20000) });
      }
    }
    return '(Sub-agent reached its step limit.)\n\n' + await finalReport();
  };
  const total = { prompt_tokens: 0, completion_tokens: 0 };
  try {
    let lastSig = '', rep = 0, conts = 0, fails = [], lastErr = '', recent = [], heads = [];
    const readSeen = new Map(), runStart = Date.now();
    const maxTok = cfg.maxRunTokens || 800000, maxMs = (cfg.maxRunMinutes || 15) * 60000;
    const billable = () => total.prompt_tokens - (total.cached || 0) + total.completion_tokens;
    const pauseRun = async (reason) => { // stop cleanly and say where things stand, so "Continue" is actually useful
      emit({ type: 'text', delta: `\n\n*(paused: ${reason})*\n\n` });
      try {
        const t = await modelTurn({ upstream, cfg, signal: ctl.signal, emit, state, payload: { model: body.model, messages: [...msgs, { role: 'user', content: 'Pause now. In under 120 words tell the user what is done, what remains, and anything blocking you. Do not call tools.' }], tools: [...TOOLS, ...mcp.specs()], tool_choice: 'none', stream: true, max_tokens: 700, temperature: 0.3 } });
        if (t.usage) { total.prompt_tokens += t.usage.prompt_tokens || 0; total.completion_tokens += t.usage.completion_tokens || 0; total.cached = (total.cached || 0) + (t.usage.prompt_tokens_details?.cached_tokens || t.usage.cache_read_input_tokens || 0); }
      } catch (e) { if (ctl.signal.aborted) throw e; }
      emit({ type: 'limit' });
    };
    for (let iter = 0; iter < eff.iter; iter++) {
      emit({ type: 'meter', step: iter + 1, steps: eff.iter, tokens: billable(), secs: Math.round((Date.now() - runStart) / 1000), maxTok, maxSecs: Math.round(maxMs / 1000) });
      if (iter > 0 && billable() > maxTok) { await pauseRun(`this run used about ${Math.round(billable() / 1000)}k tokens, over your ${Math.round(maxTok / 1000)}k limit`); break; }
      if (iter > 0 && Date.now() - runStart > maxMs) { await pauseRun(`this run has been going for ${Math.round((Date.now() - runStart) / 60000)} minutes, over your ${Math.round(maxMs / 60000)}-minute limit`); break; }
      if (fails.slice(-6).filter(Boolean).length >= 5) { await pauseRun(`the same kind of step failed 5 times, so I stopped instead of repeating it${lastErr ? ` (last error: ${String(lastErr).slice(0, 140)})` : ''}`); break; }
      shrinkContext(msgs, emit, state);
      const turn = await modelTurn({
        upstream, cfg, signal: ctl.signal, emit, state,
        payload: { model: body.model, messages: msgs, tools: [...TOOLS.filter((t) => (t.function.name !== 'exit_plan_mode' || mode === 'plan') && !(body.noComputer && t.function.name === 'computer')), ...mcp.specs()], stream: true, stream_options: { include_usage: true }, max_tokens: Math.max(body.max_tokens || 0, eff.max), temperature: body.temperature ?? 0.5 },
      });
      if (turn.usage) {
        total.prompt_tokens += turn.usage.prompt_tokens || 0; total.completion_tokens += turn.usage.completion_tokens || 0;
        total.cached = (total.cached || 0) + (turn.usage.prompt_tokens_details?.cached_tokens || turn.usage.cache_read_input_tokens || 0);
        if (!state.heavy && total.prompt_tokens - (total.cached || 0) > 600000) { state.heavy = true; emit({ type: 'note', text: 'This run is using a lot of tokens. If it is wandering, stop it and narrow the task, or use /compact.' }); }
      }
      const am = { role: 'assistant', content: turn.content || (turn.toolCalls.length ? null : '') };
      if (turn.toolCalls.length) am.tool_calls = turn.toolCalls.map((c, i) => ({ id: c.id || `call_${Date.now()}_${i}`, type: 'function', function: { name: c.name, arguments: c.args || '{}' } }));
      msgs.push(am); emit({ type: 'history', message: am });
      if (!turn.toolCalls.length) {
        if (turn.finish === 'length' && conts < 3) { conts++; const um = { role: 'user', content: 'Your reply was cut off. Continue exactly where you left off.' }; msgs.push(um); emit({ type: 'history', message: um }); continue; }
        break;
      }
      const turnImages = [];
      const ctxFor = (id) => ({ id, sub, readSeen, ui: (e) => emit(e), shot: (sid, label) => emit({ type: 'shot', id, url: `/shots/${sid}.png`, label }), image: (sid) => turnImages.push(sid), ws, signal: ctl.signal, fetchPage, cfg, agentFor: () => agentFor(cfg), progress: (text, replace) => emit({ type: 'progress', id, text, replace }) });
      const early = new Map(); // independent read-only calls in one turn run in parallel
      if (am.tool_calls.length > 1) for (const tc of am.tool_calls) {
        const n = tc.function.name; let a; try { a = JSON.parse(tc.function.arguments || '{}'); } catch { continue; }
        if (READ_ONLY.has(n) && n !== 'todo_write' && !policyBlock(n, a, ws, perm)) early.set(tc.id, execTool(n, a, ctxFor(tc.id)).then((v) => ({ v }), (e) => ({ e })));
      }

      for (const tc of am.tool_calls) {
        const name = tc.function.name; let args = {}, result, isErr = false, denied = false;
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch { result = 'Error: tool arguments were not valid JSON'; isErr = true; }
        emit({ type: 'tool', id: tc.id, name, args });
        const sig = name + tc.function.arguments; rep = sig === lastSig ? rep + 1 : 1; lastSig = sig;
        if (!isErr && rep >= 3) { result = 'Error: you have made this exact call 3 times in a row with no progress. Try a different approach, or ask the user for help.'; isErr = true; }
        { const head = name === 'bash' ? String(args.command || '').trim().split(/\s+/).slice(0, 3).join(' ') : ''; if (head) { heads.push(head); if (heads.length > 6) heads.shift(); if (!isErr && heads.length >= 5 && heads.filter((h) => h === head).length >= 5) { result = `Error: you ran "${head} …" 5 times with only the arguments changing. Stop, explain what you were trying to do, and ask the user.`; isErr = true; } } } // "git config x 88 88 88…": the same command with ever-longer arguments
        recent.push(sig); if (recent.length > 8) recent.shift(); if (!isErr && recent.length >= 8 && new Set(recent).size <= 2) { result = 'Error: you keep going back and forth between the same two steps. Stop and tell the user what you found and what you need from them.'; isErr = true; } // A, B, A, B… is a loop too
        if (!isErr && name === 'exit_plan_mode') {
          if (mode !== 'plan') { result = 'Not in plan mode; there is no plan to submit. Just continue the work.'; isErr = true; }
          else {
            const key = `${runId}:${tc.id}`;
            emit({ type: 'plan', id: tc.id, key, plan: String(args.plan || '') });
            const d = await new Promise((resolve) => { pending.set(key, resolve); ctl.signal.addEventListener('abort', () => resolveApproval(key, 'deny'), { once: true }); });
            if (d === 'plan_ask' || d === 'plan_edits') {
              mode = d === 'plan_edits' ? 'edits' : 'ask'; msgs[0].content = systemPrompt(ws, mode, body.system, eff, cfg, skills); emit({ type: 'mode', mode });
              result = 'The user approved the plan. Begin implementing it now, step by step (load the implementation skill), tracking progress with todo_write.';
            } else { result = 'The user did not approve the plan. Ask what they want changed, then revise it.'; isErr = true; denied = true; }
          }
        } else if (!isErr) {
          const blocked = (body.noComputer && name === 'computer') ? 'The computer tool is not available in this context.' : (body.noPush && name === 'bash' && /\bgit\b[\s\S]*\bpush\b/i.test(String(args.command || ''))) ? 'Blocked: Tulai Bot never pushes. Your commits stay local; push them yourself when you are ready.' : policyBlock(name, args, ws, perm);
          if (blocked) { result = blocked; isErr = true; denied = true; }
          let needs = !denied && !READ_ONLY.has(name) && !mcp.isReadOnly(name) && !(name === 'browser' && !browserReason(args)) && !(name === 'computer' && ['frontmost', 'wait'].includes(String(args.action).toLowerCase())) && !(name === 'snapshot' && ['create', 'list'].includes(args.action)) && !(['http_request', 'github_api', 'jira_api', 'gitlab_api'].includes(name) && ['GET', 'HEAD'].includes(String(args.method || 'GET').toUpperCase()));
          if (denied) { /* blocked by policy */ }
          else if (mode === 'plan' && needs) { result = 'Plan mode is read-only. Describe the change in your plan instead.'; isErr = true; denied = true; }
          else {
            if (mode === 'auto' || autoAllowed(name, args, perm) || allow.has(name) || (mode === 'edits' && EDIT_TOOLS.has(name))) needs = false;
            if (name === 'bash' && RISKY_CMD.test(String(args.command || ''))) needs = true; // changes to your Mac outside the project always ask, even in "allow everything"
            const sens = sensitiveReason(name, args, ws, perm); if (sens) needs = true;
            if (needs) {
              const key = `${runId}:${tc.id}`;
              emit({ type: 'approval', id: tc.id, key, name, reason: sens || (name === 'computer' ? `controls your whole Mac: ${args.action}${args.text ? ' "' + String(args.text).slice(0, 40) + '"' : args.key ? ' ' + args.key : args.name ? ' ' + args.name : args.x !== undefined ? ` at ${args.x},${args.y}` : ''}` : name === 'browser' ? browserReason(args) : name === 'device' ? `${args.action} on the ${args.target === 'ios' ? 'iOS Simulator' : 'Android emulator'}` : mcp.isMcp(name) ? `calls the "${name.split('__')[1]}" connector` : null) || undefined, lock: !!sens || name === 'computer' });
              const d = await new Promise((resolve) => {
                pending.set(key, resolve);
                ctl.signal.addEventListener('abort', () => resolveApproval(key, 'deny'), { once: true });
              });
              if (d === 'always' && !sens) { allow.add(name); emit({ type: 'allow', name }); }
              if (d === 'deny') { result = 'The user denied this action. Ask what they would like instead.'; isErr = true; denied = true; }
            }
            if (!denied) {
              emit({ type: 'running', id: tc.id });
              try {
                const pr = early.get(tc.id);
                result = pr ? await pr.then((x) => { if (x.e) throw x.e; return x.v; }) : await execTool(name, args, ctxFor(tc.id));
              } catch (e) { result = `Error: ${e.message}`; isErr = true; }
            }
          }
        }
        const forModel = cfg.contextMode !== false && !isErr && SANDBOX.has(name) && typeof result === 'string' && result.length > CTX_LIMIT ? compactOutput(result) : result;
        const tm = { role: 'tool', tool_call_id: tc.id, content: forModel };
        msgs.push(tm); emit({ type: 'history', message: tm });
        fails.push(isErr && !denied); if (isErr && !denied) lastErr = String(result || '').replace(/^Error:\s*/, '');
        emit({ type: 'tool_result', id: tc.id, output: clip(result, 20000), error: isErr, denied, checkpoint: !isErr && EDIT_TOOLS.has(name) });
        if (ctl.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      if (turnImages.length) { // images can't ride inside tool results, so attach them as a user message after the tool results
        const um = { role: 'user', content: [{ type: 'text', text: 'Screenshot(s) captured by the screenshot tool:' }, ...turnImages.map((sid) => ({ type: 'image_url', image_url: { url: 'shot://' + sid } }))] };
        msgs.push(um); emit({ type: 'history', message: um });
      }
      if (iter === eff.iter - 1) await pauseRun(`used all ${eff.iter} steps allowed at this effort level`);
    }
    emit({ type: 'done', usage: total });
  } catch (e) {
    if (e.name !== 'AbortError' && !ctl.signal.aborted) emit({ type: 'error', message: e.message });
    else emit({ type: 'done', usage: total, stopped: true });
  } finally {
    finished = true; res.end();
  }
}

module.exports = { RISKY_CMD, didYouMean, toolCallFilter, systemPrompt, TOOLS, loadSuiteSkills, runAgent, resolveApproval, execTool, EFFORT, policyBlock, autoAllowed, sensitiveReason, browserReason, gitEnv, restoreCheckpoint, loadSkills };
