import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DemoService } from './demo.service';
import { DemoModeService } from './demo-mode.service';
import { UserStore } from '@store/user.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';

describe('DemoService', () => {
  let navigationHandler: (event: any) => void;

  const mockRouter = {
    url: '/',
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
    events: {
      subscribe: vi.fn((handler: (event: any) => void) => {
        navigationHandler = handler;
        return { unsubscribe: vi.fn() };
      }),
    },
  };

  const mockDemoModeService = { initializeDemoData: vi.fn() };
  const mockSnackBar = { openFromComponent: vi.fn() };
  const mockUserStore = {
    clearUser: vi.fn(),
    setIsDemoMode: vi.fn(),
    user: signal<any>(null),
    isDemoMode: signal(false),
  };
  const mockGroupStore = {
    clearCurrentGroup: vi.fn(),
    setAllUserGroups: vi.fn(),
    currentGroup: signal<any>(null),
    allUserGroups: signal<any[]>([]),
  };
  const mockMemberStore = {
    setGroupMembers: vi.fn(),
    clearCurrentMember: vi.fn(),
    groupMembers: signal<any[]>([]),
    currentMember: signal<any>(null),
  };
  const mockCategoryStore = {
    clearGroupCategories: vi.fn(),
    groupCategories: signal<any[]>([]),
  };
  const mockExpenseStore = {
    clearGroupExpenses: vi.fn(),
    groupExpenses: signal<any[]>([]),
  };

  function createService(initialUrl = '/'): DemoService {
    mockRouter.url = initialUrl;
    TestBed.configureTestingModule({
      providers: [
        DemoService,
        { provide: Router, useValue: mockRouter },
        { provide: DemoModeService, useValue: mockDemoModeService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: UserStore, useValue: mockUserStore },
        { provide: GroupStore, useValue: mockGroupStore },
        { provide: MemberStore, useValue: mockMemberStore },
        { provide: CategoryStore, useValue: mockCategoryStore },
        { provide: ExpenseStore, useValue: mockExpenseStore },
      ],
    });
    return TestBed.inject(DemoService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('demo route detection', () => {
    it('should detect /demo as a demo route', () => {
      const service = createService('/demo');
      expect(service.isInDemoMode()).toBe(true);
    });

    it('should detect /demo/expenses as a demo route', () => {
      const service = createService('/demo/expenses');
      expect(service.isInDemoMode()).toBe(true);
    });

    it('should not detect /demo-anything as a demo route', () => {
      const service = createService('/demo-anything');
      expect(service.isInDemoMode()).toBe(false);
    });

    it('should not detect / as a demo route', () => {
      const service = createService('/');
      expect(service.isInDemoMode()).toBe(false);
    });

    it('should not detect /expenses as a demo route', () => {
      const service = createService('/expenses');
      expect(service.isInDemoMode()).toBe(false);
    });
  });

  describe('demo data initialization', () => {
    it('should initialize demo data on first visit to a demo route', () => {
      createService('/');
      navigationHandler(
        new NavigationEnd(1, '/demo/expenses', '/demo/expenses')
      );
      expect(mockDemoModeService.initializeDemoData).toHaveBeenCalledOnce();
    });

    it('should not reinitialize demo data on subsequent demo route visits', () => {
      createService('/demo/expenses');
      navigationHandler(new NavigationEnd(1, '/demo/summary', '/demo/summary'));
      // Only called once (during initial createService), not again on navigation
      expect(mockDemoModeService.initializeDemoData).toHaveBeenCalledOnce();
    });
  });

  describe('demo data cleanup', () => {
    it('should clear stores when leaving demo mode', () => {
      createService('/demo/expenses');
      // Navigate away from demo
      navigationHandler(new NavigationEnd(1, '/expenses', '/expenses'));
      expect(mockUserStore.clearUser).toHaveBeenCalled();
      expect(mockGroupStore.clearCurrentGroup).toHaveBeenCalled();
      expect(mockGroupStore.setAllUserGroups).toHaveBeenCalledWith([]);
      expect(mockMemberStore.setGroupMembers).toHaveBeenCalledWith([]);
      expect(mockCategoryStore.clearGroupCategories).toHaveBeenCalled();
      expect(mockExpenseStore.clearGroupExpenses).toHaveBeenCalled();
    });

    it('should set demo mode to false when leaving demo', () => {
      createService('/demo/expenses');
      navigationHandler(new NavigationEnd(1, '/expenses', '/expenses'));
      expect(mockUserStore.setIsDemoMode).toHaveBeenCalledWith(false);
    });

    it('should not clear stores when navigating between non-demo routes', () => {
      createService('/expenses');
      navigationHandler(new NavigationEnd(1, '/summary', '/summary'));
      expect(mockUserStore.clearUser).not.toHaveBeenCalled();
    });
  });

  describe('navigateToDemo', () => {
    it('should navigate to /demo/{path}', () => {
      const service = createService('/');
      service.navigateToDemo('expenses');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/demo', 'expenses']);
    });
  });

  describe('navigateToDemoRoute', () => {
    it('should navigate to the exact route', () => {
      const service = createService('/');
      service.navigateToDemoRoute('/demo/summary');
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/demo/summary');
    });
  });

  describe('showDemoModeRestrictionMessage', () => {
    it('should open a snackbar with the restriction message', () => {
      const service = createService('/');
      service.showDemoModeRestrictionMessage();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalled();
    });
  });
});
