// Chat commands for choosing the AI of this window (Tulai Bot or Tulai Desktop). Our trained brain stays the default.
//   "what models can I use" · "which model are you using" · "use claude" · "use groq llama-3.3-70b-versatile" · "back to default"
//   "groq models" · "search model qwen coder 7b" → "download 2" · "download status" · "open terminal claude" · "install codex"
const E = require('./engines');
const lastSearch = new Map(); // role -> results
const mark = (e) => (e.ready ? '✅' : e.kind === 'cli' ? '🔑 log in' : e.kind === 'api' ? '🔑 needs a key' : '⚠️');
const norm = (t) => String(t || '').replace(/^(?:hey|hi|ok|okay)\s+tula[iy][,!.\s]*/i, '').replace(/[.!?]+$/g, '').trim();
async function hf(role, call, arg) { // the bot runs downloads and models; Tulai Desktop asks the bot
  if (role === 'bot') { const H = require('./hf-models'); return call === 'search' ? { results: await H.search(arg) } : call === 'download' ? (H.download(arg), { status: H.status(arg.repo) }) : { jobs: H.allStatus(), downloaded: H.downloaded() }; }
  const port = process.env.TULAI_BOT_PORT || 39393, url = `http://127.0.0.1:${port}/api/bot/hf/${call}${call === 'search' ? '?q=' + encodeURIComponent(arg) : ''}`;
  const r = await fetch(url, call === 'download' ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tulai-ui': '1' }, body: JSON.stringify({ item: arg }) } : {}); const j = await r.json(); if (!r.ok) throw Error(j.error?.message || 'Tulai Bot did not answer.'); return j;
}
/** Returns { reply, terminal? } or null. save(cfg) writes the settings. */
const CONFIG = () => require('path').join(process.env.GC_DATA_DIR || require('path').join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'config.json');
const readCfg = () => { try { return JSON.parse(require('fs').readFileSync(CONFIG(), 'utf8')); } catch { return {}; } };
const writeCfg = (c) => { require('fs').writeFileSync(CONFIG(), JSON.stringify(c, null, 2), { mode: 0o600 }); };
async function handle(raw, { role = 'bot', cfg = readCfg(), save = writeCfg } = {}) {
  if (require('./sandbox').isDry()) save = () => {}; // a self-test never changes which AI you use
  const t = norm(raw), tl = t.toLowerCase(); let m;
  const choose = (id, model) => { cfg.engine = { ...(cfg.engine || {}), [role]: { id, model: model || '' } }; if (role === 'desktop') cfg.aiSource = id === 'gateway' ? 'gateway' : 'local'; save(cfg); };
  const where = role === 'bot' ? 'Tulai Bot' : 'Tulai Desktop';
  // ----- which AIs are there -----
  if (/^(?:what|which|list|show)(?:\s+(?:are|is))?(?:\s+(?:the|my|all))?\s+(?:ai\s+)?(?:models|engines|ais|brains|ai models)(?:\s+(?:can i use|available|do i have|i can use|are there))?$|^(?:ano(?:ng)?|anong mga)\s+(?:mga\s+)?(?:model|ai)s?\s+(?:ang\s+)?(?:pwede|available|meron)/.test(tl)) {
    const all = E.list(cfg, role), cur = E.chosen(cfg, role);
    return { reply: `**AI for ${where}** (now: ${E.label(cfg, role)})\n\n${all.map((e) => `- ${e.id === cur.id ? '👉 ' : ''}${mark(e)} **${e.name}**${e.default ? ' (default)' : ''}`).join('\n')}\n\nSay **use claude**, **use groq <model>**, **search model qwen coder 7b**, or **back to default**. Not logged in? Say **open terminal claude** (or codex, qwen, gemini).`, via: 'engines' };
  }
  if (/^(?:what|which)\s+(?:ai|model|engine|brain)\s+(?:are you|am i|is this(?: window)?)(?:\s+(?:using|on|running))?(?:\s+now)?$|^(?:ano(?:ng)?)\s+(?:ai|model)\s+(?:mo|ang gamit mo|ginagamit mo)(?:\s+ngayon)?(?:\s+tula[iy])?$/.test(tl)) {
    const c = E.chosen(cfg, role); return { reply: `${where} is using **${E.label(cfg, role)}**${c.id === 'tulai' ? ' (the default: our trained AI on this Mac; nothing leaves it)' : ''}. Say **what models can I use** to switch.`, via: 'engines' };
  }
  if (/^(?:back to (?:the )?default|use (?:the )?default(?: model| ai)?|reset (?:the )?(?:model|ai|engine)|use (?:our|your) (?:own )?(?:ai|brain|model)|balik sa default)$/.test(tl)) { choose('tulai'); return { reply: `Back to the default: ${where} uses **our trained AI** (Qwen2.5-3B, on this Mac).`, via: 'engines' }; }
  // ----- open a terminal (log in / install) -----
  if ((m = /^(?:open|show|start)(?:\s+(?:a|the|my))?\s+(?:tulai\s+|in-?chat\s+)?terminal(?:\s+(?:for|to log ?in(?: to)?|and log ?in(?: to)?|login))?(?:\s+(claude|codex|chatgpt|qwen|gemini)|\s+(?:here|in (?:the |this )?chat|dito))$|^(?:open|show|start)(?:\s+(?:a|the|my))?\s+(?:tulai|in-?chat)\s+terminal$|^(?:log ?in|login|sign ?in)(?:\s+to)?\s+(?:my\s+)?(claude|codex|chatgpt|qwen|gemini)(?:\s+account)?$/.exec(tl))) {
    const tool = ((m[1] || m[2] || '').replace('chatgpt', 'codex')); const c = E.CLIS[tool];
    if (tool && !E.which(c.bin)) return { reply: `Opening a terminal to log in to ${c.name}. It sets it up first (one time, about a minute), then starts the login (a browser page may open). When it says you are logged in, close the terminal and say **use ${tool}**.`, terminal: { tool }, via: 'engines' };
    return { reply: tool ? `Opening a terminal with \`${c.login}\`. Follow its login steps (a browser page may open). When it says you are logged in, close the terminal and say **use ${tool}**.` : 'Opening a terminal.', terminal: { tool }, via: 'engines' };
  }
  if ((m = /^(?:install|i-?install)\s+(claude(?: code)?|codex|chatgpt|qwen(?: code)?|gemini(?: cli)?)$/.exec(tl))) {
    const tool = m[1].split(' ')[0].replace('chatgpt', 'codex'); return { reply: `No separate install needed: opening a terminal that sets up ${E.CLIS[tool].name} and logs you in.`, terminal: { tool }, via: 'engines' };
  }
  // ----- Hugging Face -----
  if ((m = /^(?:search|find|look for|hanapin|hanap)(?:\s+(?:a|for|the|me|ng))*(?:\s+(?:hugging ?face|hf))?\s+(?:model|models|gguf)(?:\s+(?:for|na|ng))?\s+(.{2,80})$|^(?:search|find)\s+(?:hugging ?face|hf)(?:\s+for)?\s+(.{2,80})$/.exec(tl))) {
    const q = (m[1] || m[2]).trim(); let r; try { r = await hf(role, 'search', q); } catch (e) { return { reply: `I could not search Hugging Face: ${e.message}`, via: 'models' }; }
    const res = r.results || []; lastSearch.set(role, res);
    if (!res.length) return { reply: `No GGUF models found for "${q}". Try other words (for example "qwen coder 7b" or "llama 3.1 8b instruct").`, via: 'models' };
    const H = require('./hf-models');
    return { reply: `**Hugging Face models for "${q}"** (GGUF, most downloaded first)\n\n${res.map((x, i) => `${i + 1}. **${x.repo}**: ${x.fits ? `${x.quant}, ${H.gb(x.size)}` : `too big for this Mac (smallest ${x.tooBig || '?'})`} · ${x.downloads.toLocaleString()} downloads`).join('\n')}\n\nSay **download 1** (or another number). It downloads in the background; then say **use <name>**.`, via: 'models' };
  }
  if ((m = /^(?:download|i-?download|get)\s+(?:model\s+|number\s+|#|no\.?\s*)?(\d{1,2}|[\w.-]+\/[\w.-]+)$/.exec(tl))) {
    const res = lastSearch.get(role) || [], item = /^\d+$/.test(m[1]) ? res[+m[1] - 1] : res.find((x) => x.repo.toLowerCase() === m[1]);
    if (!item) return { reply: res.length ? `Pick a number from 1 to ${res.length}.` : 'Search first: say **search model <words>**.', via: 'models' };
    if (!item.fits) return { reply: `${item.repo} is too big for this Mac. Pick a smaller one (3B to 14B models fit best).`, via: 'models' };
    try { await hf(role, 'download', item); } catch (e) { return { reply: `I could not start the download: ${e.message}`, via: 'models' }; }
    return { reply: `Downloading **${item.repo}** (${item.quant}, ${require('./hf-models').gb(item.size)}) in the background. Say **download status** to check; when it is done say **use ${item.repo.split('/').pop().replace(/-GGUF$/i, '')}**.`, via: 'models' };
  }
  if (/^(?:download|model|models)\s+(?:status|progress)$|^(?:how(?:'s| is) the download)$/.test(tl)) {
    let r; try { r = await hf(role, 'status'); } catch (e) { return { reply: e.message, via: 'models' }; } const H = require('./hf-models');
    const jobs = (r.jobs || []).map((j) => `- ${j.repo}: ${j.state === 'downloading' ? `${j.percent}% (${H.gb(j.done)} of ${H.gb(j.total)})` : j.state === 'failed' ? `failed: ${j.error}` : j.state}`), have = (r.downloaded || []).map((d) => `- ${d.name} (${H.gb(d.size)})`);
    return { reply: `${jobs.length ? `**Downloads**\n${jobs.join('\n')}` : 'No downloads running.'}${have.length ? `\n\n**On this Mac**\n${have.join('\n')}` : ''}`, via: 'models' };
  }
  // ----- a provider's models -----
  if ((m = /^(?:list\s+|show\s+)?([a-z][a-z .-]{1,20}?)\s+models$/.exec(tl)) && !/^(?:hugging ?face|hf|my|the|all|ai|our)$/.test(m[1])) {
    const e = E.find(cfg, role, m[1]); if (!e) return null;
    if (e.id === 'cli:claude') return { reply: 'Claude models you can name: **sonnet**, **opus**, **haiku** (Claude Code aliases). Say **use claude opus**.', via: 'engines' };
    if (e.kind !== 'api') return { reply: `${e.name} picks its own model; you can still name one: **use ${e.id.split(':').pop()} <model>**.`, via: 'engines' };
    const p = e.id.slice(4), key = (cfg.engineKeys || {})[p], base = String(p === 'custom' ? (cfg.engineBases || {}).custom || '' : E.APIS[p].base).replace(/\/+$/, '');
    if (!key) return { reply: `Add your ${e.name} API key first: Tulai Desktop → Settings → AI engines.`, via: 'engines' };
    try { const r = await fetch(base + '/models', { headers: { Authorization: `Bearer ${key}`, ...(p === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : {}) }, signal: AbortSignal.timeout(15000) }); const j = await r.json(); if (!r.ok) throw Error(j.error?.message || `HTTP ${r.status}`);
      const ids = (j.data || []).map((x) => x.id).filter(Boolean).sort(); return { reply: `**${e.name} models** (${ids.length})\n${ids.slice(0, 40).map((x) => `- ${x}`).join('\n')}${ids.length > 40 ? '\n…' : ''}\n\nSay **use ${p} <model>**.`, via: 'engines' }; }
    catch (err) { return { reply: `${e.name}: ${err.message}`, via: 'engines' }; }
  }
  // ----- switch -----
  if ((m = /^(?:please\s+)?(?:use|switch to|change to|gamitin(?:\s+mo)?(?:\s+ang)?|lipat(?:\s+tayo)?\s+sa)\s+(.{2,80}?)(?:\s+(?:model|ai|engine|brain|instead|from now on|po|please|naman))*$/.exec(t))) {
    if (role === 'bot' && /^(?:the\s+)?(?:company(?:'s)?\s+(?:ai|model|gateway)|gateway|company)$/i.test(m[1].trim())) return { reply: 'Tulai Bot never uses the company AI. It can use our trained AI, a downloaded model, or one of your own AI accounts.', via: 'engines' };
    const words = m[1].trim().split(/\s+/); let e = null, model = '';
    for (let k = words.length; k >= 1 && !e; k--) { // the engine, then at most one model name ("use groq llama-3.3-70b-versatile"); "use Tulai Desktop to review this PR" is not a switch
      const cand = E.find(cfg, role, words.slice(0, k).join(' ')), rest = words.slice(k);
      if (cand && (rest.length === 0 || (rest.length === 1 && cand.kind !== 'local' && /^[\w.:/-]{2,80}$/.test(rest[0]) && !/^(?:to|for|and|in|on|the|it|this|now|please|po)$/i.test(rest[0])))) { e = cand; model = rest.join(' '); } }
    if (!e) return null; // "use chrome", "use account x": other commands
    if (e.kind === 'gateway' && role === 'bot') return { reply: 'Tulai Bot never uses the company AI. It can use our trained AI, a downloaded model, or one of your own AI accounts.', via: 'engines' };
    if (e.kind === 'cli' && !e.custom && (!e.installed || e.loggedIn === false)) { choose(e.id, model); return { reply: `${where} will use **${e.short || e.name}**. Log in first in the terminal that just opened${e.installed ? '' : ' (it sets it up first, one time)'}; then ask me anything.`, terminal: { tool: e.id.slice(4) }, via: 'engines' }; }
    if (e.kind === 'api' && !e.ready) return { reply: `${e.name} needs your API key: Tulai Desktop → Settings → AI engines. Then say **use ${e.id.slice(4)} <model>** (or **${e.id.slice(4)} models** to see them).`, via: 'engines' };
    const keep = !model && E.chosen(cfg, role).id === e.id ? E.chosen(cfg, role).model : model;
    choose(e.id, keep);
    const note = e.kind === 'api' && !keep ? ` Now pick a model: say **${e.id.slice(4)} models**.` : e.kind === 'cli' ? ' It can read pages and take snapshots with Tulai\'s browser, and it works in the project folder of this chat.' : e.kind === 'gguf' ? ' It runs on this Mac (the first answer takes a few seconds while it loads).' : '';
    return { reply: `${where} now uses **${E.label(cfg, role)}**.${note} Your prompts go to ${e.kind === 'local' || e.kind === 'gguf' ? 'nowhere: it runs on this Mac' : e.kind === 'gateway' ? 'the company AI' : 'that provider, under your own account'}. Say **back to default** any time.`, via: 'engines' };
  }
  return null;
}
module.exports = { handle };
