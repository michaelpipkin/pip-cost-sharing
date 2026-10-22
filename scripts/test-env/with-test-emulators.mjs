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

// How long a finished emulator session gets to release its ports on its own
// before the leftover listeners are killed.
export const PORT_RELEASE_TIMEOUT_MS = 15_000;
// How long start-up waits for busy test ports (a previous session still
// shutting down) before refusing to run.
export const PORT_BUSY_GRACE_MS = 10_000;
export const PORT_POLL_INTERVAL_MS = 250;

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
// POSIX shells also treat a backslash, ~, #, !, braces and brackets specially.
const NEEDS_QUOTING_POSIX = /[\s|&<>^%()"';$`*?\\~#!{}[\]]/;

// Quotes each argument for the shell that runs the inner command. On Windows
// that is cmd.exe, where a double quote inside quotes is written as "".
// On POSIX the result is already escaped for the outer double quotes that
// quoteForFirebase adds, so it is a backslash-escaped pair of quotes around the
// argument. The characters that stay special inside double quotes (" \ $ `)
// get a three-backslash prefix: the outer shell turns it into \c, and the
// inner shell then reads a literal c. An empty argument must still be emitted
// as a quoted empty string, or it silently vanishes from the command.
// buildExecPlan then wraps the result for the command line that launches
// firebase.
export function quoteInner(args, platform = process.platform) {
  return args
    .map((arg) => {
      const needsQuoting =
        platform === 'win32' ? NEEDS_QUOTING : NEEDS_QUOTING_POSIX;
      if (arg !== '' && !needsQuoting.test(arg)) {
        return arg;
      }
      return platform === 'win32'
        ? `"${arg.replaceAll('"', '""')}"`
        : `\\"${arg.replace(/["\\$`]/g, '\\\\\\$&')}\\"`;
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

// Re-probes the ports every intervalMs until none is busy or timeoutMs has
// passed. Returns the ports still busy at the end (empty means all free).
// probe, now and sleep are injectable so tests need no real timers.
export async function waitForPortsFree(
  ports,
  {
    timeoutMs,
    intervalMs = PORT_POLL_INTERVAL_MS,
    probe = findBusyPorts,
    now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
) {
  const deadline = now() + timeoutMs;
  let busy = await probe(ports);
  while (busy.length > 0 && now() < deadline) {
    await sleep(intervalMs);
    busy = await probe(ports);
  }
  return busy;
}

// The start-up busy-port check. A previous session's emulators (notably the
// Firestore Java process on Windows) can still be shutting down, so busy ports
// get a grace window to free up before the run is refused. The test ports are
// non-default and used only by this repo's test emulators.
export async function checkPortsAtStartup(
  ports,
  {
    probe = findBusyPorts,
    now = Date.now,
    sleep,
    log = console,
    graceMs = PORT_BUSY_GRACE_MS,
  } = {}
) {
  const first = await probe(ports);
  if (first.length === 0) {
    return { busy: [], waitedMs: 0 };
  }
  log.log(
    `Test emulator port(s) ${first.join(', ')} busy; waiting up to ${graceMs / 1000}s for a previous session to release them...`
  );
  const started = now();
  const busy = await waitForPortsFree(ports, {
    timeoutMs: graceMs,
    probe,
    now,
    sleep,
  });
  return { busy, waitedMs: now() - started };
}

// On Windows, firebase-tools does not stop the Firestore emulator's Java
// process on shutdown, which would leave the test ports busy for the next run.
// The ports were verified free at start-up, so any listener left on them after
// the run is ours to stop.
async function releaseLeakedPorts(ports) {
  if (process.platform !== 'win32') {
    return;
  }
  // Emulators release their ports asynchronously after shutdown; give them
  // time to do so before killing whatever still listens.
  const leaked = await waitForPortsFree(ports, {
    timeoutMs: PORT_RELEASE_TIMEOUT_MS,
  });
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
  const { busy, waitedMs } = await checkPortsAtStartup(ports);
  if (busy.length > 0) {
    console.error(
      `Test emulator port(s) ${busy.join(', ')} still in use after waiting ${Math.round(waitedMs / 1000)}s — a previous run may have crashed. From the repo root, run: pnpm kill-test-ports`
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
