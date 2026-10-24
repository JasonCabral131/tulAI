"""Spring Boot AI data: docs examples only from the chosen topics (license header removed), Spring Guides only when on Spring Boot 4, Fuleee only
its Spring Boot ("priority 2") TRAINING samples (validation/test never), and practice only from tasks verified on Spring Boot 4.1.1."""
import importlib.util, io, json, os, pathlib, tarfile, tempfile, zipfile
root = pathlib.Path(__file__).resolve().parents[1]; tmp = pathlib.Path(tempfile.mkdtemp()); os.environ['TULAI_DATA_DIR'] = str(tmp); os.environ['TULAI_FREE_DIR'] = str(tmp / 'free')
raw = tmp / 'free' / 'raw'
def tgz(path, files):
    path.parent.mkdir(parents=True, exist_ok=True)
    with tarfile.open(path, 'w:gz') as t:
        for n, c in files.items(): b = c.encode(); i = tarfile.TarInfo(n); i.size = len(b); t.addfile(i, io.BytesIO(b))
code = 'package x;\n\nimport org.springframework.web.bind.annotation.RestController;\n\n@RestController\npublic class MyRestController {\n    public String hello() { return "hello from the official documentation example"; }\n}\n'
tgz(raw / 'spring-boot-4-docs' / 'sb.tar.gz', {'sb/documentation/spring-boot-docs/src/main/java/org/springframework/boot/docs/web/servlet/springmvc/MyRestController.java': '/*\n * Copyright\n */\n' + code,
                                               'sb/documentation/spring-boot-docs/src/main/java/org/springframework/boot/docs/packaging/nativeimage/MyThing.java': code})
pom4 = '<parent><artifactId>spring-boot-starter-parent</artifactId>\n<version>4.0.1</version></parent>'; pom3 = pom4.replace('4.0.1', '3.5.0')
tgz(raw / 'spring-guides' / ('gs-a-' + '0' * 40 + '.tar.gz'), {'gs-a/README.adoc': '= Building a REST service\n', 'gs-a/complete/pom.xml': pom4, 'gs-a/complete/src/main/java/a/GreetingController.java': code})
tgz(raw / 'spring-guides' / ('gs-b-' + '1' * 40 + '.tar.gz'), {'gs-b/README.adoc': '= Old guide\n', 'gs-b/complete/pom.xml': pom3, 'gs-b/complete/src/main/java/b/Old.java': code})
(raw / 'fuleee-springboot').mkdir(parents=True); z = zipfile.ZipFile(raw / 'fuleee-springboot' / 'raw_data.zip', 'w')
row = lambda p, pr: {'instruction': 'x', 'input': '@Service\npublic class OrderService {\n    private final OrderRepository repo;\n    public OrderService(' + p, 'output': 'OrderRepository repo) { this.repo = repo; }\n}', 'priority': pr}
z.writestr('raw_data/train.json', json.dumps([row('A', 2), row('B', 1)])); z.writestr('raw_data/test.json', json.dumps([row('C', 2)])); z.close()
sp = importlib.util.spec_from_file_location('sd', root / 'scripts/springboot-data.py'); sd = importlib.util.module_from_spec(sp); sp.loader.exec_module(sd)
d = sd.docs_rows(); assert len(d) == 1 and 'web › servlet › springmvc' in d[0][0] and 'Copyright' not in d[0][1], d
g = sd.guides_rows(); assert len(g) == 1 and 'Building a REST service' in g[0][0] and 'Spring Boot 4.0.1' in g[0][0], g
f = sd.fuleee_rows(); assert len(f) == 1 and 'public OrderService(A' in f[0][0], f
assert sd.verified() == set() and sd.rows(1)[:0] == [] and not any('springboot_task' in q for q, _ in sd.rows(1)), 'no practice before it is verified'
(tmp / 'training').mkdir(parents=True, exist_ok=True); (tmp / 'training' / 'springboot-verified.json').write_text(json.dumps({'verified': ['users_get']}))
pr = sd.rows(1); assert any('GET /api/users/{id}' in q for q, _ in pr) and not any('POST /api/orders' in q for q, _ in pr), 'only verified tasks are practised'
print('PASS springboot data: official docs topics, Boot 4 guides only, Fuleee Spring Boot training split only, practice only when verified')
