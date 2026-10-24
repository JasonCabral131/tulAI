// "Test yourself": the bot answers the independent acceptance questions (written by hand, never in its training) on this Mac and grades itself,
// so it knows which skills it is reliable at. Exact-format questions are answered the way the chat answers them: code first (pack-solvers), then the local brain.
const fs = require('fs'), path = require('path');
const file = () => path.join(process.env.GC_DATA_DIR || path.join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'training', 'self-test.json');
const load = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return null; } };
let running = null;
async function run({ nlu = require('./nlu'), onCase, guard = true } = {}) {
  const { cases } = require('./acceptance-packs'), S = require('./pack-solvers'), byPack = {}, model = (() => { try { return require('./active-model').state().current?.run || 'base model'; } catch { return 'unknown'; } })();
  for (const c of cases) {
    const sv = S.solve(c.prompt); let ans = sv ? sv.answer : ''; if (!sv) { try { ans = (await nlu.answer(c.prompt, { history: [], temperature: 0, maxTokens: 700, timeout: 120000 })) || ''; } catch {} }
    let ok = false; try { ok = !!c.check(ans); } catch {}
    const b = (byPack[c.pack] = byPack[c.pack] || { pass: 0, total: 0, byCode: 0, fails: [] }); b.total++; if (ok) b.pass++; if (sv) b.byCode++; if (!ok) b.fails.push(c.id); if (onCase) onCase(c, ok);
  }
  const out = { at: Date.now(), model, cases: cases.length, packs: byPack }; fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(out, null, 2), { mode: 0o600 });
  const hist = history(); hist[model] = { at: out.at, packs: byPack }; saveHistory(hist);
  if (guard) { try { const r = await keepOrRestore(out, hist); if (r) return r; } catch {} }
  return out;
}
const histFile = () => path.join(path.dirname(file()), 'self-test-history.json');
/** Self-test score of every brain on this Mac: {run: {at, packs, rejected?}}. */
function history() { try { return JSON.parse(fs.readFileSync(histFile(), 'utf8')); } catch { return {}; } }
function saveHistory(h) { const keep = Object.entries(h).sort((a, b) => b[1].at - a[1].at).slice(0, 30); fs.writeFileSync(histFile(), JSON.stringify(Object.fromEntries(keep), null, 2), { mode: 0o600 }); }
const total = (packs) => Object.values(packs).reduce((a, v) => [a[0] + v.pass, a[1] + v.total], [0, 0]);
/** A new brain is worse than the one it replaced when it gets 3 or more fewer self-test questions right, or a pack that was at 80% or more falls under 80%. */
function worse(now, before) {
  const [a] = total(now), [b] = total(before), under = (v) => v && v.pass * 100 < v.total * 80;
  const fell = Object.keys(now).filter((id) => before[id] && under(now[id]) && !under(before[id]));
  if (a < b - 2) return `it got ${a} self-test questions right, the brain before it got ${b}${fell.length ? ` (fell under 80%: ${fell.join(', ')})` : ''}`; // 1-2 questions out of ~100 is normal wobble; new skills the self-test does not measure (tools, coding) are not thrown away for it
  if (fell.length) return `${fell.join(', ')} fell under 80%`;
  return '';
}
/** Right after a new brain grades itself: if it is worse than the brain it replaced, switch back to that one (no question asked) and keep its score. */
async function keepOrRestore(out, hist, am = require('./active-model')) {
  const st = am.state(), prev = st.previous?.run; if (st.current?.run !== out.model || !prev || !hist[prev] || hist[prev].rejected) return null;
  const why = worse(out.packs, hist[prev].packs); if (!why) return null;
  await am.rollback(); hist[out.model] = { ...hist[out.model], rejected: why }; saveHistory(hist);
  const back = { at: Date.now(), model: prev, cases: out.cases, packs: hist[prev].packs, restoredFrom: { run: out.model, why } }; fs.writeFileSync(file(), JSON.stringify(back, null, 2), { mode: 0o600 });
  return back;
}
function report(r) {
  if (!r) return 'I have not tested myself yet. Say **test yourself** and I will run my independent skill tests (about 10 minutes, on this Mac only).';
  const names = (() => { try { return Object.fromEntries(require('./skill-packs').list().map((p) => [p.id, p.name])); } catch { return {}; } })();
  const rows = Object.entries(r.packs).map(([id, v]) => ({ id, name: names[id] || id, pct: Math.round(v.pass * 100 / v.total), ...v })).sort((a, b) => b.pct - a.pct);
  const good = rows.filter((x) => x.pct >= 85), weak = rows.filter((x) => x.pct < 85);
  return [`### My self-test (${new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})`, `${r.cases} independent questions that were never in my training, graded by their own checks. My brain: ${r.model}.`, ...(r.restoredFrom ? ['', `↩️ I switched back to this brain on my own: the newer one (${r.restoredFrom.run}) was worse: ${r.restoredFrom.why}. These are this brain's own scores.`] : []), '',
    '**Reliable (85% or better):**', ...(good.length ? good.map((x) => `- ✅ ${x.name}: ${x.pass}/${x.total} (${x.pct}%)${x.byCode ? `, ${x.byCode} answered by exact code` : ''}`) : ['- none yet']), '',
    '**Not reliable yet:**', ...(weak.length ? weak.map((x) => `- ⚠️ ${x.name}: ${x.pass}/${x.total} (${x.pct}%). Double-check my answers here.`) : ['- none']), '',
    '*Questions that reach the company AI are answered there, not by my local brain; this test measures my local brain and my exact-code answers.*'].join('\n');
}
function handle(text, opts = {}) {
  const t = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, '');
  if (/^(?:please\s+)?(?:test yourself|test your skills|run (?:a |your )?self[- ]test|self[- ]test|check your skills|subukan mo sarili mo)$/.test(t)) {
    if (running) return { reply: 'I am already testing myself. Ask **self-test results** in a few minutes.' };
    running = run({ nlu: opts.nlu }).catch(() => null).finally(() => { running = null; });
    return { reply: 'Testing myself now on independent questions that were never in my training (about 10 minutes, on this Mac). Ask **self-test results** when you want the score.', via: 'self-test' };
  }
  if (/^(?:show |what are )?(?:your |my )?self[- ]test(?: results?)?$|^(?:how good are you|what are you good at|are you reliable|which skills are you sure about)$/.test(t)) return { reply: (running ? '*A new self-test is still running; these are the last results.*\n\n' : '') + report(load()), via: 'self-test' };
  return null;
}
module.exports = { run, report, handle, load, history, worse, keepOrRestore, busy: () => !!running };
