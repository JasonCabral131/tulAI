/* Settings, Train your local bot AI, "Your own training": add examples and checks, import files, see and delete what was added. */
(() => {
  const el = (i) => document.getElementById(i); if (!el('customTrain')) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let kind = 'example';
  const say = (t, bad) => { el('ctMsg').textContent = t || ''; el('ctMsg').style.color = bad ? 'var(--err,#c0392b)' : ''; };
  const post = async (body) => { const r = await fetch('/api/bot/training/custom', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || 'Could not save'); return j; };
  function setKind(k) {
    kind = k; el('ctKindEx').setAttribute('aria-pressed', k === 'example'); el('ctKindCk').setAttribute('aria-pressed', k === 'check'); el('ctKindEx').classList.toggle('primary', k === 'example'); el('ctKindCk').classList.toggle('primary', k === 'check');
    el('ctL1').textContent = k === 'example' ? 'When I say' : 'When I say (the test question)'; el('ctAnswer').parentElement; el('ctAnswer').hidden = el('ctL2').hidden = k === 'check'; el('ctCheckFields').hidden = k === 'example';
  }
  function draw(d) {
    const ex = d.examples || [], ck = d.checks || [];
    const item = (e, c) => `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)"><div style="flex:1;min-width:0"><b>${c ? '✔ Check' : '✎ Example'}</b> · ${esc(e.prompt.slice(0, 120))}<div style="opacity:.8">${c ? `must contain: ${esc(e.match || '—')}${e.not ? ` · must not: ${esc(e.not)}` : ''}` : `→ ${esc(e.answer.slice(0, 160))}`}${e.memory ? `<div style="opacity:.7">saved notes: ${esc(e.memory.join(' · ').slice(0, 140))}</div>` : ''}</div></div>${e.file === 'mine.jsonl' ? `<button class="btn" data-ct-del="${esc(e.id)}" type="button">Delete</button>` : `<span style="opacity:.6">${esc(e.file)}</span>`}</div>`;
    el('ctList').innerHTML = `<b>${ex.length}</b> example${ex.length === 1 ? '' : 's'} and <b>${ck.length}</b> check${ck.length === 1 ? '' : 's'} will be used in the next training.` + [...ex.map((e) => item(e, false)), ...ck.map((e) => item(e, true))].join('');
    el('ctFolder').textContent = `Folder: ${d.dir}. You can also drop your own .jsonl files in it.`;
    el('ctList').querySelectorAll('[data-ct-del]').forEach((b) => (b.onclick = async () => { try { draw(await post({ remove: b.dataset.ctDel }).then(load)); } catch (e) { say(e.message, true); } }));
  }
  async function load() { try { const d = await (await fetch('/api/bot/training/custom')).json(); draw(d); return d; } catch { el('ctList').textContent = 'Not available right now.'; return {}; } }
  el('ctKindEx').onclick = () => setKind('example'); el('ctKindCk').onclick = () => setKind('check');
  el('ctAdd').onclick = async () => {
    const memory = el('ctMemory').value.split('\n').map((x) => x.trim()).filter(Boolean), prompt = el('ctPrompt').value.trim();
    const entry = kind === 'example' ? { prompt, answer: el('ctAnswer').value.trim(), ...(memory.length ? { memory } : {}) } : { check: true, prompt, match: el('ctMatch').value.trim(), not: el('ctNot').value.trim(), ...(memory.length ? { memory } : {}) };
    try { await post({ entry }); ['ctPrompt', 'ctAnswer', 'ctMatch', 'ctNot', 'ctMemory'].forEach((i) => (el(i).value = '')); say('Added. It is used in the next training.'); await load(); } catch (e) { say(e.message, true); }
  };
  el('ctFile').onchange = async () => { const f = el('ctFile').files[0]; if (f) el('ctImport').value = await f.text(); };
  el('ctImportBtn').onclick = async () => { try { const j = await post({ import: el('ctImport').value }); el('ctImport').value = ''; say(`Imported ${j.added}${j.skippedCount ? `, skipped ${j.skippedCount}: ${j.skipped.slice(0, 3).join('; ')}` : ''}.`, !j.added && j.skippedCount); draw(j); } catch (e) { say(e.message, true); } };
  new MutationObserver(() => { if (el('settings').classList.contains('open') && el('localTrainingPanel').classList.contains('on')) load(); }).observe(el('settings'), { attributes: true, subtree: true, attributeFilter: ['class'] });
  /* Free open data */
  const fdPost = async (body) => { const r = await fetch('/api/bot/training/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error((d.error && d.error.message) || 'Could not save'); return d; };
  const mbs = (n) => (n / 1048576).toFixed(n > 1e8 ? 0 : 1) + ' MB'; let fdTimer = null;
  function fdDraw(d) {
    const box = el('fdList'); const L = d.datasets || [];
    box.innerHTML = L.map((x) => `<div style="padding:8px 0;border-top:1px solid var(--line)"><label class="check" style="margin:0"><input type="checkbox" data-fd-on="${esc(x.id)}" ${x.enabled ? 'checked' : ''}> <b>${esc(x.name)}</b> <span style="opacity:.7">· ${esc(x.license)} · up to ${x.maxRows} rows</span></label><div style="opacity:.85;margin:2px 0 2px 24px">${esc(x.skill)}</div><div style="margin:2px 0 0 24px;opacity:.75">${esc(x.licenseNote)} <a href="${esc(x.source)}" data-ext="${esc(x.source)}" target="_blank" rel="noopener">source</a> · version <code>${esc(x.commit.slice(0, 8))}</code></div><div style="margin:4px 0 0 24px">${x.state === 'ready' ? '✔ Downloaded (' + mbs(x.bytes) + ')' : x.state === 'downloading' ? `Downloading… ${Math.round(x.done / x.bytes * 100)}%` : x.state === 'error' ? `<span style="color:var(--err,#c0392b)">Could not download: ${esc(x.error)}</span> ` : 'Not downloaded (' + mbs(x.bytes) + ')'} ${x.state === 'ready' || x.state === 'downloading' ? '' : `<button class="btn" data-fd-dl="${esc(x.id)}" type="button">Download</button>`}</div></div>`).join('');
    box.querySelectorAll('[data-fd-on]').forEach((c) => (c.onchange = async () => { try { fdDraw(await fdPost({ enable: { id: c.dataset.fdOn, on: c.checked } })); } catch (e) { say(e.message, true); } }));
    box.querySelectorAll('[data-fd-dl]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { fdDraw(await fdPost({ download: b.dataset.fdDl })); fdPoll(); } catch (e) { say(e.message, true); } }));
    if (L.some((x) => x.state === 'downloading')) fdPoll();
  }
  const fdLoad = async () => { try { fdDraw(await (await fetch('/api/bot/training/free')).json()); } catch { el('fdList').textContent = 'Not available right now.'; } };
  function fdPoll() { clearTimeout(fdTimer); fdTimer = setTimeout(async () => { await fdLoad(); }, 1500); }
  /* GitHub training pack */
  const tpPost = async (body) => { const r = await fetch('/api/bot/training/pack', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error((d.error && d.error.message) || 'Could not save'); return d; };
  const tpCfg = () => ({ repo: el('tpRepo').value.trim(), dir: el('tpDir').value.trim(), ref: el('tpRef').value.trim(), auto: el('tpAuto').checked });
  const tpDraw = (d) => { const c = d.config || {}, l = d.last; if (document.activeElement !== el('tpRepo')) el('tpRepo').value = c.repo || ''; el('tpDir').value = c.dir || 'training-pack'; el('tpRef').value = c.ref || 'main'; el('tpAuto').checked = c.auto !== false;
    el('tpStatus').textContent = !c.repo ? 'No repo set yet.' : !l ? 'Not downloaded yet.' : l.ok ? `Downloaded ${l.rows} rows from ${l.files} file${l.files === 1 ? '' : 's'}${l.version ? ' (version ' + l.version + ')' : ''}, ${new Date(l.at).toLocaleString()}${l.skipped ? `. ${l.skipped} row(s) were ignored (secrets or wrong format).` : '.'}` : `Could not download: ${l.error}`; el('tpStatus').style.color = l && !l.ok && c.repo ? 'var(--err,#c0392b)' : ''; };
  const tpLoad = async () => { try { tpDraw(await (await fetch('/api/bot/training/pack')).json()); } catch {} };
  ['tpRepo', 'tpDir', 'tpRef', 'tpAuto'].forEach((i) => (el(i).onchange = async () => { try { tpDraw(await tpPost({ config: tpCfg() })); } catch (e) { el('tpStatus').textContent = e.message; el('tpStatus').style.color = 'var(--err,#c0392b)'; } }));
  el('tpSync').onclick = async () => { el('tpSync').disabled = true; el('tpStatus').textContent = 'Downloading…'; el('tpStatus').style.color = ''; try { const d = await tpPost({ config: tpCfg(), sync: true }); tpDraw(d); if (d.custom) draw(d.custom); } catch (e) { el('tpStatus').textContent = e.message; el('tpStatus').style.color = 'var(--err,#c0392b)'; } el('tpSync').disabled = false; };
  setKind('example'); load(); tpLoad(); fdLoad();
})();
