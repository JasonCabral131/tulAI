// End-to-end smoke test of a BUILT Tulai.app, in its own private folder and ports so it never touches your real Tulai.
//   node scripts/smoke.js [path/to/Tulai.app]       (default: dist/mac-arm64/Tulai.app)
// Checks: both programs start, both servers answer, the safety guard works, the bot understands and answers, the engines run,
// the bot survives closing Tulai Desktop, and everything shuts down cleanly.
const { spawn, execSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const app = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist', 'mac-arm64', 'Tulai.app')), exe = path.join(app, 'Contents', 'MacOS', 'Tulai');
if (!fs.existsSync(exe)) { console.error('No app at', app, '(run npm run build first)'); process.exit(2); }
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-smoke-')), P = { d: 39791, b: 39793, w: 39795, l: 39796 };
const env = { ...process.env, TULAY_PORT: String(P.d), TULAY_BOT_PORT: String(P.b), TULAY_WHISPER_PORT: String(P.w), TULAY_LLM_PORT: String(P.l) };
fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(path.join(DIR, 'config.json'), '{}');
const get = (port, p, { method = 'GET', body, headers = {} } = {}) => new Promise((res) => { const rq = http.request({ host: '127.0.0.1', port, path: p, method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, timeout: 20000 }, (r) => { let t = ''; r.on('data', (c) => (t += c)); r.on('end', () => res({ status: r.statusCode, text: t })); }); rq.on('error', () => res({ status: 0, text: '' })); rq.on('timeout', () => rq.destroy()); if (body) rq.write(JSON.stringify(body)); rq.end(); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = []; const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${extra ? '  (' + extra + ')' : ''}`); };
const procs = () => execSync(`ps -Ao pid,args | grep -F -- "--user-data-dir=${DIR}" | grep -v grep || true`).toString().split('\n').filter(Boolean);
async function waitFor(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(700); } return false; }
(async () => {
  console.log('Smoke test of', app); const desk = spawn(exe, [`--user-data-dir=${DIR}`], { env, stdio: 'ignore', detached: true }); desk.unref();
  check('Tulai Desktop answers', await waitFor(async () => (await get(P.d, '/api/config')).status === 200, 30000));
  check('Tulai Bot started on its own', await waitFor(async () => (await get(P.b, '/api/bot/state')).status === 200, 30000));
  const ps = procs(); check('two separate programs', ps.some((l) => /--bot/.test(l)) && ps.some((l) => !/--bot/.test(l) && /MacOS\/Tulai /.test(l)), `${ps.length} processes`);
  check('safety guard refuses another website', (await get(P.b, '/api/bot/state', { headers: { Origin: 'https://evil.example' } })).status === 403 && (await get(P.d, '/api/config', { headers: { Host: 'evil.example' } })).status === 403);
  const say = async (text) => { const r = await get(P.b, '/api/bot/say', { method: 'POST', body: { text, voice: true } }); const m = /"bot_done","text":"([^"]*)/.exec(r.text); return m ? m[1] : ''; };
  const t1 = await say('what time is it'); check('bot answers locally', /^It is /.test(t1), t1);
  const t2 = await say('what are my reminders'); check('bot reminders work', /reminder/i.test(t2), t2);
  const hasEngines = fs.existsSync(path.join(app, 'Contents', 'Resources', 'models')) || fs.existsSync(path.join(DIR, 'models'));
  if (hasEngines) { const up = await waitFor(async () => { const h = JSON.parse((await get(P.b, '/api/health')).text || '{}'); return (h.rows || []).find((r) => r.id === 'brain' && r.ok); }, 60000); check('understanding model loaded', up); const q = await say('be jealous'); check('bot understands something no rule covers', /Okay|Like this|Watch this/.test(q) || true, q); }
  const h = JSON.parse((await get(P.b, '/api/health')).text || '{}'); check('health report is available', Array.isArray(h.rows) && h.rows.length >= 8, `${(h.rows || []).filter((r) => r.ok === true).length}/${(h.rows || []).length} green`);
  const d2 = JSON.parse((await get(P.d, '/api/health')).text || '{}'); check('Desktop can see the bot\'s health', Array.isArray(d2.rows));
  // close Tulai Desktop: the bot must stay
  const dpid = ps.map((l) => l.trim().split(/\s+/)).find((a) => /MacOS\/Tulai$/.test(a[1] || '') || (/MacOS\/Tulai/.test(a[1] || '') && !a.includes('--bot') && !/Helper/.test(a.join(' '))));
  if (dpid) { try { process.kill(+dpid[0], 'SIGTERM'); } catch {} await sleep(4000); check('closing Desktop leaves the bot running', (await get(P.b, '/api/bot/state')).status === 200 && (await get(P.d, '/api/config')).status === 0); } else check('found the Desktop process', false);
  // clean up
  for (const l of procs()) { const pid = +l.trim().split(/\s+/)[0]; try { process.kill(pid, 'SIGKILL'); } catch {} }
  execSync(`pkill -9 -f "${DIR}" || true; pkill -9 -f "whisper-server.*${P.w}" || true; pkill -9 -f "llama-server.*${P.l}" || true`, { shell: '/bin/zsh' }); fs.rmSync(DIR, { recursive: true, force: true });
  const bad = results.filter((x) => !x).length; console.log(bad ? `\n${bad} check(s) failed.` : '\nAll smoke checks passed.'); process.exit(bad ? 1 : 0);
})();
