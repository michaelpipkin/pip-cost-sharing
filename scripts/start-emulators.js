import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const PORTS = [4000, 4500, 5000, 8080, 9099, 9150, 9199];
const HOST = '127.0.0.1';
const CONNECT_TIMEOUT_MS = 300;

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: HOST });
    const settle = (inUse) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once('connect', () => settle(true));
    socket.once('timeout', () => settle(false));
    socket.once('error', () => settle(false));
  });
}

async function main() {
  const portsInUse = await Promise.all(PORTS.map(isPortInUse));

  if (portsInUse.some(Boolean)) {
    console.log(
      'Emulator ports are still in use (likely a leftover process from a previous run) — running kill-ports first...'
    );
    // Hardcoded literal command, not user input — safe to resolve via PATH.
    const kill = spawnSync('pnpm run kill-ports', {
      stdio: 'inherit',
      shell: true,
    }); // NOSONAR
    if (kill.status !== 0) {
      console.error(
        'kill-ports did not exit cleanly; attempting to start emulators anyway.'
      );
    }
  }

  // Command is built from fixed literals plus this script's own package.json args, not
  // user input — safe to resolve via PATH.
  const command = [
    'firebase',
    'emulators:start',
    ...process.argv.slice(2),
  ].join(' ');
  const emu = spawn(command, { stdio: 'inherit', shell: true }); // NOSONAR
  emu.on('exit', (code) => process.exit(code ?? 0));
}

main();
