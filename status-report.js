// "run the status report" (map-governance-ui's platform-reports): runs the repo's own report script (skills/platform-reports/report.mjs) and shows what
// it prints: summary, findings and the graphs. The script computes everything by rules (no AI at all); it reads Jira and GitLab with the sign-in that
// /platform-init saved, and writes docs/status/<date>.md. Off the VPN, Jira cannot be reached: the script changes nothing and Tulai offers a Git-only report.
const fs = require('fs'), os = require('os'), path = require('path'), { execFile } = require('child_process');
const SCRIPT = 'skills/platform-reports/report.mjs';
/** Projects on this Mac that have the report script (map-governance-ui first). */
function repos() {
  const out = []; for (const r of ['Desktop', 'Documents', 'Developer', 'Projects']) { const base = path.join(os.homedir(), r); let es = []; try { es = fs.readdirSync(base, { withFileTypes: true }); } catch {} for (const e of es) if (e.isDirectory() && fs.existsSync(path.join(base, e.name, SCRIPT))) out.push(path.join(base, e.name)); }
  return out.sort((a, b) => (/map-governance-ui$/.test(b) ? 1 : 0) - (/map-governance-ui$/.test(a) ? 1 : 0));
}
const ASK = /\b(?:status|platform|delivery)[- ]reports?\b|\bplatform[- ]reports\b|\bstatus-report\b/i;
const DO = /\b(?:run|generate|make|create|pull|show|give|refresh|update|do|gawa|gawin|patakbuhin|ipakita|kunin)\b|^\W*(?:the |my )?(?:status|platform|delivery)[- ]reports?\b/i;
function parse(text) {
  const t = String(text || ''), a = [];
  if (/\b(?:git[- ]only|without jira|no jira|walang jira)\b/i.test(t)) a.push('--git-only');
  const tk = /\b([A-Z][A-Z0-9]+-\d+)\b/.exec(t); if (tk) a.unshift(tk[1]); else if (/\bdrift\b/i.test(t)) a.unshift('--drift');
  const d = /\b(20\d\d-\d\d-\d\d)\b/.exec(t); if (d) a.push('--date', d[1]);
  return a;
}
const run = (repo, args) => new Promise((res) => execFile('/bin/zsh', ['-lc', `node ${SCRIPT} ${args.map((x) => `'${x.replace(/'/g, '')}'`).join(' ')}`], { cwd: repo, timeout: 240000, maxBuffer: 8e6 }, (e, so, se) => res({ ok: !e, out: `${so || ''}${se || ''}`.trim() })));
async function handle(text, opts = {}) {
  const t = String(text || '').trim(); if (!ASK.test(t) || !DO.test(t) || t.split(/\s+/).length > 30) return null;
  const all = (opts.repos || repos)(), named = all.filter((r) => t.toLowerCase().replace(/mapp-/g, 'map-').includes(path.basename(r).toLowerCase())), repo = (named[0] || all[0]);
  if (!repo) return { reply: `I could not find a project with the status report script (${SCRIPT}) in Desktop, Documents, Developer or Projects.`, via: 'status report' };
  const args = parse(t), r = await (opts.run || run)(repo, args), name = path.basename(repo);
  const body = r.out.replace(/^> .*$/gm, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 6000);
  if (/Jira is unavailable|ENOTFOUND|not signed in to Jira/i.test(body) && !args.includes('--git-only')) return { reply: `I ran the status report in **${name}**, but Jira could not be reached (are you on the VPN?). Nothing was changed.\n\n\`\`\`\n${body.slice(0, 600)}\n\`\`\`\n\nConnect to the VPN and say **run the status report** again, or say **status report git only** for a report from Git alone.`, via: 'status report' };
  if (!r.ok) return { reply: `The status report in **${name}** failed:\n\n\`\`\`\n${body.slice(0, 1500)}\n\`\`\``, via: 'status report' };
  const file = (/docs\/status\/[\w.-]+\.md/.exec(body) || [])[0];
  return { reply: `**Status report, ${name}**${args.length ? ` (${args.join(' ')})` : ''}: made by the repo's own report script, no AI involved.\n\n\`\`\`\n${body}\n\`\`\`${file ? `\n\nFull report: \`${path.join(repo, file)}\`` : ''}`, via: 'status report', ...(file ? { files: [{ path: path.join(repo, file), name: path.basename(file), ext: 'md' }] } : {}) };
}
module.exports = { handle, parse, repos, SCRIPT };
