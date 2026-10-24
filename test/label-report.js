// "pull the data in jira with label X and create a high level report based on users outputs in <repo> in gitlab": labels parsed,
// people matched across Jira and Git spellings, the team's workflow stages counted (Ready for Development is not started), saved as a file.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), R = require('../label-report');
assert.deepStrictEqual(R.parseLabels('pull the data in jira with label of mini-app-governance-portal and create a high level report based on users outputs in mapp-governance-ui in gitlab'), ['mini-app-governance-portal']);
assert.deepStrictEqual(R.parseLabels('report for labels mobile-app, web-portal'), ['mobile-app', 'web-portal']);
assert(R.samePerson('Jason Santos', 'Jayson Santos') && R.samePerson('t-preyes', 'Pedro Reyes') && R.samePerson('carla.bautista', 'Carla Bautista') && !R.samePerson('Ana Lim', 'Mark Lopez'));
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-'));
(async () => {
  const issues = [{ key: 'MBM-1', status: 'Ready for Development', category: 'In Progress', assignee: 'Ana Lim' }, { key: 'MBM-2', status: 'Development', category: 'In Progress', assignee: 'Ana Lim' }, { key: 'MBM-3', status: 'For Review', category: 'In Progress', assignee: 'Pedro Reyes' }, { key: 'MBM-4', status: 'Done', category: 'Done', assignee: 'Pedro Reyes' }, { key: 'MBM-5', status: 'Open', category: 'To Do', assignee: 'Unassigned' }];
  const commits = [{ name: 'Ana Lim', email: 'w@x', at: '2026-10-10T10:00:00+08:00', subject: 'feat(MBM-2): table' }, { name: 't-preyes', email: 'n@x', at: '2026-10-11T10:00:00+08:00', subject: 'fix: chip' }];
  const r = await R.handle('report for jira label of team-x based on users outputs in demo-repo in gitlab', { work: { jiraByLabels: async () => issues }, resolve: () => ['/x/demo-repo'], gitLog: () => commits, nlu: { chat: async () => ({ content: '- Work is mostly in development.' }) } });
  assert(/5 tickets, 20% done\*\* \(1 in review, 1 in development, 1 ready for development, 1 open\)/.test(r.reply), r.reply);
  assert(/\| Ana Lim \| 1 \| 1 \| 0 \| 0 \| 1 \|/.test(r.reply) && /\| Pedro Reyes \| 0 \| 0 \| 1 \| 1 \| 1 \|/.test(r.reply), 't-preyes commits count for Pedro Reyes: ' + r.reply);
  assert(/1 tickets in development or review with no commit mentioning them/.test(r.reply) && /1 unassigned/.test(r.reply), r.reply);
  assert(fs.existsSync(r.files[0].path) && /## By person/.test(fs.readFileSync(r.files[0].path, 'utf8')), 'the full report is saved');
  assert.strictEqual(await R.handle('what is a label'), null);
  console.log('PASS label report: Jira + repository per person, workflow stages, saved file');
})().catch((e) => { console.error(e); process.exit(1); });
// the report has real charts: bars by stage, per person, commits per person, a weekly burn-up and commits per week (SVG files, embedded in the report)
{ const fs2 = require('fs'), os2 = require('os'), path2 = require('path'), L2 = require('../label-report'), now = Date.now(), day = 864e5, dir = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'charts-'));
  const issues = [['Done', 'Ana'], ['Development', 'Ben'], ['Ready for Development', 'Ana'], ['In Review', 'Ben']].map(([status, assignee], i) => ({ key: 'MBM-' + i, status, category: status === 'Done' ? 'Done' : '', assignee, created: new Date(now - (30 - i) * day).toISOString(), resolved: status === 'Done' ? new Date(now - 3 * day).toISOString() : '', updated: new Date(now).toISOString() }));
  const commits = [{ name: 'Ana', email: 'a@x', at: new Date(now - day).toISOString(), subject: 'MBM-0 done' }, { name: 'Ben', email: 'b@x', at: new Date(now - 9 * day).toISOString(), subject: 'MBM-1 wip' }];
  const s = L2.build(issues, commits, { labels: ['demo-label'], repoName: 'demo', days: 30 }), out = L2.drawCharts(s, issues, commits, dir);
  require('assert').deepStrictEqual(out.map((c) => c.title), ['Progress by stage', 'Open work per person', 'Commits per person', 'Burn-up: created vs done', 'Commits per week']);
  for (const c of out) { const t = fs2.readFileSync(c.file, 'utf8'); require('assert')(t.startsWith('<svg') && t.endsWith('</svg>') && /<(rect|polyline)/.test(t), c.title); }
  const md = L2.chartsMarkdown(out), imgs = [...md.matchAll(/!\[([^\]]+)\]\(data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)\)/g)];
  require('assert').strictEqual(imgs.length, 5, 'every chart is inside the .md itself (base64), so sending only the .md keeps the images');
  for (const m of imgs) require('assert')(Buffer.from(m[2], 'base64').toString('utf8').startsWith('<svg'), m[1]);
  require('assert')(!/\]\((?!data:)/.test(md), 'no links to chart files next to the report');
  console.log('PASS label report charts: 5 charts (bars, per person, burn-up and weekly lines) drawn from the counted data'); }
