// Runs the independent acceptance cases (test/acceptance/packs.js) against the REAL running Tulai Bot, one fresh conversation per prompt.
//   node scripts/pack-acceptance.js [--mode model|app] [--pack id] [--port 39393] [--out file.json]
// mode "model": the answer of the local model itself (what fine-tuning changed). mode "app": the whole bot, rules first (what a person experiences).
// Exit code 1 if any pack is below 80% (the per-pack minimum; all packs together must reach 85%). Nothing here is generated from the training templates.
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const args = process.argv.slice(2), arg = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d), mode = arg('--mode', 'model'), only = arg('--pack', ''), port = +arg('--port', 39393);
const { cases } = require('../test/acceptance/packs');
const post = (body) => new Promise((resolve, reject) => { const d = JSON.stringify(body), q = http.request({ host: '127.0.0.1', port, path: '/api/bot/eval', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d) }, timeout: 600000 }, (r) => { let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => { try { resolve(JSON.parse(t)); } catch (e) { reject(new Error('bad answer: ' + t.slice(0, 120))); } }); }); q.on('error', reject); q.write(d); q.end(); });
(async () => {
  const chosen = cases.filter((c) => !only || c.pack === only), by = {}, rows = [];
  for (const c of chosen) {
    let ans = '', err = ''; try { const r = await post({ mode, prompts: [c.prompt] }); const x = r.results && r.results[0]; ans = (x && x.answer) || ''; err = (x && x.error) || ''; } catch (e) { err = e.message; }
    let ok = false; try { ok = !!c.check(ans); } catch {}
    (by[c.pack] = by[c.pack] || { pass: 0, total: 0, fails: [] }); by[c.pack].total++; if (ok) by[c.pack].pass++; else by[c.pack].fails.push({ id: c.id, prompt: c.prompt.slice(0, 110), answer: ans.slice(0, 260), error: err });
    rows.push({ pack: c.pack, id: c.id, ok, answer: ans.slice(0, 600) }); process.stdout.write(ok ? '.' : 'x');
  }
  console.log(`\n\nAcceptance against the real bot (mode: ${mode})`); let bad = 0;
  for (const [p, v] of Object.entries(by)) { const pc = Math.round(v.pass * 100 / v.total), good = v.pass * 100 >= v.total * 80; if (!good) bad++; console.log(`${good ? 'PASS' : 'FAIL'}  ${p.padEnd(22)} ${v.pass}/${v.total} (${pc}%)`); for (const f of v.fails) console.log(`        x ${f.id}: ${f.prompt.replace(/\n/g, ' ')}\n          got: ${f.answer.replace(/\n/g, ' ').slice(0, 200)}${f.error ? ' ERROR ' + f.error : ''}`); }
  const out = arg('--out', path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat', 'training', `acceptance-${mode}.json`)); try { fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), mode, packs: by, rows }, null, 1)); console.log('\nReport: ' + out); } catch {}
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
