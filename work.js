const path = require('path');
// Work tools for software engineers: Jira and GitLab (read-only helpers plus a generic authenticated call).
// Credentials live only in config.json on this Mac, are never shown to a model, and are only sent to the Jira/GitLab address you entered.
const fs = require('fs');
const http = require('http');
const https = require('https');

const agentFor = (cfg, u) => (u.protocol === 'https:' ? new https.Agent({ rejectUnauthorized: !cfg.insecureTls && !pinOf(u.host), ...(pinOf(u.host) ? { checkServerIdentity: () => undefined } : {}), ...(cfg.caFile && fs.existsSync(cfg.caFile) ? { ca: fs.readFileSync(cfg.caFile) } : {}) }) : undefined);
/* Company servers on the private network (10.x, 192.168.x, 172.16-31.x, *.local) often use the company's own certificate authority, which this app does not know.
   Like a browser's "trust this site" exception, the server's exact certificate is remembered the first time (pinned by its SHA-256 fingerprint);
   after that, a different certificate is refused. Internet addresses never get this. */
const PINS = () => path.join(process.env.GC_DATA_DIR || path.join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'trusted-servers.json');
const pins = () => { try { return JSON.parse(fs.readFileSync(PINS(), 'utf8')); } catch { return {}; } };
const pinOf = (host) => pins()[host] || null;
const privateHost = (h) => /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|127\.)/.test(h) || /\.(?:local|internal|corp|lan)$/i.test(h.split(':')[0]);
function pinFirst(u) { return new Promise((resolve) => { const port = +(u.port || 443), s = require('tls').connect({ host: u.hostname, port, servername: /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) ? undefined : u.hostname, rejectUnauthorized: false }, () => { const c = s.getPeerCertificate(); s.end(); if (!c || !c.fingerprint256) return resolve(false); const all = pins(); all[u.host] = { fingerprint256: c.fingerprint256, subject: (c.subject || {}).CN || '', issuer: (c.issuer || {}).CN || '', pinnedAt: new Date().toISOString() }; fs.writeFileSync(PINS(), JSON.stringify(all, null, 2), { mode: 0o600 }); resolve(true); }); s.on('error', () => resolve(false)); s.setTimeout(10000, () => { s.destroy(); resolve(false); }); }); }
const base = (s) => String(s || '').replace(/\/+$/, '');
const connected = (cfg) => ({ jira: !!(cfg.jira && cfg.jira.baseUrl && cfg.jira.token), gitlab: !!(cfg.gitlab && cfg.gitlab.baseUrl && cfg.gitlab.token) });

function headers(cfg, kind) {
  if (kind === 'jira') { const j = cfg.jira || {}; return { Authorization: j.auth === 'pat' ? `Bearer ${j.token}` : `Basic ${Buffer.from(`${j.email}:${j.token}`).toString('base64')}`, Accept: 'application/json' }; }
  return { 'PRIVATE-TOKEN': (cfg.gitlab || {}).token, Accept: 'application/json' };
}
/** One authenticated call. Returns { status, json, text }. */
function request(cfg, kind, pathAndQuery, { method = 'GET', body = null, timeout = 25000, signal } = {}) {
  const c = cfg[kind] || {}; if (!c.baseUrl || !c.token) return Promise.reject(new Error(`${kind === 'jira' ? 'Jira' : 'GitLab'} is not connected. Add the address and token in Settings → Work tools.`));
  if (!String(pathAndQuery).startsWith('/')) return Promise.reject(new Error('path must start with /'));
  const u = new URL(base(c.baseUrl) + pathAndQuery), mod = u.protocol === 'http:' ? http : https, data = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;
  const h = { ...headers(cfg, kind), 'User-Agent': 'Tulai' }; if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = data.length; }
  return new Promise((resolve, reject) => {
    const pin = pinOf(u.host); const rq = mod.request(u, { method, headers: h, agent: agentFor(cfg, u), timeout, signal }, (r) => { let t = ''; r.on('data', (x) => { if (t.length < 2e6) t += x; }); r.on('end', () => { let j = null; try { j = JSON.parse(t); } catch {} resolve({ status: r.statusCode, json: j, text: t }); }); });
    rq.on('timeout', () => rq.destroy(new Error('The server did not answer in time. Are you on the company network or VPN?'))); if (pin) rq.on('socket', (sock) => sock.once('secureConnect', () => { const c = sock.getPeerCertificate(); if (!c || c.fingerprint256 !== pin.fingerprint256) rq.destroy(new Error('The server certificate changed since it was trusted. Check that this is really your company server.')); }));
    rq.on('error', async (e) => { if (!pin && privateHost(u.host) && /self.signed|unable to verify|unable to get local issuer|certificate/i.test(e.message) && await pinFirst(u)) { try { return resolve(await request(cfg, kind, pathAndQuery, { method, body, timeout, signal })); } catch (e2) { return reject(e2); } } reject(e); }); if (data) rq.write(data); rq.end();
  });
}
const explain = (r, what) => { if (r.status === 401 || r.status === 403) throw new Error(`${what} refused the login (HTTP ${r.status}). Check the token, and for Jira Cloud also the email.`); if (r.status >= 400) throw new Error(`${what} answered HTTP ${r.status}.`); return r; };

/* ---------------- Jira ---------------- */
const ISSUE_FIELDS = 'summary,status,labels,priority,assignee,duedate,issuetype,updated,project,parent,created,resolutiondate';
const norm = (i) => { const f = i.fields || {}; return { key: i.key, summary: f.summary || '', status: (f.status && f.status.name) || '?', category: (f.status && f.status.statusCategory && f.status.statusCategory.name) || '', labels: f.labels || [], priority: (f.priority && f.priority.name) || '', assignee: (f.assignee && (f.assignee.displayName || f.assignee.name)) || 'Unassigned', due: f.duedate || '', type: (f.issuetype && f.issuetype.name) || '', updated: f.updated || '', project: (f.project && f.project.key) || '', created: f.created || '', resolved: f.resolutiondate || '' }; };
async function jiraSearch(cfg, jql, max = 50) {
  const q = `jql=${encodeURIComponent(jql)}&maxResults=${max}&fields=${ISSUE_FIELDS}`;
  const cloud = (cfg.jira || {}).auth !== 'pat';
  if (cloud) { const r = await request(cfg, 'jira', `/rest/api/3/search/jql?${q}`); if (r.status < 400) return (r.json.issues || []).map(norm); if (r.status !== 404 && r.status !== 410) explain(r, 'Jira'); }
  const r2 = explain(await request(cfg, 'jira', `/rest/api/2/search?${q}`), 'Jira'); return (r2.json.issues || []).map(norm);
}

/** The active sprint of a project (name, dates and its issues). Null when the project has no scrum board. */
async function jiraSprint(cfg, projects) {
  for (const key of projects) {
    const b = await request(cfg, 'jira', `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(key)}&type=scrum`).catch(() => null); if (!b || b.status >= 400 || !b.json) continue;
    for (const board of (b.json.values || []).slice(0, 3)) {
      const s = await request(cfg, 'jira', `/rest/agile/1.0/board/${board.id}/sprint?state=active`).catch(() => null), sp = s && s.json && (s.json.values || [])[0]; if (!sp) continue;
      const is = explain(await request(cfg, 'jira', `/rest/agile/1.0/sprint/${sp.id}/issue?maxResults=100&fields=${ISSUE_FIELDS}`), 'Jira');
      return { sprint: { id: sp.id, name: sp.name, start: sp.startDate || '', end: sp.endDate || '', goal: sp.goal || '', project: key }, issues: (is.json.issues || []).map(norm) };
    }
  }
  return null;
}
const esc = (s) => String(s).replace(/"/g, '\\"');
const myOpenJql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC';
const jiraMine = (cfg, max) => jiraSearch(cfg, myOpenJql, max);
const jiraByLabels = (cfg, labels, { mineOnly = false } = {}) => jiraSearch(cfg, `labels in (${labels.map((l) => `"${esc(l)}"`).join(', ')})${mineOnly ? ' AND assignee = currentUser()' : ''} ORDER BY status ASC, updated DESC`, 100);
function groupBy(list, f) { const m = new Map(); for (const x of list) for (const k of [].concat(f(x))) m.set(k, [...(m.get(k) || []), x]); return m; }
/** A compact plain-text status summary (for a spoken answer or a model to read). */
function jiraSummary(issues, title = 'Your open Jira issues') {
  if (!issues.length) return `${title}: none.`;
  const by = groupBy(issues, (i) => i.status), lines = [`${title}: ${issues.length}.`];
  for (const [s, l] of [...by.entries()].sort((a, b) => b[1].length - a[1].length)) lines.push(`${s}: ${l.length} (${l.slice(0, 3).map((i) => `${i.key} ${i.summary.slice(0, 50)}`).join('; ')}${l.length > 3 ? '; …' : ''})`);
  const overdue = issues.filter((i) => i.due && i.due < new Date().toISOString().slice(0, 10)); if (overdue.length) lines.push(`Overdue: ${overdue.map((i) => i.key).join(', ')}.`);
  return lines.join('\n');
}
function jiraByLabelReport(issues, labels) {
  const out = [`High-level report for labels ${labels.join(', ')}: ${issues.length} issues.`]; const byStatus = groupBy(issues, (i) => i.status);
  out.push('By status: ' + [...byStatus.entries()].map(([s, l]) => `${s} ${l.length}`).join(', ') + '.');
  for (const lb of labels) { const l = issues.filter((i) => i.labels.map((x) => x.toLowerCase()).includes(lb.toLowerCase())); const done = l.filter((i) => i.category === 'Done').length; out.push(`${lb}: ${l.length} total, ${done} done, ${l.length - done} open.`); }
  const byPerson = groupBy(issues.filter((i) => i.category !== 'Done'), (i) => i.assignee); out.push('Open work by person: ' + [...byPerson.entries()].map(([p, l]) => `${p} ${l.length}`).join(', ') + '.');
  return out.join('\n');
}

/* ---------------- GitLab ---------------- */
async function gitlabMRs(cfg, { author = '', state = 'opened', max = 20, reviewer = '' } = {}) {
  let q = `state=${state}&scope=all&per_page=${max}&order_by=updated_at`; if (reviewer) q += `&reviewer_username=${encodeURIComponent(reviewer)}`;
  if (author) { const u = explain(await request(cfg, 'gitlab', `/api/v4/users?search=${encodeURIComponent(author)}`), 'GitLab'); const hit = (u.json || [])[0]; if (!hit) throw new Error(`I could not find a GitLab user matching ${author}.`); q += `&author_id=${hit.id}`; }
  const r = explain(await request(cfg, 'gitlab', `/api/v4/merge_requests?${q}`), 'GitLab');
  return (r.json || []).map((m) => ({ id: m.id, iid: m.iid, project: m.project_id, title: m.title, author: (m.author && m.author.name) || '', branch: m.source_branch, target: m.target_branch, updated: m.updated_at, draft: !!(m.draft || m.work_in_progress), url: m.web_url, conflicts: !!m.has_conflicts, changes: m.changes_count, created: m.created_at || '', reviewers: (m.reviewers || []).length, reviewerNames: (m.reviewers || []).map((r) => r.name) }));
}
async function gitlabMRChanges(cfg, project, iid, maxChars = 40000) {
  const r = explain(await request(cfg, 'gitlab', `/api/v4/projects/${project}/merge_requests/${iid}/changes`), 'GitLab'); const j = r.json || {};
  let out = `MR !${j.iid} "${j.title}" by ${(j.author || {}).name} (${j.source_branch} → ${j.target_branch})\n${j.description || ''}\n`;
  for (const c of j.changes || []) { out += `\n--- ${c.new_path}\n${c.diff}`; if (out.length > maxChars) { out += '\n… (diff cut here)'; break; } }
  return out;
}
const mrLine = (m) => `!${m.iid} ${m.title} (${m.author}, ${m.branch} → ${m.target}${m.draft ? ', draft' : ''}${m.conflicts ? ', has conflicts' : ''})`;

async function test(cfg, kind) {
  if (kind === 'jira') { const r = await request(cfg, 'jira', (cfg.jira || {}).auth === 'pat' ? '/rest/api/2/myself' : '/rest/api/3/myself'); explain(r, 'Jira'); return `Connected to Jira as ${(r.json || {}).displayName || (r.json || {}).name || 'you'}.`; }
  const r = await request(cfg, 'gitlab', '/api/v4/user'); explain(r, 'GitLab'); return `Connected to GitLab as ${(r.json || {}).name || (r.json || {}).username || 'you'}.`;
}
async function gitlabMe(cfg) { const r = explain(await request(cfg, 'gitlab', '/api/v4/user'), 'GitLab'); return r.json || {}; }
module.exports = { jiraSprint, gitlabMe, connected, request, jiraSearch, jiraMine, jiraByLabels, jiraSummary, jiraByLabelReport, gitlabMRs, gitlabMRChanges, mrLine, test, myOpenJql };
