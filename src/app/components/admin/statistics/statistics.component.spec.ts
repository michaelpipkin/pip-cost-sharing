import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getFunctions } from 'firebase/functions';
import { AdminStatisticsComponent } from './statistics.component';
import { AdminStatisticsService } from '@services/admin-statistics.service';
import { LoadingService } from '@shared/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockLoadingService,
  createMockAnalyticsService,
  createMockSnackBar,
} from '@testing/test-helpers';

describe('AdminStatisticsComponent', () => {
  let fixture: ComponentFixture<AdminStatisticsComponent>;
  let component: AdminStatisticsComponent;
  let mockStatisticsService: { getStatistics: ReturnType<typeof vi.fn> };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;

  const mockStats = {
    userCount: 42,
    groupCount: 10,
    expenseCount: 250,
  };

  beforeEach(async () => {
    mockSnackBar = createMockSnackBar();
    mockLoadingService = createMockLoadingService();
    mockStatisticsService = {
      getStatistics: vi.fn().mockResolvedValue(mockStats),
    };

    await TestBed.configureTestingModule({
      imports: [AdminStatisticsComponent],
      providers: [
        provideNoopAnimations(),
        { provide: getFunctions, useValue: {} },
        { provide: AdminStatisticsService, useValue: mockStatisticsService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminStatisticsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('loadStatistics', () => {
    it('should call statisticsService.getStatistics', async () => {
      await component.loadStatistics();
      expect(mockStatisticsService.getStatistics).toHaveBeenCalled();
    });

    it('should store statistics in signal on success', async () => {
      await component.loadStatistics();
      expect(component.statistics()).toEqual(mockStats);
    });

    it('should clear error signal before loading', async () => {
      component.error.set('previous error');
      await component.loadStatistics();
      expect(component.error()).toBeNull();
    });

    it('should set error signal on failure', async () => {
      mockStatisticsService.getStatistics.mockRejectedValue(
        new Error('Network failure')
      );
      await component.loadStatistics();
      expect(component.error()).toBe('Network failure');
    });

    it('should show snackbar on failure', async () => {
      mockStatisticsService.getStatistics.mockRejectedValue(
        new Error('Network failure')
      );
      await component.loadStatistics();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('should call loadingOn and loadingOff', async () => {
      await component.loadStatistics();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });

  describe('refreshStatistics', () => {
    it('should call loadStatistics again', async () => {
      mockStatisticsService.getStatistics.mockClear();
      await component.refreshStatistics();
      expect(mockStatisticsService.getStatistics).toHaveBeenCalled();
    });
  });
});
