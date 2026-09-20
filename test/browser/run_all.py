#!/usr/bin/env python3
"""Runs every browser suite against index.html and reports one summary.

    python test/browser/run_all.py                 # all suites
    python test/browser/run_all.py commands touch  # only these
    DSP_INDEX=/path/to/index.html python test/browser/run_all.py

Exit code 0 when every check passed. Needs Playwright with Chromium:
    pip install playwright && playwright install chromium
"""
import os
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
SUITES = ['commands', 'features', 'extras', 'props', 'faults', 'security', 'touch', 'layout', 'perf']
# perf and layout report measurements rather than pass or fail
MEASURE_ONLY = {'perf', 'layout'}


def main(argv):
    names = argv or SUITES
    unknown = [n for n in names if not (HERE / (n + '.py')).exists()]
    if unknown:
        print('unknown suite(s): ' + ', '.join(unknown) + '\navailable: ' + ', '.join(SUITES))
        return 2
    out = pathlib.Path(os.environ.get('DSP_OUT', HERE / 'out'))
    out.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, PYTHONPATH=str(HERE) + os.pathsep + os.environ.get('PYTHONPATH', ''))
    failed, total_ok, total_fail = [], 0, 0
    for name in names:
        started = time.time()
        proc = subprocess.run([sys.executable, str(HERE / (name + '.py'))], cwd=out, env=env,
                              capture_output=True, text=True)
        text = proc.stdout + proc.stderr
        oks = [l for l in text.splitlines() if l.startswith('OK')]
        fails = [l for l in text.splitlines() if l.startswith('FAIL') or l.startswith('PAGEERR') or l.startswith('CONSOLE')]
        total_ok += len(oks)
        total_fail += len(fails)
        bad = proc.returncode != 0 or (fails and name not in MEASURE_ONLY)
        print('%-10s %-6s %3d ok, %d failed, %4.1fs' %
              (name, 'FAIL' if bad else 'ok', len(oks), len(fails), time.time() - started))
        for line in fails:
            print('   ' + line)
        if bad:
            failed.append(name)
            if proc.returncode != 0:
                print(text[-2000:])
    print('\n%d checks passed, %d failed, in %d suite(s)' % (total_ok, total_fail, len(names)))
    if failed:
        print('failing suites: ' + ', '.join(failed))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main([a for a in sys.argv[1:] if not a.startswith('-')]))
