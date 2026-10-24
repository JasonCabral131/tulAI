"""Turns the downloaded free datasets (free-data.js, pinned and checksummed) into a few training rows each.

Every adapter filters hard (English, short, no links or code, no secrets, no boilerplate "as an AI model") and caps the rows, so general data can season the
skills and memory training but never drown it. Rows are chat rows in the bot's own answer prompt. Nothing here is downloaded: files must already be in
<data>/training/free/raw/<id>/ and the dataset must be switched on (or on by default).
"""
import json, gzip, os, pathlib, random, re, zlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRET = re.compile(r"\b(password|passcode|api[ -]?key|secret|token|credit card|card number|cvv|ssn|private key)\b|\bsk-[a-z0-9]{6,}", re.I)
BAD = re.compile(r"https?://|www\.|```|\bas an ai\b|\blanguage model\b|\bi'?m sorry, but\b|\bopenai\b|\bchatgpt\b|<[a-z/][^>]*>", re.I)


def data_dir():
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat')
    return pathlib.Path(os.environ.get('TULAI_FREE_DIR') or (pathlib.Path(base) / 'training' / 'free'))


def catalog():
    return json.loads((ROOT / 'training-config/free-data.json').read_text())['datasets']


def enabled(d, cfg):
    return bool(cfg.get('enabled', {}).get(d['id'], d.get('defaultOn', False)))


STOP = set('the a an to of and is in that it for you with on are as be this i can what how your or from have not at by if my do will which there about'.split())


def english(t):
    letters = [c for c in t if c.isalpha()]
    if not letters or sum(c.isascii() for c in letters) / len(letters) <= 0.97: return False
    words = re.findall(r"[a-z']+", t.lower())  # unaccented Spanish or Tagalog is all ASCII: also need the everyday English words
    return len(words) >= 3 and sum(w in STOP for w in words) / len(words) >= 0.12


def clean_ok(*texts):
    t = ' '.join(texts)
    return english(t) and not BAD.search(t) and not SECRET.search(t)


def jsonl(path, gz=False):
    with (gzip.open(path, 'rt', encoding='utf-8') if gz else open(path, encoding='utf-8')) as f:
        for line in f:
            try: yield json.loads(line)
            except Exception: continue


def dolly(path):
    keep = {'brainstorming', 'classification', 'closed_qa', 'general_qa', 'open_qa', 'information_extraction', 'summarization'}
    for e in jsonl(path):
        if e.get('category') not in keep: continue
        q, ctx, a = (e.get('instruction') or '').strip(), (e.get('context') or '').strip(), re.sub(r'\s*\[\d+\]', '', e.get('response') or '').strip()
        if not (15 <= len(q) <= 300 and 40 <= len(a) <= 500 and len(ctx) <= 700 and len(q.split()) >= 4 and len(a.split()) >= 8): continue
        if not clean_ok(q, ctx, a): continue
        yield (q + ('\n\n' + ctx if ctx else ''), a)


def gsm8k(path):
    for e in jsonl(path):
        q, raw = (e.get('question') or '').strip(), e.get('answer') or ''
        if '####' not in raw: continue
        steps, final = raw.rsplit('####', 1); steps = re.sub(r'<<[^>]*>>', '', steps).strip(); final = final.strip().replace(',', '')
        if not re.fullmatch(r'-?\d+(\.\d+)?', final) or not (20 <= len(q) <= 450 and 10 <= len(steps) <= 520): continue
        a = f'{steps}\nSo the answer is {final}.'
        if clean_ok(q, a): yield (q, a)


def oasst1(path):
    by, kids = {}, {}
    for m in jsonl(path, gz=True):
        by[m['message_id']] = m
    for m in by.values():
        p = by.get(m.get('parent_id') or '')
        if not p or m.get('role') != 'assistant' or p.get('role') != 'prompter' or p.get('parent_id'): continue  # one question, its best answer
        if m.get('lang') != 'en' or p.get('lang') != 'en' or m.get('deleted') or p.get('deleted') or m.get('review_result') is not True or m.get('rank') != 0: continue
        lab = lambda x, k: ((x.get('labels') or {}).get(k) or {}).get('value') or 0
        if any(lab(x, k) > 0.2 for x in (m, p) for k in ('spam', 'hate_speech', 'sexual_content', 'not_appropriate', 'pii', 'toxicity', 'violence')): continue
        q, a = p['text'].strip(), m['text'].strip()
        if 8 <= len(q) <= 300 and 20 <= len(a) <= 600 and clean_ok(q, a) and '\n\n\n' not in a: yield (q, a)


ADAPTERS = {'dolly': dolly, 'gsm8k': gsm8k, 'oasst1': oasst1}  # (datasets with adapter "pack-data" are read by a skill pack's own generator, not here)


def rows(seed, system, taken):
    """Returns (rows, counts): chat rows ending with the answer, deterministic for a seed; none whose question is in `taken` or repeated."""
    base = data_dir(); counts = {}; out = []
    try: cfg = json.loads((base / 'config.json').read_text())
    except Exception: cfg = {}
    seen = set(taken)
    for d in catalog():
        if not enabled(d, cfg) or d['adapter'] not in ADAPTERS: continue
        raw = base / 'raw' / d['id']; files = [raw / f['name'] for f in d['files']]
        if not all(p.exists() and p.stat().st_size == spec['bytes'] for p, spec in zip(files, d['files'])): continue  # not (fully) downloaded: skipped, never half-used
        try: pairs = list(ADAPTERS[d['adapter']](files[0]))
        except Exception: continue
        r = random.Random(seed ^ zlib.crc32(d['id'].encode())); r.shuffle(pairs); n = 0
        for q, a in pairs:
            k = ' '.join(q.lower().split())
            if k in seen: continue
            seen.add(k); out.append({'messages': [{'role': 'system', 'content': system}, {'role': 'user', 'content': q}, {'role': 'assistant', 'content': a}]}); n += 1
            if n >= d['maxRows']: break
        counts[d['id']] = n
    return out, counts
