// Runs Python with whichever launcher this machine has.
// Windows installs `python` and the `py` launcher; Linux and macOS usually only `python3`.
import { spawnSync } from 'node:child_process';

const candidates = process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'];

for (const command of candidates) {
  const probe = spawnSync(command, ['-c', 'import sys; sys.exit(0 if sys.version_info[0] == 3 else 1)'], {
    stdio: 'ignore',
  });
  if (probe.status !== 0) continue;
  const run = spawnSync(command, process.argv.slice(2), { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}

console.error(`No Python 3 found. Tried: ${candidates.join(', ')}`);
process.exit(1);
