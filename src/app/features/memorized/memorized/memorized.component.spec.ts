import { BreakpointObserver } from '@angular/cdk/layout';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { SplitService } from '@services/split.service';
import { CategoryStore } from '@store/category.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { MemorizedStore } from '@store/memorized.store';
import {
  createMockCategoryStore,
  createMockGroupStore,
  createMockLoadingService,
  createMockMatDialog,
  createMockMemberStore,
  createMockMemorizedStore,
  createMockSnackBar,
  createMockSplitService,
  mockDocRef,
} from '@testing/test-helpers';
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
});
