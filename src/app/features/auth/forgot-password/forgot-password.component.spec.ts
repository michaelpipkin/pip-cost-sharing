import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter, Router } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockSnackBar,
} from '@testing/test-helpers';
import * as authModule from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordComponent } from './forgot-password.component';

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let component: ForgotPasswordComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: {} },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  describe('initial render', () => {
    it('should render forgot password title', () => {
      expect(query('forgot-password-title')?.textContent?.trim()).toBe(
        'Forgot Password'
      );
    });

    it('should render instruction text', () => {
      expect(query('forgot-password-instructions')).toBeTruthy();
    });

    it('should render email field', () => {
      expect(query('forgot-email-input')).toBeTruthy();
    });

    it('should render submit button', () => {
      expect(query('forgot-password-submit')).toBeTruthy();
    });

    it('should render return to login link', () => {
      expect(query('return-to-login-link')).toBeTruthy();
    });
  });

  describe('form validation and button state', () => {
    it('should disable submit when form is pristine', () => {
      const submitBtn = query('forgot-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('should disable submit when email is invalid', async () => {
      const input = query('forgot-email-input') as HTMLInputElement;
      input.value = 'notanemail';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      const submitBtn = query('forgot-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('should enable submit when valid email is entered', async () => {
      const input = query('forgot-email-input') as HTMLInputElement;
      input.value = 'test@example.com';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();

      const submitBtn = query('forgot-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(false);
    });
  });

  describe('double-submit guard', () => {
    beforeEach(async () => {
      vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const input = query('forgot-email-input') as HTMLInputElement;
      input.value = 'test@example.com';
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    });

    it('should not fire sendPasswordResetEmail twice when called rapidly', async () => {
      const sendSpy = vi
        .spyOn(authModule, 'sendPasswordResetEmail')
        .mockResolvedValue(undefined);
      sendSpy.mockClear();

      const first = component.forgotPassword();
      const second = component.forgotPassword();
      await Promise.all([first, second]);

      expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it('should allow a fresh call after the previous one finishes', async () => {
      const sendSpy = vi
        .spyOn(authModule, 'sendPasswordResetEmail')
        .mockResolvedValue(undefined);
      sendSpy.mockClear();

      await component.forgotPassword();
      await component.forgotPassword();

      expect(sendSpy).toHaveBeenCalledTimes(2);
    });
  });
});
