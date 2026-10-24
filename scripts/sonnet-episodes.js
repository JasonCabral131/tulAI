// Learn from the company AI (Sonnet): turns the saved tool steps of Tulai Desktop chats that the company AI answered into practice for our own brain.
// Every step becomes one example: "given the task and the last few steps, this is the move Sonnet made next" (tool call or final summary), because
// training learns only the last message of an example. Long results are clipped and whole-file writes are skipped so each example fits training.
// Saved privately on this Mac in <data>/training/sonnet/<chat>.json (your code stays here; never shipped with the app).
//   node scripts/sonnet-episodes.js <chat-id> [<chat-id> …]
const fs = require('fs'), os = require('os'), path = require('path');
const DATA = process.env.GC_DATA_DIR || path.join(os.homedir(), 'Library', 'Application Support', 'gateway-chat');
const A = require('../agent'), CODER = require('../agent-mode').CODER;
const clip = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + `\n…[${s.length - n} more characters]` : s; };
function episodes(chat) {
  const h = chat.history || [], ws = chat.workspace ? path.basename(chat.workspace) : 'the project', out = [];
  const sys = { role: 'system', content: `You are Tulai's coding assistant with direct access to the user's project through tools.\n\nWorking directory: ~/Projects/${ws}\n\n${CODER}` };
  let task = null, steps = [];
  for (const m of h) {
    if (m.role === 'user') { if (!/^(?:continue|approve|go|yes|ok)$/i.test(String(m.content).trim())) { task = { role: 'user', content: clip(m.content, 1500) }; steps = []; } continue; }
    if (!task) continue;
    if (m.role === 'tool') { steps.push({ role: 'tool', tool_call_id: m.tool_call_id, content: clip(m.content, 500) }); continue; }
    if (m.role !== 'assistant') continue;
    const calls = (m.tool_calls || []).map((c) => { let a = {}; try { a = JSON.parse(c.function.arguments || '{}'); } catch {} return { id: c.id, type: 'function', function: { name: c.function.name, arguments: a } }; });
    const text = m.content && m.content !== 'None' ? String(m.content) : '';
    const target = { role: 'assistant', content: calls.length ? '' : clip(text, 1500), ...(calls.length ? { tool_calls: calls.slice(0, 1) } : {}) };
    const big = calls.some((c) => JSON.stringify(c.function.arguments).length > 1500); // a whole file written in one call does not fit an example
    const known = calls.every((c) => require('../local-fit').LOCAL_TOOLS.has(c.function.name)); // our brain only gets the tools it practises; Sonnet's sub-agent and other calls are not taught
    if ((calls.length || text.trim()) && !big && known) {
      const ctx = steps.slice(-6); while (ctx.length && ctx[0].role === 'tool') ctx.shift(); // the last few steps, starting at a call
      const used = new Set([...ctx, target].flatMap((x) => (x.tool_calls || []).map((c) => c.function.name)));
      const tools = A.TOOLS.filter((t) => used.has(t.function.name));
      out.push({ messages: [sys, task, ...ctx, target], tools: tools.length ? tools : A.TOOLS.filter((t) => ['read_file', 'list_dir', 'grep'].includes(t.function.name)), source: 'sonnet' });
    }
    const short = (a) => Object.fromEntries(Object.entries(a || {}).map(([k, v]) => [k, typeof v === 'string' ? clip(v, 400) : v])); // earlier steps as context: long inputs trimmed field by field
    if (calls.length) steps.push({ role: 'assistant', content: '', tool_calls: calls.slice(0, 1).map((c) => ({ ...c, function: { ...c.function, arguments: short(c.function.arguments) } })) });
  }
  return out;
}
if (require.main === module) {
  const dir = path.join(DATA, 'training', 'sonnet'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const id of process.argv.slice(2)) {
    const chat = JSON.parse(fs.readFileSync(path.join(DATA, 'chats', id + '.json'), 'utf8')); const eps = episodes(chat);
    fs.writeFileSync(path.join(dir, id + '.json'), JSON.stringify({ about: `Steps the company AI (Sonnet) took in the Tulai Desktop chat "${chat.title}", turned into practice for our brain.`, chat: id, episodes: eps }), { mode: 0o600 });
    console.log(`${eps.length} practice steps from "${chat.title}" (${eps.filter((e) => e.messages.at(-1).tool_calls).length} tool calls, ${eps.filter((e) => !e.messages.at(-1).tool_calls).length} summaries)`);
  }
}
module.exports = { episodes };
