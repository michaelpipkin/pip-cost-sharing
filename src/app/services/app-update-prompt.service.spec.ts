import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { UpdatePromptDialogComponent } from '@components/update-prompt-dialog/update-prompt-dialog.component';
import { AnalyticsService } from '@services/analytics.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppUpdatePromptService,
  MIN_NATIVE_BUILD,
} from './app-update-prompt.service';

describe('AppUpdatePromptService', () => {
  let service: AppUpdatePromptService;
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

  it('requires build 26 (1.3.1)', () => {
    expect(MIN_NATIVE_BUILD).toBe(26);
  });

  it('blocks an Android build older than the minimum with a dialog that cannot be dismissed', async () => {
    setNative('android');
    setBuild(String(MIN_NATIVE_BUILD - 1));

    await service.checkOnStartup();

    expect(mockDialog.open).toHaveBeenCalledWith(UpdatePromptDialogComponent, {
      disableClose: true,
      closeOnNavigation: false,
      data: { nativeBuild: MIN_NATIVE_BUILD - 1 },
    });
    expect(mockAnalytics.logEvent).toHaveBeenCalledWith('update_prompt_shown', {
      native_build: MIN_NATIVE_BUILD - 1,
    });
  });

  it('does not block a build at or above the minimum', async () => {
    setNative('android');
    setBuild(String(MIN_NATIVE_BUILD));

    await service.checkOnStartup();

    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('does not block on web or iOS', async () => {
    setNative('web');
    setBuild('1');
    await service.checkOnStartup();

    setNative('ios');
    await service.checkOnStartup();

    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('fails open on a build without the App plugin', async () => {
    setNative('android', false);
    const getInfoSpy = vi.spyOn(App, 'getInfo');

    await service.checkOnStartup();

    expect(getInfoSpy).not.toHaveBeenCalled();
    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('fails open when the version lookup fails or is not a number', async () => {
    setNative('android');
    vi.spyOn(App, 'getInfo').mockRejectedValueOnce(new Error('unavailable'));
    await service.checkOnStartup();

    setBuild('not-a-number');
    await service.checkOnStartup();

    expect(mockDialog.open).not.toHaveBeenCalled();
  });

  it('opens the dialog at most once per session', async () => {
    setNative('android');
    setBuild('20');

    await service.checkOnStartup();
    await service.checkOnStartup();

    expect(mockDialog.open).toHaveBeenCalledTimes(1);
  });
});
