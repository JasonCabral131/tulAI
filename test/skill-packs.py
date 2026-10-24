# Skill pack rows: every answer is recomputed here from the question; held-out checks never appear in training; checks themselves accept the right answer and reject a wrong one.
import importlib.util, json, math, os, pathlib, re, tempfile, random
root = pathlib.Path(__file__).resolve().parents[1]
os.environ['TULAI_FREE_DIR'] = tempfile.mkdtemp(); os.environ['TULAI_CUSTOM_DIR'] = tempfile.mkdtemp()
def load(n, f):
    sp = importlib.util.spec_from_file_location(n, root / 'scripts' / f); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m
ps = load('ps', 'pack-skills.py'); ms = load('ms', 'memory-skills.py'); cat = {p['id']: p for p in ps.catalog()}
assert set(cat) == {'jira-mastery', 'git-mastery', 'reporting-mastery', 'meeting-skills', 'architect-ai', 'code-review-ai', 'qa-test-ai', 'frontend-ai', 'eng-productivity-ai', 'charts-reporting-ai', 'coding-ai', 'call-assistant-ai', 'springboot-ai'}
checks = {' '.join(c['prompt'].lower().split()) for p in cat.values() for c in p['checks']}
for pid in [k for k in cat if not cat[k].get('codeData') and not cat[k].get('springData')]:  # Coding AI and Spring Boot AI read downloaded datasets: tested in test/coding-data.py and test/springboot-data.py
    rows, counts = ps.rows([pid], 7, checks, ms.system_prompt(), ms.row); assert counts[pid] >= 150, (pid, counts)
    for r in rows:
        q = r['messages'][-2]['content']; assert ' '.join(q.lower().split()) not in checks, 'a held-out check leaked into training: ' + q[:60]
        assert r['messages'][0]['role'] == 'system' and r['messages'][-1]['role'] == 'assistant' and r['messages'][-1]['content'].strip()
    users = [' || '.join(m['content'] for m in r['messages'] if m['role'] == 'user') for r in rows]; assert len(users) == len(set(users)), 'no repeated input in ' + pid
# recompute the computed answers
def sample(pid, n=400): return ps.rows([pid], 3, set(), 'S', ms.row)[0][:n]
fib = [1, 2, 3, 5, 8, 13, 21, 34]
for r in sample('jira-mastery'):
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']
    m = re.match(r'Sprint data: (\d+) issues planned, (\d+) completed, (\d+) punted, (\d+) added during the sprint, (\d+) developers', q) or re.match(r'Sprint review numbers: planned (\d+), done (\d+), removed (\d+), added mid-sprint (\d+), team of (\d+)', q)
    if m:
        t, c, p, ad, dv = map(int, m.groups()); o = json.loads(a); assert o == {'completed': c, 'developers': dv, 'completion_percent': c * 100 // t, 'scope_added_percent': ad * 100 // t, 'issues_per_developer': math.floor(c / dv * 10 + 0.5) / 10}, (q, a)
    m = re.search(r'(?:completed|three sprints:) (\d+),? (?:and )?(\d+),? (?:and )?(\d+).*?(\d+) (?:story )?points', q.replace('Velocity of the last three sprints: ', 'three sprints: ').replace('Remaining backlog: ', ''))
    m = re.search(r'last 3 sprints completed (\d+), (\d+) and (\d+) story points\. The backlog has (\d+) points', q) or re.search(r'last three sprints: (\d+), (\d+), (\d+)\. Remaining backlog: (\d+) story points', q)
    if m:
        a1, b1, c1, n = map(int, m.groups()); o = json.loads(a); assert o['total_points'] == a1 + b1 + c1 and o['average_velocity'] == math.floor((a1 + b1 + c1) / 3 * 10 + 0.5) / 10 and o['sprints_needed'] == math.ceil(n / ((a1 + b1 + c1) / 3)) and abs(o['exact_sprints'] - n / ((a1 + b1 + c1) / 3)) <= 0.051, (q, a)
    m = re.match(r'Round (\d+) story points up', q) or re.search(r'estimates a story at (\d+) points\. What is the nearest', q)
    if m: assert int(a) == next(x for x in fib if x >= int(m.group(1))), (q, a)
    assert not re.search(r'Created by Jira Software', a)
for r in sample('reporting-mastery'):
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']; m = re.match(r'(?:Sprint status: )?(\d+)(?: of |/)(\d+) (?:points|story points)(?: done| finished)?,? (?:with )?(\d+) (?:of|days remaining out of) (\d+)', q)
    if m:
        d, t, left, ln = map(int, m.groups()); gp = (ln - left) * 100 // ln - d * 100 // t; st = 'Green' if gp <= 10 else 'Amber' if gp <= 25 else 'Red'; assert json.loads(a) == {'percent_done': d * 100 // t, 'days_elapsed': ln - left, 'percent_time_elapsed': (ln - left) * 100 // ln, 'gap': (ln - left) * 100 // ln - d * 100 // t, 'status': st}, (q, a)
for r in sample('git-mastery'):
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']; m = re.match(r'Branch name for ticket (\S+) "(.+)"\. Convention: type/TICKET-short-slug with type (\w+)\.', q)
    if m: assert a == f'{m.group(3)}/{m.group(1)}-' + re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', m.group(2).lower())).strip('-'), (q, a)
# computed answers of the newer packs, recomputed here from the prompt itself
import datetime as dt
for r in sample('architect-ai'):
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']
    if q.startswith('Weighted decision.'):
        w = {k: int(v) for k, v in re.findall(r'(\w[\w ]*?) (\d)(?:,|\.)', q.split('Weights: ')[1].split('. Scores')[0] + '.')}; sc = {}
        for part in q.split('Scores (1-5): ')[1].split('. Return')[0].split('; '):
            o, rest = part.split(': ', 1); sc[o] = {k.strip(): int(v) for k, v in re.findall(r'([\w ]+?) (\d)(?:, |$)', rest)}
        tot = {o: sum(w[c] * v for c, v in s_.items()) for o, s_ in sc.items()}; oa = json.loads(a); assert oa['scores'] == tot and oa['winner'] == max(tot, key=tot.get) and all(eval(oa['terms'][o]) == tot[o] for o in tot), (q, a)
for r in sample('qa-test-ai'):
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']; m = re.match(r'Coverage report: (\d+) of (\d+) lines covered\. The required threshold is (\d+)%', q)
    if m:
        cov, tot, th = map(int, m.groups()); o = json.loads(a); assert o['covered'] == cov and o['total'] == tot and o['hundreds'] == tot // 100 and o['needed'] == -(-th * tot // 100) and o['status'] == ('PASS' if cov * 100 >= th * tot else 'FAIL') and o['lines_short'] == max(0, -(-th * tot // 100) - cov) and abs(o['coverage_percent'] - cov * 100 / tot) <= 0.051, (q, a)
for r in sample('eng-productivity-ai'):
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']; m = re.match(r'A ticket is stale if it is not Done and was last updated more than (\d+) days ago\. Tickets: (.+?)\. Return JSON', q)
    if m:
        th = int(m.group(1)); ages = {k: int(a_) for k, s_, a_ in re.findall(r'(PAY-\d+) \| ([\w ]+?) \| updated (\d+) days ago', m.group(2)) if s_ != 'Done'}
        assert json.loads(a)['stale'] == [k for k, _ in sorted([(k, v) for k, v in ages.items() if v > th], key=lambda x: (-x[1], x[0]))] and json.loads(a)['ages'] == ages, (q, a)
for r in sample('charts-reporting-ai'):
    q, a = r['messages'][-2]['content'], r['messages'][-1]['content']; m = re.match(r'Planned vs completed story points per sprint: (.+?)\. There are', q)
    if m:
        pairs = [tuple(map(int, x.split()[1].split('/'))) for x in m.group(1).split(', ')]; rates = [c * 100 // p for c, p in pairs]; o = json.loads(a); assert o['completion_rates'] == rates and o['weakest'] == f'S{rates.index(min(rates)) + 1}' and abs(o['average_rate'] - sum(rates) / len(rates)) <= 0.051, (q, a)
    if q.startswith('Series '):
        o = json.loads(a); vals = [list(v.values())[1] for v in o['spec']['data']['values']]; assert o['spec']['mark'] == 'line' and o['insights'][0].startswith('Trend: ') and o['insights'][2] == f'Average: {math.floor(sum(vals) / len(vals) * 10 + 0.5) / 10:.1f}' and o['calc']['sum'] == sum(vals) and o['calc']['first'] == vals[0], (q, a)
r1 = ps.contrast('#000000', '#ffffff'); assert abs(r1 - 21) < 0.001 and abs(ps.contrast('#767676', '#ffffff') - 4.54) < 0.01
# the knowledge file is real Jira data: attribution kept, sensible counts
k = ps.knowledge(); assert k['source']['license'] == 'CC-BY-4.0' and '15719919' in k['source']['doi'] and len(k['issueTypes']) >= 8 and len(k['linkTypes']) >= 8 and len(k['systemFields']) >= 15
assert any(f['name'] == 'Assignee' and f['jql'] == 'assignee' for f in k['systemFields']) and any(t['name'] == 'Bug' for t in k['issueTypes'])
# every check is well-formed, and its pattern accepts a right answer and rejects an empty one
for p in cat.values():
    for c in p['checks']:
        assert len(c['prompt']) > 10 and (c.get('match') or c.get('not') or c.get('exec')); re.compile(c['match'] if c.get('match') else '.', re.I | re.S)
        assert not re.search(c['match'], '', re.I | re.S) if c.get('match') else True, 'a check must not pass on an empty answer: ' + c['prompt'][:50]
# the generators' own answers satisfy a similar shape (sanity): a perfect JQL passes the Jira JQL check
j = cat['jira-mastery']['checks']; assert re.search(j[0]['match'], 'project = OPS AND issuetype = Bug AND resolution = Unresolved AND labels = urgent ORDER BY created DESC', re.I | re.S) and not re.search(j[0]['match'], 'issuetype = Bug', re.I | re.S)
assert re.search(j[5]['match'], '{"completed":24,"developers":4,"completion_percent":80,"scope_added_percent":20,"issues_per_developer":6.0}') and re.search(j[6]['match'], '{"total_points":63,"average_velocity":21.0,"exact_sprints":4.8,"sprints_needed":5}')
# a pack check's truth equals what the generator would compute
assert ps.pct(24, 30) == 80 and ps.pct(6, 30) == 20 and ps.rag(9, 30, 3, 10) == 'Red' and ps.rag(24, 30, 3, 10) == 'Green' and ps.rag(20, 40, 5, 10) == 'Green' and ps.rag(16, 40, 4, 10) == "Amber"
# in the training data build, only the chosen packs are added
sd = load('sd', 'skill-data.py'); os.environ['TULAI_PACKS'] = ''; assert 'packs' not in sd.build(); os.environ['TULAI_PACKS'] = 'jira-mastery,git-mastery'; b = sd.build(); assert set(b['packs']) == {'jira-mastery', 'git-mastery', 'combined'} and b['packs']['combined'] >= 40 and b['packs']['jira-mastery'] >= 300
assert not any(' '.join(m['content'].lower().split()) in checks for it in b['train'] + b['valid'] + b['test'] if isinstance(it, dict) for m in it['messages'] if m['role'] == 'user'), 'pack checks never reach training'
print('PASS skill packs: computed answers recomputed, held-out checks, real Jira knowledge, only chosen packs are trained')
