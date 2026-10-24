// Every file the training copies into its working folder, and every script the gate runs, is in the packaged app (a missing one breaks training only
// in the released DMG, never in development).
const assert = require('assert'), fs = require('fs'), path = require('path'), root = path.join(__dirname, '..'), pk = require('../package.json'), files = new Set(pk.build.files);
const has = (x) => files.has(x) || pk.build.files.some((g) => g.includes('*') && x.startsWith(g.split('*')[0]));
const stage = fs.readFileSync(path.join(root, 'bot-training.js'), 'utf8').match(/for\(const f of \[([^\]]+)\]/)[1].match(/'([^']+)'/g).map((x) => x.slice(1, -1));
const gate = [...fs.readFileSync(path.join(root, 'scripts', 'nlu-gate.js'), 'utf8').matchAll(/['"`]((?:scripts\/)?[\w-]+\.(?:js|py))['"`]/g)].map((m) => (m[1].startsWith('scripts/') ? m[1] : 'scripts/' + m[1])).filter((f) => fs.existsSync(path.join(root, f)));
const missing = [...stage, ...gate].filter((f) => !has(f)); assert.deepStrictEqual(missing, [], 'not in package.json build.files: ' + missing.join(', '));
console.log(`PASS packaged files: ${stage.length} training files and ${gate.length} gate scripts are in the app`);
