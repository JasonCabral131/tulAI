// "Show me my latest screenshot", "open report.pdf", "read the text in that image", "summarize that file": the file appears in the chat.
const fs = require('fs');
const V = require('./viewer');

const EXT = 'png|jpe?g|gif|webp|svg|heic|bmp|tiff?|pdf|mp4|mov|m4v|webm|mp3|m4a|wav|aac|flac|txt|md|markdown|json|csv|tsv|log|docx?|xlsx?|pptx?|pages|numbers|key|rtf|zip|html?|js|ts|tsx|jsx|py|java|go|rb|rs|c|h|cpp|css|sql|sh|yml|yaml|xml|toml|swift|kt';
const SHOW = '(?:show|display|preview|view|render|open|pull up|let me see|can i see|bring up|find|get)';
const WHAT = '(screenshot|screen ?recording|download|image|photo|picture|pdf|file|document|video|spreadsheet|presentation)';
const NUM = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
const kindWord = (d) => ({ image: 'picture', pdf: 'PDF', video: 'video', audio: 'audio file', text: 'text file', html: 'web page', office: 'document', archive: 'zip file', other: 'file' }[d.kind] || 'file');
const pick = (list) => { const out = []; for (const f of list) { const d = V.register(f.path); if (d) out.push(d); } return out; };

/** ctx: { nlu, setPend }. Returns a reply object ({ reply, views }) or null. */
async function handle(text, tl, ctx = {}) {
  let m;
  // ----- the latest / last N of something -----
  if ((m = new RegExp(`^(?:please\\s+)?${SHOW}(?:\\s+me)?\\s+(?:(?:the|my|that)\\s+)?(?:(?:(\\d|a|one|two|three|four|five)\\s+)?(?:latest|last|newest|most recent|recent)|(\\d|two|three|four|five)\\s+(?:latest|last|newest|most recent|recent))\\s+${WHAT}s?$`).exec(tl))) {
    const n = Math.min(5, NUM[m[1] || m[2]] || 1), what = m[3], found = V.latest(what, n);
    if (!found.length) return { reply: `I could not find a recent ${what.replace(/^screen ?recording$/, 'screen recording')} in your Desktop, Downloads, Documents or Pictures.` };
    const views = pick(found); if (!views.length) return { reply: 'I found it, but it is in a place I am not allowed to show.' };
    return { reply: views.length === 1 ? `Here is your latest ${what}: ${views[0].name}.` : `Here are your last ${views.length} ${what}s.`, views };
  }
  // ----- a file by its name (with its extension) -----
  if ((m = new RegExp(`^(?:please\\s+)?${SHOW}(?:\\s+me)?\\s+(?:(?:the|my|that|file|called|named)\\s+)*["']?([\\w .()\\-]{1,80}\\.(?:${EXT}))["']?$`, 'i').exec(tl)) && !/^(?:[a-z0-9-]+\.)+(?:com|net|org|io|ph|gov|edu)$/i.test(m[1].trim())) {
    const name = m[1].trim(), found = V.byName(name); if (!found.length) return { reply: `I could not find a file called ${name} in your Desktop, Downloads, Documents, Pictures or Movies.` };
    const views = pick(found.slice(0, 1)); if (!views.length) return { reply: 'I found it, but it is in a place I am not allowed to show.' };
    return { reply: `Here is ${views[0].name}.${found.length > 1 ? ` I also found ${found.length - 1} other file${found.length > 2 ? 's' : ''} with a similar name; say the full name if you meant another.` : ''}`, views };
  }
  // ----- read the text in a picture (on this Mac, with Apple's Vision) -----
  // "what is the screenshot all about", "explain my latest screenshot", "ano laman ng screenshot": the same as reading and explaining it
  if (/^(?:please\s+)?(?:what(?:'s| is| was)\s+(?:in\s+)?(?:the|that|this|my)\s+(?:latest\s+|last\s+|newest\s+)?(?:screenshot|screen ?shot|picture|image|photo)(?:\s+(?:all\s+)?about)?|explain\s+(?:the|that|this|my)\s+(?:latest\s+|last\s+)?(?:screenshot|picture|image)|(?:ano|anong)\s+(?:ang\s+)?(?:laman|nasa|meron|sinasabi)\s+(?:ng|sa)\s+(?:screenshot|picture|larawan))\s*\??$/.test(tl)) tl = 'read the text in the screenshot';
  if (/^(?:please\s+)?(?:(?:can you|could you)\s+)?(?:read|ocr|scan|transcribe|extract)(?:\s+out)?(?:\s+(?:the\s+)?(?:text|words|writing))?(?:\s+(?:in|from|on|of))?(?:\s+(?:that|this|the|my|it))?(?:\s+(?:latest|last|newest))?(?:\s+(?:image|screenshot|picture|photo|pic|file))?(?:\s+(?:to me|for me|please))?$|^what(?:'s| does| is)(?: it| that| this)?(?: say| written)(?: (?:in|on) (?:that|this|the) (?:image|screenshot|picture|photo))?$/.test(tl) && /(?:read|ocr|scan|transcribe|extract|say|written)/.test(tl) && !/^read (?:my |the )?(?:email|mail|calendar|schedule|meeting)/.test(tl)) {
    let d = V.getLast(); if (!d || d.kind !== 'image') { const f = V.latest('screenshot', 1)[0]; d = f ? V.register(f.path) : null; }
    if (!d) return { reply: 'Show me a picture first: drop one into this chat, or say "show my latest screenshot", and then ask me to read it.' };
    const e = V.get(d.id); let file = e.path; try { if (V.NEEDS_CONVERT.has(e.ext)) file = await V.thumb(e, 2400); const t = await V.ocr(file);
      if (!t) return { reply: `I looked at ${d.name} but I cannot find any text in it.`, views: [d] };
      try { await require('./dev-rules').clip.set(t); } catch {} try { require('./export').setLast(`# Text from ${d.name}\n\n${t.split('\n').map((l) => l.trim()).filter(Boolean).join('\n\n')}\n`, 'Text from picture'); } catch {}
      const full = t.split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
      if (ctx.nlu && ctx.nlu.available && ctx.nlu.available()) {
        const out = await ctx.nlu.chat({ messages: [{ role: 'system', content: 'You read text taken from a screenshot by OCR. It is usually a chat (Teams, Slack, email) in Taglish, with names, times and file paths. Work like a careful colleague. Rules: speaker names appear before their messages; every message belongs to the nearest name above it, and an unnamed message that follows is from the person who replied. Never swap who said what. Reply in markdown with exactly these parts. **What this is**: one sentence: the kind of screen, who talks to whom, and the topic. **What it says**: a short list in time order, each line as "Name (time): what they said", with the meaning in plain English after an arrow when the message is Tagalog; keep file paths, ticket ids and numbers exactly. **What needs doing**: each request or question, who has to do it (name it), and any deadline; if there is none say "Nothing is asked." Use only what is written, never invent. No preamble.' }, { role: 'user', content: full.slice(0, 7000) }], max_tokens: 700, temperature: 0.1, timeout: 90000 }).catch(() => null);
        const g = out && String(out.content || '').replace(/^\s*(?:sorry about that|sure|certainly|of course|here(?:'s| is)[^\n]*?)[.!:]\s*/i, '').replace(/(\*\*What needs doing\*\*:?[^\n]*?\S)\s*Nothing is asked\.?/i, '$1').trim(); if (g && g.length > 40) return { reply: `${g}\n\n_${full.length} characters read from ${d.name}; the exact text is on your clipboard._`, views: [d] };
      }
      return { reply: `Here is the text I read in ${d.name} (my thinking brain is not ready to explain it, so this is the raw text):\n\n${full.slice(0, 1800)}${full.length > 1800 ? '\n…' : ''}\n\nIt is on your clipboard (${full.length} characters).`, views: [d] };
    } catch (err) { return { reply: `I could not read that picture: ${err.message}` }; }
  }
  // ----- summarize / explain the file that is on screen -----
  if (/^(?:please\s+)?(?:summari[sz]e|explain|tl;?dr|what(?:'s| is) in|review|read)\s+(?:(?:that|this|the)\s+)(?:file|document|text|code|script|log|csv|json|pdf|doc|spreadsheet)$/.test(tl)) {
    const d = V.getLast(); if (!d) return { reply: 'Show me the file first (drop it here, or say its name), then ask me to summarize it.' };
    if (d.kind === 'text') {
      const t = V.readText(V.get(d.id), 6000); if (!t) return { reply: 'That does not look like a text file.' };
      if (ctx.nlu && ctx.nlu.available && ctx.nlu.available()) { const r = await ctx.nlu.chat({ messages: [{ role: 'system', content: 'You are a senior engineer helping by voice. Summarize the file the person shows you in at most four short spoken sentences: what it is, what matters in it, anything that looks wrong. No markdown, no lists.' }, { role: 'user', content: `File ${d.name}:\n\n${t.text}` }], max_tokens: 220, temperature: 0.2, timeout: 45000 }).catch(() => null); const out = r && String(r.content || '').replace(/[*_`#]+/g, '').trim(); if (out) return { reply: out + (t.truncated ? ' (I read the first part of a long file.)' : ''), views: [] }; }
      return { reply: 'My thinking brain is not ready yet. Try again in a moment.' };
    }
    return { reply: `I can show ${d.name}, but this reader could not extract the contents of this ${kindWord(d)}.`, offerTask: `Read the file at ${V.get(d.id).path} and summarize it for me: what it is, the key points, and anything I should act on.` };
  }
  return null;
}
module.exports = { handle };
