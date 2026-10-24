// "Check my Outlook inbox", "any unread Teams chats?", "read https://... in my Ascendion account", "open Tulai's browser for Metrobank":
// the background browser uses the accounts you signed in to (Settings, Accounts) to look at your mail, chats and pages, then tells you what matters.
// It only reads. Anything that sends, deletes or changes something stays with you.
const GENERIC = new Set(['outlook', 'google', 'teams', 'calendar', 'microsoft', 'office', 'mail', 'email', 'work', 'account', 'my', 'the']);
const words = (s) => String(s).toLowerCase().match(/[a-z0-9]{3,}/g) || [];
const named = (src, tl) => words(src.name).filter((w) => !GENERIC.has(w)).some((w) => new RegExp(`\\b${w}\\b`).test(tl));
/** Picks the accounts a sentence is about: by name first ("Ascendion"), then by kind ("my inbox" = Outlook or Google mail, "Teams"). */
function pick(tl, sources, kinds) {
  const byName = sources.filter((s) => named(s, tl)); if (byName.length) return byName.slice(0, /\ball\b|\bevery\b|\blahat\b/.test(tl) ? 4 : 1);
  const ok = sources.filter((s) => kinds.includes(s.kind || (s.id === 'outlook' ? 'outlook' : s.id === 'google' ? 'google' : s.id === 'teams' ? 'teams' : 'other')));
  const on = ok.filter((s) => s.enabled && s.status && s.status.ok); const pool = on.length ? on : ok.filter((s) => s.enabled); const use = pool.length ? pool : ok;
  return use.slice(0, /\ball\b|\bevery\b|\blahat\b/.test(tl) ? 4 : 1);
}
const SYS = {
  mail: 'You read the text of a person\'s email inbox page. In at most five short spoken sentences say how many look unread or new, who they are from, the subjects that matter, and anything urgent or waiting for a reply. No markdown, no lists.',
  mailsearch: 'You read the text of an email search result page. Each result is a sender name, a subject and a date. In at most four short spoken sentences say how many results there are, the main subject, who sent the newest ones and when, and what they ask the person to do. Use only what is written. Do not say unread, do not apologise, do not guess. No markdown, no lists.',
  teams: 'You read the text of a person\'s Microsoft Teams chat list. In at most five short spoken sentences say who wrote recently, what about, which look unread or mention the person, and what needs a reply. No markdown, no lists.',
  page: 'You read the text of a web page the person asked about. Summarize it in at most five short spoken sentences: what it is and the points that matter. If it is a sign-in or error page, say so. No markdown, no lists.',
};
async function summarize(kind, name, r, ctx) {
  let text = String(r.text || ''); if (kind === 'mailsearch') { const i = text.search(/\bTop results\b|\bResults\b/); if (i >= 0) text = text.slice(i); text = text.replace(/\n\s*CAUTION:- External Mail\.?/g, '').replace(/\n{2,}/g, '\n'); } text = text.slice(0, 7000);
  if (ctx.nlu && ctx.nlu.available && ctx.nlu.available()) {
    const out = await ctx.nlu.chat({ messages: [{ role: 'system', content: SYS[kind] }, { role: 'user', content: `Account: ${name}\nPage title: ${r.title}\n\n${text}` }], max_tokens: 260, temperature: 0.2, timeout: 60000 }).catch(() => null);
    const t = out && String(out.content || '').replace(/[*_`#]+/g, '').trim(); if (t) return t;
  }
  return `I opened ${name} and read ${r.text.length} characters, but my thinking brain is not ready to summarize them. The first lines are: ${text.replace(/\s+/g, ' ').slice(0, 260)}`;
}
const NEED = (name) => `I need you to sign in to ${name} first. Open Settings, Accounts, press Sign in for it, and close the window when you are done. After that I can read it in the background.`;

/** ctx: { nlu, sources(), call(cmd, arg), save(name, buffer) → view|null }. Returns a reply object or null. */
let lastSearch = null;
async function handle(text, tl, ctx) {
  const sources = ctx.sources ? ctx.sources() : []; let m;
  const run = async (kind, what, label, tail, search) => {
    const accts = pick(tl, sources, kind === 'teams' ? ['teams'] : ['outlook', 'google']);
    if (!accts.length) return { reply: kind === 'teams' ? 'I have no Teams account yet. Open Settings, Accounts, turn on Teams and press Sign in once. Then I can read your chats in the background.' : 'I have no email account yet. Open Settings, Accounts, turn on Outlook or Google and press Sign in once. Then I can read your inbox in the background.' };
    const parts = [], views = [];
    for (const a of accts) {
      let r; try { r = await ctx.call('webread', { id: a.id, url: await ctx.home(a, what), ...(search ? { search } : {}) }); } catch (e) { parts.push(`${a.name}: ${e.message}`); continue; }
      if (r.needsLogin) { parts.push(NEED(a.name)); continue; } if (!r.ok) { parts.push(`${a.name}: the page was empty. It may still be loading; try again.`); continue; }
      parts.push((accts.length > 1 ? `${a.name}: ` : '') + await summarize(search ? 'mailsearch' : kind, a.name, r, ctx)); try { const v = ctx.save && r.shot && ctx.save(`${a.name} ${label}.png`, r.shot); if (v) views.push(v); } catch {}
      try { require('./export').setLast(`# ${a.name}: ${label}\n\n${r.text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 80).join('\n\n')}\n`, `${a.name} ${label}`); } catch {}
    }
    return { reply: parts.join(' '), ...(views.length ? { views } : {}) };
  };
  if (/^(?:please\s+)?(?:list|show|which|what)\b.*\b(?:account |tulai'?s |signed-?in )?browsers?\b/.test(tl) && !/\b(?:open|close)\b.*\b(?:chrome|safari|firefox)\b/.test(tl) && tl.split(/\s+/).length <= 10 && /\b(?:account|tulai|signed|open|have)\b/.test(tl)) {
    const t = await ctx.call('webtabs', {}); if (!Array.isArray(t) || !t.length) return { reply: 'You have no accounts yet. Add one in Settings, Accounts.' };
    return { reply: t.map((x) => `${x.name}: ${x.open ? 'open' + (x.title ? ' on "' + x.title.slice(0, 50) + '"' : '') : 'closed'}`).join('. ') + '.' };
  }
  if ((m = /^(?:please\s+)?inspect\b\s*(?:the\s+)?(?:page\s+(?:of|in|on)\s+)?(?:my\s+)?(.*)$/.exec(tl)) && tl.split(/\s+/).length <= 10) {
    const a = pick(m[1] || tl, sources, ['outlook', 'google', 'teams', 'other'])[0]; if (!a) return { reply: `Which account? Your accounts: ${sources.map((s) => s.name).join(', ') || 'none yet (Settings, Accounts)'}.` };
    let r; try { r = await ctx.call('webinspect', { id: a.id }); } catch (e) { return { reply: `${a.name}: ${e.message}` }; }
    if (r.needsLogin) return { reply: NEED(a.name) }; if (!r.ok) return { reply: `${a.name}: I could not inspect the page (${r.error || 'empty'}).` };
    let view = null; try { view = ctx.save && r.shot && ctx.save(`${a.name} inspect.png`, r.shot); } catch {}
    const names = (r.elements || []).filter((e) => e.label).slice(0, 12).map((e) => `${e.tag === 'a' ? 'link' : e.tag} "${e.label.slice(0, 40)}"`).join(', ');
    return { reply: `${a.name} is on "${r.title}". I see ${r.total} interactive elements, ${r.forms} forms and ${r.frames} frames. First ones: ${names || 'none'}.`, ...(view ? { views: [view] } : {}) };
  }
  const fup = /^(?:ok(?:ay)?\s+)?(?:go|go ahead|do it|yes|sige|oo|try again|you already have (?:the |an? )?(?:internal |background |built-?in )*browser|use (?:the |your )?(?:internal |background |built-?in )+browser)\W*(?:please)?$/;
  if (fup.test(tl) && lastSearch && Date.now() - lastSearch.at < 5 * 60000) { const p = lastSearch; return run('mail', 'mail', 'email search', '', p.term); }
  if ((m = /\b(?:browse|search|find|look(?:ing)?\s+(?:for|up|through)|open|read|check|show|get|hanapin)\b.*?\b(?:e-?mails?|mails?|inbox)\b\s+(?:in .*? )?(?:regarding|about|re|on|from|named|titled|with|for|containing)\s+(.+)$/.exec(tl)) && !/\b(?:send|write|compose|draft|reply|forward|delete|remind|reminder|mark|address|password|signature|settings?)\b/.test(tl) && tl.split(/\s+/).length <= 18) {
    const term = m[1].replace(/\s+(?:in|on|using|with|from)\s+(?:my |the )?[\w' ]*(?:inbox|account|outlook|gmail|google|mail)\b.*$/, '').replace(/[?.!]+$/, '').trim();
    if (term && term.length >= 2) { lastSearch = { term, at: Date.now() }; return run('mail', 'mail', 'email search', '', term); }
  }
  if (/^(?:please\s+)?(?:check|read|any|what(?:'s| is| are)|show|do i have|tingnan|i-?check)\b/.test(tl) && /\bteams\b/.test(tl) && /\b(?:chats?|messages?|mentions?|unread|notifications?|new)\b/.test(tl) && !/\b(?:saying|send|tell)\b/.test(tl) && tl.split(/\s+/).length <= 12) return run('teams', 'chat', 'Teams chats');
  if (/\b(?:check|read|summari[sz]e|show|any|what(?:'s| is| are)|do i have|go through|scan|tingnan|i-?check)\b/.test(tl) && /\b(?:inbox|e-?mails?|mails?|unread)\b/.test(tl) && !/\b(?:send|write|compose|draft|reply|forward|delete|reminder|remind|mark|address|password|signature|settings?)\b/.test(tl) && tl.split(/\s+/).length <= 14) return run('mail', 'mail', 'inbox');
  if ((m = /^(?:please\s+)?(?:read|open|check|show me|look at|summari[sz]e|fetch|go to)\s+(https?:\/\/\S+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?)\s+(?:in|using|with|as|on|from|sa)\s+(?:my\s+|the\s+)?(.+?)(?:\s+(?:account|browser|session))?$/.exec(tl)) && !/\bchrome\b|\bsafari\b/.test(m[2])) {
    const a = pick(m[2], sources, ['outlook', 'google', 'teams', 'other']).find((s) => named(s, m[2]) || words(s.name).some((w) => m[2].includes(w))); if (!a) return { reply: `I could not tell which account "${m[2]}" is. Your accounts: ${sources.map((s) => s.name).join(', ') || 'none yet (Settings, Accounts)'}.` };
    let url = m[1]; if (!/^https?:/.test(url)) url = 'https://' + url; let r; try { r = await ctx.call('webread', { id: a.id, url }); } catch (e) { return { reply: e.message }; }
    if (r.needsLogin) return { reply: NEED(a.name) }; if (!r.ok) return { reply: `The page opened in ${a.name} but showed nothing to read.` };
    try { require('./export').setLast(`# ${r.title || url}\n\n${r.text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 120).join('\n\n')}\n`, r.title || 'Page'); } catch {}
    const v = ctx.save && r.shot ? ctx.save(`${a.name} page.png`, r.shot) : null; return { reply: await summarize('page', a.name, r, ctx), ...(v ? { views: [v] } : {}) };
  }
  if ((m = /^(?:please\s+)?(?:open|show|launch|start)(?:\s+me)?\s+(?:the\s+|your\s+|my\s+)?(?:(?:tulai'?s|tulay'?s|background|signed[- ]in|internal|built-?in|bot'?s|in-?app)\s+)+browsers?(?:\s+(?:for|of|in|as|on)\s+(?:my\s+)?(.+?))?(?:\s+account)?$/.exec(tl))) {
    const on = sources.filter((s) => s.enabled); const named = m[1] ? pick(m[1], sources, ['outlook', 'google', 'teams', 'other'])[0] : null;
    const list = named ? [named] : on.length ? on.slice(0, 3) : sources.slice(0, 1); if (!list.length) return { reply: 'You have no accounts yet. Add one in Settings, Accounts.' };
    try { for (const a of list) await ctx.call('webopen', { id: a.id }); return { reply: list.length === 1 ? `Opened Tulai's browser on your ${list[0].name} session. It is the same signed-in session I use in the background.` : `Opened Tulai's browser for ${list.map((a) => a.name).join(', ')}: one window each, each with its own sign-in.` }; } catch (e) { return { reply: e.message }; }
  }
  return null;
}
module.exports = { handle, pick };
