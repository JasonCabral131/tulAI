// Chart images (SVG) for Tulai's reports: vertical bars, horizontal bars and multi-line charts. Plain SVG, drawn by code from counted numbers,
// so they open anywhere (chat, Markdown preview, browser) and can be pasted into slides.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#dc2626', '#0891b2'];
const frame = (W, H, title, sub, body, foot) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img"><title>${esc(title)}</title><rect width="${W}" height="${H}" fill="#f8fafc"/><g font-family="Arial,sans-serif" fill="#182c45"><text x="36" y="40" font-size="23" font-weight="bold">${esc(title)}</text>${sub ? `<text x="36" y="64" font-size="13" fill="#475569">${esc(sub)}</text>` : ''}${body}${foot ? `<text x="36" y="${H - 14}" font-size="12" fill="#64748b">${esc(foot)}</text>` : ''}</g></svg>`;
/** Vertical bars: points [{label, value}] */
function bars(points, title, sub = '', foot = '', color = '#397aaf') {
  const W = 1000, H = 480, L = 70, T = 90, B = 390, R = 960, max = Math.max(1, ...points.map((p) => p.value)), step = (R - L) / Math.max(points.length, 1);
  let g = ''; for (let i = 0; i <= 4; i++) { const y = B - (B - T) * i / 4; g += `<path d="M${L} ${y}H${R}" stroke="#dbe3ec"/><text x="${L - 10}" y="${y + 4}" text-anchor="end" font-size="12">${Math.round(max * i / 4)}</text>`; }
  points.forEach((p, i) => { const x = L + step * (i + 0.5), h = (B - T) * p.value / max; g += `<rect x="${x - step * 0.32}" y="${B - h}" width="${step * 0.64}" height="${h}" rx="3" fill="${p.color || color}"/><text x="${x}" y="${B - h - 7}" text-anchor="middle" font-size="13" font-weight="bold">${p.value}</text><text x="${x}" y="${B + 18}" text-anchor="middle" font-size="12">${esc(String(p.label).slice(0, 18))}</text>`; });
  return frame(W, H, title, sub, g, foot);
}
/** Horizontal bars (good for people): points [{label, value}] */
function hbars(points, title, sub = '', foot = '', color = '#397aaf') {
  const n = Math.max(points.length, 1), W = 1000, row = 30, T = 90, H = T + n * row + 50, L = 250, R = 930, max = Math.max(1, ...points.map((p) => p.value));
  let g = ''; points.forEach((p, i) => { const y = T + i * row, w = (R - L) * p.value / max; g += `<text x="${L - 10}" y="${y + 19}" text-anchor="end" font-size="13">${esc(String(p.label).slice(0, 30))}</text><rect x="${L}" y="${y + 5}" width="${Math.max(2, w)}" height="${row - 10}" rx="3" fill="${p.color || color}"/><text x="${L + Math.max(2, w) + 8}" y="${y + 19}" font-size="13" font-weight="bold">${p.value}</text>`; });
  return frame(W, H, title, sub, g, foot);
}
/** Lines: labels [x], series [{name, values[]}] */
function lines(labels, series, title, sub = '', foot = '') {
  const W = 1000, H = 480, L = 70, T = 100, B = 380, R = 960, max = Math.max(1, ...series.flatMap((s) => s.values)), step = (R - L) / Math.max(labels.length - 1, 1);
  let g = ''; for (let i = 0; i <= 4; i++) { const y = B - (B - T) * i / 4; g += `<path d="M${L} ${y}H${R}" stroke="#dbe3ec"/><text x="${L - 10}" y="${y + 4}" text-anchor="end" font-size="12">${Math.round(max * i / 4)}</text>`; }
  labels.forEach((l, i) => { if (i % Math.max(1, Math.ceil(labels.length / 10)) === 0 || i === labels.length - 1) g += `<text x="${L + step * i}" y="${B + 18}" text-anchor="middle" font-size="12">${esc(l)}</text>`; });
  series.forEach((s, k) => { const c = COLORS[k % COLORS.length], pts = s.values.map((v, i) => [L + step * i, B - (B - T) * v / max]);
    g += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${c}" stroke-width="3"/>` + pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${c}"/>`).join('');
    const last = pts[pts.length - 1]; if (last) g += `<text x="${last[0] - 4}" y="${last[1] - 9}" text-anchor="end" font-size="12" fill="${c}" font-weight="bold">${s.values[s.values.length - 1]}</text>`;
    g += `<rect x="${L + k * 190}" y="${T - 26}" width="14" height="14" rx="3" fill="${c}"/><text x="${L + k * 190 + 20}" y="${T - 14}" font-size="13">${esc(s.name)}</text>`; });
  return frame(W, H, title, sub, g, foot);
}
/** Monday-based week keys from a start date to an end date (inclusive). */
function weeks(from, to) { const out = [], d = new Date(from); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); while (d <= to && out.length < 120) { out.push(new Date(d)); d.setDate(d.getDate() + 7); } return out; }
module.exports = { bars, hbars, lines, weeks, esc };
