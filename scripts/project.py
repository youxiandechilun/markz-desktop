"""Cross-platform project entry point; writes redacted build/test output to logs."""
import argparse
import pathlib
import shutil
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

root = pathlib.Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser()
parser.add_argument('command', choices=['dev', 'build', 'build:sdk', 'typecheck', 'test', 'preview', 'package', 'package:portable', 'package:nsis', 'desktop:smoke', 'ai:smoke', 'settings:smoke', 'sdk:smoke', 'benchmark'])
args = parser.parse_args()
pnpm = shutil.which('pnpm.cmd') or shutil.which('pnpm')
if not pnpm:
    sys.exit('pnpm is required. Install with: npm install -g pnpm@8.15.4')
(root / 'logs').mkdir(exist_ok=True)
with (root / 'logs' / (args.command.replace(':', '-') + '.log')).open('w', encoding='utf-8') as log:
    process = subprocess.Popen([pnpm, args.command], cwd=root, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
    try:
        for line in process.stdout:
            print(line, end='')
            log.write(line)
        code = process.wait()
    except KeyboardInterrupt:
        process.terminate()
        code = process.wait()
    log.write(f'\nexit_code={code}\n')
sys.exit(code)
