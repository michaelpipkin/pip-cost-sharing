import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogClose } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { AnalyticsService } from '@services/analytics.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PLAY_STORE_URL,
  UpdatePromptDialogComponent,
  WEB_APP_URL,
} from './update-prompt-dialog.component';

describe('UpdatePromptDialogComponent', () => {
  let fixture: ComponentFixture<UpdatePromptDialogComponent>;
  const mockAnalytics = { logEvent: vi.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [UpdatePromptDialogComponent],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: MAT_DIALOG_DATA, useValue: { nativeBuild: 23 } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(UpdatePromptDialogComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const byTestId = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);

  it('renders the title without leading whitespace', () => {
    // Untrimmed: a leading space shows as an indent after Material's
    // inline-block title ::before.
    expect(byTestId('update-prompt-title')?.textContent).toBe(
      'Update Required'
    );
  });

  it('offers no way to dismiss it', () => {
    expect(
      fixture.debugElement.queryAll(By.directive(MatDialogClose))
    ).toHaveLength(0);
    expect(
      byTestId('update-prompt-actions')?.querySelectorAll('button')
    ).toHaveLength(1);
  });

  it('tells people who cannot update about the web version, with a link', () => {
    const note = byTestId('update-prompt-web-note')?.textContent ?? '';
    expect(note).toContain('older than Android 7');
    expect(note).toContain("can't");
    expect(
      byTestId('update-prompt-web-link')?.getAttribute('href')
    ).toContain('pipsplit.com');
  });

  describe('with the Browser plugin', () => {
    let openSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(true);
      openSpy = vi.spyOn(Browser, 'open').mockResolvedValue();
    });

    it('opens the Play Store listing from Update', async () => {
      byTestId('update-prompt-update-button')?.click();
      await fixture.whenStable();

      expect(openSpy).toHaveBeenCalledWith({ url: PLAY_STORE_URL });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'update_prompt_accepted',
        { native_build: 23 }
      );
    });

    it('opens the web version from the link instead of navigating the app', async () => {
      const click = new MouseEvent('click', { cancelable: true });
      byTestId('update-prompt-web-link')?.dispatchEvent(click);
      await fixture.whenStable();

      expect(click.defaultPrevented).toBe(true);
      expect(openSpy).toHaveBeenCalledWith({ url: WEB_APP_URL });
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'update_prompt_web_chosen',
        { native_build: 23 }
      );
    });
  });

  it('falls back to window.open without the Browser plugin', async () => {
    vi.spyOn(Capacitor, 'isPluginAvailable').mockReturnValue(false);
    const windowOpen = vi.spyOn(globalThis, 'open').mockReturnValue(null);

    byTestId('update-prompt-update-button')?.click();
    await fixture.whenStable();

    expect(windowOpen).toHaveBeenCalledWith(PLAY_STORE_URL, '_blank');
  });
});
