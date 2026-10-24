// Settings → Connection: Tulai Desktop can be switched between our trained AI (default) and the company AI; Tulai Bot always uses our trained AI.
const assert = require('assert'), fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
const srv = fs.readFileSync(path.join(root, 'server.js'), 'utf8'), html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8'), conv = fs.readFileSync(path.join(root, 'converse.js'), 'utf8');
assert(/const usesLocal = \(cfg\) => ROLE === 'bot' \|\| \(cfg\.aiSource \|\| 'local'\) !== 'gateway';/.test(srv), 'the bot is always local; Desktop follows the setting');
assert(/<select id="s_source">/.test(html) && !/<select id="s_source" disabled>/.test(html), 'the choice can be changed');
assert(/aiSource: 'local'/.test(srv), 'our trained AI is the default');
assert(!/cfg\.aiSource === 'gateway'\) throw/.test(conv), 'the bot never needs the gateway key');
assert(/engine: tag,/.test(srv) && /E\.usageTag\(/.test(srv) && /b = \{ \.\.\.b, model: 'tulai-local'/.test(srv), 'every usage row records which engine really answered (ours, the company AI or the one you picked), and local runs never show a company model name');
assert(/deps\.usage\(\{ engine: require\('\.\/engines'\)\.usageTag\(require\('\.\/engines'\)\.chosen\(cfg, 'bot'\)\.id\)/.test(conv), 'bot runs are recorded as the engine that really answered (our trained AI by default)');
assert(/function engineOf\(r\)/.test(html) && /const kpis = ENGINES\.map/.test(html) && /b\[engineOf\(r\)\] \+=/.test(html) && /'engine', 'title'/.test(html), 'every number on the usage page (cards, daily chart, lists, CSV) is split: our trained AI vs company AI');
{ const src = html.slice(html.indexOf('const SWITCH'), html.indexOf('const ENGINES')); const f = new Function(src + '; return engineOf;')(); const t = (d) => Date.parse(d);
  assert.strictEqual(f({ engine: 'local', ts: t('2026-10-15') }), 'local'); assert.strictEqual(f({ engine: 'company', ts: t('2026-10-15') }), 'company');
  assert.strictEqual(f({ model: 'framework-claude-sonnet-4-6', ts: t('2026-10-08') }), 'company', 'before Oct 12 the company AI was on'); assert.strictEqual(f({ model: 'framework-claude-sonnet-4-6', ts: t('2026-10-12T12:00:00+08:00') }), 'unknown', 'the switch-over days are not guessed');
  assert.strictEqual(f({ chat: 'qa-coder', model: 'framework-claude-sonnet-4-6', ts: t('2026-10-13') }), 'local', 'bot test runs were ours'); }
console.log('PASS AI source: Desktop can switch, our trained AI by default, the bot always uses our trained AI');
