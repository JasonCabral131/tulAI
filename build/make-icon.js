// Regenerates build/icon.icns from icongen.js. Run: node build/make-icon.js (macOS: uses sips + iconutil)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process'), { appIcon } = require('../icongen');
const dir = path.join(__dirname, 'icon.iconset'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
const sizes = [[16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2]];
for (const [s, x] of sizes) fs.writeFileSync(path.join(dir, `icon_${s}x${s}${x === 2 ? '@2x' : ''}.png`), appIcon(s * x));
fs.writeFileSync(path.join(__dirname, 'icon.png'), appIcon(1024));
execFileSync('iconutil', ['-c', 'icns', dir, '-o', path.join(__dirname, 'icon.icns')]); fs.rmSync(dir, { recursive: true, force: true });
console.log('wrote build/icon.icns and build/icon.png');
