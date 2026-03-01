import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AdSenseService } from './adsense.service';
import { PwaDetectionService } from './pwa-detection.service';

describe('AdSenseService', () => {
  let appendChildSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementation(() => null as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createService(inBrowser: boolean): AdSenseService {
    TestBed.configureTestingModule({
      providers: [
        AdSenseService,
        {
          provide: PwaDetectionService,
          useValue: { isRunningInBrowser: () => inBrowser },
        },
      ],
    });
    return TestBed.inject(AdSenseService);
  }

  it('should inject the AdSense script when running in browser', () => {
    createService(true);
    // Find the AdSense-specific call among all appendChild calls
    const adsenseCalls = appendChildSpy.mock.calls.filter(
      (call: any[]) => (call[0] as HTMLScriptElement).src?.includes?.('pagead2.googlesyndication.com'),
    );
    expect(adsenseCalls).toHaveLength(1);
    const script = adsenseCalls[0][0] as HTMLScriptElement;
    expect(script.src).toContain('pagead2.googlesyndication.com');
    expect(script.async).toBe(true);
  });

  it('should not inject the AdSense script when running as native app', () => {
    createService(false);
    const adsenseCalls = appendChildSpy.mock.calls.filter(
      (call: any[]) => (call[0] as HTMLScriptElement).src?.includes?.('pagead2.googlesyndication.com'),
    );
    expect(adsenseCalls).toHaveLength(0);
  });
});
