// Runs the real-life conversations (scenarios.js) against the REAL running Tulai Bot, through its real chat path with follow-up turns (its own rules + its own
// local trained brain; never the company AI), in separate test conversations so your chats are not touched. Prints a table and saves the results.
//   node scripts/bot-scenarios.js [--only <id-substring>] [--live]   (--live also runs the ones that send a Teams message or toggle a setting)
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { scenarios } = require('../scenarios');
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : ''), only = arg('--only'), live = process.argv.includes('--live');
const post = (body) => new Promise((resolve, reject) => { const d = JSON.stringify(body), q = http.request({ host: '127.0.0.1', port: 39393, path: '/api/bot/eval', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) } }, (r) => { let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => { try { resolve(JSON.parse(t)); } catch (e) { reject(e); } }); }); q.on('error', reject); q.setTimeout(900000, () => q.destroy(new Error('timeout'))); q.write(d); q.end(); });
(async () => {
  const rows = []; let pass = 0;
  for (const s of scenarios.filter((x) => (live || !x.live) && (!only || x.id.includes(only)))) {
    const t0 = Date.now(); let answers = [];
    try { answers = (await post({ mode: 'chat', conversation: true, sid: 'qa-' + s.id.slice(0, 30), prompts: s.turns })).results.map((r) => r.noAnswer ? '' : r.answer); } catch (e) { answers = ['ERROR ' + e.message]; }
    let ok = false; try { ok = !!s.check(answers); } catch {} if (ok) pass++;
    rows.push({ id: s.id, area: s.area, pass: ok, expect: s.expect, turns: s.turns, answers: answers.map((a) => String(a).slice(0, 700)), ms: Date.now() - t0 });
    process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${s.area.padEnd(16)} ${s.id.padEnd(20)} ${String(Date.now() - t0).padStart(6)} ms\n`);
  }
  console.log(`\n${pass}/${rows.length} conversations passed`);
  const out = path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat', 'training', 'scenarios.json'); try { fs.writeFileSync(out, JSON.stringify({ at: Date.now(), pass, total: rows.length, rows }, null, 2)); } catch {}
  for (const r of rows.filter((x) => !x.pass)) console.log(`\n✗ ${r.id} (${r.area}) — expected: ${r.expect}\n  said: ${r.turns.join(' ⟶ ')}\n  got:  ${r.answers.map((a) => (a || '(no answer)').replace(/\n/g, ' / ').slice(0, 220)).join('  ⟶  ')}`);
})();
