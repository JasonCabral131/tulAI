// First-run setup: after the models, the person is offered "Fine-tune now" or "Skip for now"; the choice is remembered, shown once, never on a Mac that already has a trained model.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-su-')); process.env.GC_DATA_DIR = tmp;
const sp = require('../skill-packs');
assert.strictEqual(sp.setupPending(), true, 'a fresh install is asked');
sp.setupDone(['jira-mastery', 'nope']); assert.strictEqual(sp.setupPending(), false, 'asked only once'); assert.deepStrictEqual(sp.selectedIds(), ['jira-mastery'], 'the chosen packs are kept, unknown ones dropped');
fs.rmSync(path.join(tmp, 'training'), { recursive: true, force: true }); assert.strictEqual(sp.setupPending(), true);
fs.mkdirSync(path.join(tmp, 'training'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'training', 'active-model.json'), JSON.stringify({ current: { run: 'x' }, previous: null })); assert.strictEqual(sp.setupPending(), false, 'a Mac that already runs a trained model is not asked again');
sp.setupDone(); fs.rmSync(path.join(tmp, 'training'), { recursive: true, force: true });
// the page: step 2 exists with both buttons and the "later in Settings" promise, and its script behaves
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'setup.html'), 'utf8');
for (const k of ['id="ftNow">Fine-tune now', 'id="ftLater">Skip for now', 'Settings, Train your local bot AI, Skill packs', 'id="skillsStep"']) assert(html.includes(k), k);
const script = /<script>(?!src)([\s\S]*?)<\/script>/.exec(html.split('</style>')[1])[1]; const els = {}; const el = (id) => els[id] || (els[id] = { style: {}, innerHTML: '', textContent: '', hidden: false, className: '', dataset: {}, classList: { add() {} } });
let posted = null, closedAt = 0; const timers = [];
const sandbox = { document: { getElementById: el, querySelectorAll: (q) => (q === '[data-pack]' ? [{ checked: true, dataset: { pack: 'jira-mastery' } }, { checked: false, dataset: { pack: 'git-mastery' } }] : []) }, window: { close() { closedAt = 1; } }, setTimeout: (f) => { timers.push(f); return 0; }, setInterval: () => 0,
  fetch: async (u, o) => { if (o && o.method === 'POST') { posted = { u, body: JSON.parse(o.body) }; return { ok: true, json: async () => ({ ok: true }) }; } return { json: async () => status }; } };
let status = { phase: 'done', needed: false, totalBytes: 100, doneBytes: 100, error: '', models: [], skills: { pending: true, packs: [{ id: 'jira-mastery', name: 'Jira Mastery', icon: 'J', summary: 's', checks: 10 }, { id: 'git-mastery', name: 'Git', icon: 'G', summary: 's', checks: 8 }] } };
vm.runInNewContext(script, sandbox);
(async () => {
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.strictEqual(els.skillsStep.hidden, false, 'step 2 shows when the AI is installed and skills are pending'); assert(/Teach Tulai more skills/.test(els.h.textContent) && /data-pack="jira-mastery"/.test(els.packs.innerHTML) && els.go.hidden === true, 'the Start button waits for the choice');
  els.ftNow.onclick(); await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r)); assert.deepStrictEqual(posted.body, { action: 'finetune', packs: ['jira-mastery'] }, 'only the ticked packs are sent'); assert(/Fine-tuning started/.test(els.h.textContent));
  posted = null; status = { ...status, skills: { ...status.skills, pending: true } }; els.ftLater.onclick(); await new Promise((r) => setImmediate(r)); assert.deepStrictEqual(posted.body, { action: 'later' });
  console.log('PASS setup skills step: fine-tune now or skip for now, ticked packs sent, choice remembered, later-in-Settings promise, never repeated');
})().catch((e) => { console.error(e); process.exit(1); });
