import { computed, signal } from '@angular/core';
import { vi } from 'vitest';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Category } from '@models/category';
import { User } from '@models/user';
import { History } from '@models/history';
import { Split } from '@models/split';
import { AmountDue } from '@models/amount-due';

// ---- Mock DocumentReference ----

export function mockDocRef(path: string = 'mock/ref'): any {
  return {
    path,
    id: path.split('/').pop(),
    eq(other: any) {
      return other?.path === this.path;
    },
  };
}

// ---- Mock Model Factories ----

export function mockGroup(overrides: Partial<Group> = {}): Group {
  return new Group({
    id: 'group-1',
    name: 'Test Group',
    active: true,
    autoAddMembers: false,
    currencyCode: 'USD',
    currencySymbol: '$',
    decimalPlaces: 2,
    archived: false,
    ref: mockDocRef('groups/group-1'),
    userActiveInGroup: true,
    userIsAdmin: true,
    ...overrides,
  });
}

export function mockMember(overrides: Partial<Member> = {}): Member {
  return new Member({
    id: 'member-1',
    displayName: 'Test Member',
    email: 'test@example.com',
    active: true,
    groupAdmin: false,
    userRef: mockDocRef('users/user-1'),
    ref: mockDocRef('groups/group-1/members/member-1'),
    ...overrides,
  });
}

export function mockCategory(overrides: Partial<Category> = {}): Category {
  return new Category({
    id: 'cat-1',
    name: 'Food',
    active: true,
    ref: mockDocRef('groups/group-1/categories/cat-1'),
    ...overrides,
  });
}

export function mockUser(overrides: Partial<User> = {}): User {
  return new User({
    id: 'user-1',
    email: 'test@example.com',
    ref: mockDocRef('users/user-1'),
    ...overrides,
  });
}

export function mockHistory(overrides: Partial<History> = {}): History {
  return new History({
    id: 'history-1',
    date: new Date('2024-01-15'),
    totalPaid: 50,
    paidByMemberRef: mockDocRef('groups/group-1/members/member-1'),
    paidToMemberRef: mockDocRef('groups/group-1/members/member-2'),
    splitsPaid: [],
    ref: mockDocRef('groups/group-1/history/history-1'),
    ...overrides,
  });
}

export function mockSplit(overrides: Partial<Split> = {}): Split {
  return new Split({
    id: 'split-1',
    date: new Date('2024-01-15'),
    expenseRef: mockDocRef('groups/group-1/expenses/expense-1'),
    paidByMemberRef: mockDocRef('groups/group-1/members/member-1'),
    owedByMemberRef: mockDocRef('groups/group-1/members/member-2'),
    categoryRef: mockDocRef('groups/group-1/categories/cat-1'),
    assignedAmount: 0,
    percentage: 0,
    allocatedAmount: 50,
    paid: false,
    ref: mockDocRef('groups/group-1/splits/split-1'),
    ...overrides,
  });
}

export function mockAmountDue(overrides: Partial<AmountDue> = {}): AmountDue {
  return new AmountDue({
    owedByMemberRef: mockDocRef('groups/group-1/members/member-1'),
    owedToMemberRef: mockDocRef('groups/group-1/members/member-2'),
    categoryRef: mockDocRef('groups/group-1/categories/cat-1'),
    amount: 50,
    ...overrides,
  });
}

// ---- Mock Store Factories ----

export function createMockGroupStore() {
  const currentGroup = signal<Group | null>(null);
  const allUserGroups = signal<Group[]>([]);
  const loaded = signal(true);
  const skipAutoSelect = signal(false);
  return {
    currentGroup,
    allUserGroups,
    loaded,
    skipAutoSelect,
    activeUserGroups: computed(() =>
      allUserGroups().filter(
        (g) =>
          ((g.active && g.userActiveInGroup) || g.userIsAdmin) && !g.archived
      )
    ),
    userAdminGroups: computed(() =>
      allUserGroups().filter((g) => g.userIsAdmin)
    ),
    setCurrentGroup: vi.fn((g: Group) => currentGroup.set(g)),
    clearCurrentGroup: vi.fn(() => currentGroup.set(null)),
    setAllUserGroups: vi.fn((groups: Group[]) => allUserGroups.set(groups)),
    setLoadedState: vi.fn((val: boolean) => loaded.set(val)),
    clearAllUserGroups: vi.fn(() => {
      allUserGroups.set([]);
      currentGroup.set(null);
      loaded.set(false);
    }),
    removeGroup: vi.fn(),
    resetSkipAutoSelect: vi.fn(),
  };
}

export function createMockMemberStore() {
  const currentMember = signal<Member | null>(null);
  const groupMembers = signal<Member[]>([]);
  const loaded = signal(true);
  return {
    currentMember,
    groupMembers,
    loaded,
    activeGroupMembers: computed(() => groupMembers().filter((m) => m.active)),
    setCurrentMember: vi.fn((m: Member) => currentMember.set(m)),
    clearCurrentMember: vi.fn(() => currentMember.set(null)),
    setGroupMembers: vi.fn((members: Member[]) => groupMembers.set(members)),
    clearGroupMembers: vi.fn(() => {
      groupMembers.set([]);
      currentMember.set(null);
      loaded.set(false);
    }),
    getMemberByRef: vi.fn((ref: any) =>
      groupMembers().find((m) => m.ref?.path === ref?.path) || null
    ),
  };
}

export function createMockCategoryStore() {
  const groupCategories = signal<Category[]>([]);
  const loaded = signal(true);
  return {
    groupCategories,
    loaded,
    activeGroupCategories: computed(() =>
      groupCategories().filter((c) => c.active)
    ),
    setGroupCategories: vi.fn((cats: Category[]) => groupCategories.set(cats)),
    clearGroupCategories: vi.fn(() => {
      groupCategories.set([]);
      loaded.set(false);
    }),
    getCategoryByRef: vi.fn(),
  };
}

export function createMockUserStore() {
  const user = signal<User | null>(null);
  const isGoogleUser = signal(false);
  const isEmailConfirmed = signal(false);
  const isDemoMode = signal(false);
  const defaultGroupRef = signal<any>(null);
  return {
    user,
    isGoogleUser,
    isEmailConfirmed,
    isDemoMode,
    defaultGroupRef,
    isLoggedIn: computed(() => !!user()),
    isValidUser: computed(() => isGoogleUser() || isEmailConfirmed()),
    setUser: vi.fn((u: User) => user.set(u)),
    updateUser: vi.fn(),
    clearUser: vi.fn(() => {
      user.set(null);
      isGoogleUser.set(false);
      isEmailConfirmed.set(false);
      defaultGroupRef.set(null);
    }),
    setIsGoogleUser: vi.fn((val: boolean) => isGoogleUser.set(val)),
    setIsEmailConfirmed: vi.fn((val: boolean) => isEmailConfirmed.set(val)),
    setIsDemoMode: vi.fn((val: boolean) => isDemoMode.set(val)),
  };
}

export function createMockHistoryStore() {
  const groupHistory = signal<History[]>([]);
  const loaded = signal(true);
  return {
    groupHistory,
    loaded,
    setGroupHistory: vi.fn((history: History[]) => groupHistory.set(history)),
    clearGroupHistory: vi.fn(() => {
      groupHistory.set([]);
      loaded.set(false);
    }),
  };
}

export function createMockSplitStore() {
  const unpaidSplits = signal<Split[]>([]);
  const loaded = signal(true);
  return {
    unpaidSplits,
    loaded,
    setUnpaidSplits: vi.fn((splits: Split[]) => unpaidSplits.set(splits)),
    clearUnpaidSplits: vi.fn(() => {
      unpaidSplits.set([]);
      loaded.set(false);
    }),
  };
}

// ---- Mock Service Factories ----

export function createMockLoadingService() {
  return {
    loading: signal(false),
    loadingOn: vi.fn(),
    loadingOff: vi.fn(),
  };
}

export function createMockAnalyticsService() {
  return {
    logEvent: vi.fn(),
  };
}

export function createMockDemoService() {
  return {
    isInDemoMode: vi.fn(() => false),
    showDemoModeRestrictionMessage: vi.fn(),
    navigateToDemo: vi.fn(),
    navigateToDemoRoute: vi.fn(),
  };
}

export function createMockSortingService() {
  return {
    sort: vi.fn((data: any[], _col: string, _asc: boolean) => [...data]),
  };
}

export function createMockTourService() {
  return {
    checkForContinueTour: vi.fn(),
    startWelcomeTour: vi.fn(),
    startMembersTour: vi.fn(),
    startCategoriesTour: vi.fn(),
    startHistoryTour: vi.fn(),
  };
}

export function createMockPwaDetectionService() {
  return {
    isRunningInBrowser: vi.fn(() => true),
    isRunningAsApp: vi.fn(() => false),
    getDisplayMode: vi.fn(() => signal('browser').asReadonly()),
  };
}

export function createMockSnackBar() {
  return {
    openFromComponent: vi.fn(),
    open: vi.fn(),
  };
}

export function createMockMatDialog() {
  return {
    open: vi.fn(() => ({
      afterClosed: () => ({ subscribe: vi.fn() }),
    })),
  };
}

export function createMockDialogRef() {
  return {
    close: vi.fn(),
  };
}

export function createMockGroupService() {
  return {
    addGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    archiveGroup: vi.fn(),
  };
}

export function createMockCategoryService() {
  return {
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
  };
}

export function createMockCalculatorOverlayService() {
  return {
    openCalculator: vi.fn(),
  };
}

export function createMockExpenseService() {
  return {
    addExpense: vi.fn(() => Promise.resolve()),
    updateExpense: vi.fn(() => Promise.resolve()),
    deleteExpense: vi.fn(() => Promise.resolve()),
    getExpense: vi.fn(),
    getExpenses: vi.fn(),
  };
}

export function createMockMemorizedService() {
  const memorized = signal<any[]>([]);
  return {
    memorized,
    loaded: signal(true),
    addMemorized: vi.fn(),
    updateMemorized: vi.fn(),
    deleteMemorized: vi.fn(),
  };
}

export function createMockCameraService() {
  return {
    takePicture: vi.fn(() => Promise.resolve(null)),
    chooseFromGallery: vi.fn(() => Promise.resolve(null)),
  };
}

export function createMockHistoryService() {
  return {
    deleteHistory: vi.fn(() => Promise.resolve()),
  };
}

export function createMockSplitService() {
  return {
    markAsPaid: vi.fn(() => Promise.resolve()),
  };
}
