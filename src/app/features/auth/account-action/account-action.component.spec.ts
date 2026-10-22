import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
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
import { FirebaseError } from 'firebase/app';
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
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;

  const authStateReady = () => Promise.resolve();

  // Unverified until reload(), which picks up the verification the applied
  // code made (as the Auth emulator does). Reset before every test.
  const mockAuthWithUser = {
    authStateReady,
    currentUser: {
      email: 'test@example.com',
      emailVerified: false,
      reload: vi.fn(async () => {
        mockAuthWithUser.currentUser.emailVerified = true;
      }),
    },
  };

  beforeEach(() => {
    mockAuthWithUser.currentUser.emailVerified = false;
  });

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
    mockAnalytics = createMockAnalyticsService();
    mockLoading = createMockLoadingService();
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
        { provide: LoadingService, useValue: mockLoading },
        { provide: UserService, useValue: mockUserService },
        { provide: UserStore, useValue: mockUserStore },
        { provide: AnalyticsService, useValue: mockAnalytics },
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

    // Final review M1: a link for another account, opened while signed in
    // to an account that stays unverified, has nothing to sync, and the
    // rules would refuse the write (then logged as an error).
    it('writes nothing when the signed-in account is still unverified after reload', async () => {
      TestBed.resetTestingModule();
      const auth = {
        authStateReady,
        currentUser: {
          email: 'other@example.com',
          emailVerified: false,
          reload: vi.fn().mockResolvedValue(undefined),
        },
      };

      await createComponent(auth, { mode: 'verifyEmail', oobCode: 'c' });

      expect(auth.currentUser.reload).toHaveBeenCalled();
      expect(mockUserService.updateUserEmailAndLinkMembers).not.toHaveBeenCalled();
      expect(mockUserStore.setIsEmailConfirmed).not.toHaveBeenCalled();
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(component.success()).toBe(true);
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

  describe('opening the page without a usable link', () => {
    it('sends a signed-in, verified user on to expenses when there is no code', async () => {
      const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
      const auth = {
        authStateReady,
        currentUser: { email: 'a@example.com', emailVerified: true },
      };

      await createComponent(auth, {});

      expect(navigate).toHaveBeenCalledWith(['/expenses']);
      expect(component.errorMessage()).toBe('');
    });

    it('shows and logs "No code provided" for a signed-out visitor', async () => {
      await createComponent(mockAuthWithoutUser, { mode: 'verifyEmail' });

      expect(component.errorMessage()).toBe('Invalid link. No code provided.');
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Action Component',
        'process_action',
        'No oobCode in URL',
        'N/A'
      );
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="account-action-error-message"]'
        ).textContent
      ).toContain('Invalid link. No code provided.');
    });

    it('shows and logs an unverified signed-in user the same way (no redirect)', async () => {
      const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);

      await createComponent(mockAuthWithUser, {});

      expect(navigate).not.toHaveBeenCalled();
      expect(component.errorMessage()).toBe('Invalid link. No code provided.');
    });

    it('logs the unknown mode it refused', async () => {
      await createComponent(mockAuthWithUser, { mode: 'bogus', oobCode: 'x' });

      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Action Component',
        'process_action',
        'Invalid mode: bogus',
        'N/A'
      );
      expect(component.mode()).toBeNull();
    });
  });

  describe('after the code is applied', () => {
    it.each([
      ['verifyEmail', 'email_verified'],
      ['verifyAndChangeEmail', 'email_changed'],
      ['recoverEmail', 'email_recovered'],
    ])('logs %s as %s', async (mode, event) => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);

      await createComponent(mockAuthWithoutUser, { mode, oobCode: 'code' });

      expect(mockAnalytics.logEvent).toHaveBeenCalledWith(event, {
        component: 'Account Action Component',
      });
      expect(component.processing()).toBe(false);
    });

    it.each([
      ['an Error', new Error('write failed'), 'write failed'],
      ['a non-Error', 'denied', 'Unknown error'],
    ])(
      'still succeeds when the profile write fails with %s, and keeps the session for a plain verification',
      async (_label, thrown, message) => {
        vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);

        await createComponent(mockAuthWithUser, { mode: 'verifyEmail', oobCode: 'c' }, (u) =>
          u.updateUserEmailAndLinkMembers.mockRejectedValueOnce(thrown)
        );

        expect(component.success()).toBe(true);
        expect(component.errorMessage()).toBe('');
        expect(mockAnalytics.logError).toHaveBeenCalledWith(
          'Account Action Component',
          'verify email',
          'Code applied, but the profile could not be updated',
          message
        );
        // The address is unchanged, so the session is not ended.
        expect(mockUserService.logout).not.toHaveBeenCalled();
        expect(mockUserStore.setIsEmailConfirmed).not.toHaveBeenCalled();
        expect(mockAnalytics.logEvent).toHaveBeenCalledWith('email_verified', {
          component: 'Account Action Component',
        });
      }
    );

    it('reports a reload failure that left the user signed in as a profile-update problem, not a bad link', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const auth: any = {
        authStateReady,
        currentUser: {
          email: 'a@example.com',
          emailVerified: true,
          reload: vi.fn().mockRejectedValue(new Error('offline')),
        },
      };

      await createComponent(auth, { mode: 'verifyEmail', oobCode: 'c' });

      expect(component.success()).toBe(true);
      expect(component.errorMessage()).toBe('');
      expect(mockUserService.updateUserEmailAndLinkMembers).not.toHaveBeenCalled();
      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Action Component',
        'verify email',
        'Code applied, but the profile could not be updated',
        'offline'
      );
    });
  });

  describe('applying the code fails', () => {
    async function failWith(error: unknown) {
      vi.spyOn(authModule, 'applyActionCode').mockRejectedValue(error);
      await createComponent(mockAuthWithUser, { mode: 'verifyEmail', oobCode: 'c' });
    }
    const lastSnackbarMessage = () =>
      mockSnackBar.openFromComponent.mock.calls.at(-1)![1].data.message;

    it.each([
      ['auth/invalid-action-code', 'Failed to verify email. The link is invalid or has expired.'],
      ['auth/expired-action-code', 'Failed to verify email. The link has expired.'],
      ['auth/user-disabled', 'Failed to verify email. This user account has been disabled.'],
      ['auth/user-not-found', 'Failed to verify email. No user found for this link.'],
      ['auth/weak-password', 'Failed to verify email. Password is too weak.'],
    ])('explains %s', async (code, message) => {
      await failWith(new FirebaseError(code, 'raw sdk text'));

      expect(component.errorMessage()).toBe(message);
      expect(lastSnackbarMessage()).toBe(message);
      expect(component.success()).toBe(false);
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="account-action-error-message"]'
        ).textContent
      ).toContain(message);
    });

    it('falls back to the SDK message for any other code', async () => {
      await failWith(new FirebaseError('auth/network-request-failed', 'Network down'));

      expect(component.errorMessage()).toBe('Failed to verify email. Network down');
    });

    it('does not log a FirebaseError (expected user-facing failures)', async () => {
      await failWith(new FirebaseError('auth/invalid-action-code', 'x'));

      expect(mockAnalytics.logError).not.toHaveBeenCalled();
    });

    it('logs anything that is not a FirebaseError with its message and code', async () => {
      await failWith(Object.assign(new Error('odd failure'), { code: 'weird' }));

      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Action Component',
        'verify email',
        'odd failure',
        'weird'
      );
      expect(component.errorMessage()).toBe('Failed to verify email. odd failure');
    });

    it('offers to resend the email to a signed-in user verifying their address, and nothing to a signed-out one', async () => {
      await failWith(new FirebaseError('auth/invalid-action-code', 'x'));
      expect(
        fixture.nativeElement.querySelector('[data-testid="account-action-resend-button"]')
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="account-action-back-account"]')
      ).not.toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="account-action-back-login"]')
      ).toBeNull();

      TestBed.resetTestingModule();
      vi.spyOn(authModule, 'applyActionCode').mockRejectedValue(
        new FirebaseError('auth/invalid-action-code', 'x')
      );
      await createComponent(mockAuthWithoutUser, { mode: 'verifyEmail', oobCode: 'c' });
      expect(
        fixture.nativeElement.querySelector('[data-testid="account-action-resend-button"]')
      ).toBeNull();
      expect(
        fixture.nativeElement.querySelector('[data-testid="account-action-back-login"]')
      ).not.toBeNull();
    });
  });

  describe('resetting the password through the form', () => {
    const fill = async (password: string, confirm: string) => {
      const set = (id: string, value: string) => {
        const input = fixture.nativeElement.querySelector(
          `[data-testid="${id}"]`
        ) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      };
      set('account-action-password-input', password);
      set('account-action-confirm-password-input', confirm);
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const submitButton = () =>
      fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;

    beforeEach(async () => {
      await createComponent(mockAuthWithoutUser, {
        mode: 'resetPassword',
        oobCode: 'reset-code',
      });
    });

    const leaveConfirmField = async () => {
      fixture.nativeElement
        .querySelector('[data-testid="account-action-confirm-password-input"]')
        .dispatchEvent(new Event('blur'));
      await fixture.whenStable();
      fixture.detectChanges();
    };

    it('keeps Reset disabled while the two passwords differ', async () => {
      await fill('newpassword123', 'different123');
      await leaveConfirmField();

      expect(submitButton().disabled).toBe(true);
    });

    it('holds a passwordMismatch error on the form while the passwords differ, and none once they match', async () => {
      const errors = () =>
        (component as any)
          .resetPasswordForm()
          .errors()
          .map((e: any) => [e.kind, e.message]);

      await fill('newpassword123', 'different123');
      expect(errors()).toEqual([
        ['passwordMismatch', 'Passwords do not match.'],
      ]);

      await fill('newpassword123', 'newpassword123');
      expect(errors()).toEqual([]);
    });

    // Regression for B17: the message sat in a <mat-error> inside the field,
    // but the mismatch error lives on the form root, so the field never
    // entered its error state and Material never rendered it. It now shows
    // below the field, as on the reset-password and register pages.
    it('shows "Passwords do not match." in the form once the confirm field is left', async () => {
      await fill('newpassword123', 'different123');
      await leaveConfirmField();

      expect(
        fixture.nativeElement.querySelector('.reset-password-form').textContent
      ).toContain('Passwords do not match.');
    });

    it('does not show the mismatch message once the passwords match', async () => {
      await fill('newpassword123', 'different123');
      await leaveConfirmField();
      await fill('newpassword123', 'newpassword123');

      expect(
        fixture.nativeElement.querySelector('.reset-password-form').textContent
      ).not.toContain('Passwords do not match.');
    });

    it('submits the form with the typed password and confirms in the UI', async () => {
      vi.spyOn(authModule, 'confirmPasswordReset').mockResolvedValue(undefined);
      await fill('newpassword123', 'newpassword123');
      expect(submitButton().disabled).toBe(false);

      fixture.nativeElement
        .querySelector('form')
        .dispatchEvent(new Event('submit', { cancelable: true }));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(authModule.confirmPasswordReset).toHaveBeenCalledWith(
        mockAuthWithoutUser,
        'reset-code',
        'newpassword123'
      );
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Password reset successfully' } }
      );
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith('password_reset_success', {
        component: 'Account Action Component',
      });
      expect(mockLoading.loadingOn).toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(
        fixture.nativeElement.querySelector(
          '[data-testid="account-action-success-message"]'
        ).textContent
      ).toContain('Your password has been reset successfully!');
    });

    it('shows the failure, stays on the form and clears the overlay when the reset is refused', async () => {
      vi.spyOn(authModule, 'confirmPasswordReset').mockRejectedValue(
        new FirebaseError('auth/weak-password', 'weak')
      );
      await fill('abc', 'abc');

      await component.resetPassword();
      fixture.detectChanges();

      expect(component.success()).toBe(false);
      expect(component.errorMessage()).toBe(
        'Failed to reset password. Password is too weak.'
      );
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Failed to reset password. Password is too weak.' } }
      );
      expect(mockLoading.loadingOff).toHaveBeenCalled();
      expect(mockAnalytics.logEvent).not.toHaveBeenCalledWith(
        'password_reset_success',
        expect.anything()
      );
    });

    it('toggles each password field between hidden and visible from its own button', async () => {
      const password = () =>
        fixture.nativeElement.querySelector(
          '[data-testid="account-action-password-input"]'
        ) as HTMLInputElement;
      const confirm = () =>
        fixture.nativeElement.querySelector(
          '[data-testid="account-action-confirm-password-input"]'
        ) as HTMLInputElement;
      const [toggleFirst, toggleSecond] = Array.from(
        fixture.nativeElement.querySelectorAll('button[matIconSuffix]')
      ) as HTMLButtonElement[];
      expect(password().type).toBe('password');
      expect(confirm().type).toBe('password');

      toggleFirst!.click();
      fixture.detectChanges();
      expect(password().type).toBe('text');
      expect(confirm().type).toBe('password');

      toggleSecond!.click();
      fixture.detectChanges();
      expect(confirm().type).toBe('text');

      toggleFirst!.click();
      toggleSecond!.click();
      fixture.detectChanges();
      expect(password().type).toBe('password');
      expect(confirm().type).toBe('password');
    });
  });

  describe('resending the verification email', () => {
    it('asks a signed-out visitor to sign in first and sends nothing', async () => {
      const send = vi.spyOn(authModule, 'sendEmailVerification');
      await createComponent(mockAuthWithoutUser, { mode: 'verifyEmail' });

      await component.resendVerificationEmail();

      expect(send).not.toHaveBeenCalled();
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        {
          data: {
            message: 'You must be logged in to resend the verification email',
          },
        }
      );
    });

    it('sends the link back to this page, confirms, and logs it', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const send = vi.spyOn(authModule, 'sendEmailVerification').mockResolvedValue(undefined);
      await createComponent(mockAuthWithUser, { mode: 'verifyEmail', oobCode: 'c' });
      mockSnackBar.openFromComponent.mockClear();

      await component.resendVerificationEmail();

      expect(send).toHaveBeenCalledWith(mockAuthWithUser.currentUser, {
        url: globalThis.location.origin + '/auth/account-action',
        handleCodeInApp: true,
      });
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Verification email sent! Please check your inbox' } }
      );
      expect(mockAnalytics.logEvent).toHaveBeenCalledWith('verification_email_resent', {
        component: 'Account Action Component',
      });
      expect(component.resending()).toBe(false);
    });

    it('shows the SDK reason without logging when Firebase refuses (e.g. too many requests)', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      vi.spyOn(authModule, 'sendEmailVerification').mockRejectedValue(
        new FirebaseError('auth/too-many-requests', 'Too many requests')
      );
      await createComponent(mockAuthWithUser, { mode: 'verifyEmail', oobCode: 'c' });
      mockSnackBar.openFromComponent.mockClear();

      await component.resendVerificationEmail();

      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Failed to send verification email: Too many requests' } }
      );
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(component.resending()).toBe(false);
    });

    it.each([
      ['an Error', new Error('socket closed'), 'socket closed'],
      ['an Error-like object', { message: 'socket closed' }, 'Unknown error'],
    ])('also logs a failure that is not from Firebase (%s)', async (_label, thrown, logged) => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      vi.spyOn(authModule, 'sendEmailVerification').mockRejectedValue(thrown);
      await createComponent(mockAuthWithUser, { mode: 'verifyEmail', oobCode: 'c' });
      mockSnackBar.openFromComponent.mockClear();

      await component.resendVerificationEmail();

      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Action Component',
        'resend_verification_email',
        'Failed to resend verification email',
        logged
      );
      expect(mockSnackBar.openFromComponent).toHaveBeenCalledWith(
        expect.anything(),
        { data: { message: 'Failed to send verification email: socket closed' } }
      );
      expect(component.resending()).toBe(false);
    });
  });

  describe('wording by action', () => {
    beforeEach(async () => {
      await createComponent(mockAuthWithoutUser, {});
    });

    it.each([
      ['verifyEmail', 'Email Verification'],
      ['verifyAndChangeEmail', 'Email Change'],
      ['resetPassword', 'Reset Password'],
      ['recoverEmail', 'Email Recovery'],
    ] as const)('titles %s as "%s"', (mode, title) => {
      component.mode.set(mode);
      expect(component.getTitle()).toBe(title);
    });

    it.each([
      ['verifyEmail', "You've successfully confirmed your email address!"],
      ['resetPassword', 'Your password has been reset successfully!'],
      ['recoverEmail', 'Your email address has been recovered successfully!'],
    ] as const)('says %s succeeded', (mode, message) => {
      component.mode.set(mode);
      expect(component.getSuccessMessage()).toBe(message);
    });

    it('uses a generic success message before any mode is known', () => {
      expect(component.getSuccessMessage()).toBe('Action completed successfully!');
    });

    it.each([
      ['verifyEmail', 'Verifying your email address...'],
      ['verifyAndChangeEmail', 'Confirming your new email address...'],
      ['recoverEmail', 'Recovering your email address...'],
      ['resetPassword', 'Processing...'],
    ] as const)('shows "%s" progress text', (mode, message) => {
      component.mode.set(mode);
      expect(component.getProcessingMessage()).toBe(message);
    });

    it('has no success hint for a password reset or before a mode is known', () => {
      component.mode.set('resetPassword');
      expect(component.getSuccessHint()).toBeNull();
      component.mode.set(null);
      expect(component.getSuccessHint()).toBeNull();
    });

    it('tells a signed-out visitor to log in, except after an email change (that message already says so)', () => {
      component.isUserLoggedIn.set(false);
      component.mode.set('verifyEmail');
      expect(component.getSuccessHint()).toBe('You can now log in to your account.');
      component.mode.set('recoverEmail');
      expect(component.getSuccessHint()).toBe('You can now log in to your account.');
      component.mode.set('verifyAndChangeEmail');
      expect(component.getSuccessHint()).toBeNull();
    });

    it('tells a signed-in user they can use the app', () => {
      component.isUserLoggedIn.set(true);
      component.mode.set('verifyEmail');
      expect(component.getSuccessHint()).toBe(
        'You can now access all features of the app.'
      );
      component.mode.set('recoverEmail');
      expect(component.getSuccessHint()).toBe(
        'You can now access all features of the app.'
      );
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
