import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { UserStore } from '@store/user.store';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockUserStore,
} from '@testing/test-helpers';
import * as authModule from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountSecurityComponent } from './account-security.component';

describe('AccountSecurityComponent', () => {
  let fixture: ComponentFixture<AccountSecurityComponent>;
  let component: AccountSecurityComponent;
  let mockUserStore: ReturnType<typeof createMockUserStore>;
  let mockLoading: ReturnType<typeof createMockLoadingService>;
  let mockAnalytics: ReturnType<typeof createMockAnalyticsService>;
  let mockSnackbar: { openFromComponent: ReturnType<typeof vi.fn> };
  let router: Router;
  const firebaseUser = { email: 'test@example.com', uid: 'u1' };

  async function createComponent(isGoogleUser = false): Promise<void> {
    mockUserStore = createMockUserStore();
    mockUserStore.isGoogleUser.set(isGoogleUser);
    mockLoading = createMockLoadingService();
    mockAnalytics = createMockAnalyticsService();
    mockSnackbar = { openFromComponent: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [AccountSecurityComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: { currentUser: firebaseUser } },
        { provide: UserStore, useValue: mockUserStore },
        { provide: LoadingService, useValue: mockLoading },
        { provide: AnalyticsService, useValue: mockAnalytics },
        { provide: MatSnackBar, useValue: mockSnackbar },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(AccountSecurityComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function el(testId: string): HTMLElement {
    return fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`
    ) as HTMLElement;
  }

  function type(testId: string, value: string): void {
    const input = el(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function changeButton(): HTMLButtonElement {
    return el('change-password-button') as HTMLButtonElement;
  }

  function messages(): string[] {
    return mockSnackbar.openFromComponent.mock.calls.map(
      (c) => c[1].data.message
    );
  }

  const flush = () => new Promise<void>((r) => setTimeout(r));

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  describe('Google user', () => {
    it('should navigate to Profile and show the managed-by-Google note', async () => {
      await createComponent(true);
      expect(router.navigate).toHaveBeenCalledWith(['/auth/account/profile']);
      expect(el('google-security-note')).not.toBeNull();
      expect(el('new-password-input')).toBeNull();
    });
  });

  describe('password user', () => {
    it('should not navigate away and should show the form', async () => {
      await createComponent(false);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(el('new-password-input')).not.toBeNull();
      expect(el('google-security-note')).toBeNull();
    });

    it('should report passwordMismatch and keep Change Password disabled when the passwords differ', async () => {
      await createComponent();
      type('new-password-input', 'newpw');
      type('confirm-password-input', 'other');

      const errors = (component as any).passwordForm().errors();
      expect(errors.map((e: any) => e.kind)).toContain('passwordMismatch');
      expect(changeButton().disabled).toBe(true);
    });

    it('should enable Change Password once the passwords match', async () => {
      await createComponent();
      type('new-password-input', 'newpw');
      type('confirm-password-input', 'newpw');

      expect((component as any).passwordForm().errors()).toEqual([]);
      expect(changeButton().disabled).toBe(false);
    });

    it('should keep Change Password disabled while the confirmation is empty', async () => {
      await createComponent();
      type('new-password-input', 'newpw');
      expect(changeButton().disabled).toBe(true);
    });

    it('should show "Password cannot be empty" and make no call for an empty password', async () => {
      await createComponent();
      const update = vi.spyOn(authModule, 'updatePassword');

      component.onSubmitPassword();
      await flush();

      expect(messages()).toEqual(['Password cannot be empty']);
      expect(update).not.toHaveBeenCalled();
    });

    it('should call updatePassword with the user and new password, show the snackbar and reset the form', async () => {
      await createComponent();
      const update = vi
        .spyOn(authModule, 'updatePassword')
        .mockResolvedValue(undefined);
      type('new-password-input', 'newpw');
      type('confirm-password-input', 'newpw');

      changeButton().click();
      await flush();
      fixture.detectChanges();

      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(firebaseUser, 'newpw');
      expect(messages()).toEqual(['Your password has been updated']);
      expect((component as any).passwordModel()).toEqual({
        password: '',
        confirmPassword: '',
      });
      expect((el('new-password-input') as HTMLInputElement).value).toBe('');
      expect((el('confirm-password-input') as HTMLInputElement).value).toBe('');
    });

    it('should show the failure snackbar and keep the form when updatePassword rejects', async () => {
      await createComponent();
      vi.spyOn(authModule, 'updatePassword').mockRejectedValue(
        new Error('auth/requires-recent-login')
      );
      type('new-password-input', 'newpw');
      type('confirm-password-input', 'newpw');

      changeButton().click();
      await flush();
      fixture.detectChanges();

      expect(messages()).toEqual([
        'Something went wrong - your password could not be updated',
      ]);
      expect((component as any).passwordModel()).toEqual({
        password: 'newpw',
        confirmPassword: 'newpw',
      });
      expect((el('new-password-input') as HTMLInputElement).value).toBe(
        'newpw'
      );
    });

    // Regression for B3: updatePassword() is awaited, so loadingOff() waits for it.
    it('should call loadingOff only after updatePassword settles', async () => {
      await createComponent();
      let resolveUpdate!: () => void;
      vi.spyOn(authModule, 'updatePassword').mockReturnValue(
        new Promise<void>((resolve) => (resolveUpdate = resolve))
      );
      type('new-password-input', 'newpw');
      type('confirm-password-input', 'newpw');

      const done: unknown = component.onSubmitPassword();
      expect(mockLoading.loadingOn).toHaveBeenCalledTimes(1);
      expect(mockLoading.loadingOff).not.toHaveBeenCalled();

      resolveUpdate();
      await done;
      await flush();
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
    });

    // Regression for B3: an unexpected (non-Firebase) updatePassword() rejection reaches analytics.logError.
    it('should log an unexpected updatePassword rejection through analytics.logError', async () => {
      await createComponent();
      vi.spyOn(authModule, 'updatePassword').mockRejectedValue(
        new Error('auth/requires-recent-login')
      );
      type('new-password-input', 'newpw');
      type('confirm-password-input', 'newpw');

      const done: unknown = component.onSubmitPassword();
      await done;
      await flush();

      expect(mockAnalytics.logError).toHaveBeenCalledWith(
        'Account Security Component',
        'update_password',
        'auth/requires-recent-login'
      );
    });

    it('should explain requires-recent-login without logging it, and keep the form', async () => {
      await createComponent();
      vi.spyOn(authModule, 'updatePassword').mockRejectedValue(
        new FirebaseError(
          'auth/requires-recent-login',
          'Firebase: Error (auth/requires-recent-login).'
        )
      );
      type('new-password-input', 'newpw');
      type('confirm-password-input', 'newpw');

      await component.onSubmitPassword();

      expect(messages()).toEqual([
        'For security, please sign out and sign in again, then change your password.',
      ]);
      expect(mockAnalytics.logError).not.toHaveBeenCalled();
      expect(mockLoading.loadingOff).toHaveBeenCalledTimes(1);
      expect((component as any).passwordModel().password).toBe('newpw');
    });
  });
});
