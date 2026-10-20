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

  it('should not call FirebaseAnalytics on emulator builds (GA disabled)', async () => {
    (service as any).gaEnabled = false;
    await service.logEvent('test_event');
    await service.logScreenView('home');
    expect(FirebaseAnalytics.logEvent).not.toHaveBeenCalled();
  });

  it('should call FirebaseAnalytics.logEvent with no params when omitted', async () => {
    await service.logEvent('simple_event');
    expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
      name: 'simple_event',
      params: undefined,
    });
  });

  it('should drop an email parameter and scrub emails in string values before sending', async () => {
    await service.logEvent('members_linked', {
      email: 'alice@test.com',
      note: 'linked for bob@test.com',
      membersLinked: 2,
    });
    expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
      name: 'members_linked',
      params: { note: 'linked for [email]', membersLinked: 2 },
    });
  });

  it('should silently swallow errors and not rethrow', async () => {
    vi.spyOn(FirebaseAnalytics, 'logEvent').mockRejectedValueOnce(
      new Error('network error')
    );
    await expect(service.logEvent('fail_event')).resolves.toBeUndefined();
  });

  describe('logAppCheckStatus', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('web');
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    });

    it('logs a ready session with provider and platform', async () => {
      await service.logAppCheckStatus({ ready: true, reason: 'ready' });

      expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
        name: 'app_check_status',
        params: {
          provider: 'recaptcha',
          ready: 'true',
          reason: 'ready',
          platform: 'web',
        },
      });
    });

    it('includes the native app version and a truncated failure detail', async () => {
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android');
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.spyOn(App, 'getInfo').mockResolvedValue({
        id: 'com.pipsplit.app',
        name: 'PipSplit',
        build: '26',
        version: '1.3.1',
      });

      await service.logAppCheckStatus({
        ready: false,
        reason: 'error',
        detail: 'x'.repeat(150),
      });

      expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
        name: 'app_check_status',
        params: expect.objectContaining({
          ready: 'false',
          reason: 'error',
          platform: 'android',
          native_app_version: '1.3.1 (26)',
          detail: 'x'.repeat(100),
        }),
      });
    });

    it('logs nothing when App Check was never initialized', async () => {
      await service.logAppCheckStatus({ ready: true, reason: 'not-initialized' });

      expect(FirebaseAnalytics.logEvent).not.toHaveBeenCalled();
    });
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

    it('scrubs emails from the Analytics copy but keeps them in the Firestore copy', async () => {
      await service.logError(
        'Member Link Service',
        'linkInvitedMembers',
        'Skipped: App Check token unavailable',
        'alice@test.com (error: throttled)'
      );

      expect(FirebaseAnalytics.logEvent).toHaveBeenCalledWith({
        name: 'app_error',
        params: expect.objectContaining({
          error: '[email] (error: throttled)',
        }),
      });
      expect(callableFn).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'alice@test.com (error: throttled)' })
      );
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
