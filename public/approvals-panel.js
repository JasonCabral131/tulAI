// Permission cards: when Tulai (or a tool working on this Mac) needs your OK, a card appears here with an Allow button. Nothing runs until you click it.
(() => {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const css = document.createElement('style'); css.textContent = `#tulaiApprovals{position:fixed;right:18px;bottom:18px;z-index:9999;display:flex;flex-direction:column;gap:10px;max-width:min(380px,92vw)}
  .apCard{background:var(--card,#141a24);color:inherit;border:1px solid color-mix(in srgb,var(--accent,#7cc4ff) 55%,transparent);border-radius:16px;padding:14px 16px;box-shadow:0 14px 40px rgba(0,0,0,.45);font-size:13.5px;line-height:1.45}
  .apCard b{display:block;font-size:15px;margin-bottom:4px}.apCard small{opacity:.7;display:block;margin-top:6px}.apRow{display:flex;gap:8px;margin-top:10px}.apRow .btn{flex:1}.apNote{margin-top:8px;color:#d9a441}.apOk{color:#2e8b57}.apBad{color:#c0392b}`; document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'tulaiApprovals'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', 'Permission requests'); document.body.appendChild(box);
  const shown = new Map(); let busy = false;
  async function decide(id, allow) {
    busy = true; draw();
    try { const r = await fetch('/api/approvals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tulai-UI': '1' }, body: JSON.stringify({ id, allow }) }); const d = await r.json(); if (d.item) shown.set(id, { ...d.item, until: Date.now() + (d.item.status === 'pending' ? 0 : 12000) }); } catch (e) { shown.set(id, { id, status: 'failed', title: 'Could not reach Tulai', result: e.message, until: Date.now() + 8000 }); }
    busy = false; await poll();
  }
  function draw() {
    const now = Date.now(); for (const [k, v] of shown) if (v.until && v.until < now) shown.delete(k);
    const items = [...shown.values()]; box.innerHTML = items.map((i) => {
      if (i.status === 'pending' || i.status === 'running') return `<div class="apCard" data-id="${esc(i.id)}"><b>🔐 ${esc(i.title)}</b>${esc(i.why)}${i.note ? `<div class="apNote">${esc(i.note)}</div>` : ''}<small>Asked by ${esc(i.requestedBy)} · nothing happens until you click Allow</small><div class="apRow"><button class="btn primary" data-allow ${busy || i.status === 'running' ? 'disabled' : ''}>${i.status === 'running' ? 'Working…' : 'Allow'}</button><button class="btn" data-deny ${busy || i.status === 'running' ? 'disabled' : ''}>Not now</button></div></div>`;
      return `<div class="apCard"><b class="${i.status === 'done' ? 'apOk' : i.status === 'denied' ? '' : 'apBad'}">${i.status === 'done' ? '✓ Done' : i.status === 'denied' ? 'Not allowed' : '⚠ Failed'}: ${esc(i.title)}</b>${esc(i.result || '')}</div>`; }).join('');
  }
  box.addEventListener('click', (e) => { const c = e.target.closest('.apCard'); if (!c || !c.dataset.id || e.target.disabled) return; if (e.target.matches('[data-allow]')) decide(c.dataset.id, true); else if (e.target.matches('[data-deny]')) decide(c.dataset.id, false); });
  async function poll() {
    try { const d = await (await fetch('/api/approvals')).json(); for (const i of d.items || []) if (i.status === 'pending' || i.status === 'running') { const old = shown.get(i.id); shown.set(i.id, { ...i, until: 0, note: i.note || (old && old.note) }); } for (const [k, v] of shown) if ((v.status === 'pending' || v.status === 'running') && !(d.items || []).some((i) => i.id === k && (i.status === 'pending' || i.status === 'running'))) shown.delete(k); draw(); } catch {}
  }
  poll(); setInterval(poll, 4000);
})();
