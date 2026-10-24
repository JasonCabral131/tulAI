// Heavy end-to-end check of the model switch (starts a real llama-server on a spare port, in a throw-away data folder; the live bot is untouched):
//   a passing candidate becomes the running model, a failing one never does, the previous model is kept, and rollback restores it.
// Run with:  node scripts/test-activation.js        (needs the base model from npm run setup)
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), assert = require('assert'), net = require('net');
const free = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
(async () => {
  const dataDir = path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat-activation-test-' + process.pid); fs.mkdirSync(dataDir, { recursive: true });
  process.env.GC_DATA_DIR = dataDir; process.env.TULAY_LLM_PORT = String(await free());
  const live = path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat', 'models'); const base = ['qwen2.5-3b-instruct-q4_k_m.gguf', 'qwen2.5-1.5b-instruct-q4_k_m.gguf'].map((n) => path.join(live, n)).find(fs.existsSync); if (!base) { console.log('SKIP: base model not found'); process.exit(0); }
  const nlu = require('../nlu'), am = require('../active-model'); nlu.configure({ modelDir: live });
  const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const mk = (name, passed) => { const root = path.join(dataDir, 'training', 'runs', name), dep = path.join(root, 'deployment'); fs.mkdirSync(dep, { recursive: true }); const gguf = path.join(dep, 'model-q4_k_m.gguf'); fs.symlinkSync(base, gguf);
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ status: 'evaluated-awaiting-review', counts: {} })); fs.writeFileSync(path.join(dep, 'gguf-gate.json'), JSON.stringify({ passed, score: passed ? 1 : 0, total: 1, cases: [{ name: 'x', passed }] }));
    const st = fs.statSync(gguf); fs.writeFileSync(path.join(root, 'activation-ready.json'), JSON.stringify({ run: name, path: gguf, sha256: sha(gguf), bytes: st.size, gatePassed: passed })); return gguf; };
  try {
    assert.strictEqual(am.selected(), null, 'starts on the base model'); assert(await nlu.ensureLocal(), 'base model starts');
    // 1. a candidate whose regression gate failed never activates
    mk('pilot-bad', false); await assert.rejects(am.activate('pilot-bad', nlu), /gate failed|integrity/i); assert.strictEqual(am.selected(), null, 'a failed candidate must not become active');
    // 2. a passing candidate becomes the running model, and answers
    const good = mk('pilot-good', true); await am.activate('pilot-good', nlu); assert.strictEqual(am.selected(), good); assert(am.state().current.run === 'pilot-good');
    const a = await nlu.answer('Reply with the single word: ready', { timeout: 60000 }); assert(a && a.length > 0, 'the new model answers'); console.log('active model answers:', JSON.stringify(a).slice(0, 60));
    // 3. a second candidate that cannot start is rolled back automatically, the first stays active
    const broken = mk('pilot-broken', true); fs.rmSync(broken); fs.writeFileSync(broken, 'GGUF-not-really'); const root = path.dirname(path.dirname(broken)); const st = fs.statSync(broken); fs.writeFileSync(path.join(root, 'activation-ready.json'), JSON.stringify({ run: 'pilot-broken', path: broken, sha256: sha(broken), bytes: st.size, gatePassed: true }));
    await assert.rejects(am.activate('pilot-broken', nlu)); assert.strictEqual(am.state().current.run, 'pilot-good', 'a model that fails to start is rolled back at once'); assert(await nlu.ensureLocal(), 'and the previous one is running again');
    // 4. rollback returns to the base model
    await am.rollback(nlu); assert.strictEqual(am.selected(), null, 'rollback restores the base model'); assert(await nlu.ensureLocal());
    console.log('PASS activation: failed gate blocked, passing model switched in, broken model rolled back, rollback restores the base model');
  } finally { nlu.shutdown && nlu.shutdown(); fs.rmSync(dataDir, { recursive: true, force: true }); }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
