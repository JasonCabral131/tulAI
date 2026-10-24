/* One color family for the companion and desktop. Appearance controls brightness. */
(function (root) {
  const defaults = { shell: '#f6f1e8', accent: '#c15f3c', eye: '#ffb38a' };
  const valid = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const mix = (a, b, amount) => '#' + rgb(a).map((v, i) => Math.round(v * (1 - amount) + rgb(b)[i] * amount).toString(16).padStart(2, '0')).join('');
  const luminance = hex => rgb(hex).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  function derive(input, mode = 'dark') {
    const skin = Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, valid(input?.[key], value)]));
    const light = mode === 'light', deep = mode === 'neon';
    const bg = light ? mix('#ffffff', skin.shell, .3) : mix(deep ? '#0b0e13' : '#17191d', skin.accent, .055);
    const panel = light ? mix('#f4f5f6', skin.shell, .4) : mix(deep ? '#10141a' : '#1e2126', skin.accent, .065);
    const card = light ? '#ffffff' : mix(deep ? '#1a2028' : '#282d34', skin.accent, .075);
    const ink = light ? '#202830' : '#edf3f5', muted = light ? '#59636b' : '#aab5be';
    // Maintain readable accent text on all three surfaces, including bright mint/yellow palettes.
    let accent = skin.accent;
    for (let i = 0; i <= 100; i++) {
      accent = mix(skin.accent, light ? '#111820' : '#ffffff', i / 100);
      if ([bg, panel, card].every(surface => contrast(accent, surface) >= 4.5)) break;
    }
    const accentInk = contrast(accent, '#ffffff') >= contrast(accent, '#101820') ? '#ffffff' : '#101820';
    return {
      '--bg': bg, '--panel': panel, '--card': card, '--ink': ink, '--muted': muted,
      '--line': mix(panel, ink, light ? .15 : .14), '--user': mix(panel, skin.accent, light ? .10 : .14),
      '--code': mix(light ? '#172027' : '#0b1016', skin.accent, .04),
      '--accent': accent, '--accent-ink': accentInk, '--bot-accent': skin.accent, '--bot-shell': skin.shell, '--bot-glow': skin.eye,
      '--grad': `linear-gradient(135deg,${accent},${accent})`,
      '--ok': light ? '#247348' : '#6bd9a0', '--err': light ? '#b72d3d' : '#ff8590', '--gold': light ? '#8c600d' : '#e7bc67'
    };
  }
  function apply(skin, appearance = 'auto') {
    const mode = appearance === 'auto' ? (root.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : appearance;
    const tokens = derive(skin, mode), el = root.document.documentElement;
    for (const [key, value] of Object.entries(tokens)) el.style.setProperty(key, value);
    el.dataset.botPalette = 'on'; el.style.colorScheme = mode === 'light' ? 'light' : 'dark';
    return tokens;
  }
  const api = { derive, apply, contrast };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TulaiPalette = api;
})(typeof window === 'undefined' ? globalThis : window);
