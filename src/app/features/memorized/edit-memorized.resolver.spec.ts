import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { MemorizedService } from '@services/memorized.service';
import { GroupStore } from '@store/group.store';
import { createMockGroupStore, mockGroup } from '@testing/test-helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { editMemorizedResolver } from './edit-memorized.resolver';

describe('editMemorizedResolver', () => {
  let mockMemorizedService: { getMemorized: ReturnType<typeof vi.fn> };
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;

  const route = {
    paramMap: convertToParamMap({ id: 'memorized-3' }),
  } as unknown as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;

  function resolve() {
    return TestBed.runInInjectionContext(() =>
      editMemorizedResolver(route, state)
    );
  }

  beforeEach(() => {
    mockMemorizedService = { getMemorized: vi.fn() };
    mockGroupStore = createMockGroupStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: MemorizedService, useValue: mockMemorizedService },
        { provide: GroupStore, useValue: mockGroupStore },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should fetch the memorized expense with the current group id and the route id', async () => {
    mockGroupStore.currentGroup.set(mockGroup({ id: 'group-9' }));
    const memorized = { id: 'memorized-3', description: 'Rent' };
    mockMemorizedService.getMemorized.mockResolvedValue(memorized);

    const result = await resolve();

    expect(mockMemorizedService.getMemorized).toHaveBeenCalledTimes(1);
    expect(mockMemorizedService.getMemorized).toHaveBeenCalledWith(
      'group-9',
      'memorized-3'
    );
    expect(result).toBe(memorized);
  });

  it('should propagate a rejection from getMemorized', async () => {
    mockGroupStore.currentGroup.set(mockGroup({ id: 'group-9' }));
    mockMemorizedService.getMemorized.mockRejectedValue(new Error('not found'));

    await expect(resolve()).rejects.toThrow('not found');
  });

  // BUG (B9): src/app/features/memorized/edit-memorized.resolver.ts:10
  // currentGroup()!.id throws a TypeError when there is no current group instead of
  // redirecting to Memorized. Deferred by owner 2026-10-21; remove it.fails when fixed.
  it.fails('should redirect to Memorized instead of throwing when there is no current group', async () => {
    mockGroupStore.currentGroup.set(null);

    const result = await resolve();

    const target =
      result instanceof RedirectCommand
        ? (result.redirectTo as UrlTree)
        : (result as unknown as UrlTree);
    expect(TestBed.inject(Router).serializeUrl(target)).toBe('/memorized');
    expect(mockMemorizedService.getMemorized).not.toHaveBeenCalled();
  });
});
