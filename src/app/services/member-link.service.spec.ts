import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import * as functionsModule from 'firebase/functions';
import * as appCheckModule from 'firebase/app-check';
import { AnalyticsService } from '@services/analytics.service';
import { initAppCheck, resetAppCheckForTesting } from '../app-check';
import { MemberLinkService } from './member-link.service';

const mockFunctions = {};

// appCheckTokenReady() (app-check.ts) is not directly mockable via vi.spyOn
// - Vite's ESM live bindings aren't configurable across the app-source/spec
// boundary. Instead, drive it through its real implementation: initAppCheck
// makes it non-trivial (appCheck instance captured), then control the
// underlying getToken() call on the mocked firebase/app-check module, which
// IS configurable since it's a synthetic test mock (see app-check.spec.ts).

describe('MemberLinkService', () => {
  let service: MemberLinkService;
  let linkInvitedMembersFn: ReturnType<typeof vi.fn>;

  const mockAnalytics = { logError: vi.fn() };

  function createService(): MemberLinkService {
    TestBed.configureTestingModule({
      providers: [
        MemberLinkService,
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    return TestBed.inject(MemberLinkService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    linkInvitedMembersFn = vi.fn().mockResolvedValue({
      data: { membersLinked: 0 },
    });
    vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
      linkInvitedMembersFn as any
    );
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAppCheckForTesting();
  });

  describe('when an App Check token is available', () => {
    beforeEach(() => {
      initAppCheck({} as any);
      vi.spyOn(appCheckModule, 'getToken').mockResolvedValue({
        token: 'abc',
      } as any);
    });

    it('invokes the callable and returns the linked count', async () => {
      linkInvitedMembersFn.mockResolvedValueOnce({
        data: { membersLinked: 3 },
      });

      const result = await service.linkInvitedMembers('alice@test.com');

      expect(functionsModule.httpsCallable).toHaveBeenCalledWith(
        mockFunctions,
        'linkInvitedMembers'
      );
      expect(linkInvitedMembersFn).toHaveBeenCalledWith({
        email: 'alice@test.com',
      });
      expect(result).toBe(3);
    });

    it('logs and rethrows when the callable fails', async () => {
      linkInvitedMembersFn.mockRejectedValueOnce(new Error('internal'));

      await expect(
        service.linkInvitedMembers('alice@test.com')
      ).rejects.toThrow('internal');
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Member Link Service',
        'linkInvitedMembers',
        'Failed to link invited members',
        'internal'
      );
    });
  });

  describe('when no App Check token becomes available in time', () => {
    beforeEach(() => {
      initAppCheck({} as any);
      vi.spyOn(appCheckModule, 'getToken').mockRejectedValue(
        new Error('no token')
      );
    });

    it('skips the callable entirely and returns null', async () => {
      const result = await service.linkInvitedMembers('alice@test.com');

      expect(functionsModule.httpsCallable).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('logs the skip so it stays visible in the error log', async () => {
      await service.linkInvitedMembers('alice@test.com');

      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Member Link Service',
        'linkInvitedMembers',
        'Skipped: App Check token unavailable',
        'alice@test.com (error: no token)'
      );
    });
  });
});
