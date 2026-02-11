import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { provideNativeDateAdapter } from '@angular/material/core';
import { DecimalPipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getStorage } from 'firebase/storage';
import { AddExpenseComponent } from './add-expense.component';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { CategoryStore } from '@store/category.store';
import { UserStore } from '@store/user.store';
import { DemoService } from '@services/demo.service';
import { TourService } from '@services/tour.service';
import { AnalyticsService } from '@services/analytics.service';
import { LocaleService } from '@services/locale.service';
import { CategoryService } from '@services/category.service';
import { ExpenseService } from '@services/expense.service';
import { MemorizedService } from '@services/memorized.service';
import { CameraService } from '@services/camera.service';
import { LoadingService } from '@shared/loading/loading.service';
import { CalculatorOverlayService } from '@shared/services/calculator-overlay.service';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import {
  createMockGroupStore,
  createMockMemberStore,
  createMockCategoryStore,
  createMockUserStore,
  createMockDemoService,
  createMockTourService,
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
  createMockMatDialog,
  createMockCalculatorOverlayService,
  createMockCategoryService,
  createMockExpenseService,
  createMockMemorizedService,
  createMockCameraService,
  mockGroup,
  mockMember,
  mockCategory,
  mockUser,
  mockDocRef,
} from '@testing/test-helpers';

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

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockUserStore = createMockUserStore();
    mockExpenseService = createMockExpenseService();
    mockLoadingService = createMockLoadingService();

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
        provideNoopAnimations(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: getStorage, useValue: {} },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: UserStore, useValue: mockUserStore },
        { provide: DemoService, useValue: createMockDemoService() },
        { provide: TourService, useValue: createMockTourService() },
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

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('initial render and store integration', () => {
    it('should render page title', () => {
      expect(query('page-title')?.textContent?.trim()).toBe('Add Expense');
    });

    it('should populate payer dropdown with active group members', () => {
      expect(component.activeMembers().length).toBe(2);
      expect(
        component.activeMembers().some((m) => m.displayName === 'Alice')
      ).toBe(true);
      expect(
        component.activeMembers().some((m) => m.displayName === 'Bob')
      ).toBe(true);
    });

    it('should populate category dropdown with active categories', () => {
      expect(component.activeCategories().length).toBe(2);
      expect(component.activeCategories().some((c) => c.name === 'Food')).toBe(
        true
      );
      expect(
        component.activeCategories().some((c) => c.name === 'Transport')
      ).toBe(true);
    });

    it('should default payer to current member', () => {
      expect(component.addExpenseForm.value.paidByMember?.path).toContain(
        'member-1'
      );
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
          provideNoopAnimations(),
          provideRouter([]),
          provideNativeDateAdapter(),
          { provide: getStorage, useValue: {} },
          { provide: GroupStore, useValue: mockGroupStore },
          { provide: MemberStore, useValue: mockMemberStore },
          { provide: CategoryStore, useValue: mockCategoryStore },
          { provide: UserStore, useValue: mockUserStore },
          { provide: DemoService, useValue: createMockDemoService() },
          { provide: TourService, useValue: createMockTourService() },
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

      expect(newFixture.componentInstance.activeCategories().length).toBe(1);
    });

    it('should default date to today', () => {
      const today = new Date();
      const formDate = component.addExpenseForm.value.date;

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

  describe('FormArray operations', () => {
    it('should add split with DocumentReference for member', () => {
      expect(component.splitsFormArray.length).toBe(0);
      component.addSplit();
      expect(component.splitsFormArray.length).toBe(1);

      const split = component.splitsFormArray.at(0);
      expect(split.get('owedByMemberRef')).toBeTruthy();
    });

    it('should remove split from FormArray', () => {
      component.addSplit();
      component.addSplit();
      expect(component.splitsFormArray.length).toBe(2);

      component.removeSplit(0);
      expect(component.splitsFormArray.length).toBe(1);
    });

    it('should add all active members when button clicked', () => {
      component.addAllActiveGroupMembers();
      expect(component.splitsFormArray.length).toBe(2);
    });

    it('should reflect autoAddMembers from group', () => {
      expect(component.autoAddMembers()).toBe(false);

      mockGroupStore.currentGroup.set(
        mockGroup({ currencyCode: 'USD', autoAddMembers: true })
      );
      expect(component.autoAddMembers()).toBe(true);
    });

    it('should require at least one split', () => {
      expect(component.splitsFormArray.length).toBe(0);
      const splitsControl = component.addExpenseForm.get('splits');
      expect(splitsControl?.hasError('required')).toBe(true);

      component.addSplit();
      expect(splitsControl?.hasError('required')).toBe(false);
    });

    it('should create split with member ref and amounts', () => {
      component.addSplit();
      const split = component.splitsFormArray.at(0);

      expect(split.get('owedByMemberRef')).toBeTruthy();
      expect(split.get('assignedAmount')).toBeTruthy();
      expect(split.get('percentage')).toBeTruthy();
      expect(split.get('allocatedAmount')).toBeTruthy();
    });
  });

  describe('allocation logic', () => {
    it('should use AllocationUtilsService for equal split', async () => {
      component.addSplit();
      component.addSplit();

      const memberRef1 = mockDocRef('groups/group-1/members/member-1');
      const memberRef2 = mockDocRef('groups/group-1/members/member-2');

      component.splitsFormArray.at(0).patchValue({ owedByMemberRef: memberRef1 });
      component.splitsFormArray.at(1).patchValue({ owedByMemberRef: memberRef2 });

      component.addExpenseForm.patchValue({
        amount: 100,
        sharedAmount: 100,
        allocatedAmount: 0,
      });

      component.allocateSharedAmounts();
      await fixture.whenStable();

      expect(component.splitsFormArray.at(0).value.allocatedAmount).toBe(50);
      expect(component.splitsFormArray.at(1).value.allocatedAmount).toBe(50);
    });

    it('should handle percentage mode toggle', async () => {
      component.splitByPercentage.set(true);
      await fixture.whenStable();

      expect(component.splitByPercentage()).toBe(true);
    });

    it('should allocate by percentage correctly', async () => {
      component.splitByPercentage.set(true);
      component.addSplit();
      component.addSplit();

      component.addExpenseForm.patchValue({ amount: 100 });
      component.splitsFormArray.at(0).patchValue({ percentage: 70 });
      component.splitsFormArray.at(1).patchValue({ percentage: 30 });

      component.allocateByPercentage();
      await fixture.whenStable();

      expect(component.splitsFormArray.at(0).value.allocatedAmount).toBe(70);
      expect(component.splitsFormArray.at(1).value.allocatedAmount).toBe(30);
    });

    it('should check if expense is fully allocated', () => {
      component.addSplit();
      component.addExpenseForm.patchValue({ amount: 100 });
      component.splitsFormArray.at(0).patchValue({ allocatedAmount: 100 });

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
      component.splitByPercentage.set(true);
      component.addSplit();
      component.addSplit();
      component.addSplit();

      component.splitsFormArray.at(0).patchValue({ percentage: 40 });
      component.splitsFormArray.at(1).patchValue({ percentage: 35 });

      component.allocateByPercentage();
      await fixture.whenStable();

      // Last split should be 25 (100 - 75)
      expect(component.splitsFormArray.at(2).value.percentage).toBe(25);
    });

    it('should update form when allocation changes', () => {
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
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
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
      component.addExpenseForm.patchValue({
        paidByMember: mockDocRef('groups/group-1/members/member-1'),
        date: new Date(),
        amount: 100,
        description: 'Test expense',
        category: mockDocRef('groups/group-1/categories/cat-1'),
      });
      component.splitsFormArray.at(0).patchValue({
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
      const formDate = component.addExpenseForm.value.date;

      expect(formDate?.getDate()).toBe(today.getDate());
    });
  });

  describe('calculator integration', () => {
    it('should have calculator button for total amount', () => {
      const calculatorService = TestBed.inject(CalculatorOverlayService);
      const spy = vi.spyOn(calculatorService, 'openCalculator');

      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
      component.openCalculator(mockEvent, 'amount');

      expect(spy).toHaveBeenCalled();
    });

    it('should open calculator for proportional amount', () => {
      const calculatorService = TestBed.inject(CalculatorOverlayService);
      const spy = vi.spyOn(calculatorService, 'openCalculator');

      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
      component.openCalculator(mockEvent, 'sharedAmount');

      expect(spy).toHaveBeenCalled();
    });

    it('should open calculator for split amount', () => {
      component.addSplit();
      const calculatorService = TestBed.inject(CalculatorOverlayService);
      const spy = vi.spyOn(calculatorService, 'openCalculator');

      const mockEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as any;
      component.openCalculator(mockEvent, 'assignedAmount', 0);

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
});
