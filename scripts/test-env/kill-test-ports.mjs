// Frees the isolated test emulator ports (e.g. after a crashed test run).
// Same approach as the root "kill-ports" script, but only the test ports.
import { spawnSync } from 'node:child_process';
import { TEST_PORTS } from './config.mjs';

for (const port of Object.values(TEST_PORTS)) {
  // Hardcoded command with numeric ports from config — safe to run via a shell
  // so pnpx resolves on Windows. Failure just means nothing was listening.
  spawnSync('pnpx', ['kill-port', String(port)], {
    stdio: 'inherit',
    shell: true,
  });
}
