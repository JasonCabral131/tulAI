// The helper bot: pops up for agent work, shows what it is doing, the main bot checks the work with the project's own tests (or compiles what changed),
// a failed check makes it sad, then serious, and it tries again (up to 3 tries); a passing check makes it wave bye-bye.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
const H = require('../helper-bot'), seen = []; process.on('tulay:helper', (s) => seen.push(s.phase + ':' + s.move));
const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-')); execSync('git init -q', { cwd: ws });
fs.writeFileSync(path.join(ws, 'calc.py'), 'def add(a, b):\n    return a - b\n'); fs.writeFileSync(path.join(ws, 'test_calc.py'), "from calc import add\nassert add(2, 3) == 5\nprint('ok')\n");
let c = H.check(ws); assert(c && !c.ok && /AssertionError/.test(c.out), 'the failing test is caught: ' + JSON.stringify(c));
fs.writeFileSync(path.join(ws, 'calc.py'), 'def add(a, b):\n    return a + b\n'); c = H.check(ws); assert(c && c.ok, 'fixed: the check passes');
const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'helper-')); execSync('git init -q', { cwd: plain }); assert.strictEqual(H.check(plain), null, 'nothing changed, no tests: nothing to check');
fs.writeFileSync(path.join(plain, 'a.js'), 'const x = ;\n'); c = H.check(plain); assert(c && !c.ok && /node --check/.test(c.cmd), 'no tests: the changed files are compiled');
H.start('fix the bug in calc.py'); H.progress('read_file', { path: 'calc.py' }); assert.strictEqual(H.state().text, 'Reading calc.py…');
H.checking(); H.sad('AssertionError'); H.serious(2); H.done('python3 test_calc.py'); H.close();
assert.deepStrictEqual(seen.map((x) => x.split(':')[1]), ['excited', '', 'bow', 'cry', 'angry', 'wave', ''], 'excited, working, bows to be checked, cries, gets serious, waves bye-bye');
const conv = fs.readFileSync(path.join(__dirname, '..', 'converse.js'), 'utf8');
assert(/for \(let attempt = 1; ; attempt\+\+\)/.test(conv) && /attempt >= 3/.test(conv) && /H\.sad\(why\)/.test(conv) && /H\.serious\(attempt \+ 1\)/.test(conv) && /const c = \(edited \|\| failedOnce\) \? H\.check\(ws\) : null/.test(conv) && /failedOnce = true; H\.sad/.test(conv), 'the main bot checks and sends failures back, at most 3 tries, only when files changed');
assert(/function describe/.test(fs.readFileSync(path.join(__dirname, '..', 'helper-bot.js'), 'utf8')) && /setContentProtection\(true\)/.test(fs.readFileSync(path.join(__dirname, '..', 'helper-window.js'), 'utf8')), 'the helper window is hidden from screen sharing');
console.log('PASS helper bot: pops up, works, gets checked by the main bot, sad then serious on a failed check, waves bye-bye when it passes');
