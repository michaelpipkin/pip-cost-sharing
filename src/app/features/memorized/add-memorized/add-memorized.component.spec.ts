import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CategoryService } from '@services/category.service';
import { DemoService } from '@services/demo.service';
import { LocaleService } from '@services/locale.service';
import { MemorizedService } from '@services/memorized.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import {
  createMockAnalyticsService,
  createMockCalculatorOverlayService,
  createMockCategoryService,
  createMockCategoryStore,
  createMockDemoService,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockMemorizedService,
  createMockSnackBar,
  mockCategory,
  mockDocRef,
  mockGroup,
  mockMember,
} from '@testing/test-helpers';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { getStorage } from 'firebase/storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddMemorizedComponent } from './add-memorized.component';

describe('AddMemorizedComponent', () => {
  let fixture: ComponentFixture<AddMemorizedComponent>;
  let component: AddMemorizedComponent;
  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockMemorizedService: ReturnType<typeof createMockMemorizedService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let router: Router;

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockMemorizedService = createMockMemorizedService();
    mockDemoService = createMockDemoService();
    mockLoadingService = createMockLoadingService();

    const testGroup = mockGroup({ currencyCode: 'USD', autoAddMembers: false });
    const testMember = mockMember({ displayName: 'Alice', groupAdmin: true });

    mockGroupStore.currentGroup.set(testGroup);
    mockMemberStore.currentMember.set(testMember);
    mockMemberStore.groupMembers.set([
      testMember,
      mockMember({
        id: 'member-2',
        displayName: 'Bob',
        ref: mockDocRef('groups/group-1/members/member-2'),
      }),
    ]);
    mockCategoryStore.groupCategories.set([
      mockCategory({ id: 'cat-1', name: 'Food', active: true }),
      mockCategory({ id: 'cat-2', name: 'Transport', active: true }),
    ]);

    mockMemorizedService.addMemorized.mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [AddMemorizedComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: getStorage, useValue: {} },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: DemoService, useValue: mockDemoService },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: MatDialog, useValue: createMockMatDialog() },
        {
          provide: CalculatorOverlayService,
          useValue: createMockCalculatorOverlayService(),
        },
        { provide: CategoryService, useValue: createMockCategoryService() },
        { provide: MemorizedService, useValue: mockMemorizedService },
        LocaleService,
        StringUtils,
        AllocationUtilsService,
        DecimalPipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AddMemorizedComponent);
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

  describe('form initialization', () => {
    it('should default payer to current member', () => {
      expect(component.addMemorizedForm.value.paidByMember?.path).toContain(
        'member-1'
      );
    });

    it('should populate activeMembers from store', () => {
      expect(component.activeMembers().length).toBe(2);
    });

    it('should populate activeCategories from store', () => {
      expect(component.activeCategories().length).toBe(2);
    });

    it('should start with empty splits array', () => {
      expect(component.splitsFormArray.length).toBe(0);
    });
  });

  describe('form validation', () => {
    it('should require description', () => {
      component.e.description.setValue('');
      expect(component.e.description.invalid).toBe(true);
    });

    it('should require a payer', () => {
      component.e.paidByMember.setValue(null as any);
      expect(component.e.paidByMember.invalid).toBe(true);
    });

    it('should reject zero amount', () => {
      component.e.amount.setValue(0);
      expect(component.e.amount.invalid).toBe(true);
    });

    it('should accept non-zero amount', () => {
      component.e.amount.setValue(25.0);
      expect(component.e.amount.invalid).toBe(false);
    });
  });

  describe('addSplit / removeSplit', () => {
    it('should add a split row when addSplit is called', () => {
      component.addSplit();
      expect(component.splitsFormArray.length).toBe(1);
    });

    it('should remove a split row when removeSplit is called', () => {
      component.addSplit();
      component.addSplit();
      component.removeSplit(0);
      expect(component.splitsFormArray.length).toBe(1);
    });
  });

  describe('memorizedFullyAllocated', () => {
    it('should return true when amount equals allocated total', () => {
      component.e.amount.setValue(10);
      component.addSplit();
      component.splitsFormArray.at(0).patchValue({ allocatedAmount: 10 });
      expect(component.memorizedFullyAllocated()).toBe(true);
    });

    it('should return false when amount does not equal allocated total', () => {
      component.e.amount.setValue(10);
      expect(component.memorizedFullyAllocated()).toBe(false);
    });
  });

  describe('onSubmit', () => {
    it('should show demo restriction in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.onSubmit();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockMemorizedService.addMemorized).not.toHaveBeenCalled();
    });

    it('should call memorizedService.addMemorized when not in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      component.e.description.setValue('Test Expense');
      component.e.amount.setValue(50);
      component.e.category.setValue(
        mockDocRef('groups/group-1/categories/cat-1')
      );
      component.addSplit();
      await component.onSubmit();
      expect(mockMemorizedService.addMemorized).toHaveBeenCalled();
    });

    it('should navigate to /memorized after successful submit', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.e.description.setValue('Test');
      component.e.amount.setValue(50);
      await component.onSubmit();
      expect(navigateSpy).toHaveBeenCalledWith(['/memorized']);
    });
  });

  describe('onCancel', () => {
    it('should navigate to /memorized', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onCancel();
      expect(navigateSpy).toHaveBeenCalledWith(['/memorized']);
    });
  });

  describe('split by percentage', () => {
    it('should set splitByPercentage to true when onSplitByPercentageClick is called', () => {
      component.onSplitByPercentageClick();
      expect(component.splitByPercentage()).toBe(true);
    });

    it('should set splitByPercentage to false when onSplitByAmountClick is called', () => {
      component.onSplitByPercentageClick();
      component.onSplitByAmountClick();
      expect(component.splitByPercentage()).toBe(false);
    });
  });
});
