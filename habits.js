// What you do every day, learned on this Mac from the commands Tulai handled for you (nothing leaves the Mac, nothing is sent to a model).
// It feeds the quick buttons in the bot panel, so they are about your own routine: the things you ask at this time of day, on this weekday.
const fs = require('fs');
const path = require('path');

const file = () => path.join(process.env.GC_DATA_DIR || __dirname, 'habits.json');
const load = () => { try { const j = JSON.parse(fs.readFileSync(file(), 'utf8')); return j && j.items ? j : { items: {} }; } catch { return { items: {} }; } };
const save = (h) => { try { const t = file() + '.' + process.pid; fs.writeFileSync(t, JSON.stringify(h), { mode: 0o600 }); fs.renameSync(t, file()); } catch {} };
const COMMANDY = /^(?:open|start|stop|check|show|summari[sz]e|run|prepare|read|chat|send|go to|launch|what(?:'s| is) (?:my|on|blocked|running|next|in my|the team|the sprint)|how(?:'s| is) (?:the|my|our)|team|who(?:'s| is)|release|git|do i have|what did i|what do i|merge|generate|create|make|give me|list|write|draft)\b/;
const FAILED = /^I tried, but it failed|^I could not|^Which |^Open what|^Sorry, I|^My thinking brain|cannot|not connected yet|^Okay, I will not|^Okay\.$/i;
const SECRET = /\b(password|passcode|token|api.?key|secret|pin)\b/i;
/** "hey tulai, can you please open Teams." -> "open teams" */
function norm(text) {
  let t = String(text || '').toLowerCase().replace(/^(?:hey|hi|hello|ok|okay)\s+tul(?:ai|ay)[,.!\s]*/, '').replace(/^tul(?:ai|ay)[,.!\s]*/, '').replace(/[.!?,]+$/g, '').replace(/^(?:(?:can|could|would) you\s+)?(?:please\s+|pls\s+)?/, '').replace(/\s+(?:please|po|now|for me)$/, '').replace(/\s+/g, ' ').trim();
  const n = t.split(' ').length; if (n < 2 || n > 8 || t.length > 70) return null; return t;
}
/** Remember that you asked this (only commands that worked; never questions, secrets or small talk). */
function record(text, reply, when = new Date()) {
  const key = norm(text); if (!key || !COMMANDY.test(key) || SECRET.test(key) || FAILED.test(String(reply || ''))) return false;
  const h = load(), it = h.items[key] || { text: key.replace(/^./, (c) => c.toUpperCase()), n: 0, hours: Array(24).fill(0), days: Array(7).fill(0), last: 0 };
  it.n++; it.hours[when.getHours()]++; it.days[when.getDay()]++; it.last = when.getTime(); h.items[key] = it;
  const all = Object.entries(h.items); if (all.length > 120) for (const [k] of all.sort((a, b) => a[1].last - b[1].last).slice(0, all.length - 100)) delete h.items[k];
  save(h); return true;
}
/** The commands you most likely want right now: often asked, recently asked, and asked around this hour and on this weekday. */
function suggest(now = new Date(), limit = 5) {
  const h = now.getHours(), d = now.getDay();
  return Object.values(load().items).filter((it) => it.n >= 2).map((it) => {
    const near = [h - 1, h, h + 1].reduce((a, x) => a + it.hours[(x + 24) % 24], 0) / it.n, day = it.days[d] / it.n, age = (now.getTime() - it.last) / 864e5;
    return { text: it.text, score: it.n * Math.pow(0.96, Math.max(0, age)) * (0.4 + 2.4 * near + 0.8 * day) };
  }).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.text);
}
const forget = () => save({ items: {} });
const list = () => Object.values(load().items).sort((a, b) => b.n - a.n).map((i) => ({ text: i.text, n: i.n }));
module.exports = { record, suggest, forget, list, norm };
