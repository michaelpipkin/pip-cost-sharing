import { afterEach, expect } from 'vitest';

// jsdom has no popover API, and unit specs share one jsdom per worker. If a
// spec stubs HTMLElement.prototype.showPopover and leaves it behind, every
// later spec in that worker gets popover overlays: mat-select then renders its
// panel inline next to the trigger instead of in .cdk-overlay-container, and
// option lookups there find nothing (account-preferences, Task 15b).
// This fails the leaking test itself. It runs after the spec's own afterEach
// hooks (they run in reverse registration order), so after restoreAllMocks,
// which can put a deleted stub back. It removes the stub and fails softly, so
// the later teardown hooks (TestBed's reset) still run and nothing cascades.
// The baseline is taken once per worker, before any spec can stub the API,
// because this file runs again before every spec file.
const NATIVE_POPOVER = Symbol.for('pip-cost-sharing.nativePopover');
const store = globalThis as unknown as Record<symbol, boolean | undefined>;
store[NATIVE_POPOVER] ??= 'showPopover' in HTMLElement.prototype;

afterEach(() => {
  const leaked =
    !store[NATIVE_POPOVER] && 'showPopover' in HTMLElement.prototype;
  if (leaked) {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    delete proto['showPopover'];
    delete proto['hidePopover'];
  }
  expect
    .soft(leaked, 'HTMLElement.prototype.showPopover stub left behind')
    .toBe(false);
});
