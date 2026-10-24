// Tulai's in-chat terminal (both windows): a real shell in a panel, for logging in to your AI tools (claude, codex login, qwen, gemini),
// installing them, or any command. TulaiTerminal.open({ tool: 'claude' }) runs that tool's login; { install: 'codex' } installs it.
(function () {
  let loaded = null;
  const load = () => loaded || (loaded = new Promise((resolve, reject) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/vendor/xterm.css'; document.head.appendChild(css);
    const a = document.createElement('script'); a.src = '/vendor/xterm.js'; a.onerror = reject;
    a.onload = () => { const b = document.createElement('script'); b.src = '/vendor/xterm-addon-fit.js'; b.onload = resolve; b.onerror = reject; document.head.appendChild(b); };
    document.head.appendChild(a);
  }));
  const post = (p, body) => fetch(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-tulai-ui': '1' }, body: JSON.stringify(body) }).then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || 'The terminal did not start.'); return j; });
  const style = `#tulaiTerm{position:fixed;left:12px;right:12px;bottom:12px;height:min(46vh,420px);z-index:9999;background:#0d1117;border:1px solid #30363d;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.45);display:flex;flex-direction:column;overflow:hidden}
#tulaiTerm header{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#161b22;color:#c9d1d9;font:12px -apple-system,system-ui,sans-serif;cursor:default}
#tulaiTerm header b{flex:1;font-weight:600}#tulaiTerm header button{background:transparent;border:1px solid #30363d;color:#c9d1d9;border-radius:6px;padding:2px 8px;font-size:12px;cursor:pointer}
#tulaiTerm .tt-body{flex:1;padding:6px 8px;min-height:0}#tulaiTerm .tt-note{padding:4px 10px;color:#8b949e;font:11px -apple-system,system-ui,sans-serif;border-top:1px solid #21262d}`;
  let cur = null; // { id, term, es, el, fit }
  function close() { if (!cur) return; try { cur.es.close(); } catch {} post('/api/term/stop', { id: cur.id }).catch(() => {}); try { cur.term.dispose(); } catch {} cur.el.remove(); window.removeEventListener('resize', cur.onResize); cur = null; }
  async function open({ tool = '', install = '', cwd = '' } = {}) {
    await load(); close();
    if (!document.getElementById('tulaiTermStyle')) { const s = document.createElement('style'); s.id = 'tulaiTermStyle'; s.textContent = style; document.head.appendChild(s); }
    const el = document.createElement('div'); el.id = 'tulaiTerm';
    const title = install ? `Installing ${install}` : tool ? `Log in: ${tool}` : 'Terminal';
    el.innerHTML = `<header><b></b><button data-k="max" title="Bigger">⤢</button><button data-k="close" title="Close the terminal">Close</button></header><div class="tt-body"></div><div class="tt-note">A real terminal on this Mac. Logins and keys you type here stay in each tool's own settings; Tulai never reads them.</div>`;
    el.querySelector('b').textContent = title; document.body.appendChild(el);
    const term = new window.Terminal({ fontSize: 13, fontFamily: 'Menlo, Monaco, monospace', cursorBlink: true, convertEol: false, theme: { background: '#0d1117' } }), fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit); term.open(el.querySelector('.tt-body')); fit.fit(); term.focus();
    let s; try { s = await post('/api/term/start', { tool, install, cwd, cols: term.cols, rows: term.rows }); } catch (e) { term.write(`\r\n${e.message}\r\n`); return; }
    const es = new EventSource('/api/term/stream?id=' + encodeURIComponent(s.id));
    es.onmessage = (m) => { const d = JSON.parse(m.data); if (d.data) term.write(Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0))); if (d.exit !== undefined) { term.write('\r\n\x1b[2m[The terminal ended. Close it, or open a new one.]\x1b[0m\r\n'); es.close(); } };
    let q = '', t = null; term.onData((d) => { q += d; clearTimeout(t); t = setTimeout(() => { const x = q; q = ''; post('/api/term/input', { id: s.id, data: x }).catch(() => {}); }, 8); });
    const onResize = () => { try { fit.fit(); post('/api/term/resize', { id: s.id, cols: term.cols, rows: term.rows }).catch(() => {}); } catch {} };
    window.addEventListener('resize', onResize);
    el.querySelector('[data-k=close]').onclick = close;
    el.querySelector('[data-k=max]').onclick = () => { el.style.height = el.style.height === '86vh' ? '' : '86vh'; setTimeout(onResize, 50); };
    cur = { id: s.id, term, es, el, fit, onResize };
  }
  window.TulaiTerminal = { open, close };
})();
