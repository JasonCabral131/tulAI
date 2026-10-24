// Dropping a folder into the chat: readable files kept, secrets/binaries/dependencies skipped, no path escape, and "explain this folder" answers from the real files.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.GC_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'folder-drop-'));
const F = require('../folder-drop'), b64 = (s) => Buffer.from(s).toString('base64');
(async () => {
  const r = F.save('My App', [
    { path: 'My App/README.md', data: b64('# My App\nA tiny ticket tool.') }, { path: 'My App/src/index.js', data: b64('console.log("hi")') },
    { path: 'My App/.env', data: b64('KEY=secret') }, { path: 'My App/node_modules/x/index.js', data: b64('x') }, { path: 'My App/logo.png', data: b64('png') },
    { path: '../../escape.js', data: b64('bad') }, { path: 'My App/id_rsa', data: b64('private') }]);
  assert.strictEqual(r.kept, 3, 'readme, index and the sanitized escape file only: ' + JSON.stringify(r));
  assert(r.skipped.secrets >= 2 && r.skipped.binary >= 2, 'secrets, dependencies and pictures are skipped: ' + JSON.stringify(r.skipped));
  assert(!fs.existsSync(path.join(os.tmpdir(), 'escape.js')), 'a path with .. cannot leave the folder');
  assert(!F.last().files.some((f) => /\.env|id_rsa|node_modules/.test(f.path)), 'no secret is kept');
  let seen = ''; const nlu = { chat: async ({ messages }) => { seen = messages[1].content; return { content: '**A ticket tool.**' }; } };
  const a = await F.handle('explain this folder', { nlu });
  assert(/A ticket tool/.test(a.reply) && /README\.md/.test(seen) && /A tiny ticket tool/.test(seen) && !/KEY=secret/.test(seen), 'the answer is built from the real files, never from a secret');
  assert.strictEqual(await F.handle('what is the weather', { nlu }), null, 'other questions are not taken');
  // however it is said, and after a restart (the drop is read back from disk)
  for (const q of ['ingest and explain to this folder', 'can you read this folder and explain it', 'ipaliwanag mo itong folder', 'ingest this codebase', 'explain it']) { seen = ''; const x = await F.handle(q, { nlu }); assert(x && /A ticket tool/.test(x.reply), q); }
  F._forget(); seen = ''; const y = await F.handle('ingest and explain to this folder', { nlu }); assert(y && /A ticket tool/.test(y.reply) && /README\.md/.test(seen), 'restored from disk after a restart');
  // a follow-up question is answered from the files that match it
  let asked = ''; const nlu2 = { chat: async ({ messages }) => { asked = messages[1].content; return { content: 'It is in src/index.js.' }; } };
  const z = await F.handle('where does this project call console.log?', { nlu: nlu2 }); assert(z && /src\/index\.js/.test(z.reply) && /console\.log\("hi"\)/.test(asked), 'answered from the matching file');
  assert.strictEqual(await F.handle('open my downloads folder', { nlu }), null, 'opening a folder is not explaining it');
  assert.strictEqual(await F.handle('Review this code and name the bug: function total(items){ let t=0; return t }', { nlu }), null, 'code pasted in the message is not the dropped folder');
  console.log('ok');
})().catch((e) => { console.error(e); process.exit(1); });
