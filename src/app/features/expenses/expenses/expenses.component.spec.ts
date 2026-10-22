import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { HelpDialogComponent } from '@features/help/help-dialog/help-dialog.component';
import { Category } from '@models/category';
import { Expense } from '@models/expense';
import { Split } from '@models/split';
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

  // Dialogs and services the component injects are mocks; these give the
  // tests below a handle on them.
  const loadingService = () =>
    TestBed.inject(LoadingService) as unknown as ReturnType<
      typeof createMockLoadingService
    >;
  const snackbar = () =>
    TestBed.inject(MatSnackBar) as unknown as ReturnType<
      typeof createMockSnackBar
    >;
  const analytics = () =>
    TestBed.inject(AnalyticsService) as unknown as ReturnType<
      typeof createMockAnalyticsService
    >;
  const snackbarMessage = (message: string) => [
    CustomSnackbarComponent,
    { data: { message } },
  ];

  describe('loading the list', () => {
    it('should load the current group\'s expenses with the default filter', async () => {
      // The default start is computed when the page is created, so create it
      // at a fixed time: the window is then exactly 90 days, not shorter or longer.
      const now = new Date(2026, 5, 15, 12, 0, 0);
      vi.useFakeTimers({ toFake: ['Date'] });
      let created: ComponentFixture<ExpensesComponent>;
      try {
        vi.setSystemTime(now);
        created = TestBed.createComponent(ExpensesComponent);
      } finally {
        vi.useRealTimers();
      }
      await created.whenStable();
      mockExpenseService.getGroupExpensesByDateRange.mockClear();

      await created.componentInstance.loadExpenses();

      const [groupId, start, end, unpaidOnly, payer, category] = (
        mockExpenseService.getGroupExpensesByDateRange.mock
          .lastCall as unknown as any[]
      );
      expect(groupId).toBe('group-1');
      // the default window is the last 90 days, and still open at the end
      expect(start).toEqual(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000));
      expect(end).toBeUndefined();
      expect(unpaidOnly).toBe(true);
      expect(payer).toBeNull();
      expect(category).toBeNull();
    });

    it('should leave the start open and show the returned rows when the start date is cleared', async () => {
      const rows = [
        new Expense({ id: 'old', description: 'Old', date: new Date(2020, 0, 1), splits: [] }),
        new Expense({ id: 'new', description: 'New', date: new Date(2026, 0, 1), splits: [] }),
      ];
      mockExpenseService.getGroupExpensesByDateRange.mockResolvedValueOnce(
        rows as never[]
      );
      // the clear button next to the start date does exactly this
      component.startDate.set(null);

      await component.loadExpenses();

      const args = mockExpenseService.getGroupExpensesByDateRange.mock
        .lastCall as unknown as any[];
      expect(args[0]).toBe('group-1');
      expect(args[1]).toBeUndefined();
      expect(component.filteredExpenses().map((e) => e.id)).toEqual(['old', 'new']);
    });

    it('should pass the chosen date range, payer, category and paid filter, and remember them', async () => {
      const payer = mockDocRef('groups/group-1/members/alice');
      const category = mockDocRef('groups/group-1/categories/food');
      const start = new Date(2025, 0, 1);
      const end = new Date(2025, 0, 31);
      component.startDate.set(start);
      component.endDate.set(end);
      component.searchPayer.set(payer);
      component.searchCategory.set(category);
      component.unpaidOnly.set(false);

      await component.loadExpenses();

      expect(mockExpenseService.getGroupExpensesByDateRange).toHaveBeenLastCalledWith(
        'group-1',
        start,
        end,
        false,
        payer,
        category
      );
      // the filter the list on screen was loaded with
      expect(component.currentSearchPayer()).toBe(payer);
      expect(component.currentSearchCategory()).toBe(category);
      expect(component.currentUnpaidOnly()).toBe(false);
    });

    it('should leave the "loaded with" filter alone when the load fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockExpenseService.getGroupExpensesByDateRange.mockRejectedValueOnce(
        new Error('offline')
      );
      component.unpaidOnly.set(false);

      await component.loadExpenses();

      expect(component.currentUnpaidOnly()).toBe(true);
    });

    it('should show an empty list, log the failure and finish loading when the load fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      component.expenses.set([{ id: 'stale' } as any]);
      component.isLoaded.set(false);
      mockExpenseService.getGroupExpensesByDateRange.mockRejectedValueOnce(
        new Error('offline')
      );
      loadingService().loadingOff.mockClear();

      await component.loadExpenses();

      expect(component.expenses()).toEqual([]);
      expect(analytics().logEvent).toHaveBeenCalledWith('fetch_expenses_error', {
        error: 'offline',
      });
      expect(component.isLoaded()).toBe(true);
      expect(loadingService().loadingOff).toHaveBeenCalledOnce();
    });

    it('should wait for a current group, then load that group once', async () => {
      mockGroupStore.currentGroup.set(null);
      await fixture.whenStable();
      mockExpenseService.getGroupExpensesByDateRange.mockClear();

      const waiting = TestBed.createComponent(ExpensesComponent);
      await waiting.whenStable();
      expect(mockExpenseService.getGroupExpensesByDateRange).not.toHaveBeenCalled();

      mockGroupStore.currentGroup.set(mockGroup({ id: 'group-2' }));
      await waiting.whenStable();

      expect(mockExpenseService.getGroupExpensesByDateRange).toHaveBeenCalledOnce();
      expect(
        (mockExpenseService.getGroupExpensesByDateRange.mock
          .lastCall as unknown as any[])[0]
      ).toBe('group-2');
      expect(waiting.componentInstance.isLoaded()).toBe(true);
    });
  });

  describe('sorting', () => {
    const rows = () => [
      new Expense({ id: 'a', description: 'A', date: new Date(2025, 0, 1) }),
      new Expense({ id: 'b', description: 'B', date: new Date(2025, 0, 2) }),
    ];

    it('should sort the filtered rows by the chosen column and direction', () => {
      const sorter = TestBed.inject(SortingService) as unknown as ReturnType<
        typeof createMockSortingService
      >;
      const list = rows();
      component.expenses.set(list);
      component.sortField.set('description');
      sorter.sort.mockClear();

      component.sortExpenses({ active: 'description', direction: 'desc' });
      component.filteredExpenses();

      expect(sorter.sort).toHaveBeenCalledWith(list, 'description', false);
    });

    it('should not sort an empty list', () => {
      const sorter = TestBed.inject(SortingService) as unknown as ReturnType<
        typeof createMockSortingService
      >;
      sorter.sort.mockClear();
      component.expenses.set([]);

      component.filteredExpenses();

      expect(sorter.sort).not.toHaveBeenCalled();
    });

    it('should ignore a filter of an unknown type', () => {
      const list = rows();
      component.expenses.set(list);
      (component as any).expenseFilterService.setFilter('description', {
        type: 'mystery',
        value: 'x',
      });

      expect(component.filteredExpenses()).toEqual(list);
    });
  });

  describe('admin-only columns and filter labels', () => {
    it('should offer the mark-paid column only to a group admin', () => {
      const members = TestBed.inject(MemberStore) as unknown as ReturnType<
        typeof createMockMemberStore
      >;

      members.currentMember.set(mockMember({ groupAdmin: true }));
      expect((component as any).splitColumnsToDisplay()).toEqual([
        'owedBy',
        'amount',
        'paid',
        'mark',
      ]);

      members.currentMember.set(mockMember({ groupAdmin: false }));
      expect((component as any).splitColumnsToDisplay()).toEqual([
        'owedBy',
        'amount',
        'paid',
      ]);

      members.currentMember.set(null);
      expect((component as any).splitColumnsToDisplay()).toEqual([
        'owedBy',
        'amount',
        'paid',
      ]);
    });

    it('should label the category and member filters by name, and an empty option as blank', () => {
      expect(component.categoryDisplayFn(new Category({ name: 'Food' }))).toBe(
        'Food'
      );
      expect(component.categoryDisplayFn(null as any)).toBe('');
      expect(component.memberDisplayFn(mockMember({ displayName: 'Alice' }))).toBe(
        'Alice'
      );
      expect(component.memberDisplayFn(undefined as any)).toBe('');
    });
  });

  describe('help', () => {
    it('should open the Expenses section of the help', () => {
      const open = vi.spyOn(TestBed.inject(MatDialog), 'open');

      component.showHelp();

      expect(open).toHaveBeenCalledWith(
        HelpDialogComponent,
        expect.objectContaining({ data: { sectionId: 'expenses' } })
      );
    });
  });

  describe('markSplitPaidUnpaid outcomes', () => {
    const expenseRef = mockDocRef('groups/group-1/expenses/exp-1');
    const splitRef = mockDocRef('groups/group-1/expenses/exp-1/splits/split-1');
    const expense = () => ({ id: 'exp-1', ref: expenseRef }) as any;
    const split = (paid: boolean) => ({ paid, ref: splitRef }) as any;

    // Holds the afterClosed callback so a test can await the async handler
    function pendingDialog() {
      let onClose!: (result: unknown) => Promise<void>;
      const open = vi
        .spyOn(TestBed.inject(MatDialog), 'open')
        .mockReturnValueOnce({
          afterClosed: () => ({
            subscribe: (fn: (result: unknown) => Promise<void>) => {
              onClose = fn;
            },
          }),
        } as any);
      return { open, close: (result: unknown) => onClose(result) };
    }

    it('should explain that this is a correction with no history or notifications', () => {
      const { open } = pendingDialog();

      component.markSplitPaidUnpaid(expense(), split(false));

      expect(open).toHaveBeenCalledWith(
        ConfirmDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({
            dialogTitle: 'Admin Correction',
            confirmButtonText: 'Proceed',
            navButtonText: 'Go to Summary',
            confirmationText: expect.stringContaining(
              'does not create a payment history record'
            ),
          }),
        })
      );
    });

    it('should send the user to the Summary page when they choose that instead', async () => {
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const dialog = pendingDialog();
      component.markSplitPaidUnpaid(expense(), split(false));

      await dialog.close('navigate');

      expect(navigate).toHaveBeenCalledWith(['/analysis/summary']);
      expect(mockSplitService.updateSplit).not.toHaveBeenCalled();
    });

    it.each([
      ['an expense with no reference', { id: 'exp-1' }, { paid: false, ref: splitRef }],
      ['a split with no reference', { id: 'exp-1', ref: expenseRef }, { paid: false }],
    ])('should change nothing for %s', async (_name, exp, spl) => {
      const dialog = pendingDialog();
      component.markSplitPaidUnpaid(exp as any, spl as any);
      loadingService().loadingOn.mockClear();

      await dialog.close(true);

      expect(mockSplitService.updateSplit).not.toHaveBeenCalled();
      expect(loadingService().loadingOn).not.toHaveBeenCalled();
    });

    it('should mark an unpaid split paid, reload the list and say so', async () => {
      mockExpenseService.getGroupExpensesByDateRange.mockClear();
      const dialog = pendingDialog();
      component.markSplitPaidUnpaid(expense(), split(false));

      await dialog.close(true);

      expect(mockSplitService.updateSplit).toHaveBeenCalledWith(
        'group-1',
        expenseRef,
        splitRef,
        { paid: true }
      );
      expect(mockExpenseService.getGroupExpensesByDateRange).toHaveBeenCalledOnce();
      expect(snackbar().openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Split marked as paid')
      );
    });

    it('should mark a paid split unpaid', async () => {
      const dialog = pendingDialog();
      component.markSplitPaidUnpaid(expense(), split(true));

      await dialog.close(true);

      expect(mockSplitService.updateSplit).toHaveBeenCalledWith(
        'group-1',
        expenseRef,
        splitRef,
        { paid: false }
      );
      expect(snackbar().openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Split marked as unpaid')
      );
    });

    it('should apologise and not reload when the update fails', async () => {
      mockSplitService.updateSplit.mockRejectedValueOnce(new Error('denied'));
      mockExpenseService.getGroupExpensesByDateRange.mockClear();
      const dialog = pendingDialog();
      component.markSplitPaidUnpaid(expense(), split(false));
      loadingService().loadingOff.mockClear();

      await dialog.close(true);

      expect(snackbar().openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Something went wrong. Please try again.')
      );
      expect(mockExpenseService.getGroupExpensesByDateRange).not.toHaveBeenCalled();
      expect(loadingService().loadingOff).toHaveBeenCalledOnce();
    });
  });

  describe('copyExpenseSummaryToClipboard', () => {
    const alice = mockDocRef('groups/group-1/members/alice');
    const bob = mockDocRef('groups/group-1/members/bob');
    const aliceMember = mockMember({ id: 'alice', displayName: 'Alice', ref: alice });
    const bobMember = mockMember({ id: 'bob', displayName: 'Bob', ref: bob });
    let writeText: ReturnType<typeof vi.fn>;

    function split(init: Partial<Split>): Split {
      return new Split({
        assignedAmount: 0,
        percentage: 0,
        shares: 0,
        paid: false,
        ...init,
      });
    }

    function summaryOf(init: Partial<Expense>): Expense {
      return new Expense({
        id: 'exp-1',
        date: new Date(2025, 2, 9),
        description: 'Dinner',
        category: new Category({ name: 'Food' }),
        paidByMember: aliceMember,
        paidByMemberRef: alice,
        totalAmount: 100,
        sharedAmount: 0,
        allocatedAmount: 0,
        splitMethod: 'amount',
        ...init,
      });
    }

    // "name:" then padding so the amounts line up on the right
    const row = (text: string, amount: string, width: number) =>
      `${text}:${' '.repeat(width - text.length - amount.length)}${amount}`;

    async function copied(expense: Expense): Promise<string> {
      await component.copyExpenseSummaryToClipboard(expense);
      return writeText.mock.calls[0]![0] as string;
    }

    beforeEach(() => {
      writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      delete (navigator as any).clipboard;
    });

    it('should break an amount split into personal, shared and proportional parts, aligned', async () => {
      const text = await copied(
        summaryOf({
          sharedAmount: 40,
          allocatedAmount: 10,
          splits: [
            split({
              owedByMember: aliceMember,
              owedByMemberRef: alice,
              assignedAmount: 30,
              allocatedAmount: 55.56,
              paid: true,
            }),
            split({
              owedByMember: bobMember,
              owedByMemberRef: bob,
              assignedAmount: 20,
              allocatedAmount: 44.44,
            }),
          ],
        })
      );

      expect(text.split('\n')).toEqual([
        `Date: ${new Date(2025, 2, 9).toLocaleDateString()}`,
        'Description: Dinner',
        'Category: Food',
        'Paid by: Alice',
        'Total: $ 100.00',
        'Evenly shared amount: $ 40.00',
        'Proportional amount (tax, tip, etc.): $ 10.00',
        '='.repeat(23),
        // the payer's own share has no paid status
        row('Alice', '$ 55.56', 22),
        row('  Personal', '$ 30.00', 22),
        row('  Shared', '$ 20.00', 22),
        row('  Proportional', '$ 5.56', 22),
        row('Bob (Unpaid)', '$ 44.44', 22),
        row('  Personal', '$ 20.00', 22),
        row('  Shared', '$ 20.00', 22),
        row('  Proportional', '$ 4.44', 22),
      ]);
    });

    it('should leave out breakdown lines that would be zero', async () => {
      const text = await copied(
        summaryOf({
          splits: [
            split({
              owedByMember: aliceMember,
              owedByMemberRef: alice,
              assignedAmount: 60,
              allocatedAmount: 60,
              paid: true,
            }),
            split({
              owedByMember: bobMember,
              owedByMemberRef: bob,
              assignedAmount: 40,
              allocatedAmount: 40,
              paid: true,
            }),
          ],
        })
      );

      expect(text).not.toContain('Evenly shared');
      expect(text).not.toContain('Proportional');
      expect(text).not.toContain('Shared');
      expect(text.split('\n').slice(-5)).toEqual([
        '='.repeat(20),
        row('Alice', '$ 60.00', 19),
        row('  Personal', '$ 60.00', 19),
        row('Bob (Paid)', '$ 40.00', 19),
        row('  Personal', '$ 40.00', 19),
      ]);
    });

    it('should show each member\'s percentage for a percentage split, without the amount breakdown', async () => {
      const text = await copied(
        summaryOf({
          splitMethod: 'percentage',
          // ignored outside the amount method
          sharedAmount: 100,
          allocatedAmount: 5,
          splits: [
            split({
              owedByMember: aliceMember,
              owedByMemberRef: alice,
              percentage: 60,
              allocatedAmount: 60,
              paid: true,
            }),
            split({
              owedByMember: bobMember,
              owedByMemberRef: bob,
              percentage: 40,
              allocatedAmount: 40,
              paid: true,
            }),
          ],
        })
      );

      expect(text).not.toContain('Evenly shared');
      expect(text).not.toContain('Proportional');
      expect(text.split('\n').slice(-3)).toEqual([
        '='.repeat(26),
        row('Alice (60%)', '$ 60.00', 25),
        row('Bob (Paid) (40%)', '$ 40.00', 25),
      ]);
    });

    it('should show shares and the resulting percentage for a shares split', async () => {
      const text = await copied(
        summaryOf({
          splitMethod: 'shares',
          splits: [
            split({
              owedByMember: aliceMember,
              owedByMemberRef: alice,
              shares: 2,
              percentage: 66.67,
              allocatedAmount: 66.67,
              paid: true,
            }),
            split({
              owedByMember: bobMember,
              owedByMemberRef: bob,
              shares: 1,
              percentage: 0,
              allocatedAmount: 33.33,
            }),
          ],
        })
      );

      const lines = text.split('\n');
      expect(lines.slice(-2)).toEqual([
        row('Alice (2 shares, 66.67%)', '$ 66.67', 33),
        // no percentage worked out yet: just the name and status
        row('Bob (Unpaid)', '$ 33.33', 33),
      ]);
    });

    it('should not divide by zero when the whole amount is proportional', async () => {
      const text = await copied(
        summaryOf({
          totalAmount: 50,
          allocatedAmount: 50,
          splits: [
            split({
              owedByMember: aliceMember,
              owedByMemberRef: alice,
              allocatedAmount: 25,
              paid: true,
            }),
            split({
              owedByMember: bobMember,
              owedByMemberRef: bob,
              allocatedAmount: 25,
              paid: true,
            }),
          ],
        })
      );

      expect(text.split('\n').slice(-3)).toEqual([
        '='.repeat(20),
        row('Alice', '$ 25.00', 19),
        row('Bob (Paid)', '$ 25.00', 19),
      ]);
    });

    it('should confirm that the summary was copied', async () => {
      await component.copyExpenseSummaryToClipboard(summaryOf({ splits: [] }));

      expect(snackbar().openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Expense summary copied to clipboard')
      );
    });

    it('should show and log the reason the clipboard refused', async () => {
      writeText.mockRejectedValueOnce(new Error('not allowed'));

      await component.copyExpenseSummaryToClipboard(summaryOf({ splits: [] }));

      expect(snackbar().openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('not allowed')
      );
      expect(analytics().logError).toHaveBeenCalledWith(
        'Expenses Component',
        'copy_expense_summary_to_clipboard',
        'not allowed'
      );
    });

    it('should use a generic message when the failure is not an Error', async () => {
      writeText.mockRejectedValueOnce('nope');

      await component.copyExpenseSummaryToClipboard(summaryOf({ splits: [] }));

      expect(snackbar().openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Failed to copy expense summary')
      );
      expect(analytics().logError).not.toHaveBeenCalled();
    });
  });

  describe('guided tour samples with real members and categories', () => {
    let memberStore: ReturnType<typeof createMockMemberStore>;
    const ref = (id: string) => mockDocRef(`groups/group-1/members/${id}`);
    const person = (id: string, name: string, groupAdmin = false) =>
      mockMember({ id, displayName: name, groupAdmin, ref: ref(id) });

    beforeEach(() => {
      memberStore = TestBed.inject(MemberStore) as unknown as ReturnType<
        typeof createMockMemberStore
      >;
      vi.spyOn(TestBed.inject(GuidedTourService), 'start').mockImplementation(
        async () => {}
      );
    });

    it("should split the samples with the group's own first two other members", () => {
      const me = person('me', 'Pat', true);
      memberStore.currentMember.set(me);
      memberStore.groupMembers.set([
        person('a', 'Ann'),
        me,
        person('b', 'Ben'),
        person('c', 'Cy'),
      ]);

      component.startTour();

      for (const sample of component.filteredExpenses()) {
        expect(sample.splits.map((s) => s.owedByMember!.displayName)).toEqual([
          'Pat',
          'Ann',
          'Ben',
        ]);
      }
    });

    it('should rotate the sample expenses through the group\'s categories', () => {
      const cats = TestBed.inject(CategoryStore) as unknown as ReturnType<
        typeof createMockCategoryStore
      >;
      const food = new Category({
        id: 'food',
        name: 'Food',
        ref: mockDocRef('groups/group-1/categories/food'),
      });
      const fuel = new Category({
        id: 'fuel',
        name: 'Fuel',
        ref: mockDocRef('groups/group-1/categories/fuel'),
      });
      cats.groupCategories.set([food, fuel]);
      const me = person('me', 'Pat', true);
      memberStore.currentMember.set(me);
      memberStore.groupMembers.set([me]);

      component.startTour();

      // Gas, Dinner out, Groceries
      expect(component.filteredExpenses().map((e) => e.category)).toEqual([
        fuel,
        food,
        food,
      ]);
      expect(component.filteredExpenses().map((e) => e.categoryRef)).toEqual([
        fuel.ref,
        food.ref,
        food.ref,
      ]);
    });

    it('should show no samples when the current member has no reference', () => {
      memberStore.currentMember.set(mockMember({ id: 'me', ref: undefined }));
      component.expenses.set([]);

      component.startTour();

      expect(component.groupHasExpenses()).toBe(false);
      expect(component.filteredExpenses()).toEqual([]);
    });
  });
});
