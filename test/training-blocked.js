// Why a trained candidate is NOT the running model must be shown in words (training panel), never silently.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-')); process.env.GC_DATA_DIR = dir;
const bt = require('../bot-training');
const run = path.join(dir, 'training/runs/pilot-x1'); fs.mkdirSync(path.join(run, 'deployment'), { recursive: true });
const w = (f, o) => fs.writeFileSync(path.join(run, f), JSON.stringify(o));
(async () => {
  try {
    w('manifest.json', { status: 'evaluated-awaiting-review' });
    assert.strictEqual(bt.blocked(run, {}), null, 'nothing blocks a fresh candidate');
    w('deployment/gguf-gate.json', { passed: false, score: 4, total: 6, cases: [{ name: 'reminder', passed: false, expected: { frequency: 'weekdays' }, answer: '{"frequency":"Daily"}' }, { name: 'ok', passed: true }] });
    let b = bt.blocked(run, {}); assert(b.stage === 'gguf-gate' && /failed 2 of 6/.test(b.reason) && b.cases.length === 1 && /weekdays/.test(b.cases[0].expected) && /Daily/.test(b.cases[0].answer), JSON.stringify(b));
    await new Promise((r) => setTimeout(r, 30)); w('activation-error.json', { error: 'GGUF converter missing; rerun setup' });
    b = bt.blocked(run, {}); assert(b.stage === 'conversion' && /not installed/.test(b.reason), 'the newest failure is the one shown: ' + JSON.stringify(b));
    w('activation-error.json', { error: "Command '[convert_hf_to_gguf.py]' returned non-zero exit status 1." }); assert(/Converting the trained model/.test(bt.blocked(run, {}).reason));
    assert(/Rejected after review: too many mistakes/.test(bt.blocked(run, { review: { decision: 'reject', reason: 'too many mistakes' } }).reason));
    w('activation-ready.json', { gatePassed: true }); assert.strictEqual(bt.blocked(run, {}), null, 'a passing candidate is not blocked');
    const m = bt.metrics(); assert('blocked' in m, 'the training panel gets the reason');
    console.log('PASS training panel explains why a candidate is not active: failed regression cases, conversion problems, reviewer rejection');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });
