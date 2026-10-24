// One-command setup for a fresh clone:   npm run setup
// Installs what Tulai needs that is not in git (the two programs that run the local AI, and the AI models themselves), then tells you what to do next.
//   npm run setup            check everything and install/download what is missing
//   npm run setup -- --build also build the app afterwards
const { spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..'), manifest = JSON.parse(fs.readFileSync(path.join(root, 'models.json'), 'utf8'));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts }).status === 0;
const has = (cmd) => spawnSync('/bin/sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
const step = (n, t) => console.log(`\n[${n}] ${t}`);
let bad = false;

console.log('Tulai setup');
if (!run(process.execPath, [path.join(__dirname, 'repo-check.js')])) { console.error('Setup stopped: remove generated files from the Git index before downloading or building. Your local files have not been deleted.'); process.exit(1); }
step(1, 'Your Mac');
if (process.platform !== 'darwin') { console.log('  ✗ Tulai needs macOS.'); process.exit(1); }
console.log(`  ${process.arch === 'arm64' ? '✓' : '!'} ${process.arch === 'arm64' ? 'Apple Silicon' : 'Intel Mac: the local AI will be slow; Apple Silicon is recommended'}`);
const nodeMajor = +process.versions.node.split('.')[0]; console.log(`  ${nodeMajor >= 22 ? '✓' : '✗'} Node ${process.versions.node}${nodeMajor >= 22 ? '' : ' (need 22 or newer)'}`); if (nodeMajor < 22) process.exit(1);

if (!run(process.execPath, [path.join(__dirname, 'check-setup.js'), '--preflight', ...(process.argv.includes('--skip-training') ? ['--skip-training'] : [])])) process.exit(1);

step(2, 'The programs that run the local AI (Homebrew: ' + manifest.brew.join(', ') + ')');
if (!has('brew')) { console.log('  ✗ Homebrew is not installed. Install it from https://brew.sh then run this again.'); process.exit(1); }
for (const f of manifest.brew) {
  const have = spawnSync('brew', ['list', '--versions', f], { stdio: 'ignore' }).status === 0;
  if (have) console.log(`  ✓ ${f} is installed`); else { console.log(`  ↓ installing ${f}…`); if (!run('brew', ['install', f])) { console.log(`  ✗ could not install ${f}`); bad = true; } }
}

step(3, 'The AI models (downloaded here, never stored in git)');
if (!run(process.execPath, [path.join(__dirname, 'fetch-models.js')])) bad = true;

step(4, 'The project');
if (!fs.existsSync(path.join(root, 'node_modules')) || !run('npm', ['ls', '--depth=0'], {stdio:'ignore'})) { console.log('  ↓ installing locked npm dependencies…'); if (!run('npm', ['ci'])) bad = true; } else console.log('  ✓ dependencies are installed');

step(5, 'Local vector memory');
if (!run(process.execPath, [path.join(__dirname, 'setup-memory.js')])) bad = true;

if (!process.argv.includes('--skip-training')) { step('training', 'Local Qwen fine-tuning runtime'); if (!run(process.execPath, [path.join(__dirname, 'setup-training.js')])) bad = true; }
// The Tulai skills model: the training examples and the recipe are in this repo, so every install trains the same model before the bot is used.
// It takes about 10 minutes on Apple Silicon. If it does not finish or does not pass the regression checks, setup still succeeds and the bot keeps
// the base model (and tries again by itself, in the background, when it runs). Skip it with:  npm run setup -- --skip-first-training
if (!bad && !process.argv.includes('--skip-training') && !process.argv.includes('--skip-first-training')) {
  step('skills', 'Training the Tulai skills model on this Mac (about 10 minutes; the examples ship with the app)');
  if (!run(process.execPath, [path.join(__dirname, 'training-run.js'), 'run', '--skills', '--evaluate'])) console.log('  ! The first training did not finish. Nothing is broken: the bot uses the base model and will try again by itself when it runs.');
  else console.log('  ✓ Trained. If it passed every check, the bot switches to it the first time it starts, before you use it.');
}

step('helpers', 'Native voice, OCR and PDF helpers');
if (!run(process.execPath, [path.join(root, 'build', 'compile-helpers.js')])) bad = true;

if (bad) { console.log('\nSetup did not finish. Fix the ✗ above and run  npm run setup  again; it continues where it stopped.'); process.exit(1); }
if (process.argv.includes('--build')) { step(6, 'Building the app'); if (!run('npm', ['run', 'build'])) process.exit(1); }
if (!run(process.execPath, [path.join(__dirname, 'check-setup.js'), ...(process.argv.includes('--skip-training') ? ['--skip-training'] : [])])) process.exit(1);
console.log(`\nAll set.${process.argv.includes('--build') ? '' : '\n  Build the app:   npm run build\n  Try it now:      npm start'}\n  Then copy dist/mac-arm64/Tulai.app to your Applications folder.`);
