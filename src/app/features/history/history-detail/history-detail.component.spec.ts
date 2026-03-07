import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getFunctions } from 'firebase/functions';
import { HistoryDetailComponent } from './history-detail.component';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { HistoryStore } from '@store/history.store';
import { CategoryStore } from '@store/category.store';
import { HistoryService } from '@services/history.service';
import { SortingService } from '@services/sorting.service';
import { LocaleService } from '@services/locale.service';
import { DemoService } from '@services/demo.service';
import { AnalyticsService } from '@services/analytics.service';
import { LoadingService } from '@shared/loading/loading.service';
import {
  createMockGroupStore,
  createMockMemberStore,
  createMockHistoryStore,
  createMockCategoryStore,
  createMockHistoryService,
  createMockSortingService,
  createMockDemoService,
  createMockAnalyticsService,
  createMockLoadingService,
  createMockMatDialog,
  createMockSnackBar,
  mockGroup,
  mockMember,
  mockHistory,
  mockSplit,
  mockDocRef,
} from '@testing/test-helpers';

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
  let mockDemoService: ReturnType<typeof createMockDemoService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockDialog: ReturnType<typeof createMockMatDialog>;
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockLocaleService: any;

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
    mockDemoService = createMockDemoService();
    mockAnalyticsService = createMockAnalyticsService();
    mockLoadingService = createMockLoadingService();
    mockDialog = createMockMatDialog();
    mockSnackBar = createMockSnackBar();

    mockGroupStore.currentGroup.set(mockGroup());
    mockMemberStore.currentMember.set(adminMember);
    mockMemberStore.groupMembers.set([adminMember, regularMember]);
    mockHistoryStore.groupHistory.set([testHistory]);

    mockLocaleService = {
      formatCurrency: vi.fn((amount: number) => `$${amount.toFixed(2)}`),
    };

    const mockActivatedRoute = {
      snapshot: {
        paramMap: {
          get: vi.fn((key: string) => (key === 'id' ? testHistoryId : null)),
        },
      },
    };

    await TestBed.configureTestingModule({
      imports: [HistoryDetailComponent],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        provideNativeDateAdapter(),
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: HistoryStore, useValue: mockHistoryStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: HistoryService, useValue: mockHistoryService },
        { provide: SortingService, useValue: mockSortingService },
        { provide: LocaleService, useValue: mockLocaleService },
        { provide: DemoService, useValue: mockDemoService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: getFunctions, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoryDetailComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    // Manually set history since afterNextRender behavior varies in test environments
    component.history.set(testHistory);
    fixture.detectChanges();
    await fixture.whenStable();
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

  describe('Demo mode', () => {
    beforeEach(() => {
      mockDemoService.isInDemoMode = vi.fn(() => true);
    });

    it('should show restriction message and not open dialog on onUnpayAll', async () => {
      await component.onUnpayAll();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should show restriction message and not open dialog on onUnpaySplit', async () => {
      const split = mockSplit();
      await component.onUnpaySplit(split);
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    it('should show restriction message and not open dialog on onUnpayGroupSettle', async () => {
      component.history.set(mockHistory({ batchId: 'batch-1', batchSize: 2 }));
      await component.onUnpayGroupSettle();
      expect(mockDemoService.showDemoModeRestrictionMessage).toHaveBeenCalled();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });

  describe('Dialog interactions', () => {
    it('should open confirm dialog on onUnpayAll when not in demo mode', async () => {
      mockDemoService.isInDemoMode = vi.fn(() => false);
      component.history.set(
        mockHistory({
          ...testHistory,
          splitsPaid: [mockDocRef('groups/group-1/splits/s-1')] as any,
        })
      );
      await component.onUnpayAll();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open confirm dialog on onUnpaySplit when not in demo mode', async () => {
      mockDemoService.isInDemoMode = vi.fn(() => false);
      const split = mockSplit();
      await component.onUnpaySplit(split);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    it('should open confirm dialog on onUnpayGroupSettle when not in demo mode', async () => {
      mockDemoService.isInDemoMode = vi.fn(() => false);
      component.history.set(mockHistory({ batchId: 'batch-1', batchSize: 2 }));
      await component.onUnpayGroupSettle();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('Copy to clipboard', () => {
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
});
