// Before you push: shows what git WOULD commit and warns about anything big, a model, a build, or a secret.   npm run repo:check
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.resolve(process.env.TULAI_REPO_CHECK_ROOT || path.join(__dirname, '..')), isRepo = fs.existsSync(path.join(root, '.git'));
const tmp = isRepo ? null : fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-gitcheck-'));
const git = (...a) => execFileSync('git', isRepo ? a : ['--git-dir', path.join(tmp, 'g.git'), '--work-tree', root, ...a], { cwd: root, encoding: 'utf8', maxBuffer: 64e6 });
if (!isRepo) git('init', '-q');
const stagedSizes = new Map();
if(isRepo){for(const item of git('ls-files','--stage','-z').split('\0').filter(Boolean)){const match=/^\d+ ([a-f0-9]+) \d\t([\s\S]+)$/.exec(item);if(match)stagedSizes.set(match[2],Number(git('cat-file','-s',match[1]).trim()));}}
const files = git('ls-files', '-coz', '--exclude-standard').split('\0').filter(Boolean);
let total = 0; const rows = files.map((f) => { let s = 0; try { s = fs.statSync(path.join(root, f)).size; } catch {} s=Math.max(s,stagedSizes.get(f)||0); total += s; return [f, s]; }).sort((a, b) => b[1] - a[1]);
const kb = (n) => (n / 1024).toFixed(0) + ' KB', warn = [];
for (const [f, s] of rows) { if (s > 5 * 1048576) warn.push(`${f} is ${(s / 1048576).toFixed(0)} MB`); if (/\.(gguf|ggml|bin|safetensors|onnx|pt|pth|ckpt|h5|hdf5|tflite|part|partial|download|dmg)$|(^|\/)(dist|node_modules|models|checkpoints|build\/(bin|models))\//.test(f)) warn.push(`${f} should not be committed`); if (/(^|\/)(config|prefs|profile|reminders|bot-learning|bot-failures|bot-recovery[^/]*)\.json$|\.(sqlite|db)(-|$)|(^|\/)(browser-accounts|browser-evidence|bot-discussions|artifacts)\/|\.env|\.log$|calendar-cache/.test(f)) warn.push(`${f} may hold private data`); }
console.log(`${files.length} files, ${(total / 1048576).toFixed(1)} MB would be committed.`);
console.log('Largest:'); for (const [f, s] of rows.slice(0, 5)) console.log('  ' + kb(s).padStart(8), f);
if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
if (warn.length) { console.log('\nProblems:'); for (const w of warn) console.log('  ✗', w); process.exit(1); }
console.log('\nLooks good: no models, builds, or private files.');
