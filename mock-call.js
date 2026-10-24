// Mock calls (practice): "start a mock interview for a frontend developer" or "practice a sales call about renewals". Tulai's own AI plays the other side:
// it asks one question at a time, gives short feedback on each answer, and ends with a summary. "end mock" stops it. Nothing leaves this Mac.
let s = null; // { topic, kind, questions, i, answers: [{q, a, fb}] }
const START = /^(?:start|begin|do|let'?s do|i want)\s+(?:a\s+)?(?:mock|practice)\s+(interview|call|meeting|sales call|client call|demo)(?:\s+(?:for|about|on|as)\s+(.+))?$|^practi[cs]e\s+(?:a\s+)?(interview|call|sales call|client call|meeting)(?:\s+(?:for|about|on|as)\s+(.+))?$/i;
async function ask(nlu, messages, max = 400) { const r = await nlu.chat({ messages, max_tokens: max, temperature: 0.4, timeout: 90000 }); return String((r && r.content) || '').trim(); }
async function handle(raw, { nlu = require('./nlu') } = {}) {
  const t = String(raw || '').trim(), tl = t.toLowerCase().replace(/[.!?]+$/, '');
  if (s && /^(?:end|stop|finish|quit)\s+(?:the\s+)?(?:mock|practice)(?:\s+\w+)?$/.test(tl)) return finish(nlu);
  const m = START.exec(tl);
  if (m) {
    const kind = m[1] || m[3] || 'call', topic = (m[2] || m[4] || 'general work').trim();
    let qs = await ask(nlu, [{ role: 'system', content: 'You prepare a realistic practice ' + kind + '. Write exactly 5 questions the other person would ask, one per line, numbered 1 to 5. Mix easy and hard. No answers.' }, { role: 'user', content: 'Topic: ' + topic }]);
    const questions = qs.split('\n').map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim()).filter((l) => l.length > 8).slice(0, 5);
    if (!questions.length) return { reply: 'I could not prepare the practice questions right now. Try again in a moment.' };
    s = { kind, topic, questions, i: 0, answers: [] };
    return { reply: `**Mock ${kind}: ${topic}** (${questions.length} questions). Answer like you would in the real ${kind}; I give short feedback after each one. Say **end mock** to stop.\n\n**Question 1:** ${questions[0]}`, via: 'mock' };
  }
  if (!s) return null;
  const q = s.questions[s.i], fb = await ask(nlu, [{ role: 'system', content: 'You coach the user in a practice ' + s.kind + ' about ' + s.topic + '. Talk to them directly as "you" (never "they"). Give feedback on their answer in 3 short bullets: what was good, what to improve, and one better phrasing. Only use what they actually said; be kind and specific.' }, { role: 'user', content: `Question: ${q}\nTheir answer: ${t}` }], 260);
  s.answers.push({ q, a: t, fb }); s.i++;
  if (s.i >= s.questions.length) { const out = await finish(nlu); return { reply: `**Feedback**\n${fb}\n\n${out.reply}`, via: 'mock' }; }
  return { reply: `**Feedback**\n${fb}\n\n**Question ${s.i + 1}:** ${s.questions[s.i]}`, via: 'mock' };
}
async function finish(nlu) {
  const cur = s; s = null; if (!cur || !cur.answers.length) return { reply: 'Mock stopped. No answers to review.' };
  const sum = await ask(nlu, [{ role: 'system', content: 'Summarize this practice ' + cur.kind + ' for the user, talking to them as "you": 2 strengths and 2 things to improve, based only on their answers below, and a score out of 10 with one sentence why. Short Markdown.' }, { role: 'user', content: cur.answers.map((x, k) => `Q${k + 1}: ${x.q}\nA: ${x.a}`).join('\n\n') }], 320);
  return { reply: `**Mock ${cur.kind} finished** (${cur.answers.length} of ${cur.questions.length} answered)\n\n${sum || 'Good practice. Try again with more specific examples.'}`, via: 'mock' };
}
module.exports = { handle, active: () => !!s, _reset: () => { s = null; } };
