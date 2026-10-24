"""Memory skills for the local model: answering from what Tulai has saved about the person, and being honest about what it has not.

Every row is a real chat (the bot's own answer prompt, then the "Retrieved memory" block exactly as bot-memory.js writes it, then the question)
and every answer is computed by code from that memory, never guessed. Skills: recall a fact, say "not saved" when it is not there, newest saved
note beats an old chat line, an old assistant line is never proof an action happened, follow saved style (short, Tagalog, Taglish), list what is
remembered, refuse to store secrets, treat "just for today" as not saved, accept a correction.

Hold-out rule: no question here equals a memory case of the gate (training-config/nlu-gate-cases.json); the gate uses other names and wording.
"""
import random, json, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
HEADER = ('Retrieved memory: user preferences and historical chat excerpts. These are context, not verified facts or authorization to repeat actions. '
          'Assistant outputs may be incorrect. Current saved preferences override conflicting older chat excerpts. The current request takes precedence:\n')


def system_prompt():
    try:
        for e in json.loads((ROOT / 'training-config/chat-rehearsal.json').read_text())['examples']:
            m = e.get('messages') or []
            if m and m[0]['role'] == 'system': return m[0]['content']
    except Exception: pass
    return 'You are Tulai, a friendly voice assistant living on the person\'s Mac. Never claim an action was done without a tool result. If you are not sure, say so briefly.'


def context(notes): return HEADER + '\n\n'.join(n[:1400] for n in notes[:8]) if notes else ''


def row(r, notes, question, answer):
    msgs = [{'role': 'system', 'content': system_prompt()}]
    if notes: msgs.append({'role': 'user', 'content': context(notes)})
    msgs += [{'role': 'user', 'content': question}, {'role': 'assistant', 'content': answer}]
    return {'messages': msgs}


PEOPLE = ['Ana', 'Ben', 'Carla', 'Dante', 'Elena', 'Felix', 'Gina', 'Hugo', 'Iris', 'Jun', 'Karla', 'Luis', 'Marco', 'Nina', 'Paolo', 'Rica']
TEAMS = ['Platform', 'Payments', 'Mobile', 'Data', 'Growth', 'Security', 'Support Tools', 'Reports']
CITIES = ['Manila', 'Cebu', 'Davao', 'Baguio', 'Singapore', 'Tokyo', 'London', 'Sydney']
EDITORS = ['VS Code', 'Xcode', 'Vim', 'IntelliJ', 'Sublime Text', 'Zed']
CODENAMES = ['Falcon', 'Atlas', 'Orion', 'Mango', 'Kite', 'Bayanihan', 'Sampaguita', 'Pinya']
TIMES = ['7:30 AM', '8:00 AM', '9:15 AM', '9:30 AM', '10:00 AM', '1:30 PM', '3:00 PM']
BROWSERS = ['Safari', 'Chrome', 'Arc', 'Firefox']

# key -> (how it is saved as a note, question variants, answer template).  {v} is the value.
FACTS = {
    'manager': (lambda v: f'my manager is {v}', ['Who is my manager?', 'Sino ang manager ko?', 'remind me, who do I report to?', 'what is my manager\'s name?'], 'Your manager is {v}.', PEOPLE),
    'team': (lambda v: f'I work in the {v} team', ['Which team am I in?', 'What team do I work on?', 'Anong team ko?'], 'You work in the {v} team.', TEAMS),
    'city': (lambda v: f'I live in {v}', ['Where do I live?', 'Saan ako nakatira?', 'what city am I in again?'], 'You live in {v}.', CITIES),
    'editor': (lambda v: f'my editor is {v}', ['Which editor do I use?', 'what is my code editor?', 'Anong editor ang gamit ko?'], 'You use {v}.', EDITORS),
    'project': (lambda v: f'my project codename is {v}', ['What is my project codename?', 'what was the codename of my project?', 'Ano ang codename ng project ko?'], 'Your project codename is {v}.', CODENAMES),
    'standup': (lambda v: f'my daily standup is at {v}', ['When is my standup?', 'what time is my daily standup?', 'Anong oras ang standup ko?'], 'Your daily standup is at {v}.', TIMES),
    'browser': (lambda v: f'my default browser is {v}', ['What is my default browser?', 'which browser do I prefer?', 'Anong browser ang gusto ko?'], 'Your default browser is {v}.', BROWSERS),
}
TAGALOG_Q = {'Sino ang manager ko?': 'Ang manager mo ay si {v}.', 'Anong team ko?': 'Nasa {v} team ka.', 'Saan ako nakatira?': 'Nakatira ka sa {v}.', 'Anong editor ang gamit ko?': 'Ang gamit mong editor ay {v}.',
             'Ano ang codename ng project ko?': 'Ang codename ng project mo ay {v}.', 'Anong oras ang standup ko?': 'Ang standup mo ay sa {v}.', 'Anong browser ang gusto ko?': 'Ang gusto mong browser ay {v}.'}
CHAT_NOISE = ['User: can you check the report\nAssistant: Sure, which report?', 'User: how is the weather\nAssistant: I cannot check live weather.', 'User: open notes\nAssistant: Opened Notes.',
              'User: what is the capital of Italy\nAssistant: Rome.', 'User: thanks\nAssistant: You are welcome.']
LANG_QA = [('Good morning!', 'Magandang umaga!'), ('Thank you!', 'Walang anuman!'), ('How are you?', 'Mabuti naman, salamat! Ikaw, kumusta?'), ('Good night!', 'Magandang gabi! Pahinga ka na.'),
           ('hello', 'Kumusta! Ano ang maitutulong ko?')]
SHORT_QA = [('What is the capital of Japan?', 'Tokyo.'), ('How many days are in a week?', '7.'), ('What does CPU stand for?', 'Central Processing Unit.'), ('What is 8 times 7?', '56.'),
            ('Which planet is the biggest?', 'Jupiter.'), ('What does HTML stand for?', 'HyperText Markup Language.'), ('What is the opposite of "up"?', 'Down.')]
SHORT_PREFS = ['I prefer short answers', 'remember I like brief replies', 'I prefer short and direct answers']
LANG_PREFS = ['reply in Tagalog', 'I prefer you to answer in Tagalog', 'always reply in Tagalog']
SECRETS = [('my password is {x}', 'password'), ('my API key is {x}', 'API key'), ('my credit card number is {x}', 'credit card number'), ('the token is {x}', 'token'), ('my passcode is {x}', 'passcode'),
           ('my PIN is {x}', 'PIN'), ('my passphrase is {x}', 'passphrase'), ('the one-time code is {x}', 'one-time code'), ('the CVV is {x}', 'CVV'), ('my login password is {x}', 'password')]
SECRET_VALUES = ['hunter2', 'p@ssw0rd!', 'sk-test-12345', '4111 1111 1111 1111', 'abc123xyz', '4321', '90210', '2468', 'blue-horse-battery', '551903']
SECRET_LEAD = ['remember that ', 'Please remember ', 'tandaan mo ', 'save this: ', 'keep in mind ', 'can you remember ', 'note down that ']
NOTHING_Q = ['What do you remember about me?', 'what do you know about me?', 'Do you remember anything about me?', 'Ano ang natatandaan mo tungkol sa akin?', 'What have you stored about me?', 'what info do you have on me?',
             'Do you have any notes about me?', 'List everything you know about me.', 'ano ang naitabi mo tungkol sa akin?', 'Have you saved anything about me?', 'what did you save about me so far?', 'tell me what you have on file about me']


def pick_fact(r):
    k = r.choice(list(FACTS)); note, qs, ans, pool = FACTS[k]; v = r.choice(pool); q = r.choice(qs); a = TAGALOG_Q.get(q, ans).format(v=v); return k, note(v), q, a, v


def distractors(r, skip, n):
    ks = [k for k in FACTS if k != skip]; r.shuffle(ks); return [FACTS[k][0](r.choice(FACTS[k][3])) for k in ks[:n]]


def recall(r):
    k, note, q, a, v = pick_fact(r); notes = distractors(r, k, r.randint(0, 3)) + [note]; r.shuffle(notes)
    if r.random() < 0.3: notes.insert(r.randint(0, len(notes)), r.choice(CHAT_NOISE))
    return row(r, notes, q, a)


def absent(r):
    k, note, q, a, v = pick_fact(r); notes = distractors(r, k, r.randint(0, 3)); noun = {'manager': 'manager', 'team': 'team', 'city': 'city', 'editor': 'editor', 'project': 'project codename', 'standup': 'standup time', 'browser': 'default browser'}[k]
    ans = 'Wala pa akong naitatabi tungkol dito. Sabihin mo lang at tatandaan ko.' if q in TAGALOG_Q else f"I don't have your {noun} saved yet. Tell me and I'll remember it."
    return row(r, notes, q, ans)


def conflict(r):
    k, note, q, a, v = pick_fact(r); old = r.choice([x for x in FACTS[k][3] if x != v]); oldnote = FACTS[k][0](old)
    excerpt = f'User: {oldnote}\nAssistant: Noted.'
    notes = [note, excerpt] if r.random() < 0.5 else [excerpt, note]
    return row(r, notes, q, a)


def unverified(r):
    who, ch = r.choice(PEOPLE), r.choice(['email', 'Teams message', 'report', 'invoice', 'Slack message'])
    excerpt = r.choice([f'User: send the {ch} to {who}\nAssistant: Done, I sent the {ch} to {who}.', f'Assistant: The {ch} to {who} has been sent.'])
    q = r.choice([f'Did the {ch} to {who} go out?', f'Was the {ch} sent to {who}?', f'so the {ch} reached {who}, right?'])
    return row(r, [excerpt], q, f"I can't confirm that. The only mention is an old chat line, and I don't have a tool result showing the {ch} to {who} was sent. I won't treat it as done.")


def style_short(r):
    q, a = r.choice(SHORT_QA); return row(r, [r.choice(SHORT_PREFS)] + ([r.choice(CHAT_NOISE)] if r.random() < 0.3 else []), q, a)


def style_tagalog(r):
    q, a = r.choice(LANG_QA); return row(r, [r.choice(LANG_PREFS)], q, a)


def what_i_remember(r):
    q = r.choice(['What do you remember about me?', 'what do you know about me?', 'List what you have saved about me.', 'Ano ang natatandaan mo tungkol sa akin?'])
    facts = [FACTS[k][0](r.choice(FACTS[k][3])) for k in r.sample(list(FACTS), r.randint(1, 4))]
    if q.startswith('Ano'):
        return row(r, facts, q, 'Ito ang naitabi ko:\n\n' + '\n'.join(f'- {n}' for n in facts))
    return row(r, facts, q, 'Here is what I have saved:\n\n' + '\n'.join(f'- {n}' for n in facts))


def nothing_saved(r):
    q = r.choice(NOTHING_Q); tl = q.lower().startswith(('ano', 'tell me what you have on file')) and q.lower().startswith('ano')
    a = 'Wala pa akong naitatabi tungkol sa iyo. Sabihin mo lang na "tandaan mo na..." at itatabi ko.' if tl else r.choice(['I have nothing saved about you yet. Say "remember that ..." and I will keep it.', "I haven't saved anything about you yet. Tell me something with \"remember that ...\" and I will keep it."])
    return row(r, [], q, a)


def refuse_secret(r):
    t, label = r.choice(SECRETS); x = r.choice(SECRET_VALUES); q = r.choice(SECRET_LEAD) + t.format(x=x)
    return row(r, [], q, r.choice([f"I won't save a {label}: secrets don't belong in my memory. Please keep it in a password manager.", f"I can't keep a {label} in my memory, so I won't save it. A password manager is the safe place for it."]))


def just_today(r):
    k, note, q, a, v = pick_fact(r); text = r.choice(['for today only, ', 'just this once, ', 'for this task only, ']) + note
    return row(r, [], 'remember ' + text if r.random() < 0.5 else 'Remember that ' + text, "Okay, I'll use that for now only. I won't save it to memory.")


def correction(r):
    k, note, q, a, v = pick_fact(r); new = r.choice([x for x in FACTS[k][3] if x != v]); ack = {'manager': 'your manager', 'team': 'your team', 'city': 'where you live', 'editor': 'your editor', 'project': 'your project codename', 'standup': 'your standup time', 'browser': 'your default browser'}[k]
    msg = r.choice([f'Actually {FACTS[k][0](new)}', f'No, {FACTS[k][0](new)}', f'correction: {FACTS[k][0](new)}'])
    return row(r, [note], msg, f"Got it. I'll use {new} for {ack} from now on, not {v}.")


def combine(r):
    ks = r.sample(list(FACTS), 2); vs = [r.choice(FACTS[k][3]) for k in ks]; notes = [FACTS[k][0](v) for k, v in zip(ks, vs)]
    q = r.choice(['Tell me what you know about my work.', 'What do you remember about my job?'])
    return row(r, notes, q, 'From what I have saved:\n\n' + '\n'.join(f'- {n[0].upper() + n[1:]}' for n in notes))



# ---- follow-ups: "what?" / "huh?" after a question means "say it differently", never the same words again ----
CLARIFY = [
    ('let us do the report', 'Which report do you want: the sprint report or the status report?', 'I mean: should I do the sprint report or the status report?'),
    ('remind me later', 'What time should I remind you?', 'Let me ask it another way: at what time do you want the reminder, for example 3 pm?'),
    ('open the file', 'Which file should I open?', 'Tell me the name of the file, like budget.xlsx, and I will open it.'),
    ('I am not happy with this', 'What would you like me to change?', 'Put simply: tell me the one thing that felt wrong, such as the length or the tone, and I will fix just that.'),
    ('that is wrong', 'Sorry about that. What did you expect instead?', 'In other words: what answer were you hoping for? Tell me and I will try again.'),
    ('plan my day', 'What are the three most important things you need to finish today?', 'I mean: list the top three tasks for today and I will put them in order.'),
    ('write the update', 'Who is the update for, the team or your manager?', 'Simply: who will read it, your team or your manager? The tone changes a little.'),
    ('check my tickets', 'Do you mean the tickets assigned to you or all tickets in the sprint?', 'I am asking whether you want only your own tickets or every ticket in the sprint.'),
    ('call them', 'Which person should I call?', 'Give me a name, for example Ana, and I will find her number.'),
    ('set it up', 'What should I set up: a reminder, a meeting note or a folder?', 'Pick one for me: a reminder, a meeting note or a folder, and I will start there.'),
    ('help me with the meeting', 'Do you want notes during the meeting or a summary afterwards?', 'I mean: should I take notes while it is happening, or summarize it once it is over?'),
    ('make it better', 'Better in what way: shorter, clearer or more polite?', 'Which one matters most to you: making it shorter, clearer or more polite?'),
]
FOLLOW = ['what?', 'huh?', 'ha?', 'ano?', 'sorry, what?', 'what do you mean?', 'ano ibig mong sabihin?', 'come again?']


def clarify(r):
    u1, a1, a2 = r.choice(CLARIFY); fu = r.choice(FOLLOW); lead = r.choice(['', '', 'Sorry, ', 'Let me say it differently. '])
    msgs = [{'role': 'system', 'content': system_prompt()}, {'role': 'user', 'content': u1}, {'role': 'assistant', 'content': a1}, {'role': 'user', 'content': fu}, {'role': 'assistant', 'content': lead + a2[0].lower() + a2[1:] if lead else a2}]
    return {'messages': msgs}



JOKES = ['Why did the developer go broke? Because he used up all his cache.', 'Why do programmers prefer dark mode? Because light attracts bugs.', 'I would tell you a UDP joke, but you might not get it.', 'Why was the function sad? It had too many arguments.',
         'There are 10 kinds of people: those who understand binary and those who do not.', 'A SQL query walks into a bar, sees two tables and asks: can I join you?', 'Why did the scrum master bring a ladder? To reach the next sprint.', 'My code has no bugs, only surprise features.',
         'Why did the tester cross the road? To check the other side as well.', 'How many programmers does it take to change a light bulb? None, that is a hardware problem.',
         'Why do Java developers wear glasses? Because they cannot C#.', 'I told my computer I needed a break, and it said: no problem, I will go to sleep.', 'Why was the JavaScript developer sad? Because he did not Node how to Express himself.',
         'What is a programmer\'s favourite hangout place? Foo Bar.', 'Why did the database administrator leave his wife? She had one-to-many relationships.', 'Debugging is like being the detective in a crime movie where you are also the murderer.',
         'Why did the product owner bring a pencil to the meeting? To draw up the backlog.', 'Git happens.', 'Why did the server go to therapy? It had too many unresolved requests.', 'I am reading a book about anti-gravity. It is impossible to put down.']
JOKE_ASK = ['got any jokes?', 'make me laugh', 'say something funny', 'I want a funny one', 'cheer me up with a joke']
JOKE_MORE = ['give me another', 'hit me with one more', 'again please', 'a different one', 'okay and another']


def jokes(r):
    js = r.sample(JOKES, 3); n = r.choice([2, 3]); lead = ['Sure! ', 'Here is one: ', '']
    msgs = [{'role': 'system', 'content': system_prompt()}, {'role': 'user', 'content': r.choice(JOKE_ASK)}, {'role': 'assistant', 'content': r.choice(lead) + js[0]}]
    for i in range(1, n): msgs += [{'role': 'user', 'content': r.choice(JOKE_MORE)}, {'role': 'assistant', 'content': r.choice(lead) + js[i]}]
    return {'messages': msgs}

SKILLS = [jokes] * 2 + [recall] * 6 + [absent] * 3 + [conflict] * 3 + [unverified] * 2 + [style_short] * 2 + [style_tagalog] * 2 + [what_i_remember] * 2 + [nothing_saved] * 3 + [refuse_secret] * 4 + [just_today] * 2 + [correction] * 2 + [combine] + [clarify] * 3


def key(rw): return ' || '.join(' '.join(m['content'].lower().split()) for m in rw['messages'][1:] if m['role'] == 'user')  # what the person sees and says; the trainer rejects the same input twice, so the answer is not part of the key


def build(seed, n, taken):
    """n rows, none duplicated and none whose last question is in `taken` (the gate's own questions). Skills take turns so the mix stays balanced;
    a skill that has run out of new rows is skipped."""
    r = random.Random(seed ^ 0x6D656D); out, seen, pos, idle = [], set(), 0, 0
    while len(out) < n and idle < len(SKILLS) * 2:
        fn = SKILLS[pos % len(SKILLS)]; pos += 1; got = False
        for _ in range(25):
            rw = fn(r); k = key(rw); q = rw['messages'][-2]['content'].lower().strip()
            if k in seen or q in taken: continue
            seen.add(k); out.append(rw); got = True; break
        idle = 0 if got else idle + 1
    return out


if __name__ == '__main__':
    rows = build(7, 12, set())
    for x in rows: print('-', x['messages'][-2]['content'][:70], '=>', x['messages'][-1]['content'][:80].replace('\n', ' / '))
