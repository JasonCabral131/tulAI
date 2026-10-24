// What Tulai learns about how you work. Everything stays in profile.json on this Mac; it never leaves and you can reset it.
const fs = require('fs');
const path = require('path');

const FILE = () => path.join(process.env.GC_DATA_DIR || __dirname, 'profile.json');
let P = null;
const fresh = () => ({ since: Date.now(), events: [], counts: { say: 0, local: 0, model: 0, failed: 0, repeats: 0, calm: 0, medium: 0, high: 0 }, hours: Array(24).fill(0), targets: {}, phrases: {}, lastFrustrated: 0 });
function load() { if (P) return P; try { P = { ...fresh(), ...JSON.parse(fs.readFileSync(FILE(), 'utf8')) }; } catch { P = fresh(); } return P; }
let timer = null;
const save = () => { clearTimeout(timer); timer = setTimeout(() => { try { fs.writeFileSync(FILE(), JSON.stringify(P)); } catch {} }, 600); };
const norm = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const sim = (a, b) => { const A = new Set(norm(a).split(' ')), B = new Set(norm(b).split(' ')); let i = 0; for (const x of A) if (B.has(x)) i++; return i / Math.max(1, Math.max(A.size, B.size)); };

/** Call when a request arrives. Returns hints: { repeated, mood, hint } */
function seen(text, mood) {
  const p = load(), now = Date.now(); const prev = p.events[p.events.length - 1];
  const repeated = !!(prev && now - prev.t < 90000 && sim(prev.text, text) >= 0.6);
  p.counts.say++; p.counts[mood.level]++; if (repeated) p.counts.repeats++; p.hours[new Date().getHours()]++;
  if (mood.level !== 'calm') p.lastFrustrated = now;
  p.events.push({ t: now, text: String(text).slice(0, 140), level: mood.level, repeated }); if (p.events.length > 300) p.events.splice(0, p.events.length - 300);
  const k = norm(text).split(' ').slice(0, 8).join(' '); if (k) p.phrases[k] = (p.phrases[k] || 0) + 1;
  save(); return { repeated, recentFrustration: now - p.lastFrustrated < 10 * 60000 };
}
function outcome(kind, text, ok = true, target) {
  const p = load(); if (kind === 'local') p.counts.local++; else p.counts.model++; if (!ok) p.counts.failed++;
  if (target) p.targets[target] = (p.targets[target] || 0) + 1; const e = p.events[p.events.length - 1]; if (e) { e.how = kind; e.ok = ok; } save();
}
function insights() {
  const p = load(), c = p.counts, top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const peak = p.hours.indexOf(Math.max(...p.hours));
  const handled = c.local + c.model || 1, localPct = Math.round((c.local / handled) * 100);
  const tips = [];
  if (c.say >= 5 && c.repeats / c.say > 0.2) tips.push('You often have to repeat yourself. Try Settings → Train my voice, or speak closer to the microphone.');
  if (c.say >= 5 && c.high / c.say > 0.15) tips.push('Some requests sounded frustrating. Tell Tulai what went wrong and it will remember.');
  if (c.local >= 5) tips.push(`${localPct}% of your requests ran on this Mac without using any tokens.`);
  const topPhrases = top(p.phrases, 5).filter(([, n]) => n >= 2);
  if (topPhrases.length) tips.push(`You often say: ${topPhrases.map(([k]) => `"${k}"`).join(', ')}.`);
  return { since: p.since, requests: c.say, handledLocally: c.local, askedModel: c.model, failed: c.failed, repeated: c.repeats, calm: c.calm, medium: c.medium, high: c.high, busiestHour: c.say ? peak : null, topTargets: top(p.targets, 5), tips };
}
function reset() { P = fresh(); save(); return true; }
module.exports = { seen, outcome, insights, reset };
