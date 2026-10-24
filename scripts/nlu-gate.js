// Runs the bot's real understanding step (nlu.js interpret, with its safety checks) against a candidate model server and prints the verdicts as JSON.
// usage: node scripts/nlu-gate.js <app dir> <port> [cases.json]      (ELECTRON_RUN_AS_NODE=1 also works with the Tulai binary)
// A case passes when the kind is right (and the command, if one is expected); a "chat" case passes when the model does NOT turn a conversational
// line into an action (the "Volume set to 100 percent" bug).
const fs = require('fs'), vm = require('vm'), path = require('path'), { createRequire } = require('module');
const [appArg, port, casesFile] = process.argv.slice(2), appDir = appArg ? path.resolve(appArg) : ''; if (!appDir || !port) { console.error('usage: nlu-gate.js <app dir> <port> [cases.json]'); process.exit(2); }
const file = path.join(appDir, 'nlu.js'), sandbox = { module: { exports: {} }, require: createRequire(file), __dirname: appDir, process: { env: {}, on() {} }, console: { log() {}, error() {} }, fetch, AbortSignal, Date, setTimeout, clearTimeout };
vm.runInNewContext(fs.readFileSync(file, 'utf8') + `\nensureLocal=async()=>true; llm=async(body)=>{const r=await fetch('http://127.0.0.1:${+port}/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);return r.json()};`, sandbox);
(async () => {
  const cases = JSON.parse(fs.readFileSync(casesFile || path.join(appDir, 'training-config', 'nlu-gate-cases.json'), 'utf8')).cases, out = [];
  for (const c of cases) {
    let result = null; try { result = await sandbox.module.exports.interpret(c.text, { apps: ['Safari', 'Microsoft Teams'], projects: ['gateway-chat'] }, { history: c.history || [] }); } catch {}
    const kind = result && result.kind, cmd = String((result && result.command) || '').toLowerCase();
    const pass = c.kind === 'chat' ? kind === 'question' || kind === 'not_for_me' : kind === c.kind && (!c.command || cmd === c.command);
    out.push({ group: c.kind === 'chat' ? 'chat' : 'nlu', name: c.text.slice(0, 60), passed: !!pass, expected: c.kind === 'chat' ? 'question or not_for_me (never an action)' : c.command ? `${c.kind}: ${c.command}` : c.kind, answer: result ? JSON.stringify(result) : 'no answer' });
  }
  const memCases = (JSON.parse(fs.readFileSync(casesFile || path.join(appDir, 'training-config', 'nlu-gate-cases.json'), 'utf8')).memory || []).map((c) => ({ ...c, group: 'memory' }));
  try { const sel = String(process.env.TULAI_PACKS || '').split(',').filter(Boolean), pk = JSON.parse(fs.readFileSync(path.join(appDir, 'training-config', 'skill-packs.json'), 'utf8')).packs || []; for (const p of pk.filter((x) => sel.includes(x.id))) for (const c of p.checks || []) memCases.push({ name: `${p.name}: ${c.prompt.replace(/\s+/g, ' ').slice(0, 52)}`, lessons: [], text: c.prompt, match: c.match || '', not: c.not || '', expect: c.expect || '', maxWords: 0, maxTokens: +c.maxTokens || 0, exec: c.exec || null, group: 'pack', pack: p.id }); } catch {}
  try { const cd = process.env.TULAI_CUSTOM_DIR; if (cd && fs.existsSync(cd)) for (const f of fs.readdirSync(cd).filter((x) => /\.jsonl?$/.test(x))) { const txt = fs.readFileSync(path.join(cd, f), 'utf8'); const rows = f.endsWith('.jsonl') ? txt.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }) : (() => { try { const j = JSON.parse(txt); return Array.isArray(j) ? j : j.examples || []; } catch { return []; } })(); for (const c of rows) if (c && c.check && c.prompt) memCases.push({ name: String(c.prompt).slice(0, 60), lessons: Array.isArray(c.memory) ? c.memory.map(String) : [], text: String(c.prompt), match: c.match || '', not: c.not || '', maxWords: +c.maxWords || 0, group: 'custom' }); } } catch {}
  for (const c of memCases) { // what is saved about the person is used, missing things are admitted, secrets are refused, the saved style is kept
    let r = '', byCode = false; if (c.group === 'pack') { try { const sv = require(path.join(appDir, 'pack-solvers.js')).solve(c.text); if (sv) { r = sv.answer; byCode = true; } } catch {} } // the bot answers these exact shapes with code (pack-solvers.js), so the check grades what the app really says
    if (!byCode) try { r = (await sandbox.module.exports.answer(c.text, { lessons: c.lessons || [], history: [], temperature: 0, ...(c.maxTokens ? { maxTokens: c.maxTokens, timeout: 60000 } : {}) })) || ''; } catch {}
    const bad = []; if (!r) bad.push('no answer'); if (c.match && !new RegExp(c.match, 'is').test(r)) bad.push(`does not say the right thing (${c.match})`); if (c.expect) { const nz = (x) => String(x).replace(/\s+/g, '').toLowerCase(); if (!nz(r).includes(nz(c.expect))) bad.push(`does not contain the exact expected answer (${String(c.expect).slice(0, 80)})`); } if (c.not && new RegExp(c.not, 'i').test(r)) bad.push(`says something it must not (${c.not})`); if (c.exec) { const why = require(path.join(appDir, 'scripts', 'code-exec.js')).check(r, c.exec); if (why) bad.push(why); } if (c.maxWords && r.split(/\s+/).filter(Boolean).length > c.maxWords) bad.push(`too long for the saved style (over ${c.maxWords} words)`);
    out.push({ group: c.group, ...(c.pack ? { pack: c.pack } : {}), ...(byCode ? { answeredBy: 'code' } : {}), name: c.name, passed: bad.length === 0, expected: c.expect || c.match || 'a sensible answer', answer: bad.length ? bad.join('; ') + ' | ' + r.slice(0, 700) : 'ok' });
  }
  const words = (t) => new Set(String(t).toLowerCase().match(/[a-z']+/g) || []), overlap = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let k = 0; for (const w of A) if (B.has(w)) k++; return k / (A.size + B.size - k); }; // Jaccard: 1 = the same words
  const dialogues = JSON.parse(fs.readFileSync(casesFile || path.join(appDir, 'training-config', 'nlu-gate-cases.json'), 'utf8')).dialogues || [];
  for (const dlg of dialogues) { // the real chat path (nlu.answer) with real history: no loops, no actions, the thread is kept
    const history = [], replies = [];
    for (const turn of dlg.turns) { let r = null; try { r = await sandbox.module.exports.answer(turn, { history: history.slice(-6), temperature: 0 }); } catch {} r = r || ''; replies.push(r); history.push({ role: 'user', content: turn }, { role: 'assistant', content: r }); }
    const bad = [];
    for (const rule of dlg.rules) {
      const idx = rule.turn === 'all' ? replies.map((_, i) => i) : [rule.turn];
      for (const i of idx) { const r = replies[i] || '';
        if (!r) bad.push(`turn ${i + 1}: no answer`); if (rule.not && new RegExp(rule.not, 'i').test(r)) bad.push(`turn ${i + 1}: talks about an action (${rule.not})`);
        if (rule.match && !new RegExp(rule.match, 'i').test(r)) bad.push(`turn ${i + 1}: does not answer the point (${rule.match})`);
        if (rule.differs && i > 0 && overlap(r, replies[i - 1]) >= 0.8) bad.push(`turn ${i + 1}: repeats the previous answer`); }
    }
    out.push({ group: 'conversation', name: dlg.name, passed: bad.length === 0, expected: 'a natural, different, on-topic reply each turn', answer: bad.length ? bad.join('; ') + ' | ' + replies.map((r) => r.slice(0, 60)).join(' / ') : 'ok' });
  }
  console.log(JSON.stringify(out));
})().catch((e) => { console.error(e.message); process.exit(1); });
