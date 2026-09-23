import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { ExpenseSplitItemForm, MemorizedForm } from '@models/expense';
import { AnalyticsService } from '@services/analytics.service';
import { CalculatorOverlayService } from '@services/calculator-overlay.service';
import { CategoryService } from '@services/category.service';
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
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let router: Router;

  function getModel(): MemorizedForm {
    return {
      ...(component as any).expenseModel(),
      ...(component as any).expenseFormData(),
    };
  }

  function patchModel(
    patch: Partial<Pick<MemorizedForm, 'paidByMember' | 'category' | 'sharedAmount' | 'splits'>>
  ): void {
    (component as any).expenseModel.update((m: any) => ({ ...m, ...patch }));
  }

  function patchFormData(
    patch: Partial<Pick<MemorizedForm, 'amount' | 'description' | 'allocatedAmount'>>
  ): void {
    (component as any).expenseFormData.update((fd: any) => ({ ...fd, ...patch }));
  }

  function patchSplit(index: number, patch: Partial<ExpenseSplitItemForm>): void {
    (component as any).expenseModel.update((m: MemorizedForm) => ({
      ...m,
      splits: m.splits.map((s: ExpenseSplitItemForm, i: number) =>
        i === index ? { ...s, ...patch } : s
      ),
    }));
  }

  function getForm() {
    return (component as any).expenseForm;
  }

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockMemorizedService = createMockMemorizedService();
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
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: getStorage, useValue: {} },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
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
      expect(getModel().paidByMember?.path).toContain('member-1');
    });

    it('should populate activeMembers from store', () => {
      expect(component.activeMembers()).toHaveLength(2);
    });

    it('should populate activeCategories from store', () => {
      expect(component.activeCategories()).toHaveLength(2);
    });

    it('should start with empty splits array', () => {
      expect(getModel().splits).toHaveLength(0);
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
      fixture = TestBed.createComponent(AddMemorizedComponent);
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

  describe('form validation', () => {
    it('should require description', () => {
      patchFormData({ description: '' });
      expect(getForm().description().errors().length).toBeGreaterThan(0);
    });

    it('should require a payer', () => {
      patchModel({ paidByMember: null });
      expect((component as any).paidByMemberValid()).toBe(false);
    });

    it('should reject zero amount', () => {
      patchFormData({ amount: '0.00' });
      expect(getForm().amount().errors().length).toBeGreaterThan(0);
    });

    it('should accept non-zero amount', () => {
      patchFormData({ amount: '25.00' });
      expect(getForm().amount().errors()).toHaveLength(0);
    });
  });

  describe('addSplit / removeSplit', () => {
    it('should add a split row when addSplit is called', () => {
      component.addSplit();
      expect(getModel().splits).toHaveLength(1);
    });

    it('should remove a split row when removeSplit is called', () => {
      component.addSplit();
      component.addSplit();
      component.removeSplit(0);
      expect(getModel().splits).toHaveLength(1);
    });
  });

  describe('memorizedFullyAllocated', () => {
    it('should return true when amount equals allocated total', () => {
      patchFormData({ amount: '10.00' });
      component.addSplit();
      patchSplit(0, { allocatedAmount: 10 });
      expect(component.memorizedFullyAllocated()).toBe(true);
    });

    it('should return false when amount does not equal allocated total', () => {
      patchFormData({ amount: '10.00' });
      expect(component.memorizedFullyAllocated()).toBe(false);
    });
  });

  describe('onSubmit', () => {
    it('should call memorizedService.addMemorized', async () => {
      vi.spyOn(router, 'navigate').mockResolvedValue(true);
      patchModel({
        category: mockDocRef('groups/group-1/categories/cat-1'),
      });
      patchFormData({
        description: 'Test Expense',
        amount: '50.00',
      });
      component.addSplit();
      await component.onSubmit();
      expect(mockMemorizedService.addMemorized).toHaveBeenCalled();
    });

    it('should navigate to /memorized after successful submit', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      patchFormData({ description: 'Test', amount: '50.00' });
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
      component.splitMethod.set('shares');
      component.addSplit();
      component.addSplit();
      component.addSplit();

      patchSplit(0, {
        owedByMemberRef: mockDocRef('groups/group-1/members/member-1'),
        shares: 1,
      });
      patchSplit(1, {
        owedByMemberRef: mockDocRef('groups/group-1/members/member-2'),
        shares: 1,
      });
      patchSplit(2, {
        owedByMemberRef: mockDocRef('groups/group-1/members/member-3'),
        shares: 2,
      });

      patchFormData({ amount: '100.00' });

      component.allocateByShares();
      await fixture.whenStable();

      expect(getModel().splits[0]!.allocatedAmount).toBe(25);
      expect(getModel().splits[1]!.allocatedAmount).toBe(25);
      expect(getModel().splits[2]!.allocatedAmount).toBe(50);
    });
  });
});
