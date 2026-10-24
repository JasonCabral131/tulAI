// Skill packs: one-click fine-tuning for a professional skill (Jira Mastery, Git, Reporting, Meetings). The packs ship inside the app
// (training-config/skill-packs.json + scripts/pack-skills.py), so a new release brings new and improved packs. Each pack has a version written at release time
// (scripts/pack-versions.js: it changes only when the pack's own content changed). The person's choice (selected packs) and what the current model was trained with
// are remembered here, so an app update can tell "Jira Mastery 1.3.0 is available, your model has 1.2.0" and offer, or (if switched on) do, the fine-tune again.
const fs = require('fs'), os = require('os'), path = require('path');
const dataDir = () => process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat');
const stateFile = () => path.join(dataDir(), 'training', 'packs-state.json');
const catalog = () => JSON.parse(fs.readFileSync(process.env.TULAI_PACKS_CATALOG || path.join(__dirname, 'training-config', 'skill-packs.json'), 'utf8')).packs;
const versions = () => { try { return JSON.parse(fs.readFileSync(process.env.TULAI_PACK_VERSIONS || path.join(__dirname, 'training-config', 'pack-versions.json'), 'utf8')).packs || {}; } catch { return {}; } };
const state = () => { try { const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); return { selected: Array.isArray(s.selected) ? s.selected : [], trained: s.trained || {}, auto: s.auto !== false, setupSeen: !!s.setupSeen }; } catch { return { selected: [], trained: {}, auto: true, setupSeen: false }; } };
const save = (s) => { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s), { mode: 0o600 }); };
const cmp = (a, b) => { const x = String(a || '0.0.0').split('.').map(Number), y = String(b || '0.0.0').split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
function list() {
  const s = state(), v = versions(), fd = (() => { try { return require('./free-data').list(); } catch { return []; } })();
  return catalog().map((p) => { const ver = (v[p.id] && v[p.id].version) || '1.0.0', tr = s.trained[p.id], sel = s.selected.includes(p.id);
    return { id: p.id, name: p.name, icon: p.icon, summary: p.summary, learns: p.learns, sources: p.sources, checks: (p.checks || []).length, rows: p.rows, version: ver, selected: sel, trainedVersion: tr ? tr.version : null, trainedAt: tr ? tr.at : null,
      state: !tr ? 'not trained' : cmp(ver, tr.version) > 0 ? 'update available' : 'up to date', data: (p.data || []).map((id) => { const d = fd.find((x) => x.id === id); return d ? { id, name: d.name, state: d.state, license: d.license } : { id, name: id, state: 'missing' }; }) }; });
}
const selectedIds = () => { const known = new Set(catalog().map((p) => p.id)); return state().selected.filter((id) => known.has(id)); };
function select(id, on) { if (!catalog().some((p) => p.id === id)) throw new Error('Unknown skill pack.'); const s = state(); s.selected = on ? [...new Set([...s.selected, id])] : s.selected.filter((x) => x !== id); save(s); return list(); }
function setAuto(on) { const s = state(); s.auto = !!on; save(s); return list(); }
/** Packs the person selected and trained before whose content is newer now (an app update brought a better pack). */
const pending = () => list().filter((p) => p.selected && p.state === 'update available');
function markTrained(ids, run) { const s = state(), v = versions(); for (const id of ids || []) if (catalog().some((p) => p.id === id)) s.trained[id] = { version: (v[id] && v[id].version) || '1.0.0', at: new Date().toISOString(), run: run || '' }; save(s); return list(); }
const warnings = () => { const w = []; for (const p of pending()) w.push(`${p.name} was improved (version ${p.version}); your model has ${p.trainedVersion}. ${state().auto ? 'Tulai will fine-tune it again by itself when the Mac is plugged in and idle.' : 'Press Fine-tune on the pack to update.'}`); return w; };
/** First-run step "fine-tune your skills or skip for now": shown once, and only on a Mac that has no trained skills model yet. */
function setupPending() { if (state().setupSeen) return false; try { if (require('./active-model').state().current) return false; } catch {} return true; }
function setupDone(selectedIds) { const s = state(); s.setupSeen = true; if (Array.isArray(selectedIds)) s.selected = [...new Set(selectedIds.filter((id) => catalog().some((p) => p.id === id)))]; save(s); return s; }
module.exports = { setupPending, setupDone, list, select, selectedIds, setAuto, pending, markTrained, warnings, state, catalog };
