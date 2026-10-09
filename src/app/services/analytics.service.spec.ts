import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
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

  describe('logError', () => {
    let callableFn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      callableFn = vi.fn().mockResolvedValue({ data: {} });
      vi.spyOn(functionsModule, 'httpsCallable').mockReturnValue(
        callableFn as any
      );
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    });

    it('attaches platform/native/userAgent as additionalInfo to both GA and the callable', async () => {
      await service.logError('Test Component', 'testAction', 'Test message');

      const expectedInfo = `platform: web, native: false, appCheck: recaptcha, userAgent: ${navigator.userAgent}`;
      expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
        name: 'app_error',
        params: {
          component: 'Test Component',
          action: 'testAction',
          message: 'Test message',
          additionalInfo: expectedInfo,
        },
      });
      expect(callableFn).toHaveBeenCalledWith({
        component: 'Test Component',
        action: 'testAction',
        message: 'Test message',
        additionalInfo: expectedInfo,
      });
    });

    it('reflects native platform state', async () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

      await service.logError('Test Component', 'testAction', 'Test message');

      expect(callableFn).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalInfo: expect.stringContaining(
            'platform: android, native: true'
          ),
        })
      );
    });

    it('includes the native app version on native platforms', async () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.spyOn(App, 'getInfo').mockResolvedValue({
        id: 'com.pipsplit.app',
        name: 'PipSplit',
        build: '45',
        version: '1.2.3',
      });

      await service.logError('Test Component', 'testAction', 'Test message');

      expect(callableFn).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalInfo: `platform: android, native: true, appVersion: 1.2.3 (45), appCheck: recaptcha, userAgent: ${navigator.userAgent}`,
        })
      );
    });

    it('does not look up the app version on web', async () => {
      const getInfoSpy = vi.spyOn(App, 'getInfo');

      await service.logError('Test Component', 'testAction', 'Test message');

      expect(getInfoSpy).not.toHaveBeenCalled();
    });

    it('still logs the error, minus the version, if the app version lookup fails', async () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.spyOn(App, 'getInfo').mockRejectedValue(new Error('unavailable'));

      await service.logError('Test Component', 'testAction', 'Test message');

      expect(callableFn).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalInfo: `platform: android, native: true, appCheck: recaptcha, userAgent: ${navigator.userAgent}`,
        })
      );
    });

    it('only looks up the app version once across multiple errors', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      const getInfoSpy = vi.spyOn(App, 'getInfo').mockResolvedValue({
        id: 'com.pipsplit.app',
        name: 'PipSplit',
        build: '45',
        version: '1.2.3',
      });

      await service.logError('Test Component', 'a', 'first');
      await service.logError('Test Component', 'b', 'second');

      expect(getInfoSpy).toHaveBeenCalledTimes(1);
    });

    it('still includes the error field alongside additionalInfo', async () => {
      await service.logError(
        'Test Component',
        'testAction',
        'Test message',
        'boom'
      );

      expect(callableFn).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'boom' })
      );
    });
  });
});
