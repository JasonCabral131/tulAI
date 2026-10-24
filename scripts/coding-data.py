"""Coding AI data: turns the five downloaded coding datasets (training-config/free-data.json, pinned and checksummed) into checked chat rows.

Sources: NVIDIA OpenCodeInstruct (only answers whose unit tests all passed and that a judge scored 4-5), Magicoder OSS-Instruct and Evol-Instruct,
CodeAlpaca (only answers that pass a syntax check) and SWE-bench (train split only: issue -> patch; the test split comes from other repositories and is
kept for evaluation). Every record is parsed, checked for secrets, deduplicated across all sources and filtered for size and quality.

  python coding-data.py --report <out.json>   writes provenance, counts and filter statistics (nothing is trained)
  python coding-data.py --eval <out.jsonl> N  writes N held-out OpenCodeInstruct tasks with their unit tests (never used for training)
"""
import ast, json, os, pathlib, random, re, sys, warnings, zlib
warnings.filterwarnings("ignore", category=SyntaxWarning)

ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRETS = re.compile(r'AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|\bsk-[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35}')
FENCE = re.compile(r'```([a-zA-Z0-9_+-]*)\n(.*?)```', re.S)
ORDER = ['opencodeinstruct', 'magicoder-evol', 'magicoder-oss', 'codealpaca', 'swe-bench']  # dedupe keeps the first (tested answers win)
CHECK_TOPICS = re.compile(r'palindrom|merg\w* (?:\w+ )?interval|overlapping interval|run[- ]length|second (?:largest|highest|biggest|greatest|max)|\bclamp\b|add_days|add days to a date|slugif|make_slug|is_admin|join_words', re.I)  # the Coding AI checks: never trained on the same task
LANGS = {'python', 'javascript', 'typescript', 'java', 'go', 'rust', 'shell', 'bash', 'sql', 'cpp', 'c', 'csharp', 'php', 'ruby', 'swift', 'kotlin'}


def data_dir():
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat')
    return pathlib.Path(os.environ.get('TULAI_FREE_DIR') or (pathlib.Path(base) / 'training' / 'free'))


def catalog():
    return {d['id']: d for d in json.loads((ROOT / 'training-config/free-data.json').read_text())['datasets'] if d['id'] in ORDER}


def files_of(d):
    raw = data_dir() / 'raw' / d['id']; fs = [raw / f['name'] for f in d['files']]
    return fs if all(p.exists() and p.stat().st_size == f['bytes'] for p, f in zip(fs, d['files'])) else None


def norm(q): return ' '.join(str(q).lower().split())


def python_ok(answer):
    """Every ```python block must parse (catches truncated or broken code)."""
    blocks = [b for lang, b in FENCE.findall(answer) if lang.lower() in ('python', 'py')]
    for b in blocks:
        try: ast.parse(b)
        except Exception: return False
    return True


def sized(q, a, qmax=1500, amax=2000): return 15 <= len(q) <= qmax and 20 <= len(a) <= amax  # short rows: long ones ran the GPU out of memory and teach less per step


def read_parquet(path):
    import pyarrow.parquet as pq  # installed with the training runtime (scripts/setup-training.js)
    return pq.read_table(path).to_pylist()


def jsonl(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            try: yield json.loads(line)
            except Exception: yield None


def records(sid, fs, stats):
    """(id, question, answer, meta) for one source, with its own quality rules. stats counts every reason a record is dropped."""
    def drop(why): stats[why] = stats.get(why, 0) + 1
    if sid == 'opencodeinstruct':
        for e in read_parquet(fs[0]):
            stats['raw'] = stats.get('raw', 0) + 1
            q, a = (e.get('input') or '').strip(), (e.get('output') or '').strip()
            try: score = float(e.get('average_test_score') or 0)
            except Exception: score = 0
            if score < 1.0: drop('unit tests not all passing'); continue
            try: j = json.loads(e.get('llm_judgement') or '{}'); low = any(isinstance(v, dict) and (v.get('score') or 0) < 4 for v in j.values())
            except Exception: drop('malformed'); continue
            if low: drop('judge score under 4'); continue
            if '```' not in a: drop('no code block'); continue
            if not sized(q, a): drop('too long or too short'); continue
            if not python_ok(a): drop('code does not parse'); continue
            yield e['id'], q, a, {'tests': e.get('unit_tests')}
    elif sid in ('magicoder-oss', 'magicoder-evol'):
        for i, e in enumerate(jsonl(fs[0])):
            stats['raw'] = stats.get('raw', 0) + 1
            if not e: drop('malformed'); continue
            if sid == 'magicoder-oss':
                q, a, lang = (e.get('problem') or '').strip(), (e.get('solution') or '').strip(), (e.get('lang') or '').lower()
                if lang not in LANGS: drop('language not used'); continue
            else: q, a = (e.get('instruction') or '').strip(), (e.get('response') or '').strip()
            if '```' not in a: drop('no code block'); continue
            if not sized(q, a): drop('too long or too short'); continue
            if not python_ok(a): drop('code does not parse'); continue
            yield f'{sid}-{i}', q, a, {}
    elif sid == 'codealpaca':
        for i, e in enumerate(json.loads(fs[0].read_text())):
            stats['raw'] = stats.get('raw', 0) + 1
            ins, inp, a = (e.get('instruction') or '').strip(), (e.get('input') or '').strip(), (e.get('output') or '').strip()
            if not ins or not a: drop('malformed'); continue
            q = ins + ('\n\n' + inp if inp and inp.lower() not in ('<noinput>', 'n/a') else '')
            if len(a) < 20 or len(set(a.split())) < 4: drop('answer too short or repetitive'); continue
            if not sized(q, a, 1500, 2000): drop('too long or too short'); continue
            looks_py = re.search(r'^\s*(def |import |from \w+ import|class \w+[:(]|print\()', a, re.M) and not re.search(r'[{};]\s*$', a, re.M)
            if looks_py:
                try: ast.parse(a); a = '```python\n' + a + '\n```'
                except Exception: drop('code does not parse'); continue
            yield f'codealpaca-{i}', q, a, {}
    elif sid == 'swe-bench':
        for e in read_parquet(fs[0]):  # files[0] is the TRAIN split; files[1] (test) is evaluation only and never read here
            stats['raw'] = stats.get('raw', 0) + 1
            prob, patch = (e.get('problem_statement') or '').strip(), (e.get('patch') or '').strip()
            nfiles = patch.count('diff --git')
            if not prob or not patch: drop('malformed'); continue
            if not (40 <= len(prob) <= 1500 and 50 <= len(patch) <= 1500 and 1 <= nfiles <= 2): drop('too long or too many files'); continue
            q = f'Repository: {e["repo"]}\nIssue:\n{prob}\n\nWrite the smallest patch (unified diff) that fixes this issue. Change only what the fix needs.'
            yield e['instance_id'], q, f'```diff\n{patch}\n```', {'repo': e['repo']}


def heldout(rid):
    """1 in 25 OpenCodeInstruct tasks is held out for evaluation, by id hash (stable across runs)."""
    return zlib.crc32(str(rid).encode()) % 25 == 0


def collect(taken=()):
    """Every usable record, deduplicated across sources: {source: [(id, q, a, meta)]}, stats per source."""
    cat, seen, out, stats = catalog(), set(norm(t) for t in taken), {}, {}
    for sid in ORDER:
        d = cat.get(sid); st = stats.setdefault(sid, {}); out[sid] = []
        fs = files_of(d) if d else None
        if not fs: st['status'] = 'not downloaded'; continue
        st['status'] = 'read'
        for rid, q, a, meta in records(sid, fs, st):
            if SECRETS.search(q) or SECRETS.search(a): st['secret found'] = st.get('secret found', 0) + 1; continue
            if CHECK_TOPICS.search(q): st['same task as a check (excluded)'] = st.get('same task as a check (excluded)', 0) + 1; continue
            k = norm(q)
            if k in seen: st['duplicate'] = st.get('duplicate', 0) + 1; continue
            seen.add(k)
            if sid == 'opencodeinstruct' and heldout(rid): st['held out for evaluation'] = st.get('held out for evaluation', 0) + 1; continue
            out[sid].append((rid, q, a, meta))
        st['kept'] = len(out[sid])
    return out, stats


def rows(seed, taken=(), caps=None):
    """[(question, answer)] for training: each source capped (catalog maxRows unless caps says otherwise), deterministic for a seed."""
    pool, _ = collect(taken); cat = catalog(); res = []
    for sid in ORDER:
        recs = list(pool.get(sid) or []); r = random.Random(seed ^ zlib.crc32(sid.encode())); r.shuffle(recs)
        n = (caps or {}).get(sid, cat[sid]['maxRows'] if sid in cat else 0)
        res += [(q, a) for _, q, a, _ in recs[:n]]
    return res


def eval_tasks(n=40):
    """Held-out OpenCodeInstruct tasks with their unit tests: never trained on (see heldout)."""
    cat = catalog(); fs = files_of(cat['opencodeinstruct']) if 'opencodeinstruct' in cat else None
    if not fs: return []
    out = []
    for rid, q, a, meta in records('opencodeinstruct', fs, {}):
        if heldout(rid):
            try: tests = [t.strip() for t in json.loads(meta['tests'] or '[]') if t.strip()]
            except Exception: continue
            if tests: out.append({'id': rid, 'prompt': q, 'tests': tests, 'reference': a})
        if len(out) >= n: break
    return out


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--report':
        pool, stats = collect(); cat = catalog()
        rep = {'datasets': [{'id': sid, 'name': cat[sid]['name'], 'license': cat[sid]['license'], 'licenseNote': cat[sid]['licenseNote'], 'source': cat[sid]['source'], 'revision': cat[sid]['commit'],
                             'files': [{'name': f['name'], 'bytes': f['bytes'], 'sha256': f['sha256']} for f in cat[sid]['files']], 'usedForTraining': cat[sid]['maxRows'], **stats.get(sid, {})} for sid in ORDER if sid in cat]}
        pathlib.Path(sys.argv[2]).write_text(json.dumps(rep, indent=1)); print(json.dumps({d['id']: {k: v for k, v in d.items() if k not in ('licenseNote', 'files', 'name', 'source', 'revision', 'license')} for d in rep['datasets']}, indent=1))
    elif len(sys.argv) >= 3 and sys.argv[1] == '--eval':
        ts = eval_tasks(int(sys.argv[3]) if len(sys.argv) > 3 else 40)
        with open(sys.argv[2], 'w') as f:
            for t in ts: f.write(json.dumps(t) + '\n')
        print(len(ts), 'held-out tasks')
