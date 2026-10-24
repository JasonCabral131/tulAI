/* Animated provider picker, backed by the existing select for configuration saves. */
(() => {
  const select = document.getElementById('bm_provider');
  if (!select) return;
  const art = {
    local: ['#69cbb5', '<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/><rect x="9" y="9" width="6" height="6" rx="1"/>', 'Private · on this Mac'],
    openai: ['#7acfb9', '<g class="provider-orbit"><ellipse cx="12" cy="12" rx="5" ry="9"/><ellipse cx="12" cy="12" rx="5" ry="9" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="5" ry="9" transform="rotate(120 12 12)"/></g>', 'OpenAI · ChatGPT models'],
    qwen: ['#aa96ff', '<g class="provider-orbit"><path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/><path d="m12 7 3 5-3 5-3-5Z"/></g>', 'Alibaba Cloud · Qwen models'],
    anthropic: ['#e8a385', '<g class="provider-sun"><path d="M12 2v5m0 10v5M2 12h5m10 0h5M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4M8 3l2 4m4 10 2 4M3 8l4 2m10 4 4 2M3 16l4-2m10-4 4-2M8 21l2-4m4-10 2-4"/></g>', 'Anthropic · Claude models'],
    groq: ['#ffae73', '<path class="provider-bolt" d="M14 2 5 14h6l-1 8 9-12h-6l1-8Z"/>', 'Fast cloud inference'],
    openrouter: ['#a4b5f9', '<path d="M3 12h6m0 0 6-7h6M9 12l6 7h6m-3-17 3 3-3 3m0 8 3 3-3 3"/><circle class="provider-signal" cx="7" cy="12" r="2"/>', 'One connection · many models'],
    ollama: ['#d8cfbb', '<path d="M7 9 6 3a2 2 0 0 1 4 0l1 5h2l1-5a2 2 0 0 1 4 0l-1 6c5 7 0 13-5 13S2 16 7 9Z"/><path class="provider-blink" d="M8 13v1m8-1v1"/><path d="m10 17 2 1 2-1"/>', 'Local models · your own runtime'],
    custom: ['#91c9f1', '<path d="m8 5-6 7 6 7m8-14 6 7-6 7M14 3l-4 18"/>', 'Connect an OpenAI-compatible endpoint']
  };
  const icon = key => `<span class="provider-icon" style="--provider-color:${art[key][0]}"><svg viewBox="0 0 24 24" aria-hidden="true">${art[key][1]}</svg></span>`;
  const wrap = document.createElement('div'); wrap.className = 'provider-picker';
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'provider-trigger'; trigger.id = 'providerTrigger'; trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded', 'false'); trigger.setAttribute('aria-controls', 'providerList');
  const list = document.createElement('div'); list.id = 'providerList'; list.className = 'provider-list'; list.hidden = true; list.setAttribute('popover','manual'); list.setAttribute('role','listbox'); list.setAttribute('aria-label','AI provider'); list.tabIndex = -1;
  const options = [...select.options]; let active = 0, search = '', searchAt = 0;
  options.forEach((option,i) => {
    const row = document.createElement('div'); row.id = `provider-option-${option.value}`; row.className = 'provider-option'; row.setAttribute('role','option'); row.dataset.value = option.value;
    row.innerHTML = `${icon(option.value)}<span class="provider-copy"><b>${option.textContent}</b><small>${art[option.value][2]}</small></span><svg class="provider-check" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`;
    row.addEventListener('click', () => choose(i)); list.append(row);
  });
  select.after(wrap); wrap.append(trigger,list); select.hidden = true; select.tabIndex = -1;
  function sync() {
    const option = options.find(o => o.value === select.value) || options[0];
    trigger.innerHTML = `${icon(option.value)}<span class="provider-copy"><b>${option.textContent}</b><small>${art[option.value][2]}</small></span><svg class="provider-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`;
    trigger.setAttribute('aria-label', `AI provider: ${option.textContent}`);
    [...list.children].forEach(row => row.setAttribute('aria-selected', String(row.dataset.value === select.value)));
  }
  function highlight(i) { active = (i + options.length) % options.length; [...list.children].forEach((row,n) => row.classList.toggle('focused', n === active)); list.setAttribute('aria-activedescendant', list.children[active].id); const row=list.children[active]; if(row.offsetTop<list.scrollTop)list.scrollTop=row.offsetTop; else if(row.offsetTop+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=row.offsetTop+row.offsetHeight-list.clientHeight; }
  function close(focus = false) { if(list.matches(':popover-open'))list.hidePopover(); list.hidden = true; trigger.setAttribute('aria-expanded','false'); if (focus) trigger.focus(); }
  function place() { const r=trigger.getBoundingClientRect(), below=innerHeight-r.bottom-12, above=r.top-12, up=below<240&&above>below; list.style.cssText=`position:fixed;margin:0;inset:auto;left:${r.left}px;width:${r.width}px;max-height:${Math.min(440,up?above:below)}px;${up?`bottom:${innerHeight-r.top+7}px`:`top:${r.bottom+7}px`}`; }
  function show() { list.hidden = false; list.showPopover(); place(); trigger.setAttribute('aria-expanded','true'); list.focus(); highlight(options.findIndex(o => o.value === select.value)); }
  function choose(i) { select.value = options[i].value; select.dispatchEvent(new Event('change',{bubbles:true})); sync(); close(true); }
  trigger.onclick = () => list.hidden ? show() : close();
  trigger.onkeydown = e => { if (['ArrowDown','ArrowUp'].includes(e.key)) { e.preventDefault(); show(); } };
  list.onkeydown = e => {
    if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key)) e.preventDefault();
    if(e.key==='ArrowDown') highlight(active+1); else if(e.key==='ArrowUp') highlight(active-1);
    else if(e.key==='Home') highlight(0); else if(e.key==='End') highlight(options.length-1);
    else if(e.key==='Enter'||e.key===' ') choose(active);
    else if(e.key==='Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if(e.key==='Tab') { close(); trigger.focus(); }
    else if(e.key.length===1) { const now=Date.now(); search=(now-searchAt>700?'':search)+e.key.toLowerCase(); searchAt=now; const i=options.findIndex(o=>o.textContent.toLowerCase().startsWith(search)); if(i>=0) highlight(i); }
  };
  window.addEventListener('resize',()=>{if(!list.hidden)place()});
  document.addEventListener('scroll',e=>{if(!list.hidden&&e.target!==list)place()},true);
  document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))close()});
  wrap.addEventListener('focusout',e=>{if(!wrap.contains(e.relatedTarget))close()});
  select.addEventListener('change',sync);
  window.syncProviderPicker = sync; sync();
})();
