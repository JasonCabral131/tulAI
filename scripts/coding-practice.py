"""Coding AI practice rows written for the skills the Coding AI checks need: rename a function across two files, name a bug in a review with the fixed
line, fix a function from a failing test, and small algorithm functions. Every fix and solution here is executed by test/coding-practice.py, and none
uses a task from the checks (palindrome, merge intervals, run length, second largest, clamp, add_days, slugify, is_admin, join_words, average)."""
import random

RENAMES = [('format_price', 'price_label', 'p', "return f'${p:,.2f}'", 'cart', 'total', 'show_total'), ('to_title', 'title_case', 's', 'return s.title()', 'views', 'name', 'heading'),
           ('get_user', 'fetch_user', 'uid', "return {'id': uid}", 'api', 'uid', 'profile'), ('parse_date', 'read_date', 's', "return s.split('-')", 'report', 'when', 'parts'),
           ('clean_text', 'strip_text', 't', 'return t.strip()', 'forms', 'value', 'normalized'), ('calc_tax', 'compute_tax', 'amount', 'return round(amount * 0.12, 2)', 'billing', 'amount', 'tax_line'),
           ('make_key', 'cache_key', 'name', "return 'k:' + name", 'cache', 'name', 'lookup'), ('word_count', 'count_words', 'text', 'return len(text.split())', 'stats', 'text', 'summary'),
           ('to_cents', 'as_cents', 'amount', 'return int(round(amount * 100))', 'payments', 'amount', 'charge'), ('short_id', 'compact_id', 'uid', 'return uid[:8]', 'links', 'uid', 'link_for')]


def code_rename(r):
    old, new, arg, body, mod, var, caller = r.choice(RENAMES); lib = r.choice(['utils', 'helpers', 'lib', 'common', 'tools'])
    a = f'def {old}({arg}):\n    {body}\n'; b = f'from {lib} import {old}\n\ndef {caller}({var}):\n    return {old}({var})\n'
    q = f'Two files. {lib}.py:\n\n```python\n{a}```\n\n{mod}.py:\n\n```python\n{b}```\n\nRename the function {old} to {new} everywhere. Show both files in full, each in its own code block, and change nothing else.'
    return q, f'{lib}.py:\n\n```python\n{a.replace(old, new)}```\n\n{mod}.py:\n\n```python\n{b.replace(old, new)}```'


REVIEW = [  # (code, bug sentence, fixed line)
    ("def is_open(ticket):\n    return ticket.status == 'open' or 'pending'", "The condition is always true because the non-empty string 'pending' is truthy on its own.", "return ticket.status in ('open', 'pending')"),
    ("def is_weekend(day):\n    return day == 'Sat' or 'Sun'", "It always returns a truthy value because 'Sun' by itself is a non-empty string.", "return day in ('Sat', 'Sun')"),
    ("def can_edit(role):\n    return role == 'editor' or 'manager'", "The check is always truthy: 'manager' is a non-empty string, so any role passes.", "return role in ('editor', 'manager')"),
    ("def add_item(item, items=[]):\n    items.append(item)\n    return items", "The default list is created once and shared between calls, so items from earlier calls leak into later ones.", "def add_item(item, items=None):\n    items = [] if items is None else items"),
    ("def same_name(a, b):\n    return a is b", "`is` compares object identity, not equality, so two equal strings can compare as different.", "return a == b"),
    ("def last(items):\n    return items[len(items)]", "It reads one past the end of the list and raises IndexError; the last index is len(items) - 1.", "return items[-1]"),
    ("def total(prices):\n    t = 0\n    for p in prices:\n        t = p\n    return t", "It overwrites the total on every step instead of adding, so it returns only the last price.", "t += p"),
    ("def find(users, uid):\n    for u in users:\n        if u['id'] == uid:\n            return u\n        return None", "The return None is inside the loop, so it gives up after checking only the first user.", "    return None  # after the loop, not inside it"),
    ("def is_valid(age):\n    return age > 18 and age < 65", "Ages 18 and 65 are rejected because the comparisons are strict; the range should be inclusive.", "return 18 <= age <= 65"),
    ("def ratio(a, b):\n    return a / b if b else a / b", "Both branches divide by b, so a zero b still raises ZeroDivisionError.", "return a / b if b else 0.0"),
]


def code_review_bug(r):
    code, bug, fix = r.choice(REVIEW)
    ask = r.choice(['Review this Python change and name the bug in one sentence, then give the fixed line:', 'Code review: what is the bug here? One sentence, then the fixed line.', 'Find the bug in this change. Name it in one sentence and show the corrected line:', 'Is there a bug in this Python? Say what it is in one sentence and give the fix.'])
    return f'{ask}\n\n```python\n{code}\n```', f'{bug}\n\nFixed:\n\n```python\n{fix}\n```'


FIXES = [  # (failing test, error, buggy code, instruction, fixed code)
    ("assert next_month('2026-12-15') == '2027-01-15'", "AssertionError: got '2026-13-15'", "def next_month(s):\n    y, m, d = s.split('-')\n    return f'{y}-{int(m) + 1:02d}-{d}'",
     'Fix it so December rolls over to January of the next year.', "def next_month(s):\n    y, m, d = (int(x) for x in s.split('-'))\n    y, m = (y + 1, 1) if m == 12 else (y, m + 1)\n    return f'{y:04d}-{m:02d}-{d:02d}'"),
    ("assert days_between('2026-02-27', '2026-03-02') == 3", 'AssertionError: got 75', "def days_between(a, b):\n    return int(b.replace('-', '')) - int(a.replace('-', ''))",
     'Fix it using the datetime module.', "from datetime import date\n\ndef days_between(a, b):\n    return (date.fromisoformat(b) - date.fromisoformat(a)).days"),
    ('assert percent(1, 3) == 33.3', 'AssertionError: got 0', 'def percent(part, whole):\n    return part // whole * 100',
     'Fix it so it returns the percentage with one decimal, and 0.0 when whole is 0.', 'def percent(part, whole):\n    return round(part * 100 / whole, 1) if whole else 0.0'),
    ("assert initials('ada lovelace') == 'AL'", "AssertionError: got 'al'", "def initials(name):\n    return ''.join(w[0] for w in name.split())",
     'Fix it so the initials are upper case.', "def initials(name):\n    return ''.join(w[0].upper() for w in name.split())"),
    ('assert chunk([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]', 'AssertionError: got [[1, 2], [3, 4]]', 'def chunk(xs, n):\n    return [xs[i:i + n] for i in range(0, len(xs) - n + 1, n)]',
     'Fix it so the last, shorter chunk is kept.', 'def chunk(xs, n):\n    return [xs[i:i + n] for i in range(0, len(xs), n)]'),
    ("assert count_words('  hello   world ') == 2", 'AssertionError: got 7', "def count_words(text):\n    return len(text.split(' '))",
     'Fix it so repeated spaces are ignored.', 'def count_words(text):\n    return len(text.split())'),
    ("assert median([3, 1, 4, 2]) == 2.5", 'AssertionError: got 4', 'def median(xs):\n    return xs[len(xs) // 2]',
     'Fix it so the list is sorted first and an even length returns the mean of the two middle values.', 'def median(xs):\n    s = sorted(xs)\n    n = len(s)\n    mid = n // 2\n    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2'),
    ("assert last_n([1, 2, 3, 4], 2) == [3, 4]", 'AssertionError: got [1, 2]', 'def last_n(xs, n):\n    return xs[:n]', 'Fix it so it returns the last n items.', 'def last_n(xs, n):\n    return xs[-n:] if n > 0 else []'),
    ("assert to_cents(19.99) == 1999", 'AssertionError: got 1998', 'def to_cents(amount):\n    return int(amount * 100)', 'Fix it so floating point rounding does not lose a cent.', 'def to_cents(amount):\n    return int(round(amount * 100))'),
    ("assert kebab_title('Hello World') == 'hello-world'", "AssertionError: got 'Hello World'", "def kebab_title(t):\n    t.lower().replace(' ', '-')\n    return t", 'Fix it so the changed string is returned.', "def kebab_title(t):\n    return t.lower().replace(' ', '-')"),
    ("assert count_positive([3, -1, 0, 5]) == 2", 'AssertionError: got 3', 'def count_positive(xs):\n    return sum(1 for x in xs if x >= 0)', 'Fix it so zero is not counted as positive.', 'def count_positive(xs):\n    return sum(1 for x in xs if x > 0)'),
    ("assert age_on('2000-03-15', '2026-03-14') == 25", 'AssertionError: got 26', 'def age_on(born, today):\n    return int(today[:4]) - int(born[:4])',
     'Fix it using the datetime module so the birthday must have passed.', 'from datetime import date\n\ndef age_on(born, today):\n    b, t = date.fromisoformat(born), date.fromisoformat(today)\n    return t.year - b.year - ((t.month, t.day) < (b.month, b.day))'),
    ("assert shift_date('2026-03-01', -1) == '2026-02-28'", "AssertionError: got '2026-03-00'", "def shift_date(s, n):\n    y, m, d = s.split('-')\n    return f'{y}-{m}-{int(d) + n:02d}'",
     'Fix it using the datetime module so months and years roll over in both directions.', "from datetime import date, timedelta\n\ndef shift_date(s, n):\n    return (date.fromisoformat(s) + timedelta(days=n)).isoformat()"),
    ("assert add_weeks('2026-12-28', 1) == '2027-01-04'", "AssertionError: got '2026-12-35'", "def add_weeks(s, w):\n    y, m, d = s.split('-')\n    return f'{y}-{m}-{int(d) + 7 * w:02d}'",
     'Fix it using the datetime module so the month and year roll over.', "from datetime import date, timedelta\n\ndef add_weeks(s, w):\n    return (date.fromisoformat(s) + timedelta(weeks=w)).isoformat()"),
    ("assert next_day('2024-02-28') == '2024-02-29'", "AssertionError: got '2024-03-01'", "def next_day(s):\n    y, m, d = (int(x) for x in s.split('-'))\n    if m == 2 and d == 28:\n        return f'{y}-03-01'\n    return f'{y}-{m:02d}-{d + 1:02d}'",
     'Fix it using the datetime module so leap years and month ends are right.', "from datetime import date, timedelta\n\ndef next_day(s):\n    return (date.fromisoformat(s) + timedelta(days=1)).isoformat()"),
    ("assert squeeze('aaabcc') == 'a3b1c2'", "AssertionError: got 'a3a2a1b1c2c1'", "def squeeze(s):\n    out = ''\n    for i in range(len(s)):\n        n = 1\n        while i + n < len(s) and s[i + n] == s[i]:\n            n += 1\n        out += f'{s[i]}{n}'\n    return out",
     'Fix it so every run of the same character is written once with its length (use itertools.groupby).', "from itertools import groupby\n\ndef squeeze(s):\n    return ''.join(f'{ch}{len(list(run))}' for ch, run in groupby(s))"),
    ("assert runner_up([5, 5, 2]) == 2", 'AssertionError: got 5', 'def runner_up(nums):\n    return sorted(nums)[-2] if len(nums) > 1 else None',
     'Fix it so it returns the second largest DISTINCT value, or None when there is none.', 'def runner_up(nums):\n    vals = sorted(set(nums))\n    return vals[-2] if len(vals) > 1 else None'),
    ("assert join_ranges([[5, 7], [1, 3], [2, 4]]) == [[1, 4], [5, 7]]", 'AssertionError: got [[5, 7], [1, 4]]', 'def join_ranges(ranges):\n    out = []\n    for a, b in ranges:\n        if out and a <= out[-1][1]:\n            out[-1][1] = max(out[-1][1], b)\n        else:\n            out.append([a, b])\n    return out',
     'Fix it so the ranges are sorted by start first.', 'def join_ranges(ranges):\n    out = []\n    for a, b in sorted(ranges):\n        if out and a <= out[-1][1]:\n            out[-1][1] = max(out[-1][1], b)\n        else:\n            out.append([a, b])\n    return out'),

]


def code_fix_test(r):
    test, err, bad, ins, good = r.choice(FIXES)
    head = r.choice(['A test fails:', 'This test is failing:', 'CI is red. The failing test:', 'Our unit test fails:'])
    return f'{head}\n\n{test}\n{err}\n\nThe function is:\n\n```python\n{bad}\n```\n\n{ins} Reply with the fixed function in one python code block.', f'```python\n{good}\n```'


IMPL = [  # (name, task, solution, asserts)
    ('count_vowels', 'returns how many vowels (a, e, i, o, u, upper or lower case) are in s', "def count_vowels(s):\n    return sum(1 for c in s.lower() if c in 'aeiou')", ["count_vowels('Hello World') == 3", "count_vowels('') == 0"]),
    ('kth_largest_distinct', 'returns the k-th largest DISTINCT value in a list of integers, or None when there are fewer than k distinct values', 'def kth_largest_distinct(nums, k):\n    vals = sorted(set(nums), reverse=True)\n    return vals[k - 1] if 0 < k <= len(vals) else None', ['kth_largest_distinct([5, 1, 5, 3], 2) == 3', 'kth_largest_distinct([2, 2], 2) is None']),
    ('flatten', 'flattens a list of lists one level deep', 'def flatten(rows):\n    return [x for row in rows for x in row]', ['flatten([[1, 2], [], [3]]) == [1, 2, 3]']),
    ('is_anagram', 'returns True when a and b use the same letters, ignoring case and spaces', "def is_anagram(a, b):\n    norm = lambda s: sorted(s.replace(' ', '').lower())\n    return norm(a) == norm(b)", ["is_anagram('Listen', 'Silent')", "not is_anagram('abc', 'abd')"]),
    ('rotate', 'rotates a list to the right by k steps (k can be larger than the length; an empty list stays empty)', 'def rotate(xs, k):\n    if not xs:\n        return []\n    k %= len(xs)\n    return xs[-k:] + xs[:-k] if k else xs[:]', ['rotate([1, 2, 3, 4], 1) == [4, 1, 2, 3]', 'rotate([1, 2], 5) == [2, 1]', 'rotate([], 3) == []']),
    ('top_k_words', 'returns the k most frequent words in text (lower case), most frequent first, ties in alphabetical order', 'from collections import Counter\n\ndef top_k_words(text, k):\n    c = Counter(text.lower().split())\n    return [w for w, _ in sorted(c.items(), key=lambda x: (-x[1], x[0]))[:k]]', ["top_k_words('b a b c a b', 2) == ['b', 'a']"]),
    ('max_profit', 'returns the best profit from one buy and one later sell in a list of daily prices (0 if no profit is possible)', 'def max_profit(prices):\n    best, low = 0, float("inf")\n    for p in prices:\n        low = min(low, p)\n        best = max(best, p - low)\n    return best', ['max_profit([7, 1, 5, 3, 6, 4]) == 5', 'max_profit([5, 4, 3]) == 0']),
    ('group_by_first', 'groups words into a dict keyed by their first letter (lower case), keeping the original order', 'def group_by_first(words):\n    out = {}\n    for w in words:\n        out.setdefault(w[0].lower(), []).append(w)\n    return out', ["group_by_first(['apple', 'Avocado', 'bean']) == {'a': ['apple', 'Avocado'], 'b': ['bean']}"]),
    ('dedupe', 'removes duplicates from a list while keeping the first occurrence order', 'def dedupe(xs):\n    seen = set()\n    out = []\n    for x in xs:\n        if x not in seen:\n            seen.add(x)\n            out.append(x)\n    return out', ['dedupe([3, 1, 3, 2, 1]) == [3, 1, 2]']),
    ('valid_brackets', "returns True when every bracket in s ('()', '[]', '{}') is closed by the same type in the right order", "def valid_brackets(s):\n    pairs = {')': '(', ']': '[', '}': '{'}\n    stack = []\n    for c in s:\n        if c in '([{':\n            stack.append(c)\n        elif c in pairs:\n            if not stack or stack.pop() != pairs[c]:\n                return False\n    return not stack", ["valid_brackets('([]{})')", "not valid_brackets('(]')", "not valid_brackets('((')"]),
    ('two_sum', 'returns the indices [i, j] (i < j) of the two numbers that add up to target, or [] when none do', 'def two_sum(nums, target):\n    seen = {}\n    for j, x in enumerate(nums):\n        if target - x in seen:\n            return [seen[target - x], j]\n        seen[x] = j\n    return []', ['two_sum([2, 7, 11, 15], 9) == [0, 1]', 'two_sum([1, 2], 7) == []']),
    ('word_lengths', 'returns a dict mapping each word in text to its length (words split on spaces)', 'def word_lengths(text):\n    return {w: len(w) for w in text.split()}', ["word_lengths('hi there') == {'hi': 2, 'there': 5}"]),
    ('is_sorted', 'returns True when the list is in non-decreasing order', 'def is_sorted(xs):\n    return all(a <= b for a, b in zip(xs, xs[1:]))', ['is_sorted([1, 2, 2, 5])', 'not is_sorted([3, 1])', 'is_sorted([])']),
    ('capitalize_words', 'returns text with the first letter of every word in upper case and the rest unchanged', "def capitalize_words(text):\n    return ' '.join(w[:1].upper() + w[1:] for w in text.split(' '))", ["capitalize_words('hello big world') == 'Hello Big World'"]),
    ('sum_digits', 'returns the sum of the digits of a non-negative integer', 'def sum_digits(n):\n    return sum(int(d) for d in str(n))', ['sum_digits(1234) == 10', 'sum_digits(0) == 0']),
    ('merge_dicts', 'merges two dicts into a new one; values from the second win on equal keys', 'def merge_dicts(a, b):\n    return {**a, **b}', ["merge_dicts({'x': 1, 'y': 2}, {'y': 3}) == {'x': 1, 'y': 3}"]),
    ('count_chars', 'returns a dict of how many times each character appears in s', 'def count_chars(s):\n    out = {}\n    for c in s:\n        out[c] = out.get(c, 0) + 1\n    return out', ["count_chars('aab') == {'a': 2, 'b': 1}", 'count_chars(\'\') == {}']),
    ('fizzbuzz', "returns the list of FizzBuzz strings from 1 to n ('Fizz' for multiples of 3, 'Buzz' for 5, 'FizzBuzz' for both, else the number as text)", "def fizzbuzz(n):\n    out = []\n    for i in range(1, n + 1):\n        s = ('Fizz' if i % 3 == 0 else '') + ('Buzz' if i % 5 == 0 else '')\n        out.append(s or str(i))\n    return out", ["fizzbuzz(5) == ['1', '2', 'Fizz', '4', 'Buzz']", "fizzbuzz(15)[-1] == 'FizzBuzz'"]),
    ('longest_word', 'returns the longest word in text (the first one when there is a tie), or an empty string for empty text', "def longest_word(text):\n    words = text.split()\n    return max(words, key=len) if words else ''", ["longest_word('a bbb cc ddd') == 'bbb'", "longest_word('') == ''"]),
    ('unique_in_order', 'removes consecutive duplicates from a list, keeping the order', 'def unique_in_order(xs):\n    out = []\n    for x in xs:\n        if not out or out[-1] != x:\n            out.append(x)\n    return out', ['unique_in_order([1, 1, 2, 2, 2, 1]) == [1, 2, 1]', 'unique_in_order([]) == []']),
    ('safe_divide', 'divides a by b and returns None instead of raising when b is 0', 'def safe_divide(a, b):\n    return None if b == 0 else a / b', ['safe_divide(6, 3) == 2', 'safe_divide(1, 0) is None']),
    ('char_runs', 'returns a list of (character, run length) pairs for each run of the same character in s, e.g. \'aab\' -> [(\'a\', 2), (\'b\', 1)]', 'from itertools import groupby\n\ndef char_runs(s):\n    return [(ch, len(list(run))) for ch, run in groupby(s)]', ["char_runs('aab') == [('a', 2), ('b', 1)]", "char_runs('') == []"]),
    ('longest_streak', 'returns the length of the longest run of equal neighbouring values in a list (0 for an empty list)', 'from itertools import groupby\n\ndef longest_streak(xs):\n    return max((len(list(g)) for _, g in groupby(xs)), default=0)', ['longest_streak([1, 1, 2, 2, 2, 1]) == 3', 'longest_streak([]) == 0']),
    ('expand_runs', "turns a string like 'a3b1' (a letter followed by its count, counts can have several digits) back into 'aaab'", "import re\n\ndef expand_runs(code):\n    return ''.join(ch * int(n) for ch, n in re.findall(r'(\\D)(\\d+)', code))", ["expand_runs('a3b1') == 'aaab'", "expand_runs('z12') == 'z' * 12", "expand_runs('') == ''"]),
    ('pack_runs', "writes each run of the same character as the count followed by the character, e.g. 'aaab' -> '3a1b' (empty string -> '')", "from itertools import groupby\n\ndef pack_runs(s):\n    return ''.join(f'{len(list(run))}{ch}' for ch, run in groupby(s))", ["pack_runs('aaab') == '3a1b'", "pack_runs('') == ''", "pack_runs('xxxxxxxxxx') == '10x'"]),
    ('second_smallest_distinct', 'returns the second smallest DISTINCT value in a list of integers, or None when there is none', 'def second_smallest_distinct(nums):\n    vals = sorted(set(nums))\n    return vals[1] if len(vals) > 1 else None', ['second_smallest_distinct([3, 1, 1, 2]) == 2', 'second_smallest_distinct([4, 4]) is None', 'second_smallest_distinct([]) is None']),
    ('third_largest_distinct', 'returns the third largest DISTINCT value in a list of integers, or None when there are fewer than three', 'def third_largest_distinct(nums):\n    vals = sorted(set(nums), reverse=True)\n    return vals[2] if len(vals) > 2 else None', ['third_largest_distinct([5, 5, 4, 3, 1]) == 3', 'third_largest_distinct([2, 2, 1]) is None', 'third_largest_distinct([-1, -2, -3]) == -3']),
    ('merge_ranges', 'takes a list of [start, end] pairs in any order and returns them merged and sorted; ranges that overlap or touch ([1, 2] and [2, 5]) become one', 'def merge_ranges(ranges):\n    out = []\n    for a, b in sorted(ranges):\n        if out and a <= out[-1][1]:\n            out[-1][1] = max(out[-1][1], b)\n        else:\n            out.append([a, b])\n    return out', ['merge_ranges([[6, 9], [1, 2], [2, 5]]) == [[1, 5], [6, 9]]', 'merge_ranges([[1, 10], [2, 3]]) == [[1, 10]]', 'merge_ranges([]) == []']),
    ('busy_minutes', 'takes meetings as [start, end] minute pairs in any order (they can overlap) and returns how many minutes are covered in total', 'def busy_minutes(meetings):\n    total, end = 0, None\n    for a, b in sorted(meetings):\n        if end is None or a > end:\n            total += b - a\n            end = b\n        elif b > end:\n            total += b - end\n            end = b\n    return total', ['busy_minutes([[30, 60], [0, 45]]) == 60', 'busy_minutes([[0, 10], [20, 30]]) == 20', 'busy_minutes([]) == 0']),
    ('days_until', 'returns how many days from the ISO date today to the ISO date target (negative when target is earlier), using the datetime module', 'from datetime import date\n\ndef days_until(today, target):\n    return (date.fromisoformat(target) - date.fromisoformat(today)).days', ["days_until('2026-12-30', '2027-01-02') == 3", "days_until('2026-03-01', '2026-02-28') == -1"]),
    ('month_end', 'returns the last day of the month of an ISO date as an ISO date, using the datetime module (leap years count)', 'from datetime import date, timedelta\n\ndef month_end(s):\n    d = date.fromisoformat(s)\n    first_next = date(d.year + (d.month == 12), d.month % 12 + 1, 1)\n    return (first_next - timedelta(days=1)).isoformat()', ["month_end('2024-02-10') == '2024-02-29'", "month_end('2026-12-05') == '2026-12-31'"]),
    ('missing_number', 'returns the one number missing from a list that should contain 0..n', 'def missing_number(nums):\n    n = len(nums)\n    return n * (n + 1) // 2 - sum(nums)', ['missing_number([3, 0, 1]) == 2']),
]


def code_impl(r):
    name, task, sol, _ = r.choice(IMPL)
    ask = r.choice(['Write a Python function `{n}` that {t}. Reply with one python code block.', 'Implement `{n}` in Python: it {t}. One python code block only.', 'I need a Python function called `{n}` that {t}. Give just the code in one python code block.'])
    return ask.format(n=name, t=task), f'```python\n{sol}\n```'


TESTS = [  # (signature + docstring, what to cover, top-level tests, correct code, buggy versions): the tests pass on the correct code and catch every bug
    ('def in_range(x, lo, hi):\n    """Return True when lo <= x <= hi."""', 'a value below, inside, above, and exactly on both limits',
     'def test_below():\n    assert in_range(1, 2, 5) is False\n\ndef test_inside():\n    assert in_range(3, 2, 5) is True\n\ndef test_above():\n    assert in_range(6, 2, 5) is False\n\ndef test_on_low_limit():\n    assert in_range(2, 2, 5) is True\n\ndef test_on_high_limit():\n    assert in_range(5, 2, 5) is True',
     'def in_range(x, lo, hi):\n    return lo <= x <= hi', ['def in_range(x, lo, hi):\n    return lo < x < hi', 'def in_range(x, lo, hi):\n    return lo <= x']),
    ('def sign(x):\n    """Return -1 for negative numbers, 0 for zero and 1 for positive numbers."""', 'a negative number, zero and a positive number',
     'def test_negative():\n    assert sign(-7) == -1\n\ndef test_zero():\n    assert sign(0) == 0\n\ndef test_positive():\n    assert sign(3) == 1',
     'def sign(x):\n    return (x > 0) - (x < 0)', ['def sign(x):\n    return 1 if x >= 0 else -1', 'def sign(x):\n    return -1 if x <= 0 else 1']),
    ('def shorten(text, n):\n    """Return text cut to at most n characters, ending with \'...\' when it was cut."""', 'text shorter than n, exactly n long, and longer than n',
     "def test_short_text_unchanged():\n    assert shorten('hi', 5) == 'hi'\n\ndef test_exact_length_unchanged():\n    assert shorten('hello', 5) == 'hello'\n\ndef test_long_text_cut():\n    assert shorten('hello world', 5) == 'hello...'",
     "def shorten(text, n):\n    return text if len(text) <= n else text[:n] + '...'", ["def shorten(text, n):\n    return text[:n] + '...'", "def shorten(text, n):\n    return text if len(text) < n else text[:n] + '...'"]),
    ('def grade(score):\n    """Return \'A\' for 90 and above, \'B\' for 80-89, \'C\' for 70-79 and \'F\' below 70."""', 'every grade and the exact boundaries 90, 80 and 70',
     "def test_a():\n    assert grade(95) == 'A'\n    assert grade(90) == 'A'\n\ndef test_b():\n    assert grade(85) == 'B'\n    assert grade(80) == 'B'\n\ndef test_c():\n    assert grade(70) == 'C'\n\ndef test_f():\n    assert grade(69) == 'F'",
     "def grade(score):\n    return 'A' if score >= 90 else 'B' if score >= 80 else 'C' if score >= 70 else 'F'", ["def grade(score):\n    return 'A' if score > 90 else 'B' if score > 80 else 'C' if score > 70 else 'F'", "def grade(score):\n    return 'A' if score >= 90 else 'B' if score >= 80 else 'F'"]),
    ('def is_leap(year):\n    """Return True for leap years in the Gregorian calendar."""', 'a normal leap year, a normal year, a century year and a year divisible by 400',
     'def test_leap_year():\n    assert is_leap(2024) is True\n\ndef test_normal_year():\n    assert is_leap(2026) is False\n\ndef test_century_not_leap():\n    assert is_leap(1900) is False\n\ndef test_400_is_leap():\n    assert is_leap(2000) is True',
     'def is_leap(year):\n    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)', ['def is_leap(year):\n    return year % 4 == 0', 'def is_leap(year):\n    return year % 4 == 0 and year % 100 != 0']),
]


def code_write_tests(r):
    sig, cover, tests, _, _ = r.choice(TESTS)
    ask = r.choice(['Write unit tests for this function as plain Python test functions (named test_..., using assert, no imports needed):', 'Write pytest-style tests (top-level functions named test_..., plain assert) for:', 'Add unit tests for this function. Use top-level test_ functions with assert:'])
    return f'{ask}\n\n```python\n{sig}\n```\n\nCover {cover}. Reply with one python code block containing only the tests.', f'```python\n{tests}\n```'


GENERATORS = {'code_rename': code_rename, 'code_review_bug': code_review_bug, 'code_fix_test': code_fix_test, 'code_impl': code_impl, 'code_write_tests': code_write_tests}
