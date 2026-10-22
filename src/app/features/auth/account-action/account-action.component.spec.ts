import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
  createMockUserStore,
} from '@testing/test-helpers';
import * as authModule from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountActionComponent } from './account-action.component';

describe('AccountActionComponent', () => {
  let fixture: ComponentFixture<AccountActionComponent>;
  let component: AccountActionComponent;
  let mockUserService: {
    updateUserEmailAndLinkMembers: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    expectSignOut: ReturnType<typeof vi.fn>;
  };
  let mockSnackBar: ReturnType<typeof createMockSnackBar>;
  let mockUserStore: ReturnType<typeof createMockUserStore>;

  const authStateReady = () => Promise.resolve();

  const mockAuthWithUser = {
    authStateReady,
    currentUser: {
      email: 'test@example.com',
      emailVerified: false,
      reload: vi.fn().mockResolvedValue(undefined),
    },
  };

  const mockAuthWithoutUser = {
    authStateReady,
    currentUser: null,
  };

  // `configure` adjusts the fresh UserService mock before the page runs its
  // action (which happens during creation).
  async function createComponent(
    authValue: any,
    queryParams: Record<string, string>,
    configure: (userService: typeof mockUserService) => void = () => {}
  ) {
    mockSnackBar = createMockSnackBar();
    mockUserStore = createMockUserStore();
    mockUserService = {
      updateUserEmailAndLinkMembers: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      expectSignOut: vi.fn(),
    };
    configure(mockUserService);

    const mockRoute = {
      snapshot: { queryParams },
    };

    await TestBed.configureTestingModule({
      imports: [AccountActionComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: authValue },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: UserService, useValue: mockUserService },
        { provide: UserStore, useValue: mockUserStore },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountActionComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('when no oobCode is provided', () => {
    beforeEach(async () => {
      await createComponent(mockAuthWithoutUser, { mode: 'verifyEmail' });
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should set errorMessage when no oobCode', () => {
      expect(component.errorMessage()).toContain('Invalid link');
    });

    it('should have null mode', () => {
      expect(component.mode()).toBeNull();
    });
  });

  describe('in verifyEmail mode', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);

      await createComponent(mockAuthWithUser, {
        mode: 'verifyEmail',
        oobCode: 'test-verify-code',
      });
    });

    it('should set mode to verifyEmail', () => {
      expect(component.mode()).toBe('verifyEmail');
    });

    it('should call applyActionCode on initialization', () => {
      expect(authModule.applyActionCode).toHaveBeenCalledWith(
        mockAuthWithUser,
        'test-verify-code'
      );
    });

    it('should set success to true on successful verification', async () => {
      await fixture.whenStable();
      expect(component.success()).toBe(true);
    });

    it('should not expect a sign-out (verifying keeps the address)', () => {
      expect(mockUserService.expectSignOut).not.toHaveBeenCalledWith(true);
    });

    it('should write the verified address to the profile and link invites', () => {
      expect(mockAuthWithUser.currentUser.reload).toHaveBeenCalled();
      expect(mockUserService.updateUserEmailAndLinkMembers).toHaveBeenCalledWith(
        'test@example.com'
      );
    });

    it('should return correct title', () => {
      expect(component.getTitle()).toBe('Email Verification');
    });

    it('should return correct success message', () => {
      expect(component.getSuccessMessage()).toContain('confirmed your email');
    });
  });

  describe('in verifyAndChangeEmail mode (the link verifyBeforeUpdateEmail sends)', () => {
    const changeParams = { mode: 'verifyAndChangeEmail', oobCode: 'change-code' };
    const text = (id: string) =>
      (
        fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as
          | HTMLElement
          | null
      )?.textContent?.trim();

    // A signed-in user whose reload() picks up the changed address, as the
    // Auth emulator does once the code is applied.
    function signedInChanging() {
      const user: any = {
        email: 'old@example.com',
        emailVerified: true,
        reload: vi.fn(async () => {
          user.email = 'new@example.com';
        }),
      };
      return { authStateReady, currentUser: user };
    }

    it('applies the code, then writes the new verified address and links invites', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const auth = signedInChanging();

      await createComponent(auth, changeParams);

      expect(authModule.applyActionCode).toHaveBeenCalledWith(auth, 'change-code');
      expect(auth.currentUser.reload).toHaveBeenCalled();
      expect(mockUserService.updateUserEmailAndLinkMembers).toHaveBeenCalledWith(
        'new@example.com'
      );
      expect(mockUserStore.setIsEmailConfirmed).toHaveBeenCalledWith(true);
      expect(component.success()).toBe(true);
      expect(text('account-action-title')).toBe('Email Change');
      expect(text('account-action-success-message')).toBe(
        'Your new email address is confirmed!'
      );
      expect(text('account-action-success-hint')).toBe(
        'You now sign in with new@example.com.'
      );
      expect(text('account-action-continue-account')).toBe('Continue to Account');
    });

    const SIGN_IN_AGAIN =
      'Your email address has been changed. Please sign in with your new address.';

    // Production revokes the session on an email change; the reload or the
    // token refresh after the code then fails. Each case below fakes one of
    // those post-apply failures: none may show an error, and UserService
    // must have been told to expect the sign-out first.
    async function expectSignInAgain(
      auth: any,
      configure?: (userService: typeof mockUserService) => void
    ): Promise<void> {
      await createComponent(auth, changeParams, configure);
      // The sign-out path awaits once more; render what it left.
      await fixture.whenStable();
      fixture.detectChanges();

      expect(component.success()).toBe(true);
      expect(component.errorMessage()).toBe('');
      expect(component.isUserLoggedIn()).toBe(false);
      expect(text('account-action-success-message')).toBe(SIGN_IN_AGAIN);
      expect(text('account-action-success-hint')).toBeUndefined();
      expect(text('account-action-continue-login')).toBe('Continue to Login');
      expect(fixture.nativeElement.querySelector('[data-testid="account-action-error"]')).toBeNull();
      expect(mockUserService.expectSignOut).toHaveBeenCalledWith(true);
      expect(mockUserService.expectSignOut.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(authModule.applyActionCode).mock.invocationCallOrder[0]!
      );
      // Signed out: the expectation is left for UserService's listener.
      expect(mockUserService.expectSignOut).not.toHaveBeenCalledWith(false);
    }

    it('treats a revoked session on reload (user-token-expired) as success', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const auth: any = signedInChanging();
      // The SDK signs out (user-token-expired) before reload() rejects.
      auth.currentUser.reload = vi.fn(async () => {
        auth.currentUser = null;
        throw Object.assign(new Error('expired'), {
          code: 'auth/user-token-expired',
        });
      });

      await expectSignInAgain(auth);
      expect(mockUserService.updateUserEmailAndLinkMembers).not.toHaveBeenCalled();
    });

    it('treats a failed token refresh after a successful reload as success', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const auth: any = signedInChanging();
      // reload() works, then getIdToken(true) inside the profile write finds
      // the refresh token revoked and the SDK signs out.
      await expectSignInAgain(auth, (userService) => {
        userService.updateUserEmailAndLinkMembers.mockImplementationOnce(
          async () => {
            auth.currentUser = null;
            throw Object.assign(new Error('expired'), {
              code: 'auth/user-token-expired',
            });
          }
        );
      });
      expect(mockUserService.logout).not.toHaveBeenCalled();
    });

    it('signs out and treats it as success when the session is dead but the SDK stayed signed in (user-not-found)', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const auth: any = signedInChanging();
      await expectSignInAgain(auth, (userService) => {
        userService.updateUserEmailAndLinkMembers.mockRejectedValueOnce(
          Object.assign(new Error('gone'), { code: 'auth/user-not-found' })
        );
        userService.logout.mockImplementationOnce(async () => {
          auth.currentUser = null;
        });
      });
      expect(mockUserService.logout).toHaveBeenCalledWith(false);
    });

    it('stops expecting a sign-out when the session survives the change', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);

      await createComponent(signedInChanging(), changeParams);

      expect(mockUserService.expectSignOut).toHaveBeenNthCalledWith(1, true);
      expect(mockUserService.expectSignOut).toHaveBeenLastCalledWith(false);
    });

    it('waits for the persisted sign-in before treating the visitor as signed out', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const restored = signedInChanging().currentUser;
      // A fresh load: Auth restores the session from storage a moment later.
      const auth: any = {
        currentUser: null,
        authStateReady: async () => {
          auth.currentUser = restored;
        },
      };

      await createComponent(auth, changeParams);

      expect(mockUserService.updateUserEmailAndLinkMembers).toHaveBeenCalledWith(
        'new@example.com'
      );
      expect(component.isUserLoggedIn()).toBe(true);
    });

    it('confirms the change for a signed-out visitor without writing anything', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);

      await createComponent(mockAuthWithoutUser, changeParams);

      expect(authModule.applyActionCode).toHaveBeenCalledWith(
        mockAuthWithoutUser,
        'change-code'
      );
      expect(mockUserService.updateUserEmailAndLinkMembers).not.toHaveBeenCalled();
      expect(component.success()).toBe(true);
    });

    it('shows the error for a used or bad link', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockRejectedValue({
        code: 'auth/invalid-action-code',
        message: 'Invalid code',
      });

      await createComponent(signedInChanging(), changeParams);

      expect(component.errorMessage()).toBe(
        'Failed to change email. The link is invalid or has expired.'
      );
      expect(mockUserService.updateUserEmailAndLinkMembers).not.toHaveBeenCalled();
      // Nothing changed, so the session stays and is no longer expected to end.
      expect(mockUserService.expectSignOut).toHaveBeenNthCalledWith(1, true);
      expect(mockUserService.expectSignOut).toHaveBeenLastCalledWith(false);
    });
  });

  describe('in recoverEmail mode', () => {
    it('restores the profile to the recovered (verified) address when signed in', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const user: any = {
        email: 'attacker@example.com',
        emailVerified: true,
        reload: vi.fn(async () => {
          user.email = 'owner@example.com';
        }),
      };

      await createComponent(
        { authStateReady, currentUser: user },
        { mode: 'recoverEmail', oobCode: 'recover-code' }
      );

      expect(mockUserService.updateUserEmailAndLinkMembers).toHaveBeenCalledWith(
        'owner@example.com'
      );
      expect(component.success()).toBe(true);
      expect(mockUserService.expectSignOut).toHaveBeenCalledWith(true);
    });
  });

  describe('with an unknown mode', () => {
    it('refuses the link', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);

      await createComponent(mockAuthWithUser, { mode: 'bogus', oobCode: 'x' });

      expect(component.errorMessage()).toBe('Invalid link. Unknown action.');
      expect(authModule.applyActionCode).not.toHaveBeenCalled();
    });
  });

  describe('in resetPassword mode', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'confirmPasswordReset').mockResolvedValue(undefined);

      await createComponent(mockAuthWithoutUser, {
        mode: 'resetPassword',
        oobCode: 'test-reset-code',
      });
    });

    it('should set mode to resetPassword', () => {
      expect(component.mode()).toBe('resetPassword');
    });

    it('should return correct title', () => {
      expect(component.getTitle()).toBe('Reset Password');
    });

    it('should call confirmPasswordReset when resetPassword() is called', async () => {
      const passwordInput = fixture.nativeElement.querySelector(
        '[data-testid="account-action-password-input"]'
      ) as HTMLInputElement;
      const confirmInput = fixture.nativeElement.querySelector(
        '[data-testid="account-action-confirm-password-input"]'
      ) as HTMLInputElement;

      passwordInput.value = 'newpassword123';
      passwordInput.dispatchEvent(new Event('input'));
      confirmInput.value = 'newpassword123';
      confirmInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      await component.resetPassword();

      expect(authModule.confirmPasswordReset).toHaveBeenCalledWith(
        mockAuthWithoutUser,
        'test-reset-code',
        'newpassword123'
      );
    });

    it('should set success to true on successful reset', async () => {
      const passwordInput = fixture.nativeElement.querySelector(
        '[data-testid="account-action-password-input"]'
      ) as HTMLInputElement;
      const confirmInput = fixture.nativeElement.querySelector(
        '[data-testid="account-action-confirm-password-input"]'
      ) as HTMLInputElement;

      passwordInput.value = 'newpassword123';
      passwordInput.dispatchEvent(new Event('input'));
      confirmInput.value = 'newpassword123';
      confirmInput.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      await component.resetPassword();

      expect(component.success()).toBe(true);
    });
  });

  describe('handleError', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'applyActionCode').mockRejectedValue({
        code: 'auth/invalid-action-code',
        message: 'Invalid code',
      });

      await createComponent(mockAuthWithUser, {
        mode: 'verifyEmail',
        oobCode: 'invalid-code',
      });
    });

    it('should set errorMessage on auth error', async () => {
      await fixture.whenStable();
      expect(component.errorMessage()).toContain('invalid or has expired');
    });
  });

  describe('resendVerificationEmail', () => {
    beforeEach(async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      vi.spyOn(authModule, 'sendEmailVerification').mockResolvedValue(
        undefined
      );

      await createComponent(mockAuthWithUser, {
        mode: 'verifyEmail',
        oobCode: 'test-code',
      });
    });

    it('should call sendEmailVerification when user is logged in', async () => {
      await component.resendVerificationEmail();
      expect(authModule.sendEmailVerification).toHaveBeenCalled();
    });
  });

  describe('getTitle with no mode', () => {
    beforeEach(async () => {
      await createComponent(mockAuthWithoutUser, {});
    });

    it('should return default title when mode is null', () => {
      expect(component.getTitle()).toBe('Account Action');
    });
  });
});
