import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ROUTE_PATHS } from '@constants/routes.constants';
import * as authModule from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loggedInGuard } from './guards.guard';

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

  it('should allow a logged-out visitor into demo', async () => {
    mockAuthUser(null);

    const result = await runGuard();

    expect(result).toBe(true);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('should redirect a validated Google user to expenses instead of demo', async () => {
    mockAuthUser({
      providerData: [{ providerId: 'google.com' } as authModule.UserInfo],
      emailVerified: false,
    });

    await runGuard();

    expect(mockRouter.navigate).toHaveBeenCalledWith([
      ROUTE_PATHS.EXPENSES_ROOT,
    ]);
  });

  it('should redirect a validated (email-confirmed) user to expenses instead of demo', async () => {
    mockAuthUser({
      providerData: [{ providerId: 'password' } as authModule.UserInfo],
      emailVerified: true,
    });

    await runGuard();

    expect(mockRouter.navigate).toHaveBeenCalledWith([
      ROUTE_PATHS.EXPENSES_ROOT,
    ]);
  });

  it('should redirect an unverified logged-in user to account instead of demo', async () => {
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
