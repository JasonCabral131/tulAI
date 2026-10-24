/* Small, animated companion portraits shared by navigation and commands. */
(() => {
  let skin = {};
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
  function bot() {
    const type = ['classic','orb','cat','retro'].includes(skin.type) ? skin.type : 'classic';
    const shell = color(skin.shell,'#f6f1e8'), accent = color(skin.accent,'#c15f3c'), eye = color(skin.eye,'#ffb38a');
    const craft = ['spacecraft','rocket','shuttle'].includes(skin.craft);
    const head = type === 'orb' ? '<ellipse cx="24" cy="19" rx="17" ry="16"/>' : type === 'cat' ? '<path d="M8 15 8 3l10 7h12L40 3v12"/><rect x="7" y="9" width="34" height="25" rx="12"/>' : `<rect x="7" y="7" width="34" height="27" rx="${type==='retro'?7:12}"/>`;
    return `<svg class="companion-portrait" data-character="${type}" data-craft="${craft?skin.craft:'none'}" viewBox="0 0 48 52" aria-hidden="true" style="--portrait-shell:${shell};--portrait-accent:${accent};--portrait-eye:${eye}">
      <ellipse cx="24" cy="49" rx="${craft?17:10}" ry="2" fill="${accent}" opacity=".14"/>
      <g class="portrait-float">
        <rect x="17" y="30" width="14" height="15" rx="7" fill="${shell}"/><circle cx="24" cy="37" r="4" fill="${accent}"/><path d="m24 34 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" fill="${eye}"/>
        <g class="portrait-arm"><rect x="9" y="33" width="5" height="10" rx="2.5" fill="${shell}"/></g><g class="portrait-wave"><rect x="34" y="33" width="5" height="10" rx="2.5" fill="${shell}"/></g>
        ${type==='classic'||type==='retro'?`<path d="M24 7V3" stroke="${accent}" stroke-width="2"/><circle cx="24" cy="3" r="2" fill="${eye}"/><rect x="3" y="16" width="5" height="10" rx="2.5" fill="${accent}"/><rect x="40" y="16" width="5" height="10" rx="2.5" fill="${accent}"/>`:''}
        <g fill="${shell}">${head}</g>
        ${type==='cat'?`<path d="m11 8 5 4-5 2Zm26 0-5 4 5 2Z" fill="${accent}"/>`:''}
        <rect x="9" y="11" width="30" height="22" rx="10" fill="#000" opacity=".08"/>
        <rect x="10" y="12" width="28" height="18" rx="${type==='retro'?5:8}" fill="#14202e"/>
        <path d="M15 14h17" stroke="#fff" stroke-opacity=".12" stroke-linecap="round"/>
        <g class="portrait-eyes" fill="${eye}"><rect x="16" y="17" width="4" height="7" rx="2"/><rect x="28" y="17" width="4" height="7" rx="2"/></g>
        <path d="M21 26q3 3 6 0" fill="none" stroke="${eye}" stroke-width="1.4" stroke-linecap="round"/>
        ${craft?`<g class="portrait-craft">${skin.craft==='rocket'?`<rect x="7" y="30" width="6" height="15" rx="3" fill="${accent}"/><rect x="35" y="30" width="6" height="15" rx="3" fill="${accent}"/>`:skin.craft==='shuttle'?`<path d="m24 33 23 11H1Z" fill="${accent}"/>`:''}<path class="portrait-jets" d="m13 44 2 6 2-6m14 0 2 6 2-6" fill="${eye}"/><ellipse cx="24" cy="42" rx="21" ry="5" fill="${accent}"/><ellipse cx="24" cy="40" rx="21" ry="5" fill="${shell}"/><ellipse cx="24" cy="38" rx="9" ry="2" fill="#14202e"/><path d="M10 42h2m11 1h2m11-1h2" stroke="${eye}" stroke-width="2" stroke-linecap="round"/></g>`:''}
      </g></svg>`;
  }
  const paths = {
    new: '<path class="command-tint" d="M4 5h15v13H9l-5 3Z"/><path d="M12 4H7a3 3 0 0 0-3 3v13l5-3h8a3 3 0 0 0 3-3v-2"/><g class="compose-pencil"><path d="m12 12 1-4 6-6 3 3-6 6-4 1ZM17 4l3 3"/></g>' ,
    settings: '<path d="M4 7h4m4 0h8M4 17h8m4 0h4"/><circle cx="10" cy="7" r="2"/><circle cx="14" cy="17" r="2"/>',
    sidebar: '<rect class="command-tint" x="3" y="4" width="6" height="16" rx="2"/><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>',
    panel: '<rect class="command-tint" x="15" y="4" width="6" height="16" rx="2"/><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M15 4v16"/>',
    export: '<path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/><g class="command-arrow"><path d="M12 3v12m-4-4 4 4 4-4"/></g>',
    missions: '<path class="command-tint" d="M7 13C11 5 15 3 21 3c0 6-2 10-10 14Z"/><path d="m8 10-4 1-2 4h5m7 2-1 4-4 1v-5M7 13C11 5 15 3 21 3c0 6-2 10-10 14l-4-4Z"/><circle cx="16" cy="8" r="2"/>',
    light: '<circle class="command-tint" cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="4"/><g class="command-rays"><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></g>',
    dark: '<path class="command-tint" d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/><path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/>',
    neon: '<path d="M17 3v6m-3-3h6M20 11v4m-2-2h4M17 17A8 8 0 0 1 7 5a8 8 0 1 0 10 12Z"/>',
    auto: '<rect x="3" y="4" width="18" height="13" rx="3"/><path d="M8 21h8m-4-4v4"/><path class="command-tint" d="M12 5h7v11h-7Z"/>',
    chat: '<path class="command-tint" d="M4 4h16v14H9l-5 3Z"/><path d="M7 4h10a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9l-5 3V7a3 3 0 0 1 3-3ZM8 9h8m-8 4h5"/>'
  };
  function command(key) { return key === 'bot' || key === 'health' ? bot() : `<svg class="command-icon command-${key}" viewBox="0 0 24 24" aria-hidden="true">${paths[key] || paths.chat}</svg>`; }
  function sync(next) {
    skin = next || {};
    const rail = document.getElementById('railBot'), row = document.getElementById('botRowDot');
    if (rail) { rail.innerHTML = bot() + '<span class="rail-label">Tulai</span>'; const name={classic:'Classic',orb:'Orb',cat:'Neko',retro:'Retro'}[skin.type]||'Classic'; rail.setAttribute('aria-label', `Customize ${name} Tulai${skin.craft==='spacecraft'?' in spacecraft':''}`); }
    if (row) row.innerHTML = bot();
    document.dispatchEvent(new Event('tulai-avatar-change'));
  }
  window.TulaiIcons = {bot,command,sync};
})();
