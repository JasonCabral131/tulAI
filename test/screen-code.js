// "check my screen": one screenshot, read on this Mac, deleted right away; code gets explained and fixed by our AI; plain text gets a short summary.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), S = require('../screen-code');
(async () => {
  assert(S.RX.test('check my screen') && S.RX.test('explain the code on my screen') && S.RX.test('basahin mo screen ko') && !S.RX.test('take a screenshot'));
  const f = path.join(os.tmpdir(), 'sc-test.png'); fs.writeFileSync(f, 'x'); let seen = '';
  const r = await S.handle('check my screen', { snap: async () => f, ocr: async () => 'function total(items){ let t=0; for(let i=0;i<=items.length;i++){ t+=items[i].price } return t }', nlu: { chat: async ({ messages }) => { seen = messages[0].content; return { content: 'Sums prices. Bug: `<=` reads past the end. Fix: `i < items.length`.' }; } } });
  assert(/Code on your screen/.test(r.reply) && /i < items.length/.test(r.reply) && /deleted/.test(r.reply), r.reply); assert(/contains code/.test(seen)); assert(!fs.existsSync(f), 'the screenshot is deleted');
  const r2 = await S.handle('what is on my screen', { snap: async () => { fs.writeFileSync(f, 'x'); return f; }, ocr: async () => 'Quarterly review agenda: budget, hiring, roadmap', nlu: { chat: async () => ({ content: '- A quarterly review agenda' }) } });
  assert(/On your screen/.test(r2.reply));
  assert.strictEqual(await S.handle('what is a screen'), null);
  console.log('PASS screen code: read on this Mac, screenshot deleted, code explained and fixed');
})().catch((e) => { console.error(e); process.exit(1); });
