// Tulai's browser as MCP tools for the command-line AIs you pick (Claude Code, Codex): open a page, read its text and links, and take a snapshot,
// in Tulai's own Chrome profile (never your everyday Chrome). Runs over stdio: started by the AI tool, one JSON-RPC message per line.
const fs = require('fs'), readline = require('readline');
const browser = () => require('./bot-browser');
const TOOLS = [
  { name: 'browser_read', description: 'Open a web page (http or https) in Tulai\'s browser and return its title, text and links.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'browser_snapshot', description: 'Open a web page in Tulai\'s browser and return a screenshot (PNG) plus its title, to check how it looks.', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
];
async function call(name, args) {
  const r = await browser().agentRead(String(args.url || ''));
  const head = `${r.title || '(no title)'}\n${r.url}${r.needsLogin ? '\n(This page asks for a sign-in.)' : ''}`;
  if (name === 'browser_snapshot') { const img = fs.readFileSync(r.screenshot).toString('base64'); return { content: [{ type: 'text', text: head }, { type: 'image', data: img, mimeType: 'image/png' }] }; }
  return { content: [{ type: 'text', text: `${head}\n\n${String(r.text || '').slice(0, 12000)}\n\nLinks:\n${(r.links || []).slice(0, 40).map((l) => `- ${l.text.trim() || '(no text)'}: ${l.url}`).join('\n')}` }] };
}
const send = (m) => process.stdout.write(JSON.stringify(m) + '\n');
readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  let m; try { m = JSON.parse(line); } catch { return; } if (m.id === undefined) return; // notifications need no answer
  try {
    if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: (m.params && m.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'tulai-browser', version: '1.0.0' } } });
    if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id: m.id, result: { tools: TOOLS } });
    if (m.method === 'tools/call') { const t = TOOLS.find((x) => x.name === m.params.name); if (!t) throw Error('Unknown tool'); return send({ jsonrpc: '2.0', id: m.id, result: await call(t.name, m.params.arguments || {}) }); }
    if (m.method === 'ping') return send({ jsonrpc: '2.0', id: m.id, result: {} });
    send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } });
  } catch (e) { send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Browser error: ' + e.message }], isError: true } }); }
});
