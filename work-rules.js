// Voice rules for a software engineer's day: Jira status, reports by labels, merge request reviews, email, standup, meeting summaries.
// Small things are answered right here (reading Jira is cheap and needs no AI). Real analysis (reviewing code, writing a report, going through
// email) is handed to Tulai Desktop with a clear brief and the right skill, because that needs the company AI.
const fs = require('fs');
const path = require('path');
const work = require('./work');

const cfgFile = () => path.join(process.env.GC_DATA_DIR || __dirname, 'config.json');
const readCfg = () => { try { return JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch { return {}; } };
const NOT_JIRA = 'Jira is not connected yet. Open Tulai Desktop, Settings, Work tools, and add your Jira address and token. I can also open Jira in your browser if you say open Jira.';
const NOT_GITLAB = 'GitLab is not connected yet, so I will ask Tulai Desktop to use the browser instead.';
const MR = '(?:mrs?|m\\.r\\.|mister|merge requests?|pull requests?|prs?)';
const cap = (s) => String(s).replace(/\b\w/g, (c) => c.toUpperCase());

function jiraSpoken(issues) {
  if (!issues.length) return 'You have no open Jira issues assigned to you.';
  const by = new Map(); for (const i of issues) by.set(i.status, (by.get(i.status) || 0) + 1);
  const parts = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([s, n]) => `${n} ${s}`);
  const today = new Date().toISOString().slice(0, 10), overdue = issues.filter((i) => i.due && i.due < today);
  const top = issues[0];
  return `You have ${issues.length} open Jira issue${issues.length === 1 ? '' : 's'}: ${parts.join(', ')}.${overdue.length ? ` Overdue: ${overdue.slice(0, 4).map((i) => i.key).join(', ')}.` : ''} Most recently updated: ${top.key}, ${top.summary.slice(0, 70)}.`;
}
const cleanLabels = (s) => String(s).split(/\s*(?:,|\band\b|\bat\b|\btapos\b|\bsaka\b|\/|&)\s*/i).map((x) => x.replace(/^(?:the|labels?|label|yung|ang)\s+/i, '').replace(/[."']+/g, '').trim()).filter((x) => x && x.length < 40 && !/^(for|of|ng|sa|na)$/i.test(x));

/** ctx: { sid, setPend, chromeOpen, meeting }. Returns a reply object or null. */
async function handle(text, tl, ctx) {
  const cfg = readCfg(), on = work.connected(cfg); let m;

  // ----- open Jira -----
  if (/^(?:open|launch|go to|show|buksan)(?: up)?(?: my| the| ang)? jira(?: board| website| site| page)?$/.test(tl)) {
    const url = (cfg.jira && cfg.jira.baseUrl) || ''; if (!url) return { reply: 'I do not know your Jira address yet. Add it in Tulai Desktop, Settings, Work tools.' };
    return ctx.chromeOpen(ctx.sid, { url, message: 'Opened Jira' });
  }

  // ----- a high-level report by labels -----
  if (/\bjira\b|\blabels?\b/.test(tl) && /\blabels?\b/.test(tl) && /(?:report|output|summary|summari[sz]e|overview|status|high[- ]level|create|make|write|gumawa|buod)/.test(tl) && (m = /\blabels?\s*(?:of|are|is|like|na|ay|:)?\s*(.+)$/.exec(tl))) {
    const labels = cleanLabels(m[1]); if (labels.length) {
      let data = '';
      if (on.jira) { try { const issues = await work.jiraByLabels(cfg, labels); data = work.jiraByLabelReport(issues, labels) + '\n\nIssues:\n' + issues.slice(0, 60).map((i) => `${i.key} | ${i.status} | ${i.assignee} | ${i.priority} | ${i.due || '-'} | ${i.labels.join(',')} | ${i.summary}`).join('\n'); } catch (e) { return { reply: `I could not read Jira: ${e.message}` }; } }
      const brief = `Use the jira-label-report skill. Create a high-level report for these Jira labels: ${labels.join(', ')}.${data ? '\n\nHere is the Jira data I already fetched:\n' + data.slice(0, 12000) : '\n\nJira is not connected as an API here, so open Jira in the Browser tab and read the issues with these labels.'}\n\nMy request, word for word: "${text}"`;
      return { delegate: brief, reply: on.jira ? `I read your Jira for the labels ${labels.join(' and ')} and I am asking Tulai Desktop to write the high-level report.` : `Jira is not connected, so I am asking Tulai Desktop to open Jira in the browser and make the report for ${labels.join(' and ')}.` };
    }
  }

  // ----- Jira status -----
  if (/\bjira\b/.test(tl) && /(?:status|statuses|tickets?|issues?|assigned|my work|my tasks?|workload|backlog|how many)/.test(tl) && /(?:check|show|what|list|summari[sz]e|tell|how|ano|tingnan|read|any|give)/.test(tl)) {
    if (!on.jira) return { reply: NOT_JIRA };
    try { const issues = await work.jiraMine(cfg, 60); return { reply: jiraSpoken(issues), detail: work.jiraSummary(issues) }; } catch (e) { return { reply: `I could not read Jira: ${e.message}` }; }
  }

  // ----- review a merge request -----
  if (new RegExp(`\\b${MR}\\b`).test(tl) && /(?:review|check|look at|inspect|tingnan|i-?review|suriin|feedback)/.test(tl)) {
    const who = (new RegExp(`${MR}(?:s)?\\s*(?:of|from|by|ni|ng|nila|ni)?\\s+([a-z][a-z.'-]{1,30}(?:\\s+[a-z][a-z.'-]{1,30})?)`).exec(tl) || new RegExp(`(?:of|from|by|ni|ng)\\s+([a-z][a-z.'-]{1,30})`).exec(tl) || [])[1] || '';
    const name = who.replace(/\b(please|po|now|today|and|then|tapos|mo|ang|yung|the|my)\b/g, '').trim();
    let list = '', count = 0;
    if (on.gitlab) { try { const mrs = await work.gitlabMRs(cfg, { author: name }); count = mrs.length; if (!mrs.length) return { reply: `${cap(name || 'You')} has no open merge requests that I can see.` }; list = mrs.map((x) => `- project ${x.project}, iid ${x.iid}: ${work.mrLine(x)} ${x.url}`).join('\n'); } catch (e) { return { reply: `I could not read GitLab: ${e.message}` }; } }
    const brief = `Use the mr-review skill. Review the open merge requests${name ? ' by ' + cap(name) : ''}.${list ? '\n\nThese are the open merge requests I found (read each one with gitlab_api: GET /api/v4/projects/PROJECT/merge_requests/IID/changes):\n' + list : '\n\nGitLab is not connected here. Find the merge requests in the Browser tab (or use github_api if the work is on GitHub).'}\n\nDo not post any comment, approval or merge. End with a verdict per merge request and offer to draft review comments.\n\nMy request, word for word: "${text}"`;
    return { delegate: brief, reply: on.gitlab ? `${cap(name || 'You')} has ${count} open merge request${count === 1 ? '' : 's'}. I am asking Tulai Desktop to review ${count === 1 ? 'it' : 'them'} and I will not post anything.` : `${NOT_GITLAB} It will review the merge requests${name ? ' of ' + cap(name) : ''} and post nothing.` };
  }

  // ----- check my email -----
  if (/\b(?:e-?mails?|inbox|mail)\b/.test(tl) && /(?:check|read|go through|summari[sz]e|tingnan|i-?check|any new|do i have|what(?:'s| is) in|triage|ano ang)/.test(tl) && !/\b(?:send|write|compose|draft)\b/.test(tl)) {
    return { agent: { task: `Go through my email inbox (Outlook on the web) in the browser: list what is urgent, what needs a reply and what is FYI, and draft replies without sending anything. My request: "${text}"` }, reply: '', via: 'coding agent' }; // the bot's own agent and browser, never a Desktop hand-off
  }

  // ----- standup / plan my day -----
  const STANDUP_EN = /\b(?:stand-?up|daily scrum|my day|plan for today|today'?s plan|work on today|should i work on|what do i do today)\b/.test(tl) && /(?:write|prepare|create|give me|make|plan|help me|ready|gumawa|buuin|do my|draft)/.test(tl);
  const STANDUP_TL = /\b(?:gagawin ko|dapat kong gawin|uunahin ko|trabaho ko)\b.*\b(?:ngayon|ngayong|today|araw)\b|\b(?:ngayon|ngayong|today)\b.*\b(?:gagawin ko|dapat kong gawin|uunahin ko)\b/.test(tl);
  if ((STANDUP_EN || STANDUP_TL) && !/\b(?:what should i say|what do i say|how do i|how should i|paano|ano ang sasabihin)\b/.test(tl)) {
    if (!on.jira) return { reply: 'Connect Jira in Tulai Desktop (Settings → Work tools) and I will build your standup from your tickets.' };
    let mine = []; try { mine = await work.jiraMine(cfg, 40); } catch (e) { return { reply: `I could not read Jira: ${e.message}` }; }
    const now = Date.now(), day = 864e5, upd = (i) => Date.parse(i.updated) || 0, st = (i) => String(i.status || '');
    const yesterday = mine.filter((i) => now - upd(i) < 1.5 * day), doing = mine.filter((i) => /progress|develop|review|qa|test/i.test(st(i))), next = mine.filter((i) => !/progress|develop|review|qa|test|done|closed/i.test(st(i))).slice(0, 3), blocked = mine.filter((i) => /block|hold|waiting/i.test(st(i)));
    const L = (xs) => (xs.length ? xs.map((i) => `- ${i.key} ${i.summary} (${i.status})`).join('\n') : '- (none)');
    return { reply: `**My standup**\n\n**Yesterday** (tickets I moved in the last day)\n${L(yesterday)}\n\n**Today**\n${L(doing.length ? doing : next)}\n\n**Blockers**\n${L(blocked)}\n\n_Built from your Jira tickets on this Mac; say what to add or change._`, via: 'standup' };
  }

  // ----- meeting summary / minutes -----
  const mt = ctx.meeting;
  if (mt && (/\b(?:summary|summari[sz]e|summarise|minutes|mom|recap|buod|notes)\b/.test(tl) && /\bmeeting\b/.test(tl) && /(?:create|make|write|give|gumawa|do|prepare|get|need|want|can you|please|summari|buod|i-?summari)/.test(tl))) {
    if (mt.isRecording()) return require('./human-rules').meeting('summary of the meeting so far', mt) || { reply: 'Still recording. Say "stop meeting notes" for the full minutes.' }; // a summary never stops the recording
    return minutes(mt);
  }
  return null;
}

/** Proper minutes from the last meeting's notes, made on this Mac with our trained AI: key points, decisions, action items, open questions, and one
 Jira ticket draft per action item (copy into Jira). Never a Desktop hand-off. */
function minutes(mt = require('./meeting')) {
  const last = mt.lastFull ? mt.lastFull() : null; if (!last) return { reply: 'I have no meeting notes yet. Say "start meeting notes" when a meeting begins.' };
  const sm = last.summary || {}, acts = sm.actions || [];
  const draft = (a) => { const m = /^([^:]{2,40}):\s*(.+?)(?:\s*\(([^)]+)\))?\.?$/.exec(a); return m ? `- **${m[2].replace(/^\w/, (c) => c.toUpperCase())}** · Assignee: ${/^someone$/i.test(m[1]) ? 'to decide' : m[1]}${m[3] ? ` · Due: ${m[3]}` : ''} · Type: Task` : `- **${a}** · Type: Task`; };
  return { reply: `**Minutes · ${last.title}**${last.duration ? ` (${last.duration})` : ''}${last.byAI ? '' : '\n\n_The AI notes are still being written; ask again in a minute for the full version._'}\n\n${require('./human-rules').notesText(sm)}\n\n**Jira ticket drafts** (one per action item; copy them into Jira)\n${acts.length ? acts.map(draft).join('\n') : '- No action items were recorded.'}\n\nNotes file: \`${last.file}\``, via: 'meeting minutes' };
}
/** The answer to "turn it into proper minutes?" (kept for old pending questions): the minutes, made here. */
function polish(file) { return minutes(); }
module.exports = { handle, polish, minutes, jiraSpoken, cleanLabels };
