// Mood reader: spots frustration, urgency and politeness in what the person says or types, entirely on this Mac.
// Uses the VADER sentiment lexicon (MIT, github.com/cjhutto/vaderSentiment) plus English/Tagalog frustration words.
const fs = require('fs');
const path = require('path');

let lex = null;
function load() {
  if (lex) return lex; lex = new Map();
  try { for (const l of fs.readFileSync(path.join(__dirname, 'data', 'vader_lexicon.txt'), 'utf8').split('\n')) { const p = l.split('\t'); if (p.length >= 2 && !Number.isNaN(+p[1])) lex.set(p[0], +p[1]); } } catch {}
  const extra = { pangit: -2.4, sira: -1.8, ayaw: -1.4, bwisit: -2.8, nakakainis: -2.4, inis: -1.8, galit: -2.0, tanga: -2.6, bobo: -2.6, gago: -2.8, ampangit: -2.8, hirap: -1.4, mabagal: -1.6, walang: -0.8, salamat: 2.2, ayos: 1.8, galing: 2.2, maganda: 2.0, mabuti: 1.6, sige: 0.6, thanks: 1.9, useless: -2.6, stupid: -2.7, shit: -2.6, fucking: -1.2, wtf: -2.4, broken: -2.0, crap: -2.2, garbage: -2.4, idiot: -2.8, suck: -2.2, sucks: -2.2, awful: -2.6, annoying: -2.0 };
  for (const [k, v] of Object.entries(extra)) lex.set(k, v);
  return lex;
}
const NEGATE = new Set(['not', 'no', 'never', 'cannot', "can't", 'cant', "don't", 'dont', "doesn't", 'doesnt', "didn't", 'didnt', "isn't", 'isnt', "won't", 'wont', 'hindi', 'wala', 'di', 'wag']);
const BOOST = new Set(['very', 'so', 'really', 'extremely', 'fucking', 'super', 'too', 'always', 'sobrang', 'napaka', 'talaga', 'grabe']);
const PROFANITY = /\b(fuck\w*|shit\w*|wtf|stupid|idiot|damn|bullshit|crap|gago|tanga|bobo|putang\w*|bwisit|pakyu|ulol|tangina)\b/i;
const FRUSTRATION = /\b(not working|doesn'?t work|does not work|still (not|doesn'?t|broken)|again and again|keep on|i already|i said|i told you|why (is|does|did)|wtf|useless|broken|hindi gumagana|ayaw|ayaw gumana|sira|pangit|ulit ulit|paulit-ulit|nakakainis|hindi pa rin|di pa rin)\b/i;
const POLITE = /\b(please|pls|thanks|thank you|salamat|po|kindly)\b/i;

function analyze(text) {
  const t = String(text || ''); const L = load(); let sum = 0, hits = 0;
  for (const clause of t.split(/[,.;:!?\n]+/)) {
    const words = clause.toLowerCase().match(/[a-z']+/g) || [];
    words.forEach((w, i) => { let v = L.get(w); if (v === undefined) return; hits++; const prev = words.slice(Math.max(0, i - 2), i); if (prev.some((p) => NEGATE.has(p))) v *= -0.74; if (prev.some((p) => BOOST.has(p))) v *= 1.3; sum += v; });
  }
  const caps = (t.match(/\b[A-Z]{3,}\b/g) || []).length, bangs = (t.match(/!/g) || []).length;
  if (sum) sum += Math.sign(sum) * Math.min(1.5, caps * 0.5 + Math.max(0, bangs - 1) * 0.3);
  const compound = sum / Math.sqrt(sum * sum + 15);
  const signals = []; let f = Math.max(0, -compound) * 0.9;
  if (PROFANITY.test(t)) { f += 0.35; signals.push('strong words'); }
  if (FRUSTRATION.test(t)) { f += 0.3; signals.push('something is not working'); }
  if (caps >= 2) { f += 0.1; signals.push('caps'); }
  if (bangs >= 2) { f += 0.1; signals.push('exclamation'); }
  const polite = POLITE.test(t); if (polite) f -= 0.1;
  f = Math.max(0, Math.min(1, f));
  return { compound: +compound.toFixed(3), frustration: +f.toFixed(2), level: f >= 0.6 ? 'high' : f >= 0.3 ? 'medium' : 'calm', polite, positive: compound > 0.35, signals, hits };
}
module.exports = { analyze };
