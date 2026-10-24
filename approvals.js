// Actions that need the owner's permission: something (the bot, or a developer tool working on this Mac) asks, the Desktop app shows a card with an Allow button, and only a click runs it.
// Only the actions listed in ACTIONS can ever run, so a request can never carry its own command.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const file = () => path.join(process.env.GC_DATA_DIR || __dirname, 'approvals.json');
const load = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return { items: [] }; } };
const save = (db) => { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file() + '.tmp', JSON.stringify(db, null, 2), { mode: 0o600 }); fs.renameSync(file() + '.tmp', file()); };
const ACTIONS = {
  'restart-local-brain': { label: 'Restart the local brain', run: async () => { const ok = await require('./nlu').reloadLocal(); if (!ok) throw Error('The local brain did not restart.'); return 'The local brain restarted.'; }, busy: 'training' },
  'restore-previous-model': { label: 'Restore the previous model', run: async () => { await require('./active-model').rollback(); return 'Restored the previous model.'; }, busy: 'training' },
  'switch-to-new-model': { label: 'Switch to the new trained model', run: async () => { const m = require('./bot-training').metrics(); if (!m.run) throw Error('There is no trained candidate.'); await require('./active-model').activate(m.run); require('./bot-training').afterActivate(m.run); return 'The new model is now running.'; }, busy: 'training' },
  'start-skills-training': { label: 'Start the skills training', run: async () => (await require('./bot-training').handle('train your skills', { packs: require('./skill-packs').selectedIds() })).reply },
  'git-commit': { label: 'Commit changes (never pushes)', validate: (p) => { const repo = require('./git-commit').checkRepo(p && p.repo); return { repo, message: String((p && p.message) || '').slice(0, 200) }; }, run: async (p) => require('./git-commit').commit(p.repo, p.message) },
  'stop-training': { label: 'Stop the training', run: async () => (await require('./bot-training').handle('stop training')).reply },
};
const busy = () => { try { return !!require('./bot-training').metrics().running; } catch { return false; } };
function request({ action, title, why, requestedBy, params }) {
  if (!ACTIONS[action]) throw Error('Unknown action.'); const db = load(), now = Date.now(); const clean = ACTIONS[action].validate ? ACTIONS[action].validate(params) : undefined;
  db.items = db.items.filter((i) => now - i.at < 7 * 864e5);
  const dup = db.items.find((i) => i.status === 'pending' && i.action === action && JSON.stringify(i.params) === JSON.stringify(clean)); if (dup) return dup;
  const it = { id: crypto.randomBytes(6).toString('hex'), action, label: ACTIONS[action].label, title: String(title || ACTIONS[action].label).slice(0, 120), why: String(why || '').slice(0, 600), requestedBy: String(requestedBy || 'Tulai').slice(0, 40), ...(clean ? { params: clean } : {}), status: 'pending', at: now };
  db.items.push(it); save(db); return it;
}
const list = () => load().items.slice(-30).reverse();
async function decide(id, allow) {
  const db = load(), it = db.items.find((i) => i.id === id); if (!it) throw Error('That request is gone.'); if (it.status !== 'pending') return it;
  if (!allow) { it.status = 'denied'; it.decidedAt = Date.now(); save(db); return it; }
  if (ACTIONS[it.action].busy === 'training' && busy()) { it.note = 'A training is running. Wait for it to finish, then press Allow again.'; save(db); return { ...it, blocked: true }; }
  it.status = 'running'; save(db);
  try { it.result = String(await ACTIONS[it.action].run(it.params)).slice(0, 600); it.status = 'done'; } catch (e) { it.result = e.message; it.status = 'failed'; }
  it.decidedAt = Date.now(); delete it.note; const db2 = load(); db2.items = db2.items.map((i) => (i.id === it.id ? it : i)); save(db2); return it;
}
module.exports = { request, list, decide, ACTIONS };
