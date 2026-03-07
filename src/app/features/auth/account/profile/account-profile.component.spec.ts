import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
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
        provideNoopAnimations(),
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
      expect(mockAnalyticsService.logEvent).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ action: 'verify_email' })
      );
      expect(mockSnackbar.openFromComponent).toHaveBeenCalled();
    });
  });

  describe('onSubmitEmail()', () => {
    beforeEach(async () => {
      await createComponent();
    });

    it('should not call updateEmail when email is unchanged', async () => {
      const spy = vi.spyOn(authModule, 'updateEmail').mockResolvedValue();
      component.emailForm.setValue({ email: 'test@example.com' });
      await component.onSubmitEmail();
      expect(spy).not.toHaveBeenCalled();
    });

    it('should call updateEmail when email changes', async () => {
      const updateSpy = vi.spyOn(authModule, 'updateEmail').mockResolvedValue();
      vi.spyOn(authModule, 'sendEmailVerification').mockResolvedValue();
      component.emailForm.setValue({ email: 'new@example.com' });
      await component.onSubmitEmail();
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should show email-already-in-use message for that error code', async () => {
      const error = Object.assign(new Error('already in use'), {
        code: 'auth/email-already-in-use',
      });
      vi.spyOn(authModule, 'updateEmail').mockRejectedValue(error);
      component.emailForm.setValue({ email: 'taken@example.com' });
      await component.onSubmitEmail();
      expect(mockAnalyticsService.logEvent).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ action: 'update_email' })
      );
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toContain('already in use');
    });

    it('should show generic error message for other errors', async () => {
      vi.spyOn(authModule, 'updateEmail').mockRejectedValue(
        new Error('network error')
      );
      component.emailForm.setValue({ email: 'new@example.com' });
      await component.onSubmitEmail();
      const data = mockSnackbar.openFromComponent.mock.calls[0]?.[1]?.data;
      expect(data?.message).toContain('could not be updated');
    });

    it('should re-enable the form after submission', async () => {
      vi.spyOn(authModule, 'updateEmail').mockResolvedValue();
      vi.spyOn(authModule, 'sendEmailVerification').mockResolvedValue();
      component.emailForm.setValue({ email: 'new@example.com' });
      await component.onSubmitEmail();
      expect(component.emailForm.enabled).toBe(true);
    });
  });

  describe('syncMemberEmails()', () => {
    beforeEach(async () => {
      await createComponent();
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
      expect(mockAnalyticsService.logEvent).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({ action: 'sync_member_emails' })
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
