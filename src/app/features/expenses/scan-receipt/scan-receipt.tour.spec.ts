import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildScanReceiptTourSteps,
  ScanReceiptTourHooks,
} from './scan-receipt.tour';

describe('buildScanReceiptTourSteps', () => {
  let hooks: { [K in keyof ScanReceiptTourHooks]: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    hooks = {
      usingSample: vi.fn(() => true),
      showScanned: vi.fn(),
    };
  });

  const build = () => buildScanReceiptTourSteps(hooks as ScanReceiptTourHooks);
  const step = (id: string) => build().find((s) => s.id === id)!;

  it('should walk choosing a photo, reviewing the scan, and continuing', () => {
    expect(build().map((s) => s.id)).toEqual([
      'intro',
      'select-photo',
      'file',
      'amounts',
      'items',
      'assign',
      'totals',
      'continue',
    ]);
  });

  it('should show the photo picker, then the scan', async () => {
    await step('select-photo').beforeShow!();
    expect(hooks.showScanned).toHaveBeenLastCalledWith(false);

    for (const id of ['file', 'amounts', 'items', 'assign', 'totals']) {
      await step(id).beforeShow!();
      expect(hooks.showScanned, id).toHaveBeenLastCalledWith(true);
    }
  });

  it('should skip choosing a photo once one is scanned', () => {
    expect(step('select-photo').when!()).toBe(true);
    expect(step('intro').text).toContain('sample');

    hooks.usingSample.mockReturnValue(false);
    expect(step('select-photo').when!()).toBe(false);
    expect(step('intro').text).not.toContain('sample');
  });

  it('should explain that the total includes tax and tip', () => {
    expect(step('amounts').text).toContain('including tax and tip');
  });
});
