// Tulai Bot keeps testing itself on how people really talk to it (scenarios.js), through the REAL chat path, in its own test conversations
// (your chats are not touched). Runs on its own every 2 hours when you have been quiet for 10 minutes, no training is running and no call is on.
// Results: training/scenarios.json (latest) and training/scenario-history.jsonl (every run, so a slip is visible). Ask "conversation test results".
const fs = require('fs'), path = require('path');
const dir = () => path.join(process.env.GC_DATA_DIR || path.join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'training');
let running = null;
/** Runs the scenarios. talk(sid, text, history) -> reply text ('' = the real chat would have had no answer). */
const config = () => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(dir()), 'config.json'), 'utf8')); } catch { return {}; } };
/** You, for the {me} Teams scenarios: the full name of this Mac's user account (Teams search then finds that person in Teams itself).
 Teams and Jira are separate connections, so this never asks Jira. '' when the Mac has no full name. */
function macMe() { try { return require('child_process').execFileSync('id', ['-F'], { encoding: 'utf8', timeout: 3000 }).trim(); } catch { return ''; } }
async function run({ talk, live = false, only = '', onResult, me } = {}) {
  const { scenarios } = require('./scenarios'), rows = []; talk = talk || realTalk;
  const picked = scenarios.filter((x) => (live || !x.live) && (!only || x.id.includes(only)));
  if (me === undefined && picked.some((s) => s.turns.some((t) => t.includes('{me}')))) me = macMe();
  for (const s of picked) {
    const sid = 'qa-' + s.id.slice(0, 30), hist = [], answers = [], t0 = Date.now(); let error = '';
    const turns = s.turns.map((t) => t.split('{me}').join(me || ''));
    if (s.turns.some((t) => t.includes('{me}')) && !me) { const r = { id: s.id, area: s.area, pass: false, expect: s.expect, turns, answers: [], ms: 0, error: 'skipped: this Mac user account has no full name, so the Teams test does not know who you are' }; rows.push(r); if (onResult) onResult(r); continue; }
    for (const t of turns) { let a = ''; try { a = String((await talk(sid, t, hist.slice(-12))) || ''); } catch (e) { error = e.message; } answers.push(a); hist.push({ role: 'user', content: t }, { role: 'assistant', content: a || 'My configured bot model did not return an answer.' }); }
    let pass = false; try { pass = !error && !!s.check(answers, me); } catch {}
    const r = { id: s.id, area: s.area, ...(s.pack ? { pack: s.pack } : {}), pass, expect: s.expect, turns, answers: answers.map((a) => a.slice(0, 700)), ms: Date.now() - t0, ...(error ? { error } : {}) }; rows.push(r); if (onResult) onResult(r);
  }
  const out = { at: Date.now(), model: (() => { try { return require('./active-model').state().current?.run || 'base model'; } catch { return 'unknown'; } })(), pass: rows.filter((r) => r.pass).length, total: rows.length, rows };
  try { fs.mkdirSync(dir(), { recursive: true }); fs.writeFileSync(path.join(dir(), 'scenarios.json'), JSON.stringify(out, null, 2), { mode: 0o600 }); fs.appendFileSync(path.join(dir(), 'scenario-history.jsonl'), JSON.stringify({ at: out.at, model: out.model, pass: out.pass, total: out.total, fails: rows.filter((r) => !r.pass).map((r) => r.id), weakPacks: [...new Set(rows.filter((r) => !r.pass && r.pack).map((r) => r.pack))] }) + '\n', { mode: 0o600 }); } catch {}
  return out;
}
/** The same call the chat makes (converse.js): local rules first, then the bot's own brain. */
async function realTalk(sid, text, history) {
  const cfg = config();
  const meeting = { state: () => ({ recording: false }), isRecording: () => false, start: () => ({ ok: true, reply: 'Meeting notes started. (self-test: nothing was recorded)' }), stop: () => ({ ok: false, reply: 'No meeting is being recorded right now.' }), list: () => [], lastFull: () => null, recent: () => [], summarize: () => null };
  const r = await require('./sandbox').dry(async () => require('./local').handle(text, { sid, history, workConfig: cfg, meeting, nlu: require('./nlu'), lessons: await require('./bot-memory').retrieve(text).catch(() => []) })); // a self-test never opens, sends, saves or changes anything on your Mac, and never touches your meeting notes
  return (r && r.reply) || '';
}
const load = () => { try { return JSON.parse(fs.readFileSync(path.join(dir(), 'scenarios.json'), 'utf8')); } catch { return null; } };
function report(r) {
  if (!r) return 'I have not run my conversation tests yet. Say **test conversations** and I will (a few minutes, on this Mac).';
  const fails = r.rows.filter((x) => !x.pass), byArea = {}; for (const x of r.rows) { const a = (byArea[x.area] = byArea[x.area] || [0, 0]); a[1]++; if (x.pass) a[0]++; }
  return [`### My conversation tests (${new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})`, `${r.pass}/${r.total} real-life conversations went the way a person expects (brain: ${r.model}).`, '',
    Object.entries(byArea).map(([k, [p, t]]) => `${p === t ? '✅' : '⚠️'} ${k} ${p}/${t}`).join(' · '), '',
    ...(() => { const m = require('./missed').list(5); return m.length ? ['**From your real chats, where I got it wrong** (each one becomes a new test):', ...m.map((x) => `- ${x.kind}: you asked "${x.asked.replace(/\s+/g, ' ').slice(0, 70)}", I said "${x.got.replace(/\s+/g, ' ').slice(0, 70)}"${x.then ? `, then you said "${x.then.replace(/\s+/g, ' ').slice(0, 50)}"` : ''}`), ''] : []; })(),
    ...(fails.length ? ['**Not right yet:**', ...fails.map((x) => `- **${x.id}** (${x.area}): you said "${x.turns[x.turns.length - 1].slice(0, 80)}" and expected ${x.expect}; I said "${(x.answers[x.answers.length - 1] || '(nothing)').replace(/\s+/g, ' ').slice(0, 140)}"`)] : ['Every conversation went right.'])].join('\n');
}
/** Every 2 hours, only when it will not get in your way. */
/** How long nobody touched this Mac (mouse, keyboard, trackpad), in ms; 0 when unknown (then it counts as busy). */
function macIdleMs() { try { const m = /"HIDIdleTime" = (\d+)/.exec(require('child_process').execFileSync('/usr/sbin/ioreg', ['-c', 'IOHIDSystem', '-d', '4'], { encoding: 'utf8', timeout: 3000 })); return m ? Math.floor(+m[1] / 1e6) : 0; } catch { return 0; } }
/** Self-tests run only when you are away from the Mac (10 idle minutes system-wide, not only in Tulai): never while you work or sit in a meeting. */
function due({ now = Date.now(), lastRun = 0, lastUser = 0, training = false, inCall = false, recording = false, macIdle = 0 } = {}) {
  return !running && !training && !inCall && !recording && now - lastUser > 10 * 60000 && macIdle >= 10 * 60000 && now - lastRun > 2 * 3600000;
}
function tick() {
  try {
    const last = load(); const training = (() => { try { return !!require('./bot-training').metrics().running; } catch { return false; } })();
    if (!due({ macIdle: macIdleMs(), lastRun: last ? last.at : 0, lastUser: globalThis.__tulaiLastUserAt || 0, training, inCall: (() => { try { return require('./call-detect').inCall(); } catch { return false; } })(), recording: (() => { try { return require('./meeting').isRecording(); } catch { return false; } })() })) return false;
    running = run().catch(() => null).finally(() => { running = null; }); return true;
  } catch { return false; }
}
const START = /^(?:test (?:your )?conversations?|run (?:the |your )?(?:conversation|scenario) tests?|test how (?:you|people) talk)$/;
function handle(text) {
  const t = String(text || '').toLowerCase().replace(/[.!?]+$/, '').trim();
  if (START.test(t)) {
    if (running) return { reply: 'I am already running my conversation tests. Ask **conversation test results** in a few minutes.', via: 'conversation tests' };
    running = run().catch(() => null).finally(() => { running = null; }); return { reply: `Testing myself on ${require('./scenarios').scenarios.filter((s) => !s.live).length} real-life conversations now (greetings, typos, Taglish, follow-ups, corrections, vague requests, honesty and every feature). Ask **conversation test results** in a few minutes.`, via: 'conversation tests' };
  }
  if (/^(?:show )?(?:conversation|scenario) tests?(?: results?)?$|^(?:conversation|scenario) results?$/.test(t)) return { reply: (running ? '*A new run is still going; these are the last results.*\n\n' : '') + report(load()), via: 'conversation tests' };
  return null;
}
/** Skill packs whose real-life conversations failed in the last two runs of the brain in use: the bot practises them next (bot-training improveReason). */
function weakPacks(model) {
  let lines = []; try { lines = fs.readFileSync(path.join(dir(), 'scenario-history.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((x) => x.model === model); } catch { return []; }
  if (lines.length < 2) return []; const [a, b] = lines.slice(-2); return (a.weakPacks || []).filter((p) => (b.weakPacks || []).includes(p));
}
module.exports = { macIdleMs, weakPacks, run, report, handle, due, tick, load, START };
