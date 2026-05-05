import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { Expense } from '@models/expense';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CameraService } from '@services/camera.service';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { ExpenseService } from '@services/expense.service';
import { LocaleService } from '@services/locale.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockCalculatorOverlayService,
  createMockCameraService,
  createMockCategoryService,
  createMockCategoryStore,
  createMockDemoService,
  createMockExpenseService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockUserStore,
  mockCategory,
  mockDocRef,
  mockMember,
} from '@testing/test-helpers';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { getStorage } from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditExpenseComponent } from './edit-expense.component';

describe('EditExpenseComponent', () => {
  let fixture: ComponentFixture<EditExpenseComponent>;
  let component: EditExpenseComponent;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let router: Router;

  const memberRef = mockDocRef('groups/group-1/members/member-1');
  const categoryRef = mockDocRef('groups/group-1/categories/cat-1');
  const expenseRef = mockDocRef('groups/group-1/expenses/exp-1');
  const splitMemberRef = mockDocRef('groups/group-1/members/member-2');
  const splitRef = mockDocRef('groups/group-1/expenses/exp-1/splits/split-1');

  const testExpense = new Expense({
    id: 'exp-1',
    date: new Date('2024-06-15'),
    description: 'Team Lunch',
    categoryRef,
    paidByMemberRef: memberRef,
    sharedAmount: 100,
    allocatedAmount: 100,
    totalAmount: 100,
    splitMethod: 'amount',
    receiptPath: null,
    splits: [
      {
        id: 'split-1',
        owedByMemberRef: splitMemberRef,
        assignedAmount: 100,
        percentage: 0,
        shares: 0,
        allocatedAmount: 100,
        paid: false,
        ref: splitRef,
      } as any,
    ],
    ref: expenseRef,
  });

  beforeEach(async () => {
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockExpenseService = createMockExpenseService();
    mockDemoService = createMockDemoService();
    mockDialog = createMockMatDialog();

    mockExpenseService.updateExpense.mockResolvedValue(undefined);
    mockExpenseService.deleteExpense.mockResolvedValue(undefined);

    const testMember = mockMember({ displayName: 'Alice' });
    const testSplitMember = mockMember({
      id: 'member-2',
      displayName: 'Bob',
      ref: splitMemberRef,
    });

    mockMemberStore.groupMembers.set([testMember, testSplitMember]);
    mockCategoryStore.groupCategories.set([
      mockCategory({ id: 'cat-1', name: 'Food', active: true }),
    ]);

    const mockRoute = {
      snapshot: {
        data: { expense: testExpense },
      },
    };

    await TestBed.configureTestingModule({
      imports: [EditExpenseComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: getStorage, useValue: {} },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: GroupStore, useValue: createMockGroupStore() },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: UserStore, useValue: createMockUserStore() },
        { provide: DemoService, useValue: mockDemoService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: MatDialog, useValue: mockDialog },
        {
          provide: CalculatorOverlayService,
          useValue: createMockCalculatorOverlayService(),
        },
        { provide: CategoryService, useValue: createMockCategoryService() },
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: CameraService, useValue: createMockCameraService() },
        LocaleService,
        StringUtils,
        AllocationUtilsService,
        DecimalPipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditExpenseComponent);
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

  describe('form pre-population', () => {
    it('should pre-populate description from expense data', () => {
      expect(component.e.description.value).toBe('Team Lunch');
    });

    it('should pre-populate amount from expense data', () => {
      expect(component.e.amount.value).toBe(100);
    });

    it('should load expense from route data', () => {
      expect(component.expense().description).toBe('Team Lunch');
    });

    it('should pre-populate splits from expense data', () => {
      expect(component.splitsFormArray.length).toBe(1);
    });
  });

  describe('addSplit / removeSplit', () => {
    it('should add a split row', () => {
      component.addSplit();
      expect(component.splitsFormArray.length).toBe(2);
    });

    it('should remove a split row', () => {
      component.removeSplit(0);
      expect(component.splitsFormArray.length).toBe(0);
    });
  });

  describe('onSubmit', () => {
    it('should show demo restriction in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.onSubmit();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockExpenseService.updateExpense).not.toHaveBeenCalled();
    });

    it('should open confirmation dialog when not in demo mode', async () => {
      // EditExpenseComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
      // Full form-submission flow (updateExpense + navigation after confirm) is better
      // covered by integration/e2e tests since it requires date extensions, group context, etc.
      mockDemoService.isInDemoMode.mockReturnValue(false);
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({
            subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          }),
        });
      await component.onSubmit();
      expect(dialogSpy).toHaveBeenCalled();
    });
  });

  describe('onDelete', () => {
    it('should show demo restriction in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.onDelete();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
    });

    it('should open delete dialog when not in demo mode', () => {
      // EditExpenseComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
      mockDemoService.isInDemoMode.mockReturnValue(false);
      const dialogSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({
          afterClosed: () => ({
            subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
          }),
        });
      component.onDelete();
      expect(dialogSpy).toHaveBeenCalled();
    });
  });

  describe('onCancel', () => {
    it('should navigate to /expenses', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onCancel();
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses']);
    });
  });

  describe('split method', () => {
    it('should default splitMethod to amount', () => {
      expect(component.splitMethod()).toBe('amount');
    });

    it('should allow setting splitMethod to percentage', () => {
      component.splitMethod.set('percentage');
      expect(component.splitMethod()).toBe('percentage');
    });

    it('should allow setting splitMethod back to amount', () => {
      component.splitMethod.set('percentage');
      component.splitMethod.set('amount');
      expect(component.splitMethod()).toBe('amount');
    });

    it('should allocate by shares correctly', async () => {
      // The form starts with 1 pre-loaded split; add a second
      component.splitMethod.set('shares');
      component.addSplit();

      component.splitsFormArray.at(0).patchValue({ owedByMemberRef: splitMemberRef, shares: 1 });
      component.splitsFormArray.at(1).patchValue({ owedByMemberRef: memberRef, shares: 3 });

      component.editExpenseForm.patchValue({ amount: 100 });

      component.allocateByShares();
      await fixture.whenStable();

      expect(component.splitsFormArray.at(0).value.allocatedAmount).toBe(25);
      expect(component.splitsFormArray.at(1).value.allocatedAmount).toBe(75);
    });
  });
});
