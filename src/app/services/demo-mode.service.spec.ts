import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DemoModeService } from './demo-mode.service';
import { UserStore } from '@store/user.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';
import { MemorizedStore } from '@store/memorized.store';
import { HistoryStore } from '@store/history.store';
import { SplitStore } from '@store/split.store';

describe('DemoModeService', () => {
  const mockUserStore = {
    setUser: vi.fn(),
    setIsDemoMode: vi.fn(),
    user: signal<any>(null),
    isDemoMode: signal(false),
  };
  const mockGroupStore = {
    setAllUserGroups: vi.fn(),
    setCurrentGroup: vi.fn(),
    currentGroup: signal<any>(null),
    allUserGroups: signal<any[]>([]),
  };
  const mockMemberStore = {
    setGroupMembers: vi.fn(),
    setCurrentMember: vi.fn(),
    groupMembers: signal<any[]>([]),
    currentMember: signal<any>(null),
  };
  const mockCategoryStore = {
    setGroupCategories: vi.fn(),
    groupCategories: signal<any[]>([]),
  };
  const mockExpenseStore = {
    setGroupExpenses: vi.fn(),
    groupExpenses: signal<any[]>([]),
  };
  const mockMemorizedStore = {
    setMemorizedExpenses: vi.fn(),
    memorizedExpenses: signal<any[]>([]),
  };
  const mockHistoryStore = {
    setHistory: vi.fn(),
    groupHistory: signal<any[]>([]),
  };
  const mockSplitStore = {
    setSplits: vi.fn(),
    unpaidSplits: signal<any[]>([]),
  };

  let service: DemoModeService;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        DemoModeService,
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: ExpenseStore, useValue: mockExpenseStore },
        { provide: MemorizedStore, useValue: mockMemorizedStore },
        { provide: HistoryStore, useValue: mockHistoryStore },
        { provide: SplitStore, useValue: mockSplitStore },
      ],
    });
    service = TestBed.inject(DemoModeService);
  });

  describe('initializeDemoData', () => {
    beforeEach(() => {
      service.initializeDemoData();
    });

    it('should set a demo user in the user store', () => {
      expect(mockUserStore.setUser).toHaveBeenCalledOnce();
      const user = mockUserStore.setUser.mock.calls[0]![0];
      expect(user.email).toBe('demo@example.com');
    });

    it('should enable demo mode in the user store', () => {
      expect(mockUserStore.setIsDemoMode).toHaveBeenCalledWith(true);
    });

    it('should populate the group store with one demo group', () => {
      expect(mockGroupStore.setAllUserGroups).toHaveBeenCalledOnce();
      const groups = mockGroupStore.setAllUserGroups.mock.calls[0]![0];
      expect(groups).toHaveLength(1);
      expect(groups[0].name).toBe('Demo Household');
    });

    it('should set the current group', () => {
      expect(mockGroupStore.setCurrentGroup).toHaveBeenCalledOnce();
    });

    it('should populate members store with three members', () => {
      expect(mockMemberStore.setGroupMembers).toHaveBeenCalledOnce();
      const members = mockMemberStore.setGroupMembers.mock.calls[0]![0];
      expect(members).toHaveLength(3);
    });

    it('should set Alice as the current member', () => {
      expect(mockMemberStore.setCurrentMember).toHaveBeenCalledOnce();
      const member = mockMemberStore.setCurrentMember.mock.calls[0]![0];
      expect(member.displayName).toBe('Alice Johnson');
    });

    it('should populate categories store with four categories', () => {
      expect(mockCategoryStore.setGroupCategories).toHaveBeenCalledOnce();
      const categories = mockCategoryStore.setGroupCategories.mock.calls[0]![0];
      expect(categories).toHaveLength(4);
    });

    it('should populate expenses store with four expenses', () => {
      expect(mockExpenseStore.setGroupExpenses).toHaveBeenCalledOnce();
      const expenses = mockExpenseStore.setGroupExpenses.mock.calls[0]![0];
      expect(expenses).toHaveLength(4);
    });

    it('should populate memorized store with two templates', () => {
      expect(mockMemorizedStore.setMemorizedExpenses).toHaveBeenCalledOnce();
      const memorized =
        mockMemorizedStore.setMemorizedExpenses.mock.calls[0]![0];
      expect(memorized).toHaveLength(2);
    });

    it('should populate history store with two records', () => {
      expect(mockHistoryStore.setHistory).toHaveBeenCalledOnce();
      const history = mockHistoryStore.setHistory.mock.calls[0]![0];
      expect(history).toHaveLength(2);
    });

    it('should set a currentGroup entry in localStorage', () => {
      const stored = localStorage.getItem('currentGroup');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.name).toBe('Demo Household');
    });

    it('should only include unpaid splits in the split store', () => {
      expect(mockSplitStore.setSplits).toHaveBeenCalledOnce();
      const splits = mockSplitStore.setSplits.mock.calls[0]![0];
      // Only splits from unpaid expenses are included (expense1, expense2, expense4)
      for (const split of splits) {
        expect(split.paid).toBe(false);
      }
    });

    it('should create mock doc refs with a working eq() method', () => {
      const groups = mockGroupStore.setAllUserGroups.mock.calls[0]![0];
      const group = groups[0];
      expect(group.ref.eq({ id: 'demo-group-123' })).toBe(true);
      expect(group.ref.eq({ id: 'other-id' })).toBe(false);
    });
  });
});
