import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DemoService } from './demo.service';
import { DemoModeService } from './demo-mode.service';
import { UserStore } from '@store/user.store';
import { GroupStore } from '@store/group.store';
import { MemberStore } from '@store/member.store';
import { CategoryStore } from '@store/category.store';
import { ExpenseStore } from '@store/expense.store';

describe('DemoService', () => {
  const mockRouter = {
    url: '/',
    navigate: vi.fn(),
    navigateByUrl: vi.fn(),
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

  describe('demo mode state', () => {
    it('should return false for isInDemoMode initially', () => {
      const service = createService('/');
      expect(service.isInDemoMode()).toBe(false);
    });

    it('should set isInDemoMode to true when enterDemoMode is called', () => {
      const service = createService('/');
      service.enterDemoMode();
      expect(service.isInDemoMode()).toBe(true);
    });

    it('should not detect non-demo routes as demo routes', () => {
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
    it('should initialize demo data on first call to enterDemoMode', () => {
      const service = createService('/');
      service.enterDemoMode();
      expect(mockDemoModeService.initializeDemoData).toHaveBeenCalledOnce();
    });

    it('should not reinitialize demo data on subsequent calls to enterDemoMode', () => {
      const service = createService('/');
      service.enterDemoMode();
      service.enterDemoMode(); // second call is a no-op when already in demo mode
      expect(mockDemoModeService.initializeDemoData).toHaveBeenCalledOnce();
    });
  });

  describe('demo data cleanup', () => {
    it('should clear stores when exitDemoMode is called', () => {
      const service = createService('/');
      service.enterDemoMode();
      service.exitDemoMode();
      expect(mockUserStore.clearUser).toHaveBeenCalled();
      expect(mockGroupStore.clearCurrentGroup).toHaveBeenCalled();
      expect(mockGroupStore.setAllUserGroups).toHaveBeenCalledWith([]);
      expect(mockMemberStore.setGroupMembers).toHaveBeenCalledWith([]);
      expect(mockCategoryStore.clearGroupCategories).toHaveBeenCalled();
      expect(mockExpenseStore.clearGroupExpenses).toHaveBeenCalled();
    });

    it('should set isInDemoMode to false when exitDemoMode is called', () => {
      const service = createService('/');
      service.enterDemoMode();
      service.exitDemoMode();
      expect(service.isInDemoMode()).toBe(false);
    });

    it('should not clear stores when exitDemoMode is called but not in demo mode', () => {
      const service = createService('/');
      service.exitDemoMode(); // no-op when not in demo mode
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
