// "check my screen" / "explain the code on my screen": Tulai takes one picture of the screen, reads its text on this Mac (OCR), deletes the picture,
// and its own AI explains the code, points out bugs and gives the fix (or summarizes what is shown). Nothing leaves this Mac.
const fs = require('fs'), os = require('os'), path = require('path'), { execFile } = require('child_process');
const RX = /^(?:please\s+)?(?:check|read|look at|scan|explain|review|debug|fix)\s+(?:the\s+)?(?:code\s+)?(?:on\s+)?(?:my\s+|the\s+)?(?:shared\s+)?screen(?:\s+code)?$|^(?:what(?:'s| is) on my screen|explain the code on (?:my )?screen|basahin mo (?:ang )?screen ko|tingnan mo (?:ang )?screen ko)$/i;
const looksLikeCode = (t) => { const s = String(t), kw = (s.match(/\b(?:function|const|let|var|def|class|return|import|export|public|private|static|void|async|await|SELECT|FROM|WHERE|=>)\b|=>/g) || []).length, sym = (s.match(/[{};]|\)\s*\{|==|!=|\+=|\[\]/g) || []).length, lines = s.split('\n').filter((l) => /^\s{2,}\S|[{};]\s*$/.test(l)).length; return kw >= 2 && sym >= 3 && (lines >= 2 || sym >= 5); }; // real code: keywords, braces or semicolons, indented lines (chat text with a few brackets is not code)
function snap() { const f = path.join(os.tmpdir(), `tulai-screen-${Date.now()}.png`); return new Promise((res, rej) => execFile('/usr/sbin/screencapture', ['-x', '-t', 'png', f], { timeout: 15000 }, (e) => (e ? rej(new Error('I cannot see the screen yet. Allow Screen Recording for Tulai in System Settings → Privacy & Security, then try again.')) : res(f)))); }
async function explain(text, { nlu = require('./nlu') } = {}) {
  const code = looksLikeCode(text), body = String(text).slice(0, 6000);
  const sys = code ? 'The text below was read from the user\'s screen with OCR, so some characters may be wrong. It contains code. In concise Markdown: say in one line what the code does, list the real bugs or risks you can see (with the line or name), and give the fixed code in one code block. If OCR mistakes make a part unreadable, say so instead of guessing.' : 'The text below was read from the user\'s screen with OCR. Summarize what is on the screen in 2 or 3 short bullets. Do not invent details.';
  const r = await nlu.chat({ messages: [{ role: 'system', content: sys }, { role: 'user', content: body }], max_tokens: code ? 800 : 220, temperature: 0.2, timeout: 120000 });
  return { code, text: String((r && r.content) || '').trim() };
}
async function handle(raw, opts = {}) {
  if (!RX.test(String(raw || '').trim().replace(/[.!?]+$/, ''))) return null;
  let f; try { f = await (opts.snap || snap)(); } catch (e) { return { reply: e.message }; }
  let text = ''; try { text = await (opts.ocr || require('./viewer').ocr)(f); } catch (e) { return { reply: 'I could not read the screen: ' + e.message }; } finally { try { fs.rmSync(f, { force: true }); } catch {} }
  if (!String(text).trim()) return { reply: 'I took a look but found no readable text on the screen.' };
  const r = await explain(text, opts); if (!r.text) return { reply: 'I read the screen but could not explain it reliably. Try again with the code bigger on screen.' };
  return { reply: (r.code ? '**Code on your screen**\n\n' : '**On your screen**\n\n') + r.text + '\n\n_Read on this Mac with OCR; the screenshot was deleted right away._', via: 'screen-code' };
}
module.exports = { handle, explain, looksLikeCode, RX, snap };
