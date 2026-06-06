import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import * as authModule from 'firebase/auth';
import * as functionsModule from 'firebase/functions';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        AnalyticsService,
        { provide: authModule.getAuth, useValue: { currentUser: null } },
        { provide: functionsModule.getFunctions, useValue: {} },
      ],
    });
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call FirebaseAnalytics.logEvent with the event name and params', async () => {
    await service.logEvent('test_event', { key: 'value' });
    expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
      name: 'test_event',
      params: { key: 'value' },
    });
  });

  it('should call FirebaseAnalytics.logEvent with no params when omitted', async () => {
    await service.logEvent('simple_event');
    expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
      name: 'simple_event',
      params: undefined,
    });
  });

  it('should silently swallow errors and not rethrow', async () => {
    vi.spyOn(FirebaseAnalytics, 'logEvent').mockRejectedValueOnce(
      new Error('network error')
    );
    await expect(service.logEvent('fail_event')).resolves.toBeUndefined();
  });
});
