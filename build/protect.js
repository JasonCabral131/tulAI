// electron-builder "afterPack" step: nobody who opens Tulai.app should find readable source. Every top-level .js file is compiled to V8 bytecode
// (.jsc, by the very Electron inside the app, so it matches) and replaced by a one-line loader. preload.js stays as text because Electron's sandbox
// only loads plain JavaScript there. The pages in public/ run in the window and are text by nature.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), asar = require('@electron/asar');
const KEEP = new Set(['preload.js']);
exports.default = async function protect(ctx) {
  const app = fs.readdirSync(ctx.appOutDir).find((f) => f.endsWith('.app')); if (!app) throw new Error('no .app found in ' + ctx.appOutDir);
  const res = path.join(ctx.appOutDir, app, 'Contents', 'Resources'), pack = path.join(res, 'app.asar'), tmp = path.join(ctx.appOutDir, '_src');
  const exe = path.join(ctx.appOutDir, app, 'Contents', 'MacOS', path.basename(app, '.app'));
  fs.rmSync(tmp, { recursive: true, force: true }); asar.extractAll(pack, tmp);
  const files = fs.readdirSync(tmp).filter((f) => f.endsWith('.js') && !KEEP.has(f)); let n = 0;
  const compile = path.join(__dirname, '_compile.js');
  fs.writeFileSync(compile, "require('v8').setFlagsFromString('--no-lazy');const b=require(process.argv[2]),fs=require('fs');for(const f of process.argv.slice(3)){b.compileFile({filename:f,output:f.replace(/\\.js$/,'.jsc')});}");
  try {
    const abs = files.map((f) => path.join(tmp, f)); execFileSync(exe, [compile, path.join(tmp, 'node_modules', 'bytenode'), ...abs], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' });
  } finally { fs.rmSync(compile, { force: true }); }
  for (const f of files) { const jsc = path.join(tmp, f.replace(/\.js$/, '.jsc')); if (!fs.existsSync(jsc)) throw new Error('not compiled: ' + f); fs.writeFileSync(path.join(tmp, f), `require('bytenode');module.exports=require('./${path.basename(jsc)}');\n`); n++; }
  const unpacked = fs.existsSync(pack + '.unpacked');
  fs.rmSync(pack); await asar.createPackageWithOptions(tmp, pack, unpacked ? { unpack: '{**/*.node,**/*.dylib}' } : {}); fs.rmSync(tmp, { recursive: true, force: true });
  if (process.env.TULAI_SLIM !== '0') { fs.rmSync(path.join(res, 'models'), { recursive: true, force: true }); console.log('  • slim installer: the AI models download on first launch'); }
  console.log(`  • source protected: ${n} files compiled to bytecode`);
};
