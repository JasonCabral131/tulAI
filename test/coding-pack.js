// The Coding AI checks run real code: each one must pass a correct reference answer and fail a wrong one, so a check can never pass by luck or fail by mistake.
const assert = require('assert'), X = require('../scripts/code-exec'), pk = require('../training-config/skill-packs.json').packs.find((p) => p.id === 'coding-ai');
const py = (s) => '```python\n' + s + '\n```';
const REF = [
  [py("import re\ndef is_palindrome(s):\n    t = re.sub(r'[^a-z0-9]', '', s.lower())\n    return t == t[::-1]"), py('def is_palindrome(s):\n    return s == s[::-1]')],
  [py('def merge_intervals(iv):\n    out = []\n    for a, b in sorted(iv):\n        if out and a <= out[-1][1]: out[-1][1] = max(out[-1][1], b)\n        else: out.append([a, b])\n    return out'), py('def merge_intervals(iv):\n    return sorted(iv)')],
  [py('from itertools import groupby\ndef run_length(s):\n    return "".join(k + str(len(list(g))) for k, g in groupby(s))'), py('def run_length(s):\n    return "".join(c + "1" for c in s)')],
  [py('def second_largest(nums):\n    u = sorted(set(nums))\n    return u[-2] if len(u) > 1 else None'), py('def second_largest(nums):\n    return sorted(nums)[-2] if len(nums) > 1 else None')],
  [py('def average(xs):\n    return sum(xs) / len(xs) if xs else 0.0'), py('def average(xs):\n    return sum(xs) // len(xs) if xs else 0.0')],
  [py("def join_words(words, sep=', '):\n    return sep.join(w for w in words if w)"), py("def join_words(words, sep=', '):\n    return sep.join(words)")],
  [py('def test_below():\n    assert clamp(-5, 0, 10) == 0\ndef test_inside():\n    assert clamp(5, 0, 10) == 5\ndef test_above():\n    assert clamp(50, 0, 10) == 10\ndef test_limits():\n    assert clamp(0, 0, 10) == 0 and clamp(10, 0, 10) == 10'), py('def test_inside():\n    assert clamp(5, 0, 10) == 5')],
  [py("from datetime import date, timedelta\ndef add_days(s, n):\n    return (date.fromisoformat(s) + timedelta(days=n)).isoformat()"), py("def add_days(s, n):\n    y, m, d = s.split('-')\n    return f'{y}-{m}-{int(d) + n:02d}'")],
  ["utils.py:\n```python\ndef make_slug(t):\n    return t.lower().replace(' ', '-')\n```\napp.py:\n```python\nfrom utils import make_slug\n\ndef page_url(title):\n    return '/p/' + make_slug(title)\n```", "utils.py:\n```python\ndef make_slug(t):\n    return t.lower()\n```\napp.py:\n```python\nfrom utils import slugify\n\ndef page_url(title):\n    return '/p/' + slugify(title)\n```"],
  ["The bug: `'owner'` is a non-empty string, so the expression is always truthy and every user is treated as an admin.\n\n```python\nreturn user.role in ('admin', 'owner')\n```", 'Looks fine to me.'],
];
assert.strictEqual(pk.checks.length, 10, 'ten checks');
pk.checks.forEach((c, i) => {
  const [good, bad] = REF[i], pass = (a) => c.exec ? !X.check(a, c.exec) : new RegExp(c.match, 'is').test(a);
  assert(pass(good), `check ${i + 1} must pass a correct answer: ${c.exec ? X.check(good, c.exec) : c.match}`);
  assert(!pass(bad), `check ${i + 1} must fail a wrong answer`);
  assert(!pass(''), `check ${i + 1} must fail an empty answer`);
});
console.log('PASS coding pack: 10 checks, each passes a correct answer and fails a wrong one (code really runs)');
