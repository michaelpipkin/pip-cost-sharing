import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { UpdatePromptDialogComponent } from '@components/update-prompt-dialog/update-prompt-dialog.component';
import { AnalyticsService } from '@services/analytics.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppUpdatePromptService,
  MIN_NATIVE_BUILD,
  PLAY_STORE_URL,
} from './app-update-prompt.service';

describe('AppUpdatePromptService', () => {
  let service: AppUpdatePromptService;
  let afterClosedCallback: (result: unknown) => void;
  const mockDialog = { open: vi.fn() };
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  function setNative(platform: 'android' | 'web' | 'ios', pluginAvailable = true) {
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue(platform);
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(platform !== 'web');
    vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(pluginAvailable);
  }

  function setBuild(build: string) {
    vi.spyOn(App, 'getInfo').mockResolvedValue({
      id: 'com.pipsplit.app',
      name: 'PipSplit',
      build,
      version: '1.0.0',
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockDialog.open.mockReturnValue({
      afterClosed: () => ({
        subscribe: (cb: (result: unknown) => void) => {
          afterClosedCallback = cb;
        },
      }),
    });
    TestBed.configureTestingModule({
      providers: [
        AppUpdatePromptService,
        { provide: MatDialog, useValue: mockDialog },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    });
    service = TestBed.inject(AppUpdatePromptService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkOnStartup', () => {
    it('prompts an Android build older than the minimum', async () => {
      setNative('android');
      setBuild(String(MIN_NATIVE_BUILD - 1));

      await service.checkOnStartup();

      expect(mockDialog.open).toHaveBeenCalledWith(
        UpdatePromptDialogComponent,
        expect.anything()
      );
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'update_prompt_shown',
        { native_build: MIN_NATIVE_BUILD - 1 }
      );
    });

    it('does not prompt a build at or above the minimum', async () => {
      setNative('android');
      setBuild(String(MIN_NATIVE_BUILD));

      await service.checkOnStartup();

      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('does not prompt on web or iOS', async () => {
      setNative('web');
      setBuild('1');
      await service.checkOnStartup();

      setNative('ios');
      await service.checkOnStartup();

      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('does nothing on a build without the App plugin', async () => {
      setNative('android', false);
      const getInfoSpy = vi.spyOn(App, 'getInfo');

      await service.checkOnStartup();

      expect(getInfoSpy).not.toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('does nothing when the version lookup fails or is not a number', async () => {
      setNative('android');
      vi.spyOn(App, 'getInfo').mockRejectedValueOnce(new Error('unavailable'));
      await service.checkOnStartup();

      setBuild('not-a-number');
      await service.checkOnStartup();

      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('prompts at most once per session', async () => {
      setNative('android');
      setBuild('20');

      await service.checkOnStartup();
      await service.checkOnStartup();

      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });
  });

  describe('the prompt dialog', () => {
    it('opens the Play Store listing only when the user taps Update', async () => {
      const openSpy = vi.spyOn(service, 'openStoreListing').mockResolvedValue();
      setNative('android');
      setBuild('20');
      await service.checkOnStartup();

      afterClosedCallback(false);
      expect(openSpy).not.toHaveBeenCalled();
      expect(mockAnalytics.logEvent).not.toHaveBeenCalledWith(
        'update_prompt_accepted',
        expect.anything()
      );

      afterClosedCallback(true);
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'update_prompt_accepted',
        { native_build: 20 }
      );
    });
  });

  describe('openStoreListing', () => {
    it('uses the in-app browser on native when the plugin is available', async () => {
      setNative('android');
      const openSpy = vi.spyOn(Browser, 'open').mockResolvedValue();

      await service.openStoreListing();

      expect(openSpy).toHaveBeenCalledWith({ url: PLAY_STORE_URL });
    });

    it('falls back to window.open on web', async () => {
      setNative('web', false);
      const windowOpen = vi.spyOn(globalThis, 'open').mockReturnValue(null);

      await service.openStoreListing();

      expect(windowOpen).toHaveBeenCalledWith(PLAY_STORE_URL, '_blank');
    });
  });
});
