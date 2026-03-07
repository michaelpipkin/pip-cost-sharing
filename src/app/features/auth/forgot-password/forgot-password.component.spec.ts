import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { getAuth } from 'firebase/auth';
import { ForgotPasswordComponent } from './forgot-password.component';
import { LoadingService } from '@shared/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import {
  createMockLoadingService,
  createMockAnalyticsService,
  createMockSnackBar,
} from '@testing/test-helpers';

describe('ForgotPasswordComponent', () => {
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let component: ForgotPasswordComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideNoopAnimations(),
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
      component.forgotPasswordForm.controls.email.setValue('notanemail');
      component.forgotPasswordForm.controls.email.markAsTouched();
      component.forgotPasswordForm.controls.email.markAsDirty();
      await fixture.whenStable();

      const submitBtn = query('forgot-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('should enable submit when valid email is entered', async () => {
      component.forgotPasswordForm.controls.email.setValue('test@example.com');
      component.forgotPasswordForm.controls.email.markAsTouched();
      component.forgotPasswordForm.controls.email.markAsDirty();
      await fixture.whenStable();

      const submitBtn = query('forgot-password-submit') as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(false);
    });
  });
});
