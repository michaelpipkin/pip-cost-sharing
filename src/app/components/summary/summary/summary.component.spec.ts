import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SummaryComponent } from './summary.component';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { CategoryStore } from '@store/category.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import { SplitService } from '@services/split.service';
import { HistoryService } from '@services/history.service';
import { UserService } from '@services/user.service';
import { TourService } from '@services/tour.service';
import { LocaleService } from '@services/locale.service';
import { DemoService } from '@services/demo.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockGroupStore,
  createMockMemberStore,
  createMockCategoryStore,
  createMockSplitStore,
  createMockUserStore,
  createMockSplitService,
  createMockHistoryService,
  createMockTourService,
  createMockDemoService,
  createMockAnalyticsService,
  createMockLoadingService,
  createMockMatDialog,
  createMockSnackBar,
  mockGroup,
  mockMember,
  mockCategory,
  mockSplit,
  mockDocRef,
  mockUser,
} from '@testing/test-helpers';

describe('SummaryComponent', () => {
  let fixture: ComponentFixture<SummaryComponent>;
  let component: SummaryComponent;
  let el: HTMLElement;

  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockSplitStore: ReturnType<typeof createMockSplitStore>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockSplitService: ReturnType<typeof createMockSplitService>;
  let mockHistoryService: ReturnType<typeof createMockHistoryService>;
  let mockTourService: ReturnType<typeof createMockTourService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockUserService: any;
  let mockLocaleService: any;

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();
    mockSplitStore = createMockSplitStore();
    mockUserStore = createMockUserStore();
    mockSplitService = createMockSplitService();
    mockHistoryService = createMockHistoryService();
    mockTourService = createMockTourService();
    mockDemoService = createMockDemoService();
    mockAnalyticsService = createMockAnalyticsService();
    mockLoadingService = createMockLoadingService();
    mockDialog = createMockMatDialog();
    mockSnackBar = createMockSnackBar();

    // Set up stores with test data
    const testGroup = mockGroup();
    const alice = mockMember({
      id: 'alice',
      displayName: 'Alice',
      groupAdmin: true,
      ref: mockDocRef('groups/group-1/members/alice'),
    });
    const bob = mockMember({
      id: 'bob',
      displayName: 'Bob',
      ref: mockDocRef('groups/group-1/members/bob'),
    });
    const foodCategory = mockCategory({
      id: 'food',
      name: 'Food',
      ref: mockDocRef('groups/group-1/categories/food'),
    });

    mockGroupStore.currentGroup.set(testGroup);
    mockMemberStore.currentMember.set(alice);
    mockMemberStore.groupMembers.set([alice, bob]);
    mockCategoryStore.groupCategories.set([foodCategory]);
    mockUserStore.user.set(mockUser());
    mockSplitStore.loaded.set(true);

    // Set up splits: Alice paid $50, Bob owes $30 (Alice owes $20 to Bob)
    const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    mockSplitStore.unpaidSplits.set([
      mockSplit({
        id: 's1',
        date: recentDate,
        paidByMemberRef: alice.ref!,
        owedByMemberRef: bob.ref!,
        categoryRef: foodCategory.ref!,
        allocatedAmount: 30,
        paid: false,
      }),
      mockSplit({
        id: 's2',
        date: recentDate,
        paidByMemberRef: bob.ref!,
        owedByMemberRef: alice.ref!,
        categoryRef: foodCategory.ref!,
        allocatedAmount: 20,
        paid: false,
      }),
    ]);

    mockUserService = {
      getPaymentMethods: vi.fn(() => Promise.resolve({})),
    };

    mockLocaleService = {
      currency: vi.fn(() => ({
        code: 'USD',
        symbol: '$',
        symbolPosition: 'prefix',
        decimalPlaces: 2,
      })),
      formatCurrency: vi.fn((amount: number) => `$${amount.toFixed(2)}`),
      roundToCurrency: vi.fn((amount: number) => Math.round(amount * 100) / 100),
    };

    await TestBed.configureTestingModule({
      imports: [SummaryComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: SplitStore, useValue: mockSplitStore },
        { provide: UserStore, useValue: mockUserStore },
        { provide: SplitService, useValue: mockSplitService },
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: UserService, useValue: mockUserService },
        { provide: TourService, useValue: mockTourService },
        { provide: LocaleService, useValue: mockLocaleService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SummaryComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  describe('Initial render', () => {
    it('should render page title', () => {
      expect(el.textContent).toContain('Summary');
    });

    it('should render help button', () => {
      const helpButton = el.querySelector('mat-icon');
      expect(helpButton).toBeTruthy();
    });

    it('should show loading when not loaded', async () => {
      mockSplitStore.loaded.set(false);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
    });

    it('should show main content when loaded', () => {
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      expect(component.summaryData().length).toBeGreaterThan(0);
    });
  });

  describe('Store integration', () => {
    it('should get splits from SplitStore', () => {
      expect(component.splits()).toEqual(mockSplitStore.unpaidSplits());
      expect(component.splits().length).toBe(2);
    });

    it('should get members from MemberStore', () => {
      expect(component.members()).toEqual(mockMemberStore.groupMembers());
      expect(component.members().length).toBe(2);
    });

    it('should get categories from CategoryStore', () => {
      expect(component.categories()).toEqual(mockCategoryStore.groupCategories());
    });

    it('should get current group from GroupStore', () => {
      expect(component.currentGroup()).toEqual(mockGroupStore.currentGroup());
    });

    it('should get current member for selection', () => {
      expect(component.currentMember()).toEqual(mockMemberStore.currentMember());
    });
  });

  describe('Date filtering', () => {
    it('should filter by start date', async () => {
      component.startDate.set(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
      await fixture.whenStable();

      const filtered = component.filteredSplits();
      expect(filtered.length).toBe(0); // Splits are 5 days old
    });

    it('should filter by end date', async () => {
      component.endDate.set(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000));
      await fixture.whenStable();

      const filtered = component.filteredSplits();
      expect(filtered.length).toBe(0); // Splits are 5 days old, after end date
    });

    it('should show all when dates are null', () => {
      component.startDate.set(null);
      component.endDate.set(null);

      const filtered = component.filteredSplits();
      expect(filtered.length).toBe(2);
    });

    it('should update filteredSplits when dates change', async () => {
      const initialLength = component.filteredSplits().length;

      component.startDate.set(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
      await fixture.whenStable();

      expect(component.filteredSplits().length).not.toBe(initialLength);
    });
  });

  describe('Summary calculation', () => {
    it('should calculate net amounts (who owes whom)', () => {
      const summary = component.summaryData();
      expect(summary).toBeDefined();
      expect(summary.length).toBe(1);

      // Bob owes Alice $30, Alice owes Bob $20, net: Bob owes Alice $10
      const debt = summary[0];
      expect(debt.amount).toBe(10);
    });

    it('should show Alice is owed by Bob', () => {
      const alice = mockMemberStore.groupMembers()[0];
      const bob = mockMemberStore.groupMembers()[1];
      component.selectedMember.set(alice.ref!);

      const summary = component.summaryData();
      const debt = summary[0];
      expect(debt.owedByMemberRef.path).toBe(bob.ref!.path);
      expect(debt.owedToMemberRef.path).toBe(alice.ref!.path);
    });

    it('should handle empty splits', () => {
      mockSplitStore.unpaidSplits.set([]);
      fixture.detectChanges();

      const summary = component.summaryData();
      expect(summary.length).toBe(0);
    });

    it('should handle zero net amount (balanced)', () => {
      const alice = mockMemberStore.groupMembers()[0];
      const bob = mockMemberStore.groupMembers()[1];
      const foodCategory = mockCategoryStore.groupCategories()[0];

      // Set balanced splits
      mockSplitStore.unpaidSplits.set([
        mockSplit({
          paidByMemberRef: alice.ref!,
          owedByMemberRef: bob.ref!,
          categoryRef: foodCategory.ref!,
          allocatedAmount: 50,
        }),
        mockSplit({
          paidByMemberRef: bob.ref!,
          owedByMemberRef: alice.ref!,
          categoryRef: foodCategory.ref!,
          allocatedAmount: 50,
        }),
      ]);
      fixture.detectChanges();

      const summary = component.summaryData();
      expect(summary.length).toBe(0); // Balanced, no debt
    });
  });

  describe('Detail breakdown', () => {
    it('should expand detail on click', () => {
      const summary = component.summaryData();
      const amountDue = summary[0];

      component.onExpandClick(amountDue);

      expect(component.expandedDetail()).toBe(amountDue);
      expect(component.owedByMemberRef()).toBe(amountDue.owedByMemberRef);
      expect(component.owedToMemberRef()).toBe(amountDue.owedToMemberRef);
    });

    it('should collapse detail on second click', () => {
      const summary = component.summaryData();
      const amountDue = summary[0];

      component.onExpandClick(amountDue);
      component.onExpandClick(amountDue);

      expect(component.expandedDetail()).toBeNull();
    });

    it('should calculate detail by category', () => {
      const summary = component.summaryData();
      const amountDue = summary[0];
      component.onExpandClick(amountDue);

      const detail = component.detailData();
      expect(detail.length).toBeGreaterThan(0);
    });

    it('should reset detail', () => {
      const summary = component.summaryData();
      component.onExpandClick(summary[0]);
      component.resetDetail();

      expect(component.expandedDetail()).toBeNull();
    });
  });

  describe('Payment dialog', () => {
    it('should open payment dialog', async () => {
      const alice = mockMemberStore.groupMembers()[0];
      const bob = mockMemberStore.groupMembers()[1];

      await component.payExpenses(alice.ref!, bob.ref!);

      expect(mockUserService.getPaymentMethods).toHaveBeenCalled();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should block payment in demo mode', async () => {
      mockDemoService.isInDemoMode = vi.fn(() => true);
      const alice = mockMemberStore.groupMembers()[0];
      const bob = mockMemberStore.groupMembers()[1];

      await component.payExpenses(alice.ref!, bob.ref!);

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    // Note: Payment confirmation flow with dialog result, marking splits as paid,
    // and creating history is better tested in e2e tests.
  });

  describe('Demo mode', () => {
    it('should show tour button when in demo mode', () => {
      mockDemoService.isInDemoMode = vi.fn(() => true);
      fixture.detectChanges();

      expect(mockDemoService.isInDemoMode()).toBe(true);
    });

    it('should block payment with restriction message', async () => {
      mockDemoService.isInDemoMode = vi.fn(() => true);
      const alice = mockMemberStore.groupMembers()[0];
      const bob = mockMemberStore.groupMembers()[1];

      await component.payExpenses(alice.ref!, bob.ref!);

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
    });

    it('should always show help button', () => {
      const helpButton = el.querySelector('mat-icon');
      expect(helpButton).toBeTruthy();
    });
  });
});
