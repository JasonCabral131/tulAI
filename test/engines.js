// AI engines: our trained AI by default; switching per window by chat ("use ...", "back to default"); command-line AIs answer through
// the same streaming format the agent reads; Claude/Codex output is parsed; keys never leak into the command; the terminal really runs a shell.
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tulai-engines-')); process.env.GC_DATA_DIR = dir;
const E = require('../engines'), R = require('../engine-rules'), T = require('../term');
(async () => {
  // defaults and choices
  assert.deepStrictEqual(E.chosen({}, 'bot'), { id: 'tulai', model: '' }, 'our trained AI is the default');
  assert.strictEqual(E.chosen({ aiSource: 'gateway' }, 'desktop').id, 'gateway', 'the old Desktop "company AI" switch still counts');
  assert.strictEqual(E.list({}, 'bot').some((e) => e.kind === 'gateway'), false, 'Tulai Bot is never offered the company AI');
  assert.strictEqual(E.usageTag('tulai'), 'local'); assert.strictEqual(E.usageTag('cli:claude'), 'claude'); assert.strictEqual(E.usageTag('api:gemini'), 'gemini_api'); assert.strictEqual(E.usageTag('gateway'), 'company');
  // chat commands (a fake CLI stands in for a real AI tool)
  const fake = path.join(dir, 'fake-ai'); fs.writeFileSync(fake, '#!/bin/sh\necho "FAKE ANSWER: $@ KEY=[$OPENAI_API_KEY]"\n'); fs.chmodSync(fake, 0o755);
  let cfg = { engineCLIs: [{ id: 'fakeai', name: 'Fake AI', command: fake, args: ['{prompt}'] }], engineKeys: { groq: 'gsk_secret_value_123' } }; const save = (c) => { cfg = c; };
  let r = await R.handle('use fakeai', { role: 'bot', cfg, save }); assert(/now uses \*\*Fake AI\*\*/.test(r.reply), r.reply); assert.strictEqual(E.chosen(cfg, 'bot').id, 'cli:fakeai');
  r = await R.handle('use groq llama-3.3-70b-versatile', { role: 'desktop', cfg, save }); assert.deepStrictEqual(E.chosen(cfg, 'desktop'), { id: 'api:groq', model: 'llama-3.3-70b-versatile' }); assert.strictEqual(E.chosen(cfg, 'bot').id, 'cli:fakeai', 'each window keeps its own choice');
  r = await R.handle('which model are you using', { role: 'desktop', cfg, save }); assert(/Groq · llama-3\.3-70b-versatile/.test(r.reply), r.reply);
  r = await R.handle('use company ai', { role: 'bot', cfg, save }); assert(/never uses the company AI/.test(r.reply)); assert.strictEqual(E.chosen(cfg, 'bot').id, 'cli:fakeai');
  r = await R.handle('back to default', { role: 'bot', cfg, save }); assert.strictEqual(E.chosen(cfg, 'bot').id, 'tulai');
  r = await R.handle('what models can I use', { role: 'bot', cfg, save }); assert(/Our trained AI/.test(r.reply) && /Fake AI/.test(r.reply) && /Groq/.test(r.reply), r.reply);
  for (const t of ['use Tulai Desktop to review this PR', 'use chrome', 'open terminal']) assert.strictEqual(await R.handle(t, { role: 'bot', cfg, save }), null, t + ' is another command');
  // a command-line AI answers in the agent's streaming format, with Tulai's API keys never passed to it
  process.env.OPENAI_API_KEY = 'sk-should-not-leak';
  const up = E.cliUpstream(cfg, { id: 'cli:fakeai', model: '' }, { messages: [{ role: 'system', content: 'Be brief.' }, { role: 'user', content: 'hello there' }] }, null, { cwd: dir });
  let s = ''; for await (const c of up) s += c; const text = s.split('\n').filter((l) => l.startsWith('data:') && !/\[DONE\]/.test(l)).map((l) => JSON.parse(l.slice(5)).choices[0].delta.content || '').join('');
  assert(/FAKE ANSWER: Be brief\.\s+hello there/.test(text) && /data: \[DONE\]/.test(s), text); assert(/KEY=\[\]/.test(text) && !/sk-should-not-leak/.test(text), 'API keys from the environment never reach the command-line AI');
  // Claude Code stream-json and Codex --json are read as text + progress notes
  const out = [], notes = []; const pc = E.parser('claude', (t) => out.push(t), (n) => notes.push(n));
  pc.push(Buffer.from(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__tulai-browser__browser_snapshot', input: { url: 'https://x' } }] } }) + '\n' + JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } }) + '\n')); pc.end();
  assert.deepStrictEqual(out, ['Done.']); assert(/browser: browser_snapshot/.test(notes[0]), notes[0]);
  const o2 = []; const px = E.parser('codex', (t) => o2.push(t), () => {}); px.push(Buffer.from(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Fixed it.' } }) + '\n')); px.end(); assert.deepStrictEqual(o2, ['Fixed it.']);
  const a = E.argsFor('claude', { system: 's', prompt: 'p', model: 'opus', mode: 'ask', mcp: '/tmp/m.json', cwd: dir }, {});
  assert(a.includes('--disallowedTools') && a[a.indexOf('--disallowedTools') + 1].includes('git push') && !a.join(' ').includes('Edit,'), 'ask mode: read-only tools, never git push');
  assert(E.argsFor('claude', { prompt: 'p', mode: 'auto' }, {}).join(' ').includes('Edit'), 'auto mode may edit');
  // "Log in" is one step: a missing tool is set up inside Tulai's data folder (never a global install), then its login starts
  const lc = E.loginCmd('gemini'); if (!E.which('gemini')) assert(/npm install --prefix '.*ai-tools' @google\/gemini-cli/.test(lc) && !/-g\b/.test(lc) && /ai-tools\/node_modules\/\.bin\/gemini'/.test(lc), lc);
  const lr = await R.handle('log in to gemini', { role: 'bot', cfg, save }); assert(lr.terminal && lr.terminal.tool === 'gemini' && !/install it|not installed/i.test(lr.reply), 'logging in never asks you to install first: ' + lr.reply);
  // the in-chat terminal runs a real shell
  const { id } = T.start({ cols: 80, rows: 20 }); let tout = ''; T.watch(id, (e) => { if (e.data) tout += Buffer.from(e.data, 'base64').toString(); });
  await new Promise((res) => setTimeout(res, 1200)); T.input(id, 'echo TERM_$((6*7))\r'); await new Promise((res) => setTimeout(res, 1200)); T.stop(id);
  assert(/TERM_42/.test(tout), 'the terminal ran the command');
  console.log('PASS engines: our AI by default, per-window choice by chat, command-line AIs stream like a model, no keys leak, real terminal');
  setTimeout(() => process.exit(0), 200);
})().catch((e) => { console.error(e); process.exit(1); });
