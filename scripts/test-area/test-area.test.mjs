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
