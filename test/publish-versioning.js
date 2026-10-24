// The release script refuses unsafe input before touching anything, and the version is one source of truth (package.json) shown by the app.
const assert = require('assert'), path = require('path'), { spawnSync } = require('child_process'), pk = require('../package.json');
const run = (...a) => spawnSync('node', [path.join(__dirname, '..', 'scripts', 'publish-update.js'), ...a], { encoding: 'utf8', env: { ...process.env, TULAI_DOCS_REPO: '/nonexistent-docs' } });
let r = run(); assert(r.status === 1 && /Say what changed/.test(r.stderr), 'no notes -> refused: ' + r.stderr);
r = run('--note', 'x', '--bump', 'huge'); assert(r.status === 1 && /--bump must be/.test(r.stderr), r.stderr);
assert(/^\d+\.\d+\.\d+$/.test(pk.version), 'the version is MAJOR.MINOR.PATCH');
const main = require('fs').readFileSync(path.join(__dirname, '..', 'main-desktop.js'), 'utf8'), bot = require('fs').readFileSync(path.join(__dirname, '..', 'main-bot.js'), 'utf8');
assert(/applicationVersion: require\('\.\/package\.json'\)\.version/.test(main) && /version: require\('\.\/package\.json'\)\.version/.test(bot), 'About and health show package.json version');
console.log('PASS release versioning: notes required, bump validated, one version source shown in About and health');
