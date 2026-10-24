/* Rich messages for the Tulai Bot panel: safe markdown (headings, lists, tables, code, links), bar charts and file cards.
   Everything is escaped first. Pictures are only shown when they are files Tulai itself made (/api/bot/file); a picture "written" inside a
   model's answer (such as a made-up base64 image) is never drawn, because it is not real. */
(function (root) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SAFE_IMG = /^\/api\/bot\/(?:file\?name=[A-Za-z0-9%._() -]+|(?:view|thumb)\?id=[A-Za-z0-9_-]+)$/;
  function inline(raw) {
    let s = esc(raw).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => { const u = src.replace(/&amp;/g, '&'); return SAFE_IMG.test(u) ? `<img class="rimg" alt="${alt}" src="${esc(u)}">` : `<span class="rnoimg" title="Not a real picture, so I did not draw it">[picture removed: ${alt || 'image'}]</span>`; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, t, u) => `<a href="${u}" data-ext="${u}">${t}</a>`);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
    return s;
  }
  function html(text) {
    const L = String(text || '').replace(/\r/g, '').split('\n'); let out = '', i = 0;
    while (i < L.length) {
      const l = L[i];
      if (/^```/.test(l)) { const code = []; i++; while (i < L.length && !/^```/.test(L[i])) code.push(L[i++]); i++; out += `<pre><code>${esc(code.join('\n'))}</code></pre>`; continue; }
      if (!l.trim()) { i++; continue; }
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { out += `<h${m[1].length + 2} class="rh">${inline(m[2])}</h${m[1].length + 2}>`; i++; continue; }
      if (/^\s*([-*_])\1\1+\s*$/.test(l)) { out += '<hr>'; i++; continue; }
      if (l.includes('|') && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || '')) {
        const row = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()), head = row(l); i += 2; let body = '';
        while (i < L.length && L[i].includes('|') && L[i].trim()) body += '<tr>' + row(L[i++]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
        out += `<div class="rtable"><table><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${body}</table></div>`; continue;
      }
      if (/^\s*(?:[-*+]|\d+\.)\s+/.test(l)) { const ord = /^\s*\d+\./.test(l); let b = ''; while (i < L.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(L[i])) b += `<li>${inline(L[i++].replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''))}</li>`; out += ord ? `<ol>${b}</ol>` : `<ul>${b}</ul>`; continue; }
      const p = []; while (i < L.length && L[i].trim() && !/^(```|#{1,4}\s|\s*(?:[-*+]|\d+\.)\s)/.test(L[i]) && !(L[i].includes('|') && /^\s*\|?\s*:?-{2,}/.test(L[i + 1] || ''))) p.push(L[i++]);
      out += `<p>${inline(p.join('\n')).replace(/\n/g, '<br>')}</p>`;
    }
    return out || '';
  }
  /** spec: { title, labels, values, unit } or { title, rows: [{label, value}] } */
  function chart(spec) {
    const rows = spec.rows ? spec.rows.map((r) => ({ l: r.label, v: +r.value })) : (spec.labels || []).map((l, i) => ({ l, v: +spec.values[i] })); const R = rows.filter((r) => Number.isFinite(r.v)); if (!R.length) return '';
    const max = Math.max(...R.map((r) => r.v), 1), unit = spec.unit ? ' ' + esc(spec.unit) : '';
    return `<div class="rchart"><div class="rct">${esc(spec.title || spec.kind || 'Chart')}</div>${R.map((r) => `<div class="rcrow"><span class="rcl" title="${esc(r.l)}">${esc(String(r.l).slice(0, 34))}</span><span class="rcbar"><i style="width:${Math.max(2, Math.round((r.v / max) * 100))}%"></i></span><span class="rcv">${esc(String(+r.v.toFixed(2)))}${unit}</span></div>`).join('')}</div>`;
  }
  const ICON = { xlsx: '📊', csv: '🧾', pptx: '📽️', pdf: '📕', html: '🌐' };
  function attachment(f) {
    const n = encodeURIComponent(f.name), url = `/api/bot/file?name=${n}`, p = f.preview || {};
    let prev = '';
    if (p.type === 'table') prev = `<div class="rtable"><table><tr>${p.head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${p.rows.map((r) => `<tr>${p.head.map((_, i) => `<td>${esc(r[i] === undefined ? '' : r[i])}</td>`).join('')}</tr>`).join('')}</table>${p.more ? `<div class="rmore">+ ${p.more} more rows in the file</div>` : ''}</div>`;
    else if (p.type === 'slides') prev = `<ol class="rslides">${p.titles.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
    const canView = f.ext === 'html' || f.ext === 'pdf';
    return `<div class="rfile" data-name="${esc(f.name)}"><div class="rfh"><span class="rfi">${ICON[f.ext] || '📄'}</span><span class="rfn"><b>${esc(f.name)}</b><small>${esc(f.label || f.ext.toUpperCase())}</small></span></div>${prev}<div class="rfb">${canView ? `<button type="button" data-preview="${n}" data-ext-kind="${f.ext}">Preview here</button>` : ''}<button type="button" data-open="${n}">Open</button><button type="button" data-reveal="${n}">Show in Finder</button></div><div class="rfp"></div></div>`;
  }
  function previewFrame(name, kind) { return `<iframe class="rframe"${kind === 'pdf' ? '' : ' sandbox="allow-same-origin"'} referrerpolicy="no-referrer" src="/api/bot/file?name=${encodeURIComponent(name)}${kind === 'pdf' ? '#toolbar=0' : ''}" title="${esc(name)}"></iframe>`; }
  const VICON = { image: '🖼️', pdf: '📕', video: '🎞️', audio: '🎵', text: '📝', html: '🌐', office: '📄', archive: '🗜️', other: '📎' };
  /** A file you can look at inside the chat. d: { id, name, ext, kind, size } from /api/bot/upload or a "views" event. */
  function viewCard(d) {
    const id = encodeURIComponent(d.id), src = `/api/bot/view?id=${id}`; let body = '';
    if (d.kind === 'image') body = `<img class="rimg rzoom" alt="${esc(d.name)}" src="${src}" loading="lazy" title="Click to make it bigger">`;
    else if (d.kind === 'video') body = `<video class="rmedia" controls preload="metadata" src="${src}"></video>`;
    else if (d.kind === 'audio') body = `<audio class="raudio" controls preload="metadata" src="${src}"></audio>`;
    else if (d.kind === 'pdf') body = `<iframe class="rframe" referrerpolicy="no-referrer" src="${src}#toolbar=0" title="${esc(d.name)}"></iframe>`;
    else if (d.kind === 'html') body = `<iframe class="rframe" sandbox referrerpolicy="no-referrer" src="${src}" title="${esc(d.name)}"></iframe>`;
    else if (d.kind === 'office') body = `<img class="rimg rzoom" alt="First page of ${esc(d.name)}" src="/api/bot/thumb?id=${id}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'rmore',textContent:'No preview for this document. Use Open.'}))" title="Click to make it bigger">`;
    else if (d.kind === 'text' || d.kind === 'archive') body = `<pre class="rtext" data-textfor="${id}"><code>Loading…</code></pre>`;
    else body = '<div class="rmore">This kind of file has no preview here. Use Open.</div>';
    const guide = ['image','pdf','office','text'].includes(d.kind)?`<button type="button" data-say="explain document ${id}">Explain page by page</button>`:'';
    const reads = d.kind === 'image' ? `<button type="button" data-say="read the text in that image">Read the text in it</button>` : d.kind === 'text' || d.kind === 'pdf' || d.kind === 'office' ? `<button type="button" data-say="summarize that file">Summarize it</button>` : '';
    return `<div class="rfile rview" data-vid="${id}"><div class="rfh"><span class="rfi">${VICON[d.kind] || '📎'}</span><span class="rfn"><b>${esc(d.name)}</b><small>${esc(d.kind)} · ${esc(typeof d.size === 'number' ? (d.size >= 1048576 ? (d.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(d.size / 1024)) + ' KB') : d.size || '')}</small></span></div>${body}<div class="rfb">${guide}${reads}<button type="button" data-vopen="${id}">Open</button><button type="button" data-vreveal="${id}">Show in Finder</button></div></div>`;
  }
  /** Text and archive previews are filled in after the card is drawn. */
  async function fillText(root) {
    for (const pre of (root || document).querySelectorAll('pre[data-textfor]')) { const id = pre.dataset.textfor; pre.removeAttribute('data-textfor'); try { const i = await (await fetch(`/api/bot/viewinfo?id=${id}`)).json(); const code = pre.querySelector('code');
      if (i.files) code.textContent = `${i.count} file${i.count === 1 ? '' : 's'} inside:\n` + i.files.join('\n') + (i.count > i.files.length ? `\n… and ${i.count - i.files.length} more` : ''); else if (i.binary) code.textContent = 'This is not a text file. Use Open.'; else code.textContent = String(i.text || '').split('\n').slice(0, 80).join('\n') + (i.truncated || String(i.text || '').split('\n').length > 80 ? '\n…' : ''); } catch { pre.querySelector('code').textContent = 'I could not load the preview.'; } }
  }
  root.TulaiRich = { html, chart, attachment, previewFrame, viewCard, fillText, esc };
})(typeof window === 'undefined' ? globalThis : window);
