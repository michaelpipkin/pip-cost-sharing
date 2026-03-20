import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AdminStatistics } from '@models/admin-statistics';
import { AdminStatisticsService } from '@services/admin-statistics.service';
import { AnalyticsService } from '@services/analytics.service';
import { StatisticsStore } from '@store/statistics.store';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
} from '@testing/test-helpers';
import { getFunctions } from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminStatisticsComponent } from './statistics.component';

describe('AdminStatisticsComponent', () => {
  let fixture: ComponentFixture<AdminStatisticsComponent>;
  let component: AdminStatisticsComponent;
  let mockStatisticsService: { getStatistics: ReturnType<typeof vi.fn> };
  let mockStatisticsStore: {
    loaded: ReturnType<typeof vi.fn>;
    statistics: ReturnType<typeof vi.fn>;
    setStatistics: ReturnType<typeof vi.fn>;
    clearStatistics: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;

  const mockStats: AdminStatistics = {
    totalGroups: 10,
    activeGroups: 8,
    activeGroupsWithMultipleMembers: 5,
    activeGroupsWithExpenses: 4,
    totalUsers: 42,
    totalMembers: 100,
    totalActiveMembers: 80,
    avgMembersPerActiveGroup: 10,
    groupsWithRecentActivity: 3,
    expensesCreatedLast30Days: 50,
    generatedAt: new Date().toISOString(),
  } as unknown as AdminStatistics;

  beforeEach(async () => {
    mockSnackBar = createMockSnackBar();
    mockLoadingService = createMockLoadingService();
    mockStatisticsService = {
      getStatistics: vi.fn().mockResolvedValue(mockStats),
    };
    mockStatisticsStore = {
      loaded: vi.fn().mockReturnValue(false),
      statistics: vi.fn().mockReturnValue(null),
      setStatistics: vi.fn(),
      clearStatistics: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminStatisticsComponent],
      providers: [
        { provide: getFunctions, useValue: {} },
        { provide: AdminStatisticsService, useValue: mockStatisticsService },
        { provide: StatisticsStore, useValue: mockStatisticsStore },
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
    it('should call statisticsService.getStatistics when not loaded', async () => {
      mockStatisticsStore.loaded.mockReturnValue(false);
      mockStatisticsService.getStatistics.mockClear();
      await component.loadStatistics();
      expect(mockStatisticsService.getStatistics).toHaveBeenCalled();
    });

    it('should skip fetch when store is already loaded', async () => {
      mockStatisticsStore.loaded.mockReturnValue(true);
      mockStatisticsService.getStatistics.mockClear();
      await component.loadStatistics();
      expect(mockStatisticsService.getStatistics).not.toHaveBeenCalled();
    });

    it('should call setStatistics on the store on success', async () => {
      mockStatisticsStore.loaded.mockReturnValue(false);
      await component.loadStatistics();
      expect(mockStatisticsStore.setStatistics).toHaveBeenCalledWith(mockStats);
    });

    it('should clear error signal before loading', async () => {
      mockStatisticsStore.loaded.mockReturnValue(false);
      component.error.set('previous error');
      await component.loadStatistics();
      expect(component.error()).toBeNull();
    });

    it('should set error signal on failure', async () => {
      mockStatisticsStore.loaded.mockReturnValue(false);
      mockStatisticsService.getStatistics.mockRejectedValue(
        new Error('Network failure')
      );
      await component.loadStatistics();
      expect(component.error()).toBe('Network failure');
    });

    it('should show snackbar on failure', async () => {
      mockStatisticsStore.loaded.mockReturnValue(false);
      mockStatisticsService.getStatistics.mockRejectedValue(
        new Error('Network failure')
      );
      await component.loadStatistics();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });

    it('should call loadingOn and loadingOff', async () => {
      mockStatisticsStore.loaded.mockReturnValue(false);
      mockLoadingService.loadingOn.mockClear();
      mockLoadingService.loadingOff.mockClear();
      await component.loadStatistics();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });

  describe('refreshStatistics', () => {
    it('should clear the store and call getStatistics', async () => {
      mockStatisticsStore.loaded.mockReturnValue(false);
      mockStatisticsService.getStatistics.mockClear();
      await component.refreshStatistics();
      expect(mockStatisticsStore.clearStatistics).toHaveBeenCalled();
      expect(mockStatisticsService.getStatistics).toHaveBeenCalled();
    });
  });
});
