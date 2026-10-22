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

  async function createComponent(
    authValue: any,
    queryParams: Record<string, string>
  ) {
    mockSnackBar = createMockSnackBar();
    mockUserStore = createMockUserStore();
    mockUserService = {
      updateUserEmailAndLinkMembers: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
    };

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

    it('still succeeds when the change ends the session, and points to login', async () => {
      vi.spyOn(authModule, 'applyActionCode').mockResolvedValue(undefined);
      const auth: any = signedInChanging();
      // The SDK signs out (user-token-expired) before reload() rejects.
      auth.currentUser.reload = vi.fn(async () => {
        auth.currentUser = null;
        throw Object.assign(new Error('expired'), {
          code: 'auth/user-token-expired',
        });
      });

      await createComponent(auth, changeParams);

      expect(mockUserService.updateUserEmailAndLinkMembers).not.toHaveBeenCalled();
      expect(component.success()).toBe(true);
      expect(component.isUserLoggedIn()).toBe(false);
      expect(text('account-action-success-hint')).toBe(
        'You can now log in with your new email address.'
      );
      expect(text('account-action-continue-login')).toBe('Continue to Login');
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
