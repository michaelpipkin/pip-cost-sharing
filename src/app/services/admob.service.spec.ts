import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { AdMob } from '@capacitor-community/admob';
import { AdMobService } from './admob.service';
import { PwaDetectionService } from './pwa-detection.service';
import { AnalyticsService } from '@services/analytics.service';

describe('AdMobService', () => {
  let navigationHandler: (event: any) => void;

  const mockRouter = {
    events: {
      subscribe: vi.fn((handler: (event: any) => void) => {
        navigationHandler = handler;
        return { unsubscribe: vi.fn() };
      }),
    },
  };

  const mockPwaService = { isRunningAsApp: vi.fn(() => true) };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  function createService(isApp = true): AdMobService {
    mockPwaService.isRunningAsApp.mockReturnValue(isApp);
    TestBed.configureTestingModule({
      providers: [
        AdMobService,
        { provide: Router, useValue: mockRouter },
        { provide: PwaDetectionService, useValue: mockPwaService },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    return TestBed.inject(AdMobService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AdMob, 'initialize').mockResolvedValue(undefined);
    vi.spyOn(AdMob, 'setApplicationMuted').mockResolvedValue(undefined);
    vi.spyOn(AdMob, 'setApplicationVolume').mockResolvedValue(undefined);
    vi.spyOn(AdMob, 'addListener').mockResolvedValue(undefined as any);
    vi.spyOn(AdMob, 'prepareInterstitial').mockResolvedValue(undefined as any);
    vi.spyOn(AdMob, 'showInterstitial').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('navigation counting', () => {
    it('should increment navigation count on NavigationEnd', () => {
      const service = createService();
      navigationHandler(new NavigationEnd(1, '/expenses', '/expenses'));
      expect((service as any).navigationCount).toBe(1);
    });

    it('should not increment count for login route', () => {
      const service = createService();
      navigationHandler(new NavigationEnd(1, '/login', '/login'));
      expect((service as any).navigationCount).toBe(0);
    });

    it('should not increment count for home route', () => {
      const service = createService();
      navigationHandler(new NavigationEnd(1, '/home', '/home'));
      expect((service as any).navigationCount).toBe(0);
    });

    it('should not react to non-NavigationEnd events', () => {
      const service = createService();
      navigationHandler({ type: 'NavigationStart' });
      expect((service as any).navigationCount).toBe(0);
    });
  });

  describe('ad frequency threshold', () => {
    it('should show ad when count reaches frequency and ad is loaded', async () => {
      const service = createService();
      (service as any).isAdLoaded.set(true);

      for (let i = 0; i < 4; i++) {
        navigationHandler(new NavigationEnd(i, '/expenses', '/expenses'));
      }
      await new Promise((r) => setTimeout(r, 0));

      expect(AdMob.showInterstitial).toHaveBeenCalled();
    });

    it('should reset navigation count to 0 after showing ad', async () => {
      const service = createService();
      (service as any).isAdLoaded.set(true);

      for (let i = 0; i < 4; i++) {
        navigationHandler(new NavigationEnd(i, '/expenses', '/expenses'));
      }
      await new Promise((r) => setTimeout(r, 0));

      expect((service as any).navigationCount).toBe(0);
    });

    it('should try loading ad when count reaches frequency but ad is not loaded', async () => {
      const service = createService();
      (service as any).isAdLoaded.set(false);
      // Bypass the async initialization guard so loadInterstitial() will run
      (service as any).isInitialized = true;

      for (let i = 0; i < 4; i++) {
        navigationHandler(new NavigationEnd(i, '/expenses', '/expenses'));
      }
      await new Promise((r) => setTimeout(r, 0));

      expect(AdMob.prepareInterstitial).toHaveBeenCalled();
    });

    it('should not show ad before frequency threshold is reached', () => {
      const service = createService();
      (service as any).isAdLoaded.set(true);

      for (let i = 0; i < 3; i++) {
        navigationHandler(new NavigationEnd(i, '/expenses', '/expenses'));
      }

      expect(AdMob.showInterstitial).not.toHaveBeenCalled();
    });
  });

  describe('browser mode', () => {
    it('should not subscribe to router events when not running as app', () => {
      mockRouter.events.subscribe.mockClear();
      createService(false);
      expect(mockRouter.events.subscribe).not.toHaveBeenCalled();
    });
  });
});
