import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { HomeComponent } from './home.component';
import { FeatureTourDialogComponent } from './feature-tour-dialog/feature-tour-dialog.component';
import { UserStore } from '@store/user.store';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockUserStore,
  createMockPwaDetectionService,
  createMockAnalyticsService,
  mockUser,
} from '@testing/test-helpers';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let component: HomeComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockPwaDetection: ReturnType<typeof createMockPwaDetectionService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;

  beforeEach(async () => {
    mockUserStore = createMockUserStore();
    mockPwaDetection = createMockPwaDetectionService();
    mockAnalytics = createMockAnalyticsService();

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: UserStore, useValue: mockUserStore },
        { provide: PwaDetectionService, useValue: mockPwaDetection },
        { provide: AnalyticsService, useValue: mockAnalytics },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('platform detection', () => {
    it('should delegate isRunningInBrowser to pwaDetection service', () => {
      mockPwaDetection.isRunningInBrowser.mockReturnValue(true);
      expect(component.isRunningInBrowser()).toBe(true);
      expect(mockPwaDetection.isRunningInBrowser).toHaveBeenCalled();
    });

    it('should delegate isRunningAsApp to pwaDetection service', () => {
      mockPwaDetection.isRunningAsApp.mockReturnValue(true);
      expect(component.isRunningAsApp()).toBe(true);
      expect(mockPwaDetection.isRunningAsApp).toHaveBeenCalled();
    });
  });

  describe('feature tour', () => {
    const tourButton = () =>
      fixture.debugElement.query(By.css('[data-testid="feature-tour-button"]'));

    it('should show the feature tour button when logged out', () => {
      expect(tourButton()).toBeTruthy();
    });

    it('should show the feature tour button when logged in', async () => {
      mockUserStore.user.set(mockUser());
      fixture.detectChanges();
      await fixture.whenStable();
      expect(tourButton()).toBeTruthy();
    });

    it('should open the feature tour dialog and log analytics', () => {
      const openSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({} as any);

      component.openFeatureTour();

      expect(openSpy).toHaveBeenCalledWith(
        FeatureTourDialogComponent,
        expect.objectContaining({ maxWidth: '95vw' })
      );
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
        'feature_tour_opened',
        { logged_in: false }
      );
    });
  });

  describe('isLoggedIn', () => {
    it('should reflect the userStore isLoggedIn signal', () => {
      expect(component.isLoggedIn()).toBe(false);
    });
  });
});
