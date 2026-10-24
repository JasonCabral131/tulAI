// Gateway diagnostics: probes the real gateway for the features the app relies on. Each probe is tiny (a few tokens) except the caching probe (~5k).
const zlib = require('zlib');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, label) => Promise.race([p, sleep(ms).then(() => { throw new Error(`${label} timed out after ${ms / 1000}s`); })]);
async function readAll(r) { let b = ''; for await (const c of r) b += c; return b; }
const errMsg = (b) => { try { const j = JSON.parse(b); return String(j.error?.message || j.message || b).slice(0, 240); } catch { return String(b).slice(0, 240); } };

// Solid-colour PNG built in memory (no files, no downloads).
function solidPng(w, h, [r, g, b]) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function chat(cfg, upstream, body) { // non-streaming
  const t0 = Date.now(); const r = await upstream(cfg, 'POST', '/v1/chat/completions', { ...body, stream: false });
  const b = await readAll(r); let j; try { j = JSON.parse(b); } catch {}
  return { status: r.statusCode, json: j, error: r.statusCode === 200 ? null : errMsg(b), ms: Date.now() - t0 };
}
async function stream(cfg, upstream, body) { // streaming; parses SSE like the agent does
  const t0 = Date.now(); const r = await upstream(cfg, 'POST', '/v1/chat/completions', { ...body, stream: true, stream_options: { include_usage: true } });
  if (r.statusCode !== 200) return { status: r.statusCode, error: errMsg(await readAll(r)), ms: Date.now() - t0 };
  let buf = '', content = '', usage = null, reasoning = '', chunks = 0, ttft = null, finish = null; const calls = [];
  for await (const c of r) {
    buf += c.toString('utf8'); const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      if (!l.startsWith('data:')) continue; const d = l.slice(5).trim(); if (!d || d === '[DONE]') continue;
      let j; try { j = JSON.parse(d); } catch { continue; }
      if (j.usage) usage = j.usage; const ch = j.choices?.[0]; if (!ch) continue; if (ch.finish_reason) finish = ch.finish_reason;
      const dl = ch.delta || {};
      if (dl.content) { content += dl.content; chunks++; if (ttft === null) ttft = Date.now() - t0; }
      if (dl.reasoning_content) reasoning += dl.reasoning_content;
      for (const tc of dl.tool_calls || []) { const i = tc.index ?? 0; const x = (calls[i] ||= { id: '', name: '', args: '' }); if (tc.id) x.id = tc.id; if (tc.function?.name) x.name += tc.function.name; if (tc.function?.arguments) x.args += tc.function.arguments; }
    }
  }
  return { status: 200, content, usage, reasoning, chunks, ttft, finish, calls: calls.filter(Boolean), ms: Date.now() - t0 };
}
const cachedOf = (u) => u?.prompt_tokens_details?.cached_tokens || u?.cache_read_input_tokens || 0;

async function run(cfg, upstream, emit) {
  const results = []; const features = {};
  const sonnet = cfg.models.sonnet, model = sonnet;
  const add = (id, name, status, detail, ms) => { const r = { id, name, status, detail, ms }; results.push(r); emit({ type: 'result', ...r }); return r; };
  const step = async (id, name, fn) => { emit({ type: 'start', id, name }); const t0 = Date.now(); try { const r = await withTimeout(fn(), 60000, name); add(id, name, r.status, r.detail, r.ms ?? Date.now() - t0); return r; } catch (e) { return add(id, name, 'fail', e.message, Date.now() - t0); } };

  // 1. reachability + auth + model list
  let listed = [];
  const reach = await step('reach', 'Connection and API key', async () => {
    const t0 = Date.now(); const r = await upstream(cfg, 'GET', '/v1/models'); const b = await readAll(r);
    if (r.statusCode === 401 || r.statusCode === 403) return { status: 'fail', detail: `The gateway rejected the API key (HTTP ${r.statusCode}). Check the key in Settings → Connection.` };
    if (r.statusCode !== 200) return { status: 'fail', detail: `HTTP ${r.statusCode}: ${errMsg(b)}` };
    listed = (JSON.parse(b).data || []).map((m) => m.id);
    const missing = Object.entries(cfg.models).filter(([, id]) => !listed.includes(id)).map(([k, id]) => `${k}: ${id}`);
    return { status: missing.length ? 'warn' : 'pass', detail: `${listed.length} models available${missing.length ? `. Not in the gateway's list: ${missing.join(', ')}` : ''}`, ms: Date.now() - t0 };
  });
  if (reach.status === 'fail') { for (const [id, n] of [['models', 'Configured models respond'], ['stream', 'Streaming'], ['usage', 'Token usage reporting'], ['tools', 'Tool calling'], ['toolloop', 'Tool results round trip'], ['vision', 'Image input'], ['thinking', 'Extended thinking'], ['cache', 'Prompt caching']]) add(id, n, 'skip', 'Skipped because the connection failed.', 0); return { results, features }; }

  // 2. each configured model answers
  await step('models', 'Configured models respond', async () => {
    const out = []; let bad = 0;
    for (const [tier, id] of Object.entries(cfg.models)) {
      const r = await chat(cfg, upstream, { model: id, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_tokens: 8 }).catch((e) => ({ status: 0, error: e.message, ms: 0 }));
      if (r.status === 200 && r.json?.choices?.[0]) out.push(`${tier} ✓ ${(r.ms / 1000).toFixed(1)}s`); else { bad++; out.push(`${tier} ✗ ${r.error || 'no reply'}`); }
    }
    return { status: bad === 0 ? 'pass' : bad === 3 ? 'fail' : 'warn', detail: out.join('   ·   ') };
  });

  // 3. streaming + 4. usage
  let s1 = null;
  await step('stream', 'Streaming', async () => {
    s1 = await stream(cfg, upstream, { model, messages: [{ role: 'user', content: 'Count from 1 to 8, separated by spaces.' }], max_tokens: 60 });
    if (s1.status !== 200) { features.streaming = false; return { status: 'fail', detail: s1.error }; }
    features.streaming = s1.chunks > 1;
    return s1.chunks > 1 ? { status: 'pass', detail: `${s1.chunks} chunks, first text after ${(s1.ttft / 1000).toFixed(1)}s` } : { status: 'warn', detail: 'The reply arrived in one piece, so long answers will look frozen until they finish.' };
  });
  await step('usage', 'Token usage reporting', async () => {
    const u = s1?.usage;
    if (u?.prompt_tokens > 0) { features.usage = true; return { status: 'pass', detail: `Reported ${u.prompt_tokens} in / ${u.completion_tokens} out. The usage meter and dashboard will be accurate.` }; }
    features.usage = false; return { status: 'warn', detail: 'The gateway does not report token usage, so the usage meter, run budgets and dashboard will show zeros.' };
  });

  // 5. tool calling, 6. tool-result round trip
  const tool = { type: 'function', function: { name: 'get_weather', description: 'Get the current weather for a city.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } };
  let call = null;
  const t5 = await step('tools', 'Tool calling', async () => {
    const r = await stream(cfg, upstream, { model, messages: [{ role: 'user', content: 'What is the weather in Paris? Use the get_weather tool.' }], tools: [tool], max_tokens: 200 });
    if (r.status !== 200) return { status: 'fail', detail: `${r.error}. Agent mode will not work.` };
    call = r.calls[0];
    if (!call) return { status: 'fail', detail: 'The model answered in text and never called the tool. The gateway may drop the "tools" setting, so Agent mode will not work.' };
    let args; try { args = JSON.parse(call.args || '{}'); } catch { return { status: 'fail', detail: `The tool call arrived with broken arguments: ${call.args.slice(0, 80)}` }; }
    return { status: 'pass', detail: `Called ${call.name}(${JSON.stringify(args)})` };
  });
  const t6 = await step('toolloop', 'Tool results round trip', async () => {
    if (t5.status !== 'pass') return { status: 'skip', detail: 'Skipped because tool calling failed.' };
    const r = await chat(cfg, upstream, { model, tools: [tool], max_tokens: 100, messages: [{ role: 'user', content: 'What is the weather in Paris? Use the get_weather tool.' }, { role: 'assistant', content: null, tool_calls: [{ id: call.id || 'call_1', type: 'function', function: { name: call.name, arguments: call.args || '{}' } }] }, { role: 'tool', tool_call_id: call.id || 'call_1', content: 'Sunny, 21°C' }] });
    if (r.status !== 200) return { status: 'fail', detail: `The gateway rejected a tool result message: ${r.error}. Agent mode will fail after its first tool use.` };
    const txt = r.json?.choices?.[0]?.message?.content || '';
    return /21|sunny/i.test(txt) ? { status: 'pass', detail: `The model used the result: "${txt.slice(0, 70)}"` } : { status: 'warn', detail: `Accepted, but the reply did not mention the result: "${txt.slice(0, 70)}"` };
  });
  features.tools = t5.status === 'pass' && t6.status !== 'fail';

  // 7. vision
  await step('vision', 'Image input', async () => {
    const png = solidPng(32, 32, [220, 30, 30]).toString('base64');
    const r = await chat(cfg, upstream, { model, max_tokens: 20, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/png;base64,${png}` } }, { type: 'text', text: 'What colour is this image? One word.' }] }] });
    if (r.status !== 200) { features.vision = false; return { status: 'fail', detail: `Images are not accepted: ${r.error}. Screenshots will not reach the model.` }; }
    features.vision = true; const t = r.json?.choices?.[0]?.message?.content || '';
    return { status: 'pass', detail: `The model saw the image and said "${t.trim().slice(0, 30)}"` };
  });

  // 8. extended thinking
  await step('thinking', 'Extended thinking', async () => {
    const r = await stream(cfg, upstream, { model, messages: [{ role: 'user', content: 'What is 17 times 23? Answer with just the number.' }], max_tokens: 1800, thinking: { type: 'enabled', budget_tokens: 1024 } });
    if (r.status !== 200) { features.thinking = false; return { status: 'fail', detail: `Not supported (${r.error}). The app will skip it, so High and Ultra effort rely on instructions only.` }; }
    features.thinking = true;
    return r.reasoning ? { status: 'pass', detail: `Accepted and reasoning was returned (${r.reasoning.length} chars).` } : { status: 'warn', detail: 'Accepted, but no reasoning text came back (the model may think without showing it).' };
  });

  // 9. prompt caching (two identical calls; ~5k tokens)
  await step('cache', 'Prompt caching', async () => {
    const filler = Array.from({ length: 220 }, (_, i) => `Line ${i}: the quick brown fox jumps over the lazy dog while the platform team reviews delivery metrics for sprint ${i % 9}.`).join('\n');
    const msgs = () => [{ role: 'system', content: filler, cache_control: { type: 'ephemeral' } }, { role: 'user', content: 'Reply with OK.', cache_control: { type: 'ephemeral' } }];
    const a = await chat(cfg, upstream, { model, messages: msgs(), max_tokens: 5 });
    if (a.status !== 200) { features.cache = false; return { status: 'fail', detail: `The gateway rejects caching markers (${a.error}). The app will not send them.` }; }
    await sleep(1500);
    const b = await chat(cfg, upstream, { model, messages: msgs(), max_tokens: 5 });
    const hit = cachedOf(b.json?.usage), wrote = cachedOf(a.json?.usage) + (a.json?.usage?.cache_creation_input_tokens || 0);
    if (hit > 0) { features.cache = true; return { status: 'pass', detail: `Cache hit: ${hit.toLocaleString()} of ${b.json.usage.prompt_tokens.toLocaleString()} input tokens were served from cache. Long agent runs will cost much less.` }; }
    return { status: 'warn', detail: wrote ? 'Caching is accepted but the second call did not hit the cache yet.' : 'Caching markers are accepted but ignored (no cache hits). Harmless, but there are no savings.' };
  });
  return { results, features };
}
module.exports = { run };
