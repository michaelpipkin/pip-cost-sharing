import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { Expense } from '@models/expense';
import { GuidedTourConfig } from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';
import { GuidedTourService } from '@services/guided-tour.service';
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
  mockMember,
} from '@testing/test-helpers';
import { getFirestore } from 'firebase/firestore';
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
        { provide: getFirestore, useValue: {} },
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
  describe('guided tour', () => {
    let tourConfig: GuidedTourConfig;
    let startSpy: ReturnType<typeof vi.spyOn>;
    let memberStore: ReturnType<typeof createMockMemberStore>;
    const me = mockMember({
      id: 'me',
      displayName: 'Pat',
      groupAdmin: true,
      ref: mockDocRef('groups/group-1/members/me'),
    });

    beforeEach(() => {
      memberStore = TestBed.inject(MemberStore) as unknown as ReturnType<
        typeof createMockMemberStore
      >;
      memberStore.currentMember.set(me);
      memberStore.groupMembers.set([me]);
      startSpy = vi
        .spyOn(TestBed.inject(GuidedTourService), 'start')
        .mockImplementation(async (config) => {
          tourConfig = config;
        });
    });

    const runStep = async (id: string) =>
      tourConfig.steps.find((s) => s.id === id)!.beforeShow?.();
    const step = (id: string) => tourConfig.steps.find((s) => s.id === id)!;

    it('should start the expenses tour', () => {
      component.startTour();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('expenses');
    });

    it('should show sample expenses when there are none to list', () => {
      component.expenses.set([]);
      component.startTour();

      expect(component.groupHasExpenses()).toBe(true);
      expect(component.filteredExpenses().map((e) => e.description)).toEqual([
        'Gas',
        'Dinner out',
        'Groceries',
      ]);
      // With no other members, the samples are split with sample people
      const gas = component.filteredExpenses()[0]!;
      expect(gas.splits.map((s) => s.owedByMember!.displayName)).toEqual([
        'Pat',
        'Alex',
        'Jordan',
      ]);
      // The payer's own share is paid, plus one other, so both states show
      expect(gas.splits.map((s) => s.paid)).toEqual([true, true, false]);
      expect(gas.splits.reduce((t, s) => t + s.allocatedAmount, 0)).toBeCloseTo(
        48,
        2
      );
      expect(step('intro').text).toContain('samples');
    });

    it('should keep the sample even if expenses reload during the tour', () => {
      component.expenses.set([]);
      component.startTour();
      component.expenses.set([]);

      expect(component.filteredExpenses()).toHaveLength(3);
    });

    it('should use the loaded expenses when there are some', () => {
      const real = new Expense({
        id: 'real',
        description: 'Real',
        date: new Date(),
        totalAmount: 10,
        splits: [],
      });
      component.expenses.set([real]);
      component.startTour();

      expect(component.filteredExpenses()).toEqual([real]);
      expect(step('intro').text).not.toContain('samples');
    });

    it('should expand the first expense for the split steps and restore after', async () => {
      component.expenses.set([]);
      component.startTour();

      await runStep('splits');
      expect(component.expandedExpense()?.description).toBe('Gas');
      await runStep('table');
      expect(component.expandedExpense()).toBeNull();

      await runStep('mark-paid');
      tourConfig.onEnd!('closed');
      expect(component.expandedExpense()).toBeNull();
      expect(component.filteredExpenses()).toEqual([]);
    });

    it('should open the Add New Expense options without navigating, and close them on end', async () => {
      const dialog = (component as any).dialog;
      const navigate = vi.spyOn(router, 'navigate');
      component.startTour();

      await runStep('add-expense-options');
      expect(dialog.open).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ autoFocus: false })
      );

      const ref = dialog.open.mock.results[0]!.value;
      tourConfig.onEnd!('closed');
      expect(ref.close).toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('should show the mark-paid step only to admins', () => {
      component.startTour();
      expect(step('mark-paid').when!()).toBe(true);

      memberStore.currentMember.set(mockMember({ ...me, groupAdmin: false }));
      expect(step('mark-paid').when!()).toBe(false);
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });
});
