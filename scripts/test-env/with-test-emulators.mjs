// Runs a command inside the isolated test emulator suite (firebase.test.json,
// project demo-pipsplit-test, non-default ports).
//
// Usage:
//   node scripts/test-env/with-test-emulators.mjs
//     [--only auth,firestore,storage,functions] [--build-functions] -- <command...>
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TEST_PORTS, TEST_PROJECT_ID } from './config.mjs';

const ALL_EMULATORS = ['auth', 'firestore', 'storage', 'functions'];
const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CONNECT_TIMEOUT_MS = 300;

// Port keys (in TEST_PORTS) each emulator occupies.
const EMULATOR_PORT_KEYS = {
  auth: ['auth'],
  firestore: ['firestore', 'firestoreWebsocket'],
  storage: ['storage'],
  functions: ['functions'],
};

export function parseArgs(argv) {
  let only = [...ALL_EMULATORS];
  let buildFunctions = false;
  const separator = argv.indexOf('--');
  const options = separator === -1 ? argv : argv.slice(0, separator);
  const command = separator === -1 ? [] : argv.slice(separator + 1);

  for (let i = 0; i < options.length; i++) {
    const arg = options[i];
    if (arg === '--only') {
      const value = options[++i];
      if (!value) {
        throw new Error('--only requires a comma-separated list of emulators');
      }
      only = value.split(',').map((name) => name.trim());
      const unknown = only.filter((name) => !ALL_EMULATORS.includes(name));
      if (unknown.length > 0) {
        throw new Error(`Unknown emulator(s): ${unknown.join(', ')}`);
      }
    } else if (arg === '--build-functions') {
      buildFunctions = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (command.length === 0) {
    throw new Error('Missing command: pass it after "--"');
  }
  return { only, buildFunctions, command };
}

// emulators:exec takes the inner command as a single string, which
// firebase-tools hands to a shell. Arguments with whitespace or shell
// metacharacters (e.g. the "|" in --grep "@a|@b") must be quoted or the shell
// splits/pipes them.
const NEEDS_QUOTING = /[\s|&<>^%()"';$`*?]/;

// Quotes each argument for the shell that runs the inner command. On Windows
// that is cmd.exe, where a double quote inside quotes is written as "".
// The result is the raw inner command string; buildExecPlan then escapes it
// once more for the command line that launches firebase.
export function quoteInner(args, platform = process.platform) {
  return args
    .map((arg) => {
      if (!NEEDS_QUOTING.test(arg)) {
        return arg;
      }
      return platform === 'win32'
        ? `"${arg.replaceAll('"', '""')}"`
        : `\\"${arg}\\"`;
    })
    .join(' ');
}

// Wraps the inner command as the single quoted argument of the firebase call.
// cmd.exe (which parses that call, and later the inner command) toggles its
// quote state on every double quote and ignores backslash escapes, so a "|"
// between \" pairs would run as a pipe. Doubling quotes ("") keeps cmd inside
// the quoted region, and the C runtime reads "" in a quoted argument as one
// literal quote. POSIX shells are fine with the \" form quoteInner emits.
function quoteForFirebase(inner, platform) {
  return platform === 'win32'
    ? `"${inner.replaceAll('"', '""')}"`
    : `"${inner}"`;
}

export function buildExecPlan(
  { only, buildFunctions, command },
  platform = process.platform
) {
  const plan = [];
  if (buildFunctions) {
    plan.push({
      cmd: 'pnpm',
      args: ['--dir', 'functions', 'run', 'build'],
      cwd: REPO_ROOT,
    });
  }
  plan.push({
    cmd: 'firebase',
    args: [
      'emulators:exec',
      '--config',
      'firebase.test.json',
      '--project',
      TEST_PROJECT_ID,
      '--only',
      only.join(','),
      quoteForFirebase(quoteInner(command, platform), platform),
    ],
    cwd: REPO_ROOT,
  });
  // Node's DEP0190 warns when spawn gets shell: true together with an args
  // array (it only concatenates them unescaped). The args above are already
  // quoted for the shell, so each step is spawned as one command string.
  return plan.map((step) => ({
    ...step,
    commandLine: [step.cmd, ...step.args].join(' '),
  }));
}

function isPortInUse(port, host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
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

export async function findBusyPorts(ports) {
  const results = await Promise.all(
    ports.map(
      async (port) =>
        (await isPortInUse(port, '127.0.0.1')) ||
        (await isPortInUse(port, '::1'))
    )
  );
  return ports.filter((_, i) => results[i]);
}

// On Windows, firebase-tools does not stop the Firestore emulator's Java
// process on shutdown, which would leave the test ports busy for the next run.
// The ports were verified free at start-up, so any listener left on them after
// the run is ours to stop.
async function releaseLeakedPorts(ports) {
  if (process.platform !== 'win32') {
    return;
  }
  // Emulators release their ports asynchronously after shutdown.
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const leaked = await findBusyPorts(ports);
  if (leaked.length === 0) {
    return;
  }
  // No "-p tcp": that filter lists IPv4 sockets only, but the emulators can
  // listen on IPv6 ([::] / [::1]).
  const netstat = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
  for (const pid of parseListeningPids(netstat, leaked)) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } catch {
      // Already gone.
    }
  }
}

// Extracts the PIDs LISTENING on any of the given ports from `netstat -ano`
// output. Handles IPv4 (127.0.0.1:1234) and IPv6 ([::]:1234, [::1]:1234) local
// addresses; UDP rows and non-LISTENING states never match.
export function parseListeningPids(netstatOutput, ports) {
  const pids = new Set();
  for (const line of netstatOutput.split(/\r?\n/)) {
    const [proto, local, , state, pid] = line.trim().split(/\s+/);
    if (proto !== 'TCP' || state !== 'LISTENING' || !local) {
      continue;
    }
    const port = Number(local.slice(local.lastIndexOf(':') + 1));
    if (ports.includes(port) && Number.isInteger(Number(pid))) {
      pids.add(Number(pid));
    }
  }
  return [...pids];
}

export function runStep({ cmd, commandLine, cwd }, spawnFn = spawn) {
  return new Promise((resolve) => {
    const child = spawnFn(commandLine, { cwd, stdio: 'inherit', shell: true });
    child.once('error', (error) => {
      console.error(`Failed to run ${cmd}: ${error.message}`);
      resolve(1);
    });
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

// Runs the steps in order and returns the first non-zero code (or 0). The
// cleanup always runs afterwards but is best-effort: a failure there is logged
// and must never replace the run's exit code.
export async function runPlan(
  steps,
  { run = runStep, cleanup = async () => {}, log = console } = {}
) {
  try {
    for (const step of steps) {
      const code = await run(step);
      if (code !== 0) {
        return code;
      }
    }
    return 0;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      log.warn(`Test port cleanup failed (ignored): ${error.message}`);
    }
  }
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const ports = [
    ...opts.only.flatMap((name) =>
      EMULATOR_PORT_KEYS[name].map((key) => TEST_PORTS[key])
    ),
    TEST_PORTS.hub,
    TEST_PORTS.logging,
  ];
  const busy = await findBusyPorts(ports);
  if (busy.length > 0) {
    console.error(
      `Test emulator port(s) ${busy.join(', ')} in use — a previous run may have crashed. From the repo root, run: pnpm kill-test-ports`
    );
    return 1;
  }

  return runPlan(buildExecPlan(opts), {
    cleanup: () => releaseLeakedPorts(ports),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
