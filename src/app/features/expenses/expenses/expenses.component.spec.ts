import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { LocaleService } from '@services/locale.service';
import { SortingService } from '@services/sorting.service';
import { SplitService } from '@services/split.service';
import { TableFilterService } from '@services/table-filter.service';
import { TourService } from '@services/tour.service';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockCategoryService,
  createMockCategoryStore,
  createMockDemoService,
  createMockExpenseService,
  createMockExpenseStore,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockSortingService,
  createMockSplitService,
  createMockTourService,
  createMockUserStore,
  mockDocRef,
  mockGroup,
} from '@testing/test-helpers';
import { getStorage } from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpensesComponent } from './expenses.component';

describe('ExpensesComponent', () => {
  let fixture: ComponentFixture<ExpensesComponent>;
  let component: ExpensesComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockExpenseStore: ReturnType<typeof createMockExpenseStore>;
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockSplitService: ReturnType<typeof createMockSplitService>;
  let router: Router;

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
  };

  beforeEach(async () => {
    mockUserStore = createMockUserStore();
    mockGroupStore = createMockGroupStore();
    mockExpenseStore = createMockExpenseStore();
    mockExpenseService = createMockExpenseService();
    mockDemoService = createMockDemoService();
    mockSplitService = createMockSplitService();

    const testGroup = mockGroup({ id: 'group-1', name: 'Test Group' });
    mockGroupStore.currentGroup.set(testGroup);

    await TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: getStorage, useValue: {} },
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: createMockMemberStore() },
        { provide: CategoryStore, useValue: createMockCategoryStore() },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: CategoryService, useValue: createMockCategoryService() },
        { provide: DemoService, useValue: mockDemoService },
        { provide: TourService, useValue: createMockTourService() },
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
    it('should call expenseService.getGroupExpensesByDateRange when not in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      await component.loadExpenses();
      expect(mockExpenseService.getGroupExpensesByDateRange).toHaveBeenCalled();
    });

    it('should use store data in demo mode when store has expenses', async () => {
      // loadExpenses checks userStore.isDemoMode(), not demoService.isInDemoMode()
      mockUserStore.isDemoMode.set(true);
      const testExpense = { id: 'exp-1', description: 'Demo Expense' } as any;
      mockExpenseStore.setGroupExpenses([testExpense]);
      // Clear calls made during component initialization (effect + afterNextRender)
      mockExpenseService.getGroupExpensesByDateRange.mockClear();

      await component.loadExpenses();
      expect(component.expenses()).toContain(testExpense);
      expect(
        mockExpenseService.getGroupExpensesByDateRange
      ).not.toHaveBeenCalled();
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
    it('should navigate to /demo/expenses/add in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onAddExpenseClick();
      expect(navigateSpy).toHaveBeenCalledWith(['/demo/expenses/add']);
    });

    it('should navigate to /expenses/add in normal mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onAddExpenseClick();
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses/add']);
    });
  });

  describe('onRowClick', () => {
    it('should show demo restriction in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.onRowClick({ id: 'exp-1' } as any);
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
    });

    it('should navigate to expense detail in normal mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onRowClick({ id: 'exp-1' } as any);
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses', 'exp-1']);
    });
  });

  describe('markSplitPaidUnpaid', () => {
    it('should show demo restriction in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.markSplitPaidUnpaid(
        { id: 'exp-1' } as any,
        { paid: false } as any
      );
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockSplitService.updateSplit).not.toHaveBeenCalled();
    });

    it('should call splitService.updateSplit in normal mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      const expense = {
        id: 'exp-1',
        ref: mockDocRef('groups/group-1/expenses/exp-1'),
      } as any;
      const split = {
        paid: false,
        ref: mockDocRef('groups/group-1/expenses/exp-1/splits/split-1'),
      } as any;
      await component.markSplitPaidUnpaid(expense, split);
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
