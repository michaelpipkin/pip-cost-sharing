import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LoadingService } from '@components/loading/loading.service';
import { AdminReportResult } from '@models/admin-report';
import { AdminReportsService } from '@services/admin-reports.service';
import { AnalyticsService } from '@services/analytics.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import { ReportsStore } from '@store/reports.store';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
} from '@testing/test-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminReportsComponent } from './reports.component';

function mockOverviewResult(): AdminReportResult {
  return {
    reportId: 'overview',
    title: 'Overview',
    generatedAt: new Date().toISOString(),
    summary: [{ title: 'Groups', stats: [{ label: 'Total Groups', value: 10 }] }],
    tables: [],
  };
}

function mockOrphanedMembersResult(rowCount: number): AdminReportResult {
  return {
    reportId: 'orphaned-members',
    title: 'Orphaned Members',
    generatedAt: new Date().toISOString(),
    summary: [],
    tables: [
      {
        title: 'Linkable',
        columns: [{ key: 'displayName', label: 'Member' }],
        rows: Array.from({ length: rowCount }, (_, i) => ({
          displayName: `Member ${i}`,
          path: `groups/g1/members/m${i}`,
        })),
      },
      {
        title: 'Needs review',
        columns: [{ key: 'displayName', label: 'Member' }],
        rows: [],
      },
    ],
  };
}

describe('AdminReportsComponent', () => {
  let fixture: ComponentFixture<AdminReportsComponent>;
  let component: AdminReportsComponent;
  let mockReportsService: {
    runReport: ReturnType<typeof vi.fn>;
    repairOrphanedMembers: ReturnType<typeof vi.fn>;
    backfillOrphanedRegistrations: ReturnType<typeof vi.fn>;
  };
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockAppCheckErrorHandler: { handle: ReturnType<typeof vi.fn> };

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
  };

  async function createComponent(): Promise<void> {
    mockLoadingService = createMockLoadingService();
    mockAnalyticsService = createMockAnalyticsService();
    mockSnackBar = createMockSnackBar();
    mockAppCheckErrorHandler = { handle: vi.fn() };
    mockReportsService = {
      runReport: vi.fn().mockResolvedValue(mockOverviewResult()),
      repairOrphanedMembers: vi.fn().mockResolvedValue({ linkedCount: 0 }),
      backfillOrphanedRegistrations: vi.fn().mockResolvedValue({ createdCount: 0 }),
    };

    await TestBed.configureTestingModule({
      imports: [AdminReportsComponent],
      providers: [
        ReportsStore,
        { provide: AdminReportsService, useValue: mockReportsService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: AppCheckErrorHandlerService, useValue: mockAppCheckErrorHandler },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminReportsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  describe('loadReport()', () => {
    it('should call loadingOn and loadingOff', async () => {
      await createComponent();
      await component.loadReport();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('should store the result for the currently selected report', async () => {
      await createComponent();
      const result = mockOverviewResult();
      mockReportsService.runReport.mockResolvedValue(result);
      await component.loadReport();
      expect(component.result()).toEqual(result);
    });

    it('should skip fetching when a result is already cached', async () => {
      await createComponent();
      await component.loadReport();
      mockReportsService.runReport.mockClear();
      await component.loadReport();
      expect(mockReportsService.runReport).not.toHaveBeenCalled();
    });

    it('should set error and call the App Check handler on failure', async () => {
      await createComponent();
      mockReportsService.runReport.mockRejectedValue(new Error('Network failure'));
      await component.loadReport();
      expect(component.error()).toBe('Network failure');
      expect(mockAppCheckErrorHandler.handle).toHaveBeenCalled();
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Admin Reports Component',
        'run_report',
        'Failed to run report',
        expect.any(String)
      );
    });
  });

  describe('refreshReport()', () => {
    it('should clear the cached result and fetch again', async () => {
      await createComponent();
      await component.loadReport();
      mockReportsService.runReport.mockClear();
      await component.refreshReport();
      expect(mockReportsService.runReport).toHaveBeenCalled();
    });
  });

  describe('selecting a different report', () => {
    it('should clear the error signal', async () => {
      await createComponent();
      component.error.set('previous error');
      component.selectedReport.set('users');
      TestBed.flushEffects();
      expect(component.error()).toBeNull();
    });

    it('should reflect that report\'s own cached result, independent of others', async () => {
      await createComponent();
      await component.loadReport();
      expect(component.hasResult()).toBe(true);
      component.selectedReport.set('users');
      expect(component.hasResult()).toBe(false);
    });
  });

  describe('repair button visibility', () => {
    it('should be hidden for reports with no repair action', async () => {
      await createComponent();
      component.selectedReport.set('overview');
      expect(component.showRepairButton()).toBe(false);
    });

    it('should be shown only once the orphaned-members report has linkable rows', async () => {
      await createComponent();
      component.selectedReport.set('orphaned-members');
      expect(component.repairableCount()).toBe(0);

      mockReportsService.runReport.mockResolvedValue(mockOrphanedMembersResult(2));
      await component.loadReport();
      expect(component.showRepairButton()).toBe(true);
      expect(component.repairableCount()).toBe(2);
      expect(component.repairButtonLabel()).toBe('Link 2 Members');
    });
  });

  describe('repair()', () => {
    it('should link members and refresh the report when the dialog is confirmed', async () => {
      await createComponent();
      component.selectedReport.set('orphaned-members');
      mockReportsService.runReport.mockResolvedValue(mockOrphanedMembersResult(2));
      await component.loadReport();

      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => ({ subscribe: (cb: (result: unknown) => void) => cb(true) }),
      } as any);
      mockReportsService.repairOrphanedMembers.mockResolvedValue({ linkedCount: 2 });
      mockReportsService.runReport.mockResolvedValue(mockOrphanedMembersResult(0));

      component.repair();
      await fixture.whenStable();

      expect(mockReportsService.repairOrphanedMembers).toHaveBeenCalledWith([
        'groups/g1/members/m0',
        'groups/g1/members/m1',
      ]);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
      expect(component.repairableCount()).toBe(0);
    });

    it('should not repair anything when the dialog is cancelled', async () => {
      await createComponent();
      component.selectedReport.set('orphaned-members');
      mockReportsService.runReport.mockResolvedValue(mockOrphanedMembersResult(1));
      await component.loadReport();

      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValue({
        afterClosed: () => ({ subscribe: (cb: (result: unknown) => void) => cb(false) }),
      } as any);

      component.repair();
      await fixture.whenStable();

      expect(mockReportsService.repairOrphanedMembers).not.toHaveBeenCalled();
    });
  });

  describe('columnKeys()', () => {
    it('should return the column keys in order', async () => {
      await createComponent();
      const table = mockOrphanedMembersResult(1).tables[0]!;
      expect(component.columnKeys(table)).toEqual(['displayName']);
    });
  });

  describe('formatCell()', () => {
    it('should render null as an em dash', async () => {
      await createComponent();
      expect(component.formatCell(null)).toBe('—');
    });

    it('should render booleans as Yes/No', async () => {
      await createComponent();
      expect(component.formatCell(true)).toBe('Yes');
      expect(component.formatCell(false)).toBe('No');
    });

    it('should stringify numbers and strings as-is', async () => {
      await createComponent();
      expect(component.formatCell(42)).toBe('42');
      expect(component.formatCell('hello')).toBe('hello');
    });
  });
});
