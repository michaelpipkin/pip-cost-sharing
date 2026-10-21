import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaQueryService } from './media-query.service';

describe('MediaQueryService', () => {
  let service: MediaQueryService;
  const originalMatchMedia = globalThis.matchMedia;

  /** A fake MediaQueryList whose `change` listeners the test can fire. */
  function fakeMediaQueryList(initial: boolean) {
    const listeners: ((event: { matches: boolean }) => void)[] = [];
    return {
      matches: initial,
      addEventListener: vi.fn(
        (_type: string, listener: (event: { matches: boolean }) => void) =>
          listeners.push(listener)
      ),
      fire(matches: boolean): void {
        listeners.forEach((listener) => listener({ matches }));
      },
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(MediaQueryService);
  });

  afterEach(() => {
    globalThis.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it('should start with the current match state', () => {
    const list = fakeMediaQueryList(true);
    globalThis.matchMedia = vi.fn(() => list) as any;

    expect(service.matches('(max-width: 767px)')()).toBe(true);
  });

  it('should follow changes to the match state', () => {
    const list = fakeMediaQueryList(false);
    globalThis.matchMedia = vi.fn(() => list) as any;
    const matches = service.matches('(max-width: 767px)');

    list.fire(true);
    expect(matches()).toBe(true);

    list.fire(false);
    expect(matches()).toBe(false);
  });

  it('should share one listener per query', () => {
    const list = fakeMediaQueryList(false);
    const matchMedia = vi.fn(() => list);
    globalThis.matchMedia = matchMedia as any;

    const first = service.matches('(max-width: 767px)');
    const second = service.matches('(max-width: 767px)');

    expect(second).toBe(first);
    expect(matchMedia).toHaveBeenCalledTimes(1);
    expect(list.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('should never match without matchMedia', () => {
    globalThis.matchMedia = undefined as any;

    expect(service.matches('(max-width: 767px)')()).toBe(false);
  });
});
