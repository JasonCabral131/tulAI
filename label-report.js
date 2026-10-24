// "pull the data in Jira with label X and create a high level report based on users' outputs in <repo> in GitLab":
// Jira tickets with the label (status, people) + each person's commits in that repository (the copy on this Mac, last 30 days) + which label tickets
// their commits mention. Numbers are counted by code; Tulai's own AI only writes the 3-line summary. Saved in Documents › Tulai Reports.
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const DONE = /done|closed|resolved|released|complete/i, DEV = /develop|progress|review|qa|test/i;
/** Jira's own status category decides (To Do / In Progress / Done); the status name is only a fallback ("Ready for Development" is To Do). */
const stage = (i) => { const st = String(i.status || ''), c = String(i.category || '').toLowerCase(); if (c === 'done' || DONE.test(st)) return 'done'; if (/review|qa|test|uat|verify/i.test(st)) return 'review'; if (/^ready\b|^to do|^open|^backlog|^new|^selected/i.test(st)) return /^ready\b/i.test(st) ? 'ready' : 'todo'; if (DEV.test(st) || /progress/.test(c)) return 'dev'; return 'todo'; }; // the team's own workflow: "Ready for Development" is not started even when Jira files it under In Progress
const norm = (s) => String(s || '').toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
/** Labels look like "mini-app-governance-portal": words joined by - or _, separated by commas or "and". */
function parseLabels(text) {
  const m = /\blabels?\s*(?:of|na|ay|:|=|named|called)?\s*["']?([\s\S]+)$/i.exec(text); if (!m) return [];
  const out = []; for (const part of m[1].split(/\s*(?:,|\band\b|&|\/)\s*/i)) { const t = part.trim().split(/\s+/)[0].replace(/["'.,;:]+$/g, ''); if (/^[a-z0-9][\w.-]*[-_][\w.-]+$/i.test(t)) out.push(t); else break; }
  return out;
}
function gitLog(repo, days = 30) {
  const raw = execFileSync('git', ['-C', repo, 'log', `--since=${days}.days`, '--no-merges', '--format=%an%x09%ae%x09%cI%x09%s'], { encoding: 'utf8', maxBuffer: 16e6, timeout: 20000 });
  return raw.split('\n').filter(Boolean).map((l) => { const [name, email, at, subject] = l.split('\t'); return { name, email, at, subject: subject || '' }; });
}
/** One person, whatever the spelling: "Jason Santos" = "Jayson Santos" = "jason.santos", "t-preyes" = "Pedro Reyes". */
function samePerson(a, b) {
  const x = norm(a).split(' ').filter(Boolean), y = norm(b).split(' ').filter(Boolean); if (!x.length || !y.length) return false;
  const lx = x[x.length - 1], ly = y[y.length - 1]; if (norm(a) === norm(b)) return true;
  if (lx === ly && x[0][0] === y[0][0]) return true; // same last name, same first initial
  for (const [p, q] of [[x, y], [y, x]]) { const a = p[p.length - 1], b = q[q.length - 1]; if (a.length > b.length && a.endsWith(b) && a.slice(0, a.length - b.length) === q[0][0]) return true; } // "t-preyes" = Pedro Reyes (initial glued to the last name)
  const glued = (n) => n.join(''); if (x.length === 1 && (glued(y).endsWith(x[0].replace(/^[a-z] ?/, '')) && x[0][0] === y[0][0])) return true; // "tpreyes" ~ "Pedro Reyes"
  if (y.length === 1 && (glued(x).endsWith(y[0].replace(/^[a-z] ?/, '')) && y[0][0] === x[0][0])) return true;
  return false;
}
function build(issues, commits, { labels, repoName, days }) {
  const keys = new Set(issues.map((i) => i.key)), people = new Map(), add = (who) => { const k = [...people.keys()].find((p) => samePerson(p, who)) || who; if (!people.has(k)) people.set(k, { tickets: [], commits: 0, mentioned: new Set(), last: '' }); return people.get(k); };
  for (const i of issues) if (i.assignee && i.assignee !== 'Unassigned') add(i.assignee).tickets.push(i);
  for (const c of commits) { const p = add(c.email && c.email.includes('@') && !/noreply|devops/i.test(c.email) ? c.name : c.name); p.commits++; if (!p.last || c.at > p.last) p.last = c.at; for (const k of c.subject.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) || []) if (keys.has(k)) p.mentioned.add(k); }
  const byStatus = {}; for (const i of issues) byStatus[i.status] = (byStatus[i.status] || 0) + 1;
  const n = (st) => issues.filter((i) => stage(i) === st).length, done = n('done'), dev = n('dev'), review = n('review'), ready = n('ready'), todo = n('todo');
  const touched = new Set([...people.values()].flatMap((p) => [...p.mentioned])), today = new Date().toISOString().slice(0, 10);
  const quietDev = issues.filter((i) => (stage(i) === 'dev' || stage(i) === 'review') && !touched.has(i.key)), unassigned = issues.filter((i) => !i.assignee || i.assignee === 'Unassigned'), overdue = issues.filter((i) => i.due && i.due < today && stage(i) !== 'done');
  const rows = [...people.entries()].map(([name, p]) => ({ name, open: p.tickets.filter((t) => stage(t) === 'todo' || stage(t) === 'ready').length, dev: p.tickets.filter((t) => stage(t) === 'dev').length, review: p.tickets.filter((t) => stage(t) === 'review').length, done: p.tickets.filter((t) => stage(t) === 'done').length, commits: p.commits, mentioned: p.mentioned.size, last: p.last ? p.last.slice(0, 10) : '' })).sort((a, b) => b.commits - a.commits || (b.dev + b.open) - (a.dev + a.open));
  return { labels, repoName, days, total: issues.length, done, dev, review, ready, todo, byStatus, rows, quietDev, unassigned, overdue, commits: commits.length, linked: touched.size };
}
function markdown(s, summary) {
  const pct = s.total ? Math.round(s.done * 100 / s.total) : 0, L = [];
  L.push(`# High-level report: ${s.labels.join(', ')}`, '', `- **Jira:** ${s.total} tickets with the label${s.labels.length > 1 ? 's' : ''} ${s.labels.join(', ')}`, `- **Code:** ${s.repoName ? `${s.commits} commits in ${s.repoName} in the last ${s.days} days (the copy on this Mac; pull to include the newest work)` : 'no repository named'}`, `- **Made:** ${new Date().toLocaleString()} by Tulai on this Mac`, '');
  if (summary) L.push('## Summary', summary, '');
  L.push('## Progress', `**${pct}% done** · ${s.done} done · ${s.review} in review · ${s.dev} in development · ${s.ready} ready for development · ${s.todo} open`, '', '| Status | Tickets |', '|---|---:|', ...Object.entries(s.byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('## By person', '| Person | Not started | In development | In review | Done | Commits | Label tickets in commits | Last commit |', '|---|---:|---:|---:|---:|---:|---:|---|', ...s.rows.map((r) => `| ${r.name} | ${r.open} | ${r.dev} | ${r.review} | ${r.done} | ${r.commits} | ${r.mentioned} | ${r.last || '-'} |`), '');
  L.push('## Needs attention');
  if (s.quietDev.length) L.push(`- **${s.quietDev.length} tickets in development or review with no commit mentioning them** in the last ${s.days} days: ${s.quietDev.slice(0, 12).map((i) => `${i.key} (${i.assignee})`).join(', ')}${s.quietDev.length > 12 ? ', …' : ''}`);
  if (s.unassigned.length) L.push(`- **${s.unassigned.length} unassigned tickets**: ${s.unassigned.slice(0, 10).map((i) => i.key).join(', ')}${s.unassigned.length > 10 ? ', …' : ''}`);
  if (s.overdue.length) L.push(`- **${s.overdue.length} overdue tickets**: ${s.overdue.slice(0, 10).map((i) => `${i.key} (due ${i.due})`).join(', ')}`);
  if (!s.quietDev.length && !s.unassigned.length && !s.overdue.length) L.push('- Nothing stands out.');
  L.push('', '_Commit counts show activity, not productivity. Tickets are linked to commits only when the commit message mentions the ticket key._');
  return L.join('\n');
}
/** Five chart images for the report: progress by stage, open work per person, commits per person, a weekly burn-up (created vs done) and commits per week. */
/** The charts as Markdown with each SVG embedded as base64, so the .md shows its images when it is sent or moved on its own (no folder of files to send along). */
function chartsMarkdown(charts) {
  if (!charts.length) return '';
  return '\n\n## Charts\n\n' + charts.map((c) => `### ${c.title}\n\n![${c.title}](data:image/svg+xml;base64,${Buffer.from(fs.readFileSync(c.file, 'utf8')).toString('base64')})`).join('\n\n') + '\n';
}
function drawCharts(s, issues, commits, outDir) {
  const C = require('./report-charts'), out = [], lab = s.labels.join(', '), save = (name, title, svg) => { fs.mkdirSync(outDir, { recursive: true }); const f = path.join(outDir, name); fs.writeFileSync(f, svg); out.push({ title, file: f }); };
  save('1-progress-by-stage.svg', 'Progress by stage', C.bars([{ label: 'Done', value: s.done, color: '#16a34a' }, { label: 'In review', value: s.review, color: '#0891b2' }, { label: 'In development', value: s.dev, color: '#2563eb' }, { label: 'Ready for dev', value: s.ready, color: '#d97706' }, { label: 'Open', value: s.todo, color: '#94a3b8' }], `Progress by stage · ${lab}`, `${s.total} tickets · ${s.total ? Math.round(s.done * 100 / s.total) : 0}% done`, 'Stages follow your Jira workflow: Ready for Development counts as not started.'));
  const people = s.rows.map((r) => ({ label: r.name, value: r.open + r.dev + r.review })).filter((p) => p.value > 0).sort((a, b) => b.value - a.value).slice(0, 14);
  if (people.length) save('2-open-work-per-person.svg', 'Open work per person', C.hbars(people, `Open work per person · ${lab}`, 'Tickets not done (not started + in development + in review)', 'Shows load, not performance.'));
  const cpp = s.rows.filter((r) => r.commits > 0).map((r) => ({ label: r.name, value: r.commits })).sort((a, b) => b.value - a.value).slice(0, 14);
  if (cpp.length) save('3-commits-per-person.svg', 'Commits per person', C.hbars(cpp, `Commits per person · ${s.repoName}`, `Last ${s.days} days`, 'Commit counts show activity, not productivity.', '#7c3aed'));
  const created = issues.map((i) => Date.parse(i.created)).filter(Number.isFinite);
  if (created.length) {
    const now = new Date(), from = new Date(Math.max(Math.min(...created), now - 16 * 7 * 864e5)), wk = C.weeks(from, now), end = (d) => d.getTime() + 7 * 864e5;
    const doneAt = (i) => (i.resolved ? Date.parse(i.resolved) : stage(i) === 'done' ? Date.parse(i.updated) : NaN);
    const cr = wk.map((d) => issues.filter((i) => Date.parse(i.created) < end(d)).length), dn = wk.map((d) => issues.filter((i) => doneAt(i) < end(d)).length);
    save('4-burn-up.svg', 'Burn-up: created vs done', C.lines(wk.map((d) => `${d.getMonth() + 1}/${d.getDate()}`), [{ name: 'Tickets created (total)', values: cr }, { name: 'Tickets done (total)', values: dn }], `Burn-up · ${lab}`, 'Cumulative per week (week starting Monday)', 'The gap between the lines is the work still open.'));
  }
  if (commits.length) {
    const wk = C.weeks(new Date(Date.now() - s.days * 864e5), new Date()), per = wk.map((d) => commits.filter((c) => { const t = Date.parse(c.at); return t >= d.getTime() && t < d.getTime() + 7 * 864e5; }).length);
    save('5-commits-per-week.svg', 'Commits per week', C.lines(wk.map((d) => `${d.getMonth() + 1}/${d.getDate()}`), [{ name: `Commits in ${s.repoName}`, values: per }], `Commits per week · ${s.repoName}`, `Last ${s.days} days`, 'Merge commits excluded.'));
  }
  return out;
}
async function handle(text, opts = {}) {
  const t = String(text || ''); if (!/\blabels?\b/i.test(t) || !/\b(?:report|summary|overview|output|status|high[- ]level|gumawa)\b/i.test(t)) return null;
  const labels = parseLabels(t); if (!labels.length) return null;
  const cfg = opts.workConfig || (() => { try { return JSON.parse(fs.readFileSync(path.join(process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat'), 'config.json'), 'utf8')); } catch { return {}; } })();
  const w = opts.work || require('./work'); let issues;
  try { issues = await w.jiraByLabels(cfg, labels); } catch (e) { return { reply: `I could not read Jira: ${e.message}` }; }
  let repo = null, commits = [], days = 30; try { const found = (opts.resolve || require('./code-ingest').resolve)(t); if (found.length) { repo = found[0]; commits = (opts.gitLog || gitLog)(repo, days); } } catch {}
  const s = build(issues, commits, { labels, repoName: repo ? path.basename(repo) : '', days });
  const busiest = s.rows.slice().sort((a, b) => b.commits - a.commits)[0], loaded = s.rows.slice().sort((a, b) => (b.open + b.dev + b.review) - (a.open + a.dev + a.review))[0], pct = s.total ? Math.round(s.done * 100 / s.total) : 0;
  const summary = [ // written from the counted numbers (a small model invents or repeats when it summarizes a table)
    `- **${pct}% done**: ${s.total} tickets — ${s.review} in review, ${s.dev} in development, ${s.ready} ready for development, ${s.todo} open.`,
    s.repoName && busiest ? `- **Most code activity:** ${busiest.name} (${busiest.commits} commits in ${s.repoName}); **most open work:** ${loaded.name} (${loaded.open + loaded.dev + loaded.review} tickets not done).` : `- **Most open work:** ${loaded ? loaded.name + ' (' + (loaded.open + loaded.dev + loaded.review) + ' tickets not done)' : 'nobody assigned yet'}.`,
    `- **Watch:** ${s.quietDev.length} in progress with no commit mentioning them, ${s.unassigned.length} unassigned, ${s.overdue.length} overdue.`].join('\n');
  const dir = path.join(os.homedir(), 'Documents', 'Tulai Reports'), day = new Date().toISOString().slice(0, 10), file = path.join(dir, `${day} ${labels[0]} report.md`);
  let charts = []; try { charts = drawCharts(s, issues, commits, path.join(dir, `${day}-${labels[0]}-charts`)); } catch {}
  const md = markdown(s, summary) + chartsMarkdown(charts);
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, md); } catch {}
  let views = []; try { views = charts.map((c) => require('./viewer').register(c.file)).filter(Boolean); } catch {}
  const top = s.rows.slice(0, 8).map((r) => `| ${r.name} | ${r.open} | ${r.dev} | ${r.review} | ${r.done} | ${r.commits} |`).join('\n');
  return { reply: `**${labels.join(', ')}: ${s.total} tickets, ${s.total ? Math.round(s.done * 100 / s.total) : 0}% done** (${s.review} in review, ${s.dev} in development, ${s.ready} ready for development, ${s.todo} open)${repo ? ` · ${s.commits} commits in ${path.basename(repo)}, last ${days} days` : ' · no repository found on this Mac'}\n\n${summary ? summary + '\n\n' : ''}| Person | Not started | In dev | Review | Done | Commits |\n|---|---:|---:|---:|---:|---:|\n${top}\n\n${s.quietDev.length ? `⚠️ ${s.quietDev.length} tickets in development or review with no commit mentioning them. ` : ''}${s.unassigned.length ? `${s.unassigned.length} unassigned. ` : ''}\n\nFull report (with ${charts.length} charts): \`${file}\``, via: 'label-report', files: [{ path: file, name: path.basename(file), ext: 'md' }], ...(views.length ? { views } : {}) };
}
module.exports = { chartsMarkdown, drawCharts, handle, parseLabels, build, markdown, samePerson, gitLog };
