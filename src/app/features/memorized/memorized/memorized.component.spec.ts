import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { GuidedTourConfig } from '@models/guided-tour';
import { AnalyticsService } from '@services/analytics.service';
import { GuidedTourService } from '@services/guided-tour.service';
import { SplitService } from '@services/split.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import {
  createMockAnalyticsService,
  createMockCategoryStore,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockMemorizedStore,
  createMockSnackBar,
  createMockSplitService,
  mockCategory,
  mockDocRef,
  mockMember,
} from '@testing/test-helpers';
import { Memorized } from '@models/memorized';
import { getFirestore } from 'firebase/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemorizedComponent } from './memorized.component';

describe('MemorizedComponent', () => {
  let fixture: ComponentFixture<MemorizedComponent>;
  let component: MemorizedComponent;
  let mockMemorizedStore: ReturnType<typeof createMockMemorizedStore>;
  let mockMemberStore: ReturnType<typeof createMockMemberStore>;
  let mockCategoryStore: ReturnType<typeof createMockCategoryStore>;
  let router: Router;

  const mockBreakpointObserver = {
    observe: vi.fn(() => ({
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    })),
  };

  beforeEach(async () => {
    mockMemorizedStore = createMockMemorizedStore();
    mockMemberStore = createMockMemberStore();
    mockCategoryStore = createMockCategoryStore();

    await TestBed.configureTestingModule({
      imports: [MemorizedComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: createMockGroupStore() },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: MemorizedStore, useValue: mockMemorizedStore },
        {
          provide: SplitService,
          useValue: createMockSplitService(),
        },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: MatDialog, useValue: createMockMatDialog() },
        { provide: BreakpointObserver, useValue: mockBreakpointObserver },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
        { provide: getFirestore, useValue: {} },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MemorizedComponent);
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

  describe('filteredMemorizeds', () => {
    it('should return all memorized when searchText is empty', () => {
      const memberRef = mockDocRef('groups/group-1/members/member-1');
      const categoryRef = mockDocRef('groups/group-1/categories/cat-1');
      const expense = {
        id: 'mem-1',
        description: 'Lunch',
        paidByMemberRef: memberRef,
        categoryRef: categoryRef,
      } as any;
      mockMemorizedStore.setMemorizedExpenses([expense]);
      component.searchText.set('');

      expect(component.filteredMemorizeds().length).toBe(1);
    });

    it('should filter by description', () => {
      const memberRef = mockDocRef('groups/group-1/members/member-1');
      const categoryRef = mockDocRef('groups/group-1/categories/cat-1');
      const expense1 = {
        id: 'mem-1',
        description: 'Lunch',
        paidByMemberRef: memberRef,
        categoryRef,
      } as any;
      const expense2 = {
        id: 'mem-2',
        description: 'Dinner',
        paidByMemberRef: memberRef,
        categoryRef,
      } as any;
      mockMemorizedStore.setMemorizedExpenses([expense1, expense2]);
      component.searchText.set('lunch');

      expect(component.filteredMemorizeds().length).toBe(1);
      expect(component.filteredMemorizeds()[0]!.id).toBe('mem-1');
    });
  });

  describe('onExpandClick', () => {
    it('should set expandedExpense to clicked expense', () => {
      const expense = { id: 'mem-1' } as any;
      component.onExpandClick(expense);
      expect(component.expandedExpense()).toBe(expense);
    });

    it('should collapse already-expanded expense', () => {
      const expense = { id: 'mem-1' } as any;
      component.expandedExpense.set(expense);
      component.onExpandClick(expense);
      expect(component.expandedExpense()).toBeNull();
    });
  });

  describe('onRowClick', () => {
    it('should navigate to memorized detail', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onRowClick({ id: 'mem-1' } as any);
      expect(navigateSpy).toHaveBeenCalledWith(['/memorized', 'mem-1']);
    });
  });

  describe('addExpense', () => {
    it('should navigate to add expense with state', async () => {
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const expense = {
        id: 'mem-1',
        description: 'Lunch',
        categoryRef: mockDocRef('groups/group-1/categories/cat-1'),
        paidByMemberRef: mockDocRef('groups/group-1/members/member-1'),
        sharedAmount: 10,
        allocatedAmount: 10,
        totalAmount: 10,
        splitMethod: 'amount',
        splits: [],
      } as any;
      component.addExpense(expense);
      expect(navigateSpy).toHaveBeenCalledWith(
        ['/expenses/add'],
        expect.objectContaining({
          state: expect.objectContaining({
            expense: expect.objectContaining({ id: 'mem-1' }),
          }),
        })
      );
    });
  });

  describe('onSearchFocus / onSearchBlur', () => {
    it('should set searchFocused to true on focus', () => {
      component.onSearchFocus();
      expect(component.searchFocused()).toBe(true);
    });

    it('should set searchFocused to false on blur when no search text', () => {
      component.searchFocused.set(true);
      component.searchText.set('');
      component.onSearchBlur();
      expect(component.searchFocused()).toBe(false);
    });

    it('should keep searchFocused true on blur when search text exists', () => {
      component.searchFocused.set(true);
      component.searchText.set('lunch');
      component.onSearchBlur();
      expect(component.searchFocused()).toBe(true);
    });
  });
  describe('guided tour', () => {
    let tourConfig: GuidedTourConfig;
    let startSpy: ReturnType<typeof vi.spyOn>;
    const me = mockMember({
      id: 'me',
      displayName: 'Pat',
      ref: mockDocRef('groups/group-1/members/me'),
    });
    const bob = mockMember({
      id: 'bob',
      displayName: 'Bob',
      ref: mockDocRef('groups/group-1/members/bob'),
    });

    beforeEach(() => {
      mockMemberStore.currentMember.set(me);
      mockMemberStore.groupMembers.set([me, bob]);
      mockCategoryStore.groupCategories.set([
        mockCategory({ id: 'default', name: 'Default' }),
      ]);
      startSpy = vi
        .spyOn(TestBed.inject(GuidedTourService), 'start')
        .mockImplementation(async (config) => {
          tourConfig = config;
        });
    });

    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const byTestId = (id: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${id}"]`);
    const runStep = async (id: string) =>
      tourConfig.steps.find((s) => s.id === id)!.beforeShow?.();

    it('should start the memorized tour from the help icon', async () => {
      await render();
      byTestId('memorized-help-button').click();

      expect(startSpy).toHaveBeenCalledOnce();
      expect(tourConfig.id).toBe('memorized');
    });

    it('should show sample templates split with the real members when there are none', async () => {
      await render();
      expect(byTestId('no-memorized-placeholder')).toBeTruthy();

      component.startTour();
      await render();

      expect(byTestId('no-memorized-placeholder')).toBeNull();
      expect(component.memorizeds().map((m) => m.description)).toEqual([
        'Rent',
        'Internet',
      ]);
      const rent = component.memorizeds()[0]!;
      expect(rent.paidByMember).toBe(me);
      expect(rent.splits.map((s) => s.owedByMember!.displayName)).toEqual([
        'Pat',
        'Bob',
      ]);
      // Splits add up to the total, with the last taking any rounding
      const internet = component.memorizeds()[1]!;
      expect(
        internet.splits.reduce((t, s) => t + s.allocatedAmount!, 0)
      ).toBeCloseTo(79.99, 2);
      expect(tourConfig.steps[0]!.text).toContain('samples');
    });

    it('should use the real templates when there are some', () => {
      mockMemorizedStore.memorizedExpenses.set([
        new Memorized({ id: 'm1', description: 'Gym', splits: [] }),
      ]);
      component.startTour();

      expect(component.memorizeds()).toHaveLength(1);
      expect(tourConfig.steps[0]!.text).not.toContain('samples');
    });

    it('should expand the first template for the splits step and restore after', async () => {
      component.startTour();
      await runStep('splits');
      expect(component.expandedExpense()?.description).toBe('Rent');

      await runStep('create');
      expect(component.expandedExpense()).toBeNull();

      await runStep('splits');
      tourConfig.onEnd!('closed');
      expect(component.expandedExpense()).toBeNull();
      expect(component.memorizeds()).toEqual([]);
    });

    it('should stop the tour when the page is destroyed', () => {
      const stopSpy = vi.spyOn(TestBed.inject(GuidedTourService), 'stop');
      fixture.destroy();
      expect(stopSpy).toHaveBeenCalledWith('closed');
    });
  });
});
