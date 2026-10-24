"""Skill packs: bundles of computed training rows (and held-out checks) that teach the local model one professional skill, chosen with one click.

Every answer is computed by code from the question (or from real data files), never guessed. A pack lists its generators in training-config/skill-packs.json;
this file holds the generators. The rows are chat rows in the bot's own answer prompt. Hold-out rule: no pack row equals a pack check question.
Jira Mastery also uses real Jira knowledge (training-config/jira-knowledge.json, CC BY 4.0, from The Public Jira Dataset, doi:10.5281/zenodo.15719919) and, if the
person downloaded it, real sprint rows from the Agile Scrum Sprint Velocity data set (RandulaKoralage/AgileScrumSprintVelocityDataSet, no license declared:
used only on this Mac, never redistributed).
"""
import csv, json, math, os, pathlib, random, re

ROOT = pathlib.Path(__file__).resolve().parents[1]
J = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':'))


def catalog(): return json.loads((ROOT / 'training-config/skill-packs.json').read_text())['packs']
def knowledge(): return json.loads((ROOT / 'training-config/jira-knowledge.json').read_text())


def sprint_rows():
    """Real sprint rows if the person downloaded the data set (free-data.js), else []."""
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat')
    d = pathlib.Path(os.environ.get('TULAI_FREE_DIR') or (pathlib.Path(base) / 'training' / 'free')) / 'raw' / 'sprint-velocity'; out = []
    for f in sorted(d.glob('*.csv')) if d.is_dir() else []:
        try:
            for r in csv.DictReader(open(f, encoding='utf-8-sig')):
                t = int(r.get('total') or r.get('totalNumberOfIssues') or 0); c = int(r['completedIssuesCount']); p = int(r['puntedIssues']); a = len([x for x in (r.get('issueKeysAddedDuringSprint') or '').split(';') if x.strip()]) if not (r.get('issueKeysAddedDuringSprint') or '').strip().isdigit() else int(r['issueKeysAddedDuringSprint'])
                dv = int(float(r.get('NoOfDevelopers') or 0)); ln = int(float(r.get('SprintLength') or 0))
                if t > 0 and 0 <= c <= t and 0 <= p <= t and 0 <= a <= t and dv > 0 and 0 < ln <= 60: out.append((t, c, p, a, dv, ln))
        except Exception: continue
    return out


# ------------------------------------------------------------------ Jira Mastery
def jira_issue_type(r):
    k = knowledge(); t = r.choice(k['issueTypes']); n = t['name']; kind = 'a sub-task of another issue' if t['subtask'] else 'a standalone issue'
    q = r.choice([f'What is a "{n}" in Jira?', f'What does the Jira issue type {n} mean?', f'When do I use the "{n}" issue type in Jira?', f'Explain the Jira issue type "{n}" in one or two sentences.'])
    desc = t['description'].replace('Created by Jira Software - do not edit or delete. ', '').strip()
    return q, f'{n}: {desc} It is {kind}' + (f' and belongs to {t["theme"]} work.' if t.get('theme') else '.')


JIRA_CONCEPTS = [(['Epic', 'epic'], 'An Epic is a big piece of work, like a large user story or feature, that is broken down into smaller stories and tasks.'),
                 (['Story', 'user story'], 'A Story is one small piece of value written from the user\'s view ("As a user, I want ... so that ..."), small enough to finish in one sprint.'),
                 (['Sub-task', 'subtask'], 'A Sub-task is one step of a bigger issue; it always belongs to a parent story, task or bug.'),
                 (['Bug', 'bug ticket'], 'A Bug is a problem that stops the product from working as it should.'),
                 (['Sprint', 'sprint'], 'A Sprint is a fixed period, usually 1 to 2 weeks, in which the team finishes a chosen set of issues.'),
                 (['Backlog', 'backlog'], 'The Backlog is the ordered list of issues that are not in a sprint yet; the top items are worked on next.')]


def jira_concept(r):
    """Plain-language Jira concepts, asked many different ways (not only the exact issue type wording)."""
    names, a = r.choice(JIRA_CONCEPTS); n = r.choice(names)
    q = r.choice([f'Explain what an {n} is in Jira.' if n[0].lower() in 'aeiou' else f'Explain what a {n} is in Jira.', f'In Jira, what does {n} mean?', f'Quick one: {n} in Jira, what is it?',
                  f'Can you tell me what a Jira {n} is used for?', f'Define {n} as used in Jira, in one sentence.', f'Ano ang {n} sa Jira?', f'My new teammate asks what a {n} is in Jira. What do I tell them?'])
    return q, a


def jira_subtask(r):
    t = r.choice(knowledge()['issueTypes']); n = t['name']
    q = r.choice([f'Is "{n}" a sub-task issue type in Jira?', f'In Jira, is {n} a sub-task type? Answer yes or no, then one short reason.'])
    return q, ('Yes. ' if t['subtask'] else 'No. ') + (f'{n} can only exist under a parent issue.' if t['subtask'] else f'{n} is a normal issue type that can stand on its own.')


def jira_link(r):
    lt = r.choice([x for x in knowledge()['linkTypes'] if x['inward'] != x['outward']]); a, b = r.choice(['PAY-12', 'APP-7', 'WEB-301', 'API-88']), r.choice(['PAY-40', 'APP-19', 'WEB-12', 'API-5'])
    if r.random() < 0.5:
        q = r.choice([f'In Jira, {a} "{lt["outward"]}" {b}. What wording does {b} show for {a}?', f'{a} {lt["outward"]} {b} in Jira. How does the link read from {b}?'])
        return q, f'{b} shows "{lt["inward"]}" {a}.'
    q = r.choice([f'Which Jira link type uses the wording "{lt["outward"]}" and "{lt["inward"]}"?', f'What is the Jira link type with the outward wording "{lt["outward"]}"?'])
    return q, f'That is the "{lt["name"]}" link type: it reads "{lt["outward"]}" from one issue and "{lt["inward"]}" from the other.'


def jira_field(r):
    f = r.choice(knowledge()['systemFields'])
    if r.random() < 0.6:
        q = r.choice([f'What is the JQL field name for "{f["name"]}" in Jira?', f'Which name do I type in JQL to filter by {f["name"]}?'])
        return q, f'In JQL use `{f["jql"]}`.'
    q = r.choice([f'Which Jira field does `{f["jql"]}` mean in JQL?', f'In JQL, what does the field `{f["jql"]}` refer to?'])
    return q, f'`{f["jql"]}` is the "{f["name"]}" field.'


JQL_PARTS = [  # (phrases, jql, group): at most one part per group
    (['assigned to me', 'that I own', 'assigned to me right now'], 'assignee = currentUser()', 'who'), (['that nobody owns', 'with no assignee', 'unassigned'], 'assignee is EMPTY', 'who'),
    (['reported by me', 'that I created'], 'reporter = currentUser()', 'who2'),
    (['in the current sprint', 'in the active sprint', 'in this sprint'], 'sprint in openSprints()', 'sprint'), (['in a future sprint', 'planned for upcoming sprints'], 'sprint in futureSprints()', 'sprint'), (['not in any sprint', 'that are not planned in a sprint'], 'sprint is EMPTY', 'sprint'),
    (['that are still open', 'that are unresolved', 'not done yet'], 'resolution = Unresolved', 'res'), (['that are resolved', 'that are done'], 'resolution is not EMPTY', 'res'),
    (['with high priority', 'marked High priority'], 'priority = High', 'prio'), (['with Blocker priority', 'that are blockers'], 'priority = Blocker', 'prio'), (['with Critical priority', 'that are critical'], 'priority = Critical', 'prio'),
    (['created in the last 7 days', 'created this week', 'opened in the past week'], 'created >= -7d', 'created'), (['created in the last 30 days', 'opened in the past month'], 'created >= -30d', 'created'),
    (['updated in the last 24 hours', 'changed today'], 'updated >= -1d', 'updated'), (['not updated for 2 weeks', 'untouched for two weeks'], 'updated <= -14d', 'updated'),
    (['labeled backend', 'with the backend label'], 'labels = backend', 'label'), (['labeled urgent', 'with the urgent label'], 'labels = urgent', 'label'),
    (['that are blocked', 'in the Blocked status'], 'status = Blocked', 'status'), (['in progress', 'currently in progress'], 'status = "In Progress"', 'status'), (['that are in review', 'waiting for review'], 'status = "In Review"', 'status'),
    (['due this week', 'due in the next 7 days'], 'duedate <= 7d AND duedate >= 0d', 'due'), (['that are overdue', 'past their due date'], 'duedate < now()', 'due'),
]
JQL_TYPES = [('bugs', 'issuetype = Bug'), ('stories', 'issuetype = Story'), ('tasks', 'issuetype = Task'), ('epics', 'issuetype = Epic'), ('issues', None)]
JQL_SORT = [('newest first', 'ORDER BY created DESC'), ('oldest first', 'ORDER BY created ASC'), ('by priority', 'ORDER BY priority DESC'), ('most recently updated first', 'ORDER BY updated DESC'), (None, None)]
PROJECTS = ['PAY', 'APP', 'WEB', 'API', 'MBM', 'OPS']


def jira_jql(r):
    word, jt = r.choice(JQL_TYPES); parts = [jt] if jt else []; used = set(); phrases = []; proj = r.choice(PROJECTS) if r.random() < 0.5 else None
    if proj: parts.insert(0, f'project = {proj}')
    for ph, jql, g in r.sample(JQL_PARTS, len(JQL_PARTS)):
        if g in used or len(used) >= r.randint(1, 3): continue
        used.add(g); parts.append(jql); phrases.append(r.choice(ph))
    sw, sj = r.choice(JQL_SORT); q = r.choice(['Write a JQL query for: ', 'JQL for: ', 'Give me the JQL to find ']) + word + (f' in project {proj}' if proj else '') + ' ' + ' and '.join(phrases) + (f', sorted {sw}' if sw else '') + '. Return only the JQL.'
    return q, ' AND '.join(parts) + (' ' + sj if sj else '')


FIB = [1, 2, 3, 5, 8, 13, 21]


def jira_points(r):
    k = r.random()
    if k < 0.3: return r.choice(['Which story point values are on the usual Fibonacci scale up to 21?', 'List the Fibonacci story point scale used in planning poker, up to 21.']), '1, 2, 3, 5, 8, 13, 21.'
    if k < 0.75:
        n = r.choice([4, 6, 7, 9, 10, 11, 12, 14, 15, 17, 19, 20]); up = next(x for x in FIB + [34] if x >= n)
        return r.choice([f'The team estimates a story at {n} points. What is the nearest Fibonacci story point at or above that?', f'Round {n} story points up to the next Fibonacci value. Answer with just the number.']), str(up)
    n = r.choice([13, 21, 34, 40]); return f'A story is estimated at {n} points. Should it be split before the sprint? Answer in one sentence.', f'Yes. Anything of 13 points or more is usually too big for one sprint; split it into smaller stories of 8 points or less.' if n >= 13 else 'No.'


def pct(n, d): return n * 100 // d


def jira_velocity(r, real=None):
    if real and r.random() < 0.7: t, c, p, a, dv, ln = r.choice(real)
    else:
        t = r.randint(8, 60); c = r.randint(0, t); p = r.randint(0, max(0, t // 5)); a = r.randint(0, max(0, t // 3)); dv = r.randint(2, 10); ln = r.choice([7, 10, 14, 14, 21])
    q = r.choice([f'Sprint data: {t} issues planned, {c} completed, {p} punted, {a} added during the sprint, {dv} developers, {ln} days. Return JSON only with completed, developers, completion_percent, scope_added_percent and issues_per_developer.',
                  f'Sprint review numbers: planned {t}, done {c}, removed {p}, added mid-sprint {a}, team of {dv}, length {ln} days. Return JSON only with completed, developers, completion_percent, scope_added_percent and issues_per_developer.'])
    return q, J({'completed': c, 'developers': dv, 'completion_percent': pct(c, t), 'scope_added_percent': pct(a, t), 'issues_per_developer': math.floor(c / dv * 10 + 0.5) / 10})  # the two inputs are echoed first, so the division is done on visible numbers


def jira_forecast(r):
    for _ in range(40):
        v = [r.randint(10, 30) for _ in range(3)]; n = r.randint(30, 160); tot = sum(v); exact = n / (tot / 3)
        if math.ceil(math.floor(exact * 10 + 0.5) / 10) == math.ceil(exact): break
    avg = math.floor(tot / 3 * 10 + 0.5) / 10; ex1 = math.floor(exact * 10 + 0.5) / 10
    q = r.choice([f'The last 3 sprints completed {v[0]}, {v[1]} and {v[2]} story points. The backlog has {n} points left. Return JSON only with total_points (of the three sprints), average_velocity (one decimal), exact_sprints (backlog divided by the average, one decimal) and sprints_needed (rounded up).',
                  f'Velocity of the last three sprints: {v[0]}, {v[1]}, {v[2]}. Remaining backlog: {n} story points. Return JSON only with total_points (of the three sprints), average_velocity (one decimal), exact_sprints (backlog divided by the average, one decimal) and sprints_needed (rounded up).'])
    return q, J({'total_points': tot, 'average_velocity': avg, 'exact_sprints': ex1, 'sprints_needed': math.ceil(exact)})


ROLES = ['project lead', 'developer', 'customer', 'support agent', 'team member', 'manager', 'admin']
GOALS = ['see my sprint progress on one screen', 'export the report as a PDF', 'get a reminder before each meeting', 'filter tickets by label', 'reset my password without calling support', 'review merge requests in one list', 'search past conversations', 'approve requests from my phone']
BENEFITS = ['I can spot risks early', 'I save time every week', 'nothing is forgotten', 'I find the right work faster', 'I stay in control', 'the team stays aligned']


def jira_story(r):
    ro, g, b = r.choice(ROLES), r.choice(GOALS), r.choice(BENEFITS)
    if r.random() < 0.6: return f'Write a Jira user story. Role: {ro}. Goal: {g}. Benefit: {b}.', f'As a {ro}, I want to {g}, so that {b}.'
    w, a, t = r.choice(['I open the report', 'I press Export', 'a meeting is 10 minutes away', 'I choose a label']), r.choice(['the file is created', 'the PDF downloads', 'I get a reminder', 'only matching tickets show']), r.choice(['within 5 seconds', 'without errors', 'with the right title', 'in the same order'])
    return f'Write acceptance criteria in Given/When/Then form. Given: {ro} is signed in. When: {w}. Then: {a} {t}.', f'Given a {ro} is signed in, when {w}, then {a} {t}.'


PRIO = {1: 'Blocker', 2: 'Critical', 3: 'Major', 4: 'Minor', 5: 'Trivial'}


def jira_priority(r):
    i = r.randint(1, 5)
    return r.choice([f'In this Jira data, priorityId {i} means which priority name? (1 Blocker, 2 Critical, 3 Major, 4 Minor, 5 Trivial)', f'Priority id {i} on the Jira scale 1 Blocker, 2 Critical, 3 Major, 4 Minor, 5 Trivial: what is its name?']), f'{PRIO[i]}.'


def jira_honest(r):
    q, a = r.choice([('How many Jira tickets are blocked in my project? No Jira data was provided.', "I don't have that number: no Jira data was provided, so I won't guess."),
                     ('What is our team velocity? I have not given you any sprint numbers.', "I can't tell you the velocity: I have no sprint numbers, so I won't make one up. Give me the completed points of the last sprints and I will calculate it."),
                     ('Which sprint is the current one? Jira is not connected.', "I can't see it: Jira is not connected, so I don't know which sprint is active."),
                     ('How many open stories does project MBM have? Jira is not connected.', "I can't tell: Jira is not connected, so I have no data on MBM's stories. Connect Jira in Settings and ask again."),
                     ('How many tickets are in the current sprint of team Alpha? Jira is not connected yet.', "I don't have that number: Jira is not connected, so I won't guess. Connect Jira and I will count them."),
                     ('How many items are in the ACME backlog right now? Jira is not connected.', "I can't tell: Jira is not connected, so I have no backlog data for ACME. I won't guess a number."),
                     ('What is the size of the OPS backlog? Jira is not connected.', "I don't know: Jira is not connected, so I can't see the OPS backlog. Connect Jira and ask again."),
                     ('How many issues are open in project WEB? Jira is not connected to me.', "I can't say: Jira is not connected, so I have no data for WEB and I won't make up a number."),
                     ('Ilan ang tickets sa backlog ng project HR? Hindi naka-connect ang Jira.', "Hindi ko alam: hindi naka-connect ang Jira, kaya wala akong data sa HR backlog. Hindi ako manghuhula ng numero."),
                     ('How many bugs were closed last week in project CORE? Jira is not connected.', "I can't say: Jira is not connected, so I have no data for CORE. I won't make up a number."),
                     ('Who is assigned to ticket PAY-123? No ticket data is available.', "I don't know: I have no data for PAY-123, so I won't guess an assignee."),
                     ('How many story points are left in the backlog? You have no backlog data.', "I can't say: I have no backlog data. Share the open stories with their points and I will add them up.")])
    return q, a


# ------------------------------------------------------------------ Git Mastery
GIT = [  # (phrases, command)
    (['undo the last commit but keep my changes staged', 'uncommit my last commit and keep the changes staged'], 'git reset --soft HEAD~1'), (['undo the last commit and keep the changes unstaged', 'uncommit the last commit, files stay modified'], 'git reset --mixed HEAD~1'),
    (['throw away all local changes in tracked files', 'discard every uncommitted change'], 'git restore .'), (['create a new branch called {b} and switch to it', 'make and checkout a branch named {b}'], 'git switch -c {b}'),
    (['switch to the branch {b}', 'go to branch {b}'], 'git switch {b}'), (['see which files changed', 'show the working tree status'], 'git status'), (['show the last 5 commits in one line each', 'list the 5 latest commits compactly'], 'git log --oneline -5'),
    (['stage every changed file', 'add all changes to the next commit'], 'git add -A'), (['change the message of the last commit', 'reword my last commit message'], 'git commit --amend'), (['save my uncommitted work temporarily', 'stash my local changes'], 'git stash'),
    (['bring back the stashed work', 'apply my latest stash and remove it'], 'git stash pop'), (['download the latest changes without merging', 'fetch the remote updates only'], 'git fetch'), (['delete the local branch {b} that is already merged', 'remove the merged local branch {b}'], 'git branch -d {b}'),
    (['see what I changed but have not staged', 'show my unstaged differences'], 'git diff'), (['push the current branch for the first time and track it', 'publish my new branch to origin'], 'git push -u origin HEAD'), (['reapply my commits on top of main', 'rebase my branch onto main'], 'git rebase main'),
    (['copy one commit {h} onto my current branch', 'cherry-pick commit {h}'], 'git cherry-pick {h}'), (['see who last changed each line of {f}', 'blame the file {f}'], 'git blame {f}'), (['create a tag {t} for the current commit', 'tag this commit as {t}'], 'git tag {t}'), (['show the remote repositories', 'list the configured remotes'], 'git remote -v'),
]
BRANCHES = ['feature/PAY-12-login', 'bugfix/APP-7-timeout', 'release/1.4', 'hotfix/WEB-9', 'chore/update-deps']; HASHES = ['a1b2c3d', '9f8e7d6', '4c5d6e7', 'deadbee']; FILES = ['src/app.js', 'README.md', 'docs/report.md', 'lib/utils.py']; TAGS = ['v1.2.0', 'v2.0.1', 'release-5']


def git_cmd(r):
    ph, cmd = r.choice(GIT); sub = dict(b=r.choice(BRANCHES), h=r.choice(HASHES), f=r.choice(FILES), t=r.choice(TAGS))
    return r.choice(['Which git command lets me ', 'Give me the git command to ', 'Git: how do I ']) + r.choice(ph).format(**sub) + '? Reply with just the command.', cmd.format(**sub)


CTYPES = {'feat': 'a new feature', 'fix': 'a bug fix', 'docs': 'a documentation change', 'refactor': 'a code change that neither fixes a bug nor adds a feature', 'test': 'adding or fixing tests', 'chore': 'maintenance work such as dependency updates'}
SUMMARIES = ['add sprint report export', 'handle empty calendar slots', 'update install steps', 'rename the viewer helper', 'cover reminder parsing', 'bump electron to 33.4', 'stop duplicate reminders', 'show the version in About']
SCOPES = ['reports', 'calendar', 'docs', 'viewer', 'reminders', 'build', 'training']


def git_commit(r):
    t = r.choice(list(CTYPES)); s, sc = r.choice(SUMMARIES), r.choice(SCOPES)
    if r.random() < 0.5: return f'Write a Conventional Commits message. Type: {t}. Scope: {sc}. Summary: {s}.', f'{t}({sc}): {s}'
    if r.random() < 0.5: return f'Write a Conventional Commits message with no scope. Type: {t}. Summary: {s}.', f'{t}: {s}'
    return f'In Conventional Commits, what does the type "{t}" mean?', f'"{t}" is {CTYPES[t]}.'


def slug(s): return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s.lower())).strip('-')


def git_branch(r):
    kind = r.choice(['feature', 'bugfix', 'chore']); key = f'{r.choice(PROJECTS)}-{r.randint(10, 999)}'; title = r.choice(['fix login timeout', 'add sprint report', 'Update README steps', 'Remove old API calls', 'Show version in About'])
    return f'Branch name for ticket {key} "{title}". Convention: type/TICKET-short-slug with type {kind}.', f'{kind}/{key}-{slug(title)}'


# ------------------------------------------------------------------ Reporting Mastery
def rag(done, total, left, length):
    gap = (length - left) * 100 // length - done * 100 // total  # whole percents: time elapsed minus progress
    return 'Green' if gap <= 10 else 'Amber' if gap <= 25 else 'Red'


def report_rag(r):
    total = r.choice([20, 25, 30, 40, 50, 60]); done = r.randint(0, total); length = r.choice([10, 14, 21]); left = r.randint(0, length - 1)
    q = r.choice([f'Sprint status: {done} of {total} points done, {left} of {length} days left. Return JSON only with percent_done, days_elapsed (days in the sprint minus days left), percent_time_elapsed, gap and status (Green, Amber or Red). Rule: gap = percent_time_elapsed minus percent_done; Green if the gap is 10 or less, Amber if 25 or less, else Red.',
                  f'{done}/{total} story points finished with {left} days remaining out of {length}. Return JSON only with percent_done, days_elapsed (days in the sprint minus days left), percent_time_elapsed, gap and status (Green, Amber or Red). Rule: gap = percent_time_elapsed minus percent_done; Green if the gap is 10 or less, Amber if 25 or less, else Red.'])
    return q, J({'percent_done': pct(done, total), 'days_elapsed': length - left, 'percent_time_elapsed': pct(length - left, length), 'gap': pct(length - left, length) - pct(done, total), 'status': rag(done, total, left, length)})


DONE = ['Released the report export', 'Fixed duplicate reminders', 'Updated install guide', 'Closed 8 tickets', 'Reviewed 5 merge requests']; DOING = ['Testing the calendar reader', 'Writing the pack docs', 'Migrating the build', 'Estimating next sprint']; BLOCK = ['Waiting for Jira access', 'VPN is down', 'No test data yet', 'Approval from security pending']


def report_status(r):
    d, g, b = r.sample(DONE, r.randint(1, 3)), r.sample(DOING, r.randint(1, 2)), (r.sample(BLOCK, r.randint(1, 2)) if r.random() < 0.7 else [])
    q = f'Format a weekly status. Done: {"; ".join(d)}. In progress: {"; ".join(g)}. Blockers: {"; ".join(b) if b else "none"}.'
    return q, 'Done:\n' + '\n'.join(f'- {x}' for x in d) + '\n\nIn progress:\n' + '\n'.join(f'- {x}' for x in g) + '\n\nBlockers:\n' + ('\n'.join(f'- {x}' for x in b) if b else '- None')


RISK_WHAT = ['the vendor API may change', 'one developer holds the release knowledge', 'test data is incomplete', 'the staging server is unstable', 'two teams edit the same module', 'the deadline depends on an external approval', 'key people are on leave in December', 'the build takes over 40 minutes', 'dependencies are out of date', 'requirements change late in the sprint']
RISK_IMPACT = ['reports could break', 'a release could slip', 'bugs may reach users', 'demos may fail', 'merge conflicts will grow', 'delivery may be delayed by weeks', 'reviews will be slow', 'developers lose time every day', 'security fixes may be missed', 'rework will cost the sprint']
RISK_FIX = ['pin the version and add a contract test', 'document the steps and pair on the next release', 'create a shared test data set this week', 'add a backup server', 'agree an owner for each file', 'ask for the approval now', 'plan coverage in November', 'cache dependencies', 'update them in small steps', 'freeze the scope after planning']


def report_risk(r):
    rk, im, mt = r.choice(RISK_WHAT), r.choice(RISK_IMPACT), r.choice(RISK_FIX); lv = r.choice(['High', 'Medium', 'Low'])
    return f'Write a risk entry. Risk: {rk}. Impact: {im}. Mitigation: {mt}. Level: {lv}.', f'Risk ({lv}): {rk[0].upper() + rk[1:]}. Impact: {im}. Mitigation: {mt}.'


# ------------------------------------------------------------------ Meeting Skills
OWNERS = ['Ana', 'Ben', 'Carla', 'Dante', 'Elena', 'Felix']; TASKS = ['send the minutes', 'update the roadmap', 'book the demo room', 'review the merge request', 'share the test results', 'fix the login bug']; DUES = ['Friday', 'Monday', 'tomorrow', 'next Wednesday', 'end of day']


def meeting_actions(r):
    items = [(r.choice(OWNERS), r.choice(TASKS), r.choice(DUES)) for _ in range(r.randint(1, 3))]; seen = set(); items = [x for x in items if not (x[0], x[1]) in seen and not seen.add((x[0], x[1]))]
    chatter = r.choice(['Okay, thanks everyone.', 'Good point.', 'Let us keep it short.'])
    lines = [f'{o} said: "I will {t} by {d}."' for o, t, d in items]; lines.insert(r.randint(0, len(lines)), chatter)
    return 'Extract the action items as "- Owner: task (due)" lines from this meeting transcript:\n' + '\n'.join(lines), '\n'.join(f'- {o}: {t} ({d})' for o, t, d in items)


DECS = ['We will ship on Thursday', 'The old report format is retired', 'Standup moves to 9:30', 'Security review comes before release']


NOTE_NOISE = ['We discussed the budget.', 'The demo went well.', 'Everyone agreed the design looks good.', 'The team reviewed last sprint.', 'We talked about the holiday schedule.', 'Marketing shared the new logo.', 'The client liked the prototype.', 'We spent some time on the roadmap.']


def meeting_actions_notes(r):
    """Plain meeting notes: only sentences where a person commits to a task are action items; discussion sentences are not."""
    items = [(o, t, d) for o, t, d in {(r.choice(OWNERS), r.choice(TASKS), r.choice(DUES)) for _ in range(r.randint(1, 3))}]; items = list({(o, t): (o, t, d) for o, t, d in items}.values())
    lines = [f'{o} will {t} by {d}.' for o, t, d in items]
    for z in r.sample(NOTE_NOISE, r.randint(1, 2)): lines.insert(r.randint(0, len(lines)), z)
    q = r.choice(["List only the action items from these notes, one bullet each as 'Name: task (due)': ", 'Which action items are in these notes? Answer as "- Name: task (due)" bullets, nothing else. Notes: '])
    return q + ' '.join(lines), '\n'.join(f'- {o}: {t} ({d})' for o, t, d in items)


# ------------------------------------------------------------------ Call Assistant (live answers during calls, mock-call feedback)
# The answer uses only facts said in the conversation; what was not said is offered as an option to confirm, never stated as fact.
CALL_FACTS = [('the rollout starts', ['in March', 'next Monday', 'on the 15th', 'after the pilot']), ('the pilot has', ['20 users', '3 branches', 'two teams', '50 testers']),
              ('the invite link expires after', ['24 hours', '48 hours', '7 days']), ('the integration uses', ['the REST API', 'a nightly file export', 'webhooks']),
              ('the budget is', ['already approved', 'waiting for finance', 'shared with marketing']), ('the release is', ['on Friday', 'next sprint', 'after QA signs off']),
              ('support is handled by', ['the platform team', 'the service desk', 'Ana\'s team']), ('the admin role can', ['register users', 'assign roles', 'approve requests'])]
CALL_PEOPLE = ['Ana', 'Ben', 'Carla', 'Dante', 'Elena', 'Marco', 'Rhea']
CALL_Q = {'the rollout starts': ['When does the rollout start?', 'So when do we start rolling it out?'], 'the pilot has': ['How big is the pilot?', 'How many are in the pilot?'],
          'the invite link expires after': ['How long is the invite link valid?', 'When does the invite link expire?'], 'the integration uses': ['How does the integration work?', 'What does the integration use?'],
          'the budget is': ['Where are we with the budget?', 'Is the budget sorted out?'], 'the release is': ['When is the release?', 'When do we ship this?'],
          'support is handled by': ['Who handles support?', 'Who takes care of support after go-live?'], 'the admin role can': ['What can the admin role do?', 'What is the admin allowed to do?']}
CALL_OPTION = {'the rollout starts': 'start with a small group next month', 'the pilot has': 'start with one team', 'the invite link expires after': 'start with 24 hours',
               'the integration uses': 'use the REST API first', 'the budget is': 'check it with finance this week', 'the release is': 'aim for the next sprint',
               'support is handled by': 'have the platform team cover the first month', 'the admin role can': 'start with registering users and assigning roles'}


def call_answer(r):
    """A question whose answer was said earlier in the call: answer with that fact, short and natural."""
    k, vals = r.choice(CALL_FACTS); v = r.choice(vals); who = r.choice(CALL_PEOPLE); other = r.choice([x for x in CALL_FACTS if x[0] != k]); ov = r.choice(other[1])
    lines = [f'{who}: Just to recap, {k} {v}.', f'{r.choice(CALL_PEOPLE)}: And {other[0]} {ov}.']; r.shuffle(lines); q = r.choice(CALL_Q[k])
    return f'Conversation so far:\n' + '\n'.join(lines) + f'\n\nQuestion to answer now: "{q}"\nWhat should I say?', f'{k[0].upper() + k[1:]} {v}, as {who} mentioned earlier.'


def call_unknown(r):
    """A question the call has no answer for: never invent it; offer an option and say it will be confirmed."""
    k = r.choice(list(CALL_Q)); other = r.choice([x for x in CALL_FACTS if x[0] != k]); q = r.choice(CALL_Q[k])
    return f'Conversation so far:\n{r.choice(CALL_PEOPLE)}: {other[0][0].upper() + other[0][1:]} {r.choice(other[1])}.\n\nQuestion to answer now: "{q}"\nWhat should I say?', f'That is not decided yet. We could {CALL_OPTION[k]}, but I will confirm with the team and get back to you.'


CALL_GENERAL = [  # questions you answer from knowledge, not from the call: answer directly (never "not decided")
    ('What is the difference between let and const in JavaScript?', 'Both are block-scoped. With const you cannot reassign the variable, with let you can. I use const by default and let only when the value has to change.'),
    ('What is a REST API?', 'A REST API exposes resources over HTTP: you use GET to read, POST to create, PUT or PATCH to update and DELETE to remove, and the server answers with a status code and usually JSON.'),
    ('What is the time complexity of binary search?', 'O(log n), because each step halves the part of the sorted list that is left to search.'),
    ('What is the difference between SQL and NoSQL databases?', 'SQL databases store data in tables with a fixed schema and support joins and transactions. NoSQL databases like MongoDB store documents or key-value pairs with a flexible schema and scale out easily.'),
    ('What is a closure in JavaScript?', 'A closure is a function that remembers the variables of the scope where it was created, even after that outer function has returned.'),
    ('How do you handle errors with async and await?', 'I wrap the awaited calls in try and catch, log or show a clear message in the catch, and use finally for cleanup like stopping a loading spinner.'),
    ('What is CI/CD?', 'Continuous integration builds and tests every change automatically; continuous delivery or deployment then ships the tested build to an environment automatically, so releases are small and frequent.'),
    ('What is the difference between unit tests and integration tests?', 'A unit test checks one function or component alone with its dependencies mocked. An integration test checks that several parts work together, for example the API with the real database.'),
    ('What is dependency injection?', 'Dependency injection means a class receives what it needs, like a database client, from outside instead of creating it itself. That makes it easier to test and to swap implementations.'),
    ('What is the virtual DOM in React?', 'React keeps a lightweight copy of the UI in memory, compares the new copy with the old one after a change, and updates only the parts of the real DOM that changed.'),
    ('What is a primary key?', 'A primary key is the column, or set of columns, that uniquely identifies each row in a table. It cannot be null or repeat.'),
    ('What format should the report be, PDF or CSV?', 'It depends on who uses it: CSV if people will filter or import the data, PDF if it is a fixed layout to share or sign off. Many teams give both, CSV for analysis and PDF for sharing.'),
    ('What is the difference between authentication and authorization?', 'Authentication checks who you are, for example with a password or SSO. Authorization checks what you are allowed to do once you are signed in, like which pages or actions you can access.'),
    ('How would you find duplicates in an array?', 'I would go through the array once with a set: if a value is already in the set it is a duplicate, otherwise I add it. That is O(n) time and O(n) space.\n\n```python\ndef duplicates(items):\n    seen, dup = set(), set()\n    for x in items:\n        if x in seen:\n            dup.add(x)\n        seen.add(x)\n    return list(dup)\n```'),
    ('Can you write a function that reverses a string?', 'Sure, in Python slicing does it in one step:\n\n```python\ndef reverse(s):\n    return s[::-1]\n```\n\nIt is O(n) time and O(n) space because it builds a new string.'),
    ('How would you check if a string is a palindrome?', 'Compare the string with its reverse after removing spaces and making it lowercase.\n\n```python\ndef is_palindrome(s):\n    t = \'\'.join(c.lower() for c in s if c.isalnum())\n    return t == t[::-1]\n```\n\nO(n) time and O(n) space.'),
    ('How do you reverse a linked list?', 'I walk the list once and point each node back to the previous one, keeping three pointers: previous, current and next.\n\n```python\ndef reverse(head):\n    prev = None\n    while head:\n        head.next, prev, head = prev, head, head.next\n    return prev\n```\n\nO(n) time and O(1) extra space.'),
    ('What is a race condition?', 'A race condition happens when two operations run at the same time and the result depends on which finishes first, for example two requests updating the same balance. Locks, transactions or atomic operations prevent it.'),
    ('Ano ang pagkakaiba ng GET at POST?', 'Ang GET ay para kumuha ng data at walang binabago sa server. Ang POST ay para magpadala ng data, halimbawa gumawa ng bagong record.'),
    ('Paano mo i-handle ang isang production bug?', 'Una, inaalam ko ang epekto at kung kailangan ng mabilis na rollback o hotfix. Tapos hinahanap ko ang root cause sa logs, gumagawa ng fix na may test, at nagsusulat ng maikling post-mortem.'),
    ('Tell me about yourself.', 'I am a software engineer focused on building and shipping reliable apps. Lately I have been working on internal platforms, making releases faster and the code easier to test. I enjoy turning unclear requirements into simple, working features.'),
    ('What is your biggest weakness?', 'I used to take on too much myself instead of asking for help early. Now I raise blockers in standup the same day and break big tasks into smaller ones so the team can share them.'),
]


def call_general(r):
    """A knowledge, technical or interview question during a call: answer it directly from knowledge (the call does not need to contain the answer)."""
    q, a = r.choice(CALL_GENERAL); k, vals = r.choice(CALL_FACTS); who = r.choice(CALL_PEOPLE)
    return f'Conversation so far:\n{who}: {k[0].upper() + k[1:]} {r.choice(vals)}.\n\nQuestion to answer now: "{q}"\nWhat should I say?', a


MOCK_Q = [('Tell me about a project you are proud of.', 'I led the migration of our reporting tool.'), ('How do you handle a missed deadline?', 'I tell the lead early and agree on a new plan.'),
          ('Why should we choose your product?', 'It is cheaper.'), ('How do you test your code?', 'I write unit tests for the main paths.')]


def mock_feedback(r):
    q, a = r.choice(MOCK_Q)
    return f'Give feedback on this practice answer in 3 short bullets: what was good, what to improve, and one better phrasing.\nQuestion: {q}\nAnswer: {a}', f'- Good: it answers the question directly.\n- Improve: add one concrete example with a result or number.\n- Better: "{a[:-1]}, and as a result we saved time for the team."'


GOAL_AC = {'see my sprint progress on one screen': ['Given I open the sprint page, when it loads, then done, in-progress and remaining points show together', 'Given the sprint changes, when I refresh, then the numbers are up to date'],
           'export the report as a PDF': ['Given I am on the report, when I press Export PDF, then a PDF with the same content downloads', 'Given the report is empty, when I export, then I see a message instead of a blank file'],
           'get a reminder before each meeting': ['Given a meeting starts in 10 minutes, when the reminder time comes, then I get a notification with the meeting title', 'Given a meeting is cancelled, when its time comes, then no reminder is sent'],
           'filter tickets by label': ['Given tickets with different labels, when I choose a label, then only tickets with that label show', 'Given I clear the filter, when the list reloads, then all tickets show again'],
           'reset my password without calling support': ['Given I forgot my password, when I request a reset with my email, then I receive a reset link', 'Given the link is older than 24 hours, when I open it, then it is rejected and I can request a new one'],
           'review merge requests in one list': ['Given I have merge requests to review, when I open the review list, then all of them show with their status', 'Given a merge request is approved, when the list refreshes, then it leaves my list'],
           'search past conversations': ['Given past conversations exist, when I search for a word, then matching conversations show with the word highlighted', 'Given nothing matches, when I search, then I see "No results"'],
           'approve requests from my phone': ['Given a request waits for me, when I open it on my phone, then I can approve or reject it', 'Given I approve it, when I go back, then the request shows as approved']}


def jira_story_ac(r):
    ro, g, b = r.choice(ROLES), r.choice(list(GOAL_AC)), r.choice(BENEFITS)
    q = r.choice([f'Write a user story with acceptance criteria for this: {ro}, wants to {g}.', f'Write a Jira user story with acceptance criteria. Role: {ro}. Goal: {g}. Benefit: {b}.'])
    story = f'As {"an" if ro[0] in "aeiou" else "a"} {ro}, I want to {g}, so that {b if "Benefit" in q else r.choice(BENEFITS)}.'
    return q, story + '\n\nAcceptance criteria:\n' + '\n'.join('- ' + x + '.' for x in GOAL_AC[g])


def meeting_decisions(r):
    ds = r.sample(DECS, r.randint(1, 3)); lines = [f'Decision: {d}.' for d in ds]; lines.insert(r.randint(0, len(lines)), 'Someone asked about lunch.')
    return 'List only the decisions from these notes, one bullet each:\n' + '\n'.join(lines), '\n'.join(f'- {d}' for d in ds)


def meeting_minutes(r):
    t, att, dec, act = r.choice(['Sprint planning', 'Retro', 'Weekly touchpoint', 'Release review']), r.sample(OWNERS, r.randint(2, 4)), r.choice(DECS), (r.choice(OWNERS), r.choice(TASKS), r.choice(DUES))
    return f'Write short minutes. Title: {t}. Attendees: {", ".join(att)}. Decision: {dec}. Action: {act[0]} to {act[1]} by {act[2]}.', f'**{t}**\n\nAttendees: {", ".join(att)}\n\nDecision: {dec}.\n\nAction: {act[0]} will {act[1]} by {act[2]}.'



# ------------------------------------------------------------------ Software Architect
ADR_TITLES = [('Use a message queue between orders and billing', 'orders and billing are tightly coupled and billing outages block checkout', ['Synchronous REST calls', 'A message queue', 'A shared database'], 'A message queue', 'checkout no longer waits for billing', 'we must operate and monitor the queue'),
              ('Adopt a monorepo for the mobile apps', 'three apps duplicate components and drift apart', ['Separate repositories', 'A monorepo', 'A shared npm package only'], 'A monorepo', 'components are shared and versioned together', 'builds need caching to stay fast'),
              ('Store reports as immutable snapshots', 'weekly reports were overwritten and history was lost', ['Overwrite the latest report', 'Immutable dated snapshots', 'Keep only the database rows'], 'Immutable dated snapshots', 'every past report can be reproduced', 'storage grows over time and needs a retention rule'),
              ('Use feature flags for risky releases', 'big releases were rolled back with a full redeploy', ['Branch-based releases', 'Feature flags', 'Blue-green only'], 'Feature flags', 'a bad feature can be switched off in seconds', 'old flags must be removed to avoid clutter')]


def arch_adr(r):
    t, ctx, opts, ch, pos, neg = r.choice(ADR_TITLES); opts = r.sample(opts, len(opts)); st = r.choice(['Proposed', 'Accepted'])
    q = f'Write an ADR. Title: {t}. Status: {st}. Context: {ctx}. Options considered: {"; ".join(opts)}. Decision: {ch}. Positive consequence: {pos}. Negative consequence: {neg}.'
    return q, f'# ADR: {t}\n\n**Status:** {st}\n\n## Context\n{ctx[0].upper() + ctx[1:]}.\n\n## Decision\nWe will use: {ch}.\n\n## Alternatives considered\n' + '\n'.join(f'- {o}' for o in opts) + f'\n\n## Consequences\n- Positive: {pos[0].upper() + pos[1:]}.\n- Negative: {neg[0].upper() + neg[1:]}.'


CRITERIA = ['latency', 'cost', 'operability', 'security', 'time to build']; OPTS = ['REST', 'GraphQL', 'gRPC', 'Queue', 'Batch job', 'Serverless']


def arch_tradeoff(r):
    for _ in range(50):
        cr = r.sample(CRITERIA, r.randint(2, 4)); w = {c: r.randint(1, 5) for c in cr}; op = r.sample(OPTS, r.randint(2, 3)); sc = {o: {c: r.randint(1, 5) for c in cr} for o in op}; tot = {o: sum(w[c] * sc[o][c] for c in cr) for o in op}
        if sorted(tot.values())[-1] != (sorted(tot.values())[-2]): break
    q = 'Weighted decision. Weights: ' + ', '.join(f'{c} {w[c]}' for c in cr) + '. Scores (1-5): ' + '; '.join(f'{o}: ' + ', '.join(f'{c} {sc[o][c]}' for c in cr) for o in op) + '. Return JSON only with terms (each option\'s weighted sum written out as weight*score+..., in the order of the weights), scores (the totals) and winner.'
    terms = {o: '+'.join(f'{w[c]}*{sc[o][c]}' for c in cr) for o in op}
    return q, J({'terms': terms, 'scores': tot, 'winner': max(tot, key=tot.get)})


SVC = ['Web', 'API', 'Auth', 'Billing', 'Orders', 'Search', 'Reports', 'Cache', 'Mailer', 'Users']


def arch_cycle(r):
    n = r.randint(4, 6); nodes = r.sample(SVC, n); edges = []
    for i in range(1, n): edges.append((nodes[r.randint(0, i - 1)], nodes[i]))  # a tree: exactly one parent each, so a back edge makes exactly one cycle
    cyc = []
    if r.random() < 0.6:
        i = r.randint(2, n - 1); anc = [nodes[i]]
        while anc[-1] != nodes[0]: anc.append(next(a for a, b in edges if b == anc[-1]))
        anc = anc[:-1] if r.random() < 0.5 and len(anc) > 2 else anc; top = anc[-1]; edges.append((nodes[i], top)); path = list(reversed(anc)); k = path.index(min(path)); cyc = path[k:] + path[:k]
    r.shuffle(edges)
    return 'Service calls: ' + '; '.join(f'{a} calls {b}' for a, b in edges) + '. Return JSON only with has_cycle (true or false) and cycle (service names starting from the alphabetically first one in the loop, or an empty list).', J({'has_cycle': bool(cyc), 'cycle': cyc})


def arch_spof(r):
    for _ in range(60):
        nodes = r.sample(SVC, r.randint(5, 7)); edges = []
        for c in nodes[:-1]:
            for d in r.sample(nodes[nodes.index(c) + 1:], min(len(nodes) - nodes.index(c) - 1, r.randint(1, 2))): edges.append((c, d))
        fan = {}
        for a, b in edges: fan[b] = fan.get(b, 0) + 1
        top = sorted(fan.values())[-1]
        if list(fan.values()).count(top) == 1 and top >= 2: break
    r.shuffle(edges); worst = max(fan, key=fan.get); order = sorted(fan, key=lambda k: (-fan[k], k))
    return 'Dependencies: ' + '; '.join(f'{a} depends on {b}' for a, b in edges) + '. Which service is the single point of failure candidate (the one most others depend on)? Return JSON only with counts (how many services depend on each service that has dependents, highest first), service and dependents.', J({'counts': {k: fan[k] for k in order}, 'service': worst, 'dependents': fan[worst]})


def arch_mermaid(r):
    ns = r.sample(SVC, r.randint(3, 5)); edges = [(ns[i], ns[r.randint(i + 1, len(ns) - 1)]) for i in range(len(ns) - 1)]; d = r.choice([('left to right', 'LR'), ('top to bottom', 'TD')])
    return f'Draw a Mermaid flowchart ({d[0]}) for: ' + '; '.join(f'{a} calls {b}' for a, b in edges) + '. Return only the diagram.', f'```mermaid\ngraph {d[1]}\n' + '\n'.join(f'  {a} --> {b}' for a, b in edges) + '\n```'


SEC = [('passwords are stored in plain text', 'Critical', 'Credentials at rest: hash with Argon2id or bcrypt and a per-user salt.'), ('the storage bucket is public', 'Critical', 'Public data exposure: make the bucket private and use signed URLs.'),
       ('the API has no rate limiting', 'High', 'Abuse and denial of service: add rate limits per user and per IP.'), ('secrets are committed in the repository', 'Critical', 'Leaked secrets: rotate them now and move them to a secret manager.'),
       ('services talk over plain HTTP inside the network', 'Medium', 'Traffic can be read or changed: use TLS between services.'), ('admin endpoints use the same login as normal users', 'High', 'Privilege escalation: separate admin access and require MFA.'),
       ('user input is placed directly in SQL', 'Critical', 'SQL injection: use parameterized queries.'), ('logs contain full request bodies', 'Medium', 'Sensitive data in logs: redact personal data and tokens before logging.')]


def arch_security(r):
    items = r.sample(SEC, r.randint(1, 3))
    return 'Review this design for security risks. Design notes: ' + '; '.join(i[0] for i in items) + '. Answer as one bullet per risk: "- [Severity] finding".', '\n'.join(f'- [{sv}] {fi}' for _, sv, fi in items)


TYPES = {'string': 'string', 'integer': 'integer', 'boolean': 'boolean', 'number': 'number'}; RES = ['Order', 'Ticket', 'Report', 'Customer']; FIELDS = ['id:integer:required', 'title:string:required', 'status:string:required', 'priority:integer', 'done:boolean', 'amount:number', 'note:string', 'owner:string']


def arch_api(r):
    res = r.choice(RES); fs = r.sample(FIELDS, r.randint(3, 5)); props = {f.split(':')[0]: {'type': TYPES[f.split(':')[1]]} for f in fs}; req = [f.split(':')[0] for f in fs if f.endswith(':required')]
    return f'Write the JSON schema for the {res} request body. Fields (name:type[:required]): ' + ', '.join(fs) + '. Return JSON only.', J({'title': res, 'type': 'object', 'required': req, 'properties': props})


def arch_failure(r):
    svc, dep = r.sample(SVC, 2); to, rt, cb = r.choice([True, False]), r.choice([True, False]), r.choice([True, False]); has = [x for x, f in (('a timeout', to), ('retries with backoff', rt), ('a circuit breaker', cb)) if f]
    q = f'{svc} calls {dep} synchronously. It has {", ".join(has) if has else "no timeout, no retries and no circuit breaker"}. What happens when {dep} is down, and what should be added? Answer in two short sentences.'
    miss = [x for x, f in (('a timeout', to), ('retries with backoff', rt), ('a circuit breaker', cb)) if not f]
    return q, (f'{svc} can hang or fail every request while {dep} is down, and the failure spreads to its callers.' if not to else f'{svc} fails fast while {dep} is down, but without full protection the load can keep hitting {dep}.' if miss else f'{svc} degrades gracefully while {dep} is down.') + (f' Add {", ".join(miss[:-1]) + (" and " if len(miss) > 1 else "") + miss[-1]}, plus a fallback response.' if miss else ' Keep a fallback response and alerting.')


# ------------------------------------------------------------------ Senior Code Reviewer
PATHS = ['src/api/users.ts', 'src/hooks/useProfile.ts', 'app/screens/Orders.tsx', 'server/db/queries.js', 'lib/report.py', 'src/store/cartSlice.ts', 'services/payment.js']; NAMES_V = ['user', 'order', 'report', 'ticket', 'cart', 'invoice']; FN = ['fetchUser', 'loadOrders', 'saveReport', 'getTicket', 'syncCart']
BUGS = [  # (language, code template with {f} {v} {n}, offending line index (0-based), severity, finding, fix)
    ('ts', 'async function show{N}(id: string) {{\n  const {v} = {f}(id);\n  console.log({v}.name);\n}}', 1, 'Major', '`{f}` is async but not awaited, so `{v}` is a Promise and `{v}.name` is undefined.', 'Use `const {v} = await {f}(id);`.'),
    ('tsx', 'useEffect(() => {{\n  {f}({v}Id);\n}}, []);', 2, 'Major', 'The effect uses `{v}Id` but the dependency array is empty, so it runs once with a stale value.', 'Add `{v}Id` to the dependency array: `[{v}Id]`.'),
    ('ts', 'function reducer(state, action) {{\n  state.{v}s.push(action.payload);\n  return state;\n}}', 1, 'Major', 'The reducer mutates `state` directly, so Redux cannot detect the change and the UI will not update.', 'Return a new object: `return {{ ...state, {v}s: [...state.{v}s, action.payload] }};` (or use a Redux Toolkit slice).'),
    ('js', 'const rows = db.query("SELECT * FROM {v}s WHERE name = \'" + name + "\'");', 0, 'Blocker', 'The query is built by string concatenation, which allows SQL injection.', 'Use a parameterized query: `db.query("SELECT * FROM {v}s WHERE name = ?", [name])`.'),
    ('js', 'if (count == "0") {{\n  show{N}Empty();\n}}', 0, 'Minor', 'Loose equality `==` compares a number with a string and coerces types.', 'Use strict equality and the right type: `if (count === 0)`.'),
    ('ts', 'const API_KEY = "sk-live-{n}c9a1f7";\nexport const client = make{N}Client(API_KEY);', 0, 'Blocker', 'A secret is hard-coded in the source and will end up in version control.', 'Read it from an environment variable or secret manager and rotate this key.'),
    ('js', 'for (let i = 0; i <= {v}s.length; i++) {{\n  total += {v}s[i].price;\n}}', 0, 'Major', 'Off-by-one: `<=` reads one element past the end, so `{v}s[i]` is undefined on the last pass.', 'Use `i < {v}s.length`.'),
    ('js', 'fetch(url).then((r) => r.json()).then(show{N});', 0, 'Major', 'The promise has no `.catch`, so a network error becomes an unhandled rejection and the user sees nothing.', 'Add `.catch(handleError)` or use `try/catch` with `await`.'),
    ('js', 'let counter = 0;\nasync function bump() {{\n  const cur = counter;\n  await save{N}(cur + 1);\n  counter = cur + 1;\n}}', 2, 'Major', 'Read-modify-write across an `await`: two concurrent calls read the same `counter` and one update is lost.', 'Serialize the updates (queue or lock) or do the increment atomically in the store.'),
    ('tsx', 'return (\n  <ul>\n    {{{v}s.map(({v}) => <li>{{{v}.name}}</li>)}}\n  </ul>\n);', 2, 'Minor', 'List items have no `key`, so React cannot track them and may re-render or reorder incorrectly.', 'Add a stable key: `<li key={{{v}.id}}>`.'),
    ('py', 'def add_{v}({v}, bucket=[]):\n    bucket.append({v})\n    return bucket', 0, 'Major', 'The mutable default `bucket=[]` is created once and shared by every call.', 'Use `bucket=None` and create the list inside: `if bucket is None: bucket = []`.'),
    ('ts', 'const email = {v}.profile.email;', 0, 'Major', '`{v}.profile` can be undefined, so this throws a TypeError at runtime.', 'Guard it: `const email = {v}?.profile?.email;`.'),
]
CLEAN = [('ts', 'async function show{N}(id: string) {{\n  const {v} = await {f}(id);\n  console.log({v}.name);\n}}'), ('tsx', 'useEffect(() => {{\n  {f}({v}Id);\n}}, [{v}Id]);'), ('js', 'const rows = db.query("SELECT * FROM {v}s WHERE name = ?", [name]);'),
         ('js', 'for (let i = 0; i < {v}s.length; i++) {{\n  total += {v}s[i].price;\n}}'), ('js', 'fetch(url).then((r) => r.json()).then(show{N}).catch(handleError);'), ('tsx', 'return (\n  <ul>\n    {{{v}s.map(({v}) => <li key={{{v}.id}}>{{{v}.name}}</li>)}}\n  </ul>\n);')]


def numbered(code, start): return '\n'.join(f'{start + i} | {ln}' for i, ln in enumerate(code.split('\n')))


def review_snippet(r):
    path = r.choice(PATHS); v = r.choice(NAMES_V); f = r.choice(FN); N = v.capitalize(); n = r.randint(100, 999); start = r.randint(5, 140); sub = dict(v=v, f=f, N=N, n=n)
    if r.random() < 0.12:
        lang, code = r.choice(CLEAN); code = code.format(**sub)
        return f'Review this change in `{path}` (each line starts with its line number):\n```{lang}\n{numbered(code, start)}\n```', 'No blocking issues found in this change.'
    lang, code, idx, sev, fi, fx = r.choice(BUGS); code = code.format(**sub)
    return f'Review this change in `{path}` (each line starts with its line number):\n```{lang}\n{numbered(code, start)}\n```', f'**{sev}** `{path}:{start + idx}` {fi.format(**sub)} Fix: {fx.format(**sub)}'


AACR_CAT = ['Code Defect', 'Maintainability and Readability', 'Performance', 'Security Vulnerability']
SYN_FINDINGS = [('This loop calls the database once per item; batch the lookups.', 'Performance'), ('The error is swallowed silently, so failures will be invisible.', 'Code Defect'), ('This function is 120 lines and does three jobs; split it.', 'Maintainability and Readability'),
                ('User input reaches the shell command without escaping.', 'Security Vulnerability'), ('The result of the cache lookup is never checked for null.', 'Code Defect'), ('The same validation is copied in four places; extract one helper.', 'Maintainability and Readability'),
                ('Sorting inside the render loop repeats on every update; memoize it.', 'Performance'), ('The token is logged in plain text.', 'Security Vulnerability')]


def aacr_rows():
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat'); f = pathlib.Path(os.environ.get('TULAI_FREE_DIR') or (pathlib.Path(base) / 'training' / 'free')) / 'raw' / 'aacr-bench' / 'positive_samples.json'
    out = []
    try:
        for pr in json.loads(f.read_text()):
            for c in pr['comments']:
                note = (c.get('note') or '').strip()
                if c.get('category') in AACR_CAT and not c.get('is_ai_comment') and 25 <= len(note) <= 400 and c.get('path') and isinstance(c.get('from_line'), int) and re.fullmatch(r"[\x20-\x7e]+", note) and 'http' not in note and '```' not in note: out.append((note.replace('\n', ' '), c['category'], c['path'], c['from_line'], c.get('to_line') or c['from_line']))
    except Exception: pass
    return out


def review_classify(r, real=None):
    note, cat = (r.choice(real)[:2] if real and r.random() < 0.7 else r.choice(SYN_FINDINGS))
    return f'Classify this code review comment as exactly one of: Code Defect, Maintainability and Readability, Performance, Security Vulnerability.\nComment: {note}', cat


def review_format(r, real=None):
    if real and r.random() < 0.7: note, cat, path, a, b = r.choice(real)
    else: note, cat = r.choice(SYN_FINDINGS); path = r.choice(PATHS); a = r.randint(3, 200); b = a + r.choice([0, 0, 2, 5])
    loc = f'{path}:{a}' if a == b else f'{path}:{a}-{b}'
    return f'Format this review finding as one line "`file:line` [Category] comment". File: {path}. Lines: {a}{"" if a == b else "-" + str(b)}. Category: {cat}. Comment: {note}', f'`{loc}` [{cat}] {note}'


SEV = [('a security vulnerability that can be exploited', 'Blocker'), ('a crash or data loss in a common path', 'Blocker'), ('a bug in a rare edge case', 'Major'), ('a slow query that affects every page load', 'Major'), ('a naming or formatting inconsistency', 'Minor'), ('a missing comment on a helper', 'Minor')]


def review_severity(r):
    d, s = r.choice(SEV); return r.choice([f'Severity for this review finding: {d}. Choose Blocker, Major or Minor and give one short reason.', f'How severe is {d}? Choose Blocker, Major or Minor and give one short reason.']), f'{s}: ' + {'Blocker': 'it must be fixed before merge.', 'Major': 'it should be fixed in this change or tracked right away.', 'Minor': 'it can be fixed later or left to a follow-up.'}[s]


# ------------------------------------------------------------------ QA and Test Engineering
FIELDS_Q = ['age', 'quantity', 'discount percent', 'password length', 'story points', 'items per page']


def qa_boundary(r):
    f = r.choice(FIELDS_Q); lo = r.randint(0, 20); hi = lo + r.randint(3, 100)
    rows = [(lo - 1, 'rejected'), (lo, 'accepted'), (lo + 1, 'accepted'), (hi - 1, 'accepted'), (hi, 'accepted'), (hi + 1, 'rejected')]
    return f'The field "{f}" accepts whole numbers from {lo} to {hi} inclusive. List the boundary value tests with the expected result.', '\n'.join(f'- {v}: {e}' for v, e in rows)


EDGE = {'text field': ['empty string', 'only spaces', 'maximum length plus one character', 'emoji and accented characters', 'quotes and angle brackets'], 'email field': ['missing @', 'two @ signs', 'spaces inside', 'very long domain', 'upper and lower case'],
        'date field': ['29 February in a leap year', '29 February in a normal year', 'year boundary 31 December to 1 January', 'a date in the past', 'invalid month 13'], 'file upload': ['empty file', 'file at the size limit', 'file over the size limit', 'wrong extension', 'file name with spaces and unicode'],
        'list input': ['empty list', 'one item', 'duplicate items', 'maximum items plus one', 'items in reverse order'], 'password field': ['empty password', 'shorter than the minimum', 'exactly the minimum length', 'only spaces', 'very long password'],
        'search box': ['empty search', 'one letter', 'special characters', 'a very long phrase', 'accented letters'], 'url field': ['missing http or https', 'no domain', 'spaces inside', 'very long address', 'uppercase letters in the host'], 'quantity field': ['zero', 'negative number', 'decimal number', 'maximum value plus one', 'text instead of a number']}


def qa_edge(r):
    k = r.choice(list(EDGE)); return r.choice([f'Give five edge cases to test for a {k}.', f'What are five edge cases a tester should cover for a {k}?']), '\n'.join(f'- {x[0].upper() + x[1:]}' for x in EDGE[k])


LOGS = [('TypeError: Cannot read properties of undefined (reading \'{v}\')', 'code defect', 'a value is undefined where the test expects an object', 'Log the value before the failing line and add a null check or fix the setup that returns undefined.'),
        ('Error: Timeout - Async callback was not invoked within the 5000 ms timeout', 'timing', 'an awaited call never resolved or is too slow for the limit', 'Check for a missing await or mock, then raise the timeout only if the call is legitimately slow.'),
        ('AssertionError: expected {a} to equal {b}', 'assertion', 'the code returned a different value than the test expects', 'Compare the expected and actual values; decide whether the code or the test is wrong.'),
        ('connect ECONNREFUSED 127.0.0.1:5432', 'environment', 'the test database is not running', 'Start the database (or the container) before the test run and check the connection settings.'),
        ('Element not found: [data-testid="{v}"]', 'ui locator', 'the page did not render the element, or the test id changed', 'Open the screenshot, wait for the element explicitly and check that the test id still exists.'),
        ('Snapshot mismatch: 1 snapshot failed', 'snapshot', 'the rendered output changed', 'Review the diff; update the snapshot only if the change is intended.')]


CATS = 'code defect, timing, assertion, environment, ui locator or snapshot'


def qa_failure(r):
    log, cat, cause, step = r.choice(LOGS); v = r.choice(['name', 'email', 'submitBtn', 'cartTotal']); a, b = r.randint(1, 9), r.randint(10, 20); log = log.format(v=v, a=a, b=b); t = r.choice(['login.spec', 'cart.test', 'report.spec', 'profile.test'])
    return f'Test {t} failed with: {log}\nReturn JSON only with category (one of: ' + CATS + '), likely_cause and next_step.', J({'category': cat, 'likely_cause': cause, 'next_step': step})


def qa_coverage(r):
    tot = r.choice([200, 400, 500, 800, 1000, 1200]); cov = r.randint(tot // 3, tot); th = r.choice([70, 75, 80, 85, 90]); need = -(-th * tot // 100)
    return f'Coverage report: {cov} of {tot} lines covered. The required threshold is {th}%. Return JSON only with covered, total, hundreds (total divided by 100), needed (threshold percent times hundreds), coverage_percent (one decimal), status (PASS or FAIL) and lines_short (needed minus covered, 0 if it passes).', J({'covered': cov, 'total': tot, 'hundreds': tot // 100, 'needed': need, 'coverage_percent': math.floor(cov * 1000 / tot + 0.5) / 10, 'status': 'PASS' if cov * 100 >= th * tot else 'FAIL', 'lines_short': max(0, need - cov)})


IMPACT = [('the app crashes', 'Critical'), ('data is lost', 'Critical'), ('a wrong total is shown', 'Major'), ('a button does nothing', 'Major'), ('a label is misaligned', 'Minor'), ('a tooltip has a typo', 'Minor')]
BUG_TITLES = ['Export fails for empty reports', 'Cart total ignores discounts', 'Login button stays disabled', 'Profile photo is cut off', 'Reminder fires twice']


def qa_register(r):
    t = r.choice(BUG_TITLES); n = r.randint(1, 60); imp, sev = r.choice(IMPACT); steps = r.sample(['Open the app', 'Sign in', 'Go to Reports', 'Press Export', 'Add an item to the cart', 'Open the profile page'], r.randint(2, 3)); exp = r.choice(['The action completes without errors', 'The correct value is shown', 'The page displays correctly']); act = f'Instead {imp}'
    q = f'Write an issue register row (Markdown table with the header). ID: BUG-{n:03d}. Title: {t}. Steps: {"; ".join(steps)}. Expected: {exp}. Actual: {act}. Impact: {imp}. Severity rule: crash or data loss = Critical, wrong result or broken action = Major, cosmetic = Minor.'
    return q, '| ID | Title | Steps to reproduce | Expected | Actual | Severity |\n| --- | --- | --- | --- | --- | --- |\n' + f'| BUG-{n:03d} | {t} | ' + ' '.join(f'{i + 1}. {s}.' for i, s in enumerate(steps)) + f' | {exp}. | {act}. | {sev} |'


def qa_prioritize(r):
    names = r.sample(['login', 'cart', 'search', 'report', 'profile', 'export', 'sync'], 4); hist = {}
    for _ in range(80):
        hist = {n: ''.join(r.choice('PPPF') for _ in range(6)) for n in names}; rate = {n: hist[n].count('F') for n in names}
        if len(set(rate.values())) == 4: break
    order = sorted(names, key=lambda n: (-hist[n].count('F'), n))
    return 'Test history, last 6 runs (P pass, F fail): ' + '; '.join(f'{n}_test {hist[n]}' for n in names) + '. Return JSON only with failures (the number of F per test) and run_first (the tests ordered by failures, highest first).', J({'failures': {f'{n}_test': hist[n].count('F') for n in names}, 'run_first': [f'{n}_test' for n in order]})


SPECS = [('isAdult', 'age', 18, 'true when age is at least 18'), ('canCheckout', 'items', 1, 'true when there is at least 1 item'), ('isStrongPassword', 'length', 12, 'true when the password has at least 12 characters'), ('canVote', 'age', 18, 'true when age is at least 18'), ('hasFreeShipping', 'total', 50, 'true when the total is at least 50'),
         ('isLongEnough', 'chars', 8, 'true when there are at least 8 characters'), ('canBorrow', 'points', 100, 'true when the points are at least 100'), ('isPassing', 'grade', 75, 'true when the grade is at least 75'), ('isHeavy', 'kilos', 20, 'true when the weight is at least 20 kilos'), ('canRetry', 'attempts', 3, 'true when attempts are at least 3')]


def qa_cases(r):
    fn, p, th, rule = r.choice(SPECS)
    return f'Write unit test case names for `{fn}({p})`, which returns {rule}. Use bullets.', f'- {fn} returns true when {p} is {th}\n- {fn} returns false when {p} is {th - 1}\n- {fn} returns true when {p} is well above {th}\n- {fn} returns false for 0\n- {fn} rejects a negative value\n- {fn} rejects non-numeric input'


TR_CATS = ['TestCase', 'TestMethod', 'ImproveTest', 'RefactorTest', 'FixTest']


def testreviews_rows():
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat'); f = pathlib.Path(os.environ.get('TULAI_FREE_DIR') or (pathlib.Path(base) / 'training' / 'free')) / 'raw' / 'test-reviews' / 'Test Reviews v1.csv'; out = []
    try:
        for row in csv.DictReader(open(f, encoding='utf-8-sig', errors='replace')):
            cats = [c.strip() for c in (row.get('Request Category') or '').split(',') if c.strip()]; t = (row.get('Review comment Text') or '').strip().replace('\n', ' ')
            if row.get('Validation') == 'TP' and len(cats) == 1 and cats[0] in TR_CATS and 20 <= len(t) <= 300 and re.fullmatch(r"[\x20-\x7e]+", t) and 'http' not in t and '```' not in t: out.append((t, cats[0]))
    except Exception: pass
    return out


def qa_review_class(r, real=None):
    if not real: t, c = r.choice([('Please add one more test for the empty list.', 'TestCase'), ('Could you rename this test so it says what it checks?', 'RefactorTest'), ('This test passes even when the code is wrong; the assertion is too weak.', 'ImproveTest')])
    else: t, c = r.choice(real)
    return f'A reviewer commented on a pull request that changes tests. Classify the request as exactly one of: TestCase (add a test case), TestMethod, ImproveTest, RefactorTest, FixTest.\nComment: {t}', c


# ------------------------------------------------------------------ Frontend Specialist
PROPS = [('label', 'string'), ('onPress', '() => void'), ('disabled', 'boolean'), ('count', 'number'), ('items', 'string[]'), ('title', 'string'), ('loading', 'boolean'), ('onChange', '(value: string) => void')]; COMPS = ['Button', 'Card', 'ListRow', 'Badge', 'SearchBox', 'Avatar']


def fe_props(r):
    c = r.choice(COMPS); ps = r.sample(PROPS, r.randint(3, 4)); req = [bool(r.getrandbits(1)) for _ in ps]
    q = f'Write the typed props for a React Native {c} component. Props (name: type, required or optional): ' + ', '.join(f'{n}: {t} ({"required" if q_ else "optional"})' for (n, t), q_ in zip(ps, req)) + '. Return only the TypeScript interface.'
    return q, f'interface {c}Props {{\n' + '\n'.join(f'  {n}{"" if q_ else "?"}: {t};' for (n, t), q_ in zip(ps, req)) + '\n}'


SLICES = [('cart', [('items', 'string[]', '[]'), ('total', 'number', '0')]), ('session', [('token', 'string', "''"), ('loading', 'boolean', 'false')]), ('filters', [('query', 'string', "''"), ('page', 'number', '1')]), ('profile', [('name', 'string', "''"), ('premium', 'boolean', 'false')])]


def fe_slice(r):
    n, fs = r.choice(SLICES); N = n.capitalize(); fs = r.sample(fs, len(fs)); st = ', '.join(f'{a}: {b}' for a, b, _ in fs)
    q = f'Write a Redux Toolkit slice named "{n}" in TypeScript. State fields (name: type = initial): ' + ', '.join(f'{a}: {b} = {c}' for a, b, c in fs) + '. One reducer per field named setField that stores the payload. Return only the code.'
    code = "import { createSlice, PayloadAction } from '@reduxjs/toolkit';\n\ninterface " + N + 'State {\n' + '\n'.join(f'  {a}: {b};' for a, b, _ in fs) + '\n}\n\nconst initialState: ' + N + 'State = {\n' + '\n'.join(f'  {a}: {c},' for a, _, c in fs) + '\n};\n\nconst ' + n + 'Slice = createSlice({\n  name: \'' + n + "',\n  initialState,\n  reducers: {\n" + '\n'.join(f"    set{a[0].upper() + a[1:]}(state, action: PayloadAction<{b}>) {{\n      state.{a} = action.payload;\n    }}," for a, b, _ in fs) + '\n  },\n});\n\nexport const { ' + ', '.join(f'set{a[0].upper() + a[1:]}' for a, _, _ in fs) + ' } = ' + n + 'Slice.actions;\nexport default ' + n + 'Slice.reducer;'
    return q, code


def lum(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]; c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]; return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True); return (la + 0.05) / (lb + 0.05)


COLORS = ['#000000', '#ffffff', '#767676', '#595959', '#0057b8', '#c15f3c', '#2e8b57', '#f2f2f2', '#ff0000', '#ffd700', '#808080', '#1f1e1c', '#7cc4ff', '#999999']


def fe_contrast(r):
    for _ in range(40):
        a, b = r.sample(COLORS, 2); ratio = contrast(a, b)
        if abs(ratio - 4.5) > 0.03 and abs(ratio - 3) > 0.03: break
    rr = math.floor(ratio * 100 + 0.5) / 100
    return f'Text color {a} on background {b}. Return JSON only with the WCAG contrast ratio (two decimals), aa_normal_text (needs 4.5:1) and aa_large_text (needs 3:1).', J({'ratio': rr, 'aa_normal_text': ratio >= 4.5, 'aa_large_text': ratio >= 3})


A11Y = [('<img src={{{u}}} />', 'Image has no alt text: screen readers announce nothing useful.', '<img src={{{u}}} alt="{d}" />'), ('<button onClick={{{h}}}><Icon name="{d}" /></button>', 'Icon-only button has no accessible name.', '<button onClick={{{h}}} aria-label="{d}"><Icon name="{d}" /></button>'),
        ('<input type="text" value={{{u}}} onChange={{{h}}} />', 'The input has no label, so assistive technology cannot name it.', '<label htmlFor="{d}">{D}</label>\n<input id="{d}" type="text" value={{{u}}} onChange={{{h}}} />'), ('<div onClick={{{h}}}>{D}</div>', 'A clickable div is not keyboard focusable and has no role.', '<button type="button" onClick={{{h}}}>{D}</button>'),
        ('<TouchableOpacity onPress={{{h}}}><Image source={{{u}}} /></TouchableOpacity>', 'The touchable has no accessibility label or role in React Native.', '<TouchableOpacity onPress={{{h}}} accessibilityRole="button" accessibilityLabel="{d}"><Image source={{{u}}} /></TouchableOpacity>')]


def fe_a11y(r):
    d = r.choice(['profile', 'search', 'close', 'settings', 'cart']); u, h = r.choice(['photoUrl', 'avatar', 'src']), r.choice(['onClose', 'handleClick', 'open']); code, why, fix = r.choice(A11Y); sub = dict(u=u, h=h, d=d, D=d.capitalize())
    return 'Find the accessibility problem and give the fixed JSX.\n```jsx\n' + code.format(**sub) + '\n```', f'Problem: {why}\nFix:\n```jsx\n' + fix.format(**sub) + '\n```'


FE_FACTS = [('Which React Native component replaces a div?', 'View.'), ('Which React Native component shows text instead of span or p?', 'Text.'), ('Which React Native component replaces an img tag?', 'Image.'), ('Which React Native component replaces an input tag?', 'TextInput.'),
            ('A FlatList with 5000 rows scrolls slowly. What should I check first?', 'Give it a stable keyExtractor, memoize the row component with React.memo, avoid inline functions in renderItem, and set getItemLayout if rows have a fixed height.'),
            ('A React list re-renders every row when one item changes. What is the usual fix?', 'Wrap the row in React.memo, pass stable props (useCallback and useMemo), and give every item a stable key.'),
            ('When should I use useMemo?', 'Only for expensive calculations or to keep an object or array prop stable for a memoized child; do not wrap everything.'),
            ('How should errors from an async thunk be handled in Redux Toolkit?', 'Use createAsyncThunk and handle the rejected case in extraReducers, store a serializable error message in state, and show it in the UI.'),
            ('Which React Native API replaces localStorage?', 'AsyncStorage (or a secure store such as Keychain for secrets).'),
            ('What unit does React Native use for style sizes?', 'Unitless density-independent numbers, not px strings.'),
            ('How do I prevent a regression when I change a shared component?', 'Add or update a test for the old behavior first, keep the props API backward compatible, and run the screens that use it before merging.')]


FE_PARAPHRASE = [('Which React Native component lets me show a scrolling list of many items without lag?', 'FlatList (or SectionList), not ScrollView with map.'), ('Which component do I use for long, scrollable data in React Native?', 'FlatList.'), ('What is the best component for rendering hundreds of rows in React Native?', 'FlatList: it virtualizes the rows.'),
                 ('What replaces px in React Native styles?', 'Nothing: React Native styles use unitless numbers (density-independent pixels).'), ('Which unit do React Native styles use for width and height?', 'Unitless numbers, which are density-independent pixels.'), ('Do I write px in React Native style values?', 'No: use plain numbers, which are density-independent pixels.'),
                 ('Which React Native component replaces a div?', 'View.'), ('What is the React Native equivalent of a div?', 'View.'), ('Which React Native component shows text?', 'Text.')]


def fe_fact(r): q, a = r.choice(FE_FACTS + FE_PARAPHRASE * 2); return q, a


# ------------------------------------------------------------------ Engineering Productivity and Reporting
import datetime as _dt


def _dates(r, base, spread):
    return base - _dt.timedelta(days=r.randint(0, spread))


def eng_stale(r):
    th = r.choice([10, 14, 21]); ks = r.sample(range(10, 99), r.randint(4, 6)); sts = [r.choice(['In Progress', 'In Review', 'To Do', 'Done', 'Blocked']) for _ in ks]; ag = [r.randint(0, 40) for _ in ks]
    ages = {f'PAY-{k}': a for k, s_, a in zip(ks, sts, ag) if s_ != 'Done'}; stale = sorted([(k, a) for k, a in ages.items() if a > th], key=lambda x: (-x[1], x[0]))
    return f'A ticket is stale if it is not Done and was last updated more than {th} days ago. Tickets: ' + '; '.join(f'PAY-{k} | {s_} | updated {a} days ago' for k, s_, a in zip(ks, sts, ag)) + '. Return JSON only with ages (days since the last update, for the tickets that are not Done) and stale (ticket keys, oldest update first).', J({'ages': ages, 'stale': [k for k, _ in stale]})


def eng_unreviewed(r):
    ids = r.sample(range(100, 400), r.randint(4, 6)); op = [r.randint(0, 7) for _ in ids]; rv = [r.choice([0, 0, 1, 2]) for _ in ids]
    waiting = {f'#{i}': o for i, o, v in zip(ids, op, rv) if v == 0}; need = sorted([(k, a) for k, a in waiting.items() if a >= 2], key=lambda x: (-x[1], x[0]))
    return 'Open pull requests: ' + '; '.join(f'#{i} open {o} days, {v} reviews' for i, o, v in zip(ids, op, rv)) + '. A pull request needs attention if it has 0 reviews and has been open 2 days or more. Return JSON only with waiting_days (days open, for the pull requests with 0 reviews) and needs_review (pull request numbers, longest waiting first).', J({'waiting_days': waiting, 'needs_review': [k for k, _ in need]})


RISK = {('none', 'passed'): 'no PR yet', ('none', 'failed'): 'no PR yet', ('none', 'none'): 'no PR yet', ('open', 'passed'): 'waiting for review', ('open', 'failed'): 'blocked by CI', ('open', 'none'): 'CI not run', ('merged', 'passed'): 'done', ('merged', 'failed'): 'regression risk', ('merged', 'none'): 'done, CI unknown'}


def eng_correlate(r):
    ks = r.sample(range(10, 99), r.randint(3, 5)); st = [(r.choice(['none', 'open', 'merged']), r.choice(['passed', 'failed', 'none'])) for _ in ks]
    line = lambda k, p, c: f'PAY-{k}: ' + ('no pull request' if p == 'none' else f'pull request {p}') + (', CI ' + c if c != 'none' and p != 'none' else (', no CI run' if p != 'none' else ''))
    return 'Delivery data: ' + '; '.join(line(k, p, c) for k, (p, c) in zip(ks, st)) + '. Return JSON only mapping each ticket to one of: no PR yet, waiting for review, blocked by CI, CI not run, done, regression risk, done, CI unknown.', J({f'PAY-{k}': RISK[(p, c if p != 'none' else 'none') if p != 'none' else (p, c)] for k, (p, c) in zip(ks, st)})


def eng_bottleneck(r):
    stages = ['To Do', 'In Progress', 'In Review', 'QA']
    for _ in range(60):
        tk = [[r.randint(0, 6) for _ in stages] for _ in range(r.randint(3, 4))]; sm = [sum(t[i] for t in tk) for i in range(4)]; avg = [x / len(tk) for x in sm]
        if sorted(avg)[-1] > sorted(avg)[-2]: break
    i = avg.index(max(avg))
    return 'Days each ticket spent per stage (' + ', '.join(stages) + '): ' + '; '.join(f'T{n + 1} ' + '/'.join(map(str, t)) for n, t in enumerate(tk)) + f'. There are {len(tk)} tickets. Return JSON only with sums (total days per stage, in the order given), averages (sum divided by {len(tk)}, one decimal), bottleneck (the stage with the highest average) and average_days (one decimal).', J({'sums': sm, 'averages': [math.floor(a * 10 + 0.5) / 10 for a in avg], 'bottleneck': stages[i], 'average_days': math.floor(avg[i] * 10 + 0.5) / 10})


def eng_report(r):
    merged, hrs, runs, ok, stale = r.randint(3, 40), r.randint(2, 60), r.choice([20, 40, 50, 80]), None, r.randint(0, 8); ok = r.randint(runs // 2, runs); rate = ok * 100 // runs
    risk = 'High' if rate < 80 or stale >= 5 else 'Medium' if rate < 90 or stale >= 2 else 'Low'
    return f'Weekly engineering report. Merged pull requests: {merged}. Average time to first review: {hrs} hours. CI: {ok} of {runs} runs passed. Stale tickets: {stale}. Delivery risk rule: High if CI pass rate is under 80% or 5 or more stale tickets, Medium if under 90% or 2 or more stale, else Low.', f'**Weekly engineering report**\n\n- Merged pull requests: {merged}\n- Average time to first review: {hrs} hours\n- CI pass rate: {rate}% ({ok} of {runs})\n- Stale tickets: {stale}\n\n**Delivery risk: {risk}**'


def eng_dedupe(r):
    d = _dt.date(2026, r.randint(1, 12), r.randint(1, 28)); mon = d - _dt.timedelta(days=d.weekday()); y, w, _ = mon.isocalendar(); wid = f'{y}-W{w:02d}'; other = (mon - _dt.timedelta(days=7)).isocalendar(); ex = [f'eng-report-{other[0]}-W{other[1]:02d}'] + ([f'eng-report-{wid}'] if r.random() < 0.5 else [])
    q = f'Existing reports: {", ".join(r.sample(ex, len(ex)))}. Create the weekly engineering report for the week of {mon.isoformat()} (ISO week {wid}). Rule: never create a duplicate for the same ISO week, and always keep a dated snapshot.'
    return q, (f'A report for {wid} already exists (eng-report-{wid}). I will not create a duplicate. Open it, or ask me to refresh its snapshot.' if f'eng-report-{wid}' in ex else f'No report exists for {wid}. Creating eng-report-{wid} and saving a snapshot as snapshot-{wid}.json.')



# ------------------------------------------------------------------ Charts and Executive Reporting
# The model writes a small Vega-Lite-style chart spec (title, data.values, mark, encoding) and evidence-based insights; the reporting UI draws the chart.
def f1(x): return f'{math.floor(x * 10 + 0.5) / 10:.1f}'


SERIES = [('Sprint velocity', 'sprint', 'S', 'points', 'high', (15, 45)), ('Open bugs', 'week', 'W', 'bugs', 'low', (5, 30)), ('Review time in hours', 'week', 'W', 'hours', 'low', (4, 48)), ('CI pass rate in percent', 'week', 'W', 'percent', 'high', (70, 99)),
          ('Lead time in days', 'sprint', 'S', 'days', 'low', (2, 14)), ('Merged pull requests', 'week', 'W', 'merged', 'high', (5, 40))]


def series(r):
    name, xn, pre, yn, better, (lo, hi) = r.choice(SERIES); n = r.randint(4, 6); vals = [r.randint(lo, hi) for _ in range(n)]
    return name, xn, yn, better, [f'{pre}{i + 1}' for i in range(n)], vals


def spec_line(name, xn, yn, xs, vs): return {'title': name, 'data': {'values': [{xn: x, yn: v} for x, v in zip(xs, vs)]}, 'mark': 'line', 'encoding': {'x': {'field': xn, 'type': 'ordinal'}, 'y': {'field': yn, 'type': 'quantitative'}}}


def trend_text(vs):
    a, b = vs[0], vs[-1]; d = b - a; pct = d * 100 / a; dr = 'up' if d > 0 else 'down' if d < 0 else 'flat'
    return f'Trend: {dr} from {a} to {b} ({d:+d}, {"+" if pct >= 0 else "-"}{f1(abs(pct))}%)'


def chart_line(r):
    name, xn, yn, better, xs, vs = series(r); pairs = ', '.join(f'{x} {v}' for x, v in zip(xs, vs)); i = vs.index(max(vs) if better == 'high' else min(vs))
    q = f'Series {name} by {xn}: {pairs}. Return JSON only with spec (a line chart in Vega-Lite style: title, data.values, mark, encoding with x ordinal and y quantitative), calc (first, last, change, percent_change, sum and average, one decimal for percent_change and average) and insights (trend with first-to-last change and percent change, best {xn} where {"higher" if better == "high" else "lower"} is better, average to one decimal).'
    a, b = vs[0], vs[-1]; d = b - a; pc = d * 100 / a; sm = sum(vs)
    calc = {'first': a, 'last': b, 'change': d, 'percent_change': math.floor(pc * 10 + 0.5) / 10, 'sum': sm, 'average': math.floor(sm / len(vs) * 10 + 0.5) / 10}
    return q, J({'spec': spec_line(name, xn, yn, xs, vs), 'calc': calc, 'insights': [trend_text(vs), f'Best {xn}: {xs[i]} ({vs[i]})', f'Average: {f1(sm / len(vs))}']})


STATUS = ['To Do', 'In Progress', 'In Review', 'Done', 'Blocked', 'QA']


def chart_bar(r):
    cats = r.sample(STATUS, r.randint(3, 5)); vals = [r.randint(1, 30) for _ in cats]; rows = sorted(zip(cats, vals), key=lambda x: (-x[1], x[0])); tot = sum(vals); top = rows[0]
    q = 'Count by status: ' + ', '.join(f'{c} {v}' for c, v in zip(cats, vals)) + '. Return JSON only with spec (a bar chart in Vega-Lite style, bars sorted from largest to smallest) and insights (largest category with its share of the total, and the total).'
    spec = {'title': 'Tickets by status', 'data': {'values': [{'status': c, 'tickets': v} for c, v in rows]}, 'mark': 'bar', 'encoding': {'x': {'field': 'status', 'type': 'nominal'}, 'y': {'field': 'tickets', 'type': 'quantitative'}}}
    return q, J({'spec': spec, 'insights': [f'Largest: {top[0]} ({top[1]} of {tot}, {f1(top[1] * 100 / tot)}%)', f'Total: {tot}']})


CHOOSE = [('line', 'values change over time', ['weekly CI pass rate for the last 12 weeks', 'sprint velocity over 8 sprints', 'open bugs per day this quarter', 'review time per week since January', 'daily active users for the past 30 days', 'monthly revenue from January to December', 'average build time per day over the last two months', 'weekly number of incidents since March', 'sprint burndown: remaining points per day', 'error rate per hour over the last 48 hours', 'release count per month for two years', 'lead time per sprint for the last 10 sprints', 'number of open bugs per month for the last year', 'tickets closed per week over the last 6 months', 'daily logins over the past 90 days', 'deployments per week since January', 'average response time per day for the last month', 'story points completed per sprint over the last 12 sprints']),
          ('bar', 'it compares values across categories', ['tickets per team this sprint', 'merged pull requests per developer', 'defects per module', 'story points per epic', 'number of bugs per team', 'open tickets per assignee', 'deployments per service last month', 'test failures per test suite', 'hours logged per project this week', 'incidents per product area', 'pull requests per repository this quarter', 'story points delivered per squad', 'incidents per service this quarter', 'open tickets per assignee', 'failed builds per repository this week', 'support calls per region', 'defects found per tester this sprint', 'pull requests per team this month']),
          ('pie', 'it shows parts of one total with only a few parts', ['share of tickets by priority (4 priorities)', 'split of work between feature, bug and chore', 'share of time in 3 stages', 'share of budget across 3 departments', 'percentage of tickets by type (bug, task, story)', 'split of test results into passed, failed and skipped', 'share of traffic by device (desktop, mobile, tablet)', 'portion of incidents by severity (3 levels)', 'percentage of total tickets by status (3 statuses)', 'what share of the budget each of 4 teams uses']),
          ('histogram', 'it shows how one numeric value is distributed', ['distribution of review times across 300 pull requests', 'spread of ticket cycle times for the quarter', 'distribution of story point estimates', 'spread of response times across 1,000 requests', 'distribution of pull request sizes in lines changed', 'how long 400 builds took, grouped into ranges', 'distribution of bug ages in days across 250 open bugs', 'spread of employee commute times', 'distribution of test durations across 2,000 tests']),
          ('scatter', 'it shows the relationship between two numeric values', ['story points versus cycle time for 80 tickets', 'pull request size versus review time', 'team size versus velocity', 'lines of code versus number of defects for 60 modules', 'test coverage versus incident count per service', 'build duration versus number of dependencies', 'ticket age versus number of comments', 'team experience in years versus bugs reported', 'memory use versus response time for 100 requests']),
          ('box', 'it shows spread and outliers across groups', ['cycle time per team with outliers', 'approval time per department, showing the median and outliers', 'estimate error per squad', 'deployment duration per environment, showing median and outliers', 'cycle time for each team, comparing medians and outliers', 'page load time per region with quartiles', 'ticket resolution time per priority, showing the spread and outliers', 'test run time per pipeline with median and extremes']),
          ('stack', 'it shows how parts add up to a total across categories or time', ['tickets by status for each sprint', 'incidents by type per quarter', 'work type per team', 'tickets by priority for each month', 'story points by work type per sprint', 'incidents by severity for each quarter', 'pull requests by state (open, merged, closed) per week', 'time spent by activity for each team member', 'incidents by priority for each week', 'tickets by type for each sprint', 'defects by root cause per quarter', 'commits by team for each month', 'support calls by channel for each week'])]


def chart_choose(r):
    t, why, ds = r.choice(CHOOSE); d = r.choice(ds)
    return f'Which chart type fits? Choose from: line, bar, pie, histogram, scatter, box, stack. Data: {d}.', f'{t}: {why}.'


def chart_summary(r):
    name, xn, yn, better, xs, vs = series(r); a, b = vs[0], vs[-1]; pct = (b - a) * 100 / a; good = pct if better == 'high' else -pct
    risk = 'At risk' if good <= -15 else 'Watch' if good <= -5 else 'On track'; step = {'At risk': 'Review the cause with the team this week and agree a recovery action.', 'Watch': 'Check the next two data points before escalating.', 'On track': 'Keep the current approach and review again next period.'}[risk]
    dr = 'rising' if pct > 0 else 'falling' if pct < 0 else 'flat'
    q = f'Create an executive summary (Working, Headline, Risk, Next step) for {name} ({"higher" if better == "high" else "lower"} is better): ' + ', '.join(f'{x} {v}' for x, v in zip(xs, vs)) + '. Risk rule: At risk if the result is 15% or more worse than the start, Watch if 5% or more worse, else On track.'
    return q, f'- Working: first {a}, last {b}, change {b - a:+d}, percent change {"+" if pct >= 0 else "-"}{f1(abs(pct))}%.\n- Headline: {name} is {dr} {f1(abs(pct))}% over {len(vs)} {xn}s (from {a} to {b}).\n- Risk: {risk}.\n- Next step: {step}'


def chart_rates(r):
    n = r.randint(3, 5); pl = [r.choice([20, 25, 30, 35, 40]) for _ in range(n)]; cm = [r.randint(pl[i] // 3, pl[i]) for i in range(n)]; rates = [c * 100 // p for c, p in zip(cm, pl)]
    if len(set(rates)) != n or sorted(rates)[0] == sorted(rates)[1]: return chart_rates(r)
    return 'Planned vs completed story points per sprint: ' + ', '.join(f'S{i + 1} {c}/{p}' for i, (c, p) in enumerate(zip(cm, pl))) + f'. There are {n} sprints. Return JSON only with completion_rates (percent per sprint, whole numbers), sum (of the rates), average_rate (sum divided by {n}, one decimal) and weakest (sprint with the lowest rate).', J({'completion_rates': rates, 'sum': sum(rates), 'average_rate': float(f1(sum(rates) / n)), 'weakest': f'S{rates.index(min(rates)) + 1}'})


T2C_TYPES = {'line': 'line', 'bar': 'bar', 'stack': 'stack (stacked bar)', 'pie': 'pie', 'scatter': 'scatter', 'histogram': 'histogram', 'box': 'box', 'fill-between': 'fill-between (area)', 'stair': 'stair', 'error': 'error (error bars)', 'ecdf': 'ecdf'}


def text2chart_rows():
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat'); f = pathlib.Path(os.environ.get('TULAI_FREE_DIR') or (pathlib.Path(base) / 'training' / 'free')) / 'raw' / 'text2chart31' / 'Text2Chart-31-train.json'; out = []
    try:
        for e in json.loads(f.read_text()):
            t = e.get('plot-type')
            if t not in T2C_TYPES: continue
            desc = (e.get('description') or '').split('\n')[0].strip(); tbl = '\n'.join((e.get('data-table') or '').strip().split('\n')[:4])
            if 40 <= len(desc) <= 420 and tbl and len(tbl) <= 300 and re.fullmatch(r"[\x20-\x7e\n]+", desc + tbl) and 'http' not in desc: out.append((desc, tbl, t))
    except Exception: pass
    return out


def chart_type_real(r, real=None):
    if not real: return chart_choose(r)
    d, tbl, t = r.choice(real)
    return f'Which chart type fits this request? Choose from: line, bar, stack (stacked bar), pie, scatter, histogram, box, fill-between (area), stair, error (error bars), ecdf.\nRequest: {d}\nData (first rows):\n{tbl}', f'{T2C_TYPES[t]}.'



# ------------------------------------------------------------------ GitLab Browser Operator
GL_PROJECTS = ['byteblaze/a11y-webring.club', 'platform/map-governance-ui', 'payments/api', 'mobile/app', 'docs/handbook', 'ops/deploy-tools']; GL_USERS = ['byteblaze', 'jsantos', 'maria', 'ben']; GL_BRANCHES = ['main', 'develop', 'release/1.4', 'feature/PAY-12-login']
GL_ROUTES = [('see the open issues', '/-/issues/?state=opened'), ('create a new issue', '/-/issues/new'), ('see the open merge requests', '/-/merge_requests/?state=opened'), ('create a new merge request', '/-/merge_requests/new'), ('see the pipelines', '/-/pipelines'),
             ('see the branches', '/-/branches'), ('see the tags', '/-/tags'), ('see the commits on {b}', '/-/commits/{b}'), ('browse the files on {b}', '/-/tree/{b}'), ('open the issue board', '/-/boards'), ('see the milestones', '/-/milestones'),
             ('see the labels', '/-/labels'), ('see the project members', '/-/project_members'), ('see the CI/CD jobs', '/-/jobs'), ('compare two branches', '/-/compare'), ('open the wiki', '/-/wikis/home')]
GL_GLOBAL = [('see my todos', '/dashboard/todos'), ('see the merge requests assigned to me', '/dashboard/merge_requests?assignee_username={u}'), ('see the issues assigned to me', '/dashboard/issues?assignee_username={u}'), ('explore public projects', '/explore/projects')]


def gl_url(r):
    if r.random() < 0.25:
        ph, path = r.choice(GL_GLOBAL); u = r.choice(GL_USERS); return f'In GitLab, which page path should the browser open to {ph}? Answer with the path only.', path.format(u=u).replace(u, u) if '{u}' not in path else path.format(u=u)
    ph, suf = r.choice(GL_ROUTES); p, b = r.choice(GL_PROJECTS), r.choice(GL_BRANCHES)
    return f'In GitLab, which page path should the browser open to {ph.format(b=b)} in the project {p}? Answer with the path only.', f'/{p}{suf.format(b=b)}'


def _wf(r):
    p = r.choice(GL_PROJECTS); title = r.choice(['Login page crashes on Safari', 'Add export to PDF', 'Update the install guide', 'Reminders fire twice']); desc = r.choice(['Steps to reproduce are in the comments.', 'Needed for the next sprint.', 'Reported by support.'])
    br = r.choice(['feature/PAY-12-login', 'bugfix/APP-7-timeout', 'chore/update-deps']); iid = r.randint(2, 480); cm = r.choice(['Looks good to me.', 'Please add a test for the empty case.', 'Can you rename this variable?'])
    return {
        'create_issue': (f'Create an issue titled "{title}" in {p}', [
            (f'/{p}/-/issues', ['New issue', 'Search or filter results', 'Open', 'Closed', 'All'], 'click', 'New issue', None, f'the browser is on /{p}/-/issues/new'),
            (f'/{p}/-/issues/new', ['Title', 'Description', 'Assignee', 'Labels', 'Create issue'], 'type', 'Title', title, f'the Title field shows "{title}"'),
            (f'/{p}/-/issues/new', ['Title', 'Description', 'Assignee', 'Labels', 'Create issue'], 'type', 'Description', desc, 'the Description field is filled'),
            (f'/{p}/-/issues/new', ['Title', 'Description', 'Assignee', 'Labels', 'Create issue'], 'click', 'Create issue', None, f'the URL is /{p}/-/issues/<number> and the heading is "{title}"')]),
        'create_branch': (f'Create the branch {br} from main in {p}', [
            (f'/{p}/-/branches', ['New branch', 'Search by branch name', 'Active', 'Stale', 'All'], 'click', 'New branch', None, f'the browser is on /{p}/-/branches/new'),
            (f'/{p}/-/branches/new', ['Branch name', 'Create from', 'Create branch'], 'type', 'Branch name', br, f'the Branch name field shows {br}'),
            (f'/{p}/-/branches/new', ['Branch name', 'Create from', 'Create branch'], 'click', 'Create branch', None, f'the branch {br} is listed in /{p}/-/branches')]),
        'open_mr': (f'Open a merge request from {br} into main in {p}', [
            (f'/{p}/-/merge_requests/new', ['Source branch', 'Target branch', 'Compare branches and continue'], 'select', 'Source branch', br, f'the Source branch shows {br}'),
            (f'/{p}/-/merge_requests/new', ['Source branch', 'Target branch', 'Compare branches and continue'], 'select', 'Target branch', 'main', 'the Target branch shows main'),
            (f'/{p}/-/merge_requests/new', ['Source branch', 'Target branch', 'Compare branches and continue'], 'click', 'Compare branches and continue', None, 'the New merge request form is open'),
            (f'/{p}/-/merge_requests/new', ['Title', 'Description', 'Assignee', 'Reviewer', 'Create merge request'], 'type', 'Title', title, f'the Title field shows "{title}"'),
            (f'/{p}/-/merge_requests/new', ['Title', 'Description', 'Assignee', 'Reviewer', 'Create merge request'], 'click', 'Create merge request', None, f'the URL is /{p}/-/merge_requests/<number> and the state is Open')]),
        'review_mr': (f'Approve and comment on merge request !{iid} in {p}', [
            (f'/{p}/-/merge_requests/{iid}', ['Approve', 'Merge', 'Comment', 'Pipeline passed'], 'type', 'Write a comment or drag your files here…', cm, 'the comment box shows the text'),
            (f'/{p}/-/merge_requests/{iid}', ['Approve', 'Merge', 'Comment', 'Pipeline passed'], 'click', 'Comment', None, 'the comment appears in the discussion'),
            (f'/{p}/-/merge_requests/{iid}', ['Approve', 'Merge', 'Comment', 'Pipeline passed'], 'click', 'Approve', None, 'an Approved badge appears')]),
        'check_pipeline': (f'Check whether the latest pipeline of {p} passed', [
            (f'/{p}', ['Code', 'Issues', 'Merge requests', 'Build', 'Settings'], 'navigate', f'/{p}/-/pipelines', None, f'the browser is on /{p}/-/pipelines'),
            (f'/{p}/-/pipelines', ['Run pipeline', 'All', 'Finished', 'Branches', 'Tags'], 'click', 'the Status badge in the top row', None, 'the pipeline page opens and shows passed or failed')])}


def gl_step(r):
    wf = _wf(r); k = r.choice(list(wf)); task, steps = wf[k]; i = r.randrange(len(steps)); page, ctl, act, tgt, val, ver = steps[i]
    q = f'Task: {task}. Step {i + 1} of {len(steps)}. Current page: {page}. Visible controls: ' + ' '.join(f'[{c}]' for c in ctl) + '. Return JSON only with action (click, type, select or navigate), target, value (or null) and verify (what must be true after this step).'
    return q, J({'action': act, 'target': tgt, 'value': val, 'verify': ver})


GL_VERIFY = [('an Approved badge', 'Approved by you', 'No approvals yet', 'click Approve again and read any error message'), ('the new branch in the list', 'Branch {b} is listed', 'No branches match your search', 'check the branch name and reload the branch list'),
             ('the new issue page', 'Issue #{n}: {t}', "Title can't be blank", 'type a title and press Create issue again'), ('pipeline status passed', 'Status: passed', 'Status: failed', 'open the failed job and read its log'),
             ('merge request state Merged', 'State: Merged', 'State: Open, merge blocked: pipeline must succeed', 'fix or wait for the pipeline, then press Merge')]


def gl_verify(r):
    e, ok, bad, nxt = r.choice(GL_VERIFY); sub = dict(b=r.choice(GL_BRANCHES), n=r.randint(2, 480), t=r.choice(['Login page crashes', 'Add export'])); good = r.random() < 0.5
    return f'Task check. Expected after the last step: {e}. The page now shows: {(ok if good else bad).format(**sub)}. Return JSON only with done (true or false) and next (what to do next, or none).', J({'done': good, 'next': 'none' if good else nxt})


GL_API = [('list the open issues of a project', 'GET', '/projects/{id}/issues?state=opened'), ('create an issue in a project', 'POST', '/projects/{id}/issues'), ('list the open merge requests of a project', 'GET', '/projects/{id}/merge_requests?state=opened'), ('create a merge request', 'POST', '/projects/{id}/merge_requests'),
          ('merge a merge request with iid {m}', 'PUT', '/projects/{id}/merge_requests/{m}/merge'), ('approve a merge request with iid {m}', 'POST', '/projects/{id}/merge_requests/{m}/approve'), ('list the failed pipelines of a project', 'GET', '/projects/{id}/pipelines?status=failed'),
          ('retry pipeline {pl}', 'POST', '/projects/{id}/pipelines/{pl}/retry'), ('create the branch {b} from main', 'POST', '/projects/{id}/repository/branches?branch={b}&ref=main'), ('list the commits of the branch {b}', 'GET', '/projects/{id}/repository/commits?ref_name={b}'),
          ('add a comment to merge request {m}', 'POST', '/projects/{id}/merge_requests/{m}/notes')]


def gl_api(r):
    d, m, p = r.choice(GL_API); sub = dict(id=r.randint(2, 9999), m=r.randint(2, 480), pl=r.randint(100, 9999), b=r.choice(['develop', 'release-1.4', 'fix-login']))
    return f'Which GitLab REST API call can {d.format(**sub)} (project id {sub["id"]})? Answer with the method and the path only, using /api/v4.', f'{m} /api/v4{p.format(**sub)}'


def gl_mr_ready(r):
    pipe = r.choice(['passed', 'passed', 'failed', 'running']); have, need = r.randint(0, 3), r.choice([1, 2]); th = r.choice([0, 0, 1, 3]); conf = r.choice([False, False, True]); draft = r.choice([False, False, True])
    bl = ([] if pipe == 'passed' else ['pipeline not passed']) + ([f'needs {need - have} more approvals'] if have < need else []) + ([f'{th} unresolved threads'] if th else []) + (['merge conflicts'] if conf else []) + (['still a draft'] if draft else [])
    return f'Merge request facts: pipeline {pipe}; approvals {have} of {need}; unresolved threads {th}; merge conflicts {"yes" if conf else "no"}; draft {"yes" if draft else "no"}. Return JSON only with ready (true or false) and blockers (a list, in this order: pipeline, approvals, threads, conflicts, draft).', J({'ready': not bl, 'blockers': bl})


GL_CI = [('Which .gitlab-ci.yml keyword lists the order of the pipeline phases?', 'stages'), ('Which .gitlab-ci.yml keyword holds the shell commands a job runs?', 'script'), ('Which keyword saves files from a job so later jobs can download them?', 'artifacts'), ('Which keyword speeds up jobs by reusing downloaded dependencies between runs?', 'cache'),
         ('Which keyword decides when a job is created, replacing the older only and except?', 'rules'), ('Which keyword lets a job start before the whole previous stage finishes?', 'needs'), ('Which keyword makes a job wait for a person to press play?', 'when: manual'), ('Which keyword picks the Docker image a job runs in?', 'image')]


def gl_ci(r): return r.choice(GL_CI)


def webarena_gitlab_rows():
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat'); f = pathlib.Path(os.environ.get('TULAI_FREE_DIR') or (pathlib.Path(base) / 'training' / 'free')) / 'raw' / 'webarena-gitlab' / 'test.raw.json'; out = []
    try:
        for e in json.loads(f.read_text()):
            ev = e.get('eval') or {}; u = ev.get('reference_url')
            if e.get('sites') == ['gitlab'] and 'url_match' in (ev.get('eval_types') or []) and isinstance(u, str) and u.startswith('__GITLAB__/') and 'ref_url' not in u:
                path = u.replace('__GITLAB__', '').replace('%5B%5D', '[]').replace('%20', ' ')
                if len(path) <= 140 and re.fullmatch(r"[\x20-\x7e]+", e['intent'] + path): out.append((e['intent'], path))
    except Exception: pass
    return out


def gl_webarena(r, real=None):
    if not real: return gl_url(r)
    i, p = r.choice(real); return f'A GitLab task: "{i}". Which page path should the browser open to do it? Answer with the path only.', p


# ------------------------------------------------------------------ Senior UI/UX Engineer
SPACING = [4, 8, 12, 16, 24, 32, 48, 64]


def ui_snap(r):
    for _ in range(40):
        v = r.randint(2, 70); d = sorted((abs(v - s), s) for s in SPACING)
        if d[0][0] != d[1][0]: break
    return f'Snap {v}px to the nearest value of the spacing scale {", ".join(map(str, SPACING))}. Answer with the number and px only.', f'{d[0][1]}px'


def ui_typescale(r):
    base, ratio = r.choice([14, 16, 18]), r.choice([1.2, 1.25, 1.333]); vals = [math.floor(base * ratio ** k + 0.5) for k in range(6)]
    return f'Modular type scale: base {base}px, ratio {ratio}. Return JSON only with sizes: the font size in whole px for steps 0 to 5.', J({'sizes': vals})


def ui_passes(r):
    bg = r.choice(['#ffffff', '#f2f2f2', '#000000', '#1f1e1c']); cands = r.sample(['#777777', '#595959', '#333333', '#999999', '#cccccc', '#ffffff', '#767676', '#000000', '#c15f3c', '#0057b8'], 3)
    ok = [c for c in cands if abs(contrast(c, bg) - 4.5) > 0.03 and contrast(c, bg) >= 4.5]; amb = [c for c in cands if abs(contrast(c, bg) - 4.5) <= 0.03]
    if amb: return ui_passes(r)
    return f'Which of {", ".join(cands)} pass WCAG AA for normal text (4.5:1) on the background {bg}? Return JSON only with a list named passing, in the order given.', J({'passing': ok})


def ui_breakpoint(r):
    w = r.choice([320, 375, 414, 600, 639, 640, 768, 800, 1023, 1024, 1280, 1440, 1920]); bp, cols = ('mobile', 1) if w < 640 else ('tablet', 2) if w < 1024 else ('desktop', 3)
    return f'Rule: under 640px is mobile with 1 column, 640 to 1023px is tablet with 2 columns, 1024px and wider is desktop with 3 columns. Viewport {w}px wide. Return JSON only with breakpoint and columns.', J({'breakpoint': bp, 'columns': cols})


def ui_tokens(r):
    name = r.choice(['brand', 'accent', 'danger', 'success']); hx = r.choice(['#0057b8', '#c15f3c', '#2e8b57', '#ff0000', '#ffd700', '#1f1e1c', '#7cc4ff', '#f2f2f2'])
    best = '#ffffff' if contrast(hx, '#ffffff') >= contrast(hx, '#000000') else '#000000'
    return f'Create design tokens for the color "{name}" {hx}. The "on" color is whichever of #ffffff or #000000 has the higher contrast with it. Return JSON only with color-{name} and color-on-{name}.', J({f'color-{name}': hx, f'color-on-{name}': best})


def ui_review(r):
    px = r.choice([10, 11, 12, 13, 14, 16]); fg, bg = r.sample(['#999999', '#595959', '#333333', '#cccccc', '#0057b8', '#767676', '#ffffff', '#000000'], 2); h = r.choice([32, 40, 44, 48])
    while abs(contrast(fg, bg) - 4.5) <= 0.03: fg, bg = r.sample(['#999999', '#595959', '#333333', '#cccccc', '#0057b8', '#ffffff', '#000000'], 2)
    ratio = math.floor(contrast(fg, bg) * 100 + 0.5) / 100; items = []
    if px < 14: items.append(f'Text size {px}px is below 14px for body text.')
    if contrast(fg, bg) < 4.5: items.append(f'Contrast {ratio}:1 is below 4.5:1.')
    if h < 44: items.append(f'Touch target height {h}px is below 44px.')
    return f'Review this mobile button label. Font size {px}px, text {fg} on {bg}, button height {h}px. Rules: body text at least 14px, contrast at least 4.5:1, touch target at least 44px high. List the problems as bullets with the measured value, or say "No problems found."', '\n'.join(f'- {x}' for x in items) if items else 'No problems found.'


UX_FACTS = [('What does visual hierarchy do in an interface?', 'It guides the eye to the most important thing first, using size, weight, color, contrast and spacing.'), ('Why use a spacing scale such as 4, 8, 12, 16, 24?', 'It keeps spacing consistent, speeds up decisions and makes layouts align.'),
            ('Why keep a design system?', 'Reusable components and tokens keep the product consistent and make changes cheaper.'), ('How many levels of text emphasis are usually enough on one screen?', 'Three: a clear heading, body text and secondary text.'),
            ('What is a good order for designing a responsive page?', 'Start with the smallest screen, then add layout changes at wider breakpoints (mobile first).'), ('When is color alone not enough to show a state?', 'Always: also add text, an icon or a pattern, so people who cannot tell the colors apart understand it.'),
            ('What should every interactive element have besides a hover style?', 'A visible focus style for keyboard users, a pressed state, and a disabled state when it can be disabled.')]


def ux_fact(r): return r.choice(UX_FACTS)


# ------------------------------------------------------------------ Senior React Engineer
RX_BUGS = [  # (code, offending line index, severity, finding, fix)
    ('function {N}() {{\n  const [n, setN] = useState(0);\n  setN(n + 1);\n  return <p>{{n}}</p>;\n}}', 2, 'Blocker', 'State is set during render, which triggers another render forever.', 'Move the update into an event handler or an effect.'),
    ('useEffect(() => {{\n  window.addEventListener("resize", {f});\n}}, []);', 1, 'Major', 'The listener is never removed, so it leaks and stacks up on every mount.', 'Return a cleanup: `return () => window.removeEventListener("resize", {f});`.'),
    ('useEffect(async () => {{\n  const data = await {f}();\n  set{N}(data);\n}}, []);', 0, 'Major', 'An effect callback must not be async: it returns a Promise instead of a cleanup function.', 'Define an async function inside the effect and call it.'),
    ('const [{v}, set{N}] = useState(props.{v});', 0, 'Minor', 'State copied from a prop does not update when the prop changes.', 'Use the prop directly, or derive the value during render; reset state with a key if it must restart.'),
    ('{{{v}s.map(({v}, i) => <li key={{i}}>{{{v}.name}}</li>)}}', 0, 'Minor', 'The array index is used as a key, so reordering or inserting breaks item identity.', 'Use a stable id: `key={{{v}.id}}`.'),
    ('props.{v}.name = "x";', 0, 'Major', 'Props are read-only; mutating them causes bugs and is ignored by React.', 'Copy the value or lift the change to the parent through a callback.'),
    ('if ({v}) {{\n  const [open, setOpen] = useState(false);\n}}', 1, 'Blocker', 'A hook is called conditionally, which breaks the rules of hooks and corrupts state order.', 'Call hooks at the top level of the component, before any condition or return.'),
    ('const style = {{ color: "red" }};\nreturn <Child style={{style}} onClick={{() => {f}()}} />;', 1, 'Minor', 'New object and function props are created on every render, so a memoized child re-renders each time.', 'Hoist the style or use useMemo and useCallback for the handler.')]
RX_CLEAN = ['useEffect(() => {{\n  const id = setInterval({f}, 1000);\n  return () => clearInterval(id);\n}}, []);', '{{{v}s.map(({v}) => <li key={{{v}.id}}>{{{v}.name}}</li>)}}', 'const [{v}, set{N}] = useState(null);\nif (!{v}) return null;']


def rx_snippet(r):
    path = r.choice(['src/components/List.tsx', 'src/pages/Orders.tsx', 'src/hooks/useCart.ts', 'src/App.tsx']); v = r.choice(NAMES_V); f = r.choice(FN); N = v.capitalize(); start = r.randint(4, 120); sub = dict(v=v, f=f, N=N)
    if r.random() < 0.12: code = r.choice(RX_CLEAN).format(**sub); return f'Review this React change in `{path}` (each line starts with its line number):\n```tsx\n{numbered(code, start)}\n```', 'No blocking issues found in this change.'
    code, idx, sev, fi, fx = r.choice(RX_BUGS); code = code.format(**sub)
    return f'Review this React change in `{path}` (each line starts with its line number):\n```tsx\n{numbered(code, start)}\n```', f'**{sev}** `{path}:{start + idx}` {fi} Fix: {fx.format(**sub)}'


RX_STATE = [('a form field that only one component uses', 'Local state with useState.'), ('a value two sibling components both need', 'Lift the state up to their closest common parent.'), ('the signed-in user needed by many distant components', 'Context (or a small store); it changes rarely.'),
            ('data fetched from an API that should be cached and refreshed', 'A server-state tool such as React Query or RTK Query, not hand-written state.'), ('state shared across the whole app with many actions and devtools needs', 'Redux Toolkit.'),
            ('a value that can be calculated from props or other state', 'Do not store it: compute it during render (useMemo only if it is expensive).'), ('the current page and filters in a list view', 'The URL (search params), so it can be shared and survives a refresh.')]


def rx_state(r): d, a = r.choice(RX_STATE); return f'In React, where should I keep {d}? Answer in one sentence.', a


RX_FACTS = [('What are the two rules of hooks?', 'Call hooks only at the top level (not in conditions, loops or nested functions), and only from React function components or custom hooks.'), ('When does useEffect run its cleanup function?', 'Before the next effect runs and when the component unmounts.'),
            ('What does an empty dependency array in useEffect mean?', 'The effect runs once after the first render (and cleans up on unmount).'), ('Why does React need a key on list items?', 'It identifies each item between renders so it can update, move or remove the right one.'),
            ('What does React.memo do?', 'It skips re-rendering a component when its props have not changed (shallow comparison).'), ('When should I use useCallback?', 'When passing a function to a memoized child or as a dependency, so its identity stays stable.'),
            ('How do I stop a fetch from updating state after the component unmounted?', 'Abort it in the effect cleanup (AbortController) or ignore the result with a flag.')]


def rx_fact(r): return r.choice(RX_FACTS)


# ------------------------------------------------------------------ Senior React Native Engineer
RN_BUGS = [
    ('<ScrollView>\n  {{{v}s.map(({v}) => <Row key={{{v}.id}} {{...{v}}} />)}}\n</ScrollView>', 1, 'Major', 'A long list is rendered with ScrollView and map, so every row is mounted at once.', 'Use FlatList with keyExtractor and renderItem so rows are virtualized.'),
    ('<View onPress={{{f}}}>\n  <Text>{N}</Text>\n</View>', 0, 'Major', '`View` has no onPress, so the tap does nothing.', 'Use `Pressable` (or TouchableOpacity) with accessibilityRole="button".'),
    ('const styles = {{ width: 375, height: 812 }};', 0, 'Minor', 'Hard-coded device pixel sizes break on other screens.', 'Use flex, percentages or `useWindowDimensions()`.'),
    ('<TextInput value={{{v}}} onChangeText={{set{N}}} />', 0, 'Minor', 'The input can be covered by the keyboard and has no label.', 'Wrap the screen in KeyboardAvoidingView and add accessibilityLabel (and a visible label).'),
    ('useEffect(() => {{\n  {f}().then(set{N});\n}}, []);', 1, 'Major', 'State may be set after the screen unmounts, causing a warning and a leak.', 'Ignore the result in the cleanup (a cancelled flag) or abort the request.'),
    ('<Image source={{{{ uri: {v}Url }}}} />', 0, 'Minor', 'A remote image has no size, so it renders at 0x0 in React Native.', 'Give it a width and height (and resizeMode).'),
    ('shadowColor: "#000",\nshadowOpacity: 0.2,', 0, 'Minor', 'iOS shadow props do nothing on Android.', 'Add `elevation` for Android (or use a cross-platform shadow helper).'),
    ('console.log({v});', 0, 'Minor', 'console.log left in the code slows release builds and may leak data.', 'Remove it or use a logger that is disabled in production.')]


def rn_snippet(r):
    path = r.choice(['src/screens/Orders.tsx', 'src/components/Row.tsx', 'app/screens/Profile.tsx', 'src/hooks/useOrders.ts']); v = r.choice(NAMES_V); f = r.choice(FN); N = v.capitalize(); start = r.randint(4, 120); sub = dict(v=v, f=f, N=N)
    if r.random() < 0.12:
        code = '<FlatList data={{{v}s}} keyExtractor={{(item) => item.id}} renderItem={{renderRow}} />'.format(**sub)
        return f'Review this React Native change in `{path}` (each line starts with its line number):\n```tsx\n{numbered(code, start)}\n```', 'No blocking issues found in this change.'
    code, idx, sev, fi, fx = r.choice(RN_BUGS); code = code.format(**sub)
    return f'Review this React Native change in `{path}` (each line starts with its line number):\n```tsx\n{numbered(code, start)}\n```', f'**{sev}** `{path}:{start + idx}` {fi} Fix: {fx}'


RN_FACTS = [('What is the difference between shadows on iOS and Android in React Native?', 'iOS uses the shadow props (shadowColor, shadowOffset, shadowOpacity, shadowRadius); Android uses elevation.'), ('How do I handle the hardware back button on Android in React Native?', 'Use the BackHandler API (or let React Navigation handle it).'),
            ('How do I move to another screen in React Navigation?', 'Call `navigation.navigate("ScreenName", params)` from the current screen.'), ('Which component should I use for a long scrolling list in React Native?', 'FlatList (or SectionList), not ScrollView with map.'),
            ('How do I read the screen size in React Native?', 'Use `useWindowDimensions()` so the layout updates on rotation.'), ('Where should I store an authentication token on a phone?', 'In secure storage (Keychain on iOS, Keystore on Android), not in plain AsyncStorage.'),
            ('Which prop makes a touchable readable by screen readers?', 'accessibilityLabel, together with accessibilityRole.'), ('What should be tested on both iOS and Android before a release?', 'Navigation, permissions, keyboard behavior, safe areas, and the hardware back button on Android.')]


def rn_fact(r): return r.choice(RN_FACTS)


def rn_release(r):
    items = [('all tests pass', r.choice([True, True, False])), ('crash-free sessions above 99%', r.choice([True, True, False])), ('both iOS and Android builds signed', r.choice([True, True, False])), ('privacy and permission texts reviewed', r.choice([True, True, False])), ('release notes written', r.choice([True, True, False]))]
    miss = [n for n, ok in items if not ok]
    return 'React Native release checklist: ' + '; '.join(f'{n} {"yes" if ok else "no"}' for n, ok in items) + '. Return JSON only with ready (true or false) and missing (the items that are "no", in the order given).', J({'ready': not miss, 'missing': miss})


# ------------------------------------------------------------------ Senior Frontend QA
FQ_COMPS = [('SaveButton', 'onSave', 'Save', 'button'), ('LoginForm', 'onSubmit', 'Sign in', 'button'), ('SearchBox', 'onSearch', 'Search', 'button'), ('ExportMenu', 'onExport', 'Export', 'button')]


def fq_rtl(r):
    c, h, label, role = r.choice(FQ_COMPS); times = r.choice([1, 1, 2])
    q = f'Write a React Testing Library test for {c}: when the user clicks the "{label}" {role}{" twice" if times == 2 else ""}, the {h} callback is called {times} time{"s" if times > 1 else ""}. Return only the test.'
    clicks = '\n'.join(f"  await userEvent.click(screen.getByRole('{role}', {{ name: /{label.lower()}/i }}));" for _ in range(times))
    return q, f"test('{c} calls {h} when {label} is clicked{' twice' if times == 2 else ''}', async () => {{\n  const {h} = jest.fn();\n  render(<{c} {h}={{{h}}} />);\n{clicks}\n  expect({h}).toHaveBeenCalledTimes({times});\n}});"


FQ_PAGES = [('login', '/login'), ('dashboard', '/dashboard'), ('settings', '/settings'), ('reports', '/reports')]; VIEWS = [('mobile', 375, 812), ('tablet', 768, 1024), ('desktop', 1440, 900)]


def fq_visual(r):
    n, p = r.choice(FQ_PAGES); v, w, h = r.choice(VIEWS)
    return f'Write a Playwright visual regression test for the {n} page at {p} on a {v} viewport of {w}x{h}. Return only the test.', f"test('{n} page looks right on {v}', async ({{ page }}) => {{\n  await page.setViewportSize({{ width: {w}, height: {h} }});\n  await page.goto('{p}');\n  await expect(page).toHaveScreenshot('{n}-{v}.png');\n}});"


def fq_matrix(r):
    plats = r.sample(['iOS 17', 'iOS 16', 'Android 14', 'Android 13', 'Chrome', 'Safari', 'Firefox'], r.randint(2, 4)); sizes = r.sample(['phone', 'tablet', 'desktop'], r.randint(1, 3)); n = len(plats) * len(sizes)
    return f'Test matrix: platforms {", ".join(plats)}; sizes {", ".join(sizes)}. Return JSON only with runs (the number of combinations) and first (the first combination as "platform / size").', J({'runs': n, 'first': f'{plats[0]} / {sizes[0]}'})


FQ_MAP = {'Button.tsx': ['Button.test.tsx', 'Form.test.tsx'], 'Form.tsx': ['Form.test.tsx', 'Checkout.test.tsx'], 'Card.tsx': ['Card.test.tsx'], 'Header.tsx': ['Header.test.tsx', 'Layout.test.tsx'], 'api.ts': ['api.test.ts', 'Checkout.test.tsx', 'Form.test.tsx']}


def fq_regression(r):
    ch = r.sample(list(FQ_MAP), r.randint(1, 3)); run = sorted({t for c in ch for t in FQ_MAP[c]})
    return 'Test map: ' + '; '.join(f'{k} -> {", ".join(v)}' for k, v in FQ_MAP.items()) + f'. Changed files: {", ".join(ch)}. Return JSON only with run (the test files to run, no duplicates, sorted alphabetically).', J({'run': run})


GENERATORS = {'jira_issue_type': jira_issue_type, 'jira_subtask': jira_subtask, 'jira_link': jira_link, 'jira_field': jira_field, 'jira_jql': jira_jql, 'jira_points': jira_points, 'jira_velocity': jira_velocity, 'jira_forecast': jira_forecast,
              'jira_story': jira_story, 'jira_priority': jira_priority, 'jira_honest': jira_honest, 'git_cmd': git_cmd, 'git_commit': git_commit, 'git_branch': git_branch, 'report_rag': report_rag, 'report_status': report_status, 'report_risk': report_risk,
              'arch_adr': arch_adr, 'arch_tradeoff': arch_tradeoff, 'arch_cycle': arch_cycle, 'arch_spof': arch_spof, 'arch_mermaid': arch_mermaid, 'arch_security': arch_security, 'arch_api': arch_api, 'arch_failure': arch_failure,
              'review_snippet': review_snippet, 'review_classify': review_classify, 'review_format': review_format, 'review_severity': review_severity, 'qa_boundary': qa_boundary, 'qa_edge': qa_edge, 'qa_failure': qa_failure, 'qa_coverage': qa_coverage, 'qa_register': qa_register, 'qa_prioritize': qa_prioritize, 'qa_cases': qa_cases, 'qa_review_class': qa_review_class,
              'fe_props': fe_props, 'fe_slice': fe_slice, 'fe_contrast': fe_contrast, 'fe_a11y': fe_a11y, 'fe_fact': fe_fact, 'eng_stale': eng_stale, 'eng_unreviewed': eng_unreviewed, 'eng_correlate': eng_correlate, 'eng_bottleneck': eng_bottleneck, 'eng_report': eng_report, 'eng_dedupe': eng_dedupe,
              'chart_line': chart_line, 'chart_bar': chart_bar, 'chart_choose': chart_choose, 'chart_summary': chart_summary, 'chart_rates': chart_rates, 'chart_type_real': chart_type_real,
              'gl_url': gl_url, 'gl_step': gl_step, 'gl_verify': gl_verify, 'gl_api': gl_api, 'gl_mr_ready': gl_mr_ready, 'gl_ci': gl_ci, 'gl_webarena': gl_webarena, 'ui_snap': ui_snap, 'ui_typescale': ui_typescale, 'ui_passes': ui_passes, 'ui_breakpoint': ui_breakpoint, 'ui_tokens': ui_tokens, 'ui_review': ui_review, 'ux_fact': ux_fact,
              'rx_snippet': rx_snippet, 'rx_state': rx_state, 'rx_fact': rx_fact, 'rn_snippet': rn_snippet, 'rn_fact': rn_fact, 'rn_release': rn_release, 'fq_rtl': fq_rtl, 'fq_visual': fq_visual, 'fq_matrix': fq_matrix, 'fq_regression': fq_regression,
              'meeting_actions': meeting_actions, 'meeting_actions_notes': meeting_actions_notes, 'call_answer': call_answer, 'call_unknown': call_unknown, 'mock_feedback': mock_feedback, 'jira_story_ac': jira_story_ac, 'meeting_decisions': meeting_decisions, 'meeting_minutes': meeting_minutes}


BANNED = set()  # SHA-256 fingerprints of the self-test questions (training-config/acceptance-prompts.json, filled in by skill-data.py): never trained


def banned(k): import hashlib; return bool(BANNED) and hashlib.sha256(k.encode()).hexdigest() in BANNED


GENERATORS['jira_concept'] = jira_concept
try:  # Coding AI practice (scripts/coding-practice.py): renames, review bugs, fixes from failing tests, small algorithms; all verified by test/coding-practice.py
    import importlib.util as _cu; _cs = _cu.spec_from_file_location('coding_practice', pathlib.Path(__file__).with_name('coding-practice.py')); _cp = _cu.module_from_spec(_cs); _cs.loader.exec_module(_cp); GENERATORS.update(_cp.GENERATORS)
except FileNotFoundError: pass
GENERATORS['call_general'] = call_general  # added last: earlier generators keep the same random draws


def rows(pack_ids, seed, taken, system, row):
    """Chat rows for the chosen packs: (rows, counts). `row(None, [], question, answer)` builds a chat row; questions in `taken` (gate and pack checks) never appear."""
    cat = {p['id']: p for p in catalog()}; out, counts = [], {}; real = sprint_rows(); aacr = aacr_rows(); trv = testreviews_rows(); t2c = text2chart_rows(); wag = webarena_gitlab_rows(); seen = set(taken)
    def gen(name, r):
        fn = GENERATORS[name]
        return fn(r, real) if name == 'jira_velocity' else fn(r, aacr or None) if name in ('review_classify', 'review_format') else fn(r, trv or None) if name == 'qa_review_class' else fn(r, t2c or None) if name == 'chart_type_real' else fn(r, wag or None) if name == 'gl_webarena' else fn(r)
    for pid in pack_ids:
        p = cat.get(pid)
        if not p: continue
        if p.get('springData'):  # Spring Boot AI: verified Spring Boot 4.1.1 practice + official docs examples + Spring Guides + (by your choice) Fuleee completions
            import importlib.util as _su; _ss = _su.spec_from_file_location('springboot_data', pathlib.Path(__file__).with_name('springboot-data.py')); sd = _su.module_from_spec(_ss); _ss.loader.exec_module(sd)
            got = 0
            for q, a in sd.rows(seed):
                k = ' '.join(q.lower().split())
                if k in seen or banned(k): continue
                seen.add(k); out.append(row(None, [], q, a)); got += 1
            counts[pid] = got; continue
        if p.get('codeData'):  # Coding AI: checked rows from the five downloaded coding datasets (scripts/coding-data.py), not generated
            import importlib.util as _u; _s = _u.spec_from_file_location('coding_data', pathlib.Path(__file__).with_name('coding-data.py')); cd = _u.module_from_spec(_s); _s.loader.exec_module(cd)
            got = 0
            for q, a in cd.rows(seed, taken=seen):
                k = ' '.join(q.lower().split())
                if k in seen or banned(k): continue
                seen.add(k); out.append(row(None, [], q, a)); got += 1
            r = random.Random(seed ^ 4049); gens = [g for g in p.get('generators', []) if g in GENERATORS]; tries = 0; practice = []; want = got + p.get('practiceRows', 0)  # plus practice written for the checked skills
            while gens and got < want and tries < p.get('practiceRows', 0) * 40:
                tries += 1; q, a = gen(gens[tries % len(gens)], r); k = ' '.join(q.lower().split())
                if k in seen or banned(k): continue
                seen.add(k); out.append(row(None, [], q, a)); got += 1; practice.append(row(None, [], q, a))
            out += practice * 2; got += len(practice) * 2  # the practice for the checked skills is seen 3 times: it is a small set next to the datasets
            counts[pid] = got; continue
        r = random.Random(seed ^ sum(map(ord, pid)) * 7919); n, got, tries, i = p.get('rows', 200), 0, 0, 0; gens = p['generators']
        while got < n and tries < n * 80:
            tries += 1; name = gens[i % len(gens)]; i += 1; fn = GENERATORS[name]
            q, a = gen(name, r); k = ' '.join(q.lower().split())
            if k in seen or banned(k): continue
            seen.add(k); out.append(row(None, [], q, a)); got += 1
        counts[pid] = got
    combo, ccount = combined(pack_ids, cat, seed, taken, gen, len(out)); out += [row(None, [], q, a) for q, a in combo]
    if ccount: counts['combined'] = ccount
    return out, counts


COMBO_ASK = ['Two tasks. Answer both, numbered.', 'I need two things. Answer each one under its number.', 'Do both, in order:', 'Dalawang tanong ito. Sagutin mo pareho, may numero.']


def combined(pack_ids, cat, seed, taken, gen, n_rows):
    """All skill packs in one brain that work together: each row asks two tasks from two different packs at once (Jira + Charts, Meeting + QA, ...),
    and the answer does both, each exactly as its own pack would. About 1 row in 12, so the packs practise being used together, not only one at a time."""
    ids = [pid for pid in pack_ids if cat.get(pid) and not cat[pid].get('codeData') and cat[pid].get('generators')]
    if len(ids) < 2: return [], 0
    r = random.Random(seed * 104729 + 17); want = min(600, max(40, n_rows // 12)); out, seen, tries = [], set(), 0
    while len(out) < want and tries < want * 20:
        tries += 1; a_id, b_id = r.sample(ids, 2)
        try: q1, a1 = gen(r.choice(cat[a_id]['generators']), r); q2, a2 = gen(r.choice(cat[b_id]['generators']), r)
        except Exception: continue
        if len(q1) + len(q2) > 1800 or len(a1) + len(a2) > 1800: continue
        if any(' '.join(q.lower().split()) in taken or banned(' '.join(q.lower().split())) for q in (q1, q2)): continue  # a held-out check never appears, not even as half of a combined question
        q = f'{r.choice(COMBO_ASK)}\n\n1. {q1}\n\n2. {q2}'; k = ' '.join(q.lower().split())
        if k in seen or k in taken: continue
        seen.add(k); out.append((q, f'1. {a1}\n\n2. {a2}'))
    return out, len(out)


if __name__ == '__main__':
    r = random.Random(1)
    for n, f in GENERATORS.items(): q, a = (f(r, None) if n in ('jira_velocity', 'review_classify', 'review_format', 'qa_review_class', 'chart_type_real', 'gl_webarena') else f(r)); print(f'[{n}]', q[:150].replace('\n', ' / '), '=>', a[:110].replace('\n', ' / '))
