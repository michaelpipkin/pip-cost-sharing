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
import { MediaQueryService } from '@services/media-query.service';
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
  createMockMediaQueryService,
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
  let mockMediaQuery: ReturnType<typeof createMockMediaQueryService>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockExpenseStore: ReturnType<typeof createMockExpenseStore>;
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockSplitService: ReturnType<typeof createMockSplitService>;
  let router: Router;

  beforeEach(async () => {
    mockMediaQuery = createMockMediaQueryService();
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
        { provide: MediaQueryService, useValue: mockMediaQuery },
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

  describe('table filters (filteredExpenses)', () => {
    let filters: TableFilterService<Expense>;

    const alice = mockDocRef('groups/group-1/members/alice');
    const bob = mockDocRef('groups/group-1/members/bob');
    // A different object for the same path as alice, as a store reload gives
    const aliceReloaded = mockDocRef('groups/group-1/members/alice');
    const food = mockDocRef('groups/group-1/categories/food');

    function expense(init: Partial<Expense>): Expense {
      return new Expense({
        date: new Date(2025, 0, 15),
        description: 'Item',
        totalAmount: 10,
        paid: false,
        splits: [],
        paidByMemberRef: alice,
        categoryRef: food,
        ...init,
      });
    }

    function shown(): string[] {
      return component.filteredExpenses().map((e) => e.id);
    }

    beforeEach(() => {
      // The component provides its own TableFilterService
      filters = (component as any).expenseFilterService;
    });

    describe('text', () => {
      beforeEach(() =>
        component.expenses.set([
          expense({ id: 'upper', description: 'Dinner at Luigi' }),
          expense({ id: 'lower', description: 'dinner at home' }),
          expense({ id: 'other', description: 'Gas' }),
          expense({ id: 'none', description: null as any }),
        ])
      );

      it('matches a substring case-insensitively by default', () => {
        filters.setFilter('description', { type: 'text', value: 'DINNER' });
        expect(shown()).toEqual(['upper', 'lower']);
      });

      it('matches only the exact case when caseSensitive is set', () => {
        filters.setFilter('description', {
          type: 'text',
          value: 'Dinner',
          caseSensitive: true,
        });
        expect(shown()).toEqual(['upper']);
      });

      it('never matches a row whose field is null or undefined', () => {
        // '' is contained in every string, so only the null guard excludes 'none'
        filters.setFilter('description', { type: 'text', value: '' });
        expect(shown()).toEqual(['upper', 'lower', 'other']);

        // receiptPath is undefined on every row
        filters.clearFilter('description');
        filters.setFilter('receiptPath', { type: 'text', value: '' });
        expect(shown()).toEqual([]);
      });

      it('restores every row once the filter is cleared', () => {
        filters.setFilter('description', { type: 'text', value: 'Gas' });
        expect(shown()).toEqual(['other']);
        filters.clearFilter('description');
        expect(shown()).toEqual(['upper', 'lower', 'other', 'none']);
      });
    });

    describe('select', () => {
      beforeEach(() =>
        component.expenses.set([
          expense({ id: 'a1', paidByMemberRef: alice }),
          expense({ id: 'b1', paidByMemberRef: bob }),
          expense({ id: 'a2', paidByMemberRef: aliceReloaded }),
          expense({ id: 'null', receiptPath: null }),
          expense({ id: 'receipt', receiptPath: 'receipts/r.jpg' }),
        ])
      );

      it('matches a DocumentReference by path, not identity', () => {
        filters.setFilter('paidByMemberRef', {
          type: 'select',
          value: mockDocRef('groups/group-1/members/alice'),
        });
        expect(shown()).toEqual(['a1', 'a2', 'null', 'receipt']);
      });

      it('unwraps an object with a ref (a member) to its DocumentReference', () => {
        filters.setFilter('paidByMemberRef', {
          type: 'select',
          value: mockMember({ id: 'bob', ref: bob }),
        });
        expect(shown()).toEqual(['b1']);
      });

      it('matches a primitive value by equality', () => {
        filters.setFilter('receiptPath', {
          type: 'select',
          value: 'receipts/r.jpg',
        });
        expect(shown()).toEqual(['receipt']);
      });

      it('matches value null only against rows holding null', () => {
        filters.setFilter('receiptPath', { type: 'select', value: null });
        expect(shown()).toEqual(['null']);
      });

      it('passes a row matching any value of a multiple select', () => {
        filters.setFilter('paidByMemberRef', {
          type: 'select',
          multiple: true,
          value: [bob, mockMember({ id: 'carol', ref: mockDocRef('x/carol') })],
        });
        expect(shown()).toEqual(['b1']);

        filters.setFilter('paidByMemberRef', {
          type: 'select',
          multiple: true,
          value: [bob, aliceReloaded],
        });
        expect(shown()).toEqual(['a1', 'b1', 'a2', 'null', 'receipt']);
      });

      it('lets nothing through for a multiple select with no values', () => {
        filters.setFilter('paidByMemberRef', {
          type: 'select',
          multiple: true,
          value: [],
        });
        expect(shown()).toEqual([]);
      });
    });

    describe('dateRange', () => {
      beforeEach(() =>
        component.expenses.set([
          expense({ id: 'jan9', date: new Date(2025, 0, 9, 23, 59) }),
          expense({ id: 'jan10', date: new Date(2025, 0, 10, 0, 1) }),
          expense({ id: 'jan11', date: new Date(2025, 0, 11, 12, 0) }),
          expense({ id: 'jan12', date: new Date(2025, 0, 12, 22, 0) }),
          expense({ id: 'jan13', date: new Date(2025, 0, 13, 0, 1) }),
          expense({ id: 'nodate', date: null as any }),
        ])
      );

      it('includes both end days and strips the time of day', () => {
        filters.setFilter('date', {
          type: 'dateRange',
          start: new Date(2025, 0, 10, 23, 59),
          end: new Date(2025, 0, 12, 0, 1),
        });
        expect(shown()).toEqual(['jan10', 'jan11', 'jan12']);
      });

      it('has no upper bound when only a start is set', () => {
        filters.setFilter('date', {
          type: 'dateRange',
          start: new Date(2025, 0, 12),
          end: null,
        });
        expect(shown()).toEqual(['jan12', 'jan13']);
      });

      it('has no lower bound when only an end is set', () => {
        filters.setFilter('date', {
          type: 'dateRange',
          start: null,
          end: new Date(2025, 0, 10),
        });
        expect(shown()).toEqual(['jan9', 'jan10']);
      });

      it('lets every dated row through when both ends are open, but not an undated one', () => {
        filters.setFilter('date', {
          type: 'dateRange',
          start: null,
          end: null,
        });
        expect(shown()).toEqual(['jan9', 'jan10', 'jan11', 'jan12', 'jan13']);
      });
    });

    describe('toggle', () => {
      beforeEach(() =>
        component.expenses.set([
          expense({ id: 'paid', paid: true }),
          expense({ id: 'unpaid', paid: false }),
          expense({ id: 'unset', paid: undefined as any }),
        ])
      );

      it('matches true only against true', () => {
        filters.setFilter('paid', { type: 'toggle', value: true });
        expect(shown()).toEqual(['paid']);
      });

      it('matches false only against false (strict equality)', () => {
        filters.setFilter('paid', { type: 'toggle', value: false });
        expect(shown()).toEqual(['unpaid']);
      });
    });

    it('combines several filters with AND', () => {
      component.expenses.set([
        expense({ id: 'a-dinner-paid', description: 'Dinner', paid: true }),
        expense({ id: 'a-dinner-open', description: 'Dinner', paid: false }),
        expense({ id: 'a-gas-paid', description: 'Gas', paid: true }),
        expense({
          id: 'b-dinner-paid',
          description: 'Dinner',
          paid: true,
          paidByMemberRef: bob,
        }),
      ]);
      filters.setFilter('description', { type: 'text', value: 'dinner' });
      filters.setFilter('paid', { type: 'toggle', value: true });
      filters.setFilter('paidByMemberRef', { type: 'select', value: alice });

      expect(shown()).toEqual(['a-dinner-paid']);

      filters.clearFilter('paid');
      expect(shown()).toEqual(['a-dinner-paid', 'a-dinner-open']);
    });

    it('totals only the filtered rows', () => {
      component.expenses.set([
        expense({ id: 'a', description: 'Dinner', totalAmount: 12.5 }),
        expense({ id: 'b', description: 'Gas', totalAmount: 30 }),
      ]);
      filters.setFilter('description', { type: 'text', value: 'dinner' });
      expect(component.expenseTotal()).toBe(12.5);
    });
  });

  describe('columnsToDisplay', () => {
    it('should show every column separately on wide screens', () => {
      expect(component.columnsToDisplay()).toEqual([
        'date',
        'paidBy',
        'description',
        'category',
        'amount',
        'receipt',
        'paid',
        'expand',
      ]);
      expect(component.footerColumnsToDisplay()).toEqual([
        'amount',
        'receipt',
        'paid',
        'expand',
      ]);
    });

    it('should combine columns on narrow screens', () => {
      mockMediaQuery.state.set(true);

      expect(component.smallScreen()).toBe(true);
      expect(component.columnsToDisplay()).toEqual([
        'date-paidBy',
        'description-category',
        'amount',
        'receipt-paid',
        'expand',
      ]);
      expect(component.footerColumnsToDisplay()).toEqual([
        'amount',
        'receipt-paid',
        'expand',
      ]);
    });
  });
});
