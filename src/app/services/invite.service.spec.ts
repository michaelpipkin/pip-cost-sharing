import { TestBed } from '@angular/core/testing';
import * as functionsModule from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsService } from './analytics.service';
import { InviteService } from './invite.service';

const mockFunctions = {};

describe('InviteService', () => {
  let service: InviteService;
  let mockAnalytics: { logError: ReturnType<typeof vi.fn> };
  let httpsCallableSpy: ReturnType<typeof vi.spyOn>;
  let callableFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAnalytics = { logError: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        InviteService,
        { provide: functionsModule.getFunctions, useValue: mockFunctions },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    service = TestBed.inject(InviteService);

    callableFn = vi.fn().mockResolvedValue({
      data: { success: true, sentTo: 'alex@example.com', sendCount: 1 },
    });
    httpsCallableSpy = vi
      .spyOn(functionsModule, 'httpsCallable')
      .mockReturnValue(callableFn as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendGroupInvite', () => {
    it('invokes the sendGroupInvite callable with groupId and memberId', async () => {
      await service.sendGroupInvite('group-1', 'member-1');

      expect(httpsCallableSpy).toHaveBeenCalledWith(
        mockFunctions,
        'sendGroupInvite'
      );
      expect(callableFn).toHaveBeenCalledWith({
        groupId: 'group-1',
        memberId: 'member-1',
      });
    });

    it('returns the callable response data', async () => {
      const result = await service.sendGroupInvite('group-1', 'member-1');
      expect(result).toEqual({
        success: true,
        sentTo: 'alex@example.com',
        sendCount: 1,
      });
    });

    it('logs an error and rethrows when the callable rejects', async () => {
      callableFn.mockRejectedValueOnce(new Error('resource-exhausted'));

      await expect(
        service.sendGroupInvite('group-1', 'member-1')
      ).rejects.toThrow('resource-exhausted');

      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Invite Service',
        'sendGroupInvite',
        'Failed to send group invite',
        'resource-exhausted'
      );
    });
  });
});
