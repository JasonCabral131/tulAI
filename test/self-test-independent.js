// The self-test must use questions that were never trained on: no chart data description or Jira honesty question from the training generators
// may appear inside a self-test question (it happened once: "bugs per component" made the Charts score look better than it was).
const assert = require('assert'), { execFileSync } = require('child_process'), path = require('path');
const acc = require('../acceptance-packs').cases.map((c) => c.prompt.toLowerCase());
const py = `import importlib.util as u,json,re;sp=u.spec_from_file_location('ps','scripts/pack-skills.py');ps=u.module_from_spec(sp);sp.loader.exec_module(ps)
src=open('scripts/pack-skills.py').read();hq=re.findall(r"\\('([^']+\\?[^']*)', [\\"']",src[src.index('def jira_honest'):src.index('# ---',src.index('def jira_honest'))])
import random;r=random.Random(1);gq=sorted({ps.jira_concept(r)[0] for _ in range(400)})
print(json.dumps([d for _,_,x in ps.CHOOSE for d in x]+hq+gq))`;
const items = JSON.parse(execFileSync('python3', ['-c', py], { cwd: path.join(__dirname, '..') }).toString());
assert(items.length > 40, 'read the training items');
const leaks = items.filter((d) => acc.some((p) => p.includes(d.toLowerCase()) || d.toLowerCase().includes(p)));
assert.deepStrictEqual(leaks, [], 'training items found inside self-test questions');
const { fp } = require('../scripts/acceptance-prompts'); assert.deepStrictEqual(require('../training-config/acceptance-prompts.json').sha256, require('../acceptance-packs').cases.map((c) => fp(c.prompt)), 'training-config/acceptance-prompts.json is out of date: run node scripts/acceptance-prompts.js');
// Python's fingerprint is the same as JavaScript's, and a generated question equal to a self-test question is skipped
const pyfp = execFileSync('python3', ['-c', `import importlib.util as u,json,hashlib;sp=u.spec_from_file_location('ps','scripts/pack-skills.py');ps=u.module_from_spec(sp);sp.loader.exec_module(ps)
k=' '.join('What  is a Jira Epic?'.lower().split());ps.BANNED.add(hashlib.sha256(k.encode()).hexdigest());print(json.dumps([hashlib.sha256(k.encode()).hexdigest(),ps.banned(k),ps.banned('something else')]))`], { cwd: path.join(__dirname, '..') }).toString();
assert.deepStrictEqual(JSON.parse(pyfp), [fp('What is a Jira Epic?'), true, false]);
console.log(`PASS self-test independent: ${items.length} training items, none inside the ${acc.length} self-test questions`);
