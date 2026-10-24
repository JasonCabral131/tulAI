// Writes training-config/acceptance-prompts.json from acceptance-packs.js: fingerprints (SHA-256 of the lower-cased, space-normalised text) of the
// self-test questions, which training must never use. Only fingerprints ship, not the questions.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { cases } = require('../acceptance-packs');
const fp = (q) => crypto.createHash('sha256').update(String(q).toLowerCase().split(/\s+/).filter(Boolean).join(' ')).digest('hex');
const out = path.join(__dirname, '..', 'training-config', 'acceptance-prompts.json');
if (require.main === module) { fs.writeFileSync(out, JSON.stringify({ about: 'Fingerprints of the self-test questions (acceptance-packs.js). Training skips any question with one of these fingerprints, so the self-test measures what the bot learned, not what it memorised. Written by scripts/acceptance-prompts.js.', sha256: cases.map((c) => fp(c.prompt)) }, null, 1) + '\n'); console.log(cases.length + ' self-test fingerprints written'); }
module.exports = { fp };
