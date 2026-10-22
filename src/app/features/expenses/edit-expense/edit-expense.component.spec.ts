import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { DeleteDialogComponent } from '@components/delete-dialog/delete-dialog.component';
import { FileSelectionDialogComponent } from '@components/file-selection-dialog/file-selection-dialog.component';
import { ReceiptDialogComponent } from '@components/receipt-dialog/receipt-dialog.component';
import { RentalEditDialogComponent } from '@features/expenses/rental/rental-edit-dialog/rental-edit-dialog.component';
import {
  Expense,
  ExpenseForm,
  ExpenseSplitItemForm,
  RentalDetails,
} from '@models/expense';
import { AnalyticsService } from '@services/analytics.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CameraService } from '@services/camera.service';
import { CategoryService } from '@services/category.service';
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
  createMockExpenseService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockUserStore,
  mockCategory,
  mockDocRef,
  mockGroup,
  mockMember,
  mockUser,
} from '@testing/test-helpers';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { FirebaseError } from 'firebase/app';
import * as storageModule from 'firebase/storage';
import { getStorage } from 'firebase/storage';
import { GuidedTourConfig } from '@models/guided-tour';
import { GuidedTourService } from '@services/guided-tour.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditExpenseComponent } from './edit-expense.component';
import { expectEnterEndsOnSave } from '@testing/default-button';

describe('EditExpenseComponent', () => {
  let fixture: ComponentFixture<EditExpenseComponent>;
  let component: EditExpenseComponent;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockCamera: ReturnType<typeof createMockCameraService>;
  let mockRoute: { snapshot: { data: { expense: Expense } } };
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

  function getModel(): ExpenseForm {
    return {
      ...(component as any).expenseModel(),
      ...(component as any).expenseFormData(),
    };
  }

  function patchFormData(
    patch: Partial<Pick<ExpenseForm, 'date' | 'amount' | 'description' | 'allocatedAmount'>>
  ): void {
    (component as any).expenseFormData.update((fd: any) => ({ ...fd, ...patch }));
  }

  function patchSplit(index: number, patch: Partial<ExpenseSplitItemForm>): void {
    (component as any).expenseModel.update((m: ExpenseForm) => ({
      ...m,
      splits: m.splits.map((s: ExpenseSplitItemForm, i: number) =>
        i === index ? { ...s, ...patch } : s
      ),
    }));
  }

  beforeEach(async () => {
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockExpenseService = createMockExpenseService();
    mockDialog = createMockMatDialog();
    mockGroupStore = createMockGroupStore();
    mockGroupStore.currentGroup.set(mockGroup());
    mockUserStore = createMockUserStore();
    mockSnackBar = createMockSnackBar();
    mockAnalytics = createMockAnalyticsService();
    mockLoading = createMockLoadingService();
    mockCamera = createMockCameraService();

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

    mockRoute = {
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
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: UserStore, useValue: mockUserStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: LoadingService, useValue: mockLoading },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: MatDialog, useValue: mockDialog },
        {
          provide: CalculatorOverlayService,
          useValue: createMockCalculatorOverlayService(),
        },
        { provide: CategoryService, useValue: createMockCategoryService() },
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: CameraService, useValue: mockCamera },
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
      expect(getModel().description).toBe('Team Lunch');
    });

    it('should pre-populate amount from expense data', () => {
      expect(getModel().amount).toBe('100.00');
    });

    it('should load expense from route data', () => {
      expect(component.expense().description).toBe('Team Lunch');
    });

    it('should pre-populate splits from expense data', () => {
      expect(getModel().splits).toHaveLength(1);
    });
  });

  describe('model split operations', () => {
    it('should add a split row', () => {
      component.addSplit();
      expect(getModel().splits).toHaveLength(2);
    });

    it('should remove a split row', () => {
      component.removeSplit(0);
      expect(getModel().splits).toHaveLength(0);
    });
  });

  describe('onSubmit', () => {
    it('should open confirmation dialog', async () => {
      // EditExpenseComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
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
    it('should open delete dialog', () => {
      // EditExpenseComponent imports MatDialogModule which overrides the test-level mock,
      // so we spy directly on the component's injected dialog instance.
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
    it('should initialize splitMethod from expense data', () => {
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
      component.splitMethod.set('shares');
      component.addSplit();

      patchSplit(0, { owedByMemberRef: splitMemberRef, shares: 1 });
      patchSplit(1, { owedByMemberRef: memberRef, shares: 3 });
      patchFormData({ amount: '100.00' });

      component.allocateByShares();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(25);
      expect(getModel().splits[1]!.allocatedAmount).toBe(75);
    });
  });
  describe('guided tour', () => {
    let tourConfig: GuidedTourConfig;
    let startSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      startSpy = vi
        .spyOn(TestBed.inject(GuidedTourService), 'start')
        .mockImplementation(async (config) => {
          tourConfig = config;
        });
    });

    const runStep = async (id: string) =>
      tourConfig.steps.find((s) => s.id === id)!.beforeShow?.();

    it('should start the edit-expense tour from the help icon', () => {
      fixture.nativeElement
        .querySelector('[data-testid="edit-expense-help-button"]')
        .click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('edit-expense');
    });

    it('should open the full help from the last step', () => {
      const openSpy = vi
        .spyOn((component as any)['dialog'], 'open')
        .mockReturnValue({} as any);
      component.startTour();

      tourConfig.fullHelp!();

      expect(openSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ data: { sectionId: 'add-edit-expenses' } })
      );
    });

    it('should restore the unsaved-changes state when the tour ends', async () => {
      (component as any).modelDirty.set(false);
      const model = (component as any).expenseModel();
      component.startTour();

      await runStep('splits-shares');
      tourConfig.onEnd!('closed');

      expect((component as any).expenseModel()).toBe(model);
      expect((component as any).modelDirty()).toBe(false);
    });

    it('should count a split method change as an unsaved change', () => {
      (component as any).modelDirty.set(false);
      component.onSplitMethodChange();
      expect((component as any).modelDirty()).toBe(true);
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });

  it("should end the form's Enter order on Save", () => {
    expectEnterEndsOnSave(fixture);
  });

  describe('remainderValid', () => {
    function setAmounts(total: string, sharedAmount: number): void {
      (component as any).expenseFormData.update((fd: any) => ({ ...fd, amount: total }));
      (component as any).expenseModel.update((m: any) => ({ ...m, sharedAmount }));
    }

    it('should accept a remainder that fits within the total', () => {
      setAmounts('90.00', 10);

      expect(component.remainderValid()).toBe(true);
    });

    it('should reject member amounts that add up to more than the total', () => {
      // Total 90 with a member amount of 100 leaves -10 to share evenly.
      setAmounts('90.00', -10);

      expect(component.remainderValid()).toBe(false);
    });

    it('should ignore the remainder outside the amount split method', () => {
      setAmounts('90.00', -10);
      component.splitMethod.set('percentage');

      expect(component.remainderValid()).toBe(true);
    });
  });

  // EditExpenseComponent imports MatDialogModule, which overrides the
  // test-level MatDialog mock, so dialogs are stubbed on the component's own
  // instance. `dialogResults` answers each open() with the next result at once;
  // `pendingDialog` holds the afterClosed callback so a test can await the
  // async handler that runs when the dialog closes.
  function dialogResults(...results: unknown[]) {
    const open = vi.spyOn((component as any)['dialog'], 'open');
    for (const result of results) {
      open.mockReturnValueOnce({
        afterClosed: () => ({
          subscribe: (fn: (value: unknown) => void) => fn(result),
        }),
      } as any);
    }
    return open;
  }

  function pendingDialog() {
    let onClose!: (value: unknown) => Promise<void>;
    const open = vi.spyOn((component as any)['dialog'], 'open').mockReturnValue({
      afterClosed: () => ({
        subscribe: (fn: (value: unknown) => Promise<void>) => {
          onClose = fn;
        },
      }),
    } as any);
    return { open, close: (value: unknown) => onClose(value) };
  }

  const snackbarMessage = (message: string) => [
    CustomSnackbarComponent,
    { data: { message } },
  ];

  describe('categories and members offered', () => {
    it("should keep the expense's own category and payer even when they are inactive", () => {
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'cat-1', name: 'Retired', active: false }),
        mockCategory({
          id: 'cat-2',
          name: 'Other retired',
          active: false,
          ref: mockDocRef('groups/group-1/categories/cat-2'),
        }),
        mockCategory({
          id: 'cat-3',
          name: 'Current',
          ref: mockDocRef('groups/group-1/categories/cat-3'),
        }),
      ]);
      mockMemberStore.groupMembers.set([
        mockMember({ id: 'member-1', displayName: 'Payer', active: false }),
        mockMember({
          id: 'member-2',
          displayName: 'Bob',
          ref: splitMemberRef,
        }),
        mockMember({
          id: 'member-3',
          displayName: 'Gone',
          active: false,
          ref: mockDocRef('groups/group-1/members/member-3'),
        }),
      ]);

      expect(component.categories().map((c) => c.name)).toEqual([
        'Retired',
        'Current',
      ]);
      expect(component.expenseMembers().map((m) => m.displayName)).toEqual([
        'Payer',
        'Bob',
      ]);
    });

    it('should offer an inactive member only while they are still in a split', () => {
      mockMemberStore.groupMembers.set([
        mockMember({ id: 'member-1', displayName: 'Alice' }),
        mockMember({
          id: 'member-2',
          displayName: 'Bob (left)',
          active: false,
          ref: splitMemberRef,
        }),
        mockMember({
          id: 'member-3',
          displayName: 'Gone',
          active: false,
          ref: mockDocRef('groups/group-1/members/member-3'),
        }),
      ]);

      expect(component.splitMembers().map((m) => m.displayName)).toEqual([
        'Alice',
        'Bob (left)',
      ]);
    });
  });

  describe('form validity and dirty state', () => {
    it('should start clean and become dirty when a split field changes', () => {
      expect((component as any).isFormDirty()).toBe(false);

      (component as any).updateSplit(0, 'assignedAmount', '12.00');

      expect((component as any).isFormDirty()).toBe(true);
      expect(getModel().splits[0]!.assignedAmount).toBe('12.00');
    });

    it('should flag a zero total and accept a non-zero one', () => {
      const amountErrors = () =>
        (component as any)
          .expenseForm.amount()
          .errors()
          .map((e: { kind: string }) => e.kind);

      expect(amountErrors()).toEqual([]);

      patchFormData({ amount: '0.00' });

      expect(amountErrors()).toEqual(['zeroAmount']);
    });

    it('should change only the row that was edited', () => {
      component.addSplit();
      const untouched = getModel().splits[0]!.assignedAmount;

      (component as any).updateSplit(1, 'shares', 4);

      expect(getModel().splits.map((s) => s.shares)).toEqual([0, 4]);
      expect(getModel().splits[0]!.assignedAmount).toBe(untouched);
    });

    it('should require a payer and a category', () => {
      expect((component as any).paidByMemberValid()).toBe(true);
      expect((component as any).categoryValid()).toBe(true);

      (component as any).expenseModel.update((m: any) => ({
        ...m,
        paidByMember: null,
        category: null,
      }));

      expect((component as any).paidByMemberValid()).toBe(false);
      expect((component as any).categoryValid()).toBe(false);
    });

    it('should reject splits with no member chosen and an empty split list', () => {
      expect((component as any).splitsValid()).toBe(true);

      patchSplit(0, { owedByMemberRef: null });
      expect((component as any).splitsValid()).toBe(false);

      component.removeSplit(0);
      expect((component as any).splitsValid()).toBe(false);
    });
  });

  describe('split rows', () => {
    it('should give a new split the first member not already in a split', () => {
      component.addSplit();

      expect(getModel().splits).toHaveLength(2);
      expect(getModel().splits[1]!.owedByMemberRef!.path).toBe(memberRef.path);
      expect((component as any).modelDirty()).toBe(true);
    });

    it('should leave a new split without a member once everyone has one', () => {
      component.addSplit();
      component.addSplit();

      expect(getModel().splits).toHaveLength(3);
      expect(getModel().splits[2]!.owedByMemberRef).toBeNull();
    });

    it('should not offer a member already chosen in another split', () => {
      component.addSplit();

      expect(
        component.availableMembersForSplit(0).map((m) => m.displayName)
      ).toEqual(['Bob']);
      expect(
        component.availableMembersForSplit(1).map((m) => m.displayName)
      ).toEqual(['Alice']);
    });

    it('should work out each row\'s share of the total shares', () => {
      patchSplit(0, { shares: 1 });
      component.addSplit();
      patchSplit(1, { shares: 3 });

      expect((component as any).effectivePercentage(0)).toBe(25);
      expect((component as any).effectivePercentage(1)).toBe(75);
    });

    it('should show 0% when nobody has any shares', () => {
      expect((component as any).effectivePercentage(0)).toBe(0);
    });

    it('should only treat the last row as automatic in the percentage method', () => {
      component.addSplit();

      expect(component.isLastSplit(1)).toBe(false);

      component.splitMethod.set('percentage');

      expect(component.isLastSplit(0)).toBe(false);
      expect(component.isLastSplit(1)).toBe(true);
    });
  });

  describe('allocation by split method', () => {
    function twoSplits(): void {
      component.addSplit();
      patchSplit(0, { owedByMemberRef: splitMemberRef, assignedAmount: '0.00' });
      patchSplit(1, { owedByMemberRef: memberRef });
      patchFormData({ amount: '100.00', allocatedAmount: '0.00' });
    }

    it('should share the remainder after fixed amounts in the amount method', () => {
      twoSplits();
      patchSplit(1, { assignedAmount: '20.00' });

      component.updateTotalAmount();

      expect(getModel().splits.map((s) => s.allocatedAmount)).toEqual([40, 60]);
      expect(getModel().sharedAmount).toBe(80);
    });

    it('should recalculate by percentage and balance the last row to 100%', () => {
      twoSplits();
      component.splitMethod.set('percentage');
      patchSplit(0, { percentage: 30 });
      patchSplit(1, { percentage: 5 });

      component.updateTotalAmount();

      expect(getModel().splits.map((s) => s.percentage)).toEqual([30, 70]);
      expect(getModel().splits.map((s) => s.allocatedAmount)).toEqual([30, 70]);
    });

    it('should recalculate by shares when the total changes', () => {
      twoSplits();
      component.splitMethod.set('shares');
      patchSplit(0, { shares: 1 });
      patchSplit(1, { shares: 3 });
      patchFormData({ amount: '200.00' });

      component.updateTotalAmount();

      expect(getModel().splits.map((s) => s.allocatedAmount)).toEqual([50, 150]);
    });

    it('should give the remaining row everything when a percentage row is removed', () => {
      twoSplits();
      component.splitMethod.set('percentage');
      patchSplit(0, { percentage: 30 });
      patchSplit(1, { percentage: 70 });
      component.updateTotalAmount();

      component.removeSplit(0);

      expect(getModel().splits).toHaveLength(1);
      expect(getModel().splits[0]!.percentage).toBe(100);
      expect(getModel().splits[0]!.allocatedAmount).toBe(100);
    });

    it('should not allocate by percentage or shares when there are no splits', () => {
      component.removeSplit(0);
      const before = (component as any).expenseModel();

      component.allocateByPercentage();
      component.allocateByShares();

      expect((component as any).expenseModel()).toBe(before);
    });

    it('should report whether the allocations add up to the total', () => {
      expect(component.expenseFullyAllocated()).toBe(true);
      expect(component.assignedTotal()).toBe(100);
      expect(component.allocatedTotal()).toBe(100);

      patchFormData({ amount: '120.00' });

      expect(component.expenseFullyAllocated()).toBe(false);
    });
  });

  describe('calculator', () => {
    function openWith(field: 'amount' | 'allocatedAmount', index?: number) {
      const overlay = TestBed.inject(CalculatorOverlayService) as any;
      const target = document.createElement('input');
      component.openCalculator({ target } as unknown as Event, field, index);
      expect(overlay.openCalculator).toHaveBeenCalledWith(
        target,
        expect.any(Function)
      );
      return overlay.openCalculator.mock.lastCall[1] as (n: number) => void;
    }

    it('should put a calculated form amount in the field, formatted, and reallocate', () => {
      const done = openWith('amount');

      done(60.5);

      expect(getModel().amount).toBe('60.50');
      // the single split now carries the whole new total
      expect(getModel().splits[0]!.allocatedAmount).toBe(60.5);
    });

    it("should put a calculated amount in the split row it was opened for", () => {
      component.addSplit();
      const done = openWith('amount', 1);

      done(12);

      expect(getModel().splits[1]!.assignedAmount).toBe('12.00');
      expect(getModel().splits[0]!.assignedAmount).toBe('100.00');
    });
  });

  describe('receipt retrieval on open', () => {
    const receiptExpense = new Expense({
      id: 'exp-2',
      date: new Date(2024, 5, 15),
      description: 'With receipt',
      categoryRef,
      paidByMemberRef: memberRef,
      sharedAmount: 10,
      allocatedAmount: 0,
      totalAmount: 10,
      splitMethod: 'amount',
      receiptPath: 'groups/group-1/receipts/exp-2.pdf',
      splits: [],
      ref: mockDocRef('groups/group-1/expenses/exp-2'),
    });

    function openWithReceipt(): EditExpenseComponent {
      mockRoute.snapshot.data.expense = receiptExpense;
      return TestBed.createComponent(EditExpenseComponent).componentInstance;
    }

    it('should show the receipt link once its download URL resolves', async () => {
      vi.spyOn(storageModule, 'getDownloadURL').mockResolvedValue(
        'https://files/receipt.pdf'
      );

      const opened = openWithReceipt();

      await vi.waitFor(() =>
        expect(opened.receiptUrl()).toBe('https://files/receipt.pdf')
      );
    });

    it('should show no receipt link when Storage returns an empty URL', async () => {
      const download = vi
        .spyOn(storageModule, 'getDownloadURL')
        .mockResolvedValue('');

      const opened = openWithReceipt();

      await vi.waitFor(() => expect(download).toHaveBeenCalled());
      await Promise.resolve();
      // still the untouched default, not overwritten with an empty string
      expect(opened.receiptUrl()).toBeNull();
    });

    it('should tell the user and log it when the receipt file is gone', async () => {
      vi.spyOn(storageModule, 'getDownloadURL').mockRejectedValue(
        new FirebaseError('storage/object-not-found', 'Receipt not found')
      );

      openWithReceipt();

      await vi.waitFor(() =>
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          ...snackbarMessage('Receipt not found')
        )
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Edit Expense Component',
        'firebase_receipt_retrieval',
        'Receipt not found'
      );
    });

    it('should only log an event, with no snackbar, for any other Firebase storage error', async () => {
      vi.spyOn(storageModule, 'getDownloadURL').mockRejectedValue(
        new FirebaseError('storage/unauthorized', 'No access')
      );

      openWithReceipt();

      await vi.waitFor(() =>
        expect(mockAnalytics.logEvent).toHaveBeenCalledWith(
          'receipt-retrieval-error'
        )
      );
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });

    it('should show a plain error message and log it', async () => {
      vi.spyOn(storageModule, 'getDownloadURL').mockRejectedValue(
        new Error('network down')
      );

      openWithReceipt();

      await vi.waitFor(() =>
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          ...snackbarMessage('network down')
        )
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Edit Expense Component',
        'firebase_receipt_retrieval',
        'network down'
      );
    });

    it('should fall back to a generic message for a non-error rejection', async () => {
      vi.spyOn(storageModule, 'getDownloadURL').mockRejectedValue('nope');

      openWithReceipt();

      await vi.waitFor(() =>
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          ...snackbarMessage('Something went wrong - could not retrieve receipt')
        )
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('should not ask Storage for anything when the expense has no receipt', () => {
      const downloadSpy = vi.spyOn(storageModule, 'getDownloadURL');

      TestBed.createComponent(EditExpenseComponent);

      expect(downloadSpy).not.toHaveBeenCalled();
    });
  });

  describe('attaching a receipt', () => {
    const pdf = () => new File(['pdf'], 'receipt.pdf', { type: 'application/pdf' });

    afterEach(() => {
      delete (navigator as any).clipboard;
    });

    function fileEvent(file?: File): Event {
      return { target: { files: file ? [file] : [] } } as unknown as Event;
    }

    it('should attach a selected file and count it as a change', () => {
      const file = pdf();

      component.onFileSelected(fileEvent(file));

      expect(component.receiptFile()).toBe(file);
      expect(component.fileName()).toBe('receipt.pdf');
      expect((component as any).modelDirty()).toBe(true);
    });

    it('should ignore a file-picker change that selected nothing', () => {
      component.onFileSelected(fileEvent());

      expect(component.receiptFile()).toBeNull();
      expect((component as any).modelDirty()).toBe(false);
    });

    it('should reject a file over 5MB and say so', () => {
      const big = pdf();
      Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 });

      component.onFileSelected(fileEvent(big));

      expect(component.receiptFile()).toBeNull();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('File is too large. File size limited to 5MB')
      );
    });

    it('should accept a file of exactly 5MB', () => {
      const edge = pdf();
      Object.defineProperty(edge, 'size', { value: 5 * 1024 * 1024 });

      component.onFileSelected(fileEvent(edge));

      expect(component.receiptFile()).toBe(edge);
    });

    it('should detach the file and count it as a change', () => {
      component.onFileSelected(fileEvent(pdf()));
      (component as any).modelDirty.set(false);

      component.removeFile();

      expect(component.receiptFile()).toBeNull();
      expect(component.fileName()).toBe('');
      expect((component as any).modelDirty()).toBe(true);
    });

    describe('openFileSelectionDialog', () => {
      it('should stop at the receipt policy when the user has not accepted it', async () => {
        const open = dialogResults(false);

        await component.openFileSelectionDialog();

        expect(open).toHaveBeenCalledOnce();
        expect(open.mock.calls[0]![0]).toBe(ReceiptDialogComponent);
        expect(mockCamera.takePicture).not.toHaveBeenCalled();
      });

      it('should go on to choose a file once the policy is accepted', async () => {
        const file = pdf();
        mockCamera.selectFromGallery.mockResolvedValue(file);
        const open = dialogResults(true, 'gallery');

        await component.openFileSelectionDialog();

        expect(open.mock.calls.map((c) => c[0])).toEqual([
          ReceiptDialogComponent,
          FileSelectionDialogComponent,
        ]);
        expect(component.receiptFile()).toBe(file);
        expect(component.fileName()).toBe('receipt.pdf');
      });

      it('should skip the policy for a user who already accepted it, and tell the dialog about the camera', async () => {
        mockUserStore.user.set(mockUser({ receiptPolicy: true }));
        mockCamera.isAvailable.mockReturnValue(true);
        const file = pdf();
        mockCamera.takePicture.mockResolvedValue(file);
        const open = dialogResults('camera');

        await component.openFileSelectionDialog();

        expect(open).toHaveBeenCalledOnce();
        expect(open).toHaveBeenCalledWith(
          FileSelectionDialogComponent,
          expect.objectContaining({ data: { isNativePlatform: true } })
        );
        expect(component.receiptFile()).toBe(file);
      });

      it('should change nothing when the file chooser is dismissed', async () => {
        mockUserStore.user.set(mockUser({ receiptPolicy: true }));
        dialogResults(null);

        await component.openFileSelectionDialog();

        expect(component.receiptFile()).toBeNull();
        expect(mockCamera.takePicture).not.toHaveBeenCalled();
        expect(mockCamera.selectFromGallery).not.toHaveBeenCalled();
      });

      it('should attach nothing when the camera returns no picture', async () => {
        mockUserStore.user.set(mockUser({ receiptPolicy: true }));
        mockCamera.takePicture.mockResolvedValue(null);
        dialogResults('camera');

        await component.openFileSelectionDialog();

        expect(component.receiptFile()).toBeNull();
        expect((component as any).modelDirty()).toBe(false);
      });

      it('should open the native file picker for the file option', async () => {
        mockUserStore.user.set(mockUser({ receiptPolicy: true }));
        const clickSpy = vi
          .spyOn(HTMLInputElement.prototype, 'click')
          .mockImplementation(() => {});
        dialogResults('file');

        await component.openFileSelectionDialog();

        expect(clickSpy).toHaveBeenCalledOnce();
        expect(
          (clickSpy.mock.contexts[0] as HTMLInputElement).getAttribute('type')
        ).toBe('file');
      });

      it('should report a failure to get a picture', async () => {
        mockUserStore.user.set(mockUser({ receiptPolicy: true }));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mockCamera.selectFromGallery.mockRejectedValue(new Error('denied'));
        dialogResults('gallery');

        await component.openFileSelectionDialog();

        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          ...snackbarMessage('Failed to select file. Please try again')
        );
        expect(component.receiptFile()).toBeNull();
      });

      describe('from the clipboard', () => {
        function clipboardReads(read: () => Promise<unknown>): void {
          Object.defineProperty(navigator, 'clipboard', {
            value: { read },
            configurable: true,
            writable: true,
          });
        }

        beforeEach(() => {
          mockUserStore.user.set(mockUser({ receiptPolicy: true }));
        });

        it('should attach a pasted image under a generated name', async () => {
          const blob = new Blob(['img'], { type: 'image/jpeg' });
          clipboardReads(async () => [
            { types: ['text/plain'], getType: vi.fn() },
            {
              types: ['text/html', 'image/jpeg'],
              getType: vi.fn().mockResolvedValue(blob),
            },
          ]);
          dialogResults('clipboard');

          await component.openFileSelectionDialog();

          expect(component.fileName()).toBe('pasted-receipt.jpeg');
          expect(component.receiptFile()!.type).toBe('image/jpeg');
        });

        it('should say so when the clipboard holds no image', async () => {
          clipboardReads(async () => [
            { types: ['text/plain'], getType: vi.fn() },
          ]);
          dialogResults('clipboard');

          await component.openFileSelectionDialog();

          expect(component.receiptFile()).toBeNull();
          expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
            ...snackbarMessage('No image found in clipboard.')
          );
        });

        it('should point to permissions when the clipboard cannot be read', async () => {
          vi.spyOn(console, 'error').mockImplementation(() => {});
          clipboardReads(() => Promise.reject(new Error('blocked')));
          dialogResults('clipboard');

          await component.openFileSelectionDialog();

          expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
            ...snackbarMessage(
              'Unable to read from clipboard. Please check permissions.'
            )
          );
        });
      });
    });
  });

  describe('saving an edit', () => {
    const memberRefCurrent = memberRef;
    let navigateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      patchFormData({ date: new Date(2024, 5, 15) });
    });

    it('should warn that all splits become unpaid before saving', async () => {
      const { open } = pendingDialog();

      await component.onSubmit();

      expect(open).toHaveBeenCalledWith(
        ConfirmDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({
            confirmationText: expect.stringContaining('mark all splits as unpaid'),
          }),
        })
      );
    });

    it('should save nothing when the confirmation is declined', async () => {
      const dialog = pendingDialog();
      await component.onSubmit();
      mockLoading.loadingOn.mockClear();

      await dialog.close(false);

      expect(mockExpenseService.updateExpense).not.toHaveBeenCalled();
      expect(mockLoading.loadingOn).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should save the edited expense and its splits, mark everything unpaid, and return to the list', async () => {
      // 100 total, nothing fixed or proportional: all of it is the evenly shared remainder
      patchFormData({ allocatedAmount: '0.00' });
      patchSplit(0, { assignedAmount: '0.00' });
      component.addSplit();
      const dialog = pendingDialog();
      await component.onSubmit();

      await dialog.close(true);

      expect(mockExpenseService.updateExpense).toHaveBeenCalledOnce();
      const [groupId, ref, changes, splits, receipt] =
        mockExpenseService.updateExpense.mock.calls[0] as unknown as any[];
      expect(groupId).toBe('group-1');
      expect(ref).toBe(expenseRef);
      expect(changes).toEqual({
        date: '2024-06-15',
        description: 'Team Lunch',
        categoryRef,
        paidByMemberRef: memberRefCurrent,
        sharedAmount: 100,
        allocatedAmount: 0,
        totalAmount: 100,
        splitMethod: 'amount',
        paid: false,
      });
      expect(splits).toHaveLength(2);
      // the payer's own split is settled, everyone else's is not
      expect(splits[0]).toMatchObject({
        date: '2024-06-15',
        categoryRef,
        paidByMemberRef: memberRefCurrent,
        owedByMemberRef: splitMemberRef,
        paid: false,
      });
      expect(splits[1]).toMatchObject({
        owedByMemberRef: expect.objectContaining({ path: memberRef.path }),
        paid: true,
      });
      expect(receipt).toBeNull();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Expense updated successfully')
      );
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses']);
      expect(mockLoading.loadingOn).toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenLastCalledWith();
    });

    it('should send a newly attached receipt along with the changes', async () => {
      const file = new File(['pdf'], 'new.pdf', { type: 'application/pdf' });
      component.receiptFile.set(file);
      const dialog = pendingDialog();
      await component.onSubmit();

      await dialog.close(true);

      expect((mockExpenseService.updateExpense.mock.calls[0] as unknown as any[])[4]).toBe(file);
    });

    it('should leave rental details out of the changes unless the expense has them', async () => {
      const dialog = pendingDialog();
      await component.onSubmit();
      await dialog.close(true);

      expect(
        (mockExpenseService.updateExpense.mock.calls[0] as unknown as any[])[2]
      ).not.toHaveProperty('rental');
    });

    it('should keep the rental details when the expense came from the rental wizard', async () => {
      const rental: RentalDetails = {
        nightCount: 2,
        stays: [{ memberRef, nights: [0, 1] }],
      };
      component.rentalDetails.set(rental);
      const dialog = pendingDialog();
      await component.onSubmit();

      await dialog.close(true);

      expect((mockExpenseService.updateExpense.mock.calls[0] as unknown as any[])[2]).toMatchObject({
        rental,
      });
    });

    it('should report a failed save through the App Check handler and log it, and stay on the page', async () => {
      const handle = vi
        .spyOn(TestBed.inject(AppCheckErrorHandlerService), 'handle')
        .mockImplementation(() => {});
      mockExpenseService.updateExpense.mockRejectedValue(new Error('write failed'));
      const dialog = pendingDialog();
      await component.onSubmit();
      mockLoading.loadingOff.mockClear();

      await dialog.close(true);

      expect(handle).toHaveBeenCalledWith(expect.any(Error), 'write failed');
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Edit Expense Component',
        'edit_expense',
        'write failed'
      );
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalledOnce();
    });

    it('should use a generic message and skip logging for a non-Error failure', async () => {
      const handle = vi
        .spyOn(TestBed.inject(AppCheckErrorHandlerService), 'handle')
        .mockImplementation(() => {});
      mockExpenseService.updateExpense.mockRejectedValue('boom');
      const dialog = pendingDialog();
      await component.onSubmit();

      await dialog.close(true);

      expect(handle).toHaveBeenCalledWith(
        'boom',
        'Something went wrong - could not edit expense'
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });
  });

  describe('deleting the expense', () => {
    let navigateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    });

    it('should ask for confirmation naming the operation', () => {
      const { open } = pendingDialog();

      component.onDelete();

      expect(open).toHaveBeenCalledWith(DeleteDialogComponent, {
        data: { operation: 'Delete', target: 'this expense' },
      });
    });

    it('should delete nothing when the confirmation is declined', async () => {
      const dialog = pendingDialog();
      component.onDelete();

      await dialog.close(false);

      expect(mockExpenseService.deleteExpense).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should delete the expense in the current group and return to the list', async () => {
      const dialog = pendingDialog();
      component.onDelete();

      await dialog.close(true);

      expect(mockExpenseService.deleteExpense).toHaveBeenCalledWith(
        'group-1',
        expenseRef
      );
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Expense deleted')
      );
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses']);
    });

    it('should show and log the error when the delete fails, and stay on the page', async () => {
      mockExpenseService.deleteExpense.mockRejectedValue(new Error('denied'));
      const dialog = pendingDialog();
      component.onDelete();
      mockLoading.loadingOff.mockClear();

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('denied')
      );
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Edit Expense Component',
        'delete_expense',
        'denied'
      );
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalledOnce();
    });

    it('should use a generic message for a non-Error failure', async () => {
      mockExpenseService.deleteExpense.mockRejectedValue('boom');
      const dialog = pendingDialog();
      component.onDelete();

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Something went wrong - could not delete expense')
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });
  });

  describe('vacation rental occupancy grid', () => {
    const rental: RentalDetails = {
      nightCount: 2,
      stays: [
        { memberRef, nights: [0, 1] },
        { memberRef: splitMemberRef, nights: [0] },
      ],
    };

    it('should do nothing for an expense that did not come from the rental wizard', () => {
      const open = dialogResults();

      component.editRentalGrid();

      expect(open).not.toHaveBeenCalled();
    });

    it('should open the grid with the rental, the current total and the offered members', () => {
      component.rentalDetails.set(rental);
      const open = dialogResults(undefined);

      component.editRentalGrid();

      expect(open).toHaveBeenCalledWith(
        RentalEditDialogComponent,
        expect.objectContaining({
          data: {
            rental,
            totalAmount: 100,
            availableMembers: component.splitMembers(),
          },
        })
      );
    });

    it('should leave the splits alone when the grid is cancelled', () => {
      component.rentalDetails.set(rental);
      const before = (component as any).expenseModel();
      dialogResults(undefined);

      component.editRentalGrid();

      expect((component as any).expenseModel()).toBe(before);
      expect((component as any).modelDirty()).toBe(false);
    });

    it('should rebuild the splits by shares from the edited occupancy', () => {
      component.rentalDetails.set(rental);
      const edited: RentalDetails = {
        nightCount: 2,
        stays: [
          { memberRef, nights: [0, 1] },
          { memberRef: splitMemberRef, nights: [0] },
        ],
      };
      dialogResults({ rental: edited });

      component.editRentalGrid();

      expect(component.rentalDetails()).toBe(edited);
      expect((component as any).modelDirty()).toBe(true);
      const splits = getModel().splits;
      expect(splits.map((s) => s.owedByMemberRef!.path)).toEqual([
        memberRef.path,
        splitMemberRef.path,
      ]);
      // member-1 stayed both nights (1 + 2 = 3 shares), member-2 one night (1)
      expect(splits.map((s) => s.shares)).toEqual([3, 1]);
      expect(splits.map((s) => s.allocatedAmount)).toEqual([75, 25]);
    });
  });

  describe('tour hooks', () => {
    let tourConfig: GuidedTourConfig;

    beforeEach(() => {
      vi.spyOn(TestBed.inject(GuidedTourService), 'start').mockImplementation(
        async (config) => {
          tourConfig = config;
        }
      );
    });

    const step = (id: string) => tourConfig.steps.find((s) => s.id === id)!;

    it('should only show the rental step for an expense from the rental wizard', () => {
      component.startTour();
      expect(step('rental').when!()).toBe(false);

      component.rentalDetails.set({ nightCount: 1, stays: [] });

      expect(step('rental').when!()).toBe(true);
    });

    it('should describe viewing the receipt only when one is attached', () => {
      component.startTour();
      expect(step('receipt').text).not.toContain('View Receipt');

      component.receiptUrl.set('https://files/receipt.pdf');
      component.startTour();

      expect(step('receipt').text).toContain('View Receipt');
    });
  });
});
