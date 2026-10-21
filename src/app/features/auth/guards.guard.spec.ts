import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import * as authModule from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupStore } from '@store/group.store';
import {
  adminGuard,
  APP_OWNER_EMAIL,
  groupGuard,
  loggedInGuard,
  noCrawlerGuard,
} from './guards.guard';

describe('loggedInGuard', () => {
  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
  };
  const mockAuth = {
    currentUser: null as Partial<authModule.User> | null,
    authStateReady: vi.fn().mockResolvedValue(undefined),
  };

  function runGuard(): Promise<boolean> {
    return TestBed.runInInjectionContext(() =>
      Promise.resolve(loggedInGuard({} as any, {} as any) as any)
    );
  }

  // waitForAuthInit resolves once authStateReady() resolves - simulate
  // Firebase having already loaded the given (possibly null) user.
  function mockAuthUser(user: Partial<authModule.User> | null): void {
    mockAuth.currentUser = user;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: authModule.getAuth, useValue: mockAuth },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should allow a logged-out visitor through', async () => {
    mockAuthUser(null);

    const result = await runGuard();

    expect(result).toBe(true);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should redirect a validated Google user to expenses', async () => {
    mockAuthUser({
      providerData: [{ providerId: 'google.com' } as authModule.UserInfo],
      emailVerified: false,
    });

    await runGuard();

    expect(mockRouter.navigate).toHaveBeenCalledWith([
      ROUTE_PATHS.EXPENSES_ROOT,
    ]);
  });

  it('should redirect a validated (email-confirmed) user to expenses', async () => {
    mockAuthUser({
      providerData: [{ providerId: 'password' } as authModule.UserInfo],
      emailVerified: true,
    });

    await runGuard();

    expect(mockRouter.navigate).toHaveBeenCalledWith([
      ROUTE_PATHS.EXPENSES_ROOT,
    ]);
  });

  it('should redirect an unverified logged-in user to account', async () => {
    mockAuthUser({
      providerData: [{ providerId: 'password' } as authModule.UserInfo],
      emailVerified: false,
    });

    await runGuard();

    expect(mockRouter.navigate).toHaveBeenCalledWith([
      ROUTE_PATHS.AUTH_ACCOUNT,
    ]);
  });
});

// The redirecting guards return a UrlTree rather than calling
// router.navigate(), so a guard listed after authGuard can't supersede
// authGuard's redirect.
describe('redirecting guards', () => {
  const mockRouter = {
    navigate: vi.fn().mockResolvedValue(true),
    createUrlTree: vi.fn((commands: unknown[]) => ({ commands })),
  };
  const mockAuth = {
    currentUser: null as Partial<authModule.User> | null,
    authStateReady: vi.fn().mockResolvedValue(undefined),
  };
  const mockGroupStore = {
    loaded: vi.fn(() => true),
    currentGroup: vi.fn((): unknown => null),
  };

  function run(guard: CanActivateFn): Promise<unknown> {
    return TestBed.runInInjectionContext(() =>
      Promise.resolve(guard({} as any, {} as any))
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = null;
    mockGroupStore.loaded.mockReturnValue(true);
    mockGroupStore.currentGroup.mockReturnValue(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: authModule.getAuth, useValue: mockAuth },
        { provide: GroupStore, useValue: mockGroupStore },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('adminGuard', () => {
    it('should send a signed-out visitor to login', async () => {
      const result = await run(adminGuard);

      expect(result).toEqual({ commands: [ROUTE_PATHS.AUTH_LOGIN] });
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should send a signed-in non-owner home', async () => {
      mockAuth.currentUser = { email: 'someone@example.com' };

      const result = await run(adminGuard);

      expect(result).toEqual({ commands: [ROUTE_PATHS.HOME] });
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should let the app owner through', async () => {
      mockAuth.currentUser = { email: APP_OWNER_EMAIL };

      expect(await run(adminGuard)).toBe(true);
    });
  });

  describe('groupGuard', () => {
    it('should send a user with no current group to Groups', async () => {
      const result = await run(groupGuard);

      expect(result).toEqual({ commands: [ROUTE_PATHS.ADMIN_GROUPS] });
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should allow a user with a current group through', async () => {
      mockGroupStore.currentGroup.mockReturnValue({ id: 'g1' });

      expect(await run(groupGuard)).toBe(true);
    });

    it('should allow through while groups are still loading', async () => {
      mockGroupStore.loaded.mockReturnValue(false);

      expect(await run(groupGuard)).toBe(true);
    });
  });

  describe('noCrawlerGuard', () => {
    it('should send the AdSense crawler home', async () => {
      mockAuth.currentUser = { email: 'adsensecrawler@google.com' };

      const result = await run(noCrawlerGuard);

      expect(result).toEqual({ commands: [ROUTE_PATHS.HOME] });
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should allow everyone else through', async () => {
      mockAuth.currentUser = { email: 'someone@example.com' };

      expect(await run(noCrawlerGuard)).toBe(true);
    });
  });
});
