// Bot harness: a small agent loop for the Tulai bot. It runs on the embedded model (offline, no tokens) and can use safe local tools
// one after another, e.g. "open mb-mobile in VS Code and tell me its git status". Anything that changes code or git history, or needs the
// company AI, is handed to Tulai Desktop instead. Every tool goes through the same safety rules as the rest of the local engine.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const fn = (name, description, properties = {}, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } });
const S = { type: 'string' };
const TOOLS = [
  fn('open_app', 'Open an application on the Mac (e.g. Safari, Notes, Slack).', { name: S }, ['name']),
  fn('open_project', 'Open a project folder from this Mac in an editor (VS Code by default) or in Finder.', { name: S, editor: S }, ['name']),
  fn('open_website', 'Open a website or URL in the browser.', { site: S }, ['site']),
  fn('open_chrome', 'Open Google Chrome (asks the person which profile if there are several).', { profile: S }),
  fn('search_web', 'Search Google for something.', { query: S }, ['query']),
  fn('set_volume', 'Change the Mac sound: a level 0-100, or "up", "down", "mute", "unmute".', { level: S }, ['level']),
  fn('take_screenshot', 'Take a screenshot of the screen and save it to the Desktop.'),
  fn('start_meeting_notes', 'Start listening and writing meeting notes.'),
  fn('stop_meeting_notes', 'Stop the meeting notes and summarize them.'),
  fn('chat_teams', 'Start a Microsoft Teams chat with a person (opens a draft; the person presses Enter to send).', { person: S, message: S, organization: S }, ['person']),
  fn('compose_email', 'Prepare an email draft.', { to: S, subject: S, body: S }),
  fn('list_meetings', 'Read upcoming meetings from the connected calendar.', {}),
  fn('list_reminders', 'Read existing reminders.', {}),
  fn('open_folder', 'Open a standard folder: downloads, documents, desktop, home, or applications.', {name:S}, ['name']),
  fn('get_time_date', 'Get the current time and date.'),
  fn('list_projects', 'List the git projects on this Mac.'),
  fn('git_status', 'Read-only: git status of a project (branch, changed files).', { project: S }, ['project']),
  fn('git_log', 'Read-only: the latest commits of a project.', { project: S, count: { type: 'number' } }, ['project']),
  fn('find_files', 'Find files on this Mac by name.', { name: S }, ['name']),
  fn('read_text_file', 'Read the beginning of a small text file in the home folder.', { path: S }, ['path']),
  fn('memory_status', 'Read this Mac\'s memory health: free memory, swap, and the apps using the most.'),
  fn('perform_move', 'Make the Tulai robot act out a feeling or move: dance, dive, cry, giggle, laugh, wave, jump, spin, sleep, angry, love, sing, bow, clap, scared, wink or celebrate.', { move: S }, ['move']),
];
const ACTION = new Set(['perform_move', 'open_app', 'open_project', 'open_website', 'open_chrome', 'search_web', 'set_volume', 'take_screenshot', 'start_meeting_notes', 'stop_meeting_notes', 'chat_teams', 'compose_email']);
// Device state is reported from execution evidence, not a model paraphrase.
const DEVICE_RESULTS = new Set([...ACTION, 'open_folder', 'find_files', 'list_meetings', 'list_reminders', 'memory_status', 'get_time_date', 'list_projects']);
function validateCall(tc, tools) {
  const schema=tools.find(t=>t.function.name===tc?.function?.name)?.function.parameters;
  if(!schema)return null;
  let a;try{a=JSON.parse(tc.function.arguments||'{}')}catch{return null}
  if(!a||typeof a!=='object'||Array.isArray(a)||(schema.required||[]).some(k=>a[k]===undefined||(typeof a[k]==='string'&&!a[k].trim()))||Object.entries(a).some(([k,v])=>!schema.properties[k]||typeof v!==schema.properties[k].type||(typeof v==='number'&&!Number.isFinite(v))))return null;
  if(tc.function.name==='set_volume'&&!/^(?:100|[1-9]?\d|up|down|mute|unmute)$/i.test(a.level))return null;
  if(tc.function.name==='git_log'&&a.count!==undefined&&(!Number.isInteger(a.count)||a.count<1||a.count>100))return null;
  return a;
}
const clip = (t, n = 1400) => (String(t).length > n ? String(t).slice(0, n) + '…' : String(t));
const sh = (cmd, args, cwd) => new Promise((res) => execFile(cmd, args, { cwd, timeout: 12000, maxBuffer: 2e6 }, (e, so, se) => res(e ? `error: ${String(se || e.message).trim().slice(0, 200)}` : String(so).trim() || '(nothing)')));
const SENSITIVE = /(^|\/)(\.ssh|\.aws|\.gnupg|\.kube|Keychains)(\/|$)|\.env(\.|$)|id_(rsa|ed25519)|credential|password|secret|\.pem$|\.p12$|token/i;

async function exec(name, a, ctx) {
  const local = require('./local'); const say = (cmd) => local.handleRules(cmd, { ...ctx.opts, nlu: null });
  const res = async (cmd) => { const r = await say(cmd); return r ? { text: r.reply, ask: local.hasPending(ctx.sid) } : { text: 'I could not do that.' }; };
  switch (name) {
    case 'open_app': { // never open an app the person did not name (a small model once invented "Safari" out of "run the platform reports")
      const said = String(ctx.said || '').toLowerCase(), words = String(a.name || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
      if (ctx.said && !words.some((w) => said.includes(w) || said.includes(w.slice(0, 4)))) return { text: 'Which app do you want me to open?', ask: true };
      return res(`open ${a.name}`);
    }
    case 'open_project': return res(a.editor ? `open ${a.name} in ${a.editor}` : `open ${a.name} in vs code`);
    case 'open_website': return res(`open ${a.site}`);
    case 'open_chrome': return res(a.profile ? `open chrome for my ${a.profile} profile` : 'open chrome');
    case 'search_web': return res(`search for ${a.query}`);
    case 'set_volume': { const l = String(a.level || '').toLowerCase(); return res(/^\d+$/.test(l) ? `set volume to ${l}` : /up|louder/.test(l) ? 'volume up' : /down|lower|quiet/.test(l) ? 'volume down' : /^unmute/.test(l) ? 'unmute' : 'mute'); }
    case 'take_screenshot': return res('take a screenshot');
    case 'start_meeting_notes': return res('start meeting notes');
    case 'stop_meeting_notes': return res('stop meeting notes');
    case 'chat_teams': return res(`chat ${a.person}${a.organization ? ' in ' + a.organization : ''} in teams${a.message ? ' saying ' + a.message : ''}`.replace(/ in (\S+) in teams/, ' in $1 teams'));
    case 'compose_email': return res(`send an email${a.to ? ' to ' + a.to : ''}${a.subject ? ' subject ' + a.subject : ''}${a.body ? ' saying ' + a.body : ''}`);
    case 'list_meetings': return res('show my meetings');
    case 'list_reminders': return res('list my reminders');
    case 'open_folder': {const name=String(a.name||'').toLowerCase();if(!['downloads','documents','desktop','home','applications'].includes(name))return {text:'Which folder: Downloads, Documents, Desktop, Home, or Applications?',ask:true};return res('open '+name);}
    case 'get_time_date': { const d = new Date(); return { text: `${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, ${d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}` }; }
    case 'list_projects': { const p = local.vocab(ctx.opts).projects; return { text: p.length ? p.join(', ') : 'none found' }; }
    case 'git_status': case 'git_log': {
      const dir = local.findFolder(a.project, ctx.opts && ctx.opts.roots); if (!dir) return { text: `No project called ${a.project}.` };
      if (!fs.existsSync(path.join(dir, '.git'))) return { text: `${path.basename(dir)} is not a git project.` };
      return { text: clip(`${path.basename(dir)}: ` + await (name === 'git_status' ? sh('git', ['status', '-sb', '--short'], dir) : sh('git', ['log', '--oneline', '-n', String(Math.min(10, Math.max(1, +a.count || 5)))], dir))) };
    }
    case 'find_files': { const out = await sh('/usr/bin/mdfind', ['-onlyin', os.homedir(), '-name', String(a.name)]); const lines = out.split('\n').filter((x) => x && !x.includes('/Library/') && !x.includes('node_modules') && !SENSITIVE.test(x)).slice(0, 8).map((x) => x.replace(os.homedir(), '~')); return { text: lines.length ? lines.join('\n') : 'No files found.' }; }
    case 'read_text_file': {
      const p = path.resolve(String(a.path || '').replace(/^~/, os.homedir())); if (!p.startsWith(os.homedir() + path.sep) || SENSITIVE.test(p)) return { text: 'I am not allowed to read that file.' };
      try { const st = fs.statSync(p); if (!st.isFile() || st.size > 400000) return { text: 'That is not a small text file.' }; const t = fs.readFileSync(p, 'utf8'); if (/\u0000/.test(t.slice(0, 2000))) return { text: 'That is not a text file.' }; return { text: clip(t, 1500) }; } catch (e) { return { text: 'I could not read that file.' }; }
    }
    case 'memory_status': { const sm = require('./sysmem'); return { text: sm.describe(await sm.read()) }; }
    case 'perform_move': { const mv = (String(a.move || '').toLowerCase().match(/dance|dive|cry|giggle|laugh|wave|jump|spin|sleep|angry|love|sing|bow|clap|scared|wink|celebrate/) || ['dance'])[0]; return { text: 'Watch this!', perform: mv }; }
    case 'delegate_to_desktop': return { text: 'Error: Desktop handoff is not available from the model tool loop.' };
    default: return { text: 'Unknown tool.' };
  }
}

// The small model invents actions when it is handed every tool for every sentence (a plain question once became "What is John Doe's work email?").
// So a tool is only visible when the person's words are about that thing; with no matching tool it simply answers.
const WHEN = {
  list_meetings:/\b(meetings?|calendar|schedule|pulong)\b/i, list_reminders:/\b(reminders?|alarms?|paalala)\b/i, open_folder:/\b(downloads|documents|desktop|home|applications|folder)\b/i,
  open_app: /\b(open|launch|start|run|buksan|bukas)\b/i, open_project: /\b(open|launch|project|repo|folder|code|editor|buksan)\b/i, open_website: /\b(open|go to|visit|website|site|url|browse|buksan)\b/i, open_chrome: /\b(chrome|browser|profile)\b/i,
  search_web: /\b(search|google|look up|lookup|find out|hanapin|saliksik)\b/i, set_volume: /\b(volume|louder|quieter|mute|unmute|loud|sound|tunog|lakas|hina)\b/i, take_screenshot: /\b(screenshot|screen ?shot|capture the screen|kuhanan)\b/i,
  start_meeting_notes: /\b(meeting|record|transcrib|minutes)\b/i, stop_meeting_notes: /\b(meeting|record|transcrib|minutes)\b/i,
  chat_teams: /\b(teams|ms teams|chat (?:with|to)|message|ping|dm)\b/i, compose_email: /\b(e-?mail|mail|inbox)\b/i, get_time_date: /\b(time|date|day is it|oras|petsa)\b/i,
  list_projects: /\b(projects?|repos?|repositories)\b/i, git_status: /\b(git|status|branch|uncommitted|changes)\b/i, git_log: /\b(git|commits?|history|log)\b/i, find_files: /\b(find|locate|where is|file|files|hanapin)\b/i, read_text_file: /\b(read|open|show|contents?|what(?:'s| is) in)\b.*\b(file|readme|json|txt|md|\.[a-z]{2,4})\b|\bfile\b/i,
  memory_status: /\b(memory|ram|swap|slow|mac(?:book)? (?:is|running))\b/i, perform_move: /\b(dance|dive|cry|giggle|laugh|wave|jump|spin|sleep|angry|love|sing|bow|clap|scared|wink|celebrate|sumayaw|sisid)\b/i,
  delegate_to_desktop: /\b(tickets?|git|rebase|merge|commit|push|pull|branch|refactor|implement|deploy|bug|jira|gitlab|pull request|code review|migrate|write (?:the |a )?(?:code|function|class|test)s?)\b/i,
};
const toolsFor = (text) => TOOLS.filter((t) => WHEN[t.function.name] && WHEN[t.function.name].test(text));
const system = (v, tools = []) => `You are Tulai, a friendly voice assistant on the person's Mac, using the bot model selected in settings. Do not guess the provider or model identity. Reply in the language the person uses (English, Tagalog or Taglish). Be concise; use Markdown bold, lists or tables when they make the answer clearer.
Use tools to complete every part of the current request, one or several in order. Recent conversation is context, not permission to repeat old actions. Resolve clear references from it; ask when a target is ambiguous. Stop and explain any failed step before taking dependent actions. Never claim you did something unless a tool result says so. Never invent project, app or person names: use the closest match from the lists below.
You think for yourself. Answer every question, request for advice, explanation, opinion, idea, plan, draft message, translation, definition, joke, greeting or small talk directly, as well as you can; a short best-effort answer is always better than sending it elsewhere. If a needed tool is absent, explain exactly what cannot be done. Desktop requests are handled outside this tool loop. Do not suggest another AI as a default fallback. Answer simple questions and chit-chat yourself, and say plainly when you are not sure.
${tools.some((t) => ['open_app', 'open_project', 'git_status', 'git_log', 'list_projects'].includes(t.function.name)) ? `\nProjects on this Mac: ${(v.projects || []).slice(0, 40).join(', ') || '(none)'}\nApps: ${(v.apps || []).slice(0, 50).join(', ') || '(none)'}` : ''}`;

/** Runs the loop. Returns { reply, steps, delegate? } or null when the embedded model is unavailable. */
async function run(text, ctx) {
  const nlu = ctx.nlu; if (!nlu || !nlu.available()) return null;
  const history = (ctx.opts?.history || []).filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-8).map(m => ({role:m.role, content:m.content.slice(0,2000)}));
  const reference = /\b(it|that|those|them|same|again|instead|then|also|ito|iyan|yun|iyon|ulit)\b/i.test(text);
  const previousUser = history.filter(m => m.role === 'user').at(-1)?.content || '';
  const namedApps = (require('./local').vocab(ctx.opts).apps || []).filter(app => previousUser.toLowerCase().includes(app.toLowerCase()));
  const resolvedSaid = reference && namedApps.length === 1 ? text + ' ' + namedApps[0] : text;
  const tools = toolsFor(reference ? history.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ') + ' ' + text : text), msgs = [{ role: 'system', content: system(require('./local').vocab(ctx.opts), tools) + '\n\n' + require('./bot-memory').context(ctx.opts?.lessons) }, ...history, { role: 'user', content: text }], steps = [];
  let lastResults = [], lastPerform = null;
  const completed = new Set();
  const cancelled=()=>({reply:[...lastResults,'Stopped. No further steps will run.'].join(' '),steps});
  for (let i = 0; i < 5; i++) {
    if(ctx.opts?.signal?.aborted)return cancelled();
    let m; try { m = await nlu.chat({ messages: msgs, tools: tools.length ? tools : undefined }); } catch { m = null; } if (!m) return steps.length ? {reply: lastResults.join(' ') + ' I could not finish the remaining steps.', steps} : null;
    if(ctx.opts?.signal?.aborted)return cancelled();
    const requested = Array.isArray(m.tool_calls) ? m.tool_calls : [];
    if (requested.some(c => !c?.function || !tools.some(t => t.function.name === c.function.name))) return {reply:'I could not carry out that action with the available tools. Please clarify what you want me to do.', steps};
    const parsed=requested.map(tc=>validateCall(tc,tools));
    if(parsed.some(a=>a===null))return {reply:[...lastResults,'I could not run the next action: its tool arguments were invalid. No action in that batch was executed.'].join(' '),steps};
    const calls = requested; // never run a tool that was not offered
    if (!calls.length) { if(steps.length&&steps.every(s=>DEVICE_RESULTS.has(s.tool)))return {reply:lastResults.join('\n\n'),steps,perform:lastPerform}; const reply = String(m.content || '').replace(/[*_`#]+/g, '').trim(); return { reply: reply || (lastResults.join(' ') || 'I could not complete that request. Please tell me what you want me to do.'), steps, perform:lastPerform }; }
    msgs.push({ role: 'assistant', content: m.content || '', tool_calls: calls });
    ctx.said = resolvedSaid; const texts = []; let perform = null;
    for (const tc of calls) {
      if(ctx.opts?.signal?.aborted)return cancelled();
      const a=parsed[calls.indexOf(tc)];
      const key = tc.function.name + ':' + JSON.stringify(a);
      if (completed.has(key)) return {reply: lastResults.join(' ') + ' I stopped because the next action repeated a completed step.', steps};
      completed.add(key);
      const failures=require('./failure-memory'),prior=failures.blocked(tc.function.name,a);
      if(prior)return {reply:failures.message(prior),steps};
      const progressId = 'local-' + steps.length;
      ctx.opts?.onProgress?.({type:'tool', id:progressId, name:tc.function.name, args:a});
      const r = await exec(tc.function.name, a, ctx).catch((e) => ({ text: 'error: ' + e.message }));
      const failed = /^(?:error:|I could not|I couldn't|I am not allowed|No project called|That is not|Blocked:)/i.test(r.text);
      ctx.opts?.onProgress?.({type:'tool_result', id:progressId, error:failed, result:r.text});
      steps.push({ tool: tc.function.name, args: a, result: clip(r.text, 160) }); texts.push(r.text); msgs.push({ role: 'tool', tool_call_id: tc.id, content: clip(r.text) });
      if (failed) {const failure=failures.fail(tc.function.name,a);const recovery=ctx.opts?.recovery===false?null:await require('./failure-research').research(failure,r.text,{signal:ctx.opts?.signal,progress:ctx.opts?.onProgress}).catch(()=>null);return {reply:[...lastResults,...texts,failures.message(failure),recovery?require('./failure-research').format(recovery):''].join(' '),steps};}
      failures.success(tc.function.name,a);
      if (r.offer) return {reply:'That needs Tulai Desktop to continue.', offer:r.offer, steps};
      if (r.ask) return {reply:r.text, steps};
      if (r.perform) perform = lastPerform = r.perform;
    }
    lastResults.push(...texts);
    if (calls.every((c) => ACTION.has(c.function.name)) && !/\b(and|then|also|after|before|tapos|saka|at)\b/i.test(text)) return { reply: texts.join(' '), steps, perform }; // plain actions: say what happened, no extra model round
  }
  return { reply: [...lastResults, 'I reached the step limit before finishing the request.'].join(' '), steps };
}
module.exports = { run, exec, TOOLS, toolsFor, validateCall };
