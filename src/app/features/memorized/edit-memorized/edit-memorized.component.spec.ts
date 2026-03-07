import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { Memorized } from '@models/memorized';
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
  mockMember,
} from '@testing/test-helpers';
import { AllocationUtilsService } from '@utils/allocation-utils.service';
import { StringUtils } from '@utils/string-utils.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditMemorizedComponent } from './edit-memorized.component';

describe('EditMemorizedComponent', () => {
  let fixture: ComponentFixture<EditMemorizedComponent>;
  let component: EditMemorizedComponent;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockMemorizedService: ReturnType<typeof createMockMemorizedService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let router: Router;

  const memberRef = mockDocRef('groups/group-1/members/member-1');
  const categoryRef = mockDocRef('groups/group-1/categories/cat-1');
  const memorizedRef = mockDocRef('groups/group-1/memorized/mem-1');
  const splitMemberRef = mockDocRef('groups/group-1/members/member-2');

  const testMemorized = new Memorized({
    id: 'mem-1',
    description: 'Monthly Dinner',
    categoryRef,
    paidByMemberRef: memberRef,
    sharedAmount: 100,
    allocatedAmount: 100,
    totalAmount: 100,
    splitByPercentage: false,
    splits: [
      {
        owedByMemberRef: splitMemberRef,
        assignedAmount: 100,
        percentage: 0,
        allocatedAmount: 100,
      },
    ],
    ref: memorizedRef,
  });

  beforeEach(async () => {
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockMemorizedService = createMockMemorizedService();
    mockDemoService = createMockDemoService();
    mockDialog = createMockMatDialog();

    mockMemorizedService.updateMemorized.mockResolvedValue(undefined);
    mockMemorizedService.deleteMemorized.mockResolvedValue(undefined);

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
        data: { memorized: testMemorized },
      },
    };

    await TestBed.configureTestingModule({
      imports: [EditMemorizedComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: GroupStore, useValue: createMockGroupStore() },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
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
        { provide: MemorizedService, useValue: mockMemorizedService },
        LocaleService,
        StringUtils,
        AllocationUtilsService,
        DecimalPipe,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditMemorizedComponent);
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
    it('should pre-populate description from memorized data', () => {
      expect(component.e.description.value).toBe('Monthly Dinner');
    });

    it('should pre-populate amount from memorized data', () => {
      expect(component.e.amount.value).toBe(100);
    });

    it('should pre-populate splits from memorized data', () => {
      expect(component.splitsFormArray.length).toBe(1);
    });

    it('should load memorized from route data', () => {
      expect(component.memorized().description).toBe('Monthly Dinner');
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

  describe('memorizedFullyAllocated', () => {
    it('should return true when amount equals allocated total from splits', () => {
      expect(component.memorizedFullyAllocated()).toBe(true);
    });
  });

  describe('onSubmit', () => {
    it('should show demo restriction in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      await component.onSubmit();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockMemorizedService.updateMemorized).not.toHaveBeenCalled();
    });

    it('should call memorizedService.updateMemorized when not in demo mode', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      await component.onSubmit();
      expect(mockMemorizedService.updateMemorized).toHaveBeenCalledWith(
        memorizedRef,
        expect.any(Object)
      );
    });

    it('should navigate to /memorized after successful submit', async () => {
      mockDemoService.isInDemoMode.mockReturnValue(false);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      await component.onSubmit();
      expect(navigateSpy).toHaveBeenCalledWith(['/memorized']);
    });
  });

  describe('onDelete', () => {
    it('should show demo restriction in demo mode', () => {
      mockDemoService.isInDemoMode.mockReturnValue(true);
      component.onDelete();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
    });

    it('should open delete dialog when not in demo mode', () => {
      // EditMemorizedComponent imports MatDialogModule which overrides the test-level mock,
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
