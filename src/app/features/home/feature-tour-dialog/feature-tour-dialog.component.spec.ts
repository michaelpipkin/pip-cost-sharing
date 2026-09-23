import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { FeatureTourDialogComponent } from './feature-tour-dialog.component';
import { FEATURE_TOUR_SLIDES } from './feature-tour-slides';
import { UserStore } from '@store/user.store';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockUserStore,
  createMockAnalyticsService,
  mockUser,
} from '@testing/test-helpers';

describe('FeatureTourDialogComponent', () => {
  let fixture: ComponentFixture<FeatureTourDialogComponent>;
  let component: FeatureTourDialogComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockDialogRef: { close: ReturnType<typeof vi.fn> };
  let router: Router;

  const lastIndex = FEATURE_TOUR_SLIDES.length - 1;
  const byTestId = (id: string) =>
    fixture.debugElement.query(By.css(`[data-testid="${id}"]`));

  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUserStore = createMockUserStore();
    mockAnalytics = createMockAnalyticsService();
    mockDialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [FeatureTourDialogComponent],
      providers: [
        provideRouter([]),
        { provide: UserStore, useValue: mockUserStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: MatDialogRef, useValue: mockDialogRef },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(FeatureTourDialogComponent);
    component = fixture.componentInstance;
    await render();
  });

  it('should create on the first slide', () => {
    expect(component).toBeTruthy();
    expect(component.currentIndex()).toBe(0);
    expect(byTestId('feature-tour-title').nativeElement.textContent).toContain(
      FEATURE_TOUR_SLIDES[0]!.title
    );
  });

  describe('navigation', () => {
    it('should advance and go back', () => {
      component.next();
      expect(component.currentIndex()).toBe(1);
      component.prev();
      expect(component.currentIndex()).toBe(0);
    });

    it('should not go before the first slide', () => {
      component.prev();
      expect(component.currentIndex()).toBe(0);
    });

    it('should not go past the last slide', () => {
      component.goTo(lastIndex);
      component.next();
      expect(component.currentIndex()).toBe(lastIndex);
    });

    it('should ignore out-of-range goTo indexes', () => {
      component.goTo(-1);
      component.goTo(FEATURE_TOUR_SLIDES.length);
      expect(component.currentIndex()).toBe(0);
    });

    it('should jump to a slide when its dot is clicked', async () => {
      byTestId('feature-tour-dot-3').nativeElement.click();
      await render();
      expect(component.currentIndex()).toBe(3);
      expect(
        byTestId('feature-tour-dot-3').nativeElement.getAttribute(
          'aria-current'
        )
      ).toBe('step');
    });

    it('should hide Back on the first slide and show it afterwards', async () => {
      expect(byTestId('feature-tour-back-button')).toBeNull();
      component.next();
      await render();
      expect(byTestId('feature-tour-back-button')).toBeTruthy();
    });

    it('should navigate with the arrow keys', () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight' })
      );
      expect(component.currentIndex()).toBe(1);
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft' })
      );
      expect(component.currentIndex()).toBe(0);
    });
  });

  describe('swipe', () => {
    const swipe = (fromX: number, toX: number) => {
      component.onPointerDown({ clientX: fromX } as PointerEvent);
      component.onPointerUp({ clientX: toX } as PointerEvent);
    };

    it('should advance on a left swipe', () => {
      swipe(300, 200);
      expect(component.currentIndex()).toBe(1);
    });

    it('should go back on a right swipe', () => {
      component.goTo(2);
      swipe(100, 200);
      expect(component.currentIndex()).toBe(1);
    });

    it('should ignore small movements', () => {
      swipe(100, 120);
      expect(component.currentIndex()).toBe(0);
    });
  });

  describe('analytics', () => {
    it('should log each slide viewed', async () => {
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'feature_tour_slide_viewed',
        { index: 0, slide_id: FEATURE_TOUR_SLIDES[0]!.id }
      );
      component.next();
      await render();
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'feature_tour_slide_viewed',
        { index: 1, slide_id: FEATURE_TOUR_SLIDES[1]!.id }
      );
    });
  });

  describe('last slide actions', () => {
    it('should offer split and register when logged out', async () => {
      component.goTo(lastIndex);
      await render();
      expect(byTestId('feature-tour-next-button')).toBeNull();
      expect(byTestId('feature-tour-split-button')).toBeTruthy();
      expect(byTestId('feature-tour-register-button')).toBeTruthy();
      expect(byTestId('feature-tour-done-button')).toBeNull();
    });

    it('should offer only Done when logged in', async () => {
      mockUserStore.user.set(mockUser());
      component.goTo(lastIndex);
      await render();
      expect(byTestId('feature-tour-done-button')).toBeTruthy();
      expect(byTestId('feature-tour-split-button')).toBeNull();
      expect(byTestId('feature-tour-register-button')).toBeNull();
    });

    it('should close and navigate to split', () => {
      component.finish('split');
      expect(mockDialogRef.close).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/split');
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith('feature_tour_cta', {
        target: 'split',
      });
    });

    it('should close and navigate to register', () => {
      component.finish('register');
      expect(mockDialogRef.close).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/register');
    });

    it('should close without navigating on done', () => {
      component.finish('done');
      expect(mockDialogRef.close).toHaveBeenCalled();
      expect(router.navigateByUrl).not.toHaveBeenCalled();
    });
  });
});
