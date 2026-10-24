// Tulai's self-tests are dry: inside sandbox.dry nothing is opened, recorded, saved or changed; outside it, requests run normally
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
process.env.GC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-dry-'));
const started = []; const real = cp.execFile; cp.execFile = (cmd, args, opts, cb) => { started.push([path.basename(cmd), ...(args || [])].join(' ')); const done = typeof opts === 'function' ? opts : cb; if (done) setImmediate(() => done(null, '', '')); return { on() {} }; };
const S = require('../sandbox'), L = require('../local'), M = require('../meeting'), Rm = require('../reminders');
(async () => {
  const opened = await S.dry(async () => { const r = await L.handleRules('open desktop', { sid: 'qa-dry' }); return { r, would: S.wouldList() }; });
  assert(!started.some((c) => /^open /.test(c)), 'nothing was opened in a self-test: ' + started.join(' | ')); assert(opened.would.some((w) => /open/.test(w)), 'the test still knows what it would have opened');
  const st = await S.dry(async () => M.start('x')); assert(/self-test/.test(st.reply) && !M.state().recording, 'a self-test never starts meeting notes');
  const r = await S.dry(async () => Rm.add({ at: Date.now() + 60000, text: 'test' })); assert.strictEqual(r.id, 'selftest'); assert(!Rm.list().some((x) => x.text === 'test'), 'a self-test never saves a reminder');
  assert.strictEqual(S.isDry(), false, 'outside the self-test nothing is dry');
  await L.handleRules('open desktop', { sid: 'qa-real' }); assert(started.some((c) => /^open /.test(c)), 'a real request still opens it');
  const sr = fs.readFileSync(path.join(__dirname, '..', 'scenario-runner.js'), 'utf8'); assert(/require\('\.\/sandbox'\)\.dry\(/.test(sr) && /self-test: nothing was recorded/.test(sr), 'the scheduled conversation tests run dry with a meeting stand-in');
  console.log('PASS self-tests are dry: nothing opened, no meeting notes started or stopped, no reminders saved; real requests unchanged');
  cp.execFile = real;
})().catch((e) => { console.error(e); process.exit(1); });
