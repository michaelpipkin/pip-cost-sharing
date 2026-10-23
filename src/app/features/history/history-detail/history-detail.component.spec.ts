import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { ConfirmDialogComponent } from '@components/confirm-dialog/confirm-dialog.component';
import { CustomSnackbarComponent } from '@components/custom-snackbar/custom-snackbar.component';
import { LoadingService } from '@components/loading/loading.service';
import { HelpDialogComponent } from '@features/help/help-dialog/help-dialog.component';
import { GuidedTourConfig } from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { HistoryService } from '@services/history.service';
import { SortingService } from '@services/sorting.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { HistoryStore } from '@store/history.store';
import { MemberStore } from '@store/member.store';
import {
  createMockAnalyticsService,
  createMockCategoryStore,
  createMockGroupStore,
  createMockHistoryService,
  createMockHistoryStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockSnackBar,
  createMockSortingService,
  createMockUserService,
  mockDocRef,
  mockGroup,
  mockHistory,
  mockMember,
  mockSplit,
} from '@testing/test-helpers';
import { UserService } from '@services/user.service';
import { GROUP_MAIL_LIMIT_REACHED } from '@utils/callable-error.util';
import * as firestoreModule from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryDetailComponent } from './history-detail.component';

describe('HistoryDetailComponent', () => {
  let fixture: ComponentFixture<HistoryDetailComponent>;
  let component: HistoryDetailComponent;
  let el: HTMLElement;

  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockHistoryStore: ReturnType<typeof createMockHistoryStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let mockHistoryService: ReturnType<typeof createMockHistoryService>;
  let mockSortingService: ReturnType<typeof createMockSortingService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockUserService: ReturnType<typeof createMockUserService>;
  let mockParamGet: ReturnType<typeof vi.fn>;

  const testHistoryId = 'h-1';
  const adminMember = mockMember({
    id: 'admin',
    displayName: 'Admin',
    groupAdmin: true,
    ref: mockDocRef('groups/group-1/members/admin'),
  });
  const regularMember = mockMember({
    id: 'regular',
    displayName: 'Regular',
    groupAdmin: false,
    ref: mockDocRef('groups/group-1/members/regular'),
  });
  const testHistory = mockHistory({
    id: testHistoryId,
    paidByMemberRef: adminMember.ref!,
    paidByMember: adminMember,
    paidToMemberRef: regularMember.ref!,
    paidToMember: regularMember,
    totalPaid: 50,
    // Empty splitsPaid to avoid triggering loadSplits (which calls Firebase getDoc)
    splitsPaid: [],
  });

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockHistoryStore = createMockHistoryStore();
    mockCategoryStore = createMockCategoryStore();
    mockHistoryService = createMockHistoryService();
    mockSortingService = createMockSortingService();
    mockAnalyticsService = createMockAnalyticsService();
    mockLoadingService = createMockLoadingService();
    mockDialog = createMockMatDialog();
    mockSnackBar = createMockSnackBar();
    mockUserService = createMockUserService();

    mockGroupStore.currentGroup.set(mockGroup());
    mockMemberStore.currentMember.set(adminMember);
    mockMemberStore.groupMembers.set([adminMember, regularMember]);
    mockHistoryStore.groupHistory.set([testHistory]);

    mockParamGet = vi.fn((key: string) => (key === 'id' ? testHistoryId : null));
    const mockActivatedRoute = {
      snapshot: { paramMap: { get: mockParamGet } },
    };

    await TestBed.configureTestingModule({
      imports: [HistoryDetailComponent],
      providers: [
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: HistoryStore, useValue: mockHistoryStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: SortingService, useValue: mockSortingService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: UserService, useValue: mockUserService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryDetailComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    // afterNextRender has loaded the history from the store by now
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial render', () => {
    it('should render page title', () => {
      expect(el.textContent).toContain('Payment Detail');
    });

    it('should render help button', () => {
      const icons = el.querySelectorAll('mat-icon');
      const helpIcon = Array.from(icons).find(
        (i) => i.textContent?.trim() === 'help'
      );
      expect(helpIcon).toBeTruthy();
    });

    it('should render back button', () => {
      const backButton = el.querySelector('[data-testid="back-button"]');
      expect(backButton).toBeTruthy();
    });

    it("should format the payment total in the group's currency", () => {
      // The real LocaleService follows the current group's currency
      mockGroupStore.currentGroup.set(
        mockGroup({ currencyCode: 'EUR', currencySymbol: '€' })
      );
      // A fresh record re-renders the OnPush view so the pipe runs again
      component.history.set({ ...testHistory });
      fixture.detectChanges();
      expect(
        el.querySelector('[data-testid="payment-total"]')?.textContent
      ).toContain('€ 50,00');
    });
  });

  describe('Computed signals', () => {
    it('should return isAdmin true for group admin', () => {
      expect(component.isAdmin()).toBe(true);
    });

    it('should return isAdmin false for non-admin', () => {
      mockMemberStore.currentMember.set(regularMember);
      expect(component.isAdmin()).toBe(false);
    });

    it('should return isGroupSettle true when batchId is set', () => {
      component.history.set(mockHistory({ batchId: 'batch-1' }));
      expect(component.isGroupSettle()).toBe(true);
    });

    it('should return isGroupSettle false when batchId is not set', () => {
      component.history.set(mockHistory({ batchId: undefined }));
      expect(component.isGroupSettle()).toBe(false);
    });

    it('should return all history records with the same batchId in batchTransfers', () => {
      const h1 = mockHistory({ id: 'h1', batchId: 'batch-1' });
      const h2 = mockHistory({ id: 'h2', batchId: 'batch-1' });
      const h3 = mockHistory({ id: 'h3', batchId: 'batch-2' });
      mockHistoryStore.groupHistory.set([h1, h2, h3]);
      component.history.set(h1);
      expect(component.batchTransfers().map((h) => h.id)).toEqual(
        expect.arrayContaining(['h1', 'h2'])
      );
      expect(component.batchTransfers().map((h) => h.id)).not.toContain('h3');
    });

    it('should return empty array for batchTransfers when not a group settle', () => {
      component.history.set(mockHistory({ batchId: undefined }));
      expect(component.batchTransfers()).toEqual([]);
    });

    it('should include unpay column in splitsColumnsToDisplay for admin on member payment', () => {
      mockMemberStore.currentMember.set(adminMember);
      component.history.set(mockHistory({ batchId: undefined }));
      expect(component.splitsColumnsToDisplay()).toContain('unpay');
    });

    it('should exclude unpay column in splitsColumnsToDisplay for admin on group settle', () => {
      mockMemberStore.currentMember.set(adminMember);
      component.history.set(mockHistory({ batchId: 'batch-1' }));
      expect(component.splitsColumnsToDisplay()).not.toContain('unpay');
    });

    it('should exclude unpay column in splitsColumnsToDisplay for non-admin', () => {
      mockMemberStore.currentMember.set(regularMember);
      expect(component.splitsColumnsToDisplay()).not.toContain('unpay');
    });
  });

  describe('Sorting', () => {
    it('should default sort field to date', () => {
      expect(component.sortField()).toBe('date');
    });

    it('should default sort direction to ascending', () => {
      expect(component.sortAsc()).toBe(true);
    });

    it('should update sortField and sortAsc via sortHistory', () => {
      component.sortHistory({ active: 'category', direction: 'desc' });
      expect(component.sortField()).toBe('category');
      expect(component.sortAsc()).toBe(false);
    });

    it('should set sortAsc true for asc direction', () => {
      component.sortHistory({ active: 'date', direction: 'asc' });
      expect(component.sortAsc()).toBe(true);
    });
  });

  describe('Navigation', () => {
    it('should navigate back to history list on goBack', () => {
      const navigateSpy = vi.spyOn(component['router'], 'navigate');
      component.goBack();
      expect(navigateSpy).toHaveBeenCalledWith(['/analysis/history']);
    });

    it('should navigate to expense on onRowClick', () => {
      const split = mockSplit({
        expenseRef: mockDocRef('groups/group-1/expenses/expense-1'),
      });
      const navigateSpy = vi.spyOn(component['router'], 'navigate');
      component.onRowClick(split);
      expect(navigateSpy).toHaveBeenCalledWith(['/expenses', 'expense-1']);
    });
  });

  describe('Dialog interactions', () => {
    it('should open confirm dialog on onUnpayAll', () => {
      component.history.set(
        mockHistory({
          ...testHistory,
          splitsPaid: [mockDocRef('groups/group-1/splits/s-1')] as any,
        })
      );
      component.onUnpayAll();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open confirm dialog on onUnpaySplit', () => {
      const split = mockSplit();
      component.onUnpaySplit(split);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open confirm dialog on onUnpayGroupSettle', () => {
      component.history.set(mockHistory({ batchId: 'batch-1', batchSize: 2 }));
      component.onUnpayGroupSettle();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('Unpay notices', () => {
    it('sends the group id, member refs, numeric total and split count for a payment', async () => {
      const h = mockHistory({
        ...testHistory,
        splitsPaid: [
          mockDocRef('groups/group-1/splits/s-1'),
          mockDocRef('groups/group-1/splits/s-2'),
        ] as any,
      });

      await (component as any).notifyMemberPaymentUnpay(h);

      expect(mockUserService.sendMemberPaymentUnpayEmails).toHaveBeenCalledWith(
        'group-1',
        adminMember.ref,
        regularMember.ref,
        50,
        2
      );
    });

    it('sends each known settle member once, with the settle date', async () => {
      const settleDate = new Date(2026, 9, 21);
      const unknownRef = mockDocRef('groups/group-1/members/gone');
      const first = mockHistory({
        id: 'h-a',
        batchId: 'batch-1',
        date: settleDate,
        paidByMemberRef: adminMember.ref!,
        paidByMember: adminMember,
        paidToMemberRef: regularMember.ref!,
        paidToMember: regularMember,
      });
      const second = mockHistory({
        id: 'h-b',
        batchId: 'batch-1',
        date: settleDate,
        paidByMemberRef: regularMember.ref!,
        paidByMember: regularMember,
        paidToMemberRef: unknownRef,
        paidToMember: undefined,
      });
      mockHistoryStore.groupHistory.set([first, second]);
      component.history.set(first);

      await (component as any).notifyGroupSettleUnpay(first);

      expect(mockUserService.sendGroupSettleUnpayEmails).toHaveBeenCalledWith(
        'group-1',
        [adminMember.ref, regularMember.ref],
        settleDate
      );
    });
  });

  describe('Copy to clipboard', () => {
    afterEach(() => {
      delete (navigator as any).clipboard;
    });

    it('should copy to clipboard and show snackbar', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      await component.copyToClipboard();

      expect(writeTextMock).toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
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
    const step = (id: string) => tourConfig.steps.find((s) => s.id === id)!;

    it('should start the payment detail tour from the help icon', () => {
      (
        el.querySelector(
          '[data-testid="history-detail-help-button"]'
        ) as HTMLElement
      ).click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('history-detail');
    });

    it('should switch to the category view for its step and restore the view after', async () => {
      component.viewMode.set('details');
      component.startTour();

      await runStep('categories');
      expect(component.viewMode()).toBe('summary');
      await runStep('splits');
      expect(component.viewMode()).toBe('details');

      await runStep('categories');
      tourConfig.onEnd!('closed');
      expect(component.viewMode()).toBe('details');
    });

    it('should show the unpay steps only to admins', () => {
      component.startTour();
      expect(step('unpay-all').when!()).toBe(true);

      mockMemberStore.currentMember.set(regularMember);
      component.startTour();
      expect(step('unpay-all').when!()).toBe(false);
      expect(step('unpay-split').when!()).toBe(false);
    });

    it('should skip the breakdown for a group settle recorded without splits', () => {
      component.history.set(
        mockHistory({ batchId: 'batch-1', splitsPaid: [] })
      );
      component.startTour();

      expect(step('splits').when!()).toBe(false);
      expect(step('intro').text).toContain('group settlement');
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });

    it('should open the full help from the last step', () => {
      component.startTour();

      tourConfig.fullHelp!();

      expect(mockDialog.open).toHaveBeenCalledWith(
        HelpDialogComponent,
        expect.objectContaining({ data: { sectionId: 'history-detail' } })
      );
    });

    it('should keep the breakdown step for a group settle that recorded its splits', () => {
      component.history.set(
        mockHistory({
          batchId: 'batch-1',
          splitsPaid: [mockDocRef('groups/group-1/splits/s-1')] as any,
        })
      );
      component.startTour();

      expect(step('splits').when!()).toBe(true);
    });
  });

  // ---- Coverage pass: data loading, unpay outcomes, summary text ----

  const groupId = 'group-1';
  const categoryFood = mockDocRef('groups/group-1/categories/food');
  const categoryFuel = mockDocRef('groups/group-1/categories/fuel');
  const snackbarMessage = (message: string) => [
    CustomSnackbarComponent,
    { data: { message } },
  ];
  // The server's per-caller daily allowance (functions/src/mail-allowance.ts).
  const limitRefusal = () =>
    Object.assign(new Error(`${GROUP_MAIL_LIMIT_REACHED} [429]`), {
      code: 'functions/resource-exhausted',
    });

  function splitSnapshot(id: string, data: Record<string, unknown> | null) {
    return {
      id,
      ref: mockDocRef(`groups/group-1/splits/${id}`),
      exists: () => data !== null,
      data: () => data,
    } as any;
  }

  function splitData(overrides: Record<string, unknown> = {}) {
    return {
      date: '2024-03-05',
      categoryRef: categoryFood,
      expenseRef: mockDocRef('groups/group-1/expenses/e-1'),
      owedByMemberRef: regularMember.ref,
      paidByMemberRef: adminMember.ref,
      allocatedAmount: 30,
      paid: true,
      ...overrides,
    };
  }

  // Holds the afterClosed callback so a test can await the async handler
  function pendingConfirm() {
    let onClose!: (result: unknown) => Promise<void>;
    mockDialog.open.mockReturnValueOnce({
      afterClosed: () => ({
        subscribe: (fn: (result: unknown) => Promise<void>) => {
          onClose = fn;
        },
      }),
    } as any);
    return { close: (result: unknown) => onClose(result) };
  }

  function categoriesByRef(
    ...entries: [ReturnType<typeof mockDocRef>, string][]
  ): void {
    mockCategoryStore.getCategoryByRef.mockImplementation(((ref: any) => {
      const hit = entries.find(([r]) => r.path === ref?.path);
      return hit ? { name: hit[1] } : undefined;
    }) as any);
  }

  describe('opening a payment', () => {
    async function openFresh() {
      mockParamGet.mockImplementation((key: string) =>
        key === 'id' ? 'h-2' : null
      );
      fixture = TestBed.createComponent(HistoryDetailComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('should go back to the history list when the payment is not in the store', async () => {
      const navigate = vi
        .spyOn(TestBed.inject(Router), 'navigate')
        .mockResolvedValue(true);

      await openFresh();

      expect(navigate).toHaveBeenCalledWith(['/analysis/history']);
      expect(component.history()).toBeNull();
    });

    it('should load the payment from the store, and read its splits when it has them', async () => {
      const getDocSpy = vi
        .spyOn(firestoreModule, 'getDoc')
        .mockResolvedValue(splitSnapshot('s-1', splitData()));
      const refs = [mockDocRef('groups/group-1/splits/s-1')];
      const stored = mockHistory({
        id: 'h-2',
        paidByMemberRef: adminMember.ref!,
        paidToMemberRef: regularMember.ref!,
        splitsPaid: refs as any,
      });
      mockHistoryStore.groupHistory.set([testHistory, stored]);

      await openFresh();

      expect(component.history()).toBe(stored);
      expect(getDocSpy).toHaveBeenCalledWith(refs[0]);
      await vi.waitFor(() => expect(component.paidSplits()).toHaveLength(1));
    });

    it('should not read any splits for a payment recorded without them', async () => {
      const getDocSpy = vi.spyOn(firestoreModule, 'getDoc');
      mockHistoryStore.groupHistory.set([
        mockHistory({ id: 'h-2', splitsPaid: null }),
      ]);

      await openFresh();

      expect(component.history()!.id).toBe('h-2');
      expect(getDocSpy).not.toHaveBeenCalled();
    });
  });

  describe('loading the paid splits', () => {
    const load = (refs: any[]) => (component as any).loadSplits(refs);

    it('should read each split document and build splits with their date, category and reference', async () => {
      categoriesByRef([categoryFood, 'Food']);
      const refA = mockDocRef('groups/group-1/splits/a');
      const refB = mockDocRef('groups/group-1/splits/b');
      const getDocSpy = vi
        .spyOn(firestoreModule, 'getDoc')
        .mockResolvedValueOnce(splitSnapshot('a', splitData()))
        .mockResolvedValueOnce(
          splitSnapshot('b', splitData({ date: '2024-03-06', allocatedAmount: 12 }))
        );

      await load([refA, refB]);

      expect(getDocSpy.mock.calls.map((c) => c[0])).toEqual([refA, refB]);
      const splits = component.paidSplits();
      expect(splits.map((s) => s.id)).toEqual(['a', 'b']);
      expect(splits[0]!.date).toEqual(new Date(2024, 2, 5));
      expect(splits[1]!.date).toEqual(new Date(2024, 2, 6));
      expect(splits.map((s) => s.allocatedAmount)).toEqual([30, 12]);
      expect(splits[0]!.category).toEqual({ name: 'Food' });
      expect(splits[0]!.ref!.path).toBe('groups/group-1/splits/a');
    });

    it('should skip a split document that no longer exists', async () => {
      vi.spyOn(firestoreModule, 'getDoc')
        .mockResolvedValueOnce(splitSnapshot('gone', null))
        .mockResolvedValueOnce(splitSnapshot('kept', splitData()));

      await load([mockDocRef('x/gone'), mockDocRef('x/kept')]);

      expect(component.paidSplits().map((s) => s.id)).toEqual(['kept']);
    });

    it('should turn the loading overlay on and off around the read', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockResolvedValue(
        splitSnapshot('a', splitData())
      );
      mockLoadingService.loadingOn.mockClear();
      mockLoadingService.loadingOff.mockClear();

      await load([mockDocRef('x/a')]);

      expect(mockLoadingService.loadingOn).toHaveBeenCalledOnce();
      expect(mockLoadingService.loadingOff).toHaveBeenCalledOnce();
    });

    it('should tell the user and log it when the read fails', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockRejectedValue(new Error('offline'));
      mockLoadingService.loadingOff.mockClear();

      await load([mockDocRef('x/a')]);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Failed to load split details')
      );
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'History Detail Component',
        'load_splits',
        'offline'
      );
      expect(mockLoadingService.loadingOff).toHaveBeenCalledOnce();
    });

    it('should log an unknown error when the failure is not an Error', async () => {
      vi.spyOn(firestoreModule, 'getDoc').mockRejectedValue('boom');

      await load([mockDocRef('x/a')]);

      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'History Detail Component',
        'load_splits',
        'Unknown error'
      );
    });
  });

  describe('sorted splits', () => {
    it('should sort the paid splits by the chosen column and direction', () => {
      const splits = [mockSplit({ id: 'a' }), mockSplit({ id: 'b' })];
      component.paidSplits.set(splits);
      component.sortHistory({ active: 'date', direction: 'desc' });
      mockSortingService.sort.mockClear();

      component.sortedPaidSplits();

      expect(mockSortingService.sort).toHaveBeenCalledWith(
        splits,
        'date',
        false,
        ''
      );
    });

    it('should sort by category name when sorting by category', () => {
      const splits = [mockSplit()];
      component.paidSplits.set(splits);
      component.sortHistory({ active: 'category', direction: 'asc' });
      mockSortingService.sort.mockClear();

      component.sortedPaidSplits();

      expect(mockSortingService.sort).toHaveBeenCalledWith(
        splits,
        'category',
        true,
        'name'
      );
    });

    it('should not sort when there are no splits', () => {
      component.paidSplits.set([]);
      mockSortingService.sort.mockClear();

      expect(component.sortedPaidSplits()).toEqual([]);
      expect(mockSortingService.sort).not.toHaveBeenCalled();
    });
  });

  describe('category totals and direction', () => {
    // Alice (admin) paid, Regular is the other party
    const towardPayer = (over: object = {}) =>
      mockSplit({
        owedByMemberRef: adminMember.ref!,
        categoryRef: categoryFood,
        allocatedAmount: 40,
        ...over,
      });
    const towardOther = (over: object = {}) =>
      mockSplit({
        owedByMemberRef: regularMember.ref!,
        categoryRef: categoryFood,
        allocatedAmount: 15,
        ...over,
      });

    it('should count splits the payer owes as positive and the other party\'s as negative', () => {
      categoriesByRef([categoryFood, 'Food'], [categoryFuel, 'Fuel']);
      component.paidSplits.set([
        towardPayer(),
        towardOther(),
        towardOther({ categoryRef: categoryFuel, allocatedAmount: 5 }),
      ]);

      expect(component.categoryTotals()).toEqual([
        { category: 'Food', amount: 25 },
        { category: 'Fuel', amount: -5 },
      ]);
    });

    it('should count every split as positive for a group settle', () => {
      categoriesByRef([categoryFood, 'Food']);
      component.history.set(mockHistory({ ...testHistory, batchId: 'batch-1' }));
      component.paidSplits.set([towardPayer(), towardOther()]);

      expect(component.categoryTotals()).toEqual([
        { category: 'Food', amount: 55 },
      ]);
    });

    it('should file a split whose category is gone under Unknown, in name order', () => {
      categoriesByRef([categoryFuel, 'Fuel']);
      component.paidSplits.set([
        towardPayer({ categoryRef: categoryFuel }),
        towardPayer({ categoryRef: mockDocRef('groups/group-1/categories/old') }),
      ]);

      expect(component.categoryTotals().map((t) => t.category)).toEqual([
        'Fuel',
        'Unknown',
      ]);
    });

    it('should have no totals before the payment has loaded', () => {
      component.history.set(null);
      component.paidSplits.set([towardPayer()]);

      expect(component.categoryTotals()).toEqual([]);
    });

    it('should show a split\'s amount as received or paid from the payer\'s side', () => {
      expect(component.getSplitDirectedAmount(towardPayer())).toBe(40);
      expect(component.getSplitDirectedAmount(towardOther())).toBe(-15);
    });

    it('should show every split of a group settle as positive', () => {
      component.history.set(mockHistory({ ...testHistory, batchId: 'batch-1' }));

      expect(component.getSplitDirectedAmount(towardOther())).toBe(15);
    });
  });

  describe('unpaying the whole payment', () => {
    const paidTwo = () =>
      mockHistory({
        ...testHistory,
        splitsPaid: [
          mockDocRef('groups/group-1/splits/s-1'),
          mockDocRef('groups/group-1/splits/s-2'),
        ] as any,
      });
    let navigate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigate = vi
        .spyOn(component['router'], 'navigate')
        .mockResolvedValue(true);
    });

    it.each([
      [1, 'all 1 split in this payment'],
      [2, 'all 2 splits in this payment'],
    ])('should say how many splits are affected (%i)', (count, text) => {
      component.history.set(
        mockHistory({
          ...testHistory,
          splitsPaid: Array.from({ length: count }, (_, i) =>
            mockDocRef(`groups/group-1/splits/s-${i}`)
          ) as any,
        })
      );

      component.onUnpayAll();

      expect(mockDialog.open).toHaveBeenCalledWith(
        ConfirmDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({
            dialogTitle: 'Confirm Unpay',
            confirmationText: expect.stringContaining(text),
          }),
        })
      );
    });

    it('should do nothing when the confirmation is declined', async () => {
      component.history.set(paidTwo());
      const dialog = pendingConfirm();
      component.onUnpayAll();
      mockLoadingService.loadingOn.mockClear();

      await dialog.close(false);

      expect(mockHistoryService.unpayHistory).not.toHaveBeenCalled();
      expect(mockUserService.sendMemberPaymentUnpayEmails).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOn).not.toHaveBeenCalled();
    });

    it('should tell the members, unpay the payment, confirm and go back to the list', async () => {
      const h = paidTwo();
      component.history.set(h);
      const dialog = pendingConfirm();
      component.onUnpayAll();

      await dialog.close(true);

      expect(mockUserService.sendMemberPaymentUnpayEmails).toHaveBeenCalledWith(
        groupId,
        h.paidByMemberRef,
        h.paidToMemberRef,
        50,
        2
      );
      expect(mockHistoryService.unpayHistory).toHaveBeenCalledWith(h);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Payment marked as unpaid')
      );
      expect(navigate).toHaveBeenCalledWith(['/analysis/history']);
    });

    it('should still unpay when the notification emails fail', async () => {
      const h = paidTwo();
      component.history.set(h);
      mockUserService.sendMemberPaymentUnpayEmails.mockRejectedValueOnce(
        new Error('mail down')
      );
      const dialog = pendingConfirm();
      component.onUnpayAll();

      await dialog.close(true);

      expect(mockHistoryService.unpayHistory).toHaveBeenCalledWith(h);
      expect(navigate).toHaveBeenCalledWith(['/analysis/history']);
    });

    it('should unpay and say no one was emailed when the daily group-mail limit is reached', async () => {
      const h = paidTwo();
      component.history.set(h);
      mockUserService.sendMemberPaymentUnpayEmails.mockRejectedValueOnce(
        limitRefusal()
      );
      const dialog = pendingConfirm();
      component.onUnpayAll();

      await dialog.close(true);

      expect(mockHistoryService.unpayHistory).toHaveBeenCalledWith(h);
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage(
          "Payment marked as unpaid. No one was emailed: you've reached today's limit for group emails."
        )
      );
      expect(navigate).toHaveBeenCalledWith(['/analysis/history']);
    });

    it('should show and log the error and stay on the page when unpaying fails', async () => {
      component.history.set(paidTwo());
      mockHistoryService.unpayHistory.mockRejectedValueOnce(new Error('denied'));
      const dialog = pendingConfirm();
      component.onUnpayAll();
      mockLoadingService.loadingOff.mockClear();

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('denied')
      );
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'History Detail Component',
        'unpay_history',
        'denied'
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalledOnce();
    });

    it('should use a generic message when the failure is not an Error', async () => {
      component.history.set(paidTwo());
      mockHistoryService.unpayHistory.mockRejectedValueOnce('boom');
      const dialog = pendingConfirm();
      component.onUnpayAll();

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Something went wrong - could not unpay payment')
      );
      expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
    });
  });

  describe('unpaying a group settle', () => {
    const settle = (over: object = {}) =>
      mockHistory({
        ...testHistory,
        id: 'h-a',
        batchId: 'batch-1',
        batchSize: 3,
        ...over,
      });
    let navigate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigate = vi
        .spyOn(component['router'], 'navigate')
        .mockResolvedValue(true);
    });

    it.each([
      [3, 'delete all 3 associated history records'],
      [1, 'delete all 1 associated history record.'],
      [undefined, 'delete all 1 associated history record.'],
    ])('should say how many records go (batch size %s)', (batchSize, text) => {
      component.history.set(settle({ batchSize }));

      component.onUnpayGroupSettle();

      expect(mockDialog.open).toHaveBeenCalledWith(
        ConfirmDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({
            dialogTitle: 'Confirm Unpay Group Settle',
            confirmationText: expect.stringContaining(text),
          }),
        })
      );
    });

    it('should do nothing when the confirmation is declined', async () => {
      component.history.set(settle());
      const dialog = pendingConfirm();
      component.onUnpayGroupSettle();

      await dialog.close(false);

      expect(mockHistoryService.unpayGroupSettle).not.toHaveBeenCalled();
      expect(mockUserService.sendGroupSettleUnpayEmails).not.toHaveBeenCalled();
    });

    it('should notify the members, unpay the whole batch and go back to the list', async () => {
      const h = settle();
      mockHistoryStore.groupHistory.set([h]);
      component.history.set(h);
      const dialog = pendingConfirm();
      component.onUnpayGroupSettle();

      await dialog.close(true);

      expect(mockUserService.sendGroupSettleUnpayEmails).toHaveBeenCalledWith(
        groupId,
        [adminMember.ref, regularMember.ref],
        h.date
      );
      expect(mockHistoryService.unpayGroupSettle).toHaveBeenCalledWith(
        groupId,
        'batch-1'
      );
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Group settle marked as unpaid')
      );
      expect(navigate).toHaveBeenCalledWith(['/analysis/history']);
    });

    it('should still unpay when the notification emails fail', async () => {
      const h = settle();
      mockHistoryStore.groupHistory.set([h]);
      component.history.set(h);
      mockUserService.sendGroupSettleUnpayEmails.mockRejectedValueOnce(
        new Error('mail down')
      );
      const dialog = pendingConfirm();
      component.onUnpayGroupSettle();

      await dialog.close(true);

      expect(mockHistoryService.unpayGroupSettle).toHaveBeenCalledWith(
        groupId,
        'batch-1'
      );
    });

    it('should unpay and say no one was emailed when the daily group-mail limit is reached', async () => {
      const h = settle();
      mockHistoryStore.groupHistory.set([h]);
      component.history.set(h);
      mockUserService.sendGroupSettleUnpayEmails.mockRejectedValueOnce(
        limitRefusal()
      );
      const dialog = pendingConfirm();
      component.onUnpayGroupSettle();

      await dialog.close(true);

      expect(mockHistoryService.unpayGroupSettle).toHaveBeenCalledWith(
        groupId,
        'batch-1'
      );
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage(
          "Group settle marked as unpaid. No one was emailed: you've reached today's limit for group emails."
        )
      );
    });

    it('should show and log the error and stay on the page when unpaying fails', async () => {
      const h = settle();
      mockHistoryStore.groupHistory.set([h]);
      component.history.set(h);
      mockHistoryService.unpayGroupSettle.mockRejectedValueOnce(
        new Error('denied')
      );
      const dialog = pendingConfirm();
      component.onUnpayGroupSettle();
      mockLoadingService.loadingOff.mockClear();

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('denied')
      );
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'History Detail Component',
        'unpay_group_settle',
        'denied'
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalledOnce();
    });

    it('should use a generic message when the failure is not an Error', async () => {
      const h = settle();
      mockHistoryStore.groupHistory.set([h]);
      component.history.set(h);
      mockHistoryService.unpayGroupSettle.mockRejectedValueOnce('boom');
      const dialog = pendingConfirm();
      component.onUnpayGroupSettle();

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Something went wrong - could not unpay group settle')
      );
    });
  });

  describe('unpaying one split', () => {
    const splitRefs = (n: number) =>
      Array.from({ length: n }, (_, i) =>
        mockDocRef(`groups/group-1/splits/s-${i}`)
      ) as any;
    // Owed by the payer (a positive-direction split)
    const owedByPayer = () =>
      mockSplit({ owedByMemberRef: adminMember.ref!, allocatedAmount: 40 });
    const owedByOther = () =>
      mockSplit({ owedByMemberRef: regularMember.ref!, allocatedAmount: 15 });
    let navigate: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      navigate = vi
        .spyOn(component['router'], 'navigate')
        .mockResolvedValue(true);
    });

    it.each([
      [1, 'last split in this payment record'],
      [2, 'remove it from this payment record'],
    ])('should explain the effect with %i split(s) in the record', (n, text) => {
      component.history.set(mockHistory({ ...testHistory, splitsPaid: splitRefs(n) }));

      component.onUnpaySplit(owedByPayer());

      expect(mockDialog.open).toHaveBeenCalledWith(
        ConfirmDialogComponent,
        expect.objectContaining({
          data: expect.objectContaining({
            dialogTitle: 'Confirm Unpay Split',
            confirmationText: expect.stringContaining(text),
          }),
        })
      );
    });

    it('should do nothing when the confirmation is declined', async () => {
      component.history.set(mockHistory({ ...testHistory, splitsPaid: splitRefs(2) }));
      const dialog = pendingConfirm();
      component.onUnpaySplit(owedByPayer());
      mockLoadingService.loadingOn.mockClear();

      await dialog.close(false);

      expect(mockHistoryService.unpaySingleSplitFromHistory).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOn).not.toHaveBeenCalled();
    });

    it('should do nothing for a split with no reference, and still clear the overlay', async () => {
      component.history.set(mockHistory({ ...testHistory, splitsPaid: splitRefs(2) }));
      const dialog = pendingConfirm();
      component.onUnpaySplit(mockSplit({ ref: undefined }));
      mockLoadingService.loadingOff.mockClear();

      await dialog.close(true);

      expect(mockHistoryService.unpaySingleSplitFromHistory).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalledOnce();
    });

    it.each([
      ['the payer owes', owedByPayer, 40, true],
      ['the other party owes', owedByOther, 15, false],
    ])(
      'should hand the history service the direction when %s',
      async (_who, make, amount, positive) => {
        const h = mockHistory({ ...testHistory, splitsPaid: splitRefs(1) });
        component.history.set(h);
        const split = make();
        const dialog = pendingConfirm();
        component.onUnpaySplit(split);

        await dialog.close(true);

        expect(
          mockHistoryService.unpaySingleSplitFromHistory
        ).toHaveBeenCalledWith(
          split.ref,
          split.expenseRef,
          h,
          amount,
          positive
        );
      }
    );

    it('should go back to the list after unpaying the last split', async () => {
      component.history.set(mockHistory({ ...testHistory, splitsPaid: splitRefs(1) }));
      const dialog = pendingConfirm();
      component.onUnpaySplit(owedByPayer());

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Split marked as unpaid')
      );
      expect(navigate).toHaveBeenCalledWith(['/analysis/history']);
    });

    it('should show the updated record and reload its splits after unpaying one of several', async () => {
      const before = mockHistory({ ...testHistory, splitsPaid: splitRefs(2) });
      const after = mockHistory({
        ...testHistory,
        totalPaid: 10,
        splitsPaid: splitRefs(1),
      });
      component.history.set(before);
      mockHistoryStore.groupHistory.set([after]);
      const getDocSpy = vi
        .spyOn(firestoreModule, 'getDoc')
        .mockResolvedValue(splitSnapshot('s-0', splitData()));
      const dialog = pendingConfirm();
      component.onUnpaySplit(owedByPayer());

      await dialog.close(true);

      expect(component.history()).toBe(after);
      expect(getDocSpy.mock.calls.map((c) => c[0])).toEqual(after.splitsPaid);
      expect(component.paidSplits().map((s) => s.id)).toEqual(['s-0']);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('should go back to the list when the record is gone after the unpay', async () => {
      component.history.set(mockHistory({ ...testHistory, splitsPaid: splitRefs(2) }));
      mockHistoryStore.groupHistory.set([]);
      const dialog = pendingConfirm();
      component.onUnpaySplit(owedByPayer());

      await dialog.close(true);

      expect(navigate).toHaveBeenCalledWith(['/analysis/history']);
    });

    it('should show and log the error when unpaying the split fails', async () => {
      component.history.set(mockHistory({ ...testHistory, splitsPaid: splitRefs(2) }));
      mockHistoryService.unpaySingleSplitFromHistory.mockRejectedValueOnce(
        new Error('denied')
      );
      const dialog = pendingConfirm();
      component.onUnpaySplit(owedByPayer());
      mockLoadingService.loadingOff.mockClear();

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('denied')
      );
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'History Detail Component',
        'unpay_split',
        'denied'
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(mockLoadingService.loadingOff).toHaveBeenCalledOnce();
    });

    it('should use a generic message when the failure is not an Error', async () => {
      component.history.set(mockHistory({ ...testHistory, splitsPaid: splitRefs(2) }));
      mockHistoryService.unpaySingleSplitFromHistory.mockRejectedValueOnce('boom');
      const dialog = pendingConfirm();
      component.onUnpaySplit(owedByPayer());

      await dialog.close(true);

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Something went wrong - could not unpay split')
      );
      expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
    });
  });

  describe('unpay notices to members who are no longer known', () => {
    it('should leave out a settle payer the store no longer knows, keeping the rest', async () => {
      const settleDate = new Date(2026, 9, 21);
      const transfer = mockHistory({
        id: 'h-a',
        batchId: 'batch-1',
        date: settleDate,
        paidByMemberRef: mockDocRef('groups/group-1/members/gone'),
        paidByMember: undefined,
        paidToMemberRef: regularMember.ref!,
        paidToMember: regularMember,
      });
      mockHistoryStore.groupHistory.set([transfer]);
      component.history.set(transfer);

      await (component as any).notifyGroupSettleUnpay(transfer);

      expect(mockUserService.sendGroupSettleUnpayEmails).toHaveBeenCalledWith(
        groupId,
        [regularMember.ref],
        settleDate
      );
    });
  });

  describe('unpay notices without splits recorded', () => {
    it('should report zero splits for a payment with no split list', async () => {
      await (component as any).notifyMemberPaymentUnpay(
        mockHistory({ ...testHistory, splitsPaid: null })
      );

      expect(mockUserService.sendMemberPaymentUnpayEmails).toHaveBeenCalledWith(
        groupId,
        adminMember.ref,
        regularMember.ref,
        50,
        0
      );
    });
  });

  describe('help', () => {
    it('should open the payment detail section of the help', () => {
      component.showHelp();

      expect(mockDialog.open).toHaveBeenCalledWith(
        HelpDialogComponent,
        expect.objectContaining({ data: { sectionId: 'history-detail' } })
      );
    });
  });

  describe('payment summary text', () => {
    let writeText: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
        writable: true,
      });
    });

    afterEach(() => {
      delete (navigator as any).clipboard;
    });

    const copiedText = async () => {
      await component.copyToClipboard();
      return writeText.mock.calls[0]![0] as string;
    };

    it('should say who paid whom, how much and when, with the category breakdown aligned', async () => {
      categoriesByRef([categoryFood, 'Food'], [categoryFuel, 'Transport']);
      component.paidSplits.set([
        mockSplit({
          owedByMemberRef: adminMember.ref!,
          categoryRef: categoryFood,
          allocatedAmount: 30,
        }),
        mockSplit({
          owedByMemberRef: regularMember.ref!,
          categoryRef: categoryFuel,
          allocatedAmount: 10,
        }),
      ]);

      const text = await copiedText();

      expect(text.split('\n')).toEqual([
        'Payment Summary',
        `Admin paid Regular $ 50.00 on ${testHistory.date.toLocaleDateString()}`,
        '',
        'Breakdown by Category:',
        // widest line is "Transport:" + "-$ 10.00" = 9 + 2 + 8 = 19
        '='.repeat(20),
        'Food:' + ' '.repeat(8) + '$ 30.00',
        'Transport:' + ' '.repeat(2) + '-$ 10.00',
      ]);
    });

    it('should leave the breakdown out when no splits are loaded, and name missing members Unknown', async () => {
      component.history.set(
        mockHistory({
          ...testHistory,
          paidByMember: undefined,
          paidToMember: undefined,
        })
      );
      component.paidSplits.set([]);

      const text = await copiedText();

      expect(text).toBe(
        `Payment Summary\nUnknown paid Unknown $ 50.00 on ${testHistory.date.toLocaleDateString()}`
      );
    });

    it('should show and log the reason the clipboard refused', async () => {
      writeText.mockRejectedValueOnce(new Error('not allowed'));

      await component.copyToClipboard();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('not allowed')
      );
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'History Detail Component',
        'copy_to_clipboard',
        'not allowed'
      );
    });

    it('should use a generic message when the failure is not an Error', async () => {
      writeText.mockRejectedValueOnce('nope');

      await component.copyToClipboard();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        ...snackbarMessage('Failed to copy payment summary')
      );
      expect(mockAnalyticsService.logError).not.toHaveBeenCalled();
    });
  });
});
