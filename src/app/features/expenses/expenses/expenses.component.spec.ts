import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { LocaleService } from '@services/locale.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { TableFilterService } from '@services/table-filter.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import {
  createMockAnalyticsService,
  createMockCategoryService,
  createMockCategoryStore,
  createMockExpenseService,
  createMockExpenseStore,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockSortingService,
  createMockSplitService,
  mockDocRef,
  mockGroup,
} from '@testing/test-helpers';
import { getStorage } from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AddExpenseOption,
  AddExpenseOptionsDialogComponent,
} from '../add-expense-options-dialog/add-expense-options-dialog.component';
import { ExpensesComponent } from './expenses.component';

describe('ExpensesComponent', () => {
  let fixture: ComponentFixture<ExpensesComponent>;
  let component: ExpensesComponent;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockExpenseStore: ReturnType<typeof createMockExpenseStore>;
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockSplitService: ReturnType<typeof createMockSplitService>;
  let router: Router;

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
  };

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockExpenseStore = createMockExpenseStore();
    mockExpenseService = createMockExpenseService();
    mockSplitService = createMockSplitService();

    const testGroup = mockGroup({ id: 'group-1', name: 'Test Group' });
    mockGroupStore.currentGroup.set(testGroup);

    await TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: getStorage, useValue: {} },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: createMockMemberStore() },
        { provide: CategoryStore, useValue: createMockCategoryStore() },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: CategoryService, useValue: createMockCategoryService() },
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: SplitService, useValue: mockSplitService },
        { provide: SortingService, useValue: createMockSortingService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: MatDialog, useValue: createMockMatDialog() },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
        TableFilterService,
        LocaleService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpensesComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('loadExpenses', () => {
    it('should call expenseService.getGroupExpensesByDateRange', async () => {
      await component.loadExpenses();
      expect(mockExpenseService.getGroupExpensesByDateRange).toHaveBeenCalled();
    });

    it('should set expenses from the service result', async () => {
      const testExpense = { id: 'exp-1', description: 'Test Expense' } as any;
      // The mock is typed Promise<never[]> (it resolves [] by default)
      mockExpenseService.getGroupExpensesByDateRange.mockResolvedValueOnce([
        testExpense,
      ] as never[]);
      await component.loadExpenses();
      expect(component.expenses()).toEqual([testExpense]);
    });

    it('should clear expenses when the current group becomes null', async () => {
      component.expenses.set([{ id: 'exp-1' } as any]);
      component.isLoaded.set(true);
      mockGroupStore.currentGroup.set(null);
      await fixture.whenStable();
      expect(component.expenses()).toEqual([]);
      expect(component.isLoaded()).toBe(false);
    });

    it('should mark isLoaded as true after loading', async () => {
      await component.loadExpenses();
      expect(component.isLoaded()).toBe(true);
    });
  });

  describe('onExpandClick', () => {
    it('should set expandedExpense to clicked expense', () => {
      const expense = { id: 'exp-1' } as any;
      component.onExpandClick(expense);
      expect(component.expandedExpense()).toBe(expense);
    });

    it('should collapse already-expanded expense', () => {
      const expense = { id: 'exp-1' } as any;
      component.expandedExpense.set(expense);
      component.onExpandClick(expense);
      expect(component.expandedExpense()).toBeNull();
    });
  });

  describe('onAddExpenseClick', () => {
    function mockDialogResult(result: AddExpenseOption | null) {
      const dialog = TestBed.inject(MatDialog);
      return vi.spyOn(dialog, 'open').mockReturnValueOnce({
        afterClosed: () => ({
          subscribe: (cb: (result: AddExpenseOption | null) => void) => cb(result),
        }),
      } as any);
    }

    it('opens the add-expense options dialog', () => {
      const openSpy = mockDialogResult(null);
      component.onAddExpenseClick();
      expect(openSpy).toHaveBeenCalledWith(
        AddExpenseOptionsDialogComponent,
        expect.any(Object)
      );
    });

    it.each<{
      choice: AddExpenseOption;
      expectedRoute: string;
    }>([
      { choice: 'manual', expectedRoute: '/expenses/add' },
      { choice: 'rental', expectedRoute: '/expenses/rental' },
      { choice: 'receipt', expectedRoute: '/expenses/scan-receipt' },
    ])(
      'should navigate to $expectedRoute when $choice is chosen',
      ({ choice, expectedRoute }) => {
        mockDialogResult(choice);
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        component.onAddExpenseClick();
        expect(navigateSpy).toHaveBeenCalledWith([expectedRoute]);
      }
    );

    it('should not navigate when the dialog is cancelled', () => {
      mockDialogResult(null);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onAddExpenseClick();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

  });

  describe('onRowClick', () => {
    it('should navigate to expense detail', () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onRowClick({ id: 'exp-1' } as any);
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses', 'exp-1']);
    });
  });

  describe('markSplitPaidUnpaid', () => {
    it('should not update the split when the dialog is cancelled', () => {
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValueOnce({
        afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(false) }),
      } as any);
      component.markSplitPaidUnpaid({ id: 'exp-1' } as any, { paid: false } as any);
      expect(mockSplitService.updateSplit).not.toHaveBeenCalled();
    });

    it('should call splitService.updateSplit when confirmed', async () => {
      const dialog = TestBed.inject(MatDialog);
      vi.spyOn(dialog, 'open').mockReturnValueOnce({
        afterClosed: () => ({ subscribe: (cb: (result: any) => void) => cb(true) }),
      } as any);
      const expense = {
        id: 'exp-1',
        ref: mockDocRef('groups/group-1/expenses/exp-1'),
      } as any;
      const split = {
        paid: false,
        ref: mockDocRef('groups/group-1/expenses/exp-1/splits/split-1'),
      } as any;
      component.markSplitPaidUnpaid(expense, split);
      await fixture.whenStable();
      expect(mockSplitService.updateSplit).toHaveBeenCalled();
    });
  });

  describe('sortExpenses', () => {
    it('should set sortAsc to true when direction is asc', () => {
      component.sortExpenses({ active: 'date', direction: 'asc' });
      expect(component.sortAsc()).toBe(true);
    });

    it('should set sortAsc to false when direction is desc', () => {
      component.sortExpenses({ active: 'date', direction: 'desc' });
      expect(component.sortAsc()).toBe(false);
    });
  });
});
