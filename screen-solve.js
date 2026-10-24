// Coding interview help that checks itself: the examples shown with the problem ("Input: s = "()[]{}"  Output: true") are read from the screen,
// the bot's Python solution is run against them on this Mac (python3 -I, empty folder, 10 s), and when one fails it tries again with the failure
// (up to 3 tries). The answer then says honestly whether it passed the examples on the screen.
const { run, code: codeOf } = require('./scripts/code-exec');
/** Python literal from an example value as problems show it (JSON-like: true/false/null, strings, lists). */
const py = (v) => String(v).trim().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None').replace(/\s*\.$/, '');
/** Splits "nums = [2,7,11,15], target = 9" at the commas that are not inside brackets or quotes. */
function args(s) {
  const out = []; let depth = 0, q = '', cur = '';
  for (const ch of String(s)) { if (q) { cur += ch; if (ch === q) q = ''; continue; } if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; } if ('([{'.includes(ch)) depth++; if (')]}'.includes(ch)) depth--; if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; } cur += ch; }
  if (cur.trim()) out.push(cur); return out.map((a) => { const m = /^\s*([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/.exec(a); return m ? { name: m[1], value: py(m[2]) } : { name: null, value: py(a) }; });
}
/** The Input/Output examples on the screen: [{ args: [{name, value}], out }]. */
function examples(text) {
  const t = String(text || '').replace(/\r/g, ''), res = [];
  for (const m of t.matchAll(/Input\s*:\s*([\s\S]+?)\n?\s*Output\s*:\s*([^\n]+)/gi)) { const a = args(m[1].replace(/\n/g, ' ').trim()), out = py(m[2]); if (a.length && out) res.push({ args: a, out }); }
  return res.slice(0, 6);
}
/** One Python assert per example, calling Solution().method or the top-level function the code defines. */
function harness(src, exs) {
  const cls = /class Solution\b[\s\S]*?def ([A-Za-z_]\w*)\(self/.exec(src), fn = /^def ([A-Za-z_]\w*)\(/m.exec(src); const call = cls ? `Solution().${cls[1]}` : fn ? fn[1] : null; if (!call) return null;
  return exs.map((e, i) => `_got = ${call}(${e.args.map((a) => (a.name ? `${a.name}=${a.value}` : a.value)).join(', ')})\nif _got != (${e.out}):\n    raise SystemExit("example ${i + 1}: expected ${e.out.replace(/"/g, '\\"')}, got " + repr(_got))`).join('\n');
}
/** Runs the answer's Python against the examples: '' when all pass, else the first failure. null when it cannot be checked. */
function verify(answer, exs) {
  const src = codeOf(answer); if (!src || !exs.length || /^\s*(?:function|const|let|public|#include|func|fn) /m.test(src)) return null;
  const h = harness(src, exs); if (!h) return null;
  return run('from typing import *\nimport collections, heapq, math, itertools, bisect, functools\n' + src + '\n\n' + h + '\n');
}
/** Solve with up to `tries` attempts; each failure is shown to the brain. Returns { text, checked, passed, tries }. */
async function solve(screenText, { nlu = require('./nlu'), tries = 3 } = {}) {
  const exs = examples(screenText);
  const base = [{ role: 'system', content: 'The text below was read from the user\'s screen with OCR during a coding interview, so some characters may be wrong. If it is a coding problem, solve it: one or two sentences with the approach, then the full solution in one code block in the language the problem or editor uses (Python if none is shown; keep the given class and method names), then one line with the time and space complexity, then one sentence the user can say to explain it. If it is not a coding problem, summarize in 2 sentences what is on the screen and what the user could say about it.' }, { role: 'user', content: String(screenText).slice(0, 5000) }];
  let msgs = base.slice(), text = '', why = null, n = 0;
  for (n = 1; n <= tries; n++) {
    const r = await nlu.chat({ messages: msgs, max_tokens: 1000, temperature: n === 1 ? 0.2 : 0.5, timeout: 150000 }); text = String((r && r.content) || '').trim(); if (!text) break;
    why = verify(text, exs); if (why === null || why === '') break;
    msgs = [...base, { role: 'assistant', content: text }, { role: 'user', content: `I ran your code on the example from the screen and it failed: ${why}. Fix the bug. Give the approach, the full corrected code in one code block, and the complexity.` }];
  }
  const checked = why !== null && !!text, passed = checked && why === '';
  const note = !checked ? '' : passed ? `✅ Ran it on the ${exs.length} example${exs.length === 1 ? '' : 's'} on your screen: all pass${n > 1 ? ` (fixed on try ${n})` : ''}.\n\n` : `⚠️ My code still fails an example on your screen (${why}). Check it before you use it.\n\n`;
  return { text: text ? note + text : '', checked, passed, tries: Math.min(n, tries), examples: exs.length };
}
module.exports = { solve, verify, examples, args, harness };
