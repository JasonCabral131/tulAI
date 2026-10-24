// Preferences shared by the two Tulai processes (Tulai Desktop and Tulai Bot). Both read and write the same prefs.json,
// each only changing the keys it owns, so neither can overwrite the other's settings by accident.
const fs = require('fs');
const path = require('path');
const defaults = { tray: true, shortcut: true, bounds: null, bot: true, botPos: null, voice: { aliases: [], wake: true, speak: true, locale: '', voice: '', rate: 190 } };
const file = () => path.join(process.env.GC_DATA_DIR, 'prefs.json');
function load() {
  try { const p = JSON.parse(fs.readFileSync(file(), 'utf8')); return { ...defaults, ...p, voice: { ...defaults.voice, ...(p.voice || {}) } }; } catch { return { ...defaults, voice: { ...defaults.voice } }; }
}
/** Merges a patch into whatever is on disk right now (not into a stale copy). */
function update(patch) {
  const cur = load(), next = { ...cur, ...patch, voice: { ...cur.voice, ...(patch.voice || {}) } };
  try { const tmp = file() + '.' + process.pid; fs.writeFileSync(tmp, JSON.stringify(next)); fs.renameSync(tmp, file()); } catch {}
  return next;
}
module.exports = { load, update, defaults, file };
