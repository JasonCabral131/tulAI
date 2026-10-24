"""When a seed passes every check, the remaining seeds must NOT run; when it fails, the next seed runs (at most the recipe's seeds)."""
import importlib.util, os, pathlib, subprocess, sys, tempfile
tmp = pathlib.Path(tempfile.mkdtemp()); os.environ['GC_DATA_DIR'] = str(tmp)
spec = importlib.util.spec_from_file_location('ft', pathlib.Path(__file__).resolve().parents[1] / 'scripts/finetune.py'); ft = importlib.util.module_from_spec(spec); spec.loader.exec_module(ft)
ft.HOME = tmp / 'training'; assert str(ft.HOME).startswith(str(tmp)), 'the test must never touch the real training folder'
runs = ft.HOME / 'runs'; runs.mkdir(parents=True, exist_ok=True)
def fake(pass_on):
    seen = []
    def run(cmd, *a, **k):
        seed = int(cmd[cmd.index('--seed') + 1]); seen.append(seed); d = runs / f'pilot-{len(list(runs.iterdir())):03d}-{seed}'; d.mkdir()
        if seed == pass_on: (d / 'activation-ready.json').write_text('{}')
        (runs / 'pilot-000-old').mkdir(exist_ok=True); os.utime(runs / 'pilot-000-old')  # an older folder touched later must not be mistaken for the new run
        return subprocess.CompletedProcess(cmd, 0)
    return seen, run
sys.argv = ['finetune.py', 'run', '--skills']
seen, f = fake(7); ft.subprocess.run = f; ft.skills_with_seeds(); assert seen == [0, 7], seen
__import__('shutil').rmtree(tmp / 'training'); runs.mkdir(parents=True)
seen, f = fake(None); ft.subprocess.run = f; ft.skills_with_seeds(); assert seen == [0, 7, 21, 42], seen
__import__('shutil').rmtree(tmp / 'training'); runs.mkdir(parents=True)
os.environ['TULAI_SEED_FROM'] = '21'; seen, f = fake(None); ft.subprocess.run = f; ft.skills_with_seeds(); assert seen == [21, 42], seen; del os.environ['TULAI_SEED_FROM']
print('PASS seeds: stops at the first passing seed, tries all four when none pass')
