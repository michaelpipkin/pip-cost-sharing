import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { EventEmitter, once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  buildExecPlan,
  findBusyPorts,
  quoteInner,
  parseListeningPids,
  runStep,
  runPlan,
} from './with-test-emulators.mjs';

test('parseArgs splits options from the command at --', () => {
  assert.deepEqual(
    parseArgs(['--only', 'auth,firestore', '--', 'vitest', 'run']),
    {
      only: ['auth', 'firestore'],
      buildFunctions: false,
      command: ['vitest', 'run'],
    }
  );
});

test('parseArgs defaults to all four emulators', () => {
  assert.deepEqual(parseArgs(['--', 'x']).only, [
    'auth',
    'firestore',
    'storage',
    'functions',
  ]);
});

test('parseArgs rejects a missing command', () => {
  assert.throws(() => parseArgs(['--only', 'auth']), /command/);
});

test('buildExecPlan puts the functions build first', () => {
  const plan = buildExecPlan({
    only: ['functions'],
    buildFunctions: true,
    command: ['playwright', 'test'],
  });
  assert.equal(plan.length, 2);
  // pnpm --dir functions run build
  assert.deepEqual(plan[0].args.slice(-2), ['run', 'build']);
});

test('buildExecPlan targets the test config and demo project', () => {
  const exec = buildExecPlan({
    only: ['auth'],
    buildFunctions: false,
    command: ['vitest', 'run'],
  }).at(-1);
  assert.ok(exec.args.includes('emulators:exec'));
  const configAt = exec.args.indexOf('--config');
  assert.deepEqual(exec.args.slice(configAt, configAt + 2), [
    '--config',
    'firebase.test.json',
  ]);
  const projectAt = exec.args.indexOf('--project');
  assert.deepEqual(exec.args.slice(projectAt, projectAt + 2), [
    '--project',
    'demo-pipsplit-test',
  ]);
  assert.ok(exec.args.includes('auth'));
});

test('buildExecPlan quotes the inner command as one string', () => {
  const exec = buildExecPlan(
    {
      only: ['auth'],
      buildFunctions: false,
      command: ['playwright', 'test', '--grep', '@expenses report'],
    },
    'linux'
  ).at(-1);
  assert.equal(
    exec.args.at(-1),
    '"playwright test --grep \\"@expenses report\\""'
  );
});

// On Windows the string is parsed twice by cmd.exe (once for the firebase
// call, once when emulators:exec runs the inner command), so embedded quotes
// are doubled rather than backslash-escaped: cmd treats `\"` as a quote toggle
// and would expose a `|` between two of them as a pipe.
test('buildExecPlan on win32 doubles embedded quotes so cmd keeps | inside them', () => {
  const exec = buildExecPlan(
    {
      only: ['auth'],
      buildFunctions: false,
      command: ['playwright', 'test', '--grep', '@a|@b'],
    },
    'win32'
  ).at(-1);
  assert.equal(
    exec.args.at(-1),
    '"playwright test --grep ""@a|@b"""'
  );
});

test('quoteInner leaves plain arguments untouched', () => {
  for (const platform of ['win32', 'linux']) {
    assert.equal(
      quoteInner(['pnpm', '--dir', 'functions', 'exec', 'a/b.spec.ts', '--x=1'], platform),
      'pnpm --dir functions exec a/b.spec.ts --x=1'
    );
  }
});

test('quoteInner on win32 quotes whitespace and every cmd metacharacter', () => {
  for (const arg of ['a b', 'a|b', 'a&b', 'a<b', 'a>b', 'a^b', 'a%b', 'a(b', 'a)b']) {
    assert.equal(quoteInner(['x', arg], 'win32'), `x "${arg}"`, arg);
  }
});

test('quoteInner on win32 doubles a quote inside a quoted argument', () => {
  assert.equal(quoteInner(['x', 'say "hi"'], 'win32'), 'x "say ""hi"""');
});

test('quoteInner on posix backslash-escapes the quotes for the outer double quotes', () => {
  assert.equal(quoteInner(['x', 'a|b', 'a b'], 'linux'), 'x \\"a|b\\" \\"a b\\"');
});

test('buildExecPlan steps run from the repo root', () => {
  const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const plan = buildExecPlan({
    only: ['functions'],
    buildFunctions: true,
    command: ['x'],
  });
  for (const step of plan) {
    assert.equal(step.cwd, repoRoot);
  }
});

test('findBusyPorts reports a listening port', async () => {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  assert.deepEqual(await findBusyPorts([port]), [port]);
  server.close();
});

test('findBusyPorts does not report a free port', async () => {
  const server = net.createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  assert.deepEqual(await findBusyPorts([port]), []);
});

const NETSTAT = [
  '  Proto  Local Address          Foreign Address        State           PID',
  '  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1000',
  '  TCP    127.0.0.1:18080        0.0.0.0:0              LISTENING       2001',
  '  TCP    [::]:19099             [::]:0                 LISTENING       2002',
  '  TCP    [::1]:19199            [::]:0                 LISTENING       2003',
  '  TCP    127.0.0.1:18080        127.0.0.1:50000        ESTABLISHED     2001',
  '  TCP    127.0.0.1:50001        127.0.0.1:19099        ESTABLISHED     3000',
  '  TCP    0.0.0.0:118080         0.0.0.0:0              LISTENING       4000',
  '  UDP    0.0.0.0:15001          *:*                                    5000',
  '  TCP    127.0.0.1:15001        0.0.0.0:0              LISTENING       2002',
].join('\r\n');

test('parseListeningPids reads IPv4 and IPv6 listeners on the given ports', () => {
  assert.deepEqual(
    parseListeningPids(NETSTAT, [18080, 19099, 19199, 15001]).sort(),
    [2001, 2002, 2003]
  );
});

test('parseListeningPids ignores other ports, non-listening states, UDP and prefix matches', () => {
  assert.deepEqual(parseListeningPids(NETSTAT, [135]), [1000]);
  assert.deepEqual(parseListeningPids(NETSTAT, [50000, 50001]), []);
  assert.deepEqual(parseListeningPids(NETSTAT, [8080]), []);
  assert.deepEqual(parseListeningPids('', [18080]), []);
});

test('buildExecPlan steps carry a single command string for shell: true', () => {
  const plan = buildExecPlan(
    { only: ['auth'], buildFunctions: true, command: ['x'] },
    'linux'
  );
  for (const step of plan) {
    assert.equal(typeof step.commandLine, 'string');
    assert.ok(step.commandLine.startsWith(step.cmd));
    assert.ok(step.commandLine.endsWith(step.args.at(-1)));
  }
});

test('runStep spawns one command string with shell: true and no args array', async () => {
  const calls = [];
  const fakeSpawn = (...spawnArgs) => {
    calls.push(spawnArgs);
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('exit', 0));
    return child;
  };
  const code = await runStep(
    { cmd: 'echo', args: ['a b'], commandLine: 'echo "a b"', cwd: '/tmp' },
    fakeSpawn
  );
  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'echo "a b"');
  assert.equal(typeof calls[0][1], 'object');
  assert.equal(calls[0][1].shell, true);
  assert.equal(calls[0].length, 2);
});

test('runPlan returns the failing step code and runs cleanup', async () => {
  let cleaned = 0;
  const codes = [0, 7, 0];
  const ran = [];
  const code = await runPlan(['a', 'b', 'c'], {
    run: async (step) => {
      ran.push(step);
      return codes.shift();
    },
    cleanup: async () => {
      cleaned++;
    },
  });
  assert.equal(code, 7);
  assert.deepEqual(ran, ['a', 'b']);
  assert.equal(cleaned, 1);
});

test('a failing cleanup never replaces the exit code', async () => {
  const quiet = { warn: () => {} };
  for (const stepCode of [0, 3]) {
    const code = await runPlan(['a'], {
      run: async () => stepCode,
      cleanup: async () => {
        throw new Error('netstat missing');
      },
      log: quiet,
    });
    assert.equal(code, stepCode);
  }
});
