// One command per update. Every update gets its own version (semantic: MAJOR.MINOR.PATCH), written into the app, the DMG name, the changelog and the notes for the team.
//   node scripts/publish-update.js --note "what changed" [--note "..."] [--bump patch|minor|major|none] [--no-build]
//  --bump   patch (default: fixes and small things), minor (a new feature), major (a big change). "none" re-publishes the current version (replaces its entry).
//  1. bumps the version in package.json (the app shows it in About and in the health panel)   2. builds the slim DMG (unless --no-build)
//  3. copies it to ~/Desktop/Tulai-release/ with its sha256   4. moves "Unreleased" in CHANGELOG.md under the new version and writes the team notes in the
//  map-governance-ui repo (tools/extra/TULAI.md = current version + install, tools/extra/TULAI-CHANGELOG.md = history, newest first)
//  5. reveals the DMG and opens the shared Drive folder (or copies it into TULAI_DRIVE_DIR if Google Drive for desktop syncs that folder).
// Nothing is committed or pushed: you review the .md changes and push them yourself. Versions only go up: it refuses to publish a version that is lower than the last one.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { execFileSync, spawnSync } = require('child_process');
const root = path.join(__dirname, '..'), pkgFile = path.join(root, 'package.json');
const REPO = process.env.TULAI_DOCS_REPO || path.join(os.homedir(), 'Desktop', 'map-governance-ui'), EXTRA = path.join(REPO, 'tools', 'extra');
const DRIVE = process.env.TULAI_DRIVE_URL || 'https://drive.google.com/drive/folders/1vZAWjQ_VOy4IfVsSkox8C2eSKRFvY5-R?usp=drive_link';
const args = process.argv.slice(2), notes = []; for (let i = 0; i < args.length; i++) if (args[i] === '--note' && args[i + 1]) notes.push(args[++i]);
const bump = (args.includes('--bump') ? args[args.indexOf('--bump') + 1] : 'patch') || 'patch';
if (!['patch', 'minor', 'major', 'none'].includes(bump)) { console.error('--bump must be patch, minor, major or none'); process.exit(1); }
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const pk = JSON.parse(fs.readFileSync(pkgFile, 'utf8')); if (!/^\d+\.\d+\.\d+$/.test(pk.version)) { console.error('package.json version must look like 1.2.3'); process.exit(1); }
// the last published version: the newest entry in the team changelog (or the current package version when nothing was published yet)
const changeFile = path.join(EXTRA, 'TULAI-CHANGELOG.md'); let oldLog = ''; try { oldLog = fs.readFileSync(changeFile, 'utf8'); } catch {}
const published = [...oldLog.matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map((m) => m[1]).sort(cmp), last = published.length ? published[published.length - 1] : null;
if (!notes.length && bump === 'none') { const e = new RegExp(`## ${pk.version.replace(/\./g, '\\.')} \\([^)]*\\)\\n\\n([\\s\\S]*?)\\n\\nFile:`).exec(oldLog); if (e) for (const l of e[1].split('\n')) if (l.startsWith('- ')) notes.push(l.slice(2)); }
if (!notes.length) { console.error('Say what changed: --note "..." (at least one). Every version needs notes.'); process.exit(1); }
let [M, m, p] = pk.version.split('.').map(Number); if (bump === 'patch') p++; else if (bump === 'minor') { m++; p = 0; } else if (bump === 'major') { M++; m = p = 0; }
let version = bump === 'none' ? pk.version : `${M}.${m}.${p}`;
if (last && cmp(version, last) < 0) { console.error(`Version ${version} is lower than the last published ${last}. Versions only go up.`); process.exit(1); }
if (last && bump !== 'none' && cmp(version, last) === 0) { version = (() => { const [a, b, c] = last.split('.').map(Number); return `${a}.${b}.${c + 1}`; })(); }
if (version !== pk.version) { pk.version = version; fs.writeFileSync(pkgFile, JSON.stringify(pk, null, 2) + '\n'); try { const lf = path.join(root, 'package-lock.json'), l = JSON.parse(fs.readFileSync(lf, 'utf8')); l.version = version; if (l.packages && l.packages['']) l.packages[''].version = version; fs.writeFileSync(lf, JSON.stringify(l, null, 2) + '\n'); } catch {} }
// every skill pack gets its version: it changes only for packs whose content changed in this release; those packs show "update available" in installed apps and are fine-tuned again (if the person allows it)
try { const out = execFileSync('node', [path.join(__dirname, 'pack-versions.js'), '--version', version], { encoding: 'utf8' }).trim(); console.log(out); const m = /updated in this release: (.+)$/.exec(out); if (m && !notes.some((n) => /skill pack/i.test(n))) notes.push('Skill packs updated (installed apps offer to fine-tune them again): ' + m[1] + '.'); } catch (e) { console.log('(skill pack versions not updated: ' + e.message.split('\n')[0] + ')'); }
console.log(`Version ${version}${last ? ` (last published: ${last})` : ' (first publication)'}`);
if (!args.includes('--no-build')) { const r = spawnSync('npm', ['run', 'dmg'], { cwd: root, stdio: 'inherit' }); if (r.status) { console.error('The build failed; nothing was published.'); process.exit(1); } }
const src = path.join(root, 'dist', `Tulai-${version}-arm64.dmg`); if (!fs.existsSync(src)) { console.error('No DMG found at ' + src + '. Run without --no-build.'); process.exit(1); }
const now = new Date(), date = now.toISOString().slice(0, 10), relDir = path.join(os.homedir(), 'Desktop', 'Tulai-release'), outDir = path.join(relDir, version), name = `Tulai-${version}-arm64.dmg`, dst = path.join(outDir, name);
fs.mkdirSync(outDir, { recursive: true }); for (const f of fs.readdirSync(outDir)) if (/^Tulai-.*\.dmg(\.sha256)?$/.test(f)) fs.rmSync(path.join(outDir, f)); fs.copyFileSync(src, dst); // one folder per version; older versions stay
const sha = crypto.createHash('sha256').update(fs.readFileSync(dst)).digest('hex'), mb = (fs.statSync(dst).size / 1048576).toFixed(0);
fs.writeFileSync(path.join(outDir, name + '.sha256'), `${sha}  ${name}\n`);
fs.writeFileSync(path.join(outDir, 'RELEASE-NOTES.md'), `# Tulai ${version} (${date})\n\n${notes.map((n) => '- ' + n).join('\n')}\n\nFile: \`${name}\` · ${mb} MB · sha256 \`${sha}\`\n\nUpload both the .dmg and the .sha256 to the shared Drive folder.\n`);
try { const ln = path.join(relDir, 'latest'); fs.rmSync(ln, { force: true }); fs.symlinkSync(version, ln); } catch {}
try { const vs = fs.readdirSync(relDir).filter((d) => /^\d+\.\d+\.\d+$/.test(d) && fs.existsSync(path.join(relDir, d, `Tulai-${d}-arm64.dmg`))).sort(cmp).reverse(); fs.writeFileSync(path.join(relDir, 'README.md'), `# Tulai releases\n\nOne folder per version (newest first). \`latest\` points at the newest.\n\n${vs.map((d) => `- ${d}${d === version ? '  <- latest' : ''}`).join('\n')}\n`); } catch {}
// project changelog: "Unreleased" becomes this version, with this update's notes on top
try {
  const cf = path.join(root, 'CHANGELOG.md'); let t = fs.readFileSync(cf, 'utf8'); const un = /## Unreleased\n([\s\S]*?)(?=\n## )/.exec(t); const carried = un ? un[1].trim().split('\n').filter(Boolean) : [];
  t = t.replace(/## Unreleased\n[\s\S]*?(?=\n## )/, '## Unreleased\n').replace(new RegExp(`## ${version.replace(/\./g, '\\.')} \\(.*?\\)\\n[\\s\\S]*?(?=\\n## )`), '');
  const body = [...notes.map((n) => '- ' + n), ...carried.filter((l) => !notes.some((n) => l.includes(n)))].join('\n');
  t = t.replace('## Unreleased\n', `## Unreleased\n\n## ${version} (${date})\n${body}\n`); fs.writeFileSync(cf, t.replace(/\n{3,}/g, '\n\n'));
} catch (e) { console.log('(CHANGELOG.md not updated: ' + e.message + ')'); }
if (!fs.existsSync(REPO)) { console.error('The docs repo was not found at ' + REPO); process.exit(1); } fs.mkdirSync(EXTRA, { recursive: true });
for (const f of fs.readdirSync(EXTRA)) if (/\.dmg$/.test(f)) fs.rmSync(path.join(EXTRA, f)); // installers live on Drive, not in git (GitLab limit is 70 MiB)
const entry = `## ${version} (${date})\n\n${notes.map((n) => '- ' + n).join('\n')}\n\nFile: \`${name}\` · ${mb} MB · sha256 \`${sha}\`\n\n`;
const rest = oldLog.replace(/^# Tulai changelog\n+/, '').replace(/^Newest first[^\n]*\n+/, '').replace(new RegExp(`## ${version.replace(/\./g, '\\.')} \\([\\s\\S]*?(?=\\n## |$)`), '').trim();
fs.writeFileSync(changeFile, '# Tulai changelog\n\nNewest first. Versions are MAJOR.MINOR.PATCH: patch = fixes, minor = a new feature, major = a big change. The installer of each version is in the shared Drive folder (never in git).\n\n' + entry + (rest ? rest + '\n' : ''));
fs.writeFileSync(path.join(EXTRA, 'TULAI.md'), `# Tulai (local AI assistant for Mac)

**Current version:** ${version} (${date})
**Download:** ${DRIVE}
**File:** \`${name}\` (${mb} MB, Apple Silicon Macs)
**Checksum (sha256):** \`${sha}\`

The version is also shown in Tulai Desktop, About Tulai Desktop, and in the bot's health panel. History: [TULAI-CHANGELOG.md](TULAI-CHANGELOG.md).

## Install
1. Download the \`.dmg\` from the Drive folder above and open it.
2. Drag **Tulai** onto **Applications** (replace the old one when updating; your data and models are kept).
3. First open: right-click Tulai, choose **Open** (the app is not signed with an Apple Developer ID yet, so macOS asks once).
4. A setup window downloads the local AI (about 2.7 GB, once) with a progress ring. Nothing leaves your Mac.
5. Allow Microphone and Accessibility when asked (Settings, Privacy and Security), so "Hey Tulai" and clicking/typing work.

Check the download: \`shasum -a 256 Tulai-*.dmg\` must print the checksum above.

## Use
- Click the Tulai icon: Tulai Desktop opens. The floating robot can be hidden (right-click it, or Settings, "Show the floating bot").
- Sign in once to your accounts in Settings, Accounts; Tulai then reads mail, Teams and pages in the background (read-only).
- Settings, Train your local bot AI: add your own examples and checks, or point it at a public GitHub training pack. Restore, switch and train ask first and show warnings.

## Releasing an update (for the maintainer)
\`node scripts/publish-update.js --note "what changed" [--bump patch|minor|major]\` in the Tulai project: it raises the version, builds the DMG, updates these .md files and the project CHANGELOG, and opens Drive. Drop the DMG (and its .sha256) in the Drive folder, then commit the .md files here.
`);
console.log(`\nDMG ready: ${dst}\nsha256 ${sha}\nNotes written to ${EXTRA}/TULAI.md and TULAI-CHANGELOG.md; project CHANGELOG.md updated.`);
if (process.env.TULAI_DRIVE_DIR && fs.existsSync(process.env.TULAI_DRIVE_DIR)) { for (const f of fs.readdirSync(process.env.TULAI_DRIVE_DIR)) if (/^Tulai-.*\.dmg(\.sha256)?$/.test(f)) fs.rmSync(path.join(process.env.TULAI_DRIVE_DIR, f)); fs.copyFileSync(dst, path.join(process.env.TULAI_DRIVE_DIR, name)); fs.copyFileSync(dst + '.sha256', path.join(process.env.TULAI_DRIVE_DIR, name + '.sha256')); console.log('Copied into the synced Drive folder: ' + process.env.TULAI_DRIVE_DIR); }
else { try { execFileSync('open', ['-R', dst]); /* the version folder */ execFileSync('open', [DRIVE]); console.log('Finder shows the file and the Drive folder is open: drag the .dmg and the .sha256 into it.'); } catch {} }
