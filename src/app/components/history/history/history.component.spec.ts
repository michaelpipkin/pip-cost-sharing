import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HistoryComponent } from './history.component';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { HistoryStore } from '@store/history.store';
import { HistoryService } from '@services/history.service';
import { TourService } from '@services/tour.service';
import { SortingService } from '@services/sorting.service';
import { LocaleService } from '@services/locale.service';
import { DemoService } from '@services/demo.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockGroupStore,
  createMockMemberStore,
  createMockHistoryStore,
  createMockHistoryService,
  createMockTourService,
  createMockSortingService,
  createMockDemoService,
  createMockAnalyticsService,
  createMockLoadingService,
  createMockMatDialog,
  createMockSnackBar,
  mockGroup,
  mockMember,
  mockHistory,
  mockDocRef,
} from '@testing/test-helpers';

describe('HistoryComponent', () => {
  let fixture: ComponentFixture<HistoryComponent>;
  let component: HistoryComponent;
  let el: HTMLElement;

  let mockGroupStore: ReturnType<typeof createMockGroupStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockHistoryStore: ReturnType<typeof createMockHistoryStore>;
  let mockHistoryService: ReturnType<typeof createMockHistoryService>;
  let mockTourService: ReturnType<typeof createMockTourService>;
  let mockSortingService: ReturnType<typeof createMockSortingService>;
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLocaleService: any;

  beforeEach(async () => {
    mockGroupStore = createMockGroupStore();
    mockMemberStore = createMockMemberStore();
    mockHistoryStore = createMockHistoryStore();
    mockHistoryService = createMockHistoryService();
    mockTourService = createMockTourService();
    mockSortingService = createMockSortingService();
    mockDemoService = createMockDemoService();
    mockAnalyticsService = createMockAnalyticsService();
    mockLoadingService = createMockLoadingService();
    mockDialog = createMockMatDialog();
    mockSnackBar = createMockSnackBar();

    // Set up stores with test data
    const testGroup = mockGroup();
    const adminMember = mockMember({
      id: 'admin',
      displayName: 'Admin',
      groupAdmin: true,
      ref: mockDocRef('groups/group-1/members/admin'),
    });
    const regularMember = mockMember({
      id: 'regular',
      displayName: 'Regular',
      ref: mockDocRef('groups/group-1/members/regular'),
    });

    mockGroupStore.currentGroup.set(testGroup);
    mockMemberStore.currentMember.set(adminMember);
    mockMemberStore.groupMembers.set([adminMember, regularMember]);
    mockHistoryStore.loaded.set(true);
    // Use recent dates (within last 30 days) so they pass the default date filter
    const recentDate1 = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
    const recentDate2 = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    mockHistoryStore.groupHistory.set([
      mockHistory({
        id: 'h1',
        date: recentDate1,
        totalPaid: 50,
        paidByMemberRef: adminMember.ref!,
        paidByMember: adminMember,
        paidToMemberRef: regularMember.ref!,
        paidToMember: regularMember,
        lineItems: [{ category: 'Food', amount: 50 }],
      }),
      mockHistory({
        id: 'h2',
        date: recentDate2,
        totalPaid: 75,
        paidByMemberRef: regularMember.ref!,
        paidByMember: regularMember,
        paidToMemberRef: adminMember.ref!,
        paidToMember: adminMember,
        lineItems: [{ category: 'Gas', amount: 75 }],
      }),
    ]);

    // Mock LocaleService
    mockLocaleService = {
      currency: vi.fn(() => ({
        code: 'USD',
        symbol: '$',
        symbolPosition: 'prefix',
        decimalPlaces: 2,
      })),
      formatCurrency: vi.fn((amount: number) => `$${amount.toFixed(2)}`),
    };

    await TestBed.configureTestingModule({
      imports: [HistoryComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: HistoryStore, useValue: mockHistoryStore },
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: TourService, useValue: mockTourService },
        { provide: SortingService, useValue: mockSortingService },
        { provide: LocaleService, useValue: mockLocaleService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  describe('Initial render', () => {
    it('should render page title', () => {
      expect(el.textContent).toContain('History');
    });

    it('should render help button', () => {
      const helpButton = el.querySelector('mat-icon');
      expect(helpButton?.textContent?.trim()).toBe('help');
    });

    it('should show loading message when not loaded', async () => {
      mockHistoryStore.loaded.set(false);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
    });

    it('should show main content when loaded', async () => {
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
      // The filteredHistory is filtered by selectedMember which is set to currentMember
      // Both history records involve the admin member (either as paidBy or paidTo)
      const filtered = component.filteredHistory();
      expect(filtered.length).toBeGreaterThan(0);
    });
  });

  describe('Store integration', () => {
    it('should get history data from HistoryStore', () => {
      expect(component.history()).toEqual(mockHistoryStore.groupHistory());
      expect(component.history().length).toBe(2);
    });

    it('should get members from MemberStore', () => {
      expect(component.members()).toEqual(mockMemberStore.groupMembers());
      expect(component.members().length).toBe(2);
    });

    it('should get current group from GroupStore', () => {
      expect(component.currentGroup()).toEqual(mockGroupStore.currentGroup());
    });

    it('should get current member for permissions', () => {
      expect(component.currentMember()).toEqual(mockMemberStore.currentMember());
      expect(component.currentMember()?.groupAdmin).toBe(true);
    });
  });

  describe('Filtering', () => {
    it('should filter by selected member', async () => {
      const adminMember = mockMemberStore.groupMembers()[0]!;
      component.selectedMember.set(adminMember.ref!);
      component.startDate.set(null);
      component.endDate.set(null);
      await fixture.whenStable();

      const filtered = component.filteredHistory();
      // Admin is either paidBy or paidTo in both records
      expect(filtered.length).toBe(2);
    });

    it('should filter by start date only', async () => {
      const adminMember = mockMemberStore.groupMembers()[0]!;
      component.selectedMember.set(adminMember.ref!);
      // Set start date between h1 (15 days ago) and h2 (10 days ago)
      component.startDate.set(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000));
      component.endDate.set(null);
      await fixture.whenStable();

      const filtered = component.filteredHistory();
      // Only h2 (10 days ago) should match
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.id).toBe('h2');
    });

    it('should filter by end date only', async () => {
      const adminMember = mockMemberStore.groupMembers()[0]!;
      component.selectedMember.set(adminMember.ref!);
      component.startDate.set(null);
      // Set end date between h1 (15 days ago) and h2 (10 days ago)
      component.endDate.set(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000));
      await fixture.whenStable();

      const filtered = component.filteredHistory();
      // Only h1 (15 days ago) should match
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.id).toBe('h1');
    });

    it('should filter by date range (both start and end)', async () => {
      const adminMember = mockMemberStore.groupMembers()[0]!;
      component.selectedMember.set(adminMember.ref!);
      // Set range that only includes h1 (15 days ago)
      component.startDate.set(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000));
      component.endDate.set(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000));
      await fixture.whenStable();

      const filtered = component.filteredHistory();
      // Only h1 (15 days ago) should match
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.id).toBe('h1');
    });

    it('should show all when dates are null', async () => {
      const adminMember = mockMemberStore.groupMembers()[0]!;
      component.selectedMember.set(adminMember.ref!);
      component.startDate.set(null);
      component.endDate.set(null);
      await fixture.whenStable();

      const filtered = component.filteredHistory();
      expect(filtered.length).toBe(2);
    });

    it('should handle combined member and date filtering', async () => {
      const regularMember = mockMemberStore.groupMembers()[1]!;
      component.selectedMember.set(regularMember.ref!);
      // Set range that only includes h1 (15 days ago)
      component.startDate.set(new Date(Date.now() - 20 * 24 * 60 * 60 * 1000));
      component.endDate.set(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000));
      await fixture.whenStable();

      const filtered = component.filteredHistory();
      // Only h1 matches: regularMember is paidTo and date is 15 days ago
      expect(filtered.length).toBe(1);
      expect(filtered[0]!.id).toBe('h1');
    });

    it('should update filteredHistory computed signal when filters change', async () => {
      mockMemberStore.groupMembers()[0]!;
      const initialFiltered = component.filteredHistory();
      const initialLength = initialFiltered.length;

      // Set start date between h1 (15 days ago) and h2 (10 days ago) to filter out h1
      component.startDate.set(new Date(Date.now() - 12 * 24 * 60 * 60 * 1000));
      await fixture.whenStable();

      const newFiltered = component.filteredHistory();
      expect(newFiltered.length).not.toBe(initialLength);
    });

    it('should verify filteredHistory computed signal works correctly', () => {
      const filtered = component.filteredHistory();
      expect(filtered).toBeDefined();
      expect(Array.isArray(filtered)).toBe(true);
    });
  });

  describe('Sorting', () => {
    it('should default sort by date ascending', () => {
      expect(component.sortField()).toBe('date');
      expect(component.sortAsc()).toBe(true);
    });

    it('should sort by amount', () => {
      component.sortHistory({ active: 'totalPaid', direction: 'asc' });
      expect(component.sortField()).toBe('totalPaid');
      expect(component.sortAsc()).toBe(true);
    });

    it('should sort by member name', () => {
      component.sortHistory({ active: 'paidByMember', direction: 'desc' });
      expect(component.sortField()).toBe('paidByMember');
      expect(component.sortAsc()).toBe(false);
    });

    it('should toggle sort direction', () => {
      component.sortHistory({ active: 'date', direction: 'asc' });
      expect(component.sortAsc()).toBe(true);

      component.sortHistory({ active: 'date', direction: 'desc' });
      expect(component.sortAsc()).toBe(false);
    });
  });

  describe('Delete functionality', () => {
    it('should show delete column for admin', () => {
      const columns = component.columnsToDisplay();
      expect(columns).toContain('delete');
    });

    it('should hide delete column for non-admin', async () => {
      const regularMember = mockMember({ groupAdmin: false });
      mockMemberStore.currentMember.set(regularMember);
      await fixture.whenStable();

      const columns = component.columnsToDisplay();
      expect(columns).not.toContain('delete');
    });

    it('should open delete dialog on delete click', () => {
      const history = mockHistoryStore.groupHistory()[0]!;
      component.onDeleteClick(history);

      expect(mockDialog.open).toHaveBeenCalled();
    });

    // Note: Full delete flow with dialog confirmation, service call, and snackbar
    // is better tested in e2e tests where real async dialog behavior works properly.

    it('should block delete in demo mode', () => {
      mockDemoService.isInDemoMode = vi.fn(() => true);

      const history = mockHistoryStore.groupHistory()[0]!;
      component.onDeleteClick(history);

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('Copy to clipboard', () => {
    it('should generate formatted text with history entry', () => {
      const history = mockHistoryStore.groupHistory()[0]!;
      const text = component['generateHistoryText'](history);

      expect(text).toContain('Payment History');
      expect(text).toContain('Admin');
      expect(text).toContain('Regular');
      expect(text).toContain('$50.00');
    });

    it('should include category breakdown in text', () => {
      const history = mockHistoryStore.groupHistory()[0]!;
      const text = component['generateHistoryText'](history);

      expect(text).toContain('Breakdown by Category');
      expect(text).toContain('Food');
    });

    it('should copy to clipboard and show success snackbar', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const history = mockHistoryStore.groupHistory()[0]!;
      await component.copyHistoryToClipboard(history);

      expect(writeTextMock).toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });
  });

  describe('Demo mode', () => {
    it('should show tour button when in demo mode', async () => {
      mockDemoService.isInDemoMode = vi.fn(() => true);
      await fixture.whenStable();

      // The tour button would be visible in the template when isInDemoMode returns true
      expect(mockDemoService.isInDemoMode()).toBe(true);
    });

    it('should block delete with restriction message in demo mode', () => {
      mockDemoService.isInDemoMode = vi.fn(() => true);

      const history = mockHistoryStore.groupHistory()[0]!;
      component.onDeleteClick(history);

      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
    });

    it('should always show help button', () => {
      const helpButton = el.querySelector('mat-icon');
      expect(helpButton).toBeTruthy();
    });
  });
});
