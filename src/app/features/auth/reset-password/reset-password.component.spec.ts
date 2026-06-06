import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
} from '@testing/test-helpers';
import * as authModule from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordComponent } from './reset-password.component';

describe('ResetPasswordComponent', () => {
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let component: ResetPasswordComponent;
  let el: HTMLElement;

  const mockRoute = {
    snapshot: {
      queryParams: { oobCode: 'valid-oob-code' },
    },
  };

  beforeEach(async () => {
    vi.spyOn(authModule, 'confirmPasswordReset').mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: {} },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  function setInputValue(testId: string, value: string): void {
    const input = query(testId) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial render', () => {
    it('should display the title', () => {
      expect(query('reset-password-title')?.textContent?.trim()).toBe(
        'Reset Password'
      );
    });

    it('should render password and confirm password inputs', () => {
      expect(query('new-password-input')).toBeTruthy();
      expect(query('confirm-password-input')).toBeTruthy();
    });

    it('should render submit and return-to-login buttons', () => {
      expect(query('reset-password-submit')).toBeTruthy();
      expect(query('return-to-login-link')).toBeTruthy();
    });
  });

  describe('password visibility toggles', () => {
    it('should start with password hidden', () => {
      const input = query('new-password-input') as HTMLInputElement;
      expect(input.type).toBe('password');
    });

    it('should toggle password visibility', async () => {
      component.toggleHidePassword();
      await fixture.whenStable();

      const input = query('new-password-input') as HTMLInputElement;
      expect(input.type).toBe('text');
    });

    it('should start with confirm password hidden', () => {
      const input = query('confirm-password-input') as HTMLInputElement;
      expect(input.type).toBe('password');
    });

    it('should toggle confirm password visibility', async () => {
      component.toggleHideConfirmPassword();
      await fixture.whenStable();

      const input = query('confirm-password-input') as HTMLInputElement;
      expect(input.type).toBe('text');
    });
  });

  describe('form validation', () => {
    it('should disable submit when form is empty', () => {
      const submitBtn = query('reset-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('should disable submit when passwords do not match', async () => {
      setInputValue('new-password-input', 'password123');
      setInputValue('confirm-password-input', 'differentPassword');
      await fixture.whenStable();

      const submitBtn = query('reset-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('should enable submit when passwords match and form is dirty', async () => {
      setInputValue('new-password-input', 'password123');
      setInputValue('confirm-password-input', 'password123');
      await fixture.whenStable();

      const submitBtn = query('reset-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(false);
    });

    it('should show mismatch error when passwords do not match and confirmPassword is touched', async () => {
      setInputValue('new-password-input', 'password123');
      const confirmInput = query('confirm-password-input') as HTMLInputElement;
      confirmInput.value = 'different';
      confirmInput.dispatchEvent(new Event('input'));
      confirmInput.dispatchEvent(new Event('blur'));
      await fixture.whenStable();

      expect(query('password-mismatch-error')).toBeTruthy();
    });
  });

  describe('resetPassword', () => {
    it('should call confirmPasswordReset with auth, oobCode, and password', async () => {
      const router = TestBed.inject(Router);
      vi.spyOn(router, 'navigate').mockResolvedValue(true);

      setInputValue('new-password-input', 'newpassword');
      setInputValue('confirm-password-input', 'newpassword');
      await fixture.whenStable();

      await component.resetPassword();

      expect(authModule.confirmPasswordReset).toHaveBeenCalledWith(
        {},
        'valid-oob-code',
        'newpassword'
      );
    });
  });

  describe('oobCode signal', () => {
    it('should read oobCode from route query params', () => {
      expect(component.oobCode()).toBe('valid-oob-code');
    });
  });
});
