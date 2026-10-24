// The browser tools Tulai gives to Claude Code / Codex (MCP over stdio): list the tools, read a page, take a snapshot
const assert = require('assert'), http = require('http'), cp = require('child_process'), fs = require('fs'), path = require('path');
const srv = http.createServer((q, r) => { r.setHeader('Content-Type', 'text/html'); r.end('<title>Test Shop</title><h1>Cart total: 42</h1><a href="/pay">Pay now</a>'); });
srv.listen(0, '127.0.0.1', async () => {
  const url = `http://127.0.0.1:${srv.address().port}/`, env = { ...process.env, GC_DATA_DIR: fs.mkdtempSync('/tmp/tulai-mcp-') };
  const p = cp.spawn(process.execPath, [path.join(__dirname, '..', 'browser-mcp.js')], { env }); let buf = ''; const waiting = new Map();
  p.stdout.on('data', (c) => { buf += c; const ls = buf.split('\n'); buf = ls.pop(); for (const l of ls) { const m = JSON.parse(l); waiting.get(m.id)(m); } });
  let n = 0; const rpc = (method, params) => new Promise((res) => { const id = ++n; waiting.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
  try {
    const init = await rpc('initialize', { protocolVersion: '2024-11-05' }); assert.strictEqual(init.result.serverInfo.name, 'tulai-browser');
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = await rpc('tools/list', {}); assert.deepStrictEqual(tools.result.tools.map((t) => t.name), ['browser_read', 'browser_snapshot']);
    const read = await rpc('tools/call', { name: 'browser_read', arguments: { url } }); assert(/Test Shop/.test(read.result.content[0].text) && /Cart total: 42/.test(read.result.content[0].text) && /Pay now/.test(read.result.content[0].text), JSON.stringify(read));
    const shot = await rpc('tools/call', { name: 'browser_snapshot', arguments: { url } }); assert(shot.result.content[1].type === 'image' && shot.result.content[1].data.length > 500, 'a PNG snapshot');
    const bad = await rpc('tools/call', { name: 'browser_read', arguments: { url: 'file:///etc/passwd' } }); assert(bad.result.isError, 'only http(s) pages');
    console.log('PASS browser MCP: Claude Code / Codex can read pages and take snapshots in Tulai\'s own browser');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { p.kill(); srv.close(); }
});
