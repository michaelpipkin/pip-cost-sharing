import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AppCheckErrorDialogComponent } from '@components/app-check-error-dialog/app-check-error-dialog.component';
import { AmountDue } from '@models/amount-due';
import { GuidedTourConfig } from '@models/guided-tour';
import { Split } from '@models/split';
import { HelpDialogComponent } from '../../help/help-dialog/help-dialog.component';
import { FirebaseError } from 'firebase/app';
import { AnalyticsService } from '@services/analytics.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { HistoryService } from '@services/history.service';
import { LocaleService } from '@services/locale.service';
import { MediaQueryService } from '@services/media-query.service';
import { SplitService } from '@services/split.service';
import { UserService } from '@services/user.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { SplitStore } from '@store/split.store';
import { UserStore } from '@store/user.store';
import { GROUP_MAIL_LIMIT_REACHED } from '@utils/callable-error.util';
import {
  createMockAnalyticsService,
  createMockCategoryStore,
  createMockGroupStore,
  createMockHistoryService,
  createMockMediaQueryService,
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
import { PaymentDialogComponent } from '../payment-dialog/payment-dialog.component';
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
  let mockMediaQuery: ReturnType<typeof createMockMediaQueryService>;

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
    mockMediaQuery = createMockMediaQueryService(false);

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
        { provide: MediaQueryService, useValue: mockMediaQuery },
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

    it('should render the help button', () => {
      expect(el.querySelector('[data-testid="summary-help-button"]')).toBeTruthy();
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

  describe('Payment requests', () => {
    it.each([
      ['sent', 'Payment request email sent successfully'],
      [
        'not_registered',
        'Bob is not a registered user and cannot receive emails',
      ],
      ['opted_out', 'Bob has opted out of email notifications'],
    ])(
      'sends the group id, member refs and numeric amount, then shows the %s message',
      async (result, message) => {
        mockUserService.sendPaymentRequestEmail = vi
          .fn()
          .mockResolvedValue(result);
        const row = component.summaryData()[0]!; // Bob owes Alice 10

        await component.requestPayment(row);

        expect(mockUserService.sendPaymentRequestEmail).toHaveBeenCalledWith(
          mockGroupStore.currentGroup()!.id,
          row.owedByMemberRef,
          row.owedToMemberRef,
          10
        );
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          expect.anything(),
          { data: { message } }
        );
      }
    );

    it.each([
      [1, 'Payment request(s) sent to 1 member(s)'],
      [0, 'No eligible members to request payment from'],
    ])(
      'requests every settlement transfer by ref and amount (%i sent)',
      async (sent, message) => {
        mockUserService.sendGroupPaymentRequestEmails = vi
          .fn()
          .mockResolvedValue({ sent, skipped: 1 - sent });
        const alice = mockMemberStore.groupMembers()[0]!;
        const bob = mockMemberStore.groupMembers()[1]!;

        await component.requestAllPayments();

        expect(
          mockUserService.sendGroupPaymentRequestEmails
        ).toHaveBeenCalledWith(mockGroupStore.currentGroup()!.id, [
          { owedByMemberRef: bob.ref, owedToMemberRef: alice.ref, amount: 10 },
        ]);
        expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
          expect.anything(),
          { data: { message } }
        );
      }
    );
  });

  // ---- Coverage pass B -------------------------------------------------

  const rowText = (id: string) =>
    Array.from(el.querySelectorAll(`[data-testid="${id}"]`)).map((n) =>
      n.textContent?.trim()
    );
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /** Answers the next dialog the page opens; resolves when its close handler is done. */
  function answerNextDialog(result: unknown): () => Promise<void> {
    let handled: Promise<void> = Promise.resolve();
    mockDialog.open.mockImplementationOnce((() => ({
      afterClosed: () => ({
        subscribe: (cb: (r: unknown) => Promise<void>) => {
          handled = cb(result);
        },
      }),
    })) as any);
    return () => handled;
  }
  const lastSnackbar = () =>
    (mockSnackBar.openFromComponent.mock.calls.at(-1) as any)?.[1]?.data
      ?.message;

  describe('Who the summary is for', () => {
    it('shows what the selected member owes when they are the debtor', () => {
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      component.selectedMember.set(bob.ref!);

      const [row] = component.summaryData();

      expect(component.summaryData()).toHaveLength(1);
      expect(row!.owedByMemberRef).toBe(bob.ref);
      expect(row!.owedToMemberRef).toBe(alice.ref);
      expect(row!.amount).toBe(10);
    });

    it('shows nothing when there is no current member', async () => {
      mockMemberStore.currentMember.set(null);
      await settle();

      expect(component.selectedMember()).toBeNull();
      expect(component.summaryData()).toEqual([]);
    });

    it('lists the selected member’s balances in the table', async () => {
      await settle();

      expect(rowText('summary-owed-by')).toEqual(['Bob']);
      expect(rowText('summary-owed-to')).toEqual(['Alice']);
      expect(rowText('summary-amount')).toEqual(['$10.00']);
    });
  });

  describe('Date filtering boundaries', () => {
    const inJanuary = (day: number, hour = 13) =>
      new Date(2025, 0, day, hour, 0, 0);
    beforeEach(() => {
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      mockSplitStore.unpaidSplits.set([
        mockSplit({
          id: 'jan-15',
          date: inJanuary(15),
          paidByMemberRef: alice.ref!,
          owedByMemberRef: bob.ref!,
          allocatedAmount: 30,
        }),
      ]);
    });

    it('includes a split on the end date itself', () => {
      component.endDate.set(new Date(2025, 0, 15));
      expect(component.filteredSplits().map((s) => s.id)).toEqual(['jan-15']);
    });

    it('excludes a split the day after the end date', () => {
      component.endDate.set(new Date(2025, 0, 14));
      expect(component.filteredSplits()).toEqual([]);
    });

    it('includes a split on the start date itself', () => {
      component.startDate.set(new Date(2025, 0, 15));
      expect(component.filteredSplits().map((s) => s.id)).toEqual(['jan-15']);
    });

    it('excludes a split the day before the start date', () => {
      component.startDate.set(new Date(2025, 0, 16));
      expect(component.filteredSplits()).toEqual([]);
    });
  });

  describe('Detail breakdown by category', () => {
    it('shows nothing until a row is expanded', () => {
      expect(component.detailData()).toEqual([]);
    });

    it('lists only categories that have splits between the two members, with the net amount', () => {
      mockCategoryStore.groupCategories.set([
        ...mockCategoryStore.groupCategories(),
        mockCategory({
          id: 'travel',
          name: 'Travel',
          ref: mockDocRef('groups/group-1/categories/travel'),
        }),
      ]);
      component.onExpandClick(component.summaryData()[0]!);

      const detail = component.detailData();

      expect(detail.map((d) => d.category?.name)).toEqual(['Food']);
      // Alice paid 30 of it, Bob paid 20: Bob owes Alice the difference.
      expect(detail[0]!.amount).toBe(10);
    });
  });

  /** Brings a third person in, who owes Alice 12: the settlement section needs three. */
  const addCarol = (userRef: any = mockDocRef('users/carol')) => {
    const alice = mockMemberStore.groupMembers()[0]!;
    const bob = mockMemberStore.groupMembers()[1]!;
    const carol = mockMember({
      id: 'carol',
      displayName: 'Carol',
      userRef,
      ref: mockDocRef('groups/group-1/members/carol'),
    });
    mockMemberStore.groupMembers.set([alice, bob, carol]);
    mockSplitStore.unpaidSplits.set([
      ...mockSplitStore.unpaidSplits(),
      mockSplit({
        id: 's3',
        date: new Date(Date.now() - 2 * 86_400_000),
        paidByMemberRef: alice.ref!,
        owedByMemberRef: carol.ref!,
        categoryRef: mockCategoryStore.groupCategories()[0]!.ref!,
        allocatedAmount: 12,
      }),
    ]);
  };

  describe('Small screens', () => {
    it('shows both tables on a wide screen, with no view switch', async () => {
      addCarol();
      await settle();

      expect(el.querySelector('[data-testid="summary-view-toggle"]')).toBeNull();
      expect(el.querySelector('[data-testid="summary-row"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="least-transfers-table"]')).toBeTruthy();
    });

    it('shows one table at a time and lets the user switch between them', async () => {
      addCarol();
      mockMediaQuery.state.set(true);
      await settle();

      const toggle = el.querySelector(
        '[data-testid="summary-view-toggle"]'
      ) as HTMLElement;
      expect(toggle).toBeTruthy();
      expect(el.querySelector('[data-testid="summary-row"]')).toBeTruthy();
      expect(el.querySelector('[data-testid="least-transfers-table"]')).toBeNull();

      (
        el.querySelector(
          '[data-testid="summary-view-settlement-toggle"] button'
        ) as HTMLElement
      ).click();
      await settle();

      expect(component.summaryView()).toBe('settlement');
      expect(el.querySelector('[data-testid="summary-row"]')).toBeNull();
      expect(el.querySelector('[data-testid="least-transfers-table"]')).toBeTruthy();
    });

    it('offers no switch when only two people are involved', async () => {
      mockMediaQuery.state.set(true);
      await settle();

      expect(el.querySelector('[data-testid="summary-view-toggle"]')).toBeNull();
      expect(el.querySelector('[data-testid="summary-row"]')).toBeTruthy();
    });
  });

  describe('Marking expenses paid', () => {
    const alice = () => mockMemberStore.groupMembers()[0]!;
    const bob = () => mockMemberStore.groupMembers()[1]!;
    let paySplits: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      paySplits = vi.fn().mockResolvedValue(undefined);
      (mockSplitService as any).paySplitsBetweenMembers = paySplits;
      // Distinct refs so the history's splitsPaid can be checked.
      mockSplitStore.unpaidSplits.set(
        mockSplitStore.unpaidSplits().map(
          (s, i) =>
            new Split({
              ...s,
              ref: mockDocRef(`groups/group-1/splits/s${i + 1}`),
            })
        )
      );
    });

    it('opens the payment dialog with the payee name and their payment methods', async () => {
      mockUserService.getPaymentMethods.mockResolvedValueOnce({
        venmoId: '@alice',
        zelleId: 'alice@pay.com',
      });

      await component.payExpenses(alice().ref!, bob().ref!);

      expect(mockUserService.getPaymentMethods).toHaveBeenCalledWith(
        alice().ref
      );
      expect(mockDialog.open).toHaveBeenCalledWith(PaymentDialogComponent, {
        data: {
          payToMemberName: 'Alice',
          venmoId: '@alice',
          zelleId: 'alice@pay.com',
        },
      });
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('records nothing when the dialog is dismissed', async () => {
      const handled = answerNextDialog(false);

      await component.payExpenses(alice().ref!, bob().ref!);
      await handled();

      expect(paySplits).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });

    it('marks the splits between the two members paid with a dated history of the net amount', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 2, 5, 12, 0, 0));
      try {
        const handled = answerNextDialog(true);

        await component.payExpenses(alice().ref!, bob().ref!);
        await handled();

        const [s1, s2] = mockSplitStore.unpaidSplits();
        expect(paySplits).toHaveBeenCalledWith(
          'group-1',
          [s1, s2],
          {
            paidByMemberRef: bob().ref,
            paidToMemberRef: alice().ref,
            date: '2026-03-05',
            // Alice paid 30 for Bob, Bob paid 20 for Alice: Bob settles 10.
            totalPaid: 10,
            splitsPaid: [s1!.ref, s2!.ref],
          }
        );
        expect(lastSnackbar()).toBe('Expenses have been marked paid');
        expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves out splits that do not involve both members', async () => {
      const carol = mockDocRef('groups/group-1/members/carol');
      mockSplitStore.unpaidSplits.set([
        ...mockSplitStore.unpaidSplits(),
        mockSplit({
          id: 'with-carol',
          date: new Date(Date.now() - 86_400_000),
          paidByMemberRef: alice().ref!,
          owedByMemberRef: carol,
          allocatedAmount: 99,
          ref: mockDocRef('groups/group-1/splits/with-carol'),
        }),
      ]);
      const handled = answerNextDialog(true);

      await component.payExpenses(alice().ref!, bob().ref!);
      await handled();

      const paid = paySplits.mock.calls[0]![1] as { id: string }[];
      expect(paid.map((s) => s.id)).toEqual(['s1', 's2']);
    });

    it.each([
      [new Error('write failed'), 'write failed'],
      ['denied', 'Unknown error'],
    ])('logs the failure and tells the user (%s)', async (failure, message) => {
      paySplits.mockRejectedValueOnce(failure);
      const handled = answerNextDialog(true);

      await component.payExpenses(alice().ref!, bob().ref!);
      await handled();

      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Summary Component',
        'mark_expenses_paid',
        'Failed to mark expenses paid',
        message
      );
      expect(lastSnackbar()).toBe(
        'Something went wrong - could not mark expenses paid'
      );
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('starts from the Pay button on a row', async () => {
      await settle();
      const open = mockDialog.open.mock.calls.length;

      (
        el.querySelector('[data-testid="pay-expenses-button"]') as HTMLElement
      ).click();
      await settle();

      expect(mockUserService.getPaymentMethods).toHaveBeenCalledWith(
        alice().ref
      );
      expect(mockDialog.open.mock.calls.length).toBe(open + 1);
    });

    // Regression for B18: payExpenses had try/finally but no catch around
    // getPaymentMethods, so a failure became an unhandled rejection with no
    // message and the dialog never opened.
    it('resolves and tells the user when the payment methods cannot be loaded', async () => {
      mockUserService.getPaymentMethods.mockRejectedValueOnce(
        new Error('offline')
      );
      mockDialog.open.mockClear();
      mockLoadingService.loadingOff.mockClear();

      await expect(
        component.payExpenses(alice().ref!, bob().ref!)
      ).resolves.toBeUndefined();

      expect(lastSnackbar()).toMatch(/could not|went wrong|payment method/i);
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Summary Component',
        'load_payment_methods',
        'Failed to load payment methods',
        'offline'
      );
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('Settling the group', () => {
    let settleGroup: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      settleGroup = vi.fn().mockResolvedValue(undefined);
      (mockSplitService as any).settleGroup = settleGroup;
    });

    it('opens nothing when nobody owes anything', () => {
      mockSplitStore.unpaidSplits.set([]);
      mockDialog.open.mockClear();

      expect(component.settleGroupAction()).toBeNull();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('shows the transfers and their text in the confirmation', () => {
      const [transfer] = component.leastTransfers();

      component.settleGroupAction();

      expect(mockDialog.open).toHaveBeenCalledWith(SettleGroupDialogComponent, {
        data: {
          transfers: [transfer],
          settlementText: 'Group Settlement Transfers\n\nBob pays Alice: $10.00',
        },
      });
    });

    it('settles the filtered splits with the transfers once confirmed', async () => {
      const handled = answerNextDialog(true);

      component.settleGroupAction();
      await handled();

      const [s1, s2] = mockSplitStore.unpaidSplits();
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      expect(settleGroup).toHaveBeenCalledWith(
        'group-1',
        [s1, s2],
        [
          expect.objectContaining({
            owedByMemberRef: bob.ref,
            owedToMemberRef: alice.ref,
            amount: 10,
          }),
        ]
      );
      expect(lastSnackbar()).toBe('Group settlement completed successfully');
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('does nothing when the confirmation is dismissed', async () => {
      const handled = answerNextDialog(false);

      component.settleGroupAction();
      await handled();

      expect(settleGroup).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });

    it.each([
      [new Error('write failed'), 'write failed'],
      ['denied', 'Unknown error'],
    ])('logs the failure and tells the user (%s)', async (failure, message) => {
      settleGroup.mockRejectedValueOnce(failure);
      const handled = answerNextDialog(true);

      component.settleGroupAction();
      await handled();

      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Summary Component',
        'settle_group',
        'Failed to settle group',
        message
      );
      expect(lastSnackbar()).toBe(
        'Something went wrong - could not settle group'
      );
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('starts from the Settle Group button', async () => {
      addCarol();
      await settle();
      mockDialog.open.mockClear();

      (
        el.querySelector('[data-testid="settle-group-button"]') as HTMLElement
      ).click();

      expect(mockDialog.open).toHaveBeenCalledWith(
        SettleGroupDialogComponent,
        expect.anything()
      );
    });
  });

  describe('Copying to the clipboard', () => {
    let originalClipboard: PropertyDescriptor | undefined;
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalClipboard = Object.getOwnPropertyDescriptor(
        navigator,
        'clipboard'
      );
      writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard);
      } else {
        delete (navigator as any).clipboard;
      }
    });

    it('copies the aligned category breakdown for an expanded row', async () => {
      const row = component.summaryData()[0]!;
      component.onExpandClick(row);

      await component.copySummaryToClipboard(row);

      expect(writeText).toHaveBeenCalledWith(
        [
          'Expenses Summary',
          'Bob owes Alice $10.00',
          '',
          'Breakdown by Category:',
          '=============',
          'Food:  $10.00',
        ].join('\n')
      );
      expect(lastSnackbar()).toBe('Summary copied to clipboard');
    });

    it('copies just the headline when no breakdown is open, with "Unknown" for missing members', async () => {
      await component.copySummaryToClipboard(
        new AmountDue({
          owedByMemberRef: mockDocRef('groups/group-1/members/x'),
          owedToMemberRef: mockDocRef('groups/group-1/members/y'),
          amount: 5,
        })
      );

      expect(writeText).toHaveBeenCalledWith(
        'Expenses Summary\nUnknown owes Unknown $5.00'
      );
    });

    it('copies from the row’s copy button', async () => {
      await settle();
      (
        el.querySelector('[data-testid="summary-row"]') as HTMLElement
      ).click();
      await settle();

      (
        el.querySelector('[data-testid="copy-summary-button"]') as HTMLElement
      ).click();
      await settle();

      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText.mock.calls[0]![0]).toContain('Bob owes Alice $10.00');
    });

    it('copies every settlement transfer', async () => {
      await component.copySettlementToClipboard();

      expect(writeText).toHaveBeenCalledWith(
        'Group Settlement Transfers\n\nBob pays Alice: $10.00'
      );
      expect(lastSnackbar()).toBe('Settlement copied to clipboard');
    });

    it('uses "Unknown" for a payee who is no longer in the group', async () => {
      mockMemberStore.groupMembers.set([mockMemberStore.groupMembers()[1]!]);
      mockMemberStore.currentMember.set(mockMemberStore.groupMembers()[0]!);
      await settle();

      await component.copySettlementToClipboard();

      expect(writeText).toHaveBeenCalledWith(
        'Group Settlement Transfers\n\nBob pays Unknown: $10.00'
      );
    });

    it('copies the settlement from its button', async () => {
      addCarol();
      await settle();

      (
        el.querySelector('[data-testid="copy-settlement-button"]') as HTMLElement
      ).click();
      await settle();

      expect(writeText).toHaveBeenCalledWith(
        'Group Settlement Transfers\n\nCarol pays Alice: $12.00\nBob pays Alice: $10.00'
      );
    });

    it('uses "Unknown" for a settlement member who is no longer in the group', async () => {
      mockMemberStore.groupMembers.set([mockMemberStore.groupMembers()[0]!]);
      await settle();

      await component.copySettlementToClipboard();

      expect(writeText).toHaveBeenCalledWith(
        'Group Settlement Transfers\n\nUnknown pays Alice: $10.00'
      );
    });

    it.each([
      ['summary', (c: SummaryComponent) => c.copySummaryToClipboard(new AmountDue({
        owedByMemberRef: mockDocRef('a/b'),
        owedToMemberRef: mockDocRef('a/c'),
        amount: 1,
      })), 'copy_summary_to_clipboard', 'Failed to copy summary to clipboard', 'Failed to copy summary'],
      ['settlement', (c: SummaryComponent) => c.copySettlementToClipboard(), 'copy_settlement_to_clipboard', 'Failed to copy settlement to clipboard', 'Failed to copy settlement'],
    ])(
      'reports a refused %s copy: the Error text and a log, or a generic message',
      async (_what, copy, event, logMessage, generic) => {
        writeText.mockRejectedValueOnce(new Error('Document is not focused'));
        await copy(component);
        expect(lastSnackbar()).toBe('Document is not focused');
        expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
          'Summary Component',
          event,
          logMessage,
          'Document is not focused'
        );

        mockAnalyticsService.logError.mockClear();
        writeText.mockRejectedValueOnce('denied');
        await copy(component);
        expect(lastSnackbar()).toBe(generic);
        expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
      }
    );
  });

  describe('Requesting payment failures', () => {
    it.each([
      [new Error('callable failed'), 'callable failed'],
      ['denied', 'Unknown error'],
    ])('logs a failed request and tells the user (%s)', async (failure, message) => {
      mockUserService.sendPaymentRequestEmail = vi
        .fn()
        .mockRejectedValue(failure);

      await component.requestPayment(component.summaryData()[0]!);

      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Summary Component',
        'request_payment',
        'Failed to send payment request',
        message
      );
      expect(lastSnackbar()).toBe(
        'Something went wrong - could not send payment request'
      );
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it.each([
      [new Error('callable failed'), 'callable failed'],
      ['denied', 'Unknown error'],
    ])('logs a failed request-all and tells the user (%s)', async (failure, message) => {
      mockUserService.sendGroupPaymentRequestEmails = vi
        .fn()
        .mockRejectedValue(failure);

      await component.requestAllPayments();

      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Summary Component',
        'request_all_payments',
        'Failed to send group payment requests',
        message
      );
      expect(lastSnackbar()).toBe(
        'Something went wrong - could not send payment requests'
      );
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    // The server's per-caller daily allowance (functions/src/mail-allowance.ts).
    const limitRefusal = () =>
      new FirebaseError(
        'functions/resource-exhausted',
        `${GROUP_MAIL_LIMIT_REACHED} [429]`
      );

    it('says the daily group-mail limit was reached, without logging an error (one request)', async () => {
      mockUserService.sendPaymentRequestEmail = vi
        .fn()
        .mockRejectedValue(limitRefusal());

      await component.requestPayment(component.summaryData()[0]!);

      expect(lastSnackbar()).toBe(GROUP_MAIL_LIMIT_REACHED);
      expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('says the daily group-mail limit was reached, without logging an error (request all)', async () => {
      mockUserService.sendGroupPaymentRequestEmails = vi
        .fn()
        .mockRejectedValue(limitRefusal());

      await component.requestAllPayments();

      expect(lastSnackbar()).toBe(GROUP_MAIL_LIMIT_REACHED);
      expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
    });

    it("shows the server's wording when a call would only go over the limit", async () => {
      mockUserService.sendGroupPaymentRequestEmails = vi
        .fn()
        .mockRejectedValue(
          new FirebaseError(
            'functions/resource-exhausted',
            "This would go over today's limit for group emails. Try again tomorrow. [429]"
          )
        );

      await component.requestAllPayments();

      expect(lastSnackbar()).toBe(
        "This would go over today's limit for group emails. Try again tomorrow."
      );
      expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
    });

    // A later batch refused; the earlier ones went out.
    it.each([
      [3, "Sent 3 payment requests; the rest would go over today's limit for group emails."],
      [1, "Sent 1 payment request; the rest would go over today's limit for group emails."],
      [0, "No payment requests were sent: that would go over today's limit for group emails."],
    ])('says how many requests went out before the limit (%i)', async (sent, message) => {
      mockUserService.sendGroupPaymentRequestEmails = vi
        .fn()
        .mockResolvedValue({ sent, skipped: 0, limitReached: true });

      await component.requestAllPayments();

      expect(lastSnackbar()).toBe(message);
      expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
    });

    it('opens the App Check dialog instead when the callable is refused as unauthenticated', async () => {
      mockUserService.sendPaymentRequestEmail = vi
        .fn()
        .mockRejectedValue(
          new FirebaseError('functions/unauthenticated', 'unauthenticated')
        );
      mockSnackBar.openFromComponent.mockClear();

      await component.requestPayment(component.summaryData()[0]!);

      expect(mockDialog.open).toHaveBeenCalledWith(
        AppCheckErrorDialogComponent,
        { disableClose: false, maxWidth: '80vw' }
      );
      expect(mockSnackBar.openFromComponent).not.toHaveBeenCalled();
    });

    it('sends a request from the row’s button, and disables it for a member who is not a registered user', async () => {
      mockUserService.sendPaymentRequestEmail = vi
        .fn()
        .mockResolvedValue('sent');
      await settle();
      const button = () =>
        el.querySelector(
          '[data-testid="request-payment-button"]'
        ) as HTMLButtonElement;
      expect(button().disabled).toBe(false);

      button().click();
      await settle();

      expect(mockUserService.sendPaymentRequestEmail).toHaveBeenCalledTimes(1);
      expect(lastSnackbar()).toBe('Payment request email sent successfully');

      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      mockMemberStore.groupMembers.set([
        alice,
        mockMember({
          id: 'bob',
          displayName: 'Bob',
          userRef: null as any,
          ref: bob.ref,
        }),
      ]);
      await settle();
      expect(button().disabled).toBe(true);
    });

    it('sends one request per settlement transfer from the Request All Payments button', async () => {
      addCarol();
      mockUserService.sendGroupPaymentRequestEmails = vi
        .fn()
        .mockResolvedValue({ sent: 2, skipped: 0 });
      await settle();
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      const carol = mockMemberStore.groupMembers()[2]!;

      (
        el.querySelector(
          '[data-testid="request-all-payments-button"]'
        ) as HTMLElement
      ).click();
      await settle();

      expect(
        mockUserService.sendGroupPaymentRequestEmails
      ).toHaveBeenCalledWith('group-1', [
        { owedByMemberRef: carol.ref, owedToMemberRef: alice.ref, amount: 12 },
        { owedByMemberRef: bob.ref, owedToMemberRef: alice.ref, amount: 10 },
      ]);
      expect(lastSnackbar()).toBe('Payment request(s) sent to 2 member(s)');
    });

    it('disables Request All Payments when nobody who owes is a registered user', async () => {
      addCarol(null);
      const alice = mockMemberStore.groupMembers()[0]!;
      const bob = mockMemberStore.groupMembers()[1]!;
      const carol = mockMemberStore.groupMembers()[2]!;
      mockMemberStore.groupMembers.set([
        alice,
        mockMember({ ...bob, userRef: null as any }),
        carol,
      ]);
      await settle();

      expect(component['hasEmailableRecipients']()).toBe(false);
      expect(
        (
          el.querySelector(
            '[data-testid="request-all-payments-button"]'
          ) as HTMLButtonElement
        ).disabled
      ).toBe(true);
    });

    it('enables Request All Payments when at least one person who owes is a registered user', async () => {
      addCarol(null);
      await settle();

      // Bob (registered) still owes Alice.
      expect(component['hasEmailableRecipients']()).toBe(true);
      expect(
        (
          el.querySelector(
            '[data-testid="request-all-payments-button"]'
          ) as HTMLButtonElement
        ).disabled
      ).toBe(false);
    });
  });

  describe('Help', () => {
    it('opens the Summary section of the help dialog', () => {
      mockDialog.open.mockClear();

      component.showHelp();
      expect(mockDialog.open).toHaveBeenCalledWith(HelpDialogComponent, {
        disableClose: false,
        maxWidth: '80vw',
        data: { sectionId: 'summary' },
      });
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

    it('should add a sample category for the breakdown when the group has none', async () => {
      mockSplitStore.unpaidSplits.set([]);
      mockCategoryStore.groupCategories.set([]);

      component.startTour();
      await runStep('breakdown');

      expect(component.detailData().map((d) => d.category?.name)).toEqual([
        'Default',
      ]);
      tourConfig.onEnd!('closed');
      expect(component.detailData()).toEqual([]);
    });

    it('should open the full help from the tour', () => {
      component.startTour();

      tourConfig.fullHelp!();

      expect(mockDialog.open).toHaveBeenCalledWith(HelpDialogComponent, {
        disableClose: false,
        maxWidth: '80vw',
        data: { sectionId: 'summary' },
      });
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });
});
