import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { TourService } from './tour.service';
import { DemoService } from './demo.service';

describe('TourService', () => {
  const TOUR_PREFIX = 'pipsplit_tour_completed_';

  const mockDemoService = {
    isInDemoMode: vi.fn(() => false),
    navigateToDemoRoute: vi.fn(),
    navigateToDemo: vi.fn(),
    isInDemoMode$: signal(false),
  };

  const mockRouter = {
    url: '/',
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
    parseUrl: vi.fn().mockReturnValue({ queryParams: {} }),
  };

  let service: TourService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRouter.parseUrl.mockReturnValue({ queryParams: {} });

    TestBed.configureTestingModule({
      providers: [
        TourService,
        { provide: DemoService, useValue: mockDemoService },
        { provide: Router, useValue: mockRouter },
      ],
    });
    service = TestBed.inject(TourService);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('isTourCompleted', () => {
    it('should return false when tour has not been completed', () => {
      expect(service.isTourCompleted('groups')).toBe(false);
    });

    it('should return true after marking a tour as completed', () => {
      localStorage.setItem(`${TOUR_PREFIX}groups`, 'true');
      expect(service.isTourCompleted('groups')).toBe(true);
    });

    it('should return false for a different tour that is not completed', () => {
      localStorage.setItem(`${TOUR_PREFIX}groups`, 'true');
      expect(service.isTourCompleted('expenses')).toBe(false);
    });

    it('should use the correct localStorage key format', () => {
      service.markTourCompleted('members');
      expect(localStorage.getItem(`${TOUR_PREFIX}members`)).toBe('true');
    });
  });

  describe('markTourCompleted', () => {
    it('should write true to localStorage for the given tour', () => {
      service.markTourCompleted('summary');
      expect(localStorage.getItem(`${TOUR_PREFIX}summary`)).toBe('true');
    });

    it('should make isTourCompleted return true for the marked tour', () => {
      service.markTourCompleted('history');
      expect(service.isTourCompleted('history')).toBe(true);
    });

    it('should only mark the specified tour', () => {
      service.markTourCompleted('groups');
      expect(service.isTourCompleted('members')).toBe(false);
    });
  });

  describe('resetAllTours', () => {
    it('should remove all tour completion entries from localStorage', () => {
      service.markTourCompleted('groups');
      service.markTourCompleted('expenses');
      service.markTourCompleted('summary');

      service.resetAllTours();

      expect(service.isTourCompleted('groups')).toBe(false);
      expect(service.isTourCompleted('expenses')).toBe(false);
      expect(service.isTourCompleted('summary')).toBe(false);
    });

    it('should not remove unrelated localStorage entries', () => {
      localStorage.setItem('unrelated-key', 'value');
      service.markTourCompleted('groups');

      service.resetAllTours();

      expect(localStorage.getItem('unrelated-key')).toBe('value');
    });

    it('should handle empty localStorage gracefully', () => {
      expect(() => service.resetAllTours()).not.toThrow();
    });
  });

  describe('stopCurrentTour', () => {
    it('should not throw when no tour is active', () => {
      expect(() => service.stopCurrentTour()).not.toThrow();
    });

    it('should set isTourActive to false when a tour is stopped', () => {
      const mockTour = { complete: vi.fn() };
      (service as any).currentTour = mockTour;
      (service as any).isTourActive.set(true);

      service.stopCurrentTour();

      expect(service.isTourActive()).toBe(false);
      expect(mockTour.complete).toHaveBeenCalled();
    });

    it('should clear the current tour reference', () => {
      const mockTour = { complete: vi.fn() };
      (service as any).currentTour = mockTour;

      service.stopCurrentTour();

      expect((service as any).currentTour).toBeNull();
    });
  });

  describe('isTourActive signal', () => {
    it('should default to false', () => {
      expect(service.isTourActive()).toBe(false);
    });
  });

  describe('checkForContinueTour', () => {
    it('should not navigate when continueTour param is absent', () => {
      service.checkForContinueTour('groups');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should clear the continueTour query param when present', () => {
      mockRouter.parseUrl.mockReturnValue({
        queryParams: { continueTour: 'true' },
      });
      service.checkForContinueTour('groups');
      expect(mockRouter.navigate).toHaveBeenCalledWith(
        [],
        expect.objectContaining({ queryParams: { continueTour: null } })
      );
    });
  });
});
