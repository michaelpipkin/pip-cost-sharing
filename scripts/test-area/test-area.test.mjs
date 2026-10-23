import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS } from './areas.mjs';
import {
  resolveAreas,
  buildRunPlan,
  findUnassigned,
  findDangling,
  parseUnitList,
  parseE2eList,
  parseCliArgs,
  summarize,
  executePlan,
  invocation,
  parseJsonReport,
} from './test-area.mjs';

const SIXTEEN = [
  'shell',
  'auth',
  'account',
  'groups',
  'members',
  'categories',
  'expenses',
  'rental',
  'receipts',
  'memorized',
  'summary',
  'history',
  'split',
  'home',
  'help',
  'admin',
];

test('resolveAreas rejects an unknown area and lists valid ones', () =>
  assert.throws(() => resolveAreas(['expences'], AREAS), /expenses/));

test('every area has a tag matching its name', () =>
  Object.entries(AREAS).forEach(([n, a]) => assert.equal(a.tag, `@${n}`)));

test('the area list is exactly the 16 agreed names', () =>
  assert.deepEqual(Object.keys(AREAS).sort(), [...SIXTEEN].sort()));

test('buildRunPlan with --unit has no emulator step', () =>
  assert.ok(
    buildRunPlan(['expenses'], AREAS, { unit: true, e2e: false }).every(
      (s) => !s.args.join(' ').includes('emulators')
    )
  ));

test('buildRunPlan with --unit passes every unit path as --include', () => {
  const [unit, ...rest] = buildRunPlan(['categories'], AREAS, {
    unit: true,
    e2e: false,
  });
  assert.equal(rest.length, 0);
  assert.ok(unit.args.includes('--watch=false'));
  for (const p of AREAS.categories.unit) {
    const at = unit.args.indexOf(p);
    assert.ok(at > 0 && unit.args[at - 1] === '--include', p);
  }
});

test('buildRunPlan joins several areas into one grep that always includes @infra', () => {
  const e2e = buildRunPlan(['expenses', 'history'], AREAS, {
    unit: false,
    e2e: true,
  }).at(-1);
  assert.match(e2e.args.join(' '), /@expenses\|@history\|@infra/);
});

test('buildRunPlan runs functions specs and e2e in separate wrapper invocations', () => {
  const plan = buildRunPlan(['summary'], AREAS, { unit: false, e2e: true });
  assert.deepEqual(
    plan.map((s) => s.label),
    ['functions', 'e2e']
  );
  const [fn, e2e] = plan;
  // functions: trigger-free emulators, no functions build, vitest on the specs
  assert.equal(fn.cmd, 'node');
  assert.ok(fn.args.join(' ').includes('--only auth,firestore,storage'));
  assert.ok(!fn.args.includes('--build-functions'));
  for (const spec of AREAS.summary.functions) {
    assert.ok(fn.args.includes(spec), spec);
  }
  assert.ok(fn.args.join(' ').includes('--dir functions exec vitest run'));
  // e2e: all four emulators (default --only) and a fresh functions build
  assert.ok(e2e.args.includes('--build-functions'));
  assert.ok(!e2e.args.includes('--only'));
  assert.ok(e2e.args.join(' ').includes('exec playwright test --grep'));
});

test('buildRunPlan skips the functions step when the areas have no functions specs', () => {
  const plan = buildRunPlan(['categories'], AREAS, { unit: false, e2e: true });
  assert.deepEqual(
    plan.map((s) => s.label),
    ['e2e']
  );
});

test('buildRunPlan runs unit, functions and e2e in that order by default', () => {
  const plan = buildRunPlan(['receipts'], AREAS, { unit: true, e2e: true });
  assert.deepEqual(
    plan.map((s) => s.label),
    ['unit', 'functions', 'e2e']
  );
});

test('buildRunPlan de-duplicates paths shared by several areas', () => {
  const [unit] = buildRunPlan(['expenses', 'split'], AREAS, {
    unit: true,
    e2e: false,
  });
  const includes = unit.args.filter((_, i) => unit.args[i - 1] === '--include');
  assert.equal(new Set(includes).size, includes.length);
});

// Cross-cutting rule: app-wide primitives run under every area that imports
// them (membership derived from real imports; see areas.mjs).
const covers = (name, p) =>
  AREAS[name].unit.some((u) => p === u || p.startsWith(`${u}/`));
const everyAreaExcept = (...skip) =>
  Object.keys(AREAS).filter((n) => !skip.includes(n));

test('the analytics service and its privacy util are covered by every area', () => {
  for (const name of Object.keys(AREAS)) {
    assert.ok(covers(name, 'app/services/analytics.service.spec.ts'), name);
    assert.ok(covers(name, 'app/utilities/analytics-privacy.util.spec.ts'), name);
  }
});

test('custom-snackbar is covered by every area except home and rental', () => {
  for (const name of everyAreaExcept('home', 'rental')) {
    assert.ok(
      covers(name, 'app/shared/components/custom-snackbar/custom-snackbar.component.spec.ts'),
      name
    );
  }
});

test('the app-check error handler is covered by the areas that import it', () => {
  const spec = 'app/services/app-check-error-handler.service.spec.ts';
  for (const name of ['shell', 'auth', 'account', 'groups', 'members', 'expenses', 'receipts', 'summary', 'history', 'admin']) {
    assert.ok(covers(name, spec), name);
  }
});

test('the loading component/service is covered by every area except rental, split and home', () => {
  for (const name of everyAreaExcept('rental', 'split', 'home')) {
    assert.ok(
      covers(name, 'app/shared/components/loading/loading.component.spec.ts'),
      name
    );
  }
  for (const name of ['rental', 'split', 'home']) {
    assert.ok(
      !covers(name, 'app/shared/components/loading/loading.component.spec.ts'),
      name
    );
  }
});

test('the user service is covered by the areas that import it', () => {
  for (const name of ['shell', 'auth', 'account', 'history', 'summary', 'expenses', 'receipts']) {
    assert.ok(covers(name, 'app/services/user.service.spec.ts'), name);
  }
});

test('findUnassigned flags a spec under no area and an untagged e2e test', () => {
  const r = findUnassigned(
    {
      unitSpecs: ['app/orphan/x.spec.ts'],
      functionsSpecs: [],
      e2eTests: [{ title: 't', tags: [] }],
    },
    AREAS
  );
  assert.deepEqual(r.unit, ['app/orphan/x.spec.ts']);
  assert.deepEqual(r.e2e, ['t']);
});

test('findUnassigned accepts directory prefixes, listed functions specs and @infra-only tests', () => {
  const dir = AREAS.categories.unit.find((p) => !p.endsWith('.ts'));
  assert.ok(dir, 'categories lists a directory');
  const r = findUnassigned(
    {
      unitSpecs: [`${dir}/nested/x.spec.ts`],
      functionsSpecs: [AREAS.summary.functions[0], 'src/orphan.spec.ts'],
      e2eTests: [
        { title: 'seed', tags: ['@infra'] },
        { title: 'ok', tags: ['@expenses'] },
        { title: 'typo', tags: ['@expences'] },
      ],
    },
    AREAS
  );
  assert.deepEqual(r.unit, []);
  assert.deepEqual(r.functions, ['src/orphan.spec.ts']);
  assert.deepEqual(r.e2e, ['typo']);
});

test('findUnassigned does not treat a sibling name as a directory prefix', () => {
  const dir = AREAS.categories.unit.find((p) => !p.endsWith('.ts'));
  const r = findUnassigned(
    { unitSpecs: [`${dir}-other/x.spec.ts`], functionsSpecs: [], e2eTests: [] },
    AREAS
  );
  assert.deepEqual(r.unit, [`${dir}-other/x.spec.ts`]);
});

test('findDangling flags area paths that match no discovered spec', () => {
  const r = findDangling(
    { unitSpecs: ['app/a/x.spec.ts'], functionsSpecs: ['src/a.spec.ts'] },
    {
      one: {
        unit: ['app/a', 'app/gone'],
        functions: ['src/gone.spec.ts'],
        tag: '@one',
      },
    }
  );
  assert.deepEqual(r.unit, ['one: app/gone']);
  assert.deepEqual(r.functions, ['one: src/gone.spec.ts']);
});

test('every area path is unique within its area and uses forward slashes', () => {
  for (const [name, area] of Object.entries(AREAS)) {
    for (const list of [area.unit, area.functions]) {
      assert.equal(new Set(list).size, list.length, `${name} has duplicates`);
      for (const p of list) assert.ok(!p.includes('\\'), `${name}: ${p}`);
    }
  }
});

test('parseUnitList reads ng test --list-tests output as src-relative posix paths', () => {
  const out =
    'Discovered test files:\r\n  src\\app\\a\\x.spec.ts\r\n  src\\app\\b.spec.ts\r\n';
  assert.deepEqual(parseUnitList(out), ['app/a/x.spec.ts', 'app/b.spec.ts']);
});

test('parseE2eList flattens nested suites into titled tests with tags', () => {
  const report = {
    suites: [
      {
        file: 'a.spec.ts',
        specs: [],
        suites: [
          {
            title: 'outer',
            file: 'a.spec.ts',
            specs: [
              { title: 'one', file: 'a.spec.ts', tags: ['auth', '@infra'] },
            ],
            suites: [
              {
                title: 'inner',
                file: 'a.spec.ts',
                specs: [{ title: 'two', file: 'a.spec.ts', tags: [] }],
              },
            ],
          },
        ],
      },
    ],
  };
  assert.deepEqual(parseE2eList(report), [
    { title: 'a.spec.ts > outer > one', tags: ['@auth', '@infra'] },
    { title: 'a.spec.ts > outer > inner > two', tags: [] },
  ]);
});

test('parseCliArgs separates areas from flags', () => {
  assert.deepEqual(parseCliArgs(['expenses', 'history', '--unit']), {
    check: false,
    names: ['expenses', 'history'],
    unit: true,
    e2e: false,
  });
  assert.deepEqual(parseCliArgs(['--check']), {
    check: true,
    names: [],
    unit: true,
    e2e: true,
  });
  assert.deepEqual(parseCliArgs(['summary']), {
    check: false,
    names: ['summary'],
    unit: true,
    e2e: true,
  });
  assert.throws(() => parseCliArgs(['--bogus']), /Unknown option/);
});

test('summarize tabulates PASS/FAIL per step and fails if any step failed', () => {
  const { table, exitCode } = summarize([
    { label: 'unit', code: 0 },
    { label: 'e2e', code: 1 },
  ]);
  assert.match(table, /unit\s+PASS/);
  assert.match(table, /e2e\s+FAIL/);
  assert.equal(exitCode, 1);
  assert.equal(summarize([{ label: 'unit', code: 0 }]).exitCode, 0);
});

// Spec §5: places a feature's tests under every area that owns part of it.
test('account deletion is covered by auth as well as account', () => {
  for (const name of ['auth', 'account']) {
    assert.ok(covers(name, 'app/features/auth/delete-account/x.spec.ts'), name);
    assert.ok(AREAS[name].functions.includes('src/user-deletion.spec.ts'), name);
  }
});

test('route guards are covered by shell as well as auth', () => {
  for (const name of ['shell', 'auth']) {
    assert.ok(covers(name, 'app/features/auth/guards.guard.spec.ts'), name);
  }
});

test('the about page is covered by help as well as shell', () => {
  for (const name of ['help', 'shell']) {
    assert.ok(covers(name, 'app/features/about/about.component.spec.ts'), name);
  }
});

test('parseCliArgs --e2e alone runs only e2e', () => {
  assert.deepEqual(parseCliArgs(['expenses', '--e2e']), {
    check: false,
    names: ['expenses'],
    unit: false,
    e2e: true,
  });
});

test('parseCliArgs --unit --e2e runs both, in either order', () => {
  for (const argv of [
    ['expenses', '--unit', '--e2e'],
    ['--e2e', 'expenses', '--unit'],
  ]) {
    assert.deepEqual(parseCliArgs(argv), {
      check: false,
      names: ['expenses'],
      unit: true,
      e2e: true,
    });
  }
});

test('parseCliArgs rejects an unknown short option', () => {
  assert.throws(() => parseCliArgs(['expenses', '-x']), {
    message: 'Unknown option: -x',
  });
  assert.throws(() => parseCliArgs(['-u']), /Unknown option: -u/);
});

test('buildRunPlan with e2e only has no unit step', () => {
  const plan = buildRunPlan(['receipts'], AREAS, { unit: false, e2e: true });
  assert.ok(plan.length > 0);
  assert.ok(plan.every((s) => s.label !== 'unit'));
  assert.ok(plan.every((s) => !s.args.includes('--include')));
});

test('buildRunPlan drops duplicate tags from the e2e grep', () => {
  const e2e = buildRunPlan(['expenses', 'expenses', 'history'], AREAS, {
    unit: false,
    e2e: true,
  }).at(-1);
  assert.equal(e2e.args.at(-1), '@expenses|@history|@infra');
});

test('buildRunPlan is empty when a unit-only run selects areas with no unit specs', () => {
  const areas = { bare: { unit: [], functions: [], tag: '@bare' } };
  assert.deepEqual(buildRunPlan(['bare'], areas, { unit: true, e2e: false }), []);
});

test('summarize([]) has just the header and does not pass', () => {
  const { table, exitCode } = summarize([]);
  assert.equal(table, 'Step results:');
  assert.equal(exitCode, 1);
});

test('summarize pads labels to the widest one', () => {
  const { table } = summarize([
    { label: 'unit', code: 0 },
    { label: 'functions', code: 1 },
  ]);
  assert.equal(table, 'Step results:\n  unit       PASS\n  functions  FAIL');
});

test('parseE2eList gives [] for a report with no suites', () => {
  assert.deepEqual(parseE2eList({}), []);
  assert.deepEqual(parseE2eList({ suites: [] }), []);
});

test('executePlan fails with a clear message when the plan has no steps', async () => {
  const errors = [];
  const ran = [];
  const code = await executePlan([], ['bare', 'other'], { unit: true, e2e: false }, {
    run: async (step) => {
      ran.push(step);
      return 0;
    },
    log: { log: () => {}, error: (m) => errors.push(m) },
  });
  assert.equal(code, 1);
  assert.deepEqual(errors, ['Nothing to run for: bare, other (--unit)']);
  assert.deepEqual(ran, []);
});

test('executePlan names both flags when both were requested', async () => {
  const errors = [];
  await executePlan([], ['bare'], { unit: true, e2e: true }, {
    log: { log: () => {}, error: (m) => errors.push(m) },
  });
  assert.deepEqual(errors, ['Nothing to run for: bare (--unit --e2e)']);
});

test('executePlan runs every step even after a failure, then reports the failure', async () => {
  const logged = [];
  const codes = { unit: 1, e2e: 0 };
  const ran = [];
  const code = await executePlan(
    [
      { label: 'unit', cmd: 'pnpm', args: ['a'] },
      { label: 'e2e', cmd: 'node', args: ['b'] },
    ],
    ['x'],
    { unit: true, e2e: true },
    {
      run: async (step) => {
        ran.push(step.label);
        return codes[step.label];
      },
      log: { log: (m) => logged.push(m), error: () => {} },
    }
  );
  assert.equal(code, 1);
  assert.deepEqual(ran, ['unit', 'e2e']);
  const table = logged.at(-1);
  assert.match(table, /unit\s+FAIL/);
  assert.match(table, /e2e\s+PASS/);
});

test('executePlan passes when every step passes', async () => {
  const code = await executePlan(
    [{ label: 'unit', cmd: 'pnpm', args: [] }],
    ['x'],
    { unit: true, e2e: false },
    { run: async () => 0, log: { log: () => {}, error: () => {} } }
  );
  assert.equal(code, 0);
});

test('invocation on win32 quotes shell arguments with spaces or %VAR%', () => {
  assert.deepEqual(
    invocation('pnpm', ['exec', 'ng', 'test', '--include', 'my dir/a.spec.ts', '%TEMP%'], 'win32'),
    {
      file: 'pnpm exec ng test --include "my dir/a.spec.ts" "%TEMP%"',
      argv: [],
      shell: true,
    }
  );
});

test('invocation on win32 keeps an empty argument and leaves plain ones bare', () => {
  assert.equal(
    invocation('pnpm', ['exec', '', '--watch=false'], 'win32').file,
    'pnpm exec "" --watch=false'
  );
});

test('invocation runs node steps without a shell, with the arguments untouched', () => {
  const args = ['wrapper.mjs', '--grep', '@a|@b c'];
  for (const platform of ['win32', 'linux']) {
    assert.deepEqual(invocation('node', args, platform), {
      file: 'node',
      argv: args,
      shell: false,
    });
  }
});

test('invocation does not use a shell for pnpm outside win32', () => {
  assert.deepEqual(invocation('pnpm', ['a b'], 'linux'), {
    file: 'pnpm',
    argv: ['a b'],
    shell: false,
  });
});

test('parseJsonReport reads a report that follows a log line containing a brace', () => {
  const report = { suites: [{ file: 'a.spec.ts', specs: [] }] };
  const stdout = `Using config {debug: true}\n${JSON.stringify(report, null, 2)}\n`;
  assert.deepEqual(parseJsonReport(stdout), report);
});

test('parseJsonReport reads a report that follows a log line that starts with a brace', () => {
  const report = { suites: [] };
  const stdout = `{not json at all}\n${JSON.stringify(report, null, 2)}`;
  assert.deepEqual(parseJsonReport(stdout), report);
});

test('parseJsonReport reads a bare report', () => {
  assert.deepEqual(parseJsonReport('{"suites":[]}'), { suites: [] });
  assert.deepEqual(parseJsonReport('{\r\n  "suites": []\r\n}\r\n'), { suites: [] });
});

test('parseJsonReport throws a clear error when there is no report', () => {
  assert.throws(() => parseJsonReport('no report here {oops}'), /JSON report/);
  assert.throws(() => parseJsonReport(''), /JSON report/);
});
