// Reports for a team lead, built from your own Jira, GitLab and git on this Mac: no AI call, so they are instant and cost no tokens.
// Every report is spoken in short, saved as Markdown in Documents/Tulai Reports, and copied to the clipboard, ready for Slack, email or Confluence.
// Polishing a report into a stakeholder email is offered to Tulai Desktop (company AI); nothing is sent anywhere by itself.
const fs = require('fs');
const os = require('os');
const path = require('path');
const work = require('./work');

const DAY = 864e5, now = () => Date.now();
const cfgFile = () => path.join(process.env.GC_DATA_DIR || __dirname, 'config.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } };
const dir = () => process.env.TULAI_REPORTS_DIR || path.join(os.homedir(), 'Documents', 'Tulai Reports');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const pad = (n) => String(n).padStart(2, '0'), today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const NOT_JIRA = 'Jira is not connected yet. Open Tulai Desktop, Settings, Work tools, and add your Jira address and token. Then I can build team reports for you.';
const NOT_GITLAB = 'GitLab is not connected yet. Open Tulai Desktop, Settings, Work tools, and add your GitLab address and token.';
const daysAgo = (iso) => (iso ? Math.max(0, Math.floor((now() - new Date(iso).getTime()) / DAY)) : 0);
const first = (n) => String(n || '').split(/\s+/)[0];
const short = (s, n = 60) => (String(s).length > n ? String(s).slice(0, n - 1) + '…' : String(s));
let lastFile = '';

async function out(name, md, reply, extra = {}) {
  let file = '',html='';
  try {
    fs.mkdirSync(dir(), { recursive: true });
    const safe=String(name).replace(/[^a-zA-Z0-9 _-]/g,'_').slice(0,100);
    const stem=`${today()} ${safe} ${Date.now()}`;
    file=path.join(dir(),stem+'.md');html=path.join(dir(),stem+'.html');
    fs.writeFileSync(file,md);fs.writeFileSync(html,require('./report-html').render(name,md));lastFile=html;
  } catch(e) { return {reply:reply+' I could not save the report: '+e.message,...extra}; }
  try { require('./export').setLast(md, name); } catch {}
  let copied=false;try {await require('./dev-rules').clip.set(md);copied=true;}catch{}
  return {reply:`${reply} Saved a formatted HTML report with tables: ${html}.${copied?' The Markdown is also on your clipboard.':''}`,file:html,files:[html,file],...extra};
}

const table = (head, rows) => `| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;

/** Which Jira projects "my team" means: set in config (lead.projects), otherwise the projects of my own open issues. */
async function scope(cfg) {
  const set = cfg.lead && Array.isArray(cfg.lead.projects) && cfg.lead.projects.filter(Boolean);
  if (set && set.length) return set;
  const mine = await work.jiraMine(cfg, 60); return [...new Set(mine.map((i) => i.project).filter(Boolean))].slice(0, 6);
}
const projJql = (ps) => `project in (${ps.map((p) => `"${p}"`).join(', ')})`;
async function teamIssues(cfg, extraDone = 14) {
  const ps = await scope(cfg); if (!ps.length) throw new Error('I could not tell which Jira projects are yours. Add them in config as lead.projects, or get a ticket assigned first.');
  const issues = await work.jiraSearch(cfg, `${projJql(ps)} AND (statusCategory != Done OR resolved >= -${extraDone}d) ORDER BY updated DESC`, 100);
  return { ps, issues };
}
const open = (l) => l.filter((i) => i.category !== 'Done');
const isReview = (i) => /review|testing|qa|verify|uat/i.test(i.status);
const isBlocked = (i) => /block|impediment|on hold|waiting/i.test(i.status) || i.labels.some((l) => /^(blocked|blocker|impediment|on-hold)$/i.test(l));
const isOverdue = (i) => i.category !== 'Done' && i.due && i.due < today();
const isStale = (i) => i.category === 'In Progress' && daysAgo(i.updated) >= 5 && !isReview(i);
const byPerson = (l) => { const m = new Map(); for (const i of l) m.set(i.assignee, [...(m.get(i.assignee) || []), i]); return m; };

/* ---------------- reports ---------------- */
function teamStatus(issues, ps) {
  const op = open(issues), people = [...byPerson(op).entries()].filter(([p]) => p !== 'Unassigned').map(([p, l]) => ({ p, open: l.length, doing: l.filter((i) => i.category === 'In Progress' && !isReview(i)).length, review: l.filter(isReview).length, blocked: l.filter(isBlocked).length, overdue: l.filter(isOverdue).length, items: l }));
  people.sort((a, b) => b.open - a.open); const avg = people.length ? op.length / people.length : 0, heavy = people.filter((x) => x.open >= Math.max(8, Math.round(avg * 1.6))), idle = people.filter((x) => x.doing + x.review === 0), un = op.filter((i) => i.assignee === 'Unassigned'), over = op.filter(isOverdue), blocked = op.filter(isBlocked);
  const spoken = `${people.length} people have ${op.length - un.length} open issues in ${ps.join(' and ')}. Most loaded: ${people.slice(0, 3).map((x) => `${first(x.p)} ${x.open}${x.overdue ? `, ${x.overdue} overdue` : ''}`).join('; ')}.${idle.length ? ` Nothing in progress for ${idle.slice(0, 4).map((x) => first(x.p)).join(', ')}.` : ''}${blocked.length ? ` ${plural(blocked.length, 'issue')} blocked.` : ''}${un.length ? ` ${un.length} unassigned.` : ''}${over.length ? ` ${over.length} overdue in total.` : ''}`;
  const md = `# Team status, ${today()}\n\nProjects: ${ps.join(', ')}. Open issues: ${op.length}. Overdue: ${over.length}. Blocked: ${blocked.length}. Unassigned: ${un.length}.\n\n${table(['Person', 'Open', 'In progress', 'In review', 'Blocked', 'Overdue'], people.map((x) => [x.p, x.open, x.doing, x.review, x.blocked, x.overdue]))}\n\n${heavy.length ? `## Heavy load\n${heavy.map((x) => `- ${x.p}: ${x.open} open issues (team average ${avg.toFixed(1)})`).join('\n')}\n\n` : ''}${idle.length ? `## Nothing in progress\n${idle.map((x) => `- ${x.p} (${x.open} open, none started)`).join('\n')}\n\n` : ''}${over.length ? `## Overdue\n${over.slice(0, 15).map((i) => `- ${i.key} ${i.summary} (${i.assignee}, due ${i.due})`).join('\n')}\n\n` : ''}${un.length ? `## Unassigned\n${un.slice(0, 10).map((i) => `- ${i.key} ${i.summary} (${i.priority})`).join('\n')}\n` : ''}`;
  return { spoken, md };
}
function risks(issues) {
  const op = open(issues), blocked = op.filter(isBlocked), over = op.filter(isOverdue), stale = op.filter(isStale), urgent = op.filter((i) => i.assignee === 'Unassigned' && /highest|high|critical|blocker/i.test(i.priority));
  const line = (i) => `- ${i.key} ${i.summary} (${i.assignee}${i.due ? ', due ' + i.due : ''}${isStale(i) ? `, no update for ${daysAgo(i.updated)} days` : ''})`;
  const n = blocked.length + over.length + stale.length + urgent.length;
  const spoken = n ? `${plural(blocked.length, 'blocked issue')}, ${over.length} overdue, ${stale.length} not updated for 5 days or more, and ${urgent.length} high priority with no owner.${(blocked[0] || over[0] || stale[0]) ? ` First to look at: ${(blocked[0] || over[0] || stale[0]).key}, ${short((blocked[0] || over[0] || stale[0]).summary, 50)}.` : ''}` : 'I see no blocked, overdue or stale work. The board looks healthy.';
  const md = `# Risks and blockers, ${today()}\n\n${[['Blocked', blocked], ['Overdue', over], ['In progress but not updated for 5+ days', stale], ['High priority and unassigned', urgent]].map(([h, l]) => `## ${h} (${l.length})\n${l.length ? l.slice(0, 15).map(line).join('\n') : '- none'}`).join('\n\n')}\n`;
  return { spoken, md };
}
function sprintReport(data) {
  const { sprint, issues } = data, total = issues.length, done = issues.filter((i) => i.category === 'Done').length, doing = issues.filter((i) => i.category === 'In Progress').length, todo = total - done - doing, blocked = issues.filter((i) => i.category !== 'Done' && isBlocked(i)).length;
  const start = sprint.start ? new Date(sprint.start).getTime() : 0, end = sprint.end ? new Date(sprint.end).getTime() : 0, left = end ? Math.max(0, Math.ceil((end - now()) / DAY)) : null, elapsed = start && end ? Math.min(100, Math.max(0, Math.round(((now() - start) / (end - start)) * 100))) : null;
  const pct = total ? Math.round((done / total) * 100) : 0, behind = elapsed !== null && pct + 15 < elapsed, risky = issues.filter((i) => i.category === 'To Do' && left !== null && left <= 3);
  const spoken = `${sprint.name || 'The sprint'}${left !== null ? ` ends in ${plural(left, 'day')}` : ''}. ${pct} percent done, ${done} of ${total}. ${doing} in progress, ${todo} not started${blocked ? `, ${blocked} blocked` : ''}.${elapsed !== null ? (behind ? ` You are behind: ${elapsed} percent of the time is gone.` : ` Time used so far is ${elapsed} percent, so the pace looks fine.`) : ''}${risky.length ? ` ${risky.length} not started with 3 days or less left: likely to carry over.` : ''}`;
  const pp = [...byPerson(open(issues)).entries()].sort((a, b) => b[1].length - a[1].length);
  const md = `# Sprint report: ${sprint.name || 'current sprint'}\n\n${sprint.goal ? `Goal: ${sprint.goal}\n\n` : ''}- Dates: ${sprint.start ? sprint.start.slice(0, 10) : '?'} to ${sprint.end ? sprint.end.slice(0, 10) : '?'}${left !== null ? ` (${left} days left)` : ''}\n- Progress: ${done}/${total} done (${pct}%), ${doing} in progress, ${todo} not started, ${blocked} blocked\n${elapsed !== null ? `- Time used: ${elapsed}%${behind ? ' (behind the plan)' : ''}\n` : ''}\n## Remaining work by person\n${pp.length ? pp.map(([p, l]) => `- ${p}: ${l.length} (${l.filter((i) => i.category === 'In Progress').length} in progress)`).join('\n') : '- nothing left'}\n\n${risky.length ? `## Likely to carry over\n${risky.slice(0, 12).map((i) => `- ${i.key} ${i.summary} (${i.assignee})`).join('\n')}\n\n` : ''}## Done\n${issues.filter((i) => i.category === 'Done').slice(0, 25).map((i) => `- ${i.key} ${i.summary}`).join('\n') || '- none yet'}\n`;
  return { spoken, md };
}
function weekly(issues, mrs) {
  const wk = now() - 7 * DAY, done = issues.filter((i) => i.category === 'Done' && i.resolved && new Date(i.resolved).getTime() >= wk), doing = issues.filter((i) => i.category === 'In Progress'), up = open(issues).filter((i) => i.category === 'To Do' && /highest|high|critical|blocker/i.test(i.priority)).slice(0, 6), r = risks(issues);
  const risk = open(issues).filter((i) => isBlocked(i) || isOverdue(i) || isStale(i));
  const md = `# Weekly status report, week of ${today()}\n\n## Summary\n${plural(done.length, 'issue')} completed, ${plural(doing.length, 'issue')} in progress, ${plural(risk.length, 'risk')} to watch${mrs ? `, ${plural(mrs.length, 'merge request')} open` : ''}.\n\n## Completed this week\n${done.slice(0, 25).map((i) => `- ${i.key} ${i.summary} (${i.assignee})`).join('\n') || '- nothing closed this week'}\n\n## In progress\n${doing.slice(0, 20).map((i) => `- ${i.key} ${i.summary} (${i.assignee}${isReview(i) ? ', in review' : ''})`).join('\n') || '- none'}\n\n## Risks and blockers\n${risk.slice(0, 12).map((i) => `- ${i.key} ${i.summary}: ${isBlocked(i) ? 'blocked' : isOverdue(i) ? 'overdue since ' + i.due : 'no update for ' + daysAgo(i.updated) + ' days'} (${i.assignee})`).join('\n') || '- none'}\n\n## Next up\n${up.map((i) => `- ${i.key} ${i.summary} (${i.priority}, ${i.assignee})`).join('\n') || '- nothing high priority is waiting'}\n`;
  return { spoken: `This week: ${plural(done.length, 'issue')} completed, ${doing.length} in progress, ${risk.length} at risk${mrs ? `, ${mrs.length} merge requests open` : ''}.${done[0] ? ` Highlights: ${done.slice(0, 3).map((i) => short(i.summary, 40)).join('; ')}.` : ''}`, md };
}
function mrQueue(mrs) {
  const age = (m) => daysAgo(m.created || m.updated), old = mrs.filter((m) => age(m) >= 3 && !m.draft), drafts = mrs.filter((m) => m.draft), conf = mrs.filter((m) => m.conflicts), noRev = mrs.filter((m) => !m.draft && !m.reviewers);
  const oldest = [...mrs].filter((m) => !m.draft).sort((a, b) => age(b) - age(a))[0], by = new Map(); for (const m of mrs) by.set(m.author, [...(by.get(m.author) || []), m]);
  const spoken = mrs.length ? `${plural(mrs.length, 'merge request')} open: ${old.length} older than 3 days, ${plural(drafts.length, 'draft')}, ${conf.length} with conflicts, ${noRev.length} with no reviewer.${oldest ? ` Oldest: !${oldest.iid} ${short(oldest.title, 40)} by ${first(oldest.author)}, ${plural(age(oldest), 'day')}.` : ''}` : 'There are no open merge requests.';
  const md = `# Merge request queue, ${today()}\n\n${table(['MR', 'Title', 'Author', 'Age (days)', 'Reviewers', 'Flags'], [...mrs].sort((a, b) => age(b) - age(a)).map((m) => [`[!${m.iid}](${m.url})`, short(m.title, 70), m.author, age(m), m.reviewerNames && m.reviewerNames.length ? m.reviewerNames.join(', ') : 'none', [m.draft ? 'draft' : '', m.conflicts ? 'conflicts' : '', !m.draft && !m.reviewers ? 'no reviewer' : '', age(m) >= 3 && !m.draft ? 'waiting 3+ days' : ''].filter(Boolean).join(', ') || '-']))}\n\n## By author\n${[...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([p, l]) => `- ${p}: ${l.length}`).join('\n')}\n`;
  return { spoken, md };
}
function oneOnOne(name, issues, mrs) {
  const mine = issues.filter((i) => i.assignee.toLowerCase().includes(name.toLowerCase())); if (!mine.length) return null; const person = mine[0].assignee, wk = now() - 14 * DAY;
  const done = mine.filter((i) => i.category === 'Done' && i.resolved && new Date(i.resolved).getTime() >= wk), doing = mine.filter((i) => i.category === 'In Progress'), todo = mine.filter((i) => i.category === 'To Do'), over = mine.filter(isOverdue), stale = mine.filter(isStale), blocked = mine.filter(isBlocked);
  const pts = [done.length ? `Recognize: ${plural(done.length, 'issue')} closed in the last two weeks` : 'Ask why nothing was closed in the last two weeks', over.length ? `Overdue: ${over.map((i) => i.key).join(', ')}. Ask what is in the way` : '', stale.length ? `Not updated for 5+ days: ${stale.map((i) => i.key).join(', ')}` : '', blocked.length ? `Blocked: ${blocked.map((i) => i.key).join(', ')}. What can you unblock?` : '', mrs && mrs.length ? `${plural(mrs.length, 'merge request')} open, check the review load` : '', todo.length > 6 ? `${todo.length} not started: is the workload realistic?` : '', 'Ask about growth, feedback for you, and anything they are worried about'].filter(Boolean);
  const md = `# 1:1 prep: ${person}, ${today()}\n\n## Done in the last 2 weeks (${done.length})\n${done.map((i) => `- ${i.key} ${i.summary}`).join('\n') || '- none'}\n\n## In progress (${doing.length})\n${doing.map((i) => `- ${i.key} ${i.summary}`).join('\n') || '- none'}\n\n## Not started (${todo.length})\n${todo.slice(0, 10).map((i) => `- ${i.key} ${i.summary}`).join('\n') || '- none'}\n\n## Talking points\n${pts.map((x) => `- ${x}`).join('\n')}\n`;
  return { person, spoken: `${person}: ${done.length} done in two weeks, ${doing.length} in progress, ${todo.length} not started${over.length ? `, ${over.length} overdue` : ''}${blocked.length ? `, ${blocked.length} blocked` : ''}. ${pts[0]}.${pts[1] && pts[1].startsWith('Overdue') ? ' ' + pts[1] + '.' : ''}`, md };
}

/** Release notes from git: everything since the last tag (or the last 30 days), grouped and linked to ticket numbers. */
async function releaseNotes(projDir, jiraBase) {
  const { git } = require('./dev-rules'), tag = (await git(projDir, 'describe', '--tags', '--abbrev=0')).out, range = tag ? [`${tag}..HEAD`] : ['--since=30 days ago'];
  const log = await git(projDir, 'log', '--no-merges', '--pretty=%s', ...range); if (!log.ok) return null; const subs = log.out.split('\n').filter(Boolean); if (!subs.length) return { empty: true, tag };
  const G = { 'New': [], 'Fixes': [], 'Improvements': [], 'Other': [] }, K = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/;
  for (const s of subs) { const c = s.replace(/^(?:\[?[A-Z][A-Z0-9]{1,9}-\d{1,6}\]?[:\s-]*)/, '').replace(/^(\w+)(\([^)]*\))?!?:\s*/, (m, t) => `${t.toLowerCase()}:`), g = /^(?:feat|add|new|feature)\b/i.test(c) ? 'New' : /^(?:fix|bug|hotfix|patch)\b/i.test(c) ? 'Fixes' : /^(?:perf|refactor|improve|update|enhance|chore|build|docs)\b/i.test(c) ? 'Improvements' : 'Other'; const k = K.exec(s); G[g].push(`${c.replace(/^\w+:\s*/, '').replace(/^./, (x) => x.toUpperCase())}${k ? ` (${jiraBase ? `[${k[1]}](${jiraBase.replace(/\/+$/, '')}/browse/${k[1]})` : k[1]})` : ''}`); }
  const name = path.basename(projDir), md = `# ${name} release notes, ${today()}\n\n${tag ? `Changes since ${tag}` : 'Changes in the last 30 days'}: ${subs.length} commits.\n\n${Object.entries(G).filter(([, l]) => l.length).map(([h, l]) => `## ${h}\n${l.map((x) => `- ${x}`).join('\n')}`).join('\n\n')}\n`;
  return { name, tag, count: subs.length, groups: Object.fromEntries(Object.entries(G).map(([k, v]) => [k, v.length])), md };
}

/** The action items of the last meeting, read from its notes file and grouped by the person named. */
function meetingActions(file) {
  let t = ''; try { t = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const m = /## Action items\n([\s\S]*?)(?:\n## |\n*$)/.exec(t); if (!m) return []; return m[1].split('\n').map((l) => l.replace(/^-\s*/, '').trim()).filter((l) => l && !/none detected/i.test(l));
}

/** ctx: { sid, setPend, findFolder, roots, last, setLast, meetingFile }. Returns a reply object or null. */
async function handle(text, tl, ctx) {
  let m; const cfg = readCfg(), on = work.connected(cfg), PROJ = '(?:\\s+(?:in|for|on|of|at)\\s+(?:the\\s+|my\\s+)?(.+?)(?:\\s+(?:project|repo|repository|folder))?)?';
  const lead = /^(?:please\s+)?(?:give me |show me |show |tell me |check |prepare |create |make |generate |do |run |build |write |what(?:'s| is) |how(?:'s| is) )?(?:the |my |our |a )?/;

  if (/^(?:open|show)\s+(?:the\s+|my\s+|last\s+|latest\s+)*(?:report|reports(?:\s+folder)?)$/.test(tl)) {
    const target = /folder/.test(tl) || !lastFile ? dir() : lastFile; try { fs.mkdirSync(dir(), { recursive: true }); } catch {}
    const cp = require('child_process'); if (!process.env.TULAY_LOCAL_DRY) cp.execFile('/usr/bin/open', [target], () => {}); return { reply: lastFile && !/folder/.test(tl) ? 'Opened the last report.' : 'Opened your Tulai Reports folder.' };
  }
  if (/^(?:read|what are|what(?:'s| is)|give me|list|show)\s+(?:me\s+)?(?:the\s+|my\s+)?(?:action items|follow-?ups|to-?dos)(?:\s+(?:from|of|in))?(?:\s+(?:the\s+|my\s+|that\s+|last\s+))?\s*(?:meeting)?$|^who owns what(?: from the meeting)?$/.test(tl) && (/meeting/.test(tl) || /^who owns/.test(tl) || /action items/.test(tl))) {
    let f = ctx.meetingFile; try { if (!f) { const l = require('./meeting').lastSummary(); f = l && l.file; } } catch {}
    const items = f ? meetingActions(f) : null; if (items === null) return { reply: 'I have no finished meeting notes to read. Start meeting notes first, and say stop when the meeting ends.' };
    if (!items.length) return { reply: 'I found no action items in the last meeting.' };
    const md = `# Action items, ${today()}\n\n${items.map((x) => `- [ ] ${x}`).join('\n')}\n`; return out('Action items', md, `${plural(items.length, 'action item')}. ${items.slice(0, 3).map((x) => short(x, 80)).join('. ')}.`);
  }

  // ----- release notes from git (no Jira needed) -----
  if ((m = new RegExp(`^(?:generate |make |create |write |prepare |give me |show |what(?:'s| is) )?(?:the |our |my )?(?:release notes|changelog|change log|what(?:'s| is) (?:new|shipping|going out)(?: in (?:this|the next) release)?)${PROJ}$`).exec(tl)) && /release|changelog|change log|shipping|going out|what(?:'s| is) new/.test(tl)) {
    let d = m[1] ? ctx.findFolder(m[1].trim(), ctx.roots) : ctx.last; if (m[1] && !d) return { reply: `I could not find a project called ${m[1]}.` };
    if (!d || !fs.existsSync(path.join(d, '.git'))) return { reply: 'Which project are the release notes for? Say "release notes for" and its name.' };
    ctx.setLast && ctx.setLast(d); const r = await releaseNotes(d, (cfg.jira || {}).baseUrl);
    if (!r) return { reply: `I could not read the git history of ${path.basename(d)}.` }; if (r.empty) return { reply: `There are no new commits${r.tag ? ' since ' + r.tag : ''} in ${path.basename(d)}.` };
    const g = r.groups; return out(`${r.name} release notes`, r.md, `${r.name}: ${plural(r.count, 'change')}${r.tag ? ' since ' + r.tag : ' in 30 days'}. ${g.New} new, ${g.Fixes} ${g.Fixes === 1 ? 'fix' : 'fixes'}, ${g.Improvements} ${g.Improvements === 1 ? 'improvement' : 'improvements'}${g.Other ? `, ${g.Other} other` : ''}.`, { offerTask: `Turn these release notes into a short, friendly announcement for non-technical readers:\n\n${r.md}` });
  }

  // ----- merge request queue -----
  const mrWord = '(?:mrs?|merge requests?|pull requests?|prs?)';
  if (new RegExp(`^${lead.source.slice(1)}${mrWord}\\s+(?:queue|backlog|waiting|pending|status|report|aging|overview)$|^(?:which|what)\\s+${mrWord}\\s+(?:are\\s+)?(?:waiting|pending|stuck|old|open)$|^(?:the\\s+)?review queue$|^how many\\s+${mrWord}\\s+are\\s+open$`).test(tl)) {
    if (!on.gitlab) return { reply: NOT_GITLAB };
    try { const mrs = await work.gitlabMRs(cfg, { max: 60 }); const r = mrQueue(mrs); return out('MR queue', r.md, r.spoken); } catch (e) { return { reply: `I could not read GitLab: ${e.message}` }; }
  }
  if (new RegExp(`^(?:which|what)\\s+${mrWord}\\s+(?:are\\s+)?(?:waiting\\s+(?:on|for)\\s+me|assigned to me|for me to review)$|^${mrWord}s?\\s+(?:waiting|assigned)\\s+(?:on|for|to)\\s+me$|^what do i (?:still )?need to review$|^what should i review$`).test(tl)) {
    if (!on.gitlab) return { reply: NOT_GITLAB };
    try { const me = await work.gitlabMe(cfg), mrs = await work.gitlabMRs(cfg, { reviewer: me.username, max: 30 }); if (!mrs.length) return { reply: 'Nothing is waiting for your review.' }; const md = `# Merge requests waiting for my review, ${today()}\n\n${mrs.map((x) => `- [!${x.iid}](${x.url}) ${x.title} (${x.author}, ${daysAgo(x.created || x.updated)} days)`).join('\n')}\n`; return out('Waiting for my review', md, `${plural(mrs.length, 'merge request')} waiting for you. Oldest first: ${[...mrs].sort((a, b) => new Date(a.created || a.updated) - new Date(b.created || b.updated)).slice(0, 3).map((x) => `!${x.iid} by ${first(x.author)}`).join(', ')}.`); } catch (e) { return { reply: `I could not read GitLab: ${e.message}` }; }
  }

  // ----- Jira team reports -----
  const jiraReport = async (name, build) => { if (!on.jira) return { reply: NOT_JIRA }; try { const { ps, issues } = await teamIssues(cfg); const r = await build(issues, ps); if (!r) return { reply: 'I found nothing to report.' }; return out(name, r.md, r.spoken, r.extra); } catch (e) { return { reply: `I could not read Jira: ${e.message}` }; } };
  if (/^(?:(?:give me|show me|show|check|prepare|create|make|generate|what(?:'s| is))\s+)?(?:the\s+|my\s+|our\s+)?team(?:'s)?\s+(?:status|workload|work\s?load|progress|capacity)(?:\s+report)?$|^who(?:'s| is| are)\s+(?:overloaded|overworked|free|idle|busy|available|the busiest)$|^what(?:'s| is| are)\s+(?:everyone|everybody|the team)\s+(?:working on|doing)$|^workload\s+(?:per|by|of)\s+(?:person|member|developer|engineer)s?$|^(?:how(?:'s| is)\s+)?(?:the\s+|my\s+|our\s+)?team(?:\s+doing)?$/.test(tl)) return jiraReport('Team status', (issues, ps) => teamStatus(issues, ps));
  if (/^(?:what(?:'s| is| are)\s+)?(?:(?:the|our|my)\s+)?(?:blockers?|risks?|(?:blocked|stuck|stale|at risk)(?:\s+(?:tickets|issues|items|work))?|what(?:'s| is)\s+(?:blocked|stuck|at risk|slipping|late)|anything\s+(?:blocked|stuck|at risk)|any\s+blockers?|overdue(?:\s+(?:tickets|issues|items))?(?:\s+(?:in the team|of the team|for the team))?)(?:\s+(?:today|now|this week|right now))?$|^(?:risks?|blockers?)(?:\s+(?:report|summary))$|^(?:give me|show|prepare|create)\s+(?:a\s+|the\s+|my\s+)?(?:risks?|blockers?)(?:\s+(?:and|&)\s+(?:blockers?|risks?))?(?:\s+report)?$/.test(tl)) return jiraReport('Risks and blockers', (issues) => risks(issues));
  if (/\bsprint\b/.test(tl) && /^(?:(?:give me|show me|show|check|prepare|create|make|generate|what(?:'s| is))\s+)?(?:the\s+|my\s+|our\s+|this\s+|current\s+)*sprint\s+(?:status|report|progress|health|summary|review|burndown|update)$|^how(?:'s| is)\s+(?:the\s+|our\s+|this\s+)?sprint(?:\s+going)?$|^are we on track(?:\s+for\s+(?:the|this)\s+sprint)?$|^(?:sprint|are we) (?:on track|behind|late)\??$/.test(tl)) {
    if (!on.jira) return { reply: NOT_JIRA };
    try { const ps = await scope(cfg); let data = await work.jiraSprint(cfg, ps); if (!data) { const issues = await work.jiraSearch(cfg, `${projJql(ps)} AND sprint in openSprints() ORDER BY status ASC`, 100); if (!issues.length) return { reply: `I found no active sprint in ${ps.join(' or ')}.` }; data = { sprint: { name: 'The active sprint', start: '', end: '' }, issues }; } const r = sprintReport(data); return out('Sprint report', r.md, r.spoken); } catch (e) { return { reply: `I could not read Jira: ${e.message}` }; }
  }
  if (/^(?:(?:give me|show me|show|prepare|create|make|generate|write|draft|do)\s+)?(?:(?:the|my|our|a)\s+)?(?:weekly|week|friday|end of week|eow)(?:\s+(?:status|progress))?\s+(?:report|update|summary|status)$|^(?:status report|progress report|report for (?:my )?(?:manager|boss|stakeholders?|management)|(?:prepare|write|draft|create|make)\s+(?:my\s+|the\s+|a\s+)?status(?:\s+(?:report|update))?|what did (?:we|the team) (?:ship|finish|complete|do|deliver)(?:\s+this week)?)$/.test(tl)) {
    return jiraReport('Weekly status report', async (issues) => { let mrs = null; if (on.gitlab) { try { mrs = await work.gitlabMRs(cfg, { max: 40 }); } catch {} } const r = weekly(issues, mrs); return { ...r, extra: { offerTask: `Turn this into a short status email for my manager and stakeholders. Plain language, no jargon, lead with what matters most.\n\n${r.md}` } }; });
  }
  if ((m = /^(?:prepare|prep|get ready for|create|make|plan|write)\s+(?:my\s+|the\s+|a\s+|for\s+)*(?:1[:\s-]?on[:\s-]?1|1-1|one[- ]on[- ]one|1:1)(?:\s+(?:meeting|notes|prep))?\s*(?:with|for|kay|ni|para kay)?\s+([a-z][a-z.' -]{1,40})$|^(?:performance|progress|work)\s+(?:summary|review)\s+(?:of|for|ni|kay)\s+([a-z][a-z.' -]{1,40})$|^what(?:'s| is)\s+([a-z][a-z.'-]{1,30})\s+(?:working on|doing)$/.exec(tl))) {
    const name = (m[1] || m[2] || m[3]).replace(/\b(please|today|tomorrow|now|po)\b/g, '').trim();
    if (!name || /^(?:the team|everyone|everybody|me|i|you|this|that|it)$/.test(name)) return null;
    return jiraReport(`1on1 ${name}`, async (issues) => { let mrs = null; if (on.gitlab && !/working on|doing/.test(tl)) { try { mrs = await work.gitlabMRs(cfg, { author: name, max: 15 }); } catch {} } const r = oneOnOne(name, issues, mrs); return r ? { ...r, md: r.md } : null; }).then((x) => (x.reply === 'I found nothing to report.' ? { reply: `I could not find anyone called ${name} on your Jira projects.` } : x));
  }
  return null;
}

module.exports = { handle, teamStatus, risks, sprintReport, weekly, mrQueue, oneOnOne, releaseNotes, meetingActions, teamIssues, scope };
