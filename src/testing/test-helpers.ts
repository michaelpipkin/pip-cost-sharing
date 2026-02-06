import { computed, signal } from '@angular/core';
import { vi } from 'vitest';
import { Group } from '@models/group';
import { Member } from '@models/member';
import { Category } from '@models/category';
import { User } from '@models/user';

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
