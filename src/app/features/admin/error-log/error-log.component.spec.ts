import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import { LoadingService } from '@components/loading/loading.service';
import { AppError } from '@models/app-error';
import { AdminErrorLogService } from '@services/admin-error-log.service';
import { AnalyticsService } from '@services/analytics.service';
import { MediaQueryService } from '@services/media-query.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockMediaQueryService,
} from '@testing/test-helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorDetailDialogComponent } from './error-detail-dialog.component';
import { AdminErrorLogComponent } from './error-log.component';

function mockAppError(overrides: Partial<AppError> = {}): AppError {
  const millis = 1_700_000_000_000;
  return {
    id: 'err-1',
    component: 'ExpenseService',
    action: 'saveExpense',
    message: 'Failed to save',
    error: 'permission-denied',
    timestamp: {
      toMillis: () => millis,
      toDate: () => new Date(millis),
    } as any,
    ...overrides,
  };
}

function at(millis: number): AppError['timestamp'] {
  return { toMillis: () => millis, toDate: () => new Date(millis) } as any;
}

function closedWith(value: unknown) {
  return {
    afterClosed: () => ({
      subscribe: (cb: (result: unknown) => void) => cb(value),
    }),
  } as any;
}

describe('AdminErrorLogComponent', () => {
  let fixture: ComponentFixture<AdminErrorLogComponent>;
  let component: AdminErrorLogComponent;
  let mockErrorService: {
    getAppErrors: ReturnType<typeof vi.fn>;
    deleteAppError: ReturnType<typeof vi.fn>;
    deleteAppErrors: ReturnType<typeof vi.fn>;
  };
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockMediaQuery: ReturnType<typeof createMockMediaQueryService>;
  let mockSnackBar: { openFromComponent: ReturnType<typeof vi.fn> };
  let mockDialog: { open: ReturnType<typeof vi.fn> };

  async function createComponent(
    initial: AppError[] = []
  ): Promise<void> {
    mockMediaQuery = createMockMediaQueryService();
    mockLoading = createMockLoadingService();
    mockSnackBar = { openFromComponent: vi.fn() };
    mockDialog = { open: vi.fn() };
    mockErrorService = {
      getAppErrors: vi.fn().mockResolvedValue(initial),
      deleteAppError: vi.fn().mockResolvedValue(undefined),
      deleteAppErrors: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [AdminErrorLogComponent],
      providers: [
        provideNativeDateAdapter(),
        { provide: AdminErrorLogService, useValue: mockErrorService },
        { provide: LoadingService, useValue: mockLoading },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: MediaQueryService, useValue: mockMediaQuery },
        { provide: MatDialog, useValue: mockDialog },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminErrorLogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Three raw errors; the first two collapse into one group. */
  const trio = (): AppError[] => [
    mockAppError({ id: 'a', error: 'first text', timestamp: at(3000) }),
    mockAppError({ id: 'b', error: 'second text', timestamp: at(2000) }),
    mockAppError({
      id: 'c',
      component: 'AuthService',
      action: 'login',
      message: 'Bad login',
      error: undefined,
      timestamp: at(1000),
    }),
  ];

  function displayedIds(): string[] {
    return component.displayedErrors().map((e) => e.id);
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  describe('initial load', () => {
    it('should load errors for the last 7 days ending now', async () => {
      const now = new Date(2024, 5, 15, 12, 0, 0);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      await createComponent();
      expect(mockErrorService.getAppErrors).toHaveBeenCalledTimes(1);
      const [start, end] = mockErrorService.getAppErrors.mock.calls[0]!;
      expect(end).toEqual(now);
      expect(start).toEqual(new Date(2024, 5, 8, 12, 0, 0));
    });

    it('should show the loaded errors', async () => {
      await createComponent([mockAppError()]);
      expect(component.errors().map((e) => e.id)).toEqual(['err-1']);
      expect(
        fixture.nativeElement.querySelectorAll('[data-testid="error-row"]')
          .length
      ).toBe(1);
    });
  });

  describe('loadErrors()', () => {
    it('should skip the load when the start date is null', async () => {
      await createComponent();
      mockErrorService.getAppErrors.mockClear();
      mockLoading.loadingOn.mockClear();
      component.startDate.set(null);
      await component.loadErrors();
      expect(mockErrorService.getAppErrors).not.toHaveBeenCalled();
      expect(mockLoading.loadingOn).not.toHaveBeenCalled();
    });

    it('should skip the load when the end date is null', async () => {
      await createComponent();
      mockErrorService.getAppErrors.mockClear();
      component.endDate.set(null);
      await component.loadErrors();
      expect(mockErrorService.getAppErrors).not.toHaveBeenCalled();
    });

    it('should pass the chosen range to the service and turn loading on then off', async () => {
      await createComponent();
      const start = new Date(2024, 0, 1);
      const end = new Date(2024, 0, 31);
      component.startDate.set(start);
      component.endDate.set(end);
      mockLoading.loadingOn.mockClear();
      mockLoading.loadingOff.mockClear();
      await component.loadErrors();
      expect(mockErrorService.getAppErrors).toHaveBeenLastCalledWith(
        start,
        end
      );
      expect(mockLoading.loadingOn).toHaveBeenCalledTimes(1);
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should clear the selection after a successful load', async () => {
      await createComponent(trio());
      component.toggleAll();
      expect(component.hasSelection()).toBe(true);
      await component.loadErrors();
      expect(component.hasSelection()).toBe(false);
    });

    it('should show a snackbar with the error message when the load fails', async () => {
      await createComponent();
      mockErrorService.getAppErrors.mockRejectedValue(new Error('Network down'));
      mockLoading.loadingOff.mockClear();
      await component.loadErrors();
      expect(component.loadError()).toBe('Network down');
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'Network down' } }
      );
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should fall back to "Failed to load error log" for a non-Error rejection', async () => {
      await createComponent();
      mockErrorService.getAppErrors.mockRejectedValue('nope');
      await component.loadErrors();
      expect(component.loadError()).toBe('Failed to load error log');
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'Failed to load error log' } }
      );
    });

    it('should clear a previous load error before retrying', async () => {
      await createComponent();
      component.loadError.set('old');
      await component.loadErrors();
      expect(component.loadError()).toBeNull();
    });

    it('should render the message with a Retry button when the load fails', async () => {
      await createComponent();
      mockErrorService.getAppErrors.mockRejectedValue(new Error('Network down'));
      await component.loadErrors();
      fixture.detectChanges();
      const box = fixture.nativeElement.querySelector('.error-container');
      expect(box.textContent).toContain('Network down');
      expect(box.textContent).toContain('Retry');
      expect(fixture.nativeElement.querySelector('.no-data')).toBeNull();
    });

    it('should render the empty-range message when nothing was found', async () => {
      await createComponent();
      expect(fixture.nativeElement.querySelector('.no-data').textContent).toContain(
        'No error records found'
      );
    });
  });

  describe('groupedErrors', () => {
    it('should collapse errors with the same component, action and message', async () => {
      await createComponent(trio());
      const groups = component.groupedErrors();
      expect(groups.length).toBe(2);
      const merged = groups.find((g) => g.component === 'ExpenseService')!;
      expect(merged.count).toBe(2);
      expect(merged.ids).toEqual(['a', 'b']);
    });

    it('should not split a group because the error text differs', async () => {
      await createComponent([
        mockAppError({ id: 'a', error: 'one' }),
        mockAppError({ id: 'b', error: 'two' }),
        mockAppError({ id: 'c', error: undefined }),
      ]);
      expect(component.groupedErrors().length).toBe(1);
      expect(component.groupedErrors()[0]!.count).toBe(3);
    });

    it('should split on a different message, action or component', async () => {
      await createComponent([
        mockAppError({ id: 'a' }),
        mockAppError({ id: 'b', message: 'Other message' }),
        mockAppError({ id: 'c', action: 'otherAction' }),
        mockAppError({ id: 'd', component: 'OtherService' }),
      ]);
      expect(component.groupedErrors().length).toBe(4);
    });

    it('should keep the first occurrence as the group representative', async () => {
      await createComponent(trio());
      const merged = component
        .groupedErrors()
        .find((g) => g.component === 'ExpenseService')!;
      expect(merged.id).toBe('a');
      expect(merged.error).toBe('first text');
    });
  });

  describe('sorting', () => {
    it('should default to date/time descending', async () => {
      await createComponent(trio());
      expect(component.sortActive()).toBe('dateTime');
      expect(component.sortDirection()).toBe('desc');
      expect(displayedIds()).toEqual(['a', 'b', 'c']);
    });

    it('should sort by date/time ascending', async () => {
      await createComponent(trio());
      component.onSortChange({ active: 'dateTime', direction: 'asc' });
      expect(displayedIds()).toEqual(['c', 'b', 'a']);
    });

    it('should treat a missing timestamp as 0', async () => {
      await createComponent([
        mockAppError({ id: 'a', timestamp: at(500) }),
        mockAppError({ id: 'none', timestamp: undefined as any }),
      ]);
      component.onSortChange({ active: 'dateTime', direction: 'asc' });
      expect(displayedIds()).toEqual(['none', 'a']);
    });

    it('should sort text columns with localeCompare in both directions', async () => {
      await createComponent(trio());
      component.onSortChange({ active: 'component', direction: 'asc' });
      expect(displayedIds()[0]).toBe('c'); // AuthService before ExpenseService
      component.onSortChange({ active: 'component', direction: 'desc' });
      expect(displayedIds()[2]).toBe('c');
      component.onSortChange({ active: 'message', direction: 'asc' });
      expect(displayedIds()[0]).toBe('c'); // "Bad login" before "Failed to save"
      component.onSortChange({ active: 'message', direction: 'desc' });
      expect(displayedIds()[2]).toBe('c');
    });

    it('should sort by action', async () => {
      await createComponent(trio());
      component.onSortChange({ active: 'action', direction: 'asc' });
      expect(displayedIds()[0]).toBe('c'); // login < saveExpense
    });

    it('should sort by error text, treating a missing error as empty', async () => {
      await createComponent(trio());
      component.onSortChange({ active: 'error', direction: 'asc' });
      expect(displayedIds()).toEqual(['c', 'a', 'b']);
      component.onSortChange({ active: 'error', direction: 'desc' });
      expect(displayedIds()).toEqual(['b', 'a', 'c']);
    });

    it('should sort grouped rows by count', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      component.onSortChange({ active: 'count', direction: 'asc' });
      expect(component.displayedErrors().map((e) => (e as any).count)).toEqual([
        1, 2,
      ]);
      component.onSortChange({ active: 'count', direction: 'desc' });
      expect(component.displayedErrors().map((e) => (e as any).count)).toEqual([
        2, 1,
      ]);
    });

    it('should keep the source order when the direction is cleared', async () => {
      await createComponent(trio());
      component.onSortChange({ active: 'component', direction: '' });
      expect(displayedIds()).toEqual(['a', 'b', 'c']);
    });

    it('should keep the source order for an unknown column', async () => {
      await createComponent(trio());
      component.onSortChange({ active: 'bogus', direction: 'asc' });
      expect(displayedIds()).toEqual(['a', 'b', 'c']);
    });

    it('should reset to count descending and clear the selection when switching to the grouped view', async () => {
      await createComponent(trio());
      component.onSortChange({ active: 'component', direction: 'asc' });
      component.toggleAll();
      expect(component.hasSelection()).toBe(true);

      component.groupedView.set(true);
      TestBed.tick();

      expect(component.sortActive()).toBe('count');
      expect(component.sortDirection()).toBe('desc');
      expect(component.hasSelection()).toBe(false);
      expect((component.displayedErrors()[0] as any).count).toBe(2);
    });

    it('should reset to date/time descending when switching back to the individual view', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      component.groupedView.set(false);
      TestBed.tick();
      expect(component.sortActive()).toBe('dateTime');
      expect(component.sortDirection()).toBe('desc');
    });
  });

  describe('columnsToDisplay', () => {
    it('should show the error column and date/time on desktop', async () => {
      await createComponent();
      mockMediaQuery.state.set(false);
      expect(component.columnsToDisplay()).toEqual([
        'select',
        'component',
        'action',
        'message',
        'error',
        'dateTime',
      ]);
    });

    it('should drop the error column on mobile', async () => {
      await createComponent();
      mockMediaQuery.state.set(true);
      expect(component.columnsToDisplay()).toEqual([
        'select',
        'component',
        'action',
        'message',
        'dateTime',
      ]);
    });

    it('should show count instead of error and date/time in the grouped view', async () => {
      await createComponent();
      mockMediaQuery.state.set(false);
      component.groupedView.set(true);
      expect(component.columnsToDisplay()).toEqual([
        'select',
        'component',
        'action',
        'message',
        'count',
      ]);
    });

    it('should show the same grouped columns on mobile', async () => {
      await createComponent();
      mockMediaQuery.state.set(true);
      component.groupedView.set(true);
      expect(component.columnsToDisplay()).toEqual([
        'select',
        'component',
        'action',
        'message',
        'count',
      ]);
    });
  });

  describe('selection', () => {
    it('should select every row with toggleAll and report allSelected', async () => {
      await createComponent(trio());
      component.toggleAll();
      expect([...component.selectedErrorIds()].sort()).toEqual(['a', 'b', 'c']);
      expect(component.allSelected()).toBe(true);
      expect(component.someSelected()).toBe(false);
    });

    it('should clear everything when toggleAll runs with all selected', async () => {
      await createComponent(trio());
      component.toggleAll();
      component.toggleAll();
      expect(component.hasSelection()).toBe(false);
      expect(component.allSelected()).toBe(false);
    });

    it('should report someSelected when only part of the rows are selected', async () => {
      await createComponent(trio());
      component.toggleRow(component.errors()[0]!);
      expect(component.someSelected()).toBe(true);
      expect(component.allSelected()).toBe(false);
      expect(component.hasSelection()).toBe(true);
    });

    it('should never report allSelected for an empty list', async () => {
      await createComponent();
      expect(component.allSelected()).toBe(false);
      expect(component.someSelected()).toBe(false);
    });

    it('should toggle a single row on and off', async () => {
      await createComponent(trio());
      const row = component.errors()[2]!;
      component.toggleRow(row);
      expect(component.isRowSelected(row)).toBe(true);
      component.toggleRow(row);
      expect(component.isRowSelected(row)).toBe(false);
    });

    it('should select and deselect all ids of a grouped row together', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      const merged = component
        .groupedErrors()
        .find((g) => g.component === 'ExpenseService')!;
      component.toggleRow(merged);
      expect([...component.selectedErrorIds()].sort()).toEqual(['a', 'b']);
      expect(component.isRowSelected(merged)).toBe(true);
      component.toggleRow(merged);
      expect(component.hasSelection()).toBe(false);
    });

    it('should not treat a partly selected group as selected, and a toggle selects the rest', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      const merged = component
        .groupedErrors()
        .find((g) => g.component === 'ExpenseService')!;
      component.selectedErrorIds.set(new Set(['a']));
      expect(component.isRowSelected(merged)).toBe(false);
      component.toggleRow(merged);
      expect([...component.selectedErrorIds()].sort()).toEqual(['a', 'b']);
    });

    it('should enable Delete Selected only when something is selected', async () => {
      await createComponent(trio());
      const btn = () =>
        fixture.nativeElement.querySelector(
          'button[aria-label="Delete selected records"]'
        ) as HTMLButtonElement;
      expect(btn().disabled).toBe(true);
      component.toggleAll();
      fixture.detectChanges();
      expect(btn().disabled).toBe(false);
    });
  });

  describe('deleteError()', () => {
    it('should delete one id for an ungrouped row and drop it from the list and selection', async () => {
      await createComponent(trio());
      component.toggleAll();
      await component.deleteError(component.errors()[0]!);
      expect(mockErrorService.deleteAppError).toHaveBeenCalledWith('a');
      expect(mockErrorService.deleteAppErrors).not.toHaveBeenCalled();
      expect(component.errors().map((e) => e.id)).toEqual(['b', 'c']);
      expect([...component.selectedErrorIds()].sort()).toEqual(['b', 'c']);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'Error(s) deleted successfully' } }
      );
    });

    it('should delete every id of a grouped row in one call', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      const merged = component
        .groupedErrors()
        .find((g) => g.component === 'ExpenseService')!;
      await component.deleteError(merged);
      expect(mockErrorService.deleteAppErrors).toHaveBeenCalledWith(['a', 'b']);
      expect(mockErrorService.deleteAppError).not.toHaveBeenCalled();
      expect(component.errors().map((e) => e.id)).toEqual(['c']);
    });

    it('should show the failure and keep the rows when the delete fails', async () => {
      await createComponent(trio());
      mockErrorService.deleteAppError.mockRejectedValue(new Error('denied'));
      mockLoading.loadingOff.mockClear();
      await component.deleteError(component.errors()[0]!);
      expect(component.errors().length).toBe(3);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'denied' } }
      );
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    it('should fall back to "Failed to delete error(s)" for a non-Error rejection', async () => {
      await createComponent(trio());
      mockErrorService.deleteAppError.mockRejectedValue('nope');
      await component.deleteError(component.errors()[0]!);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'Failed to delete error(s)' } }
      );
    });
  });

  describe('clearErrors()', () => {
    it('should ask for confirmation naming the current view', async () => {
      await createComponent(trio());
      mockDialog.open.mockReturnValue(closedWith(false));
      await component.clearErrors();
      expect(mockDialog.open).toHaveBeenCalledWith(DeleteDialogComponent, {
        data: { operation: 'Delete', target: 'all errors in the current view' },
      });
    });

    it('should delete every error id and empty the list on confirm', async () => {
      await createComponent(trio());
      component.toggleAll();
      mockDialog.open.mockReturnValue(closedWith(true));
      await component.clearErrors();
      await vi.waitFor(() =>
        expect(component.errors()).toEqual([])
      );
      expect(mockErrorService.deleteAppErrors).toHaveBeenCalledWith([
        'a',
        'b',
        'c',
      ]);
      expect(component.hasSelection()).toBe(false);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'Errors deleted successfully' } }
      );
    });

    it('should delete every id inside the groups in the grouped view', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      mockDialog.open.mockReturnValue(closedWith(true));
      await component.clearErrors();
      await vi.waitFor(() =>
        expect(mockErrorService.deleteAppErrors).toHaveBeenCalled()
      );
      expect(
        [...mockErrorService.deleteAppErrors.mock.calls[0]![0]].sort()
      ).toEqual(['a', 'b', 'c']);
    });

    it('should delete nothing when the user cancels', async () => {
      await createComponent(trio());
      mockDialog.open.mockReturnValue(closedWith(false));
      await component.clearErrors();
      expect(mockErrorService.deleteAppErrors).not.toHaveBeenCalled();
      expect(component.errors().length).toBe(3);
    });

    it('should show the failure and keep the list when the delete fails', async () => {
      await createComponent(trio());
      mockErrorService.deleteAppErrors.mockRejectedValue(new Error('denied'));
      mockDialog.open.mockReturnValue(closedWith(true));
      await component.clearErrors();
      await vi.waitFor(() =>
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          CustomSnackbarComponent,
          { data: { message: 'denied' } }
        )
      );
      expect(component.errors().length).toBe(3);
    });
  });

  describe('deleteSelected()', () => {
    it('should ask for confirmation naming the selected errors', async () => {
      await createComponent(trio());
      mockDialog.open.mockReturnValue(closedWith(false));
      component.deleteSelected();
      expect(mockDialog.open).toHaveBeenCalledWith(DeleteDialogComponent, {
        data: { operation: 'Delete', target: 'the selected error(s)' },
      });
    });

    it('should delete only the selected ids on confirm', async () => {
      await createComponent(trio());
      component.toggleRow(component.errors()[1]!);
      mockDialog.open.mockReturnValue(closedWith(true));
      component.deleteSelected();
      await vi.waitFor(() =>
        expect(component.errors().map((e) => e.id)).toEqual(['a', 'c'])
      );
      expect(mockErrorService.deleteAppErrors).toHaveBeenCalledWith(['b']);
      expect(component.hasSelection()).toBe(false);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'Errors deleted successfully' } }
      );
    });

    it('should delete nothing and keep the selection when the user cancels', async () => {
      await createComponent(trio());
      component.toggleRow(component.errors()[1]!);
      mockDialog.open.mockReturnValue(closedWith(false));
      component.deleteSelected();
      expect(mockErrorService.deleteAppErrors).not.toHaveBeenCalled();
      expect(component.hasSelection()).toBe(true);
      expect(component.errors().length).toBe(3);
    });

    it('should show the failure and keep the rows when the delete fails', async () => {
      await createComponent(trio());
      component.toggleRow(component.errors()[1]!);
      mockErrorService.deleteAppErrors.mockRejectedValue('nope');
      mockDialog.open.mockReturnValue(closedWith(true));
      component.deleteSelected();
      await vi.waitFor(() =>
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          CustomSnackbarComponent,
          { data: { message: 'Failed to delete errors' } }
        )
      );
      expect(component.errors().length).toBe(3);
    });
  });

  describe('onRowClick()', () => {
    it('should open the detail dialog with the clicked row', async () => {
      await createComponent(trio());
      mockDialog.open.mockReturnValue(closedWith(undefined));
      const row = component.errors()[0]!;
      component.onRowClick(row);
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      expect(mockDialog.open).toHaveBeenCalledWith(ErrorDetailDialogComponent, {
        data: row,
      });
    });

    it('should not ask for confirmation when the detail dialog is closed without a delete request', async () => {
      await createComponent(trio());
      mockDialog.open.mockReturnValue(closedWith(undefined));
      component.onRowClick(component.errors()[0]!);
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      expect(mockErrorService.deleteAppError).not.toHaveBeenCalled();
    });

    it('should delete the error after the detail dialog requests it and the user confirms', async () => {
      await createComponent(trio());
      mockDialog.open
        .mockReturnValueOnce(closedWith(true))
        .mockReturnValueOnce(closedWith(true));
      component.onRowClick(component.errors()[0]!);
      await vi.waitFor(() =>
        expect(mockErrorService.deleteAppError).toHaveBeenCalledWith('a')
      );
      expect(mockDialog.open).toHaveBeenNthCalledWith(2, DeleteDialogComponent, {
        data: { operation: 'Delete', target: 'this error' },
      });
      expect(component.errors().map((e) => e.id)).toEqual(['b', 'c']);
    });

    it('should delete all ids of a grouped row and name "these errors" in the confirmation', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      const merged = component
        .groupedErrors()
        .find((g) => g.component === 'ExpenseService')!;
      mockDialog.open
        .mockReturnValueOnce(closedWith(true))
        .mockReturnValueOnce(closedWith(true));
      component.onRowClick(merged);
      await vi.waitFor(() =>
        expect(mockErrorService.deleteAppErrors).toHaveBeenCalledWith([
          'a',
          'b',
        ])
      );
      expect(mockDialog.open).toHaveBeenNthCalledWith(2, DeleteDialogComponent, {
        data: { operation: 'Delete', target: 'these errors' },
      });
    });

    it('should delete nothing when the user cancels the confirmation', async () => {
      await createComponent(trio());
      mockDialog.open
        .mockReturnValueOnce(closedWith(true))
        .mockReturnValueOnce(closedWith(false));
      component.onRowClick(component.errors()[0]!);
      expect(mockDialog.open).toHaveBeenCalledTimes(2);
      expect(mockErrorService.deleteAppError).not.toHaveBeenCalled();
      expect(component.errors().length).toBe(3);
    });

    it('should open the detail dialog when a rendered row is clicked', async () => {
      await createComponent(trio());
      mockDialog.open.mockReturnValue(closedWith(undefined));
      const row = fixture.nativeElement.querySelector(
        '[data-testid="error-row"]'
      ) as HTMLElement;
      row.click();
      expect(mockDialog.open).toHaveBeenCalledWith(ErrorDetailDialogComponent, {
        data: component.displayedErrors()[0],
      });
    });
  });

  describe('grouped table rendering', () => {
    it('should render one row per group with its count', async () => {
      await createComponent(trio());
      component.groupedView.set(true);
      TestBed.tick();
      fixture.detectChanges();
      const counts = [
        ...fixture.nativeElement.querySelectorAll(
          '[data-testid="error-group-count"]'
        ),
      ].map((c: HTMLElement) => c.textContent?.trim());
      expect(counts).toEqual(['2', '1']);
    });
  });
});
