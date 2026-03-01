import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { PwaDetectionService } from './pwa-detection.service';

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

describe('PwaDetectionService', () => {
  beforeEach(() => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    mockMatchMedia(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createService(): PwaDetectionService {
    TestBed.configureTestingModule({ providers: [PwaDetectionService] });
    return TestBed.inject(PwaDetectionService);
  }

  describe('browser mode', () => {
    it('should detect browser mode when not native and not standalone', () => {
      const service = createService();
      expect(service.getDisplayMode()()).toBe('browser');
    });

    it('isRunningInBrowser() should return true', () => {
      const service = createService();
      expect(service.isRunningInBrowser()).toBe(true);
    });

    it('isRunningAsApp() should return false', () => {
      const service = createService();
      expect(service.isRunningAsApp()).toBe(false);
    });
  });

  describe('standalone (PWA) mode', () => {
    beforeEach(() => {
      mockMatchMedia(true);
    });

    it('should detect standalone mode when matchMedia matches', () => {
      const service = createService();
      expect(service.getDisplayMode()()).toBe('standalone');
    });

    it('isRunningInBrowser() should return false', () => {
      const service = createService();
      expect(service.isRunningInBrowser()).toBe(false);
    });

    it('isRunningAsApp() should return true', () => {
      const service = createService();
      expect(service.isRunningAsApp()).toBe(true);
    });
  });

  describe('native (twa) mode', () => {
    beforeEach(() => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    });

    it('should detect twa mode when running on native platform', () => {
      const service = createService();
      expect(service.getDisplayMode()()).toBe('twa');
    });

    it('isRunningInBrowser() should return false', () => {
      const service = createService();
      expect(service.isRunningInBrowser()).toBe(false);
    });

    it('isRunningAsApp() should return true', () => {
      const service = createService();
      expect(service.isRunningAsApp()).toBe(true);
    });

    it('native check takes priority over standalone check', () => {
      mockMatchMedia(true);
      const service = createService();
      expect(service.getDisplayMode()()).toBe('twa');
    });
  });
});
