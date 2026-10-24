// Draws the installer window background for the DMG (build/dmg-bg.tiff): a dark panel, a soft glow and an arrow from the app to the Applications folder.
// Run: node build/make-dmg-bg.js (macOS: uses tiffutil to make a sharp @2x version)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { png } = require('../icongen');
function draw(scale) {
  const W = 660 * scale, H = 400 * scale, px = Buffer.alloc(W * H * 4), cx = W / 2, cy = 190 * scale;
  const seg = (x, y, x1, y1, x2, y2) => { const dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H; let r = 14 + 10 * v, g = 20 + 14 * v, b = 38 + 26 * v;
    const glow = Math.exp(-(((x - cx) / (W * 0.42)) ** 2 + ((y - cy) / (H * 0.5)) ** 2) * 2); r += 18 * glow; g += 40 * glow; b += 60 * glow;
    const d = Math.min(seg(x, y, 255 * scale, 190 * scale, 395 * scale, 190 * scale), seg(x, y, 380 * scale, 172 * scale, 405 * scale, 190 * scale), seg(x, y, 380 * scale, 208 * scale, 405 * scale, 190 * scale));
    const a = Math.max(0, Math.min(1, (3.2 * scale - d) / (1.6 * scale))); r += (150 - r) * a * 0.9; g += (205 - g) * a * 0.9; b += (255 - b) * a * 0.9;
    if (y > H - 3 * scale) { r += 12; g += 12; b += 12; }
    const i = (y * W + x) * 4; px[i] = Math.min(255, r); px[i + 1] = Math.min(255, g); px[i + 2] = Math.min(255, b); px[i + 3] = 255;
  }
  return png(W, H, px);
}
const dir = __dirname; fs.writeFileSync(path.join(dir, 'dmg-bg.png'), draw(1)); fs.writeFileSync(path.join(dir, 'dmg-bg@2x.png'), draw(2));
execFileSync('tiffutil', ['-cathidpicheck', path.join(dir, 'dmg-bg.png'), path.join(dir, 'dmg-bg@2x.png'), '-out', path.join(dir, 'dmg-bg.tiff')]);
console.log('wrote build/dmg-bg.tiff');
