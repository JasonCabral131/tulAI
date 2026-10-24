// First-launch setup: knows what is missing, counts what is already there, and never reports done while a model is absent.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-inst-')); process.env.GC_DATA_DIR = tmp;
const ins = require('../installer'), man = require('../models.json');
let s = ins.status(); assert(ins.needed() && s.needed && s.doneBytes === 0 && s.models.length === man.models.filter((m) => m.required).length, 'empty folder: everything is missing');
assert(s.models.every((m) => m.state === 'waiting'), JSON.stringify(s.models.map((m) => m.state)));
const m = man.models.find((x) => x.id === 'memory'); fs.mkdirSync(ins.modelDir(), { recursive: true }); fs.writeFileSync(path.join(ins.modelDir(), m.file), Buffer.alloc(10)); // wrong size: damaged or partial, not counted
assert(ins.status().models.find((x) => x.id === 'memory').state === 'waiting', 'a wrong-size file is not accepted');
const fd = fs.openSync(path.join(ins.modelDir(), m.file), 'w'); fs.ftruncateSync(fd, m.bytes); fs.closeSync(fd); // right size
s = ins.status(); assert(s.models.find((x) => x.id === 'memory').state === 'ready' && s.doneBytes === m.bytes && s.totalBytes > m.bytes && ins.needed(), 'one ready, others still needed');
assert(require('../package.json').build.files.includes('installer.js') && require('../package.json').build.files.includes('models.json'), 'installer and its model list are packaged');
fs.rmSync(tmp, { recursive: true, force: true }); console.log('PASS first-launch setup: lists what is missing, counts what is there, rejects damaged files');
