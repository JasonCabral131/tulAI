"""Spring Boot AI pack data: verified practice (scripts/springboot-practice.py, only the tasks scripts/springboot-verify.py compiled and tested on
Spring Boot 4.1.1), the official Spring Boot 4.1.1 documentation examples (Apache-2.0), the official Spring Guides that are on Spring Boot 4, and
the Fuleee Spring Boot code-completion set (README: academic/non-commercial use; used by the owner's choice, Spring Boot samples only).
Everything is read from the pinned, checksum-verified downloads in <data>/training/free/raw/<id> (training-config/free-data.json)."""
import io, json, os, pathlib, random, re, tarfile, zipfile, importlib.util

ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRETS = re.compile(r'AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|\bsk-[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?i:password\s*=\s*"[^"$]{6,}")')
SPRING = re.compile(r'@(?:RestController|Controller|Service|Repository|Component|Configuration|Bean|Entity|Table|Id|GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping|PathVariable|RequestParam|RequestBody|Transactional|Autowired|Value|ConfigurationProperties|SpringBootApplication|ExceptionHandler|RestControllerAdvice|ControllerAdvice|Valid|Scheduled|EnableScheduling|Query|PreAuthorize|WebMvcTest|DataJpaTest|SpringBootTest)\b')
DOC_TOPICS = re.compile(r'/docs/(web/servlet|web/reactive|data/sql|howto/dataaccess|testing/springbootapplications|features/externalconfig|features/springapplication|io/restclient|actuator|howto/webserver|web/security|howto/security|features/logging|io/validation|io/caching|messaging)')


def data_dir():
    base = os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or str(pathlib.Path.home() / 'Library/Application Support/gateway-chat')
    return pathlib.Path(base)


def raw(i): return pathlib.Path(os.environ.get('TULAI_FREE_DIR') or data_dir() / 'training' / 'free') / 'raw' / i


def words(path):  # docs/web/servlet/springmvc/MyRestController.java -> "web servlet springmvc", "MyRestController"
    rel = path.split('/docs/', 1)[1]; parts = rel.split('/'); cls = parts[-1][:-5]
    topic = ' › '.join(p for p in parts[:-1] if not p.startswith('my') and p not in ('docs',))
    return topic, re.sub(r'(?<!^)(?=[A-Z])', ' ', cls).replace('My ', '')


def docs_rows(cap=350):
    d = raw('spring-boot-4-docs'); fs = sorted(d.glob('*.tar.gz')) if d.is_dir() else []
    out = []
    for f in fs:
        with tarfile.open(f) as t:
            for m in t.getmembers():
                if not (m.isfile() and m.name.endswith('.java') and '/src/main/java/' in m.name and DOC_TOPICS.search(m.name)): continue
                code = t.extractfile(m).read().decode('utf-8', 'replace')
                code = re.sub(r'^/\*[\s\S]*?\*/\s*', '', code)  # the license header is not part of the lesson
                if not (150 <= len(code) <= 2400) or SECRETS.search(code): continue
                topic, what = words(m.name)
                q = f'Show the Spring Boot 4.1 way to do this ({topic}): {what.strip()}. Give the Java class.'
                out.append((q, f'This is how the official Spring Boot 4.1.1 documentation does it:\n\n```java\n{code.strip()}\n```'))
    random.Random(4041).shuffle(out); return out[:cap]


def guides_rows(cap=120):
    d = raw('spring-guides'); out = []
    for f in sorted(d.glob('*.tar.gz')) if d.is_dir() else []:
        with tarfile.open(f) as t:
            names = t.getnames(); pom = next((n for n in names if n.endswith('/complete/pom.xml')), None)
            if not pom: continue
            pomtxt = t.extractfile(pom).read().decode('utf-8', 'replace'); v = re.search(r'spring-boot-starter-parent</artifactId>\s*<version>([^<]+)<', pomtxt)
            if not v or not v.group(1).startswith('4.'): continue  # only guides already on Spring Boot 4
            readme = next((n for n in names if n.count('/') == 1 and n.lower().endswith('readme.adoc')), None)
            m0 = re.search(r'^(?:=|#|:project_title:)\s*(.+)$', t.extractfile(readme).read().decode('utf-8', 'replace'), re.M) if readme else None
            title = m0.group(1).strip() if m0 else f.name.rsplit('-', 1)[0].replace('gs-', '').replace('-', ' ')
            for n in names:
                if '/complete/src/' in n and n.endswith('.java'):
                    code = t.extractfile(n).read().decode('utf-8', 'replace')
                    if 120 <= len(code) <= 2400 and not SECRETS.search(code):
                        out.append((f'From the Spring guide "{title}" (Spring Boot {v.group(1)}): write {n.rsplit("/", 1)[1]}.', f'```java\n{code.strip()}\n```'))
    random.Random(4042).shuffle(out); return out[:cap]


def fuleee_rows(cap=400):
    d = raw('fuleee-springboot'); f = d / 'raw_data.zip'
    if not f.exists(): return []
    out = []
    with zipfile.ZipFile(f) as z:
        for n in z.namelist():
            if not n.endswith(('.json', '.jsonl')) or 'train' not in n.lower(): continue  # validation and test splits are never trained on
            txt = z.read(n).decode('utf-8', 'replace')
            try: items = json.loads(txt) if txt.lstrip().startswith('[') else [json.loads(l) for l in txt.splitlines() if l.strip()]
            except Exception: continue
            for e in items:
                if not isinstance(e, dict) or e.get('priority') != 2: continue  # Spring Boot samples only (@RestController, @Service, @Entity...)
                p, a = str(e.get('input', '')).strip(), str(e.get('output', '')).strip()
                if not (50 <= len(p) <= 1500 and 20 <= len(a) <= 1200) or SECRETS.search(p + a): continue
                if not SPRING.search(p + a): continue  # real Spring code, not plain getters and setters
                out.append((f'Complete this Spring Boot Java code:\n\n```java\n{p}\n```', f'```java\n{a}\n```'))
    random.Random(4043).shuffle(out); return out[:cap]


def verified():
    try: return set(json.loads((data_dir() / 'training' / 'springboot-verified.json').read_text())['verified'])
    except Exception: return set()


def rows(seed, practice=120):
    """(question, answer) rows for the Spring Boot AI pack. Practice only from tasks verified on Spring Boot 4.1.1."""
    sp = importlib.util.spec_from_file_location('sbp', ROOT / 'scripts/springboot-practice.py'); sbp = importlib.util.module_from_spec(sp); sp.loader.exec_module(sbp)
    ok = verified(); r = random.Random(seed); prac = [sbp.springboot_task(r, ok) for _ in range(practice)] if ok else []
    prac += [sbp.springboot_fact(r) for _ in range(60)] if ok else []  # Spring Boot 4 facts (the packages the verified tasks compile against)
    return prac + docs_rows() + guides_rows() + fuleee_rows()


if __name__ == '__main__':
    print({'verified practice': len(verified()), 'docs': len(docs_rows()), 'guides': len(guides_rows()), 'fuleee': len(fuleee_rows())})
