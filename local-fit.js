// Our trained AI on this Mac has two sizes: the everyday 32K brain and a 100K copy for very long requests. Every request to it is fitted here first, so long agent runs never fail with
// "request exceeds the available context size".
/** Fits a request into our local brain's memory (102,400 tokens): no sub-agent tool (it re-sends everything), long tool results trimmed, and the oldest
 middle steps dropped (with a note) while the instructions, the task and the latest steps stay. ~3.2 characters per token, with room for the answer. */
const LOCAL_TOOLS = new Set(['read_file', 'write_file', 'edit_file', 'list_dir', 'glob', 'grep', 'bash', 'web_fetch', 'browser', 'exit_plan_mode', 'todo_write']);
const LOCAL_CTX = 32768; // the everyday brain: the model's natural window, full quality
const LONG_CTX = 102400; // the long brain (nlu.js ensureLong): 100K tokens, YaRN x4; working memory ~36 KB per token, so ~3.7 GB
const est = (x) => Math.ceil(JSON.stringify(x || '').length / 3.2);
/** True when a request will not fit the everyday 32K brain (with room for the answer): it goes to the 100K copy. */
const needsLong = (body) => est(body.messages) + est(body.tools) + Math.min(+body.max_tokens || 1024, 4096) + 400 > LOCAL_CTX;
function fitLocal(body, limit = LOCAL_CTX) {
  body = { ...body, messages: body.messages.map((m) => ({ ...m })) };
  if (Array.isArray(body.tools)) body.tools = body.tools.filter((t) => t && t.function && LOCAL_TOOLS.has(t.function.name)); // only the tools our brain practised (a small brain misuses unfamiliar ones)
  if (Array.isArray(body.tools) && !body.tools.length) delete body.tools;
  const room = limit - Math.min(+body.max_tokens || 1024, 4096) - 400; if (!(+body.max_tokens) || +body.max_tokens > 4096) body.max_tokens = Math.min(+body.max_tokens || 1024, 4096);
  const total = () => est(body.messages) + est(body.tools);
  for (const m of body.messages) if (m.role === 'tool' && typeof m.content === 'string' && m.content.length > 3000) m.content = m.content.slice(0, 3000) + `\n…[trimmed ${m.content.length - 3000} characters to fit memory; read a smaller part if you need more]`;
  const first = body.messages.findIndex((m) => m.role === 'user'); let noted = false;
  while (total() > room && first >= 0 && body.messages.length > first + 3) { // drop the oldest step after the task: an assistant turn and its tool results go together
    let j = first + 1; if (!noted) { body.messages.splice(j, 0, { role: 'user', content: '[Earlier steps were removed to fit memory. Continue from the latest steps below.]' }); noted = true; } j++;
    if (j >= body.messages.length - 2) break; const n = body.messages[j].role === 'assistant' ? 1 + body.messages.slice(j + 1).findIndex((m) => m.role !== 'tool') : 1; body.messages.splice(j, n > 0 ? n : 1);
  }
  for (const m of body.messages) if (total() > room && typeof m.content === 'string' && m.content.length > 6000) m.content = m.content.slice(0, 6000) + '\n…[trimmed to fit memory]';
  return body;
}
module.exports = { fitLocal, needsLong, LOCAL_CTX, LONG_CTX, LOCAL_TOOLS };
