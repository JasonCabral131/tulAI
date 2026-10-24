"""Builds training-config/jira-knowledge.json from "The Public Jira Dataset" (Zenodo record 15719919, CC BY 4.0): the small data-definition files only
(issue types, link types, field names with their JQL names). They are read straight out of the 5.8 GB zip with HTTP range requests (the 5.5 GB database dump
inside it is never downloaded) and every member is checked against the CRC32 stored in the zip. Re-run only to refresh the knowledge:  python3 scripts/build-jira-knowledge.py
Citation: Montgomery, Lloyd; Lüders, Clara; Maalej, Walid. The Public Jira Dataset. Zenodo, 2025. doi:10.5281/zenodo.15719919 (CC BY 4.0)."""
import collections, json, pathlib, struct, subprocess, sys, zlib

REC = '15719919'; URL = f'https://zenodo.org/api/records/{REC}/files/2025-06-23%20ThePublicJiraDataset.zip/content'
OUT = pathlib.Path(__file__).resolve().parents[1] / 'training-config/jira-knowledge.json'


def rng(a, b):
    r = subprocess.run(['curl', '-s', '-m', '120', '-L', '-r', f'{a}-{b}', URL], capture_output=True)
    if r.returncode or not r.stdout: raise SystemExit('Could not read from Zenodo: ' + str(r.returncode))
    return r.stdout


def size():
    h = subprocess.run(['curl', '-sIL', '-m', '60', URL], capture_output=True, text=True).stdout
    return int([l.split(':')[1] for l in h.splitlines() if l.lower().startswith('content-length')][-1])


def members():
    S = size(); tail = rng(S - 70000, S - 1); base = S - len(tail); j = tail.rfind(b'PK\x06\x07'); o64 = struct.unpack('<IIQI', tail[j:j + 20])[2]
    rec = tail[o64 - base:o64 - base + 56]; _, _, _, _, _, _, _, total, csize, coff = struct.unpack('<IQHHIIQQQQ', rec); d = rng(coff, coff + csize - 1); p = 0; out = {}
    while d[p:p + 4] == b'PK\x01\x02':
        (_, _, _, comp, _, _, crc, cs, us, nl, el, cl, _, _, _, lo) = struct.unpack('<HHHHHHIIIHHHHHII', d[p + 4:p + 46]); name = d[p + 46:p + 46 + nl].decode(); ex = d[p + 46 + nl:p + 46 + nl + el]; q = 0; off, csz = lo, cs
        while q + 4 <= len(ex):
            hid, sz = struct.unpack('<HH', ex[q:q + 4]); body = ex[q + 4:q + 4 + sz]
            if hid == 1:
                v = list(struct.unpack('<' + 'Q' * (len(body) // 8), body))
                if us == 0xFFFFFFFF: v.pop(0)
                if cs == 0xFFFFFFFF: csz = v.pop(0)
                if lo == 0xFFFFFFFF: off = v.pop(0)
            q += 4 + sz
        out[name] = (comp, csz, off, crc); p += 46 + nl + el + cl
    return out


def member(ms, name):
    comp, csz, off, crc = ms['ThePublicJiraDataset/0. DataDefinition/' + name]; hdr = rng(off, off + 29); nl, el = struct.unpack('<HH', hdr[26:30]); st = off + 30 + nl + el
    raw = rng(st, st + csz - 1); data = zlib.decompress(raw, -15) if comp == 8 else raw
    if zlib.crc32(data) & 0xffffffff != crc: raise SystemExit(name + ': checksum mismatch, refused')
    return json.loads(data)


ms = members(); types = member(ms, 'jira_issuetype_information.json'); links = member(ms, 'jira_issuelinktype_information.json'); fields = member(ms, 'jira_field_information.json'); theme = member(ms, 'jira_issuetype_thematic_analysis.json'); mapping = member(ms, 'jira_issue_linktype_mapping.json')
n = len(types)
# issue types: the description most repos agree on, how many repos have it, whether it is a sub-task, and its theme
T = collections.defaultdict(lambda: {'desc': collections.Counter(), 'repos': 0, 'sub': collections.Counter(), 'theme': collections.Counter()})
for repo, d in types.items():
    for name, it in d.items():
        t = T[it['name']]; t['repos'] += 1; t['desc'][(it.get('description') or '').strip()] += 1; t['sub'][bool(it.get('subtask'))] += 1
        th = (theme.get(repo, {}).get(name) or {}).get('theme')
        if th: t['theme'][th] += 1
issue_types = []
for name, t in sorted(T.items(), key=lambda kv: -kv[1]['repos']):
    desc = [d for d, _ in t['desc'].most_common() if d]
    if t['repos'] < 6 or not desc or len(desc[0]) > 160 or '<' in desc[0] or 'http' in desc[0]: continue
    issue_types.append({'name': name, 'description': desc[0], 'repos': t['repos'], 'subtask': t['sub'].most_common(1)[0][0], 'theme': (t['theme'].most_common(1) or [(None, 0)])[0][0]})
# link types: inward / outward wording, grouped by the dataset's canonical type
L = collections.defaultdict(lambda: collections.Counter())
for repo, d in links.items():
    for name, lt in d.items():
        if lt.get('inward') and lt.get('outward'): L[name][(lt['inward'].strip(), lt['outward'].strip())] += 1
link_types = []
for name, c in sorted(L.items(), key=lambda kv: -sum(kv[1].values())):
    if sum(c.values()) < 4: continue
    (inw, outw), _ = c.most_common(1)[0]; link_types.append({'name': name, 'inward': inw, 'outward': outw, 'canonical': mapping.get('link types', {}).get(name, name), 'repos': sum(c.values())})
# system fields that nearly every Jira has: display name, JQL name, kind of value
F = collections.defaultdict(lambda: {'n': 0, 'jql': collections.Counter(), 'type': collections.Counter()})
for repo, lst in fields.items():
    for f in lst:
        if f.get('custom'): continue
        x = F[f['name']]; x['n'] += 1; x['type'].update([(f.get('schema') or {}).get('type') or 'special'])
        if f.get('clauseNames'): x['jql'].update([f['clauseNames'][0]])
system_fields = [{'name': k, 'jql': v['jql'].most_common(1)[0][0], 'type': v['type'].most_common(1)[0][0], 'repos': v['n']} for k, v in sorted(F.items(), key=lambda kv: -kv[1]['n']) if v['n'] >= n * 0.7 and v['jql']]
out = {'source': {'title': 'The Public Jira Dataset', 'authors': 'Montgomery, Lüders, Maalej', 'doi': '10.5281/zenodo.15719919', 'record': f'https://zenodo.org/records/{REC}', 'license': 'CC-BY-4.0', 'note': f'Derived from the data-definition files of {n} public Jira repositories (issue types, link types, system fields). Changes: merged across repositories and shortened.'},
       'issueTypes': issue_types, 'linkTypes': link_types, 'systemFields': system_fields}
OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False)); print(f'{len(issue_types)} issue types, {len(link_types)} link types, {len(system_fields)} system fields -> {OUT}')
