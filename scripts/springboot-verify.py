"""Compiles every Spring Boot practice task and runs its JUnit tests against Spring Boot 4.1.1 (the check project in
<data>/training/springboot-check, Java 17+, Maven). Writes <data>/training/springboot-verified.json with the ids whose tests all passed;
only those are used for training (scripts/springboot-practice.py). Tasks whose code does not compile or whose tests fail are reported and dropped.
  python scripts/springboot-verify.py"""
import importlib.util, json, os, pathlib, re, shutil, subprocess, sys, xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = pathlib.Path(os.environ.get('TULAI_DATA_DIR') or os.environ.get('GC_DATA_DIR') or pathlib.Path.home() / 'Library/Application Support/gateway-chat')
H = DATA / 'training' / 'springboot-check'
JAVA_HOMES = ['/opt/homebrew/opt/openjdk@21', '/opt/homebrew/opt/openjdk@17', '/opt/homebrew/opt/openjdk']


def main():
    sp = importlib.util.spec_from_file_location('sbp', ROOT / 'scripts/springboot-practice.py'); sbp = importlib.util.module_from_spec(sp); sp.loader.exec_module(sbp)
    if not (H / 'pom.xml').exists(): sys.exit('The Spring Boot check project is missing: ' + str(H))
    main_root, test_root = H / 'src/main/java/com/tulai/check', H / 'src/test/java/com/tulai/check'
    for root in (main_root, test_root):
        for d in root.iterdir() if root.exists() else []:
            if d.is_dir(): shutil.rmtree(d)
    for tid, _req, files, tests in sbp.TASKS:
        pkg = f'{sbp.P}.{tid}'
        for base, group in ((main_root, files), (test_root, tests)):
            (base / tid).mkdir(parents=True, exist_ok=True)
            for name, code in group.items(): (base / tid / name).write_text(code.replace('{pkg}', pkg))
    java = next((j for j in JAVA_HOMES if os.path.exists(j + '/bin/javac')), None)
    env = {**os.environ, **({'JAVA_HOME': java} if java else {})}
    r = subprocess.run(['mvn', '-q', '-B', '-o', 'test', '-Dsurefire.failIfNoSpecifiedTests=false', '-Dmaven.test.failure.ignore=true'], cwd=H, env=env, capture_output=True, text=True, timeout=1800)
    compile_err = r.returncode != 0 and 'COMPILATION ERROR' in (r.stdout + r.stderr)
    broken = set(re.findall(r'com/tulai/check/(\w+)/\w+\.java', r.stdout + r.stderr)) if compile_err else set()
    ok, bad = [], {}
    for tid, _req, _files, tests in sbp.TASKS:
        if tid in broken: bad[tid] = 'does not compile'; continue
        results = []
        for name in tests:
            f = H / 'target/surefire-reports' / f'TEST-{sbp.P}.{tid}.{name[:-5]}.xml'
            if not f.exists(): results.append('no test report'); continue
            t = ET.parse(f).getroot(); n, fails = int(t.get('tests', 0)), int(t.get('failures', 0)) + int(t.get('errors', 0))
            results.append('' if n and not fails else f'{fails} of {n} tests failed')
        why = '; '.join(x for x in results if x)
        if why: bad[tid] = why
        else: ok.append(tid)
    if compile_err and not broken: print((r.stdout + r.stderr)[-3000:])
    out = {'springBoot': '4.1.1', 'java': java, 'verified': ok, 'failed': bad}
    (DATA / 'training' / 'springboot-verified.json').write_text(json.dumps(out, indent=1))
    print(f'{len(ok)} of {len(sbp.TASKS)} Spring Boot tasks compile and pass their tests on Spring Boot 4.1.1' + (f'; dropped: {bad}' if bad else ''))


if __name__ == '__main__':
    main()
