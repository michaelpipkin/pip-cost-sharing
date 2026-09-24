import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { GuidedTourConfig } from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { HistoryService } from '@services/history.service';
import { LocaleService } from '@services/locale.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockCategoryStore,
  createMockGroupStore,
  createMockHistoryService,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockSplitService,
  createMockSplitStore,
  createMockUserStore,
  mockCategory,
  mockDocRef,
  mockGroup,
  mockMember,
  mockSplit,
  mockUser,
} from '@testing/test-helpers';
import * as firestoreModule from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettleGroupDialogComponent } from '../settle-group-dialog/settle-group-dialog.component';
import { SummaryComponent } from './summary.component';

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
      roundToCurrency: vi.fn(
        (amount: number) => Math.round(amount * 100) / 100
      ),
    };

    await TestBed.configureTestingModule({
      imports: [SummaryComponent],
      providers: [
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
        { provide: LocaleService, useValue: mockLocaleService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: getFirestore, useValue: {} },
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
      expect(component.categories()).toEqual(
        mockCategoryStore.groupCategories()
      );
    });

    it('should get current group from GroupStore', () => {
      expect(component.currentGroup()).toEqual(mockGroupStore.currentGroup());
    });

    it('should get current member for selection', () => {
      expect(component.currentMember()).toEqual(
        mockMemberStore.currentMember()
      );
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
      const debt = summary[0]!;
      expect(debt.amount).toBe(10);
    });

    it('should show Alice is owed by Bob', () => {
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      component.selectedMember.set(alice.ref!);

      const summary = component.summaryData();
      const debt = summary[0]!;
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
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      const foodCategory = mockCategoryStore.groupCategories()[0]!;

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

  describe('isOwedBySelf', () => {
    it('should be true when the current member owes the debt', () => {
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      const summary = component.summaryData();
      const debt = {
        ...summary[0]!,
        owedByMemberRef: alice.ref!,
        owedToMemberRef: bob.ref!,
      };

      expect(component.isOwedBySelf(debt)).toBe(true);
    });

    it('should be false when another member owes the debt', () => {
      const summary = component.summaryData();
      const debt = summary[0]!;

      expect(component.isOwedBySelf(debt)).toBe(false);
    });
  });

  describe('Detail breakdown', () => {
    it('should expand detail on click', () => {
      const summary = component.summaryData();
      const amountDue = summary[0]!;

      component.onExpandClick(amountDue);

      expect(component.expandedDetail()).toBe(amountDue);
      expect(component.owedByMemberRef()).toBe(amountDue.owedByMemberRef);
      expect(component.owedToMemberRef()).toBe(amountDue.owedToMemberRef);
    });

    it('should collapse detail on second click', () => {
      const summary = component.summaryData();
      const amountDue = summary[0]!;

      component.onExpandClick(amountDue);
      component.onExpandClick(amountDue);

      expect(component.expandedDetail()).toBeNull();
    });

    it('should calculate detail by category', () => {
      const summary = component.summaryData();
      const amountDue = summary[0]!;
      component.onExpandClick(amountDue);

      const detail = component.detailData();
      expect(detail.length).toBeGreaterThan(0);
    });

    it('should reset detail', () => {
      const summary = component.summaryData();
      component.onExpandClick(summary[0]!);
      component.resetDetail();

      expect(component.expandedDetail()).toBeNull();
    });
  });

  describe('Payment dialog', () => {
    it('should open payment dialog', async () => {
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;

      await component.payExpenses(alice.ref!, bob.ref!);

      expect(mockUserService.getPaymentMethods).toHaveBeenCalled();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    // Note: Payment confirmation flow with dialog result, marking splits as paid,
    // and creating history is better tested in e2e tests.
  });

  describe('Help', () => {
    it('should show help button', () => {
      const helpButton = el.querySelector(
        '[data-testid="summary-help-button"]'
      );
      expect(helpButton).toBeTruthy();
    });
  });
  describe('guided tour', () => {
    let tourConfig: GuidedTourConfig;
    let startSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      // Sample members and categories get local refs that must compare
      vi.spyOn(firestoreModule, 'doc').mockImplementation(
        (_fs: unknown, path: string) => mockDocRef(path)
      );
      startSpy = vi
        .spyOn(TestBed.inject(GuidedTourService), 'start')
        .mockImplementation(async (config) => {
          tourConfig = config;
        });
    });

    afterEach(() => vi.restoreAllMocks());

    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const byTestId = (id: string) =>
      el.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
    const runStep = async (id: string) =>
      tourConfig.steps.find((s) => s.id === id)!.beforeShow?.();
    const step = (id: string) => tourConfig.steps.find((s) => s.id === id)!;
    const names = (
      rows: { owedByMember?: any; owedToMember?: any; amount: number }[]
    ) =>
      rows.map(
        (r) =>
          `${r.owedByMember?.displayName} -> ${r.owedToMember?.displayName} ${r.amount}`
      );

    it('should start the summary tour from the help icon', () => {
      byTestId('summary-help-button')!.click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('summary');
    });

    it('should show sample balances with the real members when nothing is owed', async () => {
      mockSplitStore.unpaidSplits.set([]);
      await render();
      expect(byTestId('no-unpaid-splits-placeholder')).toBeTruthy();

      component.startTour();
      await render();

      expect(byTestId('no-unpaid-splits-placeholder')).toBeNull();
      // Bob is the group's other member; Alex fills in as the third person
      expect(names(component.summaryData())).toEqual([
        'Bob -> Alice 10',
        'Alex -> Alice 15',
      ]);
      // The settlement nets it out differently, which is its point
      expect(names(component.leastTransfers())).toEqual([
        'Alex -> Alice 20',
        'Bob -> Alice 5',
      ]);
      expect(step('intro').text).toContain('sample');
      expect(step('settlement').when!()).toBe(true);
    });

    it('should show the sample from your point of view and restore after', () => {
      const bob = mockMemberStore.groupMembers()[1]!;
      mockSplitStore.unpaidSplits.set([]);
      component.selectedMember.set(bob.ref!);
      component.summaryView.set('settlement');

      component.startTour();
      expect(component.selectedMember()).toBe(
        mockMemberStore.currentMember()!.ref
      );

      tourConfig.onEnd!('closed');
      expect(component.selectedMember()).toBe(bob.ref);
      expect(component.summaryView()).toBe('settlement');
      expect(component.summaryData()).toEqual([]);
      expect(component.leastTransfers()).toEqual([]);
    });

    it('should use the real balances when something is owed', () => {
      component.startTour();

      expect(names(component.summaryData())).toEqual(['Bob -> Alice 10']);
      expect(step('intro').text).not.toContain('sample');
      // Only two people, so there's no settlement section to show
      expect(step('settlement').when!()).toBe(false);
    });

    it('should expand the first row for the breakdown and restore after', async () => {
      component.startTour();

      await runStep('breakdown');
      expect(component.expandedDetail()).toBe(component.summaryData()[0]);
      expect(component.detailData()).toHaveLength(1);

      await runStep('table');
      expect(component.expandedDetail()).toBeNull();

      await runStep('breakdown');
      tourConfig.onEnd!('closed');
      expect(component.expandedDetail()).toBeNull();
    });

    it('should open the Settle Group confirmation and close it on end', async () => {
      mockSplitStore.unpaidSplits.set([]);
      component.startTour();

      await runStep('settle-group');
      expect(component.summaryView()).toBe('settlement');
      expect(mockDialog.open).toHaveBeenCalledWith(
        SettleGroupDialogComponent,
        expect.objectContaining({ autoFocus: false })
      );

      const ref = mockDialog.open.mock.results[0]!.value;
      tourConfig.onEnd!('closed');
      expect(ref.close).toHaveBeenCalled();
      expect(component.summaryView()).toBe('individual');
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });
});
