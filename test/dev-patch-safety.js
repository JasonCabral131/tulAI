// The developer deploy never restarts Tulai during meeting notes or a training quality check (it once cut a meeting's notes short).
const assert = require('assert'), fs = require('fs'), path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'dev-patch-app.sh'), 'utf8');
const guard = s.indexOf('NOT DEPLOYED: meeting notes are recording'), kill = s.indexOf('pkill');
assert(guard > 0 && kill > guard, 'the recording check comes before anything is stopped');
assert(/exit 2/.test(s) && /NOT DEPLOYED: a training round is converting or being checked/.test(s) && /\[n\]lu-gate/.test(s), 'and the quality-check guard');
console.log('PASS dev patch safety: no restart during meeting notes or a training check');
