import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { MemberService } from '@services/member.service';
import { UserService } from '@services/user.service';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockUserStore,
  mockUser,
} from '@testing/test-helpers';
import * as authModule from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountProfileComponent } from './account-profile.component';

describe('AccountProfileComponent', () => {
  let fixture: ComponentFixture<AccountProfileComponent>;
  let component: AccountProfileComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockLoadingService: ReturnType<typeof createMockLoadingService>;
  let mockAnalyticsService: ReturnType<typeof createMockAnalyticsService>;
  let mockSnackbar: { openFromComponent: ReturnType<typeof vi.fn> };
  let mockMemberService: { updateAllMemberEmails: ReturnType<typeof vi.fn> };

  const mockAuthWithUser = {
    currentUser: {
      email: 'test@example.com',
      emailVerified: false,
    },
  };

  async function createComponent(authValue = mockAuthWithUser): Promise<void> {
    mockUserStore = createMockUserStore();
    mockUserStore.user.set(mockUser());
    mockLoadingService = createMockLoadingService();
    mockAnalyticsService = createMockAnalyticsService();
    mockSnackbar = { openFromComponent: vi.fn() };
    mockMemberService = { updateAllMemberEmails: vi.fn().mockResolvedValue(0) };

    await TestBed.configureTestingModule({
      imports: [AccountProfileComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: authValue },
        { provide: UserStore, useValue: mockUserStore },
        { provide: UserService, useValue: {} },
        { provide: MemberService, useValue: mockMemberService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: MatSnackBar, useValue: mockSnackbar },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountProfileComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function setEmailValue(value: string): void {
    const input = fixture.nativeElement.querySelector(
      '[data-testid="account-email-input"]'
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  describe('Google user view', () => {
    beforeEach(async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(true);
      fixture.detectChanges();
    });

    it('should show google account note', () => {
      expect(
        fixture.debugElement.query(
          By.css('[data-testid="google-account-note"]')
        )
      ).toBeTruthy();
    });

    it('should not show email form', () => {
      expect(
        fixture.debugElement.query(By.css('[data-testid="email-form"]'))
      ).toBeNull();
    });

    it('should show delete account button', () => {
      expect(
        fixture.debugElement.query(
          By.css('[data-testid="delete-account-button"]')
        )
      ).toBeTruthy();
    });
  });

  describe('non-Google user, unconfirmed email', () => {
    beforeEach(async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(false);
      mockUserStore.isEmailConfirmed.set(false);
      fixture.detectChanges();
    });

    it('should not show google account note', () => {
      expect(
        fixture.debugElement.query(
          By.css('[data-testid="google-account-note"]')
        )
      ).toBeNull();
    });

    it('should show email form', () => {
      expect(
        fixture.debugElement.query(By.css('[data-testid="email-form"]'))
      ).toBeTruthy();
    });

    // a@b passed Angular's built-in email validator; the app now requires one
    // address with a dotted domain (utilities/email-validation.ts).
    it.each(['a@b', 'new@example.com,other@example.com'])(
      'should disable Update Email and show the email error for %s',
      async (email) => {
        setEmailValue(email);
        const input = fixture.nativeElement.querySelector(
          '[data-testid="account-email-input"]'
        ) as HTMLInputElement;
        input.dispatchEvent(new Event('blur'));
        await fixture.whenStable();
        fixture.detectChanges();

        const button = fixture.debugElement.query(
          By.css('[data-testid="update-email-button"]')
        ).nativeElement as HTMLButtonElement;
        expect(button.disabled).toBe(true);
        expect(
          fixture.nativeElement.querySelector(
            '[data-testid="account-email-error-0"]'
          )?.textContent
        ).toContain('Invalid email address');
      }
    );

    it('should enable Update Email for a new valid address', async () => {
      setEmailValue('new@example.com');
      await fixture.whenStable();
      fixture.detectChanges();

      const button = fixture.debugElement.query(
        By.css('[data-testid="update-email-button"]')
      ).nativeElement as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });

    it('should show enabled verify email button when email is not verified', () => {
      const btn = fixture.debugElement.query(
        By.css('[data-testid="verify-email-button"]')
      );
      expect(btn).toBeTruthy();
      expect(btn.nativeElement.disabled).toBe(false);
    });

    it('should not show sync member emails section', () => {
      expect(
        fixture.debugElement.query(By.css('[data-testid="sync-member-emails"]'))
      ).toBeNull();
    });

    it('should not show delete account button', () => {
      expect(
        fixture.debugElement.query(
          By.css('[data-testid="delete-account-button"]')
        )
      ).toBeNull();
    });
  });

  describe('non-Google user, confirmed email', () => {
    beforeEach(async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(false);
      mockUserStore.isEmailConfirmed.set(true);
      fixture.detectChanges();
    });

    it('should show sync member emails section', () => {
      expect(
        fixture.debugElement.query(By.css('[data-testid="sync-member-emails"]'))
      ).toBeTruthy();
    });

    it('should explain that Sync overwrites addresses set for a group (B20)', () => {
      const help = fixture.debugElement.query(
        By.css('[data-testid="sync-member-emails-help"]')
      );
      expect(help.nativeElement.textContent.replace(/\s+/g, ' ').trim()).toBe(
        'Sets the email on every group membership to your login email, including addresses you set for a particular group.'
      );
    });

    it('should show delete account button', () => {
      expect(
        fixture.debugElement.query(
          By.css('[data-testid="delete-account-button"]')
        )
      ).toBeTruthy();
    });
  });

  describe('verified email state', () => {
    it('should show disabled verify email button when email is already verified', async () => {
      await createComponent({
        currentUser: { email: 'test@example.com', emailVerified: true },
      });
      mockUserStore.isGoogleUser.set(false);
      mockUserStore.isEmailConfirmed.set(true);
      fixture.detectChanges();
      const btn = fixture.debugElement.query(
        By.css('[data-testid="verify-email-button"]')
      );
      expect(btn).toBeTruthy();
      expect(btn.nativeElement.disabled).toBe(true);
    });
  });

  describe('verifyEmail()', () => {
    beforeEach(async () => {
      await createComponent();
    });

    it('should call sendEmailVerification and show success snackbar', async () => {
      const spy = vi
        .spyOn(authModule, 'sendEmailVerification')
        .mockResolvedValue();
      await component.verifyEmail();
      await fixture.whenStable();
      expect(spy).toHaveBeenCalled();
      expect(mockSnackbar.openFromComponent).toHaveBeenCalled();
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toContain('verify');
    });

    it('should log analytics error and show error snackbar on failure', async () => {
      vi.spyOn(authModule, 'sendEmailVerification').mockRejectedValue(
        new Error('send failed')
      );
      await component.verifyEmail();
      await fixture.whenStable();
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Account Profile Component',
        'verify_email',
        'Failed to send verification email',
        expect.any(String)
      );
      expect(mockSnackbar.openFromComponent).toHaveBeenCalled();
    });
  });

  describe('onSubmitEmail()', () => {
    beforeEach(async () => {
      await createComponent();
      mockUserStore.isGoogleUser.set(false);
      fixture.detectChanges();
    });

    const snackbarMessage = () =>
      mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data?.message;
    const pendingNote = () =>
      fixture.nativeElement.querySelector(
        '[data-testid="pending-email-change"]'
      ) as HTMLElement | null;

    it('should not send a change link when email is unchanged', async () => {
      const spy = vi
        .spyOn(authModule, 'verifyBeforeUpdateEmail')
        .mockResolvedValue();
      setEmailValue('test@example.com');
      await fixture.whenStable();
      await component.onSubmitEmail();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should email a confirm link to the new address (verify before update) and say so', async () => {
      const spy = vi
        .spyOn(authModule, 'verifyBeforeUpdateEmail')
        .mockResolvedValue();
      setEmailValue('new@example.com');
      await fixture.whenStable();
      await component.onSubmitEmail();
      fixture.detectChanges();

      expect(spy).toHaveBeenCalledWith(
        mockAuthWithUser.currentUser,
        'new@example.com',
        {
          url: globalThis.location.origin + '/auth/account-action',
          handleCodeInApp: true,
        }
      );
      expect(snackbarMessage()).toBe(
        'Check new@example.com for a link to confirm your new email'
      );
      expect(pendingNote()?.textContent).toContain('new@example.com');
      expect(pendingNote()?.textContent).toContain('test@example.com');
      // The account keeps its current address (and verified status) until
      // the link is used.
      expect(mockUserStore.setIsEmailConfirmed).not.toHaveBeenCalled();
      const input = fixture.nativeElement.querySelector(
        '[data-testid="account-email-input"]'
      ) as HTMLInputElement;
      expect(input.value).toBe('test@example.com');
    });

    it('should not show the pending-change note before a change is requested', () => {
      expect(pendingNote()).toBeNull();
    });

    it('should show email-already-in-use message for that error code', async () => {
      const error = Object.assign(new Error('already in use'), {
        code: 'auth/email-already-in-use',
      });
      vi.spyOn(authModule, 'verifyBeforeUpdateEmail').mockRejectedValue(error);
      setEmailValue('taken@example.com');
      await fixture.whenStable();
      await component.onSubmitEmail();
      fixture.detectChanges();
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Account Profile Component',
        'update_email',
        'Failed to update email address',
        expect.any(String)
      );
      expect(snackbarMessage()).toBe(
        'This email address is already in use by another account'
      );
      expect(pendingNote()).toBeNull();
    });

    it('should ask the user to sign in again when Firebase requires a recent login', async () => {
      const error = Object.assign(new Error('stale'), {
        code: 'auth/requires-recent-login',
      });
      vi.spyOn(authModule, 'verifyBeforeUpdateEmail').mockRejectedValue(error);
      setEmailValue('new@example.com');
      await fixture.whenStable();
      await component.onSubmitEmail();
      expect(snackbarMessage()).toContain('sign out and sign back in');
    });

    it('should show generic error message for other errors', async () => {
      vi.spyOn(authModule, 'verifyBeforeUpdateEmail').mockRejectedValue(
        new Error('network error')
      );
      setEmailValue('new@example.com');
      await fixture.whenStable();
      await component.onSubmitEmail();
      expect(snackbarMessage()).toContain('could not be updated');
    });
  });

  describe('email field for an unverified account', () => {
    it('shows the sign-in address even though the profile email is still empty', async () => {
      await createComponent();
      mockUserStore.user.set(mockUser({ email: '' }));
      fixture.detectChanges();
      await fixture.whenStable();
      const input = fixture.nativeElement.querySelector(
        '[data-testid="account-email-input"]'
      ) as HTMLInputElement;
      expect(input.value).toBe('test@example.com');
    });
  });

  describe('syncMemberEmails()', () => {
    // M8: the address comes from a freshly refreshed ID token (only a
    // verified one), not the possibly stale profile email.
    let tokenClaims: Record<string, unknown>;
    const syncAuth = {
      currentUser: {
        email: 'test@example.com',
        emailVerified: true,
        getIdTokenResult: vi.fn(async () => ({ claims: tokenClaims })),
      },
    };

    beforeEach(async () => {
      tokenClaims = { email: 'token@example.com', email_verified: true };
      await createComponent(syncAuth as any);
    });

    it('should write the verified token email, not the profile email', async () => {
      await component.syncMemberEmails();
      expect(syncAuth.currentUser.getIdTokenResult).toHaveBeenCalledWith(true);
      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalledWith(
        mockUserStore.user()!.ref,
        'token@example.com'
      );
    });

    it('should skip, asking for verification, without a verified token email', async () => {
      tokenClaims = { email: 'token@example.com', email_verified: false };
      await component.syncMemberEmails();
      expect(mockMemberService.updateAllMemberEmails).not.toHaveBeenCalled();
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toBe('Verify your login email first.');
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });

    it('should call loadingOn and updateAllMemberEmails', async () => {
      await component.syncMemberEmails();
      expect(mockLoadingService.loadingOn).toHaveBeenCalled();
      expect(mockMemberService.updateAllMemberEmails).toHaveBeenCalled();
    });

    it('should show snackbar with count when records are updated', async () => {
      mockMemberService.updateAllMemberEmails.mockResolvedValue(3);
      await component.syncMemberEmails();
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toContain('3 member record');
    });

    it('should use plural form when count is greater than 1', async () => {
      mockMemberService.updateAllMemberEmails.mockResolvedValue(2);
      await component.syncMemberEmails();
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toContain('records');
    });

    it('should show no-update snackbar when count is 0', async () => {
      mockMemberService.updateAllMemberEmails.mockResolvedValue(0);
      await component.syncMemberEmails();
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toContain('No member records');
    });

    it('should log analytics error and show error snackbar on failure', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        new Error('sync failed')
      );
      await component.syncMemberEmails();
      expect(mockAnalyticsService.logError).toHaveBeenCalledWith(
        'Account Profile Component',
        'sync_member_emails',
        'Failed to sync member emails',
        expect.any(String)
      );
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toContain('could not update member emails');
    });

    it('should always call loadingOff even on error', async () => {
      mockMemberService.updateAllMemberEmails.mockRejectedValue(
        new Error('sync failed')
      );
      await component.syncMemberEmails();
      expect(mockLoadingService.loadingOff).toHaveBeenCalled();
    });
  });
});
