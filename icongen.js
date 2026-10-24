// Draws the Gateway Chat icon (rounded square + asterisk) as PNG with no dependencies. Used for the app icon and the menu-bar icon.
const zlib = require('zlib');
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, rgba) {
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const cov = (d, px) => Math.max(0, Math.min(1, 0.5 - d / px)); // anti-aliased edge from a signed distance
const segD = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
// Tulai mark: a bridge (arch, deck, piers) with a four-point spark above it. Coordinates are fractions of the icon size, centre = (0,0).
function markCoverage(u, v, px, k) {
  const deckY = -0.055, R = 0.215, cy = deckY + R, foot = 0.295, ta = 0.08 * k, td = 0.08 * k, deckHalf = 0.385;
  const r = Math.hypot(u, v - cy);
  const dArch = v <= cy ? Math.abs(r - R) - ta / 2 : Math.min(segD(u, v, -R, cy, -R, foot), segD(u, v, R, cy, R, foot)) - ta / 2; // arch hangs under the deck, legs reach the ground
  const dDeck = segD(u, v, -deckHalf, deckY, deckHalf, deckY) - td / 2;
  const sx = u, sy = v + 0.245, sr = 0.115 * (0.9 + 0.1 * k);                                                                   // spark above the bridge: astroid |x|^.5 + |y|^.5 = sr^.5
  const ax = Math.max(Math.abs(sx), 1e-4), ay = Math.max(Math.abs(sy), 1e-4);
  const g = Math.sqrt(ax) + Math.sqrt(ay) - Math.sqrt(sr), dSpark = g / Math.hypot(0.5 / Math.sqrt(ax), 0.5 / Math.sqrt(ay));
  return cov(Math.min(dArch, dDeck, dSpark), px);
}
function drawIcon(size, { tile = true, fg = [255, 255, 255], k = 1 } = {}) {
  const buf = Buffer.alloc(size * size * 4), c = size / 2, r = size * 0.225, half = size * 0.5 - (tile ? size * 0.035 : 0), px = 1 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ux = x + 0.5 - c, uy = y + 0.5 - c;
    let a = 0, col = [0, 0, 0];
    if (tile) {
      const qx = Math.abs(ux) - (half - r), qy = Math.abs(uy) - (half - r);
      a = cov(Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r, 1);
      const g = Math.max(0, Math.min(1, (uy + half) / (2 * half))); col = [Math.round(224 - 38 * g), Math.round(120 - 46 * g), Math.round(82 - 38 * g)]; // warm clay gradient
    }
    const f = markCoverage(ux / size, uy / size, px, k);
    if (f > 0) { col = tile ? [Math.round(col[0] * (1 - f) + fg[0] * f), Math.round(col[1] * (1 - f) + fg[1] * f), Math.round(col[2] * (1 - f) + fg[2] * f)] : fg; a = Math.max(a, f); }
    const i = (y * size + x) * 4; buf[i] = col[0]; buf[i + 1] = col[1]; buf[i + 2] = col[2]; buf[i + 3] = Math.round(a * 255);
  }
  return png(size, size, buf);
}
const appIcon = (size = 1024) => drawIcon(size);
const trayIcon = (size = 36) => drawIcon(size, { tile: false, fg: [0, 0, 0], k: 1.55 }); // black mark on transparent = macOS template image
module.exports = { appIcon, trayIcon, png };
