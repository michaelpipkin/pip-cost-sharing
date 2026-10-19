import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  buildExecPlan,
  findBusyPorts,
  quoteInner,
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
