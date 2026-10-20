// Runs the tests that cover one or more product areas (see areas.mjs), or
// checks that every test is assigned to an area.
//
// Usage:
//   pnpm test:area <area...> [--unit | --e2e]
//   pnpm test:area --check
//
//   (no flag)  unit specs, then Cloud Functions specs, then e2e tests
//   --unit     only the app unit specs (no emulators needed)
//   --e2e      Cloud Functions specs and e2e tests (everything that needs the
//              test emulators)
//   --check    fail if a unit spec, functions spec or e2e test is not covered
//              by an area, or an area entry matches nothing
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AREAS } from './areas.mjs';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const WRAPPER = 'scripts/test-env/with-test-emulators.mjs';
// Tagged on the seed-health spec; every area run includes it because a broken
// seed invalidates every other e2e result.
const INFRA_TAG = '@infra';

export function resolveAreas(names, areas) {
  const valid = Object.keys(areas);
  const unknown = names.filter((name) => !valid.includes(name));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown area(s): ${unknown.join(', ')}. Valid areas: ${valid.join(', ')}`
    );
  }
  return names;
}

const unique = (list) => [...new Set(list)];

export function buildRunPlan(areaNames, areas, { unit, e2e }) {
  const selected = resolveAreas(areaNames, areas).map((name) => areas[name]);
  const plan = [];

  const unitPaths = unique(selected.flatMap((area) => area.unit));
  if (unit && unitPaths.length > 0) {
    plan.push({
      label: 'unit',
      cmd: 'pnpm',
      args: [
        'exec',
        'ng',
        'test',
        '--watch=false',
        ...unitPaths.flatMap((p) => ['--include', p]),
      ],
    });
  }

  if (e2e) {
    // Backend specs and e2e run in separate emulator sessions: the specs need
    // the trigger-free emulators (same as `pnpm --dir functions test`), e2e
    // needs all four plus a fresh functions build.
    const functionsSpecs = unique(selected.flatMap((area) => area.functions));
    if (functionsSpecs.length > 0) {
      plan.push({
        label: 'functions',
        cmd: 'node',
        args: [
          WRAPPER,
          '--only',
          'auth,firestore,storage',
          '--',
          'pnpm',
          '--dir',
          'functions',
          'exec',
          'vitest',
          'run',
          ...functionsSpecs,
        ],
      });
    }
    const tags = unique([...selected.map((area) => area.tag), INFRA_TAG]);
    plan.push({
      label: 'e2e',
      cmd: 'node',
      args: [
        WRAPPER,
        '--build-functions',
        '--',
        'pnpm',
        'exec',
        'playwright',
        'test',
        '--grep',
        tags.join('|'),
      ],
    });
  }
  return plan;
}

const isUnderPath = (spec, p) => spec === p || spec.startsWith(`${p}/`);

export function findUnassigned({ unitSpecs, functionsSpecs, e2eTests }, areas) {
  const all = Object.values(areas);
  const unitPaths = all.flatMap((area) => area.unit);
  const functionsPaths = new Set(all.flatMap((area) => area.functions));
  const tags = new Set([...all.map((area) => area.tag), INFRA_TAG]);
  return {
    unit: unitSpecs.filter((spec) => !unitPaths.some((p) => isUnderPath(spec, p))),
    functions: functionsSpecs.filter((spec) => !functionsPaths.has(spec)),
    e2e: e2eTests
      .filter((test) => !test.tags.some((tag) => tags.has(tag)))
      .map((test) => test.title),
  };
}

// Entries in the map that match no discovered spec (renamed/deleted specs).
export function findDangling({ unitSpecs, functionsSpecs }, areas) {
  const dangling = { unit: [], functions: [] };
  for (const [name, area] of Object.entries(areas)) {
    for (const p of area.unit) {
      if (!unitSpecs.some((spec) => isUnderPath(spec, p))) {
        dangling.unit.push(`${name}: ${p}`);
      }
    }
    for (const spec of area.functions) {
      if (!functionsSpecs.includes(spec)) {
        dangling.functions.push(`${name}: ${spec}`);
      }
    }
  }
  return dangling;
}

// `ng test --list-tests` prints "Discovered test files:" then indented
// workspace-relative paths (backslashes on Windows).
export function parseUnitList(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().replaceAll('\\', '/'))
    .filter((line) => line.endsWith('.spec.ts'))
    .map((line) => line.replace(/^src\//, ''));
}

// Flattens `playwright test --list --reporter=json` output into titled tests.
export function parseE2eList(report) {
  const tests = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      tests.push({
        title: [spec.file ?? suite.file, ...titles, spec.title].join(' > '),
        // The JSON reporter reports tags without their leading '@'.
        tags: (spec.tags ?? []).map((tag) =>
          tag.startsWith('@') ? tag : `@${tag}`
        ),
      });
    }
    for (const child of suite.suites ?? []) {
      walk(child, [...titles, child.title]);
    }
  };
  for (const fileSuite of report.suites ?? []) {
    walk(fileSuite, []);
  }
  return tests;
}

export function parseCliArgs(argv) {
  const parsed = { check: false, names: [], unit: false, e2e: false };
  for (const arg of argv) {
    if (arg === '--check') parsed.check = true;
    else if (arg === '--unit') parsed.unit = true;
    else if (arg === '--e2e') parsed.e2e = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else parsed.names.push(arg);
  }
  if (!parsed.unit && !parsed.e2e) {
    parsed.unit = true;
    parsed.e2e = true;
  }
  return parsed;
}

export function summarize(results) {
  const width = Math.max(...results.map((r) => r.label.length), 4);
  const rows = results.map(
    (r) => `  ${r.label.padEnd(width)}  ${r.code === 0 ? 'PASS' : 'FAIL'}`
  );
  const table = ['Step results:', ...rows].join('\n');
  return { table, exitCode: results.some((r) => r.code !== 0) ? 1 : 0 };
}

// --- process plumbing (not unit tested) ------------------------------------

// pnpm is a .cmd shim on Windows and needs a shell; `node` steps carry
// arguments with shell metacharacters (the grep's "|") and must not use one.
const needsShell = (cmd) => process.platform === 'win32' && cmd !== 'node';

// With a shell, the command goes in as one string (Node only concatenates an
// args array there, and passing one is deprecated).
const invocation = (cmd, args) =>
  needsShell(cmd)
    ? { file: [cmd, ...args].join(' '), argv: [], shell: true }
    : { file: cmd, argv: args, shell: false };

function runStep({ cmd, args }) {
  return new Promise((resolve) => {
    const { file, argv, shell } = invocation(cmd, args);
    const child = spawn(file, argv, { cwd: REPO_ROOT, stdio: 'inherit', shell });
    child.once('error', (error) => {
      console.error(`Failed to run ${cmd}: ${error.message}`);
      resolve(1);
    });
    child.once('exit', (code) => resolve(code ?? 1));
  });
}

function capture(cmd, args) {
  const { file, argv, shell } = invocation(cmd, args);
  const result = spawnSync(file, argv, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed (exit ${result.status}):
${result.stderr ?? ''}${result.error?.message ?? ''}`
    );
  }
  return result.stdout;
}

function globSpecs(dir) {
  const specs = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'lib') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.spec.ts')) {
        specs.push(path.relative(path.join(REPO_ROOT, 'functions'), full).replaceAll('\\', '/'));
      }
    }
  };
  walk(dir);
  return specs.sort();
}

function check() {
  const unitSpecs = parseUnitList(capture('pnpm', ['exec', 'ng', 'test', '--list-tests']));
  const functionsSpecs = globSpecs(path.join(REPO_ROOT, 'functions', 'src'));
  const stdout = capture('pnpm', ['exec', 'playwright', 'test', '--list', '--reporter=json']);
  const e2eTests = parseE2eList(JSON.parse(stdout.slice(stdout.indexOf('{'))));

  const unassigned = findUnassigned({ unitSpecs, functionsSpecs, e2eTests }, AREAS);
  const dangling = findDangling({ unitSpecs, functionsSpecs }, AREAS);
  console.log(
    `Checked ${unitSpecs.length} unit specs, ${functionsSpecs.length} functions specs, ${e2eTests.length} e2e tests.`
  );

  const sections = [
    ['Unit specs under no area', unassigned.unit],
    ['Functions specs under no area', unassigned.functions],
    ['e2e tests with no area tag', unassigned.e2e],
    ['Area unit entries matching no spec', dangling.unit],
    ['Area functions entries matching no spec', dangling.functions],
  ];
  let problems = 0;
  for (const [heading, items] of sections) {
    if (items.length === 0) continue;
    problems += items.length;
    console.error(`\n${heading}:`);
    items.forEach((item) => console.error(`  ${item}`));
  }
  if (problems > 0) {
    console.error(`\n${problems} problem(s). Update scripts/test-area/areas.mjs or tag the e2e spec.`);
    return 1;
  }
  console.log('Every test is assigned to an area.');
  return 0;
}

async function main() {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2));
    if (!args.check) {
      if (args.names.length === 0) {
        throw new Error(
          `Usage: pnpm test:area <area...> [--unit | --e2e] | --check\nAreas: ${Object.keys(AREAS).join(', ')}`
        );
      }
      resolveAreas(args.names, AREAS);
    }
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  if (args.check) {
    try {
      return check();
    } catch (error) {
      console.error(error.message);
      return 1;
    }
  }

  const plan = buildRunPlan(args.names, AREAS, args);
  const results = [];
  // Every step runs even if an earlier one failed, so one run reports it all.
  for (const step of plan) {
    console.log(`\n=== ${step.label}: ${step.cmd} ${step.args.join(' ')}\n`);
    results.push({ label: step.label, code: await runStep(step) });
  }
  const { table, exitCode } = summarize(results);
  console.log(`\n${table}`);
  return exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
