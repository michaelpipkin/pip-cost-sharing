import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import {
  ExpenseForm,
  ExpenseSplitItemForm,
  RentalDetails,
  SerializableRentalPayload,
} from '@models/expense';
import { SerializableMemorized } from '@models/memorized';
import { GuidedTourConfig } from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CameraService } from '@services/camera.service';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { LocaleService } from '@services/locale.service';
import { MemorizedService } from '@services/memorized.service';
import { AppCheckErrorHandlerService } from '@services/app-check-error-handler.service';
import { ReceiptFileSelectionService } from '@services/receipt-file-selection.service';
import {
  ReceiptScanHandoffService,
  ReceiptScanPayload,
} from '@services/receipt-scan-handoff.service';
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
  createMockMemorizedService,
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
import { getStorage } from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddExpenseComponent } from './add-expense.component';
import { expectEnterEndsOnSave } from '@testing/default-button';

describe('AddExpenseComponent', () => {
  let fixture: ComponentFixture<AddExpenseComponent>;
  let component: AddExpenseComponent;
  let el: HTMLElement;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockExpenseService: ReturnType<typeof createMockExpenseService>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockRouter: Router;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;

  function getModel(): ExpenseForm {
    return {
      ...(component as any).expenseModel(),
      ...(component as any).expenseFormData(),
    };
  }

  function patchModel(
    patch: Partial<Pick<ExpenseForm, 'paidByMember' | 'category' | 'sharedAmount' | 'splits'>>
  ): void {
    (component as any).expenseModel.update((m: any) => ({ ...m, ...patch }));
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
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockUserStore = createMockUserStore();
    mockExpenseService = createMockExpenseService();
    mockLoadingService = createMockLoadingService();
    mockSnackBar = createMockSnackBar();
    mockAnalytics = createMockAnalyticsService();

    const testGroup = mockGroup({ currencyCode: 'USD', autoAddMembers: false });
    const testMember = mockMember({ displayName: 'Alice', groupAdmin: true });
    const testUser = mockUser();

    mockGroupStore.currentGroup.set(testGroup);
    mockMemberStore.currentMember.set(testMember);
    mockMemberStore.groupMembers.set([
      testMember,
      mockMember({
        id: 'member-2',
        displayName: 'Bob',
        ref: mockDocRef('groups/group-1/members/member-2'),
      }),
      mockMember({
        id: 'member-3',
        displayName: 'Charlie',
        active: false,
        ref: mockDocRef('groups/group-1/members/member-3'),
      }),
    ]);
    mockCategoryStore.groupCategories.set([
      mockCategory({ id: 'cat-1', name: 'Food', active: true }),
      mockCategory({ id: 'cat-2', name: 'Transport', active: true }),
      mockCategory({ id: 'cat-3', name: 'Old', active: false }),
    ]);
    mockUserStore.user.set(testUser);

    await TestBed.configureTestingModule({
      imports: [AddExpenseComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: getStorage, useValue: {} },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: UserStore, useValue: mockUserStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: MatDialog, useValue: createMockMatDialog() },
        {
          provide: CalculatorOverlayService,
          useValue: createMockCalculatorOverlayService(),
        },
        { provide: CategoryService, useValue: createMockCategoryService() },
        { provide: ExpenseService, useValue: mockExpenseService },
        { provide: MemorizedService, useValue: createMockMemorizedService() },
        { provide: CameraService, useValue: createMockCameraService() },
        LocaleService,
        StringUtils,
        AllocationUtilsService,
        DecimalPipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddExpenseComponent);
    component = fixture.componentInstance;
    mockRouter = TestBed.inject(Router);
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('initial render and store integration', () => {
    it('should render page title', () => {
      expect(query('page-title')?.textContent?.trim()).toBe('Add Expense');
    });

    it('should populate payer dropdown with active group members', () => {
      expect(component.activeMembers()).toHaveLength(2);
      expect(
        component.activeMembers().some((m) => m.displayName === 'Alice')
      ).toBe(true);
      expect(
        component.activeMembers().some((m) => m.displayName === 'Bob')
      ).toBe(true);
    });

    it('should populate category dropdown with active categories', () => {
      expect(component.activeCategories()).toHaveLength(2);
      expect(component.activeCategories().some((c) => c.name === 'Food')).toBe(
        true
      );
      expect(
        component.activeCategories().some((c) => c.name === 'Transport')
      ).toBe(true);
    });

    it('should default payer to current member', () => {
      expect(getModel().paidByMember?.path).toContain('member-1');
    });

    it('should auto-select category when only one exists', async () => {
      // Reset to single category
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'cat-1', name: 'Default', active: true }),
      ]);

      // Trigger effect by resetting component
      await TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [AddExpenseComponent],
        providers: [
          provideRouter([]),
          provideNativeDateAdapter(),
          { provide: getStorage, useValue: {} },
          { provide: GroupStore, useValue: mockGroupStore },
          { provide: MemberStore, useValue: mockMemberStore },
          { provide: CategoryStore, useValue: mockCategoryStore },
          { provide: UserStore, useValue: mockUserStore },
          { provide: AnalyticsService, useValue: createMockAnalyticsService() },
          { provide: LoadingService, useValue: mockLoadingService },
          { provide: MatSnackBar, useValue: createMockSnackBar() },
          { provide: MatDialog, useValue: createMockMatDialog() },
          {
            provide: CalculatorOverlayService,
            useValue: createMockCalculatorOverlayService(),
          },
          { provide: CategoryService, useValue: createMockCategoryService() },
          { provide: ExpenseService, useValue: mockExpenseService },
          {
            provide: MemorizedService,
            useValue: createMockMemorizedService(),
          },
          { provide: CameraService, useValue: createMockCameraService() },
          LocaleService,
          StringUtils,
          AllocationUtilsService,
          DecimalPipe,
        ],
      }).compileComponents();

      const newFixture = TestBed.createComponent(AddExpenseComponent);
      await newFixture.whenStable();

      expect(newFixture.componentInstance.activeCategories()).toHaveLength(1);
    });

    it('should default date to today', () => {
      const today = new Date();
      const formDate = getModel().date;

      expect(formDate?.getDate()).toBe(today.getDate());
      expect(formDate?.getMonth()).toBe(today.getMonth());
      expect(formDate?.getFullYear()).toBe(today.getFullYear());
    });

    it('should use group currency from LocaleService', () => {
      const localeService = TestBed.inject(LocaleService);
      expect(localeService.currency().code).toBe('USD');
    });

    it('should call loading service on init', () => {
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
    });
  });

  describe('defaults when store data arrives after first render', () => {
    // Simulates a browser refresh on this page: the member and category
    // stores are still loading when the component first renders.
    async function createWhileStoresLoading() {
      const currentMember = mockMemberStore.currentMember();
      mockGroupStore.currentGroup.set(
        mockGroup({ currencyCode: 'USD', autoAddMembers: true })
      );
      mockMemberStore.currentMember.set(null);
      mockMemberStore.loaded.set(false);
      mockCategoryStore.loaded.set(false);
      fixture = TestBed.createComponent(AddExpenseComponent);
      component = fixture.componentInstance;
      await fixture.whenStable();
      return currentMember!;
    }

    async function settle() {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('should apply payer, member splits and sole category once the stores load', async () => {
      const currentMember = await createWhileStoresLoading();
      expect(getModel().paidByMember).toBeNull();
      expect(getModel().splits).toHaveLength(0);
      expect(getModel().category).toBeNull();

      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'cat-1', name: 'Default', active: true }),
      ]);
      mockCategoryStore.loaded.set(true);
      mockMemberStore.loaded.set(true);
      mockMemberStore.currentMember.set(currentMember);
      await settle();

      expect(getModel().paidByMember?.path).toContain('member-1');
      // One split per active member (Charlie is inactive)
      expect(getModel().splits).toHaveLength(2);
      expect(getModel().category?.path).toContain('cat-1');
    });

    it('should not overwrite a payer chosen before the stores loaded', async () => {
      const currentMember = await createWhileStoresLoading();
      patchModel({
        paidByMember: mockDocRef('groups/group-1/members/member-2') as any,
      });

      mockMemberStore.loaded.set(true);
      mockMemberStore.currentMember.set(currentMember);
      await settle();

      expect(getModel().paidByMember?.path).toContain('member-2');
    });

    it('should apply each default only once', async () => {
      const currentMember = await createWhileStoresLoading();
      mockMemberStore.loaded.set(true);
      mockMemberStore.currentMember.set(currentMember);
      await settle();
      expect(getModel().splits).toHaveLength(2);

      // User removes all splits; a later store update must not re-add them
      patchModel({ splits: [] });
      mockMemberStore.groupMembers.set([...mockMemberStore.groupMembers()]);
      await settle();

      expect(getModel().splits).toHaveLength(0);
    });
  });

  describe('model split operations', () => {
    it('should add split with DocumentReference for member', () => {
      expect(getModel().splits).toHaveLength(0);
      component.addSplit();
      expect(getModel().splits).toHaveLength(1);

      const split = getModel().splits[0];
      expect(split?.owedByMemberRef).toBeTruthy();
    });

    it('should remove split from model', () => {
      component.addSplit();
      component.addSplit();
      expect(getModel().splits).toHaveLength(2);

      component.removeSplit(0);
      expect(getModel().splits).toHaveLength(1);
    });

    it('should add all active members when button clicked', () => {
      component.addAllActiveGroupMembers();
      expect(getModel().splits).toHaveLength(2);
    });

    it('should reflect autoAddMembers from group', () => {
      expect(component.autoAddMembers()).toBe(false);

      mockGroupStore.currentGroup.set(
        mockGroup({ currencyCode: 'USD', autoAddMembers: true })
      );
      expect(component.autoAddMembers()).toBe(true);
    });

    it('should require at least one split', () => {
      expect(getModel().splits).toHaveLength(0);
      expect((component as any).splitsValid()).toBe(false);

      component.addSplit();
      expect((component as any).splitsValid()).toBe(true);
    });

    it('should create split with member ref and amounts', () => {
      component.addSplit();
      const split = getModel().splits[0]!;

      expect(split.owedByMemberRef).toBeTruthy();
      expect(split.assignedAmount).toBeTruthy();
      expect(split.percentage).not.toBeUndefined();
      expect(split.shares).not.toBeUndefined();
      expect(split.allocatedAmount).not.toBeUndefined();
    });
  });

  describe('allocation logic', () => {
    it('should use AllocationUtilsService for equal split', async () => {
      component.addSplit();
      component.addSplit();

      const memberRef1 = mockDocRef('groups/group-1/members/member-1');
      const memberRef2 = mockDocRef('groups/group-1/members/member-2');

      patchSplit(0, { owedByMemberRef: memberRef1 });
      patchSplit(1, { owedByMemberRef: memberRef2 });

      patchModel({ sharedAmount: 100 });
      patchFormData({ amount: '100.00', allocatedAmount: '0.00' });

      component.allocateSharedAmounts();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(50);
      expect(getModel().splits[1]!.allocatedAmount).toBe(50);
    });

    it('should handle percentage mode toggle', async () => {
      component.splitMethod.set('percentage');
      await fixture.whenStable();

      expect(component.splitMethod()).toBe('percentage');
    });

    it('should allocate by percentage correctly', async () => {
      component.splitMethod.set('percentage');
      component.addSplit();
      component.addSplit();

      patchFormData({ amount: '100.00' });
      patchSplit(0, { percentage: 70 });
      patchSplit(1, { percentage: 30 });

      component.allocateByPercentage();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(70);
      expect(getModel().splits[1]!.allocatedAmount).toBe(30);
    });

    it('should check if expense is fully allocated', () => {
      component.addSplit();
      patchFormData({ amount: '100.00' });
      patchSplit(0, { allocatedAmount: 100 });

      expect(component.expenseFullyAllocated()).toBe(true);
    });

    it('should respect group currency from LocaleService', () => {
      const localeService = TestBed.inject(LocaleService);
      expect(localeService.currency().code).toBe('USD');
      expect(localeService.currency().decimalPlaces).toBe(2);
    });

    it('should trigger allocation when amount changes', () => {
      const spy = vi.spyOn(component, 'allocateSharedAmounts');
      component.updateTotalAmount();
      expect(spy).toHaveBeenCalled();
    });

    it('should auto-calculate last percentage to 100%', async () => {
      component.splitMethod.set('percentage');
      component.addSplit();
      component.addSplit();
      component.addSplit();

      patchSplit(2, { owedByMemberRef: mockDocRef('groups/group-1/members/member-3') });
      patchSplit(0, { percentage: 40 });
      patchSplit(1, { percentage: 35 });

      component.allocateByPercentage();
      await fixture.whenStable();

      // Last split should be 25 (100 - 75)
      expect(getModel().splits[2]!.percentage).toBe(25);
    });

    it('should allocate by shares correctly', async () => {
      component.splitMethod.set('shares');
      component.addSplit();
      component.addSplit();
      component.addSplit();

      const memberRef1 = mockDocRef('groups/group-1/members/member-1');
      const memberRef2 = mockDocRef('groups/group-1/members/member-2');
      const memberRef3 = mockDocRef('groups/group-1/members/member-3');

      patchSplit(0, { owedByMemberRef: memberRef1, shares: 1 });
      patchSplit(1, { owedByMemberRef: memberRef2, shares: 1 });
      patchSplit(2, { owedByMemberRef: memberRef3, shares: 2 });

      patchFormData({ amount: '100.00' });

      component.allocateByShares();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(25);
      expect(getModel().splits[1]!.allocatedAmount).toBe(25);
      expect(getModel().splits[2]!.allocatedAmount).toBe(50);
    });

    it('should update model when allocation changes', () => {
      const allocationUtils = TestBed.inject(AllocationUtilsService);
      const spy = vi.spyOn(allocationUtils, 'allocateSharedAmounts');

      component.addSplit();
      component.allocateSharedAmounts();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('receipt handling', () => {
    it('should show file input button', () => {
      expect(query('attach-file-button')).toBeTruthy();
    });

    it('should handle file selection', () => {
      const mockFile = new File(['test'], 'receipt.jpg', {
        type: 'image/jpeg',
      });
      const mockEvent = {
        target: { files: [mockFile] },
      } as any;

      component.onFileSelected(mockEvent);
      expect(component.fileName()).toBe('receipt.jpg');
    });

    it('should validate file size (max 5MB)', () => {
      // Create large file (> 5MB)
      const largeFile = new File(['x'.repeat(6 * 1024 * 1024)], 'large.jpg', {
        type: 'image/jpeg',
      });
      const mockEvent = {
        target: { files: [largeFile] },
      } as any;

      component.onFileSelected(mockEvent);
      // File should be rejected (filename not set)
      expect(component.fileName()).toBe('');
    });

    it('should accept any file type under size limit', () => {
      const textFile = new File(['test'], 'doc.txt', { type: 'text/plain' });
      const mockEvent = {
        target: { files: [textFile] },
      } as any;

      component.onFileSelected(mockEvent);
      // File is accepted (no type validation, only size)
      expect(component.fileName()).toBe('doc.txt');
      expect(component.receiptFile()).toBe(textFile);
    });

    it('should remove attached file', () => {
      component.fileName.set('receipt.jpg');
      component.receiptFile.set(
        new File(['test'], 'receipt.jpg', { type: 'image/jpeg' })
      );

      component.removeFile();

      expect(component.fileName()).toBe('');
      expect(component.receiptFile()).toBeNull();
    });

    it('should display attached filename', () => {
      component.fileName.set('my-receipt.png');
      expect(component.fileName()).toBe('my-receipt.png');
    });
  });

  describe('form submission', () => {
    beforeEach(() => {
      component.addSplit();
      patchModel({
        paidByMember: mockDocRef('groups/group-1/members/member-1'),
        category: mockDocRef('groups/group-1/categories/cat-1'),
      });
      patchFormData({
        date: new Date(),
        amount: '100.00',
        description: 'Test expense',
      });
      patchSplit(0, {
        owedByMemberRef: mockDocRef('groups/group-1/members/member-1'),
        allocatedAmount: 100,
      });
    });

    it('should have save button', () => {
      expect(query('save-button')).toBeTruthy();
    });

    // Note: Full form submission flow (onSubmit with ExpenseService, navigation,
    // and form reset with view children) is better tested in e2e tests where real
    // DOM and browser environment are available. Unit tests focus on component logic,
    // form structure, and allocation algorithms.
  });

  describe('memorized expense loading', () => {
    it('should check memorized expense on load', async () => {
      // Can't easily test navigation state in this test setup
      // This would require integration with Router testing utilities
      expect(component.memorizedExpense()).toBeNull();
    });

    it('should keep date as today even with memorized data', () => {
      const today = new Date();
      const formDate = getModel().date;

      expect(formDate?.getDate()).toBe(today.getDate());
    });
  });

  describe('calculator integration', () => {
    it('should have calculator button for total amount', () => {
      const calculatorService = TestBed.inject(CalculatorOverlayService);
      const spy = vi.spyOn(calculatorService, 'openCalculator');

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;
      component.openCalculator(mockEvent, 'amount');

      expect(spy).toHaveBeenCalled();
    });

    it('should open calculator for proportional amount', () => {
      const calculatorService = TestBed.inject(CalculatorOverlayService);
      const spy = vi.spyOn(calculatorService, 'openCalculator');

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;
      component.openCalculator(mockEvent, 'allocatedAmount');

      expect(spy).toHaveBeenCalled();
    });

    it('should open calculator for split amount', () => {
      component.addSplit();
      const calculatorService = TestBed.inject(CalculatorOverlayService);
      const spy = vi.spyOn(calculatorService, 'openCalculator');

      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as any;
      component.openCalculator(mockEvent, 'allocatedAmount', 0);

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('methods', () => {
    it('should cancel and navigate back', () => {
      const navigateSpy = vi.spyOn(mockRouter, 'navigate');
      component.onCancel();
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses']);
    });
  });

  describe('loadReceiptScanExpense', () => {
    it('routes unassigned items to the evenly-shared amount and tax/tip to the proportional amount', () => {
      const bob = mockMember({
        id: 'member-2',
        displayName: 'Bob',
        ref: mockDocRef('groups/group-1/members/member-2'),
      });
      const payload: ReceiptScanPayload = {
        file: new File(['bytes'], 'receipt.jpg', { type: 'image/jpeg' }),
        fileName: 'receipt.jpg',
        totalAmount: 82.4,
        description: 'Compton Ale House',
        sharedAmount: 0,
        proportionalAmount: 21.4,
        splits: [
          { memberRef: mockMember({ ref: mockDocRef('groups/group-1/members/member-1') }).ref!, assignedAmount: 30 },
          { memberRef: bob.ref!, assignedAmount: 31 },
        ],
      };

      (component as any).receiptScanPayload.set(payload);
      component.loadReceiptScanExpense();

      const model = getModel();
      // The "Evenly Shared Remainder" field is fed by sharedAmount - only
      // unassigned items should land there, not tax/tip.
      expect(model.sharedAmount).toBe(0);
      // The "Proportional Amount" field (allocatedAmount) is what the app's
      // own help text documents as being for tax/tip - this is the bug the
      // user found: tax/tip were landing in sharedAmount (evenly split)
      // instead of here (proportionally split).
      expect(model.allocatedAmount).toBe('21.40');
      expect(model.amount).toBe('82.40');
      expect(model.description).toBe('Compton Ale House');
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

    it('should start the add-expense tour from the help icon', () => {
      query('help-button')!.click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('add-expense');
      expect(tourConfig.steps.length).toBeGreaterThan(0);
    });

    it('should open the full help dialog from the tour', () => {
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

    it('should fill in a sample expense for the tour', async () => {
      component.startTour();
      await runStep('intro');

      const model = getModel();
      expect(model.description).toBe('Dinner out');
      expect(model.amount).toBe('100.00');
      expect(model.allocatedAmount).toBe('15.00');
      // One split per active member (Alice, Bob), with personal amounts
      expect(model.splits.map((s) => s.assignedAmount)).toEqual([
        '30.00',
        '25.00',
      ]);
    });

    it("should not overwrite what the user already entered", async () => {
      patchFormData({ description: 'Groceries', amount: '42.00' });
      component.startTour();
      await runStep('intro');

      expect(getModel().description).toBe('Groceries');
      expect(getModel().amount).toBe('42.00');
    });

    it('should switch split methods with sample percentages and shares', async () => {
      component.startTour();
      await runStep('intro');

      await runStep('splits-percentage');
      expect(component.splitMethod()).toBe('percentage');
      expect(getModel().splits[0]!.percentage).toBe(40);

      await runStep('splits-shares');
      expect(component.splitMethod()).toBe('shares');
      expect(getModel().splits.map((s) => s.shares)).toEqual([2, 1.5]);

      await runStep('add-splits');
      expect(component.splitMethod()).toBe('amount');
    });

    it('should restore the form exactly when the tour ends', async () => {
      patchFormData({ description: 'Groceries' });
      const model = (component as any).expenseModel();
      const formData = (component as any).expenseFormData();
      component.startTour();

      await runStep('intro');
      await runStep('splits-shares');
      tourConfig.onEnd!('closed');

      expect((component as any).expenseModel()).toBe(model);
      expect((component as any).expenseFormData()).toBe(formData);
      expect(component.splitMethod()).toBe('amount');
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });

  describe('receipt attachment', () => {
    it('should remove an attached receipt', async () => {
      component.fileName.set('receipt.pdf');
      component.receiptFile.set(new File(['x'], 'receipt.pdf'));
      await fixture.whenStable();

      query('remove-file-button')!.click();
      await fixture.whenStable();

      expect(component.fileName()).toBe('');
      expect(component.receiptFile()).toBeNull();
      expect(query('attach-file-area')).toBeTruthy();
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

  const catFood = mockDocRef('groups/group-1/categories/cat-1');
  const catTransport = mockDocRef('groups/group-1/categories/cat-2');
  const catLodging = mockDocRef('groups/group-1/categories/cat-4');

  // The tests below that start from another page (receipt scan, rental
  // wizard, memorized expense) need the navigation state in place before the
  // component is constructed.
  async function openWith(
    state: { rental?: SerializableRentalPayload; expense?: SerializableMemorized } | null,
    scan?: ReceiptScanPayload
  ): Promise<void> {
    if (scan) TestBed.inject(ReceiptScanHandoffService).setPayload(scan);
    vi.spyOn(mockRouter, 'currentNavigation').mockReturnValue(
      state ? ({ extras: { state } } as any) : null
    );
    fixture = TestBed.createComponent(AddExpenseComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  function useDistinctCategories(): void {
    mockCategoryStore.groupCategories.set([
      mockCategory({ id: 'cat-1', name: 'Food', ref: catFood }),
      mockCategory({ id: 'cat-2', name: 'Transport', ref: catTransport }),
      mockCategory({ id: 'cat-4', name: 'Lodging', ref: catLodging }),
      mockCategory({
        id: 'cat-3',
        name: 'Old',
        active: false,
        ref: mockDocRef('groups/group-1/categories/cat-3'),
      }),
    ]);
  }

  describe('arriving from another page', () => {
    const memberRef1 = mockDocRef('groups/group-1/members/member-1');
    const memberRef2 = mockDocRef('groups/group-1/members/member-2');

    function scanPayload(): ReceiptScanPayload {
      return {
        file: new File(['bytes'], 'receipt.jpg', { type: 'image/jpeg' }),
        fileName: 'receipt.jpg',
        totalAmount: 60,
        description: 'Corner Cafe',
        sharedAmount: 0,
        proportionalAmount: 0,
        splits: [
          { memberRef: memberRef1, assignedAmount: 20 },
          { memberRef: memberRef2, assignedAmount: 40 },
        ],
      };
    }

    function rentalPayload(
      overrides: Partial<SerializableRentalPayload> = {}
    ): SerializableRentalPayload {
      return {
        totalAmount: 300,
        description: 'Beach house',
        nightCount: 2,
        stays: [
          { memberId: 'member-1', nights: [0, 1] },
          { memberId: 'member-2', nights: [0] },
        ],
        ...overrides,
      };
    }

    function memorized(
      overrides: Partial<SerializableMemorized> = {}
    ): SerializableMemorized {
      return {
        id: 'mem-1',
        description: 'Rent',
        categoryId: 'cat-2',
        paidByMemberId: 'member-2',
        sharedAmount: 90,
        allocatedAmount: 0,
        totalAmount: 100,
        splitMethod: 'amount',
        splits: [
          {
            owedByMemberId: 'member-1',
            assignedAmount: 10,
            percentage: 0,
            shares: 0,
            allocatedAmount: 55,
          },
          {
            owedByMemberId: 'member-2',
            assignedAmount: 0,
            percentage: 0,
            shares: 0,
            allocatedAmount: 45,
          },
        ],
        ...overrides,
      };
    }

    it('should load a scanned receipt: file attached, payer defaulted, splits by item', async () => {
      useDistinctCategories();
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'cat-1', name: 'Food', ref: catFood }),
      ]);
      const payload = scanPayload();

      await openWith(null, payload);

      expect(component.receiptScanPayload()).toEqual(payload);
      expect(component.receiptFile()).toBe(payload.file);
      expect(component.fileName()).toBe('receipt.jpg');
      expect(getModel().description).toBe('Corner Cafe');
      expect(getModel().amount).toBe('60.00');
      expect(getModel().paidByMember).toBe(mockMemberStore.currentMember()!.ref);
      // the only active category is chosen for the user
      expect(getModel().category).toBe(catFood);
      expect(getModel().splits.map((s) => s.owedByMemberRef)).toEqual([
        memberRef1,
        memberRef2,
      ]);
      expect(getModel().splits.map((s) => s.assignedAmount)).toEqual([
        '20.00',
        '40.00',
      ]);
      expect(getModel().splits.map((s) => s.allocatedAmount)).toEqual([20, 40]);
    });

    it('should leave the category empty for a scan when several are active', async () => {
      useDistinctCategories();

      await openWith(null, scanPayload());

      expect(getModel().category).toBeNull();
    });

    it('should not apply the blank-expense defaults on top of a scanned receipt', async () => {
      mockGroupStore.currentGroup.set(
        mockGroup({ currencyCode: 'USD', autoAddMembers: true })
      );

      await openWith(null, scanPayload());

      // auto-add would have added Alice and Bob a second time
      expect(getModel().splits).toHaveLength(2);
    });

    it('should turn a rental into a shares split from who stayed which nights', async () => {
      await openWith({ rental: rentalPayload() });

      expect(component.splitMethod()).toBe('shares');
      // Alice stayed both nights (1 + 2 shares), Bob one night (1 share)
      expect(getModel().splits.map((s) => s.shares)).toEqual([3, 1]);
      expect(getModel().splits.map((s) => s.allocatedAmount)).toEqual([225, 75]);
      expect(getModel().amount).toBe('300.00');
      expect(getModel().description).toBe('Beach house');
      expect(getModel().allocatedAmount).toBe('0.00');
      expect(getModel().paidByMember).toBe(mockMemberStore.currentMember()!.ref);
      expect(component.rentalDetails()).toEqual({
        nightCount: 2,
        stays: [
          { memberRef: expect.objectContaining({ id: 'member-1' }), nights: [0, 1] },
          { memberRef: expect.objectContaining({ id: 'member-2' }), nights: [0] },
        ],
      });
      expect(component.rentalDetails()).not.toHaveProperty('rooms');
    });

    it('should drop rental guests who are not active members of the group', async () => {
      await openWith({
        rental: rentalPayload({
          stays: [
            { memberId: 'member-1', nights: [0, 1] },
            { memberId: 'member-3', nights: [0, 1] },
            { memberId: 'no-such-member', nights: [0] },
          ],
        }),
      });

      expect(component.rentalDetails()!.stays).toHaveLength(1);
      expect(getModel().splits).toHaveLength(1);
      expect(getModel().splits[0]!.allocatedAmount).toBe(300);
    });

    it('should keep rental rooms, a guest\'s room and guess the lodging category', async () => {
      useDistinctCategories();
      const rooms = [{ id: 'r1', name: 'Master', rate: 1.5 }];

      await openWith({
        rental: rentalPayload({
          rooms,
          stays: [
            { memberId: 'member-1', nights: [0, 1], roomId: 'r1' },
            { memberId: 'member-2', nights: [0] },
          ],
        }),
      });

      const rental = component.rentalDetails() as RentalDetails;
      expect(rental.rooms).toEqual(rooms);
      expect(rental.stays[0]!.roomId).toBe('r1');
      expect(rental.stays[1]).not.toHaveProperty('roomId');
      expect(getModel().category).toBe(catLodging);
    });

    it('should pick the only active category for a rental whatever it is called', async () => {
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'cat-1', name: 'Food', ref: catFood }),
      ]);

      await openWith({ rental: rentalPayload() });

      expect(getModel().category).toBe(catFood);
    });

    it('should leave the rental category empty when nothing looks like lodging', async () => {
      await openWith({ rental: rentalPayload() });

      expect(getModel().category).toBeNull();
    });

    it('should load a memorized expense with its payer, category and splits', async () => {
      useDistinctCategories();

      await openWith({ expense: memorized() });

      expect(getModel().description).toBe('Rent');
      expect(getModel().amount).toBe('100.00');
      expect(getModel().sharedAmount).toBe(90);
      expect(getModel().paidByMember!.path).toBe(memberRef2.path);
      expect(getModel().category).toBe(catTransport);
      expect(getModel().splits.map((s) => s.owedByMemberRef!.path)).toEqual([
        memberRef1.path,
        memberRef2.path,
      ]);
      expect(getModel().splits.map((s) => s.assignedAmount)).toEqual([
        '10.00',
        '0.00',
      ]);
      expect(getModel().date!.toDateString()).toBe(new Date().toDateString());
    });

    it('should keep the memorized payer instead of defaulting to the current member', async () => {
      await openWith({ expense: memorized() });

      expect(getModel().paidByMember!.path).toBe(memberRef2.path);
    });

    it('should leave a memorized split without a member when that member is no longer active', async () => {
      await openWith({
        expense: memorized({
          paidByMemberId: 'gone',
          categoryId: 'gone',
          splits: [
            {
              owedByMemberId: 'member-3',
              assignedAmount: 5,
              percentage: 0,
              shares: 0,
              allocatedAmount: 5,
            },
          ],
        }),
      });

      expect(getModel().splits[0]!.owedByMemberRef).toBeNull();
      expect(getModel().paidByMember).toBeNull();
      expect(getModel().category).toBeNull();
      expect((component as any).paidByMemberValid()).toBe(false);
      expect((component as any).splitsValid()).toBe(false);
    });

    it('should prefer a scanned receipt over a rental, and a rental over a memorized expense', async () => {
      await openWith(
        { rental: rentalPayload(), expense: memorized() },
        scanPayload()
      );
      expect(getModel().description).toBe('Corner Cafe');
      expect(component.rentalPayload()).toBeNull();
      expect(component.memorizedExpense()).toBeNull();

      await openWith({ rental: rentalPayload(), expense: memorized() });
      expect(getModel().description).toBe('Beach house');
      expect(component.memorizedExpense()).toBeNull();
    });

    it('should only hand a scanned receipt over once', async () => {
      await openWith(null, scanPayload());

      expect(TestBed.inject(ReceiptScanHandoffService).takePayload()).toBeNull();
    });
  });

  describe('split rows', () => {
    it('should only add the members who do not already have a split', () => {
      component.addSplit();
      const existing = getModel().splits[0]!.owedByMemberRef;

      component.addAllActiveGroupMembers();

      expect(getModel().splits).toHaveLength(2);
      expect(getModel().splits[0]!.owedByMemberRef).toBe(existing);
    });

    it('should do nothing when every active member already has a split', () => {
      component.addAllActiveGroupMembers();
      const before = (component as any).expenseModel();

      component.addAllActiveGroupMembers();

      expect((component as any).expenseModel()).toBe(before);
    });

    it('should leave a new split without a member once everyone has one', () => {
      component.addAllActiveGroupMembers();
      component.addSplit();

      expect(getModel().splits[2]!.owedByMemberRef).toBeNull();
    });

    it('should not offer a member already chosen in another split', () => {
      component.addAllActiveGroupMembers();

      expect(
        component.availableMembersForSplit(0).map((m) => m.displayName)
      ).toEqual(['Alice']);
      expect(
        component.availableMembersForSplit(1).map((m) => m.displayName)
      ).toEqual(['Bob']);
    });

    it("should work out each row's share of the total shares", () => {
      component.addAllActiveGroupMembers();
      patchSplit(0, { shares: 1 });
      patchSplit(1, { shares: 3 });

      expect((component as any).effectivePercentage(0)).toBe(25);
      expect((component as any).effectivePercentage(1)).toBe(75);
    });

    it('should show 0% when nobody has any shares', () => {
      component.addSplit();

      expect((component as any).effectivePercentage(0)).toBe(0);
    });

    it('should only treat the last row as automatic in the percentage method', () => {
      component.addAllActiveGroupMembers();

      expect(component.isLastSplit(1)).toBe(false);

      component.splitMethod.set('percentage');

      expect(component.isLastSplit(0)).toBe(false);
      expect(component.isLastSplit(1)).toBe(true);
    });

    it('should change one field of one row and leave the rest alone', () => {
      component.addAllActiveGroupMembers();

      (component as any).updateSplit(1, 'assignedAmount', '7.00');

      expect(getModel().splits.map((s) => s.assignedAmount)).toEqual([
        '0.00',
        '7.00',
      ]);
    });

    it('should require a payer and a category', () => {
      (component as any).expenseModel.update((m: any) => ({
        ...m,
        paidByMember: null,
      }));

      expect((component as any).paidByMemberValid()).toBe(false);
      expect((component as any).categoryValid()).toBe(false);

      patchModel({ paidByMember: mockMemberStore.currentMember()!.ref!, category: catFood });

      expect((component as any).paidByMemberValid()).toBe(true);
      expect((component as any).categoryValid()).toBe(true);
    });

    it('should flag a zero total', () => {
      const amountErrors = () =>
        (component as any)
          .expenseForm.amount()
          .errors()
          .map((e: { kind: string }) => e.kind);

      expect(amountErrors()).toContain('zeroAmount');

      patchFormData({ amount: '12.00' });

      expect(amountErrors()).not.toContain('zeroAmount');
    });
  });

  describe('allocation by split method', () => {
    function twoSplits(): void {
      component.addAllActiveGroupMembers();
      patchFormData({ amount: '100.00', allocatedAmount: '0.00' });
    }

    it('should share the remainder after fixed amounts in the amount method', () => {
      twoSplits();
      patchSplit(0, { assignedAmount: '20.00' });

      component.updateTotalAmount();

      expect(getModel().splits.map((s) => s.allocatedAmount)).toEqual([60, 40]);
      expect(getModel().sharedAmount).toBe(80);
    });

    it('should recalculate by percentage when the split method changes', () => {
      twoSplits();
      patchSplit(0, { percentage: 30 });
      component.splitMethod.set('percentage');

      component.onSplitMethodChange();

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
      component.updateTotalAmount();

      component.removeSplit(0);

      expect(getModel().splits).toHaveLength(1);
      expect(getModel().splits[0]!.percentage).toBe(100);
      expect(getModel().splits[0]!.allocatedAmount).toBe(100);
    });

    it('should not allocate by percentage or shares when there are no splits', () => {
      const before = (component as any).expenseModel();

      component.allocateByPercentage();
      component.allocateByShares();

      expect((component as any).expenseModel()).toBe(before);
    });

    it('should report the assigned and allocated totals and whether they add up', () => {
      twoSplits();
      patchSplit(0, { assignedAmount: '20.00' });
      component.updateTotalAmount();

      expect(component.assignedTotal()).toBe(20);
      expect(component.allocatedTotal()).toBe(100);
      expect(component.expenseFullyAllocated()).toBe(true);

      patchFormData({ amount: '120.00' });

      expect(component.expenseFullyAllocated()).toBe(false);
    });
  });

  describe('calculator results', () => {
    function openWithCalculator(field: 'amount' | 'allocatedAmount', index?: number) {
      const overlay = TestBed.inject(CalculatorOverlayService) as any;
      const target = document.createElement('input');
      component.openCalculator({ target } as unknown as Event, field, index);
      expect(overlay.openCalculator).toHaveBeenCalledWith(
        target,
        expect.any(Function)
      );
      return overlay.openCalculator.mock.lastCall[1] as (n: number) => void;
    }

    it('should put a calculated total in the form, formatted, and reallocate', () => {
      component.addSplit();
      const done = openWithCalculator('amount');

      done(60.5);

      expect(getModel().amount).toBe('60.50');
      expect(getModel().splits[0]!.allocatedAmount).toBe(60.5);
    });

    it('should put a calculated proportional amount in its own field', () => {
      const done = openWithCalculator('allocatedAmount');

      done(15);

      expect(getModel().allocatedAmount).toBe('15.00');
      expect(getModel().amount).toBe('0.00');
    });

    it('should put a calculated amount in the split row it was opened for', () => {
      component.addAllActiveGroupMembers();
      const done = openWithCalculator('amount', 1);

      done(12);

      expect(getModel().splits[1]!.assignedAmount).toBe('12.00');
      expect(getModel().splits[0]!.assignedAmount).toBe('0.00');
      expect(getModel().amount).toBe('0.00');
    });
  });

  describe('attaching a receipt', () => {
    const pdf = () => new File(['pdf'], 'receipt.pdf', { type: 'application/pdf' });
    let selection: ReceiptFileSelectionService;

    beforeEach(() => {
      selection = TestBed.inject(ReceiptFileSelectionService);
    });

    it('should ignore a file-picker change that selected nothing', () => {
      component.onFileSelected({ target: { files: [] } } as unknown as Event);

      expect(component.receiptFile()).toBeNull();
      expect(component.fileName()).toBe('');
    });

    it('should stop when the receipt policy is not accepted', async () => {
      vi.spyOn(selection, 'ensureReceiptPolicyAccepted').mockResolvedValue(false);
      const pick = vi.spyOn(selection, 'pickSource');

      await component.openFileSelectionDialog();

      expect(pick).not.toHaveBeenCalled();
    });

    it('should attach the file the user picked, telling the picker whether the camera is available', async () => {
      const cameraService = TestBed.inject(CameraService) as any;
      cameraService.isAvailable.mockReturnValue(true);
      vi.spyOn(selection, 'ensureReceiptPolicyAccepted').mockResolvedValue(true);
      const file = pdf();
      const pick = vi
        .spyOn(selection, 'pickSource')
        .mockResolvedValue({ type: 'selected', file });

      await component.openFileSelectionDialog();

      expect(pick).toHaveBeenCalledWith(true);
      expect(component.receiptFile()).toBe(file);
      expect(component.fileName()).toBe('receipt.pdf');
    });

    it('should attach nothing when the picker is cancelled', async () => {
      vi.spyOn(selection, 'ensureReceiptPolicyAccepted').mockResolvedValue(true);
      vi.spyOn(selection, 'pickSource').mockResolvedValue({ type: 'cancelled' });

      await component.openFileSelectionDialog();

      expect(component.receiptFile()).toBeNull();
    });

    it('should open the page\'s own file input for the browse-files option', async () => {
      vi.spyOn(selection, 'ensureReceiptPolicyAccepted').mockResolvedValue(true);
      vi.spyOn(selection, 'pickSource').mockResolvedValue({ type: 'browseFiles' });
      const click = vi
        .spyOn(HTMLInputElement.prototype, 'click')
        .mockImplementation(() => {});

      await component.openFileSelectionDialog();

      expect(click).toHaveBeenCalledOnce();
      expect((click.mock.contexts[0] as HTMLInputElement).type).toBe('file');
      expect(component.receiptFile()).toBeNull();
    });

    it('should not attach a file the selection service rejects', () => {
      vi.spyOn(selection, 'validateFile').mockReturnValue(null);

      component.onFileSelected({ target: { files: [pdf()] } } as unknown as Event);

      expect(component.receiptFile()).toBeNull();
      expect(component.fileName()).toBe('');
    });
  });

  describe('saving the expense', () => {
    const groupAdmin = () => mockMemberStore.currentMember()!.ref!;
    let navigateSpy: ReturnType<typeof vi.spyOn>;

    // Alice (current member) paid 90 for Alice and Bob
    function fillValidExpense(): void {
      component.addAllActiveGroupMembers();
      patchModel({ category: catFood });
      patchFormData({
        date: new Date(2024, 5, 15),
        amount: '90.00',
        description: 'Dinner',
        allocatedAmount: '0.00',
      });
      component.updateTotalAmount();
    }

    const addExpenseArgs = () =>
      mockExpenseService.addExpense.mock.calls[0] as unknown as any[];

    beforeEach(() => {
      navigateSpy = vi.spyOn(mockRouter, 'navigate').mockResolvedValue(true);
    });

    it('should save the expense and one split per member with the real document references', async () => {
      fillValidExpense();

      await component.onSubmit();

      expect(mockExpenseService.addExpense).toHaveBeenCalledOnce();
      const [groupId, expense, splits, receipt] = addExpenseArgs();
      expect(groupId).toBe('group-1');
      expect(expense).toEqual({
        date: '2024-06-15',
        description: 'Dinner',
        categoryRef: catFood,
        paidByMemberRef: groupAdmin(),
        paid: false,
        sharedAmount: 90,
        allocatedAmount: 0,
        totalAmount: 90,
        splitMethod: 'amount',
      });
      expect(splits).toHaveLength(2);
      expect(splits[0]).toEqual({
        date: '2024-06-15',
        categoryRef: catFood,
        assignedAmount: 0,
        percentage: 0,
        shares: 0,
        allocatedAmount: 45,
        paidByMemberRef: groupAdmin(),
        owedByMemberRef: mockMemberStore.groupMembers()[0]!.ref,
        // the payer owes their own share, so it is already settled
        paid: true,
      });
      expect(splits[1]).toMatchObject({
        owedByMemberRef: mockMemberStore.groupMembers()[1]!.ref,
        allocatedAmount: 45,
        paid: false,
      });
      expect(receipt).toBeNull();
    });

    it('should skip splits that come to nothing', async () => {
      fillValidExpense();
      (component as any).expenseModel.update((m: any) => ({
        ...m,
        splits: [
          ...m.splits,
          {
            owedByMemberRef: mockDocRef('groups/group-1/members/member-3'),
            assignedAmount: '0.00',
            percentage: 0,
            shares: 0,
            allocatedAmount: 0,
          },
        ],
      }));

      await component.onSubmit();

      expect(addExpenseArgs()[2]).toHaveLength(2);
    });

    it('should pass along the split method and the attached receipt', async () => {
      fillValidExpense();
      component.splitMethod.set('shares');
      const file = new File(['pdf'], 'receipt.pdf');
      component.receiptFile.set(file);

      await component.onSubmit();

      expect(addExpenseArgs()[1].splitMethod).toBe('shares');
      expect(addExpenseArgs()[3]).toBe(file);
    });

    it('should keep the rental details for an expense that came from the rental wizard', async () => {
      fillValidExpense();
      const rental: RentalDetails = {
        nightCount: 1,
        stays: [{ memberRef: groupAdmin(), nights: [0] }],
      };
      component.rentalDetails.set(rental);

      await component.onSubmit();

      expect(addExpenseArgs()[1].rental).toBe(rental);
    });

    it('should confirm, log the event and go back to the list', async () => {
      fillValidExpense();

      await component.onSubmit();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        CustomSnackbarComponent,
        { data: { message: 'Expense added.' } }
      );
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith('expense_created');
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses']);
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('should clear the form for the next expense on Save and Add, keeping the payer', async () => {
      mockGroupStore.currentGroup.set(
        mockGroup({ currencyCode: 'USD', autoAddMembers: true })
      );
      fillValidExpense();
      component.rentalDetails.set({ nightCount: 1, stays: [] });
      component.fileName.set('receipt.pdf');
      component.receiptFile.set(new File(['pdf'], 'receipt.pdf'));

      await component.onSubmit(true);

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(getModel().description).toBe('');
      expect(getModel().amount).toBe('0.00');
      expect(getModel().allocatedAmount).toBe('0.00');
      expect(getModel().paidByMember).toBe(groupAdmin());
      expect(getModel().sharedAmount).toBe(0);
      expect(getModel().category).toBeNull();
      expect(component.rentalDetails()).toBeNull();
      expect(component.fileName()).toBe('');
      expect(component.receiptFile()).toBeNull();
      // autoAddMembers puts a row per member back
      expect(getModel().splits).toHaveLength(2);
    });

    it('should leave the member rows empty on Save and Add without auto-add, and keep a sole category', async () => {
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'cat-1', name: 'Food', ref: catFood }),
      ]);
      fillValidExpense();

      await component.onSubmit(true);

      expect(getModel().splits).toHaveLength(0);
      expect(getModel().category).toBe(catFood);
    });

    it('should show the failure, log it, and stay on the page when the save fails', async () => {
      const handle = vi
        .spyOn(TestBed.inject(AppCheckErrorHandlerService), 'handle')
        .mockImplementation(() => {});
      mockExpenseService.addExpense.mockRejectedValue(new Error('write failed'));
      fillValidExpense();
      mockLoadingService.loadingOff.mockClear();

      await component.onSubmit();

      expect(handle).toHaveBeenCalledWith(expect.any(Error), 'write failed');
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Add Expense Component',
        'add_expense',
        'write failed'
      );
      expect(mockAnalytics.logEvent).not.toHaveBeenCalledWith('expense_created');
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalledOnce();
    });

    it('should use a generic message and skip logging for a non-Error failure', async () => {
      const handle = vi
        .spyOn(TestBed.inject(AppCheckErrorHandlerService), 'handle')
        .mockImplementation(() => {});
      mockExpenseService.addExpense.mockRejectedValue('boom');
      fillValidExpense();

      await component.onSubmit();

      expect(handle).toHaveBeenCalledWith(
        'boom',
        'Something went wrong - could not save expense.'
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
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

    it('should only mention choosing a category when the group has more than one', () => {
      const text = () =>
        tourConfig.steps.find((s) => s.id === 'description')!.text;

      component.startTour();
      expect(text()).toContain('choose a category');

      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'cat-1', name: 'Food', active: true }),
      ]);
      component.startTour();

      expect(text()).not.toContain('category');
    });
  });
});
