// Packs the local engines (llama.cpp for understanding, whisper.cpp for listening) into build/bin so the installed app is self-contained:
// no Homebrew needed on the Mac that runs Tulai. Run automatically before `npm run build` (see "prebuild").
// Also clones the model files into build/models (APFS clones take no extra disk space) so they ship inside the app.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, 'bin'), LIB = path.join(ROOT, 'lib'), MODELS = path.join(__dirname, 'models');
const BREW = ['/opt/homebrew', '/usr/local'].find((p) => fs.existsSync(path.join(p, 'bin', 'llama-server')));
const BINS = ['llama-server', 'whisper-server', 'whisper-cli'];
const sh = (c, a) => execFileSync(c, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function main() {
  if (!BREW) { console.log('bundle-engines: llama.cpp not installed here (brew install llama.cpp whisper-cpp); skipping, the app will use Homebrew copies if present.'); return; }
  fs.mkdirSync(LIB, { recursive: true });
  const searchDirs = [];
  for (const f of ['llama.cpp', 'whisper.cpp', 'ggml', 'openssl@3']) { const d = path.join(BREW, 'opt', f, 'lib'); if (fs.existsSync(d)) searchDirs.push(d); }
  const copied = new Map(); // basename -> destination
  const deps = (file) => sh('/usr/bin/otool', ['-L', file]).split('\n').slice(1).map((l) => l.trim().split(' ')[0]).filter((d) => d && !d.startsWith('/usr/lib') && !d.startsWith('/System'));
  const find = (dep) => { const base = path.basename(dep); if (path.isAbsolute(dep) && fs.existsSync(dep)) return fs.realpathSync(dep); for (const d of searchDirs) { const p = path.join(d, base); if (fs.existsSync(p)) return fs.realpathSync(p); } throw new Error('cannot find ' + dep); };
  const bring = (dep) => { const base = path.basename(dep); if (copied.has(base)) return; const src = find(dep), dest = path.join(LIB, base); fs.copyFileSync(src, dest); fs.chmodSync(dest, 0o755); copied.set(base, dest); for (const d of deps(dest)) bring(d); };
  const retarget = (file, rpath) => {
    for (const d of deps(file)) { const base = path.basename(d); if (d.startsWith('@rpath/') || d.startsWith(BREW)) { if (base === path.basename(file) && file.includes(path.sep + 'lib' + path.sep)) continue; try { sh('/usr/bin/install_name_tool', ['-change', d, '@rpath/' + base, file]); } catch {} } }
    try { sh('/usr/bin/install_name_tool', ['-add_rpath', rpath, file]); } catch {}
  };
  // executables
  for (const b of BINS) { const dest = path.join(ROOT, b); fs.copyFileSync(fs.realpathSync(path.join(BREW, 'bin', b)), dest); fs.chmodSync(dest, 0o755); for (const d of deps(dest)) bring(d); }
  // ggml backend plugins (Metal GPU and CPU variants) must sit next to the executables
  const plug = path.join(BREW, 'opt', 'ggml', 'libexec'); let plugins = [];
  if (fs.existsSync(plug)) for (const f of fs.readdirSync(plug)) if (f.endsWith('.so')) { const dest = path.join(ROOT, f); fs.copyFileSync(fs.realpathSync(path.join(plug, f)), dest); fs.chmodSync(dest, 0o755); plugins.push(dest); for (const d of deps(dest)) bring(d); }
  // fix every reference so nothing points into Homebrew
  for (const b of BINS) retarget(path.join(ROOT, b), '@executable_path/lib');
  for (const p of plugins) retarget(p, '@loader_path/lib');
  for (const dest of copied.values()) { try { sh('/usr/bin/install_name_tool', ['-id', '@rpath/' + path.basename(dest), dest]); } catch {} retarget(dest, '@loader_path'); }
  // changing load paths invalidates signatures; arm64 needs at least an ad-hoc one
  for (const f of [...BINS.map((b) => path.join(ROOT, b)), ...plugins, ...copied.values()]) sh('/usr/bin/codesign', ['--force', '-s', '-', f]);
  const left = [...BINS.map((b) => path.join(ROOT, b)), ...plugins, ...copied.values()].filter((f) => deps(f).some((d) => d.startsWith(BREW)));
  console.log(`bundle-engines: ${BINS.length} programs, ${plugins.length} GPU/CPU backends, ${copied.size} libraries${left.length ? ' (STILL pointing to Homebrew: ' + left.map((x) => path.basename(x)).join(', ') + ')' : ' (self-contained)'}`);

  // models: whisper turbo + the understanding model, cloned (not copied) from the app's data folder
  const src = path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat', 'models'); fs.mkdirSync(MODELS, { recursive: true });
  for (const m of JSON.parse(fs.readFileSync(path.join(__dirname,'..','models.json'),'utf8')).models.map(m=>m.file)) {
    const from = path.join(src, m), to = path.join(MODELS, m);
    if (fs.existsSync(to) && fs.statSync(to).size === (fs.existsSync(from) ? fs.statSync(from).size : -1)) continue;
    if (!fs.existsSync(from)) { console.log('bundle-engines: model not found, skipping', m); continue; }
    try { fs.rmSync(to, { force: true }); sh('/bin/cp', ['-c', from, to]); } catch { fs.copyFileSync(from, to); }
  }
  fs.copyFileSync(path.join(__dirname,'..','licenses','NOMIC-EMBED-APACHE-2.0.txt'),path.join(MODELS,'NOMIC-EMBED-APACHE-2.0.txt'));
  console.log('bundle-engines: models ready in build/models:', fs.readdirSync(MODELS).join(', '));
}
main();
