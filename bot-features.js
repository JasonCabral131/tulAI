// "What can you do / show your skills": everything installed, read from the real state (skill packs and whether they are trained, coding data, agent skills).
const fs = require('fs'), path = require('path');
function reply() {
  const L = ['### What I can do'];
  L.push('**Your team:** status and workload, risks and blockers, sprint report, weekly status, 1:1 prep, merge request queue, release notes, meeting action items (reports are saved in Documents › Tulai Reports).');
  L.push('**Your code:** git status, last commits, unpushed work, pull and rebase, run tests, ports, Docker, explain a copied error, and **commit my changes in <repo>**: you press **Allow** first, secret files are never staged and nothing is pushed.');
  L.push('**Files:** press 📎 to attach files or 📁 to attach a whole folder (or drop them here), then ask *explain this file* or *explain this folder*. Secrets, binaries and dependency folders are skipped.');
  L.push('**Exact numbers:** sprint velocity and forecast, RAG status, coverage, stale tickets, unreviewed PRs, service cycles and single points of failure are computed by code, not guessed.');
  L.push('**Your day:** reminders, calendars, meeting notes, Jira and email; signed-in accounts open in my own browser.');
  try {
    const packs = require('./skill-packs').list();
    L.push('\n**Skill packs** (fine-tuned into my local brain only after they pass the quality checks):');
    const st = (() => { try { return require('./self-test').load(); } catch { return null; } })(), sc = (id) => { const v = st && st.packs && st.packs[id]; return v ? ` · self-test ${v.pass}/${v.total}` : ''; };
    for (const p of packs) L.push(`- ${p.icon || '•'} ${p.name}${sc(p.id)}: ${p.state === 'up to date' ? '✅ trained' : p.state === 'update available' ? '⬆ update available' : p.selected ? '⏳ selected, not trained yet' : 'not selected'}`);
  } catch {}
  try { const sk = fs.readdirSync(path.join(__dirname, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); if (sk.length) L.push('\n**Agent skills installed** (used by Tulai Desktop for bigger work): ' + sk.join(', ') + '.'); } catch {}
  L.push('\nSay **test yourself** and I grade myself on independent questions, then **self-test results** shows what I am reliable at.');
  L.push('\n*Bigger coding work goes to Tulai Desktop. Ask “what are the other fine tuning, check the status” for training progress.*');
  return L.join('\n');
}
const plain = (t) => String(t).trim().toLowerCase().replace(/[?!.]+$/, '').replace(/\b(?:wat|wht|whut|wut)\b/g, 'what').replace(/\b(?:u|ya|yu)\b/g, 'you').replace(/\bcn\b/g, 'can').replace(/\b(?:pls|please|plz)\b/g, '').replace(/\s+/g, ' ').trim(); // "wat can u do" is "what can you do"
function handle(t) { t = plain(t); return /^(?:what can you do|what (?:is|are) your (?:abilities|ability|capabilities)|what are you capable of|ano(?:ng| ang) (?:kaya|magagawa) mo|help|what do you do|what are your (?:skills|features)|(?:show|list) (?:me )?(?:your |my |all )?(?:skills|features)|what (?:skills|features) do you have|features)\??$/i.test(String(t).trim()) ? { reply: reply(), via: 'features' } : null; }
module.exports = { handle, reply };
