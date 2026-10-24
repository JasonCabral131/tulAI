// Captures the moments in your REAL chats where the bot got it wrong, so they become new conversation tests (scenarios.js) and training fixes:
// you said it was wrong, you got frustrated, you asked the same thing again, or the bot had no answer. Saved on this Mac only (training/missed.jsonl).
const fs = require('fs'), path = require('path');
const file = () => path.join(process.env.GC_DATA_DIR || path.join(require('os').homedir(), 'Library', 'Application Support', 'gateway-chat'), 'training', 'missed.jsonl');
const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
/** Why this message says the bot's last reply missed: 'corrected' | 'frustrated' | 'repeated' | '' */
function kind(text, prevAsk, recent = true) {
  const t = norm(text);
  if (/^(?:no|nope|hindi|mali)\b|\b(?:that'?s|that is|it'?s|its) (?:wrong|not right|incorrect)|\bwrong\b|\bmali (?:yan|ka|iyan)\b|\bhindi (?:yan|ganyan|iyan|ito)\b|\bi meant\b|\bnot what i (?:asked|meant)\b/.test(t)) return 'corrected';
  if (/\b(?:stupid|idiot|dumb|useless|tanga|bobo|gago|tangina|putang|inutil|walang kwenta|not working|hindi gumagana|nothing works|wtf)\b/.test(t)) return 'frustrated';
  const p = norm(prevAsk); if (recent && p && t.length > 3 && (t === p || (/\b(?:again|ulit)\b/.test(t) && p.split(' ').filter((w) => w.length > 3 && t.includes(w)).length >= 2))) return 'repeated';
  return '';
}
function note(entry) {
  try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.appendFileSync(file(), JSON.stringify({ at: Date.now(), ...entry, asked: String(entry.asked || '').slice(0, 400), got: String(entry.got || '').slice(0, 400), then: String(entry.then || '').slice(0, 300) }) + '\n', { mode: 0o600 });
    const lines = fs.readFileSync(file(), 'utf8').trim().split('\n'); if (lines.length > 500) fs.writeFileSync(file(), lines.slice(-500).join('\n') + '\n', { mode: 0o600 }); } catch {}
}
/** Called for every real message, with the chat so far: records the last exchange when this message says it missed. */
function observe(text, history, lastAt = Date.now()) { // lastAt: when the last exchange happened; asking again hours later is a new request, not a repeat
  const h = (history || []).filter((m) => m && typeof m.content === 'string'); const lastBot = [...h].reverse().find((m) => m.role === 'assistant'), lastYou = [...h].reverse().find((m) => m.role === 'user');
  if (!lastBot || !lastYou) return '';
  const k = kind(text, lastYou.content, Date.now() - lastAt < 10 * 60000); if (k) note({ kind: k, asked: lastYou.content, got: lastBot.content, then: text }); return k;
}
const list = (n = 20) => { try { return fs.readFileSync(file(), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(-n).reverse(); } catch { return []; } };
module.exports = { kind, note, observe, list };
