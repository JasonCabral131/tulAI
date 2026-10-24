// Every Python file the training imports must be copied into the training stage (a missing one breaks every seed at once).
const assert = require('assert'), fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'bot-training.js'), 'utf8'), list = /const stage=path\.join\(home\(\),'chat-runner'\);for\(const f of \[([^\]]+)\]/.exec(src)[1];
const staged = new Set([...list.matchAll(/'([^']+)'/g)].map((m) => m[1]));
for (const f of fs.readdirSync(path.join(__dirname, '..', 'scripts')).filter((x) => x.endsWith('.py'))) {
  const body = fs.readFileSync(path.join(__dirname, '..', 'scripts', f), 'utf8');
  for (const m of body.matchAll(/with_name\('([\w-]+\.py)'\)/g)) if (staged.has('scripts/' + f)) assert(staged.has('scripts/' + m[1]), `scripts/${f} loads ${m[1]}, which is not copied to the training stage`);
}
console.log('PASS stage files: every Python module the training loads is staged');
