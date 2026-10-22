import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { LoadingService } from './loading.service';

describe('LoadingService', () => {
  function setup() {
    return TestBed.inject(LoadingService);
  }

  it('should not be loading to begin with', () => {
    expect(setup().loading()).toBe(false);
  });

  it('should be loading after loadingOn and not after the matching loadingOff', () => {
    const service = setup();

    service.loadingOn('a');
    expect(service.loading()).toBe(true);

    service.loadingOff('a');
    expect(service.loading()).toBe(false);
  });

  it('should use the same default source for loadingOn() and loadingOff()', () => {
    const service = setup();

    service.loadingOn();
    expect(service.loading()).toBe(true);

    service.loadingOff();
    expect(service.loading()).toBe(false);
  });

  it('should keep loading while another source is still on', () => {
    const service = setup();
    service.loadingOn('a');
    service.loadingOn('b');

    service.loadingOff('a');
    expect(service.loading()).toBe(true);

    service.loadingOff('b');
    expect(service.loading()).toBe(false);
  });

  it('should treat a source that was never turned on as harmless to turn off', () => {
    const service = setup();

    service.loadingOff('never-on');
    expect(service.loading()).toBe(false);

    service.loadingOn('a');
    service.loadingOff('never-on');
    expect(service.loading()).toBe(true);
  });

  it('should publish a new loading state to a computed that reads it', () => {
    const service = setup();
    const seen: boolean[] = [];

    seen.push(service.loading());
    service.loadingOn('a');
    seen.push(service.loading());
    service.loadingOff('a');
    seen.push(service.loading());

    expect(seen).toEqual([false, true, false]);
  });

  // BUG (B6): loading.service.ts:11-15 and :18-24 - sources are a Set, so a
  // second loadingOn() for the same source is absorbed and the first
  // loadingOff() clears it. Two concurrent callers of the default source drop
  // the overlay while one of them is still loading. Deferred by owner 2026-10-21.
  it.fails(
    'should keep loading until every concurrent caller of the default source has turned it off',
    () => {
      const service = setup();

      service.loadingOn();
      service.loadingOn();
      service.loadingOff();

      expect(service.loading()).toBe(true);
    }
  );
});
