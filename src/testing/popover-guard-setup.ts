import { afterEach, expect } from 'vitest';

// jsdom has no popover API, and unit specs share one jsdom per worker. If a
// spec stubs HTMLElement.prototype.showPopover (or hidePopover) and leaves it
// behind, every later spec in that worker gets popover overlays: mat-select
// then renders its panel inline next to the trigger instead of in
// .cdk-overlay-container, and option lookups there find nothing
// (account-preferences, Task 15b).
// This fails the leaking test itself. It runs after the spec's own afterEach
// hooks (they run in reverse registration order), so after restoreAllMocks,
// which can put a deleted stub back. It removes the stubs and fails softly,
// so the later teardown hooks (TestBed's reset) still run and nothing
// cascades. The baseline is taken once per worker, before any spec can stub
// the API, because this file runs again before every spec file.
// A spec that needs the stubs must install AND remove them within each test
// (as guided-tour.service.spec.ts does): stubs installed in beforeAll and
// removed in afterAll would fail every test in that suite here.
const POPOVER_KEYS = ['showPopover', 'hidePopover'] as const;
const NATIVE_POPOVER = Symbol.for('pip-cost-sharing.nativePopoverKeys');
const store = globalThis as unknown as Record<
  symbol,
  Record<string, boolean> | undefined
>;
store[NATIVE_POPOVER] ??= Object.fromEntries(
  POPOVER_KEYS.map((key) => [key, key in HTMLElement.prototype])
);

afterEach(() => {
  const native = store[NATIVE_POPOVER]!;
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const leaked = POPOVER_KEYS.filter(
    (key) => !native[key] && key in HTMLElement.prototype
  );
  for (const key of leaked) delete proto[key];
  expect
    .soft(leaked, 'HTMLElement.prototype popover stubs left behind')
    .toEqual([]);
});
