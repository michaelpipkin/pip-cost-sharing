import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideRouter } from '@angular/router';
import { LoadingService } from '@components/loading/loading.service';
import { AnalyticsService } from '@services/analytics.service';
import { PwaDetectionService } from '@services/pwa-detection.service';
import {
  createMockAnalyticsService,
  createMockLoadingService,
  createMockPwaDetectionService,
  createMockSnackBar,
} from '@testing/test-helpers';
import * as authModule from 'firebase/auth';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterComponent } from './register.component';

// Mock hcaptcha global before tests run
const mockHcaptcha = {
  render: vi.fn(() => 'widget-id-123'),
  reset: vi.fn(),
};
(window as any).hcaptcha = mockHcaptcha;

describe('RegisterComponent', () => {
  let fixture: ComponentFixture<RegisterComponent>;
  let component: RegisterComponent;
  let el: HTMLElement;
  let mockPwaDetection: ReturnType<typeof createMockPwaDetectionService>;

  beforeEach(async () => {
    mockPwaDetection = createMockPwaDetectionService();

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: getAuth, useValue: {} },
        { provide: getFunctions, useValue: {} },
        { provide: MatSnackBar, useValue: createMockSnackBar() },
        { provide: LoadingService, useValue: createMockLoadingService() },
        { provide: PwaDetectionService, useValue: mockPwaDetection },
        { provide: AnalyticsService, useValue: createMockAnalyticsService() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function query(testId: string): HTMLElement | null {
    return el.querySelector(`[data-testid="${testId}"]`);
  }

  function setInputValue(testId: string, value: string): void {
    const input = el.querySelector(
      `[data-testid="${testId}"]`
    ) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial render', () => {
    it('should display the create account title', () => {
      expect(query('register-title')?.textContent?.trim()).toBe(
        'Create Account'
      );
    });

    it('should render the email input', () => {
      expect(query('register-email-input')).toBeTruthy();
    });

    it('should render the registration form', () => {
      expect(query('register-form')).toBeTruthy();
    });
  });

  describe('form validation', () => {
    it('should show email required error when email is empty and blurred', async () => {
      setInputValue('register-email-input', '');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('register-email-error-0')).toBeTruthy();
    });

    it('should show email format error for invalid email', async () => {
      setInputValue('register-email-input', 'notanemail');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('register-email-error-0')).toBeTruthy();
    });

    it('should not show email errors for valid email', async () => {
      setInputValue('register-email-input', 'test@example.com');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('register-email-error-0')).toBeNull();
    });

    it('should show password mismatch error when passwords differ', async () => {
      setInputValue('register-password-input', 'password123');
      setInputValue('register-confirm-password-input', 'differentpassword');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('register-password-mismatch-error')).toBeTruthy();
    });

    it('should not show mismatch error when passwords match', async () => {
      setInputValue('register-password-input', 'password123');
      setInputValue('register-confirm-password-input', 'password123');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(query('register-password-mismatch-error')).toBeNull();
    });
  });

  describe('password visibility toggles', () => {
    it('should toggle hidePassword', () => {
      expect(component.hidePassword()).toBe(true);
      component.toggleHidePassword();
      expect(component.hidePassword()).toBe(false);
    });

    it('should toggle hideConfirmPassword', () => {
      expect(component.hideConfirmPassword()).toBe(true);
      component.toggleHideConfirmPassword();
      expect(component.hideConfirmPassword()).toBe(false);
    });
  });

  describe('platform detection', () => {
    it('should show app-download section when running in browser', () => {
      expect(query('app-download')).toBeTruthy();
    });

    it('should delegate isRunningInBrowser to PwaDetectionService', () => {
      expect(component.isRunningInBrowser()).toBe(true);
      expect(mockPwaDetection.isRunningInBrowser).toHaveBeenCalled();
    });

    it('should delegate isRunningAsApp to PwaDetectionService', () => {
      expect(component.isRunningAsApp()).toBe(false);
      expect(mockPwaDetection.isRunningAsApp).toHaveBeenCalled();
    });
  });

  describe('passedCaptcha signal', () => {
    it('should start as true when running with emulators (captcha bypassed)', () => {
      expect(component.passedCaptcha()).toBe(true);
    });
  });

  describe('post-registration confirmation card', () => {
    beforeEach(async () => {
      component.registrationComplete.set(true);
      component.registeredEmail.set('test@example.com');
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('should show the confirmation card and hide the form', () => {
      expect(query('register-confirmation-card')).toBeTruthy();
      expect(query('register-form')).toBeNull();
    });

    it('should display the registered email address', () => {
      const card = query('register-confirmation-card');
      expect(card?.textContent).toContain('test@example.com');
    });

    it('should mention the spam/junk folder', () => {
      const card = query('register-confirmation-card');
      expect(card?.textContent?.toLowerCase()).toContain('spam');
    });

    it('should show the resend button', () => {
      expect(query('register-resend-button')).toBeTruthy();
    });

    it('should disable the resend button while cooldown is active', async () => {
      component.resendCooldown.set(30);
      await fixture.whenStable();
      fixture.detectChanges();
      const button = query('register-resend-button') as HTMLButtonElement;
      expect(button?.disabled).toBe(true);
    });

    it('should enable the resend button when cooldown reaches zero', async () => {
      component.resendCooldown.set(0);
      await fixture.whenStable();
      fixture.detectChanges();
      const button = query('register-resend-button') as HTMLButtonElement;
      expect(button?.disabled).toBe(false);
    });

    it('should show the countdown in the resend button label while cooldown is active', async () => {
      component.resendCooldown.set(45);
      await fixture.whenStable();
      fixture.detectChanges();
      const button = query('register-resend-button');
      expect(button?.textContent).toContain('45s');
    });
  });

  describe('resendVerificationEmail', () => {
    it('should call sendEmailVerification and restart the cooldown', async () => {
      const sendSpy = vi
        .spyOn(authModule, 'sendEmailVerification')
        .mockResolvedValue(undefined);
      (component as any).auth = { currentUser: { uid: 'u1' } };
      component.resendCooldown.set(0);

      await component.resendVerificationEmail();

      expect(sendSpy).toHaveBeenCalled();
      expect(component.resendCooldown()).toBe(60);
    });

    it('should not call sendEmailVerification while cooldown is active', async () => {
      const sendSpy = vi.spyOn(authModule, 'sendEmailVerification');
      component.resendCooldown.set(15);

      await component.resendVerificationEmail();

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should not call sendEmailVerification when no auth user', async () => {
      const sendSpy = vi.spyOn(authModule, 'sendEmailVerification');
      (component as any).auth = { currentUser: null };
      component.resendCooldown.set(0);

      await component.resendVerificationEmail();

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });
});
