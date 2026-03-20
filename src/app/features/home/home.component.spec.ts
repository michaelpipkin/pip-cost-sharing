import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { HomeComponent } from './home.component';
import { UserStore } from '@store/user.store';
import { PwaDetectionService } from '@services/pwa-detection.service';
import { TourService } from '@services/tour.service';
import {
  createMockUserStore,
  createMockPwaDetectionService,
  createMockTourService,
} from '@testing/test-helpers';

describe('HomeComponent', () => {
  let fixture: ComponentFixture<HomeComponent>;
  let component: HomeComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockPwaDetection: ReturnType<typeof createMockPwaDetectionService>;
  let mockTourService: ReturnType<typeof createMockTourService>;
  let router: Router;

  beforeEach(async () => {
    mockUserStore = createMockUserStore();
    mockPwaDetection = createMockPwaDetectionService();
    mockTourService = createMockTourService();

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: UserStore, useValue: mockUserStore },
        { provide: PwaDetectionService, useValue: mockPwaDetection },
        { provide: TourService, useValue: mockTourService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
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

  describe('startDemoWalkthrough', () => {
    it('should call tourService.resetAllTours', () => {
      component.startDemoWalkthrough();
      expect(mockTourService.resetAllTours).toHaveBeenCalled();
    });

    it('should navigate to demo/split', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.startDemoWalkthrough();
      expect(navigateSpy).toHaveBeenCalledWith(['demo', 'split']);
    });
  });

  describe('isLoggedIn', () => {
    it('should reflect the userStore isLoggedIn signal', () => {
      expect(component.isLoggedIn()).toBe(false);
    });
  });
});
