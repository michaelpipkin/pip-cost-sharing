import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { DeepLinkService } from './deep-link.service';
import { AnalyticsService } from '@services/analytics.service';

describe('DeepLinkService', () => {
  let service: DeepLinkService;
  const mockRouter = { navigate: vi.fn() };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  function createService(): DeepLinkService {
    TestBed.configureTestingModule({
      providers: [
        DeepLinkService,
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    const svc = TestBed.inject(DeepLinkService);
    (svc as any).router = mockRouter;
    return svc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    vi.spyOn(App, 'addListener').mockResolvedValue(undefined as any);
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialize', () => {
    it('should not register a listener in browser mode', () => {
      service.initialize();
      expect(App.addListener).not.toHaveBeenCalled();
    });

    it('should register an appUrlOpen listener on native platforms', () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      service.initialize();
      expect(App.addListener).toHaveBeenCalledWith(
        'appUrlOpen',
        expect.any(Function)
      );
    });
  });

  describe('handleDeepLink (via registered listener)', () => {
    let urlOpenHandler: (event: { url: string }) => void;

    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.spyOn(App, 'addListener').mockImplementation(
        (_event: any, handler: any) => {
          urlOpenHandler = handler;
          return Promise.resolve() as any;
        }
      );
      service.initialize();
    });

    it('should navigate to the parsed path', () => {
      urlOpenHandler({ url: 'https://pipsplit.app/expenses' });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/expenses'], {
        queryParams: {},
      });
    });

    it('should extract query parameters and pass them to navigate', () => {
      urlOpenHandler({
        url: 'https://pipsplit.app/reset-password?mode=resetPassword&oobCode=abc123',
      });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/reset-password'], {
        queryParams: { mode: 'resetPassword', oobCode: 'abc123' },
      });
    });

    it('should log a deep_link_received analytics event', () => {
      urlOpenHandler({ url: 'https://pipsplit.app/expenses' });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'deep_link_received',
        expect.objectContaining({ path: '/expenses' })
      );
    });

    it('should log an error event for a malformed URL', () => {
      urlOpenHandler({ url: 'not-a-valid-url' });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ service: 'DeepLinkService' })
      );
    });

    it('should not navigate on a malformed URL', () => {
      urlOpenHandler({ url: 'not-a-valid-url' });
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });
});
