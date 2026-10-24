// All skill packs in one brain that work together: training includes questions that need two packs at once (each half answered exactly as its own
// pack would), from different packs, and never containing a held-out check.
const assert = require('assert'), { execFileSync } = require('child_process'), path = require('path');
const py = `import importlib.util as u,json;sp=u.spec_from_file_location('ps','scripts/pack-skills.py');ps=u.module_from_spec(sp);sp.loader.exec_module(ps)
cat=ps.catalog();ids=['jira-mastery','charts-reporting-ai','meeting-skills','qa-test-ai'];checks={' '.join(c['prompt'].lower().split()) for p in cat for c in p.get('checks',[])}
rows,c=ps.rows(ids,7,checks,'S',lambda a,b,q,x:(q,x));one,_=ps.rows(['jira-mastery'],7,checks,'S',lambda a,b,q,x:(q,x))
cr=[x for x in rows if x[0].startswith(tuple(ps.COMBO_ASK))]
print(json.dumps({'counts':c,'combo':cr[:200],'single':len([x for x in one if x[0].startswith(tuple(ps.COMBO_ASK))]),'checks':sorted(checks)}))`;
const o = JSON.parse(execFileSync('python3', ['-c', py], { cwd: path.join(__dirname, '..'), maxBuffer: 64e6 }).toString());
assert(o.counts.combined >= 40, 'combined rows are made when 2+ packs are chosen');
assert.strictEqual(o.single, 0, 'one pack alone: nothing to combine');
for (const [q, a] of o.combo) {
  assert(/\n\n1\. [\s\S]+\n\n2\. /.test(q) && /^1\. [\s\S]+\n\n2\. /.test(a), 'two numbered tasks, two numbered answers');
  const parts = q.split(/\n\n(?=[12]\. )/).slice(1).map((x) => x.replace(/^[12]\. /, '').toLowerCase().split(/\s+/).join(' '));
  for (const p of parts) assert(!o.checks.includes(p), 'a held-out check never appears inside a combined question');
}
console.log(`PASS combined packs: ${o.counts.combined} rows that use two skill packs at once`);
