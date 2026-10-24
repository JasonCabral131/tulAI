// "run the status report": runs the repo's own report script (no AI) with the right flags, shows what it prints, and off the VPN says so and offers
// a Git-only report instead of failing silently. Other "report" requests are left to their own rules.
const assert = require('assert'), S = require('../status-report');
assert.deepStrictEqual(S.parse('run the status report'), []); assert.deepStrictEqual(S.parse('status report git only'), ['--git-only']);
assert.deepStrictEqual(S.parse('status report for MBM-11375'), ['MBM-11375']); assert.deepStrictEqual(S.parse('run the drift status report for 2026-10-13'), ['--drift', '--date', '2026-10-13']);
(async () => {
  const repos = () => ['/x/map-governance-ui', '/x/other']; let ran = null;
  const ok = await S.handle('run the status report in mapp-governance-ui', { repos, run: async (repo, args) => { ran = [repo, args]; return { ok: true, out: '87 tickets · 38% code-complete\nOverall ████░░ 38%\nWrote docs/status/2026-10-14.md' }; } });
  assert.deepStrictEqual(ran, ['/x/map-governance-ui', []]); assert(/no AI involved/.test(ok.reply) && /38% code-complete/.test(ok.reply) && /docs\/status\/2026-10-14\.md/.test(ok.reply) && ok.files.length === 1);
  const off = await S.handle('status report', { repos, run: async () => ({ ok: false, out: 'platform-reports: Jira is unavailable (ENOTFOUND jira.mbtc.mgc.local).' }) });
  assert(/are you on the VPN/.test(off.reply) && /status report git only/.test(off.reply) && /Nothing was changed/.test(off.reply));
  for (const q of ['weekly status', 'what is a status report?', 'create a report by labels in jira', 'sprint report']) assert.strictEqual(await S.handle(q, { repos, run: async () => { throw Error('must not run'); } }), null, q);
  console.log('PASS status report: runs the repo\'s own script (no AI), shows the output, offers Git-only when Jira is off');
})().catch((e) => { console.error(e); process.exit(1); });
